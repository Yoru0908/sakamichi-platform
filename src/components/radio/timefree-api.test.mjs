import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRadikoUrl, formatFtJst, errorMessage, downloadUrl } from './timefree-api.ts';

test('parses radiko ts share url', () => {
  assert.deepEqual(
    parseRadikoUrl('https://radiko.jp/#!/ts/FMKAGAWA/20260928050000'),
    { stationId: 'FMKAGAWA', ft: '20260928050000' });
});

test('parses radiko share query url', () => {
  assert.deepEqual(
    parseRadikoUrl('https://radiko.jp/share/?sid=TBS&t=20260928050000'),
    { stationId: 'TBS', ft: '20260928050000' });
});

test('rejects malformed or unsupported urls', () => {
  for (const bad of [
    'https://radiko.jp/#!/live/FMKAGAWA',
    'https://radiko.jp/#!/ts/fmkagawa/20260928050000',
    'https://radiko.jp/#!/ts/FMKAGAWA/202609280500',
    'https://radiko.jp/share/?sid=FMKAGAWA',
    'https://example.com/#!/ts/FMKAGAWA/20260928050000',
    'https://radiko.jp/#!/ts/FMKAGAWA/20261332050000',
    '',
    'not a url',
  ]) {
    assert.equal(parseRadikoUrl(bad), null, bad);
  }
});

test('formats ft as JST display string', () => {
  assert.equal(formatFtJst('20260928050000'), '2026-09-28 05:00');
});

test('maps error codes to Chinese messages', () => {
  for (const code of ['invalid_url', 'program_not_found', 'not_ended', 'expired',
    'too_long', 'busy', 'disk_full', 'unauthorized', 'origin_denied', 'auth_upstream']) {
    const msg = errorMessage(code);
    assert.ok(msg && msg.length > 0, code);
  }
  assert.equal(errorMessage('unauthorized'), '请先登录');
  assert.ok(errorMessage('something_else').length > 0);
});

test('prefixes signed download path with api host', () => {
  assert.equal(
    downloadUrl('/api/radio/timefree/file/FMT_20260928050000.m4a?exp=1&sig=x'),
    'https://api.46log.com/api/radio/timefree/file/FMT_20260928050000.m4a?exp=1&sig=x');
});
