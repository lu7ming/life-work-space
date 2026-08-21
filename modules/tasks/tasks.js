/**
 * tasks.js - 任务模块逻辑
 * 人生工作台 · 任务管理 + 项目追踪 + 番茄钟
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';
import { CrossLinker } from '../../core/cross-linker.js';

export const TasksModule = (() => {
  const { formatDate, escapeHtml } = AppUtils;

  // ===== 事件监听追踪 =====
  let _eventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 常量 =====
  const PRIORITY_CONFIG = {
    A: { label: '紧急重要', color: '#E74C3C' },
    B: { label: '重要不紧急', color: '#F5A623' },
    C: { label: '紧急不重要', color: '#E67E22' },
    D: { label: '不紧急不重要', color: '#95A5A6' },
  };

  const POMODORO_WORK = 25 * 60;   // 25 分钟
  const POMODORO_REST = 5 * 60;    // 5 分钟
  const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // SVG 圆周长

  // ===== 状态 =====
  let currentTab = 'today';
  let currentFilter = 'all';       // 全部任务的优先级筛选
  let allTasks = [];
  let allProjects = [];
  let editingTaskId = null;         // 当前编辑的任务 ID
  let weeklyViewOffset = 0;       // 周计划视图偏移量（0=当前周期）

  // 番茄钟状态
  let pomodoroState = {
    running: false,
    isWork: true,          // true=工作, false=休息
    timeLeft: POMODORO_WORK,
    totalTime: POMODORO_WORK,
    intervalId: null,
    taskId: null,
  };

  // ===== 购物车状态 =====
  const SHOPPING_PRIORITY_CONFIG = {
    high: { label: '高', color: '#E85D5D' },
    medium: { label: '中', color: '#E8A87C' },
    low: { label: '低', color: '#A0A0A0' },
  };
  let shoppingItems = [];
  let shoppingFilter = 'all';    // all / pending / bought
  let shoppingSort = 'priority'; // priority / time
  let editingShoppingId = null;

  // ===== 工具函数 =====


  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }

  function isToday(dateStr) {
    return dateStr === formatDate(new Date());
  }

  function isOverdue(dateStr) {
    if (!dateStr) return false;
    const today = formatDate(new Date());
    return dateStr < today;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatTimeHM(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function sortByPriority(tasks) {
    const order = { A: 0, B: 1, C: 2, D: 3 };
    return tasks.sort((a, b) => {
      // 未完成排前面
      if (a.status !== b.status) return a.status === 'todo' ? -1 : 1;
      // 同状态按优先级
      return (order[a.priority] || 3) - (order[b.priority] || 3);
    });
  }

  // ===== 数据加载 =====
  async function loadData() {
    try {
      allTasks = await Storage.getAll('tasks');
      allProjects = await Storage.getAll('projects');
    } catch (err) {
      console.error('[Tasks] 加载数据失败:', err);
      allTasks = [];
      allProjects = [];
    }
    // 购物车数据独立加载（store 可能尚未创建，容错处理）
    try {
      shoppingItems = await Storage.getAll('shopping_items');
    } catch (err) {
      console.warn('[Tasks] 购物车数据加载失败（store 可能未初始化）:', err);
      shoppingItems = [];
    }
  }

  // ===== 渲染所有 =====
  function renderAll() {
    renderTaskList('today');
    renderTaskList('all');
    renderTaskList('done');
    renderMatrixView();
    renderWeeklyView();
    renderProjects();
    renderPomodoroTaskSelect();
    renderPomodoroHistory();
    renderShopping();
    updateStats();
    updatePomodoroCount();
  }

  // ===== Tab 切换 =====
  function bindTabEvents() {
    const tabs = document.getElementById('tasks-tabs');
    if (!tabs) return;
    _bindEvent(tabs, 'click', (e) => {
      const tab = e.target.closest('.tasks-tab');
      if (!tab) return;
      const tabName = tab.dataset.tab;
      if (tabName === currentTab) return;
      currentTab = tabName;
      // 更新 tab 高亮
      tabs.querySelectorAll('.tasks-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      // 切换面板
      document.querySelectorAll('.tasks-panel').forEach((p) => p.classList.remove('active'));
      const panel = document.querySelector(`.tasks-panel[data-panel="${tabName}"]`);
      if (panel) panel.classList.add('active');
      // 切换 FAB 行为
      updateFabForTab();
      // 底部统计只在任务 tab 显示
      const footer = document.getElementById('tasks-footer');
      if (footer) {
        footer.style.display = (tabName === 'projects' || tabName === 'pomodoro' || tabName === 'timetracker' || tabName === 'shopping') ? 'none' : 'flex';
      }

      // 时间记录 Tab 初始化
      if (tabName === 'timetracker') {
        TimeTrackerSub.init();
      }
    });
  }

  function updateFabForTab() {
    const fab = document.getElementById('tasks-fab');
    if (!fab) return;
    if (currentTab === 'projects') {
      fab.title = '新建项目';
    } else if (currentTab === 'pomodoro') {
      fab.style.display = 'none';
      return;
    } else if (currentTab === 'shopping') {
      fab.title = '添加购物物品';
    } else if (currentTab === 'timetracker') {
      fab.style.display = 'none';
      return;
    } else {
      fab.title = '新建任务';
    }
    fab.style.display = '';
  }

  // ===== 任务列表渲染 =====
  function renderTaskList(panel) {
    let tasks;
    if (panel === 'today') {
      const todayStr = formatDate(new Date());
      tasks = allTasks.filter((t) => t.status === 'todo' && t.date === todayStr);
    } else if (panel === 'all') {
      tasks = allTasks.filter((t) => t.status === 'todo');
      if (currentFilter !== 'all') {
        tasks = tasks.filter((t) => t.priority === currentFilter);
      }
    } else if (panel === 'done') {
      tasks = allTasks.filter((t) => t.status === 'done' || t.status === 'completed');
    }
    tasks = sortByPriority(tasks);

    const listEl = document.getElementById(`tasks-list-${panel}`);
    const emptyEl = document.getElementById(`tasks-empty-${panel}`);
    if (!listEl) return;

    if (tasks.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = tasks.map((task) => renderTaskItem(task)).join('');
    bindSwipeDelete(listEl);
  }

  function renderTaskItem(task) {
    const priorityClass = task.priority || 'D';
    const isDone = task.status === 'done' || task.status === 'completed';
    const project = task.projectId ? allProjects.find((p) => p.id === task.projectId) : null;
    const overdueClass = !isDone && task.dueDate && isOverdue(task.dueDate) ? 'overdue' : '';
    const dateLabel = task.dueDate ? formatDisplayDate(task.dueDate) : '';

    return `
      <div class="task-item-wrapper" data-task-id="${task.id}">
        <div class="task-delete-bg">删除</div>
        <div class="task-item${isDone ? ' done' : ''}">
          <div class="task-checkbox${isDone ? ' checked' : ''}" data-task-id="${task.id}"></div>
          <span class="task-priority-dot priority-${priorityClass}"></span>
          <div class="task-info" data-task-id="${task.id}">
            <div class="task-name">${escapeHtml(task.title || '')}</div>
            <div class="task-meta">
              ${dateLabel ? `<span class="task-date ${overdueClass}">📅 ${dateLabel}</span>` : ''}
              ${project ? `<span class="task-project-tag">${escapeHtml(project.name)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // escapeHtml 已在顶部从 AppUtils 导入，移除本地重复定义

  // ===== 滑动删除 =====
  function bindSwipeDelete(container) {
    const wrappers = container.querySelectorAll('.task-item-wrapper');
    wrappers.forEach((wrapper) => {
      const item = wrapper.querySelector('.task-item');
      let startX = 0;
      let currentX = 0;
      let isDragging = false;

      const onStart = (e) => {
        startX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        isDragging = true;
        item.style.transition = 'none';
      };

      const onMove = (e) => {
        if (!isDragging) return;
        const x = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        currentX = x - startX;
        if (currentX < 0) {
          item.style.transform = `translateX(${Math.max(currentX, -80)}px)`;
        }
      };

      const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        item.style.transition = 'transform 0.2s ease';
        if (currentX < -50) {
          // 触发删除
          deleteTask(parseInt(wrapper.dataset.taskId));
        } else {
          item.style.transform = 'translateX(0)';
        }
        currentX = 0;
      };

      // Touch events
      _bindEvent(item, 'touchstart', onStart, { passive: true });
      _bindEvent(item, 'touchmove', onMove, { passive: true });
      _bindEvent(item, 'touchend', onEnd);
      // Mouse events (桌面端)
      _bindEvent(item, 'mousedown', onStart);
      _bindEvent(item, 'mousemove', onMove);
      _bindEvent(item, 'mouseup', onEnd);
      _bindEvent(item, 'mouseleave', onEnd);
    });
  }

  // ===== 完成任务 =====
  async function toggleTask(taskId) {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    const newStatus = (task.status === 'done' || task.status === 'completed') ? 'todo' : 'done';
    try {
      task.status = newStatus;
      task.completedAt = newStatus === 'done' ? formatDate(new Date()) : null;
      await Storage.put('tasks', task);
      // EventBus: 任务完成
      if (true && newStatus === 'done') {
        EventBus.emit('task:completed', { taskId, taskName: task.title, priority: task.priority });
      }
      renderAll();
    } catch (err) {
      console.error('[Tasks] 切换任务状态失败:', err);
    }
  }

  // ===== 删除任务 =====
  async function deleteTask(taskId) {
    try {
      await Storage.remove('tasks', taskId);
      allTasks = allTasks.filter((t) => t.id !== taskId);
      renderAll();
      if (window.App?.showToast) {
        window.App?.showToast('任务已删除');
      }
    } catch (err) {
      console.error('[Tasks] 删除任务失败:', err);
    }
  }

  // ===== FAB 点击 =====
  function bindFabEvents() {
    const fab = document.getElementById('tasks-fab');
    if (!fab) return;
    _bindEvent(fab, 'click', () => {
      if (currentTab === 'projects') {
        showProjectsModal();
      } else if (currentTab === 'shopping') {
        showShoppingModal();
      } else {
        showTaskModal();
      }
    });
  }

  // ===== 新建任务浮层 =====
  function showTaskModal() {
    const overlay = document.getElementById('tasks-modal-overlay');
    const titleEl = document.getElementById('tasks-modal-title');
    const nameInput = document.getElementById('task-name-input');
    const dateInput = document.getElementById('task-date-input');
    if (!overlay) return;
    if (titleEl) titleEl.textContent = '新建任务';
    if (nameInput) nameInput.value = '';
    if (dateInput) dateInput.value = formatDate(new Date());
    // 默认优先级 A
    setActivePriority('task-priority-picker', 'A');
    // 填充项目选项
    fillProjectSelect('task-project-input');
    overlay.classList.add('show');
    setTimeout(() => nameInput?.focus(), 200);
    // 跨模块关联：监听任务名输入推荐相关内容
    _bindCrossLinkForTaskCreate();
  }

  function hideTaskModal() {
    const overlay = document.getElementById('tasks-modal-overlay');
    if (overlay) overlay.classList.remove('show');
    // 隐藏跨模块推荐
    if (true) /* CrossLinker always available via import */ {
      CrossLinker.hideSuggestions('tasks-create-suggestions');
    }
  }

  function bindModalEvents() {
    // 新建任务浮层
    _bindEvent(document.getElementById('tasks-modal-close'), 'click', hideTaskModal);
    _bindEvent(document.getElementById('tasks-btn-cancel'), 'click', hideTaskModal);
    _bindEvent(document.getElementById('tasks-modal-overlay'), 'click', (e) => {
      if (e.target.id === 'tasks-modal-overlay') hideTaskModal();
    });
    _bindEvent(document.getElementById('tasks-btn-confirm'), 'click', handleCreateTask);

    // 优先级选择
    _bindEvent(document.getElementById('task-priority-picker'), 'click', (e) => {
      const btn = e.target.closest('.priority-pick-btn');
      if (btn) setActivePriority('task-priority-picker', btn.dataset.priority);
    });

    // 新建项目浮层
    _bindEvent(document.getElementById('projects-modal-close'), 'click', hideProjectsModal);
    _bindEvent(document.getElementById('projects-btn-cancel'), 'click', hideProjectsModal);
    _bindEvent(document.getElementById('projects-modal-overlay'), 'click', (e) => {
      if (e.target.id === 'projects-modal-overlay') hideProjectsModal();
    });
    _bindEvent(document.getElementById('projects-btn-confirm'), 'click', handleCreateProject);
  }

  function setActivePriority(pickerId, priority) {
    const picker = document.getElementById(pickerId);
    if (!picker) return;
    picker.querySelectorAll('.priority-pick-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.priority === priority);
    });
  }

  function getActivePriority(pickerId) {
    const picker = document.getElementById(pickerId);
    if (!picker) return 'D';
    const active = picker.querySelector('.priority-pick-btn.active');
    return active ? active.dataset.priority : 'D';
  }

  function fillProjectSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">-- 不关联项目 --</option>';
    allProjects.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  }

  async function handleCreateTask() {
    const nameInput = document.getElementById('task-name-input');
    const dateInput = document.getElementById('task-date-input');
    const projectInput = document.getElementById('task-project-input');
    const name = nameInput?.value.trim();
    if (!name) {
      if (window.App?.showToast) window.App?.showToast('请输入任务名称');
      return;
    }
    const task = {
      title: name,
      priority: getActivePriority('task-priority-picker'),
      dueDate: dateInput?.value || '',
      projectId: projectInput?.value ? parseInt(projectInput.value) : null,
      status: 'todo',
      date: formatDate(new Date()),
      completedAt: null,
    };
    try {
      const id = await Storage.add('tasks', task);
      task.id = id;
      allTasks.push(task);
      // EventBus: 任务创建
      if (true) /* EventBus always available via import */ {
        EventBus.emit('task:created', { task });
      }
      hideTaskModal();
      renderAll();
      if (window.App?.showToast) window.App?.showToast('任务已创建 ✅');
    } catch (err) {
      console.error('[Tasks] 创建任务失败:', err);
    }
  }

  // ===== 新建项目浮层 =====
  function showProjectsModal() {
    const overlay = document.getElementById('projects-modal-overlay');
    const nameInput = document.getElementById('project-name-input');
    if (!overlay) return;
    if (nameInput) nameInput.value = '';
    overlay.classList.add('show');
    setTimeout(() => nameInput?.focus(), 200);
  }

  function hideProjectsModal() {
    const overlay = document.getElementById('projects-modal-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  async function handleCreateProject() {
    const nameInput = document.getElementById('project-name-input');
    const name = nameInput?.value.trim();
    if (!name) {
      if (window.App?.showToast) window.App?.showToast('请输入项目名称');
      return;
    }
    const project = {
      name: name,
      createdAt: formatDate(new Date()),
    };
    try {
      const id = await Storage.add('projects', project);
      project.id = id;
      allProjects.push(project);
      hideProjectsModal();
      renderAll();
      if (window.App?.showToast) window.App?.showToast('项目已创建 📁');
    } catch (err) {
      console.error('[Tasks] 创建项目失败:', err);
    }
  }

  // ===== 优先级筛选 =====
  function bindFilterEvents() {
    const filterBar = document.getElementById('tasks-filter');
    if (!filterBar) return;
    _bindEvent(filterBar, 'click', (e) => {
      const btn = e.target.closest('.tasks-filter-btn');
      if (!btn) return;
      currentFilter = btn.dataset.priority;
      filterBar.querySelectorAll('.tasks-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderTaskList('all');
    });
  }

  // ===== 任务列表点击事件（委托） =====
  // 使用事件委托绑定到 content-area
  function bindListClickEvents() {
    const content = document.getElementById('tasks-content');
    if (!content) return;

    _bindEvent(content, 'click', (e) => {
      // 矩阵视图 - 复选框
      const matrixCheck = e.target.closest('.matrix-task-check');
      if (matrixCheck) {
        e.stopPropagation();
        const taskId = parseInt(matrixCheck.dataset.taskId);
        toggleTask(taskId);
        return;
      }
      // 矩阵视图 - 任务点击（打开详情）
      const matrixTask = e.target.closest('.matrix-task');
      if (matrixTask) {
        const taskId = parseInt(matrixTask.dataset.taskId);
        showTaskDetail(taskId);
        return;
      }
      // 周计划视图 - 任务点击（打开详情）
      const weeklyTask = e.target.closest('.weekly-task');
      if (weeklyTask) {
        const taskId = parseInt(weeklyTask.dataset.taskId);
        showTaskDetail(taskId);
        return;
      }
      // 完成复选框
      const checkbox = e.target.closest('.task-checkbox');
      if (checkbox) {
        const taskId = parseInt(checkbox.dataset.taskId);
        toggleTask(taskId);
        return;
      }
      // 任务详情（点击任务信息区域）
      const info = e.target.closest('.task-info');
      if (info) {
        const taskId = parseInt(info.dataset.taskId);
        showTaskDetail(taskId);
        return;
      }

      // ===== 购物车操作 =====
      // 标记已购买
      const shopDoneBtn = e.target.closest('.shopping-action-btn--done');
      if (shopDoneBtn) {
        const itemId = parseInt(shopDoneBtn.dataset.id);
        toggleShoppingStatus(itemId);
        return;
      }
      // 恢复待购买
      const shopRestoreBtn = e.target.closest('.shopping-action-btn--restore');
      if (shopRestoreBtn) {
        const itemId = parseInt(shopRestoreBtn.dataset.id);
        toggleShoppingStatus(itemId);
        return;
      }
      // 删除
      const shopDeleteBtn = e.target.closest('.shopping-action-btn--delete');
      if (shopDeleteBtn) {
        const itemId = parseInt(shopDeleteBtn.dataset.id);
        deleteShoppingItem(itemId);
        return;
      }
      // 点击卡片名称打开编辑
      const shopItem = e.target.closest('.shopping-item-name');
      if (shopItem) {
        const itemId = parseInt(shopItem.dataset.id);
        showShoppingModal(itemId);
        return;
      }
    });
  }

  // ===== 任务详情/编辑 =====
  function showTaskDetail(taskId) {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    editingTaskId = taskId;

    const nameInput = document.getElementById('edit-task-name');
    const dateInput = document.getElementById('edit-task-date');
    const projectInput = document.getElementById('edit-task-project');

    if (nameInput) nameInput.value = task.title || '';
    if (dateInput) dateInput.value = task.dueDate || '';
    setActivePriority('edit-task-priority-picker', task.priority || 'D');
    fillProjectSelect('edit-task-project');
    if (projectInput && task.projectId) projectInput.value = task.projectId;

    const overlay = document.getElementById('task-detail-overlay');
    if (overlay) overlay.classList.add('show');
    // 跨模块关联：监听编辑任务名输入
    _bindCrossLinkForTaskEdit();
  }

  function hideTaskDetail() {
    const overlay = document.getElementById('task-detail-overlay');
    if (overlay) overlay.classList.remove('show');
    editingTaskId = null;
    // 隐藏跨模块推荐
    if (true) /* CrossLinker always available via import */ {
      CrossLinker.hideSuggestions('tasks-edit-suggestions');
    }
  }

  function bindDetailEvents() {
    _bindEvent(document.getElementById('task-detail-close'), 'click', hideTaskDetail);
    _bindEvent(document.getElementById('task-detail-overlay'), 'click', (e) => {
      if (e.target.id === 'task-detail-overlay') hideTaskDetail();
    });
    // 优先级选择
    _bindEvent(document.getElementById('edit-task-priority-picker'), 'click', (e) => {
      const btn = e.target.closest('.priority-pick-btn');
      if (btn) setActivePriority('edit-task-priority-picker', btn.dataset.priority);
    });
    // 保存
    _bindEvent(document.getElementById('edit-task-save'), 'click', handleSaveTask);
    // 删除
    _bindEvent(document.getElementById('edit-task-delete'), 'click', () => {
      if (editingTaskId) {
        deleteTask(editingTaskId);
        hideTaskDetail();
      }
    });
  }

  async function handleSaveTask() {
    if (!editingTaskId) return;
    const task = allTasks.find((t) => t.id === editingTaskId);
    if (!task) return;

    const nameInput = document.getElementById('edit-task-name');
    const dateInput = document.getElementById('edit-task-date');
    const projectInput = document.getElementById('edit-task-project');

    const newTitle = nameInput?.value.trim();
    if (!newTitle) {
      if (window.App?.showToast) window.App?.showToast('任务名称不能为空');
      return;
    }

    task.title = newTitle;
    task.priority = getActivePriority('edit-task-priority-picker');
    task.dueDate = dateInput?.value || '';
    task.projectId = projectInput?.value ? parseInt(projectInput.value) : null;

    try {
      await Storage.put('tasks', task);
      hideTaskDetail();
      renderAll();
      if (window.App?.showToast) window.App?.showToast('已保存 ✅');
    } catch (err) {
      console.error('[Tasks] 保存任务失败:', err);
    }
  }

  // ===== 项目列表渲染 =====
  function renderProjects() {
    const listEl = document.getElementById('projects-list');
    const emptyEl = document.getElementById('projects-empty');
    if (!listEl) return;

    if (allProjects.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = allProjects.map((project) => {
      const projectTasks = allTasks.filter((t) => t.projectId === project.id);
      const total = projectTasks.length;
      const done = projectTasks.filter((t) => t.status === 'done' || t.status === 'completed').length;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;
      return `
        <div class="project-card" data-project-id="${project.id}">
          <div class="project-card-header">
            <span class="project-card-name">${escapeHtml(project.name)}</span>
            <span class="project-card-count">${done}/${total} 个任务</span>
          </div>
          <div class="project-progress-bar">
            <div class="project-progress-fill" style="width:${percent}%"></div>
          </div>
          <div class="project-card-footer">
            <span>进度 ${percent}%</span>
            <span>进行中 ${total - done}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // ===== 底部统计 =====
  function updateStats() {
    const todayStr = formatDate(new Date());
    const todayDone = allTasks.filter((t) => t.completedAt === todayStr && (t.status === 'done' || t.status === 'completed')).length;
    const total = allTasks.filter((t) => t.status === 'todo').length;

    const doneEl = document.getElementById('tasks-today-done');
    const totalEl = document.getElementById('tasks-total');
    if (doneEl) doneEl.textContent = todayDone;
    if (totalEl) totalEl.textContent = total;
  }

  // ===== 番茄钟 =====
  function bindPomodoroEvents() {
    _bindEvent(document.getElementById('pomodoro-start'), 'click', togglePomodoro);
    _bindEvent(document.getElementById('pomodoro-reset'), 'click', resetPomodoro);
    _bindEvent(document.getElementById('pomodoro-skip'), 'click', skipPomodoroPhase);
  }

  function togglePomodoro() {
    if (pomodoroState.running) {
      pausePomodoro();
    } else {
      startPomodoro();
    }
  }

  function startPomodoro() {
    pomodoroState.running = true;
    const startBtn = document.getElementById('pomodoro-start');
    if (startBtn) {
      startBtn.textContent = '⏸ 暂停';
      startBtn.classList.add('running');
    }
    pomodoroState.intervalId = setInterval(() => {
      pomodoroState.timeLeft--;
      updatePomodoroDisplay();
      if (pomodoroState.timeLeft <= 0) {
        completePomodoroPhase();
      }
    }, 1000);
  }

  function pausePomodoro() {
    pomodoroState.running = false;
    clearInterval(pomodoroState.intervalId);
    const startBtn = document.getElementById('pomodoro-start');
    if (startBtn) {
      startBtn.textContent = '▶ 继续';
      startBtn.classList.remove('running');
    }
  }

  function resetPomodoro() {
    pomodoroState.running = false;
    clearInterval(pomodoroState.intervalId);
    pomodoroState.isWork = true;
    pomodoroState.timeLeft = POMODORO_WORK;
    pomodoroState.totalTime = POMODORO_WORK;
    const startBtn = document.getElementById('pomodoro-start');
    if (startBtn) {
      startBtn.textContent = '▶ 开始';
      startBtn.classList.remove('running');
    }
    updatePomodoroDisplay();
  }

  function skipPomodoroPhase() {
    completePomodoroPhase();
  }

  async function completePomodoroPhase() {
    clearInterval(pomodoroState.intervalId);
    pomodoroState.running = false;

    if (pomodoroState.isWork) {
      // 工作阶段完成，记录一个番茄
      const taskSelect = document.getElementById('pomodoro-task-select');
      const taskId = taskSelect?.value ? parseInt(taskSelect.value) : null;
      try {
        await Storage.add('pomodoros', {
          taskId: taskId,
          date: formatDate(new Date()),
          startTime: formatTimeHM(new Date()),
          duration: POMODORO_WORK / 60,
          type: 'work',
        });
      } catch (err) {
        console.error('[Tasks] 记录番茄失败:', err);
      }
      // 切换到休息
      pomodoroState.isWork = false;
      pomodoroState.timeLeft = POMODORO_REST;
      pomodoroState.totalTime = POMODORO_REST;
      if (window.App?.showToast) window.App?.showToast('🍅 专注完成！休息一下');
      updatePomodoroCount();
      renderPomodoroHistory();
    } else {
      // 休息结束，切回工作
      pomodoroState.isWork = true;
      pomodoroState.timeLeft = POMODORO_WORK;
      pomodoroState.totalTime = POMODORO_WORK;
      if (window.App?.showToast) window.App?.showToast('休息结束，继续加油 💪');
    }

    const startBtn = document.getElementById('pomodoro-start');
    if (startBtn) {
      startBtn.textContent = '▶ 开始';
      startBtn.classList.remove('running');
    }
    updatePomodoroDisplay();
  }

  function updatePomodoroDisplay() {
    const timeEl = document.getElementById('pomodoro-time');
    const labelEl = document.getElementById('pomodoro-label');
    const ringEl = document.getElementById('pomodoro-ring-progress');

    if (timeEl) timeEl.textContent = formatTime(pomodoroState.timeLeft);
    if (labelEl) labelEl.textContent = pomodoroState.isWork ? '专注时间' : '休息时间';

    // 更新环形进度
    if (ringEl) {
      const progress = 1 - (pomodoroState.timeLeft / pomodoroState.totalTime);
      const offset = RING_CIRCUMFERENCE * (1 - progress);
      ringEl.style.strokeDashoffset = offset;
      ringEl.classList.toggle('rest', !pomodoroState.isWork);
    }
  }

  async function updatePomodoroCount() {
    const countEl = document.getElementById('pomodoro-count-number');
    if (!countEl) return;
    try {
      const todayStr = formatDate(new Date());
      const allPomodoros = await Storage.getAll('pomodoros');
      const todayCount = allPomodoros.filter((p) => p.date === todayStr && p.type === 'work').length;
      countEl.textContent = todayCount;
    } catch (err) {
      countEl.textContent = '0';
    }
  }

  function renderPomodoroTaskSelect() {
    const select = document.getElementById('pomodoro-task-select');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- 不关联任务 --</option>';
    const todoTasks = allTasks.filter((t) => t.status === 'todo');
    todoTasks.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.title;
      select.appendChild(opt);
    });
    // 尝试恢复之前选择
    if (currentVal) select.value = currentVal;
  }

  async function renderPomodoroHistory() {
    const listEl = document.getElementById('pomodoro-history-list');
    const emptyEl = document.getElementById('pomodoro-history-empty');
    if (!listEl) return;

    try {
      const todayStr = formatDate(new Date());
      const allPomodoros = await Storage.getAll('pomodoros');
      const todayRecords = allPomodoros
        .filter((p) => p.date === todayStr)
        .reverse(); // 最新的在前

      if (todayRecords.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = '';
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';

      listEl.innerHTML = todayRecords.map((p) => {
        const taskName = p.taskId ? allTasks.find((t) => t.id === p.taskId)?.title : '';
        const emoji = p.type === 'work' ? '🍅' : '☕';
        const typeLabel = p.type === 'work' ? `${p.duration}分钟专注` : '5分钟休息';
        return `
          <div class="pomodoro-record">
            <div class="pomodoro-record-left">
              <span class="pomodoro-record-emoji">${emoji}</span>
              <span>${typeLabel}</span>
              ${taskName ? `<span class="pomodoro-record-task">· ${escapeHtml(taskName)}</span>` : ''}
            </div>
            <span class="pomodoro-record-time">${p.startTime || ''}</span>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('[Tasks] 渲染番茄记录失败:', err);
    }
  }


  // ===== 矩阵视图渲染 =====
  function renderMatrixView() {
    const gridEl = document.getElementById('matrix-grid');
    if (!gridEl) return;

    const todoTasks = allTasks.filter(t => t.status === 'todo');

    const quadrants = [
      { key: 'A', icon: '🔥', title: '紧急重要', subtitle: '立即做' },
      { key: 'B', icon: '📌', title: '重要不紧急', subtitle: '计划做' },
      { key: 'C', icon: '⚡', title: '紧急不重要', subtitle: '授权做' },
      { key: 'D', icon: '💤', title: '不紧急不重要', subtitle: '选择做' },
    ];

    gridEl.innerHTML = quadrants.map(q => {
      const tasks = todoTasks.filter(t => t.priority === q.key);
      return `
        <div class="matrix-quadrant" data-priority="${q.key}">
          <div class="matrix-quadrant-header">
            <span class="matrix-quadrant-icon">${q.icon}</span>
            <div class="matrix-quadrant-title">
              <span class="matrix-quadrant-name">${q.title}</span>
              <span class="matrix-quadrant-subtitle">${q.subtitle}</span>
            </div>
            <span class="matrix-count">${tasks.length}</span>
          </div>
          <div class="matrix-quadrant-tasks">
            ${tasks.length === 0 ? '<div class="matrix-empty">暂无任务</div>' :
              tasks.map(t => `
                <div class="matrix-task" data-task-id="${t.id}">
                  <div class="matrix-task-check task-checkbox" data-task-id="${t.id}"></div>
                  <span class="matrix-task-title">${escapeHtml(t.title)}</span>
                </div>
              `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // ===== 周计划视图渲染 =====
  function getVisibleDays() {
    return window.innerWidth > 768 ? 7 : 3;
  }

  function getWeeklyStart() {
    const today = new Date();
    const visibleDays = getVisibleDays();

    if (visibleDays >= 7) {
      // 整周显示，从周一开始
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset + (weeklyViewOffset * 7));
      monday.setHours(0, 0, 0, 0);
      return monday;
    } else {
      // 3天显示，以今天为中心
      const start = new Date(today);
      start.setDate(today.getDate() - 1 + (weeklyViewOffset * 3));
      start.setHours(0, 0, 0, 0);
      return start;
    }
  }

  function renderWeeklyView() {
    const columnsEl = document.getElementById('weekly-columns');
    const labelEl = document.getElementById('weekly-label');
    if (!columnsEl) return;

    const visibleDays = getVisibleDays();
    const startDate = getWeeklyStart();
    const todayStr = formatDate(new Date());
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

    // 更新导航标签
    if (labelEl) {
      if (weeklyViewOffset === 0) {
        labelEl.textContent = visibleDays >= 7 ? '本周' : '今天';
      } else {
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + visibleDays - 1);
        labelEl.textContent = `${formatDisplayDate(formatDate(startDate))} – ${formatDisplayDate(formatDate(endDate))}`;
      }
    }

    // 生成日期列
    let html = '';
    for (let i = 0; i < visibleDays; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      const dateStr = formatDate(day);
      const isToday = dateStr === todayStr;
      const dayName = dayNames[day.getDay()];
      const displayDate = `${day.getMonth() + 1}/${day.getDate()}`;

      // 按 dueDate 筛选任务；无 dueDate 则用 date（创建日期）
      const dayTasks = allTasks.filter(t => {
        if (t.status !== 'todo') return false;
        const taskDate = t.dueDate || t.date;
        return taskDate === dateStr;
      });

      // 排序：按优先级
      const sorted = [...dayTasks].sort((a, b) => {
        const order = { A: 0, B: 1, C: 2, D: 3 };
        return (order[a.priority] || 3) - (order[b.priority] || 3);
      });

      html += `
        <div class="weekly-column${isToday ? ' weekly-today' : ''}">
          <div class="weekly-column-header">
            <span class="weekly-day-name">周${dayName}</span>
            <span class="weekly-day-date${isToday ? ' weekly-today-date' : ''}">${displayDate}</span>
          </div>
          <div class="weekly-column-tasks">
            ${sorted.length === 0 ? '<div class="weekly-empty">—</div>' :
              sorted.map(t => `
                <div class="weekly-task" data-task-id="${t.id}">
                  <span class="task-priority-dot priority-${t.priority || 'D'}"></span>
                  <span class="weekly-task-title">${escapeHtml(t.title)}</span>
                </div>
              `).join('')}
          </div>
        </div>
      `;
    }

    columnsEl.innerHTML = html;
  }

  // ===== 周计划事件绑定 =====
  function bindWeeklyEvents() {
    // 前进/后退按钮
    _bindEvent(document.getElementById('weekly-prev'), 'click', () => {
      weeklyViewOffset--;
      renderWeeklyView();
    });
    _bindEvent(document.getElementById('weekly-next'), 'click', () => {
      weeklyViewOffset++;
      renderWeeklyView();
    });

    // 触摸滑动导航
    const columnsEl = document.getElementById('weekly-columns');
    if (!columnsEl) return;

    let startX = 0;
    let isDragging = false;

    _bindEvent(columnsEl, 'touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    }, { passive: true });

    _bindEvent(columnsEl, 'touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      const endX = e.changedTouches[0].clientX;
      const delta = endX - startX;
      if (Math.abs(delta) > 50) {
        weeklyViewOffset += (delta < 0 ? 1 : -1);
        renderWeeklyView();
      }
    }, { passive: true });
  }


  // ===== 购物车模块 =====

  function bindShoppingEvents() {
    // 弹窗关闭/取消
    _bindEvent(document.getElementById('shopping-modal-close'), 'click', hideShoppingModal);
    _bindEvent(document.getElementById('shopping-btn-cancel'), 'click', hideShoppingModal);
    _bindEvent(document.getElementById('shopping-modal-overlay'), 'click', (e) => {
      if (e.target.id === 'shopping-modal-overlay') hideShoppingModal();
    });
    // 确认按钮
    _bindEvent(document.getElementById('shopping-btn-confirm'), 'click', handleShoppingSubmit);

    // 优先级选择
    _bindEvent(document.getElementById('shopping-priority-picker'), 'click', (e) => {
      const btn = e.target.closest('.shopping-priority-btn');
      if (btn) setShoppingPriority(btn.dataset.priority);
    });

    // 筛选
    _bindEvent(document.getElementById('shopping-filters'), 'click', (e) => {
      const btn = e.target.closest('.shopping-filter-btn');
      if (!btn) return;
      shoppingFilter = btn.dataset.filter;
      document.getElementById('shopping-filters').querySelectorAll('.shopping-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderShopping();
    });

    // 排序
    _bindEvent(document.getElementById('shopping-sort'), 'change', (e) => {
      shoppingSort = e.target.value;
      renderShopping();
    });

    // 分类输入：显示历史分类标签
    _bindEvent(document.getElementById('shopping-category-input'), 'focus', renderCategoryTags);
    _bindEvent(document.getElementById('shopping-category-input'), 'input', renderCategoryTags);
    // 点击历史分类标签快速填入
    _bindEvent(document.getElementById('shopping-category-tags'), 'click', (e) => {
      const tag = e.target.closest('.shopping-category-tag');
      if (tag) {
        document.getElementById('shopping-category-input').value = tag.textContent;
      }
    });
  }

  function setShoppingPriority(priority) {
    const picker = document.getElementById('shopping-priority-picker');
    if (!picker) return;
    picker.querySelectorAll('.shopping-priority-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.priority === priority);
    });
  }

  function getShoppingPriority() {
    const picker = document.getElementById('shopping-priority-picker');
    if (!picker) return 'medium';
    const active = picker.querySelector('.shopping-priority-btn.active');
    return active ? active.dataset.priority : 'medium';
  }

  function showShoppingModal(itemId) {
    const overlay = document.getElementById('shopping-modal-overlay');
    const titleEl = document.getElementById('shopping-modal-title');
    if (!overlay) return;

    if (itemId) {
      // 编辑模式
      const item = shoppingItems.find((s) => s.id === itemId);
      if (!item) return;
      editingShoppingId = itemId;
      if (titleEl) titleEl.textContent = '编辑物品';
      document.getElementById('shopping-name-input').value = item.name || '';
      document.getElementById('shopping-price-input').value = item.price || '';
      document.getElementById('shopping-category-input').value = item.category || '';
      document.getElementById('shopping-link-input').value = item.link || '';
      document.getElementById('shopping-note-input').value = item.note || '';
      setShoppingPriority(item.priority || 'medium');
    } else {
      // 新增模式
      editingShoppingId = null;
      if (titleEl) titleEl.textContent = '添加物品';
      document.getElementById('shopping-name-input').value = '';
      document.getElementById('shopping-price-input').value = '';
      document.getElementById('shopping-category-input').value = '';
      document.getElementById('shopping-link-input').value = '';
      document.getElementById('shopping-note-input').value = '';
      setShoppingPriority('medium');
    }

    renderCategoryTags();
    overlay.classList.add('show');
    setTimeout(() => document.getElementById('shopping-name-input')?.focus(), 200);
  }

  function hideShoppingModal() {
    const overlay = document.getElementById('shopping-modal-overlay');
    if (overlay) overlay.classList.remove('show');
    editingShoppingId = null;
  }

  function renderCategoryTags() {
    const container = document.getElementById('shopping-category-tags');
    if (!container) return;
    // 从现有数据中收集去重的分类
    const categories = [...new Set(
      shoppingItems
        .map((s) => (s.category || '').trim())
        .filter((c) => c)
    )];
    if (categories.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = categories
      .map((c) => `<span class="shopping-category-tag">${escapeHtml(c)}</span>`)
      .join('');
  }

  async function handleShoppingSubmit() {
    const name = document.getElementById('shopping-name-input')?.value.trim();
    if (!name) {
      if (window.App?.showToast) window.App?.showToast('请输入物品名称');
      return;
    }

    const priceStr = document.getElementById('shopping-price-input')?.value;
    const price = priceStr ? parseFloat(priceStr) : 0;
    const category = document.getElementById('shopping-category-input')?.value.trim() || '';
    const priority = getShoppingPriority();
    const link = document.getElementById('shopping-link-input')?.value.trim() || '';
    const note = document.getElementById('shopping-note-input')?.value.trim() || '';

    if (editingShoppingId) {
      // 编辑
      const item = shoppingItems.find((s) => s.id === editingShoppingId);
      if (!item) return;
      item.name = name;
      item.price = price || 0;
      item.category = category;
      item.priority = priority;
      item.link = link;
      item.note = note;
      try {
        await Storage.put('shopping_items', item);
        hideShoppingModal();
        renderShopping();
        if (window.App?.showToast) window.App?.showToast('已保存 ✅');
      } catch (err) {
        console.error('[Tasks] 保存购物项失败:', err);
      }
    } else {
      // 新增
      const item = {
        name,
        price: price || 0,
        category,
        priority,
        link,
        note,
        status: 'pending',
        createdAt: new Date().toISOString(),
        boughtAt: null,
      };
      try {
        const id = await Storage.add('shopping_items', item);
        item.id = id;
        shoppingItems.push(item);
        hideShoppingModal();
        renderShopping();
        if (window.App?.showToast) window.App?.showToast('已添加到购物车 🛒');
      } catch (err) {
        console.error('[Tasks] 添加购物项失败:', err);
        if (window.App?.showToast) window.App?.showToast('添加失败，请重试');
      }
    }
  }

  async function toggleShoppingStatus(itemId) {
    const item = shoppingItems.find((s) => s.id === itemId);
    if (!item) return;
    if (item.status === 'pending') {
      item.status = 'bought';
      item.boughtAt = new Date().toISOString();
    } else {
      item.status = 'pending';
      item.boughtAt = null;
    }
    try {
      await Storage.put('shopping_items', item);
      renderShopping();
    } catch (err) {
      console.error('[Tasks] 更新购物项状态失败:', err);
    }
  }

  async function deleteShoppingItem(itemId) {
    if (!confirm('确定删除这个物品吗？')) return;
    try {
      await Storage.remove('shopping_items', itemId);
      shoppingItems = shoppingItems.filter((s) => s.id !== itemId);
      renderShopping();
      if (window.App?.showToast) window.App?.showToast('已删除');
    } catch (err) {
      console.error('[Tasks] 删除购物项失败:', err);
    }
  }

  function renderShopping() {
    // 汇总栏
    const pendingItems = shoppingItems.filter((s) => s.status === 'pending');
    const pendingCount = pendingItems.length;
    const pendingTotal = pendingItems.reduce((sum, s) => sum + (s.price || 0), 0);
    const countEl = document.getElementById('shopping-pending-count');
    const totalEl = document.getElementById('shopping-pending-total');
    if (countEl) countEl.textContent = pendingCount;
    if (totalEl) totalEl.textContent = `¥${pendingTotal.toFixed(2)}`;

    // 筛选
    let items = shoppingItems;
    if (shoppingFilter === 'pending') {
      items = items.filter((s) => s.status === 'pending');
    } else if (shoppingFilter === 'bought') {
      items = items.filter((s) => s.status === 'bought');
    }

    // 排序
    items = [...items];
    if (shoppingSort === 'priority') {
      const order = { high: 0, medium: 1, low: 2 };
      items.sort((a, b) => {
        // 待购买排在已购买前面
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return (order[a.priority] || 1) - (order[b.priority] || 1);
      });
    } else {
      // 按时间排序（新的在前）
      items.sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });
    }

    const listEl = document.getElementById('shopping-list');
    const emptyEl = document.getElementById('shopping-empty');
    if (!listEl) return;

    if (items.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = items.map((item) => renderShoppingItem(item)).join('');
  }

  function renderShoppingItem(item) {
    const isBought = item.status === 'bought';
    const priorityCfg = SHOPPING_PRIORITY_CONFIG[item.priority] || SHOPPING_PRIORITY_CONFIG.medium;
    const priorityLabel = priorityCfg.label;
    const priceText = item.price > 0 ? `¥${item.price.toFixed(2)}` : '';

    // 操作按钮
    let actionBtns;
    if (isBought) {
      actionBtns = `
        <button class="shopping-action-btn shopping-action-btn--restore" data-id="${item.id}">↩ 恢复</button>
        <button class="shopping-action-btn shopping-action-btn--delete" data-id="${item.id}">🗑️ 删除</button>`;
    } else {
      actionBtns = `
        <button class="shopping-action-btn shopping-action-btn--done" data-id="${item.id}">✓ 已买</button>
        <button class="shopping-action-btn shopping-action-btn--delete" data-id="${item.id}">🗑️ 删除</button>`;
    }

    // 购买链接
    const linkHtml = item.link
      ? `<a class="shopping-item-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">🔗 ${escapeHtml(item.link)}</a>`
      : '';

    // 备注
    const noteHtml = item.note
      ? `<div class="shopping-item-note">${escapeHtml(item.note)}</div>`
      : '';

    return `
      <div class="shopping-item${isBought ? ' bought' : ''}">
        <div class="shopping-item-top">
          <div class="shopping-item-name" data-id="${item.id}">${escapeHtml(item.name)}</div>
          ${priceText ? `<div class="shopping-item-price">${priceText}</div>` : ''}
        </div>
        <div class="shopping-item-tags">
          ${item.category ? `<span class="shopping-tag shopping-tag-category">${escapeHtml(item.category)}</span>` : ''}
          <span class="shopping-tag shopping-tag-priority-${item.priority || 'medium'}">${priorityLabel}</span>
        </div>
        ${linkHtml}
        ${noteHtml}
        <div class="shopping-item-actions">${actionBtns}</div>
      </div>
    `;
  }

  // ===== 初始化事件委托 =====
  function init() {
    console.log('[Tasks] 任务模块初始化...');
    bindTabEvents();
    bindFabEvents();
    bindModalEvents();
    bindFilterEvents();
    bindPomodoroEvents();
    bindDetailEvents();
    bindListClickEvents();
    bindWeeklyEvents();
    bindShoppingEvents();
    loadData().then(() => {
      renderAll();
      // 确保 pomodoro 显示与当前状态同步（路由切换后恢复）
      updatePomodoroDisplay();
    });
  }

  // ===== 跨模块智能关联 =====
  let _taskCreateCrossLinkBound = false;
  let _taskEditCrossLinkBound = false;

  function _bindCrossLinkForTaskCreate() {
    const nameInput = document.getElementById('task-name-input');
    if (!nameInput || _taskCreateCrossLinkBound) return;
    _taskCreateCrossLinkBound = true;

    _bindEvent(nameInput, 'input', () => {
      const text = nameInput.value.trim();
      if (true && text.length >= 2) {
        CrossLinker.showSuggestions(text, 'tasks', 'tasks-create-suggestions');
      } else if (true) /* CrossLinker always available via import */ {
        CrossLinker.hideSuggestions('tasks-create-suggestions');
      }
    });
  }

  function _bindCrossLinkForTaskEdit() {
    const nameInput = document.getElementById('edit-task-name');
    if (!nameInput || _taskEditCrossLinkBound) return;
    _taskEditCrossLinkBound = true;

    _bindEvent(nameInput, 'input', () => {
      const text = nameInput.value.trim();
      if (true && text.length >= 2) {
        CrossLinker.showSuggestions(text, 'tasks', 'tasks-edit-suggestions', editingTaskId);
      } else if (true) /* CrossLinker always available via import */ {
        CrossLinker.hideSuggestions('tasks-edit-suggestions');
      }
    });

    // 初始化时也触发一次（编辑已有内容时）
    const text = nameInput.value.trim();
    if (true && text.length >= 2) {
      CrossLinker.showSuggestions(text, 'tasks', 'tasks-edit-suggestions', editingTaskId);
    }
  }

  /**
   * 模块销毁：清理事件监听器和定时器，防止内存泄漏
   */
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    if (pomodoroState.intervalId) {
      clearInterval(pomodoroState.intervalId);
      pomodoroState.intervalId = null;
    }
    pomodoroState.running = false;
    TimeTrackerSub.destroy();
    console.log('[Tasks] 模块已销毁');
  }

  // ====================================================
  //  时间记录子模块（原 timetracker 模块）
  // ====================================================
  const TimeTrackerSub = (() => {
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
    let _ttEventListeners = [];
    let _initialized = false;

    function _ttBindEvent(el, event, handler) {
      if (el) { el.addEventListener(event, handler); _ttEventListeners.push({ el, event, handler }); }
    }

    async function init() {
      if (_initialized) return;
      _initialized = true;
      console.log('[Tasks/TimeTracker] 时间记录子模块初始化');
      await renderData();
      bindEvents();
      await checkActiveEntry();
    }

    function bindEvents() {
      const startBtn = document.getElementById('tt-start-btn');
      const manualBtn = document.getElementById('tt-manual-btn');
      const stopBtn = document.getElementById('tt-stop-btn');

      if (startBtn) _ttBindEvent(startBtn, 'click', showCategoryModal);
      if (manualBtn) _ttBindEvent(manualBtn, 'click', showManualModal);
      if (stopBtn) _ttBindEvent(stopBtn, 'click', stopTracking);

      const catClose = document.getElementById('tt-cat-close');
      if (catClose) _ttBindEvent(catClose, 'click', hideCategoryModal);
      document.getElementById('tt-cat-grid')?.querySelectorAll('.tt-cat-btn').forEach(btn => {
        _ttBindEvent(btn, 'click', () => {
          const cat = btn.dataset.cat;
          hideCategoryModal();
          startTracking(cat);
        });
      });

      const manualClose = document.getElementById('tt-manual-close');
      const manualCancel = document.getElementById('tt-manual-cancel');
      const manualConfirm = document.getElementById('tt-manual-confirm');
      if (manualClose) _ttBindEvent(manualClose, 'click', hideManualModal);
      if (manualCancel) _ttBindEvent(manualCancel, 'click', hideManualModal);
      if (manualConfirm) _ttBindEvent(manualConfirm, 'click', submitManualEntry);
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
        console.warn('[Tasks/TimeTracker] Storage.put 失败:', e);
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
        if (window.AuditLog) window.AuditLog?.log({ type: 'time_entry', source: 'tasks_timetracker', params: { category: entry.category, duration }, result: 'success' });
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
        console.warn('[Tasks/TimeTracker] Storage.getByIndex 失败:', e);
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
        console.warn('[Tasks/TimeTracker] Storage.getByIndex 失败:', e);
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
        console.warn('[Tasks/TimeTracker] Storage.getAll 失败:', e);
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

      recordsEl.querySelectorAll('.tt-record-del').forEach(btn => {
        _ttBindEvent(btn, 'click', async () => {
          const id = parseInt(btn.dataset.id);
          if (id) {
            try {
              await Storage.remove('time_entries', id);
            } catch(e) {
              console.warn('[Tasks/TimeTracker] Storage.remove 失败:', e);
            }
            await renderData();
          }
        });
      });
    }

    function destroy() {
      _ttEventListeners.forEach(({ el, event, handler }) => {
        try { el.removeEventListener(event, handler); } catch (e) {}
      });
      _ttEventListeners = [];
      stopElapsedTimer();
      _initialized = false;
      console.log('[Tasks/TimeTracker] 子模块已销毁');
    }

    return { init, destroy };
  })();

  return { init, destroy };
})();
