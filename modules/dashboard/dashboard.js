/**
 * dashboard.js - 总面板逻辑
 * 人生工作台 · 首页数据渲染与交互
 * v37 - 数据看板2.0 Widget系统
 */

const DashboardModule = (() => {
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
        renderCalendar(),
        renderHighlights(),
        renderBirthdayReminder(),
        renderFeed(),
        renderFocusCard(),
        renderTemplateReminder(),
        renderSmartSuggestions(),
        renderPredictiveActions(),
        initWidgetSystem()
      ]);
      bindFocusEvents();
      bindAnnualEvents();
      bindWidgetEvents();
    } catch (err) {
      console.error('[Dashboard] 初始化失败:', err);
      if (typeof App !== 'undefined') App.showToast('总览加载失败，请刷新重试');
    }
  }

  /**
   * 渲染智能建议卡片
   */
  async function renderSmartSuggestions() {
    const container = document.getElementById('dash-smart-suggestions');
    if (!container) return;

    // 确保 SmartSuggestion 已初始化
    if (typeof SmartSuggestion !== 'undefined' && SmartSuggestion.renderSuggestions) {
      try {
        await SmartSuggestion.renderSuggestions(container);
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
    if (typeof PredictiveEngine === 'undefined' || !PredictiveEngine.getPredictions) {
      container.style.display = 'none';
      return;
    }

    try {
      const predictions = await PredictiveEngine.getPredictions();

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
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const predId = btn.dataset.predictionId;
          const prediction = predictions.find(p => p.id === predId);
          if (prediction) {
            // 记录「有用」反馈
            if (PredictiveEngine.recordFeedback) {
              PredictiveEngine.recordFeedback(predId, true);
            }
            // 执行预测操作
            if (PredictiveEngine.executePrediction) {
              await PredictiveEngine.executePrediction(prediction);
            }
          }
        });
      });

      // 绑定整个卡片点击
      container.querySelectorAll('.dash-predictive-item').forEach(item => {
        item.addEventListener('click', async () => {
          const predId = item.dataset.predictionId;
          const prediction = predictions.find(p => p.id === predId);
          if (prediction && PredictiveEngine.executePrediction) {
            if (PredictiveEngine.recordFeedback) {
              PredictiveEngine.recordFeedback(predId, true);
            }
            await PredictiveEngine.executePrediction(prediction);
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
    const textColor = isDark ? '#6E6E82' : '#8A7D71';
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
        value = allTasks.filter(t => t.status === 'done' && t.completedAt && t.completedAt.startsWith(monthStr)).length;
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
      ctx.fillStyle = isDark ? '#2A2A4A' : '#DCC5AD';
      ctx.fill();
      ctx.fillStyle = isDark ? '#6E6E82' : '#8A7D71';
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
    ctx.fillStyle = isDark ? '#0F3460' : '#EEE9E3';
    ctx.fill();

    // 中心文字
    ctx.fillStyle = isDark ? '#E0E0E0' : '#3D3027';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const balance = income - expense;
    ctx.fillText(`¥${Math.abs(balance).toLocaleString()}`, cx, cy - 4);
    ctx.font = '9px sans-serif';
    ctx.fillStyle = isDark ? '#6E6E82' : '#8A7D71';
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

      item.addEventListener('dragstart', onDragStart);
      item.addEventListener('dragover', onDragOver);
      item.addEventListener('dragleave', onDragLeave);
      item.addEventListener('drop', onDrop);
      item.addEventListener('dragend', onDragEnd);

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
      editBtn.addEventListener('click', handler);
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
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dash-widget-config-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (item !== draggedItem) {
          item.classList.add('dash-widget-config-drag-over');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('dash-widget-config-drag-over');
      });

      item.addEventListener('drop', (e) => {
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

      item.addEventListener('dragend', () => {
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
    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHandler(); });

    // 确认按钮 - 保存并重新渲染
    const confirmHandler = async () => {
      await saveWidgetConfig(_widgetConfig);
      _widgetEditMode = false;
      await renderWidgets();
      overlay.style.display = 'none';
    };
    if (confirmBtn) confirmBtn.addEventListener('click', confirmHandler);

    // 添加Widget按钮 - 切换类型菜单
    const toggleMenuHandler = () => {
      typeMenu && typeMenu.classList.toggle('hidden');
    };
    if (addBtn) addBtn.addEventListener('click', toggleMenuHandler);

    // 类型菜单项点击
    if (typeMenu) {
      typeMenu.querySelectorAll('.dash-widget-type-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.type;
          const typeDef = WIDGET_TYPES[type];
          if (!typeDef) return;

          // 检查是否已存在
          if (_widgetConfig.some(w => w.type === type)) {
            if (typeof App !== 'undefined') App.showToast('该 Widget 已添加');
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
        btn.addEventListener('click', () => {
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
      configList.addEventListener('click', (e) => {
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
      configList.addEventListener('click', (e) => {
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
    container.addEventListener('click', () => {
      if (typeof Router !== 'undefined') {
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
      if (typeof SecureStorage !== 'undefined' && SecureStorage.loadSecure) {
        token = await SecureStorage.loadSecure('deepseek_token');
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
            if (task && task.status !== 'done') {
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
      cb.addEventListener('change', async (e) => {
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
      refreshBtn.addEventListener('click', () => {
        customFocusIds = null;
        focusTasks = [];
        focusOffset += 3;
        renderFocusCard();
      });
    }

    // 自定义
    const customizeBtn = document.getElementById('dash-focus-customize');
    if (customizeBtn) {
      customizeBtn.addEventListener('click', () => showCustomFocusModal());
    }

    // 自定义弹窗关闭
    const closeBtn = document.getElementById('dash-custom-focus-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('dash-custom-focus-overlay').style.display = 'none';
      });
    }

    // 自定义弹窗确认
    const confirmBtn = document.getElementById('dash-custom-focus-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
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
      overlay.addEventListener('click', (e) => {
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
          cb.addEventListener('change', () => {
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

    if (btn) {
      btn.addEventListener('click', () => showAnnualReview(new Date().getFullYear()));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (overlay) overlay.style.display = 'none';
      });
    }
    if (overlay) {
      overlay.addEventListener('click', (e) => {
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
    destroyWidgets();
    console.log('[DashboardModule] 模块已销毁');
  }

  return { init, showAnnualReview };
})();
