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
            AthleteService athleteService) =>
        {
            var created = await athleteService.CreateAsync(athlete);
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
    }
}
