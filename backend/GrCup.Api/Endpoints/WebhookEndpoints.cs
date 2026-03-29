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
                var stripeEvent = stripeService.ConstructEvent(json, signature);

                if (stripeEvent.Type == "checkout.session.completed")
                {
                    var session = stripeEvent.Data.Object as Stripe.Checkout.Session;
                    
                    if (session == null)
                    {
                        logger.LogWarning("Session is null in webhook");
                        return Results.BadRequest();
                    }

                    // Extract participant data from metadata
                    var (firstName, surname, email, instagram, ticketCount) = 
                        stripeService.ExtractMetadata(session);
                    
                    var totalPaid = stripeService.CalculateTotalPaid(session);

                    // Create or update participant
                    var participant = await participantService.CreateOrUpdateAsync(
                        firstName,
                        surname,
                        email,
                        instagram,
                        ticketCount,
                        totalPaid
                    );

                    logger.LogInformation(
                        "Processed payment for {Email}: {TicketCount} tickets, {TotalPaid}€",
                        email, ticketCount, totalPaid
                    );

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
