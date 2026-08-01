# 人生工作台 · 内置 AI 更智能方案

> 版本：v1.0 | 日期：2026-08-02 | 状态：待实施

---

## 一、当前 AI 能力分析

### 1.1 小鹿 AI（🦌 XiaoluModule）

| 维度 | 现状 | 评分 |
|------|------|------|
| **定位** | 幽默轻松的 AI 伙伴，日常聊天 + 操作执行 | ⭐⭐⭐ |
| **意图识别** | 链式 3 跳 Decomposed LLM（分类→提取→生成） | ⭐⭐⭐⭐ |
| **操作执行** | 支持 record_finance / create_task / habit_log | ⭐⭐⭐ |
| **降级策略** | 关键词规则 → AI 3 跳 → 模板化回复 | ⭐⭐⭐⭐ |
| **语音输入** | Web Speech API + 长按触发 + 滑出取消 | ⭐⭐⭐ |
| **上下文** | 最多 20 条消息历史 | ⭐⭐ |
| **撤销操作** | 15 分钟内撤销 + 过期自动清理 | ⭐⭐⭐⭐ |
| **API 成本** | 每次对话 3 次 API 调用（意图 3 跳） | ⭐⭐ |

**能力边界**：
- ❌ 不理解用户历史数据（不知道"最近花太多"）
- ❌ 无法执行复杂操作（只支持 3 种工具）
- ❌ 无个性化记忆（每次对话都是新朋友）
- ❌ 无主动提醒（只被动响应）
- ❌ 语音识别准确率依赖浏览器

### 1.2 妮可 AI（💎 NicoleModule）

| 维度 | 现状 | 评分 |
|------|------|------|
| **定位** | 严谨的系统管家 → 主动军师 | ⭐⭐⭐⭐ |
| **信息处理** | 五阶段流水线（Collect→Annotate→Cluster→Refine→Spawn） | ⭐⭐⭐⭐⭐ |
| **数据采集** | 9 个维度全量采集 | ⭐⭐⭐⭐ |
| **关联分析** | 6 条关联规则 + AI 增强标注 | ⭐⭐⭐ |
| **洞察生成** | AI 精炼 → 代码降级模板 | ⭐⭐⭐ |
| **通知触发** | 写入通知 + 更新 DOM + 缓存 | ⭐⭐⭐ |
| **对话能力** | 基于 Coze Bot，有上下文记忆 | ⭐⭐⭐ |
| **缓存机制** | 当日缓存 + DOM 渲染 | ⭐⭐⭐⭐ |

**能力边界**：
- ❌ 五阶段流水线串行执行，耗时 5-15 秒
- ❌ 关联规则只有 6 条，覆盖面窄
- ❌ AI 标注依赖 Coze Token 可用性
- ❌ 无个性化（所有用户同一套规则）
- ❌ 洞察只输出文字，无操作建议

---

## 二、更智能的意图识别

### 2.1 多轮对话上下文理解（优先级：高 | 难度：中 | 预期效果：对话准确率 +40%）

**现状**：小鹿的 3 跳意图识别只看当前消息，不理解"它"指代什么。

**方案**：多轮意图追踪

```javascript
// 对话上下文追踪器
const ContextTracker = {
  _slots: {},         // 槽位信息（金额、分类等）
  _lastIntent: null,  // 上一轮意图
  _turnCount: 0,      // 当前对话轮次
  
  update(intent, params) {
    // 合并槽位（新值覆盖旧值，旧值保留未填充的）
    this._slots = { ...this._slots, ...params };
    this._lastIntent = intent;
    this._turnCount++;
  },
  
  getAugmentedMessage(userMessage) {
    // 如果用户说"改成50"，结合上下文理解
    if (/改成|改为|修改|换成/.test(userMessage) && this._lastIntent) {
      const slots = this._slots;
      return `用户在修改上一轮的操作。上一轮意图：${this._lastIntent}，参数：${JSON.stringify(slots)}。用户最新消息："${userMessage}"`;
    }
    
    // 如果用户说"再加上打车10块"，追加操作
    if (/再加上|还有|另外|也/.test(userMessage) && this._lastIntent) {
      return `用户想追加操作。上一轮意图：${this._lastIntent}。用户最新消息："${userMessage}"`;
    }
    
    return userMessage;
  },
  
  clear() {
    this._slots = {};
    this._lastIntent = null;
    this._turnCount = 0;
  }
};
```

