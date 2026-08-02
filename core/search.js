/**
 * search.js - 全局搜索模块
 * 人生工作台 · 跨模块关键词搜索 + 快捷指令导航
 */
import { AppUtils } from './utils.js';
import { Storage } from './storage.js';
import { Router } from './router.js';


export const SearchModule = (() => {
  const { escapeHtml } = AppUtils;

  let panelEl = null;
  let inputEl = null;
  let resultsEl = null;
  let hintEl = null;
  let debounceTimer = null;
  let commandMode = false; // 是否处于指令模式
  let activeCommandIdx = 0; // 当前高亮的指令索引

  // ===== 快捷指令映射表 =====
  const COMMANDS = [
    { keys: ['总览', 'dashboard', 'overview', '今日'],  icon: '🏠', label: '今日总览',   route: 'dashboard' },
    { keys: ['习惯', 'habits', '打卡'],                  icon: '✅', label: '习惯打卡',   route: 'habits' },
    { keys: ['任务', 'tasks', 'todo'],                   icon: '📋', label: '任务',       route: 'tasks' },
    { keys: ['学习', 'study', 'learn'],                  icon: '📚', label: '学习',       route: 'study' },
    { keys: ['健康', 'health', '运动'],                  icon: '💪', label: '健康',       route: 'health' },
    { keys: ['财务', 'finance', '记账', '钱'],           icon: '💰', label: '财务',       route: 'finance' },
    { keys: ['日记', 'journal', '反思', '记录'],         icon: '📝', label: '记录与反思', route: 'journal' },
    { keys: ['生命树', 'lifetree', 'tree'],              icon: '🌳', label: '生命树',     route: 'lifetree' },
    { keys: ['关系', 'relations', 'contacts', '联系人'], icon: '🤝', label: '关系',       route: 'relations' },
    { keys: ['知识库', 'knowledge', '知识'],             icon: '🧠', label: '知识库',     route: 'knowledge' },
    { keys: ['目标', 'goals', 'goal'],                   icon: '🎯', label: '目标',       route: 'goals' },
  ];

  // 搜索范围定义
  const SCOPE = [
    { key: 'tasks',      label: '任务',       icon: '📋', route: 'tasks',    matchFn: (item, q) => (item.title || '').toLowerCase().includes(q) },
    { key: 'journal',    label: '日记与反思', icon: '📝', route: 'journal',  matchFn: (item, q) => (item.content || '').toLowerCase().includes(q) || (item.title || '').toLowerCase().includes(q) },
    { key: 'ideas',      label: '灵感',       icon: '💡', route: 'journal',  matchFn: (item, q) => (item.content || '').toLowerCase().includes(q) || (item.title || '').toLowerCase().includes(q) },
    { key: 'knowledge',  label: '知识库',     icon: '🧠', route: 'knowledge',matchFn: (item, q) => (item.title || '').toLowerCase().includes(q) || (item.content || '').toLowerCase().includes(q) },
    { key: 'contacts',   label: '联系人',     icon: '🤝', route: 'relations',matchFn: (item, q) => (item.name || '').toLowerCase().includes(q) },
  ];

  /**
   * 打开搜索面板
   */
  function open() {
    if (panelEl) {
      panelEl.classList.add('show');
      inputEl.focus();
      return;
    }
    buildPanel();
    document.body.appendChild(panelEl);
    requestAnimationFrame(() => panelEl.classList.add('show'));
    inputEl.focus();
  }

  /**
   * 关闭搜索面板
   */
  function close() {
    if (!panelEl) return;
    panelEl.classList.remove('show');
    inputEl.value = '';
    resultsEl.innerHTML = '';
    commandMode = false;
    activeCommandIdx = 0;
    if (hintEl) {
      hintEl.textContent = '输入关键词搜索 · 输入 / 使用快捷指令 · 点击结果跳转到对应模块';
    }
  }

  /**
   * 构建搜索面板 DOM
   */
  function buildPanel() {
    panelEl = document.createElement('div');
    panelEl.className = 'global-search-panel';
    panelEl.innerHTML = `
      <div class="global-search-backdrop"></div>
      <div class="global-search-container">
        <div class="global-search-header">
          <span class="global-search-icon">🔍</span>
          <input class="global-search-input" type="text" placeholder="搜索任务、日记、灵感、知识库、联系人..." autocomplete="off" />
          <button class="global-search-close" title="关闭">✕</button>
        </div>
        <div class="global-search-results"></div>
        <div class="global-search-hint">输入关键词搜索 · 输入 / 使用快捷指令 · 点击结果跳转到对应模块</div>
      </div>
    `;

    inputEl = panelEl.querySelector('.global-search-input');
    resultsEl = panelEl.querySelector('.global-search-results');
    hintEl = panelEl.querySelector('.global-search-hint');

    // 事件绑定
    _bindEvent(panelEl.querySelector('.global-search-backdrop'), 'click', close);
    _bindEvent(panelEl.querySelector('.global-search-close'), 'click', close);

    _bindEvent(inputEl, 'input', () => {
      clearTimeout(debounceTimer);
      const value = inputEl.value;
      
      // 检测是否进入指令模式
      if (value.startsWith('/')) {
        commandMode = true;
        activeCommandIdx = 0;
        renderCommands(value.slice(1).trim().toLowerCase());
      } else {
        if (commandMode) {
          commandMode = false;
          activeCommandIdx = 0;
        }
        debounceTimer = setTimeout(() => doSearch(value.trim()), 200);
      }
    });

    _bindEvent(inputEl, 'keydown', (e) => {
      if (e.key === 'Escape') {
        close();
        return;
      }

      if (commandMode) {
        handleCommandKeydown(e);
        return;
      }

      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        doSearch(inputEl.value.trim());
      }
    });

    // ESC 全局监听
    _bindEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape' && panelEl.classList.contains('show')) {
        close();
      }
    });
  }

  /**
   * 指令模式下的键盘事件处理
   */
  function handleCommandKeydown(e) {
    const matchedCmds = getMatchedCommands(inputEl.value.slice(1).trim().toLowerCase());
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeCommandIdx = Math.min(activeCommandIdx + 1, matchedCmds.length - 1);
      highlightCommand(matchedCmds);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeCommandIdx = Math.max(activeCommandIdx - 1, 0);
      highlightCommand(matchedCmds);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (matchedCmds.length > 0 && activeCommandIdx < matchedCmds.length) {
        executeCommand(matchedCmds[activeCommandIdx]);
      }
    }
  }

  /**
   * 获取匹配的指令列表
   */
  function getMatchedCommands(query) {
    if (!query) return [...COMMANDS];
    return COMMANDS.filter(cmd => {
      return cmd.keys.some(key => key.toLowerCase().includes(query)) ||
             cmd.label.toLowerCase().includes(query);
    });
  }

  /**
   * 渲染指令列表
   */
  function renderCommands(query) {
    const matchedCmds = getMatchedCommands(query);
    
    if (matchedCmds.length === 0) {
      resultsEl.innerHTML = `<div class="global-search-empty">没有找到匹配的指令</div>`;
      if (hintEl) hintEl.textContent = '输入 / 后面的关键词筛选指令';
      return;
    }

    let html = `<div class="search-command-list">`;
    matchedCmds.forEach((cmd, idx) => {
      html += `
        <div class="search-command-item ${idx === activeCommandIdx ? 'active' : ''}" data-route="${cmd.route}" data-idx="${idx}">
          <span class="search-command-icon">${cmd.icon}</span>
          <span class="search-command-label">${cmd.label}</span>
          <span class="search-command-hint">/${cmd.keys[0]}</span>
        </div>
      `;
    });
    html += `</div>`;
    
    resultsEl.innerHTML = html;
    if (hintEl) hintEl.textContent = '↑↓ 选择 · Enter 跳转 · Esc 关闭';

    // 绑定点击事件
    resultsEl.querySelectorAll('.search-command-item').forEach(el => {
      _bindEvent(el, 'click', () => {
        const route = el.dataset.route;
        if (route) {
          window.Router?.navigate(route);
          close();
        }
      });
    });
  }

  /**
   * 高亮当前选中的指令
   */
  function highlightCommand(matchedCmds) {
    resultsEl.querySelectorAll('.search-command-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === activeCommandIdx);
      if (idx === activeCommandIdx) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  /**
   * 执行指令（导航跳转）
   */
  function executeCommand(cmd) {
    window.Router?.navigate(cmd.route);
    close();
  }

  /**
   * 执行搜索
   */
  async function doSearch(query) {
    if (!query) {
      resultsEl.innerHTML = '';
      return;
    }

    const q = query.toLowerCase();
    let hasAnyResult = false;
    let html = '';

    for (const scope of SCOPE) {
      try {
        const allItems = await Storage.getAll(scope.key);
        const matched = allItems.filter(item => scope.matchFn(item, q));
        if (matched.length === 0) continue;

        hasAnyResult = true;
        html += `<div class="global-search-group">`;
        html += `<div class="global-search-group-title">${scope.icon} ${scope.label} (${matched.length})</div>`;

        const showItems = matched.slice(0, 8); // 每组最多显示8条
        for (const item of showItems) {
          const title = getItemTitle(item, scope.key);
          const meta = getItemMeta(item, scope.key);
          const highlighted = highlightText(title, query);
          html += `
            <div class="global-search-result-item" data-route="${scope.route}" data-id="${item.id || ''}">
              <div class="global-search-result-title">${highlighted}</div>
              ${meta ? `<div class="global-search-result-meta">${meta}</div>` : ''}
            </div>
          `;
        }

        if (matched.length > 8) {
          html += `<div class="global-search-result-more">还有 ${matched.length - 8} 条结果...</div>`;
        }

        html += `</div>`;
      } catch (e) {
        console.warn(`[Search] 搜索 ${scope.key} 失败:`, e);
      }
    }

    if (!hasAnyResult) {
      html = `<div class="global-search-empty">没有找到与「${escapeHtml(query)}」相关的内容</div>`;
    }

    resultsEl.innerHTML = html;

    // 绑定点击跳转
    resultsEl.querySelectorAll('.global-search-result-item').forEach(el => {
      _bindEvent(el, 'click', () => {
        const route = el.dataset.route;
        if (route) {
          window.Router?.navigate(route);
          close();
        }
      });
    });
  }

  /**
   * 获取搜索结果的标题
   */
  function getItemTitle(item, storeName) {
    switch (storeName) {
      case 'tasks': return item.title || '未命名任务';
      case 'journal': return item.title || item.content?.substring(0, 60) || '无标题';
      case 'ideas': return item.title || item.content?.substring(0, 60) || '无标题灵感';
      case 'knowledge': return item.title || '无标题';
      case 'contacts': return item.name || '未命名联系人';
      default: return '未知';
    }
  }

  /**
   * 获取搜索结果的副信息
   */
  function getItemMeta(item, storeName) {
    switch (storeName) {
      case 'tasks':
        return item.date ? `${item.date} · ${(item.status === 'done' || item.status === 'completed') ? '已完成' : item.status === 'todo' ? '待办' : item.status}` : '';
      case 'journal':
        return item.date || '';
      case 'ideas':
        return item.date || '';
      case 'knowledge':
        return item.type || '';
      case 'contacts':
        return item.type || '';
      default: return '';
    }
  }

  /**
   * 高亮匹配文本
   */
  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const q = escapeHtml(query);
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }




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
    console.log('[SearchModule] 模块已销毁');
  }

  return { open, close };
})();
