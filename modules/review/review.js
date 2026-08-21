/**
 * review.js - 复盘模块（周报/月报 + 复盘模板）
 * 人生工作台 · 整合 report 与 templates 功能
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';

export const ReviewModule = (() => {
  // ===== 公共状态 =====
  let _eventListeners = [];
  let _currentTab = 'report';

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ====================================================
  //  报告子模块（原 report.js 核心逻辑）
  // ====================================================
  const ReportSub = (() => {
    let _currentType = 'weekly';
    let _currentData = null;
    let _aiSummaryText = '';
    let _exportOverlayEl = null;

    const MOOD_CONFIG = {
      '😄': { label: '开心' },
      '😊': { label: '不错' },
      '😐': { label: '一般' },
      '😔': { label: '低落' },
      '😢': { label: '难过' }
    };

    const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
    const DEEPSEEK_MODEL = 'deepseek-chat';

    function formatDate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    function formatShortDate(dateStr) {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      return `${parseInt(parts[1])}.${parseInt(parts[2])}`;
    }

    function getWeekRange(date) {
      const d = new Date(date);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { start: monday, end: sunday };
    }

    function getMonthRange(date) {
      const d = new Date(date);
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
      firstDay.setHours(0, 0, 0, 0);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      lastDay.setHours(23, 59, 59, 999);
      return { start: firstDay, end: lastDay };
    }

    function getPreviousWeekRange(date) {
      const currentWeek = getWeekRange(date);
      const prevMonday = new Date(currentWeek.start);
      prevMonday.setDate(prevMonday.getDate() - 7);
      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevMonday.getDate() + 6);
      prevSunday.setHours(23, 59, 59, 999);
      return { start: prevMonday, end: prevSunday };
    }

    function getPreviousMonthRange(date) {
      const d = new Date(date);
      const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      return getMonthRange(prevMonth);
    }

    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // ===== 数据汇总 =====

    async function aggregateHabits(startDate, endDate) {
      try {
        const habits = await Storage.getAll('habits');
        const checkins = await Storage.getAll('checkins');
        const activeHabits = (habits || []).filter(h => !h.archived);
        const habitCount = activeHabits.length;
        if (habitCount === 0) return { habitCount: 0, checkedDays: 0, totalDays: 0, rate: 0, totalCheckinCount: 0 };
        const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const startStr = formatDate(startDate);
        const endStr = formatDate(endDate);
        const periodCheckins = (checkins || []).filter(c => c.date && c.date >= startStr && c.date <= endStr);
        let totalCheckinCount = 0;
        let daysWithCheckins = new Set();
        periodCheckins.forEach(checkin => {
          if (checkin.habits && Array.isArray(checkin.habits)) {
            totalCheckinCount += checkin.habits.length;
            daysWithCheckins.add(checkin.date);
          }
          if (!checkin.habits || checkin.habits.length === 0) {
            daysWithCheckins.add(checkin.date);
          }
        });
        const checkedDays = daysWithCheckins.size;
        const rate = totalDays > 0 ? Math.round((checkedDays / totalDays) * 100) : 0;
        return { habitCount, checkedDays, totalDays, rate, totalCheckinCount };
      } catch (e) {
        console.warn('[Review/Report] 习惯数据汇总失败:', e);
        return { habitCount: 0, checkedDays: 0, totalDays: 0, rate: 0, totalCheckinCount: 0 };
      }
    }

    async function aggregateTasks(startDate, endDate) {
      try {
        const tasks = await Storage.getAll('tasks');
        const allTasks = tasks || [];
        const startStr = formatDate(startDate);
        const endStr = formatDate(endDate);
        const newTasks = allTasks.filter(t => t.date && t.date >= startStr && t.date <= endStr);
        const completedTasks = allTasks.filter(t => {
          if (t.status !== 'done' && t.status !== 'completed') return false;
          const completedDate = t.completedAt || t.date;
          return completedDate && completedDate >= startStr && completedDate <= endStr;
        });
        const inProgress = allTasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
        const newCount = newTasks.length;
        const doneCount = completedTasks.length;
        const inProgressCount = inProgress.length;
        const rate = newCount > 0 ? Math.round((doneCount / newCount) * 100) : 0;
        return { newCount, doneCount, inProgressCount, rate };
      } catch (e) {
        console.warn('[Review/Report] 任务数据汇总失败:', e);
        return { newCount: 0, doneCount: 0, inProgressCount: 0, rate: 0 };
      }
    }

    async function aggregateFinance(startDate, endDate, prevStartDate, prevEndDate) {
      try {
        const finance = await Storage.getAll('finance');
        const allRecords = finance || [];
        const startStr = formatDate(startDate);
        const endStr = formatDate(endDate);
        const periodRecords = allRecords.filter(r => r.date && r.date >= startStr && r.date <= endStr);
        const totalIncome = periodRecords.filter(r => r.type === 'income').reduce((s, r) => s + (r.amount || 0), 0);
        const totalExpense = periodRecords.filter(r => r.type === 'expense').reduce((s, r) => s + (r.amount || 0), 0);
        const balance = totalIncome - totalExpense;
        let prevIncome = 0, prevExpense = 0;
        if (prevStartDate && prevEndDate) {
          const prevStartStr = formatDate(prevStartDate);
          const prevEndStr = formatDate(prevEndDate);
          const prevRecords = allRecords.filter(r => r.date && r.date >= prevStartStr && r.date <= prevEndStr);
          prevIncome = prevRecords.filter(r => r.type === 'income').reduce((s, r) => s + (r.amount || 0), 0);
          prevExpense = prevRecords.filter(r => r.type === 'expense').reduce((s, r) => s + (r.amount || 0), 0);
        }
        return {
          totalIncome, totalExpense, balance, prevIncome, prevExpense,
          incomeChange: prevIncome > 0 ? Math.round(((totalIncome - prevIncome) / prevIncome) * 100) : null,
          expenseChange: prevExpense > 0 ? Math.round(((totalExpense - prevExpense) / prevExpense) * 100) : null
        };
      } catch (e) {
        console.warn('[Review/Report] 财务数据汇总失败:', e);
        return { totalIncome: 0, totalExpense: 0, balance: 0, prevIncome: 0, prevExpense: 0, incomeChange: null, expenseChange: null };
      }
    }

    async function aggregateMood(startDate, endDate) {
      try {
        const journals = await Storage.getAll('journal');
        const diaries = (journals || []).filter(j => j.type === 'diary');
        const startStr = formatDate(startDate);
        const endStr = formatDate(endDate);
        const periodDiaries = diaries.filter(d => d.date && d.date >= startStr && d.date <= endStr);
        const moodDistribution = {};
        periodDiaries.forEach(d => {
          if (d.mood) moodDistribution[d.mood] = (moodDistribution[d.mood] || 0) + 1;
        });
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
        console.warn('[Review/Report] 情绪数据汇总失败:', e);
        return { moodDistribution: {}, diaryCount: 0, avgScore: null };
      }
    }

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
        const totalViews = periodPublished.reduce((s, p) => s + (p.views || p.playCount || 0), 0);
        return { shootingCount: periodShootings.length, publishedCount: periodPublished.length, totalViews };
      } catch (e) {
        console.warn('[Review/Report] 创作数据汇总失败:', e);
        return { shootingCount: 0, publishedCount: 0, totalViews: 0 };
      }
    }

    async function aggregateAllData(type) {
      const now = new Date();
      let startDate, endDate, prevStartDate, prevEndDate;
      if (type === 'weekly') {
        const range = getWeekRange(now);
        startDate = range.start; endDate = range.end;
        const prevRange = getPreviousWeekRange(now);
        prevStartDate = prevRange.start; prevEndDate = prevRange.end;
      } else {
        const range = getMonthRange(now);
        startDate = range.start; endDate = range.end;
        const prevRange = getPreviousMonthRange(now);
        prevStartDate = prevRange.start; prevEndDate = prevRange.end;
      }
      const [habits, tasks, finance, mood, content] = await Promise.all([
        aggregateHabits(startDate, endDate),
        aggregateTasks(startDate, endDate),
        aggregateFinance(startDate, endDate, prevStartDate, prevEndDate),
        aggregateMood(startDate, endDate),
        aggregateContent(startDate, endDate)
      ]);
      return { type, startDate: formatDate(startDate), endDate: formatDate(endDate), habits, tasks, finance, mood, content };
    }

    // ===== AI 总结 =====

    async function getDeepseekToken() {
      try {
        if (window.SecureStorage?.getAPIKey) return await window.SecureStorage?.getAPIKey('deepseek_api_key');
        if (window.SecureStorage?.loadSecure) return await window.SecureStorage?.loadSecure('deepseek_token');
        const setting = await Storage.get('settings', 'deepseek_token');
        return setting ? setting.value : null;
      } catch (e) { return null; }
    }

    async function generateAISummary(data) {
      const token = await getDeepseekToken();
      if (!token) return null;
      const isWeekly = data.type === 'weekly';
      const summaryLength = isWeekly ? '100-200字' : '200-400字';
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
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ model: DEEPSEEK_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: isWeekly ? 300 : 600 })
        });
        if (!response.ok) return null;
        const result = await response.json();
        if (result.choices && result.choices[0] && result.choices[0].message) {
          return result.choices[0].message.content.trim();
        }
        return null;
      } catch (e) { return null; }
    }

    // ===== 渲染 =====

    function renderProgressBar(label, percent, colorClass) {
      const clampedPercent = Math.max(0, Math.min(100, percent));
      return `<div class="report-progress-row">
        <span class="report-progress-label">${label}</span>
        <div class="report-progress-bar"><div class="report-progress-fill ${colorClass}" style="width: ${clampedPercent}%"></div></div>
        <span class="report-progress-value">${clampedPercent}%</span>
      </div>`;
    }

    function renderChangeText(current, previous, label, unit) {
      if (previous === 0 || previous === null || previous === undefined) return '';
      const diff = current - previous;
      const pct = Math.round(Math.abs(diff / previous) * 100);
      if (diff === 0) return `${label}与上期持平`;
      const arrow = diff > 0 ? '↑' : '↓';
      const cls = diff > 0 ? 'up' : 'down';
      if (label === '支出') {
        const spendingCls = diff > 0 ? 'up' : 'down';
        return `较上期${arrow}${pct}% <span class="${spendingCls}">${diff > 0 ? '↑' : '↓'}¥${Math.abs(diff)}</span>`;
      }
      return `较上期${arrow}${pct}% <span class="${cls}">${diff > 0 ? '↑' : '↓'}¥${Math.abs(diff)}</span>`;
    }

    function renderMoodTags(moodDistribution) {
      const entries = Object.entries(moodDistribution);
      if (entries.length === 0) return '<span class="report-mood-tag">暂无情绪记录</span>';
      entries.sort((a, b) => b[1] - a[1]);
      return entries.map(([mood, count]) => {
        const label = MOOD_CONFIG[mood] ? MOOD_CONFIG[mood].label : '';
        return `<span class="report-mood-tag">${mood} <span class="report-mood-count">${count}</span>${label ? ' ' + label : ''}</span>`;
      }).join('');
    }

    function renderReportContent(data) {
      const isWeekly = data.type === 'weekly';
      const periodLabel = isWeekly ? '本周' : '本月';

      const habitsSection = `<div class="report-section">
        <div class="report-section-header"><span class="report-section-icon">✅</span><span class="report-section-title">习惯打卡</span></div>
        <div class="report-section-content">
          ${renderProgressBar(periodLabel + '完成率', data.habits.rate, 'green')}
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">${data.habits.checkedDays}/${data.habits.totalDays}天 · ${data.habits.habitCount}个习惯</div>
        </div>
      </div>`;

      const tasksSection = `<div class="report-section">
        <div class="report-section-header"><span class="report-section-icon">📋</span><span class="report-section-title">任务统计</span></div>
        <div class="report-section-content">
          ${renderProgressBar('完成率', data.tasks.rate, 'blue')}
          <div class="report-stat-grid" style="margin-top:8px;">
            <div class="report-stat-item"><div class="report-stat-value">${data.tasks.newCount}</div><div class="report-stat-label">新增</div></div>
            <div class="report-stat-item"><div class="report-stat-value">${data.tasks.doneCount}</div><div class="report-stat-label">完成</div></div>
            <div class="report-stat-item"><div class="report-stat-value">${data.tasks.inProgressCount}</div><div class="report-stat-label">进行中</div></div>
          </div>
        </div>
      </div>`;

      const financeCompareHtml = (data.finance.incomeChange !== null || data.finance.expenseChange !== null)
        ? `<div class="report-stat-compare">收入${renderChangeText(data.finance.totalIncome, data.finance.prevIncome, '收入', '¥')} · 支出${renderChangeText(data.finance.totalExpense, data.finance.prevExpense, '支出', '¥')}</div>`
        : '';

      const balanceClass = data.finance.balance >= 0 ? 'balance' : 'expense';
      const financeSection = `<div class="report-section">
        <div class="report-section-header"><span class="report-section-icon">💰</span><span class="report-section-title">财务概览</span></div>
        <div class="report-section-content">
          <div class="report-stat-grid">
            <div class="report-stat-item"><div class="report-stat-value income">¥${data.finance.totalIncome.toLocaleString()}</div><div class="report-stat-label">收入</div></div>
            <div class="report-stat-item"><div class="report-stat-value expense">¥${data.finance.totalExpense.toLocaleString()}</div><div class="report-stat-label">支出</div></div>
            <div class="report-stat-item"><div class="report-stat-value ${balanceClass}">¥${data.finance.balance.toLocaleString()}</div><div class="report-stat-label">结余</div></div>
          </div>
          ${financeCompareHtml}
        </div>
      </div>`;

      const moodSection = `<div class="report-section">
        <div class="report-section-header"><span class="report-section-icon">😊</span><span class="report-section-title">情绪趋势</span></div>
        <div class="report-section-content">
          <div class="report-mood-grid">${renderMoodTags(data.mood.moodDistribution)}</div>
          ${data.mood.avgScore ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">平均情绪分 ${data.mood.avgScore}/5 · ${data.mood.diaryCount}篇日记</div>` : ''}
        </div>
      </div>`;

      const contentSection = `<div class="report-section">
        <div class="report-section-header"><span class="report-section-icon">🎬</span><span class="report-section-title">创作数据</span></div>
        <div class="report-section-content">
          <div class="report-content-stats">
            <div class="report-content-item">📷 拍摄 <strong>${data.content.shootingCount}</strong> 个</div>
            <div class="report-content-item">📤 发布 <strong>${data.content.publishedCount}</strong> 个</div>
            ${data.content.totalViews > 0 ? `<div class="report-content-item">👁️ 播放 <strong>${data.content.totalViews.toLocaleString()}</strong></div>` : ''}
          </div>
        </div>
      </div>`;

      const aiSection = `<div class="report-section">
        <div class="report-ai-section" id="review-ai-section">
          <div class="report-ai-header"><span class="report-ai-icon">🤖</span><span class="report-ai-title">AI 总结</span></div>
          <div id="review-ai-content">
            <div class="report-ai-loading"><span>正在生成 AI 总结</span><span class="report-ai-loading-dots"></span></div>
          </div>
        </div>
      </div>`;

      return habitsSection + tasksSection + financeSection + moodSection + contentSection + aiSection;
    }

    function generateMarkdown(data, aiSummary) {
      const isWeekly = data.type === 'weekly';
      const periodLabel = isWeekly ? '周报' : '月报';
      const periodPronoun = isWeekly ? '本周' : '本月';
      let md = `# 📊 ${periodLabel} ${formatShortDate(data.startDate)} - ${formatShortDate(data.endDate)}\n\n`;
      md += `## ✅ 习惯打卡\n- ${periodPronoun}完成率：${data.habits.rate}%\n- 打卡天数：${data.habits.checkedDays}/${data.habits.totalDays}天\n- 活跃习惯：${data.habits.habitCount}个\n\n`;
      md += `## 📋 任务统计\n- 新增任务：${data.tasks.newCount}个\n- 完成任务：${data.tasks.doneCount}个\n- 进行中：${data.tasks.inProgressCount}个\n- 完成率：${data.tasks.rate}%\n\n`;
      md += `## 💰 财务概览\n- 收入：¥${data.finance.totalIncome.toLocaleString()}\n- 支出：¥${data.finance.totalExpense.toLocaleString()}\n- 结余：¥${data.finance.balance.toLocaleString()}\n`;
      if (data.finance.incomeChange !== null) md += `- 收入较上期：${data.finance.incomeChange > 0 ? '+' : ''}${data.finance.incomeChange}%\n`;
      if (data.finance.expenseChange !== null) md += `- 支出较上期：${data.finance.expenseChange > 0 ? '+' : ''}${data.finance.expenseChange}%\n`;
      md += '\n';
      md += `## 😊 情绪趋势\n`;
      const moodEntries = Object.entries(data.mood.moodDistribution);
      if (moodEntries.length > 0) {
        moodEntries.forEach(([mood, count]) => {
          const label = MOOD_CONFIG[mood] ? MOOD_CONFIG[mood].label : '';
          md += `- ${mood} ${label}：${count}次\n`;
        });
      } else { md += '- 暂无情绪记录\n'; }
      if (data.mood.avgScore) md += `- 平均情绪分：${data.mood.avgScore}/5\n`;
      md += `- 日记篇数：${data.mood.diaryCount}篇\n\n`;
      md += `## 🎬 创作数据\n- 拍摄：${data.content.shootingCount}个\n- 发布：${data.content.publishedCount}个\n`;
      if (data.content.totalViews > 0) md += `- 播放量：${data.content.totalViews.toLocaleString()}\n`;
      md += '\n';
      if (aiSummary) md += `## 🤖 AI 总结\n\n${aiSummary}\n`;
      return md;
    }

    // ===== 面板操作 =====

    async function loadReport(type) {
      _currentType = type;
      _aiSummaryText = '';
      _currentData = null;

      const bodyEl = document.getElementById('review-report-body');
      const dateEl = document.getElementById('review-date-range');
      if (!bodyEl) return;

      // 显示加载状态
      bodyEl.innerHTML = `<div class="review-empty"><div class="review-empty-icon">⏳</div><div class="review-empty-text">正在汇总数据...</div></div>`;

      try {
        const data = await aggregateAllData(type);
        _currentData = data;

        const periodLabel = type === 'weekly' ? '本周' : '本月';
        if (dateEl) dateEl.textContent = `${periodLabel} · ${formatShortDate(data.startDate)} - ${formatShortDate(data.endDate)}`;

        bodyEl.innerHTML = renderReportContent(data);
        loadAISummary(data);
      } catch (err) {
        console.error('[Review/Report] 数据加载失败:', err);
        bodyEl.innerHTML = `<div class="review-empty"><div class="review-empty-icon">😵</div><div class="review-empty-text">数据加载失败，请重试</div></div>`;
      }
    }

    async function loadAISummary(data) {
      const aiContentEl = document.getElementById('review-ai-content');
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
        aiContentEl.innerHTML = '<div class="report-ai-unavailable">AI 总结暂不可用</div>';
      }
    }

    function openExport() {
      if (!_currentData) return;
      const markdown = generateMarkdown(_currentData, _aiSummaryText);
      const periodLabel = _currentType === 'weekly' ? '周报' : '月报';

      const overlay = document.getElementById('review-export-overlay');
      const textarea = document.getElementById('review-export-textarea');
      const titleEl = document.getElementById('review-export-title');
      if (!overlay || !textarea) return;

      if (titleEl) titleEl.textContent = `📤 导出${periodLabel}`;
      textarea.value = markdown;
      overlay.style.display = 'flex';
      _exportOverlayEl = overlay;
    }

    function closeExport() {
      if (_exportOverlayEl) {
        _exportOverlayEl.style.display = 'none';
        _exportOverlayEl = null;
      }
    }

    function switchType(type) {
      if (type === _currentType) return;
      // 更新按钮状态
      document.querySelectorAll('.review-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
      });
      loadReport(type);
    }

    function init() {
      console.log('[Review/Report] 报吀子模块初始化');

      // 类型切换按钮
      document.querySelectorAll('.review-type-btn').forEach(btn => {
        _bindEvent(btn, 'click', () => switchType(btn.dataset.type));
      });

      // 导出按钮
      const exportBtn = document.getElementById('review-export-btn');
      _bindEvent(exportBtn, 'click', openExport);

      // 导出面板关闭
      const exportClose = document.getElementById('review-export-close');
      const exportCancel = document.getElementById('review-export-cancel');
      _bindEvent(exportClose, 'click', closeExport);
      _bindEvent(exportCancel, 'click', closeExport);

      // 导出面板复制
      const exportCopy = document.getElementById('review-export-copy');
      _bindEvent(exportCopy, 'click', async () => {
        const textarea = document.getElementById('review-export-textarea');
        if (textarea) {
          try {
            await navigator.clipboard.writeText(textarea.value);
            if (window.App) window.App?.showToast('已复制到剪贴板 ✅');
          } catch (e) {
            textarea.select();
            document.execCommand('copy');
            if (window.App) window.App?.showToast('已复制到剪贴板 ✅');
          }
        }
      });

      // 点击遮罩关闭导出
      const overlay = document.getElementById('review-export-overlay');
      _bindEvent(overlay, 'click', (e) => { if (e.target === overlay) closeExport(); });

      // 初始加载周报
      loadReport('weekly');
    }

    function destroy() {
      closeExport();
      _currentData = null;
      _aiSummaryText = '';
    }

    return { init, destroy, loadReport, openExport };
  })();

  // ====================================================
  //  模板子模块（原 templates_module.js 核心逻辑）
  // ====================================================
  const TemplatesSub = (() => {
    let _currentYear = new Date().getFullYear();
    let _currentMonth = new Date().getMonth() + 1;
    let _currentReport = null;

    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function renderTemplateCards() {
      const grid = document.getElementById('review-templates-grid');
      if (!grid) return;
      const templates = window.Templates?.getTemplates();
      if (!templates) return;
      grid.innerHTML = templates.map(tpl => `
        <div class="template-card" data-template-id="${tpl.id}" style="--card-color: ${tpl.color}; --card-color-light: ${tpl.colorLight};">
          <span class="template-card-icon">${tpl.icon}</span>
          <h3 class="template-card-name">${tpl.name}</h3>
          <p class="template-card-desc">${tpl.description}</p>
        </div>
      `).join('');

      grid.querySelectorAll('.template-card').forEach(card => {
        _bindEvent(card, 'click', () => {
          const templateId = card.dataset.templateId;
          generateAndShowReport(templateId);
        });
      });
    }

    function updateMonthDisplay() {
      const monthEl = document.getElementById('review-tpl-current-month');
      if (monthEl) monthEl.textContent = `${_currentYear}年${_currentMonth}月`;
    }

    function bindEvents() {
      const prevBtn = document.getElementById('review-tpl-prev-month');
      const nextBtn = document.getElementById('review-tpl-next-month');
      if (prevBtn) _bindEvent(prevBtn, 'click', () => {
        _currentMonth--;
        if (_currentMonth < 1) { _currentMonth = 12; _currentYear--; }
        updateMonthDisplay();
        loadHistory();
      });
      if (nextBtn) _bindEvent(nextBtn, 'click', () => {
        _currentMonth++;
        if (_currentMonth > 12) { _currentMonth = 1; _currentYear++; }
        updateMonthDisplay();
        loadHistory();
      });

      const backBtn = document.getElementById('review-tpl-back-btn');
      _bindEvent(backBtn, 'click', () => showListView());

      const exportMd = document.getElementById('review-tpl-export-md');
      const exportJson = document.getElementById('review-tpl-export-json');
      const saveBtn = document.getElementById('review-tpl-save-report');

      if (exportMd) _bindEvent(exportMd, 'click', () => {
        if (_currentReport) {
          collectUserInputs();
          const md = window.Templates?.exportMarkdown(_currentReport);
          downloadFile(md, `${_currentReport.templateName}_${_currentReport.monthStr}.md`, 'text/markdown');
        }
      });
      if (exportJson) _bindEvent(exportJson, 'click', () => {
        if (_currentReport) {
          collectUserInputs();
          const json = window.Templates?.exportJSON(_currentReport);
          downloadFile(json, `${_currentReport.templateName}_${_currentReport.monthStr}.json`, 'application/json');
        }
      });
      if (saveBtn) _bindEvent(saveBtn, 'click', async () => {
        if (_currentReport) {
          collectUserInputs();
          try {
            await window.Templates?.saveReport(_currentReport);
            if (window.App) window.App?.showToast('报告已保存 ✅');
            loadHistory();
          } catch (err) {
            if (window.App) window.App?.showToast('保存失败 ❌');
          }
        }
      });

      const startSummaryBtn = document.getElementById('review-tpl-start-summary');
      if (startSummaryBtn) _bindEvent(startSummaryBtn, 'click', () => {
        generateAndShowReport('monthly_summary');
      });
    }

    async function generateAndShowReport(templateId) {
      const contentEl = document.getElementById('review-tpl-report-content');
      const listView = document.getElementById('review-templates-list-view');
      const detailView = document.getElementById('review-templates-detail-view');
      if (!contentEl || !listView || !detailView) return;

      listView.style.display = 'none';
      detailView.style.display = '';
      contentEl.innerHTML = `<div class="templates-loading"><div class="templates-loading-spinner"></div><p>正在生成报告...</p></div>`;

      try {
        const report = await window.Templates?.generateReport(templateId, _currentYear, _currentMonth);
        _currentReport = report;
        renderReportDetail(report);
      } catch (err) {
        console.error('[Review/Templates] 生成报告失败:', err);
        contentEl.innerHTML = `<div class="report-no-data">
          <span class="report-no-data-icon">❌</span>
          <p class="report-no-data-text">报告生成失败</p>
          <p class="report-no-data-hint">${err.message || '请重试'}</p>
        </div>`;
      }
    }

    function renderReportDetail(report) {
      const contentEl = document.getElementById('review-tpl-report-content');
      if (!contentEl) return;
      const template = window.Templates?.getTemplate(report.templateId);
      if (!template) return;

      const data = report.data || {};
      const hasData = report.hasData;
      let html = '';

      html += `<div class="report-content-card">
        <h2 class="report-content-title">${template.icon} ${template.name}</h2>
        <p class="report-content-subtitle">${report.monthStr} · 数据已自动从各模块统计</p>`;

      if (!hasData) {
        html += `<div class="report-no-data">
          <span class="report-no-data-icon">📭</span>
          <p class="report-no-data-text">本月暂无相关数据</p>
          <p class="report-no-data-hint">先去对应模块记录一些数据，再来生成报告吧</p>
        </div>`;
      } else {
        html += `<div class="report-data-list">`;
        for (const field of template.fields) {
          const value = data[field.key];
          if (value === undefined || value === null || value === '') continue;
          let display = value;
          let highlightClass = '';
          if (field.type === 'currency') { display = `¥${Number(value).toLocaleString()}`; highlightClass = ' highlight'; }
          else if (field.type === 'percent') { display = `${value}%`; highlightClass = ' highlight'; }
          html += `<div class="report-data-item">
            <span class="report-data-label">${field.label}</span>
            <span class="report-data-value${highlightClass}">${escapeHtml(String(display))}</span>
          </div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;

      if (report.aiAnalysis) {
        html += `<div class="report-content-card">
          <div class="report-ai-analysis">
            <div class="report-ai-analysis-header">🤖 AI 分析</div>
            <div class="report-ai-analysis-content">${escapeHtml(report.aiAnalysis)}</div>
          </div>
        </div>`;
      }

      html += `<div class="report-content-card">
        <div class="report-user-input-section"><h4>✍️ 个人反思与规划</h4>`;
      const existingInputs = report.userInputs || {};
      for (const field of template.fields) {
        if (field.type === 'textarea') {
          html += `<div class="report-input-group">
            <label class="report-input-label">${field.label}</label>
            <textarea class="report-input-field" data-field-key="${field.key}" placeholder="写下你的思考...">${escapeHtml(existingInputs[field.key] || '')}</textarea>
          </div>`;
        } else if (field.type !== 'currency' && field.type !== 'percent' && field.type !== 'number') {
          html += `<div class="report-input-group">
            <label class="report-input-label">${field.label}</label>
            <input class="report-input-field" type="text" data-field-key="${field.key}" placeholder="填写..." value="${escapeHtml(existingInputs[field.key] || '')}">
          </div>`;
        }
      }
      html += `</div></div>`;

      contentEl.innerHTML = html;
    }

    function collectUserInputs() {
      if (!_currentReport) return;
      const inputs = document.querySelectorAll('#review-tpl-report-content .report-input-field');
      const userInputs = _currentReport.userInputs || {};
      inputs.forEach(input => {
        const key = input.dataset.fieldKey;
        if (key && input.value.trim()) userInputs[key] = input.value.trim();
      });
      _currentReport.userInputs = userInputs;
    }

    function showListView() {
      const listView = document.getElementById('review-templates-list-view');
      const detailView = document.getElementById('review-templates-detail-view');
      if (listView) listView.style.display = '';
      if (detailView) detailView.style.display = 'none';
      _currentReport = null;
    }

    async function loadHistory() {
      const listEl = document.getElementById('review-tpl-history-list');
      if (!listEl) return;
      try {
        const reports = await window.Templates?.getHistory(_currentYear);
        if (!reports || reports.length === 0) {
          listEl.innerHTML = `<div class="report-history-empty"><p>还没有生成过报告</p><p style="font-size:12px;color:var(--text-muted,#ccc);">点击上方模板卡片开始你的第一次复盘吧</p></div>`;
          return;
        }
        listEl.innerHTML = reports.map(r => `
          <div class="report-history-item" data-report-idx="${r.id}">
            <div class="report-history-item-left">
              <span class="report-history-item-icon">${r.templateIcon || '📊'}</span>
              <div class="report-history-item-info">
                <h4>${escapeHtml(r.templateName || '报告')}</h4>
                <p>${r.monthStr} · ${new Date(r.createdAt).toLocaleDateString('zh-CN')}</p>
              </div>
            </div>
            <span class="report-history-item-arrow">›</span>
          </div>
        `).join('');

        listEl.querySelectorAll('.report-history-item').forEach(item => {
          _bindEvent(item, 'click', async () => {
            const reportId = item.dataset.reportIdx;
            const allReports = await window.Templates?.getHistory();
            const report = allReports.find(r => String(r.id) === String(reportId));
            if (report) {
              _currentReport = report;
              const listView = document.getElementById('review-templates-list-view');
              const detailView = document.getElementById('review-templates-detail-view');
              if (listView) listView.style.display = 'none';
              if (detailView) detailView.style.display = '';
              renderReportDetail(report);
            }
          });
        });
      } catch (err) {
        console.error('[Review/Templates] 加载历史失败:', err);
        listEl.innerHTML = '<div class="report-history-empty">加载失败</div>';
      }
    }

    async function checkMonthEndReminder() {
      const reminderCard = document.getElementById('review-tpl-reminder-card');
      if (!reminderCard) return;
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const today = now.getDate();
      const lastDay = new Date(year, month + 1, 0).getDate();
      const isNearMonthEnd = today >= lastDay - 2;
      if (isNearMonthEnd) reminderCard.classList.remove('hidden');
      else reminderCard.classList.add('hidden');
    }

    function downloadFile(content, filename, mimeType) {
      const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function init() {
      console.log('[Review/Templates] 模板子模块初始化');
      renderTemplateCards();
      updateMonthDisplay();
      bindEvents();
      loadHistory();
      checkMonthEndReminder();
    }

    function destroy() {
      _currentReport = null;
    }

    return { init, destroy };
  })();

  // ====================================================
  //  主模块（Tab 切换）
  // ====================================================

  function switchTab(tabName) {
    if (tabName === _currentTab) return;
    _currentTab = tabName;

    // 更新 Tab 按钮状态
    document.querySelectorAll('.review-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // 更新面板
    document.querySelectorAll('.review-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tabName);
    });

    // 初始化对应子模块
    if (tabName === 'report') {
      ReportSub.init();
    } else if (tabName === 'templates') {
      TemplatesSub.init();
    }
  }

  function bindTabEvents() {
    document.querySelectorAll('.review-tab').forEach(tab => {
      _bindEvent(tab, 'click', () => switchTab(tab.dataset.tab));
    });
  }

  async function init() {
    console.log('[Review] 复盘模块初始化');
    bindTabEvents();

    // 默认先初始化报告 Tab
    ReportSub.init();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch (e) {}
    });
    _eventListeners = [];

    ReportSub.destroy();
    TemplatesSub.destroy();

    console.log('[Review] 复盘模块已销毁');
  }

  return { init, destroy };
})();
