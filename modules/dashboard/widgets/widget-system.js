/**
 * widget-system.js - 数据看板 Widget 系统核心
 * 人生工作台 · 自定义 Widget 渲染、拖拽排序、配置管理
 * 从 Dashboard 拆分而出 (v125)
 */
import { AppUtils } from '../../../core/utils.js';
import { Storage } from '../../../core/storage.js';
import { EventBus } from '../../../core/event-bus.js';
import { AchievementsWidget } from './achievements-widget.js';
import { LifeTreeWidget } from './lifetree-widget.js';

const WidgetSystem = (() => {
  const { escapeHtml, getTodayStr } = AppUtils;

  // ===== 状态 =====
  let _widgetConfig = null;
  let _widgetEditMode = false;
  let _widgetDestroyFns = [];
  let _widgetDragListeners = [];
  let _widgetEventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _widgetEventListeners.push({ el, event, handler }); }
  }

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

  const DEFAULT_WIDGET_CONFIG = [
    { type: 'progress-ring', size: 1, id: 'w_progress_1' },
    { type: 'counter', size: 1, id: 'w_counter_1' },
    { type: 'mini-line-chart', size: 2, id: 'w_line_1' },
    { type: 'list-widget', size: 2, id: 'w_list_1' }
  ];

  function _loadWidgetStyles() {
    if (document.getElementById('dashboard-widgets-css')) return;
    const link = document.createElement('link');
    link.id = 'dashboard-widgets-css';
    link.rel = 'stylesheet';
    link.href = 'modules/dashboard/widgets/widgets.css';
    document.head.appendChild(link);
  }

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
        case 'achievements-widget':
          await AchievementsWidget.renderMini(container, widget.config);
          break;
        case 'lifetree-widget':
          await LifeTreeWidget.renderMini(container, widget.config);
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

    // v106: 数字翻页计数器
    const valueStr = String(value);
    const flipHtml = buildFlipCounter(valueStr);
    container.innerHTML = `
      <div class="dash-widget-counter-label"><span class="dash-widget-counter-icon">${icon}</span> ${label}</div>
      <div class="dash-widget-counter">
        <span class="dash-widget-counter-value flip-counter" data-value="${valueStr}">${flipHtml}</span>
        <span class="dash-widget-counter-unit">${unit}</span>
      </div>
    `;
  }

  /**
   * v106: 构建翻页计数器 HTML 结构
   * 每个数字一位，上下两半，动画时翻转
   */
  function buildFlipCounter(value) {
    const chars = String(value).split('');
    return chars.map((ch) => {
      if (/\d/.test(ch)) {
        return `
          <div class="flip-digit" data-digit="${ch}">
            <div class="digit-top"><span>${ch}</span></div>
            <div class="digit-bottom"><span>${ch}</span></div>
            <div class="flip-top"><span>${ch}</span></div>
            <div class="flip-bottom"><span>${ch}</span></div>
          </div>
        `;
      } else {
        return `<span class="flip-non-digit">${ch}</span>`;
      }
    }).join('');
  }

  /**
   * v106: 播放数字翻页动画（逐位比较新旧数字，不同的位触发翻转）
   */
  function animateFlipCounter(containerEl, newValue) {
    const flipEl = containerEl.querySelector('.flip-counter');
    if (!flipEl) return;
    const oldValue = String(flipEl.dataset.value || '');
    const newStr = String(newValue);
    if (oldValue === newStr) return;

    // 重建 HTML 并在翻转完成后更新静态层数字
    const digits = flipEl.querySelectorAll('.flip-digit');
    const newDigits = newStr.split('');
    const oldDigits = oldValue.split('');

    // 长度不同时重建
    if (newDigits.length !== oldDigits.length) {
      flipEl.innerHTML = buildFlipCounter(newStr);
      flipEl.dataset.value = newStr;
      return;
    }

    // 逐位对比，触发翻转
    digits.forEach((digitEl, i) => {
      const oldD = oldDigits[i];
      const newD = newDigits[i];
      if (oldD === newD) return;

      // 设置翻页元素内容
      const flipTop = digitEl.querySelector('.flip-top span');
      const flipBottom = digitEl.querySelector('.flip-bottom span');
      const digitTop = digitEl.querySelector('.digit-top span');
      const digitBottom = digitEl.querySelector('.digit-bottom span');

      if (flipTop) flipTop.textContent = oldD;
      if (flipBottom) flipBottom.textContent = newD;

      digitEl.classList.remove('flipping');
      // 触发 reflow 重新播放动画
      void digitEl.offsetWidth;
      digitEl.classList.add('flipping');

      // 动画结束后更新静态层
      const onEnd = () => {
        digitEl.classList.remove('flipping');
        if (digitTop) digitTop.textContent = newD;
        if (digitBottom) digitBottom.textContent = newD;
        if (flipTop) flipTop.textContent = newD;
        if (flipBottom) flipBottom.textContent = newD;
        digitEl.dataset.digit = newD;
        digitEl.removeEventListener('animationend', onEnd);
      };
      digitEl.addEventListener('animationend', onEnd);
    });

    flipEl.dataset.value = newStr;
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


  // ====================================================================
  // ===== Widget类型6: 成就Widget =====
  // ====================================================================

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


  function destroyWidgets() {
    _widgetDestroyFns.forEach(fn => { try { fn(); } catch (e) {} });
    _widgetDestroyFns = [];

    // 清理拖拽监听器
    _widgetDragListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch (e) {}
    });
    _widgetDragListeners = [];
  }


  async function init() {
    _loadWidgetStyles();
    _widgetConfig = await loadWidgetConfig();
    await renderWidgets();
    bindWidgetEvents();
  }

  function destroy() {
    destroyWidgets();
    _widgetEventListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch(e) {}
    });
    _widgetEventListeners = [];
  }

  return { init, destroy, renderWidgets, loadWidgetConfig, saveWidgetConfig, destroyWidgets };
})();

export { WidgetSystem };
