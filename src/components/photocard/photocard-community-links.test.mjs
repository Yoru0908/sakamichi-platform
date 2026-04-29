import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPhotocardWorkPath, buildPhotocardAuthorPath } from './photocard-community-links.ts';

test('buildPhotocardWorkPath returns canonical detail path', () => {
  assert.equal(buildPhotocardWorkPath('work_123'), '/photocard/work_123');
});

test('buildPhotocardAuthorPath returns canonical author path', () => {
  assert.equal(buildPhotocardAuthorPath('user_456'), '/photocard/user/user_456');
  assert.equal(buildPhotocardAuthorPath(null), null);
  assert.equal(buildPhotocardAuthorPath(''), null);
});
