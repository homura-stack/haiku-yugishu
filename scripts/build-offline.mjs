import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
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
  'src/hard-composer.js',
  'src/hard-mora.js',
  'src/hard-plagiarism.js',
  'src/hard-critic.js',
  'src/hard-rounds.js',
  'src/hard-best.js',
  'src/hard-feedback.js',
  'src/hard-mode.js',
  'src/main.js',
];

export async function createOfflineBundle(projectRoot = root) {
  const [deckText, seedText, hardSourceText] = await Promise.all([
    readFile(path.join(projectRoot, 'data/deck.json'), 'utf8'),
    readFile(path.join(projectRoot, 'data/seed.json'), 'utf8'),
    readFile(path.join(projectRoot, 'data/hard-source-haiku.json'), 'utf8'),
  ]);
  const deckJson = JSON.stringify(JSON.parse(deckText));
  const seedJson = JSON.stringify(JSON.parse(seedText));
  const hardSourceJson = JSON.stringify(JSON.parse(hardSourceText));
  const sections = [];
  const hardSections = [];

  for (const file of sourceFiles) {
    let source = await readFile(path.join(projectRoot, file), 'utf8');
    source = source
      .replace(/^import\s+[\s\S]*?from\s+['"].+?['"];\r?\n/gm, '')
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

    if (file === 'src/hard-mode.js') {
      source = source.replace(
        "const sourceHaiku = await fetch('./data/hard-source-haiku.json').then((response) => response.json());",
        `const sourceHaiku = ${hardSourceJson};`,
      );
    }

    if (file.startsWith('src/hard-')) {
      hardSections.push(`// ---- ${file} ----\n${source.trim()}`);
    } else {
      if (file === 'src/main.js') {
        sections.push(`// ---- hard mode isolated bundle ----\nconst { showHardIntro, isHardPlaying, abandonHardGame, hardBestScore } = (() => {\n${hardSections.join('\n\n')}\nreturn { showHardIntro, isHardPlaying, abandonHardGame, hardBestScore };\n})();`);
      }
      sections.push(`// ---- ${file} ----\n${source.trim()}`);
    }
  }

  return `(() => {\n'use strict';\n\n${sections.join('\n\n')}\n})();\n`;
}

export async function writeOfflineBundle(projectRoot = root) {
  const bundle = await createOfflineBundle(projectRoot);
  await writeFile(path.join(projectRoot, 'dist/app.js'), bundle, 'utf8');
}

export async function checkOfflineBundle(projectRoot = root) {
  const [actual, expected] = await Promise.all([
    readFile(path.join(projectRoot, 'dist/app.js'), 'utf8'),
    createOfflineBundle(projectRoot),
  ]);
  if (actual !== expected) throw new Error('dist/app.js is stale; run npm run build:js');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  if (process.argv.includes('--check')) await checkOfflineBundle();
  else await writeOfflineBundle();
}
