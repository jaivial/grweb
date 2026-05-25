using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GrCup.Api.Endpoints;

public static class CuponDescuentoEndpoints
{
    public static void MapCuponDescuentoEndpoints(this IEndpointRouteBuilder app)
    {
        var adminGroup = app.MapGroup("/api/admin/competiciones/{competicionId:int}/cupones").RequireAuthorization();

        adminGroup.MapGet("/", async (int competicionId, CuponDescuentoService service) =>
        {
            var cupones = await service.GetAllAsync(competicionId);
            return Results.Ok(new { success = true, data = cupones });
        });

        adminGroup.MapPost("/", async (
            int competicionId,
            [FromBody] CuponDescuentoRequest request,
            CuponDescuentoService service,
            ILogger<Program> logger) =>
        {
            try
            {
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
            ILogger<Program> logger) =>
        {
            try
            {
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
}

public record CuponActiveRequest(bool Activo);

public record ValidateCuponRequest(string Codigo, bool PeakProgram = false, string? Modalidad = null);
