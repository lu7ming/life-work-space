/**
 * smart-reminder.js - 主动提醒引擎
 * 人生工作台 · SmartReminder
 * 
 * 两层提醒架构：
 * 1. 规则层：固定时间点触发（早安/午餐/晚间/睡觉）
 * 2. 智能层：基于数据动态判断（消费异常/任务积压/习惯断签/周末总结）
 * 
 * 与 notifications.js 集成：提醒触发时调用 NotificationEngine 展示通知
 */

const SmartReminder = (() => {
  // ===== 常量 =====
  const CHECK_INTERVAL = 60 * 1000; // 每分钟检查一次
  const LS_PREFIX = 'sr_sent_';     // 防重发标记前缀

  // 规则层提醒定义（时间 → 提醒内容）
  const RULE_REMINDERS = [
    {
      id: 'morning',
      hour: 9, minute: 0,
      title: '🌅 早安习惯提醒',
      message: '新的一天开始了！完成早间习惯，元气满满～',
      icon: '🌅',
      link: '#habits'
    },
    {
      id: 'lunch',
      hour: 12, minute: 0,
      title: '🍱 午餐提醒',
      message: '该吃午饭啦！好好吃饭才能好好加油 💪',
      icon: '🍱',
      link: ''
    },
    {
      id: 'evening',
      hour: 21, minute: 0,
      title: '✅ 晚间习惯打卡提醒',
      message: '晚上好！别忘了完成今天的习惯打卡哦～',
      icon: '✅',
      link: '#habits'
    },
    {
      id: 'sleep',
      hour: 22, minute: 30,
      title: '🌙 睡觉提醒',
      message: '该准备休息了，早睡早起身体好！明天见 🌟',
      icon: '🌙',
      link: ''
    }
  ];

  // ===== 状态 =====
  let _intervalId = null;

  // ===== 工具函数 =====

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 获取防重发 key
   */
  function getSentKey(reminderId, dateStr) {
    return LS_PREFIX + reminderId + '_' + dateStr;
  }

  /**
   * 检查今天是否已发送过该提醒
   */
  function wasSentToday(reminderId) {
    const key = getSentKey(reminderId, formatDate(new Date()));
    return localStorage.getItem(key) === '1';
  }

  /**
   * 标记今天已发送
   */
  function markSentToday(reminderId) {
    const key = getSentKey(reminderId, formatDate(new Date()));
    localStorage.setItem(key, '1');
  }

  /**
   * 清理过期的防重发标记
   */
  function cleanupSentMarkers() {
    const todayStr = formatDate(new Date());
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(LS_PREFIX)) {
        // 格式: sr_sent_{id}_{YYYY-MM-DD}
        const parts = key.replace(LS_PREFIX, '').split('_');
        const lastPart = parts[parts.length - 1];
        if (/^\d{4}-\d{2}-\d{2}$/.test(lastPart) && lastPart < todayStr) {
          localStorage.removeItem(key);
        }
      }
    }
  }

  /**
   * 发送通知（复用 NotificationEngine）
   */
  async function sendNotification(notif) {
    try {
      if (typeof NotificationEngine !== 'undefined') {
        // 通过 NotificationEngine 的内部 addNotification 发送
        // 由于 addNotification 不是公开方法，直接操作 Storage
        await Storage.add('notifications', {
          type: notif.type || 'smart_reminder',
          title: notif.title,
          message: notif.message,
          icon: notif.icon || '🔔',
          link: notif.link || '',
          read: false,
          createdAt: new Date().toISOString()
        });
        // 更新铃铛角标
        if (NotificationEngine.updateBadge) {
          NotificationEngine.updateBadge();
        }
      }
      console.log('[SmartReminder] 通知已发送:', notif.title);
    } catch (err) {
      console.error('[SmartReminder] 发送通知失败:', err);
    }
  }

  // ===== 规则层提醒 =====

  /**
   * 检查规则层提醒（固定时间点）
   */
  function checkRuleReminders() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    for (const rule of RULE_REMINDERS) {
      // 只在精确匹配的时间触发（同一分钟内）
      if (currentHour === rule.hour && currentMinute === rule.minute) {
        if (wasSentToday(rule.id)) continue;

        sendNotification({
          type: 'smart_reminder',
          title: rule.title,
          message: rule.message,
          icon: rule.icon,
          link: rule.link
        });
        markSentToday(rule.id);
      }
    }
  }

  // ===== 智能层提醒 =====

  /**
   * 消费异常提醒：今日支出 > 日均2倍
   */
  async function checkExpenseAnomaly() {
    const todayStr = formatDate(new Date());
    const sentId = 'expense_anomaly_' + todayStr;
    if (localStorage.getItem(LS_PREFIX + sentId) === '1') return;

    try {
      const allFinance = await Storage.getAll('finance');
      if (!allFinance || allFinance.length === 0) return;

      // 计算今日支出
      const todayExpense = allFinance
        .filter(f => f.type === 'expense' && f.date === todayStr)
        .reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);

      if (todayExpense <= 0) return;

      // 计算近30天日均支出（排除今天）
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = formatDate(thirtyDaysAgo);

      const pastExpenses = allFinance.filter(f =>
        f.type === 'expense' && f.date >= thirtyDaysAgoStr && f.date < todayStr
      );
      
      if (pastExpenses.length === 0) return;

      // 计算有支出的天数
      const expenseDates = new Set(pastExpenses.map(f => f.date));
      const daysWithExpense = expenseDates.size;
      const totalPastExpense = pastExpenses.reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);
      const dailyAvg = daysWithExpense > 0 ? totalPastExpense / daysWithExpense : 0;

      if (dailyAvg > 0 && todayExpense > dailyAvg * 2) {
        const ratio = Math.round(todayExpense / dailyAvg);
        await sendNotification({
          type: 'smart_reminder',
          title: '⚠️ 消费异常提醒',
          message: `今日支出 ¥${todayExpense.toFixed(0)}，是日均 ¥${dailyAvg.toFixed(0)} 的 ${ratio} 倍，注意控制开支哦！`,
          icon: '💰',
          link: '#finance'
        });
        localStorage.setItem(LS_PREFIX + sentId, '1');
      }
    } catch (err) {
      console.error('[SmartReminder] 消费异常检查失败:', err);
    }
  }

  /**
   * 任务积压提醒：逾期任务≥3个
   */
  async function checkTaskOverload() {
    const todayStr = formatDate(new Date());
    const sentId = 'task_overload_' + todayStr;
    if (localStorage.getItem(LS_PREFIX + sentId) === '1') return;

    try {
      const allTasks = await Storage.getAll('tasks');
      const overdueTasks = allTasks.filter(t =>
        t.status === 'todo' && t.dueDate && t.dueDate < todayStr
      );

      if (overdueTasks.length >= 3) {
        const names = overdueTasks.slice(0, 3).map(t => t.title).join('、');
        await sendNotification({
          type: 'smart_reminder',
          title: '📋 任务积压提醒',
          message: `有 ${overdueTasks.length} 个任务已逾期（${names} 等），优先处理一下吧！`,
          icon: '📋',
          link: '#tasks'
        });
        localStorage.setItem(LS_PREFIX + sentId, '1');
      }
    } catch (err) {
      console.error('[SmartReminder] 任务积压检查失败:', err);
    }
  }

  /**
   * 习惯断签风险：检测即将断签的习惯
   * 规则：有连续3天以上打卡记录，但今天还没打卡的习惯
   */
  async function checkHabitStreakRisk() {
    const todayStr = formatDate(new Date());
    const sentId = 'habit_streak_risk_' + todayStr;
    if (localStorage.getItem(LS_PREFIX + sentId) === '1') return;

    // 只在 20:00 后检查（给用户足够时间打卡）
    const hour = new Date().getHours();
    if (hour < 20) return;

    try {
      const allCheckins = await Storage.getAll('checkins');
      if (allCheckins.length === 0) return;

      // 获取习惯列表
      const habitSettings = await Storage.get('settings', 'habits');
      if (!habitSettings || !habitSettings.value || habitSettings.value.length === 0) return;

      const habits = habitSettings.value;
      const atRiskHabits = [];

      for (const habit of habits) {
        const habitName = habit.name || habit;
        // 检查今天是否已打卡该习惯
        const todayCheckin = allCheckins.find(c => c.date === todayStr);
        const todayHabits = todayCheckin ? (todayCheckin.habits || []) : [];
        if (todayHabits.includes(habitName)) continue; // 已打卡

        // 检查连续打卡天数
        let streak = 0;
        const now = new Date();
        for (let i = 1; i <= 7; i++) { // 检查过去7天
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const ds = formatDate(d);
          const checkin = allCheckins.find(c => c.date === ds);
          if (checkin && checkin.habits && checkin.habits.includes(habitName)) {
            streak++;
          } else {
            break;
          }
        }

        // 连续3天以上未断签，今天还没打卡 → 有断签风险
        if (streak >= 3) {
          atRiskHabits.push({ name: habitName, streak });
        }
      }

      if (atRiskHabits.length > 0) {
        const habitList = atRiskHabits.map(h => `${h.name}（连续${h.streak}天）`).join('、');
        await sendNotification({
          type: 'smart_reminder',
          title: '🔥 习惯断签风险',
          message: `这些习惯今天还没打卡：${habitList}，别让坚持白费！`,
          icon: '🔥',
          link: '#habits'
        });
        localStorage.setItem(LS_PREFIX + sentId, '1');
      }
    } catch (err) {
      console.error('[SmartReminder] 习惯断签检查失败:', err);
    }
  }

  /**
   * 周末总结提醒：周日晚上提醒做周回顾
   */
  async function checkWeeklyReviewReminder() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日
    const hour = now.getHours();

    // 只在周日 19:00-21:00 之间触发
    if (dayOfWeek !== 0 || hour < 19 || hour > 21) return;

    const todayStr = formatDate(now);
    const sentId = 'weekly_review_' + todayStr;
    if (localStorage.getItem(LS_PREFIX + sentId) === '1') return;

    await sendNotification({
      type: 'smart_reminder',
      title: '📊 周末总结提醒',
      message: '周日晚上了，是时候做一周回顾啦！复盘能帮你发现成长的轨迹 🌟',
      icon: '📊',
      link: '#templates'
    });
    localStorage.setItem(LS_PREFIX + sentId, '1');
  }

  // ===== 主检查流程 =====

  /**
   * 执行所有提醒检查
   */
  async function runAllChecks() {
    try {
      // 规则层
      checkRuleReminders();

      // 智能层
      await checkExpenseAnomaly();
      await checkTaskOverload();
      await checkHabitStreakRisk();
      await checkWeeklyReviewReminder();

      // 清理过期标记
      cleanupSentMarkers();
    } catch (err) {
      console.error('[SmartReminder] 检查失败:', err);
    }
  }

  // ===== 初始化 =====

  /**
   * 初始化主动提醒引擎
   */
  function init() {
    console.log('[SmartReminder] 主动提醒引擎初始化...');

    // 首次检查
    runAllChecks();

    // 每分钟检查一次
    _intervalId = setInterval(() => {
      runAllChecks();
    }, CHECK_INTERVAL);

    console.log('[SmartReminder] 主动提醒引擎已启动 🔔');
  }

  /**
   * 销毁提醒引擎，清理定时器
   */
  function destroy() {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
    console.log('[SmartReminder] 主动提醒引擎已销毁');
  }

  return {
    init,
    destroy,
    runAllChecks
  };
})();
