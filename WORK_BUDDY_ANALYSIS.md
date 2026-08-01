# Work Buddy 代码精华分析

> 基于 `life.html`（15015行）和 `index.html`（11511行）单文件版本的深度代码分析
> 项目名：「鹿7铭 · 人生工作台」—— 学习、健康、资产、关系、课程、项目、思考、复盘一站式记录

---

## 🌟 核心亮点（强烈推荐借鉴）

### 1. 自然语言快速录入引擎（parseQuickCapture）

**具体实现：**
- 一个全局输入框，回车即录入，用正则匹配自动识别 17 种场景
- 支持的场景：支出（`午餐 ¥25`）、体重（`体重 65.5`）、练声（`练声 30`）、钢琴、英语单词、喝水、联系人（`联系张老师`）、收入、时光胶囊、思考流、读书、运动、睡眠、冥想、项目进度、情绪记录
- 未匹配的内容自动归入备忘录，并通过 `autoClassifyMemo()` 自动分类
- 录入后弹出 toast 显示 `[模块] 详情`

```javascript
// 示例：支出识别
const moneyMatch=text.match(/^(.+?)[\s]*[¥￥]?\s*(\d+(?:\.\d+)?)\s*元?$/);
if(moneyMatch&&(text.match(/买|花|餐|咖啡|打车|地铁|外卖|超市|购物|票|费|充值|订阅/) || text.match(/[¥￥]/))){
    const cat=guessExpenseCategory(moneyMatch[1]);
    r.finance.out.push({cat:cat,catId:autoCategorize(cat),amount:moneyMatch[2],date:currentDate});
    return {mod:"支出",detail:cat+" ¥"+moneyMatch[2],raw:text};
}
```

**为什么值得借鉴：**
- 极大降低了使用门槛，不需要选模块再填写
- 跨模块联动：输入「练声 30」同时勾选习惯打卡
- 一句话覆盖所有模块的录入需求

**如何融入我们的架构：**
- 在顶部全局搜索栏加入自然语言解析层
- 用 LLM 或正则引擎做意图分类
- 解析结果先给用户确认（toast 预览），再写入对应数据表

---

### 2. 每日提醒引擎（dailyAlerts）

**具体实现：**
- 每次首页渲染时自动扫描所有模块，生成待处理项列表
- 8 类提醒源：
  1. **项目截止**（≤7天/已过期）
  2. **冷联系**（超30天未联系）
  3. **周复盘**（周六日且本周未写）
  4. **今日待办**（未完成任务>5项）
  5. **今日习惯**（未完成习惯项）
  6. **时光胶囊**（即将/当日开启）
  7. **年度目标**（未设定+周一提醒）
  8. **备份提醒**（超7天未备份）

```javascript
function dailyAlerts(){
  const alerts=[];
  const today=currentDate;
  // 项目截止提醒
  state.projects.forEach(p=>{
    if(!p.deadline)return;
    const d=diffDays(today,p.deadline);
    if(d<0)alerts.push({icon:"🔴",text:`「${p.name}」已过期 ${-d} 天`,action:"project"});
    else if(d<=7)alerts.push({icon:"🟠",text:`「${p.name}」${d===0?"今天截止":"还剩 "+d+" 天"}`,action:"project"});
  });
  // ... 更多扫描
  return alerts;
}
```

**为什么值得借鉴：**
- 变"被动记录"为"主动推送"，是提升用户粘性的关键
- 提醒项可一键跳转到对应模块处理

**如何融入我们的架构：**
- 设计统一的 Reminder 接口，各模块注册自己的提醒检查函数
- 首页渲染时汇总所有提醒，渲染为可折叠的摘要卡片

---

### 3. 联系人 ABCD 分类 + 关系健康度评分

**具体实现：**
- 联系人分四层：A层·资源型、B层·认知型、C层·消耗型、D层·深层情感
- 每类有颜色标识（绿/金/红/蓝）
- 关系健康度评分算法（0-100）：

