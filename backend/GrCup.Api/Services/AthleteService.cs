using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;

namespace GrCup.Api.Services;

public class AthleteService
{
    private readonly GrCupDbContext _context;

    public AthleteService(GrCupDbContext context)
    {
        _context = context;
    }

    public async Task<Athlete> CreateAsync(Athlete athlete)
    {
        athlete.CreatedAt = DateTime.UtcNow;
        athlete.UpdatedAt = DateTime.UtcNow;
        _context.Athletes.Add(athlete);
        await _context.SaveChangesAsync();
        return athlete;
    }

    public async Task<Athlete?> UpdateAsync(int id, Athlete athlete)
    {
        var existing = await _context.Athletes.FindAsync(id);
        if (existing == null) return null;

        existing.FirstName = athlete.FirstName;
        existing.Surname = athlete.Surname;
        existing.Email = athlete.Email;
        existing.Phone = athlete.Phone;
        existing.Sex = athlete.Sex;
        existing.WeightCategory = athlete.WeightCategory;
        existing.Club = athlete.Club;
        existing.TotalWeight = athlete.TotalWeight;
        existing.RegistrationDate = athlete.RegistrationDate;
        existing.Coach = athlete.Coach;
        existing.Status = athlete.Status;
        existing.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return existing;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var athlete = await _context.Athletes.FindAsync(id);
        if (athlete == null) return false;

        _context.Athletes.Remove(athlete);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Athlete?> GetByIdAsync(int id)
    {
        return await _context.Athletes
            .Include(a => a.LiftEntries)
            .FirstOrDefaultAsync(a => a.Id == id);
    }

    public async Task<(List<Athlete> Athletes, int TotalCount)> GetAllPaginatedAsync(
        int page,
        int pageSize,
        string? searchTerm = null,
        Sex? sex = null,
        string? weightCategory = null,
        AthleteStatus? status = null,
        string? club = null)
    {
        var query = _context.Athletes.AsQueryable();

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var term = searchTerm.ToLower();
            query = query.Where(a =>
                a.FirstName.ToLower().Contains(term) ||
                a.Surname.ToLower().Contains(term) ||
                a.Email.ToLower().Contains(term));
        }

        if (sex.HasValue)
        {
            query = query.Where(a => a.Sex == sex.Value);
        }

        if (!string.IsNullOrWhiteSpace(weightCategory))
        {
            query = query.Where(a => a.WeightCategory == weightCategory);
        }

        if (status.HasValue)
        {
            query = query.Where(a => a.Status == status.Value);
        }

        if (!string.IsNullOrWhiteSpace(club))
        {
            query = query.Where(a => a.Club != null && a.Club.ToLower() == club.ToLower());
        }

        var totalCount = await query.CountAsync();

        var athletes = await query
            .Include(a => a.LiftEntries)
            .OrderByDescending(a => a.RegistrationDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (athletes, totalCount);
    }

    public async Task<AthleteStats> GetStatsAsync(
        string? searchTerm = null,
        Sex? sex = null,
        string? weightCategory = null,
        AthleteStatus? status = null,
        string? club = null)
    {
        var query = _context.Athletes.AsQueryable();

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var term = searchTerm.ToLower();
            query = query.Where(a =>
                a.FirstName.ToLower().Contains(term) ||
                a.Surname.ToLower().Contains(term) ||
                a.Email.ToLower().Contains(term));
        }

        if (sex.HasValue)
        {
            query = query.Where(a => a.Sex == sex.Value);
        }

        if (!string.IsNullOrWhiteSpace(weightCategory))
        {
            query = query.Where(a => a.WeightCategory == weightCategory);
        }

        if (status.HasValue)
        {
            query = query.Where(a => a.Status == status.Value);
        }

        if (!string.IsNullOrWhiteSpace(club))
        {
            query = query.Where(a => a.Club != null && a.Club.ToLower() == club.ToLower());
        }

        var total = await query.CountAsync();
        var inscritos = await query.CountAsync(a => a.Status == AthleteStatus.Inscrito);
        var paid = await query.CountAsync(a => a.Status == AthleteStatus.Paid);
        var pending = await query.CountAsync(a => a.Status == AthleteStatus.PendingPayment);
        var disqualified = await query.CountAsync(a => a.Status == AthleteStatus.Disqualified);
        var missingDocs = await query.CountAsync(a => a.Status == AthleteStatus.MissingDocumentation);

        return new AthleteStats
        {
            Total = total,
            Inscritos = inscritos,
            Paid = paid,
            Pending = pending,
            Disqualified = disqualified,
            MissingDocumentation = missingDocs
        };
    }

