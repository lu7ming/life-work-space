# 精简方案可行性评估

> 评估日期：2026-08-02
> 项目路径：`/app/data/所有对话/主对话/life-work-space/`
> 方法论：基于 grep/find 实际扫描代码，逐一验证三份报告（AI模块审计、功能模块分析、CSS优化）的结论
> 总代码规模：JS 29,396 行 / CSS 16,156 行

---

## 一、可安全删除的模块（已验证无依赖或依赖可安全切断）

### 1.1 model-router.js — 344 行

| 项目 | 内容 |
|------|------|
| **文件** | `core/model-router.js` |
| **行数** | 344 |
| **报告结论** | "没有任何实际调用方" |
| **实际依赖** | ❌ 报告结论不准确。xiaolu.js（3处）、nicole.js（6处）均有调用，但**全部使用 `typeof ModelRouter !== 'undefined'` 守卫模式**，删除后不会抛错，仅降级到直接 API 调用 |
| **其他引用** | app.js:154-155（init）、life.html:265（script 标签）、sw.js:28（缓存） |
| **删除步骤** | ① 删除 `core/model-router.js` ② 移除 life.html:265 的 `<script>` 标签 ③ 移除 sw.js:28 的缓存条目 ④ 移除 app.js:154-155 的 init 代码 ⑤ xiaolu.js/nicole.js 中的守卫代码无需改动（自动降级） |
| **风险等级** | **低** |

### 1.2 data-minimizer.js — 427 行

| 项目 | 内容 |
|------|------|
| **文件** | `core/data-minimizer.js` |
| **行数** | 427 |
| **报告结论** | 单用户场景完全不需要 |
| **实际依赖** | xiaolu.js（7处）、nicole.js（12处）有调用，**全部使用 `typeof DataMinimizer !== 'undefined'` 守卫模式**；audit-log.js 内部有同名 sanitizeParams 函数（独立实现，不依赖 DataMinimizer） |
| **其他引用** | life.html:269（script 标签）、sw.js:36（缓存） |
| **删除步骤** | ① 删除 `core/data-minimizer.js` ② 移除 life.html:269 的 `<script>` 标签 ③ 移除 sw.js:36 的缓存条目 ④ xiaolu.js/nicole.js 中的守卫代码无需改动 |
| **风险等级** | **低** |

### 1.3 local-ai.js — 557 行

| 项目 | 内容 |
|------|------|
| **文件** | `core/local-ai.js` |
| **行数** | 557 |
| **报告结论** | 离线降级性价比低，可删除 |
| **实际依赖** | xiaolu.js:1698-1700（离线降级调用）、nicole.js:1415（离线检查）、app.js:185-186（init），**全部使用守卫模式** |
| **其他引用** | life.html:270（script 标签）、sw.js:37（缓存） |
| **删除步骤** | 同上模式：删文件 → 移除 script 标签 → 移除缓存 → 移除 init |
| **风险等级** | **低**（但若用户有离线使用场景，需保留简化版；纯在线场景可安全删） |

### 1.4 rest 模块 — 882 行（JS 759 + CSS 123）

| 项目 | 内容 |
|------|------|
| **文件** | `modules/rest/rest.js` + `modules/rest/rest.css` |
| **行数** | 759 行 JS + 123 行 CSS |
| **报告结论** | 纯动画展示无实质功能，可删除 |
| **实际依赖** | 仅 life.html 引用：CSS link (line 53)、rest-mode-btn 按钮 (line 182)、rest-overlay/canvas/quote HTML (line 236-240)、script 标签 (line 285)。**无任何 JS 文件引用 rest 模块** |
| **删除步骤** | ① 删除 `modules/rest/rest.js` + `rest.css` + `rest.html` ② 移除 life.html 中的 CSS link (line 53)、topbar 按钮 (line 182)、overlay HTML (line 236-240)、script 标签 (line 285) ③ 移除 sw.js 中 rest 相关缓存 |
| **风险等级** | **低** |

---

## 二、需额外处理的模块（有依赖或边界复杂）

### 2.1 audit-log.js — 615 行 + CSS 378 行

