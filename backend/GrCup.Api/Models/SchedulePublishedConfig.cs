namespace GrCup.Api.Models;

public class SchedulePublishedConfig
{
    public int Id { get; set; }
    public DateTime DateModified { get; set; } = DateTime.UtcNow;
    public bool Value { get; set; } = true;
}
