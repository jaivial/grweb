using MailKit.Net.Smtp;
using MimeKit;
using System.Net;
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

    private async Task<SmtpCredentials> GetCredentialsAsync(int? competicionId = null)
    {
        var config = await _configService.GetConfigAsync(competicionId)
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

    private async Task SendAsync(MimeMessage message, int? competicionId = null)
    {
        var creds = await GetCredentialsAsync(competicionId);
        using var client = new SmtpClient();
        await client.ConnectAsync(creds.Host, creds.Port, MailKit.Security.SecureSocketOptions.StartTls);
        await client.AuthenticateAsync(creds.Username, creds.Password);
        await client.SendAsync(message);
        await client.DisconnectAsync(true);
    }

    private record SmtpCredentials(string Host, int Port, string Username, string Password, string FromAddress);

    private static string GetBackofficeLoginUrl()
    {
        var baseUrl = Environment.GetEnvironmentVariable("website_frontend_url")
            ?? "https://fer-backoffice.menustudioai.com";

        if (!baseUrl.StartsWith("http://") && !baseUrl.StartsWith("https://"))
            baseUrl = $"https://{baseUrl}";

        return $"{baseUrl.TrimEnd('/')}/backoffice/login";
    }

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
        decimal? totalWeight,
        int? competicionId = null)
    {
        try
        {
            var config = await _configService.GetConfigAsync(competicionId);
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

            var creds = await GetCredentialsAsync(competicionId);

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress("GRStrength Cup", creds.FromAddress));
            message.To.Add(new MailboxAddress("Administrador", adminEmail));
            message.Subject = $"Nueva inscripción: {firstName} {surname}";
            message.Body = BuildAdminNotificationHtml(
                athleteEmail, firstName, surname, phone, sex,
                weightCategory, club, coach, totalWeight);

            await SendAsync(message, competicionId);
            _logger.LogInformation("Admin notification sent for {FirstName} {Surname}", firstName, surname);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send admin notification for {Email}", athleteEmail);
        }
    }

    public async Task SendUserInvitationAsync(
        string email,
        string nombre,
        string tempPassword,
        string competicionNombre,
        int competicionId)
    {
        var creds = await GetCredentialsAsync(competicionId);
        var loginUrl = GetBackofficeLoginUrl();

        var safeNombre = WebUtility.HtmlEncode(nombre);
        var safeCompeticionNombre = WebUtility.HtmlEncode(competicionNombre);
        var safeEmail = WebUtility.HtmlEncode(email);
        var safePassword = WebUtility.HtmlEncode(tempPassword);

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(safeCompeticionNombre, creds.FromAddress));
        message.To.Add(new MailboxAddress(safeNombre, email));
        message.Subject = $"Invitacion al equipo de {competicionNombre}";
        message.Body = BuildUserInvitationEmailHtml(
            safeNombre, safeCompeticionNombre, safeEmail, safePassword, loginUrl, nombre, email, tempPassword, competicionNombre);

        await SendAsync(message, competicionId);
        _logger.LogInformation("Backoffice invitation sent to {Email} for competition {CompeticionId}", email, competicionId);
    }

    public async Task SendWorkspaceMemberRemovedAsync(
        string email,
        string nombre,
        string competicionNombre,
        int competicionId)
    {
        var creds = await GetCredentialsAsync(competicionId);
        var safeNombre = WebUtility.HtmlEncode(nombre);
        var safeCompeticionNombre = WebUtility.HtmlEncode(competicionNombre);

        var htmlBody = $"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceso retirado</title>
</head>
<body style="margin:0;padding:0;background-color:#0f1115;" bgcolor="#0f1115">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f1115;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#171a21;border:1px solid #2a2f3a;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 30px;border-bottom:1px solid #2a2f3a;">
              <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#8b949e;">Workspace actualizado</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#f4f4f5;">{safeCompeticionNombre}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="margin:0 0 14px 0;font-size:15px;line-height:24px;color:#d4d4d8;">Hola {safeNombre},</p>
              <p style="margin:0 0 18px 0;font-size:15px;line-height:24px;color:#d4d4d8;">
                Tu acceso al workspace <strong>{safeCompeticionNombre}</strong> ha sido retirado por un administrador.
              </p>
              <p style="margin:0;font-size:13px;line-height:22px;color:#8b949e;">
                Si crees que esto es un error, contacta con el administrador de la competicion.
              </p>
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
Hola {nombre},

Tu acceso al workspace {competicionNombre} ha sido retirado por un administrador.

Si crees que esto es un error, contacta con el administrador de la competicion.
""";

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(competicionNombre, creds.FromAddress));
        message.To.Add(new MailboxAddress(nombre, email));
        message.Subject = $"Acceso retirado de {competicionNombre}";
        message.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();

        await SendAsync(message, competicionId);
        _logger.LogInformation("Workspace removal email sent to {Email} for competition {CompeticionId}", email, competicionId);
    }

    private static MimeEntity BuildUserInvitationEmailHtml(
        string safeNombre,
        string safeCompeticionNombre,
        string safeEmail,
        string safePassword,
        string loginUrl,
        string plainNombre,
        string plainEmail,
        string plainPassword,
        string plainCompeticionNombre)
    {
        var safeLoginUrl = WebUtility.HtmlEncode(loginUrl);

        var htmlBody = $"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitacion al Backoffice</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;" bgcolor="#f4f5f7">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#151515;" bgcolor="#151515">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:28px 32px 24px 32px;text-align:center;">
                    <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;">Invitacion al equipo</p>
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">{safeCompeticionNombre}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#9ca3af;">Hola,</p>
              <h2 style="margin:0 0 16px 0;font-size:26px;font-weight:700;color:#111827;">{safeNombre}</h2>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#374151;">
                Has sido invitado a formar parte del equipo de <strong>{safeCompeticionNombre}</strong> en el backoffice.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:16px 20px 8px 20px;">
                    <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Tus credenciales</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:#6b7280;width:40%;">Email</td>
                        <td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">{safeEmail}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:#6b7280;">Contrasena temporal</td>
                        <td style="padding:4px 0;font-size:14px;font-weight:700;color:#111827;font-family:Consolas,Monaco,'Courier New',monospace;letter-spacing:1px;">{safePassword}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <p style="margin:0 0 20px 0;font-size:14px;line-height:22px;color:#374151;">
                Por seguridad, te recomendamos cambiar tu contrasena inmediatamente despues de iniciar sesion.
              </p>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#151515;border-radius:8px;" bgcolor="#151515">
                    <a href="{safeLoginUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:0.3px;">Iniciar sesion en el backoffice</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:1px;background-color:#e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#6b7280;">
                Si no esperabas esta invitacion, puedes ignorar este correo. Tu cuenta ya existe y esta activa.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">Este es un mensaje automatico del sistema de backoffice de {safeCompeticionNombre}.</p>
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
¡Hola {plainNombre}!

Has sido invitado al equipo de {plainCompeticionNombre} en el backoffice.

TUS CREDENCIALES
Email: {plainEmail}
Contrasena temporal: {plainPassword}

Por seguridad, cambia tu contrasena inmediatamente despues de iniciar sesion.

Inicia sesion en: {loginUrl}

Si no esperabas esta invitacion, puedes ignorar este correo. Tu cuenta ya existe y esta activa.

---
Mensaje automatico del sistema de backoffice de {plainCompeticionNombre}.
""";

        return new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();
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
        string? instagram,
        int? competicionId = null)
    {
        try
        {
            var creds = await GetCredentialsAsync(competicionId);

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress("GRStrength Cup", creds.FromAddress));
            message.To.Add(new MailboxAddress($"{firstName} {surname}", email));
            message.Subject = "¡Estás dentro! Confirmación de participación -- Sorteo GRStrength Cup 2026";
            message.Body = BuildRaffleConfirmationHtml(firstName, surname, ticketCount, totalPaid, instagram);

            await SendAsync(message, competicionId);
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

    /// <summary>
    /// Sends FER inscription confirmation email with embedded QR code and payment info
    /// </summary>
    public async Task SendFerConfirmationAsync(
        Inscripcion inscripcion, Competicion competicion, EventoConfig config,
        byte[]? qrCodeImage, string? qrCode, string? onlinePaymentUrl = null)
    {
        try
        {
            var creds = await GetCredentialsAsync(competicion.Id);

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress("FER CUP II", creds.FromAddress));
            message.To.Add(new MailboxAddress(inscripcion.Nombre, inscripcion.Email));
            message.Subject = $"¡Inscripción confirmada! — FER CUP II";

            var bodyBuilder = new BodyBuilder();

            // ── Helpers ──
            var sexLabel = inscripcion.Sexo == "masculino" ? "Masculino" : "Femenino";
            var expLabel = inscripcion.Experiencia switch
            {
                "rookie" => "Rookie",
                "principiante" => "Principiante",
                "intermedio" => "Intermedio",
                "avanzado" => "Avanzado",
                _ => inscripcion.Experiencia
            };
            var handlerText = inscripcion.QuiereHandler ? "Sí" : "No";
            var modalidadLabel = InscripcionService.GetModalidadLabel(inscripcion.Modalidad);
            var peakText = inscripcion.QuierePeakProgram
                ? $"Sí ({(config.PrecioPeakProgram):F2} EUR){(string.IsNullOrEmpty(config.FechaLimitePeakProgram) ? "" : $" — Fecha límite: {config.FechaLimitePeakProgram}")}"
                : "No";
            var instagramText = !string.IsNullOrWhiteSpace(inscripcion.Instagram) ? inscripcion.Instagram : "—";
            var telefonoText = !string.IsNullOrWhiteSpace(inscripcion.Telefono) ? inscripcion.Telefono : "—";
            // Handler is free — only base + peak program
            var precioTotal = config.PrecioBase + (inscripcion.QuierePeakProgram ? config.PrecioPeakProgram : 0);
            var paymentMethodText = inscripcion.PaymentMethod switch
            {
                InscripcionService.PaymentMethodStripe => "Tarjeta (Stripe)",
                InscripcionService.PaymentMethodTransferencia => "Transferencia bancaria",
                InscripcionService.PaymentMethodCupon => "Cupón de descuento",
                _ => "Efectivo"
            };
            var subtotalTotal = inscripcion.SubtotalAntesDescuento > 0
                ? inscripcion.SubtotalAntesDescuento
                : config.PrecioBase + (inscripcion.QuierePeakProgram ? config.PrecioPeakProgram : 0);
            var descuentoTotal = inscripcion.ImporteDescuento;
            var totalFinal = inscripcion.TotalPagado;
            var couponRowsHtml = !string.IsNullOrWhiteSpace(inscripcion.CodigoCupon)
                ? $@"<tr><td style=""font-size:13px;color:#8B949E;padding-top:6px;"" colspan=""2"">Cupón aplicado: <strong style=""color:#E6EDF3;"">{WebUtility.HtmlEncode(inscripcion.CodigoCupon)}</strong></td></tr><tr><td style=""font-size:13px;color:#8B949E;padding-top:6px;"" colspan=""2"">Descuento: <strong style=""color:#3FB950;"">-{descuentoTotal:F2} EUR</strong></td></tr>"
                : "";
            var couponText = !string.IsNullOrWhiteSpace(inscripcion.CodigoCupon)
                ? $"\nCupón aplicado: {inscripcion.CodigoCupon}\nDescuento: -{descuentoTotal:F2} EUR"
                : "";
            var isPaid = inscripcion.PagoConfirmado;
            var onlinePaymentButtonHtml = !string.IsNullOrWhiteSpace(onlinePaymentUrl)
                ? $@"<table cellpadding=""0"" cellspacing=""0"" border=""0"" style=""margin-top:14px;""><tr><td style=""background-color:#3FB950;border-radius:10px;"" bgcolor=""#3FB950""><a href=""{WebUtility.HtmlEncode(onlinePaymentUrl)}"" target=""_blank"" style=""display:inline-block;padding:13px 20px;font-size:14px;font-weight:800;color:#0D1117;text-decoration:none;letter-spacing:0.2px;"">Pagar online ahora</a></td></tr></table>"
                : "";
            var paymentIntroText = isPaid
                ? "El pago ha sido confirmado."
                : "El pago está pendiente y debe completarse en efectivo en la mesa de registro el día del evento.";
            var paymentInstructionsHtml = isPaid
                ? @"<p style=""margin:0;font-size:13px;line-height:20px;color:#E6EDF3;""><strong style=""color:#3FB950;"">Pago confirmado.</strong> No tienes que pagar nada más el día del evento.</p>"
                : $@"<p style=""margin:0 0 6px 0;font-size:13px;line-height:20px;color:#E6EDF3;""><strong style=""color:#F85149;"">Pago pendiente.</strong> Debes realizar el pago en efectivo en la mesa de registro el día de la competición.</p><p style=""margin:0;font-size:13px;line-height:20px;color:#8B949E;"">Tu inscripción online reserva tu plaza, pero solo quedará finalizada cuando el pago sea confirmado.</p>{onlinePaymentButtonHtml}";
            var paymentInstructionsText = isPaid
                ? "Pago confirmado. No tienes que pagar nada más el día del evento."
                : $"Pago pendiente. Debes realizar el pago en efectivo en la mesa de registro el día de la competición. Tu inscripción online reserva tu plaza, pero solo quedará finalizada cuando el pago sea confirmado.{(string.IsNullOrWhiteSpace(onlinePaymentUrl) ? "" : $"\n\nSi prefieres pagar online ahora: {onlinePaymentUrl}")}";
            var paymentNextStep = isPaid
                ? "Acude a la mesa de registro el día del evento con el QR (no hace falta pagar nada más)."
                : "Acude a la mesa de registro el día de la competición con el QR y el pago en efectivo.";

            // ── Build HTML body ──
            var html = $@"<!DOCTYPE html>
<html lang=""es"">
<head>
  <meta charset=""utf-8"">
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
  <title>Inscripción confirmada — FER CUP II</title>
</head>
<body style=""margin:0;padding:0;background-color:#0D1117;font-family:'Segoe UI',Arial,Helvetica,sans-serif;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#0D1117;"">
    <tr>
      <td align=""center"" style=""padding:24px 12px;"">
        <table role=""presentation"" width=""600"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""max-width:600px;width:100%;background-color:#161B22;border-radius:16px;overflow:hidden;border:1px solid #30363D;"">

          <tr>
            <td align=""center"" style=""padding:48px 32px 24px 32px;background:linear-gradient(135deg,#1a1a2e 0%,#16213E 50%,#0F3460 100%);"" bgcolor=""#1a1a2e"">
              <h1 style=""color:#FFFFFF;margin:0 0 8px 0;font-size:32px;font-weight:800;letter-spacing:1px;text-transform:uppercase;"">
                FER CUP II
              </h1>
              <p style=""color:#B0B0C0;margin:0 0 4px 0;font-size:14px;letter-spacing:2px;text-transform:uppercase;"">
                Presentado por
              </p>
              <img src=""https://jaimedigitalstudio.b-cdn.net/fer/media/icons/ferwebicons/Gemini_Generated_Image_ocrwoeocrwoeocrw-removebg-preview.webp""
                   alt=""FER CUP II""
                   width=""120""
                   style=""display:inline-block;max-width:120px;margin-top:8px;"" />
            </td>
          </tr>

          <tr>
            <td style=""padding:32px 32px 8px 32px;"">
              <h2 style=""color:#E6EDF3;margin:0 0 6px 0;font-size:22px;font-weight:700;"">
                ¡Hola, {inscripcion.Nombre}!
              </h2>
              <p style=""color:#8B949E;margin:0;font-size:15px;line-height:24px;"">
                Tu inscripción para la <strong style=""color:#E6EDF3;"">FER CUP II</strong> ha sido registrada correctamente. 
                {paymentIntroText}
              </p>
            </td>
          </tr>

          <tr>
            <td style=""padding:16px 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:16px 20px 8px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      DATOS DE INSCRIPCIÓN
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style=""padding:0 20px 12px 20px;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;width:45%;"">Nombre completo</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{inscripcion.Nombre}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Email</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{inscripcion.Email}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Teléfono</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{telefonoText}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Instagram</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{instagramText}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Sexo</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{sexLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Categoría de peso</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{inscripcion.CategoriaPeso}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Modalidad</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{modalidadLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Experiencia</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{expLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Handler GR Strength</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{handlerText}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">GRS Peak Program</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{peakText}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:0 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:16px 20px;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                      <tr>
                        <td style=""font-size:14px;font-weight:700;color:#E6EDF3;"">
                          Pago realizado:
                        </td>
                        <td style=""font-size:14px;font-weight:800;text-align:right;"">
                          <span style=""color:{(inscripcion.PagoConfirmado ? "#3FB950" : "#F85149")};"">
                            {(inscripcion.PagoConfirmado ? "SÍ" : "NO")}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style=""font-size:13px;color:#8B949E;padding-top:6px;"" colspan=""2"">
                          Método de pago: <strong style=""color:#E6EDF3;"">{paymentMethodText}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style=""font-size:13px;color:#8B949E;padding-top:6px;"" colspan=""2"">
                          Subtotal: <strong style=""color:#E6EDF3;"">{subtotalTotal:F2} EUR</strong>
                        </td>
                      </tr>
                      {couponRowsHtml}
                      <tr>
                        <td style=""font-size:13px;color:#8B949E;padding-top:6px;"" colspan=""2"">
                          Total a pagar: <strong style=""color:#E6EDF3;"">{totalFinal:F2} EUR</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:12px 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#2D1B2E;border-radius:12px;border:1px solid rgba(248,81,73,0.25);"">
                <tr>
                  <td style=""padding:16px 20px;"">
                    <p style=""margin:0 0 8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#F85149;"">
                      COMO PAGAR
                    </p>
                    {paymentInstructionsHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          {(qrCodeImage != null && qrCodeImage.Length > 0 ? $@"
          <tr>
            <td style=""padding:16px 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background:linear-gradient(135deg,#1C2128 0%,#1a1a2e 100%);border-radius:16px;border:2px solid rgba(88,166,255,0.2);"">
                <tr>
                  <td align=""center"" style=""padding:20px 20px 8px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      CODIGO QR
                    </p>
                    <p style=""margin:4px 0 0 0;font-size:12px;color:#8B949E;"">
                      Preséntalo en la mesa de registro el día del evento
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align=""center"" style=""padding:16px 20px;"">
                    <div style=""display:inline-block;background-color:#FFFFFF;border-radius:12px;padding:12px;"">
                      <img src=""cid:qr_{inscripcion.Id}""
                           alt=""Código QR""
                           width=""280""
                           style=""display:block;width:280px;height:280px;border-radius:8px;"" />
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>" : "")}

          <tr>
            <td style=""padding:8px 32px 0 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:16px 20px 8px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      DETALLES DEL EVENTO
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style=""padding:0 20px 12px 20px;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;width:45%;"">Fecha</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{competicion.Fecha:dddd, dd 'de' MMMM 'de' yyyy}</td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;"">Lugar</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{competicion.Lugar}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:12px 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:16px 20px 8px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      PROXIMOS PASOS
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style=""padding:0 20px 12px 20px;"">
                    <ol style=""margin:0;padding-left:20px;font-size:13px;line-height:22px;color:#8B949E;"">
                      <li style=""margin-bottom:6px;"">Guarda este email o tu código QR para presentarlo el día del evento.</li>
                      <li style=""margin-bottom:6px;"">{paymentNextStep}</li>
                      <li style=""margin-bottom:6px;"">
                        {(inscripcion.QuiereHandler ? "Nosotros nos encargamos del handler de forma gratuita." : "Si necesitas handler, infórmanos el día del evento.")}
                      </li>
                      <li>¡Prepárate para dar lo mejor de ti en la plataforma!</li>
                    </ol>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:24px 32px;border-top:1px solid #30363D;text-align:center;"">
              <p style=""margin:0 0 4px 0;font-size:12px;color:#484F58;"">
                Este es un mensaje automático. No respondas a este correo.
              </p>
              <p style=""margin:0;font-size:12px;color:#484F58;"">
                Síguenos en Instagram: <a href=""https://www.instagram.com/grstrengthclub/"" style=""color:#58A6FF;text-decoration:underline;"">@grstrengthclub</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>";

            bodyBuilder.HtmlBody = html;

            // ── Text body ──
            var textBody = $@"¡Hola, {inscripcion.Nombre}!

Tu inscripción para la FER CUP II ha sido registrada correctamente.

DATOS DE INSCRIPCIÓN
Nombre completo: {inscripcion.Nombre}
Email: {inscripcion.Email}
Teléfono: {telefonoText}
Instagram: {instagramText}
Sexo: {sexLabel}
Categoría de peso: {inscripcion.CategoriaPeso}
Modalidad: {modalidadLabel}
Experiencia: {expLabel}
Handler GR Strength: {handlerText}
GRS Peak Program: {peakText}

{(inscripcion.PagoConfirmado ? "Pago realizado: SÍ" : "Pago realizado: NO")}
Método de pago: {paymentMethodText}
Subtotal: {subtotalTotal:F2} EUR{couponText}
Total a pagar: {totalFinal:F2} EUR

COMO PAGAR
{paymentInstructionsText}

{(qrCode != null ? $@"CODIGO QR
Presenta tu código QR en la mesa de registro el día del evento.
Código: {qrCode}" : "")}

DETALLES DEL EVENTO
Fecha: {competicion.Fecha:dddd, dd 'de' MMMM 'de' yyyy}
Lugar: {competicion.Lugar}

PROXIMOS PASOS
1. Guarda tu código QR para presentarlo el día del evento.
2. {paymentNextStep}
3. {(inscripcion.QuiereHandler ? "Nosotros nos encargamos del handler de forma gratuita." : "Si necesitas handler, infórmanos el día del evento.")}
4. ¡Prepárate para dar lo mejor de ti en la plataforma!

---
Este es un mensaje automático. Síguenos en Instagram: @grstrengthclub (https://www.instagram.com/grstrengthclub/)
";
            bodyBuilder.TextBody = textBody;

            // ── Embed QR code in the body (not as attachment) ──
            if (qrCodeImage != null && qrCodeImage.Length > 0)
            {
                var mimeType = new MimeKit.ContentType("image", "png");
                var qrResource = bodyBuilder.LinkedResources.Add("qr_" + inscripcion.Id + ".png", new MemoryStream(qrCodeImage), mimeType);
                qrResource.ContentId = "qr_" + inscripcion.Id;
            }

            message.Body = bodyBuilder.ToMessageBody();
            await SendAsync(message, competicion.Id);
            _logger.LogInformation("FER confirmation email sent to {Email} for competicion {CompeticionId} (QR embedded)", inscripcion.Email, competicion.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send FER confirmation email to {Email}", inscripcion.Email);
        }
    }

    /// <summary>
    /// Sends FER admin notification for new inscription
    /// </summary>
    public async Task SendFerAdminNotificationAsync(Inscripcion inscripcion, Competicion competicion)
    {
        try
        {
            var config = await _configService.GetConfigAsync(competicion.Id);
            if (config == null)
            {
                _logger.LogWarning("No email config found for competicion {CompeticionId}, skipping admin notification", competicion.Id);
                return;
            }

            var adminEmail = config.MainProvider == EmailProvider.Gmail
                ? config.GmailAddress
                : config.SmtpEmailAddress;

            if (string.IsNullOrEmpty(adminEmail))
            {
                _logger.LogWarning("No admin email configured for competicion {CompeticionId}", competicion.Id);
                return;
            }

            var creds = await GetCredentialsAsync(competicion.Id);

            var sexLabel = inscripcion.Sexo == "masculino" ? "Masculino" : "Femenino";
            var expLabel = inscripcion.Experiencia switch
            {
                "rookie" => "Rookie",
                "principiante" => "Principiante",
                "intermedio" => "Intermedio",
                "avanzado" => "Avanzado",
                _ => inscripcion.Experiencia
            };
            var handlerText = inscripcion.QuiereHandler ? "Sí" : "No";
            var modalidadLabel = InscripcionService.GetModalidadLabel(inscripcion.Modalidad);
            var peakText = inscripcion.QuierePeakProgram ? "Sí" : "No";
            var instagramText = !string.IsNullOrWhiteSpace(inscripcion.Instagram) ? inscripcion.Instagram : "—";
            var telefonoText = !string.IsNullOrWhiteSpace(inscripcion.Telefono) ? inscripcion.Telefono : "—";
            var paymentMethodText = inscripcion.PaymentMethod switch
            {
                "efectivo" => "Efectivo (presencial)",
                "transferencia" => "Transferencia bancaria",
                "stripe" => "Tarjeta (Stripe)",
                "cupon" => "Cupón de descuento",
                _ => inscripcion.PaymentMethod ?? "Efectivo (pendiente)"
            };

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(competicion.Nombre, creds.FromAddress));
            message.To.Add(new MailboxAddress("Administrador", adminEmail));
            message.Subject = $"Nueva inscripción FER: {inscripcion.Nombre}";
            message.Body = new BodyBuilder
            {
                HtmlBody = $@"<!DOCTYPE html>
<html lang=""es"">
<head>
  <meta charset=""utf-8"">
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
  <title>Nueva inscripción — {competicion.Nombre}</title>
</head>
<body style=""margin:0;padding:0;background-color:#0D1117;font-family:'Segoe UI',Arial,Helvetica,sans-serif;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#0D1117;"">
    <tr>
      <td align=""center"" style=""padding:24px 12px;"">
        <table role=""presentation"" width=""600"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""max-width:600px;width:100%;background-color:#161B22;border-radius:16px;overflow:hidden;border:1px solid #30363D;"">

          <tr>
            <td align=""center"" style=""padding:40px 32px 20px 32px;background:linear-gradient(135deg,#1a1a2e 0%,#16213E 50%,#0F3460 100%);"" bgcolor=""#1a1a2e"">
              <img src=""https://jaimedigitalstudio.b-cdn.net/fer/media/icons/ferwebicons/Gemini_Generated_Image_ocrwoeocrwoeocrw-removebg-preview.webp""
                   alt=""FER CUP""
                   width=""80""
                   style=""display:inline-block;max-width:80px;margin-bottom:12px;"" />
              <h1 style=""color:#FFFFFF;margin:0 0 4px 0;font-size:24px;font-weight:800;letter-spacing:1px;text-transform:uppercase;"">
                {competicion.Nombre}
              </h1>
              <p style=""color:#58A6FF;margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;"">
                Nueva inscripción recibida
              </p>
            </td>
          </tr>

          <tr>
            <td style=""padding:28px 32px 8px 32px;"">
              <h2 style=""color:#E6EDF3;margin:0 0 6px 0;font-size:20px;font-weight:700;"">
                {inscripcion.Nombre}
              </h2>
              <p style=""color:#8B949E;margin:0;font-size:14px;line-height:22px;"">
                Se ha registrado un nuevo participante. Fecha de inscripción: <strong style=""color:#E6EDF3;"">{inscripcion.CreatedAt:dd/MM/yyyy HH:mm} UTC</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td style=""padding:12px 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:14px 20px 6px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      DATOS DEL PARTICIPANTE
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style=""padding:0 20px 14px 20px;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;width:40%;"">Nombre completo</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{inscripcion.Nombre}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Email</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{inscripcion.Email}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Teléfono</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{telefonoText}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Instagram</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{instagramText}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Sexo</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{sexLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Categoría de peso</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{inscripcion.CategoriaPeso}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Modalidad</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{modalidadLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Experiencia</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{expLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Handler GR Strength</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{handlerText}</td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">GRS Peak Program</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{peakText}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:0 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:14px 20px;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                      <tr>
                        <td style=""font-size:14px;font-weight:700;color:#E6EDF3;"">
                          Estado del pago:
                        </td>
                        <td style=""font-size:14px;font-weight:800;text-align:right;"">
                          <span style=""color:{(inscripcion.PagoConfirmado ? "#3FB950" : "#F85149")};"">
                            {(inscripcion.PagoConfirmado ? "CONFIRMADO" : "PENDIENTE")}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style=""padding:5px 0;font-size:13px;color:#8B949E;"">Método de pago</td>
                        <td style=""padding:5px 0;font-size:13px;font-weight:600;color:#E6EDF3;text-align:right;"">{paymentMethodText}</td>
                      </tr>
                      <tr>
                        <td style=""font-size:13px;color:#8B949E;padding-top:6px;"" colspan=""2"">
                          Total: <strong style=""color:#E6EDF3;"">{inscripcion.TotalPagado:F2} EUR</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:12px 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:14px 20px 6px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      DETALLES DEL EVENTO
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style=""padding:0 20px 14px 20px;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;width:40%;"">Fecha</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{competicion.Fecha:dddd, dd 'de' MMMM 'de' yyyy}</td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;"">Lugar</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{competicion.Lugar}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:20px 32px;border-top:1px solid #30363D;text-align:center;"">
              <img src=""https://jaimedigitalstudio.b-cdn.net/fer/media/icons/ferwebicons/Gemini_Generated_Image_ocrwoeocrwoeocrw-removebg-preview.webp""
                   alt=""FER CUP""
                   width=""40""
                   style=""display:inline-block;max-width:40px;margin-bottom:8px;"" />
              <p style=""margin:0 0 4px 0;font-size:11px;color:#484F58;"">
                Este es un mensaje automático del sistema de inscripciones.
              </p>
              <p style=""margin:0;font-size:11px;color:#484F58;"">
                ID inscripción: #{inscripcion.Id} — {competicion.Nombre}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>",
                TextBody = $@"Nueva inscripción en {competicion.Nombre}

DATOS DEL PARTICIPANTE
Nombre completo: {inscripcion.Nombre}
Email: {inscripcion.Email}
Teléfono: {telefonoText}
Instagram: {instagramText}
Sexo: {sexLabel}
Categoría de peso: {inscripcion.CategoriaPeso}
Modalidad: {modalidadLabel}
Experiencia: {expLabel}
Handler GR Strength: {handlerText}
GRS Peak Program: {peakText}

ESTADO DEL PAGO
Pago: {(inscripcion.PagoConfirmado ? "CONFIRMADO" : "PENDIENTE")}
Método de pago: {paymentMethodText}
Total: {inscripcion.TotalPagado:F2} EUR

DETALLES DEL EVENTO
Fecha: {competicion.Fecha:dddd, dd 'de' MMMM 'de' yyyy}
Lugar: {competicion.Lugar}

Fecha de inscripción: {inscripcion.CreatedAt:dd/MM/yyyy HH:mm} UTC
ID inscripción: #{inscripcion.Id}

---
Mensaje automático del sistema de inscripciones de {competicion.Nombre}."
            }.ToMessageBody();

            await SendAsync(message, competicion.Id);
            _logger.LogInformation("FER admin notification sent for inscription {Id}", inscripcion.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send FER admin notification for inscription {Id}", inscripcion.Id);
        }
    }

    /// <summary>
    /// Sends FER payment confirmation email after payment is confirmed
    /// </summary>
    public async Task SendFerPaymentConfirmationAsync(Inscripcion inscripcion, Competicion competicion)
    {
        try
        {
            var creds = await GetCredentialsAsync(competicion.Id);

            var fullName = inscripcion.Nombre;
            var sexLabel = inscripcion.Sexo == "masculino" ? "Masculino" : "Femenino";
            var expLabel = inscripcion.Experiencia switch
            {
                "rookie" => "Rookie",
                "principiante" => "Principiante",
                "intermedio" => "Intermedio",
                "avanzado" => "Avanzado",
                _ => inscripcion.Experiencia
            };
            var handlerText = inscripcion.QuiereHandler ? "Sí" : "No";
            var modalidadLabel = InscripcionService.GetModalidadLabel(inscripcion.Modalidad);
            var paymentMethodText = inscripcion.PaymentMethod switch
            {
                "efectivo" => "Efectivo (presencial)",
                "transferencia" => "Transferencia bancaria",
                "stripe" => "Tarjeta (Stripe)",
                "cupon" => "Cupón de descuento",
                _ => inscripcion.PaymentMethod ?? "—"
            };

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(competicion.Nombre, creds.FromAddress));
            message.To.Add(new MailboxAddress(inscripcion.Nombre, inscripcion.Email));
            message.Subject = $"Pago confirmado — {competicion.Nombre}";

            var htmlBody = $@"
<!DOCTYPE html>
<html lang=""es"">
<head>
  <meta charset=""utf-8"">
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
  <title>Pago confirmado — {competicion.Nombre}</title>
</head>
<body style=""margin:0;padding:0;background-color:#0D1117;font-family:'Segoe UI',Arial,Helvetica,sans-serif;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#0D1117;"">
    <tr>
      <td align=""center"" style=""padding:24px 12px;"">
        <table role=""presentation"" width=""600"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""max-width:600px;width:100%;background-color:#161B22;border-radius:16px;overflow:hidden;border:1px solid #30363D;"">

          <tr>
            <td align=""center"" style=""padding:48px 32px 24px 32px;background:linear-gradient(135deg,#1a1a2e 0%,#16213E 50%,#0F3460 100%);"" bgcolor=""#1a1a2e"">
              <h1 style=""color:#FFFFFF;margin:0 0 8px 0;font-size:32px;font-weight:800;letter-spacing:1px;text-transform:uppercase;"">
                {competicion.Nombre}
              </h1>
              <p style=""color:#B0B0C0;margin:0 0 4px 0;font-size:14px;letter-spacing:2px;text-transform:uppercase;"">
                Presentado por
              </p>
              <img src=""https://jaimedigitalstudio.b-cdn.net/fer/media/icons/ferwebicons/Gemini_Generated_Image_ocrwoeocrwoeocrw-removebg-preview.webp""
                   alt=""{competicion.Nombre}""
                   width=""120""
                   style=""display:inline-block;max-width:120px;margin-top:8px;"" />
            </td>
          </tr>

          <tr>
            <td style=""padding:32px 32px 8px 32px;"">
              <h2 style=""color:#E6EDF3;margin:0 0 6px 0;font-size:22px;font-weight:700;"">
                ¡Pago confirmado, {fullName}!
              </h2>
              <p style=""color:#8B949E;margin:0;font-size:15px;line-height:24px;"">
                El pago de tu inscripción para la <strong style=""color:#E6EDF3;"">{competicion.Nombre}</strong> ha sido confirmado correctamente. ¡Ya estás dentro!
              </p>
            </td>
          </tr>

          <tr>
            <td style=""padding:16px 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:16px 20px 8px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      PAGO CONFIRMADO
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style=""padding:0 20px 16px 20px;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                      <tr>
                        <td style=""font-size:32px;font-weight:800;color:#3FB950;text-align:center;padding-bottom:12px;"" colspan=""2"">
                          ✓ {inscripcion.TotalPagado:F2} EUR
                        </td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;width:45%;"">Método de pago</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{paymentMethodText}</td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;"">Categoría de peso</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{inscripcion.CategoriaPeso}</td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;"">Modalidad</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{modalidadLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;"">Sexo</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{sexLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;"">Experiencia</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{expLabel}</td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;"">Handler GR Strength</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{handlerText}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:0 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:16px 20px 8px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      DETALLES DEL EVENTO
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style=""padding:0 20px 12px 20px;"">
                    <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"">
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;width:45%;"">Fecha</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{competicion.Fecha:dddd, dd 'de' MMMM 'de' yyyy}</td>
                      </tr>
                      <tr>
                        <td style=""padding:4px 0;font-size:13px;color:#8B949E;"">Lugar</td>
                        <td style=""padding:4px 0;font-size:13px;font-weight:600;color:#E6EDF3;"">{competicion.Lugar}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:12px 32px;"">
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#1C2128;border-radius:12px;border:1px solid #30363D;"">
                <tr>
                  <td style=""padding:16px 20px 8px 20px;"">
                    <p style=""margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#58A6FF;"">
                      PRÓXIMOS PASOS
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style=""padding:0 20px 12px 20px;"">
                    <ol style=""margin:0;padding-left:20px;font-size:13px;line-height:22px;color:#8B949E;"">
                      <li style=""margin-bottom:6px;"">Busca el email de confirmación de inscripción con tu código QR.</li>
                      <li style=""margin-bottom:6px;"">Acude a la mesa de registro el día del evento con el QR (no hace falta pagar nada más).</li>
                      <li style=""margin-bottom:6px;"">
                        {(inscripcion.QuiereHandler ? "Nosotros nos encargamos del handler de forma gratuita." : "Si necesitas handler, infórmanos el día del evento.")}
                      </li>
                      <li>¡Prepárate para darlo todo en la plataforma!</li>
                    </ol>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style=""padding:24px 32px;border-top:1px solid #30363D;text-align:center;"">
              <p style=""margin:0 0 4px 0;font-size:12px;color:#484F58;"">
                Este es un mensaje automático. No respondas a este correo.
              </p>
              <p style=""margin:0;font-size:12px;color:#484F58;"">
                Síguenos en Instagram: <a href=""https://www.instagram.com/grstrengthclub/"" style=""color:#58A6FF;text-decoration:underline;"">@grstrengthclub</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>";

            var textBody = $@"¡Pago confirmado, {fullName}!

El pago de tu inscripción para la {competicion.Nombre} ha sido confirmado correctamente. ¡Ya estás dentro!

PAGO CONFIRMADO
Total pagado: {inscripcion.TotalPagado:F2} EUR ✓
Método de pago: {paymentMethodText}
Categoría de peso: {inscripcion.CategoriaPeso}
Modalidad: {modalidadLabel}
Sexo: {sexLabel}
Experiencia: {expLabel}
Handler GR Strength: {handlerText}

DETALLES DEL EVENTO
Fecha: {competicion.Fecha:dddd, dd 'de' MMMM 'de' yyyy}
Lugar: {competicion.Lugar}

PRÓXIMOS PASOS
1. Busca el email de confirmación de inscripción con tu código QR.
2. Acude a la mesa de registro el día del evento con el QR (no hace falta pagar nada más).
3. {(inscripcion.QuiereHandler ? "Nosotros nos encargamos del handler de forma gratuita." : "Si necesitas handler, infórmanos el día del evento.")}
4. ¡Prepárate para darlo todo en la plataforma!

---
Este es un mensaje automático. Síguenos en Instagram: @grstrengthclub (https://www.instagram.com/grstrengthclub/)";

            var bodyBuilder = new BodyBuilder
            {
                HtmlBody = htmlBody,
                TextBody = textBody
            };

            message.Body = bodyBuilder.ToMessageBody();
            await SendAsync(message, competicion.Id);
            _logger.LogInformation("FER payment confirmation email sent to {Email}", inscripcion.Email);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send FER payment confirmation email to {Email}", inscripcion.Email);
        }
    }
}
