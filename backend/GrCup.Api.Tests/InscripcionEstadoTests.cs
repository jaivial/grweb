using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Services;

namespace GrCup.Api.Tests;

/// <summary>
/// TDD: Behaviour of the per-competition inscripciones open/closed state,
/// backed by the new inscripcion_estado table.
/// </summary>
public class InscripcionEstadoTests : IDisposable
{
    private readonly GrCupDbContext _context;
    private readonly CompeticionService _service;

    public InscripcionEstadoTests()
    {
        var options = new DbContextOptionsBuilder<GrCupDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new GrCupDbContext(options);
        _service = new CompeticionService(_context);
    }

    public void Dispose() => _context.Dispose();

    private async Task<Competicion> SeedCompeticionAsync()
    {
        var competicion = new Competicion
        {
            Nombre = "FER Cup",
            Slug = "fer",
            Fecha = DateTime.UtcNow,
            Lugar = "Valencia",
            Tipo = "fer",
        };
        _context.Competiciones.Add(competicion);
        await _context.SaveChangesAsync();
        return competicion;
    }

    [Fact]
    public async Task GetInscripcionesAbiertas_DefaultsToTrue_WhenNoRowExists()
    {
        var competicion = await SeedCompeticionAsync();

        var result = await _service.GetInscripcionesAbiertasAsync(competicion.Id);

        Assert.True(result);
    }

    [Fact]
    public async Task SetInscripcionesAbiertas_False_ClosesInscripciones()
    {
        var competicion = await SeedCompeticionAsync();

        await _service.SetInscripcionesAbiertasAsync(competicion.Id, false);
        var result = await _service.GetInscripcionesAbiertasAsync(competicion.Id);

        Assert.False(result);
    }

    [Fact]
    public async Task SetInscripcionesAbiertas_PersistsARow()
    {
        var competicion = await SeedCompeticionAsync();

        await _service.SetInscripcionesAbiertasAsync(competicion.Id, false);

        var row = await _context.InscripcionEstados
            .FirstOrDefaultAsync(e => e.CompeticionId == competicion.Id);
        Assert.NotNull(row);
        Assert.False(row!.InscripcionesAbiertas);
        Assert.Equal(competicion.Id, row.CompeticionId);
    }

    [Fact]
    public async Task SetInscripcionesAbiertas_Upserts_DoesNotCreateDuplicateRows()
    {
        var competicion = await SeedCompeticionAsync();

        await _service.SetInscripcionesAbiertasAsync(competicion.Id, false);
        await _service.SetInscripcionesAbiertasAsync(competicion.Id, true);

        var rows = await _context.InscripcionEstados
            .Where(e => e.CompeticionId == competicion.Id)
            .ToListAsync();
        Assert.Single(rows);
        Assert.True(rows[0].InscripcionesAbiertas);
    }

    [Fact]
    public async Task GetInscripcionesAbiertas_ReturnsTrue_AfterReopening()
    {
        var competicion = await SeedCompeticionAsync();

        await _service.SetInscripcionesAbiertasAsync(competicion.Id, false);
        await _service.SetInscripcionesAbiertasAsync(competicion.Id, true);

        Assert.True(await _service.GetInscripcionesAbiertasAsync(competicion.Id));
    }

    [Fact]
    public async Task GetSoldOut_DefaultsToFalse_WhenNoRowExists()
    {
        var competicion = await SeedCompeticionAsync();

        Assert.False(await _service.GetSoldOutAsync(competicion.Id));
    }

    [Fact]
    public async Task SetInscripcionesAbiertas_WithSoldOut_ClosesAsSoldOut()
    {
        var competicion = await SeedCompeticionAsync();

        await _service.SetInscripcionesAbiertasAsync(competicion.Id, false, soldOut: true);

        Assert.False(await _service.GetInscripcionesAbiertasAsync(competicion.Id));
        Assert.True(await _service.GetSoldOutAsync(competicion.Id));
    }

    [Fact]
    public async Task SetInscripcionesAbiertas_TemporaryClose_IsNotSoldOut()
    {
        var competicion = await SeedCompeticionAsync();

        await _service.SetInscripcionesAbiertasAsync(competicion.Id, false, soldOut: false);

        Assert.False(await _service.GetInscripcionesAbiertasAsync(competicion.Id));
        Assert.False(await _service.GetSoldOutAsync(competicion.Id));
    }

    [Fact]
    public async Task Reopening_ClearsSoldOutFlag()
    {
        var competicion = await SeedCompeticionAsync();

        await _service.SetInscripcionesAbiertasAsync(competicion.Id, false, soldOut: true);
        await _service.SetInscripcionesAbiertasAsync(competicion.Id, true);

        Assert.True(await _service.GetInscripcionesAbiertasAsync(competicion.Id));
        Assert.False(await _service.GetSoldOutAsync(competicion.Id));
    }
}
