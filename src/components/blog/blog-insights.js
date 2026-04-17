export function normalizeMemberName(name) {
  return String(name || '').replace(/\s+/g, '');
}

export function filterBlogsByYearMonth(blogs, year, month = 'all') {
  return (blogs || []).filter((blog) => {
    const source = blog?.formatted_date || blog?.publish_date;
    if (!source) return false;
    const match = String(source).match(/(\d{4})[.\/\-](\d{1,2})/);
    if (!match) return false;
    if (match[1] !== String(year)) return false;
    if (month !== 'all' && Number(match[2]) !== Number(month)) return false;
    return true;
  });
}

export function calculateMemberStats(blogs, currentMembersList = [], existingTotalMembers = 0) {
  const memberStats = {};
  const normalizedMembersList = currentMembersList.map((name) => normalizeMemberName(name));
  const specialMembers = new Set(['ポカ']);

  for (const blog of blogs || []) {
    const member = blog?.member;
    if (!member || specialMembers.has(member)) continue;
    const normalized = normalizeMemberName(member);
    if (!normalized) continue;

    if (currentMembersList.length > 0) {
      const index = normalizedMembersList.indexOf(normalized);
      if (index === -1) continue;
      const standardName = currentMembersList[index];
      if (!memberStats[standardName]) memberStats[standardName] = { name: standardName, count: 0 };
      memberStats[standardName].count += 1;
    } else {
      if (!memberStats[normalized]) memberStats[normalized] = { name: normalized, count: 0 };
      memberStats[normalized].count += 1;
    }
  }

  const topMembers = Object.values(memberStats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const activeMembers = Object.keys(memberStats).length;
  const totalBlogs = (blogs || []).length;
  const avgBlogs = activeMembers > 0 ? Number((totalBlogs / activeMembers).toFixed(1)) : 0;

  return {
    activeMembers,
    totalMembers: existingTotalMembers || activeMembers,
    members: activeMembers,
    blogs: totalBlogs,
    avgBlogs,
    topMembers,
  };
}

export function getInteractionGroupMonths(data, group) {
  const months = Object.keys(data?.[group] || {});
  return months.sort();
}

export function getLatestInteractionMonth(data, group) {
  const months = getInteractionGroupMonths(data, group);
  return months.length ? months[months.length - 1] : null;
}

export function formatInteractionMonth(monthKey) {
  if (!monthKey) return '';
  const [year, month] = String(monthKey).split('-');
  return `${year}年${String(month).padStart(2, '0')}月`;
}
