namespace GrCup.Api.Models;

public class InscripcionPreparada
{
    public int Id { get; set; }
    public DateTime? DateTime { get; set; }
    public bool Preparadas { get; set; } = false;
}
