using System.Text.Json;
using GrCup.Api.Data;
using GrCup.Api.Hubs;
using GrCup.Api.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Services;

/// <summary>
/// Background worker that dispatches newsletters in throttled batches to avoid
/// being flagged as spam: <c>BatchSize</c> recipients (default 5) every
/// <c>IntervalMinutes</c> (default 10). Progress is persisted in
/// <see cref="NewsletterSendProgress"/> and pushed live over <see cref="NewsletterHub"/>.
/// </summary>
public class NewsletterSendWorker : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(60);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<NewsletterSendWorker> _logger;

    public NewsletterSendWorker(IServiceScopeFactory scopeFactory, ILogger<NewsletterSendWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("NewsletterSendWorker started");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessDueBatchesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "NewsletterSendWorker poll failed");
            }

            try
            {
                await Task.Delay(PollInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task ProcessDueBatchesAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GrCupDbContext>();

        var now = DateTime.UtcNow;
        var dueIds = await db.NewsletterSendProgress
            .Where(p => (p.Status == NewsletterSendStatus.Pending || p.Status == NewsletterSendStatus.InProgress)
                        && (p.NextBatchAt == null || p.NextBatchAt <= now))
            .Select(p => p.Id)
            .ToListAsync(ct);

        foreach (var progressId in dueIds)
        {
            if (ct.IsCancellationRequested) break;
            await SendNextBatchAsync(progressId, ct);
        }
    }

    private async Task SendNextBatchAsync(int progressId, CancellationToken ct)
    {
        // Fresh scope per batch so each gets its own DbContext / EmailService.
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GrCupDbContext>();
        var emailService = scope.ServiceProvider.GetRequiredService<EmailService>();
        var hub = scope.ServiceProvider.GetRequiredService<IHubContext<NewsletterHub>>();

        var progress = await db.NewsletterSendProgress
            .Include(p => p.NewsletterEmail)
            .ThenInclude(n => n.Competicion)
            .FirstOrDefaultAsync(p => p.Id == progressId, ct);
        if (progress == null) return;

        var newsletter = progress.NewsletterEmail;
        var competicion = newsletter.Competicion;

        var pending = DeserializeQueue(progress.PendingRecipients);
        if (pending.Count == 0)
        {
            CompleteProgress(progress, newsletter);
            await db.SaveChangesAsync(ct);
            await BroadcastAsync(hub, progress);
            return;
        }

        if (progress.Status == NewsletterSendStatus.Pending)
        {
            progress.Status = NewsletterSendStatus.InProgress;
            progress.StartedAt ??= DateTime.UtcNow;
        }

        var htmlBody = FerNewsletterTemplate.RenderShell(competicion.Nombre, newsletter.BodyHtml);
        var textBody = FerNewsletterTemplate.ToPlainText(newsletter.BodyHtml);
        var fromName = competicion.Nombre;

        var batch = pending.Take(progress.BatchSize).ToList();
        foreach (var email in batch)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                await emailService.SendNewsletterAsync(
                    competicion.Id, email, null, fromName, newsletter.Subject, htmlBody, textBody);
                progress.SentCount++;
                _logger.LogInformation("Newsletter {Id}: sent to {Email}", newsletter.Id, email);
            }
            catch (Exception ex)
            {
                progress.FailedCount++;
                progress.LastError = ex.Message.Length > 1000 ? ex.Message[..1000] : ex.Message;
                _logger.LogError(ex, "Newsletter {Id}: failed sending to {Email}", newsletter.Id, email);
            }
        }

        var remaining = pending.Skip(batch.Count).ToList();
        progress.PendingRecipients = JsonSerializer.Serialize(remaining);
        progress.UpdatedAt = DateTime.UtcNow;

        if (remaining.Count == 0)
        {
            CompleteProgress(progress, newsletter);
        }
        else
        {
            progress.NextBatchAt = DateTime.UtcNow.AddMinutes(progress.IntervalMinutes);
        }

        await db.SaveChangesAsync(ct);
        await BroadcastAsync(hub, progress);
    }

    private static void CompleteProgress(NewsletterSendProgress progress, NewsletterEmail newsletter)
    {
        progress.Status = NewsletterSendStatus.Completed;
        progress.CompletedAt = DateTime.UtcNow;
        progress.NextBatchAt = null;
        newsletter.Status = progress.FailedCount > 0 && progress.SentCount == 0
            ? NewsletterStatus.Failed
            : NewsletterStatus.Sent;
        newsletter.UpdatedAt = DateTime.UtcNow;
    }

    private static List<string> DeserializeQueue(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<string>();
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static Task BroadcastAsync(IHubContext<NewsletterHub> hub, NewsletterSendProgress progress)
    {
        return hub.BroadcastSendProgressAsync(progress.CompeticionId, NewsletterProgressDto.From(progress));
    }
}

/// <summary>
/// Wire-format snapshot of <see cref="NewsletterSendProgress"/> broadcast over SignalR / returned by the API.
/// </summary>
public record NewsletterProgressDto(
    int NewsletterEmailId,
    int CompeticionId,
    int TotalRecipients,
    int SentCount,
    int FailedCount,
    int BatchSize,
    int IntervalMinutes,
    string Status,
    DateTime? NextBatchAt,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    string? LastError)
{
    public static NewsletterProgressDto From(NewsletterSendProgress p) => new(
        p.NewsletterEmailId,
        p.CompeticionId,
        p.TotalRecipients,
        p.SentCount,
        p.FailedCount,
        p.BatchSize,
        p.IntervalMinutes,
        p.Status,
        p.NextBatchAt,
        p.StartedAt,
        p.CompletedAt,
        p.LastError);
}
