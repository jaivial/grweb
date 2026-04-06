using GrCup.Api.Services;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;
using GrCup.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class ScheduleEndpoints
{
    public static void MapScheduleEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/schedules - Public endpoint (no auth)
        app.MapGet("/api/schedules", async (
            ScheduleService scheduleService,
            [FromQuery] Sex? sexCategory = null) =>
        {
            var schedules = await scheduleService.GetGroupedByDateAsync(sexCategory);
            return Results.Ok(schedules);
        });

        // GET /api/admin/schedules - List all schedules grouped by date
        app.MapGet("/api/admin/schedules", [Authorize] async (
            ScheduleService scheduleService,
            [FromQuery] Sex? sexCategory = null) =>
        {
            var schedules = await scheduleService.GetGroupedByDateAsync(sexCategory);
            return Results.Ok(schedules);
        });

        // GET /api/admin/schedules/published-config
        // NOTE: Must be registered BEFORE /{id} routes to avoid "published-config" being
        // bound as the {id} parameter.
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

        // POST /api/admin/schedules
        app.MapPost("/api/admin/schedules", [Authorize] async (
            [FromBody] Schedule schedule,
            ScheduleService scheduleService) =>
        {
            var created = await scheduleService.CreateAsync(schedule);
            return Results.Created($"/api/admin/schedules/{created.Id}", created);
        });

        // GET /api/admin/schedules/{id}
        app.MapGet("/api/admin/schedules/{id}", [Authorize] async (
            int id,
            ScheduleService scheduleService) =>
        {
            var schedule = await scheduleService.GetByIdAsync(id);
            return schedule != null ? Results.Ok(schedule) : Results.NotFound();
        });

        // PUT /api/admin/schedules/{id}
        app.MapPut("/api/admin/schedules/{id}", [Authorize] async (
            int id,
            [FromBody] Schedule schedule,
            ScheduleService scheduleService) =>
        {
            var updated = await scheduleService.UpdateAsync(id, schedule);
            return updated != null ? Results.Ok(updated) : Results.NotFound();
        });

        // DELETE /api/admin/schedules/{id}
        app.MapDelete("/api/admin/schedules/{id}", [Authorize] async (
            int id,
            ScheduleService scheduleService) =>
        {
            var success = await scheduleService.DeleteAsync(id);
            return success ? Results.Ok() : Results.NotFound();
        });
    }
}

public record UpdateSchedulePublishedConfigRequest(bool Value);
