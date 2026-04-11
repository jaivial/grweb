using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

public class RaffleConfig
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsEnabled { get; set; } = true;
    [MaxLength(500)]
    public string? DisabledMessage { get; set; }
    
    public int RaffleMethod { get; set; } = 0;
}
