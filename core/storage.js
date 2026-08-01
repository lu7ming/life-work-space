/**
 * storage.js - IndexedDB 封装（Promise 化）
 * 人生工作台 · 数据持久层
 */

const DB_NAME = 'LifeWorkSpace';
const DB_VERSION = 3;

/**
 * 存储管理器
 * 提供对 IndexedDB 的 Promise 风格封装
 */
const Storage = (() => {
  let _db = null;

  /**
   * 获取/创建数据库实例
   */
  function getDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 打卡记录表
        if (!db.objectStoreNames.contains('checkins')) {
          const store = db.createObjectStore('checkins', { keyPath: 'date' });
          store.createIndex('month', 'month', { unique: false });
        }

        // 习惯表
        if (!db.objectStoreNames.contains('habits')) {
          const store = db.createObjectStore('habits', { keyPath: 'id', autoIncrement: true });
          store.createIndex('category', 'category', { unique: false });
        }

        // 任务表
        if (!db.objectStoreNames.contains('tasks')) {
          const store = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }

        // 学习记录表
        if (!db.objectStoreNames.contains('study')) {
          const store = db.createObjectStore('study', { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
        }

        // 健康记录表
        if (!db.objectStoreNames.contains('health')) {
          const store = db.createObjectStore('health', { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
        }

        // 财务记录表
        if (!db.objectStoreNames.contains('finance')) {
          const store = db.createObjectStore('finance', { keyPath: 'id', autoIncrement: true });
          store.createIndex('month', 'month', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }

        // 设置表
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 初始化标记
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }

        // 项目表（v2 新增）
        if (!db.objectStoreNames.contains('projects')) {
          const store = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 番茄钟记录表（v2 新增）
        if (!db.objectStoreNames.contains('pomodoros')) {
          const store = db.createObjectStore('pomodoros', { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('taskId', 'taskId', { unique: false });
        }

        // 学期表（v3 新增）
        if (!db.objectStoreNames.contains('semesters')) {
          db.createObjectStore('semesters', { keyPath: 'id', autoIncrement: true });
        }

        // 课程表（v3 新增）
        if (!db.objectStoreNames.contains('courses')) {
          const store = db.createObjectStore('courses', { keyPath: 'id', autoIncrement: true });
          store.createIndex('semesterId', 'semesterId', { unique: false });
        }

        // 书籍表（v3 新增）
        if (!db.objectStoreNames.contains('books')) {
          const store = db.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status', { unique: false });
        }

        // 技能表（v3 新增）
        if (!db.objectStoreNames.contains('skills')) {
          db.createObjectStore('skills', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (event) => {
        _db = event.target.result;
        resolve(_db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * 获取 Object Store 的事务
   * @param {string} storeName - 表名
   * @param {'readonly'|'readwrite'} mode - 事务模式
   */
  function getStore(storeName, mode = 'readonly') {
    return getDB().then((db) => {
      const tx = db.transaction(storeName, mode);
      return tx.objectStore(storeName);
    });
  }

  /**
   * 添加一条记录
   * @param {string} storeName - 表名
   * @param {Object} data - 数据
   */
  async function add(storeName, data) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 更新/插入一条记录（put）
   * @param {string} storeName - 表名
   * @param {Object} data - 数据（需包含 keyPath 字段）
   */
  async function put(storeName, data) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取一条记录
   * @param {string} storeName - 表名
   * @param {*} key - 主键值
   */
  async function get(storeName, key) {
    const store = await getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取全部记录
   * @param {string} storeName - 表名
   */
  async function getAll(storeName) {
    const store = await getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 通过索引查询
   * @param {string} storeName - 表名
   * @param {string} indexName - 索引名
   * @param {*} value - 索引值
   */
  async function getByIndex(storeName, indexName, value) {
    const store = await getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除一条记录
   * @param {string} storeName - 表名
   * @param {*} key - 主键值
   */
  async function remove(storeName, key) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空表
   * @param {string} storeName - 表名
   */
  async function clear(storeName) {
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 统计记录数
   * @param {string} storeName - 表名
   */
  async function count(storeName) {
    const store = await getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 初始化示例数据（首次访问时调用）
   */
  async function initSampleData() {
    const initialized = await get('meta', 'initialized');
    if (initialized) return;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${String(today.getDate()).padStart(2, '0')}`;
    const monthStr = `${yyyy}-${mm}`;

    // 填充本月打卡记录（随机几天）
    const checkinDays = [1, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 21, 23, 25];
    const allHabitIds = ['warm-water','breakfast','exercise','drink-water','dinner-light','foot-bath','early-sleep','reading','study','stretch','journal','finance'];
    for (const day of checkinDays) {
      const dd = String(day).padStart(2, '0');
      // 每天随机完成 2~5 个习惯
      const count = 2 + (day % 4);
      const dayHabits = [];
      for (let i = 0; i < count && i < allHabitIds.length; i++) {
        const idx = (day + i * 3) % allHabitIds.length;
        dayHabits.push(allHabitIds[idx]);
      }
      await put('checkins', {
        date: `${yyyy}-${mm}-${dd}`,
        month: monthStr,
        time: `0${8 + (day % 3)}:${String(day % 60).padStart(2, '0')}`,
        habits: dayHabits
      });
    }

    // 填充示例项目
    const project1Id = await add('projects', { name: '个人成长计划', createdAt: todayStr });
    const project2Id = await add('projects', { name: '副业探索', createdAt: todayStr });

    // 填充几条任务（含优先级、截止日期、关联项目）
    const tasks = [
      { title: '完成周报', status: 'done', date: todayStr, category: 'work', priority: 'A', dueDate: todayStr, projectId: null, completedAt: todayStr },
      { title: '读完《原子习惯》第5章', status: 'todo', date: todayStr, category: 'study', priority: 'B', dueDate: todayStr, projectId: project1Id, completedAt: null },
      { title: '跑步3公里', status: 'todo', date: todayStr, category: 'health', priority: 'C', dueDate: todayStr, projectId: null, completedAt: null },
      { title: '整理本月账单', status: 'todo', date: todayStr, category: 'finance', priority: 'D', dueDate: todayStr, projectId: null, completedAt: null },
      { title: '调研副业方向', status: 'todo', date: todayStr, category: 'work', priority: 'A', dueDate: todayStr, projectId: project2Id, completedAt: null },
    ];
    for (const task of tasks) {
      await add('tasks', task);
    }

    // 填充学习记录
    await add('study', { date: todayStr, minutes: 45, subject: '阅读' });

    // 填充财务记录
    await add('finance', { month: monthStr, type: 'expense', amount: 35.5, note: '午餐', date: todayStr });
    await add('finance', { month: monthStr, type: 'expense', amount: 128, note: '书籍', date: todayStr });
    await add('finance', { month: monthStr, type: 'expense', amount: 2560, note: '房租', date: todayStr });
    await add('finance', { month: monthStr, type: 'income', amount: 15000, note: '工资', date: todayStr });

    // 学习模块示例数据
    const semester1Id = await add('semesters', { name: '2026年春季' });

    // 示例课程（24小时制时间格式）
    await add('courses', { name: '高等数学', room: 'A301', teacher: '李教授', day: 1, startTime: '08:00', endTime: '09:30', semesterId: semester1Id });
    await add('courses', { name: '大学英语', room: 'B205', teacher: '王老师', day: 1, startTime: '10:00', endTime: '11:30', semesterId: semester1Id });
    await add('courses', { name: '数据结构', room: 'C102', teacher: '张教授', day: 2, startTime: '09:40', endTime: '11:10', semesterId: semester1Id });
    await add('courses', { name: '线性代数', room: 'A301', teacher: '李教授', day: 3, startTime: '08:00', endTime: '09:30', semesterId: semester1Id });
    await add('courses', { name: '操作系统', room: 'D401', teacher: '赵教授', day: 4, startTime: '10:00', endTime: '11:30', semesterId: semester1Id });
    await add('courses', { name: '体育', room: '体育馆', teacher: '陈老师', day: 5, startTime: '14:20', endTime: '15:50', semesterId: semester1Id });

    // 示例书籍
    await add('books', { title: '原子习惯', author: 'James Clear', status: 'done', progress: 100, note: '很受启发' });
    await add('books', { title: '深度工作', author: 'Cal Newport', status: 'reading', progress: 65, note: '' });
    await add('books', { title: '思考，快与慢', author: 'Daniel Kahneman', status: 'reading', progress: 30, note: '' });
    await add('books', { title: '原则', author: 'Ray Dalio', status: 'want', progress: 0, note: '' });

    // 示例技能
    await add('skills', { name: 'Python编程', level: 4, progress: 70, note: '正在学习Flask' });
    await add('skills', { name: '英语口语', level: 3, progress: 45, note: '' });
    await add('skills', { name: 'UI设计', level: 2, progress: 25, note: '' });

    // 设置
    await put('settings', { key: 'username', value: '鹿7铭' });
    await put('settings', { key: 'streak', value: 14 });

    // 标记已初始化
    await put('meta', { key: 'initialized', value: true, date: todayStr });

    console.log('[Storage] 示例数据初始化完成');
  }

  /**
   * 迁移课程数据：将旧 period 格式转为 startTime/endTime 格式
   * period 映射：1→08:00-09:30, 2→09:40-11:10, 3→11:20-12:50, 4→14:00-15:30, 5→15:40-17:10
   */
  async function migrateCourseData() {
    const migrated = await get('meta', 'courseMigrated');
    if (migrated) return;

    const PERIOD_MAP = {
      1: { startTime: '08:00', endTime: '09:30' },
      2: { startTime: '09:40', endTime: '11:10' },
      3: { startTime: '11:20', endTime: '12:50' },
      4: { startTime: '14:00', endTime: '15:30' },
      5: { startTime: '15:40', endTime: '17:10' },
    };

    try {
      const allCourses = await getAll('courses');
      let changed = false;
      for (const course of allCourses) {
        if (course.period !== undefined && course.startTime === undefined) {
          const mapped = PERIOD_MAP[course.period];
          if (mapped) {
            course.startTime = mapped.startTime;
            course.endTime = mapped.endTime;
            delete course.period;
            await put('courses', course);
            changed = true;
          }
        }
      }
      if (changed) {
        console.log('[Storage] 课程数据已从 period 格式迁移为 startTime/endTime 格式');
      }
      await put('meta', { key: 'courseMigrated', value: true });
    } catch (err) {
      console.error('[Storage] 课程数据迁移失败:', err);
    }
  }

  return {
    getDB,
    add,
    put,
    get,
    getAll,
    getByIndex,
    remove,
    clear,
    count,
    initSampleData,
    migrateCourseData
  };
})();
