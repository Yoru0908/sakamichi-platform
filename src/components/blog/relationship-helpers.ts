import type { Edge } from '../../utils/blog-relations/analyze';

export function relationshipRanking(edges: Edge[]) {
  const targets = new Map<string, { name: string; generation: string; blogs: Set<string>; occurrences: number }>();
  for (const edge of edges) {
    const target = targets.get(edge.to) || { name: edge.to, generation: edge.toGen, blogs: new Set<string>(), occurrences: 0 };
    edge.evidence.forEach((item) => target.blogs.add(item.blogId));
    target.occurrences += edge.occurrences;
    targets.set(edge.to, target);
  }
  return [...targets.values()].map(({ blogs, ...item }) => ({ ...item, blogCount: blogs.size }))
    .sort((a, b) => b.blogCount - a.blogCount || b.occurrences - a.occurrences || a.name.localeCompare(b.name, 'ja'));
}

export function generationRelations(edges: Edge[]) {
  const order = ['一期生', '二期生', '三期生', '四期生', '五期生', '六期生', '期别未知'];
  const generations = [...new Set(edges.flatMap((edge) => [edge.fromGen, edge.toGen]))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { generations, matrix: generations.map((from) => generations.map((to) => edges.filter((edge) => edge.fromGen === from && edge.toGen === to).reduce((sum, edge) => sum + edge.articleCount, 0))) };
}
