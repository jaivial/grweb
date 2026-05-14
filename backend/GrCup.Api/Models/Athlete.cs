using System.Collections.Generic;
using GrCup.Api.Models.Enums;

namespace GrCup.Api.Models;

public class Athlete
{
    public int Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string Surname { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public Sex Sex { get; set; }
    public string WeightCategory { get; set; } = string.Empty;
    public string? Club { get; set; }
    public decimal? TotalWeight { get; set; }
    public DateTime RegistrationDate { get; set; } = DateTime.UtcNow;
    public string? Coach { get; set; }
    public AthleteStatus Status { get; set; } = AthleteStatus.Inscrito;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? QrCode { get; set; }
    public DateTime? CheckinAt { get; set; }
    public ICollection<LiftEntry> LiftEntries { get; set; } = new List<LiftEntry>();
}
