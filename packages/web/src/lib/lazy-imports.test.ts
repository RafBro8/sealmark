import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Static, runtime imports: `import type` and `export type` are erased and cost nothing. */
function staticImports(source: string): string[] {
  const edge = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms;
  return [...source.matchAll(edge)].map((match) => match[1]!);
}

const ON_DEMAND = [
  '@sealmark/core',
  '@sealmark/core/sign',
  '@sealmark/core/convert',
  '@sealmark/core/timestamp',
  '@sealmark/core/verify',
  '@sealmark/core/coverage',
  'pdfjs-dist',
];

describe('code loaded with the page', () => {
  it('never statically imports signing, conversion, timestamps, verification or pdf.js', () => {
    const offenders: string[] = [];
    for (const file of sources(root)) {
      const name = relative(root, file);
      // verification.ts is itself loaded on demand by the Verify screen.
      if (name === join('lib', 'verification.ts')) continue;
      for (const specifier of staticImports(readFileSync(file, 'utf8'))) {
        if (ON_DEMAND.includes(specifier)) offenders.push(`${name} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is really checking: the on-demand module does import heavy code', () => {
    const source = readFileSync(join(root, 'lib', 'verification.ts'), 'utf8');
    expect(staticImports(source)).toEqual(expect.arrayContaining(['@sealmark/core/verify']));
  });
});
