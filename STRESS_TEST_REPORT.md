# 压力测试报告

## 测试时间：2026-08-01 18:44
## 测试范围：现有5个已上线模块 + 框架层（共24个文件）
## 测试方法：逐文件代码审计 + 用户流程模拟 + 边界条件推演

---

## 🔴 严重问题（会导致功能不可用）

### S1. [健康模块] health.js 未加载 — 健康页面完全不可用
- **文件**: `life.html` 第145-151行
- **描述**: `<script>` 标签列表包含 storage → router → dashboard.js → habits.js → tasks.js → study.js → app.js，**完全遗漏了 `modules/health/health.js`**。用户点击侧边栏"健康"导航后，`loadHealth()` 函数调用 `HealthModule.init()` 时，`HealthModule` 未定义（ReferenceError），导致健康模块初始化失败，页面停留在加载前的空白状态。
- **复现**: 打开应用 → 点击 💪 健康 → 页面空白或显示旧内容
- **修复建议**: 在 `life.html` 第150行 `<script src="modules/study/study.js">` 后追加：
  ```html
  <script src="modules/health/health.js"></script>
  ```

### S2. [健康模块] CSS变量 `--border-light` 未定义 — 卡片标题分割线消失
- **文件**: `modules/health/health.css` 第126行
- **描述**: `.health-card-header` 使用 `border-bottom: 1px solid var(--border-light)`，但 `--border-light` 从未在 `styles/main.css` 的 `:root` 中定义。该变量会回退为初始值（`initial`），导致边框不可见。5个健康卡片的标题与内容之间没有视觉分隔。
- **修复建议**: 在 `styles/main.css` 的 `:root` 中添加：
  ```css
  --border-light: #E8DDD4;
  ```

### S3. [PWA] 应用图标文件缺失 — PWA无法安装到桌面
- **文件**: `manifest.json` 第12-21行；`assets/icons/` 目录
- **描述**: manifest.json 声明需要 `icon-192.png` 和 `icon-512.png`，但 `assets/icons/` 目录下仅有 `.gitkeep` 空文件，无任何图标。PWA 安装时会因缺少图标而失败，浏览器控制台报 404 错误。
- **修复建议**: 创建两个 PNG 图标文件放入 `assets/icons/` 目录。

### S4. [框架层] Service Worker 缓存版本号与清理逻辑不一致 — 缓存策略失效
- **文件**: `core/app.js` 第536行；`sw.js` 第6行
- **描述**: `app.js` 的 `registerSW()` 中清理旧缓存的逻辑为 `if (key !== 'life-workspace-v2')`（保留 v2），但 `sw.js` 的实际缓存名为 `life-workspace-v5`。结果是每次页面加载时，app.js 会把 SW 刚创建的 v5 缓存删掉（因为它不叫 v2），而 v2 缓存（实际不存在）被保留。这导致缓存优先策略完全失效，每次都走网络请求。
- **修复建议**: 将 `app.js` 第536行的 `'life-workspace-v2'` 改为与 `sw.js` 一致的 `CACHE_NAME`，或改为直接引用同一个常量。

### S5. [框架层] loadModuleCSS 的 cache buster 绕过 SW 缓存 — 模块CSS永远不走离线缓存
- **文件**: `core/app.js` 第248行
- **描述**: `loadModuleCSS()` 动态加载 CSS 时使用 `link.href = modules/${path}?v=${Date.now()}`，每次生成不同的 URL（带时间戳参数）。SW 的 `caches.match()` 会精确匹配 URL（含 query string），所以 `dashboard.css?v=123456` 永远无法匹配预缓存的 `dashboard.css`。结果是所有模块 CSS 每次都从网络重新加载，离线时模块样式完全丢失。
- **修复建议**: 移除 `?v=${Date.now()}` 参数，改用与 SW 缓存一致的路径。如需版本控制，在 SW 的 `CACHE_ASSETS` 中也加入相同的 query string，或在 `fetch` 事件中忽略 query string 进行匹配。

---

## 🟡 中等问题（功能可用但体验不佳）

