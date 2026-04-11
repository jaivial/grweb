using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class RaffleConfigEndpoints
{
    public static void MapRaffleConfigEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/raffle/config", async (GrCupDbContext db) =>
        {
            var config = await db.RaffleConfig.FirstOrDefaultAsync();
            if (config == null)
            {
                return Results.Ok(new
                {
                    isEnabled = true,
                    disabledMessage = (string?)null,
                    raffleMethod = 0
                });
            }
            return Results.Ok(new
            {
                isEnabled = config.IsEnabled,
                disabledMessage = config.DisabledMessage,
                raffleMethod = config.RaffleMethod
            });
        });

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
                    RaffleMethod = request.RaffleMethod ?? 0,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                db.RaffleConfig.Add(config);
            }
            else
            {
                config.IsEnabled = request.IsEnabled;
                config.DisabledMessage = request.DisabledMessage;
                if (request.RaffleMethod.HasValue)
                {
                    config.RaffleMethod = request.RaffleMethod.Value;
                }
                config.UpdatedAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync();
            return Results.Ok(new
            {
                isEnabled = config.IsEnabled,
                disabledMessage = config.DisabledMessage,
                raffleMethod = config.RaffleMethod
            });
        });

        app.MapGet("/api/admin/raffle-config", [Authorize] async (GrCupDbContext db) =>
        {
            var config = await db.RaffleConfig.FirstOrDefaultAsync();
            if (config == null)
            {
                return Results.Ok(new
                {
                    isEnabled = true,
                    disabledMessage = (string?)null,
                    raffleMethod = 0
                });
            }
            return Results.Ok(new
            {
                isEnabled = config.IsEnabled,
                disabledMessage = config.DisabledMessage,
                raffleMethod = config.RaffleMethod
            });
        });
    }
}

public record UpdateRaffleConfigRequest(bool IsEnabled, string? DisabledMessage, int? RaffleMethod);
