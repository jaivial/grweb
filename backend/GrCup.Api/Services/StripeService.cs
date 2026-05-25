using Stripe;
using Stripe.Checkout;
using System.Text.Json;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

public class StripeService
{
    private readonly IServiceProvider _serviceProvider;

    public StripeService(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    /// <summary>
    /// Resolves Stripe credentials from database, falling back to environment variables.
    /// When competicionId is provided, tries competition-specific config first, then global.
    /// </summary>
    private async Task<(string SecretKey, string PublishableKey, string WebhookSecret)> ResolveCredentialsAsync(int? competicionId = null)
    {
        string? secretKey = null;
        string? publishableKey = null;
        string? webhookSecret = null;

        using var scope = _serviceProvider.CreateScope();
        var configService = scope.ServiceProvider.GetRequiredService<StripeConfigService>();
        var config = await configService.GetConfigAsync(competicionId);

        if (config != null)
        {
            secretKey = config.SecretKey;
            publishableKey = config.PublishableKey;
            webhookSecret = config.WebhookSecret;
        }

        // Fallback to environment variables
        secretKey ??= Environment.GetEnvironmentVariable("STRIPE_SECRET_KEY");
        publishableKey ??= Environment.GetEnvironmentVariable("STRIPE_PUBLISHABLE_KEY");
        webhookSecret ??= Environment.GetEnvironmentVariable("STRIPE_WEBHOOK_SECRET");

        if (string.IsNullOrEmpty(secretKey))
            throw new InvalidOperationException("Stripe SecretKey not configured. Set it via backoffice or STRIPE_SECRET_KEY env var.");
        if (string.IsNullOrEmpty(webhookSecret))
            throw new InvalidOperationException("Stripe WebhookSecret not configured. Set it via backoffice or STRIPE_WEBHOOK_SECRET env var.");
        if (string.IsNullOrEmpty(publishableKey))
            throw new InvalidOperationException("Stripe PublishableKey not configured. Set it via backoffice or STRIPE_PUBLISHABLE_KEY env var.");

        // Update Stripe API key before each operation
        StripeConfiguration.ApiKey = secretKey;

        return (secretKey, publishableKey, webhookSecret);
    }

    private async Task<(string SecretKey, string PublishableKey, string WebhookSecret)> ResolveActiveCompetitionCredentialsAsync(int competicionId)
    {
        using var scope = _serviceProvider.CreateScope();
        var configService = scope.ServiceProvider.GetRequiredService<StripeConfigService>();
        var config = await configService.GetExactConfigAsync(competicionId);

        if (config == null || !config.Activo)
            throw new InvalidOperationException("Stripe no está activo para esta competición.");
        if (string.IsNullOrWhiteSpace(config.SecretKey))
            throw new InvalidOperationException("Stripe SecretKey no configurada para esta competición.");
        if (string.IsNullOrWhiteSpace(config.PublishableKey))
            throw new InvalidOperationException("Stripe PublishableKey no configurada para esta competición.");
        if (string.IsNullOrWhiteSpace(config.WebhookSecret))
            throw new InvalidOperationException("Stripe WebhookSecret no configurada para esta competición.");

        StripeConfiguration.ApiKey = config.SecretKey;
        return (config.SecretKey, config.PublishableKey, config.WebhookSecret);
    }

    public async Task<bool> IsInscriptionStripeAvailableAsync(int competicionId, EventoConfig config)
    {
        if (!config.PagoStripeActivo)
            return false;

        using var scope = _serviceProvider.CreateScope();
        var configService = scope.ServiceProvider.GetRequiredService<StripeConfigService>();
        var stripeConfig = await configService.GetExactConfigAsync(competicionId);

        return stripeConfig?.Activo == true
            && !string.IsNullOrWhiteSpace(stripeConfig.SecretKey)
            && !string.IsNullOrWhiteSpace(stripeConfig.PublishableKey)
            && !string.IsNullOrWhiteSpace(stripeConfig.WebhookSecret);
    }

    /// <summary>
    /// Creates a Stripe Checkout session for ticket purchase.
    /// Uses per-competition Stripe credentials when competicionId is provided.
    /// </summary>
    public async Task<Session> CreateCheckoutSessionAsync(
        string firstName,
        string surname,
        string email,
        string instagram,
        int ticketCount,
        string successUrl,
        string cancelUrl,
        string? phone = null,
        int? competicionId = null)
    {
        await ResolveCredentialsAsync(competicionId);

        var metadata = new Dictionary<string, string>
        {
            { "firstName", firstName },
            { "surname", surname },
            { "email", email.ToLowerInvariant() },
            { "instagram", instagram },
            { "ticketCount", ticketCount.ToString() },
            { "phone", phone ?? "" }
        };

        // Add competicionId for competition-specific email routing
        if (competicionId.HasValue)
        {
            metadata["competicion_id"] = competicionId.Value.ToString();
        }

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
            Metadata = metadata
        };

        var service = new SessionService();
        return await service.CreateAsync(options);
    }

