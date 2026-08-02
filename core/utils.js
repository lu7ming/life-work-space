/**
 * utils.js - 公共工具函数库
 * 人生工作台 · 全局共享工具
 * v32 - 扩展 ErrorHandler、MarkdownToHtml、更多工具函数
 */

window.__APP_VERSION__ = 'v32';

const AppUtils = (() => {
  /**
   * HTML 转义（防 XSS）
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  function formatDate(date) {
    if (typeof date === 'string') date = new Date(date);
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 获取今天的日期字符串 YYYY-MM-DD
   */
  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * 格式化时间为 HH:MM
   */
  function formatTime(date) {
    if (!(date instanceof Date)) date = new Date();
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  /**
   * 格式化货币金额
   */
  function formatCurrency(amount, symbol = '¥') {
    const num = parseFloat(amount) || 0;
    return `${symbol}${num.toFixed(2)}`;
  }

  /**
   * 安全解析 JSON
   */
  function safeParseJSON(str) {
    try {
      if (typeof str === 'object') return str;
      const match = String(str).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 防抖函数
   */
  function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * 节流函数
   */
  function throttle(fn, interval = 300) {
    let lastTime = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastTime >= interval) {
        lastTime = now;
        fn.apply(this, args);
      }
    };
  }

  /**
   * 生成唯一 ID
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * 截断文本
   */
  function truncate(str, maxLen = 50) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
  }

  /**
   * 简单 Markdown 转 HTML（处理代码块、加粗、列表、换行等）
   */
  function markdownToHtml(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // 代码块 ```...```
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });
    // 行内代码 `...`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 加粗 **...**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
    // 有序列表
    html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  /**
   * 获取本周起止日期（周一到周日）
   */
  function getWeekRange() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: formatDate(monday),
      end: formatDate(sunday)
    };
  }

  /**
   * 获取本月字符串 YYYY-MM
   */
  function getMonthStr() {
    return getTodayStr().substring(0, 7);
  }

  /**
   * 计算两个日期之间的天数差
   */
  function daysBetween(d1, d2) {
    const date1 = typeof d1 === 'string' ? new Date(d1) : d1;
    const date2 = typeof d2 === 'string' ? new Date(d2) : d2;
    return Math.floor((date2 - date1) / 86400000);
  }

  /**
   * 中文数字转阿拉伯数字
   */
  function parseChineseNumber(text) {
    if (!text) return null;
    const digitMap = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000, '万': 10000, '亿': 100000000 };
    const chineseNum = text.match(/[零〇一两二三四五六七八九十百千万亿]+/);
    if (!chineseNum) return null;
    const str = chineseNum[0];
    let result = 0, temp = 0, hasDigit = false;
    for (let i = 0; i < str.length; i++) {
      const val = digitMap[str[i]];
      if (val === undefined) continue;
      if (val >= 10000) { temp = temp === 0 ? 1 : temp; result += temp * val; temp = 0; }
      else if (val >= 10) { if (temp === 0) temp = 1; temp = temp * val; }
      else { temp += val; hasDigit = true; }
    }
    if (!hasDigit && temp === 0 && str === '十') return 10;
    result += temp;
    return result || null;
  }

  /**
   * 空状态 HTML 生成器
   */
  function renderEmptyState(icon, title, description, ctaText, ctaAction) {
    const ctaHtml = ctaText ? `<button class="empty-state-cta" onclick="${ctaAction || ''}">${ctaText}</button>` : '';
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
        <div class="empty-state-title">${title}</div>
        <div class="empty-state-desc">${description}</div>
        ${ctaHtml}
      </div>
    `;
  }

  /**
   * 自定义确认对话框（替代 confirm()）
   */
  function showConfirmDialog(title, message, confirmText = '确认', cancelText = '取消') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'custom-confirm-overlay';
      overlay.innerHTML = `
        <div class="custom-confirm-dialog">
          <div class="custom-confirm-title">${escapeHtml(title)}</div>
          <div class="custom-confirm-message">${escapeHtml(message)}</div>
          <div class="custom-confirm-actions">
            <button class="custom-confirm-btn cancel">${cancelText}</button>
            <button class="custom-confirm-btn confirm">${confirmText}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      const close = (result) => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      };

      overlay.querySelector('.cancel').addEventListener('click', () => close(false));
      overlay.querySelector('.confirm').addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
  }

  /**
   * Loading 态包装器
   */
  function withLoading(btnEl, asyncFn) {
    return async (...args) => {
      const origText = btnEl.textContent;
      btnEl.disabled = true;
      btnEl.classList.add('btn-loading');
      btnEl.textContent = '...';
      try {
        const result = await asyncFn(...args);
        btnEl.classList.add('btn-success');
        btnEl.textContent = '✓';
        setTimeout(() => { btnEl.classList.remove('btn-success'); btnEl.textContent = origText; }, 800);
        return result;
      } catch (e) {
        btnEl.classList.add('btn-error');
        btnEl.textContent = '✗';
        setTimeout(() => { btnEl.classList.remove('btn-error'); btnEl.textContent = origText; }, 800);
        throw e;
      } finally {
        btnEl.disabled = false;
        btnEl.classList.remove('btn-loading');
      }
    };
  }

  return {
    escapeHtml,
    formatDate,
    getTodayStr,
    formatTime,
    formatCurrency,
    safeParseJSON,
    debounce,
    throttle,
    generateId,
    truncate,
    markdownToHtml,
    getWeekRange,
    getMonthStr,
    daysBetween,
    parseChineseNumber,
    renderEmptyState,
    showConfirmDialog,
    withLoading
  };
})();

