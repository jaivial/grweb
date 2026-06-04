using GrCup.Api.Services;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

namespace GrCup.Api.Endpoints;

public static class ReferidoEndpoints
{
    public static void MapReferidoEndpoints(this IEndpointRouteBuilder app)
    {
        // Public validation endpoint — used by FER inscription form to preview discount.
        app.MapPost("/api/competiciones/{slug}/referidos/validar", async (
            string slug,
            [FromBody] ValidateReferidoRequest request,
            CompeticionService competicionService,
            ReferidoService referidoService) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var config = competicionService.GetEventoConfig(competicion);
            if (!config.ReferidosActivo)
                return Results.BadRequest(new { success = false, message = "El plan de referidos no está activo para esta competición." });

            var subtotal = CuponDescuentoService.CalculateSubtotal(config, request.PeakProgram);
            var result = await referidoService.ValidatePublicAsync(competicion.Id, config, request.Codigo, subtotal);
            return Results.Ok(new { success = true, data = result });
        });

        var adminGroup = app.MapGroup("/api/admin/competiciones/{competicionId:int}/referidos").RequireAuthorization();

        // GET /config
        adminGroup.MapGet("/config", async (int competicionId, ReferidoService service) =>
        {
            var config = await service.GetConfigAsync(competicionId);
            return Results.Ok(new { success = true, data = config });
        });

        // POST /config (upsert)
        adminGroup.MapPost("/config", async (
            int competicionId,
            [FromBody] ReferidoConfigRequest request,
            ReferidoService service,
            ILogger<Program> logger) =>
        {
            try
            {
                var config = await service.UpsertConfigAsync(competicionId, request);
                logger.LogInformation("Referral config upserted for competition {CompeticionId}", competicionId);
                return Results.Ok(new { success = true, data = config });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /inscripciones?page=&pageSize=&search=
        adminGroup.MapGet("/inscripciones", async (
            int competicionId,
            ReferidoService service,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] string? search = null) =>
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);
            var items = await service.ListInscripcionesAsync(competicionId, page, pageSize, search);
            var total = await service.CountInscripcionesAsync(competicionId, search);
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

        // PUT /inscripciones/{inscripcionId}
        adminGroup.MapPut("/inscripciones/{inscripcionId:int}", async (
            int competicionId,
            int inscripcionId,
            [FromBody] ReferidoInscripcionOverrideRequest request,
            ReferidoService service,
            ILogger<Program> logger) =>
        {
            try
            {
                var row = await service.UpdateInscripcionSettingAsync(competicionId, inscripcionId, request);
                if (row == null)
                    return Results.NotFound(new { success = false, message = "Inscripción o código no encontrado" });
                logger.LogInformation("Referral override applied to inscripcion {InscripcionId} for competition {CompeticionId}", inscripcionId, competicionId);
                return Results.Ok(new { success = true, data = row });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // POST /backfill
        adminGroup.MapPost("/backfill", async (
            int competicionId,
            ReferidoService service,
            ILogger<Program> logger) =>
        {
            var generated = await service.BackfillAsync(competicionId);
            logger.LogInformation("Backfilled {Generated} referral codes for competition {CompeticionId}", generated, competicionId);
            return Results.Ok(new { success = true, data = new { generated } });
        });

        // POST /activate-all - batch-notify all active codes (manual trigger from backoffice)
        adminGroup.MapPost("/activate-all", async (
            int competicionId,
            ReferidoService service,
            ILogger<Program> logger) =>
        {
            try
            {
                var notified = await service.SendActivationEmailsBatchAsync(competicionId);
                logger.LogInformation("Sent {Notified} referral activation emails for competition {CompeticionId}", notified, competicionId);
                return Results.Ok(new { success = true, data = new { notified } });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to send batch referral activation emails for competition {CompeticionId}", competicionId);
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });
    }
}

public record ValidateReferidoRequest(string Codigo, bool PeakProgram = false, string? Modalidad = null);
