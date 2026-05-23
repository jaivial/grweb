using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using GrCup.Api.Services;

namespace GrCup.Api.Extensions;

/// <summary>
/// Centralized authorization endpoint extensions for Minimal API security filters.
/// Provides RequireRootAdmin(), RequireAdminRole(), and RequireCompetitionPermission()
/// for fine-grained access control without repetitive attribute decoration.
/// </summary>
public static class AuthorizationEndpointExtensions
{
    /// <summary>
    /// Requires the user to be authenticated (any valid JWT token).
    /// </summary>
    public static async Task<IResult> RequireAuthenticated(HttpContext context)
    {
        if (!context.User.Identity?.IsAuthenticated ?? true)
        {
            return Results.Unauthorized();
        }
        return Results.Ok();
    }

    /// <summary>
    /// Requires the user to have Superadmin or Root privileges.
    /// Returns 403 Forbidden for non-root/admin users.
    /// </summary>
    public static async Task<IResult> RequireRootAdmin(HttpContext context, PermissionService permissionService)
    {
        if (!context.User.Identity?.IsAuthenticated ?? true)
        {
            return Results.Unauthorized();
        }

        // Check is_root or is_superadmin claim
        var isRoot = context.User.HasClaim("is_root", "true") || context.User.HasClaim("is_superadmin", "true");
        if (!isRoot)
        {
            return Results.Forbid();
        }

        return Results.Ok();
    }

    /// <summary>
    /// Requires the user to have at least Admin role (root, superadmin, or admin).
    /// Returns 403 Forbidden for staff, registrador, or unauthenticated users.
    /// </summary>
    public static async Task<IResult> RequireAdminRole(HttpContext context)
    {
        if (!context.User.Identity?.IsAuthenticated ?? true)
        {
            return Results.Unauthorized();
        }

        var role = context.User.FindFirst(ClaimTypes.Role)?.Value;
        if (string.IsNullOrEmpty(role))
        {
            return Results.Forbid();
        }

        // Normalize role for comparison
        var normalizedRole = role.ToLowerInvariant();
        if (normalizedRole is "root" or "superadmin" or "admin")
        {
            return Results.Ok();
        }

        return Results.Forbid();
    }

    /// <summary>
    /// Requires the user to have a specific competition-level permission.
    /// The competicionId is extracted from the route or query parameters.
    /// Returns 403 if permission is missing, 400 if competicionId is invalid.
    /// </summary>
    public static async Task<IResult> RequireCompetitionPermission(
        HttpContext context,
        PermissionService permissionService,
        string permission,
        int? competicionId = null)
    {
        if (!context.User.Identity?.IsAuthenticated ?? true)
        {
            return Results.Unauthorized();
        }

        // Superadmin/root has all permissions
        var isRoot = context.User.HasClaim("is_root", "true") || context.User.HasClaim("is_superadmin", "true");
        if (isRoot)
        {
            return Results.Ok();
        }

        // If competicionId not provided, try to extract from route
        if (!competicionId.HasValue)
        {
            // Try route parameter first
            if (context.Request.RouteValues.TryGetValue("competicionId", out var routeCompId) &&
                int.TryParse(routeCompId?.ToString(), out var parsed))
            {
                competicionId = parsed;
            }
            // Try query string
            else if (context.Request.Query.TryGetValue("competicionId", out var queryCompId) &&
                     int.TryParse(queryCompId.FirstOrDefault(), out var queryParsed))
            {
                competicionId = queryParsed;
            }
        }

        if (!competicionId.HasValue)
        {
            return Results.BadRequest(new { error = "competicionId is required" });
        }

        // Get user ID from token
        var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)
            ?? context.User.FindFirst("sub")
            ?? context.User.FindFirst("user_id");

        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
        {
            return Results.Unauthorized();
        }

        var hasPermission = await permissionService.HasPermissionAsync(userId, permission, competicionId.Value);
        if (!hasPermission)
        {
            return Results.Forbid();
        }

        return Results.Ok();
    }

    /// <summary>
    /// Requires the user to have at least one of the specified competition permissions.
    /// </summary>
    public static async Task<IResult> RequireAnyCompetitionPermission(
        HttpContext context,
        PermissionService permissionService,
        params string[] permissions)
    {
        if (!context.User.Identity?.IsAuthenticated ?? true)
        {
            return Results.Unauthorized();
        }

        // Superadmin/root has all permissions
        var isRoot = context.User.HasClaim("is_root", "true") || context.User.HasClaim("is_superadmin", "true");
        if (isRoot)
        {
            return Results.Ok();
        }

        // Extract competicionId from route or query
        int? competicionId = null;
        if (context.Request.RouteValues.TryGetValue("competicionId", out var routeCompId) &&
            int.TryParse(routeCompId?.ToString(), out var parsed))
        {
            competicionId = parsed;
        }
        else if (context.Request.Query.TryGetValue("competicionId", out var queryCompId) &&
                 int.TryParse(queryCompId.FirstOrDefault(), out var queryParsed))
        {
            competicionId = queryParsed;
        }

        // Get user ID from token
        var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)
            ?? context.User.FindFirst("sub")
            ?? context.User.FindFirst("user_id");

        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
        {
            return Results.Unauthorized();
        }

        foreach (var permission in permissions)
        {
            if (await permissionService.HasPermissionAsync(userId, permission, competicionId))
            {
                return Results.Ok();
            }
        }

        return Results.Forbid();
    }
}
