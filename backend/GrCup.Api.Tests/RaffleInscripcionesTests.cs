using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Services;

namespace GrCup.Api.Tests;

/// <summary>
/// Tests for the raffle feature: filter extensions to GetPaginatedAsync/GetStatsAsync
/// and the new RaffleAsync service method.
/// </summary>
public class RaffleInscripcionesTests : IDisposable
{
    private readonly GrCupDbContext _context;
    private readonly InscripcionService _service;

    public RaffleInscripcionesTests()
    {
        var options = new DbContextOptionsBuilder<GrCupDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new GrCupDbContext(options);
        _service = new InscripcionService(_context, null!, null!, null!);
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    // ───────────────────────── Filter tests ─────────────────────────

    [Fact]
    public async Task GetPaginatedAsync_FilterSexoMasculino_ReturnsOnlyMale_Test()
    {
        Seed(Make(1, sexo: "masculino"), Make(2, sexo: "femenino"), Make(3, sexo: "masculino"));
        var (items, total) = await _service.GetPaginatedAsync(1, sexo: "masculino");
        Assert.Equal(2, total);
        Assert.All(items, i => Assert.Equal("masculino", i.Sexo));
    }

    [Fact]
    public async Task GetPaginatedAsync_FilterSexoFemenino_ReturnsOnlyFemale_Test()
    {
        Seed(Make(1, sexo: "masculino"), Make(2, sexo: "femenino"), Make(3, sexo: "femenino"));
        var (items, total) = await _service.GetPaginatedAsync(1, sexo: "femenino");
        Assert.Equal(2, total);
        Assert.All(items, i => Assert.Equal("femenino", i.Sexo));
    }

    [Fact]
    public async Task GetPaginatedAsync_FilterCategoriaPeso_ReturnsOnlyCategory_Test()
    {
        Seed(Make(1, cat: "-74 kg"), Make(2, cat: "-83 kg"), Make(3, cat: "-74 kg"), Make(4, cat: "-93 kg"));
        var (items, total) = await _service.GetPaginatedAsync(1, categoriaPeso: "-74 kg");
        Assert.Equal(2, total);
        Assert.All(items, i => Assert.Equal("-74 kg", i.CategoriaPeso));
    }

    [Fact]
    public async Task GetPaginatedAsync_FilterQuiereHandler_True_ReturnsOnlyYes_Test()
    {
        Seed(Make(1, handler: true), Make(2, handler: false), Make(3, handler: true));
        var (items, total) = await _service.GetPaginatedAsync(1, quiereHandler: true);
        Assert.Equal(2, total);
        Assert.All(items, i => Assert.True(i.QuiereHandler));
    }

    [Fact]
    public async Task GetPaginatedAsync_FilterQuierePeakProgram_True_ReturnsOnlyYes_Test()
    {
        Seed(Make(1, peak: true), Make(2, peak: false), Make(3, peak: true), Make(4, peak: true));
        var (items, total) = await _service.GetPaginatedAsync(1, quierePeakProgram: true);
        Assert.Equal(3, total);
        Assert.All(items, i => Assert.True(i.QuierePeakProgram));
    }

    [Fact]
    public async Task GetPaginatedAsync_FilterParticipacionConfirmada_True_ReturnsOnlyConfirmed_Test()
    {
        Seed(Make(1, participation: true), Make(2, participation: false), Make(3, participation: true));
        var (items, total) = await _service.GetPaginatedAsync(1, participacionConfirmada: true);
        Assert.Equal(2, total);
        Assert.All(items, i => Assert.True(i.ParticipacionConfirmada));
    }

    [Fact]
    public async Task GetPaginatedAsync_FilterHasCoupon_True_ReturnsOnlyWithCoupon_Test()
    {
        Seed(Make(1, cuponId: 100), Make(2, cuponId: null), Make(3, cuponId: 200));
        var (items, total) = await _service.GetPaginatedAsync(1, hasCoupon: true);
        Assert.Equal(2, total);
        Assert.All(items, i => Assert.NotNull(i.CuponDescuentoId));
    }

    [Fact]
    public async Task GetPaginatedAsync_AllFiltersCombined_NarrowsToIntersection_Test()
    {
        Seed(
            Make(1, sexo: "masculino", cat: "-74 kg", handler: true, peak: true, participation: true, cuponId: 1),
            Make(2, sexo: "masculino", cat: "-74 kg", handler: true, peak: true, participation: true, cuponId: null),
            Make(3, sexo: "masculino", cat: "-74 kg", handler: true, peak: true, participation: false, cuponId: 1),
            Make(4, sexo: "femenino", cat: "-74 kg", handler: true, peak: true, participation: true, cuponId: 1),
            Make(5, sexo: "masculino", cat: "-83 kg", handler: true, peak: true, participation: true, cuponId: 1)
        );

        var (items, total) = await _service.GetPaginatedAsync(
            1,
            sexo: "masculino",
            categoriaPeso: "-74 kg",
            quiereHandler: true,
            quierePeakProgram: true,
            participacionConfirmada: true,
            hasCoupon: true);

        Assert.Equal(1, total);
        Assert.Single(items);
        Assert.Equal(1, items[0].Id);
    }

    // ───────────────────────── Stats parity tests ─────────────────────────

    [Fact]
    public async Task GetStatsAsync_AppliesFiltersConsistently_Test()
    {
        Seed(
            Make(1, sexo: "masculino", pagoConfirmado: true, totalPagado: 50m, method: "stripe"),
            Make(2, sexo: "femenino", pagoConfirmado: true, totalPagado: 30m, method: "efectivo"),
            Make(3, sexo: "masculino", pagoConfirmado: false, totalPagado: 0m, method: null)
        );

        var (masculinoList, masculinoTotal) = await _service.GetPaginatedAsync(1, sexo: "masculino");
        var masculinoStats = await _service.GetStatsAsync(1, sexo: "masculino");
        Assert.Equal(masculinoTotal, masculinoStats.Total);
        Assert.Equal(masculinoList.Count(i => i.PagoConfirmado), masculinoStats.Pagados);
        Assert.Equal(masculinoList.Where(i => i.PagoConfirmado).Sum(i => i.TotalPagado), masculinoStats.Revenue);

        var (paidList, paidTotal) = await _service.GetPaginatedAsync(1, pagoConfirmado: true);
        var paidStats = await _service.GetStatsAsync(1, pagoConfirmado: true);
        Assert.Equal(paidTotal, paidStats.Total);
        Assert.Equal(paidList.Count, paidStats.Pagados);
        Assert.Equal(paidList.Sum(i => i.TotalPagado), paidStats.Revenue);

        var (handlerList, handlerTotal) = await _service.GetPaginatedAsync(1, quiereHandler: true);
        var handlerStats = await _service.GetStatsAsync(1, quiereHandler: true);
        Assert.Equal(handlerTotal, handlerStats.Total);

        var (couponList, couponTotal) = await _service.GetPaginatedAsync(1, hasCoupon: true);
        var couponStats = await _service.GetStatsAsync(1, hasCoupon: true);
        Assert.Equal(couponTotal, couponStats.Total);
    }

    // ───────────────────────── Raffle tests ─────────────────────────

    [Fact]
    public async Task RaffleAsync_AllCriteria_ReturnsRequestedCount_Test()
    {
        for (int i = 1; i <= 10; i++)
            Seed(Make(i, sexo: i % 2 == 0 ? "masculino" : "femenino", pagoConfirmado: i > 3, totalPagado: i > 3 ? 40m : 0m, method: i > 3 ? "stripe" : null));

        var result = await _service.RaffleAsync(1, new RaffleRequest("all", 3, "none", Random.Shared));
        Assert.Equal(3, result.Winners.Count);
        Assert.Null(result.FallbackReason);
    }

    [Fact]
    public async Task RaffleAsync_OnlyPaidNoCoupon_ExcludesCouponAndUnpaidRows_Test()
    {
        // 5 paid no-coupon, 3 paid with coupon, 2 unpaid
        int id = 1;
        for (int i = 0; i < 5; i++) Seed(Make(id++, cuponId: null, pagoConfirmado: true, totalPagado: 40m, method: "stripe"));
        for (int i = 0; i < 3; i++) Seed(Make(id++, cuponId: 100, pagoConfirmado: true, totalPagado: 30m, method: "stripe"));
        for (int i = 0; i < 2; i++) Seed(Make(id++, cuponId: null, pagoConfirmado: false, totalPagado: 0m, method: null));

        var result = await _service.RaffleAsync(1, new RaffleRequest("onlyPaidNoCoupon", 4, "none", Random.Shared));
        Assert.Equal(4, result.Winners.Count);
        Assert.All(result.Winners, w =>
        {
            Assert.True(w.PagoConfirmado);
            Assert.Null(w.CuponDescuentoId);
        });
    }

    [Fact]
    public async Task RaffleAsync_EquitySex_4Winners_EqualSplit_Test()
    {
        // 5M 5F, N=4, sex → 2M + 2F
        int id = 1;
        for (int i = 0; i < 5; i++) Seed(Make(id++, sexo: "masculino", pagoConfirmado: true, totalPagado: 40m, method: "stripe"));
        for (int i = 0; i < 5; i++) Seed(Make(id++, sexo: "femenino", pagoConfirmado: true, totalPagado: 40m, method: "stripe"));

        var result = await _service.RaffleAsync(1, new RaffleRequest("all", 4, "sex", Random.Shared));
        Assert.Equal(4, result.Winners.Count);
        Assert.Null(result.FallbackReason);
        var males = result.Winners.Count(w => w.Sexo == "masculino");
        var females = result.Winners.Count(w => w.Sexo == "femenino");
        Assert.Equal(2, males);
        Assert.Equal(2, females);
    }

    [Fact]
    public async Task RaffleAsync_EquitySex_5Winners_HandlesOddCount_Test()
    {
        // 5M 5F, N=5, sex → 3M+2F or 2M+3F, no fallback
        int id = 1;
        for (int i = 0; i < 5; i++) Seed(Make(id++, sexo: "masculino", pagoConfirmado: true, totalPagado: 40m, method: "stripe"));
        for (int i = 0; i < 5; i++) Seed(Make(id++, sexo: "femenino", pagoConfirmado: true, totalPagado: 40m, method: "stripe"));

        var result = await _service.RaffleAsync(1, new RaffleRequest("all", 5, "sex", Random.Shared));
        Assert.Equal(5, result.Winners.Count);
        Assert.Null(result.FallbackReason);
        var males = result.Winners.Count(w => w.Sexo == "masculino");
        var females = result.Winners.Count(w => w.Sexo == "femenino");
        Assert.Equal(2, females);
        Assert.Equal(3, males);
    }

    [Fact]
    public async Task RaffleAsync_EquityInsufficientPool_FallsBackToRandom_Test()
    {
        // 1M 5F, N=4, sex → fallbackReason set, 4 winners from full pool
        int id = 1;
        Seed(Make(id++, sexo: "masculino", pagoConfirmado: true, totalPagado: 40m, method: "stripe"));
        for (int i = 0; i < 5; i++) Seed(Make(id++, sexo: "femenino", pagoConfirmado: true, totalPagado: 40m, method: "stripe"));

        var result = await _service.RaffleAsync(1, new RaffleRequest("all", 4, "sex", Random.Shared));
        Assert.Equal(4, result.Winners.Count);
        Assert.Equal("insufficient_pool_for_equity", result.FallbackReason);
    }

    [Fact]
    public async Task RaffleAsync_PersistsWinnersToSorteoInscripcion_Test()
    {
        for (int i = 1; i <= 10; i++)
            Seed(Make(i, pagoConfirmado: true, totalPagado: 40m, method: "stripe"));

        var result = await _service.RaffleAsync(1, new RaffleRequest("all", 3, "none", Random.Shared));
        Assert.Equal(3, result.Winners.Count);

        var persisted = await _context.SorteosInscripcion
            .Where(s => s.CompeticionId == 1)
            .OrderBy(s => s.NumeroGanador)
            .ToListAsync();
        Assert.Equal(3, persisted.Count);
        var winnerIds = result.Winners.Select(w => w.Id).OrderBy(i => i).ToList();
        var persistedInscIds = persisted.Select(p => p.InscripcionId).Select(i => (int)i!).OrderBy(i => i).ToList();
        Assert.Equal(winnerIds, persistedInscIds);
        Assert.All(persisted, p => Assert.True(p.NumeroGanador >= 1 && p.NumeroGanador <= 3));
        Assert.All(persisted, p => Assert.NotEqual(default, p.FechaSorteo));
        Assert.All(persisted, p => Assert.False(string.IsNullOrEmpty(p.FiltroAplicado)));
    }

    [Fact]
    public async Task RaffleAsync_NumWinners0_ThrowsOrReturnsEmpty_Test()
    {
        for (int i = 1; i <= 5; i++) Seed(Make(i, pagoConfirmado: true, totalPagado: 40m, method: "stripe"));

        await Assert.ThrowsAsync<ArgumentException>(async () =>
            await _service.RaffleAsync(1, new RaffleRequest("all", 0, "none", Random.Shared)));
    }

    [Fact]
    public async Task RaffleAsync_PoolSmallerThanNumWinners_ReturnsAllPool_Test()
    {
        for (int i = 1; i <= 2; i++) Seed(Make(i, pagoConfirmado: true, totalPagado: 40m, method: "stripe"));

        var result = await _service.RaffleAsync(1, new RaffleRequest("all", 10, "none", Random.Shared));
        Assert.Equal(2, result.Winners.Count);
    }

    // ───────────────────────── helpers ─────────────────────────

    private Inscripcion Make(
        int id,
        string sexo = "masculino",
        string cat = "-83 kg",
        bool handler = false,
        bool peak = false,
        bool participation = false,
        int? cuponId = null,
        bool pagoConfirmado = false,
        decimal totalPagado = 0m,
        string? method = null)
    {
        return new Inscripcion
        {
            Id = id,
            CompeticionId = 1,
            Nombre = $"Atleta {id}",
            Email = $"atleta{id}@test.com",
            Sexo = sexo,
            CategoriaPeso = cat,
            Modalidad = InscripcionService.ModalidadCompleta,
            Experiencia = "intermedio",
            PagoConfirmado = pagoConfirmado,
            PaymentMethod = method,
            TotalPagado = totalPagado,
            AceptaTerminos = true,
            QuiereHandler = handler,
            QuierePeakProgram = peak,
            ParticipacionConfirmada = participation,
            CuponDescuentoId = cuponId
        };
    }

    private void Seed(params Inscripcion[] items)
    {
        foreach (var i in items)
        {
            if (!_context.Inscripciones.Any(x => x.Id == i.Id))
                _context.Inscripciones.Add(i);
        }
        _context.SaveChanges();
    }
}
