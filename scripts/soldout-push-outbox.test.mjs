import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  completeSoldoutPush,
  enqueueSoldoutPush,
  listSoldoutPushes,
  requireNapcatSuccess,
  saveSoldoutPush,
} from './soldout-push-outbox.mjs';

async function temporaryOutbox() {
  const parent = existsSync('/vol1') ? '/vol1/tmp' : tmpdir();
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, 'soldout-push-outbox-test-'));
}

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test('requireNapcatSuccess rejects HTTP 200 business failures', async () => {
  await assert.rejects(
    requireNapcatSuccess(
      response({ status: 'failed', retcode: 1200, message: 'rich media transfer failed' }),
    ),
    /rich media transfer failed/,
  );
  await assert.rejects(
    requireNapcatSuccess(response({ status: 'ok', retcode: 0, data: {} })),
    /message_id/,
  );
  const payload = await requireNapcatSuccess(
    response({ status: 'ok', retcode: 0, data: { message_id: 123 } }),
  );
  assert.equal(payload.data.message_id, 123);
});

test('soldout push outbox survives failure state until completion', async () => {
  const outbox = await temporaryOutbox();
  try {
    const queued = await enqueueSoldoutPush(
      {
        eventSlug: 'hinatazaka_202609',
        group: 'hinatazaka',
        resultRound: 2,
        importResult: { newCells: 390, totalCells: 566 },
      },
      outbox,
    );
    queued.attempts = 1;
    queued.lastError = 'rich media transfer failed';
    await saveSoldoutPush(queued, outbox);

    const pending = await listSoldoutPushes(outbox);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].attempts, 1);
    assert.equal(pending[0].lastError, 'rich media transfer failed');

    await completeSoldoutPush(pending[0], outbox);
    assert.deepEqual(await listSoldoutPushes(outbox), []);
  } finally {
    await rm(outbox, { recursive: true, force: true });
  }
});
