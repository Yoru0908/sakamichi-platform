/**
 * 分页组件模块
 * 统一管理博客列表的分页逻辑
 */

// 创建 App.pagination 命名空间
if (typeof window.App === 'undefined') {
  window.App = {};
}

App.pagination = {
  totalBlogs: 0,
  blogsPerPage: window.PAGE_SIZE,
  
  /**
   * 初始化分页
   */
  init() {
    console.log('[Pagination] 初始化分页组件');
    this.bindEvents();
  },
  
  /**
   * 绑定事件
   */
  bindEvents() {
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.goToPreviousPage());
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.goToNextPage());
    }
  },
  
  /**
   * 重置分页
   */
  reset() {
    App.state.totalPages = 1;
    this.totalBlogs = 0;
    App.state.hasMore = false;
    this.hide();
  },
  
  /**
   * 更新分页信息
   */
  update(blogsCount, totalCount = null) {
    const paginationContainer = document.getElementById('paginationContainer');
    if (!paginationContainer) return;

    // 使用统一状态
    const currentPage = App.state.page || 1;

    // 计算总页数
    if (totalCount) {
      this.totalBlogs = totalCount;
      App.state.totalPages = Math.ceil(totalCount / this.blogsPerPage);
      App.state.hasMore = currentPage < App.state.totalPages;
    } else {
      // 如果没有总数，根据返回数量判断是否还有更多
      App.state.hasMore = blogsCount >= this.blogsPerPage;
      // 保守估计总页数
      if (App.state.hasMore) {
        App.state.totalPages = currentPage + 1;
      } else {
        App.state.totalPages = currentPage;
      }
    }

    // 如果只有一页，隐藏分页
    if (App.state.totalPages <= 1 && !App.state.hasMore) {
      this.hide();
      return;
    }

    this.show();
    this.render();
  },
  
  /**
   * 渲染分页组件
   */
  render() {
    const pageInfo = document.getElementById('pageInfo');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageButtons = document.getElementById('pageButtons');
    
    // 更新页码信息
    if (pageInfo) {
      if (this.totalBlogs > 0) {
        const startIndex = (App.state.page - 1) * this.blogsPerPage + 1;
        const endIndex = Math.min(App.state.page * this.blogsPerPage, this.totalBlogs);
        pageInfo.textContent = `显示 ${startIndex}-${endIndex} / 共 ${this.totalBlogs} 篇`;
      } else {
        pageInfo.textContent = `第 ${App.state.page} 页`;
      }
    }
    
    // 更新按钮状态
    if (prevBtn) {
      prevBtn.disabled = App.state.page === 1;
    }
    
    if (nextBtn) {
      nextBtn.disabled = !App.state.hasMore && App.state.page >= App.state.totalPages;
    }
    
    // 生成页码按钮
    if (pageButtons) {
      pageButtons.innerHTML = '';
      
      const startPage = Math.max(1, App.state.page - 2);
      const endPage = Math.min(App.state.totalPages, App.state.page + 2);
      
      // 第一页
      if (startPage > 1) {
        pageButtons.appendChild(this.createPageButton(1, false));
        if (startPage > 2) {
          const dots = document.createElement('span');
          dots.className = 'px-2 text-gray-400';
          dots.textContent = '...';
          pageButtons.appendChild(dots);
        }
      }
      
      // 中间页码
      for (let i = startPage; i <= endPage; i++) {
        pageButtons.appendChild(this.createPageButton(i, i === App.state.page));
      }
      
      // 最后一页
      if (endPage < App.state.totalPages) {
        if (endPage < App.state.totalPages - 1) {
          const dots = document.createElement('span');
          dots.className = 'px-2 text-gray-400';
          dots.textContent = '...';
          pageButtons.appendChild(dots);
        }
        pageButtons.appendChild(this.createPageButton(App.state.totalPages, false));
      }
    }
  },
  
  /**
   * 创建页码按钮
   */
  createPageButton(pageNum, isActive) {
    const btn = document.createElement('button');
    btn.className = isActive 
      ? 'px-3 py-1 text-sm bg-blue-600 text-white rounded font-medium' 
      : 'px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors';
    btn.textContent = pageNum;
    btn.disabled = isActive;
    
    if (!isActive) {
      btn.addEventListener('click', () => this.goToPage(pageNum));
    }
    
    return btn;
  },
  
  /**
   * 跳转到指定页
   */
  goToPage(page) {
    if (page < 1 || page === App.state.page) return;

    // 设置统一状态
    App.state.page = page;

    // 触发加载事件
    if (window.loadBlogs) {
      window.loadBlogs();
    }

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  
  /**
   * 上一页
   */
  goToPreviousPage() {
    if (App.state.page > 1) {
      this.goToPage(App.state.page - 1);
    }
  },
  
  /**
   * 下一页
   */
  goToNextPage() {
    const currentPage = App.state.page || 1;
    if (currentPage < App.state.totalPages || App.state.hasMore) {
      this.goToPage(currentPage + 1);
    }
  },
  
  /**
   * 显示分页组件
   */
  show() {
    const paginationContainer = document.getElementById('paginationContainer');
    if (paginationContainer) {
      paginationContainer.classList.remove('hidden');
    }
  },
  
  /**
   * 隐藏分页组件
   */
  hide() {
    const paginationContainer = document.getElementById('paginationContainer');
    if (paginationContainer) {
      paginationContainer.classList.add('hidden');
    }
  }
};

// 向后兼容层（过渡期）
window.Pagination = App.pagination;

console.log('[pagination.js] ✅ 分页组件已迁移到 App.pagination');
