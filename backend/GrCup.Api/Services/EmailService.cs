using MailKit.Net.Smtp;
using MimeKit;
using GrCup.Api.Models;
using GrCup.Api.Data;
using GrCup.Api.Models.Enums;
using Microsoft.EntityFrameworkCore;

namespace GrCup.Api.Services;

public class EmailService
{
    private readonly EmailConfigService _configService;
    private readonly GrCupDbContext _dbContext;
    private readonly ILogger<EmailService> _logger;

    public EmailService(EmailConfigService configService, GrCupDbContext dbContext, ILogger<EmailService> logger)
    {
        _configService = configService;
        _dbContext = dbContext;
        _logger = logger;
    }

    private async Task<SmtpCredentials> GetCredentialsAsync()
    {
        var config = await _configService.GetConfigAsync()
            ?? throw new InvalidOperationException("No email config found");

        string host, username, password;
        int port;

        if (config.MainProvider == EmailProvider.Gmail)
        {
            host = "smtp.gmail.com";
            username = config.GmailAddress
                ?? throw new InvalidOperationException("Gmail address not configured");
            password = config.GmailAppPassword
                ?? throw new InvalidOperationException("Gmail app password not configured");
            port = 587;
        }
        else
        {
            host = config.SmtpHost
                ?? throw new InvalidOperationException("SMTP host not configured");
            username = config.SmtpUsername
                ?? throw new InvalidOperationException("SMTP username not configured");
            password = config.SmtpPassword
                ?? throw new InvalidOperationException("SMTP password not configured");
            port = config.SmtpPort > 0 ? config.SmtpPort : 587;
        }

        var fromAddress = config.MainProvider == EmailProvider.Gmail
            ? config.GmailAddress!
            : config.SmtpEmailAddress ?? config.SmtpUsername!;

        return new SmtpCredentials(host, port, username, password, fromAddress);
    }

    private async Task SendAsync(MimeMessage message)
    {
        var creds = await GetCredentialsAsync();
        using var client = new SmtpClient();
        await client.ConnectAsync(creds.Host, creds.Port, MailKit.Security.SecureSocketOptions.StartTls);
        await client.AuthenticateAsync(creds.Username, creds.Password);
        await client.SendAsync(message);
        await client.DisconnectAsync(true);
    }

    private record SmtpCredentials(string Host, int Port, string Username, string Password, string FromAddress);

