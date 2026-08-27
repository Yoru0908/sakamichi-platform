import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

export const DEFAULT_SOLDOUT_PUSH_OUTBOX_DIR =
  '/vol1/fortune-soldout-watcher/push-outbox';

function safePart(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

export function soldoutPushJobId(eventSlug, resultRound) {
  return `${safePart(eventSlug)}-round-${safePart(resultRound)}`;
}

function jobPath(outboxDir, id) {
  return join(outboxDir, `${safePart(id)}.json`);
}

async function writeJob(job, outboxDir) {
  await mkdir(outboxDir, { recursive: true });
  const destination = jobPath(outboxDir, job.id);
  const temporary = join(
    outboxDir,
    `.${safePart(job.id)}.${process.pid}.${randomUUID()}.writing`,
  );
  await writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, destination);
  return job;
}

export async function enqueueSoldoutPush(
  input,
  outboxDir = DEFAULT_SOLDOUT_PUSH_OUTBOX_DIR,
) {
  const id = soldoutPushJobId(input.eventSlug, input.resultRound);
  const destination = jobPath(outboxDir, id);
  try {
    return JSON.parse(await readFile(destination, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return writeJob(
    {
      id,
      eventSlug: input.eventSlug,
      group: input.group,
      resultRound: Number(input.resultRound),
      importResult: input.importResult,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: '',
      deliveredGroupIds: [],
      weiboDelivered: false,
    },
    outboxDir,
  );
}

export async function saveSoldoutPush(
  job,
  outboxDir = DEFAULT_SOLDOUT_PUSH_OUTBOX_DIR,
) {
  return writeJob(job, outboxDir);
}

export async function listSoldoutPushes(
  outboxDir = DEFAULT_SOLDOUT_PUSH_OUTBOX_DIR,
) {
  await mkdir(outboxDir, { recursive: true });
  const names = (await readdir(outboxDir))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const jobs = [];
  for (const name of names) {
    const job = JSON.parse(await readFile(join(outboxDir, name), 'utf8'));
    if (job?.id && job?.eventSlug) jobs.push(job);
  }
  return jobs;
}

export async function completeSoldoutPush(
  job,
  outboxDir = DEFAULT_SOLDOUT_PUSH_OUTBOX_DIR,
) {
  await rm(jobPath(outboxDir, job.id), { force: true });
}

export async function requireNapcatSuccess(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok) {
    throw new Error(
      `NapCat HTTP ${response.status}${payload?.message ? `: ${payload.message}` : ''}`,
    );
  }
  if (payload?.status !== 'ok' || Number(payload?.retcode) !== 0) {
    throw new Error(
      payload?.message ||
        payload?.wording ||
        `NapCat 业务失败（retcode=${payload?.retcode ?? 'unknown'}）`,
    );
  }
  const messageId = payload?.data?.message_id ?? payload?.data?.messageId;
  if (messageId === undefined || messageId === null || messageId === '') {
    throw new Error('NapCat 未返回 message_id，无法确认群消息已送达');
  }
  return payload;
}
