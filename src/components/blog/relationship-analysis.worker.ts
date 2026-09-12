import { analyzeBlogs, type BlogSource } from '../../utils/blog-relations/analyze.ts';
import type { Group } from '../../utils/blog-relations/roster.ts';

// HTML is parsed as inert data in a dedicated thread; never insert it into the DOM.
// Do not spend the shared Cloudflare request CPU budget parsing a whole month.
self.onmessage = (event: MessageEvent<{ rows: BlogSource[]; group: Group; month: string }>) => {
  try {
    const { rows, group, month } = event.data;
    self.postMessage({ success: true, data: analyzeBlogs(rows, group, month) });
  } catch (error) {
    self.postMessage({ success: false, error: error instanceof Error ? error.message : '日语提及分析失败' });
  }
};
