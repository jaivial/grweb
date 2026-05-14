using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GrCup.Api.Models;

public class StripeConfig
{
    public int Id { get; set; }

    // Per-competition FK (nullable = global config)
    public int? CompeticionId { get; set; }
    [ForeignKey(nameof(CompeticionId))]
    public Competicion? Competicion { get; set; }

    // Navigation property
    public virtual Competicion? Competicion { get; set; }

    [MaxLength(255)]
    public string? SecretKey { get; set; }

    [MaxLength(255)]
    public string? PublishableKey { get; set; }

    [MaxLength(255)]
    public string? WebhookSecret { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
