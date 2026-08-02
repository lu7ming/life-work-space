/**
 * sync.js - 数据同步模块
 * 人生工作台 · 同步数据到 GitHub
 */

const SyncModule = (() => {

  const REPO_OWNER = 'lu7ming';
  const REPO_NAME = 'life-work-space';
  const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
  const BRANCH = 'main';

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
          App.showToast('请输入 GitHub Token');
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

  function showSyncingDialog() {
    injectStyles();
    const overlay = document.createElement('div');
    overlay.className = 'sync-overlay';
    overlay.innerHTML = `
      <div class="sync-dialog">
        <div class="sync-dialog-header">
          <h3>☁️ 同步中...</h3>
          <p>正在将数据推送到 GitHub</p>
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
      throw new Error(`推送失败 (${resp.status}): ${errBody}`);
    }
    return await resp.json();
  }

  // ========== 同步主流程 ==========

  /**
   * 执行同步
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
      if (typeof ExportModule === 'undefined') {
        throw new Error('导出模块未加载');
      }
      const allData = await ExportModule.readAllData();

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
      const latestPath = 'user-data/latest.json';
      const latestSha = await getFileSha(token, latestPath);
      await pushFile(token, latestPath, jsonContent, `sync: update latest backup`, latestSha);

      // 7. 记录同步时间
      await Storage.put('settings', {
        key: 'last_sync_time',
        value: now.toISOString()
      });

      // 完成
      closeSyncDialog(overlay);
      App.showToast('☁️ 数据已同步到云端 ✅');
      console.log(`[Sync] 同步完成: ${backupPath}`);

    } catch (err) {
      console.error('[Sync] 同步失败:', err);
      closeSyncDialog(overlay);

      // 友好错误提示
      let msg = '同步失败';
      const errMsg = err.message || '';
      if (errMsg.includes('401') || errMsg.includes('Bad credentials')) {
        msg = '认证失败，Token 可能已过期，请重新配置';
        // 清除无效 token
        await Storage.remove('settings', 'github_token');
      } else if (errMsg.includes('403')) {
        msg = '权限不足，请检查 Token 是否有 repo 权限';
      } else if (errMsg.includes('404')) {
        msg = '仓库不存在或无权访问';
      } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('network')) {
        msg = '网络连接失败，请检查网络后重试';
      } else if (errMsg.includes('推送失败') || errMsg.includes('获取文件信息失败')) {
        msg = 'GitHub API 请求失败: ' + errMsg.slice(0, 80);
      }
      App.showToast('☁️ ' + msg);
    }
  }

  /**
   * 自动备份到 localStorage（每日快照，保留最近3天）
   */
  async function autoBackupToLocal() {
    try {
      if (typeof ExportModule === 'undefined') return;
      const allData = await ExportModule.readAllData();
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
   * 调度自动同步（每周静默推送到 GitHub）
   */
  function scheduleAutoSync() {
    // 每小时检查一次是否需要同步
    setInterval(async () => {
      try {
        const lastSync = await Storage.get('settings', 'last_auto_sync_time');
        const lastTime = lastSync ? new Date(lastSync.value).getTime() : 0;
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        if (now - lastTime >= oneWeek && navigator.onLine) {
          console.log('[AutoSync] 触发每周自动同步...');
          await sync();
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
    sync,
    autoBackupToLocal,
    scheduleAutoSync
  };
})();
