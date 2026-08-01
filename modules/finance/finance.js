/**
 * finance.js - 财务与资产模块逻辑
 * 人生工作台 · 收入支出记账 / 预算管理 / 统计分析
 */

const FinanceModule = (() => {
  // ===== 状态 =====
  let allRecords = [];          // 所有交易记录
  let budgetData = null;        // 预算设置 { monthly, yearly }
  let expenseCategories = [];   // 支出分类
  let incomeSources = [];       // 收入来源
  let filterMonth = '';         // 筛选月份 '' = 当前月
  let editingId = null;         // 编辑中的记录ID
  let currentPage = 1;
  const pageSize = 20;

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

  // ===== 工具函数 =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

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
    // 基于名称hash生成稳定颜色
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

  // ===== 初始化 =====
  async function init() {
    console.log('[Finance] 财务模块初始化...');
    await loadCategories();
    await loadData();
    await loadBudget();
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

  // ===== 渲染 =====
  function renderAll() {
    renderStats();
    renderBudgetPanel();
    renderCategoryAnalysis();
    renderTrend();
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
      const label = item.month.substring(5); // MM
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

    // 切换类型UI
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

  // ===== 事件绑定 =====
  function bindEvents() {
    // FAB
    document.getElementById('finance-fab').addEventListener('click', () => openModal(null));

    // 预算面板
    document.getElementById('finance-budget-toggle').addEventListener('click', () => {
      const panel = document.getElementById('finance-budget-panel');
      const btn = document.getElementById('finance-budget-toggle');
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'block';
      btn.classList.toggle('active', !isVisible);
    });

    // 保存预算
    document.getElementById('finance-budget-save').addEventListener('click', async () => {
      const monthly = parseFloat(document.getElementById('finance-monthly-budget').value) || 0;
      const yearly = parseFloat(document.getElementById('finance-yearly-budget').value) || 0;
      budgetData = { monthly, yearly };
      await Storage.put('settings', { key: 'finance_budget', value: budgetData });
      showToast('预算已保存');
      renderStats();
    });

    // 月份筛选
    const monthPicker = document.getElementById('finance-month-picker');
    monthPicker.value = currentMonthStr();
    monthPicker.addEventListener('change', () => {
      filterMonth = monthPicker.value;
      currentPage = 1;
      renderTransactions();
    });

    document.getElementById('finance-filter-reset').addEventListener('click', () => {
      filterMonth = '';
      monthPicker.value = currentMonthStr();
      currentPage = 1;
      renderTransactions();
    });

    // 弹窗关闭
    document.getElementById('finance-modal-close').addEventListener('click', closeModal);
    document.getElementById('finance-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('finance-modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // 类型切换
    document.getElementById('finance-type-expense').addEventListener('click', () => {
      currentType = 'expense';
      selectedCategory = '';
      selectedSource = '';
      updateTypeUI();
    });
    document.getElementById('finance-type-income').addEventListener('click', () => {
      currentType = 'income';
      selectedCategory = '';
      selectedSource = '';
      updateTypeUI();
    });

    // 分类标签点击
    document.getElementById('finance-category-tags').addEventListener('click', (e) => {
      const tag = e.target.closest('.finance-tag');
      if (!tag) return;
      selectedCategory = tag.dataset.category || '';
      renderCategoryTags(selectedCategory);
    });

    // 来源标签点击
    document.getElementById('finance-source-tags').addEventListener('click', (e) => {
      const tag = e.target.closest('.finance-tag');
      if (!tag) return;
      selectedSource = tag.dataset.source || '';
      renderSourceTags(selectedSource);
    });

    // 添加自定义分类
    document.getElementById('finance-add-category-btn').addEventListener('click', async () => {
      const input = document.getElementById('finance-custom-category');
      const name = input.value.trim();
      if (!name) return;
      if (!expenseCategories.includes(name)) {
        expenseCategories.push(name);
        await saveCategories();
        renderCategoryTags(name);
        selectedCategory = name;
        renderCategoryTags(selectedCategory);
      }
      input.value = '';
    });

    // 添加自定义来源
    document.getElementById('finance-add-source-btn').addEventListener('click', async () => {
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
    document.getElementById('finance-modal-confirm').addEventListener('click', () => {
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

      // 重复检测（仅新增时）
      if (!editingId && checkDuplicate(record)) {
        pendingRecord = record;
        showDuplicateConfirm();
        return;
      }

      // 保存
      saveRecord(record);
      closeModal();
    });

    // 重复确认
    document.getElementById('finance-duplicate-cancel').addEventListener('click', () => {
      hideDuplicateConfirm();
      pendingRecord = null;
    });

    document.getElementById('finance-duplicate-confirm').addEventListener('click', () => {
      hideDuplicateConfirm();
      if (pendingRecord) {
        saveRecord(pendingRecord);
        pendingRecord = null;
        closeModal();
      }
    });

    document.getElementById('finance-duplicate-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        hideDuplicateConfirm();
        pendingRecord = null;
      }
    });

    // 交易列表 - 编辑/删除 (事件委托)
    document.getElementById('finance-transaction-list').addEventListener('click', (e) => {
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
    });

    // 分页
    document.getElementById('finance-transaction-list').addEventListener('click', (e) => {
      if (e.target.id === 'finance-prev-page' && currentPage > 1) {
        currentPage--;
        renderTransactions();
      }
      if (e.target.id === 'finance-next-page') {
        currentPage++;
        renderTransactions();
      }
    });
  }

  // ===== 导出 =====
  return { init };
})();
