import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../version.js';
import { workflows } from '../guides.js';
describe('package contract', () => {
  it('keeps manifest, lockfile and server versions synchronized', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    expect(pkg.version).toBe(VERSION);
    expect(lock.version).toBe(VERSION);
    expect(lock.packages[''].version).toBe(VERSION);
    const manifest = JSON.parse(readFileSync('server.json', 'utf8'));
    expect(manifest.name).toBe(pkg.mcpName);
    expect(manifest.version).toBe(VERSION);
    expect(manifest.packages[0].version).toBe(VERSION);
    expect(manifest.packages[0].identifier).toBe(pkg.name);
    expect(manifest.description.length).toBeLessThanOrEqual(100);
    expect(pkg.bin['mcp-eudamed']).toBe('dist/cli.js');
    expect(pkg.exports['.'].default).toBe('./dist/index.js');
  });
  it('documents every prompt in the shipped usage references', () => {
    for (const file of ['README.md', 'llms.txt']) {
      const text = readFileSync(file, 'utf8');
      for (const name of Object.keys(workflows)) expect(text).toContain(name);
      for (const tool of [
        'eudamed_devices',
        'eudamed_actors',
        'eudamed_references',
        'eudamed_investigate',
      ])
        expect(text).toContain(tool);
    }
  });
});
