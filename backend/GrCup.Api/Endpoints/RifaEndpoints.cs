using System.Security.Cryptography;
using GrCup.Api.Services;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class RifaEndpoints
{
    public static void MapRifaEndpoints(this IEndpointRouteBuilder app)
    {
        // ─── Public Rifa Endpoints ───
        var publicGroup = app.MapGroup("/api/competiciones/{slug}/rifa");

        // GET /api/competiciones/:slug/rifa - Get raffle info
        publicGroup.MapGet("/", async (
            string slug,
            CompeticionService competicionService,
            GrCup.Api.Data.GrCupDbContext context) =>
        {
            var competicion = await competicionService.GetBySlugAsync(slug);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Competition not found" });

            var config = await context.RifaConfigs
                .FirstOrDefaultAsync(r => r.CompeticionId == competicion.Id);

            var ticketsVendidos = await context.RifaTickets
                .CountAsync(t => t.CompeticionId == competicion.Id && t.Confirmado);

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    activo = config?.Activo ?? false,
                    nombrePremio = config?.NombrePremio,
                    descripcionPremio = config?.DescripcionPremio,
                    precioTicket = config?.PrecioTicket ?? 5,
                    ticketsTotal = config?.TicketsTotal ?? 100,
                    ticketsVendidos,
                    ticketsDisponibles = (config?.TicketsTotal ?? 100) - ticketsVendidos,
                    fechaSorteo = config?.FechaSorteo,
                    numeroGanador = config?.NumeroGanador
                }
            });
        });

        // ─── Admin Rifa Endpoints ───

        var adminGroup = app.MapGroup("/api/admin/competiciones/{competicionId:int}/rifa")
            .RequireAuthorization();

        // GET /api/admin/competiciones/:id/rifa - Get raffle config
        adminGroup.MapGet("/", async (
            int competicionId,
            GrCup.Api.Data.GrCupDbContext context) =>
        {
            var config = await context.RifaConfigs
                .FirstOrDefaultAsync(r => r.CompeticionId == competicionId);

            return Results.Ok(new
            {
                success = true,
                data = config ?? new RifaConfig
                {
                    CompeticionId = competicionId,
                    PrecioTicket = 5,
                    TicketsTotal = 100,
                    Activo = false
                }
            });
        });

        // PUT /api/admin/competiciones/:id/rifa - Update raffle config
        adminGroup.MapPut("/", async (
            int competicionId,
            [FromBody] UpdateRifaConfigRequest request,
            GrCup.Api.Data.GrCupDbContext context,
            ILogger<Program> logger) =>
        {
            var config = await context.RifaConfigs
                .FirstOrDefaultAsync(r => r.CompeticionId == competicionId);

            if (config == null)
            {
                config = new RifaConfig
                {
                    CompeticionId = competicionId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                context.RifaConfigs.Add(config);
            }

            if (request.NombrePremio != null)
                config.NombrePremio = request.NombrePremio;
            if (request.DescripcionPremio != null)
                config.DescripcionPremio = request.DescripcionPremio;
            if (request.PrecioTicket.HasValue)
                config.PrecioTicket = request.PrecioTicket.Value;
            if (request.TicketsTotal.HasValue)
                config.TicketsTotal = request.TicketsTotal.Value;
            if (request.Activo.HasValue)
                config.Activo = request.Activo.Value;
            if (request.FechaSorteo.HasValue)
                config.FechaSorteo = request.FechaSorteo.Value;

            config.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync();
            logger.LogInformation("Raffle config updated for competition {Id}", competicionId);

            return Results.Ok(new { success = true, data = config });
        });

        // GET /api/admin/competiciones/:id/rifa/tickets - List tickets
        adminGroup.MapGet("/tickets", async (
            int competicionId,
            bool? confirmado,
            int page = 1,
            int pageSize = 20,
            GrCup.Api.Data.GrCupDbContext context = null!) =>
        {
            var query = context.RifaTickets
                .Where(t => t.CompeticionId == competicionId)
                .AsQueryable();

            if (confirmado.HasValue)
                query = query.Where(t => t.Confirmado == confirmado.Value);

            var total = await query.CountAsync();
            var tickets = await query
                .OrderByDescending(t => t.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    items = tickets,
                    total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling(total / (double)pageSize)
                }
            });
        });

        // POST /api/admin/competiciones/:id/rifa/tickets - Sell ticket
        adminGroup.MapPost("/tickets", async (
            int competicionId,
            [FromBody] SellTicketRequest? request,
            GrCup.Api.Data.GrCupDbContext context,
            ILogger<Program> logger) =>
        {
            // Generate ticket number if not provided
            var numeroTicket = request?.NumeroTicket ?? GenerateTicketNumber();

            // Check if ticket number already exists
            var exists = await context.RifaTickets
                .AnyAsync(t => t.CompeticionId == competicionId && t.NumeroTicket == numeroTicket);

            if (exists)
                return Results.BadRequest(new { success = false, message = "Ticket number already exists" });

            var config = await context.RifaConfigs
                .FirstOrDefaultAsync(r => r.CompeticionId == competicionId);

            if (config == null || !config.Activo)
                return Results.BadRequest(new { success = false, message = "Raffle is not active" });

            // Check capacity
            var ticketsVendidos = await context.RifaTickets
                .CountAsync(t => t.CompeticionId == competicionId && t.Confirmado);

            if (ticketsVendidos >= config.TicketsTotal)
                return Results.BadRequest(new { success = false, message = "All tickets sold" });

            var ticket = new RifaTicket
            {
                CompeticionId = competicionId,
                NumeroTicket = numeroTicket,
                InscripcionId = request?.InscripcionId,
                BuyerEmail = request?.BuyerEmail,
                BuyerNombre = request?.BuyerNombre,
                Confirmado = true, // Cash payments are confirmed immediately
                CreatedAt = DateTime.UtcNow
            };

            context.RifaTickets.Add(ticket);
            await context.SaveChangesAsync();

            logger.LogInformation("Ticket sold: {Numero} for competition {CompeticionId}", numeroTicket, competicionId);

            return Results.Created($"/api/admin/competiciones/{competicionId}/rifa/tickets/{ticket.Id}", new
            {
                success = true,
                data = ticket
            });
        });

        // POST /api/admin/competiciones/:id/rifa/sorteo - Perform draw
        adminGroup.MapPost("/sorteo", async (
            int competicionId,
            GrCup.Api.Data.GrCupDbContext context,
            ILogger<Program> logger) =>
        {
            var config = await context.RifaConfigs
                .FirstOrDefaultAsync(r => r.CompeticionId == competicionId);

            if (config == null)
                return Results.NotFound(new { success = false, message = "Raffle config not found" });

            var confirmedTickets = await context.RifaTickets
                .Where(t => t.CompeticionId == competicionId && t.Confirmado)
                .ToListAsync();

            if (!confirmedTickets.Any())
                return Results.BadRequest(new { success = false, message = "No confirmed tickets to draw from" });

            // Random selection
            var winningTicket = confirmedTickets.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).First();

            config.NumeroGanador = winningTicket.NumeroTicket;
            config.GanadorInscripcionId = winningTicket.InscripcionId;
            config.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync();

            logger.LogInformation("Winner drawn: {Numero} for competition {CompeticionId}",
                winningTicket.NumeroTicket, competicionId);

            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    numeroGanador = winningTicket.NumeroTicket,
                    buyerEmail = winningTicket.BuyerEmail,
                    buyerNombre = winningTicket.BuyerNombre,
                    winnerInscripcionId = winningTicket.InscripcionId
                }
            });
        });

        // POST /api/admin/competiciones/:id/rifa/:ticketId/confirmar - Confirm winner
        adminGroup.MapPost("/{ticketId:int}/confirmar", async (
            int competicionId,
            int ticketId,
            GrCup.Api.Data.GrCupDbContext context,
            ILogger<Program> logger) =>
        {
            var config = await context.RifaConfigs
                .FirstOrDefaultAsync(r => r.CompeticionId == competicionId);

            if (config == null)
                return Results.NotFound(new { success = false, message = "Raffle config not found" });

            config.GanadorConfirmado = true;
            config.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync();
            logger.LogInformation("Winner confirmed for competition {CompeticionId}", competicionId);

            return Results.Ok(new { success = true });
        });
    }

    private static string GenerateTicketNumber()
    {
        var bytes = new byte[4];
        RandomNumberGenerator.Fill(bytes);
        var number = Math.Abs(BitConverter.ToInt32(bytes)) % 100000;
        return number.ToString("D5");
    }
}

public record UpdateRifaConfigRequest(
    string? NombrePremio,
    string? DescripcionPremio,
    decimal? PrecioTicket,
    int? TicketsTotal,
    bool? Activo,
    DateTime? FechaSorteo
);

public record SellTicketRequest(
    string? NumeroTicket,
    int? InscripcionId,
    string? BuyerEmail,
    string? BuyerNombre
);
