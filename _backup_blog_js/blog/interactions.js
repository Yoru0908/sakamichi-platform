/**
 * 成员互动分析页面
 * 展示博客中成员间的提及关系、被提及排行、期别互动
 */

// ========== 数据加载 ==========
let INTERACTION_DATA = {};
let AVAILABLE_MONTHS = {};
let dataLoaded = false;
const INTERACTIONS_API_BASE = window.API_BASE || 'https://api.sakamichi-tools.cn';
const USE_API = location.protocol !== 'file:' && !location.hostname.match(/^(localhost|127\.0\.0\.1)$/);

async function loadInteractionData() {
  try {
    if (USE_API) {
      // 生产环境：从后端 API 批量加载
      const resp = await fetch(`${INTERACTIONS_API_BASE}/api/interactions/all`);
      if (!resp.ok) throw new Error(`API: ${resp.status}`);
      const json = await resp.json();
      INTERACTION_DATA = json.data || {};
      dataLoaded = true;
      console.log('[interactions] API数据加载成功');
    } else {
      // 本地开发：从静态 JSON 加载
      const resp = await fetch('data/interactions.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      INTERACTION_DATA = await resp.json();
      dataLoaded = true;
      console.log('[interactions] 本地数据加载成功');
    }
  } catch (e) {
    console.error('[interactions] 数据加载失败:', e);
    INTERACTION_DATA = { sakurazaka: {}, nogizaka: {}, hinatazaka: {} };
  }
}

// ========== 页面控制器 ==========
const InteractionPage = {
  currentGroup: 'sakurazaka',
  currentYear: 2026,
  currentMonth: 2,
  currentTab: 'mentions',

  // 获取当前数据
  getData() {
    const key = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`;
    const groupData = INTERACTION_DATA[this.currentGroup];
    return groupData ? groupData[key] : null;
  },

  // 获取当前团体所有可用月份（已排序）
  getAvailableMonths() {
    const groupData = INTERACTION_DATA[this.currentGroup];
    if (!groupData) return [];
    return Object.keys(groupData).sort();
  },

  // 自动跳转到最新有数据的月份
  jumpToLatest() {
    const months = this.getAvailableMonths();
    if (months.length > 0) {
      const latest = months[months.length - 1];
      const [y, m] = latest.split('-');
      this.currentYear = parseInt(y);
      this.currentMonth = parseInt(m);
      this.updateMonthDisplay();
    }
  },

  // 切换团体
  switchGroup(group) {
    this.currentGroup = group;
    document.querySelectorAll('.group-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.group === group);
    });
    this.jumpToLatest();
    this.render();
  },

  // 上一月
  prevMonth() {
    this.currentMonth--;
    if (this.currentMonth < 1) {
      this.currentMonth = 12;
      this.currentYear--;
    }
    this.updateMonthDisplay();
    this.render();
  },

  // 下一月
  nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 12) {
      this.currentMonth = 1;
      this.currentYear++;
    }
    this.updateMonthDisplay();
    this.render();
  },

  updateMonthDisplay() {
    const el = document.getElementById('monthDisplay');
    if (el) {
      el.textContent = `${this.currentYear}年${String(this.currentMonth).padStart(2, '0')}月`;
    }
  },

  // 切换分析 Tab
  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.analysis-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    this.render();
  },

  // 渲染主内容
  render() {
    const data = this.getData();
    const area = document.getElementById('contentArea');
    if (!area) return;

    if (!data) {
      area.innerHTML = `
        <div class="empty-state">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
          </svg>
          <h3 style="font-size: 16px; font-weight: 500; color: var(--text-primary); margin-bottom: 8px;">暂无数据</h3>
          <p>该月份暂无互动分析数据</p>
        </div>
      `;
      return;
    }

    switch (this.currentTab) {
      case 'mentions': this.renderMentions(data, area); break;
      case 'ranking': this.renderRanking(data, area); break;
      case 'generation': this.renderGeneration(data, area); break;
    }
  },

  // ========== 提及关系 ==========
  renderMentions(data, area) {
    const sorted = [...data.mentions].sort((a, b) => b.total - a.total);

    let rows = sorted.map(m => {
      const tags = m.targets.map(t =>
        `<span class="mention-tag">${t.name} <span class="count">${t.count}次</span></span>`
      ).join('');
      return `
        <tr>
          <td style="font-weight: 600; white-space: nowrap;">${m.mentioner}</td>
          <td>
            <div class="mention-targets">${tags}</div>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <span style="font-weight: 700; color: var(--color-brand-nogi, #742581);">${m.total}次</span>
          </td>
        </tr>
      `;
    }).join('');

    area.innerHTML = `
      <div class="panel">
        <div class="panel-title">
          ${data.group} ${data.yearMonth.replace('-', '年')}月 成员互相提及分析
        </div>
        <div style="overflow-x: auto;">
          <table class="mention-table">
            <thead>
              <tr>
                <th>成员</th>
                <th>提及对象</th>
                <th style="text-align: right;">合计</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ========== 被提及排行 ==========
  renderRanking(data, area) {
    const maxCount = data.ranking[0]?.count || 1;
    const colors = ['#7e57c2', '#9575cd', '#b39ddb', '#ce93d8', '#e1bee7'];

    const items = data.ranking.map((r, i) => {
      const pct = Math.round((r.count / maxCount) * 100);
      const numClass = i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : 'normal';
      const color = colors[Math.min(i, colors.length - 1)];

      return `
        <div class="ranking-item">
          <div class="ranking-number ${numClass}">${i + 1}</div>
          <div class="ranking-name">${r.name}</div>
          <div class="ranking-gen">${r.gen}</div>
          <div class="ranking-bar-wrapper">
            <div class="ranking-bar" style="width: ${pct}%; background: ${color};">
              ${pct > 15 ? `<span class="ranking-bar-label">${r.count}次</span>` : ''}
            </div>
          </div>
          <div class="ranking-count">${r.count}次</div>
        </div>
      `;
    }).join('');

    area.innerHTML = `
      <div class="panel">
        <div class="panel-title">
          ${data.group} ${data.yearMonth.replace('-', '年')}月 被提及总排行
        </div>
        <p style="font-size: 13px; color: var(--text-tertiary); margin-bottom: 20px;">谁是本月的“话题中心”——被其他成员在博客中提到最多的人</p>
        ${items}
      </div>
    `;
  },

  // ========== 期别互动 ==========
  currentGenTab: '二期生',

  switchGenTab(gen) {
    this.currentGenTab = gen;
    document.querySelectorAll('.gen-sub-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.gen === gen);
    });
    // 切换内容面板
    document.querySelectorAll('.gen-panel').forEach(p => {
      p.classList.toggle('hidden', p.dataset.gen !== gen);
    });
  },

  renderGeneration(data, area) {
    const gm = data.generationMatrix;
    const maxVal = Math.max(...gm.matrix.flat());

    // 热力图颜色
    function getCellColor(val) {
      if (val === 0) return { bg: 'var(--bg-tertiary)', text: 'var(--text-tertiary)' };
      const ratio = val / maxVal;
      if (ratio > 0.7) return { bg: 'var(--color-brand-nogi)', text: 'white' };
      if (ratio > 0.4) return { bg: 'var(--color-brand-nogi-light)', text: 'white' };
      if (ratio > 0.2) return { bg: 'var(--bg-secondary)', text: 'var(--text-secondary)' };
      return { bg: 'var(--bg-tertiary)', text: 'var(--text-tertiary)' };
    }

    // 热力图 HTML
    let heatmapHTML = `<div class="heatmap-grid" style="grid-template-columns: 80px repeat(${gm.generations.length}, 1fr);">`;
    heatmapHTML += `<div class="heatmap-header" style="font-size: 11px; color: var(--text-tertiary);">提及 → 被提及</div>`;
    gm.generations.forEach(g => {
      heatmapHTML += `<div class="heatmap-header">${g}</div>`;
    });
    gm.matrix.forEach((row, i) => {
      heatmapHTML += `<div class="heatmap-header">${gm.generations[i]}</div>`;
      row.forEach(val => {
        const c = getCellColor(val);
        heatmapHTML += `<div class="heatmap-cell" style="background: ${c.bg}; color: ${c.text};">${val}</div>`;
      });
    });
    heatmapHTML += '</div>';

    // 期别子Tab
    const genTabs = gm.generations.map(g =>
      `<div class="gen-sub-tab ${g === this.currentGenTab ? 'active' : ''}" data-gen="${g}" onclick="InteractionPage.switchGenTab('${g}')">${g}</div>`
    ).join('');

    // 各期别详细面板（每个期别一个面板）
    const genPanels = gm.generations.map(gen => {
      const detail = data.genDetails.find(gd => gd.gen === gen);
      const received = data.genReceived.find(gr => gr.gen === gen);
      const isActive = gen === this.currentGenTab;

      // 该期别主动提及的成员
      let mentionItems = '';
      if (detail) {
        const maxMention = detail.topMentioned[0]?.count || 1;
        mentionItems = detail.topMentioned.map((m, i) => {
          const badge = m.gen === '同期'
            ? `<span class="gen-badge same">同期</span>`
            : `<span class="gen-badge cross">${m.gen}</span>`;
          const pct = Math.round((m.count / maxMention) * 100);
          return `
            <div class="gen-detail-item">
              <span style="width: 20px; text-align: right; color: var(--text-tertiary); font-size: 13px;">${i + 1}.</span>
              <span style="font-weight: 500; min-width: 80px;">${m.name}</span>
              ${badge}
              <div style="flex: 1; margin: 0 12px; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: ${pct}%; background: var(--color-brand-nogi); border-radius: 3px;"></div>
              </div>
              <span style="font-weight: 600; color: var(--color-brand-nogi); white-space: nowrap;">${m.count}次</span>
            </div>
          `;
        }).join('');
      }

      // 该期别被提及的成员
      let receivedItems = '';
      if (received) {
        const maxReceived = received.members[0]?.count || 1;
        receivedItems = received.members.map(m => {
          const pct = Math.round((m.count / maxReceived) * 100);
          return `
            <div class="gen-detail-item">
              <span style="font-weight: 500; min-width: 80px;">${m.name}</span>
              <div style="flex: 1; margin: 0 12px; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;">
                <div style="height: 100%; width: ${pct}%; background: var(--color-brand-nogi-light, #9b4dca); border-radius: 3px;"></div>
              </div>
              <span style="font-weight: 600; color: var(--color-brand-nogi, #742581); white-space: nowrap;">${m.count}次</span>
              <span style="color: var(--text-tertiary); font-size: 12px; white-space: nowrap; margin-left: 8px;">← ${m.mainSource} ${m.mainCount}</span>
            </div>
          `;
        }).join('');
      }

      return `
        <div class="gen-panel ${isActive ? '' : 'hidden'}" data-gen="${gen}">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
              <div class="gen-detail-title" style="margin-bottom: 12px;">${gen}最喜欢提及</div>
              ${mentionItems}
            </div>
            <div>
              <div class="gen-detail-title" style="margin-bottom: 12px;">${gen}被谁提及</div>
              ${receivedItems}
            </div>
          </div>
        </div>
      `;
    }).join('');

    area.innerHTML = `
      <div class="panel">
        <div class="panel-title">
          ${data.group} ${data.yearMonth.replace('-', '年')}月 期别互动分析
        </div>
        <p style="font-size: 13px; color: var(--text-tertiary); margin-bottom: 16px;">期别间的提及热力图——数字越大颜色越深</p>
        ${heatmapHTML}
      </div>

      <div class="panel" style="margin-top: 20px;">
        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
          ${genTabs}
        </div>
        ${genPanels}
      </div>
    `;
  }
};

// 初始化（当嵌入博客首页时由switchView()手动触发，跳过自动初始化）
document.addEventListener('DOMContentLoaded', async () => {
  // 如果是嵌入在博客首页（有#interactionsView容器），跳过自动初始化
  if (document.getElementById('interactionsView')) {
    console.log('[interactions] 嵌入模式，跳过自动初始化（由switchView触发）');
    return;
  }
  const area = document.getElementById('contentArea');
  if (area) {
    area.innerHTML = '<div class="empty-state"><p>正在加载数据...</p></div>';
  }
  await loadInteractionData();
  if (!dataLoaded && area) {
    area.innerHTML = `
      <div class="empty-state">
        <h3 style="font-size: 16px; font-weight: 500; color: var(--text-primary); margin-bottom: 8px;">数据加载失败</h3>
        <p>请通过 HTTP 服务器访问本页面（不支持 file:// 协议）</p>
        <p style="margin-top: 8px; font-size: 12px; color: var(--text-tertiary);">例如: http://localhost:8899/interactions.html</p>
      </div>`;
    return;
  }
  InteractionPage.jumpToLatest();
  InteractionPage.render();
});
