/**
 * achievements-widget.js - 成就组件
 * 人生工作台 · 成就勋章展示与交互
 * 从 Dashboard 拆分而出 (v123)
 */
import { AppUtils } from '../../../core/utils.js';
import { EventBus } from '../../../core/event-bus.js';

const AchievementsWidget = (() => {
  // ===== Widget缩略版渲染 =====
  async function renderMini(container, config) {
    try {
      const AchievementsMod = window.Achievements;
      if (!AchievementsMod) {
        container.innerHTML = '<div class="dash-widget-no-data">成就模块加载中...</div>';
        return;
      }

      const allAchievements = await AchievementsMod.getAllWithStatus();
      const unlockedCount = allAchievements.filter(a => a.unlocked).length;
      const totalCount = allAchievements.length;
      const percent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

      // 最近解锁的成就
      const recent = allAchievements
        .filter(a => a.unlocked && a.unlockedAt)
        .sort((a, b) => new Date(b.unlockedAt) - new Date(a.unlockedAt))
        .slice(0, 1);

      const recentHtml = recent.length > 0 ? `
        <div class="dash-widget-achievement-recent">
          <span class="dash-widget-achievement-icon">${recent[0].icon}</span>
          <span class="dash-widget-achievement-name">${recent[0].name}</span>
        </div>
      ` : '<div class="dash-widget-achievement-recent" style="font-size:12px;color:var(--text-muted);">暂无解锁成就</div>';

      container.innerHTML = `
        <div class="dash-widget-achievement-header">
          <span class="dash-widget-achievement-label">🏆 成就进度</span>
          <span class="dash-widget-achievement-count">${unlockedCount}/${totalCount}</span>
        </div>
        <div class="dash-widget-achievement-bar">
          <div class="dash-widget-achievement-fill" style="width:${percent}%"></div>
        </div>
        ${recentHtml}
        <button class="dash-widget-achievement-more" id="dash-achievement-expand-btn">查看全部 →</button>
      `;

      // 绑定展开按钮
      const expandBtn = document.getElementById('dash-achievement-expand-btn');
      if (expandBtn) {
        expandBtn.addEventListener('click', () => {
          openFullView();
        });
      }
    } catch (e) {
      console.warn('[AchievementsWidget] 缩略版渲染失败:', e);
      container.innerHTML = '<div class="dash-widget-no-data">加载失败</div>';
    }
  }

  // ===== 全屏版渲染（在 overlay 容器内） =====
  function renderFull(overlay) {
    // 全屏版通过 openFullView 触发，DOM 结构已在 HTML 中
    // 这里保留空实现供外部调用
  }


  let _eventListeners = [];
  let _currentFilter = 'all';

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Dashboard/Achievements] 成就全屏子模块初始化...');
    _bindFilterEvents();
    _bindGridEvents();
    _bindDetailEvents();

    // 监听成就解锁事件，实时刷新
    EventBus.on('achievement:unlocked', () => render());

    await render();
  }

  // ===== 渲染 =====
  async function render() {
    const allAchievements = await Achievements.getAllWithStatus();
    const filtered = _currentFilter === 'all'
      ? allAchievements
      : allAchievements.filter(a => a.category === _currentFilter);

    const unlockedCount = allAchievements.filter(a => a.unlocked).length;
    const totalCount = allAchievements.length;
    const percent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    // 更新摘要
    const countEl = document.getElementById('dash-ach-full-unlocked-count');
    const totalEl = document.getElementById('dash-ach-full-total-count');
    const fillEl = document.getElementById('dash-ach-full-progress-fill');

    if (countEl) countEl.textContent = unlockedCount;
    if (totalEl) totalEl.textContent = totalCount;
    if (fillEl) fillEl.style.width = percent + '%';

    // 渲染卡片
    const grid = document.getElementById('dash-ach-full-grid');
    if (!grid) return;

    grid.innerHTML = filtered.map(a => _renderCard(a)).join('');
  }

  function _renderCard(a) {
    const unlockedClass = a.unlocked ? 'unlocked' : 'locked';
    const progressHtml = _renderProgress(a);
    const dateHtml = a.unlockedAt
      ? `<div class="achievement-card-date">${_formatDate(a.unlockedAt)}</div>`
      : '';

    return `
      <div class="achievement-card ${unlockedClass}" data-achievement-id="${a.id}">
        <div class="achievement-card-icon">${a.icon}</div>
        <div class="achievement-card-info">
          <div class="achievement-card-name">${a.name}</div>
          <div class="achievement-card-desc">${a.description}</div>
          ${progressHtml}
          ${dateHtml}
        </div>
        ${a.unlocked ? '<div class="achievement-card-badge">✓</div>' : ''}
      </div>
    `;
  }

  function _renderProgress(a) {
    if (a.unlocked) return '';
    if (!a.progress) return '';
    const { current, target } = a.progress;
    const percent = Math.round((current / target) * 100);
    return `
      <div class="achievement-card-progress">
        <div class="achievement-progress-bar">
          <div class="achievement-progress-fill" style="width:${percent}%"></div>
        </div>
        <span class="achievement-progress-text">${current}/${target}</span>
      </div>
    `;
  }

  function _formatDate(isoStr) {
    try {
      const d = new Date(isoStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch (e) {
      return isoStr;
    }
  }

  // ===== 筛选 =====
  function _bindFilterEvents() {
    const filters = document.getElementById('dash-ach-full-filters');
    if (!filters) return;
    _bindEvent(filters, 'click', (e) => {
      const btn = e.target.closest('.achievements-filter-btn');
      if (!btn) return;
      _currentFilter = btn.dataset.filter;
      filters.querySelectorAll('.achievements-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  }

  // ===== 卡片点击 =====
  function _bindGridEvents() {
    const grid = document.getElementById('dash-ach-full-grid');
    if (!grid) return;
    _bindEvent(grid, 'click', (e) => {
      const card = e.target.closest('.achievement-card');
      if (!card) return;
      const id = card.dataset.achievementId;
      if (id) _showDetail(id);
    });
  }

  // ===== 详情弹窗 =====
  async function _showDetail(achievementId) {
    const allAchievements = await Achievements.getAllWithStatus();
    const a = allAchievements.find(item => item.id === achievementId);
    if (!a) return;

    const iconEl = document.getElementById('dash-ach-detail-icon');
    const nameEl = document.getElementById('dash-ach-detail-name');
    const descEl = document.getElementById('dash-ach-detail-desc');
    const statusEl = document.getElementById('dash-ach-detail-status');
    const progressEl = document.getElementById('dash-ach-detail-progress');
    const dateEl = document.getElementById('dash-ach-detail-date');

    if (iconEl) {
      iconEl.textContent = a.icon;
      iconEl.className = 'achievement-detail-icon' + (a.unlocked ? ' unlocked' : '');
    }
    if (nameEl) nameEl.textContent = a.name;
    if (descEl) descEl.textContent = a.description;
    if (statusEl) statusEl.textContent = a.unlocked ? '✅ 已解锁' : '🔒 未解锁';

    if (progressEl) {
      if (a.progress && !a.unlocked) {
        const { current, target } = a.progress;
        const percent = Math.round((current / target) * 100);
        progressEl.innerHTML = `
          <div class="achievement-detail-progress-bar">
            <div class="achievement-detail-progress-fill" style="width:${percent}%"></div>
          </div>
          <span>${current}/${target} (${percent}%)</span>
        `;
        progressEl.style.display = '';
      } else {
        progressEl.innerHTML = '';
        progressEl.style.display = 'none';
      }
    }

    if (dateEl) {
      if (a.unlockedAt) {
        dateEl.textContent = '解锁时间：' + _formatDate(a.unlockedAt);
        dateEl.style.display = '';
      } else {
        dateEl.textContent = '';
        dateEl.style.display = 'none';
      }
    }

    const overlay = document.getElementById('dash-ach-detail-overlay');
    if (overlay) overlay.classList.add('show');
  }

  function _bindDetailEvents() {
    const closeBtn = document.getElementById('dash-ach-detail-close');
    const overlay = document.getElementById('dash-ach-detail-overlay');

    _bindEvent(closeBtn, 'click', () => {
      if (overlay) overlay.classList.remove('show');
    });
    _bindEvent(overlay, 'click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  }

  // ===== 销毁 =====
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    console.log('[Dashboard/Achievements] 子模块已销毁');
  }

  function openFullView() {
    const overlay = document.getElementById('dash-ach-full-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.classList.add('show');
      // 绑定关闭按钮
      const closeBtn = document.getElementById('dash-ach-full-close-btn');
      if (closeBtn && !closeBtn._bound) {
        closeBtn.addEventListener('click', closeFullView);
        closeBtn._bound = true;
      }
      // 点击遮罩关闭
      if (!overlay._bound) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeFullView();
        });
        overlay._bound = true;
      }
      // 初始化（只初始化一次，复用 _initialized 标记）
      if (!_initialized) {
        init();
        _initialized = true;
      } else {
        render(); // 刷新
      }
    }
  }

  function closeFullView() {
    const overlay = document.getElementById('dash-ach-full-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      overlay.style.display = 'none';
    }
    // 同时关闭详情弹窗
    const detailOverlay = document.getElementById('dash-ach-detail-overlay');
    if (detailOverlay) detailOverlay.classList.remove('show');
  }

  let _initialized = false;

  return { init, destroy, openFullView, closeFullView, renderMini, renderFull };
})();

// 导出
export { AchievementsWidget };
