/**
 * cross-linker.js - 跨模块智能关联
 * 人生工作台 · 自动推荐相关内容，打破数据孤岛
 *
 * 当用户在某个模块操作时，自动从其他模块检索相关内容并推荐展示。
 * 纯本地关键词匹配，不调用任何 API，零成本。
 */
const CrossLinker = (() => {
  'use strict';

  // ========== 停用词 ==========
  const STOP_WORDS = new Set([
    '的', '了', '是', '在', '和', '与', '或', '一个', '有', '我', '你', '他', '她', '它',
    '们', '这', '那', '个', '吗', '呢', '吧', '啊', '哦', '嗯', '就', '都', '也', '不',
    '要', '会', '可以', '能', '将', '把', '被', '让', '给', '从', '到', '向', '对',
    '关于', '因为', '所以', '但是', '而且', '如果', '虽然', '然后', '接着', '最后',
    '今天', '明天', '昨天', '现在', '已经', '正在', '将要', '可能', '应该', '需要',
    '想要', '喜欢', '觉得', '认为', '知道', '看到', '听到', '说到', '做到', '用到',
    '吃到', '喝到', '睡到', '玩到', '学到', '练到', '唱到',
    // 常见英文停用词
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor',
    'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every',
    'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
    'if', 'when', 'while', 'where', 'how', 'what', 'which', 'who',
    'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
    'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its',
    'they', 'them', 'their', 'am'
  ]);

  // ========== 模块配置 ==========
  const MODULE_CONFIG = {
    knowledge: {
      label: '知识库',
      icon: '📚',
      storeName: 'knowledge',
      titleField: 'title',
      contentField: 'content',
      tagField: 'tags',
      dateField: 'createdAt',
    },
    tasks: {
      label: '任务',
      icon: '📋',
      storeName: 'tasks',
      titleField: 'title',
      contentField: null,
      tagField: null,
      dateField: 'date',
      statusField: 'status',
    },
    journal: {
      label: '日记',
      icon: '📖',
      storeName: 'journal',
      titleField: null,
      contentField: 'content',
      tagField: null,
      dateField: 'date',
      typeFilter: { field: 'type', value: 'diary' },
    },
    content_topics: {
      label: '创作',
      icon: '🎬',
      storeName: 'content_topics',
      titleField: 'title',
      contentField: null,
      tagField: null,
      dateField: 'createdAt',
      statusField: 'status',
    },
    goals: {
      label: '目标',
      icon: '🎯',
      storeName: 'goals',
      titleField: 'title',
      contentField: 'description',
      tagField: null,
      dateField: 'createdAt',
      statusField: 'status',
    },
    ideas: {
      label: '灵感',
      icon: '💡',
      storeName: 'ideas',
      titleField: null,
      contentField: 'content',
      tagField: 'tags',
      dateField: 'date',
    },
  };

  // 每个源模块应该搜索的目标模块
  const SEARCH_MAP = {
    journal: ['knowledge', 'tasks', 'content_topics', 'ideas'],
    tasks: ['knowledge', 'journal', 'goals', 'content_topics'],
    content_topics: ['knowledge', 'tasks', 'ideas', 'journal'],
    knowledge: ['tasks', 'content_topics', 'ideas', 'journal'],
  };

  const MAX_RESULTS = 5;
  const DEBOUNCE_MS = 500;

  // ========== 缓存 ==========
  let _dataCache = {};
  let _cacheTimestamp = 0;
  const CACHE_TTL = 30000; // 30秒缓存

  // ========== 防抖 ==========
  const _debounceTimers = {};

  function _debounce(key, fn, delay) {
    if (_debounceTimers[key]) clearTimeout(_debounceTimers[key]);
    _debounceTimers[key] = setTimeout(() => {
      delete _debounceTimers[key];
      fn();
    }, delay);
  }

  // ========== 关键词提取 ==========
  /**
   * 从文本中提取关键词
   * @param {string} text - 输入文本
   * @returns {string[]} 关键词数组
   */
  function extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];

    // 中文分词：按标点、空格分割，同时提取2-4字词组
    const segments = text
      .replace(/[，。！？、；：""''（）【】《》\[\]{}()!,.;:?""''\-—…·\n\r\t]/g, ' ')
      .split(/\s+/)
      .filter(s => s.length > 0);

    const keywords = new Set();

    for (const seg of segments) {
      // 跳过停用词和过短的词
      if (STOP_WORDS.has(seg) || seg.length < 2) continue;

      // 直接加入
      keywords.add(seg.toLowerCase());

      // 对于较长的中文片段，提取2-4字子串作为关键词
      if (/[\u4e00-\u9fa5]/.test(seg) && seg.length >= 4) {
        for (let len = 2; len <= Math.min(4, seg.length); len++) {
          for (let i = 0; i <= seg.length - len; i++) {
            const sub = seg.substring(i, i + len);
            if (!STOP_WORDS.has(sub) && sub.length >= 2) {
              keywords.add(sub.toLowerCase());
            }
          }
        }
      }
    }

    return [...keywords];
  }

  // ========== 数据加载 ==========
  /**
   * 从 IndexedDB 加载模块数据（带缓存）
   */
  async function _loadModuleData(moduleKey) {
    const now = Date.now();
    if (now - _cacheTimestamp > CACHE_TTL) {
      _dataCache = {};
      _cacheTimestamp = now;
    }

    if (_dataCache[moduleKey]) return _dataCache[moduleKey];

    const config = MODULE_CONFIG[moduleKey];
    if (!config) return [];

    try {
      let data = await Storage.getAll(config.storeName);
      if (!Array.isArray(data)) data = [];

      // 应用类型过滤
      if (config.typeFilter) {
        data = data.filter(item => item[config.typeFilter.field] === config.typeFilter.value);
      }

      _dataCache[moduleKey] = data;
      return data;
    } catch (e) {
      console.warn('[CrossLinker] 加载模块数据失败:', moduleKey, e);
      return [];
    }
  }

  /**
   * 清除缓存，下次查询时重新加载
   */
  function invalidateCache() {
    _dataCache = {};
    _cacheTimestamp = 0;
  }

  // ========== 相关度计算 ==========
  /**
   * 计算关键词与目标文本的相关度分数
   * @param {string[]} keywords - 关键词数组
   * @param {string} targetText - 目标文本
   * @returns {number} 分数（关键词命中数）
   */
  function calculateScore(keywords, targetText) {
    if (!targetText || keywords.length === 0) return 0;
    const lowerText = targetText.toLowerCase();
    let score = 0;

    for (const kw of keywords) {
      if (lowerText.includes(kw)) {
        // 短关键词权重低，长关键词权重高
        score += kw.length >= 4 ? 3 : kw.length >= 3 ? 2 : 1;
      }
    }

    return score;
  }

  // ========== 模块搜索 ==========
  /**
   * 在指定模块数据中搜索匹配项
   * @param {string[]} keywords - 关键词
   * @param {string} moduleKey - 模块键名
   * @param {number|null} excludeId - 排除的条目ID
   * @returns {Promise<Array>} 匹配结果
   */
  async function searchInModule(keywords, moduleKey, excludeId) {
    if (keywords.length === 0) return [];

    const config = MODULE_CONFIG[moduleKey];
    if (!config) return [];

    const data = await _loadModuleData(moduleKey);
    const results = [];

    for (const item of data) {
      // 排除当前正在编辑的条目
      if (excludeId != null && item.id == excludeId) continue;

      // 收集可搜索的文本
      const textParts = [];
      if (config.titleField && item[config.titleField]) {
        textParts.push(item[config.titleField]);
      }
      if (config.contentField && item[config.contentField]) {
        textParts.push(item[config.contentField]);
      }
      if (config.tagField && Array.isArray(item[config.tagField])) {
        textParts.push(item[config.tagField].join(' '));
      }

      const fullText = textParts.join(' ');
      const score = calculateScore(keywords, fullText);

      if (score > 0) {
        // 获取标题
        let title = '';
        if (config.titleField && item[config.titleField]) {
          title = item[config.titleField];
        } else if (config.contentField && item[config.contentField]) {
          title = item[config.contentField].slice(0, 50);
        }

        // 获取状态标签
        let statusLabel = '';
        if (config.statusField) {
          const statusVal = item[config.statusField];
          if (statusVal === 'done' || statusVal === 'completed') statusLabel = '已完成';
          else if (statusVal === 'todo') statusLabel = '进行中';
          else if (statusVal === 'idea') statusLabel = '灵感';
          else if (statusVal === 'prep') statusLabel = '筹备中';
          else if (statusVal === 'shot') statusLabel = '已拍摄';
          else if (statusVal === 'published') statusLabel = '已发布';
          else if (statusVal === 'active') statusLabel = '进行中';
          else if (statusVal) statusLabel = statusVal;
        }

        // 获取时间标签
        let timeLabel = '';
        if (config.dateField && item[config.dateField]) {
          timeLabel = _formatRelativeTime(item[config.dateField]);
        }

        results.push({
          id: item.id,
          moduleKey,
          moduleLabel: config.label,
          moduleIcon: config.icon,
          title,
          statusLabel,
          timeLabel,
          score,
        });
      }
    }

    return results;
  }

  /**
   * 格式化相对时间
   */
  function _formatRelativeTime(dateVal) {
    if (!dateVal) return '';
    let ts;
    if (typeof dateVal === 'number') {
      ts = dateVal;
    } else if (typeof dateVal === 'string') {
      // 尝试解析日期字符串
      const d = new Date(dateVal.includes('T') ? dateVal : dateVal + 'T00:00:00');
      if (isNaN(d.getTime())) return dateVal;
      ts = d.getTime();
    } else {
      return '';
    }

    const now = Date.now();
    const diffMs = now - ts;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}小时前`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}天前`;
    if (diffD < 30) return `${Math.floor(diffD / 7)}周前`;
    if (diffD < 365) return `${Math.floor(diffD / 30)}月前`;
    return `${Math.floor(diffD / 365)}年前`;
  }

  // ========== 主搜索函数 ==========
  /**
   * 查找与当前内容相关的其他模块内容
   * @param {string} content - 当前内容文本
   * @param {string} sourceModule - 当前模块名
   * @param {number|null} excludeId - 排除的条目ID
   * @returns {Promise<Array>} 排序后的推荐结果
   */
  async function findRelated(content, sourceModule, excludeId) {
    if (!content || content.trim().length < 3) return [];

    const keywords = extractKeywords(content);
    if (keywords.length === 0) return [];

    const targetModules = SEARCH_MAP[sourceModule] || [];
    if (targetModules.length === 0) return [];

    // 并行搜索所有目标模块
    const allResults = await Promise.all(
      targetModules.map(mod => searchInModule(keywords, mod, excludeId))
    );

    // 合并、去重、排序
    const merged = allResults.flat();
    // 按 score 降序排列，同分按时间近的排前面
    merged.sort((a, b) => b.score - a.score);

    // 去重（同模块同ID）
    const seen = new Set();
    const unique = merged.filter(item => {
      const key = `${item.moduleKey}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.slice(0, MAX_RESULTS);
  }

  // ========== 渲染推荐面板 ==========
  /**
   * 渲染推荐面板
   * @param {Array} items - 推荐结果
   * @param {string} containerId - 容器ID
   */
  function renderPanel(items, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '';
      container.classList.remove('has-content');
      return;
    }

    container.classList.add('has-content');

    let html = `
      <div class="cross-link-header">
        <span class="cross-link-header-icon">🔗</span>
        <span class="cross-link-header-title">相关内容</span>
        <button class="cross-link-collapse-btn" id="${containerId}-collapse-btn" title="收起">—</button>
      </div>
      <div class="cross-link-items">
    `;

    for (const item of items) {
      html += `
        <div class="cross-link-item" data-module="${item.moduleKey}" data-id="${item.id}" title="点击查看详情">
          <span class="cross-link-item-icon">${item.moduleIcon}</span>
          <div class="cross-link-item-body">
            <div class="cross-link-item-title">${_escapeHtml(item.title)}</div>
            <div class="cross-link-item-meta">
              <span class="cross-link-item-module">${item.moduleLabel}</span>
              ${item.statusLabel ? `<span class="cross-link-item-sep">·</span><span class="cross-link-item-status">${_escapeHtml(item.statusLabel)}</span>` : ''}
              ${item.timeLabel ? `<span class="cross-link-item-sep">·</span><span class="cross-link-item-time">${_escapeHtml(item.timeLabel)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;

    // 绑定收起按钮
    const collapseBtn = document.getElementById(`${containerId}-collapse-btn`);
    if (collapseBtn) {
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemsEl = container.querySelector('.cross-link-items');
        if (itemsEl) {
          itemsEl.classList.toggle('collapsed');
          collapseBtn.textContent = itemsEl.classList.contains('collapsed') ? '+' : '—';
        }
      });
    }

    // 绑定点击跳转
    container.querySelectorAll('.cross-link-item').forEach(el => {
      el.addEventListener('click', () => {
        _navigateToModule(el.dataset.module, el.dataset.id);
      });
    });
  }

  /**
   * 跳转到对应模块
   */
  function _navigateToModule(moduleKey, itemId) {
    // 路由到对应模块
    const moduleRouteMap = {
      knowledge: 'knowledge',
      tasks: 'tasks',
      journal: 'journal',
      content_topics: 'content',
      goals: 'goals',
      ideas: 'journal',
    };

    const route = moduleRouteMap[moduleKey];
    if (route && typeof Router !== 'undefined' && Router.navigate) {
      Router.navigate(route);
    }
  }

  /**
   * HTML 转义
   */
  function _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== 显示/隐藏推荐 ==========
  /**
   * 显示推荐（带防抖）
   * @param {string} content - 当前内容文本
   * @param {string} sourceModule - 当前模块名
   * @param {string} containerId - 容器ID
   * @param {number|null} excludeId - 排除的条目ID
   */
  function showSuggestions(content, sourceModule, containerId, excludeId) {
    const debounceKey = `crosslink_${containerId}`;
    _debounce(debounceKey, async () => {
      const items = await findRelated(content, sourceModule, excludeId);
      renderPanel(items, containerId);
    }, DEBOUNCE_MS);
  }

  /**
   * 隐藏推荐面板
   * @param {string} containerId - 容器ID
   */
  function hideSuggestions(containerId) {
    const debounceKey = `crosslink_${containerId}`;
    if (_debounceTimers[debounceKey]) {
      clearTimeout(_debounceTimers[debounceKey]);
      delete _debounceTimers[debounceKey];
    }
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
      container.classList.remove('has-content');
    }
  }

  // ========== 导出 ==========
  return {
    findRelated,
    showSuggestions,
    hideSuggestions,
    extractKeywords,
    invalidateCache,
  };
})();
