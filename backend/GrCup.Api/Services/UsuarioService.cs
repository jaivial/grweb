using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Cryptography.KeyDerivation;
using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

/// <summary>
/// Service for managing users and permissions.
/// Supports 5 roles: root, admin, manager, empleado, checkin.
/// Legacy 'operator' role is normalized to 'empleado'.
/// </summary>
public class UsuarioService
{
    private readonly GrCupDbContext _context;
    private readonly JwtService _jwtService;

    public UsuarioService(GrCupDbContext context, JwtService jwtService)
    {
        _context = context;
        _jwtService = jwtService;
    }

    #region User CRUD

    /// <summary>
    /// Gets all users (superadmin only)
    /// </summary>
    public async Task<List<Usuario>> GetAllAsync(bool includeInactive = false)
    {
        var query = _context.Usuarios
            .Include(u => u.UsuarioCompeticiones)
                .ThenInclude(uc => uc.Competicion)
            .AsQueryable();
        
        if (!includeInactive)
            query = query.Where(u => u.IsActive);
        
        return await query.OrderBy(u => u.Nombre).ToListAsync();
    }

    /// <summary>
    /// Gets a user by ID
    /// </summary>
    public async Task<Usuario?> GetByIdAsync(int id)
    {
        return await _context.Usuarios
            .Include(u => u.UsuarioCompeticiones)
                .ThenInclude(uc => uc.Competicion)
            .Include(u => u.UsuarioPermissions)
            .FirstOrDefaultAsync(u => u.Id == id);
    }

