# 人生工作台 PWA V2 — 全面压力测试报告

> 测试时间：2026-07-25  
> 测试范围：本轮新增/修改的 15 项功能  
> 测试方法：逐文件代码审查 + 模块间集成分析

---

## 一、严重问题 (S) — 必须修复

### S-01 ⛔ theme.js 存储字段名错误，主题无法持久化
- **文件**：`core/theme.js` 第 27 行（init）、第 44 行（setTheme）
- **问题**：`Storage.put('settings', { id: 'theme', value: theme })` 使用了 `id` 字段，但 `storage.js` 中 settings 表的 `keyPath` 是 `'key'`。IndexedDB 在 `add` 时会因缺少 keyPath 字段抛出 `DataError`，在 `put` 时同样失败。
- **影响**：
  - 主题设置无法保存到 IndexedDB
  - 每次页面刷新后 `ThemeManager.init()` 从 IndexedDB 读取返回 null，回退到 `light`
  - 虽然防闪白脚本从 `localStorage` 读取能正确应用（因 `localStorage` 写入正常），但 `ThemeManager.init()` 随后会将 `localStorage` 也覆写为 `light`
  - **用户设置的暗色模式在刷新后丢失**
- **修复**：将所有 `{ id: 'theme', ...}` 改为 `{ key: 'theme', ...}`：
  ```js
  // init() 中读取
  const stored = await Storage.get('settings', 'theme');
  // setTheme() 中写入
  await Storage.put('settings', { key: 'theme', value: theme });
  // localStorage 同步写入中的 JSON 也应保持一致
  localStorage.setItem('life-workspace-theme', JSON.stringify({ key: 'theme', value: currentTheme }));
  ```

### S-02 ⛔ 防闪白脚本与 theme.js 数据源不一致
- **文件**：`life.html` 第 28-43 行（内联脚本）vs `core/theme.js`
- **问题**：防闪白脚本从 `localStorage` 的 `life-workspace-theme` 键读取主题，而 `ThemeManager.init()` 从 IndexedDB 的 `settings` 表读取。由于 S-01 的 bug，IndexedDB 始终读不到主题，`init()` 会用默认值 `light` 覆盖 `localStorage`。
- **影响**：即使用户选择了暗色模式，页面加载后先闪白（防闪白脚本正确应用了暗色），然后 ThemeManager.init() 将主题重置为 light，导致最终显示浅色模式。
- **修复**：修复 S-01 后此问题自动解决。同时建议 `ThemeManager.init()` 在 IndexedDB 读取失败时，回退读取 localStorage 作为兜底。

### S-03 ⛔ rest.js 事件监听器泄漏
- **文件**：`modules/rest/rest.js` 第 106 行（open）/ 第 133 行（close）
- **问题**：`open()` 中使用匿名箭头函数绑定事件：
  ```js
  overlay.addEventListener('click', close);
  ```
  而 `close()` 中尝试移除：
  ```js
  overlay.removeEventListener('click', close);
  ```
  由于 `addEventListener` 绑定的是具名函数引用 `close`，而 `removeEventListener` 也使用 `close`，这一对是匹配的——**但如果 open/close 多次调用**，每次 `open()` 都会添加一个新的 click 监听器。虽然 `close()` 能移除，但如果 close 被其他路径触发（如 active 检查提前返回），监听器会累积。
- **实际风险**：经仔细复查，`close` 函数引用一致，removeEventListener 可正确移除。**降级为 M 级**。
- **修正评级**：M-01

### S-04 ⛔ F9 快速录入引擎未实现
- **问题**：需求描述中的「F9 快速录入引擎 - 合并自然语言+语音」在代码中**完全未找到**对应模块。没有独立的快速录入入口，没有自然语言解析任务描述的功能。
- **影响**：功能缺失。xiaolu.js 有语音输入但仅用于 AI 对话，不能直接创建任务/记录。
- **建议**：标记为 TODO，或在 v1.1 版本中实现。

### S-05 ⛔ 模板系统（每月31号提醒复盘）未实现
- **问题**：需求描述中的「模板系统 - 每月31号提醒复盘」在代码中**未找到**对应实现。notifications.js 中没有月底复盘提醒逻辑。
- **影响**：功能缺失。
- **建议**：标记为 TODO，或在 v1.1 版本中实现。

