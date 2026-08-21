import { readdirSync } from 'fs';
import { join } from 'path';
import type { EmbedDefinition } from './types';

const SKIP = new Set(['types', 'registry', 'index']);

export const embedsMap = new Map<string, EmbedDefinition>();

export async function loadEmbeds(): Promise<void> {
  const files = readdirSync(__dirname).filter((f) => {
    const base = f.replace(/\.(ts|js)$/, '');
    return /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts') && !SKIP.has(base);
  });

  for (const file of files) {
    const mod = await import(join(__dirname, file));
    const candidates = new Set<unknown>([mod.default, ...Object.values(mod)]);
    for (const c of candidates) {
      if (isEmbedDefinition(c)) {
        if (embedsMap.has(c.name)) {
          throw new Error(`Дублирующееся имя embed-а: "${c.name}" (файл ${file})`);
        }
        embedsMap.set(c.name, c);
      }
    }
  }
}

function isEmbedDefinition(value: unknown): value is EmbedDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as EmbedDefinition).name === 'string' &&
    typeof (value as EmbedDefinition).build === 'function'
  );
}
