/**
 * travel.js - 旅行计划模块逻辑
 * 人生工作台 · 目的地管理 · 旅行基金 · 证件清单 · 费用拆解 · 时间线倒计时
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';

export const TravelModule = (() => {
  const { escapeHtml } = AppUtils;

  // ===== 常量 =====
  const STAGE_CONFIG = {
    want: { label: '想去', badge: 'stage-want', order: 0 },
    prep: { label: '准备中', badge: 'stage-prep', order: 1 },
    done: { label: '已去', badge: 'stage-done', order: 2 },
  };

  const STAGE_ORDER = ['want', 'prep', 'done'];

  const DEFAULT_CHECKLIST = [
    { label: '护照', checked: false },
    { label: '签证', checked: false },
    { label: '机票', checked: false },
    { label: '酒店', checked: false },
    { label: '保险', checked: false },
    { label: '行程单', checked: false },
  ];

  const COST_COLORS = ['#8BB8D4', '#7EBF8E', '#B8A0D4', '#E8A87C', '#E08B8B'];

  // ===== 状态 =====
  let allDestinations = [];
  let expandedId = null;
  let depositTargetId = null;
  let _countdownTimer = null;

  // ===== 工具函数 =====
  function formatMoney(n) {
    return '¥' + (n || 0).toLocaleString('zh-CN');
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '日期待定';
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }

  function showToast(msg) {
    if (window.App?.showToast) {
      window.App.showToast(msg);
    } else {
      console.log('[Travel Toast]', msg);
    }
  }

  function genId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  // ===== 数据加载 =====
  async function loadData() {
    try {
      allDestinations = await Storage.getAll('travel');
    } catch (e) {
      console.warn('[Travel] 读取travel表失败:', e);
      allDestinations = [];
    }

    // 按阶段排序：want → prep → done
    allDestinations.sort((a, b) => {
      const oa = STAGE_CONFIG[a.stage]?.order ?? 0;
      const ob = STAGE_CONFIG[b.stage]?.order ?? 0;
      if (oa !== ob) return oa - ob;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  // ===== 总览渲染 =====
  function renderOverview() {
    const totalSaved = allDestinations.reduce((s, d) => s + (d.fund?.saved || 0), 0);
    const totalTarget = allDestinations.reduce((s, d) => s + (d.fund?.target || 0), 0);
    const pct = totalTarget > 0 ? (totalSaved / totalTarget * 100).toFixed(1) : '0';

    const savedEl = document.getElementById('travelTotalSaved');
    if (savedEl) savedEl.textContent = formatMoney(totalSaved);
    const targetEl = document.getElementById('travelTotalTarget');
    if (targetEl) targetEl.textContent = `/ ${formatMoney(totalTarget)} 目标`;
    const barEl = document.getElementById('travelFundBar');
    if (barEl) barEl.style.width = pct + '%';
    const pctEl = document.getElementById('travelFundPercent');
    if (pctEl) pctEl.textContent = pct + '%';
    const remainEl = document.getElementById('travelFundRemain');
    if (remainEl) remainEl.textContent = `剩余 ${formatMoney(totalTarget - totalSaved)}`;

    // 统计卡片
    const destCount = allDestinations.length;
    const prepCount = allDestinations.filter(d => d.stage === 'prep').length;
    const doneCount = allDestinations.filter(d => d.stage === 'done').length;

    const dcEl = document.getElementById('travelDestCount');
    if (dcEl) dcEl.textContent = destCount;
    const pcEl = document.getElementById('travelPrepCount');
    if (pcEl) pcEl.textContent = prepCount;
    const dnEl = document.getElementById('travelDoneCount');
    if (dnEl) dnEl.textContent = doneCount;

    // 倒计时：找最近的有出发日期且未出发的目的地
    renderCountdown();
  }

  function renderCountdown() {
    const card = document.getElementById('travelCountdownCard');
    if (!card) return;

    const upcoming = allDestinations
      .filter(d => d.departure && d.stage !== 'done')
      .map(d => ({ ...d, days: daysUntil(d.departure) }))
      .filter(d => d.days !== null)
      .sort((a, b) => a.days - b.days);

    if (upcoming.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    const next = upcoming[0];
    const flagEl = document.getElementById('travelCountdownFlag');
    if (flagEl) flagEl.textContent = next.flag || '✈️';
    const nameEl = document.getElementById('travelCountdownName');
    if (nameEl) nameEl.textContent = next.name;
    const numEl = document.getElementById('travelCountdownNum');
    if (numEl) numEl.textContent = next.days;
  }

  // ===== 目的地卡片渲染 =====
  function renderDestinations() {
    const container = document.getElementById('travelDestinations');
    const emptyEl = document.getElementById('travelEmpty');
    if (!container) return;

    if (allDestinations.length === 0) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    container.innerHTML = allDestinations.map((d, idx) => {
      const isExpanded = expandedId === d.id;
      const fundPct = d.fund && d.fund.target > 0
        ? (d.fund.saved / d.fund.target * 100).toFixed(1)
        : '0';
      const fundRemain = (d.fund?.target || 0) - (d.fund?.saved || 0);
      const days = daysUntil(d.departure);
      const stageCfg = STAGE_CONFIG[d.stage] || STAGE_CONFIG.want;

      const stages = STAGE_ORDER.map((key, i) => {
        const cfg = STAGE_CONFIG[key];
        const currentOrder = STAGE_CONFIG[d.stage]?.order ?? 0;
        let cls = '';
        if (i < currentOrder) cls = 'done';
        else if (i === currentOrder) cls = 'active';
        return { key, label: cfg.label, cls };
      });
      const lineFill = stageCfg.order === 0 ? 0 : stageCfg.order === 1 ? 50 : 100;

      // 费用
      const costs = d.costs || [];
      const totalCost = costs.reduce((s, c) => s + (c.amount || 0), 0);
      const maxCost = costs.length > 0 ? Math.max(...costs.map(c => c.amount || 0)) : 0;

      // 证件清单
      const checklist = d.checklist || [];

      // 时间线
      const timeline = buildTimeline(d, days);

      return `
      <div class="travel-dest-card ${isExpanded ? 'expanded' : ''}" data-id="${d.id}" data-idx="${idx}">
        <div class="travel-dest-header" data-action="toggle" data-id="${d.id}">
          <div class="travel-dest-flag">${d.flag || '🌍'}</div>
          <div class="travel-dest-info">
            <div class="travel-dest-name">${escapeHtml(d.name || '未命名')}</div>
            <div class="travel-dest-meta">
              ${d.subtitle ? `<span>${escapeHtml(d.subtitle)}</span><span class="dot"></span>` : ''}
              <span>${d.departure ? days + '天后出发' : '日期待定'}</span>
            </div>
          </div>
          <div class="travel-stage-badge ${stageCfg.badge}" data-action="cycle-stage" data-id="${d.id}">${stageCfg.label}</div>
          <button class="travel-dest-delete" data-action="delete-dest" data-id="${d.id}" title="删除目的地">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
          <svg class="travel-dest-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="travel-dest-body">
          <div class="travel-dest-body-inner">

            <!-- ① 阶段状态 -->
            <div class="travel-sub-section">
              <div class="travel-sub-title"><span class="num">1</span>阶段状态</div>
              <div class="travel-stage-track">
                <div class="travel-stage-line"><div class="travel-stage-line-fill" style="width:${lineFill}%"></div></div>
                ${stages.map(s => `
                  <div class="travel-stage-step ${s.cls}" data-action="set-stage" data-id="${d.id}" data-stage="${s.key}">
                    <div class="travel-stage-circle">${s.cls === 'done' ? '✓' : (STAGE_ORDER.indexOf(s.key) + 1)}</div>
                    <div class="travel-stage-label">${s.label}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- ② 旅行基金 -->
            <div class="travel-sub-section">
              <div class="travel-sub-title"><span class="num">2</span>旅行基金</div>
              <div class="travel-fund-row">
                <div class="travel-fund-mini-card">
                  <div class="travel-fund-mini-label">目标</div>
                  <div class="travel-fund-mini-value">${formatMoney(d.fund?.target || 0)}</div>
                </div>
                <div class="travel-fund-mini-card">
                  <div class="travel-fund-mini-label">已存</div>
                  <div class="travel-fund-mini-value green">${formatMoney(d.fund?.saved || 0)}</div>
                </div>
                <div class="travel-fund-mini-card">
                  <div class="travel-fund-mini-label">剩余</div>
                  <div class="travel-fund-mini-value orange">${formatMoney(fundRemain)}</div>
                </div>
              </div>
              <div class="travel-mini-progress">
                <div class="travel-mini-progress-fill" style="width:${fundPct}%; background: linear-gradient(90deg, var(--accent), var(--accent-green));"></div>
              </div>
              <button class="travel-deposit-btn" data-action="deposit" data-id="${d.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                存入旅行基金
              </button>
            </div>

            <!-- ③ 证件清单 -->
            <div class="travel-sub-section">
              <div class="travel-sub-title"><span class="num">3</span>证件 / 资料清单</div>
              <div class="travel-checklist">
                ${checklist.map((item, ci) => `
                  <div class="travel-check-item ${item.checked ? 'checked' : ''} ${item.extra ? 'extra' : ''}" data-action="toggle-check" data-id="${d.id}" data-ci="${ci}">
                    <div class="travel-check-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <div class="travel-check-label">${escapeHtml(item.label)}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- ④ 费用拆解 -->
            <div class="travel-sub-section">
              <div class="travel-sub-title"><span class="num">4</span>费用拆解</div>
              <div class="travel-cost-list">
                ${costs.map((c, ci) => {
                  const color = c.color || COST_COLORS[ci % COST_COLORS.length];
                  const w = maxCost > 0 ? (c.amount / maxCost * 100) : 0;
                  return `
                  <div class="travel-cost-item">
                    <div class="travel-cost-cat">${escapeHtml(c.cat)}</div>
                    <div class="travel-cost-bar-wrap">
                      <div class="travel-cost-bar-fill" style="width:${w}%; background:${color};">
                        <span class="travel-cost-bar-text">${formatMoney(c.amount)}</span>
                      </div>
                    </div>
                    <div class="travel-cost-amount">${formatMoney(c.amount)}</div>
                  </div>
                  `;
                }).join('')}
              </div>
              <div class="travel-cost-total">
                <span class="travel-cost-total-label">总预算</span>
                <span class="travel-cost-total-value">${formatMoney(totalCost)}</span>
              </div>
            </div>

            <!-- ⑤ 时间线 -->
            <div class="travel-sub-section">
              <div class="travel-sub-title"><span class="num">5</span>时间线</div>
              ${days !== null ? `<div><span class="travel-tl-countdown">距出发还有 ${days} 天</span></div>` : ''}
              <div class="travel-timeline">
                ${timeline.map(tl => `
                  <div class="travel-tl-item">
                    <div class="travel-tl-dot ${tl.dot}"></div>
                    <div class="travel-tl-content">
                      <div class="travel-tl-date">${escapeHtml(tl.date)}</div>
                      <div class="travel-tl-text">${tl.text}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

          </div>
        </div>
      </div>
      `;
    }).join('');
  }

  // ===== 构建时间线 =====
  function buildTimeline(d, days) {
    if (!d.departure) {
      return [
        { date: '待定', text: '<strong>出发日期待定</strong> · 暂未确定行程', dot: 'gray' },
        { date: '出发前3个月', text: '办理签证', dot: 'gray' },
        { date: '出发前2个月', text: '预订机票与酒店', dot: 'gray' },
      ];
    }

    const dep = new Date(d.departure + 'T00:00:00');
    const m3 = new Date(dep); m3.setMonth(m3.getMonth() - 3);
    const m2 = new Date(dep); m2.setMonth(m2.getMonth() - 2);
    const m1 = new Date(dep); m1.setMonth(m1.getMonth() - 1);

    const fmt = (dt) => `${dt.getFullYear()}年${dt.getMonth() + 1}月`;

    return [
      { date: `${fmt(dep)}`, text: '<strong>预计出发</strong> · ' + escapeHtml(d.name), dot: 'solid' },
      { date: `${fmt(m3)}`, text: '出发前3个月 — 办理签证', dot: 'gray' },
      { date: `${fmt(m2)}`, text: '出发前2个月 — 预订机票', dot: 'gray' },
      { date: `${fmt(m1)}`, text: '出发前1个月 — 确认酒店与行程', dot: 'gray' },
    ];
  }

  // ===== 统一渲染 =====
  function renderAll() {
    renderOverview();
    renderDestinations();
  }

  // ===== 弹窗：添加/编辑 =====
  function openModal(dest) {
    const overlay = document.getElementById('travelModalOverlay');
    const title = document.getElementById('travelModalTitle');
    const form = document.getElementById('travelForm');
    const deleteBtn = document.getElementById('travelBtnDelete');

    form.reset();
    document.getElementById('travelEditId').value = '';

    if (dest) {
      title.textContent = '编辑目的地';
      deleteBtn.style.display = '';
      document.getElementById('travelEditId').value = dest.id;
      document.getElementById('travelName').value = dest.name || '';
      document.getElementById('travelFlag').value = dest.flag || '';
      document.getElementById('travelSubtitle').value = dest.subtitle || '';
      document.getElementById('travelStage').value = dest.stage || 'want';
      document.getElementById('travelDeparture').value = dest.departure || '';
      document.getElementById('travelFundTarget').value = dest.fund?.target || '';
      document.getElementById('travelFundSaved').value = dest.fund?.saved || '';
    } else {
      title.textContent = '添加目的地';
      deleteBtn.style.display = 'none';
      document.getElementById('travelStage').value = 'want';
    }

    overlay.style.display = '';
  }

  function closeModal() {
    document.getElementById('travelModalOverlay').style.display = 'none';
  }

  // ===== CRUD =====
  async function saveDest() {
    const editId = document.getElementById('travelEditId').value;
    const nameEl = document.getElementById('travelName');
    const name = nameEl.value.trim();

    if (!name) {
      nameEl.focus();
      showToast('请输入目的地名称');
      return;
    }

    const stage = document.getElementById('travelStage').value;
    const departure = document.getElementById('travelDeparture').value || null;
    const fundTarget = parseInt(document.getElementById('travelFundTarget').value) || 0;
    const fundSaved = parseInt(document.getElementById('travelFundSaved').value) || 0;
    const flag = document.getElementById('travelFlag').value.trim() || '🌍';
    const subtitle = document.getElementById('travelSubtitle').value.trim();

    const now = Date.now();
    const data = {
      name,
      flag,
      subtitle,
      stage,
      departure,
      fund: { target: fundTarget, saved: fundSaved },
      updatedAt: now,
    };

    if (editId) {
      const existing = allDestinations.find(d => d.id == editId);
      data.id = parseInt(editId);
      data.createdAt = existing?.createdAt || now;
      data.checklist = existing?.checklist || DEFAULT_CHECKLIST.map(c => ({ ...c }));
      data.costs = existing?.costs || [];
      try {
        await Storage.put('travel', data);
      } catch(e) {
        console.warn('[Travel] Storage.put 失败:', e);
      }
      showToast('目的地已更新');
    } else {
      data.id = genId();
      data.createdAt = now;
      data.checklist = DEFAULT_CHECKLIST.map(c => ({ ...c }));
      data.costs = [
        { cat: '机票', amount: 0 },
        { cat: '住宿', amount: 0 },
        { cat: '签证', amount: 0 },
        { cat: '保险', amount: 0 },
        { cat: '日常开销', amount: 0 },
      ];
      try {
        await Storage.put('travel', data);
      } catch(e) {
        console.warn('[Travel] Storage.put 失败:', e);
      }
      showToast('目的地已添加 🎉');
    }

    closeModal();
    await loadData();
    renderAll();
  }

  async function deleteDest(id) {
    if (!confirm('确定删除这个目的地？')) return;
    try {
      await Storage.remove('travel', id);
    } catch(e) {
      console.warn('[Travel] Storage.remove 失败:', e);
    }
    showToast('目的地已删除');
    closeModal();
    await loadData();
    renderAll();
  }

  // ===== 卡片内直接删除目的地 =====
  async function deleteDestination(destId) {
    if (!confirm('确定删除这个目的地？此操作不可撤销。')) return;
    try {
      // 从 IndexedDB 移除
      await Storage.remove('travel', destId);
    } catch (e) {
      console.error('[Travel] 删除目的地失败:', e);
      showToast('删除失败，请重试');
      return;
    }
    // 从内存数组中移除
    allDestinations = allDestinations.filter(d => d.id !== destId);
    // 如果当前展开的是被删除的卡片，重置展开状态
    if (expandedId === destId) expandedId = null;
    // 刷新列表 UI 和基金总览
    renderAll();
    showToast('目的地已删除 🗑️');
  }

  async function setStage(id, stage) {
    const dest = allDestinations.find(d => d.id == id);
    if (!dest) return;
    dest.stage = stage;
    dest.updatedAt = Date.now();
    try {
      await Storage.put('travel', dest);
    } catch(e) {
      console.warn('[Travel] Storage.put 失败:', e);
    }
    await loadData();
    renderAll();
    showToast(`📍 ${dest.name} → ${STAGE_CONFIG[stage].label}`);
  }

  async function cycleStage(id) {
    const dest = allDestinations.find(d => d.id == id);
    if (!dest) return;
    const currentOrder = STAGE_CONFIG[dest.stage]?.order ?? 0;
    const nextOrder = (currentOrder + 1) % STAGE_ORDER.length;
    const nextStage = STAGE_ORDER[nextOrder];
    await setStage(id, nextStage);
  }

  async function toggleCheck(id, ci) {
    const dest = allDestinations.find(d => d.id == id);
    if (!dest || !dest.checklist || !dest.checklist[ci]) return;
    dest.checklist[ci].checked = !dest.checklist[ci].checked;
    dest.updatedAt = Date.now();
    try {
      await Storage.put('travel', dest);
    } catch(e) {
      console.warn('[Travel] Storage.put 失败:', e);
    }
    // 局部更新：仅重渲染列表（保持展开状态）
    renderDestinations();
  }

  // ===== 存入基金 =====
  function openDeposit(id) {
    const dest = allDestinations.find(d => d.id == id);
    if (!dest) return;
    depositTargetId = id;
    const nameEl = document.getElementById('travelDepositTargetName');
    if (nameEl) nameEl.textContent = `存入「${dest.name}」旅行基金`;
    const input = document.getElementById('travelDepositInput');
    if (input) input.value = '';
    document.getElementById('travelDepositOverlay').style.display = '';
    setTimeout(() => input?.focus(), 100);
  }

  function closeDeposit() {
    document.getElementById('travelDepositOverlay').style.display = 'none';
    depositTargetId = null;
  }

  async function confirmDeposit() {
    if (!depositTargetId) return;
    const input = document.getElementById('travelDepositInput');
    const amount = parseInt(input?.value);
    if (!amount || amount <= 0) {
      showToast('⚠️ 请输入有效金额');
      return;
    }

    const dest = allDestinations.find(d => d.id == depositTargetId);
    if (!dest) return;

    if (!dest.fund) dest.fund = { target: 0, saved: 0 };
    dest.fund.saved = (dest.fund.saved || 0) + amount;
    dest.updatedAt = Date.now();
    try {
      await Storage.put('travel', dest);
    } catch(e) {
      console.warn('[Travel] Storage.put 失败:', e);
    }

    closeDeposit();
    await loadData();
    renderAll();
    showToast(`✅ 已存入 ${formatMoney(amount)} 到 ${dest.name}基金`);
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // FAB
    _bindEvent(document.getElementById('travelFab'), 'click', () => openModal(null));

    // Modal 关闭
    _bindEvent(document.getElementById('travelModalClose'), 'click', closeModal);
    _bindEvent(document.getElementById('travelBtnCancel'), 'click', closeModal);
    _bindEvent(document.getElementById('travelModalOverlay'), 'click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // 表单提交
    _bindEvent(document.getElementById('travelForm'), 'submit', (e) => {
      e.preventDefault();
      saveDest();
    });

    // 删除按钮
    _bindEvent(document.getElementById('travelBtnDelete'), 'click', () => {
      const editId = document.getElementById('travelEditId').value;
      if (editId) deleteDest(parseInt(editId));
    });

    // 存入基金弹窗
    _bindEvent(document.getElementById('travelDepositClose'), 'click', closeDeposit);
    _bindEvent(document.getElementById('travelDepositOverlay'), 'click', (e) => {
      if (e.target === e.currentTarget) closeDeposit();
    });
    _bindEvent(document.getElementById('travelDepositConfirm'), 'click', confirmDeposit);
    _bindEvent(document.getElementById('travelDepositInput'), 'keydown', (e) => {
      if (e.key === 'Enter') confirmDeposit();
    });

    // 卡片交互（事件委托）
    _bindEvent(document, 'click', (e) => {
      // 阶段切换（点击 badge 循环切换）
      const cycleBtn = e.target.closest('[data-action="cycle-stage"]');
      if (cycleBtn) {
        e.stopPropagation();
        const id = parseInt(cycleBtn.dataset.id);
        cycleStage(id);
        return;
      }

      // 阶段步骤点击
      const stageStep = e.target.closest('[data-action="set-stage"]');
      if (stageStep) {
        e.stopPropagation();
        const id = parseInt(stageStep.dataset.id);
        const stage = stageStep.dataset.stage;
        setStage(id, stage);
        return;
      }

      // 删除目的地（卡片内）
      const deleteBtn = e.target.closest('[data-action="delete-dest"]');
      if (deleteBtn) {
        e.stopPropagation();
        const id = parseInt(deleteBtn.dataset.id);
        deleteDestination(id);
        return;
      }

      // 存入基金
      const depositBtn = e.target.closest('[data-action="deposit"]');
      if (depositBtn) {
        e.stopPropagation();
        const id = parseInt(depositBtn.dataset.id);
        openDeposit(id);
        return;
      }

      // 证件勾选
      const checkItem = e.target.closest('[data-action="toggle-check"]');
      if (checkItem) {
        e.stopPropagation();
        const id = parseInt(checkItem.dataset.id);
        const ci = parseInt(checkItem.dataset.ci);
        toggleCheck(id, ci);
        return;
      }

      // 卡片展开/折叠
      const header = e.target.closest('[data-action="toggle"]');
      if (header) {
        const id = parseInt(header.dataset.id);
        expandedId = expandedId === id ? null : id;
        renderDestinations();
        return;
      }
    });

    // 倒计时定时器（每分钟刷新）
    _countdownTimer = setInterval(() => {
      renderCountdown();
    }, 60000);
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Travel] 模块初始化...');
    await loadData();
    renderAll();
    bindEvents();
  }

  // ===== 模块生命周期 =====
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) {
      el.addEventListener(event, handler);
      _eventListeners.push({ el, event, handler });
    }
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    if (_countdownTimer) {
      clearInterval(_countdownTimer);
      _countdownTimer = null;
    }
    console.log('[TravelModule] 模块已销毁');
  }

  return { init, destroy };
})();
