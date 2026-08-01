/**
 * quickinput.js - F9 快速录入引擎
 * 人生工作台 · 自然语言快速创建任务/记录收支/打卡习惯/写日记/番茄钟
 */

const QuickInput = (() => {
  // ===== 常量 =====
  const API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const MODEL_NAME = 'deepseek-chat';

  const SYSTEM_PROMPT = `你是一个快速录入解析器。从用户的自然语言输入中提取结构化意图和参数。
只返回JSON，不要其他文字。

支持的意图类型：
1. task_create - 创建任务。提取：title(标题), priority(high/medium/low，默认medium), due_date(YYYY-MM-DD格式，相对时间转为具体日期)
2. finance_record - 记录收支。提取：type(income/expense), amount(数字), category(分类如餐饮/交通/购物/娱乐/学习/其他), note(备注)
3. habit_checkin - 习惯打卡。提取：habit_name(习惯名称)
4. journal_entry - 快速记录。提取：content(内容), mood(情绪:happy/calm/sad/angry/anxious)
5. pomodoro_start - 开始番茄钟。提取：duration(分钟数，默认25)

示例：
输入："明天买菜" → {"intent":"task_create","params":{"title":"买菜","priority":"medium","due_date":"明天日期"}}
输入："午饭花了35" → {"intent":"finance_record","params":{"type":"expense","amount":35,"category":"餐饮","note":"午饭"}}
输入："打卡跑步" → {"intent":"habit_checkin","params":{"habit_name":"跑步"}}
输入："今天心情不错，学了3小时英语" → {"intent":"journal_entry","params":{"content":"学了3小时英语","mood":"happy"}}
输入："开始专注" → {"intent":"pomodoro_start","params":{"duration":25}}

如果无法判断意图，返回：{"intent":"unknown","params":{"content":"原始输入"}}
只返回JSON对象，不要markdown代码块包裹。`;

  // ===== DOM 元素 =====
  let panelEl = null;
  let backdropEl = null;
  let inputEl = null;
  let previewEl = null;
  let confirmBtn = null;
  let sendBtn = null;
  let _isOpen = false;
  let _currentParsed = null;

  // ===== 关键词规则（DeepSeek 不可用时的 fallback） =====
  const KEYWORD_RULES = [
    {
      keywords: ['收入', '支出', '花了', '花了', '收到', '买了', '消费', '付款', '入账', '工资'],
      intent: 'finance_record',
      parse: (text) => {
        const params = { type: 'expense', amount: 0, category: '其他', note: '' };
        // 判断收支类型
        if (/收入|收到|入账|工资|赚|得/.test(text)) params.type = 'income';
        // 提取金额（先试阿拉伯数字，再试中文数字）
        const amountMatch = text.match(/(\d+\.?\d*)/);
        if (amountMatch) {
          params.amount = parseFloat(amountMatch[1]);
        } else {
          const chineseAmount = parseChineseNumber(text);
          if (chineseAmount !== null && chineseAmount > 0) params.amount = chineseAmount;
        }
        // 提取分类
        const catMap = { '吃|饭|餐|午|晚|早|外卖': '餐饮', '车|地铁|公交|打车|加油': '交通', '买|购|淘': '购物', '玩|电影|游戏|KTV': '娱乐', '书|课|培训|学费': '学习', '药|医院|看病': '医疗', '房租|水电|物业': '居住' };
        for (const [pattern, cat] of Object.entries(catMap)) {
          if (new RegExp(pattern).test(text)) { params.category = cat; break; }
        }
        // 去掉关键词后剩余作为备注
        params.note = text.replace(/收入|支出|花了|收到|买了|消费|付款|入账|\d+\.?\d*|元|块|钱/g, '').trim();
        // 清理备注中的中文数字残留（如 "三百" 被识别为金额后，备注不应再有 "三百"）
        if (params.amount && params.note) {
          params.note = params.note.replace(/[零〇一两二三四五六七八九十百千万亿]+/g, '').trim();
        }
        return params;
      }
    },
    {
      keywords: ['任务', '要做', '待办', '要做', '记得', '别忘了', '提醒'],
      intent: 'task_create',
      parse: (text) => {
        const params = { title: '', priority: 'medium', due_date: '' };
        // 提取标题：去掉关键词
        let title = text.replace(/任务|要做|待办|记得|别忘了|提醒|今天|明天|后天|下周/g, '').trim();
        if (!title) title = text.trim();
        params.title = title;
        // 优先级
        if (/紧急|赶紧|马上|立刻/.test(text)) params.priority = 'high';
        else if (/不急|有空|随时/.test(text)) params.priority = 'low';
        // 日期
        const now = new Date();
        if (/今天/.test(text)) { params.due_date = formatDate(now); }
        else if (/明天/.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 1); params.due_date = formatDate(d); }
        else if (/后天/.test(text)) { const d = new Date(now); d.setDate(d.getDate() + 2); params.due_date = formatDate(d); }
        return params;
      }
    },
    {
      keywords: ['打卡', '坚持', '完成', '做了'],
      intent: 'habit_checkin',
      parse: (text) => {
        let name = text.replace(/打卡|坚持|完成|做了|今天/g, '').trim();
        if (!name) name = text.trim();
        return { habit_name: name };
      }
    },
    {
      keywords: ['番茄', '专注', '开始学习', '开始工作'],
      intent: 'pomodoro_start',
      parse: (text) => {
        const match = text.match(/(\d+)\s*(分钟|min)/);
        return { duration: match ? parseInt(match[1]) : 25 };
      }
    }
  ];

  // ===== 工具函数 =====
  /**
   * 中文数字转阿拉伯数字
   * 支持：零一二三四五六七八九十百千万亿，以及两(=2)
   * 示例："三百" → 300, "一千五" → 1500, "两万" → 20000, "十五块" → 15
   */
  function parseChineseNumber(text) {
    if (!text) return null;
    const digitMap = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000, '万': 10000, '亿': 100000000 };
    // 提取中文字符序列
    const chineseNum = text.match(/[零〇一两二三四五六七八九十百千万亿]+/);
    if (!chineseNum) return null;
    const str = chineseNum[0];
    // 特殊处理：单独的"十"表示10，"十几"表示10+几
    let result = 0;
    let temp = 0;
    let hasDigit = false;
    for (let i = 0; i < str.length; i++) {
      const val = digitMap[str[i]];
      if (val === undefined) continue;
      if (val >= 10000) {
        // 万/亿：把前面的累积乘上去
        temp = temp === 0 ? 1 : temp;
        result += temp * val;
        temp = 0;
      } else if (val >= 10) {
        // 十/百/千
        if (temp === 0) temp = 1; // 如 "三百" 中 "三" 后面是 "百"
        temp = temp * val;
      } else {
        // 数字 0-9
        temp += val;
        hasDigit = true;
      }
    }
    if (!hasDigit && temp === 0 && str === '十') return 10;
    result += temp;
    return result || null;
  }

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ===== DeepSeek Token =====
  async function getDeepseekToken() {
    try {
      const setting = await Storage.get('settings', 'deepseek_token');
      return setting ? setting.value : null;
    } catch (err) {
      console.error('[QuickInput] 读取 token 失败:', err);
      return null;
    }
  }

  // ===== 自然语言解析 =====

  /**
   * 使用 DeepSeek API 解析用户输入
   */
  async function parseWithAI(text) {
    const token = await getDeepseekToken();
    if (!token) return null;

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text }
          ],
          stream: false,
          temperature: 0.1,
          max_tokens: 300
        })
      });

      if (!resp.ok) {
        console.warn('[QuickInput] API 调用失败:', resp.status);
        return null;
      }

      const data = await resp.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        let content = data.choices[0].message.content.trim();
        // 去掉可能的 markdown 代码块包裹
        content = content.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
        const parsed = JSON.parse(content);
        return parsed;
      }
    } catch (err) {
      console.warn('[QuickInput] AI 解析失败:', err);
    }
    return null;
  }

  /**
   * 使用关键词规则解析（fallback）
   */
  function parseWithKeywords(text) {
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some(kw => text.includes(kw))) {
        return {
          intent: rule.intent,
          params: rule.parse(text)
        };
      }
    }
    // 默认当作日记
    return {
      intent: 'journal_entry',
      params: { content: text, mood: 'calm' }
    };
  }

  /**
   * 解析用户输入（主入口）
   * 优先使用关键词规则（零成本），无法匹配时再调用 AI
   */
  async function parseQuickInput(text) {
    if (!text || !text.trim()) return null;
    text = text.trim();

    // 优先尝试关键词规则（零 API 成本，即时返回）
    let parsed = parseWithKeywords(text);
    if (parsed && parsed.intent && parsed.intent !== 'unknown' && parsed.intent !== 'journal_entry') {
      return parsed;
    }

    // 关键词无法明确匹配时，尝试 AI 解析
    const aiParsed = await parseWithAI(text);
    if (aiParsed && aiParsed.intent && aiParsed.intent !== 'unknown') {
      return aiParsed;
    }

    // 最终兜底：返回关键词规则结果（可能是 journal_entry）
    return parsed;
  }

  // ===== 执行逻辑 =====

  /**
   * 根据解析结果执行对应操作
   */
  async function executeQuickInput(parsed) {
    if (!parsed || !parsed.intent) {
      throw new Error('无法识别的输入');
    }

    const { intent, params } = parsed;
    let result = {};

    switch (intent) {
      case 'task_create': {
        const task = {
          title: params.title || '未命名任务',
          priority: params.priority || 'medium',
          dueDate: params.due_date || '',
          projectId: null,
          status: 'todo',
          date: formatDate(new Date()),
          completedAt: null,
        };
        const id = await Storage.add('tasks', task);
        task.id = id;
        result = { type: 'task', data: task, message: `任务「${task.title}」已创建 📋` };
        break;
      }

      case 'finance_record': {
        const amount = parseFloat(params.amount);
        if (!amount || amount <= 0) throw new Error('金额无效');
        const today = formatDate(new Date());
        const record = {
          type: params.type || 'expense',
          amount,
          category: params.category || '其他',
          source: params.type === 'income' ? (params.source || '其他') : '',
          note: params.note || '',
          date: params.date || today,
          month: (params.date || today).substring(0, 7)
        };
        const financeId = await Storage.add('finance', record);
        record.id = financeId;
        const symbol = record.type === 'income' ? '+' : '-';
        result = { type: 'finance', data: record, message: `${record.type === 'income' ? '收入' : '支出'} ¥${amount.toFixed(2)} 已记录 💰` };
        break;
      }

      case 'habit_checkin': {
        // 习惯打卡：更新 checkins 表
        const now = new Date();
        const dateStr = formatDate(now);
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        let existing = await Storage.get('checkins', dateStr);
        let habits = existing ? (existing.habits || []) : [];

        // 尝试匹配习惯名称
        const habitName = params.habit_name || '';
        // 习惯 ID 映射（参考 habits.js 中的 HABITS 列表）
        const habitMap = {
          '温水': 'warm-water', '喝水': 'drink-water', '水': 'warm-water',
          '早餐': 'breakfast', '早饭': 'breakfast',
          '运动': 'exercise', '跑步': 'exercise', '锻炼': 'exercise', '健身': 'exercise',
          '喝水达标': 'drink-water', '水达标': 'drink-water',
          '晚饭': 'dinner-light', '晚餐': 'dinner-light',
          '泡脚': 'foot-bath',
          '早睡': 'early-sleep', '睡觉': 'early-sleep',
          '读书': 'reading', '阅读': 'reading', '看书': 'reading',
          '学习': 'study', '背单词': 'study', '英语': 'study',
          '拉伸': 'stretch', '站立': 'stretch',
          '日记': 'journal', '复盘': 'journal', '写日记': 'journal',
          '记账': 'finance',
        };

        let matchedId = null;
        for (const [keyword, id] of Object.entries(habitMap)) {
          if (habitName.includes(keyword)) {
            matchedId = id;
            break;
          }
        }

        if (matchedId && !habits.includes(matchedId)) {
          habits.push(matchedId);
        } else if (!matchedId) {
          // 未匹配到具体习惯，记录到 general
          if (!habits.includes('general')) habits.push('general');
        }

        await Storage.put('checkins', {
          date: dateStr,
          month: monthStr,
          time: existing ? existing.time : timeStr,
          habits: habits
        });
        result = { type: 'habit', data: { date: dateStr, habit: matchedId || habitName, habits, previousHabits: existing ? (existing.habits || []) : [] }, message: `打卡成功 ✅ ${habitName || ''}` };
        break;
      }

      case 'journal_entry': {
        const record = {
          type: 'diary',
          subtype: '',
          content: params.content || '',
          mood: params.mood || 'calm',
          date: formatDate(new Date()),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        const journalId = await Storage.add('journal', record);
        record.id = journalId;
        result = { type: 'journal', data: record, message: '记录已保存 📝' };
        break;
      }

      case 'pomodoro_start': {
        // 记录番茄钟开始事件
        const record = {
          date: formatDate(new Date()),
          startTime: Date.now(),
          duration: (params.duration || 25) * 60,
          type: 'work',
          taskId: null,
          completed: false
        };
        const pomodoroId = await Storage.add('pomodoros', record);
        record.id = pomodoroId;
        result = { type: 'pomodoro', data: record, message: `番茄钟 ${params.duration || 25} 分钟开始 🍅` };
        break;
      }

      default:
        throw new Error('未知的意图类型');
    }

    return result;
  }

  // ===== UI =====

  /**
   * 创建快速录入面板 HTML
   */
  function createPanel() {
    if (panelEl) return;

    panelEl = document.createElement('div');
    panelEl.id = 'quickinput-panel';
    panelEl.className = 'qi-panel';
    panelEl.innerHTML = `
      <div class="qi-header">
        <span class="qi-title">⚡ 快速录入</span>
        <button class="qi-close" id="qi-close">✕</button>
      </div>
      <div class="qi-input-area">
        <textarea class="qi-input" id="qi-input" placeholder="说点什么..." rows="2"></textarea>
        <button class="qi-send-btn" id="qi-send-btn">➤</button>
      </div>
      <div class="qi-preview" id="qi-preview" style="display:none;">
        <div class="qi-preview-content" id="qi-preview-content"></div>
        <div class="qi-preview-actions">
          <button class="qi-btn qi-btn-cancel" id="qi-cancel">取消</button>
          <button class="qi-btn qi-btn-confirm" id="qi-confirm">确认执行</button>
        </div>
      </div>
      <div class="qi-hints">
        <span class="qi-hint-tag" data-hint="午饭花了30">💰 记账</span>
        <span class="qi-hint-tag" data-hint="明天记得买菜">📋 任务</span>
        <span class="qi-hint-tag" data-hint="打卡跑步">✅ 打卡</span>
        <span class="qi-hint-tag" data-hint="今天学了3小时英语">📝 记录</span>
        <span class="qi-hint-tag" data-hint="开始专注">🍅 番茄</span>
      </div>
    `;

    document.body.appendChild(panelEl);

    // 绑定事件
    document.getElementById('qi-close').addEventListener('click', close);
    document.getElementById('qi-send-btn').addEventListener('click', handleSend);
    document.getElementById('qi-cancel').addEventListener('click', resetPanel);
    document.getElementById('qi-confirm').addEventListener('click', handleConfirm);

    // 回车发送（Shift+回车换行）
    document.getElementById('qi-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // 快捷标签点击
    panelEl.querySelectorAll('.qi-hint-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const input = document.getElementById('qi-input');
        input.value = tag.dataset.hint;
        input.focus();
      });
    });
  }

  /**
   * 打开面板
   */
  function open() {
    if (!panelEl) createPanel();
    _isOpen = true;
    panelEl.classList.add('qi-open');
    document.getElementById('qi-input').value = '';
    document.getElementById('qi-input').focus();
    resetPreview();
  }

  /**
   * 关闭面板
   */
  function close() {
    if (!panelEl) return;
    _isOpen = false;
    panelEl.classList.remove('qi-open');
    _currentParsed = null;
  }

  /**
   * 重置预览区域
   */
  function resetPreview() {
    const preview = document.getElementById('qi-preview');
    if (preview) {
      preview.style.display = 'none';
      document.getElementById('qi-preview-content').innerHTML = '';
    }
    _currentParsed = null;
  }

  /**
   * 重置面板到初始状态
   */
  function resetPanel() {
    document.getElementById('qi-input').value = '';
    resetPreview();
    document.getElementById('qi-input').focus();
  }

  /**
   * 渲染解析结果预览
   */
  function renderPreview(parsed, originalText) {
    const preview = document.getElementById('qi-preview');
    const content = document.getElementById('qi-preview-content');
    if (!preview || !content) return;

    const intentLabels = {
      'task_create': '📋 创建任务',
      'finance_record': '💰 记录收支',
      'habit_checkin': '✅ 习惯打卡',
      'journal_entry': '📝 快速记录',
      'pomodoro_start': '🍅 番茄钟'
    };

    const label = intentLabels[parsed.intent] || '❓ 未识别';
    let details = '';

    switch (parsed.intent) {
      case 'task_create':
        details = `<strong>${escapeHtml(parsed.params.title || '未命名')}</strong>`;
        if (parsed.params.priority) {
          const pLabels = { high: '🔴 高', medium: '🟡 中', low: '🟢 低' };
          details += ` · ${pLabels[parsed.params.priority] || parsed.params.priority}`;
        }
        if (parsed.params.due_date) details += ` · 📅 ${parsed.params.due_date}`;
        break;

      case 'finance_record':
        const symbol = parsed.params.type === 'income' ? '+' : '-';
        details = `<strong>${symbol}¥${parseFloat(parsed.params.amount || 0).toFixed(2)}</strong>`;
        if (parsed.params.category) details += ` · ${escapeHtml(parsed.params.category)}`;
        if (parsed.params.note) details += ` · ${escapeHtml(parsed.params.note)}`;
        break;

      case 'habit_checkin':
        details = `<strong>${escapeHtml(parsed.params.habit_name || '打卡')}</strong>`;
        break;

      case 'journal_entry':
        details = escapeHtml(parsed.params.content || '').substring(0, 60);
        if (parsed.params.content && parsed.params.content.length > 60) details += '...';
        const moodLabels = { happy: '😊', calm: '😌', sad: '😢', angry: '😤', anxious: '😰' };
        if (parsed.params.mood) details += ` · ${moodLabels[parsed.params.mood] || parsed.params.mood}`;
        break;

      case 'pomodoro_start':
        details = `<strong>${parsed.params.duration || 25} 分钟专注</strong>`;
        break;

      default:
        details = escapeHtml(originalText);
    }

    content.innerHTML = `
      <div class="qi-preview-label">${label}</div>
      <div class="qi-preview-details">${details}</div>
    `;

    preview.style.display = 'flex';
    _currentParsed = parsed;
  }

  /**
   * 处理发送
   */
  async function handleSend() {
    const input = document.getElementById('qi-input');
    const text = input.value.trim();
    if (!text) return;

    // 显示加载状态
    const sendBtn = document.getElementById('qi-send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳';

    try {
      const parsed = await parseQuickInput(text);
      if (parsed) {
        renderPreview(parsed, text);
      } else {
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('无法识别，请换个说法试试');
        }
      }
    } catch (err) {
      console.error('[QuickInput] 解析失败:', err);
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('解析失败，请重试');
      }
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = '➤';
    }
  }

  /**
   * 处理确认执行
   */
  async function handleConfirm() {
    if (!_currentParsed) return;

    const confirmBtn = document.getElementById('qi-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '执行中...';

    try {
      const result = await executeQuickInput(_currentParsed);
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast(result.message || '已完成 ✅');
      }
      close();
      // 刷新当前路由以显示最新数据
      if (typeof Router !== 'undefined' && Router.getCurrentRoute) {
        const current = Router.getCurrentRoute();
        // 触发模块重新加载数据
        const routeReloadMap = {
          'tasks': () => typeof TasksModule !== 'undefined' && TasksModule.init && TasksModule.init(),
          'finance': () => typeof FinanceModule !== 'undefined' && FinanceModule.init && FinanceModule.init(),
          'habits': () => typeof HabitsModule !== 'undefined' && HabitsModule.init && HabitsModule.init(),
          'journal': () => typeof JournalModule !== 'undefined' && JournalModule.init && JournalModule.init(),
          'dashboard': () => typeof DashboardModule !== 'undefined' && DashboardModule.init && DashboardModule.init(),
        };
        if (routeReloadMap[current]) {
          routeReloadMap[current]();
        }
      }
    } catch (err) {
      console.error('[QuickInput] 执行失败:', err);
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast(err.message || '执行失败，请重试');
      }
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '确认执行';
    }
  }

  /**
   * 仅使用关键词规则解析（不调用 AI API，零成本快速解析）
   * 供 XiaoluModule 等需要快速判断的场景使用
   * @param {string} text - 用户输入文本
   * @returns {Object|null} 解析结果，无法匹配返回 null
   */
  function parseKeywordsOnly(text) {
    if (!text || !text.trim()) return null;
    text = text.trim();
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some(kw => text.includes(kw))) {
        return {
          intent: rule.intent,
          params: rule.parse(text)
        };
      }
    }
    return null;
  }

  // ===== 键盘快捷键 =====
  function handleKeydown(e) {
    // 按 / 键打开（焦点不在输入框时）
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const active = document.activeElement;
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
      if (active && active.isContentEditable) return;
      e.preventDefault();
      open();
    }
    // ESC 关闭
    if (e.key === 'Escape' && _isOpen) {
      close();
    }
  }

  // ===== 初始化 =====
  function init() {
    console.log('[QuickInput] 快速录入引擎初始化...');
    createPanel();
    document.addEventListener('keydown', handleKeydown);
    console.log('[QuickInput] 快速录入引擎就绪 ⚡');
  }

  return {
    init,
    open,
    close,
    parseQuickInput,
    parseKeywordsOnly,
    executeQuickInput,
    process: async function(text) {
      const parsed = await parseQuickInput(text);
      if (!parsed) throw new Error('无法解析');
      return await executeQuickInput(parsed);
    }
  };
})();
