using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace GrCup.Api.Services;

/// <summary>
/// Renders newsletter body HTML inside the FERCUP-branded email shell.
/// Mirrors the dark FER theme used by <c>EmailService.SendFerConfirmationAsync</c>
/// so the backoffice live preview and the actual email stay identical.
/// </summary>
public static class FerNewsletterTemplate
{
    private const string FerLogoUrl =
        "https://jaimedigitalstudio.b-cdn.net/fer/media/icons/ferwebicons/Gemini_Generated_Image_ocrwoeocrwoeocrw-removebg-preview.webp";

    /// <summary>
    /// Wraps the editor body HTML in the FER email shell.
    /// </summary>
    /// <param name="headerTitle">Header title (e.g. competition name).</param>
    /// <param name="innerBodyHtml">Sanitized body HTML produced by the Gutenberg editor.</param>
    public static string RenderShell(string headerTitle, string innerBodyHtml)
    {
        var title = WebUtility.HtmlEncode(headerTitle);
        return $@"<!DOCTYPE html>
<html lang=""es"">
<head>
  <meta charset=""utf-8"">
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
  <title>{title}</title>
</head>
<body style=""margin:0;padding:0;background-color:#0D1117;font-family:'Segoe UI',Arial,Helvetica,sans-serif;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""background-color:#0D1117;"">
    <tr>
      <td align=""center"" style=""padding:24px 12px;"">
        <table role=""presentation"" width=""600"" cellpadding=""0"" cellspacing=""0"" border=""0"" style=""max-width:600px;width:100%;background-color:#161B22;border-radius:16px;overflow:hidden;border:1px solid #30363D;"">
          <tr>
            <td align=""center"" style=""padding:48px 32px 24px 32px;background:linear-gradient(135deg,#1a1a2e 0%,#16213E 50%,#0F3460 100%);"" bgcolor=""#1a1a2e"">
              <h1 style=""color:#FFFFFF;margin:0 0 8px 0;font-size:32px;font-weight:800;letter-spacing:1px;text-transform:uppercase;"">{title}</h1>
              <img src=""{FerLogoUrl}"" alt=""{title}"" width=""120"" style=""display:inline-block;max-width:120px;margin-top:8px;"" />
            </td>
          </tr>
          <tr>
            <td style=""padding:24px 32px;color:#E6EDF3;font-size:16px;line-height:1.6;"">
              <div style=""color:#E6EDF3;font-size:16px;line-height:1.6;"">{innerBodyHtml}</div>
            </td>
          </tr>
          <tr>
            <td style=""padding:24px 32px;border-top:1px solid #30363D;text-align:center;"">
              <p style=""margin:0 0 4px 0;font-size:12px;color:#484F58;"">Este es un mensaje automático. No respondas a este correo.</p>
              <p style=""margin:0;font-size:12px;color:#484F58;"">Síguenos en Instagram: <a href=""https://www.instagram.com/grstrengthclub/"" style=""color:#58A6FF;text-decoration:underline;"">@grstrengthclub</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>";
    }

    /// <summary>
    /// Produces a plain-text fallback from the body HTML by stripping tags
    /// and collapsing whitespace. Email clients without HTML support use this.
    /// </summary>
    public static string ToPlainText(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;

        // Drop Gutenberg block comments, then tags, then decode entities.
        var noComments = Regex.Replace(html, "<!--.*?-->", " ", RegexOptions.Singleline);
        var withBreaks = Regex.Replace(noComments, "</(p|div|h[1-6]|li|br)>", "\n", RegexOptions.IgnoreCase);
        var noTags = Regex.Replace(withBreaks, "<[^>]+>", " ");
        var decoded = WebUtility.HtmlDecode(noTags);
        var collapsed = Regex.Replace(decoded, "[ \\t]+", " ");
        collapsed = Regex.Replace(collapsed, "\\n{3,}", "\n\n");
        return collapsed.Trim();
    }
}
