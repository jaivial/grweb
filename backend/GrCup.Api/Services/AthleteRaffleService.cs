using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;

namespace GrCup.Api.Services;

/// <summary>
/// Performs a raffle draw of legacy Athletes (the GR Cup pre-multi-tenant model).
/// Parallel to InscripcionService.RaffleAsync, but operates on the Athlete table
/// and persists the draw with AthleteId set (InscripcionId null) on SorteoInscripcion.
/// </summary>
public class AthleteRaffleService
{
    private readonly GrCupDbContext _context;

    public AthleteRaffleService(GrCupDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Performs a raffle draw for the given competition.
    /// 1. Builds the eligible pool from <paramref name="req"/>.FilterCriteria.
    /// 2. If equityMode == "sex" and N &gt;= 2, attempts an even split by sex with fallback
    ///    to fully-random if either sex is short of its target.
    /// 3. Persists winners to SorteoInscripcion (FechaSorteo, NumeroGanador 1-indexed, FiltroAplicado JSON, AthleteId set, InscripcionId null).
    /// 4. Returns winners as Athlete[] + optional fallbackReason.
    /// </summary>
    public async Task<AthleteRaffleResultDto> RaffleAsync(int competicionId, AthleteRaffleRequest req)
    {
        if (req.NumWinners < 1)
            throw new ArgumentException("NumWinners must be >= 1", nameof(req));

        var query = _context.Athletes.AsQueryable();
        var filterKey = req.FilterCriteria?.ToLowerInvariant();
        query = filterKey switch
        {
            RaffleFilter.OnlyPaid => query.Where(a => a.Status == AthleteStatus.Paid),
            RaffleFilter.OnlyPaidNoCoupon => query.Where(a => a.Status == AthleteStatus.Paid),
            _ => query // "all" or unknown
        };

        var pool = await query.ToListAsync();

        var rng = req.Random ?? Random.Shared;
        var mode = req.EquityMode?.ToLowerInvariant() ?? RaffleFilter.EquityNone;
        List<Athlete> winners;
        string? fallbackReason = null;

        if (mode == RaffleFilter.EquitySex && req.NumWinners >= 2)
        {
            var (splitWinners, splitFallback) = RaffleEquityHelper.ApplySexEquitySplit(
                pool,
                req.NumWinners,
                a => a.Sex == Sex.Male ? "masculino" : "femenino",
                rng);
            winners = splitWinners;
            fallbackReason = splitFallback;
        }
        else
        {
            winners = RaffleEquityHelper.DrawN(pool, req.NumWinners, rng);
        }

        var ahora = DateTime.UtcNow;
        var filtroJson = JsonSerializer.Serialize(new
        {
            filterCriteria = req.FilterCriteria,
            numWinners = req.NumWinners,
            equityMode = req.EquityMode
        });

        for (int i = 0; i < winners.Count; i++)
        {
            _context.SorteosInscripcion.Add(new SorteoInscripcion
            {
                CompeticionId = competicionId,
                InscripcionId = null,
                AthleteId = winners[i].Id,
                FechaSorteo = ahora,
                NumeroGanador = i + 1,
                FiltroAplicado = filtroJson,
                CreatedAt = ahora
            });
        }

        await _context.SaveChangesAsync();

        return new AthleteRaffleResultDto(winners, fallbackReason);
    }
}

/// <summary>
/// Request body for POST /api/admin/competiciones/{competicionId}/athletes/raffle
/// </summary>
public record AthleteRaffleRequest(
    string FilterCriteria,
    int NumWinners,
    string EquityMode,
    Random? Random = null
);

/// <summary>
/// Result of an athlete raffle draw: list of winners + optional fallback reason.
/// </summary>
public record AthleteRaffleResultDto(
    List<Athlete> Winners,
    string? FallbackReason
);
