import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.resolve(__dirname, '..');
const toolsRoot = path.resolve(platformRoot, '..');

const DISCORD_API = 'https://discord.com/api/v10';
const CHANNEL_TYPES = {
  text: 0,
  category: 4,
};
const PERMISSIONS = {
  viewChannel: 1n << 10n,
  readMessageHistory: 1n << 16n,
};

const GROUPS = {
  nogizaka: {
    fullName: '乃木坂46',
    shortName: '乃木坂',
    paidCategory: 'paid_nogizaka',
    roleEnv: 'DISCORD_ROLE_NOGIZAKA',
  },
  sakurazaka: {
    fullName: '櫻坂46',
    shortName: '櫻坂',
    paidCategory: 'paid_sakurazaka',
    roleEnv: 'DISCORD_ROLE_SAKURAZAKA',
  },
  hinatazaka: {
    fullName: '日向坂46',
    shortName: '日向坂',
    paidCategory: 'paid_hinatazaka',
    roleEnv: 'DISCORD_ROLE_HINATAZAKA',
  },
};

const DEFAULT_MSG_CONFIG_PATH = path.join(toolsRoot, 'MSG推送/config/discord-routes.local.json');
const DEFAULT_BLOG_CONFIG_PATH = path.join(
  toolsRoot,
  '博客自动翻译/自动翻译项目/sakamichi-blog-backend/blog-push-service/discord-webhooks.local.json',
);
const DEFAULT_MSG_PUSH_CONFIG_PATH = path.join(toolsRoot, 'MSG推送/src/push-config.js');
const MEMBER_IMAGES_PATH = path.join(platformRoot, 'public/data/member-images.json');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeAllMembers = args.has('--all-members');
const dryRun = !apply;

loadEnvFile(path.join(platformRoot, '.env'));
loadEnvFile(path.join(platformRoot, 'workers/auth/.dev.vars'));

const env = process.env;
const token = env.DISCORD_BOT_TOKEN;
const guildId = env.DISCORD_GUILD_ID;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function permissionValue(...values) {
  return values.reduce((sum, value) => sum | value, 0n).toString();
}

function paidPermissionOverwrites(roleId) {
  if (!roleId) return [];
  return [
    {
      id: guildId,
      type: 0,
      deny: permissionValue(PERMISSIONS.viewChannel),
    },
    {
      id: roleId,
      type: 0,
      allow: permissionValue(PERMISSIONS.viewChannel, PERMISSIONS.readMessageHistory),
    },
  ];
}

function normalizeMemberName(name) {
  return String(name || '').replace(/[\s\u3000]+/g, '');
}

function channelName(name) {
  return normalizeMemberName(name)
    .replace(/[\/\\#?:]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function loadMemberIndex() {
  const data = JSON.parse(fs.readFileSync(MEMBER_IMAGES_PATH, 'utf8'));
  const images = data.images || {};
  const index = new Map();

  for (const [name, info] of Object.entries(images)) {
    if (!info || info.isActive === false || !info.group) continue;
    const siteKey = groupNameToSiteKey(info.group);
    if (!siteKey) continue;

    const normalized = normalizeMemberName(name);
    const existing = index.get(normalized);
    const preferredName = name.includes(' ') || !existing ? name : existing.name;
    index.set(normalized, {
      name: preferredName,
      siteKey,
      group: info.group,
    });
  }

  return index;
}

function groupNameToSiteKey(groupName) {
  if (groupName.includes('乃木坂')) return 'nogizaka';
  if (groupName.includes('櫻坂') || groupName.includes('樱坂')) return 'sakurazaka';
  if (groupName.includes('日向坂')) return 'hinatazaka';
  return '';
}

function loadMsgMemberNames(memberIndex) {
  if (includeAllMembers) {
    return [...memberIndex.values()].map((member) => member.name);
  }

  const configPath = env.MSG_PUSH_CONFIG_PATH || DEFAULT_MSG_PUSH_CONFIG_PATH;
  const pushConfig = require(configPath);
  return Object.entries(pushConfig.memberPushRules || {})
    .filter(([, rule]) => rule?.enabled !== false)
    .map(([name]) => name);
}

function groupMembers(memberNames, memberIndex) {
  const grouped = {
    nogizaka: [],
    sakurazaka: [],
    hinatazaka: [],
  };
  const unknown = [];
  const seen = new Set();

  for (const rawName of memberNames) {
    const key = normalizeMemberName(rawName);
    if (seen.has(key)) continue;
    seen.add(key);

    const member = memberIndex.get(key);
    if (!member || !grouped[member.siteKey]) {
      unknown.push(rawName);
      continue;
    }
    grouped[member.siteKey].push(member.name);
  }

  return { grouped, unknown };
}

async function discordFetch(apiPath, options = {}) {
  if (!apply) {
    return null;
  }

  const response = await fetch(`${DISCORD_API}${apiPath}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 429) {
    const body = await response.json().catch(() => ({}));
    const retryMs = Math.ceil(Number(body.retry_after || 1) * 1000);
    await sleep(retryMs);
    return discordFetch(apiPath, options);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || 'GET'} ${apiPath} failed: ${response.status} ${body.slice(0, 240)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function findChannel(channels, { name, type, parentId }) {
  return channels.find((channel) => {
    if (channel.name !== name || channel.type !== type) return false;
    if (parentId === undefined) return true;
    return String(channel.parent_id || '') === String(parentId || '');
  });
}

async function ensureCategory(channels, name, roleId = '') {
  const existing = findChannel(channels, { name, type: CHANNEL_TYPES.category });
  if (existing) return { id: existing.id, name, created: false };

  if (dryRun) return { id: `dry-category-${name}`, name, created: true };

  const channel = await discordFetch(`/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      type: CHANNEL_TYPES.category,
      permission_overwrites: paidPermissionOverwrites(roleId),
    }),
  });
  channels.push(channel);
  return { id: channel.id, name, created: true };
}

