/**
 * emotion-analyzer.js - 情感识别系统
 * 人生工作台 · 基于中文文本的情感分析
 * 纯本地实现，零 API 成本，支持情感词典匹配与程度副词增强
 * v1.0 - 第十四批优化：情感识别系统
 */

const EmotionAnalyzer = (() => {
  // ===== 情感词典 =====

  /** 正面情感词（权重 1.0） */
  const POSITIVE_WORDS = [
    '开心', '高兴', '快乐', '幸福', '满足', '兴奋', '期待', '感恩', '充实', '欣慰',
    '激动', '骄傲', '感动', '甜蜜', '愉悦', '惊喜', '放松', '愉快', '自信', '温暖',
    '舒服', '棒', '厉害', '不错', '哈哈', '耶', '加油', '赞', '牛', '美好',
    '顺利', '成功', '完美', '精彩', '幸运', '乐观'
  ];

  /** 负面情感词（权重 -1.0） */
  const NEGATIVE_WORDS = [
    '难过', '沮丧', '焦虑', '压力', '疲惫', '迷茫', '烦躁', '失落', '孤独', '无聊',
    '郁闷', '伤心', '痛苦', '绝望', '愤怒', '恐惧', '担忧', '紧张', '不安', '委屈',
    '心酸', '无奈', '厌倦', '讨厌', '烦', '累', '崩溃', 'emo', '破防', '惆怅',
    '抑郁', '消沉', '颓废', '焦躁', '忧伤', '懊恼'
  ];

  /** 程度副词（增强系数 1.5） */
  const INTENSIFIERS = [
    '很', '非常', '特别', '超级', '极其', '太', '真', '好', '超', '巨'
  ];

  /** 程度副词的最大回溯距离（字符数） */
  const INTENSIFIER_WINDOW = 3;

  /** 否定词（反转情感极性） */
  const NEGATION_WORDS = ['不', '没', '没有', '别', '非', '未', '莫', '勿'];

  /** 否定词的最大回溯距离（字符数） */
  const NEGATION_WINDOW = 3;

  // ===== 核心分析方法 =====

  /**
   * 分析文本情感
   * @param {string} text - 待分析的中文文本
   * @returns {{ score: number, label: string, keywords: string[] }} 情感分析结果
   *   - score: 归一化到 [-1, 1] 的情感分值
   *   - label: 'positive' | 'neutral' | 'negative'
   *   - keywords: 匹配到的情感关键词列表
   */
  function analyze(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, label: 'neutral', keywords: [] };
    }

    const normalizedText = text.toLowerCase();
    let positiveScore = 0;
    let negativeScore = 0;
    const keywords = [];

    // 扫描正面词
    for (const word of POSITIVE_WORDS) {
      let searchFrom = 0;
      while (true) {
        const idx = normalizedText.indexOf(word, searchFrom);
        if (idx === -1) break;

        let weight = 1.0;

        // 检查前方是否有程度副词（增强 ×1.5）
        const prefixStart = Math.max(0, idx - INTENSIFIER_WINDOW);
        const prefix = normalizedText.substring(prefixStart, idx);
        if (INTENSIFIERS.some(intensifier => prefix.includes(intensifier))) {
          weight *= 1.5;
        }

        // 检查前方是否有否定词（反转极性 → 正面词变为负面分值）
        if (NEGATION_WORDS.some(neg => prefix.includes(neg))) {
          negativeScore += weight;
        } else {
          positiveScore += weight;
        }

        if (!keywords.includes(word)) {
          keywords.push(word);
        }
        searchFrom = idx + word.length;
      }
    }

    // 扫描负面词
    for (const word of NEGATIVE_WORDS) {
      let searchFrom = 0;
      while (true) {
        const idx = normalizedText.indexOf(word, searchFrom);
        if (idx === -1) break;

        let weight = 1.0;

        // 检查前方是否有程度副词（增强 ×1.5）
        const prefixStart = Math.max(0, idx - INTENSIFIER_WINDOW);
        const prefix = normalizedText.substring(prefixStart, idx);
        if (INTENSIFIERS.some(intensifier => prefix.includes(intensifier))) {
          weight *= 1.5;
        }

        // 检查前方是否有否定词（反转极性 → 负面词变为正面分值）
        if (NEGATION_WORDS.some(neg => prefix.includes(neg))) {
          positiveScore += weight;
        } else {
          negativeScore += weight;
        }

        if (!keywords.includes(word)) {
          keywords.push(word);
        }
        searchFrom = idx + word.length;
      }
    }

    // 计算原始分值
    const rawScore = positiveScore - negativeScore;

    // 归一化到 [-1, 1]：使用 sigmoid-like 映射
    // 分值越大越接近 1，越小越接近 -1，0 附近线性度好
    const score = _normalize(rawScore);

    // 确定标签
    const label = score > 0.15 ? 'positive' : (score < -0.15 ? 'negative' : 'neutral');

    return { score, label, keywords };
  }

  /**
   * 归一化原始分值到 [-1, 1]
   * 使用 tanh 函数实现平滑映射
   * @param {number} raw - 原始分值
   * @returns {number} 归一化分值 [-1, 1]
   * @private
   */
  function _normalize(raw) {
    if (raw === 0) return 0;
    // tanh 映射：保留方向和相对强度，自然压缩到 (-1, 1)
    // 除以 2 让常见单词匹配（raw ≈ 1）落在 0.46 左右
    return Math.tanh(raw / 2);
  }

  // ===== 回复策略 =====

  /**
   * 根据情感分值获取回复策略
   * @param {number|{ score: number, label: string, keywords: string[] }} emotionResult
   *   情感分值（数字）或 analyze() 的完整返回对象
   * @returns {string} 回复策略标签：'celebrate' | 'encourage' | 'comfort' | 'support'
   */
  function getResponseStrategy(emotionResult) {
    // 兼容传入 analyze() 完整结果对象或纯数字
    const score = (typeof emotionResult === 'object' && emotionResult !== null)
      ? emotionResult.score
      : Number(emotionResult) || 0;

    if (score > 0.5) return 'celebrate';   // 一起庆祝，"太棒了！"
    if (score > 0) return 'encourage';     // 鼓励继续，"继续保持！"
    if (score > -0.5) return 'comfort';    // 安慰关心，"怎么啦？聊聊？"
    return 'support';                       // 提供支持，"我在这，有什么能帮你的吗？"
  }

  // ===== 情绪记录（IndexedDB 持久化） =====

  /**
   * 记录情绪分析结果到 IndexedDB
   * 存储在 settings 表中，key 格式：emotion_<timestamp>
   * @param {{ score: number, label: string, keywords: string[] }} result - analyze() 返回值
   * @returns {Promise<void>}
   */
  async function record(result) {
    try {
      const timestamp = Date.now();
      const key = `emotion_${timestamp}`;
      const record = {
        key,
        timestamp,
        score: result.score,
        label: result.label,
        keywords: result.keywords
      };
      if (typeof Storage !== 'undefined' && Storage.put) {
        await Storage.put('settings', record);
      }
    } catch (err) {
      console.warn('[EmotionAnalyzer] 记录情绪失败:', err);
    }
  }

  /**
   * 获取最近 N 天的情绪记录
   * @param {number} [days=7] - 回溯天数
   * @returns {Promise<Array<{ timestamp: number, score: number, label: string, keywords: string[] }>>}
   */
  async function getEmotionHistory(days = 7) {
    try {
      if (typeof Storage === 'undefined' || !Storage.getAll) {
        return [];
      }

      const allSettings = await Storage.getAll('settings');
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      // 筛选 emotion_ 前缀且在时间范围内的记录
      const records = allSettings
        .filter(item => item.key && item.key.startsWith('emotion_') && item.timestamp >= cutoff)
        .map(item => ({
          timestamp: item.timestamp,
          score: item.score,
          label: item.label,
          keywords: item.keywords || []
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      return records;
    } catch (err) {
      console.warn('[EmotionAnalyzer] 获取情绪历史失败:', err);
      return [];
    }
  }

  /**
   * 获取与日记模块关联的情绪数据
   * 如果日记模块已有情绪标签（mood_emoji），则复用日记数据
   * @param {number} [days=7] - 回溯天数
   * @returns {Promise<Array<{ date: string, mood: string|null, score: number|null, source: string }>>}
   */
  async function getJournalLinkedEmotions(days = 7) {
    try {
      if (typeof Storage === 'undefined' || !Storage.getAll) {
        return [];
      }

      const allJournals = await Storage.getAll('journal');
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      // 日记的情绪映射（与 journal.js 的 MOOD_CONFIG 对齐）
      const MOOD_SCORE_MAP = {
        '😄': 1.0,
        '😊': 0.5,
        '😐': 0,
        '😔': -0.5,
        '😢': -1.0
      };

      return allJournals
        .filter(j => j.date && j.date >= cutoffStr)
        .map(j => ({
          date: j.date,
          mood: j.mood_emoji || null,
          score: j.mood_emoji ? (MOOD_SCORE_MAP[j.mood_emoji] ?? null) : null,
          source: 'journal'
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (err) {
      console.warn('[EmotionAnalyzer] 获取日记关联情绪失败:', err);
      return [];
    }
  }

  /**
   * 分析并记录（便捷方法：analyze + record 一步完成）
   * @param {string} text - 待分析的中文文本
   * @returns {Promise<{ score: number, label: string, keywords: string[] }>} 情感分析结果
   */
  async function analyzeAndRecord(text) {
    const result = analyze(text);
    await record(result);
    return result;
  }

  // ===== 清理旧记录 =====

  /**
   * 清理超过指定天数的情绪记录
   * @param {number} [maxDays=90] - 保留最近多少天的记录
   * @returns {Promise<number>} 清理的记录数
   */
  async function cleanup(maxDays = 90) {
    try {
      if (typeof Storage === 'undefined' || !Storage.getAll) {
        return 0;
      }

      const allSettings = await Storage.getAll('settings');
      const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
      let removed = 0;

      for (const item of allSettings) {
        if (item.key && item.key.startsWith('emotion_') && item.timestamp < cutoff) {
          await Storage.remove('settings', item.key);
          removed++;
        }
      }

      if (removed > 0) {
        console.log(`[EmotionAnalyzer] 清理了 ${removed} 条过期情绪记录`);
      }
      return removed;
    } catch (err) {
      console.warn('[EmotionAnalyzer] 清理情绪记录失败:', err);
      return 0;
    }
  }

  // ===== 暴露 API =====
  return {
    analyze,
    getResponseStrategy,
    record,
    getEmotionHistory,
    getJournalLinkedEmotions,
    analyzeAndRecord,
    cleanup
  };
})();
