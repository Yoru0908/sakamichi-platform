/**
 * 博客统计分析模块 (从 stats.html 移植)
 * 嵌入在博客首页的 statsView 中
 */

const StatsPage = {
  realData: {},
  isLoading: false,
  currentGroup: 'all',
  chart: null,
  initialized: false,

  groupColors: {
    all: '#6b7280',
    nogizaka: '#742581',
    sakurazaka: '#F19DB5',
    hinatazaka: '#7BC7E8'
  },

  groupNames: {
    all: '全部团体',
    nogizaka: '乃木坂46',
    sakurazaka: '樱坂46',
    hinatazaka: '日向坂46'
  },

  async init() {
    if (this.initialized) {
      this.updateStats();
      return;
    }
    this.initialized = true;
    // Use GroupConfig if available
    if (window.GroupConfig) {
      ['nogizaka', 'sakurazaka', 'hinatazaka'].forEach(g => {
        this.groupColors[g] = window.GroupConfig.getColor(g) || this.groupColors[g];
        this.groupNames[g] = window.GroupConfig.getDisplayName(g) || this.groupNames[g];
      });
    }
    this.setupFilters();
    await this.loadAllGroups();
  },

  setupFilters() {
    const yearSelect = document.getElementById('statsYearSelect');
    const monthSelect = document.getElementById('statsMonthSelect');
    if (yearSelect) yearSelect.addEventListener('change', () => this.onFilterChange());
    if (monthSelect) monthSelect.addEventListener('change', () => this.onFilterChange());
  },

  async fetchWithRetry(url, options = {}, retries = 2, backoff = 1000) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && response.status >= 500 && retries > 0) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, backoff));
        return this.fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw error;
    }
  },

  async loadRealData(group) {
    const apiBase = window.API_BASE_URL || window.API_BASE || 'https://api.sakamichi-tools.cn';
    let groupDisplayName = group === 'all' ? 'all' : (window.GroupConfig?.getDisplayName(group) || group);
    console.log(`[Stats] 加载${groupDisplayName}数据...`);

    try {
      this.isLoading = true;
      let allBlogs = [];
      let totalMembersCount = 0;
      let currentMembersList = [];

      if (group === 'all') {
        for (const g of ['nogizaka', 'sakurazaka', 'hinatazaka']) {
          const gName = window.GroupConfig?.getDisplayName(g) || g;
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), window.API_TIMEOUT || 15000);
          const resp = await this.fetchWithRetry(
            `${apiBase}/api/blogs?group=${encodeURIComponent(gName)}&limit=2000&exclude_content=true`,
            { signal: controller.signal }
          );
          clearTimeout(tid);
          const data = await resp.json();
          if (data.success && data.blogs) allBlogs = allBlogs.concat(data.blogs);

          try {
            const mResp = await this.fetchWithRetry(`${apiBase}/api/members/${g}`);
            if (mResp.ok) {
              const md = await mResp.json();
              if (typeof md.totalMembers === 'number') totalMembersCount += md.totalMembers;
              else if (md.generations) md.generations.forEach(gen => { totalMembersCount += gen.members.length; });
              if (md.generations) md.generations.forEach(gen => { currentMembersList.push(...gen.members); });
            }
          } catch (e) { console.warn(`[Stats] 获取${g}成员列表失败:`, e); }
        }
      } else {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), window.API_TIMEOUT || 15000);
        const resp = await this.fetchWithRetry(
          `${apiBase}/api/blogs?group=${encodeURIComponent(groupDisplayName)}&limit=2000&exclude_content=true`,
          { signal: controller.signal }
        );
        clearTimeout(tid);
        const data = await resp.json();
        if (data.success && data.blogs) allBlogs = data.blogs;

        try {
          const mResp = await this.fetchWithRetry(`${apiBase}/api/members/${group}`);
          if (mResp.ok) {
            const md = await mResp.json();
            if (typeof md.totalMembers === 'number') totalMembersCount = md.totalMembers;
            else if (md.generations) md.generations.forEach(gen => { totalMembersCount += gen.members.length; });
            if (md.generations) md.generations.forEach(gen => { currentMembersList.push(...gen.members); });
          }
        } catch (e) { console.warn(`[Stats] 获取${group}成员列表失败:`, e); }
      }

      if (allBlogs.length > 0) {
        const filteredBlogs = this.filterBlogsByDate(allBlogs);
        const stats = this.calculateMemberStats(filteredBlogs, currentMembersList, totalMembersCount);
        this.realData[group] = { ...stats, allBlogs, currentMembersList };
        console.log(`[Stats] ${groupDisplayName} 统计完成:`, { activeMembers: stats.activeMembers, totalMembers: stats.totalMembers, blogs: stats.blogs });
      }
    } catch (error) {
      console.error(`[Stats] 加载${groupDisplayName}数据失败:`, error);
    } finally {
      this.isLoading = false;
    }
  },

  filterBlogsByDate(blogs) {
    const yearEl = document.getElementById('statsYearSelect');
    const monthEl = document.getElementById('statsMonthSelect');
    const year = yearEl ? yearEl.value : new Date().getFullYear().toString();
    const month = monthEl ? monthEl.value : 'all';

    return blogs.filter(blog => {
      if (!blog.publish_date) return false;
      const date = blog.formatted_date || blog.publish_date;
      const match = date.match(/(\d{4})[.\/\-](\d{1,2})/);
      if (!match) return false;
      if (match[1] !== year) return false;
      if (month !== 'all' && parseInt(match[2]) !== parseInt(month)) return false;
      return true;
    });
  },

  calculateMemberStats(blogs, currentMembersList, existingTotalMembers) {
    const memberStats = {};
    const normalizedMembersList = currentMembersList.map(n => n.replace(/\s+/g, ''));
    const specialMembers = ['ポカ'];

    blogs.forEach(blog => {
      const member = blog.member;
      if (!member || specialMembers.includes(member)) return;
      const normalized = member.replace(/\s+/g, '');

      if (currentMembersList.length > 0) {
        const idx = normalizedMembersList.indexOf(normalized);
        if (idx === -1) return;
        const stdName = currentMembersList[idx];
        if (!memberStats[stdName]) memberStats[stdName] = { name: stdName, count: 0 };
        memberStats[stdName].count++;
      } else {
        if (!memberStats[normalized]) memberStats[normalized] = { name: normalized, count: 0 };
        memberStats[normalized].count++;
      }
    });

    const topMembers = Object.values(memberStats).sort((a, b) => b.count - a.count).slice(0, 20);
    const activeMembers = Object.keys(memberStats).length;
    const totalBlogs = blogs.length;
    const avgBlogs = activeMembers > 0 ? (totalBlogs / activeMembers).toFixed(1) : 0;

    return {
      activeMembers, totalMembers: existingTotalMembers || activeMembers,
      members: activeMembers, blogs: totalBlogs, avgBlogs: parseFloat(avgBlogs), topMembers
    };
  },

  onFilterChange() {
    ['all', 'nogizaka', 'sakurazaka', 'hinatazaka'].forEach(g => {
      if (this.realData[g] && this.realData[g].allBlogs) {
        const stats = this.calculateMemberStats(
          this.filterBlogsByDate(this.realData[g].allBlogs),
          this.realData[g].currentMembersList || [],
          this.realData[g].totalMembers
        );
        Object.assign(this.realData[g], stats);
      }
    });
    this.updateStats();
  },

  switchGroup(group) {
    this.currentGroup = group;
    document.querySelectorAll('#statsView .stats-group-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.group === group);
    });
    if (!this.realData[group] && !this.isLoading) {
      this.loadRealData(group).then(() => this.updateStats());
    } else {
      this.updateStats();
    }
  },

  updateStats() {
    const data = this.realData[this.currentGroup];
    if (!data) return;
    const color = this.groupColors[this.currentGroup];
    this.renderStatsCards();
    const titleEl = document.getElementById('statsChartTitle');
    if (titleEl) titleEl.textContent = `成员博客统计图表 - ${this.groupNames[this.currentGroup]} (前20名)`;
    this.updateChart(data.topMembers, color);
  },

  renderStatsCards() {
    const container = document.getElementById('statsCards');
    if (!container) return;
    const yearEl = document.getElementById('statsYearSelect');
    const monthEl = document.getElementById('statsMonthSelect');
    const year = yearEl ? yearEl.value : new Date().getFullYear().toString();
    const month = monthEl ? monthEl.value : 'all';
    const monthText = month === 'all' ? '全年' : `${month}月`;
    const periodText = `${year}年${monthText}`;

    if (this.currentGroup === 'all') {
      const groups = ['nogizaka', 'sakurazaka', 'hinatazaka'];
      const totalBlogs = groups.reduce((s, g) => s + (this.realData[g]?.blogs || 0), 0);
      const totalMembers = groups.reduce((s, g) => s + (this.realData[g]?.totalMembers || 0), 0);
      const activeMembers = groups.reduce((s, g) => s + (this.realData[g]?.activeMembers || 0), 0);
      const avgBlogs = activeMembers > 0 ? (totalBlogs / activeMembers).toFixed(1) : '0.0';

      container.innerHTML = `
        <div class="stat-card">
          <div class="stat-label">总成员数</div>
          <div class="stat-number" style="color: var(--color-brand-nogi, #742581);">${totalMembers}<span style="font-size: 24px; margin-left: 4px;">人</span></div>
          <div style="margin-top: 16px;">
            ${groups.map(g => {
              const gd = this.realData[g] || {};
              const gc = this.groupColors[g];
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                <span style="font-size:13px;color:var(--text-secondary);">${this.groupNames[g]}</span>
                <span style="font-size:16px;font-weight:700;padding:2px 10px;background:${gc}20;color:${gc};border-radius:6px;">${gd.activeMembers||0}/${gd.totalMembers||0}人</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总博客数</div>
          <div class="stat-number" style="color: #f59e0b;">${totalBlogs}<span style="font-size: 24px; margin-left: 4px;">篇</span></div>
          <div style="margin-top: 16px;">
            ${groups.map(g => {
              const gd = this.realData[g] || {};
              const gc = this.groupColors[g];
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                <span style="font-size:13px;color:var(--text-secondary);">${this.groupNames[g]}</span>
                <span style="font-size:16px;font-weight:700;padding:2px 10px;background:${gc}20;color:${gc};border-radius:6px;">${gd.blogs||0}篇</span>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">查询时段</div>
          <div class="stat-badge" style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:500;margin:12px 0;background:#d1fae5;color:#065f46;">${periodText}</div>
          <div style="margin-top: 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
              <span style="font-size:13px;color:var(--text-secondary);">平均博客数</span>
              <span style="font-size:16px;font-weight:700;padding:2px 10px;background:#10b98120;color:#10b981;border-radius:6px;">${avgBlogs}篇/人</span>
            </div>
            ${groups.map(g => {
              const gd = this.realData[g] || {};
              const gc = this.groupColors[g];
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                <span style="font-size:13px;color:var(--text-secondary);">${this.groupNames[g]}平均</span>
                <span style="font-size:16px;font-weight:700;padding:2px 10px;background:${gc}20;color:${gc};border-radius:6px;">${gd.avgBlogs||0}篇/人</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      const data = this.realData[this.currentGroup] || {};
      const color = this.groupColors[this.currentGroup];
      const name = this.groupNames[this.currentGroup];
      container.innerHTML = `
        <div class="stat-card">
          <div class="stat-label">总成员数</div>
          <div class="stat-number" style="color: var(--color-brand-nogi, #742581);">${data.activeMembers||0}/${data.totalMembers||0}<span style="font-size: 24px; margin-left: 4px;">人</span></div>
          <div class="stat-badge" style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:500;margin-top:8px;background:#ede7f6;color:#5e35b1;">${name}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总博客数</div>
          <div class="stat-number" style="color: #f59e0b;">${data.blogs||0}<span style="font-size: 24px; margin-left: 4px;">篇</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">查询时段</div>
          <div style="margin-top: 12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:13px;color:var(--text-secondary);">平均博客数</span>
              <span style="font-size:18px;font-weight:700;color:#10b981;">${data.avgBlogs||0}篇/人</span>
            </div>
          </div>
          <div class="stat-badge" style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:500;background:#d1fae5;color:#065f46;">${periodText}</div>
        </div>
      `;
    }
  },

  updateChart(topMembers, color) {
    const canvas = document.getElementById('statsMemberChart');
    if (!canvas || !topMembers || topMembers.length === 0) return;
    if (typeof Chart === 'undefined') { console.warn('[Stats] Chart.js not loaded'); return; }
    const ctx = canvas.getContext('2d');
    if (this.chart) this.chart.destroy();

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topMembers.map(m => m.name),
        datasets: [{ label: '博客数量', data: topMembers.map(m => m.count), backgroundColor: color, borderRadius: 6, barThickness: 30 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 12, callbacks: { label: ctx => `博客数: ${ctx.parsed.y}篇` } } },
        scales: {
          x: { ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { font: { size: 12 }, stepSize: 1, callback: v => Number.isInteger(v) ? v + '篇' : '' }, grid: { color: '#f3f4f6' } }
        }
      }
    });
  },

  async loadAllGroups() {
    const loading = document.getElementById('statsCards');
    if (loading) loading.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">正在加载统计数据...</div>';
    await this.loadRealData('nogizaka');
    await this.loadRealData('sakurazaka');
    await this.loadRealData('hinatazaka');
    await this.loadRealData('all');
    this.updateStats();
  }
};

window.StatsPage = StatsPage;
