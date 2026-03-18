/**
 * 双语博客显示模式控制 V2
 * 桌面端：下拉选择器
 * 移动端：悬浮按钮（FAB）
 */

class BilingualControl {
  constructor() {
    this.modes = ['bilingual', 'chinese', 'japanese'];
    this.modeLabels = {
      'bilingual': '中日对照',
      'chinese': '仅中文',
      'japanese': '仅日文'
    };
    this.currentMode = this.loadSavedMode();
    
    // 保存事件监听器引用，用于清理
    this.documentClickHandler = null;
    this.keydownHandler = null;
    
    this.init();
  }

  /**
   * 初始化
   */
  init() {
    // 检查页面是否有双语内容
    const hasBilingualContent = document.querySelector('.blog-content-official p[lang]');
    if (!hasBilingualContent) {
      console.log('ℹ️ 当前博客不是双语模式');
      return;
    }

    // 插入控制组件
    this.insertDesktopSelector();  // 桌面端选择器
    this.insertMobileFab();        // 移动端悬浮按钮

    // 绑定事件
    this.bindEvents();

    // 应用保存的模式
    this.applyMode(this.currentMode);

    console.log('✅ 双语控制初始化完成');
  }

  /**
   * 插入桌面端下拉选择器（使用固定挂载点）
   */
  insertDesktopSelector() {
    const selectorHTML = `
      <div class="language-selector" id="languageSelector">
        <button class="selector-button" id="selectorButton">
          <span id="currentLang">${this.modeLabels[this.currentMode]}</span>
          <svg class="selector-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        
        <div class="dropdown-menu" id="dropdownMenu">
          ${this.modes.map(mode => `
            <div class="dropdown-item ${mode === this.currentMode ? 'selected' : ''}" data-mode="${mode}">
              <span>${this.modeLabels[mode]}</span>
              ${mode === this.currentMode ? '<svg class="check-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // ✅ 使用固定挂载点
    const mount = document.getElementById('bilingualControlMount');
    if (mount) {
      mount.innerHTML = selectorHTML;
      console.log('✅ 双语选择器已挂载到固定容器');
      return;
    }
    
    // 简单回退（兼容旧版本）
    document.querySelector('#downloadAllBtn')?.insertAdjacentHTML('beforebegin', selectorHTML);
  }

  /**
   * 插入移动端悬浮按钮
   */
  insertMobileFab() {
    const fabHTML = `
      <!-- 遮罩层 -->
      <div class="fab-overlay" id="fabOverlay"></div>
      
      <!-- 悬浮按钮组 -->
      <div class="fab-container" id="fabContainer">
        <!-- 语言选择按钮 -->
        ${this.modes.map(mode => `
          <div class="fab-action" data-mode="${mode}">
            <span class="fab-label">${this.modeLabels[mode]}</span>
            <button class="fab-button fab-lang ${mode === this.currentMode ? 'active' : ''}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${mode === this.currentMode ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<circle cx="12" cy="12" r="10"></circle>'}
              </svg>
            </button>
          </div>
        `).reverse().join('')}
        
        <!-- 主按钮 -->
        <button class="fab-main" id="fabMain">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', fabHTML);
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 桌面端：选择器按钮点击
    const selectorButton = document.getElementById('selectorButton');
    if (selectorButton) {
      selectorButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDesktopSelector();
      });
    }

    // 桌面端：下拉菜单项点击
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;
        this.setMode(mode);
        this.closeDesktopSelector();
      });
    });

    // 桌面端：点击外部关闭（保存引用用于清理）
    this.documentClickHandler = () => {
      this.closeDesktopSelector();
    };
    document.addEventListener('click', this.documentClickHandler);

    // 移动端：主按钮点击
    const fabMain = document.getElementById('fabMain');
    if (fabMain) {
      fabMain.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFab();
      });
    }

    // 移动端：遮罩层点击
    const fabOverlay = document.getElementById('fabOverlay');
    if (fabOverlay) {
      fabOverlay.addEventListener('click', () => {
        this.closeFab();
      });
    }

    // 移动端：语言按钮点击
    const fabActions = document.querySelectorAll('.fab-action');
    fabActions.forEach(action => {
      const button = action.querySelector('.fab-button');
      if (button) {
        button.addEventListener('click', () => {
          const mode = action.dataset.mode;
          this.setMode(mode);
          this.closeFab();
          // 更新FAB按钮状态
          this.updateFabButtons();
        });
      }
    });

    // 快捷键支持（保存引用用于清理）
    this.keydownHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const keyModeMap = {
        '1': 'bilingual',
        '2': 'chinese',
        '3': 'japanese'
      };
      
      if (keyModeMap[e.key]) {
        this.setMode(keyModeMap[e.key]);
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  /**
   * 切换桌面端选择器
   */
  toggleDesktopSelector() {
    const selector = document.getElementById('languageSelector');
    const button = document.getElementById('selectorButton');
    if (!selector || !button) return;

    const isOpen = selector.classList.contains('open');
    if (isOpen) {
      selector.classList.remove('open');
      button.classList.remove('open');
    } else {
      selector.classList.add('open');
      button.classList.add('open');
    }
  }

  /**
   * 关闭桌面端选择器
   */
  closeDesktopSelector() {
    const selector = document.getElementById('languageSelector');
    const button = document.getElementById('selectorButton');
    if (!selector || !button) return;

    selector.classList.remove('open');
    button.classList.remove('open');
  }

  /**
   * 切换移动端FAB
   */
  toggleFab() {
    const fabContainer = document.getElementById('fabContainer');
    const fabOverlay = document.getElementById('fabOverlay');
    const fabMain = document.getElementById('fabMain');
    if (!fabContainer || !fabOverlay || !fabMain) return;

    const isOpen = fabContainer.classList.contains('open');
    if (isOpen) {
      fabContainer.classList.remove('open');
      fabOverlay.classList.remove('show');
      fabMain.classList.remove('open');
    } else {
      fabContainer.classList.add('open');
      fabOverlay.classList.add('show');
      fabMain.classList.add('open');
    }
  }

  /**
   * 关闭移动端FAB
   */
  closeFab() {
    const fabContainer = document.getElementById('fabContainer');
    const fabOverlay = document.getElementById('fabOverlay');
    const fabMain = document.getElementById('fabMain');
    if (!fabContainer || !fabOverlay || !fabMain) return;

    fabContainer.classList.remove('open');
    fabOverlay.classList.remove('show');
    fabMain.classList.remove('open');
  }

  /**
   * 更新FAB按钮状态
   */
  updateFabButtons() {
    const fabActions = document.querySelectorAll('.fab-action');
    fabActions.forEach(action => {
      const mode = action.dataset.mode;
      const button = action.querySelector('.fab-button');
      const label = action.querySelector('.fab-label');
      
      if (mode === this.currentMode) {
        button.classList.add('active');
        // 更新图标为勾号
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      } else {
        button.classList.remove('active');
        // 更新图标为圆圈
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>`;
      }
    });
  }

  /**
   * 设置显示模式
   */
  setMode(mode) {
    if (!this.modes.includes(mode)) {
      console.warn('无效的显示模式:', mode);
      return;
    }

    this.currentMode = mode;
    this.applyMode(mode);
    this.updateDesktopSelector(mode);
    this.updateFabButtons();
    this.saveMode(mode);

    console.log('📖 显示模式已切换为:', this.modeLabels[mode]);
  }

  /**
   * 应用显示模式到DOM
   */
  applyMode(mode) {
    const content = document.querySelector('.blog-content-official');
    if (!content) return;

    // 移除所有模式类
    this.modes.forEach(m => {
      content.classList.remove(`mode-${m}`);
    });

    // 添加当前模式类（双语模式不添加类）
    if (mode !== 'bilingual') {
      content.classList.add(`mode-${mode}`);
    }
  }

  /**
   * 更新桌面端选择器显示
   */
  updateDesktopSelector(mode) {
    // 更新按钮文字
    const currentLang = document.getElementById('currentLang');
    if (currentLang) {
      currentLang.textContent = this.modeLabels[mode];
    }

    // 更新下拉菜单选中状态
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
      const itemMode = item.dataset.mode;
      if (itemMode === mode) {
        item.classList.add('selected');
        // 添加勾号
        if (!item.querySelector('.check-icon')) {
          const checkIcon = `<svg class="check-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          item.innerHTML = `<span>${this.modeLabels[itemMode]}</span>${checkIcon}`;
        }
      } else {
        item.classList.remove('selected');
        // 移除勾号
        item.innerHTML = `<span>${this.modeLabels[itemMode]}</span>`;
      }
    });
  }

  /**
   * 保存模式到localStorage
   */
  saveMode(mode) {
    try {
      localStorage.setItem('bilingualDisplayMode', mode);
    } catch (e) {
      console.warn('无法保存显示模式偏好:', e);
    }
  }

  /**
   * 从localStorage加载保存的模式
   */
  loadSavedMode() {
    try {
      const saved = localStorage.getItem('bilingualDisplayMode');
      return this.modes.includes(saved) ? saved : 'bilingual';
    } catch (e) {
      return 'bilingual';
    }
  }

  /**
   * 销毁控件，清理DOM和事件监听器
   */
  destroy() {
    console.log('🗑️ 销毁双语控件实例');
    
    // ✅ 清理全局事件监听器（防止内存泄漏）
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
      this.documentClickHandler = null;
    }
    
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    
    // ✅ 清理固定挂载点内容（优先）
    const mount = document.getElementById('bilingualControlMount');
    if (mount) {
      mount.innerHTML = '';
    }
    
    // 清理其他可能的位置（兼容性）
    const desktopSelector = document.getElementById('languageSelector');
    if (desktopSelector && !mount) {
      desktopSelector.remove();
    }
    
    // 清理移动端FAB
    document.getElementById('fabContainer')?.remove();
    document.getElementById('fabOverlay')?.remove();
    
    console.log('✅ 双语控件已销毁');
  }
}

// 导出类到全局App命名空间
if (window.App && window.App.bilingual) {
  window.App.bilingual.Class = BilingualControl;
}
// 兼容旧的window.BilingualControl引用
window.BilingualControl = BilingualControl;

// 不再自动初始化，改为按需初始化
// 只有在博客详情页加载内容后才会初始化（由 index.html 中的 loadBlogContent 触发）
console.log('[bilingual-control-v2.js] ✅ BilingualControl 类已加载，等待手动初始化');

// 导出（如果使用模块）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BilingualControl;
}
