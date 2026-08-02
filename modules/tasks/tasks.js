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
  // escapeHtml 已在顶部从 AppUtils 导入
  // function escapeHtml(str) { ... }

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
        footer.style.display = (tabName === 'projects' || tabName === 'pomodoro') ? 'none' : 'flex';
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
    console.log('[Tasks] 模块已销毁');
  }

  return { init, destroy };
})();
