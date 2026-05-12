using System.Security.Claims;
using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Services;

/// <summary>
/// Service for checking user permissions in the multi-tenant system.
/// Supports 5 roles: root, admin, manager, empleado, checkin.
/// </summary>
public class PermissionService
{
    private readonly GrCupDbContext _context;

    // System-level permissions (root/superadmin only)
    public const string SystemManageUsers = "system:manage_users";
    public const string SystemManageRoles = "system:manage_roles";
    public const string SystemViewAudit = "system:view_audit";
    public const string SystemConfig = "system:config";

    // Competition-level permissions (per competicion)
    public const string CompViewDashboard = "comp:view_dashboard";
    public const string CompViewInscriptos = "comp:view_inscriptos";
    public const string CompManageInscriptos = "comp:manage_inscriptos";
    public const string CompExportData = "comp:export_data";
    public const string CompManageConfig = "comp:manage_config";
    public const string CompViewRaffle = "comp:view_raffle";
    public const string CompManageRaffle = "comp:manage_raffle";
    public const string CompSellTickets = "comp:sell_tickets";
    public const string CompDoCheckin = "comp:do_checkin";
    public const string CompViewHorarios = "comp:view_horarios";
    public const string CompManageHorarios = "comp:manage_horarios";
    public const string CompViewParticipantes = "comp:view_participantes";

    // All competition permissions (for root/admin)
    private static readonly string[] AllCompPermissions = new[]
    {
        CompViewDashboard, CompViewInscriptos, CompManageInscriptos,
        CompExportData, CompManageConfig, CompViewRaffle,
        CompManageRaffle, CompSellTickets, CompDoCheckin,
        CompViewHorarios, CompManageHorarios, CompViewParticipantes
    };

    // All system permissions (for root/superadmin)
    private static readonly string[] AllSystemPermissions = new[]
    {
        SystemManageUsers, SystemManageRoles, SystemViewAudit, SystemConfig
    };

    // Role -> permission mapping
    private static readonly Dictionary<string, string[]> RolePermissions = new()
    {
        ["root"] = AllCompPermissions.Concat(AllSystemPermissions).ToArray(),
        ["admin"] = AllCompPermissions,
        ["manager"] = new[]
        {
            CompViewDashboard, CompViewInscriptos, CompManageInscriptos,
            CompViewRaffle, CompManageRaffle, CompDoCheckin,
            CompSellTickets, CompExportData,
            CompViewHorarios, CompManageHorarios,
            CompViewParticipantes
        },
        ["empleado"] = new[]
        {
            CompViewInscriptos, CompDoCheckin,
            CompViewHorarios, CompManageHorarios,
            CompSellTickets
        },
        ["checkin"] = new[]
        {
            CompDoCheckin
        },
    };

    // Legacy role alias: 'operator' maps to 'empleado'
    private static string NormalizeRole(string role)
    {
        if (role == "operator") return "empleado";
        return role;
    }

    // Valid roles
    public static readonly string[] ValidRoles = { "root", "admin", "manager", "empleado", "checkin" };

