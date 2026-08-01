/**
 * search.js - 全局搜索模块
 * 人生工作台 · 跨模块关键词搜索
 */

const SearchModule = (() => {
  let panelEl = null;
  let inputEl = null;
  let resultsEl = null;
  let debounceTimer = null;

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
        <div class="global-search-hint">输入关键词后按回车或自动搜索 · 点击结果跳转到对应模块</div>
      </div>
    `;

    inputEl = panelEl.querySelector('.global-search-input');
    resultsEl = panelEl.querySelector('.global-search-results');

    // 事件绑定
    panelEl.querySelector('.global-search-backdrop').addEventListener('click', close);
    panelEl.querySelector('.global-search-close').addEventListener('click', close);

    inputEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => doSearch(inputEl.value.trim()), 200);
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        doSearch(inputEl.value.trim());
      }
    });

    // ESC 全局监听
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelEl.classList.contains('show')) {
        close();
      }
    });
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
      el.addEventListener('click', () => {
        const route = el.dataset.route;
        if (route) {
          Router.navigate(route);
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
        return item.date ? `${item.date} · ${item.status === 'done' ? '已完成' : item.status === 'todo' ? '待办' : item.status}` : '';
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  return { open, close };
})();
