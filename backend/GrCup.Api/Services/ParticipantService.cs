using System.Security.Cryptography;
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
    public async Task<Participant> CreateAsync(
        string firstName,
        string surname,
        string email,
        string instagram,
        int ticketCount,
        decimal totalPaid,
        string? phone = null,
        decimal? price = null,
        bool isPaid = true,
        string? paymentMethod = null,
        string? stripeSessionId = null)
    {
        var participant = new Participant
        {
            FirstName = firstName,
            Surname = surname,
            Email = email.ToLowerInvariant(),
            Instagram = instagram,
            TicketCount = ticketCount,
            TotalPaid = totalPaid,
            CreatedAt = DateTime.UtcNow,
            Phone = phone,
            Price = price,
            IsPaid = isPaid,
            PaymentMethod = paymentMethod,
            DateModified = DateTime.UtcNow,
            StripeSessionId = stripeSessionId
        };

        _context.Participants.Add(participant);
        await _context.SaveChangesAsync();
        return participant;
    }

    /// <summary>
    /// Updates an existing participant's ticket count, total paid, and payment fields
    /// </summary>
    public async Task<Participant> UpdateAsync(
        int id,
        int additionalTickets,
        decimal additionalPaid,
        bool? isPaid = null,
        string? paymentMethod = null,
        string? stripeSessionId = null,
        decimal? price = null)
    {
        var participant = await _context.Participants.FindAsync(id);
        if (participant == null)
            throw new InvalidOperationException($"Participant with ID {id} not found");

        participant.TicketCount += additionalTickets;
        participant.TotalPaid += additionalPaid;

        if (isPaid.HasValue)
            participant.IsPaid = isPaid.Value;
        if (paymentMethod != null)
            participant.PaymentMethod = paymentMethod;
        if (stripeSessionId != null)
            participant.StripeSessionId = stripeSessionId;
        if (price.HasValue)
            participant.Price = price;

        participant.DateModified = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return participant;
    }

    /// <summary>
    /// Checks if a Stripe session has already been processed
    /// </summary>
    public async Task<bool> IsSessionProcessedAsync(string sessionId)
    {
        return await _context.Participants
            .AnyAsync(p => p.StripeSessionId == sessionId);
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
    /// Gets a participant by email + paymentMethod + isPaid combination
    /// </summary>
    public async Task<Participant?> GetByEmailAndMethodAsync(string email, string paymentMethod, bool isPaid)
    {
        var normalEmail = email.ToLowerInvariant();
        var normalMethod = paymentMethod.ToLowerInvariant();
        return await _context.Participants
            .FirstOrDefaultAsync(p =>
                p.Email.ToLower() == normalEmail &&
                p.PaymentMethod != null &&
                p.PaymentMethod.ToLower() == normalMethod &&
                p.IsPaid == isPaid);
    }

    /// <summary>
    /// Gets a participant by ID
    /// </summary>
    public async Task<Participant?> GetByIdAsync(int id)
    {
        return await _context.Participants.FindAsync(id);
    }

    /// <summary>
    /// Gets paginated list of participants with optional search, sort, and filter
    /// </summary>
    public async Task<(List<Participant> Participants, int TotalCount)> GetAllPaginatedAsync(
        int page,
        int pageSize,
        string? searchTerm = null,
        string sortBy = "createdAt",
        string sortOrder = "desc",
        bool? isPaid = null,
        string? paymentMethod = null)
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

        if (isPaid.HasValue)
        {
            query = query.Where(p => p.IsPaid == isPaid.Value);
        }

        if (!string.IsNullOrWhiteSpace(paymentMethod))
        {
            query = query.Where(p => p.PaymentMethod != null && p.PaymentMethod.ToLower() == paymentMethod.ToLower());
        }

        var totalCount = await query.CountAsync();

        var sortField = sortBy.ToLowerInvariant();
        var ascending = sortOrder.ToLowerInvariant() == "asc";

        IOrderedQueryable<Participant> ordered;
        switch (sortField)
        {
            case "ticketcount":
                ordered = ascending
                    ? query.OrderBy(p => p.TicketCount)
                    : query.OrderByDescending(p => p.TicketCount);
                break;
            case "name":
                ordered = ascending
                    ? query.OrderBy(p => p.FirstName).ThenBy(p => p.Surname)
                    : query.OrderByDescending(p => p.FirstName).ThenByDescending(p => p.Surname);
                break;
            default:
                ordered = ascending
                    ? query.OrderBy(p => p.CreatedAt)
                    : query.OrderByDescending(p => p.CreatedAt);
                break;
        }

        var participants = await ordered
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
    /// Gets total revenue grouped by payment method
    /// </summary>
    public async Task<Dictionary<string, decimal>> GetRevenueByPaymentMethodAsync()
    {
        return await _context.Participants
            .GroupBy(p => p.PaymentMethod ?? "unknown")
            .ToDictionaryAsync(g => g.Key.ToLowerInvariant(), g => g.Sum(p => p.TotalPaid));
    }

    /// <summary>
    /// Creates a new manual participant with full field support (cash/bank/stripe payments)
    /// </summary>
    public async Task<Participant> CreateManualAsync(
        string firstName,
        string surname,
        string email,
        string instagram,
        int ticketCount,
        decimal totalPaid,
        string? phone,
        decimal price,
        bool isPaid,
        string paymentMethod)
    {
        var participant = new Participant
        {
            FirstName = firstName,
            Surname = surname,
            Email = email.ToLowerInvariant(),
            Instagram = instagram,
            TicketCount = ticketCount,
            TotalPaid = totalPaid,
            CreatedAt = DateTime.UtcNow,
            Phone = phone,
            Price = price,
            IsPaid = isPaid,
            PaymentMethod = paymentMethod.ToLowerInvariant(),
            DateModified = DateTime.UtcNow
        };

        _context.Participants.Add(participant);
        await _context.SaveChangesAsync();
        return participant;
    }

    /// <summary>
    /// Increments ticket count for an existing participant or creates new one.
    /// Groups by (email, paymentMethod) so different payment methods create separate records.
    /// </summary>
    public async Task<Participant> CreateOrUpdateAsync(
        string firstName,
        string surname,
        string email,
        string instagram,
        int ticketCount,
        decimal totalPaid,
        string? phone = null,
        decimal? price = null,
        bool isPaid = true,
        string? paymentMethod = null,
        string? stripeSessionId = null)
    {
        // Lookup by email + paymentMethod to group same-method entries together
        Participant? existing = null;
        if (!string.IsNullOrEmpty(paymentMethod))
        {
            existing = await GetByEmailAndMethodAsync(email, paymentMethod, isPaid);
        }
        else
        {
            existing = await GetByEmailAsync(email);
        }

        if (existing != null)
        {
            return await UpdateAsync(existing.Id, ticketCount, totalPaid, isPaid, paymentMethod, stripeSessionId, price);
        }
        else
        {
            return await CreateAsync(firstName, surname, email, instagram, ticketCount, totalPaid, phone, price, isPaid, paymentMethod, stripeSessionId);
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
    /// Gets a random participant for winner draw (weighted by combined ticket count per email)
    /// </summary>
    public async Task<Participant?> GetRandomParticipantAsync()
    {
        var participants = await _context.Participants.ToListAsync();

        if (!participants.Any())
            return null;

        // Group by email and sum tickets per person
        var grouped = participants
            .GroupBy(p => p.Email.ToLower())
            .Select(g => new {
                Email = g.Key,
                TotalTickets = g.Sum(p => p.TicketCount),
                Representative = g.OrderByDescending(p => p.TicketCount).First()
            })
            .ToList();

        var totalTickets = grouped.Sum(g => g.TotalTickets);
        if (totalTickets == 0)
            return null;

        var bytes = new byte[4];
        RandomNumberGenerator.Fill(bytes);
        var randomValue = (Math.Abs(BitConverter.ToInt32(bytes)) % totalTickets) + 1;

        var cumulative = 0;
        foreach (var g in grouped)
        {
            cumulative += g.TotalTickets;
            if (randomValue <= cumulative)
                return g.Representative;
        }

        return grouped.LastOrDefault()?.Representative;
    }

    /// <summary>
    /// Gets the combined ticket count for a given email across all rows
    /// </summary>
    public async Task<int> GetCombinedTicketCountAsync(string email)
    {
        return await _context.Participants
            .Where(p => p.Email.ToLower() == email.ToLower())
            .SumAsync(p => p.TicketCount);
    }

    /// <summary>
    /// Updates all fields of an existing participant
    /// </summary>
    public async Task<Participant?> UpdateFullAsync(
        int id,
        string firstName,
        string surname,
        string email,
        string instagram,
        int ticketCount,
        decimal totalPaid,
        string? phone,
        decimal? price,
        bool isPaid,
        string? paymentMethod)
    {
        var participant = await _context.Participants.FindAsync(id);
        if (participant == null)
            return null;

        participant.FirstName = firstName;
        participant.Surname = surname;
        participant.Email = email.ToLowerInvariant();
        participant.Instagram = instagram;
        participant.TicketCount = ticketCount;
        participant.TotalPaid = totalPaid;
        participant.Phone = phone;
        participant.Price = price;
        participant.IsPaid = isPaid;
        participant.PaymentMethod = paymentMethod;
        participant.DateModified = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return participant;
    }

    /// <summary>
    /// Deletes a participant by ID
    /// </summary>
    public async Task<bool> DeleteAsync(int id)
    {
        var participant = await _context.Participants.FindAsync(id);
        if (participant == null)
            return false;

        _context.Participants.Remove(participant);
        await _context.SaveChangesAsync();
        return true;
    }
}
