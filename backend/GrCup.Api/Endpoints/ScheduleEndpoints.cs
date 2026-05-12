using GrCup.Api.Services;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class ScheduleEndpoints
{
    public static void MapScheduleEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/schedules - Public endpoint (no auth)
        // Accepts optional ?slug= to filter by competition
        app.MapGet("/api/schedules", async (
            ScheduleService scheduleService,
            CompeticionService competicionService,
            [FromQuery] Sex? sexCategory = null,
            [FromQuery] string? slug = null) =>
        {
            int? competicionId = null;
            if (!string.IsNullOrEmpty(slug))
            {
                var competicion = await competicionService.GetBySlugAsync(slug);
                competicionId = competicion?.Id;
            }

            var schedules = await scheduleService.GetGroupedByDateAsync(sexCategory, competicionId);
            return Results.Ok(schedules);
        });

        // GET /api/schedules/published - Public: check if schedules are published
        // Accepts optional ?slug= to filter by competition
        app.MapGet("/api/schedules/published", async (
            ScheduleService scheduleService,
            CompeticionService competicionService,
            [FromQuery] string? slug = null) =>
        {
            int? competicionId = null;

            if (!string.IsNullOrEmpty(slug))
            {
                var competicion = await competicionService.GetBySlugAsync(slug);
                competicionId = competicion?.Id;
            }

            var published = await scheduleService.IsPublishedAsync(competicionId);
            return Results.Ok(new { published });
        });

        // GET /api/admin/schedules - List all schedules grouped by date
        // Accepts optional ?competicionId= to filter by competition
        app.MapGet("/api/admin/schedules", [Authorize] async (
            ScheduleService scheduleService,
            [FromQuery] Sex? sexCategory = null,
            [FromQuery] int? competicionId = null) =>
        {
            var schedules = await scheduleService.GetGroupedByDateAsync(sexCategory, competicionId);
            return Results.Ok(schedules);
        });

        // GET /api/admin/schedules/published-config
        // NOTE: Must be registered BEFORE /{id} routes to avoid "published-config" being
        // bound as the {id} parameter.
        // Accepts optional ?competicionId= to get per-competition config
        app.MapGet("/api/admin/schedules/published-config", [Authorize] async (
            ScheduleService scheduleService,
            [FromQuery] int? competicionId = null) =>
        {
            var config = await scheduleService.GetPublishedConfigAsync(competicionId);
            return Results.Ok(new {
                value = config?.Value ?? true,
                dateModified = config?.DateModified
            });
        });

        // PUT /api/admin/schedules/published-config
        // Accepts optional ?competicionId= to set per-competition config
        app.MapPut("/api/admin/schedules/published-config", [Authorize] async (
            ScheduleService scheduleService,
            [FromBody] UpdateSchedulePublishedConfigRequest request,
            [FromQuery] int? competicionId = null) =>
        {
            var config = await scheduleService.SetPublishedConfigAsync(request.Value, competicionId);
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
