import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertConnectorContract, assertQueueConfig, SourceConnector, Queue } from '../../ports/src/index.js';

const stub = (over = {}) => {
  const c = {}; for (const m of SourceConnector.methods) c[m] = () => {};
  c.accessPolicy = () => ({ max_concurrency: 6, permitted_methods: ['local'] });
  return Object.assign(c, over);
};

test('TC-030 REQ-001 a connector missing a contract method is rejected', () => {
  const c = stub(); delete c.discover;
  assert.throws(() => assertConnectorContract(c), /REQ-001/);
});

test('TC-031 REQ-007 a connector with no access policy cannot register', () => {
  assert.throws(() => assertConnectorContract(stub({ accessPolicy: () => null })), /REQ-007/);
});

test('TC-032 REQ-006 access policy must declare concurrency and permitted methods', () => {
  assert.throws(() => assertConnectorContract(stub({ accessPolicy: () => ({ max_concurrency: 6 }) })), /REQ-006/);
});

test('TC-033 NFR-024 bulk HTML retrieval is not an acceptable permitted method', () => {
  assert.throws(() => assertConnectorContract(
    stub({ accessPolicy: () => ({ max_concurrency: 6, permitted_methods: ['html-bulk'] }) })), /NFR-024/);
});

test('TC-034 DEC-025 a consumer refuses to start without a dead letter queue', () => {
  assert.throws(() => assertQueueConfig({ maxAttempts: 3 }), /DEC-025/);
  assert.ok(assertQueueConfig({ deadLetterQueue: 'dlq', maxAttempts: 3 }));
});

test('TC-035 REQ-019 maxAttempts must be bounded and positive', () => {
  assert.throws(() => assertQueueConfig({ deadLetterQueue: 'dlq', maxAttempts: 0 }), /REQ-019/);
});

test('TC-036 DEC-025 the queue port declares at-least-once with no ordering guarantee', () => {
  assert.equal(Queue.guarantees.delivery, 'at-least-once');
  assert.equal(Queue.guarantees.ordering, 'none');
  assert.equal(Queue.guarantees.requiresIdempotentConsumer, true);
});
