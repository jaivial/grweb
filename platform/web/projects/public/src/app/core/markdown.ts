import { marked } from 'marked';
import type { Lang } from './i18n';

export interface Heading {
  id: string;
  text: string;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Markdown → HTML with ids on h2 (for the table of contents). Angular sanitizes the result when bound. */
const TITULO_CAJA: Record<string, string> = { dato: 'Dato', consejo: 'Consejo', aviso: 'Aviso', importante: 'Importante', resumen: 'En resumen', filas: '' };
const TITULO_CAJA_EN: Record<string, string> = { dato: 'Fact', consejo: 'Tip', aviso: 'Notice', importante: 'Important', resumen: 'Summary', filas: '' };
/** «Texto {toc: Etiqueta}»: the contents entry of a heading or box when it differs from the visible text. */
const TOC = /\s*\{toc:\s*([^}]+)\}\s*$/;

export function renderMarkdown(src: string, lang: Lang = 'es'): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const html = (marked.parse(src ?? '', { async: false }) as string)
    // Boxes of the blog (Figma 34): «> [!dato] Título» (also consejo, aviso, importante) and «> [!resumen]» + a list.
    // «[!filas]»: a card of rows «**Nombre** — detalle»; «{toc: …}» on a box adds a hidden anchor for the contents.
    .replace(/<blockquote>\s*<p>\[!(dato|consejo|aviso|importante|resumen|filas)\][ \t]*([^\n<]*)(\n|<\/p>)([\s\S]*?)<\/blockquote>/g,
      (_m, tipo: string, titulo: string, sep: string, resto: string) => {
        const toc = TOC.exec(titulo)?.[1];
        const t = titulo.replace(TOC, '').trim() || (lang === 'en' ? TITULO_CAJA_EN : TITULO_CAJA)[tipo];
        if (tipo === 'filas') resto = resto.replace(/<\/strong>\s*—\s*([^<]*)/g, '</strong><span>$1</span>');
        return (toc ? `<h2 class="ancla">${toc} {toc: ${toc}}</h2>` : '') +
          `<aside class="caja caja-${tipo}">${t ? `<p class="caja-titulo">${t}</p>` : ''}${sep === '\n' ? '<p>' : ''}${resto.trim()}</aside>`;
      })
    .replace(/<h2( class="ancla")?>(.*?)<\/h2>/g, (_m, cls: string | undefined, inner: string) => {
      const toc = TOC.exec(inner)?.[1];
      inner = inner.replace(TOC, '');
      const text = toc ?? inner.replace(/<[^>]+>/g, '');
      const id = slugify(text) || `seccion-${headings.length + 1}`;
      headings.push({ id, text });
      return `<h2${cls ?? ''} id="${id}">${cls ? text : inner}</h2>`;
    })
    // Markdown images without alt text (FAQ answers) get a default one.
    .replace(/<img([^>]*?) alt=""/g, (_m, a: string) => '<img' + a + ' alt="' + (lang === 'en' ? 'GRS Cup 2 image' : 'Imagen de la GRS Cup 2') + '"')
    // Internal absolute links stay in the reader's language (not /api/, not already /en).
    .replace(/href="(\/(?!\/|api\/|en(?:[\/?#]|"))[^"]*)"/g, (m, p: string) => (lang === 'en' ? `href="/en${p === '/' ? '' : p}"` : m));
  return { html, headings };
}
