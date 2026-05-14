using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

/// <summary>
/// Tracks likes and comments on tutorial videos (FER CUP tutoriales page)
/// </summary>
public class TutorialInteraction
{
    public int Id { get; set; }

    /// <summary>
    /// Video identifier (e.g. "video-0508", "video-0509")
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string VideoId { get; set; } = string.Empty;

    /// <summary>
    /// Interaction type: "like" or "comment"
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Tipo { get; set; } = "like";

    /// <summary>
    /// Comment text (only for comments)
    /// </summary>
    [MaxLength(500)]
    public string? Contenido { get; set; }

    /// <summary>
    /// Comment author name (only for comments)
    /// </summary>
    [MaxLength(100)]
    public string? Autor { get; set; }

    /// <summary>
    /// Anonymous session identifier to prevent double-likes
    /// </summary>
    [MaxLength(100)]
    public string? SessionId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
