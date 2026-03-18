/**
 * 结构化内容渲染器
 * 解析后端返回的 [NEWLINE:N] 和 [IMAGE:N] 标记
 * 精确还原博客原始格式
 */

/**
 * 主渲染函数 - 解析结构化标记
 * @param {string} content - 包含标记的内容
 * @param {Array} images - 图片URL数组（可选）
 * @returns {string} - HTML格式的内容
 */
function renderStructuredContent(content, images = []) {
  if (!content) return '';

  console.log('[结构化渲染] 开始处理内容，长度:', content.length);

  // 首先提取所有图片URL（在移除frontmatter之前）
  const extractedImages = extractImageUrlsFromContent(content);
  if (extractedImages.length > 0) {
    images = extractedImages;
    console.log('[结构化渲染] 提取到图片URL:', images);
  }

  // 移除frontmatter（如果存在）
  let cleanContent = content;
  if (cleanContent.startsWith('---')) {
    const endIndex = cleanContent.indexOf('---', 3);
    if (endIndex !== -1) {
      cleanContent = cleanContent.substring(endIndex + 3).trim();
      console.log('[结构化渲染] 已移除frontmatter');
    }
  }

  const lines = cleanContent.split('\n');
  const result = [];
  let imageIndex = 0;

  // 调试：显示前10行
  console.log('[结构化渲染] 前10行内容:');
  lines.slice(0, 10).forEach((line, i) => {
    console.log(`  行${i + 1}: "${line}"`);
  });

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (!line) {
      // 跳过空行（不应该有，但以防万一）
      continue;
    }

    // 处理 [NEWLINE:N] 标记
    const newlineMatch = line.match(/^\[NEWLINE:(\d+)\]$/);
    if (newlineMatch) {
      const count = parseInt(newlineMatch[1], 10);
      console.log(`[结构化渲染] 发现NEWLINE标记，数量: ${count}`);
      result.push('<br>'.repeat(count));
      continue;
    }

    // 处理 [IMAGE:N] 标记
    const imageMatch = line.match(/^\[IMAGE:(\d+)\]$/);
    if (imageMatch) {
      const imageNum = parseInt(imageMatch[1], 10);
      console.log(`[结构化渲染] 发现IMAGE标记，编号: ${imageNum}`);

      // 如果提供了图片数组，使用对应的URL
      if (images && images[imageNum - 1]) {
        const imageUrl = images[imageNum - 1];

        // 🚀 性能优化：首屏图片（前8张）使用 eager loading
        // 🚀 Cloudinary优化：限制所有内容图片最大宽度为 800px（保持清晰度但大幅减小体积）
        let optimizedUrl = imageUrl;
        if (typeof window.getCloudinaryUrl === 'function') {
          optimizedUrl = window.getCloudinaryUrl(imageUrl, 800);
        }

        const loadingStrategy = imageNum <= 8
          ? 'loading="eager" fetchpriority="high"'  // 首屏8张图片立即加载
          : 'loading="lazy"';  // 其他图片懒加载

        result.push(`<img src="${optimizedUrl}" alt="图片${imageNum}" class="w-full my-4 rounded-lg" ${loadingStrategy} />`);
      } else {
        // 否则使用占位符
        result.push(`<!-- Image ${imageNum} placeholder -->`);
      }
      continue;
    }

    // 处理普通文本
    let processedLine = line;

    // 使用统一的 Markdown 处理器
    if (typeof MarkdownProcessor !== 'undefined') {
      // 检查是否包含 Markdown 图片（用于日志）
      if (processedLine.includes('![')) {
        const imgMatch = processedLine.match(/!\[.*?\]\((.*?)\)/);
        if (imgMatch) {
          console.log(`[结构化渲染] 发现Markdown图片: ${imgMatch[1]}`);
        }
      }
      processedLine = MarkdownProcessor.process(processedLine);
    } else {
      // 后备方案：基本处理
      console.warn('[结构化渲染] MarkdownProcessor 未加载');
      processedLine = processedLine.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />');
      processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }

    result.push(processedLine);

    // 如果下一行也是普通文本，添加普通换行
    if (i < lines.length - 1) {
      const nextLine = lines[i + 1].trim();
      if (nextLine && !nextLine.startsWith('[NEWLINE:') && !nextLine.startsWith('[IMAGE:')) {
        result.push('\n');
      }
    }
  }

  const finalHTML = result.join('');
  console.log('[结构化渲染] 渲染完成，结果长度:', finalHTML.length);

  return finalHTML;
}

