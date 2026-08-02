/**
 * goals.js - 目标管理模块逻辑
 * 人生工作台 · 月度/季度/年度目标追踪
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';

export const GoalsModule = (() => {
  const { escapeHtml, formatDate } = AppUtils;

  // ===== 常量 =====
  const LEVEL_CONFIG = {
    yearly:    { label: '年度', icon: '📅' },
    quarterly: { label: '季度', icon: '📊' },
    monthly:   { label: '月度', icon: '🗓️' },
  };

  const STATUS_CONFIG = {
    active:    { label: '进行中', badge: 'badge-active' },
    completed: { label: '已完成', badge: 'badge-completed' },
    abandoned: { label: '已放弃', badge: 'badge-abandoned' },
  };

  const GROUP_ORDER = ['yearly', 'quarterly', 'monthly'];

  // ===== 状态 =====
  let allGoals = [];
  let allTasks = [];
  let currentLevel = 'all';
  let currentView = 'list';
  let expandedGoalId = null;

  // ===== 工具函数 =====




  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parseInt(parts[0])}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }

  function isOverdue(dateStr, status) {
    if (!dateStr || status !== 'active') return false;
    return dateStr < formatDate(new Date());
  }

  function showToast(msg) {
    if (window.App?.showToast) {
      window.App?.showToast(msg);
    } else {
      console.log('[Goals Toast]', msg);
    }
  }

  /**
   * 根据关联任务计算自动进度
   */
  function calcAutoProgress(goal) {
    if (!goal.relatedTaskIds || goal.relatedTaskIds.length === 0) {
      return goal.progress || 0;
    }
    const relatedTasks = allTasks.filter(t => goal.relatedTaskIds.includes(t.id));
    if (relatedTasks.length === 0) return goal.progress || 0;
    const doneCount = relatedTasks.filter(t => t.status === 'done').length;
    return Math.round((doneCount / relatedTasks.length) * 100);
  }

  /**
   * 获取目标最终进度（手动优先）
   */
  function getEffectiveProgress(goal) {
    if (goal.manualProgress) {
      return goal.progress || 0;
    }
    return calcAutoProgress(goal);
  }

  // ===== 数据加载 =====
  async function loadData() {
    allGoals = await Storage.getAll('goals');
    // 按更新时间倒序
    allGoals.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    // 加载任务表用于自动进度计算
    try {
      allTasks = await Storage.getAll('tasks');
    } catch (e) {
      allTasks = [];
    }
  }

  // ===== 筛选 =====
  function getFilteredGoals() {
    if (currentLevel === 'all') return allGoals;
    return allGoals.filter(g => g.level === currentLevel);
  }

  // ===== 统计 =====
  function renderStats() {
    const container = document.getElementById('goalsStats');
    if (!container) return;

    const filtered = getFilteredGoals();
    const total = filtered.length;
    const completed = filtered.filter(g => g.status === 'completed').length;
    const active = filtered.filter(g => g.status === 'active').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    container.innerHTML = `
      <div class="goals-stat-card">
        <div class="goals-stat-value">${total}</div>
        <div class="goals-stat-label">目标总数</div>
      </div>
      <div class="goals-stat-card">
        <div class="goals-stat-value">${active}</div>
        <div class="goals-stat-label">进行中</div>
      </div>
      <div class="goals-stat-card">
        <div class="goals-stat-value">${completed}</div>
        <div class="goals-stat-label">已完成</div>
      </div>
      <div class="goals-stat-card">
        <div class="goals-stat-value accent">${rate}%</div>
        <div class="goals-stat-label">完成率</div>
      </div>
    `;
  }

  // ===== 列表视图 =====
  function renderListView() {
    const container = document.getElementById('goalsListView');
    if (!container) return;

    const filtered = getFilteredGoals();

    if (filtered.length === 0) {
      container.innerHTML = '';
      document.getElementById('goalsEmpty').style.display = '';
      return;
    }

    document.getElementById('goalsEmpty').style.display = 'none';

    // 按层级分组
    const groups = {};
    GROUP_ORDER.forEach(level => { groups[level] = []; });
    filtered.forEach(g => {
      if (groups[g.level]) groups[g.level].push(g);
    });

    let html = '';
    GROUP_ORDER.forEach(level => {
      const items = groups[level];
      if (items.length === 0) return;
      const cfg = LEVEL_CONFIG[level];

      html += `<div class="goals-group">`;
      html += `<div class="goals-group-header">
        <span class="goals-group-icon">${cfg.icon}</span>
        <span class="goals-group-title">${cfg.label}目标</span>
        <span class="goals-group-count">${items.length}</span>
      </div>`;

      items.forEach(goal => {
        const progress = getEffectiveProgress(goal);
        const statusCfg = STATUS_CONFIG[goal.status] || STATUS_CONFIG.active;
        const overdue = isOverdue(goal.deadline, goal.status);
        const isExpanded = expandedGoalId === goal.id;

        html += `<div class="goals-card status-${goal.status} ${isExpanded ? 'expanded' : ''}" data-id="${goal.id}">
          <div class="goals-card-top">
            <span class="goals-card-title">${escapeHtml(goal.title)}</span>
            <span class="goals-card-badge ${statusCfg.badge}">${statusCfg.label}</span>
          </div>
          <div class="goals-progress-bar">
            <div class="goals-progress-fill ${goal.status === 'completed' ? 'fill-done' : ''}" style="width:${progress}%"></div>
          </div>
          <div class="goals-card-bottom">
            <span class="goals-card-deadline ${overdue ? 'overdue' : ''}">
              ${overdue ? '⚠️ 已逾期' : '📅'} ${formatDisplayDate(goal.deadline)}
            </span>
            <span class="goals-card-progress-text">${progress}%</span>
          </div>`;

        // 展开详情
        html += `<div class="goals-card-detail">`;
        if (goal.description) {
          html += `<p class="goals-card-desc">${escapeHtml(goal.description)}</p>`;
        }

        // 关联任务
        if (goal.relatedTaskIds && goal.relatedTaskIds.length > 0) {
          const relatedTasks = allTasks.filter(t => goal.relatedTaskIds.includes(t.id));
          if (relatedTasks.length > 0) {
            html += `<div class="goals-card-tasks">
              <div class="goals-card-tasks-title">关联任务 (${relatedTasks.filter(t=>t.status==='done').length}/${relatedTasks.length})</div>`;
            relatedTasks.forEach(task => {
              const dotClass = task.status === 'done' ? 'done' : 'pending';
              html += `<div class="goals-card-task-item">
                <span class="task-dot ${dotClass}"></span>
                <span>${escapeHtml(task.title || '任务 #' + task.id)}</span>
              </div>`;
            });
            html += `</div>`;
          }
        }

        // 操作按钮
        html += `<div class="goals-card-actions">
          <button class="goals-card-action-btn" data-action="edit" data-id="${goal.id}">编辑</button>
          ${goal.status === 'active' ? `<button class="goals-card-action-btn" data-action="complete" data-id="${goal.id}">✓ 完成</button>` : ''}
          ${goal.status === 'active' ? `<button class="goals-card-action-btn" data-action="abandon" data-id="${goal.id}">放弃</button>` : ''}
          <button class="goals-card-action-btn danger" data-action="delete" data-id="${goal.id}">删除</button>
        </div>`;

        html += `</div>`; // detail
        html += `</div>`; // card
      });

      html += `</div>`; // group
    });

    container.innerHTML = html;
  }

  // ===== 看板视图 =====
  function renderKanbanView() {
    const container = document.getElementById('goalsKanbanView');
    if (!container) return;

    const filtered = getFilteredGoals();

    if (filtered.length === 0) {
      container.innerHTML = '';
      return;
    }

    const columns = ['active', 'completed', 'abandoned'];
    const colConfig = {
      active:    { label: '进行中', color: 'var(--accent)' },
      completed: { label: '已完成', color: '#4CAF50' },
      abandoned: { label: '已放弃', color: 'var(--text-muted)' },
    };

    let html = '';
    columns.forEach(status => {
      const items = filtered.filter(g => g.status === status);
      const cfg = colConfig[status];

      html += `<div class="goals-kanban-col">
        <div class="goals-kanban-col-title">
          <span class="col-dot" style="background:${cfg.color}"></span>
          ${cfg.label}
          <span class="goals-kanban-col-count">${items.length}</span>
        </div>
        <div class="goals-kanban-cards">`;

      items.forEach(goal => {
        const progress = getEffectiveProgress(goal);
        const levelCfg = LEVEL_CONFIG[goal.level] || { label: goal.level };
        const overdue = isOverdue(goal.deadline, goal.status);

        html += `<div class="goals-kanban-card" data-id="${goal.id}">
          <div class="goals-kanban-card-title">${escapeHtml(goal.title)}</div>
          <div class="goals-progress-bar">
            <div class="goals-progress-fill ${goal.status === 'completed' ? 'fill-done' : ''}" style="width:${progress}%"></div>
          </div>
          <div class="goals-kanban-card-meta">
            <span class="goals-kanban-card-level">${levelCfg.label}</span>
            <span>${progress}%</span>
          </div>
          <div class="goals-kanban-card-meta" style="margin-top:4px;">
            <span class="${overdue ? 'overdue' : ''}">${overdue ? '⚠️ ' : ''}${formatDisplayDate(goal.deadline)}</span>
            <span>
              ${status !== 'completed' ? `<button class="goals-card-action-btn" data-action="complete" data-id="${goal.id}" style="padding:2px 8px;font-size:11px;">✓</button>` : ''}
              ${status !== 'abandoned' && status !== 'completed' ? `<button class="goals-card-action-btn" data-action="abandon" data-id="${goal.id}" style="padding:2px 8px;font-size:11px;">✕</button>` : ''}
              ${status !== 'active' ? `<button class="goals-card-action-btn" data-action="reactivate" data-id="${goal.id}" style="padding:2px 8px;font-size:11px;">↩</button>` : ''}
            </span>
          </div>
        </div>`;
      });

      html += `</div></div>`;
    });

    container.innerHTML = html;
  }

  // ===== 统一渲染 =====
  function renderAll() {
    renderStats();
    renderListView();
    renderKanbanView();

    // 切换视图可见性
    const listView = document.getElementById('goalsListView');
    const kanbanView = document.getElementById('goalsKanbanView');
    if (listView) listView.style.display = currentView === 'list' ? '' : 'none';
    if (kanbanView) kanbanView.style.display = currentView === 'kanban' ? '' : 'none';

    // 空状态逻辑
    const filtered = getFilteredGoals();
    if (filtered.length === 0) {
      document.getElementById('goalsEmpty').style.display = '';
    } else {
      document.getElementById('goalsEmpty').style.display = 'none';
    }
  }

  // ===== 弹窗 =====
  function openModal(goal) {
    const overlay = document.getElementById('goalsModalOverlay');
    const title = document.getElementById('goalsModalTitle');
    const form = document.getElementById('goalsForm');
    const deleteBtn = document.getElementById('goalsBtnDelete');

    // 重置
    form.reset();
    document.getElementById('goalEditId').value = '';
    document.getElementById('goalManualProgress').checked = false;

    if (goal) {
      // 编辑模式
      title.textContent = '编辑目标';
      deleteBtn.style.display = '';
      document.getElementById('goalEditId').value = goal.id;
      document.getElementById('goalTitle').value = goal.title || '';
      document.getElementById('goalDesc').value = goal.description || '';
      document.getElementById('goalLevel').value = goal.level || 'monthly';
      document.getElementById('goalDeadline').value = goal.deadline || '';
      document.getElementById('goalStatus').value = goal.status || 'active';
      document.getElementById('goalProgress').value = goal.progress || 0;
      document.getElementById('goalManualProgress').checked = !!goal.manualProgress;
      document.getElementById('goalRelatedTasks').value = (goal.relatedTaskIds || []).join(',');
    } else {
      // 新建模式
      title.textContent = '新建目标';
      deleteBtn.style.display = 'none';
      // 默认截止月末
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      document.getElementById('goalDeadline').value = formatDate(lastDay);
    }

    overlay.style.display = '';
  }

  function closeModal() {
    document.getElementById('goalsModalOverlay').style.display = 'none';
  }

  // ===== CRUD =====
  async function saveGoal() {
    const editId = document.getElementById('goalEditId').value;
    const titleEl = document.getElementById('goalTitle');
    const title = titleEl.value.trim();

    if (!title) {
      titleEl.focus();
      showToast('请输入目标标题');
      return;
    }

    const deadline = document.getElementById('goalDeadline').value;
    if (!deadline) {
      showToast('请选择截止日期');
      return;
    }

    const relatedRaw = document.getElementById('goalRelatedTasks').value.trim();
    const relatedTaskIds = relatedRaw
      ? relatedRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      : [];

    const manualProgress = document.getElementById('goalManualProgress').checked;
    const progressVal = parseInt(document.getElementById('goalProgress').value) || 0;

    const now = Date.now();
    const data = {
      title,
      description: document.getElementById('goalDesc').value.trim(),
      level: document.getElementById('goalLevel').value,
      deadline,
      progress: manualProgress ? Math.min(100, Math.max(0, progressVal)) : progressVal,
      manualProgress,
      relatedTaskIds,
      status: document.getElementById('goalStatus').value,
      updatedAt: now,
    };

    if (editId) {
      data.id = parseInt(editId);
      data.createdAt = (allGoals.find(g => g.id === data.id) || {}).createdAt || now;
      await Storage.put('goals', data);
      showToast('目标已更新');
    } else {
      data.createdAt = now;
      await Storage.add('goals', data);
      showToast('目标已创建');
    }

    closeModal();
    await loadData();
    renderAll();
  }

  async function deleteGoal(id) {
    if (!confirm('确定删除这个目标？')) return;
    await Storage.remove('goals', id);
    showToast('目标已删除');
    closeModal();
    await loadData();
    renderAll();
  }

  async function quickUpdateStatus(id, status) {
    const goal = allGoals.find(g => g.id === id);
    if (!goal) return;
    goal.status = status;
    goal.updatedAt = Date.now();
    if (status === 'completed') goal.progress = 100;
    await Storage.put('goals', goal);
    await loadData();
    renderAll();
    showToast(status === 'completed' ? '目标已完成 🎉' : status === 'abandoned' ? '目标已放弃' : '目标已恢复');
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 层级 Tab
    document.querySelectorAll('.goals-tab').forEach(tab => {
      _bindEvent(tab, 'click', () => {
        document.querySelectorAll('.goals-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentLevel = tab.dataset.level;
        expandedGoalId = null;
        renderAll();
      });
    });

    // 视图切换
    document.querySelectorAll('.goals-view-btn').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        document.querySelectorAll('.goals-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        renderAll();
      });
    });

    // FAB
    _bindEvent(document.getElementById('goalsFab'), 'click', () => openModal(null));

    // Modal 关闭
    _bindEvent(document.getElementById('goalsModalClose'), 'click', closeModal);
    _bindEvent(document.getElementById('goalsBtnCancel'), 'click', closeModal);
    _bindEvent(document.getElementById('goalsModalOverlay'), 'click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // 表单提交
    _bindEvent(document.getElementById('goalsForm'), 'submit', (e) => {
      e.preventDefault();
      saveGoal();
    });

    // 删除按钮
    _bindEvent(document.getElementById('goalsBtnDelete'), 'click', () => {
      const editId = document.getElementById('goalEditId').value;
      if (editId) deleteGoal(parseInt(editId));
    });

    // 进度手动切换
    _bindEvent(document.getElementById('goalManualProgress'), 'change', (e) => {
      const progressInput = document.getElementById('goalProgress');
      if (e.target.checked) {
        progressInput.placeholder = '0-100';
      } else {
        progressInput.placeholder = '自动';
      }
    });

    // 卡片点击展开 / 操作按钮
    _bindEvent(document, 'click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const id = parseInt(actionBtn.dataset.id);
        const action = actionBtn.dataset.action;

        switch (action) {
          case 'edit':
            const goal = allGoals.find(g => g.id === id);
            if (goal) openModal(goal);
            break;
          case 'complete':
            quickUpdateStatus(id, 'completed');
            break;
          case 'abandon':
            if (confirm('确定放弃这个目标？')) quickUpdateStatus(id, 'abandoned');
            break;
          case 'reactivate':
            quickUpdateStatus(id, 'active');
            break;
          case 'delete':
            deleteGoal(id);
            break;
        }
        return;
      }

      // 卡片展开/收起（列表视图）
      const card = e.target.closest('.goals-card');
      if (card && !e.target.closest('.goals-card-actions')) {
        const id = parseInt(card.dataset.id);
        expandedGoalId = expandedGoalId === id ? null : id;
        renderListView();
        return;
      }

      // 看板卡片点击 - 打开编辑
      const kanbanCard = e.target.closest('.goals-kanban-card');
      if (kanbanCard) {
        const id = parseInt(kanbanCard.dataset.id);
        const goal = allGoals.find(g => g.id === id);
        if (goal) openModal(goal);
      }
    });
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Goals] 模块初始化...');
    await loadData();
    renderAll();
    bindEvents();
  }


  // ===== 模块生命周期 =====
  let _eventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    console.log('[GoalsModule] 模块已销毁');
  }

  return { init, destroy };
})();
