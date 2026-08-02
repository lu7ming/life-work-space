/**
 * predictive-engine.js - 预测性操作引擎
 * 人生工作台 · PredictiveEngine
 * 
 * 基于时间规律和行为模式，预测用户下一步可能需要的操作，
 * 在 Dashboard 首页以「猜你想做」卡片展示。
 * 
 * 预测维度：
 * 1. 基于时间的预测 - 工作日早晨/午间/月末/周末
 * 2. 基于行为的预测 - 近期消费/习惯打卡/运动记录
 * 
 * 约束：
 * - 预测操作不能自动执行，只展示建议让用户确认
 * - 最多显示 3 个预测，按置信度排序
 * - 预测结果缓存 1 小时
 */

const PredictiveEngine = (() => {
  // ===== 常量 =====
  const MAX_PREDICTIONS = 3;             // 最多显示 3 个预测
  const CACHE_TTL = 60 * 60 * 1000;      // 预测缓存 1 小时
  const CACHE_KEY = 'predictive_cache';  // IndexedDB settings 中的缓存 key
  const FEEDBACK_KEY = 'predictive_feedback'; // 反馈记录 key

  // ===== 状态 =====
  let _cachedPredictions = null;  // 缓存的预测结果
  let _cacheTime = 0;             // 缓存时间戳
  let _initDone = false;          // 是否已初始化
  let _refreshTimer = null;       // 定时刷新定时器

  // ===== 初始化 =====

  /**
   * 初始化预测引擎
   * 加载缓存，设置定时刷新
   */
  async function init() {
    try {
      // 尝试加载缓存
      const cached = await Storage.get('settings', CACHE_KEY);
      if (cached && cached.value) {
        _cachedPredictions = cached.value.predictions || [];
        _cacheTime = cached.value.time || 0;
      }
      _initDone = true;
      console.log('[PredictiveEngine] 预测引擎已初始化');

      // 设置每小时自动刷新
      _refreshTimer = setInterval(() => {
        refreshPredictions();
      }, CACHE_TTL);

    } catch (err) {
      console.error('[PredictiveEngine] 初始化失败:', err);
      _initDone = true;
    }
  }

  /**
   * 销毁引擎，清理定时器
   */
  function destroy() {
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
    console.log('[PredictiveEngine] 引擎已销毁');
  }

  // ===== 预测核心 =====

  /**
   * 生成所有预测，合并排序，返回 top N
   * @returns {Promise<Array>} 预测列表
   */
  async function generatePredictions() {
    const timePredictions = await predictByTime();
    const behaviorPredictions = await predictByBehavior();

    // 合并、去重、按置信度排序
    const all = [...timePredictions, ...behaviorPredictions];
    const unique = _deduplicate(all);
    unique.sort((a, b) => b.confidence - a.confidence);

    return unique.slice(0, MAX_PREDICTIONS);
  }

  /**
   * 基于时间的预测
   * @returns {Promise<Array>} 预测列表
   */
  async function predictByTime() {
    const predictions = [];
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();       // 0=日, 1=一, ..., 6=六
    const date = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();

    // 获取当月天数
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysUntilMonthEnd = daysInMonth - date;

    // --- 工作日早上 (7-9点) → 建议创建今日任务 ---
    if (day >= 1 && day <= 5 && hour >= 7 && hour <= 9) {
      predictions.push({
        id: 'morning_task',
        icon: '📋',
        title: '规划今日任务',
        description: '工作日早晨，规划一下今天要做的事',
        confidence: 0.8,
        action: { type: 'navigate', route: 'tasks' },
        category: 'time'
      });
    }

    // --- 工作日中午 (11-13点) → 建议记录午餐支出 ---
    if (day >= 1 && day <= 5 && hour >= 11 && hour <= 13) {
      predictions.push({
        id: 'lunch_expense',
        icon: '🍱',
        title: '记录午餐支出',
        description: '午餐时间，顺手记一笔',
        confidence: 0.7,
        action: { type: 'quick_record', storeName: 'finance', params: { type: 'expense', category: '餐饮', note: '午餐' } },
        category: 'time'
      });
    }

    // --- 月末最后3天 → 建议做月度复盘 ---
    if (daysUntilMonthEnd <= 2 && daysUntilMonthEnd >= 0) {
      predictions.push({
        id: 'monthly_review',
        icon: '📊',
        title: '做月度复盘',
        description: '月末了，回顾一下这个月的收获',
        confidence: 0.9,
        action: { type: 'navigate', route: 'journal' },
        category: 'time'
      });
    }

    // --- 周日下午 → 建议做周回顾 ---
    if (day === 0 && hour >= 14 && hour <= 18) {
      predictions.push({
        id: 'weekly_review',
        icon: '📝',
        title: '做周回顾',
        description: '周末下午，适合回顾这一周',
        confidence: 0.6,
        action: { type: 'navigate', route: 'journal' },
        category: 'time'
      });
    }

    // --- 晚间 (20-22点) → 建议记录今日感悟 ---
    if (hour >= 20 && hour <= 22) {
      predictions.push({
        id: 'evening_journal',
        icon: '✍️',
        title: '记录今日感悟',
        description: '一天快结束了，写点什么吧',
        confidence: 0.5,
        action: { type: 'navigate', route: 'journal' },
        category: 'time'
      });
    }

    return predictions;
  }

  /**
   * 基于行为的预测
   * 利用 UserProfile 的数据和 IndexedDB 记录进行预测
   * @returns {Promise<Array>} 预测列表
   */
  async function predictByBehavior() {
    const predictions = [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // --- 最近3天都记录了晚餐支出 → 建议记录今晚晚餐 ---
    try {
      const finances = await Storage.getAll('finance');
      const dinnerDays = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const hasDinner = finances.some(f =>
          f.type === 'expense' && f.date === dateStr && f.category === '餐饮'
        );
        if (hasDinner) dinnerDays.push(dateStr);
      }
      if (dinnerDays.length >= 3) {
        // 今天还没记晚餐
        const todayDinner = finances.some(f =>
          f.type === 'expense' && f.date === todayStr && f.category === '餐饮'
        );
        if (!todayDinner) {
          predictions.push({
            id: 'dinner_expense',
            icon: '🍽️',
            title: '记录今晚晚餐',
            description: '最近3天都记录了晚餐支出，今天也记一笔',
            confidence: 0.6,
            action: { type: 'quick_record', storeName: 'finance', params: { type: 'expense', category: '餐饮', note: '晚餐' } },
            category: 'behavior'
          });
        }
      }
    } catch (e) { /* 静默 */ }

    // --- 连续2天没打卡某个习惯 → 提醒打卡 ---
    try {
      const habits = await Storage.getAll('habits');
      const checkins = await Storage.getAll('checkins');

      for (const habit of habits.slice(0, 5)) { // 只检查前5个习惯
        let missedDays = 0;
        for (let i = 1; i <= 2; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const checked = checkins.some(c =>
            c.date === dateStr && c.habits && c.habits.includes(habit.name || habit.id)
          );
          if (!checked) missedDays++;
        }
        if (missedDays >= 2) {
          predictions.push({
            id: `habit_remind_${habit.id || habit.name}`,
            icon: '✅',
            title: `打卡「${habit.name || '习惯'}」`,
            description: '连续2天没打卡了，坚持住！',
            confidence: 0.8,
            action: { type: 'navigate', route: 'habits' },
            category: 'behavior'
          });
          break; // 只提醒一个习惯
        }
      }
    } catch (e) { /* 静默 */ }

    // --- 最近一周都没运动 → 建议记录运动 ---
    try {
      const healthRecords = await Storage.getAll('health');
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;

      const hasExerciseThisWeek = healthRecords.some(h =>
        h.date && h.date >= weekAgoStr && h.exercises && h.exercises.length > 0
      );

      if (!hasExerciseThisWeek) {
        // 周三之后才提醒（避免周一就催）
        if (now.getDay() >= 3) {
          predictions.push({
            id: 'exercise_remind',
            icon: '💪',
            title: '记录一次运动',
            description: '这周还没运动呢，动起来吧',
            confidence: 0.7,
            action: { type: 'navigate', route: 'health' },
            category: 'behavior'
          });
        }
      }
    } catch (e) { /* 静默 */ }

    // --- 今日未签到 → 建议打卡 ---
    try {
      const todayCheckin = await Storage.get('checkins', todayStr);
      if (!todayCheckin) {
        predictions.push({
          id: 'daily_checkin',
          icon: '📅',
          title: '今日打卡签到',
          description: '新的一天，从签到开始',
          confidence: 0.65,
          action: { type: 'checkin' },
          category: 'behavior'
        });
      }
    } catch (e) { /* 静默 */ }

    return predictions;
  }

  // ===== 缓存与刷新 =====

  /**
   * 刷新预测（忽略缓存）
   * @returns {Promise<Array>} 新的预测列表
   */
  async function refreshPredictions() {
    try {
      const predictions = await generatePredictions();
      _cachedPredictions = predictions;
      _cacheTime = Date.now();

      // 持久化缓存
      await Storage.put('settings', {
        key: CACHE_KEY,
        value: { predictions, time: _cacheTime }
      });

      console.log('[PredictiveEngine] 预测已刷新，共', predictions.length, '条');
      return predictions;
    } catch (err) {
      console.error('[PredictiveEngine] 刷新预测失败:', err);
      return _cachedPredictions || [];
    }
  }

  /**
   * 获取当前预测（优先使用缓存）
   * @param {boolean} forceRefresh - 是否强制刷新
   * @returns {Promise<Array>} 预测列表
   */
  async function getPredictions(forceRefresh = false) {
    if (!_initDone) await init();

    // 缓存有效且非强制刷新
    if (!forceRefresh && _cachedPredictions && _cachedPredictions.length > 0) {
      const elapsed = Date.now() - _cacheTime;
      if (elapsed < CACHE_TTL) {
        return _cachedPredictions;
      }
    }

    return await refreshPredictions();
  }

  // ===== 反馈与优化 =====

  /**
   * 记录用户对预测的反馈（有用/无用）
   * 用于后续优化预测准确率
   * @param {string} predictionId - 预测 ID
   * @param {boolean} useful - 是否有用
   */
  async function recordFeedback(predictionId, useful) {
    try {
      const saved = await Storage.get('settings', FEEDBACK_KEY);
      const feedback = (saved && saved.value) || {};
      feedback[predictionId] = {
        useful,
        time: Date.now()
      };
      await Storage.put('settings', { key: FEEDBACK_KEY, value: feedback });
      console.log(`[PredictiveEngine] 预测 ${predictionId} 反馈: ${useful ? '有用' : '无用'}`);
    } catch (err) {
      console.error('[PredictiveEngine] 记录反馈失败:', err);
    }
  }

  /**
   * 获取某预测的反馈历史
   * @param {string} predictionId - 预测 ID
   * @returns {Promise<Object|null>} 反馈记录
   */
  async function getFeedback(predictionId) {
    try {
      const saved = await Storage.get('settings', FEEDBACK_KEY);
      if (saved && saved.value && saved.value[predictionId]) {
        return saved.value[predictionId];
      }
    } catch (e) { /* 静默 */ }
    return null;
  }

  // ===== 预测执行 =====

  /**
   * 执行预测操作（由用户确认后调用）
   * @param {Object} prediction - 预测对象
   * @returns {Promise<boolean>} 是否执行成功
   */
  async function executePrediction(prediction) {
    if (!prediction || !prediction.action) return false;

    const { action } = prediction;

    try {
      switch (action.type) {
        case 'navigate':
          // 路由跳转
          if (typeof Router !== 'undefined' && Router.navigate) {
            Router.navigate(action.route);
            return true;
          }
          return false;

        case 'quick_record':
          // 快速记录（财务等）
          if (action.storeName === 'finance') {
            const params = action.params || {};
            const record = {
              type: params.type || 'expense',
              amount: 0, // 需要用户补充
              category: params.category || '其他',
              date: new Date().toISOString().slice(0, 10),
              month: new Date().toISOString().slice(0, 7),
              note: params.note || '',
              createdAt: Date.now()
            };
            // 导航到财务模块让用户填写金额
            if (typeof Router !== 'undefined' && Router.navigate) {
              Router.navigate('finance');
            }
            if (typeof App !== 'undefined') {
              App.showToast(`${params.note ? params.note + ' - ' : ''}请输入金额 📝`);
            }
            return true;
          }
          return false;

        case 'checkin':
          // 执行打卡
          const checkinBtn = document.getElementById('checkin-btn');
          if (checkinBtn) {
            checkinBtn.click();
            return true;
          }
          return false;

        default:
          console.warn('[PredictiveEngine] 未知操作类型:', action.type);
          return false;
      }
    } catch (err) {
      console.error('[PredictiveEngine] 执行预测操作失败:', err);
      return false;
    }
  }

  // ===== 去重 =====

  /**
   * 根据 id 去重预测列表
   * @param {Array} predictions - 预测列表
   * @returns {Array} 去重后的列表
   */
  function _deduplicate(predictions) {
    const seen = new Set();
    return predictions.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }

  return {
    init,
    destroy,
    getPredictions,
    refreshPredictions,
    executePrediction,
    recordFeedback,
    getFeedback
  };
})();
