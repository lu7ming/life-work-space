/**
 * xiaolu.js - 小鹿AI伙伴
 * 人生工作台 · 基于 DeepSeek API 的 AI 对话功能
 * 小鹿定位：幽默轻松的 AI 伙伴，负责日常聊天、灵感整理、按需分析
 */

const XiaoluModule = (() => {
  // ===== 常量 =====
  const API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const MODEL_NAME = 'deepseek-chat';
  const MAX_CONTEXT = 20; // 最多保留最近20条消息

  const SYSTEM_PROMPT = `你是「小鹿」，人生工作台的 AI 伙伴，服务主人「鹿7铭」。
性格幽默轻松，像朋友一样聊天，偶尔皮一下但很靠谱。
你的职责：
1. 日常陪伴聊天
2. 帮鹿7铭整理想法、分类到合适的模块
3. 按需分析数据（用户问了才分析）
4. 帮写复盘草稿（周/月/年）
回复要简洁，不超过3句话，除非用户要求详细回答。
适当使用 emoji 让对话更生动。`;

  // ===== 状态 =====
  let panelEl = null;
  let overlayEl = null;
  let messagesEl = null;
  let inputEl = null;
  let sendBtn = null;
  let _isOpen = false;
  let _isLoading = false;
  let _chatHistory = []; // 多轮对话上下文 [{role, content}, ...]

  // ===== 工具函数 =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
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

    // 无序列表 - item
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
      return `<ul>${match}</ul>`;
    });

    // 有序列表 1. item
    html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');

    // 换行
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  // ===== Token 管理 =====
  async function getDeepseekToken() {
    try {
      const setting = await Storage.get('settings', 'deepseek_token');
      return setting ? setting.value : null;
    } catch (err) {
      console.error('[Xiaolu] 读取 token 失败:', err);
      return null;
    }
  }

  async function saveDeepseekToken(token) {
    try {
      await Storage.put('settings', { key: 'deepseek_token', value: token });
    } catch (err) {
      console.error('[Xiaolu] 保存 token 失败:', err);
    }
  }

  /**
   * 弹出 Token 输入对话框
   */
  function showTokenDialog() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 10003;
        background: rgba(60,50,40,0.4);
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease;
      `;

      overlay.innerHTML = `
        <div class="xiaolu-token-dialog">
          <h3>🔑 配置 DeepSeek API Key</h3>
          <p>小鹿需要 DeepSeek API Key 才能工作 🦌<br>请在 DeepSeek 平台获取 API Key 后填入：</p>
          <input class="xiaolu-token-input" type="password" placeholder="请输入 DeepSeek API Key..." autocomplete="off" />
          <div class="xiaolu-token-actions">
            <button class="xiaolu-token-btn cancel">取消</button>
            <button class="xiaolu-token-btn confirm">确认保存</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('.xiaolu-token-input');
      const cancelBtn = overlay.querySelector('.cancel');
      const confirmBtn = overlay.querySelector('.confirm');

      setTimeout(() => input.focus(), 100);

      cancelBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });

      confirmBtn.addEventListener('click', () => {
        const token = input.value.trim();
        overlay.remove();
        resolve(token || null);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          confirmBtn.click();
        }
        if (e.key === 'Escape') {
          cancelBtn.click();
        }
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cancelBtn.click();
      });
    });
  }

  // ===== DeepSeek API 调用 =====

  /**
   * 发送消息到 DeepSeek API
   * @param {string} token - API Key
   * @param {string} userMessage - 用户消息
   * @returns {Promise<string>} AI 回复内容
   */
  async function callDeepSeekAPI(token, userMessage) {
    // 构建消息列表
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    // 添加历史上下文（最多 MAX_CONTEXT 条）
    const historySlice = _chatHistory.slice(-MAX_CONTEXT);
    messages.push(...historySlice);

    // 添加当前用户消息
    messages.push({ role: 'user', content: userMessage });

    let resp;
    try {
      resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: messages,
          stream: false
        })
      });
    } catch (err) {
      console.error('[Xiaolu] 网络请求失败:', err);
      throw new Error('网络连接失败，请检查网络后重试 🦌');
    }

    // 处理 HTTP 状态码
    if (resp.status === 401) {
      throw new Error('AUTH_ERROR');
    }
    if (resp.status === 429) {
      throw new Error('API 额度已用完或请求太频繁，请稍后再试 😅');
    }
    if (!resp.ok) {
      throw new Error(`请求失败 (${resp.status})，请稍后重试`);
    }

    let data;
    try {
      data = await resp.json();
    } catch (err) {
      throw new Error('解析回复失败，请稍后重试');
    }

    // 提取回复内容
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      const reply = data.choices[0].message.content;
      if (reply) return reply;
    }

    throw new Error('未获取到有效回复，请重试');
  }

  // ===== UI 构建 =====

  /**
   * 构建面板 DOM
   */
  function buildPanel() {
    // 遮罩
    overlayEl = document.createElement('div');
    overlayEl.className = 'xiaolu-overlay';
    overlayEl.addEventListener('click', close);

    // 面板
    panelEl = document.createElement('div');
    panelEl.className = 'xiaolu-panel';
    panelEl.innerHTML = `
      <div class="xiaolu-header">
        <div class="xiaolu-header-left">
          <div class="xiaolu-avatar">🦌</div>
          <div>
            <div class="xiaolu-title">小鹿</div>
            <div class="xiaolu-subtitle">日常陪伴 · 灵感整理 · 轻松聊天</div>
          </div>
        </div>
        <div class="xiaolu-header-actions">
          <button class="xiaolu-header-btn" id="xiaolu-new-chat" title="新对话">💬</button>
          <button class="xiaolu-header-btn" id="xiaolu-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="xiaolu-messages" id="xiaolu-messages"></div>
      <div class="xiaolu-input-area">
        <div class="xiaolu-input-row">
          <textarea class="xiaolu-input" id="xiaolu-input" rows="1" placeholder="跟小鹿聊聊..."></textarea>
          <button class="xiaolu-send-btn" id="xiaolu-send" title="发送">➤</button>
        </div>
        <div class="xiaolu-input-hint">Enter 发送 · Shift+Enter 换行</div>
      </div>
    `;

    // 缓存 DOM 引用
    messagesEl = panelEl.querySelector('#xiaolu-messages');
    inputEl = panelEl.querySelector('#xiaolu-input');
    sendBtn = panelEl.querySelector('#xiaolu-send');

    // 插入 DOM
    document.body.appendChild(overlayEl);
    document.body.appendChild(panelEl);

    // 绑定事件
    bindEvents();

    // 显示欢迎消息
    showWelcome();
  }

  /**
   * 绑定事件
   */
  function bindEvents() {
    // 关闭按钮
    panelEl.querySelector('#xiaolu-close').addEventListener('click', close);

    // 新对话
    panelEl.querySelector('#xiaolu-new-chat').addEventListener('click', () => {
      _chatHistory = [];
      messagesEl.innerHTML = '';
      showWelcome();
      if (typeof App !== 'undefined') App.showToast('已开始新对话 🦌');
    });

    // 发送按钮
    sendBtn.addEventListener('click', handleSend);

    // 输入框事件
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // 自动调整高度
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
    });
  }

  // ===== 消息渲染 =====

  function showWelcome() {
    const welcomeHtml = `
      <div class="xiaolu-welcome">
        <div class="xiaolu-welcome-icon">🦌</div>
        <div class="xiaolu-welcome-text">
          嘿！我是小鹿，你的 AI 伙伴 🦌<br>
          有什么想聊的、想整理的，随时找我~
        </div>
      </div>
    `;
    messagesEl.innerHTML = welcomeHtml;
  }

  function addUserMessage(text) {
    // 移除欢迎消息
    const welcome = messagesEl.querySelector('.xiaolu-welcome');
    if (welcome) welcome.remove();

    const msgEl = document.createElement('div');
    msgEl.className = 'xiaolu-msg user';
    msgEl.innerHTML = `
      <div class="xiaolu-msg-avatar">👤</div>
      <div class="xiaolu-msg-bubble">${escapeHtml(text)}</div>
    `;
    messagesEl.appendChild(msgEl);
    scrollToBottom();
  }

  function addAIMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'xiaolu-msg ai';
    msgEl.innerHTML = `
      <div class="xiaolu-msg-avatar">🦌</div>
      <div class="xiaolu-msg-bubble">${markdownToHtml(text)}</div>
    `;
    messagesEl.appendChild(msgEl);
    scrollToBottom();
  }

  function addErrorMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'xiaolu-msg ai xiaolu-msg-error';
    msgEl.innerHTML = `
      <div class="xiaolu-msg-avatar">⚠️</div>
      <div class="xiaolu-msg-bubble">${escapeHtml(text)}</div>
    `;
    messagesEl.appendChild(msgEl);
    scrollToBottom();
  }

  function showLoading() {
    const loadEl = document.createElement('div');
    loadEl.className = 'xiaolu-msg ai';
    loadEl.id = 'xiaolu-loading-msg';
    loadEl.innerHTML = `
      <div class="xiaolu-msg-avatar">🦌</div>
      <div class="xiaolu-msg-bubble">
        <div class="xiaolu-loading">
          <div class="xiaolu-loading-dot"></div>
          <div class="xiaolu-loading-dot"></div>
          <div class="xiaolu-loading-dot"></div>
        </div>
      </div>
    `;
    messagesEl.appendChild(loadEl);
    scrollToBottom();
  }

  function removeLoading() {
    const loadEl = messagesEl.querySelector('#xiaolu-loading-msg');
    if (loadEl) loadEl.remove();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // ===== 交互逻辑 =====

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || _isLoading) return;

    // 清空输入
    inputEl.value = '';
    inputEl.style.height = 'auto';

    // 显示用户消息
    addUserMessage(text);

    // 获取 token
    let token = await getDeepseekToken();
    if (!token) {
      token = await showTokenDialog();
      if (!token) {
        addErrorMessage('未配置 API Key，无法与小鹿对话 🦌');
        return;
      }
      await saveDeepseekToken(token);
    }

    // 显示加载 + 禁用输入
    _isLoading = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;
    showLoading();

    try {
      const reply = await callDeepSeekAPI(token, text);

      // 更新上下文
      _chatHistory.push({ role: 'user', content: text });
      _chatHistory.push({ role: 'assistant', content: reply });

      // 裁剪上下文，保留最近 MAX_CONTEXT 条
      if (_chatHistory.length > MAX_CONTEXT) {
        _chatHistory = _chatHistory.slice(-MAX_CONTEXT);
      }

      removeLoading();
      addAIMessage(reply);
    } catch (err) {
      removeLoading();
      const errMsg = err.message || '未知错误';

      if (errMsg === 'AUTH_ERROR') {
        addErrorMessage('认证失败，API Key 可能无效或已过期，请重新配置 🔑');
        _chatHistory = [];
        // 提示重新配置
        setTimeout(async () => {
          const newToken = await showTokenDialog();
          if (newToken) {
            await saveDeepseekToken(newToken);
            if (typeof App !== 'undefined') App.showToast('API Key 已更新 🦌');
          }
        }, 800);
      } else {
        addErrorMessage(errMsg);
      }
    } finally {
      _isLoading = false;
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  }

  // ===== 面板控制 =====

  function open() {
    if (_isOpen) return;

    // 关闭妮可面板（两个AI面板不能同时打开）
    if (typeof NicoleModule !== 'undefined' && NicoleModule.close) {
      NicoleModule.close();
    }

    // 首次打开时构建 DOM
    if (!panelEl) {
      buildPanel();
    }

    _isOpen = true;
    overlayEl.classList.add('show');
    panelEl.classList.add('show');

    // 聚焦输入框
    setTimeout(() => inputEl.focus(), 350);
  }

  function close() {
    if (!_isOpen) return;
    _isOpen = false;
    overlayEl.classList.remove('show');
    panelEl.classList.remove('show');
  }

  // ===== 初始化 =====
  function init() {
    console.log('[Xiaolu] 小鹿AI初始化...');
    console.log('[Xiaolu] 小鹿AI就绪 🦌');
  }

  return {
    init,
    open,
    close
  };
})();
