import { useEffect, useRef } from 'react';

const FER_LOGO_URL =
  'https://jaimedigitalstudio.b-cdn.net/fer/media/icons/ferwebicons/Gemini_Generated_Image_ocrwoeocrwoeocrw-removebg-preview.webp';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Strip executable script from preview body. The preview iframe is sandboxed
 * without `allow-scripts` (emails never run JS); leaving `<script>` tags in the
 * document only produces a noisy "Blocked script execution in 'about:srcdoc'"
 * console error. Removing them keeps the console clean and matches what email
 * clients actually render.
 */
function stripScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '');
}

/**
 * Mirrors backend `FerNewsletterTemplate.RenderShell` so the preview matches
 * the email recipients will receive byte-for-byte (same FER dark shell).
 */
export function renderFerEmailHtml(headerTitle: string, bodyHtml: string): string {
  const title = escapeHtml(headerTitle);
  const body = stripScripts(bodyHtml);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0D1117;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0D1117;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#161B22;border-radius:16px;overflow:hidden;border:1px solid #30363D;">
          <tr>
            <td align="center" style="padding:48px 32px 24px 32px;background:linear-gradient(135deg,#1a1a2e 0%,#16213E 50%,#0F3460 100%);" bgcolor="#1a1a2e">
              <h1 id="hf-preview-title" style="color:#FFFFFF;margin:0 0 8px 0;font-size:32px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">${title}</h1>
              <img src="${FER_LOGO_URL}" alt="${title}" width="120" style="display:inline-block;max-width:120px;margin-top:8px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;color:#E6EDF3;font-size:16px;line-height:1.6;">
              <div id="hf-preview-body" style="color:#E6EDF3;font-size:16px;line-height:1.6;">${body}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #30363D;text-align:center;">
              <p style="margin:0 0 4px 0;font-size:12px;color:#484F58;">Este es un mensaje automático. No respondas a este correo.</p>
              <p style="margin:0;font-size:12px;color:#484F58;">Síguenos en Instagram: <a href="https://www.instagram.com/grstrengthclub/" style="color:#58A6FF;text-decoration:underline;">@grstrengthclub</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface EmailPreviewProps {
  /** Header title rendered in the email shell (competition name). */
  headerTitle: string;
  /** Serialized body HTML from the editor. */
  bodyHtml: string;
}

export function EmailPreview({ headerTitle, bodyHtml }: EmailPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Tracks whether the iframe document has been written once, so subsequent
  // updates patch in place instead of re-navigating the frame.
  const writtenRef = useRef(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;

    const titleEl = doc.getElementById('hf-preview-title');
    const bodyEl = doc.getElementById('hf-preview-body');

    // Patch the existing document in place — no srcdoc reassignment, so the
    // frame never reloads and the preview no longer flickers on each keystroke.
    if (writtenRef.current && titleEl && bodyEl) {
      const nextTitle = escapeHtml(headerTitle);
      if (titleEl.innerHTML !== nextTitle) titleEl.innerHTML = nextTitle;
      const nextBody = stripScripts(bodyHtml);
      if (bodyEl.innerHTML !== nextBody) bodyEl.innerHTML = nextBody;
      return;
    }

    // First render (or after the frame was recreated): write the full shell once.
    doc.open();
    doc.write(renderFerEmailHtml(headerTitle, bodyHtml));
    doc.close();
    writtenRef.current = true;
  }, [headerTitle, bodyHtml]);

  return (
    <iframe
      ref={frameRef}
      className="newsletter-preview__frame"
      data-ui="newsletter-email-preview"
      title="Vista previa del email"
      sandbox="allow-same-origin"
    />
  );
}

export default EmailPreview;
