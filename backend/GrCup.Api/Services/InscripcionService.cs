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
    private readonly GrCupDbContext _context;
    private readonly CompeticionService _competicionService;
    private readonly BunnyCdnService _bunnyCdn;

    public InscripcionService(GrCupDbContext context, CompeticionService competicionService, BunnyCdnService bunnyCdn)
    {
        _context = context;
        _competicionService = competicionService;
        _bunnyCdn = bunnyCdn;
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

        // Calculate total (base price + optional peak program)
        var totalPagado = config.PrecioBase;
        if (request.PeakProgram)
            totalPagado += config.PrecioPeakProgram;

        var inscripcion = new Inscripcion
        {
            CompeticionId = competicionId,
            Nombre = request.Nombre.Trim(),
            Email = request.Email.ToLower().Trim(),
            Instagram = request.Instagram?.Trim(),
            Telefono = request.Telefono?.Trim(),
            Sexo = request.Sexo ?? "masculino",
            CategoriaPeso = request.CategoriaPeso ?? "",
            QuiereHandler = request.QuiereHandler,

            Experiencia = request.Experiencia,
            TieneEntrenador = request.TieneEntrenador,
            QuierePeakProgram = request.PeakProgram,
            PagoConfirmado = false, // Will be confirmed via QR scan or manual
            ParticipacionConfirmada = false,
            TotalPagado = totalPagado,
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
            inscripcion.Experiencia,
            inscripcion.QuiereHandler,
            inscripcion.QuierePeakProgram,
            inscripcion.PagoConfirmado,
            inscripcion.ParticipacionConfirmada,
            inscripcion.TotalPagado,
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
        string? experiencia = null)
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
            inscripcion.PaymentMethod = request.PaymentMethod;

        if (request.Telefono != null)
            inscripcion.Telefono = request.Telefono;

        if (request.Sexo != null)
            inscripcion.Sexo = request.Sexo;

        if (request.CategoriaPeso != null)
            inscripcion.CategoriaPeso = request.CategoriaPeso;

        if (request.QuiereHandler.HasValue)
            inscripcion.QuiereHandler = request.QuiereHandler.Value;

        if (request.ParticipacionConfirmada.HasValue)
            inscripcion.ParticipacionConfirmada = request.ParticipacionConfirmada.Value;

        if (request.Notas != null)
            inscripcion.Notas = request.Notas;

        inscripcion.UpdatedAt = DateTime.UtcNow;

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
    /// Gets statistics for a competition
    /// </summary>
    public async Task<InscripcionStats> GetStatsAsync(int competicionId)
    {
        var inscripciones = await _context.Inscripciones
            .Where(i => i.CompeticionId == competicionId)
            .ToListAsync();

        return new InscripcionStats(
            Total: inscripciones.Count,
            Pagados: inscripciones.Count(i => i.PagoConfirmado),
            Pendientes: inscripciones.Count(i => !i.PagoConfirmado),
            Checkins: inscripciones.Count(i => i.CheckinAt.HasValue),
            Revenue: inscripciones.Where(i => i.PagoConfirmado).Sum(i => i.TotalPagado),
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
    /// Exports inscriptions to CSV
    /// </summary>
    public async Task<string> ExportToCsvAsync(int competicionId)
    {
        var inscripciones = await _context.Inscripciones
            .Where(i => i.CompeticionId == competicionId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();

        var csv = new StringBuilder();
        csv.AppendLine("ID,Nombre,Email,Instagram,Categoría,Experiencia,Handler,PeakProgram,Pagado,Total (€),Check-in,Fecha");

        foreach (var i in inscripciones)
        {
            csv.AppendLine($"{i.Id},\"{i.Nombre}\",\"{i.Email}\",\"{i.Instagram ?? ""}\",{i.CategoriaPeso},{i.Experiencia},{(i.QuiereHandler ? "Sí" : "No")},{(i.QuierePeakProgram ? "Sí" : "No")},{(i.PagoConfirmado ? "Sí" : "No")},{i.TotalPagado},{(i.CheckinAt.HasValue ? i.CheckinAt.Value.ToString("yyyy-MM-dd HH:mm") : "No")},{i.CreatedAt:yyyy-MM-dd HH:mm:ss}");
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

        // Sentadilla
        results.Add(await UpsertLiftAttempt(inscripcionId, "Squat", 1, sentadilla1, updatedBy, now));
        results.Add(await UpsertLiftAttempt(inscripcionId, "Squat", 2, sentadilla2, updatedBy, now));
        results.Add(await UpsertLiftAttempt(inscripcionId, "Squat", 3, sentadilla3, updatedBy, now));

        // Press de Banca
        results.Add(await UpsertLiftAttempt(inscripcionId, "Bench", 1, banca1, updatedBy, now));
        results.Add(await UpsertLiftAttempt(inscripcionId, "Bench", 2, banca2, updatedBy, now));
        results.Add(await UpsertLiftAttempt(inscripcionId, "Bench", 3, banca3, updatedBy, now));

        // Peso Muerto
        results.Add(await UpsertLiftAttempt(inscripcionId, "Deadlift", 1, pesoMuerto1, updatedBy, now));
        results.Add(await UpsertLiftAttempt(inscripcionId, "Deadlift", 2, pesoMuerto2, updatedBy, now));
        results.Add(await UpsertLiftAttempt(inscripcionId, "Deadlift", 3, pesoMuerto3, updatedBy, now));

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
        return await _context.LiftEntriesInscripcion
            .Where(l => l.InscripcionId == inscripcionId)
            .OrderBy(l => l.LiftType)
            .ThenBy(l => l.AttemptNumber)
            .ToListAsync();
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
    bool QuiereHandler,

    string Experiencia,
    bool TieneEntrenador,
    bool PeakProgram,
    bool AceptaTerminos
);

public record UpdateInscripcionRequest(
    string? Nombre = null,
    string? Email = null,
    string? Instagram = null,
    string? Telefono = null,
    string? Sexo = null,
    string? CategoriaPeso = null,
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
    string Experiencia,
    bool QuiereHandler,
    bool QuierePeakProgram,
    bool PagoConfirmado,
    bool ParticipacionConfirmada,
    decimal TotalPagado,
    DateTime? CheckinAt,
    string CompeticionNombre,
    List<object>? Horarios
);

public record InscripcionStats(
    int Total,
    int Pagados,
    int Pendientes,
    int Checkins,
    decimal Revenue,
    Dictionary<string, int> PorExperiencia,
    int ConEntrenador,
    int SinEntrenador
);
