import type { Env } from '../types';

const DISCORD_API = 'https://discord.com/api/v10';
export const DEFAULT_DISCORD_INVITE_URL = 'https://discord.gg/Ddp8As4JA';

export interface DiscordSyncResult {
  configured: boolean;
  linked: boolean;
  discordUserId: string | null;
  inviteUrl: string;
  activePlans: string[];
  targetRoleIds: string[];
  appliedRoleIds: string[];
  removedRoleIds: string[];
  errors: string[];
  inGuild: boolean | null;
}

type DiscordApiResult = {
  ok: boolean;
  status: number;
  body: string;
};

function getInviteUrl(env: Env): string {
  return env.DISCORD_INVITE_URL || DEFAULT_DISCORD_INVITE_URL;
}

function isConfigured(env: Env): boolean {
  return Boolean(
    env.DISCORD_BOT_TOKEN &&
    env.DISCORD_GUILD_ID &&
    env.DISCORD_ROLE_NOGIZAKA &&
    env.DISCORD_ROLE_SAKURAZAKA &&
    env.DISCORD_ROLE_HINATAZAKA,
  );
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function getRolesForPlan(env: Env, plan: string): string[] {
  switch (plan) {
    case 'single_nogizaka':
      return unique([env.DISCORD_ROLE_NOGIZAKA]);
    case 'single_sakurazaka':
      return unique([env.DISCORD_ROLE_SAKURAZAKA]);
    case 'single_hinatazaka':
      return unique([env.DISCORD_ROLE_HINATAZAKA]);
    case 'all_groups':
    case 'lifetime':
    default:
      return unique([
        env.DISCORD_ROLE_NOGIZAKA,
        env.DISCORD_ROLE_SAKURAZAKA,
        env.DISCORD_ROLE_HINATAZAKA,
      ]);
  }
}

function getAllPaidRoleIds(env: Env): string[] {
  return unique([
    env.DISCORD_ROLE_NOGIZAKA,
    env.DISCORD_ROLE_SAKURAZAKA,
    env.DISCORD_ROLE_HINATAZAKA,
  ]);
}

async function discordApi(env: Env, path: string, method: string): Promise<DiscordApiResult> {
  if (!env.DISCORD_BOT_TOKEN) {
    return { ok: false, status: 0, body: 'DISCORD_BOT_TOKEN missing' };
  }

  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      },
    });
    return {
      ok: res.ok,
      status: res.status,
      body: await res.text(),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getDiscordIdForUser(env: Env, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT provider_id FROM user_oauth WHERE user_id = ? AND provider = 'discord'",
  ).bind(userId).first<{ provider_id: string }>();

  return row?.provider_id || null;
}

async function getActivePlansForUser(env: Env, userId: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT plan FROM user_subscriptions
     WHERE user_id = ?
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > datetime('now'))`,
  ).bind(userId).all<{ plan: string }>();

  return (rows.results || []).map((row) => row.plan);
}

export async function addRole(env: Env, discordUserId: string, roleId: string): Promise<DiscordApiResult> {
  if (!env.DISCORD_GUILD_ID) return { ok: false, status: 0, body: 'DISCORD_GUILD_ID missing' };
  return discordApi(env, `/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`, 'PUT');
}

export async function removeRole(env: Env, discordUserId: string, roleId: string): Promise<DiscordApiResult> {
  if (!env.DISCORD_GUILD_ID) return { ok: false, status: 0, body: 'DISCORD_GUILD_ID missing' };
  return discordApi(env, `/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`, 'DELETE');
}

export async function syncDiscordRolesForUser(env: Env, userId: string): Promise<DiscordSyncResult> {
  const result = await getDiscordMembershipStatus(env, userId);

  if (!result.configured || !result.discordUserId) return result;

  for (const roleId of getAllPaidRoleIds(env)) {
    const res = await removeRole(env, result.discordUserId, roleId);
    if (res.ok || res.status === 404) {
      result.removedRoleIds.push(roleId);
      if (res.status === 404) result.inGuild = false;
    } else {
      result.errors.push(`remove ${roleId}: ${res.status} ${res.body.slice(0, 160)}`);
    }
  }

  for (const roleId of result.targetRoleIds) {
    const res = await addRole(env, result.discordUserId, roleId);
    if (res.ok || res.status === 204) {
      result.appliedRoleIds.push(roleId);
      result.inGuild = true;
    } else if (res.status === 404) {
      result.inGuild = false;
      result.errors.push(`add ${roleId}: member_not_in_guild`);
    } else {
      result.errors.push(`add ${roleId}: ${res.status} ${res.body.slice(0, 160)}`);
    }
  }

  if (result.targetRoleIds.length === 0 && result.inGuild === null) {
    result.inGuild = result.errors.length === 0 ? true : null;
  }

  if (result.errors.length > 0) {
    console.error(`[Discord] Role sync partial failure for user ${userId}:`, result.errors);
  }

  return result;
}

export async function getDiscordMembershipStatus(env: Env, userId: string): Promise<DiscordSyncResult> {
  const discordUserId = await getDiscordIdForUser(env, userId);
  const activePlans = await getActivePlansForUser(env, userId);

  return {
    configured: isConfigured(env),
    linked: Boolean(discordUserId),
    discordUserId,
    inviteUrl: getInviteUrl(env),
    activePlans,
    targetRoleIds: unique(activePlans.flatMap((plan) => getRolesForPlan(env, plan))),
    appliedRoleIds: [],
    removedRoleIds: [],
    errors: [],
    inGuild: null,
  };
}
