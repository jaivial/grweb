using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class ResponsableUrlInscripcionEndpoints
{
    public static void MapResponsableUrlInscripcionEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/responsable-url-inscripciones
        app.MapGet("/api/admin/responsable-url-inscripciones", [Authorize] async (GrCupDbContext db) =>
        {
            var responsable = await db.ResponsableInscripcion.FirstOrDefaultAsync();
            var url = await db.UrlInscripcion.FirstOrDefaultAsync();
            return Results.Ok(new {
                value = responsable?.Value ?? true,
                url = url?.Url ?? null,
                dateModified = responsable?.DateModified
            });
        });

        // PUT /api/admin/responsable-url-inscripciones
        app.MapPut("/api/admin/responsable-url-inscripciones", [Authorize] async (
            GrCupDbContext db,
            [FromBody] UpdateResponsableUrlRequest request) =>
        {
            var responsable = await db.ResponsableInscripcion.FirstOrDefaultAsync();
            if (responsable == null)
            {
                responsable = new ResponsableInscripcion
                {
                    Value = request.Value,
                    DateModified = DateTime.UtcNow
                };
                db.ResponsableInscripcion.Add(responsable);
            }
            else
            {
                responsable.Value = request.Value;
                responsable.DateModified = DateTime.UtcNow;
            }

            var urlInscripcion = await db.UrlInscripcion.FirstOrDefaultAsync();
            if (urlInscripcion == null)
            {
                urlInscripcion = new UrlInscripcion
                {
                    Url = request.Url,
                    DateModified = DateTime.UtcNow
                };
                db.UrlInscripcion.Add(urlInscripcion);
            }
            else
            {
                urlInscripcion.Url = request.Url;
                urlInscripcion.DateModified = DateTime.UtcNow;
            }

            await db.SaveChangesAsync();
            return Results.Ok(new {
                value = responsable.Value,
                url = urlInscripcion.Url,
                dateModified = responsable.DateModified
            });
        });
    }
}

public record UpdateResponsableUrlRequest(bool Value, string? Url);