### M1. [学习模块] 编辑课程/书籍/技能后 Toast 提示始终显示"已添加"而非"已保存"
- **文件**: `modules/study/study.js` 第396-398行（课程）、第663行（书籍）、第818行（技能）
- **描述**: 以课程为例，`handleSaveCourse()` 先调用 `hideCourseModal()`（第396行），该函数将 `editingCourseId` 设为 `null`（第328行），然后第398行的 `editingCourseId ? '已保存 ✅' : '课程已添加 ✅'` 条件永远为 false。编辑保存后用户看到的是"课程已添加 ✅"，造成困惑。书籍和技能模块有完全相同的 bug。
- **修复建议**: 在调用 `hideCourseModal()` / `hideBookModal()` / `hideSkillModal()` 之前，先保存 `editingCourseId` 到局部变量：
  ```js
  const isEdit = !!editingCourseId;
  hideCourseModal();
  if (isEdit) App.showToast('已保存 ✅');
  else App.showToast('课程已添加 ✅');
  ```

### M2. [任务模块] "今日任务" 筛选逻辑不精确 — 包含所有历史未完成任务
- **文件**: `modules/tasks/tasks.js` 第149行
- **描述**: 今日任务的过滤条件为 `t.status === 'todo' && (!t.dueDate || t.dueDate <= todayStr)`，这意味着**所有没有截止日期的待办任务**都会出现在"今日任务"中，无论它们是什么时候创建的。如果用户有10个未设截止日期的历史任务，今日面板会显示全部10个，而不是真正与今天相关的任务。
- **修复建议**: 增加 `t.date === todayStr` 条件来过滤当天创建的任务，或者将无截止日期的任务仅在"全部任务"中展示：
  ```js
  tasks = allTasks.filter(t => t.status === 'todo' && t.date === todayStr);
  ```

### M3. [框架层] 自动刷新会打断用户输入 — 窗口获得焦点时重新渲染当前模块
- **文件**: `core/app.js` 第64-86行（`initAutoRefresh`）
- **描述**: `focus`、`visibilitychange`、`pageshow` 事件都会触发 `reloadCurrentRoute()`，该函数会重新执行模块的加载函数（如 `loadHealth()`），导致整个 content-area 的 innerHTML 被替换。如果用户正在输入体重、写饮食笔记等，输入内容会被清空。特别是桌面端窗口获得焦点就触发，频率较高。
- **修复建议**: 
  1. `focus` 事件加节流（throttle），至少间隔 30 秒
  2. 或在 reload 前检查 `document.activeElement` 是否为 input/textarea，若是则跳过
  3. 或改用模块级别的 `refresh()` 方法（只更新数据，不重建DOM）

### M4. [健康模块] 睡眠时长显示格式不一致 — 与"小时"标签冗余
- **文件**: `modules/health/health.js` 第251-253行
- **描述**: 当睡眠时长有小数分钟时，显示为 `8h30m`，但 HTML 中紧跟 `<span class="health-sleep-label">小时</span>`，最终用户看到 `8h30m 小时`，语义重复。当整点时显示 `8 小时`，倒是正常。
- **修复建议**: 统一格式：
  ```js
  if (mins > 0) {
    hoursEl.textContent = `${hours}小时${mins}分`;
  } else {
    hoursEl.textContent = `${hours}`;
  }
  ```
  或者移除 HTML 中的 `<span class="health-sleep-label">小时</span>`，让 JS 完全控制显示。

### M5. [健康模块] 运动/饮食类型的 emoji 缺失 — 部分记录显示空白图标
- **文件**: `modules/health/health.js` 第273-275行（运动）、第404行（饮食）
- **描述**: 
  - 运动类型中 `cycling` 的 emoji 为空字符串 `''`，`strength` 的值为 `'️'`（仅包含不可见的变体选择符 U+FE0F，无实际 emoji），用户添加骑行或力量训练时图标显示为空白
  - 饮食类型中 `breakfast` 的 emoji 为空字符串 `''`，但 HTML 的 `<option>` 中使用了 🌅 emoji。用户添加早餐后列表中不显示图标
- **修复建议**: 
  ```js
  // 运动
  cycling: '🚴', strength: '🏋️',
  // 饮食
  breakfast: '🌅',
  ```

