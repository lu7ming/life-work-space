/**
 * xiaolu.js - 小鹿AI伙伴
 * 人生工作台 · 基于 DeepSeek API 的 AI 对话功能
 * 小鹿定位：幽默轻松的 AI 伙伴，负责日常聊天、灵感整理、按需分析
 * v3.0 - 新增链式意图识别(Decomposed LLM) + 本地操作确认机制
 */

const XiaoluModule = (() => {
  // ===== 常量 =====
  const API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const MODEL_NAME = 'deepseek-chat';
  const MAX_CONTEXT = 20; // 最多保留最近20条消息
  const LONG_PRESS_DELAY = 500; // 长按触发语音的延迟（ms）

  // --- 原始系统提示词（降级兜底用） ---
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

  // --- 链式意图识别：三跳 Prompt ---

  // 第一跳：意图分类
  const INTENT_CLASSIFY_PROMPT = `你是意图分类器。根据用户消息判断意图类别。
只输出 JSON，不要输出任何其他内容。
可选意图：
- finance_record：记录收入或支出
- task_create：创建待办任务
- habit_log：记录习惯打卡
- chat：日常聊天、闲聊、提问
- unknown：无法判断

用户消息："{message}"
输出JSON：`;

  // 第二跳：参数提取（按意图分别定义）
  const PARAM_EXTRACT_PROMPTS = {
    finance_record: `从用户消息中提取财务记录参数，输出JSON格式：
{"type":"income或expense","amount":数字,"category":"支出分类(餐饮/交通/购物/娱乐/其他)","source":"收入来源(工资/奖金/兼职/其他)","note":"可选备注","date":"YYYY-MM-DD或空"}
规则：
- 根据上下文推断type，提到"花/买/交"等=expense，提到"赚/发/收"等=income
- amount必须是数字
- 当前日期：{today}

用户消息："{message}"
输出JSON：`,

    task_create: `从用户消息中提取任务参数，输出JSON格式：
{"title":"任务标题","priority":"high/medium/low","due_date":"YYYY-MM-DD或空"}
规则：
- title要简洁明确
- priority默认medium，除非用户明确说"紧急/重要"=high，"不急"=low
- due_date如有明确日期则提取，否则为空

用户消息："{message}"
输出JSON：`,

    habit_log: `从用户消息中提取习惯打卡参数，输出JSON格式：
{"habit":"习惯名称","status":"completed/missed","note":"可选备注"}

用户消息："{message}"
输出JSON：`,

    chat: `无需提取参数。输出：{"needs_action":false}`,
    unknown: `无需提取参数。输出：{"needs_action":false}`
  };

  // 第三跳：自然回复生成
  const REPLY_GENERATE_PROMPT = `你是「小鹿」，人生工作台的 AI 伙伴，服务主人「鹿7铭」。
性格幽默轻松，像朋友一样聊天，偶尔皮一下但很靠谱。
回复要简洁，不超过3句话，适当使用 emoji 🦌

意图：{intent}
提取的参数：{params}
用户原始消息："{message}"

请生成一段自然、有趣的回复。
{action_instruction}
注意：回复中不要包含JSON，不要暴露内部参数细节。`;

  // 工具动作标签（给第三跳的指令片段）
  const ACTION_INSTRUCTIONS = {
    finance_record: '如果参数完整（至少有type和amount），在回复最前面加上：\n[ACTION:{"tool":"record_finance","params":{提取到的参数JSON}}]\n然后正常回复。',
    task_create: '如果参数完整（至少有title），在回复最前面加上：\n[ACTION:{"tool":"create_task","params":{提取到的参数JSON}}]\n然后正常回复。',
    habit_log: '如果参数完整（至少有habit），在回复最前面加上：\n[ACTION:{"tool":"habit_log","params":{提取到的参数JSON}}]\n然后正常回复。',
    chat: '',
    unknown: ''
  };

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

  /**
   * 安全解析 JSON，失败返回 null
   */
  function safeParseJSON(str) {
    try {
      // 尝试提取 JSON 部分（LLM 有时输出多余文字）
      const match = str.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取今天的日期字符串
   */
  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * 检查是否开启了自动确认
   */
  function isAutoConfirm() {
    try {
      return localStorage.getItem('xiaolu_auto_confirm') === 'true';
    } catch (e) {
      return false;
    }
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
   * 通用 DeepSeek API 调用（支持自定义 temperature 和 max_tokens）
   * @param {string} token - API Key
   * @param {Array} messages - 消息列表
   * @param {Object} options - { temperature, max_tokens }
   * @returns {Promise<string>} 回复内容
   */
  async function callDeepSeekStep(token, messages, options = {}) {
    const { temperature = 0.7, max_tokens = 500, timeout = 15000 } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: messages,
          temperature: temperature,
          max_tokens: max_tokens,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (resp.status === 401) throw new Error('AUTH_ERROR');
      if (resp.status === 429) throw new Error('API 额度已用完或请求太频繁，请稍后再试 😅');
      if (!resp.ok) throw new Error(`请求失败 (${resp.status})`);

      const data = await resp.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        const reply = data.choices[0].message.content;
        if (reply) return reply.trim();
      }
      throw new Error('未获取到有效回复');
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('请求超时，请稍后再试');
      }
      throw err;
    }
  }

  /**
   * 发送消息到 DeepSeek API（原始单次调用，降级兜底用）
   */
  async function callDeepSeekAPI(token, userMessage) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    const historySlice = _chatHistory.slice(-MAX_CONTEXT);
    messages.push(...historySlice);
    messages.push({ role: 'user', content: userMessage });

    let resp;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
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
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('请求超时，请稍后再试 🦌');
      }
      console.error('[Xiaolu] 网络请求失败:', err);
      throw new Error('网络连接失败，请检查网络后重试 🦌');
    }

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

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      const reply = data.choices[0].message.content;
      if (reply) return reply;
    }

    throw new Error('未获取到有效回复，请重试');
  }

  // ===== 链式意图识别（Decomposed LLM） =====

  /**
   * 链式意图识别：三跳调用
   * 第一跳 - 意图分类
   * 第二跳 - 参数提取
   * 第三跳 - 自然回复生成
   * 失败时降级到原始单次 prompt
   * @param {string} token - API Key
   * @param {string} userMessage - 用户消息
   * @returns {Promise<string>} AI 回复（可能包含 [ACTION:...] 标签）
   */
  async function decomposedIntentChain(token, userMessage) {
    const today = getTodayStr();

    // --- 第一跳：意图分类 ---
    let intent = 'chat'; // 默认
    try {
      const classifyPrompt = INTENT_CLASSIFY_PROMPT.replace('{message}', userMessage);
      const step1Messages = [
        { role: 'system', content: '你是意图分类器，只输出JSON，不输出其他内容。' },
        { role: 'user', content: classifyPrompt }
      ];
      const step1Result = await callDeepSeekStep(token, step1Messages, { temperature: 0, max_tokens: 50 });
      const parsed = safeParseJSON(step1Result);
      if (parsed && parsed.intent) {
        const validIntents = ['finance_record', 'task_create', 'chat', 'habit_log', 'unknown'];
        if (validIntents.includes(parsed.intent)) {
          intent = parsed.intent;
        }
      }
      console.log('[Xiaolu] 第一跳意图分类:', intent);
    } catch (err) {
      console.warn('[Xiaolu] 第一跳失败，降级到单次调用:', err.message);
      // 降级到原始单次 prompt
      return await callDeepSeekAPI(token, userMessage);
    }

    // --- 第二跳：参数提取 ---
    let extractedParams = null;
    try {
      const extractTemplate = PARAM_EXTRACT_PROMPTS[intent] || PARAM_EXTRACT_PROMPTS.chat;
      const extractPrompt = extractTemplate
        .replace(/{message}/g, userMessage)
        .replace(/{today}/g, today);
      const step2Messages = [
        { role: 'system', content: '你是参数提取器，只输出JSON，不输出其他内容。' },
        { role: 'user', content: extractPrompt }
      ];
      const step2Result = await callDeepSeekStep(token, step2Messages, { temperature: 0, max_tokens: 100 });
      extractedParams = safeParseJSON(step2Result);
      console.log('[Xiaolu] 第二跳参数提取:', extractedParams);
    } catch (err) {
      console.warn('[Xiaolu] 第二跳失败，降级到单次调用:', err.message);
      return await callDeepSeekAPI(token, userMessage);
    }

    // --- 第三跳：自然回复生成 ---
    try {
      // 检查是否有需要执行的操作
      const needsAction = intent !== 'chat' && intent !== 'unknown'
        && extractedParams && extractedParams.needs_action !== false;

      const actionInstruction = needsAction
        ? (ACTION_INSTRUCTIONS[intent] || '')
        : '';

      const replyPrompt = REPLY_GENERATE_PROMPT
        .replace('{intent}', intent)
        .replace('{params}', JSON.stringify(extractedParams || {}))
        .replace('{message}', userMessage)
        .replace('{action_instruction}', actionInstruction);

      const step3Messages = [
        { role: 'system', content: '你是小鹿，幽默轻松的AI伙伴。' },
        { role: 'user', content: replyPrompt }
      ];
      const reply = await callDeepSeekStep(token, step3Messages, { temperature: 0.8, max_tokens: 300 });
      console.log('[Xiaolu] 第三跳回复生成完成');
      return reply;
    } catch (err) {
      console.warn('[Xiaolu] 第三跳失败，使用模板化回复:', err.message);
      // 模板化兜底
      return generateTemplateReply(intent, extractedParams, userMessage);
    }
  }

  /**
   * 模板化回复（第三跳失败时的兜底）
   */
  function generateTemplateReply(intent, params, userMessage) {
    const templates = {
      finance_record: () => {
        if (!params || !params.amount) return '收到！不过我没能看清具体金额，能再说一遍吗？ 🦌';
        const typeLabel = params.type === 'income' ? '收入' : '支出';
        const actionParams = JSON.stringify({ type: params.type || 'expense', amount: Number(params.amount), category: params.category || '其他', source: params.source || '其他', note: params.note || '' });
        return `[ACTION:{"tool":"record_finance","params":${actionParams}}]\n已记录${typeLabel} ¥${params.amount}，记下来啦~ 📝`;
      },
      task_create: () => {
        const title = (params && params.title) || '未命名任务';
        const priority = (params && params.priority) || 'medium';
        const dueDate = (params && params.due_date) || '';
        const actionParams = JSON.stringify({ title, priority, due_date: dueDate });
        return `[ACTION:{"tool":"create_task","params":${actionParams}}]\n好的，任务「${title}」已创建，加油冲！ 🚀`;
      },
      habit_log: () => {
        const habit = (params && params.habit) || '未知习惯';
        return `打卡记录：${habit}，坚持就是胜利！ 💪🦌`;
      },
      chat: () => null, // 聊天意图不该走到这里
      unknown: () => null
    };

    const generator = templates[intent];
    if (generator) {
      const result = generator();
      if (result) return result;
    }

    // 最终兜底
    return '嗯...让我想想 🤔 能再说详细一点吗？';
  }

  // ===== 语音输入功能 =====

  function checkVoiceSupport() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    _isVoiceSupported = !!SpeechRecognition;
    return _isVoiceSupported;
  }

  function initVoice() {
    if (!checkVoiceSupport()) {
      console.warn('[Xiaolu] 当前浏览器不支持 Web Speech API，语音功能不可用');
      if (voiceBtn) {
        voiceBtn.style.display = 'none';
      }
      const hintEl = inputAreaEl.querySelector('.xiaolu-input-hint');
      if (hintEl) {
        hintEl.textContent = 'Enter 发送 · Shift+Enter 换行';
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    _voiceRecognition = new SpeechRecognition();
    _voiceRecognition.lang = 'zh-CN';
    _voiceRecognition.continuous = true;
    _voiceRecognition.interimResults = true;
    _voiceRecognition.maxAlternatives = 1;

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

      const currentInput = inputEl.value;
      const baseText = _voiceBaseText;
      const displayText = baseText + _voiceFinalTranscript + _voiceInterimTranscript;
      inputEl.value = displayText;

      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
    };

    _voiceRecognition.onerror = (event) => {
      console.error('[Xiaolu] 语音识别错误:', event.error);
      if (event.error === 'not-allowed') {
        stopRecording();
        if (typeof App !== 'undefined') {
          App.showToast('🎤 麦克风权限被拒绝，请在浏览器设置中开启');
        }
      } else if (event.error === 'no-speech') {
        // 没有检测到语音，不中断
      } else if (event.error === 'aborted') {
        // 被中止
      } else {
        stopRecording();
        if (typeof App !== 'undefined') {
          App.showToast('🎤 语音识别出错: ' + event.error);
        }
      }
    };

    _voiceRecognition.onend = () => {
      if (_isRecording) {
        try {
          _voiceRecognition.start();
        } catch (e) {
          stopRecording();
        }
      }
    };

    bindVoiceEvents();
    console.log('[Xiaolu] 语音输入功能已就绪 🎤');
  }

  let _voiceBaseText = '';

  function bindVoiceEvents() {
    if (!voiceBtn) return;

    const preventDefault = (e) => {
      if (_longPressTriggered) {
        e.preventDefault();
      }
    };

    // 触摸事件
    voiceBtn.addEventListener('touchstart', (e) => {
      _longPressTriggered = false;
      _longPressTimer = setTimeout(() => {
        _longPressTriggered = true;
        startRecording();
        if (navigator.vibrate) {
          navigator.vibrate(30);
        }
      }, LONG_PRESS_DELAY);
    }, { passive: false });

    voiceBtn.addEventListener('touchend', (e) => {
      clearTimeout(_longPressTimer);
      if (_longPressTriggered) {
        e.preventDefault();
        stopRecording();
        _longPressTriggered = false;
      }
    });

    voiceBtn.addEventListener('touchmove', (e) => {
      clearTimeout(_longPressTimer);
    }, { passive: true });

    voiceBtn.addEventListener('touchcancel', () => {
      clearTimeout(_longPressTimer);
      if (_longPressTriggered) {
        stopRecording();
        _longPressTriggered = false;
      }
    });

    // 鼠标事件
    voiceBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
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

    voiceBtn.addEventListener('click', (e) => {
      if (_longPressTriggered) {
        e.preventDefault();
        return;
      }
      if (_isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    if (voiceStopBtn) {
      voiceStopBtn.addEventListener('click', () => {
        stopRecording();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _isRecording) {
        stopRecording();
      }
    });
  }

  function startRecording() {
    if (_isRecording || !_voiceRecognition) return;

    _isRecording = true;
    _voiceFinalTranscript = '';
    _voiceInterimTranscript = '';
    _voiceBaseText = inputEl.value;

    inputAreaEl.classList.add('voice-active');
    voiceBtn.classList.add('recording');
    voiceStatusEl.classList.add('show');
    inputEl.placeholder = '🎤 正在聆听...';
    inputEl.setAttribute('readonly', true);

    try {
      _voiceRecognition.start();
    } catch (e) {
      console.warn('[Xiaolu] 语音识别启动失败:', e);
      stopRecording();
    }
  }

  function stopRecording() {
    if (!_isRecording) return;

    _isRecording = false;

    if (_voiceRecognition) {
      try {
        _voiceRecognition.stop();
      } catch (e) {
        // 忽略
      }
    }

    inputAreaEl.classList.remove('voice-active');
    voiceBtn.classList.remove('recording');
    voiceStatusEl.classList.remove('show');
    inputEl.placeholder = '跟小鹿聊聊...';
    inputEl.removeAttribute('readonly');

    const finalText = _voiceBaseText + _voiceFinalTranscript;
    inputEl.value = finalText;

    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';

    _voiceFinalTranscript = '';
    _voiceInterimTranscript = '';
    _voiceBaseText = '';

    if (finalText.trim()) {
      setTimeout(() => handleSend(), 100);
      return;
    }

    inputEl.focus();
  }

  // ===== UI 构建 =====

  function buildPanel() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'xiaolu-overlay';
    overlayEl.addEventListener('click', close);

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

    messagesEl = panelEl.querySelector('#xiaolu-messages');
    inputEl = panelEl.querySelector('#xiaolu-input');
    sendBtn = panelEl.querySelector('#xiaolu-send');
    voiceBtn = panelEl.querySelector('#xiaolu-voice-btn');
    voiceStatusEl = panelEl.querySelector('#xiaolu-voice-status');
    voiceStopBtn = panelEl.querySelector('#xiaolu-voice-stop');
    inputAreaEl = panelEl.querySelector('#xiaolu-input-area');

    document.body.appendChild(overlayEl);
    document.body.appendChild(panelEl);

    bindEvents();
    initVoice();
    showWelcome();
  }

  function bindEvents() {
    panelEl.querySelector('#xiaolu-close').addEventListener('click', close);

    panelEl.querySelector('#xiaolu-new-chat').addEventListener('click', () => {
      _chatHistory = [];
      messagesEl.innerHTML = '';
      showWelcome();
      if (typeof App !== 'undefined') App.showToast('已开始新对话 🦌');
    });

    sendBtn.addEventListener('click', handleSend);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

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
    return msgEl;
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

  // ===== 本地操作确认机制 =====

  /**
   * 格式化操作描述（给用户看的可读文本）
   * @param {Object} actionObj - {tool, params}
   * @returns {string} 人类可读的操作描述
   */
  function formatActionDescription(actionObj) {
    const { tool, params } = actionObj;

    if (tool === 'record_finance') {
      const typeLabel = params.type === 'income' ? '收入' : '支出';
      const amount = Number(params.amount) || 0;
      let detail = '';
      if (params.type === 'income') {
        detail = `来源：${params.source || '其他'}`;
      } else {
        detail = `分类：${params.category || '其他'}`;
      }
      if (params.note) detail += `，备注：${params.note}`;
      return `帮你记录了：${typeLabel} ¥${amount}，${detail}。确认记录？`;
    }

    if (tool === 'create_task') {
      const title = params.title || '未命名任务';
      const priorityMap = { high: '🔴高', medium: '🟡中', low: '🟢低' };
      const pLabel = priorityMap[params.priority] || '🟡中';
      const dueInfo = params.due_date ? `，截止 ${params.due_date}` : '';
      return `帮你创建任务：「${title}」，${pLabel}优先级${dueInfo}。确认创建？`;
    }

    if (tool === 'habit_log') {
      const habit = params.habit || '未知习惯';
      const statusLabel = params.status === 'completed' ? '✅ 完成' : '❌ 未完成';
      return `帮你记录习惯打卡：${habit} ${statusLabel}。确认记录？`;
    }

    return `执行操作：${tool}。确认执行？`;
  }

  /**
   * 显示操作确认卡片（带确认/取消按钮）
   * @param {Object} actionObj - {tool, params}
   * @param {string} replyText - AI 的文字回复（已去除 ACTION 标签）
   * @param {string} userMessage - 用户原始消息（用于上下文）
   */
  function showActionConfirmation(actionObj, replyText, userMessage) {
    // 先显示 AI 的文字回复
    const msgEl = addAIMessage(replyText);

    // 在消息下方添加确认卡片
    const confirmCard = document.createElement('div');
    confirmCard.className = 'xiaolu-action-confirm';

    const desc = formatActionDescription(actionObj);
    confirmCard.innerHTML = `
      <div class="xiaolu-action-confirm-desc">${escapeHtml(desc)}</div>
      <div class="xiaolu-action-confirm-btns">
        <button class="xiaolu-action-btn confirm">✅ 确认</button>
        <button class="xiaolu-action-btn cancel">❌ 取消</button>
      </div>
    `;
    messagesEl.appendChild(confirmCard);
    scrollToBottom();

    const confirmBtn = confirmCard.querySelector('.xiaolu-action-btn.confirm');
    const cancelBtn = confirmCard.querySelector('.xiaolu-action-btn.cancel');

    confirmBtn.addEventListener('click', async () => {
      // 禁用按钮防止重复点击
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;

      const result = await executeLocalAction(actionObj);

      // 替换确认卡片为执行结果
      const resultEl = document.createElement('div');
      resultEl.className = 'xiaolu-action-result';
      if (result.success) {
        resultEl.innerHTML = `<span class="xiaolu-action-result-icon">✅</span><span>${escapeHtml(result.message.replace('✅ ', ''))}</span>`;
      } else {
        resultEl.innerHTML = `<span class="xiaolu-action-result-icon">❌</span><span>${escapeHtml(result.message)}</span>`;
      }
      confirmCard.replaceWith(resultEl);
      scrollToBottom();

      // 更新对话上下文
      _chatHistory.push({ role: 'user', content: userMessage });
      _chatHistory.push({ role: 'assistant', content: replyText + '\n' + result.message });
      trimContext();
    });

    cancelBtn.addEventListener('click', () => {
      // 替换确认卡片为取消提示
      const cancelEl = document.createElement('div');
      cancelEl.className = 'xiaolu-action-result xiaolu-action-cancelled';
      cancelEl.innerHTML = `<span class="xiaolu-action-result-icon">🚫</span><span>好的，已取消</span>`;
      confirmCard.replaceWith(cancelEl);
      scrollToBottom();

      // 更新对话上下文
      _chatHistory.push({ role: 'user', content: userMessage });
      _chatHistory.push({ role: 'assistant', content: replyText + '\n（用户取消了操作）' });
      trimContext();
    });
  }

  /**
   * 裁剪上下文到 MAX_CONTEXT 条
   */
  function trimContext() {
    if (_chatHistory.length > MAX_CONTEXT) {
      _chatHistory = _chatHistory.slice(-MAX_CONTEXT);
    }
  }

  // ===== 本地操作执行器 =====

  async function executeLocalAction(actionObj) {
    const { tool, params } = actionObj;

    if (tool === 'record_finance') {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const monthStr = dateStr.slice(0, 7);

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

    if (tool === 'habit_log') {
      const record = {
        habit: params.habit || '未知习惯',
        status: params.status || 'completed',
        note: params.note || '',
        date: getTodayStr(),
        id: Date.now()
      };

      try {
        await Storage.add('habits', record);
        const statusLabel = record.status === 'completed' ? '完成' : '未完成';
        return { success: true, message: `✅ 已记录习惯打卡：${record.habit}（${statusLabel}）` };
      } catch (e) {
        console.error('[Xiaolu] 习惯打卡失败:', e);
        return { success: false, message: '记录习惯打卡时写入数据库失败' };
      }
    }

    return { success: false, message: `未知工具：${tool}` };
  }

  // ===== 交互逻辑 =====

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || _isLoading) return;

    if (_isRecording) {
      stopRecording();
      return;
    }

    inputEl.value = '';
    inputEl.style.height = 'auto';

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
      // 使用链式意图识别
      const reply = await decomposedIntentChain(token, text);

      // 解析AI回复中的ACTION标签
      const actionMatch = reply.match(/\[ACTION:({.*?})\]/);
      let finalReply = reply;
      let actionObj = null;

      if (actionMatch) {
        try {
          actionObj = JSON.parse(actionMatch[1]);
          // 移除 ACTION 标签，保留文字部分
          finalReply = reply.replace(/\[ACTION:\{.*?\}\]\s*/, '').trim();
        } catch (e) {
          console.error('[Xiaolu] ACTION标签解析失败:', e);
          finalReply = reply.replace(/\[ACTION:\{.*?\}\]\s*/, '').trim();
        }
      }

      removeLoading();

      // 如果有操作且未开启自动确认 → 显示确认卡片
      if (actionObj && !isAutoConfirm()) {
        showActionConfirmation(actionObj, finalReply, text);
      } else if (actionObj && isAutoConfirm()) {
        // 自动确认模式：直接执行
        const result = await executeLocalAction(actionObj);
        if (result.success) {
          finalReply += '\n\n' + result.message;
        } else {
          finalReply += '\n\n❌ 操作失败：' + result.message;
        }
        _chatHistory.push({ role: 'user', content: text });
        _chatHistory.push({ role: 'assistant', content: finalReply });
        trimContext();
        addAIMessage(finalReply);
      } else {
        // 没有操作，纯文字回复
        _chatHistory.push({ role: 'user', content: text });
        _chatHistory.push({ role: 'assistant', content: finalReply });
        trimContext();
        addAIMessage(finalReply);
      }
    } catch (err) {
      removeLoading();
      const errMsg = err.message || '未知错误';

      if (errMsg === 'AUTH_ERROR') {
        addErrorMessage('认证失败，API Key 可能无效或已过期，请重新配置 🔑');
        _chatHistory = [];
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

    if (typeof NicoleModule !== 'undefined' && NicoleModule.close) {
      NicoleModule.close();
    }

    if (!panelEl) {
      buildPanel();
    }

    _isOpen = true;
    overlayEl.classList.add('show');
    panelEl.classList.add('show');

    setTimeout(() => inputEl.focus(), 350);
  }

  function close() {
    if (!_isOpen) return;

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

  // ===== 快捷语音输入（长按🦌触发，不打开面板） =====
  let _quickRecognition = null;
  let _quickIsRecording = false;
  let _quickBubble = null;
  let _quickText = '';

  function _checkVoiceSupport() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function _showQuickBubble(text, isListening) {
    _removeQuickBubble();
    _quickBubble = document.createElement('div');
    _quickBubble.className = 'xiaolu-quick-bubble';
    _quickBubble.innerHTML = `
      <div class="xiaolu-quick-bubble-icon">${isListening ? '🎤' : '🦌'}</div>
      <div class="xiaolu-quick-bubble-text">${isListening ? '正在聆听...' : (text || '...')}</div>
    `;
    document.body.appendChild(_quickBubble);
    // 触发动画
    requestAnimationFrame(() => _quickBubble.classList.add('show'));
  }

  function _removeQuickBubble() {
    if (_quickBubble) {
      _quickBubble.classList.remove('show');
      setTimeout(() => {
        if (_quickBubble && _quickBubble.parentNode) {
          _quickBubble.parentNode.removeChild(_quickBubble);
        }
        _quickBubble = null;
      }, 300);
    }
  }

  function _updateQuickBubbleText(text) {
    if (_quickBubble) {
      const textEl = _quickBubble.querySelector('.xiaolu-quick-bubble-text');
      if (textEl) textEl.textContent = text || '...';
    }
  }

  async function quickVoiceInput() {
    if (_quickIsRecording) return;
    if (!_checkVoiceSupport()) {
      if (typeof App !== 'undefined') App.showToast('🎤 当前浏览器不支持语音识别');
      return;
    }

    // 确保面板已构建（需要 token 和 AI 处理能力）
    if (!panelEl) buildPanel();

    _quickIsRecording = true;
    _quickText = '';

    _showQuickBubble('', true);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    _quickRecognition = new SpeechRecognition();
    _quickRecognition.lang = 'zh-CN';
    _quickRecognition.continuous = true;
    _quickRecognition.interimResults = true;
    _quickRecognition.maxAlternatives = 1;

    _quickRecognition.onresult = (event) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      _quickText = final;
      _updateQuickBubbleText(final || interim || '🎤 正在录音... 松手发送 / 滑出取消');
    };

    _quickRecognition.onerror = (event) => {
      console.warn('[Xiaolu] 快捷语音识别错误:', event.error);
      if (event.error === 'not-allowed') {
        _quickIsRecording = false;
        _showQuickBubble('');
        _updateQuickBubbleText('麦克风权限被拒绝');
        setTimeout(_removeQuickBubble, 2000);
        if (typeof App !== 'undefined') App.showToast('🎤 麦克风权限被拒绝');
      }
    };

    _quickRecognition.onend = () => {
      if (_quickIsRecording) {
        // 还在录音中，尝试重启（continuous 模式下可能中途停止）
        try {
          _quickRecognition.start();
        } catch (e) {
          _cancelQuickVoice();
        }
      }
    };

    try {
      _quickRecognition.start();
    } catch (e) {
      console.warn('[Xiaolu] 快捷语音启动失败:', e);
      _quickIsRecording = false;
      _removeQuickBubble();
      if (typeof App !== 'undefined') App.showToast('🎤 语音启动失败');
      return;
    }

    // 松手（在按钮上）→ 停止录音并发送
    const finishHandler = () => {
      cleanup();
      _finishQuickVoice();
    };

    // 手指滑出按钮区域 → 取消（不发送）
    const cancelMoveHandler = (e) => {
      const fab = document.getElementById('ai-fab-xiaolu');
      if (!fab) { cancelHandler(); return; }
      const touch = e.touches ? e.touches[0] : e;
      const rect = fab.getBoundingClientRect();
      const x = touch.clientX, y = touch.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        cancelHandler();
      }
    };

    // 取消并清理
    const cancelHandler = () => {
      cleanup();
      _cancelQuickVoice();
    };

    const cleanup = () => {
      document.removeEventListener('touchend', finishHandler);
      document.removeEventListener('touchcancel', cancelHandler);
      document.removeEventListener('mouseup', finishHandler);
      document.removeEventListener('mouseleave', cancelHandler);
      document.removeEventListener('touchmove', cancelMoveHandler);
    };

    // 延迟添加释放监听，避免当前的 touchend/mouseup 立刻触发
    setTimeout(() => {
      document.addEventListener('touchend', finishHandler);    // 松手 → 发送
      document.addEventListener('touchcancel', cancelHandler);  // 系统取消 → 取消
      document.addEventListener('mouseup', finishHandler);      // 鼠标松手 → 发送
      document.addEventListener('mouseleave', cancelHandler);   // 鼠标移出 → 取消
      document.addEventListener('touchmove', cancelMoveHandler); // 手指滑出 → 取消
    }, 100);
  }

  function _cancelQuickVoice() {
    if (!_quickIsRecording) return;
    _quickIsRecording = false;

    if (_quickRecognition) {
      try { _quickRecognition.stop(); } catch (e) {}
      _quickRecognition = null;
    }

    _updateQuickBubbleText('已取消');
    setTimeout(_removeQuickBubble, 800);
  }

  function _finishQuickVoice() {
    if (!_quickIsRecording) return;
    _quickIsRecording = false;

    if (_quickRecognition) {
      try { _quickRecognition.stop(); } catch (e) {}
      _quickRecognition = null;
    }

    const text = _quickText.trim();
    if (!text) {
      _updateQuickBubbleText('没有听清，请重试');
      setTimeout(_removeQuickBubble, 1500);
      return;
    }

    // 显示识别文字 + 处理中状态
    _updateQuickBubbleText('💭 ' + text);

    // 异步调用 AI 处理
    _processQuickVoiceText(text);
  }

  async function _processQuickVoiceText(text) {
    const token = await getDeepseekToken();

    if (!token) {
      _updateQuickBubbleText('⚠️ 未配置 API Key，打开面板配置');
      setTimeout(() => {
        _removeQuickBubble();
        open();
      }, 1500);
      return;
    }

    try {
      const reply = await decomposedIntentChain(token, text);

      // 解析 ACTION 标签
      const actionMatch = reply.match(/\[ACTION:({.*?})\]/);
      let displayReply = reply;
      let actionObj = null;

      if (actionMatch) {
        try {
          actionObj = JSON.parse(actionMatch[1]);
          displayReply = reply.replace(/\[ACTION:\{.*?\}\]\s*/, '').trim();
        } catch (e) {
          displayReply = reply.replace(/\[ACTION:\{.*?\}\]\s*/, '').trim();
        }
      }

      // 如果有操作，直接执行
      if (actionObj) {
        const result = await executeLocalAction(actionObj);
        displayReply = result.success
          ? displayReply + '\n' + result.message
          : displayReply + '\n❌ ' + result.message;
      }

      // 保存聊天记录
      _chatHistory.push({ role: 'user', content: text });
      _chatHistory.push({ role: 'assistant', content: displayReply });
      trimContext();

      // 显示气泡结果
      _updateQuickBubbleText(displayReply.replace(/\n/g, ' '));
      setTimeout(_removeQuickBubble, 4000);

    } catch (err) {
      console.error('[Xiaolu] 快捷语音 AI 处理失败:', err);
      _updateQuickBubbleText('❌ ' + (err.message || '处理失败'));
      setTimeout(_removeQuickBubble, 3000);
    }
  }

  return {
    init,
    open,
    close,
    quickVoiceInput
  };
})();
