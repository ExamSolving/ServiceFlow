// Node module hooks for the mobile unit tests: resolve the "@/..." alias and
// extension-less relative imports to TypeScript files in src/, and replace
// native-only modules with small stubs from scripts/stubs/.
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../../src/', import.meta.url);
const STUBS = {
  '@/lib/firebase/client': new URL('../stubs/firebase-client.mjs', import.meta.url).href,
};
const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function firstExisting(base) {
  for (const extension of EXTENSIONS) {
    const candidate = new URL(base + extension);
    if (isFile(fileURLToPath(candidate))) return candidate.href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const url = firstExisting(new URL(specifier.slice(2), SRC).href);
    if (url) return { url, shortCircuit: true };
  }
  if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
    const url = firstExisting(new URL(specifier, context.parentURL).href);
    if (url) return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
