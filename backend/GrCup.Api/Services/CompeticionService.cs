using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

/// <summary>
/// Service for managing competitions
/// </summary>
public class CompeticionService
{
    private readonly GrCupDbContext _context;
    private const string DefaultQrSecret = "default-qr-secret-change-in-production";
    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    public static readonly CompetitionModuleDefinition[] ModuleCatalog =
    {
        new("dashboard", "Inicio", "Panel principal del workspace.", "home", "", null),
        new("inscripciones", "Inscripciones", "Gestion de atletas inscritos.", "users", "inscripciones", null),
        new("qr-reader", "Lector QR", "Escaneo de QR para check-in y validacion.", "qrcode", "qr-reader", null),
        new("judge-table", "Mesa de Jueces", "Intentos, pesos y votos en competiciones FER.", "judge", "judge-table", "fer"),
        new("participantes", "Participantes", "Participantes y tickets del sorteo GR Cup.", "ticket", "participantes", "grcup"),
        new("sorteo", "Sorteo", "Gestion del sorteo y premios.", "dice", "sorteo", "grcup"),
        new("cupones", "Cupones", "Cupones de descuento para inscripciones.", "coupon", "cupones", null),
        new("horarios", "Horarios", "Bloques horarios y publicaciones.", "calendar", "horarios", null),
        new("users", "Miembros", "Gestion de miembros del workspace.", "members", "users", null),
        new("configuracion", "Configuracion", "Configuracion general, email y pagos.", "settings", "configuracion", null)
    };