```javascript
function contactHealthScore(c){
  const interactions=c.interactions||[];
  const today=fmtDate(new Date());
  if(!interactions.length){
    const days=c.time?diffDays(c.time,today):9999;
    if(days>180)return 10;
    if(days>90)return 30;
    if(days>60)return 50;
    if(days>30)return 70;
    return 85;
  }
  const sorted=interactions.map(i=>({...i,days:diffDays(i.date,today)})).sort((a,b)=>a.days-b.days);
  const lastDays=sorted[0].days;
  const count30d=sorted.filter(i=>i.days<=30).length;
  const avgFeeling=interactions.reduce((s,i)=>s+(i.feeling||3),0)/interactions.length;
  let score=50;
  if(lastDays<=7)score+=20;
  else if(lastDays<=30)score+=10;
  else if(lastDays<=60)score+=0;
  else if(lastDays<=90)score-=15;
  else score-=30;
  score+=Math.min(20,count30d*5);
  score+=(avgFeeling-3)*5;
  return Math.max(0,Math.min(100,Math.round(score)));
}
```

- 建议跟进频率：A类30天，B类60天，C类90天，D类14天
- 冷联系检测：`coldContacts(threshold)` 返回超期未联系的人

**为什么值得借鉴：**
- ABCD分类法是有深度的人际关系管理思路（非简单的标签）
- 健康度评分让"该联系谁"变得可操作
- 每次互动记录包含 method（微信/电话/见面）、summary、feeling

**如何融入我们的架构：**
- 联系人模型增加 ABCD 层级字段
- 每次互动记录互动详情（日期、方式、感受）
- 首页/关系页展示冷联系预警

---

### 4. 多主题系统 + 玻璃拟态设计语言

**具体实现：**
- **6种主题配色**：经典暖灰、森林绿、海洋蓝、暖橘日落、薰衣草 + 深色模式
- 通过 CSS 变量 `data-theme` + `data-palette` 双重属性控制
- 完整的玻璃拟态（Glassmorphism）设计系统：
  ```css
  --glass-bg:rgba(255,255,255,0.55);
  --glass-bg-soft:rgba(255,255,255,0.35);
  --glass-border:rgba(255,255,255,0.6);
  --glass-blur:20px;
  --glass-shadow:0 8px 32px rgba(60,45,30,.12);
  --glass-inset:inset 0 1px 0 rgba(255,255,255,.5);
  ```
- **防刷新白边**：在 `<head>` 中用内联 `<script>` 提前设置背景色，避免 CSS 加载前的闪白
- **自定义背景图系统**：支持上传多张背景、模糊/暗度滑块调节、存入 IndexedDB 避免 localStorage 5MB 限制
- **主题切换不刷新**：JS 动态切换 `data-theme` + `data-palette` 属性

```javascript
// 防刷新白边脚本（放在 <head> 最前）
try{
  var s=JSON.parse(localStorage.getItem("life_settings_v1")||"{}");
  var theme=s.theme||"light";
  var pal=s.palette||"default";
  var bgMap={"default":dark?"#1A1825":"#E8C8A8","forest":...};
  document.documentElement.style.background=bg;
  document.documentElement.setAttribute("data-theme",theme);
}catch(e){}
```

**为什么值得借鉴：**
- 5种主题色 + 明暗模式 = 10种视觉方案，用户黏性极高
- 玻璃拟态 + 渐变背景 = 高级质感
- 防白边脚本是很实用的工程细节

**如何融入我们的架构：**
- 建立完整的 CSS 变量体系（glass-* 参数）
- 主题配置持久化到用户设置
- 背景图存 IndexedDB 而非 localStorage

---

### 5. 生命之树（SVG 动态生成）

**具体实现：**
- 使用 **纯 SVG** 生成树的不同形态（非 Canvas、非图片）
- 7个等级：种子→嫩芽→小苗→小树→大树→开花树→繁茂古树
- 每级对应不同 SVG 绘制代码，从简单到复杂
- 4种养分：水（打卡）、阳光（运动）、肥料（学习+思考）、总养分
- **7条独立分支**（Branch）系统，每个分支有独立经验等级：
  - 根系·打卡、学习枝、健康枝、思考花、书叶、果实·项目、荣耀枝
  - 分支等级公式：`Math.min(10, 1+Math.floor(Math.sqrt(exp/20)))`
- **根据时间变化**：天空颜色随小时变化（凌晨/早晨/上午/下午/傍晚/夜晚6种配色）
- 夜晚有星星闪烁动画、月亮；白天有云朵、太阳
- 果实/花朵/粒子动画（CSS keyframes）

