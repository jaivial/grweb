namespace GrCup.Api.Models;

public class SchedulePublishedConfig
{
    public int Id { get; set; }
    public DateTime DateModified { get; set; } = DateTime.UtcNow;
    public bool Value { get; set; } = true;

    // Multi-tenant FK (nullable for legacy GR Cup data)
    public int? CompeticionId { get; set; }

    // Navigation property
    public virtual Competicion? Competicion { get; set; }
}
