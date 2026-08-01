/**
 * notifications.js - 应用内提醒引擎
 * 人生工作台 · 通知中心
 */

const NotificationEngine = (() => {
  const { escapeHtml } = AppUtils;
  // ===== 常量 =====
  const CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次
  const NOTIFICATION_EXPIRE_DAYS = 7;   // 通知保留7天
  const LS_LAST_CHECK = 'notif_last_check';
  const LS_SENT_PREFIX = 'notif_sent_'; // + type + '_' + date key

  // ===== 状态 =====
  let _intervalId = null;
  let _panelOpen = false;
  let _paused = false;

  // ===== 工具函数 =====


  function formatTimeHM(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function timeToMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function getTodayDay() {
    const jsDay = new Date().getDay();
    return jsDay === 0 ? 0 : jsDay; // 0=周日, 1=周一...6=周六
  }



  // ===== 通知持久化 =====
  async function addNotification(notif) {
    try {
      await Storage.add('notifications', {
        type: notif.type,
        title: notif.title,
        message: notif.message,
        icon: notif.icon || '🔔',
        link: notif.link || '',
        read: false,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[Notif] 保存通知失败:', err);
    }
  }

  async function getUnreadNotifications() {
    try {
      const all = await Storage.getAll('notifications');
      return all.filter(n => !n.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err) {
      console.error('[Notif] 读取通知失败:', err);
      return [];
    }
  }

  async function markAsRead(id) {
    try {
      const notif = await Storage.get('notifications', id);
      if (notif) {
        notif.read = true;
        await Storage.put('notifications', notif);
      }
    } catch (err) {
      console.error('[Notif] 标记已读失败:', err);
    }
  }

  async function markAllAsRead() {
    try {
      const all = await Storage.getAll('notifications');
      for (const n of all) {
        if (!n.read) {
          n.read = true;
          await Storage.put('notifications', n);
        }
      }
    } catch (err) {
      console.error('[Notif] 全部标记已读失败:', err);
    }
  }

  async function clearOldNotifications() {
    try {
      const all = await Storage.getAll('notifications');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - NOTIFICATION_EXPIRE_DAYS);
      const cutoffStr = cutoff.toISOString();
      for (const n of all) {
        if (n.createdAt < cutoffStr) {
          await Storage.remove('notifications', n.id);
        }
      }
    } catch (err) {
      console.error('[Notif] 清理旧通知失败:', err);
    }
  }

  // ===== 防重发机制 =====
  // 用 localStorage 记录已发送的通知标识，避免同一件事重复提醒
  function getSentKey(type, identifier) {
    return LS_SENT_PREFIX + type + '_' + identifier;
  }

  function wasSent(type, identifier) {
    return localStorage.getItem(getSentKey(type, identifier)) === '1';
  }

  function markSent(type, identifier) {
    localStorage.setItem(getSentKey(type, identifier), '1');
  }

  // 清理过期的 sent 标记（每天清理一次，清理非今天/本周的 key）
  function cleanupSentMarkers() {
    const todayStr = formatDate(new Date());
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(LS_SENT_PREFIX)) {
        // 格式: notif_sent_{type}_{date_or_weekkey}
        // 简单策略：如果 key 末尾是日期格式且已过期，则清除
        const parts = key.replace(LS_SENT_PREFIX, '').split('_');
        const lastPart = parts[parts.length - 1];
        if (/^\d{4}-\d{2}-\d{2}$/.test(lastPart) && lastPart < todayStr) {
          localStorage.removeItem(key);
        }
      }
    }
  }

  // ===== 检查器 =====

  /**
   * 1. 习惯打卡提醒：每天 21:00 后检查今天是否已打卡
   */
  async function checkHabitReminder() {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 21) return; // 21:00 前不检查

    const todayStr = formatDate(now);
    const sentId = 'habit_' + todayStr;
    if (wasSent('habit', sentId)) return;

    try {
      const record = await Storage.get('checkins', todayStr);
      const habitCount = (record && record.habits) ? record.habits.length : 0;
      if (habitCount < 12) {
        await addNotification({
          type: 'habit',
          title: '习惯打卡提醒',
          message: `今天还有 ${12 - habitCount} 个习惯未打卡，加油完成吧！`,
          icon: '✅',
          link: '#habits'
        });
        markSent('habit', sentId);
      }
    } catch (err) {
      console.error('[Notif] 检查习惯提醒失败:', err);
    }
  }

  /**
   * 2. 课前提醒：课程开始前15分钟
   */
  async function checkCourseReminder() {
    const now = new Date();
    const todayDay = getTodayDay();
    const nowMins = timeToMinutes(formatTimeHM(now));

    try {
      // 获取所有学期，找到当前活跃的课程
      const semesters = await Storage.getAll('semesters');
      if (semesters.length === 0) return;

      const currentSemesterId = semesters[0].id; // 用最新学期
      const courses = await Storage.getByIndex('courses', 'semesterId', currentSemesterId);

      // 筛选今天的课程
      const todayCourses = courses.filter(c => c.day === todayDay);

      for (const course of todayCourses) {
        const startMins = timeToMinutes(course.startTime);
        const diff = startMins - nowMins;

        // 课前 0-15 分钟内提醒
        if (diff >= 0 && diff <= 15) {
          const todayStr = formatDate(now);
          const sentId = 'course_' + course.id + '_' + todayStr;
          if (wasSent('course', sentId)) continue;

          await addNotification({
            type: 'course',
            title: '课前提醒',
            message: `「${course.name}」${diff === 0 ? '马上开始' : `${diff}分钟后开始`}，做好准备吧！`,
            icon: '📚',
            link: '#study'
          });
          markSent('course', sentId);
        }
      }
    } catch (err) {
      console.error('[Notif] 检查课前提醒失败:', err);
    }
  }

  /**
   * 3. 任务截止提醒：dueDate 当天（如果还没完成）
   */
  async function checkTaskDueReminder() {
    const todayStr = formatDate(new Date());
    const sentId = 'task_' + todayStr;
    if (wasSent('task', sentId)) return;

    try {
      const allTasks = await Storage.getAll('tasks');
      const dueToday = allTasks.filter(t =>
        t.dueDate === todayStr && t.status === 'todo'
      );

      if (dueToday.length > 0) {
        const names = dueToday.slice(0, 3).map(t => t.title).join('、');
        const more = dueToday.length > 3 ? ` 等${dueToday.length}个` : '';
        await addNotification({
          type: 'task',
          title: '任务截止提醒',
          message: `今天有 ${dueToday.length} 个任务到期：${names}${more}`,
          icon: '📋',
          link: '#tasks'
        });
        markSent('task', sentId);
      }
    } catch (err) {
      console.error('[Notif] 检查任务提醒失败:', err);
    }
  }

  /**
   * 4. 生日提醒：联系人当天生日
   */
  async function checkBirthdayReminder() {
    const today = new Date();
    const todayMMDD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayStr = formatDate(today);
    const sentId = 'birthday_' + todayStr;
    if (wasSent('birthday', sentId)) return;

    try {
      const contacts = await Storage.getAll('contacts');
      // birthday 字段可能为 "YYYY-MM-DD" 或 "MM-DD" 格式
      const birthdayContacts = contacts.filter(c => {
        if (!c.birthday) return false;
        const parts = c.birthday.split('-');
        if (parts.length < 3) return c.birthday === todayMMDD;
        const bMM = parts[1].padStart(2, '0');
        const bDD = parts[2].padStart(2, '0');
        return `${bMM}-${bDD}` === todayMMDD;
      });

      if (birthdayContacts.length > 0) {
        const names = birthdayContacts.map(c => c.name).join('、');
        await addNotification({
          type: 'birthday',
          title: '🎂 生日快乐！',
          message: `${names} 今天过生日，别忘了送上祝福～`,
          icon: '🎂',
          link: '#relations'
        });
        markSent('birthday', sentId);
      }
    } catch (err) {
      console.error('[Notif] 检查生日提醒失败:', err);
    }
  }

  /**
   * 5. 预算超支预警：当月支出 > 预算
   */
  async function checkBudgetWarning() {
    const todayStr = formatDate(new Date());
    const sentId = 'budget_' + todayStr;
    if (wasSent('budget', sentId)) return;

    try {
      const budgetSetting = await Storage.get('settings', 'finance_budget');
      if (!budgetSetting || !budgetSetting.value || !budgetSetting.value.monthly) return;

      const monthlyBudget = budgetSetting.value.monthly;
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const allFinance = await Storage.getByIndex('finance', 'month', monthStr);
      const totalExpense = allFinance
        .filter(f => f.type === 'expense')
        .reduce((sum, f) => sum + (f.amount || 0), 0);

      if (totalExpense > monthlyBudget) {
        const pct = Math.round((totalExpense / monthlyBudget) * 100);
        await addNotification({
          type: 'budget',
          title: '⚠️ 预算超支预警',
          message: `本月已支出 ¥${totalExpense}，超过预算 ¥${monthlyBudget}（${pct}%）`,
          icon: '💰',
          link: '#finance'
        });
        markSent('budget', sentId);
      }
    } catch (err) {
      console.error('[Notif] 检查预算预警失败:', err);
    }
  }

  // ===== F7 智能建议引擎 =====

  /**
   * 生成智能建议（纯规则引擎，不调用AI API）
   * 扫描各模块数据，生成模板化建议，存入 notifications 表
   */
  async function generateSmartSuggestions() {
    const todayStr = formatDate(new Date());
    const sentId = 'suggestions_' + todayStr;
    if (wasSent('suggestion', sentId)) return;

    const suggestions = [];

    try {
      // 1. 习惯模块：连续打卡天数
      const allCheckins = await Storage.getAll('checkins');
      if (allCheckins.length > 0) {
        const dateSet = new Set(allCheckins.map(c => c.date).sort().reverse());
        let streak = 0;
        const now = new Date();
        for (let i = 0; i < 365; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (dateSet.has(ds)) { streak++; }
          else { if (i === 0) continue; break; }
        }
        if (streak >= 3) {
          suggestions.push({
            type: 'suggestion',
            title: '💡 习惯洞察',
            message: `你已经连续打卡 ${streak} 天了，继续保持！`,
            icon: '💡',
            link: '#habits'
          });
        }
      }

      // 2. 任务模块：逾期任务
      const allTasks = await Storage.getAll('tasks');
      const overdueTasks = allTasks.filter(t =>
        t.status === 'todo' && t.dueDate && t.dueDate < todayStr
      );
      if (overdueTasks.length > 0) {
        suggestions.push({
          type: 'suggestion',
          title: '💡 任务洞察',
          message: `你有 ${overdueTasks.length} 个任务已逾期，优先处理一下？`,
          icon: '💡',
          link: '#tasks'
        });
      }

      // 3. 健康模块：7天无运动记录
      const allHealth = await Storage.getAll('health');
      let hasRecentExercise = false;
      const now = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const healthRec = allHealth.find(h => h.date === ds || h.id === ds);
        if (healthRec && healthRec.exercises && healthRec.exercises.length > 0) {
          hasRecentExercise = true;
          break;
        }
      }
      if (!hasRecentExercise && allHealth.length > 0) {
        suggestions.push({
          type: 'suggestion',
          title: '💡 健康洞察',
          message: '好久没运动了，今天动一动？',
          icon: '💡',
          link: '#health'
        });
      }

      // 4. 财务模块：本月支出超预算80%
      try {
        const budgetSetting = await Storage.get('settings', 'finance_budget');
        if (budgetSetting && budgetSetting.value && budgetSetting.value.monthly) {
          const monthlyBudget = budgetSetting.value.monthly;
          const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
          const allFinance = await Storage.getByIndex('finance', 'month', monthStr);
          const totalExpense = allFinance
            .filter(f => f.type === 'expense')
            .reduce((sum, f) => sum + (f.amount || 0), 0);
          const pct = totalExpense / monthlyBudget;
          if (pct >= 0.8 && pct < 1) {
            suggestions.push({
              type: 'suggestion',
              title: '💡 财务洞察',
              message: `本月支出已达预算 ${Math.round(pct * 100)}%，注意控制`,
              icon: '💡',
              link: '#finance'
            });
          }
        }
      } catch (e) { /* 无预算设置 */ }

      // 5. 关系模块：超30天未联系
      try {
        const contacts = await Storage.getAll('contacts');
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const cutoffStr = formatDate(thirtyDaysAgo);
        const staleContacts = contacts.filter(c =>
          c.lastContactDate && c.lastContactDate < cutoffStr
        );
        if (staleContacts.length > 0) {
          const names = staleContacts.slice(0, 2).map(c => c.name).join('、');
          suggestions.push({
            type: 'suggestion',
            title: '💡 关系洞察',
            message: `${names} 很久没联系了，打个招呼？`,
            icon: '💡',
            link: '#relations'
          });
        }
      } catch (e) { /* */ }

    } catch (err) {
      console.error('[Notif] 生成智能建议失败:', err);
    }

    // 将建议存入 notifications 表
    for (const s of suggestions) {
      await addNotification(s);
    }

    markSent('suggestion', sentId);
    return suggestions;
  }

  /**
   * 获取今日推荐任务（优先级最高 + 最紧急的3个）
   * 供 dashboard「今日三件事」调用
   */
  async function getTodayTasks() {
    try {
      const allTasks = await Storage.getAll('tasks');
      const todayStr = formatDate(new Date());

      // 筛选未完成任务
      const todoTasks = allTasks.filter(t => t.status === 'todo');

      // 优先级映射（数值越小越优先）
      const priorityOrder = { A: 1, B: 2, C: 3, D: 4, high: 1, medium: 2, low: 3 };

      // 排序：先按优先级，再按截止日期（近的优先），无日期的排后面
      todoTasks.sort((a, b) => {
        const pa = priorityOrder[a.priority] || 5;
        const pb = priorityOrder[b.priority] || 5;
        if (pa !== pb) return pa - pb;
        const da = a.dueDate || '9999-99-99';
        const db = b.dueDate || '9999-99-99';
        return da.localeCompare(db);
      });

      return todoTasks.slice(0, 3);
    } catch (err) {
      console.error('[Notif] 获取今日任务失败:', err);
      return [];
    }
  }

  /**
   * 获取最新建议列表
   * 供 dashboard 调用
   */
  async function getSuggestions() {
    try {
      const all = await Storage.getAll('notifications');
      return all
        .filter(n => n.type === 'suggestion' && !n.read)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10);
    } catch (err) {
      console.error('[Notif] 获取建议失败:', err);
      return [];
    }
  }

  // ===== 主检查流程 =====
  async function runAllChecks() {
    if (_paused) return;
    console.log('[Notif] 执行提醒检查...');
    try {
      await checkHabitReminder();
      await checkCourseReminder();
      await checkTaskDueReminder();
      await checkBirthdayReminder();
      await checkBudgetWarning();
      await generateSmartSuggestions();
      await clearOldNotifications();
      cleanupSentMarkers();
    } catch (err) {
      console.error('[Notif] 检查失败:', err);
    }
    // 更新铃铛角标
    updateBadge();
    // 记录检查时间
    localStorage.setItem(LS_LAST_CHECK, Date.now().toString());
  }

  // ===== UI 更新 =====
  async function updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    const unread = await getUnreadNotifications();
    if (unread.length > 0) {
      badge.textContent = unread.length > 99 ? '99+' : unread.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  async function renderPanel() {
    const listEl = document.getElementById('notif-list');
    const emptyEl = document.getElementById('notif-empty');
    if (!listEl) return;

    const unread = await getUnreadNotifications();

    if (unread.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    listEl.style.display = 'flex';

    // 时间格式化
    function timeAgo(isoStr) {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMins = Math.floor((now - d) / 60000);
      if (diffMins < 1) return '刚刚';
      if (diffMins < 60) return `${diffMins}分钟前`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}小时前`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}天前`;
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    listEl.innerHTML = unread.map(n => {
      const isSuggestion = n.type === 'suggestion';
      return `
      <div class="notif-item${isSuggestion ? ' notif-item-suggestion' : ''}" data-id="${n.id}" data-link="${escapeHtml(n.link)}">
        <span class="notif-item-icon">${isSuggestion ? '💡' : (n.icon || '🔔')}</span>
        <div class="notif-item-content">
          <div class="notif-item-title">${escapeHtml(n.title)}</div>
          <div class="notif-item-msg">${escapeHtml(n.message)}</div>
          <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
        </div>
      </div>
    `}).join('');

    // 绑定点击事件
    listEl.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = parseInt(el.dataset.id);
        const link = el.dataset.link;

        // 标记已读
        await markAsRead(id);
        el.classList.add('read');
        setTimeout(() => el.remove(), 300);

        // 更新角标
        await updateBadge();

        // 跳转
        if (link && link.startsWith('#')) {
          const route = link.substring(1);
          if (typeof Router !== 'undefined' && Router.navigate) {
            Router.navigate(route);
          }
        }

        // 关闭面板
        closePanel();
      });
    });
  }

  function togglePanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;

    if (_panelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    _panelOpen = true;
    panel.classList.add('show');
    renderPanel();
  }

  function closePanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    _panelOpen = false;
    panel.classList.remove('show');
  }

  // ===== 初始化 =====
  async function init() {
    console.log('[Notif] 通知引擎初始化...');

    // 绑定铃铛点击
    const bell = document.getElementById('notif-bell');
    if (bell) {
      bell.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel();
      });
    }

    // 点击其他地方关闭面板
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('notif-panel');
      if (panel && _panelOpen && !panel.contains(e.target) && e.target.id !== 'notif-bell') {
        closePanel();
      }
    });

    // 全部已读按钮
    const markAllBtn = document.getElementById('notif-mark-all');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async () => {
        await markAllAsRead();
        await updateBadge();
        renderPanel();
      });
    }

    // 首次检查（页面加载时）
    await runAllChecks();

    // 每5分钟定时检查
    _intervalId = setInterval(() => {
      runAllChecks();
    }, CHECK_INTERVAL);

    console.log('[Notif] 通知引擎已启动 🔔');
  }

  /**
   * 销毁通知引擎，清理定时器
   */
  function destroy() {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
    console.log('[Notif] 通知引擎已销毁');
  }

  return {
    init,
    destroy,
    updateBadge,
    runAllChecks,
    generateSmartSuggestions,
    getTodayTasks,
    getSuggestions,
    pause: () => { _paused = true; },
    resume: () => { _paused = false; }
  };
})();
