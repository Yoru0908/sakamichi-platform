/**
 * Markdown 处理器
 * 统一处理 Markdown 格式转换，避免重复代码
 */

const MarkdownProcessor = {
  /**
   * 处理 Markdown 图片: ![alt](url) -> <img> (带占位符优化)
   * @param {string} content - 要处理的内容
   * @returns {string} 处理后的内容
   */
  processImages(content) {
    return content.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
      // 🚀 Cloudinary优化：限制最大宽度 800px
      let optimizedUrl = url;
      if (typeof window.getCloudinaryUrl === 'function') {
        optimizedUrl = window.getCloudinaryUrl(url, 800);
      }

      return `
        <div class="blog-image-wrapper my-4">
          <img data-src="${optimizedUrl}" 
               alt="${alt || '图片'}" 
               class="w-full rounded-lg lazy-image" 
               onload="this.classList.add('loaded')" />
        </div>
      `;
    });
  },

  /**
   * 处理 Markdown 粗体: **text** -> <strong>
   * @param {string} content - 要处理的内容
   * @returns {string} 处理后的内容
   */
  processBold(content) {
    return content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  },

  /**
   * 处理 URL 链接: http://... -> <a>
   * @param {string} content - 要处理的内容
   * @returns {string} 处理后的内容
   */
  processLinks(content) {
    return content.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
      // 如果是图片格式或已经在 img 标签中，不处理
      if (match.includes('.jpg') || match.includes('.png') ||
        match.includes('.gif') || match.includes('.jpeg') ||
        match.includes('.webp')) {
        return match;
      }
      // ✅ 添加内联样式确保链接可点击
      return `<a href="${match}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; cursor: pointer; word-break: break-all;">${match}</a>`;
    });
  },

  /**
   * 统一入口：处理所有 Markdown 格式
   * @param {string} content - 要处理的内容
   * @returns {string} 处理后的内容
   */
  process(content) {
    if (!content) return '';

    let result = content;
    result = this.processImages(result);
    result = this.processBold(result);
    result = this.processLinks(result);
    return result;
  }
};

// 导出给全局使用
if (typeof window !== 'undefined') {
  window.MarkdownProcessor = MarkdownProcessor;
}
