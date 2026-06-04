using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GrCup.Api.Models;

/// <summary>
/// Represents a raffle draw of an Inscripcion (or Athlete) for a Competicion.
/// Persists winners of the post-registration raffle along with the filter criteria used.
/// </summary>
public class SorteoInscripcion
{
    public int Id { get; set; }

    /// <summary>
    /// Competition this draw belongs to
    /// </summary>
    public int CompeticionId { get; set; }

    /// <summary>
    /// Optional reference to an Inscripcion (multi-tenant model). Null for Athlete-based draws.
    /// </summary>
    public int? InscripcionId { get; set; }

    /// <summary>
    /// Optional reference to a legacy Athlete. Null for Inscripcion-based draws.
    /// </summary>
    public int? AthleteId { get; set; }

    /// <summary>
    /// UTC timestamp of when the draw was performed
    /// </summary>
    public DateTime FechaSorteo { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// 1-indexed position among winners (1 = first winner)
    /// </summary>
    public int NumeroGanador { get; set; }

    /// <summary>
    /// JSON-serialized criteria used for this draw (filter mode, numWinners, equityMode, etc.)
    /// </summary>
    [Column(TypeName = "json")]
    public string FiltroAplicado { get; set; } = "{}";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public virtual Competicion Competicion { get; set; } = null!;
    public virtual Inscripcion? Inscripcion { get; set; }
    public virtual Athlete? Athlete { get; set; }
}
