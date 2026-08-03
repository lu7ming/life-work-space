/**
 * toolbox.js - 网址工具箱模块
 * 人生工作台 · 卡片式网址管理，支持分类、搜索、自定义增删改
 */
import { AppUtils } from '../../core/utils.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';


export const ToolboxModule = (() => {

  // ===== localStorage 键名 =====
  const STORAGE_KEY = 'life-workspace-toolbox-links';

  // ===== 预设分类 =====
  const CATEGORIES = [
    { id: 'ai',      name: 'AI工具',   icon: '🤖' },
    { id: 'learn',   name: '学习资源', icon: '📚' },
    { id: 'media',   name: '自媒体',   icon: '🎬' },
    { id: 'music',   name: '音乐',     icon: '🎵' },
    { id: 'custom',  name: '自定义',   icon: '⭐' },
  ];

  // ===== 预设网址数据 =====
  const DEFAULT_LINKS = [
    // AI工具
    { id: 'ai-chatgpt',    name: 'ChatGPT',   url: 'https://chat.openai.com',           category: 'ai',    icon: '💬' },
    { id: 'ai-claude',     name: 'Claude',     url: 'https://claude.ai',                 category: 'ai',    icon: '🟣' },
    { id: 'ai-deepseek',   name: 'DeepSeek',   url: 'https://chat.deepseek.com',         category: 'ai',    icon: '🔵' },
    { id: 'ai-kimi',       name: 'Kimi',       url: 'https://kimi.moonshot.cn',          category: 'ai',    icon: '🌙' },
    { id: 'ai-doubao',     name: '豆包',       url: 'https://www.doubao.com',            category: 'ai',    icon: '🫘' },
    { id: 'ai-coze',       name: 'Coze',       url: 'https://www.coze.cn',               category: 'ai',    icon: '⚡' },
    { id: 'ai-tongyi',     name: '通义千问',   url: 'https://tongyi.aliyun.com',         category: 'ai',    icon: '🌀' },
    { id: 'ai-wenxin',     name: '文心一言',   url: 'https://yiyan.baidu.com',           category: 'ai',    icon: '🔴' },
    // 学习资源
    { id: 'learn-bilibili', name: 'B站学习',    url: 'https://www.bilibili.com',          category: 'learn', icon: '📺' },
    { id: 'learn-coursera', name: 'Coursera',   url: 'https://www.coursera.org',          category: 'learn', icon: '🎓' },
    { id: 'learn-open163',  name: '网易公开课', url: 'https://open.163.com',             category: 'learn', icon: '📖' },
    { id: 'learn-icourse',  name: '中国大学MOOC', url: 'https://www.icourse163.org',     category: 'learn', icon: '🏫' },
    { id: 'learn-leetcode', name: 'LeetCode',   url: 'https://leetcode.cn',              category: 'learn', icon: '💻' },
    // 自媒体
    { id: 'media-douyin',   name: '抖音创作者',  url: 'https://creator.douyin.com',       category: 'media', icon: '🎵' },
    { id: 'media-xhs',      name: '小红书创作者', url: 'https://creator.xiaohongshu.com',  category: 'media', icon: '📕' },
    { id: 'media-bilibili', name: 'B站创作中心', url: 'https://member.bilibili.com',     category: 'media', icon: '🎬' },
    { id: 'media-jianying', name: '剪映',       url: 'https://jianying.com',             category: 'media', icon: '✂️' },
    { id: 'media-wechat',   name: '微信公众平台', url: 'https://mp.weixin.qq.com',        category: 'media', icon: '💬' },
    // 音乐
    { id: 'music-163',      name: '网易云音乐',  url: 'https://music.163.com',            category: 'music', icon: '🎧' },
    { id: 'music-qq',       name: 'QQ音乐',     url: 'https://y.qq.com',                 category: 'music', icon: '🎶' },
    { id: 'music-kugou',    name: '全民K歌',     url: 'https://kg.qq.com',                category: 'music', icon: '🎤' },
    { id: 'music-kw',       name: '酷我音乐',    url: 'https://www.kuwo.cn',              category: 'music', icon: '🎹' },
  ];

  // ===== 可选图标列表 =====
  const ICON_OPTIONS = [
    '💬', '🟣', '🔵', '🌙', '🫘', '⚡', '🌀', '🔴',
    '📺', '🎓', '📖', '🏫', '💻', '📱', '🔧', '🛠️',
    '🎵', '🎬', '📕', '✂️', '💬', '🎧', '🎶', '🎤',
    '🎹', '🎸', '🥁', '🎺', '🪗', '🎻',
    '⭐', '🔥', '💡', '📌', '🏷️', '🎯', '🚀', '✨',
    '🌐', '🔗', '🗂️', '📊', '📈', '🗂️', '📋', '📝',
  ];

  // ===== 状态 =====
  let links = [];           // 当前网址列表
  let activeFilter = 'all'; // 当前筛选分类 ('all' 或分类id)
  let searchQuery = '';     // 搜索关键词
  let editingId = null;     // 正在编辑的网址ID（null=新增模式）
  let deletingId = null;    // 待删除的网址ID

  // ===== 事件监听追踪 =====
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== localStorage 读写 =====
  function loadLinks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {
      console.warn('[Toolbox] localStorage 读取失败，使用默认数据:', e);
    }
    // 首次使用，写入默认数据
    saveLinks(DEFAULT_LINKS);
    return [...DEFAULT_LINKS];
  }

  function saveLinks(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[Toolbox] localStorage 写入失败:', e);
    }
  }

  // ===== 生成唯一ID =====
  function generateId() {
    return 'link-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
  }

  // ===== 获取分类信息 =====
  function getCategoryById(catId) {
    return CATEGORIES.find(c => c.id === catId) || CATEGORIES[CATEGORIES.length - 1]; // 默认自定义
  }

  // ===== 初始化 =====
  function init() {
    console.log('[Toolbox] 网址工具箱模块初始化...');
    links = loadLinks();
    renderFilters();
    renderCategories();
    bindEvents();
  }

  // ===== 渲染分类筛选标签 =====
  function renderFilters() {
    const container = document.getElementById('toolbox-filters');
    if (!container) return;

    let html = `<button class="toolbox-filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>`;
    CATEGORIES.forEach(cat => {
      html += `<button class="toolbox-filter-btn ${activeFilter === cat.id ? 'active' : ''}" data-filter="${cat.id}">${cat.icon} ${cat.name}</button>`;
    });
    container.innerHTML = html;
  }

  // ===== 渲染分类区域 =====
  function renderCategories() {
    const container = document.getElementById('toolbox-categories');
    if (!container) return;

    // 筛选 & 搜索
    let filtered = links;
    if (activeFilter !== 'all') {
      filtered = filtered.filter(l => l.category === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q)
      );
    }

    // 空状态
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="toolbox-empty">
          <div class="toolbox-empty-icon">📭</div>
          <p class="toolbox-empty-text">${searchQuery ? '没有找到匹配的网址' : '暂无网址，点击右上角添加'}</p>
        </div>
      `;
      return;
    }

    // 按分类分组
    const grouped = {};
    filtered.forEach(link => {
      const cat = getCategoryById(link.category);
      if (!grouped[cat.id]) {
        grouped[cat.id] = { ...cat, links: [] };
      }
      grouped[cat.id].links.push(link);
    });

    // 按预设分类顺序排列
    let html = '';
    const seenCats = new Set();
    CATEGORIES.forEach(cat => {
      if (grouped[cat.id]) {
        html += renderCategorySection(grouped[cat.id]);
        seenCats.add(cat.id);
      }
    });
    // 如果有不在预设分类中的链接
    Object.keys(grouped).forEach(catId => {
      if (!seenCats.has(catId)) {
        html += renderCategorySection(grouped[catId]);
      }
    });

    container.innerHTML = html;
  }

  // ===== 渲染单个分类区域 =====
  function renderCategorySection(cat) {
    const cards = cat.links.map(link => renderCard(link)).join('');
    // 每个分类末尾加一个"添加"占位卡片
    const addCard = `
      <div class="toolbox-card toolbox-card-add" data-add-category="${cat.id}">
        <span class="toolbox-card-add-icon">+</span>
        <span class="toolbox-card-add-text">添加</span>
      </div>
    `;
    return `
      <div class="toolbox-category">
        <div class="toolbox-category-header">
          <span class="toolbox-category-icon">${cat.icon}</span>
          <span class="toolbox-category-name">${cat.name}</span>
          <span class="toolbox-category-count">${cat.links.length}</span>
        </div>
        <div class="toolbox-grid">
          ${cards}
          ${addCard}
        </div>
      </div>
    `;
  }

  // ===== 渲染单个卡片 =====
  function renderCard(link) {
    return `
      <div class="toolbox-card" data-link-id="${link.id}" data-url="${escapeAttr(link.url)}" title="${escapeAttr(link.name)}\n${escapeAttr(link.url)}">
        <div class="toolbox-card-actions">
          <button class="toolbox-card-action-btn edit" data-edit-id="${link.id}" title="编辑">✏️</button>
          <button class="toolbox-card-action-btn delete" data-delete-id="${link.id}" title="删除">🗑️</button>
        </div>
        <div class="toolbox-card-icon">${link.icon || '🔗'}</div>
        <div class="toolbox-card-name">${escapeHtml(link.name)}</div>
        <div class="toolbox-card-url">${escapeHtml(extractDomain(link.url))}</div>
      </div>
    `;
  }

  // ===== 工具函数 =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function extractDomain(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  // ===== 绑定事件 =====
  function bindEvents() {
    // 添加按钮
    _bindEvent(document.getElementById('toolbox-add-btn'), 'click', () => openForm());

    // 搜索
    _bindEvent(document.getElementById('toolbox-search-input'), 'input', (e) => {
      searchQuery = e.target.value;
      renderCategories();
    });

    // 分类筛选（事件委托）
    _bindEvent(document.getElementById('toolbox-filters'), 'click', (e) => {
      const btn = e.target.closest('.toolbox-filter-btn');
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      renderFilters();
      renderCategories();
    });

    // 卡片点击、编辑、删除（事件委托）
    _bindEvent(document.getElementById('toolbox-categories'), 'click', (e) => {
      // 编辑按钮
      const editBtn = e.target.closest('.toolbox-card-action-btn.edit');
      if (editBtn) {
        e.stopPropagation();
        const id = editBtn.dataset.editId;
        openForm(id);
        return;
      }
      // 删除按钮
      const deleteBtn = e.target.closest('.toolbox-card-action-btn.delete');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.deleteId;
        openDeleteConfirm(id);
        return;
      }
      // 添加占位卡片
      const addCard = e.target.closest('.toolbox-card-add');
      if (addCard) {
        const catId = addCard.dataset.addCategory;
        openForm(null, catId);
        return;
      }
      // 普通卡片点击 → 打开链接
      const card = e.target.closest('.toolbox-card:not(.toolbox-card-add)');
      if (card) {
        const url = card.dataset.url;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      }
    });

    // 表单弹窗事件
    _bindEvent(document.getElementById('toolbox-form-close'), 'click', closeForm);
    _bindEvent(document.getElementById('toolbox-form-cancel'), 'click', closeForm);
    _bindEvent(document.getElementById('toolbox-form-overlay'), 'click', (e) => {
      if (e.target.id === 'toolbox-form-overlay') closeForm();
    });
    _bindEvent(document.getElementById('toolbox-form'), 'submit', handleFormSubmit);

    // 删除确认弹窗事件
    _bindEvent(document.getElementById('toolbox-delete-close'), 'click', closeDeleteConfirm);
    _bindEvent(document.getElementById('toolbox-delete-cancel'), 'click', closeDeleteConfirm);
    _bindEvent(document.getElementById('toolbox-delete-overlay'), 'click', (e) => {
      if (e.target.id === 'toolbox-delete-overlay') closeDeleteConfirm();
    });
    _bindEvent(document.getElementById('toolbox-delete-confirm'), 'click', handleDelete);

    // ESC 关闭弹窗
    _bindEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        closeForm();
        closeDeleteConfirm();
      }
    });
  }

  // ===== 打开添加/编辑表单 =====
  function openForm(editId = null, preCategory = null) {
    editingId = editId;
    const overlay = document.getElementById('toolbox-form-overlay');
    const titleEl = document.getElementById('toolbox-form-title');
    const submitBtn = document.getElementById('toolbox-form-submit');
    const nameInput = document.getElementById('toolbox-form-name');
    const urlInput = document.getElementById('toolbox-form-url');
    const categorySelect = document.getElementById('toolbox-form-category');
    const idInput = document.getElementById('toolbox-form-id');
    const iconInput = document.getElementById('toolbox-form-icon');

    // 填充分类选项
    categorySelect.innerHTML = CATEGORIES.map(cat =>
      `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`
    ).join('');

    // 渲染图标选择器
    renderIconPicker(editId ? (links.find(l => l.id === editId)?.icon || '🔗') : '🔗');

    if (editId) {
      // 编辑模式
      const link = links.find(l => l.id === editId);
      if (!link) return;
      titleEl.textContent = '编辑网址';
      submitBtn.textContent = '保存';
      nameInput.value = link.name;
      urlInput.value = link.url;
      categorySelect.value = link.category;
      iconInput.value = link.icon || '🔗';
      idInput.value = link.id;
    } else {
      // 新增模式
      titleEl.textContent = '添加网址';
      submitBtn.textContent = '添加';
      nameInput.value = '';
      urlInput.value = '';
      categorySelect.value = preCategory || 'ai';
      iconInput.value = '🔗';
      idInput.value = '';
    }

    overlay.classList.add('active');
    setTimeout(() => nameInput.focus(), 100);
  }

  // ===== 渲染图标选择器 =====
  function renderIconPicker(selectedIcon) {
    const picker = document.getElementById('toolbox-icon-picker');
    if (!picker) return;

    picker.innerHTML = ICON_OPTIONS.map(icon =>
      `<span class="toolbox-icon-option ${icon === selectedIcon ? 'selected' : ''}" data-icon="${icon}">${icon}</span>`
    ).join('');

    // 图标选择事件
    picker.onclick = (e) => {
      const option = e.target.closest('.toolbox-icon-option');
      if (!option) return;
      picker.querySelectorAll('.toolbox-icon-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      (document.getElementById('toolbox-form-icon') || {}).value = option.dataset.icon;
    };

    (document.getElementById('toolbox-form-icon') || {}).value = selectedIcon;
  }

  // ===== 关闭表单 =====
  function closeForm() {
    const overlay = document.getElementById('toolbox-form-overlay');
    if (overlay) overlay.classList.remove('active');
    editingId = null;
  }

  // ===== 处理表单提交 =====
  function handleFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('toolbox-form-name')?.value.trim();
    const url = document.getElementById('toolbox-form-url')?.value.trim();
    const category = document.getElementById('toolbox-form-category')?.value;
    const icon = document.getElementById('toolbox-form-icon')?.value || '🔗';
    const id = document.getElementById('toolbox-form-id')?.value;

    if (!name || !url) return;

    // 确保 URL 以协议开头
    let finalUrl = url;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    if (editingId && id) {
      // 编辑
      const idx = links.findIndex(l => l.id === id);
      if (idx >= 0) {
        links[idx] = { ...links[idx], name, url: finalUrl, category, icon };
      }
    } else {
      // 新增
      links.push({ id: generateId(), name, url: finalUrl, category, icon });
    }

    saveLinks(links);
    renderCategories();
    closeForm();

    if (window.App) window.App.showToast(editingId ? '网址已更新 ✅' : '网址已添加 ✅');
  }

  // ===== 打开删除确认 =====
  function openDeleteConfirm(id) {
    deletingId = id;
    const link = links.find(l => l.id === id);
    const overlay = document.getElementById('toolbox-delete-overlay');
    const nameEl = document.getElementById('toolbox-delete-name');

    if (nameEl && link) nameEl.textContent = link.name;
    if (overlay) overlay.classList.add('active');
  }

  // ===== 关闭删除确认 =====
  function closeDeleteConfirm() {
    const overlay = document.getElementById('toolbox-delete-overlay');
    if (overlay) overlay.classList.remove('active');
    deletingId = null;
  }

  // ===== 确认删除 =====
  function handleDelete() {
    if (!deletingId) return;

    links = links.filter(l => l.id !== deletingId);
    saveLinks(links);
    renderCategories();
    closeDeleteConfirm();

    if (window.App) window.App.showToast('网址已删除 🗑️');
  }

  // ===== 销毁模块 =====
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => {
      if (el) el.removeEventListener(event, handler);
    });
    _eventListeners = [];
    console.log('[ToolboxModule] 模块已销毁');
  }

  return { init, destroy };
})();
