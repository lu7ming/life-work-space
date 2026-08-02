/**
 * report.js - 周/月报自动生成模块
 * 人生工作台 · 多模块数据汇总 + AI 总结
 */

const ReportModule = (() => {
  // ===== 事件监听追踪 =====
  let _eventListeners = [];
  let _overlayEl = null;       // 报告面板 overlay
  let _exportOverlayEl = null; // 导出面板 overlay
  let _currentType = 'weekly'; // 当前报告类型：weekly | monthly
  let _currentData = null;     // 当前报告数据
  let _aiSummaryText = '';     // 当前 AI 总结文本

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 常量 =====
  const MOOD_CONFIG = {
    '😄': { label: '开心' },
    '😊': { label: '不错' },
    '😐': { label: '一般' },
    '😔': { label: '低落' },
    '😢': { label: '难过' }
  };

  const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const DEEPSEEK_MODEL = 'deepseek-chat';

  // ===== 工具函数 =====

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 格式化日期为 MM.DD 显示
   */
  function formatShortDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}.${parseInt(parts[2])}`;
  }

  /**
   * 获取本周的起止日期（周一到周日）
   */
  function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // 周一为起始
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  /**
   * 获取本月的起止日期
   */
  function getMonthRange(date) {
    const d = new Date(date);
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    firstDay.setHours(0, 0, 0, 0);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 59, 999);
    return { start: firstDay, end: lastDay };
  }

  /**
   * 获取上一周的时间范围
   */
  function getPreviousWeekRange(date) {
    const currentWeek = getWeekRange(date);
    const prevMonday = new Date(currentWeek.start);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);
    prevSunday.setHours(23, 59, 59, 999);
    return { start: prevMonday, end: prevSunday };
  }

  /**
   * 获取上一个月的时间范围
   */
  function getPreviousMonthRange(date) {
    const d = new Date(date);
    const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return getMonthRange(prevMonth);
  }

  /**
   * 判断日期字符串是否在范围内
   */
  function isInDateRange(dateStr, startDate, endDate) {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      return d >= startDate && d <= endDate;
    } catch (e) {
      return false;
    }
  }

  /**
   * 转义 HTML
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== 数据汇总 =====

  /**
   * 读取并汇总习惯打卡数据
   */
  async function aggregateHabits(startDate, endDate) {
    try {
      const habits = await Storage.getAll('habits');
      const checkins = await Storage.getAll('checkins');
      const activeHabits = (habits || []).filter(h => !h.archived);
      const habitCount = activeHabits.length;

      if (habitCount === 0) return { habitCount: 0, checkedDays: 0, totalDays: 0, rate: 0, mood: '' };

      // 计算时间范围内的天数
      const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      // 统计有打卡记录的天数
      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);
      const periodCheckins = (checkins || []).filter(c => {
        return c.date && c.date >= startStr && c.date <= endStr;
      });

      // 计算每个习惯的打卡天数
      let totalCheckinCount = 0;
      let daysWithCheckins = new Set();

      periodCheckins.forEach(checkin => {
        // checkins 表的 date 为 keyPath，habits 为打卡习惯列表
        if (checkin.habits && Array.isArray(checkin.habits)) {
          totalCheckinCount += checkin.habits.length;
          daysWithCheckins.add(checkin.date);
        }
        // 有些打卡记录可能没有 habits 数组，但有 date 本身也算签到
        if (!checkin.habits || checkin.habits.length === 0) {
          daysWithCheckins.add(checkin.date);
        }
      });

      const checkedDays = daysWithCheckins.size;
      const rate = totalDays > 0 ? Math.round((checkedDays / totalDays) * 100) : 0;

      return { habitCount, checkedDays, totalDays, rate, totalCheckinCount };
    } catch (e) {
      console.warn('[Report] 习惯数据汇总失败:', e);
      return { habitCount: 0, checkedDays: 0, totalDays: 0, rate: 0, totalCheckinCount: 0 };
    }
  }

  /**
   * 读取并汇总任务数据
   */
  async function aggregateTasks(startDate, endDate) {
    try {
      const tasks = await Storage.getAll('tasks');
      const allTasks = tasks || [];
      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      // 时间范围内新增的任务
      const newTasks = allTasks.filter(t => t.date && t.date >= startStr && t.date <= endStr);

      // 时间范围内完成的任务
      const completedTasks = allTasks.filter(t => {
        if (t.status !== 'done') return false;
        const completedDate = t.completedAt || t.date;
        return completedDate && completedDate >= startStr && completedDate <= endStr;
      });

      // 当前进行中的任务
      const inProgress = allTasks.filter(t => t.status === 'todo' || t.status === 'in_progress');

      const newCount = newTasks.length;
      const doneCount = completedTasks.length;
      const inProgressCount = inProgress.length;
      const rate = newCount > 0 ? Math.round((doneCount / newCount) * 100) : 0;

      return { newCount, doneCount, inProgressCount, rate };
    } catch (e) {
      console.warn('[Report] 任务数据汇总失败:', e);
      return { newCount: 0, doneCount: 0, inProgressCount: 0, rate: 0 };
    }
  }

  /**
   * 读取并汇总财务数据
   */
  async function aggregateFinance(startDate, endDate, prevStartDate, prevEndDate) {
    try {
      const finance = await Storage.getAll('finance');
      const allRecords = finance || [];
      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      // 当前周期
      const periodRecords = allRecords.filter(r => r.date && r.date >= startStr && r.date <= endStr);
      const totalIncome = periodRecords.filter(r => r.type === 'income').reduce((s, r) => s + (r.amount || 0), 0);
      const totalExpense = periodRecords.filter(r => r.type === 'expense').reduce((s, r) => s + (r.amount || 0), 0);
      const balance = totalIncome - totalExpense;

      // 上一周期（用于对比）
      let prevIncome = 0, prevExpense = 0;
      if (prevStartDate && prevEndDate) {
        const prevStartStr = formatDate(prevStartDate);
        const prevEndStr = formatDate(prevEndDate);
        const prevRecords = allRecords.filter(r => r.date && r.date >= prevStartStr && r.date <= prevEndStr);
        prevIncome = prevRecords.filter(r => r.type === 'income').reduce((s, r) => s + (r.amount || 0), 0);
        prevExpense = prevRecords.filter(r => r.type === 'expense').reduce((s, r) => s + (r.amount || 0), 0);
      }

      return {
        totalIncome,
        totalExpense,
        balance,
        prevIncome,
        prevExpense,
        incomeChange: prevIncome > 0 ? Math.round(((totalIncome - prevIncome) / prevIncome) * 100) : null,
        expenseChange: prevExpense > 0 ? Math.round(((totalExpense - prevExpense) / prevExpense) * 100) : null
      };
    } catch (e) {
      console.warn('[Report] 财务数据汇总失败:', e);
      return { totalIncome: 0, totalExpense: 0, balance: 0, prevIncome: 0, prevExpense: 0, incomeChange: null, expenseChange: null };
    }
  }

  /**
   * 读取并汇总情绪数据（日记中的 mood）
   */
  async function aggregateMood(startDate, endDate) {
    try {
      const journals = await Storage.getAll('journal');
      const diaries = (journals || []).filter(j => j.type === 'diary');
      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      const periodDiaries = diaries.filter(d => d.date && d.date >= startStr && d.date <= endStr);

      const moodDistribution = {};
      periodDiaries.forEach(d => {
        if (d.mood) {
          moodDistribution[d.mood] = (moodDistribution[d.mood] || 0) + 1;
        }
      });

      // 计算平均情绪分数
      let totalScore = 0;
      let scoredCount = 0;
      const moodScores = { '😄': 5, '😊': 4, '😐': 3, '😔': 2, '😢': 1 };
      periodDiaries.forEach(d => {
        if (d.mood && moodScores[d.mood]) {
          const score = d.mood_score || moodScores[d.mood];
          totalScore += score;
          scoredCount++;
        }
      });
      const avgScore = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : null;

      return { moodDistribution, diaryCount: periodDiaries.length, avgScore };
    } catch (e) {
      console.warn('[Report] 情绪数据汇总失败:', e);
      return { moodDistribution: {}, diaryCount: 0, avgScore: null };
    }
  }

  /**
   * 读取并汇总创作数据
   */
  async function aggregateContent(startDate, endDate) {
    try {
      const shootings = await Storage.getAll('content_shootings');
      const published = await Storage.getAll('content_published');
      const startStr = formatDate(startDate);
      const endStr = formatDate(endDate);

      const periodShootings = (shootings || []).filter(s => {
        const d = s.date || s.scheduledDate;
        return d && d >= startStr && d <= endStr;
      });

      const periodPublished = (published || []).filter(p => {
        const d = p.date || p.publishedDate;
        return d && d >= startStr && d <= endStr;
      });

      // 计算总播放量
      const totalViews = periodPublished.reduce((s, p) => s + (p.views || p.playCount || 0), 0);

      return {
        shootingCount: periodShootings.length,
        publishedCount: periodPublished.length,
        totalViews
      };
    } catch (e) {
      console.warn('[Report] 创作数据汇总失败:', e);
      return { shootingCount: 0, publishedCount: 0, totalViews: 0 };
    }
  }

  /**
   * 汇总所有模块数据
   */
  async function aggregateAllData(type) {
    const now = new Date();
    let startDate, endDate, prevStartDate, prevEndDate;

    if (type === 'weekly') {
      const range = getWeekRange(now);
      startDate = range.start;
      endDate = range.end;
      const prevRange = getPreviousWeekRange(now);
      prevStartDate = prevRange.start;
      prevEndDate = prevRange.end;
    } else {
      const range = getMonthRange(now);
      startDate = range.start;
      endDate = range.end;
      const prevRange = getPreviousMonthRange(now);
      prevStartDate = prevRange.start;
      prevEndDate = prevRange.end;
    }

    const [habits, tasks, finance, mood, content] = await Promise.all([
      aggregateHabits(startDate, endDate),
      aggregateTasks(startDate, endDate),
      aggregateFinance(startDate, endDate, prevStartDate, prevEndDate),
      aggregateMood(startDate, endDate),
      aggregateContent(startDate, endDate)
    ]);

    return {
      type,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      habits,
      tasks,
      finance,
      mood,
      content
    };
  }

  // ===== AI 总结 =====

  /**
   * 获取 DeepSeek API Key
   */
  async function getDeepseekToken() {
    try {
      if (typeof SecureStorage !== 'undefined' && SecureStorage.getAPIKey) {
        return await SecureStorage.getAPIKey('deepseek_api_key');
      }
      if (typeof SecureStorage !== 'undefined' && SecureStorage.loadSecure) {
        return await SecureStorage.loadSecure('deepseek_token');
      }
      const setting = await Storage.get('settings', 'deepseek_token');
      return setting ? setting.value : null;
    } catch (e) {
      console.warn('[Report] 读取 API Key 失败:', e);
      return null;
    }
  }

  /**
   * 调用 DeepSeek API 生成 AI 总结
   */
  async function generateAISummary(data) {
    const token = await getDeepseekToken();
    if (!token) return null;

    const isWeekly = data.type === 'weekly';
    const summaryLength = isWeekly ? '100-200字' : '200-400字';

    // 构造数据摘要
    const dataDesc = [
      `时间范围：${formatShortDate(data.startDate)} - ${formatShortDate(data.endDate)}`,
      `习惯打卡：完成率 ${data.habits.rate}%（${data.habits.checkedDays}/${data.habits.totalDays}天，共${data.habits.habitCount}个习惯）`,
      `任务统计：新增${data.tasks.newCount}个，完成${data.tasks.doneCount}个，进行中${data.tasks.inProgressCount}个，完成率${data.tasks.rate}%`,
      `财务概览：收入¥${data.finance.totalIncome}，支出¥${data.finance.totalExpense}，结余¥${data.finance.balance}`,
      `情绪记录：${data.mood.diaryCount}篇日记${data.mood.avgScore ? '，平均情绪分' + data.mood.avgScore : ''}`,
      `创作产出：拍摄${data.content.shootingCount}个，发布${data.content.publishedCount}个${data.content.totalViews > 0 ? '，播放量' + data.content.totalViews : ''}`
    ].join('；');

    const prompt = `你是人生工作台的 AI 报告助手，为用户「鹿7铭」生成个性化的${isWeekly ? '周' : '月'}报总结。

基于以下数据：
${dataDesc}

请生成一段${summaryLength}的总结，要求：
1. 用轻松、鼓励的语气，像朋友在聊天
2. 先肯定亮点和进步
3. 再温和地提一两个改进建议
4. 适当使用 emoji
5. 不要用标题或列表格式，写成自然的段落
6. 不要编造数据中没有的信息`;

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: isWeekly ? 300 : 600
        })
      });

      if (!response.ok) {
        console.warn('[Report] API 请求失败:', response.status);
        return null;
      }

      const result = await response.json();
      if (result.choices && result.choices[0] && result.choices[0].message) {
        return result.choices[0].message.content.trim();
      }
      return null;
    } catch (e) {
      console.warn('[Report] AI 总结生成失败:', e);
      return null;
    }
  }

  // ===== 渲染 =====

  /**
   * 渲染进度条
   */
  function renderProgressBar(label, percent, colorClass) {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    return `
      <div class="report-progress-row">
        <span class="report-progress-label">${label}</span>
        <div class="report-progress-bar">
          <div class="report-progress-fill ${colorClass}" style="width: ${clampedPercent}%"></div>
        </div>
        <span class="report-progress-value">${clampedPercent}%</span>
      </div>`;
  }

  /**
   * 渲染变化对比文本
   */
  function renderChangeText(current, previous, label, unit) {
    if (previous === 0 || previous === null || previous === undefined) return '';
    const diff = current - previous;
    const pct = Math.round(Math.abs(diff / previous) * 100);
    if (diff === 0) return `${label}与上期持平`;
    const arrow = diff > 0 ? '↑' : '↓';
    const cls = diff > 0 ? 'up' : 'down';
    // 对支出来说，增加是坏事用 up(橙)，减少是好事用 down(绿)
    if (label === '支出') {
      const spendingCls = diff > 0 ? 'up' : 'down';
      return `较上期${arrow}${pct}% <span class="${spendingCls}">${diff > 0 ? '↑' : '↓'}¥${Math.abs(diff)}</span>`;
    }
    return `较上期${arrow}${pct}% <span class="${cls}">${diff > 0 ? '↑' : '↓'}¥${Math.abs(diff)}</span>`;
  }

  /**
   * 渲染情绪分布标签
   */
  function renderMoodTags(moodDistribution) {
    const entries = Object.entries(moodDistribution);
    if (entries.length === 0) {
      return '<span class="report-mood-tag">暂无情绪记录</span>';
    }
    // 按数量降序
    entries.sort((a, b) => b[1] - a[1]);
    return entries.map(([mood, count]) => {
      const label = MOOD_CONFIG[mood] ? MOOD_CONFIG[mood].label : '';
      return `<span class="report-mood-tag">${mood} <span class="report-mood-count">${count}</span>${label ? ' ' + label : ''}</span>`;
    }).join('');
  }

  /**
   * 渲染报告面板内容
   */
  function renderReportContent(data) {
    const isWeekly = data.type === 'weekly';
    const periodLabel = isWeekly ? '本周' : '本月';

    // 习惯
    const habitsSection = `
      <div class="report-section">
        <div class="report-section-header">
          <span class="report-section-icon">✅</span>
          <span class="report-section-title">习惯打卡</span>
        </div>
        <div class="report-section-content">
          ${renderProgressBar(periodLabel + '完成率', data.habits.rate, 'green')}
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">
            ${data.habits.checkedDays}/${data.habits.totalDays}天 · ${data.habits.habitCount}个习惯
          </div>
        </div>
      </div>`;

    // 任务
    const tasksSection = `
      <div class="report-section">
        <div class="report-section-header">
          <span class="report-section-icon">📋</span>
          <span class="report-section-title">任务统计</span>
        </div>
        <div class="report-section-content">
          ${renderProgressBar('完成率', data.tasks.rate, 'blue')}
          <div class="report-stat-grid" style="margin-top:8px;">
            <div class="report-stat-item">
              <div class="report-stat-value">${data.tasks.newCount}</div>
              <div class="report-stat-label">新增</div>
            </div>
            <div class="report-stat-item">
              <div class="report-stat-value">${data.tasks.doneCount}</div>
              <div class="report-stat-label">完成</div>
            </div>
            <div class="report-stat-item">
              <div class="report-stat-value">${data.tasks.inProgressCount}</div>
              <div class="report-stat-label">进行中</div>
            </div>
          </div>
        </div>
      </div>`;

    // 财务
    const financeCompareHtml = (data.finance.incomeChange !== null || data.finance.expenseChange !== null)
      ? `<div class="report-stat-compare">
          收入${renderChangeText(data.finance.totalIncome, data.finance.prevIncome, '收入', '¥')} ·
          支出${renderChangeText(data.finance.totalExpense, data.finance.prevExpense, '支出', '¥')}
        </div>`
      : '';

    const balanceClass = data.finance.balance >= 0 ? 'balance' : 'expense';
    const financeSection = `
      <div class="report-section">
        <div class="report-section-header">
          <span class="report-section-icon">💰</span>
          <span class="report-section-title">财务概览</span>
        </div>
        <div class="report-section-content">
          <div class="report-stat-grid">
            <div class="report-stat-item">
              <div class="report-stat-value income">¥${data.finance.totalIncome.toLocaleString()}</div>
              <div class="report-stat-label">收入</div>
            </div>
            <div class="report-stat-item">
              <div class="report-stat-value expense">¥${data.finance.totalExpense.toLocaleString()}</div>
              <div class="report-stat-label">支出</div>
            </div>
            <div class="report-stat-item">
              <div class="report-stat-value ${balanceClass}">¥${data.finance.balance.toLocaleString()}</div>
              <div class="report-stat-label">结余</div>
            </div>
          </div>
          ${financeCompareHtml}
        </div>
      </div>`;

    // 情绪
    const moodSection = `
      <div class="report-section">
        <div class="report-section-header">
          <span class="report-section-icon">😊</span>
          <span class="report-section-title">情绪趋势</span>
        </div>
        <div class="report-section-content">
          <div class="report-mood-grid">
            ${renderMoodTags(data.mood.moodDistribution)}
          </div>
          ${data.mood.avgScore ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">平均情绪分 ${data.mood.avgScore}/5 · ${data.mood.diaryCount}篇日记</div>` : ''}
        </div>
      </div>`;

    // 创作
    const contentSection = `
      <div class="report-section">
        <div class="report-section-header">
          <span class="report-section-icon">🎬</span>
          <span class="report-section-title">创作数据</span>
        </div>
        <div class="report-section-content">
          <div class="report-content-stats">
            <div class="report-content-item">📷 拍摄 <strong>${data.content.shootingCount}</strong> 个</div>
            <div class="report-content-item">📤 发布 <strong>${data.content.publishedCount}</strong> 个</div>
            ${data.content.totalViews > 0 ? `<div class="report-content-item">👁️ 播放 <strong>${data.content.totalViews.toLocaleString()}</strong></div>` : ''}
          </div>
        </div>
      </div>`;

    // AI 总结（占位，异步加载）
    const aiSection = `
      <div class="report-section">
        <div class="report-ai-section" id="report-ai-section">
          <div class="report-ai-header">
            <span class="report-ai-icon">🤖</span>
            <span class="report-ai-title">AI 总结</span>
          </div>
          <div id="report-ai-content">
            <div class="report-ai-loading">
              <span>正在生成 AI 总结</span>
              <span class="report-ai-loading-dots"></span>
            </div>
          </div>
        </div>
      </div>`;

    return habitsSection + tasksSection + financeSection + moodSection + contentSection + aiSection;
  }

  /**
   * 生成 Markdown 导出文本
   */
  function generateMarkdown(data, aiSummary) {
    const isWeekly = data.type === 'weekly';
    const periodLabel = isWeekly ? '周报' : '月报';
    const periodPronoun = isWeekly ? '本周' : '本月';

    let md = `# 📊 ${periodLabel} ${formatShortDate(data.startDate)} - ${formatShortDate(data.endDate)}\n\n`;

    md += `## ✅ 习惯打卡\n`;
    md += `- ${periodPronoun}完成率：${data.habits.rate}%\n`;
    md += `- 打卡天数：${data.habits.checkedDays}/${data.habits.totalDays}天\n`;
    md += `- 活跃习惯：${data.habits.habitCount}个\n\n`;

    md += `## 📋 任务统计\n`;
    md += `- 新增任务：${data.tasks.newCount}个\n`;
    md += `- 完成任务：${data.tasks.doneCount}个\n`;
    md += `- 进行中：${data.tasks.inProgressCount}个\n`;
    md += `- 完成率：${data.tasks.rate}%\n\n`;

    md += `## 💰 财务概览\n`;
    md += `- 收入：¥${data.finance.totalIncome.toLocaleString()}\n`;
    md += `- 支出：¥${data.finance.totalExpense.toLocaleString()}\n`;
    md += `- 结余：¥${data.finance.balance.toLocaleString()}\n`;
    if (data.finance.incomeChange !== null) {
      md += `- 收入较上期：${data.finance.incomeChange > 0 ? '+' : ''}${data.finance.incomeChange}%\n`;
    }
    if (data.finance.expenseChange !== null) {
      md += `- 支出较上期：${data.finance.expenseChange > 0 ? '+' : ''}${data.finance.expenseChange}%\n`;
    }
    md += '\n';

    md += `## 😊 情绪趋势\n`;
    const moodEntries = Object.entries(data.mood.moodDistribution);
    if (moodEntries.length > 0) {
      moodEntries.forEach(([mood, count]) => {
        const label = MOOD_CONFIG[mood] ? MOOD_CONFIG[mood].label : '';
        md += `- ${mood} ${label}：${count}次\n`;
      });
    } else {
      md += '- 暂无情绪记录\n';
    }
    if (data.mood.avgScore) md += `- 平均情绪分：${data.mood.avgScore}/5\n`;
    md += `- 日记篇数：${data.mood.diaryCount}篇\n\n`;

    md += `## 🎬 创作数据\n`;
    md += `- 拍摄：${data.content.shootingCount}个\n`;
    md += `- 发布：${data.content.publishedCount}个\n`;
    if (data.content.totalViews > 0) md += `- 播放量：${data.content.totalViews.toLocaleString()}\n`;
    md += '\n';

    if (aiSummary) {
      md += `## 🤖 AI 总结\n\n${aiSummary}\n`;
    }

    return md;
  }

  // ===== 面板控制 =====

  /**
   * 打开报告面板
   */
  async function openReport(type) {
    _currentType = type;
    _aiSummaryText = '';

    // 创建 overlay
    const overlay = document.createElement('div');
    overlay.className = 'report-overlay';
    overlay.id = 'report-overlay';

    const isWeekly = type === 'weekly';
    const periodLabel = isWeekly ? '周报' : '月报';

    // 先渲染骨架（数据加载中）
    overlay.innerHTML = `
      <div class="report-panel">
        <div class="report-header">
          <div class="report-header-left">
            <div class="report-title" id="report-title">📊 ${periodLabel}</div>
            <div class="report-date-range" id="report-date-range">加载中...</div>
          </div>
          <div class="report-header-right">
            <div class="report-tab-group">
              <button class="report-tab ${isWeekly ? 'active' : ''}" data-type="weekly">周报</button>
              <button class="report-tab ${!isWeekly ? 'active' : ''}" data-type="monthly">月报</button>
            </div>
            <button class="report-action-btn" id="report-export-btn">导出</button>
            <button class="report-close-btn" id="report-close-btn">✕</button>
          </div>
        </div>
        <div class="report-body" id="report-body">
          <div class="report-empty">
            <div class="report-empty-icon">⏳</div>
            <div class="report-empty-text">正在汇总数据...</div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    _overlayEl = overlay;

    // 绑定头部事件
    bindPanelEvents(overlay);

    // 异步加载数据
    try {
      const data = await aggregateAllData(type);
      _currentData = data;

      // 更新标题和日期
      const titleEl = overlay.querySelector('#report-title');
      const dateEl = overlay.querySelector('#report-date-range');
      if (titleEl) titleEl.textContent = `📊 ${periodLabel}`;
      if (dateEl) dateEl.textContent = `${formatShortDate(data.startDate)} - ${formatShortDate(data.endDate)}`;

      // 渲染内容
      const bodyEl = overlay.querySelector('#report-body');
      if (bodyEl) {
        bodyEl.innerHTML = renderReportContent(data);
      }

      // 异步加载 AI 总结
      loadAISummary(data);
    } catch (err) {
      console.error('[Report] 数据加载失败:', err);
      const bodyEl = overlay.querySelector('#report-body');
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="report-empty">
            <div class="report-empty-icon">😵</div>
            <div class="report-empty-text">数据加载失败，请重试</div>
          </div>`;
      }
    }
  }

  /**
   * 异步加载 AI 总结
   */
  async function loadAISummary(data) {
    const aiContentEl = document.getElementById('report-ai-content');
    if (!aiContentEl) return;

    try {
      const summary = await generateAISummary(data);
      if (summary) {
        _aiSummaryText = summary;
        aiContentEl.innerHTML = `<div class="report-ai-text">${escapeHtml(summary)}</div>`;
      } else {
        aiContentEl.innerHTML = '<div class="report-ai-unavailable">AI 总结暂不可用</div>';
      }
    } catch (e) {
      console.warn('[Report] AI 总结加载失败:', e);
      aiContentEl.innerHTML = '<div class="report-ai-unavailable">AI 总结暂不可用</div>';
    }
  }

  /**
   * 关闭报告面板
   */
  function closeReport() {
    if (_overlayEl) {
      _overlayEl.remove();
      _overlayEl = null;
    }
  }

  /**
   * 切换报告类型
   */
  function switchReportType(type) {
    if (type === _currentType) return;
    closeReport();
    openReport(type);
  }

  /**
   * 打开导出面板
   */
  function openExport() {
    if (!_currentData) return;

    const markdown = generateMarkdown(_currentData, _aiSummaryText);

    const exportOverlay = document.createElement('div');
    exportOverlay.className = 'report-export-overlay';
    exportOverlay.id = 'report-export-overlay';

    const periodLabel = _currentType === 'weekly' ? '周报' : '月报';

    exportOverlay.innerHTML = `
      <div class="report-export-panel">
        <div class="report-export-header">
          <span class="report-export-title">📤 导出${periodLabel}</span>
          <button class="report-close-btn" id="report-export-close">✕</button>
        </div>
        <div class="report-export-body">
          <textarea class="report-export-textarea" id="report-export-textarea" readonly>${escapeHtml(markdown)}</textarea>
        </div>
        <div class="report-export-footer">
          <button class="report-export-btn secondary" id="report-export-cancel">取消</button>
          <button class="report-export-btn primary" id="report-export-copy">复制到剪贴板</button>
        </div>
      </div>`;

    document.body.appendChild(exportOverlay);
    _exportOverlayEl = exportOverlay;

    // 绑定事件
    const closeBtn = exportOverlay.querySelector('#report-export-close');
    const cancelBtn = exportOverlay.querySelector('#report-export-cancel');
    const copyBtn = exportOverlay.querySelector('#report-export-copy');

    _bindEvent(closeBtn, 'click', closeExport);
    _bindEvent(cancelBtn, 'click', closeExport);
    _bindEvent(copyBtn, 'click', async () => {
      const textarea = exportOverlay.querySelector('#report-export-textarea');
      if (textarea) {
        try {
          await navigator.clipboard.writeText(textarea.value);
          if (typeof App !== 'undefined') App.showToast('已复制到剪贴板 ✅');
          else alert('已复制到剪贴板');
        } catch (e) {
          // 降级：选中文本
          textarea.select();
          document.execCommand('copy');
          if (typeof App !== 'undefined') App.showToast('已复制到剪贴板 ✅');
        }
      }
    });

    // 点击遮罩关闭
    _bindEvent(exportOverlay, 'click', (e) => {
      if (e.target === exportOverlay) closeExport();
    });
  }

  /**
   * 关闭导出面板
   */
  function closeExport() {
    if (_exportOverlayEl) {
      _exportOverlayEl.remove();
      _exportOverlayEl = null;
    }
  }

  /**
   * 绑定报告面板事件
   */
  function bindPanelEvents(overlay) {
    // 关闭按钮
    const closeBtn = overlay.querySelector('#report-close-btn');
    _bindEvent(closeBtn, 'click', closeReport);

    // 点击遮罩关闭
    _bindEvent(overlay, 'click', (e) => {
      if (e.target === overlay) closeReport();
    });

    // ESC 关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeExport();
        closeReport();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Tab 切换
    const tabs = overlay.querySelectorAll('.report-tab');
    tabs.forEach(tab => {
      _bindEvent(tab, 'click', () => {
        const type = tab.dataset.type;
        switchReportType(type);
      });
    });

    // 导出按钮
    const exportBtn = overlay.querySelector('#report-export-btn');
    _bindEvent(exportBtn, 'click', openExport);
  }

  // ===== 模块生命周期 =====

  /**
   * 初始化：绑定 Dashboard 入口按钮
   */
  function init() {
    console.log('[Report] 周/月报模块初始化');

    // 查找 Dashboard 中的入口位置（问候区域下方的智能聚焦卡片旁）
    const smartFocus = document.getElementById('dash-smart-focus');
    const greetingArea = document.querySelector('.dash-greeting');

    // 创建入口按钮
    const entryDiv = document.createElement('div');
    entryDiv.className = 'dash-report-entry';
    entryDiv.id = 'dash-report-entry';
    entryDiv.innerHTML = `
      <button class="dash-report-btn" id="dash-weekly-report-btn">📊 查看周报</button>
      <button class="dash-report-btn" id="dash-monthly-report-btn">📋 查看月报</button>
    `;

    // 插入到智能聚焦卡片之前，或问候区域之后
    if (smartFocus && smartFocus.parentNode) {
      smartFocus.parentNode.insertBefore(entryDiv, smartFocus);
    } else if (greetingArea && greetingArea.parentNode) {
      greetingArea.parentNode.insertBefore(entryDiv, greetingArea.nextSibling);
    }

    // 绑定按钮事件
    const weeklyBtn = document.getElementById('dash-weekly-report-btn');
    const monthlyBtn = document.getElementById('dash-monthly-report-btn');

    _bindEvent(weeklyBtn, 'click', () => openReport('weekly'));
    _bindEvent(monthlyBtn, 'click', () => openReport('monthly'));
  }

  /**
   * 销毁模块
   */
  function destroy() {
    // 清理事件监听
    _eventListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch (e) {}
    });
    _eventListeners = [];

    // 关闭面板
    closeReport();
    closeExport();

    // 移除入口按钮
    const entry = document.getElementById('dash-report-entry');
    if (entry) entry.remove();

    console.log('[Report] 模块已销毁');
  }

  return { init, destroy, openReport };
})();
