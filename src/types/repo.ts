/* ── Core data types for Repo Generator & Community ── */

export type GroupId = 'nogizaka' | 'sakurazaka' | 'hinatazaka';

export interface Member {
  id: string;          // e.g. "takai_rika"
  name: string;        // e.g. "高井俐香"
  nameKana?: string;   // e.g. "たかい りか"
  group: GroupId;
  groupName: string;   // e.g. "日向坂46"
  imageUrl: string;    // official promo photo
}

export interface Message {
  id: string;
  speaker: 'me' | 'member' | 'narration';
  text: string;
  imageUrl?: string;  // optional inline image (user-uploaded or URL)
}

export type AtmosphereTag =
  | 'fishing'    // 🎣 钓人
  | 'funny'      // 🤣 搞笑
  | 'touching'   // 😭 感人
  | 'salty'      // 🧂 盐対応
  | 'godly';     // ✨ 神対応

export const ATMOSPHERE_TAGS: { id: AtmosphereTag; emoji: string; label: string; labelJa: string }[] = [
  { id: 'fishing',  emoji: '🎣', label: '钓人',   labelJa: '釣り' },
  { id: 'funny',    emoji: '🤣', label: '搞笑',   labelJa: '面白い' },
  { id: 'touching', emoji: '😭', label: '感人',   labelJa: '感動' },
  { id: 'salty',    emoji: '🧂', label: '盐対応', labelJa: '塩対応' },
  { id: 'godly',    emoji: '✨', label: '神対応', labelJa: '神対応' },
];

export type ReactionType = 'lemon' | 'sweet' | 'funny' | 'pray';

export const REACTION_TYPES: { id: ReactionType; emoji: string; label: string }[] = [
  { id: 'lemon', emoji: '🍋', label: '酸了' },
  { id: 'sweet', emoji: '🍭', label: '甜' },
  { id: 'funny', emoji: '🤣', label: '笑死' },
  { id: 'pray',  emoji: '🙏', label: '感谢' },
];

export interface Reactions {
  lemon: number;
  sweet: number;
  funny: number;
  pray: number;
}

export type TemplateId = 'meguri' | 'line' | 'oshi-color';

export const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  { id: 'meguri',     label: '咪咕力',       description: '仿线上见面会界面' },
  { id: 'line',       label: 'LINE 风格',    description: '仿 LINE 聊天' },
  { id: 'oshi-color', label: '応援色',       description: '成员主题色背景' },
];

export interface RepoData {
  memberId: string;
  memberName: string;
  groupId: GroupId;
  groupName: string;
  memberImageUrl: string;
  eventDate: string;       // "2026/3/8"
  eventType: string;       // "ミーグリ" | "オンラインミート&グリート"
  slotNumber: number;      // 第X部
  ticketCount: number;     // 枚数
  nickname: string;
  userAvatar?: string;     // user's avatar URL (from account or custom)
  customMemberAvatar?: string; // user-uploaded member avatar (overrides official photo)
  messages: Message[];
  tags: AtmosphereTag[];
}

/** Published repo in community */
export interface PublishedRepo extends RepoData {
  id: number;
  userId?: string;
  userName?: string;
  reactions: Reactions;
  createdAt: string;       // ISO date
  isPublic: boolean;
  template: TemplateId;
}

/* ── API interfaces (for future Worker integration) ── */

export interface CreateRepoRequest {
  memberId: string;
  eventDate: string;
  eventType: string;
  slotNumber: number;
  ticketCount: number;
  nickname: string;
  messages: Omit<Message, 'id'>[];
  tags: AtmosphereTag[];
  template: TemplateId;
  isPublic: boolean;
}

export interface ListReposParams {
  page?: number;
  limit?: number;
  group?: GroupId;
  memberId?: string;
  tag?: AtmosphereTag;
  sort?: 'latest' | 'popular';
  search?: string;
}

export interface ListReposResponse {
  repos: PublishedRepo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReactRequest {
  type: ReactionType;
}

/* ── Group metadata ── */

export const GROUP_META: Record<GroupId, { name: string; color: string; lightColor: string; bgColor: string }> = {
  nogizaka:   { name: '乃木坂46', color: '#742581', lightColor: '#9b4dca', bgColor: '#f5edf7' },
  sakurazaka: { name: '櫻坂46',   color: '#F19DB5', lightColor: '#f7c4d4', bgColor: '#fdf0f4' },
  hinatazaka: { name: '日向坂46', color: '#7BC7E8', lightColor: '#a8ddf2', bgColor: '#eef8fc' },
};
