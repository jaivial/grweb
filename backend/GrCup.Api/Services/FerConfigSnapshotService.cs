using GrCup.Api.Models;

namespace GrCup.Api.Services;

public class FerConfigSnapshotService
{
    private static readonly string[] CategoriasMasculino = { "-53", "-59", "-66", "-74", "-83", "-93", "-105", "-120", "+120" };
    private static readonly string[] CategoriasFemenino = { "-43", "-47", "-52", "-57", "-63", "-69", "-76", "-84", "+84" };

    private readonly CompeticionService _competicionService;
    private readonly StripeService _stripeService;

    public FerConfigSnapshotService(CompeticionService competicionService, StripeService stripeService)
    {
        _competicionService = competicionService;
        _stripeService = stripeService;
    }

    public async Task<FerConfigSnapshot> BuildAsync(Competicion competicion)
    {
        var config = _competicionService.GetEventoConfig(competicion);
        var plazasDisponibles = await _competicionService.GetPlazasDisponiblesAsync(competicion.Id);
        var stripeDisponible = await _stripeService.IsInscriptionStripeAvailableAsync(competicion.Id, config);

        return new FerConfigSnapshot(
            config.PrecioBase,
            config.PrecioHandler,
            config.PrecioPeakProgram,
            config.PrecioRifa,
            config.AforoMaximo,
            plazasDisponibles,
            config.FechaLimitePeakProgram,
            config.InscripcionAbierta && plazasDisponibles > 0,
            config.PagoStripeActivo,
            config.PagoEfectivoActivo,
            config.CuponesDescuentoActivo,
            stripeDisponible,
            CategoriasMasculino,
            CategoriasFemenino
        );
    }

    public static bool Matches(FerConfigSnapshot? current, FerConfigSnapshot? requested)
    {
        if (current == null || requested == null)
            return false;

        return current.PrecioBase == requested.PrecioBase
            && current.PrecioHandler == requested.PrecioHandler
            && current.PrecioPeakProgram == requested.PrecioPeakProgram
            && current.PrecioRifa == requested.PrecioRifa
            && current.InscripcionAbierta == requested.InscripcionAbierta
            && current.PagoStripeActivo == requested.PagoStripeActivo
            && current.PagoEfectivoActivo == requested.PagoEfectivoActivo
            && current.CuponesDescuentoActivo == requested.CuponesDescuentoActivo
            && current.StripeDisponible == requested.StripeDisponible;
    }
}

public record FerConfigSnapshot(
    decimal PrecioBase,
    decimal PrecioHandler,
    decimal PrecioPeakProgram,
    decimal PrecioRifa,
    int AforoMaximo,
    int PlazasDisponibles,
    string? FechaLimitePeakProgram,
    bool InscripcionAbierta,
    bool PagoStripeActivo,
    bool PagoEfectivoActivo,
    bool CuponesDescuentoActivo,
    bool StripeDisponible,
    IReadOnlyList<string> CategoriasMasculino,
    IReadOnlyList<string> CategoriasFemenino
);
