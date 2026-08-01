# 人生工作台 (Life Work Space) - 架构分析报告

> 本报告基于对项目全部源代码的逐文件阅读，覆盖 HTML 入口、Service Worker、12 个核心模块、14 个功能模块、8 个样式文件，共计约 33,650 行代码。

---

## 目录

1. [整体架构](#1-整体架构)
2. [核心层 (core/)](#2-核心层)
3. [模块层 (modules/)](#3-模块层)
4. [样式层 (styles/)](#4-样式层)
5. [关键数据流](#5-关键数据流)
6. [已知问题与改进空间](#6-已知问题与改进空间)

---

## 1. 整体架构

### 1.1 入口文件 life.html 的结构

`life.html` 是整个 PWA 的唯一 HTML 入口，采用**单页应用 (SPA)** 架构。

#### 文档结构

```
<html>
├── <head>
│   ├── PWA meta 标签（viewport、theme-color、apple-mobile-web-app）
│   ├── manifest.json 引用
│   ├── 8 个全局样式 CSS（带版本号 ?v=24）
│   ├── 防闪白内联脚本（在渲染前立即读取 localStorage 应用主题）
│   └── 2 个额外样式（rest.css、templates.css）
├── <body>
│   ├── 侧边栏遮罩 (.sidebar-overlay)
│   ├── 应用容器 (.app-container)
│   │   ├── 左侧边栏 (#sidebar)
│   │   │   ├── 头像区
│   │   │   ├── AI 每日金句
│   │   │   ├── 打卡签到按钮 + 连续天数
│   │   │   ├── 导航菜单（12 个一级 + 3 个二级入口）
│   │   │   └── 版本号
│   │   └── 主区域 (.main-area)
│   │       ├── 顶部栏 (.topbar)
│   │       │   ├── 移动端菜单按钮
│   │       │   ├── 日期显示
│   │       │   ├── 通知铃铛 + 角标
│   │       │   ├── 休息模式按钮
│   │       │   ├── 生命树 / 设置快捷按钮
│   │       │   └── 更多菜单（搜索、白噪音、保存、同步、导出、导入、刷新、主题）
│   │       ├── 内容区 (#content-area) ← 路由动态加载
│   │       └── 通知面板 (#notif-panel)
│   ├── AI FAB 按钮组（🦌小鹿 + 💎妮可 + ⚡快速录入）
│   ├── 休息模式全屏覆盖 (#rest-overlay)
│   └── 25 个脚本（严格按依赖顺序加载）
```

#### 脚本加载顺序（关键依赖链）

```
1. core/storage.js        ← 数据持久层（所有模块依赖）
2. core/router.js         ← 路由系统
3-13. modules/*/*.js      ← 各功能模块（DashboardModule ~ LifeTreeModule）
14. core/notifications.js ← 通知引擎
15. core/nicole.js        ← 妮可系统管家
16. core/xiaolu.js        ← 小鹿 AI 伙伴
17. modules/whitenoise/   ← 白噪音
18. core/templates.js     ← 模板系统核心
19. modules/templates/    ← 模板页面 UI
20. core/export.js        ← 导入导出
21. core/search.js        ← 全局搜索
22. core/theme.js         ← 主题管理
23. core/sync.js          ← 云端同步
24. core/quickinput.js    ← 快速录入引擎
25. core/app.js           ← 主入口（初始化一切）
26. modules/rest/rest.js  ← 休息模式（自行初始化）
```

**设计特点**：所有模块通过 IIFE 模式暴露全局单例对象（如 `Storage`、`Router`、`App`），不使用 ES Module / bundler，脚本按依赖顺序在 HTML 中同步加载。

### 1.2 Service Worker (sw.js) 缓存策略

**版本标识**：`CACHE_NAME = 'life-workspace-v24'`

**预缓存资源**：`CACHE_ASSETS` 数组包含所有 HTML/CSS/JS 文件（约 60+ 个资源）。

**三级请求处理策略**：

| 请求类型 | 策略 | 说明 |
|---------|------|------|
| 导航请求 (`mode=navigate`) | **网络优先 + 缓存降级** | 优先取网络最新，失败时返回缓存的 `life.html` |
| 静态资源（已有缓存） | **缓存优先 + 后台更新** | 立即返回缓存副本，同时后台 fetch 更新缓存 |
| 静态资源（无缓存） | **网络请求 + 写入缓存** | 正常请求并缓存供离线使用 |

**版本更新机制**：
- `install` → 预缓存所有资源 → `skipWaiting()`
- `activate` → 清理旧版本缓存 → `clients.claim()`
- 页面端监听 `updatefound` → 新 SW 就绪后发送 `SKIP_WAITING` → 自动刷新

### 1.3 manifest.json PWA 配置

| 字段 | 值 | 说明 |
|------|------|------|
| name | 人生工作台 | 应用全名 |
| short_name | 工作台 | 桌面图标名 |
| display | standalone | 独立应用模式 |
| background_color | #D4BA9F | 暖棕色（与主题一致）|
| theme_color | #D4BA9F | 状态栏颜色 |
| orientation | any | 不限制方向 |
| icons | 192x192 / 512x512 | PNG 图标 |

---

## 2. 核心层 (core/)

### 2.1 storage.js — IndexedDB 封装

**定位**：全局数据持久层，所有数据读写均通过 `Storage` 对象。

**数据库信息**：
- 数据库名：`LifeWorkSpace`
- 当前版本：`DB_VERSION = 6`
- 单例 `_db` 缓存连接

**核心 API**：

| 方法 | 说明 |
|------|------|
| `getDB()` | 获取/创建数据库实例，含版本迁移逻辑 |
| `add(store, data)` | 添加记录 |
| `put(store, data)` | 更新/插入记录 |
| `get(store, key)` | 按主键获取单条 |
| `getAll(store)` | 获取表全部记录 |
| `getByIndex(store, index, value)` | 按索引查询 |
| `remove(store, key)` | 删除记录 |
| `clear(store)` | 清空表 |
| `count(store)` | 统计记录数 |
| `initSampleData()` | 首次访问初始化 |
| `migrateCourseData()` | 课程数据格式迁移 |

**完整数据表结构（6 个版本迁移）**：

| 表名 | keyPath | 索引 | 版本 | 说明 |
|------|---------|------|------|------|
| `checkins` | date | month | v1 | 每日打卡（日期为 key） |
| `habits` | id(auto) | category | v1 | 习惯定义 |
| `tasks` | id(auto) | status, date | v1 | 任务管理 |
| `study` | id(auto) | date | v1 | 学习记录 |
| `health` | id(auto) | date | v1 | 健康记录 |
| `finance` | id(auto) | month, type | v1 | 财务记录 |
| `settings` | key | - | v1 | 键值设置 |
| `meta` | key | - | v1 | 系统元数据 |
| `projects` | id(auto) | createdAt | v2 | 项目 |
| `pomodoros` | id(auto) | date, taskId | v2 | 番茄钟记录 |
| `semesters` | id(auto) | - | v3 | 学期 |
| `courses` | id(auto) | semesterId | v3 | 课程 |
| `books` | id(auto) | status | v3 | 书籍 |
| `skills` | id(auto) | - | v3 | 技能 |
| `journal` | id(auto) | date, type | v4 | 日记/复盘/灵感 |
| `goals` | id(auto) | level | v4 | 目标 |
| `contacts` | id(auto) | type | v4 | 联系人 |
| `knowledge` | id(auto) | type | v4 | 知识库条目 |
| `ideas` | id(auto) | date | v4 | 灵感 |
| `lifetree` | key | - | v4 | 生命树状态 |
| `notifications` | id(auto) | read, type, createdAt | v6 | 通知 |

**迁移机制**：采用 `migrations` 对象映射版本号到迁移函数，按 oldVersion+1 到 newVersion 顺序依次执行，支持跳版本升级。

### 2.2 router.js — 路由系统

**定位**：基于 `window.location.hash` 的 SPA 路由管理器。

**核心机制**：
- 路由格式：`#/dashboard`、`#/habits` 等
- 默认路由：`dashboard`
- 路由注册表 `routes`：`{path: handler}` 映射
- 监听器列表 `listeners`：路由变化回调数组
- 首次加载自动触发 `handleRouteChange()`

**API**：
| 方法 | 说明 |
|------|------|
| `register(path, handler)` | 注册路由 |
| `navigate(path)` | 导航（修改 hash） |
| `onRouteChange(callback)` | 监听路由变化 |
| `getCurrentRoute()` | 获取当前路由 |
| `init()` | 启动路由 |
| `destroy()` | 销毁路由 |

### 2.3 app.js — 全局初始化与主控制器

**定位**：应用主入口，负责初始化和全局协调。

**初始化流程**（`App.init()`，12 步）：

```
1. 初始化 IndexedDB（Storage.getDB + initSampleData + migrateCourseData）
2. 注册 12 个路由
3. 监听路由变化 → 更新侧边栏高亮
4. 初始化侧边栏交互（导航点击、打卡、移动端遮罩）
5. 初始化顶部栏（日期、AI按钮、更多菜单、FAB按钮组）
6. 启动路由（Router.init）
7. 注册 Service Worker
8. 初始化自动刷新（visibilitychange / pageshow / focus）
9. 初始化通知引擎（NotificationEngine.init）
10. 初始化主题系统（ThemeManager.init）
11. 初始化快速录入引擎（QuickInput.init）
12. 初始化模板系统（Templates.init）
```

**关键功能**：

- **模块加载**：每个路由对应一个 `load*()` 函数，统一模式为 `fetchModule()` 加载 HTML → `loadModuleCSS()` 动态加载 CSS → 调用模块的 `init()` 方法
- **打卡签到**：侧边栏打卡按钮 → `handleCheckin()` → 写入/删除 `checkins` 表 → 更新连续天数
- **连续天数计算**：从今天往前遍历 365 天，连续命中 checkins 日期则 +1，允许今天未打卡
- **自动刷新**：页面从后台恢复 / 窗口获得焦点 / visibilitychange 时重新加载当前路由模块（30 秒冷却）
- **FAB 按钮组**：小鹿（长按语音 / 点击打开）、妮可（点击打开）、快速录入（点击打开）
- **主题选择器**：弹窗式选择器，支持 light/dark/auto
- **Toast 提示**：全局 `showToast()` 方法，底部居中浮动提示

### 2.4 xiaolu.js — 小鹿 AI 伙伴

**定位**：基于 DeepSeek API 的 AI 对话功能，幽默轻松的 AI 伙伴。

**架构概览**：

```
用户输入 → 链式意图识别（3 跳） → 本地操作执行 → 自然回复
                ↓ 降级
         单次 Prompt 兜底
```

**核心模块**：

#### 链式意图识别（Decomposed LLM）— 三跳调用

| 跳数 | 功能 | 模型参数 |
|------|------|---------|
| 第一跳 | 意图分类（finance_record / task_create / habit_log / chat / unknown） | temperature=0, max_tokens=50 |
| 第二跳 | 参数提取（根据意图类型使用不同 Prompt 模板） | temperature=0, max_tokens=100 |
| 第三跳 | 自然回复生成（结合意图+参数+原始消息） | temperature=0.8, max_tokens=300 |

**降级策略**：任一跳失败 → 降级到原始单次 Prompt 调用；第三跳失败 → 模板化回复兜底。

#### 本地操作执行器

支持 3 种本地工具：

| 工具 | 操作 | 参数 |
|------|------|------|
| `record_finance` | 记录收支 → `Storage.add('finance', ...)` | type, amount, category, source, note |
| `create_task` | 创建任务 → `Storage.add('tasks', ...)` | title, priority, due_date |
| `habit_log` | 习惯打卡 → `Storage.add('habits', ...)` | habit, status, note |

#### 操作确认机制

- **默认**：显示确认卡片（包含操作摘要 + 确认/取消按钮）
- **自动确认模式**：`localStorage('xiaolu_auto_confirm') === 'true'` 时直接执行
- 执行结果替换确认卡片，显示 ✅/❌ 状态
- 执行后自动刷新相关模块数据

#### 语音输入功能

- 基于 Web Speech API（`SpeechRecognition`）
- 面板内：长按语音按钮录音，松手自动发送
- 快捷语音（`quickVoiceInput()`）：长按 🦌 FAB 按钮直接语音，不打开面板
  - 录音中显示浮动气泡
  - 松手发送 / 滑出取消
  - 识别后先走 QuickInput 解析，有操作意图则显示确认界面

#### ACTION 标签协议

AI 回复中嵌入 `[ACTION:{"tool":"...","params":{...}}]` 标签，前端提取后执行本地操作。解析器支持嵌套 JSON。

### 2.5 nicole.js — 妮可系统管家

**定位**：严谨的系统管家 → 主动军师。基于 Coze API，核心是五阶段信息处理流水线。

**架构**：

```
                    ┌──────────────────────────────┐
                    │  五阶段每日流水线 (Daily Pipeline) │
                    └──────────────────────────────┘
                                 │
    ┌─────────┐   ┌──────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐
    │ Stage 1  │──→│ Stage 2  │──→│ Stage 3  │──→│ Stage 4  │──→│ Stage 5  │
    │ Collect  │   │ Annotate │   │ Cluster  │   │ Refine   │   │ Spawn    │
    │ 数据采集  │   │ 标注分析  │   │ 关联聚类  │   │ 精炼总结  │   │ 触发动作  │
    └─────────┘   └──────────┘   └─────────┘   └──────────┘   └──────────┘
```

#### Stage 1: Collect（数据采集）

从 IndexedDB 中收集 7 个维度的今日/本周数据：
- 任务：总数/完成数/逾期数/今日到期/今日完成
- 习惯：总数/今日打卡/断签习惯/最长连续
- 财务：本周/本月收支/近期支出明细
- 番茄钟：今日/本周数量
- 健康：近期记录/本周运动次数/平均睡眠
- 目标：总数/进行中/停滞列表
- 日记：本周篇数/最后记录日期

#### Stage 2: Annotate（标注分析）

- **代码规则标注**（主）：根据阈值判断每个维度的状态标签
  - 标签：「完成得好」/「需要关注」/「异常」/「趋势下滑」
  - 严重度：low / medium / high
- **AI 增强标注**（辅）：如有 Coze Token，发送数据摘要给 AI 打标签
  - AI 结果替换对应 category 的代码标注

#### Stage 3: Cluster（关联聚类）

纯代码关联分析，定义了 7 种关联规则：

| 规则 | 条件 | 洞察主题 |
|------|------|---------|
| 状态低迷 | 健康异常 + 任务异常 | 😔 状态低迷 |
| 效率下滑 | 番茄钟少 + 任务完成率低 | 📉 效率下滑 |
| 财务压力 | 本月亏损 + 支出占比高 | 💸 财务压力 |
| 目标遗忘 | 目标停滞 + 日记空白 | 🎯 目标遗忘 |
| 健康透支 | 健康异常 + 睡眠不足 | 😴 健康透支 |
| 习惯断裂 | 习惯断签 + 日记空白 | 💔 习惯断裂 |
| 单项提醒 | 未关联的单独标注 | 💡/⚠️ 各类提醒 |

#### Stage 4: Refine（精炼总结）

- **AI 精炼**（优先）：将聚类结果发给 Coze API 生成 200 字有温度的每日洞察
- **代码降级**（兜底）：根据严重度分级组装模板化文案

#### Stage 5: Spawn（触发动作）

- 写入通知中心（high severity 的洞察）
- 更新 DOM（妮可面板洞察卡片 + dashboard 洞察区域）
- 缓存到 localStorage（当日不重复执行）

**流水线调度**：
- 页面加载后 2 秒自动触发
- 切换到 dashboard 路由时触发
- 打开妮可面板时触发
- 同一天缓存命中则跳过

**聊天功能**：
- 使用 Coze API（bot_id 指定）
- 支持多轮对话（`_conversationId` 维持会话）
- 三个快捷功能：数据健康检查、使用效率分析、目标进度审计
- 快捷功能自动收集全模块数据统计后发给 AI

### 2.6 quickinput.js — 快速录入引擎

**定位**：自然语言快速创建任务/记录收支/打卡/写日记/番茄钟。

**架构**：

```
用户输入 → DeepSeek API 解析 → 预览确认 → 执行写入 → 刷新模块
                ↓ 失败
         关键词规则 Fallback
```

**自然语言解析**：

| 意图 | 触发关键词 | 提取参数 |
|------|-----------|---------|
| `task_create` | 任务/要做/待办/记得/别忘了 | title, priority, due_date |
| `finance_record` | 收入/支出/花了/买了/消费 | type, amount, category, note |
| `habit_checkin` | 打卡/坚持/完成/做了 | habit_name |
| `pomodoro_start` | 番茄/专注/开始学习 | duration |
| `journal_entry` | （默认兜底） | content, mood |

**AI 解析**：使用 DeepSeek（temperature=0.1），System Prompt 包含意图定义和示例。

**关键词 Fallback**：正则匹配关键词 + 提取金额/日期/分类等。

**执行器**（`executeQuickInput`）：

| 意图 | 执行操作 |
|------|---------|
| task_create | `Storage.add('tasks', {...})` |
| finance_record | `Storage.add('finance', {...})` |
| habit_checkin | 匹配习惯名 → `Storage.put('checkins', {habits: [...]})` |
| journal_entry | `Storage.add('journal', {...})` |
| pomodoro_start | `Storage.add('pomodoros', {...})` |

**习惯名映射表**：将自然语言映射到 12 个习惯 ID（如 "跑步"→"exercise"、"背单词"→"study"）。

**UI**：
- 浮动面板（`/` 键或点击 ⚡ 打开）
- 输入 → 预览（显示解析结果）→ 确认执行
- 5 个快捷标签（💰记账 / 📋任务 / ✅打卡 / 📝记录 / 🍅番茄）

### 2.7 notifications.js — 通知引擎

**定位**：应用内提醒系统 + 智能建议引擎。

**定时检查（每 5 分钟）**：

| 检查器 | 触发条件 | 说明 |
|--------|---------|------|
| `checkHabitReminder` | 21:00 后且打卡 <12 个 | 习惯打卡提醒 |
| `checkCourseReminder` | 课程开始前 0-15 分钟 | 课前提醒 |
| `checkTaskDueReminder` | dueDate 当天且未完成 | 任务截止提醒 |
| `checkBirthdayReminder` | 联系人 MM-DD 匹配今天 | 生日提醒 |
| `checkBudgetWarning` | 月支出 > 月预算 | 预算超支预警 |
| `generateSmartSuggestions` | 每天一次 | 智能建议（连续打卡/逾期任务/7天无运动/预算80%/30天未联系）|

**防重发机制**：用 `localStorage` 存储已发送标识 `notif_sent_{type}_{date}`。

**通知持久化**：存入 `notifications` 表，7 天自动清理。

**UI**：铃铛按钮 + 角标 + 下拉面板 + 全部已读按钮 + 点击跳转对应模块。

**对外接口**：`getTodayTasks()` 供 dashboard 调用，`getSuggestions()` 供推荐列表。

### 2.8 sync.js — 数据同步

**定位**：将数据备份到 GitHub 仓库。

**机制**：
- 使用 GitHub Contents API（`PUT /repos/:owner/:repo/contents/:path`）
- 推送两个文件：带时间戳的备份文件 `backup_YYYYMMDD_HHMMSS.json` + 最新的 `latest.json`
- GitHub Token 存储在 IndexedDB `settings` 表
- 同步 UI：Token 配置弹窗 + 同步进度弹窗
- 调用 `ExportModule.readAllData()` 获取全量数据

### 2.9 export.js — 数据导入导出

**定位**：完整的数据备份与恢复系统。

**导出功能**：
- 弹窗选择要导出的模块（20 个表）
- 显示各表记录数
- 生成带日期的 JSON 文件下载

**导入功能**：
- 拖拽/点击选择 JSON 文件
- 显示数据概览（备份时间、版本、各表记录数）
- 两种模式：合并导入（按主键去重）/ 覆盖导入（清空后写入）
- 版本兼容性检查（当前 v5）
- 导入成功后自动刷新页面

### 2.10 search.js — 全局搜索

**定位**：跨模块关键词搜索 + 快捷指令导航。

**搜索范围**：

| 模块 | 匹配字段 | 跳转路由 |
|------|---------|---------|
| tasks | title | tasks |
| journal | content, title | journal |
| ideas | content, title | journal |
| knowledge | title, content | knowledge |
| contacts | name | relations |

**快捷指令**：输入 `/` 进入指令模式，11 个预定义指令直接导航到对应模块。

**UI**：全屏搜索面板，200ms 防抖，高亮匹配文本。

### 2.11 templates.js — 模板系统核心

**定位**：月度复盘模板定义 + 数据采集 + AI 分析。

**6 个预设模板**：

| 模板 ID | 名称 | 关联模块 | 字段数 |
|---------|------|---------|-------|
| monthly_tasks | 月度任务复盘 | tasks | 5 |
| monthly_habits | 月度习惯复盘 | habits | 4 |
| monthly_finance | 月度财务复盘 | finance | 6 |
| monthly_study | 月度学习复盘 | study | 4 |
| monthly_health | 月度健康复盘 | health | 4 |
| monthly_summary | 月度总总结 | general | 4 |

**数据采集**（`collectModuleData`）：从 IndexedDB 读取对应月份的原始数据，计算统计值。

**AI 分析**：如有 DeepSeek Token，生成 100 字复盘分析。

**报告存储**：存入 `journal` 表（type = `template_report`）。

**导出**：支持 Markdown 和 JSON 格式导出。

**月末提醒**：检测当月最后一天，写入通知提醒用户做复盘。

### 2.12 theme.js — 主题管理

**定位**：明暗模式切换。

**三种模式**：light / dark / auto（跟随系统）。

**存储**：主存 IndexedDB `settings` 表，副存 localStorage（供防闪白脚本同步）。

**防闪白机制**：`life.html` 的 `<head>` 中有内联脚本，在渲染前立即从 localStorage 读取主题并设置 `data-theme` 属性。

**应用方式**：`document.documentElement.setAttribute('data-theme', theme)` + 更新 meta theme-color。

---

## 3. 模块层 (modules/)

### 3.1 dashboard — 仪表盘

**功能**：首页数据总览，聚合各模块关键指标。

**核心组件**：

| 组件 | 数据来源 | 说明 |
|------|---------|------|
| 问候语 | settings.username + 时间 | 早上好/下午好/晚上好 + 用户名 |
| 日历 | checkins[month] | 当月日历 + 打卡标记 |
| 亮点数据 | checkins/study/finance | 签到天数、学习时长、月支出、结余 |
| 生日提醒 | contacts.birthday | 今天生日的联系人 |
| 今日推送 | tasks/journal/ideas/goals | 混合待办、日记、灵感、目标的 feed |
| 今日聚焦 | tasks（AI 推荐或本地排序）| 3 个最重要任务 + AI 推荐理由 |
| 月末复盘提醒 | 日期检测 | 月末前 3 天显示模板入口 |
| 年度回顾 | 全年数据汇总 | 6 维度年度统计弹窗 |

**AI 每日推荐**：
- 收集待办任务 + 未完成习惯 + 进行中目标作为上下文
- 调用 DeepSeek 推荐今日聚焦 3 件事（带推荐理由）
- 当日结果缓存到 localStorage
- 降级为本地优先级排序

**数据结构**：纯只读，不写入数据，从各表聚合展示。

### 3.2 habits — 习惯打卡

**功能**：12 个固定习惯的一键打卡 + 日历视图。

**12 个统一习惯**：

| ID | 名称 | Emoji |
|----|------|-------|
| warm-water | 早起一杯温水 | 🥤 |
| breakfast | 吃对早餐 | 🍳 |
| exercise | 温和运动 | 🏃 |
| drink-water | 喝水达标 | 💧 |
| dinner-light | 晚餐七分饱 | 🍽️ |
| foot-bath | 温水泡脚 | 🦶 |
| early-sleep | 23:00前睡觉 | 😴 |
| reading | 读书 | 📖 |
| study | 背单词/学习 | 📝 |
| stretch | 拉伸/站立 | 🧘 |
| journal | 写日记/复盘 | ✍️ |
| finance | 记账 | 💰 |

**数据结构**：
- `checkins` 表：`{date, month, time, habits: [habitId, ...]}`
- 日期为 key，habits 数组记录已打卡的习惯 ID

**交互**：
- 点击卡片切换打卡状态
- 日期前后切换查看历史
- 日历月份切换 + 点击日期跳转
- 进度条显示完成比例 + 激励文案
- 打卡后更新侧边栏连续天数

### 3.3 tasks — 任务管理

**功能**：完整的任务管理系统，含 4 个视图 + 项目追踪 + 番茄钟。

**四个 Tab 视图**：

| Tab | 说明 |
|-----|------|
| 任务（今日/全部/已完成）| 默认视图，列表形式 |
| 矩阵 | 艾森豪威尔矩阵（ABCD 四象限） |
| 周计划 | 按 dueDate 分列的周视图（移动端 3 天/桌面 7 天） |
| 项目 | 项目卡片 + 进度条 |
| 番茄钟 | 25/5 分钟计时器 + 任务关联 + 历史记录 |

**数据结构**：
- `tasks`：`{title, priority(A/B/C/D), dueDate, projectId, status, date, completedAt}`
- `projects`：`{name, createdAt}`
- `pomodoros`：`{taskId, date, startTime, duration, type}`

**优先级体系**：A=紧急重要 / B=重要不紧急 / C=紧急不重要 / D=不紧急不重要

**番茄钟**：
- 25 分钟工作 + 5 分钟休息，SVG 环形进度
- 可关联任务
- 完成自动记录到 pomodoros 表
- 今日统计 + 历史记录

**交互**：滑动删除（触摸+鼠标）、任务详情编辑、优先级筛选、周视图滑动导航。

### 3.4 study — 学习管理

**功能**：课程表 + 阅读记录 + 技能追踪。

**三个子 Tab**：

| Tab | 说明 |
|-----|------|
| 课程表 | 7 天 × 30 分钟格子的时间表，支持多学期 |
| 阅读记录 | 书籍卡片 + 进度条 + 状态（在读/已读/想读）|
| 技能追踪 | 技能列表 + 星级评定 + 进度 |

**课程表实现**：
- 时间轴 07:00-23:30，每 30 分钟一格（33 行 × 7 列）
- 课程块绝对定位在对应时间/天数的格子中
- 8 种颜色自动分配
- 时间冲突检测
- 学期管理（增删切换）
- 今天列高亮

**数据结构**：
- `semesters`：`{name}`
- `courses`：`{name, room, teacher, day, startTime, endTime, semesterId}`
- `books`：`{title, author, status, progress, note}`
- `skills`：`{name, level(1-5), progress, note}`

### 3.5 health — 健康管理

**功能**：体重/睡眠/运动/饮水/饮食的多维度健康记录。

**数据结构**（`health` 表）：
- 按日期记录：体重、睡眠时长、运动（类型+时长）、饮水、饮食等
- 支持 exercises 数组（每项含 type/name/duration）

**交互**：日期切换、多维度数据录入、趋势查看。

### 3.6 finance — 财务管理

**功能**：收入支出记账 + 预算管理 + 统计分析。

**数据结构**：
- `finance`：`{type(income/expense), amount, category, source, note, date, month}`
- `settings.finance_budget`：`{monthly, yearly}`

**默认分类**：
- 支出：餐饮/交通/购物/娱乐/学习/居住/医疗/其他
- 收入：工资/兼职/投资/红包/其他

**功能**：
- 月度收支列表（分页）
- 按月份筛选
- 新增/编辑/删除记录
- 预算设置与超支预警
- 统计图表（分类占比等）

### 3.7 journal — 记录与反思

**功能**：三个子 Tab（日记/复盘/灵感速记）。

**数据结构**（`journal` 表）：
- 日记：`{type:'diary', content, mood, date}`
- 复盘：`{type:'review', subtype:'weekly/monthly/yearly', content, date}`
- 灵感：`{type:'idea', content, tags[], date}`
- 模板报告：`{type:'template_report', reportData, ...}`

**交互**：
- 日记：日历视图 / 列表视图切换
- 复盘：按周/月/年切换
- 灵感：标签筛选 + 搜索

### 3.8 knowledge — 知识库

**功能**：知识条目的分类管理 + 标签 + 搜索。

**数据结构**（`knowledge` 表）：
- `{title, content, type, tags[], createdAt, updatedAt}`

**功能**：类型筛选、标签筛选、排序（时间/字母）、搜索、CRUD 操作。

### 3.9 goals — 目标管理

**功能**：月度/季度/年度目标追踪。

**数据结构**（`goals` 表）：
- `{title, level(yearly/quarterly/monthly), status(active/completed/abandoned), progress, startDate, endDate, description, ...}`

**三个层级**：年度 / 季度 / 月度
**三种状态**：进行中 / 已完成 / 已放弃

**功能**：按层级分组显示、进度追踪、展开详情查看关联任务。

### 3.10 relations — 关系管理

**功能**：联系人管理 + ABCD 四层分类 + 跟进频率提醒。

**ABCD 分类**：

| 层级 | 名称 | 颜色 | 跟进频率 |
|------|------|------|---------|
| A | 核心圈 | 红 | 每周 1 次 |
| B | 重要圈 | 橙 | 每月 1 次 |
| C | 维护圈 | 蓝 | 每季 1 次 |
| D | 观察圈 | 灰 | 随缘 |

**数据结构**（`contacts` 表）：
- `{name, type(家人/朋友/同事/...), category(A/B/C/D), birthday, phone, email, lastContactDate, notes, ...}`

**功能**：分类筛选、排序、搜索、生日提醒、跟进超时提示。

### 3.11 lifetree — 生命树

**功能**：SVG 渲染可视化生命树，用户的日常行为滋养这棵树。

**核心概念**：将 6 个人生维度映射为树的 6 根枝条：

| 维度 | 颜色 | 关联习惯 |
|------|------|---------|
| 健康 | 绿 | exercise, drink-water, early-sleep |
| 学习 | 蓝 | reading, study |
| 财务 | 橙 | finance |
| 关系 | 粉 | - |
| 习惯 | 青 | 全部打卡率 |
| 反思 | 紫 | journal |

**渲染机制**：
- 纯 SVG 动态生成（树干 + 6 根枝条 + 叶片/花朵/果实）
- 枝条粗细、长度由对应维度的数据决定
- 叶片密度和颜色由打卡率、连续天数决定
- 天气/季节/土壤状态由综合数据计算

**数据流**：从 checkins、habits、tasks、finance 等表读取聚合数据 → 计算维度健康值 → 驱动 SVG 参数。

### 3.12 rest — 休息模式

**功能**：全屏沉浸式 Canvas 动画场景——「魁北克蓝调雪夜」。

**渲染内容**：
- 深蓝渐变夜空 + 180 颗闪烁星星
- 魁北克老城剪影（教堂尖塔 + 石屋建筑群）
- 窗户暖光（闪烁效果）
- 松树剪影 + 地面积雪
- 路灯 + 光晕效果
- 18 朵大雪花（预渲染 sprite，7 种结晶造型）+ 140 朵小雪花

**性能优化**：
- 离屏 Canvas 预渲染雪花 sprite
- 场景静态元素缓存（Path2D 对象）
- devicePixelRatio 限制为 2
- 支持 `prefers-reduced-motion`（静态雪花）
- 对象池回收（出界重置）

**辅助功能**：
- 中央时钟显示
- 随机暖心短句（30 条）
- 暂停通知轮询（避免打扰）

### 3.13 whitenoise — 白噪音

**功能**：Web Audio API 生成环境音。

**三种噪声**：白噪声 / 粉噪声 / 棕噪声

**机制**：
- `AudioContext` + `ScriptProcessorNode` 或 `AudioBuffer` 生成随机信号
- 滤波器（`BiquadFilterNode`）调节频谱特性
- 定时器（15/30/60/无限）
- 浮动面板控制

### 3.14 templates — 模板页面

**功能**：复盘模板的 UI 控制层。

**交互**：
- 渲染 6 个模板卡片
- 点击生成当月复盘报告（含数据预填 + AI 分析）
- 用户编辑/填写反思内容
- 保存到 journal 表
- 历史记录列表
- Markdown / JSON 导出

---

## 4. 样式层 (styles/)

### 4.1 全局样式组织

| 文件 | 说明 |
|------|------|
| `main.css` | 基础样式：CSS 变量、重置、通用组件、按钮、卡片、动画 |
| `sidebar.css` | 侧边栏布局、导航菜单、移动端响应式 |
| `dashboard.css` | 仪表盘组件：日历、亮点卡片、feed、聚焦卡、年度回顾 |
| `search.css` | 全局搜索面板样式 |
| `nicole.css` | 妮可面板、洞察卡片、Token 对话框 |
| `xiaolu.css` | 小鹿面板、语音状态、快捷气泡、Token 对话框 |
| `quickinput.css` | 快速录入面板、预览区域 |
| `templates.css` | 模板卡片、报告编辑界面 |

### 4.2 主题变量体系

通过 `data-theme` 属性控制，CSS 变量定义在 `main.css` 中：

```css
:root (light mode):
  --bg-main: #F5F0EB        /* 暖白背景 */
  --bg-card: #FFFFFF         /* 卡片白 */
  --text-primary: #3D3027    /* 深棕文字 */
  --accent-primary: #8B6F47  /* 主色调棕色 */
  --accent-green: #6BBF6A    /* 绿色强调 */
  --theme-color: #D4BA9F     /* 暖棕主题色 */

[data-theme="dark"]:
  --bg-main: #1A1A2E         /* 深蓝背景 */
  --bg-card: #16213E          /* 深蓝卡片 */
  --text-primary: #E8E0D8    /* 浅色文字 */
  --theme-color: #1A1A2E
```

### 4.3 模块样式

每个功能模块自带 CSS 文件（`modules/xxx/xxx.css`），通过 `loadModuleCSS()` 动态加载。

---

## 5. 关键数据流

### 5.1 语音录入完整链路

```
长按 🦌 FAB 按钮 (500ms)
  └→ XiaoluModule.quickVoiceInput()
      └→ Web Speech API 录音
          └→ 松手 → 文字结果
              └→ QuickInput.parseQuickInput(text)
                  ├→ DeepSeek API 解析（temperature=0.1）
                  └→ 失败 → 关键词规则 Fallback
                      └→ 返回 {intent, params}
                          ├→ 有操作意图
                          │   └→ _showVoiceConfirm() 显示确认气泡
                          │       └→ 用户确认
                          │           └→ QuickInput.executeQuickInput(parsed)
                          │               └→ Storage.add()/put() 写入 IndexedDB
                          │                   └→ App.showToast() 反馈
                          │                       └→ _refreshAfterAction() 刷新模块
                          └→ 纯聊天
                              └→ decomposedIntentChain(token, text)
                                  └→ 三跳 LLM 调用
                                      └→ addAIMessage() 显示回复
```

### 5.2 快速录入完整链路

```
按 / 键 或 点击 ⚡ FAB
  └→ QuickInput.open()
      └→ 用户输入文字 → 发送
          └→ handleSend()
              └→ parseQuickInput(text)
                  └→ renderPreview() 显示解析结果
                      └→ 用户确认
                          └→ handleConfirm()
                              └→ executeQuickInput(parsed)
                                  └→ Storage 写入
                                      └→ 刷新当前路由对应模块
```

### 5.3 妮可每日流水线数据流

```
页面加载 2s 后 / 切换 dashboard 时
  └→ NicoleModule.runDailyPipeline()
      ├→ 检查 localStorage 缓存（当日不重复）
      └→ Stage 1: collectData()
      │   └→ Storage.getAll() × 7 个维度
      └→ Stage 2: annotateData(collected)
      │   ├→ 代码规则标注（阈值判断）
      │   └→ Coze API AI 增强标注（可选）
      └→ Stage 3: clusterInsights(annotated)
      │   └→ 7 种关联规则 → 洞察列表
      └→ Stage 4: refineInsights(clusters)
      │   ├→ Coze API 精炼（优先）
      │   └→ 代码模板降级（兜底）
      └→ Stage 5: spawnActions(refined)
          ├→ Storage.add('notifications', ...) 写入通知
          ├→ updateInsightDOM() 更新 dashboard 洞察区域
          └→ localStorage 缓存
```

### 5.4 模块间数据依赖关系

```
                    ┌────────────┐
                    │  Storage   │
                    │ (IndexedDB)│
                    └─────┬──────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────┴────┐     ┌────┴────┐     ┌────┴────┐
    │  写入端  │     │  读取端  │     │  AI 层   │
    └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │
  QuickInput ──→  tasks     Dashboard ←── 各表聚合
  Xiaolu ──────→  finance   Nicole ────→ 各表聚合
  Habits ──────→  checkins  Search ────→ 各表搜索
  Tasks ───────→  tasks     Templates ─→ 各表统计
  Finance ────→  finance    LifeTree ──→ 各表聚合
  Journal ────→  journal
  Goals ──────→  goals
  Relations ──→  contacts
  Knowledge ──→  knowledge
  Study ──────→  study/courses/books/skills
  Health ─────→  health
```

### 5.5 AI 与数据层的交互方式

| AI 模块 | API | 读取数据 | 写入数据 |
|---------|-----|---------|---------|
| 小鹿 (xiaolu) | DeepSeek | settings.deepseek_token | tasks / finance / habits（通过 executeLocalAction）|
| 妮可 (nicole) | Coze | settings.coze_token + 全表读取（collectData）| notifications（通过 spawnActions）|
| 快速录入 (quickinput) | DeepSeek | settings.deepseek_token | tasks / finance / checkins / journal / pomodoros |
| Dashboard AI 推荐 | DeepSeek | settings.deepseek_token + tasks/habits/goals | localStorage（缓存）|
| Templates AI 分析 | DeepSeek | settings.deepseek_token + 各表月数据 | journal（template_report）|

---

## 6. 已知问题与改进空间

### 6.1 架构层面

1. **全局命名空间污染**：所有模块通过 IIFE 暴露为全局变量（`Storage`、`Router`、`App` 等），约 25+ 个全局对象。建议引入轻量模块加载器或迁移到 ES Modules。

2. **同步脚本阻塞渲染**：25 个 `<script>` 标签同步加载，首屏渲染被阻塞。建议给非关键脚本添加 `defer` 属性。

3. **模块加载模式不统一**：rest.js 自行在 DOMContentLoaded 初始化，而其他模块由 App.init() 管理。

### 6.2 数据层

4. **缺乏事务支持**：`Storage` 的每次操作都是独立事务，跨表操作（如导入）没有原子性保证。

5. **索引覆盖不完整**：部分表缺少常用查询的索引（如 tasks 的 priority、journal 的 type+date 复合索引）。

6. **checkins 表设计特殊**：以日期为 key，habits 存为数组。这导致无法高效查询特定习惯的打卡历史（需全表扫描后 filter）。

### 6.3 AI 交互

7. **链式调用延迟**：小鹿的三跳 LLM 调用（分类→提取→回复）至少 3 次网络往返，体验上可能较慢。建议合并第一二跳或添加流式输出。

8. **Token 管理分散**：DeepSeek Token 在 xiaolu.js 和 quickinput.js 中各自读取，nicole.js 使用 Coze Token。三处独立的 Token 管理逻辑重复。

9. **AI 回复解析脆弱**：`_extractActionFromReply` 使用 `[ACTION:` 字符串匹配，依赖 LLM 输出格式正确。LLM 输出不稳定时可能解析失败。

10. **QuickInput 与小鹿的竞争**：handleSend 中先调用 QuickInput 解析，再尝试 AI 回复的 ACTION 标签，存在双重识别冲突风险。

### 6.4 前端

11. **内联样式过多**：`showToast()`、`showTokenDialog()` 等函数中大量使用 `style.cssText` 内联样式，难以维护，应抽取到 CSS 文件。

12. **弹窗管理无统一机制**：每个模块自建弹窗（overlay + dialog），没有统一的弹窗管理器，可能导致多个弹窗叠加。

13. **事件监听泄漏风险**：部分模块在 `init()` 中绑定事件但未提供 `destroy()` 方法，路由切换时旧事件监听可能残留（如 dashboard 的日历点击事件）。

14. **CSS 版本号硬编码**：`?v=24` 在 HTML 中硬编码，更新时需要手动修改多处。

### 6.5 安全

15. **API Key 存储**：DeepSeek Token 和 Coze Token 以明文存储在 IndexedDB 中，无加密。

16. **GitHub Token 存储**：同样明文存储，且拥有 repo 权限，风险较高。

### 6.6 性能

17. **全量数据加载**：大部分模块使用 `Storage.getAll()` 加载全表数据到内存，数据量大时会有性能问题（如 finance 表）。

18. **Dashboard 并行请求**：`renderGreeting`、`renderCalendar`、`renderHighlights` 等 7 个并行函数，每个都独立查询 IndexedDB，可合并为一次批量查询。

19. **生命树 SVG**：每次初始化都重新计算全部枝条参数，可以考虑缓存计算结果。

### 6.7 可维护性

20. **代码重复**：`escapeHtml()`、`formatDate()`、`getTodayStr()` 等工具函数在 15+ 个文件中重复定义，应抽取到共享 utils。

21. **魔法数字**：习惯模块硬编码 12 个习惯、番茄钟 25/5 分钟、通知检查 5 分钟间隔等，应提取为配置常量。

22. **缺少单元测试**：项目无测试文件，核心逻辑（解析器、流水线、数据迁移）缺乏测试覆盖。

23. **错误处理不一致**：部分地方 `try/catch` 后 `console.error`，部分静默忽略，部分用 `App.showToast` 提示用户，策略不统一。

---

## 附录：文件清单与行数统计

| 路径 | 行数 | 说明 |
|------|------|------|
| life.html | 255 | 入口 HTML |
| sw.js | 162 | Service Worker |
| manifest.json | 16 | PWA 配置 |
| **core/** | | |
| storage.js | ~300 | IndexedDB 封装 |
| router.js | ~100 | 路由系统 |
| app.js | ~500 | 主入口 |
| xiaolu.js | ~1720 | 小鹿 AI |
| nicole.js | ~1100 | 妮可系统管家 |
| quickinput.js | ~500 | 快速录入 |
| notifications.js | ~450 | 通知引擎 |
| sync.js | ~250 | 云端同步 |
| export.js | ~400 | 导入导出 |
| search.js | ~300 | 全局搜索 |
| templates.js | ~500 | 模板系统 |
| theme.js | ~150 | 主题管理 |
| **modules/** | | |
| dashboard/ | ~800 | 仪表盘 |
| habits/ | ~450 | 习惯打卡 |
| tasks/ | ~900 | 任务管理 |
| study/ | ~800 | 学习管理 |
| health/ | ~400 | 健康管理 |
| finance/ | ~600 | 财务管理 |
| journal/ | ~600 | 记录反思 |
| knowledge/ | ~400 | 知识库 |
| goals/ | ~400 | 目标管理 |
| relations/ | ~500 | 关系管理 |
| lifetree/ | ~500 | 生命树 |
| rest/ | ~400 | 休息模式 |
| whitenoise/ | ~200 | 白噪音 |
| templates/ | ~200 | 模板页面 |
| **styles/** | | |
| main.css | ~800 | 全局样式 |
| sidebar.css | ~300 | 侧边栏 |
| dashboard.css | ~400 | 仪表盘 |
| search.css | ~150 | 搜索 |
| nicole.css | ~250 | 妮可 |
| xiaolu.css | ~250 | 小鹿 |
| quickinput.css | ~150 | 快速录入 |
| templates.css | ~200 | 模板 |

**总计：约 33,650 行代码**
