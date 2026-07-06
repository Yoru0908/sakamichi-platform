export interface Env {
  /** sakamichi-auth D1 (users + community_works/repo_works/reports tables) */
  DB: D1Database;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  ALIST_USER: string;
  ALIST_PASS: string;
  ALIST_URL: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  email_verified: number;
  is_first_login: number;
  verification_status: string;
  geo_status: string | null;
  payment_status: string | null;
  oshi_member: string | null;
  verification_reason: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}
