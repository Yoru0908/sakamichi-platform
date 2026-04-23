/** Community API client — photocard gallery */

import { API_CONFIG } from './constants';

const BASE = API_CONFIG.baseUrl;

export interface StampCounts {
  totoi: number;
  numa:  number;
  ose:   number;
  kami:  number;
  yusho: number;
}

export type StampType = keyof StampCounts;

export const STAMP_DEFS: { id: StampType; kanji: string; phrase: string; color: string }[] = [
  { id: 'totoi', kanji: '尊', phrase: '尊い',   color: '#8b5cf6' },
  { id: 'numa',  kanji: '沼', phrase: '沼った',  color: '#06b6d4' },
  { id: 'ose',   kanji: '推', phrase: '推せる', color: '#f59e0b' },
  { id: 'kami',  kanji: '神', phrase: '神すぎ', color: '#ef4444' },
  { id: 'yusho', kanji: '優', phrase: '優勝',   color: '#10b981' },
];

export interface CommunityWork {
  id: string;
  imageUrl: string;
  fullImageUrl: string;
  memberName: string;
  romajiName: string | null;
  groupStyle: string;
  theme: string | null;
  likeCount: number;
  liked: boolean;
  bookmarked: boolean;
  stamps: StampCounts;
  myStamps: StampType[];
  allowDownload: boolean;
  author: {
    id: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  createdAt: string;
}

export interface CommunityWorkDetail extends CommunityWork {
  viewCount: number;
}

export interface WorkListResponse {
  works: CommunityWork[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface ListWorksParams {
  group?: string;
  member?: string;
  sort?: 'latest' | 'popular';
  page?: number;
  limit?: number;
}

/** GET /api/community/works — browse community works */
export async function listWorks(params: ListWorksParams = {}): Promise<WorkListResponse> {
  const qs = new URLSearchParams();
  if (params.group) qs.set('group', params.group);
  if (params.member) qs.set('member', params.member);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const res = await fetch(`${BASE}/api/community/works?${qs}`, {
    credentials: 'include',
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to list works');
  return json.data;
}

/** GET /api/community/works/:id — get work detail */
export async function getWork(id: string): Promise<CommunityWorkDetail> {
  const res = await fetch(`${BASE}/api/community/works/${id}`, {
    credentials: 'include',
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Work not found');
  return json.data;
}

/** POST /api/community/works — publish a work */
export async function publishWork(data: {
  image: Blob;
  thumbnail?: Blob;
  memberName: string;
  romajiName?: string;
  groupStyle: string;
  theme?: string;
  allowDownload?: boolean;
  anonymous?: boolean;
}): Promise<{ id: string; imageUrl: string; fullImageUrl: string }> {
  const form = new FormData();
  form.append('image', data.image, 'full.png');
  if (data.thumbnail) form.append('thumbnail', data.thumbnail, 'thumb.webp');
  form.append('memberName', data.memberName);
  if (data.romajiName) form.append('romajiName', data.romajiName);
  form.append('groupStyle', data.groupStyle);
  if (data.theme) form.append('theme', data.theme);
  form.append('allowDownload', data.allowDownload === false ? '0' : '1');
  if (data.anonymous) form.append('anonymous', '1');

  const res = await fetch(`${BASE}/api/community/works`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to publish');
  return json.data;
}

/** DELETE /api/community/works/:id */
export async function deleteWork(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/community/works/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to delete');
}

/** POST /api/community/works/:id/like — toggle like */
export async function toggleLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  const res = await fetch(`${BASE}/api/community/works/${id}/like`, {
    method: 'POST',
    credentials: 'include',
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to toggle like');
  return json.data;
}

/** POST /api/community/works/:id/bookmark — toggle bookmark */
export async function toggleBookmark(id: string): Promise<{ bookmarked: boolean }> {
  const res = await fetch(`${BASE}/api/community/works/${id}/bookmark`, {
    method: 'POST',
    credentials: 'include',
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to toggle bookmark');
  return json.data;
}

/** GET /api/community/my-works — current user's works */
export async function listMyWorks(page = 1, limit = 20): Promise<WorkListResponse> {
  const res = await fetch(`${BASE}/api/community/my-works?page=${page}&limit=${limit}`, {
    credentials: 'include',
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to list my works');
  return json.data;
}

/** POST /api/community/works/:id/stamp — toggle stamp */
export async function toggleStamp(
  id: string,
  type: StampType,
): Promise<{ type: StampType; stamped: boolean; count: number }> {
  const res = await fetch(`${BASE}/api/community/works/${id}/stamp`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to toggle stamp');
  return json.data;
}

/** POST /api/report — submit a report (shared by community + repo) */
export type ReportReason = 'inappropriate' | 'spam' | 'copyright' | 'personal_info' | 'other';
export type ReportTargetType = 'community_work' | 'repo_work';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'inappropriate', label: '不适当内容' },
  { id: 'spam',          label: '垃圾内容' },
  { id: 'copyright',     label: '版权问题' },
  { id: 'personal_info', label: '包含个人信息' },
  { id: 'other',         label: '其他' },
];

export async function submitReport(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/api/report`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetId, reason }),
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to submit report');
  return json.data;
}

/** GET /api/community/my-bookmarks — current user's bookmarked works */
export async function listMyBookmarks(page = 1, limit = 20): Promise<WorkListResponse> {
  const res = await fetch(`${BASE}/api/community/my-bookmarks?page=${page}&limit=${limit}`, {
    credentials: 'include',
  });
  const json = await res.json() as any;
  if (!json.success) throw new Error(json.message || 'Failed to list bookmarks');
  return json.data;
}
