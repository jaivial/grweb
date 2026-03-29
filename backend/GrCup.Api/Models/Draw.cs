namespace GrCup.Api.Models;

public class Draw
{
    public int Id { get; set; }
    public string WinnerEmail { get; set; } = string.Empty;
    public string? WinnerName { get; set; }
    public string? WinnerInstagram { get; set; }
    public int? WinnerTicketCount { get; set; }
    public DateTime DrawDate { get; set; } = DateTime.UtcNow;
    public string? Notes { get; set; }
    public bool IsConfirmed { get; set; }
}
