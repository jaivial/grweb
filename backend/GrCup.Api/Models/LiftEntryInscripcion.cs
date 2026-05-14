using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GrCup.Api.Models;

/// <summary>
/// Lift attempt entry for a FER inscription (per-competition registration)
/// </summary>
public class LiftEntryInscripcion
{
    public int Id { get; set; }

    public int InscripcionId { get; set; }

    [Required]
    [MaxLength(20)]
    public string LiftType { get; set; } = string.Empty; // Squat, Bench, Deadlift

    /// <summary>
    /// Attempt number: 1, 2, or 3
    /// </summary>
    public int AttemptNumber { get; set; }

    [Column(TypeName = "decimal(6,2)")]
    public decimal Weight { get; set; }

    [MaxLength(255)]
    public string? UpdatedBy { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey(nameof(InscripcionId))]
    public virtual Inscripcion Inscripcion { get; set; } = null!;
}
