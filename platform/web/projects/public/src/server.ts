import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const API = process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:18300';
const ORIGIN = process.env['PUBLIC_ORIGIN'] ?? 'https://grcup-qa.menustudioai.com';
const SLUG = 'grcup';

interface SeoMap {
  paginas: { ruta: string; indexable: boolean }[];
  redirecciones: { desde: string; hacia: string; codigo: number }[];
  rutas: string[];
}
let seoCache: { at: number; data: SeoMap | null } = { at: 0, data: null };

/** SEO map of the CMS (redirects, indexable routes, published pages), cached 60 s per pod. */
async function seoMap(): Promise<SeoMap | null> {
  if (Date.now() - seoCache.at < 60_000) return seoCache.data;
  try {
    const r = await fetch(`${API}/api/competiciones/${SLUG}/seo`, { signal: AbortSignal.timeout(3000) });
    seoCache = { at: Date.now(), data: r.ok ? ((await r.json()) as SeoMap) : seoCache.data };
  } catch {
    seoCache = { at: Date.now(), data: seoCache.data };
  }
  return seoCache.data;
}

const STATIC_ROUTES = ['/', '/preguntas-frecuentes', '/patrocinadores', '/galeria', '/voluntarios', '/como-llegar', '/blog', '/privacidad', '/terminos', '/cookies', '/consentimiento-datos', '/politica-concurso'];

/** Redirects managed from the backoffice («Páginas y SEO · Redirecciones»). */
app.use(async (req, res, next) => {
  if (req.method !== 'GET' || req.path.includes('.')) return next();
  const map = await seoMap();
  const r = map?.redirecciones.find((x) => x.desde === req.path);
  if (r) return res.redirect(r.codigo, r.hacia);
  next();
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${ORIGIN}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (_req, res) => {
  const map = await seoMap();
  const noindex = new Set((map?.paginas ?? []).filter((p) => !p.indexable).map((p) => p.ruta));
  const urls = [...new Set([...STATIC_ROUTES, ...(map?.rutas ?? [])])].filter((u) => !noindex.has(u));
  const body = urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc></url>`).join('\n');
  res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
});

/** Liveness/readiness of the SSR server (does not render). */
app.get('/healthz', (_req, res) => {
  res.status(204).end();
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
