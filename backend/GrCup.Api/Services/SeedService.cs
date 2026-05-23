using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Cryptography.KeyDerivation;
using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

/// <summary>
/// Service to seed initial data for the multi-tenant system
/// </summary>
public class SeedService
{
    private readonly GrCupDbContext _context;
    private readonly ILogger<SeedService> _logger;

    public SeedService(GrCupDbContext context, ILogger<SeedService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Seeds the initial data if not already present
    /// </summary>
    public async Task SeedAsync()
    {
        try
        {
            await SeedCompeticionesAsync();
            await SeedSuperAdminAsync();
            await EnsureRifaConfigsAsync();
            
            _logger.LogInformation("Seed completed successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during seed");
            throw;
        }
    }

    /// <summary>
    /// Seeds the initial competitions (GR Cup and FER)
    /// </summary>
    private async Task SeedCompeticionesAsync()
    {
        // Check if GR Cup exists
        var grCupExists = await _context.Competiciones.AnyAsync(c => c.Slug == "grcup");
        if (!grCupExists)
        {
            var grCup = new Competicion
            {
                Nombre = "GR Cup 2026",
                Slug = "grcup",
                Fecha = new DateTime(2026, 7, 25),
                Lugar = "Almussafes, Valencia",
                Activo = true,
                Tipo = "grcup",
                EmailContacto = "admin@grstrength.com",
                Telefono = "+34 600 000 001",
                Descripcion = "La competición de powerlifting más esperada del año",
                QrSecret = GenerateQrSecret("grcup"),
                EventoConfig = System.Text.Json.JsonSerializer.Serialize(new EventoConfig
                {
                    AforoMaximo = 100,
                    PrecioBase = 35,
                    PrecioRifa = 5,
                    MaxTicketsPorPersona = 10,
                    InscripcionAbierta = true
                }),
                LandingConfig = System.Text.Json.JsonSerializer.Serialize(new LandingConfig
                {
                    PrimaryColor = "#DC2626",
                    SecondaryColor = "#991B1B",
                    Descripcion = "La competición de powerlifting más esperada del año"
                })
            };
            _context.Competiciones.Add(grCup);
            _logger.LogInformation("Created GR Cup competition");
        }

        // Check if FER exists
        var ferExists = await _context.Competiciones.AnyAsync(c => c.Slug == "fer");
        if (!ferExists)
        {
            var fer = new Competicion
            {
                Nombre = "FER CUP II",
                Slug = "fer",
                Fecha = new DateTime(2026, 7, 25),
                Lugar = "Almussafes, Valencia",
                Activo = true,
                Tipo = "fer",
                EmailContacto = "info@ferentrenamiento.com",
                Telefono = "+34 600 000 000",
                Descripcion = "FER CUP II: tu primera competición de powerlifting en un ambiente profesional y acogedor",
                QrSecret = GenerateQrSecret("fer"),
                EventoConfig = System.Text.Json.JsonSerializer.Serialize(new EventoConfig
                {
                    AforoMaximo = 80,
                    PrecioBase = 35,
                    PrecioRifa = 5,
                    MaxTicketsPorPersona = 5,
                    InscripcionAbierta = true
                }),
                LandingConfig = System.Text.Json.JsonSerializer.Serialize(new LandingConfig
                {
                    PrimaryColor = "#3B82F6",
                    SecondaryColor = "#60A5FA",
                    Descripcion = "Tu primera competición de Powerlifting",
                    InstagramUrl = "https://instagram.com/ferentrenamiento"
                })
            };
            _context.Competiciones.Add(fer);
            _logger.LogInformation("Created FER competition");
        }

        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// Seeds the initial superadmin user from environment variables
    /// </summary>
    private async Task SeedSuperAdminAsync()
    {
        var adminEmail = Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? "admin@grplatform.com";
        var adminPassword = Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? "changeme123";
        var adminNombre = Environment.GetEnvironmentVariable("ADMIN_NOMBRE") ?? "Super Admin";

        var existingAdmin = await _context.Usuarios.FirstOrDefaultAsync(u => u.Email == adminEmail);
        
        if (existingAdmin == null)
        {
            var admin = new Usuario
            {
                Email = adminEmail,
                PasswordHash = HashPassword(adminPassword),
                Nombre = adminNombre,
                IsRoot = true,
                IsSuperadmin = true,
                IsActive = true,
                LastLoginAt = null
            };
            _context.Usuarios.Add(admin);
            await _context.SaveChangesAsync();
            
            // Assign admin to GR Cup as admin
            var grCup = await _context.Competiciones.FirstAsync(c => c.Slug == "grcup");
            var usuarioCompeticion = new UsuarioCompeticion
            {
                UsuarioId = admin.Id,
                CompeticionId = grCup.Id,
                Role = "admin"
            };
            _context.UsuariosCompeticiones.Add(usuarioCompeticion);
            
            // Also assign to FER
            var fer = await _context.Competiciones.FirstAsync(c => c.Slug == "fer");
            var ferUsuarioCompeticion = new UsuarioCompeticion
            {
                UsuarioId = admin.Id,
                CompeticionId = fer.Id,
                Role = "admin"
            };
            _context.UsuariosCompeticiones.Add(ferUsuarioCompeticion);
            
            await _context.SaveChangesAsync();
            
            _logger.LogInformation("Created superadmin user: {Email}", adminEmail);
        }
        else if (!existingAdmin.IsSuperadmin)
        {
            // Upgrade existing user to superadmin
            existingAdmin.IsSuperadmin = true;
            existingAdmin.IsRoot = true;
            await _context.SaveChangesAsync();
            _logger.LogInformation("Upgraded existing user to superadmin: {Email}", existingAdmin.Email);
        }
    }

    /// <summary>
    /// Ensures RifaConfig exists for all competitions
    /// </summary>
    private async Task EnsureRifaConfigsAsync()
    {
        var competiciones = await _context.Competiciones.ToListAsync();
        
        foreach (var competicion in competiciones)
        {
            var exists = await _context.RifaConfigs.AnyAsync(rc => rc.CompeticionId == competicion.Id);
            if (!exists)
            {
                var rifaConfig = new RifaConfig
                {
                    CompeticionId = competicion.Id,
                    NombrePremio = "Premio sorpresa",
                    DescripcionPremio = "Premio para el ganador de la rifa",
                    PrecioTicket = 5,
                    TicketsTotal = 100,
                    Activo = false,
                    NumeroGanador = null,
                    GanadorConfirmado = false
                };
                _context.RifaConfigs.Add(rifaConfig);
            }
        }
        
        await _context.SaveChangesAsync();
    }

    private static string GenerateQrSecret(string slug)
    {
        var timestamp = DateTime.UtcNow.Ticks;
        var input = $"{slug}-{timestamp}-{Guid.NewGuid()}";
        return Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(input))
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }

    /// <summary>
    /// Hash a password using PBKDF2 with HMACSHA256
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
}
