import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = [
  'src/data.js',
  'src/dealer.js',
  'src/game.js',
  'src/dragdrop.js',
  'src/scoring.js',
  'src/critics.js',
  'src/ranking.js',
  'src/storage.js',
  'src/results.js',
  'src/intro.js',
  'src/meiku.js',
  'src/main.js',
];

const [deckText, seedText] = await Promise.all([
  readFile(path.join(root, 'data/deck.json'), 'utf8'),
  readFile(path.join(root, 'data/seed.json'), 'utf8'),
]);
const deckJson = JSON.stringify(JSON.parse(deckText));
const seedJson = JSON.stringify(JSON.parse(seedText));

const sections = [];
for (const file of sourceFiles) {
  let source = await readFile(path.join(root, file), 'utf8');
  source = source
    .replace(/^import\s+.+?;\r?\n/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function|const|let|class)/g, '');

  if (file === 'src/main.js') {
    source = source
      .replace(
        "const deckJson = await fetch('./data/deck.json').then((r) => r.json());",
        `const deckJson = ${deckJson};`,
      )
      .replace(
        "const seedJson = await fetch('./data/seed.json').then((r) => r.json());",
        `const seedJson = ${seedJson};`,
      );
  }

  sections.push(`// ---- ${file} ----\n${source.trim()}`);
}

const bundle = `(() => {\n'use strict';\n\n${sections.join('\n\n')}\n})();\n`;
await writeFile(path.join(root, 'dist/app.js'), bundle, 'utf8');