**交互示例**：
```
用户：午饭花了35
小鹿：记下了，午饭 ¥35 🍜

用户：改成40
小鹿：好的，已改成 ¥40 ✏️

用户：再加上打车15
小鹿：收到，追记交通 ¥15 🚗
```

### 2.2 模糊意图识别（优先级：高 | 难度：中 | 预期效果：用户学习成本 -60%）

**现状**：用户必须说"花了XX"或"记一笔收入"才能触发财务录入。

**方案**：模糊意图 → 澄清对话

```javascript
// 模糊意图处理器
const FuzzyIntentHandler = {
  patterns: [
    // 模糊模式 → 可能的意图 → 澄清问题
    {
      match: /花了|消费|支出/,
      possibleIntents: ['finance_record'],
      needClarify: ['amount'],
      questions: {
        amount: '花了多少呀？告诉我金额就好 🦌'
      }
    },
    {
      match: /记得|别忘了/,
      possibleIntents: ['task_create', 'journal_entry'],
      needClarify: ['intent_type'],
      questions: {
        intent_type: '是要创建任务还是记个备忘？🤔'
      }
    },
    {
      match: /今天|好累|好开心/,
      possibleIntents: ['journal_entry', 'chat'],
      needClarify: [],
      // 有情绪词时自动触发日记建议
      autoSuggest: '要记一篇日记吗？📝'
    }
  ],
  
  async handle(text) {
    for (const pattern of this.patterns) {
      if (pattern.match.test(text)) {
        const missing = pattern.needClarify.filter(key => !this._hasSlot(key, text));
        if (missing.length > 0) {
          const question = pattern.questions[missing[0]];
          return { type: 'clarify', question, possibleIntents: pattern.possibleIntents };
        }
        if (pattern.autoSuggest) {
          return { type: 'suggest', message: pattern.autoSuggest };
        }
      }
    }
    return null;
  }
};
```

### 2.3 意图缓存（优先级：中 | 难度：低 | 预期效果：API 调用 -30%）

**现状**：每次消息都调用 3 次 API。

**方案**：高频意图走本地规则，中频意图走缓存，低频意图走 API

```
意图频率分布（预估）：
- 财务记录：40% → 本地关键词规则（零 API）
- 任务创建：25% → 本地关键词规则（零 API）
- 习惯打卡：15% → 本地关键词规则（零 API）
- 日常聊天：15% → API 调用
- 复杂操作：5% → API 调用
```

当前已有关键词规则，但只有 4 条。扩展到覆盖更多场景：

```javascript
// 扩展的关键词规则
const EXTENDED_RULES = [
  // 现有规则...
  
  // 新增：周报/月报生成
  { keywords: ['周报', '周总结', '本周总结'], intent: 'report_weekly' },
  { keywords: ['月报', '月总结', '本月总结'], intent: 'report_monthly' },
  
  // 新增：数据查询
  { keywords: ['花了多少', '支出多少', '本月消费'], intent: 'query_finance' },
  { keywords: ['做了多少', '完成几个', '任务进度'], intent: 'query_tasks' },
  { keywords: ['连续几天', '打卡几天', '坚持多久'], intent: 'query_habits' },
  
  // 新增：设置操作
  { keywords: ['设置预算', '改预算', '预算多少'], intent: 'setting_budget' },
  { keywords: ['改名字', '换个名字', '名字改成'], intent: 'setting_username' },
  
  // 新增：提醒操作
  { keywords: ['提醒我', '别忘了', '到时间了'], intent: 'reminder_create' },
];
```