    /// <summary>
    /// Gets a user by email
    /// </summary>
    public async Task<Usuario?> GetByEmailAsync(string email)
    {
        return await _context.Usuarios
            .Include(u => u.UsuarioCompeticiones)
                .ThenInclude(uc => uc.Competicion)
            .Include(u => u.UsuarioPermissions)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == email.ToLower());
    }

    /// <summary>
    /// Creates a new user
    /// </summary>
    public async Task<Usuario> CreateAsync(CreateUsuarioRequest request)
    {
        // Check if email already exists
        var existing = await _context.Usuarios.AnyAsync(u => u.Email.ToLower() == request.Email.ToLower());
        if (existing)
            throw new InvalidOperationException($"User with email {request.Email} already exists");

        var usuario = new Usuario
        {
            Email = request.Email.ToLower().Trim(),
            PasswordHash = HashPassword(request.Password),
            Nombre = request.Nombre,
            IsSuperadmin = request.IsSuperadmin,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Usuarios.Add(usuario);
        await _context.SaveChangesAsync();

        return usuario;
    }

    /// <summary>
    /// Updates an existing user
    /// </summary>
    public async Task<Usuario?> UpdateAsync(int id, UpdateUsuarioRequest request)
    {
        var usuario = await _context.Usuarios.FindAsync(id);
        if (usuario == null)
            return null;

        if (request.Nombre != null)
            usuario.Nombre = request.Nombre;

        if (request.Email != null)
        {
            // Check for duplicate email
            var exists = await _context.Usuarios.AnyAsync(u => u.Id != id && u.Email.ToLower() == request.Email.ToLower());
            if (exists)
                throw new InvalidOperationException($"User with email {request.Email} already exists");
            usuario.Email = request.Email.ToLower().Trim();
        }

        if (request.Password != null)
            usuario.PasswordHash = HashPassword(request.Password);

        if (request.IsActive.HasValue)
            usuario.IsActive = request.IsActive.Value;

        if (request.IsSuperadmin.HasValue)
            usuario.IsSuperadmin = request.IsSuperadmin.Value;

        usuario.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return usuario;
    }

    /// <summary>
    /// Deletes a user (sets inactive)
    /// </summary>
    public async Task<bool> DeleteAsync(int id)
    {
        var usuario = await _context.Usuarios.FindAsync(id);
        if (usuario == null)
            return false;

        usuario.IsActive = false;
        usuario.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return true;
    }

    #endregion

    #region Authentication

    /// <summary>
    /// Authenticates a user and returns a JWT token
    /// </summary>
    public async Task<AuthResult?> AuthenticateAsync(string email, string password)
    {
        var usuario = await GetByEmailAsync(email);
        if (usuario == null || !usuario.IsActive)
            return null;

        if (!VerifyPassword(password, usuario.PasswordHash))
            return null;

        // Update last login
        usuario.LastLoginAt = DateTime.UtcNow;
        usuario.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Generate token with permissions
        var token = _jwtService.GenerateTokenWithPermissions(usuario);

        return new AuthResult(
            Token: token,
            User: MapToUserResponse(usuario)
        );
    }

    /// <summary>
    /// Verifies a JWT token and returns the user
    /// </summary>
    public async Task<Usuario?> VerifyTokenAsync(string token)
    {
        var email = _jwtService.GetEmailFromToken(token);
        if (string.IsNullOrEmpty(email))
            return null;

        return await GetByEmailAsync(email);
    }

    #endregion

    #region Competition Assignments

    /// <summary>
    /// Assigns a user to a competition with a role.
    /// Normalizes 'operator' to 'empleado'.
    /// </summary>
    public async Task<UsuarioCompeticion> AssignToCompetitionAsync(int usuarioId, int competicionId, string role)
    {
        // Normalize legacy roles
        var normalizedRole = role == "operator" ? "empleado" : role;

        // Check if already assigned
        var existing = await _context.UsuariosCompeticiones
            .FirstOrDefaultAsync(uc => uc.UsuarioId == usuarioId && uc.CompeticionId == competicionId);

        if (existing != null)
        {
            existing.Role = normalizedRole;
            await _context.SaveChangesAsync();
            return existing;
        }

        var assignment = new UsuarioCompeticion
        {
            UsuarioId = usuarioId,
            CompeticionId = competicionId,
            Role = normalizedRole,
            CreatedAt = DateTime.UtcNow
        };

        _context.UsuariosCompeticiones.Add(assignment);
        await _context.SaveChangesAsync();

        return assignment;
    }

    /// <summary>
    /// Removes a user from a competition
    /// </summary>
    public async Task<bool> RemoveFromCompetitionAsync(int usuarioId, int competicionId)
    {
        var assignment = await _context.UsuariosCompeticiones
            .FirstOrDefaultAsync(uc => uc.UsuarioId == usuarioId && uc.CompeticionId == competicionId);

        if (assignment == null)
            return false;

        _context.UsuariosCompeticiones.Remove(assignment);
        await _context.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Gets all competitions a user has access to
    /// </summary>
    public async Task<List<UsuarioCompeticion>> GetUserCompetitionsAsync(int usuarioId)
    {
        return await _context.UsuariosCompeticiones
            .Include(uc => uc.Competicion)
            .Where(uc => uc.UsuarioId == usuarioId)
            .ToListAsync();
    }

    #endregion

    #region Permissions

    /// <summary>
    /// Sets a permission for a user
    /// </summary>
    public async Task<UsuarioPermission> SetPermissionAsync(int usuarioId, string permissionKey, bool granted, int? competicionId = null)
    {
        var existing = await _context.UsuariosPermissions
            .FirstOrDefaultAsync(p => p.UsuarioId == usuarioId && 
                                     p.PermissionKey == permissionKey && 
                                     p.CompeticionId == competicionId);

        if (existing != null)
        {
            existing.Granted = granted;
            await _context.SaveChangesAsync();
            return existing;
        }

        var permission = new UsuarioPermission
        {
            UsuarioId = usuarioId,
            PermissionKey = permissionKey,
            Granted = granted,
            CompeticionId = competicionId,
            CreatedAt = DateTime.UtcNow
        };

        _context.UsuariosPermissions.Add(permission);
        await _context.SaveChangesAsync();

        return permission;
    }

    /// <summary>
    /// Removes a permission from a user
    /// </summary>
    public async Task<bool> RemovePermissionAsync(int usuarioId, string permissionKey, int? competicionId = null)
    {
        var permission = await _context.UsuariosPermissions
            .FirstOrDefaultAsync(p => p.UsuarioId == usuarioId && 
                                     p.PermissionKey == permissionKey && 
                                     p.CompeticionId == competicionId);

        if (permission == null)
            return false;

        _context.UsuariosPermissions.Remove(permission);
        await _context.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Gets all permissions for a user, combining role-based and granular permissions
    /// </summary>
    public async Task<List<string>> GetUserPermissionsAsync(int usuarioId)
    {
        var usuario = await GetByIdAsync(usuarioId);
        if (usuario == null)
            return new List<string>();

        var permissions = new List<string>();

        // Add role-based permissions for each competition
        foreach (var uc in usuario.UsuarioCompeticiones)
        {
            var normalizedRole = uc.Role == "operator" ? "empleado" : uc.Role;
            var rolePerms = PermissionService.GetPermissionsForRole(normalizedRole);

            foreach (var perm in rolePerms)
            {
                var permName = perm.Replace("comp:", "");
                permissions.Add($"comp:{uc.CompeticionId}:{permName}");
            }
        }

        // Add granular permissions
        foreach (var p in usuario.UsuarioPermissions.Where(p => p.Granted))
        {
            var key = p.CompeticionId.HasValue 
                ? $"comp:{p.CompeticionId}:{p.PermissionKey}" 
                : p.PermissionKey;
            
            if (!permissions.Contains(key))
                permissions.Add(key);
        }

        return permissions.Distinct().ToList();
    }

    /// <summary>
    /// Checks if a user has a specific permission
    /// </summary>
    public async Task<bool> HasPermissionAsync(int usuarioId, string permission, int? competicionId = null)
    {
        var usuario = await GetByIdAsync(usuarioId);
        if (usuario == null)
            return false;

        // Superadmin has all permissions
        if (usuario.IsSuperadmin)
            return true;

        // System permissions require superadmin
        if (permission.StartsWith("system:"))
            return false;

        // Get user's competitions
        var userComps = usuario.UsuarioCompeticiones.ToList();

        // If competicionId is specified, check access to that competition
        if (competicionId.HasValue)
        {
            var userComp = userComps.FirstOrDefault(uc => uc.CompeticionId == competicionId.Value);
            if (userComp == null)
                return false;

            var normalizedRole = userComp.Role == "operator" ? "empleado" : userComp.Role;
            var rolePerms = PermissionService.GetPermissionsForRole(normalizedRole);
            var permName = permission.Replace("comp:", "");
            return rolePerms.Any(p => p == permission || p.Replace("comp:", "") == permName);
        }

        // Check granular permissions
        var fullKey = competicionId.HasValue ? $"comp:{competicionId}:{permission}" : permission;
        return usuario.UsuarioPermissions.Any(p => p.Granted && p.PermissionKey == permission);
    }

    #endregion

    #region Helper Methods

    /// <summary>
    /// Hashes a password using PBKDF2
    /// </summary>
    private static string HashPassword(string password)
    {
        byte[] salt = new byte[16];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(salt);

        string hashed = Convert.ToBase64String(KeyDerivation.Pbkdf2(
            password: password,
            salt: salt,
            prf: KeyDerivationPrf.HMACSHA256,
            iterationCount: 100000,
            numBytesRequested: 32));

        return $"{Convert.ToBase64String(salt)}:{hashed}";
    }

    /// <summary>
    /// Verifies a password against a hash
    /// </summary>
    private static bool VerifyPassword(string password, string hash)
    {
        var parts = hash.Split(':');
        if (parts.Length != 2)
            return false;

        byte[] salt = Convert.FromBase64String(parts[0]);
        string storedHash = parts[1];

        string computedHash = Convert.ToBase64String(KeyDerivation.Pbkdf2(
            password: password,
            salt: salt,
            prf: KeyDerivationPrf.HMACSHA256,
            iterationCount: 100000,
            numBytesRequested: 32));

        return storedHash == computedHash;
    }

    /// <summary>
    /// Maps a user to a response DTO.
    /// Normalizes 'operator' role to 'empleado' in the response.
    /// </summary>
    public UserResponse MapToUserResponse(Usuario usuario)
    {
        return new UserResponse(
            Id: usuario.Id,
            Email: usuario.Email,
            Nombre: usuario.Nombre,
            IsSuperadmin: usuario.IsSuperadmin,
            IsActive: usuario.IsActive,
            Competiciones: usuario.UsuarioCompeticiones.Select(uc => new CompeticionAssignment(
                uc.CompeticionId,
                uc.Competicion.Nombre,
                uc.Competicion.Slug,
                uc.Role == "operator" ? "empleado" : uc.Role, // Normalize legacy role
                uc.Competicion.Tipo ?? "grcup"
            )).ToList(),
            Permissions: usuario.UsuarioPermissions
                .Where(p => p.Granted)
                .Select(p => new UserPermissionDto(p.PermissionKey, p.CompeticionId))
                .ToList()
        );
    }

    #endregion
}

// DTOs
public record CreateUsuarioRequest(
    string Email,
    string Password,
    string Nombre,
    bool IsSuperadmin = false
);

public record UpdateUsuarioRequest(
    string? Nombre = null,
    string? Email = null,
    string? Password = null,
    bool? IsActive = null,
    bool? IsSuperadmin = null
);

public record AuthResult(string Token, UserResponse User);

public record UserResponse(
    int Id,
    string Email,
    string Nombre,
    bool IsSuperadmin,
    bool IsActive,
    List<CompeticionAssignment> Competiciones,
    List<UserPermissionDto> Permissions
);

public record CompeticionAssignment(
    int Id,
    string Nombre,
    string Slug,
    string Role,
    string Tipo
);

public record UserPermissionDto(
    string Key,
    int? CompeticionId
);

public record SetPermissionRequest(
    string PermissionKey,
    bool Granted,
    int? CompeticionId = null
);

public record AssignToCompetitionRequest(
    int CompeticionId,
    string Role
);
