/**
 * user-profile.js - 个性化用户画像系统
 * 人生工作台 · UserProfile
 * 
 * 从 IndexedDB 聚合用户行为数据，构建多维度画像，
 * 并基于画像生成个性化推荐。
 * 
 * 画像维度：
 * 1. 时间偏好 - 最活跃时段 peakHour
 * 2. 模块偏好 - 最常用模块 favoriteModule
 * 3. 消费模式 - 日均支出、高频消费分类
 * 4. 习惯模式 - 完成率、常漏习惯
 * 5. 情绪模式 - 近期情绪趋势
 * 6. AI交互模式 - 小鹿/妮可使用比例、语音使用率
 */
import { Storage } from './storage.js';
import { SharedKnowledge } from './shared-knowledge.js';


export const UserProfile = (() => {
  // ===== 常量 =====
  const PROFILE_KEY = 'user_profile';       // IndexedDB settings 中的 key
  const STATS_KEY = 'user_profile_stats';   // 增量统计 key
  const BUILD_COOLDOWN = 5 * 60 * 1000;     // 全量重建冷却时间 5 分钟
  const MOOD_CONFIG = {
    '😄': { label: '开心', score: 5 },
    '😊': { label: '不错', score: 4 },
    '😐': { label: '一般', score: 3 },
    '😔': { label: '低落', score: 2 },
    '😢': { label: '难过', score: 1 },
  };

  // ===== 状态 =====
  let _profile = null;      // 当前画像缓存
  let _lastBuildTime = 0;   // 上次全量构建时间戳
  let _initDone = false;    // 是否已初始化

  // ===== 初始化 =====

  /**
   * 初始化画像系统
   * 从 IndexedDB 加载已有画像，不立即全量重建
   */
  async function init() {
    try {
      const saved = await Storage.get('settings', PROFILE_KEY);
      if (saved && saved.value) {
        _profile = saved.value;
        console.log('[UserProfile] 已加载历史画像，更新于', saved.value.lastUpdated || '未知');
      }
      _initDone = true;
    } catch (err) {
      console.error('[UserProfile] 初始化失败:', err);
    }
  }

  // ===== 画像构建 =====

  /**
   * 全量构建画像
   * 从各数据表读取数据，计算所有维度指标，持久化到 IndexedDB
   * @param {boolean} force - 是否强制重建（忽略冷却时间）
   * @returns {Object} 构建后的画像
   */
  async function buildProfile(force = false) {
    // 冷却检查：避免频繁全量重建阻塞 UI
    const now = Date.now();
    if (!force && _lastBuildTime && (now - _lastBuildTime) < BUILD_COOLDOWN) {
      console.log('[UserProfile] 冷却中，跳过全量重建');
      return _profile || {};
    }

    try {
      console.time('[UserProfile] buildProfile');
      const profile = {};

      // 并行读取所有数据源
      const [tasks, finance, checkins, journals, habits] = await Promise.all([
        safeGetAll('tasks'),
        safeGetAll('finance'),
        safeGetAll('checkins'),
        safeGetAll('journal'),
        safeGetAll('habits'),
      ]);

      // 1. 时间偏好
      profile.timePreference = buildTimePreference(checkins, tasks, journals);

      // 2. 模块偏好
      profile.modulePreference = buildModulePreference(checkins, tasks, journals, finance);

      // 3. 消费模式
      profile.consumptionPattern = buildConsumptionPattern(finance);

      // 4. 习惯模式
      profile.habitPattern = buildHabitPattern(checkins, habits);

      // 5. 情绪模式
      profile.moodPattern = buildMoodPattern(journals);

      // 6. AI 交互模式
      profile.aiInteractionPattern = buildAIInteractionPattern();

      // 元信息
      profile.lastUpdated = new Date().toISOString();
      profile.buildCount = (_profile?.buildCount || 0) + 1;

      // 持久化
      await Storage.put('settings', { key: PROFILE_KEY, value: profile });
      _profile = profile;
      _lastBuildTime = Date.now();

      console.timeEnd('[UserProfile] buildProfile');
      console.log('[UserProfile] 画像构建完成，维度数:', Object.keys(profile).length);
      return profile;
    } catch (err) {
      console.error('[UserProfile] 画像构建失败:', err);
      return _profile || {};
    }
  }

  // ===== 维度构建方法 =====

  /**
   * 构建时间偏好
   * 统计每小时的操作次数，计算最活跃时段
   * @param {Array} checkins - 打卡记录
   * @param {Array} tasks - 任务记录
   * @param {Array} journals - 日记记录
   * @returns {Object} 时间偏好数据
   */
  function buildTimePreference(checkins, tasks, journals) {
    const hourCounts = new Array(24).fill(0);

    // 从打卡时间统计
    checkins.forEach((c) => {
      if (c.time) {
        const hour = parseInt(c.time.split(':')[0], 10);
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          hourCounts[hour]++;
        }
      }
    });

    // 从任务创建/更新时间统计
    tasks.forEach((t) => {
      const dateStr = t.createdAt || t.date;
      if (dateStr) {
        const hour = extractHour(dateStr);
        if (hour !== null) hourCounts[hour]++;
      }
    });

    // 从日记记录统计
    journals.forEach((j) => {
      const dateStr = j.date || j.createdAt;
      if (dateStr) {
        const hour = extractHour(dateStr);
        if (hour !== null) hourCounts[hour]++;
      }
    });

    // 计算最活跃时段
    let peakHour = 0;
    let maxCount = 0;
    hourCounts.forEach((count, hour) => {
      if (count > maxCount) {
        maxCount = count;
        peakHour = hour;
      }
    });

    // 时段分类
    let period = '深夜';
    if (peakHour >= 6 && peakHour < 9) period = '早晨';
    else if (peakHour >= 9 && peakHour < 12) period = '上午';
    else if (peakHour >= 12 && peakHour < 14) period = '午间';
    else if (peakHour >= 14 && peakHour < 18) period = '下午';
    else if (peakHour >= 18 && peakHour < 22) period = '晚间';
    else if (peakHour >= 22 || peakHour < 6) period = '深夜';

    return {
      hourCounts,
      peakHour,
      peakHourLabel: `${peakHour}:00`,
      period,
      totalActions: hourCounts.reduce((a, b) => a + b, 0),
    };
  }

  /**
   * 构建模块偏好
   * 统计各模块使用频率，计算最常用模块
   * @returns {Object} 模块偏好数据
   */
  function buildModulePreference(checkins, tasks, journals, finance) {
    const moduleUsage = {
      habits: checkins.length,
      tasks: tasks.length,
      journal: journals.length,
      finance: finance.length,
    };

    // 找出最常用模块
    let favoriteModule = 'habits';
    let maxUsage = 0;
    Object.entries(moduleUsage).forEach(([mod, count]) => {
      if (count > maxUsage) {
        maxUsage = count;
        favoriteModule = mod;
      }
    });

    // 模块中文映射
    const MODULE_LABELS = {
      habits: '习惯打卡',
      tasks: '任务',
      journal: '记录与反思',
      finance: '财务',
    };

    return {
      moduleUsage,
      favoriteModule,
      favoriteModuleLabel: MODULE_LABELS[favoriteModule] || favoriteModule,
      totalRecords: Object.values(moduleUsage).reduce((a, b) => a + b, 0),
    };
  }

  /**
   * 构建消费模式
   * 计算日均支出、高频消费分类
   * @param {Array} finance - 财务记录
   * @returns {Object} 消费模式数据
   */
  function buildConsumptionPattern(finance) {
    const expenses = finance.filter((r) => r.type === 'expense');
    if (expenses.length === 0) {
      return {
        dailyAverage: 0,
        topCategories: [],
        totalExpense: 0,
        recordDays: 0,
      };
    }

    // 计算总支出和记录天数
    let totalExpense = 0;
    const dateSet = new Set();
    const categoryTotals = {};

    expenses.forEach((r) => {
      const amount = parseFloat(r.amount) || 0;
      totalExpense += amount;
      if (r.date) dateSet.add(r.date.substring(0, 10));
      const cat = r.category || '其他';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
    });

    const recordDays = dateSet.size || 1;
    const dailyAverage = totalExpense / recordDays;

    // 高频消费分类 top5
    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
        percentage: Math.round((amount / totalExpense) * 10000) / 100,
      }));

    return {
      dailyAverage: Math.round(dailyAverage * 100) / 100,
      topCategories,
      totalExpense: Math.round(totalExpense * 100) / 100,
      recordDays,
    };
  }

  /**
   * 构建习惯模式
   * 计算习惯完成率、常漏习惯
   * @param {Array} checkins - 打卡记录
   * @param {Array} habits - 习惯列表
   * @returns {Object} 习惯模式数据
   */
  function buildHabitPattern(checkins, habits) {
    if (checkins.length === 0) {
      return {
        habitCompletionRate: 0,
        missedHabits: [],
        totalCheckinDays: 0,
        avgHabitsPerDay: 0,
      };
    }

    // 习惯ID → 打卡次数
    const habitHitCount = {};
    let totalHabitChecks = 0;

    checkins.forEach((c) => {
      const checked = c.habits || [];
      totalHabitChecks += checked.length;
      checked.forEach((hId) => {
        habitHitCount[hId] = (habitHitCount[hId] || 0) + 1;
      });
    });

    // 完成率 = 平均每天打卡习惯数 / 总习惯数（12个）
    const TOTAL_HABITS = 12;
    const avgHabitsPerDay = totalHabitChecks / checkins.length;
    const habitCompletionRate = Math.round((avgHabitsPerDay / TOTAL_HABITS) * 10000) / 100;

    // 常漏习惯：打卡次数最少的习惯 top5
    // 获取所有已知习惯ID
    const allHabitIds = [
      'warm-water', 'breakfast', 'exercise', 'drink-water',
      'dinner-light', 'foot-bath', 'early-sleep', 'reading',
      'study', 'stretch', 'journal', 'finance',
    ];
    const HABIT_NAMES = {
      'warm-water': '早起一杯温水', 'breakfast': '吃对早餐',
      'exercise': '温和运动', 'drink-water': '喝水达标',
      'dinner-light': '晚餐七分饱', 'foot-bath': '温水泡脚',
      'early-sleep': '23:00前睡觉', 'reading': '读书',
      'study': '背单词/学习', 'stretch': '拉伸/站立',
      'journal': '写日记/复盘', 'finance': '记账',
    };

    const missedHabits = allHabitIds
      .map((id) => ({
        id,
        name: HABIT_NAMES[id] || id,
        hitCount: habitHitCount[id] || 0,
        hitRate: checkins.length > 0
          ? Math.round(((habitHitCount[id] || 0) / checkins.length) * 10000) / 100
          : 0,
      }))
      .sort((a, b) => a.hitCount - b.hitCount)
      .slice(0, 5);

    return {
      habitCompletionRate,
      missedHabits,
      totalCheckinDays: checkins.length,
      avgHabitsPerDay: Math.round(avgHabitsPerDay * 100) / 100,
    };
  }

  /**
   * 构建情绪模式
   * 从日记模块获取近期情绪趋势
   * @param {Array} journals - 日记记录
   * @returns {Object} 情绪模式数据
   */
  function buildMoodPattern(journals) {
    // 过滤有情绪标记的日记，按日期排序
    const moodEntries = journals
      .filter((j) => j.mood && MOOD_CONFIG[j.mood])
      .map((j) => ({
        date: j.date || j.createdAt,
        mood: j.mood,
        score: j.mood_score ?? MOOD_CONFIG[j.mood].score,
      }))
      .filter((e) => e.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (moodEntries.length < 3) {
      return {
        trend: 'stable',
        trendLabel: '平稳',
        averageScore: 0,
        recentScore: 0,
        totalMoodEntries: moodEntries.length,
      };
    }

    // 计算平均情绪分数
    const totalScore = moodEntries.reduce((sum, e) => sum + e.score, 0);
    const averageScore = totalScore / moodEntries.length;

    // 近7天情绪 vs 更早期情绪，判断趋势
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStr = formatDateToStr(sevenDaysAgo);

    const recentEntries = moodEntries.filter((e) => e.date >= sevenDaysAgoStr);
    const olderEntries = moodEntries.filter((e) => e.date < sevenDaysAgoStr);

    let recentScore = averageScore;
    if (recentEntries.length > 0) {
      recentScore = recentEntries.reduce((sum, e) => sum + e.score, 0) / recentEntries.length;
    }

    // 判断趋势
    let trend = 'stable';
    let trendLabel = '平稳';
    if (olderEntries.length >= 2) {
      const olderScore = olderEntries.reduce((sum, e) => sum + e.score, 0) / olderEntries.length;
      const diff = recentScore - olderScore;
      if (diff > 0.5) {
        trend = 'improving';
        trendLabel = '上升';
      } else if (diff < -0.5) {
        trend = 'declining';
        trendLabel = '下降';
      }
    }

    return {
      trend,
      trendLabel,
      averageScore: Math.round(averageScore * 100) / 100,
      recentScore: Math.round(recentScore * 100) / 100,
      totalMoodEntries: moodEntries.length,
      recentMoodEntries: recentEntries.length,
    };
  }

  /**
   * 构建 AI 交互模式
   * 统计小鹿/妮可使用比例和语音使用率
   * 使用 localStorage 中 SharedKnowledge 的交互记录来推断
   * @returns {Object} AI交互模式数据
   */
  function buildAIInteractionPattern() {
    // 从 SharedKnowledge 中获取交互统计
    let xiaoluCount = 0;
    let nicoleCount = 0;
    let voiceCount = 0;
    let totalInteractions = 0;

    try {
      // 遍历 SharedKnowledge 获取来源统计
      if (window.SharedKnowledge?.getAll) {
        const allEntries = window.SharedKnowledge?.getAll();
        Object.values(allEntries).forEach((entry) => {
          if (entry.source === 'xiaolu') xiaoluCount++;
          else if (entry.source === 'nicole') nicoleCount++;
        });
      }

      // 从 localStorage 获取语音使用次数
      const voiceUsageStr = localStorage.getItem('xiaolu_voice_count');
      voiceCount = voiceUsageStr ? parseInt(voiceUsageStr, 10) : 0;

      // 从 localStorage 获取 AI 交互总次数
      const aiUsageStr = localStorage.getItem('ai_interaction_stats');
      if (aiUsageStr) {
        try {
          const stats = JSON.parse(aiUsageStr);
          xiaoluCount = stats.xiaoluCount || xiaoluCount;
          nicoleCount = stats.nicoleCount || nicoleCount;
          voiceCount = stats.voiceCount || voiceCount;
        } catch (e) { /* 忽略解析错误 */ }
      }
    } catch (err) {
      console.warn('[UserProfile] AI交互数据获取失败:', err);
    }

    totalInteractions = xiaoluCount + nicoleCount;
    const preferredAI = totalInteractions > 0
      ? (xiaoluCount >= nicoleCount ? 'xiaolu' : 'nicole')
      : 'none';
    const voiceUsageRate = totalInteractions > 0
      ? Math.round((voiceCount / totalInteractions) * 10000) / 100
      : 0;

    const AI_LABELS = { xiaolu: '小鹿', nicole: '妮可', none: '未使用' };

    return {
      xiaoluCount,
      nicoleCount,
      preferredAI,
      preferredAILabel: AI_LABELS[preferredAI],
      voiceUsageRate,
      voiceCount,
      totalInteractions,
    };
  }

  // ===== 增量更新 =====

  /**
   * 轻量增量更新画像统计
   * 每次 Storage 写入操作后异步调用，不全量重建
   * @param {string} storeName - 被写入的表名
   * @param {string} action - 操作类型 'add' | 'put' | 'remove'
   * @param {Object} data - 写入的数据
   */
  async function incrementalUpdate(storeName, action, data) {
    if (!_initDone || !_profile) return;

    try {
      // 根据写入的表更新对应维度
      switch (storeName) {
        case 'checkins':
          // 更新时间偏好和习惯模式（轻量：只更新统计计数）
          if (data && data.time) {
            const hour = parseInt(data.time.split(':')[0], 10);
            if (!isNaN(hour) && hour >= 0 && hour < 24 && _profile.timePreference) {
              _profile.timePreference.hourCounts[hour]++;
              // 重新计算 peakHour
              let max = 0;
              _profile.timePreference.hourCounts.forEach((c, h) => {
                if (c > max) { max = c; _profile.timePreference.peakHour = h; }
              });
            }
          }
          break;

        case 'finance':
          // 消费模式标记为需要下次全量重建
          if (_profile.consumptionPattern) {
            _profile.consumptionPattern._dirty = true;
          }
          break;

        case 'journal':
          // 情绪模式标记为需要下次全量重建
          if (_profile.moodPattern) {
            _profile.moodPattern._dirty = true;
          }
          break;

        case 'tasks':
          // 模块偏好标记为需要下次全量重建
          if (_profile.modulePreference) {
            _profile.modulePreference._dirty = true;
          }
          break;
      }

      // 持久化增量更新
      _profile.lastUpdated = new Date().toISOString();
      await Storage.put('settings', { key: PROFILE_KEY, value: _profile });
    } catch (err) {
      console.warn('[UserProfile] 增量更新失败:', err);
    }
  }

  // ===== 个性化推荐 =====

  /**
   * 基于画像生成个性化推荐
   * @returns {Array<{type: string, message: string, priority: number}>} 推荐列表
   */
  async function getRecommendations() {
    // 确保有画像数据
    const profile = _profile || await getProfile();
    if (!profile || !profile.lastUpdated) {
      return [];
    }

    const recommendations = [];
    const now = new Date();
    const currentHour = now.getHours();

    // 1. 基于时间：晚间未打卡习惯提醒
    if (profile.timePreference) {
      if (currentHour >= 20 && currentHour <= 23) {
        // 晚间时段
        if (profile.habitPattern && profile.habitPattern.avgHabitsPerDay < 6) {
          recommendations.push({
            type: 'time_evening_habits',
            message: '晚间是习惯打卡的黄金时间，今天还有未完成的习惯哦～',
            priority: 8,
          });
        }
      }
      // 基于活跃时段提醒
      if (profile.timePreference.peakHour >= 22 || profile.timePreference.peakHour < 6) {
        recommendations.push({
          type: 'time_late_night',
          message: '你经常深夜使用工作台，注意早点休息，健康最重要！',
          priority: 6,
        });
      }
    }

    // 2. 基于消费：日均支出超标预警
    if (profile.consumptionPattern && profile.consumptionPattern.dailyAverage > 0) {
      const dailyAvg = profile.consumptionPattern.dailyAverage;
      // 如果日均支出较高（超过100元），给出预警
      if (dailyAvg > 100) {
        recommendations.push({
          type: 'spending_high',
          message: `近期日均支出 ${dailyAvg.toFixed(0)} 元，可以关注一下消费结构，看看哪些可以优化～`,
          priority: 7,
        });
      }
      // 提示高频消费分类
      if (profile.consumptionPattern.topCategories.length > 0) {
        const topCat = profile.consumptionPattern.topCategories[0];
        if (topCat.percentage > 40) {
          recommendations.push({
            type: 'spending_category_concentrated',
            message: `${topCat.category} 占总支出的 ${topCat.percentage.toFixed(0)}%，消费比较集中`,
            priority: 5,
          });
        }
      }
    }

    // 3. 基于完成率：完成率低时建议减少目标数量
    if (profile.habitPattern) {
      const rate = profile.habitPattern.habitCompletionRate;
      if (rate > 0 && rate < 30) {
        recommendations.push({
          type: 'habit_low_rate',
          message: `习惯完成率 ${rate.toFixed(0)}%，建议先聚焦3-5个核心习惯，养成后再逐步增加～`,
          priority: 9,
        });
      } else if (rate >= 30 && rate < 60) {
        recommendations.push({
          type: 'habit_medium_rate',
          message: `习惯完成率 ${rate.toFixed(0)}%，正在稳步提升！可以尝试固定时间打卡，形成节奏感`,
          priority: 5,
        });
      }
      // 常漏习惯提醒
      if (profile.habitPattern.missedHabits.length > 0) {
        const mostMissed = profile.habitPattern.missedHabits[0];
        recommendations.push({
          type: 'habit_missed',
          message: `「${mostMissed.name}」是最常漏掉的习惯（打卡率 ${mostMissed.hitRate.toFixed(0)}%），试试设置提醒？`,
          priority: 7,
        });
      }
    }

    // 4. 基于情绪：情绪低落时给予鼓励
    if (profile.moodPattern) {
      if (profile.moodPattern.trend === 'declining') {
        recommendations.push({
          type: 'mood_declining',
          message: '最近情绪似乎有些低落，记得对自己好一点。适当休息，和朋友聊聊天，一切都会好起来的 💪',
          priority: 10,
        });
      } else if (profile.moodPattern.trend === 'improving') {
        recommendations.push({
          type: 'mood_improving',
          message: '最近心情不错！保持积极的心态，你做得很棒 ✨',
          priority: 3,
        });
      }
    }

    // 5. 基于AI交互：推荐未使用的功能
    if (profile.aiInteractionPattern) {
      if (profile.aiInteractionPattern.preferredAI === 'none') {
        recommendations.push({
          type: 'ai_not_used',
          message: '你还没有和小鹿或妮可聊过天，试试点击右下角的 🦌 或 💎 开始对话吧！',
          priority: 4,
        });
      } else if (profile.aiInteractionPattern.voiceUsageRate < 10 && profile.aiInteractionPattern.totalInteractions > 3) {
        recommendations.push({
          type: 'ai_voice_low',
          message: '长按小鹿按钮可以使用语音输入，在忙碌时更方便哦～',
          priority: 3,
        });
      }
    }

    // 按优先级降序排列
    recommendations.sort((a, b) => b.priority - a.priority);

    return recommendations;
  }

  // ===== 快捷查询方法 =====

  /**
   * 获取当前画像
   * 如果缓存中没有，从 IndexedDB 读取；如果还是没有，触发全量构建
   * @returns {Object} 用户画像
   */
  async function getProfile() {
    if (_profile) return _profile;

    try {
      const saved = await Storage.get('settings', PROFILE_KEY);
      if (saved && saved.value) {
        _profile = saved.value;
        return _profile;
      }
    } catch (err) {
      console.warn('[UserProfile] 读取画像失败:', err);
    }

    // 没有画像，全量构建
    return await buildProfile(true);
  }

  /**
   * 获取单项统计数据
   * @param {string} key - 统计项key，支持点号路径如 'timePreference.peakHour'
   * @returns {*} 统计值
   */
  async function getStat(key) {
    const profile = await getProfile();
    if (!profile) return null;

    // 支持点号路径
    const parts = key.split('.');
    let value = profile;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return null;
      value = value[part];
    }
    return value;
  }

  /**
   * 重置画像数据
   * 清除缓存和 IndexedDB 中的画像记录
   */
  async function reset() {
    try {
      await Storage.remove('settings', PROFILE_KEY);
      _profile = null;
      _lastBuildTime = 0;
      console.log('[UserProfile] 画像已重置');
    } catch (err) {
      console.error('[UserProfile] 重置失败:', err);
    }
  }

  // ===== 工具函数 =====

  /**
   * 安全获取表全部数据
   * @param {string} storeName - 表名
   * @returns {Array} 数据数组
   */
  async function safeGetAll(storeName) {
    try {
      const data = await Storage.getAll(storeName);
      return data || [];
    } catch (err) {
      console.warn(`[UserProfile] 读取 ${storeName} 失败:`, err);
      return [];
    }
  }

  /**
   * 从日期字符串中提取小时
   * @param {string} dateStr - 日期字符串
   * @returns {number|null} 小时数
   */
  function extractHour(dateStr) {
    if (!dateStr) return null;
    // 尝试匹配 HH:MM 格式
    const timeMatch = dateStr.match(/(\d{1,2}):\d{2}/);
    if (timeMatch) return parseInt(timeMatch[1], 10);
    // 尝试解析 ISO 日期
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d.getHours();
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /**
   * 格式化日期为 YYYY-MM-DD 字符串
   * @param {Date} date - 日期对象
   * @returns {string} 格式化日期
   */
  function formatDateToStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ===== 暴露接口 =====
  return {
    init,
    buildProfile,
    incrementalUpdate,
    getRecommendations,
    getProfile,
    getStat,
    reset,
  };
})();
