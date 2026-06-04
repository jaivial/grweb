using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GrCup.Api.Models;

/// <summary>
/// Per-competition default settings for the referral system.
/// Single row per competition, upserted from backoffice.
/// </summary>
public class ReferidoConfig
{
    public int Id { get; set; }

    public int CompeticionId { get; set; }

    /// <summary>Master toggle for the whole referral system on this competition.</summary>
    public bool Activo { get; set; } = false;

    /// <summary>"basico" or "acumulativo".</summary>
    [Required]
    [MaxLength(20)]
    public string Modo { get; set; } = "basico";

    /// <summary>Discount type the code OWNER receives: "importe" or "porcentaje".</summary>
    [Required]
    [MaxLength(20)]
    public string TipoDescuentoReferente { get; set; } = "importe";

    [Column(TypeName = "decimal(10,2)")]
    public decimal ValorDescuentoReferente { get; set; } = 0;

    /// <summary>Basic mode: cap on how many times the code can be used.</summary>
    public bool TieneLimiteUsos { get; set; } = false;

    public int? LimiteUsos { get; set; }

    /// <summary>Acumulative mode only: "basica" (just per-use reward) or "multiplicador" (multiplier per use).</summary>
    [MaxLength(20)]
    public string? ModoAcumulativo { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal? MultiplicadorAcumulativo { get; set; }

    /// <summary>Discount type the NEW user receives when using the code: "importe" or "porcentaje".</summary>
    [Required]
    [MaxLength(20)]
    public string TipoDescuentoNuevoUsuario { get; set; } = "porcentaje";

    [Column(TypeName = "decimal(10,2)")]
    public decimal ValorDescuentoNuevoUsuario { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public virtual Competicion Competicion { get; set; } = null!;
}

/// <summary>
/// Referral code owned by an inscripcion. 1:1 with Inscripcion.
/// When a new user uses the code, a NewUserReferral row is created pointing here.
/// </summary>
public class CodigoReferido
{
    public int Id { get; set; }

    public int InscripcionId { get; set; }

    public int CompeticionId { get; set; }

    /// <summary>Display code, e.g. "JUAPER-GR".</summary>
    [Required]
    [MaxLength(50)]
    public string Codigo { get; set; } = string.Empty;

    /// <summary>Upper-cased trim for unique constraint + lookup.</summary>
    [Required]
    [MaxLength(50)]
    public string CodigoNormalizado { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public virtual Inscripcion Inscripcion { get; set; } = null!;
    public virtual Competicion Competicion { get; set; } = null!;
    public virtual ReferidoUserSetting? UserSetting { get; set; }
    public virtual ICollection<NewUserReferral> NewUserReferrals { get; set; } = new List<NewUserReferral>();
}

/// <summary>
/// Per-inscripcion override for referral settings. Falls back to ReferidoConfig if missing.
/// Created when admin toggles/overrides a specific inscripcion's code behaviour.
/// </summary>
public class ReferidoUserSetting
{
    public int Id { get; set; }

    public int CodigoReferidoId { get; set; }

    /// <summary>Per-code on/off. When false, the code is rejected at validation even if config is active.</summary>
    public bool Activo { get; set; } = false;

    [Required]
    [MaxLength(20)]
    public string Modo { get; set; } = "basico";

    [Required]
    [MaxLength(20)]
    public string TipoDescuentoReferente { get; set; } = "importe";

    [Column(TypeName = "decimal(10,2)")]
    public decimal ValorDescuentoReferente { get; set; } = 0;

    public bool TieneLimiteUsos { get; set; } = false;

    public int? LimiteUsos { get; set; }

    [MaxLength(20)]
    public string? ModoAcumulativo { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal? MultiplicadorAcumulativo { get; set; }

    [Required]
    [MaxLength(20)]
    public string TipoDescuentoNuevoUsuario { get; set; } = "porcentaje";

    [Column(TypeName = "decimal(10,2)")]
    public decimal ValorDescuentoNuevoUsuario { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public virtual CodigoReferido CodigoReferido { get; set; } = null!;
}

/// <summary>
/// One row per new inscripcion that used a referral code.
/// Tracks the discount given to the new user + accumulated referrer reward + Stripe refund outcome.
/// </summary>
public class NewUserReferral
{
    public int Id { get; set; }

    public int CodigoReferidoId { get; set; }

    public int InscripcionId { get; set; }

    [Required]
    [MaxLength(20)]
    public string TipoDescuento { get; set; } = "porcentaje";

    [Column(TypeName = "decimal(10,2)")]
    public decimal ImporteDescuento { get; set; } = 0;

    /// <summary>How many times the code has been used in total when this row was created (snapshot for cumulative math).</summary>
    public int VecesUsado { get; set; } = 1;

    /// <summary>Running total of what the referrer is owed for this redemption.</summary>
    [Column(TypeName = "decimal(10,2)")]
    public decimal ImporteAcumuladoReferente { get; set; } = 0;

    [MaxLength(100)]
    public string? StripeRefundId { get; set; }

    public DateTime? RefundedAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public virtual CodigoReferido CodigoReferido { get; set; } = null!;
    public virtual Inscripcion Inscripcion { get; set; } = null!;
}
