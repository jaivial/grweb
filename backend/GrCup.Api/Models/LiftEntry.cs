using GrCup.Api.Models.Enums;

namespace GrCup.Api.Models;

public class LiftEntry
{
    public int Id { get; set; }
    public int AthleteId { get; set; }
    public LiftType LiftType { get; set; }
    public int AttemptNumber { get; set; }
    public decimal Weight { get; set; }
    public string? UpdatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Athlete Athlete { get; set; } = null!;
}