```javascript
const TREE_LEVELS=[
  {lv:1,name:"种子",icon:"🌰",min:0,max:500},
  {lv:2,name:"嫩芽",icon:"🌱",min:500,max:2000},
  {lv:3,name:"小苗",icon:"🌿",min:2000,max:5000},
  {lv:4,name:"小树",icon:"🌳",min:5000,max:10000},
  {lv:5,name:"大树",icon:"🌲",min:10000,max:20000},
  {lv:6,name:"开花树",icon:"🌸",min:20000,max:50000},
  {lv:7,name:"繁茂古树",icon:"🌟",min:50000,max:999999}
];
```

**为什么值得借鉴：**
- 把各模块数据汇总为一个可视化的"成长隐喻"
- SVG 随等级进化 = 强烈的成就感
- 分支系统让每个维度都有独立的成长线

**如何融入我们的架构：**
- 作为首页的成就可视化模块
- 各维度数据通过统一接口注入养分计算

---

### 6. 智能建议引擎（smartSuggestions）

**具体实现：**
- 纯离线模板化建议，不依赖 AI API
- 6 类建议源：
  1. **学习趋势对比**：本周 vs 上周的学习时长变化
  2. **联系人冷落**：≥3人超30天未联系时建议
  3. **情绪走势**：近3天情绪偏低时建议散步
  4. **打卡连续中断**：提醒重新开始
  5. **备份提醒**：>7天未备份
  6. **读书停滞**：开始>30天但进度<50%的书

```javascript
function smartSuggestions(){
  const sugs=[];
  // 学习趋势：对比本周和上周
  const thisWeek=weekStats(today);
  const lastWeek=weekStats(lastWeekStart);
  if(lastWeek.studyMin>0&&thisWeek.studyMin<lastWeek.studyMin*0.7){
    sugs.push({icon:"📉",text:`本周学习时间较上周下降了 ${drop}%`});
  }
  // ... 更多规则
  return sugs;
}
```

**为什么值得借鉴：**
- 让数据"说话"，不是堆砌数字而是给可操作的建议
- 完全离线可用，零 API 成本

---

## 👍 有价值的功能（推荐借鉴）

### 7. 成就系统（ACHIEVEMENTS）

**具体实现：**
- 15个成就徽章，每个有 check 函数实时判定
- 类型：早起鸟（连续7天6点前打卡）、书虫（读完10本）、理财达人（30天记账）、番茄大师（100个番茄）、人脉王（50个联系人）、冥想者（10小时冥想）、完美一周、千词斩、播种者/古树人、思考者、坚持30天/100天、学者（100小时专注）
- 解锁时弹 toast 通知 + 持久化到 state

**借鉴建议：** 加入我们的方案，作为用户激励层。每个模块定义 2-3 个成就。

---

### 8. 今日三件事（Focus Three）

**具体实现：**
- 金色渐变卡片，限制最多 3 件
- 自动从未完成任务推荐
- 关联番茄钟专注时间：每件事显示累计专注分钟数

```javascript
function getFocusThree(){
  const r=getDay(currentDate);
  let focus=r.focus3||[];
  if(!focus.length){
    const undone=r.tasks.filter(t=>!t.done).slice(0,3).map(t=>t.text);
    focus=undone;
  }
  return focus;
}
```

**借鉴建议：** 首页必备功能，聚焦每日核心目标。

---

### 9. 模板系统（TEMPLATES）

**具体实现：**
- 预定义模板：晨间流程、声乐练习、学习全套、晚间流程
- 一键导入：点击模板 pill，自动填充打卡项+任务+学习记录
- 模板的 `apply` 函数直接操作 state

**借鉴建议：** 支持用户自定义常用操作组合，降低重复录入成本。

---

### 10. 休息模式（魁北克冬夜）

**具体实现：**
- 全屏沉浸式休息场景：
  - CSS 渐变背景（深蓝夜空 + 暖光辐射）
  - Canvas 雪花粒子
  - Bokeh 光斑呼吸动画（7个错开延迟）
  - CSS 绘制的小木屋（三角屋顶+雪+窗户暖光+门）
  - 可选圣诞灯串效果
  - 白噪音：壁炉声、远处风声
