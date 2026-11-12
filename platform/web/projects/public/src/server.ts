import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { routes } from './app/app.routes';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.disable('x-powered-by');
const angularApp = new AngularNodeAppEngine();

const API = process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:18300';
const ORIGIN = process.env['PUBLIC_ORIGIN'] ?? 'https://grcup-qa.menustudioai.com';
const SLUG = 'grcup';
const HOST = new URL(ORIGIN).host.toLowerCase();

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

const STATIC_ROUTES = ['/', '/en', '/categorias-de-peso', '/marcas-minimas', '/reglamento', '/atletas', '/participantes', '/horarios', '/entradas', '/sorteo', '/en-directo', '/resultados', '/resultados/2025', '/ediciones/2025', '/publico', '/clubs', '/preguntas-frecuentes', '/patrocinadores', '/galeria', '/voluntarios', '/como-llegar', '/donde-dormir-y-comer', '/mapa-de-accesos', '/blog', '/privacidad', '/terminos', '/cookies', '/consentimiento-datos', '/politica-concurso', '/alta-atleta'];

/** Redirects managed from the backoffice («Páginas y SEO · Redirecciones»). */
app.use(async (req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.includes('.')) return next();
  const map = await seoMap();
  // Follow chains to their end in one hop; a loop (a → b → a) is ignored instead of bouncing the browser forever.
  // Compare paths only: «/x?a=1» or «/x#b» lands on /x again, so it counts as a loop too.
  // An absolute URL of this same web (http or https) counts by its path too.
  const ruta = (u: string) => {
    const m = /^https?:\/\/([^/?#]*)(.*)$/i.exec(u);
    return (m && m[1].toLowerCase() === HOST ? m[2] : u).split(/[?#]/)[0] || '/';
  };
  const vistos = new Set([req.path]);
  let r: SeoMap['redirecciones'][number] | undefined;
  for (let x = map?.redirecciones.find((y) => y.desde === req.path); x; x = map?.redirecciones.find((y) => y.desde === ruta(r!.hacia))) {
    if (vistos.has(ruta(x.hacia))) return next();
    vistos.add(ruta(x.hacia));
    r = x;
  }
  if (r) {
    // Keep the incoming query (campaign tags of old links), merged with the destination's own.
    const i = req.originalUrl.indexOf('?');
    if (i < 0) return res.redirect(r.codigo, r.hacia);
    const [base, ...hash] = r.hacia.split('#');
    const q = req.originalUrl.slice(i + 1);
    return res.redirect(r.codigo, base + (base.includes('?') ? '&' : '?') + q + (hash.length ? '#' + hash.join('#') : ''));
  }
  next();
});

// /_componentes renders client-side only (no meta robots in the shell): keep it out of the index with the header.
app.use(['/_componentes', '/_overlays'], (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /pantalla/\nDisallow: /_componentes\nDisallow: /_overlays\nSitemap: ${ORIGIN}/sitemap.xml\n`);
});

app.get('/sitemap.xml', async (_req, res) => {
  // The cms builds it (GET /api/sitemap, Figma 20); the local list is the fallback while the API is down.
  try {
    const r = await fetch(`${API}/api/sitemap?competicion=${SLUG}&origen=${encodeURIComponent(ORIGIN)}`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(await r.text());
      return;
    }
  } catch {
    // fall through
  }
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
 * Unknown routes (Figma 17 «404»): answer 404 with the client-side shell instead of a full SSR render, which costs
 * ~6 API calls charged to the visitor's rate limit and ~10 ms of CPU each. The browser renders the 404 page itself.
 * Known route patterns and the CMS pages published in the SEO map still render on the server.
 */
const PATRONES = routes.map((r) => (r.path ?? '').split('/').filter(Boolean)).filter((p) => p[0] !== '**' && p[0] !== ':pslug');
const SHELL = (() => {
  try {
    // marker read by Cms.pagina(): the server already answered 404, so the client must not ask the CMS again
    return readFileSync(join(browserDistFolder, 'index.csr.html'), 'utf8').replace('</head>', '<meta name="gr-404" content="1"></head>');
  } catch {
    return null;
  }
})();
async function desconocida(path: string): Promise<boolean> {
  const segs = path.split('/').filter(Boolean);
  if (!segs.length || PATRONES.some((p) => p.length === segs.length && p.every((x, i) => x.startsWith(':') || x === segs[i]))) return false;
  if (segs.length > 1) return true;
  const map = await seoMap();
  return !!map && !map.rutas.includes(path); // without the SEO map, let the CMS page decide
}
app.use(async (req, res, next) => {
  if (!SHELL || (req.method !== 'GET' && req.method !== 'HEAD') || !(await desconocida(req.path))) return next();
  res.status(404).set({ 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }).type('html').send(SHELL);
});

/**
 * Micro-cache of the rendered pages (per pod, SSR_CACHE_TTL_MS, default 5 s): the SSR is anonymous (no cookie reaches
 * the API), so a page is the same for every visitor for a few seconds. Concurrent requests for the same URL share one
 * render, and only plain 200s without Set-Cookie/no-store are kept (429/503/404 always render again).
 */
const TTL = Number(process.env['SSR_CACHE_TTL_MS'] ?? 5000);
interface Pagina { at: number; status: number; headers: [string, string][]; body: Buffer }
const paginas = new Map<string, Pagina>();
const enCurso = new Map<string, Promise<Pagina | null>>();
async function render(req: express.Request): Promise<Pagina | null> {
  const r = await angularApp.handle(req);
  if (!r) return null;
  return { at: Date.now(), status: r.status, headers: [...r.headers.entries()], body: Buffer.from(await r.arrayBuffer()) };
}
const cacheable = (p: Pagina) =>
  p.status === 200 && !p.headers.some(([k, v]) => k === 'set-cookie' || (k === 'cache-control' && /no-store|private/.test(v)));

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  if (TTL <= 0 || (req.method !== 'GET' && req.method !== 'HEAD')) {
    angularApp
      .handle(req)
      .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
      .catch(next);
    return;
  }
  const key = req.method + ' ' + req.originalUrl;
  const hit = paginas.get(key);
  // LRU: a hit moves the entry to the end of the Map (insertion order = least recently used first)
  if (hit) { paginas.delete(key); paginas.set(key, hit); }
  const compartida = enCurso.get(key);
  const p = hit && Date.now() - hit.at < TTL ? Promise.resolve(hit) : compartida
    // another visitor's render that is not shareable (e.g. their 429): render this one on its own
    ? compartida.then((pg) => (pg && !cacheable(pg) ? render(req) : pg))
    : (() => {
    const x = render(req).then((pg) => {
      if (pg && cacheable(pg)) {
        paginas.delete(key);
        paginas.set(key, pg);
        // bounded LRU: random query strings must not grow memory; evict the least recently used entry
        if (paginas.size > 200) paginas.delete(paginas.keys().next().value!);
      }
      return pg;
    }).finally(() => enCurso.delete(key));
    enCurso.set(key, x);
    return x;
  })();
  p.then((pg) => {
    if (!pg) return next();
    res.status(pg.status);
    for (const [k, v] of pg.headers) res.append(k, v);
    res.end(req.method === 'HEAD' ? undefined : pg.body);
  }).catch(next);
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
