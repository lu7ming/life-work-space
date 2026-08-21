/**
 * focus-card-widget.js - 今日聚焦卡片组件
 * 人生工作台 · 今日三件事聚焦
 * 从 Dashboard 拆分而出 (v125)
 */
import { AppUtils } from '../../../core/utils.js';
import { Storage } from '../../../core/storage.js';
import { EventBus } from '../../../core/event-bus.js';

const FocusCardWidget = (() => {
  const { escapeHtml, getTodayStr } = AppUtils;

  // ===== 状态 =====
  let focusTasks = [];
  let focusOffset = 0;
  let customFocusIds = null;
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== F1: 今日聚焦卡片 =====

  // ===== AI 每日推荐 =====
  let _aiRecommendations = null;  // 缓存当日 AI 推荐结果
  let _aiLoading = false;

  /**
   * AI 每日推荐：调用 DeepSeek 分析数据，推荐今日聚焦
   * @returns {Promise<{taskIds: number[], reasons: string[], newTasks?: object[]}|null>}
   */
  async function getAIRecommendations() {
    // 1. 检查今日缓存
    const cacheKey = `ai_focus_${getTodayStr()}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.taskIds && parsed.taskIds.length > 0) {
          console.log('[Dashboard] 使用缓存的 AI 推荐');
          return parsed;
        }
      }
    } catch (e) { /* 忽略缓存错误 */ }

    // 2. 获取 DeepSeek API Key（优先加密存储）
    let token = null;
    try {
      if (window.SecureStorage?.loadSecure) {
        token = await window.SecureStorage?.loadSecure('deepseek_token');
      }
      if (!token) {
        const setting = await Storage.get('settings', 'deepseek_token');
        token = setting ? setting.value : null;
      }
    } catch (e) { /* 无 token */ }
    if (!token) {
      console.log('[Dashboard] 无 DeepSeek token，跳过 AI 推荐');
      return null;
    }

    // 3. 收集上下文数据
    const context = await buildAIContext();

    // 4. 调用 DeepSeek
    const prompt = `你是人生工作台的AI助手。根据用户的数据，推荐今天最应该聚焦的3件事。

## 用户今日数据
${context}

## 要求
1. 从现有待办任务中选择最重要的，如果待办不够可以建议新任务
2. 综合考虑：截止日期紧迫度、任务优先级、与长期目标的相关性、习惯坚持情况
3. 回复必须严格使用JSON格式：
{
  "taskIds": [已有任务的id数字],
  "reasons": ["推荐理由1", "推荐理由2", "推荐理由3"],
  "newTasks": [{"title": "新任务标题", "priority": "high/medium/low", "reason": "推荐理由"}]
}
4. taskIds 里的 id 必须来自上面列出的任务，没有则留空
5. 最多推荐3项，newTasks 最多补充到3项
6. 只输出JSON，不要其他文字`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

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
          max_tokens: 500
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        console.warn('[Dashboard] AI 推荐请求失败:', resp.status);
        return null;
      }

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) return null;

      // 解析 JSON
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const result = JSON.parse(jsonMatch[0]);

      // 缓存结果
      try {
        localStorage.setItem(cacheKey, JSON.stringify(result));
      } catch (e) { /* 忽略 */ }

      _aiRecommendations = result;
      console.log('[Dashboard] AI 推荐结果:', result);
      return result;
    } catch (e) {
      console.warn('[Dashboard] AI 推荐失败:', e.message);
      return null;
    }
  }

  /**
   * 构建 AI 推荐的上下文数据
   */
  async function buildAIContext() {
    const lines = [];
    const today = getTodayStr();
    const now = new Date();
    const weekday = ['日','一','二','三','四','五','六'][now.getDay()];

    lines.push(`今天是 ${today} 星期${weekday}`);

    // 待办任务
    try {
      const allTasks = await Storage.getAll('tasks');
      const todoTasks = allTasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
      if (todoTasks.length > 0) {
        lines.push('\n### 待办任务：');
        todoTasks.forEach(t => {
          const due = t.dueDate ? `，截止${t.dueDate}` : '';
          const pri = t.priority || 'medium';
          lines.push(`- id=${t.id}，"${t.title}"，优先级${pri}${due}`);
        });
      } else {
        lines.push('\n当前没有待办任务。');
      }
    } catch (e) { lines.push('\n（任务数据加载失败）'); }

    // 今日习惯
    try {
      const habits = await Storage.getAll('habits');
      const checkins = await Storage.getAll('checkins');
      const todayCheckins = checkins.filter(c => c.date === today);
      const todayCheckedIds = new Set(todayCheckins.map(c => c.habitId));
      const unchecked = habits.filter(h => !todayCheckedIds.has(h.id));
      if (unchecked.length > 0) {
        lines.push('\n### 今日未完成的习惯：');
        unchecked.slice(0, 5).forEach(h => {
          lines.push(`- ${h.name}`);
        });
      }
    } catch (e) { /* 忽略 */ }

    // 进行中目标
    try {
      const goals = await Storage.getAll('goals');
      const active = goals.filter(g => g.status === 'active' || g.status === 'in_progress');
      if (active.length > 0) {
        lines.push('\n### 进行中的目标：');
        active.slice(0, 3).forEach(g => {
          lines.push(`- ${g.title}`);
        });
      }
    } catch (e) { /* 忽略 */ }

    return lines.join('\n');
  }

  /**
   * 降级排序（AI 不可用时）
   */
  async function getLocalRecommendations() {
    const allTasks = await Storage.getAll('tasks');
    const todoTasks = allTasks.filter(t => t.status === 'todo');
    const priorityOrder = { A: 1, B: 2, C: 3, D: 4, high: 1, medium: 2, low: 3 };
    todoTasks.sort((a, b) => {
      const pa = priorityOrder[a.priority] || 5;
      const pb = priorityOrder[b.priority] || 5;
      if (pa !== pb) return pa - pb;
      const da = a.dueDate || '9999-99-99';
      const db = b.dueDate || '9999-99-99';
      return da.localeCompare(db);
    });
    return todoTasks;
  }

  /**
   * 渲染今日聚焦卡片
   */
  async function renderFocusCard() {
    const container = document.getElementById('dash-focus-list');
    if (!container) return;

    // 优先使用用户自定义的任务
    if (customFocusIds && customFocusIds.length > 0) {
      try {
        const tasks = [];
        for (const id of customFocusIds) {
          const task = await Storage.get('tasks', id);
          if (task) tasks.push(task);
        }
        focusTasks = tasks;
      } catch (e) {
        focusTasks = [];
      }
    }

    // 如果没有自定义，使用推荐
    if (focusTasks.length === 0) {
      try {
        // 优先尝试 AI 推荐
        const aiResult = await getAIRecommendations();
        if (aiResult && (aiResult.taskIds?.length > 0 || aiResult.newTasks?.length > 0)) {
          focusTasks = [];
          const usedReasons = [];

          // 从已有任务中获取
          for (let i = 0; i < (aiResult.taskIds || []).length && focusTasks.length < 3; i++) {
            const task = await Storage.get('tasks', aiResult.taskIds[i]);
            if (task && task.status !== 'done' && task.status !== 'completed') {
              task._aiReason = (aiResult.reasons || [])[i] || 'AI 推荐';
              focusTasks.push(task);
            }
          }

          // 补充 AI 建议的新任务
          for (const nt of (aiResult.newTasks || [])) {
            if (focusTasks.length >= 3) break;
            focusTasks.push({
              id: `new_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
              title: nt.title,
              priority: nt.priority || 'medium',
              _aiReason: nt.reason || 'AI 建议',
              _isNew: true
            });
          }
        }

        // AI 不可用或失败，降级为本地排序
        if (focusTasks.length === 0) {
          const localTasks = await getLocalRecommendations();
          focusTasks = localTasks.slice(focusOffset, focusOffset + 3);
          if (focusTasks.length < 3 && localTasks.length > focusTasks.length) {
            const focusTaskIds = new Set(focusTasks.map(t => t.id));
            const remaining = localTasks.filter(t => !focusTaskIds.has(t.id));
            focusTasks = focusTasks.concat(remaining.slice(0, 3 - focusTasks.length));
          }
        }
      } catch (e) {
        console.warn('[Dashboard] 推荐加载失败:', e);
        focusTasks = [];
      }
    }

    if (focusTasks.length === 0) {
      container.innerHTML = `
        <div class="dash-focus-empty">
          <span class="dash-focus-empty-icon">✨</span>
          <p>暂无待办任务，享受当下吧！</p>
        </div>
      `;
      return;
    }

    const priorityLabels = { A: '紧急重要', B: '重要', C: '一般', D: '低', high: '高', medium: '中', low: '低' };
    const priorityColors = { A: '#E74C3C', B: '#F5A623', C: '#E67E22', D: '#95A5A6', high: '#E74C3C', medium: '#F5A623', low: '#95A5A6' };

    container.innerHTML = focusTasks.map((task, idx) => {
      const pLabel = priorityLabels[task.priority] || '普通';
      const pColor = priorityColors[task.priority] || '#95A5A6';
      const dueInfo = task.dueDate ? `截止 ${task.dueDate.slice(5)}` : '无截止日';
      const aiBadge = task._aiReason ? `<span class="dash-focus-ai-badge">🤖 ${escapeHtml(task._aiReason)}</span>` : '';
      const checkHtml = task._isNew
        ? `<button class="dash-focus-create-btn" data-task-idx="${idx}" title="创建此任务">➕</button>`
        : `<input type="checkbox" class="dash-focus-checkbox" data-task-id="${task.id}">`;
      return `
        <div class="dash-focus-item${task._isNew ? ' dash-focus-new' : ''}" data-task-id="${task.id}">
          <div class="dash-focus-check">${checkHtml}</div>
          <div class="dash-focus-info">
            <span class="dash-focus-task-title">${escapeHtml(task.title || '未命名任务')}</span>
            <span class="dash-focus-task-meta">
              <span class="dash-focus-priority" style="background:${pColor}20;color:${pColor}">${pLabel}</span>
              <span class="dash-focus-due">${dueInfo}</span>
            </span>
          </div>
        </div>
      `;
    }).join('');

    // 绑定勾选事件
    container.querySelectorAll('.dash-focus-checkbox').forEach(cb => {
      _bindEvent(cb, 'change', async (e) => {
        const taskId = parseInt(e.target.dataset.taskId);
        if (e.target.checked) {
          await completeFocusTask(taskId);
        }
      });
    });
  }

  /**
   * 完成聚焦任务
   */
  async function completeFocusTask(taskId) {
    try {
      const task = await Storage.get('tasks', taskId);
      if (task) {
        task.status = 'done';
        task.completedAt = new Date().toISOString();
        await Storage.put('tasks', task);
      }
      // 视觉反馈
      const item = document.querySelector(`.dash-focus-item[data-task-id="${taskId}"]`);
      if (item) {
        item.classList.add('completed');
        setTimeout(() => {
          // 从列表中移除并刷新
          focusTasks = focusTasks.filter(t => t.id !== taskId);
          renderFocusCard();
        }, 600);
      }
    } catch (err) {
      console.error('[Dashboard] 完成任务失败:', err);
    }
  }

  /**
   * 绑定聚焦卡片事件
   */
  function bindFocusEvents() {
    // 换一批
    const refreshBtn = document.getElementById('dash-focus-refresh');
    if (refreshBtn) {
      _bindEvent(refreshBtn, 'click', () => {
        customFocusIds = null;
        focusTasks = [];
        focusOffset += 3;
        renderFocusCard();
      });
    }

    // 自定义
    const customizeBtn = document.getElementById('dash-focus-customize');
    _bindEvent(customizeBtn, 'click', () => showCustomFocusModal());

    // 自定义弹窗关闭
    const closeBtn = document.getElementById('dash-custom-focus-close');
    if (closeBtn) {
      _bindEvent(closeBtn, 'click', () => {
        document.getElementById('dash-custom-focus-overlay').style.display = 'none';
      });
    }

    // 自定义弹窗确认
    const confirmBtn = document.getElementById('dash-custom-focus-confirm');
    if (confirmBtn) {
      _bindEvent(confirmBtn, 'click', () => {
        const checked = document.querySelectorAll('#dash-custom-task-list input:checked');
        customFocusIds = Array.from(checked).slice(0, 3).map(cb => parseInt(cb.dataset.taskId));
        focusTasks = [];
        focusOffset = 0;
        document.getElementById('dash-custom-focus-overlay').style.display = 'none';
        renderFocusCard();
      });
    }

    // 点击遮罩关闭
    const overlay = document.getElementById('dash-custom-focus-overlay');
    if (overlay) {
      _bindEvent(overlay, 'click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    }
  }

  /**
   * 显示自定义任务选择弹窗
   */
  async function showCustomFocusModal() {
    const overlay = document.getElementById('dash-custom-focus-overlay');
    const listEl = document.getElementById('dash-custom-task-list');
    if (!overlay || !listEl) return;

    try {
      const allTasks = await Storage.getAll('tasks');
      const todoTasks = allTasks.filter(t => t.status === 'todo');

      if (todoTasks.length === 0) {
        listEl.innerHTML = '<div class="dash-modal-empty">暂无待办任务</div>';
      } else {
        const customFocusIdSet = customFocusIds ? new Set(customFocusIds) : null;
        listEl.innerHTML = todoTasks.map(task => `
          <label class="dash-modal-task-item">
            <input type="checkbox" data-task-id="${task.id}" ${customFocusIdSet && customFocusIdSet.has(task.id) ? 'checked' : ''}>
            <span class="dash-modal-task-name">${escapeHtml(task.title || '未命名任务')}</span>
            ${task.dueDate ? `<span class="dash-modal-task-due">${task.dueDate.slice(5)}</span>` : ''}
          </label>
        `).join('');

        // 限制最多选3个
        const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
          _bindEvent(cb, 'change', () => {
            const checked = listEl.querySelectorAll('input:checked');
            if (checked.length > 3) {
              cb.checked = false;
            }
          });
        });
      }
    } catch (e) {
      listEl.innerHTML = '<div class="dash-modal-empty">加载失败</div>';
    }

    overlay.style.display = 'flex';
  }


  async function init() {
    await renderFocusCard();
    bindFocusEvents();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch(e) {}
    });
    _eventListeners = [];
  }

  return { init, destroy, renderFocusCard, showCustomFocusModal };
})();

export { FocusCardWidget };
