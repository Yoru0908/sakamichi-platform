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
  geoStatus: string | null;
  paymentStatus: string | null;
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

// ── Base fetch helpers ──
const AUTH_BASE = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth}`;
const USER_BASE = `${API_CONFIG.baseUrl}/api/user`;
const ADMIN_BASE = `${API_CONFIG.baseUrl}/api/manage`;

async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await res.json() as ApiResponse<T>;

    // Auto-refresh: if 401 and not already refreshing
    if (res.status === 401 && !url.includes('/refresh')) {
      const refreshed = await refreshToken();
      if (refreshed) {
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
    console.error('[apiFetch]', url, err);
    return { success: false, error: 'network_error', message: '网络连接失败，请检查网络或稍后重试' };
  }
}

function authFetch<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  return apiFetch<T>(`${AUTH_BASE}${path}`, options);
}

function userFetch<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  return apiFetch<T>(`${USER_BASE}${path}`, options);
}

function adminFetch<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  return apiFetch<T>(`${ADMIN_BASE}${path}`, options);
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

export interface OAuthLink {
  provider: string;
  email: string;
  name: string;
  avatar: string | null;
  linkedAt: string;
}

export interface SubscriptionInfo {
  plan: string;
  status: string;
  payment_method: string;
  paid_at: string;
  expires_at: string | null;
}

export interface PaymentLinkInfo {
  platform: string;
  email: string | null;
  linkedAt: string;
}

export interface UserProfile {
  user: AuthUser;
  oauthLinks: OAuthLink[];
  subscription: SubscriptionInfo | null;
  paymentLinks: PaymentLinkInfo[];
  createdAt: string;
  lastLoginAt: string | null;
}

export async function getProfile(): Promise<ApiResponse<UserProfile>> {
  return userFetch<UserProfile>('/profile');
}

export async function updateProfile(
  data: { displayName?: string },
): Promise<ApiResponse> {
  return userFetch('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ── Password Change ──

export async function changePassword(
  data: { currentPassword: string; newPassword: string },
): Promise<ApiResponse> {
  return userFetch('/password', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
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
  return userFetch('/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

export async function syncFavorites(
  favorites: { name: string; group: string }[],
): Promise<ApiResponse> {
  return userFetch('/favorites', {
    method: 'PUT',
    body: JSON.stringify({ favorites }),
  });
}

// ── Episode Bookmarks (Sakumimi) ──

export async function getBookmarks(): Promise<ApiResponse<{ bookmarks: { episodeId: number; note: string | null; addedAt: string }[] }>> {
  return userFetch<{ bookmarks: { episodeId: number; note: string | null; addedAt: string }[] }>('/bookmarks');
}

export async function addBookmark(episodeId: number): Promise<ApiResponse> {
  return userFetch('/bookmarks', {
    method: 'POST',
    body: JSON.stringify({ episodeId }),
  });
}

// ── Payment Links ──

export interface PaymentLink {
  id: string;
  platform: string;
  platform_user_id: string | null;
  platform_email: string | null;
  linked_at: string;
}

export async function getPaymentLinks(): Promise<ApiResponse<{ links: PaymentLink[] }>> {
  return userFetch<{ links: PaymentLink[] }>('/payment-links');
}

export async function addPaymentLink(
  data: { platform: string; platformUserId?: string; platformEmail?: string },
): Promise<ApiResponse> {
  return userFetch('/payment-links', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removePaymentLink(platform: string): Promise<ApiResponse> {
  return userFetch(`/payment-links?platform=${platform}`, {
    method: 'DELETE',
  });
}

// ── Invite Codes ──

export async function redeemInviteCode(code: string): Promise<ApiResponse<{ plan: string; expiresAt: string | null }>> {
  return authFetch<{ plan: string; expiresAt: string | null }>('/redeem-invite', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// ── Episode Bookmarks (Sakumimi) ──

export async function removeBookmark(episodeId: number): Promise<ApiResponse> {
  return userFetch('/bookmarks', {
    method: 'DELETE',
    body: JSON.stringify({ episodeId }),
  });
}

// ── User Verification Request ──

export async function requestVerification(reason: string): Promise<ApiResponse<{ status: string }>> {
  return userFetch<{ status: string }>('/request-verification', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ── Admin API ──

export interface AdminStats {
  total_users: number;
  paid_users: number;
  pending_users: number;
  active_subs: number;
  expired_subs: number;
  unmatched_pending: number;
  active_codes: number;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  verification_status: string;
  geo_status: string | null;
  payment_status: string | null;
  verification_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSubscription {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  plan: string;
  status: string;
  payment_method: string | null;
  payment_ref: string | null;
  amount_cents: number | null;
  currency: string | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AdminInviteCode {
  code: string;
  created_by: string;
  plan: string;
  max_uses: number;
  used_count: number;
  duration_days: number | null;
  expires_at: string | null;
  created_at: string;
  used_by_users: string | null;
}

export interface AdminUnmatchedPayment {
  id: string;
  platform: string;
  order_id: string | null;
  platform_user_id: string | null;
  amount: string | null;
  remark: string | null;
  resolved_at: string | null;
  resolved_user_id: string | null;
  created_at: string;
}

export async function getAdminStats(): Promise<ApiResponse<{ stats: AdminStats }>> {
  return adminFetch<{ stats: AdminStats }>('/stats');
}

export async function getAdminVerifications(status = 'pending'): Promise<ApiResponse<{ users: AdminUser[] }>> {
  return adminFetch<{ users: AdminUser[] }>(`/verifications?status=${status}`);
}

export async function resolveVerification(userId: string, action: 'approve' | 'reject'): Promise<ApiResponse> {
  return adminFetch('/verifications/resolve', {
    method: 'POST',
    body: JSON.stringify({ userId, action }),
  });
}

export async function getAdminSubscriptions(status = 'active'): Promise<ApiResponse<{ subscriptions: AdminSubscription[] }>> {
  return adminFetch<{ subscriptions: AdminSubscription[] }>(`/subscriptions?status=${status}`);
}

export async function getAdminInviteCodes(): Promise<ApiResponse<{ codes: AdminInviteCode[] }>> {
  return adminFetch<{ codes: AdminInviteCode[] }>('/invite-codes');
}

export async function createInviteCode(data: {
  plan?: string;
  maxUses?: number;
  durationDays?: number | null;
  expiresInDays?: number | null;
}): Promise<ApiResponse<{ code: string; plan: string; maxUses: number }>> {
  return adminFetch('/invite-codes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAdminUnmatchedPayments(pendingOnly = true): Promise<ApiResponse<{ payments: AdminUnmatchedPayment[] }>> {
  return adminFetch<{ payments: AdminUnmatchedPayment[] }>(`/unmatched-payments?pending=${pendingOnly}`);
}

export async function resolveUnmatchedPayment(paymentId: string, userId: string, plan?: string): Promise<ApiResponse> {
  return adminFetch('/unmatched-payments/resolve', {
    method: 'POST',
    body: JSON.stringify({ paymentId, userId, plan }),
  });
}

// ── Repo Community API ──

const REPO_BASE = `${API_CONFIG.baseUrl}/api/repo`;

function repoFetch<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  return apiFetch<T>(`${REPO_BASE}${path}`, options);
}

export interface RepoReaction {
  lemon: number;
  sweet: number;
  funny: number;
  pray: number;
}

export interface RepoWorkItem {
  id: string;
  userId: string | null;
  userName: string;
  memberId: string;
  memberName: string;
  groupId: string;
  eventDate: string;
  eventType: string;
  slotNumber: number;
  ticketCount: number;
  nickname: string;
  messages: Array<{ id: string; speaker: 'me' | 'member' | 'narration'; text: string; imageUrl?: string }>;
  tags: string[];
  template: string;
  reactions: RepoReaction;
  myReactions: string[];
  isPublic: boolean;
  createdAt: string;
}

export interface ListRepoParams {
  group?: string;
  memberId?: string;
  tag?: string;
  sort?: 'latest' | 'popular';
  page?: number;
  limit?: number;
}

export interface ListRepoResponse {
  repos: RepoWorkItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateRepoPayload {
  memberId: string;
  memberName: string;
  groupId: string;
  eventDate: string;
  eventType: string;
  slotNumber: number;
  ticketCount: number;
  nickname: string;
  messages: Array<{ speaker: string; text: string; imageUrl?: string }>;
  tags: string[];
  template: string;
  isPublic: boolean;
}

export async function listRepoWorks(params: ListRepoParams = {}): Promise<ApiResponse<ListRepoResponse>> {
  const q = new URLSearchParams();
  if (params.group) q.set('group', params.group);
  if (params.memberId) q.set('memberId', params.memberId);
  if (params.tag) q.set('tag', params.tag);
  if (params.sort) q.set('sort', params.sort);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return repoFetch<ListRepoResponse>(`/works${qs ? `?${qs}` : ''}`);
}

export async function createRepoWork(payload: CreateRepoPayload): Promise<ApiResponse<{ id: string }>> {
  return repoFetch<{ id: string }>('/works', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteRepoWork(id: string): Promise<ApiResponse> {
  return repoFetch(`/works/${id}`, { method: 'DELETE' });
}

export async function reactToRepo(workId: string, type: 'lemon' | 'sweet' | 'funny' | 'pray'): Promise<ApiResponse<{ type: string; reacted: boolean; count: number }>> {
  return repoFetch<{ type: string; reacted: boolean; count: number }>(`/works/${workId}/react`, {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

export async function getMyRepoWorks(page = 1): Promise<ApiResponse<ListRepoResponse>> {
  return repoFetch<ListRepoResponse>(`/my-works?page=${page}`);
}

export async function getRepoWork(id: string): Promise<ApiResponse<RepoWorkItem>> {
  return repoFetch<RepoWorkItem>(`/works/${id}`);
}
