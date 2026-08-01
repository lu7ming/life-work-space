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
        const oldVersion = event.oldVersion;
        const tx = event.target.transaction;

        console.log(`[Storage] 数据库迁移: v${oldVersion} → v${DB_VERSION}`);

        /**
         * 版本迁移函数映射
         * 每个版本对应一个迁移函数，按 oldVersion+1 到 newVersion 顺序执行
         * 新增表/字段时，只需：1) DB_VERSION++  2) 新增对应迁移函数
         */
        const migrations = {
          // v1: 基础表（打卡、习惯、任务、学习、健康、财务、设置、元数据）
          1: (db) => {
            const checkins = db.createObjectStore('checkins', { keyPath: 'date' });
            checkins.createIndex('month', 'month', { unique: false });

            const habits = db.createObjectStore('habits', { keyPath: 'id', autoIncrement: true });
            habits.createIndex('category', 'category', { unique: false });

            const tasks = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
            tasks.createIndex('status', 'status', { unique: false });
            tasks.createIndex('date', 'date', { unique: false });

            const study = db.createObjectStore('study', { keyPath: 'id', autoIncrement: true });
            study.createIndex('date', 'date', { unique: false });

            const health = db.createObjectStore('health', { keyPath: 'id', autoIncrement: true });
            health.createIndex('date', 'date', { unique: false });

            const finance = db.createObjectStore('finance', { keyPath: 'id', autoIncrement: true });
            finance.createIndex('month', 'month', { unique: false });
            finance.createIndex('type', 'type', { unique: false });

            db.createObjectStore('settings', { keyPath: 'key' });
            db.createObjectStore('meta', { keyPath: 'key' });
          },

          // v2: 项目 + 番茄钟
          2: (db) => {
            const projects = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
            projects.createIndex('createdAt', 'createdAt', { unique: false });

            const pomodoros = db.createObjectStore('pomodoros', { keyPath: 'id', autoIncrement: true });
            pomodoros.createIndex('date', 'date', { unique: false });
            pomodoros.createIndex('taskId', 'taskId', { unique: false });
          },

          // v3: 学期 + 课程 + 书籍 + 技能
          3: (db) => {
            db.createObjectStore('semesters', { keyPath: 'id', autoIncrement: true });

            const courses = db.createObjectStore('courses', { keyPath: 'id', autoIncrement: true });
            courses.createIndex('semesterId', 'semesterId', { unique: false });

            const books = db.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
            books.createIndex('status', 'status', { unique: false });

            db.createObjectStore('skills', { keyPath: 'id', autoIncrement: true });
          },

          // v4: 记录反思 + 目标 + 关系 + 知识库 + 灵感 + 生命树
          4: (db) => {
            const journal = db.createObjectStore('journal', { keyPath: 'id', autoIncrement: true });
            journal.createIndex('date', 'date', { unique: false });
            journal.createIndex('type', 'type', { unique: false });

            const goals = db.createObjectStore('goals', { keyPath: 'id', autoIncrement: true });
            goals.createIndex('level', 'level', { unique: false });

            const contacts = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
            contacts.createIndex('type', 'type', { unique: false });

            const knowledge = db.createObjectStore('knowledge', { keyPath: 'id', autoIncrement: true });
            knowledge.createIndex('type', 'type', { unique: false });

            const ideas = db.createObjectStore('ideas', { keyPath: 'id', autoIncrement: true });
            ideas.createIndex('date', 'date', { unique: false });

            db.createObjectStore('lifetree', { keyPath: 'key' });
          },

          // v5: 清除示例数据，从零开始
          5: (db, tx) => {
            try {
              const storesToClear = ['checkins', 'tasks', 'finance', 'study', 'books', 'skills', 'courses', 'semesters', 'projects', 'pomodoros'];
              for (const storeName of storesToClear) {
                if (db.objectStoreNames.contains(storeName)) {
                  tx.objectStore(storeName).clear();
                }
              }
              if (db.objectStoreNames.contains('meta')) {
                tx.objectStore('meta').delete('initialized');
              }
              console.log('[Storage] v5 迁移：已清除所有示例数据');
            } catch (e) {
              console.error('[Storage] v5 迁移出错:', e);
            }
          },

          // v6: 通知表
          6: (db) => {
            const notifications = db.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
            notifications.createIndex('read', 'read', { unique: false });
            notifications.createIndex('type', 'type', { unique: false });
            notifications.createIndex('createdAt', 'createdAt', { unique: false });
          },

          // ──────────────────────────────────────────
          // 新增版本示例（取消注释并递增 DB_VERSION 即可）:
          // 7: (db, tx) => {
          //   const newStore = db.createObjectStore('newTable', { keyPath: 'id', autoIncrement: true });
          //   newStore.createIndex('field', 'field', { unique: false });
          // },
          // ──────────────────────────────────────────
        };

        // 按版本顺序依次执行迁移
        for (let v = oldVersion + 1; v <= DB_VERSION; v++) {
          if (migrations[v]) {
            console.log(`[Storage] 执行迁移 v${v}...`);
            try {
              migrations[v](db, tx);
            } catch (err) {
              console.error(`[Storage] 迁移 v${v} 失败:`, err);
            }
          } else {
            console.warn(`[Storage] 警告: 未找到 v${v} 的迁移函数`);
          }
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

  /**
   * 批量写入（单事务，性能优化）
   * @param {string} storeName - 表名
   * @param {Array<Object>} dataList - 数据列表
   * @param {'add'|'put'} mode - 写入模式
   */
  async function bulkWrite(storeName, dataList, mode = 'put') {
    if (!dataList || dataList.length === 0) return;
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let count = 0;
      for (const data of dataList) {
        const request = mode === 'add' ? store.add(data) : store.put(data);
        request.onsuccess = () => count++;
      }
      tx.oncomplete = () => resolve(count);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 批量读取（单事务，性能优化）
   * @param {string} storeName - 表名
   */
  async function bulkGetAll(storeName) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
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
    bulkWrite,
    bulkGetAll,
    initSampleData,
    migrateCourseData
  };
})();
