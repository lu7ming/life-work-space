/**
 * dashboard.js - 总面板逻辑
 * 人生工作台 · 首页数据渲染与交互
 * v39 - 第二批Widget拆分：原生Widget独立组件 (v125)
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';
import { CrossLinker } from '../../core/cross-linker.js';
import { Router } from '../../core/router.js';
import { SmartSuggestion } from '../../core/smart-suggestion.js';
import { CalendarWidget } from './widgets/calendar-widget.js';
import { AchievementsWidget } from './widgets/achievements-widget.js';
import { LifeTreeWidget } from './widgets/lifetree-widget.js';
import { ClockWidget } from './widgets/clock-widget.js';
import { WeatherWidget } from './widgets/weather-widget.js';
import { SmartFocusWidget } from './widgets/smart-focus-widget.js';
import { FocusCardWidget } from './widgets/focus-card-widget.js';
import { DailyRecommendWidget } from './widgets/daily-recommend-widget.js';
import { NianNianWidget } from './widgets/nian-nian-widget.js';
import { WidgetSystem } from './widgets/widget-system.js';


export const DashboardModule = (() => {
  const { escapeHtml, getTodayStr } = AppUtils;

  // ===== 事件监听管理 =====
  let _eventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  async function init() {
    console.log('[Dashboard] 初始化总面板...');
    try {
      // 每个任务独立 try-catch，单个失败不影响整体
      const safeRun = async (name, fn) => {
        try {
          await fn();
        } catch (e) {
          console.error(`[Dashboard] ${name} 初始化失败:`, e);
        }
      };

      await Promise.all([
        safeRun('renderGreeting', renderGreeting),
        safeRun('WeatherWidget', () => WeatherWidget.init()),
        safeRun('renderCountdown', renderCountdown),
        safeRun('renderCalendar', renderCalendar),
        safeRun('renderHighlights', renderHighlights),
        safeRun('DailyRecommendWidget', () => DailyRecommendWidget.init()),
        safeRun('renderBirthdayReminder', renderBirthdayReminder),
        safeRun('renderFeed', renderFeed),
        safeRun('FocusCardWidget', () => FocusCardWidget.init()),
        safeRun('renderTemplateReminder', renderTemplateReminder),
        safeRun('SmartFocusWidget', () => SmartFocusWidget.init()),
        safeRun('WidgetSystem', () => WidgetSystem.init()),
        safeRun('renderTravelCard', renderTravelCard),
        safeRun('NianNianWidget', () => NianNianWidget.init())
      ]);
      try { bindAnnualEvents(); } catch (e) { console.error('[Dashboard] bindAnnualEvents 失败:', e); }
      try { bindCalendarEvents(); } catch (e) { console.error('[Dashboard] bindCalendarEvents 失败:', e); }
      try { ClockWidget.init(); } catch (e) { console.error('[Dashboard] ClockWidget 失败:', e); }
    } catch (err) {
      console.error('[Dashboard] 初始化失败:', err);
      if (window.App) window.App?.showToast('总览加载失败，请刷新重试');
    }
  }


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
        Router.navigate('review');
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
      _bindEvent(goBtn, 'click', () => toggleCalendarView());
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



  // ===== 模块生命周期 =====
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    ClockWidget.destroy();
    WeatherWidget.destroy();
    SmartFocusWidget.destroy();
    FocusCardWidget.destroy();
    DailyRecommendWidget.destroy();
    NianNianWidget.destroy();
    WidgetSystem.destroy();
    _destroyCalendar();
    console.log('[DashboardModule] 模块已销毁');
  }




  // ===== 图标动画 =====
  function applyIconAnimations() {
    // 由各 Widget 自行处理，此处保留空函数以保持接口兼容
  }


  // ====================================================
  //  日历子模块（原 calendar 模块，迁移至 Dashboard）
  // ====================================================
/**
 * calendar.js - 日历总览模块（子模块，已迁移至 Dashboard）
 * 人生工作台 · 多模块数据投射到日历，一眼看出"哪些天过得好"
 */

  // ===== 日历视图切换 =====
  let _calendarInitialized = false;

  function toggleCalendarView() {
    const panel = document.getElementById('dash-calendar-panel');
    const btn = document.getElementById('dash-calendar-view-btn');
    if (!panel) return;

    if (panel.style.display === 'none' || panel.style.display === '') {
      panel.style.display = 'block';
      if (btn) btn.classList.add('dash-calendar-view-active');
      if (!_calendarInitialized) {
        CalendarWidget.init();
        _calendarInitialized = true;
      }
    } else {
      panel.style.display = 'none';
      if (btn) btn.classList.remove('dash-calendar-view-active');
    }
  }

  function bindCalendarEvents() {
    const calBtn = document.getElementById('dash-calendar-view-btn');
    if (calBtn) {
      calBtn.addEventListener('click', toggleCalendarView);
    }
  }

  function _destroyCalendar() {
    if (_calendarInitialized) {
      CalendarWidget.destroy();
      _calendarInitialized = false;
    }
  }

  // ===== 成就全屏视图 =====
  function openAchievementsFullView() {
    AchievementsWidget.openFullView();
  }

  function closeAchievementsFullView() {
    AchievementsWidget.closeFullView();
  }

  // ===== 生命树全屏视图 =====
  function openLifeTreeFullView() {
    LifeTreeWidget.openFullView();
  }

  function closeLifeTreeFullView() {
    LifeTreeWidget.closeFullView();
  }

  function destroyAchievementsLT() {
    try { AchievementsWidget.destroy(); } catch(e) {}
    try { LifeTreeWidget.destroy(); } catch(e) {}
  }


  return { init, showAnnualReview, destroy, applyIconAnimations, toggleCalendarView, openLifeTreeFullView, openAchievementsFullView };

})();
