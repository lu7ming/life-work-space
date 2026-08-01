/**
 * storage.js - IndexedDB 封装（Promise 化）
 * 人生工作台 · 数据持久层
 */

const DB_NAME = 'LifeWorkSpace';
const DB_VERSION = 6;

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

        // 记录与反思表（v4 新增）
        if (!db.objectStoreNames.contains('journal')) {
          const store = db.createObjectStore('journal', { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }

        // 目标表（v4 新增）
        if (!db.objectStoreNames.contains('goals')) {
          const store = db.createObjectStore('goals', { keyPath: 'id', autoIncrement: true });
          store.createIndex('level', 'level', { unique: false });
        }

        // 关系表（v4 新增）
        if (!db.objectStoreNames.contains('contacts')) {
          const store = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
          store.createIndex('type', 'type', { unique: false });
        }

        // 知识库表（v4 新增）
        if (!db.objectStoreNames.contains('knowledge')) {
          const store = db.createObjectStore('knowledge', { keyPath: 'id', autoIncrement: true });
          store.createIndex('type', 'type', { unique: false });
        }

        // 灵感表（v4 新增）
        if (!db.objectStoreNames.contains('ideas')) {
          const store = db.createObjectStore('ideas', { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
        }

        // 生命树表（v4 新增）
        if (!db.objectStoreNames.contains('lifetree')) {
          db.createObjectStore('lifetree', { keyPath: 'key' });
        }

        // 通知表（v6 新增）
        if (!db.objectStoreNames.contains('notifications')) {
          const store = db.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
          store.createIndex('read', 'read', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // v4→v5: 清除所有示例数据，从零开始
        if (event.oldVersion < 5) {
          try {
            const storesToClear = ['checkins', 'tasks', 'finance', 'study', 'books', 'skills', 'courses', 'semesters', 'projects', 'pomodoros'];
            const tx = event.target.transaction;
            for (const storeName of storesToClear) {
              if (db.objectStoreNames.contains(storeName)) {
                tx.objectStore(storeName).clear();
              }
            }
            // 清除初始化标记，让 initSampleData 重新运行（只创建空的今日打卡）
            if (db.objectStoreNames.contains('meta')) {
              tx.objectStore('meta').delete('initialized');
            }
            console.log('[Storage] v4→v5 升级：已清除所有示例数据，从零开始');
          } catch(e) { console.error('[Storage] 升级清理出错:', e); }
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

    // 打卡记录不预设，从零开始真实积累
    // 仅初始化今天的一条空记录（日历会显示今天日期）
    await put('checkins', {
      date: todayStr,
      month: monthStr,
      time: `08:00`,
      habits: []
    });

    // 不预设任何示例数据，从零开始真实积累

    // 设置
    await put('settings', { key: 'username', value: '鹿7铭' });
    await put('settings', { key: 'streak', value: 0 });

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
