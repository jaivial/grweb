using System.Text.Json;
using GrCup.Api.Data;
using GrCup.Api.Hubs;
using GrCup.Api.Models;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

/// <summary>
/// Admin/root-only newsletter management for a competition: draft history,
/// CRUD, inline-image CDN migration, and throttled batch sending.
/// </summary>
public static class NewsletterEndpoints
{
    public static void MapNewsletterEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/competiciones/{competicionId:int}/newsletters")
            .RequireAuthorization();

        // List draft/sent history for the competition.
        group.MapGet("/", async (
            int competicionId,
            HttpContext ctx,
            UserManagementService userMgmt,
            NewsletterService service) =>
        {
            var gate = await GateAsync(ctx, userMgmt, competicionId);
            if (gate != null) return gate;

            var items = await service.GetHistoryAsync(competicionId);
            return Results.Ok(new { success = true, data = items.Select(NewsletterListItem.From) });
        });

        // Fetch a single newsletter with progress + media.
        group.MapGet("/{id:int}", async (
            int competicionId,
            int id,
            HttpContext ctx,
            UserManagementService userMgmt,
            NewsletterService service) =>
        {
            var gate = await GateAsync(ctx, userMgmt, competicionId);
            if (gate != null) return gate;

            var entity = await service.GetByIdAsync(competicionId, id);
            if (entity == null)
                return Results.NotFound(new { success = false, message = "Newsletter not found" });

            return Results.Ok(new { success = true, data = NewsletterDetail.From(entity) });
        });

        // Create a new draft.
        group.MapPost("/", async (
            int competicionId,
            [FromBody] SaveNewsletterRequest request,
            HttpContext ctx,
            GrCupDbContext db,
            UserManagementService userMgmt,
            NewsletterService service,
            IHubContext<NewsletterHub> hub) =>
        {
            var gate = await GateAsync(ctx, userMgmt, competicionId);
            if (gate != null) return gate;

            var userEmail = await GetUserEmailAsync(ctx, db);
            var entity = await service.CreateAsync(competicionId, request.Subject ?? "", request.BodyHtml ?? "", userEmail);
            // Persist any inline images supplied on first save.
            var migrated = await service.UpdateDraftAsync(competicionId, entity.Id, request.Subject ?? "", request.BodyHtml ?? "");
            await hub.BroadcastHistoryChangedAsync(competicionId);
            return Results.Ok(new { success = true, data = NewsletterDetail.From(migrated ?? entity) });
        });

