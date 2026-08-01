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
   * 渲染今日推送（占位数据）
   */
  function renderFeed() {
    const container = document.getElementById('dash-feed-list');
    if (!container) return;

    const feeds = [
      { icon: '💡', title: '微习惯的力量：每天进步1%，一年后你将强大37倍', meta: '习惯养成 · 3分钟阅读' },
      { icon: '🎯', title: '如何用「两分钟法则」战胜拖延症', meta: '效率提升 · 5分钟阅读' },
      { icon: '🧘', title: '正念冥想入门：从每天5分钟开始改变大脑', meta: '身心健康 · 4分钟阅读' },
      { icon: '📊', title: '记账第三个月：我终于看清了自己的消费模式', meta: '财务自由 · 6分钟阅读' },
      { icon: '🌱', title: '「不要打破链条」——宋飞工作法的秘密', meta: '坚持的力量 · 2分钟阅读' },
    ];

    container.innerHTML = feeds.map((item) => `
      <div class="dash-feed-item">
        <span class="dash-feed-item-icon">${item.icon}</span>
        <div class="dash-feed-item-content">
          <div class="dash-feed-item-title">${item.title}</div>
          <div class="dash-feed-item-meta">${item.meta}</div>
        </div>
      </div>
    `).join('');
  }

  return { init };
})();