---

## 二、中等问题 (M) — 建议修复

### M-01 🔶 rest.js overlay 事件监听器潜在泄漏
- **文件**：`modules/rest/rest.js`
- **问题**：每次 `open()` 调用都会 `overlay.addEventListener('click', close)`。虽然 `close()` 中会 remove，但建议改为一次性绑定（在 `init()` 中绑定），避免极端场景下的累积。
- **修复**：将 `overlay.addEventListener('click', close)` 移到 `init()` 中。

### M-02 🔶 F1 今日聚焦未集成 F7 智能建议引擎
- **文件**：`modules/dashboard/dashboard.js` 第 245-290 行
- **问题**：`renderFocusCard()` 自己实现了任务排序逻辑（priority + dueDate），而不是调用 `NotificationEngine.getTodayTasks()`。两者逻辑重复且可能不一致。
- **影响**：F7 智能建议引擎的 `getTodayTasks()` API 从未被 dashboard 调用，代码冗余。
- **修复**：让 `renderFocusCard()` 调用 `NotificationEngine.getTodayTasks()` 获取推荐任务。

### M-03 🔶 今日聚焦卡片暗色模式样式缺失
- **文件**：`modules/dashboard/dashboard.css`
- **问题**：`.dash-focus-card` 使用硬编码浅色渐变背景：
  ```css
  background: linear-gradient(135deg, #FFFDF8 0%, #FFF8ED 100%);
  ```
  暗色模式下此颜色极亮，与深色主题不协调。
- **修复**：添加暗色模式覆盖：
  ```css
  [data-theme="dark"] .dash-focus-card {
    background: linear-gradient(135deg, #1A1A2E 0%, #1E2A3A 100%);
    border-left-color: var(--accent-orange);
  }
  ```

### M-04 🔶 生日提醒卡片暗色模式样式缺失
- **文件**：`modules/dashboard/dashboard.css`
- **问题**：`.dash-birthday-card` 硬编码浅色渐变：
  ```css
  background: linear-gradient(135deg, #FFF8ED 0%, #FFF0DC 100%);
  border: 1px solid rgba(232, 164, 74, 0.2);
  ```
- **修复**：添加 `[data-theme="dark"]` 覆盖。

### M-05 🔶 智能建议通知项暗色模式样式缺失
- **文件**：`styles/main.css` 约第 340 行
- **问题**：`.notif-item-suggestion` 使用硬编码浅色：
  ```css
  background: linear-gradient(135deg, #FFFDF5 0%, #FFF9E6 100%);
  border-left: 3px solid #E8C86A;
  ```
- **修复**：添加暗色覆盖。

### M-06 🔶 白噪音面板暗色模式样式不完整
- **文件**：`modules/whitenoise/whitenoise.css`
- **问题**：
  - `box-shadow: 0 -4px 24px rgba(61, 48, 39, 0.12)` 使用硬编码暗色阴影
  - 无 `[data-theme="dark"]` 样式覆盖
  - 虽然大部分使用 CSS 变量，但播放按钮、音量滑块等的颜色在暗色模式下可能对比度不足
- **修复**：添加暗色模式变量覆盖。

### M-07 🔶 年度回顾弹窗暗色模式覆盖不完整
- **文件**：`modules/dashboard/dashboard.css`
- **问题**：
  - `.dash-annual-entry` 的 `.dash-annual-btn` 使用 `background: var(--bg-card)`（✅ 通过变量适配）
  - 但 `.dash-modal-overlay` 背景 `rgba(61, 48, 39, 0.3)` 为硬编码
  - 弹窗内部 `.dash-modal` 使用 `.card` 类（✅ 通过变量适配）
- **修复**：将遮罩色改为 `var(--overlay-bg, rgba(61, 48, 39, 0.3))`。

### M-08 🔶 rest.js 通知暂停机制无效
- **文件**：`modules/rest/rest.js` 第 140-152 行
- **问题**：`pauseNotifications()` 尝试调用 `window.Notifications.pause()`，但通知引擎全局变量名为 `NotificationEngine`（不是 `Notifications`），且没有 `pause`/`resume` 方法。
- **影响**：休息模式下通知轮询不会暂停，5分钟定时器照常运行，可能弹出通知破坏沉浸体验。
- **修复**：
  1. 在 `NotificationEngine` 中添加 `pause()`/`resume()` 方法
  2. 或修改 rest.js 引用正确的变量名

