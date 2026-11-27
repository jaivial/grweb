/**
 * Field text → safe HTML: escapes first, then `**negrita**` and line breaks (contract §2: descripción and etiquetas
 * admit **negrita** and saltos de línea). Used by the canvas and the web preview; never trust raw HTML from the schema.
 */
export function textoHtml(t: string): string {
  return (t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
