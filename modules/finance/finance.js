/**
 * finance.js - 财务与资产模块逻辑
 * 人生工作台 · 收入支出记账 / 预算管理 / 统计分析
 * 增强功能：年度趋势折线图 / 分类环比分析 / 储蓄目标 / 账户管理 / 预算智能推荐
 */

const FinanceModule = (() => {
  const { escapeHtml } = AppUtils;

  // ===== 状态 =====
  let allRecords = [];          // 所有交易记录
  let budgetData = null;        // 预算设置 { monthly, yearly }
  let expenseCategories = [];   // 支出分类
  let incomeSources = [];       // 收入来源
  let filterMonth = '';         // 筛选月份 '' = 当前月
  let editingId = null;         // 编辑中的记录ID
  let currentPage = 1;
  const pageSize = 20;

  // 增强功能状态
  let savingsGoals = [];        // 储蓄目标列表
  let accounts = [];            // 账户列表
  let editingSavingsId = null;  // 编辑中的储蓄目标ID
  let editingAccountId = null;  // 编辑中的账户ID
  let selectedAccountType = 'bank'; // 弹窗中选中的账户类型
  let _chartHoverHandler = null;     // 折线图hover处理器引用

  // 默认分类
  const DEFAULT_EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '学习', '居住', '医疗', '其他'];
  const DEFAULT_INCOME_SOURCES = ['工资', '兼职', '投资', '红包', '其他'];

  // 分类颜色映射
  const CATEGORY_COLORS = {
    '餐饮': '#E8A87C', '交通': '#7c9eb8', '购物': '#d4735c', '娱乐': '#b8a07c',
    '学习': '#5a9e6f', '居住': '#9b8e83', '医疗': '#c97c5d', '其他': '#a0937d',
    '工资': '#5a9e6f', '兼职': '#7c9eb8', '投资': '#E8A87C', '红包': '#d4735c'
  };
  const EXTRA_COLORS = ['#c97c5d', '#b8a07c', '#7c9eb8', '#9b8e83', '#a0937d', '#d4735c', '#5a9e6f', '#E8A87C'];

  // 账户类型配置
  const ACCOUNT_TYPES = {
    bank: { icon: '🏦', label: '银行卡' },
    alipay: { icon: '🦋', label: '支付宝' },
    wechat: { icon: '💬', label: '微信' },
    cash: { icon: '💵', label: '现金' },
    invest: { icon: '📈', label: '投资' },
    other: { icon: '📦', label: '其他' }
  };

  // ===== 工具函数 =====
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function currentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function currentYearStr() {
    return String(new Date().getFullYear());
  }

  function formatMoney(n) {
    return '¥' + Number(n || 0).toFixed(2);
  }

  function getCategoryColor(name) {
    if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % EXTRA_COLORS.length;
    return EXTRA_COLORS[idx];
  }

  function showToast(msg) {
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(msg);
    } else {
      console.log('[Finance Toast]', msg);
    }
  }

  function generateId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Finance] 财务模块初始化...');
    await loadCategories();
    await loadData();
    await loadBudget();
    await loadSavingsGoals();
    await loadAccounts();
    renderAll();
    bindEvents();
  }

  // ===== 数据加载 =====
  async function loadData() {
    allRecords = await Storage.getAll('finance');
    allRecords.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }

  async function loadBudget() {
    try {
      budgetData = await Storage.get('settings', 'finance_budget');
      if (budgetData) budgetData = budgetData.value;
    } catch (e) {
      console.warn('[Finance] 读取预算失败', e);
      budgetData = null;
    }
  }

  async function loadCategories() {
    try {
      const catSetting = await Storage.get('settings', 'finance_expense_categories');
      expenseCategories = catSetting ? catSetting.value : [...DEFAULT_EXPENSE_CATEGORIES];

      const srcSetting = await Storage.get('settings', 'finance_income_sources');
      incomeSources = srcSetting ? srcSetting.value : [...DEFAULT_INCOME_SOURCES];
    } catch (e) {
      expenseCategories = [...DEFAULT_EXPENSE_CATEGORIES];
      incomeSources = [...DEFAULT_INCOME_SOURCES];
    }
  }

  async function saveCategories() {
    await Storage.put('settings', { key: 'finance_expense_categories', value: expenseCategories });
    await Storage.put('settings', { key: 'finance_income_sources', value: incomeSources });
  }

  // ===== 储蓄目标数据 =====
  async function loadSavingsGoals() {
    try {
      const setting = await Storage.get('settings', 'savings_goals');
      savingsGoals = setting ? setting.value : [];
    } catch (e) {
      savingsGoals = [];
    }
  }

  async function saveSavingsGoals() {
    await Storage.put('settings', { key: 'savings_goals', value: savingsGoals });
  }

  // ===== 账户数据 =====
  async function loadAccounts() {
    try {
      const setting = await Storage.get('settings', 'accounts');
      accounts = setting ? setting.value : [];
    } catch (e) {
      accounts = [];
    }
  }

  async function saveAccounts() {
    await Storage.put('settings', { key: 'accounts', value: accounts });
  }

  // ===== 计算统计 =====
  function calcStats(records, monthFilter) {
    let income = 0, expense = 0;
    for (const r of records) {
      if (monthFilter && r.month !== monthFilter) continue;
      if (r.type === 'income') income += r.amount;
      else expense += r.amount;
    }
    return { income, expense, balance: income - expense };
  }

  function calcYearStats(records, year) {
    let income = 0, expense = 0;
    for (const r of records) {
      if (!r.date.startsWith(year)) continue;
      if (r.type === 'income') income += r.amount;
      else expense += r.amount;
    }
    return { income, expense, balance: income - expense };
  }

  function calcCategoryBreakdown(records, month) {
    const map = {};
    let total = 0;
    for (const r of records) {
      if (r.type !== 'expense' || r.month !== month) continue;
      if (!map[r.category]) map[r.category] = 0;
      map[r.category] += r.amount;
      total += r.amount;
    }
    const list = Object.entries(map)
      .map(([name, amount]) => ({ name, amount, percent: total > 0 ? (amount / total * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount);
    return { list, total };
  }

  function calcTrend(records, months) {
    const result = [];
    for (const m of months) {
      let total = 0;
      for (const r of records) {
        if (r.type === 'expense' && r.month === m) total += r.amount;
      }
      result.push({ month: m, amount: total });
    }
    return result;
  }

  function getLast6Months() {
    const months = [];
    const d = new Date();
    for (let i = 0; i < 6; i++) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      months.unshift(`${y}-${m}`);
      d.setMonth(d.getMonth() - 1);
    }
    return months;
  }

  // ===== 增强计算：年度12个月收支 =====
  function calcYearlyTrend(records, year) {
    const result = [];
    for (let i = 1; i <= 12; i++) {
      const monthKey = `${year}-${String(i).padStart(2, '0')}`;
      let income = 0, expense = 0;
      for (const r of records) {
        if (r.month === monthKey) {
          if (r.type === 'income') income += r.amount;
          else expense += r.amount;
        }
      }
      result.push({ month: monthKey, monthNum: i, income, expense });
    }
    return result;
  }

  // ===== 增强计算：分类环比 =====
  function calcCategoryMoM(records) {
    const cm = currentMonthStr();
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const currentBreakdown = calcCategoryBreakdown(records, cm);
    const prevBreakdown = calcCategoryBreakdown(records, pm);

    // 合并两个月的分类
    const allCats = new Set([
      ...currentBreakdown.list.map(c => c.name),
      ...prevBreakdown.list.map(c => c.name)
    ]);

    const result = [];
    for (const cat of allCats) {
      const cur = currentBreakdown.list.find(c => c.name === cat);
      const prev = prevBreakdown.list.find(c => c.name === cat);
      const curAmount = cur ? cur.amount : 0;
      const prevAmount = prev ? prev.amount : 0;

      // 只展示本月有数据的分类
      if (curAmount === 0 && prevAmount === 0) continue;
      if (curAmount === 0) continue; // 本月无数据不展示

      let changePercent = 0;
      let direction = 'neutral'; // up, down, neutral
      if (prevAmount > 0) {
        changePercent = ((curAmount - prevAmount) / prevAmount * 100);
        direction = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'neutral';
      } else if (curAmount > 0) {
        // 上月无数据，本月有数据
        changePercent = 100;
        direction = 'up';
      }

      result.push({
        name: cat,
        currentAmount: curAmount,
        prevAmount,
        changePercent,
        direction
      });
    }

    return result.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  }

  // ===== 渲染 =====
  function renderAll() {
    renderStats();
    renderBudgetPanel();
    renderCategoryAnalysis();
    renderMoMAnalysis();
    renderTrend();
    renderYearlyTrend();
    renderSavingsGoals();
    renderAccounts();
    renderTransactions();
  }

  function renderStats() {
    const cm = currentMonthStr();
    const monthStats = calcStats(allRecords, cm);
    const yearStats = calcYearStats(allRecords, currentYearStr());

    // 月度
    document.getElementById('finance-month-income').textContent = formatMoney(monthStats.income);
    document.getElementById('finance-month-expense').textContent = formatMoney(monthStats.expense);
    document.getElementById('finance-month-balance').textContent = formatMoney(monthStats.balance);

    // 月度预算进度
    const monthlyBudget = budgetData?.monthly || 0;
    if (monthlyBudget > 0) {
      const pct = Math.round(monthStats.expense / monthlyBudget * 100);
      document.getElementById('finance-budget-percent').textContent = pct + '%';
      const bar = document.getElementById('finance-budget-bar');
      bar.style.width = Math.min(pct, 100) + '%';
      bar.classList.toggle('over-budget', pct > 100);
    } else {
      document.getElementById('finance-budget-percent').textContent = '--';
      document.getElementById('finance-budget-bar').style.width = '0%';
    }

    // 年度
    document.getElementById('finance-year-income').textContent = formatMoney(yearStats.income);
    document.getElementById('finance-year-expense').textContent = formatMoney(yearStats.expense);
    document.getElementById('finance-year-balance').textContent = formatMoney(yearStats.balance);

    // 年度预算
    const yearlyBudget = budgetData?.yearly || 0;
    if (yearlyBudget > 0) {
      const pct = Math.round(yearStats.expense / yearlyBudget * 100);
      document.getElementById('finance-yearly-budget-percent').textContent = pct + '%';
      const bar = document.getElementById('finance-yearly-budget-bar');
      bar.style.width = Math.min(pct, 100) + '%';
      bar.classList.toggle('over-budget', pct > 100);
    } else {
      document.getElementById('finance-yearly-budget-percent').textContent = '--';
      document.getElementById('finance-yearly-budget-bar').style.width = '0%';
    }

    // 超支警告
    const alert = document.getElementById('finance-overbudget-alert');
    const alertText = document.getElementById('finance-overbudget-text');
    const overBudgetMonthly = monthlyBudget > 0 && monthStats.expense > monthlyBudget;
    const overBudgetYearly = yearlyBudget > 0 && yearStats.expense > yearlyBudget;

    if (overBudgetMonthly || overBudgetYearly) {
      let msg = '';
      if (overBudgetMonthly) msg += `本月支出已超出月度预算（${formatMoney(monthStats.expense)} / ${formatMoney(monthlyBudget)}）`;
      if (overBudgetYearly) msg += (msg ? '；' : '') + `年度支出已超出年度预算（${formatMoney(yearStats.expense)} / ${formatMoney(yearlyBudget)}）`;
      alertText.textContent = '⚠️ ' + msg;
      alert.style.display = 'flex';
    } else {
      alert.style.display = 'none';
    }
  }

  function renderBudgetPanel() {
    const monthlyInput = document.getElementById('finance-monthly-budget');
    const yearlyInput = document.getElementById('finance-yearly-budget');
    if (budgetData) {
      monthlyInput.value = budgetData.monthly || '';
      yearlyInput.value = budgetData.yearly || '';
    }
  }

  function renderCategoryAnalysis() {
    const container = document.getElementById('finance-category-list');
    const cm = currentMonthStr();
    const { list, total } = calcCategoryBreakdown(allRecords, cm);

    if (list.length === 0) {
      container.innerHTML = '<div class="finance-empty-hint">暂无支出数据</div>';
      return;
    }

    const maxAmount = list[0]?.amount || 1;
    container.innerHTML = list.map(item => `
      <div class="finance-category-item">
        <span class="finance-category-dot" style="background:${getCategoryColor(item.name)}"></span>
        <span class="finance-category-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        <div class="finance-category-bar-wrap">
          <div class="finance-category-bar" style="width:${(item.amount / maxAmount * 100).toFixed(1)}%;background:${getCategoryColor(item.name)}"></div>
        </div>
        <span class="finance-category-amount">${formatMoney(item.amount)}</span>
        <span class="finance-category-percent">${item.percent.toFixed(1)}%</span>
      </div>
    `).join('');
  }

  // ===== 环比分析渲染 =====
  function renderMoMAnalysis() {
    const container = document.getElementById('finance-mom-list');
    const momData = calcCategoryMoM(allRecords);

    if (momData.length === 0) {
      container.innerHTML = '<div class="finance-empty-hint">暂无环比数据</div>';
      return;
    }

    container.innerHTML = momData.map(item => {
      const arrow = item.direction === 'up' ? '↑' : item.direction === 'down' ? '↓' : '→';
      const dirClass = item.direction;
      const pctStr = Math.abs(item.changePercent).toFixed(1) + '%';
      return `
        <div class="finance-mom-item">
          <span class="finance-mom-cat-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <span class="finance-mom-arrow ${dirClass}">${arrow}</span>
          <span class="finance-mom-percent ${dirClass}">${pctStr}</span>
          <span class="finance-mom-detail">${formatMoney(item.prevAmount)} → ${formatMoney(item.currentAmount)}</span>
        </div>
      `;
    }).join('');
  }

  function renderTrend() {
    const container = document.getElementById('finance-trend-list');
    const months = getLast6Months();
    const trend = calcTrend(allRecords, months);
    const maxAmount = Math.max(...trend.map(t => t.amount), 1);

    if (trend.every(t => t.amount === 0)) {
      container.innerHTML = '<div class="finance-empty-hint">暂无趋势数据</div>';
      return;
    }

    container.innerHTML = trend.map(item => {
      const label = item.month.substring(5);
      const pct = (item.amount / maxAmount * 100).toFixed(1);
      return `
        <div class="finance-trend-item">
          <span class="finance-trend-month">${label}月</span>
          <div class="finance-trend-bar-wrap">
            <div class="finance-trend-bar" style="width:${pct}%"></div>
          </div>
          <span class="finance-trend-amount">${formatMoney(item.amount)}</span>
        </div>
      `;
    }).join('');
  }

  // ===== 年度趋势折线图（Canvas） =====
  function renderYearlyTrend() {
    const canvas = document.getElementById('finance-yearly-chart');
    if (!canvas) return;

    const year = currentYearStr();
    const data = calcYearlyTrend(allRecords, year);
    const wrap = document.getElementById('finance-yearly-chart-wrap');
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // 绘图参数
    const padLeft = 52, padRight = 16, padTop = 16, padBottom = 28;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // 数据范围
    const allValues = data.flatMap(d => [d.income, d.expense]);
    const maxVal = Math.max(...allValues, 1);
    const niceMax = Math.ceil(maxVal / 1000) * 1000 || 1000;

    // Y轴刻度
    const ySteps = 4;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = '#a0937d';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= ySteps; i++) {
      const val = (niceMax / ySteps) * i;
      const y = padTop + chartH - (chartH * i / ySteps);
      ctx.fillText(val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val.toFixed(0), padLeft - 8, y);
      // 网格线
      ctx.strokeStyle = 'rgba(160, 147, 125, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();
    }

    // X轴标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#a0937d';
    const xStep = chartW / 11;
    const points = { income: [], expense: [] };
    for (let i = 0; i < 12; i++) {
      const x = padLeft + xStep * i;
      ctx.fillText((i + 1) + '月', x, padTop + chartH + 8);

      const yIncome = padTop + chartH - (data[i].income / niceMax * chartH);
      const yExpense = padTop + chartH - (data[i].expense / niceMax * chartH);
      points.income.push({ x, y: yIncome, income: data[i].income, expense: data[i].expense, month: (i + 1) + '月' });
      points.expense.push({ x, y: yExpense, income: data[i].income, expense: data[i].expense, month: (i + 1) + '月' });
    }

    // 绘制线条函数
    function drawLine(pts, color, fillColor) {
      if (pts.length < 2) return;
      // 填充区域
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }
      ctx.lineTo(pts[pts.length - 1].x, padTop + chartH);
      ctx.lineTo(pts[0].x, padTop + chartH);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      // 线条
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 数据点
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    drawLine(points.expense, '#d4735c', 'rgba(212, 115, 92, 0.08)');
    drawLine(points.income, '#5a9e6f', 'rgba(90, 158, 111, 0.08)');

    // 存储点位数据供hover使用
    canvas._chartPoints = points;
    canvas._padLeft = padLeft;
    canvas._padTop = padTop;
    canvas._chartW = chartW;
    canvas._chartH = chartH;
    canvas._niceMax = niceMax;
  }

  // ===== 储蓄目标渲染 =====
  function renderSavingsGoals() {
    const container = document.getElementById('finance-savings-list');
    if (!container) return;

    if (savingsGoals.length === 0) {
      container.innerHTML = '<div class="finance-empty-hint">暂无储蓄目标，点击下方按钮添加</div>';
      return;
    }

    // 自动累加本月结余到进度（仅显示时不写入，避免重复累加）
    const cm = currentMonthStr();
    const monthStats = calcStats(allRecords, cm);

    container.innerHTML = savingsGoals.map(goal => {
      const pct = goal.target > 0 ? Math.min((goal.current / goal.target * 100), 100) : 0;
      const pctStr = pct.toFixed(1);

      // 预计达成日期
      let etaText = '';
      if (goal.current >= goal.target) {
        etaText = '✅ 已达成';
      } else if (goal.targetDate) {
        const remain = goal.target - goal.current;
        const targetDate = new Date(goal.targetDate);
        const today = new Date();
        const daysLeft = Math.max(0, Math.ceil((targetDate - today) / 86400000));
        if (daysLeft > 0) {
          const dailyNeeded = remain / daysLeft;
          etaText = `每日需存 ${formatMoney(dailyNeeded)}`;
        } else {
          etaText = '⚠️ 已过目标日期';
        }
      }

      return `
        <div class="finance-savings-item" data-id="${goal.id}">
          <div class="finance-savings-item-header">
            <span class="finance-savings-name">${escapeHtml(goal.name)}</span>
            <div class="finance-savings-actions">
              <button class="finance-savings-action-btn edit" data-id="${goal.id}" title="编辑">✏️</button>
              <button class="finance-savings-action-btn delete" data-id="${goal.id}" title="删除">🗑</button>
            </div>
          </div>
          <div class="finance-savings-progress-wrap">
            <div class="finance-savings-progress-bar-bg">
              <div class="finance-savings-progress-bar" style="width:${pct}%"></div>
            </div>
          </div>
          <div class="finance-savings-info">
            <span class="finance-savings-amount">${formatMoney(goal.current)} / ${formatMoney(goal.target)}</span>
            <span class="finance-savings-percent">${pctStr}%</span>
            ${goal.targetDate ? `<span class="finance-savings-date">目标: ${goal.targetDate}</span>` : ''}
            ${etaText ? `<span class="finance-savings-eta">${etaText}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ===== 账户渲染 =====
  function renderAccounts() {
    const container = document.getElementById('finance-accounts-list');
    const totalEl = document.getElementById('finance-accounts-total');
    if (!container || !totalEl) return;

    const total = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    totalEl.textContent = formatMoney(total);

    if (accounts.length === 0) {
      container.innerHTML = '<div class="finance-empty-hint">暂无账户，点击下方按钮添加</div>';
      return;
    }

    container.innerHTML = accounts.map(acc => {
      const typeInfo = ACCOUNT_TYPES[acc.type] || ACCOUNT_TYPES.other;
      return `
        <div class="finance-account-card" data-id="${acc.id}">
          <div class="finance-account-header">
            <div class="finance-account-icon-name">
              <span class="finance-account-icon">${typeInfo.icon}</span>
              <span class="finance-account-name">${escapeHtml(acc.name)}</span>
            </div>
            <span class="finance-account-type-label">${typeInfo.label}</span>
          </div>
          <div class="finance-account-balance">${formatMoney(acc.balance)}</div>
          <div class="finance-account-actions">
            <button class="finance-account-action-btn edit" data-id="${acc.id}" title="编辑">✏️</button>
            <button class="finance-account-action-btn delete" data-id="${acc.id}" title="删除">🗑</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function getFilteredRecords() {
    let records = allRecords;
    const month = filterMonth || currentMonthStr();
    records = records.filter(r => r.month === month);
    return records;
  }

  function renderTransactions() {
    const container = document.getElementById('finance-transaction-list');
    const records = getFilteredRecords();

    if (records.length === 0) {
      container.innerHTML = '<div class="finance-empty-hint">暂无交易记录</div>';
      return;
    }

    // 按日期分组
    const groups = {};
    for (const r of records) {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    }

    // 分页
    const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    const totalPages = Math.max(1, Math.ceil(dates.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * pageSize;
    const pageDates = dates.slice(startIdx, startIdx + pageSize);

    let html = '';
    for (const date of pageDates) {
      const dayRecords = groups[date];
      const dayIncome = dayRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      const dayExpense = dayRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

      let daySummary = '';
      if (dayIncome > 0) daySummary += ` 收入 ${formatMoney(dayIncome)}`;
      if (dayExpense > 0) daySummary += ` 支出 ${formatMoney(dayExpense)}`;

      html += `<div class="finance-transaction-date-group">`;
      html += `<div class="finance-transaction-date-label">${date}${daySummary}</div>`;

      for (const r of dayRecords) {
        const isIncome = r.type === 'income';
        const color = getCategoryColor(r.category);
        const sign = isIncome ? '+' : '-';
        html += `
          <div class="finance-transaction-item" data-id="${r.id}">
            <span class="finance-transaction-dot" style="background:${color}"></span>
            <div class="finance-transaction-info">
              <div class="finance-transaction-category">${escapeHtml(r.category)}</div>
              ${r.note ? `<div class="finance-transaction-note">${escapeHtml(r.note)}</div>` : ''}
            </div>
            <div class="finance-transaction-amount ${r.type}">${sign}${formatMoney(r.amount)}</div>
            <div class="finance-transaction-actions">
              <button class="finance-transaction-action-btn edit" data-id="${r.id}" title="编辑">✏️</button>
              <button class="finance-transaction-action-btn delete" data-id="${r.id}" title="删除">🗑</button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    // 分页控制
    html += `
      <div class="finance-pagination">
        <button class="finance-page-btn" id="finance-prev-page" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
        <span class="finance-page-info">${currentPage} / ${totalPages}</span>
        <button class="finance-page-btn" id="finance-next-page" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
      </div>
    `;

    container.innerHTML = html;
  }

  function renderCategoryTags(selected) {
    const container = document.getElementById('finance-category-tags');
    container.innerHTML = expenseCategories.map(cat => `
      <button class="finance-tag ${selected === cat ? 'selected' : ''}" data-category="${escapeHtml(cat)}">
        <span class="finance-tag-dot" style="background:${getCategoryColor(cat)}"></span>
        ${escapeHtml(cat)}
      </button>
    `).join('');
  }

  function renderSourceTags(selected) {
    const container = document.getElementById('finance-source-tags');
    container.innerHTML = incomeSources.map(src => `
      <button class="finance-tag ${selected === src ? 'selected' : ''}" data-source="${escapeHtml(src)}">
        <span class="finance-tag-dot" style="background:${getCategoryColor(src)}"></span>
        ${escapeHtml(src)}
      </button>
    `).join('');
  }

  // ===== 弹窗控制 =====
  let selectedCategory = '';
  let selectedSource = '';
  let currentType = 'expense';
  let pendingRecord = null;

  function openModal(record) {
    editingId = record ? record.id : null;
    currentType = record ? record.type : 'expense';
    selectedCategory = record ? record.category : '';
    selectedSource = record ? record.source || '' : '';

    document.getElementById('finance-modal-title').textContent = editingId ? '编辑交易' : '添加交易';
    document.getElementById('finance-amount').value = record ? record.amount : '';
    document.getElementById('finance-note').value = record ? (record.note || '') : '';
    document.getElementById('finance-date').value = record ? record.date : todayStr();

    updateTypeUI();

    document.getElementById('finance-modal-overlay').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('finance-modal-overlay').style.display = 'none';
    editingId = null;
    pendingRecord = null;
  }

  function updateTypeUI() {
    const expenseBtn = document.getElementById('finance-type-expense');
    const incomeBtn = document.getElementById('finance-type-income');
    const catGroup = document.getElementById('finance-category-group');
    const srcGroup = document.getElementById('finance-source-group');

    expenseBtn.classList.toggle('active', currentType === 'expense');
    incomeBtn.classList.toggle('active', currentType === 'income');
    catGroup.style.display = currentType === 'expense' ? 'block' : 'none';
    srcGroup.style.display = currentType === 'income' ? 'block' : 'none';

    if (currentType === 'expense') {
      renderCategoryTags(selectedCategory);
    } else {
      renderSourceTags(selectedSource);
    }
  }

  // ===== 重复检测 =====
  function checkDuplicate(record) {
    return allRecords.some(r =>
      r.id !== editingId &&
      r.type === record.type &&
      r.amount === record.amount &&
      r.date === record.date &&
      r.category === record.category
    );
  }

  function showDuplicateConfirm() {
    document.getElementById('finance-duplicate-overlay').style.display = 'flex';
  }

  function hideDuplicateConfirm() {
    document.getElementById('finance-duplicate-overlay').style.display = 'none';
  }

  // ===== 保存记录 =====
  async function saveRecord(record) {
    if (editingId) {
      record.id = editingId;
      await Storage.put('finance', record);
      showToast('记录已更新');
    } else {
      await Storage.add('finance', record);
      // EventBus: 财务记录新增
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('finance:added', { record });
      }
      showToast('记录已添加');
    }
    await loadData();
    renderAll();
  }

  async function deleteRecord(id) {
    await Storage.remove('finance', id);
    showToast('记录已删除');
    await loadData();
    renderAll();
  }

  // ===== 预算智能推荐 =====
  function calcSmartRecommendation() {
    const months = getLast6Months().slice(-3); // 近3个月
    let totalExpense = 0;
    let count = 0;
    for (const m of months) {
      for (const r of allRecords) {
        if (r.type === 'expense' && r.month === m) {
          totalExpense += r.amount;
          count++;
        }
      }
    }
    if (count === 0) return { monthly: 0, yearly: 0 };
    const monthCount = months.length;
    const avgMonthly = totalExpense / monthCount;
    // 月度推荐：平均支出上浮10%
    const monthlyRecommend = Math.ceil(avgMonthly * 1.1 / 100) * 100;
    const yearlyRecommend = monthlyRecommend * 12;
    return { monthly: monthlyRecommend, yearly: yearlyRecommend, avgMonthly };
  }

  function showSmartRecommendation() {
    const rec = calcSmartRecommendation();
    if (rec.monthly === 0) {
      showToast('近3个月无支出数据，无法推荐');
      return;
    }

    const monthlyHint = document.getElementById('finance-monthly-recommend-hint');
    const yearlyHint = document.getElementById('finance-yearly-recommend-hint');

    monthlyHint.textContent = `推荐 ¥${rec.monthly.toLocaleString()}`;
    monthlyHint.title = '点击采纳';
    monthlyHint.style.display = 'inline-block';
    monthlyHint.onclick = () => {
      document.getElementById('finance-monthly-budget').value = rec.monthly;
      monthlyHint.style.display = 'none';
    };

    yearlyHint.textContent = `推荐 ¥${rec.yearly.toLocaleString()}`;
    yearlyHint.title = '点击采纳';
    yearlyHint.style.display = 'inline-block';
    yearlyHint.onclick = () => {
      document.getElementById('finance-yearly-budget').value = rec.yearly;
      yearlyHint.style.display = 'none';
    };

    showToast(`近3月均支 ¥${rec.avgMonthly.toFixed(0)}，推荐月度 ¥${rec.monthly.toLocaleString()}`);
  }

  // ===== 储蓄目标弹窗 =====
  function openSavingsModal(goal) {
    editingSavingsId = goal ? goal.id : null;
    document.getElementById('finance-savings-modal-title').textContent = goal ? '编辑储蓄目标' : '添加储蓄目标';
    document.getElementById('finance-savings-name').value = goal ? goal.name : '';
    document.getElementById('finance-savings-target').value = goal ? goal.target : '';
    document.getElementById('finance-savings-date').value = goal ? (goal.targetDate || '') : '';
    document.getElementById('finance-savings-current').value = goal ? goal.current : 0;
    document.getElementById('finance-savings-modal-overlay').style.display = 'flex';
  }

  function closeSavingsModal() {
    document.getElementById('finance-savings-modal-overlay').style.display = 'none';
    editingSavingsId = null;
  }

  async function saveSavingsGoal() {
    const name = document.getElementById('finance-savings-name').value.trim();
    const target = parseFloat(document.getElementById('finance-savings-target').value) || 0;
    const targetDate = document.getElementById('finance-savings-date').value || '';
    const current = parseFloat(document.getElementById('finance-savings-current').value) || 0;

    if (!name) { showToast('请输入目标名称'); return; }
    if (target <= 0) { showToast('请输入有效的目标金额'); return; }

    if (editingSavingsId) {
      const idx = savingsGoals.findIndex(g => g.id === editingSavingsId);
      if (idx >= 0) {
        savingsGoals[idx] = { ...savingsGoals[idx], name, target, targetDate, current };
      }
    } else {
      savingsGoals.push({ id: generateId(), name, target, targetDate, current });
    }

    await saveSavingsGoals();
    closeSavingsModal();
    renderSavingsGoals();
    showToast(editingSavingsId ? '储蓄目标已更新' : '储蓄目标已添加');
  }

  async function deleteSavingsGoal(id) {
    savingsGoals = savingsGoals.filter(g => g.id !== id);
    await saveSavingsGoals();
    renderSavingsGoals();
    showToast('储蓄目标已删除');
  }

  // ===== 账户弹窗 =====
  function openAccountsModal(account) {
    editingAccountId = account ? account.id : null;
    selectedAccountType = account ? account.type : 'bank';
    document.getElementById('finance-accounts-modal-title').textContent = account ? '编辑账户' : '添加账户';
    document.getElementById('finance-account-name').value = account ? account.name : '';
    document.getElementById('finance-account-balance').value = account ? account.balance : '';

    // 更新类型标签选中状态
    const typeTags = document.querySelectorAll('#finance-account-type-tags .finance-tag');
    typeTags.forEach(tag => {
      tag.classList.toggle('selected', tag.dataset.type === selectedAccountType);
    });

    document.getElementById('finance-accounts-modal-overlay').style.display = 'flex';
  }

  function closeAccountsModal() {
    document.getElementById('finance-accounts-modal-overlay').style.display = 'none';
    editingAccountId = null;
  }

  async function saveAccount() {
    const name = document.getElementById('finance-account-name').value.trim();
    const balance = parseFloat(document.getElementById('finance-account-balance').value) || 0;

    if (!name) { showToast('请输入账户名称'); return; }

    if (editingAccountId) {
      const idx = accounts.findIndex(a => a.id === editingAccountId);
      if (idx >= 0) {
        accounts[idx] = { ...accounts[idx], name, type: selectedAccountType, balance };
      }
    } else {
      accounts.push({ id: generateId(), name, type: selectedAccountType, balance });
    }

    await saveAccounts();
    closeAccountsModal();
    renderAccounts();
    showToast(editingAccountId ? '账户已更新' : '账户已添加');
  }

  async function deleteAccount(id) {
    accounts = accounts.filter(a => a.id !== id);
    await saveAccounts();
    renderAccounts();
    showToast('账户已删除');
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // FAB
    _bindEvent(document.getElementById('finance-fab'), 'click', () => openModal(null));

    // 预算面板
    _bindEvent(document.getElementById('finance-budget-toggle'), 'click', () => {
      const panel = document.getElementById('finance-budget-panel');
      const btn = document.getElementById('finance-budget-toggle');
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'block';
      btn.classList.toggle('active', !isVisible);
    });

    // 保存预算
    _bindEvent(document.getElementById('finance-budget-save'), 'click', async () => {
      const monthly = parseFloat(document.getElementById('finance-monthly-budget').value) || 0;
      const yearly = parseFloat(document.getElementById('finance-yearly-budget').value) || 0;
      budgetData = { monthly, yearly };
      await Storage.put('settings', { key: 'finance_budget', value: budgetData });
      showToast('预算已保存');
      // 隐藏推荐提示
      document.getElementById('finance-monthly-recommend-hint').style.display = 'none';
      document.getElementById('finance-yearly-recommend-hint').style.display = 'none';
      renderStats();
    });

    // 智能推荐
    _bindEvent(document.getElementById('finance-budget-smart'), 'click', showSmartRecommendation);

    // 月份筛选
    const monthPicker = document.getElementById('finance-month-picker');
    monthPicker.value = currentMonthStr();
    _bindEvent(monthPicker, 'change', () => {
      filterMonth = monthPicker.value;
      currentPage = 1;
      renderTransactions();
    });

    _bindEvent(document.getElementById('finance-filter-reset'), 'click', () => {
      filterMonth = '';
      monthPicker.value = currentMonthStr();
      currentPage = 1;
      renderTransactions();
    });

    // 弹窗关闭
    _bindEvent(document.getElementById('finance-modal-close'), 'click', closeModal);
    _bindEvent(document.getElementById('finance-modal-cancel'), 'click', closeModal);
    _bindEvent(document.getElementById('finance-modal-overlay'), 'click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // 类型切换
    _bindEvent(document.getElementById('finance-type-expense'), 'click', () => {
      currentType = 'expense';
      selectedCategory = '';
      selectedSource = '';
      updateTypeUI();
    });
    _bindEvent(document.getElementById('finance-type-income'), 'click', () => {
      currentType = 'income';
      selectedCategory = '';
      selectedSource = '';
      updateTypeUI();
    });

    // 分类标签点击
    _bindEvent(document.getElementById('finance-category-tags'), 'click', (e) => {
      const tag = e.target.closest('.finance-tag');
      if (!tag) return;
      selectedCategory = tag.dataset.category || '';
      renderCategoryTags(selectedCategory);
    });

    // 来源标签点击
    _bindEvent(document.getElementById('finance-source-tags'), 'click', (e) => {
      const tag = e.target.closest('.finance-tag');
      if (!tag) return;
      selectedSource = tag.dataset.source || '';
      renderSourceTags(selectedSource);
    });

    // 添加自定义分类
    _bindEvent(document.getElementById('finance-add-category-btn'), 'click', async () => {
      const input = document.getElementById('finance-custom-category');
      const name = input.value.trim();
      if (!name) return;
      if (!expenseCategories.includes(name)) {
        expenseCategories.push(name);
        await saveCategories();
        selectedCategory = name;
        renderCategoryTags(selectedCategory);
      }
      input.value = '';
    });

    // 添加自定义来源
    _bindEvent(document.getElementById('finance-add-source-btn'), 'click', async () => {
      const input = document.getElementById('finance-custom-source');
      const name = input.value.trim();
      if (!name) return;
      if (!incomeSources.includes(name)) {
        incomeSources.push(name);
        await saveCategories();
        selectedSource = name;
        renderSourceTags(selectedSource);
      }
      input.value = '';
    });

    // 确认添加
    _bindEvent(document.getElementById('finance-modal-confirm'), 'click', () => {
      const amount = parseFloat(document.getElementById('finance-amount').value);
      if (!amount || amount <= 0) {
        showToast('请输入有效金额');
        return;
      }

      const date = document.getElementById('finance-date').value || todayStr();
      const note = document.getElementById('finance-note').value.trim();
      const month = date.substring(0, 7);

      const record = {
        type: currentType,
        amount,
        category: currentType === 'expense' ? selectedCategory : selectedSource,
        source: currentType === 'income' ? selectedSource : '',
        note,
        date,
        month
      };

      if (!record.category) {
        showToast(currentType === 'expense' ? '请选择分类' : '请选择来源');
        return;
      }

      if (!editingId && checkDuplicate(record)) {
        pendingRecord = record;
        showDuplicateConfirm();
        return;
      }

      saveRecord(record);
      closeModal();
    });

    // 重复确认
    _bindEvent(document.getElementById('finance-duplicate-cancel'), 'click', () => {
      hideDuplicateConfirm();
      pendingRecord = null;
    });

    _bindEvent(document.getElementById('finance-duplicate-confirm'), 'click', () => {
      hideDuplicateConfirm();
      if (pendingRecord) {
        saveRecord(pendingRecord);
        pendingRecord = null;
        closeModal();
      }
    });

    _bindEvent(document.getElementById('finance-duplicate-overlay'), 'click', (e) => {
      if (e.target === e.currentTarget) {
        hideDuplicateConfirm();
        pendingRecord = null;
      }
    });

    // 交易列表 - 编辑/删除 (事件委托)
    _bindEvent(document.getElementById('finance-transaction-list'), 'click', (e) => {
      const editBtn = e.target.closest('.edit');
      const deleteBtn = e.target.closest('.delete');

      if (editBtn) {
        const id = parseInt(editBtn.dataset.id);
        const record = allRecords.find(r => r.id === id);
        if (record) openModal(record);
      }

      if (deleteBtn) {
        const id = parseInt(deleteBtn.dataset.id);
        if (confirm('确定要删除这条记录吗？')) {
          deleteRecord(id);
        }
      }

      // 分页
      if (e.target.id === 'finance-prev-page' && currentPage > 1) {
        currentPage--;
        renderTransactions();
      }
      if (e.target.id === 'finance-next-page') {
        currentPage++;
        renderTransactions();
      }
    });

    // ===== 增强功能事件 =====

    // Tab切换
    _bindEvent(document.getElementById('finance-enhance-tabs'), 'click', (e) => {
      const tab = e.target.closest('.finance-enhance-tab');
      if (!tab) return;
      const targetTab = tab.dataset.tab;

      // 更新tab选中
      document.querySelectorAll('.finance-enhance-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 切换面板
      document.querySelectorAll('.finance-enhance-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('finance-tab-' + targetTab);
      if (panel) panel.classList.add('active');

      // 年度趋势tab激活时重绘canvas
      if (targetTab === 'yearly-trend') {
        setTimeout(() => renderYearlyTrend(), 50);
      }
    });

    // 年度趋势Canvas hover
    const canvas = document.getElementById('finance-yearly-chart');
    _chartHoverHandler = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (!canvas._chartPoints || !canvas._chartPoints.income) return;

      const tooltip = document.getElementById('finance-chart-tooltip');
      const padLeft = canvas._padLeft;
      const chartW = canvas._chartW;
      const xStep = chartW / 11;

      // 找到最近的月份
      let closestIdx = -1;
      let minDist = Infinity;
      for (let i = 0; i < 12; i++) {
        const px = canvas._chartPoints.income[i].x;
        const dist = Math.abs(x - px);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      if (closestIdx >= 0 && minDist < xStep * 0.6) {
        const p = canvas._chartPoints.income[closestIdx];
        tooltip.innerHTML = `<strong>${p.month}</strong><br>收入: ${formatMoney(p.income)}<br>支出: ${formatMoney(p.expense)}`;
        tooltip.style.display = 'block';
        tooltip.style.left = (p.x - tooltip.offsetWidth / 2) + 'px';
        tooltip.style.top = (p.y - tooltip.offsetHeight - 10) + 'px';
      } else {
        tooltip.style.display = 'none';
      }
    };

    _bindEvent(canvas, 'mousemove', _chartHoverHandler);
    _bindEvent(canvas, 'mouseleave', () => {
      const tooltip = document.getElementById('finance-chart-tooltip');
      if (tooltip) tooltip.style.display = 'none';
    });
    // 移动端点击
    _bindEvent(canvas, 'click', _chartHoverHandler);

    // 储蓄目标
    _bindEvent(document.getElementById('finance-savings-add'), 'click', () => openSavingsModal(null));

    _bindEvent(document.getElementById('finance-savings-modal-close'), 'click', closeSavingsModal);
    _bindEvent(document.getElementById('finance-savings-modal-cancel'), 'click', closeSavingsModal);
    _bindEvent(document.getElementById('finance-savings-modal-overlay'), 'click', (e) => {
      if (e.target === e.currentTarget) closeSavingsModal();
    });
    _bindEvent(document.getElementById('finance-savings-modal-confirm'), 'click', saveSavingsGoal);

    // 储蓄目标列表事件委托
    _bindEvent(document.getElementById('finance-savings-list'), 'click', (e) => {
      const editBtn = e.target.closest('.finance-savings-action-btn.edit');
      const deleteBtn = e.target.closest('.finance-savings-action-btn.delete');

      if (editBtn) {
        const id = parseInt(editBtn.dataset.id);
        const goal = savingsGoals.find(g => g.id === id);
        if (goal) openSavingsModal(goal);
      }
      if (deleteBtn) {
        const id = parseInt(deleteBtn.dataset.id);
        if (confirm('确定要删除此储蓄目标吗？')) {
          deleteSavingsGoal(id);
        }
      }
    });

    // 账户
    _bindEvent(document.getElementById('finance-accounts-add'), 'click', () => openAccountsModal(null));

    _bindEvent(document.getElementById('finance-accounts-modal-close'), 'click', closeAccountsModal);
    _bindEvent(document.getElementById('finance-accounts-modal-cancel'), 'click', closeAccountsModal);
    _bindEvent(document.getElementById('finance-accounts-modal-overlay'), 'click', (e) => {
      if (e.target === e.currentTarget) closeAccountsModal();
    });
    _bindEvent(document.getElementById('finance-accounts-modal-confirm'), 'click', saveAccount);

    // 账户类型标签
    _bindEvent(document.getElementById('finance-account-type-tags'), 'click', (e) => {
      const tag = e.target.closest('.finance-tag');
      if (!tag) return;
      selectedAccountType = tag.dataset.type || 'bank';
      document.querySelectorAll('#finance-account-type-tags .finance-tag').forEach(t => {
        t.classList.toggle('selected', t.dataset.type === selectedAccountType);
      });
    });

    // 账户列表事件委托
    _bindEvent(document.getElementById('finance-accounts-list'), 'click', (e) => {
      const editBtn = e.target.closest('.finance-account-action-btn.edit');
      const deleteBtn = e.target.closest('.finance-account-action-btn.delete');

      if (editBtn) {
        const id = parseInt(editBtn.dataset.id);
        const account = accounts.find(a => a.id === id);
        if (account) openAccountsModal(account);
      }
      if (deleteBtn) {
        const id = parseInt(deleteBtn.dataset.id);
        if (confirm('确定要删除此账户吗？')) {
          deleteAccount(id);
        }
      }
    });

    // 窗口resize重绘canvas
    _bindEvent(window, 'resize', () => {
      const activePanel = document.getElementById('finance-tab-yearly-trend');
      if (activePanel && activePanel.classList.contains('active')) {
        renderYearlyTrend();
      }
    });
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
    _chartHoverHandler = null;
    console.log('[FinanceModule] 模块已销毁');
  }

  // ===== 导出 =====
  return { init, destroy };
})();
