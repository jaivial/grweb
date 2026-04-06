using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

public class EmailConfigService
{
    private readonly GrCupDbContext _context;

    public EmailConfigService(GrCupDbContext context)
    {
        _context = context;
    }

    public async Task<EmailConfig?> GetConfigAsync()
    {
        return await _context.EmailConfig.FirstOrDefaultAsync();
    }

    public async Task<EmailConfig> UpsertConfigAsync(EmailConfig config)
    {
        var existing = await _context.EmailConfig.FirstOrDefaultAsync();
        if (existing == null)
        {
            config.CreatedAt = DateTime.UtcNow;
            config.UpdatedAt = DateTime.UtcNow;
            _context.EmailConfig.Add(config);
        }
        else
        {
            existing.MainProvider = config.MainProvider;
            existing.GmailAddress = config.GmailAddress;
            existing.GmailAppPassword = config.GmailAppPassword;
            existing.SmtpUsername = config.SmtpUsername;
            existing.SmtpPassword = config.SmtpPassword;
            existing.SmtpEmailAddress = config.SmtpEmailAddress;
            existing.SmtpHost = config.SmtpHost;
            existing.SmtpPort = config.SmtpPort;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();
        return existing ?? config;
    }

    public async Task<bool> DeleteConfigAsync()
    {
        var config = await _context.EmailConfig.FirstOrDefaultAsync();
        if (config == null) return false;
        _context.EmailConfig.Remove(config);
        await _context.SaveChangesAsync();
        return true;
    }
}
