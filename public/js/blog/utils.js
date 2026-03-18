/**
 * 通用工具函数模块
 */

// 显示Toast提示
function showToast(message) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, window.TOAST_DURATION);
}

// 复制到剪贴板
function copyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

// 格式化日期 - 统一博客日期格式
// 输入: "2025/10/19", "2025.10.19 22:45", "2025-10-19", "2025.10.19 22:45:00"
// 输出: "2025.10.19" 或 "2025.10.19 22:45"（保留时间，去掉秒）
function formatDate(dateStr) {
  if (!dateStr) return '未知日期';

  try {
    // 统一分隔符
    let normalized = dateStr.replace(/[\/\-]/g, '.');
    
    // 分离日期和时间部分
    const parts = normalized.split(' ');
    const datePart = parts[0];
    let timePart = parts.slice(1).join(' ');
    
    // 处理时间部分：去掉秒数（如果有）
    if (timePart && timePart.includes(':')) {
      // 分割时间：12:05:00 → ['12', '05', '00']
      const timeParts = timePart.split(':');
      if (timeParts.length >= 2) {
        // 只保留小时和分钟：12:05
        timePart = `${timeParts[0]}:${timeParts[1]}`;
      }
    }
    
    // 处理日期部分：补零
    const [year, month, day] = datePart.split('.');
    if (year && month && day) {
      const formatted = `${year}.${month.padStart(2, '0')}.${day.padStart(2, '0')}`;
      return timePart ? `${formatted} ${timePart}` : formatted;
    }
    
    return normalized;
  } catch (e) {
    console.warn('[formatDate] 格式化失败:', dateStr, e);
    return dateStr; // 降级返回原值
  }
}

// 兼容旧名称（向后兼容）
function standardizeBlogDate(dateStr) {
  return formatDate(dateStr);
}

// 以下函数保留以兼容现有代码，但推荐使用formatDate
function parseBlogDate(dateStr) {
  if (!dateStr) return null;
  try {
    const normalized = dateStr.replace(/[\/\.]/g, '-').split(/[\sT]/)[0];
    return new Date(normalized);
  } catch (e) {
    return null;
  }
}

function extractDateParts(dateStr) {
  if (!dateStr) return null;
  const normalized = dateStr.replace(/[\/\-]/g, '.');
  const parts = normalized.split(/[\sT]/)[0].split('.');
  if (parts.length >= 3) {
    return { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) };
  }
  return null;
}

function isSameDate(date1, date2) {
  if (!date1 || !date2) return false;
  const d1 = formatDate(date1).split(' ')[0];
  const d2 = formatDate(date2).split(' ')[0];
  return d1 === d2;
}

function isInMonth(dateStr, year, month) {
  const parts = extractDateParts(dateStr);
  return parts && parts.year === year && parts.month === month;
}

// 节流函数
function throttle(func, wait) {
  let timeout;
  let lastCall = 0;
  
  return function(...args) {
    const now = Date.now();
    
    if (now - lastCall >= wait) {
      func.apply(this, args);
      lastCall = now;
    } else {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(this, args);
        lastCall = Date.now();
      }, wait - (now - lastCall));
    }
  };
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

// 检测内容格式
function detectContentFormat(content) {
  // 检查是否包含结构化标记
  const structuredMarkers = ['[TITLE]', '[DATE]', '[CONTENT]', '[IMAGE]'];
  const hasStructuredMarkers = structuredMarkers.some(marker => content.includes(marker));
  
  if (hasStructuredMarkers) {
    return 'structured';
  }
  
  // 检查是否为JSON格式
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return 'json';
    }
  } catch (e) {
    // 不是JSON，继续检查
  }
  
  // 默认为markdown
  return 'markdown';
}

// 提取图片URLs
function extractImageUrls(content) {
  const urls = [];
  
  // Markdown格式图片
  const markdownRegex = /!\[.*?\]\((.*?)\)/g;
  let match;
  while ((match = markdownRegex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  
  // HTML img标签
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
  while ((match = imgRegex.exec(content)) !== null) {
    if (!urls.includes(match[1])) {
      urls.push(match[1]);
    }
  }
  
  return urls;
}

// ✨ 数据源处理：统一格式化博客数据
// 在所有数据获取点调用，避免重复格式化
function processBlogData(blog) {
  if (!blog) return blog;
  
  return {
    ...blog,
    formatted_date: formatDate(blog.publish_date)
  };
}

// 批量处理博客数据
function processBlogsData(blogs) {
  if (!Array.isArray(blogs)) return blogs;
  return blogs.map(processBlogData);
}

// 导出给全局使用
window.showToast = showToast;
window.copyToClipboard = copyToClipboard;
window.formatDate = formatDate;
window.standardizeBlogDate = standardizeBlogDate;
window.parseBlogDate = parseBlogDate;
window.extractDateParts = extractDateParts;
window.isSameDate = isSameDate;
window.isInMonth = isInMonth;
window.throttle = throttle;
window.debounce = debounce;
window.detectContentFormat = detectContentFormat;
window.extractImageUrls = extractImageUrls;
window.processBlogData = processBlogData;
window.processBlogsData = processBlogsData;
