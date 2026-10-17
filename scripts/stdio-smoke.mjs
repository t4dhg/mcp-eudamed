import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'stdio-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/cli.js'],
  stderr: 'pipe',
});
let stderr = '';
transport.stderr?.on('data', (chunk) => {
  stderr += chunk;
});
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 5);
  assert.equal((await client.listPrompts()).prompts.length, 3);
  assert.equal((await client.listResources()).resources.length, 5);
  const guide = await client.readResource({ uri: 'eudamed://guides/evidence' });
  assert.match(guide.contents[0].text, /unverified/);
  const invalid = await client.callTool({ name: 'eudamed_devices', arguments: {} });
  assert.equal(invalid.isError, true);
  assert.equal(stderr, '');
  console.log('Built stdio handshake, discovery, resource and validation checks passed.');
} finally {
  await client.close();
}
