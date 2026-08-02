/**
 * content.js - 创作日程模块逻辑
 * 人生工作台 · 选题库 + 拍摄计划 + 发布追踪
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';

export const ContentModule = (() => {

  // ===== 事件监听追踪 =====
  let _eventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 常量 =====
  const STATUS_LIST = ['idea', 'prep', 'shot', 'published', 'abandoned'];
  const STATUS_CONFIG = {
    idea:      { label: '灵感',   icon: '💡', cssClass: 'status-idea' },
    prep:      { label: '筹备中', icon: '🔧', cssClass: 'status-prep' },
    shot:      { label: '已拍摄', icon: '🎬', cssClass: 'status-shot' },
    published: { label: '已发布', icon: '✅', cssClass: 'status-published' },
    abandoned: { label: '已放弃', icon: '❌', cssClass: 'status-abandoned' },
  };

  const PRIORITY_CONFIG = {
    high:   { label: '高', cssClass: 'priority-high' },
    medium: { label: '中', cssClass: 'priority-medium' },
    low:    { label: '低', cssClass: 'priority-low' },
  };

  const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

  // ===== 状态 =====
  let currentTab = 'topics';
  let topicFilter = 'all';
  let publishSort = 'date-desc';
  let allTopics = [];
  let allShootings = [];
  let allPublished = [];
  let editingTopicId = null;
  let editingShootingId = null;
  let editingPublishedId = null;
  let weekOffset = 0;   // 拍摄计划周偏移量

  // ===== 工具函数 =====

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }

  function formatFullDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parts[0]}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function getNextStatus(current) {
    const idx = STATUS_LIST.indexOf(current);
    return STATUS_LIST[(idx + 1) % STATUS_LIST.length];
  }

  // ===== 数据加载 =====
  async function loadData() {
    try {
      allTopics = await Storage.getAll('content_topics');
    } catch (err) {
      console.error('[Content] 加载选题失败:', err);
      allTopics = [];
    }
    try {
      allShootings = await Storage.getAll('content_shootings');
    } catch (err) {
      console.error('[Content] 加载拍摄计划失败:', err);
      allShootings = [];
    }
    try {
      allPublished = await Storage.getAll('content_published');
    } catch (err) {
      console.error('[Content] 加载发布记录失败:', err);
      allPublished = [];
    }
  }

  // ===== Tab 切换 =====
  function switchTab(tab) {
    currentTab = tab;
    // 更新 tab 按钮样式
    document.querySelectorAll('#content-tabs .content-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // 更新面板显示
    document.querySelectorAll('.content-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
    // 更新 FAB 行为
    updateFabVisibility();
  }

  function updateFabVisibility() {
    const fab = document.getElementById('content-fab');
    if (!fab) return;
    fab.style.display = '';
  }

  // ===== 选题库渲染 =====
  function renderTopicList() {
    const listEl = document.getElementById('topic-list');
    const emptyEl = document.getElementById('topic-empty');
    if (!listEl || !emptyEl) return;

    const filtered = topicFilter === 'all'
      ? allTopics
      : allTopics.filter(t => t.status === topicFilter);

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';

    // 排序：高优先级在前
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    filtered.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

    listEl.innerHTML = filtered.map(topic => {
      const sc = STATUS_CONFIG[topic.status] || STATUS_CONFIG.idea;
      const pc = PRIORITY_CONFIG[topic.priority] || PRIORITY_CONFIG.medium;
      return `
        <div class="topic-card" data-topic-id="${topic.id}">
          <div class="topic-card-header">
            <div class="topic-card-title">${escapeHtml(topic.title)}</div>
            <div class="topic-card-actions">
              <button class="topic-card-action" data-action="edit-topic" data-id="${topic.id}" title="编辑">✏️</button>
              <button class="topic-card-action danger" data-action="delete-topic" data-id="${topic.id}" title="删除">🗑️</button>
            </div>
          </div>
          <div class="topic-card-meta">
            <span class="content-status-tag ${sc.cssClass}" data-action="cycle-status" data-id="${topic.id}">${sc.icon} ${sc.label}</span>
            <span class="content-category-tag">${escapeHtml(topic.category)}</span>
            <span class="content-priority-tag ${pc.cssClass}">${pc.label}</span>
            <span class="content-date-tag">${formatFullDate(topic.createdAt)}</span>
          </div>
        </div>`;
    }).join('');
  }

  // ===== 拍摄计划渲染 =====
  function renderShootingWeek() {
    const container = document.getElementById('shooting-week');
    const labelEl = document.getElementById('shooting-label');
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 计算本周起始（周日为第一天）
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + weekOffset * 7);

    // 更新标签
    if (labelEl) {
      if (weekOffset === 0) {
        labelEl.textContent = '本周';
      } else if (weekOffset === 1) {
        labelEl.textContent = '下周';
      } else if (weekOffset === -1) {
        labelEl.textContent = '上周';
      } else {
        const ws = formatDate(weekStart);
        const we = formatDate(new Date(weekStart.getTime() + 6 * 86400000));
        labelEl.textContent = `${formatDisplayDate(ws)} - ${formatDisplayDate(we)}`;
      }
    }

    const tomorrowStr = formatDate(new Date(today.getTime() + 86400000));
    const todayStr = formatDate(today);

    let html = '';
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekStart.getTime() + i * 86400000);
      const dayStr = formatDate(dayDate);
      const isToday = dayStr === todayStr;
      const isTomorrow = dayStr === tomorrowStr;

      // 该天的拍摄任务
      const dayShootings = allShootings
        .filter(s => s.date === dayStr)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      const dayClass = `shooting-day-col${isToday ? ' is-today' : ''}${isTomorrow ? ' is-tomorrow' : ''}`;

      html += `
        <div class="${dayClass}" data-date="${dayStr}">
          <div class="shooting-day-header">
            <span class="shooting-day-name">周${WEEKDAY_NAMES[dayDate.getDay()]}</span>
            <span class="shooting-day-date">${dayDate.getDate()}</span>
          </div>
          ${dayShootings.map(s => {
            const topic = allTopics.find(t => t.id === s.topicId);
            return `
              <div class="shooting-task" data-action="edit-shooting" data-id="${s.id}">
                ${topic ? escapeHtml(topic.title) : escapeHtml(s.note || '拍摄任务')}
                ${s.time ? `<span class="shooting-task-time">${s.time}</span>` : ''}
              </div>`;
          }).join('')}
          <button class="shooting-add-btn" data-action="add-shooting" data-date="${dayStr}" title="添加拍摄">+</button>
        </div>`;
    }

    container.innerHTML = html;
  }

  // ===== 发布追踪渲染 =====
  function renderPublishedList() {
    const listEl = document.getElementById('published-list');
    const emptyEl = document.getElementById('published-empty');
    if (!listEl || !emptyEl) return;

    // 排序
    const sorted = [...allPublished];
    switch (publishSort) {
      case 'date-desc': sorted.sort((a, b) => (b.date || '').localeCompare(a.date || '')); break;
      case 'date-asc':  sorted.sort((a, b) => (a.date || '').localeCompare(b.date || '')); break;
      case 'plays-desc': sorted.sort((a, b) => (b.plays || 0) - (a.plays || 0)); break;
    }

    // 找出最佳表现（播放量最高的）
    const bestId = allPublished.length > 0
      ? allPublished.reduce((best, cur) => ((cur.plays || 0) > (best.plays || 0) ? cur : best)).id
      : null;

    if (sorted.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
    } else {
      emptyEl.style.display = 'none';

      listEl.innerHTML = sorted.map(pub => {
        const topic = allTopics.find(t => t.id === pub.topicId);
        const isBest = pub.id === bestId && (pub.plays || 0) > 0;
        return `
          <div class="publish-card${isBest ? ' best-performance' : ''}" data-pub-id="${pub.id}">
            <div class="publish-card-header">
              <div class="publish-card-title">${escapeHtml(pub.title)}${isBest ? ' 🏆' : ''}</div>
              <div class="publish-card-actions">
                <button class="publish-card-action" data-action="edit-published" data-id="${pub.id}" title="编辑">✏️</button>
                <button class="publish-card-action danger" data-action="delete-published" data-id="${pub.id}" title="删除">🗑️</button>
              </div>
            </div>
            <div class="publish-card-stats">
              <span class="publish-stat">▶ <span class="publish-stat-value">${(pub.plays || 0).toLocaleString()}</span></span>
              <span class="publish-stat">❤ <span class="publish-stat-value">${(pub.likes || 0).toLocaleString()}</span></span>
              <span class="publish-stat">💬 <span class="publish-stat-value">${(pub.comments || 0).toLocaleString()}</span></span>
              <span class="publish-stat">⭐ <span class="publish-stat-value">${(pub.favorites || 0).toLocaleString()}</span></span>
            </div>
            <div class="publish-card-footer">
              <span class="publish-card-date">${formatFullDate(pub.date)}</span>
              ${topic ? `<span class="publish-card-topic">${escapeHtml(topic.title)}</span>` : ''}
            </div>
          </div>`;
      }).join('');
    }

    // 更新汇总
    renderPublishSummary();
  }

  function renderPublishSummary() {
    const totalEl = document.getElementById('pub-total-count');
    const avgEl = document.getElementById('pub-avg-plays');
    const bestEl = document.getElementById('pub-best-title');
    if (!totalEl || !avgEl || !bestEl) return;

    const total = allPublished.length;
    const totalPlays = allPublished.reduce((sum, p) => sum + (p.plays || 0), 0);
    const avg = total > 0 ? Math.round(totalPlays / total) : 0;

    const best = allPublished.length > 0
      ? allPublished.reduce((b, c) => ((c.plays || 0) > (b.plays || 0) ? c : b))
      : null;

    totalEl.textContent = total;
    avgEl.textContent = avg.toLocaleString();
    bestEl.textContent = best && (best.plays || 0) > 0 ? escapeHtml(best.title) : '-';
  }

  // ===== 全量渲染 =====
  function renderAll() {
    renderTopicList();
    renderShootingWeek();
    renderPublishedList();
  }

  // ===== 弹窗控制 =====
  function openModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.add('show');
  }

  function closeModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove('show');
  }

  // ===== 填充选题下拉 =====
  function populateTopicSelect(selectId, selectedId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">-- 选择选题 --</option>' +
      allTopics.map(t => `<option value="${t.id}"${t.id === selectedId ? ' selected' : ''}>${escapeHtml(t.title)}</option>`).join('');
  }

  // ===== 选题库操作 =====
  function openTopicModal(topic) {
    editingTopicId = topic ? topic.id : null;
    const titleEl = document.getElementById('topic-modal-title');
    const titleInput = document.getElementById('topic-title-input');
    const categoryInput = document.getElementById('topic-category-input');
    const statusInput = document.getElementById('topic-status-input');

    if (titleEl) titleEl.textContent = topic ? '编辑选题' : '新建选题';
    if (titleInput) titleInput.value = topic ? topic.title : '';
    if (categoryInput) categoryInput.value = topic ? topic.category : '声乐教学';
    if (statusInput) statusInput.value = topic ? topic.status : 'idea';

    // 优先级
    const priority = topic ? topic.priority : 'high';
    document.querySelectorAll('#topic-priority-picker .content-priority-pick').forEach(btn => {
      const p = btn.dataset.priority;
      btn.className = 'content-priority-pick';
      if (p === priority) {
        btn.classList.add(p === 'high' ? 'active-high' : p === 'medium' ? 'active-medium' : 'active-low');
      }
    });

    openModal('topic-modal-overlay');
    // 聚焦
    if (titleInput) setTimeout(() => titleInput.focus(), 100);
    // 跨模块关联：监听选题标题输入推荐相关内容
    _bindCrossLinkForTopic();
  }

  async function saveTopic() {
    const titleInput = document.getElementById('topic-title-input');
    const categoryInput = document.getElementById('topic-category-input');
    const statusInput = document.getElementById('topic-status-input');

    const title = (titleInput ? titleInput.value : '').trim();
    if (!title) return;

    const category = categoryInput ? categoryInput.value : '声乐教学';
    const status = statusInput ? statusInput.value : 'idea';

    // 获取优先级
    const activePriority = document.querySelector('#topic-priority-picker .content-priority-pick[class*="active-"]');
    const priority = activePriority ? activePriority.dataset.priority : 'medium';

    if (editingTopicId) {
      // 编辑
      const topic = allTopics.find(t => t.id === editingTopicId);
      if (topic) {
        topic.title = title;
        topic.category = category;
        topic.priority = priority;
        topic.status = status;
        await Storage.put('content_topics', topic);
      }
    } else {
      // 新建
      const topic = {
        id: generateId(),
        title,
        category,
        priority,
        status,
        createdAt: formatDate(new Date()),
      };
      allTopics.push(topic);
      await Storage.put('content_topics', topic);
    }

    editingTopicId = null;
    closeModal('topic-modal-overlay');
    // 隐藏跨模块推荐
    if (window.CrossLinker) {
      CrossLinker.hideSuggestions('content-topic-suggestions');
    }
    await loadData();
    renderAll();
  }

  async function deleteTopic(id) {
    if (!confirm('确认删除此选题？')) return;
    await Storage.remove('content_topics', id);
    await loadData();
    renderAll();
  }

  async function cycleTopicStatus(id) {
    const topic = allTopics.find(t => t.id === id);
    if (!topic) return;
    topic.status = getNextStatus(topic.status);
    await Storage.put('content_topics', topic);
    await loadData();
    renderTopicList();
  }

  // ===== 拍摄计划操作 =====
  function openShootingModal(shooting, preDate) {
    editingShootingId = shooting ? shooting.id : null;
    const titleEl = document.getElementById('shooting-modal-title');
    const dateInput = document.getElementById('shooting-date-input');
    const timeInput = document.getElementById('shooting-time-input');
    const locationInput = document.getElementById('shooting-location-input');
    const noteInput = document.getElementById('shooting-note-input');

    if (titleEl) titleEl.textContent = shooting ? '编辑拍摄计划' : '新建拍摄计划';
    if (dateInput) dateInput.value = shooting ? shooting.date : (preDate || formatDate(new Date()));
    if (timeInput) timeInput.value = shooting ? (shooting.time || '') : '';
    if (locationInput) locationInput.value = shooting ? (shooting.location || '') : '';
    if (noteInput) noteInput.value = shooting ? (shooting.note || '') : '';

    populateTopicSelect('shooting-topic-input', shooting ? shooting.topicId : '');

    // 编辑时显示删除按钮
    const footer = document.getElementById('shooting-modal-footer');
    if (footer) {
      const existingDelete = footer.querySelector('.content-btn--danger');
      if (existingDelete) existingDelete.remove();
      if (shooting) {
        const delBtn = document.createElement('button');
        delBtn.className = 'content-btn content-btn--danger';
        delBtn.id = 'shooting-btn-delete';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', async () => {
          await deleteShooting(editingShootingId);
          closeModal('shooting-modal-overlay');
        });
        footer.insertBefore(delBtn, footer.firstChild);
      }
    }

    openModal('shooting-modal-overlay');
  }

  async function saveShooting() {
    const topicInput = document.getElementById('shooting-topic-input');
    const dateInput = document.getElementById('shooting-date-input');
    const timeInput = document.getElementById('shooting-time-input');
    const locationInput = document.getElementById('shooting-location-input');
    const noteInput = document.getElementById('shooting-note-input');

    const date = dateInput ? dateInput.value : '';
    if (!date) return;

    const shooting = {
      id: editingShootingId || generateId(),
      topicId: topicInput ? topicInput.value : '',
      date,
      time: timeInput ? timeInput.value : '',
      location: locationInput ? locationInput.value : '',
      note: noteInput ? noteInput.value : '',
    };

    await Storage.put('content_shootings', shooting);
    editingShootingId = null;
    closeModal('shooting-modal-overlay');
    await loadData();
    renderAll();
  }

  async function deleteShooting(id) {
    if (!confirm('确认删除此拍摄计划？')) return;
    await Storage.remove('content_shootings', id);
    await loadData();
    renderAll();
  }

  // ===== 发布追踪操作 =====
  function openPublishedModal(pub) {
    editingPublishedId = pub ? pub.id : null;
    const titleEl = document.getElementById('published-modal-title');
    const titleInput = document.getElementById('pub-title-input');
    const dateInput = document.getElementById('pub-date-input');
    const playsInput = document.getElementById('pub-plays-input');
    const likesInput = document.getElementById('pub-likes-input');
    const commentsInput = document.getElementById('pub-comments-input');
    const favoritesInput = document.getElementById('pub-favorites-input');
    const deleteBtn = document.getElementById('pub-btn-delete');

    if (titleEl) titleEl.textContent = pub ? '编辑发布记录' : '新建发布记录';
    if (titleInput) titleInput.value = pub ? pub.title : '';
    if (dateInput) dateInput.value = pub ? pub.date : formatDate(new Date());
    if (playsInput) playsInput.value = pub ? (pub.plays || 0) : 0;
    if (likesInput) likesInput.value = pub ? (pub.likes || 0) : 0;
    if (commentsInput) commentsInput.value = pub ? (pub.comments || 0) : 0;
    if (favoritesInput) favoritesInput.value = pub ? (pub.favorites || 0) : 0;
    if (deleteBtn) deleteBtn.style.display = pub ? '' : 'none';

    populateTopicSelect('pub-topic-input', pub ? pub.topicId : '');

    openModal('published-modal-overlay');
    if (titleInput) setTimeout(() => titleInput.focus(), 100);
  }

  async function savePublished() {
    const titleInput = document.getElementById('pub-title-input');
    const topicInput = document.getElementById('pub-topic-input');
    const dateInput = document.getElementById('pub-date-input');
    const playsInput = document.getElementById('pub-plays-input');
    const likesInput = document.getElementById('pub-likes-input');
    const commentsInput = document.getElementById('pub-comments-input');
    const favoritesInput = document.getElementById('pub-favorites-input');

    const title = (titleInput ? titleInput.value : '').trim();
    if (!title) return;

    const date = dateInput ? dateInput.value : formatDate(new Date());

    const pub = {
      id: editingPublishedId || generateId(),
      title,
      topicId: topicInput ? topicInput.value : '',
      date,
      plays: parseInt(playsInput ? playsInput.value : '0') || 0,
      likes: parseInt(likesInput ? likesInput.value : '0') || 0,
      comments: parseInt(commentsInput ? commentsInput.value : '0') || 0,
      favorites: parseInt(favoritesInput ? favoritesInput.value : '0') || 0,
    };

    await Storage.put('content_published', pub);
    editingPublishedId = null;
    closeModal('published-modal-overlay');
    await loadData();
    renderAll();
  }

  async function deletePublished(id) {
    if (!confirm('确认删除此发布记录？')) return;
    await Storage.remove('content_published', id);
    await loadData();
    renderAll();
  }

  // ===== FAB 点击处理 =====
  function handleFabClick() {
    switch (currentTab) {
      case 'topics':
        openTopicModal(null);
        break;
      case 'shooting':
        openShootingModal(null);
        break;
      case 'published':
        openPublishedModal(null);
        break;
    }
  }

  // ===== 事件绑定 =====
  function bindTabEvents() {
    const tabsEl = document.getElementById('content-tabs');
    if (tabsEl) {
      _bindEvent(tabsEl, 'click', (e) => {
        const btn = e.target.closest('.content-tab');
        if (btn && btn.dataset.tab) {
          switchTab(btn.dataset.tab);
        }
      });
    }
  }

  function bindFilterEvents() {
    const filterEl = document.getElementById('topic-filter');
    if (filterEl) {
      _bindEvent(filterEl, 'click', (e) => {
        const btn = e.target.closest('.content-filter-btn');
        if (btn && btn.dataset.status) {
          topicFilter = btn.dataset.status;
          filterEl.querySelectorAll('.content-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderTopicList();
        }
      });
    }
  }

  function bindFabEvents() {
    const fab = document.getElementById('content-fab');
    if (fab) {
      _bindEvent(fab, 'click', handleFabClick);
    }
  }

  function bindModalEvents() {
    // 选题弹窗
    const topicClose = document.getElementById('topic-modal-close');
    const topicCancel = document.getElementById('topic-btn-cancel');
    const topicConfirm = document.getElementById('topic-btn-confirm');
    const topicOverlay = document.getElementById('topic-modal-overlay');

    if (topicClose) _bindEvent(topicClose, 'click', () => closeModal('topic-modal-overlay'));
    if (topicCancel) _bindEvent(topicCancel, 'click', () => closeModal('topic-modal-overlay'));
    if (topicConfirm) _bindEvent(topicConfirm, 'click', saveTopic);
    if (topicOverlay) _bindEvent(topicOverlay, 'click', (e) => { if (e.target === topicOverlay) closeModal('topic-modal-overlay'); });

    // 优先级选择器
    const priorityPicker = document.getElementById('topic-priority-picker');
    if (priorityPicker) {
      _bindEvent(priorityPicker, 'click', (e) => {
        const btn = e.target.closest('.content-priority-pick');
        if (btn) {
          const p = btn.dataset.priority;
          priorityPicker.querySelectorAll('.content-priority-pick').forEach(b => {
            b.className = 'content-priority-pick';
          });
          btn.classList.add(p === 'high' ? 'active-high' : p === 'medium' ? 'active-medium' : 'active-low');
        }
      });
    }

    // 拍摄弹窗
    const shootingClose = document.getElementById('shooting-modal-close');
    const shootingCancel = document.getElementById('shooting-btn-cancel');
    const shootingConfirm = document.getElementById('shooting-btn-confirm');
    const shootingOverlay = document.getElementById('shooting-modal-overlay');

    if (shootingClose) _bindEvent(shootingClose, 'click', () => closeModal('shooting-modal-overlay'));
    if (shootingCancel) _bindEvent(shootingCancel, 'click', () => closeModal('shooting-modal-overlay'));
    if (shootingConfirm) _bindEvent(shootingConfirm, 'click', saveShooting);
    if (shootingOverlay) _bindEvent(shootingOverlay, 'click', (e) => { if (e.target === shootingOverlay) closeModal('shooting-modal-overlay'); });

    // 发布弹窗
    const publishedClose = document.getElementById('published-modal-close');
    const publishedCancel = document.getElementById('pub-btn-cancel');
    const publishedConfirm = document.getElementById('pub-btn-confirm');
    const publishedDelete = document.getElementById('pub-btn-delete');
    const publishedOverlay = document.getElementById('published-modal-overlay');

    if (publishedClose) _bindEvent(publishedClose, 'click', () => closeModal('published-modal-overlay'));
    if (publishedCancel) _bindEvent(publishedCancel, 'click', () => closeModal('published-modal-overlay'));
    if (publishedConfirm) _bindEvent(publishedConfirm, 'click', savePublished);
    if (publishedDelete) _bindEvent(publishedDelete, 'click', async () => { await deletePublished(editingPublishedId); closeModal('published-modal-overlay'); });
    if (publishedOverlay) _bindEvent(publishedOverlay, 'click', (e) => { if (e.target === publishedOverlay) closeModal('published-modal-overlay'); });
  }

  function bindListEvents() {
    // 使用事件委托处理列表中的操作按钮
    const contentModule = document.querySelector('.content-module');
    if (!contentModule) return;

    _bindEvent(contentModule, 'click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const id = target.dataset.id;

      switch (action) {
        case 'edit-topic': {
          const topic = allTopics.find(t => t.id === id);
          if (topic) openTopicModal(topic);
          break;
        }
        case 'delete-topic':
          deleteTopic(id);
          break;
        case 'cycle-status':
          cycleTopicStatus(id);
          break;
        case 'add-shooting': {
          const preDate = target.dataset.date;
          openShootingModal(null, preDate);
          break;
        }
        case 'edit-shooting': {
          const shooting = allShootings.find(s => s.id === id);
          if (shooting) openShootingModal(shooting);
          break;
        }
        case 'edit-published': {
          const pub = allPublished.find(p => p.id === id);
          if (pub) openPublishedModal(pub);
          break;
        }
        case 'delete-published':
          deletePublished(id);
          break;
      }
    });
  }

  function bindShootingNavEvents() {
    const prevBtn = document.getElementById('shooting-prev');
    const nextBtn = document.getElementById('shooting-next');
    if (prevBtn) _bindEvent(prevBtn, 'click', () => { weekOffset--; renderShootingWeek(); });
    if (nextBtn) _bindEvent(nextBtn, 'click', () => { weekOffset++; renderShootingWeek(); });
  }

  function bindPublishSortEvents() {
    // 排序按钮事件委托
    const contentModule = document.querySelector('.content-module');
    if (!contentModule) return;

    _bindEvent(contentModule, 'click', (e) => {
      const btn = e.target.closest('.publish-sort-btn');
      if (btn && btn.dataset.sort) {
        publishSort = btn.dataset.sort;
        document.querySelectorAll('.publish-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPublishedList();
      }
    });
  }

  // ===== 初始化 =====
  function init() {
    console.log('[Content] 创作日程模块初始化...');
    currentTab = 'topics';
    topicFilter = 'all';
    publishSort = 'date-desc';
    weekOffset = 0;

    bindTabEvents();
    bindFilterEvents();
    bindFabEvents();
    bindModalEvents();
    bindListEvents();
    bindShootingNavEvents();
    bindPublishSortEvents();

    loadData().then(() => {
      renderAll();
    });
  }

  // ===== 跨模块智能关联 =====
  let _topicCrossLinkBound = false;

  function _bindCrossLinkForTopic() {
    const titleInput = document.getElementById('topic-title-input');
    if (!titleInput || _topicCrossLinkBound) return;
    _topicCrossLinkBound = true;

    _bindEvent(titleInput, 'input', () => {
      const text = titleInput.value.trim();
      if (window.CrossLinker && text.length >= 2) {
        CrossLinker.showSuggestions(text, 'content_topics', 'content-topic-suggestions', editingTopicId);
      } else if (window.CrossLinker) {
        CrossLinker.hideSuggestions('content-topic-suggestions');
      }
    });
  }

  /**
   * 模块销毁：清理事件监听器和定时器
   */
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    // 关闭所有弹窗
    ['topic-modal-overlay', 'shooting-modal-overlay', 'published-modal-overlay'].forEach(id => {
      closeModal(id);
    });
    console.log('[Content] 模块已销毁');
  }

  return { init, destroy };
})();