### M-09 🔶 小鹿AI xiaolu.js 缺少暗色模式完整覆盖
- **文件**：`styles/xiaolu.css`
- **问题**：
  - `.xiaolu-token-dialog` 的 `box-shadow` 硬编码
  - `.xiaolu-msg.user .xiaolu-msg-bubble` 使用硬编码渐变色（暖橙），在暗色模式下尚可但缺乏对比度调整
  - 无 `[data-theme="dark"]` 专门覆盖
- **影响**：暗色模式下基本可用（大部分使用 CSS 变量），但部分元素视觉效果不够理想。

### M-10 🔶 搜索面板 ESC 事件监听器泄漏
- **文件**：`core/search.js` `buildPanel()` 方法
- **问题**：每次 `buildPanel()` 调用（仅首次构建时）都添加了一个全局 `document.addEventListener('keydown', ...)` 监听器。虽然 panelEl 只构建一次，但这个监听器永远不会被移除。
- **影响**：轻微内存泄漏，实际只绑定一次。
- **修复**：可接受，但建议在 `close()` 中管理。

### M-11 🔶 relations.js 数据迁移执行时机
- **文件**：`modules/relations/relations.js` `loadData()` 方法
- **问题**：每次模块初始化时都遍历所有联系人检查 `category` 字段，对缺失的写入默认值。对于大量联系人（数百个），每次进入页面都执行 `Storage.put()` 效率低下。
- **修复**：使用 `meta` 表标记迁移已完成，只在首次执行。

### M-12 🔶 dashboard.js `showAnnualReview` 年份参数未动态传入
- **文件**：`modules/dashboard/dashboard.js`
- **问题**：`bindAnnualEvents()` 中固定传入 `new Date().getFullYear()`：
  ```js
  btn.addEventListener('click', () => showAnnualReview(new Date().getFullYear()));
  ```
  没有年份切换功能，只能看当前年度。
- **影响**：功能不完整，但不会崩溃。

---

## 三、轻微问题 (L) — 可优化

### L-01 💡 rest.css link 位置异常
- **文件**：`life.html` 第 45 行
- **问题**：`<link rel="stylesheet" href="modules/rest/rest.css">` 放在防闪白 `<script>` 标签之后、`</head>` 之前，而其他模块 CSS 都在 `<script>` 之前。虽然功能正常，但不一致。
- **建议**：移到其他 `<link>` 标签旁边，保持一致性。

### L-02 💡 theme.js `STORAGE_KEY` 常量未使用
- **文件**：`core/theme.js` 第 6 行
- **问题**：定义了 `const STORAGE_KEY = 'theme'` 但从未引用。实际使用的是 localStorage key `'life-workspace-theme'`。
- **建议**：删除未使用的常量或统一引用。

### L-03 💡 xiaolu.js 语音功能 `_voiceBaseText` 声明位置
- **文件**：`core/xiaolu.js`
- **问题**：`let _voiceBaseText = ''` 声明在 `initVoice()` 和 `bindVoiceEvents()` 之间（约第 230 行），与其他状态变量分散。
- **建议**：移到文件顶部状态变量集中声明区域。

### L-04 💡 relations.js `getHealthStatusCompat` 未使用
- **文件**：`modules/relations/relations.js`
- **问题**：定义了 `getHealthStatusCompat()` 兼容函数，但全文没有任何地方调用它。
- **建议**：删除死代码，或标记为 `@deprecated`。

### L-05 💡 search.js `highlightText` 正则转义可优化
- **文件**：`core/search.js`
- **问题**：`highlightText()` 中的正则转义逻辑正确但较复杂，可提取为通用工具函数。
- **建议**：低优先级重构。

### L-06 💡 storage.js migrations 注释中的示例代码
- **文件**：`core/storage.js`
- **问题**：文件末尾保留了注释掉的 v7 示例代码。
- **建议**：保留作为开发指南即可，不影响功能。

