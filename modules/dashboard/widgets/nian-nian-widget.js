/**
 * nian-nian-widget.js - 碎碎念组件
 * 人生工作台 · AI 归类速记
 * 从 Dashboard 拆分而出 (v125)
 */
import { AppUtils } from '../../../core/utils.js';
import { Storage } from '../../../core/storage.js';
import { EventBus } from '../../../core/event-bus.js';

const NianNianWidget = (() => {
  const { escapeHtml, getTodayStr } = AppUtils;
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== v94: 碎碎念 =====
  const NN_MOOD_SCORE = { '😢': -2, '😤': -1, '😐': 0, '😴': 1, '😊': 2 };
  const NN_MODULE_LABELS = {
    diary: '日记', mood: '情绪', finance: '财务', tasks: '任务',
    habits: '习惯', time_log: '时间追踪', study: '学习', relations: '关系'
  };
  const NN_MODULE_ICONS = {
    diary: '📖', mood: '😔', finance: '💰', tasks: '✅',
    habits: '🔄', time_log: '⏱', study: '📚', relations: '👥'
  };

  let _nnSelectedMood = null;     // 用户选中的情绪emoji
  let _nnAnalysisResult = null;   // AI分析结果
  let _nnDeletedModules = new Set(); // 用户标记删除的模块

  /**
   * 碎碎念：获取DeepSeek token
   */
  async function _nnGetToken() {
    let token = null;
    try {
      if (window.SecureStorage?.loadSecure) {
        token = await window.SecureStorage?.loadSecure('deepseek_token');
      }
      if (!token) {
        const setting = await Storage.get('settings', 'deepseek_token');
        if (setting?.value) token = setting.value;
      }
    } catch (e) { /* 无 token */ }
    return token;
  }

  /**
   * 碎碎念：调用DeepSeek AI分析
   */
  async function _nnCallAI(text, mood) {
    const token = await _nnGetToken();
    if (!token) {
      throw new Error('未配置DeepSeek API Key');
    }

    const moodInfo = mood ? `用户当前情绪：${mood}` : '';
    const prompt = `你是人生工作台的AI助手。分析用户的碎碎念内容，提取可以归类到各模块的信息。

## 用户输入
${text}
${moodInfo}

## 提取规则
1. 只提取明确提到的信息，不编造、不推断
2. 每个字段只有在明确提及或可从上下文直接推导时才标记 has_xxx=true
3. 如果内容没有明确提到某个模块的信息，对应 has_xxx=false
4. 金额必须从文本中提取数字
5. 任务优先级根据紧迫性推断

## 返回格式（严格JSON）
{
  "diary": { "content": "完整日记内容", "has_diary": true/false },
  "mood": { "emoji": "情绪emoji", "score": -2~2, "note": "情绪备注", "has_mood": true/false },
  "finance": { "type": "expense/income", "amount": 0, "category": "分类", "note": "备注", "has_finance": true/false },
  "tasks": [{ "title": "任务标题", "priority": "high/medium/low" }],
  "habits": [{ "name": "习惯名" }],
  "time_log": [{ "category": "分类", "duration_minutes": 0, "note": "备注" }],
  "study": [{ "subject": "学科", "content": "内容", "duration_minutes": 0 }],
  "relations": [{ "person": "人物", "note": "互动备注" }]
}

只输出JSON，不要其他文字。`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 800
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`AI请求失败: ${resp.status}`);
      }

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error('AI返回为空');

      // 尝试提取JSON
      let jsonStr = reply.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      const result = JSON.parse(jsonStr);
      return result;
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') {
        throw new Error('AI分析超时(8秒)');
      }
      throw e;
    }
  }

  /**
   * 碎碎念：渲染预览
   */
  function _nnRenderPreview(analysis) {
    const previewEl = document.getElementById('dash-nn-preview');
    if (!previewEl) return;

    const modules = ['diary', 'mood', 'finance', 'tasks', 'habits', 'time_log', 'study', 'relations'];
    let html = '<div class="dash-nn-preview-title">AI 识别结果</div>';
    let hasAnyData = false;

    for (const mod of modules) {
      if (_nnDeletedModules.has(mod)) continue;

      const modData = analysis[mod];
      if (!modData) continue;

      // 判断该模块是否有数据
      let hasData = false;
      let displayText = '';

      if (mod === 'diary' && modData.has_diary) {
        hasData = true;
        displayText = modData.content || '';
      } else if (mod === 'mood' && modData.has_mood) {
        // 如果用户选了emoji，覆盖AI判断
        const emoji = _nnSelectedMood || modData.emoji;
        const score = _nnSelectedMood ? NN_MOOD_SCORE[_nnSelectedMood] : modData.score;
        analysis.mood.emoji = emoji;
        analysis.mood.score = score;
        hasData = true;
        displayText = `${emoji} ${modData.note || ''}`.trim();
      } else if (mod === 'finance' && modData.has_finance) {
        hasData = true;
        const typeLabel = modData.type === 'income' ? '收入' : '支出';
        displayText = `${typeLabel} ¥${modData.amount || 0} · ${modData.category || ''}${modData.note ? ' · ' + modData.note : ''}`;
      } else if (Array.isArray(modData) && modData.length > 0) {
        hasData = true;
        displayText = modData.map(item => {
          if (mod === 'tasks') return `${item.title} [${item.priority}]`;
          if (mod === 'habits') return item.name;
          if (mod === 'time_log') return `${item.category} ${item.duration_minutes}min${item.note ? ' · ' + item.note : ''}`;
          if (mod === 'study') return `${item.subject}${item.content ? ' · ' + item.content : ''}${item.duration_minutes ? ' · ' + item.duration_minutes + 'min' : ''}`;
          if (mod === 'relations') return `${item.person}${item.note ? ' · ' + item.note : ''}`;
          return JSON.stringify(item);
        }).join('\n');
      }

      if (!hasData) continue;
      hasAnyData = true;

      html += `<div class="dash-nn-preview-item" data-module="${mod}">
        <span class="dash-nn-preview-item-icon">${NN_MODULE_ICONS[mod]}</span>
        <div class="dash-nn-preview-item-content">
          <div class="dash-nn-preview-item-label">${NN_MODULE_LABELS[mod]}</div>
          <div class="dash-nn-preview-item-text">${escapeHtml(displayText)}</div>
        </div>
        <button class="dash-nn-preview-item-del" data-del-module="${mod}" title="移除此项">✕</button>
      </div>`;
    }

    if (!hasAnyData) {
      html += '<div class="dash-nn-preview-item" style="border-left-color:var(--text-muted);"><span class="dash-nn-preview-item-icon">📝</span><div class="dash-nn-preview-item-content"><div class="dash-nn-preview-item-text">未检测到特定模块数据，将记录为日记 📝</div></div></div>';
    }

    previewEl.innerHTML = html;
    previewEl.classList.remove('hidden');

    // 绑定删除按钮
    previewEl.querySelectorAll('.dash-nn-preview-item-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mod = btn.dataset.delModule;
        _nnDeletedModules.add(mod);
        const item = btn.closest('.dash-nn-preview-item');
        if (item) item.classList.add('deleted');
      });
    });
  }

  /**
   * 碎碎念：确认写入各模块
   */
  async function _nnConfirmWrite(analysis) {
    const today = getTodayStr();
    const results = [];

    // 日记
    if (!_nnDeletedModules.has('diary') && analysis.diary?.has_diary) {
      try {
        const moodEmoji = analysis.mood?.emoji || _nnSelectedMood || '';
        const moodScore = analysis.mood?.score ?? (_nnSelectedMood ? NN_MOOD_SCORE[_nnSelectedMood] : 0);
        const moodNote = analysis.mood?.note || '';
        await Storage.add('journal', {
          type: 'diary', subtype: '', content: analysis.diary.content,
          mood: moodEmoji, mood_score: moodScore, mood_note: moodNote,
          date: today, createdAt: Date.now(), updatedAt: Date.now(), source: 'niannian'
        });
        EventBus.emit('journal:created', { entry: { content: analysis.diary.content, date: today } });
        results.push({ module: 'diary', success: true });
      } catch (e) {
        console.error('[NianNian] 日记写入失败:', e);
        results.push({ module: 'diary', success: false });
      }
    } else {
      results.push({ module: 'diary', success: null });
    }

    // 情绪
    if (!_nnDeletedModules.has('mood') && analysis.mood?.has_mood) {
      try {
        const emoji = analysis.mood.emoji || _nnSelectedMood || '😐';
        const note = analysis.mood.note || '';
        const moodData = (await Storage.get('settings', 'health/mood'))?.value || { records: {}, streak: 0 };
        moodData.records[today] = { mood: emoji, note, time: new Date().toISOString() };
        // 计算streak
        let streak = 0;
        const d = new Date();
        for (let i = 0; i < 365; i++) {
          const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (moodData.records[ds]) { streak++; d.setDate(d.getDate() - 1); } else break;
        }
        moodData.streak = streak;
        await Storage.put('settings', { key: 'health/mood', value: moodData });
        results.push({ module: 'mood', success: true });
      } catch (e) {
        console.error('[NianNian] 情绪写入失败:', e);
        results.push({ module: 'mood', success: false });
      }
    } else {
      results.push({ module: 'mood', success: null });
    }

    // 财务
    if (!_nnDeletedModules.has('finance') && analysis.finance?.has_finance) {
      try {
        const record = {
          type: analysis.finance.type || 'expense',
          amount: analysis.finance.amount || 0,
          category: analysis.finance.category || '其他',
          note: analysis.finance.note || '',
          month: today.substring(0, 7),
          date: today,
          createdAt: Date.now(),
          source: 'niannian'
        };
        await Storage.add('finance', record);
        EventBus.emit('finance:added', { record });
        results.push({ module: 'finance', success: true });
      } catch (e) {
        console.error('[NianNian] 财务写入失败:', e);
        results.push({ module: 'finance', success: false });
      }
    } else {
      results.push({ module: 'finance', success: null });
    }

    // 任务
    if (!_nnDeletedModules.has('tasks') && Array.isArray(analysis.tasks) && analysis.tasks.length > 0) {
      try {
        for (const t of analysis.tasks) {
          const task = {
            title: t.title, priority: t.priority || 'medium', status: 'pending',
            createdAt: Date.now(), source: 'niannian'
          };
          await Storage.add('tasks', task);
          EventBus.emit('task:created', { task });
        }
        results.push({ module: 'tasks', success: true });
      } catch (e) {
        console.error('[NianNian] 任务写入失败:', e);
        results.push({ module: 'tasks', success: false });
      }
    } else {
      results.push({ module: 'tasks', success: null });
    }

    // 习惯
    if (!_nnDeletedModules.has('habits') && Array.isArray(analysis.habits) && analysis.habits.length > 0) {
      try {
        let habitOk = false;
        const allHabits = await Storage.getAll('habits');
        for (const h of analysis.habits) {
          const matched = allHabits.find(x => x.name.includes(h.name) || h.name.includes(x.name));
          if (matched) {
            let record = await Storage.get('checkins', today);
            if (!record) record = { date: today, month: today.substring(0, 7), habits: [] };
            if (!record.habits.includes(matched.id)) {
              record.habits.push(matched.id);
              await Storage.put('checkins', record);
              EventBus.emit('habit:completed', { habitId: matched.id, date: today });
            }
            habitOk = true;
          }
        }
        results.push({ module: 'habits', success: habitOk });
      } catch (e) {
        console.error('[NianNian] 习惯写入失败:', e);
        results.push({ module: 'habits', success: false });
      }
    } else {
      results.push({ module: 'habits', success: null });
    }

    // 时间追踪
    if (!_nnDeletedModules.has('time_log') && Array.isArray(analysis.time_log) && analysis.time_log.length > 0) {
      try {
        for (const tl of analysis.time_log) {
          await Storage.add('time_entries', {
            category: tl.category || '其他',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: tl.duration_minutes || 0,
            note: tl.note || '',
            date: today,
            source: 'niannian'
          });
        }
        results.push({ module: 'time_log', success: true });
      } catch (e) {
        console.error('[NianNian] 时间追踪写入失败:', e);
        results.push({ module: 'time_log', success: false });
      }
    } else {
      results.push({ module: 'time_log', success: null });
    }

    // 学习
    if (!_nnDeletedModules.has('study') && Array.isArray(analysis.study) && analysis.study.length > 0) {
      try {
        for (const s of analysis.study) {
          const data = {
            type: 'session', subject: s.subject || '', content: s.content || '',
            duration_minutes: s.duration_minutes || 0,
            date: today, createdAt: Date.now(), source: 'niannian'
          };
          await Storage.add('study', data);
          EventBus.emit('study:session', { data });
        }
        results.push({ module: 'study', success: true });
      } catch (e) {
        console.error('[NianNian] 学习写入失败:', e);
        results.push({ module: 'study', success: false });
      }
    } else {
      results.push({ module: 'study', success: null });
    }

    // 关系
    if (!_nnDeletedModules.has('relations') && Array.isArray(analysis.relations) && analysis.relations.length > 0) {
      try {
        let relOk = false;
        const contacts = await Storage.getAll('contacts');
        for (const r of analysis.relations) {
          const contact = contacts.find(c => c.name.includes(r.person) || r.person.includes(c.name));
          if (contact) {
            if (!contact.interactions) contact.interactions = [];
            contact.interactions.push({ date: today, note: r.note || '' });
            contact.lastContactDate = today;
            contact.updatedAt = Date.now();
            await Storage.put('contacts', contact);
            EventBus.emit('relation:updated', { contact });
            relOk = true;
          }
        }
        results.push({ module: 'relations', success: relOk });
      } catch (e) {
        console.error('[NianNian] 关系写入失败:', e);
        results.push({ module: 'relations', success: false });
      }
    } else {
      results.push({ module: 'relations', success: null });
    }

    return results;
  }

  /**
   * 碎碎念：显示写入结果
   */
  function _nnShowWriteResults(results) {
    const confirmRow = document.getElementById('dash-nn-confirm-row');
    if (confirmRow) confirmRow.classList.add('hidden');

    const previewEl = document.getElementById('dash-nn-preview');
    let html = '<div class="dash-nn-result">';
    for (const r of results) {
      const icon = NN_MODULE_ICONS[r.module];
      const label = NN_MODULE_LABELS[r.module];
      if (r.success === true) {
        html += `<div class="dash-nn-result-item success">${icon} ✅ ${label}：已记录</div>`;
      } else if (r.success === false) {
        html += `<div class="dash-nn-result-item fail">${icon} ❌ ${label}：写入失败</div>`;
      } else {
        html += `<div class="dash-nn-result-item skip">${icon} — ${label}：未触发</div>`;
      }
    }
    html += '</div>';
    if (previewEl) previewEl.innerHTML = html;
  }

  /**
   * 碎碎念：保存历史
   */
  async function _nnSaveHistory(text, analysis) {
    try {
      const histData = (await Storage.get('settings', 'niannian_history'))?.value || [];
      const modules = ['diary', 'mood', 'finance', 'tasks', 'habits', 'time_log', 'study', 'relations'];
      const triggeredModules = modules.filter(m => {
        if (_nnDeletedModules.has(m)) return false;
        const d = analysis[m];
        if (!d) return false;
        if (d.has_diary || d.has_mood || d.has_finance) return true;
        if (Array.isArray(d) && d.length > 0) return true;
        return false;
      });

      histData.unshift({
        text,
        analysis: triggeredModules,
        timestamp: Date.now(),
        date: getTodayStr(),
        writeCount: triggeredModules.length
      });

      // 最多50条
      if (histData.length > 50) histData.length = 50;

      await Storage.put('settings', { key: 'niannian_history', value: histData });
    } catch (e) {
      console.warn('[NianNian] 保存历史失败:', e);
    }
  }

  /**
   * 碎碎念：渲染历史记录
   */
  async function _nnRenderHistory() {
    const histEl = document.getElementById('dash-nn-history');
    if (!histEl) return;

    try {
      const histData = (await Storage.get('settings', 'niannian_history'))?.value || [];

      if (histData.length === 0) {
        histEl.innerHTML = '<div class="dash-nn-history-empty">暂无碎碎念记录</div>';
        return;
      }

      let html = '<div class="dash-nn-history-title">历史记录</div>';
      for (const item of histData.slice(0, 20)) {
        const time = new Date(item.timestamp);
        const timeStr = `${time.getMonth()+1}/${time.getDate()} ${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
        const tags = (item.analysis || []).map(m => `<span class="dash-nn-history-item-tag">${NN_MODULE_ICONS[m] || ''} ${NN_MODULE_LABELS[m] || m}</span>`).join('');
        html += `<div class="dash-nn-history-item">
          <div class="dash-nn-history-item-time">${timeStr}</div>
          <div class="dash-nn-history-item-text">${escapeHtml(item.text || '')}</div>
          ${tags ? '<div class="dash-nn-history-item-tags">' + tags + '</div>' : ''}
        </div>`;
      }

      histEl.innerHTML = html;
    } catch (e) {
      console.warn('[NianNian] 渲染历史失败:', e);
    }
  }

  /**
   * 碎碎念：重置状态
   */
  function _nnReset() {
    _nnSelectedMood = null;
    _nnAnalysisResult = null;
    _nnDeletedModules.clear();
    const textarea = document.getElementById('dash-nn-textarea');
    if (textarea) textarea.value = '';
    const previewEl = document.getElementById('dash-nn-preview');
    if (previewEl) { previewEl.innerHTML = ''; previewEl.classList.add('hidden'); }
    const confirmRow = document.getElementById('dash-nn-confirm-row');
    if (confirmRow) confirmRow.classList.add('hidden');
    const loadingEl = document.getElementById('dash-nn-loading');
    if (loadingEl) loadingEl.classList.add('hidden');
    const submitBtn = document.getElementById('dash-nn-submit');
    if (submitBtn) submitBtn.disabled = false;
    // 清除情绪选中
    document.querySelectorAll('.dash-nn-mood-btn').forEach(b => b.classList.remove('active'));
  }

  /**
   * 碎碎念：收起
   */
  function _nnCollapse() {
    const collapsed = document.getElementById('dash-nn-collapsed');
    const expanded = document.getElementById('dash-nn-expanded');
    if (collapsed) collapsed.classList.remove('hidden');
    if (expanded) expanded.classList.add('hidden');
    _nnReset();
  }

  /**
   * 碎碎念：展开
   */
  function _nnExpand() {
    const collapsed = document.getElementById('dash-nn-collapsed');
    const expanded = document.getElementById('dash-nn-expanded');
    if (collapsed) collapsed.classList.add('hidden');
    if (expanded) expanded.classList.remove('hidden');
  }

  /**
   * 碎碎念：绑定事件
   */
  function _nnBindEvents() {
    // 收起区域点击 → 展开
    const collapsed = document.getElementById('dash-nn-collapsed');
    if (collapsed) {
      _bindEvent(collapsed, 'click', (e) => {
        // 排除历史按钮点击
        if (e.target.id === 'dash-nn-history-toggle' || e.target.closest('#dash-nn-history-toggle')) return;
        _nnExpand();
      });
    }

    // 关闭按钮 → 收起
    const closeBtn = document.getElementById('dash-nn-close');
    if (closeBtn) {
      _bindEvent(closeBtn, 'click', () => _nnCollapse());
    }

    // 情绪emoji点击
    document.querySelectorAll('.dash-nn-mood-btn').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        const mood = btn.dataset.mood;
        if (_nnSelectedMood === mood) {
          _nnSelectedMood = null;
          btn.classList.remove('active');
        } else {
          _nnSelectedMood = mood;
          document.querySelectorAll('.dash-nn-mood-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // "写好了"按钮
    const submitBtn = document.getElementById('dash-nn-submit');
    if (submitBtn) {
      _bindEvent(submitBtn, 'click', async () => {
        const textarea = document.getElementById('dash-nn-textarea');
        const text = textarea?.value?.trim();
        if (!text) {
          if (window.App) window.App?.showToast('先说点什么吧 ✨');
          return;
        }

        // 显示loading
        const loadingEl = document.getElementById('dash-nn-loading');
        const confirmRow = document.getElementById('dash-nn-confirm-row');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (confirmRow) confirmRow.classList.add('hidden');
        submitBtn.disabled = true;

        try {
          const analysis = await _nnCallAI(text, _nnSelectedMood);
          _nnAnalysisResult = analysis;
          _nnRenderPreview(analysis);
          if (confirmRow) confirmRow.classList.remove('hidden');
        } catch (e) {
          console.error('[NianNian] AI分析失败:', e);
          const previewEl = document.getElementById('dash-nn-preview');
          if (previewEl) {
            previewEl.innerHTML = `<div class="dash-nn-preview-item" style="border-left-color:#E74C3C;"><span class="dash-nn-preview-item-icon">⚠️</span><div class="dash-nn-preview-item-content"><div class="dash-nn-preview-item-text">分析失败：${escapeHtml(e.message)}</div></div></div>`;
            previewEl.classList.remove('hidden');
          }
        } finally {
          if (loadingEl) loadingEl.classList.add('hidden');
          submitBtn.disabled = false;
        }
      });
    }

    // 确认写入
    const confirmBtn = document.getElementById('dash-nn-confirm');
    if (confirmBtn) {
      _bindEvent(confirmBtn, 'click', async () => {
        if (!_nnAnalysisResult) return;
        confirmBtn.disabled = true;
        const cancelBtn = document.getElementById('dash-nn-cancel');
        if (cancelBtn) cancelBtn.disabled = true;

        try {
          const results = await _nnConfirmWrite(_nnAnalysisResult);
          _nnShowWriteResults(results);

          // 保存历史
          const textarea = document.getElementById('dash-nn-textarea');
          const text = textarea?.value?.trim() || '';
          await _nnSaveHistory(text, _nnAnalysisResult);

          // 刷新历史面板
          await _nnRenderHistory();

          // 2秒后收起
          setTimeout(() => _nnCollapse(), 2500);
        } catch (e) {
          console.error('[NianNian] 写入失败:', e);
          confirmBtn.disabled = false;
          if (cancelBtn) cancelBtn.disabled = false;
        }
      });
    }

    // 放弃按钮
    const cancelBtn = document.getElementById('dash-nn-cancel');
    if (cancelBtn) {
      _bindEvent(cancelBtn, 'click', () => _nnCollapse());
    }

    // 历史按钮
    const historyBtn = document.getElementById('dash-nn-history-toggle');
    if (historyBtn) {
      _bindEvent(historyBtn, 'click', (e) => {
        e.stopPropagation();
        const histEl = document.getElementById('dash-nn-history');
        if (histEl) {
          histEl.classList.toggle('hidden');
          if (!histEl.classList.contains('hidden')) {
            _nnRenderHistory();
          }
        }
      });
    }
  }

  /**
   * 碎碎念：初始化渲染
   */
  async function renderNianNian() {
    _nnBindEvents();
  }


  async function init() {
    await renderNianNian();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch(e) {}
    });
    _eventListeners = [];
  }

  return { init, destroy, renderNianNian };
})();

export { NianNianWidget };
