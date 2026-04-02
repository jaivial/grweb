using GrCup.Api.Data;
using GrCup.Api.Services;
using GrCup.Api.Hubs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class PublicEndpoints
{
    public static void MapPublicEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/tickets/buy - Create Stripe checkout session
        app.MapPost("/api/tickets/buy", async (
            [FromBody] TicketPurchaseRequest request,
            StripeService stripeService,
            ILogger<Program> logger) =>
        {
            try
            {
                // Validate request
                if (request.TicketCount < 1)
                    return Results.BadRequest(new { error = "Minimum 1 ticket required" });

                if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains("@"))
                    return Results.BadRequest(new { error = "Valid email required" });

                if (string.IsNullOrWhiteSpace(request.Instagram))
                    return Results.BadRequest(new { error = "Instagram username required" });

                // Create Stripe checkout session
                var successUrl = $"{request.FrontendUrl}/success?session_id={{CHECKOUT_SESSION_ID}}";
                var cancelUrl = $"{request.FrontendUrl}/checkout";

                var session = await stripeService.CreateCheckoutSessionAsync(
                    request.FirstName,
                    request.Surname,
                    request.Email,
                    request.Instagram,
                    request.TicketCount,
                    successUrl,
                    cancelUrl,
                    request.Phone
                );

                logger.LogInformation("Created Stripe session {SessionId} for {Email}", session.Id, request.Email);

                return Results.Ok(new { 
                    sessionId = session.Id,
                    url = session.Url 
                });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error creating checkout session");
                return Results.StatusCode(500);
            }
        });

        // GET /api/participants/count - Get total participant count
        app.MapGet("/api/participants/count", async (
            ParticipantService participantService) =>
        {
            var count = await participantService.GetCountAsync();
            return Results.Ok(new { count });
        });

        // GET /api/config/stripe - Get Stripe publishable key
        app.MapGet("/api/config/stripe", (StripeService stripeService) =>
        {
            return Results.Ok(new {
                publishableKey = stripeService.GetPublishableKey()
            });
        });

        // GET /api/inscripcion-config - Get public inscripcion config (active, url)
        app.MapGet("/api/inscripcion-config", async (GrCupDbContext db) =>
        {
            var config = await db.InscripcionConfig.FirstOrDefaultAsync();
            return Results.Ok(new {
                active = config?.Active ?? true,
                url = config?.Url ?? null
            });
        });

        // GET /api/inscripcion-preparada - Get public inscripcion prepared status
        app.MapGet("/api/inscripcion-preparada", async (GrCupDbContext db) =>
        {
            var config = await db.InscripcionesPreparadas.FirstOrDefaultAsync();
            var responsable = await db.ResponsableInscripcion.FirstOrDefaultAsync();
            var urlInscripcion = await db.UrlInscripcion.FirstOrDefaultAsync();
            return Results.Ok(new {
                prepared = config?.Preparadas ?? false,
                responsable = responsable?.Value ?? true,
                aepUrl = urlInscripcion?.Url ?? null
            });
        });

        // GET /api/winner - Get latest confirmed winner
        app.MapGet("/api/winner", async (DrawService drawService) =>
        {
            var winner = await drawService.GetLatestConfirmedWinnerAsync();
            return Results.Ok(new { success = true, data = winner });
        });
    }
}

public record TicketPurchaseRequest(
    string FirstName,
    string Surname,
    string Email,
    string Instagram,
    int TicketCount,
    string FrontendUrl,
    string? Phone
);
