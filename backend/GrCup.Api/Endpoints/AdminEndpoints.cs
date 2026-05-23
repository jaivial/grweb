using System.Text;
using GrCup.Api.Services;
using GrCup.Api.Models;
using GrCup.Api.Hubs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace GrCup.Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        // ─── Authentication ───

        // POST /api/admin/login - authenticate using database credentials
        app.MapPost("/api/admin/login", async (
            [FromBody] LoginRequest request,
            UsuarioService usuarioService,
            JwtService jwtService,
            IWebHostEnvironment env,
            HttpContext context,
            ILogger<Program> logger) =>
        {
            var result = await usuarioService.AuthenticateAsync(request.Username, request.Password);
            if (result == null)
            {
                logger.LogWarning("Failed admin login attempt for {Username}", request.Username);
                return Results.Unauthorized();
            }

            logger.LogInformation("Admin login successful for {Username}", request.Username);

            // Set HttpOnly cookie - Secure only in production (HTTPS)
            context.Response.Cookies.Append("gr_cup_token", result.Token, new CookieOptions
            {
                HttpOnly = true,
                Secure = !env.IsDevelopment(),
                SameSite = SameSiteMode.Lax,
                Path = "/",
                MaxAge = TimeSpan.FromDays(1)
            });

            return Results.Ok(new { success = true, user = result.User });
        });

        // POST /api/admin/logout
        app.MapPost("/api/admin/logout", (HttpContext context) =>
        {
            context.Response.Cookies.Delete("gr_cup_token");
            return Results.Ok(new { success = true });
        });

        // GET /api/admin/verify
        app.MapGet("/api/admin/verify", [Authorize] (HttpContext context) =>
        {
            var username = context.User.Identity?.Name;
            return Results.Ok(new { username, valid = true });
        });

        // ─── Statistics ───
        
        // GET /api/admin/statistics
        app.MapGet("/api/admin/statistics", [Authorize] async (
            ParticipantService participantService) =>
        {
            var totalParticipants = await participantService.GetCountAsync();
            var totalTickets = await participantService.GetTotalTicketsAsync();
            var totalRevenue = await participantService.GetTotalRevenueAsync();
            var revenueByMethod = await participantService.GetRevenueByPaymentMethodAsync();

            return Results.Ok(new
            {
                totalParticipants,
                totalTickets,
                totalRevenue = Math.Round(totalRevenue, 2),
                cashRevenue = Math.Round(revenueByMethod.GetValueOrDefault("cash", 0), 2),
                stripeRevenue = Math.Round(revenueByMethod.GetValueOrDefault("stripe", 0), 2),
                bankRevenue = Math.Round(revenueByMethod.GetValueOrDefault("bank", 0), 2)
            });
        });

        // ─── Participants Management ───
        
        // GET /api/admin/participants
        app.MapGet("/api/admin/participants", [Authorize] async (
            ParticipantService participantService,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 15,
            [FromQuery] string? search = null,
            [FromQuery] string sortBy = "createdAt",
            [FromQuery] string sortOrder = "desc",
            [FromQuery] bool? isPaid = null,
            [FromQuery] string? paymentMethod = null) =>
        {
            var (participants, totalCount) = await participantService.GetAllPaginatedAsync(
                page, pageSize, search, sortBy, sortOrder, isPaid, paymentMethod
            );

            return Results.Ok(new
            {
                participants,
                totalCount,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
            });
        });

        // GET /api/admin/participants/{id}
        app.MapGet("/api/admin/participants/{id}", [Authorize] async (
            int id,
            ParticipantService participantService) =>
        {
            var participant = await participantService.GetByIdAsync(id);
            return participant != null ? Results.Ok(participant) : Results.NotFound();
        });

        // GET /api/admin/export/csv
        app.MapGet("/api/admin/export/csv", [Authorize] async (
            ParticipantService participantService) =>
        {
            var participants = await participantService.GetAllForExportAsync();

            var csv = new StringBuilder();
            csv.AppendLine("Name,Surname,Email,Instagram,Tickets,Total Paid (€),Date");

            foreach (var p in participants)
            {
                csv.AppendLine($"\"{p.FirstName}\",\"{p.Surname}\",\"{p.Email}\",\"{p.Instagram}\",{p.TicketCount},{p.TotalPaid},{p.CreatedAt:yyyy-MM-dd HH:mm:ss}");
            }

            var bytes = Encoding.UTF8.GetBytes(csv.ToString());
            return Results.File(bytes, "text/csv", $"gr-cup-participants-{DateTime.UtcNow:yyyyMMdd}.csv");
        });

        // POST /api/admin/participants/manual - Create manual participant (cash/bank/stripe without payment)
        app.MapPost("/api/admin/participants/manual", [Authorize] async (
            [FromBody] ManualParticipantRequest request,
            ParticipantService participantService,
            EmailService emailService,
            IHubContext<ParticipantsHub> hubContext,
            ILogger<Program> logger) =>
        {
            // Validate request
            if (string.IsNullOrWhiteSpace(request.FirstName))
                return Results.BadRequest(new { error = "First name is required" });

            if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains("@"))
                return Results.BadRequest(new { error = "Valid email is required" });

            if (request.TicketCount < 1)
                return Results.BadRequest(new { error = "Minimum 1 ticket required" });

            var validPaymentMethods = new[] { "cash", "bank", "stripe" };
            if (string.IsNullOrWhiteSpace(request.PaymentMethod) || !validPaymentMethods.Contains(request.PaymentMethod.ToLower()))
                return Results.BadRequest(new { error = "Invalid payment method. Must be: cash, bank, or stripe" });

            var totalPaid = request.TicketCount * request.Price;
            var isPaid = true;
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();
            var normalizedMethod = request.PaymentMethod.ToLower();

            // Check for existing participant with same email + paymentMethod combination
            var existing = await participantService.GetByEmailAndMethodAsync(normalizedEmail, normalizedMethod, isPaid);
            Participant participant;

            if (existing != null)
            {
                // Update existing record: add tickets and total paid for this payment method
                participant = await participantService.UpdateAsync(
                    existing.Id,
                    request.TicketCount,
                    totalPaid,
                    isPaid,
                    normalizedMethod,
                    null,
                    request.Price
                );
                logger.LogInformation(
                    "Manual participant updated (existing): {Email}, added {TicketCount} tickets, {PaymentMethod}",
                    normalizedEmail, request.TicketCount, normalizedMethod
                );
            }
            else
            {
                participant = await participantService.CreateManualAsync(
                    request.FirstName,
                    request.Surname ?? "",
                    normalizedEmail,
                    request.Instagram ?? "",
                    request.TicketCount,
                    totalPaid,
                    request.Phone,
                    request.Price,
                    isPaid,
                    normalizedMethod
                );
                logger.LogInformation(
                    "Manual participant created: {Email}, {TicketCount} tickets, {PaymentMethod}",
                    normalizedEmail, request.TicketCount, normalizedMethod
                );
            }

            // Broadcast updated count
            var count = await participantService.GetCountAsync();
            await hubContext.BroadcastParticipantCountAsync(count);

            // Send raffle confirmation email (non-blocking)
            try
            {
                await emailService.SendRaffleConfirmationAsync(
                    normalizedEmail,
                    request.FirstName,
                    request.Surname ?? "",
                    request.TicketCount,
                    totalPaid,
                    request.Instagram,
                    request.CompeticionId);
            }
            catch (Exception emailEx)
            {
                logger.LogError(emailEx, "Failed to send raffle confirmation email to {Email}", normalizedEmail);
            }

            return Results.Ok(participant);
        });

        // PUT /api/admin/participants/{id}
        app.MapPut("/api/admin/participants/{id}", [Authorize] async (
            int id,
            [FromBody] UpdateParticipantRequest request,
            ParticipantService participantService,
            ILogger<Program> logger) =>
        {
            var participant = await participantService.UpdateFullAsync(
                id,
                request.FirstName,
                request.Surname ?? "",
                request.Email,
                request.Instagram ?? "",
                request.TicketCount,
                request.TicketCount * (request.Price ?? 0.5m),
                request.Phone,
                request.Price,
                request.IsPaid,
                request.PaymentMethod
            );

            if (participant == null)
                return Results.NotFound();

            logger.LogInformation("Participant updated: {Id}", id);
            return Results.Ok(participant);
        });

        // DELETE /api/admin/participants/{id}
        app.MapDelete("/api/admin/participants/{id}", [Authorize] async (
            int id,
            ParticipantService participantService,
            IHubContext<ParticipantsHub> hubContext,
            ILogger<Program> logger) =>
        {
            var success = await participantService.DeleteAsync(id);

            if (!success)
                return Results.NotFound();

            // Broadcast updated count
            var count = await participantService.GetCountAsync();
            await hubContext.BroadcastParticipantCountAsync(count);

            logger.LogInformation("Participant deleted: {Id}", id);
            return Results.Ok(new { message = "Participant deleted successfully" });
        });

        // ─── Winner Draw ───
        
        // POST /api/admin/draw
        app.MapPost("/api/admin/draw", [Authorize] async (
            DrawService drawService,
            ILogger<Program> logger) =>
        {
            var draw = await drawService.SelectRandomWinnerAsync();
            
            if (draw == null)
                return Results.BadRequest(new { error = "No participants available for draw" });

            logger.LogInformation("Winner drawn: {Email}", draw.WinnerEmail);
            return Results.Ok(draw);
        });

        // POST /api/admin/draw/{id}/confirm
        app.MapPost("/api/admin/draw/{id}/confirm", [Authorize] async (
            int id,
            DrawService drawService,
            IHubContext<ParticipantsHub> hubContext,
            ILogger<Program> logger) =>
        {
            var draw = await drawService.ConfirmWinnerAsync(id);
            
            if (draw == null)
                return Results.NotFound();

            await hubContext.BroadcastWinnerAsync(new
            {
                draw.Id,
                draw.WinnerName,
                draw.WinnerInstagram,
                draw.WinnerTicketCount,
                draw.DrawDate
            });

            logger.LogInformation("Winner confirmed and broadcast: {Email}", draw.WinnerEmail);
            return Results.Ok(draw);
        });

        // GET /api/admin/draws
        app.MapGet("/api/admin/draws", [Authorize] async (
            DrawService drawService) =>
        {
            var draws = await drawService.GetDrawHistoryAsync();
            return Results.Ok(draws);
        });

        // DELETE /api/admin/draw/{id}
        app.MapDelete("/api/admin/draw/{id}", [Authorize] async (
            int id,
            DrawService drawService,
            ILogger<Program> logger) =>
        {
            var success = await drawService.VoidDrawAsync(id);
            
            if (!success)
                return Results.NotFound();

            logger.LogWarning("Draw {Id} voided", id);
            return Results.Ok(new { message = "Draw voided successfully" });
        });
    }
}

public record LoginRequest(string Username, string Password);

public record ManualParticipantRequest(
    string FirstName,
    string? Surname,
    string Email,
    string? Instagram,
    int TicketCount,
    decimal Price,
    string PaymentMethod,
    string? Phone,
    int? CompeticionId = null
);

public record UpdateParticipantRequest(
    string FirstName,
    string? Surname,
    string Email,
    string? Instagram,
    int TicketCount,
    decimal? Price,
    bool IsPaid,
    string? PaymentMethod,
    string? Phone
);
