/**
 * 主题切换模块
 * 支持亮色/暗色主题切换
 */

(function() {
  'use strict';

  const THEME_KEY = 'sakamichi-theme';
  const THEME_LIGHT = 'light';
  const THEME_DARK = 'dark';

  // 获取当前主题
  function getCurrentTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
      return savedTheme;
    }
    
    // 检测系统主题偏好
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return THEME_DARK;
    }
    
    return THEME_LIGHT;
  }

  // 应用主题
  function applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === THEME_DARK) {
      html.classList.add('dark-theme');
      html.classList.remove('light-theme');
    } else {
      html.classList.add('light-theme');
      html.classList.remove('dark-theme');
    }
    
    // 保存到localStorage
    localStorage.setItem(THEME_KEY, theme);
    
    // 更新按钮状态
    updateThemeButtons(theme);
    
    console.log('[ThemeToggle] 应用主题:', theme);
  }

  // 切换主题
  function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
    applyTheme(newTheme);
    
    // 显示提示
    showThemeToast(newTheme);
  }

  // 更新按钮状态
  function updateThemeButtons(theme) {
    const buttons = [
      document.getElementById('themeToggleDesktop'),
      document.getElementById('themeToggleMobile')
    ];
    
    buttons.forEach(button => {
      if (!button) return;
      
      const lightIcon = button.querySelector('.theme-icon-light');
      const darkIcon = button.querySelector('.theme-icon-dark');
      const text = button.querySelector('.theme-text');
      
      if (theme === THEME_DARK) {
        if (lightIcon) lightIcon.style.display = 'none';
        if (darkIcon) darkIcon.style.display = 'block';
        if (text) text.textContent = '暗色模式';
        button.setAttribute('title', '切换到亮色模式');
      } else {
        if (lightIcon) lightIcon.style.display = 'block';
        if (darkIcon) darkIcon.style.display = 'none';
        if (text) text.textContent = '亮色模式';
        button.setAttribute('title', '切换到暗色模式');
      }
    });
  }

  // 显示主题切换提示
  function showThemeToast(theme) {
    const message = theme === THEME_DARK ? '🌙 已切换到暗色模式' : '☀️ 已切换到亮色模式';
    
    if (typeof showToast === 'function') {
      showToast(message);
    } else {
      console.log('[ThemeToggle]', message);
    }
  }

  // 初始化
  function init() {
    console.log('[ThemeToggle] 初始化主题切换');
    
    // 立即应用主题（避免闪烁）
    const currentTheme = getCurrentTheme();
    applyTheme(currentTheme);
    
    // 绑定按钮事件
    const desktopButton = document.getElementById('themeToggleDesktop');
    const mobileButton = document.getElementById('themeToggleMobile');
    
    if (desktopButton) {
      desktopButton.addEventListener('click', toggleTheme);
      console.log('[ThemeToggle] PC端按钮已绑定');
    }
    
    if (mobileButton) {
      mobileButton.addEventListener('click', toggleTheme);
      console.log('[ThemeToggle] 移动端按钮已绑定');
    }
    
    // 监听系统主题变化
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_KEY)) {
          // 只在用户未手动设置时跟随系统
          applyTheme(e.matches ? THEME_DARK : THEME_LIGHT);
        }
      });
    }
  }

  // DOM加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 导出到全局
  window.ThemeToggle = {
    toggle: toggleTheme,
    apply: applyTheme,
    getCurrent: getCurrentTheme
  };
})();
