using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

public class RaffleProduct
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;
    
    [MaxLength(500)]
    public string? Subtitle { get; set; }
    
    [MaxLength(500)]
    public string? ImageUrl { get; set; }
    
    public int DisplayOrder { get; set; }
    
    public bool IsActive { get; set; } = true;
}
