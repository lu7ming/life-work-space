/**
 * sync.js - 数据同步模块
 * 人生工作台 · 同步数据到 GitHub（全量 + 增量）
 */
import { Storage } from './storage.js';
import { SecureStorage } from './secure-storage.js';
import { ExportModule } from './export.js';
import { AppUtils } from './utils.js';
import { EventBus } from './event-bus.js';


export const SyncModule = (() => {

  const REPO_OWNER = 'lu7ming';
  const REPO_NAME = 'life-work-space';
  const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
  const BRANCH = 'main';

  /** 增量同步相关常量 */
  const SYNC_QUEUE_STORE = 'sync_queue';
  const LATEST_PATH = 'user-data/latest.json';
  const QUEUE_COMPRESS_THRESHOLD = 500; // 超过 500 条时自动压缩

  /** 增量同步状态 */
  let _isSyncing = false;
  let _onlineListenerAttached = false;

  // ========== 样式注入 ==========
  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .sync-overlay {
        position: fixed; inset: 0;
        background: rgba(61,48,39,0.35);
        z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease;
      }
      .sync-dialog {
        background: var(--bg-card, #fff);
        border-radius: var(--radius-lg, 16px);
        box-shadow: var(--shadow-lg);
        width: 420px; max-width: 92vw;
        display: flex; flex-direction: column;
        animation: slideUp 0.25s ease;
        overflow: hidden;
      }
      .sync-dialog-header {
        padding: 20px 24px 12px;
        border-bottom: 1px solid var(--border-light);
      }
      .sync-dialog-header h3 {
        font-size: 18px; font-weight: 600;
        color: var(--text-primary); margin: 0;
      }
      .sync-dialog-header p {
        font-size: 13px; color: var(--text-muted); margin: 4px 0 0;
      }
      .sync-dialog-body {
        padding: 20px 24px;
      }
      .sync-dialog-footer {
        padding: 12px 24px 20px;
        border-top: 1px solid var(--border-light);
        display: flex; gap: 10px; justify-content: flex-end;
      }
      .sync-input-group {
        margin-bottom: 16px;
      }
      .sync-input-group label {
        display: block; font-size: 13px; font-weight: 500;
        color: var(--text-secondary); margin-bottom: 6px;
      }
      .sync-input-group input {
        width: 100%; padding: 10px 12px;
        border: 1.5px solid var(--border-light);
        border-radius: var(--radius-sm);
        font-size: 14px; color: var(--text-primary);
        background: var(--bg-main);
        box-sizing: border-box;
        transition: border-color var(--transition-fast);
      }
      .sync-input-group input:focus {
        outline: none; border-color: var(--accent-green);
      }
      .sync-input-group .input-hint {
        font-size: 12px; color: var(--text-muted); margin-top: 6px; line-height: 1.5;
      }
      .sync-input-group .input-hint a {
        color: var(--accent-blue); text-decoration: none;
      }
      .sync-input-group .input-hint a:hover {
        text-decoration: underline;
      }
      .sync-status {
        text-align: center; padding: 20px 0;
      }
      .sync-status .sync-spinner {
        display: inline-block; width: 32px; height: 32px;
        border: 3px solid var(--border-light);
        border-top-color: var(--accent-green);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 12px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .sync-status p {
        font-size: 14px; color: var(--text-secondary); margin: 4px 0;
      }
      .sync-btn {
        padding: 8px 20px; border-radius: var(--radius-full);
        font-size: 14px; font-weight: 500; cursor: pointer;
        border: none; transition: all var(--transition-fast);
      }
      .sync-btn-primary {
        background: var(--accent-green); color: #fff;
      }
      .sync-btn-primary:hover { filter: brightness(1.08); }
      .sync-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .sync-btn-secondary {
        background: var(--bg-main); color: var(--text-secondary);
        border: 1px solid var(--border-light);
      }
      .sync-btn-secondary:hover { background: var(--bg-hover); }
      /* 增量同步模式选择 */
      .sync-mode-list {
        display: flex; flex-direction: column; gap: 10px; margin-top: 12px;
      }
      .sync-mode-card {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 14px 16px; border-radius: var(--radius-sm);
        border: 1.5px solid var(--border-light);
        cursor: pointer; transition: all var(--transition-fast);
      }
      .sync-mode-card:hover {
        border-color: var(--accent-green); background: var(--bg-hover);
      }
      .sync-mode-card.selected {
        border-color: var(--accent-green); background: var(--bg-hover);
      }
      .sync-mode-icon {
        font-size: 22px; line-height: 1; flex-shrink: 0;
      }
      .sync-mode-info h4 {
        font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0;
      }
      .sync-mode-info p {
        font-size: 12px; color: var(--text-muted); margin: 3px 0 0; line-height: 1.4;
      }
      .sync-queue-badge {
        display: inline-block; padding: 1px 7px;
        background: var(--accent-green); color: #fff;
        border-radius: 10px; font-size: 11px; font-weight: 600;
        margin-left: 6px; vertical-align: middle;
      }
      /* 冲突提示 */
      .sync-conflict-info {
        background: var(--bg-hover);
        border-radius: var(--radius-sm);
        padding: 12px 16px; margin-top: 12px;
        font-size: 13px; color: var(--text-secondary);
        line-height: 1.5;
      }
      .sync-conflict-info strong {
        color: var(--accent-orange, #E8913A);
      }
    `;
    document.head.appendChild(style);
  }

  // ========== Token 管理 ==========

  /**
   * 从 IndexedDB 读取 GitHub Token
   */
  async function getGithubToken() {
    try {
      const setting = await Storage.get('settings', 'github_token');
      return setting ? setting.value : null;
    } catch (e) {
      console.warn('[Sync] 读取 GitHub Token 失败:', e);
      return null;
    }
  }

  /**
   * 保存 GitHub Token 到 IndexedDB
   */
  async function saveGithubToken(token) {
    await Storage.put('settings', { key: 'github_token', value: token });
  }

  // ========== Token 输入弹窗 ==========

  /**
   * 弹出 Token 输入对话框
   * @returns {Promise<string|null>} 用户输入的 token，取消返回 null
   */
  function showTokenDialog() {
    return new Promise((resolve) => {
      injectStyles();
      const overlay = document.createElement('div');
      overlay.className = 'sync-overlay';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(null);
        }
      });

      overlay.innerHTML = `
        <div class="sync-dialog">
          <div class="sync-dialog-header">
            <h3>☁️ 配置 GitHub Token</h3>
            <p>首次同步需要配置 Personal Access Token</p>
          </div>
          <div class="sync-dialog-body">
            <div class="sync-input-group">
              <label for="sync-token-input">GitHub PAT (Personal Access Token)</label>
              <input type="password" id="sync-token-input" placeholder="github_pat_xxxxx..." autocomplete="off">
              <div class="input-hint">
                前往 <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">GitHub Settings → Tokens</a> 创建 Token，需要勾选 <strong>repo</strong> 权限。
              </div>
            </div>
          </div>
          <div class="sync-dialog-footer">
            <button class="sync-btn sync-btn-secondary" id="sync-token-cancel">取消</button>
            <button class="sync-btn sync-btn-primary" id="sync-token-confirm">保存并同步</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('#sync-token-input');
      const cancelBtn = overlay.querySelector('#sync-token-cancel');
      const confirmBtn = overlay.querySelector('#sync-token-confirm');

      // 自动聚焦
      setTimeout(() => input.focus(), 100);

      cancelBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });

      confirmBtn.addEventListener('click', () => {
        const token = input.value.trim();
        if (!token) {
          window.App?.showToast('请输入 GitHub Token');
          return;
        }
        overlay.remove();
        resolve(token);
      });

      // 回车提交
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmBtn.click();
      });
    });
  }

  // ========== 同步进度弹窗 ==========

  function showSyncingDialog(title, subtitle) {
    injectStyles();
    const overlay = document.createElement('div');
    overlay.className = 'sync-overlay';
    overlay.innerHTML = `
      <div class="sync-dialog">
        <div class="sync-dialog-header">
          <h3>${title || '☁️ 同步中...'}</h3>
          <p>${subtitle || '正在将数据推送到 GitHub'}</p>
        </div>
        <div class="sync-dialog-body">
          <div class="sync-status">
            <div class="sync-spinner"></div>
            <p id="sync-progress-text">正在读取数据...</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function updateSyncProgress(overlay, text) {
    const el = overlay.querySelector('#sync-progress-text');
    if (el) el.textContent = text;
  }

  function closeSyncDialog(overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s ease';
    setTimeout(() => overlay.remove(), 200);
  }

  // ========== GitHub API ==========

  /**
   * 生成时间戳文件名
   */
  function generateFilename() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `backup_${y}${m}${d}_${h}${min}${s}.json`;
  }

  /**
   * 获取远程文件的 SHA 和内容（用于增量同步）
   * @returns {Promise<{sha: string|null, content: Object|null}>}
   */
  async function getRemoteFile(token, path) {
    try {
      const resp = await fetch(`${API_BASE}/${path}?ref=${BRANCH}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (resp.status === 404) return { sha: null, content: null };
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`获取远程文件失败 (${resp.status}): ${errBody}`);
      }
      const data = await resp.json();
      // GitHub Contents API 返回 base64 编码的 content
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
      return {
        sha: data.sha,
        content: JSON.parse(decoded)
      };
    } catch (e) {
      if (e.message && e.message.includes('404')) return { sha: null, content: null };
      throw e;
    }
  }

  /**
   * 获取远程文件的 SHA（用于更新已有文件）
   */
  async function getFileSha(token, path) {
    try {
      const resp = await fetch(`${API_BASE}/${path}?ref=${BRANCH}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (resp.status === 404) return null;
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`获取文件信息失败 (${resp.status}): ${errBody}`);
      }
      const data = await resp.json();
      return data.sha;
    } catch (e) {
      if (e.message && e.message.includes('404')) return null;
      throw e;
    }
  }

  /**
   * 推送文件到 GitHub
   */
  async function pushFile(token, path, content, message, sha) {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const body = {
      message: message,
      content: encoded,
      branch: BRANCH
    };
    if (sha) {
      body.sha = sha;
    }

    const resp = await fetch(`${API_BASE}/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      // SHA 冲突（409 Conflict）— 远程被其他设备修改
      if (resp.status === 409) {
        const err = new Error(`SHA_CONFLICT: 远程文件已被修改 (${errBody})`);
        err.isConflict = true;
        throw err;
      }
      throw new Error(`推送失败 (${resp.status}): ${errBody}`);
    }
    return await resp.json();
  }

  // ========== 增量同步：操作队列 ==========

  /**
   * 读取 sync_queue 中所有未同步记录
   */
  async function getPendingOps() {
    try {
      const all = await Storage.getAll(SYNC_QUEUE_STORE);
      return all.filter(op => !op.synced);
    } catch (e) {
      console.warn('[Sync] 读取 sync_queue 失败:', e);
      return [];
    }
  }

  /**
   * 获取待同步操作数量
   */
  async function getPendingCount() {
    const pending = await getPendingOps();
    return pending.length;
  }

  /**
   * 将增量操作应用到远程数据上（按时间顺序）
   * @param {Object} remoteData - 远程 latest.json 的 data 字段
   * @param {Array} ops - sync_queue 中未同步的操作记录
   * @returns {Object} 合并后的数据
   */
  function applyOpsToRemote(remoteData, ops) {
    // 按时间排序
    const sorted = [...ops].sort((a, b) => a.timestamp - b.timestamp);

    // 深拷贝远程数据
    const merged = {};
    for (const storeName of Object.keys(remoteData)) {
      merged[storeName] = Array.isArray(remoteData[storeName])
        ? remoteData[storeName].map(r => ({ ...r }))
        : remoteData[storeName];
    }

    // 逐条应用操作
    for (const op of sorted) {
      // 确保目标表存在
      if (!merged[op.storeName]) {
        merged[op.storeName] = [];
      }

      const storeData = merged[op.storeName];

      if (op.operation === 'remove') {
        // 删除：从数组中移除匹配主键的记录
        const idx = storeData.findIndex(r => {
          if (typeof op.key === 'object' && op.key !== null) {
            // 复合主键
            return Object.keys(op.key).every(k => r[k] === op.key[k]);
          }
          // 单一主键：尝试常见主键字段
          return r.id === op.key || r.date === op.key || r.key === op.key;
        });
        if (idx !== -1) storeData.splice(idx, 1);
      } else if (op.operation === 'put') {
        // 更新或插入
        const keyVal = op.key;
        const idx = storeData.findIndex(r => {
          if (typeof keyVal === 'object' && keyVal !== null) {
            return Object.keys(keyVal).every(k => r[k] === keyVal[k]);
          }
          return r.id === keyVal || r.date === keyVal || r.key === keyVal;
        });
        if (idx !== -1) {
          // 合并更新：保留远程可能有而本地操作未覆盖的字段
          Object.assign(storeData[idx], op.data);
        } else {
          storeData.push({ ...op.data });
        }
      } else if (op.operation === 'add') {
        // 新增（如果主键已存在则跳过，避免重复）
        const keyVal = op.key;
        const exists = storeData.some(r => {
          if (typeof keyVal === 'object' && keyVal !== null) {
            return Object.keys(keyVal).every(k => r[k] === keyVal[k]);
          }
          return r.id === keyVal || r.date === keyVal || r.key === keyVal;
        });
        if (!exists) {
          storeData.push({ ...op.data });
        }
      }
    }

    return merged;
  }

  /**
   * 标记 sync_queue 中指定 ID 列表为已同步（删除）
   * @param {Array<number>} ids
   */
  async function markOpsSynced(ids) {
    if (!ids || ids.length === 0) return;
    try {
      const db = await Storage.getDB();
      const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(SYNC_QUEUE_STORE);
      for (const id of ids) {
        store.delete(id);
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      console.log(`[Sync] 已清理 ${ids.length} 条 sync_queue 记录`);
    } catch (e) {
      console.warn('[Sync] 清理 sync_queue 失败:', e);
    }
  }

  /**
   * 队列压缩：合并同一记录的多次操作
   * 当 sync_queue 超过阈值时触发
   */
  async function compressQueue() {
    try {
      const all = await Storage.getAll(SYNC_QUEUE_STORE);
      const pending = all.filter(op => !op.synced);
      if (pending.length < QUEUE_COMPRESS_THRESHOLD) return;

      console.log(`[Sync] sync_queue 有 ${pending.length} 条记录，开始压缩...`);

      // 按 storeName+key 分组
      const groups = new Map();
      for (const op of pending) {
        const groupKey = `${op.storeName}::${JSON.stringify(op.key)}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(op);
      }

      // 对每组，保留最后一条有效操作
      const toDelete = [];
      const toReplace = [];

      for (const [, ops] of groups) {
        if (ops.length <= 1) continue;
        // 按时间排序
        ops.sort((a, b) => a.timestamp - b.timestamp);
        // 保留最后一条，删除其余
        const lastOp = ops[ops.length - 1];
        for (let i = 0; i < ops.length - 1; i++) {
          toDelete.push(ops[i].id);
        }
        // 如果中间有 remove 后又有 add/put，最终状态就是最后那条
        // 无需额外处理，删除中间记录即可
      }

      if (toDelete.length > 0) {
        const db = await Storage.getDB();
        const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
        const store = tx.objectStore(SYNC_QUEUE_STORE);
        for (const id of toDelete) {
          store.delete(id);
        }
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        console.log(`[Sync] 队列压缩完成：删除 ${toDelete.length} 条冗余记录`);
      }
    } catch (e) {
      console.warn('[Sync] 队列压缩失败:', e);
    }
  }

  // ========== 增量同步主流程 ==========

  /**
   * 执行增量同步
   * 1. 读取远程 latest.json 的 SHA 和内容作为基线
   * 2. 读取本地 sync_queue 中 synced=false 的记录
   * 3. 将增量操作应用到远程数据
   * 4. PUT 更新 latest.json（带 SHA 防冲突）
   * 5. 成功后清理 sync_queue
   */
  async function syncIncremental() {
    if (_isSyncing) {
      console.log('[Sync] 增量同步进行中，跳过');
      return;
    }
    _isSyncing = true;

    // 1. 获取 Token
    let token = await getGithubToken();
    if (!token) {
      token = await showTokenDialog();
      if (!token) { _isSyncing = false; return; }
      await saveGithubToken(token);
    }

    // 2. 队列压缩
    await compressQueue();

    // 3. 读取待同步操作
    const pendingOps = await getPendingOps();
    if (pendingOps.length === 0) {
      _isSyncing = false;
      window.App?.showToast('☁️ 没有待同步的变更');
      return;
    }

    // 4. 显示同步进度
    const overlay = showSyncingDialog(
      '☁️ 增量同步中...',
      `正在推送 ${pendingOps.length} 条操作到 GitHub`
    );

    try {
      // 5. 获取远程 latest.json
      updateSyncProgress(overlay, '正在读取远程数据...');
      let remote = await getRemoteFile(token, LATEST_PATH);

      let mergedData;

      if (!remote.content) {
        // 远程没有 latest.json → 降级为全量推送
        updateSyncProgress(overlay, '远程无数据，降级为全量推送...');
        console.log('[Sync] 远程无 latest.json，自动降级为全量推送');
        closeSyncDialog(overlay);
        _isSyncing = false;
        return await sync();
      }

      // 6. 将增量操作应用到远程数据
      updateSyncProgress(overlay, `正在合并 ${pendingOps.length} 条增量操作...`);
      mergedData = applyOpsToRemote(remote.content.data || {}, pendingOps);

      // 7. 构建 latest.json 内容
      const now = new Date();
      const jsonContent = JSON.stringify({
        version: 5,
        exportDate: now.toISOString().slice(0, 19),
        data: mergedData
      }, null, 2);

      // 8. PUT 更新 latest.json（带 SHA 防冲突）
      updateSyncProgress(overlay, '正在推送到 GitHub...');
      await pushFile(token, LATEST_PATH, jsonContent, `incremental sync: ${pendingOps.length} ops`, remote.sha);

      // 9. 同时推送一份带时间戳的备份
      const filename = generateFilename();
      const backupPath = `user-data/${filename}`;
      updateSyncProgress(overlay, '正在创建备份...');
      await pushFile(token, backupPath, jsonContent, `backup: ${filename}`, null);

      // 10. 标记已同步
      const syncedIds = pendingOps.map(op => op.id);
      await markOpsSynced(syncedIds);

      // 11. 记录同步时间
      await Storage.put('settings', {
        key: 'last_sync_time',
        value: now.toISOString()
      });

      closeSyncDialog(overlay);
      window.App?.showToast(`☁️ 增量同步完成（${pendingOps.length} 条操作）✅`);
      console.log(`[Sync] 增量同步完成: ${pendingOps.length} 条操作已推送`);

    } catch (err) {
      console.error('[Sync] 增量同步失败:', err);
      closeSyncDialog(overlay);

      if (err.isConflict) {
        // SHA 冲突：远程被其他设备修改
        await showConflictDialog();
      } else {
        showSyncError(err);
      }
    } finally {
      _isSyncing = false;
    }
  }

  /**
   * SHA 冲突处理弹窗
   */
  async function showConflictDialog() {
    injectStyles();
    const pendingCount = await getPendingCount();

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sync-overlay';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.remove(); resolve(); }
      });

      overlay.innerHTML = `
        <div class="sync-dialog">
          <div class="sync-dialog-header">
            <h3>⚠️ 同步冲突</h3>
            <p>远程数据已被其他设备修改</p>
          </div>
          <div class="sync-dialog-body">
            <div class="sync-conflict-info">
              <strong>冲突原因：</strong>你在其他设备上进行了数据修改，与本地待推送的 ${pendingCount} 条操作发生冲突。<br><br>
              <strong>建议操作：</strong><br>
              • 点击 <strong>强制全量同步</strong> 以本地数据覆盖远程<br>
              • 点击 <strong>取消</strong> 稍后手动处理
            </div>
          </div>
          <div class="sync-dialog-footer">
            <button class="sync-btn sync-btn-secondary" id="conflict-cancel">取消</button>
            <button class="sync-btn sync-btn-primary" id="conflict-force">强制全量同步</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelector('#conflict-cancel').addEventListener('click', () => {
        overlay.remove();
        resolve();
      });

      overlay.querySelector('#conflict-force').addEventListener('click', async () => {
        overlay.remove();
        // 强制全量同步会以本地全量数据覆盖远程
        try {
          await sync();
        } catch (e) {
          console.error('[Sync] 强制全量同步失败:', e);
        }
        resolve();
      });
    });
  }

  /**
   * 显示同步错误 toast
   */
  async function showSyncError(err) {
    let msg = '同步失败';
    const errMsg = err.message || '';
    if (errMsg.includes('401') || errMsg.includes('Bad credentials')) {
      msg = '认证失败，Token 可能已过期，请重新配置';
      await Storage.remove('settings', 'github_token');
    } else if (errMsg.includes('403')) {
      msg = '权限不足，请检查 Token 是否有 repo 权限';
    } else if (errMsg.includes('404')) {
      msg = '仓库不存在或无权访问';
    } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('network')) {
      msg = '网络连接失败，请检查网络后重试';
    } else if (errMsg.includes('推送失败') || errMsg.includes('获取远程文件失败') || errMsg.includes('获取文件信息失败')) {
      msg = 'GitHub API 请求失败: ' + errMsg.slice(0, 80);
    }
    window.App?.showToast('☁️ ' + msg);
  }

  // ========== 同步模式选择弹窗 ==========

  /**
   * 弹出同步模式选择对话框
   */
  async function showSyncModeDialog() {
    const pendingCount = await getPendingCount();

    injectStyles();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sync-overlay';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.remove(); resolve(null); }
      });

      overlay.innerHTML = `
        <div class="sync-dialog">
          <div class="sync-dialog-header">
            <h3>☁️ 数据同步</h3>
            <p>选择同步方式</p>
          </div>
          <div class="sync-dialog-body">
            <div class="sync-mode-list">
              <div class="sync-mode-card" id="sync-mode-incremental">
                <span class="sync-mode-icon">⚡</span>
                <div class="sync-mode-info">
                  <h4>增量同步${pendingCount > 0 ? `<span class="sync-queue-badge">${pendingCount}</span>` : ''}</h4>
                  <p>仅推送本地变更操作，速度快、流量省</p>
                </div>
              </div>
              <div class="sync-mode-card" id="sync-mode-full">
                <span class="sync-mode-icon">📦</span>
                <div class="sync-mode-info">
                  <h4>全量同步</h4>
                  <p>将所有数据完整推送到 GitHub，确保数据一致</p>
                </div>
              </div>
            </div>
            ${!navigator.onLine ? '<div class="sync-conflict-info"><strong>当前离线</strong>，操作将记录到队列，联网后自动同步</div>' : ''}
          </div>
          <div class="sync-dialog-footer">
            <button class="sync-btn sync-btn-secondary" id="sync-mode-cancel">取消</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // 默认选中增量同步
      const incCard = overlay.querySelector('#sync-mode-incremental');
      incCard.classList.add('selected');

      incCard.addEventListener('click', () => {
        overlay.remove();
        resolve('incremental');
      });

      overlay.querySelector('#sync-mode-full').addEventListener('click', () => {
        overlay.remove();
        resolve('full');
      });

      overlay.querySelector('#sync-mode-cancel').addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });
    });
  }

  // ========== 在线状态监听 ==========

  /**
   * 注册 online 事件监听，联网后自动触发增量同步
   */
  function listenOnline() {
    if (_onlineListenerAttached) return;
    _onlineListenerAttached = true;

    window.addEventListener('online', async () => {
      console.log('[Sync] 网络恢复，检查待同步队列...');
      try {
        const pendingCount = await getPendingCount();
        if (pendingCount > 0) {
          console.log(`[Sync] 有 ${pendingCount} 条待同步操作，触发增量同步`);
          // 延迟 3 秒，避免网络刚恢复时请求不稳定
          setTimeout(() => syncIncremental(), 3000);
        }
      } catch (e) {
        console.warn('[Sync] online 事件处理失败:', e);
      }
    });

    console.log('[Sync] online 事件监听已注册');
  }

  // ========== 全量同步主流程 ==========

  /**
   * 执行全量同步（保留原有逻辑）
   */
  async function sync() {
    // 1. 获取 Token
    let token = await getGithubToken();
    if (!token) {
      token = await showTokenDialog();
      if (!token) return; // 用户取消
      await saveGithubToken(token);
    }

    // 2. 显示同步进度
    const overlay = showSyncingDialog();

    try {
      // 3. 读取数据
      updateSyncProgress(overlay, '正在读取数据...');
      if (false) {
        throw new Error('导出模块未加载');
      }
      const allData = await window.ExportModule?.readAllData();

      // 4. 构建 JSON
      updateSyncProgress(overlay, '正在准备备份文件...');
      const now = new Date();
      const jsonContent = JSON.stringify({
        version: 5,
        exportDate: now.toISOString().slice(0, 19),
        data: allData
      }, null, 2);

      // 5. 推送带时间戳的备份文件
      const filename = generateFilename();
      const backupPath = `user-data/${filename}`;
      updateSyncProgress(overlay, '正在推送备份文件...');
      await pushFile(token, backupPath, jsonContent, `backup: ${filename}`, null);

      // 6. 推送 latest.json（获取已有 SHA 用于更新）
      updateSyncProgress(overlay, '正在更新 latest.json...');
      const latestSha = await getFileSha(token, LATEST_PATH);
      await pushFile(token, LATEST_PATH, jsonContent, `sync: update latest backup`, latestSha);

      // 7. 记录同步时间
      await Storage.put('settings', {
        key: 'last_sync_time',
        value: now.toISOString()
      });

      // 8. 全量同步成功后，清理 sync_queue（所有操作已包含在全量数据中）
      try {
        await Storage.clear(SYNC_QUEUE_STORE);
        console.log('[Sync] 全量同步后已清理 sync_queue');
      } catch (e) {
        console.warn('[Sync] 清理 sync_queue 失败:', e);
      }

      // 完成
      closeSyncDialog(overlay);
      window.App?.showToast('☁️ 数据已同步到云端 ✅');
      console.log(`[Sync] 同步完成: ${backupPath}`);

    } catch (err) {
      console.error('[Sync] 同步失败:', err);
      closeSyncDialog(overlay);

      if (err.isConflict) {
        await showConflictDialog();
      } else {
        showSyncError(err);
      }
    }
  }

  // ========== 统一入口 ==========

  /**
   * 智能同步入口（默认增量，可选全量）
   * 弹出模式选择对话框
   */
  async function smartSync() {
    if (!navigator.onLine) {
      const pendingCount = await getPendingCount();
      window.App?.showToast(`☁️ 当前离线，${pendingCount} 条操作将在联网后自动同步`);
      return;
    }

    const mode = await showSyncModeDialog();
    if (mode === 'incremental') {
      await syncIncremental();
    } else if (mode === 'full') {
      await sync();
    }
    // mode === null: 用户取消
  }

  /**
   * 自动备份到 localStorage（每日快照，保留最近3天）
   */
  async function autoBackupToLocal() {
    try {
      if (false) return;
      const allData = await window.ExportModule?.readAllData();
      const snapshot = JSON.stringify({
        version: 5,
        exportDate: new Date().toISOString().slice(0, 19),
        data: allData
      });

      const today = AppUtils.getTodayStr();
      const key = `lws_backup_${today}`;
      localStorage.setItem(key, snapshot);

      // 清理3天前的备份
      for (let i = 4; i <= 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const oldKey = `lws_backup_${AppUtils.formatDate(d)}`;
        localStorage.removeItem(oldKey);
      }
      console.log('[AutoBackup] 本地备份完成:', key);
    } catch (e) {
      console.warn('[AutoBackup] 本地备份失败:', e);
    }
  }

  /**
   * 调度自动同步（每周静默增量同步到 GitHub）
   */
  function scheduleAutoSync() {
    // 注册在线状态监听
    listenOnline();

    // 每小时检查一次是否需要同步
    setInterval(async () => {
      try {
        const lastSync = await Storage.get('settings', 'last_auto_sync_time');
        const lastTime = lastSync ? new Date(lastSync.value).getTime() : 0;
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        if (now - lastTime >= oneWeek && navigator.onLine) {
          console.log('[AutoSync] 触发每周自动增量同步...');
          await syncIncremental();
          await Storage.put('settings', { key: 'last_auto_sync_time', value: new Date().toISOString() });
        }
      } catch (e) {
        console.warn('[AutoSync] 自动同步检查失败:', e);
      }
    }, 60 * 60 * 1000); // 每小时检查

    // 每日本地备份
    autoBackupToLocal();
    setInterval(autoBackupToLocal, 24 * 60 * 60 * 1000);
  }

  return {
    /** 全量同步（强制） */
    sync,
    /** 增量同步（默认） */
    syncIncremental,
    /** 智能同步入口（弹出模式选择） */
    smartSync,
    /** 获取待同步操作数量 */
    getPendingCount,
    /** 队列压缩 */
    compressQueue,
    autoBackupToLocal,
    scheduleAutoSync
  };
})();