- 时钟显示 + 每日金句
- 整个世界"沉下去"：内容区模糊 + 降低亮度 + 侧栏半透明
- 自定义变量覆盖：`--warm:#D9A55B; --ink:#F2EBE0;`

```css
body.rest-mode #scroll{filter:blur(.7px) brightness(.82);opacity:.9;transition:filter .7s ease,opacity .7s ease;}
body.rest-mode .sidebar,body.rest-mode .topbar{opacity:.5;transition:opacity .7s ease;}
```

**借鉴建议：** 作为专注/冥想场景的增值功能，提升产品温度和情感连接。

---

### 11. 冥想/呼吸计时器

**具体实现：**
- 呼吸引导圆圈动画（3个状态：inhale/hold/exhale）
- 圆圈缩放 + 渐变颜色变化（绿→金→红）
- 预设时长选择
- 与番茄钟/白噪音联动

```css
.breath-circle.inhale{transform:scale(1.35);background:radial-gradient(circle,rgba(127,176,105,0.4),rgba(232,184,99,0.2));}
.breath-circle.hold{transform:scale(1.35);background:radial-gradient(circle,rgba(232,184,99,0.35),rgba(200,167,128,0.15));}
.breath-circle.exhale{transform:scale(0.85);background:radial-gradient(circle,rgba(212,106,106,0.25),rgba(127,176,105,0.1));}
```

**借鉴建议：** 健康模块的核心交互之一。

---

### 12. 白噪音系统（Web Audio API）

**具体实现：**
- 使用 Web Audio API 实时生成噪声（非音频文件）
- 支持白噪声、粉红噪声、棕色噪声（数学算法生成 buffer）
- 雨声 = 白噪声 + bandpass 滤波器
- 音量渐变淡入淡出
- 可与番茄钟联动（自动开始/停止）
- 支持预设收藏

```javascript
function makeNoiseBuffer(type){
  const sr=audioCtx.sampleRate,buf=audioCtx.createBuffer(1,sr*2,sr);
  const d=buf.getChannelData(0);
  if(type==="pink"){
    // Paul Kellet's pink noise algorithm
    b0=0.99886*b0+w*0.0555179;b1=0.99332*b1+w*0.0750759;...
  }
  return buf;
}
```

**借鉴建议：** 声音层作为专注场景的增值功能。

---

### 13. 全局搜索 + 命令搜索

**具体实现：**
- 跨全模块搜索：任务、复盘、精进、八问、联系人、书架、思考、胶囊、摘抄、项目、笔记、备忘、周计划
- **命令搜索**：输入特定命令可直接执行操作
  - `去健康` → 跳转到健康模块
  - `记账 午餐25` → 直接记账
- 搜索结果高亮 + 点击跳转到对应位置
- `snippet()` 函数实现搜索结果摘要 + 关键词高亮

**借鉴建议：** 全局搜索是必备功能，命令搜索是加分项。

---

### 14. 数据持久化三层架构

**具体实现：**
1. **localStorage** 为主存储（同步快，~5MB）
2. **IndexedDB** 为安全网（容量大，异步备份）
3. **GitHub API** 为云端同步（私有仓库，base64 编码 JSON）

- 保存策略：防抖 200ms 合并写入
- 容量优化：背景图 base64 存入 IDB，localStorage 只存元信息
- 自动备份：超 7 天自动导出 JSON 下载
- 恢复机制：localStorage 丢失时从 IDB 恢复
- 类型安全：load 时强制类型校正（防止外部篡改 localStorage）
- 数据迁移引擎：`DATA_VERSION` + `MIGRATIONS[]` 注册表

```javascript
function load(){
  let p=null;
  try{const r=localStorage.getItem(STORE_KEY);if(r)p=JSON.parse(r);}catch(e){}
  state=Object.assign(stateDefaults(),p||{});
  // 类型安全修正
  state.entries=(state.entries&&typeof state.entries==="object"&&!Array.isArray(state.entries))?state.entries:{};
  state.goals=Array.isArray(state.goals)?state.goals:[];
  // ... 每个字段都做类型校正
}
```

**借鉴建议：** 三层持久化 + 类型安全 + 数据迁移是生产级应用必备。

---

### 15. GitHub 云同步

