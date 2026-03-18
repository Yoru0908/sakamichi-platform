/**
 * 简繁切换模块
 * 支持简体中文/繁体中文切换
 * 仅转换中文内容，不影响日语
 * 🚀 实现 OpenCC 懒加载，减小初始包体积
 */

(function () {
  'use strict';

  const LANG_KEY = 'sakamichi-chinese-variant';
  const LANG_SIMPLIFIED = 'simplified';
  const LANG_TRADITIONAL = 'traditional';
  const OPENCC_CDN = 'https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js';

  let converterToTw = null;  // 简→繁转换器
  let converterToCn = null;  // 繁→简转换器
  let isOpenCCLoaded = false;
  let isLoading = false;

  // 动态加载 OpenCC 脚本
  function loadOpenCCScript() {
    return new Promise((resolve, reject) => {
      if (window.OpenCC || isOpenCCLoaded) {
        isOpenCCLoaded = true;
        resolve();
        return;
      }

      if (isLoading) {
        // 如果正在加载，轮询等待
        const checkInterval = setInterval(() => {
          if (window.OpenCC) {
            clearInterval(checkInterval);
            isOpenCCLoaded = true;
            resolve();
          }
        }, 100);
        return;
      }

      isLoading = true;
      console.log('[LanguageToggle] 开始动态加载 OpenCC...');

      const script = document.createElement('script');
      script.src = OPENCC_CDN;
      script.onload = () => {
        console.log('[LanguageToggle] OpenCC 脚本加载完成');
        isOpenCCLoaded = true;
        isLoading = false;
        resolve();
      };
      script.onerror = (err) => {
        console.error('[LanguageToggle] OpenCC 加载失败:', err);
        isLoading = false;
        reject(err);
      };
      document.head.appendChild(script);
    });
  }

  // 初始化转换器
  function initConverter() {
    if (!isOpenCCLoaded || !window.OpenCC) {
      console.error('[LanguageToggle] OpenCC 未加载，无法初始化转换器');
      return false;
    }

    if (converterToTw && converterToCn) {
      return true; // 已经初始化
    }

    try {
      // 初始化两个转换器
      converterToTw = window.OpenCC.Converter({ from: 'cn', to: 'tw' });  // 简→繁
      converterToCn = window.OpenCC.Converter({ from: 'tw', to: 'cn' });  // 繁→简
      console.log('[LanguageToggle] 转换器初始化成功（双向）');
      return true;
    } catch (e) {
      console.error('[LanguageToggle] 转换器初始化失败:', e);
      return false;
    }
  }

  // 获取当前语言设置
  function getCurrentLanguage() {
    const savedLang = localStorage.getItem(LANG_KEY);
    if (savedLang) {
      return savedLang;
    }
    return LANG_SIMPLIFIED; // 默认简体
  }

  // 判断元素是否为日语或包含日语
  function isJapaneseElement(element) {
    if (element.lang === 'ja') return true;
    if (element.closest('[lang="ja"]')) return true;
    return false;
  }

  // 转换文本节点
  function convertTextNode(node, toTraditional) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        try {
          const converter = toTraditional ? converterToTw : converterToCn;
          node.textContent = converter(text);
        } catch (e) {
          console.warn('[LanguageToggle] 转换失败:', e);
        }
      }
    }
  }

  // 递归转换元素及其子元素
  function convertElement(element, toTraditional) {
    if (isJapaneseElement(element)) return;

    Array.from(element.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        convertTextNode(node, toTraditional);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        convertElement(node, toTraditional);
      }
    });
  }

  // 应用语言设置（内部函数）
  function doApplyLanguage(lang) {
    // 确保转换器已初始化
    if ((!converterToTw || !converterToCn) && !initConverter()) {
      console.error('[LanguageToggle] 无法应用语言设置：转换器初始化失败');
      return;
    }

    const toTraditional = lang === LANG_TRADITIONAL;
    console.log('[LanguageToggle] 开始转换:', toTraditional ? '简→繁' : '繁→简');

    const selectors = [
      'p[lang="zh"]', '.stat-label', '.stat-card', '.filter-label', '.section-title',
      '.group-pill', '.blog-pill', 'button:not([lang="ja"])', 'option',
      '.page-info', 'footer p', 'label', '.dropdown-item', '#searchInput', '#mobileSearchInput'
    ];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (!isJapaneseElement(el)) {
            convertElement(el, toTraditional);
          }
        });
      } catch (e) {
        console.warn(`[LanguageToggle] 转换选择器 ${selector} 失败:`, e);
      }
    });

    localStorage.setItem(LANG_KEY, lang);
    updateLanguageButtons(lang);
    console.log('[LanguageToggle] 转换完成:', lang);
  }

  // 公开使用的应用语言接口（处理加载逻辑）
  async function applyLanguage(lang) {
    if (lang === LANG_TRADITIONAL) {
      // 如果切换到繁体，必须确保 OpenCC 已加载
      if (!isOpenCCLoaded) {
        const toast = showLoadingToast();
        try {
          await loadOpenCCScript();
          if (toast) toast.remove();
        } catch (e) {
          if (toast) toast.remove();
          if (typeof window.showToast === 'function') {
            window.showToast('加载转换库失败，请检查网络');
          }
          return;
        }
      }
    }

    // 如果是简体且没加载 OpenCC，其实不需要转换（假设原始内容是简体）
    // 但为了支持繁体切回简体，如果加载了就转换
    if (lang === LANG_SIMPLIFIED && !isOpenCCLoaded) {
      localStorage.setItem(LANG_KEY, lang);
      updateLanguageButtons(lang);
      return;
    }

    doApplyLanguage(lang);
  }

  // 切换语言
  async function toggleLanguage() {
    const currentLang = getCurrentLanguage();
    const newLang = currentLang === LANG_SIMPLIFIED ? LANG_TRADITIONAL : LANG_SIMPLIFIED;

    await applyLanguage(newLang);
    showLanguageToast(newLang);
  }

  // 简单的加载提示
  function showLoadingToast() {
    const toast = document.createElement('div');
    toast.className = 'toast loading-toast';
    toast.textContent = '正在加载语言包...';
    document.body.appendChild(toast);
    return toast;
  }

  function updateLanguageButtons(lang) {
    const desktopButton = document.getElementById('langToggleDesktop');
    if (desktopButton) {
      const text = desktopButton.querySelector('.lang-text');
      const title = lang === LANG_TRADITIONAL ? '切换到简体中文' : '切换到繁体中文';
      const displayText = lang === LANG_TRADITIONAL ? '繁' : '简';
      if (text) text.textContent = displayText;
      else desktopButton.textContent = displayText;
      desktopButton.setAttribute('title', title);
      desktopButton.setAttribute('data-lang', lang);
    }

    const mobileButton = document.getElementById('langToggleMobile');
    if (mobileButton) {
      const text = mobileButton.querySelector('.lang-text');
      const title = lang === LANG_TRADITIONAL ? '切换到简体中文' : '切换到繁体中文';
      const displayText = lang === LANG_TRADITIONAL ? '繁体中文' : '简体中文';
      if (text) text.textContent = displayText;
      mobileButton.setAttribute('title', title);
      mobileButton.setAttribute('data-lang', lang);
    }
  }

  function showLanguageToast(lang) {
    const message = lang === LANG_TRADITIONAL ? '已切换到繁体中文' : '已切换到简体中文';
    if (typeof window.showToast === 'function') {
      window.showToast(message);
    }
  }

  // 初始化
  function init() {
    const currentLang = getCurrentLanguage();

    // 绑定按钮事件（尽早绑定）
    const desktopButton = document.getElementById('langToggleDesktop');
    const mobileButton = document.getElementById('langToggleMobile');

    if (desktopButton) desktopButton.addEventListener('click', toggleLanguage);
    if (mobileButton) mobileButton.addEventListener('click', toggleLanguage);

    updateLanguageButtons(currentLang);

    // 只有当用户也是繁体设置时，才预加载 OpenCC
    if (currentLang === LANG_TRADITIONAL) {
      console.log('[LanguageToggle] 用户偏好繁体，自动加载 OpenCC');
      loadOpenCCScript().then(() => {
        applyLanguage(LANG_TRADITIONAL);
      }).catch(e => {
        console.warn('[LanguageToggle] 自动加载失败:', e);
      });
    }

    console.log('[LanguageToggle] 初始化完成 (OpenCC 懒加载模式)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LanguageToggle = {
    toggle: toggleLanguage,
    apply: applyLanguage,
    getCurrent: getCurrentLanguage
  };
})();
