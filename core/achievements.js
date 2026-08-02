/**
 * achievements.js - 成就/勋章系统
 * 人生工作台 · 游戏化激励引擎
 *
 * 职责：
 * 1. 定义 15 个内置成就
 * 2. 监听 EventBus 事件，自动检测成就解锁
 * 3. 解锁后保存到 IndexedDB achievements 表
 * 4. 显示 toast 通知
 * 5. 首次启动时检测历史数据，补发已满足条件的成就
 */

import { Storage } from './storage.js';
import { EventBus } from './event-bus.js';

// ===== 成就定义 =====
const ACHIEVEMENT_DEFS = [
  {
    id: 'first_checkin',
    name: '初学者',
    icon: '🌱',
    description: '首次打卡',
    category: 'checkin',
  },
  {
    id: 'streak_7',
    name: '连续7天',
    icon: '🔥',
    description: '连续打卡7天',
    category: 'checkin',
  },
  {
    id: 'streak_30',
    name: '铁人',
    icon: '💪',
    description: '连续打卡30天',
    category: 'checkin',
  },
  {
    id: 'journal_10',
    name: '记录者',
    icon: '📝',
    description: '写满10篇日记',
    category: 'journal',
  },
  {
    id: 'first_finance',
    name: '理财新手',
    icon: '💰',
    description: '记录第一笔财务',
    category: 'finance',
  },
  {
    id: 'zero_spend_month',
    name: '零负债月',
    icon: '🎯',
    description: '某月无支出',
    category: 'finance',
  },
  {
    id: 'first_book',
    name: '书虫',
    icon: '📚',
    description: '读完第一本书',
    category: 'study',
  },
  {
    id: 'exercise_50',
    name: '运动达人',
    icon: '🏃',
    description: '运动打卡满50次',
    category: 'health',
  },
  {
    id: 'music_100h',
    name: '音乐家',
    icon: '🎵',
    description: '练习音乐满100小时',
    category: 'health',
  },
  {
    id: 'first_publish',
    name: '创作者',
    icon: '🎬',
    description: '发布第一条内容',
    category: 'content',
  },
  {
    id: 'creator_100',
    name: '百日创作者',
    icon: '🌟',
    description: '连续创作100天',
    category: 'content',
  },
  {
    id: 'usage_100',
    name: '数据控',
    icon: '📊',
    description: '使用满100天',
    category: 'usage',
  },
  {
    id: 'monthly_champion',
    name: '月度冠军',
    icon: '🏆',
    description: '单月完成50个任务',
    category: 'tasks',
  },
  {
    id: 'usage_365',
    name: '钻石会员',
    icon: '💎',
    description: '使用满365天',
    category: 'usage',
  },
  {
    id: 'course_complete',
    name: '学霸',
    icon: '🎓',
    description: '完成一门课程',
    category: 'study',
  },
];

