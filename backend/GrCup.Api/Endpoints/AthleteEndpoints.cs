using GrCup.Api.Services;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

namespace GrCup.Api.Endpoints;

public static class AthleteEndpoints
{
    public static void MapAthleteEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/athletes - List with filters and pagination
        app.MapGet("/api/admin/athletes", [Authorize] async (
            AthleteService athleteService,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 15,
            [FromQuery] string? search = null,
            [FromQuery] Sex? sex = null,
            [FromQuery] string? weightCategory = null,
            [FromQuery] AthleteStatus? status = null,
            [FromQuery] string? club = null) =>
        {
            var (athletes, totalCount) = await athleteService.GetAllPaginatedAsync(
                page, pageSize, search, sex, weightCategory, status, club);

            var stats = await athleteService.GetStatsAsync(search, sex, weightCategory, status, club);

            return Results.Ok(new
            {
                athletes,
                totalCount,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling(totalCount / (double)pageSize),
                stats
            });
        });

        // GET /api/admin/athletes/{id}
        app.MapGet("/api/admin/athletes/{id}", [Authorize] async (
            int id,
            AthleteService athleteService) =>
        {
            var athlete = await athleteService.GetByIdAsync(id);
            return athlete != null ? Results.Ok(athlete) : Results.NotFound();
        });

        // POST /api/admin/athletes
        app.MapPost("/api/admin/athletes", [Authorize] async (
            [FromBody] Athlete athlete,
            AthleteService athleteService,
            EmailService emailService,
            ILogger<Program> logger) =>
        {
            var created = await athleteService.CreateAsync(athlete);

            // Send confirmation email (non-blocking for registration success)
            try
            {
                await emailService.SendInscriptionConfirmationAsync(
                    created.Email,
                    created.FirstName,
                    created.Surname,
                    created.WeightCategory,
                    created.Sex.ToString(),
                    created.Club,
                    created.Coach);
            }
            catch (Exception emailEx)
            {
                logger.LogError(emailEx, "Failed to send confirmation email to {Email}", created.Email);
            }

            // Send admin notification email (non-blocking)
            try
            {
                await emailService.SendAdminNotificationAsync(
                    created.Email,
                    created.FirstName,
                    created.Surname,
                    created.Phone,
                    created.Sex.ToString(),
                    created.WeightCategory,
                    created.Club,
                    created.Coach,
                    created.TotalWeight);
            }
            catch (Exception emailEx)
            {
                logger.LogError(emailEx, "Failed to send admin notification for {Email}", created.Email);
            }

            return Results.Created($"/api/admin/athletes/{created.Id}", created);
        });

        // PUT /api/admin/athletes/{id}
        app.MapPut("/api/admin/athletes/{id}", [Authorize] async (
            int id,
            [FromBody] Athlete athlete,
            AthleteService athleteService) =>
        {
            var updated = await athleteService.UpdateAsync(id, athlete);
            return updated != null ? Results.Ok(updated) : Results.NotFound();
        });

        // DELETE /api/admin/athletes/{id}
        app.MapDelete("/api/admin/athletes/{id}", [Authorize] async (
            int id,
            AthleteService athleteService) =>
        {
            var success = await athleteService.DeleteAsync(id);
            return success ? Results.Ok() : Results.NotFound();
        });

        // GET /api/admin/athletes/stats
        app.MapGet("/api/admin/athletes/stats", [Authorize] async (
            AthleteService athleteService,
            [FromQuery] string? search = null,
            [FromQuery] Sex? sex = null,
            [FromQuery] string? weightCategory = null,
            [FromQuery] AthleteStatus? status = null,
            [FromQuery] string? club = null) =>
        {
            var stats = await athleteService.GetStatsAsync(search, sex, weightCategory, status, club);
            return Results.Ok(stats);
        });

        // GET /api/admin/athletes/clubs
        app.MapGet("/api/admin/athletes/clubs", [Authorize] async (
            AthleteService athleteService) =>
        {
            var clubs = await athleteService.GetAllClubsAsync();
            return Results.Ok(clubs);
        });

        // GET /api/admin/athletes/export - Export all athletes with filters and ordering
        app.MapGet("/api/admin/athletes/export", [Authorize] async (
            AthleteService athleteService,
            [FromQuery] string? search = null,
            [FromQuery] Sex? sex = null,
            [FromQuery] string? weightCategory = null,
            [FromQuery] AthleteStatus? status = null,
            [FromQuery] string? club = null,
            [FromQuery] string? orderBy = null,
            [FromQuery] string? orderDirection = null) =>
        {
            var athletes = await athleteService.ExportAllAsync(
                search, sex, weightCategory, status, club, orderBy, orderDirection);

            return Results.Ok(new
            {
                athletes = athletes.Select(a => new
                {
                    a.Id,
                    a.FirstName,
                    a.Surname,
                    a.Email,
                    a.Phone,
                    Sex = a.Sex.ToString(),
                    a.WeightCategory,
                    a.Club,
                    a.TotalWeight,
                    a.RegistrationDate,
                    a.Coach,
                    Status = a.Status.ToString(),
                    a.QrCode,
                    a.CheckinAt,
                    a.CreatedAt,
                    a.UpdatedAt,
                    LiftEntries = a.LiftEntries.Select(e => new
                    {
                        e.Id,
                        e.AthleteId,
                        e.LiftType,
                        e.AttemptNumber,
                        e.Weight,
                        e.UpdatedBy,
                        e.CreatedAt,
                        e.UpdatedAt
                    })
                })
            });
        });

        // POST /api/admin/competiciones/{competicionId}/athletes/raffle
        // Pick N random winners from the Athlete pool for a competition.
        // Mirrors the Inscripcion raffle but operates on the legacy Athlete model.
        app.MapPost("/api/admin/competiciones/{competicionId:int}/athletes/raffle", [Authorize] async (
            int competicionId,
            [FromBody] AthleteRaffleRequest body,
            AthleteRaffleService service,
            ILogger<Program> logger) =>
        {
            try
            {
                var result = await service.RaffleAsync(competicionId, body);
                logger.LogInformation("Athlete raffle draw for competition {CompeticionId}: {Count} winners, fallback={Fallback}",
                    competicionId, result.Winners.Count, result.FallbackReason ?? "none");
                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        winners = result.Winners,
                        fallbackReason = result.FallbackReason
                    }
                });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to run athlete raffle for competition {CompeticionId}", competicionId);
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });
    }
}
