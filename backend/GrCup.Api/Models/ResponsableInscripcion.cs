namespace GrCup.Api.Models;

public class ResponsableInscripcion
{
    public int Id { get; set; }
    public DateTime DateModified { get; set; } = DateTime.UtcNow;
    public bool Value { get; set; } = true; // true = GRStrength, false = AEP
}
