/**
 * habits.js - 习惯打卡逻辑
 * 人生工作台 · 12个统一习惯的一键打卡
 */

const HabitsModule = (() => {
  const { formatDate, formatTime } = AppUtils;

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

  // 习惯ID → 索引映射
  const HABIT_MAP = {};
  HABITS.forEach((h, i) => { HABIT_MAP[h.id] = { ...h, index: i }; });

  const TOTAL = HABITS.length;

  // ===== 习惯链定义（有序） =====
  const HABIT_CHAINS = [
    { id: 'morning',  name: '晨间链', emoji: '🌅', habits: ['warm-water', 'breakfast', 'exercise'] },
    { id: 'wellness', name: '养生链', emoji: '🌿', habits: ['drink-water', 'dinner-light', 'foot-bath', 'early-sleep'] },
    { id: 'growth',   name: '成长链', emoji: '🌱', habits: ['study', 'reading', 'journal'] },
  ];

  // ===== 习惯组合定义（无序，一键打卡） =====
  const HABIT_GROUPS = [
    { id: 'morning-routine', name: '晨间 routine', emoji: '☀️', habits: ['warm-water', 'breakfast', 'exercise', 'stretch'] },
    { id: 'noon-routine',    name: '午间 routine', emoji: '🌤️', habits: ['drink-water', 'stretch'] },
    { id: 'evening-routine', name: '晚间 routine', emoji: '🌙', habits: ['dinner-light', 'foot-bath', 'early-sleep', 'journal'] },
  ];

  // 当前查看的日期
  let currentDate = new Date();
  // 日历当前显示的月份
  let calendarMonth = new Date().getMonth();
  let calendarYear = new Date().getFullYear();
  // 当前已打卡习惯列表（缓存）
  let currentCheckedHabits = [];

  // ===== 工具函数 =====

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
    renderGroups();
    renderChains();
    bindEvents();
    await loadDateData();
    renderCalendar();
  }

  // ===== 渲染习惯卡片网格 =====
  function renderGrid() {
    const grid = document.getElementById('habits-grid');
    if (!grid) return;

    // 计算每个习惯所属的链及其位置
    const chainBadgeMap = {}; // habitId → [{ chainName, position }]
    HABIT_CHAINS.forEach(chain => {
      chain.habits.forEach((hId, idx) => {
        if (!chainBadgeMap[hId]) chainBadgeMap[hId] = [];
        chainBadgeMap[hId].push({ chainEmoji: chain.emoji, position: idx + 1 });
      });
    });

    grid.innerHTML = HABITS.map((habit) => {
      const badges = chainBadgeMap[habit.id] || [];
      const badgeHtml = badges.map(b =>
        `<span class="habits-card-chain-badge" title="${b.chainEmoji} 第${b.position}步">${b.position}</span>`
      ).join('');

      return `
      <div class="habits-card" data-habit-id="${habit.id}">
        <span class="habits-card-emoji">${habit.emoji}</span>
        <span class="habits-card-name">${habit.name}</span>
        <div class="habits-card-btn"></div>
        <span class="habits-card-check">✓</span>
        ${badgeHtml ? `<div class="habits-card-chain-badges">${badgeHtml}</div>` : ''}
      </div>
    `;
    }).join('');
  }

  // ===== 渲染习惯组合按钮 =====
  function renderGroups() {
    const container = document.getElementById('habits-groups-list');
    if (!container) return;

    container.innerHTML = HABIT_GROUPS.map(group => {
      const total = group.habits.length;
      return `
        <button class="habits-group-btn" data-group-id="${group.id}">
          <span class="habits-group-emoji">${group.emoji}</span>
          <span class="habits-group-name">${group.name}</span>
          <span class="habits-group-progress" data-group-progress="${group.id}">0/${total}</span>
        </button>
      `;
    }).join('');
  }

  // ===== 渲染习惯链可视化 =====
  function renderChains() {
    const container = document.getElementById('habits-chains-list');
    if (!container) return;

    container.innerHTML = HABIT_CHAINS.map(chain => {
      const nodesHtml = chain.habits.map((hId, idx) => {
        const habit = HABIT_MAP[hId];
        const arrow = idx < chain.habits.length - 1
          ? '<span class="habits-chain-arrow">→</span>'
          : '';
        return `
          <span class="habits-chain-node" data-chain-id="${chain.id}" data-habit-id="${hId}">
            <span class="habits-chain-node-emoji">${habit.emoji}</span>
            <span class="habits-chain-node-name">${habit.name}</span>
          </span>
          ${arrow}
        `;
      }).join('');

      return `
        <div class="habits-chain" data-chain-id="${chain.id}">
          <span class="habits-chain-label">${chain.emoji} ${chain.name}</span>
          <div class="habits-chain-nodes">${nodesHtml}</div>
          <span class="habits-chain-status" data-chain-status="${chain.id}"></span>
        </div>
      `;
    }).join('');
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

    // 习惯组合按钮点击
    const groupsList = document.getElementById('habits-groups-list');
    if (groupsList) {
      groupsList.addEventListener('click', (e) => {
        const btn = e.target.closest('.habits-group-btn');
        if (btn) {
          handleGroupCheckin(btn.dataset.groupId);
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

    currentCheckedHabits = [...checkedHabits];

    // 更新卡片状态
    updateCardsState(checkedHabits);

    // 更新进度
    updateProgress(checkedHabits.length);

    // 更新组合进度
    updateGroupProgress(checkedHabits);

    // 更新习惯链状态
    updateChainState(checkedHabits);

    // 更新日历中选中状态
    updateCalendarSelection();
  }

  // ===== 更新卡片状态（含链高亮动画） =====
  function updateCardsState(checkedHabits) {
    // 计算每条链的下一个待完成习惯
    const nextHabitIds = new Set();
    HABIT_CHAINS.forEach(chain => {
      const nextHabit = getNextHabitInChain(chain, checkedHabits);
      if (nextHabit) nextHabitIds.add(nextHabit);
    });

    const cards = document.querySelectorAll('.habits-card');
    cards.forEach((card) => {
      const habitId = card.dataset.habitId;
      if (checkedHabits.includes(habitId)) {
        card.classList.add('checked');
      } else {
        card.classList.remove('checked');
      }

      // 脉冲高亮：是链中下一个待完成的习惯
      if (nextHabitIds.has(habitId) && !checkedHabits.includes(habitId)) {
        card.classList.add('chain-next');
      } else {
        card.classList.remove('chain-next');
      }
    });
  }

  // ===== 获取链中下一个待完成的习惯ID =====
  function getNextHabitInChain(chain, checkedHabits) {
    for (const hId of chain.habits) {
      if (!checkedHabits.includes(hId)) return hId;
    }
    return null; // 全部完成
  }

  // ===== 更新组合进度 =====
  function updateGroupProgress(checkedHabits) {
    HABIT_GROUPS.forEach(group => {
      const done = group.habits.filter(hId => checkedHabits.includes(hId)).length;
      const total = group.habits.length;
      const progressEl = document.querySelector(`[data-group-progress="${group.id}"]`);
      if (progressEl) progressEl.textContent = `${done}/${total}`;

      // 全部完成时给按钮加完成样式
      const btn = document.querySelector(`[data-group-id="${group.id}"]`);
      if (btn) {
        btn.classList.toggle('all-done', done === total);
      }
    });
  }

  // ===== 更新习惯链状态 =====
  function updateChainState(checkedHabits) {
    HABIT_CHAINS.forEach(chain => {
      const done = chain.habits.filter(hId => checkedHabits.includes(hId)).length;
      const total = chain.habits.length;

      // 更新链节点状态
      const nodes = document.querySelectorAll(`[data-chain-id="${chain.id}"].habits-chain-node`);
      nodes.forEach(node => {
        const hId = node.dataset.habitId;
        if (checkedHabits.includes(hId)) {
          node.classList.add('done');
        } else {
          node.classList.remove('done');
        }
        // 下一个待完成的节点加高亮
        const nextHabit = getNextHabitInChain(chain, checkedHabits);
        if (nextHabit === hId) {
          node.classList.add('next');
        } else {
          node.classList.remove('next');
        }
      });

      // 更新链状态文案
      const statusEl = document.querySelector(`[data-chain-status="${chain.id}"]`);
      if (statusEl) {
        if (done === total) {
          statusEl.textContent = '✅';
          statusEl.className = 'habits-chain-status done';
        } else if (done > 0) {
          statusEl.textContent = `${done}/${total}`;
          statusEl.className = 'habits-chain-status in-progress';
        } else {
          statusEl.textContent = '';
          statusEl.className = 'habits-chain-status';
        }
      }
    });
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

      currentCheckedHabits = [...habits];

      // 数据驱动渲染：重新从数据刷新所有卡片状态
      updateCardsState(habits);

      // 更新进度
      updateProgress(habits.length);

      // 更新组合进度
      updateGroupProgress(habits);

      // 更新习惯链状态
      updateChainState(habits);

      // 检查链完成
      checkChainCompletion(habitId, habits);

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

  // ===== 检查习惯链完成 =====
  function checkChainCompletion(justCheckedId, checkedHabits) {
    HABIT_CHAINS.forEach(chain => {
      // 刚打卡的习惯是否属于此链
      if (!chain.habits.includes(justCheckedId)) return;
      // 此链是否全部完成
      const allDone = chain.habits.every(hId => checkedHabits.includes(hId));
      if (allDone) {
        if (typeof App !== 'undefined') {
          App.showToast(`${chain.emoji} ${chain.name}全部完成！顺序打卡太棒了！🎉`);
        }
      }
    });
  }

  // ===== 习惯组合一键打卡 =====
  async function handleGroupCheckin(groupId) {
    const group = HABIT_GROUPS.find(g => g.id === groupId);
    if (!group) return;

    // 筛选未完成的习惯
    const unchecked = group.habits.filter(hId => !currentCheckedHabits.includes(hId));
    if (unchecked.length === 0) {
      if (typeof App !== 'undefined') App.showToast(`${group.emoji} ${group.name}已全部完成！`);
      return;
    }

    // 逐个调用已有的打卡逻辑（依次打卡未完成的）
    for (const hId of unchecked) {
      await toggleHabit(hId);
    }

    if (typeof App !== 'undefined') {
      App.showToast(`${group.emoji} ${group.name}打卡成功！${unchecked.length}个习惯已记录`);
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
    console.log('[HabitsModule] 模块已销毁');
  }

  return { init };
})();
