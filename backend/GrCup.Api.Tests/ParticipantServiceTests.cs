using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Services;

namespace GrCup.Api.Tests;

public class ParticipantServiceTests : IDisposable
{
    private readonly GrCupDbContext _context;
    private readonly ParticipantService _service;

    public ParticipantServiceTests()
    {
        var options = new DbContextOptionsBuilder<GrCupDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new GrCupDbContext(options);
        _service = new ParticipantService(_context);

        SeedData();
    }

    private void SeedData()
    {
        var now = DateTime.UtcNow;
        var participants = new List<Participant>
        {
            new() { Id = 1, FirstName = "Alice",   Surname = "Alpha",   Email = "alice@test.com",   Instagram = "alice",   TicketCount = 5,  TotalPaid = 2.50m, IsPaid = true,  PaymentMethod = "cash",   CreatedAt = now.AddHours(-4) },
            new() { Id = 2, FirstName = "Bob",     Surname = "Beta",    Email = "bob@test.com",     Instagram = "bob",     TicketCount = 10, TotalPaid = 5.00m, IsPaid = true,  PaymentMethod = "stripe", CreatedAt = now.AddHours(-3) },
            new() { Id = 3, FirstName = "Charlie", Surname = "Gamma",   Email = "charlie@test.com", Instagram = "charlie", TicketCount = 3,  TotalPaid = 0m,    IsPaid = false, PaymentMethod = "bank",  CreatedAt = now.AddHours(-2) },
            new() { Id = 4, FirstName = "Diana",   Surname = "Delta",   Email = "diana@test.com",   Instagram = "diana",   TicketCount = 20, TotalPaid = 10.00m,IsPaid = true,  PaymentMethod = "stripe", CreatedAt = now.AddHours(-1) },
            new() { Id = 5, FirstName = "Eve",     Surname = "Epsilon", Email = "eve@test.com",     Instagram = "eve",     TicketCount = 1,  TotalPaid = 0m,    IsPaid = false, PaymentMethod = "cash",  CreatedAt = now },
        };

        _context.Participants.AddRange(participants);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Dispose();
    }

