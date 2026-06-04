using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO;
using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;
using GrCup.Api.Models.Enums;
using QRCoder;

namespace GrCup.Api.Services;

/// <summary>
/// Service for managing competition registrations (multi-tenant)
/// </summary>
public class InscripcionService
{
    public const string ModalidadCompleta = "completa";
    public const string ModalidadSoloBanca = "solo_banca";
    public const string ModalidadSoloPesoMuerto = "solo_peso_muerto";
    public const string PaymentMethodEfectivo = "efectivo";
    public const string PaymentMethodStripe = "stripe";
    public const string PaymentMethodTransferencia = "transferencia";
    public const string PaymentMethodCupon = "cupon";

    private static readonly HashSet<string> AllowedModalidades = new(StringComparer.OrdinalIgnoreCase)
    {
        ModalidadCompleta,
        ModalidadSoloBanca,
        ModalidadSoloPesoMuerto
    };

    private static readonly string[] CompleteLifts = { "Squat", "Bench", "Deadlift" };
    private static readonly string[] BenchOnlyLifts = { "Bench" };
    private static readonly string[] DeadliftOnlyLifts = { "Deadlift" };

    private readonly GrCupDbContext _context;
    private readonly CompeticionService _competicionService;
    private readonly BunnyCdnService _bunnyCdn;
    private readonly CuponDescuentoService _cuponDescuentoService;

    public InscripcionService(GrCupDbContext context, CompeticionService competicionService, BunnyCdnService bunnyCdn, CuponDescuentoService cuponDescuentoService)
    {
        _context = context;
        _competicionService = competicionService;
        _bunnyCdn = bunnyCdn;
        _cuponDescuentoService = cuponDescuentoService;
    }

    public static string NormalizeModalidad(string? modalidad)
    {
        var normalized = string.IsNullOrWhiteSpace(modalidad)
            ? ModalidadCompleta
            : modalidad.Trim().ToLowerInvariant();

        if (!AllowedModalidades.Contains(normalized))
            throw new InvalidOperationException("Modalidad no válida");

        return normalized;
    }

    public static string GetModalidadLabel(string? modalidad)
    {
        return NormalizeModalidad(modalidad) switch
        {
            ModalidadSoloBanca => "Solo banca",
            ModalidadSoloPesoMuerto => "Solo peso muerto",
            _ => "Competición completa"
        };
    }

    public static string? NormalizePaymentMethod(string? paymentMethod)
    {
        if (string.IsNullOrWhiteSpace(paymentMethod))
            return null;

        var normalized = paymentMethod.Trim().ToLowerInvariant();
        return normalized switch
        {
            PaymentMethodEfectivo => PaymentMethodEfectivo,
            PaymentMethodStripe => PaymentMethodStripe,
            PaymentMethodTransferencia => PaymentMethodTransferencia,
            PaymentMethodCupon => PaymentMethodCupon,
            "cash" => PaymentMethodEfectivo,
            "card" => PaymentMethodStripe,
            "tarjeta" => PaymentMethodStripe,
            _ => normalized
        };
    }

    public static string GetPaymentMethodLabel(string? paymentMethod)
    {
        return NormalizePaymentMethod(paymentMethod) switch
        {
            PaymentMethodEfectivo => "Efectivo",
            PaymentMethodStripe => "Stripe",
            PaymentMethodTransferencia => "Transferencia",
            PaymentMethodCupon => "Cupón",
            _ => "Sin definir"
        };
    }

    public static IReadOnlyCollection<string> GetAllowedLiftTypes(string? modalidad)
    {
        return NormalizeModalidad(modalidad) switch
        {
            ModalidadSoloBanca => BenchOnlyLifts,
            ModalidadSoloPesoMuerto => DeadliftOnlyLifts,
            _ => CompleteLifts
        };
    }

