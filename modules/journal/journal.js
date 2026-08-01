/**
 * 记录与反思模块 - journal.js
 * 三个子Tab：日记、复盘、灵感速记
 */
const JournalModule = (() => {
  const { escapeHtml, formatDate } = AppUtils;

  // ========== 状态 ==========
  let currentTab = 'diary';
  let currentReviewSubtype = 'weekly';
  let diaryViewMode = 'calendar'; // 'calendar' | 'list'
  let calYear, calMonth; // 日历当前年月
  let selectedDate = null; // 选中的日记日期
  let editingDiaryId = null; // 正在编辑的日记id
  let editingReviewId = null; // 正在编辑的复盘id
  let editingIdeaId = null; // 正在编辑的灵感id
  let ideaTags = []; // 当前灵感标签
  let ideasFilter = { search: '', tag: '' };
  let allDiaries = [];
  let allReviews = [];
  let allIdeas = [];

  // ========== 工具函数 ==========


  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${m}月${day}日 周${weekdays[d.getDay()]}`;
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function daysAgoStr(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function isOver30Days(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    return (now - d) > 30 * 24 * 60 * 60 * 1000;
  }

  function showToast(msg, type) {
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

  // ========== 数据加载 ==========
  async function loadData() {
    try {
      allDiaries = (await Storage.getAll('journal')).filter(r => r.type === 'diary');
      allReviews = (await Storage.getAll('journal')).filter(r => r.type === 'review');
      allIdeas = await Storage.getAll('ideas');
    } catch (e) {
      console.warn('[Journal] 数据加载失败，可能表尚未创建', e);
      allDiaries = [];
      allReviews = [];
      allIdeas = [];
    }
  }

  // ========== 初始化 ==========
  async function init() {
    console.log('[Journal] 模块初始化...');
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    selectedDate = todayStr();

    await loadData();
    renderAll();
    bindEvents();
  }

  function renderAll() {
    switchTab(currentTab);
  }

  // ========== 事件绑定 ==========
  function bindEvents() {
    // Tab 切换
    document.querySelectorAll('.journal-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });

    // 日历导航
    document.getElementById('cal-prev').addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });

    // 视图切换
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        diaryViewMode = btn.dataset.view;
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderDiary();
      });
    });

    // 日记编辑器
    document.getElementById('diary-editor-back').addEventListener('click', () => {
      closeDiaryEditor();
    });
    document.getElementById('diary-editor-save').addEventListener('click', saveDiary);

    // 心情选择
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    // 复盘类型切换
    document.querySelectorAll('.review-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentReviewSubtype = btn.dataset.subtype;
        document.querySelectorAll('.review-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderReviews();
      });
    });

    // 复盘 Modal
    document.getElementById('review-modal-close').addEventListener('click', () => closeModal('review-modal'));
    document.getElementById('review-modal-cancel').addEventListener('click', () => closeModal('review-modal'));
    document.getElementById('review-modal-save').addEventListener('click', saveReview);

    // 灵感 Modal
    document.getElementById('idea-modal-close').addEventListener('click', () => closeModal('idea-modal'));
    document.getElementById('idea-modal-cancel').addEventListener('click', () => closeModal('idea-modal'));
    document.getElementById('idea-modal-save').addEventListener('click', saveIdea);

    // 灵感标签输入
    document.getElementById('idea-tag-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val && !ideaTags.includes(val)) {
          ideaTags.push(val);
          renderIdeaTagChips();
        }
        e.target.value = '';
      }
    });

    // 灵感详情 Modal
    document.getElementById('idea-detail-close').addEventListener('click', () => closeModal('idea-detail-modal'));

    // 灵感搜索
    document.getElementById('ideas-search').addEventListener('input', (e) => {
      ideasFilter.search = e.target.value.trim().toLowerCase();
      renderIdeas();
    });

    // FAB
    document.getElementById('journal-fab').addEventListener('click', handleFab);

    // Modal overlay 点击关闭
    ['review-modal', 'idea-modal', 'idea-detail-modal'].forEach(id => {
      document.getElementById(id).addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal(id);
      });
    });
  }

  // ========== Tab 切换 ==========
  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.journal-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.journal-panel').forEach(p => {
      p.classList.toggle('active', p.id === `panel-${tab}`);
    });

    switch (tab) {
      case 'diary': renderDiary(); break;
      case 'review': renderReviews(); break;
      case 'ideas': renderIdeas(); break;
    }
  }

  // ========== FAB ==========
  function handleFab() {
    switch (currentTab) {
      case 'diary': openDiaryEditor(selectedDate || todayStr()); break;
      case 'review': openReviewModal(); break;
      case 'ideas': openIdeaModal(); break;
    }
  }

  // ========== 日记模块 ==========
  function renderDiary() {
    if (diaryViewMode === 'calendar') {
      document.querySelector('.diary-sidebar').style.display = '';
      document.getElementById('diary-list-view').classList.remove('full-width');
      renderCalendar();
      renderDiaryList();
    } else {
      document.querySelector('.diary-sidebar').style.display = 'none';
      document.getElementById('diary-list-view').classList.add('full-width');
      renderDiaryList();
    }
  }

  function renderCalendar() {
    const title = document.getElementById('cal-title');
    title.textContent = `${calYear}年${calMonth + 1}月`;

    const daysEl = document.getElementById('cal-days');
    daysEl.innerHTML = '';

    const firstDay = new Date(calYear, calMonth, 1);
    let startDay = firstDay.getDay() - 1; // 周一起始
    if (startDay < 0) startDay = 6;

    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = todayStr();

    // 建一个日期->日记映射
    const diaryMap = {};
    allDiaries.forEach(d => { diaryMap[d.date] = d; });

    // 空白填充
    for (let i = 0; i < startDay; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day empty';
      daysEl.appendChild(el);
    }

    // 日期
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const el = document.createElement('div');
      el.className = 'cal-day';
      el.textContent = day;
      el.dataset.date = dateStr;

      if (diaryMap[dateStr]) el.classList.add('has-diary');
      if (dateStr === today) el.classList.add('today');
      if (dateStr === selectedDate) el.classList.add('selected');

      el.addEventListener('click', () => {
        selectedDate = dateStr;
        // 更新日历高亮
        document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
        el.classList.add('selected');
        renderDiaryList();
      });

      daysEl.appendChild(el);
    }
  }

  function renderDiaryList() {
    const container = document.getElementById('diary-list-view');

    // 如果编辑器打开就不渲染列表
    if (!document.getElementById('diary-editor-view').classList.contains('hidden')) return;

    document.getElementById('diary-editor-view').classList.add('hidden');
    container.style.display = '';

    let diaries = [...allDiaries].sort((a, b) => b.date.localeCompare(a.date));

    // 日历模式只显示选中日期的日记
    if (diaryViewMode === 'calendar' && selectedDate) {
      diaries = diaries.filter(d => d.date === selectedDate);
    }

    if (diaries.length === 0) {
      const dateInfo = selectedDate ? formatDate(selectedDate) : '';
      container.innerHTML = `
        <div class="diary-empty">
          <div class="diary-empty-icon">📖</div>
          <div class="diary-empty-text">${selectedDate ? `${dateInfo} 还没有日记` : '还没有日记，点击 + 开始记录'}</div>
        </div>`;
      return;
    }

    container.innerHTML = diaries.map(d => `
      <div class="diary-card" data-id="${d.id}">
        <div class="diary-card-header">
          <span class="diary-card-date">${formatDate(d.date)}</span>
          ${d.mood ? `<span class="diary-card-mood">${escapeHtml(d.mood)}</span>` : ''}
        </div>
        <div class="diary-card-content">${escapeHtml(d.content)}</div>
        <div class="diary-card-actions">
          <button class="btn-edit" data-action="edit" data-id="${d.id}">编辑</button>
          <button class="btn-delete" data-action="delete" data-id="${d.id}">删除</button>
        </div>
      </div>
    `).join('');

    // 绑定卡片事件
    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        openDiaryEditor(null, id);
      });
    });
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        if (confirm('确定删除这篇日记吗？')) {
          await Storage.remove('journal', id);
          await loadData();
          renderDiary();
          showToast('日记已删除');
        }
      });
    });
    container.querySelectorAll('.diary-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        openDiaryEditor(null, id);
      });
    });
  }

  function openDiaryEditor(date, editId) {
    const editorView = document.getElementById('diary-editor-view');
    const listView = document.getElementById('diary-list-view');

    listView.style.display = 'none';
    editorView.classList.remove('hidden');

    // 清除之前的选中状态
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));

    if (editId) {
      // 编辑模式
      const diary = allDiaries.find(d => d.id === editId);
      if (!diary) return;
      editingDiaryId = editId;
      document.getElementById('diary-editor-date').textContent = formatDate(diary.date);
      document.getElementById('diary-textarea').value = diary.content || '';
      if (diary.mood) {
        const moodBtn = document.querySelector(`.mood-btn[data-mood="${diary.mood}"]`);
        if (moodBtn) moodBtn.classList.add('selected');
      }
    } else {
      // 新建模式
      editingDiaryId = null;
      const d = date || selectedDate || todayStr();
      selectedDate = d;
      document.getElementById('diary-editor-date').textContent = formatDate(d);
      document.getElementById('diary-textarea').value = '';
    }

    document.getElementById('diary-textarea').focus();
  }

  function closeDiaryEditor() {
    document.getElementById('diary-editor-view').classList.add('hidden');
    document.getElementById('diary-list-view').style.display = '';
    editingDiaryId = null;
    renderDiary();
  }

  async function saveDiary() {
    const content = document.getElementById('diary-textarea').value.trim();
    if (!content) {
      showToast('日记内容不能为空', 'warning');
      return;
    }

    const moodBtn = document.querySelector('.mood-btn.selected');
    const mood = moodBtn ? moodBtn.dataset.mood : '';
    const date = editingDiaryId ? (allDiaries.find(d => d.id === editingDiaryId)?.date || selectedDate) : selectedDate;

    const record = {
      type: 'diary',
      subtype: '',
      content,
      mood,
      date,
      createdAt: editingDiaryId ? (allDiaries.find(d => d.id === editingDiaryId)?.createdAt || Date.now()) : Date.now(),
      updatedAt: Date.now()
    };

    try {
      if (editingDiaryId) {
        record.id = editingDiaryId;
        await Storage.put('journal', record);
      } else {
        await Storage.add('journal', record);
      }
      await loadData();
      closeDiaryEditor();
      showToast(editingDiaryId ? '日记已更新' : '日记已保存');
    } catch (e) {
      console.error('[Journal] 保存日记失败', e);
      showToast('保存失败，请重试', 'error');
    }
  }

  // ========== 复盘模块 ==========
  const reviewTemplates = {
    weekly: [
      { key: 'done', label: '本周完成了什么', placeholder: '记录本周的完成情况...' },
      { key: 'notDone', label: '没完成什么', placeholder: '有哪些计划没有完成？' },
      { key: 'nextPlan', label: '下周计划', placeholder: '下周打算做什么？' }
    ],
    monthly: [
      { key: 'highlights', label: '本月亮点', placeholder: '这个月最值得记录的事情...' },
      { key: 'improve', label: '需要改进', placeholder: '哪些方面需要改进？' },
      { key: 'nextGoal', label: '下月目标', placeholder: '下个月的目标是什么？' }
    ],
    yearly: [
      { key: 'achievements', label: '年度成就', placeholder: '这一年最大的成就...' },
      { key: 'regrets', label: '遗憾', placeholder: '有什么遗憾或没做好的？' },
      { key: 'expectations', label: '来年期望', placeholder: '对下一年有什么期望？' }
    ]
  };

  const subtypeLabels = { weekly: '周复盘', monthly: '月复盘', yearly: '年复盘' };

  function renderReviews() {
    const container = document.getElementById('review-list');
    let reviews = allReviews
      .filter(r => r.subtype === currentReviewSubtype)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (reviews.length === 0) {
      container.innerHTML = `
        <div class="review-empty">
          <div class="review-empty-icon">📋</div>
          <div>还没有${subtypeLabels[currentReviewSubtype]}，点击 + 开始</div>
        </div>`;
      return;
    }

    container.innerHTML = reviews.map(r => {
      let content;
      try { content = typeof r.content === 'string' ? JSON.parse(r.content) : r.content; } catch { content = {}; }
      const summary = Object.values(content).filter(Boolean).join('；').slice(0, 120);

      return `
        <div class="review-card" data-id="${r.id}">
          <div class="review-card-top">
            <span class="review-badge ${r.subtype}">${subtypeLabels[r.subtype]}</span>
            <span class="review-card-date">${escapeHtml(r.date)}</span>
          </div>
          <div class="review-card-summary">${escapeHtml(summary || '暂无内容')}</div>
          <div class="review-card-actions">
            <button class="btn-edit" data-action="edit" data-id="${r.id}">编辑</button>
            <button class="btn-delete" data-action="delete" data-id="${r.id}">删除</button>
          </div>
        </div>`;
    }).join('');

    // 绑定事件
    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openReviewModal(parseInt(btn.dataset.id));
      });
    });
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        if (confirm('确定删除这篇复盘吗？')) {
          await Storage.remove('journal', id);
          await loadData();
          renderReviews();
          showToast('复盘已删除');
        }
      });
    });
    container.querySelectorAll('.review-card').forEach(card => {
      card.addEventListener('click', () => {
        openReviewModal(parseInt(card.dataset.id));
      });
    });
  }

  function openReviewModal(editId) {
    const modal = document.getElementById('review-modal');
    const titleEl = document.getElementById('review-modal-title');
    const body = document.getElementById('review-modal-body');
    const fields = reviewTemplates[currentReviewSubtype];

    let existingContent = {};
    if (editId) {
      const review = allReviews.find(r => r.id === editId);
      if (!review) return;
      editingReviewId = editId;
      titleEl.textContent = `编辑${subtypeLabels[currentReviewSubtype]}`;
      try { existingContent = typeof review.content === 'string' ? JSON.parse(review.content) : review.content; } catch { existingContent = {}; }
    } else {
      editingReviewId = null;
      titleEl.textContent = `新建${subtypeLabels[currentReviewSubtype]}`;
    }

    body.innerHTML = fields.map(f => `
      <div class="review-field-group">
        <label>${f.label}</label>
        <textarea data-key="${f.key}" placeholder="${f.placeholder}">${escapeHtml(existingContent[f.key] || '')}</textarea>
      </div>
    `).join('');

    modal.classList.remove('hidden');
  }

  async function saveReview() {
    const body = document.getElementById('review-modal-body');
    const content = {};
    body.querySelectorAll('textarea').forEach(ta => {
      content[ta.dataset.key] = ta.value.trim();
    });

    if (Object.values(content).every(v => !v)) {
      showToast('请至少填写一项内容', 'warning');
      return;
    }

    const date = todayStr();
    const record = {
      type: 'review',
      subtype: currentReviewSubtype,
      content: JSON.stringify(content),
      mood: '',
      date,
      createdAt: editingReviewId ? (allReviews.find(r => r.id === editingReviewId)?.createdAt || Date.now()) : Date.now(),
      updatedAt: Date.now()
    };

    try {
      if (editingReviewId) {
        record.id = editingReviewId;
        await Storage.put('journal', record);
      } else {
        await Storage.add('journal', record);
      }
      await loadData();
      closeModal('review-modal');
      renderReviews();
      showToast(editingReviewId ? '复盘已更新' : '复盘已保存');
    } catch (e) {
      console.error('[Journal] 保存复盘失败', e);
      showToast('保存失败，请重试', 'error');
    }
  }

  // ========== 灵感速记模块 ==========
  function renderIdeas() {
    const container = document.getElementById('ideas-masonry');

    // 渲染标签筛选
    renderIdeaTagFilter();

    let ideas = [...allIdeas];

    // 搜索过滤
    if (ideasFilter.search) {
      ideas = ideas.filter(i =>
        i.content.toLowerCase().includes(ideasFilter.search) ||
        (i.tags && i.tags.some(t => t.toLowerCase().includes(ideasFilter.search)))
      );
    }
    // 标签过滤
    if (ideasFilter.tag) {
      ideas = ideas.filter(i => i.tags && i.tags.includes(ideasFilter.tag));
    }

    // 按时间倒序
    ideas.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (ideas.length === 0) {
      container.innerHTML = `
        <div class="ideas-empty" style="column-span: all;">
          <div class="ideas-empty-icon">💡</div>
          <div>还没有灵感，点击 + 记录你的想法</div>
        </div>`;
      return;
    }

    container.innerHTML = ideas.map(idea => {
      const archived = idea.archived || false;
      const over30 = !archived && isOver30Days(idea.date);

      return `
        <div class="idea-card ${archived || over30 ? 'archived' : ''}" data-id="${idea.id}">
          <div class="idea-card-content">${escapeHtml(idea.content)}</div>
          <div class="idea-card-meta">
            <span class="idea-card-date">${escapeHtml(idea.date)}</span>
            <div class="idea-card-tags">
              ${(idea.tags || []).map(t => `<span class="idea-card-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
            ${archived ? '<span class="idea-card-status">已转存</span>' : ''}
            ${over30 ? '<span class="idea-card-status">超30天</span>' : ''}
          </div>
        </div>`;
    }).join('');

    // 绑定事件
    container.querySelectorAll('.idea-card').forEach(card => {
      card.addEventListener('click', () => {
        openIdeaDetail(parseInt(card.dataset.id));
      });
    });
  }

  function renderIdeaTagFilter() {
    const container = document.getElementById('ideas-tag-filter');
    const tagSet = new Set();
    allIdeas.forEach(i => { (i.tags || []).forEach(t => tagSet.add(t)); });

    const tags = [...tagSet].sort();
    if (tags.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <button class="ideas-tag-chip ${!ideasFilter.tag ? 'active' : ''}" data-tag="">全部</button>
      ${tags.map(t => `<button class="ideas-tag-chip ${ideasFilter.tag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
    `;

    container.querySelectorAll('.ideas-tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        ideasFilter.tag = chip.dataset.tag;
        renderIdeas();
      });
    });
  }

  function openIdeaModal(editId) {
    const modal = document.getElementById('idea-modal');
    const titleEl = document.getElementById('idea-modal-title');

    if (editId) {
      const idea = allIdeas.find(i => i.id === editId);
      if (!idea) return;
      editingIdeaId = editId;
      titleEl.textContent = '编辑灵感';
      document.getElementById('idea-textarea').value = idea.content || '';
      ideaTags = [...(idea.tags || [])];
    } else {
      editingIdeaId = null;
      titleEl.textContent = '记录灵感';
      document.getElementById('idea-textarea').value = '';
      ideaTags = [];
    }

    renderIdeaTagChips();
    document.getElementById('idea-tag-input').value = '';
    modal.classList.remove('hidden');
    document.getElementById('idea-textarea').focus();
  }

  function renderIdeaTagChips() {
    const container = document.getElementById('idea-tag-chips');
    container.innerHTML = ideaTags.map((t, i) => `
      <span class="tag-chip">
        ${escapeHtml(t)}
        <span class="tag-chip-remove" data-index="${i}">×</span>
      </span>
    `).join('');

    container.querySelectorAll('.tag-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        ideaTags.splice(parseInt(btn.dataset.index), 1);
        renderIdeaTagChips();
      });
    });
  }

  async function saveIdea() {
    const content = document.getElementById('idea-textarea').value.trim();
    if (!content) {
      showToast('灵感内容不能为空', 'warning');
      return;
    }

    const date = todayStr();
    const record = {
      content,
      tags: [...ideaTags],
      date,
      createdAt: editingIdeaId ? (allIdeas.find(i => i.id === editingIdeaId)?.createdAt || Date.now()) : Date.now(),
      archived: editingIdeaId ? (allIdeas.find(i => i.id === editingIdeaId)?.archived || false) : false,
      transferredTo: editingIdeaId ? (allIdeas.find(i => i.id === editingIdeaId)?.transferredTo || null) : null
    };

    try {
      if (editingIdeaId) {
        record.id = editingIdeaId;
        await Storage.put('ideas', record);
      } else {
        await Storage.add('ideas', record);
      }
      await loadData();
      closeModal('idea-modal');
      renderIdeas();
      showToast(editingIdeaId ? '灵感已更新' : '灵感已记录');
    } catch (e) {
      console.error('[Journal] 保存灵感失败', e);
      showToast('保存失败，请重试', 'error');
    }
  }

  function openIdeaDetail(id) {
    const idea = allIdeas.find(i => i.id === id);
    if (!idea) return;

    const modal = document.getElementById('idea-detail-modal');
    const body = document.getElementById('idea-detail-body');
    const footer = document.getElementById('idea-detail-footer');

    const archived = idea.archived || false;
    const over30 = !archived && isOver30Days(idea.date);

    body.innerHTML = `
      <div class="idea-detail-content">${escapeHtml(idea.content)}</div>
      <div class="idea-detail-meta">
        <span>📅 ${escapeHtml(idea.date)}</span>
        ${archived ? `<span>📦 已转存</span>` : ''}
        ${over30 ? `<span>⏰ 超过30天未转存</span>` : ''}
      </div>
      ${(idea.tags || []).length ? `
        <div class="idea-detail-tags">
          ${idea.tags.map(t => `<span class="idea-card-tag">${escapeHtml(t)}</span>`).join('')}
        </div>` : ''}
    `;

    footer.innerHTML = `
      <div class="idea-detail-actions">
        <button class="btn-secondary" id="idea-detail-edit">编辑</button>
        ${!archived ? `<button class="btn-primary" id="idea-detail-transfer">转存到知识库</button>` : ''}
        <button class="btn-danger" id="idea-detail-delete">删除</button>
      </div>
    `;

    // 绑定按钮事件
    document.getElementById('idea-detail-edit').addEventListener('click', () => {
      closeModal('idea-detail-modal');
      openIdeaModal(id);
    });

    document.getElementById('idea-detail-delete').addEventListener('click', async () => {
      if (confirm('确定删除这条灵感吗？')) {
        await Storage.remove('ideas', id);
        await loadData();
        closeModal('idea-detail-modal');
        renderIdeas();
        showToast('灵感已删除');
      }
    });

    const transferBtn = document.getElementById('idea-detail-transfer');
    if (transferBtn) {
      transferBtn.addEventListener('click', async () => {
        try {
          // 在 knowledge 表创建一条记录
          const knowledgeRecord = {
            title: idea.content.slice(0, 50),
            content: idea.content,
            type: 'note',
            tags: idea.tags || [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            source: 'ideas',
            sourceId: idea.id
          };
          const knowledgeId = await Storage.add('knowledge', knowledgeRecord);

          // 标记灵感已转存
          const updatedIdea = { ...idea, archived: true, transferredTo: knowledgeId };
          await Storage.put('ideas', updatedIdea);

          await loadData();
          closeModal('idea-detail-modal');
          renderIdeas();
          showToast('灵感已转存到知识库');
        } catch (e) {
          console.error('[Journal] 转存失败', e);
          showToast('转存失败，请重试', 'error');
        }
      });
    }

    modal.classList.remove('hidden');
  }

  // ========== Modal 工具 ==========
  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
    editingReviewId = null;
    editingIdeaId = null;
  }

  // ========== 模块导出 ==========

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
    console.log('[JournalModule] 模块已销毁');
  }

  return { init };
})();
