using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GrCup.Api.Models;

/// <summary>
/// Represents a competition/event in the multi-tenant system
/// </summary>
public class Competicion
{
    public int Id { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string Nombre { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(100)]
    public string Slug { get; set; } = string.Empty;
    
    [Required]
    public DateTime Fecha { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string Lugar { get; set; } = string.Empty;
    
    public bool Activo { get; set; } = true;
    
    [MaxLength(500)]
    public string? LogoUrl { get; set; }
    
    [MaxLength(500)]
    public string? FaviconUrl { get; set; }
    
    /// <summary>
    /// JSON configuration for landing page (colors, images, etc.)
    /// </summary>
    [Column(TypeName = "json")]
    public string? LandingConfig { get; set; }
    
    /// <summary>
    /// JSON configuration for event (capacity, prices, etc.)
    /// </summary>
    [Column(TypeName = "json")]
    public string? EventoConfig { get; set; }

    /// <summary>
    /// JSON map of backoffice module keys to enabled/disabled state.
    /// Missing keys fall back to the module catalog defaults.
    /// </summary>
    [Column(TypeName = "json")]
    public string? ModulesConfig { get; set; }

    /// <summary>
    /// Secret key for signing QR codes
    /// </summary>
    [MaxLength(255)]
    public string? QrSecret { get; set; }
    
    /// <summary>
    /// Type of competition: 'grcup' or 'fer'
    /// </summary>
    [MaxLength(50)]
    public string Tipo { get; set; } = "grcup";
    
    /// <summary>
    /// Contact email for the competition
    /// </summary>
    [MaxLength(255)]
    public string? EmailContacto { get; set; }
    
    /// <summary>
    /// Contact phone number
    /// </summary>
    [MaxLength(50)]
    public string? Telefono { get; set; }
    
    /// <summary>
    /// Short description of the competition
    /// </summary>
    [MaxLength(1000)]
    public string? Descripcion { get; set; }
    
    /// <summary>
    /// Whether schedules (horarios) are ready to be displayed for this competition.
    /// Per-competition toggle independent of SchedulePublishedConfig.
    /// </summary>
    public bool HorariosReady { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual ICollection<Inscripcion> Inscripciones { get; set; } = new List<Inscripcion>();
    public virtual ICollection<RifaTicket> RifaTickets { get; set; } = new List<RifaTicket>();
    public virtual ICollection<CuponDescuento> CuponesDescuento { get; set; } = new List<CuponDescuento>();
    public virtual ICollection<UsuarioCompeticion> UsuarioCompeticiones { get; set; } = new List<UsuarioCompeticion>();
    public virtual RifaConfig? RifaConfig { get; set; }
}

/// <summary>
/// Configuration for a competition's landing page
/// </summary>
public class LandingConfig
{
    /// Primary background color (hex)
    public string? PrimaryColor { get; set; }
    
    /// Secondary/accent color (hex)
    public string? SecondaryColor { get; set; }
    
    /// Hero background image URL
    public string? HeroImageUrl { get; set; }
    
    /// Logo image URL
    public string? LogoUrl { get; set; }
    
    /// Description text
    public string? Descripcion { get; set; }
    
    /// Contact email
    public string? ContactEmail { get; set; }
    
    /// Instagram URL
    public string? InstagramUrl { get; set; }
}

/// <summary>
/// Configuration for an event's logistics and pricing
/// </summary>
public class EventoConfig
{
    /// Maximum capacity (aforo maximo)
    public int AforoMaximo { get; set; } = 100;
    
    /// Base registration price in EUR
    public decimal PrecioBase { get; set; } = 35;
    
    /// <summary>
    /// Handler service price in EUR (GR Strength handler)
    /// </summary>
    public decimal PrecioHandler { get; set; } = 0;
    
    /// Raffle ticket price in EUR
    public decimal PrecioRifa { get; set; } = 5;
    
    /// Maximum tickets per person
    public int MaxTicketsPorPersona { get; set; } = 10;
    
    /// Whether registration is open
    public bool InscripcionAbierta { get; set; } = true;

    /// Whether athletes can pay online through Stripe for this event
    public bool PagoStripeActivo { get; set; } = false;

    /// Whether athletes can choose cash payment at the event registry table
    public bool PagoEfectivoActivo { get; set; } = true;

    /// Whether athletes can apply discount coupons in the public inscription form
    public bool CuponesDescuentoActivo { get; set; } = false;
    
    /// Stripe price ID for base registration
    public string? StripePriceId { get; set; }

    /// GRS Peak Program price in EUR (includes training programming up to event)
    public decimal PrecioPeakProgram { get; set; } = 0;

    /// Limit date to book the GRS Peak Program (ISO date string)
    public string? FechaLimitePeakProgram { get; set; }
}
