import type { Env } from '../types';
import { getAuthUserId } from './preferences';
import { error, success } from '../utils/response';
import { getDiscordMembershipStatus, syncDiscordRolesForUser } from '../utils/discord-bot';

export async function handleGetDiscordStatus(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  const status = await getDiscordMembershipStatus(env, userId);
  return success({ data: status });
}

export async function handleSyncDiscordRoles(req: Request, env: Env): Promise<Response> {
  const userId = await getAuthUserId(req, env);
  if (!userId) return error('unauthorized', 401);

  const sync = await syncDiscordRolesForUser(env, userId);
  return success({ data: sync });
}