**具体实现：**
- 通过 GitHub Contents API 读写私有仓库中的 JSON 文件
- 自动同步：保存后 30s 防抖推送
- 冲突处理：检测本地/云端时间戳，弹出三选一（用云端/保留本地/暂不处理）
- pagehide 事件兜底：iOS 后台挂起定时器时兜底推送

```javascript
async function doCloudPush(opts){
  const content=btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  const r=await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`,{
    method:"PUT",
    headers:{Authorization:"Bearer "+token},
    body:JSON.stringify({message:"auto backup",content:content,sha:sha||undefined})
  });
}
```

**借鉴建议：** 如果做云同步，GitHub Gist API 是零成本方案。

---

### 16. 周计划视图

**具体实现：**
- 7 天网格布局（移动端降为 2 列）
- 每天显示关联任务，任务有颜色边框
- 已完成任务显示删除线
- 今日列高亮（暖色背景）
- 支持从月度目标导入周目标

**借鉴建议：** 周维度的任务视图是日/月之间的桥梁。

---

### 17. 年度回顾

**具体实现：**
- 汇总全年数据：打卡天数、学习时长、记账总额、读书数、联系人、思考条数、番茄数
- 里程碑时间线：按月展示关键事件
- 高亮卡片：最佳习惯、最高支出月份等
- 可导出为长图

**借鉴建议：** 年末复盘是强传播性产品特性。

---

### 18. 密码保险柜（九宫格解锁）

**具体实现：**
- 九宫格手势密码解锁
- 解锁后显示密钥列表（名称/值/复制/删除）
- 数据加密存储到 localStorage + IDB 备份
- Canvas 绘制连线轨迹

**借鉴建议：** 敏感信息（Token、密码）的安全存储，增加产品专业感。

---

## ⚠️ 可选功能（视情况决定）

### 19. 番茄花园（Tomato Garden）
- 番茄钟完成后的可视化花园：SVG 绘制植物
- 每个番茄种一棵植物，颜色/形态随机
- 植物有轻微摇曳动画
- **判断：** 有趣但开发成本较高，可作为增值功能

### 20. 间隔复习（Spaced Repetition）
- 闪卡式复习系统，支持从备忘/摘抄/笔记生成复习卡
- 评分（good/bad）决定下次复习时间
- **判断：** 适合学习类产品，通用生活工具可能过重

### 21. 闹钟系统
- 应用内闹钟（非系统通知）
- 响铃页面：全屏闪烁 + 铃铛动画 + 贪睡/关闭
- 闹钟日志（记录 missed/hit）
- **判断：** 实用但复杂，优先级不高

### 22. 课程表
- 周视图时间网格课程表
- 支持临时调课覆盖
- 课程与项目关联
- **判断：** 学生场景专用，通用用户不需要

### 23. 模块图谱（Graph View）
- 用 SVG 绘制模块间的关系网络
- 节点可点击查看模块数据
- **判断：** 视觉效果酷，但实用性一般

### 24. 时光胶囊
- 写入内容 + 设定解锁日期
- 到期前 3 天提醒，到期日可开启
- **判断：** 有趣味性和情感价值，但使用频率低

### 25. 每日推送卡片（dailyPushCard）
- 首页可折叠的每日推送：新闻/天气/金句/今日问题
- 点击展开显示详情 + 快捷操作按钮
- **判断：** 信息密度高，但需要内容源

### 26. 备忘录自动分类
- `autoClassifyMemo(text)` 自动将录入内容归类（工作/生活/想法/待办等）
- 自动提取链接关联
- **判断：** 值得借鉴的自动化思路

### 27. 单词本 + 随机抽查
- 单词列表 + 熟悉度标记（familiar/mastered）
- 随机抽查测试
- 批量导入
- **判断：** 英语学习专用功能，通用性不强

### 28. 购物清单
- 多列表管理
- 复选框 + 数量标注
- Tab 切换列表
- **判断：** 实用但非核心

### 29. 摘抄/观后感
- 支持分类（电影/书/段落/其他）
- 每个分类有独立颜色标识
- 引用格式 + 个人感想
- **判断：** 文化类用户喜欢，可作为笔记模块的子功能

---

## ❌ 不建议借鉴

### 30. 单文件架构
- 15000+ 行 HTML 单文件，所有 CSS/JS 混在一起
- 无模块化、无构建工具
- **原因：** 不可维护，不适合团队协作和长期迭代

### 31. 纯 localStorage 主存储
- 5MB 限制，容易溢出
- 无查询能力，全量 JSON.parse
- **原因：** 我们使用 IndexedDB（Dexie.js）是更好的选择

### 32. 内联 HTML 模板拼接
- `viewHome()` 等函数返回巨大 HTML 字符串，用模板字符串拼接
- 无组件化、无虚拟 DOM
- **原因：** 我们使用 React + TypeScript 是更好的方案

### 33. 硬编码的个人数据
- CHECK_TPL 中硬编码了"声乐练习"、"钢琴练习"等个人习惯
- EXPENSE_CATEGORIES 虽然通用，但分类是固定的
- **原因：** 应该让用户自定义习惯项

### 34. 无状态管理
- 全局 `state` + `settings` 对象直接读写
- 无 reducer/action/middleware 模式
- **原因：** 我们用 Zustand/Jotai 是更清晰的状态管理

### 35. 无 TypeScript
- 全部 JavaScript，无类型约束
- 导致 load 函数中大量类型安全检查代码
- **原因：** TypeScript 从源头解决类型问题

---

## 关键技术实现摘要

### 🔧 提醒引擎

```
输入：state（全量数据） + currentDate
处理：
  1. 遍历 projects → 检查 deadline
  2. coldContacts(30) → 扫描联系人 interactions
  3. 检查本周 reviews 是否已写
  4. 统计今日未完成任务/习惯
  5. 扫描 capsules 的 unlockDate
  6. 检查 goals 设定情况
  7. 检查备份时间
