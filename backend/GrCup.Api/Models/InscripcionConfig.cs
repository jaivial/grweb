using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

public class InscripcionConfig
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime EditedAt { get; set; } = DateTime.UtcNow;
    public bool Active { get; set; } = true;
    [MaxLength(200)]
    public string? Url { get; set; }
}
