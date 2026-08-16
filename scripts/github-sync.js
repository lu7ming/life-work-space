/**
 * github-sync.js - GitHub 数据同步层（栖栖记忆专用）
 * 人生工作台 · 独立同步模块
 *
 * 功能：
 * 1. GitHub Contents API 封装（读/写文件）
 * 2. 栖栖记忆数据的双向 merge（按日期/按 key 合并，取较新者）
 * 3. 失败自动降级（静默，不阻塞主流程）
 * 4. Token 存 localStorage（key: github_sync_token）
 *
 * 使用方式（控制台 / 代码中）：
 *   import { GithubSync } from './github-sync.js';
 *   GithubSync.setupToken('ghp_xxx');      // 配置 token
 *   await GithubSync.syncQiqiMemory();     // 执行一次同步（读远程 → merge → 写回）
 *
 * 数据仓库：lu7ming/life-work-space-data
 * 目标文件：data/qiqi/memories.json
 * 文件结构：
 * {
 *   version: 1,
 *   updatedAt: "2026-08-16T12:00:00Z",
 *   conversations: {
 *     "2026-08-16": { date: "2026-08-16", messages: [ {role, content, timestamp} ] }
 *   },
 *   memory: {
 *     "summary/latest": { key: "summary/latest", value: "..." },
 *     "facts":          { key: "facts", value: {preferences:[], events:[], habits:[]} },
 *     "conv_count":     { key: "conv_count", value: 0 }
 *   }
 * }
 */

// ========== 常量 ==========

const REPO_OWNER = 'lu7ming';
const REPO_NAME = 'life-work-space-data';
const BRANCH = 'main';
const MEMORIES_PATH = 'data/qiqi/memories.json';
const TOKEN_STORAGE_KEY = 'github_sync_token';

const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

// ========== Token 管理 ==========

function getToken() {
  try {
    const t = localStorage.getItem(TOKEN_STORAGE_KEY);
    return t && t.trim() ? t.trim() : null;
  } catch (e) {
    return null;
  }
}

function setToken(token) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, String(token || '').trim());
    return true;
  } catch (e) {
    console.warn('[GithubSync] 保存 Token 失败:', e);
    return false;
  }
}

function hasToken() {
  return !!getToken();
}

// ========== GitHub API 底层封装 ==========

/**
 * 读取远程文件内容
 * @returns {Promise<{sha: string|null, content: any|null}>}
 */
async function fetchRemoteFile(path) {
  const token = getToken();
  if (!token) {
    return { sha: null, content: null };
  }

  try {
    const resp = await fetch(`${API_BASE}/${path}?ref=${BRANCH}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (resp.status === 404) {
      return { sha: null, content: null };
    }

    if (resp.status === 401 || resp.status === 403) {
      console.warn('[GithubSync] Token 无效或权限不足 (', resp.status, ')');
      return { sha: null, content: null, authFailed: true };
    }

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.warn('[GithubSync] 读取远程文件失败:', resp.status, errBody.slice(0, 200));
      return { sha: null, content: null };
    }

    const data = await resp.json();
    // GitHub Contents API 返回 base64 编码的 content
    const raw = atob((data.content || '').replace(/\n/g, ''));
    const content = JSON.parse(raw);
    return { sha: data.sha, content };
  } catch (e) {
    console.warn('[GithubSync] fetchRemoteFile 网络错误:', e.message);
    return { sha: null, content: null };
  }
}

/**
 * 写入文件到 GitHub（创建或更新）
 * @param {string} path - 文件路径
 * @param {any} content - 要写入的数据（会被 JSON.stringify）
 * @param {string} message - commit message
 * @param {string|null} sha - 已有文件的 SHA（更新时需要）
 * @returns {Promise<{success: boolean, sha?: string, conflict?: boolean}>}
 */
async function pushRemoteFile(path, content, message, sha = null) {
  const token = getToken();
  if (!token) {
    return { success: false };
  }

  try {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
    const body = {
      message,
      content: encoded,
      branch: BRANCH,
    };
    if (sha) {
      body.sha = sha;
    }

    const resp = await fetch(`${API_BASE}/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 409) {
      // SHA 冲突：远程文件已被其他设备修改
      console.warn('[GithubSync] 写入冲突 (409) — 远程文件已被修改');
      return { success: false, conflict: true };
    }

    if (resp.status === 401 || resp.status === 403) {
      console.warn('[GithubSync] Token 无效或权限不足 (', resp.status, ')');
      return { success: false, authFailed: true };
    }

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.warn('[GithubSync] 写入失败:', resp.status, errBody.slice(0, 200));
      return { success: false };
    }

    const data = await resp.json();
    return { success: true, sha: data?.content?.sha };
  } catch (e) {
    console.warn('[GithubSync] pushRemoteFile 网络错误:', e.message);
    return { success: false };
  }
}

