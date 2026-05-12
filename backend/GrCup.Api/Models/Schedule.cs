using GrCup.Api.Models.Enums;

namespace GrCup.Api.Models;

public class Schedule
{
    public int Id { get; set; }
    public Sex SexCategory { get; set; }
    public string WeightCategory { get; set; } = string.Empty;
    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    
    /// <summary>
    /// Foreign key to Competicion. Nullable for backward compat with legacy schedules.
    /// </summary>
    public int? CompeticionId { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation property
    public virtual Competicion? Competicion { get; set; }
}
