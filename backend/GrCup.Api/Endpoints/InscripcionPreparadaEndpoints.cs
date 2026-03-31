using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class InscripcionPreparadaEndpoints
{
    public static void MapInscripcionPreparadaEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/inscripcion-preparada
        app.MapGet("/api/admin/inscripcion-preparada", [Authorize] async (GrCupDbContext db) =>
        {
            var config = await db.InscripcionesPreparadas.FirstOrDefaultAsync();
            if (config == null)
            {
                // Create default config if it doesn't exist
                config = new InscripcionPreparada { Preparadas = false };
                db.InscripcionesPreparadas.Add(config);
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { dateTime = config.DateTime, preparadas = config.Preparadas });
        });

        // PUT /api/admin/inscripcion-preparada
        app.MapPut("/api/admin/inscripcion-preparada", [Authorize] async (
            GrCupDbContext db,
            [FromBody] UpdateInscripcionPreparadaRequest request) =>
        {
            var config = await db.InscripcionesPreparadas.FirstOrDefaultAsync();
            if (config == null)
            {
                config = new InscripcionPreparada
                {
                    DateTime = request.DateTime,
                    Preparadas = request.Preparadas
                };
                db.InscripcionesPreparadas.Add(config);
            }
            else
            {
                config.DateTime = request.DateTime;
                config.Preparadas = request.Preparadas;
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { dateTime = config.DateTime, preparadas = config.Preparadas });
        });
    }
}

public record UpdateInscripcionPreparadaRequest(DateTime? DateTime, bool Preparadas);
