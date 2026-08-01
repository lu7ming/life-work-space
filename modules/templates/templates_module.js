/**
 * templates_module.js - 模板页面交互逻辑
 * 人生工作台 · 复盘模板 UI 控制
 */

const TemplatesModule = (() => {
  const { escapeHtml } = AppUtils;

  // ===== 状态 =====
  let _currentYear = new Date().getFullYear();
  let _currentMonth = new Date().getMonth() + 1;
  let _currentReport = null;

  /**
   * 初始化模板页面
   */
  async function init() {
    console.log('[TemplatesModule] 初始化模板页面...');
    try {
      renderTemplateCards();
      updateMonthDisplay();
      bindEvents();
      await loadHistory();
      checkMonthEndReminder();
    } catch (err) {
      console.error('[TemplatesModule] 初始化失败:', err);
    }
  }

  /**
   * 渲染模板卡片
   */
  function renderTemplateCards() {
    const grid = document.getElementById('templates-grid');
    if (!grid) return;

    const templates = Templates.getTemplates();
    grid.innerHTML = templates.map(tpl => `
      <div class="template-card" data-template-id="${tpl.id}" style="--card-color: ${tpl.color}; --card-color-light: ${tpl.colorLight};">
        <span class="template-card-icon">${tpl.icon}</span>
        <h3 class="template-card-name">${tpl.name}</h3>
        <p class="template-card-desc">${tpl.description}</p>
      </div>
    `).join('');

    // 绑定点击事件
    grid.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        const templateId = card.dataset.templateId;
        generateAndShowReport(templateId);
      });
    });
  }

  /**
   * 更新月份显示
   */
  function updateMonthDisplay() {
    const monthEl = document.getElementById('tpl-current-month');
    if (monthEl) {
      monthEl.textContent = `${_currentYear}年${_currentMonth}月`;
    }
  }

  /**
   * 绑定页面事件
   */
  function bindEvents() {
    // 月份切换
    const prevBtn = document.getElementById('tpl-prev-month');
    const nextBtn = document.getElementById('tpl-next-month');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        _currentMonth--;
        if (_currentMonth < 1) { _currentMonth = 12; _currentYear--; }
        updateMonthDisplay();
        loadHistory();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        _currentMonth++;
        if (_currentMonth > 12) { _currentMonth = 1; _currentYear++; }
        updateMonthDisplay();
        loadHistory();
      });
    }

    // 返回按钮
    const backBtn = document.getElementById('tpl-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => showListView());
    }

    // 导出按钮
    const exportMd = document.getElementById('tpl-export-md');
    const exportJson = document.getElementById('tpl-export-json');
    const saveBtn = document.getElementById('tpl-save-report');

    if (exportMd) {
      exportMd.addEventListener('click', () => {
        if (_currentReport) {
          // 先收集用户输入
          collectUserInputs();
          const md = Templates.exportMarkdown(_currentReport);
          downloadFile(md, `${_currentReport.templateName}_${_currentReport.monthStr}.md`, 'text/markdown');
        }
      });
    }

    if (exportJson) {
      exportJson.addEventListener('click', () => {
        if (_currentReport) {
          collectUserInputs();
          const json = Templates.exportJSON(_currentReport);
          downloadFile(json, `${_currentReport.templateName}_${_currentReport.monthStr}.json`, 'application/json');
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (_currentReport) {
          collectUserInputs();
          try {
            await Templates.saveReport(_currentReport);
            if (typeof App !== 'undefined' && App.showToast) {
              App.showToast('报告已保存 ✅');
            }
            loadHistory();
          } catch (err) {
            if (typeof App !== 'undefined' && App.showToast) {
              App.showToast('保存失败 ❌');
            }
          }
        }
      });
    }

    // 开始总结按钮（月末提醒）
    const startSummaryBtn = document.getElementById('tpl-start-summary');
    if (startSummaryBtn) {
      startSummaryBtn.addEventListener('click', () => {
        generateAndShowReport('monthly_summary');
      });
    }
  }

  /**
   * 生成并展示报告
   */
  async function generateAndShowReport(templateId) {
    const contentEl = document.getElementById('tpl-report-content');
    const listView = document.getElementById('templates-list-view');
    const detailView = document.getElementById('templates-detail-view');

    if (!contentEl || !listView || !detailView) return;

    // 切换到详情视图，显示加载状态
    listView.style.display = 'none';
    detailView.classList.add('active');
    contentEl.innerHTML = `
      <div class="templates-loading">
        <div class="templates-loading-spinner"></div>
        <p>正在生成报告...</p>
      </div>
    `;

    try {
      const report = await Templates.generateReport(templateId, _currentYear, _currentMonth);
      _currentReport = report;
      renderReportDetail(report);
    } catch (err) {
      console.error('[TemplatesModule] 生成报告失败:', err);
      contentEl.innerHTML = `
        <div class="report-no-data">
          <span class="report-no-data-icon">❌</span>
          <p class="report-no-data-text">报告生成失败</p>
          <p class="report-no-data-hint">${err.message || '请重试'}</p>
        </div>
      `;
    }
  }

  /**
   * 渲染报告详情
   */
  function renderReportDetail(report) {
    const contentEl = document.getElementById('tpl-report-content');
    if (!contentEl) return;

    const template = Templates.getTemplate(report.templateId);
    if (!template) return;

    const data = report.data || {};
    const hasData = report.hasData;

    let html = '';

    // 标题卡片
    html += `
      <div class="report-content-card">
        <h2 class="report-content-title">
          ${template.icon} ${template.name}
        </h2>
        <p class="report-content-subtitle">${report.monthStr} · 数据已自动从各模块统计</p>
    `;

    if (!hasData) {
      html += `
        <div class="report-no-data">
          <span class="report-no-data-icon">📭</span>
          <p class="report-no-data-text">本月暂无相关数据</p>
          <p class="report-no-data-hint">先去对应模块记录一些数据，再来生成报告吧</p>
        </div>
      `;
    } else {
      // 数据统计列表
      html += `<div class="report-data-list">`;
      for (const field of template.fields) {
        const value = data[field.key];
        if (value === undefined || value === null || value === '') continue;

        let display = value;
        let highlightClass = '';
        if (field.type === 'currency') {
          display = `¥${Number(value).toLocaleString()}`;
          highlightClass = ' highlight';
        } else if (field.type === 'percent') {
          display = `${value}%`;
          highlightClass = ' highlight';
        }

        html += `
          <div class="report-data-item">
            <span class="report-data-label">${field.label}</span>
            <span class="report-data-value${highlightClass}">${escapeHtml(String(display))}</span>
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`;

    // AI 分析卡片
    if (report.aiAnalysis) {
      html += `
        <div class="report-content-card">
          <div class="report-ai-analysis">
            <div class="report-ai-analysis-header">
              🤖 AI 分析
            </div>
            <div class="report-ai-analysis-content">
              ${escapeHtml(report.aiAnalysis)}
            </div>
          </div>
        </div>
      `;
    }

    // 用户填写区域
    html += `
      <div class="report-content-card">
        <div class="report-user-input-section">
          <h4>✍️ 个人反思与规划</h4>
    `;

    const existingInputs = report.userInputs || {};
    for (const field of template.fields) {
      if (field.type === 'textarea') {
        html += `
          <div class="report-input-group">
            <label class="report-input-label">${field.label}</label>
            <textarea class="report-input-field" data-field-key="${field.key}" placeholder="写下你的思考...">${escapeHtml(existingInputs[field.key] || '')}</textarea>
          </div>
        `;
      } else {
        html += `
          <div class="report-input-group">
            <label class="report-input-label">${field.label}</label>
            <input class="report-input-field" type="text" data-field-key="${field.key}" placeholder="填写..." value="${escapeHtml(existingInputs[field.key] || '')}">
          </div>
        `;
      }
    }

    html += `
        </div>
      </div>
    `;

    contentEl.innerHTML = html;
  }

  /**
   * 收集用户输入
   */
  function collectUserInputs() {
    if (!_currentReport) return;

    const inputs = document.querySelectorAll('#tpl-report-content .report-input-field');
    const userInputs = _currentReport.userInputs || {};

    inputs.forEach(input => {
      const key = input.dataset.fieldKey;
      if (key && input.value.trim()) {
        userInputs[key] = input.value.trim();
      }
    });

    _currentReport.userInputs = userInputs;
  }

  /**
   * 显示列表视图
   */
  function showListView() {
    const listView = document.getElementById('templates-list-view');
    const detailView = document.getElementById('templates-detail-view');

    if (listView) listView.style.display = '';
    if (detailView) detailView.classList.remove('active');

    _currentReport = null;
  }

  /**
   * 加载历史报告列表
   */
  async function loadHistory() {
    const listEl = document.getElementById('tpl-history-list');
    if (!listEl) return;

    try {
      const reports = await Templates.getHistory(_currentYear);

      if (reports.length === 0) {
        listEl.innerHTML = `
          <div class="report-history-empty">
            <p>还没有生成过报告</p>
            <p style="font-size:12px;color:var(--text-muted,#ccc);">点击上方模板卡片开始你的第一次复盘吧</p>
          </div>
        `;
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

      // 绑定点击
      listEl.querySelectorAll('.report-history-item').forEach(item => {
        item.addEventListener('click', async () => {
          const reportId = item.dataset.reportIdx;
          // 从历史记录中找到并展示
          const allReports = await Templates.getHistory();
          const report = allReports.find(r => String(r.id) === String(reportId));
          if (report) {
            _currentReport = report;
            const listView = document.getElementById('templates-list-view');
            const detailView = document.getElementById('templates-detail-view');
            if (listView) listView.style.display = 'none';
            if (detailView) detailView.classList.add('active');
            renderReportDetail(report);
          }
        });
      });
    } catch (err) {
      console.error('[TemplatesModule] 加载历史失败:', err);
      listEl.innerHTML = '<div class="report-history-empty">加载失败</div>';
    }
  }

  /**
   * 检查月末提醒
   */
  async function checkMonthEndReminder() {
    const reminderCard = document.getElementById('tpl-reminder-card');
    if (!reminderCard) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const isMonthEnd = today === lastDay;

    // 月末前3天也显示提醒
    const isNearMonthEnd = today >= lastDay - 2;

    if (isNearMonthEnd) {
      reminderCard.classList.remove('hidden');
    } else {
      reminderCard.classList.add('hidden');
    }
  }

  /**
   * 下载文件
   */
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * HTML 转义
   */



  // ===== 模块生命周期 =====
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
    console.log('[TemplatesModule] 模块已销毁');
  }

  return {
    init,
    destroy
  };
})();
