/**
 * achievements.js - 成就展示面板模块
 * 人生工作台 · 成就勋章展示与交互
 */
import { Achievements } from '../../core/achievements.js';
import { EventBus } from '../../core/event-bus.js';

export const AchievementsModule = (() => {
  let _eventListeners = [];
  let _currentFilter = 'all';

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[AchievementsModule] 成就面板初始化...');
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
    const countEl = document.getElementById('achievements-unlocked-count');
    const totalEl = document.getElementById('achievements-total-count');
    const fillEl = document.getElementById('achievements-progress-fill');

    if (countEl) countEl.textContent = unlockedCount;
    if (totalEl) totalEl.textContent = totalCount;
    if (fillEl) fillEl.style.width = percent + '%';

    // 渲染卡片
    const grid = document.getElementById('achievements-grid');
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
    const filters = document.querySelector('.achievements-filters');
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
    const grid = document.getElementById('achievements-grid');
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

    const iconEl = document.getElementById('achievement-detail-icon');
    const nameEl = document.getElementById('achievement-detail-name');
    const descEl = document.getElementById('achievement-detail-desc');
    const statusEl = document.getElementById('achievement-detail-status');
    const progressEl = document.getElementById('achievement-detail-progress');
    const dateEl = document.getElementById('achievement-detail-date');

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

    const overlay = document.getElementById('achievement-detail-overlay');
    if (overlay) overlay.classList.add('show');
  }

  function _bindDetailEvents() {
    const closeBtn = document.getElementById('achievement-detail-close');
    const overlay = document.getElementById('achievement-detail-overlay');

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
    console.log('[AchievementsModule] 模块已销毁');
  }

  return { init, destroy };
})();
