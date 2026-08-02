/**
 * calendar.js - 日历总览模块
 * 人生工作台 · 多模块数据投射到日历，一眼看出"哪些天过得好"
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';
import { Router } from '../../core/router.js';


export const CalendarModule = (() => {
  const { formatDate } = AppUtils;

  // ===== 状态 =====
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();
  let monthDataCache = {};  // 'YYYY-MM' → { checkins, tasks, journal, finance, health, study }

  // ===== 12 个统一习惯（与 habits 模块保持一致） =====
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

  // ===== 工具函数 =====
  function toMonthStr(y, m) {
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  function toDateStr(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function todayStr() {
    return formatDate(new Date());
  }

  function getWeekdayName(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return names[d.getDay()];
  }

  // ===== 加载月度数据 =====
  async function loadMonthData(year, month) {
    const monthStr = toMonthStr(year, month);

    // 缓存检查
    if (monthDataCache[monthStr]) {
      return monthDataCache[monthStr];
    }

    const data = {
      checkins: {},   // dateStr → habits[]
      tasks: {},      // dateStr → { completed, pending, items }
      journal: {},    // dateStr → { hasDiary, hasReflection, previews }
      finance: {},    // dateStr → { income, expense }
      health: {},     // dateStr → true
      study: {},      // dateStr → true
    };

    try {
      // 1. 打卡记录（按月索引查询）
      const checkinRecords = await Storage.getByIndex('checkins', 'month', monthStr);
      checkinRecords.forEach(r => {
        data.checkins[r.date] = r.habits || [];
      });

      // 2. 任务（全量获取后按月过滤）
      const allTasks = await Storage.getAll('tasks');
      allTasks.forEach(t => {
        if (t.date && t.date.startsWith(monthStr)) {
          if (!data.tasks[t.date]) {
            data.tasks[t.date] = { completed: 0, pending: 0, items: [] };
          }
          if (t.status === 'completed') {
            data.tasks[t.date].completed++;
          } else {
            data.tasks[t.date].pending++;
          }
          data.tasks[t.date].items.push(t);
        }
      });

      // 3. 日记（按月过滤）
      const allJournals = await Storage.getAll('journal');
      allJournals.forEach(j => {
        if (j.date && j.date.startsWith(monthStr)) {
          if (!data.journal[j.date]) {
            data.journal[j.date] = { hasDiary: false, hasReflection: false, previews: [] };
          }
          if (j.type === 'diary') {
            data.journal[j.date].hasDiary = true;
          } else if (j.type === 'reflection' || j.type === 'review') {
            data.journal[j.date].hasReflection = true;
          }
          if (j.content) {
            data.journal[j.date].previews.push(j.content.substring(0, 60));
          }
        }
      });

      // 4. 财务（按月索引查询）
      const financeRecords = await Storage.getByIndex('finance', 'month', monthStr);
      financeRecords.forEach(f => {
        if (!data.finance[f.date]) {
          data.finance[f.date] = { income: 0, expense: 0 };
        }
        if (f.type === 'income') {
          data.finance[f.date].income += (f.amount || 0);
        } else if (f.type === 'expense') {
          data.finance[f.date].expense += (f.amount || 0);
        }
      });

      // 5. 健康（全量过滤）
      const allHealth = await Storage.getAll('health');
      allHealth.forEach(h => {
        if (h.date && h.date.startsWith(monthStr)) {
          data.health[h.date] = true;
        }
      });

      // 6. 学习（全量过滤）
      const allStudy = await Storage.getAll('study');
      allStudy.forEach(s => {
        if (s.date && s.date.startsWith(monthStr)) {
          data.study[s.date] = true;
        }
      });

    } catch (err) {
      console.error('[Calendar] 加载月度数据失败:', err);
    }

    monthDataCache[monthStr] = data;
    return data;
  }

  // ===== 清除缓存 =====
  function clearCache() {
    monthDataCache = {};
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Calendar] 日历总览模块初始化...');
    clearCache();
    bindEvents();
    await renderCalendar();
  }

  // ===== 绑定事件 =====
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) {
      el.addEventListener(event, handler);
      _eventListeners.push({ el, event, handler });
    }
  }

  function bindEvents() {
    const prevBtn = document.getElementById('calendar-prev-month');
    const nextBtn = document.getElementById('calendar-next-month');
    const todayBtn = document.getElementById('calendar-today-btn');
    const closeBtn = document.getElementById('calendar-detail-close');
    const overlay = document.getElementById('calendar-detail-overlay');

    _bindEvent(prevBtn, 'click', () => shiftMonth(-1));
    _bindEvent(nextBtn, 'click', () => shiftMonth(1));
    _bindEvent(todayBtn, 'click', goToday);
    _bindEvent(closeBtn, 'click', closeDetail);
    _bindEvent(overlay, 'click', closeDetail);
  }

  // ===== 渲染日历 =====
  async function renderCalendar() {
    const labelEl = document.getElementById('calendar-month-label');
    const daysEl = document.getElementById('calendar-days');

    if (labelEl) {
      labelEl.textContent = `${calYear}年${calMonth + 1}月`;
    }

    if (!daysEl) return;
    daysEl.innerHTML = '';

    // 加载月度数据
    const data = await loadMonthData(calYear, calMonth);

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = todayStr();

    // 空白格
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day empty';
      daysEl.appendChild(empty);
    }

    // 日期格
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateStr(calYear, calMonth, day);
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';

      // 周末判断
      const dayOfWeek = new Date(calYear, calMonth, day).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        dayEl.classList.add('weekend');
      }

      // 今天
      if (dateStr === today) {
        dayEl.classList.add('today');
      }

      // 日期数字
      const numEl = document.createElement('div');
      numEl.className = 'calendar-day-number';
      numEl.textContent = day;
      dayEl.appendChild(numEl);

      // 标记圆点
      const dotsEl = document.createElement('div');
      dotsEl.className = 'calendar-day-dots';

      // 打卡圆点（深浅度）
      const habitsList = data.checkins[dateStr] || [];
      if (habitsList.length > 0) {
        const dot = document.createElement('span');
        dot.className = 'calendar-day-dot';
        // 打卡数量分4档
        if (habitsList.length <= 3) dot.classList.add('habits-1');
        else if (habitsList.length <= 6) dot.classList.add('habits-2');
        else if (habitsList.length <= 9) dot.classList.add('habits-3');
        else dot.classList.add('habits-4');
        dot.title = `打卡 ${habitsList.length}/${HABITS.length}`;
        dotsEl.appendChild(dot);
      }

      // 任务圆点
      const taskInfo = data.tasks[dateStr];
      if (taskInfo && (taskInfo.completed > 0 || taskInfo.pending > 0)) {
        const dot = document.createElement('span');
        dot.className = 'calendar-day-dot';
        if (taskInfo.completed > 0) {
          dot.classList.add('tasks');
          dot.title = `任务 ${taskInfo.completed}完成/${taskInfo.pending}待办`;
        } else {
          dot.classList.add('tasks-open');
          dot.title = `任务 ${taskInfo.pending}待办`;
        }
        dotsEl.appendChild(dot);
      }

      // 日记圆点
      const journalInfo = data.journal[dateStr];
      if (journalInfo && (journalInfo.hasDiary || journalInfo.hasReflection)) {
        const dot = document.createElement('span');
        dot.className = 'calendar-day-dot journal';
        const types = [];
        if (journalInfo.hasDiary) types.push('日记');
        if (journalInfo.hasReflection) types.push('复盘');
        dot.title = types.join(' + ');
        dotsEl.appendChild(dot);
      }

      // 财务圆点
      const financeInfo = data.finance[dateStr];
      if (financeInfo) {
        if (financeInfo.expense > 0) {
          const dot = document.createElement('span');
          dot.className = 'calendar-day-dot expense';
          dot.title = `支出 ¥${financeInfo.expense.toFixed(2)}`;
          dotsEl.appendChild(dot);
        }
        if (financeInfo.income > 0) {
          const dot = document.createElement('span');
          dot.className = 'calendar-day-dot income';
          dot.title = `收入 ¥${financeInfo.income.toFixed(2)}`;
          dotsEl.appendChild(dot);
        }
      }

      // 健康圆点
      if (data.health[dateStr]) {
        const dot = document.createElement('span');
        dot.className = 'calendar-day-dot health';
        dot.title = '健康记录';
        dotsEl.appendChild(dot);
      }

      // 学习圆点
      if (data.study[dateStr]) {
        const dot = document.createElement('span');
        dot.className = 'calendar-day-dot study';
        dot.title = '学习记录';
        dotsEl.appendChild(dot);
      }

      dayEl.appendChild(dotsEl);

      // 活跃度条
      const activityCount = countActivities(dateStr, data);
      if (activityCount > 0) {
        const barEl = document.createElement('div');
        barEl.className = 'calendar-day-activity-bar';
        const fillEl = document.createElement('div');
        fillEl.className = 'calendar-day-activity-bar-fill';
        const maxActivities = 7; // 最多7种维度
        const pct = Math.min(100, (activityCount / maxActivities) * 100);
        fillEl.style.width = pct + '%';
        fillEl.style.background = getActivityColor(activityCount);
        barEl.appendChild(fillEl);
        dayEl.appendChild(barEl);
      }

      // 点击打开详情
      _bindEvent(dayEl, 'click', () => openDetail(dateStr));

      daysEl.appendChild(dayEl);
    }
  }

  // ===== 计算活跃维度数 =====
  function countActivities(dateStr, data) {
    let count = 0;
    if ((data.checkins[dateStr] || []).length > 0) count++;
    const t = data.tasks[dateStr];
    if (t && (t.completed > 0 || t.pending > 0)) count++;
    const j = data.journal[dateStr];
    if (j && (j.hasDiary || j.hasReflection)) count++;
    const f = data.finance[dateStr];
    if (f && (f.income > 0 || f.expense > 0)) count++;
    if (data.health[dateStr]) count++;
    if (data.study[dateStr]) count++;
    return count;
  }

  // ===== 活跃度条颜色 =====
  function getActivityColor(count) {
    if (count <= 1) return '#D5D0CB';
    if (count <= 2) return '#E8A87C';
    if (count <= 3) return '#E0C07C';
    if (count <= 4) return '#B8D47C';
    return '#6DBF7E';
  }

  // ===== 月份切换 =====
  function shiftMonth(delta) {
    calMonth += delta;
    if (calMonth > 11) {
      calMonth = 0;
      calYear++;
    } else if (calMonth < 0) {
      calMonth = 11;
      calYear--;
    }
    renderCalendar();
  }

  function goToday() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    renderCalendar();
  }

  // ===== 打开日期详情面板 =====
  async function openDetail(dateStr) {
    const panel = document.getElementById('calendar-detail-panel');
    const overlay = document.getElementById('calendar-detail-overlay');
    const dateLabel = document.getElementById('calendar-detail-date');
    const body = document.getElementById('calendar-detail-body');

    if (!panel || !overlay || !body) return;

    // 设置日期标题
    if (dateLabel) {
      const d = new Date(dateStr + 'T00:00:00');
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      dateLabel.textContent = `${y}年${m}月${day}日 ${getWeekdayName(dateStr)}`;
    }

    // 加载该日期的数据
    const monthStr = dateStr.substring(0, 7);
    const data = await loadMonthData(calYear, calMonth);

    // 构建详情内容
    let html = '';

    // 1. 打卡
    const habitsList = data.checkins[dateStr] || [];
    html += buildSection('✅', '习惯打卡', 'habits', () => {
      if (habitsList.length === 0) return '<div class="calendar-detail-empty">暂无打卡记录</div>';
      return `<div class="calendar-detail-habit-list">${
        habitsList.map(hId => {
          const habit = HABITS.find(h => h.id === hId);
          return habit
            ? `<span class="calendar-detail-habit-tag">${habit.emoji} ${habit.name}</span>`
            : `<span class="calendar-detail-habit-tag">${hId}</span>`;
        }).join('')
      }</div>
      <div class="calendar-detail-content" style="margin-top:6px;">完成 ${habitsList.length}/${HABITS.length} 个习惯</div>`;
    });

    // 2. 任务
    const taskInfo = data.tasks[dateStr];
    html += buildSection('📋', '任务', 'tasks', () => {
      if (!taskInfo || (taskInfo.completed === 0 && taskInfo.pending === 0)) {
        return '<div class="calendar-detail-empty">暂无任务</div>';
      }
      const items = taskInfo.items.slice(0, 5).map(t => {
        const isDone = t.status === 'completed';
        return `<div class="calendar-detail-task-item">
          <span class="calendar-detail-task-check${isDone ? ' done' : ''}">${isDone ? '✓' : ''}</span>
          <span class="calendar-detail-task-text${isDone ? ' done' : ''}">${escapeHtml(t.title || t.text || '未命名任务')}</span>
        </div>`;
      }).join('');
      const more = taskInfo.items.length > 5 ? `<div class="calendar-detail-content">...还有 ${taskInfo.items.length - 5} 个任务</div>` : '';
      return items + more;
    });

    // 3. 日记
    const journalInfo = data.journal[dateStr];
    html += buildSection('📝', '记录与反思', 'journal', () => {
      if (!journalInfo || (!journalInfo.hasDiary && !journalInfo.hasReflection)) {
        return '<div class="calendar-detail-empty">暂无记录</div>';
      }
      let content = '';
      if (journalInfo.hasDiary) content += '<div class="calendar-detail-content">📖 日记</div>';
      if (journalInfo.hasReflection) content += '<div class="calendar-detail-content">🔄 复盘</div>';
      journalInfo.previews.forEach(p => {
        content += `<div class="calendar-detail-content" style="color:var(--text-muted);margin-top:2px;">${escapeHtml(p)}${p.length >= 60 ? '...' : ''}</div>`;
      });
      return content;
    });

    // 4. 财务
    const financeInfo = data.finance[dateStr];
    html += buildSection('💰', '财务', 'finance', () => {
      if (!financeInfo || (financeInfo.income === 0 && financeInfo.expense === 0)) {
        return '<div class="calendar-detail-empty">暂无财务记录</div>';
      }
      let content = '';
      if (financeInfo.income > 0) {
        content += `<div class="calendar-detail-finance-row">
          <span class="calendar-detail-finance-label">收入</span>
          <span class="calendar-detail-finance-value income">+¥${financeInfo.income.toFixed(2)}</span>
        </div>`;
      }
      if (financeInfo.expense > 0) {
        content += `<div class="calendar-detail-finance-row">
          <span class="calendar-detail-finance-label">支出</span>
          <span class="calendar-detail-finance-value expense">-¥${financeInfo.expense.toFixed(2)}</span>
        </div>`;
      }
      const net = financeInfo.income - financeInfo.expense;
      content += `<div class="calendar-detail-finance-row" style="border-top:1px solid var(--cal-cell-border);padding-top:6px;margin-top:4px;">
        <span class="calendar-detail-finance-label">净额</span>
        <span class="calendar-detail-finance-value ${net >= 0 ? 'income' : 'expense'}">${net >= 0 ? '+' : ''}¥${net.toFixed(2)}</span>
      </div>`;
      return content;
    });

    // 5. 健康
    html += buildSection('💪', '健康', 'health', () => {
      if (!data.health[dateStr]) return '<div class="calendar-detail-empty">暂无健康记录</div>';
      return '<div class="calendar-detail-content">已记录健康数据</div>';
    });

    // 6. 学习
    html += buildSection('📚', '学习', 'study', () => {
      if (!data.study[dateStr]) return '<div class="calendar-detail-empty">暂无学习记录</div>';
      return '<div class="calendar-detail-content">已记录学习数据</div>';
    });

    // 无数据时
    if (habitsList.length === 0 && (!taskInfo || (taskInfo.completed === 0 && taskInfo.pending === 0)) &&
        (!journalInfo || (!journalInfo.hasDiary && !journalInfo.hasReflection)) &&
        (!financeInfo || (financeInfo.income === 0 && financeInfo.expense === 0)) &&
        !data.health[dateStr] && !data.study[dateStr]) {
      html = '<div class="calendar-detail-no-data">这一天暂无活动记录<br>点击下方模块开始记录吧 ✨</div>';
    }

    body.innerHTML = html;

    // 绑定"跳转到模块"按钮
    body.querySelectorAll('.calendar-detail-section-go').forEach(btn => {
      _bindEvent(btn, 'click', (e) => {
        e.stopPropagation();
        const route = btn.dataset.route;
        if (route) {
          closeDetail();
          Router.navigate(route);
        }
      });
    });

    // 显示面板
    panel.classList.add('active');
    overlay.classList.add('active');
  }

  // ===== 构建详情区块 =====
  function buildSection(icon, title, route, contentFn) {
    return `<div class="calendar-detail-section">
      <div class="calendar-detail-section-header">
        <span class="calendar-detail-section-icon">${icon}</span>
        <span class="calendar-detail-section-title">${title}</span>
        <button class="calendar-detail-section-go" data-route="${route}">前往 ›</button>
      </div>
      ${contentFn()}
    </div>`;
  }

  // ===== 关闭详情面板 =====
  function closeDetail() {
    const panel = document.getElementById('calendar-detail-panel');
    const overlay = document.getElementById('calendar-detail-overlay');
    if (panel) panel.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
  }

  // ===== HTML 转义 =====
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===== 模块生命周期 =====
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    closeDetail();
    clearCache();
    console.log('[CalendarModule] 模块已销毁');
  }

  return { init, destroy };
})();
