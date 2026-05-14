using GrCup.Api.Models.Enums;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;

namespace GrCup.Api.Endpoints;

public static class LiftEndpoints
{
    public static void MapLiftEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/admin/athletes/{athleteId}/openers - Set/update openers
        app.MapPost("/api/admin/athletes/{athleteId}/openers", [Authorize] async (
            int athleteId,
            SetOpenersRequest body,
            LiftService liftService,
            HttpContext context) =>
        {
            var username = context.User.Identity?.Name;
            try
            {
                var openers = await liftService.SetOpenersAsync(
                    athleteId, body.SquatWeight, body.BenchWeight, body.DeadliftWeight, username);
                return openers != null
                    ? Results.Ok(new { success = true, data = openers })
                    : Results.NotFound(new { success = false, message = "Athlete not found" });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /api/admin/athletes/{athleteId}/openers - Get openers for athlete
        app.MapGet("/api/admin/athletes/{athleteId}/openers", [Authorize] async (
            int athleteId,
            LiftService liftService) =>
        {
            var openers = await liftService.GetOpenersAsync(athleteId);
            return Results.Ok(new { success = true, data = openers });
        });

        // PUT /api/admin/athletes/{athleteId}/attempts/{liftType}/{attemptNumber} - Update specific attempt
        app.MapPut("/api/admin/athletes/{athleteId}/attempts/{liftType}/{attemptNumber}", [Authorize] async (
            int athleteId,
            string liftType,
            int attemptNumber,
            UpdateAttemptRequest body,
            LiftService liftService,
            HttpContext context) =>
        {
            if (!Enum.TryParse<LiftType>(liftType, ignoreCase: true, out var parsedLiftType))
                return Results.BadRequest(new { success = false, message = $"Invalid lift type: {liftType}. Must be Squat, Bench, or Deadlift." });

            var username = context.User.Identity?.Name;
            try
            {
                var entry = await liftService.UpdateAttemptAsync(
                    athleteId, parsedLiftType, attemptNumber, body.Weight, username);
                return entry != null
                    ? Results.Ok(new { success = true, data = entry })
                    : Results.NotFound(new { success = false, message = "Athlete not found" });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // GET /api/admin/athletes/{athleteId}/attempts - Get all attempts for athlete
        app.MapGet("/api/admin/athletes/{athleteId}/attempts", [Authorize] async (
            int athleteId,
            LiftService liftService) =>
        {
            var attempts = await liftService.GetAllAttemptsAsync(athleteId);
            return Results.Ok(new { success = true, data = attempts });
        });

        // GET /api/admin/attempts - Get ALL attempts for competition (judge table)
        app.MapGet("/api/admin/attempts", [Authorize] async (
            LiftService liftService) =>
        {
            var attempts = await liftService.GetCompetitionAttemptsAsync();
            return Results.Ok(new { success = true, data = attempts });
        });

        // GET /api/admin/athletes/{athleteId}/audit - Get audit log for athlete
        app.MapGet("/api/admin/athletes/{athleteId}/audit", [Authorize] async (
            int athleteId,
            LiftService liftService) =>
        {
            var auditLog = await liftService.GetAuditLogAsync(athleteId);
            return Results.Ok(new { success = true, data = auditLog });
        });
    }
}

public record SetOpenersRequest(decimal SquatWeight, decimal BenchWeight, decimal DeadliftWeight);
public record UpdateAttemptRequest(decimal Weight);
