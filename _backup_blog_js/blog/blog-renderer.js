/**
 * 博客内容渲染模块
 * 处理不同团体的博客内容渲染
 */

// 渲染内容 - 使用新的结构化渲染器
function renderMarkdown(markdown, groupName = '') {
  console.log('渲染博客，团体:', groupName);
  console.log('原始内容预览:', markdown.substring(0, 200));

  // 首先总是移除frontmatter（如果存在）
  let cleanMarkdown = markdown;
  if (cleanMarkdown.startsWith('---')) {
    const endIndex = cleanMarkdown.indexOf('---', 3);
    if (endIndex !== -1) {
      cleanMarkdown = cleanMarkdown.substring(endIndex + 3).trim();
    }
  }

  // 优先检查是否包含NEWLINE标记（结构化内容）
  // 注意：即使没有[IMAGE:]标记，如果有[NEWLINE:]也使用结构化渲染器
  if (cleanMarkdown.includes('[NEWLINE:') || cleanMarkdown.includes('[IMAGE:')) {
    console.log('检测到结构化标记，使用结构化渲染器');
    if (typeof renderStructuredContent === 'function') {
      // 提取图片URL（支持Markdown格式）
      let images = [];
      if (typeof extractImageUrlsFromContent === 'function') {
        images = extractImageUrlsFromContent(cleanMarkdown);
      } else if (typeof extractImageUrls === 'function') {
        images = extractImageUrls(cleanMarkdown);
      }
      return renderStructuredContent(cleanMarkdown, images);
    } else {
      console.error('renderStructuredContent 函数未找到！');
    }
  }
  
  // 其次，检测内容格式（如果函数存在）
  if (typeof detectContentFormat === 'function' && typeof renderStructuredContent === 'function') {
    const format = detectContentFormat(cleanMarkdown);
    console.log('检测到内容格式:', format);

    // 如果是结构化格式，使用新渲染器
    if (format === 'structured') {
      console.log('使用结构化渲染器（通过detectContentFormat）');
      // 提取图片URL（支持Markdown格式）
      let images = [];
      if (typeof extractImageUrlsFromContent === 'function') {
        images = extractImageUrlsFromContent(cleanMarkdown);
      } else if (typeof extractImageUrls === 'function') {
        images = extractImageUrls(cleanMarkdown);
      }
      return renderStructuredContent(cleanMarkdown, images);
    }
  }

  // ⚠️ 备用逻辑：如果执行到这里，说明博客数据可能有问题
  console.error('⚠️ 未检测到结构化标记，使用基本渲染（备用逻辑）');
  console.error('博客团体:', groupName);
  console.error('内容预览:', cleanMarkdown.substring(0, 300));
  
  // 发送Discord通知（异步，不阻塞渲染）
  notifyMissingStructuredTags(groupName, cleanMarkdown);

  // 使用已清理的内容
  let content = cleanMarkdown;

  // 使用统一的 Markdown 处理器
  if (typeof MarkdownProcessor !== 'undefined') {
    content = MarkdownProcessor.process(content);
  } else {
    // 后备方案：基本处理
    console.warn('MarkdownProcessor 未加载，使用基本处理');
    content = content.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />');
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  // 简单换行处理
  return content.replace(/\n/g, '<br>');
}

// ===== Discord通知函数 =====

/**
 * 发送缺少结构化标记的通知到后端
 * @param {string} groupName - 团体名称
 * @param {string} content - 博客内容
 */
async function notifyMissingStructuredTags(groupName, content) {
  // 本地环境跳过
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[Discord] 本地环境，跳过通知');
    return;
  }

  // 节流：同一团体5分钟内只发送一次
  const cacheKey = `missing_tags_${groupName}`;
  const lastSent = sessionStorage.getItem(cacheKey);
  const now = Date.now();
  if (lastSent && now - parseInt(lastSent) < 5 * 60 * 1000) {
    console.log('[Discord] 节流中，跳过通知');
    return;
  }

  try {
    const response = await fetch('https://api.sakamichi-tools.cn/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'missing_structured_tags',
        group: groupName,
        contentPreview: content.substring(0, 200),
        url: window.location.href,
        timestamp: new Date().toISOString()
      })
    });

    if (response.ok) {
      console.log('[Discord] 通知已发送');
      sessionStorage.setItem(cacheKey, now.toString());
    } else {
      console.error('[Discord] 通知发送失败:', response.status);
    }
  } catch (error) {
    console.error('[Discord] 通知发送异常:', error);
  }
}

// ===== Phase 3: 命名空间迁移 =====

// 创建 App 全局命名空间（如果不存在）
if (typeof window.App === 'undefined') {
  window.App = {};
}

// 创建 App.render 子命名空间
window.App.render = {
  // 主入口：Markdown 渲染
  markdown: renderMarkdown,
  
  // 结构化渲染器（如果已加载）
  get structured() {
    return typeof renderStructuredContent !== 'undefined' 
      ? renderStructuredContent 
      : null;
  }
};

// 过渡期：保留 window 映射（向后兼容）
window.renderMarkdown = App.render.markdown;

console.log('[blog-renderer] ✅ 已迁移到 App.render 命名空间');
