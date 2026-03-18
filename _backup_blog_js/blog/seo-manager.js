/**
 * SEO 管理器 - 动态更新 Meta 标签和结构化数据
 * 用于优化 SPA 应用的搜索引擎可见性
 */
window.SEOManager = {
  // 默认配置
  defaults: {
    siteName: '坂道博客翻译',
    baseUrl: 'https://blog.sakamichi-tools.cn',
    defaultImage: 'https://blog.sakamichi-tools.cn/assets/og-image.jpg',
    defaultDescription: '提供乃木坂46、樱坂46、日向坂46成员官方博客的AI智能中文翻译，实时更新。'
  },
  
  /**
   * 更新页面 Meta 标签
   */
  updateMeta(options = {}) {
    const {
      title,
      description,
      keywords,
      image,
      url,
      type = 'website'
    } = options;
    
    // 更新 title
    if (title) {
      document.title = title === this.defaults.siteName 
        ? title 
        : `${title} - ${this.defaults.siteName}`;
    }
    
    // 更新或创建基础 meta 标签
    this.setMeta('description', description || this.defaults.defaultDescription);
    if (keywords) {
      this.setMeta('keywords', keywords);
    }
    
    // 更新 Open Graph
    this.setMetaProperty('og:title', title || document.title);
    this.setMetaProperty('og:description', description || this.defaults.defaultDescription);
    this.setMetaProperty('og:image', image || this.defaults.defaultImage);
    this.setMetaProperty('og:url', url || window.location.href);
    this.setMetaProperty('og:type', type);
    
    // 更新 Twitter Card
    this.setMetaName('twitter:title', title || document.title);
    this.setMetaName('twitter:description', description || this.defaults.defaultDescription);
    this.setMetaName('twitter:image', image || this.defaults.defaultImage);
    this.setMetaName('twitter:url', url || window.location.href);
    
    // 更新 Canonical URL
    this.updateCanonical(url || window.location.href);
    
    console.log('[SEO] Meta 标签已更新:', title);
  },
  
  /**
   * 设置 name meta 标签
   */
  setMeta(name, content) {
    if (!content) return;
    
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  },
  
  /**
   * 设置 property meta 标签（Open Graph）
   */
  setMetaProperty(property, content) {
    if (!content) return;
    
    let meta = document.querySelector(`meta[property="${property}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', property);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  },
  
  /**
   * 设置 name meta 标签（Twitter）
   */
  setMetaName(name, content) {
    if (!content) return;
    
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', name);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  },
  
  /**
   * 更新 Canonical URL
   */
  updateCanonical(url) {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    
    // 规范化 URL（移除 hash）
    const cleanUrl = url.split('#')[0];
    canonical.setAttribute('href', cleanUrl);
  },
  
  /**
   * 博客详情页 Meta
   */
  updateBlogMeta(blog) {
    const image = this.extractFirstImage(blog.translated_content);
    const description = this.generateDescription(blog.translated_content, 155);
    const groupName = window.GroupConfig?.getDisplayName(blog.group_name) || blog.group_name;
    
    this.updateMeta({
      title: `${blog.member} - ${blog.title}`,
      description: description,
      keywords: `${blog.member},${groupName},坂道博客,${blog.title}`,
      image: image,
      url: `${this.defaults.baseUrl}/#blog/${blog.id}`,
      type: 'article'
    });
    
    // 添加文章特定的 Open Graph 标签
    this.setMetaProperty('article:published_time', blog.publish_date);
    this.setMetaProperty('article:author', blog.member);
    this.setMetaProperty('article:section', groupName);
    
    // 🤖 使用 SGE 优化版本的结构化数据（包含完整 articleBody）
    this.enhanceBlogSchemaForSGE(blog);
  },
  
  /**
   * 成员页面 Meta
   */
  updateMemberMeta(member, group) {
    const groupName = window.GroupConfig?.getDisplayName(group) || group;
    
    this.updateMeta({
      title: `${member}的博客`,
      description: `查看${groupName}成员${member}的所有官方博客翻译，包含最新动态和日常分享。`,
      keywords: `${member},${groupName},成员博客,坂道系`,
      url: `${this.defaults.baseUrl}/#${group}/member/${encodeURIComponent(member)}`
    });
  },
  
  /**
   * 团体页面 Meta
   */
  updateGroupMeta(group) {
    const groupName = window.GroupConfig?.getDisplayName(group) || group;
    const descriptions = {
      'nogizaka': '乃木坂46成员官方博客中文翻译，包含全部成员的最新博客动态和精彩内容。',
      'sakurazaka': '樱坂46成员官方博客中文翻译，实时更新成员日常分享和活动花絮。',
      'hinatazaka': '日向坂46成员官方博客中文翻译，追踪成员最新消息和精彩瞬间。'
    };
    
    this.updateMeta({
      title: `${groupName}博客翻译`,
      description: descriptions[group] || `${groupName}成员官方博客中文翻译。`,
      keywords: `${groupName},坂道系,博客翻译,成员博客`,
      url: `${this.defaults.baseUrl}/#${group}`
    });
  },
  
  /**
   * 首页 Meta（重置为默认）
   */
  updateHomeMeta() {
    this.updateMeta({
      title: this.defaults.siteName,
      description: this.defaults.defaultDescription,
      keywords: '乃木坂46,樱坂46,日向坂46,坂道系,博客翻译',
      url: this.defaults.baseUrl
    });
    
    // 添加首页结构化数据
    this.generateWebsiteSchema();
  },
  
  /**
   * 🎯 初始化基础 Meta 标签（模块化：所有 Meta 由 JS 管理）
   */
  initializeBasicMeta() {
    // 基础 SEO Meta
    this.setMeta('author', 'Yoru');
    this.setMeta('robots', 'index, follow, max-image-preview:large');
    this.setMeta('googlebot', 'index, follow, max-snippet:-1, max-image-preview:large');
    
    // Open Graph 基础配置
    this.setMetaProperty('og:site_name', this.defaults.siteName);
    this.setMetaProperty('og:locale', 'zh_CN');
    
    // Twitter Card 基础配置
    this.setMetaName('twitter:card', 'summary_large_image');
    
    console.log('[SEO] 基础 Meta 标签已初始化（模块化管理）');
  },
  
  /**
   * 统计页面 Meta
   */
  updateStatsMeta() {
    this.updateMeta({
      title: '数据统计',
      description: '坂道系博客数据统计分析，包含成员博客数量、更新频率等详细信息。',
      keywords: '坂道系,数据统计,博客分析',
      url: `${this.defaults.baseUrl}/stats.html`
    });
  },
  
  /**
   * 工具函数：提取第一张图片
   */
  extractFirstImage(content) {
    if (!content) return this.defaults.defaultImage;
    
    // Markdown 格式图片
    const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
    if (markdownMatch) return markdownMatch[1];
    
    // HTML img 标签
    const htmlMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
    if (htmlMatch) return htmlMatch[1];
    
    return this.defaults.defaultImage;
  },
  
  /**
   * 工具函数：生成描述
   */
  generateDescription(content, maxLength = 155) {
    if (!content) return this.defaults.defaultDescription;
    
    // 移除 Markdown 标记和 HTML 标签
    const text = content
      .replace(/!\[.*?\]\(.*?\)/g, '')                    // 图片
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')          // 链接
      .replace(/<[^>]+>/g, '')                           // HTML 标签
      .replace(/[#*_~`]/g, '')                           // Markdown 标记
      .replace(/\s+/g, ' ')                              // 多余空格
      .trim();
    
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  },
  
  /**
   * 生成博客文章结构化数据（Schema.org）
   * @deprecated 请使用 enhanceBlogSchemaForSGE() - 包含 SGE 优化
   */
  generateBlogSchema(blog) {
    const schema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": blog.title,
      "alternativeHeadline": `${blog.member}的博客`,
      "image": this.extractFirstImage(blog.translated_content),
      "author": {
        "@type": "Person",
        "name": blog.member,
        "jobTitle": "偶像",
        "memberOf": {
          "@type": "Organization",
          "name": blog.group_name
        }
      },
      "publisher": {
        "@type": "Organization",
        "name": this.defaults.siteName,
        "logo": {
          "@type": "ImageObject",
          "url": `${this.defaults.baseUrl}/assets/logo.png`
        }
      },
      "datePublished": blog.publish_date,
      "dateModified": blog.updated_at || blog.publish_date,
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `${this.defaults.baseUrl}/#blog/${blog.id}`
      },
      "description": this.generateDescription(blog.translated_content, 200),
      "inLanguage": "zh-CN",
      "isBasedOn": blog.original_url || `${blog.group_name}官方网站`
    };
    
    this.insertSchema(schema, 'blog-schema');
  },
  
  /**
   * 生成网站结构化数据
   */
  generateWebsiteSchema() {
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": this.defaults.siteName,
      "alternateName": "Sakamichi Blog Translation",
      "url": this.defaults.baseUrl,
      "description": this.defaults.defaultDescription,
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${this.defaults.baseUrl}/?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      },
      "inLanguage": ["zh-CN", "zh-TW", "ja"],
      "publisher": {
        "@type": "Organization",
        "name": this.defaults.siteName
      }
    };
    
    this.insertSchema(schema, 'website-schema');
  },
  
  /**
   * 插入结构化数据到页面
   */
  insertSchema(schema, id) {
    // 移除旧的 schema
    const oldSchema = document.getElementById(id);
    if (oldSchema) {
      oldSchema.remove();
    }
    
    // 创建新的 schema
    const script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
    
    console.log(`[SEO] 结构化数据已添加: ${id}`);
  },
  
  /**
   * 🤖 SGE 优化：生成 FAQ Schema（用于首页）
   */
  generateFAQSchema() {
    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "如何查看坂道系成员的博客翻译？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "访问坂道博客翻译网站，选择对应团体标签（乃木坂46/樱坂46/日向坂46），即可查看所有成员的中文翻译博客。支持按成员筛选和搜索。"
          }
        },
        {
          "@type": "Question",
          "name": "博客翻译多久更新一次？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "本站使用AI实时翻译技术，成员发布新博客后约30分钟内完成翻译并更新到网站。每天24小时自动抓取和翻译。"
          }
        },
        {
          "@type": "Question",
          "name": "支持哪些坂道系团体？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "目前支持乃木坂46（nogizaka46）、樱坂46（sakurazaka46）、日向坂46（hinatazaka46）三个坂道系团体的全部成员博客翻译。"
          }
        },
        {
          "@type": "Question",
          "name": "翻译准确吗？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "本站使用 Google Gemini AI 进行智能翻译，针对日语博客内容进行了专门优化，翻译准确度高达95%以上。保留原文意思和语气，同时符合中文阅读习惯。"
          }
        }
      ]
    };
    
    this.insertSchema(schema, 'faq-schema');
    console.log('[SEO] FAQ Schema 已添加（SGE优化）');
  },
  
  /**
   * 🤖 SGE 优化：生成面包屑导航 Schema
   */
  generateBreadcrumbSchema(items) {
    if (!items || items.length === 0) return;
    
    const schema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": items.map((item, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "name": item.name,
        "item": item.url
      }))
    };
    
    this.insertSchema(schema, 'breadcrumb-schema');
    console.log('[SEO] Breadcrumb Schema 已添加（SGE优化）');
  },
  
  /**
   * 🤖 SGE 优化：为博客添加完整的 articleBody
   */
  enhanceBlogSchemaForSGE(blog) {
    // 提取纯文本内容
    const articleBody = this.extractTextContent(blog.translated_content);
    
    const schema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": blog.title,
      "alternativeHeadline": `${blog.member}的博客`,
      "image": this.extractFirstImage(blog.translated_content),
      "author": {
        "@type": "Person",
        "name": blog.member,
        "jobTitle": "偶像",
        "memberOf": {
          "@type": "Organization",
          "name": blog.group_name
        }
      },
      "publisher": {
        "@type": "Organization",
        "name": this.defaults.siteName,
        "logo": {
          "@type": "ImageObject",
          "url": `${this.defaults.baseUrl}/assets/logo.png`
        }
      },
      "datePublished": blog.publish_date,
      "dateModified": blog.updated_at || blog.publish_date,
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `${this.defaults.baseUrl}/#blog/${blog.id}`
      },
      "description": this.generateDescription(blog.translated_content, 200),
      "articleBody": articleBody,  // ⚠️ SGE 关键：完整文章内容
      "inLanguage": "zh-CN",
      "isBasedOn": blog.original_url || `${blog.group_name}官方网站`,
      "keywords": `${blog.member},${blog.group_name},坂道博客,博客翻译`
    };
    
    this.insertSchema(schema, 'blog-schema');
    console.log('[SEO] 增强版 Blog Schema 已添加（SGE优化）');
  },
  
  /**
   * 工具函数：提取纯文本内容（用于 SGE articleBody）
   */
  extractTextContent(content) {
    if (!content) return '';
    
    // 移除所有 Markdown 和 HTML 标记，保留纯文本
    return content
      .replace(/!\[.*?\]\(.*?\)/g, '')                    // 图片
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')          // 链接
      .replace(/<[^>]+>/g, '')                           // HTML 标签
      .replace(/[#*_~`]/g, '')                           // Markdown 标记
      .replace(/\s+/g, ' ')                              // 多余空格
      .trim();
  }
};

// 🎯 模块化初始化：所有 SEO 配置由 JS 管理
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.SEOManager.initializeBasicMeta();  // 1. 初始化基础 Meta
    window.SEOManager.updateHomeMeta();       // 2. 设置首页 Meta
    window.SEOManager.generateFAQSchema();    // 3. 添加 FAQ Schema (SGE优化)
    
    // 🎯 设置到统一状态管理
    if (window.App && window.App.seo) {
      window.App.seo.manager = window.SEOManager;
    }
  });
} else {
  window.SEOManager.initializeBasicMeta();
  window.SEOManager.updateHomeMeta();
  window.SEOManager.generateFAQSchema();
  
  // 🎯 设置到统一状态管理
  if (window.App && window.App.seo) {
    window.App.seo.manager = window.SEOManager;
  }
}

console.log('[SEO] SEO Manager 已加载（模块化 + SGE优化）');
console.log('[SEO] 可通过 App.seo.manager 访问');
