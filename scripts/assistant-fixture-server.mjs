// Synthetic upstream boundary for autonomous MCP-client evaluation; never used by the CLI.
import { appendFile } from 'node:fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, EudamedClient, readConfig } from '../dist/index.js';
const actor = {
  ACTOR_ID: 'US-MF-000000001',
  NAME: 'Example Medical Ltd',
  ACTOR_TYPE: 'Manufacturer',
  ACT_COUNTRY_ISO2_CODE: 'US',
};
const devices = [
  {
    PRIMARY_DI: '00012345678905',
    TRADE_NAME: 'Example Device',
    MF_SRN: actor.ACTOR_ID,
    MF_NAME: actor.NAME,
  },
  { PRIMARY_DI: 'D-Other8U', TRADE_NAME: 'Other Device', MF_SRN: actor.ACTOR_ID },
];
const api = new EudamedClient(
  { ...readConfig({}), maxRetries: 0 },
  {
    fetch: async (input) => {
      const u = new URL(String(input));
      await appendFile(
        process.env.EUDAMED_EVAL_TRACE,
        JSON.stringify({ path: u.pathname, query: Object.fromEntries(u.searchParams) }) + '\n',
      );
      if (u.searchParams.get('PRIMARY_DI') === 'D-Outage8U')
        return new Response('', { status: 503 });
      let value = [];
      if (u.pathname.endsWith('/actors')) {
        if (
          u.searchParams.get('NAME') === 'Example Medical Ltd' ||
          u.searchParams.get('ACTOR_ID') === actor.ACTOR_ID
        )
          value = [actor];
        if (u.searchParams.get('NAME') === 'Ambiguous Medical')
          value = [
            { ...actor, NAME: 'Ambiguous Medical' },
            {
              ...actor,
              NAME: 'Ambiguous Medical',
              ACTOR_ID: 'DE-MF-000000002',
              ACT_COUNTRY_ISO2_CODE: 'DE',
            },
          ];
      } else if (u.pathname.endsWith('/udi')) {
        value = devices.filter((d) =>
          ['PRIMARY_DI', 'TRADE_NAME', 'MF_SRN'].every(
            (k) => !u.searchParams.has(k) || d[k] === u.searchParams.get(k),
          ),
        );
      }
      return new Response(JSON.stringify({ value }));
    },
  },
);
await createServer(api).connect(new StdioServerTransport());
