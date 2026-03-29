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

    public async Task<List<Schedule>> GetAllAsync()
    {
        return await _context.Schedules
            .OrderBy(s => s.Date)
            .ThenBy(s => s.StartTime)
            .ToListAsync();
    }

    public async Task<List<ScheduleGroupedByDate>> GetGroupedByDateAsync(Sex? sexCategory = null)
    {
        var query = _context.Schedules.AsQueryable();

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
}

public class ScheduleGroupedByDate
{
    public DateOnly Date { get; set; }
    public List<Schedule> Schedules { get; set; } = [];
}
