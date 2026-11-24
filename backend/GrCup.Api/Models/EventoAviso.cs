using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

/// <summary>
/// Email left via the public «Avísame» button for an upcoming event (e.g. "grscup-3").
/// </summary>
public class EventoAviso
{
    public int Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string Evento { get; set; } = string.Empty;

    [Required]
    [MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
