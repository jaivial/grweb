using Microsoft.AspNetCore.SignalR;

namespace GrCup.Api.Hubs;

public class ParticipantsHub : Hub
{
    private readonly ILogger<ParticipantsHub> _logger;

    public ParticipantsHub(ILogger<ParticipantsHub> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Called when a client connects to the hub
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    /// <summary>
    /// Called when a client disconnects from the hub
    /// </summary>
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception != null)
        {
            _logger.LogWarning(exception, "Client disconnected with error: {ConnectionId}", Context.ConnectionId);
        }
        else
        {
            _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        }
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Client can request current participant count
    /// </summary>
    public async Task RequestParticipantCount(int count)
    {
        await Clients.Caller.SendAsync("ParticipantCountUpdated", count);
    }
}

/// <summary>
/// Static class to help broadcast messages from outside the hub
/// </summary>
public static class ParticipantsHubExtensions
{
    /// <summary>
    /// Broadcasts updated participant count to all connected clients
    /// </summary>
    public static async Task BroadcastParticipantCountAsync(this IHubContext<ParticipantsHub> hubContext, int count)
    {
        await hubContext.Clients.All.SendAsync("ParticipantCountUpdated", count);
    }

    /// <summary>
    /// Broadcasts winner announcement to all connected clients
    /// </summary>
    public static async Task BroadcastWinnerAsync(this IHubContext<ParticipantsHub> hubContext, object winner)
    {
        await hubContext.Clients.All.SendAsync("WinnerAnnounced", winner);
    }
}
