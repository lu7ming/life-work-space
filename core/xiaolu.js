/**
 * xiaolu.js - 小鹿AI伙伴
 * 人生工作台 · 基于 DeepSeek API 的 AI 对话功能
 * 小鹿定位：幽默轻松的 AI 伙伴，负责日常聊天、灵感整理、按需分析
 * v2.0 - 新增长按语音输入功能
 */

const XiaoluModule = (() => {
  // ===== 常量 =====
  const API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const MODEL_NAME = 'deepseek-chat';
  const MAX_CONTEXT = 20; // 最多保留最近20条消息
  const LONG_PRESS_DELAY = 500; // 长按触发语音的延迟（ms）

  const SYSTEM_PROMPT = `你是「小鹿」，人生工作台的 AI 伙伴，服务主人「鹿7铭」。
性格幽默轻松，像朋友一样聊天，偶尔皮一下但很靠谱。
你的职责：
1. 日常陪伴聊天
2. 帮鹿7铭整理想法、分类到合适的模块
3. 按需分析数据（用户问了才分析）
4. 帮写复盘草稿（周/月/年）
回复要简洁，不超过3句话，除非用户要求详细回答。
适当使用 emoji 让对话更生动 🦌

你可以帮用户执行本地操作，支持以下工具：
1. record_finance：记录收支。参数：type(income/expense), amount(数字), category(支出分类如餐饮/交通/购物/娱乐/其他), source(收入来源如工资/奖金/兼职/其他), note(可选备注)
2. create_task：创建任务。参数：title(标题), priority(high/medium/low), due_date(可选，格式YYYY-MM-DD)

当用户想执行这些操作时，在回复的最前面插入一个action标签，然后正常回复用户。格式如下：
[ACTION:{"tool":"record_finance","params":{"type":"income","amount":200,"source":"工资"}}]
注意：action标签必须放在回复的最前面，且只能有一个action标签。参数要完整，不要省略。`;

  // ===== 状态 =====
  let panelEl = null;
  let overlayEl = null;
  let messagesEl = null;
  let inputEl = null;
  let sendBtn = null;
  let _isOpen = false;
  let _isLoading = false;
  let _chatHistory = []; // 多轮对话上下文 [{role, content}, ...]

  // ===== 语音输入状态 =====
  let voiceBtn = null;
  let voiceStatusEl = null;
  let voiceStopBtn = null;
  let inputAreaEl = null;
  let _voiceRecognition = null;
  let _isRecording = false;
  let _isVoiceSupported = false;
  let _longPressTimer = null;
  let _longPressTriggered = false;
  let _voiceFinalTranscript = '';
  let _voiceInterimTranscript = '';

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

  // ===== 语音输入功能 =====

  /**
   * 检测浏览器是否支持语音识别
   */
  function checkVoiceSupport() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    _isVoiceSupported = !!SpeechRecognition;
    return _isVoiceSupported;
  }

  /**
   * 初始化语音识别
   */
  function initVoice() {
    if (!checkVoiceSupport()) {
      console.warn('[Xiaolu] 当前浏览器不支持 Web Speech API，语音功能不可用');
      // 隐藏语音按钮
      if (voiceBtn) {
        voiceBtn.style.display = 'none';
      }
      // 更新提示文字
      const hintEl = inputAreaEl.querySelector('.xiaolu-input-hint');
      if (hintEl) {
        hintEl.textContent = 'Enter 发送 · Shift+Enter 换行';
      }
      return;
    }

    // 创建 SpeechRecognition 实例
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    _voiceRecognition = new SpeechRecognition();
    _voiceRecognition.lang = 'zh-CN';
    _voiceRecognition.continuous = true;
    _voiceRecognition.interimResults = true;
    _voiceRecognition.maxAlternatives = 1;

    // 识别结果事件
    _voiceRecognition.onresult = (event) => {
      _voiceFinalTranscript = '';
      _voiceInterimTranscript = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          _voiceFinalTranscript += result[0].transcript;
        } else {
          _voiceInterimTranscript += result[0].transcript;
        }
      }

      // 实时更新输入框（已有最终结果 + 中间结果）
      const currentInput = inputEl.value;
      // 找到之前语音输入的起点，替换中间结果
      const baseText = _voiceBaseText;
      const displayText = baseText + _voiceFinalTranscript + _voiceInterimTranscript;
      inputEl.value = displayText;

      // 自动调整高度
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
    };

    // 识别错误
    _voiceRecognition.onerror = (event) => {
      console.error('[Xiaolu] 语音识别错误:', event.error);
      if (event.error === 'not-allowed') {
        stopRecording();
        if (typeof App !== 'undefined') {
          App.showToast('🎤 麦克风权限被拒绝，请在浏览器设置中开启');
        }
      } else if (event.error === 'no-speech') {
        // 没有检测到语音，不中断，继续等待
      } else if (event.error === 'aborted') {
        // 被中止，正常情况
      } else {
        stopRecording();
        if (typeof App !== 'undefined') {
          App.showToast('🎤 语音识别出错: ' + event.error);
        }
      }
    };

    // 识别结束（自动停止时触发）
    _voiceRecognition.onend = () => {
      if (_isRecording) {
        // 如果还在录音状态但识别结束了（可能是超时），重新启动
        try {
          _voiceRecognition.start();
        } catch (e) {
          // 如果已经在运行中则忽略
          stopRecording();
        }
      }
    };

    // 绑定长按事件
    bindVoiceEvents();

    console.log('[Xiaolu] 语音输入功能已就绪 🎤');
  }

  // 录音前的基础文本（用于拼接）
  let _voiceBaseText = '';

  /**
   * 绑定语音按钮的长按事件
   */
  function bindVoiceEvents() {
    if (!voiceBtn) return;

    // 阻止默认的触摸行为（避免滚动、文字选择等）
    const preventDefault = (e) => {
      if (_longPressTriggered) {
        e.preventDefault();
      }
    };

    // --- 触摸事件（移动端） ---
    voiceBtn.addEventListener('touchstart', (e) => {
      _longPressTriggered = false;
      _longPressTimer = setTimeout(() => {
        _longPressTriggered = true;
        startRecording();
        // 触觉反馈（如果支持）
        if (navigator.vibrate) {
          navigator.vibrate(30);
        }
      }, LONG_PRESS_DELAY);
    }, { passive: false });

    voiceBtn.addEventListener('touchend', (e) => {
      clearTimeout(_longPressTimer);
      if (_longPressTriggered) {
        e.preventDefault(); // 阻止触发 click
        stopRecording();
        _longPressTriggered = false;
      }
    });

    voiceBtn.addEventListener('touchmove', (e) => {
      // 手指移动超过一定距离则取消长按
      clearTimeout(_longPressTimer);
    }, { passive: true });

    voiceBtn.addEventListener('touchcancel', () => {
      clearTimeout(_longPressTimer);
      if (_longPressTriggered) {
        stopRecording();
        _longPressTriggered = false;
      }
    });

    // --- 鼠标事件（桌面端） ---
    voiceBtn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 防止失焦
      _longPressTriggered = false;
      _longPressTimer = setTimeout(() => {
        _longPressTriggered = true;
        startRecording();
      }, LONG_PRESS_DELAY);
    });

    voiceBtn.addEventListener('mouseup', (e) => {
      clearTimeout(_longPressTimer);
      if (_longPressTriggered) {
        stopRecording();
        _longPressTriggered = false;
      }
    });

    voiceBtn.addEventListener('mouseleave', () => {
      clearTimeout(_longPressTimer);
      if (_longPressTriggered) {
        stopRecording();
        _longPressTriggered = false;
      }
    });

    // 点击事件：短按切换录音（作为备用交互）
    voiceBtn.addEventListener('click', (e) => {
      // 如果是长按触发的，忽略 click
      if (_longPressTriggered) {
        e.preventDefault();
        return;
      }
      // 短按切换录音状态
      if (_isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    // 停止按钮
    if (voiceStopBtn) {
      voiceStopBtn.addEventListener('click', () => {
        stopRecording();
      });
    }

    // 全局 ESC 键停止录音
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _isRecording) {
        stopRecording();
      }
    });
  }

  /**
   * 开始录音
   */
  function startRecording() {
    if (_isRecording || !_voiceRecognition) return;

    _isRecording = true;
    _voiceFinalTranscript = '';
    _voiceInterimTranscript = '';
    _voiceBaseText = inputEl.value; // 记住当前输入框的内容

    // 更新 UI
    inputAreaEl.classList.add('voice-active');
    voiceBtn.classList.add('recording');
    voiceStatusEl.classList.add('show');
    inputEl.placeholder = '🎤 正在聆听...';
    inputEl.setAttribute('readonly', true);

    // 开始语音识别
    try {
      _voiceRecognition.start();
    } catch (e) {
      // 可能已经在运行中
      console.warn('[Xiaolu] 语音识别启动失败:', e);
      stopRecording();
    }
  }

  /**
   * 停止录音
   */
  function stopRecording() {
    if (!_isRecording) return;

    _isRecording = false;

    // 停止语音识别
    if (_voiceRecognition) {
      try {
        _voiceRecognition.stop();
      } catch (e) {
        // 忽略已停止的错误
      }
    }

    // 更新 UI
    inputAreaEl.classList.remove('voice-active');
    voiceBtn.classList.remove('recording');
    voiceStatusEl.classList.remove('show');
    inputEl.placeholder = '跟小鹿聊聊...';
    inputEl.removeAttribute('readonly');

    // 确保最终文本在输入框中
    const finalText = _voiceBaseText + _voiceFinalTranscript;
    inputEl.value = finalText;

    // 自动调整高度
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';

    // 清空语音临时变量
    _voiceFinalTranscript = '';
    _voiceInterimTranscript = '';
    _voiceBaseText = '';

    // 语音识别完成自动发送
    if (finalText.trim()) {
      // 短暂延迟确保UI更新完成
      setTimeout(() => handleSend(), 100);
      return; // handleSend 里会处理后续
    }

    // 聚焦输入框
    inputEl.focus();
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
      <div class="xiaolu-input-area" id="xiaolu-input-area">
        <div class="xiaolu-input-row">
          <textarea class="xiaolu-input" id="xiaolu-input" rows="1" placeholder="跟小鹿聊聊..."></textarea>
          <button class="xiaolu-voice-btn" id="xiaolu-voice-btn" title="长按语音输入">
            <svg class="xiaolu-voice-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <button class="xiaolu-send-btn" id="xiaolu-send" title="发送">➤</button>
        </div>
        <div class="xiaolu-voice-status" id="xiaolu-voice-status">
          <div class="xiaolu-voice-wave">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <span class="xiaolu-voice-label">正在聆听...</span>
          <button class="xiaolu-voice-stop-btn" id="xiaolu-voice-stop">停止</button>
        </div>
        <div class="xiaolu-input-hint">Enter 发送 · 长按 🎤 语音输入</div>
      </div>
    `;

    // 缓存 DOM 引用
    messagesEl = panelEl.querySelector('#xiaolu-messages');
    inputEl = panelEl.querySelector('#xiaolu-input');
    sendBtn = panelEl.querySelector('#xiaolu-send');
    voiceBtn = panelEl.querySelector('#xiaolu-voice-btn');
    voiceStatusEl = panelEl.querySelector('#xiaolu-voice-status');
    voiceStopBtn = panelEl.querySelector('#xiaolu-voice-stop');
    inputAreaEl = panelEl.querySelector('#xiaolu-input-area');

    // 插入 DOM
    document.body.appendChild(overlayEl);
    document.body.appendChild(panelEl);

    // 绑定事件
    bindEvents();

    // 初始化语音功能
    initVoice();

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

  // ===== 本地操作执行器 =====

  /**
   * 执行AI回复中解析出的本地操作
   * @param {Object} actionObj - {tool: string, params: Object}
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async function executeLocalAction(actionObj) {
    const { tool, params } = actionObj;

    if (tool === 'record_finance') {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
      const monthStr = dateStr.slice(0, 7); // YYYY-MM

      const record = {
        type: params.type || 'expense',
        amount: Number(params.amount) || 0,
        category: params.category || '其他',
        source: params.source || '其他',
        note: params.note || '',
        date: dateStr,
        month: monthStr,
        id: Date.now()
      };

      try {
        await Storage.add('finance', record);
        const typeLabel = record.type === 'income' ? '收入' : '支出';
        const detailField = record.type === 'income' ? `来源：${record.source}` : `分类：${record.category}`;
        return { success: true, message: `✅ 已记录${typeLabel} ¥${record.amount}（${detailField}）` };
      } catch (e) {
        console.error('[Xiaolu] 记录收支失败:', e);
        return { success: false, message: '记录收支时写入数据库失败' };
      }
    }

    if (tool === 'create_task') {
      const task = {
        title: params.title || '未命名任务',
        priority: params.priority || 'medium',
        status: 'pending',
        created_at: new Date().toISOString(),
        due_date: params.due_date || '',
        id: Date.now()
      };

      try {
        await Storage.add('tasks', task);
        const priorityMap = { high: '🔴高', medium: '🟡中', low: '🟢低' };
        const pLabel = priorityMap[task.priority] || '🟡中';
        const dueInfo = task.due_date ? `，截止 ${task.due_date}` : '';
        return { success: true, message: `✅ 已创建任务「${task.title}」${pLabel}优先级${dueInfo}` };
      } catch (e) {
        console.error('[Xiaolu] 创建任务失败:', e);
        return { success: false, message: '创建任务时写入数据库失败' };
      }
    }

    return { success: false, message: `未知工具：${tool}` };
  }

  // ===== 交互逻辑 =====

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || _isLoading) return;

    // 如果正在录音，先停止
    if (_isRecording) {
      stopRecording();
      return;
    }

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
    if (voiceBtn) voiceBtn.disabled = true;
    showLoading();

    try {
      const reply = await callDeepSeekAPI(token, text);

      // 解析AI回复中的ACTION标签
      const actionMatch = reply.match(/\[ACTION:({.*?})\]/);
      let finalReply = reply;
      if (actionMatch) {
        try {
          const action = JSON.parse(actionMatch[1]);
          const result = await executeLocalAction(action);
          // 移除action标签，保留文字部分
          finalReply = reply.replace(/\[ACTION:\{.*?\}\]\s*/, '').trim();
          // 追加执行结果提示
          if (result.success) {
            finalReply += '\n\n' + result.message;
          } else {
            finalReply += '\n\n❌ 操作失败：' + result.message;
          }
        } catch (e) {
          console.error('[Xiaolu] 本地操作执行失败:', e);
          // 解析或执行失败时，仅移除标签，保留文字
          finalReply = reply.replace(/\[ACTION:\{.*?\}\]\s*/, '').trim();
        }
      }

      // 更新上下文
      _chatHistory.push({ role: 'user', content: text });
      _chatHistory.push({ role: 'assistant', content: finalReply });

      // 裁剪上下文，保留最近 MAX_CONTEXT 条
      if (_chatHistory.length > MAX_CONTEXT) {
        _chatHistory = _chatHistory.slice(-MAX_CONTEXT);
      }

      removeLoading();
      addAIMessage(finalReply);
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
      if (voiceBtn) voiceBtn.disabled = false;
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

    // 如果正在录音，先停止
    if (_isRecording) {
      stopRecording();
    }

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