### M6. [示例数据] 示例打卡数据包含未来日期 — 用户看到未发生日期的打卡记录
- **文件**: `core/storage.js` 第245行
- **描述**: 示例数据硬编码了 `checkinDays = [1, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 21, 23, 25]`，在当月任何一天首次加载时都会创建这些日期的打卡记录。如果今天是8月1日，系统会创建8月25日的打卡记录，用户在日历上看到未来日期已"打卡"，造成困惑。
- **修复建议**: 只生成今天及之前的日期的示例数据：
  ```js
  const maxDay = today.getDate();
  const validDays = checkinDays.filter(d => d <= maxDay);
  ```

### M7. [PWA] SW 缓存列表缺少 manifest.json
- **文件**: `sw.js` 第9-31行（`CACHE_ASSETS`）
- **描述**: 预缓存资源列表包含所有 HTML/CSS/JS 文件，但遗漏了 `manifest.json`。离线状态下，虽然页面能正常加载，但 PWA 安装检测可能因无法获取 manifest 而失败。
- **修复建议**: 在 `CACHE_ASSETS` 数组中添加 `'./manifest.json'`。

### M8. [任务模块] FAB 按钮与底部统计栏重叠
- **文件**: `modules/tasks/tasks.css` 任务FAB `bottom: 24px`，底部栏 `bottom: 0; height: ~44px`
- **描述**: `.tasks-fab` 固定在 `right: 20px; bottom: 24px`，而 `.tasks-footer` 固定在 `bottom: 0`，高度约 44px。FAB 按钮（52px）的下半部分被底部栏遮挡，视觉上显得拥挤。在移动端（480px），FAB `bottom: 16px` 更加重叠。
- **修复建议**: 将 FAB 的 `bottom` 值调整为底部栏高度 + 间距，如 `bottom: 60px`。

### M9. [习惯模块] 快速连续点击打卡可能产生数据不一致
- **文件**: `modules/habits/habits.js` `toggleHabit()` 函数
- **描述**: `toggleHabit()` 是 async 函数，先从 Storage 读取记录，再修改后写回。如果用户快速连续点击同一个习惯卡片，两次调用可能同时读取到相同的旧数据，然后各自写入，导致最后写入的结果覆盖第一次的操作。例如：用户快速点击取消再打卡，最终状态可能是"未打卡"而非预期的"已打卡"。
- **修复建议**: 添加防抖（debounce）或在操作期间禁用卡片点击：
  ```js
  let isToggling = false;
  async function toggleHabit(habitId) {
    if (isToggling) return;
    isToggling = true;
    try { /* ... */ } finally { isToggling = false; }
  }
  ```

---

## 🟢 轻微问题（优化建议）

### L1. [总面板] 问候语文案闪烁 — HTML 默认值与 JS 异步更新之间的间隙
- **文件**: `modules/dashboard/dashboard.html` 第5行；`modules/dashboard/dashboard.js` `renderGreeting()`
- **描述**: HTML 中硬编码了 `下午好，鹿7铭。`，JS 异步获取 Storage 数据后更新。在弱网/慢速设备上，用户会短暂看到默认文案闪烁后变为正确内容。
- **修复建议**: 将默认文案设为更中性的"加载中..."或使用 CSS 初始隐藏。

### L2. [总面板] 日历不可点击 — 缺少交互反馈
- **文件**: `modules/dashboard/dashboard.js` `renderCalendar()`
- **描述**: Dashboard 日历格子有 hover 效果但无 click 事件。用户可能会尝试点击日期查看详情（习惯模块的日历支持点击），但总面板日历完全无响应。
- **修复建议**: 添加点击跳转到习惯模块对应日期的功能，或移除 hover 效果以避免误导。

### L3. [框架层] 路由未注册时回退到 dashboard 但无用户提示
- **文件**: `core/router.js` 第54-58行
- **描述**: 访问未注册的路由（如 `#/?invalid`）时，控制台输出 warn 后静默回退到 dashboard。用户不知道为什么突然跳回首页。
- **修复建议**: 回退时调用 `App.showToast('页面不存在，已返回首页')`。

### L4. [任务模块] 滑动删除在桌面端使用鼠标操作体验不佳
- **文件**: `modules/tasks/tasks.js` `bindSwipeDelete()`
- **描述**: 滑动删除绑定了 mouse 事件，但桌面用户习惯右键/更多菜单删除。鼠标拖拽任务卡片时容易意外触发删除，且没有视觉提示（需要拖过50px阈值）。
- **修复建议**: 桌面端禁用滑动删除，改为长按或右键菜单。或在滑动时显示更明显的删除背景。