| 项目 | 内容 |
|------|------|
| **文件** | `core/audit-log.js` + `styles/audit-log.css` |
| **行数** | 615 行 JS + 378 行 CSS = 993 行 |
| **报告结论** | 单用户无意义，可删除 |
| **实际依赖** | **依赖链较复杂**：|
| | ① **xiaolu.js**（2处 AuditLog.log，守卫模式 ✅） |
| | ② **nicole.js**（2处 AuditLog.log，守卫模式 ✅） |
| | ③ **timetracker.js:117**（1处 AuditLog.log，守卫模式 ✅） |
| | ④ **app.js:180-181**（init）、app.js:835-836（showAuditPanel） |
| | ⑤ **storage.js:141-167**（IndexedDB 创建 audit_log/audit_logs 两个表，含4个索引） |
| | ⑥ **utils.js:661-680**（**⚠️ 内含简化版 AuditLog，仅 log + getRecentLog 约20行，独立于 audit-log.js**） |
| | ⑦ **life.html**（CSS link line 27、topbar-audit-btn 按钮 line 184、script 标签 line 272） |
| **关键发现** | utils.js 内已有简化版 AuditLog。audit-log.js 加载后会**覆盖** utils.js 中的简化版。删除 audit-log.js 后，utils.js 的简化版会生效，但只提供 log + getRecentLog，不支持 showAuditPanel 等 UI 功能 |
| **删除步骤** | ① 删除 `core/audit-log.js` + `styles/audit-log.css` ② 移除 life.html 中 CSS link (line 27)、topbar 按钮 (line 184)、script 标签 (line 272) ③ 移除 app.js:180-181 init、app.js:835-836 showAuditPanel ④ 移除 sw.js 缓存条目 ⑤ timetracker.js:117 的守卫调用无需改动 ⑥ **可选**：清理 storage.js 中 audit_log/audit_logs 表创建代码（保留不影响功能，仅留空表） ⑦ **可选**：清理 utils.js 中的简化版 AuditLog（删除后 timetracker 的守卫调用会安全跳过） |
| **风险等级** | **中**（涉及 storage.js 表结构，需确认 IndexedDB 版本迁移策略） |

### 2.2 predictive-engine.js — 465 行

| 项目 | 内容 |
|------|------|
| **文件** | `core/predictive-engine.js` |
| **行数** | 465 |
| **报告结论** | 与 smart-suggestion 重叠，可合并 |
| **实际依赖** | **⚠️ dashboard.js 有非守卫依赖**：|
| | ① dashboard.js:141-147 — `PredictiveEngine.getPredictions()` 只在入口处守卫，后续 recordFeedback/executePrediction 无守卫 |
| | ② dashboard.js:184-204 — `PredictiveEngine.recordFeedback()`、`PredictiveEngine.executePrediction()` 无守卫，若 PredictiveEngine 未定义将**抛出运行时错误** |
| | ③ app.js:98-99（destroy）、175-176（init），守卫模式 ✅ |
| | ④ utils.js:1137（简化版 PredictiveEngine，仅 predict() 约30行，**无 getPredictions/recordFeedback/executePrediction**） |
| **关键发现** | ① utils.js 中的简化版 PredictiveEngine 仅提供 predict()，不提供 dashboard.js 所需的 getPredictions/recordFeedback/executePrediction，**不能作为删除后的安全降级** ② dashboard.js 的依赖未完全守卫，**直接删除会导致 dashboard 运行时错误** |
| **处理方案** | **方案 A（推荐）**：先给 dashboard.js 中所有 PredictiveEngine 调用添加守卫检查，再删除 predictive-engine.js。约需改动 6 处  **方案 B**：将 predictive-engine.js 的核心预测逻辑（约50行）合并到 smart-suggestion.js，然后删除原文件并更新 dashboard.js 调用入口 |
| **风险等级** | **中**（dashboard.js 有未守卫的调用，需先修补再删除） |

### 2.3 lifetree 模块 — 1,489 行（JS 1,039 + CSS 450）

