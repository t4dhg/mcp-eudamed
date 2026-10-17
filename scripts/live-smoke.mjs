import assert from 'node:assert/strict';
import { EudamedClient, normalizeDevice } from '../dist/index.js';
const client = new EudamedClient();
const primaryDi = process.env.EUDAMED_SMOKE_PRIMARY_DI;
const actorId = process.env.EUDAMED_SMOKE_ACTOR_ID;
const language = process.env.EUDAMED_SMOKE_LANGUAGE ?? 'en';
const references = await client.referenceData(language);
assert.ok(references.records.some((row) => row.CODE === 'RISK_CLASS_ID'));
console.log(
  `Reference contract OK: ${references.records.length} rows, ${references.provenance.retrievedAt}`,
);
if (primaryDi) {
  const devices = await client.devices({ primaryDi, exact: true, limit: 1 });
  assert.ok(devices.records.length > 0, 'Known device not returned: investigate upstream changes');
  assert.equal(devices.records[0].PRIMARY_DI?.trim(), primaryDi.trim());
  const normalized = normalizeDevice(devices.records[0], references.records);
  assert.equal(normalized.documents.ifu.status, 'unverified');
  const legislation = process.env.EUDAMED_SMOKE_EXPECT_LEGISLATION;
  if (legislation)
    assert.ok(
      normalized.decoded.APPLICABLE_LEGISLATION_ID.label?.includes(legislation),
      'Unexpected legislation translation; inspect upstream record',
    );
  console.log('Exact device lookup and normalization passed; record payload omitted.');
}
if (actorId) {
  const actors = await client.actors({ actorId });
  assert.ok(actors.records.length > 0, 'Known actor not returned: investigate upstream changes');
  assert.equal(actors.records[0].ACTOR_ID.trim().toLowerCase(), actorId.trim().toLowerCase());
  assert.ok(!('PRRC_FIRST_NAME' in actors.records[0]));
  console.log('Exact actor lookup and privacy projection passed; record payload omitted.');
}
if (!primaryDi || !actorId)
  console.log(
    'Set EUDAMED_SMOKE_PRIMARY_DI and EUDAMED_SMOKE_ACTOR_ID to include device and actor live checks.',
  );

if (process.env.EUDAMED_SMOKE_ACTOR_NAME) {
  const result = await client.discoverActors({ name: process.env.EUDAMED_SMOKE_ACTOR_NAME });
  assert.equal(result.failures.length, 0, 'Actor discovery endpoint failure');
  assert.ok(result.candidates.length, 'Known registered actor name not found');
  if (actorId)
    assert.ok(
      result.candidates.some((row) => row.ACTOR_ID === actorId),
      'Known name did not resolve to expected actor',
    );
  console.log('Actor name discovery passed; record payload omitted.');
}
