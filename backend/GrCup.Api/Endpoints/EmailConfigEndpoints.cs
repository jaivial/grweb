using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class EmailConfigEndpoints
{
    public static void MapEmailConfigEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/admin/email-config?competicionId=1
        app.MapGet("/api/admin/email-config", [Authorize] async (EmailConfigService service, int? competicionId) =>
        {
            var config = await service.GetConfigAsync(competicionId);
            if (config == null)
            {
            return Results.Ok(new
            {
                success = true,
                data = new EmailConfigResponse(
                    (int)EmailProvider.Smtp,
                    null,
                    null,
                    null,
                    null,
                    null,
                    "smtp.gmail.com",
                    587
                )
            });
            }
            return Results.Ok(new
            {
                success = true,
                data = new EmailConfigResponse(
                    (int)config.MainProvider,
                    config.GmailAddress,
                    EmailConfigMasker.MaskSecret(config.GmailAppPassword),
                    config.SmtpUsername,
                    EmailConfigMasker.MaskSecret(config.SmtpPassword),
                    config.SmtpEmailAddress,
                    config.SmtpHost,
                    config.SmtpPort
                )
            });
        });

        // PUT /api/admin/email-config?competicionId=1
        app.MapPut("/api/admin/email-config", [Authorize] async (
            EmailConfigService service,
            [FromBody] EmailConfigRequest request,
            int? competicionId) =>
        {
            var config = new EmailConfig
            {
                MainProvider = (EmailProvider)request.MainProvider,
                GmailAddress = request.GmailAddress,
                GmailAppPassword = request.GmailAppPassword,
                SmtpUsername = request.SmtpUsername,
                SmtpPassword = request.SmtpPassword,
                SmtpEmailAddress = request.SmtpEmailAddress,
                SmtpHost = request.SmtpHost,
                SmtpPort = request.SmtpPort
            };
            var result = await service.UpsertConfigAsync(config, competicionId);
            return Results.Ok(new
            {
                success = true,
                data = new EmailConfigResponse(
                    (int)result.MainProvider,
                    result.GmailAddress,
                    EmailConfigMasker.MaskSecret(result.GmailAppPassword),
                    result.SmtpUsername,
                    EmailConfigMasker.MaskSecret(result.SmtpPassword),
                    result.SmtpEmailAddress,
                    result.SmtpHost,
                    result.SmtpPort
                )
            });
        });

        // DELETE /api/admin/email-config?competicionId=1
        app.MapDelete("/api/admin/email-config", [Authorize] async (EmailConfigService service, int? competicionId) =>
        {
            var deleted = await service.DeleteConfigAsync(competicionId);
            return deleted ? Results.Ok(new { success = true, message = "Configuración eliminada" }) : Results.NotFound(new { success = false, message = "No se encontró configuración" });
        });
    }
}

public record EmailConfigRequest(
    int MainProvider,
    string? GmailAddress,
    string? GmailAppPassword,
    string? SmtpUsername,
    string? SmtpPassword,
    string? SmtpEmailAddress,
    string? SmtpHost,
    int SmtpPort
);

/// <summary>
/// Response DTO that masks sensitive email configuration secrets.
/// Secrets are NEVER returned in plain text - only masked values or null.
/// </summary>
public record EmailConfigResponse(
    int MainProvider,
    string? GmailAddress,
    string? GmailAppPasswordMasked,
    string? SmtpUsername,
    string? SmtpPasswordMasked,
    string? SmtpEmailAddress,
    string? SmtpHost,
    int SmtpPort
);

/// <summary>
/// Helper class to mask sensitive email configuration values.
/// </summary>
public static class EmailConfigMasker
{
    /// <summary>
    /// Masks a secret value, returning only the last 4 characters prefixed with asterisks.
    /// Returns null if the input is null or empty.
    /// </summary>
    public static string? MaskSecret(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return null;

        if (value.Length <= 4)
            return new string('*', value.Length);

        return new string('*', value.Length - 4) + value[^4..];
    }
}
