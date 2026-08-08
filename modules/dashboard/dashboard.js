/**
 * dashboard.js - 总面板逻辑
 * 人生工作台 · 首页数据渲染与交互
 * v38 - 智能聚焦：根据时段自动切换首页内容
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';
import { CrossLinker } from '../../core/cross-linker.js';
import { Router } from '../../core/router.js';
import { SmartSuggestion } from '../../core/smart-suggestion.js';
import { ReportModule } from '../report/report.js';


export const DashboardModule = (() => {
  const { escapeHtml, getTodayStr } = AppUtils;

  // ===== F1: 今日聚焦状态 =====
  let focusTasks = [];          // 当前显示的3个任务
  let focusOffset = 0;          // 换一批的偏移量
  let customFocusIds = null;    // 用户自定义的任务ID列表

  // ===== Widget系统状态 =====
  let _widgetConfig = null;     // 当前Widget配置
  let _widgetEditMode = false;  // 是否处于编辑模式
  let _widgetDestroyFns = [];   // Widget销毁函数列表
  let _widgetDragListeners = []; // 拖拽事件监听器

  // ===== 智能聚焦状态 =====
  let _smartFocusTimer = null;  // 时段切换定时器

  // ===== 智能聚焦：时段定义 =====
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
  async function init() {
    console.log('[Dashboard] 初始化总面板...');
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

  // ====================================================================
  // ===== Widget系统核心 =====
  // ====================================================================

  /**
   * 初始化Widget系统
   */
  async function initWidgetSystem() {
    _widgetConfig = await loadWidgetConfig();
    await renderWidgets();
  }

  /**
   * 从IndexedDB加载Widget配置
   */
  async function loadWidgetConfig() {
    try {
      const setting = await Storage.get('settings', 'widget_config');
      if (setting && setting.value && Array.isArray(setting.value)) {
        return setting.value;
      }
    } catch (e) {
      console.warn('[Dashboard] Widget配置加载失败，使用默认:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_WIDGET_CONFIG));
  }

  /**
   * 保存Widget配置到IndexedDB
   */
  async function saveWidgetConfig(config) {
    try {
      await Storage.put('settings', { key: 'widget_config', value: config });
      _widgetConfig = config;
      console.log('[Dashboard] Widget配置已保存');
    } catch (e) {
      console.error('[Dashboard] Widget配置保存失败:', e);
    }
  }

  /**
   * 渲染所有Widget
   */
  async function renderWidgets() {
    const grid = document.getElementById('dash-widget-grid');
    if (!grid) return;

    // 清理旧的Widget
    destroyWidgets();

    if (!_widgetConfig || _widgetConfig.length === 0) {
      grid.innerHTML = `
        <div class="dash-widget-empty">
          <span class="dash-widget-empty-icon">📊</span>
          <p>点击「编辑首页」添加数据看板</p>
        </div>
      `;
      return;
    }

    // 生成Widget HTML
    const widgetPromises = _widgetConfig.map((w, idx) => buildWidgetHTML(w, idx));
    const widgetHTMLs = await Promise.all(widgetPromises);

    grid.innerHTML = widgetHTMLs.join('');

    // 渲染Widget内容（Canvas等需要JS初始化）
    for (let idx = 0; idx < _widgetConfig.length; idx++) {
      const widget = _widgetConfig[idx];
      await renderWidgetContent(widget, idx);
    }

    // 如果是编辑模式，绑定拖拽
    if (_widgetEditMode) {
      enableDragSort();
    }
  }

  /**
   * 构建单个Widget的HTML外壳
   */
  async function buildWidgetHTML(widget, idx) {
    const typeDef = WIDGET_TYPES[widget.type] || {};
    const sizeClass = widget.size === 2 ? 'dash-widget-item-wide' : '';
    const editClass = _widgetEditMode ? 'dash-widget-editing' : '';
    const draggable = _widgetEditMode ? 'draggable="true"' : '';

    return `
      <div class="dash-widget-item ${sizeClass} ${editClass}" 
           data-widget-idx="${idx}" 
           data-widget-type="${widget.type}"
           data-widget-id="${widget.id || ''}"
           ${draggable}>
        <div class="dash-widget-item-header">
          <span class="dash-widget-item-icon">${typeDef.icon || '📊'}</span>
          <span class="dash-widget-item-title">${typeDef.name || widget.type}</span>
          ${_widgetEditMode ? `
            <div class="dash-widget-item-edit-actions">
              <button class="dash-widget-move-btn" data-dir="up" data-idx="${idx}" title="上移">⬆</button>
              <button class="dash-widget-move-btn" data-dir="down" data-idx="${idx}" title="下移">⬇</button>
              <button class="dash-widget-delete-btn" data-idx="${idx}" title="删除">🗑</button>
            </div>
          ` : ''}
        </div>
        <div class="dash-widget-item-body" id="dash-widget-body-${idx}">
          <!-- JS 动态渲染内容 -->
        </div>
      </div>
    `;
  }

  /**
   * 渲染Widget内容（根据类型分发）
   */
  async function renderWidgetContent(widget, idx) {
    const container = document.getElementById(`dash-widget-body-${idx}`);
    if (!container) return;

    try {
      switch (widget.type) {
        case 'progress-ring':
          await renderProgressRing(container, widget.config);
          break;
        case 'mini-line-chart':
          await renderMiniLineChart(container, widget.config);
          break;
        case 'counter':
          await renderCounter(container, widget.config);
          break;
        case 'list-widget':
          await renderListWidget(container, widget.config);
          break;
        case 'chart-widget':
          await renderChartWidget(container, widget.config);
          break;
        default:
          container.innerHTML = '<div class="dash-widget-no-data">未知类型</div>';
      }
    } catch (e) {
      console.error(`[Dashboard] Widget ${widget.type} 渲染失败:`, e);
      container.innerHTML = '<div class="dash-widget-no-data">加载失败</div>';
    }
  }

  // ====================================================================
  // ===== Widget类型1: 进度环 =====
  // ====================================================================

  async function renderProgressRing(container, config) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    let total = 0, completed = 0;
    try {
      const habits = await Storage.getAll('habits');
      const checkins = await Storage.getAll('checkins');
      const todayCheckins = checkins.filter(c => c.date === todayStr);
      total = habits.length;
      completed = todayCheckins.length;
    } catch (e) { /* */ }

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    const circumference = 2 * Math.PI * 40; // r=40
    const offset = circumference * (1 - progress / 100);

    container.innerHTML = `
      <div class="dash-widget-progress-ring">
        <svg class="dash-widget-ring-svg" viewBox="0 0 100 100">
          <circle class="dash-widget-ring-bg" cx="50" cy="50" r="40" 
                  fill="none" stroke-width="8" />
          <circle class="dash-widget-ring-fg" cx="50" cy="50" r="40" 
                  fill="none" stroke-width="8"
                  stroke-dasharray="${circumference}" 
                  stroke-dashoffset="${offset}"
                  stroke-linecap="round" />
        </svg>
        <div class="dash-widget-ring-text">
          <span class="dash-widget-ring-value">${progress}%</span>
          <span class="dash-widget-ring-label">今日习惯</span>
        </div>
      </div>
      <div class="dash-widget-ring-detail">${completed}/${total} 已完成</div>
    `;
  }

  // ====================================================================
  // ===== Widget类型2: 迷你折线图 =====
  // ====================================================================

  async function renderMiniLineChart(container, config) {
    const now = new Date();
    const days = [];
    const dataPoints = [];

    // 获取近7天数据
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const label = `${d.getMonth()+1}/${d.getDate()}`;
      days.push(label);

      let value = 0;
      try {
        const monthStr = dateStr.slice(0, 7);
        const financeRecords = await Storage.getByIndex('finance', 'month', monthStr);
        value = financeRecords
          .filter(r => r.type === 'expense' && r.date === dateStr)
          .reduce((sum, r) => sum + (r.amount || 0), 0);
      } catch (e) { /* */ }
      dataPoints.push(value);
    }

    const canvasId = `line-chart-${Date.now()}`;
    container.innerHTML = `
      <div class="dash-widget-chart-header">
        <span class="dash-widget-chart-label">近7天支出</span>
        <span class="dash-widget-chart-unit">元</span>
      </div>
      <canvas id="${canvasId}" class="dash-widget-line-canvas"></canvas>
    `;

    // 延迟绘制Canvas（等DOM就绪）
    const drawFn = () => drawMiniLineChart(canvasId, days, dataPoints);
    requestAnimationFrame(drawFn);
    _widgetDestroyFns.push(() => {
      // Canvas无需特殊清理
    });
  }

  /**
   * 绘制迷你折线图（Canvas）
   */
  function drawMiniLineChart(canvasId, labels, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width || 280;
    const h = 120;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const maxVal = Math.max(...data, 1);
    const padding = { top: 8, right: 12, bottom: 24, left: 12 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // 获取当前主题颜色
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lineColor = isDark ? '#E8A87C' : '#E8A87C';
    const fillColor = isDark ? 'rgba(232,168,124,0.15)' : 'rgba(232,168,124,0.15)';
    const textColor = isDark ? '#7A7268' : '#8A7D71';
    const dotColor = isDark ? '#E8A87C' : '#E8A87C';

    // 绘制填充区域
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      const y = padding.top + chartH - (val / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // 绘制折线
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      const y = padding.top + chartH - (val / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 绘制数据点
    data.forEach((val, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      const y = padding.top + chartH - (val / maxVal) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
    });

    // 绘制X轴标签
    ctx.fillStyle = textColor;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((label, i) => {
      const x = padding.left + (i / (labels.length - 1)) * chartW;
      ctx.fillText(label, x, h - 4);
    });
  }

  // ====================================================================
  // ===== Widget类型3: 计数器 =====
  // ====================================================================

  async function renderCounter(container, config) {
    const metric = (config && config.metric) || 'streak';
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    let value = 0;
    let label = '';
    let unit = '';
    let icon = '';

    if (metric === 'streak') {
      // 连续打卡天数
      try {
        const allCheckins = await Storage.getAll('checkins');
        const dateSet = new Set(allCheckins.map(c => c.date));
        for (let i = 0; i < 365; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (dateSet.has(dateStr)) {
            value++;
          } else {
            if (i === 0) continue;
            break;
          }
        }
      } catch (e) { /* */ }
      label = '连续打卡';
      unit = '天';
      icon = '🔥';
    } else if (metric === 'task_count') {
      // 本月完成任务数
      const monthStr = todayStr.slice(0, 7);
      try {
        const allTasks = await Storage.getAll('tasks');
        value = allTasks.filter(t => (t.status === 'done' || t.status === 'completed') && t.completedAt && t.completedAt.startsWith(monthStr)).length;
      } catch (e) { /* */ }
      label = '本月完成';
      unit = '项';
      icon = '✅';
    } else if (metric === 'study_hours') {
      // 本月学习时长
      const monthStr = todayStr.slice(0, 7);
      try {
        const studyRecords = await Storage.getAll('study');
        const monthRecords = studyRecords.filter(r => r.date && r.date.startsWith(monthStr));
        const totalMinutes = monthRecords.reduce((sum, r) => sum + (r.minutes || 0), 0);
        value = Math.round(totalMinutes / 60 * 10) / 10;
      } catch (e) { /* */ }
      label = '本月学习';
      unit = '小时';
      icon = '📚';
    }

    container.innerHTML = `
      <div class="dash-widget-counter">
        <span class="dash-widget-counter-icon">${icon}</span>
        <span class="dash-widget-counter-value">${value}</span>
        <span class="dash-widget-counter-unit">${unit}</span>
      </div>
      <div class="dash-widget-counter-label">${label}</div>
    `;
  }

  // ====================================================================
  // ===== Widget类型4: 列表Widget =====
  // ====================================================================

  async function renderListWidget(container, config) {
    const source = (config && config.source) || 'tasks';
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    const items = [];

    if (source === 'tasks') {
      try {
        const tasks = await Storage.getByIndex('tasks', 'date', todayStr);
        const todoTasks = tasks.filter(t => t.status === 'todo').slice(0, 5);
        for (const task of todoTasks) {
          items.push({
            text: task.title || '未命名任务',
            meta: task.priority === 'high' ? '高优先级' : '',
            checked: false,
            id: task.id
          });
        }
      } catch (e) { /* */ }
    } else if (source === 'ideas') {
      try {
        const allIdeas = await Storage.getAll('ideas');
        const ideas = allIdeas
          .sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''))
          .slice(0, 5);
        for (const idea of ideas) {
          items.push({
            text: idea.title || idea.content?.substring(0, 50) || '无标题灵感',
            meta: '灵感',
            checked: false,
            id: idea.id
          });
        }
      } catch (e) { /* */ }
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="dash-widget-list-empty">
          <span>暂无${source === 'tasks' ? '待办' : '灵感'}</span>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="dash-widget-list">
        ${items.map(item => `
          <div class="dash-widget-list-item" data-id="${item.id || ''}">
            <span class="dash-widget-list-dot"></span>
            <span class="dash-widget-list-text">${escapeHtml(item.text)}</span>
            ${item.meta ? `<span class="dash-widget-list-meta">${escapeHtml(item.meta)}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  // ====================================================================
  // ===== Widget类型5: 饼图Widget =====
  // ====================================================================

  async function renderChartWidget(container, config) {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    let expense = 0, income = 0;
    try {
      const financeRecords = await Storage.getByIndex('finance', 'month', monthStr);
      expense = financeRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + (r.amount || 0), 0);
      income = financeRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + (r.amount || 0), 0);
    } catch (e) { /* */ }

    const total = expense + income;
    const canvasId = `pie-chart-${Date.now()}`;

    container.innerHTML = `
      <div class="dash-widget-chart-header">
        <span class="dash-widget-chart-label">本月收支</span>
      </div>
      <canvas id="${canvasId}" class="dash-widget-pie-canvas"></canvas>
      <div class="dash-widget-pie-legend">
        <span class="dash-widget-legend-item">
          <span class="dash-widget-legend-dot" style="background:#E8A87C"></span>
          支出 ¥${expense.toLocaleString()}
        </span>
        <span class="dash-widget-legend-item">
          <span class="dash-widget-legend-dot" style="background:#7EBF8E"></span>
          收入 ¥${income.toLocaleString()}
        </span>
      </div>
    `;

    const drawFn = () => drawPieChart(canvasId, expense, income);
    requestAnimationFrame(drawFn);
    _widgetDestroyFns.push(() => {});
  }

  /**
   * 绘制饼图（Canvas）
   */
  function drawPieChart(canvasId, expense, income) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 100;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const total = expense + income;
    const cx = size / 2, cy = size / 2, r = 38;

    if (total === 0) {
      // 空状态
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.fillStyle = isDark ? '#3A3530' : '#DCC5AD';
      ctx.fill();
      ctx.fillStyle = isDark ? '#7A7268' : '#8A7D71';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', cx, cy + 4);
      return;
    }

    const expenseAngle = (expense / total) * Math.PI * 2;
    const startAngle = -Math.PI / 2;

    // 支出扇形
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + expenseAngle);
    ctx.closePath();
    ctx.fillStyle = '#E8A87C';
    ctx.fill();

    // 收入扇形
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle + expenseAngle, startAngle + Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#7EBF8E';
    ctx.fill();

    // 中心圆（环形效果）
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = isDark ? '#2A2420' : '#EEE9E3';
    ctx.fill();

    // 中心文字
    ctx.fillStyle = isDark ? '#E8E0D8' : '#3D3027';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const balance = income - expense;
    ctx.fillText(`¥${Math.abs(balance).toLocaleString()}`, cx, cy - 4);
    ctx.font = '9px sans-serif';
    ctx.fillStyle = isDark ? '#7A7268' : '#8A7D71';
    ctx.fillText(balance >= 0 ? '结余' : '超支', cx, cy + 10);
  }

  // ====================================================================
  // ===== Widget拖拽排序 =====
  // ====================================================================

  function enableDragSort() {
    const grid = document.getElementById('dash-widget-grid');
    if (!grid) return;

    const items = grid.querySelectorAll('.dash-widget-item');
    let draggedItem = null;

    items.forEach(item => {
      const onDragStart = (e) => {
        draggedItem = item;
        item.classList.add('dash-widget-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.widgetIdx);
      };

      const onDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (item !== draggedItem) {
          item.classList.add('dash-widget-drag-over');
        }
      };

      const onDragLeave = () => {
        item.classList.remove('dash-widget-drag-over');
      };

      const onDrop = (e) => {
        e.preventDefault();
        item.classList.remove('dash-widget-drag-over');
        if (draggedItem && draggedItem !== item) {
          const fromIdx = parseInt(draggedItem.dataset.widgetIdx);
          const toIdx = parseInt(item.dataset.widgetIdx);
          reorderWidget(fromIdx, toIdx);
        }
      };

      const onDragEnd = () => {
        item.classList.remove('dash-widget-dragging');
        items.forEach(i => i.classList.remove('dash-widget-drag-over'));
        draggedItem = null;
      };

      _bindEvent(item, 'dragstart', onDragStart);
      _bindEvent(item, 'dragover', onDragOver);
      _bindEvent(item, 'dragleave', onDragLeave);
      _bindEvent(item, 'drop', onDrop);
      _bindEvent(item, 'dragend', onDragEnd);

      _widgetDragListeners.push(
        { el: item, event: 'dragstart', handler: onDragStart },
        { el: item, event: 'dragover', handler: onDragOver },
        { el: item, event: 'dragleave', handler: onDragLeave },
        { el: item, event: 'drop', handler: onDrop },
        { el: item, event: 'dragend', handler: onDragEnd }
      );
    });
  }

  /**
   * 重新排序Widget
   */
  async function reorderWidget(fromIdx, toIdx) {
    if (!_widgetConfig) return;
    const item = _widgetConfig.splice(fromIdx, 1)[0];
    _widgetConfig.splice(toIdx, 0, item);
    await saveWidgetConfig(_widgetConfig);
    await renderWidgets();
  }

  /**
   * 清理所有Widget（Canvas、事件等）
   */
  function destroyWidgets() {
    _widgetDestroyFns.forEach(fn => { try { fn(); } catch (e) {} });
    _widgetDestroyFns = [];

    // 清理拖拽监听器
    _widgetDragListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch (e) {}
    });
    _widgetDragListeners = [];
  }

  // ====================================================================
  // ===== Widget配置弹窗 =====
  // ====================================================================

  function bindWidgetEvents() {
    // 编辑首页按钮
    const editBtn = document.getElementById('dash-widget-edit-btn');
    if (editBtn) {
      const handler = () => showWidgetConfigModal();
      _bindEvent(editBtn, 'click', handler);
      _widgetEventListeners.push({ el: editBtn, event: 'click', handler });
    }
  }

  /**
   * 显示Widget配置弹窗
   */
  function showWidgetConfigModal() {
    const overlay = document.getElementById('dash-widget-config-overlay');
    if (!overlay) return;

    // 渲染当前Widget列表
    renderConfigList();

    overlay.style.display = 'flex';

    // 绑定弹窗内事件（每次打开重新绑定）
    bindConfigModalEvents();
  }

  /**
   * 渲染配置列表
   */
  function renderConfigList() {
    const listEl = document.getElementById('dash-widget-config-list');
    if (!listEl || !_widgetConfig) return;

    if (_widgetConfig.length === 0) {
      listEl.innerHTML = '<div class="dash-modal-empty">暂无 Widget，请添加</div>';
      return;
    }

    listEl.innerHTML = _widgetConfig.map((w, idx) => {
      const typeDef = WIDGET_TYPES[w.type] || {};
      return `
        <div class="dash-widget-config-item" data-idx="${idx}" draggable="true">
          <span class="dash-widget-config-drag">⋮⋮</span>
          <span class="dash-widget-config-icon">${typeDef.icon || '📊'}</span>
          <span class="dash-widget-config-name">${typeDef.name || w.type}</span>
          <span class="dash-widget-config-desc">${typeDef.description || ''}</span>
          <div class="dash-widget-config-actions">
            <button class="dash-widget-config-move" data-dir="up" data-idx="${idx}">⬆</button>
            <button class="dash-widget-config-move" data-dir="down" data-idx="${idx}">⬇</button>
            <button class="dash-widget-config-delete" data-idx="${idx}">✕</button>
          </div>
        </div>
      `;
    }).join('');

    // 弹窗内拖拽排序
    enableConfigDragSort(listEl);
  }

  /**
   * 配置弹窗内拖拽排序
   */
  function enableConfigDragSort(listEl) {
    const items = listEl.querySelectorAll('.dash-widget-config-item');
    let draggedItem = null;

    items.forEach(item => {
      _bindEvent(item, 'dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dash-widget-config-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      _bindEvent(item, 'dragover', (e) => {
        e.preventDefault();
        if (item !== draggedItem) {
          item.classList.add('dash-widget-config-drag-over');
        }
      });

      _bindEvent(item, 'dragleave', () => {
        item.classList.remove('dash-widget-config-drag-over');
      });

      _bindEvent(item, 'drop', (e) => {
        e.preventDefault();
        item.classList.remove('dash-widget-config-drag-over');
        if (draggedItem && draggedItem !== item) {
          const fromIdx = parseInt(draggedItem.dataset.idx);
          const toIdx = parseInt(item.dataset.idx);
          const movedItem = _widgetConfig.splice(fromIdx, 1)[0];
          _widgetConfig.splice(toIdx, 0, movedItem);
          renderConfigList();
        }
      });

      _bindEvent(item, 'dragend', () => {
        item.classList.remove('dash-widget-config-dragging');
        items.forEach(i => i.classList.remove('dash-widget-config-drag-over'));
        draggedItem = null;
      });
    });
  }

  /**
   * 绑定配置弹窗事件
   */
  function bindConfigModalEvents() {
    const overlay = document.getElementById('dash-widget-config-overlay');
    const closeBtn = document.getElementById('dash-widget-config-close');
    const confirmBtn = document.getElementById('dash-widget-config-confirm');
    const addBtn = document.getElementById('dash-widget-add-btn');
    const typeMenu = document.getElementById('dash-widget-type-menu');
    const presetList = document.getElementById('dash-widget-preset-list');
    const configList = document.getElementById('dash-widget-config-list');

    // 关闭弹窗
    const closeHandler = () => { overlay.style.display = 'none'; };
    _bindEvent(closeBtn, 'click', closeHandler);
    _bindEvent(overlay, 'click', (e) => { if (e.target === overlay) closeHandler(); });

    // 确认按钮 - 保存并重新渲染
    const confirmHandler = async () => {
      await saveWidgetConfig(_widgetConfig);
      _widgetEditMode = false;
      await renderWidgets();
      overlay.style.display = 'none';
    };
    _bindEvent(confirmBtn, 'click', confirmHandler);

    // 添加Widget按钮 - 切换类型菜单
    const toggleMenuHandler = () => {
      typeMenu && typeMenu.classList.toggle('hidden');
    };
    _bindEvent(addBtn, 'click', toggleMenuHandler);

    // 类型菜单项点击
    if (typeMenu) {
      typeMenu.querySelectorAll('.dash-widget-type-item').forEach(btn => {
        _bindEvent(btn, 'click', () => {
          const type = btn.dataset.type;
          const typeDef = WIDGET_TYPES[type];
          if (!typeDef) return;

          // 检查是否已存在
          if (_widgetConfig.some(w => w.type === type)) {
            if (window.App) window.App?.showToast('该 Widget 已添加');
            typeMenu.classList.add('hidden');
            return;
          }

          _widgetConfig.push({
            type,
            size: typeDef.defaultSize,
            id: `w_${type}_${Date.now()}`,
            config: {}
          });
          renderConfigList();
          typeMenu.classList.add('hidden');
        });
      });
    }

    // 预设布局按钮
    if (presetList) {
      presetList.querySelectorAll('.dash-widget-preset-btn').forEach(btn => {
        _bindEvent(btn, 'click', () => {
          const preset = btn.dataset.preset;
          const presetConfig = WIDGET_PRESETS[preset];
          if (!presetConfig) return;

          _widgetConfig = presetConfig.map((w, i) => ({
            ...w,
            id: `w_${w.type}_${i}`,
            config: w.config || {}
          }));
          renderConfigList();

          // 高亮当前选中预设
          presetList.querySelectorAll('.dash-widget-preset-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    }

    // 配置列表事件代理（上移/下移/删除）
    if (configList) {
      _bindEvent(configList, 'click', (e) => {
        const target = e.target;
        const idx = parseInt(target.dataset.idx);
        if (isNaN(idx)) return;

        if (target.classList.contains('dash-widget-config-delete')) {
          _widgetConfig.splice(idx, 1);
          renderConfigList();
        } else if (target.classList.contains('dash-widget-config-move')) {
          const dir = target.dataset.dir;
          if (dir === 'up' && idx > 0) {
            const item = _widgetConfig.splice(idx, 1)[0];
            _widgetConfig.splice(idx - 1, 0, item);
            renderConfigList();
          } else if (dir === 'down' && idx < _widgetConfig.length - 1) {
            const item = _widgetConfig.splice(idx, 1)[0];
            _widgetConfig.splice(idx + 1, 0, item);
            renderConfigList();
          }
        }
      });

      // 编辑模式中Widget的删除/移动按钮
      _bindEvent(configList, 'click', (e) => {
        const deleteBtn = e.target.closest('.dash-widget-delete-btn');
        const moveBtn = e.target.closest('.dash-widget-move-btn');
        if (deleteBtn) {
          const idx = parseInt(deleteBtn.dataset.idx);
          _widgetConfig.splice(idx, 1);
          saveWidgetConfig(_widgetConfig).then(() => renderWidgets());
        } else if (moveBtn) {
          const idx = parseInt(moveBtn.dataset.idx);
          const dir = moveBtn.dataset.dir;
          if (dir === 'up' && idx > 0) {
            const item = _widgetConfig.splice(idx, 1)[0];
            _widgetConfig.splice(idx - 1, 0, item);
          } else if (dir === 'down' && idx < _widgetConfig.length - 1) {
            const item = _widgetConfig.splice(idx, 1)[0];
            _widgetConfig.splice(idx + 1, 0, item);
          }
          saveWidgetConfig(_widgetConfig).then(() => renderWidgets());
        }
      });
    }
  }

  // ====================================================================
  // ===== 原有功能 =====
  // ====================================================================

  /**
   * 渲染问候语
   */
  async function renderGreeting() {
    const now = new Date();
    const hour = now.getHours();
    let greeting = '晚上好';
    if (hour >= 5 && hour < 12) greeting = '早上好';
    else if (hour >= 12 && hour < 18) greeting = '下午好';

    // 获取用户名
    let username = '鹿7铭';
    try {
      const setting = await Storage.get('settings', 'username');
      if (setting) username = setting.value;
    } catch (e) { /* 使用默认值 */ }

    const titleEl = document.getElementById('dash-greeting-text');
    if (titleEl) titleEl.textContent = `${greeting}，${username}。`;

    // 副标题
    const subEl = document.getElementById('dash-greeting-sub');
    if (!subEl) return;

    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const weekday = weekdays[now.getDay()];

    let taskCount = 0;
    let streakDays = 0;
    try {
      const todayStr = `${yyyy}-${mm}-${dd}`;
      const tasks = await Storage.getByIndex('tasks', 'date', todayStr);
      taskCount = tasks.filter((t) => t.status === 'todo').length;

      // 连续打卡天数
      const allCheckins = await Storage.getAll('checkins');
      const dateSet = new Set(allCheckins.map((c) => c.date));
      for (let i = 0; i < 365; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dateSet.has(dateStr)) {
          streakDays++;
        } else {
          if (i === 0) continue;
          break;
        }
      }
    } catch (e) { /* 使用默认值 */ }

    const parts = [`${yyyy}年${parseInt(mm)}月${parseInt(dd)}日 · 星期${weekday}`];
    if (taskCount > 0) parts.push(`待办 ${taskCount} 项`);
    if (streakDays > 0) parts.push(`坚持第 ${streakDays} 天`);

    subEl.textContent = parts.join(' · ');
  }

  /**
   * 渲染生日提醒
   */
  async function renderBirthdayReminder() {
    const container = document.getElementById('dash-birthday-reminder');
    if (!container) return;

    try {
      const contacts = await Storage.getAll('contacts');
      const today = new Date();
      const todayMM = String(today.getMonth() + 1).padStart(2, '0');
      const todayDD = String(today.getDate()).padStart(2, '0');
      const todayMD = `${todayMM}-${todayDD}`;

      const birthdayPeople = contacts.filter(c => {
        if (!c.birthday) return false;
        // birthday 格式 YYYY-MM-DD，取月日部分
        const parts = c.birthday.split('-');
        if (parts.length < 3) return false;
        const bMM = parts[1].padStart(2, '0');
        const bDD = parts[2].padStart(2, '0');
        return `${bMM}-${bDD}` === todayMD;
      });

      if (birthdayPeople.length === 0) {
        container.style.display = 'none';
        return;
      }

      const names = birthdayPeople.map(c => c.name || '未命名').join('、');
      container.style.display = '';
      container.innerHTML = `
        <div class="dash-birthday-card">
          <span class="dash-birthday-icon">🎂</span>
          <div class="dash-birthday-text">
            <div class="dash-birthday-title">今天是 ${escapeHtml(names)} 的生日！</div>
            <div class="dash-birthday-sub">别忘了送上你的祝福 ❤️</div>
          </div>
        </div>
      `;
    } catch (e) {
      console.warn('[Dashboard] 生日提醒加载失败:', e);
      container.style.display = 'none';
    }
  }



  /**
   * 渲染月末复盘提醒卡片
   */
  async function renderTemplateReminder() {
    const container = document.getElementById('dash-template-reminder');
    if (!container) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();

    // 月末前3天或当月最后一天显示提醒
    const isNearMonthEnd = today >= lastDay - 2;

    if (!isNearMonthEnd) {
      container.classList.add('hidden');
      return;
    }

    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const hasReport = (() => {
      try {
        // 简单检查是否已有本月总结报告（通过 localStorage 标记）
        return localStorage.getItem(`template_has_report_${monthKey}`) === '1';
      } catch (e) { return false; }
    })();

    if (hasReport) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    _bindEvent(container, 'click', () => {
      if (true) /* Router always available via import */ {
        Router.navigate('templates');
      }
    });
  }

  /**
   * 渲染日历
   */
  async function renderCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const today = now.getDate();

    // 月份标题
    const monthEl = document.getElementById('dash-calendar-month');
    if (monthEl) {
      monthEl.textContent = `${year}年${month + 1}月`;
    }

    // 获取本月打卡日期
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    let checkinDateSet = new Set();
    try {
      const checkins = await Storage.getByIndex('checkins', 'month', monthStr);
      checkinDateSet = new Set(checkins.map((c) => parseInt(c.date.split('-')[2])));
    } catch (e) { /* 空打卡数据 */ }

    // 生成日历格子
    const daysContainer = document.getElementById('dash-calendar-days');
    if (!daysContainer) return;
    daysContainer.innerHTML = '';

    // 本月第一天是周几（0=周日）
    const firstDay = new Date(year, month, 1).getDay();
    // 本月天数
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 填充空白格
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'dash-calendar-day empty';
      daysContainer.appendChild(empty);
    }

    // 填充日期
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'dash-calendar-day';
      dayEl.textContent = day;

      if (day === today) dayEl.classList.add('today');
      if (checkinDateSet.has(day)) dayEl.classList.add('checked');

      daysContainer.appendChild(dayEl);
    }

    // 日历总览快捷跳转
    const goBtn = document.getElementById('dash-calendar-go');
    if (goBtn) {
      _bindEvent(goBtn, 'click', () => Router.navigate('calendar'));
    }
  }

  /**
   * 渲染旅行基金卡片
   */
  async function renderTravelCard() {
    const fundEl = document.getElementById('dash-travel-fund');
    const cardEl = document.getElementById('dash-travel-card');
    if (!fundEl || !cardEl) return;

    try {
      const destinations = await Storage.getAll('travel');
      const totalSaved = (destinations || []).reduce((s, d) => s + (d.fund?.saved || 0), 0);
      fundEl.textContent = '¥' + totalSaved.toLocaleString('zh-CN');
    } catch (e) {
      console.warn('[Dashboard] 读取旅行基金失败:', e);
      fundEl.textContent = '¥0';
    }

    // 点击卡片导航到旅行计划
    _bindEvent(cardEl, 'click', () => {
      if (window.Router) window.Router.navigate('travel');
    });
  }

  /**
   * 渲染亮点卡片
   */
  async function renderHighlights() {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 已签到天数
    try {
      const checkins = await Storage.getByIndex('checkins', 'month', monthStr);
      const el = document.getElementById('dash-checkin-count');
      if (el) el.textContent = checkins.length;
    } catch (e) { /* */ }

    // 学习时长
    try {
      const studyRecords = await Storage.getAll('study');
      const monthRecords = studyRecords.filter((r) => r.date && r.date.startsWith(monthStr));
      const totalMinutes = monthRecords.reduce((sum, r) => sum + (r.minutes || 0), 0);
      const el = document.getElementById('dash-study-hours');
      if (el) {
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        el.textContent = hours > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;
      }
    } catch (e) { /* */ }

    // 本月支出 & 结余
    try {
      const financeRecords = await Storage.getByIndex('finance', 'month', monthStr);
      const expense = financeRecords
        .filter((r) => r.type === 'expense')
        .reduce((sum, r) => sum + (r.amount || 0), 0);
      const income = financeRecords
        .filter((r) => r.type === 'income')
        .reduce((sum, r) => sum + (r.amount || 0), 0);
      const balance = income - expense;

      const expenseEl = document.getElementById('dash-month-expense');
      if (expenseEl) expenseEl.textContent = `¥${expense.toLocaleString()}`;

      const balanceEl = document.getElementById('dash-month-balance');
      if (balanceEl) {
        balanceEl.textContent = `¥${balance.toLocaleString()}`;
        if (balance < 0) {
          balanceEl.style.color = 'var(--accent-red)';
        }
      }
    } catch (e) { /* */ }
  }

  /**
   * 渲染今日推送（真实数据）
   */
  async function renderFeed() {
    const container = document.getElementById('dash-feed-list');
    if (!container) return;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const feedItems = [];

    // 1. 今日待办任务
    try {
      const tasks = await Storage.getByIndex('tasks', 'date', todayStr);
      const todoTasks = tasks.filter(t => t.status === 'todo');
      for (const task of todoTasks.slice(0, 5)) {
        feedItems.push({
          icon: '📋',
          title: task.title || '未命名任务',
          meta: `今日待办${task.priority === 'high' ? ' · 高优先级' : ''}`,
          route: 'tasks',
          type: 'task'
        });
      }
    } catch (e) { /* */ }

    // 2. 近期日记（最近3篇）
    try {
      const allJournal = await Storage.getAll('journal');
      const diaries = allJournal
        .filter(j => j.type === 'diary')
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 3);
      for (const diary of diaries) {
        feedItems.push({
          icon: '📝',
          title: diary.title || diary.content?.substring(0, 50) || '无标题日记',
          meta: `日记 · ${diary.date || '未知日期'}`,
          route: 'journal',
          type: 'journal'
        });
      }
    } catch (e) { /* */ }

    // 3. 近期灵感（最近3条）
    try {
      const allIdeas = await Storage.getAll('ideas');
      const ideas = allIdeas
        .sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''))
        .slice(0, 3);
      for (const idea of ideas) {
        feedItems.push({
          icon: '💡',
          title: idea.title || idea.content?.substring(0, 50) || '无标题灵感',
          meta: `灵感 · ${idea.date || '近期'}`,
          route: 'journal',
          type: 'idea'
        });
      }
    } catch (e) { /* */ }

    // 4. 待完成目标（进度<100，前3个）
    try {
      const allGoals = await Storage.getAll('goals');
      const activeGoals = allGoals
        .filter(g => (g.progress || 0) < 100)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 3);
      for (const goal of activeGoals) {
        feedItems.push({
          icon: '🎯',
          title: goal.title || '未命名目标',
          meta: `目标 · 进度 ${goal.progress || 0}%`,
          route: 'goals',
          type: 'goal'
        });
      }
    } catch (e) { /* */ }

    // 渲染
    if (feedItems.length === 0) {
      container.innerHTML = `
        <div class="dash-feed-empty">
          <span class="dash-feed-empty-icon">📭</span>
          <p>暂无待办或近期记录</p>
          <p class="dash-feed-empty-sub">添加任务、写篇日记，或记录一条灵感吧</p>
        </div>
      `;
      return;
    }

    container.innerHTML = feedItems.map((item) => `
      <div class="dash-feed-item" data-route="${item.route}">
        <span class="dash-feed-item-icon">${item.icon}</span>
        <div class="dash-feed-item-content">
          <div class="dash-feed-item-title">${escapeHtml(item.title)}</div>
          <div class="dash-feed-item-meta">${escapeHtml(item.meta)}</div>
        </div>
      </div>
    `).join('');

    // 绑定点击跳转
    container.querySelectorAll('.dash-feed-item[data-route]').forEach(el => {
      _bindEvent(el, 'click', () => {
        const route = el.dataset.route;
        if (route) Router.navigate(route);
      });
    });
  }

  // ===== F1: 今日聚焦卡片 =====

  // ===== AI 每日推荐 =====
  let _aiRecommendations = null;  // 缓存当日 AI 推荐结果
  let _aiLoading = false;

  /**
   * AI 每日推荐：调用 DeepSeek 分析数据，推荐今日聚焦
   * @returns {Promise<{taskIds: number[], reasons: string[], newTasks?: object[]}|null>}
   */
  async function getAIRecommendations() {
    // 1. 检查今日缓存
    const cacheKey = `ai_focus_${getTodayStr()}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.taskIds && parsed.taskIds.length > 0) {
          console.log('[Dashboard] 使用缓存的 AI 推荐');
          return parsed;
        }
      }
    } catch (e) { /* 忽略缓存错误 */ }

    // 2. 获取 DeepSeek API Key（优先加密存储）
    let token = null;
    try {
      if (window.SecureStorage?.loadSecure) {
        token = await window.SecureStorage?.loadSecure('deepseek_token');
      }
      if (!token) {
        const setting = await Storage.get('settings', 'deepseek_token');
        token = setting ? setting.value : null;
      }
    } catch (e) { /* 无 token */ }
    if (!token) {
      console.log('[Dashboard] 无 DeepSeek token，跳过 AI 推荐');
      return null;
    }

    // 3. 收集上下文数据
    const context = await buildAIContext();

    // 4. 调用 DeepSeek
    const prompt = `你是人生工作台的AI助手。根据用户的数据，推荐今天最应该聚焦的3件事。

## 用户今日数据
${context}

## 要求
1. 从现有待办任务中选择最重要的，如果待办不够可以建议新任务
2. 综合考虑：截止日期紧迫度、任务优先级、与长期目标的相关性、习惯坚持情况
3. 回复必须严格使用JSON格式：
{
  "taskIds": [已有任务的id数字],
  "reasons": ["推荐理由1", "推荐理由2", "推荐理由3"],
  "newTasks": [{"title": "新任务标题", "priority": "high/medium/low", "reason": "推荐理由"}]
}
4. taskIds 里的 id 必须来自上面列出的任务，没有则留空
5. 最多推荐3项，newTasks 最多补充到3项
6. 只输出JSON，不要其他文字`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 500
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        console.warn('[Dashboard] AI 推荐请求失败:', resp.status);
        return null;
      }

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) return null;

      // 解析 JSON
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const result = JSON.parse(jsonMatch[0]);

      // 缓存结果
      try {
        localStorage.setItem(cacheKey, JSON.stringify(result));
      } catch (e) { /* 忽略 */ }

      _aiRecommendations = result;
      console.log('[Dashboard] AI 推荐结果:', result);
      return result;
    } catch (e) {
      console.warn('[Dashboard] AI 推荐失败:', e.message);
      return null;
    }
  }

  /**
   * 构建 AI 推荐的上下文数据
   */
  async function buildAIContext() {
    const lines = [];
    const today = getTodayStr();
    const now = new Date();
    const weekday = ['日','一','二','三','四','五','六'][now.getDay()];

    lines.push(`今天是 ${today} 星期${weekday}`);

    // 待办任务
    try {
      const allTasks = await Storage.getAll('tasks');
      const todoTasks = allTasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
      if (todoTasks.length > 0) {
        lines.push('\n### 待办任务：');
        todoTasks.forEach(t => {
          const due = t.dueDate ? `，截止${t.dueDate}` : '';
          const pri = t.priority || 'medium';
          lines.push(`- id=${t.id}，"${t.title}"，优先级${pri}${due}`);
        });
      } else {
        lines.push('\n当前没有待办任务。');
      }
    } catch (e) { lines.push('\n（任务数据加载失败）'); }

    // 今日习惯
    try {
      const habits = await Storage.getAll('habits');
      const checkins = await Storage.getAll('checkins');
      const todayCheckins = checkins.filter(c => c.date === today);
      const todayCheckedIds = new Set(todayCheckins.map(c => c.habitId));
      const unchecked = habits.filter(h => !todayCheckedIds.has(h.id));
      if (unchecked.length > 0) {
        lines.push('\n### 今日未完成的习惯：');
        unchecked.slice(0, 5).forEach(h => {
          lines.push(`- ${h.name}`);
        });
      }
    } catch (e) { /* 忽略 */ }

    // 进行中目标
    try {
      const goals = await Storage.getAll('goals');
      const active = goals.filter(g => g.status === 'active' || g.status === 'in_progress');
      if (active.length > 0) {
        lines.push('\n### 进行中的目标：');
        active.slice(0, 3).forEach(g => {
          lines.push(`- ${g.title}`);
        });
      }
    } catch (e) { /* 忽略 */ }

    return lines.join('\n');
  }

  /**
   * 降级排序（AI 不可用时）
   */
  async function getLocalRecommendations() {
    const allTasks = await Storage.getAll('tasks');
    const todoTasks = allTasks.filter(t => t.status === 'todo');
    const priorityOrder = { A: 1, B: 2, C: 3, D: 4, high: 1, medium: 2, low: 3 };
    todoTasks.sort((a, b) => {
      const pa = priorityOrder[a.priority] || 5;
      const pb = priorityOrder[b.priority] || 5;
      if (pa !== pb) return pa - pb;
      const da = a.dueDate || '9999-99-99';
      const db = b.dueDate || '9999-99-99';
      return da.localeCompare(db);
    });
    return todoTasks;
  }

  /**
   * 渲染今日聚焦卡片
   */
  async function renderFocusCard() {
    const container = document.getElementById('dash-focus-list');
    if (!container) return;

    // 优先使用用户自定义的任务
    if (customFocusIds && customFocusIds.length > 0) {
      try {
        const tasks = [];
        for (const id of customFocusIds) {
          const task = await Storage.get('tasks', id);
          if (task) tasks.push(task);
        }
        focusTasks = tasks;
      } catch (e) {
        focusTasks = [];
      }
    }

    // 如果没有自定义，使用推荐
    if (focusTasks.length === 0) {
      try {
        // 优先尝试 AI 推荐
        const aiResult = await getAIRecommendations();
        if (aiResult && (aiResult.taskIds?.length > 0 || aiResult.newTasks?.length > 0)) {
          focusTasks = [];
          const usedReasons = [];

          // 从已有任务中获取
          for (let i = 0; i < (aiResult.taskIds || []).length && focusTasks.length < 3; i++) {
            const task = await Storage.get('tasks', aiResult.taskIds[i]);
            if (task && task.status !== 'done' && task.status !== 'completed') {
              task._aiReason = (aiResult.reasons || [])[i] || 'AI 推荐';
              focusTasks.push(task);
            }
          }

          // 补充 AI 建议的新任务
          for (const nt of (aiResult.newTasks || [])) {
            if (focusTasks.length >= 3) break;
            focusTasks.push({
              id: `new_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
              title: nt.title,
              priority: nt.priority || 'medium',
              _aiReason: nt.reason || 'AI 建议',
              _isNew: true
            });
          }
        }

        // AI 不可用或失败，降级为本地排序
        if (focusTasks.length === 0) {
          const localTasks = await getLocalRecommendations();
          focusTasks = localTasks.slice(focusOffset, focusOffset + 3);
          if (focusTasks.length < 3 && localTasks.length > focusTasks.length) {
            const focusTaskIds = new Set(focusTasks.map(t => t.id));
            const remaining = localTasks.filter(t => !focusTaskIds.has(t.id));
            focusTasks = focusTasks.concat(remaining.slice(0, 3 - focusTasks.length));
          }
        }
      } catch (e) {
        console.warn('[Dashboard] 推荐加载失败:', e);
        focusTasks = [];
      }
    }

    if (focusTasks.length === 0) {
      container.innerHTML = `
        <div class="dash-focus-empty">
          <span class="dash-focus-empty-icon">✨</span>
          <p>暂无待办任务，享受当下吧！</p>
        </div>
      `;
      return;
    }

    const priorityLabels = { A: '紧急重要', B: '重要', C: '一般', D: '低', high: '高', medium: '中', low: '低' };
    const priorityColors = { A: '#E74C3C', B: '#F5A623', C: '#E67E22', D: '#95A5A6', high: '#E74C3C', medium: '#F5A623', low: '#95A5A6' };

    container.innerHTML = focusTasks.map((task, idx) => {
      const pLabel = priorityLabels[task.priority] || '普通';
      const pColor = priorityColors[task.priority] || '#95A5A6';
      const dueInfo = task.dueDate ? `截止 ${task.dueDate.slice(5)}` : '无截止日';
      const aiBadge = task._aiReason ? `<span class="dash-focus-ai-badge">🤖 ${escapeHtml(task._aiReason)}</span>` : '';
      const checkHtml = task._isNew
        ? `<button class="dash-focus-create-btn" data-task-idx="${idx}" title="创建此任务">➕</button>`
        : `<input type="checkbox" class="dash-focus-checkbox" data-task-id="${task.id}">`;
      return `
        <div class="dash-focus-item${task._isNew ? ' dash-focus-new' : ''}" data-task-id="${task.id}">
          <div class="dash-focus-check">${checkHtml}</div>
          <div class="dash-focus-info">
            <span class="dash-focus-task-title">${escapeHtml(task.title || '未命名任务')}</span>
            <span class="dash-focus-task-meta">
              <span class="dash-focus-priority" style="background:${pColor}20;color:${pColor}">${pLabel}</span>
              <span class="dash-focus-due">${dueInfo}</span>
            </span>
          </div>
        </div>
      `;
    }).join('');

    // 绑定勾选事件
    container.querySelectorAll('.dash-focus-checkbox').forEach(cb => {
      _bindEvent(cb, 'change', async (e) => {
        const taskId = parseInt(e.target.dataset.taskId);
        if (e.target.checked) {
          await completeFocusTask(taskId);
        }
      });
    });
  }

  /**
   * 完成聚焦任务
   */
  async function completeFocusTask(taskId) {
    try {
      const task = await Storage.get('tasks', taskId);
      if (task) {
        task.status = 'done';
        task.completedAt = new Date().toISOString();
        await Storage.put('tasks', task);
      }
      // 视觉反馈
      const item = document.querySelector(`.dash-focus-item[data-task-id="${taskId}"]`);
      if (item) {
        item.classList.add('completed');
        setTimeout(() => {
          // 从列表中移除并刷新
          focusTasks = focusTasks.filter(t => t.id !== taskId);
          renderFocusCard();
        }, 600);
      }
    } catch (err) {
      console.error('[Dashboard] 完成任务失败:', err);
    }
  }

  /**
   * 绑定聚焦卡片事件
   */
  function bindFocusEvents() {
    // 换一批
    const refreshBtn = document.getElementById('dash-focus-refresh');
    if (refreshBtn) {
      _bindEvent(refreshBtn, 'click', () => {
        customFocusIds = null;
        focusTasks = [];
        focusOffset += 3;
        renderFocusCard();
      });
    }

    // 自定义
    const customizeBtn = document.getElementById('dash-focus-customize');
    _bindEvent(customizeBtn, 'click', () => showCustomFocusModal());

    // 自定义弹窗关闭
    const closeBtn = document.getElementById('dash-custom-focus-close');
    if (closeBtn) {
      _bindEvent(closeBtn, 'click', () => {
        document.getElementById('dash-custom-focus-overlay').style.display = 'none';
      });
    }

    // 自定义弹窗确认
    const confirmBtn = document.getElementById('dash-custom-focus-confirm');
    if (confirmBtn) {
      _bindEvent(confirmBtn, 'click', () => {
        const checked = document.querySelectorAll('#dash-custom-task-list input:checked');
        customFocusIds = Array.from(checked).slice(0, 3).map(cb => parseInt(cb.dataset.taskId));
        focusTasks = [];
        focusOffset = 0;
        document.getElementById('dash-custom-focus-overlay').style.display = 'none';
        renderFocusCard();
      });
    }

    // 点击遮罩关闭
    const overlay = document.getElementById('dash-custom-focus-overlay');
    if (overlay) {
      _bindEvent(overlay, 'click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    }
  }

  /**
   * 显示自定义任务选择弹窗
   */
  async function showCustomFocusModal() {
    const overlay = document.getElementById('dash-custom-focus-overlay');
    const listEl = document.getElementById('dash-custom-task-list');
    if (!overlay || !listEl) return;

    try {
      const allTasks = await Storage.getAll('tasks');
      const todoTasks = allTasks.filter(t => t.status === 'todo');

      if (todoTasks.length === 0) {
        listEl.innerHTML = '<div class="dash-modal-empty">暂无待办任务</div>';
      } else {
        const customFocusIdSet = customFocusIds ? new Set(customFocusIds) : null;
        listEl.innerHTML = todoTasks.map(task => `
          <label class="dash-modal-task-item">
            <input type="checkbox" data-task-id="${task.id}" ${customFocusIdSet && customFocusIdSet.has(task.id) ? 'checked' : ''}>
            <span class="dash-modal-task-name">${escapeHtml(task.title || '未命名任务')}</span>
            ${task.dueDate ? `<span class="dash-modal-task-due">${task.dueDate.slice(5)}</span>` : ''}
          </label>
        `).join('');

        // 限制最多选3个
        const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
          _bindEvent(cb, 'change', () => {
            const checked = listEl.querySelectorAll('input:checked');
            if (checked.length > 3) {
              cb.checked = false;
            }
          });
        });
      }
    } catch (e) {
      listEl.innerHTML = '<div class="dash-modal-empty">加载失败</div>';
    }

    overlay.style.display = 'flex';
  }

  // ===== F5: 年度回顾 =====

  /**
   * 绑定年度回顾事件
   */
  function bindAnnualEvents() {
    const btn = document.getElementById('dash-annual-btn');
    const closeBtn = document.getElementById('dash-annual-close');
    const overlay = document.getElementById('dash-annual-overlay');

    _bindEvent(btn, 'click', () => showAnnualReview(new Date().getFullYear()));

    if (closeBtn) {
      _bindEvent(closeBtn, 'click', () => {
        if (overlay) overlay.style.display = 'none';
      });
    }
    if (overlay) {
      _bindEvent(overlay, 'click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    }
  }

  /**
   * 显示年度回顾
   */
  async function showAnnualReview(year) {
    const yearEl = document.getElementById('dash-annual-year');
    const bodyEl = document.getElementById('dash-annual-body');
    const overlay = document.getElementById('dash-annual-overlay');
    if (!yearEl || !bodyEl || !overlay) return;

    yearEl.textContent = year;
    bodyEl.innerHTML = '<div class="dash-annual-loading">加载中...</div>';
    overlay.style.display = 'flex';

    try {
      const yearStr = String(year);
      const cards = [];

      // 1. 习惯：全年打卡总次数、最长连续天数
      try {
        const allCheckins = await Storage.getAll('checkins');
        const yearCheckins = allCheckins.filter(c => c.date && c.date.startsWith(yearStr));
        const totalCheckins = yearCheckins.length;
        // 最长连续天数
        const dates = yearCheckins.map(c => c.date).sort();
        let maxStreak = 0, curStreak = 1;
        for (let i = 1; i < dates.length; i++) {
          const prev = new Date(dates[i-1]);
          const curr = new Date(dates[i]);
          const diff = (curr - prev) / (1000*60*60*24);
          if (diff === 1) { curStreak++; } else { maxStreak = Math.max(maxStreak, curStreak); curStreak = 1; }
        }
        if (dates.length > 0) maxStreak = Math.max(maxStreak, curStreak);
        cards.push({ icon: '✅', title: '习惯打卡', items: [
          { label: '打卡天数', value: `${totalCheckins} 天` },
          { label: '最长连续', value: `${maxStreak} 天` }
        ]});
      } catch (e) { cards.push({ icon: '✅', title: '习惯打卡', items: [{ label: '数据', value: '暂无' }]}); }

      // 2. 任务：完成总数、各优先级完成数
      try {
        const allTasks = await Storage.getAll('tasks');
        const yearTasks = allTasks.filter(t => t.completedAt && t.completedAt.startsWith(yearStr));
        const doneCount = yearTasks.length;
        const byPriority = {};
        yearTasks.forEach(t => {
          const p = t.priority || '未分类';
          byPriority[p] = (byPriority[p] || 0) + 1;
        });
        const prioStr = Object.entries(byPriority).map(([k,v]) => `${k}: ${v}`).join('、') || '无';
        cards.push({ icon: '📋', title: '任务管理', items: [
          { label: '完成任务', value: `${doneCount} 个` },
          { label: '优先级分布', value: prioStr }
        ]});
      } catch (e) { cards.push({ icon: '📋', title: '任务管理', items: [{ label: '数据', value: '暂无' }]}); }

      // 3. 健康：运动总次数、总时长
      try {
        const allHealth = await Storage.getAll('health');
        const yearHealth = allHealth.filter(h => h.date && h.date.startsWith(yearStr));
        let totalExercises = 0, totalDuration = 0;
        yearHealth.forEach(h => {
          if (h.exercises && Array.isArray(h.exercises)) {
            totalExercises += h.exercises.length;
            totalDuration += h.exercises.reduce((s, e) => s + (e.duration || 0), 0);
          }
        });
        cards.push({ icon: '💪', title: '健康运动', items: [
          { label: '运动次数', value: `${totalExercises} 次` },
          { label: '运动时长', value: `${totalDuration} 分钟` }
        ]});
      } catch (e) { cards.push({ icon: '💪', title: '健康运动', items: [{ label: '数据', value: '暂无' }]}); }

      // 4. 财务：总收入/总支出/净储蓄
      try {
        const allFinance = await Storage.getAll('finance');
        const yearFinance = allFinance.filter(f => f.date && f.date.startsWith(yearStr));
        const totalIncome = yearFinance.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0);
        const totalExpense = yearFinance.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0);
        const netSavings = totalIncome - totalExpense;
        cards.push({ icon: '💰', title: '财务管理', items: [
          { label: '总收入', value: `¥${totalIncome.toLocaleString()}` },
          { label: '总支出', value: `¥${totalExpense.toLocaleString()}` },
          { label: '净储蓄', value: `¥${netSavings.toLocaleString()}` }
        ]});
      } catch (e) { cards.push({ icon: '💰', title: '财务管理', items: [{ label: '数据', value: '暂无' }]}); }

      // 5. 学习：学习总时长、完成课程数
      try {
        const allStudy = await Storage.getAll('study');
        const yearStudy = allStudy.filter(s => s.date && s.date.startsWith(yearStr));
        const totalMinutes = yearStudy.reduce((s, r) => s + (r.minutes || 0), 0);
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        cards.push({ icon: '📚', title: '学习成长', items: [
          { label: '学习时长', value: `${hours}h ${mins}m` },
          { label: '学习记录', value: `${yearStudy.length} 次` }
        ]});
      } catch (e) { cards.push({ icon: '📚', title: '学习成长', items: [{ label: '数据', value: '暂无' }]}); }

      // 6. 关系：新增联系人数、健康度最高的人
      try {
        const allContacts = await Storage.getAll('contacts');
        const yearContacts = allContacts.filter(c => c.createdAt && c.createdAt.startsWith(yearStr));
        let bestContact = '—';
        if (allContacts.length > 0) {
          // 找 lastContactDate 最近的人
          const sorted = allContacts
            .filter(c => c.lastContactDate)
            .sort((a, b) => (b.lastContactDate || '').localeCompare(a.lastContactDate || ''));
          if (sorted.length > 0) bestContact = sorted[0].name || '—';
        }
        cards.push({ icon: '🤝', title: '人际关系', items: [
          { label: '新增联系人', value: `${yearContacts.length} 人` },
          { label: '最活跃联系', value: bestContact }
        ]});
      } catch (e) { cards.push({ icon: '🤝', title: '人际关系', items: [{ label: '数据', value: '暂无' }]}); }

      // 渲染卡片列表
      bodyEl.innerHTML = cards.map(c => `
        <div class="dash-annual-card">
          <div class="dash-annual-card-header">
            <span class="dash-annual-card-icon">${c.icon}</span>
            <span class="dash-annual-card-title">${c.title}</span>
          </div>
          <div class="dash-annual-card-items">
            ${c.items.map(item => `
              <div class="dash-annual-item">
                <span class="dash-annual-item-label">${item.label}</span>
                <span class="dash-annual-item-value">${item.value}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

    } catch (err) {
      console.error('[Dashboard] 年度回顾加载失败:', err);
      bodyEl.innerHTML = '<div class="dash-annual-loading">加载失败，请重试</div>';
    }
  }


  // ===== v95: 今日推荐 =====
  /**
   * 今日推荐：静态素材库 + AI 动态生成
   * 每天 8:00 后首次打开触发更新，localStorage 缓存当日结果
   */

  // 分类配置
  const DAILY_RECOMMEND_CATEGORIES = {
    tea:    { key: 'tea',    label: '今日茶饮',     emoji: '🍵', accent: '#6B9E7D' },
    food:   { key: 'food',   label: '今日饮食',     emoji: '🍜', accent: '#E8A87C' },
    sport:  { key: 'sport',  label: '今日运动',     emoji: '🏃', accent: '#5B8DB8' },
    health: { key: 'health', label: '今日养生提示', emoji: '💡', accent: '#D98CA0' }
  };

  // ===== 静态素材库（按季节/节气分类，通用不按体质筛选） =====
  const DAILY_RECOMMEND_POOL = {
    tea: {
      spring: [
        { name: '玫瑰花茶', desc: '疏肝理气，温养心脉，适合春日升发', tags: ['疏肝', '养颜', '温性'] },
        { name: '茉莉绿茶', desc: '清香醒脾，提神解郁，缓解春困', tags: ['提神', '解郁', '清润'] },
        { name: '陈皮普洱茶', desc: '健脾燥湿，理气和胃，化湿解腻', tags: ['健脾', '祛湿', '温性'] },
        { name: '桂花乌龙茶', desc: '温胃散寒，化痰散瘀，香气怡人', tags: ['温胃', '散寒', '理气'] },
        { name: '枸杞菊花茶', desc: '清肝明目，滋阴润燥，适合久视人群', tags: ['明目', '养肝', '清润'] },
        { name: '佛手柑红茶', desc: '疏肝和胃，行气解郁，口感温润', tags: ['疏肝', '和胃', '温性'] },
        { name: '生姜红枣茶', desc: '温中散寒，补气养血，晨起暖身', tags: ['暖身', '驱寒', '补血'] },
        { name: '蜂蜜柚子茶', desc: '理气化痰，润肺清肠，酸甜适口', tags: ['润肺', '化痰', '清爽'] },
        { name: '大麦茶', desc: '健脾消食，下气利水，解腻开胃', tags: ['健脾', '消食', '平性'] },
        { name: '合欢花茶', desc: '解郁安神，理气和胃，舒缓情绪', tags: ['安神', '解郁', '舒缓'] }
      ],
      summer: [
        { name: '冬瓜荷叶茶', desc: '清暑利湿，消脂利水，夏日清爽', tags: ['清暑', '祛湿', '消脂'] },
        { name: '绿豆汤', desc: '清热解毒，消暑利水，夏季必备', tags: ['清热', '解暑', '解毒'] },
        { name: '金银花茶', desc: '清热解毒，疏散风热，夏日常备', tags: ['清热', '解毒', '疏风'] },
        { name: '柠檬蜂蜜水', desc: '生津止渴，美白养颜，补充维C', tags: ['生津', '维C', '养颜'] },
        { name: '薄荷绿茶', desc: '疏风散热，清利头目，提神醒脑', tags: ['疏风', '清热', '提神'] },
        { name: '酸梅汤', desc: '生津止渴，敛肺止咳，开胃解腻', tags: ['生津', '开胃', '解暑'] },
        { name: '菊花茶', desc: '清肝明目，清热解毒，夏日降火', tags: ['清肝', '明目', '降火'] },
        { name: '百合莲子茶', desc: '清心安神，润肺止咳，夏日养心', tags: ['清心', '安神', '润肺'] },
        { name: '茅根竹蔗水', desc: '清热利尿，生津止渴，清润甘甜', tags: ['清热', '生津', '利尿'] },
        { name: '红豆薏米水', desc: '健脾祛湿，利水消肿，夏日常备', tags: ['祛湿', '健脾', '消肿'] },
        { name: '夏枯草茶', desc: '清肝泻火，散结消肿，降火明目', tags: ['清肝', '泻火', '散结'] },
        { name: '西洋参茶', desc: '补气养阴，清热生津，夏日补气不上火', tags: ['补气', '养阴', '清润'] }
      ],
      autumn: [
        { name: '银耳雪梨羹', desc: '润肺生津，滋阴润燥，秋季养生首选', tags: ['润肺', '滋阴', '润燥'] },
        { name: '蜂蜜柚子茶', desc: '理气化痰，润肺清肠，缓解秋燥', tags: ['润肺', '化痰', '清肠'] },
        { name: '桂花乌龙茶', desc: '温胃散寒，行气止痛，秋凉暖身', tags: ['温胃', '散寒', '理气'] },
        { name: '杏仁茶', desc: '润肺止咳，润肠通便，秋燥适宜', tags: ['润肺', '止咳', '润肠'] },
        { name: '陈皮山楂茶', desc: '理气健脾，消食化积，解腻开胃', tags: ['健脾', '消食', '理气'] },
        { name: '红枣桂圆茶', desc: '补气养血，安神健脾，秋日温补', tags: ['补血', '安神', '温性'] },
        { name: '麦冬枸杞茶', desc: '滋阴润肺，养肝明目，润燥生津', tags: ['滋阴', '润肺', '明目'] },
        { name: '罗汉果茶', desc: '清肺利咽，化痰止咳，秋季护嗓', tags: ['清肺', '利咽', '润喉'] },
        { name: '大麦茶', desc: '健脾消食，下气利水，养胃护胃', tags: ['健脾', '养胃', '平性'] },
        { name: '玉竹沙参茶', desc: '养阴润燥，生津止渴，秋季滋阴', tags: ['养阴', '润燥', '生津'] },
        { name: '梨汁藕粉', desc: '清热生津，润肺止咳，温润养胃', tags: ['润肺', '生津', '养胃'] }
      ],
      winter: [
        { name: '红糖姜茶', desc: '温中散寒，暖胃暖宫，冬日暖身首选', tags: ['暖身', '驱寒', '温胃'] },
        { name: '红枣桂圆茶', desc: '补气养血，安神健脾，冬季温补', tags: ['补血', '安神', '温补'] },
        { name: '当归红枣茶', desc: '补血活血，调经止痛，冬日养颜', tags: ['补血', '活血', '养颜'] },
        { name: '黄芪枸杞茶', desc: '补气升阳，养肝明目，增强体质', tags: ['补气', '养肝', '增强免疫'] },
        { name: '肉桂红茶', desc: '温中补阳，散寒止痛，暖身驱寒', tags: ['温阳', '驱寒', '暖身'] },
        { name: '姜枣枸杞茶', desc: '温中散寒，补气养血，冬日日常', tags: ['驱寒', '补血', '温性'] },
        { name: '核桃芝麻糊', desc: '补肾益脑，养发乌发，冬日进补', tags: ['补肾', '养发', '益脑'] },
        { name: '陈皮普洱熟茶', desc: '健脾燥湿，暖胃护胃，消食解腻', tags: ['健脾', '暖胃', '祛湿'] },
        { name: '桂花红枣茶', desc: '温中散寒，补气养血，香气怡人', tags: ['散寒', '补血', '温胃'] },
        { name: '党参红枣茶', desc: '补中益气，养血安神，冬日补气', tags: ['补气', '养血', '安神'] },
        { name: '羊肉萝卜汤', desc: '温中补虚，益气补血，冬日进补佳品', tags: ['温补', '补虚', '益气'] },
        { name: '山药薏米粥', desc: '健脾祛湿，补肺益肾，温润养人', tags: ['健脾', '祛湿', '益肾'] }
      ]
    },
    food: {
      spring: [
        { name: '韭菜炒鸡蛋', desc: '温补肾阳，春升阳气，简单家常', tags: ['温阳', '补肾', '家常菜'] },
        { name: '香椿豆腐', desc: '清热解毒，健脾理气，应季春味', tags: ['清热', '健脾', '应季'] },
        { name: '春笋炒肉', desc: '清热化痰，益气和胃，鲜嫩可口', tags: ['清热', '化痰', '鲜嫩'] },
        { name: '菠菜猪肝汤', desc: '补血明目，养肝养血，春季养肝', tags: ['补血', '养肝', '明目'] },
        { name: '山药排骨汤', desc: '健脾益胃，补肺益肾，温润滋补', tags: ['健脾', '益肾', '滋补'] },
        { name: '荠菜馄饨', desc: '清热利水，平肝明目，春日鲜味', tags: ['清热', '平肝', '应季'] },
        { name: '红枣桂圆粥', desc: '补气养血，安神健脾，晨起养胃', tags: ['补血', '安神', '养胃'] },
        { name: '豆芽炒韭菜', desc: '疏肝理气，清热解毒，升发阳气', tags: ['疏肝', '清热', '升阳'] },
        { name: '枸杞叶猪肝汤', desc: '清肝明目，养血补虚，春季养肝', tags: ['清肝', '明目', '养血'] },
        { name: '小米南瓜粥', desc: '健脾和胃，补中益气，温和养胃', tags: ['健脾', '养胃', '平性'] },
        { name: '陈皮蒸排骨', desc: '理气健脾，消食开胃，鲜香入味', tags: ['健脾', '理气', '开胃'] }
      ],
      summer: [
        { name: '冬瓜薏米汤', desc: '清暑祛湿，利水消肿，夏日汤品首选', tags: ['清暑', '祛湿', '消肿'] },
        { name: '绿豆粥', desc: '清热解毒，消暑利水，夏日降温', tags: ['清热', '解暑', '解毒'] },
        { name: '苦瓜炒蛋', desc: '清热解毒，明目降火，夏日降火菜', tags: ['清热', '降火', '明目'] },
        { name: '丝瓜炒蛋', desc: '清热化痰，凉血解毒，清淡爽口', tags: ['清热', '化痰', '清淡'] },
        { name: '凉拌黄瓜', desc: '清热利水，解毒消肿，爽口开胃', tags: ['清热', '利水', '爽口'] },
        { name: '莲子百合粥', desc: '清心安神，润肺止咳，夏日养心', tags: ['清心', '安神', '润肺'] },
        { name: '酸汤鱼片', desc: '开胃健脾，清热解暑，酸辣开胃', tags: ['开胃', '健脾', '解暑'] },
        { name: '番茄鸡蛋汤', desc: '生津止渴，健胃消食，家常经典', tags: ['生津', '健胃', '家常'] },
        { name: '荷叶蒸饭', desc: '清暑利湿，健脾开胃，清香怡人', tags: ['清暑', '健脾', '祛湿'] },
        { name: '凉拌木耳', desc: '清肺润燥，益气补血，爽口养生', tags: ['清肺', '补血', '爽口'] },
        { name: '红豆薏米粥', desc: '健脾祛湿，利水消肿，夏日常备', tags: ['祛湿', '健脾', '消肿'] },
        { name: '清蒸鲈鱼', desc: '健脾益气，补肝肾，清淡鲜美', tags: ['健脾', '益气', '清淡'] }
      ],
      autumn: [
        { name: '银耳百合羹', desc: '润肺生津，滋阴润燥，秋季润燥首选', tags: ['润肺', '滋阴', '润燥'] },
        { name: '冰糖雪梨', desc: '润肺止咳，清热化痰，秋燥必备', tags: ['润肺', '止咳', '化痰'] },
        { name: '板栗烧鸡', desc: '健脾养胃，补肾强筋，秋日进补', tags: ['健脾', '补肾', '温补'] },
        { name: '山药炖排骨', desc: '健脾益胃，补肺益肾，温润滋补', tags: ['健脾', '益肾', '滋补'] },
        { name: '莲藕排骨汤', desc: '清热凉血，健脾开胃，秋季时令', tags: ['清热', '健脾', '应季'] },
        { name: '南瓜粥', desc: '健脾和胃，补中益气，温润养胃', tags: ['健脾', '养胃', '平性'] },
        { name: '白萝卜炖羊肉', desc: '温中补虚，益气补血，秋凉进补', tags: ['温补', '补虚', '益气'] },
        { name: '桂花糯米藕', desc: '健脾止泻，补中益气，香甜可口', tags: ['健脾', '益气', '甜品'] },
        { name: '栗子粥', desc: '健脾养胃，补肾强筋，秋日暖粥', tags: ['健脾', '补肾', '暖身'] },
        { name: '山楂糕', desc: '消食化积，活血散瘀，开胃解腻', tags: ['消食', '开胃', '解腻'] },
        { name: '杏仁露', desc: '润肺止咳，润肠通便，润燥养颜', tags: ['润肺', '止咳', '养颜'] }
      ],
      winter: [
        { name: '羊肉萝卜汤', desc: '温中补虚，益气补血，冬日进补首选', tags: ['温补', '补虚', '益气'] },
        { name: '红糖姜枣茶', desc: '温中散寒，暖胃暖宫，冬日暖身', tags: ['暖身', '驱寒', '温胃'] },
        { name: '当归黄芪炖鸡', desc: '补气养血，温中补虚，冬季大补', tags: ['补血', '补气', '温补'] },
        { name: '山药枸杞粥', desc: '健脾益肾，养肝明目，温润养人', tags: ['健脾', '益肾', '明目'] },
        { name: '板栗焖鸡', desc: '健脾养胃，补肾强筋，冬日家常菜', tags: ['健脾', '补肾', '家常'] },
        { name: '萝卜牛腩煲', desc: '健脾益胃，补气养血，冬日暖煲', tags: ['健脾', '补气', '暖身'] },
        { name: '桂圆红枣粥', desc: '补气养血，安神健脾，晨起暖粥', tags: ['补血', '安神', '温性'] },
        { name: '姜母鸭', desc: '温中补虚，滋阴补血，冬日经典', tags: ['温补', '补虚', '滋阴'] },
        { name: '核桃芝麻糊', desc: '补肾益脑，养发乌发，冬日进补', tags: ['补肾', '养发', '益脑'] },
        { name: '猪肚鸡汤', desc: '温中健脾，补气养血，养胃滋补', tags: ['健脾', '养胃', '滋补'] },
        { name: '四神汤', desc: '健脾祛湿，补肺益肾，温润平和', tags: ['健脾', '祛湿', '益肾'] },
        { name: '酒酿汤圆', desc: '补中益气，温胃散寒，甜蜜暖身', tags: ['补气', '暖身', '甜品'] }
      ]
    },
    sport: {
      spring: [
        { name: '晨间散步', desc: '春阳升发，晨起户外散步30分钟，舒展筋骨', tags: ['轻运动', '户外', '舒缓'] },
        { name: '八段锦', desc: '柔和养身，调理气血，适合春季阳气升发', tags: ['养生', '柔和', '气血'] },
        { name: '瑜伽拉伸', desc: '舒展肝经，柔筋健骨，缓解春困', tags: ['拉伸', '柔韧', '放松'] },
        { name: '慢跑', desc: '增强心肺，促进循环，春日慢跑神清气爽', tags: ['有氧', '心肺', '户外'] },
        { name: '太极拳', desc: '调和阴阳，疏通经络，春日养气首选', tags: ['养生', '调和', '气血'] },
        { name: '爬山踏青', desc: '亲近自然，登高望远，舒展身心', tags: ['户外', '有氧', '愉悦'] },
        { name: '放风筝', desc: '活动肩颈，放松眼睛，春日趣味运动', tags: ['趣味', '户外', '肩颈'] },
        { name: '快走', desc: '提升代谢，促进循环，简单易坚持', tags: ['有氧', '代谢', '易坚持'] },
        { name: '跳绳', desc: '全身燃脂，提高协调，高效有氧', tags: ['燃脂', '全身', '高效'] }
      ],
      summer: [
        { name: '游泳', desc: '全身运动，消暑降温，夏日首选运动', tags: ['全身', '消暑', '有氧'] },
        { name: '清晨瑜伽', desc: '避开高温，晨起练习，唤醒身体', tags: ['舒缓', '柔韧', '晨起'] },
        { name: '室内骑行', desc: '有氧运动，避开烈日，高效燃脂', tags: ['有氧', '燃脂', '室内'] },
        { name: '羽毛球', desc: '全身协调，反应训练，趣味对抗', tags: ['对抗', '协调', '趣味'] },
        { name: '傍晚慢跑', desc: '气温下降，户外慢跑，清爽舒适', tags: ['有氧', '户外', '傍晚'] },
        { name: '水上瑜伽', desc: '舒缓放松，保护关节，夏日降温', tags: ['舒缓', '放松', '水中'] },
        { name: '跳绳', desc: '高效燃脂，提升心肺，短时高效', tags: ['燃脂', '心肺', '高效'] },
        { name: '乒乓球', desc: '眼手协调，反应训练，室内运动', tags: ['协调', '反应', '室内'] },
        { name: '普拉提', desc: '核心强化，体态调整，室内塑形', tags: ['核心', '塑形', '室内'] },
        { name: '太极', desc: '心静体松，调和阴阳，夏练三伏', tags: ['养生', '调和', '舒缓'] }
      ],
      autumn: [
        { name: '登山赏秋', desc: '登高望远，秋日美景，有氧运动', tags: ['户外', '有氧', '愉悦'] },
        { name: '慢跑', desc: '秋高气爽，户外慢跑，增强心肺', tags: ['有氧', '心肺', '户外'] },
        { name: '骑行', desc: '秋日骑行，风景宜人，全身运动', tags: ['有氧', '户外', '全身'] },
        { name: '羽毛球', desc: '气温适宜，对抗运动，全身协调', tags: ['对抗', '协调', '趣味'] },
        { name: '八段锦', desc: '养肺润燥，调和气血，秋季养生', tags: ['养生', '养肺', '气血'] },
        { name: '太极拳', desc: '秋收冬藏，静养心神，调和阴阳', tags: ['养生', '静心', '调和'] },
        { name: '快走', desc: '秋日健走，强身健体，简单易行', tags: ['有氧', '代谢', '易坚持'] },
        { name: '网球', desc: '全身运动，反应训练，户外对抗', tags: ['对抗', '全身', '户外'] },
        { name: '瑜伽', desc: '柔韧拉伸，舒缓压力，秋收内敛', tags: ['柔韧', '放松', '舒缓'] },
        { name: '徒步', desc: '亲近自然，锻炼耐力，秋日远足', tags: ['户外', '耐力', '自然'] }
      ],
      winter: [
        { name: '室内瑜伽', desc: '温暖室内，舒展筋骨，调养身心', tags: ['柔韧', '放松', '室内'] },
        { name: '跳绳', desc: '高效燃脂，快速暖身，冬日运动首选', tags: ['燃脂', '暖身', '高效'] },
        { name: '健身房力量训练', desc: '冬藏积蓄，增肌塑形，提升代谢', tags: ['力量', '增肌', '室内'] },
        { name: '八段锦', desc: '温和养身，驱寒暖身，室内可练', tags: ['养生', '驱寒', '温和'] },
        { name: '太极拳', desc: '冬练三九，养精蓄锐，增强体质', tags: ['养生', '增强体质', '调和'] },
        { name: '室内游泳', desc: '恒温泳池，全身运动，锻炼心肺', tags: ['全身', '心肺', '室内'] },
        { name: '爬楼梯', desc: '高效燃脂，提升心肺，随时随地', tags: ['燃脂', '心肺', '便捷'] },
        { name: 'HIIT 训练', desc: '高强度间歇，短时高效，快速燃脂', tags: ['燃脂', '高效', '短时'] },
        { name: '普拉提', desc: '核心强化，体态调整，室内塑形', tags: ['核心', '塑形', '室内'] },
        { name: '冬日长跑', desc: '锻炼意志，增强心肺，做好保暖', tags: ['有氧', '意志', '户外'] },
        { name: '室内骑行', desc: '有氧运动，温暖室内，高效燃脂', tags: ['有氧', '燃脂', '室内'] }
      ]
    },
    health: {
      spring: [
        { name: '夜卧早起', desc: '顺应春升之气，晚睡早起，舒展形体', tags: ['作息', '春生', '舒展'] },
        { name: '梳头百下', desc: '疏通头部经络，提神醒脑，升发阳气', tags: ['经络', '提神', '头面'] },
        { name: '揉按太冲穴', desc: '疏肝解郁，清肝泻火，缓解情绪', tags: ['疏肝', '解郁', '穴位'] },
        { name: '多吃绿色食物', desc: '青色入肝，多食绿叶蔬菜助养肝', tags: ['饮食', '养肝', '绿色'] },
        { name: '春日踏青', desc: '亲近自然，疏解肝郁，舒畅情志', tags: ['情志', '户外', '养肝'] },
        { name: '防风御寒', desc: '春捂秋冻，不急减衣，防风寒侵袭', tags: ['起居', '保暖', '防风'] },
        { name: '伸懒腰拉伸', desc: '舒展筋骨，疏通经络，缓解春困', tags: ['拉伸', '经络', '春困'] },
        { name: '少食酸味', desc: '春日省酸增甘，以养脾气，健脾为先', tags: ['饮食', '健脾', '养生原则'] },
        { name: '按摩足三里', desc: '健脾和胃，扶正培元，强身健体', tags: ['健脾', '穴位', '强身'] },
        { name: '早起深呼吸', desc: '吐故纳新，清肺理气，提升能量', tags: ['呼吸', '清肺', '晨起'] }
      ],
      summer: [
        { name: '午睡养心', desc: '午时小憩，养心安神，补充精力', tags: ['作息', '养心', '安神'] },
        { name: '多吃红色食物', desc: '赤色入心，多食红豆番茄养心', tags: ['饮食', '养心', '红色'] },
        { name: '心静自然凉', desc: '调息静心，避免情绪过激，心火自消', tags: ['情志', '静心', '降火'] },
        { name: '温水洗澡', desc: '温水清洁，舒张毛孔，降温消暑', tags: ['起居', '消暑', '清洁'] },
        { name: '少食生冷', desc: '夏日脾胃虚寒，忌过食生冷伤阳', tags: ['饮食', '健脾', '禁忌'] },
        { name: '出汗有度', desc: '夏宜出汗但不可大汗淋漓，耗伤心液', tags: ['运动', '适度', '养心'] },
        { name: '按揉内关穴', desc: '宁心安神，理气止痛，护心要穴', tags: ['养心', '穴位', '安神'] },
        { name: '饮食清淡', desc: '夏日饮食宜清淡，少油少盐护脾胃', tags: ['饮食', '清淡', '健脾'] },
        { name: '补钾防困', desc: '多吃含钾食物，缓解夏日疲倦乏力', tags: ['饮食', '补钾', '抗疲劳'] },
        { name: '冬病夏治', desc: '三伏天艾灸贴敷，温阳散寒治冬病', tags: ['艾灸', '温阳', '调理'] },
        { name: '避免直吹空调', desc: '空调温度不宜过低，防止风寒入侵', tags: ['起居', '保暖', '禁忌'] }
      ],
      autumn: [
        { name: '早卧早起', desc: '顺应秋收之气，早睡早起，收敛神气', tags: ['作息', '秋收', '收敛'] },
        { name: '润肺防燥', desc: '秋燥伤肺，多食润肺食物，多喝水', tags: ['润肺', '防燥', '饮食'] },
        { name: '多吃白色食物', desc: '白色入肺，多食百合银耳雪梨润肺', tags: ['饮食', '润肺', '白色'] },
        { name: '登高望远', desc: '秋高气爽，登山远眺，舒缓情志', tags: ['情志', '户外', '舒缓'] },
        { name: '按揉迎香穴', desc: '润肺通窍，缓解鼻干，预防秋燥', tags: ['润肺', '穴位', '通窍'] },
        { name: '秋冻有度', desc: '秋冻适度，增强耐寒能力，循序渐进', tags: ['起居', '耐寒', '适度'] },
        { name: '少辛增酸', desc: '秋日省辛增酸，收敛肺气，养肝血', tags: ['饮食', '养肺', '养生原则'] },
        { name: '保持心情舒畅', desc: '秋悲易忧，调畅情志，避免悲秋', tags: ['情志', '调畅', '防悲秋'] },
        { name: '按摩鱼际穴', desc: '清肺利咽，调理肺气，秋季护肺', tags: ['养肺', '穴位', '利咽'] },
        { name: '温水泡脚', desc: '温通经络，促进循环，改善睡眠', tags: ['经络', '睡眠', '温通'] },
        { name: '补充津液', desc: '秋季干燥，及时补水，多吃生津食物', tags: ['饮食', '生津', '润燥'] }
      ],
      winter: [
        { name: '早卧晚起', desc: '顺应冬藏之气，早睡晚起，养精蓄锐', tags: ['作息', '冬藏', '养精'] },
        { name: '多吃黑色食物', desc: '黑色入肾，多食黑豆黑芝麻补肾', tags: ['饮食', '补肾', '黑色'] },
        { name: '注意保暖', desc: '冬日防寒，尤其头脚背保暖', tags: ['起居', '保暖', '防寒'] },
        { name: '温水泡脚', desc: '温经散寒，补肾安神，冬日必备', tags: ['驱寒', '补肾', '安神'] },
        { name: '按揉涌泉穴', desc: '补肾固元，引火归元，冬日养肾', tags: ['补肾', '穴位', '固本'] },
        { name: '晒背补阳', desc: '冬日晒背，温补阳气，驱寒暖身', tags: ['补阳', '驱寒', '自然疗法'] },
        { name: '减少出汗', desc: '冬宜闭藏，少出汗以护阳气', tags: ['运动', '适度', '闭藏'] },
        { name: '膏方进补', desc: '冬令进补，膏方调养，增强体质', tags: ['进补', '调理', '增强体质'] },
        { name: '艾灸关元穴', desc: '温补肾阳，培元固本，冬日保健', tags: ['艾灸', '补肾', '温阳'] },
        { name: '静养心神', desc: '冬主闭藏，静养心神，收敛精气', tags: ['情志', '静养', '闭藏'] },
        { name: '多喝热水', desc: '冬日温饮，护胃暖身，促进代谢', tags: ['饮食', '暖身', '代谢'] },
        { name: '搓手暖耳', desc: '促进末梢循环，防止冻伤，提神醒脑', tags: ['经络', '循环', '防冻'] }
      ]
    }
  };

  /**
   * 获取当前季节
   */
  function _getSeason() {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  }

  /**
   * 获取当前节气名称（最近的节气）
   */
  function _getCurrentSolarTermName() {
    const today = new Date();
    const year = today.getFullYear();
    const solarTerms = [
      { name: '小寒', m: 0, d: 5 },  { name: '大寒', m: 0, d: 20 },
      { name: '立春', m: 1, d: 4 },  { name: '雨水', m: 1, d: 18 },
      { name: '惊蛰', m: 2, d: 5 },  { name: '春分', m: 2, d: 20 },
      { name: '清明', m: 3, d: 5 },  { name: '谷雨', m: 3, d: 20 },
      { name: '立夏', m: 4, d: 5 },  { name: '小满', m: 4, d: 21 },
      { name: '芒种', m: 5, d: 5 },  { name: '夏至', m: 5, d: 21 },
      { name: '小暑', m: 6, d: 7 },  { name: '大暑', m: 6, d: 22 },
      { name: '立秋', m: 7, d: 7 },  { name: '处暑', m: 7, d: 23 },
      { name: '白露', m: 8, d: 7 },  { name: '秋分', m: 8, d: 23 },
      { name: '寒露', m: 9, d: 8 },  { name: '霜降', m: 9, d: 23 },
      { name: '立冬', m: 10, d: 7 }, { name: '小雪', m: 10, d: 22 },
      { name: '大雪', m: 11, d: 7 }, { name: '冬至', m: 11, d: 21 }
    ];
    const todayMs = new Date(year, today.getMonth(), today.getDate()).getTime();
    let current = solarTerms[0];
    for (const term of solarTerms) {
      const termMs = new Date(year, term.m, term.d).getTime();
      if (termMs <= todayMs) current = term;
    }
    return current.name;
  }

  /**
   * 根据日期确定今日推荐索引（确定性伪随机，按日期轮换）
   */
  function _getDailyIndex(seedStr, total) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % total;
  }

  /**
   * 从静态素材库获取今日推荐（按季节+日期轮换）
   */
  function _getStaticRecommendations() {
    const season = _getSeason();
    const todayStr = getTodayStr();
    const result = {};
    for (const key of Object.keys(DAILY_RECOMMEND_CATEGORIES)) {
      const pool = DAILY_RECOMMEND_POOL[key]?.[season] || [];
      if (pool.length === 0) continue;
      const idx = _getDailyIndex(todayStr + key, pool.length);
      result[key] = pool[idx];
    }
    return result;
  }

  /**
   * 调用 DeepSeek AI 动态生成今日推荐
   */
  async function _getAIRecommendations() {
    let token = null;
    try {
      if (window.SecureStorage?.loadSecure) {
        token = await window.SecureStorage?.loadSecure('deepseek_token');
      }
      if (!token) {
        const setting = await Storage.get('settings', 'deepseek_token');
        token = setting ? setting.value : null;
      }
    } catch (e) { /* 无 token */ }

    // 如果用户未配置 token，使用题目中提供的备用 key
    if (!token) {
      token = 'sk-7d26426c7c0c456981042a89800abdc3';
    }

    const season = _getSeason();
    const seasonMap = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' };
    const termName = _getCurrentSolarTermName();
    const todayStr = getTodayStr();

    const seasonCn = seasonMap[season] || '秋季';
    const constitution = '脾虚寒、湿气重、中焦不通、气血不足';

    const prompt = `你是养生专家，请为今日（${todayStr}，${seasonCn}，节气：${termName}）生成4条推荐。
用户体质：${constitution}。但推荐内容以时令通用为主，兼顾体质。

请输出严格的 JSON 格式，包含4个分类，每个分类包含 name、desc、tags（2-3个标签）：
{
  "tea":    { "name": "茶饮名称", "desc": "一句话说明功效", "tags": ["标签1", "标签2"] },
  "food":   { "name": "饮食名称", "desc": "一句话说明功效", "tags": ["标签1", "标签2"] },
  "sport":  { "name": "运动名称", "desc": "一句话说明功效", "tags": ["标签1", "标签2"] },
  "health": { "name": "养生提示", "desc": "一句话说明内容", "tags": ["标签1", "标签2"] }
}

要求：
1. 结合${seasonCn}季节特点和${termName}节气特点
2. 内容丰富实用，贴近日常
3. 名称简洁，说明在20-30字之间
4. 标签2-3个，4个字以内
5. 只输出JSON，不要其他文字`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 600
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        console.warn('[DailyRecommend] AI 请求失败:', resp.status);
        return null;
      }

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) return null;

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const result = JSON.parse(jsonMatch[0]);

      // 校验结构
      const required = ['tea', 'food', 'sport', 'health'];
      for (const key of required) {
        if (!result[key] || !result[key].name || !result[key].desc) {
          console.warn('[DailyRecommend] AI 结果缺少字段:', key);
          return null;
        }
        if (!Array.isArray(result[key].tags)) result[key].tags = [];
      }

      return result;
    } catch (e) {
      console.warn('[DailyRecommend] AI 调用异常:', e.message);
      return null;
    }
  }

  /**
   * 检查是否需要更新（8点后新的一天）
   */
  function _shouldUpdateToday(cacheKey) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return true;
      const parsed = JSON.parse(cached);
      const today = getTodayStr();
      if (parsed.date !== today) return true;

      // 如果还没到8点，且缓存是昨天/更早，也已过期（上面 date 比较已处理）
      // 如果已到8点但缓存是今天8点前的，需要检查
      const nowHour = new Date().getHours();
      if (nowHour >= 8 && parsed.generatedHour !== undefined && parsed.generatedHour < 8) {
        return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  /**
   * 渲染今日推荐
   */
  async function renderDailyRecommend() {
    const track = document.getElementById('dash-daily-recommend-track');
    const updateEl = document.getElementById('dash-daily-recommend-update');
    if (!track) return;

    const cacheKey = `daily_recommend_${getTodayStr()}`;
    const now = new Date();
    const nowHour = now.getHours();

    // 1. 先展示静态数据（快速响应）
    let recommendations = _getStaticRecommendations();
    _renderRecommendCards(recommendations, 'static');
    if (updateEl) updateEl.textContent = nowHour >= 8 ? '每日 8:00 更新' : '今日 8:00 更新';

    // 2. 如果已到8点且需要更新，后台异步请求 AI
    if (nowHour >= 8 && _shouldUpdateToday(cacheKey)) {
      console.log('[DailyRecommend] 触发 AI 生成今日推荐...');
      const aiResult = await _getAIRecommendations();
      if (aiResult) {
        // AI 生成成功，缓存并更新展示
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            date: getTodayStr(),
            generatedHour: nowHour,
            source: 'ai',
            data: aiResult
          }));
        } catch (e) { /* 忽略存储错误 */ }
        recommendations = aiResult;
        _renderRecommendCards(recommendations, 'ai');
        if (updateEl) updateEl.textContent = '今日已更新 ✨';
      } else {
        // AI 失败，保留静态数据作为 fallback
        console.log('[DailyRecommend] AI 生成失败，使用静态素材');
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            date: getTodayStr(),
            generatedHour: nowHour,
            source: 'static',
            data: recommendations
          }));
        } catch (e) { /* 忽略 */ }
      }
    } else {
      // 未到8点或已有缓存，尝试读取缓存
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.data) {
            recommendations = parsed.data;
            _renderRecommendCards(recommendations, parsed.source || 'cached');
            if (updateEl && parsed.source === 'ai') {
              updateEl.textContent = '今日已更新 ✨';
            }
          }
        }
      } catch (e) { /* 忽略缓存错误 */ }
    }
  }

  /**
   * 渲染推荐卡片到 DOM
   */
  function _renderRecommendCards(recommendations, source) {
    const track = document.getElementById('dash-daily-recommend-track');
    if (!track) return;

    const order = ['tea', 'food', 'sport', 'health'];
    let html = '';

    for (const key of order) {
      const cat = DAILY_RECOMMEND_CATEGORIES[key];
      const item = recommendations[key];
      if (!cat || !item) continue;

      const tagsHtml = (item.tags || [])
        .slice(0, 3)
        .map(t => `<span class="dash-daily-card-tag">${escapeHtml(t)}</span>`)
        .join('');

      html += `
        <div class="dash-daily-card" style="--card-accent: ${cat.accent};" data-source="${source}">
          <span class="dash-daily-card-emoji">${cat.emoji}</span>
          <span class="dash-daily-card-category">${cat.label}</span>
          <div class="dash-daily-card-name">${escapeHtml(item.name)}</div>
          <div class="dash-daily-card-desc">${escapeHtml(item.desc)}</div>
          <div class="dash-daily-card-tags">${tagsHtml}</div>
        </div>
      `;
    }

    track.innerHTML = html;
  }

  // ===== v100: 今日文字推荐（金句 + 诗词双卡片） =====
  /**
   * 文字推荐：每天同时展示一条金句 + 一首诗词
   * 静态 JSON 数据 + 各自独立刷新按钮
   */

  const TEXT_CARD_CONFIG = {
    quote: {
      typeLabel: '📖 今日金句',
      textId: 'dash-quote-text',
      sourceId: 'dash-quote-source',
      refreshId: 'dash-quote-refresh',
      poolKey: 'quote'
    },
    poem: {
      typeLabel: '🏯 今日诗词',
      textId: 'dash-poem-text',
      sourceId: 'dash-poem-source',
      refreshId: 'dash-poem-refresh',
      poolKey: 'poem'
    }
  };

  let _textRecommendCache = null;
  const _textCardIdx = { quote: 0, poem: 0 };

  async function _loadTextRecommendData() {
    if (_textRecommendCache) return _textRecommendCache;
    try {
      const resp = await fetch('./data/daily-text-recommend.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      _textRecommendCache = await resp.json();
      return _textRecommendCache;
    } catch (e) {
      console.warn('[TextRecommend] 加载文字推荐数据失败:', e.message);
      // 内置兜底数据
      _textRecommendCache = {
        quote: [{ text: '今天也请好好生活 ✨', source: '人生工作台' }],
        poem: [{ text: '春有百花秋有月，夏有凉风冬有雪。', source: '无门慧开禅师' }],
        classic: [{ text: '天行健，君子以自强不息。', source: '《周易》' }],
        good: [{ text: '保持热爱，奔赴山海。', source: '佚名' }],
        lyric: [{ text: '夜空中最亮的星，请照亮我前行。', source: '逃跑计划' }]
      };
      return _textRecommendCache;
    }
  }

  function _getDailyTextIdx(seedStr, poolLength) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % poolLength;
  }

  function _renderTextCard(cardKey, item) {
    const cfg = TEXT_CARD_CONFIG[cardKey];
    if (!cfg) return;
    const textEl = document.getElementById(cfg.textId);
    const sourceEl = document.getElementById(cfg.sourceId);
    if (textEl) textEl.textContent = item.text || '';
    if (sourceEl) sourceEl.textContent = item.source ? `—— ${item.source}` : '';
  }

  function _bindTextCardRefresh(cardKey) {
    const cfg = TEXT_CARD_CONFIG[cardKey];
    if (!cfg) return;
    const btn = document.getElementById(cfg.refreshId);
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', () => {
      const data = _textRecommendCache;
      if (!data) return;
      const pool = data[cfg.poolKey] || data.quote;
      if (pool.length <= 1) return;
      // 随机选一个不同的
      let nextIdx = _textCardIdx[cardKey];
      while (nextIdx === _textCardIdx[cardKey]) {
        nextIdx = Math.floor(Math.random() * pool.length);
      }
      _textCardIdx[cardKey] = nextIdx;
      _renderTextCard(cardKey, pool[nextIdx]);
      // 旋转动画反馈
      btn.style.transition = 'transform 0.4s';
      btn.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 400);
    });
  }

  async function renderTextRecommend() {
    const data = await _loadTextRecommendData();
    const todayStr = getTodayStr();

    for (const cardKey of Object.keys(TEXT_CARD_CONFIG)) {
      const cfg = TEXT_CARD_CONFIG[cardKey];
      const pool = data[cfg.poolKey] || data.quote;
      const idx = _getDailyTextIdx(todayStr + cardKey, pool.length);
      _textCardIdx[cardKey] = idx;
      _renderTextCard(cardKey, pool[idx]);
      _bindTextCardRefresh(cardKey);
    }
  }

  // ===== v87: 倒计时 =====
  /**
   * 渲染倒计时（暑假余额 + 开学倒计时）
   */
  async function renderCountdown() {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // 暑假余额：到8月31日
    const augEnd = new Date(today.getFullYear(), 7, 31);
    const summerLeft = Math.ceil((augEnd - todayStart) / 86400000);

    // 开学倒计时：到9月1日
    const sepStart = new Date(today.getFullYear(), 8, 1);
    const schoolLeft = Math.ceil((sepStart - todayStart) / 86400000);

    const summerEl = document.getElementById('dash-summer-days');
    if (summerEl) summerEl.textContent = summerLeft >= 0 ? summerLeft : 0;

    const schoolEl = document.getElementById('dash-school-days');
    if (schoolEl) schoolEl.textContent = schoolLeft >= 0 ? schoolLeft : 0;
  }

  // ===== v87: 天气 + 农历/节气 =====

  // ===== v99: 每日卦象（增强版）=====
  /**
   * 渲染每日卦象（基于梅花易数，以当日0时起卦）
   * v99 增强：点击展开详情，显示爻线、卦辞、今日指引
   */
  async function renderDailyGua() {
    const card = document.getElementById('dash-daily-gua');
    if (!card) return;

    try {
      // 动态导入 DaoModule（避免循环依赖）
      const mod = await import('../dao/dao.js');
      if (!mod || !mod.DaoModule) return;

      const result = mod.DaoModule.getDailyGua(new Date());
      if (!result || !result.benGua) return;

      const bagua = mod.DaoModule.getBagua();
      const gua = result.benGua;

      // 日期
      const now = new Date();
      const dateEl = document.getElementById('dash-gua-date');
      if (dateEl) dateEl.textContent = `${now.getMonth()+1}月${now.getDate()}日`;

      // 卦象符号
      const symEl = document.getElementById('dash-gua-symbol');
      if (symEl && bagua[gua.upper]) symEl.textContent = bagua[gua.upper].symbol;

      // 卦名
      const nameEl = document.getElementById('dash-gua-name');
      if (nameEl) nameEl.textContent = `${gua.name} · 第${gua.idx}卦`;

      // 卦辞（摘要显示）
      const ciEl = document.getElementById('dash-gua-ci');
      if (ciEl) ciEl.textContent = gua.guaci;

      // === 展开详情 ===
      // 完整卦辞
      const fullCiEl = document.getElementById('dash-gua-full-ci');
      if (fullCiEl) fullCiEl.textContent = gua.guaci;

      // 解读/今日指引
      const jieduEl = document.getElementById('dash-gua-jiedu-text');
      if (jieduEl) {
        // 取解读的前两句话作为今日指引
        const jiedu = gua.jiedu || '';
        const sentences = jiedu.split(/[。！？]/).filter(s => s.trim().length > 0);
        const dailyTip = sentences.slice(0, 2).join('。') + '。';
        jieduEl.textContent = dailyTip || jiedu;
      }

      // 阴阳爻线
      const yaoEl = document.getElementById('dash-gua-yao-lines');
      if (yaoEl && gua.yaos) {
        // yaos 从上到下（索引0为上爻），渲染时从下到上展示更直观
        // 但64卦数据中 yaos 是从上到下，卦象展示习惯也是从上到下
        const yaoNames = ['上', '五', '四', '三', '二', '初'];
        yaoEl.innerHTML = gua.yaos.map((y, i) => {
          const isYang = y === 1;
          return `
            <div class="dash-yao-line ${isYang ? 'dash-yao-yang' : 'dash-yao-yin'}">
              ${isYang
                ? '<span class="dash-yao-bar dash-yao-full"></span>'
                : '<span class="dash-yao-bar dash-yao-half"></span><span class="dash-yao-gap"></span><span class="dash-yao-bar dash-yao-half"></span>'
              }
              <span class="dash-yao-label">${yaoNames[i]}${isYang ? '九' : '六'}</span>
            </div>
          `;
        }).join('');
      }

      // 点击展开/收起（仅当点击卡片主体时）
      let isExpanded = false;
      const detailEl = document.getElementById('dash-gua-detail');
      const hintEl = document.getElementById('dash-gua-hint');
      const moreLink = document.getElementById('dash-gua-more-link');

      function toggleExpand() {
        isExpanded = !isExpanded;
        if (detailEl) {
          detailEl.style.display = isExpanded ? 'block' : 'none';
        }
        if (hintEl) {
          hintEl.textContent = isExpanded ? '点击收起 ▲' : '点击展开详情 ↓';
        }
        card.classList.toggle('expanded', isExpanded);
      }

      // 卡片点击（排除more-link）
      card.addEventListener('click', (e) => {
        if (e.target.closest('#dash-gua-more-link')) return;
        toggleExpand();
      });

      // 查看详情链接跳转道模块
      if (moreLink) {
        moreLink.addEventListener('click', (e) => {
          e.stopPropagation();
          Router.navigate('dao', { tab: 'yijing' });
        });
      }
    } catch (e) {
      console.warn('[Dashboard] 渲染每日卦象失败:', e);
    }
  }
  /**
   * 渲染天气 + 农历/节气
   */
  async function renderWeatherLunar() {
    renderLunar();
    renderWeather();
  }

  /**
   * 农历计算（简化查表法，覆盖2025-2028）
   */
  function renderLunar() {
    const today = new Date();

    // 2026年农历数据：春节2月17日，闰六月
    const springFestival2026 = new Date(2026, 1, 17);
    const lunarMonths2026 = [29,29,30,29,30,29, 29,30,29,30,29,30,29];
    const leapMonth2026 = 6;

    // 2025年辅助数据
    const springFestival2025 = new Date(2025, 0, 29);
    const lunarMonths2025 = [29,30,29,30,29,30,29,30,29,30,30,29];
    const leapMonth2025 = 0;

    let springDate, months, leapMonth, lunarYear;
    if (today >= springFestival2026) {
      springDate = springFestival2026;
      months = lunarMonths2026;
      leapMonth = leapMonth2026;
      lunarYear = 2026;
    } else {
      springDate = springFestival2025;
      months = lunarMonths2025;
      leapMonth = leapMonth2025;
      lunarYear = 2025;
    }

    const diff = Math.floor((today - springDate) / 86400000);
    if (diff < 0) return;

    let lunarMonth = 0, lunarDay = 0, isLeap = false;
    let remaining = diff;

    for (let i = 0; i < months.length; i++) {
      if (remaining < months[i]) {
        if (leapMonth > 0 && i === leapMonth) {
          isLeap = true;
          lunarMonth = i;
        } else if (leapMonth > 0 && i > leapMonth) {
          lunarMonth = i;
        } else {
          lunarMonth = i + 1;
        }
        lunarDay = remaining + 1;
        break;
      }
      remaining -= months[i];
    }

    if (lunarMonth === 0) lunarMonth = 1;

    const lunarNames = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
    const dayNames = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
      '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
      '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
    const ganNames = ['庚','辛','壬','癸','甲','乙','丙','丁','戊','己'];
    const zhiNames = ['申','酉','戌','亥','子','丑','寅','卯','辰','巳','午','未'];
    const animalNames = ['猴','鸡','狗','猪','鼠','牛','虎','兔','龙','蛇','马','羊'];

    const lunarMonthStr = (isLeap ? '闰' : '') + lunarNames[lunarMonth] + '月';
    const lunarDayStr = dayNames[lunarDay];

    const dateEl = document.getElementById('dash-lunar-date');
    if (dateEl) dateEl.textContent = lunarMonthStr + lunarDayStr;

    const ganIdx = lunarYear % 10;
    const zhiIdx = lunarYear % 12;
    const yearEl = document.getElementById('dash-lunar-year');
    if (yearEl) yearEl.textContent = ganNames[ganIdx] + zhiNames[zhiIdx] + '年 · ' + animalNames[zhiIdx] + '年';

    // 节气
    const solarTerms2026 = [
      { name: '小寒', date: new Date(2026, 0, 5) },
      { name: '大寒', date: new Date(2026, 0, 20) },
      { name: '立春', date: new Date(2026, 1, 4) },
      { name: '雨水', date: new Date(2026, 1, 18) },
      { name: '惊蛰', date: new Date(2026, 2, 5) },
      { name: '春分', date: new Date(2026, 2, 20) },
      { name: '清明', date: new Date(2026, 3, 5) },
      { name: '谷雨', date: new Date(2026, 3, 20) },
      { name: '立夏', date: new Date(2026, 4, 5) },
      { name: '小满', date: new Date(2026, 4, 21) },
      { name: '芒种', date: new Date(2026, 5, 5) },
      { name: '夏至', date: new Date(2026, 5, 21) },
      { name: '小暑', date: new Date(2026, 6, 7) },
      { name: '大暑', date: new Date(2026, 6, 22) },
      { name: '立秋', date: new Date(2026, 7, 7) },
      { name: '处暑', date: new Date(2026, 7, 23) },
      { name: '白露', date: new Date(2026, 8, 7) },
      { name: '秋分', date: new Date(2026, 8, 23) },
      { name: '寒露', date: new Date(2026, 9, 8) },
      { name: '霜降', date: new Date(2026, 9, 23) },
      { name: '立冬', date: new Date(2026, 10, 7) },
      { name: '小雪', date: new Date(2026, 10, 22) },
      { name: '大雪', date: new Date(2026, 11, 7) },
      { name: '冬至', date: new Date(2026, 11, 21) }
    ];

    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    let currentTerm = null;
    let nextTerm = null;

    for (let i = 0; i < solarTerms2026.length; i++) {
      const termMs = new Date(solarTerms2026[i].date.getFullYear(),
        solarTerms2026[i].date.getMonth(), solarTerms2026[i].date.getDate()).getTime();
      if (termMs <= todayMs) currentTerm = solarTerms2026[i];
    }

    for (let j = 0; j < solarTerms2026.length; j++) {
      const tMs = new Date(solarTerms2026[j].date.getFullYear(),
        solarTerms2026[j].date.getMonth(), solarTerms2026[j].date.getDate()).getTime();
      if (tMs > todayMs) { nextTerm = solarTerms2026[j]; break; }
    }

    let termDisplay = '';
    if (currentTerm) {
      const daysSinceTerm = Math.floor((todayMs - new Date(currentTerm.date.getFullYear(),
        currentTerm.date.getMonth(), currentTerm.date.getDate()).getTime()) / 86400000);
      if (daysSinceTerm === 0) {
        termDisplay = '今日 ' + currentTerm.name;
      } else if (daysSinceTerm <= 3) {
        termDisplay = currentTerm.name + ' 已过' + daysSinceTerm + '天';
      } else if (nextTerm) {
        const daysToNext = Math.ceil((new Date(nextTerm.date.getFullYear(),
          nextTerm.date.getMonth(), nextTerm.date.getDate()).getTime() - todayMs) / 86400000);
        termDisplay = currentTerm.name + ' · ' + nextTerm.name + '还有' + daysToNext + '天';
      } else {
        termDisplay = currentTerm.name;
      }
    } else if (nextTerm) {
      const dToN = Math.ceil((new Date(nextTerm.date.getFullYear(),
        nextTerm.date.getMonth(), nextTerm.date.getDate()).getTime() - todayMs) / 86400000);
      termDisplay = nextTerm.name + '还有' + dToN + '天';
    }

    const termEl = document.getElementById('dash-solar-term');
    if (termEl) termEl.textContent = termDisplay;
  }

  /**
   * 天气获取（IP自动定位 + wttr.in天气查询）
   */
  function renderWeather() {
    const labelEl = document.getElementById('dash-weather-label');
    const iconEl = document.getElementById('dash-weather-icon');
    const tempEl = document.getElementById('dash-weather-temp');
    const descEl = document.getElementById('dash-weather-desc');

    function showFallback() {
      if (labelEl) labelEl.textContent = '今日天气';
      if (iconEl) iconEl.textContent = '🌤';
      if (tempEl) tempEl.textContent = '--°';
      if (descEl) descEl.textContent = '暂无天气数据';
    }

    function weatherIconForCode(code) {
      if (code >= 113 && code <= 116) return '☀️';
      if (code >= 119 && code <= 122) return '⛅';
      if (code >= 143 && code <= 176) return '🌫';
      if (code >= 179 && code <= 182) return '🌨';
      if (code >= 185 && code <= 200) return '🌫';
      if (code >= 227 && code <= 230) return '❄️';
      if (code >= 248 && code <= 260) return '🌫';
      if (code >= 263 && code <= 293) return '🌧';
      if (code >= 296 && code <= 311) return '🌧';
      if (code >= 314 && code <= 329) return '🌧';
      if (code >= 332 && code <= 350) return '🌨';
      if (code >= 353 && code <= 371) return '🌧';
      if (code >= 374 && code <= 395) return '❄️';
      return '🌤';
    }

    function descForCode(code) {
      if (code >= 113 && code <= 116) return '晴';
      if (code >= 119 && code <= 122) return '多云';
      if (code >= 143 && code <= 176) return '小雨';
      if (code >= 227 && code <= 230) return '雪';
      if (code >= 263 && code <= 329) return '雨';
      if (code >= 332 && code <= 371) return '阵雨';
      if (code >= 374 && code <= 395) return '雪';
      return '多云';
    }

    function fetchWeather(city) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      fetch('https://wttr.in/' + encodeURIComponent(city) + '?format=j1', {
        signal: controller.signal
      }).then(res => res.json()).then(data => {
        clearTimeout(timeout);
        const current = data.current_condition && data.current_condition[0];
        if (current) {
          const temp = current.temp_C;
          const code = parseInt(current.weatherCode, 10);
          const feelTemp = current.FeelsLikeC;
          if (iconEl) iconEl.textContent = weatherIconForCode(code);
          if (tempEl) tempEl.textContent = temp + '°';
          if (descEl) descEl.textContent = descForCode(code) + ' · 体感' + feelTemp + '°';
        } else {
          showFallback();
        }
      }).catch(() => {
        clearTimeout(timeout);
        showFallback();
      });
    }

    // IP定位主源：ipwho.is
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 5000);
    fetch('https://ipwho.is/', { signal: controller1.signal })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeout1);
        if (data.success && data.city) {
          if (labelEl) labelEl.textContent = '今日天气 · ' + data.city;
          fetchWeather(data.city);
        } else {
          // 备源：ipapi.co
          const controller2 = new AbortController();
          const timeout2 = setTimeout(() => controller2.abort(), 5000);
          fetch('https://ipapi.co/json/', { signal: controller2.signal })
            .then(res => res.json())
            .then(data2 => {
              clearTimeout(timeout2);
              if (data2.city) {
                if (labelEl) labelEl.textContent = '今日天气 · ' + data2.city;
                fetchWeather(data2.city);
              } else {
                showFallback();
              }
            })
            .catch(() => { clearTimeout(timeout2); showFallback(); });
        }
      })
      .catch(() => {
        clearTimeout(timeout1);
        // 备源：ipapi.co
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 5000);
        fetch('https://ipapi.co/json/', { signal: controller2.signal })
          .then(res => res.json())
          .then(data2 => {
            clearTimeout(timeout2);
            if (data2.city) {
              if (labelEl) labelEl.textContent = '今日天气 · ' + data2.city;
              fetchWeather(data2.city);
            } else {
              showFallback();
            }
          })
          .catch(() => { clearTimeout(timeout2); showFallback(); });
      });
  }

  // ===== 模块生命周期 =====
  let _eventListeners = [];
  let _widgetEventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _widgetEventListeners.forEach(({ el, event, handler }) => { try { el.removeEventListener(event, handler); } catch (e) {} });
    _widgetEventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    if (_smartFocusTimer) { clearInterval(_smartFocusTimer); _smartFocusTimer = null; }
    destroyWidgets();
    console.log('[DashboardModule] 模块已销毁');
  }


  // ===== v94: 碎碎念 =====
  const NN_MOOD_SCORE = { '😢': -2, '😤': -1, '😐': 0, '😴': 1, '😊': 2 };
  const NN_MODULE_LABELS = {
    diary: '日记', mood: '情绪', finance: '财务', tasks: '任务',
    habits: '习惯', time_log: '时间追踪', study: '学习', relations: '关系'
  };
  const NN_MODULE_ICONS = {
    diary: '📖', mood: '😔', finance: '💰', tasks: '✅',
    habits: '🔄', time_log: '⏱', study: '📚', relations: '👥'
  };

  let _nnSelectedMood = null;     // 用户选中的情绪emoji
  let _nnAnalysisResult = null;   // AI分析结果
  let _nnDeletedModules = new Set(); // 用户标记删除的模块

  /**
   * 碎碎念：获取DeepSeek token
   */
  async function _nnGetToken() {
    let token = null;
    try {
      if (window.SecureStorage?.loadSecure) {
        token = await window.SecureStorage?.loadSecure('deepseek_token');
      }
      if (!token) {
        const setting = await Storage.get('settings', 'deepseek_token');
        if (setting?.value) token = setting.value;
      }
    } catch (e) { /* 无 token */ }
    return token;
  }

  /**
   * 碎碎念：调用DeepSeek AI分析
   */
  async function _nnCallAI(text, mood) {
    const token = await _nnGetToken();
    if (!token) {
      throw new Error('未配置DeepSeek API Key');
    }

    const moodInfo = mood ? `用户当前情绪：${mood}` : '';
    const prompt = `你是人生工作台的AI助手。分析用户的碎碎念内容，提取可以归类到各模块的信息。

## 用户输入
${text}
${moodInfo}

## 提取规则
1. 只提取明确提到的信息，不编造、不推断
2. 每个字段只有在明确提及或可从上下文直接推导时才标记 has_xxx=true
3. 如果内容没有明确提到某个模块的信息，对应 has_xxx=false
4. 金额必须从文本中提取数字
5. 任务优先级根据紧迫性推断

## 返回格式（严格JSON）
{
  "diary": { "content": "完整日记内容", "has_diary": true/false },
  "mood": { "emoji": "情绪emoji", "score": -2~2, "note": "情绪备注", "has_mood": true/false },
  "finance": { "type": "expense/income", "amount": 0, "category": "分类", "note": "备注", "has_finance": true/false },
  "tasks": [{ "title": "任务标题", "priority": "high/medium/low" }],
  "habits": [{ "name": "习惯名" }],
  "time_log": [{ "category": "分类", "duration_minutes": 0, "note": "备注" }],
  "study": [{ "subject": "学科", "content": "内容", "duration_minutes": 0 }],
  "relations": [{ "person": "人物", "note": "互动备注" }]
}

只输出JSON，不要其他文字。`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 800
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`AI请求失败: ${resp.status}`);
      }

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error('AI返回为空');

      // 尝试提取JSON
      let jsonStr = reply.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      const result = JSON.parse(jsonStr);
      return result;
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') {
        throw new Error('AI分析超时(8秒)');
      }
      throw e;
    }
  }

  /**
   * 碎碎念：渲染预览
   */
  function _nnRenderPreview(analysis) {
    const previewEl = document.getElementById('dash-nn-preview');
    if (!previewEl) return;

    const modules = ['diary', 'mood', 'finance', 'tasks', 'habits', 'time_log', 'study', 'relations'];
    let html = '<div class="dash-nn-preview-title">AI 识别结果</div>';
    let hasAnyData = false;

    for (const mod of modules) {
      if (_nnDeletedModules.has(mod)) continue;

      const modData = analysis[mod];
      if (!modData) continue;

      // 判断该模块是否有数据
      let hasData = false;
      let displayText = '';

      if (mod === 'diary' && modData.has_diary) {
        hasData = true;
        displayText = modData.content || '';
      } else if (mod === 'mood' && modData.has_mood) {
        // 如果用户选了emoji，覆盖AI判断
        const emoji = _nnSelectedMood || modData.emoji;
        const score = _nnSelectedMood ? NN_MOOD_SCORE[_nnSelectedMood] : modData.score;
        analysis.mood.emoji = emoji;
        analysis.mood.score = score;
        hasData = true;
        displayText = `${emoji} ${modData.note || ''}`.trim();
      } else if (mod === 'finance' && modData.has_finance) {
        hasData = true;
        const typeLabel = modData.type === 'income' ? '收入' : '支出';
        displayText = `${typeLabel} ¥${modData.amount || 0} · ${modData.category || ''}${modData.note ? ' · ' + modData.note : ''}`;
      } else if (Array.isArray(modData) && modData.length > 0) {
        hasData = true;
        displayText = modData.map(item => {
          if (mod === 'tasks') return `${item.title} [${item.priority}]`;
          if (mod === 'habits') return item.name;
          if (mod === 'time_log') return `${item.category} ${item.duration_minutes}min${item.note ? ' · ' + item.note : ''}`;
          if (mod === 'study') return `${item.subject}${item.content ? ' · ' + item.content : ''}${item.duration_minutes ? ' · ' + item.duration_minutes + 'min' : ''}`;
          if (mod === 'relations') return `${item.person}${item.note ? ' · ' + item.note : ''}`;
          return JSON.stringify(item);
        }).join('\n');
      }

      if (!hasData) continue;
      hasAnyData = true;

      html += `<div class="dash-nn-preview-item" data-module="${mod}">
        <span class="dash-nn-preview-item-icon">${NN_MODULE_ICONS[mod]}</span>
        <div class="dash-nn-preview-item-content">
          <div class="dash-nn-preview-item-label">${NN_MODULE_LABELS[mod]}</div>
          <div class="dash-nn-preview-item-text">${escapeHtml(displayText)}</div>
        </div>
        <button class="dash-nn-preview-item-del" data-del-module="${mod}" title="移除此项">✕</button>
      </div>`;
    }

    if (!hasAnyData) {
      html += '<div class="dash-nn-preview-item" style="border-left-color:var(--text-muted);"><span class="dash-nn-preview-item-icon">📝</span><div class="dash-nn-preview-item-content"><div class="dash-nn-preview-item-text">未检测到特定模块数据，将记录为日记 📝</div></div></div>';
    }

    previewEl.innerHTML = html;
    previewEl.classList.remove('hidden');

    // 绑定删除按钮
    previewEl.querySelectorAll('.dash-nn-preview-item-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mod = btn.dataset.delModule;
        _nnDeletedModules.add(mod);
        const item = btn.closest('.dash-nn-preview-item');
        if (item) item.classList.add('deleted');
      });
    });
  }

  /**
   * 碎碎念：确认写入各模块
   */
  async function _nnConfirmWrite(analysis) {
    const today = getTodayStr();
    const results = [];

    // 日记
    if (!_nnDeletedModules.has('diary') && analysis.diary?.has_diary) {
      try {
        const moodEmoji = analysis.mood?.emoji || _nnSelectedMood || '';
        const moodScore = analysis.mood?.score ?? (_nnSelectedMood ? NN_MOOD_SCORE[_nnSelectedMood] : 0);
        const moodNote = analysis.mood?.note || '';
        await Storage.add('journal', {
          type: 'diary', subtype: '', content: analysis.diary.content,
          mood: moodEmoji, mood_score: moodScore, mood_note: moodNote,
          date: today, createdAt: Date.now(), updatedAt: Date.now(), source: 'niannian'
        });
        EventBus.emit('journal:created', { entry: { content: analysis.diary.content, date: today } });
        results.push({ module: 'diary', success: true });
      } catch (e) {
        console.error('[NianNian] 日记写入失败:', e);
        results.push({ module: 'diary', success: false });
      }
    } else {
      results.push({ module: 'diary', success: null });
    }

    // 情绪
    if (!_nnDeletedModules.has('mood') && analysis.mood?.has_mood) {
      try {
        const emoji = analysis.mood.emoji || _nnSelectedMood || '😐';
        const note = analysis.mood.note || '';
        const moodData = (await Storage.get('settings', 'health/mood'))?.value || { records: {}, streak: 0 };
        moodData.records[today] = { mood: emoji, note, time: new Date().toISOString() };
        // 计算streak
        let streak = 0;
        const d = new Date();
        for (let i = 0; i < 365; i++) {
          const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (moodData.records[ds]) { streak++; d.setDate(d.getDate() - 1); } else break;
        }
        moodData.streak = streak;
        await Storage.put('settings', { key: 'health/mood', value: moodData });
        results.push({ module: 'mood', success: true });
      } catch (e) {
        console.error('[NianNian] 情绪写入失败:', e);
        results.push({ module: 'mood', success: false });
      }
    } else {
      results.push({ module: 'mood', success: null });
    }

    // 财务
    if (!_nnDeletedModules.has('finance') && analysis.finance?.has_finance) {
      try {
        const record = {
          type: analysis.finance.type || 'expense',
          amount: analysis.finance.amount || 0,
          category: analysis.finance.category || '其他',
          note: analysis.finance.note || '',
          month: today.substring(0, 7),
          date: today,
          createdAt: Date.now(),
          source: 'niannian'
        };
        await Storage.add('finance', record);
        EventBus.emit('finance:added', { record });
        results.push({ module: 'finance', success: true });
      } catch (e) {
        console.error('[NianNian] 财务写入失败:', e);
        results.push({ module: 'finance', success: false });
      }
    } else {
      results.push({ module: 'finance', success: null });
    }

    // 任务
    if (!_nnDeletedModules.has('tasks') && Array.isArray(analysis.tasks) && analysis.tasks.length > 0) {
      try {
        for (const t of analysis.tasks) {
          const task = {
            title: t.title, priority: t.priority || 'medium', status: 'pending',
            createdAt: Date.now(), source: 'niannian'
          };
          await Storage.add('tasks', task);
          EventBus.emit('task:created', { task });
        }
        results.push({ module: 'tasks', success: true });
      } catch (e) {
        console.error('[NianNian] 任务写入失败:', e);
        results.push({ module: 'tasks', success: false });
      }
    } else {
      results.push({ module: 'tasks', success: null });
    }

    // 习惯
    if (!_nnDeletedModules.has('habits') && Array.isArray(analysis.habits) && analysis.habits.length > 0) {
      try {
        let habitOk = false;
        const allHabits = await Storage.getAll('habits');
        for (const h of analysis.habits) {
          const matched = allHabits.find(x => x.name.includes(h.name) || h.name.includes(x.name));
          if (matched) {
            let record = await Storage.get('checkins', today);
            if (!record) record = { date: today, month: today.substring(0, 7), habits: [] };
            if (!record.habits.includes(matched.id)) {
              record.habits.push(matched.id);
              await Storage.put('checkins', record);
              EventBus.emit('habit:completed', { habitId: matched.id, date: today });
            }
            habitOk = true;
          }
        }
        results.push({ module: 'habits', success: habitOk });
      } catch (e) {
        console.error('[NianNian] 习惯写入失败:', e);
        results.push({ module: 'habits', success: false });
      }
    } else {
      results.push({ module: 'habits', success: null });
    }

    // 时间追踪
    if (!_nnDeletedModules.has('time_log') && Array.isArray(analysis.time_log) && analysis.time_log.length > 0) {
      try {
        for (const tl of analysis.time_log) {
          await Storage.add('time_entries', {
            category: tl.category || '其他',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: tl.duration_minutes || 0,
            note: tl.note || '',
            date: today,
            source: 'niannian'
          });
        }
        results.push({ module: 'time_log', success: true });
      } catch (e) {
        console.error('[NianNian] 时间追踪写入失败:', e);
        results.push({ module: 'time_log', success: false });
      }
    } else {
      results.push({ module: 'time_log', success: null });
    }

    // 学习
    if (!_nnDeletedModules.has('study') && Array.isArray(analysis.study) && analysis.study.length > 0) {
      try {
        for (const s of analysis.study) {
          const data = {
            type: 'session', subject: s.subject || '', content: s.content || '',
            duration_minutes: s.duration_minutes || 0,
            date: today, createdAt: Date.now(), source: 'niannian'
          };
          await Storage.add('study', data);
          EventBus.emit('study:session', { data });
        }
        results.push({ module: 'study', success: true });
      } catch (e) {
        console.error('[NianNian] 学习写入失败:', e);
        results.push({ module: 'study', success: false });
      }
    } else {
      results.push({ module: 'study', success: null });
    }

    // 关系
    if (!_nnDeletedModules.has('relations') && Array.isArray(analysis.relations) && analysis.relations.length > 0) {
      try {
        let relOk = false;
        const contacts = await Storage.getAll('contacts');
        for (const r of analysis.relations) {
          const contact = contacts.find(c => c.name.includes(r.person) || r.person.includes(c.name));
          if (contact) {
            if (!contact.interactions) contact.interactions = [];
            contact.interactions.push({ date: today, note: r.note || '' });
            contact.lastContactDate = today;
            contact.updatedAt = Date.now();
            await Storage.put('contacts', contact);
            EventBus.emit('relation:updated', { contact });
            relOk = true;
          }
        }
        results.push({ module: 'relations', success: relOk });
      } catch (e) {
        console.error('[NianNian] 关系写入失败:', e);
        results.push({ module: 'relations', success: false });
      }
    } else {
      results.push({ module: 'relations', success: null });
    }

    return results;
  }

  /**
   * 碎碎念：显示写入结果
   */
  function _nnShowWriteResults(results) {
    const confirmRow = document.getElementById('dash-nn-confirm-row');
    if (confirmRow) confirmRow.classList.add('hidden');

    const previewEl = document.getElementById('dash-nn-preview');
    let html = '<div class="dash-nn-result">';
    for (const r of results) {
      const icon = NN_MODULE_ICONS[r.module];
      const label = NN_MODULE_LABELS[r.module];
      if (r.success === true) {
        html += `<div class="dash-nn-result-item success">${icon} ✅ ${label}：已记录</div>`;
      } else if (r.success === false) {
        html += `<div class="dash-nn-result-item fail">${icon} ❌ ${label}：写入失败</div>`;
      } else {
        html += `<div class="dash-nn-result-item skip">${icon} — ${label}：未触发</div>`;
      }
    }
    html += '</div>';
    if (previewEl) previewEl.innerHTML = html;
  }

  /**
   * 碎碎念：保存历史
   */
  async function _nnSaveHistory(text, analysis) {
    try {
      const histData = (await Storage.get('settings', 'niannian_history'))?.value || [];
      const modules = ['diary', 'mood', 'finance', 'tasks', 'habits', 'time_log', 'study', 'relations'];
      const triggeredModules = modules.filter(m => {
        if (_nnDeletedModules.has(m)) return false;
        const d = analysis[m];
        if (!d) return false;
        if (d.has_diary || d.has_mood || d.has_finance) return true;
        if (Array.isArray(d) && d.length > 0) return true;
        return false;
      });

      histData.unshift({
        text,
        analysis: triggeredModules,
        timestamp: Date.now(),
        date: getTodayStr(),
        writeCount: triggeredModules.length
      });

      // 最多50条
      if (histData.length > 50) histData.length = 50;

      await Storage.put('settings', { key: 'niannian_history', value: histData });
    } catch (e) {
      console.warn('[NianNian] 保存历史失败:', e);
    }
  }

  /**
   * 碎碎念：渲染历史记录
   */
  async function _nnRenderHistory() {
    const histEl = document.getElementById('dash-nn-history');
    if (!histEl) return;

    try {
      const histData = (await Storage.get('settings', 'niannian_history'))?.value || [];

      if (histData.length === 0) {
        histEl.innerHTML = '<div class="dash-nn-history-empty">暂无碎碎念记录</div>';
        return;
      }

      let html = '<div class="dash-nn-history-title">历史记录</div>';
      for (const item of histData.slice(0, 20)) {
        const time = new Date(item.timestamp);
        const timeStr = `${time.getMonth()+1}/${time.getDate()} ${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
        const tags = (item.analysis || []).map(m => `<span class="dash-nn-history-item-tag">${NN_MODULE_ICONS[m] || ''} ${NN_MODULE_LABELS[m] || m}</span>`).join('');
        html += `<div class="dash-nn-history-item">
          <div class="dash-nn-history-item-time">${timeStr}</div>
          <div class="dash-nn-history-item-text">${escapeHtml(item.text || '')}</div>
          ${tags ? '<div class="dash-nn-history-item-tags">' + tags + '</div>' : ''}
        </div>`;
      }

      histEl.innerHTML = html;
    } catch (e) {
      console.warn('[NianNian] 渲染历史失败:', e);
    }
  }

  /**
   * 碎碎念：重置状态
   */
  function _nnReset() {
    _nnSelectedMood = null;
    _nnAnalysisResult = null;
    _nnDeletedModules.clear();
    const textarea = document.getElementById('dash-nn-textarea');
    if (textarea) textarea.value = '';
    const previewEl = document.getElementById('dash-nn-preview');
    if (previewEl) { previewEl.innerHTML = ''; previewEl.classList.add('hidden'); }
    const confirmRow = document.getElementById('dash-nn-confirm-row');
    if (confirmRow) confirmRow.classList.add('hidden');
    const loadingEl = document.getElementById('dash-nn-loading');
    if (loadingEl) loadingEl.classList.add('hidden');
    const submitBtn = document.getElementById('dash-nn-submit');
    if (submitBtn) submitBtn.disabled = false;
    // 清除情绪选中
    document.querySelectorAll('.dash-nn-mood-btn').forEach(b => b.classList.remove('active'));
  }

  /**
   * 碎碎念：收起
   */
  function _nnCollapse() {
    const collapsed = document.getElementById('dash-nn-collapsed');
    const expanded = document.getElementById('dash-nn-expanded');
    if (collapsed) collapsed.classList.remove('hidden');
    if (expanded) expanded.classList.add('hidden');
    _nnReset();
  }

  /**
   * 碎碎念：展开
   */
  function _nnExpand() {
    const collapsed = document.getElementById('dash-nn-collapsed');
    const expanded = document.getElementById('dash-nn-expanded');
    if (collapsed) collapsed.classList.add('hidden');
    if (expanded) expanded.classList.remove('hidden');
  }

  /**
   * 碎碎念：绑定事件
   */
  function _nnBindEvents() {
    // 收起区域点击 → 展开
    const collapsed = document.getElementById('dash-nn-collapsed');
    if (collapsed) {
      _bindEvent(collapsed, 'click', (e) => {
        // 排除历史按钮点击
        if (e.target.id === 'dash-nn-history-toggle' || e.target.closest('#dash-nn-history-toggle')) return;
        _nnExpand();
      });
    }

    // 关闭按钮 → 收起
    const closeBtn = document.getElementById('dash-nn-close');
    if (closeBtn) {
      _bindEvent(closeBtn, 'click', () => _nnCollapse());
    }

    // 情绪emoji点击
    document.querySelectorAll('.dash-nn-mood-btn').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        const mood = btn.dataset.mood;
        if (_nnSelectedMood === mood) {
          _nnSelectedMood = null;
          btn.classList.remove('active');
        } else {
          _nnSelectedMood = mood;
          document.querySelectorAll('.dash-nn-mood-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // "写好了"按钮
    const submitBtn = document.getElementById('dash-nn-submit');
    if (submitBtn) {
      _bindEvent(submitBtn, 'click', async () => {
        const textarea = document.getElementById('dash-nn-textarea');
        const text = textarea?.value?.trim();
        if (!text) {
          if (window.App) window.App?.showToast('先说点什么吧 ✨');
          return;
        }

        // 显示loading
        const loadingEl = document.getElementById('dash-nn-loading');
        const confirmRow = document.getElementById('dash-nn-confirm-row');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (confirmRow) confirmRow.classList.add('hidden');
        submitBtn.disabled = true;

        try {
          const analysis = await _nnCallAI(text, _nnSelectedMood);
          _nnAnalysisResult = analysis;
          _nnRenderPreview(analysis);
          if (confirmRow) confirmRow.classList.remove('hidden');
        } catch (e) {
          console.error('[NianNian] AI分析失败:', e);
          const previewEl = document.getElementById('dash-nn-preview');
          if (previewEl) {
            previewEl.innerHTML = `<div class="dash-nn-preview-item" style="border-left-color:#E74C3C;"><span class="dash-nn-preview-item-icon">⚠️</span><div class="dash-nn-preview-item-content"><div class="dash-nn-preview-item-text">分析失败：${escapeHtml(e.message)}</div></div></div>`;
            previewEl.classList.remove('hidden');
          }
        } finally {
          if (loadingEl) loadingEl.classList.add('hidden');
          submitBtn.disabled = false;
        }
      });
    }

    // 确认写入
    const confirmBtn = document.getElementById('dash-nn-confirm');
    if (confirmBtn) {
      _bindEvent(confirmBtn, 'click', async () => {
        if (!_nnAnalysisResult) return;
        confirmBtn.disabled = true;
        const cancelBtn = document.getElementById('dash-nn-cancel');
        if (cancelBtn) cancelBtn.disabled = true;

        try {
          const results = await _nnConfirmWrite(_nnAnalysisResult);
          _nnShowWriteResults(results);

          // 保存历史
          const textarea = document.getElementById('dash-nn-textarea');
          const text = textarea?.value?.trim() || '';
          await _nnSaveHistory(text, _nnAnalysisResult);

          // 刷新历史面板
          await _nnRenderHistory();

          // 2秒后收起
          setTimeout(() => _nnCollapse(), 2500);
        } catch (e) {
          console.error('[NianNian] 写入失败:', e);
          confirmBtn.disabled = false;
          if (cancelBtn) cancelBtn.disabled = false;
        }
      });
    }

    // 放弃按钮
    const cancelBtn = document.getElementById('dash-nn-cancel');
    if (cancelBtn) {
      _bindEvent(cancelBtn, 'click', () => _nnCollapse());
    }

    // 历史按钮
    const historyBtn = document.getElementById('dash-nn-history-toggle');
    if (historyBtn) {
      _bindEvent(historyBtn, 'click', (e) => {
        e.stopPropagation();
        const histEl = document.getElementById('dash-nn-history');
        if (histEl) {
          histEl.classList.toggle('hidden');
          if (!histEl.classList.contains('hidden')) {
            _nnRenderHistory();
          }
        }
      });
    }
  }

  /**
   * 碎碎念：初始化渲染
   */
  async function renderNianNian() {
    _nnBindEvents();
  }

  return { init, showAnnualReview, destroy };
})();
