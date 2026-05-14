using GrCup.Api.Services;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

namespace GrCup.Api.Endpoints;

public static class InscripcionEndpoints
{
    public static void MapInscripcionEndpoints(this IEndpointRouteBuilder app)
    {
        // ─── Public Registration Endpoints ───

        // POST /api/competiciones/:slug/inscripcion - Create inscription
        app.MapPost("/api/competiciones/{slug}/inscripcion", async (
            string slug,
            [FromBody] CreateInscripcionRequest request,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            EmailService emailService,
            ILogger<Program> logger,
            HttpContext httpContext) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            try
            {
                var inscripcion = await inscripcionService.CreateAsync(competicion.Id, request);
                logger.LogInformation("Inscription created: {Id} for competition {Slug}", inscripcion.Id, slug);

                // Send confirmation emails (fire-and-forget with new DI scope)
                _ = Task.Run(async () =>
                {
                    try
                    {
                        if (competicion.Tipo == "fer")
                        {
                            // Create a new scope to avoid ObjectDisposedException
                            using var scope = httpContext.RequestServices.GetRequiredService<IServiceScopeFactory>().CreateScope();
                            var scopedEmailService = scope.ServiceProvider.GetRequiredService<EmailService>();
                            var scopedCompeticionService = scope.ServiceProvider.GetRequiredService<CompeticionService>();
                            var scopedInscripcionService = scope.ServiceProvider.GetRequiredService<InscripcionService>();

                            var config = scopedCompeticionService.GetEventoConfig(competicion);

                            // Generate QR code bytes for inline embedding in email
                            byte[]? qrCodeImage = null;
                            var qrPayload = scopedInscripcionService.GenerateQrCodePayload(competicion.Id, inscripcion.Id, competicion.QrSecret);
                            var qrResult = await scopedInscripcionService.GenerateQrImageAsync(qrPayload, competicion.Id, inscripcion.Id);
                            if (qrResult.HasValue)
                            {
                                qrCodeImage = qrResult.Value.Bytes;
                            }

                            await scopedEmailService.SendFerConfirmationAsync(inscripcion, competicion, config, qrCodeImage, inscripcion.QrCode);
                            await scopedEmailService.SendFerAdminNotificationAsync(inscripcion, competicion);

                            logger.LogInformation("FER email sent for inscription {Id}. QR embedded: {HasQr}",
                                inscripcion.Id, qrCodeImage != null);
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
                        inscripcion.TotalPagado,
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
                    inscripcion.Experiencia,
                    inscripcion.PagoConfirmado,
                    inscripcion.ParticipacionConfirmada,
                    inscripcion.QuiereHandler,
                    inscripcion.CheckinAt,
                    inscripcion.TotalPagado
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
                    if (competicion.Tipo == "fer")
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
            [FromQuery] string? experiencia = null) =>
        {
            var (items, total) = await service.GetPaginatedAsync(
                competicionId, page, pageSize, search, pagoConfirmado, experiencia
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

        // GET /api/admin/competiciones/:id/inscripciones/export - Export CSV
        adminGroup.MapGet("/export", async (
            int competicionId,
            InscripcionService service) =>
        {
            var csv = await service.ExportToCsvAsync(competicionId);
            var bytes = System.Text.Encoding.UTF8.GetBytes(csv);
            return Results.File(bytes, "text/csv", $"inscripciones-{competicionId}-{DateTime.UtcNow:yyyyMMdd}.csv");
        });

        // GET /api/admin/competiciones/:id/inscripciones/stats - Get statistics
        adminGroup.MapGet("/stats", async (
            int competicionId,
            InscripcionService service) =>
        {
            var stats = await service.GetStatsAsync(competicionId);
            return Results.Ok(new { success = true, data = stats });
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

public record ConfirmarPagoRequest(string? PaymentMethod = null);
