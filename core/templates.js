/**
 * templates.js - 月度复盘模板系统
 * 人生工作台 · 可复用记录/复盘模板
 */
import { Storage } from './storage.js';
import { NotificationEngine } from './notifications.js';


export const Templates = (() => {
  // ===== 模板定义 =====
  const TEMPLATES = {
    monthly_tasks: {
      id: 'monthly_tasks',
      name: '月度任务复盘',
      icon: '📋',
      module: 'tasks',
      color: '#E74C3C',
      colorLight: '#FDECEA',
      description: '回顾本月任务完成情况、逾期分析与下月规划',
      fields: [
        { key: 'totalTasks', label: '本月完成任务数', type: 'number' },
        { key: 'overdueTasks', label: '逾期任务数', type: 'number' },
        { key: 'completionRate', label: '完成率', type: 'percent' },
        { key: 'trend', label: '完成率趋势', type: 'text' },
        { key: 'topThreeNext', label: '下月最重要的3个任务', type: 'textarea' }
      ]
    },
    monthly_habits: {
      id: 'monthly_habits',
      name: '月度习惯复盘',
      icon: '✅',
      module: 'habits',
      color: '#27AE60',
      colorLight: '#E8F8F0',
      description: '分析各习惯打卡率、连续天数与调整计划',
      fields: [
        { key: 'habitRates', label: '各习惯打卡率', type: 'text' },
        { key: 'longestStreak', label: '最长连续天数', type: 'number' },
        { key: 'breakReason', label: '断签原因分析', type: 'textarea' },
        { key: 'adjustments', label: '下月要调整的习惯', type: 'textarea' }
      ]
    },
    monthly_finance: {
      id: 'monthly_finance',
      name: '月度财务复盘',
      icon: '💰',
      module: 'finance',
      color: '#F5A623',
      colorLight: '#FFF8E8',
      description: '收支统计、分类占比与下月预算建议',
      fields: [
        { key: 'totalIncome', label: '本月总收入', type: 'currency' },
        { key: 'totalExpense', label: '本月总支出', type: 'currency' },
        { key: 'netBalance', label: '净结余', type: 'currency' },
        { key: 'expenseBreakdown', label: '支出分类占比', type: 'text' },
        { key: 'vsLastMonth', label: '与上月对比', type: 'text' },
        { key: 'budgetNext', label: '下月预算建议', type: 'text' }
      ]
    },
    monthly_study: {
      id: 'monthly_study',
      name: '月度学习复盘',
      icon: '📚',
      module: 'study',
      color: '#3498DB',
      colorLight: '#EBF5FB',
      description: '学习内容、时长统计与下月学习计划',
      fields: [
        { key: 'learnedWhat', label: '本月学习了什么', type: 'text' },
        { key: 'totalHours', label: '学习时长统计', type: 'text' },
        { key: 'skillProgress', label: '技能进步评估', type: 'textarea' },
        { key: 'planNext', label: '下月学习计划', type: 'textarea' }
      ]
    },
    monthly_health: {
      id: 'monthly_health',
      name: '月度健康复盘',
      icon: '💪',
      module: 'health',
      color: '#9B59B6',
      colorLight: '#F5EEF8',
      description: '运动统计、睡眠数据与下月健康目标',
      fields: [
        { key: 'exerciseStats', label: '运动次数和类型统计', type: 'text' },
        { key: 'sleepSummary', label: '睡眠数据汇总', type: 'text' },
        { key: 'bodyChanges', label: '身体状况变化', type: 'textarea' },
        { key: 'goalsNext', label: '下月健康目标', type: 'textarea' }
      ]
    },
    monthly_summary: {
      id: 'monthly_summary',
      name: '月度总总结',
      icon: '🌟',
      module: 'general',
      color: '#D4BA9F',
      colorLight: '#EEE9E3',
      description: '本月最满意的事、最大挑战与一句话总结',
      fields: [
        { key: 'topThree', label: '本月最满意的3件事', type: 'textarea' },
        { key: 'biggestChallenge', label: '本月最大的挑战', type: 'textarea' },
        { key: 'wishNext', label: '下月最想做的事', type: 'textarea' },
        { key: 'oneSentence', label: '一句话总结本月', type: 'text' }
      ]
    }
  };

  // ===== 状态 =====
  let _initialized = false;

  /**
   * 初始化模板系统
   */
  async function init() {
    if (_initialized) return;
    _initialized = true;
    console.log('[Templates] 模板系统初始化完成');

    // 检查月末提醒
    checkMonthEnd();
  }

  /**
   * 检查今天是否是月末（31号或当月最后一天）
   * 如果是且本月还没提醒过，触发提醒
   */
  async function checkMonthEnd() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const today = now.getDate();

    // 计算本月最后一天
    const lastDay = new Date(year, month + 1, 0).getDate();
    const isMonthEnd = today === lastDay;

    if (!isMonthEnd) return;

    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const reminderKey = `template_reminder_${monthKey}`;

    // 已提醒过则跳过
    if (localStorage.getItem(reminderKey) === '1') return;

    // 标记已提醒
    localStorage.setItem(reminderKey, '1');

    // 写入通知
    try {
      await Storage.add('notifications', {
        type: 'template',
        title: '📊 月度复盘提醒',
        message: `${monthKey} 即将结束，是时候做月度复盘啦！回顾一下这个月的收获吧。`,
        icon: '📊',
        link: '#templates',
        read: false,
        createdAt: new Date().toISOString()
      });
      // 更新铃铛
      if (true) /* NotificationEngine always available via import */ {
        window.NotificationEngine?.updateBadge();
      }
      console.log('[Templates] 已触发月末复盘提醒');
    } catch (err) {
      console.error('[Templates] 发送月末提醒失败:', err);
    }
  }

  /**
   * 从 IndexedDB 读取对应模块的当月数据并统计
   */
  async function collectModuleData(moduleName, year, month) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const data = {};

    try {
      switch (moduleName) {
        case 'tasks': {
          const allTasks = await Storage.getAll('tasks');
          const monthTasks = allTasks.filter(t => {
            // 按完成日期或创建日期过滤
            const dateStr = t.completedAt || t.createdAt || t.date || '';
            return dateStr.startsWith(monthStr);
          });
          const doneTasks = monthTasks.filter(t => t.status === 'done' || t.status === 'completed');
          const todoTasks = monthTasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
          const overdueTasks = allTasks.filter(t =>
            t.dueDate && t.dueDate.startsWith(monthStr) && t.status !== 'done' && t.status !== 'completed'
          );
          const total = monthTasks.length;
          const done = doneTasks.length;
          const rate = total > 0 ? Math.round((done / total) * 100) : 0;

          // 趋势：对比近3个月
          const trends = [];
          for (let i = 0; i < 3; i++) {
            const d = new Date(year, month - 1 - i, 1);
            const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const mTasks = allTasks.filter(t => {
              const ds = t.completedAt || t.createdAt || t.date || '';
              return ds.startsWith(mStr);
            });
            const mDone = mTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
            const mRate = mTasks.length > 0 ? Math.round((mDone / mTasks.length) * 100) : 0;
            trends.unshift({ month: mStr, rate: mRate });
          }

          data.totalTasks = done;
          data.overdueTasks = overdueTasks.length;
          data.completionRate = rate;
          data.trend = trends.map(t => `${t.month}: ${t.rate}%`).join(' → ');
          data._hasData = total > 0;
          data._raw = { done, total, trends };
          break;
        }

        case 'habits': {
          const allCheckins = await Storage.getAll('checkins');
          const allHabits = await Storage.getAll('habits');
          const monthCheckins = allCheckins.filter(c => c.month === monthStr);

          if (allHabits.length === 0 && monthCheckins.length === 0) {
            data._hasData = false;
            break;
          }

          // 各习惯打卡率
          const habitRates = {};
          if (allHabits.length > 0) {
            for (const habit of allHabits) {
              const habitCheckins = monthCheckins.filter(c =>
                c.habits && c.habits.includes(habit.id)
              );
              const daysInMonth = new Date(year, month, 0).getDate();
              const rate = monthCheckins.length > 0
                ? Math.round((habitCheckins.length / monthCheckins.length) * 100)
                : 0;
              habitRates[habit.name || `习惯${habit.id}`] = rate;
            }
          }

          // 最长连续天数
          const dates = monthCheckins.map(c => c.date).sort();
          let maxStreak = 0, curStreak = 1;
          for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1]);
            const curr = new Date(dates[i]);
            const diff = (curr - prev) / (1000 * 60 * 60 * 24);
            if (diff === 1) { curStreak++; } else { maxStreak = Math.max(maxStreak, curStreak); curStreak = 1; }
          }
          if (dates.length > 0) maxStreak = Math.max(maxStreak, curStreak);

          data.habitRates = Object.entries(habitRates).map(([k, v]) => `${k}: ${v}%`).join('、') || '暂无数据';
          data.longestStreak = maxStreak;
          data.breakReason = '';
          data.adjustments = '';
          data._hasData = monthCheckins.length > 0 || allHabits.length > 0;
          data._raw = { habitRates, maxStreak };
          break;
        }

        case 'finance': {
          const monthFinance = await Storage.getByIndex('finance', 'month', monthStr);
          const income = monthFinance.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0);
          const expense = monthFinance.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0);
          const balance = income - expense;

          // 支出分类
          const expenseByCategory = {};
          monthFinance.filter(f => f.type === 'expense').forEach(f => {
            const cat = f.category || f.type || '其他';
            expenseByCategory[cat] = (expenseByCategory[cat] || 0) + (f.amount || 0);
          });

          // 上月数据
          const lastMonth = month === 1 ? 12 : month - 1;
          const lastYear = month === 1 ? year - 1 : year;
          const lastMonthStr = `${lastYear}-${String(lastMonth).padStart(2, '0')}`;
          const lastFinance = await Storage.getByIndex('finance', 'month', lastMonthStr);
          const lastIncome = lastFinance.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0);
          const lastExpense = lastFinance.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0);

          let vsLast = '';
          if (lastFinance.length > 0) {
            const expDiff = expense - lastExpense;
            const expPct = lastExpense > 0 ? Math.round((expDiff / lastExpense) * 100) : 0;
            vsLast = `收入: ¥${lastIncome} → ¥${income}，支出: ¥${lastExpense} → ¥${expense}`;
            if (expDiff > 0) vsLast += `（支出增加 ${expPct}%）`;
            else if (expDiff < 0) vsLast += `（支出减少 ${Math.abs(expPct)}%）`;
          } else {
            vsLast = '无上月数据';
          }

          data.totalIncome = income;
          data.totalExpense = expense;
          data.netBalance = balance;
          data.expenseBreakdown = Object.entries(expenseByCategory)
            .map(([k, v]) => `${k}: ¥${v}(${Math.round((v / expense) * 100) || 0}%)`)
            .join('、') || '暂无数据';
          data.vsLastMonth = vsLast;
          data.budgetNext = '';
          data._hasData = monthFinance.length > 0;
          data._raw = { income, expense, balance, expenseByCategory };
          break;
        }

        case 'study': {
          const allStudy = await Storage.getAll('study');
          const monthStudy = allStudy.filter(s => s.date && s.date.startsWith(monthStr));

          if (monthStudy.length === 0) {
            data._hasData = false;
            break;
          }

          const totalMinutes = monthStudy.reduce((s, r) => s + (r.minutes || 0), 0);
          const hours = Math.floor(totalMinutes / 60);
          const mins = totalMinutes % 60;

          // 学习内容汇总
          const subjects = {};
          monthStudy.forEach(s => {
            const sub = s.subject || s.course || s.title || '未分类';
            subjects[sub] = (subjects[sub] || 0) + (s.minutes || 0);
          });

          data.learnedWhat = Object.keys(subjects).join('、') || '暂无记录';
          data.totalHours = hours > 0 ? `${hours}小时${mins > 0 ? mins + '分钟' : ''}` : `${mins}分钟`;
          data.skillProgress = '';
          data.planNext = '';
          data._hasData = true;
          data._raw = { totalMinutes, subjects, recordCount: monthStudy.length };
          break;
        }

        case 'health': {
          const allHealth = await Storage.getAll('health');
          const monthHealth = allHealth.filter(h => h.date && h.date.startsWith(monthStr));

          if (monthHealth.length === 0) {
            data._hasData = false;
            break;
          }

          // 运动统计
          const exerciseTypes = {};
          let totalExercises = 0;
          let totalDuration = 0;
          monthHealth.forEach(h => {
            if (h.exercises && Array.isArray(h.exercises)) {
              h.exercises.forEach(e => {
                const type = e.type || e.name || '其他';
                exerciseTypes[type] = (exerciseTypes[type] || 0) + 1;
                totalExercises++;
                totalDuration += (e.duration || 0);
              });
            }
          });

          // 睡眠数据
          const sleepRecords = monthHealth.filter(h => h.sleepHours || h.sleep);
          const avgSleep = sleepRecords.length > 0
            ? (sleepRecords.reduce((s, h) => s + (h.sleepHours || h.sleep || 0), 0) / sleepRecords.length).toFixed(1)
            : null;

          data.exerciseStats = totalExercises > 0
            ? `${totalExercises}次运动，共${totalDuration}分钟。` +
              Object.entries(exerciseTypes).map(([k, v]) => `${k}:${v}次`).join('、')
            : '暂无运动记录';
          data.sleepSummary = avgSleep ? `平均睡眠 ${avgSleep} 小时（${sleepRecords.length}条记录）` : '暂无睡眠数据';
          data.bodyChanges = '';
          data.goalsNext = '';
          data._hasData = true;
          data._raw = { totalExercises, totalDuration, exerciseTypes, avgSleep };
          break;
        }

        case 'general': {
          // 通用总结从各模块汇总关键数据
          const [tasks, habits, finance, study, health] = await Promise.all([
            Storage.getAll('tasks').catch(() => []),
            Storage.getAll('habits').catch(() => []),
            Storage.getAll('finance').catch(() => []),
            Storage.getAll('study').catch(() => []),
            Storage.getAll('health').catch(() => [])
          ]);

          const monthTaskCount = tasks.filter(t => {
            const ds = t.completedAt || t.createdAt || t.date || '';
            return ds.startsWith(monthStr);
          }).filter(t => t.status === 'done' || t.status === 'completed').length;

          const monthFinanceData = finance.filter(f => f.month === monthStr);
          const monthIncome = monthFinanceData.filter(f => f.type === 'income').reduce((s, f) => s + (f.amount || 0), 0);
          const monthExpense = monthFinanceData.filter(f => f.type === 'expense').reduce((s, f) => s + (f.amount || 0), 0);

          const monthStudyMins = study.filter(s => s.date && s.date.startsWith(monthStr))
            .reduce((s, r) => s + (r.minutes || 0), 0);

          data.topThree = '';
          data.biggestChallenge = '';
          data.wishNext = '';
          data.oneSentence = '';
          data._hasData = true;
          data._summary = {
            completedTasks: monthTaskCount,
            income: monthIncome,
            expense: monthExpense,
            balance: monthIncome - monthExpense,
            studyHours: Math.floor(monthStudyMins / 60)
          };
          break;
        }

        default:
          data._hasData = false;
      }
    } catch (err) {
      console.error('[Templates] 收集模块数据失败:', moduleName, err);
      data._hasData = false;
      data._error = err.message;
    }

    return data;
  }

  /**
   * 根据模板 ID 和年月生成复盘报告
   * @param {string} templateId - 模板 ID
   * @param {number} year - 年
   * @param {number} month - 月 (1-12)
   * @returns {Object} 格式化的报告对象
   */
  async function generateReport(templateId, year, month) {
    const template = TEMPLATES[templateId];
    if (!template) {
      throw new Error(`未知模板: ${templateId}`);
    }

    const moduleData = await collectModuleData(template.module, year, month);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    // 尝试 AI 分析（如果有 DeepSeek token）
    let aiAnalysis = null;
    try {
      const setting = await Storage.get('settings', 'deepseek_token');
      if (setting && setting.value) {
        aiAnalysis = await generateAIAnalysis(template, moduleData, year, month, setting.value);
      }
    } catch (e) {
      console.warn('[Templates] AI 分析跳过:', e.message);
    }

    const report = {
      id: `report_${templateId}_${monthStr}_${Date.now()}`,
      templateId,
      templateName: template.name,
      templateIcon: template.icon,
      year,
      month,
      monthStr,
      data: moduleData,
      aiAnalysis,
      hasData: moduleData._hasData !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userInputs: {}
    };

    return report;
  }

  /**
   * AI 生成分析文字（可选）
   */
  async function generateAIAnalysis(template, moduleData, year, month, token) {
    if (!token || !moduleData._hasData) return null;

    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const prompt = `你是人生工作台的AI助手。请根据以下${year}年${month}月的${template.name}数据，写一段简短的复盘分析（100字以内）。

模板：${template.name}
描述：${template.description}
数据摘要：${JSON.stringify(moduleData._raw || moduleData._summary || {})}

要求：
1. 分析这个月的表现亮点和不足
2. 给出1-2条具体的改进建议
3. 语气温暖鼓励，像一个贴心的朋友
4. 直接输出分析文字，不要加标题或格式`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 300
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) return null;

      const data = await resp.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.warn('[Templates] AI 分析失败:', e.message);
      return null;
    }
  }

  /**
   * 保存报告到 IndexedDB（存入 journal 表）
   */
  async function saveReport(report) {
    try {
      // 存入 journal 表，type 为 'template_report'
      const entry = {
        date: report.monthStr,
        type: 'template_report',
        title: `${report.templateIcon} ${report.templateName} - ${report.monthStr}`,
        content: report.userInputs || {},
        reportData: report,
        createdAt: report.createdAt,
        updatedAt: new Date().toISOString()
      };

      if (report.journalId) {
        // 更新已有
        entry.id = report.journalId;
        await Storage.put('journal', entry);
      } else {
        // 新增
        const id = await Storage.add('journal', entry);
        report.journalId = id;
        entry.id = id;
        await Storage.put('journal', entry);
      }

      report.updatedAt = new Date().toISOString();
      console.log('[Templates] 报告已保存:', report.templateId, report.monthStr);
      return report;
    } catch (err) {
      console.error('[Templates] 保存报告失败:', err);
      throw err;
    }
  }

  /**
   * 获取历史报告列表
   * @param {number} [year] - 可选，指定年份
   */
  async function getHistory(year) {
    try {
      const allJournal = await Storage.getAll('journal');
      let reports = allJournal
        .filter(j => j.type === 'template_report')
        .map(j => ({
          id: j.id,
          journalId: j.id,
          ...j.reportData,
          title: j.title,
          content: j.content
        }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      if (year) {
        reports = reports.filter(r => r.year === year);
      }

      return reports;
    } catch (err) {
      console.error('[Templates] 获取历史报告失败:', err);
      return [];
    }
  }

  /**
   * 获取所有模板定义
   */
  function getTemplates() {
    return Object.values(TEMPLATES);
  }

  /**
   * 获取单个模板定义
   */
  function getTemplate(templateId) {
    return TEMPLATES[templateId] || null;
  }

  /**
   * 导出报告为 Markdown
   */
  function exportMarkdown(report) {
    if (!report) return '';
    const template = TEMPLATES[report.templateId];
    if (!template) return '';

    let md = `# ${template.icon} ${template.name} - ${report.monthStr}\n\n`;
    md += `> 生成时间：${new Date(report.createdAt).toLocaleString('zh-CN')}\n\n`;

    if (report.aiAnalysis) {
      md += `## 🤖 AI 分析\n\n${report.aiAnalysis}\n\n`;
    }

    md += `## 📊 数据详情\n\n`;

    const data = report.data || {};
    for (const field of template.fields) {
      const value = data[field.key];
      if (value !== undefined && value !== null && value !== '') {
        let display = value;
        if (field.type === 'currency') display = `¥${value.toLocaleString()}`;
        else if (field.type === 'percent') display = `${value}%`;
        md += `- **${field.label}**：${display}\n`;
      }
    }

    // 用户填写的内容
    if (report.userInputs && Object.keys(report.userInputs).length > 0) {
      md += `\n## ✍️ 个人反思\n\n`;
      for (const field of template.fields) {
        const userInput = report.userInputs[field.key];
        if (userInput) {
          md += `### ${field.label}\n${userInput}\n\n`;
        }
      }
    }

    if (!report.hasData) {
      md += `\n---\n⚠️ 本月暂无相关数据记录\n`;
    }

    return md;
  }

  /**
   * 导出报告为 JSON
   */
  function exportJSON(report) {
    return JSON.stringify(report, null, 2);
  }

  return {
    init,
    checkMonthEnd,
    generateReport,
    saveReport,
    getHistory,
    getTemplates,
    getTemplate,
    collectModuleData,
    exportMarkdown,
    exportJSON
  };
})();