        // Save an existing draft (migrates inline images to CDN).
        group.MapPut("/{id:int}", async (
            int competicionId,
            int id,
            [FromBody] SaveNewsletterRequest request,
            HttpContext ctx,
            UserManagementService userMgmt,
            NewsletterService service,
            IHubContext<NewsletterHub> hub) =>
        {
            var gate = await GateAsync(ctx, userMgmt, competicionId);
            if (gate != null) return gate;

            try
            {
                var entity = await service.UpdateDraftAsync(competicionId, id, request.Subject ?? "", request.BodyHtml ?? "");
                if (entity == null)
                    return Results.NotFound(new { success = false, message = "Newsletter not found" });

                await hub.BroadcastHistoryChangedAsync(competicionId);
                return Results.Ok(new { success = true, data = NewsletterDetail.From(entity) });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // Trigger a throttled batch send (saves first, then enqueues all recipients).
        group.MapPost("/{id:int}/send", async (
            int competicionId,
            int id,
            [FromBody] SaveNewsletterRequest request,
            HttpContext ctx,
            GrCupDbContext db,
            UserManagementService userMgmt,
            NewsletterService service,
            IHubContext<NewsletterHub> hub) =>
        {
            var gate = await GateAsync(ctx, userMgmt, competicionId);
            if (gate != null) return gate;

            NewsletterEmail? entity;
            try
            {
                entity = await service.UpdateDraftAsync(competicionId, id, request.Subject ?? "", request.BodyHtml ?? "");
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
            if (entity == null)
                return Results.NotFound(new { success = false, message = "Newsletter not found" });

            var existing = await db.NewsletterSendProgress.FirstOrDefaultAsync(p => p.NewsletterEmailId == id);
            if (existing != null && existing.Status is NewsletterSendStatus.Pending or NewsletterSendStatus.InProgress)
                return Results.BadRequest(new { success = false, message = "This newsletter is already sending." });

            var recipients = await service.ResolveRecipientsAsync(competicionId);
            if (recipients.Count == 0)
                return Results.BadRequest(new { success = false, message = "No recipients found for this competition." });

            if (existing != null)
                db.NewsletterSendProgress.Remove(existing);

            var progress = new NewsletterSendProgress
            {
                NewsletterEmailId = id,
                CompeticionId = competicionId,
                TotalRecipients = recipients.Count,
                SentCount = 0,
                FailedCount = 0,
                BatchSize = 5,
                IntervalMinutes = 10,
                Status = NewsletterSendStatus.Pending,
                PendingRecipients = JsonSerializer.Serialize(recipients),
                NextBatchAt = DateTime.UtcNow, // first batch eligible immediately
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.NewsletterSendProgress.Add(progress);

            entity.Status = NewsletterStatus.Sending;
            entity.SentAt = DateTime.UtcNow;
            entity.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();
            await hub.BroadcastHistoryChangedAsync(competicionId);
            await hub.BroadcastSendProgressAsync(competicionId, NewsletterProgressDto.From(progress));

            return Results.Ok(new { success = true, data = NewsletterProgressDto.From(progress) });
        });

        // Send a one-off test email to a single address (no batching, no status change).
        group.MapPost("/{id:int}/test", async (
            int competicionId,
            int id,
            [FromBody] TestNewsletterRequest request,
            HttpContext ctx,
            GrCupDbContext db,
            UserManagementService userMgmt,
            NewsletterService service,
            EmailService emailService) =>
        {
            var gate = await GateAsync(ctx, userMgmt, competicionId);
            if (gate != null) return gate;

            var email = request.Email?.Trim() ?? "";
            if (email.Length == 0 || !email.Contains('@') || email.Contains(' '))
                return Results.BadRequest(new { success = false, message = "Introduce un email válido." });

            NewsletterEmail? entity;
            try
            {
                // Persist (and migrate inline images) so the test mirrors the real send exactly.
                entity = await service.UpdateDraftAsync(competicionId, id, request.Subject ?? "", request.BodyHtml ?? "");
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
            if (entity == null)
                return Results.NotFound(new { success = false, message = "Newsletter not found" });

            var competicionNombre = await db.Competiciones
                .Where(c => c.Id == competicionId)
                .Select(c => c.Nombre)
                .FirstOrDefaultAsync() ?? "Newsletter";

            var htmlBody = FerNewsletterTemplate.RenderShell(competicionNombre, entity.BodyHtml);
            var textBody = FerNewsletterTemplate.ToPlainText(entity.BodyHtml);
            var subject = string.IsNullOrWhiteSpace(entity.Subject) ? "Newsletter" : $"[PRUEBA] {entity.Subject}";

            try
            {
                await emailService.SendNewsletterAsync(
                    competicionId, email, null, competicionNombre, subject, htmlBody, textBody);
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { success = false, message = $"No se pudo enviar el email de prueba: {ex.Message}" });
            }

            return Results.Ok(new { success = true, data = NewsletterDetail.From(entity), message = $"Email de prueba enviado a {email}" });
        });
    }

    /// <summary>
    /// Returns null when the caller is authorized (root or competition admin),
    /// otherwise an Unauthorized/Forbid result.
    /// </summary>
    private static async Task<IResult?> GateAsync(HttpContext ctx, UserManagementService userMgmt, int competicionId)
    {
        var userId = ctx.User.GetUserId();
        if (!userId.HasValue) return Results.Unauthorized();
        if (!await userMgmt.CanManageUsersAsync(userId.Value, competicionId)) return Results.Forbid();
        return null;
    }

    private static async Task<string?> GetUserEmailAsync(HttpContext ctx, GrCupDbContext db)
    {
        var userId = ctx.User.GetUserId();
        if (!userId.HasValue) return null;
        return await db.Usuarios.Where(u => u.Id == userId.Value).Select(u => u.Email).FirstOrDefaultAsync();
    }
}

public record SaveNewsletterRequest(string? Subject, string? BodyHtml);

public record TestNewsletterRequest(string? Subject, string? BodyHtml, string? Email);

public record NewsletterListItem(
    int Id,
    int CompeticionId,
    string Subject,
    string Status,
    string? CreatedByEmail,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? SentAt,
    NewsletterProgressDto? Progress)
{
    public static NewsletterListItem From(NewsletterEmail n) => new(
        n.Id, n.CompeticionId, n.Subject, n.Status, n.CreatedByEmail,
        n.CreatedAt, n.UpdatedAt, n.SentAt,
        n.SendProgress == null ? null : NewsletterProgressDto.From(n.SendProgress));
}

public record NewsletterDetail(
    int Id,
    int CompeticionId,
    string Subject,
    string BodyHtml,
    string Status,
    string? CreatedByEmail,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? SentAt,
    NewsletterProgressDto? Progress)
{
    public static NewsletterDetail From(NewsletterEmail n) => new(
        n.Id, n.CompeticionId, n.Subject, n.BodyHtml, n.Status, n.CreatedByEmail,
        n.CreatedAt, n.UpdatedAt, n.SentAt,
        n.SendProgress == null ? null : NewsletterProgressDto.From(n.SendProgress));
}
