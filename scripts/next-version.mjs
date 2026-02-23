import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const current = pkg.version || '0.0.0';

const toParts = (v) => v.split('.').map((n) => Number(n));
const [major, minor, patch] = toParts(current);

const tags = (() => {
  try {
    const raw = execSync("git tag --list 'v*'", { encoding: 'utf8' });
    return raw.split('\n').filter(Boolean);
  } catch {
    return [];
  }
})();

const tagSet = new Set(tags);

const maxAttempts = 1000;
let nextPatch = patch + 1;
let candidate = `${major}.${minor}.${nextPatch}`;
let attempts = 0;

while (tagSet.has(`v${candidate}`) && attempts < maxAttempts) {
  nextPatch += 1;
  candidate = `${major}.${minor}.${nextPatch}`;
  attempts += 1;
}

process.stdout.write(candidate);
