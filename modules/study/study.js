/**
 * study.js - 学习与成长模块逻辑
 * 人生工作台 · 课程表 + 阅读记录 + 技能追踪
 */
const StudyModule = (() => {
  const { escapeHtml } = AppUtils;

  // ===== 常量 =====
  const COURSE_COLORS = 8; // 8种颜色自动分配
  const DAYS = [1, 2, 3, 4, 5, 6, 0]; // 周一~周日(0=周日)
  const DAY_NAMES = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 0: '周日' };

  // 时间轴：07:00 - 23:30，每30分钟一格，共33行
  const TIME_START = 7 * 60;   // 420分 = 07:00
  const TIME_END = 23 * 60 + 30; // 1410分 = 23:30
  const TIME_STEP = 30;         // 每格30分钟
  const CELL_HEIGHT = 36;       // 每格高度(px)

  const BOOK_COVER_COLORS = [
    '#7EBF8E', '#E8A87C', '#8BB8D4', '#B8A0D4', '#E08B8B',
    '#7EBFCF', '#D4A87E', '#8EBF7E', '#C49B7E', '#7E9FBF'
  ];

  // ===== 状态 =====
  let currentTab = 'courses';
  let allSemesters = [];
  let allCourses = [];
  let allBooks = [];
  let allSkills = [];
  let currentSemesterId = null;
  let editingCourseId = null;
  let editingBookId = null;
  let editingSkillId = null;

  // 课程颜色映射（课程ID → 颜色索引）
  let courseColorMap = {};
  let nextColorIndex = 0;

  // ===== 工具函数 =====


  // ===== 时间工具函数 =====
  /** "HH:MM" → 分钟数（如 "08:30" → 510） */
  function timeToMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  /** 分钟数 → "HH:MM"（如 510 → "08:30"） */
  function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** 获取今天是周几（1=周一...6=周六, 0=周日） */
  function getTodayDay() {
    const jsDay = new Date().getDay(); // 0=周日, 1=周一...6=周六
    return jsDay === 0 ? 0 : jsDay;
  }

  function getCourseColor(courseId) {
    if (courseColorMap[courseId] !== undefined) return courseColorMap[courseId];
    courseColorMap[courseId] = nextColorIndex % COURSE_COLORS;
    nextColorIndex++;
    return courseColorMap[courseId];
  }

  // ===== 数据加载 =====
  async function loadData() {
    try {
      allSemesters = await Storage.getAll('semesters');
      allCourses = await Storage.getAll('courses');
      allBooks = await Storage.getAll('books');
      allSkills = await Storage.getAll('skills');
    } catch (err) {
      console.error('[Study] 加载数据失败:', err);
      allSemesters = [];
      allCourses = [];
      allBooks = [];
      allSkills = [];
    }
    // 确定当前学期
    if (allSemesters.length > 0) {
      currentSemesterId = allSemesters[0].id;
    }
  }

  // ===== 渲染所有 =====
  function renderAll() {
    renderSemesterSelect();
    renderTimetable();
    renderBooks();
    renderSkills();
    updateFabForTab();
  }

  // ===== Tab 切换 =====
  function bindTabEvents() {
    const tabs = document.getElementById('study-tabs');
    if (!tabs) return;
    _bindEvent(tabs, 'click', (e) => {
      const tab = e.target.closest('.study-tab');
      if (!tab) return;
      const tabName = tab.dataset.tab;
      if (tabName === currentTab) return;
      currentTab = tabName;
      tabs.querySelectorAll('.study-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.study-panel').forEach((p) => p.classList.remove('active'));
      const panel = document.querySelector(`.study-panel[data-panel="${tabName}"]`);
      if (panel) panel.classList.add('active');
      updateFabForTab();
    });
  }

  function updateFabForTab() {
    const fab = document.getElementById('study-fab');
    if (!fab) return;
    const labels = { courses: '添加课程', books: '添加书籍', skills: '添加技能' };
    fab.title = labels[currentTab] || '+';
    fab.style.display = '';
  }

  // ================================================================
  //  课程表
  // ================================================================

  function renderSemesterSelect() {
    const select = document.getElementById('study-semester-select');
    if (!select) return;
    select.innerHTML = allSemesters.map((s) =>
      `<option value="${s.id}" ${s.id === currentSemesterId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
    ).join('');
    if (allSemesters.length === 0) {
      select.innerHTML = '<option value="">暂无学期</option>';
    }
  }

  function renderTimetable() {
    const body = document.getElementById('study-timetable-body');
    const header = document.getElementById('study-timetable-header');
    if (!body) return;
    body.innerHTML = '';

    const todayDay = getTodayDay();

    // 高亮今天的表头
    if (header) {
      const dayHeaders = header.querySelectorAll('.study-timetable-day');
      dayHeaders.forEach((el, idx) => {
        el.classList.toggle('today-column', DAYS[idx] === todayDay);
      });
    }

    // 筛选当前学期的课程
    const semesterCourses = currentSemesterId
      ? allCourses.filter((c) => c.semesterId === currentSemesterId)
      : [];

    // 重置颜色映射
    courseColorMap = {};
    nextColorIndex = 0;
    semesterCourses.forEach((c) => getCourseColor(c.id));

    // 生成时间行：07:00, 07:30, 08:00, ..., 23:30（共33行）
    for (let mins = TIME_START; mins <= TIME_END; mins += TIME_STEP) {
      const isHour = mins % 60 === 0;
      const timeLabel = minutesToTime(mins);

      const row = document.createElement('div');
      row.className = 'study-timetable-row' + (isHour ? ' is-hour' : '');

      // 时间标签
      const timeEl = document.createElement('div');
      timeEl.className = 'study-timetable-time-label';
      // 只在整点和半点显示，半点用较小字
      if (isHour) {
        timeEl.textContent = timeLabel;
      } else {
        timeEl.textContent = timeLabel;
        timeEl.style.opacity = '0.5';
      }
      row.appendChild(timeEl);

      // 7天的格子
      for (let di = 0; di < DAYS.length; di++) {
        const day = DAYS[di];
        const cell = document.createElement('div');
        cell.className = 'study-timetable-cell';
        if (day === todayDay) {
          cell.classList.add('today-column');
        }
        cell.dataset.day = day;
        cell.dataset.time = timeLabel;

        // 点击空白格添加课程
        const clickArea = document.createElement('div');
        clickArea.className = 'study-cell-click-area';
        _bindEvent(clickArea, 'click', () => {
          showCourseModal(null, day, timeLabel);
        });
        cell.appendChild(clickArea);

        row.appendChild(cell);
      }

      body.appendChild(row);
    }

    // 渲染课程块（绝对定位在对应cell上）
    semesterCourses.forEach((course) => {
      const startMins = timeToMinutes(course.startTime);
      const endMins = timeToMinutes(course.endTime);
      if (startMins >= endMins) return; // 无效时间跳过

      // 课程跨越的起始行和结束行
      const startRow = Math.floor((startMins - TIME_START) / TIME_STEP);
      const endRow = Math.ceil((endMins - TIME_START) / TIME_STEP);

      if (startRow < 0 || endRow <= 0) return; // 超出时间范围

      // 课程所在的day列索引
      const dayIdx = DAYS.indexOf(course.day);
      if (dayIdx === -1) return;

      // 计算top和height（相对于第一行格子）
      const topOffset = (startMins - TIME_START) / TIME_STEP * CELL_HEIGHT;
      const blockHeight = ((endMins - startMins) / TIME_STEP) * CELL_HEIGHT;

      // 找到课程起始行对应的cell
      const rows = body.querySelectorAll('.study-timetable-row');
      const clampedStartRow = Math.max(0, startRow);
      if (clampedStartRow >= rows.length) return;
      const targetRow = rows[clampedStartRow];
      const cells = targetRow.querySelectorAll('.study-timetable-cell');
      const targetCell = cells[dayIdx];
      if (!targetCell) return;

      // 创建课程块
      const colorIdx = getCourseColor(course.id);
      const block = document.createElement('div');
      block.className = `study-course-block study-color-${colorIdx}`;
      block.dataset.courseId = course.id;
      block.style.top = `${topOffset - clampedStartRow * CELL_HEIGHT}px`;
      block.style.height = `${blockHeight - 4}px`; // 4px间距
      block.innerHTML = `
        <span class="study-course-block-name">${escapeHtml(course.name)}</span>
        ${course.room ? `<span class="study-course-block-room">${escapeHtml(course.room)}</span>` : ''}
      `;

      // 点击课程块 → 编辑
      _bindEvent(block, 'click', (e) => {
        e.stopPropagation();
        showCourseModal(parseInt(block.dataset.courseId));
      });

      targetCell.appendChild(block);
    });
  }

  // ===== 学期选择变化 =====
  function bindSemesterEvents() {
    const select = document.getElementById('study-semester-select');
    if (select) {
      _bindEvent(select, 'change', () => {
        currentSemesterId = select.value ? parseInt(select.value) : null;
        renderTimetable();
      });
    }
    const manageBtn = document.getElementById('study-semester-manage-btn');
    _bindEvent(manageBtn, 'click', showSemesterModal);

  }

  // ===== 课程浮层 =====
  function showCourseModal(courseId, day, startTime) {
    const overlay = document.getElementById('study-course-modal-overlay');
    const titleEl = document.getElementById('study-course-modal-title');
    const nameInput = document.getElementById('course-name-input');
    const roomInput = document.getElementById('course-room-input');
    const teacherInput = document.getElementById('course-teacher-input');
    const daySelect = document.getElementById('course-day-select');
    const startTimeInput = document.getElementById('course-start-time-input');
    const endTimeInput = document.getElementById('course-end-time-input');
    const deleteBtn = document.getElementById('study-course-delete');
    if (!overlay) return;

    editingCourseId = courseId;

    if (courseId) {
      // 编辑模式
      const course = allCourses.find((c) => c.id === courseId);
      if (!course) return;
      if (titleEl) titleEl.textContent = '编辑课程';
      if (nameInput) nameInput.value = course.name || '';
      if (roomInput) roomInput.value = course.room || '';
      if (teacherInput) teacherInput.value = course.teacher || '';
      if (daySelect) daySelect.value = String(course.day);
      if (startTimeInput) startTimeInput.value = course.startTime || '08:00';
      if (endTimeInput) endTimeInput.value = course.endTime || '09:30';
      if (deleteBtn) deleteBtn.style.display = '';
    } else {
      // 添加模式
      if (titleEl) titleEl.textContent = '添加课程';
      if (nameInput) nameInput.value = '';
      if (roomInput) roomInput.value = '';
      if (teacherInput) teacherInput.value = '';
      if (daySelect) daySelect.value = day !== undefined ? String(day) : '1';
      if (startTimeInput) startTimeInput.value = startTime || '08:00';
      // 默认结束时间 = 开始时间 + 90分钟
      const defaultEnd = minutesToTime(timeToMinutes(startTime || '08:00') + 90);
      if (endTimeInput) endTimeInput.value = defaultEnd;
      if (deleteBtn) deleteBtn.style.display = 'none';
    }

    overlay.classList.add('show');
    setTimeout(() => nameInput?.focus(), 200);
  }

  function hideCourseModal() {
    const overlay = document.getElementById('study-course-modal-overlay');
    if (overlay) overlay.classList.remove('show');
    editingCourseId = null;
  }

  async function handleSaveCourse() {
    const nameInput = document.getElementById('course-name-input');
    const roomInput = document.getElementById('course-room-input');
    const teacherInput = document.getElementById('course-teacher-input');
    const daySelect = document.getElementById('course-day-select');
    const startTimeInput = document.getElementById('course-start-time-input');
    const endTimeInput = document.getElementById('course-end-time-input');

    const name = nameInput?.value.trim();
    if (!name) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast('请输入课程名称');
      return;
    }

    if (!currentSemesterId) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast('请先创建一个学期');
      return;
    }

    const day = parseInt(daySelect?.value || '1');
    const startTime = startTimeInput?.value || '08:00';
    const endTime = endTimeInput?.value || '09:30';

    // 验证时间
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast('结束时间必须晚于开始时间');
      return;
    }

    // 检查同一时段是否已有其他课程（时间重叠检测）
    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);
    const conflict = allCourses.find((c) => {
      if (c.semesterId !== currentSemesterId || c.day !== day || c.id === editingCourseId) return false;
      const cStart = timeToMinutes(c.startTime);
      const cEnd = timeToMinutes(c.endTime);
      return newStart < cEnd && newEnd > cStart; // 时间重叠
    });
    if (conflict) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast('该时段已有课程');
      return;
    }

    const courseData = {
      name,
      room: roomInput?.value.trim() || '',
      teacher: teacherInput?.value.trim() || '',
      day,
      startTime,
      endTime,
      semesterId: currentSemesterId,
    };

    try {
      const isEdit = !!editingCourseId;
      if (editingCourseId) {
        const course = allCourses.find((c) => c.id === editingCourseId);
        if (course) {
          Object.assign(course, courseData);
          await Storage.put('courses', course);
        }
      } else {
        const id = await Storage.add('courses', courseData);
        courseData.id = id;
        allCourses.push(courseData);
        // EventBus: 学习会话记录（课程新增）
        if (typeof EventBus !== 'undefined') {
          EventBus.emit('study:session', { data: courseData });
        }
      }
      hideCourseModal();
      renderTimetable();
      if (typeof App !== 'undefined' && App.showToast) App.showToast(isEdit ? '已保存 ✅' : '课程已添加 ✅');
    } catch (err) {
      console.error('[Study] 保存课程失败:', err);
    }
  }

  async function handleDeleteCourse() {
    if (!editingCourseId) return;
    try {
      await Storage.remove('courses', editingCourseId);
      allCourses = allCourses.filter((c) => c.id !== editingCourseId);
      hideCourseModal();
      renderTimetable();
      if (typeof App !== 'undefined' && App.showToast) App.showToast('课程已删除');
    } catch (err) {
      console.error('[Study] 删除课程失败:', err);
    }
  }

  // ===== 学期管理浮层 =====
  function showSemesterModal() {
    const overlay = document.getElementById('study-semester-modal-overlay');
    if (!overlay) return;
    renderSemesterList();
    overlay.classList.add('show');
  }

  function hideSemesterModal() {
    const overlay = document.getElementById('study-semester-modal-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  function renderSemesterList() {
    const list = document.getElementById('study-semester-list');
    if (!list) return;
    if (allSemesters.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px;">暂无学期</p>';
      return;
    }
    list.innerHTML = allSemesters.map((s) => `
      <div class="study-semester-list-item ${s.id === currentSemesterId ? 'active' : ''}" data-semester-id="${s.id}">
        <span class="study-semester-list-item-name">${escapeHtml(s.name)}</span>
        <button class="study-semester-list-item-del" data-semester-id="${s.id}" title="删除">✕</button>
      </div>
    `).join('');

    // 点击切换学期
    list.querySelectorAll('.study-semester-list-item').forEach((item) => {
      _bindEvent(item, 'click', (e) => {
        if (e.target.closest('.study-semester-list-item-del')) return;
        currentSemesterId = parseInt(item.dataset.semesterId);
        renderSemesterSelect();
        renderTimetable();
        renderSemesterList();
      });
    });

    // 删除学期
    list.querySelectorAll('.study-semester-list-item-del').forEach((btn) => {
      _bindEvent(btn, 'click', (e) => {
        e.stopPropagation();
        deleteSemester(parseInt(btn.dataset.semesterId));
      });
    });
  }

  async function handleAddSemester() {
    const input = document.getElementById('semester-name-input');
    const name = input?.value.trim();
    if (!name) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast('请输入学期名称');
      return;
    }
    try {
      const id = await Storage.add('semesters', { name });
      allSemesters.push({ id, name });
      if (!currentSemesterId) currentSemesterId = id;
      input.value = '';
      renderSemesterList();
      renderSemesterSelect();
      renderTimetable();
      if (typeof App !== 'undefined' && App.showToast) App.showToast('学期已添加 ✅');
    } catch (err) {
      console.error('[Study] 添加学期失败:', err);
    }
  }

  async function deleteSemester(semesterId) {
    try {
      await Storage.remove('semesters', semesterId);
      // 删除该学期下的所有课程
      const toDelete = allCourses.filter((c) => c.semesterId === semesterId);
      for (const c of toDelete) {
        await Storage.remove('courses', c.id);
      }
      allSemesters = allSemesters.filter((s) => s.id !== semesterId);
      allCourses = allCourses.filter((c) => c.semesterId !== semesterId);
      if (currentSemesterId === semesterId) {
        currentSemesterId = allSemesters.length > 0 ? allSemesters[0].id : null;
      }
      renderSemesterList();
      renderSemesterSelect();
      renderTimetable();
    } catch (err) {
      console.error('[Study] 删除学期失败:', err);
    }
  }

  // ================================================================
  //  阅读记录
  // ================================================================

  function renderBooks() {
    const grid = document.getElementById('study-books-grid');
    const emptyEl = document.getElementById('study-books-empty');
    if (!grid) return;

    // 统计
    const reading = allBooks.filter((b) => b.status === 'reading').length;
    const done = allBooks.filter((b) => b.status === 'done').length;
    const want = allBooks.filter((b) => b.status === 'want').length;

    const readingEl = document.getElementById('study-books-reading');
    const doneEl = document.getElementById('study-books-done');
    const wantEl = document.getElementById('study-books-want');
    if (readingEl) readingEl.textContent = reading;
    if (doneEl) doneEl.textContent = done;
    if (wantEl) wantEl.textContent = want;

    if (allBooks.length === 0) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    grid.innerHTML = allBooks.map((book, idx) => {
      const color = BOOK_COVER_COLORS[idx % BOOK_COVER_COLORS.length];
      const statusLabels = { reading: '在读', done: '已读', want: '想读' };
      return `
        <div class="study-book-card" data-book-id="${book.id}">
          <div class="study-book-cover" style="background:${color}">
            📖
            <span class="study-book-status-tag ${book.status}">${statusLabels[book.status] || '在读'}</span>
          </div>
          <div class="study-book-info">
            <div class="study-book-title">${escapeHtml(book.title)}</div>
            <div class="study-book-author">${escapeHtml(book.author)}</div>
            <div class="study-book-progress">
              <div class="study-book-progress-bar">
                <div class="study-book-progress-fill" style="width:${book.progress || 0}%"></div>
              </div>
              <div class="study-book-progress-text">${book.progress || 0}%</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 点击书籍卡片 → 编辑
    grid.querySelectorAll('.study-book-card').forEach((card) => {
      _bindEvent(card, 'click', () => {
        showBookModal(parseInt(card.dataset.bookId));
      });
    });
  }

  // ===== 书籍浮层 =====
  function showBookModal(bookId) {
    const overlay = document.getElementById('study-book-modal-overlay');
    const titleEl = document.getElementById('study-book-modal-title');
    const titleInput = document.getElementById('book-title-input');
    const authorInput = document.getElementById('book-author-input');
    const progressInput = document.getElementById('book-progress-input');
    const progressLabel = document.getElementById('book-progress-label');
    const noteInput = document.getElementById('book-note-input');
    const deleteBtn = document.getElementById('study-book-delete');
    if (!overlay) return;

    editingBookId = bookId;

    if (bookId) {
      const book = allBooks.find((b) => b.id === bookId);
      if (!book) return;
      if (titleEl) titleEl.textContent = '编辑书籍';
      if (titleInput) titleInput.value = book.title || '';
      if (authorInput) authorInput.value = book.author || '';
      if (progressInput) progressInput.value = book.progress || 0;
      if (progressLabel) progressLabel.textContent = book.progress || 0;
      if (noteInput) noteInput.value = book.note || '';
      if (deleteBtn) deleteBtn.style.display = '';
      setActiveBookStatus(book.status || 'reading');
    } else {
      if (titleEl) titleEl.textContent = '添加书籍';
      if (titleInput) titleInput.value = '';
      if (authorInput) authorInput.value = '';
      if (progressInput) progressInput.value = 0;
      if (progressLabel) progressLabel.textContent = 0;
      if (noteInput) noteInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
      setActiveBookStatus('reading');
    }

    overlay.classList.add('show');
    setTimeout(() => titleInput?.focus(), 200);
  }

  function hideBookModal() {
    const overlay = document.getElementById('study-book-modal-overlay');
    if (overlay) overlay.classList.remove('show');
    editingBookId = null;
  }

  function setActiveBookStatus(status) {
    const picker = document.getElementById('book-status-picker');
    if (!picker) return;
    picker.querySelectorAll('.study-status-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.status === status);
    });
  }

  function getActiveBookStatus() {
    const picker = document.getElementById('book-status-picker');
    if (!picker) return 'reading';
    const active = picker.querySelector('.study-status-btn.active');
    return active ? active.dataset.status : 'reading';
  }

  async function handleSaveBook() {
    const titleInput = document.getElementById('book-title-input');
    const authorInput = document.getElementById('book-author-input');
    const progressInput = document.getElementById('book-progress-input');
    const noteInput = document.getElementById('book-note-input');

    const title = titleInput?.value.trim();
    if (!title) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast('请输入书名');
      return;
    }

    const bookData = {
      title,
      author: authorInput?.value.trim() || '',
      status: getActiveBookStatus(),
      progress: parseInt(progressInput?.value || '0'),
      note: noteInput?.value.trim() || '',
    };

    // 状态为已读时自动设进度100%
    if (bookData.status === 'done') bookData.progress = 100;

    try {
      const isEdit = !!editingBookId;
      if (editingBookId) {
        const book = allBooks.find((b) => b.id === editingBookId);
        if (book) {
          Object.assign(book, bookData);
          await Storage.put('books', book);
        }
      } else {
        const id = await Storage.add('books', bookData);
        bookData.id = id;
        allBooks.push(bookData);
        // EventBus: 学习会话记录（书籍新增）
        if (typeof EventBus !== 'undefined') {
          EventBus.emit('study:session', { data: bookData });
        }
      }
      hideBookModal();
      renderBooks();
      if (typeof App !== 'undefined' && App.showToast) App.showToast(isEdit ? '已保存 ✅' : '书籍已添加 ✅');
    } catch (err) {
      console.error('[Study] 保存书籍失败:', err);
    }
  }

  async function handleDeleteBook() {
    if (!editingBookId) return;
    try {
      await Storage.remove('books', editingBookId);
      allBooks = allBooks.filter((b) => b.id !== editingBookId);
      hideBookModal();
      renderBooks();
      if (typeof App !== 'undefined' && App.showToast) App.showToast('书籍已删除');
    } catch (err) {
      console.error('[Study] 删除书籍失败:', err);
    }
  }

  // ================================================================
  //  技能追踪
  // ================================================================

  function renderSkills() {
    const grid = document.getElementById('study-skills-grid');
    const emptyEl = document.getElementById('study-skills-empty');
    if (!grid) return;

    if (allSkills.length === 0) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    grid.innerHTML = allSkills.map((skill) => {
      const level = skill.level || 1;
      const filled = '★'.repeat(level);
      const empty = '☆'.repeat(5 - level);
      return `
        <div class="study-skill-card" data-skill-id="${skill.id}">
          <div class="study-skill-card-header">
            <span class="study-skill-name">${escapeHtml(skill.name)}</span>
            <span class="study-skill-stars">
              <span>${filled}</span><span class="star-empty">${empty}</span>
            </span>
          </div>
          <div class="study-skill-progress">
            <div class="study-skill-progress-bar">
              <div class="study-skill-progress-fill" style="width:${skill.progress || 0}%"></div>
            </div>
            <div class="study-skill-progress-text">${skill.progress || 0}%</div>
          </div>
        </div>
      `;
    }).join('');

    // 点击技能卡片 → 编辑
    grid.querySelectorAll('.study-skill-card').forEach((card) => {
      _bindEvent(card, 'click', () => {
        showSkillModal(parseInt(card.dataset.skillId));
      });
    });
  }

  // ===== 技能浮层 =====
  function showSkillModal(skillId) {
    const overlay = document.getElementById('study-skill-modal-overlay');
    const titleEl = document.getElementById('study-skill-modal-title');
    const nameInput = document.getElementById('skill-name-input');
    const progressInput = document.getElementById('skill-progress-input');
    const progressLabel = document.getElementById('skill-progress-label');
    const noteInput = document.getElementById('skill-note-input');
    const deleteBtn = document.getElementById('study-skill-delete');
    if (!overlay) return;

    editingSkillId = skillId;

    if (skillId) {
      const skill = allSkills.find((s) => s.id === skillId);
      if (!skill) return;
      if (titleEl) titleEl.textContent = '编辑技能';
      if (nameInput) nameInput.value = skill.name || '';
      if (progressInput) progressInput.value = skill.progress || 0;
      if (progressLabel) progressLabel.textContent = skill.progress || 0;
      if (noteInput) noteInput.value = skill.note || '';
      if (deleteBtn) deleteBtn.style.display = '';
      setActiveSkillLevel(skill.level || 1);
    } else {
      if (titleEl) titleEl.textContent = '添加技能';
      if (nameInput) nameInput.value = '';
      if (progressInput) progressInput.value = 0;
      if (progressLabel) progressLabel.textContent = 0;
      if (noteInput) noteInput.value = '';
      if (deleteBtn) deleteBtn.style.display = 'none';
      setActiveSkillLevel(4);
    }

    overlay.classList.add('show');
    setTimeout(() => nameInput?.focus(), 200);
  }

  function hideSkillModal() {
    const overlay = document.getElementById('study-skill-modal-overlay');
    if (overlay) overlay.classList.remove('show');
    editingSkillId = null;
  }

  function setActiveSkillLevel(level) {
    const picker = document.getElementById('skill-level-picker');
    if (!picker) return;
    picker.querySelectorAll('.study-star-btn').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.level) === level);
    });
  }

  function getActiveSkillLevel() {
    const picker = document.getElementById('skill-level-picker');
    if (!picker) return 4;
    const active = picker.querySelector('.study-star-btn.active');
    return active ? parseInt(active.dataset.level) : 4;
  }

  async function handleSaveSkill() {
    const nameInput = document.getElementById('skill-name-input');
    const progressInput = document.getElementById('skill-progress-input');
    const noteInput = document.getElementById('skill-note-input');

    const name = nameInput?.value.trim();
    if (!name) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast('请输入技能名称');
      return;
    }

    const skillData = {
      name,
      level: getActiveSkillLevel(),
      progress: parseInt(progressInput?.value || '0'),
      note: noteInput?.value.trim() || '',
    };

    try {
      const isEdit = !!editingSkillId;
      if (editingSkillId) {
        const skill = allSkills.find((s) => s.id === editingSkillId);
        if (skill) {
          Object.assign(skill, skillData);
          await Storage.put('skills', skill);
        }
      } else {
        const id = await Storage.add('skills', skillData);
        skillData.id = id;
        allSkills.push(skillData);
        // EventBus: 学习会话记录（技能新增）
        if (typeof EventBus !== 'undefined') {
          EventBus.emit('study:session', { data: skillData });
        }
      }
      hideSkillModal();
      renderSkills();
      if (typeof App !== 'undefined' && App.showToast) App.showToast(isEdit ? '已保存 ✅' : '技能已添加 ✅');
    } catch (err) {
      console.error('[Study] 保存技能失败:', err);
    }
  }

  async function handleDeleteSkill() {
    if (!editingSkillId) return;
    try {
      await Storage.remove('skills', editingSkillId);
      allSkills = allSkills.filter((s) => s.id !== editingSkillId);
      hideSkillModal();
      renderSkills();
      if (typeof App !== 'undefined' && App.showToast) App.showToast('技能已删除');
    } catch (err) {
      console.error('[Study] 删除技能失败:', err);
    }
  }

  // ================================================================
  //  FAB & 事件绑定
  // ================================================================

  function bindFabEvents() {
    const fab = document.getElementById('study-fab');
    if (!fab) return;
    _bindEvent(fab, 'click', () => {
      if (currentTab === 'courses') {
        if (!currentSemesterId) {
          if (typeof App !== 'undefined' && App.showToast) App.showToast('请先创建一个学期');
          return;
        }
        showCourseModal(null);
      } else if (currentTab === 'books') {
        showBookModal(null);
      } else if (currentTab === 'skills') {
        showSkillModal(null);
      }
    });
  }

  function bindModalEvents() {
    // 课程浮层
    _bindEvent(document.getElementById('study-course-modal-close'), 'click', hideCourseModal);
    _bindEvent(document.getElementById('study-course-cancel'), 'click', hideCourseModal);
    _bindEvent(document.getElementById('study-course-modal-overlay'), 'click', (e) => {
      if (e.target.id === 'study-course-modal-overlay') hideCourseModal();
    });
    _bindEvent(document.getElementById('study-course-confirm'), 'click', handleSaveCourse);
    _bindEvent(document.getElementById('study-course-delete'), 'click', handleDeleteCourse);

    // 学期管理浮层
    _bindEvent(document.getElementById('study-semester-modal-close'), 'click', hideSemesterModal);
    _bindEvent(document.getElementById('study-semester-modal-overlay'), 'click', (e) => {
      if (e.target.id === 'study-semester-modal-overlay') hideSemesterModal();
    });
    _bindEvent(document.getElementById('semester-add-btn'), 'click', handleAddSemester);

    // 书籍浮层
    _bindEvent(document.getElementById('study-book-modal-close'), 'click', hideBookModal);
    _bindEvent(document.getElementById('study-book-cancel'), 'click', hideBookModal);
    _bindEvent(document.getElementById('study-book-modal-overlay'), 'click', (e) => {
      if (e.target.id === 'study-book-modal-overlay') hideBookModal();
    });
    _bindEvent(document.getElementById('study-book-confirm'), 'click', handleSaveBook);
    _bindEvent(document.getElementById('study-book-delete'), 'click', handleDeleteBook);

    // 书籍状态选择
    _bindEvent(document.getElementById('book-status-picker'), 'click', (e) => {
      const btn = e.target.closest('.study-status-btn');
      if (btn) setActiveBookStatus(btn.dataset.status);
    });

    // 书籍进度滑块
    _bindEvent(document.getElementById('book-progress-input'), 'input', (e) => {
      const label = document.getElementById('book-progress-label');
      if (label) label.textContent = e.target.value;
    });

    // 技能浮层
    _bindEvent(document.getElementById('study-skill-modal-close'), 'click', hideSkillModal);
    _bindEvent(document.getElementById('study-skill-cancel'), 'click', hideSkillModal);
    _bindEvent(document.getElementById('study-skill-modal-overlay'), 'click', (e) => {
      if (e.target.id === 'study-skill-modal-overlay') hideSkillModal();
    });
    _bindEvent(document.getElementById('study-skill-confirm'), 'click', handleSaveSkill);
    _bindEvent(document.getElementById('study-skill-delete'), 'click', handleDeleteSkill);

    // 技能星星选择
    _bindEvent(document.getElementById('skill-level-picker'), 'click', (e) => {
      const btn = e.target.closest('.study-star-btn');
      if (btn) setActiveSkillLevel(parseInt(btn.dataset.level));
    });

    // 技能进度滑块
    _bindEvent(document.getElementById('skill-progress-input'), 'input', (e) => {
      const label = document.getElementById('skill-progress-label');
      if (label) label.textContent = e.target.value;
    });
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Study] 学习模块初始化...');
    bindTabEvents();
    bindSemesterEvents();
    bindFabEvents();
    bindModalEvents();
    await loadData();
    renderAll();
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
    console.log('[StudyModule] 模块已销毁');
  }

  return { init, destroy };
})();
