import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const dir = await mkdtemp(join(tmpdir(), 'eudamed-package-'));
let client;
try {
  const [{ filename, files }] = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', dir], { encoding: 'utf8' }),
  );
  assert.ok(files.some((f) => f.path === 'dist/cli.js'));
  assert.ok(
    !files.some((f) => /(?:__tests__|node_modules|^scripts\/|\.env|\.mcp\.json)/.test(f.path)),
  );
  await writeFile(join(dir, 'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(dir, filename)],
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
  client = new Client({ name: 'clean-package-smoke', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({ command: resolve(dir, 'node_modules/.bin/mcp-eudamed'), cwd: dir }),
  );
  assert.equal((await client.listTools()).tools.length, 5);
  const invalid = await client.callTool({
    name: 'eudamed_devices',
    arguments: { manufacturerSrn: 'Example Company' },
  });
  assert.equal(invalid.isError, true);
  assert.ok(
    (await client.getPrompt({ name: 'manufacturer_portfolio', arguments: { query: 'Example' } }))
      .messages.length,
  );
  console.log(
    'Clean tarball install, library import, installed executable, MCP discovery and validation passed.',
  );
} finally {
  await client?.close();
  await rm(dir, { recursive: true, force: true });
}