async function ensureTextChannel(channels, name, parentId) {
  const existing = findChannel(channels, { name, type: CHANNEL_TYPES.text, parentId });
  if (existing) return { id: existing.id, name, created: false };

  if (dryRun) return { id: `dry-channel-${parentId}-${name}`, name, created: true };

  const channel = await discordFetch(`/guilds/${guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      type: CHANNEL_TYPES.text,
      parent_id: parentId,
    }),
  });
  channels.push(channel);
  return { id: channel.id, name, created: true };
}

async function ensureWebhook(channelId, name) {
  if (dryRun) {
    return {
      id: `dry-webhook-${channelId}-${name}`,
      name,
      url: `https://discord.com/api/webhooks/DRY_RUN/${encodeURIComponent(channelId)}`,
      created: true,
    };
  }

  const webhooks = await discordFetch(`/channels/${channelId}/webhooks`);
  const existing = webhooks.find((webhook) => webhook.name === name);
  if (existing?.url) return { ...existing, created: false };

  const webhook = await discordFetch(`/channels/${channelId}/webhooks`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return { ...webhook, created: true };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function summarize(label, items) {
  const created = items.filter((item) => item.created).length;
  console.log(`${label}: ${items.length} total, ${created} create, ${items.length - created} reuse`);
}

if (apply && (!token || !guildId)) {
  console.error('Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID.');
  process.exit(1);
}

for (const [siteKey, group] of Object.entries(GROUPS)) {
  if (apply && !env[group.roleEnv]) {
    console.error(`Missing ${group.roleEnv}.`);
    process.exit(1);
  }
}

const memberIndex = loadMemberIndex();
const { grouped: membersBySite, unknown } = groupMembers(loadMsgMemberNames(memberIndex), memberIndex);
let channels = apply ? await discordFetch(`/guilds/${guildId}/channels`) : [];

const categories = [];
const textChannels = [];
const webhooks = [];

const msgConfig = {
  enabled: true,
  generatedAt: new Date().toISOString(),
  sites: {},
  members: {},
};
const blogConfig = {
  enabled: true,
  generatedAt: new Date().toISOString(),
  blogRoutes: {},
  contentRoutes: {
    default: [],
  },
};

const freeCategory = await ensureCategory(channels, '46log free');
categories.push(freeCategory);

for (const name of ['welcome', '公告']) {
  const channel = await ensureTextChannel(channels, name, freeCategory.id);
  textChannels.push(channel);
  if (name === '公告') {
    const webhook = await ensureWebhook(channel.id, '46log Announcements');
    webhooks.push(webhook);
    blogConfig.contentRoutes.announcements = [webhook.url];
  }
}

for (const [siteKey, group] of Object.entries(GROUPS)) {
  const blogChannel = await ensureTextChannel(channels, `${group.shortName}-blog`, freeCategory.id);
  textChannels.push(blogChannel);
  const blogWebhook = await ensureWebhook(blogChannel.id, '46log Blog');
  webhooks.push(blogWebhook);
  blogConfig.blogRoutes[group.fullName] = [blogWebhook.url];
  if (siteKey === 'sakurazaka') {
    blogConfig.blogRoutes['樱坂46'] = [blogWebhook.url];
  }
}

for (const [siteKey, group] of Object.entries(GROUPS)) {
  const paidCategory = await ensureCategory(channels, group.paidCategory, env[group.roleEnv]);
  categories.push(paidCategory);

  const timelineChannel = await ensureTextChannel(channels, `${group.shortName}-msg-timeline`, paidCategory.id);
  textChannels.push(timelineChannel);
  const timelineWebhook = await ensureWebhook(timelineChannel.id, '46log MSG');
  webhooks.push(timelineWebhook);
  msgConfig.sites[siteKey] = { timeline: [timelineWebhook.url] };

  for (const memberName of membersBySite[siteKey]) {
    const channel = await ensureTextChannel(channels, channelName(memberName), paidCategory.id);
    textChannels.push(channel);
    const webhook = await ensureWebhook(channel.id, '46log MSG');
    webhooks.push(webhook);
    msgConfig.members[memberName] = [webhook.url];
  }
}

summarize('Categories', categories);
summarize('Text channels', textChannels);
summarize('Webhooks', webhooks);

if (unknown.length > 0) {
  console.warn(`Unknown MSG members skipped: ${unknown.join(', ')}`);
}

console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
console.log(`MSG member channels: ${Object.keys(msgConfig.members).length}`);
console.log(`Blog routes: ${Object.keys(blogConfig.blogRoutes).join(', ')}`);

if (apply) {
  const msgConfigPath = env.MSG_DISCORD_OUTPUT || DEFAULT_MSG_CONFIG_PATH;
  const blogConfigPath = env.BLOG_PUSH_DISCORD_OUTPUT || DEFAULT_BLOG_CONFIG_PATH;
  writeJson(msgConfigPath, msgConfig);
  writeJson(blogConfigPath, blogConfig);
  console.log(`Wrote MSG config: ${msgConfigPath}`);
  console.log(`Wrote blog config: ${blogConfigPath}`);
} else {
  console.log('Dry-run only. Re-run with --apply to create/reuse Discord resources and write local configs.');
}
