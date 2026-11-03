import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith('@/')) {
    const relPath = specifier.slice(2);
    target = path.resolve(process.cwd(), 'src', relPath);
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (context.parentURL) {
      const parentDir = path.dirname(new URL(context.parentURL).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));
      target = path.resolve(parentDir, specifier);
    }
  }

  if (path.isAbsolute(target)) {
    if (fs.existsSync(target + '.ts')) {
      target = target + '.ts';
    } else if (fs.existsSync(target + '.tsx')) {
      target = target + '.tsx';
    } else if (fs.existsSync(target + '/index.ts')) {
      target = target + '/index.ts';
    }
    return nextResolve(pathToFileURL(target).href, context);
  }

  return nextResolve(specifier, context);
}
