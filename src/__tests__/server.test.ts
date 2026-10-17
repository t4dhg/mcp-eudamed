import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';
import { EudamedClient } from '../client.js';
import { readConfig } from '../config.js';
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close()));
  clients.length = 0;
});
async function connect(customFetch?: typeof fetch) {
  const api = new EudamedClient(readConfig({}), {
    fetch:
      customFetch ??
      (async (input) =>
        new Response(
          JSON.stringify({
            value: String(input).includes('/reference')
              ? [{ CODE: 'STATUS_ID', ID: -1, LANGUAGE: 'en', VALUE: 'Active' }]
              : String(input).includes('/actors')
                ? [
                    {
                      ACTOR_ID: 'US-MF-000000001',
                      NAME: 'Example',
                      ACT_EMAIL: 'private@example.org',
                    },
                  ]
                : [{ PRIMARY_DI: '0001', TRADE_NAME: 'Example', MF_SRN: 'US-MF-000000001' }],
          }),
        )),
  });
  const server = createServer(api);
  const client = new Client({ name: 'test', version: '1.0.0' });
  clients.push(client);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return client;
}
describe('MCP protocol', () => {
  it('discovers five read-only tools and executes each over the protocol', async () => {
    const client = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual([
      'eudamed_devices',
      'eudamed_actors',
      'eudamed_discover_actors',
      'eudamed_references',
      'eudamed_investigate',
    ]);
    expect(tools.tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
    for (const [name, args] of [
      ['eudamed_devices', { tradeName: 'Example' }],
      ['eudamed_actors', { actorId: 'US-MF-000000001' }],
      ['eudamed_discover_actors', { name: 'Example' }],
      ['eudamed_references', {}],
      ['eudamed_investigate', { tradeName: 'Example' }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toBeTruthy();
    }
  });
  it('rejects invalid tool calls and exposes errors as MCP errors', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'eudamed_devices', arguments: {} });
    expect(result.isError).toBe(true);
  });
  it('serves workflow resources and prompts without fetching private data', async () => {
    const client = await connect();
    const resources = await client.listResources();
    const prompts = await client.listPrompts();
    expect(resources.resources.length).toBe(5);
    expect(prompts.prompts.length).toBe(3);
    for (const resource of resources.resources) {
      const result = await client.readResource({ uri: resource.uri });
      expect('text' in result.contents[0] && result.contents[0].text).toBeTruthy();
    }
    for (const prompt of prompts.prompts) {
      const result = await client.getPrompt({ name: prompt.name, arguments: { query: 'Example' } });
      expect(JSON.stringify(result.messages)).toContain('Example');
    }
  });
});

describe('MCP output boundaries', () => {
  it('retains device evidence and raw fields when reference decoding fails', async () => {
    const client = await connect(async (input) =>
      String(input).includes('/reference')
        ? new Response('', { status: 400 })
        : new Response(JSON.stringify({ value: [{ PRIMARY_DI: '0001', EXTRA: 'retained' }] })),
    );
    const result = await client.callTool({
      name: 'eudamed_devices',
      arguments: { primaryDi: '0001', raw: true },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      referenceError: 'EUDAMED returned HTTP 400',
      records: [expect.objectContaining({ raw: { PRIMARY_DI: '0001', EXTRA: 'retained' } })],
    });
  });
  it('rejects oversized MCP output with actionable guidance', async () => {
    const client = await connect(
      async (input) =>
        new Response(
          JSON.stringify({
            value: String(input).includes('/reference')
              ? []
              : [{ PRIMARY_DI: '0001', EXTRA: 'x'.repeat(260000) }],
          }),
        ),
    );
    const result = await client.callTool({
      name: 'eudamed_devices',
      arguments: { primaryDi: '0001', raw: true },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('lower limits');
    expect(JSON.stringify(result.content).length).toBeLessThan(500);
  });
});

describe('investigation report over MCP', () => {
  it('returns concise prose in text content and detailed evidence as structured content', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'eudamed_investigate',
      arguments: { primaryDi: '0001' },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      targetEvidence: expect.any(Array),
      portfolioEvidence: expect.any(Array),
      report: expect.stringContaining('EUDAMED investigation'),
    });
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('Primary DI: 0001') }),
    ]);
  });
  it('propagates MCP cancellation to the active HTTP request', async () => {
    let aborted = false;
    let started!: () => void;
    const began = new Promise<void>((r) => {
      started = r;
    });
    const client = await connect(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          started();
          init!.signal!.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('stop'));
          });
        }),
    );
    const controller = new AbortController();
    const call = expect(
      client.callTool(
        { name: 'eudamed_investigate', arguments: { primaryDi: '0001' } },
        undefined,
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
    await began;
    controller.abort();
    await call;
    await new Promise((r) => setTimeout(r, 10));
    expect(aborted).toBe(true);
  });
});