    public CompeticionService(GrCupDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Gets all active competitions
    /// </summary>
    public async Task<List<Competicion>> GetAllAsync(bool includeInactive = false)
    {
        var query = _context.Competiciones.AsQueryable();
        
        if (!includeInactive)
            query = query.Where(c => c.Activo);
        
        return await query.OrderByDescending(c => c.Fecha).ToListAsync();
    }

    /// <summary>
    /// Gets a competition by ID
    /// </summary>
    public async Task<Competicion?> GetByIdAsync(int id)
    {
        return await _context.Competiciones.FindAsync(id);
    }

    /// <summary>
    /// Gets a competition by slug
    /// </summary>
    public async Task<Competicion?> GetBySlugAsync(string slug)
    {
        return await _context.Competiciones
            .FirstOrDefaultAsync(c => c.Slug.ToLower() == slug.ToLower());
    }

    /// <summary>
    /// Creates a new competition
    /// </summary>
    public async Task<Competicion> CreateAsync(CreateCompeticionRequest request)
    {
        var slug = GenerateSlug(request.Nombre);
        
        // Ensure slug is unique
        var existingSlug = await _context.Competiciones.AnyAsync(c => c.Slug == slug);
        if (existingSlug)
        {
            slug = $"{slug}-{DateTime.UtcNow:yyyyMMdd}";
        }

        var competicion = new Competicion
        {
            Nombre = request.Nombre,
            Slug = slug,
            Fecha = request.Fecha,
            Lugar = request.Lugar,
            Activo = true,
            Tipo = request.Tipo ?? "grcup",
            LogoUrl = request.LogoUrl,
            FaviconUrl = request.FaviconUrl,
            EmailContacto = request.EmailContacto,
            Telefono = request.Telefono,
            Descripcion = request.Descripcion,
            QrSecret = GenerateQrSecret(),
            LandingConfig = request.LandingConfig != null
                ? JsonSerializer.Serialize(request.LandingConfig, _jsonOpts)
                : null,
            EventoConfig = request.EventoConfig != null
                ? JsonSerializer.Serialize(request.EventoConfig, _jsonOpts)
                : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Competiciones.Add(competicion);
        await _context.SaveChangesAsync();
        
        return competicion;
    }

    /// <summary>
    /// Updates an existing competition
    /// </summary>
    public async Task<Competicion?> UpdateAsync(int id, UpdateCompeticionRequest request)
    {
        var competicion = await _context.Competiciones.FindAsync(id);
        if (competicion == null)
            return null;

        if (request.Nombre != null)
            competicion.Nombre = request.Nombre;
        
        if (request.Fecha.HasValue)
            competicion.Fecha = request.Fecha.Value;
        
        if (request.Lugar != null)
            competicion.Lugar = request.Lugar;
        
        if (request.Activo.HasValue)
            competicion.Activo = request.Activo.Value;
        
        if (request.LogoUrl != null)
            competicion.LogoUrl = request.LogoUrl;
        
        if (request.FaviconUrl != null)
            competicion.FaviconUrl = request.FaviconUrl;
        
        if (request.EmailContacto != null)
            competicion.EmailContacto = request.EmailContacto;
        
        if (request.Telefono != null)
            competicion.Telefono = request.Telefono;
        
        if (request.Descripcion != null)
            competicion.Descripcion = request.Descripcion;
        
        if (request.LandingConfig != null)
            competicion.LandingConfig = JsonSerializer.Serialize(request.LandingConfig, _jsonOpts);

        if (request.EventoConfig != null)
            competicion.EventoConfig = JsonSerializer.Serialize(request.EventoConfig, _jsonOpts);
        
        competicion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return competicion;
    }

    /// <summary>
    /// Toggles the HorariosReady flag for a competition
    /// </summary>
    public async Task<Competicion?> ToggleHorariosReadyAsync(int id, bool horariosReady)
    {
        var competicion = await _context.Competiciones.FindAsync(id);
        if (competicion == null)
            return null;

        competicion.HorariosReady = horariosReady;
        competicion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return competicion;
    }

    /// <summary>
    /// Updates the landing configuration
    /// </summary>
    public async Task<Competicion?> UpdateLandingConfigAsync(int id, LandingConfig config)
    {
        var competicion = await _context.Competiciones.FindAsync(id);
        if (competicion == null)
            return null;

        competicion.LandingConfig = JsonSerializer.Serialize(config, _jsonOpts);
        competicion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return competicion;
    }

    /// <summary>
    /// Updates the event configuration
    /// </summary>
    public async Task<Competicion?> UpdateEventoConfigAsync(int id, EventoConfig config)
    {
        var competicion = await _context.Competiciones.FindAsync(id);
        if (competicion == null)
            return null;

        EnsureAtLeastOnePaymentMethod(config);

        competicion.EventoConfig = JsonSerializer.Serialize(config, new JsonSerializerOptions
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.Never
        });
        competicion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return competicion;
    }

    /// <summary>
    /// Deletes a competition (soft delete - sets activo = false)
    /// </summary>
    public async Task<bool> DeleteAsync(int id)
    {
        var competicion = await _context.Competiciones.FindAsync(id);
        if (competicion == null)
            return false;

        competicion.Activo = false;
        competicion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Competicion?> UpdateModulesAsync(int id, IEnumerable<CompetitionModuleUpdate> updates)
    {
        var competicion = await _context.Competiciones.FindAsync(id);
        if (competicion == null)
            return null;

        var validKeys = ModuleCatalog.Select(m => m.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var merged = GetModulesForCompetition(competicion)
            .ToDictionary(module => module.Key, module => module.Enabled, StringComparer.OrdinalIgnoreCase);

        foreach (var update in updates)
        {
            if (!validKeys.Contains(update.Key))
                throw new InvalidOperationException($"Invalid module '{update.Key}'");

            merged[update.Key] = update.Enabled;
        }

        competicion.ModulesConfig = JsonSerializer.Serialize(merged, _jsonOpts);
        competicion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return competicion;
    }

    public static List<CompetitionModuleResponse> GetModulesForCompetition(Competicion competicion)
    {
        var configured = ParseModulesConfig(competicion.ModulesConfig);
        var tipo = competicion.Tipo ?? "grcup";

        return ModuleCatalog
            .Select(module => new CompetitionModuleResponse(
                module.Key,
                module.Label,
                module.Description,
                module.Icon,
                module.SubPath,
                configured.TryGetValue(module.Key, out var enabled) ? enabled : IsModuleEnabledByDefault(module, tipo),
                module.RequiredTipo
            ))
            .ToList();
    }

    private static Dictionary<string, bool> ParseModulesConfig(string? modulesConfig)
    {
        if (string.IsNullOrWhiteSpace(modulesConfig))
            return new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var parsed = JsonSerializer.Deserialize<Dictionary<string, bool>>(modulesConfig);
            return parsed == null
                ? new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, bool>(parsed, StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static bool IsModuleEnabledByDefault(CompetitionModuleDefinition module, string tipo)
    {
        return module.RequiredTipo == null || string.Equals(module.RequiredTipo, tipo, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Gets whether inscripciones are open for a competition.
    /// Defaults to true when no explicit state row exists.
    /// </summary>
    public async Task<bool> GetInscripcionesAbiertasAsync(int competicionId)
    {
        var estado = await _context.InscripcionEstados
            .FirstOrDefaultAsync(e => e.CompeticionId == competicionId);
        return estado?.InscripcionesAbiertas ?? true;
    }

    /// <summary>
    /// Gets whether a competition is closed due to being sold out.
    /// Defaults to false when no explicit state row exists.
    /// </summary>
    public async Task<bool> GetSoldOutAsync(int competicionId)
    {
        var estado = await _context.InscripcionEstados
            .FirstOrDefaultAsync(e => e.CompeticionId == competicionId);
        return estado?.SoldOut ?? false;
    }

    /// <summary>
    /// Sets whether inscripciones are open for a competition (upsert).
    /// When reopening, the sold-out flag is always cleared.
    /// </summary>
    public async Task<InscripcionEstado> SetInscripcionesAbiertasAsync(int competicionId, bool abiertas, bool soldOut = false)
    {
        // Reopening inscripciones always clears the sold-out flag.
        var effectiveSoldOut = abiertas ? false : soldOut;

        var estado = await _context.InscripcionEstados
            .FirstOrDefaultAsync(e => e.CompeticionId == competicionId);

        if (estado == null)
        {
            estado = new InscripcionEstado
            {
                CompeticionId = competicionId,
                InscripcionesAbiertas = abiertas,
                SoldOut = effectiveSoldOut,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            _context.InscripcionEstados.Add(estado);
        }
        else
        {
            estado.InscripcionesAbiertas = abiertas;
            estado.SoldOut = effectiveSoldOut;
            estado.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return estado;
    }

    /// <summary>
    /// Gets available spots for a competition
    /// </summary>
    public async Task<int> GetPlazasDisponiblesAsync(int competicionId)
    {
        var competicion = await _context.Competiciones.FindAsync(competicionId);
        if (competicion == null)
            return 0;

        var config = GetEventoConfig(competicion);
        var currentCount = await _context.Inscripciones
            .CountAsync(i => i.CompeticionId == competicionId && i.PagoConfirmado);

        return Math.Max(0, config.AforoMaximo - currentCount);
    }

    /// <summary>
    /// Gets the event configuration from a competition
    /// </summary>
    public EventoConfig GetEventoConfig(Competicion competicion)
    {
        if (string.IsNullOrEmpty(competicion.EventoConfig))
            return new EventoConfig();

        try
        {
            var config = JsonSerializer.Deserialize<EventoConfig>(competicion.EventoConfig) ?? new EventoConfig();
            EnsureAtLeastOnePaymentMethod(config);
            return config;
        }
        catch
        {
            return new EventoConfig();
        }
    }

    private static void EnsureAtLeastOnePaymentMethod(EventoConfig config)
    {
        if (!config.PagoStripeActivo && !config.PagoEfectivoActivo)
            config.PagoEfectivoActivo = true;
    }

    /// <summary>
    /// Gets the landing configuration from a competition
    /// </summary>
    public LandingConfig GetLandingConfig(Competicion competicion)
    {
        if (string.IsNullOrEmpty(competicion.LandingConfig))
            return new LandingConfig();

        try
        {
            return JsonSerializer.Deserialize<LandingConfig>(competicion.LandingConfig) ?? new LandingConfig();
        }
        catch
        {
            return new LandingConfig();
        }
    }

    /// <summary>
    /// Generates a URL-friendly slug from a name
    /// </summary>
    private static string GenerateSlug(string name)
    {
        var slug = name.ToLowerInvariant()
            .Replace(" ", "-")
            .Replace("a", "a").Replace("e", "e").Replace("i", "i").Replace("o", "o").Replace("u", "u")
            .Replace("n", "n")
            .Replace("'", "")
            .Replace("\"", "");
        
        // Remove non-alphanumeric except hyphens
        slug = new string(slug.Where(c => char.IsLetterOrDigit(c) || c == '-').ToArray());
        
        // Remove duplicate hyphens
        while (slug.Contains("--"))
            slug = slug.Replace("--", "-");
        
        return slug.Trim('-');
    }

    /// <summary>
    /// Generates a secure QR code secret
    /// </summary>
    private static string GenerateQrSecret()
    {
        var bytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes);
    }
}

// Request/Response DTOs
public record CreateCompeticionRequest(
    string Nombre,
    DateTime Fecha,
    string Lugar,
    string? Tipo = null,
    string? LogoUrl = null,
    string? FaviconUrl = null,
    string? EmailContacto = null,
    string? Telefono = null,
    string? Descripcion = null,
    LandingConfig? LandingConfig = null,
    EventoConfig? EventoConfig = null
);

public record UpdateCompeticionRequest(
    string? Nombre = null,
    DateTime? Fecha = null,
    string? Lugar = null,
    bool? Activo = null,
    string? LogoUrl = null,
    string? FaviconUrl = null,
    string? EmailContacto = null,
    string? Telefono = null,
    string? Descripcion = null,
    LandingConfig? LandingConfig = null,
    EventoConfig? EventoConfig = null
);

public record CompetitionModuleDefinition(
    string Key,
    string Label,
    string Description,
    string Icon,
    string SubPath,
    string? RequiredTipo
);

public record CompetitionModuleResponse(
    string Key,
    string Label,
    string Description,
    string Icon,
    string SubPath,
    bool Enabled,
    string? RequiredTipo
);

public record CompetitionModuleUpdate(string Key, bool Enabled);
