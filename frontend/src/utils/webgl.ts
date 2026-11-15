/**
 * WebGL capability probe, shared by every WebGL effect of the site.
 * Creates one throw-away context, releases it at once and caches the answer for the page.
 */
let cachedWebGL: boolean | null = null;

export function hasWebGL(): boolean {
  if (cachedWebGL !== null) return cachedWebGL;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    cachedWebGL = !!context;
    (context as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cachedWebGL = false;
  }
  return cachedWebGL;
}
