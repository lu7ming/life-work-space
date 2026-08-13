/**
 * countdown.js - 倒数日模块
 * 人生工作台 · 重要日子倒计时管理
 * IIFE 模式 · 使用 Storage API (IndexedDB 封装)
 */

const CountdownModule = (() => {
  let allCountdowns = [];
  let _eventListeners = [];
  let _refreshTimer = null;

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg) {
    if (window.showToast) {
      window.showToast(msg);
    } else {
      console.log('[Countdown]', msg);
    }
  }

  function genId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  function calcDays(dateStr) {
    if (!dateStr) return { days: 0, isPast: false, isToday: false };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(dateStr + 'T00:00:00');
    const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffMs = targetDay - today;
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return {
      days: Math.abs(days),
      isPast: days < 0,
      isToday: days === 0,
    };
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${year}年${month}月${day}日 · ${weekdays[d.getDay()]}`;
  }

  async function loadData() {
    try {
      const data = await Storage.getAll('countdown');
      allCountdowns = data || [];
      allCountdowns.sort((a, b) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const ta = new Date(a.date + 'T00:00:00');
        const tb = new Date(b.date + 'T00:00:00');
        const da = Math.round((ta - today) / (1000 * 60 * 60 * 24));
        const db = Math.round((tb - today) / (1000 * 60 * 60 * 24));
        if (da >= 0 && db >= 0) return da - db;
        if (da < 0 && db < 0) return db - da;
        return db - da;
      });
    } catch (e) {
      console.warn('[Countdown] 数据加载失败:', e);
      allCountdowns = [];
    }
  }

  function renderAll() {
    const listEl = document.getElementById('countdownList');
    const emptyEl = document.getElementById('countdownEmpty');

    if (!allCountdowns.length) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = allCountdowns.map(item => {
      const { days, isPast, isToday } = calcDays(item.date);
      const emoji = escapeHtml(item.emoji || '\uD83D\uDCC5');
      const name = escapeHtml(item.name || '未命名');
      const dateText = formatDate(item.date);

      let daysText, unitText;
      if (isToday) {
        daysText = '今天';
        unitText = '';
      } else if (isPast) {
        daysText = `${days}`;
        unitText = '已过去';
      } else {
        daysText = `${days}`;
        unitText = '天后';
      }

      return `
        <div class="countdown-item ${isPast ? 'past' : ''}" data-id="${item.id}">
          <button class="countdown-item-delete" data-action="delete" data-id="${item.id}" title="删除">\u2715</button>
          <div class="countdown-item-emoji">${emoji}</div>
          <div class="countdown-item-info">
            <div class="countdown-item-name">${name}</div>
            <div class="countdown-item-date">${dateText}</div>
          </div>
          <div class="countdown-item-days">
            <div class="countdown-item-days-num">${daysText}</div>
            ${unitText ? `<div class="countdown-item-days-unit">${unitText}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function openModal() {
    const overlay = document.getElementById('countdownModalOverlay');
    const form = document.getElementById('countdownForm');
    const dateInput = document.getElementById('countdownDate');

    form.reset();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = tomorrow.toISOString().split('T')[0];

    overlay.style.display = '';
    setTimeout(() => document.getElementById('countdownName').focus(), 100);
  }

  function closeModal() {
    document.getElementById('countdownModalOverlay').style.display = 'none';
  }

  async function addCountdown() {
    const nameEl = document.getElementById('countdownName');
    const dateEl = document.getElementById('countdownDate');
    const emojiEl = document.getElementById('countdownEmoji');

    const name = nameEl.value.trim();
    const date = dateEl.value;
    const emoji = emojiEl.value.trim();

    if (!name) {
      nameEl.focus();
      showToast('请输入事件名称');
      return;
    }
    if (!date) {
      dateEl.focus();
      showToast('请选择目标日期');
      return;
    }

    const now = Date.now();
    const data = {
      id: genId(),
      name,
      date,
      emoji: emoji || '\uD83D\uDCC5',
      createdAt: now,
    };

    try {
      await Storage.add('countdown', data);
    } catch (e) {
      console.warn('[Countdown] Storage.add 失败:', e);
      showToast('添加失败，请重试');
      return;
    }

    showToast('倒数日已添加 \uD83C\uDF89');
    closeModal();
    await loadData();
    renderAll();
  }

  async function deleteCountdown(id) {
    if (!confirm('确定删除这个倒数日？')) return;
    try {
      await Storage.remove('countdown', id);
    } catch (e) {
      console.warn('[Countdown] Storage.remove 失败:', e);
      showToast('删除失败，请重试');
      return;
    }
    showToast('已删除');
    await loadData();
    renderAll();
  }

  function bindEvents() {
    _bindEvent(document.getElementById('countdownFab'), 'click', openModal);

    _bindEvent(document.getElementById('countdownModalClose'), 'click', closeModal);
    _bindEvent(document.getElementById('countdownBtnCancel'), 'click', closeModal);
    _bindEvent(document.getElementById('countdownModalOverlay'), 'click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    _bindEvent(document.getElementById('countdownForm'), 'submit', (e) => {
      e.preventDefault();
      addCountdown();
    });

    _bindEvent(document, 'click', (e) => {
      const deleteBtn = e.target.closest('[data-action="delete"]');
      if (deleteBtn) {
        e.stopPropagation();
        const id = parseInt(deleteBtn.dataset.id);
        deleteCountdown(id);
      }
    });

    _refreshTimer = setInterval(() => {
      renderAll();
    }, 60000);
  }

  function _bindEvent(el, event, handler) {
    if (el) {
      el.addEventListener(event, handler);
      _eventListeners.push({ el, event, handler });
    }
  }

  async function init() {
    console.log('[Countdown] 模块初始化...');
    await loadData();
    renderAll();
    bindEvents();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
    console.log('[CountdownModule] 模块已销毁');
  }

  return { init, destroy };
})();
