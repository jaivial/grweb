using System.Security.Claims;
using GrCup.Api.Models.Enums;
using GrCup.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GrCup.Api.Endpoints;

public static class CompetitionUsersEndpoints
{
    public static void MapCompetitionUsersEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/competition/{competicionId}/users")
            .RequireAuthorization();

        group.MapGet("/", async (
            int competicionId,
            HttpContext context,
            UserManagementService userService,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] string? search = null,
            [FromQuery] string? role = null,
            [FromQuery] bool? status = null) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await userService.CanManageUsersAsync(currentUserId.Value, competicionId))
                return Results.Forbid();

            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            if (!string.IsNullOrWhiteSpace(role) && !UserRoleNames.IsValid(role))
                return Results.BadRequest(new { success = false, message = $"Invalid role '{role}'", code = "INVALID_ROLE" });

            var result = await userService.GetCompetitionMembersPaginatedAsync(competicionId, page, pageSize, search, role, status);
            return Results.Ok(new { success = true, data = result });
        });

        var rolesGroup = app.MapGroup("/api/competition/{competicionId:int}/roles")
            .RequireAuthorization();

        rolesGroup.MapGet("/", async (
            int competicionId,
            HttpContext context,
            UserManagementService userService) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await userService.CanManageUsersAsync(currentUserId.Value, competicionId))
                return Results.Forbid();

            var roles = await userService.GetCompetitionRolesAsync(competicionId);
            return Results.Ok(new { success = true, data = roles });
        });

        rolesGroup.MapGet("/{roleSlug}/members", async (
            int competicionId,
            string roleSlug,
            HttpContext context,
            UserManagementService userService) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await userService.CanManageUsersAsync(currentUserId.Value, competicionId))
                return Results.Forbid();

            var normalizedRole = UserRoleNames.Normalize(roleSlug);
            if (string.IsNullOrWhiteSpace(normalizedRole))
                return Results.BadRequest(new { success = false, message = $"Invalid role '{roleSlug}'" });

            var roleWithMembers = await userService.GetCompetitionRoleWithMembersAsync(competicionId, normalizedRole);
            if (roleWithMembers == null)
                return Results.NotFound(new { success = false, message = $"Role '{roleSlug}' not found" });

            return Results.Ok(new { success = true, data = roleWithMembers });
        });

        group.MapGet("/{usuarioId:int}", async (
            int competicionId,
            int usuarioId,
            HttpContext context,
            UserManagementService userService) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await userService.CanManageUsersAsync(currentUserId.Value, competicionId))
                return Results.Forbid();

            var member = await userService.GetCompetitionMemberAsync(competicionId, usuarioId);
            return member == null
                ? Results.NotFound(new { success = false, message = "User not found in competition" })
                : Results.Ok(new { success = true, data = member });
        });

        group.MapPost("/", async (
            int competicionId,
            [FromBody] CreateCompetitionUserRequest request,
            HttpContext context,
            UserManagementService userService,
            CompeticionService competicionService,
            EmailService emailService,
            ILogger<Program> logger) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await userService.CanManageUsersAsync(currentUserId.Value, competicionId))
                return Results.Forbid();

            if (!await userService.CanAssignRoleAsync(currentUserId.Value, request.Role))
                return Results.Forbid();

            var password = string.IsNullOrWhiteSpace(request.Password)
                ? UserManagementService.GenerateTemporaryPassword()
                : request.Password.Trim();

            try
            {
                var invitedByEmail = context.User.FindFirstValue(ClaimTypes.Email) ?? "system";
                var usuario = await userService.CreateUserAsync(request, competicionId, password, invitedByEmail);
                var competicion = await competicionService.GetByIdAsync(competicionId);
                var emailSent = false;

                if (competicion != null)
                {
                    try
                    {
                        await emailService.SendUserInvitationAsync(
                            request.Email,
                            request.Nombre,
                            password,
                            competicion.Nombre,
                            competicionId);
                        emailSent = true;
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Failed to send invitation email to {Email} for competition {CompeticionId}", request.Email, competicionId);
                    }
                }

                var member = await userService.GetCompetitionMemberAsync(competicionId, usuario.Id);
                logger.LogInformation("Backoffice user {Email} created for competition {CompeticionId}, email sent: {EmailSent}", usuario.Email, competicionId, emailSent);

                return Results.Created($"/api/competition/{competicionId}/users/{usuario.Id}", new
                {
                    success = true,
                    data = member,
                    warning = emailSent ? null : "Usuario creado pero el email de invitacion no pudo ser enviado"
                });
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(new { success = false, message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                if (ex.Message.Contains("already exists", StringComparison.OrdinalIgnoreCase))
                    return Results.Conflict(new { success = false, message = ex.Message });

                return Results.BadRequest(new { success = false, message = ex.Message });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to create backoffice user for competition {CompeticionId}", competicionId);
                return Results.BadRequest(new { success = false, message = "Failed to create user" });
            }
        });

        group.MapPut("/{usuarioId:int}/role", async (
            int competicionId,
            int usuarioId,
            [FromBody] UpdateCompetitionUserRoleRequest request,
            HttpContext context,
            UserManagementService userService,
            ILogger<Program> logger) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (!await userService.CanManageUsersAsync(currentUserId.Value, competicionId))
                return Results.Forbid();

            if (!await userService.CanModifyUserRoleAsync(currentUserId.Value, usuarioId, competicionId))
            {
                var targetRole = await userService.GetTargetUserRoleAsync(usuarioId, competicionId);
                if (targetRole == UserRoleNames.Admin || targetRole == UserRoleNames.Root)
                    return Results.Json(new { success = false, message = "No puedes modificar usuarios con rol admin o root" }, statusCode: 403);
                return Results.Json(new { success = false, message = "No tienes permisos para modificar este usuario" }, statusCode: 403);
            }

            try
            {
                var updated = await userService.UpdateUserRoleAsync(usuarioId, competicionId, request.Role, currentUserId.Value);
                if (!updated)
                    return Results.BadRequest(new { success = false, message = "No se pudo actualizar el rol" });

                var member = await userService.GetCompetitionMemberAsync(competicionId, usuarioId);
                logger.LogInformation("Backoffice user {UsuarioId} role updated in competition {CompeticionId}", usuarioId, competicionId);
                return Results.Ok(new { success = true, data = member });
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        group.MapDelete("/{usuarioId:int}", async (
            int competicionId,
            int usuarioId,
            HttpContext context,
            UserManagementService userService,
            ILogger<Program> logger) =>
        {
            var currentUserId = context.User.GetUserId();
            if (!currentUserId.HasValue)
                return Results.Unauthorized();

            if (currentUserId.Value == usuarioId)
                return Results.BadRequest(new { success = false, message = "You cannot remove your own competition membership" });

            if (!await userService.CanManageUsersAsync(currentUserId.Value, competicionId))
                return Results.Forbid();

            if (!await userService.CanModifyUserRoleAsync(currentUserId.Value, usuarioId, competicionId))
                return Results.Forbid();

            var removed = await userService.RemoveUserFromCompetitionAsync(usuarioId, competicionId);
            if (!removed)
                return Results.NotFound(new { success = false, message = "User not found in competition" });

            logger.LogInformation("Backoffice user {UsuarioId} removed from competition {CompeticionId}", usuarioId, competicionId);
            return Results.Ok(new { success = true });
        });
    }
}
