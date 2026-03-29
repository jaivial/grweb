using GrCup.Api.Services;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

namespace GrCup.Api.Endpoints;

public static class ScheduleEndpoints
{
    public static void MapScheduleEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/schedules - List all schedules
        app.MapGet("/api/admin/schedules", [Authorize] async (
            ScheduleService scheduleService,
            [FromQuery] Sex? sexCategory = null) =>
        {
            var schedules = await scheduleService.GetGroupedByDateAsync(sexCategory);
            return Results.Ok(schedules);
        });

        // GET /api/admin/schedules/{id}
        app.MapGet("/api/admin/schedules/{id}", [Authorize] async (
            int id,
            ScheduleService scheduleService) =>
        {
            var schedule = await scheduleService.GetByIdAsync(id);
            return schedule != null ? Results.Ok(schedule) : Results.NotFound();
        });

        // POST /api/admin/schedules
        app.MapPost("/api/admin/schedules", [Authorize] async (
            [FromBody] Schedule schedule,
            ScheduleService scheduleService) =>
        {
            var created = await scheduleService.CreateAsync(schedule);
            return Results.Created($"/api/admin/schedules/{created.Id}", created);
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