### L-07 💡 dashboard.css `.dash-focus-card` 渐变背景与 `--bg-card` 变量冲突
- **文件**：`modules/dashboard/dashboard.css`
- **问题**：`.dash-focus-card` 有 `.card` 类（背景 `var(--bg-card)`），但又被 `.dash-focus-card` 的渐变覆盖。暗色模式下渐变需单独定义。
- **建议**：在暗色模式中为 `.dash-focus-card` 设置适配的背景。

### L-08 💡 whitenoise.js `filterNode` 变量声明但从未使用
- **文件**：`modules/whitenoise/whitenoise.js`
- **问题**：`let filterNode = null;` 声明了但全文没有对 filterNode 进行赋值（除了 `stopNoise` 中的清理逻辑）。
- **建议**：删除未使用的变量声明。

### L-09 💡 多处 `typeof App !== 'undefined'` 防御性检查冗余
- **文件**：多个模块文件
- **问题**：`if (typeof App !== 'undefined' && App.showToast)` 模式出现 20+ 次。App 在 life.html 中的加载顺序确保它在所有模块之后，但所有模块的 `init()` 调用都在 `App.init()` 之后。
- **建议**：防御性编程无错，但可以封装为全局 `showToast()` 辅助函数减少冗余。

### L-10 💡 manifest.json 未更新版本号
- **文件**：`manifest.json`
- **问题**：本轮新增 15 项功能，但 manifest 和 sw.js 中的缓存版本号 (`life-workspace-v12`) 需要确认是否已更新。
- **建议**：确认 sw.js 缓存版本号已递增。

---

## 四、集成检查结果

### ✅ life.html 脚本引用检查
| 检查项 | 状态 |
|--------|------|
| 所有 script src 路径正确 | ✅ |
| 加载顺序正确（storage → router → modules → core → app → rest） | ✅ |
| CSS link 全部存在 | ✅ |
| 防闪白脚本位置正确（head 中同步执行） | ✅ |
| DOM 元素 ID 与 JS 引用匹配 | ✅ |

### ✅ theme.js ↔ app.js 集成
- `ThemeManager.init()` 在 `App.init()` 步骤 10 被正确调用 ✅
- `ThemeManager.getTheme()` 被 `showThemePicker()` 正确调用 ✅
- `ThemeManager.setTheme()` 被主题选择器正确调用 ✅
- **但**：因 S-01 存储字段错误，实际运行时主题无法正确持久化

### ✅ rest.js ↔ life.html DOM 一致性
| DOM ID | HTML 存在 | JS 引用 |
|--------|----------|---------|
| `rest-overlay` | ✅ | ✅ |
| `rest-canvas` | ✅ | ✅ |
| `rest-time` | ✅ | ✅ |
| `rest-quote` | ✅ | ✅ |
| `rest-mode-btn` | ✅ | ✅ |

### ✅ notifications.js ↔ dashboard.js API 匹配
| API | 定义方 | 调用方 | 状态 |
|-----|--------|--------|------|
| `getTodayTasks()` | notifications.js | **无调用者** | ⚠️ 未集成 |
| `getSuggestions()` | notifications.js | **无调用者** | ⚠️ 未集成 |
| `generateSmartSuggestions()` | notifications.js | 自身定时调用 | ✅ |

### ✅ tasks.js F6 周计划 vs F8 矩阵冲突检查
- 两个功能使用独立的 `data-panel` 值（`matrix` / `weekly`）
- HTML 中有独立的面板容器
- JS 中有独立的渲染函数（`renderMatrixView()` / `renderWeeklyView()`）
- **结论**：无冲突 ✅

### ✅ relations.js ABCD 分类数据迁移兼容性
- `loadData()` 中对无 `category` 字段的联系人自动补充 `'C'` 默认值 ✅
- `getHealthStatus()` 使用 `contact.category || 'C'` 兜底 ✅
- `getHealthStatusCompat()` 提供字符串参数兼容（但未被调用）
- **结论**：向后兼容 ✅

