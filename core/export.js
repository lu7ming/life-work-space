/**
 * export.js - 数据导出/导入模块
 * 人生工作台 · 数据备份与恢复
 */
import { Storage } from './storage.js';
import { AppUtils } from './utils.js';


export const ALL_STORES = [
  'checkins', 'habits', 'tasks', 'study', 'health',
  'finance', 'settings', 'meta', 'projects', 'pomodoros',
  'semesters', 'courses', 'books', 'skills', 'journal',
  'goals', 'contacts', 'knowledge', 'ideas', 'lifetree'
];

export const STORE_LABELS = {
  checkins: '打卡记录',
  habits: '习惯',
  tasks: '任务',
  study: '学习',
  health: '健康',
  finance: '财务',
  settings: '设置',
  meta: '系统元数据',
  projects: '项目',
  pomodoros: '番茄钟记录',
  semesters: '学期',
  courses: '课程',
  books: '书籍',
  skills: '技能',
  journal: '记录与反思',
  goals: '目标',
  contacts: '关系',
  knowledge: '知识库',
  ideas: '灵感',
  lifetree: '生命树'
};

export const ExportModule = (() => {

  // ========== 样式注入（仅一次） ==========
  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      /* 导出/导入 弹窗遮罩 */
      .export-overlay {
        position: fixed; inset: 0;
        background: rgba(61,48,39,0.35);
        z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease;
      }
      @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
      @keyframes slideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }

      .export-dialog {
        background: var(--bg-card, #fff);
        border-radius: var(--radius-lg, 16px);
        box-shadow: var(--shadow-lg);
        width: 440px; max-width: 92vw; max-height: 80vh;
        display: flex; flex-direction: column;
        animation: slideUp 0.25s ease;
        overflow: hidden;
      }
      .export-dialog-header {
        padding: 20px 24px 12px;
        border-bottom: 1px solid var(--border-light);
      }
      .export-dialog-header h3 {
        font-size: 18px; font-weight: 600;
        color: var(--text-primary); margin: 0;
      }
      .export-dialog-header p {
        font-size: 13px; color: var(--text-muted); margin: 4px 0 0;
      }
      .export-dialog-body {
        padding: 16px 24px; overflow-y: auto; flex: 1;
      }
      .export-dialog-footer {
        padding: 12px 24px 20px;
        border-top: 1px solid var(--border-light);
        display: flex; gap: 10px; justify-content: flex-end;
      }

      /* 模块选择列表 */
      .export-store-list {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .export-store-item {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px; border-radius: var(--radius-sm);
        cursor: pointer; transition: background var(--transition-fast);
        font-size: 13px; color: var(--text-primary);
        user-select: none;
      }
      .export-store-item:hover { background: var(--bg-hover); }
      .export-store-item input[type="checkbox"] {
        accent-color: var(--accent-green);
        width: 16px; height: 16px; cursor: pointer;
      }
      .export-store-item .store-count {
        margin-left: auto; font-size: 11px;
        color: var(--text-muted); background: var(--bg-main);
        padding: 1px 6px; border-radius: var(--radius-full);
      }
      .export-select-all {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 10px; font-size: 13px; color: var(--text-secondary);
      }
      .export-select-all label { cursor: pointer; display: flex; align-items: center; gap: 6px; }
      .export-select-all a {
        color: var(--accent-blue); cursor: pointer; font-size: 12px;
        text-decoration: none;
      }
      .export-select-all a:hover { text-decoration: underline; }

      /* 按钮 */
      .export-btn {
        padding: 8px 20px; border-radius: var(--radius-full);
        font-size: 14px; font-weight: 500; cursor: pointer;
        border: none; transition: all var(--transition-fast);
      }
      .export-btn-primary {
        background: var(--accent-green); color: #fff;
      }
      .export-btn-primary:hover { filter: brightness(1.08); }
      .export-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .export-btn-secondary {
        background: var(--bg-main); color: var(--text-secondary);
        border: 1px solid var(--border-light);
      }
      .export-btn-secondary:hover { background: var(--bg-hover); }

      /* 导入相关 */
      .import-drop-zone {
        border: 2px dashed var(--border-light);
        border-radius: var(--radius-md);
        padding: 32px 20px; text-align: center;
        cursor: pointer; transition: all var(--transition-fast);
        margin-bottom: 16px;
      }
      .import-drop-zone:hover, .import-drop-zone.dragover {
        border-color: var(--accent-green);
        background: var(--accent-green-light);
      }
      .import-drop-zone .drop-icon { font-size: 36px; margin-bottom: 8px; }
      .import-drop-zone .drop-text { font-size: 14px; color: var(--text-secondary); }
      .import-drop-zone .drop-hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
      .import-drop-zone.has-file { border-style: solid; border-color: var(--accent-green); background: var(--accent-green-light); }

      /* 数据概览 */
      .import-overview {
        background: var(--bg-main); border-radius: var(--radius-sm);
        padding: 14px 16px; margin-bottom: 16px;
      }
      .import-overview h4 {
        font-size: 14px; font-weight: 600; color: var(--text-primary);
        margin: 0 0 8px;
      }
      .import-overview-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 4px 12px; font-size: 12px; color: var(--text-secondary);
      }
      .import-overview-grid .ov-item {
        display: flex; justify-content: space-between;
        padding: 2px 0;
      }
      .import-overview-grid .ov-count {
        font-weight: 600; color: var(--text-primary);
      }
      .import-version-warn {
        background: var(--accent-orange-light);
        border-radius: var(--radius-sm);
        padding: 10px 14px; margin-bottom: 12px;
        font-size: 12px; color: var(--accent-orange);
      }

      /* 模式选择 */
      .import-mode-group {
        display: flex; flex-direction: column; gap: 8px;
        margin-bottom: 4px;
      }
      .import-mode-option {
        display: flex; align-items: flex-start; gap: 10px;
        padding: 10px 14px; border-radius: var(--radius-sm);
        border: 1.5px solid var(--border-light);
        cursor: pointer; transition: all var(--transition-fast);
      }
      .import-mode-option:hover { border-color: var(--accent-green); }
      .import-mode-option.selected {
        border-color: var(--accent-green);
        background: var(--accent-green-light);
      }
      .import-mode-option input[type="radio"] {
        accent-color: var(--accent-green);
        margin-top: 2px; cursor: pointer;
      }
      .import-mode-label { font-size: 14px; font-weight: 500; color: var(--text-primary); }
      .import-mode-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    `;
    document.head.appendChild(style);
  }

  // ========== 通用弹窗工具 ==========
  function createOverlay() {
    injectStyles();
    const overlay = document.createElement('div');
    overlay.className = 'export-overlay';
    _bindEvent(overlay, 'click', (e) => {
      if (e.target === overlay) closeDialog(overlay);
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeDialog(overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s ease';
    setTimeout(() => overlay.remove(), 200);
  }

  // ========== 导出功能 ==========

  /**
   * 读取指定表的数据
   */
  async function readStoreData(storeName) {
    try {
      return await Storage.getAll(storeName);
    } catch (e) {
      console.warn(`[Export] 读取 ${storeName} 失败:`, e);
      return [];
    }
  }

  /**
   * 读取所有表数据
   */
  async function readAllData() {
    const data = {};
    for (const store of ALL_STORES) {
      data[store] = await readStoreData(store);
    }
    return data;
  }

  /**
   * 统计各表记录数
   */
  async function countAllStores() {
    const counts = {};
    for (const store of ALL_STORES) {
      try {
        counts[store] = await Storage.count(store);
      } catch (e) {
        counts[store] = 0;
      }
    }
    return counts;
  }

  /**
   * 构建导出 JSON
   */
  function buildExportJSON(data) {
    const now = new Date();
  
  // ===== 模块生命周期 =====
  let _eventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    console.log('[ExportModule] 模块已销毁');
  }

  return {
      version: 5,
      exportDate: now.toISOString().slice(0, 19),
      data: data,
    destroy
  };
  }

  /**
   * 触发文件下载
   */
  function downloadJSON(jsonObj) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const fileName = `life-workspace-backup-${dateStr}.json`;

    const blob = new Blob([JSON.stringify(jsonObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return fileName;
  }

  /**
   * 显示导出弹窗
   */
  async function showExportDialog() {
    const overlay = createOverlay();
    const counts = await countAllStores();

    const dialog = document.createElement('div');
    dialog.className = 'export-dialog';
    dialog.innerHTML = `
      <div class="export-dialog-header">
        <h3>📤 导出数据</h3>
        <p>选择要导出的模块，或导出全部数据</p>
      </div>
      <div class="export-dialog-body">
        <div class="export-select-all">
          <label><input type="checkbox" id="export-check-all" checked> 全选</label>
          <a id="export-toggle-all">取消全选</a>
        </div>
        <div class="export-store-list">
          ${ALL_STORES.map(store => `
            <label class="export-store-item">
              <input type="checkbox" class="export-store-cb" value="${store}" checked>
              <span>${STORE_LABELS[store] || store}</span>
              <span class="store-count">${counts[store] || 0}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="export-dialog-footer">
        <button class="export-btn export-btn-secondary" id="export-cancel">取消</button>
        <button class="export-btn export-btn-primary" id="export-confirm">导出选中模块</button>
      </div>
    `;
    overlay.appendChild(dialog);

    // 全选/取消全选
    const checkAll = dialog.querySelector('#export-check-all');
    const storeCbs = dialog.querySelectorAll('.export-store-cb');
    const toggleLink = dialog.querySelector('#export-toggle-all');
    let allChecked = true;

    _bindEvent(checkAll, 'change', () => {
      storeCbs.forEach(cb => cb.checked = checkAll.checked);
      allChecked = checkAll.checked;
      toggleLink.textContent = allChecked ? '取消全选' : '全选';
    });

    _bindEvent(toggleLink, 'click', () => {
      allChecked = !allChecked;
      checkAll.checked = allChecked;
      storeCbs.forEach(cb => cb.checked = allChecked);
      toggleLink.textContent = allChecked ? '取消全选' : '全选';
    });

    storeCbs.forEach(cb => {
      _bindEvent(cb, 'change', () => {
        const allOn = Array.from(storeCbs).every(c => c.checked);
        checkAll.checked = allOn;
        allChecked = allOn;
        toggleLink.textContent = allChecked ? '取消全选' : '全选';
      });
    });

    // 取消
    _bindEvent(dialog.querySelector('#export-cancel'), 'click', () => closeDialog(overlay));

    // 确认导出
    _bindEvent(dialog.querySelector('#export-confirm'), 'click', async () => {
      const selected = Array.from(storeCbs).filter(cb => cb.checked).map(cb => cb.value);
      if (selected.length === 0) {
        window.App?.showToast('请至少选择一个模块');
        return;
      }

      const btn = dialog.querySelector('#export-confirm');
      btn.disabled = true;
      btn.textContent = '导出中...';

      try {
        const data = {};
        for (const store of selected) {
          data[store] = await readStoreData(store);
        }
        const jsonObj = buildExportJSON(data);
        const fileName = downloadJSON(jsonObj);
        closeDialog(overlay);
        window.App?.showToast(`已导出 ${fileName} ✅`);
      } catch (err) {
        console.error('[Export] 导出失败:', err);
        btn.disabled = false;
        btn.textContent = '导出选中模块';
        window.App?.showToast('导出失败，请重试');
      }
    });
  }

  // ========== 导入功能 ==========

  let _importFileData = null; // 缓存解析后的文件数据

  /**
   * 显示导入弹窗
   */
  function showImportDialog() {
    const overlay = createOverlay();
    _importFileData = null;

    const dialog = document.createElement('div');
    dialog.className = 'export-dialog';
    dialog.innerHTML = `
      <div class="export-dialog-header">
        <h3>📥 导入数据</h3>
        <p>选择备份 JSON 文件进行导入</p>
      </div>
      <div class="export-dialog-body" id="import-body">
        <div class="import-drop-zone" id="import-drop">
          <div class="drop-icon">📂</div>
          <div class="drop-text">点击选择文件 或 拖拽到此处</div>
          <div class="drop-hint">仅支持 .json 格式备份文件</div>
          <input type="file" id="import-file-input" accept=".json" style="display:none">
        </div>
      </div>
      <div class="export-dialog-footer">
        <button class="export-btn export-btn-secondary" id="import-cancel">取消</button>
        <button class="export-btn export-btn-primary" id="import-confirm" disabled>导入</button>
      </div>
    `;
    overlay.appendChild(dialog);

    // 取消
    _bindEvent(dialog.querySelector('#import-cancel'), 'click', () => closeDialog(overlay));

    // 文件选择
    const dropZone = dialog.querySelector('#import-drop');
    const fileInput = dialog.querySelector('#import-file-input');

    _bindEvent(dropZone, 'click', () => fileInput.click());
    _bindEvent(dropZone, 'dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    _bindEvent(dropZone, 'dragleave', () => dropZone.classList.remove('dragover'));
    _bindEvent(dropZone, 'drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file, dialog);
    });
    _bindEvent(fileInput, 'change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0], dialog);
    });
  }

  /**
   * 处理选中的文件
   */
  function handleFile(file, dialog) {
    if (!file.name.endsWith('.json')) {
      window.App?.showToast('请选择 .json 格式文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (!json.data || typeof json.data !== 'object') {
          window.App?.showToast('文件格式不正确，缺少 data 字段');
          return;
        }
        _importFileData = json;
        showImportOverview(dialog, json);
      } catch (err) {
        console.error('[Import] JSON 解析失败:', err);
        window.App?.showToast('文件解析失败，请确认是有效的 JSON 文件');
      }
    };
    reader.readAsText(file);
  }

  /**
   * 显示导入数据概览 + 模式选择
   */
  function showImportOverview(dialog, json) {
    const body = dialog.querySelector('#import-body');
    const confirmBtn = dialog.querySelector('#import-confirm');
    confirmBtn.disabled = false;

    const dataKeys = Object.keys(json.data);
    const totalRecords = dataKeys.reduce((sum, k) => sum + (Array.isArray(json.data[k]) ? json.data[k].length : 0), 0);
    const isVersionCompatible = json.version && json.version <= 5;

    let versionWarn = '';
    if (!isVersionCompatible) {
      versionWarn = `<div class="import-version-warn">⚠️ 该备份文件版本 (v${json.version || '?'}) 与当前版本 (v5) 可能不兼容，导入后请检查数据完整性。</div>`;
    }

    body.innerHTML = `
      ${versionWarn}
      <div class="import-overview">
        <h4>📊 数据概览</h4>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">
          备份时间：${json.exportDate || '未知'} &nbsp;|&nbsp; 版本：v${json.version || '?'} &nbsp;|&nbsp; 共 ${totalRecords} 条记录
        </div>
        <div class="import-overview-grid">
          ${dataKeys.map(key => {
            const count = Array.isArray(json.data[key]) ? json.data[key].length : 0;
            if (count === 0) return '';
            return `<div class="ov-item"><span>${STORE_LABELS[key] || key}</span><span class="ov-count">${count} 条</span></div>`;
          }).join('')}
        </div>
      </div>
      <div style="font-size:14px;font-weight:500;color:var(--text-primary);margin-bottom:10px;">选择导入模式</div>
      <div class="import-mode-group">
        <label class="import-mode-option selected" data-mode="merge">
          <input type="radio" name="import-mode" value="merge" checked>
          <div>
            <div class="import-mode-label">合并导入</div>
            <div class="import-mode-desc">与现有数据合并，按主键去重，不会覆盖已有记录</div>
          </div>
        </label>
        <label class="import-mode-option" data-mode="overwrite">
          <input type="radio" name="import-mode" value="overwrite">
          <div>
            <div class="import-mode-label">覆盖导入</div>
            <div class="import-mode-desc">清空现有数据后导入，⚠️ 不可恢复</div>
          </div>
        </label>
      </div>
    `;

    // 模式选择交互
    const modeOptions = body.querySelectorAll('.import-mode-option');
    modeOptions.forEach(opt => {
      _bindEvent(opt, 'click', () => {
        modeOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        opt.querySelector('input[type="radio"]').checked = true;
      });
    });

    // 确认导入
    confirmBtn.textContent = '确认导入';
    confirmBtn.onclick = async () => {
      const mode = body.querySelector('input[name="import-mode"]:checked')?.value || 'merge';
      confirmBtn.disabled = true;
      confirmBtn.textContent = '导入中...';

      try {
        await performImport(json.data, mode);
        closeDialog(dialog.closest('.export-overlay'));
        window.App?.showToast('数据导入成功 ✅ 即将刷新页面');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        console.error('[Import] 导入失败:', err);
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认导入';
        window.App?.showToast('导入失败: ' + (err.message || '未知错误'));
      }
    };
  }

  /**
   * 执行导入
   */
  async function performImport(data, mode) {
    const db = await Storage.getDB();
    const storeNamesInFile = Object.keys(data).filter(k => ALL_STORES.includes(k));

    if (mode === 'overwrite') {
      // 覆盖模式：先清空所有涉及的表
      for (const storeName of storeNamesInFile) {
        await Storage.clear(storeName);
      }
    }

    // 逐表导入
    for (const storeName of storeNamesInFile) {
      const records = data[storeName];
      if (!Array.isArray(records) || records.length === 0) continue;

      for (const record of records) {
        if (mode === 'merge') {
          // 合并模式：检查是否已存在
          const keyPath = getKeyPath(db, storeName);
          if (keyPath) {
            const key = record[keyPath];
            if (key !== undefined) {
              const existing = await Storage.get(storeName, key);
              if (existing) continue; // 已存在则跳过
            }
          }
        }
        // 使用 put 写入（覆盖模式下直接覆盖，合并模式下只写入不存在的）
        await Storage.put(storeName, record);
      }
    }

    console.log(`[Import] ${mode} 导入完成，涉及 ${storeNamesInFile.length} 张表`);
  }

  /**
   * 获取表的 keyPath
   */
  function getKeyPath(db, storeName) {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return store.keyPath;
    } catch (e) {
      return null;
    }
  }

  // ========== 公开 API ==========
  return {
    showExportDialog,
    showImportDialog,
    // 以下供外部测试调用
    readAllData,
    downloadJSON,
    buildExportJSON,
    destroy
  };
})();