// ========== 数据读取（本地 IndexedDB） ==========

/**
 * 获取 Storage 引用（全局挂载，由 app.js 注入）
 */
function _getStorage() {
  if (window.Storage?.put && window.Storage?.get && window.Storage?.getAll) {
    return window.Storage;
  }
  return null;
}

/**
 * 从本地 IndexedDB 读取所有栖栖记忆数据
 * @returns {Promise<{conversations: Object, memory: Object}|null>}
 */
async function readLocalQiqiMemory() {
  const storage = _getStorage();
  if (!storage) return null;

  try {
    const [conversationsArr, memoryArr] = await Promise.all([
      storage.getAll('qiqi_conversations'),
      storage.getAll('qiqi_memory'),
    ]);

    const conversations = {};
    for (const rec of conversationsArr) {
      if (rec?.date) conversations[rec.date] = rec;
    }

    const memory = {};
    for (const rec of memoryArr) {
      if (rec?.key) memory[rec.key] = rec;
    }

    return { conversations, memory };
  } catch (e) {
    console.warn('[GithubSync] 读取本地记忆失败:', e);
    return null;
  }
}

/**
 * 将合并后的记忆数据写回本地 IndexedDB
 * @param {{conversations: Object, memory: Object}} data
 */
async function writeLocalQiqiMemory(data) {
  const storage = _getStorage();
  if (!storage) return false;

  try {
    // 写入 conversations（按 date 覆盖更新）
    if (data.conversations) {
      const convList = Object.values(data.conversations);
      for (const rec of convList) {
        if (rec?.date) {
          await storage.put('qiqi_conversations', rec);
        }
      }
    }

    // 写入 memory（按 key 覆盖更新）
    if (data.memory) {
      const memList = Object.values(data.memory);
      for (const rec of memList) {
        if (rec?.key) {
          await storage.put('qiqi_memory', rec);
        }
      }
    }

    return true;
  } catch (e) {
    console.warn('[GithubSync] 写入本地记忆失败:', e);
    return false;
  }
}

// ========== Merge 策略 ==========

/**
 * 合并远程和本地的栖栖记忆数据
 * 规则：
 *  - conversations：按 date 合并，同一天取消息数较多 + 时间戳较新的（若都有新消息则合并去重）
 *  - memory：按 key 合并，每个 key 取 value 较新/较丰富的（用简单启发式：对象比较长度，字符串比较长度，数字取较大）
 *
 * @param {Object} remote - 远程数据 { conversations, memory }
 * @param {Object} local - 本地数据 { conversations, memory }
 * @returns {{ conversations: Object, memory: Object, changed: boolean }}
 */
function mergeMemoryData(remote, local) {
  const remoteConv = remote?.conversations || {};
  const localConv = local?.conversations || {};
  const remoteMem = remote?.memory || {};
  const localMem = local?.memory || {};

  // 合并 conversations
  const mergedConv = {};
  const allDates = new Set([...Object.keys(remoteConv), ...Object.keys(localConv)]);
  let convChanged = false;

  for (const date of allDates) {
    const r = remoteConv[date];
    const l = localConv[date];

    if (r && !l) {
      mergedConv[date] = deepClone(r);
      convChanged = true; // 本地没有，新增
    } else if (!r && l) {
      mergedConv[date] = deepClone(l);
      // 本地有远程没有，也算变更（最终会推上去）
    } else if (r && l) {
      // 两边都有，合并消息（按 timestamp 去重）
      const merged = mergeDayMessages(r.messages || [], l.messages || []);
      mergedConv[date] = {
        date,
        messages: merged.messages,
      };
      if (merged.changed) convChanged = true;
    }
  }

  // 合并 memory
  const mergedMem = {};
  const allKeys = new Set([...Object.keys(remoteMem), ...Object.keys(localMem)]);
  let memChanged = false;

  for (const key of allKeys) {
    const r = remoteMem[key];
    const l = localMem[key];

    if (r && !l) {
      mergedMem[key] = deepClone(r);
      memChanged = true;
    } else if (!r && l) {
      mergedMem[key] = deepClone(l);
    } else if (r && l) {
      // 取更"丰富"的那个
      const picked = pickRicher(r.value, l.value) === 'remote' ? r : l;
      mergedMem[key] = deepClone(picked);
      if (picked === r) memChanged = true; // 远程更新到本地
    }
  }

  return {
    conversations: mergedConv,
    memory: mergedMem,
    changed: convChanged || memChanged,
  };
}

