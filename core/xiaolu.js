/**
 * xiaolu.js - 小鹿AI伙伴
 * 人生工作台 · 基于 DeepSeek API 的 AI 对话功能
 * 小鹿定位：幽默轻松的 AI 伙伴，负责日常聊天、灵感整理、按需分析
 * v4.3 - 第十四批优化：集成 EmotionAnalyzer 情感识别 + 情绪响应策略
 */

const XiaoluModule = (() => {
  // ===== 常量 =====
  const API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const MODEL_NAME = 'deepseek-chat';
  const MAX_CONTEXT = 20; // 最多保留最近20条消息

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

  // ===== AppUtils 快捷引用 =====
  const { escapeHtml, safeParseJSON, getTodayStr, markdownToHtml } = AppUtils;

  // ===== 模块生命周期管理 =====
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
    ContextTracker.clear();
    _chatHistory = [];
    close();
    console.log('[Xiaolu] 模块已销毁');
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
      // 优先使用加密存储（getAPIKey 支持新键名 + 旧键名自动迁移）
      if (typeof SecureStorage !== 'undefined' && SecureStorage.getAPIKey) {
        const token = await SecureStorage.getAPIKey('deepseek_api_key');
        return token;
      }
      // 兼容旧版 SecureStorage
      if (typeof SecureStorage !== 'undefined' && SecureStorage.loadSecure) {
        const token = await SecureStorage.loadSecure('deepseek_token');
        return token;
      }
      // 回退到明文读取
      const setting = await Storage.get('settings', 'deepseek_token');
      return setting ? setting.value : null;
    } catch (err) {
      console.error('[Xiaolu] 读取 token 失败:', err);
      return null;
    }
  }

  async function saveDeepseekToken(token) {
    try {
      // 优先使用加密存储（saveAPIKey 支持新键名 + 自动清理旧键名）
      if (typeof SecureStorage !== 'undefined' && SecureStorage.saveAPIKey) {
        await SecureStorage.saveAPIKey('deepseek_api_key', token);
        return;
      }
      // 兼容旧版 SecureStorage
      if (typeof SecureStorage !== 'undefined' && SecureStorage.saveSecure) {
        await SecureStorage.saveSecure('deepseek_token', token);
        return;
      }
      // 回退到明文存储
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
   * 集成 ModelRouter：根据 taskType 选择最优模型，记录调用成本
   * @param {string} token - API Key
   * @param {Array} messages - 消息列表
   * @param {Object} options - { temperature, max_tokens, timeout, taskType }
   * @returns {Promise<string>} 回复内容
   */
  async function callDeepSeekStep(token, messages, options = {}) {
    const { temperature = 0.7, max_tokens = 500, timeout = 15000, taskType } = options;

    // 优先使用 ModelRouter 路由调用
    if (typeof ModelRouter !== 'undefined' && ModelRouter.isEnabled() && taskType) {
      try {
        const result = await ModelRouter.callModel(taskType, token, messages, { temperature, max_tokens, timeout });
        return result.content;
      } catch (err) {
        console.warn('[Xiaolu] ModelRouter 调用失败，降级到直接调用:', err.message);
        // 降级到直接调用
      }
    }

    // 降级：直接调用 DeepSeek API（保持向后兼容）
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
    // 集成 PreferenceLearner：在 system prompt 末尾追加个性化后缀
    let personalizedPrompt = SYSTEM_PROMPT;
    if (typeof PreferenceLearner !== 'undefined' && PreferenceLearner.getPersonalizedPromptSuffix) {
      try {
        personalizedPrompt += PreferenceLearner.getPersonalizedPromptSuffix();
      } catch (e) { /* 静默降级 */ }
    }
    // 集成 EmotionAnalyzer：根据情感分析结果调整回复风格
    if (typeof EmotionAnalyzer !== 'undefined') {
      try {
        const result = EmotionAnalyzer.analyze(userMessage);
        const strategy = EmotionAnalyzer.getResponseStrategy(result);
        // 记录情绪（异步，不阻塞）
        if (EmotionAnalyzer.record) EmotionAnalyzer.record(result).catch(() => {});
        if (strategy === 'celebrate') personalizedPrompt += '\n用户情绪很好，回复活泼欢快，一起开心！';
        else if (strategy === 'encourage') personalizedPrompt += '\n用户情绪不错，鼓励继续保持！';
        else if (strategy === 'comfort') personalizedPrompt += '\n用户情绪有些低落，语气温暖关心。';
        else if (strategy === 'support') personalizedPrompt += '\n用户情绪很低落，回复格外温柔体贴，给予支持。';
      } catch (e) { /* 静默降级 */ }
    }
    const messages = [
      { role: 'system', content: personalizedPrompt }
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

    // 多轮对话上下文增强
    const augmentedMessage = ContextTracker.getAugmentedMessage(userMessage);

    // 情感分析
    const emotionResult = EmotionAnalyzer.analyze(userMessage);
    const emotionStrategy = EmotionAnalyzer.getResponseStrategy(emotionResult);
    // 记录情绪到 IndexedDB（异步，不阻塞主流程）
    if (typeof EmotionAnalyzer.record === 'function') {
      EmotionAnalyzer.record(emotionResult).catch(() => {});
    }

    // 共享知识上下文
    const sharedContext = typeof SharedKnowledge !== 'undefined' ? SharedKnowledge.getContextForPrompt('xiaolu') : '';

    // --- 第一跳：意图分类 ---
    let intent = 'chat'; // 默认
    try {
      const classifyPrompt = INTENT_CLASSIFY_PROMPT.replace('{message}', augmentedMessage);
      const step1Messages = [
        { role: 'system', content: '你是意图分类器，只输出JSON，不输出其他内容。' },
        { role: 'user', content: classifyPrompt }
      ];
      const step1Result = await callDeepSeekStep(token, step1Messages, { temperature: 0, max_tokens: 50, taskType: 'intent_classify' });
      const parsed = safeParseJSON(step1Result);
      if (parsed && parsed.intent) {
        const validIntents = new Set(['finance_record', 'task_create', 'chat', 'habit_log', 'unknown']);
        if (validIntents.has(parsed.intent)) {
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
      const step2Result = await callDeepSeekStep(token, step2Messages, { temperature: 0, max_tokens: 100, taskType: 'param_extract' });
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
        .replace('{message}', augmentedMessage)
        .replace('{action_instruction}', actionInstruction)
        + (sharedContext ? '\n\n共享上下文：' + sharedContext : '')
        + (emotionStrategy === 'celebrate' ? '\n用户情绪很好，一起开心庆祝！回复要活泼欢快！' : '')
        + (emotionStrategy === 'encourage' ? '\n用户情绪不错，鼓励继续保持！' : '')
        + (emotionStrategy === 'comfort' ? '\n用户情绪有些低落，语气要温暖关心。"怎么啦？聊聊？"' : '')
        + (emotionStrategy === 'support' ? '\n用户情绪很低落，回复要格外温柔体贴。"我在这，有什么能帮你的吗？"语气柔和，给予支持。' : '')
        // 集成 PreferenceLearner：追加个性化偏好后缀
        + (typeof PreferenceLearner !== 'undefined' && PreferenceLearner.getPersonalizedPromptSuffix ? PreferenceLearner.getPersonalizedPromptSuffix() : '');

      const step3Messages = [
        { role: 'system', content: '你是小鹿，幽默轻松的AI伙伴。' },
        { role: 'user', content: replyPrompt }
      ];
      const reply = await callDeepSeekStep(token, step3Messages, { temperature: 0.8, max_tokens: 300, taskType: 'chat' });
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
          <button class="xiaolu-header-btn" id="xiaolu-switch-nicole" title="切换到妮可">🔵</button>
          <button class="xiaolu-header-btn" id="xiaolu-new-chat" title="新对话">💬</button>
          <button class="xiaolu-header-btn" id="xiaolu-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="xiaolu-messages" id="xiaolu-messages"></div>
      <div class="xiaolu-input-area" id="xiaolu-input-area">
        <div class="xiaolu-input-row">
          <textarea class="xiaolu-input" id="xiaolu-input" rows="1" placeholder="跟小鹿聊聊..."></textarea>
          <button class="xiaolu-send-btn" id="xiaolu-send" title="发送">➤</button>
        </div>
        <div class="xiaolu-input-hint">Enter 发送</div>
      </div>
    `;

    messagesEl = panelEl.querySelector('#xiaolu-messages');
    inputEl = panelEl.querySelector('#xiaolu-input');
    sendBtn = panelEl.querySelector('#xiaolu-send');

    document.body.appendChild(overlayEl);
    document.body.appendChild(panelEl);

    bindEvents();
    showWelcome();
  }

  function bindEvents() {
    panelEl.querySelector('#xiaolu-close').addEventListener('click', close);

    // 切换到妮可（手动覆盖路由）
    panelEl.querySelector('#xiaolu-switch-nicole').addEventListener('click', () => {
      close();
      if (typeof AIOrchestrator !== 'undefined' && AIOrchestrator.setManualOverride) {
        AIOrchestrator.setManualOverride('nicole');
      }
      if (typeof NicoleModule !== 'undefined' && NicoleModule.open) {
        NicoleModule.open();
      }
    });

    panelEl.querySelector('#xiaolu-new-chat').addEventListener('click', () => {
      _chatHistory = [];
      ContextTracker.clear(); // 清除多轮对话上下文
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
      const dateStr = params.date || now.toISOString().slice(0, 10);
      const monthStr = dateStr.slice(0, 7);

      // 不设置 id，让 IndexedDB autoIncrement 自动生成
      const record = {
        type: params.type || 'expense',
        amount: Number(params.amount) || 0,
        category: params.category || '其他',
        source: params.source || '',
        note: params.note || '',
        date: dateStr,
        month: monthStr
      };

      // 金额校验
      if (record.amount <= 0) {
        return { success: false, message: '金额无效，请检查输入' };
      }

      try {
        const id = await Storage.add('finance', record);
        const typeLabel = record.type === 'income' ? '收入' : '支出';
        const detailField = record.type === 'income' ? `来源：${record.source || '其他'}` : `分类：${record.category || '其他'}`;
        return { success: true, message: `✅ 已记录${typeLabel} ¥${record.amount}（${detailField}）`, undoInfo: { storeName: 'finance', recordKey: id } };
      } catch (e) {
        console.error('[Xiaolu] 记录收支失败:', e);
        return { success: false, message: '记录收支时写入数据库失败：' + (e.message || e) };
      }
    }

    if (tool === 'create_task') {
      const task = {
        title: params.title || '未命名任务',
        priority: params.priority || 'medium',
        status: 'pending',
        created_at: new Date().toISOString(),
        due_date: params.due_date || ''
      };

      try {
        const id = await Storage.add('tasks', task);
        const priorityMap = { high: '🔴高', medium: '🟡中', low: '🟢低' };
        const pLabel = priorityMap[task.priority] || '🟡中';
        const dueInfo = task.due_date ? `，截止 ${task.due_date}` : '';
        return { success: true, message: `✅ 已创建任务「${task.title}」${pLabel}优先级${dueInfo}`, undoInfo: { storeName: 'tasks', recordKey: id } };
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
        const id = await Storage.add('habits', record);
        const statusLabel = record.status === 'completed' ? '完成' : '未完成';
        return { success: true, message: `✅ 已记录习惯打卡：${record.habit}（${statusLabel}）`, undoInfo: { storeName: 'habits', recordKey: id } };
      } catch (e) {
        console.error('[Xiaolu] 习惯打卡失败:', e);
        return { success: false, message: '记录习惯打卡时写入数据库失败' };
      }
    }

    return { success: false, message: `未知工具：${tool}` };
  }

  // ===== 本地数据查询（零 API 成本，从 Storage 读取并格式化） =====

  /**
   * 查询本地数据并格式化为可读文本
   * @param {string} queryType - 查询类型：query_finance / query_tasks / query_habits / query_income
   * @returns {Promise<string>} 格式化的查询结果文本
   */
  async function executeLocalQuery(queryType) {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM

    try {
      if (queryType === 'query_finance') {
        // 查询本月支出
        const allFinance = await Storage.getByIndex('finance', 'month', currentMonth);
        const expenses = allFinance.filter(r => r.type === 'expense');
        const totalExpense = expenses.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        // 按分类汇总
        const byCategory = {};
        expenses.forEach(r => {
          const cat = r.category || '其他';
          byCategory[cat] = (byCategory[cat] || 0) + (Number(r.amount) || 0);
        });
        const catLines = Object.entries(byCategory)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, amt]) => `  · ${cat}: ¥${amt.toFixed(0)}`)
          .join('\n');

        if (expenses.length === 0) {
          return `💰 本月还没有支出记录，继续保持！ 🦌`;
        }
        return `💰 本月支出汇总（${currentMonth}）\n总计：¥${totalExpense.toFixed(0)}（${expenses.length}笔）\n${catLines}\n\n详细数据在财务页面可以查看~ 🦌`;
      }

      if (queryType === 'query_income') {
        // 查询本月收入
        const allFinance = await Storage.getByIndex('finance', 'month', currentMonth);
        const incomes = allFinance.filter(r => r.type === 'income');
        const totalIncome = incomes.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        // 按来源汇总
        const bySource = {};
        incomes.forEach(r => {
          const src = r.source || '其他';
          bySource[src] = (bySource[src] || 0) + (Number(r.amount) || 0);
        });
        const srcLines = Object.entries(bySource)
          .sort((a, b) => b[1] - a[1])
          .map(([src, amt]) => `  · ${src}: ¥${amt.toFixed(0)}`)
          .join('\n');

        if (incomes.length === 0) {
          return `💰 本月还没有收入记录~ 🦌`;
        }
        return `💰 本月收入汇总（${currentMonth}）\n总计：¥${totalIncome.toFixed(0)}（${incomes.length}笔）\n${srcLines}\n\n详细数据在财务页面可以查看~ 🦌`;
      }

      if (queryType === 'query_tasks') {
        // 查询任务进度
        const allTasks = await Storage.getAll('tasks');
        const pending = allTasks.filter(t => t.status === 'pending' || !t.status);
        const completed = allTasks.filter(t => t.status === 'completed' || t.status === 'done');
        const total = allTasks.length;
        const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

        // 高优先级待办
        const urgentPending = pending.filter(t => t.priority === 'high');

        if (total === 0) {
          return `📋 还没有任务，轻松！需要创建一个吗？ 🦌`;
        }

        let result = `📋 任务进度概览\n总计：${total}个 | 已完成：${completed.length}个 | 待办：${pending.length}个 | 完成率：${completionRate}%`;
        if (urgentPending.length > 0) {
          result += `\n🔴 紧急待办：${urgentPending.slice(0, 3).map(t => t.title).join('、')}`;
        }
        result += '\n\n详细列表在任务页面可以查看~ 🦌';
        return result;
      }

      if (queryType === 'query_habits') {
        // 查询习惯打卡情况
        const todayStr = getTodayStr();
        const allCheckins = await Storage.getAll('checkins');
        const allHabits = await Storage.getAll('habits');

        // 计算打卡连续天数
        let streak = 0;
        const checkDate = new Date();
        // 如果今天还没打卡，从昨天开始算
        const todayCheckin = allCheckins.find(c => c.date === todayStr);
        if (!todayCheckin || !todayCheckin.habits || todayCheckin.habits.length === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
        }

        while (true) {
          const dateStr = checkDate.toISOString().slice(0, 10);
          const dayCheckin = allCheckins.find(c => c.date === dateStr);
          if (dayCheckin && dayCheckin.habits && dayCheckin.habits.length > 0) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
          if (streak > 365) break; // 安全上限
        }

        // 今日打卡状态
        const todayHabits = todayCheckin?.habits || [];
        const todayDone = todayHabits.filter(h => h.status === 'completed' || h.checked).length;
        const todayTotal = todayHabits.length;

        // 本月打卡天数
        const monthStr = todayStr.slice(0, 7);
        const monthCheckins = allCheckins.filter(c => c.date && c.date.startsWith(monthStr) && c.habits && c.habits.length > 0);
        const monthDays = monthCheckins.length;

        if (allHabits.length === 0 && monthDays === 0) {
          return `✅ 还没有习惯打卡记录，要开始养成好习惯吗？ 🦌`;
        }

        let result = `✅ 习惯打卡概览`;
        if (streak > 0) {
          result += `\n🔥 连续打卡：${streak}天`;
        }
        result += `\n📅 本月打卡：${monthDays}天`;
        if (todayTotal > 0) {
          result += `\n今日：${todayDone}/${todayTotal}已完成`;
        } else if (todayTotal === 0) {
          result += `\n今日：还未打卡`;
        }
        result += '\n\n详细打卡记录在习惯页面可以查看~ 🦌';
        return result;
      }

    } catch (err) {
      console.warn('[Xiaolu] 本地数据查询失败:', err);
    }

    return '查询数据时出了点问题，请稍后再试 🦌';
  }

  // ===== 模糊意图识别（FuzzyIntentHandler） =====

  /**
   * 模糊意图定义
   * match: 正则匹配关键词
   * needClarify: 需要澄清的参数列表
   * questions: 参数名 → 澄清问题映射
   * autoSuggest: 自动建议文案（不需要澄清，直接提示）
   * buildAction: 用户回答后，结合上下文构建完整操作对象
   */
  const FUZZY_INTENTS = [
    {
      match: /花了|消费|支出/,
      needClarify: ['amount'],
      questions: { amount: '花了多少呀？告诉我金额就好 🦌' },
      intentType: 'finance_record',
      buildAction: (ctx) => ({
        tool: 'record_finance',
        params: { type: 'expense', amount: Number(ctx.amount) || 0, category: ctx.category || '其他', source: '其他', note: '' }
      })
    },
    {
      match: /赚了|收入|进账/,
      needClarify: ['amount'],
      questions: { amount: '赚了多少呀？告诉我金额就好 🦌' },
      intentType: 'finance_record',
      buildAction: (ctx) => ({
        tool: 'record_finance',
        params: { type: 'income', amount: Number(ctx.amount) || 0, category: '其他', source: ctx.source || '其他', note: '' }
      })
    },
    {
      match: /记得|别忘了|别忘了/,
      needClarify: ['intent_type'],
      questions: { intent_type: '是要创建任务还是记个备忘？🤔' },
      intentType: 'task_or_memo',
      buildAction: (ctx) => {
        if (ctx.intent_type && /备忘|记事|笔记/.test(ctx.intent_type)) {
          return { tool: 'create_task', params: { title: ctx.title || '备忘', priority: 'low', due_date: '' } };
        }
        return { tool: 'create_task', params: { title: ctx.title || '待办任务', priority: 'medium', due_date: '' } };
      }
    },
    {
      match: /今天|好累|好开心|好烦|好郁闷|心情/,
      needClarify: [],
      autoSuggest: '要记一篇日记吗？📝',
      intentType: 'journal_suggest'
    }
  ];

  /**
   * 模糊意图上下文存储
   * 记录当前正在等待澄清的模糊意图，以及已收集的参数
   */
  let _fuzzyContext = null; // { intentDef, collected: {}, originalText }

  /**
   * 检查用户消息是否匹配模糊意图
   * 返回 { needClarify, questions, autoSuggest, intentDef } 或 null
   */
  function matchFuzzyIntent(text) {
    if (!text) return null;

    for (const intent of FUZZY_INTENTS) {
      if (intent.match.test(text)) {
        // 检查是否已经有完整的参数（如"花了35"已有金额，不需要澄清）
        if (intent.needClarify && intent.needClarify.includes('amount')) {
          const amountMatch = text.match(/(\d+\.?\d*)/);
          if (amountMatch) {
            // 金额已包含在消息中，不需要澄清
            continue; // 让后续的 QuickInput/local intent 处理
          }
        }

        return {
          needClarify: intent.needClarify || [],
          questions: intent.questions || {},
          autoSuggest: intent.autoSuggest || '',
          intentDef: intent
        };
      }
    }
    return null;
  }

  /**
   * 尝试处理模糊意图的澄清回答
   * 如果当前有等待澄清的上下文，且用户回复了所需参数，则完成意图识别
   * @param {string} text - 用户当前消息
   * @returns {Object|null} { actionObj, reply } 或 null（无上下文或不完整的回答）
   */
  function tryResolveFuzzyClarification(text) {
    if (!_fuzzyContext) return null;

    const { intentDef, collected, originalText } = _fuzzyContext;
    const needClarify = intentDef.needClarify || [];

    // 尝试从用户回答中提取参数
    if (needClarify.includes('amount')) {
      const amountMatch = text.match(/(\d+\.?\d*)/);
      if (amountMatch) {
        collected.amount = amountMatch[1];
      }
    }
    if (needClarify.includes('intent_type')) {
      // 用户回答是任务还是备忘
      if (/任务|待办|todo/.test(text)) {
        collected.intent_type = 'task';
      } else if (/备忘|记事|笔记|memo/.test(text)) {
        collected.intent_type = 'memo';
      } else {
        // 默认理解为任务
        collected.intent_type = text;
      }
    }

    // 检查是否所有需要的参数都已收集
    const allCollected = needClarify.every(key => collected[key] !== undefined);

    if (allCollected) {
      // 清除模糊上下文
      _fuzzyContext = null;

      // 构建操作对象
      if (intentDef.buildAction) {
        const actionObj = intentDef.buildAction(collected);
        // 用原始文本补充 title 等信息
        if (actionObj.tool === 'create_task' && !collected.title) {
          actionObj.params.title = originalText.replace(/记得|别忘了|别忘了/g, '').trim() || '待办任务';
        }
        return {
          actionObj,
          reply: `好的，明白了！让我帮你处理 🦌`
        };
      }
    }

    // 参数还不完整，继续等待
    return { waiting: true, missingParams: needClarify.filter(key => collected[key] === undefined) };
  }

  /**
   * 显示澄清问题（直接在聊天中回复）
   */
  function showClarification(questions, missingParams) {
    const questionTexts = missingParams
      .map(key => questions[key])
      .filter(Boolean)
      .join(' ');

    if (questionTexts) {
      _chatHistory.push({ role: 'user', content: _fuzzyContext ? _fuzzyContext.originalText : '' });
      _chatHistory.push({ role: 'assistant', content: questionTexts });
      trimContext();
      addAIMessage(questionTexts);
    }
  }

  /**
   * 显示自动建议（带建议按钮）
   */
  function showAutoSuggest(suggestText) {
    const msgEl = addAIMessage(suggestText);

    // 添加建议按钮
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;';

    const yesBtn = document.createElement('button');
    yesBtn.textContent = '📝 好的，写日记';
    yesBtn.style.cssText = `
      padding:6px 14px;border-radius:12px;border:1px solid var(--border-light,#C8AD94);
      background:var(--card-bg,#FAF6F0);color:var(--text-primary,#4A3728);
      font-size:13px;cursor:pointer;transition:all 0.2s;
    `;
    yesBtn.addEventListener('click', () => {
      // 跳转到日记页面
      if (typeof Router !== 'undefined' && Router.navigate) {
        Router.navigate('journal');
      }
      yesBtn.disabled = true;
      noBtn.disabled = true;
      yesBtn.style.opacity = '0.5';
    });
    yesBtn.addEventListener('mouseenter', () => {
      yesBtn.style.background = 'var(--accent,#D4BA9F)';
    });
    yesBtn.addEventListener('mouseleave', () => {
      yesBtn.style.background = 'var(--card-bg,#FAF6F0)';
    });

    const noBtn = document.createElement('button');
    noBtn.textContent = '不了谢谢';
    noBtn.style.cssText = `
      padding:6px 14px;border-radius:12px;border:1px solid var(--border-light,#C8AD94);
      background:transparent;color:var(--text-muted,#8a7a6d);
      font-size:13px;cursor:pointer;transition:all 0.2s;
    `;
    noBtn.addEventListener('click', () => {
      addAIMessage('好的，有需要随时找我 🦌');
      yesBtn.disabled = true;
      noBtn.disabled = true;
      noBtn.style.opacity = '0.5';
    });

    btnContainer.appendChild(yesBtn);
    btnContainer.appendChild(noBtn);
    msgEl.appendChild(btnContainer);
  }

  // ===== 扩展本地意图规则（零 API 成本） =====

  /**
   * 本地意图匹配器：覆盖高频场景，避免 API 调用
   * 返回 { type, reply, queryType?, actionObj?, route? } 或 null
   * queryType 表示需要异步查询 Storage 数据的意图类型
   */
  function matchLocalIntent(text) {
    if (!text) return null;

    // --- 周报/月报生成 ---
    if (/周报|周总结|本周总结|这周怎么样|一周回顾|这周汇报/.test(text)) {
      return {
        type: 'report_weekly',
        reply: '📊 好的，我帮你生成本周周报！正在跳转到模板页面... 🦌',
        route: 'templates'
      };
    }
    if (/月报|月总结|本月总结|这个月怎么样|月度回顾|月度汇报/.test(text)) {
      return {
        type: 'report_monthly',
        reply: '📊 好的，我帮你生成本月月报！正在跳转到模板页面... 🦌',
        route: 'templates'
      };
    }

    // --- 数据查询（从 Storage 读取数据，零 API 成本） ---
    if (/花了多少|支出多少|本月消费|这个月花了|消费多少|花了.*钱|总共花了|消费汇总|支出汇总|花了多少了/.test(text)) {
      return {
        type: 'query_finance',
        queryType: 'query_finance',  // 标记需要异步查询
        reply: '💰 正在查询本月支出...',  // 占位，将被异步查询结果替换
        route: 'finance'
      };
    }
    if (/做了多少|完成几个|任务进度|还有多少任务|待办多少|任务完成|任务概览|待办列表|还有什么任务/.test(text)) {
      return {
        type: 'query_tasks',
        queryType: 'query_tasks',
        reply: '📋 正在查询任务进度...',
        route: 'tasks'
      };
    }
    if (/连续几天|打卡几天|坚持多久|打卡情况|习惯怎么样|打卡记录|习惯打卡|打卡了几天|坚持了几天/.test(text)) {
      return {
        type: 'query_habits',
        queryType: 'query_habits',
        reply: '✅ 正在查询打卡情况...',
        route: 'habits'
      };
    }
    if (/本月收入|收入多少|赚了|工资|收入汇总|总共收入|赚了多少/.test(text)) {
      return {
        type: 'query_income',
        queryType: 'query_income',
        reply: '💰 正在查询本月收入...',
        route: 'finance'
      };
    }
    if (/目标.*进度|目标怎么样|完成了多少目标/.test(text)) {
      return {
        type: 'query_goals',
        reply: '🎯 帮你打开目标页面查看进度！ 🦌',
        route: 'goals'
      };
    }

    // --- 设置操作 ---
    if (/设置预算|改预算|预算多少|调整预算|预算设置/.test(text)) {
      return {
        type: 'setting_budget',
        reply: '⚙️ 帮你打开财务页面，可以在那里设置预算！ 🦌',
        route: 'finance'
      };
    }
    if (/改名字|换个名字|名字改成|修改用户名/.test(text)) {
      return {
        type: 'setting_username',
        reply: '好的！目前你可以在设置中修改用户名，我帮你跳转～ 🦌'
      };
    }

    // --- 提醒操作 ---
    if (/提醒我|别忘了|到时间提醒|该.*了|要记得|别忘了|记得提醒|别忘了提醒/.test(text) && !/打卡|记录|记|花|买/.test(text)) {
      // 避免和 QuickInput 的任务/财务规则冲突
      return {
        type: 'reminder_create',
        reply: '⏰ 收到提醒！建议你创建一个待办任务来跟踪，这样就不会忘了 🦌',
        route: 'tasks'
      };
    }

    // --- 快捷导航 ---
    if (/打开.*日记|去日记|写日记/.test(text)) {
      return {
        type: 'nav_journal',
        reply: '📝 帮你打开日记页面！ 🦌',
        route: 'journal'
      };
    }
    if (/打开.*健康|去健康|记录健康|健康数据/.test(text)) {
      return {
        type: 'nav_health',
        reply: '💪 帮你打开健康页面！ 🦌',
        route: 'health'
      };
    }
    if (/打开.*学习|去学习|学习记录/.test(text)) {
      return {
        type: 'nav_study',
        reply: '📚 帮你打开学习页面！ 🦌',
        route: 'study'
      };
    }
    if (/打开.*关系|去关系|联系人/.test(text)) {
      return {
        type: 'nav_relations',
        reply: '🤝 帮你打开关系页面！ 🦌',
        route: 'relations'
      };
    }
    if (/打开.*知识|去知识|知识库/.test(text)) {
      return {
        type: 'nav_knowledge',
        reply: '📖 帮你打开知识库！ 🦌',
        route: 'knowledge'
      };
    }
    if (/打开.*人生树|人生树|生命之花/.test(text)) {
      return {
        type: 'nav_lifetree',
        reply: '🌳 帮你打开人生树！ 🦌',
        route: 'lifetree'
      };
    }
    if (/回家|首页|总览|打开总览/.test(text)) {
      return {
        type: 'nav_dashboard',
        reply: '🏠 帮你回到首页！ 🦌',
        route: 'dashboard'
      };
    }

    return null; // 未匹配到本地规则，走 AI 路径
  }

  // ===== 交互逻辑 =====

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || _isLoading) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    addUserMessage(text);

    // ===== 离线降级：检查 LocalAI 是否需要接管 =====
    if (typeof LocalAI !== 'undefined' && LocalAI.handleOffline) {
      const offlineResult = LocalAI.handleOffline(text);
      if (offlineResult) {
        console.log('[Xiaolu] 离线降级命中:', offlineResult.intent);
        const reply = offlineResult.reply;

        // 从本地回复中提取 ACTION 标签
        let actionObj = _extractActionFromReply(reply);
        let finalReply = actionObj ? _removeActionTag(reply) : reply;

        _chatHistory.push({ role: 'user', content: text });
        _chatHistory.push({ role: 'assistant', content: finalReply });
        trimContext();
        addAIMessage(finalReply);

        // 如果有可执行操作，执行它
        if (actionObj) {
          const result = await executeLocalAction(actionObj);
          if (result.success) {
            finalReply += '\n\n' + result.message;
            ContextTracker.update(offlineResult.intent, actionObj.params, actionObj.tool);
            // 写入共享知识
            if (typeof SharedKnowledge !== 'undefined' && SharedKnowledge.set) {
              const today = getTodayStr();
              switch (actionObj.tool) {
                case 'record_finance':
                  SharedKnowledge.set('last_expense', { type: actionObj.params.type, amount: actionObj.params.amount, category: actionObj.params.category, date: today }, 'xiaolu');
                  break;
                case 'create_task':
                  SharedKnowledge.set('last_task', { title: actionObj.params.title, priority: actionObj.params.priority, date: today }, 'xiaolu');
                  break;
                case 'habit_log':
                  SharedKnowledge.set('last_habit_checkin', { habit: actionObj.params.habit, date: today }, 'xiaolu');
                  break;
              }
            }
            if (result.undoInfo) {
              _appendUndoButton(result.undoInfo, actionObj.tool);
            }
            addAIMessage(result.message);
          } else {
            addAIMessage('❌ 操作失败：' + result.message);
          }
        }

        // 离线提示（非强制本地模式下显示）
        if (!LocalAI.isLocalMode() || LocalAI.isOffline()) {
          // 不额外提示，回复模板已包含离线信息
        }

        return; // 离线降级已处理
      }
    }

    // ===== AI 智能路由：判断消息应由小鹿还是妮可处理 =====
    if (typeof AIOrchestrator !== 'undefined' && AIOrchestrator.route) {
      const routeResult = AIOrchestrator.route(text);
      // 更新路由指示器
      if (AIOrchestrator.updateIndicator) {
        AIOrchestrator.updateIndicator(routeResult.target, routeResult.confidence);
      }
      // 高置信度路由到妮可 → 切换到妮可面板处理
      if (routeResult.target === 'nicole' && routeResult.confidence >= 0.6) {
        console.log('[Xiaolu] 路由到妮可:', routeResult.reason);
        // 移除刚添加的用户消息（妮可面板会重新显示）
        const lastMsg = messagesEl.querySelector('.xiaolu-msg.user:last-of-type');
        if (lastMsg) lastMsg.remove();
        // 关闭小鹿面板，打开妮可面板
        close();
        if (typeof NicoleModule !== 'undefined' && NicoleModule.open) {
          NicoleModule.open();
          // 延迟后将消息填入妮可输入框并自动发送
          setTimeout(() => {
            const nicoleInput = document.getElementById('nicole-input');
            const nicoleSend = document.getElementById('nicole-send');
            if (nicoleInput && nicoleSend) {
              nicoleInput.value = text;
              nicoleSend.click();
            }
          }, 500);
        }
        return; // 小鹿不处理此消息
      }
    }

    // ===== 模糊意图识别：澄清回答处理（零 API 成本） =====
    // 如果当前有等待澄清的模糊意图上下文，先尝试解析用户的回答
    if (_fuzzyContext) {
      const clarification = tryResolveFuzzyClarification(text);
      if (clarification && clarification.actionObj) {
        // 澄清完成，执行操作
        console.log('[Xiaolu] handleSend: 模糊意图澄清完成，执行操作');
        const result = await executeLocalAction(clarification.actionObj);
        let displayReply = clarification.reply;
        if (result.success) {
          displayReply += '\n' + result.message;
          ContextTracker.update(clarification.actionObj.tool, clarification.actionObj.params, clarification.actionObj.tool);
          if (result.undoInfo) {
            _appendUndoButton(result.undoInfo, clarification.actionObj.tool);
          }
        } else {
          displayReply += '\n❌ 操作失败：' + result.message;
        }
        _chatHistory.push({ role: 'user', content: text });
        _chatHistory.push({ role: 'assistant', content: displayReply });
        trimContext();
        addAIMessage(displayReply);
        return; // 澄清已处理
      } else if (clarification && clarification.waiting) {
        // 参数还不完整，继续等待
        console.log('[Xiaolu] handleSend: 模糊意图参数不完整，继续等待');
        _chatHistory.push({ role: 'user', content: text });
        trimContext();
        const missingParams = clarification.missingParams || [];
        const questions = _fuzzyContext.intentDef.questions || {};
        showClarification(questions, missingParams);
        return;
      }
      // 如果无法解析为澄清回答，清除模糊上下文，继续正常流程
      _fuzzyContext = null;
    }

    // ===== 模糊意图识别：首次模糊意图匹配（零 API 成本） =====
    // 在关键词规则匹配之前，先检查模糊意图
    const fuzzyResult = matchFuzzyIntent(text);
    if (fuzzyResult) {
      console.log('[Xiaolu] handleSend: 模糊意图命中:', fuzzyResult.intentDef.intentType);

      if (fuzzyResult.needClarify.length > 0) {
        // 需要澄清 → 设置上下文，回复澄清问题，不走 API
        _fuzzyContext = {
          intentDef: fuzzyResult.intentDef,
          collected: {},
          originalText: text
        };
        _chatHistory.push({ role: 'user', content: text });
        trimContext();
        showClarification(fuzzyResult.questions, fuzzyResult.needClarify);
        return; // 等待用户回答
      }

      if (fuzzyResult.autoSuggest) {
        // 自动建议 → 显示建议按钮，不走 API
        _chatHistory.push({ role: 'user', content: text });
        trimContext();
        showAutoSuggest(fuzzyResult.autoSuggest);
        return;
      }
    }

    // ===== 多轮上下文：修改/追加意图处理（零 API 成本） =====
    // 检查用户是否在修改/追加上一轮操作（如"改成50"→修改金额）
    const modContext = ContextTracker.getModificationContext(text);
    if (modContext && modContext.lastTool) {
      console.log('[Xiaolu] handleSend: 多轮上下文命中:', modContext.type);

      if (modContext.type === 'modification') {
        // 修改类：用合并后的参数重新执行操作
        const actionObj = { tool: modContext.lastTool, params: modContext.modifiedParams };
        const result = await executeLocalAction(actionObj);
        const typeLabel = actionObj.tool === 'record_finance' ? (modContext.modifiedParams.type === 'income' ? '收入' : '支出') : '任务';
        let displayReply;
        if (result.success) {
          displayReply = `👌 已修改${typeLabel}！${result.message.replace('✅ ', '')}`;
          // 更新上下文追踪器
          ContextTracker.update(modContext.lastIntent, modContext.modifiedParams, modContext.lastTool);
          if (result.undoInfo) {
            _appendUndoButton(result.undoInfo, modContext.lastTool);
          }
        } else {
          displayReply = `❌ 修改失败：${result.message}`;
        }
        _chatHistory.push({ role: 'user', content: text });
        _chatHistory.push({ role: 'assistant', content: displayReply });
        trimContext();
        addAIMessage(displayReply);
        return; // 修改已处理

      } else if (modContext.type === 'append') {
        // 追加类：保留上下文分类等，继续走后续流程让用户补充新操作
        // 不直接返回，让 QuickInput/local intent 继续处理，但注入上下文信息
        console.log('[Xiaolu] handleSend: 追加操作，携带上下文继续处理');
      }
    }

    // ===== 快速路径：QuickInput 关键词匹配（零 API 成本，互斥优先） =====
    // 如果 QuickInput 关键词规则能明确识别意图，直接执行，不调用 AI
    if (typeof QuickInput !== 'undefined' && QuickInput.parseKeywordsOnly) {
      try {
        const qiParsed = QuickInput.parseKeywordsOnly(text);
        if (qiParsed && qiParsed.intent && qiParsed.intent !== 'unknown' && qiParsed.intent !== 'journal_entry') {
          // QuickInput 成功识别，直接构建 actionObj 并执行
          const toolMap = {
            'finance_record': { tool: 'record_finance', params: qiParsed.params },
            'task_create': { tool: 'create_task', params: qiParsed.params },
            'habit_checkin': { tool: 'habit_log', params: { habit: qiParsed.params.habit_name, status: 'completed' } }
          };
          const actionObj = toolMap[qiParsed.intent] || null;
          if (actionObj) {
            console.log('[Xiaolu] handleSend: QuickInput 快速路径命中:', qiParsed.intent);

            // 自动执行 + 撤销支持
            const result = await executeLocalAction(actionObj);
            const displayReply = result.success ? result.message : '❌ ' + result.message;
            _chatHistory.push({ role: 'user', content: text });
            _chatHistory.push({ role: 'assistant', content: displayReply });
            trimContext();
            addAIMessage(displayReply);

            // 更新多轮上下文追踪器
            if (result.success) {
              ContextTracker.update(qiParsed.intent, actionObj.params, actionObj.tool);
            }

            // 如果执行成功，在消息下方追加撤销按钮
            if (result.success && result.undoInfo) {
              _appendUndoButton(result.undoInfo, qiParsed.intent);
            }
            return; // ← 关键：QuickInput 已处理，不再走 AI 流程
          }
        }
      } catch (e) {
        console.warn('[Xiaolu] QuickInput 快速路径异常，回退到 AI:', e);
        // 继续走 AI 路径
      }
    }

    // ===== 扩展本地意图规则（零 API 成本，覆盖高频场景） =====
    const localIntent = matchLocalIntent(text);
    if (localIntent) {
      console.log('[Xiaolu] handleSend: 本地意图规则命中:', localIntent.type);

      // 查询类意图：从 Storage 异步读取数据并格式化返回
      let finalReply = localIntent.reply;
      if (localIntent.queryType) {
        try {
          const queryResult = await executeLocalQuery(localIntent.queryType);
          finalReply = queryResult;
        } catch (e) {
          console.warn('[Xiaolu] 本地查询失败，使用默认回复:', e);
          finalReply = localIntent.reply;
        }
      }

      _chatHistory.push({ role: 'user', content: text });
      _chatHistory.push({ role: 'assistant', content: finalReply });
      trimContext();
      addAIMessage(finalReply);

      // 如果是可执行操作，也执行它
      if (localIntent.actionObj) {
        const result = await executeLocalAction(localIntent.actionObj);
        if (result.success) {
          addAIMessage(result.message);
          _chatHistory.push({ role: 'assistant', content: result.message });
          // 更新多轮上下文追踪器
          ContextTracker.update(localIntent.type, localIntent.actionObj.params, localIntent.actionObj.tool);
          if (result.undoInfo) {
            _appendUndoButton(result.undoInfo, localIntent.actionObj.tool);
          }
        }
      }

      // 如果需要导航，执行路由跳转
      if (localIntent.route) {
        setTimeout(() => {
          if (typeof Router !== 'undefined' && Router.navigate) {
            Router.navigate(localIntent.route);
          }
        }, 500);
      }
      return; // ← 本地意图已处理，不再走 AI 流程
    }

    // ===== AI 路径：需要获取 token 并调用 DeepSeek API =====
    let token = await getDeepseekToken();
    if (!token) {
      token = await showTokenDialog();
      if (!token) {
        addErrorMessage('未配置 API Key，无法与小鹿对话 🦌');
        return;
      }
      await saveDeepseekToken(token);
    }

    // ===== 数据最小化：API 调用前脱敏 PII =====
    let _minimizeMapping = {};
    let sanitizedText = text;
    if (typeof DataMinimizer !== 'undefined' && DataMinimizer.isEnabled()) {
      try {
        const minimizeResult = await DataMinimizer.minimize(text, { source: 'xiaolu' });
        sanitizedText = minimizeResult.sanitizedText;
        _minimizeMapping = minimizeResult.mapping;
      } catch (e) {
        console.warn('[Xiaolu] DataMinimizer 脱敏失败，使用原文:', e);
      }
      // 首次使用提示
      DataMinimizer.showFirstTimeTip();
    }

    // 显示加载 + 禁用输入
    _isLoading = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;
    showLoading();

    try {
      // 使用链式意图识别（3 次 API 调用），发送脱敏后的文本
      const reply = await decomposedIntentChain(token, sanitizedText);

      // 集成 PreferenceLearner：从交互中学习偏好
      if (typeof PreferenceLearner !== 'undefined' && PreferenceLearner.learnFromInteraction) {
        try { PreferenceLearner.learnFromInteraction(text, reply); } catch (e) { /* 静默 */ }
      }

      // ===== 数据最小化：还原 AI 回复中的占位符 =====
      let restoredReply = reply;
      if (typeof DataMinimizer !== 'undefined' && Object.keys(_minimizeMapping).length > 0) {
        try {
          restoredReply = DataMinimizer.restore(reply, _minimizeMapping);
        } catch (e) {
          console.warn('[Xiaolu] DataMinimizer 还原失败:', e);
        }
      }

      // 从 AI 回复中提取 ACTION 标签
      let actionObj = _extractActionFromReply(restoredReply);
      let finalReply = actionObj ? _removeActionTag(restoredReply) : restoredReply;

      removeLoading();

      // 有操作 → 直接执行 + 撤销支持（不再弹确认框）
      if (actionObj) {
        const result = await executeLocalAction(actionObj);
        if (result.success) {
          finalReply += '\n\n' + result.message;
          // 更新上下文追踪器
          ContextTracker.update(actionObj.tool, actionObj.params, actionObj.tool);
          // 通知 AIOrchestrator（更新妮可洞察缓存 + 写入共享知识）
          if (typeof AIOrchestrator !== 'undefined') AIOrchestrator.notifyAction(actionObj.tool, result);
          // 写入共享知识（供妮可分析时引用）
          if (typeof SharedKnowledge !== 'undefined' && SharedKnowledge.set) {
            const today = getTodayStr();
            switch (actionObj.tool) {
              case 'record_finance':
                SharedKnowledge.set('last_expense', { type: actionObj.params.type, amount: actionObj.params.amount, category: actionObj.params.category, date: today }, 'xiaolu');
                // 更新消费画像：累计今日支出
                try {
                  const finances = await Storage.getAll('finance') || [];
                  const todayExpense = finances.filter(f => f.type === 'expense' && f.date === today).reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
                  SharedKnowledge.set('today_expense_total', { amount: todayExpense, date: today }, 'xiaolu');
                } catch (e) { /* 静默 */ }
                break;
              case 'create_task':
                SharedKnowledge.set('last_task', { title: actionObj.params.title, priority: actionObj.params.priority, date: today }, 'xiaolu');
                break;
              case 'habit_log':
                SharedKnowledge.set('last_habit_checkin', { habit: actionObj.params.habit, date: today }, 'xiaolu');
                break;
            }
          }
          // 写入审计日志
          const _auditActionMap = {
            record_finance: 'ai_finance_record',
            create_task: 'ai_task_create',
            habit_log: 'ai_habit_checkin'
          };
          if (typeof AuditLog !== 'undefined') AuditLog.log({
            type: _auditActionMap[actionObj.tool] || ('ai_' + actionObj.tool),
            source: 'xiaolu',
            params: actionObj.params,
            result: 'success',
            confirmed: true,
            duration: actionObj.duration || 0
          });
          // 集成 PreferenceLearner：记录用户确认操作
          if (typeof PreferenceLearner !== 'undefined' && PreferenceLearner.learnFromInteraction) {
            try {
              PreferenceLearner.learnFromInteraction(null, null, { action: 'confirm' });
              // 记录分类偏好
              if (actionObj.params && actionObj.params.category) {
                PreferenceLearner.learnFromInteraction(null, null, { action: 'category', value: actionObj.params.category });
              }
            } catch (e) { /* 静默 */ }
          }
        } else {
          finalReply += '\n\n❌ 操作失败：' + result.message;
          const _auditActionMap2 = {
            record_finance: 'ai_finance_record',
            create_task: 'ai_task_create',
            habit_log: 'ai_habit_checkin'
          };
          if (typeof AuditLog !== 'undefined') AuditLog.log({
            type: _auditActionMap2[actionObj.tool] || ('ai_' + actionObj.tool),
            source: 'xiaolu',
            params: actionObj.params,
            result: 'failed'
          });
        }
        _chatHistory.push({ role: 'user', content: sanitizedText });
        _chatHistory.push({ role: 'assistant', content: finalReply });
        trimContext();
        addAIMessage(finalReply);

        // 如果执行成功，追加撤销按钮
        if (result.success && result.undoInfo) {
          _appendUndoButton(result.undoInfo, actionObj.tool);
        }
      } else {
        // 没有操作，纯文字回复
        _chatHistory.push({ role: 'user', content: sanitizedText });
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

    _isOpen = false;
    overlayEl.classList.remove('show');
    panelEl.classList.remove('show');
  }

  // ===== 初始化 =====
  function init() {
    console.log('[Xiaolu] 小鹿AI初始化...');
    console.log('[Xiaolu] 小鹿AI就绪 🦌');
  }


  // ===== 操作撤销 =====
  let _undoStack = []; // 语音操作撤销栈 [{undoId, storeName, recordKey, intent, detail, timestamp, timerId, previousHabits}]
  let _undoCounter = 0; // 撤销 ID 计数器

  /**
   * 工具名映射到意图名（用于撤销）
   */
  const TOOL_TO_INTENT = {
    'record_finance': 'finance_record',
    'create_task': 'task_create',
    'habit_log': 'habit_checkin'
  };

  /**
   * 在聊天消息下方追加撤销按钮（15分钟内可撤销）
   */
  function _appendUndoButton(undoInfo, toolName) {
    const intent = TOOL_TO_INTENT[toolName] || toolName;
    _undoCounter++;
    const undoId = _undoCounter;
    const now = Date.now();
    const UNDO_WINDOW = 15 * 60 * 1000;

    undoInfo.undoId = undoId;
    undoInfo.timestamp = now;
    undoInfo.expiresAt = now + UNDO_WINDOW;

    // 15 分钟后自动过期
    undoInfo.timerId = setTimeout(() => {
      _removeUndoOption(undoId);
      // 同时移除聊天中的撤销按钮
      const btn = document.getElementById('chat-undo-' + undoId);
      if (btn) {
        btn.outerHTML = '<span style="font-size:11px;color:var(--text-muted,#8a7a6d);">撤销已过期</span>';
      }
    }, UNDO_WINDOW);

    _undoStack.push(undoInfo);

    // 在最后一条 AI 消息后插入撤销按钮
    const msgs = panelEl.querySelectorAll('.xiaolu-msg');
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && lastMsg.classList.contains('xiaolu-msg-ai')) {
      const undoDiv = document.createElement('div');
      undoDiv.style.cssText = 'margin-top:6px;text-align:right;';
      undoDiv.innerHTML = `
        <button id="chat-undo-${undoId}" style="padding:4px 12px;border-radius:8px;border:1px solid var(--border-light,#C8AD94);background:transparent;color:var(--text-muted,#8a7a6d);font-size:12px;cursor:pointer;">↩️ 撤销（15分钟内）</button>
      `;
      undoDiv.querySelector('button').addEventListener('click', () => {
        _performUndo(undoId);
      });
      lastMsg.appendChild(undoDiv);
    }
  }

  /**
   * 移除撤销选项（15分钟到期后调用）
   */
  function _removeUndoOption(undoId) {
    _undoStack = _undoStack.filter(u => u.undoId !== undoId);
    // 如果气泡还在，移除撤销按钮
    const undoBtn = document.getElementById(`voice-undo-${undoId}`);
    const undoHint = document.getElementById(`voice-undo-hint-${undoId}`);
    if (undoBtn) undoBtn.style.display = 'none';
    if (undoHint) undoHint.textContent = '撤销已过期';
  }

  /**
   * 执行撤销操作（同时支持聊天路径和语音气泡路径）
   */
  async function _performUndo(undoId) {
    const undoInfo = _undoStack.find(u => u.undoId === undoId);
    if (!undoInfo) {
      if (typeof App !== 'undefined') App.showToast('⚠️ 撤销已过期或不存在');
      return;
    }

    try {
      // 清除过期定时器
      if (undoInfo.timerId) clearTimeout(undoInfo.timerId);

      switch (undoInfo.intent) {
        case 'finance_record':
        case 'task_create':
        case 'pomodoro_start':
          await Storage.remove(undoInfo.storeName, undoInfo.recordKey);
          break;
        case 'habit_checkin': {
          // 恢复之前的 habits 数组
          const prevHabits = undoInfo.previousHabits || [];
          if (prevHabits.length === 0) {
            await Storage.remove(undoInfo.storeName, undoInfo.recordKey);
          } else {
            const existing = await Storage.get('checkins', undoInfo.recordKey);
            await Storage.put('checkins', {
              date: undoInfo.recordKey,
              month: undoInfo.month || undoInfo.recordKey.substring(0, 7),
              time: existing ? existing.time : '',
              habits: prevHabits
            });
          }
          break;
        }
      }

      // 从撤销栈移除
      _undoStack = _undoStack.filter(u => u.undoId !== undoId);

      // 更新聊天中的撤销按钮（如果存在）
      const chatBtn = document.getElementById('chat-undo-' + undoId);
      if (chatBtn) {
        chatBtn.outerHTML = '<span style="font-size:12px;color:var(--text-muted,#8a7a6d);">↩️ 已撤销</span>';
      }

      if (typeof App !== 'undefined') App.showToast('↩️ 已撤销', 2000);

      // 刷新相关模块
      _refreshAfterAction(undoInfo.intent);
    } catch (err) {
      console.error('[Xiaolu] 撤销失败:', err);
      if (typeof App !== 'undefined') App.showToast('❌ 撤销失败');
    }
  }

  /**
   * 健壮地从回复中提取 ACTION 标签（支持嵌套 JSON、换行、多余空格）
   */
  function _extractActionFromReply(reply) {
    if (!reply) return null;
    const startMarker = '[ACTION:';
    const startIdx = reply.indexOf(startMarker);
    if (startIdx === -1) return null;

    const afterStart = reply.substring(startIdx + startMarker.length);
    const endIdx = afterStart.lastIndexOf(']');
    if (endIdx === -1) return null;

    const jsonStr = afterStart.substring(0, endIdx).trim();
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.warn('[Xiaolu] ACTION JSON 解析失败:', jsonStr, e);
      return null;
    }
  }

  /**
   * 从回复中移除 ACTION 标签，保留纯文字
   */
  function _removeActionTag(reply) {
    if (!reply) return '';
    const startMarker = '[ACTION:';
    const startIdx = reply.indexOf(startMarker);
    if (startIdx === -1) return reply;

    const afterStart = reply.substring(startIdx + startMarker.length);
    const endIdx = afterStart.lastIndexOf(']');
    if (endIdx === -1) return reply;

    const tagEnd = startIdx + startMarker.length + endIdx + 1;
    return (reply.substring(0, startIdx) + reply.substring(tagEnd)).trim();
  }

  /**
   * 操作执行后刷新对应模块的数据
   */
  function _refreshAfterAction(intentOrTool) {
    const map = {
      'finance_record': () => {
        typeof FinanceModule !== 'undefined' && FinanceModule.init && FinanceModule.init();
        typeof DashboardModule !== 'undefined' && DashboardModule.init && DashboardModule.init();
      },
      'task_create': () => {
        typeof TasksModule !== 'undefined' && TasksModule.init && TasksModule.init();
        typeof DashboardModule !== 'undefined' && DashboardModule.init && DashboardModule.init();
      },
      'habit_checkin': () => {
        typeof HabitsModule !== 'undefined' && HabitsModule.init && HabitsModule.init();
        typeof DashboardModule !== 'undefined' && DashboardModule.init && DashboardModule.init();
      },
      'record_finance': () => {
        typeof FinanceModule !== 'undefined' && FinanceModule.init && FinanceModule.init();
        typeof DashboardModule !== 'undefined' && DashboardModule.init && DashboardModule.init();
      },
      'create_task': () => {
        typeof TasksModule !== 'undefined' && TasksModule.init && TasksModule.init();
        typeof DashboardModule !== 'undefined' && DashboardModule.init && DashboardModule.init();
      },
      'habit_log': () => {
        typeof HabitsModule !== 'undefined' && HabitsModule.init && HabitsModule.init();
        typeof DashboardModule !== 'undefined' && DashboardModule.init && DashboardModule.init();
      },
    };
    const fn = map[intentOrTool];
    if (fn) { try { fn(); } catch (e) { console.warn('[Xiaolu] 刷新模块失败:', e); } }
  }

  return {
    init,
    open,
    close,
    destroy
  };
})();
