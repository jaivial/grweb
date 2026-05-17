using System.Security.Cryptography;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Services;

public class UserManagementService
{
    private const string PasswordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
    private readonly GrCupDbContext _context;

    public UserManagementService(GrCupDbContext context)
    {
        _context = context;
    }

    public async Task<List<CompetitionMemberResponse>> GetCompetitionMembersAsync(int competicionId)
    {
        return await _context.UsuariosCompeticiones
            .Include(uc => uc.Usuario)
            .Where(uc => uc.CompeticionId == competicionId)
            .OrderBy(uc => uc.Role)
            .ThenBy(uc => uc.Usuario.Nombre)
            .Select(uc => new CompetitionMemberResponse(
                uc.UsuarioId,
                uc.Usuario.Nombre,
                uc.Usuario.Email,
                UserRoleNames.Normalize(uc.Role),
                uc.Usuario.IsActive,
                !uc.InvitationAccepted && uc.InvitedAt != null,
                uc.InvitedAt,
                uc.InvitationAccepted ? uc.InvitedAt : null,
                null
            ))
            .ToListAsync();
    }

    public async Task<List<CompetitionRoleResponse>> GetCompetitionRolesAsync(int competicionId)
    {
        var members = await GetCompetitionMembersAsync(competicionId);
        var roles = new[] { "root", "admin", "staff", "registrador" };

        var roleList = new List<CompetitionRoleResponse>();
        foreach (var role in roles)
        {
            var roleMembers = members.Where(m => m.Role == role).ToList();
            roleList.Add(new CompetitionRoleResponse(
                role,
                GetRoleName(role),
                GetRoleDescription(role),
                roleMembers.Count,
                GetRoleCapabilities(role),
                GetRoleRestrictions(role)
            ));
        }

        return roleList;
    }

    public async Task<CompetitionRoleWithMembersResponse?> GetCompetitionRoleWithMembersAsync(int competicionId, string normalizedRole)
    {
        var members = await GetCompetitionMembersAsync(competicionId);
        var roleMembers = members.Where(m => m.Role == normalizedRole).ToList();

        if (!roleMembers.Any() && normalizedRole != "root")
        {
            return null;
        }

        var capabilities = GetRoleCapabilities(normalizedRole);
        var restrictions = GetRoleRestrictions(normalizedRole);

        return new CompetitionRoleWithMembersResponse(
            normalizedRole,
            GetRoleName(normalizedRole),
            GetRoleDescription(normalizedRole),
            roleMembers.Count,
            capabilities,
            restrictions,
            roleMembers
        );
    }

    public async Task<CompetitionMemberResponse?> GetCompetitionMemberAsync(int competicionId, int usuarioId)
    {
        var assignment = await _context.UsuariosCompeticiones
            .Include(uc => uc.Usuario)
            .FirstOrDefaultAsync(uc => uc.CompeticionId == competicionId && uc.UsuarioId == usuarioId);

        if (assignment == null)
            return null;

        InvitedByInfo? invitedBy = null;
        if (!string.IsNullOrEmpty(assignment.InvitedByEmail))
        {
            var inviter = await _context.Usuarios
                .FirstOrDefaultAsync(u => u.Email.ToLower() == assignment.InvitedByEmail.ToLower());
            if (inviter != null)
            {
                invitedBy = new InvitedByInfo(inviter.Id, inviter.Nombre, inviter.Email);
            }
        }

        return new CompetitionMemberResponse(
            assignment.UsuarioId,
            assignment.Usuario.Nombre,
            assignment.Usuario.Email,
            UserRoleNames.Normalize(assignment.Role),
            assignment.Usuario.IsActive,
            !assignment.InvitationAccepted && assignment.InvitedAt != null,
            assignment.InvitedAt,
            assignment.InvitationAccepted ? assignment.InvitedAt : null,
            invitedBy
        );
    }