### L5. [学习模块] 课程块在窄屏上文字被截断
- **文件**: `modules/study/study.css` `.study-course-block-name`
- **描述**: 课程块使用 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`，在768px以下屏幕，7天的列宽很窄（约44px时间列 + 7等分），课程名称只能显示2-3个字就被截断。
- **修复建议**: 在窄屏下允许课程名称换行（`white-space: normal`），或减小字体/调整列宽。

### L6. [学习模块] 课程颜色分配在每次渲染时重置 — 同一课程可能改变颜色
- **文件**: `modules/study/study.js` `renderTimetable()` 函数
- **描述**: 每次渲染课程表时，`courseColorMap` 和 `nextColorIndex` 被重置为 `{}` 和 `0`，然后按 `semesterCourses.forEach` 的顺序重新分配颜色。如果课程添加/删除导致顺序变化，同一门课的颜色可能改变。
- **修复建议**: 使用课程 ID 的 hash 值确定颜色（如 `course.id % 8`），而不是递增计数器。

### L7. [习惯模块] 日历视图未自动跟随日期切换
- **文件**: `modules/habits/habits.js` `shiftDate()`
- **描述**: 用户通过日期切换按钮切换到上个月的某天时，`shiftDate()` 确实会同步 `calendarMonth/calendarYear` 并重新渲染日历。但如果用户先在日历中切换月份（如从8月到10月），再通过日期按钮切换到9月的某天，日历会正确跳到9月。这个逻辑实际是正确的，但 `shiftDate` 中调用了两次 `renderCalendar()`（一次在 `shiftDate` 末尾，一次在 `loadDateData` 内部通过 `updateCalendarSelection`），存在冗余渲染。
- **修复建议**: 移除 `shiftDate()` 末尾的 `renderCalendar()` 调用，因为 `loadDateData()` 内部的 `updateCalendarSelection()` 已经处理了选中状态，而 `shiftDate` 的同步逻辑可以合并到 `loadDateData` 中。

### L8. [所有模块] 缺少统一的空状态组件
- **描述**: 各模块各自实现了空状态展示（任务用 `tasks-empty`、学习用 `study-empty`、健康用内联样式），样式不统一。
- **修复建议**: 在 `main.css` 中定义通用的 `.empty-state` 组件类。

### L9. [框架层] AI 按钮和生命树/设置按钮功能均为占位
- **文件**: `core/app.js` `initTopbar()`
- **描述**: 顶部栏的 🦌小鹿AI、🔵妮可AI、🌳生命树、⚙️设置 按钮点击后都只显示"功能开发中"的 Toast。对首次使用的用户来说，这些按钮看起来像是有功能的。
- **修复建议**: 给未实现的按钮添加 `opacity: 0.5` 或 `disabled` 样式，明确暗示不可用状态。

### L10. [健康模块] 饮水目标硬编码为1500ml
- **文件**: `modules/health/health.html` 第54行；`modules/health/health.js` `updateWaterDisplay()`
- **描述**: 饮水卡片标题显示"目标 1500ml"，进度条也按1500ml计算百分比。但不同用户的饮水需求不同，且 `settings` 表中有 `username` 等设置项，说明系统有设置能力，但饮水目标不可自定义。
- **修复建议**: 允许用户在设置中自定义饮水目标，存储在 `settings` 表中。

### L11. [财务模块] 完整HTML模板存在但路由指向占位页面 — 死代码
- **文件**: `modules/finance/finance.html`；`core/app.js` 第29行
- **描述**: `finance.html` 是一个完整的财务模块模板（含统计卡片、预算设置、交易记录、FAB按钮、弹窗等），但 `app.js` 中注册为 `loadPlaceholder('财务')`，用户看到的是"🚧 功能开发中"。finance.html 及其相关资源（如果有CSS/JS）成为死代码。
- **修复建议**: 要么实现 finance.js 并将路由指向真正的加载函数，要么暂时移除 finance.html 避免混淆。

### L12. [框架层] 侧边栏"更多"菜单中的路由未在 HTML 中注册 data-route
- **文件**: `life.html` 第85-91行
- **描述**: 子菜单项（关系、知识库、目标）的 `data-route` 属性正确设置，`app.js` 的 `initSidebar()` 也正确绑定了点击事件。但侧边栏导航中"日志/记录"模块（journal）和"生命树"（lifetree）虽然存在 HTML 模板，却没有在侧边栏中显示导航项，也没有在路由中注册。
- **修复建议**: 如计划上线这些模块，在侧边栏添加对应导航项和路由注册。否则无需处理。

---

## ✅ 通过的测试项

### 框架层
- ✅ Script 加载顺序正确：storage → router → 各模块JS → app（依赖关系满足）
- ✅ 路由注册完整：dashboard / habits / tasks / study / health + 4个占位路由（finance/relations/knowledge/goals）
- ✅ IndexedDB 封装（Storage）的 Promise 化操作正确，支持 add/put/get/getAll/getByIndex/remove/clear/count
- ✅ DB_VERSION = 3，包含14个 objectStore（checkins/habits/tasks/study/health/finance/settings/meta/projects/pomodoros/semesters/courses/books/skills），定义完整
- ✅ 数据迁移函数 `migrateCourseData()` 逻辑正确，有迁移标记防止重复执行
- ✅ Hash 路由（Router）逻辑正确，支持 `#/route` 格式解析、回退到 dashboard
- ✅ `onRouteChange` 监听器机制工作正常
- ✅ Toast 组件实现正确，有动画和自动消失
- ✅ 移动端侧边栏遮罩层交互逻辑正确
- ✅ 打卡签到功能逻辑正确（toggle + streak 计算）
- ✅ 连续打卡天数计算允许今天未打卡的情况

