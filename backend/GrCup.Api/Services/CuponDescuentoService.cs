using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

public class CuponDescuentoService
{
    public const string TipoPorcentaje = "porcentaje";
    public const string TipoImporte = "importe";

    private readonly GrCupDbContext _context;

    public CuponDescuentoService(GrCupDbContext context)
    {
        _context = context;
    }

    public static string NormalizeCode(string codigo) => codigo.Trim().ToUpperInvariant();

    public static decimal CalculateSubtotal(EventoConfig config, bool peakProgram)
    {
        var subtotal = config.PrecioBase;
        if (peakProgram)
            subtotal += config.PrecioPeakProgram;
        return Math.Max(0, subtotal);
    }

    public async Task<List<CuponDescuentoDto>> GetAllAsync(int competicionId)
    {
        var cupones = await _context.CuponesDescuento
            .Where(c => c.CompeticionId == competicionId)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();

        var ids = cupones.Select(c => c.Id).ToList();
        var usos = await _context.Inscripciones
            .Where(i => i.CuponDescuentoId != null && ids.Contains(i.CuponDescuentoId.Value))
            .GroupBy(i => i.CuponDescuentoId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        return cupones.Select(c => ToDto(c, usos.GetValueOrDefault(c.Id))).ToList();
    }

    public async Task<CuponDescuentoDto?> GetAsync(int competicionId, int id)
    {
        var cupon = await _context.CuponesDescuento
            .FirstOrDefaultAsync(c => c.Id == id && c.CompeticionId == competicionId);
        if (cupon == null) return null;

        return ToDto(cupon, await GetUsageCountAsync(cupon.Id));
    }

    public async Task<CuponDescuentoDto> CreateAsync(int competicionId, CuponDescuentoRequest request)
    {
        var cupon = new CuponDescuento
        {
            CompeticionId = competicionId,
            Codigo = (request.Codigo ?? string.Empty).Trim(),
            CodigoNormalizado = NormalizeCode(request.Codigo ?? string.Empty),
            TipoDescuento = NormalizeDiscountType(request.TipoDescuento),
            Valor = request.Valor,
            Activo = request.Activo ?? true,
            TieneLimiteUsos = request.TieneLimiteUsos,
            LimiteUsos = request.TieneLimiteUsos ? request.LimiteUsos : null,
            TieneFechaExpiracion = request.TieneFechaExpiracion,
            FechaExpiracion = request.TieneFechaExpiracion ? request.FechaExpiracion : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await ValidateCouponAsync(cupon);
        _context.CuponesDescuento.Add(cupon);
        await _context.SaveChangesAsync();
        return ToDto(cupon, 0);
    }

    public async Task<CuponDescuentoDto?> UpdateAsync(int competicionId, int id, CuponDescuentoRequest request)
    {
        var cupon = await _context.CuponesDescuento
            .FirstOrDefaultAsync(c => c.Id == id && c.CompeticionId == competicionId);
        if (cupon == null) return null;

        cupon.Codigo = (request.Codigo ?? string.Empty).Trim();
        cupon.CodigoNormalizado = NormalizeCode(request.Codigo ?? string.Empty);
        cupon.TipoDescuento = NormalizeDiscountType(request.TipoDescuento);
        cupon.Valor = request.Valor;
        if (request.Activo.HasValue)
            cupon.Activo = request.Activo.Value;
        cupon.TieneLimiteUsos = request.TieneLimiteUsos;
        cupon.LimiteUsos = request.TieneLimiteUsos ? request.LimiteUsos : null;
        cupon.TieneFechaExpiracion = request.TieneFechaExpiracion;
        cupon.FechaExpiracion = request.TieneFechaExpiracion ? request.FechaExpiracion : null;
        cupon.UpdatedAt = DateTime.UtcNow;

        await ValidateCouponAsync(cupon, id);
        await _context.SaveChangesAsync();
        return ToDto(cupon, await GetUsageCountAsync(cupon.Id));
    }

    public async Task<CuponDescuentoDto?> SetActiveAsync(int competicionId, int id, bool activo)
    {
        var cupon = await _context.CuponesDescuento
            .FirstOrDefaultAsync(c => c.Id == id && c.CompeticionId == competicionId);
        if (cupon == null) return null;

        cupon.Activo = activo;
        cupon.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return ToDto(cupon, await GetUsageCountAsync(cupon.Id));
    }

    public async Task<CouponApplication> ApplyCouponAsync(
        int competicionId,
        EventoConfig config,
        string? codigo,
        decimal subtotal,
        int? excludeInscripcionId = null)
    {
        if (string.IsNullOrWhiteSpace(codigo))
            return CouponApplication.None(subtotal);

        if (!config.CuponesDescuentoActivo)
            throw new InvalidOperationException("Los cupones de descuento no están activos para esta competición.");

        var normalized = NormalizeCode(codigo);
        var cupon = await _context.CuponesDescuento
            .FirstOrDefaultAsync(c => c.CompeticionId == competicionId && c.CodigoNormalizado == normalized);

        if (cupon == null || !cupon.Activo)
            throw new InvalidOperationException("Cupón no válido.");

        await EnsureCouponCanBeUsedAsync(cupon, excludeInscripcionId);
        var discount = CalculateDiscount(cupon, subtotal);
        var total = Math.Max(0, subtotal - discount);

        return new CouponApplication(
            cupon.Id,
            cupon.Codigo,
            cupon.TipoDescuento,
            cupon.Valor,
            subtotal,
            discount,
            total
        );
    }

    public async Task<CouponValidationDto> ValidatePublicAsync(
        int competicionId,
        EventoConfig config,
        string codigo,
        decimal subtotal)
    {
        if (string.IsNullOrWhiteSpace(codigo))
            return new CouponValidationDto(false, "Introduce un cupón.", null, null, null, subtotal, 0, subtotal);

        try
        {
            var application = await ApplyCouponAsync(competicionId, config, codigo, subtotal);
            return new CouponValidationDto(true, null, application.CodigoCupon, application.TipoDescuentoCupon,
                application.ValorDescuentoCupon, application.SubtotalAntesDescuento, application.ImporteDescuento, application.Total);
        }
        catch (Exception ex)
        {
            return new CouponValidationDto(false, ex.Message, null, null, null, subtotal, 0, subtotal);
        }
    }

    private async Task ValidateCouponAsync(CuponDescuento cupon, int? currentId = null)
    {
        if (string.IsNullOrWhiteSpace(cupon.Codigo))
            throw new InvalidOperationException("El texto del cupón es obligatorio.");
        if (cupon.Codigo.Length > 200)
            throw new InvalidOperationException("El texto del cupón no puede superar 200 caracteres.");
        if (cupon.Valor <= 0)
            throw new InvalidOperationException("El descuento debe ser mayor que cero.");
        if (cupon.TipoDescuento == TipoPorcentaje && cupon.Valor > 100)
            throw new InvalidOperationException("El porcentaje no puede superar el 100%.");
        if (cupon.TieneLimiteUsos && (!cupon.LimiteUsos.HasValue || cupon.LimiteUsos.Value <= 0))
            throw new InvalidOperationException("El límite de usos debe ser mayor que cero.");
        if (cupon.TieneFechaExpiracion && !cupon.FechaExpiracion.HasValue)
            throw new InvalidOperationException("La fecha de expiración es obligatoria.");

        var duplicate = await _context.CuponesDescuento.AnyAsync(c =>
            c.CompeticionId == cupon.CompeticionId &&
            c.CodigoNormalizado == cupon.CodigoNormalizado &&
            (!currentId.HasValue || c.Id != currentId.Value));
        if (duplicate)
            throw new InvalidOperationException("Ya existe un cupón con ese texto para esta competición.");
    }

    private async Task EnsureCouponCanBeUsedAsync(CuponDescuento cupon, int? excludeInscripcionId)
    {
        if (cupon.TieneFechaExpiracion && cupon.FechaExpiracion.HasValue && cupon.FechaExpiracion.Value.Date < DateTime.UtcNow.Date)
            throw new InvalidOperationException("El cupón ha expirado.");

        if (!cupon.TieneLimiteUsos || !cupon.LimiteUsos.HasValue)
            return;

        var used = await _context.Inscripciones.CountAsync(i =>
            i.CuponDescuentoId == cupon.Id &&
            (!excludeInscripcionId.HasValue || i.Id != excludeInscripcionId.Value));
        if (used >= cupon.LimiteUsos.Value)
            throw new InvalidOperationException("El cupón ya ha alcanzado su límite de usos.");
    }

    private static string NormalizeDiscountType(string tipo)
    {
        var normalized = tipo.Trim().ToLowerInvariant();
        return normalized switch
        {
            TipoPorcentaje => TipoPorcentaje,
            TipoImporte => TipoImporte,
            _ => throw new InvalidOperationException("Tipo de descuento no válido.")
        };
    }

    private static decimal CalculateDiscount(CuponDescuento cupon, decimal subtotal)
    {
        var discount = cupon.TipoDescuento == TipoPorcentaje
            ? subtotal * (cupon.Valor / 100m)
            : cupon.Valor;

        return Math.Round(Math.Min(subtotal, Math.Max(0, discount)), 2, MidpointRounding.AwayFromZero);
    }

    private async Task<int> GetUsageCountAsync(int cuponId)
    {
        return await _context.Inscripciones.CountAsync(i => i.CuponDescuentoId == cuponId);
    }

    private static CuponDescuentoDto ToDto(CuponDescuento cupon, int usosActuales)
    {
        return new CuponDescuentoDto(
            cupon.Id,
            cupon.CompeticionId,
            cupon.Codigo,
            cupon.TipoDescuento,
            cupon.Valor,
            cupon.Activo,
            cupon.TieneLimiteUsos,
            cupon.LimiteUsos,
            usosActuales,
            cupon.TieneFechaExpiracion,
            cupon.FechaExpiracion,
            cupon.CreatedAt,
            cupon.UpdatedAt
        );
    }
}

public record CuponDescuentoRequest(
    string Codigo,
    string TipoDescuento,
    decimal Valor,
    bool TieneLimiteUsos,
    int? LimiteUsos,
    bool TieneFechaExpiracion,
    DateTime? FechaExpiracion,
    bool? Activo = null
);

public record CuponDescuentoDto(
    int Id,
    int CompeticionId,
    string Codigo,
    string TipoDescuento,
    decimal Valor,
    bool Activo,
    bool TieneLimiteUsos,
    int? LimiteUsos,
    int UsosActuales,
    bool TieneFechaExpiracion,
    DateTime? FechaExpiracion,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record CouponApplication(
    int? CuponDescuentoId,
    string? CodigoCupon,
    string? TipoDescuentoCupon,
    decimal? ValorDescuentoCupon,
    decimal SubtotalAntesDescuento,
    decimal ImporteDescuento,
    decimal Total
)
{
    public static CouponApplication None(decimal subtotal) => new(null, null, null, null, subtotal, 0, subtotal);
}

public record CouponValidationDto(
    bool Valid,
    string? Message,
    string? Codigo,
    string? TipoDescuento,
    decimal? Valor,
    decimal Subtotal,
    decimal ImporteDescuento,
    decimal Total
);
