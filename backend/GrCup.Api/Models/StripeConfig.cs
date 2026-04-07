using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

public class StripeConfig
{
    public int Id { get; set; }

    [MaxLength(255)]
    public string? SecretKey { get; set; }

    [MaxLength(255)]
    public string? PublishableKey { get; set; }

    [MaxLength(255)]
    public string? WebhookSecret { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
