using Microsoft.AspNetCore.SignalR;

namespace GrCup.Api.Hubs;

/// <summary>
/// Real-time channel for the backoffice newsletter page.
/// Clients join a per-competition group to receive draft-history updates
/// and live batch-send progress for that competition's newsletters.
/// </summary>
public class NewsletterHub : Hub
{
    private readonly ILogger<NewsletterHub> _logger;

    public NewsletterHub(ILogger<NewsletterHub> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Subscribe the connection to a competition's newsletter events.
    /// </summary>
    public async Task JoinCompetition(int competicionId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(competicionId));
    }

    /// <summary>
    /// Unsubscribe the connection from a competition's newsletter events.
    /// </summary>
    public async Task LeaveCompetition(int competicionId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(competicionId));
    }

    public static string GroupName(int competicionId) => $"newsletter-comp-{competicionId}";
}

/// <summary>
/// Broadcast helpers for pushing newsletter events from services/workers.
/// </summary>
public static class NewsletterHubExtensions
{
    /// <summary>
    /// Notifies a competition's clients that the draft/sent history changed
    /// (created, updated, deleted, status change).
    /// </summary>
    public static Task BroadcastHistoryChangedAsync(this IHubContext<NewsletterHub> hub, int competicionId)
        => hub.Clients.Group(NewsletterHub.GroupName(competicionId)).SendAsync("NewsletterHistoryChanged");

    /// <summary>
    /// Pushes a batch-send progress snapshot to a competition's clients.
    /// </summary>
    public static Task BroadcastSendProgressAsync(this IHubContext<NewsletterHub> hub, int competicionId, object progress)
        => hub.Clients.Group(NewsletterHub.GroupName(competicionId)).SendAsync("NewsletterSendProgress", progress);
}