/**
 * 从内容中提取图片URL
 * @param {string} content - 原始内容
 * @returns {Array} - 图片URL数组
 */
function extractImageUrls(content) {
  const images = [];
  const imageRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g;
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    images.push(match[1]);
  }

  return images;
}

/**
 * 从原始内容中提取图片URL（包括Markdown格式）
 * @param {string} content - 原始内容
 * @returns {Array} - 图片URL数组
 */
function extractImageUrlsFromContent(content) {
  const images = [];

  // 先尝试提取Markdown格式的图片
  const markdownRegex = /!\[.*?\]\((https?:\/\/[^\)]+)\)/g;
  let match;
  while ((match = markdownRegex.exec(content)) !== null) {
    images.push(match[1]);
  }

  // 如果没有找到Markdown格式的图片，尝试提取纯URL
  if (images.length === 0) {
    const urlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/gi;
    let urlMatch;
    while ((urlMatch = urlRegex.exec(content)) !== null) {
      images.push(urlMatch[0]);
    }
  }

  return images;
}

/**
 * 兼容性函数 - 将旧格式转换为新格式
 * 用于处理还未更新的后端数据
 * @param {string} markdown - Markdown格式的内容
 * @returns {string} - 带有标记的结构化内容
 */
function convertToStructuredFormat(markdown) {
  if (!markdown) return '';

  // 如果已经包含标记，直接返回
  if (markdown.includes('[NEWLINE:') || markdown.includes('[IMAGE:')) {
    return markdown;
  }

  console.log('[格式转换] 将Markdown转换为结构化格式');

  // 移除frontmatter
  let content = markdown.replace(/^---[\s\S]*?---\n*/m, '');

  // 替换图片为标记
  let imageCounter = 0;
  content = content.replace(/!\[.*?\]\((https?:\/\/[^\)]+)\)/g, () => {
    imageCounter++;
    return `[IMAGE:${imageCounter}]`;
  });

  // 处理连续空行
  const lines = content.split('\n');
  const result = [];
  let emptyLineCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      emptyLineCount++;
    } else {
      if (emptyLineCount > 0) {
        result.push(`[NEWLINE:${emptyLineCount}]`);
        emptyLineCount = 0;
      }
      result.push(trimmed);
    }
  }

  // 处理末尾的空行
  if (emptyLineCount > 0) {
    result.push(`[NEWLINE:${emptyLineCount}]`);
  }

  return result.join('\n');
}

/**
 * 检测内容格式
 * @param {string} content - 内容
 * @returns {string} - 'structured' | 'markdown' | 'unknown'
 */
function detectContentFormat(content) {
  if (!content) return 'unknown';

  if (content.includes('[NEWLINE:') || content.includes('[IMAGE:')) {
    return 'structured';
  }

  if (content.includes('![') || content.includes('**') || content.includes('##')) {
    return 'markdown';
  }

  return 'unknown';
}

/**
 * 统一渲染入口 - 自动检测格式并渲染
 * @param {string} content - 任意格式的内容
 * @param {Array} images - 图片URL数组（可选）
 * @returns {string} - HTML格式的内容
 */
function renderContent(content, images = []) {
  const format = detectContentFormat(content);
  console.log(`[渲染器] 检测到格式: ${format}`);

  switch (format) {
    case 'structured':
      return renderStructuredContent(content, images);
    case 'markdown':
      // 先转换为结构化格式，再渲染
      const structured = convertToStructuredFormat(content);
      return renderStructuredContent(structured, images);
    default:
      // 纯文本，直接返回
      return content.replace(/\n/g, '<br>');
  }
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderStructuredContent,
    extractImageUrls,
    convertToStructuredFormat,
    detectContentFormat,
    renderContent
  };
}