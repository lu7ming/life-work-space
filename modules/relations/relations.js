/**
 * relations.js - 关系管理模块
 * 人生工作台 · 联系人管理与生日提醒
 * 支持 ABCD 四层分类 + 跟进频率提醒
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';
import { CrossLinker } from '../../core/cross-linker.js';


export const RelationsModule = (() => {
  const { escapeHtml } = AppUtils;

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
    console.log('[RelationsModule] 模块已销毁');
  }

  const STORE = 'contacts';

  // ABCD 分类配置
  const CATEGORY_CONFIG = {
    A: { label: '核心圈', color: '#D4605A', bgColor: '#FDE8EC', followUpDays: 7, desc: '每周至少联系1次' },
    B: { label: '重要圈', color: '#E8943A', bgColor: '#FFF3E0', followUpDays: 30, desc: '每月至少联系1次' },
    C: { label: '维护圈', color: '#4A90D9', bgColor: '#E3F0FC', followUpDays: 90, desc: '每季度联系1次' },
    D: { label: '观察圈', color: '#9E9E9E', bgColor: '#F0F0F0', followUpDays: Infinity, desc: '随缘联系' }
  };

  // 状态
  let allContacts = [];
  let currentFilter = 'all';       // 类型筛选
  let currentCategoryFilter = 'all'; // ABCD分类筛选
  let currentSort = 'name';
  let searchQuery = '';
  let selectedContact = null;
  let editingContact = null;
  let formType = '家人';
  let formCategory = 'A';

  // ===== 工具函数 =====


  function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getTodayMD() {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 计算距离下次生日的天数
  function daysUntilBirthday(mmdd) {
    if (!mmdd || mmdd.length < 5) return 999;
    const today = new Date();
    const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const [bm, bd] = mmdd.split('-').map(Number);
    const thisYear = today.getFullYear();
    let next = new Date(thisYear, bm - 1, bd);
    // 如果今年已过，推到明年
    const todayComp = `${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const bComp = `${String(bm).padStart(2, '0')}${String(bd).padStart(2, '0')}`;
    if (bComp < todayComp) {
      next = new Date(thisYear + 1, bm - 1, bd);
    }
    const diff = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
    return diff < 0 ? 0 : diff;
  }

  // 获取姓名首字（用于头像）
  function getInitial(name) {
    return name ? name.charAt(0) : '?';
  }

  // 获取分类配置，默认为 C
  function getCategoryConfig(category) {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG['C'];
  }

  // 是否需要跟进提醒
  function needsFollowUp(contact) {
    const cat = contact.category || 'C';
    const config = getCategoryConfig(cat);
    if (config.followUpDays === Infinity) return false; // D层不需要提醒
    if (!contact.lastContactDate) return true; // 从未联系过，需要提醒
    const last = new Date(contact.lastContactDate);
    const now = new Date();
    const days = Math.ceil((now - last) / (1000 * 60 * 60 * 24));
    return days > config.followUpDays;
  }

  // 获取距离超过跟进阈值的天数
  function getOverdueDays(contact) {
    const cat = contact.category || 'C';
    const config = getCategoryConfig(cat);
    if (config.followUpDays === Infinity) return 0;
    if (!contact.lastContactDate) return config.followUpDays; // 从未联系
    const last = new Date(contact.lastContactDate);
    const now = new Date();
    const days = Math.ceil((now - last) / (1000 * 60 * 60 * 24));
    return Math.max(0, days - config.followUpDays);
  }

  // 关系健康度计算（结合ABCD分类）
  function getHealthStatus(contact) {
    const lastContactDate = contact.lastContactDate;
    const category = contact.category || 'C';
    const config = getCategoryConfig(category);

    if (!lastContactDate) {
      if (category === 'D') return { level: 'none', days: -1, text: '暂无联系记录', percent: 50 };
      return { level: 'none', days: -1, text: '暂无联系记录', percent: 0 };
    }

    const last = new Date(lastContactDate);
    const now = new Date();
    const days = Math.ceil((now - last) / (1000 * 60 * 60 * 24));
    const threshold = config.followUpDays;

    // D层不扣分
    if (category === 'D') {
      return { level: 'good', days, text: `${days}天前联系过（随缘圈，不扣分）💚`, percent: 60 };
    }

    // 未超过阈值：健康
    if (days <= threshold) {
      const ratio = days / threshold;
      const percent = Math.max(40, 100 - ratio * 40);
      return { level: 'good', days, text: `${days}天前联系过，关系良好 💚`, percent };
    }

    // 超过阈值：开始扣分
    const overdueDays = days - threshold;
    let percent, level, emoji;

    if (overdueDays <= threshold * 0.5) {
      // 轻度超时
      level = 'warning';
      percent = Math.max(20, 40 - overdueDays * 0.5);
      emoji = '⚠️';
    } else {
      // 严重超时
      level = 'danger';
      percent = Math.max(5, 20 - (overdueDays - threshold * 0.5) * 0.2);
      emoji = '🚨';
    }

    return {
      level,
      days,
      text: `${days}天未联系（超过${threshold}天阈值），该关心一下了 ${emoji}`,
      percent
    };
  }

  // 兼容旧版调用（传入字符串而非对象时）
  function getHealthStatusCompat(contactOrDate) {
    if (typeof contactOrDate === 'string' || contactOrDate === null) {
      return getHealthStatus({ lastContactDate: contactOrDate, category: 'C' });
    }
    return getHealthStatus(contactOrDate);
  }

  // 拼音排序辅助
  function sortByPinyin(a, b) {
    return (a.name || '').localeCompare(b.name || '', 'zh-CN');
  }

  // ===== 数据加载 =====
  async function loadData() {
    try {
      allContacts = await Storage.getAll(STORE);
      // 数据迁移：为没有category字段的联系人设置默认值（仅首次执行）
      const migrated = await Storage.get('meta', 'categoryMigrated');
      if (!migrated) {
        let needSave = false;
        for (const c of allContacts) {
          if (!c.category) {
            c.category = 'C'; // 默认为维护圈
            needSave = true;
          }
        }
        if (needSave) {
          for (const c of allContacts) {
            try { await Storage.put(STORE, c); } catch (e) { /* ignore */ }
          }
        }
        await Storage.put('meta', { key: 'categoryMigrated', value: true });
      }
    } catch (e) {
      console.warn('[Relations] 加载数据失败:', e);
      allContacts = [];
    }
  }

  // ===== 过滤与排序 =====
  function getFilteredContacts() {
    let list = [...allContacts];

    // ABCD分类筛选
    if (currentCategoryFilter !== 'all') {
      list = list.filter(c => (c.category || 'C') === currentCategoryFilter);
    }

    // 类型筛选
    if (currentFilter !== 'all') {
      list = list.filter(c => c.type === currentFilter);
    }

    // 搜索
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(c => (c.name || '').toLowerCase().includes(q));
    }

    // 排序
    if (currentSort === 'name') {
      list.sort(sortByPinyin);
    } else if (currentSort === 'recent') {
      list.sort((a, b) => {
        const da = a.lastContactDate || '0000-00-00';
        const db = b.lastContactDate || '0000-00-00';
        return db.localeCompare(da);
      });
    } else if (currentSort === 'birthday') {
      list.sort((a, b) => daysUntilBirthday(a.birthday) - daysUntilBirthday(b.birthday));
    }

    return list;
  }

  // ===== 未来30天生日 =====
  function getUpcomingBirthdays() {
    return allContacts
      .map(c => ({ ...c, _daysLeft: daysUntilBirthday(c.birthday) }))
      .filter(c => c._daysLeft <= 30)
      .sort((a, b) => a._daysLeft - b._daysLeft);
  }

  // ===== 渲染 =====
  function renderBirthdaySection() {
    const list = getUpcomingBirthdays();
    const listEl = document.getElementById('rel-birthday-list');
    const emptyEl = document.getElementById('rel-birthday-empty');
    const sectionEl = document.getElementById('rel-birthday-section');

    if (list.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.style.display = 'flex';

    listEl.innerHTML = list.map(c => {
      const isToday = c._daysLeft === 0;
      const daysText = isToday ? '🎉 今天生日！' : `${c._daysLeft}天后`;
      return `
        <div class="rel-birthday-item ${isToday ? 'rel-birthday-item-today' : ''}" data-id="${c.id}">
          <div class="rel-birthday-item-avatar">${escapeHtml(getInitial(c.name))}</div>
          <div class="rel-birthday-item-info">
            <span class="rel-birthday-item-name">${escapeHtml(c.name)}</span>
            <span class="rel-birthday-item-date">${escapeHtml(c.birthday)} · ${daysText}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderGrid() {
    const grid = document.getElementById('rel-grid');
    const empty = document.getElementById('rel-empty');
    const list = getFilteredContacts();

    if (list.length === 0) {
      grid.innerHTML = '';
      grid.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    grid.style.display = 'grid';

    grid.innerHTML = list.map(c => {
      const health = getHealthStatus(c);
      const catConfig = getCategoryConfig(c.category || 'C');
      const daysLeft = daysUntilBirthday(c.birthday);
      const birthdayText = daysLeft === 0 ? '🎂 今天生日！' : `还有${daysLeft}天`;
      const daysClass = daysLeft === 0 ? 'today' : (daysLeft <= 7 ? 'soon' : '');
      const showFollowUp = needsFollowUp(c);
      const overdueDays = getOverdueDays(c);

      return `
        <div class="rel-card" data-id="${c.id}">
          <div class="rel-card-health ${health.level}" title="${escapeHtml(health.text)}"></div>
          <div class="rel-card-header">
            <div class="rel-card-avatar">${escapeHtml(getInitial(c.name))}</div>
            <div class="rel-card-header-text">
              <div class="rel-card-name">${escapeHtml(c.name)}</div>
              <div class="rel-card-badges">
                <span class="rel-card-type-badge">${escapeHtml(c.type)}</span>
                <span class="rel-card-cat-badge rel-card-cat-${(c.category || 'C').toLowerCase()}" title="${escapeHtml(catConfig.label)} · ${escapeHtml(catConfig.desc)}">${(c.category || 'C')}</span>
              </div>
            </div>
          </div>
          <div class="rel-card-body">
            <div class="rel-card-birthday">
              🎂 ${escapeHtml(c.birthday)}
              <span class="rel-card-days-left ${daysClass}">${birthdayText}</span>
            </div>
            ${showFollowUp ? `<div class="rel-card-followup">⚠️ 超过${overdueDays}天未跟进</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    renderBirthdaySection();
    renderGrid();
  }

  // ===== 详情弹窗 =====
  function openDetail(contact) {
    selectedContact = contact;
    const modal = document.getElementById('rel-detail-modal');
    const avatar = document.getElementById('rel-detail-avatar');
    const name = document.getElementById('rel-detail-name');
    const badge = document.getElementById('rel-detail-type-badge');
    const catBadge = document.getElementById('rel-detail-cat-badge');

    avatar.textContent = getInitial(contact.name);
    name.textContent = contact.name;
    badge.textContent = contact.type;

    // ABCD 分类标签
    const catConfig = getCategoryConfig(contact.category || 'C');
    const cat = contact.category || 'C';
    catBadge.textContent = `${cat} ${catConfig.label}`;
    catBadge.className = `rel-detail-cat-badge rel-detail-cat-${cat.toLowerCase()}`;

    // 基本信息
    const birthdayRow = document.getElementById('rel-info-birthday-row');
    const phoneRow = document.getElementById('rel-info-phone-row');
    const wechatRow = document.getElementById('rel-info-wechat-row');
    const emailRow = document.getElementById('rel-info-email-row');
    const notesRow = document.getElementById('rel-info-notes-row');

    (document.getElementById('rel-info-birthday') || {}).textContent = contact.birthday || '未设置';
    birthdayRow.style.display = contact.birthday ? '' : 'none';

    (document.getElementById('rel-info-phone') || {}).textContent = contact.phone || '未设置';
    phoneRow.style.display = contact.phone ? '' : 'none';

    (document.getElementById('rel-info-wechat') || {}).textContent = contact.wechat || '未设置';
    wechatRow.style.display = contact.wechat ? '' : 'none';

    (document.getElementById('rel-info-email') || {}).textContent = contact.email || '未设置';
    emailRow.style.display = contact.email ? '' : 'none';

    (document.getElementById('rel-info-notes') || {}).textContent = contact.notes || '无';
    notesRow.style.display = contact.notes ? '' : 'none';

    // 重要日期
    const datesSection = document.getElementById('rel-important-dates');
    const datesList = document.getElementById('rel-dates-list');
    if (contact.importantDates && contact.importantDates.length > 0) {
      datesSection.style.display = '';
      datesList.innerHTML = contact.importantDates.map(d =>
        `<div class="rel-date-item">
          <span class="rel-date-item-label">${escapeHtml(d.label)}</span>
          <span>${escapeHtml(d.date)}</span>
        </div>`
      ).join('');
    } else {
      datesSection.style.display = 'none';
    }

    // 关系健康度（使用新版，传入完整contact对象）
    const health = getHealthStatus(contact);
    const healthFill = document.getElementById('rel-health-fill');
    const healthText = document.getElementById('rel-health-text');
    healthFill.style.width = health.percent + '%';
    healthFill.className = 'rel-health-fill' + (health.level === 'warning' ? ' warning' : health.level === 'danger' ? ' danger' : '');
    healthText.textContent = health.text;

    // 互动记录
    renderInteractions();

    // 重置到信息标签页
    switchDetailTab('info');

    // 设置互动记录默认日期为今天
    (document.getElementById('rel-interaction-date') || {}).value = getToday();
    (document.getElementById('rel-interaction-note') || {}).value = '';

    modal.style.display = 'flex';
  }

  function closeDetail() {
    document.getElementById('rel-detail-modal')?.style.display = 'none';
    selectedContact = null;
  }

  function switchDetailTab(tab) {
    document.querySelectorAll('.rel-detail-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.getElementById('rel-panel-info')?.style.display = tab === 'info' ? '' : 'none';
    document.getElementById('rel-panel-interactions')?.style.display = tab === 'interactions' ? '' : 'none';
  }

  // ===== 互动记录 =====
  function renderInteractions() {
    if (!selectedContact) return;
    const list = document.getElementById('rel-interaction-list');
    const empty = document.getElementById('rel-interaction-empty');
    const interactions = selectedContact.interactions || [];

    if (interactions.length === 0) {
      list.innerHTML = '';
      list.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    list.style.display = 'flex';

    // 按日期倒序
    const sorted = [...interactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    list.innerHTML = sorted.map((item, idx) =>
      `<div class="rel-interaction-item" data-idx="${idx}">
        <div class="rel-interaction-dot"></div>
        <div class="rel-interaction-content">
          <div class="rel-interaction-date-text">${escapeHtml(item.date)}</div>
          <div class="rel-interaction-note-text">${escapeHtml(item.note || '联系过了')}</div>
        </div>
        <button class="rel-interaction-delete" data-date="${escapeHtml(item.date)}" data-note="${escapeHtml(item.note || '')}" title="删除">✕</button>
      </div>`
    ).join('');
  }

  async function addInteraction() {
    if (!selectedContact) return;
    const dateInput = document.getElementById('rel-interaction-date');
    const noteInput = document.getElementById('rel-interaction-note');
    const date = dateInput.value;
    const note = noteInput.value.trim();

    if (!date) {
      if (window.App?.showToast) window.App?.showToast('请选择日期');
      return;
    }

    if (!selectedContact.interactions) selectedContact.interactions = [];
    selectedContact.interactions.push({ date, note: note || '联系过了' });

    // 更新 lastContactDate
    selectedContact.lastContactDate = date;
    selectedContact.updatedAt = Date.now();

    try {
      await Storage.put(STORE, selectedContact);
      // 刷新本地数据
      const idx = allContacts.findIndex(c => c.id === selectedContact.id);
      if (idx !== -1) allContacts[idx] = { ...selectedContact };
      renderInteractions();
      renderGrid();
      renderBirthdaySection();
      // 更新详情中的健康度
      const health = getHealthStatus(selectedContact);
      const healthFill = document.getElementById('rel-health-fill');
      const healthText = document.getElementById('rel-health-text');
      healthFill.style.width = health.percent + '%';
      healthFill.className = 'rel-health-fill' + (health.level === 'warning' ? ' warning' : health.level === 'danger' ? ' danger' : '');
      healthText.textContent = health.text;
      noteInput.value = '';
    } catch (e) {
      console.error('[Relations] 添加互动失败:', e);
    }
  }

  async function deleteInteraction(date, note) {
    if (!selectedContact) return;
    if (!selectedContact.interactions) return;

    const idx = selectedContact.interactions.findIndex(i => i.date === date && (i.note || '') === note);
    if (idx === -1) return;

    selectedContact.interactions.splice(idx, 1);

    // 重新计算 lastContactDate
    if (selectedContact.interactions.length > 0) {
      const sorted = [...selectedContact.interactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      selectedContact.lastContactDate = sorted[0].date;
    } else {
      selectedContact.lastContactDate = null;
    }
    selectedContact.updatedAt = Date.now();

    try {
      await Storage.put(STORE, selectedContact);
      const ci = allContacts.findIndex(c => c.id === selectedContact.id);
      if (ci !== -1) allContacts[ci] = { ...selectedContact };
      renderInteractions();
      renderGrid();
    } catch (e) {
      console.error('[Relations] 删除互动失败:', e);
    }
  }

  // ===== 添加/编辑表单 =====
  function openForm(contact) {
    editingContact = contact || null;
    const modal = document.getElementById('rel-form-modal');
    const title = document.getElementById('rel-form-title');
    const datesList = document.getElementById('rel-form-dates-list');

    if (editingContact) {
      title.textContent = '编辑联系人';
      (document.getElementById('rel-form-name') || {}).value = editingContact.name || '';
      (document.getElementById('rel-form-birthday') || {}).value = editingContact.birthday || '';
      (document.getElementById('rel-form-phone') || {}).value = editingContact.phone || '';
      (document.getElementById('rel-form-wechat') || {}).value = editingContact.wechat || '';
      (document.getElementById('rel-form-email') || {}).value = editingContact.email || '';
      (document.getElementById('rel-form-notes') || {}).value = editingContact.notes || '';

      // 设置类型
      const presetTypes = ['家人', '朋友', '老师', '同学', '同事'];
      const customInput = document.getElementById('rel-form-custom-type');
      if (presetTypes.includes(editingContact.type)) {
        formType = editingContact.type;
        customInput.style.display = 'none';
        customInput.value = '';
      } else {
        formType = '__custom__';
        customInput.style.display = '';
        customInput.value = editingContact.type || '';
      }
      updateTypeButtons();

      // 设置分类
      formCategory = editingContact.category || 'C';
      updateCategoryButtons();

      // 重要日期
      datesList.innerHTML = '';
      if (editingContact.importantDates) {
        editingContact.importantDates.forEach(d => addDateRow(d.date, d.label));
      }
    } else {
      title.textContent = '添加联系人';
      document.getElementById('rel-form')?.reset();
      formType = '家人';
      formCategory = 'A'; // 新增联系人默认为核心圈
      document.getElementById('rel-form-custom-type')?.style.display = 'none';
      updateTypeButtons();
      updateCategoryButtons();
      datesList.innerHTML = '';
    }

    modal.style.display = 'flex';
  }

  function closeForm() {
    document.getElementById('rel-form-modal')?.style.display = 'none';
    editingContact = null;
  }

  function updateTypeButtons() {
    document.querySelectorAll('.rel-form-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === formType);
    });
  }

  function updateCategoryButtons() {
    document.querySelectorAll('.rel-form-cat-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === formCategory);
    });
  }

  function addDateRow(date, label) {
    const list = document.getElementById('rel-form-dates-list');
    const row = document.createElement('div');
    row.className = 'rel-form-date-row';
    row.innerHTML = `
      <input type="text" class="rel-form-input rel-date-input" placeholder="MM-DD" value="${escapeHtml(date || '')}">
      <input type="text" class="rel-form-input rel-date-label-input" placeholder="标签（如：结婚纪念日）" value="${escapeHtml(label || '')}">
      <button type="button" class="rel-form-date-remove">&times;</button>
    `;
    list.appendChild(row);
  }

  async function saveForm(e) {
    e.preventDefault();
    const name = document.getElementById('rel-form-name')?.value.trim();
    const birthday = document.getElementById('rel-form-birthday')?.value.trim();
    const customTypeInput = document.getElementById('rel-form-custom-type');

    if (!name) {
      if (window.App?.showToast) window.App?.showToast('请输入姓名');
      return;
    }
    if (!birthday || !/^\d{2}-\d{2}$/.test(birthday)) {
      if (window.App?.showToast) window.App?.showToast('请输入正确的生日格式（MM-DD）');
      return;
    }

    let type = formType;
    if (formType === '__custom__') {
      type = customTypeInput.value.trim();
      if (!type) {
        if (window.App?.showToast) window.App?.showToast('请输入自定义类型');
        return;
      }
    }

    // 收集重要日期
    const importantDates = [];
    document.querySelectorAll('.rel-form-date-row').forEach(row => {
      const d = row.querySelector('.rel-date-input')?.value.trim();
      const l = row.querySelector('.rel-date-label-input')?.value.trim();
      if (d) importantDates.push({ date: d, label: l || '重要日期' });
    });

    const now = Date.now();
    const data = {
      name,
      type,
      category: formCategory,
      birthday,
      phone: document.getElementById('rel-form-phone')?.value.trim(),
      wechat: document.getElementById('rel-form-wechat')?.value.trim(),
      email: document.getElementById('rel-form-email')?.value.trim(),
      notes: document.getElementById('rel-form-notes')?.value.trim(),
      importantDates,
      updatedAt: now
    };

    try {
      if (editingContact) {
        data.id = editingContact.id;
        data.interactions = editingContact.interactions || [];
        data.lastContactDate = editingContact.lastContactDate || null;
        data.createdAt = editingContact.createdAt || now;
        await Storage.put(STORE, data);
        const idx = allContacts.findIndex(c => c.id === data.id);
        if (idx !== -1) allContacts[idx] = data;
      } else {
        data.interactions = [];
        data.lastContactDate = null;
        data.createdAt = now;
        const id = await Storage.add(STORE, data);
        data.id = id;
        allContacts.push(data);
      }

      closeForm();
      renderAll();
      if (window.App?.showToast) window.App?.showToast('保存成功 ✓');
    } catch (e) {
      console.error('[Relations] 保存失败:', e);
      if (window.App?.showToast) window.App?.showToast('保存失败，请重试');
    }
  }

  // ===== 删除联系人 =====
  async function deleteContact() {
    if (!selectedContact) return;
    if (!confirm(`确定要删除「${selectedContact.name}」吗？`)) return;

    try {
      await Storage.remove(STORE, selectedContact.id);
      allContacts = allContacts.filter(c => c.id !== selectedContact.id);
      closeDetail();
      renderAll();
      if (window.App?.showToast) window.App?.showToast('已删除');
    } catch (e) {
      console.error('[Relations] 删除失败:', e);
    }
  }

  // ===== 导出 =====
  function exportData() {
    if (allContacts.length === 0) {
      if (window.App?.showToast) window.App?.showToast('没有数据可导出');
      return;
    }
    const json = JSON.stringify(allContacts, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts_${getToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    const container = document.querySelector('.relations');
    if (!container) return;

    // 搜索
    _bindEvent(document.getElementById('rel-search-input'), 'input', (e) => {
      searchQuery = e.target.value;
      renderGrid();
    });

    // ABCD 分类筛选
    _bindEvent(document.getElementById('rel-category-tabs'), 'click', (e) => {
      const tab = e.target.closest('.rel-category-tab');
      if (!tab) return;
      currentCategoryFilter = tab.dataset.category;
      document.querySelectorAll('.rel-category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderGrid();
    });

    // 类型筛选
    _bindEvent(document.getElementById('rel-type-tabs'), 'click', (e) => {
      const tab = e.target.closest('.rel-type-tab');
      if (!tab) return;
      currentFilter = tab.dataset.type;
      document.querySelectorAll('.rel-type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderGrid();
    });

    // 排序
    _bindEvent(document.getElementById('rel-sort-select'), 'change', (e) => {
      currentSort = e.target.value;
      renderGrid();
    });

    // 卡片点击 -> 打开详情
    _bindEvent(document.getElementById('rel-grid'), 'click', (e) => {
      const card = e.target.closest('.rel-card');
      if (!card) return;
      const id = Number(card.dataset.id);
      const contact = allContacts.find(c => c.id === id);
      if (contact) openDetail(contact);
    });

    // 生日卡片点击 -> 打开详情
    _bindEvent(document.getElementById('rel-birthday-list'), 'click', (e) => {
      const item = e.target.closest('.rel-birthday-item');
      if (!item) return;
      const id = Number(item.dataset.id);
      const contact = allContacts.find(c => c.id === id);
      if (contact) openDetail(contact);
    });

    // 详情弹窗关闭
    _bindEvent(document.getElementById('rel-detail-close'), 'click', closeDetail);
    _bindEvent(document.getElementById('rel-detail-modal'), 'click', (e) => {
      if (e.target === e.currentTarget) closeDetail();
    });

    // 详情标签切换
    document.querySelectorAll('.rel-detail-tab').forEach(tab => {
      _bindEvent(tab, 'click', () => switchDetailTab(tab.dataset.tab));
    });

    // 编辑按钮
    _bindEvent(document.getElementById('rel-edit-btn'), 'click', () => {
      if (selectedContact) {
        closeDetail();
        openForm(selectedContact);
      }
    });

    // 删除按钮
    _bindEvent(document.getElementById('rel-delete-btn'), 'click', deleteContact);

    // 添加互动
    _bindEvent(document.getElementById('rel-add-interaction-btn'), 'click', addInteraction);

    // 删除互动
    _bindEvent(document.getElementById('rel-interaction-list'), 'click', (e) => {
      const btn = e.target.closest('.rel-interaction-delete');
      if (!btn) return;
      if (confirm('确定删除这条记录？')) {
        deleteInteraction(btn.dataset.date, btn.dataset.note);
      }
    });

    // FAB -> 添加联系人
    _bindEvent(document.getElementById('rel-fab'), 'click', () => openForm(null));

    // 表单弹窗关闭
    _bindEvent(document.getElementById('rel-form-close'), 'click', closeForm);
    _bindEvent(document.getElementById('rel-form-cancel'), 'click', closeForm);
    _bindEvent(document.getElementById('rel-form-modal'), 'click', (e) => {
      if (e.target === e.currentTarget) closeForm();
    });

    // 表单提交
    _bindEvent(document.getElementById('rel-form'), 'submit', saveForm);

    // 类型选择
    _bindEvent(document.getElementById('rel-form-type-selector'), 'click', (e) => {
      const btn = e.target.closest('.rel-form-type-btn');
      if (!btn) return;
      formType = btn.dataset.type;
      document.getElementById('rel-form-custom-type')?.style.display = 'none';
      updateTypeButtons();
    });

    // 自定义类型双击切换
    _bindEvent(document.getElementById('rel-form-type-selector'), 'dblclick', (e) => {
      const btn = e.target.closest('.rel-form-type-btn');
      if (!btn) return;
      formType = '__custom__';
      document.querySelectorAll('.rel-form-type-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('rel-form-custom-type')?.style.display = '';
      document.getElementById('rel-form-custom-type')?.focus();
    });

    // ABCD 分类选择
    _bindEvent(document.getElementById('rel-form-category-selector'), 'click', (e) => {
      const btn = e.target.closest('.rel-form-cat-btn');
      if (!btn) return;
      formCategory = btn.dataset.cat;
      updateCategoryButtons();
    });

    // 添加重要日期
    _bindEvent(document.getElementById('rel-add-date-btn'), 'click', () => {
      addDateRow('', '');
    });

    // 删除重要日期行
    _bindEvent(document.getElementById('rel-form-dates-list'), 'click', (e) => {
      const btn = e.target.closest('.rel-form-date-remove');
      if (!btn) return;
      btn.closest('.rel-form-date-row').remove();
    });

    // 导出
    _bindEvent(document.getElementById('rel-export-btn'), 'click', exportData);
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Relations] 关系管理模块初始化...');
    await loadData();
    renderAll();
    bindEvents();
  }

  return { init, destroy };
})();
