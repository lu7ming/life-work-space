/**
 * dashboard.js - 总面板逻辑
 * 人生工作台 · 首页数据渲染与交互
 */

const DashboardModule = (() => {
  /**
   * 初始化总面板
   */
  async function init() {
    console.log('[Dashboard] 初始化总面板...');
    try {
      await Promise.all([
        renderGreeting(),
        renderCalendar(),
        renderHighlights(),
        renderBirthdayReminder(),
        renderFeed()
      ]);
    } catch (err) {
      console.error('[Dashboard] 初始化失败:', err);
    }
  }

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
      const dates = allCheckins.map((c) => c.date).sort().reverse();
      for (let i = 0; i < 365; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dates.includes(dateStr)) {
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
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
    let checkinDates = [];
    try {
      const checkins = await Storage.getByIndex('checkins', 'month', monthStr);
      checkinDates = checkins.map((c) => parseInt(c.date.split('-')[2]));
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
      if (checkinDates.includes(day)) dayEl.classList.add('checked');

      daysContainer.appendChild(dayEl);
    }
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
      el.addEventListener('click', () => {
        const route = el.dataset.route;
        if (route) Router.navigate(route);
      });
    });
  }

  return { init };
})();
