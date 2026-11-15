// Fails when a production build (dist/) contains demo fixtures or demo-only code (F-06).
//
// Run after `npm run build`: `npm run check:demo-free`. The markers are read from the demo
// sources themselves, every quoted id and email in demoStore.ts and in the services that keep
// inline demo data, so a new fixture is covered without editing this script.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const assets = join(root, 'dist', 'assets');
if (!existsSync(assets)) {
  console.error('No dist/assets: run `npm run build` first.');
  process.exit(2);
}

const DEMO_SOURCES = ['src/services/demoStore.ts', 'src/services/responsibilities.ts', 'src/services/automations.ts'];
const markers = new Set(['addAllDemoAttachments']);
for (const file of DEMO_SOURCES) {
  const source = readFileSync(join(root, file), 'utf8');
  // Demo record ids ("lead-1", "demo-rule-1"...) and fixture emails. Ids are only taken from
  // demoStore, or when they start with "demo-", so a real constant never becomes a marker.
  for (const [, value] of source.matchAll(/\bid: '([^']+)'/g)) {
    if (file.endsWith('demoStore.ts') || value.startsWith('demo-')) markers.add(value);
  }
  for (const [, value] of source.matchAll(/'([^'\s]+@[^'\s]+\.[a-z]+)'/g)) markers.add(value);
}

const found = [];
for (const name of readdirSync(assets).filter((file) => file.endsWith('.js'))) {
  const code = readFileSync(join(assets, name), 'utf8');
  for (const marker of markers) {
    if (code.includes(`"${marker}"`) || code.includes(`'${marker}'`) || (marker === 'addAllDemoAttachments' && code.includes(marker))) {
      found.push(`${name}: ${marker}`);
    }
  }
}

if (found.length) {
  console.error(`Demo content in the production build (${found.length}):\n  ${found.join('\n  ')}`);
  process.exit(1);
}
console.log(`No demo content in dist/assets (${markers.size} markers checked).`);
