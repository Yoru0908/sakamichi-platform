import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRefreshCredential,
  EMERGENCY_REFRESH_TTL_SECONDS,
  isD1QuotaError,
  NORMAL_REFRESH_TTL_SECONDS,
} from './refresh-token.ts';
import {
  signAccessToken,
  verifyAccessToken,
  verifyEmergencyRefreshToken,
} from './jwt.ts';

const secret = 'test-secret-that-is-not-used-in-production';

function mockEnv(run) {
  return {
    JWT_SECRET: secret,
    DB: {
      prepare() {
        return {
          bind() {
            return { run };
          },
        };
      },
    },
  };
}

test('isD1QuotaError recognizes Cloudflare error 7500 without hiding unrelated failures', () => {
  assert.equal(isD1QuotaError(new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit. [code: 7500]")), true);
  assert.equal(isD1QuotaError(new Error('D1_ERROR: no such table')), false);
});

test('createRefreshCredential stores the normal revocable token when D1 is available', async () => {
  let writes = 0;
  const credential = await createRefreshCredential(mockEnv(async () => {
    writes += 1;
    return { success: true };
  }), 'user-1', 'member');

  assert.equal(writes, 1);
  assert.equal(credential.emergency, false);
  assert.equal(credential.maxAge, NORMAL_REFRESH_TTL_SECONDS);
  assert.match(credential.token, /^[0-9a-f-]{36}$/i);
});

test('createRefreshCredential falls back to a typed 24-hour token only for D1 quota exhaustion', async () => {
  const quotaError = new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit. [code: 7500]");
  const credential = await createRefreshCredential(mockEnv(async () => {
    throw quotaError;
  }), 'user-2', 'admin');

  assert.equal(credential.emergency, true);
  assert.equal(credential.maxAge, EMERGENCY_REFRESH_TTL_SECONDS);
  assert.equal(await verifyAccessToken(credential.token, secret), null);
  assert.deepEqual(
    Object.fromEntries(Object.entries(await verifyEmergencyRefreshToken(credential.token, secret)).filter(([key]) => ['sub', 'role', 'tokenType'].includes(key))),
    { sub: 'user-2', role: 'admin', tokenType: 'emergency_refresh' },
  );
});

test('createRefreshCredential rethrows unrelated D1 errors', async () => {
  await assert.rejects(
    createRefreshCredential(mockEnv(async () => {
      throw new Error('D1_ERROR: no such table');
    }), 'user-3', 'member'),
    /no such table/,
  );
});

test('emergency refresh tokens cannot be used as access tokens and vice versa', async () => {
  const access = await signAccessToken('user-4', 'member', secret);
  assert.equal((await verifyAccessToken(access, secret))?.sub, 'user-4');
  assert.equal(await verifyEmergencyRefreshToken(access, secret), null);
});
