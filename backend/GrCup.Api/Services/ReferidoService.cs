using Microsoft.EntityFrameworkCore;
using GrCup.Api.Data;
using GrCup.Api.Models;

namespace GrCup.Api.Services;

/// <summary>
/// Manages the per-competition referral program:
/// - generates unique codes per inscripcion
/// - validates a code at inscription time
/// - applies the new-user discount and stamps the inscripcion
/// - after a successful inscription, computes the referrer's reward
///   and triggers a Stripe refund to the referrer's original payment method.
/// </summary>
public class ReferidoService
{
    public const string ModoBasico = "basico";
    public const string ModoAcumulativo = "acumulativo";

    public const string TipoPorcentaje = "porcentaje";
    public const string TipoImporte = "importe";

    public const string AcumulativoBasica = "basica";
    public const string AcumulativoMultiplicador = "multiplicador";

    private const string RandomAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private readonly GrCupDbContext _context;
    private readonly EmailService _emailService;
    private readonly ILogger<ReferidoService> _logger;

    public ReferidoService(GrCupDbContext context, EmailService emailService, ILogger<ReferidoService> logger)
    {
        _context = context;
        _emailService = emailService;
        _logger = logger;
    }

    // ───────────────────────── Config CRUD ─────────────────────────

    public async Task<ReferidoConfig?> GetConfigAsync(int competicionId)
    {
        return await _context.ReferidosConfig
            .FirstOrDefaultAsync(c => c.CompeticionId == competicionId);
    }

    public async Task<ReferidoConfig> UpsertConfigAsync(int competicionId, ReferidoConfigRequest request)
    {
        var config = await _context.ReferidosConfig
            .FirstOrDefaultAsync(c => c.CompeticionId == competicionId);

        var wasActive = config?.Activo == true;

        if (config == null)
        {
            config = new ReferidoConfig
            {
                CompeticionId = competicionId,
                CreatedAt = DateTime.UtcNow
            };
            _context.ReferidosConfig.Add(config);
        }

        config.Activo = request.Activo;
        config.Modo = NormalizeModo(request.Modo);
        config.TipoDescuentoReferente = NormalizeTipo(request.TipoDescuentoReferente);
        config.ValorDescuentoReferente = EnsureNonNegative(request.ValorDescuentoReferente, nameof(request.ValorDescuentoReferente));
        config.TieneLimiteUsos = request.TieneLimiteUsos;
        config.LimiteUsos = request.TieneLimiteUsos ? request.LimiteUsos : null;
        config.ModoAcumulativo = request.Modo == ModoAcumulativo ? NormalizeModoAcumulativo(request.ModoAcumulativo) : null;
        config.MultiplicadorAcumulativo = request.Modo == ModoAcumulativo && request.ModoAcumulativo == AcumulativoMultiplicador
            ? EnsureNonNegative(request.MultiplicadorAcumulativo ?? 0m, nameof(request.MultiplicadorAcumulativo)) : null;
        config.TipoDescuentoNuevoUsuario = NormalizeTipo(request.TipoDescuentoNuevoUsuario);
        config.ValorDescuentoNuevoUsuario = EnsureNonNegative(request.ValorDescuentoNuevoUsuario, nameof(request.ValorDescuentoNuevoUsuario));
        config.UpdatedAt = DateTime.UtcNow;

        ValidateConfig(config);
        await _context.SaveChangesAsync();

        // If the global config just became active, batch-notify all existing codes that
        // don't have an override keeping them off.
        if (!wasActive && config.Activo)
        {
            try
            {
                await SendActivationEmailsBatchAsync(competicionId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Batch referral activation emails failed for competition {CompeticionId}", competicionId);
            }
        }

        return config;
    }

    public async Task<List<ReferidoInscripcionRowDto>> ListInscripcionesAsync(int competicionId, int page, int pageSize, string? search)
    {
        var query = _context.Inscripciones
            .Where(i => i.CompeticionId == competicionId)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLower();
            query = query.Where(i =>
                i.Nombre.ToLower().Contains(term) ||
                i.Email.ToLower().Contains(term));
        }

        var rows = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Join(_context.CodigosReferido.Where(c => c.CompeticionId == competicionId),
                i => i.Id, c => c.InscripcionId, (i, c) => new { i, c })
            .ToListAsync();

        var codeIds = rows.Select(r => r.c.Id).ToList();
        var settings = await _context.ReferidosUserSetting
            .Where(s => codeIds.Contains(s.CodigoReferidoId))
            .ToDictionaryAsync(s => s.CodigoReferidoId);
        var usages = await _context.NewUserReferrals
            .Where(n => codeIds.Contains(n.CodigoReferidoId))
            .GroupBy(n => n.CodigoReferidoId)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        return rows.Select(r =>
        {
            settings.TryGetValue(r.c.Id, out var setting);
            var effectiveTipo = setting?.TipoDescuentoNuevoUsuario ?? TipoPorcentaje;
            var effectiveValor = setting?.ValorDescuentoNuevoUsuario ?? 0m;
            var activo = setting?.Activo ?? false;
            return new ReferidoInscripcionRowDto(
                r.i.Id,
                r.i.Nombre,
                r.i.Email,
                r.i.Apellido1,
                r.c.Id,
                r.c.Codigo,
                r.c.CodigoNormalizado,
                activo,
                setting?.Modo,
                effectiveTipo,
                effectiveValor,
                usages.GetValueOrDefault(r.c.Id),
                setting != null,
                r.i.CreatedAt
            );
        }).ToList();
    }

