/**
 * notifications.js - 应用内提醒引擎
 * 人生工作台 · 通知中心
 */

const NotificationEngine = (() => {
  // ===== 常量 =====
  const CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次
  const NOTIFICATION_EXPIRE_DAYS = 7;   // 通知保留7天
  const LS_LAST_CHECK = 'notif_last_check';
  const LS_SENT_PREFIX = 'notif_sent_'; // + type + '_' + date key

  // ===== 状态 =====
  let _intervalId = null;
  let _panelOpen = false;

  // ===== 工具函数 =====
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
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
      const birthdayContacts = contacts.filter(c => c.birthday === todayMMDD);

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

  // ===== 主检查流程 =====
  async function runAllChecks() {
    console.log('[Notif] 执行提醒检查...');
    try {
      await checkHabitReminder();
      await checkCourseReminder();
      await checkTaskDueReminder();
      await checkBirthdayReminder();
      await checkBudgetWarning();
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

    listEl.innerHTML = unread.map(n => `
      <div class="notif-item" data-id="${n.id}" data-link="${escapeHtml(n.link)}">
        <span class="notif-item-icon">${n.icon || '🔔'}</span>
        <div class="notif-item-content">
          <div class="notif-item-title">${escapeHtml(n.title)}</div>
          <div class="notif-item-msg">${escapeHtml(n.message)}</div>
          <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
        </div>
      </div>
    `).join('');

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

  return {
    init,
    updateBadge,
    runAllChecks
  };
})();
