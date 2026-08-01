/**
 * habits.js - 习惯打卡逻辑
 * 人生工作台 · 12个统一习惯的一键打卡
 */

const HabitsModule = (() => {
  // ===== 12 个统一习惯（固定列表） =====
  const HABITS = [
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
    { id: 'finance',       emoji: '💰', name: '记账' },
  ];

  const TOTAL = HABITS.length;

  // 当前查看的日期
  let currentDate = new Date();
  // 日历当前显示的月份
  let calendarMonth = new Date().getMonth();
  let calendarYear = new Date().getFullYear();

  // ===== 工具函数 =====
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatMonth(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function getWeekdayName(date) {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return names[date.getDay()];
  }

  function isToday(date) {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  }

  function isSameDay(d1, d2) {
    return formatDate(d1) === formatDate(d2);
  }

  // ===== 激励文案 =====
  function getMotivation(count) {
    if (count === 0) return '新的一天，从第一个习惯开始 ✨';
    if (count <= 3) return '好的开始！继续保持 💪';
    if (count <= 6) return '已经过半了，加油 🔥';
    if (count <= 9) return '即将完成，冲刺！🚀';
    if (count <= 11) return '只差一点了，你可以的！🎯';
    return '太棒了，全部完成！🎉🎊';
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Habits] 习惯打卡模块初始化...');
    currentDate = new Date();
    calendarMonth = currentDate.getMonth();
    calendarYear = currentDate.getFullYear();

    renderGrid();
    bindEvents();
    await loadDateData();
    renderCalendar();
  }

  // ===== 渲染习惯卡片网格 =====
  function renderGrid() {
    const grid = document.getElementById('habits-grid');
    if (!grid) return;

    grid.innerHTML = HABITS.map((habit) => `
      <div class="habits-card" data-habit-id="${habit.id}">
        <span class="habits-card-emoji">${habit.emoji}</span>
        <span class="habits-card-name">${habit.name}</span>
        <div class="habits-card-btn"></div>
        <span class="habits-card-check">✓</span>
      </div>
    `).join('');
  }

  // ===== 绑定事件 =====
  function bindEvents() {
    // 习惯卡片点击
    const grid = document.getElementById('habits-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const card = e.target.closest('.habits-card');
        if (card) {
          toggleHabit(card.dataset.habitId);
        }
      });
    }

    // 日期切换
    const prevBtn = document.getElementById('habits-prev-day');
    const nextBtn = document.getElementById('habits-next-day');
    const todayBtn = document.getElementById('habits-today-btn');

    if (prevBtn) prevBtn.addEventListener('click', () => shiftDate(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => shiftDate(1));
    if (todayBtn) todayBtn.addEventListener('click', goToday);

    // 日历月份切换
    const prevMonth = document.getElementById('habits-prev-month');
    const nextMonth = document.getElementById('habits-next-month');
    if (prevMonth) prevMonth.addEventListener('click', () => shiftMonth(-1));
    if (nextMonth) nextMonth.addEventListener('click', () => shiftMonth(1));
  }

  // ===== 加载指定日期的打卡数据 =====
  async function loadDateData() {
    const dateStr = formatDate(currentDate);

    // 更新日期显示
    updateDateDisplay();

    // 从 IndexedDB 读取打卡记录
    let checkedHabits = [];
    try {
      const record = await Storage.get('checkins', dateStr);
      if (record && record.habits) {
        checkedHabits = record.habits;
      }
    } catch (err) {
      console.error('[Habits] 读取打卡数据失败:', err);
    }

    // 更新卡片状态
    const cards = document.querySelectorAll('.habits-card');
    cards.forEach((card) => {
      const habitId = card.dataset.habitId;
      if (checkedHabits.includes(habitId)) {
        card.classList.add('checked');
      } else {
        card.classList.remove('checked');
      }
    });

    // 更新进度
    updateProgress(checkedHabits.length);

    // 更新日历中选中状态
    updateCalendarSelection();
  }

  // ===== 切换打卡状态 =====
  let isToggling = false;
  async function toggleHabit(habitId) {
    if (isToggling) return;
    isToggling = true;
    const dateStr = formatDate(currentDate);
    const monthStr = formatMonth(currentDate);
    const now = new Date();

    try {
      let record = await Storage.get('checkins', dateStr);
      let habits = [];

      if (record && record.habits) {
        habits = [...record.habits];
      }

      if (habits.includes(habitId)) {
        habits = habits.filter((h) => h !== habitId);
      } else {
        habits.push(habitId);
      }

      // 保存到 IndexedDB
      if (habits.length === 0) {
        if (record) {
          await Storage.put('checkins', {
            date: dateStr,
            month: monthStr,
            time: record.time || formatTime(now),
            habits: []
          });
        }
      } else {
        await Storage.put('checkins', {
          date: dateStr,
          month: monthStr,
          time: record ? record.time : formatTime(now),
          habits: habits
        });
      }

      // 数据驱动渲染：重新从数据刷新所有卡片状态
      const cards = document.querySelectorAll('.habits-card');
      cards.forEach((card) => {
        if (habits.includes(card.dataset.habitId)) {
          card.classList.add('checked');
        } else {
          card.classList.remove('checked');
        }
      });

      // 更新进度
      updateProgress(habits.length);

      // 刷新日历
      await renderCalendar();

      // 更新侧边栏连续天数
      if (typeof App !== 'undefined' && App.updateStreak) {
        App.updateStreak();
      }

    } catch (err) {
      console.error('[Habits] 打卡操作失败:', err);
      if (typeof App !== 'undefined') App.showToast('打卡操作失败，请重试');
    } finally {
      isToggling = false;
    }
  }

  // ===== 更新进度条 =====
  function updateProgress(count) {
    const countEl = document.getElementById('habits-progress-count');
    const fillEl = document.getElementById('habits-progress-fill');
    const motivationEl = document.getElementById('habits-progress-motivation');

    if (countEl) countEl.textContent = `${count}/${TOTAL}`;
    if (fillEl) fillEl.style.width = `${(count / TOTAL) * 100}%`;
    if (motivationEl) motivationEl.textContent = getMotivation(count);
  }

  // ===== 日期显示 =====
  function updateDateDisplay() {
    const dateTextEl = document.getElementById('habits-date-text');
    const weekdayEl = document.getElementById('habits-date-weekday');
    const todayBtn = document.getElementById('habits-today-btn');

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    const d = currentDate.getDate();

    if (dateTextEl) {
      dateTextEl.textContent = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (weekdayEl) {
      weekdayEl.textContent = isToday(currentDate) ? '今天' : getWeekdayName(currentDate);
    }
    if (todayBtn) {
      todayBtn.classList.toggle('active', isToday(currentDate));
    }
  }

  // ===== 日期切换 =====
  function shiftDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    loadDateData();
    // 同步日历月份
    calendarMonth = currentDate.getMonth();
    calendarYear = currentDate.getFullYear();
    renderCalendar();
  }

  function goToday() {
    currentDate = new Date();
    calendarMonth = currentDate.getMonth();
    calendarYear = currentDate.getFullYear();
    loadDateData();
    renderCalendar();
  }

  // ===== 日历渲染 =====
  async function renderCalendar() {
    const titleEl = document.getElementById('habits-calendar-title');
    const daysContainer = document.getElementById('habits-calendar-days');

    if (titleEl) {
      titleEl.textContent = `${calendarYear}年${calendarMonth + 1}月`;
    }

    if (!daysContainer) return;
    daysContainer.innerHTML = '';

    // 获取本月所有打卡记录
    const monthStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;
    let checkinMap = {}; // date -> habits count
    try {
      const records = await Storage.getByIndex('checkins', 'month', monthStr);
      records.forEach((r) => {
        checkinMap[r.date] = (r.habits || []).length;
      });
    } catch (err) {
      console.error('[Habits] 获取月打卡数据失败:', err);
    }

    // 日历格子
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const today = new Date();
    const todayStr = formatDate(today);
    const selectedStr = formatDate(currentDate);

    // 空白格
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'habits-calendar-day empty';
      daysContainer.appendChild(empty);
    }

    // 日期格
    for (let day = 1; day <= daysInMonth; day++) {
      const dd = String(day).padStart(2, '0');
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${dd}`;
      const habitCount = checkinMap[dateStr] || 0;

      const dayEl = document.createElement('div');
      dayEl.className = 'habits-calendar-day';
      dayEl.textContent = day;

      // 今天
      if (dateStr === todayStr) dayEl.classList.add('today');
      // 选中日期
      if (dateStr === selectedStr) dayEl.classList.add('selected');
      // 有打卡
      if (habitCount > 0) dayEl.classList.add('has-checkin');
      // 全部完成
      if (habitCount >= TOTAL) dayEl.classList.add('all-done');

      // 点击切换日期
      dayEl.addEventListener('click', () => {
        currentDate = new Date(calendarYear, calendarMonth, day);
        loadDateData();
        renderCalendar();
      });

      daysContainer.appendChild(dayEl);
    }

    updateCalendarSelection();
  }

  // ===== 更新日历选中状态 =====
  function updateCalendarSelection() {
    const selectedStr = formatDate(currentDate);
    document.querySelectorAll('.habits-calendar-day').forEach((el) => {
      el.classList.remove('selected');
    });
    // 找到对应的日历格子添加选中
    document.querySelectorAll('.habits-calendar-day:not(.empty)').forEach((el) => {
      const day = parseInt(el.textContent);
      const dd = String(day).padStart(2, '0');
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${dd}`;
      if (dateStr === selectedStr) {
        el.classList.add('selected');
      }
    });
  }

  // ===== 月份切换 =====
  function shiftMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear++;
    } else if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear--;
    }
    renderCalendar();
  }

  return { init };
})();
