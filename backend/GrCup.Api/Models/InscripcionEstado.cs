using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

/// <summary>
/// Per-competition registration open/closed state.
/// Source of truth for whether inscripciones are open, independent of aforo/plazas.
/// </summary>
public class InscripcionEstado
{
    public int Id { get; set; }

    /// <summary>
    /// Competition this state belongs to (unique per competition)
    /// </summary>
    public int CompeticionId { get; set; }

    /// <summary>
    /// Whether registration is open for this competition
    /// </summary>
    public bool InscripcionesAbiertas { get; set; } = true;

    /// <summary>
    /// Whether the competition is closed because it is sold out (as opposed to
    /// being closed temporarily). Only meaningful when InscripcionesAbiertas is false.
    /// </summary>
    public bool SoldOut { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    public virtual Competicion? Competicion { get; set; }
}
