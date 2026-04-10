using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Services;

public class DrawService
{
    private readonly GrCupDbContext _context;
    private readonly ParticipantService _participantService;

    public DrawService(GrCupDbContext context, ParticipantService participantService)
    {
        _context = context;
        _participantService = participantService;
    }

    /// <summary>
    /// Selects a random winner weighted by combined ticket count per email
    /// </summary>
    public async Task<Draw?> SelectRandomWinnerAsync()
    {
        var winner = await _participantService.GetRandomParticipantAsync();
        
        if (winner == null)
            return null;

        // Get combined ticket count across all rows for this email
        var combinedTickets = await _participantService.GetCombinedTicketCountAsync(winner.Email);

        var draw = new Draw
        {
            WinnerEmail = winner.Email,
            WinnerName = $"{winner.FirstName} {winner.Surname}",
            WinnerInstagram = winner.Instagram,
            WinnerTicketCount = combinedTickets,
            DrawDate = DateTime.UtcNow,
            IsConfirmed = false,
            ParticipantId = winner.Id
        };

        _context.Draws.Add(draw);
        await _context.SaveChangesAsync();
        
        return draw;
    }

    /// <summary>
    /// Confirms a draw as the official winner
    /// </summary>
    public async Task<Draw?> ConfirmWinnerAsync(int drawId)
    {
        var draw = await _context.Draws.FindAsync(drawId);
        
        if (draw == null)
            return null;

        draw.IsConfirmed = true;
        await _context.SaveChangesAsync();
        
        return draw;
    }

    /// <summary>
    /// Gets all draws with winner details
    /// </summary>
    public async Task<List<Draw>> GetDrawHistoryAsync()
    {
        return await _context.Draws
            .OrderByDescending(d => d.DrawDate)
            .ToListAsync();
    }

    /// <summary>
    /// Gets a single draw by ID
    /// </summary>
    public async Task<Draw?> GetByIdAsync(int id)
    {
        return await _context.Draws.FindAsync(id);
    }

    /// <summary>
    /// Voids a draw (deletes it to allow re-draw)
    /// </summary>
    public async Task<bool> VoidDrawAsync(int drawId)
    {
        var draw = await _context.Draws.FindAsync(drawId);
        
        if (draw == null)
            return false;

        _context.Draws.Remove(draw);
        await _context.SaveChangesAsync();
        
        return true;
    }

    /// <summary>
    /// Gets the most recent confirmed winner
    /// </summary>
    public async Task<Draw?> GetLatestConfirmedWinnerAsync()
    {
        return await _context.Draws
            .Where(d => d.IsConfirmed)
            .OrderByDescending(d => d.DrawDate)
            .FirstOrDefaultAsync();
    }
}
