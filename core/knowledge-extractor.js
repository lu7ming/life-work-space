/**
 * knowledge-extractor.js - 对话自动沉淀知识
 * 人生工作台 · AI 识别有价值的对话内容，自动归档到知识库
 *
 * 工作流：
 * 1. 小鹿完成回复后，异步调用 analyzeConversation(userMessage, aiResponse)
 * 2. 调用 DeepSeek API 判断是否值得沉淀
 * 3. 如果值得，生成知识条目并保存到 knowledge store
 * 4. 通过 EventBus 发送 knowledge:extracted 事件
 * 5. 显示可点击的 toast 通知，引导用户查看
 *
 * 约束：
 * - API 调用失败时静默忽略，不影响用户体验
 * - 每次对话最多提取 1 条知识
 * - API Key 不可用时功能静默关闭
 */

const KnowledgeExtractor = (() => {
  'use strict';

  // ===== 常量 =====
  const API_URL = 'https://api.deepseek.com/v1/chat/completions';
  const MODEL_NAME = 'deepseek-chat';
  const API_TIMEOUT = 15000; // 15秒超时
  const STORE_NAME = 'knowledge';

  // 知识提取 Prompt
  const EXTRACT_PROMPT = `你是一个知识提取助手。请分析以下对话，判断是否包含值得沉淀的知识。

值得沉淀的内容类型：
- 行业洞察/市场信息
- 个人决策及理由
- 学到的新知识/技巧
- 经验总结/教训
- 创意/灵感
- 有用的资源/链接

不需要沉淀的内容：
- 日常寒暄（"你好"、"谢谢"）
- 简单的操作指令（"帮我记一笔"、"打卡"）
- 重复内容
- 纯粹的情感表达无实质信息

如果有值得沉淀的知识，请返回 JSON（不要输出任何其他内容）：
{
  "should_extract": true,
  "title": "简短标题（15字以内）",
  "content": "核心知识内容（100-300字，提炼要点）",
  "tags": ["标签1", "标签2"],
  "category": "insight 或 decision 或 learning 或 idea 或 resource",
  "related_topic": "相关主题（可选，没有则为空字符串）"
}

如果没有值得沉淀的内容，返回（不要输出任何其他内容）：
{
  "should_extract": false
}

用户说：{userMessage}
AI回复：{aiResponse}`;

  // category 中文映射
  const CATEGORY_LABELS = {
    insight: '洞察',
    decision: '决策',
    learning: '学习',
    idea: '灵感',
    resource: '资源'
  };

  // ===== 去重：防止短时间内重复提取相似内容 =====
  let _recentExtractions = []; // [{title, timestamp}]
  const DEDUP_WINDOW = 5 * 60 * 1000; // 5分钟去重窗口
  const DEDUP_MAX = 20; // 最多保留20条记录

  /**
   * 检查是否与最近提取的内容重复
   */
  function _isDuplicate(title) {
    const now = Date.now();
    // 清理过期记录
    _recentExtractions = _recentExtractions.filter(r => now - r.timestamp < DEDUP_WINDOW);
    // 检查标题相似度（简单：完全相同或包含关系）
    const normalizedTitle = title.trim().toLowerCase();
    return _recentExtractions.some(r =>
      r.title.trim().toLowerCase() === normalizedTitle ||
      (normalizedTitle.length > 4 && r.title.trim().toLowerCase().includes(normalizedTitle)) ||
      (r.title.trim().toLowerCase().length > 4 && normalizedTitle.includes(r.title.trim().toLowerCase()))
    );
  }

  /**
   * 记录已提取的标题
   */
  function _recordExtraction(title) {
    _recentExtractions.push({ title, timestamp: Date.now() });
    if (_recentExtractions.length > DEDUP_MAX) {
      _recentExtractions = _recentExtractions.slice(-DEDUP_MAX);
    }
  }

  // ===== API Key 获取 =====

  /**
   * 获取 DeepSeek API Key（复用 SecureStorage 逻辑）
   */
  async function _getAPIKey() {
    try {
      if (typeof SecureStorage !== 'undefined' && SecureStorage.getAPIKey) {
        return await SecureStorage.getAPIKey('deepseek_api_key');
      }
      if (typeof SecureStorage !== 'undefined' && SecureStorage.loadSecure) {
        return await SecureStorage.loadSecure('deepseek_token');
      }
      // 回退到明文
      const setting = await Storage.get('settings', 'deepseek_token');
      return setting ? setting.value : null;
    } catch (e) {
      console.warn('[KnowledgeExtractor] 获取 API Key 失败:', e);
      return null;
    }
  }

  // ===== DeepSeek API 调用 =====

  /**
   * 调用 DeepSeek API 提取知识
   */
  async function _callExtractAPI(token, userMessage, aiResponse) {
    const prompt = EXTRACT_PROMPT
      .replace('{userMessage}', userMessage)
      .replace('{aiResponse}', aiResponse);

    const messages = [
      { role: 'system', content: '你是知识提取助手，只输出JSON格式，不输出任何其他内容。' },
      { role: 'user', content: prompt }
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: messages,
          temperature: 0.1, // 低温度，确保稳定输出
          max_tokens: 300,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!resp.ok) {
        console.warn('[KnowledgeExtractor] API 返回错误:', resp.status);
        return null;
      }

      const data = await resp.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        const content = data.choices[0].message.content.trim();
        // 尝试解析 JSON
        try {
          // 处理可能的 markdown 代码块包裹
          let jsonStr = content;
          if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
          }
          return JSON.parse(jsonStr);
        } catch (parseErr) {
          console.warn('[KnowledgeExtractor] JSON 解析失败:', content.substring(0, 100));
          return null;
        }
      }
      return null;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        console.warn('[KnowledgeExtractor] API 请求超时');
      } else {
        console.warn('[KnowledgeExtractor] API 调用失败:', err.message);
      }
      return null;
    }
  }

  // ===== 保存到知识库 =====

  /**
   * 保存知识条目到 IndexedDB
   */
  async function _saveToKnowledge(entry) {
    try {
      // 兼容 KnowledgeModule 的数据结构
      const now = Date.now();
      const data = {
        title: entry.title,
        content: entry.content,
        type: 'note', // 知识库模块的 type: article/note/excerpt
        tags: entry.tags || [],
        source: 'xiaolu_chat',
        category: entry.category || 'learning',
        relatedTopic: entry.related_topic || '',
        conversationSnippet: entry.conversation_snippet || '',
        createdAt: now,
        updatedAt: now
      };

      await Storage.add(STORE_NAME, data);
      console.log('[KnowledgeExtractor] 知识已保存:', entry.title);
      return true;
    } catch (e) {
      console.error('[KnowledgeExtractor] 保存知识失败:', e);
      return false;
    }
  }

  // ===== Toast 通知 =====

  /**
   * 显示可点击的知识沉淀通知
   */
  function _showExtractionNotice(entry) {
    // 移除已有的知识提取 toast
    const existing = document.getElementById('knowledge-extract-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'knowledge-extract-toast';

    const categoryLabel = CATEGORY_LABELS[entry.category] || '知识';
    const tagsStr = (entry.tags || []).slice(0, 2).join('、');

    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 20px;
      background: linear-gradient(135deg, #8B6914, #A0784C);
      color: #FFF8F0;
      padding: 12px 18px;
      border-radius: 12px;
      font-size: 13px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease, transform 0.3s ease;
      transform: translateY(10px);
      cursor: pointer;
      max-width: 320px;
      box-shadow: 0 4px 16px rgba(139, 105, 20, 0.3);
      line-height: 1.5;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    `;

    toast.innerHTML = `
      <span style="font-size:16px;flex-shrink:0;">💡</span>
      <div>
        <div style="font-weight:600;margin-bottom:2px;">已沉淀 1 条${categoryLabel}到知识库</div>
        <div style="opacity:0.85;font-size:12px;">${entry.title}${tagsStr ? ' · ' + tagsStr : ''}</div>
        <div style="opacity:0.7;font-size:11px;margin-top:2px;">点击查看 →</div>
      </div>
    `;

    document.body.appendChild(toast);

    // 动画显示
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // 点击跳转到知识库
    toast.addEventListener('click', () => {
      if (typeof Router !== 'undefined' && Router.navigate) {
        Router.navigate('knowledge');
      }
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    });

    // 3秒后自动消失
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, 300);
      }
    }, 3000);
  }

  // ===== 主入口 =====

  /**
   * 分析对话内容，提取知识
   * 由 xiaolu.js 在 AI 回复完成后异步调用
   * @param {string} userMessage - 用户消息
   * @param {string} aiResponse - AI 回复
   */
  async function analyzeConversation(userMessage, aiResponse) {
    // 基本校验
    if (!userMessage || !aiResponse) return;
    if (userMessage.trim().length < 5) return; // 太短的消息不值得分析
    if (aiResponse.trim().length < 10) return;

    // 截取过长的内容（控制 token 开销）
    const maxLen = 800;
    const truncatedUser = userMessage.length > maxLen ? userMessage.substring(0, maxLen) + '...' : userMessage;
    const truncatedAI = aiResponse.length > maxLen ? aiResponse.substring(0, maxLen) + '...' : aiResponse;

    try {
      // 获取 API Key
      const token = await _getAPIKey();
      if (!token) {
        // API Key 不可用，静默关闭
        return;
      }

      // 调用 DeepSeek API 分析
      const result = await _callExtractAPI(token, truncatedUser, truncatedAI);
      if (!result || !result.should_extract) {
        return; // 无需提取
      }

      // 校验提取结果
      if (!result.title || !result.content) {
        console.warn('[KnowledgeExtractor] 提取结果缺少必要字段');
        return;
      }

      // 去重检查
      if (_isDuplicate(result.title)) {
        console.log('[KnowledgeExtractor] 内容与近期提取重复，跳过:', result.title);
        return;
      }

      // 构建知识条目
      const entry = {
        title: result.title.trim().substring(0, 30),
        content: result.content.trim().substring(0, 500),
        tags: Array.isArray(result.tags) ? result.tags.slice(0, 5) : [],
        category: result.category || 'learning',
        related_topic: result.related_topic || '',
        conversation_snippet: `用户：${truncatedUser}\n小鹿：${truncatedAI}`
      };

      // 保存到知识库
      const saved = await _saveToKnowledge(entry);
      if (!saved) return;

      // 记录去重
      _recordExtraction(entry.title);

      // 发送事件
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('knowledge:extracted', {
          title: entry.title,
          category: entry.category,
          source: 'xiaolu_chat'
        });
      }

      // 显示通知
      _showExtractionNotice(entry);

      console.log('[KnowledgeExtractor] 知识沉淀成功:', entry.title);
    } catch (err) {
      // 全局兜底：静默忽略
      console.warn('[KnowledgeExtractor] 分析失败:', err.message);
    }
  }

  return { analyzeConversation };
})();
