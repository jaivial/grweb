using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

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
    /// Generates a JWT token for admin authentication
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
    /// Checks if a token is valid and not expired
    /// </summary>
    public bool IsTokenValid(string token)
    {
        return ValidateToken(token) != null;
    }
}
