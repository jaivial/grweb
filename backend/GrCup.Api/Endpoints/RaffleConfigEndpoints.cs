using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class RaffleConfigEndpoints
{
    // Public GET — used by frontend to show/hide raffle form
    // GET /api/raffle/config
    public static void MapRaffleConfigEndpoints(this IEndpointRouteBuilder app)
    {
        // Public: returns current raffle status
        app.MapGet("/api/raffle/config", async (GrCupDbContext db) =>
        {
            var config = await db.RaffleConfig.FirstOrDefaultAsync();
            if (config == null)
            {
                // Default: raffle is enabled
                return Results.Ok(new { isEnabled = true, disabledMessage = (string?)null });
            }
            return Results.Ok(new { isEnabled = config.IsEnabled, disabledMessage = config.DisabledMessage });
        });

        // Admin: update raffle config
        // PUT /api/admin/raffle-config
        app.MapPut("/api/admin/raffle-config", [Authorize] async (
            GrCupDbContext db,
            [FromBody] UpdateRaffleConfigRequest request) =>
        {
            var config = await db.RaffleConfig.FirstOrDefaultAsync();
            if (config == null)
            {
                config = new RaffleConfig
                {
                    IsEnabled = request.IsEnabled,
                    DisabledMessage = request.DisabledMessage,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                db.RaffleConfig.Add(config);
            }
            else
            {
                config.IsEnabled = request.IsEnabled;
                config.DisabledMessage = request.DisabledMessage;
                config.UpdatedAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { isEnabled = config.IsEnabled, disabledMessage = config.DisabledMessage });
        });

        // Admin: get full raffle config
        // GET /api/admin/raffle-config
        app.MapGet("/api/admin/raffle-config", [Authorize] async (GrCupDbContext db) =>
        {
            var config = await db.RaffleConfig.FirstOrDefaultAsync();
            if (config == null)
            {
                return Results.Ok(new { isEnabled = true, disabledMessage = (string?)null });
            }
            return Results.Ok(new { isEnabled = config.IsEnabled, disabledMessage = config.DisabledMessage });
        });
    }
}

public record UpdateRaffleConfigRequest(bool IsEnabled, string? DisabledMessage);
