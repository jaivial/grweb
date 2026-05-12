namespace GrCup.Api.Models;

public class SchedulePublishedConfig
{
    public int Id { get; set; }
    public DateTime DateModified { get; set; } = DateTime.UtcNow;
    public bool Value { get; set; } = true;
    
    /// <summary>
    /// Foreign key to Competicion. Nullable for backward compat.
    /// When null, applies as a global fallback (legacy behavior).
    /// </summary>
    public int? CompeticionId { get; set; }
    
    // Navigation property
    public virtual Competicion? Competicion { get; set; }
}