| 项目 | 内容 |
|------|------|
| **文件** | `modules/lifetree/lifetree.js` + `lifetree.css` + `lifetree.html` |
| **行数** | 1,039 行 JS + 450 行 CSS = 1,489 行 |
| **报告结论** | 纯装饰性可视化，可删除 |
| **实际依赖** | **依赖链广泛**：|
| | ① **app.js**（4处）：Router.register('lifetree', loadLifeTree) — line 61；路由映射 — line 260；loadLifeTree 函数 — line 512-523；topbar 点击 — line 842 |
| | ② **export.js**（2处）：模块列表和名称映射 — line 10, 33 |
| | ③ **search.js**（1处）：搜索索引 — line 26 |
| | ④ **storage.js**（1处）：lifetree IndexedDB 表 — line 105 |
| | ⑤ **utils.js**（1处）：键盘快捷键注册 '8' → lifetree — line 549 |
| | ⑥ **xiaolu.js**（1处）：Function Calling 导航工具 nav_lifetree — line 1671 |
| | ⑦ **life.html**（3处）：sidebar 导航项 — line 130-132；topbar 按钮 — line 183；script 标签 — line 261 |
| | ⑧ **sw.js**（3处）：HTML/CSS/JS 缓存条目 |
| **删除步骤** | 需在 **8 个文件** 中清理引用：删文件 → 移除 app.js 路由注册+加载函数+topbar事件 → 移除 export.js/search.js/storage.js 条目 → 移除 utils.js 快捷键 → 移除 xiaolu.js FC 工具定义 → 移除 life.html 3处引用 → 移除 sw.js 缓存 |
| **风险等级** | **中**（不危险但清理量大，遗漏任何一处都可能留下死代码或空导航） |

### 2.4 shared-knowledge.js — 244 行

| 项目 | 内容 |
|------|------|
| **文件** | `core/shared-knowledge.js` |
| **行数** | 244 |
| **报告结论** | 随妮可删除而删除 |
| **实际依赖** | xiaolu.js（7处：getContextForPrompt + set）、nicole.js（5处）、orchestrator.js（6处）、user-profile.js（4处）、app.js（1处 init） |
| **关键发现** | xiaolu.js 也大量使用 SharedKnowledge（set last_expense/last_task/last_habit_checkin），**不只有妮可在用**。如果只删 nicole 不删 xiaolu，SharedKnowledge 仍有价值 |
| **处理方案** | **仅在同时删除 nicole + orchestrator 时才可删除**。若保留 xiaolu，需保留 SharedKnowledge 或将 xiaolu 中的 set 调用也清理掉 |
| **风险等级** | **中**（依赖 xiaolu.js，不能单独删除） |

### 2.5 orchestrator.js — 483 行

| 项目 | 内容 |
|------|------|
| **文件** | `core/orchestrator.js` |
| **行数** | 483 |
| **报告结论** | 随妮可删除而删除 |
| **实际依赖** | xiaolu.js（4处：route + setManualOverride + updateIndicator + notifyAction）、nicole.js（3处：notifyAnalysis + setManualOverride）、app.js（1处 init） |
| **关键发现** | 与 shared-knowledge 类似，xiaolu.js 也使用 AIOrchestrator（route、setManualOverride、notifyAction），**不仅服务于妮可**。但 orchestrator 的核心功能就是双 AI 路由，若删妮可，路由功能失去意义 |
| **处理方案** | 删除妮可后，清理 xiaolu.js 中的 AIOrchestrator 调用（约4处），再删除 orchestrator.js |
| **风险等级** | **中**（需同步修改 xiaolu.js） |

---

## 三、建议精简的模块（精简可行但需评估）

### 3.1 preference-learner.js — 422 行

| 项目 | 内容 |
|------|------|
| **当前行数** | 422 |
| **实际依赖** | xiaolu.js 深度集成（5处：getPersonalizedPromptSuffix × 4 + learnFromInteraction × 3），是 AI 个性化的核心能力 |
| **可精简范围** | 当前有风格/操作/时间三大类共 8 个偏好项。可先保留最核心的 2-3 项（语言风格 + 操作偏好），暂停时间偏好和自动确认阈值，约可精简 **120-150 行** |
| **精简方案** | 删除 `timePreferences`（时间偏好维度）、简化 `autoConfirmThreshold`（自动确认阈值）、合并部分重复的学习逻辑 |
| **风险** | 低。偏好维度减少不影响核心对话能力，只是个性化粒度变粗 |

### 3.2 xiaolu.js — 2,380 行