    // ─── Pagination ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllPaginatedAsync_ReturnsCorrectPage()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 2
        );

        Assert.Equal(5, totalCount);
        Assert.Equal(2, participants.Count);
    }

    [Fact]
    public async Task GetAllPaginatedAsync_SkipsCorrectly()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 2, pageSize: 2
        );

        Assert.Equal(5, totalCount);
        Assert.Equal(2, participants.Count);
        Assert.Equal(3, participants[0].Id);
    }

    [Fact]
    public async Task GetAllPaginatedAsync_ReturnsRemainingOnLastPage()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 3, pageSize: 2
        );

        Assert.Equal(5, totalCount);
        Assert.Single(participants);
    }

    // ─── Default Sort (createdAt desc) ────────────────────────────────────────

    [Fact]
    public async Task GetAllPaginatedAsync_SortsByCreatedAtDescByDefault()
    {
        var (participants, _) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 5
        );

        Assert.Equal(5, participants[0].Id); // newest (now)
        Assert.Equal(4, participants[1].Id); // now-1h
        Assert.Equal(3, participants[2].Id); // now-2h
        Assert.Equal(2, participants[3].Id); // now-3h
        Assert.Equal(1, participants[4].Id); // now-4h (oldest)
    }

    // ─── Sort by TicketCount ──────────────────────────────────────────────────

    [Fact]
    public async Task GetAllPaginatedAsync_SortsByTicketCountDesc()
    {
        var (participants, _) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 5, sortBy: "ticketCount", sortOrder: "desc"
        );

        Assert.Equal(4, participants[0].Id); // 20 tickets
        Assert.Equal(2, participants[1].Id); // 10 tickets
        Assert.Equal(1, participants[2].Id); // 5 tickets
        Assert.Equal(3, participants[3].Id); // 3 tickets
        Assert.Equal(5, participants[4].Id); // 1 ticket
    }

    [Fact]
    public async Task GetAllPaginatedAsync_SortsByTicketCountAsc()
    {
        var (participants, _) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 5, sortBy: "ticketCount", sortOrder: "asc"
        );

        Assert.Equal(5, participants[0].Id); // 1 ticket
        Assert.Equal(3, participants[1].Id); // 3 tickets
        Assert.Equal(1, participants[2].Id); // 5 tickets
        Assert.Equal(2, participants[3].Id); // 10 tickets
        Assert.Equal(4, participants[4].Id); // 20 tickets
    }

    // ─── Sort by Name ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllPaginatedAsync_SortsByNameAsc()
    {
        var (participants, _) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 5, sortBy: "name", sortOrder: "asc"
        );

        Assert.Equal("Alice", participants[0].FirstName);
        Assert.Equal("Bob", participants[1].FirstName);
        Assert.Equal("Charlie", participants[2].FirstName);
        Assert.Equal("Diana", participants[3].FirstName);
        Assert.Equal("Eve", participants[4].FirstName);
    }

    [Fact]
    public async Task GetAllPaginatedAsync_SortsByNameDesc()
    {
        var (participants, _) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 5, sortBy: "name", sortOrder: "desc"
        );

        Assert.Equal("Eve", participants[0].FirstName);
        Assert.Equal("Diana", participants[1].FirstName);
        Assert.Equal("Charlie", participants[2].FirstName);
        Assert.Equal("Bob", participants[3].FirstName);
        Assert.Equal("Alice", participants[4].FirstName);
    }

    // ─── Filter by isPaid ─────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllPaginatedAsync_FiltersByIsPaidTrue()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, isPaid: true
        );

        Assert.Equal(3, totalCount);
        Assert.All(participants, p => Assert.True(p.IsPaid));
    }

    [Fact]
    public async Task GetAllPaginatedAsync_FiltersByIsPaidFalse()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, isPaid: false
        );

        Assert.Equal(2, totalCount);
        Assert.All(participants, p => Assert.False(p.IsPaid));
    }

    // ─── Filter by PaymentMethod ───────────────────────────────────────────────

    [Fact]
    public async Task GetAllPaginatedAsync_FiltersByPaymentMethodCash()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, paymentMethod: "cash"
        );

        Assert.Equal(2, totalCount);
        Assert.All(participants, p => Assert.Equal("cash", p.PaymentMethod!.ToLower()));
    }

    [Fact]
    public async Task GetAllPaginatedAsync_FiltersByPaymentMethodStripe()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, paymentMethod: "stripe"
        );

        Assert.Equal(2, totalCount);
        Assert.All(participants, p => Assert.Equal("stripe", p.PaymentMethod!.ToLower()));
    }

    [Fact]
    public async Task GetAllPaginatedAsync_FiltersByPaymentMethodBank()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, paymentMethod: "bank"
        );

        Assert.Single(participants);
        Assert.Equal("bank", participants[0].PaymentMethod!.ToLower());
    }

    // ─── Combined Filters ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllPaginatedAsync_CombinesFiltersAndSorting()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10,
            isPaid: true, paymentMethod: "stripe",
            sortBy: "ticketCount", sortOrder: "desc"
        );

        Assert.Equal(2, totalCount);
        Assert.All(participants, p => Assert.True(p.IsPaid));
        Assert.All(participants, p => Assert.Equal("stripe", p.PaymentMethod!.ToLower()));
        Assert.Equal(4, participants[0].Id); // stripe + paid, 20 tickets
        Assert.Equal(2, participants[1].Id); // stripe + paid, 10 tickets
    }

    // ─── Search ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetAllPaginatedAsync_SearchesByName()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, searchTerm: "alice"
        );

        Assert.Single(participants);
        Assert.Equal("Alice", participants[0].FirstName);
    }

    [Fact]
    public async Task GetAllPaginatedAsync_SearchesByEmail()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, searchTerm: "charlie@test.com"
        );

        Assert.Single(participants);
        Assert.Equal("Charlie", participants[0].FirstName);
    }

    [Fact]
    public async Task GetAllPaginatedAsync_SearchesByInstagram()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, searchTerm: "diana"
        );

        Assert.Single(participants);
        Assert.Equal("Diana", participants[0].FirstName);
    }

    [Fact]
    public async Task GetAllPaginatedAsync_ReturnsAllWhenSearchIsEmpty()
    {
        var (participants, totalCount) = await _service.GetAllPaginatedAsync(
            page: 1, pageSize: 10, searchTerm: ""
        );

        Assert.Equal(5, totalCount);
        Assert.Equal(5, participants.Count);
    }
}
