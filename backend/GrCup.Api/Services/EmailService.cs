using MailKit.Net.Smtp;
using MimeKit;

namespace GrCup.Api.Services;

public class EmailService
{
    private readonly string _smtpHost;
    private readonly int _smtpPort;
    private readonly string _smptUsername;
    private readonly string _smtpPassword;
    private readonly ILogger<EmailService> _logger;

    public EmailService(ILogger<EmailService> logger)
    {
        _smtpHost = Environment.GetEnvironmentVariable("SMTP__HOST")
            ?? throw new InvalidOperationException("SMTP__HOST not configured");
        _smtpPort = int.TryParse(Environment.GetEnvironmentVariable("SMTP__PORT"), out var port)
            ? port
            : 587;
        _smptUsername = Environment.GetEnvironmentVariable("SMTP__USERNAME")
            ?? throw new InvalidOperationException("SMTP__USERNAME not configured");
        _smtpPassword = Environment.GetEnvironmentVariable("SMTP__PASSWORD")
            ?? throw new InvalidOperationException("SMTP__PASSWORD not configured");
        _logger = logger;
    }

    public async Task SendInscriptionConfirmationAsync(
        string email, string firstName, string surname, string weightCategory)
    {
        try
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress("GRStrength Cup", _smptUsername));
            message.To.Add(new MailboxAddress($"{firstName} {surname}", email));
            message.Subject = "Confirmaci\u00f3n de inscripci\u00f3n -- II GRStrength AEP2 Regional de Valencia, Murcia y Baleares";
            message.Body = BuildInscriptionConfirmationHtml(firstName, surname, weightCategory);

            using var client = new SmtpClient();
            await client.ConnectAsync(_smtpHost, _smtpPort, MailKit.Security.SecureSocketOptions.StartTls);
            await client.AuthenticateAsync(_smptUsername, _smtpPassword);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);

            _logger.LogInformation("Confirmation email sent to {Email} ({FirstName} {Surname})", email, firstName, surname);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send confirmation email to {Email}", email);
        }
    }

    private static MimeEntity BuildInscriptionConfirmationHtml(
        string firstName, string surname, string weightCategory)
    {
        var eventDate = "14 y 15 de junio de 2025";
        var eventLocation = "Valencia, Murcia y Baleares";

        var htmlBody = $"""
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Confirmaci\u00f3n de inscripci\u00f3n</title>
          <!--[if mso]>
          <noscript>
            <xml>
              <o:OfficeDocumentSettings>
                <o:AllowPNG>false</o:AllowPNG>
                <o:PixelsPerInch>96</o:PixelsPerInch>
              </o:OfficeDocumentSettings>
            </xml>
          </noscript>
          <![endif]-->
        </head>
        <body style="margin:0;padding:0;background-color:#F5F5F5;" bgcolor="#F5F5F5">
          <!-- Outer wrapper forces white background regardless of email client theme -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F5F5;">
            <tr>
              <td align="center" style="padding:20px 10px;">
                <!-- Content wrapper -->
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

                  <!-- Header with logo -->
                  <tr>
                    <td align="center" style="padding:40px 30px 20px 30px;background-color:#1A1A1A;" bgcolor="#1A1A1A">
                      <img src="https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png" alt="GRStrength Cup" width="180" style="display:block;max-width:180px;" />
                    </td>
                  </tr>

                  <!-- Greeting -->
                  <tr>
                    <td align="center" style="padding:30px 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#1A1A1A;">
                      \u00a1Hola, {firstName}!
                    </td>
                  </tr>

                  <!-- Body text -->
                  <tr>
                    <td style="padding:0 30px 20px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#333333;">
                      Tu inscripci\u00f3n al <strong style="color:#1A1A1A;">II GRStrength AEP2 Regional de Valencia, Murcia y Baleares</strong> ha sido registrada correctamente.
                    </td>
                  </tr>

                  <!-- Details table -->
                  <tr>
                    <td style="padding:0 30px 20px 30px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9F9F9;border-radius:8px;">
                        <tr>
                          <td style="padding:16px 20px 8px 20px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#999999;">
                            DATOS DE INSCRIPCI\u00d3N
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
                                  Categor\u00eda de peso
                                </td>
                                <td style="padding:6px 0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">
                                  {weightCategory} kg
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Next steps -->
                  <tr>
                    <td style="padding:0 30px 30px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#333333;">
                      Pr\u00f3ximamente recibir\u00e1s informaci\u00f3n sobre el proceso de pago y los detalles del evento. Mantente atento/a a tu correo electr\u00f3nico para no perderte ninguna actualizaci\u00f3n.
                    </td>
                  </tr>

                  <!-- Separator -->
                  <tr>
                    <td style="padding:0 30px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr><td style="height:1px;background-color:#E5E5E5;font-size:0;line-height:0;">&nbsp;</td></tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Event info -->
                  <tr>
                    <td style="padding:20px 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1A1A1A;">
                      \u00bfCu\u00e1ndo y d\u00f3nde?
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 30px 10px 30px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#333333;">
                      <strong style="color:#1A1A1A;">Fecha:</strong> {eventDate}<br>
                      <strong style="color:#1A1A1A;">Lugar:</strong> {eventLocation}
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:20px 30px 30px 30px;border-top:1px solid #E5E5E5;text-align:center;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#999999;">
                      Este es un mensaje autom\u00e1tico. Por favor, no respondas a este correo.<br>
                      Si tienes alguna consulta, puedes contactar con nosotros a trav\u00e9s de Instagram <strong style="color:#1A1A1A;">@grstrengthclub</strong>.
                    </td>
                  </tr>

                </table>
                <!-- / content wrapper -->
              </td>
            </tr>
          </table>
          <!-- / outer wrapper -->
        </body>
        </html>
        """;

        var textBody = $"""
        \u00a1Hola, {firstName}!

        Tu inscripci\u00f3n al II GRStrength AEP2 Regional de Valencia, Murcia y Baleares ha sido registrada correctamente.

        DATOS DE INSCRIPCI\u00d3N
        Nombre completo: {firstName} {surname}
        Categor\u00eda de peso: {weightCategory} kg

        Pr\u00f3ximamente recibir\u00e1s informaci\u00f3n sobre el proceso de pago y los detalles del evento.

        \u00bfCu\u00e1ndo y d\u00f3nde?
        Fecha: {eventDate}
        Lugar: {eventLocation}

        Este es un mensaje autom\u00e1tico. Contacta con nosotros en Instagram @grstrengthclub.
        """;

        var builder = new BodyBuilder
        {
            HtmlBody = htmlBody,
            TextBody = textBody
        };
        return builder.ToMessageBody();
    }
}
