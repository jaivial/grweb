using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

public class ParticipantService
{
    private readonly GrCupDbContext _context;

    public ParticipantService(GrCupDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Creates a new participant or throws exception if email already exists
    /// </summary>
    public async Task<Participant> CreateAsync(string firstName, string surname, string email, string instagram, int ticketCount, decimal totalPaid)
    {
        var participant = new Participant
        {
            FirstName = firstName,
            Surname = surname,
            Email = email.ToLowerInvariant(),
            Instagram = instagram,
            TicketCount = ticketCount,
            TotalPaid = totalPaid,
            CreatedAt = DateTime.UtcNow
        };

        _context.Participants.Add(participant);
        await _context.SaveChangesAsync();
        return participant;
    }

    /// <summary>
    /// Updates an existing participant's ticket count and total paid
    /// </summary>
    public async Task<Participant> UpdateAsync(int id, int additionalTickets, decimal additionalPaid)
    {
        var participant = await _context.Participants.FindAsync(id);
        if (participant == null)
            throw new InvalidOperationException($"Participant with ID {id} not found");

        participant.TicketCount += additionalTickets;
        participant.TotalPaid += additionalPaid;

        await _context.SaveChangesAsync();
        return participant;
    }

    /// <summary>
    /// Gets a participant by email address (case-insensitive)
    /// </summary>
    public async Task<Participant?> GetByEmailAsync(string email)
    {
        return await _context.Participants
            .FirstOrDefaultAsync(p => p.Email.ToLower() == email.ToLower());
    }

    /// <summary>
    /// Gets a participant by ID
    /// </summary>
    public async Task<Participant?> GetByIdAsync(int id)
    {
        return await _context.Participants.FindAsync(id);
    }

    /// <summary>
    /// Gets paginated list of participants with optional search filter
    /// </summary>
    public async Task<(List<Participant> Participants, int TotalCount)> GetAllPaginatedAsync(
        int page, 
        int pageSize, 
        string? searchTerm = null)
    {
        var query = _context.Participants.AsQueryable();

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var term = searchTerm.ToLower();
            query = query.Where(p => 
                p.FirstName.ToLower().Contains(term) ||
                p.Surname.ToLower().Contains(term) ||
                p.Email.ToLower().Contains(term) ||
                p.Instagram.ToLower().Contains(term)
            );
        }

        var totalCount = await query.CountAsync();

        var participants = await query
            .OrderByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (participants, totalCount);
    }

    /// <summary>
    /// Gets total count of unique participants
    /// </summary>
    public async Task<int> GetCountAsync()
    {
        return await _context.Participants.CountAsync();
    }

    /// <summary>
    /// Gets total number of tickets sold across all participants
    /// </summary>
    public async Task<int> GetTotalTicketsAsync()
    {
        return await _context.Participants.SumAsync(p => p.TicketCount);
    }

    /// <summary>
    /// Gets total revenue from all ticket sales
    /// </summary>
    public async Task<decimal> GetTotalRevenueAsync()
    {
        return await _context.Participants.SumAsync(p => p.TotalPaid);
    }

    /// <summary>
    /// Increments ticket count for an existing participant or creates new one
    /// </summary>
    public async Task<Participant> CreateOrUpdateAsync(string firstName, string surname, string email, string instagram, int ticketCount, decimal totalPaid)
    {
        var existing = await GetByEmailAsync(email);
        
        if (existing != null)
        {
            return await UpdateAsync(existing.Id, ticketCount, totalPaid);
        }
        else
        {
            return await CreateAsync(firstName, surname, email, instagram, ticketCount, totalPaid);
        }
    }

    /// <summary>
    /// Gets all participants for export (no pagination)
    /// </summary>
    public async Task<List<Participant>> GetAllForExportAsync()
    {
        return await _context.Participants
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();
    }

    /// <summary>
    /// Gets a random participant for winner draw (weighted by ticket count)
    /// </summary>
    public async Task<Participant?> GetRandomParticipantAsync()
    {
        // Get all participants with their ticket counts
        var participants = await _context.Participants.ToListAsync();
        
        if (!participants.Any())
            return null;

        // Create weighted list where each ticket is an entry
        var weightedList = new List<Participant>();
        foreach (var participant in participants)
        {
            for (int i = 0; i < participant.TicketCount; i++)
            {
                weightedList.Add(participant);
            }
        }

        // Select random winner
        var random = new Random();
        var winnerIndex = random.Next(weightedList.Count);
        return weightedList[winnerIndex];
    }
}
