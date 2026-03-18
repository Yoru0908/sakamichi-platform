/**
 * Mock data for homepage components (Phase 1).
 * Will be replaced by real API calls when backends are ready.
 */

export interface BlogItem {
  id: string;
  member_name: string;
  avatar_url: string;
  title: string;
  translated_preview: string;
  group: 'nogizaka' | 'sakurazaka' | 'hinatazaka';
  created_at: string;
}

export interface NowPlaying {
  is_live: boolean;
  station: string | null;
  program: string | null;
  performer: string | null;
  time_range: string | null;
  next: { program: string; date: string } | null;
}

export interface MSGItem {
  id: string;
  member_name: string;
  avatar_url: string;
  content_preview: string;
  like_count: number;
  group: 'nogizaka' | 'sakurazaka' | 'hinatazaka';
  created_at: string;
}

export interface GalleryItem {
  id: string;
  thumbnail_url: string;
  creator_name: string;
  like_count: number;
  tool_type: string;
}

// --- Mock Blog Data ---
export const MOCK_BLOGS: BlogItem[] = [
  {
    id: 'blog-001',
    member_name: '久保史緒里',
    avatar_url: '/images/mock/avatar-kubo.jpg',
    title: '映画の感想',
    translated_preview: '最近看了一部很棒的电影，剧情超乎预期，推荐大家去看看...',
    group: 'nogizaka',
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 'blog-002',
    member_name: '藤吉夏鈴',
    avatar_url: '/images/mock/avatar-fujiyoshi.jpg',
    title: '最近のこと',
    translated_preview: '天气变暖了，和朋友一起出去散步，发现了一家很可爱的杂货店...',
    group: 'sakurazaka',
    created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    id: 'blog-003',
    member_name: '小坂菜緒',
    avatar_url: '/images/mock/avatar-kosaka.jpg',
    title: 'ありがとう',
    translated_preview: '谢谢大家一直以来的支持！最近一直在为演唱会做准备，请期待...',
    group: 'hinatazaka',
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'blog-004',
    member_name: '遠藤さくら',
    avatar_url: '/images/mock/avatar-endo.jpg',
    title: '春が来た！',
    translated_preview: '春天到了！樱花开始开了，今天拍了很多照片，和大家分享...',
    group: 'nogizaka',
    created_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
  },
];

// --- Mock Now Playing ---
export const MOCK_NOW_PLAYING: NowPlaying = {
  is_live: true,
  station: 'ニッポン放送',
  program: '乃木坂46のオールナイトニッポン',
  performer: '久保史緒里',
  time_range: '25:00 - 27:00',
  next: null,
};

export const MOCK_NOW_PLAYING_OFF: NowPlaying = {
  is_live: false,
  station: null,
  program: null,
  performer: null,
  time_range: null,
  next: {
    program: 'さくみみ',
    date: '2025-03-15T22:00:00+09:00',
  },
};

// --- Mock Trending MSG ---
export const MOCK_TRENDING_MSG: MSGItem[] = [
  {
    id: 'msg-001',
    member_name: '齋藤飛鳥',
    avatar_url: '/images/mock/avatar-saito.jpg',
    content_preview: '今天的演唱会真的太开心了！谢谢所有来到现场的大家 ♡',
    like_count: 128,
    group: 'nogizaka',
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'msg-002',
    member_name: '田村保乃',
    avatar_url: '/images/mock/avatar-tamura.jpg',
    content_preview: '新的MV拍摄结束了～能在这么美的地方拍摄真的很幸运',
    like_count: 96,
    group: 'sakurazaka',
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
  {
    id: 'msg-003',
    member_name: '金村美玖',
    avatar_url: '/images/mock/avatar-kanemura.jpg',
    content_preview: '明天有握手会，大家来找我玩啊～准备了新的发型！',
    like_count: 85,
    group: 'hinatazaka',
    created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
  },
  {
    id: 'msg-004',
    member_name: '賀喜遥香',
    avatar_url: '/images/mock/avatar-kaki.jpg',
    content_preview: '终于吃到了一直想吃的蛋糕～太幸福了 (◍•ᴗ•◍)',
    like_count: 72,
    group: 'nogizaka',
    created_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
  },
];

// --- Mock Gallery ---
export const MOCK_GALLERY: GalleryItem[] = [
  { id: 'gal-001', thumbnail_url: '/images/mock/gallery-1.jpg', creator_name: 'sakurafan46', like_count: 156, tool_type: 'photocard' },
  { id: 'gal-002', thumbnail_url: '/images/mock/gallery-2.jpg', creator_name: 'hinata_love', like_count: 112, tool_type: 'photocard' },
  { id: 'gal-003', thumbnail_url: '/images/mock/gallery-3.jpg', creator_name: 'nogi_creator', like_count: 98, tool_type: 'msg-generator' },
  { id: 'gal-004', thumbnail_url: '/images/mock/gallery-4.jpg', creator_name: 'sakamichi_art', like_count: 87, tool_type: 'photocard' },
];

// --- Group color map ---
export const GROUP_COLORS: Record<string, string> = {
  nogizaka: 'var(--color-brand-nogi)',
  sakurazaka: 'var(--color-brand-sakura)',
  hinatazaka: 'var(--color-brand-hinata)',
};

// --- Relative time helper ---
export function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / (3600 * 1000));
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}h前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return `${Math.floor(days / 7)}周前`;
}