输出：alerts[] = {icon, text, action?}
渲染：首页摘要卡片 + 浏览器推送通知
```

### 🔧 关系健康度算法

```
score = 50 (基准分)
+ 最近互动时间加成：
  - ≤7天: +20
  - ≤30天: +10
  - ≤60天: +0
  - ≤90天: -15
  - >90天: -30
+ 30天内互动频次: min(20, count × 5)
+ 平均感受: (avgFeeling - 3) × 5
clamp(0, 100)
```

### 🔧 生命之树养分计算

```
水 = 打卡项×10 + 喝水打卡×5
阳光 = 运动分钟 + 冥想分钟 + 充足睡眠奖励20
肥料 = 专注分钟×2 + 声乐时间 + 英语词数 + 思考条数×20
  + 连续7天打卡奖励50 + 连续30天额外奖励100
总分 = 水 + 阳光 + 肥料
等级 = TREE_LEVELS.find(level => total >= min)
```

### 🔧 数据迁移引擎

```javascript
const DATA_VERSION = 2;
const MIGRATIONS = [
  {from:0, to:1, desc:"初始化基础字段", run:function(s){...}},
  {from:1, to:2, desc:"记账分类+联系人生日+快照", run:function(s){...}}
];
// 逐版本升级，失败中断
function runMigrations(){
  for(let v=currentVer; v<DATA_VERSION; v++){
    const migration = MIGRATIONS.find(m=>m.from===v);
    migration.run(state);
  }
}
```

### 🔧 主题系统设计

```
层级结构：
  :root (亮色默认)
    body[data-theme="dark"] (暗色覆盖)
      body[data-theme="dark"][data-palette="forest"] (配色覆盖)
      body[data-theme="dark"][data-palette="ocean"]
      body[data-theme="dark"][data-palette="sunset"]
      body[data-theme="dark"][data-palette="lavender"]

变量体系（每个主题覆盖）：
  --bg, --bg-2, --card, --card-soft, --card-2 (背景层)
  --ink, --ink-2, --muted, --faint (文字层)
  --line, --line-2 (边框层)
  --accent, --accent-ink (强调色)
  --warm, --warm-soft (暖色)
  --warn, --good (语义色)
  --shadow-sm/md (阴影)
  --glass-bg/bg-soft/border/blur/shadow/inset (玻璃质感)
  --body-gradient (全局渐变)
