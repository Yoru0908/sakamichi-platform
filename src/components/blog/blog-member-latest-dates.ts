import type { BlogItem, GroupMembersData } from './blog-api';

export function normalizeMemberName(member: string): string {
  return member.replace(/\s+/g, '').trim();
}

function parseMemberDate(date: string): Date | null {
  if (!date) return null;

  const trimmed = date.trim();
  const normalized = trimmed.replace(/[\/\.]/g, '-');
  const [datePart, timePart = ''] = normalized.split(/\s+/);
  const [year, month, day] = datePart.split('-');

  if (!year || !month || !day) return null;

  const [hours = '00', minutes = '00', seconds = '00'] = timePart.split(':');
  const parsed = new Date(
    `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`
  );

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatLatestDate(date: string): string | null {
  const parsed = parseMemberDate(date);
  if (!parsed) return null;

  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  const hasTime = /\d{1,2}:\d{2}/.test(date);

  return hasTime ? `${month}.${day} ${hours}:${minutes} 更新` : `${month}.${day} 更新`;
}

export function collectLatestMemberDatesFromBlogs(
  blogs: Pick<BlogItem, 'member' | 'publish_date'>[]
): Map<string, string> {
  const latestByMember = new Map<string, { date: string; timestamp: number }>();

  for (const blog of blogs) {
    const member = normalizeMemberName(blog.member || '');
    if (!member || !blog.publish_date) continue;

    const parsed = parseMemberDate(blog.publish_date);
    if (!parsed) continue;

    const timestamp = parsed.getTime();
    const current = latestByMember.get(member);
    if (!current || timestamp > current.timestamp) {
      latestByMember.set(member, { date: blog.publish_date, timestamp });
    }
  }

  const labels = new Map<string, string>();
  for (const [member, value] of latestByMember.entries()) {
    const formatted = formatLatestDate(value.date);
    if (formatted) {
      labels.set(member, formatted);
    }
  }

  return labels;
}

export function collectLatestMemberDateLabels(
  groupData: GroupMembersData | null,
  fallbackBlogs: Pick<BlogItem, 'member' | 'publish_date'>[] = []
): Map<string, string> {
  const labels = new Map<string, string>();
  if (!groupData?.generations) return labels;

  for (const generation of groupData.generations) {
    if (!generation.lastPostDates) continue;

    for (const [member, date] of Object.entries(generation.lastPostDates as Record<string, string>)) {
      const formatted = formatLatestDate(date);
      if (formatted) {
        labels.set(normalizeMemberName(member), formatted);
      }
    }
  }

  const fallbackLabels = collectLatestMemberDatesFromBlogs(fallbackBlogs);
  for (const [member, label] of fallbackLabels.entries()) {
    if (!labels.has(member)) {
      labels.set(member, label);
    }
  }

  return labels;
}

export function countMembersMissingLatestDates(groupData: GroupMembersData | null): number {
  if (!groupData?.generations) return 0;

  const graduated = new Set((groupData.graduated || []).map(normalizeMemberName));
  let missingCount = 0;

  for (const generation of groupData.generations) {
    const latestKeys = new Set(
      Object.keys(generation.lastPostDates || {}).map(normalizeMemberName)
    );

    for (const member of generation.members) {
      const normalizedMember = normalizeMemberName(member);
      if (graduated.has(normalizedMember)) continue;
      if (!latestKeys.has(normalizedMember)) {
        missingCount += 1;
      }
    }
  }

  return missingCount;
}