---

## 三、个性化学习

### 3.1 基于用户习惯的个性化推荐（优先级：高 | 难度：中 | 预期效果：推荐准确率 +50%）

**方案**：构建用户行为画像

```javascript
const UserProfile = {
  // 用户行为特征
  _profile: {
    // 时间偏好
    activeHours: {},         // { 8: 5, 9: 12, ... } 每小时的活跃次数
    peakHour: 9,             // 最活跃时段
    
    // 模块偏好
    moduleFrequency: {},     // { habits: 30, tasks: 20, finance: 15, ... }
    favoriteModule: 'habits',
    
    // 操作模式
    avgTaskPerDay: 3,        // 日均创建任务数
    avgExpensePerDay: 85,    // 日均支出
    topCategories: ['餐饮', '交通'], // 高频消费分类
    
    // 习惯模式
    habitCompletionRate: 0.7,  // 习惯完成率
    missedHabits: ['早睡', '泡脚'], // 常漏的习惯
    
    // 情绪模式
    moodTrend: 'stable',      // stable/declining/improving
    
    // AI 交互模式
    preferredAI: 'xiaolu',    // 更多使用小鹿还是妮可
    voiceUsageRate: 0.3,      // 语音输入占比
  },
  
  async buildProfile() {
    // 从 IndexedDB 聚合用户行为数据
    const tasks = await Storage.getAll('tasks');
    const finances = await Storage.getAll('finance');
    const checkins = await Storage.getAll('checkins');
    
    // 计算时间偏好
    this._analyzeTimePreference(checkins);
    
    // 计算模块偏好
    this._analyzeModulePreference(tasks, finances, checkins);
    
    // 计算消费模式
    this._analyzeSpendingPattern(finances);
    
    // 计算习惯模式
    this._analyzeHabitPattern(checkins);
    
    // 保存画像
    await Storage.put('settings', { key: 'user_profile', value: this._profile });
  },
  
  getRecommendation() {
    const hour = new Date().getHours();
    const recs = [];
    
    // 基于时间的推荐
    if (hour >= 21 && this._profile.missedHabits.length > 0) {
      recs.push(`你常漏的习惯：${this._profile.missedHabits.join('、')}，今晚试试？`);
    }
    
    // 基于消费的推荐
    if (this._profile.avgExpensePerDay > 100) {
      recs.push('最近日均支出较高，关注一下预算');
    }
    
    // 基于完成率的推荐
    if (this._profile.habitCompletionRate < 0.5) {
      recs.push('习惯完成率较低，建议减少目标数量，先坚持核心习惯');
    }
    
    return recs;
  }
};
```

### 3.2 学习用户偏好（优先级：中 | 难度：中 | 预期效果：AI 回复更贴心）

**方案**：偏好学习引擎

```javascript
const PreferenceLearner = {
  _preferences: {
    // 语言风格偏好
    formalityLevel: 0.3,     // 0=随意 → 1=正式
    emojiUsage: 0.7,         // emoji 使用频率
    responseLength: 'short', // short/medium/long
    
    // 操作偏好
    autoConfirm: false,       // 是否自动确认 AI 操作
    defaultCategory: '其他',  // 未指定分类时的默认值
    defaultPriority: 'medium',// 未指定优先级时的默认值
    
    // 时间偏好
    reminderTime: '21:00',    // 习惯打卡提醒时间
    reportDay: 'sunday',      // 周报生成日
  },
  
  // 从对话中学习偏好
  learnFromInteraction(userMessage, aiReply, userAction) {
    // 如果用户经常说"简短点"→ 调低 responseLength
    if (/简短|简练|少说/.test(userMessage)) {
      this._preferences.responseLength = 'short';
    }
    
    // 如果用户经常加 emoji → 调高 emojiUsage
    if (/[🦌💎✅💰📋🔥💪]/.test(userMessage)) {
      this._preferences.emojiUsage = Math.min(1, this._preferences.emojiUsage + 0.1);
    }
    
    // 如果用户总是确认 AI 操作 → 开启 autoConfirm
    if (userAction === 'confirm' && this._confirmCount++ > 5) {
      this._preferences.autoConfirm = true;
    }
    
    this._save();
  },
  
  // 生成个性化 prompt 片段
  getPersonalizedPromptSuffix() {
    const p = this._preferences;
    let suffix = '';
    if (p.responseLength === 'short') suffix += '回复尽量简短，1-2句话。';
    if (p.emojiUsage > 0.5) suffix += '适当使用emoji。';
    if (p.formalityLevel < 0.5) suffix += '语气轻松随意，像朋友聊天。';
    return suffix;
  }
};
```

