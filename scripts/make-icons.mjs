/**
 * Renders the installable-app icons from the seal in packages/web/public/seal.svg,
 * so they stay in step with the logo instead of being hand-exported images.
 *
 * Run: node scripts/make-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const publicDir = new URL('../packages/web/public/', import.meta.url);
const seal = readFileSync(new URL('seal.svg', publicDir), 'utf8');

// The seal's own shapes, without its outer <svg> wrapper.
const shapes = seal.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const PAPER = '#f7f5f1';

/**
 * @param size   output width and height in pixels
 * @param fill   fraction of the canvas the seal occupies
 * @param radius corner radius of the paper background, as a fraction of size;
 *               0 gives a full-bleed square for platforms that apply their own mask
 */
function icon(size, fill, radius) {
  const scale = (size * fill) / 32;
  const offset = (size - 32 * scale) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${PAPER}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${shapes}</g>
</svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

const icons = [
  // Shown as-is by browsers and desktop launchers: rounded, with breathing room.
  { file: 'icon-192.png', png: icon(192, 0.72, 0.22) },
  { file: 'icon-512.png', png: icon(512, 0.72, 0.22) },
  // Android crops maskable icons to its own shape; keep the seal inside the
  // central 80% safe zone and let the paper run to the edges.
  { file: 'icon-maskable-512.png', png: icon(512, 0.56, 0) },
  // iOS rounds the corners itself and ignores transparency.
  { file: 'apple-touch-icon.png', png: icon(180, 0.7, 0) },
];

for (const { file, png } of icons) {
  writeFileSync(new URL(file, publicDir), png);
  console.log(`${file}  ${(png.length / 1024).toFixed(1)} KB`);
}
