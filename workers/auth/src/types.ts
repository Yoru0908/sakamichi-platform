export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  EMAIL_FROM: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  RESEND_API_KEY: string;
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
  oshi_member: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  revoked: number;
}

export interface UserPublic {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  isFirstLogin: boolean;
  oshiMember: string | null;
  verificationStatus: string;
}

export function toPublicUser(row: UserRow): UserPublic {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    isFirstLogin: row.is_first_login === 1,
    oshiMember: row.oshi_member,
    verificationStatus: row.verification_status,
  };
}
