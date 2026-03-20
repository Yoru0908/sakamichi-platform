/** Blog API client with caching */

import {
  getApiBaseUrl,
  getGroupApiName,
  formatBlogDate,
  ALL_PAGE_SIZE,
  PAGE_SIZE,
  DETAIL_LIMIT,
  CACHE_TTL,
} from './blog-config';

// ===== Types =====

export interface BlogItem {
  id: string;
  title: string;
  member: string;
  group_name: string;
  publish_date: string;
  formatted_date: string;
  translated_content?: string;
  bilingual_content?: string;
  original_url?: string;
  content?: string;
}

export interface Generation {
  name: string;
  members: string[];
  lastPostDates?: Record<string, string>;
}

export interface GroupMembersData {
  generations: Generation[];
  graduated?: string[];
  totalMembers?: number;
}

export interface PaginationInfo {
  total?: number;
  totalCount?: number;
  totalPages?: number;
  hasMore?: boolean;
  currentPage?: number;
}

export interface BlogsResponse {
  success: boolean;
  blogs: BlogItem[];
  total?: number;
  pagination?: PaginationInfo;
  error?: string;
}

export interface SearchResponse {
  success: boolean;
  data: BlogItem[];
  count?: number;
  error?: string;
}

// ===== Cache =====

const blogCacheMap = new Map<string, { data: BlogItem[]; time: number }>();

function getCached(key: string): BlogItem[] | null {
  const cached = blogCacheMap.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
  return null;
}

function setCache(key: string, data: BlogItem[]) {
  blogCacheMap.set(key, { data, time: Date.now() });
}

// ===== Fetch helper =====

async function fetchWithRetry(url: string, retries = 2, backoff = 1000): Promise<Response> {
  try {
    const response = await fetch(url);
    if (!response.ok && response.status >= 500 && retries > 0) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithRetry(url, retries - 1, backoff * 2);
    }
    throw error;
  }
}

function processBlog(blog: any): BlogItem {
  return {
    ...blog,
    formatted_date: formatBlogDate(blog.publish_date),
  };
}

function removeDuplicates(blogs: BlogItem[]): BlogItem[] {
  const map = new Map<string, BlogItem>();
  for (const blog of blogs) {
    const key = blog.id || `${blog.title}_${blog.member}_${blog.publish_date}`;
    if (!map.has(key)) map.set(key, blog);
  }
  return [...map.values()];
}

// ===== API functions =====

export async function fetchBlogs(params: {
  group?: string;
  member?: string;
  page?: number;
  useCache?: boolean;
}): Promise<{ blogs: BlogItem[]; total?: number; hasMore: boolean; pagination?: PaginationInfo }> {
  const { group = 'all', member, page = 1, useCache = true } = params;
  const isAll = group === 'all';
  const perPage = isAll ? ALL_PAGE_SIZE : PAGE_SIZE;

  // Check cache
  const cacheKey = `${group}_${page}_${member || ''}`;
  if (useCache && !member) {
    const cached = getCached(cacheKey);
    if (cached && cached.length > 0) {
      return { blogs: cached, hasMore: isAll ? cached.length >= perPage : false };
    }
  }

  const offset = (page - 1) * perPage;
  const urlParams = new URLSearchParams({ limit: String(perPage), offset: String(offset) });

  if (group !== 'all') {
    urlParams.append('group', getGroupApiName(group));
  }
  if (member) {
    urlParams.append('member', member);
  }

  const apiBase = getApiBaseUrl();
  const url = `${apiBase}/api/blogs?${urlParams}`;
  const response = await fetchWithRetry(url);
  const data: BlogsResponse = await response.json();

  if (!data.success || !data.blogs) {
    throw new Error(data.error || '加载博客失败');
  }

  let blogs = data.blogs.map(processBlog);
  blogs = removeDuplicates(blogs);
  blogs.sort((a, b) => {
    const da = new Date(a.publish_date || 0).getTime();
    const db = new Date(b.publish_date || 0).getTime();
    return db - da;
  });

  // Cache
  if (!member) {
    setCache(cacheKey, blogs);
  }

  const pag = data.pagination || {};
  const total = data.total ?? pag.total ?? pag.totalCount ?? undefined;
  const hasMore = typeof pag.hasMore === 'boolean' ? pag.hasMore : blogs.length >= perPage;

  return { blogs, total, hasMore, pagination: pag };
}

export async function fetchBlogById(blogId: string): Promise<BlogItem | null> {
  const apiBase = getApiBaseUrl();
  const response = await fetchWithRetry(`${apiBase}/api/blogs/${blogId}`);
  const data = await response.json();
  if (data.success && data.blog) {
    return processBlog(data.blog);
  }
  return null;
}

export async function searchBlogs(query: string, group?: string, dateFrom?: string, dateTo?: string): Promise<{ blogs: BlogItem[]; count: number }> {
  const apiBase = getApiBaseUrl();
  const params = new URLSearchParams({ q: query, limit: '100' });
  if (group && group !== 'all') {
    params.append('group', getGroupApiName(group));
  }
  if (dateFrom) params.append('from', dateFrom);
  if (dateTo) params.append('to', dateTo);

  const response = await fetchWithRetry(`${apiBase}/api/search?${params}`);
  const data: SearchResponse = await response.json();

  if (!data.success) throw new Error(data.error || '搜索失败');

  const blogs = (data.data || []).map(processBlog);
  return { blogs, count: data.count || blogs.length };
}

export async function fetchGroupMembers(group: string): Promise<GroupMembersData | null> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/api/members/${group}?t=${Date.now()}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchMemberBlogs(member: string, group: string): Promise<BlogItem[]> {
  const apiBase = getApiBaseUrl();
  const groupApiName = getGroupApiName(group);
  const url = `${apiBase}/api/blogs?group=${encodeURIComponent(groupApiName)}&member=${encodeURIComponent(member)}&limit=${DETAIL_LIMIT}`;
  const response = await fetchWithRetry(url);
  const data: BlogsResponse = await response.json();
  if (data.success && data.blogs) {
    return data.blogs.map(processBlog);
  }
  return [];
}

export async function fetchMemberImages(): Promise<Record<string, { imageUrl: string }>> {
  try {
    const response = await fetch('/data/member-images.json');
    if (!response.ok) return {};
    const data = await response.json();
    return data.images || {};
  } catch {
    return {};
  }
}