| 项目 | 内容 |
|------|------|
| **当前行数** | 2,380 |
| **可精简范围** | ① 三跳 Prompt 死代码：~216 行（常量定义 68 行 + 函数实现 148 行）。注意：此代码**非完全死代码**，仍作为 Function Calling 失败时的降级兜底（xiaolu.js:752/789/796 三处调用 `_fallbackDecomposedChain`）。若确认降级从未触发，可删除 **②** 吸收其他模块功能后的统一入口重构 |
| **精简方案** | 阶段一：确认三跳降级触发频率 → 若极低则删除（节省 ~216 行）。阶段二：删除 nicole/orchestrator/shared-knowledge 后，清理 xiaolu.js 中对应的守卫代码（约 30 行） |
| **风险** | 低到中。三跳降级是容错机制，删除前需确认 Function Calling 稳定性 |

### 3.3 nicole.js — 1,606 行

| 项目 | 内容 |
|------|------|
| **当前行数** | 1,606 |
| **实际依赖** | life.html（CSS link、FAB 按钮、script 标签）、app.js（无显式 init）、orchestrator.js、shared-knowledge.js、smart-suggestion.js |
| **可精简范围** | 报告建议方案 A（彻底删除）或方案 B（保留 Coze 调用，删 UI） |
| **精简方案** | **方案 A（推荐，节省 1,606 行）**：彻底删除，将数据分析能力以 Function Calling 工具形式并入小鹿。需同步清理：nicole.css（582行）、life.html 中 FAB 按钮 + script + CSS link、xiaolu.js 中 setManualOverride 调用、sw.js 缓存  **方案 B（保守，节省 ~1,000 行）**：删除独立 UI 面板，保留后台 Coze 调用能力作为小鹿的"分析模式" |
| **风险** | 方案 A 风险 **中高**（1,606 行 + 582 行 CSS，改动量大，需确保小鹿吸收所有数据分析能力）；方案 B 风险 **中** |

### 3.4 smart-reminder.js — 400 行

| 项目 | 内容 |
|------|------|
| **当前行数** | 400 |
| **实际依赖** | app.js（init/destroy）、utils.js 中有简化版（~100行，仅规则层4个定时提醒 + checkSmartReminders 智能层） |
| **关键发现** | utils.js 的简化版 SmartReminder 已覆盖核心功能（4个规则提醒 + 消费异常/任务积压/习惯断签/周末总结 4个智能提醒），smart-reminder.js 的额外价值主要在防重发标记（LS_PREFIX）和更精细的 UI 通知 |
| **可精简范围** | 删除独立文件，保留 utils.js 中的简化版即可。节省 **400 行**（独立文件），utils.js 的 ~100 行已经足够 |
| **精简方案** | ① 删除 `core/smart-reminder.js` ② 移除 life.html script 标签 ③ 移除 app.js init/destroy 代码 ④ 移除 sw.js 缓存条目 ⑤ utils.js 简化版自动生效（但需确认 app.js 中的 init 调用改为 init utils.js 内的版本） |
| **风险** | **低到中**。需验证 utils.js 简化版的功能覆盖度是否满足需求 |

---

## 四、建议合并的模块（合并可行性分析）

### 4.1 习惯链 vs 习惯组合

| 项目 | 内容 |
|------|------|
| **涉及模块** | habits.js 中的 HABIT_CHAINS（3条）+ HABIT_GROUPS（3个） |
| **当前代码** | chains: 定义(3行) + renderChains(~25行) + updateChainState(~40行) + getNextHabitInChain(~7行) + checkChainCompletion(~15行) ≈ 90行；groups: 定义(4行) + renderGroups(~17行) + updateGroupProgress(~15行) + handleGroupCheckin(~22行) ≈ 58行 |
| **重叠点** | 数据结构几乎相同（{id, name, emoji, habits: string[]}），晨间链和晨间routine有 3/4 习惯重叠（warm-water, breakfast, exercise），渲染都是卡片+状态展示 |
| **合并方案** | 统一为 `HABIT_SETS` 数据结构，增加 `ordered: boolean` 字段。渲染时根据 ordered 切换"链式"（显示箭头+下一步高亮）或"组合"（显示一键打卡按钮）。可删除重复的状态更新逻辑 |
| **难度** | **低**。数据结构兼容，逻辑可复用，主要是 UI 渲染的条件分支 |
| **风险** | 低。用户感知变化小，合并后概念更清晰 |
| **预估节省** | ~40-60 行 |

### 4.2 番茄钟 vs 时间追踪器