    public static bool IsLiftAllowed(string? modalidad, string liftType)
    {
        return GetAllowedLiftTypes(modalidad).Contains(liftType, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<CouponApplication> ApplyCouponAsync(int competicionId, EventoConfig config, string? codigo, decimal subtotal, int? excludeInscripcionId = null)
    {
        return await _cuponDescuentoService.ApplyCouponAsync(competicionId, config, codigo, subtotal, excludeInscripcionId);
    }

    public async Task<Inscripcion> CreateFromStripeMetadataAsync(
        int competicionId,
        Dictionary<string, string> metadata,
        string stripeSessionId)
    {
        var competicion = await _competicionService.GetByIdAsync(competicionId);
        if (competicion == null)
            throw new InvalidOperationException($"Competition {competicionId} not found");

        var plazasDisponibles = await _competicionService.GetPlazasDisponiblesAsync(competicionId);
        if (plazasDisponibles <= 0)
            throw new InvalidOperationException("No available spots");

        var email = metadata.GetValueOrDefault("email", "").ToLower().Trim();
        var existing = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.CompeticionId == competicionId && i.Email.ToLower() == email);

        if (existing != null)
        {
            if (existing.PagoConfirmado)
                return existing;

            existing.Nombre = metadata.GetValueOrDefault("nombre", existing.Nombre);
            existing.Instagram = metadata.GetValueOrDefault("instagram", existing.Instagram);
            existing.Telefono = metadata.GetValueOrDefault("telefono", existing.Telefono);
            existing.Sexo = metadata.GetValueOrDefault("sexo", existing.Sexo);
            existing.CategoriaPeso = metadata.GetValueOrDefault("categoria_peso", existing.CategoriaPeso);
            existing.Modalidad = NormalizeModalidad(metadata.GetValueOrDefault("modalidad", existing.Modalidad));
            existing.QuiereHandler = metadata.GetValueOrDefault("quiere_handler") == "1";
            existing.Experiencia = metadata.GetValueOrDefault("experiencia", existing.Experiencia);
            existing.TieneEntrenador = metadata.GetValueOrDefault("tiene_entrenador") == "1";
            existing.QuierePeakProgram = metadata.GetValueOrDefault("peak_program") == "1";
            existing.PagoConfirmado = true;
            existing.PaymentMethod = PaymentMethodStripe;
            existing.StripeSessionId = stripeSessionId;
            existing.ParticipacionConfirmada = false;
            existing.AceptaTerminos = metadata.GetValueOrDefault("acepta_terminos") == "1";
            existing.UpdatedAt = DateTime.UtcNow;

            decimal.TryParse(metadata.GetValueOrDefault("subtotal", "0"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var subtotal);
            decimal.TryParse(metadata.GetValueOrDefault("importe_descuento", "0"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var descuento);
            decimal.TryParse(metadata.GetValueOrDefault("total", "0"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var total);

            existing.SubtotalAntesDescuento = subtotal;
            existing.ImporteDescuento = descuento;
            existing.TotalPagado = total;
            existing.CodigoCupon = metadata.GetValueOrDefault("codigo_cupon") is { Length: > 0 } code ? code : null;

            if (int.TryParse(metadata.GetValueOrDefault("cupon_id", ""), out var cuponId))
                existing.CuponDescuentoId = cuponId;
            existing.TipoDescuentoCupon = metadata.GetValueOrDefault("tipo_descuento") is { Length: > 0 } td ? td : null;
            decimal.TryParse(metadata.GetValueOrDefault("valor_descuento", ""), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var vd);
            if (vd > 0) existing.ValorDescuentoCupon = vd;

            await EnsureQrCodeAsync(existing, competicion);
            await _context.SaveChangesAsync();
            return existing;
        }

        decimal.TryParse(metadata.GetValueOrDefault("subtotal", "0"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var st);
        decimal.TryParse(metadata.GetValueOrDefault("importe_descuento", "0"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var id);
        decimal.TryParse(metadata.GetValueOrDefault("total", "0"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var tl);

        var inscripcion = new Inscripcion
        {
            CompeticionId = competicionId,
            Nombre = metadata.GetValueOrDefault("nombre", ""),
            Email = email,
            Instagram = metadata.GetValueOrDefault("instagram") is { Length: > 0 } ig ? ig : null,
            Telefono = metadata.GetValueOrDefault("telefono") is { Length: > 0 } ph ? ph : null,
            Sexo = metadata.GetValueOrDefault("sexo", "masculino"),
            CategoriaPeso = metadata.GetValueOrDefault("categoria_peso", ""),
            Modalidad = NormalizeModalidad(metadata.GetValueOrDefault("modalidad", "completa")),
            QuiereHandler = metadata.GetValueOrDefault("quiere_handler") == "1",
            Experiencia = metadata.GetValueOrDefault("experiencia", "principiante"),
            TieneEntrenador = metadata.GetValueOrDefault("tiene_entrenador") == "1",
            QuierePeakProgram = metadata.GetValueOrDefault("peak_program") == "1",
            PagoConfirmado = true,
            PaymentMethod = PaymentMethodStripe,
            StripeSessionId = stripeSessionId,
            ParticipacionConfirmada = false,
            AceptaTerminos = metadata.GetValueOrDefault("acepta_terminos") == "1",
            SubtotalAntesDescuento = st,
            ImporteDescuento = id,
            TotalPagado = tl,
            CodigoCupon = metadata.GetValueOrDefault("codigo_cupon") is { Length: > 0 } cc ? cc : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        if (int.TryParse(metadata.GetValueOrDefault("cupon_id", ""), out var cid))
            inscripcion.CuponDescuentoId = cid;
        inscripcion.TipoDescuentoCupon = metadata.GetValueOrDefault("tipo_descuento") is { Length: > 0 } td2 ? td2 : null;
        decimal.TryParse(metadata.GetValueOrDefault("valor_descuento", ""), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var vd2);
        if (vd2 > 0) inscripcion.ValorDescuentoCupon = vd2;

        _context.Inscripciones.Add(inscripcion);
        await _context.SaveChangesAsync();

        await EnsureQrCodeAsync(inscripcion, competicion);
        await _context.SaveChangesAsync();

        return inscripcion;
    }

    #region Public Registration

    /// <summary>
    /// Creates a new inscription for a competition
    /// </summary>
    public async Task<Inscripcion> CreateAsync(int competicionId, CreateInscripcionRequest request)
    {
        var competicion = await _competicionService.GetByIdAsync(competicionId);
        if (competicion == null)
            throw new InvalidOperationException($"Competition {competicionId} not found");

        // Check capacity
        var plazasDisponibles = await _competicionService.GetPlazasDisponiblesAsync(competicionId);
        if (plazasDisponibles <= 0)
            throw new InvalidOperationException("No available spots");

        var config = _competicionService.GetEventoConfig(competicion);
        if (!config.InscripcionAbierta)
            throw new InvalidOperationException("Registration is closed");

        // Check for duplicate email
        var existing = await _context.Inscripciones
            .AnyAsync(i => i.CompeticionId == competicionId && 
                          i.Email.ToLower() == request.Email.ToLower());
        if (existing)
            throw new InvalidOperationException("Email already registered for this competition");

        var modalidad = NormalizeModalidad(request.Modalidad);
        var paymentMethod = NormalizePaymentMethod(request.PaymentMethod) ?? PaymentMethodEfectivo;
        var subtotal = CuponDescuentoService.CalculateSubtotal(config, request.PeakProgram);
        var coupon = await _cuponDescuentoService.ApplyCouponAsync(competicionId, config, request.CodigoCupon, subtotal);
        var finalPaymentMethod = coupon.Total <= 0 ? PaymentMethodCupon : paymentMethod;

        var inscripcion = new Inscripcion
        {
            CompeticionId = competicionId,
            Nombre = request.Nombre.Trim(),
            Email = request.Email.ToLower().Trim(),
            Instagram = request.Instagram?.Trim(),
            Telefono = request.Telefono?.Trim(),
            Sexo = request.Sexo ?? "masculino",
            CategoriaPeso = request.CategoriaPeso ?? "",
            Modalidad = modalidad,
            QuiereHandler = request.QuiereHandler,

            Experiencia = request.Experiencia,
            TieneEntrenador = request.TieneEntrenador,
            QuierePeakProgram = request.PeakProgram,
            PagoConfirmado = coupon.Total <= 0,
            PaymentMethod = finalPaymentMethod,
            ParticipacionConfirmada = false,
            CuponDescuentoId = coupon.CuponDescuentoId,
            CodigoCupon = coupon.CodigoCupon,
            TipoDescuentoCupon = coupon.TipoDescuentoCupon,
            ValorDescuentoCupon = coupon.ValorDescuentoCupon,
            SubtotalAntesDescuento = coupon.SubtotalAntesDescuento,
            ImporteDescuento = coupon.ImporteDescuento,
            TotalPagado = coupon.Total,
            AceptaTerminos = request.AceptaTerminos,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Inscripciones.Add(inscripcion);
        await _context.SaveChangesAsync();

        // Generate QR code payload and image
        var qrPayload = GenerateQrCodePayload(competicionId, inscripcion.Id, competicion.QrSecret);
        var qrImageResult = await GenerateQrImageAsync(qrPayload, competicionId, inscripcion.Id);

        if (qrImageResult.HasValue)
        {
            inscripcion.QrCode = qrImageResult.Value.Url;
        }
        else
        {
            // Fallback: store the text payload if image generation fails
            inscripcion.QrCode = qrPayload;
            System.Console.WriteLine($"[WARN] Failed to generate QR image for inscription {inscripcion.Id}, using fallback");
        }
        await _context.SaveChangesAsync();

        return inscripcion;
    }

    public async Task<(Inscripcion Inscripcion, bool Reused, bool AlreadyPaid)> CreateOrReuseStripePendingAsync(
        int competicionId,
        CreateInscripcionRequest request)
    {
        var competicion = await _competicionService.GetByIdAsync(competicionId);
        if (competicion == null)
            throw new InvalidOperationException($"Competition {competicionId} not found");

        var config = _competicionService.GetEventoConfig(competicion);
        if (!config.InscripcionAbierta)
            throw new InvalidOperationException("Registration is closed");

        var email = request.Email.ToLower().Trim();
        var existing = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.CompeticionId == competicionId && i.Email.ToLower() == email);

        if (existing != null)
        {
            if (existing.PagoConfirmado)
                return (existing, true, true);

            if (!string.Equals(existing.PaymentMethod, PaymentMethodStripe, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Email already registered for this competition");

            var existingSubtotal = CuponDescuentoService.CalculateSubtotal(config, request.PeakProgram);
            var existingCoupon = await _cuponDescuentoService.ApplyCouponAsync(competicionId, config, request.CodigoCupon, existingSubtotal, existing.Id);
            ApplyRegistrationData(existing, request, existingCoupon, existingCoupon.Total <= 0 ? PaymentMethodCupon : PaymentMethodStripe);
            existing.UpdatedAt = DateTime.UtcNow;

            if (string.IsNullOrWhiteSpace(existing.QrCode))
                await EnsureQrCodeAsync(existing, competicion);

            await _context.SaveChangesAsync();
            return (existing, true, false);
        }

        var plazasDisponibles = await _competicionService.GetPlazasDisponiblesAsync(competicionId);
        if (plazasDisponibles <= 0)
            throw new InvalidOperationException("No available spots");

        var inscripcion = new Inscripcion
        {
            CompeticionId = competicionId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var subtotal = CuponDescuentoService.CalculateSubtotal(config, request.PeakProgram);
        var coupon = await _cuponDescuentoService.ApplyCouponAsync(competicionId, config, request.CodigoCupon, subtotal);
        ApplyRegistrationData(inscripcion, request, coupon, coupon.Total <= 0 ? PaymentMethodCupon : PaymentMethodStripe);
        _context.Inscripciones.Add(inscripcion);
        await _context.SaveChangesAsync();

        await EnsureQrCodeAsync(inscripcion, competicion);
        await _context.SaveChangesAsync();

        return (inscripcion, false, false);
    }

    private static void ApplyRegistrationData(
        Inscripcion inscripcion,
        CreateInscripcionRequest request,
        CouponApplication coupon,
        string paymentMethod)
    {
        inscripcion.Nombre = request.Nombre.Trim();
        inscripcion.Email = request.Email.ToLower().Trim();
        inscripcion.Instagram = request.Instagram?.Trim();
        inscripcion.Telefono = request.Telefono?.Trim();
        inscripcion.Sexo = request.Sexo ?? "masculino";
        inscripcion.CategoriaPeso = request.CategoriaPeso ?? "";
        inscripcion.Modalidad = NormalizeModalidad(request.Modalidad);
        inscripcion.QuiereHandler = request.QuiereHandler;
        inscripcion.Experiencia = request.Experiencia;
        inscripcion.TieneEntrenador = request.TieneEntrenador;
        inscripcion.QuierePeakProgram = request.PeakProgram;
        inscripcion.PagoConfirmado = coupon.Total <= 0;
        inscripcion.PaymentMethod = paymentMethod;
        inscripcion.ParticipacionConfirmada = false;
        inscripcion.CuponDescuentoId = coupon.CuponDescuentoId;
        inscripcion.CodigoCupon = coupon.CodigoCupon;
        inscripcion.TipoDescuentoCupon = coupon.TipoDescuentoCupon;
        inscripcion.ValorDescuentoCupon = coupon.ValorDescuentoCupon;
        inscripcion.SubtotalAntesDescuento = coupon.SubtotalAntesDescuento;
        inscripcion.ImporteDescuento = coupon.ImporteDescuento;
        inscripcion.TotalPagado = coupon.Total;
        inscripcion.AceptaTerminos = request.AceptaTerminos;
    }

    private async Task EnsureQrCodeAsync(Inscripcion inscripcion, Competicion competicion)
    {
        var qrPayload = GenerateQrCodePayload(competicion.Id, inscripcion.Id, competicion.QrSecret);
        var qrImageResult = await GenerateQrImageAsync(qrPayload, competicion.Id, inscripcion.Id);

        inscripcion.QrCode = qrImageResult.HasValue ? qrImageResult.Value.Url : qrPayload;
    }

    public async Task<Inscripcion?> AddPeakProgramAsync(int competicionId, int inscripcionId)
    {
        var competicion = await _competicionService.GetByIdAsync(competicionId);
        if (competicion == null)
            throw new InvalidOperationException($"Competition {competicionId} not found");

        var inscripcion = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        if (inscripcion == null)
            return null;

        if (inscripcion.QuierePeakProgram)
            return inscripcion;

        var config = _competicionService.GetEventoConfig(competicion);
        inscripcion.QuierePeakProgram = true;
        inscripcion.SubtotalAntesDescuento += config.PrecioPeakProgram;
        inscripcion.TotalPagado += config.PrecioPeakProgram;
        inscripcion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return inscripcion;
    }

    /// <summary>
    /// Confirms payment for an inscription
    /// </summary>
    public async Task<Inscripcion?> ConfirmPaymentAsync(int inscripcionId, string? paymentMethod = null)
    {
        var inscripcion = await _context.Inscripciones.FindAsync(inscripcionId);
        if (inscripcion == null)
            return null;

        inscripcion.PagoConfirmado = true;
        if (paymentMethod != null)
            inscripcion.PaymentMethod = paymentMethod;
        inscripcion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return inscripcion;
    }

    /// <summary>
    /// Performs check-in for an inscription
    /// </summary>
    public async Task<Inscripcion?> CheckinAsync(int inscripcionId)
    {
        var inscripcion = await _context.Inscripciones.FindAsync(inscripcionId);
        if (inscripcion == null)
            return null;

        if (!inscripcion.PagoConfirmado)
            throw new InvalidOperationException("Payment not confirmed");

        inscripcion.CheckinAt = DateTime.UtcNow;
        inscripcion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return inscripcion;
    }

    #endregion


    /// <summary>
    /// Confirms participation for an inscription (via QR scan)
    /// </summary>
    public async Task<Inscripcion?> ConfirmParticipationAsync(int inscripcionId)
    {
        var inscripcion = await _context.Inscripciones.FindAsync(inscripcionId);
        if (inscripcion == null)
            return null;

        inscripcion.ParticipacionConfirmada = true;
        inscripcion.CheckinAt = DateTime.UtcNow;
        inscripcion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return inscripcion;
    }

    /// <summary>
    /// Confirms cash payment for an inscription (via QR scan)
    /// </summary>
    public async Task<Inscripcion?> ConfirmCashPaymentAsync(int inscripcionId)
    {
        var inscripcion = await _context.Inscripciones.FindAsync(inscripcionId);
        if (inscripcion == null)
            return null;

        inscripcion.PagoConfirmado = true;
        inscripcion.PaymentMethod = "efectivo";
        inscripcion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return inscripcion;
    }

    public async Task<Inscripcion?> AttachStripeSessionAsync(int competicionId, int inscripcionId, string sessionId)
    {
        var inscripcion = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        if (inscripcion == null)
            return null;

        inscripcion.StripeSessionId = sessionId;
        inscripcion.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return inscripcion;
    }

    public async Task<Inscripcion?> ConfirmStripePaymentAsync(int competicionId, int inscripcionId, string? sessionId = null)
    {
        var inscripcion = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        if (inscripcion == null)
            return null;

        inscripcion.PagoConfirmado = true;
        inscripcion.PaymentMethod = PaymentMethodStripe;
        if (!string.IsNullOrWhiteSpace(sessionId))
            inscripcion.StripeSessionId = sessionId;
        inscripcion.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return inscripcion;
    }

    public async Task<Inscripcion?> GetByStripeSessionIdAsync(int competicionId, string sessionId)
    {
        return await _context.Inscripciones
            .Include(i => i.Competicion)
            .FirstOrDefaultAsync(i => i.CompeticionId == competicionId && i.StripeSessionId == sessionId);
    }

    public string GeneratePaymentToken(int competicionId, int inscripcionId, string? secret)
    {
        var data = $"{competicionId}:{inscripcionId}";
        var signature = ComputeSignature(data, secret ?? "");
        return $"{data}:{signature}";
    }

    public (int CompeticionId, int InscripcionId)? ValidatePaymentToken(string token, string? secret)
    {
        var parts = token.Split(':');
        if (parts.Length != 3)
            return null;

        if (!int.TryParse(parts[0], out var competicionId) || !int.TryParse(parts[1], out var inscripcionId))
            return null;

        var data = $"{competicionId}:{inscripcionId}";
        var expectedSignature = ComputeSignature(data, secret ?? "");
        return parts[2] == expectedSignature ? (competicionId, inscripcionId) : null;
    }

    /// <summary>
    /// Gets the full inscription state for QR check-in display
    /// </summary>
    public async Task<InscripcionEstadoDto?> GetEstadoAsync(int competicionId, int inscripcionId)
    {
        var inscripcion = await _context.Inscripciones
            .Include(i => i.Competicion)
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        
        if (inscripcion == null)
            return null;

        // Try to get matching schedule if published
        var schedulePublished = await _context.SchedulePublishedConfig.FirstOrDefaultAsync();
        List<object>? horarios = null;

        if (schedulePublished?.Value == true)
        {
            var sexEnum = inscripcion.Sexo == "masculino" ? Models.Enums.Sex.Male : Models.Enums.Sex.Female;
            var schedules = await _context.Schedules
                .Where(s => s.SexCategory == sexEnum && s.WeightCategory == inscripcion.CategoriaPeso)
                .OrderBy(s => s.Date)
                .ThenBy(s => s.StartTime)
                .ToListAsync();

            if (schedules.Count > 0)
            {
                horarios = schedules.Select(s => (object)new
                {
                    s.Date,
                    s.StartTime,
                    s.EndTime,
                    s.WeightCategory,
                    SexCategory = s.SexCategory.ToString()
                }).ToList();
            }
        }

        return new InscripcionEstadoDto(
            inscripcion.Id,
            inscripcion.Nombre,
            inscripcion.Email,
            inscripcion.Instagram,
            inscripcion.Telefono,
            inscripcion.Sexo,
            inscripcion.CategoriaPeso,
            inscripcion.Modalidad,
            inscripcion.Experiencia,
            inscripcion.QuiereHandler,
            inscripcion.QuierePeakProgram,
            inscripcion.PagoConfirmado,
            inscripcion.ParticipacionConfirmada,
            inscripcion.PaymentMethod,
            inscripcion.TotalPagado,
            inscripcion.SubtotalAntesDescuento,
            inscripcion.ImporteDescuento,
            inscripcion.CodigoCupon,
            inscripcion.CheckinAt,
            inscripcion.Competicion.Nombre,
            horarios
        );
    }

    #region Admin Operations

    /// <summary>
    /// Gets paginated inscriptions for a competition
    /// </summary>
    public async Task<(List<Inscripcion> Items, int Total)> GetPaginatedAsync(
        int competicionId,
        int page = 1,
        int pageSize = 15,
        string? search = null,
        bool? pagoConfirmado = null,
        string? experiencia = null,
        string? modalidad = null,
        string? paymentMethod = null,
        string? sexo = null,
        string? categoriaPeso = null,
        bool? quiereHandler = null,
        bool? quierePeakProgram = null,
        bool? participacionConfirmada = null,
        bool? hasCoupon = null)
    {
        var query = BuildInscripcionQuery(
            competicionId, search, pagoConfirmado, experiencia, modalidad, paymentMethod,
            sexo, categoriaPeso, quiereHandler, quierePeakProgram, participacionConfirmada, hasCoupon);

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, total);
    }

    /// <summary>
    /// Gets an inscription by ID
    /// </summary>
    public async Task<Inscripcion?> GetByIdAsync(int id)
    {
        return await _context.Inscripciones
            .Include(i => i.Competicion)
            .FirstOrDefaultAsync(i => i.Id == id);
    }

    /// <summary>
    /// Gets an inscription by QR code
    /// </summary>
    public async Task<Inscripcion?> GetByQrCodeAsync(string qrData)
    {
        try
        {
            var parts = qrData.Split(':');
            if (parts.Length < 2)
                return null;

            if (!int.TryParse(parts[0], out var competicionId))
                return null;

            if (!int.TryParse(parts[1], out var inscripcionId))
                return null;

            var inscripcion = await _context.Inscripciones
                .Include(i => i.Competicion)
                .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);

            if (inscripcion == null)
                return null;

            // Verify signature if provided
            if (parts.Length >= 3)
            {
                var providedSignature = parts[2];
                var expectedSignature = ComputeSignature($"{competicionId}:{inscripcionId}", inscripcion.Competicion.QrSecret ?? "");
                
                if (providedSignature != expectedSignature)
                    return null;
            }

            return inscripcion;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Updates an inscription
    /// </summary>
    public async Task<Inscripcion?> UpdateAsync(int id, UpdateInscripcionRequest request)
    {
        var inscripcion = await _context.Inscripciones.FindAsync(id);
        if (inscripcion == null)
            return null;

        if (request.Nombre != null)
            inscripcion.Nombre = request.Nombre;

        if (request.Email != null)
            inscripcion.Email = request.Email.ToLower().Trim();

        if (request.Instagram != null)
            inscripcion.Instagram = request.Instagram;


        if (request.Experiencia != null)
            inscripcion.Experiencia = request.Experiencia;

        if (request.TieneEntrenador.HasValue)
            inscripcion.TieneEntrenador = request.TieneEntrenador.Value;

        if (request.QuierePeakProgram.HasValue)
            inscripcion.QuierePeakProgram = request.QuierePeakProgram.Value;

        if (request.PagoConfirmado.HasValue)
            inscripcion.PagoConfirmado = request.PagoConfirmado.Value;

        if (request.PaymentMethod != null)
            inscripcion.PaymentMethod = NormalizePaymentMethod(request.PaymentMethod);

        if (request.Telefono != null)
            inscripcion.Telefono = request.Telefono;

        if (request.Sexo != null)
            inscripcion.Sexo = request.Sexo;

        if (request.CategoriaPeso != null)
            inscripcion.CategoriaPeso = request.CategoriaPeso;

        if (request.Modalidad != null)
            inscripcion.Modalidad = NormalizeModalidad(request.Modalidad);

        if (request.QuiereHandler.HasValue)
            inscripcion.QuiereHandler = request.QuiereHandler.Value;

        if (request.ParticipacionConfirmada.HasValue)
            inscripcion.ParticipacionConfirmada = request.ParticipacionConfirmada.Value;

        if (request.Notas != null)
            inscripcion.Notas = request.Notas;

        inscripcion.UpdatedAt = DateTime.UtcNow;

        await RemoveDisallowedAttemptsAsync(inscripcion.Id, inscripcion.Modalidad);

        await _context.SaveChangesAsync();
        return inscripcion;
    }

    /// <summary>
    /// Deletes an inscription
    /// </summary>
    public async Task<bool> DeleteAsync(int id)
    {
        var inscripcion = await _context.Inscripciones.FindAsync(id);
        if (inscripcion == null)
            return false;

        _context.Inscripciones.Remove(inscripcion);
        await _context.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Builds an IQueryable&lt;Inscripcion&gt; with all base + filter predicates applied.
    /// Shared between GetPaginatedAsync, GetStatsAsync, and RaffleAsync to guarantee
    /// the same row set is used everywhere.
    /// </summary>
    private IQueryable<Inscripcion> BuildInscripcionQuery(
        int competicionId,
        string? search = null,
        bool? pagoConfirmado = null,
        string? experiencia = null,
        string? modalidad = null,
        string? paymentMethod = null,
        string? sexo = null,
        string? categoriaPeso = null,
        bool? quiereHandler = null,
        bool? quierePeakProgram = null,
        bool? participacionConfirmada = null,
        bool? hasCoupon = null)
    {
        var query = _context.Inscripciones
            .Where(i => i.CompeticionId == competicionId)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLower();
            query = query.Where(i =>
                i.Nombre.ToLower().Contains(term) ||
                i.Email.ToLower().Contains(term) ||
                (i.Instagram != null && i.Instagram.ToLower().Contains(term)));
        }

        if (pagoConfirmado.HasValue)
            query = query.Where(i => i.PagoConfirmado == pagoConfirmado.Value);

        if (!string.IsNullOrWhiteSpace(experiencia))
            query = query.Where(i => i.Experiencia == experiencia);

        if (!string.IsNullOrWhiteSpace(modalidad))
        {
            var normalizedModalidad = NormalizeModalidad(modalidad);
            query = query.Where(i => i.Modalidad == normalizedModalidad);
        }

        if (!string.IsNullOrWhiteSpace(paymentMethod))
        {
            var normalizedPaymentMethod = NormalizePaymentMethod(paymentMethod);
            query = query.Where(i => i.PaymentMethod == normalizedPaymentMethod);
        }

        if (!string.IsNullOrWhiteSpace(sexo))
            query = query.Where(i => i.Sexo == sexo);

        if (!string.IsNullOrWhiteSpace(categoriaPeso))
            query = query.Where(i => i.CategoriaPeso == categoriaPeso);

        if (quiereHandler.HasValue)
            query = query.Where(i => i.QuiereHandler == quiereHandler.Value);

        if (quierePeakProgram.HasValue)
            query = query.Where(i => i.QuierePeakProgram == quierePeakProgram.Value);

        if (participacionConfirmada.HasValue)
            query = query.Where(i => i.ParticipacionConfirmada == participacionConfirmada.Value);

        if (hasCoupon.HasValue)
        {
            if (hasCoupon.Value)
                query = query.Where(i => i.CuponDescuentoId != null);
            else
                query = query.Where(i => i.CuponDescuentoId == null);
        }

        return query;
    }

    /// <summary>
    /// Gets statistics for a competition, optionally filtered.
    /// Count, total, revenue and paid count reflect the filtered set.
    /// </summary>
    public async Task<InscripcionStats> GetStatsAsync(
        int competicionId,
        string? search = null,
        bool? pagoConfirmado = null,
        string? experiencia = null,
        string? modalidad = null,
        string? paymentMethod = null,
        string? sexo = null,
        string? categoriaPeso = null,
        bool? quiereHandler = null,
        bool? quierePeakProgram = null,
        bool? participacionConfirmada = null,
        bool? hasCoupon = null)
    {
        var query = BuildInscripcionQuery(
            competicionId, search, pagoConfirmado, experiencia, modalidad, paymentMethod,
            sexo, categoriaPeso, quiereHandler, quierePeakProgram, participacionConfirmada, hasCoupon);

        var inscripciones = await query.ToListAsync();

        var paidInscripciones = inscripciones.Where(i => i.PagoConfirmado).ToList();
        var revenue = paidInscripciones.Sum(i => i.TotalPagado);
        var cashRevenue = paidInscripciones
            .Where(i => NormalizePaymentMethod(i.PaymentMethod) == PaymentMethodEfectivo)
            .Sum(i => i.TotalPagado);
        var stripeRevenue = paidInscripciones
            .Where(i => NormalizePaymentMethod(i.PaymentMethod) == PaymentMethodStripe)
            .Sum(i => i.TotalPagado);

        return new InscripcionStats(
            Total: inscripciones.Count,
            Pagados: paidInscripciones.Count,
            Pendientes: inscripciones.Count(i => !i.PagoConfirmado),
            Checkins: inscripciones.Count(i => i.CheckinAt.HasValue),
            Revenue: revenue,
            CashRevenue: cashRevenue,
            StripeRevenue: stripeRevenue,
            PorExperiencia: new Dictionary<string, int>
            {
                ["rookie"] = inscripciones.Count(i => i.Experiencia == "rookie"),
                ["principiante"] = inscripciones.Count(i => i.Experiencia == "principiante"),
                ["intermedio"] = inscripciones.Count(i => i.Experiencia == "intermedio"),
                ["avanzado"] = inscripciones.Count(i => i.Experiencia == "avanzado")
            },
            ConEntrenador: inscripciones.Count(i => i.TieneEntrenador),
            SinEntrenador: inscripciones.Count(i => !i.TieneEntrenador)
        );
    }

    /// <summary>
    /// Performs a raffle draw for a competition.
    /// 1. Builds the eligible pool from <paramref name="req"/>.FilterCriteria.
    /// 2. If equityMode == "sex" and N &gt;= 2, attempts an even split by sex with fallback
    ///    to fully-random if either sex is short of its target.
    /// 3. Persists winners to SorteoInscripcion (FechaSorteo, NumeroGanador 1-indexed, FiltroAplicado JSON).
    /// 4. Returns winners as Inscripcion[] + optional fallbackReason.
    /// </summary>
    public async Task<RaffleResultDto> RaffleAsync(int competicionId, RaffleRequest req)
    {
        if (req.NumWinners < 1)
            throw new ArgumentException("NumWinners must be >= 1", nameof(req));

        var query = BuildInscripcionQuery(competicionId);
        var filterKey = req.FilterCriteria?.ToLowerInvariant();
        query = filterKey switch
        {
            RaffleFilter.OnlyPaid => query.Where(i => i.PagoConfirmado && i.TotalPagado > 0),
            RaffleFilter.OnlyPaidNoCoupon => query.Where(i => i.PagoConfirmado && i.TotalPagado > 0 && i.CuponDescuentoId == null),
            _ => query // "all" or unknown
        };

        var pool = await query.ToListAsync();

        var rng = req.Random ?? Random.Shared;
        var mode = req.EquityMode?.ToLowerInvariant() ?? RaffleFilter.EquityNone;
        var winners = new List<Inscripcion>();
        string? fallbackReason = null;

        if (mode == RaffleFilter.EquitySex && req.NumWinners >= 2)
        {
            var (splitWinners, splitFallback) = RaffleEquityHelper.ApplySexEquitySplit(
                pool,
                req.NumWinners,
                i => i.Sexo,
                rng);
            winners = splitWinners;
            fallbackReason = splitFallback;
        }
        else
        {
            winners = RaffleEquityHelper.DrawN(pool, req.NumWinners, rng);
        }

        var ahora = DateTime.UtcNow;
        var filtroJson = JsonSerializer.Serialize(new
        {
            filterCriteria = req.FilterCriteria,
            numWinners = req.NumWinners,
            equityMode = req.EquityMode
        });

        for (int i = 0; i < winners.Count; i++)
        {
            _context.SorteosInscripcion.Add(new SorteoInscripcion
            {
                CompeticionId = competicionId,
                InscripcionId = winners[i].Id,
                FechaSorteo = ahora,
                NumeroGanador = i + 1,
                FiltroAplicado = filtroJson,
                CreatedAt = ahora
            });
        }

        await _context.SaveChangesAsync();

        return new RaffleResultDto(winners, fallbackReason);
    }

    /// <summary>
    /// Exports inscriptions to CSV
    /// </summary>
    public async Task<string> ExportToCsvAsync(int competicionId)
    {
        var inscripciones = await _context.Inscripciones
            .Where(i => i.CompeticionId == competicionId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();

        var csv = new StringBuilder();
        csv.AppendLine("ID,Nombre,Email,Instagram,Categoría,Modalidad,Experiencia,Handler,PeakProgram,Pagado,Método Pago,Cupón,Subtotal (€),Descuento (€),Total (€),Check-in,Fecha");

        foreach (var i in inscripciones)
        {
            csv.AppendLine($"{i.Id},\"{i.Nombre}\",\"{i.Email}\",\"{i.Instagram ?? ""}\",{i.CategoriaPeso},{GetModalidadLabel(i.Modalidad)},{i.Experiencia},{(i.QuiereHandler ? "Sí" : "No")},{(i.QuierePeakProgram ? "Sí" : "No")},{(i.PagoConfirmado ? "Sí" : "No")},{GetPaymentMethodLabel(i.PaymentMethod)},\"{i.CodigoCupon ?? ""}\",{i.SubtotalAntesDescuento},{i.ImporteDescuento},{i.TotalPagado},{(i.CheckinAt.HasValue ? i.CheckinAt.Value.ToString("yyyy-MM-dd HH:mm") : "No")},{i.CreatedAt:yyyy-MM-dd HH:mm:ss}");
        }

        return csv.ToString();
    }

    #endregion

    #region QR Code Generation

    /// <summary>
    /// Generates a QR code payload for an inscription (public for email use)
    /// </summary>
    public string GenerateQrCodePayload(int competicionId, int inscripcionId, string? secret)
    {
        var data = $"{competicionId}:{inscripcionId}";
        var signature = ComputeSignature(data, secret ?? "");
        return $"{data}:{signature}";
    }

    /// <summary>
    /// Computes HMAC-SHA256 signature
    /// </summary>
    private static string ComputeSignature(string data, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
        return Convert.ToBase64String(hash).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }

    /// <summary>
    /// Generates QR code, uploads to CDN, and returns both URL and bytes for inline embedding
    /// </summary>
    public async Task<(string Url, byte[] Bytes)?> GenerateQrImageAsync(string payload, int competicionId, int inscripcionId)
    {
        try
        {
            using var qrGenerator = new QRCodeGenerator();
            var qrCodeData = qrGenerator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.M);

            // Generate PNG as byte array using PngByteQRCode
            var pngQr = new PngByteQRCode(qrCodeData);
            var qrBytes = pngQr.GetGraphic(20); // 20 pixels per module

            using var stream = new MemoryStream(qrBytes);
            var fileName = $"qr_{competicionId}_{inscripcionId}.png";
            var subfolder = $"qr/{competicionId}";

            var url = await _bunnyCdn.UploadImageAsync(stream, fileName, subfolder);
            return (url, qrBytes);
        }
        catch (Exception ex)
        {
            System.Console.WriteLine($"[WARN] Failed to generate QR image: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Generates a QR code PNG image and uploads to BunnyCDN (legacy method for storage)
    /// </summary>
    private async Task<string> GenerateAndUploadQrImageAsync(string payload, int competicionId, int inscripcionId)
    {
        var result = await GenerateQrImageAsync(payload, competicionId, inscripcionId);
        if (result.HasValue)
        {
            return result.Value.Url;
        }
        throw new InvalidOperationException("Failed to generate QR image");
    }

    #endregion

    #region Lift Attempts (FER)

    /// <summary>
    /// Sets openers (attempt 1) for all 3 lifts for an inscription
    /// </summary>
    public async Task<List<LiftEntryInscripcion>> SetOpenersAsync(
        int competicionId, int inscripcionId,
        decimal sentadilla1, decimal sentadilla2, decimal sentadilla3,
        decimal banca1, decimal banca2, decimal banca3,
        decimal pesoMuerto1, decimal pesoMuerto2, decimal pesoMuerto3,
        string updatedBy)
    {
        var inscripcion = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        if (inscripcion == null)
            throw new InvalidOperationException("Inscripción no encontrada");
        if (!inscripcion.PagoConfirmado)
            throw new InvalidOperationException("Debe confirmar el pago antes de registrar intentos");

        var now = DateTime.UtcNow;
        var results = new List<LiftEntryInscripcion>();
        var allowedLifts = GetAllowedLiftTypes(inscripcion.Modalidad).ToArray();

        await RemoveDisallowedAttemptsAsync(inscripcionId, inscripcion.Modalidad);

        if (allowedLifts.Contains("Squat"))
        {
            results.Add(await UpsertLiftAttempt(inscripcionId, "Squat", 1, sentadilla1, updatedBy, now));
            results.Add(await UpsertLiftAttempt(inscripcionId, "Squat", 2, sentadilla2, updatedBy, now));
            results.Add(await UpsertLiftAttempt(inscripcionId, "Squat", 3, sentadilla3, updatedBy, now));
        }

        if (allowedLifts.Contains("Bench"))
        {
            results.Add(await UpsertLiftAttempt(inscripcionId, "Bench", 1, banca1, updatedBy, now));
            results.Add(await UpsertLiftAttempt(inscripcionId, "Bench", 2, banca2, updatedBy, now));
            results.Add(await UpsertLiftAttempt(inscripcionId, "Bench", 3, banca3, updatedBy, now));
        }

        if (allowedLifts.Contains("Deadlift"))
        {
            results.Add(await UpsertLiftAttempt(inscripcionId, "Deadlift", 1, pesoMuerto1, updatedBy, now));
            results.Add(await UpsertLiftAttempt(inscripcionId, "Deadlift", 2, pesoMuerto2, updatedBy, now));
            results.Add(await UpsertLiftAttempt(inscripcionId, "Deadlift", 3, pesoMuerto3, updatedBy, now));
        }

        await _context.SaveChangesAsync();
        return results;
    }

    private async Task<LiftEntryInscripcion> UpsertLiftAttempt(
        int inscripcionId, string liftType, int attemptNumber, decimal weight, string updatedBy, DateTime now)
    {
        var existing = await _context.LiftEntriesInscripcion
            .FirstOrDefaultAsync(l => l.InscripcionId == inscripcionId &&
                                       l.LiftType == liftType &&
                                       l.AttemptNumber == attemptNumber);

        if (existing != null)
        {
            existing.Weight = weight;
            existing.UpdatedBy = updatedBy;
            existing.UpdatedAt = now;
            return existing;
        }

        var entry = new LiftEntryInscripcion
        {
            InscripcionId = inscripcionId,
            LiftType = liftType,
            AttemptNumber = attemptNumber,
            Weight = weight,
            UpdatedBy = updatedBy,
            UpdatedAt = now
        };
        _context.LiftEntriesInscripcion.Add(entry);
        return entry;
    }

    /// <summary>
    /// Gets all lift attempts for an inscription
    /// </summary>
    public async Task<List<LiftEntryInscripcion>> GetAllAttemptsAsync(int competicionId, int inscripcionId)
    {
        var inscripcion = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        if (inscripcion == null)
            return new List<LiftEntryInscripcion>();

        var allowedLifts = GetAllowedLiftTypes(inscripcion.Modalidad).ToArray();

        return await _context.LiftEntriesInscripcion
            .Where(l => l.InscripcionId == inscripcionId)
            .Where(l => allowedLifts.Contains(l.LiftType))
            .OrderBy(l => l.LiftType)
            .ThenBy(l => l.AttemptNumber)
            .ToListAsync();
    }

    private async Task RemoveDisallowedAttemptsAsync(int inscripcionId, string modalidad)
    {
        var allowedLifts = GetAllowedLiftTypes(modalidad).ToArray();
        var disallowed = await _context.LiftEntriesInscripcion
            .Where(l => l.InscripcionId == inscripcionId && !allowedLifts.Contains(l.LiftType))
            .ToListAsync();

        if (disallowed.Count > 0)
            _context.LiftEntriesInscripcion.RemoveRange(disallowed);
    }

    #endregion

    #region Judge Votes

    /// <summary>
    /// Updates the weight for a specific lift attempt (inline edit from judge table)
    /// </summary>
    public async Task<LiftEntryInscripcion?> UpdateAttemptWeightAsync(int competicionId, int inscripcionId,
        string liftType, int attemptNumber, decimal weight, string updatedBy)
    {
        var inscripcion = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        if (inscripcion == null) return null;

        if (!IsLiftAllowed(inscripcion.Modalidad, liftType))
            throw new InvalidOperationException("La modalidad de la inscripción no permite este levantamiento");

        var existing = await _context.LiftEntriesInscripcion
            .FirstOrDefaultAsync(l => l.InscripcionId == inscripcionId &&
                                      l.LiftType == liftType &&
                                      l.AttemptNumber == attemptNumber);

        if (existing != null)
        {
            existing.Weight = weight;
            existing.UpdatedBy = updatedBy;
            existing.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return existing;
        }

        var entry = new LiftEntryInscripcion
        {
            InscripcionId = inscripcionId,
            LiftType = liftType,
            AttemptNumber = attemptNumber,
            Weight = weight,
            UpdatedBy = updatedBy,
            UpdatedAt = DateTime.UtcNow
        };
        _context.LiftEntriesInscripcion.Add(entry);
        await _context.SaveChangesAsync();
        return entry;
    }

    /// <summary>
    /// Updates a judge's vote for a specific lift attempt
    /// </summary>
    public async Task<LiftEntryInscripcion?> UpdateJudgeVoteAsync(int competicionId, int inscripcionId,
        string liftType, int attemptNumber, int juezNumero, bool? voto)
    {
        var inscripcion = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        if (inscripcion == null) return null;

        if (!IsLiftAllowed(inscripcion.Modalidad, liftType)) return null;

        var entry = await _context.LiftEntriesInscripcion
            .FirstOrDefaultAsync(l => l.InscripcionId == inscripcionId &&
                                      l.LiftType == liftType &&
                                      l.AttemptNumber == attemptNumber);

        if (entry == null) return null;

        switch (juezNumero)
        {
            case 1: entry.Juez1Voto = voto; break;
            case 2: entry.Juez2Voto = voto; break;
            case 3: entry.Juez3Voto = voto; break;
        }

        entry.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return entry;
    }

    #endregion
}

public record CreateInscripcionRequest(
    string Nombre,
    string Email,
    string? Instagram,
    string? Telefono,
    string? Sexo,
    string? CategoriaPeso,
    string? Modalidad,
    bool QuiereHandler,

    string Experiencia,
    bool TieneEntrenador,
            bool PeakProgram,
            bool AceptaTerminos,
            string? PaymentMethod = null,
            bool IncludeOnlinePaymentLink = false,
            string? CodigoCupon = null,
            FerConfigSnapshot? ConfigSnapshot = null
);

public record UpdateInscripcionRequest(
    string? Nombre = null,
    string? Email = null,
    string? Instagram = null,
    string? Telefono = null,
    string? Sexo = null,
    string? CategoriaPeso = null,
    string? Modalidad = null,
    bool? QuiereHandler = null,

    string? Experiencia = null,
    bool? TieneEntrenador = null,
    bool? QuierePeakProgram = null,
    bool? PagoConfirmado = null,
    bool? ParticipacionConfirmada = null,
    string? PaymentMethod = null,
    string? Notas = null
);

public record InscripcionEstadoDto(
    int Id,
    string Nombre,
    string Email,
    string? Instagram,
    string? Telefono,
    string Sexo,
    string? CategoriaPeso,
    string Modalidad,
    string Experiencia,
    bool QuiereHandler,
    bool QuierePeakProgram,
    bool PagoConfirmado,
    bool ParticipacionConfirmada,
    string? PaymentMethod,
    decimal TotalPagado,
    decimal SubtotalAntesDescuento,
    decimal ImporteDescuento,
    string? CodigoCupon,
    DateTime? CheckinAt,
    string CompeticionNombre,
    List<object>? Horarios
);

/// <summary>
/// Performs a raffle draw for a competition, picking N winners from a filtered pool.
/// </summary>
public class RaffleFilter
{
    public const string All = "all";
    public const string OnlyPaid = "onlypaid";
    public const string OnlyPaidNoCoupon = "onlypaidnocoupon";

    public const string EquityNone = "none";
    public const string EquitySex = "sex";

    public const string FallbackInsufficientPoolForEquity = "insufficient_pool_for_equity";
}

/// <summary>
/// Request body for POST /api/admin/competiciones/:id/inscripciones/raffle
/// </summary>
public record RaffleRequest(
    string FilterCriteria,
    int NumWinners,
    string EquityMode,
    Random? Random = null
);

/// <summary>
/// Result of a raffle draw: list of winners + optional fallback reason.
/// </summary>
public record RaffleResultDto(
    List<Inscripcion> Winners,
    string? FallbackReason
);

public record InscripcionStats(
    int Total,
    int Pagados,
    int Pendientes,
    int Checkins,
    decimal Revenue,
    decimal CashRevenue,
    decimal StripeRevenue,
    Dictionary<string, int> PorExperiencia,
    int ConEntrenador,
    int SinEntrenador
);