    public async Task<Usuario> CreateUserAsync(CreateCompetitionUserRequest request, int competicionId, string password, string invitedByEmail)
    {
        var normalizedRole = ValidateRole(request.Role);
        var email = request.Email.Trim().ToLowerInvariant();

        var competitionExists = await _context.Competiciones.AnyAsync(c => c.Id == competicionId);
        if (!competitionExists)
            throw new KeyNotFoundException("Competition not found");

        var existing = await _context.Usuarios.AnyAsync(u => u.Email.ToLower() == email);
        if (existing)
            throw new InvalidOperationException($"User with email {request.Email} already exists");

        var usuario = new Usuario
        {
            Email = email,
            PasswordHash = UsuarioService.HashPassword(password),
            Nombre = request.Nombre.Trim(),
            IsRoot = normalizedRole == UserRoleNames.Root,
            IsSuperadmin = normalizedRole == UserRoleNames.Root,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Usuarios.Add(usuario);
        await _context.SaveChangesAsync();

        _context.UsuariosCompeticiones.Add(new UsuarioCompeticion
        {
            UsuarioId = usuario.Id,
            CompeticionId = competicionId,
            Role = normalizedRole,
            InvitedByEmail = invitedByEmail,
            InvitedAt = DateTime.UtcNow,
            InvitationAccepted = false,
            CreatedAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();
        return usuario;
    }

    public async Task<bool> UpdateUserRoleAsync(int usuarioId, int competicionId, string newRole, int requestingUserId)
    {
        var normalizedRole = ValidateRole(newRole);
        if (!await CanAssignRoleAsync(requestingUserId, normalizedRole))
            return false;

        if (!await CanModifyUserRoleAsync(requestingUserId, usuarioId, competicionId))
            return false;

        var assignment = await _context.UsuariosCompeticiones
            .Include(uc => uc.Usuario)
            .FirstOrDefaultAsync(uc => uc.UsuarioId == usuarioId && uc.CompeticionId == competicionId && uc.Usuario.IsActive);

        if (assignment == null)
            return false;

        assignment.Role = normalizedRole;
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<string?> GetTargetUserRoleAsync(int usuarioId, int competicionId)
    {
        return await GetUserRoleInCompetitionAsync(usuarioId, competicionId);
    }

    public async Task<bool> RemoveUserFromCompetitionAsync(int usuarioId, int competicionId)
    {
        var assignment = await _context.UsuariosCompeticiones
            .FirstOrDefaultAsync(uc => uc.UsuarioId == usuarioId && uc.CompeticionId == competicionId);

        if (assignment == null)
            return false;

        _context.UsuariosCompeticiones.Remove(assignment);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> CanManageUsersAsync(int requestingUserId, int competicionId)
    {
        if (await IsUserRootAsync(requestingUserId))
            return true;

        var role = await GetUserRoleInCompetitionAsync(requestingUserId, competicionId);
        return role == UserRoleNames.Admin;
    }

    public async Task<bool> CanModifyUserRoleAsync(int requestingUserId, int targetUserId, int competicionId)
    {
        if (await IsUserRootAsync(requestingUserId))
            return true;

        var requesterRole = await GetUserRoleInCompetitionAsync(requestingUserId, competicionId);
        if (requesterRole != UserRoleNames.Admin)
            return false;

        if (await IsUserRootAsync(targetUserId))
            return false;

        var targetRole = await GetUserRoleInCompetitionAsync(targetUserId, competicionId);
        return targetRole != UserRoleNames.Admin;
    }

    public async Task<bool> CanAssignRoleAsync(int requestingUserId, string role)
    {
        var normalizedRole = ValidateRole(role);
        if (await IsUserRootAsync(requestingUserId))
            return true;

        return normalizedRole == UserRoleNames.Staff || normalizedRole == UserRoleNames.Registrador;
    }

    public static string GenerateTemporaryPassword(int length = 14)
    {
        return RandomNumberGenerator.GetString(PasswordAlphabet, length);
    }

    private async Task<bool> IsUserRootAsync(int usuarioId)
    {
        return await _context.Usuarios
            .AnyAsync(u => u.Id == usuarioId && u.IsActive && (u.IsRoot || u.IsSuperadmin));
    }

    private async Task<string?> GetUserRoleInCompetitionAsync(int usuarioId, int competicionId)
    {
        var assignment = await _context.UsuariosCompeticiones
            .FirstOrDefaultAsync(uc => uc.UsuarioId == usuarioId && uc.CompeticionId == competicionId);

        return assignment == null ? null : UserRoleNames.Normalize(assignment.Role);
    }

    private static string ValidateRole(string role)
    {
        var normalizedRole = UserRoleNames.Normalize(role);
        if (string.IsNullOrWhiteSpace(normalizedRole))
            throw new InvalidOperationException($"Invalid role '{role}'");

        return normalizedRole;
    }

    private static string GetRoleName(string role) => role switch
    {
        "root" => "Root",
        "admin" => "Admin",
        "staff" => "Staff",
        "registrador" => "Registrador",
        _ => role
    };

    private static string GetRoleDescription(string role) => role switch
    {
        "root" => "Acceso total al sistema. Puede gestionar todas las competiciones y usuarios.",
        "admin" => "Gestión completa de miembros, inscripciones y configuración.",
        "staff" => "Personal de apoyo. Acceso a horarios y gestión de inscripciones.",
        "registrador" => "Encargado del registro y control de asistencia.",
        _ => ""
    };

    private static List<string> GetRoleCapabilities(string role) => role switch
    {
        "root" => new List<string> { "system:manage", "users:manage", "competiciones:manage", "inscripciones:manage", "schedules:manage", "reports:view" },
        "admin" => new List<string> { "users:manage", "inscripciones:manage", "checkin:manage", "schedules:view", "reports:view" },
        "staff" => new List<string> { "inscripciones:view", "checkin:manage", "schedules:view" },
        "registrador" => new List<string> { "checkin:record", "attendees:view" },
        _ => new List<string>()
    };

    private static List<string> GetRoleRestrictions(string role) => role switch
    {
        "root" => new List<string>(),
        "admin" => new List<string> { "No puede modificar usuarios root" },
        "staff" => new List<string> { "No puede modificar usuarios admin", "No puede crear inscripciones" },
        "registrador" => new List<string> { "Solo acceso de registro", "No puede modificar horarios" },
        _ => new List<string>()
    };
}

public record CreateCompetitionUserRequest(
    string Email,
    string Nombre,
    string Role,
    string? Password = null
);

public record UpdateCompetitionUserRoleRequest(string Role);

public record InvitedByInfo(int Id, string Nombre, string Email);

public record CompetitionMemberResponse(
    int Id,
    string Nombre,
    string Email,
    string Role,
    bool IsActive,
    bool IsPending,
    DateTime? InvitationSentAt,
    DateTime? InvitationAcceptedAt,
    InvitedByInfo? InvitedBy
);

public record CompetitionRoleResponse(
    string Slug,
    string Name,
    string Description,
    int MemberCount,
    List<string> Capabilities,
    List<string> Restrictions
);

public record CompetitionRoleWithMembersResponse(
    string Slug,
    string Name,
    string Description,
    int MemberCount,
    List<string> Capabilities,
    List<string> Restrictions,
    List<CompetitionMemberResponse> Members
);