---

## 四、主动智能

### 4.1 主动提醒引擎（优先级：高 | 难度：中 | 预期效果：用户不遗漏重要事项）

**现状**：通知引擎只有 5 个定时检查器，且是规则驱动。

**升级方案**：智能提醒 = 规则 + AI 判断

```javascript
const SmartReminder = {
  // 规则层：确定性的定时提醒
  ruleReminders: [
    { time: '09:00', check: 'morningHabits', message: '早安！早上好习惯别忘了 🌅' },
    { time: '12:00', check: 'lunchReminder', message: '午间休息，吃好午餐 🍱' },
    { time: '21:00', check: 'eveningHabits', message: '晚上好，检查一下今天的习惯打卡 ✅' },
    { time: '22:30', check: 'sleepReminder', message: '快到睡觉时间了，准备休息吧 😴' },
  ],
  
  // 智能层：基于数据的动态提醒
  async checkSmartReminders() {
    const profile = await UserProfile.buildProfile();
    const reminders = [];
    
    // 1. 消费异常提醒
    const todayExpense = await this._getTodayExpense();
    const avgExpense = profile.avgExpensePerDay;
    if (todayExpense > avgExpense * 2) {
      reminders.push({
        type: 'spending_alert',
        message: `今天消费 ¥${todayExpense}，比日均高 ${Math.round(todayExpense/avgExpense*100-100)}%，注意控制 💰`,
        priority: 'high'
      });
    }
    
    // 2. 任务积压提醒
    const overdueTasks = await this._getOverdueTasks();
    if (overdueTasks.length >= 3) {
      reminders.push({
        type: 'task_backlog',
        message: `有 ${overdueTasks.length} 个任务逾期了，建议重新评估优先级 📋`,
        priority: 'high',
        action: 'review_tasks'
      });
    }
    
    // 3. 习惯断签风险
    const atRiskHabits = await this._getAtRiskHabits();
    if (atRiskHabits.length > 0) {
      reminders.push({
        type: 'habit_risk',
        message: `${atRiskHabits.join('、')} 快要断签了，今天完成一下？💪`,
        priority: 'medium'
      });
    }
    
    // 4. 周末总结提醒
    if (new Date().getDay() === 0 && new Date().getHours() >= 20) {
      reminders.push({
        type: 'weekly_review',
        message: '周日晚上，适合做一次周回顾 📊',
        priority: 'low',
        action: 'generate_weekly_report'
      });
    }
    
    return reminders;
  }
};
```

### 4.2 智能建议系统（优先级：中 | 难度：中 | 预期效果：AI 价值感 +60%）

**方案**：基于妮可 Pipeline 的分析结果，生成可操作建议

