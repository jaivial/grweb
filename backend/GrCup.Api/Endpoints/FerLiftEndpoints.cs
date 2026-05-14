using GrCup.Api.Models;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;

namespace GrCup.Api.Endpoints;

public static class FerLiftEndpoints
{
    public static void MapFerLiftEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/competiciones/{slug}/checkin/{inscripcionId}/openers - Set openers (attempts 1)
        app.MapPost("/api/competiciones/{slug}/checkin/{inscripcionId:int}/openers", [Authorize] async (
            string slug,
            int inscripcionId,
            FerLiftRequest body,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            GrCupDbContext db,
            HttpContext context) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var username = context.User.Identity?.Name ?? "admin";

            try
            {
                var lifts = await inscripcionService.SetOpenersAsync(competicion.Id, inscripcionId,
                    body.Sentadilla1, body.Sentadilla2, body.Sentadilla3,
                    body.Banca1, body.Banca2, body.Banca3,
                    body.PesoMuerto1, body.PesoMuerto2, body.PesoMuerto3,
                    username);

                return Results.Ok(new { success = true, data = lifts });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /api/competiciones/{slug}/checkin/{inscripcionId:int}/openers - Get all attempts
        app.MapGet("/api/competiciones/{slug}/checkin/{inscripcionId:int}/openers", [Authorize] async (
            string slug,
            int inscripcionId,
            CompeticionService competicionService,
            InscripcionService inscripcionService) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var attempts = await inscripcionService.GetAllAttemptsAsync(competicion.Id, inscripcionId);
            return Results.Ok(new { success = true, data = attempts });
        });

        // GET /api/competiciones/{slug}/attempts - All attempts for competition (judge table)
        app.MapGet("/api/competiciones/{slug}/attempts", [Authorize] async (
            string slug,
            CompeticionService competicionService,
            GrCupDbContext db) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var inscripciones = await db.Inscripciones
                .Where(i => i.CompeticionId == competicion.Id)
                .Select(i => new
                {
                    i.Id,
                    i.Nombre,
                    i.Email,
                    i.Sexo,
                    i.CategoriaPeso,
                    i.QuiereHandler,
                    i.PagoConfirmado,
                    i.ParticipacionConfirmada,
                    i.CheckinAt
                })
                .ToListAsync();

            var inscripcionIds = inscripciones.Select(i => i.Id).ToList();
            var lifts = await db.LiftEntriesInscripcion
                .Where(l => inscripcionIds.Contains(l.InscripcionId))
                .OrderBy(l => l.InscripcionId)
                .ThenBy(l => l.LiftType)
                .ThenBy(l => l.AttemptNumber)
                .ToListAsync();

            var grouped = inscripciones.Select(i => new
            {
                i.Id,
                i.Nombre,
                i.Email,
                i.Sexo,
                i.CategoriaPeso,
                i.PagoConfirmado,
                i.ParticipacionConfirmada,
                i.CheckinAt,
                attempts = lifts.Where(l => l.InscripcionId == i.Id).Select(l => new
                {
                    liftType = l.LiftType,
                    attemptNumber = l.AttemptNumber,
                    weight = l.Weight,
                    updatedAt = l.UpdatedAt
                }).ToList()
            });

            return Results.Ok(new { success = true, data = grouped });
        });
    }
}

public record FerLiftRequest(
    decimal Sentadilla1, decimal Sentadilla2, decimal Sentadilla3,
    decimal Banca1, decimal Banca2, decimal Banca3,
    decimal PesoMuerto1, decimal PesoMuerto2, decimal PesoMuerto3
);