| 项目 | 内容 |
|------|------|
| **涉及模块** | tasks.js 中的番茄钟（~390行，637-1027行）+ timetracker.js（344行） |
| **重叠点** | 都是"计时+记录"功能，番茄钟是结构化专注计时（25+5循环），timetracker 是自由计时（6分类手动/实时追踪） |
| **差异** | ① 番茄钟绑定任务（选择具体任务进行专注），timetracker 只选分类 ② 番茄钟有工作/休息循环，timetracker 一次性计时 ③ 番茄钟数据存 tasks 存储，timetracker 存 timetracker 存储 ④ timetracker 有饼图+时间线视图，番茄钟有历史统计 |
| **合并方案** | 在 tasks 模块内新增"自由计时"tab（吸收 timetracker 的实时追踪+手动补录功能），数据统一存 tasks 存储，饼图/时间线作为附加视图。删除独立的 timetracker 模块 |
| **难度** | **中**。UI 合并需重新设计 tasks 的 tab 结构，数据存储需统一，但两套计时逻辑可以复用底层 setInterval 机制 |
| **风险** | 中。合并后 tasks 模块会更大（+344行 - 重叠 ≈ 净增250行），需权衡模块体量 |
| **预估节省** | 删除 timetracker 模块文件 344 行 + CSS 74 行 + HTML，但 tasks.js 净增约 250 行。**净节省约 170 行 JS + 74 行 CSS + sidebar 导航位** |

### 4.3 日记复盘 vs 模板系统

| 项目 | 内容 |
|------|------|
| **涉及模块** | journal.js 的复盘功能（~200行，reviewTemplates + renderReviews + openReviewModal + saveReview）+ templates_module.js（447行）+ templates.js（663行） |
| **重叠点** | ① journal 复盘：手动填写周/月/年复盘，模板结构简单（3个字段），纯文本存储 ② templates 模板：自动收集各模块数据生成统计报告，支持 AI 分析，可导出 MD/JSON ③ 两边都做"月度复盘"，概念重叠 |
| **差异** | ① journal 复盘是**快速手写反思**（3个字段，即开即用），templates 是**数据驱动报告**（自动统计+AI分析+导出）② templates 有跨模块数据收集引擎（从 finance/tasks/habits/health/study 各模块汇总），journal 复盘无此能力 ③ templates 支持导出，journal 复盘不支持 |
| **合并方案** | **推荐：保留两者但重新定位**。journal 复盘 → "快速反思"（保留当前简洁体验）；templates → "数据报告"（保留自动统计能力）。在 journal 的复盘 tab 中增加"生成数据报告"按钮，点击跳转到 templates。**不推荐物理合并**，因为数据收集引擎（templates.js 的 collectData/generateReport，约 230 行）与 journal 的轻量复盘逻辑设计理念不同 |
| **难度** | **中高**（若强行合并）。templates.js 的跨模块数据收集代码无法简单嵌入 journal |
| **风险** | 中高。强行合并可能导致 templates 的数据收集能力降级，或 journal 变得过于复杂 |
| **预估节省** | 若只做导航整合（加个跳转按钮），几乎不省代码。若强行合并，可能反而增加代码（需重构数据流） |

---

## 五、CSS 精简建议（含验证结果）

### 5.1 dashboard.css — 可安全删除（20 行）

| 项目 | 内容 |
|------|------|
| **文件** | `styles/dashboard.css` |
| **行数** | 20 |
| **问题** | 定义了 `.page-enter { animation: pageFadeIn 0.3s ease forwards }` 与 main.css:774 的 `.page-enter { animation: pageEnter 0.25s cubic-bezier(...) }` **冲突**。实际生效取决于加载顺序（后加载覆盖前加载），可能导致行为不一致 |
| **验证** | ✅ 确认冲突存在。dashboard.css 的 pageFadeIn 会覆盖 main.css 的 pageEnter |
| **操作** | 删除 `styles/dashboard.css`，移除 life.html:23 的 CSS link，移除 sw.js 缓存条目。main.css 的定义已足够 |
| **预估节省** | 20 行 + 1 个 HTTP 请求 |

### 5.2 妮可/小鹿面板 CSS — 可提取共享基类（~450 行）

