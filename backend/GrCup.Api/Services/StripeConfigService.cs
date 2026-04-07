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

    public async Task<StripeConfig?> GetConfigAsync()
    {
        return await _context.StripeConfig.FirstOrDefaultAsync();
    }

    public async Task<StripeConfig> UpsertConfigAsync(StripeConfig config)
    {
        var existing = await _context.StripeConfig.FirstOrDefaultAsync();
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
            existing.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();
        return existing ?? config;
    }

    public async Task<bool> DeleteConfigAsync()
    {
        var config = await _context.StripeConfig.FirstOrDefaultAsync();
        if (config == null) return false;
        _context.StripeConfig.Remove(config);
        await _context.SaveChangesAsync();
        return true;
    }
}
