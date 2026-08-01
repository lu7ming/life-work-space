/**
 * 记录与反思模块 - journal.js
 * 三个子Tab：日记、情绪日历、复盘、灵感速记
 */
const JournalModule = (() => {
  const { escapeHtml, formatDate } = AppUtils;

  // ========== 情绪配置 ==========
  const MOOD_CONFIG = {
    '😄': { label: '开心', score: 5, color: '#4CAF50' },
    '😊': { label: '不错', score: 4, color: '#8BC34A' },
    '😐': { label: '一般', score: 3, color: '#FFC107' },
    '😔': { label: '低落', score: 2, color: '#FF9800' },
    '😢': { label: '难过', score: 1, color: '#F44336' },
  };
  const NO_MOOD_COLOR = '#D5D0CB';

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

  // 情绪日历的年月
  let moodCalYear, moodCalMonth;

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

  // 获取日记的情绪信息（兼容旧数据）
  function getDiaryMoodInfo(diary) {
    if (!diary.mood || !MOOD_CONFIG[diary.mood]) {
      return { mood: null, score: null, color: NO_MOOD_COLOR, label: '' };
    }
    const cfg = MOOD_CONFIG[diary.mood];
    return {
      mood: diary.mood,
      score: diary.mood_score ?? cfg.score, // 兼容旧数据
      color: cfg.color,
      label: cfg.label,
    };
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
    moodCalYear = now.getFullYear();
    moodCalMonth = now.getMonth();
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

    // 情绪日历导航
    document.getElementById('mood-cal-prev').addEventListener('click', () => {
      moodCalMonth--;
      if (moodCalMonth < 0) { moodCalMonth = 11; moodCalYear--; }
      renderMoodCalendar();
    });
    document.getElementById('mood-cal-next').addEventListener('click', () => {
      moodCalMonth++;
      if (moodCalMonth > 11) { moodCalMonth = 0; moodCalYear++; }
      renderMoodCalendar();
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

    // 心情选择（新的5个emoji按钮）
    document.querySelectorAll('#diary-mood-picker .mood-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        document.querySelectorAll('#diary-mood-picker .mood-btn').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
          btn.classList.add('selected');
          // 显示情绪备注输入框
          document.getElementById('mood-note-wrap').classList.remove('hidden');
        } else {
          // 取消选中，隐藏备注
          document.getElementById('mood-note-wrap').classList.add('hidden');
          document.getElementById('mood-note-input').value = '';
        }
      });
    });

    // 情绪日历 - 查看某天日记详情关闭
    document.getElementById('mood-day-detail-close').addEventListener('click', () => {
      document.getElementById('mood-day-detail').classList.add('hidden');
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
      case 'mood': renderMoodCalendar(); break;
      case 'review': renderReviews(); break;
      case 'ideas': renderIdeas(); break;
    }
  }

  // ========== FAB ==========
  function handleFab() {
    switch (currentTab) {
      case 'diary': openDiaryEditor(selectedDate || todayStr()); break;
      case 'mood': openDiaryEditor(todayStr()); break;
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

    container.innerHTML = diaries.map(d => {
      const moodInfo = getDiaryMoodInfo(d);
      return `
      <div class="diary-card" data-id="${d.id}">
        <div class="diary-card-header">
          <span class="diary-card-date">${formatDate(d.date)}</span>
          ${moodInfo.mood ? `<span class="diary-card-mood" title="${moodInfo.label}">${moodInfo.mood}</span>` : ''}
        </div>
        ${d.mood_note ? `<div class="diary-card-mood-note">${escapeHtml(d.mood_note)}</div>` : ''}
        <div class="diary-card-content">${escapeHtml(d.content)}</div>
        <div class="diary-card-actions">
          <button class="btn-edit" data-action="edit" data-id="${d.id}">编辑</button>
          <button class="btn-delete" data-action="delete" data-id="${d.id}">删除</button>
        </div>
      </div>`;
    }).join('');

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
    document.querySelectorAll('#diary-mood-picker .mood-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('mood-note-wrap').classList.add('hidden');
    document.getElementById('mood-note-input').value = '';

    if (editId) {
      // 编辑模式
      const diary = allDiaries.find(d => d.id === editId);
      if (!diary) return;
      editingDiaryId = editId;
      document.getElementById('diary-editor-date').textContent = formatDate(diary.date);
      document.getElementById('diary-textarea').value = diary.content || '';
      // 恢复情绪选中状态
      if (diary.mood && MOOD_CONFIG[diary.mood]) {
        const moodBtn = document.querySelector(`#diary-mood-picker .mood-btn[data-mood="${diary.mood}"]`);
        if (moodBtn) moodBtn.classList.add('selected');
        // 显示情绪备注
        document.getElementById('mood-note-wrap').classList.remove('hidden');
        document.getElementById('mood-note-input').value = diary.mood_note || '';
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

    const moodBtn = document.querySelector('#diary-mood-picker .mood-btn.selected');
    const mood = moodBtn ? moodBtn.dataset.mood : '';
    const moodScore = moodBtn ? parseInt(moodBtn.dataset.moodScore) : null;
    const moodNote = moodBtn ? document.getElementById('mood-note-input').value.trim() : '';
    const date = editingDiaryId ? (allDiaries.find(d => d.id === editingDiaryId)?.date || selectedDate) : selectedDate;

    const record = {
      type: 'diary',
      subtype: '',
      content,
      mood,
      mood_score: moodScore,
      mood_note: moodNote,
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

  // ========== 情绪日历模块 ==========
  function renderMoodCalendar() {
    renderMoodTrends();
    renderMoodCalendarGrid();
    renderMoodMonthStats();
  }

  function renderMoodCalendarGrid() {
    const title = document.getElementById('mood-cal-title');
    title.textContent = `${moodCalYear}年${moodCalMonth + 1}月`;

    const daysEl = document.getElementById('mood-cal-days');
    daysEl.innerHTML = '';

    const firstDay = new Date(moodCalYear, moodCalMonth, 1);
    let startDay = firstDay.getDay() - 1; // 周一起始
    if (startDay < 0) startDay = 6;

    const daysInMonth = new Date(moodCalYear, moodCalMonth + 1, 0).getDate();
    const today = todayStr();

    // 建一个日期->最新日记（含情绪）映射
    const diaryByDate = {};
    allDiaries.forEach(d => {
      if (!diaryByDate[d.date] || d.updatedAt > diaryByDate[d.date].updatedAt) {
        diaryByDate[d.date] = d;
      }
    });

    // 空白填充
    for (let i = 0; i < startDay; i++) {
      const el = document.createElement('div');
      el.className = 'mood-cal-day empty';
      daysEl.appendChild(el);
    }

    // 日期
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${moodCalYear}-${String(moodCalMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const diary = diaryByDate[dateStr];
      const moodInfo = diary ? getDiaryMoodInfo(diary) : null;

      const el = document.createElement('div');
      el.className = 'mood-cal-day';
      el.dataset.date = dateStr;

      // 日期数字
      const numSpan = document.createElement('span');
      numSpan.className = 'mood-cal-day-num';
      numSpan.textContent = day;
      el.appendChild(numSpan);

      // 情绪emoji（如果有）
      if (moodInfo && moodInfo.mood) {
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'mood-cal-day-emoji';
        emojiSpan.textContent = moodInfo.mood;
        el.appendChild(emojiSpan);
        el.style.backgroundColor = moodInfo.color + '33'; // 20% opacity
        el.style.borderBottom = `3px solid ${moodInfo.color}`;
        el.classList.add('has-mood');
      } else {
        el.style.backgroundColor = NO_MOOD_COLOR + '22';
      }

      if (dateStr === today) el.classList.add('today');

      el.addEventListener('click', () => {
        showMoodDayDetail(dateStr);
      });

      daysEl.appendChild(el);
    }
  }

  function showMoodDayDetail(dateStr) {
    const detail = document.getElementById('mood-day-detail');
    const dateLabel = document.getElementById('mood-day-detail-date');
    const list = document.getElementById('mood-day-detail-list');

    dateLabel.textContent = formatDate(dateStr);

    const dayDiaries = allDiaries.filter(d => d.date === dateStr).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (dayDiaries.length === 0) {
      list.innerHTML = `
        <div class="mood-day-empty">
          <span>这天没有日记记录</span>
          <button class="mood-day-add-btn" data-date="${dateStr}">写一篇</button>
        </div>`;
    } else {
      list.innerHTML = dayDiaries.map(d => {
        const moodInfo = getDiaryMoodInfo(d);
        return `
        <div class="mood-day-diary-item" data-id="${d.id}">
          <div class="mood-day-diary-mood">
            ${moodInfo.mood ? `<span class="mood-day-emoji" title="${moodInfo.label}">${moodInfo.mood}</span>` : ''}
            ${d.mood_note ? `<span class="mood-day-note">${escapeHtml(d.mood_note)}</span>` : ''}
          </div>
          <div class="mood-day-diary-content">${escapeHtml(d.content).slice(0, 150)}${d.content.length > 150 ? '...' : ''}</div>
        </div>`;
      }).join('');
    }

    detail.classList.remove('hidden');

    // 绑定：写日记按钮
    const addBtn = list.querySelector('.mood-day-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        // 切换到日记tab并打开编辑器
        switchTab('diary');
        selectedDate = dateStr;
        openDiaryEditor(dateStr);
      });
    }

    // 绑定：点击日记条目跳转编辑
    list.querySelectorAll('.mood-day-diary-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id);
        switchTab('diary');
        selectedDate = dateStr;
        openDiaryEditor(null, id);
      });
    });
  }

  function renderMoodTrends() {
    const container = document.getElementById('mood-trends');
    const today = new Date();
    const todayStrVal = todayStr();

    // 计算最近7天的平均情绪分数
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      last7Days.push(daysAgoStr(i));
    }

    let totalScore = 0;
    let scoreCount = 0;
    const dailyScores = {};

    last7Days.forEach(dateStr => {
      const dayDiaries = allDiaries.filter(d => d.date === dateStr);
      // 取当天最新日记的情绪
      if (dayDiaries.length > 0) {
        const latest = dayDiaries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
        const info = getDiaryMoodInfo(latest);
        if (info.score !== null) {
          totalScore += info.score;
          scoreCount++;
          dailyScores[dateStr] = info.score;
        }
      }
    });

    const avgScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : '--';

    // 连续X天情绪>=3
    let streak = 0;
    for (let i = 0; i < 90; i++) { // 最多往前看90天
      const dateStr = daysAgoStr(i);
      const dayDiaries = allDiaries.filter(d => d.date === dateStr);
      if (dayDiaries.length === 0) break;
      const latest = dayDiaries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      const info = getDiaryMoodInfo(latest);
      if (info.score !== null && info.score >= 3) {
        streak++;
      } else {
        break;
      }
    }

    // 温暖提示
    let warmTip = '';
    if (scoreCount > 0 && (totalScore / scoreCount) < 2.5) {
      warmTip = `<div class="mood-warm-tip">💛 最近辛苦了，要不要听听音乐放松一下？</div>`;
    }

    // 7天情绪条形图
    let barChart = '<div class="mood-bar-chart">';
    last7Days.forEach((dateStr, idx) => {
      const score = dailyScores[dateStr] || 0;
      const d = new Date(dateStr + 'T00:00:00');
      const weekday = ['日','一','二','三','四','五','六'][d.getDay()];
      const color = score > 0 ? getMoodColorByScore(score) : '#D5D0CB';
      const height = score > 0 ? (score / 5 * 100) : 10;
      barChart += `
        <div class="mood-bar-col">
          <div class="mood-bar-track">
            <div class="mood-bar-fill" style="height:${height}%;background:${color}"></div>
          </div>
          <span class="mood-bar-label">${weekday}</span>
        </div>`;
    });
    barChart += '</div>';

    container.innerHTML = `
      <div class="mood-trends-stats">
        <div class="mood-stat-card">
          <div class="mood-stat-value">${avgScore}</div>
          <div class="mood-stat-label">本周均分</div>
        </div>
        <div class="mood-stat-card">
          <div class="mood-stat-value">${streak}</div>
          <div class="mood-stat-label">连续不错天数</div>
        </div>
      </div>
      ${barChart}
      ${warmTip}
    `;
  }

  function getMoodColorByScore(score) {
    if (score >= 5) return '#4CAF50';
    if (score >= 4) return '#8BC34A';
    if (score >= 3) return '#FFC107';
    if (score >= 2) return '#FF9800';
    return '#F44336';
  }

  function renderMoodMonthStats() {
    const container = document.getElementById('mood-month-stats');
    const monthPrefix = `${moodCalYear}-${String(moodCalMonth+1).padStart(2,'0')}`;

    // 统计本月各情绪天数
    const moodCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalDaysWithMood = 0;
    const seenDates = new Set();

    allDiaries.forEach(d => {
      if (d.date && d.date.startsWith(monthPrefix) && !seenDates.has(d.date)) {
        const info = getDiaryMoodInfo(d);
        if (info.score !== null) {
          moodCounts[info.score] = (moodCounts[info.score] || 0) + 1;
          totalDaysWithMood++;
          seenDates.add(d.date);
        }
      }
    });

    if (totalDaysWithMood === 0) {
      container.innerHTML = '<div class="mood-month-empty">本月暂无情绪记录</div>';
      return;
    }

    const moodLabels = { 5: '😄开心', 4: '😊不错', 3: '😐一般', 2: '😔低落', 1: '😢难过' };
    const moodColors = { 5: '#4CAF50', 4: '#8BC34A', 3: '#FFC107', 2: '#FF9800', 1: '#F44336' };

    let html = '<div class="mood-month-bars">';
    for (let score = 5; score >= 1; score--) {
      const pct = ((moodCounts[score] / totalDaysWithMood) * 100).toFixed(0);
      html += `
        <div class="mood-month-bar-row">
          <span class="mood-month-bar-label">${moodLabels[score]}</span>
          <div class="mood-month-bar-track">
            <div class="mood-month-bar-fill" style="width:${pct}%;background:${moodColors[score]}"></div>
          </div>
          <span class="mood-month-bar-pct">${pct}%</span>
        </div>`;
    }
    html += '</div>';

    container.innerHTML = html;
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
