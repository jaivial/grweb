using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;

namespace GrCup.Api.Services;

public class LiftService
{
    private readonly GrCupDbContext _context;

    public LiftService(GrCupDbContext context)
    {
        _context = context;
    }

    public async Task<List<LiftEntry>?> SetOpenersAsync(
        int athleteId,
        decimal squatWeight,
        decimal benchWeight,
        decimal deadliftWeight,
        string? updatedBy)
    {
        var athlete = await _context.Athletes.FindAsync(athleteId);
        if (athlete == null) return null;

        if (athlete.Status != AthleteStatus.Paid)
            throw new InvalidOperationException("Athlete must have paid status to set openers");

        ValidateWeight(squatWeight, nameof(squatWeight));
        ValidateWeight(benchWeight, nameof(benchWeight));
        ValidateWeight(deadliftWeight, nameof(deadliftWeight));

        var openers = await _context.LiftEntries
            .Where(le => le.AthleteId == athleteId && le.AttemptNumber == 1)
            .ToListAsync();

        var results = new List<LiftEntry>();
        var now = DateTime.UtcNow;

        results.Add(await UpsertOpener(openers, athleteId, LiftType.Squat, squatWeight, updatedBy, now));
        results.Add(await UpsertOpener(openers, athleteId, LiftType.Bench, benchWeight, updatedBy, now));
        results.Add(await UpsertOpener(openers, athleteId, LiftType.Deadlift, deadliftWeight, updatedBy, now));

        await _context.SaveChangesAsync();
        return results;
    }

    public async Task<LiftEntry?> UpdateAttemptAsync(
        int athleteId,
        LiftType liftType,
        int attemptNumber,
        decimal weight,
        string? updatedBy)
    {
        if (attemptNumber < 1 || attemptNumber > 4)
            throw new ArgumentException("Attempt number must be between 1 and 4", nameof(attemptNumber));

        var athlete = await _context.Athletes.FindAsync(athleteId);
        if (athlete == null) return null;

        if (athlete.Status != AthleteStatus.Paid)
            throw new InvalidOperationException("Athlete must have paid status to update attempts");

        ValidateWeight(weight, nameof(weight));

        if (attemptNumber > 1)
        {
            var previousAttempt = await _context.LiftEntries
                .FirstOrDefaultAsync(le =>
                    le.AthleteId == athleteId &&
                    le.LiftType == liftType &&
                    le.AttemptNumber == attemptNumber - 1);

            if (previousAttempt == null)
                throw new InvalidOperationException(
                    $"Previous attempt (attempt {attemptNumber - 1}) does not exist for {liftType}");

            if (weight < previousAttempt.Weight)
                throw new ArgumentException("Weight must be >= previous attempt", nameof(weight));
        }

        var existing = await _context.LiftEntries
            .FirstOrDefaultAsync(le =>
                le.AthleteId == athleteId &&
                le.LiftType == liftType &&
                le.AttemptNumber == attemptNumber);

        var now = DateTime.UtcNow;

        if (existing != null)
        {
            existing.Weight = weight;
            existing.UpdatedBy = updatedBy;
            existing.UpdatedAt = now;
        }
        else
        {
            existing = new LiftEntry
            {
                AthleteId = athleteId,
                LiftType = liftType,
                AttemptNumber = attemptNumber,
                Weight = weight,
                UpdatedBy = updatedBy,
                CreatedAt = now,
                UpdatedAt = now
            };
            _context.LiftEntries.Add(existing);
        }

        await _context.SaveChangesAsync();
        return existing;
    }

    public async Task<List<LiftEntry>> GetOpenersAsync(int athleteId)
    {
        return await _context.LiftEntries
            .Where(le => le.AthleteId == athleteId && le.AttemptNumber == 1)
            .ToListAsync();
    }

    public async Task<List<LiftEntry>> GetAllAttemptsAsync(int athleteId)
    {
        return await _context.LiftEntries
            .Where(le => le.AthleteId == athleteId)
            .OrderBy(le => le.LiftType)
            .ThenBy(le => le.AttemptNumber)
            .ToListAsync();
    }

    public async Task<List<LiftEntry>> GetCompetitionAttemptsAsync()
    {
        return await _context.LiftEntries
            .Include(le => le.Athlete)
            .OrderBy(le => le.Athlete.WeightCategory)
            .ThenBy(le => le.LiftType)
            .ThenBy(le => le.AttemptNumber)
            .ToListAsync();
    }

    public async Task<List<LiftEntry>> GetAuditLogAsync(int athleteId)
    {
        return await _context.LiftEntries
            .Where(le => le.AthleteId == athleteId)
            .OrderByDescending(le => le.UpdatedAt)
            .ToListAsync();
    }

    private async Task<LiftEntry> UpsertOpener(
        List<LiftEntry> existingOpeners,
        int athleteId,
        LiftType liftType,
        decimal weight,
        string? updatedBy,
        DateTime now)
    {
        var existing = existingOpeners
            .FirstOrDefault(le => le.LiftType == liftType);

        if (existing != null)
        {
            existing.Weight = weight;
            existing.UpdatedBy = updatedBy;
            existing.UpdatedAt = now;
            return existing;
        }

        var entry = new LiftEntry
        {
            AthleteId = athleteId,
            LiftType = liftType,
            AttemptNumber = 1,
            Weight = weight,
            UpdatedBy = updatedBy,
            CreatedAt = now,
            UpdatedAt = now
        };

        _context.LiftEntries.Add(entry);
        return entry;
    }

    private static void ValidateWeight(decimal weight, string paramName)
    {
        if (weight < 20 || weight > 500)
            throw new ArgumentException("Weight must be between 20 and 500 kg", paramName);
    }
}
