#!/usr/bin/env node
/**
 * Fortune Meets 全国ミーグリ応募抽選 watcher.
 *
 * 公开 config → 标准化 → snapshot diff → 生成图 → QQ + Weibo.
 * 默认监视 櫻坂46 15th，后续可通过 FORTUNEMEETS_EVENTS 扩展：
 *   FORTUNEMEETS_EVENTS=sakurazaka46/15th,hinatazaka46/17th
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchFortuneMeetsAnalysis } from './fortunemeets-analysis.mjs';
import { generateFortuneMeetsImage } from './fortunemeets-image-gen.mjs';
import { isWeiboEnabled, publishToWeibo } from './weibo-publisher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = process.env.FORTUNEMEETS_SNAPSHOT_DIR || join(__dirname, '..', '.cache', 'fortunemeets');
const NAPCAT_URL = process.env.NAPCAT_URL || 'http://127.0.0.1:3002';
const NAPCAT_TOKEN = process.env.NAPCAT_TOKEN || '';
const PUSH_GROUP_ID = process.env.PUSH_GROUP_ID || '768670254';
const DRY_RUN = process.argv.includes('--dry-run');

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function parseEvents() {
  const raw = process.env.FORTUNEMEETS_EVENTS || 'sakurazaka46/15th';
  return raw.split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [artist, event] = item.split('/');
      if (!artist || !event) throw new Error(`Invalid FORTUNEMEETS_EVENTS item: ${item}`);
      return { artist, event };
    });
}

function snapshotPath(analysis) {
  return join(SNAPSHOT_DIR, `${analysis.eventId}.json`);
}

function closedKey(award, slot, member) {
  return `${award.awardId}|${award.mode}|${slot.id}|${member}`;
}

function currentClosedKeys(analysis) {
  const keys = new Set();
  for (const award of analysis.awards) {
    for (const slot of award.slots) {
      for (const member of slot.closedMembers) {
        keys.add(closedKey(award, slot, member));
      }
    }
  }
  return keys;
}

function loadSnapshot(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function saveSnapshot(path, analysis, closedKeys) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({
    eventId: analysis.eventId,
    updatedAt: new Date().toISOString(),
    closedKeys: Array.from(closedKeys).sort(),
  }, null, 2));
}

function diffClosedKeys(previous, current) {
  const oldSet = new Set(previous?.closedKeys || []);
  return Array.from(current).filter((key) => !oldSet.has(key));
}

function summarizeNewKeys(analysis, newKeys) {
  const rows = [];
  const newSet = new Set(newKeys);
  for (const award of analysis.awards) {
    let count = 0;
    const members = new Set();
    for (const slot of award.slots) {
      for (const member of slot.closedMembers) {
        const key = closedKey(award, slot, member);
        if (newSet.has(key)) {
          count += 1;
          members.add(member);
        }
      }
    }
    if (count > 0) {
      rows.push({ mode: award.mode, count, members: Array.from(members).sort((a, b) => a.localeCompare(b, 'ja')) });
    }
  }
  return rows;
}

async function sendToQQ(message) {
  const groups = PUSH_GROUP_ID.split(',').map((item) => item.trim()).filter(Boolean);
  for (const groupId of groups) {
    const res = await fetch(`${NAPCAT_URL}/send_group_msg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(NAPCAT_TOKEN ? { Authorization: `Bearer ${NAPCAT_TOKEN}` } : {}),
      },
      body: JSON.stringify({ group_id: Number(groupId), message }),
    });
    if (res.ok) console.log(`[${ts()}]   QQ pushed to ${groupId}`);
    else console.error(`[${ts()}]   QQ push failed ${groupId}: ${res.status}`);
  }
}

function buildText(analysis, summary) {
  const lines = [
    '【全国ミーグリ応募抽選 更新】',
    `${analysis.groupName} ${analysis.eventId}`,
    '',
    ...summary.map((item) => `${item.mode === 'real' ? 'リアル' : 'オンライン'}：新增关闭 ${item.count} 枠 / ${item.members.length} 名`),
    '',
    analysis.sourceUrl,
  ];
  return lines.join('\n');
}

function buildWeiboText(analysis, summary) {
  return [
    '【全国ミーグリ応募抽選 更新】',
    `${analysis.groupName} ${analysis.eventId}`,
    ...summary.map((item) => `${item.mode === 'real' ? 'リアルミーグリ' : 'オンラインミーグリ'} 新增关闭 ${item.count} 枠`),
    '',
    '#櫻坂46# #全国ミーグリ# #ミーグリ#',
  ].join('\n');
}

async function handleEvent(source) {
  console.log(`\n[${ts()}] Checking ${source.artist}/${source.event}`);
  const analysis = await fetchFortuneMeetsAnalysis(source);
  const path = snapshotPath(analysis);
  const previous = loadSnapshot(path);
  const current = currentClosedKeys(analysis);
  const newKeys = diffClosedKeys(previous, current);

  console.log(`[${ts()}]   closed=${current.size}, new=${newKeys.length}, snapshot=${previous ? 'yes' : 'no'}`);
  saveSnapshot(path, analysis, current);

  if (!previous) {
    console.log(`[${ts()}]   Initial snapshot saved; skip push`);
    return;
  }
  if (newKeys.length === 0) {
    console.log(`[${ts()}]   No new closed cells`);
    return;
  }

  const summary = summarizeNewKeys(analysis, newKeys);
  const real = await generateFortuneMeetsImage({ source, mode: 'real', analysis });
  const online = await generateFortuneMeetsImage({ source, mode: 'online', analysis });
  const realBase64 = real.toString('base64');
  const onlineBase64 = online.toString('base64');

  const text = buildText(analysis, summary);
  const message = [
    { type: 'text', data: { text: `${text}\n` } },
    { type: 'image', data: { file: `base64://${realBase64}` } },
    { type: 'image', data: { file: `base64://${onlineBase64}` } },
  ];

  if (DRY_RUN) {
    console.log(`[${ts()}]   Dry run: skip QQ/Weibo push`);
    return;
  }

  await sendToQQ(message);

  if (isWeiboEnabled()) {
    await publishToWeibo({
      text: buildWeiboText(analysis, summary),
      category: 'miguri_lottery_soldout',
      images: [
        { filename: `${analysis.eventId}-real.png`, contentType: 'image/png', base64: realBase64 },
        { filename: `${analysis.eventId}-online.png`, contentType: 'image/png', base64: onlineBase64 },
      ],
      meta: { eventId: analysis.eventId, source, summary },
    });
    console.log(`[${ts()}]   Weibo queued`);
  }
}

async function main() {
  console.log(`\n[${ts()}] === Fortune Meets Watcher ===`);
  for (const source of parseEvents()) {
    try {
      await handleEvent(source);
    } catch (err) {
      console.error(`[${ts()}]   Error ${source.artist}/${source.event}: ${err.message}`);
    }
  }
  console.log(`\n[${ts()}] === Done ===`);
}

main().catch((err) => {
  console.error(`[${ts()}] Fatal: ${err.message}`);
  process.exit(1);
});
