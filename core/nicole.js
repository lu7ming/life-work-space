/**
 * nicole.js - 妮可系统管家
 * 人生工作台 · 基于 Coze API 的 AI 对话功能
 * 妮可定位：严谨的系统管家 → 主动军师
 * 五阶段信息处理流水线：Collect → Annotate → Cluster → Refine → Spawn
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
  let _pipelineRunning = false; // 防止流水线重复执行

  // ===== AppUtils 快捷引用 =====
  const { escapeHtml, markdownToHtml, getTodayStr, getWeekRange } = AppUtils;

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
    _conversationId = null;
    close();
    console.log('[Nicole] 模块已销毁');
  }

  // ===== Token 管理 =====
  async function getCozeToken() {
    try {
      // 优先使用加密存储
      if (typeof SecureStorage !== 'undefined' && SecureStorage.loadSecure) {
        const token = await SecureStorage.loadSecure('coze_token');
        return token;
      }
      // 回退到明文读取
      const setting = await Storage.get('settings', 'coze_token');
      return setting ? setting.value : null;
    } catch (err) {
      console.error('[Nicole] 读取 token 失败:', err);
      return null;
    }
  }

  async function saveCozeToken(token) {
    try {
      // 优先使用加密存储
      if (typeof SecureStorage !== 'undefined' && SecureStorage.saveSecure) {
        await SecureStorage.saveSecure('coze_token', token);
        return;
      }
      // 回退到明文存储
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
        console.warn('[Nicole] 轮询出错，继续等待...', err);
      }
    }

    throw new Error('等待超时（60秒），请重试');
  }

  /**
   * 获取对话消息
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

      const answerMsg = messages.find(
        m => m.role === 'assistant' && m.type === 'answer'
      );

      if (answerMsg && answerMsg.content) {
        return answerMsg.content;
      }

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

  // ===============================================
  // ===== 五阶段信息处理流水线 (Daily Pipeline) =====
  // ===============================================

  /**
   * Stage 1: Collect（数据采集）
   * 从 IndexedDB 中收集今日/本周的关键数据
   */
  async function collectData() {
    console.log('[Pipeline][Stage1] 开始数据采集...');
    const today = getTodayStr();
    const week = getWeekRange();
    const data = {
      date: today,
      weekRange: week,
      tasks: { total: 0, done: 0, overdue: 0, overdueList: [], todayDue: 0, todayDone: 0 },
      habits: { total: 0, checkedToday: 0, brokenStreaks: [], longestStreak: 0 },
      finance: { weekIncome: 0, weekExpense: 0, monthIncome: 0, monthExpense: 0, recentExpenses: [] },
      pomodoros: { todayCount: 0, todayMinutes: 0, weekCount: 0 },
      health: { recentEntries: [], exerciseThisWeek: 0, sleepAvg: 0 },
      goals: { total: 0, active: 0, stalled: [] },
      journal: { thisWeekCount: 0, lastEntry: null }
    };

    try {
      // === 任务 ===
      const tasks = await Storage.getAll('tasks') || [];
      data.tasks.total = tasks.length;
      data.tasks.done = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;

      // 逾期任务：有截止日期且已过期的未完成任务
      const todayDate = new Date(today);
      tasks.forEach(t => {
        if (t.status !== 'done' && t.status !== 'completed') {
          if (t.dueDate) {
            const due = new Date(t.dueDate);
            if (due < todayDate) {
              data.tasks.overdue++;
              if (data.tasks.overdueList.length < 5) {
                data.tasks.overdueList.push({ title: t.title || t.name || '未命名任务', dueDate: t.dueDate });
              }
            }
            if (t.dueDate === today) {
              data.tasks.todayDue++;
            }
          }
          // 也检查 createdAt 为今天的（今天该做的）
          if (t.dueDate === today) data.tasks.todayDue++;
        }
        if ((t.status === 'done' || t.status === 'completed') && t.completedAt && t.completedAt.startsWith(today)) {
          data.tasks.todayDone++;
        }
      });
      // 去重 todayDue
      data.tasks.todayDue = tasks.filter(t => t.dueDate === today && t.status !== 'done' && t.status !== 'completed').length;
      console.log('[Pipeline][Stage1] 任务数据：', data.tasks.total, '总计，', data.tasks.overdue, '逾期');

      // === 习惯 ===
      const habits = await Storage.getAll('habits') || [];
      const checkins = await Storage.getAll('checkins') || [];
      data.habits.total = habits.length;

      // 今日打卡情况
      const todayCheckins = checkins.filter(c => c.date === today);
      data.habits.checkedToday = todayCheckins.length;

      // 计算每个习惯的连续打卡天数和断签
      habits.forEach(h => {
        const hCheckins = checkins.filter(c => c.habitId === h.id || c.habitName === h.name)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const hDateSet = new Set(hCheckins.map(c => c.date));
        let streak = 0;
        let broken = false;
        const checkDate = new Date(today);

        for (let i = 0; i < 365; i++) {
          const dateStr = checkDate.toISOString().slice(0, 10);
          const has = hDateSet.has(dateStr);
          if (has) {
            streak++;
          } else if (i === 0) {
            // 今天还没打卡，不算断签
            continue;
          } else {
            broken = true;
            break;
          }
          checkDate.setDate(checkDate.getDate() - 1);
        }

        if (streak > data.habits.longestStreak) data.habits.longestStreak = streak;
        if (broken && streak < 3) {
          data.habits.brokenStreaks.push(h.name || h.title || '未命名习惯');
        }
      });
      console.log('[Pipeline][Stage1] 习惯数据：', data.habits.total, '个习惯，', data.habits.brokenStreaks.length, '个断签');

      // === 财务 ===
      const finances = await Storage.getAll('finance') || [];
      const monthStr = today.slice(0, 7);
      finances.forEach(f => {
        const amount = parseFloat(f.amount) || 0;
        // 本周
        if (f.date >= week.start && f.date <= week.end) {
          if (f.type === 'income') data.finance.weekIncome += amount;
          else data.finance.weekExpense += amount;
        }
        // 本月
        if (f.date && f.date.startsWith(monthStr)) {
          if (f.type === 'income') data.finance.monthIncome += amount;
          else {
            data.finance.monthExpense += amount;
            if (data.finance.recentExpenses.length < 5) {
              data.finance.recentExpenses.push({ name: f.name || f.category || '支出', amount });
            }
          }
        }
      });
      console.log('[Pipeline][Stage1] 财务数据：本周收入', data.finance.weekIncome, '支出', data.finance.weekExpense);

      // === 番茄钟 ===
      const pomodoros = await Storage.getAll('pomodoros') || [];
      pomodoros.forEach(p => {
        if (p.date === today) {
          data.pomodoros.todayCount++;
          data.pomodoros.todayMinutes += (p.duration || 25);
        }
        if (p.date >= week.start && p.date <= week.end) {
          data.pomodoros.weekCount++;
        }
      });
      console.log('[Pipeline][Stage1] 番茄钟：今日', data.pomodoros.todayCount, '个');

      // === 健康 ===
      const healthRecords = await Storage.getAll('health') || [];
      data.health.recentEntries = healthRecords
        .filter(h => h.date >= week.start)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 5);
      data.health.exerciseThisWeek = healthRecords.filter(h =>
        h.date >= week.start && h.date <= week.end &&
        (h.type === 'exercise' || h.category === 'exercise' || h.activity)
      ).length;
      const sleepRecords = healthRecords.filter(h => h.date >= week.start && h.sleep);
      if (sleepRecords.length > 0) {
        data.health.sleepAvg = sleepRecords.reduce((s, h) => s + (parseFloat(h.sleep) || 0), 0) / sleepRecords.length;
      }
      console.log('[Pipeline][Stage1] 健康数据：本周运动', data.health.exerciseThisWeek, '次');

      // === 目标 ===
      const goals = await Storage.getAll('goals') || [];
      data.goals.total = goals.length;
      data.goals.active = goals.filter(g => g.status === 'active' || g.status === 'in_progress').length;
      goals.forEach(g => {
        if (g.status === 'active' || g.status === 'in_progress') {
          const lastUpdate = g.updatedAt || g.lastCheckIn || '';
          if (lastUpdate) {
            const daysSince = Math.floor((todayDate - new Date(lastUpdate)) / 86400000);
            if (daysSince > 7) {
              data.goals.stalled.push(g.title || g.name || '未命名目标');
            }
          } else {
            data.goals.stalled.push(g.title || g.name || '未命名目标');
          }
        }
      });
      console.log('[Pipeline][Stage1] 目标数据：', data.goals.active, '个进行中，', data.goals.stalled.length, '个停滞');

      // === 日记 ===
      const journals = await Storage.getAll('journal') || [];
      data.journal.thisWeekCount = journals.filter(j => j.date >= week.start && j.date <= week.end).length;
      if (journals.length > 0) {
        const sorted = journals.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        data.journal.lastEntry = sorted[0].date || null;
      }
      console.log('[Pipeline][Stage1] 日记：本周', data.journal.thisWeekCount, '篇');

    } catch (e) {
      console.error('[Pipeline][Stage1] 数据采集异常:', e);
    }

    console.log('[Pipeline][Stage1] ✅ 数据采集完成');
    return data;
  }

  /**
   * Stage 2: Annotate（标注分析）
   * 将采集数据发给 AI 打标签，失败则用代码规则降级
   */
  async function annotateData(collectedData) {
    console.log('[Pipeline][Stage2] 开始标注分析...');

    // 先做代码层面的基础标注
    const annotated = {
      items: [],
      aiAvailable: false
    };

    // 任务标注
    const taskRate = collectedData.tasks.total > 0
      ? Math.round((collectedData.tasks.done / collectedData.tasks.total) * 100)
      : 0;
    if (collectedData.tasks.overdue >= 3) {
      annotated.items.push({ category: 'tasks', label: '异常', severity: 'high', text: `${collectedData.tasks.overdue} 个任务已逾期，完成率仅 ${taskRate}%` });
    } else if (collectedData.tasks.overdue > 0) {
      annotated.items.push({ category: 'tasks', label: '需要关注', severity: 'medium', text: `有 ${collectedData.tasks.overdue} 个逾期任务，完成率 ${taskRate}%` });
    } else if (taskRate >= 70) {
      annotated.items.push({ category: 'tasks', label: '完成得好', severity: 'low', text: `任务完成率 ${taskRate}%，状态良好` });
    } else if (collectedData.tasks.total > 0) {
      annotated.items.push({ category: 'tasks', label: '需要关注', severity: 'medium', text: `任务完成率 ${taskRate}%，还有提升空间` });
    }

    // 习惯标注
    if (collectedData.habits.brokenStreaks.length > 0) {
      annotated.items.push({ category: 'habits', label: '异常', severity: 'high', text: `习惯断签：${collectedData.habits.brokenStreaks.join('、')}` });
    } else if (collectedData.habits.longestStreak >= 7) {
      annotated.items.push({ category: 'habits', label: '完成得好', severity: 'low', text: `最长连续打卡 ${collectedData.habits.longestStreak} 天，保持得不错` });
    } else if (collectedData.habits.total > 0 && collectedData.habits.checkedToday === 0) {
      annotated.items.push({ category: 'habits', label: '需要关注', severity: 'medium', text: '今天还没有打卡，记得完成今日习惯' });
    }

    // 财务标注
    const weekBalance = collectedData.finance.weekIncome - collectedData.finance.weekExpense;
    if (weekBalance < 0 && Math.abs(weekBalance) > collectedData.finance.weekIncome * 0.3) {
      annotated.items.push({ category: 'finance', label: '需要关注', severity: 'medium', text: `本周支出大于入，净亏损 ¥${Math.abs(weekBalance).toFixed(0)}` });
    }
    const monthBalance = collectedData.finance.monthIncome - collectedData.finance.monthExpense;
    if (monthBalance < 0) {
      annotated.items.push({ category: 'finance', label: '异常', severity: 'high', text: `本月累计亏损 ¥${Math.abs(monthBalance).toFixed(0)}，需要控制支出` });
    }

    // 番茄钟标注
    if (collectedData.pomodoros.todayCount === 0 && new Date().getHours() >= 14) {
      annotated.items.push({ category: 'pomodoros', label: '需要关注', severity: 'medium', text: '今天还没有开始番茄钟，下午加油' });
    } else if (collectedData.pomodoros.todayCount >= 6) {
      annotated.items.push({ category: 'pomodoros', label: '完成得好', severity: 'low', text: `今日已完成 ${collectedData.pomodoros.todayCount} 个番茄钟，专注力很棒` });
    }

    // 目标标注
    if (collectedData.goals.stalled.length > 0) {
      annotated.items.push({ category: 'goals', label: '趋势下滑', severity: 'high', text: `目标停滞超过7天：${collectedData.goals.stalled.join('、')}` });
    }

    // 健康标注
    if (collectedData.health.exerciseThisWeek === 0 && new Date().getDay() >= 3) {
      annotated.items.push({ category: 'health', label: '需要关注', severity: 'medium', text: '本周还没有运动记录' });
    }
    if (collectedData.health.sleepAvg > 0 && collectedData.health.sleepAvg < 6) {
      annotated.items.push({ category: 'health', label: '异常', severity: 'high', text: `本周平均睡眠仅 ${collectedData.health.sleepAvg.toFixed(1)} 小时，严重不足` });
    } else if (collectedData.health.sleepAvg > 0 && collectedData.health.sleepAvg >= 7) {
      annotated.items.push({ category: 'health', label: '完成得好', severity: 'low', text: `本周平均睡眠 ${collectedData.health.sleepAvg.toFixed(1)} 小时，作息健康` });
    }

    // 日记标注
    if (collectedData.journal.thisWeekCount === 0 && new Date().getDay() >= 4) {
      annotated.items.push({ category: 'journal', label: '需要关注', severity: 'low', text: '本周还没有写日记，建议记录一下本周反思' });
    }

    // 尝试用 AI 增强标注
    try {
      const token = await getCozeToken();
      if (token) {
        const dataSummary = formatPipelineDataForAI(collectedData);
        const prompt = `你是妮可，人生工作台的系统管家。请对以下用户今日数据做简要标注分析。
对每个维度用一句话给出评价，标签从以下选择：「完成得好」「需要关注」「异常」「趋势下滑」。
只输出JSON数组格式，不要其他内容。每个元素包含 category, label, text 三个字段。
如果某维度数据正常无需关注，可以跳过。最多返回5条最重要的。

数据：
${dataSummary}`;

        const reply = await callCozeAPI(token, prompt);
        // 尝试解析 AI 返回的 JSON
        const jsonMatch = reply.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const aiItems = JSON.parse(jsonMatch[0]);
          if (Array.isArray(aiItems) && aiItems.length > 0) {
            // 用 AI 结果替换对应 category 的代码标注
            const aiCategories = new Set(aiItems.map(i => i.category));
            annotated.items = annotated.items.filter(i => !aiCategories.has(i.category));
            annotated.items = annotated.items.concat(aiItems);
            annotated.aiAvailable = true;
            console.log('[Pipeline][Stage2] AI 标注成功，替换了', aiCategories.size, '个分类');
          }
        }
      }
    } catch (e) {
      console.log('[Pipeline][Stage2] AI 标注不可用，使用代码规则降级:', e.message);
    }

    console.log('[Pipeline][Stage2] ✅ 标注完成，共', annotated.items.length, '条标注');
    return annotated;
  }

  /**
   * Stage 3: Cluster（关联聚类）
   * 代码层面做关联分析，不需要 LLM
   */
  function clusterInsights(annotatedData) {
    console.log('[Pipeline][Stage3] 开始关联聚类...');
    const items = annotatedData.items || [];
    const clusters = [];

    const getLabel = (cat) => {
      const item = items.find(i => i.category === cat);
      return item ? item.label : null;
    };
    const getSeverity = (cat) => {
      const item = items.find(i => i.category === cat);
      return item ? item.severity : null;
    };
    const getText = (cat) => {
      const item = items.find(i => i.category === cat);
      return item ? item.text : '';
    };

    // 关联规则1：健康下降 + 任务完成率下降 → "状态低迷"
    const healthBadSet = new Set(['异常', '趋势下滑']);
    const taskBadSet = new Set(['异常', '需要关注', '趋势下滑']);
    const healthBad = healthBadSet.has(getLabel('health'));
    const taskBad = taskBadSet.has(getLabel('tasks'));
    if (healthBad && taskBad) {
      clusters.push({
        id: 'state-low',
        theme: '状态低迷',
        emoji: '😔',
        severity: 'high',
        items: ['health', 'tasks'],
        summary: `身体和效率同时亮红灯。${getText('health')}；${getText('tasks')}。建议先调整作息和运动，状态恢复了效率自然会回来。`,
        action: 'prioritize-rest'
      });
    }

    // 关联规则2：支出增加 + 收入不变 → "财务压力"
    const financeBadSet = new Set(['异常', '需要关注']);
    const financeBad = financeBadSet.has(getLabel('finance'));
    if (financeBad) {
      clusters.push({
        id: 'finance-pressure',
        theme: '财务压力',
        emoji: '💸',
        severity: getSeverity('finance') || 'medium',
        items: ['finance'],
        summary: getText('finance') + '。建议回顾近期支出，找出可以优化的部分。',
        action: 'review-finance'
      });
    }

    // 关联规则3：习惯断签 + 目标停滞 → "动力不足"
    const habitBadSet = new Set(['异常', '需要关注']);
    const goalBadSet = new Set(['异常', '趋势下滑']);
    const habitBad = habitBadSet.has(getLabel('habits'));
    const goalBad = goalBadSet.has(getLabel('goals'));
    if (habitBad && goalBad) {
      clusters.push({
        id: 'motivation-low',
        theme: '动力不足',
        emoji: '🔋',
        severity: 'high',
        items: ['habits', 'goals'],
        summary: `习惯和目标同时掉链子。${getText('habits')}；${getText('goals')}。试试把目标拆成更小的步骤，先完成一个小目标找回节奏。`,
        action: 'rebuild-momentum'
      });
    }

    // 关联规则4：番茄钟不足 + 任务逾期 → "专注力不足"
    const pomoBadSet = new Set(['需要关注']);
    const pomoBad = pomoBadSet.has(getLabel('pomodoros'));
    if (pomoBad && taskBad) {
      clusters.push({
        id: 'focus-low',
        theme: '专注力不足',
        emoji: '🎯',
        severity: 'medium',
        items: ['pomodoros', 'tasks'],
        summary: `${getText('pomodoros')}；${getText('tasks')}。建议用番茄钟法拆分任务，每个番茄只专注25分钟。`,
        action: 'use-pomodoro'
      });
    }

    // 关联规则5：没有写日记 + 习惯断签 → "反思缺失"
    const journalBadSet = new Set(['需要关注']);
    const journalBad = journalBadSet.has(getLabel('journal'));
    if (journalBad && habitBad) {
      clusters.push({
        id: 'reflection-missing',
        theme: '反思缺失',
        emoji: '📝',
        severity: 'low',
        items: ['journal', 'habits'],
        summary: '习惯打卡和日记都断了。定期反思能帮助发现问题，今晚花5分钟写写本周感受吧。',
        action: 'write-journal'
      });
    }

    // 没有关联到任何问题的单项标注，也单独作为洞察
    const clusteredCategories = new Set();
    clusters.forEach(c => c.items.forEach(i => clusteredCategories.add(i)));
    items.forEach(item => {
      if (!clusteredCategories.has(item.category) && (item.severity === 'high' || item.severity === 'medium')) {
        clusters.push({
          id: `single-${item.category}`,
          theme: item.category === 'tasks' ? '任务提醒' :
                 item.category === 'habits' ? '习惯提醒' :
                 item.category === 'health' ? '健康提醒' :
                 item.category === 'finance' ? '财务提醒' :
                 item.category === 'goals' ? '目标提醒' :
                 item.category === 'pomodoros' ? '专注提醒' : '提醒',
          emoji: item.severity === 'high' ? '⚠️' : '💡',
          severity: item.severity,
          items: [item.category],
          summary: item.text,
          action: null
        });
      }
    });

    // 如果一切正常
    if (clusters.length === 0) {
      clusters.push({
        id: 'all-good',
        theme: '一切顺利',
        emoji: '✨',
        severity: 'low',
        items: [],
        summary: '今天各维度数据都很健康，继续保持这个节奏！',
        action: null
      });
    }

    console.log('[Pipeline][Stage3] ✅ 聚类完成，共', clusters.length, '个洞察');
    return clusters;
  }

  /**
   * Stage 4: Refine（精炼总结）
   * 将关联洞察发给 AI 生成有温度的每日洞察，失败则代码降级
   */
  async function refineInsights(clusters) {
    console.log('[Pipeline][Stage4] 开始精炼总结...');

    let refined = '';

    // 尝试 AI 精炼
    try {
      const token = await getCozeToken();
      if (token) {
        const clusterText = clusters.map(c =>
          `${c.emoji} ${c.theme}（${c.severity}）：${c.summary}`
        ).join('\n');

        const prompt = `你是妮可，一个严谨但关心用户的系统管家。请根据以下洞察，写一段200字以内的每日洞察总结。
语气：温暖、真诚、有建设性。不要说空话套话，要有具体的观察和建议。
开头用一句话概括今天的状态，然后挑2-3个最重要的点展开。
结尾给一句鼓励或具体行动建议。

洞察数据：
${clusterText}`;

        const reply = await callCozeAPI(token, prompt);
        if (reply && reply.length > 10 && reply.length < 600) {
          refined = reply;
          console.log('[Pipeline][Stage4] AI 精炼成功');
        }
      }
    } catch (e) {
      console.log('[Pipeline][Stage4] AI 精炼不可用，使用代码降级:', e.message);
    }

    // 代码降级方案
    if (!refined) {
      const highItems = clusters.filter(c => c.severity === 'high');
      const medItems = clusters.filter(c => c.severity === 'medium');
      const lowItems = clusters.filter(c => c.severity === 'low');

      const parts = [];
      const hour = new Date().getHours();
      const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

      if (highItems.length > 0) {
        parts.push(`${greeting}，今天有几个需要你关注的地方：`);
        highItems.forEach(c => parts.push(`${c.emoji} ${c.summary}`));
      } else if (medItems.length > 0) {
        parts.push(`${greeting}，整体还不错，有几个小地方可以优化：`);
        medItems.slice(0, 3).forEach(c => parts.push(`${c.emoji} ${c.summary}`));
      } else {
        parts.push(`${greeting}！今天各项数据都很健康，继续保持。`);
      }

      if (lowItems.length > 0 && highItems.length === 0) {
        parts.push(lowItems[0].summary);
      }

      parts.push('💪 一步一步来，不急。');
      refined = parts.join('\n');
    }

    console.log('[Pipeline][Stage4] ✅ 精炼完成');
    return {
      summary: refined,
      clusters: clusters,
      generatedAt: new Date().toISOString(),
      aiUsed: !!refined && refined.length > 50
    };
  }

  /**
   * Stage 5: Spawn（触发动作）
   * 根据洞察结果写入通知、更新 dashboard
   */
  function spawnActions(refinedInsights) {
    console.log('[Pipeline][Stage5] 开始触发动作...');

    const clusters = refinedInsights.clusters || [];
    const today = getTodayStr();

    // 1. 写入通知（如果有重要提醒）
    const highClusters = clusters.filter(c => c.severity === 'high');
    if (highClusters.length > 0 && typeof NotificationEngine !== 'undefined') {
      highClusters.forEach(c => {
        try {
          NotificationEngine.addNotification({
            type: 'nicole-insight',
            title: `妮可洞察 · ${c.theme}`,
            message: c.summary,
            icon: c.emoji,
            link: ''
          });
        } catch (e) {
          console.warn('[Pipeline][Stage5] 写入通知失败:', e);
        }
      });
      console.log('[Pipeline][Stage5] 写入', highClusters.length, '条通知');
    }

    // 2. 更新 DOM 中的"今日洞察"区域
    updateInsightDOM(refinedInsights);

    // 3. 缓存到 localStorage
    try {
      const cacheKey = `nicole_daily_insight_${today}`;
      localStorage.setItem(cacheKey, JSON.stringify(refinedInsights));
      console.log('[Pipeline][Stage5] 已缓存到 localStorage:', cacheKey);
    } catch (e) {
      console.warn('[Pipeline][Stage5] 缓存失败:', e);
    }

    console.log('[Pipeline][Stage5] ✅ 动作触发完成');
  }

  /**
   * 更新 DOM 中的今日洞察区域
   */
  function updateInsightDOM(refinedInsights) {
    // 更新妮可面板中的洞察区域
    const insightEl = document.getElementById('nicole-insight-card');
    if (insightEl) {
      const clusters = refinedInsights.clusters || [];
      const highItems = clusters.filter(c => c.severity === 'high');
      const hasAlert = highItems.length > 0;

      insightEl.className = `nicole-insight-card ${hasAlert ? 'nicole-insight-alert' : 'nicole-insight-good'}`;
      insightEl.innerHTML = `
        <div class="nicole-insight-header">
          <span class="nicole-insight-icon">${hasAlert ? '🔍' : '✨'}</span>
          <span class="nicole-insight-title">今日洞察</span>
          <span class="nicole-insight-time">${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="nicole-insight-body">${escapeHtml(refinedInsights.summary).replace(/\n/g, '<br>')}</div>
        <div class="nicole-insight-tags">
          ${clusters.slice(0, 4).map(c => `<span class="nicole-insight-tag nicole-tag-${c.severity}">${c.emoji} ${c.theme}</span>`).join('')}
        </div>
      `;
      insightEl.style.display = 'block';
    }

    // 更新 dashboard 中的洞察区域（如果存在）
    const dashboardInsight = document.getElementById('dashboard-nicole-insight');
    if (dashboardInsight) {
      const clusters = refinedInsights.clusters || [];
      dashboardInsight.style.display = 'block';
      dashboardInsight.innerHTML = `
        <div class="nicole-insight-header">
          <span class="nicole-insight-icon">🔵</span>
          <span class="nicole-insight-title">妮可洞察</span>
          <span class="nicole-insight-time">${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="nicole-insight-body">${escapeHtml(refinedInsights.summary).replace(/\n/g, '<br>')}</div>
        <div class="nicole-insight-tags">
          ${clusters.slice(0, 4).map(c => `<span class="nicole-insight-tag nicole-tag-${c.severity}">${c.emoji} ${c.theme}</span>`).join('')}
        </div>
      `;
    }
  }

  /**
   * 格式化流水线数据给 AI 阅读
   */
  function formatPipelineDataForAI(data) {
    const lines = [];
    lines.push(`日期：${data.date}`);
    lines.push(`任务：总计${data.tasks.total}个，已完成${data.tasks.done}个，逾期${data.tasks.overdue}个`);
    if (data.tasks.overdueList.length > 0) {
      lines.push(`  逾期任务：${data.tasks.overdueList.map(t => t.title).join('、')}`);
    }
    lines.push(`习惯：${data.habits.total}个，今日打卡${data.habits.checkedToday}个，最长连续${data.habits.longestStreak}天`);
    if (data.habits.brokenStreaks.length > 0) {
      lines.push(`  断签习惯：${data.habits.brokenStreaks.join('、')}`);
    }
    lines.push(`财务（本周）：收入¥${data.finance.weekIncome.toFixed(0)}，支出¥${data.finance.weekExpense.toFixed(0)}`);
    lines.push(`财务（本月）：收入¥${data.finance.monthIncome.toFixed(0)}，支出¥${data.finance.monthExpense.toFixed(0)}`);
    lines.push(`番茄钟：今日${data.pomodoros.todayCount}个（${data.pomodoros.todayMinutes}分钟），本周${data.pomodoros.weekCount}个`);
    lines.push(`健康：本周运动${data.health.exerciseThisWeek}次，平均睡眠${data.health.sleepAvg.toFixed(1)}小时`);
    lines.push(`目标：${data.goals.active}个进行中，${data.goals.stalled.length}个停滞`);
    if (data.goals.stalled.length > 0) {
      lines.push(`  停滞目标：${data.goals.stalled.join('、')}`);
    }
    lines.push(`日记：本周${data.journal.thisWeekCount}篇`);
    return lines.join('\n');
  }

  // ===== 流水线入口 =====

  /**
   * 运行每日流水线（五阶段）
   */
  async function runDailyPipeline() {
    const today = getTodayStr();
    const cacheKey = `nicole_daily_insight_${today}`;

    // 检查缓存：同一天不重复运行
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log('[Pipeline] 发现今日缓存，跳过重复执行');
        // 即使有缓存，也要更新 DOM
        updateInsightDOM(parsed);
        return parsed;
      }
    } catch (e) {
      // 缓存损坏，继续执行
    }

    // 防止并发执行
    if (_pipelineRunning) {
      console.log('[Pipeline] 流水线正在执行中，跳过');
      return null;
    }
    _pipelineRunning = true;

    try {
      console.log('[Pipeline] 🚀 每日流水线开始执行...');
      const startTime = Date.now();

      // Stage 1: Collect
      const collectedData = await collectData();

      // Stage 2: Annotate
      const annotatedData = await annotateData(collectedData);

      // Stage 3: Cluster（纯代码，同步）
      const clusters = clusterInsights(annotatedData);

      // Stage 4: Refine
      const refinedInsights = await refineInsights(clusters);

      // Stage 5: Spawn
      spawnActions(refinedInsights);

      const elapsed = Date.now() - startTime;
      console.log(`[Pipeline] ✅ 每日流水线执行完成，耗时 ${elapsed}ms`);

      return refinedInsights;
    } catch (e) {
      console.error('[Pipeline] ❌ 流水线执行失败:', e);
      return null;
    } finally {
      _pipelineRunning = false;
    }
  }

  /**
   * 从缓存加载今日洞察并渲染
   */
  function loadCachedInsight() {
    const today = getTodayStr();
    const cacheKey = `nicole_daily_insight_${today}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        updateInsightDOM(parsed);
        console.log('[Nicole] 从缓存加载今日洞察');
        return true;
      }
    } catch (e) {
      console.warn('[Nicole] 加载缓存失败:', e);
    }
    return false;
  }

  // ===== 原有数据摘要收集（保留给快捷功能使用） =====

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

    try {
      const tasks = await Storage.getAll('tasks');
      summary.taskStatus = {
        todo: tasks.filter(t => t.status === 'todo').length,
        done: tasks.filter(t => t.status === 'done').length
      };

      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const checkins = await Storage.getAll('checkins');
      summary.monthCheckins = checkins.filter(c => c.month === monthStr).length;

      const finances = await Storage.getAll('finance');
      const monthFinances = finances.filter(f => f.month === monthStr);
      summary.monthFinance = {
        income: monthFinances.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0),
        expense: monthFinances.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0)
      };

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

  function buildPanel() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'nicole-overlay';
    overlayEl.addEventListener('click', close);

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
          <button class="nicole-header-btn" id="nicole-refresh-insight" title="刷新今日洞察">🔄</button>
          <button class="nicole-header-btn" id="nicole-new-chat" title="新对话">💬</button>
          <button class="nicole-header-btn" id="nicole-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="nicole-insight-card" id="nicole-insight-card" style="display:none;"></div>
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

    messagesEl = panelEl.querySelector('#nicole-messages');
    inputEl = panelEl.querySelector('#nicole-input');
    sendBtn = panelEl.querySelector('#nicole-send');
    shortcutsEl = panelEl.querySelector('#nicole-shortcuts');

    document.body.appendChild(overlayEl);
    document.body.appendChild(panelEl);

    bindEvents();
    showWelcome();
  }

  function bindEvents() {
    panelEl.querySelector('#nicole-close').addEventListener('click', close);

    panelEl.querySelector('#nicole-new-chat').addEventListener('click', () => {
      _conversationId = null;
      messagesEl.innerHTML = '';
      showWelcome();
      if (typeof App !== 'undefined') App.showToast('已开始新对话');
    });

    // 刷新洞察按钮
    panelEl.querySelector('#nicole-refresh-insight').addEventListener('click', () => {
      const today = getTodayStr();
      localStorage.removeItem(`nicole_daily_insight_${today}`);
      runDailyPipeline();
      if (typeof App !== 'undefined') App.showToast('正在刷新今日洞察...');
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

    inputEl.value = '';
    inputEl.style.height = 'auto';

    addUserMessage(text);

    let token = await getCozeToken();
    if (!token) {
      token = await showTokenDialog();
      if (!token) {
        addErrorMessage('未配置 Token，无法与妮可对话');
        return;
      }
      await saveCozeToken(token);
    }

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
        addErrorMessage(errMsg);
        _conversationId = null;
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

    inputEl.value = prompt;
    handleSend();
  }

  // ===== 面板控制 =====

  function open() {
    if (_isOpen) return;

    if (typeof XiaoluModule !== 'undefined' && XiaoluModule.close) {
      XiaoluModule.close();
    }

    if (!panelEl) {
      buildPanel();
    }

    _isOpen = true;
    overlayEl.classList.add('show');
    panelEl.classList.add('show');

    // 打开面板时尝试加载/运行洞察
    if (!loadCachedInsight()) {
      runDailyPipeline();
    }

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

    // 页面加载时自动运行流水线（延迟执行，等 Storage 就绪）
    setTimeout(() => {
      console.log('[Nicole] 页面加载，自动触发每日流水线...');
      runDailyPipeline();
    }, 2000);

    // 监听路由切换，切换到 dashboard 时触发
    if (typeof Router !== 'undefined' && Router.onRouteChange) {
      Router.onRouteChange((newRoute) => {
        if (newRoute === 'dashboard') {
          console.log('[Nicole] 切换到今日总览，触发流水线...');
          if (!loadCachedInsight()) {
            runDailyPipeline();
          }
        }
      });
    }

    console.log('[Nicole] 妮可系统管家就绪 🔵 （已升级为主动军师模式）');
  }

  return {
    init,
    open,
    close,
    runDailyPipeline,
    loadCachedInsight,
    destroy
  };
})();
