const KnowledgeModule = (() => {
  // ========== State ==========
  const STORE_NAME = 'knowledge';
  let allEntries = [];
  let currentType = 'all';
  let currentTag = 'all';
  let currentSort = 'time-desc';
  let searchKeyword = '';
  let editingId = null;
  let formTags = [];

  // ========== Utilities ==========
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}小时前`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}天前`;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (y === now.getFullYear()) return `${m}-${day}`;
    return `${y}-${m}-${day}`;
  }

  function formatDateFull(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  }

  function truncate(str, len = 120) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  function getTypeLabel(type) {
    const map = { article: '文章', note: '笔记', excerpt: '书摘' };
    return map[type] || type;
  }

  function getTypeIcon(type) {
    const map = { article: '📄', note: '📝', excerpt: '📖' };
    return map[type] || '📄';
  }

  // ========== Data ==========
  async function loadData() {
    try {
      allEntries = await Storage.getAll(STORE_NAME);
      if (!Array.isArray(allEntries)) allEntries = [];
    } catch (e) {
      console.warn('[Knowledge] Failed to load data:', e);
      allEntries = [];
    }
  }

  function getFilteredEntries() {
    let result = [...allEntries];

    // Type filter
    if (currentType !== 'all') {
      result = result.filter(e => e.type === currentType);
    }

    // Tag filter
    if (currentTag !== 'all') {
      result = result.filter(e => Array.isArray(e.tags) && e.tags.includes(currentTag));
    }

    // Search
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      result = result.filter(e =>
        (e.title && e.title.toLowerCase().includes(kw)) ||
        (e.content && e.content.toLowerCase().includes(kw))
      );
    }

    // Sort
    if (currentSort === 'time-desc') {
      result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (currentSort === 'time-asc') {
      result.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }

    return result;
  }

  function getAllTags() {
    const tagMap = {};
    allEntries.forEach(e => {
      if (Array.isArray(e.tags)) {
        e.tags.forEach(t => {
          if (t && t.trim()) {
            tagMap[t] = (tagMap[t] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(tagMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  function getTypeCounts() {
    const counts = { article: 0, note: 0, excerpt: 0 };
    allEntries.forEach(e => {
      if (counts[e.type] !== undefined) counts[e.type]++;
    });
    return counts;
  }

  function getTopTags(n = 5) {
    return getAllTags().slice(0, n);
  }

  // ========== Rendering ==========
  function renderAll() {
    renderTags();
    renderList();
    updateResultCount();
  }

  function renderTags() {
    const tagList = document.getElementById('knowledgeTagList');
    if (!tagList) return;

    const tags = getAllTags();
    const totalCount = allEntries.length;

    let html = `
      <button class="knowledge-tag-item ${currentTag === 'all' ? 'active' : ''}" data-tag="all">
        <span class="knowledge-tag-name">全部</span>
        <span class="knowledge-tag-count">${totalCount}</span>
      </button>
    `;

    tags.forEach(tag => {
      html += `
        <button class="knowledge-tag-item ${currentTag === tag.name ? 'active' : ''}" data-tag="${escapeHtml(tag.name)}">
          <span class="knowledge-tag-name">${escapeHtml(tag.name)}</span>
          <span class="knowledge-tag-count">${tag.count}</span>
        </button>
      `;
    });

    tagList.innerHTML = html;
  }

  function renderList() {
    const listEl = document.getElementById('knowledgeList');
    const emptyEl = document.getElementById('knowledgeEmpty');
    if (!listEl || !emptyEl) return;

    const entries = getFilteredEntries();

    if (entries.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'flex';
      return;
    }

    emptyEl.style.display = 'none';

    listEl.innerHTML = entries.map(entry => `
      <div class="knowledge-card" data-id="${entry.id}">
        <div class="knowledge-card-header">
          <span class="knowledge-card-type type-${entry.type}">${getTypeIcon(entry.type)} ${getTypeLabel(entry.type)}</span>
          <span class="knowledge-card-title">${escapeHtml(entry.title)}</span>
        </div>
        ${entry.content ? `<div class="knowledge-card-summary">${escapeHtml(truncate(entry.content, 100))}</div>` : ''}
        <div class="knowledge-card-footer">
          <div class="knowledge-card-tags">
            ${(entry.tags || []).slice(0, 3).map(t => `<span class="knowledge-card-tag">${escapeHtml(t)}</span>`).join('')}
            ${(entry.tags || []).length > 3 ? `<span class="knowledge-card-tag">+${entry.tags.length - 3}</span>` : ''}
          </div>
          <span class="knowledge-card-time">${formatDate(entry.createdAt)}</span>
        </div>
      </div>
    `).join('');
  }

  function updateResultCount() {
    const el = document.getElementById('knowledgeResultCount');
    if (el) {
      const count = getFilteredEntries().length;
      el.textContent = `${count} 条`;
    }
  }

  // ========== Modal: Create / Edit ==========
  function openCreateModal() {
    editingId = null;
    formTags = [];
    document.getElementById('knowledgeModalTitle').textContent = '新建知识';
    document.getElementById('knowledgeFormTitle').value = '';
    document.getElementById('knowledgeFormContent').value = '';
    document.getElementById('knowledgeFormUrl').value = '';
    document.getElementById('knowledgeFormSource').value = '';
    document.getElementById('knowledgeFormDelete').style.display = 'none';

    // Reset type to article
    document.querySelectorAll('#knowledgeFormTypes .knowledge-form-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === 'article');
    });

    renderFormTags();
    renderTagSuggestions();
    showModal('knowledgeModal');
  }

  function openEditModal(entry) {
    editingId = entry.id;
    formTags = [...(entry.tags || [])];
    document.getElementById('knowledgeModalTitle').textContent = '编辑知识';
    document.getElementById('knowledgeFormTitle').value = entry.title || '';
    document.getElementById('knowledgeFormContent').value = entry.content || '';
    document.getElementById('knowledgeFormUrl').value = entry.url || '';
    document.getElementById('knowledgeFormSource').value = entry.source || '';
    document.getElementById('knowledgeFormDelete').style.display = 'inline-flex';

    document.querySelectorAll('#knowledgeFormTypes .knowledge-form-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === entry.type);
    });

    renderFormTags();
    renderTagSuggestions();
    showModal('knowledgeModal');
  }

  function renderFormTags() {
    const container = document.getElementById('knowledgeFormTagsDisplay');
    if (!container) return;
    container.innerHTML = formTags.map((tag, i) => `
      <span class="knowledge-form-tag-chip">
        ${escapeHtml(tag)}
        <span class="knowledge-form-tag-remove" data-index="${i}">✕</span>
      </span>
    `).join('');
  }

  function renderTagSuggestions() {
    const container = document.getElementById('knowledgeFormTagsSuggest');
    if (!container) return;

    const existingTags = getAllTags().map(t => t.name);
    const suggestions = existingTags.filter(t => !formTags.includes(t)).slice(0, 8);

    if (suggestions.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = suggestions.map(t => `
      <button class="knowledge-tag-suggest-item" data-tag="${escapeHtml(t)}">+ ${escapeHtml(t)}</button>
    `).join('');
  }

  function getFormType() {
    const active = document.querySelector('#knowledgeFormTypes .knowledge-form-type-btn.active');
    return active ? active.dataset.type : 'article';
  }

  async function saveEntry() {
    const title = document.getElementById('knowledgeFormTitle').value.trim();
    if (!title) {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('请输入标题');
      }
      document.getElementById('knowledgeFormTitle').focus();
      return;
    }

    const now = Date.now();
    const data = {
      title,
      content: document.getElementById('knowledgeFormContent').value.trim(),
      url: document.getElementById('knowledgeFormUrl').value.trim(),
      type: getFormType(),
      tags: [...formTags],
      source: document.getElementById('knowledgeFormSource').value.trim(),
      updatedAt: now
    };

    try {
      if (editingId) {
        data.id = editingId;
        // Preserve createdAt
        const existing = allEntries.find(e => e.id === editingId);
        if (existing) data.createdAt = existing.createdAt;
        await Storage.put(STORE_NAME, data);
      } else {
        data.createdAt = now;
        await Storage.add(STORE_NAME, data);
      }

      await loadData();
      renderAll();
      hideModal('knowledgeModal');

      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast(editingId ? '已更新' : '已添加');
      }
    } catch (e) {
      console.error('[Knowledge] Save failed:', e);
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('保存失败');
      }
    }
  }

  async function deleteEntry(id) {
    if (!id) return;
    try {
      await Storage.remove(STORE_NAME, id);
      await loadData();
      renderAll();
      hideModal('knowledgeModal');
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('已删除');
      }
    } catch (e) {
      console.error('[Knowledge] Delete failed:', e);
    }
  }

  // ========== Stats Modal ==========
  function openStatsModal() {
    const body = document.getElementById('knowledgeStatsBody');
    if (!body) return;

    const total = allEntries.length;
    const typeCounts = getTypeCounts();
    const topTags = getTopTags(5);

    let html = `
      <div class="knowledge-stats-total">
        <div class="knowledge-stats-total-num">${total}</div>
        <div class="knowledge-stats-total-label">知识条目总数</div>
      </div>
      <div class="knowledge-stats-section">
        <div class="knowledge-stats-section-title">📋 各类型数量</div>
        <div class="knowledge-stats-row">
          <span class="knowledge-stats-row-label">📄 文章</span>
          <span class="knowledge-stats-row-value">${typeCounts.article}</span>
        </div>
        <div class="knowledge-stats-row">
          <span class="knowledge-stats-row-label">📝 笔记</span>
          <span class="knowledge-stats-row-value">${typeCounts.note}</span>
        </div>
        <div class="knowledge-stats-row">
          <span class="knowledge-stats-row-label">📖 书摘</span>
          <span class="knowledge-stats-row-value">${typeCounts.excerpt}</span>
        </div>
      </div>
    `;

    if (topTags.length > 0) {
      html += `
        <div class="knowledge-stats-section">
          <div class="knowledge-stats-section-title">🏷️ 热门标签 Top 5</div>
          ${topTags.map((t, i) => `
            <div class="knowledge-stats-row">
              <span class="knowledge-stats-row-label">${i + 1}. ${escapeHtml(t.name)}</span>
              <span class="knowledge-stats-row-value">${t.count} 条</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      html += `
        <div class="knowledge-stats-section">
          <div class="knowledge-stats-section-title">🏷️ 热门标签</div>
          <p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 12px 0;">暂无标签数据</p>
        </div>
      `;
    }

    body.innerHTML = html;
    showModal('knowledgeStatsModal');
  }

  // ========== Modal Helpers ==========
  function showModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  }

  function hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  // ========== Events ==========
  function bindEvents() {
    // Search input
    const searchInput = document.getElementById('knowledgeSearchInput');
    const searchClear = document.getElementById('knowledgeSearchClear');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          searchKeyword = searchInput.value;
          searchClear.style.display = searchKeyword ? 'block' : 'none';
          renderList();
          updateResultCount();
        }, 200);
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchKeyword = '';
        if (searchInput) searchInput.value = '';
        searchClear.style.display = 'none';
        renderList();
        updateResultCount();
      });
    }

    // Type tabs
    const typeTabs = document.getElementById('knowledgeTypeTabs');
    if (typeTabs) {
      typeTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.knowledge-type-tab');
        if (!tab) return;
        currentType = tab.dataset.type;
        typeTabs.querySelectorAll('.knowledge-type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderList();
        updateResultCount();
      });
    }

    // Tag list (delegated)
    const tagList = document.getElementById('knowledgeTagList');
    if (tagList) {
      tagList.addEventListener('click', (e) => {
        const tagBtn = e.target.closest('.knowledge-tag-item');
        if (!tagBtn) return;
        currentTag = tagBtn.dataset.tag;
        tagList.querySelectorAll('.knowledge-tag-item').forEach(t => t.classList.remove('active'));
        tagBtn.classList.add('active');
        renderList();
        updateResultCount();
      });
    }

    // Sort buttons
    const sortBar = document.getElementById('knowledgeSortBar');
    if (sortBar) {
      sortBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.knowledge-sort-btn');
        if (!btn) return;
        currentSort = btn.dataset.sort;
        sortBar.querySelectorAll('.knowledge-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderList();
      });
    }

    // Card click -> edit modal
    const listEl = document.getElementById('knowledgeList');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const card = e.target.closest('.knowledge-card');
        if (!card) return;
        const id = parseInt(card.dataset.id, 10);
        const entry = allEntries.find(en => en.id === id);
        if (entry) openEditModal(entry);
      });
    }

    // FAB
    const fab = document.getElementById('knowledgeFabBtn');
    if (fab) fab.addEventListener('click', openCreateModal);

    // Stats button
    const statsBtn = document.getElementById('knowledgeStatsBtn');
    if (statsBtn) statsBtn.addEventListener('click', openStatsModal);

    // Stats modal close
    const statsClose = document.getElementById('knowledgeStatsClose');
    if (statsClose) statsClose.addEventListener('click', () => hideModal('knowledgeStatsModal'));

    // Modal close
    const modalClose = document.getElementById('knowledgeModalClose');
    if (modalClose) modalClose.addEventListener('click', () => hideModal('knowledgeModal'));

    // Modal overlay click
    const modalOverlay = document.getElementById('knowledgeModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) hideModal('knowledgeModal');
      });
    }
    const statsOverlay = document.getElementById('knowledgeStatsModal');
    if (statsOverlay) {
      statsOverlay.addEventListener('click', (e) => {
        if (e.target === statsOverlay) hideModal('knowledgeStatsModal');
      });
    }

    // Form type buttons
    const formTypes = document.getElementById('knowledgeFormTypes');
    if (formTypes) {
      formTypes.addEventListener('click', (e) => {
        const btn = e.target.closest('.knowledge-form-type-btn');
        if (!btn) return;
        formTypes.querySelectorAll('.knowledge-form-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }

    // Tag input (Enter to add)
    const tagInput = document.getElementById('knowledgeTagInput');
    if (tagInput) {
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = tagInput.value.trim();
          if (val && !formTags.includes(val)) {
            formTags.push(val);
            renderFormTags();
            renderTagSuggestions();
          }
          tagInput.value = '';
        }
      });
    }

    // Remove form tag (delegated)
    const formTagsDisplay = document.getElementById('knowledgeFormTagsDisplay');
    if (formTagsDisplay) {
      formTagsDisplay.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.knowledge-form-tag-remove');
        if (!removeBtn) return;
        const idx = parseInt(removeBtn.dataset.index, 10);
        formTags.splice(idx, 1);
        renderFormTags();
        renderTagSuggestions();
      });
    }

    // Tag suggestions (delegated)
    const formTagsSuggest = document.getElementById('knowledgeFormTagsSuggest');
    if (formTagsSuggest) {
      formTagsSuggest.addEventListener('click', (e) => {
        const item = e.target.closest('.knowledge-tag-suggest-item');
        if (!item) return;
        const tag = item.dataset.tag;
        if (tag && !formTags.includes(tag)) {
          formTags.push(tag);
          renderFormTags();
          renderTagSuggestions();
        }
      });
    }

    // Save button
    const saveBtn = document.getElementById('knowledgeFormSave');
    if (saveBtn) saveBtn.addEventListener('click', saveEntry);

    // Cancel button
    const cancelBtn = document.getElementById('knowledgeFormCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => hideModal('knowledgeModal'));

    // Delete button
    const deleteBtn = document.getElementById('knowledgeFormDelete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (editingId) {
          if (confirm('确定删除这条知识吗？')) {
            deleteEntry(editingId);
          }
        }
      });
    }

    // Keyboard: Escape to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideModal('knowledgeModal');
        hideModal('knowledgeStatsModal');
      }
    });
  }

  // ========== Init ==========
  async function init() {
    console.log('[Knowledge] 模块初始化...');
    await loadData();
    renderAll();
    bindEvents();
    console.log('[Knowledge] 初始化完成，共', allEntries.length, '条记录');
  }

  return { init };
})();
