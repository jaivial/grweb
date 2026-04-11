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
    
    // Base64 encoded image data stored as blob
    public string? ImageData { get; set; }
    
    // MIME type of the image (e.g., "image/jpeg", "image/png")
    [MaxLength(50)]
    public string? ImageMimeType { get; set; }
    
    // Display order
    public int DisplayOrder { get; set; }
    
    // Whether this product is currently active
    public bool IsActive { get; set; } = true;
}
