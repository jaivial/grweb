namespace GrCup.Api.Services;

/// <summary>
/// Helper methods for competition type checking
/// </summary>
public static class CompeticionHelper
{
    /// <summary>
    /// Checks if the competition type is "fer" (case-insensitive)
    /// </summary>
    public static bool IsFerCompetition(string? tipo)
    {
        return string.Equals(tipo, "fer", StringComparison.OrdinalIgnoreCase);
    }
}
