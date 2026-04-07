using GrCup.Api.Models;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GrCup.Api.Endpoints;

public static class StripeConfigEndpoints
{
    private static string MaskKey(string? key)
    {
        if (string.IsNullOrEmpty(key)) return string.Empty;
        if (key.Length <= 4) return "****";
        return "****" + key[^4..];
    }

    public static void MapStripeConfigEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/stripe-config
        app.MapGet("/api/admin/stripe-config", [Authorize] async (StripeConfigService service) =>
        {
            var config = await service.GetConfigAsync();
            if (config == null)
            {
                return Results.Ok(new
                {
                    secretKey = (string?)null,
                    publishableKey = (string?)null,
                    webhookSecret = (string?)null
                });
            }
            return Results.Ok(new
            {
                secretKey = MaskKey(config.SecretKey),
                publishableKey = config.PublishableKey,
                webhookSecret = MaskKey(config.WebhookSecret)
            });
        });

        // PUT /api/admin/stripe-config
        app.MapPut("/api/admin/stripe-config", [Authorize] async (
            StripeConfigService service,
            [FromBody] StripeConfigRequest request) =>
        {
            var config = new StripeConfig
            {
                SecretKey = request.SecretKey,
                PublishableKey = request.PublishableKey,
                WebhookSecret = request.WebhookSecret
            };
            var result = await service.UpsertConfigAsync(config);
            return Results.Ok(new
            {
                secretKey = MaskKey(result.SecretKey),
                publishableKey = result.PublishableKey,
                webhookSecret = MaskKey(result.WebhookSecret)
            });
        });

        // DELETE /api/admin/stripe-config
        app.MapDelete("/api/admin/stripe-config", [Authorize] async (StripeConfigService service) =>
        {
            var deleted = await service.DeleteConfigAsync();
            return deleted ? Results.Ok(new { message = "Configuración Stripe eliminada" }) : Results.NotFound(new { message = "No se encontró configuración Stripe" });
        });
    }
}

public record StripeConfigRequest(
    string? SecretKey,
    string? PublishableKey,
    string? WebhookSecret
);