| 项目 | 内容 |
|------|------|
| **文件** | `styles/nicole.css`（582行）+ `styles/xiaolu.css`（943行）= 1,525 行 |
| **重叠选择器** | 15 对结构完全相同的选择器：overlay、panel、header、header-actions、header-btn、header-left、messages、msg、msg-bubble、input-area、input-row、loading、loading-dot、welcome、token-dialog、send-btn、subtitle、title、avatar |
| **验证** | ✅ 确认高度重叠。每个共享选择器的属性模式一致（尺寸、间距、定位、动画），差异仅在滑入方向（左/右）和主题色（橙色/蓝色） |
| **操作** | 提取 `.chat-panel` 基类到 `styles/components/chat.css`（约450行共享结构），nicole.css 和 xiaolu.css 仅保留方向+颜色差异（分别约130行和490行） |
| **预估节省** | ~450 行 |

### 5.3 audit-log.css — 可随 audit-log.js 一起删除（378 行）

| 项目 | 内容 |
|------|------|
| **文件** | `styles/audit-log.css` |
| **行数** | 378 |
| **验证** | ✅ 仅 life.html:27 引用此 CSS。CSS 中的 `.audit-overlay`/`.audit-panel` 等选择器仅在 audit-log.js 动态生成的 DOM 中使用 |
| **操作** | 若决定删除 audit-log.js，一并删除此 CSS。若保留 audit-log 功能，其抽屉结构与 nicole/xiaolu 重复，可提取基类节省约 250 行 |
| **预估节省** | 完全删除 378 行；或提取基类后节省约 250 行 |

### 5.4 topbar-ai-btn 残留样式 — 可删除（~33 行）

| 项目 | 内容 |
|------|------|
| **文件** | `styles/main.css`（154-186行） |
| **行数** | ~33 行 |
| **验证** | ✅ life.html 中 `.topbar-ai-btns` 和 `.topbar-ai-btn` 元素已被**注释掉**（line 171-175），app.js:767 仍有无害的死代码 `querySelectorAll('.topbar-ai-btn')`（返回空集合） |
| **操作** | 删除 main.css 中 `.topbar-ai-btns`、`.topbar-ai-btn`、`.topbar-ai-btn.long-press-active`、`.topbar-ai-btn:hover` 相关样式（33行），可选清理 app.js:767 死代码 |
| **预估节省** | ~33 行 CSS + 1 行 JS |

### 5.5 long-press-active 残留 — 可删除（~10 行）

| 项目 | 内容 |
|------|------|
| **文件** | `styles/main.css`:177（`.topbar-ai-btn.long-press-active`）+ `styles/quickinput.css`:396（`.ai-fab-btn.long-press-active`） |
| **行数** | ~10 行 |
| **验证** | ✅ 全局搜索 JS 文件中**零**引用 `long-press-active` 或 `longPressActive`，确认是早期长按功能的遗留 |
| **操作** | 直接删除两处 CSS 定义 |
| **预估节省** | ~10 行 |

### 5.6 fadeIn 动画 5 处重复 — 可统一（~30 行）

| 项目 | 内容 |
|------|------|
| **重复位置** | journal.css:43、goals.css:493、tasks.css:76、knowledge.css:414（4处完全相同的 @keyframes fadeIn）+ study.css:67（study-fadeIn，仅位移值略有差异） |
| **行数** | 每处约 8 行，共 ~40 行重复 |
| **验证** | ✅ 确认 4 处 fadeIn 完全相同（opacity 0→1 + translateY 8px→0），study-fadeIn 仅 translateY 值不同 |
| **操作** | 提取统一 `@keyframes fadeIn` 到 main.css，各模块删除本地定义，study 改用全局 fadeIn 或保留差异值 |
| **预估节省** | ~30 行 |

### 5.7 page-enter 动画重复 — 可统一（~12 行）

| 项目 | 内容 |
|------|------|
| **重复位置** | main.css:774（.page-enter）、dashboard.css:7-20（.page-enter + @keyframes pageFadeIn）、timetracker.css:2（内联 animation） |
| **行数** | dashboard.css 整体 20 行 + timetracker 内联 1 行 |
| **操作** | 删除 dashboard.css，timetracker.css 改为 `.timetracker-page { ... animation: pageEnter 0.25s ... }` 复用 main.css 的动画 |
| **预估节省** | 20 行（删 dashboard.css）+ 1 行修改 |

---

## 六、推荐执行顺序

按风险从低到高排序，每步列出具体操作：

