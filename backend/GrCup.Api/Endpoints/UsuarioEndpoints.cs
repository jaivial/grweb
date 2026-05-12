using GrCup.Api.Services;
using GrCup.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace GrCup.Api.Endpoints;

// Login request for new auth system
public record NewLoginRequest(string? Email, string Password);

public static class UsuarioEndpoints
{
    public static void MapUsuarioEndpoints(this IEndpointRouteBuilder app)
    {
        // ─── Authentication ───
        var authGroup = app.MapGroup("/api/auth");

        // POST /api/auth/login - Login with email/password
        authGroup.MapPost("/login", async (
            [FromBody] NewLoginRequest request,
            UsuarioService service,
            HttpContext context,
            IWebHostEnvironment env,
            ILogger<Program> logger) =>
        {
            var email = request.Email ?? "";
            var result = await service.AuthenticateAsync(email, request.Password);

            if (result == null)
            {
                logger.LogWarning("Failed login attempt for {Email}", email);
                return Results.Unauthorized();
            }

            logger.LogInformation("User logged in: {Email}", email);

            // Set HttpOnly cookie
            context.Response.Cookies.Append("gr_token", result.Token, new CookieOptions
            {
                HttpOnly = true,
                Secure = !env.IsDevelopment(),
                SameSite = SameSiteMode.Lax,
                Path = "/",
                MaxAge = TimeSpan.FromDays(1)
            });

            return Results.Ok(new
            {
                success = true,
                data = result.User
            });
        });

        // POST /api/auth/logout - Logout
        authGroup.MapPost("/logout", (HttpContext context) =>
        {
            context.Response.Cookies.Delete("gr_token");
            return Results.Ok(new { success = true });
        });

        // GET /api/auth/me - Get current user
        authGroup.MapGet("/me", [Authorize] async (
            HttpContext context,
            UsuarioService service,
            JwtService jwtService) =>
        {
            var token = context.Request.Cookies["gr_token"]
                ?? context.Request.Headers.Authorization.ToString().Replace("Bearer ", "");

            if (string.IsNullOrEmpty(token))
                return Results.Unauthorized();

            var usuario = await service.VerifyTokenAsync(token);
            if (usuario == null)
                return Results.Unauthorized();

            return Results.Ok(new
            {
                success = true,
                data = service.MapToUserResponse(usuario)
            });
        });

        // ─── Admin Users (Superadmin only) ───
        var adminGroup = app.MapGroup("/api/admin/users").RequireAuthorization();

        // GET /api/admin/users - List all users
        adminGroup.MapGet("/", async (
            HttpContext context,
            UsuarioService service) =>
        {
            // Check if superadmin
            if (!context.User.IsInRole("Superadmin"))
                return Results.Forbid();

            var usuarios = await service.GetAllAsync(includeInactive: true);
            return Results.Ok(new
            {
                success = true,
                data = usuarios.Select(u => service.MapToUserResponse(u))
            });
        });

        // GET /api/admin/users/:id - Get user by ID
        adminGroup.MapGet("/{id:int}", async (
            int id,
            HttpContext context,
            UsuarioService service) =>
        {
            if (!context.User.IsInRole("Superadmin"))
                return Results.Forbid();

            var usuario = await service.GetByIdAsync(id);
            if (usuario == null)
                return Results.NotFound(new { success = false, message = "User not found" });

            return Results.Ok(new
            {
                success = true,
                data = service.MapToUserResponse(usuario)
            });
        });

        // POST /api/admin/users - Create new user
        adminGroup.MapPost("/", async (
            [FromBody] CreateUsuarioRequest request,
            HttpContext context,
            UsuarioService service,
            ILogger<Program> logger) =>
        {
            if (!context.User.IsInRole("Superadmin"))
                return Results.Forbid();

            try
            {
                var usuario = await service.CreateAsync(request);
                logger.LogInformation("User created: {Email}", usuario.Email);

                return Results.Created($"/api/admin/users/{usuario.Id}", new
                {
                    success = true,
                    data = service.MapToUserResponse(usuario)
                });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to create user");
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // PUT /api/admin/users/:id - Update user
        adminGroup.MapPut("/{id:int}", async (
            int id,
            [FromBody] UpdateUsuarioRequest request,
            HttpContext context,
            UsuarioService service,
            ILogger<Program> logger) =>
        {
            if (!context.User.IsInRole("Superadmin"))
                return Results.Forbid();

            try
            {
                var usuario = await service.UpdateAsync(id, request);
                if (usuario == null)
                    return Results.NotFound(new { success = false, message = "User not found" });

                logger.LogInformation("User updated: {Id}", id);
                return Results.Ok(new
                {
                    success = true,
                    data = service.MapToUserResponse(usuario)
                });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to update user");
                return Results.BadRequest(new { success = false, message = ex.Message });
            }
        });

        // DELETE /api/admin/users/:id - Soft delete user
        adminGroup.MapDelete("/{id:int}", async (
            int id,
            HttpContext context,
            UsuarioService service,
            ILogger<Program> logger) =>
        {
            if (!context.User.IsInRole("Superadmin"))
                return Results.Forbid();

            var success = await service.DeleteAsync(id);
            if (!success)
                return Results.NotFound(new { success = false, message = "User not found" });

            logger.LogInformation("User deactivated: {Id}", id);
            return Results.Ok(new { success = true, message = "User deactivated" });
        });

        // POST /api/admin/users/:id/competiciones - Assign user to competition
        adminGroup.MapPost("/{id:int}/competiciones", async (
            int id,
            [FromBody] AssignToCompetitionRequest request,
            HttpContext context,
            UsuarioService service,
            ILogger<Program> logger) =>
        {
            if (!context.User.IsInRole("Superadmin"))
                return Results.Forbid();

            var assignment = await service.AssignToCompetitionAsync(id, request.CompeticionId, request.Role);
            logger.LogInformation("User {UserId} assigned to competition {CompeticionId} as {Role}",
                id, request.CompeticionId, request.Role);

            return Results.Ok(new { success = true, data = assignment });
        });

        // DELETE /api/admin/users/:id/competiciones/:competicionId - Remove user from competition
        adminGroup.MapDelete("/{id:int}/competiciones/{competicionId:int}", async (
            int id,
            int competicionId,
            HttpContext context,
            UsuarioService service,
            ILogger<Program> logger) =>
        {
            if (!context.User.IsInRole("Superadmin"))
                return Results.Forbid();

            var success = await service.RemoveFromCompetitionAsync(id, competicionId);
            if (!success)
                return Results.NotFound(new { success = false, message = "Assignment not found" });

            logger.LogInformation("User {UserId} removed from competition {CompeticionId}", id, competicionId);
            return Results.Ok(new { success = true });
        });

        // PUT /api/admin/users/:id/permissions - Set user permissions
        adminGroup.MapPut("/{id:int}/permissions", async (
            int id,
            [FromBody] List<SetPermissionRequest> permissions,
            HttpContext context,
            UsuarioService service,
            ILogger<Program> logger) =>
        {
            if (!context.User.IsInRole("Superadmin"))
                return Results.Forbid();

            foreach (var p in permissions)
            {
                await service.SetPermissionAsync(id, p.PermissionKey, p.Granted, p.CompeticionId);
            }

            logger.LogInformation("User {UserId} permissions updated", id);
            return Results.Ok(new { success = true });
        });
    }
}