/**
 * 深拷贝（简单 JSON 数据）
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 合并同一天的两组消息（按 timestamp 去重）
 * @param {Array} remoteMsgs
 * @param {Array} localMsgs
 * @returns {{messages: Array, changed: boolean}}
 */
function mergeDayMessages(remoteMsgs, localMsgs) {
  // 用 timestamp + role + content 的前20字符作为去重 key
  const seen = new Map();
  let changed = false;

  const addMsg = (m) => {
    if (!m || !m.timestamp) return;
    const key = `${m.timestamp}_${m.role}_${String(m.content || '').slice(0, 40)}`;
    if (!seen.has(key)) {
      seen.set(key, m);
    }
  };

  for (const m of remoteMsgs) addMsg(m);
  const remoteCount = seen.size;

  for (const m of localMsgs) addMsg(m);
  const totalCount = seen.size;

  if (totalCount > remoteCount) {
    // 有本地新增的消息，对远程来说是变化
    // 但对本地来说，如果远程更多也是变化
    changed = true;
  } else if (totalCount < remoteMsgs.length) {
    // 理论上不会发生（去重只会减少或相等），保守起见
    changed = true;
  }

  // 按时间排序
  const messages = Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);

  // 判断本地是否需要更新（远程有本地没有的消息）
  const localKeys = new Set(
    localMsgs.filter(m => m?.timestamp).map(
      m => `${m.timestamp}_${m.role}_${String(m.content || '').slice(0, 40)}`
    )
  );
  const hasRemoteOnly = Array.from(seen.keys()).some(k => !localKeys.has(k));
  if (hasRemoteOnly) changed = true;

  return { messages, changed };
}

/**
 * 比较两个值哪个更"丰富"（启发式）
 * @returns {'remote' | 'local'}
 */
function pickRicher(remoteVal, localVal) {
  // null / undefined 处理
  if (remoteVal == null && localVal != null) return 'local';
  if (localVal == null && remoteVal != null) return 'remote';
  if (remoteVal == null && localVal == null) return 'local';

  // 数字：取较大的（如 conv_count）
  if (typeof remoteVal === 'number' && typeof localVal === 'number') {
    return remoteVal > localVal ? 'remote' : 'local';
  }

  // 字符串：取较长的（如 summary）
  if (typeof remoteVal === 'string' && typeof localVal === 'string') {
    return remoteVal.length > localVal.length ? 'remote' : 'local';
  }

  // 对象/数组：比较 JSON 长度
  try {
    const rLen = JSON.stringify(remoteVal).length;
    const lLen = JSON.stringify(localVal).length;
    return rLen > lLen ? 'remote' : 'local';
  } catch (e) {
    return 'local';
  }
}

// ========== 主同步流程 ==========

/**
 * 执行一次完整的栖栖记忆同步
 * 流程：读取远程 → 读取本地 → merge → 写回本地 → 写回远程
 * 失败时静默降级，保证不影响主流程
 *
 * @returns {Promise<{success: boolean, action: string, reason?: string}>}
 */
