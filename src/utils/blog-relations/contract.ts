export const ANALYSIS_VERSION = 'ja-evidence-v1';
export const SOURCE_SCHEMA_VERSION = 'ja-source-v1';
export const MAX_BLOGS = 800;
export type Group = 'nogizaka' | 'sakurazaka' | 'hinatazaka';
export const GROUP_NAMES: Record<Group, string> = { nogizaka: '乃木坂46', sakurazaka: '櫻坂46', hinatazaka: '日向坂46' };
export type BlogSource = {
  id: string; member: string; group_name: string; title: string | null; publish_date: string;
  original_url: string; original_content: string | null; bilingual_content: string | null;
  updated_at?: string; oversized?: number;
};
export type SourceMonth = {
  version: typeof SOURCE_SCHEMA_VERSION; group: Group; month: string; sourceFetchedAt: string; rows: BlogSource[];
};
