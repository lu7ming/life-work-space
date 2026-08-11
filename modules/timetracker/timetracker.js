/**
 * timetracker.js - 时间追踪模块
 * 人生工作台 · 记录与分析时间消耗
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';

export const TimeTrackerModule = (() => {
  const { formatDate, formatTime, escapeHtml } = AppUtils;

  // 分类配置
  const CATEGORIES = {
    work: { label: '工作', emoji: '💼', color: '#3498db' },
    study: { label: '学习', emoji: '📚', color: '#9b59b6' },
    exercise: { label: '运动', emoji: '💪', color: '#e67e22' },
    leisure: { label: '娱乐', emoji: '🎮', color: '#2ecc71' },
    rest: { label: '休息', emoji: '😴', color: '#95a5a6' },
    other: { label: '其他', emoji: '📌', color: '#1abc9c' },
  };

  let _activeEntry = null;
  let _elapsedTimer = null;
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  async function init() {
    console.log('[TimeTracker] 初始化...');
    await renderData();
    bindEvents();
    await checkActiveEntry();
  }

  function bindEvents() {
    const startBtn = document.getElementById('tt-start-btn');
    const manualBtn = document.getElementById('tt-manual-btn');
    const stopBtn = document.getElementById('tt-stop-btn');

    if (startBtn) _bindEvent(startBtn, 'click', showCategoryModal);
    if (manualBtn) _bindEvent(manualBtn, 'click', showManualModal);
    if (stopBtn) _bindEvent(stopBtn, 'click', stopTracking);

    // 分类选择弹窗
    const catClose = document.getElementById('tt-cat-close');
    if (catClose) _bindEvent(catClose, 'click', hideCategoryModal);
    document.getElementById('tt-cat-grid')?.querySelectorAll('.tt-cat-btn').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        const cat = btn.dataset.cat;
        hideCategoryModal();
        startTracking(cat);
      });
    });

    // 手动记录弹窗
    const manualClose = document.getElementById('tt-manual-close');
    const manualCancel = document.getElementById('tt-manual-cancel');
    const manualConfirm = document.getElementById('tt-manual-confirm');
    if (manualClose) _bindEvent(manualClose, 'click', hideManualModal);
    if (manualCancel) _bindEvent(manualCancel, 'click', hideManualModal);
    if (manualConfirm) _bindEvent(manualConfirm, 'click', submitManualEntry);
  }

  async function checkActiveEntry() {
    try {
      const setting = await Storage.get('settings', 'tt_active_entry');
      if (setting && setting.value) {
        _activeEntry = setting.value;
        showActiveCard();
        startElapsedTimer();
      }
    } catch (e) { /* 静默 */ }
  }

  function showCategoryModal() {
    const modal = document.getElementById('tt-category-modal');
    if (modal) modal.style.display = 'flex';
  }

  function hideCategoryModal() {
    const modal = document.getElementById('tt-category-modal');
    if (modal) modal.style.display = 'none';
  }

  async function startTracking(category) {
    if (!category) category = 'work';
    _activeEntry = {
      category,
      startTime: new Date().toISOString(),
      note: ''
    };

    try {
      await Storage.put('settings', { key: 'tt_active_entry', value: _activeEntry });
    } catch(e) {
      console.warn('[Timetracker] Storage.put 失败:', e);
    }
    showActiveCard();
    startElapsedTimer();
    if (window.App) window.App?.showToast(`${CATEGORIES[category]?.emoji || '⏱️'} ${CATEGORIES[category]?.label || '追踪'}已开始`);
  }

  async function stopTracking() {
    if (!_activeEntry) return;

    const note = document.getElementById('tt-active-note')?.value || '';
    const endTime = new Date();
    const startTime = new Date(_activeEntry.startTime);
    const duration = Math.round((endTime - startTime) / 60000);

    const entry = {
      category: _activeEntry.category,
      startTime: _activeEntry.startTime,
      endTime: endTime.toISOString(),
      duration,
      note,
      date: formatDate(startTime),
    };

    try {
      await Storage.add('time_entries', entry);
      await Storage.remove('settings', 'tt_active_entry');
      if (window.AuditLog) window.AuditLog?.log({ type: 'time_entry', source: 'timetracker', params: { category: entry.category, duration }, result: 'success' });
    } catch (e) {
      if (typeof ErrorHandler !== 'undefined') ErrorHandler.handle(e, 'TimeTracker', '保存时间记录失败');
    }

    _activeEntry = null;
    stopElapsedTimer();
    hideActiveCard();
    await renderData();
    if (window.App) window.App?.showToast(`已记录 ${duration} 分钟 ${CATEGORIES[entry.category]?.emoji || ''}`);
  }

  function showActiveCard() {
    const card = document.getElementById('tt-active-card');
    if (card && _activeEntry) {
      card.style.display = 'block';
      const catEl = document.getElementById('tt-active-category');
      if (catEl) catEl.textContent = CATEGORIES[_activeEntry.category]?.label || '追踪中';
    }
  }

  function hideActiveCard() {
    const card = document.getElementById('tt-active-card');
    if (card) card.style.display = 'none';
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    _elapsedTimer = setInterval(() => {
      if (!_activeEntry) return;
      const elapsed = Date.now() - new Date(_activeEntry.startTime).getTime();
      const h = String(Math.floor(elapsed / 3600000)).padStart(2, '0');
      const m = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, '0');
      const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
      const el = document.getElementById('tt-active-elapsed');
      if (el) el.textContent = `${h}:${m}:${s}`;
    }, 1000);
  }

  function stopElapsedTimer() {
    if (_elapsedTimer) { clearInterval(_elapsedTimer); _elapsedTimer = null; }
  }

  function showManualModal() {
    const modal = document.getElementById('tt-manual-modal');
    if (modal) modal.style.display = 'flex';
  }

  function hideManualModal() {
    const modal = document.getElementById('tt-manual-modal');
    if (modal) modal.style.display = 'none';
  }

  async function submitManualEntry() {
    const category = document.getElementById('tt-form-category')?.value || 'other';
    const startTimeVal = document.getElementById('tt-form-start')?.value;
    const endTimeVal = document.getElementById('tt-form-end')?.value;
    const note = document.getElementById('tt-form-note')?.value || '';

    if (!startTimeVal || !endTimeVal) {
      if (window.App) window.App?.showToast('请填写开始和结束时间');
      return;
    }

    const today = formatDate(new Date());
    const startDT = new Date(`${today}T${startTimeVal}`);
    const endDT = new Date(`${today}T${endTimeVal}`);

    if (endDT <= startDT) {
      if (window.App) window.App?.showToast('结束时间必须晚于开始时间');
      return;
    }

    const duration = Math.round((endDT - startDT) / 60000);

    try {
      await Storage.add('time_entries', {
        category,
        startTime: startDT.toISOString(),
        endTime: endDT.toISOString(),
        duration,
        note,
        date: today,
      });
      hideManualModal();
      await renderData();
      if (window.App) window.App?.showToast(`已记录 ${duration} 分钟 ✅`);
    } catch (e) {
      if (typeof ErrorHandler !== 'undefined') ErrorHandler.handle(e, 'TimeTracker', '保存时间记录失败');
    }
  }

  async function renderData() {
    await renderChart();
    await renderTimeline();
    await renderRecords();
  }

  async function renderChart() {
    const chartArea = document.getElementById('tt-chart-area');
    const legendEl = document.getElementById('tt-legend');
    if (!chartArea || !legendEl) return;

    const today = formatDate(new Date());
    let entries;
    try {
      entries = await Storage.getByIndex('time_entries', 'date', today) || [];
    } catch(e) {
      console.warn('[Timetracker] Storage.getByIndex 失败:', e);
      entries = [];
    }

    if (entries.length === 0) {
      chartArea.innerHTML = '<div class="tt-empty-state">暂无今日数据，开始追踪吧</div>';
      legendEl.innerHTML = '';
      return;
    }

    const catTotals = {};
    let total = 0;
    entries.forEach(e => {
      const cat = e.category || 'other';
      catTotals[cat] = (catTotals[cat] || 0) + (e.duration || 0);
      total += (e.duration || 0);
    });

    // 生成 CSS conic-gradient 饼图
    let gradientParts = [];
    let currentDeg = 0;
    const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    catEntries.forEach(([cat, dur]) => {
      const pct = (dur / total) * 360;
      const color = CATEGORIES[cat]?.color || '#95a5a6';
      gradientParts.push(`${color} ${currentDeg}deg ${currentDeg + pct}deg`);
      currentDeg += pct;
    });

    const hours = Math.floor(total / 60);
    const mins = total % 60;

    chartArea.innerHTML = `
      <div class="tt-pie-chart" style="background: conic-gradient(${gradientParts.join(', ')});">
        <div class="tt-pie-center">
          <div class="tt-pie-center-num">${hours > 0 ? hours + 'h' : ''}${mins}m</div>
          <div class="tt-pie-center-label">总计</div>
        </div>
      </div>
    `;

    legendEl.innerHTML = catEntries.map(([cat, dur]) => {
      const c = CATEGORIES[cat] || CATEGORIES.other;
      const pct = Math.round(dur / total * 100);
      return `<div class="tt-legend-item"><span class="tt-legend-dot" style="background:${c.color}"></span>${c.emoji} ${c.label} ${pct}%</div>`;
    }).join('');
  }

  async function renderTimeline() {
    const timelineEl = document.getElementById('tt-timeline');
    if (!timelineEl) return;

    const today = formatDate(new Date());
    let entries;
    try {
      entries = await Storage.getByIndex('time_entries', 'date', today) || [];
    } catch(e) {
      console.warn('[Timetracker] Storage.getByIndex 失败:', e);
      entries = [];
    }

    if (entries.length === 0) {
      timelineEl.innerHTML = '<div class="tt-empty-state">今天还没有记录</div>';
      return;
    }

    const sorted = entries.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    timelineEl.innerHTML = sorted.map(e => {
      const cat = CATEGORIES[e.category] || CATEGORIES.other;
      const start = formatTime(new Date(e.startTime));
      const end = formatTime(new Date(e.endTime));
      return `
        <div class="tt-timeline-item">
          <div class="tt-timeline-time">${start} - ${end}</div>
          <div class="tt-timeline-content">${cat.emoji} ${cat.label}${e.note ? ' · ' + escapeHtml(e.note) : ''}</div>
          <div class="tt-timeline-duration">${e.duration} 分钟</div>
        </div>
      `;
    }).join('');
  }

  async function renderRecords() {
    const recordsEl = document.getElementById('tt-records');
    if (!recordsEl) return;

    let allEntries;
    try {
      allEntries = await Storage.getAll('time_entries') || [];
    } catch(e) {
      console.warn('[Timetracker] Storage.getAll 失败:', e);
      allEntries = [];
    }
    const recent = allEntries.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 20);

    if (recent.length === 0) {
      recordsEl.innerHTML = '<div class="tt-empty-state">暂无记录</div>';
      return;
    }

    recordsEl.innerHTML = recent.map(e => {
      const cat = CATEGORIES[e.category] || CATEGORIES.other;
      const date = formatDate(new Date(e.startTime));
      const start = formatTime(new Date(e.startTime));
      return `
        <div class="tt-record-item">
          <div class="tt-record-cat">${cat.emoji}</div>
          <div class="tt-record-info">
            <div class="tt-record-title">${cat.label}${e.note ? ' · ' + escapeHtml(e.note) : ''}</div>
            <div class="tt-record-meta">${date} ${start}</div>
          </div>
          <div class="tt-record-dur">${e.duration}m</div>
          <button class="tt-record-del" data-id="${e.id}" title="删除">✕</button>
        </div>
      `;
    }).join('');

    // 绑定删除事件
    recordsEl.querySelectorAll('.tt-record-del').forEach(btn => {
      _bindEvent(btn, 'click', async () => {
        const id = parseInt(btn.dataset.id);
        if (id) {
          try {
            await Storage.remove('time_entries', id);
          } catch(e) {
            console.warn('[Timetracker] Storage.remove 失败:', e);
          }
          await renderData();
        }
      });
    });
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    stopElapsedTimer();
    console.log('[TimeTracker] 模块已销毁');
  }

  return { init, destroy };
})();