    public async Task<int> CountInscripcionesAsync(int competicionId, string? search)
    {
        var query = _context.Inscripciones
            .Where(i => i.CompeticionId == competicionId)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLower();
            query = query.Where(i =>
                i.Nombre.ToLower().Contains(term) ||
                i.Email.ToLower().Contains(term));
        }

        return await query.CountAsync();
    }

    public async Task<ReferidoInscripcionRowDto?> UpdateInscripcionSettingAsync(
        int competicionId, int inscripcionId, ReferidoInscripcionOverrideRequest request)
    {
        var inscripcion = await _context.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == inscripcionId && i.CompeticionId == competicionId);
        if (inscripcion == null) return null;

        var code = await _context.CodigosReferido
            .FirstOrDefaultAsync(c => c.InscripcionId == inscripcionId && c.CompeticionId == competicionId);
        if (code == null) return null;

        var wasActive = false;
        var setting = await _context.ReferidosUserSetting
            .FirstOrDefaultAsync(s => s.CodigoReferidoId == code.Id);
        if (setting == null)
        {
            setting = new ReferidoUserSetting
            {
                CodigoReferidoId = code.Id,
                CreatedAt = DateTime.UtcNow
            };
            _context.ReferidosUserSetting.Add(setting);
        }
        else
        {
            wasActive = setting.Activo;
        }

        setting.Activo = request.Activo;
        setting.Modo = NormalizeModo(request.Modo);
        setting.TipoDescuentoReferente = NormalizeTipo(request.TipoDescuentoReferente);
        setting.ValorDescuentoReferente = EnsureNonNegative(request.ValorDescuentoReferente, nameof(request.ValorDescuentoReferente));
        setting.TieneLimiteUsos = request.TieneLimiteUsos;
        setting.LimiteUsos = request.TieneLimiteUsos ? request.LimiteUsos : null;
        setting.ModoAcumulativo = request.Modo == ModoAcumulativo ? NormalizeModoAcumulativo(request.ModoAcumulativo) : null;
        setting.MultiplicadorAcumulativo = request.Modo == ModoAcumulativo && request.ModoAcumulativo == AcumulativoMultiplicador
            ? EnsureNonNegative(request.MultiplicadorAcumulativo ?? 0m, nameof(request.MultiplicadorAcumulativo)) : null;
        setting.TipoDescuentoNuevoUsuario = NormalizeTipo(request.TipoDescuentoNuevoUsuario);
        setting.ValorDescuentoNuevoUsuario = EnsureNonNegative(request.ValorDescuentoNuevoUsuario, nameof(request.ValorDescuentoNuevoUsuario));
        setting.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        // If the per-inscripcion code just became active, notify the user.
        if (!wasActive && setting.Activo)
        {
            try
            {
                var competicion = await _context.Competiciones
                    .FirstOrDefaultAsync(c => c.Id == competicionId);
                if (competicion != null)
                {
                    var settings = await ResolveEffectiveSettingsAsync(code);
                    await _emailService.SendReferralCodeActivationAsync(inscripcion, competicion, code, settings);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Referral activation email failed for inscripcion {InscripcionId}", inscripcionId);
            }
        }

        var usage = await _context.NewUserReferrals.CountAsync(n => n.CodigoReferidoId == code.Id);
        return new ReferidoInscripcionRowDto(
            inscripcion.Id,
            inscripcion.Nombre,
            inscripcion.Email,
            inscripcion.Apellido1,
            code.Id,
            code.Codigo,
            code.CodigoNormalizado,
            setting.Activo,
            setting.Modo,
            setting.TipoDescuentoNuevoUsuario,
            setting.ValorDescuentoNuevoUsuario,
            usage,
            true,
            inscripcion.CreatedAt
        );
    }

    /// <summary>
    /// Sends activation emails to all existing codes in a competition whose effective state is active.
    /// Returns the number of emails sent.
    /// </summary>
    public async Task<int> SendActivationEmailsBatchAsync(int competicionId)
    {
        var competicion = await _context.Competiciones.FirstOrDefaultAsync(c => c.Id == competicionId);
        if (competicion == null) return 0;

        var codes = await _context.CodigosReferido
            .Where(c => c.CompeticionId == competicionId)
            .Include(c => c.Inscripcion)
            .Include(c => c.UserSetting)
            .ToListAsync();

        int sent = 0;
        foreach (var code in codes)
        {
            if (code.Inscripcion == null) continue;
            var effective = await ResolveEffectiveSettingsAsync(code);
            if (!effective.Activo) continue;

            try
            {
                await _emailService.SendReferralCodeActivationAsync(code.Inscripcion, competicion, code, effective);
                sent++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Batch referral activation email failed for inscripcion {InscripcionId}", code.InscripcionId);
            }
        }
        return sent;
    }

    // ───────────────────────── Code generation ─────────────────────────

    /// <summary>
    /// Generates a unique referral code for the given inscripcion and persists it (inactive by default).
    /// Idempotent: returns the existing code if one already exists.
    /// </summary>
    public async Task<CodigoReferido> GenerateCodeForInscripcionAsync(Inscripcion inscripcion)
    {
        var existing = await _context.CodigosReferido
            .FirstOrDefaultAsync(c => c.InscripcionId == inscripcion.Id);
        if (existing != null) return existing;

        var normalized = await BuildUniqueNormalizedCodeAsync(inscripcion);
        var code = new CodigoReferido
        {
            InscripcionId = inscripcion.Id,
            CompeticionId = inscripcion.CompeticionId,
            Codigo = normalized,
            CodigoNormalizado = normalized,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _context.CodigosReferido.Add(code);
        await _context.SaveChangesAsync();
        return code;
    }

    /// <summary>
    /// Backfill: generate codes for all inscriptions in a competition that don't have one yet.
    /// </summary>
    public async Task<int> BackfillAsync(int competicionId)
    {
        var existingIds = await _context.CodigosReferido
            .Where(c => c.CompeticionId == competicionId)
            .Select(c => c.InscripcionId)
            .ToListAsync();

        var missing = await _context.Inscripciones
            .Where(i => i.CompeticionId == competicionId && !existingIds.Contains(i.Id))
            .ToListAsync();

        int generated = 0;
        foreach (var inscripcion in missing)
        {
            try
            {
                await GenerateCodeForInscripcionAsync(inscripcion);
                generated++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to backfill referral code for inscripcion {InscripcionId}", inscripcion.Id);
            }
        }
        return generated;
    }

    private async Task<string> BuildUniqueNormalizedCodeAsync(Inscripcion inscripcion)
    {
        var baseCode = BuildBaseCode(inscripcion);
        var candidate = baseCode;

        for (int attempt = 0; attempt < 50; attempt++)
        {
            var exists = await _context.CodigosReferido
                .AnyAsync(c => c.CompeticionId == inscripcion.CompeticionId && c.CodigoNormalizado == candidate);
            if (!exists) return candidate;

            // Append 4 random chars and retry.
            var suffix = new string(Enumerable.Range(0, 4)
                .Select(_ => RandomAlphabet[Random.Shared.Next(RandomAlphabet.Length)])
                .ToArray());
            candidate = $"{baseCode}{suffix}";
        }

        throw new InvalidOperationException("No se pudo generar un código único tras 50 intentos.");
    }

    private static string BuildBaseCode(Inscripcion inscripcion)
    {
        string part(string? s, int n) => FirstAlphaChunk(s ?? "", n);
        var raw = $"{part(inscripcion.Nombre, 2)}{part(inscripcion.Apellido1, 2)}{part(inscripcion.Email, 2)}-GR";
        // Strip non-ASCII alphanumerics (so accents/diacritics like Á Ñ É are dropped), uppercase, pad with X if too short.
        var cleaned = new string(raw.Where(IsAsciiLetterOrDigit).ToArray()).ToUpperInvariant();
        if (cleaned.Length < 7) cleaned = cleaned.PadRight(7, 'X');
        return cleaned;
    }

    private static string FirstAlphaChunk(string s, int n)
    {
        var letters = new string(s.Where(IsAsciiLetter).ToArray());
        if (letters.Length == 0) return "XX";
        return letters.Substring(0, Math.Min(n, letters.Length)).ToUpperInvariant();
    }

    private static bool IsAsciiLetter(char c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    private static bool IsAsciiLetterOrDigit(char c) => IsAsciiLetter(c) || (c >= '0' && c <= '9');

    // ───────────────────────── Public validation ─────────────────────────

    public async Task<ReferidoValidationResult> ValidatePublicAsync(
        int competicionId, EventoConfig config, string? codigo, decimal subtotal)
    {
        if (string.IsNullOrWhiteSpace(codigo))
            return new ReferidoValidationResult(false, "Introduce un código de referido.", null, null, null, subtotal, 0, subtotal, null);

        if (!config.ReferidosActivo)
            return new ReferidoValidationResult(false, "El plan de referidos no está activo para esta competición.", null, null, null, subtotal, 0, subtotal, null);

        try
        {
            var normalized = codigo.Trim().ToUpperInvariant();
            var code = await _context.CodigosReferido
                .FirstOrDefaultAsync(c => c.CompeticionId == competicionId && c.CodigoNormalizado == normalized);

            if (code == null)
                throw new InvalidOperationException("Código de referido no válido.");

            var effective = await ResolveEffectiveSettingsAsync(code);
            if (!effective.Activo)
                throw new InvalidOperationException("Este código de referido está desactivado.");

            // Limit check
            if (effective.TieneLimiteUsos && effective.LimiteUsos.HasValue)
            {
                var used = await _context.NewUserReferrals.CountAsync(n => n.CodigoReferidoId == code.Id);
                if (used >= effective.LimiteUsos.Value)
                    throw new InvalidOperationException("Este código ya ha alcanzado su límite de usos.");
            }

            var newUserDiscount = CalculateDiscount(
                effective.TipoDescuentoNuevoUsuario, effective.ValorDescuentoNuevoUsuario, subtotal);

            return new ReferidoValidationResult(
                true,
                null,
                code.Codigo,
                effective.TipoDescuentoNuevoUsuario,
                effective.ValorDescuentoNuevoUsuario,
                subtotal,
                newUserDiscount,
                Math.Max(0, subtotal - newUserDiscount),
                code.Id
            );
        }
        catch (Exception ex)
        {
            return new ReferidoValidationResult(false, ex.Message, null, null, null, subtotal, 0, subtotal, null);
        }
    }

    /// <summary>
    /// Applies the referral discount to the given subtotal. If a coupon is also present, the referral
    /// is computed against the coupon-adjusted subtotal and the totals are combined.
    /// </summary>
    public async Task<ReferralApplication> ApplyReferidoAsync(
        int competicionId,
        EventoConfig config,
        string? codigo,
        decimal subtotal,
        int? excludeInscripcionId = null)
    {
        if (string.IsNullOrWhiteSpace(codigo))
            return ReferralApplication.None(subtotal);

        if (!config.ReferidosActivo)
            throw new InvalidOperationException("El plan de referidos no está activo para esta competición.");

        var normalized = codigo.Trim().ToUpperInvariant();
        var code = await _context.CodigosReferido
            .FirstOrDefaultAsync(c => c.CompeticionId == competicionId && c.CodigoNormalizado == normalized);
        if (code == null)
            throw new InvalidOperationException("Código de referido no válido.");

        // Self-referral guard
        if (excludeInscripcionId.HasValue && code.InscripcionId == excludeInscripcionId.Value)
            throw new InvalidOperationException("No puedes usar tu propio código de referido.");

        var effective = await ResolveEffectiveSettingsAsync(code);
        if (!effective.Activo)
            throw new InvalidOperationException("Este código de referido está desactivado.");

        if (effective.TieneLimiteUsos && effective.LimiteUsos.HasValue)
        {
            var used = await _context.NewUserReferrals.CountAsync(n => n.CodigoReferidoId == code.Id);
            if (used >= effective.LimiteUsos.Value)
                throw new InvalidOperationException("Este código ya ha alcanzado su límite de usos.");
        }

        var discount = CalculateDiscount(effective.TipoDescuentoNuevoUsuario, effective.ValorDescuentoNuevoUsuario, subtotal);
        var total = Math.Max(0, subtotal - discount);

        return new ReferralApplication(
            code.Id,
            code.Codigo,
            effective.TipoDescuentoNuevoUsuario,
            effective.ValorDescuentoNuevoUsuario,
            subtotal,
            discount,
            total
        );
    }

    // ───────────────────────── Post-payment: refund the referrer ─────────────────────────

    /// <summary>
    /// Called by the webhook after an inscription payment is confirmed.
    /// If the inscription used a referral code, computes the referrer's reward and
    /// fires a Stripe refund (or persists a manual-payout row for cash/transfer).
    /// </summary>
    public async Task OnInscriptionCompletedAsync(
        int newInscripcionId,
        StripeService stripeService,
        IServiceScopeFactory scopeFactory,
        ILogger logger)
    {
        using var scope = scopeFactory.CreateScope();
        var ctx = scope.ServiceProvider.GetRequiredService<GrCupDbContext>();

        var inscripcion = await ctx.Inscripciones
            .Include(i => i.Competicion)
            .FirstOrDefaultAsync(i => i.Id == newInscripcionId);
        if (inscripcion == null) return;
        if (!inscripcion.ReferralCodeId.HasValue) return;

        var code = await ctx.CodigosReferido
            .FirstOrDefaultAsync(c => c.Id == inscripcion.ReferralCodeId.Value);
        if (code == null) return;

        var effective = await ResolveEffectiveSettingsAsync(code, ctx);
        if (!effective.Activo) return;

        // Upsert the NewUserReferral row for this redemption.
        var newUserDiscount = CalculateDiscount(
            effective.TipoDescuentoNuevoUsuario,
            effective.ValorDescuentoNuevoUsuario,
            inscripcion.SubtotalAntesDescuento > 0 ? inscripcion.SubtotalAntesDescuento : inscripcion.TotalPagado);

        var redemption = await ctx.NewUserReferrals
            .FirstOrDefaultAsync(n => n.CodigoReferidoId == code.Id && n.InscripcionId == newInscripcionId);
        if (redemption == null)
        {
            redemption = new NewUserReferral
            {
                CodigoReferidoId = code.Id,
                InscripcionId = newInscripcionId,
                TipoDescuento = effective.TipoDescuentoNuevoUsuario,
                ImporteDescuento = newUserDiscount,
                CreatedAt = DateTime.UtcNow
            };
            ctx.NewUserReferrals.Add(redemption);
        }
        else
        {
            redemption.TipoDescuento = effective.TipoDescuentoNuevoUsuario;
            redemption.ImporteDescuento = newUserDiscount;
        }

        // Compute VecesUsado (count of all redemptions up to and including this one)
        var vecesUsado = await ctx.NewUserReferrals.CountAsync(n => n.CodigoReferidoId == code.Id);
        redemption.VecesUsado = vecesUsado;

        // Compute referrer reward
        var reward = CalculateReferrerReward(effective, vecesUsado, inscripcion.SubtotalAntesDescuento > 0 ? inscripcion.SubtotalAntesDescuento : inscripcion.TotalPagado);

        // Load the code-owner's inscripcion up-front so we can cap the lifetime payout.
        var owner = await ctx.Inscripciones
            .FirstOrDefaultAsync(i => i.Id == code.InscripcionId);
        if (owner == null)
        {
            logger.LogWarning("Referral code {CodeId} has no owning inscription; skipping refund", code.Id);
            redemption.ImporteAcumuladoReferente = 0m;
            await ctx.SaveChangesAsync();
            return;
        }

        // Cap so lifetime payout to this referrer never exceeds what they paid for their inscription.
        var alreadyPaidToReferrer = await ctx.NewUserReferrals
            .Where(n => n.CodigoReferidoId == code.Id && n.Id != redemption.Id)
            .SumAsync(n => (decimal?)n.ImporteAcumuladoReferente) ?? 0m;
        var ownerPaid = owner.TotalPagado;
        var headroom = Math.Max(0m, ownerPaid - alreadyPaidToReferrer);
        if (reward > headroom) reward = headroom;
        redemption.ImporteAcumuladoReferente = reward;

        await ctx.SaveChangesAsync();

        if (reward <= 0)
        {
            logger.LogInformation("Referrer inscription {InscripcionId} has hit the cumulative cap; nothing to refund", owner.Id);
            return;
        }

        var paymentIntentId = owner.StripePaymentIntentId;
        if (string.IsNullOrWhiteSpace(paymentIntentId))
        {
            logger.LogInformation("Referrer inscription {InscripcionId} has no Stripe PaymentIntent; reward of {Reward}€ persisted for manual payout",
                owner.Id, reward);
            return;
        }

        try
        {
            var refundCents = (long)Math.Round(reward * 100m, MidpointRounding.AwayFromZero);
            var refund = await stripeService.RefundPaymentAsync(inscripcion.CompeticionId, paymentIntentId, refundCents, logger);
            if (refund != null)
            {
                redemption.StripeRefundId = refund.Id;
                redemption.RefundedAt = DateTime.UtcNow;
                await ctx.SaveChangesAsync();
                logger.LogInformation("Issued Stripe refund {RefundId} for referrer inscription {InscripcionId} amount {Amount}€",
                    refund.Id, owner.Id, reward);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to issue Stripe refund for referrer inscription {InscripcionId}", owner.Id);
        }
    }

    // ───────────────────────── Helpers ─────────────────────────

    /// <summary>
    /// Returns the effective settings for a code (override if present, else global config).
    /// </summary>
    public async Task<ResolvedReferralSettings> ResolveEffectiveSettingsAsync(CodigoReferido code, GrCupDbContext? ctx = null)
    {
        ctx ??= _context;
        var setting = await ctx.ReferidosUserSetting
            .FirstOrDefaultAsync(s => s.CodigoReferidoId == code.Id);
        if (setting != null)
        {
            return new ResolvedReferralSettings(
                setting.Activo,
                setting.Modo,
                setting.TipoDescuentoReferente,
                setting.ValorDescuentoReferente,
                setting.TieneLimiteUsos,
                setting.LimiteUsos,
                setting.ModoAcumulativo,
                setting.MultiplicadorAcumulativo,
                setting.TipoDescuentoNuevoUsuario,
                setting.ValorDescuentoNuevoUsuario);
        }

        var config = await ctx.ReferidosConfig
            .FirstOrDefaultAsync(c => c.CompeticionId == code.CompeticionId);
        if (config == null)
        {
            return new ResolvedReferralSettings(false, ModoBasico, TipoImporte, 0m, false, null,
                null, null, TipoPorcentaje, 0m);
        }
        return new ResolvedReferralSettings(
            config.Activo,
            config.Modo,
            config.TipoDescuentoReferente,
            config.ValorDescuentoReferente,
            config.TieneLimiteUsos,
            config.LimiteUsos,
            config.ModoAcumulativo,
            config.MultiplicadorAcumulativo,
            config.TipoDescuentoNuevoUsuario,
            config.ValorDescuentoNuevoUsuario);
    }

    private static decimal CalculateDiscount(string tipo, decimal valor, decimal subtotal)
    {
        if (valor <= 0) return 0m;
        var raw = tipo == TipoPorcentaje
            ? subtotal * (valor / 100m)
            : valor;
        return Math.Round(Math.Min(subtotal, Math.Max(0, raw)), 2, MidpointRounding.AwayFromZero);
    }

    /// <summary>
    /// Reward paid to the referrer for a single redemption.
    /// - Basic: just the configured amount/percentage.
    /// - Acumulative-tope: the configured value (caller is responsible for the cap via VecesUsado).
    /// - Acumulative-multiplicador: VecesUsado × Multiplicador × baseValue.
    /// </summary>
    private static decimal CalculateReferrerReward(ResolvedReferralSettings s, int vecesUsado, decimal subtotal)
    {
        if (s.Modo == ModoBasico)
        {
            return CalculateDiscount(s.TipoDescuentoReferente, s.ValorDescuentoReferente, subtotal);
        }

        if (s.Modo == ModoAcumulativo)
        {
            if (s.ModoAcumulativo == AcumulativoBasica)
                return CalculateDiscount(s.TipoDescuentoReferente, s.ValorDescuentoReferente, subtotal);

            if (s.ModoAcumulativo == AcumulativoMultiplicador && s.MultiplicadorAcumulativo.HasValue)
            {
                var baseReward = CalculateDiscount(s.TipoDescuentoReferente, s.ValorDescuentoReferente, subtotal);
                var factor = (decimal)vecesUsado * s.MultiplicadorAcumulativo.Value;
                var raw = baseReward * factor;
                // Cap at the original subtotal so we never refund more than the referrer paid.
                return Math.Round(Math.Min(subtotal, Math.Max(0, raw)), 2, MidpointRounding.AwayFromZero);
            }
        }

        return 0m;
    }

    private void ValidateConfig(ReferidoConfig config)
    {
        if (config.Modo == ModoAcumulativo && string.IsNullOrWhiteSpace(config.ModoAcumulativo))
            throw new InvalidOperationException("Modo acumulativo requiere seleccionar 'basica' o 'multiplicador'.");
        if (config.Modo == ModoAcumulativo && config.ModoAcumulativo == AcumulativoMultiplicador && (!config.MultiplicadorAcumulativo.HasValue || config.MultiplicadorAcumulativo.Value <= 0))
            throw new InvalidOperationException("Multiplicador debe ser mayor que cero.");
        if (config.TipoDescuentoReferente == TipoPorcentaje && config.ValorDescuentoReferente > 100m)
            throw new InvalidOperationException("Porcentaje del referente no puede superar 100%.");
        if (config.TipoDescuentoNuevoUsuario == TipoPorcentaje && config.ValorDescuentoNuevoUsuario > 100m)
            throw new InvalidOperationException("Porcentaje del nuevo usuario no puede superar 100%.");
    }

    private static string NormalizeModo(string? m)
    {
        if (string.IsNullOrWhiteSpace(m)) throw new InvalidOperationException("Modo requerido.");
        var v = m.Trim().ToLowerInvariant();
        return v switch
        {
            ModoBasico => ModoBasico,
            ModoAcumulativo => ModoAcumulativo,
            _ => throw new InvalidOperationException("Modo no válido. Use 'basico' o 'acumulativo'.")
        };
    }

    private static string NormalizeTipo(string? t)
    {
        if (string.IsNullOrWhiteSpace(t)) throw new InvalidOperationException("Tipo de descuento requerido.");
        var v = t.Trim().ToLowerInvariant();
        return v switch
        {
            TipoPorcentaje => TipoPorcentaje,
            TipoImporte => TipoImporte,
            _ => throw new InvalidOperationException("Tipo de descuento no válido.")
        };
    }

    private static string NormalizeModoAcumulativo(string? m)
    {
        if (string.IsNullOrWhiteSpace(m)) throw new InvalidOperationException("Modo acumulativo requerido.");
        var v = m.Trim().ToLowerInvariant();
        return v switch
        {
            AcumulativoBasica => AcumulativoBasica,
            AcumulativoMultiplicador => AcumulativoMultiplicador,
            _ => throw new InvalidOperationException("Modo acumulativo no válido.")
        };
    }

    private static decimal EnsureNonNegative(decimal value, string name)
    {
        if (value < 0) throw new InvalidOperationException($"{name} no puede ser negativo.");
        return value;
    }
}

public record ResolvedReferralSettings(
    bool Activo,
    string Modo,
    string TipoDescuentoReferente,
    decimal ValorDescuentoReferente,
    bool TieneLimiteUsos,
    int? LimiteUsos,
    string? ModoAcumulativo,
    decimal? MultiplicadorAcumulativo,
    string TipoDescuentoNuevoUsuario,
    decimal ValorDescuentoNuevoUsuario
);

public record ReferidoConfigRequest(
    bool Activo,
    string Modo,
    string TipoDescuentoReferente,
    decimal ValorDescuentoReferente,
    bool TieneLimiteUsos,
    int? LimiteUsos,
    string? ModoAcumulativo,
    decimal? MultiplicadorAcumulativo,
    string TipoDescuentoNuevoUsuario,
    decimal ValorDescuentoNuevoUsuario
);

public record ReferidoInscripcionOverrideRequest(
    bool Activo,
    string Modo,
    string TipoDescuentoReferente,
    decimal ValorDescuentoReferente,
    bool TieneLimiteUsos,
    int? LimiteUsos,
    string? ModoAcumulativo,
    decimal? MultiplicadorAcumulativo,
    string TipoDescuentoNuevoUsuario,
    decimal ValorDescuentoNuevoUsuario
);

public record ReferidoInscripcionRowDto(
    int InscripcionId,
    string Nombre,
    string Email,
    string? Apellido1,
    int CodigoReferidoId,
    string Codigo,
    string CodigoNormalizado,
    bool Activo,
    string? Modo,
    string TipoDescuentoNuevoUsuario,
    decimal ValorDescuentoNuevoUsuario,
    int Usos,
    bool TieneOverride,
    DateTime CreatedAt
);

public record ReferralApplication(
    int? CodigoReferidoId,
    string? Codigo,
    string? TipoDescuento,
    decimal? Valor,
    decimal SubtotalAntesDescuento,
    decimal ImporteDescuento,
    decimal Total
)
{
    public static ReferralApplication None(decimal subtotal) => new(null, null, null, null, subtotal, 0, subtotal);
}

public record ReferidoValidationResult(
    bool Valid,
    string? Message,
    string? Codigo,
    string? TipoDescuento,
    decimal? Valor,
    decimal Subtotal,
    decimal ImporteDescuento,
    decimal Total,
    int? CodigoReferidoId
);
