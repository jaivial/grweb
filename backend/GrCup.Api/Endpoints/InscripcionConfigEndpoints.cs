using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class InscripcionConfigEndpoints
{
    public static void MapInscripcionConfigEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/inscripcion-config
        app.MapGet("/api/admin/inscripcion-config", [Authorize] async (GrCupDbContext db) =>
        {
            var config = await db.InscripcionConfig.FirstOrDefaultAsync();
            if (config == null)
            {
                // Create default config if it doesn't exist
                config = new InscripcionConfig { Active = true };
                db.InscripcionConfig.Add(config);
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { active = config.Active, url = config.Url });
        });

        // PUT /api/admin/inscripcion-config
        app.MapPut("/api/admin/inscripcion-config", [Authorize] async (
            GrCupDbContext db,
            [FromBody] UpdateInscripcionConfigRequest request) =>
        {
            var config = await db.InscripcionConfig.FirstOrDefaultAsync();
            if (config == null)
            {
                config = new InscripcionConfig
                {
                    Active = request.Active,
                    Url = request.Url,
                    CreatedAt = DateTime.UtcNow,
                    EditedAt = DateTime.UtcNow
                };
                db.InscripcionConfig.Add(config);
            }
            else
            {
                config.Active = request.Active;
                config.Url = request.Url;
                config.EditedAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { active = config.Active, url = config.Url });
        });
    }
}

public record UpdateInscripcionConfigRequest(bool Active, string? Url);
