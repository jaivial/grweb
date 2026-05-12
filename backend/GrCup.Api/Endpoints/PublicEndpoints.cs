using GrCup.Api.Data;
using GrCup.Api.Services;
using GrCup.Api.Hubs;
using GrCup.Api.Models;
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
                    request.Phone,
                    request.CompeticionId
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

        // GET /api/tickets/session/{sessionId} - Retrieve purchase details from Stripe session
        app.MapGet("/api/tickets/session/{sessionId}", async (
            string sessionId,
            StripeService stripeService,
            ILogger<Program> logger) =>
        {
            try
            {
                var session = await stripeService.GetSessionAsync(sessionId);
                var (firstName, surname, email, instagram, ticketCount, _, _) = stripeService.ExtractMetadata(session);
                var totalPaid = stripeService.CalculateTotalPaid(session);

                return Results.Ok(new
                {
                    firstName,
                    surname,
                    email,
                    instagram,
                    ticketCount,
                    totalPaid,
                    sessionId = session.Id
                });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error retrieving session {SessionId}", sessionId);
                return Results.NotFound(new { error = "Session not found" });
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
        app.MapGet("/api/config/stripe", async (StripeService stripeService) =>
        {
            return Results.Ok(new {
                publishableKey = await stripeService.GetPublishableKeyAsync()
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

        // NOTE: /api/schedules/published has been moved to ScheduleEndpoints.cs
        // It now accepts an optional ?slug= parameter for competition scoping

        // POST /api/athletes - Public athlete registration with confirmation email
        app.MapPost("/api/athletes", async (
            [FromBody] Athlete athlete,
            AthleteService athleteService,
            EmailService emailService,
            ILogger<Program> logger) =>
        {
            if (string.IsNullOrWhiteSpace(athlete.FirstName) ||
                string.IsNullOrWhiteSpace(athlete.Surname) ||
                string.IsNullOrWhiteSpace(athlete.Email) ||
                string.IsNullOrWhiteSpace(athlete.WeightCategory))
            {
                return Results.BadRequest(new { error = "Nombre, apellidos, email y categoria son obligatorios." });
            }

            if (!athlete.Email.Contains("@"))
            {
                return Results.BadRequest(new { error = "Email invalido." });
            }

            try
            {
                var created = await athleteService.CreateAsync(athlete);

                // Send confirmation email (non-blocking for registration success)
                try
                {
                    await emailService.SendInscriptionConfirmationAsync(
                        created.Email,
                        created.FirstName,
                        created.Surname,
                        created.WeightCategory,
                        created.Sex.ToString(),
                        created.Club,
                        created.Coach);
                }
                catch (Exception emailEx)
                {
                    logger.LogError(emailEx, "Failed to send confirmation email to {Email}", created.Email);
                }

                // Send admin notification email (non-blocking)
                try
                {
                    await emailService.SendAdminNotificationAsync(
                        created.Email,
                        created.FirstName,
                        created.Surname,
                        created.Phone,
                        created.Sex.ToString(),
                        created.WeightCategory,
                        created.Club,
                        created.Coach,
                        created.TotalWeight);
                }
                catch (Exception emailEx)
                {
                    logger.LogError(emailEx, "Failed to send admin notification for {Email}", created.Email);
                }

                return Results.Created($"/api/athletes/{created.Id}", created);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error creating athlete");
                return Results.StatusCode(500);
            }
        });

        // GET /api/winner - Get latest confirmed winner
        app.MapGet("/api/winner", async (DrawService drawService) =>
        {
            var winner = await drawService.GetLatestConfirmedWinnerAsync();
            return Results.Ok(new { success = true, data = winner });
        });

        // GET /api/competiciones/:slug/config - Get public competition config with dynamic prices and categories
        app.MapGet("/api/competiciones/{slug}/config", async (
            string slug,
            CompeticionService competicionService,
            ScheduleService scheduleService,
            GrCupDbContext db) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competicion no encontrada" });

            var config = competicionService.GetEventoConfig(competicion);
            var plazasDisponibles = await competicionService.GetPlazasDisponiblesAsync(competicion.Id);
            
            // Get categories from schedules SCOPED to this competition
            var categoriasMasculino = await db.Schedules
                .Where(s => s.CompeticionId == competicion.Id && s.SexCategory == Models.Enums.Sex.Male)
                .Select(s => s.WeightCategory)
                .Distinct()
                .OrderBy(c => c)
                .ToListAsync();
            
            var categoriasFemenino = await db.Schedules
                .Where(s => s.CompeticionId == competicion.Id && s.SexCategory == Models.Enums.Sex.Female)
                .Select(s => s.WeightCategory)
                .Distinct()
                .OrderBy(c => c)
                .ToListAsync();

            return Results.Ok(new { 
                success = true, 
                data = new { 
                    precioBase = config.PrecioBase,
                    precioHandler = config.PrecioHandler,
                    precioUpsell = config.PrecioUpsell,
                    precioRifa = config.PrecioRifa,
                    precioTotal = config.PrecioBase + (config.PrecioHandler > 0 ? config.PrecioHandler : 0),
                    precioTotalConHandler = config.PrecioBase + config.PrecioHandler,
                    precioTotalConUpsell = config.PrecioBase + config.PrecioUpsell,
                    precioTotalConTodo = config.PrecioBase + config.PrecioUpsell + config.PrecioHandler,
                    aforoMaximo = config.AforoMaximo,
                    plazasDisponibles = plazasDisponibles,
                    inscripcionAbierta = config.InscripcionAbierta && plazasDisponibles > 0,
                    categoriasMasculino,
                    categoriasFemenino,
                    eventName = competicion.Nombre,
                    eventDate = competicion.Fecha.ToString("yyyy-MM-dd"),
                    eventLocation = competicion.Lugar,
                    contactEmail = competicion.EmailContacto,
                    horariosReady = competicion.HorariosReady,
                    instagramUrl = competicion.LandingConfig != null 
                        ? System.Text.Json.JsonSerializer.Deserialize<LandingConfig>(competicion.LandingConfig)?.InstagramUrl 
                        : null
                }
            });
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
    string? Phone,
    int? CompeticionId = null
);
