using GrCup.Api.Models;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using Microsoft.AspNetCore.Mvc;

namespace GrCup.Api.Endpoints;

public static class FerLiftEndpoints
{
    public static void MapFerLiftEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/competiciones/{slug}/checkin/{inscripcionId}/openers - Set openers
        app.MapPost("/api/competiciones/{slug}/checkin/{inscripcionId:int}/openers", [Authorize] async (
            string slug,
            int inscripcionId,
            FerLiftRequest body,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
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

                return Results.Ok(new { success = true, data = lifts.Select(l => new
                {
                    l.Id, l.InscripcionId, l.LiftType, l.AttemptNumber, l.Weight,
                    l.UpdatedBy, l.UpdatedAt, l.Juez1Voto, l.Juez2Voto, l.Juez3Voto
                }) });
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

        // PUT /api/competiciones/{slug}/checkin/{inscripcionId}/attempt/{liftType}/{attemptNumber}/weight - Edit attempt weight
        app.MapPut("/api/competiciones/{slug}/checkin/{inscripcionId:int}/attempt/{liftType}/{attemptNumber:int}/weight", [Authorize] async (
            string slug,
            int inscripcionId,
            string liftType,
            int attemptNumber,
            WeightEditRequest body,
            CompeticionService competicionService,
            InscripcionService inscripcionService,
            HttpContext context) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var username = context.User.Identity?.Name ?? "admin";
            try
            {
                var entry = await inscripcionService.UpdateAttemptWeightAsync(
                    competicion.Id, inscripcionId, liftType, attemptNumber, body.Weight, username);
                if (entry == null)
                    return Results.NotFound(new { success = false, message = "Intento no encontrado" });
                return Results.Ok(new { success = true, data = new {
                    entry.Id, entry.InscripcionId, entry.LiftType, entry.AttemptNumber, entry.Weight,
                    entry.UpdatedBy, entry.UpdatedAt, entry.Juez1Voto, entry.Juez2Voto, entry.Juez3Voto
                }});
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // PUT /api/competiciones/{slug}/checkin/{inscripcionId}/attempt/{liftType}/{attemptNumber}/juez - Judge vote
        app.MapPut("/api/competiciones/{slug}/checkin/{inscripcionId:int}/attempt/{liftType}/{attemptNumber:int}/juez", [Authorize] async (
            string slug,
            int inscripcionId,
            string liftType,
            int attemptNumber,
            JudgeVoteRequest body,
            CompeticionService competicionService,
            InscripcionService inscripcionService) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var entry = await inscripcionService.UpdateJudgeVoteAsync(
                competicion.Id, inscripcionId, liftType, attemptNumber, body.JuezNumero, body.Voto);

            if (entry == null)
                return Results.NotFound(new { success = false, message = "Intento no encontrado" });

            return Results.Ok(new { success = true, data = new {
                entry.Id, entry.InscripcionId, entry.LiftType, entry.AttemptNumber, entry.Weight,
                entry.UpdatedBy, entry.UpdatedAt, entry.Juez1Voto, entry.Juez2Voto, entry.Juez3Voto
            }});
        });

        // GET /api/competiciones/{slug}/attempts - All attempts for competition (judge table)
        app.MapGet("/api/competiciones/{slug}/attempts", [Authorize] async (
            string slug,
            [FromQuery] string? categorias,
            CompeticionService competicionService,
            GrCupDbContext db) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var query = db.Inscripciones
                .Where(i => i.CompeticionId == competicion.Id && i.PagoConfirmado);

            // Filter by weight categories if provided (comma-separated)
            if (!string.IsNullOrWhiteSpace(categorias))
            {
                var cats = categorias.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (cats.Length > 0)
                    query = query.Where(i => cats.Contains(i.CategoriaPeso));
            }

            var inscripciones = await query
                .Select(i => new
                {
                    i.Id,
                    i.Nombre,
                    i.Email,
                    i.Sexo,
                    i.CategoriaPeso,
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
                    l.Id,
                    liftType = l.LiftType,
                    attemptNumber = l.AttemptNumber,
                    weight = l.Weight,
                    juez1Voto = l.Juez1Voto,
                    juez2Voto = l.Juez2Voto,
                    juez3Voto = l.Juez3Voto,
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

public record JudgeVoteRequest(int JuezNumero, bool? Voto);
public record WeightEditRequest(decimal Weight);