    public async Task SendInscriptionConfirmationAsync(
        string email, string firstName, string surname, string weightCategory,
        string sex, string? club, string? coach)
    {
        try
        {
            var creds = await GetCredentialsAsync();

            // Check if schedules are published and fetch matching schedules
            var schedulesPublished = await _dbContext.SchedulePublishedConfig.FirstOrDefaultAsync();
            List<Schedule>? athleteSchedules = null;

            if (schedulesPublished?.Value == true)
            {
                var sexEnum = sex == "Male" ? Sex.Male : Sex.Female;
                athleteSchedules = await _dbContext.Schedules
                    .Where(s => s.SexCategory == sexEnum && s.WeightCategory == weightCategory)
                    .OrderBy(s => s.Date)
                    .ThenBy(s => s.StartTime)
                    .ToListAsync();
            }

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress("GRStrength Cup", creds.FromAddress));
            message.To.Add(new MailboxAddress($"{firstName} {surname}", email));
            message.Subject = "Confirmación de inscripción -- II GRStrength AEP2 Regional de Valencia, Murcia y Baleares";
            message.Body = BuildConfirmationHtml(firstName, surname, weightCategory, sex, club, coach, athleteSchedules);

            await SendAsync(message);
            _logger.LogInformation("Confirmation email sent to {Email} ({FirstName} {Surname})", email, firstName, surname);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send confirmation email to {Email}", email);
        }
    }

    public async Task SendAdminNotificationAsync(
        string athleteEmail,
        string firstName,
        string surname,
        string? phone,
        string sex,
        string weightCategory,
        string? club,
        string? coach,
        decimal? totalWeight)
    {
        try
        {
            var config = await _configService.GetConfigAsync();
            if (config == null)
            {
                _logger.LogWarning("No email config found, skipping admin notification");
                return;
            }

            var adminEmail = config.MainProvider == EmailProvider.Gmail
                ? config.GmailAddress
                : config.SmtpEmailAddress;

            if (string.IsNullOrEmpty(adminEmail))
            {
                _logger.LogWarning("No admin email configured, skipping notification");
                return;
            }

            var creds = await GetCredentialsAsync();

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress("GRStrength Cup", creds.FromAddress));
            message.To.Add(new MailboxAddress("Administrador", adminEmail));
            message.Subject = $"Nueva inscripción: {firstName} {surname}";
            message.Body = BuildAdminNotificationHtml(
                athleteEmail, firstName, surname, phone, sex,
                weightCategory, club, coach, totalWeight);

            await SendAsync(message);
            _logger.LogInformation("Admin notification sent for {FirstName} {Surname}", firstName, surname);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send admin notification for {Email}", athleteEmail);
        }
    }

    private static MimeEntity BuildConfirmationHtml(
        string firstName, string surname, string weightCategory,
        string sex, string? club, string? coach, List<Schedule>? schedules)
    {
        const string eventDate = "14 y 15 de junio de 2025";
        const string eventLocation = "Pabellón Municipal de Almussafes. Avda Laura Méndez, s/n, 46440 Almussafes, Valencia";
        var sexLabel = sex == "Male" ? "Masculina" : "Femenina";
        var clubLabel = !string.IsNullOrWhiteSpace(club) ? club : "Sin club registrado";
        var coachLabel = !string.IsNullOrWhiteSpace(coach) ? coach : "Sin entrenador registrado";
        var hasSchedules = schedules != null && schedules.Count > 0;
        var schedulesHtml = hasSchedules ? BuildSchedulesSectionHtml(schedules!) : "";

        var htmlBody = $"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Confirmación de inscripción</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;" bgcolor="#F5F5F5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F5F5;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" style="padding:40px 30px 20px 30px;background-color:#1A1A1A;" bgcolor="#1A1A1A">
              <img src="https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png" alt="GRStrength Cup" width="180" style="display:block;max-width:180px;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:30px 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#1A1A1A;">
              ¡Hola, {firstName}!
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 20px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#333333;">
              Tu inscripción al <strong style="color:#1A1A1A;">II GRStrength AEP2 Regional de Valencia, Murcia y Baleares</strong> ha sido registrada correctamente.
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9F9F9;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px 8px 20px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#999999;">
                    DATOS DE INSCRIPCIÓN
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 12px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;width:40%;">
                          Nombre completo
                        </td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">
                          {firstName} {surname}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">
                          Categoría
                        </td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">
                          {sexLabel}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">
                          Categoría de peso
                        </td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">
                          {weightCategory} kg
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">
                          Club
                        </td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">
                          {clubLabel}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">
                          Entrenador
                        </td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">
                          {coachLabel}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 30px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#333333;">
              {schedulesHtml}
              {(hasSchedules ? "" : "Próximamente recibirás información sobre los horarios de tu categoría.")}
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:1px;background-color:#E5E5E5;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1A1A1A;">
              ¿Cuándo y dónde?
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#333333;">
              <strong style="color:#1A1A1A;">Fecha:</strong> {eventDate}<br>
              <strong style="color:#1A1A1A;">Lugar:</strong> {eventLocation}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px 30px 30px;border-top:1px solid #E5E5E5;text-align:center;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#999999;">
              Este es un mensaje automático. Por favor, no respondas a este correo.<br>
              Si tienes alguna consulta, puedes contactar con nosotros a través de Instagram <strong style="color:#1A1A1A;">@grstrengthclub</strong>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""";

        var textBody = $"""
¡Hola, {firstName}!

Tu inscripción al II GRStrength AEP2 Regional de Valencia, Murcia y Baleares ha sido registrada correctamente.

DATOS DE INSCRIPCIÓN
Nombre completo: {firstName} {surname}
Categoría: {sexLabel}
Categoría de peso: {weightCategory} kg
Club: {clubLabel}
Entrenador: {coachLabel}

Próximamente recibirás información sobre los horarios de tu categoría.

¿Cuándo y dónde?
Fecha: {eventDate}
Lugar: {eventLocation}

Este es un mensaje automático. Contacta con nosotros en Instagram @grstrengthclub.
""";

        return new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();
    }

    private static string BuildSchedulesSectionHtml(List<Schedule> schedules)
    {
        // Group by date
        var grouped = schedules
            .GroupBy(s => s.Date)
            .OrderBy(g => g.Key);

        var dateBlocks = new List<string>();

        foreach (var group in grouped)
        {
            var dayNames = new[] { "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo" };
            var monthNames = new[] { "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre" };
            var date = group.Key;
            var dayName = dayNames[(int)date.DayOfWeek - 1];
            var monthName = monthNames[date.Month - 1];
            var dateLabel = $"{char.ToUpper(dayName[0])}{dayName[1..]}, {date.Day} de {monthName}";

            var rows = new List<string>();
            foreach (var s in group.OrderBy(x => x.StartTime))
            {
                var sexLabel = s.SexCategory == Sex.Male ? "M" : "F";
                rows.Add($@"
                      <tr>
                        <td style=""padding:6px 8px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:13px;color:#666666;"">{s.WeightCategory} KG</td>
                        <td style=""padding:6px 8px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:13px;color:#666666;"">{sexLabel}</td>
                        <td style=""padding:6px 8px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;color:#1A1A1A;"">{s.StartTime:HH:mm} - {s.EndTime:HH:mm}</td>
                      </tr>");
            }

            dateBlocks.Add($@"
          <tr>
            <td style=""padding:0 0 8px 0;"">
              <div style=""font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#1A1A1A;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(220,20,60,0.2);padding-bottom:4px;margin-bottom:8px;"">
                {dateLabel}
              </div>
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#F9F9F9;border-radius:6px;"">
                <tr>
                  <td style=""padding:6px 8px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#999999;"">Peso</td>
                  <td style=""padding:6px 8px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#999999;"">Cat</td>
                  <td style=""padding:6px 8px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#999999;"">Horario</td>
                </tr>
                {string.Join("", rows)}
              </table>
            </td>
          </tr>");
        }

        var tableContent = string.Join("", dateBlocks);

        return $@"
              <div style=""background-color:#F9F9F9;border-radius:8px;padding:16px 20px;margin-bottom:20px;"">
                <div style=""font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1A1A1A;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;"">
                  Tu horario
                </div>
                <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                  {tableContent}
                </table>
                <div style=""margin-top:12px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#999999;"">
                  * Horarios provisionales, pueden sufrir modificaciones. <strong style=""color:#1A1A1A;"">@grstrengthclub</strong> para estar actualizado/a de cualquier cambio.
                </div>
              </div>";
    }

    private static MimeEntity BuildAdminNotificationHtml(
        string athleteEmail,
        string firstName,
        string surname,
        string? phone,
        string sex,
        string weightCategory,
        string? club,
        string? coach,
        decimal? totalWeight)
    {
        var sexLabel = sex == "Male" ? "Hombre" : "Mujer";

        // Pre-build optional HTML rows (avoiding $@"..." inside raw string)
        var phoneRow = !string.IsNullOrWhiteSpace(phone)
            ? $"<tr><td style=\"padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;\">Teléfono</td><td style=\"padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;\">{phone}</td></tr>"
            : "";
        var clubRow = !string.IsNullOrWhiteSpace(club)
            ? $"<tr><td style=\"padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;\">Club</td><td style=\"padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;\">{club}</td></tr>"
            : "";
        var coachRow = !string.IsNullOrWhiteSpace(coach)
            ? $"<tr><td style=\"padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;\">Entrenador</td><td style=\"padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;\">{coach}</td></tr>"
            : "";
        var weightRow = totalWeight.HasValue
            ? $"<tr><td style=\"padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;\">Marca</td><td style=\"padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;\">{totalWeight.Value} kg</td></tr>"
            : "";

        // Pre-build optional text lines
        var phoneText = !string.IsNullOrWhiteSpace(phone) ? $"Teléfono: {phone}" : "";
        var clubText = !string.IsNullOrWhiteSpace(club) ? $"Club: {club}" : "";
        var coachText = !string.IsNullOrWhiteSpace(coach) ? $"Entrenador: {coach}" : "";
        var weightText = totalWeight.HasValue ? $"Marca: {totalWeight.Value} kg" : "";

        var htmlBody = $"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nueva inscripción recibida</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F5F5;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" style="padding:30px 30px 20px 30px;background-color:#1A1A1A;" bgcolor="#1A1A1A">
              <img src="https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png" alt="GRStrength Cup" width="160" style="display:block;max-width:160px;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:30px 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#1A1A1A;">
              Nueva inscripción recibida
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 20px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#333333;">
              Se ha registrado un nuevo participante en el <strong>II GRStrength AEP2 Regional de Valencia, Murcia y Baleares</strong>.<br>
              <strong>Fecha:</strong> 14 y 15 de junio de 2025<br>
              <strong>Lugar:</strong> Pabellón Municipal de Almussafes. Avda Laura Méndez, s/n, 46440 Almussafes, Valencia
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9F9F9;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px 8px 20px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#999999;">
                    DATOS DEL PARTICIPANTE
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 12px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;width:40%;">Nombre completo</td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">{firstName} {surname}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">Email</td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">{athleteEmail}</td>
                      </tr>
                      {phoneRow}
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">Sexo</td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">{sexLabel}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">Categoría</td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">{weightCategory} kg</td>
                      </tr>
                      {clubRow}
                      {coachRow}
                      {weightRow}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 30px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#999999;border-top:1px solid #E5E5E5;padding-top:20px;">
              Este es un mensaje automático del sistema de inscripciones de GRStrength Cup.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""";

        var textBody = $"""
Nueva inscripción recibida

Se ha registrado un nuevo participante en el II GRStrength AEP2 Regional de Valencia, Murcia y Baleares.
Fecha: 14 y 15 de junio de 2025
Lugar: Pabellón Municipal de Almussafes. Avda Laura Méndez, s/n, 46440 Almussafes, Valencia

DATOS DEL PARTICIPANTE
Nombre completo: {firstName} {surname}
Email: {athleteEmail}
{phoneText}
Sexo: {sexLabel}
Categoría: {weightCategory} kg
{clubText}
{coachText}
{weightText}

---
Mensaje automático del sistema de inscripciones de GRStrength Cup.
""";

        return new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();
    }

    public async Task SendRaffleConfirmationAsync(
        string email,
        string firstName,
        string surname,
        int ticketCount,
        decimal totalPaid,
        string? instagram)
    {
        try
        {
            var creds = await GetCredentialsAsync();

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress("GRStrength Cup", creds.FromAddress));
            message.To.Add(new MailboxAddress($"{firstName} {surname}", email));
            message.Subject = "¡Estás dentro! Confirmación de participación -- Sorteo GRStrength Cup 2026";
            message.Body = BuildRaffleConfirmationHtml(firstName, surname, ticketCount, totalPaid, instagram);

            await SendAsync(message);
            _logger.LogInformation("Raffle confirmation email sent to {Email} ({TicketCount} tickets)", email, ticketCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send raffle confirmation email to {Email}", email);
        }
    }

    private static MimeEntity BuildRaffleConfirmationHtml(
        string firstName,
        string surname,
        int ticketCount,
        decimal totalPaid,
        string? instagram)
    {
        var fullName = $"{firstName} {surname}".Trim();

        var htmlBody = $"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>¡Estás dentro! -- Sorteo GRStrength Cup 2026</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;" bgcolor="#F5F5F5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F5F5;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" style="padding:40px 30px 20px 30px;background-color:#1A1A1A;" bgcolor="#1A1A1A">
              <img src="https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png" alt="GRStrength Cup" width="180" style="display:block;max-width:180px;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:30px 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#1A1A1A;">
              ¡Hola, {firstName}!
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:10px 30px 20px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:36px;font-weight:700;color:#DC2626;">
              ¡ESTÁS DENTRO! 🎉
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 20px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#333333;">
              Tu participación en el <strong style="color:#1A1A1A;">Sorteo GRStrength Cup 2026</strong> ha sido confirmada correctamente.
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9F9F9;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px 8px 20px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#999999;">
                    DETALLES DE TU PARTICIPACIÓN
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 12px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;width:40%;">Nombre completo</td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">{fullName}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">Boletos</td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">{ticketCount}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">Total pagado</td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#DC2626;">€{totalPaid:F2}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;color:#666666;">Premio</td>
                        <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">Cinturón SBD</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 30px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#333333;">
              El ganador será anunciado el <strong style="color:#1A1A1A;">último día de la competición</strong> tras la entrega de premios de la última categoría. Se utilizará selección ponderada por boleto.
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 20px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:1px;background-color:#E5E5E5;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1A1A1A;">
              ¿Qué hacer ahora?
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#333333;">
              <strong style="color:#1A1A1A;">1.</strong> ¡Mantente atento/a! El ganador se anunciará el día de la competición.<br>
              <strong style="color:#1A1A1A;">2.</strong> Síguenos en Instagram <strong style="color:#1A1A1A;">@grstrengthclub</strong> para no perderte ninguna actualización.<br>
              <strong style="color:#1A1A1A;">3.</strong> Cuantos más boletos compres, más posibilidades tienes de ganar.
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px 30px 30px;border-top:1px solid #E5E5E5;text-align:center;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#999999;">
              Este es un mensaje automático. Por favor, no respondas a este correo.<br>
              Si tienes alguna consulta, puedes contactar con nosotros a través de Instagram <strong style="color:#1A1A1A;">@grstrengthclub</strong>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""";

        var textBody = $"""
¡Hola, {firstName}!

¡ESTÁS DENTRO! 🎉

Tu participación en el Sorteo GRStrength Cup 2026 ha sido confirmada correctamente.

DETALLES DE TU PARTICIPACIÓN
Nombre completo: {fullName}
Boletos: {ticketCount}
Total pagado: €{totalPaid:F2}
Premio: Cinturón SBD

El ganador será anunciado el último día de la competición tras la entrega de premios de la última categoría.

¿Qué hacer ahora?
1. ¡Mantente atento/a! El ganador se anunciará el día de la competición.
2. Síguenos en Instagram @grstrengthclub para no perderte ninguna actualización.
3. Cuantos más boletos compres, más posibilidades tienes de ganar.

Este es un mensaje automático. Contacta con nosotros en Instagram @grstrengthclub.
""";

        return new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();
    }
}
