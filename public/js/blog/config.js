/**
 * 全局配置文件
 * 统一管理所有硬编码的配置项
 */

// ========== API 配置 ==========
const API_BASE = 'https://api.sakamichi-tools.cn';
const LOCAL_API = 'http://localhost:8787';

// ========== 分页配置 ==========
const PAGE_SIZE = 32;           // 默认列表页大小
const SIDEBAR_LIMIT = 10;       // 侧边栏博客数量
const DETAIL_LIMIT = 50;        // 成员详情页博客数量

// ========== 缓存配置 ==========
const CACHE_TTL = 60 * 60 * 1000;  // 成员数据缓存时长（1小时）

// ========== 超时配置 ==========
const API_TIMEOUT = 15000;       // API 请求超时（15秒）
const TOAST_DURATION = 3000;    // Toast 提示显示时长（3秒）

// ========== Cloudinary 图片优化配置 ==========
const CLOUDINARY_CONFIG = {
  cloudName: 'djoegafjn',
  enabled: true,
  // 所有图片都会被优化（每月1000-2000张，远低于25,000张免费额度）
  transformations: {
    width: 600,      // 宽度600px（覆盖桌面2x和移动3x屏幕）
    quality: 75,     // 质量75%（883KB → ~80KB，节省91%）
    format: 'auto',  // 自动选择格式(WebP/JPEG)
    crop: 'scale'    // 按比例缩放
  }
};

/**
 * 获取Cloudinary优化后的图片URL
 * 🚀 所有图片都会被优化（不管索引）
 * @param {string} originalUrl - 原始图片URL
 * @returns {string} - 优化后的URL
 */
function getCloudinaryUrl(originalUrl, customWidth = null) {
  if (!CLOUDINARY_CONFIG.enabled) return originalUrl;
  if (!originalUrl || !originalUrl.startsWith('http')) return originalUrl;

  const { cloudName, transformations } = CLOUDINARY_CONFIG;
  // Use custom width if provided, otherwise default config
  const width = customWidth || transformations.width;
  const { quality, format, crop } = transformations;

  const encodedUrl = encodeURIComponent(originalUrl);
  const transformStr = `w_${width},q_${quality},f_${format},c_${crop}`;

  return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformStr}/${encodedUrl}`;
}

// ========== 暴露到全局 ==========
window.API_BASE = API_BASE;
window.LOCAL_API = LOCAL_API;
window.PAGE_SIZE = PAGE_SIZE;
window.SIDEBAR_LIMIT = SIDEBAR_LIMIT;
window.DETAIL_LIMIT = DETAIL_LIMIT;
window.CACHE_TTL = CACHE_TTL;
window.API_TIMEOUT = API_TIMEOUT;
window.TOAST_DURATION = TOAST_DURATION;
window.CLOUDINARY_CONFIG = CLOUDINARY_CONFIG;
window.getCloudinaryUrl = getCloudinaryUrl;

// 便于调试
console.log('[Config] 配置已加载:', {
  API_BASE,
  PAGE_SIZE,
  CACHE_TTL: `${CACHE_TTL / 1000 / 60}分钟`,
  Cloudinary: CLOUDINARY_CONFIG.enabled ? '✅ 已启用' : '❌ 已禁用'
});
