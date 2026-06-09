using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GrCup.Api.Models;

/// <summary>
/// Registration for a competition (new multi-tenant model)
/// Used by FER Landing and future landings
/// </summary>
public class Inscripcion
{
    public int Id { get; set; }
    
    /// <summary>
    /// Competition this registration belongs to
    /// </summary>
    public int CompeticionId { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string Nombre { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(255)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;
    
    /// <summary>
    /// Instagram handle (optional)
    /// </summary>
    [MaxLength(255)]
    public string? Instagram { get; set; }

    /// <summary>
    /// Phone number (optional)
    /// </summary>
    [MaxLength(50)]
    public string? Telefono { get; set; }
    
    /// <summary>
    /// Sex: 'masculino' or 'femenino'
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Sexo { get; set; } = "masculino";
    
    /// <summary>
    /// Weight category selected by the athlete (e.g. "-74 kg")
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string CategoriaPeso { get; set; } = string.Empty;

    /// <summary>
    /// Competition modality: completa, solo_banca, solo_peso_muerto
    /// </summary>
    [Required]
    [MaxLength(30)]
    public string Modalidad { get; set; } = "completa";
    
    /// <summary>
    /// Whether the athlete wants the handler service (GR Strength)
    /// </summary>
    public bool QuiereHandler { get; set; } = false;
    
    /// <summary>
    /// Whether participation has been confirmed via QR check-in
    /// </summary>
    public bool ParticipacionConfirmada { get; set; } = false;
    
    /// <summary>
    /// Approximate bodyweight in kg
    /// </summary>
    
    /// <summary>
    /// Experience level: principiante, intermedio, avanzado
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Experiencia { get; set; } = "principiante";

    /// <summary>
    /// Whether the athlete wants the GRS Peak Program (training programming up to event)
    /// </summary>
    public bool QuierePeakProgram { get; set; } = false;

    /// <summary>
    /// [LEGACY] Whether the athlete has a coach/trainer. Kept for backward compatibility.
    /// Use QuiereHandler or other fields for new registrations.
    /// </summary>
    public bool TieneEntrenador { get; set; } = false;

    /// <summary>
    /// QR code data (base64 or JSON with signature)
    /// </summary>
    public string? QrCode { get; set; }

    /// <summary>
    /// Persisted Bunny CDN URL for the uploaded QR image
    /// </summary>
    public string? QrImageUrl { get; set; }
    /// <summary>
    /// Whether payment has been confirmed
    /// </summary>
    public bool PagoConfirmado { get; set; } = false;
    
    /// <summary>
    /// Payment method used: 'efectivo', 'transferencia', 'stripe'
    /// </summary>
    [MaxLength(50)]
    public string? PaymentMethod { get; set; }

    [MaxLength(255)]
    public string? StripeSessionId { get; set; }

    // Referido system (untracked WIP, stubbed to keep build green)
    [MaxLength(255)]
    public string? StripePaymentIntentId { get; set; }

    public int? CuponDescuentoId { get; set; }

    // Referido system fields (untracked WIP, stubbed to keep build green)
    [MaxLength(100)]
    public string? Apellido1 { get; set; }
    public int? ReferralCodeId { get; set; }

    [MaxLength(200)]
    public string? CodigoCupon { get; set; }

    [MaxLength(20)]
    public string? TipoDescuentoCupon { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal? ValorDescuentoCupon { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal SubtotalAntesDescuento { get; set; } = 0;

    [Column(TypeName = "decimal(10,2)")]
    public decimal ImporteDescuento { get; set; } = 0;
    
    /// <summary>
    /// Total amount paid in EUR
    /// </summary>
    [Column(TypeName = "decimal(10,2)")]
    public decimal TotalPagado { get; set; } = 0;
    
    /// <summary>
    /// Check-in timestamp
    /// </summary>
    public DateTime? CheckinAt { get; set; }
    
    /// <summary>
    /// Terms accepted flag
    /// </summary>
    public bool AceptaTerminos { get; set; } = false;
    
    /// <summary>
    /// Additional notes
    /// </summary>
    public string? Notas { get; set; }
    
    /// <summary>
    /// Email sending status: pending, sent, error
    /// </summary>
    [MaxLength(20)]
    public string EmailEnviadoStatus { get; set; } = "pending";

    /// <summary>
    /// When the confirmation email was sent
    /// </summary>
    public DateTime? EmailEnviadoAt { get; set; }

    /// <summary>
    /// Error message if email sending failed
    /// </summary>
    [MaxLength(500)]
    public string? EmailEnviadoError { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual Competicion Competicion { get; set; } = null!;
    public virtual CuponDescuento? CuponDescuento { get; set; }
    public virtual ICollection<RifaTicket> RifaTickets { get; set; } = new List<RifaTicket>();
}

/// <summary>
/// Raffle ticket for a competition
/// </summary>
public class RifaTicket
{
    public int Id { get; set; }
    
    /// <summary>
    /// Competition this ticket belongs to
    /// </summary>
    public int CompeticionId { get; set; }
    
    /// <summary>
    /// Optional link to an inscription (if bought during registration)
    /// </summary>
    public int? InscripcionId { get; set; }
    
    /// <summary>
    /// Ticket number (unique per competition)
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string NumeroTicket { get; set; } = string.Empty;
    
    /// <summary>
    /// Stripe payment ID if paid online
    /// </summary>
    [MaxLength(255)]
    public string? StripePaymentId { get; set; }
    
    /// <summary>
    /// Buyer email
    /// </summary>
    [MaxLength(255)]
    public string? BuyerEmail { get; set; }
    
    /// <summary>
    /// Buyer name
    /// </summary>
    [MaxLength(255)]
    public string? BuyerNombre { get; set; }
    
    /// <summary>
    /// Whether payment has been confirmed
    /// </summary>
    public bool Confirmado { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual Competicion Competicion { get; set; } = null!;
    public virtual Inscripcion? Inscripcion { get; set; }
}

/// <summary>
/// Raffle configuration per competition
/// </summary>
public class RifaConfig
{
    public int Id { get; set; }
    
    /// <summary>
    /// Competition this config belongs to
    /// </summary>
    public int CompeticionId { get; set; }
    
    /// <summary>
    /// Prize name
    /// </summary>
    [MaxLength(255)]
    public string? NombrePremio { get; set; }
    
    /// <summary>
    /// Prize description
    /// </summary>
    public string? DescripcionPremio { get; set; }
    
    /// <summary>
    /// Ticket price in EUR
    /// </summary>
    [Column(TypeName = "decimal(10,2)")]
    public decimal PrecioTicket { get; set; } = 5;
    
    /// <summary>
    /// Total number of tickets available
    /// </summary>
    public int TicketsTotal { get; set; } = 100;
    
    /// <summary>
    /// Whether the raffle is active
    /// </summary>
    public bool Activo { get; set; } = false;
    
    /// <summary>
    /// Draw date
    /// </summary>
    public DateTime? FechaSorteo { get; set; }
    
    /// <summary>
    /// Winner ticket number
    /// </summary>
    [MaxLength(20)]
    public string? NumeroGanador { get; set; }
    
    /// <summary>
    /// Winner inscription ID
    /// </summary>
    public int? GanadorInscripcionId { get; set; }
    
    /// <summary>
    /// Whether the winner has been confirmed/claimed
    /// </summary>
    public bool? GanadorConfirmado { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    public virtual Competicion Competicion { get; set; } = null!;
}