    public async Task<List<string>> GetAllClubsAsync()
    {
        return await _context.Athletes
            .Where(a => a.Club != null && a.Club != "")
            .Select(a => a.Club!)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();
    }

    public async Task<List<Athlete>> ExportAllAsync(
        string? searchTerm = null,
        Sex? sex = null,
        string? weightCategory = null,
        AthleteStatus? status = null,
        string? club = null,
        string? orderBy = null,
        string? orderDirection = null)
    {
        var query = _context.Athletes
            .Include(a => a.LiftEntries)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var term = searchTerm.ToLower();
            query = query.Where(a =>
                a.FirstName.ToLower().Contains(term) ||
                a.Surname.ToLower().Contains(term) ||
                a.Email.ToLower().Contains(term));
        }

        if (sex.HasValue)
            query = query.Where(a => a.Sex == sex.Value);

        if (!string.IsNullOrWhiteSpace(weightCategory))
            query = query.Where(a => a.WeightCategory == weightCategory);

        if (status.HasValue)
            query = query.Where(a => a.Status == status.Value);

        if (!string.IsNullOrWhiteSpace(club))
            query = query.Where(a => a.Club != null && a.Club.ToLower() == club.ToLower());

        // Apply sorting
        query = (orderBy?.ToLower()) switch
        {
            "name" => orderDirection?.ToLower() == "desc"
                ? query.OrderByDescending(a => a.FirstName).ThenByDescending(a => a.Surname)
                : query.OrderBy(a => a.FirstName).ThenBy(a => a.Surname),
            "email" => orderDirection?.ToLower() == "desc"
                ? query.OrderByDescending(a => a.Email)
                : query.OrderBy(a => a.Email),
            "sex" => orderDirection?.ToLower() == "desc"
                ? query.OrderByDescending(a => a.Sex)
                : query.OrderBy(a => a.Sex),
            "weightcategory" or "weight_category" => orderDirection?.ToLower() == "desc"
                ? query.OrderByDescending(a => a.WeightCategory)
                : query.OrderBy(a => a.WeightCategory),
            "club" => orderDirection?.ToLower() == "desc"
                ? query.OrderByDescending(a => a.Club)
                : query.OrderBy(a => a.Club),
            "weight" or "totalweight" or "total_weight" => orderDirection?.ToLower() == "desc"
                ? query.OrderByDescending(a => a.TotalWeight)
                : query.OrderBy(a => a.TotalWeight),
            "status" => orderDirection?.ToLower() == "desc"
                ? query.OrderByDescending(a => a.Status)
                : query.OrderBy(a => a.Status),
            "date" or "registrationdate" or "registration_date" => orderDirection?.ToLower() == "desc"
                ? query.OrderByDescending(a => a.RegistrationDate)
                : query.OrderBy(a => a.RegistrationDate),
            _ => query.OrderByDescending(a => a.RegistrationDate)
        };

        return await query.ToListAsync();
    }
}

public class AthleteStats
{
    public int Total { get; set; }
    public int Inscritos { get; set; }
    public int Paid { get; set; }
    public int Pending { get; set; }
    public int Disqualified { get; set; }
    public int MissingDocumentation { get; set; }
}

