import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpClient } from '../http-client.js';
import { readConfig } from '../config.js';

describe('upstream collection bounds', () => {
  it('rejects an oversized malformed page before visiting any record', async () => {
    let visited = 0;
    const record = z.preprocess(
      (value) => {
        visited++;
        return value;
      },
      z.object({ ACTOR_ID: z.string() }),
    );
    const http = new HttpClient(
      { ...readConfig({}), maxRetries: 0 },
      {
        fetch: async () => new Response(JSON.stringify({ value: Array(10001).fill(0) })),
      },
    );
    await expect(http.get('actors', {}, record)).rejects.toThrow('response schema changed');
    expect(visited).toBe(0);
  });

  it('preserves a valid page at the existing record limit', async () => {
    const http = new HttpClient(readConfig({}), {
      fetch: async () =>
        new Response(JSON.stringify({ value: Array(10000).fill({ ACTOR_ID: 'US-MF-000000001' }) })),
    });
    const result = await http.get('actors', {}, z.object({ ACTOR_ID: z.string() }));
    expect(result.records).toHaveLength(10000);
    expect(result.pagination.complete).toBe(true);
  });
});
