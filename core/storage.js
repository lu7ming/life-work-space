/**
 * storage.js - IndexedDB 封装（Promise 化）
 * 人生工作台 · 数据持久层
 */

export const DB_NAME = 'LifeWorkSpace';
export const DB_VERSION = 14;

/**
 * 存储管理器
 * 提供对 IndexedDB 的 Promise 风格封装
 */
export const Storage = (() => {
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

          // v7: 时间追踪 + 审计日志 + 情绪记录
          7: (db) => {
            const timeEntries = db.createObjectStore('time_entries', { keyPath: 'id', autoIncrement: true });
            timeEntries.createIndex('date', 'date', { unique: false });
            timeEntries.createIndex('category', 'category', { unique: false });
            timeEntries.createIndex('taskId', 'taskId', { unique: false });

            const auditLog = db.createObjectStore('audit_log', { keyPath: 'id', autoIncrement: true });
            auditLog.createIndex('timestamp', 'timestamp', { unique: false });
            auditLog.createIndex('action', 'action', { unique: false });
          },

          // v8: 情绪追踪系统 - 为日记记录增加 mood_score 和 mood_note 字段
          // 旧日记记录兼容迁移：mood_score 默认 null，mood_note 默认空字符串
          8: (db, tx) => {
            console.log('[Storage] v8 迁移：情绪追踪字段兼容（旧记录 mood_score/mood_note 默认 null）');
            // IndexedDB 是 schemaless，无需 ALTER TABLE
            // 旧记录读取时自动兼容：mood_score 为 undefined → 视为 null
            // 此迁移仅作为版本标记，确保 onupgradeneeded 触发
          },

          // v9: AI 操作审计日志表
          9: (db) => {
            // 如果已存在旧版 audit_log 表（v7 创建），先删除重建为新的 audit_logs
            if (db.objectStoreNames.contains('audit_log')) {
              db.deleteObjectStore('audit_log');
              console.log('[Storage] v9 迁移：已删除旧版 audit_log 表');
            }
            const auditLogs = db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
            auditLogs.createIndex('timestamp', 'timestamp', { unique: false });
            auditLogs.createIndex('action', 'action', { unique: false });
            auditLogs.createIndex('source', 'source', { unique: false });
            auditLogs.createIndex('date', 'date', { unique: false });
            console.log('[Storage] v9 迁移：已创建 audit_logs 表（含 timestamp/action/source/date 索引）');
          },
          // v10: 创作日程模块
          10: (db) => {
            const contentTopics = db.createObjectStore('content_topics', { keyPath: 'id' });
            contentTopics.createIndex('status', 'status', { unique: false });
            contentTopics.createIndex('category', 'category', { unique: false });
            const contentShootings = db.createObjectStore('content_shootings', { keyPath: 'id' });
            contentShootings.createIndex('date', 'date', { unique: false });
            contentShootings.createIndex('topicId', 'topicId', { unique: false });
            const contentPublished = db.createObjectStore('content_published', { keyPath: 'id' });
            contentPublished.createIndex('date', 'date', { unique: false });
            contentPublished.createIndex('topicId', 'topicId', { unique: false });
            console.log('[Storage] v10 迁移：已创建创作日程表（content_topics/content_shootings/content_published）');
          },
          // v11: 离线增量同步 - 操作日志队列
          11: (db) => {
            const syncQueue = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
            syncQueue.createIndex('synced', 'synced', { unique: false });
            syncQueue.createIndex('storeName', 'storeName', { unique: false });
            syncQueue.createIndex('timestamp', 'timestamp', { unique: false });
            console.log('[Storage] v11 迁移：已创建 sync_queue 表（增量同步操作日志）');
          },
          // v12: 成就勋章系统
          12: (db) => {
            const achievements = db.createObjectStore('achievements', { keyPath: 'id' });
            achievements.createIndex('category', 'category', { unique: false });
            achievements.createIndex('unlockedAt', 'unlockedAt', { unique: false });
            console.log('[Storage] v12 迁移：已创建 achievements 表（成就勋章系统）');
          },
          // v13: 旅行计划模块
          13: (db) => {
            const travel = db.createObjectStore('travel', { keyPath: 'id' });
            travel.createIndex('stage', 'stage', { unique: false });
            console.log('[Storage] v13 迁移：已创建 travel 表（旅行计划模块）');
          },
          // v14: 购物车模块
          14: (db) => {
            const shoppingItems = db.createObjectStore('shopping_items', { keyPath: 'id', autoIncrement: true });
            shoppingItems.createIndex('status', 'status', { unique: false });
            shoppingItems.createIndex('category', 'category', { unique: false });
            console.log('[Storage] v14 迁移：已创建 shopping_items 表（购物车模块）');
          },
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

  // ========== 增量同步：操作日志 ==========

  /** 同步无关的表，不记录到 sync_queue */
  const SYNC_EXCLUDED_STORES = new Set([
    'settings', 'meta', 'audit_logs', 'sync_queue'
  ]);

  /**
   * 记录操作到 sync_queue（静默，不影响主操作）
   * @param {'add'|'put'|'remove'} operation
   * @param {string} storeName
   * @param {*} key
   * @param {Object} [data]
   */
  async function _logSyncOperation(operation, storeName, key, data) {
    if (SYNC_EXCLUDED_STORES.has(storeName)) return;
    try {
      const db = await getDB();
      if (!db.objectStoreNames.contains('sync_queue')) return;
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      store.add({
        timestamp: Date.now(),
        operation,
        storeName,
        key,
        data: operation !== 'remove' ? data : undefined,
        synced: false
      });
      // 不 await tx.oncomplete — 日志写入不阻塞主操作
    } catch (e) {
      console.warn('[Storage] sync_queue 记录失败:', e);
    }
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
      request.onsuccess = async () => {
        // 提取 keyPath 对应的主键值用于日志
        const db = await getDB();
        const storeObj = db.transaction(storeName, 'readonly').objectStore(storeName);
        const keyPath = storeObj.keyPath;
        const keyVal = keyPath ? (typeof keyPath === 'string' ? data[keyPath] : keyPath.map(k => data[k])) : request.result;
        _logSyncOperation('add', storeName, keyVal, data);
        resolve(request.result);
      };
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
      request.onsuccess = async () => {
        const db = await getDB();
        const storeObj = db.transaction(storeName, 'readonly').objectStore(storeName);
        const keyPath = storeObj.keyPath;
        const keyVal = keyPath ? (typeof keyPath === 'string' ? data[keyPath] : keyPath.map(k => data[k])) : request.result;
        _logSyncOperation('put', storeName, keyVal, data);
        resolve(request.result);
      };
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
      request.onsuccess = () => {
        _logSyncOperation('remove', storeName, key, undefined);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除一条记录（delete 别名，兼容旧调用）
   * @param {string} storeName - 表名
   * @param {*} key - 主键值
   */
  async function deleteRecord(storeName, key) {
    return remove(storeName, key);
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

  /**
   * 分页查询（基于索引的游标分页）
   * @param {string} storeName - 表名
   * @param {string} indexName - 索引名
   * @param {*} indexValue - 索引值
   * @param {number} offset - 偏移量
   * @param {number} limit - 每页数量
   * @param {'next'|'prev'} direction - 游标方向
   */
  async function getPage(storeName, indexName, indexValue, offset = 0, limit = 20, direction = 'prev') {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const range = indexValue !== null && indexValue !== undefined ? IDBKeyRange.only(indexValue) : null;
      const results = [];
      let skipped = 0;

      const request = range
        ? index.openCursor(range, direction)
        : index.openCursor(null, direction);

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) { resolve(results); return; }
        if (skipped < offset) { skipped++; cursor.continue(); return; }
        results.push(cursor.value);
        if (results.length < limit) cursor.continue();
        else resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 按索引范围查询
   * @param {string} storeName - 表名
   * @param {string} indexName - 索引名
   * @param {IDBKeyRange} range - 键范围
   */
  async function getByRange(storeName, indexName, range) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(range);
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
    deleteRecord,
    clear,
    count,
    bulkWrite,
    bulkGetAll,
    getPage,
    getByRange,
    initSampleData,
    migrateCourseData,
    /** 同步无关的表名集合（供 SyncModule 引用） */
    SYNC_EXCLUDED_STORES
  };
})();

/**
 * MigrationRegistry - 数据迁移注册表
 */
export const MigrationRegistry = (() => {
  const _migrations = new Map();

  function register(fromVer, toVer, migrateFn) {
    _migrations.set(`${fromVer}-${toVer}`, migrateFn);
  }

  async function run(db, oldVer, newVer, tx) {
    for (let v = oldVer + 1; v <= newVer; v++) {
      const fn = _migrations.get(`${v - 1}-${v}`);
      if (fn) {
        console.log(`[MigrationRegistry] Running ${v - 1} → ${v}`);
        try { await fn(db, tx); } catch (e) { console.error(`[MigrationRegistry] 迁移 ${v} 失败:`, e); }
      }
    }
  }

  function list() {
    return Array.from(_migrations.entries()).map(([k, v]) => ({ version: k, fn: v.name || 'anonymous' }));
  }

  return { register, run, list };
})();
