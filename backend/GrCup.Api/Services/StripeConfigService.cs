using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

public class StripeConfigService
{
    private readonly GrCupDbContext _context;

    public StripeConfigService(GrCupDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Gets Stripe config for a specific competition, falling back to global config if not found.
    /// When competicionId is null, returns the global config (CompeticionId == null).
    /// </summary>
    public async Task<StripeConfig?> GetConfigAsync(int? competicionId = null)
    {
        if (competicionId.HasValue)
        {
            var compConfig = await _context.StripeConfig
                .FirstOrDefaultAsync(s => s.CompeticionId == competicionId.Value);
            if (compConfig != null) return compConfig;

            return await _context.StripeConfig
                .FirstOrDefaultAsync(s => s.CompeticionId == null);
        }

        return await _context.StripeConfig
            .FirstOrDefaultAsync(s => s.CompeticionId == null);
    }

    /// <summary>
    /// Upserts Stripe config for a specific competition or globally.
    /// </summary>
    public async Task<StripeConfig> UpsertConfigAsync(StripeConfig config, int? competicionId = null)
    {
        config.CompeticionId = competicionId;

        var existing = competicionId.HasValue
            ? await _context.StripeConfig.FirstOrDefaultAsync(s => s.CompeticionId == competicionId.Value)
            : await _context.StripeConfig.FirstOrDefaultAsync(s => s.CompeticionId == null);

        if (existing == null)
        {
            config.CreatedAt = DateTime.UtcNow;
            config.UpdatedAt = DateTime.UtcNow;
            _context.StripeConfig.Add(config);
        }
        else
        {
            existing.SecretKey = config.SecretKey;
            existing.PublishableKey = config.PublishableKey;
            existing.WebhookSecret = config.WebhookSecret;
            existing.CompeticionId = competicionId;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();
        return existing ?? config;
    }

    /// <summary>
    /// Deletes Stripe config for a specific competition or globally.
    /// </summary>
    public async Task<bool> DeleteConfigAsync(int? competicionId = null)
    {
        var config = competicionId.HasValue
            ? await _context.StripeConfig.FirstOrDefaultAsync(s => s.CompeticionId == competicionId.Value)
            : await _context.StripeConfig.FirstOrDefaultAsync(s => s.CompeticionId == null);
        if (config == null) return false;
        _context.StripeConfig.Remove(config);
        await _context.SaveChangesAsync();
        return true;
    }
}
