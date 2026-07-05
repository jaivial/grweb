using Stripe;
using GrCup.Api.Services;
using GrCup.Api.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace GrCup.Api.Endpoints;

public static class WebhookEndpoints
{
    public static void MapWebhookEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/webhooks/stripe - Handle Stripe webhooks
        app.MapPost("/api/webhooks/stripe", async (
            HttpRequest request,
            StripeService stripeService,
            ParticipantService participantService,
            InscripcionService inscripcionService,
            CompeticionService competicionService,
            EmailService emailService,
            IHubContext<ParticipantsHub> hubContext,
            ILogger<Program> logger) =>
        {
            string json;
            using (var reader = new StreamReader(request.Body))
            {
                json = await reader.ReadToEndAsync();
            }

            var signature = request.Headers["Stripe-Signature"].ToString();

            try
            {
                var competicionIdHint = StripeService.ExtractCompeticionIdFromRawEvent(json);
                var stripeEvent = await stripeService.ConstructEventAsync(json, signature, competicionIdHint);

                if (stripeEvent.Type == "checkout.session.completed")
                {
                    var session = stripeEvent.Data.Object as Stripe.Checkout.Session;

                    if (session == null)
                    {
                        logger.LogWarning("Session is null in webhook");
                        return Results.BadRequest();
                    }

                    if (session.Metadata != null && session.Metadata.TryGetValue("type", out var type) && (type == "fer_inscripcion" || type == "fer_inscripcion_deferred"))
                    {
                        if (type == "fer_inscripcion_deferred")
                        {
                            if (!session.Metadata.TryGetValue("competicion_id", out var deferredCompeticionIdRaw) ||
                                !int.TryParse(deferredCompeticionIdRaw, out var deferredCompeticionId))
                            {
                                logger.LogWarning("Invalid deferred FER inscription metadata in Stripe session {SessionId}", session.Id);
                                return Results.BadRequest();
                            }

                            try
                            {
                                var (inscripcion, alreadyPaid) = await inscripcionService.CreateFromStripeMetadataAsync(
                                    deferredCompeticionId, session.Metadata, session.Id);

                                if (alreadyPaid)
                                {
                                    logger.LogInformation("Deferred FER inscription {InscripcionId} already confirmed, skipping session {SessionId}", inscripcion.Id, session.Id);
                                    return Results.Ok();
                                }

                                var competicion = await competicionService.GetByIdAsync(deferredCompeticionId);
                                if (competicion != null && CompeticionHelper.IsFerCompetition(competicion.Tipo))
                                {
                                    var eventConfig = competicionService.GetEventoConfig(competicion);
                                    byte[]? qrCodeImage = null;
                                    string? qrImageUrl = inscripcion.QrImageUrl;
                                    var qrPayload = inscripcionService.GenerateQrCodePayload(competicion.Id, inscripcion.Id, competicion.QrSecret);
                                    var qrResult = await inscripcionService.GenerateQrImageAsync(qrPayload, competicion.Id, inscripcion.Id);
                                    if (qrResult.HasValue)
                                    {
                                        qrCodeImage = qrResult.Value.Bytes;
                                        qrImageUrl = qrResult.Value.Url;
                                    }

                                    await emailService.SendFerConfirmationAsync(inscripcion, competicion, eventConfig, qrCodeImage, inscripcion.QrCode, qrImageUrl: qrImageUrl);
                                    await emailService.SendFerAdminNotificationAsync(inscripcion, competicion);
                                }

                                logger.LogInformation("Created FER inscription {InscripcionId} from deferred Stripe session {SessionId}", inscripcion.Id, session.Id);
                            }
                            catch (Exception ex)
                            {
                                logger.LogError(ex, "Failed to create deferred FER inscription from Stripe session {SessionId}", session.Id);
                                return Results.StatusCode(500);
                            }

                            return Results.Ok();
                        }

                        if (!session.Metadata.TryGetValue("competicion_id", out var competicionIdRaw) ||
                            !int.TryParse(competicionIdRaw, out var ferCompeticionId) ||
                            !session.Metadata.TryGetValue("inscripcion_id", out var inscripcionIdRaw) ||
                            !int.TryParse(inscripcionIdRaw, out var inscripcionId))
                        {
                            logger.LogWarning("Invalid FER inscription metadata in Stripe session {SessionId}", session.Id);
                            return Results.BadRequest();
                        }

                        var existingInscripcion = await inscripcionService.GetByIdAsync(inscripcionId);
                        if (existingInscripcion == null || existingInscripcion.CompeticionId != ferCompeticionId)
                        {
                            logger.LogWarning("FER inscription {InscripcionId} not found for Stripe session {SessionId}", inscripcionId, session.Id);
                            return Results.Ok();
                        }

                        if (existingInscripcion.PagoConfirmado)
                        {
                            logger.LogInformation("FER inscription {InscripcionId} already paid, skipping Stripe session {SessionId}", inscripcionId, session.Id);
                            return Results.Ok();
                        }

                        var previousPaymentMethod = existingInscripcion.PaymentMethod;
                        var inscripcion2 = await inscripcionService.ConfirmStripePaymentAsync(ferCompeticionId, inscripcionId, session.Id);
                        var competicion2 = await competicionService.GetByIdAsync(ferCompeticionId);

                        if (inscripcion2 != null && competicion2 != null && CompeticionHelper.IsFerCompetition(competicion2.Tipo))
                        {
                            var config = competicionService.GetEventoConfig(competicion2);
                            if (string.Equals(previousPaymentMethod, InscripcionService.PaymentMethodEfectivo, StringComparison.OrdinalIgnoreCase))
                            {
                                await emailService.SendFerPaymentConfirmationAsync(inscripcion2, competicion2);
                            }
                            else
                            {
                                byte[]? qrCodeImage = null;
                                string? qrImageUrl = inscripcion2.QrImageUrl;
                                var qrPayload = inscripcionService.GenerateQrCodePayload(competicion2.Id, inscripcion2.Id, competicion2.QrSecret);
                                var qrResult = await inscripcionService.GenerateQrImageAsync(qrPayload, competicion2.Id, inscripcion2.Id);
                                if (qrResult.HasValue)
                                {
                                    qrCodeImage = qrResult.Value.Bytes;
                                    qrImageUrl = qrResult.Value.Url;
                                }

                                await emailService.SendFerConfirmationAsync(inscripcion2, competicion2, config, qrCodeImage, inscripcion2.QrCode, qrImageUrl: qrImageUrl);
                                await emailService.SendFerAdminNotificationAsync(inscripcion2, competicion2);
                            }
                        }

                        logger.LogInformation("Processed FER Stripe payment for inscription {InscripcionId}, session {SessionId}", inscripcionId, session.Id);
                        return Results.Ok();
                    }

                    // Idempotency: skip if this session was already processed
                    if (!string.IsNullOrEmpty(session.Id) &&
                        await participantService.IsSessionProcessedAsync(session.Id))
                    {
                        logger.LogInformation("Session {SessionId} already processed, skipping", session.Id);
                        return Results.Ok();
                    }

                    // Extract participant data from metadata
                    var (firstName, surname, email, instagram, ticketCount, phone, competicionId) =
                        stripeService.ExtractMetadata(session);

                    var totalPaid = stripeService.CalculateTotalPaid(session);
                    var price = totalPaid / ticketCount; // Price per ticket

                    // Create or update participant
                    var participant = await participantService.CreateOrUpdateAsync(
                        firstName,
                        surname,
                        email,
                        instagram,
                        ticketCount,
                        totalPaid,
                        phone,
                        price,
                        true,
                        "stripe",
                        session.Id
                    );

                    logger.LogInformation(
                        "Processed payment for {Email}: {TicketCount} tickets, {TotalPaid}€ (competicionId: {CompeticionId})",
                        email, ticketCount, totalPaid, competicionId
                    );

                    // Send raffle confirmation email (non-blocking)
                    try
                    {
                        await emailService.SendRaffleConfirmationAsync(
                            email,
                            firstName,
                            surname,
                            ticketCount,
                            totalPaid,
                            instagram,
                            competicionId);
                    }
                    catch (Exception emailEx)
                    {
                        logger.LogError(emailEx, "Failed to send raffle confirmation email to {Email}", email);
                    }

                    // Broadcast updated count to all connected clients
                    var count = await participantService.GetCountAsync();
                    await hubContext.BroadcastParticipantCountAsync(count);
                }

                return Results.Ok();
            }
            catch (StripeException ex)
            {
                logger.LogError(ex, "Stripe webhook error");
                return Results.BadRequest();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Webhook processing error");
                return Results.StatusCode(500);
            }
        });
    }
}
