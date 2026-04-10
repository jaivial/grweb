using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Tests;

/// <summary>
/// TDD RED phase: These tests define the expected behavior of RaffleConfig.
/// They fail until we implement the feature.
/// Follows the same pattern as InscripcionConfig.
/// </summary>
public class RaffleConfigServiceTests : IDisposable
{
    private readonly GrCupDbContext _context;

    public RaffleConfigServiceTests()
    {
        var options = new DbContextOptionsBuilder<GrCupDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new GrCupDbContext(options);
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    // ─── GetConfig ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetConfig_ReturnsIsEnabledTrue_WhenDefaultConfigExists()
    {
        // Arrange — seed default config with IsEnabled = true
        _context.RaffleConfig.Add(new RaffleConfig { IsEnabled = true });
        await _context.SaveChangesAsync();

        // Act
        var config = await _context.RaffleConfig.FirstOrDefaultAsync();

        // Assert
        Assert.NotNull(config);
        Assert.True(config.IsEnabled);
    }

    [Fact]
    public async Task GetConfig_ReturnsIsEnabledFalse_WhenRaffleIsDisabled()
    {
        // Arrange
        _context.RaffleConfig.Add(new RaffleConfig { IsEnabled = false });
        await _context.SaveChangesAsync();

        // Act
        var config = await _context.RaffleConfig.FirstOrDefaultAsync();

        // Assert
        Assert.NotNull(config);
        Assert.False(config.IsEnabled);
    }

    [Fact]
    public async Task GetConfig_ReturnsDefaultEnabled_WhenNoConfigExists()
    {
        // Arrange — no config in DB

        // Act
        var config = await _context.RaffleConfig.FirstOrDefaultAsync();

        // Assert — defaults to enabled when not present
        Assert.Null(config); // no row yet
    }

    [Fact]
    public async Task GetConfig_IncludesDisabledMessage_WhenSet()
    {
        // Arrange
        var message = "El sorteo ha terminado. ¡Gracias por participar!";
        _context.RaffleConfig.Add(new RaffleConfig
        {
            IsEnabled = false,
            DisabledMessage = message
        });
        await _context.SaveChangesAsync();

        // Act
        var config = await _context.RaffleConfig.FirstOrDefaultAsync();

        // Assert
        Assert.NotNull(config);
        Assert.False(config.IsEnabled);
        Assert.Equal(message, config.DisabledMessage);
    }

    // ─── UpdateConfig ──────────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateConfig_SetsIsEnabledFalse_WhenUpdating()
    {
        // Arrange — existing enabled config
        _context.RaffleConfig.Add(new RaffleConfig { IsEnabled = true });
        await _context.SaveChangesAsync();

        var config = await _context.RaffleConfig.FirstOrDefaultAsync();

        // Act
        config!.IsEnabled = false;
        config.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Assert
        var updated = await _context.RaffleConfig.FirstOrDefaultAsync();
        Assert.NotNull(updated);
        Assert.False(updated.IsEnabled);
    }

    [Fact]
    public async Task UpdateConfig_SetsDisabledMessage_WhenProvided()
    {
        // Arrange
        _context.RaffleConfig.Add(new RaffleConfig { IsEnabled = true });
        await _context.SaveChangesAsync();

        var config = await _context.RaffleConfig.FirstOrDefaultAsync();
        var newMessage = "Vuelve pronto para el próximo sorteo.";

        // Act
        config!.IsEnabled = false;
        config.DisabledMessage = newMessage;
        config.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Assert
        var updated = await _context.RaffleConfig.FirstOrDefaultAsync();
        Assert.NotNull(updated);
        Assert.Equal(newMessage, updated.DisabledMessage);
    }

    [Fact]
    public async Task UpdateConfig_ReEnablesRaffle_WhenSettingIsEnabledTrue()
    {
        // Arrange — disabled config
        _context.RaffleConfig.Add(new RaffleConfig
        {
            IsEnabled = false,
            DisabledMessage = "Cerrado"
        });
        await _context.SaveChangesAsync();

        var config = await _context.RaffleConfig.FirstOrDefaultAsync();

        // Act
        config!.IsEnabled = true;
        config.DisabledMessage = null;
        config.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Assert
        var updated = await _context.RaffleConfig.FirstOrDefaultAsync();
        Assert.NotNull(updated);
        Assert.True(updated.IsEnabled);
        Assert.Null(updated.DisabledMessage);
    }
}