### 第一阶段：无争议删除（低风险，~2,381 行）

| 步骤 | 操作 | 节省行数 | 涉及文件 |
|------|------|---------|---------|
| 1 | 删除 `styles/dashboard.css`，移除 life.html link 和 sw.js 缓存 | 20 行 CSS | life.html, sw.js, dashboard.css |
| 2 | 删除 main.css 中 topbar-ai-btn 残留（33行）+ quickinput.css long-press-active（5行） | 38 行 CSS | main.css, quickinput.css |
| 3 | 删除 `core/model-router.js`，移除 life.html script + sw.js + app.js init | 344 行 JS | model-router.js, life.html, sw.js, app.js |
| 4 | 删除 `core/data-minimizer.js`，移除 life.html script + sw.js | 427 行 JS | data-minimizer.js, life.html, sw.js |
| 5 | 删除 `core/local-ai.js`，移除 life.html script + sw.js + app.js init | 557 行 JS | local-ai.js, life.html, sw.js, app.js |
| 6 | 删除 `modules/rest/` 整个目录，移除 life.html 中 CSS link + topbar按钮 + overlay HTML + script 标签 | 882 行 (759JS+123CSS) | rest/*, life.html |
| 7 | 统一 fadeIn 动画到 main.css，删除 4 处模块内重复 | 30 行 CSS | 4 个模块 CSS, main.css |
| **小计** | | **~2,298 行** | |

### 第二阶段：需修补后删除（中风险，~2,093 行）

| 步骤 | 操作 | 节省行数 | 涉及文件 |
|------|------|---------|---------|
| 8 | 给 dashboard.js 的 PredictiveEngine 调用添加守卫，然后删除 `core/predictive-engine.js` | 465 行 JS | dashboard.js, predictive-engine.js, life.html, sw.js, app.js |
| 9 | 删除 `core/smart-reminder.js`（utils.js 简化版自动生效），移除 life.html script + sw.js + app.js init | 400 行 JS | smart-reminder.js, life.html, sw.js, app.js |
| 10 | 删除 `core/audit-log.js` + `styles/audit-log.css`，移除 life.html CSS link + topbar按钮 + script标签 + app.js init/showAuditPanel | 993 行 (615JS+378CSS) | audit-log.js, audit-log.css, life.html, sw.js, app.js |
| 11 | 删除 `modules/lifetree/` 整个目录，清理 app.js/export.js/search.js/storage.js/utils.js/xiaolu.js/life.html/sw.js 共8个文件的引用 | 1,489 行 (1039JS+450CSS) | 8个文件 |
| **小计** | | **~3,347 行** | |

### 第三阶段：架构简化（中高风险，~3,815 行）

| 步骤 | 操作 | 节省行数 | 涉及文件 |
|------|------|---------|---------|
| 12 | 删除 nicole.js + nicole.css + life.html FAB按钮/CSS/script + sw.js | 2,188 行 (1606JS+582CSS) | nicole.js, nicole.css, life.html, sw.js |
| 13 | 同步删除 orchestrator.js + shared-knowledge.js，清理 xiaolu.js 中的调用 | 727 行 (483+244) | orchestrator.js, shared-knowledge.js, xiaolu.js, life.html, sw.js, app.js |
| 14 | 提取 chat-panel CSS 基类（合并妮可/小鹿共享结构） | 450 行 CSS | nicole.css(已删), xiaolu.css, 新建 chat.css |
| 15 | 清理 xiaolu.js 三跳 Prompt 降级代码（需确认 Function Calling 稳定性） | 216 行 JS | xiaolu.js |
| 16 | 精简 preference-learner.js 维度 | 120 行 JS | preference-learner.js |
| **小计** | | **~3,571 行** | |

### 第四阶段：模块合并（高风险，需 UI 重设计）

| 步骤 | 操作 | 节省行数 | 涉及文件 |
|------|------|---------|---------|
| 17 | 合并习惯链+习惯组合为统一"习惯组" | ~50 行 JS | habits.js, habits.css |
| 18 | 合并 timetracker 到 tasks 的"自由计时"tab | ~170 行 JS+74行CSS | tasks.js, timetracker/*, life.html |
| 19 | 日记复盘↔模板系统：仅做导航整合，不物理合并 | ~0 行 | journal.js, templates_module.js |
| **小计** | | **~220 行** | |

---

## 七、预估收益

### 按阶段汇总

| 阶段 | JS 行数 | CSS 行数 | 合计 | 风险 |
|------|---------|---------|------|------|
| 第一阶段（无争议删除） | 2,087 | 211 | **2,298** | 低 |
| 第二阶段（需修补后删除） | 2,504 | 828 | **3,332** | 中 |
| 第三阶段（架构简化） | 2,969 | 1,032 | **4,001** | 中高 |
| 第四阶段（模块合并） | 220 | 74 | **294** | 高 |
| **总计** | **7,780** | **2,145** | **9,925** | — |

### 占总代码比

| 指标 | 当前总量 | 可精简量 | 精简比例 |
|------|---------|---------|---------|
| JS | 29,396 行 | 7,780 行 | 26.5% |
| CSS | 16,156 行 | 2,145 行 | 13.3% |
| **合计** | **45,552 行** | **9,925 行** | **21.8%** |

### 保守方案（仅执行第一+第二阶段）

| 指标 | 可精简量 | 精简比例 |
|------|---------|---------|
| JS | 4,591 行 | 15.6% |
| CSS | 1,039 行 | 6.4% |
| **合计** | **5,630 行** | **12.4%** |

### 激进方案（执行全部四阶段）

| 指标 | 可精简量 | 精简比例 |
|------|---------|---------|
| JS | 7,780 行 | 26.5% |
| CSS | 2,145 行 | 13.3% |
| **合计** | **9,925 行** | **21.8%** |

---

## 附录：报告结论修正记录

| 报告 | 原结论 | 实际验证 | 修正 |
|------|--------|---------|------|
| AI审计 | model-router.js "没有任何实际调用方" | xiaolu.js 有 3 处、nicole.js 有 6 处调用 | ❌ 有调用方，但全部使用守卫模式，删除安全 |
| AI审计 | audit-log.js 可直接删除 | 依赖链较复杂：storage.js 表、utils.js 简化版、life.html topbar 按钮、timetracker.js 调用 | ⚠️ 需额外清理 4 处依赖 |
| AI审计 | predictive-engine 可合并到 smart-suggestion | dashboard.js 有未守卫的依赖（getPredictions/recordFeedback/executePrediction） | ⚠️ 不能直接删除，需先修补 dashboard.js |
| AI审计 | local-ai.js 可删除 | xiaolu.js 离线降级依赖，但守卫模式 | ✅ 可删除，但需确认用户无离线场景需求 |
| AI审计 | shared-knowledge.js 随妮可删除而删除 | xiaolu.js 有 7 处调用，不只有妮可在用 | ❌ 不能仅随妮可删除，需同步清理 xiaolu.js |
| AI审计 | 三跳 Prompt 是"死代码" | 仍作为 Function Calling 失败的降级兜底（3处调用） | ⚠️ 非完全死代码，是容错机制 |
| 模块分析 | lifetree "无实际功能" | 正确，但依赖链涉及 8 个文件 | ✅ 结论正确，但删除工作量被低估 |
| 模块分析 | 习惯链和习惯组合可合并 | 代码结构确实高度重叠，合并难度低 | ✅ 结论正确 |
| 模块分析 | 番茄钟与 timetracker 可合并 | 概念相似但数据模型不同，合并需统一存储 | ✅ 可行但需谨慎 |
| 模块分析 | 日记复盘与模板系统可合并 | templates 有跨模块数据收集引擎（~230行），与 journal 轻量复盘设计理念不同 | ⚠️ 不建议物理合并，仅做导航整合 |
| CSS优化 | dashboard.css 可删除 | ✅ 与 main.css 冲突确认 | ✅ 结论正确 |
| CSS优化 | 妮可/小鹿面板 ~450 行重复 | ✅ 15 对结构选择器完全重叠确认 | ✅ 结论正确 |
| CSS优化 | long-press-active 无 JS 引用 | ✅ 全局搜索零 JS 引用确认 | ✅ 结论正确 |
| CSS优化 | audit-log.css 可整体删除 | 部分正确：功能删除时可以删，但若保留功能则只能提取基类 | ⚠️ 条件性正确 |

---

*本报告基于 2026-08-02 的代码快照，所有结论均经 grep/find 实际扫描验证，未修改任何代码。*
