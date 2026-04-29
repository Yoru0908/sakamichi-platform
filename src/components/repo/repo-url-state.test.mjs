import test from 'node:test';
import assert from 'node:assert/strict';

import { getInitialRepoTab, getRepoIdFromSearch } from './repo-url-state.ts';

test('getInitialRepoTab returns generator only for explicit create mode', () => {
  assert.equal(getInitialRepoTab('generator'), 'generator');
  assert.equal(getInitialRepoTab('community'), 'community');
  assert.equal(getInitialRepoTab(undefined), 'community');
  assert.equal(getInitialRepoTab('anything-else'), 'community');
});

test('getRepoIdFromSearch reads repo id from url query string', () => {
  assert.equal(getRepoIdFromSearch('?id=abc123'), 'abc123');
  assert.equal(getRepoIdFromSearch('https://46log.com/repo?id=xyz789'), 'xyz789');
  assert.equal(getRepoIdFromSearch('?foo=bar'), null);
  assert.equal(getRepoIdFromSearch(''), null);
});
