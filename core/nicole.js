/**
 * nicole.js - 妮可系统管家
 * 人生工作台 · 基于 Coze API 的 AI 对话功能
 * 妮可定位：严谨的系统管家，负责数据分析、健康检查、优化建议
 */

const NicoleModule = (() => {
  // ===== 常量 =====
  const BOT_ID = '7669022974943084584';
  const USER_ID = 'lu7ming';
  const API_BASE = 'https://api.coze.cn/v3';
  const POLL_INTERVAL = 1000;
  const POLL_MAX_WAIT = 60000;

  // ===== 状态 =====
  let panelEl = null;
  let overlayEl = null;
  let messagesEl = null;
  let inputEl = null;
  let sendBtn = null;
  let shortcutsEl = null;
  let _isOpen = false;
  let _isLoading = false;
  let _conversationId = null; // 维持会话上下文

  // ===== 工具函数 =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /**
   * 简单 Markdown 转 HTML（处理代码块、加粗、换行等）
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

    // 换行
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  // ===== Token 管理 =====
  async function getCozeToken() {
    try {
      const setting = await Storage.get('settings', 'coze_token');
      return setting ? setting.value : null;
    } catch (err) {
      console.error('[Nicole] 读取 token 失败:', err);
      return null;
    }
  }

  async function saveCozeToken(token) {
    try {
      await Storage.put('settings', { key: 'coze_token', value: token });
    } catch (err) {
      console.error('[Nicole] 保存 token 失败:', err);
    }
  }

  /**
   * 弹出 Token 输入对话框
   * @returns {Promise<string|null>} 返回输入的 token，取消则返回 null
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
        <div class="nicole-token-dialog">
          <h3>🔑 配置 API Token</h3>
          <p>妮可需要 Coze API Token 才能工作。<br>请在 Coze 平台获取个人访问令牌 (PAT) 后填入：</p>
          <input class="nicole-token-input" type="password" placeholder="请输入 PAT Token..." autocomplete="off" />
          <div class="nicole-token-actions">
            <button class="nicole-token-btn cancel">取消</button>
            <button class="nicole-token-btn confirm">确认保存</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('.nicole-token-input');
      const cancelBtn = overlay.querySelector('.cancel');
      const confirmBtn = overlay.querySelector('.confirm');

      // 聚焦
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

      // 点击遮罩关闭
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cancelBtn.click();
      });
    });
  }

  // ===== Coze API 调用 =====

  /**
   * 发送消息到 Coze API
   * @param {string} token - PAT Token
   * @param {string} userMessage - 用户消息
   * @returns {Promise<string>} AI 回复内容
   */
  async function callCozeAPI(token, userMessage) {
    // 步骤1：发起对话
    const chatBody = {
      bot_id: BOT_ID,
      user_id: USER_ID,
      stream: false,
      auto_save_history: true,
      additional_messages: [
        { role: 'user', content: userMessage, content_type: 'text' }
      ]
    };

    // 如果有历史会话，带上 conversation_id
    if (_conversationId) {
      chatBody.conversation_id = _conversationId;
    }

    let chatResp;
    try {
      const resp = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chatBody)
      });

      if (resp.status === 401) {
        throw new Error('AUTH_ERROR');
      }
      if (!resp.ok) {
        throw new Error(`HTTP_${resp.status}`);
      }

      chatResp = await resp.json();
    } catch (err) {
      if (err.message === 'AUTH_ERROR') {
        throw new Error('认证失败，Token 可能已过期或无效，请重新配置');
      }
      if (err.message.startsWith('HTTP_')) {
        throw new Error(`请求失败 (${err.message.replace('HTTP_', '')})，请稍后重试`);
      }
      throw new Error('网络连接失败，请检查网络后重试');
    }

    if (!chatResp.data) {
      throw new Error('API 响应异常，请稍后重试');
    }

    const chatId = chatResp.data.id;
    const conversationId = chatResp.data.conversation_id;

    // 保存 conversation_id 以维持会话
    if (conversationId) {
      _conversationId = conversationId;
    }

    // 简化方案：检查步骤1响应中是否直接包含消息内容
    if (chatResp.data.messages && chatResp.data.messages.length > 0) {
      const answerMsg = chatResp.data.messages.find(
        m => m.role === 'assistant' && m.type === 'answer'
      );
      if (answerMsg && answerMsg.content) {
        return answerMsg.content;
      }
    }

    // 步骤2：轮询对话状态
    const status = chatResp.data.status;
    if (status === 'completed') {
      // 已完成，直接获取消息
      return await fetchMessages(token, conversationId, chatId);
    }

    if (status === 'failed') {
      throw new Error('AI 处理失败，请重试');
    }

    // 需要轮询
    const startTime = Date.now();
    while (Date.now() - startTime < POLL_MAX_WAIT) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));

      try {
        const pollResp = await fetch(
          `${API_BASE}/chat/retrieve?conversation_id=${conversationId}&chat_id=${chatId}`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (!pollResp.ok) {
          if (pollResp.status === 401) throw new Error('AUTH_ERROR');
          continue;
        }

        const pollData = await pollResp.json();
        const pollStatus = pollData.data?.status;

        if (pollStatus === 'completed') {
          return await fetchMessages(token, conversationId, chatId);
        }
        if (pollStatus === 'failed') {
          throw new Error('AI 处理失败，请重试');
        }
      } catch (err) {
        if (err.message === 'AUTH_ERROR') {
          throw new Error('认证失败，Token 可能已过期或无效，请重新配置');
        }
        // 其他错误继续轮询
        console.warn('[Nicole] 轮询出错，继续等待...', err);
      }
    }

    throw new Error('等待超时（60秒），请重试');
  }

  /**
   * 步骤3：获取对话消息
   */
  async function fetchMessages(token, conversationId, chatId) {
    try {
      const resp = await fetch(
        `${API_BASE}/conversation/message/list?conversation_id=${conversationId}&chat_id=${chatId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!resp.ok) {
        throw new Error(`HTTP_${resp.status}`);
      }

      const data = await resp.json();
      const messages = data.data || [];

      // 找 assistant answer 消息
      const answerMsg = messages.find(
        m => m.role === 'assistant' && m.type === 'answer'
      );

      if (answerMsg && answerMsg.content) {
        return answerMsg.content;
      }

      // 备选：找最后一条 assistant 消息
      const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
      if (lastAssistant && lastAssistant.content) {
        return lastAssistant.content;
      }

      throw new Error('未获取到有效回复');
    } catch (err) {
      if (err.message === 'AUTH_ERROR' || (err.message && err.message.includes('401'))) {
        throw new Error('认证失败，Token 可能已过期或无效，请重新配置');
      }
      throw new Error('获取回复失败，请稍后重试');
    }
  }

  // ===== 数据摘要收集 =====

  /**
   * 收集 IndexedDB 中的数据统计摘要
   */
  async function collectDataSummary() {
    const summary = {};
    const stores = [
      'checkins', 'habits', 'tasks', 'study', 'health',
      'finance', 'goals', 'contacts', 'journal', 'knowledge', 'ideas'
    ];

    for (const store of stores) {
      try {
        const items = await Storage.getAll(store);
        summary[store] = items.length;
      } catch (e) {
        summary[store] = 0;
      }
    }

    // 额外收集一些细节
    try {
      // 任务状态
      const tasks = await Storage.getAll('tasks');
      summary.taskStatus = {
        todo: tasks.filter(t => t.status === 'todo').length,
        done: tasks.filter(t => t.status === 'done').length
      };

      // 本月打卡天数
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const checkins = await Storage.getAll('checkins');
      summary.monthCheckins = checkins.filter(c => c.month === monthStr).length;

      // 本月财务概览
      const finances = await Storage.getAll('finance');
      const monthFinances = finances.filter(f => f.month === monthStr);
      summary.monthFinance = {
        income: monthFinances.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0),
        expense: monthFinances.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0)
      };

      // 目标数量
      const goals = await Storage.getAll('goals');
      summary.goalStatus = {
        total: goals.length,
        active: goals.filter(g => g.status === 'active' || g.status === 'in_progress').length,
        completed: goals.filter(g => g.status === 'completed' || g.status === 'done').length
      };
    } catch (e) {
      console.warn('[Nicole] 收集详细摘要失败:', e);
    }

    return summary;
  }

  /**
   * 格式化摘要为可读文本
   */
  function formatSummary(summary) {
    const labels = {
      checkins: '打卡记录', habits: '习惯', tasks: '任务', study: '学习记录',
      health: '健康记录', finance: '财务记录', goals: '目标',
      contacts: '联系人', journal: '日记与反思', knowledge: '知识库', ideas: '灵感'
    };

    let text = '【各模块数据统计】\n';
    for (const [key, count] of Object.entries(summary)) {
      if (typeof count === 'number' && labels[key]) {
        text += `- ${labels[key]}：${count} 条\n`;
      }
    }

    if (summary.taskStatus) {
      text += `\n【任务状态】\n- 待办：${summary.taskStatus.todo}\n- 已完成：${summary.taskStatus.done}\n`;
    }
    if (summary.monthCheckins !== undefined) {
      text += `\n【本月打卡】${summary.monthCheckins} 天\n`;
    }
    if (summary.monthFinance) {
      text += `\n【本月财务】收入：¥${summary.monthFinance.income}，支出：¥${summary.monthFinance.expense}，结余：¥${summary.monthFinance.income - summary.monthFinance.expense}\n`;
    }
    if (summary.goalStatus) {
      text += `\n【目标状态】总计 ${summary.goalStatus.total} 个，进行中 ${summary.goalStatus.active} 个，已完成 ${summary.goalStatus.completed} 个\n`;
    }

    return text;
  }

  // ===== UI 构建 =====

  /**
   * 构建面板 DOM
   */
  function buildPanel() {
    // 遮罩
    overlayEl = document.createElement('div');
    overlayEl.className = 'nicole-overlay';
    overlayEl.addEventListener('click', close);

    // 面板
    panelEl = document.createElement('div');
    panelEl.className = 'nicole-panel';
    panelEl.innerHTML = `
      <div class="nicole-header">
        <div class="nicole-header-left">
          <div class="nicole-avatar">🔵</div>
          <div>
            <div class="nicole-title">妮可 · 系统管家</div>
            <div class="nicole-subtitle">数据分析 · 健康检查 · 优化建议</div>
          </div>
        </div>
        <div class="nicole-header-actions">
          <button class="nicole-header-btn" id="nicole-new-chat" title="新对话">💬</button>
          <button class="nicole-header-btn" id="nicole-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="nicole-messages" id="nicole-messages"></div>
      <div class="nicole-shortcuts" id="nicole-shortcuts">
        <button class="nicole-shortcut-btn" data-action="health-check">🩺 数据健康检查</button>
        <button class="nicole-shortcut-btn" data-action="efficiency">📊 使用效率分析</button>
        <button class="nicole-shortcut-btn" data-action="goals-audit">🎯 目标进度审计</button>
      </div>
      <div class="nicole-input-area">
        <div class="nicole-input-row">
          <textarea class="nicole-input" id="nicole-input" rows="1" placeholder="向妮可提问..."></textarea>
          <button class="nicole-send-btn" id="nicole-send" title="发送">➤</button>
        </div>
        <div class="nicole-input-hint">Enter 发送 · Shift+Enter 换行</div>
      </div>
    `;

    // 缓存 DOM 引用
    messagesEl = panelEl.querySelector('#nicole-messages');
    inputEl = panelEl.querySelector('#nicole-input');
    sendBtn = panelEl.querySelector('#nicole-send');
    shortcutsEl = panelEl.querySelector('#nicole-shortcuts');

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
    panelEl.querySelector('#nicole-close').addEventListener('click', close);

    // 新对话
    panelEl.querySelector('#nicole-new-chat').addEventListener('click', () => {
      _conversationId = null;
      messagesEl.innerHTML = '';
      showWelcome();
      if (typeof App !== 'undefined') App.showToast('已开始新对话');
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

    // 快捷功能按钮
    shortcutsEl.querySelectorAll('.nicole-shortcut-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        handleShortcut(btn.dataset.action);
      });
    });
  }

  // ===== 消息渲染 =====

  function showWelcome() {
    const welcomeHtml = `
      <div class="nicole-welcome">
        <div class="nicole-welcome-icon">🔵</div>
        <div class="nicole-welcome-text">
          你好，我是妮可，你的系统管家。<br>
          有什么需要分析或检查的，尽管吩咐。
        </div>
      </div>
    `;
    messagesEl.innerHTML = welcomeHtml;
  }

  function addUserMessage(text) {
    // 移除欢迎消息
    const welcome = messagesEl.querySelector('.nicole-welcome');
    if (welcome) welcome.remove();

    const msgEl = document.createElement('div');
    msgEl.className = 'nicole-msg user';
    msgEl.innerHTML = `
      <div class="nicole-msg-avatar">👤</div>
      <div class="nicole-msg-bubble">${escapeHtml(text)}</div>
    `;
    messagesEl.appendChild(msgEl);
    scrollToBottom();
  }

  function addAIMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'nicole-msg ai';
    msgEl.innerHTML = `
      <div class="nicole-msg-avatar">🔵</div>
      <div class="nicole-msg-bubble">${markdownToHtml(text)}</div>
    `;
    messagesEl.appendChild(msgEl);
    scrollToBottom();
  }

  function addErrorMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'nicole-msg ai nicole-msg-error';
    msgEl.innerHTML = `
      <div class="nicole-msg-avatar">⚠️</div>
      <div class="nicole-msg-bubble">${escapeHtml(text)}</div>
    `;
    messagesEl.appendChild(msgEl);
    scrollToBottom();
  }

  function showLoading() {
    const loadEl = document.createElement('div');
    loadEl.className = 'nicole-msg ai';
    loadEl.id = 'nicole-loading-msg';
    loadEl.innerHTML = `
      <div class="nicole-msg-avatar">🔵</div>
      <div class="nicole-msg-bubble">
        <div class="nicole-loading">
          <div class="nicole-loading-dot"></div>
          <div class="nicole-loading-dot"></div>
          <div class="nicole-loading-dot"></div>
        </div>
      </div>
    `;
    messagesEl.appendChild(loadEl);
    scrollToBottom();
  }

  function removeLoading() {
    const loadEl = messagesEl.querySelector('#nicole-loading-msg');
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
    let token = await getCozeToken();
    if (!token) {
      token = await showTokenDialog();
      if (!token) {
        addErrorMessage('未配置 Token，无法与妮可对话');
        return;
      }
      await saveCozeToken(token);
    }

    // 显示加载 + 禁用输入
    _isLoading = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;
    showLoading();

    try {
      const reply = await callCozeAPI(token, text);
      removeLoading();
      addAIMessage(reply);
    } catch (err) {
      removeLoading();
      const errMsg = err.message || '未知错误';

      if (errMsg.includes('认证失败') || errMsg.includes('Token')) {
        // Token 失效，提示重新配置
        addErrorMessage(errMsg);
        _conversationId = null; // 重置会话
        setTimeout(async () => {
          const newToken = await showTokenDialog();
          if (newToken) {
            await saveCozeToken(newToken);
            if (typeof App !== 'undefined') App.showToast('Token 已更新');
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

  async function handleShortcut(action) {
    if (_isLoading) return;

    let prompt = '';
    const summary = await collectDataSummary();
    const summaryText = formatSummary(summary);

    switch (action) {
      case 'health-check':
        prompt = `请对我的"人生工作台"数据进行一次全面的健康检查。以下是当前数据统计：\n\n${summaryText}\n\n请分析：\n1. 哪些模块数据量不足，需要补充？\n2. 数据更新频率是否健康？\n3. 有没有明显的数据缺失或不均衡？\n4. 给出具体的优化建议。`;
        break;

      case 'efficiency':
        prompt = `请分析我"人生工作台"各模块的使用效率。以下是当前数据统计：\n\n${summaryText}\n\n请分析：\n1. 哪些模块使用最频繁？哪些模块可能被忽略了？\n2. 从数据量来看，我的时间精力分配是否合理？\n3. 有没有被冷落的模块需要我多关注？\n4. 给出使用效率的改进建议。`;
        break;

      case 'goals-audit':
        prompt = `请审计我的目标完成情况。以下是当前数据统计：\n\n${summaryText}\n\n请分析：\n1. 目标完成率如何？\n2. 是否有目标长期没有进展？\n3. 任务完成情况与目标的关联性如何？\n4. 给出目标管理方面的具体建议。`;
        break;
    }

    if (!prompt) return;

    // 填充输入框并发送
    inputEl.value = prompt;
    handleSend();
  }

  // ===== 面板控制 =====

  function open() {
    if (_isOpen) return;

    // 关闭小鹿面板（两个AI面板不能同时打开）
    if (typeof XiaoluModule !== 'undefined' && XiaoluModule.close) {
      XiaoluModule.close();
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
    console.log('[Nicole] 妮可系统管家初始化...');
    // 事件绑定在 app.js 中完成（按钮绑定）
    console.log('[Nicole] 妮可系统管家就绪 🔵');
  }

  return {
    init,
    open,
    close
  };
})();
