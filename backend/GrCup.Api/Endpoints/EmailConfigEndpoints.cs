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
                    data = new
                    {
                        mainProvider = (int)EmailProvider.Smtp,
                        gmailAddress = (string?)null,
                        gmailAppPassword = (string?)null,
                        smtpUsername = (string?)null,
                        smtpPassword = (string?)null,
                        smtpEmailAddress = (string?)null,
                        smtpHost = "smtp.gmail.com",
                        smtpPort = 587
                    }
                });
            }
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    mainProvider = (int)config.MainProvider,
                    gmailAddress = config.GmailAddress,
                    gmailAppPassword = config.GmailAppPassword,
                    smtpUsername = config.SmtpUsername,
                    smtpPassword = config.SmtpPassword,
                    smtpEmailAddress = config.SmtpEmailAddress,
                    smtpHost = config.SmtpHost,
                    smtpPort = config.SmtpPort
                }
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
                data = new
                {
                    mainProvider = (int)result.MainProvider,
                    gmailAddress = result.GmailAddress,
                    gmailAppPassword = result.GmailAppPassword,
                    smtpUsername = result.SmtpUsername,
                    smtpPassword = result.SmtpPassword,
                    smtpEmailAddress = result.SmtpEmailAddress,
                    smtpHost = result.SmtpHost,
                    smtpPort = result.SmtpPort
                }
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
