/**
 * 滚动渐现动画模块
 * 使用 IntersectionObserver 实现乃木坂官网风格的滚动渐现效果
 */

// 全局 Observer 实例
let scrollAnimationObserver = null;

/**
 * 初始化滚动动画 Observer
 */
function initScrollAnimations() {
  // 创建 Observer
  scrollAnimationObserver = new IntersectionObserver((entries) => {
    console.log('[ScrollAnimations] Observer 回调触发，条目数:', entries.length);
    entries.forEach((entry, index) => {
      console.log(`[ScrollAnimations] 条目 ${index + 1}:`, {
        isIntersecting: entry.isIntersecting,
        target: entry.target.className
      });
      
      if (entry.isIntersecting) {
        // 添加延迟，创造波浪效果
        setTimeout(() => {
          console.log(`[ScrollAnimations] 添加 visible 类:`, entry.target.className);
          entry.target.classList.add('visible');
        }, index * 50); // 每个元素延迟 50ms
        
        // 只触发一次动画
        scrollAnimationObserver.unobserve(entry.target);
      }
    });
  }, {
    // 提前触发（元素距离视口底部 100px 时触发）
    rootMargin: '0px 0px -100px 0px',
    threshold: 0.1
  });
  
  // 监听所有现有的博客卡片
  observeAllBlogCards();
  
  console.log('✨ 滚动渐现动画已初始化');
}

/**
 * 监听所有博客卡片
 */
function observeAllBlogCards() {
  const cards = document.querySelectorAll('.blog-card:not(.visible)');
  cards.forEach(card => {
    if (scrollAnimationObserver) {
      scrollAnimationObserver.observe(card);
    }
  });
}

/**
 * 监听单个元素（用于动态添加的元素）
 * @param {HTMLElement} element - 要监听的元素
 */
function observeElement(element) {
  if (scrollAnimationObserver && element) {
    scrollAnimationObserver.observe(element);
  }
}

/**
 * 批量监听元素
 * @param {NodeList|Array} elements - 元素列表
 */
function observeElements(elements) {
  console.log('[ScrollAnimations] observeElements 被调用，元素数量:', elements.length);
  console.log('[ScrollAnimations] observer 存在:', !!scrollAnimationObserver);
  
  if (!scrollAnimationObserver) {
    console.warn('[ScrollAnimations] observer 不存在，重新初始化');
    initScrollAnimations();
  }
  
  elements.forEach((element, index) => {
    if (element && !element.classList.contains('visible')) {
      console.log(`[ScrollAnimations] 监听元素 ${index + 1}`, element.className);
      scrollAnimationObserver.observe(element);
    }
  });
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScrollAnimations);
} else {
  initScrollAnimations();
}

// 导出给全局使用
window.scrollAnimationObserver = scrollAnimationObserver;
window.observeElement = observeElement;
window.observeElements = observeElements;
window.observeAllBlogCards = observeAllBlogCards;
