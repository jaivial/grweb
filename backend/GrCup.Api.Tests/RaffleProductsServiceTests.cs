using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Tests;

public class RaffleProductsServiceTests : IDisposable
{
    private readonly GrCupDbContext _context;

    public RaffleProductsServiceTests()
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

    [Fact]
    public async Task CreateProduct_SetsCorrectDefaults()
    {
        var product = new RaffleProduct
        {
            Title = "Test Prize",
            DisplayOrder = 1
        };
        _context.RaffleProducts.Add(product);
        await _context.SaveChangesAsync();

        var saved = await _context.RaffleProducts.FindAsync(product.Id);
        Assert.NotNull(saved);
        Assert.True(saved.IsActive);
        Assert.Null(saved.Subtitle);
        Assert.Null(saved.ImageUrl);
        Assert.Equal(1, saved.DisplayOrder);
    }

    [Fact]
    public async Task CreateProduct_WithSubtitle_StoresSubtitle()
    {
        var product = new RaffleProduct
        {
            Title = "Prize with Subtitle",
            Subtitle = "This is a subtitle",
            DisplayOrder = 1
        };
        _context.RaffleProducts.Add(product);
        await _context.SaveChangesAsync();

        var saved = await _context.RaffleProducts.FindAsync(product.Id);
        Assert.NotNull(saved);
        Assert.Equal("This is a subtitle", saved.Subtitle);
    }

    [Fact]
    public async Task CreateProduct_WithImageUrl_StoresUrl()
    {
        var product = new RaffleProduct
        {
            Title = "Prize with Image",
            ImageUrl = "https://example.com/image.webp",
            DisplayOrder = 1
        };
        _context.RaffleProducts.Add(product);
        await _context.SaveChangesAsync();

        var saved = await _context.RaffleProducts.FindAsync(product.Id);
        Assert.NotNull(saved);
        Assert.Equal("https://example.com/image.webp", saved.ImageUrl);
    }

    [Fact]
    public async Task UpdateProduct_ChangesTitle()
    {
        var product = new RaffleProduct { Title = "Original", DisplayOrder = 1 };
        _context.RaffleProducts.Add(product);
        await _context.SaveChangesAsync();

        product.Title = "Updated Title";
        product.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var saved = await _context.RaffleProducts.FindAsync(product.Id);
        Assert.NotNull(saved);
        Assert.Equal("Updated Title", saved.Title);
    }

    [Fact]
    public async Task ToggleStatus_FlipsIsActive()
    {
        var product = new RaffleProduct { Title = "Toggle Test", IsActive = true, DisplayOrder = 1 };
        _context.RaffleProducts.Add(product);
        await _context.SaveChangesAsync();

        product.IsActive = false;
        product.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var saved = await _context.RaffleProducts.FindAsync(product.Id);
        Assert.NotNull(saved);
        Assert.False(saved.IsActive);
    }

    [Fact]
    public async Task DeleteProduct_RemovesFromDb()
    {
        var product = new RaffleProduct { Title = "To Delete", DisplayOrder = 1 };
        _context.RaffleProducts.Add(product);
        await _context.SaveChangesAsync();
        var id = product.Id;

        _context.RaffleProducts.Remove(product);
        await _context.SaveChangesAsync();

        var found = await _context.RaffleProducts.FindAsync(id);
        Assert.Null(found);
    }

    [Fact]
    public async Task GetActiveProducts_FiltersCorrectly()
    {
        _context.RaffleProducts.AddRange(
            new RaffleProduct { Title = "Active 1", IsActive = true, DisplayOrder = 1 },
            new RaffleProduct { Title = "Inactive 1", IsActive = false, DisplayOrder = 2 },
            new RaffleProduct { Title = "Active 2", IsActive = true, DisplayOrder = 3 }
        );
        await _context.SaveChangesAsync();

        var activeProducts = await _context.RaffleProducts
            .Where(p => p.IsActive)
            .OrderBy(p => p.DisplayOrder)
            .ToListAsync();

        Assert.Equal(2, activeProducts.Count);
        Assert.All(activeProducts, p => Assert.True(p.IsActive));
    }

    [Fact]
    public async Task ReorderProducts_ChangesDisplayOrder()
    {
        var p1 = new RaffleProduct { Title = "First", DisplayOrder = 1 };
        var p2 = new RaffleProduct { Title = "Second", DisplayOrder = 2 };
        var p3 = new RaffleProduct { Title = "Third", DisplayOrder = 3 };
        _context.RaffleProducts.AddRange(p1, p2, p3);
        await _context.SaveChangesAsync();

        p1.DisplayOrder = 3;
        p2.DisplayOrder = 1;
        p3.DisplayOrder = 2;
        await _context.SaveChangesAsync();

        var reordered = await _context.RaffleProducts
            .OrderBy(p => p.DisplayOrder)
            .ToListAsync();

        Assert.Equal("Second", reordered[0].Title);
        Assert.Equal("Third", reordered[1].Title);
        Assert.Equal("First", reordered[2].Title);
    }

    [Fact]
    public async Task RaffleMethod_CanBeZeroOrOne()
    {
        var config = new RaffleConfig { IsEnabled = true, RaffleMethod = 0 };
        _context.RaffleConfig.Add(config);
        await _context.SaveChangesAsync();

        var saved = await _context.RaffleConfig.FirstOrDefaultAsync();
        Assert.NotNull(saved);
        Assert.Equal(0, saved.RaffleMethod);

        saved.RaffleMethod = 1;
        saved.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var updated = await _context.RaffleConfig.FirstOrDefaultAsync();
        Assert.NotNull(updated);
        Assert.Equal(1, updated.RaffleMethod);
    }

    [Fact]
    public void RaffleConfig_DefaultsToMethodZero()
    {
        var config = new RaffleConfig();
        Assert.Equal(0, config.RaffleMethod);
    }
}
