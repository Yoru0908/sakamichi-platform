import { API_CONFIG } from './constants';

// ── Types ──
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'guest' | 'member' | 'verified' | 'translator' | 'admin';
  isFirstLogin: boolean;
  oshiMember: string | null;
  verificationStatus: 'none' | 'pending' | 'approved' | 'rejected';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface RegisterResponse {
  message: string;
}

// ── Base fetch helper ──
const AUTH_BASE = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth}`;

async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = `${AUTH_BASE}${path}`;
  try {
    const res = await fetch(url, {
      credentials: 'include', // send HttpOnly cookies
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await res.json() as ApiResponse<T>;

    // Auto-refresh: if 401 and not already refreshing
    if (res.status === 401 && !path.includes('/refresh')) {
      const refreshed = await refreshToken();
      if (refreshed) {
        // Retry original request
        const retry = await fetch(url, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          ...options,
        });
        return await retry.json() as ApiResponse<T>;
      }
    }

    return data;
  } catch (err) {
    console.error('[authFetch]', url, err);
    return { success: false, error: 'network_error', message: '网络连接失败，请检查网络或稍后重试' };
  }
}

// ── Auth API ──

export async function login(req: LoginRequest): Promise<ApiResponse<LoginResponse>> {
  return authFetch<LoginResponse>('/login', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function register(req: RegisterRequest): Promise<ApiResponse<RegisterResponse>> {
  return authFetch<RegisterResponse>('/register', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function logout(): Promise<ApiResponse> {
  return authFetch('/logout', { method: 'POST' });
}

export async function fetchMe(): Promise<ApiResponse<{ user: AuthUser }>> {
  return authFetch<{ user: AuthUser }>('/me');
}

export async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_BASE}/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function verifyEmail(token: string): Promise<ApiResponse> {
  return authFetch(`/verify?token=${encodeURIComponent(token)}`);
}

// ── OAuth ──

export function getOAuthUrl(provider: 'discord' | 'google' | 'twitter'): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${AUTH_BASE}/${provider}?origin=${encodeURIComponent(origin)}`;
}

// ── User Profile ──

const USER_BASE = `${API_CONFIG.baseUrl}/api/user`;

export interface OAuthLink {
  provider: string;
  email: string;
  name: string;
  avatar: string | null;
  linkedAt: string;
}

export interface UserProfile {
  user: AuthUser;
  oauthLinks: OAuthLink[];
  createdAt: string;
  lastLoginAt: string | null;
}

export async function getProfile(): Promise<ApiResponse<UserProfile>> {
  try {
    const res = await fetch(`${USER_BASE}/profile`, {
      credentials: 'include',
    });
    return await res.json() as ApiResponse<UserProfile>;
  } catch {
    return { success: false, error: 'network_error' };
  }
}

export async function updateProfile(
  data: { displayName?: string },
): Promise<ApiResponse> {
  try {
    const res = await fetch(`${USER_BASE}/profile`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json() as ApiResponse;
  } catch {
    return { success: false, error: 'network_error' };
  }
}

// ── Password Change ──

export async function changePassword(
  data: { currentPassword: string; newPassword: string },
): Promise<ApiResponse> {
  try {
    const res = await fetch(`${USER_BASE}/password`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json() as ApiResponse;
  } catch {
    return { success: false, error: 'network_error', message: '网络连接失败' };
  }
}

// ── User Preferences ──

export interface UserPreferences {
  oshiMember: string | null;
  followedMembers: string[];
}

export async function getPreferences(): Promise<ApiResponse<UserPreferences>> {
  return authFetch<UserPreferences>('/preferences');
}

export async function updatePreferences(
  prefs: Partial<UserPreferences>,
): Promise<ApiResponse> {
  try {
    const res = await fetch(`${USER_BASE}/preferences`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    return await res.json() as ApiResponse;
  } catch {
    return { success: false, error: 'network_error' };
  }
}

export async function syncFavorites(
  favorites: { name: string; group: string }[],
): Promise<ApiResponse> {
  try {
    const res = await fetch(`${USER_BASE}/favorites`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorites }),
    });
    return await res.json() as ApiResponse;
  } catch {
    return { success: false, error: 'network_error' };
  }
}

// ── Episode Bookmarks (Sakumimi) ──

export async function getBookmarks(): Promise<ApiResponse<{ bookmarks: { episodeId: number; note: string | null; addedAt: string }[] }>> {
  try {
    const res = await fetch(`${USER_BASE}/bookmarks`, { credentials: 'include' });
    return await res.json() as ApiResponse<{ bookmarks: { episodeId: number; note: string | null; addedAt: string }[] }>;
  } catch {
    return { success: false, error: 'network_error' };
  }
}

export async function addBookmark(episodeId: number): Promise<ApiResponse> {
  try {
    const res = await fetch(`${USER_BASE}/bookmarks`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId }),
    });
    return await res.json() as ApiResponse;
  } catch {
    return { success: false, error: 'network_error' };
  }
}

export async function removeBookmark(episodeId: number): Promise<ApiResponse> {
  try {
    const res = await fetch(`${USER_BASE}/bookmarks`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId }),
    });
    return await res.json() as ApiResponse;
  } catch {
    return { success: false, error: 'network_error' };
  }
}
