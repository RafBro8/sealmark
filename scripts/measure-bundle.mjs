/**
 * Reports what the production web build costs a visitor: what the first visit
 * must download before the page works, what loads later on demand, and fonts.
 * Sizes are gzip, as a static host serves them.
 *
 * Run after `npm run build --workspace @sealmark/web`: node scripts/measure-bundle.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dist = new URL('../packages/web/dist/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('.vite/manifest.json', dist), 'utf8'));
const gz = (file) => gzipSync(readFileSync(new URL(file, dist)), { level: 9 }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(0).padStart(5)} KB`;

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
const initial = new Set();
const visit = (key) => {
  const chunk = manifest[key];
  if (!chunk || initial.has(chunk.file)) return;
  initial.add(chunk.file);
  for (const css of chunk.css ?? []) initial.add(css);
  for (const next of chunk.imports ?? []) visit(next);
};
visit(entryKey);

const assets = readdirSync(new URL('assets/', dist)).map((name) => `assets/${name}`);
const code = assets.filter((file) => /\.(m?js|css)$/.test(file));
const fonts = assets.filter((file) => file.endsWith('.ttf'));

const sum = (files) => files.reduce((total, file) => total + gz(file), 0);
const initialFiles = code.filter((file) => initial.has(file));
const lazyFiles = code.filter((file) => !initial.has(file));

console.log(`first visit      ${kb(sum(initialFiles))}  (${initialFiles.length} files)`);
console.log(`loaded on demand ${kb(sum(lazyFiles))}  (${lazyFiles.length} files)`);
for (const file of lazyFiles.sort((a, b) => gz(b) - gz(a))) console.log(`  ${kb(gz(file))}  ${file}`);
console.log(`fonts            ${kb(sum(fonts))}  gzip, ${kb(fonts.reduce((t, f) => t + readFileSync(new URL(f, dist)).length, 0))} raw`);
for (const file of fonts.sort((a, b) => gz(b) - gz(a))) console.log(`  ${kb(gz(file))}  ${file}`);
