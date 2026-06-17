using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace GrCup.Api.Models;

/// <summary>
/// A newsletter email (draft or sent) addressed to the registrants of a competition.
/// The body is stored as Gutenberg block-comment HTML; the rendered preview/email
/// is produced by wrapping <see cref="BodyHtml"/> in the competition email shell.
/// </summary>
public class NewsletterEmail
{
    public int Id { get; set; }

    /// <summary>
    /// Competition whose registrants are the audience for this newsletter.
    /// </summary>
    public int CompeticionId { get; set; }

    [Required]
    [MaxLength(255)]
    public string Subject { get; set; } = string.Empty;

    /// <summary>
    /// Gutenberg serialized HTML (block-comment delimited). Source of truth for the editor.
    /// </summary>
    public string BodyHtml { get; set; } = string.Empty;

    /// <summary>
    /// Lifecycle status: draft, sending, sent, failed.
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = NewsletterStatus.Draft;

    /// <summary>
    /// Email of the backoffice user who last saved this newsletter.
    /// </summary>
    [MaxLength(255)]
    public string? CreatedByEmail { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When sending was triggered (first batch enqueued).
    /// </summary>
    public DateTime? SentAt { get; set; }

    // Navigation properties
    public virtual Competicion Competicion { get; set; } = null!;
    public virtual ICollection<NewsletterEmailMedia> Media { get; set; } = new List<NewsletterEmailMedia>();
    public virtual NewsletterSendProgress? SendProgress { get; set; }
}

/// <summary>
/// Status constants for <see cref="NewsletterEmail.Status"/>.
/// </summary>
public static class NewsletterStatus
{
    public const string Draft = "draft";
    public const string Sending = "sending";
    public const string Sent = "sent";
    public const string Failed = "failed";
}

/// <summary>
/// A media asset belonging to a newsletter, uploaded to BunnyCDN.
/// Lets us track CDN URLs so image blocks can be rewritten from local
/// data/blob sources to permanent CDN URLs before sending.
/// </summary>
public class NewsletterEmailMedia
{
    public int Id { get; set; }

    public int NewsletterEmailId { get; set; }

    /// <summary>
    /// Permanent BunnyCDN URL of the uploaded asset.
    /// </summary>
    [Required]
    [MaxLength(1024)]
    public string CdnUrl { get; set; } = string.Empty;

    /// <summary>
    /// Original file name supplied at upload time.
    /// </summary>
    [MaxLength(255)]
    public string? OriginalFileName { get; set; }

    public long FileSize { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    [ForeignKey(nameof(NewsletterEmailId))]
    public virtual NewsletterEmail NewsletterEmail { get; set; } = null!;
}

/// <summary>
/// Batch-send progress for a newsletter. The background worker dispatches
/// <see cref="BatchSize"/> recipients every <see cref="IntervalMinutes"/> minutes
/// and updates this row; the backoffice subscribes to live updates over SignalR.
/// </summary>
public class NewsletterSendProgress
{
    public int Id { get; set; }

    public int NewsletterEmailId { get; set; }

    public int CompeticionId { get; set; }

    /// <summary>
    /// Total distinct recipients resolved when sending started.
    /// </summary>
    public int TotalRecipients { get; set; }

    public int SentCount { get; set; }

    public int FailedCount { get; set; }

    /// <summary>
    /// Number of recipients dispatched per batch.
    /// </summary>
    public int BatchSize { get; set; } = 5;

    /// <summary>
    /// Minutes between batches.
    /// </summary>
    public int IntervalMinutes { get; set; } = 10;

    /// <summary>
    /// Lifecycle: pending, in_progress, completed, failed.
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = NewsletterSendStatus.Pending;

    /// <summary>
    /// JSON array of recipient emails still awaiting dispatch (FIFO queue).
    /// </summary>
    [Column(TypeName = "json")]
    public string PendingRecipients { get; set; } = "[]";

    /// <summary>
    /// UTC time the next batch becomes eligible to send.
    /// </summary>
    public DateTime? NextBatchAt { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    [MaxLength(1000)]
    public string? LastError { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    [ForeignKey(nameof(NewsletterEmailId))]
    public virtual NewsletterEmail NewsletterEmail { get; set; } = null!;
    public virtual Competicion Competicion { get; set; } = null!;
}

/// <summary>
/// Status constants for <see cref="NewsletterSendProgress.Status"/>.
/// </summary>
public static class NewsletterSendStatus
{
    public const string Pending = "pending";
    public const string InProgress = "in_progress";
    public const string Completed = "completed";
    public const string Failed = "failed";
}
