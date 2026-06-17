using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Services;

namespace GrCup.Api.Tests;

public class NewsletterServiceTests : IDisposable
{
    private readonly GrCupDbContext _context;
    private readonly NewsletterService _service;

    // 2x2 PNG (valid, ImageSharp-encoded) for image migration tests.
    private const string OnePixelPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAADUlEQVR4nGNhgAI4AwAAfgAJIh3SrgAAAABJRU5ErkJggg==";
    public NewsletterServiceTests()
    {
        var options = new DbContextOptionsBuilder<GrCupDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        _context = new GrCupDbContext(options);

        // BunnyCdnService backed by a fake handler that accepts any PUT.
        var http = new HttpClient(new AcceptingHandler());
        var bunny = new BunnyCdnService(http);
        var imageProcessor = new ImageProcessorService();

        _service = new NewsletterService(_context, bunny, imageProcessor, NullLogger<NewsletterService>.Instance);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task ResolveRecipientsAsync_DedupesCaseInsensitiveAndTrims()
    {
        _context.Inscripciones.AddRange(
            MakeInscripcion(1, competicionId: 7, email: "alice@test.com"),
            MakeInscripcion(2, competicionId: 7, email: "ALICE@test.com"),
            MakeInscripcion(3, competicionId: 7, email: "  bob@test.com  "),
            MakeInscripcion(4, competicionId: 7, email: ""),
            MakeInscripcion(5, competicionId: 99, email: "other@test.com")
        );
        await _context.SaveChangesAsync();

        var recipients = await _service.ResolveRecipientsAsync(competicionId: 7);

        Assert.Equal(2, recipients.Count);
        Assert.Contains("bob@test.com", recipients);
        Assert.Single(recipients, e => e.Equals("alice@test.com", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain("other@test.com", recipients);
    }

    [Fact]
    public async Task MigrateInlineImagesAsync_RewritesDataUriToCdnAndPersistsMedia()
    {
        var newsletter = new NewsletterEmail { Id = 0, CompeticionId = 1, Subject = "s", BodyHtml = "" };
        _context.NewsletterEmails.Add(newsletter);
        await _context.SaveChangesAsync();

        var body = $"<figure class=\"wp-block-image\"><img src=\"data:image/png;base64,{OnePixelPngBase64}\" alt=\"x\"/></figure>";

        var result = await _service.MigrateInlineImagesAsync(newsletter, body);
        await _context.SaveChangesAsync();

        Assert.DoesNotContain("data:image/png;base64", result);
        Assert.Contains("b-cdn.net/grcup/newsletter/", result);
        Assert.Contains(".webp", result);

        var media = await _context.NewsletterEmailMedia.Where(m => m.NewsletterEmailId == newsletter.Id).ToListAsync();
        Assert.Single(media);
        Assert.Contains("b-cdn.net/grcup/newsletter/", media[0].CdnUrl);
    }

    [Fact]
    public async Task MigrateInlineImagesAsync_LeavesCdnImagesUntouched()
    {
        var newsletter = new NewsletterEmail { CompeticionId = 1, Subject = "s", BodyHtml = "" };
        _context.NewsletterEmails.Add(newsletter);
        await _context.SaveChangesAsync();

        var body = "<figure><img src=\"https://jaimedigitalstudio.b-cdn.net/grcup/newsletter/already.webp\"/></figure>";

        var result = await _service.MigrateInlineImagesAsync(newsletter, body);

        Assert.Equal(body, result);
        Assert.Empty(await _context.NewsletterEmailMedia.ToListAsync());
    }

    [Fact]
    public async Task UpdateDraftAsync_RejectsEditingSentNewsletter()
    {
        var newsletter = new NewsletterEmail { CompeticionId = 1, Subject = "s", Status = NewsletterStatus.Sent };
        _context.NewsletterEmails.Add(newsletter);
        await _context.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _service.UpdateDraftAsync(1, newsletter.Id, "new", "<p>x</p>"));
    }

    private static Inscripcion MakeInscripcion(int id, int competicionId, string email) => new()
    {
        Id = id,
        CompeticionId = competicionId,
        Nombre = $"User {id}",
        Email = email,
        Sexo = "masculino",
        CategoriaPeso = "-83 kg",
        Modalidad = "completa",
        Experiencia = "intermedio",
        AceptaTerminos = true,
    };

    private sealed class AcceptingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Created));
    }
}

public class FerNewsletterTemplateTests
{
    [Fact]
    public void RenderShell_WrapsBodyAndTitle()
    {
        var html = FerNewsletterTemplate.RenderShell("FER CUP II", "<p>Hola mundo</p>");

        Assert.Contains("FER CUP II", html);
        Assert.Contains("<p>Hola mundo</p>", html);
        Assert.Contains("background-color:#0D1117", html);
        Assert.StartsWith("<!DOCTYPE html>", html);
    }

    [Fact]
    public void ToPlainText_StripsTagsAndBlockComments()
    {
        var html = "<!-- wp:paragraph --><p>Hola <strong>mundo</strong></p><!-- /wp:paragraph -->";

        var text = FerNewsletterTemplate.ToPlainText(html);

        Assert.DoesNotContain("<", text);
        Assert.DoesNotContain("wp:paragraph", text);
        Assert.Contains("Hola", text);
        Assert.Contains("mundo", text);
    }
}
