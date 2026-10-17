#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { errorMessage } from './errors.js';
try {
  await createServer().connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(`mcp-eudamed: ${errorMessage(error)}\n`);
  process.exitCode = 1;
}
