// Verifies every package entry point resolves and loads as ESM and as CJS (what consumers will do).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const failures = [];
let checked = 0;

for (const dir of fs.readdirSync(path.join(root, 'packages'))) {
  const pkgDir = path.join(root, 'packages', dir);
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
    if (subpath.includes('*') || subpath === './package.json' || typeof target === 'string') continue;
    const esm = target.import?.default;
    const cjs = target.require?.default;
    for (const [kind, file] of [['import', esm], ['require', cjs]]) {
      if (!file) continue;
      const abs = path.join(pkgDir, file);
      checked += 1;
      if (!fs.existsSync(abs)) {
        failures.push(`${pkg.name}${subpath} ${kind}: missing ${file}`);
        continue;
      }
      if (fs.existsSync(path.join(pkgDir, target[kind].types)) === false) failures.push(`${pkg.name}${subpath}: missing types ${target[kind].types}`);
      try {
        if (kind === 'import') await import(pathToFileURL(abs).href);
        else require(abs);
      } catch (e) {
        failures.push(`${pkg.name}${subpath} ${kind}: ${e.message}`);
      }
    }
  }
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`smoke-dist: ${checked} entry points load (ESM + CJS) with types present`);