```javascript
// 建议类型与对应操作
const SUGGESTION_ACTIONS = {
  // 建议类型 → 可执行操作
  'spending_high': {
    message: '本月支出偏高',
    actions: [
      { label: '查看支出详情', route: 'finance', subRoute: 'category' },
      { label: '调整预算', route: 'finance', subRoute: 'budget' },
    ]
  },
  'task_overdue': {
    message: '有逾期任务',
    actions: [
      { label: '重新排期', action: 'reschedule_tasks' },
      { label: '降低优先级', action: 'deprioritize' },
      { label: '直接完成', action: 'complete_tasks' },
    ]
  },
  'habit_streak_risk': {
    message: '连续打卡可能中断',
    actions: [
      { label: '一键完成', action: 'complete_habits' },
      { label: '调整习惯目标', action: 'edit_habits' },
    ]
  },
  'no_exercise': {
    message: '本周没有运动',
    actions: [
      { label: '记录一次运动', action: 'log_exercise' },
      { label: '设置运动提醒', action: 'set_reminder' },
    ]
  }
};
```

### 4.3 预测性操作（优先级：低 | 难度：高 | 预期效果：自动化程度 +30%）

**方案**：基于历史模式预测下一步操作

```javascript
const PredictiveEngine = {
  // 基于时间的预测
  predictByTime() {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    
    // 工作日早上 → 提醒创建今日任务
    if (day >= 1 && day <= 5 && hour >= 7 && hour <= 9) {
      return { type: 'suggest_create_tasks', confidence: 0.8 };
    }
    
    // 工作日中午 → 提醒记录午餐支出
    if (day >= 1 && day <= 5 && hour >= 11 && hour <= 13) {
      return { type: 'suggest_record_lunch', confidence: 0.7 };
    }
    
    // 月末 → 提醒做月度复盘
    const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    if (new Date().getDate() >= lastDay - 2) {
      return { type: 'suggest_monthly_review', confidence: 0.9 };
    }
    
    return null;
  },
  
  // 基于行为的预测
  async predictByBehavior() {
    const recentActions = await this._getRecentActions(7); // 最近 7 天的操作
    
    // 如果最近 3 天都记录了晚餐支出
    const dinnerRecords = recentActions.filter(a => 
      a.type === 'finance_record' && a.category === '餐饮' && 
      a.note?.includes('晚餐')
    );
    if (dinnerRecords.length >= 3) {
      return { 
        type: 'auto_suggest_dinner', 
        confidence: 0.6,
        message: '要不要记录今晚的晚餐？' 
      };
    }
    
    return null;
  }
};
```

---

## 五、多模态交互

### 5.1 语音交互优化（优先级：高 | 难度：中 | 预期效果：语音可用性 +50%）

**现状问题**：
1. Web Speech API 在 Safari/Firefox 支持不完整
2. 语音识别没有降噪处理
3. 环境噪音导致误识别

**优化方案**：

```javascript
const VoiceProcessor = {
  // 1. 语音活动检测（VAD）
  // 检测到用户开始说话才启动识别，避免环境噪音误触发
  _vadThreshold: 0.15,  // 音量阈值
  
  async detectVoiceActivity(stream) {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    
    return new Promise((resolve) => {
      const check = () => {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        const volume = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
        
        if (volume > this._vadThreshold) {
          resolve(true);
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  },
  
  // 2. 多引擎 fallback
  // Web Speech API 不可用时，使用音频录制 + 服务端识别
  async recognize(audioBlob) {
    // 优先：浏览器原生 Speech API
    if (this._isNativeSupported()) {
      return this._nativeRecognize();
    }
    
    // 备选：DeepSeek 语音 API
    if (await this._isDeepSeekVoiceAvailable()) {
      return this._deepSeekRecognize(audioBlob);
    }
    
    // 最终降级：提示用户手动输入
    return { text: '', fallback: true };
  },
  
  // 3. 语音指令快捷操作
  // 无需打开 AI 面板，语音直接执行
  _voiceCommands: {
    '打卡': () => HabitsModule.quickCheckin(),
    '记一笔': (text) => QuickInput.open(text),
    '开始专注': () => TasksModule.startPomodoro(),
    '今天总结': () => NicoleModule.runDailyPipeline(),
  }
};
```