/**
 * ErrorHandler - 统一错误处理
 */
const ErrorHandler = (() => {
  const _logs = [];
  const MAX_LOGS = 200;

  function handle(error, context = '', userMessage = '') {
    const errMsg = error?.message || String(error);
    const entry = {
      timestamp: Date.now(),
      error: errMsg,
      context,
      stack: error?.stack || ''
    };
    _logs.push(entry);
    if (_logs.length > MAX_LOGS) _logs.shift();

    console.error(`[${context}] ${errMsg}`, error);

    if (userMessage && typeof App !== 'undefined' && App.showToast) {
      App.showToast(userMessage);
    }

    // 严重错误 → 全屏提示
    if (errMsg.includes('IndexedDB') || errMsg.includes('database')) {
      _showDatabaseError();
    }
  }

  function _showDatabaseError() {
    const existing = document.getElementById('db-error-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'db-error-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;padding:12px 20px;z-index:99999;text-align:center;font-size:14px;';
    banner.innerHTML = '⚠️ 数据库异常，部分功能可能不可用 <button onclick="location.reload()" style="margin-left:12px;padding:4px 12px;border:1px solid #fff;background:transparent;color:#fff;border-radius:4px;cursor:pointer;">刷新重试</button>';
    document.body.appendChild(banner);
  }

  function getLogs(limit = 50) {
    return _logs.slice(-limit);
  }

  return { handle, getLogs };
})();

/**
 * Store - 轻量级响应式状态管理
 */
const Store = (() => {
  const _state = {};
  const _listeners = new Map();

  async function get(key) {
    if (_state[key]) return _state[key];
    try {
      const data = await Storage.getAll(key);
      _state[key] = data;
      return data;
    } catch (e) {
      console.warn('[Store] 读取失败:', key, e);
      return [];
    }
  }

  async function set(key, data) {
    _state[key] = data;
    _notify(key);
  }

  async function update(key, fn) {
    const current = await get(key);
    const updated = fn(current);
    await set(key, updated);
    return updated;
  }

  function subscribe(key, listener) {
    if (!_listeners.has(key)) _listeners.set(key, new Set());
    _listeners.get(key).add(listener);
    return () => _listeners.get(key)?.delete(listener);
  }

  function _notify(key) {
    if (_listeners.has(key)) {
      _listeners.get(key).forEach(fn => {
        try { fn(_state[key]); } catch (e) { console.warn('[Store] listener error:', e); }
      });
    }
  }

  function invalidate(key) {
    delete _state[key];
  }

  function invalidateAll() {
    Object.keys(_state).forEach(k => delete _state[k]);
  }

  return { get, set, update, subscribe, invalidate, invalidateAll };
})();

/**
 * SecureStorage - Web Crypto API 加密存储
 */
const SecureStorage = (() => {
  let _encryptionKey = null;

  async function _getDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    const fp = canvas.toDataURL().slice(-50);
    return navigator.userAgent.length + '_' + fp.length + '_' + screen.width + 'x' + screen.height;
  }

  async function _getEncryptionKey() {
    if (_encryptionKey) return _encryptionKey;
    const fingerprint = await _getDeviceFingerprint();
    _encryptionKey = await crypto.subtle.importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint)),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    return _encryptionKey;
  }

  async function encrypt(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await _getEncryptionKey();
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) });
  }

  async function decrypt(encryptedStr) {
    try {
      const encrypted = JSON.parse(encryptedStr);
      const key = await _getEncryptionKey();
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
        key,
        new Uint8Array(encrypted.data)
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.warn('[SecureStorage] 解密失败，可能跨设备:', e);
      return null;
    }
  }

  async function saveSecure(key, value) {
    const encrypted = await encrypt(JSON.stringify(value));
    await Storage.put('settings', { key: 'secure_' + key, value: encrypted });
  }

  async function loadSecure(key) {
    const setting = await Storage.get('settings', 'secure_' + key);
    if (!setting || !setting.value) return null;
    const decrypted = await decrypt(setting.value);
    return decrypted ? JSON.parse(decrypted) : null;
  }

  return { encrypt, decrypt, saveSecure, loadSecure };
})();

