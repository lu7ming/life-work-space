/**
 * smart-focus-widget.js - 智能聚焦组件
 * 人生工作台 · 根据时段自动切换首页内容
 * 包含：智能聚焦卡片、智能建议、猜你想做
 * 从 Dashboard 拆分而出 (v125)
 */
import { AppUtils } from '../../../core/utils.js';
import { Storage } from '../../../core/storage.js';
import { EventBus } from '../../../core/event-bus.js';

const SmartFocusWidget = (() => {
  const { escapeHtml, getTodayStr } = AppUtils;

  // ===== 事件监听管理 =====
  let _eventListeners = [];
  let _smartFocusTimer = null;

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  const TIME_PERIODS = [
    { id: 'morning',   label: '早间聚焦', icon: '🌅', start: 6,  end: 12 },
    { id: 'noon',      label: '午间聚焦', icon: '☀️', start: 12, end: 14 },
    { id: 'afternoon', label: '下午聚焦', icon: '🌤️', start: 14, end: 18 },
    { id: 'evening',   label: '晚间聚焦', icon: '🌙', start: 18, end: 23 },
    { id: 'night',     label: '深夜提示', icon: '⭐', start: 23, end: 6  }
  ];

  // ===== 智能聚焦：激励文案库 =====
  const MOTIVATION_QUOTES = [
    '新的一天，新的可能，去创造属于你的精彩 ✨',
    '把每一次练习都当作舞台，舞台就会给你回报 🎤',
    '慢慢来，比较快。专注当下这一步就好 🌿',
    '你比昨天更接近目标了，哪怕只是一小步 🏔️',
    '呼吸、专注、行动，一切都会水到渠成 💫',
    '今天的选择，决定明天的你。加油！ 💪',
    '不必事事完美，但求事事用心 🎯',
    '声音需要日积月累，你已经走在路上了 🎵',
    '给自己一个微笑，你值得被温柔对待 😊',
    '困难是暂时的，成长是永久的 🌱',
    '专注做好眼前的事，未来自然会有答案 🔮',
    '每一天都是一次新的排练，尽情发挥吧 🎭',
    '保持节奏，不急不躁，稳稳前行 🚶',
    '你的努力，时光都看得见 ⏳',
    '先完成，再完美。开始就是胜利 🏁',
    '相信过程，享受当下的每一刻 🌸',
    '把大目标拆成小步骤，每一步都算数 📝',
    '休息也是前进的一部分，别忘了善待自己 ☕',
    '勇敢做自己，世界需要你独特的声音 🎶',
    '今天也要做个闪闪发光的人呀 ⭐'
  ];

  // ===== Widget类型定义 =====
  const WIDGET_TYPES = {
    'progress-ring': {
      name: '进度环',
      icon: '⭕',
      description: '今日习惯完成进度',
      defaultSize: 1 // 1列宽
    },
    'mini-line-chart': {
      name: '迷你折线图',
      icon: '📈',
      description: '近7天趋势',
      defaultSize: 2 // 2列宽
    },
    'counter': {
      name: '计数器',
      icon: '🔢',
      description: '连续打卡/任务完成数',
      defaultSize: 1
    },
    'list-widget': {
      name: '列表',
      icon: '📋',
      description: '今日待办/近期灵感',
      defaultSize: 2
    },
    'chart-widget': {
      name: '饼图',
      icon: '🥧',
      description: '本月收支占比',
      defaultSize: 1
    },
    'achievements-widget': {
      name: '成就',
      icon: '🏆',
      description: '成就进度概览',
      defaultSize: 1
    },
    'lifetree-widget': {
      name: '生命树',
      icon: '🌳',
      description: '生命成长可视化',
      defaultSize: 1
    }
  };

  // ===== 预设布局方案 =====
  const WIDGET_PRESETS = {
    simple: [
      { type: 'progress-ring', size: 1 },
      { type: 'counter', size: 1 }
    ],
    rich: [
      { type: 'progress-ring', size: 1 },
      { type: 'counter', size: 1 },
      { type: 'mini-line-chart', size: 2 },
      { type: 'list-widget', size: 2 }
    ],
    data: [
      { type: 'progress-ring', size: 1 },
      { type: 'counter', size: 1 },
      { type: 'mini-line-chart', size: 2 },
      { type: 'chart-widget', size: 1 },
      { type: 'counter', size: 1, config: { metric: 'task_count' } },
      { type: 'list-widget', size: 2 }
    ]
  };

  // ===== 默认Widget配置 =====
  const DEFAULT_WIDGET_CONFIG = [
    { type: 'progress-ring', size: 1, id: 'w_progress_1' },
    { type: 'counter', size: 1, id: 'w_counter_1' },
    { type: 'mini-line-chart', size: 2, id: 'w_line_1' },
    { type: 'list-widget', size: 2, id: 'w_list_1' }
  ];

  /**
   * 初始化总面板
   */
  // 加载 widget 组件样式
  function _loadWidgetStyles() {
    if (document.getElementById('dashboard-widgets-css')) return;
    const link = document.createElement('link');
    link.id = 'dashboard-widgets-css';
    link.rel = 'stylesheet';
    link.href = 'modules/dashboard/widgets/widgets.css';
    document.head.appendChild(link);
  }

  async function init() {
    console.log('[Dashboard] 初始化总面板...');
    _loadWidgetStyles();
    try {
      await Promise.all([
        renderGreeting(),
        renderWeatherLunar(),
        renderDailyGua(),
        renderCountdown(),
        renderCalendar(),
        renderHighlights(),
        renderDailyRecommend(),
        renderTextRecommend(),
        renderBirthdayReminder(),
        renderFeed(),
        renderFocusCard(),
        renderTemplateReminder(),
        renderSmartSuggestions(),
        renderPredictiveActions(),
        renderSmartFocus(),
        initWidgetSystem(),
        renderTravelCard(),
        renderNianNian()
      ]);
      bindFocusEvents();
      bindAnnualEvents();
      bindWidgetEvents();
      bindCalendarEvents();
      startSmartFocusTimer();
    } catch (err) {
      console.error('[Dashboard] 初始化失败:', err);
      if (window.App) window.App?.showToast('总览加载失败，请刷新重试');
    }
  }

  /**
   * ===== 智能聚焦系统 =====
   * 根据当前时段自动切换首页内容
   */

  /**
   * 获取当前时段
   */
  function getCurrentPeriod() {
    const hour = new Date().getHours();
    for (const period of TIME_PERIODS) {
      if (period.start < period.end) {
        if (hour >= period.start && hour < period.end) return period;
      } else {
        // 跨午夜时段（如23:00-06:00）
        if (hour >= period.start || hour < period.end) return period;
      }
    }
    return TIME_PERIODS[0]; // 默认早间
  }

  /**
   * 读取智能聚焦所需的用户数据
   */
  async function getSmartFocusData() {
    const todayStr = getTodayStr();
    const data = { tasks: [], habits: [], habitRecords: {}, shootings: [], published: [], courses: [] };

    try {
      // 任务数据
      const allTasks = await Storage.getAll('tasks');
      data.tasks = allTasks || [];
    } catch (e) { console.warn('[SmartFocus] 读取任务失败:', e); }

    try {
      // 习惯数据
      const allHabits = await Storage.getAll('habits');
      data.habits = allHabits || [];
    } catch (e) { console.warn('[SmartFocus] 读取习惯失败:', e); }

    try {
      // 习惯打卡记录（今天）
      const checkin = await Storage.get('checkins', todayStr);
      data.habitRecords = checkin || {};
    } catch (e) { console.warn('[SmartFocus] 读取习惯记录失败:', e); }

    try {
      // 创作拍摄计划
      const allShootings = await Storage.getAll('content_shootings');
      data.shootings = allShootings || [];
    } catch (e) { console.warn('[SmartFocus] 读取拍摄计划失败:', e); }

    try {
      // 已发布内容
      const allPublished = await Storage.getAll('content_published');
      data.published = allPublished || [];
    } catch (e) { console.warn('[SmartFocus] 读取发布内容失败:', e); }

    try {
      // 课程数据
      const allCourses = await Storage.getAll('courses');
      data.courses = allCourses || [];
    } catch (e) { console.warn('[SmartFocus] 读取课程失败:', e); }

    return data;
  }

  /**
   * 渲染智能聚焦卡片
   */
  async function renderSmartFocus() {
    const container = document.getElementById('dash-smart-focus');
    if (!container) return;

    const period = getCurrentPeriod();
    const data = await getSmartFocusData();

    // 深夜模式：只显示休息提醒
    if (period.id === 'night') {
      container.style.display = '';
      container.innerHTML = renderNightFocus(period);
      return;
    }

    let bodyHTML = '';
    switch (period.id) {
      case 'morning':
        bodyHTML = renderMorningFocus(data);
        break;
      case 'noon':
        bodyHTML = renderNoonFocus(data);
        break;
      case 'afternoon':
        bodyHTML = renderAfternoonFocus(data);
        break;
      case 'evening':
        bodyHTML = renderEveningFocus(data);
        break;
    }

    if (!bodyHTML) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    container.innerHTML = `
      <div class="dash-smart-focus-header">
        <span class="dash-smart-focus-icon">${period.icon}</span>
        <span class="dash-smart-focus-title">${period.label}</span>
        <span class="dash-smart-focus-period">${getTimeRangeLabel(period)}</span>
      </div>
      <div class="dash-smart-focus-body">${bodyHTML}</div>
    `;

    // 绑定习惯打卡事件
    bindSmartFocusHabitEvents(data);
  }

  /**
   * 获取时段的时间范围文本
   */
  function getTimeRangeLabel(period) {
    const startStr = String(period.start).padStart(2, '0') + ':00';
    const endStr = String(period.end).padStart(2, '0') + ':00';
    return `${startStr} - ${endStr}`;
  }

  /**
   * 早间聚焦渲染
   */
  function renderMorningFocus(data) {
    const todayStr = getTodayStr();
    let html = '';

    // 1) 今日待办 Top3（A/B 优先级未完成任务）
    const priorityTasks = data.tasks
      .filter(t => t.status !== 'done' && t.status !== 'completed' && (t.priority === 'A' || t.priority === 'B'))
      .sort((a, b) => {
        const order = { A: 1, B: 2 };
        return (order[a.priority] || 9) - (order[b.priority] || 9);
      })
      .slice(0, 3);

    if (priorityTasks.length > 0) {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">📌 今日待办 Top3</div>
        ${priorityTasks.map(t => {
          const pClass = `priority-${t.priority || 'C'}`;
          const pLabel = t.priority === 'A' ? '紧急' : '重要';
          return `<div class="dash-smart-focus-task">
            <span class="dash-smart-focus-task-icon">📋</span>
            <span class="dash-smart-focus-task-text">${escapeHtml(t.title || '未命名')}</span>
            <span class="dash-smart-focus-task-badge ${pClass}">${pLabel}</span>
          </div>`;
        }).join('')}
      </div>`;
    }

    // 2) 今日习惯清单（未完成的习惯打勾项）
    const checkedHabits = data.habitRecords.habits || [];
    const habitList = (data.habits && data.habits.length > 0) ? data.habits : getDefaultHabits();
    const uncheckedHabits = habitList.filter(h => !checkedHabits.includes(h.id));
    const checkedHabitList = habitList.filter(h => checkedHabits.includes(h.id));

    if (habitList.length > 0) {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">✅ 今日习惯</div>
        ${uncheckedHabits.map(h => `
          <div class="dash-smart-focus-habit" data-habit-id="${escapeHtml(h.id)}">
            <div class="dash-smart-focus-habit-check"></div>
            <span class="dash-smart-focus-habit-emoji">${h.emoji || '🔹'}</span>
            <span class="dash-smart-focus-habit-name">${escapeHtml(h.name || h.id)}</span>
          </div>
        `).join('')}
        ${checkedHabitList.map(h => `
          <div class="dash-smart-focus-habit completed" data-habit-id="${escapeHtml(h.id)}">
            <div class="dash-smart-focus-habit-check">✓</div>
            <span class="dash-smart-focus-habit-emoji">${h.emoji || '🔹'}</span>
            <span class="dash-smart-focus-habit-name">${escapeHtml(h.name || h.id)}</span>
          </div>
        `).join('')}
      </div>`;
    }

    // 3) 一句话激励
    const quote = MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
    html += `<div class="dash-smart-focus-section">
      <div class="dash-smart-focus-motivation">${quote}</div>
    </div>`;

    return html;
  }

  /**
   * 午间聚焦渲染
   */
  function renderNoonFocus(data) {
    const todayStr = getTodayStr();
    let html = '';

    // 1) 上午完成进度
    const todayTasks = data.tasks.filter(t => t.date === todayStr || !t.date);
    const doneTasks = todayTasks.filter(t => t.status === 'done' || t.status === 'completed');
    const totalTasks = todayTasks.length;
    const doneCount = doneTasks.length;
    const progressPct = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;

    html += `<div class="dash-smart-focus-section">
      <div class="dash-smart-focus-section-title">📊 上午完成进度</div>
      <div class="dash-smart-focus-progress">
        <div class="dash-smart-focus-progress-bar">
          <div class="dash-smart-focus-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <div class="dash-smart-focus-progress-text">
          <span>已完成 ${doneCount} / ${totalTasks} 项</span>
          <span>${progressPct}%</span>
        </div>
      </div>
    </div>`;

    // 2) 下午建议：如果有拍摄计划，提示拍摄安排
    const todayShootings = data.shootings.filter(s => s.date === todayStr);
    const tomorrowStr = getTomorrowStr();
    const tomorrowShootings = data.shootings.filter(s => s.date === tomorrowStr);

    if (todayShootings.length > 0) {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">🎬 今日拍摄计划</div>
        ${todayShootings.map(s => `
          <div class="dash-smart-focus-task">
            <span class="dash-smart-focus-task-icon">🎥</span>
            <span class="dash-smart-focus-task-text">${escapeHtml(s.note || s.topicId || '拍摄计划')}${s.time ? ' ' + escapeHtml(s.time) : ''}</span>
          </div>
        `).join('')}
      </div>`;
    }

    if (tomorrowShootings.length > 0) {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">📅 明日拍摄预告</div>
        ${tomorrowShootings.map(s => `
          <div class="dash-smart-focus-task">
            <span class="dash-smart-focus-task-icon">🎥</span>
            <span class="dash-smart-focus-task-text">${escapeHtml(s.note || s.topicId || '拍摄计划')}${s.time ? ' ' + escapeHtml(s.time) : ''}</span>
          </div>
        `).join('')}
      </div>`;
    }

    // 激励
    const quote = MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
    html += `<div class="dash-smart-focus-section">
      <div class="dash-smart-focus-motivation">${quote}</div>
    </div>`;

    return html;
  }

  /**
   * 下午聚焦渲染
   */
  function renderAfternoonFocus(data) {
    const todayStr = getTodayStr();
    let html = '';

    // 1) 进行中任务（status 为 todo 的未完成任务，显示为"进行中"）
    const inProgressTasks = data.tasks
      .filter(t => t.status === 'todo' && (t.date === todayStr || !t.date))
      .slice(0, 5);

    if (inProgressTasks.length > 0) {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">🔄 进行中任务</div>
        ${inProgressTasks.map(t => {
          const pClass = `priority-${t.priority || 'C'}`;
          const pLabel = { A: '紧急', B: '重要', C: '一般', D: '低' }[t.priority] || '';
          return `<div class="dash-smart-focus-task">
            <span class="dash-smart-focus-task-icon">⚡</span>
            <span class="dash-smart-focus-task-text">${escapeHtml(t.title || '未命名')}</span>
            ${pLabel ? `<span class="dash-smart-focus-task-badge ${pClass}">${pLabel}</span>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    } else {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">🔄 进行中任务</div>
        <div class="dash-smart-focus-empty">暂无进行中的任务</div>
      </div>`;
    }

    // 2) 今日创作计划
    const todayShootings = data.shootings.filter(s => s.date === todayStr);
    const todayPublished = data.published.filter(p => p.date === todayStr);

    if (todayShootings.length > 0 || todayPublished.length > 0) {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">🎬 今日创作计划</div>
        ${todayShootings.map(s => `
          <div class="dash-smart-focus-task">
            <span class="dash-smart-focus-task-icon">🎥</span>
            <span class="dash-smart-focus-task-text">${escapeHtml(s.note || s.topicId || '拍摄')}${s.time ? ' · ' + escapeHtml(s.time) : ''}</span>
          </div>
        `).join('')}
        ${todayPublished.map(p => `
          <div class="dash-smart-focus-task">
            <span class="dash-smart-focus-task-icon">📤</span>
            <span class="dash-smart-focus-task-text">${escapeHtml(p.title || p.platform || '发布计划')}</span>
          </div>
        `).join('')}
      </div>`;
    }

    // 激励
    const quote = MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
    html += `<div class="dash-smart-focus-section">
      <div class="dash-smart-focus-motivation">${quote}</div>
    </div>`;

    return html;
  }

  /**
   * 晚间聚焦渲染
   */
  function renderEveningFocus(data) {
    const todayStr = getTodayStr();
    let html = '';

    // 1) 今日完成情况汇总
    const todayTasks = data.tasks.filter(t => t.date === todayStr || !t.date);
    const doneTasks = todayTasks.filter(t => t.status === 'done' || t.status === 'completed');
    const taskTotal = todayTasks.length;
    const taskDone = doneTasks.length;

    const checkedHabits = data.habitRecords.habits || [];
    const habitList = (data.habits && data.habits.length > 0) ? data.habits : getDefaultHabits();
    const habitTotal = habitList.length;
    const habitDone = habitList.filter(h => checkedHabits.includes(h.id)).length;

    const todayShootings = data.shootings.filter(s => s.date === todayStr);
    const todayPublished = data.published.filter(p => p.date === todayStr);
    const creationDone = todayPublished.length > 0;
    const creationTotal = todayShootings.length;

    html += `<div class="dash-smart-focus-section">
      <div class="dash-smart-focus-section-title">📊 今日完成情况</div>
      <div class="dash-smart-focus-stat">
        <span class="dash-smart-focus-stat-icon">📋</span>
        <span class="dash-smart-focus-stat-text">任务完成</span>
        <span class="dash-smart-focus-stat-value ${taskDone === taskTotal && taskTotal > 0 ? 'done' : (taskDone > 0 ? '' : 'pending')}">${taskDone} / ${taskTotal}</span>
      </div>
      <div class="dash-smart-focus-stat">
        <span class="dash-smart-focus-stat-icon">✅</span>
        <span class="dash-smart-focus-stat-text">习惯完成</span>
        <span class="dash-smart-focus-stat-value ${habitDone === habitTotal && habitTotal > 0 ? 'done' : (habitDone > 0 ? '' : 'pending')}">${habitDone} / ${habitTotal}</span>
      </div>
      ${creationTotal > 0 ? `<div class="dash-smart-focus-stat">
        <span class="dash-smart-focus-stat-icon">🎬</span>
        <span class="dash-smart-focus-stat-text">创作内容</span>
        <span class="dash-smart-focus-stat-value ${creationDone ? 'done' : 'pending'}">${creationDone ? '已完成' : '未完成'}</span>
      </div>` : ''}
    </div>`;

    // 2) 未完成项提醒
    const unfinishedTasks = todayTasks.filter(t => t.status !== 'done' && t.status !== 'completed');
    const uncheckedHabits = habitList.filter(h => !checkedHabits.includes(h.id));

    const reminders = [];
    unfinishedTasks.forEach(t => reminders.push({ icon: '📋', text: t.title || '未命名任务' }));
    uncheckedHabits.forEach(h => reminders.push({ icon: h.emoji || '🔹', text: h.name || h.id }));
    if (creationTotal > 0 && !creationDone) reminders.push({ icon: '🎬', text: '创作内容未完成' });

    if (reminders.length > 0) {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">⚠️ 未完成提醒</div>
        ${reminders.slice(0, 5).map(r => `
          <div class="dash-smart-focus-reminder">
            <span>${r.icon}</span>
            <span>${escapeHtml(r.text)}</span>
          </div>
        `).join('')}
      </div>`;
    }

    // 3) 明日预告
    const tomorrowStr = getTomorrowStr();
    const tomorrowCourses = data.courses.filter(c => c.day === getTomorrowDay());
    const tomorrowShootings = data.shootings.filter(s => s.date === tomorrowStr);

    if (tomorrowCourses.length > 0 || tomorrowShootings.length > 0) {
      html += `<div class="dash-smart-focus-section">
        <div class="dash-smart-focus-section-title">📅 明日预告</div>
        ${tomorrowCourses.map(c => `
          <div class="dash-smart-focus-task">
            <span class="dash-smart-focus-task-icon">📚</span>
            <span class="dash-smart-focus-task-text">${escapeHtml(c.name || '课程')}${c.startTime ? ' · ' + escapeHtml(c.startTime) : ''}</span>
          </div>
        `).join('')}
        ${tomorrowShootings.map(s => `
          <div class="dash-smart-focus-task">
            <span class="dash-smart-focus-task-icon">🎥</span>
            <span class="dash-smart-focus-task-text">${escapeHtml(s.note || s.topicId || '拍摄')}${s.time ? ' · ' + escapeHtml(s.time) : ''}</span>
          </div>
        `).join('')}
      </div>`;
    }

    // 激励
    const quote = MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
    html += `<div class="dash-smart-focus-section">
      <div class="dash-smart-focus-motivation">${quote}</div>
    </div>`;

    return html;
  }

  /**
   * 深夜提示渲染
   */
  function renderNightFocus(period) {
    const hour = new Date().getHours();
    const nightMessages = [
      '夜深了，早点休息吧 🌙',
      '辛苦了一天，该让身体充电了 💤',
      '好的睡眠是明天最好的准备 🛏️',
      '放下手机，拥抱好梦 🌜'
    ];
    const msg = nightMessages[hour % nightMessages.length];

    return `
      <div class="dash-smart-focus-header">
        <span class="dash-smart-focus-icon">${period.icon}</span>
        <span class="dash-smart-focus-title">${period.label}</span>
        <span class="dash-smart-focus-period">${getTimeRangeLabel(period)}</span>
      </div>
      <div class="dash-smart-focus-night">
        <div class="dash-smart-focus-night-icon">🌙</div>
        <div class="dash-smart-focus-night-text">${msg}</div>
        <div class="dash-smart-focus-night-sub">明天又是元气满满的一天</div>
      </div>
    `;
  }

  /**
   * 默认习惯列表（当 Storage 无数据时的回退）
   */
  function getDefaultHabits() {
    return [
      { id: 'warm-water',    emoji: '🥤', name: '早起一杯温水' },
      { id: 'breakfast',     emoji: '🍳', name: '吃对早餐' },
      { id: 'exercise',      emoji: '🏃', name: '温和运动' },
      { id: 'drink-water',   emoji: '💧', name: '喝水达标' },
      { id: 'dinner-light',  emoji: '🍽️', name: '晚餐七分饱' },
      { id: 'foot-bath',     emoji: '🦶', name: '温水泡脚' },
      { id: 'early-sleep',   emoji: '😴', name: '23:00前睡觉' },
      { id: 'reading',       emoji: '📖', name: '读书' },
      { id: 'study',         emoji: '📝', name: '背单词/学习' },
      { id: 'stretch',       emoji: '🧘', name: '拉伸/站立' },
      { id: 'journal',       emoji: '✍️', name: '写日记/复盘' },
      { id: 'finance',       emoji: '💰', name: '记账' }
    ];
  }

  /**
   * 获取明天日期字符串
   */
  function getTomorrowStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * 获取明天的星期几（0=周日, 1=周一, ...）
   */
  function getTomorrowDay() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.getDay();
  }

  /**
   * 绑定智能聚焦中习惯打卡事件
   */
  function bindSmartFocusHabitEvents(data) {
    const container = document.getElementById('dash-smart-focus');
    if (!container) return;

    container.querySelectorAll('.dash-smart-focus-habit:not(.completed)').forEach(el => {
      _bindEvent(el, 'click', async () => {
        const habitId = el.dataset.habitId;
        if (!habitId) return;

        try {
          const todayStr = getTodayStr();
          let record = await Storage.get('checkins', todayStr);
          const habits = record?.habits || [];

          if (!habits.includes(habitId)) {
            habits.push(habitId);
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            if (!record) {
              await Storage.put('checkins', { id: todayStr, date: todayStr, habits, lastCheckin: timeStr });
            } else {
              record.habits = habits;
              record.lastCheckin = timeStr;
              await Storage.put('checkins', record);
            }
          }

          // 刷新智能聚焦
          await renderSmartFocus();

          // 通知习惯模块
          if (true) /* EventBus always available via import */ {
            EventBus.emit('habit:completed', { habitId, habitName: habitInfo?.name || habitId, date: todayStr });
          }
        } catch (e) {
          console.warn('[SmartFocus] 习惯打卡失败:', e);
        }
      });
    });
  }

  /**
   * 启动智能聚焦时段切换定时器
   * 每分钟检查是否需要刷新
   */
  function startSmartFocusTimer() {
    if (_smartFocusTimer) clearInterval(_smartFocusTimer);
    let lastPeriodId = getCurrentPeriod().id;

    _smartFocusTimer = setInterval(() => {
      const currentPeriodId = getCurrentPeriod().id;
      if (currentPeriodId !== lastPeriodId) {
        lastPeriodId = currentPeriodId;
        console.log('[SmartFocus] 时段切换:', currentPeriodId);
        renderSmartFocus();
      }
    }, 60000); // 每分钟检查
  }

  /**
   * 渲染智能建议卡片
   */
  async function renderSmartSuggestions() {
    const container = document.getElementById('dash-smart-suggestions');
    if (!container) return;

    // 确保 SmartSuggestion 已初始化
    if (window.SmartSuggestion?.renderSuggestions) {
      try {
        await window.SmartSuggestion?.renderSuggestions(container);
      } catch (e) {
        console.warn('[Dashboard] 智能建议渲染失败:', e);
        container.style.display = 'none';
      }
    } else {
      container.style.display = 'none';
    }
  }

  /**
   * 渲染「猜你想做」预测操作卡片
   * 基于 PredictiveEngine 的时间/行为预测，展示最多3个建议操作
   */
  async function renderPredictiveActions() {
    const container = document.getElementById('dash-predictive-actions');
    if (!container) return;

    // 确保 PredictiveEngine 可用
    if (!window.PredictiveEngine || !window.PredictiveEngine?.getPredictions) {
      container.style.display = 'none';
      return;
    }

    try {
      const predictions = await window.PredictiveEngine?.getPredictions();

      if (!predictions || predictions.length === 0) {
        container.style.display = 'none';
        return;
      }

      container.style.display = '';

      // 生成卡片 HTML
      container.innerHTML = `
        <div class="dash-predictive-header">
          <span class="dash-predictive-icon">🔮</span>
          <span class="dash-predictive-title">猜你想做</span>
        </div>
        <div class="dash-predictive-list">
          ${predictions.map(p => `
            <div class="dash-predictive-item" data-prediction-id="${escapeHtml(p.id)}">
              <span class="dash-predictive-item-icon">${p.icon || '💡'}</span>
              <div class="dash-predictive-item-content">
                <div class="dash-predictive-item-title">${escapeHtml(p.title)}</div>
                <div class="dash-predictive-item-desc">${escapeHtml(p.description || '')}</div>
              </div>
              <button class="dash-predictive-item-btn" data-prediction-id="${escapeHtml(p.id)}" title="${escapeHtml(p.title)}">去完成</button>
            </div>
          `).join('')}
        </div>
      `;

      // 绑定操作按钮
      container.querySelectorAll('.dash-predictive-item-btn').forEach(btn => {
        _bindEvent(btn, 'click', async (e) => {
          e.stopPropagation();
          const predId = btn.dataset.predictionId;
          const prediction = predictions.find(p => p.id === predId);
          if (prediction) {
            // 记录「有用」反馈
            if (window.PredictiveEngine?.recordFeedback) {
              window.PredictiveEngine?.recordFeedback(predId, true);
            }
            // 执行预测操作
            if (window.PredictiveEngine?.executePrediction) {
              await window.PredictiveEngine?.executePrediction(prediction);
            }
          }
        });
      });

      // 绑定整个卡片点击
      container.querySelectorAll('.dash-predictive-item').forEach(item => {
        _bindEvent(item, 'click', async () => {
          const predId = item.dataset.predictionId;
          const prediction = predictions.find(p => p.id === predId);
          if (prediction && window.PredictiveEngine?.executePrediction) {
            if (window.PredictiveEngine?.recordFeedback) {
              window.PredictiveEngine?.recordFeedback(predId, true);
            }
            await window.PredictiveEngine?.executePrediction(prediction);
          }
        });
      });

    } catch (e) {
      console.warn('[Dashboard] 预测操作渲染失败:', e);
      container.style.display = 'none';
    }
  }


  async function init() {
    await renderSmartFocus();
    await renderSmartSuggestions();
    await renderPredictiveActions();
    startSmartFocusTimer();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch(e) {}
    });
    _eventListeners = [];
    if (_smartFocusTimer) { clearInterval(_smartFocusTimer); _smartFocusTimer = null; }
  }

  return { init, destroy, renderSmartFocus, startSmartFocusTimer };
})();

export { SmartFocusWidget };