```

### 🔧 渲染分片（性能优化）

```javascript
// #142 首页渲染分片：先铺骨架，再逐帧填充
if(activeNav==="home" && typeof shardRenderHome==="function"){
  shardRenderHome(sc, html, ()=>{lazyLoadHomeCards();});
}
// #141 思考流虚拟滚动
if(activeNav==="reflect") requestAnimationFrame(()=>mountReflectVirtual());
// #143 contain:layout style 渲染隔离
.card{contain:layout style;}
```

### 🔧 背景图存储优化

```
问题：背景图 base64 太大，撑爆 localStorage 5MB
方案：
  1. localStorage 只存 {name} 元信息
  2. base64 data 存入 IndexedDB
  3. 内存中保持完整数据（含 data）
  4. 加载时从 IDB 恢复 data 到内存
  5. 保存时先剥离 data → 存 localStorage → 还原内存 → 异步存 IDB
```

### 🔧 语音录入

```javascript
// Web Speech API
const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
voiceRec = new SR();
voiceRec.lang = "zh-CN";
voiceRec.onresult = (e) => {
  const txt = e.results[0][0].transcript;
  // 填入输入框
};
```

---

## 📊 功能模块清单

| 模块 | 功能 | 复杂度 | 借鉴优先级 |
|------|------|--------|-----------|
| 工作台（Home） | 问候、日历、摘要、三件事、快速录入、习惯打卡 | 高 | ⭐⭐⭐ |
| 快速录入引擎 | 17种自然语言识别 + 跨模块联动 | 高 | ⭐⭐⭐ |
| 习惯打卡 | 分类打卡项 + 连续天数 + 热力图 | 中 | ⭐⭐⭐ |
| 任务管理 | 每日任务 + 今日三件事 | 中 | ⭐⭐⭐ |
| 提醒引擎 | 8类自动提醒 | 中 | ⭐⭐⭐ |
| 联系人 ABCD | 四层分类 + 健康度 + 冷联系 | 高 | ⭐⭐⭐ |
| 主题系统 | 5配色×明暗 + 玻璃拟态 + 背景图 | 高 | ⭐⭐⭐ |
| 生命之树 | SVG 动态生成 + 7分支 + 等级系统 | 高 | ⭐⭐ |
| 成就系统 | 15个成就徽章 | 低 | ⭐⭐ |
| AI 小结 | 离线模板生成日报 + 智能建议 | 中 | ⭐⭐ |
| 番茄钟 | 计时 + 任务关联 + 沉浸模式 + 迷你计时器 | 中 | ⭐⭐ |
| 冥想呼吸 | 呼吸引导动画 + 计时 | 低 | ⭐⭐ |
| 白噪音 | Web Audio API 实时生成 | 中 | ⭐⭐ |
| 休息模式 | 全屏沉浸场景 + 雪花 + 小木屋 | 高 | ⭐ |
| 搜索 | 全模块搜索 + 命令搜索 | 中 | ⭐⭐ |
| 数据持久化 | 三层存储 + 迁移引擎 + 云同步 | 高 | ⭐⭐⭐ |
| 记账 | 分类 + 预算 + 月度统计 | 中 | ⭐⭐ |
| 书架 | 读书进度 + 状态管理 | 低 | ⭐ |
| 周计划 | 7天网格 + 目标导入 | 中 | ⭐⭐ |
| 年度回顾 | 全年数据汇总 + 时间线 | 中 | ⭐⭐ |
| 密码保险柜 | 九宫格解锁 + 加密存储 | 中 | ⭐ |
| 番茄花园 | SVG 植物可视化 | 高 | ⭐ |
| 间隔复习 | 闪卡 + 评分调度 | 中 | ⭐ |
| 课程表 | 时间网格 + 覆盖 | 高 | ⭐ |
| 时光胶囊 | 定时开启 | 低 | ⭐ |

---

## 🎯 对我们的关键启示

1. **"输入即服务"理念**：一个输入框解决所有录入需求，是最高优先级的借鉴点
2. **主动提醒 > 被动记录**：提醒引擎是用户每天打开产品的核心理由
3. **关系管理要有深度**：ABCD分类 + 健康度评分，比简单标签有价值得多
4. **游戏化要克制**：生命之树 + 成就是好的，但不要喧宾夺主
5. **数据可视化要"活"**：树随时间变色、花园有摇曳动画，比静态图表有温度
6. **存储要稳健**：三层存储 + 类型安全 + 迁移引擎，生产级必备
7. **主题不是锦上添花**：是用户表达个性、建立情感连接的核心手段
8. **单文件要拆**：功能虽好，但工程实现必须模块化