    public PermissionService(GrCupDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Get permissions for a given role (normalized)
    /// </summary>
    public static string[] GetPermissionsForRole(string role)
    {
        var normalized = NormalizeRole(role);
        return RolePermissions.GetValueOrDefault(normalized, Array.Empty<string>());
    }

    /// <summary>
    /// Check if a user has a specific permission
    /// </summary>
    public async Task<bool> HasPermissionAsync(int usuarioId, string permission, int? competicionId = null)
    {
        var user = await _context.Usuarios
            .Include(u => u.UsuarioCompeticiones)
            .Include(u => u.UsuarioPermissions)
            .FirstOrDefaultAsync(u => u.Id == usuarioId);

        if (user == null || !user.IsActive)
            return false;

        // Superadmin (root) has all permissions
        if (user.IsSuperadmin)
            return true;

        // System permissions require superadmin
        if (permission.StartsWith("system:"))
            return false;

        // Competition permissions
        if (competicionId.HasValue)
        {
            var userComp = user.UsuarioCompeticiones
                .FirstOrDefault(uc => uc.CompeticionId == competicionId.Value);

            if (userComp == null)
                return false;

            var normalizedRole = NormalizeRole(userComp.Role);
            var rolePerms = RolePermissions.GetValueOrDefault(normalizedRole, Array.Empty<string>());

            // Strip the "comp:" prefix for comparison since role permissions are stored without it
            var permName = permission.StartsWith("comp:") ? permission : $"comp:{permission}";
            return rolePerms.Contains(permName);
        }

        // Check granular permissions
        var granularPermission = user.UsuarioPermissions
            .FirstOrDefault(p => 
                p.PermissionKey == permission && 
                (p.CompeticionId == competicionId || p.CompeticionId == null));

        return granularPermission?.Granted ?? false;
    }

    /// <summary>
    /// Get all permissions for a user in a competition
    /// </summary>
    public async Task<List<string>> GetUserPermissionsAsync(int usuarioId, int? competicionId = null)
    {
        var user = await _context.Usuarios
            .Include(u => u.UsuarioCompeticiones)
            .Include(u => u.UsuarioPermissions)
            .FirstOrDefaultAsync(u => u.Id == usuarioId);

        if (user == null || !user.IsActive)
            return new List<string>();

        var permissions = new HashSet<string>();

        // Superadmin has all permissions
        if (user.IsSuperadmin)
        {
            foreach (var p in AllSystemPermissions)
                permissions.Add(p);
            foreach (var p in AllCompPermissions)
                permissions.Add(p);
            return permissions.ToList();
        }

        // Add role-based permissions
        if (competicionId.HasValue)
        {
            var userComp = user.UsuarioCompeticiones
                .FirstOrDefault(uc => uc.CompeticionId == competicionId.Value);

            if (userComp != null)
            {
                var normalizedRole = NormalizeRole(userComp.Role);
                var rolePerms = RolePermissions.GetValueOrDefault(normalizedRole, Array.Empty<string>());
                foreach (var p in rolePerms)
                    permissions.Add(p);
            }
        }
        else
        {
            // Add permissions from all competitions
            foreach (var uc in user.UsuarioCompeticiones)
            {
                var normalizedRole = NormalizeRole(uc.Role);
                var rolePerms = RolePermissions.GetValueOrDefault(normalizedRole, Array.Empty<string>());
                foreach (var p in rolePerms)
                    permissions.Add(p);
            }
        }

        // Add granular permissions
        foreach (var up in user.UsuarioPermissions)
        {
            if (up.Granted)
            {
                if (!competicionId.HasValue || up.CompeticionId == competicionId || up.CompeticionId == null)
                {
                    permissions.Add(up.PermissionKey);
                }
            }
        }

        return permissions.ToList();
    }

    /// <summary>
    /// Check if user has any of the specified permissions
    /// </summary>
    public async Task<bool> HasAnyPermissionAsync(int usuarioId, params string[] permissions)
    {
        foreach (var permission in permissions)
        {
            if (await HasPermissionAsync(usuarioId, permission))
                return true;
        }
        return false;
    }

    /// <summary>
    /// Check if user has all of the specified permissions
    /// </summary>
    public async Task<bool> HasAllPermissionsAsync(int usuarioId, params string[] permissions)
    {
        foreach (var permission in permissions)
        {
            if (!await HasPermissionAsync(usuarioId, permission))
                return false;
        }
        return true;
    }

    /// <summary>
    /// Check if user can access a specific competition
    /// </summary>
    public async Task<bool> CanAccessCompeticionAsync(int usuarioId, int competicionId)
    {
        var user = await _context.Usuarios
            .Include(u => u.UsuarioCompeticiones)
            .FirstOrDefaultAsync(u => u.Id == usuarioId);

        if (user == null || !user.IsActive)
            return false;

        if (user.IsSuperadmin)
            return true;

        return user.UsuarioCompeticiones.Any(uc => uc.CompeticionId == competicionId);
    }

    /// <summary>
    /// Get all competitions a user can access
    /// </summary>
    public async Task<List<Competicion>> GetUserCompeticionesAsync(int usuarioId)
    {
        var user = await _context.Usuarios
            .Include(u => u.UsuarioCompeticiones)
            .ThenInclude(uc => uc.Competicion)
            .FirstOrDefaultAsync(u => u.Id == usuarioId);

        if (user == null || !user.IsActive)
            return new List<Competicion>();

        if (user.IsSuperadmin)
        {
            return await _context.Competiciones
                .Where(c => c.Activo)
                .ToListAsync();
        }

        return user.UsuarioCompeticiones
            .Where(uc => uc.Competicion.Activo)
            .Select(uc => uc.Competicion)
            .ToList();
    }

    /// <summary>
    /// Assign a role to a user for a competition
    /// </summary>
    public async Task AssignRoleAsync(int usuarioId, int competicionId, string role)
    {
        var normalizedRole = NormalizeRole(role);

        var existing = await _context.UsuariosCompeticiones
            .FirstOrDefaultAsync(uc => uc.UsuarioId == usuarioId && uc.CompeticionId == competicionId);

        if (existing != null)
        {
            existing.Role = normalizedRole;
        }
        else
        {
            _context.UsuariosCompeticiones.Add(new UsuarioCompeticion
            {
                UsuarioId = usuarioId,
                CompeticionId = competicionId,
                Role = normalizedRole
            });
        }

        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// Set a granular permission for a user
    /// </summary>
    public async Task SetPermissionAsync(int usuarioId, string permissionKey, bool granted, int? competicionId = null)
    {
        var existing = await _context.UsuariosPermissions
            .FirstOrDefaultAsync(up => 
                up.UsuarioId == usuarioId && 
                up.PermissionKey == permissionKey && 
                up.CompeticionId == competicionId);

        if (existing != null)
        {
            existing.Granted = granted;
        }
        else
        {
            _context.UsuariosPermissions.Add(new UsuarioPermission
            {
                UsuarioId = usuarioId,
                PermissionKey = permissionKey,
                Granted = granted,
                CompeticionId = competicionId
            });
        }

        await _context.SaveChangesAsync();
    }
}

/// <summary>
/// Extension methods for checking permissions
/// </summary>
public static class PermissionExtensions
{
    /// <summary>
    /// Check if the current user is a superadmin (from claims)
    /// </summary>
    public static bool IsSuperadmin(this ClaimsPrincipal user)
    {
        return user.HasClaim("is_superadmin", "true") || user.IsInRole("Superadmin");
    }

    /// <summary>
    /// Get the current user ID from claims
    /// </summary>
    public static int? GetUserId(this ClaimsPrincipal user)
    {
        var claim = user.FindFirst(ClaimTypes.NameIdentifier)
            ?? user.FindFirst("sub")
            ?? user.FindFirst("user_id");
        if (claim != null && int.TryParse(claim.Value, out var id))
            return id;
        return null;
    }

    /// <summary>
    /// Get the current user's role for a competition from claims
    /// </summary>
    public static string? GetCompeticionRole(this ClaimsPrincipal user, int competicionId)
    {
        var compClaim = user.FindAll("competicion")
            .FirstOrDefault(c => c.Value.StartsWith($"{competicionId}:"));
        if (compClaim != null)
        {
            var parts = compClaim.Value.Split(':');
            if (parts.Length == 2)
                return parts[1];
        }
        return null;
    }
}