// ===== 进度计算器 =====
// 每个 achievementId → async function() → { current, target } | null (无需进度)
const PROGRESS_CALCULATORS = {
  first_checkin: async () => {
    const all = await Storage.getAll('checkins');
    return { current: all.length > 0 ? 1 : 0, target: 1 };
  },
  streak_7: async () => {
    const streak = await _calcStreak();
    return { current: Math.min(streak, 7), target: 7 };
  },
  streak_30: async () => {
    const streak = await _calcStreak();
    return { current: Math.min(streak, 30), target: 30 };
  },
  journal_10: async () => {
    const all = await Storage.getAll('journal');
    return { current: Math.min(all.length, 10), target: 10 };
  },
  first_finance: async () => {
    const all = await Storage.getAll('finance');
    return { current: all.length > 0 ? 1 : 0, target: 1 };
  },
  zero_spend_month: async () => {
    // 无明确进度，需要遍历月份判断
    return null;
  },
  first_book: async () => {
    const all = await Storage.getAll('books');
    const done = all.filter(b => b.status === 'done' || b.status === 'completed').length;
    return { current: Math.min(done, 1), target: 1 };
  },
  exercise_50: async () => {
    const all = await Storage.getAll('checkins');
    let count = 0;
    all.forEach(c => {
      if (c.habits && c.habits.includes('exercise')) count++;
    });
    return { current: Math.min(count, 50), target: 50 };
  },
  music_100h: async () => {
    const all = await Storage.getAll('time_entries');
    let totalH = 0;
    all.forEach(e => {
      if (e.category === 'music' || e.category === '音乐') {
        totalH += (e.duration || 0) / 60;
      }
    });
    return { current: Math.min(Math.round(totalH), 100), target: 100 };
  },
  first_publish: async () => {
    const all = await Storage.getAll('content_published');
    return { current: all.length > 0 ? 1 : 0, target: 1 };
  },
  creator_100: async () => {
    const all = await Storage.getAll('content_published');
    const dates = new Set(all.map(p => p.date).filter(Boolean));
    return { current: Math.min(_calcConsecutiveDays(dates), 100), target: 100 };
  },
  usage_100: async () => {
    const meta = await Storage.get('meta', 'initialized');
    if (!meta || !meta.date) return { current: 0, target: 100 };
    const days = Math.floor((Date.now() - new Date(meta.date).getTime()) / 86400000);
    return { current: Math.min(days, 100), target: 100 };
  },
  monthly_champion: async () => {
    const all = await Storage.getAll('tasks');
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthDone = all.filter(t => t.status === 'done' && t.completedAt && t.completedAt.startsWith(monthStr)).length;
    return { current: Math.min(monthDone, 50), target: 50 };
  },
  usage_365: async () => {
    const meta = await Storage.get('meta', 'initialized');
    if (!meta || !meta.date) return { current: 0, target: 365 };
    const days = Math.floor((Date.now() - new Date(meta.date).getTime()) / 86400000);
    return { current: Math.min(days, 365), target: 365 };
  },
  course_complete: async () => {
    const all = await Storage.getAll('courses');
    const done = all.filter(c => c.status === 'done' || c.status === 'completed').length;
    return { current: Math.min(done, 1), target: 1 };
  },
};

// ===== 工具函数 =====

/**
 * 计算连续打卡天数
 */
async function _calcStreak() {
  try {
    const allCheckins = await Storage.getAll('checkins');
    // 只统计有习惯打卡的日期（habits 数组非空），或者纯签到日期
    const dateSet = new Set(allCheckins.map(c => c.date));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (dateSet.has(dateStr)) {
        streak++;
      } else {
        if (i === 0) continue; // 今天还没打卡算正常
        break;
      }
    }
    return streak;
  } catch (e) {
    return 0;
  }
}

/**
 * 计算 Set 中日期的连续天数
 */
function _calcConsecutiveDays(dateSet) {
  if (dateSet.size === 0) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dateSet.has(dateStr)) {
      streak++;
    } else {
      if (i === 0) continue;
      break;
    }
  }
  return streak;
}

