using GrCup.Api.Services;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

namespace GrCup.Api.Endpoints;

public static class InscripcionEndpoints
{
    private static string GetFerFrontendBaseUrl()
    {
        var baseUrl = Environment.GetEnvironmentVariable("website_fer_url")
            ?? Environment.GetEnvironmentVariable("FER_FRONTEND_URL")
            ?? "https://fercup.com";

        if (!baseUrl.StartsWith("http://") && !baseUrl.StartsWith("https://"))
            baseUrl = $"https://{baseUrl}";

        return baseUrl.TrimEnd('/');
    }

    private static string BuildOnlinePaymentUrl(InscripcionService service, Competicion competicion, int inscripcionId)
    {
        var token = service.GeneratePaymentToken(competicion.Id, inscripcionId, competicion.QrSecret);
        return $"{GetFerFrontendBaseUrl()}/inscripcion/pagar?token={Uri.EscapeDataString(token)}";
    }

    private static string BuildFrontendUrl(string frontendUrl, string path)
    {
        var baseUrl = string.IsNullOrWhiteSpace(frontendUrl) ? GetFerFrontendBaseUrl() : frontendUrl.TrimEnd('/');
        return $"{baseUrl}{path}";
    }

    private static async Task<IResult?> ValidateFerConfigSnapshotAsync(
        Competicion competicion,
        FerConfigSnapshot? requestedSnapshot,
        FerConfigSnapshotService ferConfigSnapshotService)
    {
        if (!string.Equals(competicion.Tipo, "fer", StringComparison.OrdinalIgnoreCase))
            return null;

        var currentSnapshot = await ferConfigSnapshotService.BuildAsync(competicion);
        if (FerConfigSnapshotService.Matches(currentSnapshot, requestedSnapshot))
            return null;

        return Results.Conflict(new
        {
            success = false,
            code = "stale_config",
            message = "Ha ocurrido un error, recarga la pagina y vuelvelo a intentar.",
            data = new
            {
                currentConfig = currentSnapshot
            }
        });
    }

