/**
 * local-ai.js - 本地模型备选方案
 * 人生工作台 · 离线时的基础 AI 能力（意图分类、情感分析、本地回复生成）
 * 纯 JavaScript 实现，零额外依赖，不依赖任何大型模型下载
 * v1.0 - 第十七批优化：本地模型备选方案
 *
 * 设计理念：
 * - 离线时自动切换，在线时完全透明
 * - 复用 EmotionAnalyzer 模块做情感分析
 * - 基于增强关键词规则的意图分类（覆盖财务、任务、习惯、查询、设置等场景）
 * - 预置回复模板，风格与小鹿一致（轻松、简短、带emoji）
 * - 返回格式与现有 API 调用结果兼容
 */
import { EmotionAnalyzer } from './emotion-analyzer.js';
import { EventBus } from './event-bus.js';


export const LocalAI = (() => {
  // ===== 网络状态 =====
  let _isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
  let _forceLocal = false; // 强制本地模式开关
  let _listenersAttached = false;

  /**
   * 初始化网络状态监听
   * 监听 navigator.onLine 和 online/offline 事件，维护 isOffline 状态标志
   */
  function init() {
    if (_listenersAttached) return;
    _listenersAttached = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        _isOffline = false;
        console.log('[LocalAI] 网络恢复，切换到在线模式');
      });

      window.addEventListener('offline', () => {
        _isOffline = true;
        console.log('[LocalAI] 网络断开，切换到离线模式');
      });

      // 同步初始状态
      _isOffline = !navigator.onLine;
    }

    console.log('[LocalAI] 本地模型备选方案就绪 🏠（离线降级模式）');
  }

  /**
   * 判断当前是否应使用本地模式
   * @returns {boolean}
   */
  function isLocalMode() {
    return _forceLocal || _isOffline;
  }

  /**
   * 判断是否处于离线状态
   * @returns {boolean}
   */
  function isOffline() {
    return _isOffline;
  }

  /**
   * 设置强制本地模式开关
   * @param {boolean} force - true=强制本地模式，false=自动检测
   */
  function setForceLocal(force) {
    _forceLocal = Boolean(force);
    console.log(`[LocalAI] 强制本地模式: ${_forceLocal ? '开启' : '关闭'}`);
  }

  // ===== 本地意图分类（基于规则的增强版） =====

  /**
   * 意图规则定义
   * 每条规则包含：pattern（正则）、intent（意图名）、paramsExtractor（参数提取函数）
   * paramsExtractor 接收用户消息文本，返回参数对象
   */
  const INTENT_RULES = [
    // --- 财务记录 ---
    {
      pattern: /(?:花了|消费了?|支出了?|付了?|买了?|付了|交了|刷了|转了|扣了)\s*(\d+\.?\d*)\s*(?:元|块|块钱)?\s*(.*)?/,
      intent: 'finance_record',
      paramsExtractor: (text, match) => {
        const amount = parseFloat(match[1]);
        const note = (match[2] || '').trim();
        // 分类推断
        let category = '其他';
        const catMap = {
          '餐饮': /吃|喝|饭|餐|外卖|奶茶|咖啡|火锅|烧烤|零食|饮料|下午茶|宵夜|点餐|食堂|面包|水果|甜品/,
          '交通': /打车|地铁|公交|出租|滴滴|高铁|机票|火车|加油|停车|过路|骑行|单车|出行/,
          '购物': /买|购|淘宝|京东|拼多多|超市|商场|网购|下单|快递|包裹|衣服|鞋|包|化妆品/,
          '娱乐': /电影|游戏|KTV|唱歌|演出|门票|旅游|度假|会员|充值|视频|音乐/,
          '其他': /.*/
        };
        for (const [cat, regex] of Object.entries(catMap)) {
          if (cat !== '其他' && regex.test(text)) {
            category = cat;
            break;
          }
        }
        return { type: 'expense', amount, category, note, date: '' };
      }
    },
    {
      pattern: /(?:收入|收到|到账|赚了?|发了?|转入)\s*(\d+\.?\d*)\s*(?:元|块|块钱)?\s*(.*)?/,
      intent: 'finance_record',
      paramsExtractor: (text, match) => {
        const amount = parseFloat(match[1]);
        const note = (match[2] || '').trim();
        let source = '其他';
        if (/工资|薪水|月薪/.test(text)) source = '工资';
        else if (/奖金|年终|提成|绩效/.test(text)) source = '奖金';
        else if (/兼职|外快|副业|接单/.test(text)) source = '兼职';
        else if (/红包|转账|还钱|退款/.test(text)) source = '其他';
        return { type: 'income', amount, source, note, date: '' };
      }
    },
    // 更宽泛的支出匹配（没有明确金额的情况）
    {
      pattern: /(?:记账|记录?一笔|记一笔)(.*)(?:支出|花费|花销)/,
      intent: 'finance_record',
      paramsExtractor: (text) => {
        return { type: 'expense', amount: 0, category: '其他', note: text, date: '' };
      }
    },

    // --- 任务创建 ---
    {
      pattern: /(?:创建|添加|新建|建一个|记一个|设一个|安排)\s*(?:任务|待办|todo|TODO)/,
      intent: 'task_create',
      paramsExtractor: (text) => {
        // 尝试提取任务标题
        const titleMatch = text.match(/(?:任务|待办|todo|TODO)[：:]\s*(.+)/i)
          || text.match(/(?:创建|添加|新建|建一个|记一个)\s*(?:任务|待办|todo|TODO)\s*(.+)/i);
        const title = titleMatch ? titleMatch[1].trim() : text.trim();
        let priority = 'medium';
        if (/紧急|重要|尽快|赶紧|马上|立刻/.test(text)) priority = 'high';
        else if (/不急|慢慢|不着急|有空|方便时/.test(text)) priority = 'low';
        // 提取日期
        const dateMatch = text.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
        const due_date = dateMatch ? dateMatch[1].replace(/\//g, '-') : '';
        return { title, priority, due_date };
      }
    },
    // 更自然的任务表达
    {
      pattern: /(?:别忘了|记得|要记得|别忘了|记住|务必)\s*(.+)/,
      intent: 'task_create',
      paramsExtractor: (text, match) => {
        const title = match[1].trim();
        return { title, priority: 'medium', due_date: '' };
      }
    },
    // "明天要做XXX" 格式
    {
      pattern: /(?:明天|后天|下周|周末|今晚)\s*(?:要|得|得去|去|做|完成|搞定)\s*(.+)/,
      intent: 'task_create',
      paramsExtractor: (text, match) => {
        const title = match[1].trim();
        return { title, priority: 'medium', due_date: '' };
      }
    },

    // --- 习惯打卡 ---
    {
      pattern: /(?:打卡|签到|完成|check[\s-]?in|打卡了?)\s*(.+)/,
      intent: 'habit_log',
      paramsExtractor: (text, match) => {
        const habit = match[1].trim();
        return { habit, status: 'completed', note: '' };
      }
    },
    {
      pattern: /(?:跑步|运动|锻炼|健身|冥想|读书|阅读|学习|早起|早睡|喝水|练琴|写代码)\s*(?:打卡|完成|了|check[\s-]?in)/,
      intent: 'habit_log',
      paramsExtractor: (text) => {
        const habitMatch = text.match(/(跑步|运动|锻炼|健身|冥想|读书|阅读|学习|早起|早睡|喝水|练琴|写代码)/);
        const habit = habitMatch ? habitMatch[1] : text.trim();
        return { habit, status: 'completed', note: '' };
      }
    },
    // "今天跑步了" 格式
    {
      pattern: /(今天|今早|今晚|刚才)\s*(跑了?步|运动了?|锻炼了?|健身了?|冥想了?|读了?书|阅读了?|学了?习|早起了?|早睡了?|喝了?水)\s*(.*)?/,
      intent: 'habit_log',
      paramsExtractor: (text, match) => {
        const habit = match[2].replace(/了?$/, '');
        const note = (match[3] || '').trim();
        return { habit, status: 'completed', note };
      }
    },

    // --- 数据查询 ---
    {
      pattern: /(?:花了多少|支出多少|本月消费|这个月花了|消费多少|花了.*钱|总共花了|消费汇总|支出汇总|花了多少了)/,
      intent: 'query_finance',
      paramsExtractor: () => ({ queryType: 'expense' })
    },
    {
      pattern: /(?:本月收入|收入多少|赚了|工资|收入汇总|总共收入|赚了多少)/,
      intent: 'query_finance',
      paramsExtractor: () => ({ queryType: 'income' })
    },
    {
      pattern: /(?:做了多少|完成几个|任务进度|还有多少任务|待办多少|任务完成|任务概览|待办列表|还有什么任务)/,
      intent: 'query_tasks',
      paramsExtractor: () => ({})
    },
    {
      pattern: /(?:连续几天|打卡几天|坚持多久|打卡情况|习惯怎么样|打卡记录|习惯打卡|打卡了几天|坚持了几天)/,
      intent: 'query_habits',
      paramsExtractor: () => ({})
    },

    // --- 设置操作 ---
    {
      pattern: /(?:设置预算|改预算|预算多少|调整预算|预算设置)/,
      intent: 'setting_budget',
      paramsExtractor: () => ({})
    },
    {
      pattern: /(?:改名字|换个名字|名字改成|修改用户名)/,
      intent: 'setting_username',
      paramsExtractor: () => ({})
    },

    // --- 日记建议 ---
    {
      pattern: /(?:写日记|日记建议|今天日记|日记灵感|写点什么)/,
      intent: 'journal_suggestion',
      paramsExtractor: () => ({})
    }
  ];

  /**
   * 本地意图分类
   * 基于增强关键词规则，返回 { intent, params, confidence } 格式
   * @param {string} text - 用户消息
   * @returns {{ intent: string, params: Object, confidence: number }}
   */
  function classifyIntent(text) {
    if (!text || typeof text !== 'string') {
      return { intent: 'unknown', params: {}, confidence: 0 };
    }

    const normalizedText = text.trim();

    // 遍历规则，匹配第一个命中的
    for (const rule of INTENT_RULES) {
      const match = normalizedText.match(rule.pattern);
      if (match) {
        const params = rule.paramsExtractor(normalizedText, match);
        // 置信度基于规则精确度：
        // - 有金额/数字提取 → 高置信度
        // - 通用模式 → 中等置信度
        let confidence = 0.7;
        if (/(\d+\.?\d*)/.test(normalizedText)) confidence = 0.85;
        if (params.amount > 0 || params.title) confidence = 0.9;

        return {
          intent: rule.intent,
          params,
          confidence
        };
      }
    }

    // 未匹配到任何规则
    return { intent: 'chat', params: {}, confidence: 0.3 };
  }

  // ===== 本地情感分析 =====

  /**
   * 本地情感分析
   * 复用 EmotionAnalyzer 模块，离线时直接用其结果
   * @param {string} text - 用户消息
   * @returns {{ score: number, label: string, keywords: string[], strategy: string }}
   */
  function analyzeSentiment(text) {
    // 优先使用 EmotionAnalyzer
    if (window.EmotionAnalyzer?.analyze) {
      try {
        const result = window.EmotionAnalyzer?.analyze(text);
        const strategy = window.EmotionAnalyzer?.getResponseStrategy
          ? window.EmotionAnalyzer?.getResponseStrategy(result)
          : _fallbackStrategy(result.score);
        return {
          score: result.score,
          label: result.label,
          keywords: result.keywords || [],
          strategy
        };
      } catch (e) {
        console.warn('[LocalAI] EmotionAnalyzer 调用失败，使用简易降级:', e);
      }
    }

    // 降级：简易情感分析
    return _simpleSentiment(text);
  }

  /**
   * 简易情感分析降级方案
   * @param {string} text
   * @returns {{ score: number, label: string, keywords: string[], strategy: string }}
   */
  function _simpleSentiment(text) {
    const positiveWords = ['开心', '高兴', '棒', '好', '厉害', '不错', '哈哈', '开心', '满意', '喜欢'];
    const negativeWords = ['难过', '烦', '累', '焦虑', '压力大', '不开心', '郁闷', '烦人', '无聊', '崩溃'];

    let score = 0;
    const keywords = [];
    for (const w of positiveWords) {
      if (text.includes(w)) { score += 1; keywords.push(w); }
    }
    for (const w of negativeWords) {
      if (text.includes(w)) { score -= 1; keywords.push(w); }
    }

    const normalized = Math.tanh(score / 2);
    const label = normalized > 0.15 ? 'positive' : (normalized < -0.15 ? 'negative' : 'neutral');
    return {
      score: normalized,
      label,
      keywords,
      strategy: _fallbackStrategy(normalized)
    };
  }

  /**
   * 回复策略降级
   * @param {number} score
   * @returns {string}
   */
  function _fallbackStrategy(score) {
    if (score > 0.5) return 'celebrate';
    if (score > 0) return 'encourage';
    if (score > -0.5) return 'comfort';
    return 'support';
  }

  // ===== 本地回复生成 =====

  /**
   * 回复模板
   * 按 intent 分组，每组包含默认模板和按情感策略变体
   */
  const REPLY_TEMPLATES = {
    finance_record: {
      default: (params) => {
        if (params.type === 'income') {
          return `💰 收到！已记录收入 ${params.amount || ''}元${params.source ? '（' + params.source + '）' : ''}～入账的感觉不错吧 🦌`;
        }
        return `📝 收到！已记录支出 ${params.amount || ''}元${params.category ? '（' + params.category + '）' : ''}～记下来心里有数 🦌`;
      },
      celebrate: (params) => params.type === 'income'
        ? `🎉 哇！收入 ${params.amount || ''}元入账！继续保持 💪🦌`
        : `📝 记好了 ${params.amount || ''}元支出，心情不错的话适度消费也没问题 🦌`,
      comfort: (params) => params.type === 'income'
        ? `💰 收入 ${params.amount || ''}元记上了，希望能让你心情好一点 🦌`
        : `📝 记下 ${params.amount || ''}元支出，别太有压力，合理消费就好 🦌`,
      support: (params) => params.type === 'income'
        ? `💰 ${params.amount || ''}元收入已记录，一切都会好起来的 🦌`
        : `📝 ${params.amount || ''}元支出记下了，别担心，我在这里陪你 🦌`
    },
    task_create: {
      default: (params) => `📋 收到！已创建任务「${params.title || '新任务'}」${params.priority === 'high' ? '，标记为紧急⚡' : ''} 🦌`,
      celebrate: (params) => `📋 任务「${params.title || '新任务'}」建好啦！状态不错，继续冲 💪🦌`,
      comfort: (params) => `📋 任务「${params.title || '新任务'}」记上了，慢慢来不着急 🦌`,
      support: (params) => `📋 任务「${params.title || '新任务'}」记好了，一步一步来就好 🦌`
    },
    habit_log: {
      default: (params) => `✅ 棒！${params.habit || '习惯'}打卡成功～坚持就是胜利 🦌`,
      celebrate: (params) => `🎉 ${params.habit || '习惯'}打卡！状态太好了，继续保持 🔥🦌`,
      comfort: (params) => `✅ ${params.habit || '习惯'}打卡记上了～有在坚持就很棒 🦌`,
      support: (params) => `✅ ${params.habit || '习惯'}打卡了，每一天的努力都算数 🦌`
    },
    query_finance: {
      default: () => '💰 离线模式下暂时无法查询详细数据，恢复网络后我会帮你看看 🦌',
      celebrate: () => '💰 暂时查不了数据，不过心情好就行！网络恢复后帮你看 🦌',
      comfort: () => '💰 抱歉离线查不了数据，别担心，恢复了再帮你查 🦌',
      support: () => '💰 离线暂时查不了，恢复网络后第一时间帮你看 🦌'
    },
    query_tasks: {
      default: () => '📋 离线模式下暂时无法查询任务，恢复网络后我帮你看 🦌',
      celebrate: () => '📋 离线查不了任务列表，不过状态不错嘛！网络恢复后帮你看 🦌',
      comfort: () => '📋 离线暂时查不了任务，别急，恢复了再帮你 🦌',
      support: () => '📋 离线查不了任务，恢复后我马上帮你看 🦌'
    },
    query_habits: {
      default: () => '✅ 离线模式下暂时无法查询打卡记录，恢复网络后帮你看 🦌',
      celebrate: () => '✅ 离线查不了打卡数据，不过今天状态很好嘛！恢复后帮你看 🦌',
      comfort: () => '✅ 离线暂时查不了打卡，别担心，恢复后再看 🦌',
      support: () => '✅ 离线查不了打卡，网络恢复后帮你看看 🦌'
    },
    setting_budget: {
      default: () => '⚙️ 离线模式下暂时无法修改设置，恢复网络后帮你操作 🦌'
    },
    setting_username: {
      default: () => '⚙️ 离线模式下暂时无法修改设置，恢复网络后帮你操作 🦌'
    },
    journal_suggestion: {
      default: () => {
        const suggestions = [
          '📝 今天有什么让你印象深刻的事吗？试着写下来～',
          '📝 有没有今天特别想感谢的人或事？',
          '📝 今天学到了什么新东西？记录一下收获～',
          '📝 描述一下今天的情绪变化，从早到晚～',
          '📝 有什么小确幸想记录的吗？'
        ];
        return suggestions[Math.floor(Math.random() * suggestions.length)] + ' 🦌';
      }
    },
    chat: {
      default: () => {
        const replies = [
          '嗯嗯～我收到啦，不过现在离线模式，回复比较简陋 🦌',
          '收到～离线中，我能力有限，但还在陪着你 🦌',
          '嗯嗯，虽然离线回复简单，但我在听呢 🦌',
          '好的～离线模式只能简单回应，恢复网络后聊更多 🦌'
        ];
        return replies[Math.floor(Math.random() * replies.length)];
      },
      celebrate: () => {
        const replies = [
          '哈哈看起来心情不错！离线也能感受到你的快乐 😄🦌',
          '状态很好嘛～虽然离线简单回复，但为你开心 🎉🦌'
        ];
        return replies[Math.floor(Math.random() * replies.length)];
      },
      comfort: () => {
        const replies = [
          '嗯～听起来有点烦，我在陪你呢 🦌',
          '抱抱～离线回复有限，但我想让你知道我在 🦌',
          '别太难过，明天会更好的 🦌'
        ];
        return replies[Math.floor(Math.random() * replies.length)];
      },
      support: () => {
        const replies = [
          '我在这里，虽然离线只能简单回复，但一直陪着你 🦌',
          '有什么需要倾诉的尽管说，我听着呢 🦌',
          '你不是一个人，我会一直在 🦌'
        ];
        return replies[Math.floor(Math.random() * replies.length)];
      },
      encourage: () => {
        const replies = [
          '不错不错～继续保持！🦌',
          '加油！状态在线呢 💪🦌'
        ];
        return replies[Math.floor(Math.random() * replies.length)];
      }
    },
    unknown: {
      default: () => '🤔 离线模式暂时不太理解你的意思，恢复网络后我能帮更多 🦌'
    }
  };

  /**
   * 本地回复生成
   * 根据意图和情感选择合适的回复模板
   * @param {string} intent - 意图类别
   * @param {Object} params - 意图参数
   * @param {string} strategy - 情感回复策略
   * @returns {string} 生成的回复
   */
  function generateReply(intent, params, strategy) {
    const templates = REPLY_TEMPLATES[intent] || REPLY_TEMPLATES.unknown;
    // 优先使用匹配策略的模板，否则用 default
    const generator = templates[strategy] || templates.default;
    if (typeof generator === 'function') {
      return generator(params || {});
    }
    return '收到～离线模式回复有限，恢复网络后可以聊更多 🦌';
  }

  // ===== 降级策略 =====

  /**
   * 离线降级主入口
   * - 离线：用本地意图分类 → 本地情感分析 → 本地回复生成，返回完整结果
   * - 在线：返回 null，让正常 API 流程处理
   * @param {string} userMessage - 用户消息
   * @returns {{ reply: string, intent: string, params: Object, confidence: number, isLocal: boolean } | null}
   */
  function handleOffline(userMessage) {
    // 检查是否应使用本地模式
    if (!isLocalMode()) {
      return null; // 在线，让正常 API 流程处理
    }

    console.log(`[LocalAI] ${_forceLocal ? '强制本地模式' : '离线模式'}，使用本地 AI 降级`);

    // 1. 本地意图分类
    const intentResult = classifyIntent(userMessage);
    console.log('[LocalAI] 意图分类:', intentResult.intent, '置信度:', intentResult.confidence);

    // 2. 本地情感分析
    const sentimentResult = analyzeSentiment(userMessage);
    console.log('[LocalAI] 情感分析:', sentimentResult.label, '策略:', sentimentResult.strategy);

    // 3. 本地回复生成
    const reply = generateReply(intentResult.intent, intentResult.params, sentimentResult.strategy);

    // 4. 构建操作标签（如果意图是可执行的且有足够参数）
    let actionTag = '';
    if (intentResult.intent === 'finance_record' && intentResult.params.amount > 0) {
      actionTag = `[ACTION:${JSON.stringify({ tool: 'record_finance', params: intentResult.params })}]`;
    } else if (intentResult.intent === 'task_create' && intentResult.params.title) {
      actionTag = `[ACTION:${JSON.stringify({ tool: 'create_task', params: intentResult.params })}]`;
    } else if (intentResult.intent === 'habit_log' && intentResult.params.habit) {
      actionTag = `[ACTION:${JSON.stringify({ tool: 'habit_log', params: intentResult.params })}]`;
    }

    // 最终回复：操作标签 + 回复内容
    const fullReply = actionTag ? actionTag + '\n' + reply : reply;

    // 记录情绪（异步，不阻塞）
    if (window.EmotionAnalyzer?.record) {
      window.EmotionAnalyzer?.record({ score: sentimentResult.score, label: sentimentResult.label, keywords: sentimentResult.keywords }).catch(() => {});
    }

    return {
      reply: fullReply,
      intent: intentResult.intent,
      params: intentResult.params,
      confidence: intentResult.confidence,
      isLocal: true
    };
  }

  /**
   * 获取离线模式状态描述
   * @returns {string}
   */
  function getStatusText() {
    if (_forceLocal) return '强制本地模式（省流量）';
    if (_isOffline) return '离线模式';
    return '在线模式';
  }

  // ===== 暴露 API =====
  return {
    init,
    isOffline,
    isLocalMode,
    setForceLocal,
    handleOffline,
    classifyIntent,
    analyzeSentiment,
    generateReply,
    getStatusText
  };
})();
