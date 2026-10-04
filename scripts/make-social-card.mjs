/**
 * Renders the link preview card from the same seal as the icons, so a shared
 * link shows the product rather than a bare URL.
 *
 * 1200x630 is what the scrapers crop to. The seal and the two lines of text sit
 * well inside that, because Slack, LinkedIn and X each trim the edges by a
 * different amount and none of them tell you which.
 *
 * Run: node scripts/make-social-card.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const publicDir = new URL('../packages/web/public/', import.meta.url);
const seal = readFileSync(new URL('seal.svg', publicDir), 'utf8');
const lato = new URL('../packages/core/assets/Lato-Regular.ttf', import.meta.url);

// The seal's own shapes, without its outer <svg> wrapper.
const shapes = seal.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const WIDTH = 1200;
const HEIGHT = 630;
const PAPER = '#f7f5f1';
const BURGUNDY = '#8f2d3f';
const INK = '#1b1b1f';
const MUTED = '#5a5560';

// The seal, scaled from its 32pt viewBox and placed left of the text.
const SEAL_SIZE = 232;
const scale = SEAL_SIZE / 32;
const sealX = 120;
const sealY = (HEIGHT - SEAL_SIZE) / 2 - 14;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>

  <!-- A band of the brand colour down the left edge, so the card still reads
       as ours when a platform renders it small and crops the text. -->
  <rect x="0" y="0" width="14" height="${HEIGHT}" fill="${BURGUNDY}"/>

  <g transform="translate(${sealX} ${sealY}) scale(${scale})">${shapes}</g>

  <text x="432" y="291" font-family="Lato" font-size="92" fill="${INK}"
        letter-spacing="-1.5">Sealmark</text>

  <rect x="434" y="330" width="76" height="4" fill="${BURGUNDY}"/>

  <text x="432" y="394" font-family="Lato" font-size="35" fill="${MUTED}">Sign PDFs in your browser.</text>
  <text x="432" y="444" font-family="Lato" font-size="35" fill="${MUTED}">Your files are never uploaded.</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: WIDTH },
  font: { fontFiles: [lato.pathname.replace(/^\/([A-Za-z]:)/, '$1')], defaultFontFamily: 'Lato', loadSystemFonts: false },
}).render().asPng();

const out = new URL('og-card.png', publicDir);
writeFileSync(out, png);
console.log(`wrote ${out.pathname} (${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(0)} KB)`);
