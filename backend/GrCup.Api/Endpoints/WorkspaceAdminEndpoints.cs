using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Endpoints;

public static class WorkspaceAdminEndpoints
{
    public static void MapWorkspaceAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/workspaces")
            .RequireAuthorization();

        group.MapGet("/", async (
            HttpContext context,
            GrCupDbContext db,
            CompeticionService competicionService) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await IsRootUserAsync(db, currentUserId.Value))
                return Results.Forbid();

            var competiciones = await db.Competiciones
                .Include(c => c.UsuarioCompeticiones)
                .OrderByDescending(c => c.Fecha)
                .ToListAsync();

            var result = new List<WorkspaceSummaryResponse>();
            foreach (var competicion in competiciones)
            {
                result.Add(await BuildSummaryAsync(competicion, competicionService, competicion.UsuarioCompeticiones.Count));
            }

            return Results.Ok(new { success = true, data = result });
        });

        group.MapGet("/{competitionId:int}", async (
            int competitionId,
            HttpContext context,
            GrCupDbContext db,
            CompeticionService competicionService) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await IsRootUserAsync(db, currentUserId.Value))
                return Results.Forbid();

            var competicion = await db.Competiciones
                .Include(c => c.UsuarioCompeticiones)
                .FirstOrDefaultAsync(c => c.Id == competitionId);

            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Workspace not found" });

            var summary = await BuildSummaryAsync(competicion, competicionService, competicion.UsuarioCompeticiones.Count);
            var detail = new WorkspaceDetailResponse(
                summary.Id,
                summary.Nombre,
                summary.Slug,
                summary.Fecha,
                summary.Lugar,
                summary.Tipo,
                summary.Activo,
                summary.LogoUrl,
                summary.FaviconUrl,
                competicion.EmailContacto,
                competicion.Telefono,
                competicion.Descripcion,
                summary.PlazasDisponibles,
                summary.MemberCount,
                summary.ModulesEnabled,
                summary.ModulesTotal,
                summary.Modules,
                competicion.CreatedAt,
                competicion.UpdatedAt
            );

            return Results.Ok(new { success = true, data = detail });
        });

        group.MapPut("/{competitionId:int}/modules", async (
            int competitionId,
            [FromBody] UpdateWorkspaceModulesRequest request,
            HttpContext context,
            GrCupDbContext db,
            CompeticionService competicionService,
            ILogger<Program> logger) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await IsRootUserAsync(db, currentUserId.Value))
                return Results.Forbid();

            if (request.Modules == null)
                return Results.BadRequest(new { success = false, message = "Modules payload is required" });

            try
            {
                var competicion = await competicionService.UpdateModulesAsync(competitionId, request.Modules);
                if (competicion == null)
                    return Results.NotFound(new { success = false, message = "Workspace not found" });

                logger.LogInformation("Workspace modules updated: {CompetitionId}", competitionId);
                return Results.Ok(new
                {
                    success = true,
                    data = CompeticionService.GetModulesForCompetition(competicion)
                });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        group.MapPatch("/{competitionId:int}/members/{usuarioId:int}", async (
            int competitionId,
            int usuarioId,
            [FromBody] UpdateCompetitionMemberRequest request,
            HttpContext context,
            GrCupDbContext db,
            UserManagementService userService,
            ILogger<Program> logger) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await IsRootUserAsync(db, currentUserId.Value))
                return Results.Forbid();

            try
            {
                var member = await userService.UpdateCompetitionMemberAsync(usuarioId, competitionId, request, currentUserId.Value);
                logger.LogInformation("Workspace member {UsuarioId} updated in competition {CompetitionId}", usuarioId, competitionId);
                return Results.Ok(new { success = true, data = member });
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { success = false, message = ex.Message });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Results.Json(new { success = false, message = ex.Message }, statusCode: 403);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        group.MapDelete("/{competitionId:int}/members/{usuarioId:int}", async (
            int competitionId,
            int usuarioId,
            HttpContext context,
            GrCupDbContext db,
            CompeticionService competicionService,
            UserManagementService userService,
            EmailService emailService,
            ILogger<Program> logger) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (currentUserId.Value == usuarioId)
                return Results.BadRequest(new { success = false, message = "You cannot remove your own competition membership" });

            if (!await IsRootUserAsync(db, currentUserId.Value))
                return Results.Forbid();

            var member = await userService.GetCompetitionMemberAsync(competitionId, usuarioId);
            if (member == null)
                return Results.NotFound(new { success = false, message = "User not found in workspace" });

            var competicion = await competicionService.GetByIdAsync(competitionId);
            if (competicion == null)
                return Results.NotFound(new { success = false, message = "Workspace not found" });

            var removed = await userService.RemoveUserFromCompetitionAsync(usuarioId, competitionId);
            if (!removed)
                return Results.NotFound(new { success = false, message = "User not found in workspace" });

            string? warning = null;
            try
            {
                await emailService.SendWorkspaceMemberRemovedAsync(member.Email, member.Nombre, competicion.Nombre, competitionId);
            }
            catch (Exception ex)
            {
                warning = "Miembro eliminado, pero el email no pudo ser enviado";
                logger.LogWarning(ex, "Failed to send workspace removal email to {Email} for competition {CompetitionId}", member.Email, competitionId);
            }

            logger.LogInformation("Workspace member {UsuarioId} removed from competition {CompetitionId}", usuarioId, competitionId);
            return Results.Ok(new { success = true, warning });
        });
    }

    private static async Task<bool> IsRootUserAsync(GrCupDbContext db, int userId)
    {
        return await db.Usuarios.AnyAsync(u => u.Id == userId && u.IsActive && (u.IsRoot || u.IsSuperadmin));
    }

    private static async Task<WorkspaceSummaryResponse> BuildSummaryAsync(
        Competicion competicion,
        CompeticionService competicionService,
        int memberCount)
    {
        var modules = CompeticionService.GetModulesForCompetition(competicion);
        return new WorkspaceSummaryResponse(
            competicion.Id,
            competicion.Nombre,
            competicion.Slug,
            competicion.Fecha,
            competicion.Lugar,
            competicion.Tipo,
            competicion.Activo,
            competicion.LogoUrl,
            competicion.FaviconUrl,
            await competicionService.GetPlazasDisponiblesAsync(competicion.Id),
            memberCount,
            modules.Count(m => m.Enabled),
            modules.Count,
            modules
        );
    }
}

public record WorkspaceSummaryResponse(
    int Id,
    string Nombre,
    string Slug,
    DateTime Fecha,
    string Lugar,
    string Tipo,
    bool Activo,
    string? LogoUrl,
    string? FaviconUrl,
    int PlazasDisponibles,
    int MemberCount,
    int ModulesEnabled,
    int ModulesTotal,
    List<CompetitionModuleResponse> Modules
);

public record WorkspaceDetailResponse(
    int Id,
    string Nombre,
    string Slug,
    DateTime Fecha,
    string Lugar,
    string Tipo,
    bool Activo,
    string? LogoUrl,
    string? FaviconUrl,
    string? EmailContacto,
    string? Telefono,
    string? Descripcion,
    int PlazasDisponibles,
    int MemberCount,
    int ModulesEnabled,
    int ModulesTotal,
    List<CompetitionModuleResponse> Modules,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record UpdateWorkspaceModulesRequest(List<CompetitionModuleUpdate> Modules);
