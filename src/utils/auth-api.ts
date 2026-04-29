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
const MIGURI_BASE = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.miguri}`;

export type MiguriGroupId = 'nogizaka' | 'hinatazaka' | 'sakurazaka';
export type MiguriEntryStatus = 'planned' | 'won' | 'paid';

export interface MiguriWindow {
  label: string;
  start: string;
  end: string;
}

export interface MiguriSlot {
  date: string;
  slotNumber: number;
  receptionStart: string;
  startTime: string;
  receptionEnd: string;
  endTime: string;
  members: string[];
}

export interface MiguriEvent {
  slug: string;
  group: MiguriGroupId;
  title: string;
  sourceUrl: string;
  saleType: string;
  windows: MiguriWindow[];
  dates: string[];
  members: string[];
  slots: MiguriSlot[];
  syncedAt: string;
}

export interface MiguriEntry {
  id: string;
  eventSlug: string;
  eventTitle: string | null;
  group: MiguriGroupId | null;
  member: string;
  date: string;
  slot: number;
  tickets: number;
  status: MiguriEntryStatus;
  startTime: string | null;
  endTime: string | null;
}

export interface MiguriGoogleCalendarStatus {
  connected: boolean;
  email: string | null;
  calendarId: string | null;
  syncEnabled: boolean;
}

export interface MiguriEventsPayload {
  events: MiguriEvent[];
  favorites: string[];
  entries: MiguriEntry[];
  googleCalendar: MiguriGoogleCalendarStatus;
}

export interface CreateMiguriEntriesRequest {
  eventSlug: string;
  date: string;
  slots: number[];
  members: string[];
  tickets: number;
  status: MiguriEntryStatus;
}

export interface UpdateMiguriEntryRequest {
  member: string;
  date: string;
  slot: number;
  tickets: number;
  status: MiguriEntryStatus;
}

export interface MiguriGoogleCalendarUrlPayload {
  url: string;
}

export interface MiguriEntriesPayload {
  entries: MiguriEntry[];
}

export interface MiguriEntryPayload {
  entry: MiguriEntry;
}

function miguriFetch<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  return apiFetch<T>(`${MIGURI_BASE}${path}`, options);
}

function miguriUrl(path: string): string {
  return `${MIGURI_BASE}${path}`;
}

export function getMiguriCalendarIcsUrl(): string {
  return miguriUrl('/calendar.ics');
}

export function getGoogleCalendarConnectUrl(returnTo = '/prototypes/miguri'): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${AUTH_BASE}/google/calendar?origin=${encodeURIComponent(origin)}&returnTo=${encodeURIComponent(returnTo)}`;
}

export function getMiguriGoogleCalendarUrl(entryId: string): Promise<ApiResponse<MiguriGoogleCalendarUrlPayload>> {
  return miguriFetch<MiguriGoogleCalendarUrlPayload>(`/calendar/google-url?entryId=${encodeURIComponent(entryId)}`);
}

export function getMiguriEvents(): Promise<ApiResponse<MiguriEventsPayload>> {
  return miguriFetch<MiguriEventsPayload>('/events');
}

export function createMiguriEntries(payload: CreateMiguriEntriesRequest): Promise<ApiResponse<MiguriEntriesPayload>> {
  return miguriFetch<MiguriEntriesPayload>('/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMiguriEntry(entryId: string, payload: UpdateMiguriEntryRequest): Promise<ApiResponse<MiguriEntryPayload>> {
  return miguriFetch<MiguriEntryPayload>(`/entries/${encodeURIComponent(entryId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteMiguriEntry(entryId: string): Promise<ApiResponse> {
  return miguriFetch(`/entries/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
  });
}

export async function downloadMiguriCalendarIcs(): Promise<{ success: boolean; error?: string; blob?: Blob }> {
  try {
    const res = await fetch(getMiguriCalendarIcsUrl(), {
      credentials: 'include',
    });

    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        const retry = await fetch(getMiguriCalendarIcsUrl(), { credentials: 'include' });
        if (!retry.ok) return { success: false, error: 'calendar_export_failed' };
        return { success: true, blob: await retry.blob() };
      }
    }

    if (!res.ok) return { success: false, error: 'calendar_export_failed' };
    return { success: true, blob: await res.blob() };
  } catch {
    return { success: false, error: 'network_error' };
  }
}

export async function openMiguriCalendarIcs(): Promise<boolean> {
  const result = await downloadMiguriCalendarIcs();
  if (!result.success || !result.blob) return false;

  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'miguri.ics';
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function openMiguriGoogleCalendar(entryId: string): Promise<boolean> {
  const res = await getMiguriGoogleCalendarUrl(entryId);
  const url = res.data?.url;
  if (!res.success || !url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export function canUseBrowserCalendarActions(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}


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

export interface UserFavoritesPayload {
  favorites: { name: string; group: string; addedAt: string }[];
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

export async function getFavorites(): Promise<ApiResponse<UserFavoritesPayload>> {
  return userFetch<UserFavoritesPayload>('/favorites');
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

export type RepoWorkStatus = 'draft' | 'published';

export interface RepoWorkItem {
  id: string;
  userId: string | null;
  userName: string;
  memberId: string;
  memberName: string;
  groupId: string;
  customMemberAvatar?: string;
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
  updatedAt?: string;
  status?: RepoWorkStatus;
}

export interface ListRepoParams {
  group?: string;
  memberId?: string;
  tag?: string;
  query?: string;
  status?: RepoWorkStatus | 'all';
  sort?: 'latest' | 'popular';
  page?: number;
  limit?: number;
}

export interface ListRepoResponse {
  repos: RepoWorkItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface RepoStatsResponse {
  total: number;
  creators: number;
  today: number;
}

export interface CreateRepoPayload {
  memberId: string;
  memberName: string;
  groupId: string;
  customMemberAvatar?: string;
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
  if (params.query) q.set('q', params.query);
  if (params.status) q.set('status', params.status);
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

export async function updateRepoWork(id: string, payload: CreateRepoPayload): Promise<ApiResponse<{ id: string; created: boolean; status: RepoWorkStatus }>> {
  return repoFetch<{ id: string; created: boolean; status: RepoWorkStatus }>(`/works/${id}`, {
    method: 'PUT',
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

export async function getMyRepoWorks(params: ListRepoParams = {}): Promise<ApiResponse<ListRepoResponse>> {
  const q = new URLSearchParams();
  if (params.group) q.set('group', params.group);
  if (params.memberId) q.set('memberId', params.memberId);
  if (params.tag) q.set('tag', params.tag);
  if (params.query) q.set('q', params.query);
  if (params.status) q.set('status', params.status);
  if (params.sort) q.set('sort', params.sort);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return repoFetch<ListRepoResponse>(`/my-works${qs ? `?${qs}` : ''}`);
}

export async function getRepoWork(id: string): Promise<ApiResponse<RepoWorkItem>> {
  return repoFetch<RepoWorkItem>(`/works/${id}`);
}

export async function getRepoStats(): Promise<ApiResponse<RepoStatsResponse>> {
  return repoFetch<RepoStatsResponse>('/stats');
}
