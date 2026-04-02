namespace GrCup.Api.Models;

public class UrlInscripcion
{
    public int Id { get; set; }
    public DateTime DateModified { get; set; } = DateTime.UtcNow;
    public string? Url { get; set; }
}