    public async Task<Session> CreateInscriptionCheckoutSessionAsync(
        Inscripcion inscripcion,
        Competicion competicion,
        string successUrl,
        string cancelUrl)
    {
        await ResolveActiveCompetitionCredentialsAsync(competicion.Id);

        var amount = (long)Math.Round(inscripcion.TotalPagado * 100, MidpointRounding.AwayFromZero);
        if (amount <= 0)
            throw new InvalidOperationException("El total de la inscripción debe ser mayor que cero para pagar con Stripe.");

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
                        UnitAmount = amount,
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = $"Inscripción {competicion.Nombre}",
                            Description = $"Inscripción #{inscripcion.Id} - {inscripcion.Nombre}"
                        }
                    },
                    Quantity = 1
                }
            },
            Mode = "payment",
            SuccessUrl = successUrl,
            CancelUrl = cancelUrl,
            CustomerEmail = inscripcion.Email,
            Metadata = new Dictionary<string, string>
            {
                { "type", "fer_inscripcion" },
                { "competicion_id", competicion.Id.ToString() },
                { "competicion_slug", competicion.Slug },
                { "inscripcion_id", inscripcion.Id.ToString() },
                { "email", inscripcion.Email }
            }
        };

        var service = new SessionService();
        return await service.CreateAsync(options);
    }

    public async Task<Session> CreateDeferredInscriptionCheckoutSessionAsync(
        CreateInscripcionRequest request,
        Competicion competicion,
        CouponApplication coupon,
        decimal amount,
        string successUrl,
        string cancelUrl)
    {
        await ResolveActiveCompetitionCredentialsAsync(competicion.Id);

        var amountCents = (long)Math.Round(amount * 100, MidpointRounding.AwayFromZero);
        if (amountCents <= 0)
            throw new InvalidOperationException("El total de la inscripción debe ser mayor que cero para pagar con Stripe.");

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
                        UnitAmount = amountCents,
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = $"Inscripción {competicion.Nombre}",
                            Description = $"Inscripción - {request.Nombre.Trim()}"
                        }
                    },
                    Quantity = 1
                }
            },
            Mode = "payment",
            SuccessUrl = successUrl,
            CancelUrl = cancelUrl,
            CustomerEmail = request.Email.ToLower().Trim(),
            Metadata = new Dictionary<string, string>
            {
                { "type", "fer_inscripcion_deferred" },
                { "competicion_id", competicion.Id.ToString() },
                { "competicion_slug", competicion.Slug },
                { "nombre", request.Nombre.Trim() },
                { "email", request.Email.ToLower().Trim() },
                { "instagram", request.Instagram?.Trim() ?? "" },
                { "telefono", request.Telefono?.Trim() ?? "" },
                { "sexo", request.Sexo ?? "masculino" },
                { "categoria_peso", request.CategoriaPeso ?? "" },
                { "modalidad", request.Modalidad ?? "completa" },
                { "quiere_handler", request.QuiereHandler ? "1" : "0" },
                { "experiencia", request.Experiencia ?? "principiante" },
                { "tiene_entrenador", request.TieneEntrenador ? "1" : "0" },
                { "peak_program", request.PeakProgram ? "1" : "0" },
                { "acepta_terminos", request.AceptaTerminos ? "1" : "0" },
                { "codigo_cupon", request.CodigoCupon ?? "" },
                { "subtotal", coupon.SubtotalAntesDescuento.ToString(System.Globalization.CultureInfo.InvariantCulture) },
                { "importe_descuento", coupon.ImporteDescuento.ToString(System.Globalization.CultureInfo.InvariantCulture) },
                { "total", coupon.Total.ToString(System.Globalization.CultureInfo.InvariantCulture) }
            }
        };

        if (coupon.CuponDescuentoId.HasValue)
        {
            options.Metadata["cupon_id"] = coupon.CuponDescuentoId.Value.ToString();
            options.Metadata["tipo_descuento"] = coupon.TipoDescuentoCupon ?? "";
            options.Metadata["valor_descuento"] = coupon.ValorDescuentoCupon?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "";
        }

        var service = new SessionService();
        return await service.CreateAsync(options);
    }

    /// <summary>
    /// Constructs and validates a Stripe webhook event.
    /// Uses competition-specific webhook secret when competicionId is provided.
    /// </summary>
    public async Task<Event> ConstructEventAsync(string json, string signature, int? competicionId = null)
    {
        var (_, _, webhookSecret) = await ResolveCredentialsAsync(competicionId);
        return EventUtility.ConstructEvent(json, signature, webhookSecret);
    }

    /// <summary>
    /// Retrieves a Stripe Checkout session by ID.
    /// Uses global credentials since sessions are cross-competition.
    /// </summary>
    public async Task<Session> GetSessionAsync(string sessionId, int? competicionId = null)
    {
        await ResolveCredentialsAsync(competicionId);
        var service = new SessionService();
        return await service.GetAsync(sessionId);
    }

    public static int? ExtractCompeticionIdFromRawEvent(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("data", out var data) ||
                !data.TryGetProperty("object", out var obj) ||
                !obj.TryGetProperty("metadata", out var metadata) ||
                !metadata.TryGetProperty("competicion_id", out var competicionIdElement))
                return null;

            var competicionIdValue = competicionIdElement.GetString();
            return int.TryParse(competicionIdValue, out var competicionId) ? competicionId : null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Gets the publishable key for frontend use.
    /// Uses global credentials by default.
    /// </summary>
    public async Task<string> GetPublishableKeyAsync(int? competicionId = null)
    {
        var (_, publishableKey, _) = await ResolveCredentialsAsync(competicionId);
        return publishableKey;
    }

    /// <summary>
    /// Extracts participant data from Stripe session metadata
    /// </summary>
    public (string FirstName, string Surname, string Email, string Instagram, int TicketCount, string? Phone, int? CompeticionId) ExtractMetadata(Session session)
    {
        var metadata = session.Metadata;
        var phone = metadata.TryGetValue("phone", out var p) && !string.IsNullOrEmpty(p) ? p : null;
        var competicionIdStr = metadata.TryGetValue("competicion_id", out var cid) && !string.IsNullOrEmpty(cid) ? cid : null;
        int? competicionId = !string.IsNullOrEmpty(competicionIdStr) && int.TryParse(competicionIdStr, out var parsed) ? parsed : null;
        return (
            metadata["firstName"],
            metadata["surname"],
            metadata["email"],
            metadata["instagram"],
            int.Parse(metadata["ticketCount"]),
            phone,
            competicionId
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
