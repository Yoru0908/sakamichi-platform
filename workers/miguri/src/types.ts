export interface Env {
  /** sakamichi-auth D1 (users / user_followed_members / google calendar connections) */
  DB: D1Database;
  /** miguri D1 (events / windows / slots / entries / soldout) */
  MIGURI_DB: D1Database;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  MIGURI_SYNC_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MIGURI_ALERT_WEBHOOK_URL?: string;
  MIGURI_ALERT_WEBHOOK_SECRET?: string;
  NAPCAT_NOTIFY_URL?: string;
  NAPCAT_NOTIFY_TOKEN?: string;
  NAPCAT_NOTIFY_GROUPS?: string;
  MIGURI_NEW_WINDOW_NOTIFY_GROUPS?: string;
  MIGURI_WEIBO_ENABLED?: string;
  MIGURI_WEIBO_WEBHOOK_URL?: string;
  MIGURI_WEIBO_WEBHOOK_SECRET?: string;
}
