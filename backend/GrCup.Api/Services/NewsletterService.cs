using System.Text;
using System.Text.RegularExpressions;
using GrCup.Api.Data;
using GrCup.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Services;

/// <summary>
/// CRUD, recipient resolution and CDN media migration for competition newsletters.
/// </summary>
public class NewsletterService
{
    private readonly GrCupDbContext _db;
    private readonly BunnyCdnService _bunnyCdn;
    private readonly ImageProcessorService _imageProcessor;
    private readonly ILogger<NewsletterService> _logger;

    // Matches <img ... src="data:image/<type>;base64,<payload>" ...>
    private static readonly Regex DataImageRegex = new(
        "<img\\b[^>]*?\\bsrc\\s*=\\s*\"(data:image/(?<ext>[a-zA-Z0-9.+-]+);base64,(?<data>[^\"]+))\"[^>]*?>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    public NewsletterService(
        GrCupDbContext db,
        BunnyCdnService bunnyCdn,
        ImageProcessorService imageProcessor,
        ILogger<NewsletterService> logger)
    {
        _db = db;
        _bunnyCdn = bunnyCdn;
        _imageProcessor = imageProcessor;
        _logger = logger;
    }

    public async Task<List<NewsletterEmail>> GetHistoryAsync(int competicionId)
    {
        return await _db.NewsletterEmails
            .AsNoTracking()
            .Include(n => n.SendProgress)
            .Where(n => n.CompeticionId == competicionId)
            .OrderByDescending(n => n.UpdatedAt)
            .ToListAsync();
    }

    public async Task<NewsletterEmail?> GetByIdAsync(int competicionId, int id)
    {
        return await _db.NewsletterEmails
            .Include(n => n.SendProgress)
            .Include(n => n.Media)
            .FirstOrDefaultAsync(n => n.Id == id && n.CompeticionId == competicionId);
    }

    /// <summary>
    /// Permanently removes a newsletter (cascades media + send progress).
    /// Returns false when not found, throws when a send is in progress.
    /// </summary>
    public async Task<bool> DeleteAsync(int competicionId, int id)
    {
        var entity = await _db.NewsletterEmails
            .Include(n => n.SendProgress)
            .FirstOrDefaultAsync(n => n.Id == id && n.CompeticionId == competicionId);
        if (entity == null) return false;

        if (entity.SendProgress != null
            && entity.SendProgress.Status is NewsletterSendStatus.Pending or NewsletterSendStatus.InProgress)
            throw new InvalidOperationException("No se puede eliminar un newsletter que se está enviando.");

        _db.NewsletterEmails.Remove(entity);
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<NewsletterEmail> CreateAsync(int competicionId, string subject, string bodyHtml, string? createdByEmail)
    {
        var entity = new NewsletterEmail
        {
            CompeticionId = competicionId,
            Subject = subject,
            BodyHtml = bodyHtml,
            Status = NewsletterStatus.Draft,
            CreatedByEmail = createdByEmail,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.NewsletterEmails.Add(entity);
        await _db.SaveChangesAsync();
        return entity;
    }

    /// <summary>
    /// Saves a draft: migrates inline images to the CDN, then persists subject/body.
    /// Returns the updated entity. Throws if the newsletter is not a draft.
    /// </summary>
    public async Task<NewsletterEmail?> UpdateDraftAsync(int competicionId, int id, string subject, string bodyHtml)
    {
        var entity = await _db.NewsletterEmails
            .Include(n => n.Media)
            .FirstOrDefaultAsync(n => n.Id == id && n.CompeticionId == competicionId);
        if (entity == null) return null;
        if (entity.Status is NewsletterStatus.Sending or NewsletterStatus.Sent)
            throw new InvalidOperationException("Cannot edit a newsletter that is sending or already sent.");

        var migratedBody = await MigrateInlineImagesAsync(entity, bodyHtml);

        entity.Subject = subject;
        entity.BodyHtml = migratedBody;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return entity;
    }

    /// <summary>
    /// Finds every inline base64 image in the body, uploads it to BunnyCDN,
    /// records a <see cref="NewsletterEmailMedia"/> row, and rewrites the
    /// <c>src</c> to the permanent CDN URL. Returns the rewritten HTML.
    /// </summary>
    public async Task<string> MigrateInlineImagesAsync(NewsletterEmail entity, string bodyHtml)
    {
        if (string.IsNullOrEmpty(bodyHtml)) return bodyHtml;

        var matches = DataImageRegex.Matches(bodyHtml);
        if (matches.Count == 0) return bodyHtml;

        var sb = new StringBuilder(bodyHtml.Length);
        var lastIndex = 0;

        foreach (Match match in matches)
        {
            sb.Append(bodyHtml, lastIndex, match.Index - lastIndex);

            var dataUri = match.Groups[1].Value;
            var base64 = match.Groups["data"].Value;
            var imgTag = match.Value;

            try
            {
                var bytes = Convert.FromBase64String(base64);
                using var input = new MemoryStream(bytes);
                await using var webp = await _imageProcessor.ProcessContentImageToWebpAsync(input);

                var fileName = BunnyCdnService.GenerateFileName($"newsletter-{entity.Id}");
                var cdnUrl = await _bunnyCdn.UploadImageAsync(webp, fileName, "newsletter");

                _db.NewsletterEmailMedia.Add(new NewsletterEmailMedia
                {
                    NewsletterEmailId = entity.Id,
                    CdnUrl = cdnUrl,
                    OriginalFileName = fileName,
                    FileSize = webp.Length,
                    CreatedAt = DateTime.UtcNow,
                });

                // Swap the data-URI src for the CDN URL, keep the rest of the tag intact.
                sb.Append(imgTag.Replace(dataUri, cdnUrl));
                _logger.LogInformation("Newsletter {Id}: migrated inline image to {CdnUrl}", entity.Id, cdnUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Newsletter {Id}: failed to migrate inline image, leaving original src", entity.Id);
                sb.Append(imgTag);
            }

            lastIndex = match.Index + match.Length;
        }

        sb.Append(bodyHtml, lastIndex, bodyHtml.Length - lastIndex);
        return sb.ToString();
    }

    /// <summary>
    /// Distinct recipient emails for a competition's registrants (deduped, case-insensitive),
    /// excluding empty addresses.
    /// </summary>
    public async Task<List<string>> ResolveRecipientsAsync(int competicionId)
    {
        var emails = await _db.Inscripciones
            .AsNoTracking()
            .Where(i => i.CompeticionId == competicionId && i.Email != "")
            .Select(i => i.Email)
            .ToListAsync();

        return emails
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim())
            .GroupBy(e => e.ToLowerInvariant())
            .Select(g => g.First())
            .ToList();
    }
}
