/** Imágenes importadas con `with { loader: 'dataurl' }` (esbuild las inlinea como data URL). */
declare module '*.webp' {
  const dataUrl: string;
  export default dataUrl;
}