async function syncQiqiMemory() {
  if (!hasToken()) {
    return { success: false, action: 'skipped', reason: 'no_token' };
  }

  if (!navigator.onLine) {
    console.log('[GithubSync] 当前离线，跳过同步');
    return { success: false, action: 'skipped', reason: 'offline' };
  }

  console.log('[GithubSync] 开始同步栖栖记忆...');

  try {
    // 1. 读取远程数据
    const remote = await fetchRemoteFile(MEMORIES_PATH);

    if (remote.authFailed) {
      return { success: false, action: 'failed', reason: 'auth_failed' };
    }

    const remoteData = remote.content || { conversations: {}, memory: {} };

    // 2. 读取本地数据
    const localData = await readLocalQiqiMemory();
    if (!localData) {
      console.warn('[GithubSync] 无法读取本地记忆数据，跳过同步');
      return { success: false, action: 'failed', reason: 'local_read_failed' };
    }

    // 3. Merge
    const merged = mergeMemoryData(remoteData, localData);

    const now = new Date().toISOString();
    const payload = {
      version: 1,
      updatedAt: now,
      conversations: merged.conversations,
      memory: merged.memory,
    };

    // 4. 写回本地（如果有来自远程的更新）
    if (merged.changed) {
      const localWriteOk = await writeLocalQiqiMemory({
        conversations: merged.conversations,
        memory: merged.memory,
      });
      if (!localWriteOk) {
        console.warn('[GithubSync] 本地写入失败，远程推送继续...');
      } else {
        console.log('[GithubSync] 本地记忆已更新（来自远程合并）');
      }
    }

    // 5. 写回远程（带 SHA，处理冲突）
    let pushResult = await pushRemoteFile(
      MEMORIES_PATH,
      payload,
      `sync: qiqi memory update (${now.slice(0, 10)})`,
      remote.sha
    );

    // 6. 如果 SHA 冲突，重新读一次远程再 merge 再 push（最多重试 1 次）
    if (pushResult.conflict) {
      console.log('[GithubSync] 远程冲突，重新拉取后合并再推送...');
      const remote2 = await fetchRemoteFile(MEMORIES_PATH);
      if (remote2.content) {
        const merged2 = mergeMemoryData(remote2.content, {
          conversations: merged.conversations,
          memory: merged.memory,
        });
        const payload2 = {
          version: 1,
          updatedAt: new Date().toISOString(),
          conversations: merged2.conversations,
          memory: merged2.memory,
        };
        // 同时更新本地
        await writeLocalQiqiMemory({
          conversations: merged2.conversations,
          memory: merged2.memory,
        });
        pushResult = await pushRemoteFile(
          MEMORIES_PATH,
          payload2,
          `sync: qiqi memory update (conflict resolved)`,
          remote2.sha
        );
      }
    }

    if (pushResult.success) {
      console.log('[GithubSync] 栖栖记忆同步完成 ✅');
      return { success: true, action: 'synced' };
    }

    if (pushResult.authFailed) {
      return { success: false, action: 'failed', reason: 'auth_failed' };
    }

    return { success: false, action: 'failed', reason: 'push_failed' };
  } catch (e) {
    console.error('[GithubSync] 同步异常:', e);
    return { success: false, action: 'failed', reason: 'exception', message: e.message };
  }
}

// ========== 公开 API ==========

export const GithubSync = {
  // Token 管理
  setupToken: setToken,
  hasToken,
  getToken,

  // 主入口
  syncQiqiMemory,

  // 底层 API（供调试用）
  _fetchRemoteFile: () => fetchRemoteFile(MEMORIES_PATH),
  _readLocal: readLocalQiqiMemory,
  _merge: mergeMemoryData,

  // 常量
  TOKEN_KEY: TOKEN_STORAGE_KEY,
  REPO: `${REPO_OWNER}/${REPO_NAME}`,
  PATH: MEMORIES_PATH,
};

// 暴露到全局（供 console 调试和临时入口调用）
if (typeof window !== 'undefined') {
  window.GithubSync = GithubSync;

  /**
   * 控制台临时入口：配置 GitHub Token 并立即同步一次
   * 用法：在浏览器控制台输入 setupGithubSync('ghp_your_token_here')
   */
  window.setupGithubSync = async function(token) {
    if (!token || typeof token !== 'string') {
      console.log('%c[GithubSync] 用法: setupGithubSync(\"ghp_your_token\")', 'color:#999');
      console.log('%c  Token 会保存在 localStorage.github_sync_token', 'color:#999');
      console.log('%c  支持的仓库: lu7ming/life-work-space-data', 'color:#999');
      console.log('%c  目标文件: data/qiqi/memories.json', 'color:#999');
      return;
    }
    setToken(token);
    console.log('%c[GithubSync] Token 已保存，开始同步...', 'color:#4a9');
    const result = await syncQiqiMemory();
    if (result.success) {
      console.log('%c[GithubSync] 同步成功 ✅', 'color:#4a9;font-weight:bold');
    } else {
      console.log(`%c[GithubSync] 同步失败: ${result.reason || result.action}`, 'color:#e77');
    }
    return result;
  };

  console.log('%c[GithubSync] 已加载。输入 setupGithubSync(token) 配置并同步。', 'color:#6a9;font-size:12px');
}

export default GithubSync;
