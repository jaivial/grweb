#!/usr/bin/env node
// Brotli copies («x.js.br», quality 11) of the public web's text assets, served by server.ts when the browser accepts br.
//   node scripts/precomprimir.mjs [dist/public/browser]
import { brotliCompressSync, constants } from 'node:zlib';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? join(import.meta.dirname, '../dist/public/browser');
let n = 0, antes = 0, despues = 0;
for (const f of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
  if (!/\.(js|mjs|css|svg|json|txt|xml|webmanifest)$/.test(f)) continue;
  const datos = readFileSync(join(dir, f));
  if (datos.length < 1024) continue;
  const br = brotliCompressSync(datos, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: datos.length } });
  writeFileSync(join(dir, f + '.br'), br);
  n++; antes += datos.length; despues += br.length;
}
console.log(`brotli: ${n} ficheros, ${(antes / 1024).toFixed(0)} KB → ${(despues / 1024).toFixed(0)} KB`);
