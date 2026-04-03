using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class SchedulePublishedConfigEndpoints
{
    public static void MapSchedulePublishedConfigEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/schedules/published-config
        app.MapGet("/api/admin/schedules/published-config", [Authorize] async (GrCupDbContext db) =>
        {
            var config = await db.SchedulePublishedConfig.FirstOrDefaultAsync();
            return Results.Ok(new {
                value = config?.Value ?? true,
                dateModified = config?.DateModified
            });
        });

        // PUT /api/admin/schedules/published-config
        app.MapPut("/api/admin/schedules/published-config", [Authorize] async (
            GrCupDbContext db,
            [FromBody] UpdateSchedulePublishedConfigRequest request) =>
        {
            var config = await db.SchedulePublishedConfig.FirstOrDefaultAsync();
            if (config == null)
            {
                config = new SchedulePublishedConfig
                {
                    Value = request.Value,
                    DateModified = DateTime.UtcNow
                };
                db.SchedulePublishedConfig.Add(config);
            }
            else
            {
                config.Value = request.Value;
                config.DateModified = DateTime.UtcNow;
            }

            await db.SaveChangesAsync();
            return Results.Ok(new {
                value = config.Value,
                dateModified = config.DateModified
            });
        });
    }
}

public record UpdateSchedulePublishedConfigRequest(bool Value);