### ✅ storage.js 迁移框架完整性
| 版本 | 内容 | 状态 |
|------|------|------|
| v1 | 基础表（checkins/habits/tasks/study/health/finance/settings/meta） | ✅ |
| v2 | projects + pomodoros | ✅ |
| v3 | semesters/courses/books/skills | ✅ |
| v4 | journal/goals/contacts/knowledge/ideas/lifetree | ✅ |
| v5 | 清除示例数据 | ✅ |
| v6 | notifications 表 | ✅ |
- 迁移框架采用 `for` 循环按版本顺序执行，支持跨版本升级 ✅
- 错误处理：每个迁移有 try-catch ✅

### ✅ xiaolu.js Web Speech API 兼容性
- `checkVoiceSupport()` 检测 `window.SpeechRecognition || window.webkitSpeechRecognition` ✅
- 不支持时隐藏语音按钮并更新提示文字 ✅
- iOS Safari `audioContext.resume()` 兼容 ✅
- `onend` 自动重启处理超时 ✅
- **结论**：兼容性处理完善 ✅

---

## 五、暗色模式覆盖度总结

| 组件 | CSS 变量适配 | 硬编码颜色 | 暗色覆盖 | 评级 |
|------|-------------|-----------|---------|------|
| 主题系统核心 | ✅ | — | ✅ | 🟢 |
| 搜索面板 | ✅ 大部分 | 少量 | ✅ 部分 | 🟡 |
| 白噪音面板 | ✅ 大部分 | 有 | ❌ | 🟠 |
| 休息模式 | ✅（全屏深色场景） | — | N/A | 🟢 |
| 今日聚焦卡片 | ❌ | 有 | ❌ | 🔴 |
| 生日提醒卡片 | ❌ | 有 | ❌ | 🔴 |
| 智能建议通知项 | ❌ | 有 | ❌ | 🔴 |
| 年度回顾弹窗 | ✅ 大部分 | 有（遮罩） | ❌ | 🟡 |
| 小鹿AI面板 | ✅ 大部分 | 有 | ❌ | 🟡 |
| 任务矩阵/周计划 | ✅ 通过CSS变量 | 待确认 | ❌ | 🟡 |
| 关系ABCD分类 | ✅ 通过CSS变量 | 少量 | ❌ | 🟡 |

---

## 六、总结

### 问题统计

| 严重程度 | 数量 | 说明 |
|---------|------|------|
| 🔴 严重 (S) | **3** | S-01 主题存储字段错误、S-02 防闪白数据源不一致、S-04/S-05 两个功能未实现 |
| 🟠 中等 (M) | **12** | 暗色模式缺失(6)、集成缺失(2)、事件泄漏(1)、效率问题(1)、功能不完整(2) |
| 🟡 轻微 (L) | **10** | 代码规范、死代码、可优化项 |

### 功能实现状态

| 功能 | 状态 |
|------|------|
| T1 防刷新白边 | ✅ 已实现 |
| T3 数据迁移规范化 | ✅ 已实现（v1-v6完整） |
| F1 今日三件事 | ✅ 已实现 |
| F2 主题系统 | ⚠️ **有严重Bug**（S-01） |
| F3 快捷指令搜索 | ✅ 已实现 |
| F4 白噪音 | ✅ 已实现 |
| F5 年度回顾 | ✅ 已实现 |
| F6 周计划视图 | ✅ 已实现 |
| F7 智能建议引擎 | ⚠️ 引擎已实现，但**未被 dashboard 集成调用** |
| F8 任务优先级矩阵 | ✅ 已实现 |
| F9 快速录入引擎 | ❌ **未实现** |
| F10 联系人ABCD分类 | ✅ 已实现 |
| F11 小鹿AI语音输入 | ✅ 已实现 |
| 休息模式 | ✅ 已实现 |
| 模板系统 | ❌ **未实现** |

### 上线建议

> **⚠️ 不建议直接上线**

**阻塞项**（必须修复后才能上线）：
1. **S-01**：theme.js 存储字段名 `id` → `key`，一行修复但不修会导致暗色模式刷新后丢失
2. **S-02**：与 S-01 关联修复

**建议修复项**（可延迟一个版本）：
- M-03 ~ M-07：暗色模式硬编码颜色问题
- M-08：休息模式通知暂停机制
- M-02：F1 与 F7 集成

**功能缺失项**（需排期）：
- F9 快速录入引擎
- 模板系统（每月31号复盘提醒）
