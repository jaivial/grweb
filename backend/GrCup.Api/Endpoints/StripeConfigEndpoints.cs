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
        // GET /api/admin/stripe-config?competicionId=1
        app.MapGet("/api/admin/stripe-config", [Authorize] async (StripeConfigService service, int? competicionId) =>
        {
            var config = await service.GetConfigAsync(competicionId);
            if (config == null)
            {
                return Results.Ok(new
                {
                    success = true,
                    data = new
                    {
                        secretKey = (string?)null,
                        publishableKey = (string?)null,
                        webhookSecret = (string?)null
                    }
                });
            }
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    secretKey = MaskKey(config.SecretKey),
                    publishableKey = config.PublishableKey,
                    webhookSecret = MaskKey(config.WebhookSecret)
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
                WebhookSecret = request.WebhookSecret
            };
            var result = await service.UpsertConfigAsync(config, competicionId);
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    secretKey = MaskKey(result.SecretKey),
                    publishableKey = result.PublishableKey,
                    webhookSecret = MaskKey(result.WebhookSecret)
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
    string? WebhookSecret
);
