using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

public class JwtService
{
    private readonly IConfiguration _configuration;
    private readonly string _secretKey;
    private readonly string _issuer;
    private readonly string _audience = "GrCup"; // Must match Program.cs ValidAudience

    public JwtService(IConfiguration configuration)
    {
        _configuration = configuration;
        // Check both JWT_SECRET and JWT_SECRET_KEY for compatibility
        _secretKey = Environment.GetEnvironmentVariable("JWT_SECRET")
            ?? Environment.GetEnvironmentVariable("JWT_SECRET_KEY")
            ?? throw new InvalidOperationException("JWT_SECRET environment variable not set");
        _issuer = configuration["Jwt:Issuer"] ?? "GrCupApi";
    }

    /// <summary>
    /// Generates a JWT token for admin authentication (legacy method)
    /// </summary>
    public string GenerateToken(string username)
    {
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, username),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Generates a JWT token with full user permissions and competitions.
    /// Supports 5 roles: root, admin, manager, empleado, checkin.
    /// Legacy 'operator' role is normalized to 'empleado'.
    /// </summary>
    public string GenerateTokenWithPermissions(Usuario usuario)
    {
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, usuario.Id.ToString()),
            new Claim(ClaimTypes.Email, usuario.Email),
            new Claim(ClaimTypes.Name, usuario.Nombre),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        // Determine highest role
        if (usuario.IsSuperadmin)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Superadmin"));
            claims.Add(new Claim("is_superadmin", "true"));
        }
        else
        {
            // Determine the highest role across all competition memberships
            var highestRole = "User";
            foreach (var uc in usuario.UsuarioCompeticiones)
            {
                var normalizedRole = NormalizeRole(uc.Role);
                if (normalizedRole == "root")
                {
                    highestRole = "Root";
                    break;
                }
                if (normalizedRole == "admin" && highestRole != "Root")
                {
                    highestRole = "Admin";
                }
                if (normalizedRole == "manager" && highestRole != "Root" && highestRole != "Admin")
                {
                    highestRole = "Manager";
                }
                if (normalizedRole == "empleado" && highestRole != "Root" && highestRole != "Admin" && highestRole != "Manager")
                {
                    highestRole = "Empleado";
                }
                if (normalizedRole == "checkin" && highestRole == "User")
                {
                    highestRole = "Checkin";
                }
            }
            claims.Add(new Claim(ClaimTypes.Role, highestRole));

            // Add competitions as claims with their specific role
            foreach (var uc in usuario.UsuarioCompeticiones)
            {
                var normalizedRole = NormalizeRole(uc.Role);
                claims.Add(new Claim("competicion", $"{uc.CompeticionId}:{normalizedRole}"));
            }
        }

        // Build permissions list
        var permissions = new List<string>();
        if (usuario.IsSuperadmin)
        {
            // Root/superadmin gets all system permissions
            permissions.Add("system:manage_users");
            permissions.Add("system:manage_roles");
            permissions.Add("system:config");
        }

        // Add role-based permissions for each competition
        foreach (var uc in usuario.UsuarioCompeticiones)
        {
            var normalizedRole = NormalizeRole(uc.Role);
            var rolePerms = PermissionService.GetPermissionsForRole(normalizedRole);
            foreach (var perm in rolePerms)
            {
                var key = $"comp:{uc.CompeticionId}:{perm.Replace("comp:", "")}";
                if (!permissions.Contains(key))
                    permissions.Add(key);
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

        claims.Add(new Claim("permissions", JsonSerializer.Serialize(permissions.Distinct().ToList())));

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>
    /// Normalizes legacy role names to the new system.
    /// 'operator' -> 'empleado'
    /// </summary>
    private static string NormalizeRole(string role)
    {
        if (role == "operator") return "empleado";
        return role;
    }

    /// <summary>
    /// Validates a JWT token and returns the claims principal
    /// </summary>
    public ClaimsPrincipal? ValidateToken(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_secretKey);

            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = _issuer,
                ValidAudience = _audience,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ClockSkew = TimeSpan.Zero
            };

            var principal = tokenHandler.ValidateToken(token, validationParameters, out var validatedToken);
            return principal;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Extracts username from a valid JWT token
    /// </summary>
    public string? GetUsernameFromToken(string token)
    {
        var principal = ValidateToken(token);
        return principal?.FindFirst(ClaimTypes.Name)?.Value;
    }

    /// <summary>
    /// Extracts email from a valid JWT token
    /// </summary>
    public string? GetEmailFromToken(string token)
    {
        var principal = ValidateToken(token);
        return principal?.FindFirst(ClaimTypes.Email)?.Value;
    }

    /// <summary>
    /// Extracts user ID from a valid JWT token
    /// </summary>
    public int? GetUserIdFromToken(string token)
    {
        var principal = ValidateToken(token);
        var idClaim = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(idClaim, out var id) ? id : null;
    }

    /// <summary>
    /// Checks if a token is valid and not expired
    /// </summary>
    public bool IsTokenValid(string token)
    {
        return ValidateToken(token) != null;
    }

    /// <summary>
    /// Extracts permissions from a valid JWT token
    /// </summary>
    public List<string> GetPermissionsFromToken(string token)
    {
        var principal = ValidateToken(token);
        var permissionsClaim = principal?.FindFirst("permissions")?.Value;

        if (string.IsNullOrEmpty(permissionsClaim))
            return new List<string>();

        try
        {
            return JsonSerializer.Deserialize<List<string>>(permissionsClaim) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    /// <summary>
    /// Checks if user has a specific permission from token
    /// </summary>
    public bool HasPermissionFromToken(string token, string permission)
    {
        // Superadmin has all permissions
        var principal = ValidateToken(token);
        if (principal?.IsInRole("Superadmin") == true)
            return true;

        var permissions = GetPermissionsFromToken(token);
        return permissions.Contains(permission);
    }
}