### 5.2 图像识别（优先级：低 | 难度：高 | 预期效果：录入效率 +200%）

**场景**：拍账单/收据自动录入财务

```javascript
const ImageRecognizer = {
  // 使用 DeepSeek Vision API 识别收据
  async recognizeReceipt(imageBlob) {
    const token = await this._getToken();
    const base64 = await this._blobToBase64(imageBlob);
    
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: base64 } },
            { type: 'text', text: '识别这张收据，提取：总金额、消费分类、商家名称、日期。输出JSON格式。' }
          ]
        })
      ])
    });
    
    const data = await resp.json();
    return this._parseReceiptResult(data);
  }
};
```

### 5.3 情感识别（优先级：低 | 难度：中 | 预期效果：AI 共情能力 +40%）

**方案**：基于文本的情感分析

```javascript
const EmotionAnalyzer = {
  // 中文情感词典（精简版）
  _positiveWords: ['开心', '高兴', '快乐', '幸福', '满足', '兴奋', '期待', '感恩', '充实'],
  _negativeWords: ['难过', '沮丧', '焦虑', '压力', '疲惫', '迷茫', '烦躁', '失落', '孤独'],
  _intensifiers: ['很', '非常', '特别', '超级', '极其'],
  
  analyze(text) {
    let score = 0;
    
    for (const word of this._positiveWords) {
      if (text.includes(word)) score += 1;
    }
    for (const word of this._negativeWords) {
      if (text.includes(word)) score -= 1;
    }
    for (const word of this._intensifiers) {
      if (text.includes(word)) score *= 1.5;
    }
    
    // 归一化到 [-1, 1]
    return Math.max(-1, Math.min(1, score / 3));
  },
  
  getResponseStrategy(emotionScore) {
    if (emotionScore > 0.5) return 'celebrate';    // 用户开心→一起庆祝
    if (emotionScore > 0) return 'encourage';       // 用户还好→鼓励继续
    if (emotionScore > -0.5) return 'comfort';      // 用户低落→安慰关心
    return 'support';                                // 用户很差→提供支持
  }
};
```

---

## 六、AI 协作增强

### 6.1 小鹿与妮可的协作（优先级：高 | 难度：中 | 预期效果：AI 价值互补）

**现状**：两个 AI 完全独立，互不通信。

**协作方案**：

```
用户输入 → 路由判断 → 小鹿/妮可
                 ↓
          共享上下文层
                 ↓
          协作决策引擎
```

```javascript
const AIOrchestrator = {
  // 智能路由：决定谁来处理
  route(userMessage) {
    // 妮可擅长：数据分析、健康检查、效率分析、目标审计
    if (/分析|检查|审计|报告|洞察|效率|健康|总结/.test(userMessage)) {
      return 'nicole';
    }
    
    // 小鹿擅长：操作执行、日常聊天、灵感整理
    if (/记录|创建|打卡|花了|任务|聊天|帮忙/.test(userMessage)) {
      return 'xiaolu';
    }
    
    // 模糊场景：小鹿先接，需要分析时调用妮可
    return 'xiaolu';
  },
  
  // 协作场景
  async collaborativeHandle(userMessage) {
    // 场景1：小鹿执行操作后，妮可更新洞察
    // "午饭花了35" → 小鹿记录 → 妮可更新今日消费洞察
    
    // 场景2：妮可发现问题时，小鹿提供执行建议
    // 妮可："本月支出偏高" → 小鹿："要不要看看餐饮支出的明细？"
    
    // 场景3：共享用户画像
    // 小鹿聊天中了解用户偏好 → 写入共享画像 → 妮可据此调整分析
  }
};
```

### 6.2 知识共享层（优先级：中 | 难度：低 | 预期效果：AI 上下文连贯性 +70%）

