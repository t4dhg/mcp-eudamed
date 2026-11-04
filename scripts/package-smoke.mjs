import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'eudamed-package-'));
try {
  const { filename } = JSON.parse(
    execFileSync(process.execPath, ['scripts/check-package.mjs', dir], { encoding: 'utf8' }),
  );
  await writeFile(join(dir, 'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync(
    'npm',
    [
      'install',
      '--engine-strict',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(dir, filename),
    ],
    { cwd: dir, stdio: 'pipe', timeout: 120000 },
  );
  const pkg = JSON.parse(
    await readFile(join(dir, 'node_modules/@t4dhg/mcp-eudamed/package.json'), 'utf8'),
  );
  assert.equal(pkg.name, '@t4dhg/mcp-eudamed');
  const imported = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'const m=await import("@t4dhg/mcp-eudamed"); if(typeof m.EudamedClient!=="function") process.exit(1);',
    ],
    { cwd: dir, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(imported, '');
  execFileSync('npm', ['audit', '--audit-level=low'], { cwd: dir, stdio: 'pipe', timeout: 120000 });
  execFileSync(
    process.execPath,
    ['scripts/stdio-smoke.mjs', resolve(dir, 'node_modules/.bin/mcp-eudamed')],
    { stdio: 'pipe', timeout: 30000 },
  );
  console.log(
    'Clean tarball install, library import, installed executable, MCP discovery and validation passed.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