// ===== 成就系统主对象 =====
export const Achievements = (() => {
  let _initialized = false;

  /**
   * 初始化成就系统
   * 1. 监听 EventBus 事件
   * 2. 首次启动检测历史数据
   */
  async function init() {
    if (_initialized) return;
    _initialized = true;

    console.log('[Achievements] 成就系统初始化...');

    // 确保 achievements 表存在
    await _ensureStore();

    // 监听 EventBus 事件
    _bindEvents();

    // 检测历史数据，补发已满足条件的成就
    await _checkHistory();

    console.log('[Achievements] 成就系统就绪');
  }

  /**
   * 确保 achievements 表存在
   * （v12 迁移会创建，但以防旧版本直接调用此模块）
   */
  async function _ensureStore() {
    try {
      const db = await Storage.getDB();
      if (!db.objectStoreNames.contains('achievements')) {
        // 如果表不存在，需要升级数据库版本
        // 但我们不能在这里升级，因为需要 onupgradeneeded 回调
        // 所以只在 v12+ 版本中可用，此处仅做检查
        console.warn('[Achievements] achievements 表不存在，请确保 DB_VERSION ≥ 12');
      }
    } catch (e) {
      console.warn('[Achievements] 检查 achievements 表失败:', e);
    }
  }

  /**
   * 绑定 EventBus 事件
   */
  function _bindEvents() {
    // 习惯打卡完成 → 检测初学者/连续7天/连续30天/运动达人
    EventBus.on('habit:completed', () => _checkAchievements('checkin'));

    // 日记创建 → 检测记录者
    EventBus.on('journal:created', () => _checkAchievements('journal'));

    // 财务记录 → 检测理财新手/零负债月
    EventBus.on('finance:added', () => _checkAchievements('finance'));

    // 任务完成 → 检测月度冠军
    EventBus.on('task:completed', () => _checkAchievements('tasks'));

    // 学习会话 → 检测书虫/学霸
    EventBus.on('study:session', () => _checkAchievements('study'));

    // 健康数据 → 检测运动达人
    EventBus.on('health:logged', () => _checkAchievements('health'));

    // 内容发布 → 检测创作者
    EventBus.on('content:published', () => _checkAchievements('content'));

    // 补签也触发
    EventBus.on('habit:retroactive', () => _checkAchievements('checkin'));
  }

  /**
   * 检测指定类别的成就
   * @param {string} category - 成就类别
   */
  async function _checkAchievements(category) {
    const defs = ACHIEVEMENT_DEFS.filter(d => d.category === category);
    for (const def of defs) {
      await _tryUnlock(def.id);
    }
  }

  /**
   * 尝试解锁成就
   * @param {string} achievementId - 成就ID
   */
  async function _tryUnlock(achievementId) {
    try {
      // 检查是否已解锁
      const existing = await Storage.get('achievements', achievementId);
      if (existing && existing.unlockedAt) return;

      // 检查是否满足条件
      const met = await _checkCondition(achievementId);
      if (!met) return;

      // 解锁成就
      const def = ACHIEVEMENT_DEFS.find(d => d.id === achievementId);
      if (!def) return;

      const record = {
        id: achievementId,
        name: def.name,
        icon: def.icon,
        description: def.description,
        category: def.category,
        unlockedAt: new Date().toISOString(),
      };

      await Storage.put('achievements', record);
      console.log(`[Achievements] 🎉 解锁成就：${def.icon} ${def.name}`);

      // 显示 toast 通知
      _showUnlockToast(def);

      // 广播成就解锁事件
      EventBus.emit('achievement:unlocked', { achievement: record });
    } catch (e) {
      console.error('[Achievements] 检测成就失败:', achievementId, e);
    }
  }

  /**
   * 检查成就条件
   * @param {string} achievementId
   * @returns {Promise<boolean>}
   */
  async function _checkCondition(achievementId) {
    try {
      switch (achievementId) {
        case 'first_checkin': {
          const all = await Storage.getAll('checkins');
          return all.length > 0;
        }
        case 'streak_7': {
          const streak = await _calcStreak();
          return streak >= 7;
        }
        case 'streak_30': {
          const streak = await _calcStreak();
          return streak >= 30;
        }
        case 'journal_10': {
          const all = await Storage.getAll('journal');
          return all.length >= 10;
        }
        case 'first_finance': {
          const all = await Storage.getAll('finance');
          return all.length > 0;
        }
        case 'zero_spend_month': {
          // 遍历所有财务记录，找到没有支出的月份
          const all = await Storage.getAll('finance');
          const expenses = all.filter(f => f.type === 'expense');
          if (expenses.length === 0 && all.length > 0) return true;
          const monthExpenses = {};
          expenses.forEach(f => {
            const m = f.month || (f.date ? f.date.substring(0, 7) : null);
            if (m) monthExpenses[m] = (monthExpenses[m] || 0) + 1;
          });
          // 找有收入但没支出的月份
          const incomes = all.filter(f => f.type === 'income');
          const incomeMonths = new Set(incomes.map(f => f.month || (f.date ? f.date.substring(0, 7) : null)).filter(Boolean));
          for (const m of incomeMonths) {
            if (!monthExpenses[m]) return true;
          }
          // 如果有财务记录但没有任何支出
          return expenses.length === 0 && all.length > 0;
        }
        case 'first_book': {
          const all = await Storage.getAll('books');
          return all.some(b => b.status === 'done' || b.status === 'completed');
        }
        case 'exercise_50': {
          const all = await Storage.getAll('checkins');
          let count = 0;
          all.forEach(c => {
            if (c.habits && c.habits.includes('exercise')) count++;
          });
          return count >= 50;
        }
        case 'music_100h': {
          const all = await Storage.getAll('time_entries');
          let totalMin = 0;
          all.forEach(e => {
            if (e.category === 'music' || e.category === '音乐') {
              totalMin += (e.duration || 0);
            }
          });
          return totalMin >= 6000; // 100小时 = 6000分钟
        }
        case 'first_publish': {
          const all = await Storage.getAll('content_published');
          return all.length > 0;
        }
        case 'creator_100': {
          const all = await Storage.getAll('content_published');
          const dates = new Set(all.map(p => p.date).filter(Boolean));
          return _calcConsecutiveDays(dates) >= 100;
        }
        case 'usage_100': {
          const meta = await Storage.get('meta', 'initialized');
          if (!meta || !meta.date) return false;
          const days = Math.floor((Date.now() - new Date(meta.date).getTime()) / 86400000);
          return days >= 100;
        }
        case 'monthly_champion': {
          const all = await Storage.getAll('tasks');
          const now = new Date();
          const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const monthDone = all.filter(t => t.status === 'done' && t.completedAt && t.completedAt.startsWith(monthStr)).length;
          return monthDone >= 50;
        }
        case 'usage_365': {
          const meta = await Storage.get('meta', 'initialized');
          if (!meta || !meta.date) return false;
          const days = Math.floor((Date.now() - new Date(meta.date).getTime()) / 86400000);
          return days >= 365;
        }
        case 'course_complete': {
          const all = await Storage.getAll('courses');
          return all.some(c => c.status === 'done' || c.status === 'completed');
        }
        default:
          return false;
      }
    } catch (e) {
      console.error('[Achievements] 检查条件失败:', achievementId, e);
      return false;
    }
  }

  /**
   * 检测历史数据，补发已满足条件的成就
   */
  async function _checkHistory() {
    console.log('[Achievements] 检测历史数据...');
    for (const def of ACHIEVEMENT_DEFS) {
      await _tryUnlock(def.id);
    }
  }

  /**
   * 显示解锁 toast
   */
  function _showUnlockToast(def) {
    // 移除已有的成就 toast
    document.querySelectorAll('.achievement-toast').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
      <span class="achievement-toast-icon">${def.icon}</span>
      <div class="achievement-toast-content">
        <div class="achievement-toast-title">🎉 解锁成就</div>
        <div class="achievement-toast-name">${def.name}</div>
      </div>
    `;

    document.body.appendChild(toast);

    // 触发动画
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // 3秒后消失
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  /**
   * 获取所有成就定义
   */
  function getDefinitions() {
    return ACHIEVEMENT_DEFS;
  }

  /**
   * 获取已解锁成就
   */
  async function getUnlocked() {
    try {
      const db = await Storage.getDB();
      if (!db.objectStoreNames.contains('achievements')) return [];
      return await Storage.getAll('achievements');
    } catch (e) {
      return [];
    }
  }

  /**
   * 获取指定成就的进度
   * @param {string} achievementId
   * @returns {Promise<{current: number, target: number} | null>}
   */
  async function getProgress(achievementId) {
    const calc = PROGRESS_CALCULATORS[achievementId];
    if (!calc) return null;
    try {
      return await calc();
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取所有成就的完整状态（含进度）
   */
  async function getAllWithStatus() {
    const unlocked = await getUnlocked();
    const unlockedMap = {};
    unlocked.forEach(a => { unlockedMap[a.id] = a; });

    const results = [];
    for (const def of ACHIEVEMENT_DEFS) {
      const record = unlockedMap[def.id];
      let progress = null;
      if (!record) {
        progress = await getProgress(def.id);
      }
      results.push({
        ...def,
        unlockedAt: record ? record.unlockedAt : null,
        unlocked: !!record,
        progress,
      });
    }
    return results;
  }

  return {
    init,
    getDefinitions,
    getUnlocked,
    getProgress,
    getAllWithStatus,
  };
})();
