using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class TutorialEndpoints
{
    public static void MapTutorialEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tutorials");

        // GET /api/tutorials/{videoId} — get likes count and comments for a video
        group.MapGet("/{videoId}", async (
            string videoId,
            [FromServices] GrCupDbContext db) =>
        {
            var likes = await db.TutorialInteractions
                .CountAsync(i => i.VideoId == videoId && i.Tipo == "like");

            var comments = await db.TutorialInteractions
                .Where(i => i.VideoId == videoId && i.Tipo == "comment")
                .OrderByDescending(i => i.CreatedAt)
                .Select(i => new
                {
                    i.Id,
                    i.Autor,
                    i.Contenido,
                    i.CreatedAt
                })
                .ToListAsync();

            return Results.Ok(new
            {
                videoId,
                likes,
                comments
            });
        });

        // POST /api/tutorials/{videoId}/like — toggle like (add or remove)
        group.MapPost("/{videoId}/like", async (
            string videoId,
            [FromBody] LikeRequest request,
            [FromServices] GrCupDbContext db) =>
        {
            if (request is null || string.IsNullOrWhiteSpace(request.SessionId))
                return Results.BadRequest(new { error = "SessionId is required" });

            if (videoId.Length > 50 || request.SessionId.Length > 100)
                return Results.BadRequest(new { error = "Invalid tutorial like request" });

            var existing = await db.TutorialInteractions
                .FirstOrDefaultAsync(i =>
                    i.VideoId == videoId &&
                    i.Tipo == "like" &&
                    i.SessionId == request.SessionId);

            if (existing != null)
            {
                // Unlike: remove the existing like
                db.TutorialInteractions.Remove(existing);
                await db.SaveChangesAsync();
                var count = await db.TutorialInteractions
                    .CountAsync(i => i.VideoId == videoId && i.Tipo == "like");
                return Results.Ok(new { liked = false, likes = count });
            }

            // Add like
            db.TutorialInteractions.Add(new TutorialInteraction
            {
                VideoId = videoId,
                Tipo = "like",
                SessionId = request.SessionId
            });
            await db.SaveChangesAsync();
            var newCount = await db.TutorialInteractions
                .CountAsync(i => i.VideoId == videoId && i.Tipo == "like");
            return Results.Ok(new { liked = true, likes = newCount });
        });

        // GET /api/tutorials/{videoId}/liked?sessionId=xxx — check if session has liked
        group.MapGet("/{videoId}/liked", async (
            string videoId,
            [FromQuery] string? sessionId,
            [FromServices] GrCupDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(sessionId))
                return Results.Ok(new { liked = false });

            if (videoId.Length > 50 || sessionId.Length > 100)
                return Results.BadRequest(new { error = "Invalid tutorial liked request" });

            var liked = await db.TutorialInteractions
                .AnyAsync(i =>
                    i.VideoId == videoId &&
                    i.Tipo == "like" &&
                    i.SessionId == sessionId);

            return Results.Ok(new { liked });
        });

        // POST /api/tutorials/{videoId}/comment — add a comment
        group.MapPost("/{videoId}/comment", async (
            string videoId,
            [FromBody] CommentRequest request,
            [FromServices] GrCupDbContext db) =>
        {
            if (request is null || string.IsNullOrWhiteSpace(request.Contenido))
                return Results.BadRequest(new { error = "Comment content is required" });

            if (videoId.Length > 50 || request.Autor?.Length > 100)
                return Results.BadRequest(new { error = "Invalid tutorial comment request" });

            if (request.Contenido.Length > 500)
                return Results.BadRequest(new { error = "Comment too long (max 500 chars)" });

            var comment = new TutorialInteraction
            {
                VideoId = videoId,
                Tipo = "comment",
                Contenido = request.Contenido,
                Autor = string.IsNullOrWhiteSpace(request.Autor) ? "Anonimo" : request.Autor.Trim()
            };

            db.TutorialInteractions.Add(comment);
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                id = comment.Id,
                autor = comment.Autor,
                contenido = comment.Contenido,
                createdAt = comment.CreatedAt
            });
        });
    }
}

// Request DTOs
public record LikeRequest(string SessionId);
public record CommentRequest(string Contenido, string? Autor);
