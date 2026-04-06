using System.ComponentModel.DataAnnotations;

namespace GrCup.Api.Models;

public enum EmailProvider
{
    Smtp = 0,
    Gmail = 1
}

public class EmailConfig
{
    public int Id { get; set; }
    public EmailProvider MainProvider { get; set; } = EmailProvider.Smtp;

    // Gmail fields
    [MaxLength(255)]
    public string? GmailAddress { get; set; }
    [MaxLength(255)]
    public string? GmailAppPassword { get; set; }

    // SMTP fields
    [MaxLength(255)]
    public string? SmtpUsername { get; set; }
    [MaxLength(255)]
    public string? SmtpPassword { get; set; }
    [MaxLength(255)]
    public string? SmtpEmailAddress { get; set; }
    [MaxLength(255)]
    public string? SmtpHost { get; set; } = "smtp.gmail.com";
    public int SmtpPort { get; set; } = 587;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
