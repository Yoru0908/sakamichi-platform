const WEIBO_WEBHOOK_URL = process.env.WEIBO_WEBHOOK_URL || 'http://127.0.0.1:8899/webhook/weibo-publish';
const WEIBO_WEBHOOK_SECRET = process.env.WEIBO_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';

export function isWeiboEnabled() {
  return process.env.WEIBO_PUBLISH_ENABLED === 'true' || process.env.WEIBO_ENABLED === 'true';
}

export async function publishToWeibo({ text, images = [], category = 'miguri', meta = {} }) {
  if (!isWeiboEnabled()) {
    return { success: true, skipped: true, reason: 'weibo disabled' };
  }
  if (!WEIBO_WEBHOOK_SECRET) {
    throw new Error('WEIBO_WEBHOOK_SECRET is required when Weibo publishing is enabled');
  }

  const res = await fetch(WEIBO_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': WEIBO_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ text, images, category, meta }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(`Weibo webhook failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}