    public static void MapInscripcionEndpoints(this IEndpointRouteBuilder app)
    {
        // ─── Public Registration Endpoints ───

        // POST /api/competiciones/:slug/inscripcion - Create inscription
        app.MapPost("/api/competiciones/{slug}/inscripcion", async (
            string slug,
            [FromBody] CreateInscripcionRequest request,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            FerConfigSnapshotService ferConfigSnapshotService,
            StripeService stripeService,
            EmailService emailService,
            ILogger<Program> logger,
            HttpContext httpContext) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var staleConfigResult = await ValidateFerConfigSnapshotAsync(competicion, request.ConfigSnapshot, ferConfigSnapshotService);
            if (staleConfigResult != null)
                return staleConfigResult;

            try
            {
                var inscripcion = await inscripcionService.CreateAsync(competicion.Id, request);
                logger.LogInformation("Inscription created: {Id} for competition {Slug}", inscripcion.Id, slug);
                var eventConfig = competicionService.GetEventoConfig(competicion);
                var includeOnlinePaymentLink = request.IncludeOnlinePaymentLink
                    && await stripeService.IsInscriptionStripeAvailableAsync(competicion.Id, eventConfig);
                var onlinePaymentUrl = includeOnlinePaymentLink
                    ? BuildOnlinePaymentUrl(inscripcionService, competicion, inscripcion.Id)
                    : null;

                // Send confirmation emails (fire-and-forget with new DI scope)
                _ = Task.Run(async () =>
                {
                    try
                    {
                        if (CompeticionHelper.IsFerCompetition(competicion.Tipo))
                        {
                            // Create a new scope to avoid ObjectDisposedException
                            using var scope = httpContext.RequestServices.GetRequiredService<IServiceScopeFactory>().CreateScope();
                            var scopedEmailService = scope.ServiceProvider.GetRequiredService<EmailService>();
                            var scopedCompeticionService = scope.ServiceProvider.GetRequiredService<CompeticionService>();
                            var scopedInscripcionService = scope.ServiceProvider.GetRequiredService<InscripcionService>();

                            // Re-fetch the inscription through the scoped DbContext so email-status
                            // updates (EmailEnviadoStatus/EmailEnviadoAt) are tracked and persisted.
                            // The original `inscripcion` belongs to the request scope's DbContext and
                            // is not tracked here, so saves against it would be silent no-ops.
                            var trackedInscripcion = await scopedInscripcionService.GetByIdAsync(inscripcion.Id) ?? inscripcion;

                            var config = scopedCompeticionService.GetEventoConfig(competicion);

                            // Generate QR code bytes for inline embedding in email
                            byte[]? qrCodeImage = null;
                            string? qrImageUrl = trackedInscripcion.QrImageUrl;
                            var qrPayload = scopedInscripcionService.GenerateQrCodePayload(competicion.Id, trackedInscripcion.Id, competicion.QrSecret);
                            var qrResult = await scopedInscripcionService.GenerateQrImageAsync(qrPayload, competicion.Id, trackedInscripcion.Id);
                            if (qrResult.HasValue)
                            {
                                qrCodeImage = qrResult.Value.Bytes;
                                qrImageUrl = qrResult.Value.Url;
                            }

                            await scopedEmailService.SendFerConfirmationAsync(trackedInscripcion, competicion, config, qrCodeImage, trackedInscripcion.QrCode, onlinePaymentUrl, qrImageUrl);
                            await scopedEmailService.SendFerAdminNotificationAsync(trackedInscripcion, competicion);

                            logger.LogInformation("FER email sent for inscription {Id}. QR embedded: {HasQr}",
                                trackedInscripcion.Id, qrCodeImage != null);
                        }
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Failed to send confirmation emails for inscription {Id}", inscripcion.Id);
                    }
                });

                return Results.Created($"/api/competiciones/{slug}/inscripcion/{inscripcion.Id}", new
                {
                    success = true,
                    data = new
                    {
                        inscripcion.Id,
                        inscripcion.Nombre,
                        inscripcion.Email,
                        inscripcion.QrCode,
                        inscripcion.QrImageUrl,
                        inscripcion.TotalPagado,
                        inscripcion.SubtotalAntesDescuento,
                        inscripcion.ImporteDescuento,
                        inscripcion.CodigoCupon,
                        inscripcion.Modalidad,
                        inscripcion.ParticipacionConfirmada,
                        inscripcion.QuiereHandler,
                        inscripcion.QuierePeakProgram,
                        mensaje = "Inscripción creada correctamente. Te llegará un email de confirmación."
                    }
                });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to create inscription for {Slug}", slug);
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // POST /api/competiciones/:slug/inscripcion/stripe-checkout - Create Stripe checkout (deferred or immediate)
        app.MapPost("/api/competiciones/{slug}/inscripcion/stripe-checkout", async (
            string slug,
            [FromBody] StripeInscripcionCheckoutRequest request,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            FerConfigSnapshotService ferConfigSnapshotService,
            StripeService stripeService,
            EmailService emailService,
            ILogger<Program> logger) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var staleConfigResult = await ValidateFerConfigSnapshotAsync(competicion, request.Inscripcion.ConfigSnapshot, ferConfigSnapshotService);
            if (staleConfigResult != null)
                return staleConfigResult;

            var config = competicionService.GetEventoConfig(competicion);
            if (!await stripeService.IsInscriptionStripeAvailableAsync(competicion.Id, config))
                return Results.Ok(new { success = true, data = new { status = "stripe_unavailable" } });

            try
            {
                var isStripeOnly = config.PagoStripeActivo && !config.PagoEfectivoActivo;

                var subtotal = CuponDescuentoService.CalculateSubtotal(config, request.Inscripcion.PeakProgram);
                var coupon = await inscripcionService.ApplyCouponAsync(competicion.Id, config, request.Inscripcion.CodigoCupon, subtotal);

                if (coupon.Total <= 0)
                {
                    var (inscripcion, _, alreadyPaid) = await inscripcionService.CreateOrReuseStripePendingAsync(competicion.Id, request.Inscripcion);
                    if (!inscripcion.PagoConfirmado)
                        inscripcion = await inscripcionService.ConfirmPaymentAsync(inscripcion.Id, InscripcionService.PaymentMethodCupon) ?? inscripcion;

                    if (!alreadyPaid && CompeticionHelper.IsFerCompetition(competicion.Tipo))
                    {
                        var qrPayload = inscripcionService.GenerateQrCodePayload(competicion.Id, inscripcion.Id, competicion.QrSecret);
                        var qrResult = await inscripcionService.GenerateQrImageAsync(qrPayload, competicion.Id, inscripcion.Id);
                        var qrImageUrl = qrResult?.Url ?? inscripcion.QrImageUrl;
                        await emailService.SendFerConfirmationAsync(inscripcion, competicion, config, qrResult?.Bytes, inscripcion.QrCode, qrImageUrl: qrImageUrl);
                        await emailService.SendFerAdminNotificationAsync(inscripcion, competicion);
                    }

                    return Results.Ok(new
                    {
                        success = true,
                        data = new
                        {
                            status = "already_paid",
                            inscripcion.Id,
                            inscripcion.Nombre,
                            inscripcion.Email,
                            inscripcion.QrCode,
                            inscripcion.QrImageUrl,
                            inscripcion.TotalPagado,
                            inscripcion.CodigoCupon,
                            inscripcion.ImporteDescuento,
                            inscripcion.SubtotalAntesDescuento
                        }
                    });
                }

                if (isStripeOnly)
                {
                    var successUrl = BuildFrontendUrl(request.FrontendUrl, "/inscripcion/success?session_id={CHECKOUT_SESSION_ID}");
                    var cancelUrl = BuildFrontendUrl(request.FrontendUrl, "/inscripcion?payment_cancelled=1");
                    var session = await stripeService.CreateDeferredInscriptionCheckoutSessionAsync(
                        request.Inscripcion, competicion, coupon, coupon.Total, successUrl, cancelUrl);

                    logger.LogInformation("Created deferred FER Stripe checkout session {SessionId} for {Email}", session.Id, request.Inscripcion.Email);
                    return Results.Ok(new
                    {
                        success = true,
                        data = new
                        {
                            status = "checkout",
                            sessionId = session.Id,
                            url = session.Url
                        }
                    });
                }

                var (existingInscripcion, _, existingAlreadyPaid) = await inscripcionService.CreateOrReuseStripePendingAsync(competicion.Id, request.Inscripcion);
                if (existingAlreadyPaid || existingInscripcion.PagoConfirmado)
                {
                    return Results.Ok(new
                    {
                        success = true,
                        data = new
                        {
                            status = "already_paid",
                            existingInscripcion.Id,
                            existingInscripcion.Nombre,
                            existingInscripcion.Email,
                            existingInscripcion.QrCode,
                            existingInscripcion.TotalPagado,
                            existingInscripcion.CodigoCupon,
                            existingInscripcion.ImporteDescuento,
                            existingInscripcion.SubtotalAntesDescuento
                        }
                    });
                }

                var successUrl2 = BuildFrontendUrl(request.FrontendUrl, "/inscripcion/success?session_id={CHECKOUT_SESSION_ID}");
                var cancelUrl2 = BuildFrontendUrl(request.FrontendUrl, "/inscripcion?payment_cancelled=1");
                var session2 = await stripeService.CreateInscriptionCheckoutSessionAsync(existingInscripcion, competicion, successUrl2, cancelUrl2);
                await inscripcionService.AttachStripeSessionAsync(competicion.Id, existingInscripcion.Id, session2.Id);

                logger.LogInformation("Created FER Stripe checkout session {SessionId} for inscription {InscripcionId}", session2.Id, existingInscripcion.Id);
                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        status = "checkout",
                        sessionId = session2.Id,
                        url = session2.Url,
                        inscripcionId = existingInscripcion.Id
                    }
                });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to create FER Stripe checkout for {Slug}", slug);
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        app.MapGet("/api/competiciones/{slug}/inscripcion/config-snapshot", async (
            string slug,
            CompeticionService competicionService,
            FerConfigSnapshotService ferConfigSnapshotService) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var snapshot = await ferConfigSnapshotService.BuildAsync(competicion);
            return Results.Ok(new { success = true, data = snapshot });
        });

        // POST /api/competiciones/:slug/inscripcion/pago-online - Resolve email payment link token
        app.MapPost("/api/competiciones/{slug}/inscripcion/pago-online", async (
            string slug,
            [FromBody] OnlinePaymentLinkRequest request,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            StripeService stripeService,
            ILogger<Program> logger) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var tokenData = inscripcionService.ValidatePaymentToken(request.Token, competicion.QrSecret);
            if (tokenData == null || tokenData.Value.CompeticionId != competicion.Id)
                return Results.BadRequest(new { success = false, message = "Token de pago inválido" });

            var inscripcion = await inscripcionService.GetByIdAsync(tokenData.Value.InscripcionId);
            if (inscripcion == null || inscripcion.CompeticionId != competicion.Id)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            if (inscripcion.PagoConfirmado)
                return Results.Ok(new { success = true, data = new { status = "already_paid" } });

            var config = competicionService.GetEventoConfig(competicion);
            if (!await stripeService.IsInscriptionStripeAvailableAsync(competicion.Id, config))
                return Results.Ok(new { success = true, data = new { status = "stripe_unavailable" } });

            try
            {
                var successUrl = BuildFrontendUrl(request.FrontendUrl, "/inscripcion/success?session_id={CHECKOUT_SESSION_ID}");
                var cancelUrl = BuildFrontendUrl(request.FrontendUrl, "/inscripcion?payment_cancelled=1");
                var session = await stripeService.CreateInscriptionCheckoutSessionAsync(inscripcion, competicion, successUrl, cancelUrl);
                await inscripcionService.AttachStripeSessionAsync(competicion.Id, inscripcion.Id, session.Id);

                logger.LogInformation("Created FER email-link Stripe checkout session {SessionId} for inscription {InscripcionId}", session.Id, inscripcion.Id);
                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        status = "checkout",
                        sessionId = session.Id,
                        url = session.Url,
                        inscripcionId = inscripcion.Id
                    }
                });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to resolve FER online payment link for {Slug}", slug);
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /api/competiciones/:slug/inscripcion/stripe-session/:sessionId - Retrieve paid inscription after Stripe return
        app.MapGet("/api/competiciones/{slug}/inscripcion/stripe-session/{sessionId}", async (
            string slug,
            string sessionId,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            StripeService stripeService,
            EmailService emailService,
            ILogger<Program> logger) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var inscripcion = await inscripcionService.GetByStripeSessionIdAsync(competicion.Id, sessionId);
            if (inscripcion == null)
            {
                try
                {
                    var session = await stripeService.GetSessionAsync(sessionId, competicion.Id);
                    if (session.Metadata != null && session.Metadata.TryGetValue("type", out var type) && type == "fer_inscripcion_deferred"
                        && string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase))
                    {
                        (inscripcion, var deferredAlreadyPaid) = await inscripcionService.CreateFromStripeMetadataAsync(competicion.Id, session.Metadata, sessionId);

                        if (!deferredAlreadyPaid && CompeticionHelper.IsFerCompetition(competicion.Tipo))
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

                        logger.LogInformation("Created FER inscription {InscripcionId} from deferred session {SessionId} on success page poll", inscripcion.Id, sessionId);
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to resolve deferred FER Stripe session {SessionId} on success page", sessionId);
                }

                if (inscripcion == null)
                    return Results.NotFound(new { success = false, message = "Inscription not found" });
            }

            if (!inscripcion.PagoConfirmado)
            {
                try
                {
                    var session = await stripeService.GetSessionAsync(sessionId, competicion.Id);
                    if (string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase))
                    {
                        var previousPaymentMethod = inscripcion.PaymentMethod;
                        var confirmedInscripcion = await inscripcionService.ConfirmStripePaymentAsync(competicion.Id, inscripcion.Id, sessionId);

                        if (confirmedInscripcion != null && CompeticionHelper.IsFerCompetition(competicion.Tipo))
                        {
                            if (string.Equals(previousPaymentMethod, InscripcionService.PaymentMethodEfectivo, StringComparison.OrdinalIgnoreCase))
                            {
                                await emailService.SendFerPaymentConfirmationAsync(confirmedInscripcion, competicion);
                            }
                            else
                            {
                                var config = competicionService.GetEventoConfig(competicion);
                                byte[]? qrCodeImage = null;
                                string? qrImageUrl = confirmedInscripcion.QrImageUrl;
                                var qrPayload = inscripcionService.GenerateQrCodePayload(competicion.Id, confirmedInscripcion.Id, competicion.QrSecret);
                                var qrResult = await inscripcionService.GenerateQrImageAsync(qrPayload, competicion.Id, confirmedInscripcion.Id);
                                if (qrResult.HasValue)
                                {
                                    qrCodeImage = qrResult.Value.Bytes;
                                    qrImageUrl = qrResult.Value.Url;
                                }

                                await emailService.SendFerConfirmationAsync(confirmedInscripcion, competicion, config, qrCodeImage, confirmedInscripcion.QrCode, qrImageUrl: qrImageUrl);
                                await emailService.SendFerAdminNotificationAsync(confirmedInscripcion, competicion);
                            }

                            inscripcion = confirmedInscripcion;
                        }
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to verify FER Stripe session {SessionId} on success page", sessionId);
                }
            }

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    status = inscripcion.PagoConfirmado ? "paid" : "pending",
                    inscripcion.Id,
                    inscripcion.Nombre,
                    inscripcion.Email,
                    inscripcion.QrCode,
                    inscripcion.QrImageUrl,
                    inscripcion.TotalPagado,
                    inscripcion.SubtotalAntesDescuento,
                    inscripcion.ImporteDescuento,
                    inscripcion.CodigoCupon,
                    inscripcion.PaymentMethod,
                    inscripcion.PagoConfirmado
                }
            });
        });

        // POST /api/competiciones/:slug/inscripcion/:id/peak-program - Add GRS Peak Program to an inscription
        app.MapPost("/api/competiciones/{slug}/inscripcion/{id:int}/peak-program", async (
            string slug,
            int id,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            ILogger<Program> logger) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            try
            {
                var inscripcion = await inscripcionService.AddPeakProgramAsync(competicion.Id, id);
                if (inscripcion == null)
                    return Results.NotFound(new { success = false, message = "Inscription not found" });

                logger.LogInformation("Peak Program added to inscription {Id} for competition {Slug}", id, slug);

                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        inscripcion.Id,
                        inscripcion.Nombre,
                        inscripcion.Email,
                        inscripcion.QrCode,
                        inscripcion.QrImageUrl,
                        inscripcion.TotalPagado,
                        inscripcion.QuierePeakProgram,
                        mensaje = "GRS Peak Program añadido correctamente."
                    }
                });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to add Peak Program to inscription {Id} for {Slug}", id, slug);
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /api/competiciones/:slug/inscripcion/:id/qr - Get QR code
        app.MapGet("/api/competiciones/{slug}/inscripcion/{id:int}/qr", async (
            string slug,
            int id,
            InscripcionService inscripcionService) =>
        {
            var inscripcion = await inscripcionService.GetByIdAsync(id);
            if (inscripcion == null || inscripcion.Competicion.Slug != slug)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    inscripcion.Id,
                    inscripcion.Nombre,
                    inscripcion.QrCode
                }
            });
        });

        // ─── Check-in Endpoints ───

        // GET /api/competiciones/:slug/checkin/:id - Get inscription for check-in
        app.MapGet("/api/competiciones/{slug}/checkin/{id:int}", async (
            string slug,
            int id,
            CompeticionService competicionService,
            InscripcionService inscripcionService) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var inscripcion = await inscripcionService.GetByIdAsync(id);
            if (inscripcion == null || inscripcion.CompeticionId != competicion.Id)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    inscripcion.Id,
                    inscripcion.Nombre,
                    inscripcion.Email,
                    inscripcion.Instagram,
                    inscripcion.Telefono,
                    inscripcion.Sexo,
                    inscripcion.CategoriaPeso,
                    inscripcion.Modalidad,
                    inscripcion.Experiencia,
                    inscripcion.PagoConfirmado,
                    inscripcion.PaymentMethod,
                    inscripcion.ParticipacionConfirmada,
                    inscripcion.QuiereHandler,
                    inscripcion.CheckinAt,
                    inscripcion.TotalPagado,
                    inscripcion.SubtotalAntesDescuento,
                    inscripcion.ImporteDescuento,
                    inscripcion.CodigoCupon
                }
            });
        });

        // GET /api/competiciones/:slug/checkin/buscar - Search inscriptions
        app.MapGet("/api/competiciones/{slug}/checkin/buscar", async (
            string slug,
            [FromQuery] string q,
            CompeticionService competicionService,
            InscripcionService inscripcionService) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var (inscripciones, _) = await inscripcionService.GetPaginatedAsync(
                competicion.Id,
                search: q,
                pageSize: 20
            );

            return Results.Ok(new
            {
                success = true,
                data = inscripciones.Select(i => new
                {
                    i.Id,
                    i.Nombre,
                    i.Email,
                    i.PagoConfirmado,
                    i.PaymentMethod,
                    i.CodigoCupon,
                    i.ParticipacionConfirmada,
                    i.CheckinAt
                })
            });
        });

        // POST /api/competiciones/:slug/checkin/:id/confirmar - Confirm payment
        app.MapPost("/api/competiciones/{slug}/checkin/{id:int}/confirmar", [Authorize] async (
            string slug,
            int id,
            [FromBody] ConfirmarPagoRequest? request,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            ILogger<Program> logger) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var inscripcion = await inscripcionService.ConfirmPaymentAsync(id, request?.PaymentMethod);
            if (inscripcion == null)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            logger.LogInformation("Payment confirmed for inscription {Id}", id);
            return Results.Ok(new { success = true, data = inscripcion });
        });

        // POST /api/competiciones/:slug/checkin/:id/asistio - Mark as attended
        app.MapPost("/api/competiciones/{slug}/checkin/{id:int}/asistio", [Authorize] async (
            string slug,
            int id,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            ILogger<Program> logger) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            try
            {
                var inscripcion = await inscripcionService.CheckinAsync(id);
                if (inscripcion == null)
                    return Results.NotFound(new { success = false, message = "Inscription not found" });

                logger.LogInformation("Check-in completed for inscription {Id}", id);
                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        inscripcion.Id,
                        inscripcion.Nombre,
                        inscripcion.CheckinAt
                    }
                });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /api/competiciones/:slug/checkin/:id/estado - Get full inscription state for QR
        app.MapGet("/api/competiciones/{slug}/checkin/{id:int}/estado", async (
            string slug,
            int id,
            CompeticionService competicionService,
            InscripcionService inscripcionService) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var estado = await inscripcionService.GetEstadoAsync(competicion.Id, id);
            if (estado == null)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            return Results.Ok(new { success = true, data = estado });
        });

        // POST /api/competiciones/:slug/checkin/:id/confirmar-participacion - Confirm participation via QR
        app.MapPost("/api/competiciones/{slug}/checkin/{id:int}/confirmar-participacion", [Authorize] async (
            string slug,
            int id,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            ILogger<Program> logger) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var inscripcion = await inscripcionService.ConfirmParticipationAsync(id);
            if (inscripcion == null)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            logger.LogInformation("Participation confirmed for inscription {Id} via QR scan", id);

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    inscripcion.Id,
                    inscripcion.Nombre,
                    inscripcion.ParticipacionConfirmada,
                    inscripcion.PagoConfirmado
                }
            });
        });

        // POST /api/competiciones/:slug/checkin/:id/confirmar-pago-efectivo - Confirm cash payment via QR
        app.MapPost("/api/competiciones/{slug}/checkin/{id:int}/confirmar-pago-efectivo", [Authorize] async (
            string slug,
            int id,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            EmailService emailService,
            ILogger<Program> logger,
            HttpContext httpContext) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var inscripcion = await inscripcionService.ConfirmCashPaymentAsync(id);
            if (inscripcion == null)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            logger.LogInformation("Cash payment confirmed for inscription {Id} via QR scan", id);

            // Send payment confirmation email for FER (fire-and-forget with new DI scope)
            _ = Task.Run(async () =>
            {
                try
                {
                    if (CompeticionHelper.IsFerCompetition(competicion.Tipo))
                    {
                        using var scope = httpContext.RequestServices.GetRequiredService<IServiceScopeFactory>().CreateScope();
                        var scopedEmailService = scope.ServiceProvider.GetRequiredService<EmailService>();
                        var scopedInscripcionService = scope.ServiceProvider.GetRequiredService<InscripcionService>();
                        
                        var fullInscripcion = await scopedInscripcionService.GetByIdAsync(id);
                        if (fullInscripcion != null)
                            await scopedEmailService.SendFerPaymentConfirmationAsync(fullInscripcion, competicion);
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to send payment confirmation email for inscription {Id}", id);
                }
            });

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    inscripcion.Id,
                    inscripcion.Nombre,
                    inscripcion.PagoConfirmado,
                    inscripcion.PaymentMethod,
                    inscripcion.TotalPagado
                }
            });
        });

        // ─── Admin Endpoints ───

        var adminGroup = app.MapGroup("/api/admin/competiciones/{competicionId:int}/inscripciones")
            .RequireAuthorization();

        // GET /api/admin/competiciones/:id/inscripciones - List inscriptions
        adminGroup.MapGet("/", async (
            int competicionId,
            InscripcionService service,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 15,
            [FromQuery] string? search = null,
            [FromQuery] bool? pagoConfirmado = null,
            [FromQuery] string? experiencia = null,
            [FromQuery] string? modalidad = null,
            [FromQuery] string? paymentMethod = null,
            [FromQuery] string? sexo = null,
            [FromQuery] string? categoriaPeso = null,
            [FromQuery] bool? quiereHandler = null,
            [FromQuery] bool? quierePeakProgram = null,
            [FromQuery] bool? participacionConfirmada = null,
            [FromQuery] bool? hasCoupon = null) =>
        {
            var (items, total) = await service.GetPaginatedAsync(
                competicionId, page, pageSize, search, pagoConfirmado, experiencia, modalidad, paymentMethod,
                sexo, categoriaPeso, quiereHandler, quierePeakProgram, participacionConfirmada, hasCoupon
            );

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    items,
                    total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling(total / (double)pageSize)
                }
            });
        });

        // POST /api/admin/competiciones/:id/inscripciones - Create inscription from backoffice
        adminGroup.MapPost("/", async (
            int competicionId,
            [FromBody] CreateInscripcionRequest request,
            InscripcionService service,
            ILogger<Program> logger) =>
        {
            try
            {
                var inscripcion = await service.CreateAsync(competicionId, request);
                logger.LogInformation("Admin inscription created: {Id}", inscripcion.Id);
                return Results.Created($"/api/admin/competiciones/{competicionId}/inscripciones/{inscripcion.Id}", new
                {
                    success = true,
                    data = inscripcion
                });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to create admin inscription for competition {CompeticionId}", competicionId);
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /api/admin/competiciones/:id/inscripciones/export - Export CSV
        adminGroup.MapGet("/export", async (
            int competicionId,
            InscripcionService service) =>
        {
            var csv = await service.ExportToCsvAsync(competicionId);
            var bytes = System.Text.Encoding.UTF8.GetBytes(csv);
            return Results.File(bytes, "text/csv", $"inscripciones-{competicionId}-{DateTime.UtcNow:yyyyMMdd}.csv");
        });

        // GET /api/admin/competiciones/:id/inscripciones/export-json - Export JSON with filters and ordering
        adminGroup.MapGet("/export-json", async (
            int competicionId,
            InscripcionService service,
            [FromQuery] string? search = null,
            [FromQuery] bool? pagoConfirmado = null,
            [FromQuery] string? experiencia = null,
            [FromQuery] string? modalidad = null,
            [FromQuery] string? paymentMethod = null,
            [FromQuery] string? sexo = null,
            [FromQuery] string? categoriaPeso = null,
            [FromQuery] bool? quiereHandler = null,
            [FromQuery] bool? quierePeakProgram = null,
            [FromQuery] bool? participacionConfirmada = null,
            [FromQuery] bool? hasCoupon = null,
            [FromQuery] string? orderBy = null,
            [FromQuery] string? orderDirection = null) =>
        {
            var inscripciones = await service.ExportToJsonAsync(
                competicionId, search, pagoConfirmado, experiencia, modalidad, paymentMethod,
                sexo, categoriaPeso, quiereHandler, quierePeakProgram, participacionConfirmada, hasCoupon,
                orderBy, orderDirection);

            return Results.Ok(new
            {
                success = true,
                data = inscripciones.Select(i => new
                {
                    i.Id,
                    i.Nombre,
                    i.Email,
                    i.Instagram,
                    i.Telefono,
                    i.Sexo,
                    i.CategoriaPeso,
                    i.Modalidad,
                    i.Experiencia,
                    i.QuiereHandler,
                    i.QuierePeakProgram,
                    i.PagoConfirmado,
                    i.PaymentMethod,
                    i.CodigoCupon,
                    i.ImporteDescuento,
                    i.SubtotalAntesDescuento,
                    i.TotalPagado,
                    i.ParticipacionConfirmada,
                    i.CheckinAt,
                    i.CreatedAt
                })
            });
        });

        // GET /api/admin/competiciones/:id/inscripciones/stats - Get statistics
        adminGroup.MapGet("/stats", async (
            int competicionId,
            InscripcionService service,
            [FromQuery] string? search = null,
            [FromQuery] bool? pagoConfirmado = null,
            [FromQuery] string? experiencia = null,
            [FromQuery] string? modalidad = null,
            [FromQuery] string? paymentMethod = null,
            [FromQuery] string? sexo = null,
            [FromQuery] string? categoriaPeso = null,
            [FromQuery] bool? quiereHandler = null,
            [FromQuery] bool? quierePeakProgram = null,
            [FromQuery] bool? participacionConfirmada = null,
            [FromQuery] bool? hasCoupon = null) =>
        {
            var stats = await service.GetStatsAsync(
                competicionId, search, pagoConfirmado, experiencia, modalidad, paymentMethod,
                sexo, categoriaPeso, quiereHandler, quierePeakProgram, participacionConfirmada, hasCoupon);
            return Results.Ok(new { success = true, data = stats });
        });

        // POST /api/admin/competiciones/:id/inscripciones/raffle - Pick N random winners
        adminGroup.MapPost("/raffle", async (
            int competicionId,
            [FromBody] RaffleRequest body,
            InscripcionService service,
            ILogger<Program> logger) =>
        {
            try
            {
                var result = await service.RaffleAsync(competicionId, body);
                logger.LogInformation("Raffle draw for competition {CompeticionId}: {Count} winners, fallback={Fallback}",
                    competicionId, result.Winners.Count, result.FallbackReason ?? "none");
                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        winners = result.Winners,
                        fallbackReason = result.FallbackReason,
                        pool = result.Pool
                    }
                });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to run raffle for competition {CompeticionId}", competicionId);
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /api/admin/competiciones/:id/inscripciones/:id - Get single inscription
        adminGroup.MapGet("/{id:int}", async (
            int competicionId,
            int id,
            InscripcionService service) =>
        {
            var inscripcion = await service.GetByIdAsync(id);
            if (inscripcion == null || inscripcion.CompeticionId != competicionId)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            return Results.Ok(new { success = true, data = inscripcion });
        });

        // POST /api/admin/competiciones/:id/inscripciones/:id/reenviar-confirmacion - Resend FER confirmation email using stored QR

        adminGroup.MapPost("/{id:int}/reenviar-confirmacion", async (
            int competicionId,
            int id,
            InscripcionService inscripcionService,
            CompeticionService competicionService,
            EmailService emailService,
            ILogger<Program> logger) =>
        {
            var inscripcion = await inscripcionService.GetByIdAsync(id);
            if (inscripcion == null || inscripcion.CompeticionId != competicionId)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            var competicion = await competicionService.GetByIdAsync(competicionId);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            if (!string.Equals(competicion.Tipo, "fer", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { success = false, message = "Esta acción solo está disponible para FER" });

            try
            {
                byte[]? qrCodeImage = null;
                var qrImageUrl = inscripcion.QrImageUrl;

                if (string.IsNullOrWhiteSpace(qrImageUrl) || !Uri.IsWellFormedUriString(qrImageUrl, UriKind.Absolute))
                {
                    var regenerated = await inscripcionService.RegenerateAndPersistQrImageAsync(competicionId, id);
                    qrCodeImage = regenerated.Bytes;
                    qrImageUrl = regenerated.Url;
                    inscripcion = await inscripcionService.GetByIdAsync(id);
                    if (inscripcion == null)
                        return Results.NotFound(new { success = false, message = "Inscription not found" });
                }

                var eventConfig = competicionService.GetEventoConfig(competicion);
                await emailService.SendFerConfirmationAsync(inscripcion, competicion, eventConfig, qrCodeImage, inscripcion.QrCode, qrImageUrl: qrImageUrl);
                logger.LogInformation("FER confirmation re-sent for inscription {Id}", id);

                return Results.Ok(new { success = true, message = "Email de confirmación reenviado correctamente." });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to resend FER confirmation for inscription {Id}", id);
                return Results.BadRequest(new
                {
                    success = false,
                    message = "No se pudo reenviar el email de confirmación. Inténtalo de nuevo."
                });
            }
        });

        // PUT /api/admin/competiciones/:id/inscripciones/:id - Update inscription
        adminGroup.MapPut("/{id:int}", async (
            int competicionId,
            int id,
            [FromBody] UpdateInscripcionRequest request,
            InscripcionService service,
            ILogger<Program> logger) =>
        {
            var inscripcion = await service.GetByIdAsync(id);
            if (inscripcion == null || inscripcion.CompeticionId != competicionId)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            var updated = await service.UpdateAsync(id, request);
            logger.LogInformation("Inscription updated: {Id}", id);

            return Results.Ok(new { success = true, data = updated });
        });

        // DELETE /api/admin/competiciones/:id/inscripciones/:id - Delete inscription
        adminGroup.MapDelete("/{id:int}", async (
            int competicionId,
            int id,
            InscripcionService service,
            ILogger<Program> logger) =>
        {
            var inscripcion = await service.GetByIdAsync(id);
            if (inscripcion == null || inscripcion.CompeticionId != competicionId)
                return Results.NotFound(new { success = false, message = "Inscription not found" });

            await service.DeleteAsync(id);
            logger.LogInformation("Inscription deleted: {Id}", id);

            return Results.Ok(new { success = true, message = "Inscription deleted" });
        });
    }
}

public record StripeInscripcionCheckoutRequest(
    CreateInscripcionRequest Inscripcion,
    string FrontendUrl
);

public record OnlinePaymentLinkRequest(
    string Token,
    string FrontendUrl
);

public record ConfirmarPagoRequest(string? PaymentMethod = null);
