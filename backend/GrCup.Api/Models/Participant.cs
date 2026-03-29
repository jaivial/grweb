namespace GrCup.Api.Models;

public class Participant
{
    public int Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string Surname { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Instagram { get; set; } = string.Empty;
    public int TicketCount { get; set; }
    public decimal TotalPaid { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
