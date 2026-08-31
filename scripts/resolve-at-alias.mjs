// Resolves @/… imports for node:test (Next.js resolves these via tsconfig paths).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) {
    return nextResolve(specifier, context);
  }

  const rel = specifier.slice(2);
  const candidates = [
    path.join(srcRoot, rel),
    path.join(srcRoot, `${rel}.ts`),
    path.join(srcRoot, `${rel}.tsx`),
    path.join(srcRoot, rel, 'index.ts'),
  ];

  for (const file of candidates) {
    try {
      return await nextResolve(pathToFileURL(file).href, context);
    } catch {
      // try next candidate
    }
  }

  return nextResolve(specifier, context);
}
