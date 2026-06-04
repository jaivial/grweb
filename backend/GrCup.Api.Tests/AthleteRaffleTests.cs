using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;
using GrCup.Api.Services;

namespace GrCup.Api.Tests;

/// <summary>
/// Tests for the parallel athlete raffle flow (POST /api/admin/competiciones/{id}/athletes/raffle).
/// Mirrors the Inscripcion raffle tests but operates on the Athlete model.
/// </summary>
public class AthleteRaffleTests : IDisposable
{
    private readonly GrCupDbContext _context;
    private readonly AthleteRaffleService _service;

    public AthleteRaffleTests()
    {
        var options = new DbContextOptionsBuilder<GrCupDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new GrCupDbContext(options);
        _service = new AthleteRaffleService(_context);
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    // ───────────────────────── Raffle tests ─────────────────────────

    [Fact]
    public async Task RaffleAsync_AllCriteria_ReturnsRequestedCount_Test()
    {
        // pool=10, N=3, mode=none → 3 winners, no fallback
        for (int i = 1; i <= 10; i++)
            Seed(Make(i, status: i > 3 ? AthleteStatus.Paid : AthleteStatus.Inscrito));

        var result = await _service.RaffleAsync(1, new AthleteRaffleRequest("all", 3, "none", Random.Shared));
        Assert.Equal(3, result.Winners.Count);
        Assert.Null(result.FallbackReason);
    }

    [Fact]
    public async Task RaffleAsync_OnlyPaid_FiltersToPaidOnly_Test()
    {
        // 5 paid, 5 unpaid → pool of 5, N=3 → 3 winners all Paid
        int id = 1;
        for (int i = 0; i < 5; i++) Seed(Make(id++, status: AthleteStatus.Paid));
        for (int i = 0; i < 5; i++) Seed(Make(id++, status: AthleteStatus.Inscrito));

        var result = await _service.RaffleAsync(1, new AthleteRaffleRequest("onlyPaid", 3, "none", Random.Shared));
        Assert.Equal(3, result.Winners.Count);
        Assert.All(result.Winners, w => Assert.Equal(AthleteStatus.Paid, w.Status));
    }

    [Fact]
    public async Task RaffleAsync_EquitySex_4Winners_EqualSplit_Test()
    {
        // 5M 5F, N=4, sex → 2M + 2F
        int id = 1;
        for (int i = 0; i < 5; i++) Seed(Make(id++, sex: Sex.Male, status: AthleteStatus.Paid));
        for (int i = 0; i < 5; i++) Seed(Make(id++, sex: Sex.Female, status: AthleteStatus.Paid));

        var result = await _service.RaffleAsync(1, new AthleteRaffleRequest("all", 4, "sex", Random.Shared));
        Assert.Equal(4, result.Winners.Count);
        Assert.Null(result.FallbackReason);
        var males = result.Winners.Count(w => w.Sex == Sex.Male);
        var females = result.Winners.Count(w => w.Sex == Sex.Female);
        Assert.Equal(2, males);
        Assert.Equal(2, females);
    }

    [Fact]
    public async Task RaffleAsync_EquityInsufficientPool_FallsBackToRandom_Test()
    {
        // 1M 5F, N=4, sex → fallbackReason set
        int id = 1;
        Seed(Make(id++, sex: Sex.Male, status: AthleteStatus.Paid));
        for (int i = 0; i < 5; i++) Seed(Make(id++, sex: Sex.Female, status: AthleteStatus.Paid));

        var result = await _service.RaffleAsync(1, new AthleteRaffleRequest("all", 4, "sex", Random.Shared));
        Assert.Equal(4, result.Winners.Count);
        Assert.Equal("insufficient_pool_for_equity", result.FallbackReason);
    }

    [Fact]
    public async Task RaffleAsync_PersistsToSorteoInscripcion_WithAthleteId_Test()
    {
        // assert SorteoInscripcion rows have AthleteId set, InscripcionId null
        for (int i = 1; i <= 10; i++)
            Seed(Make(i, status: AthleteStatus.Paid));

        var result = await _service.RaffleAsync(1, new AthleteRaffleRequest("all", 3, "none", Random.Shared));
        Assert.Equal(3, result.Winners.Count);

        var persisted = await _context.SorteosInscripcion
            .Where(s => s.CompeticionId == 1)
            .OrderBy(s => s.NumeroGanador)
            .ToListAsync();
        Assert.Equal(3, persisted.Count);
        var winnerIds = result.Winners.Select(w => w.Id).OrderBy(i => i).ToList();
        var persistedAthleteIds = persisted.Select(p => p.AthleteId).Select(i => (int)i!).OrderBy(i => i).ToList();
        Assert.Equal(winnerIds, persistedAthleteIds);
        Assert.All(persisted, p => Assert.Null(p.InscripcionId));
        Assert.All(persisted, p => Assert.NotNull(p.AthleteId));
        Assert.All(persisted, p => Assert.True(p.NumeroGanador >= 1 && p.NumeroGanador <= 3));
        Assert.All(persisted, p => Assert.NotEqual(default, p.FechaSorteo));
        Assert.All(persisted, p => Assert.False(string.IsNullOrEmpty(p.FiltroAplicado)));
    }

    [Fact]
    public async Task RaffleAsync_NumWinners0_Throws_Test()
    {
        for (int i = 1; i <= 5; i++) Seed(Make(i, status: AthleteStatus.Paid));

        await Assert.ThrowsAsync<ArgumentException>(async () =>
            await _service.RaffleAsync(1, new AthleteRaffleRequest("all", 0, "none", Random.Shared)));
    }

    // ───────────────────────── helpers ─────────────────────────

    private Athlete Make(
        int id,
        Sex sex = Sex.Male,
        AthleteStatus status = AthleteStatus.Inscrito)
    {
        return new Athlete
        {
            Id = id,
            FirstName = $"Athlete{id}",
            Surname = "Test",
            Email = $"athlete{id}@test.com",
            Sex = sex,
            WeightCategory = "-83 kg",
            Status = status,
            RegistrationDate = DateTime.UtcNow
        };
    }

    private void Seed(params Athlete[] items)
    {
        foreach (var a in items)
        {
            if (!_context.Athletes.Any(x => x.Id == a.Id))
                _context.Athletes.Add(a);
        }
        _context.SaveChanges();
    }
}
