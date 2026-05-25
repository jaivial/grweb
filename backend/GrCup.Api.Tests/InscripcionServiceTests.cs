using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Services;

namespace GrCup.Api.Tests;

public class InscripcionServiceTests : IDisposable
{
    private readonly GrCupDbContext _context;
    private readonly InscripcionService _service;

    public InscripcionServiceTests()
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

    [Fact]
    public async Task GetStatsAsync_ReturnsConfirmedRevenueSplitByPaymentMethod()
    {
        _context.Inscripciones.AddRange(
            CreateInscripcion(1, paymentMethod: "efectivo", totalPagado: 40m, pagoConfirmado: true),
            CreateInscripcion(2, paymentMethod: "cash", totalPagado: 10m, pagoConfirmado: true),
            CreateInscripcion(3, paymentMethod: "stripe", totalPagado: 30m, pagoConfirmado: true),
            CreateInscripcion(4, paymentMethod: "stripe", totalPagado: 20m, pagoConfirmado: false),
            CreateInscripcion(5, paymentMethod: "transferencia", totalPagado: 15m, pagoConfirmado: true)
        );
        await _context.SaveChangesAsync();

        var stats = await _service.GetStatsAsync(competicionId: 1);

        Assert.Equal(5, stats.Total);
        Assert.Equal(4, stats.Pagados);
        Assert.Equal(95m, stats.Revenue);
        Assert.Equal(50m, stats.CashRevenue);
        Assert.Equal(30m, stats.StripeRevenue);
    }

    private static Inscripcion CreateInscripcion(
        int id,
        string paymentMethod,
        decimal totalPagado,
        bool pagoConfirmado)
    {
        return new Inscripcion
        {
            Id = id,
            CompeticionId = 1,
            Nombre = $"Atleta {id}",
            Email = $"atleta{id}@test.com",
            Sexo = "masculino",
            CategoriaPeso = "-83 kg",
            Modalidad = InscripcionService.ModalidadCompleta,
            Experiencia = "intermedio",
            PagoConfirmado = pagoConfirmado,
            PaymentMethod = paymentMethod,
            TotalPagado = totalPagado,
            AceptaTerminos = true,
        };
    }
}