/**
 * KeyboardShortcuts - 全局键盘快捷键管理
 */
const KeyboardShortcuts = (() => {
  const _handlers = new Map();
  let _enabled = true;

  function register(key, handler, description = '') {
    _handlers.set(key.toLowerCase(), { handler, description });
  }

  function unregister(key) {
    _handlers.delete(key.toLowerCase());
  }

  function handle(e) {
    if (!_enabled) return;
    const active = document.activeElement;
    if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
    if (active && active.isContentEditable) return;

    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd + N: 新建当前模块记录
    if (ctrl && e.key === 'n') {
      e.preventDefault();
      _execute('ctrl+n');
      return;
    }
    // Ctrl/Cmd + S: 手动保存
    if (ctrl && e.key === 's') {
      e.preventDefault();
      _execute('ctrl+s');
      return;
    }
    // ?: 显示快捷键帮助
    if (e.key === '?' && !ctrl) {
      _execute('?');
      return;
    }
    // 1-9: 模块切换
    if (/^[1-9]$/.test(e.key) && !ctrl && !e.altKey) {
      _execute(e.key);
      return;
    }
  }

  function _execute(key) {
    const entry = _handlers.get(key.toLowerCase());
    if (entry) {
      try { entry.handler(); } catch (e) { console.warn('[Keyboard] 快捷键执行失败:', e); }
    }
  }

  function showHelp() {
    const overlay = document.createElement('div');
    overlay.className = 'keyboard-help-overlay';
    const shortcuts = Array.from(_handlers.entries())
      .filter(([k, v]) => v.description)
      .map(([k, v]) => `<div class="kb-help-item"><kbd>${k}</kbd><span>${v.description}</span></div>`)
      .join('');
    overlay.innerHTML = `
      <div class="keyboard-help-dialog">
        <div class="keyboard-help-title">⌨️ 快捷键</div>
        <div class="keyboard-help-list">${shortcuts || '<p>暂无已注册快捷键</p>'}</div>
        <div class="keyboard-help-hint">按 Esc 关闭</div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  function init() {
    document.addEventListener('keydown', handle);

    // 注册默认快捷键
    register('ctrl+s', () => {
      if (typeof App !== 'undefined') App.showToast('数据已自动保存 ✅');
    }, '手动保存');
    register('ctrl+n', () => {
      if (typeof QuickInput !== 'undefined') QuickInput.open();
    }, '新建记录');
    register('1', () => { if (typeof Router !== 'undefined') Router.navigate('dashboard'); }, '今日总览');
    register('2', () => { if (typeof Router !== 'undefined') Router.navigate('habits'); }, '习惯打卡');
    register('3', () => { if (typeof Router !== 'undefined') Router.navigate('tasks'); }, '任务');
    register('4', () => { if (typeof Router !== 'undefined') Router.navigate('study'); }, '学习');
    register('5', () => { if (typeof Router !== 'undefined') Router.navigate('health'); }, '健康');
    register('6', () => { if (typeof Router !== 'undefined') Router.navigate('finance'); }, '财务');
    register('7', () => { if (typeof Router !== 'undefined') Router.navigate('journal'); }, '记录与反思');
    register('8', () => { if (typeof Router !== 'undefined') Router.navigate('lifetree'); }, '生命树');
    register('9', () => { if (typeof Router !== 'undefined') Router.navigate('templates'); }, '复盘模板');
    register('?', () => showHelp(), '显示快捷键帮助');

    console.log('[Keyboard] 快捷键系统就绪 ⌨️');
  }

  return { init, register, unregister, showHelp };
})();

/**
 * OfflineDetector - 离线检测与状态提示
 */
const OfflineDetector = (() => {
  let _banner = null;

  function init() {
    window.addEventListener('online', _onOnline);
    window.addEventListener('offline', _onOffline);
    if (!navigator.onLine) _showBanner();
    console.log('[Offline] 离线检测器就绪');
  }

  function _showBanner() {
    if (_banner) return;
    _banner = document.createElement('div');
    _banner.className = 'offline-banner';
    _banner.innerHTML = '📡 当前处于离线模式，部分功能受限';
    document.body.appendChild(_banner);
    requestAnimationFrame(() => _banner.classList.add('show'));
  }

  function _hideBanner() {
    if (!_banner) return;
    _banner.classList.remove('show');
    setTimeout(() => { if (_banner) { _banner.remove(); _banner = null; } }, 300);
  }

  function _onOnline() {
    _hideBanner();
    if (typeof App !== 'undefined') App.showToast('网络已恢复 🌐');
    // 上线后尝试同步离线队列
    if (typeof OfflineQueue !== 'undefined') OfflineQueue.flush();
  }

  function _onOffline() {
    _showBanner();
  }

  function isOnline() {
    return navigator.onLine;
  }

  return { init, isOnline };
})();

/**
 * OfflineQueue - 离线操作队列
 */
const OfflineQueue = (() => {
  const QUEUE_KEY = 'offline_queue';

  async function enqueue(operation) {
    const queue = await _getQueue();
    queue.push({ ...operation, timestamp: Date.now(), id: AppUtils.generateId() });
    await _saveQueue(queue);
    console.log('[OfflineQueue] 操作已入队:', operation.type);
  }

  async function flush() {
    const queue = await _getQueue();
    if (queue.length === 0) return;
    console.log('[OfflineQueue] 开始处理队列，共', queue.length, '个操作');

    const failed = [];
    for (const op of queue) {
      try {
        await _executeOperation(op);
      } catch (e) {
        failed.push(op);
        console.warn('[OfflineQueue] 操作执行失败:', op.type, e);
        break; // 网络仍然不可用，等下次
      }
    }
    await _saveQueue(failed);
    console.log('[OfflineQueue] 队列处理完成，剩余', failed.length, '个');
  }

  async function _executeOperation(op) {
    if (op.type === 'sync_github') {
      if (typeof SyncModule !== 'undefined') await SyncModule.sync();
    }
    // 其他操作类型可在此扩展
  }

  async function _getQueue() {
    try {
      const setting = await Storage.get('settings', QUEUE_KEY);
      return setting ? (setting.value || []) : [];
    } catch (e) { return []; }
  }

  async function _saveQueue(queue) {
    await Storage.put('settings', { key: QUEUE_KEY, value: queue });
  }

  return { enqueue, flush };
})();

/**
 * AuditLog - AI 操作审计日志
 */
const AuditLog = (() => {
  async function log(action) {
    try {
      await Storage.add('audit_log', {
        timestamp: Date.now(),
        action: action.type,
        source: action.source || 'unknown',
        params: action.params || {},
        result: action.result || 'unknown',
        userConfirmed: action.confirmed || false
      });
    } catch (e) {
      console.warn('[AuditLog] 写入失败:', e);
    }
  }

  async function getRecentLog(limit = 50) {
    try {
      const all = await Storage.getAll('audit_log');
      return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  return { log, getRecentLog };
})();

/**
 * EmotionAnalyzer - 中文情感分析器
 */
const EmotionAnalyzer = (() => {
  const _positiveWords = ['开心', '高兴', '快乐', '幸福', '满足', '兴奋', '期待', '感恩', '充实', '不错', '很好', '棒', '厉害', '牛', '赞', '爽', '舒服', '温暖', '感动', '自豪', '骄傲', '欣慰'];
  const _negativeWords = ['难过', '沮丧', '焦虑', '压力', '疲惫', '迷茫', '烦躁', '失落', '孤独', '累', '烦', '糟', '差', '无聊', '郁闷', '伤心', '崩溃', '无奈', '失望', '委屈', '难受', '痛苦'];
  const _intensifiers = ['很', '非常', '特别', '超级', '极其', '真的', '太'];

  function analyze(text) {
    if (!text) return 0;
    let score = 0;
    for (const word of _positiveWords) { if (text.includes(word)) score += 1; }
    for (const word of _negativeWords) { if (text.includes(word)) score -= 1; }
    for (const word of _intensifiers) { if (text.includes(word)) score *= 1.3; }
    return Math.max(-1, Math.min(1, score / 3));
  }

  function getResponseStrategy(emotionScore) {
    if (emotionScore > 0.5) return 'celebrate';
    if (emotionScore > 0) return 'encourage';
    if (emotionScore > -0.5) return 'comfort';
    return 'support';
  }

  function getMoodLabel(score) {
    if (score > 0.5) return 'happy';
    if (score > 0) return 'calm';
    if (score > -0.5) return 'sad';
    return 'anxious';
  }

  return { analyze, getResponseStrategy, getMoodLabel };
})();

/**
 * ContextTracker - 多轮对话上下文追踪
 * 支持：修改/追加意图识别、5分钟超时清除、模块切换清除
 */
const ContextTracker = (() => {
  let _slots = {};
  let _lastIntent = null;
  let _lastParams = {};   // 上一轮操作的完整参数
  let _lastTool = null;   // 上一轮操作的工具名
  let _turnCount = 0;
  let _lastTimestamp = 0; // 上次交互时间戳
  const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5分钟超时

  // 修改类关键词
  const MODIFY_PATTERNS = /改成|改为|修改|换成|不对|错了/;
  // 追加类关键词
  const APPEND_PATTERNS = /再加上|还有|另外|也/;
  // 清除上下文关键词
  const CLEAR_PATTERNS = /新话题|换个事|换个话题|说别的|不聊这个/;

  function update(intent, params, tool) {
    _slots = { ..._slots, ...params };
    _lastIntent = intent;
    _lastParams = params ? { ...params } : {};
    _lastTool = tool || null;
    _turnCount++;
    _lastTimestamp = Date.now();
  }

  /**
   * 检查上下文是否已超时，超时则自动清除
   */
  function checkTimeout() {
    if (_lastTimestamp && Date.now() - _lastTimestamp > CONTEXT_TIMEOUT) {
      clear();
      return true;
    }
    return false;
  }

  /**
   * 获取增强后的用户消息（供 AI 路径使用）
   */
  function getAugmentedMessage(userMessage) {
    // 超时检查
    if (checkTimeout()) return userMessage;

    // 用户明确要求清除上下文
    if (CLEAR_PATTERNS.test(userMessage)) {
      clear();
      return userMessage;
    }

    // 修改类意图
    if (MODIFY_PATTERNS.test(userMessage) && _lastIntent) {
      return `用户在修改上一轮的操作。上一轮意图：${_lastIntent}，原始参数：${JSON.stringify(_lastParams)}。用户最新消息："${userMessage}"`;
    }

    // 追加类意图
    if (APPEND_PATTERNS.test(userMessage) && _lastIntent) {
      return `用户想追加操作。上一轮意图：${_lastIntent}，上一轮参数：${JSON.stringify(_lastParams)}。用户最新消息："${userMessage}"`;
    }

    return userMessage;
  }

  /**
   * 获取本地修改上下文（供本地路径使用，不调用 AI）
   * 返回 null 表示无需修改/追加处理
   */
  function getModificationContext(userMessage) {
    // 超时检查
    if (checkTimeout()) return null;

    // 用户明确要求清除上下文
    if (CLEAR_PATTERNS.test(userMessage)) {
      clear();
      return null;
    }

    // 修改类意图 - 尝试从消息中提取新值并合并参数
    if (MODIFY_PATTERNS.test(userMessage) && _lastIntent) {
      const modifiedParams = _mergeModifiedParams(userMessage, _lastParams);
      return {
        type: 'modification',
        lastIntent: _lastIntent,
        lastTool: _lastTool,
        lastParams: { ..._lastParams },
        modifiedParams: modifiedParams
      };
    }

    // 追加类意图 - 保留上一轮的分类等上下文
    if (APPEND_PATTERNS.test(userMessage) && _lastIntent) {
      return {
        type: 'append',
        lastIntent: _lastIntent,
        lastTool: _lastTool,
        lastParams: { ..._lastParams }
      };
    }

    return null;
  }

  /**
   * 从修改消息中提取新值，合并到原始参数
   */
  function _mergeModifiedParams(message, originalParams) {
    const merged = { ...originalParams };

    // 提取数字（金额/数量修改）
    const numberMatch = message.match(/(\d+\.?\d*)/);
    if (numberMatch) {
      merged.amount = Number(numberMatch[1]);
    }

    // 提取支出分类
    const categoryMatch = message.match(/(餐饮|交通|购物|娱乐|其他)/);
    if (categoryMatch) {
      merged.category = categoryMatch[1];
    }

    // 提取收入来源
    const sourceMatch = message.match(/(工资|奖金|兼职|其他)/);
    if (sourceMatch) {
      merged.source = sourceMatch[1];
    }

    // 提取优先级
    const priorityMatch = message.match(/(高|紧急|重要)/);
    if (priorityMatch) {
      merged.priority = 'high';
    } else if (/低|不急/.test(message)) {
      merged.priority = 'low';
    }

    // 提取任务标题（引号或书名号内容）
    const titleMatch = message.match(/[「"『]([^」"』]+)[」"』]/);
    if (titleMatch) {
      merged.title = titleMatch[1];
    }

    // 提取备注
    const noteMatch = message.match(/备注[是为：:]?\s*([^\s，。,]+)/);
    if (noteMatch) {
      merged.note = noteMatch[1];
    }

    return merged;
  }

  function getSlots() { return { ..._slots }; }
  function getLastIntent() { return _lastIntent; }
  function getLastParams() { return _lastParams ? { ..._lastParams } : {}; }
  function getLastTool() { return _lastTool; }
  function getTurnCount() { return _turnCount; }
  function getLastTimestamp() { return _lastTimestamp; }

  function clear() {
    _slots = {};
    _lastIntent = null;
    _lastParams = {};
    _lastTool = null;
    _turnCount = 0;
    _lastTimestamp = 0;
  }

  return { update, getAugmentedMessage, getModificationContext, getSlots, getLastIntent, getLastParams, getLastTool, getTurnCount, getLastTimestamp, clear, checkTimeout };
})();

/**
 * FuzzyIntentHandler - 模糊意图识别
 */
const FuzzyIntentHandler = (() => {
  const patterns = [
    {
      match: /花了|消费|支出/,
      possibleIntents: ['finance_record'],
      needClarify: ['amount'],
      questions: { amount: '花了多少呀？告诉我金额就好 🦌' }
    },
    {
      match: /记得|别忘了/,
      possibleIntents: ['task_create', 'journal_entry'],
      needClarify: ['intent_type'],
      questions: { intent_type: '是要创建任务还是记个备忘？🤔' }
    },
    {
      match: /今天.*好累|好开心|好烦|好难过/,
      possibleIntents: ['journal_entry', 'chat'],
      needClarify: [],
      autoSuggest: '要记一篇日记吗？📝'
    }
  ];

  function handle(text) {
    for (const pattern of patterns) {
      if (pattern.match.test(text)) {
        const missing = pattern.needClarify.filter(key => !_hasSlot(key, text));
        if (missing.length > 0) {
          const question = pattern.questions[missing[0]];
          return { type: 'clarify', question, possibleIntents: pattern.possibleIntents };
        }
        if (pattern.autoSuggest) {
          return { type: 'suggest', message: pattern.autoSuggest };
        }
      }
    }
    return null;
  }

  function _hasSlot(key, text) {
    if (key === 'amount') return /\d+/.test(text) || AppUtils.parseChineseNumber(text);
    if (key === 'intent_type') return /任务|备忘|待办/.test(text);
    return false;
  }

  return { handle };
})();

// SharedKnowledge 和 AIOrchestrator 已迁移至 core/shared-knowledge.js 和 core/orchestrator.js

/**
 * UserProfile - 用户行为画像
 */
const UserProfile = (() => {
  let _profile = null;

  async function buildProfile() {
    if (_profile) return _profile;

    _profile = {
      activeHours: {},
      peakHour: 9,
      moduleFrequency: {},
      favoriteModule: 'dashboard',
      avgTaskPerDay: 0,
      avgExpensePerDay: 0,
      topCategories: [],
      habitCompletionRate: 0,
      missedHabits: [],
      moodTrend: 'stable',
      preferredAI: 'xiaolu',
      voiceUsageRate: 0,
    };

    try {
      const tasks = await Storage.getAll('tasks') || [];
      const finances = await Storage.getAll('finance') || [];
      const checkins = await Storage.getAll('checkins') || [];
      const habits = await Storage.getAll('habits') || [];

      // 消费模式
      const expenses = finances.filter(f => f.type === 'expense');
      if (expenses.length > 0) {
        const days = new Set(expenses.map(f => f.date)).size || 1;
        _profile.avgExpensePerDay = Math.round(expenses.reduce((s, f) => s + (parseFloat(f.amount) || 0), 0) / days);
        const catMap = {};
        expenses.forEach(f => { catMap[f.category || '其他'] = (catMap[f.category || '其他'] || 0) + 1; });
        _profile.topCategories = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
      }

      // 任务模式
      if (tasks.length > 0) {
        const days = new Set(tasks.map(t => t.date || t.created_at)).size || 1;
        _profile.avgTaskPerDay = Math.round(tasks.length / days * 10) / 10;
      }

      // 习惯模式
      if (habits.length > 0 && checkins.length > 0) {
        const totalChecked = checkins.reduce((s, c) => s + (c.habits?.length || 0), 0);
        const totalPossible = habits.length * Math.max(1, checkins.length);
        _profile.habitCompletionRate = Math.round(totalChecked / totalPossible * 100) / 100;
      }

      // 保存画像
      await Storage.put('settings', { key: 'user_profile', value: _profile });
    } catch (e) {
      console.warn('[UserProfile] 画像构建失败:', e);
    }

    return _profile;
  }

  function getProfile() { return _profile; }

  function getRecommendation() {
    if (!_profile) return [];
    const hour = new Date().getHours();
    const recs = [];

    if (hour >= 21 && _profile.missedHabits.length > 0) {
      recs.push(`你常漏的习惯：${_profile.missedHabits.join('、')}，今晚试试？`);
    }
    if (_profile.avgExpensePerDay > 100) {
      recs.push('最近日均支出较高，关注一下预算');
    }
    if (_profile.habitCompletionRate < 0.5 && _profile.habitCompletionRate > 0) {
      recs.push('习惯完成率较低，建议减少目标数量，先坚持核心习惯');
    }
    return recs;
  }

  return { buildProfile, getProfile, getRecommendation };
})();

/**
 * SmartReminder - 智能提醒引擎
 */
const SmartReminder = (() => {
  const ruleReminders = [
    { time: '09:00', check: 'morningHabits', message: '早安！早上好习惯别忘了 🌅' },
    { time: '12:00', check: 'lunchReminder', message: '午间休息，吃好午餐 🍱' },
    { time: '21:00', check: 'eveningHabits', message: '晚上好，检查一下今天的习惯打卡 ✅' },
    { time: '22:30', check: 'sleepReminder', message: '快到睡觉时间了，准备休息吧 😴' },
  ];

  let _timer = null;

  async function init() {
    // 每分钟检查规则提醒
    _timer = setInterval(checkRules, 60000);
    console.log('[SmartReminder] 智能提醒引擎就绪');
  }

  function checkRules() {
    const now = AppUtils.formatTime(new Date());
    for (const rule of ruleReminders) {
      if (now === rule.time) {
        _fireReminder(rule.message, 'low');
      }
    }
  }

  async function checkSmartReminders() {
    const reminders = [];
    try {
      const profile = await UserProfile.buildProfile();
      const today = AppUtils.getTodayStr();

      // 消费异常
      const finances = await Storage.getAll('finance') || [];
      const todayExpense = finances
        .filter(f => f.type === 'expense' && f.date === today)
        .reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
      if (todayExpense > profile.avgExpensePerDay * 2 && profile.avgExpensePerDay > 0) {
        reminders.push({
          type: 'spending_alert',
          message: `今天消费 ¥${todayExpense}，比日均高 ${Math.round(todayExpense / profile.avgExpensePerDay * 100 - 100)}%，注意控制 💰`,
          priority: 'high'
        });
      }

      // 任务积压
      const tasks = await Storage.getAll('tasks') || [];
      const overdue = tasks.filter(t => t.status !== 'done' && t.status !== 'completed' && t.dueDate && t.dueDate < today);
      if (overdue.length >= 3) {
        reminders.push({
          type: 'task_backlog',
          message: `有 ${overdue.length} 个任务逾期了，建议重新评估优先级 📋`,
          priority: 'high'
        });
      }

      // 习惯断签风险
      const checkins = await Storage.getAll('checkins') || [];
      const todayCheckin = checkins.find(c => c.date === today);
      const hour = new Date().getHours();
      if (!todayCheckin && hour >= 20) {
        reminders.push({
          type: 'habit_risk',
          message: '今天还没有打卡，别忘了完成今日习惯 💪',
          priority: 'medium'
        });
      }

      // 周末总结
      if (new Date().getDay() === 0 && new Date().getHours() >= 20) {
        reminders.push({
          type: 'weekly_review',
          message: '周日晚上，适合做一次周回顾 📊',
          priority: 'low'
        });
      }
    } catch (e) {
      console.warn('[SmartReminder] 智能提醒检查失败:', e);
    }
    return reminders;
  }

  function _fireReminder(message, priority) {
    if (typeof NotificationEngine !== 'undefined') {
      NotificationEngine.addNotification({
        type: 'smart_reminder',
        title: '智能提醒',
        message: message,
        icon: '🔔',
        link: ''
      });
    }
    if (typeof App !== 'undefined') App.showToast(message);
  }

  function destroy() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  return { init, checkSmartReminders, destroy };
})();

/**
 * PredictiveEngine - 预测性操作引擎
 */
const PredictiveEngine = (() => {
  function predict() {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    const predictions = [];

    // 工作日早上 → 建议创建任务
    if (day >= 1 && day <= 5 && hour >= 7 && hour <= 9) {
      predictions.push({ type: 'suggest_create_tasks', confidence: 0.8, message: '早上好！要不要规划今天的任务？📋' });
    }
    // 工作日中午 → 提醒记录午餐
    if (day >= 1 && day <= 5 && hour >= 11 && hour <= 13) {
      predictions.push({ type: 'suggest_record_lunch', confidence: 0.7, message: '午餐时间，记得记录今天的午餐支出 💰' });
    }
    // 月末 → 建议月度复盘
    const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    if (new Date().getDate() >= lastDay - 2) {
      predictions.push({ type: 'suggest_monthly_review', confidence: 0.9, message: '月末了，适合做一次月度复盘 📊' });
    }

    return predictions;
  }

  return { predict };
})();

// SUGGESTION_ACTIONS - 智能建议操作映射
const SUGGESTION_ACTIONS = {
  'spending_high': {
    message: '本月支出偏高',
    actions: [
      { label: '查看支出详情', route: 'finance' },
      { label: '调整预算', route: 'finance' },
    ]
  },
  'task_overdue': {
    message: '有逾期任务',
    actions: [
      { label: '查看任务', route: 'tasks' },
      { label: '重新排期', action: 'reschedule_tasks' },
    ]
  },
  'habit_streak_risk': {
    message: '连续打卡可能中断',
    actions: [
      { label: '一键完成', route: 'habits' },
    ]
  },
  'no_exercise': {
    message: '本周没有运动',
    actions: [
      { label: '记录运动', route: 'health' },
    ]
  }
};
