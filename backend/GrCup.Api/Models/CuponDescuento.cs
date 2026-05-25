using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GrCup.Api.Models;

public class CuponDescuento
{
    public int Id { get; set; }

    public int CompeticionId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Codigo { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string CodigoNormalizado { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string TipoDescuento { get; set; } = "porcentaje";

    [Column(TypeName = "decimal(10,2)")]
    public decimal Valor { get; set; }

    public bool Activo { get; set; } = true;

    public bool TieneLimiteUsos { get; set; } = false;

    public int? LimiteUsos { get; set; }

    public bool TieneFechaExpiracion { get; set; } = false;

    public DateTime? FechaExpiracion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public virtual Competicion Competicion { get; set; } = null!;
}