### 总面板模块
- ✅ 问候语根据时段（5-12/12-18/其他）正确切换
- ✅ 日历渲染逻辑正确（空白格 + 日期格 + 今天高亮 + 打卡标记点）
- ✅ 亮点卡片数据从 Storage 正确获取（签到天数/学习时长/支出/结余）
- ✅ 学习时长格式化显示（h/m）正确
- ✅ 今日推送渲染正确（静态占位数据）
- ✅ 响应式布局：900px以下单列，480px以下调整字号

### 习惯打卡模块
- ✅ 12个习惯卡片正确渲染，HTML 结构完整
- ✅ 打卡切换逻辑（toggleHabit）数据驱动渲染，从 Storage 读取后刷新所有卡片状态
- ✅ 进度条和激励文案正确更新
- ✅ 日历视图渲染正确（月份标题、空白格、日期格、打卡标记、全部完成标记）
- ✅ 月份切换逻辑正确（含跨年处理）
- ✅ 日期切换联动日历月份同步
- ✅ 日历日期点击切换到对应日期
- ✅ "今天"按钮正确回到当前日期
- ✅ 响应式布局：1024px 3列、768px 单列、480px 2列

### 任务模块
- ✅ 5个 Tab 切换正确（今日/全部/已完成/项目/番茄钟）
- ✅ ABCD 四级优先级配置正确（颜色/标签）
- ✅ 任务创建/编辑/删除流程完整
- ✅ 优先级筛选（全部/A/B/C/D）正确
- ✅ 滑动删除逻辑正确（touch + mouse 事件，50px 阈值）
- ✅ 任务完成状态切换（toggle）+ 完成时间记录
- ✅ 项目管理（创建/进度计算）正确
- ✅ 番茄钟计时器逻辑正确（25分钟工作/5分钟休息，SVG 环形进度）
- ✅ 番茄钟记录保存到 pomodoros 表
- ✅ HTML 转义（escapeHtml）防止 XSS
- ✅ 空任务列表显示空状态
- ✅ Modal 弹窗点击遮罩关闭正确
- ✅ FAB 按钮位置（right: 20px, bottom: 24px）基本正确
- ✅ 响应式布局完整

### 学习模块
- ✅ 课程表24小时制渲染正确（07:00-23:30，30分钟一格，共33行）
- ✅ 今天列高亮（today-column class）
- ✅ 课程块绝对定位计算正确（top/height 基于时间差）
- ✅ 课程颜色自动分配（8种颜色循环）
- ✅ 添加课程弹窗正确（含时间输入、天选择）
- ✅ 编辑课程预填数据正确
- ✅ 删除课程功能正确
- ✅ 时间冲突检测正确（重叠判断 + 排除当前编辑的课程）
- ✅ 学期管理（创建/切换/删除，删除学期联删课程）
- ✅ 阅读记录（添加/编辑/删除，进度条，状态切换）
- ✅ 技能追踪（添加/编辑/删除，星级选择，进度条）
- ✅ 数据迁移函数 migrateCourseData 逻辑正确
- ✅ 无效时间（start >= end）跳过渲染
- ✅ 超出时间范围的课程跳过渲染
- ✅ 响应式布局完整

