import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HEAVY = ['pdf-lib', '@pdf-lib/fontkit', 'pkijs', 'asn1js'];

/** Every module reachable from `entry` through runtime imports and re-exports. */
function reachable(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
    const specifiers: string[] = [];
    // Runtime edges only: `import type` and `export type` vanish at compile time.
    const edge = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms;
    for (const match of source.matchAll(edge)) specifiers.push(match[1]!);
    seen.set(file, specifiers);
    for (const specifier of specifiers) {
      if (specifier.startsWith('./')) visit(specifier.replace(/\.js$/, '.ts'));
    }
  };
  visit(entry);
  return seen;
}

describe('the light entry point', () => {
  it('loads no heavy library, directly or through anything it imports', () => {
    const offenders: string[] = [];
    for (const [file, specifiers] of reachable('./light.ts')) {
      for (const specifier of specifiers) {
        if (HEAVY.includes(specifier)) offenders.push(`${file} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch a heavy import if one were added', () => {
    // The walker must see through re-exports, or the guard above proves nothing.
    const graph = reachable('./sign.ts');
    expect([...graph.values()].flat()).toEqual(expect.arrayContaining(['pdf-lib', '@pdf-lib/fontkit']));
  });
});
