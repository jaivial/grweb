using Microsoft.EntityFrameworkCore;
using QRCoder;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;

namespace GrCup.Api.Services;

public class CheckinService
{
    private readonly GrCupDbContext _context;

    public CheckinService(GrCupDbContext context)
    {
        _context = context;
    }

    public async Task<CheckinStatusResult?> GetCheckinStatusAsync(int athleteId)
    {
        var athlete = await _context.Athletes.FindAsync(athleteId);
        if (athlete == null) return null;

        return BuildCheckinStatus(athlete);
    }

    public async Task<CheckinStatusResult?> FindByQrCodeAsync(string qrCode)
    {
        var athlete = await _context.Athletes
            .FirstOrDefaultAsync(a => a.QrCode == qrCode);
        if (athlete == null) return null;

        return BuildCheckinStatus(athlete);
    }

    public async Task<string?> GenerateQrCodeAsync(int athleteId)
    {
        var athlete = await _context.Athletes.FindAsync(athleteId);
        if (athlete == null) return null;

        var qrCode = $"ATH-{athleteId}-{Guid.NewGuid():N}";
        athlete.QrCode = qrCode;
        athlete.CheckinAt = null;

        await _context.SaveChangesAsync();
        return qrCode;
    }

    public async Task<byte[]?> GenerateQrImageAsync(int athleteId)
    {
        var athlete = await _context.Athletes.FindAsync(athleteId);
        if (athlete == null || string.IsNullOrEmpty(athlete.QrCode))
            return null;

        using var qrGenerator = new QRCodeGenerator();
        var qrCodeData = qrGenerator.CreateQrCode(athlete.QrCode, QRCodeGenerator.ECCLevel.Q);
        using var qrCode = new PngByteQRCode(qrCodeData);
        return qrCode.GetGraphic(20);
    }

    public async Task<Athlete?> ConfirmCheckinAsync(int athleteId)
    {
        var athlete = await _context.Athletes.FindAsync(athleteId);
        if (athlete == null) return null;
        if (athlete.Status != AthleteStatus.Paid) return null;

        athlete.CheckinAt = DateTime.UtcNow;
        athlete.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return athlete;
    }

    private static CheckinStatusResult BuildCheckinStatus(Athlete athlete)
    {
        var inscriptionConfirmed = true;
        var paymentCompleted = athlete.Status == AthleteStatus.Paid;
        var canSetOpeners = paymentCompleted;

        return new CheckinStatusResult
        {
            Id = athlete.Id,
            FirstName = athlete.FirstName,
            Surname = athlete.Surname,
            Email = athlete.Email,
            WeightCategory = athlete.WeightCategory,
            Sex = athlete.Sex,
            Club = athlete.Club,
            Coach = athlete.Coach,
            InscriptionConfirmed = inscriptionConfirmed,
            PaymentCompleted = paymentCompleted,
            CanSetOpeners = canSetOpeners,
            CheckinAt = athlete.CheckinAt
        };
    }
}

public class CheckinStatusResult
{
    public int Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string Surname { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string WeightCategory { get; set; } = string.Empty;
    public Sex Sex { get; set; }
    public string? Club { get; set; }
    public string? Coach { get; set; }
    public bool InscriptionConfirmed { get; set; }
    public bool PaymentCompleted { get; set; }
    public bool CanSetOpeners { get; set; }
    public DateTime? CheckinAt { get; set; }
}
