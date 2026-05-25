using GrCup.Api.Models;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GrCup.Api.Endpoints;

public static class StripeConfigEndpoints
{
    private static bool HasKey(string? key) => !string.IsNullOrWhiteSpace(key);

    public static void MapStripeConfigEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/stripe-config?competicionId=1
        app.MapGet("/api/admin/stripe-config", [Authorize] async (StripeConfigService service, int? competicionId) =>
        {
            var config = await service.GetExactConfigAsync(competicionId);
            if (config == null)
            {
                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        hasSecretKey = false,
                        publishableKey = (string?)null,
                        hasWebhookSecret = false,
                        activo = false
                    }
                });
            }
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    hasSecretKey = HasKey(config.SecretKey),
                    publishableKey = config.PublishableKey,
                    hasWebhookSecret = HasKey(config.WebhookSecret),
                    activo = config.Activo
                }
            });
        });

        // PUT /api/admin/stripe-config?competicionId=1
        app.MapPut("/api/admin/stripe-config", [Authorize] async (
            StripeConfigService service,
            [FromBody] StripeConfigRequest request,
            int? competicionId) =>
        {
            var config = new StripeConfig
            {
                SecretKey = request.SecretKey,
                PublishableKey = request.PublishableKey,
                WebhookSecret = request.WebhookSecret,
                Activo = request.Activo ?? false
            };
            var result = await service.UpsertConfigAsync(config, competicionId, request.Activo);
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    hasSecretKey = HasKey(result.SecretKey),
                    publishableKey = result.PublishableKey,
                    hasWebhookSecret = HasKey(result.WebhookSecret),
                    activo = result.Activo
                }
            });
        });

        // PUT /api/admin/stripe-config/active?competicionId=1
        app.MapPut("/api/admin/stripe-config/active", [Authorize] async (
            StripeConfigService service,
            [FromBody] StripeConfigActiveRequest request,
            int? competicionId) =>
        {
            var result = await service.SetActiveAsync(competicionId, request.Activo);
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    hasSecretKey = HasKey(result.SecretKey),
                    publishableKey = result.PublishableKey,
                    hasWebhookSecret = HasKey(result.WebhookSecret),
                    activo = result.Activo
                }
            });
        });

        // DELETE /api/admin/stripe-config?competicionId=1
        app.MapDelete("/api/admin/stripe-config", [Authorize] async (StripeConfigService service, int? competicionId) =>
        {
            var deleted = await service.DeleteConfigAsync(competicionId);
            return deleted ? Results.Ok(new { success = true, message = "Configuración Stripe eliminada" }) : Results.NotFound(new { success = false, message = "No se encontró configuración Stripe" });
        });
    }
}

public record StripeConfigRequest(
    string? SecretKey,
    string? PublishableKey,
    string? WebhookSecret,
    bool? Activo = null
);

public record StripeConfigActiveRequest(bool Activo);
