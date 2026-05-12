using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;

namespace GrCup.Api.Services;

public class ScheduleService
{
    private readonly GrCupDbContext _context;

    public ScheduleService(GrCupDbContext context)
    {
        _context = context;
    }

    public async Task<Schedule> CreateAsync(Schedule schedule)
    {
        schedule.CreatedAt = DateTime.UtcNow;
        schedule.UpdatedAt = DateTime.UtcNow;
        _context.Schedules.Add(schedule);
        await _context.SaveChangesAsync();
        return schedule;
    }

    public async Task<Schedule?> UpdateAsync(int id, Schedule schedule)
    {
        var existing = await _context.Schedules.FindAsync(id);
        if (existing == null) return null;

        existing.SexCategory = schedule.SexCategory;
        existing.WeightCategory = schedule.WeightCategory;
        existing.Date = schedule.Date;
        existing.StartTime = schedule.StartTime;
        existing.EndTime = schedule.EndTime;
        existing.CompeticionId = schedule.CompeticionId;
        existing.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var schedule = await _context.Schedules.FindAsync(id);
        if (schedule == null) return false;

        _context.Schedules.Remove(schedule);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Schedule?> GetByIdAsync(int id)
    {
        return await _context.Schedules.FindAsync(id);
    }

    /// <summary>
    /// Gets all schedules, optionally filtered by competition.
    /// </summary>
    public async Task<List<Schedule>> GetAllAsync(int? competicionId = null)
    {
        var query = _context.Schedules.AsQueryable();

        if (competicionId.HasValue)
        {
            query = query.Where(s => s.CompeticionId == competicionId.Value);
        }

        return await query
            .OrderBy(s => s.Date)
            .ThenBy(s => s.StartTime)
            .ToListAsync();
    }

    /// <summary>
    /// Gets schedules filtered by sex, weight, and optionally by competition.
    /// </summary>
    public async Task<List<Schedule>> GetBySexAndWeightAsync(Sex sexCategory, string weightCategory, int? competicionId = null)
    {
        var query = _context.Schedules.AsQueryable();

        if (competicionId.HasValue)
        {
            query = query.Where(s => s.CompeticionId == competicionId.Value);
        }

        return await query
            .Where(s => s.SexCategory == sexCategory && s.WeightCategory == weightCategory)
            .OrderBy(s => s.Date)
            .ThenBy(s => s.StartTime)
            .ToListAsync();
    }

    /// <summary>
    /// Checks if schedules are published for a specific competition.
    /// Falls back to global config if no competition-specific config exists.
    /// </summary>
    public async Task<bool> IsPublishedAsync(int? competicionId = null)
    {
        if (competicionId.HasValue)
        {
            var compConfig = await _context.SchedulePublishedConfig
                .FirstOrDefaultAsync(c => c.CompeticionId == competicionId.Value);
            if (compConfig != null)
                return compConfig.Value;
        }

        // Fallback to global config
        var globalConfig = await _context.SchedulePublishedConfig
            .FirstOrDefaultAsync(c => c.CompeticionId == null);
        return globalConfig?.Value ?? true;
    }

    /// <summary>
    /// Gets schedules grouped by date, optionally filtered by sex and competition.
    /// </summary>
    public async Task<List<ScheduleGroupedByDate>> GetGroupedByDateAsync(Sex? sexCategory = null, int? competicionId = null)
    {
        var query = _context.Schedules.AsQueryable();

        if (competicionId.HasValue)
        {
            query = query.Where(s => s.CompeticionId == competicionId.Value);
        }

        if (sexCategory.HasValue)
        {
            query = query.Where(s => s.SexCategory == sexCategory.Value);
        }

        var schedules = await query
            .OrderBy(s => s.Date)
            .ThenBy(s => s.StartTime)
            .ToListAsync();

        return schedules
            .GroupBy(s => s.Date)
            .Select(g => new ScheduleGroupedByDate
            {
                Date = g.Key,
                Schedules = g.ToList()
            })
            .ToList();
    }

    /// <summary>
    /// Gets the published config for a specific competition.
    /// Falls back to global config if no competition-specific config exists.
    /// </summary>
    public async Task<SchedulePublishedConfig?> GetPublishedConfigAsync(int? competicionId = null)
    {
        if (competicionId.HasValue)
        {
            var compConfig = await _context.SchedulePublishedConfig
                .FirstOrDefaultAsync(c => c.CompeticionId == competicionId.Value);
            if (compConfig != null)
                return compConfig;
        }

        // Fallback to global config
        return await _context.SchedulePublishedConfig
            .FirstOrDefaultAsync(c => c.CompeticionId == null);
    }

    /// <summary>
    /// Sets the published config for a specific competition.
    /// Creates a new config if one does not exist.
    /// </summary>
    public async Task<SchedulePublishedConfig> SetPublishedConfigAsync(bool value, int? competicionId = null)
    {
        SchedulePublishedConfig? config = null;

        if (competicionId.HasValue)
        {
            config = await _context.SchedulePublishedConfig
                .FirstOrDefaultAsync(c => c.CompeticionId == competicionId.Value);
        }

        if (config == null)
        {
            config = new SchedulePublishedConfig
            {
                CompeticionId = competicionId,
                Value = value,
                DateModified = DateTime.UtcNow
            };
            _context.SchedulePublishedConfig.Add(config);
        }
        else
        {
            config.Value = value;
            config.DateModified = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return config;
    }
}

public class ScheduleGroupedByDate
{
    public DateOnly Date { get; set; }
    public List<Schedule> Schedules { get; set; } = [];
}
