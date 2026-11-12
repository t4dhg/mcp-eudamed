import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const directory = mkdtempSync(join(tmpdir(), 'mcp-stdio-smoke-'));
const entry = resolve(process.argv[2] ?? 'dist/cli.js');
const packageVersion = JSON.parse(
  readFileSync(resolve(dirname(realpathSync(entry)), '../package.json'), 'utf8'),
).version;
const server = spawn(process.execPath, [entry], {
  cwd: directory,
  env: {
    PATH: process.env.PATH,
    EUDAMED_BASE_URL: 'https://127.0.0.1:1',
    EUDAMED_MAX_RETRIES: '0',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const exited = new Promise((resolveExit, reject) => {
  server.once('exit', (code, signal) => resolveExit({ code, signal }));
  server.once('error', reject);
});
const pending = new Map();
let nextId = 0;
let stderr = '';
server.stderr.on('data', (data) => {
  stderr = (stderr + data.toString()).slice(-4000);
});
const lines = createInterface({ input: server.stdout });
lines.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    pending.get(response.id)?.(response);
  } catch {
    stderr += 'Invalid JSON on server stdout';
    server.kill();
  }
});
function request(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolveResponse, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out: ${stderr}`));
    }, 10000);
    pending.set(id, (response) => {
      clearTimeout(timeout);
      pending.delete(id);
      resolveResponse(response);
    });
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}
try {
  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'package-smoke', version: '1.0.0' },
  });
  assert.equal(initialized.result?.serverInfo.name, 'mcp-eudamed');
  assert.equal(initialized.result?.serverInfo.version, packageVersion);
  server.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
  );
  const listed = await request('tools/list');
  assert.equal(listed.result?.tools.length, 6);
  const invalid = await request('tools/call', {
    name: 'eudamed_devices',
    arguments: { manufacturerSrn: 'Example Company' },
  });
  assert(invalid.error || invalid.result?.isError, 'Invalid tool input was accepted');
  const resources = await request('resources/list');
  assert.equal(resources.result?.resources.length, 5);
  const prompts = await request('prompts/list');
  assert.equal(prompts.result?.prompts.length, 3);
  const guide = await request('resources/read', { uri: 'eudamed://guides/evidence' });
  assert.match(guide.result?.contents[0]?.text ?? '', /unverified/);
  const prompt = await request('prompts/get', {
    name: 'manufacturer_portfolio',
    arguments: { query: 'Example' },
  });
  assert(prompt.result?.messages.length > 0);
  server.stdin.end();
  const shutdownTimeout = setTimeout(() => server.kill('SIGKILL'), 5000);
  const shutdown = await exited;
  clearTimeout(shutdownTimeout);
  assert.equal(shutdown.code, 0, `Server shutdown failed (${shutdown.signal}): ${stderr}`);
  console.log(
    `MCP smoke passed on ${process.version}: initialize, discovery, validation and shutdown`,
  );
} finally {
  server.kill();
  lines.close();
  rmSync(directory, { recursive: true, force: true });
}
