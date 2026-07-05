using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GrCup.Api.Endpoints;

public static class CuponDescuentoEndpoints
{
    private const decimal MinCheckoutTotal = 0.50m;

    public static void MapCuponDescuentoEndpoints(this IEndpointRouteBuilder app)
    {
        var adminGroup = app.MapGroup("/api/admin/competiciones/{competicionId:int}/cupones").RequireAuthorization();

        adminGroup.MapGet("/", async (int competicionId, CuponDescuentoService service) =>
        {
            var cupones = await service.GetAllAsync(competicionId);
            return Results.Ok(new { success = true, data = cupones });
        });

        adminGroup.MapGet("/inscripcion-costo", async (
            int competicionId,
            CompeticionService competicionService) =>
        {
            var competicion = await competicionService.GetByIdAsync(competicionId);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var config = competicionService.GetEventoConfig(competicion);
            var subtotal = CuponDescuentoService.CalculateSubtotal(config, false);

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    subtotal,
                    minimoTotalCobro = MinCheckoutTotal,
                    moneda = "EUR"
                }
            });
        });

        adminGroup.MapPost("/", async (
            int competicionId,
            [FromBody] CuponDescuentoRequest request,
            CuponDescuentoService service,
            CompeticionService competicionService,
            ILogger<Program> logger) =>
        {
            try
            {
                var competicion = await competicionService.GetByIdAsync(competicionId);
                if (competicion == null)
                    return Results.NotFound(new { success = false, message = "Competición no encontrada" });

                var config = competicionService.GetEventoConfig(competicion);
                var subtotal = CuponDescuentoService.CalculateSubtotal(config, false);
                EnsureCouponTotalIsValid(request, subtotal);

                var cupon = await service.CreateAsync(competicionId, request);
                logger.LogInformation("Discount coupon created: {CouponId} for competition {CompeticionId}", cupon.Id, competicionId);
                return Results.Created($"/api/admin/competiciones/{competicionId}/cupones/{cupon.Id}", new { success = true, data = cupon });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        adminGroup.MapPut("/{id:int}", async (
            int competicionId,
            int id,
            [FromBody] CuponDescuentoRequest request,
            CuponDescuentoService service,
            CompeticionService competicionService,
            ILogger<Program> logger) =>
        {
            try
            {
                var competicion = await competicionService.GetByIdAsync(competicionId);
                if (competicion == null)
                    return Results.NotFound(new { success = false, message = "Competición no encontrada" });

                var config = competicionService.GetEventoConfig(competicion);
                var subtotal = CuponDescuentoService.CalculateSubtotal(config, false);
                EnsureCouponTotalIsValid(request, subtotal);

                var cupon = await service.UpdateAsync(competicionId, id, request);
                if (cupon == null)
                    return Results.NotFound(new { success = false, message = "Cupón no encontrado" });

                logger.LogInformation("Discount coupon updated: {CouponId} for competition {CompeticionId}", id, competicionId);
                return Results.Ok(new { success = true, data = cupon });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        adminGroup.MapPatch("/{id:int}/active", async (
            int competicionId,
            int id,
            [FromBody] CuponActiveRequest request,
            CuponDescuentoService service) =>
        {
            var cupon = await service.SetActiveAsync(competicionId, id, request.Activo);
            return cupon == null
                ? Results.NotFound(new { success = false, message = "Cupón no encontrado" })
                : Results.Ok(new { success = true, data = cupon });
        });

        app.MapPost("/api/competiciones/{slug}/cupones/validar", async (
            string slug,
            [FromBody] ValidateCuponRequest request,
            CompeticionService competicionService,
            CuponDescuentoService cuponService) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competición no encontrada" });

            var config = competicionService.GetEventoConfig(competicion);
            var subtotal = CuponDescuentoService.CalculateSubtotal(config, request.PeakProgram);
            var result = await cuponService.ValidatePublicAsync(competicion.Id, config, request.Codigo, subtotal);
            return Results.Ok(new { success = true, data = result });
        });
    }

    private static void EnsureCouponTotalIsValid(CuponDescuentoRequest request, decimal subtotal)
    {
        if (request.Valor < 0)
            throw new InvalidOperationException("El descuento no puede ser negativo.");

        var normalizedType = request.TipoDescuento.Trim().ToLowerInvariant();
        var descuento = normalizedType == CuponDescuentoService.TipoPorcentaje
            ? Math.Round(subtotal * (request.Valor / 100m), 2, MidpointRounding.AwayFromZero)
            : Math.Round(request.Valor, 2, MidpointRounding.AwayFromZero);

        if (request.Valor > 0)
        {
            var total = Math.Max(0m, subtotal - descuento);
            if (total > 0m && total < MinCheckoutTotal)
                throw new InvalidOperationException($"El total final debe ser 0,00 € o >= {MinCheckoutTotal:0.00} €. " +
                    $"El total con este cupón sería {total:0.00} €.");
        }
    }
}

public record CuponActiveRequest(bool Activo);

public record ValidateCuponRequest(string Codigo, bool PeakProgram = false, string? Modalidad = null);