```javascript
// 两个 AI 共享的知识层
const SharedKnowledge = {
  _knowledge: {},
  
  // 小鹿写入
  set(key, value) {
    this._knowledge[key] = {
      value,
      source: 'xiaolu',
      updatedAt: Date.now()
    };
    this._persist();
  },
  
  // 妮可读取
  get(key) {
    return this._knowledge[key]?.value;
  },
  
  // 妮可分析后写入
  setAnalysis(key, analysis) {
    this._knowledge[key] = {
      value: analysis,
      source: 'nicole',
      updatedAt: Date.now()
    };
    this._persist();
  },
  
  // 生成给 AI prompt 的上下文片段
  getContextForPrompt(aiType) {
    const entries = Object.entries(this._knowledge);
    if (entries.length === 0) return '';
    
    const relevant = entries
      .filter(([k, v]) => Date.now() - v.updatedAt < 86400000) // 24h 内
      .map(([k, v]) => `${k}: ${JSON.stringify(v.value)} (来自${v.source === 'xiaolu' ? '小鹿' : '妮可'})`)
      .join('\n');
    
    return `\n## 共享上下文\n${relevant}`;
  }
};
```

---

## 七、外部 AI 服务集成

### 7.1 多模型路由（优先级：高 | 难度：中 | 预期效果：成本 -40% + 能力 +30%）

**现状**：小鹿固定 DeepSeek，妮可固定 Coze Bot。

**方案**：智能模型路由

```javascript
const ModelRouter = {
  models: {
    // 快速模型：意图分类、参数提取（低成本）
    'deepseek-chat': { cost: 0.001, speed: 'fast', capability: 'basic' },
    
    // 推理模型：复杂分析、深度洞察（中等成本）
    'deepseek-reasoner': { cost: 0.01, speed: 'medium', capability: 'reasoning' },
    
    // 视觉模型：图像识别（按需使用）
    'deepseek-chat-vision': { cost: 0.005, speed: 'slow', capability: 'vision' },
  },
  
  select(task) {
    switch(task) {
      case 'intent_classify':    // 意图分类 → 快速模型
      case 'param_extract':      // 参数提取 → 快速模型
        return 'deepseek-chat';
      
      case 'weekly_analysis':    // 周度分析 → 推理模型
      case 'goal_planning':      // 目标规划 → 推理模型
        return 'deepseek-reasoner';
      
      case 'receipt_ocr':        // 收据识别 → 视觉模型
        return 'deepseek-chat-vision';
      
      default:
        return 'deepseek-chat';
    }
  }
};
```

### 7.2 本地模型备选（优先级：低 | 难度：高 | 预期效果：离线 AI 可用）

**方案**：使用 WebAssembly 运行轻量级本地模型

| 场景 | 模型 | 大小 | 延迟 |
|------|------|------|------|
| 意图分类 | DistilBERT-tiny | 15MB | <100ms |
| 情感分析 | 小型中文情感模型 | 10MB | <50ms |
| 文本相似度 | MiniLM | 30MB | <200ms |

```javascript
// WebLLM 集成示例
const LocalAI = {
  _engine: null,
  
  async init() {
    if (!window.WebLLM) return false;
    try {
      this._engine = await WebLLM.CreateMLCEngine(
        'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
        { initProgressCallback: (p) => console.log('[LocalAI] Loading:', p) }
      );
      return true;
    } catch (e) {
      console.warn('[LocalAI] 初始化失败:', e);
      return false;
    }
  },
  
  async chat(messages) {
    if (!this._engine) return null;
    try {
      const reply = await this._engine.chat.completions.create({ messages });
      return reply.choices[0].message.content;
    } catch (e) {
      return null; // 降级到 API
    }
  }
};
```

---

## 八、隐私和安全的 AI 使用方案

### 8.1 数据最小化原则（优先级：高 | 难度：低 | 预期效果：隐私风险 -80%）

| 原则 | 具体措施 |
|------|---------|
| 最少数据 | API 调用只传必要字段，不传全量数据 |
| 匿名化 | 人名、地址等 PII 在发送前替换为占位符 |
| 本地优先 | 能本地判断的绝不调用 API |
| 不留痕 | API 响应不存储到 IndexedDB，只保留提取结果 |
| 用户知情 | 首次使用 AI 时明确告知数据使用方式 |

### 8.2 API Key 安全（优先级：高 | 难度：低 | 预期效果：凭证泄漏风险 -90%）

**现状**：API Key 存储在 IndexedDB settings 表中，明文存储。

**升级方案**：
```javascript
// 1. 加密存储
const SecureStorage = {
  _encryptionKey: null,
  
  async encrypt(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this._getEncryptionKey();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
  },
  
  async decrypt(encrypted) {
    const key = await this._getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
      key,
      new Uint8Array(encrypted.data)
    );
    return new TextDecoder().decode(decrypted);
  },
  
  async _getEncryptionKey() {
    if (this._encryptionKey) return this._encryptionKey;
    // 基于设备指纹生成密钥（不跨设备，但同一设备可用）
    const fingerprint = await this._getDeviceFingerprint();
    this._encryptionKey = await crypto.subtle.importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint)),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    return this._encryptionKey;
  }
};
```

### 8.3 AI 操作审计日志（优先级：中 | 难度：低 | 预期效果：操作可追溯）

```javascript
const AuditLog = {
  async log(action) {
    await Storage.add('audit_log', {
      timestamp: Date.now(),
      action: action.type,       // 'ai_finance_record' | 'ai_task_create' | ...
      source: action.source,     // 'xiaolu' | 'nicole' | 'quickinput'
      params: action.params,     // 脱敏后的参数
      result: action.result,     // 'success' | 'failed' | 'cancelled'
      userConfirmed: action.confirmed
    });
  },
  
  async getRecentLog(limit = 50) {
    const all = await Storage.getAll('audit_log');
    return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }
};
```

---

## 九、实施优先级总览

| 优先级 | 功能 | 难度 | 预期效果 | 预计工期 |
|--------|------|------|---------|---------|
| P0 | 意图缓存（减少 API 调用） | 低 | API 成本 -30% | 1 天 |
| P0 | 多轮对话上下文 | 中 | 准确率 +40% | 3 天 |
| P0 | 智能路由（小鹿/妮可协作） | 中 | AI 价值互补 | 3 天 |
| P1 | 主动提醒引擎 | 中 | 不遗漏事项 | 5 天 |
| P1 | 模糊意图识别 | 中 | 学习成本 -60% | 3 天 |
| P1 | 个性化用户画像 | 中 | 推荐准确率 +50% | 5 天 |
| P1 | API Key 加密存储 | 低 | 安全风险 -90% | 1 天 |
| P2 | 语音交互优化 | 中 | 语音可用性 +50% | 5 天 |
| P2 | 智能建议系统 | 中 | AI 价值感 +60% | 3 天 |
| P2 | 多模型路由 | 中 | 成本 -40% | 3 天 |
| P2 | 偏好学习 | 中 | AI 更贴心 | 3 天 |
| P3 | 图像识别 | 高 | 录入效率 +200% | 7 天 |
| P3 | 情感识别 | 中 | 共情能力 +40% | 3 天 |
| P3 | 本地模型备选 | 高 | 离线 AI 可用 | 10 天 |
| P3 | 预测性操作 | 高 | 自动化 +30% | 5 天 |

### 总体时间线

```
Week 1-2: P0 - 意图缓存 + 多轮对话 + 智能路由
Week 3-4: P1 - 主动提醒 + 模糊意图 + 个性化画像 + 安全加固
Week 5-6: P2 - 语音优化 + 智能建议 + 多模型 + 偏好学习
Week 7-9: P3 - 图像识别 + 情感识别 + 本地模型 + 预测操作
```

**总投入**：约 9 周（1 人全职）/ 5 周（2 人协作）
