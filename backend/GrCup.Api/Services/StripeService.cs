using Stripe;
using Stripe.Checkout;

namespace GrCup.Api.Services;

public class StripeService
{
    private readonly string _secretKey;
    private readonly string _webhookSecret;
    private readonly string _publishableKey;

    public StripeService(IConfiguration configuration)
    {
        _secretKey = Environment.GetEnvironmentVariable("STRIPE_SECRET_KEY") 
            ?? throw new InvalidOperationException("STRIPE_SECRET_KEY environment variable not set");
        _webhookSecret = Environment.GetEnvironmentVariable("STRIPE_WEBHOOK_SECRET") 
            ?? throw new InvalidOperationException("STRIPE_WEBHOOK_SECRET environment variable not set");
        _publishableKey = Environment.GetEnvironmentVariable("STRIPE_PUBLISHABLE_KEY") 
            ?? throw new InvalidOperationException("STRIPE_PUBLISHABLE_KEY environment variable not set");

        // Configure Stripe with secret key
        StripeConfiguration.ApiKey = _secretKey;
    }

    /// <summary>
    /// Creates a Stripe Checkout session for ticket purchase
    /// </summary>
    public async Task<Session> CreateCheckoutSessionAsync(
        string firstName,
        string surname,
        string email,
        string instagram,
        int ticketCount,
        string successUrl,
        string cancelUrl,
        string? phone = null)
    {
        var options = new SessionCreateOptions
        {
            PaymentMethodTypes = new List<string> { "card" },
            LineItems = new List<SessionLineItemOptions>
            {
                new SessionLineItemOptions
                {
                    PriceData = new SessionLineItemPriceDataOptions
                    {
                        Currency = "eur",
                        UnitAmount = 50, // 0.50€ in cents
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = "Sorteo GRStrength Cup",
                            Description = $"{ticketCount} ticket(s) para el sorteo de la GRStrength Cup 2026"
                        }
                    },
                    Quantity = ticketCount
                }
            },
            Mode = "payment",
            SuccessUrl = successUrl,
            CancelUrl = cancelUrl,
            Metadata = new Dictionary<string, string>
            {
                { "firstName", firstName },
                { "surname", surname },
                { "email", email.ToLowerInvariant() },
                { "instagram", instagram },
                { "ticketCount", ticketCount.ToString() },
                { "phone", phone ?? "" }
            }
        };

        var service = new SessionService();
        return await service.CreateAsync(options);
    }

    /// <summary>
    /// Constructs and validates a Stripe webhook event
    /// </summary>
    public Event ConstructEvent(string json, string signature)
    {
        return EventUtility.ConstructEvent(json, signature, _webhookSecret);
    }

    /// <summary>
    /// Retrieves a Stripe Checkout session by ID
    /// </summary>
    public async Task<Session> GetSessionAsync(string sessionId)
    {
        var service = new SessionService();
        return await service.GetAsync(sessionId);
    }

    /// <summary>
    /// Gets the publishable key for frontend use
    /// </summary>
    public string GetPublishableKey()
    {
        return _publishableKey;
    }

    /// <summary>
    /// Extracts participant data from Stripe session metadata
    /// </summary>
    public (string FirstName, string Surname, string Email, string Instagram, int TicketCount, string? Phone) ExtractMetadata(Session session)
    {
        var metadata = session.Metadata;
        var phone = metadata.TryGetValue("phone", out var p) && !string.IsNullOrEmpty(p) ? p : null;
        return (
            metadata["firstName"],
            metadata["surname"],
            metadata["email"],
            metadata["instagram"],
            int.Parse(metadata["ticketCount"]),
            phone
        );
    }

    /// <summary>
    /// Calculates total paid from session amount
    /// </summary>
    public decimal CalculateTotalPaid(Session session)
    {
        return (session.AmountTotal ?? 0) / 100m; // Convert from cents to euros
    }
}
