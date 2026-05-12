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

    /// <summary>
    /// Gets email config for a specific competition, falling back to global config if not found.
    /// When competicionId is null, returns the global config (CompeticionId == null).
    /// </summary>
    public async Task<EmailConfig?> GetConfigAsync(int? competicionId = null)
    {
        if (competicionId.HasValue)
        {
            // Try competition-specific config first
            var compConfig = await _context.EmailConfig
                .FirstOrDefaultAsync(e => e.CompeticionId == competicionId.Value);
            if (compConfig != null) return compConfig;

            // Fall back to global config
            return await _context.EmailConfig
                .FirstOrDefaultAsync(e => e.CompeticionId == null);
        }

        // Global config only
        return await _context.EmailConfig
            .FirstOrDefaultAsync(e => e.CompeticionId == null);
    }

    /// <summary>
    /// Upserts email config for a specific competition or globally.
    /// </summary>
    public async Task<EmailConfig> UpsertConfigAsync(EmailConfig config, int? competicionId = null)
    {
        config.CompeticionId = competicionId;

        var existing = competicionId.HasValue
            ? await _context.EmailConfig.FirstOrDefaultAsync(e => e.CompeticionId == competicionId.Value)
            : await _context.EmailConfig.FirstOrDefaultAsync(e => e.CompeticionId == null);

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
            existing.CompeticionId = competicionId;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();
        return existing ?? config;
    }

    /// <summary>
    /// Deletes email config for a specific competition or globally.
    /// </summary>
    public async Task<bool> DeleteConfigAsync(int? competicionId = null)
    {
        var config = competicionId.HasValue
            ? await _context.EmailConfig.FirstOrDefaultAsync(e => e.CompeticionId == competicionId.Value)
            : await _context.EmailConfig.FirstOrDefaultAsync(e => e.CompeticionId == null);
        if (config == null) return false;
        _context.EmailConfig.Remove(config);
        await _context.SaveChangesAsync();
        return true;
    }
}
