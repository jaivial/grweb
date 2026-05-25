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

    public async Task<StripeConfig?> GetExactConfigAsync(int? competicionId = null)
    {
        return competicionId.HasValue
            ? await _context.StripeConfig.FirstOrDefaultAsync(s => s.CompeticionId == competicionId.Value)
            : await _context.StripeConfig.FirstOrDefaultAsync(s => s.CompeticionId == null);
    }

    /// <summary>
    /// Upserts Stripe config for a specific competition or globally.
    /// </summary>
    public async Task<StripeConfig> UpsertConfigAsync(StripeConfig config, int? competicionId = null, bool? activo = null)
    {
        config.CompeticionId = competicionId;

        var existing = competicionId.HasValue
            ? await _context.StripeConfig.FirstOrDefaultAsync(s => s.CompeticionId == competicionId.Value)
            : await _context.StripeConfig.FirstOrDefaultAsync(s => s.CompeticionId == null);

        if (existing == null)
        {
            config.Activo = activo ?? config.Activo;
            config.CreatedAt = DateTime.UtcNow;
            config.UpdatedAt = DateTime.UtcNow;
            _context.StripeConfig.Add(config);
        }
        else
        {
            if (!string.IsNullOrEmpty(config.SecretKey) && !config.SecretKey.StartsWith("****"))
                existing.SecretKey = config.SecretKey;
            if (!string.IsNullOrEmpty(config.PublishableKey) && !config.PublishableKey.StartsWith("****"))
                existing.PublishableKey = config.PublishableKey;
            if (!string.IsNullOrEmpty(config.WebhookSecret) && !config.WebhookSecret.StartsWith("****"))
                existing.WebhookSecret = config.WebhookSecret;
            existing.CompeticionId = competicionId;
            if (activo.HasValue)
                existing.Activo = activo.Value;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();
        return existing ?? config;
    }

    public async Task<StripeConfig> SetActiveAsync(int? competicionId, bool activo)
    {
        var existing = await GetExactConfigAsync(competicionId);
        if (existing == null)
        {
            existing = new StripeConfig
            {
                CompeticionId = competicionId,
                Activo = activo,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _context.StripeConfig.Add(existing);
        }
        else
        {
            existing.Activo = activo;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return existing;
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