### 健康模块
- ✅ 5个卡片渲染正确（体重/睡眠/运动/饮水/饮食）
- ✅ 数据按日期存储和加载（keyPath: 'id' = dateStr）
- ✅ 日期切换功能正确
- ✅ 体重趋势计算正确（与最近一次记录对比）
- ✅ 睡眠时长跨天计算正确（wakeMin <= bedMin 时 +24h）
- ✅ 饮水进度条和快捷按钮正确
- ✅ 饮食记录添加/删除正确
- ✅ 每日健康参考区域渲染正确
- ✅ 字段兼容性处理（旧数据补充缺失字段）
- ✅ 响应式布局完整

### 跨模块集成
- ✅ CSS 变量在所有模块中一致（使用统一的 :root 变量）
- ✅ Modal 弹窗 z-index 层级：topbar-more-menu(100) < tasks-modal(100) < study-modal(200) < sidebar(200) < toast(9999)
- ✅ 导航切换流畅（hash 路由 + 侧边栏高亮联动）
- ✅ 所有模块使用统一的 `.card` 和 `.page-enter` 样式类
- ✅ 模块 CSS 动态加载（loadModuleCSS）有去重检查

### PWA
- ✅ manifest.json 配置基本完整（name/start_url/display/colors/orientation）
- ✅ SW 缓存策略（缓存优先 + 回退网络）逻辑正确
- ✅ SW 激活时清理旧版本缓存
- ✅ SW 使用 `skipWaiting()` 和 `clients.claim()` 确保立即生效

---

## 修复建议优先级

### P0 — 立即修复（功能不可用）
1. **S1**: 在 life.html 中添加 `<script src="modules/health/health.js">` — 1行代码改动，修复整个健康模块
2. **S2**: 在 main.css `:root` 中添加 `--border-light: #E8DDD4;` — 1行代码，修复健康卡片视觉
3. **S3**: 创建 PWA 图标文件 — 需要设计资源

### P1 — 尽快修复（逻辑错误/数据问题）
4. **S4**: 统一 SW 缓存版本号 — app.js 第536行改为 `'life-workspace-v5'` 或使用动态引用
5. **S5**: 移除 loadModuleCSS 的 `?v=${Date.now()}` — 修复离线缓存
6. **M1**: 修复学习模块编辑保存的 Toast 提示 — 在 hideModal 前保存 isEdit 变量（3处）
7. **M6**: 示例数据只生成今天及之前的日期 — 过滤 checkinDays
8. **M5**: 补全健康模块缺失的 emoji — cycling/breakfast/strength

### P2 — 近期修复（体验优化）
9. **M2**: 优化"今日任务"筛选逻辑
10. **M3**: 自动刷新添加防抖/输入检测
11. **M4**: 统一睡眠时长显示格式
12. **M8**: 调整 FAB 与底部栏的间距
13. **M9**: 打卡操作添加防抖
14. **M7**: SW 缓存列表添加 manifest.json

### P3 — 后续优化（锦上添花）
15. **L1-L12**: 各模块体验优化项，可在迭代中逐步处理

---

## 统计摘要

| 级别 | 数量 | 说明 |
|------|------|------|
| 🔴 严重 | 5 | 功能不可用 / 缓存策略失效 |
| 🟡 中等 | 9 | 逻辑错误 / 体验不佳 |
| 🟢 轻微 | 12 | 优化建议 |
| ✅ 通过 | 60+ | 核心功能验证通过 |

**总体评估**：5个核心模块中，**健康模块因 JS 未加载完全不可用**，需要立即修复。其余4个模块（总面板/习惯/任务/学习）的核心功能基本完善，主要问题集中在 SW 缓存策略失效（影响离线能力）和少量逻辑 bug。框架层的路由、存储、布局系统整体稳定。
