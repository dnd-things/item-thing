import { existsSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function withTypeScriptExtension(absolutePath) {
  if (existsSync(absolutePath)) {
    const stats = statSync(absolutePath);
    if (stats.isFile()) {
      return absolutePath;
    }
    if (
      stats.isDirectory() &&
      existsSync(resolvePath(absolutePath, 'index.ts'))
    ) {
      return resolvePath(absolutePath, 'index.ts');
    }
  }
  const candidates = [`${absolutePath}.ts`, `${absolutePath}.tsx`];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function rewriteSpecifier(specifier, parentURL) {
  if (isBuiltin(specifier) || specifier.startsWith('node:')) {
    return null;
  }

  if (specifier.startsWith('@/')) {
    const absolutePath = resolvePath(root, specifier.slice(2));
    const filePath = withTypeScriptExtension(absolutePath);
    return filePath ? pathToFileURL(filePath).href : null;
  }

  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return null;
  }
  const lastSegment = specifier.split('/').pop() ?? specifier;
  if (lastSegment.includes('.') || parentURL === undefined) {
    return null;
  }
  if (!parentURL.endsWith('.ts') && !parentURL.endsWith('.tsx')) {
    return null;
  }

  const parentPath = fileURLToPath(parentURL);
  const absolutePath = resolvePath(dirname(parentPath), specifier);
  const filePath = withTypeScriptExtension(absolutePath);
  return filePath ? pathToFileURL(filePath).href : null;
}

export async function resolve(specifier, context, nextResolve) {
  const rewritten = rewriteSpecifier(specifier, context.parentURL);
  return nextResolve(rewritten ?? specifier, context);
}
