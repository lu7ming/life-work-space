# 人生工作台 · 工作台升级方案

> 版本：v1.0 | 日期：2026-08-02 | 状态：待实施

---

## 一、新功能建议（基于现有架构）

### 1.1 时间追踪器（优先级：高 | 难度：中 | 预期效果：时间利用率可视化）

**背景**：当前只有番茄钟记录专注时长，无法追踪时间都花在了哪里。

**功能设计**：
- 自动关联任务/项目的时间消耗
- 每日/每周时间分布饼图（工作/学习/运动/娱乐/休息）
- 时间线视图：当天 24h 的活动时间轴
- 基于习惯打卡时间自动推算时间分配

**数据模型**：
```javascript
// 新增 time_entries 表
const timeEntry = {
  id: autoIncrement,
  taskId: number,        // 关联任务
  category: string,      // work/study/exercise/leisure/rest
  startTime: ISO8601,
  endTime: ISO8601,
  duration: number,      // 分钟
  note: string
};
```

### 1.2 情绪追踪（优先级：中 | 难度：低 | 预期效果：自我觉察提升）

**功能设计**：
- 日记模块扩展情绪标签系统（5 基础 + 自定义）
- 情绪日历热力图（类似 GitHub 贡献图）
- 情绪与习惯/任务/财务的关联分析
- 低情绪时小鹿主动关心

### 1.3 习惯链/习惯组合（优先级：中 | 难度：低 | 预期效果：习惯坚持率 +25%）

**功能设计**：
- 支持"习惯链"：完成 A 自动提醒 B（如：早起→温水→早餐）
- 习惯组合打包：一键打卡一组关联习惯
- 习惯模板：预设晨间/午间/晚间习惯组

### 1.4 财务报表增强（优先级：高 | 难度：中 | 预期效果：财务洞察力 +40%）

**功能设计**：
- 年度收支趋势折线图
- 分类环比/同比分析
- 储蓄目标进度追踪
- 账户资产管理（银行卡/投资/现金）
- 预算智能推荐（基于历史支出自动建议预算）

### 1.5 数据看板 2.0（优先级：高 | 难度：中 | 预期效果：首页信息密度 +60%）

**功能设计**：
- 可拖拽/自定义的 Widget 系统
- Widget 类型：进度环、迷你折线图、计数器、列表、图表
- 默认 Widget：今日进度环、本周收支、习惯连续天数、待办任务、妮可洞察
- 用户可添加/删除/重排 Widget

---

## 二、技术架构升级

### 2.1 前端模块化重构（优先级：高 | 难度：高 | 预期效果：开发效率 +50%）

**现状**：全局 IIFE 模式，20+ 个 `<script>` 标签按依赖顺序加载。

**目标**：ES Module + 动态 import

**迁移策略**：
```
阶段1：保持 IIFE 外壳，内部改写为 ES Module 导出
阶段2：引入简单的模块打包器（esbuild）
阶段3：路由级代码分割
```

**代码分割示例**：
```javascript
// router.js 改造
async function loadModule(route) {
  switch(route) {
    case 'habits':
      const { HabitsModule } = await import('./modules/habits/habits.js');
      return HabitsModule;
    case 'tasks':
      const { TasksModule } = await import('./modules/tasks/tasks.js');
      return TasksModule;
    // ...
  }
}
```

### 2.2 状态管理优化（优先级：高 | 难度：中 | 预期效果：数据一致性 +80%）

**现状**：每个模块独立从 IndexedDB 读取数据，无共享状态。同一数据在不同模块可能不同步。

**方案**：引入轻量级响应式 Store

```javascript
// Store 设计
const Store = {
  _state: {},
  _listeners: new Map(),
  
  async get(key) {
    if (this._state[key]) return this._state[key];
    const data = await Storage.getAll(key);
    this._state[key] = data;
    return data;
  },
  
  async set(key, data) {
    this._state[key] = data;
    this._notify(key);
  },
  
  async update(key, fn) {
    const current = await this.get(key);
    const updated = fn(current);
    await this.set(key, updated);
  },
  
  subscribe(key, listener) {
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());
    this._listeners.get(key).add(listener);
    return () => this._listeners.get(key)?.delete(listener);
  },
  
  _notify(key) {
    this._listeners.get(key)?.forEach(fn => fn(this._state[key]));
  },
  
  invalidate(key) {
    delete this._state[key];
  }
};
```

### 2.3 构建工具优化（优先级：中 | 难度：中 | 预期效果：部署效率 +70%）

**方案**：引入 esbuild

| 功能 | 当前 | 升级后 |
|------|------|--------|
| 构建 | 无（原始文件部署） | esbuild 打包压缩 |
| CSS | 13 个独立文件 | 合并 + Tree-shaking |
| JS | 20+ 个 script 标签 | 1 个入口 + 代码分割 |
| 版本管理 | 手动改 ?v=xx | 构建时自动 hash |
| 开发体验 | 手动刷新 | HMR 热替换 |
| TypeScript | 无 | 可选支持 |

---

## 三、数据管理升级

### 3.1 同步策略升级（优先级：高 | 难度：高 | 预期效果：多设备数据一致性）

**现状**：仅支持手动推送到 GitHub，无增量同步，无冲突解决。

**升级方案**：

```
┌─────────┐     WebSocket      ┌─────────┐
│  客户端A │ ◄──────────────► │  云端    │
└─────────┘                    └─────────┘
                                    ▲
┌─────────┐     WebSocket      │
│  客户端B │ ◄──────────────────┘
└─────────┘
```

**增量同步协议**：
1. 每条记录增加 `updatedAt` 时间戳和 `version` 字段
2. 客户端启动时发送 `lastSyncTime`，服务端返回增量变更
3. 冲突策略：Last-Write-Wins + 手动解决
4. 离线时本地操作队列，上线后自动同步

**轻量级替代方案**（基于现有 GitHub 同步）：
- 增量备份：只推送变更的记录（而非全量 JSON）
- 使用 GitHub 的 commit SHA 做版本对比
- 合并策略：以较新的 `updatedAt` 为准

### 3.2 备份恢复增强（优先级：中 | 难度：低 | 预期效果：数据安全性 +90%）

| 功能 | 措施 |
|------|------|
| 自动备份 | 每日自动导出到 localStorage（最近 3 天） |
| 云端快照 | 每周自动推送到 GitHub（静默后台执行） |
| 版本回滚 | 支持从 GitHub 历史备份中选择恢复 |
| 数据校验 | 导入后自动校验记录完整性 |
| 紧急恢复 | IndexedDB 损坏时自动从 localStorage 恢复最近快照 |

### 3.3 数据迁移框架（优先级：低 | 难度：中 | 预期效果：升级无忧）

**现状**：Storage.js 的 `onupgradeneeded` 中硬编码迁移函数。

**升级方案**：
```javascript
// 迁移框架
const MigrationRegistry = {
  migrations: new Map(),
  
  register(fromVer, toVer, migrateFn) {
    this.migrations.set(`${fromVer}-${toVer}`, migrateFn);
  },
  
  async run(db, oldVer, newVer, tx) {
    for (let v = oldVer + 1; v <= newVer; v++) {
      const fn = this.migrations.get(`${v-1}-${v}`);
      if (fn) {
        console.log(`[Migration] Running ${v-1} → ${v}`);
        await fn(db, tx);
      }
    }
  }
};

// 外部注册迁移
MigrationRegistry.register(6, 7, async (db, tx) => {
  // 新增 time_entries 表
  const store = db.createObjectStore('time_entries', { keyPath: 'id', autoIncrement: true });
  store.createIndex('date', 'date', { unique: false });
  store.createIndex('category', 'category', { unique: false });
});
```

---

## 四、多设备协同方案

### 4.1 数据层协同（优先级：高 | 难度：高 | 预期效果：真正的跨设备体验）

**Phase 1 - 基于云存储的简单同步**：
- 选择低成本方案：Cloudflare KV / GitHub Gist / WebDAV
- 每次操作后标记"脏数据"
- 定时推送增量变更
- 拉取时对比 `updatedAt` 合并

**Phase 2 - 实时协同**：
- WebSocket 长连接
- 操作日志（Operation Log）而非状态同步
- 冲突自动解决 + 人工兜底

### 4.2 PWA 多设备适配（优先级：中 | 难度：低 | 预期效果：体验一致性）

| 功能 | 措施 |
|------|------|
| 响应式布局增强 | 统一 CSS Grid/Flexbox 断点系统 |
| 平板适配 | 侧边栏常驻 + 更宽的内容区 |
| 折叠屏适配 | 动态计算 `--sidebar-width` |
| 键盘适配 | 虚拟键盘弹出时自动调整布局 |
| 暗色模式完善 | 逐模块审查深色模式对比度 |

---

## 五、PWA 能力增强

### 5.1 离线能力升级（优先级：高 | 难度：中 | 预期效果：离线体验接近在线）

**现状**：SW 采用缓存优先策略，离线时基本可用但无状态提示。

**升级方案**：

```javascript
// sw.js 增强
// 1. 离线检测 API
self.addEventListener('message', (event) => {
  if (event.data.type === 'CHECK_ONLINE') {
    event.ports[0].postMessage({ online: self.navigator.onLine });
  }
});

// 2. 后台同步
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncToCloud());
  }
});

// 3. 离线操作队列
const OFFLINE_QUEUE = 'offline-queue-db';

async function enqueueOperation(op) {
  const db = await openOfflineDB();
  db.put(OFFLINE_QUEUE, { ...op, timestamp: Date.now() });
}

async function flushQueue() {
  const db = await openOfflineDB();
  const ops = await db.getAll(OFFLINE_QUEUE);
  for (const op of ops) {
    try {
      await executeOperation(op);
      await db.delete(OFFLINE_QUEUE, op.id);
    } catch (e) {
      break; // 网络仍然不可用，等下次
    }
  }
}
```

### 5.2 推送通知（优先级：中 | 难度：中 | 预期效果：用户回访率 +30%）

| 通知类型 | 触发条件 | 内容 |
|----------|---------|------|
| 习惯提醒 | 21:00 未完成打卡 | "今天还有 N 个习惯未完成" |
| 任务截止 | 截止日前 2 小时 | "任务「XX」即将截止" |
| 妮可洞察 | 每日 08:00 | 简短洞察摘要 |
| 目标回顾 | 每周日 20:00 | "本周目标进度回顾" |
| 生日提醒 | 当天 09:00 | "今天是 XX 的生日" |

**实现**：
1. 使用 Web Push API + Push 订阅
2. 后端使用 Cloudflare Workers 发送推送
3. 用户可自定义通知偏好

### 5.3 原生能力接入（优先级：低 | 难度：低 | 预期效果：体验更原生）

| API | 用途 |
|-----|------|
| `navigator.share()` | 分享日记/报告 |
| `screen.wakeLock` | 番茄钟期间保持屏幕常亮 |
| `Badging API` | 应用图标角标显示未读数 |
| `Periodic Background Sync` | 定时后台同步数据 |
| `File System Access` | 选择本地备份目录 |
| `Notification API` | 系统级推送通知 |

---

## 六、分阶段实施路线图

### Phase 1：基础加固（2 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1 | 修复所有已知 bug + 消除重复代码 | 无 bug 代码库 |
| W1 | 统一模块生命周期 | 所有模块有 destroy() |
| W2 | 状态管理 Store 实现 | Store.js |
| W2 | 批量操作优化 + 虚拟分页 | Storage.bulkWrite / 分页查询 |

### Phase 2：功能升级（3 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W3 | 时间追踪器模块 | time_entries 表 + UI |
| W3 | 情绪追踪系统 | 情绪日历热力图 |
| W4 | 财务报表增强 | 趋势图 + 储蓄目标 |
| W4 | 数据看板 2.0 | Widget 系统 |
| W5 | 习惯链/组合 | 习惯组 + 一键打卡 |

### Phase 3：PWA 增强（2 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W6 | 离线操作队列 + 后台同步 | 离线无缝体验 |
| W6 | 系统推送通知 | Web Push + 偏好设置 |
| W7 | 原生 API 集成 | WakeLock + Badging + Share |
| W7 | 深色模式全面审查 | 100% 深色适配 |

### Phase 4：架构升级（3 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W8 | ES Module 迁移 | 模块化代码 |
| W8 | esbuild 构建 | 开发/生产构建 |
| W9 | 增量同步协议 | 数据一致性 |
| W9 | 云端备份自动化 | GitHub 自动推送 |
| W10 | 数据迁移框架 | MigrationRegistry |
| W10 | 性能监控埋点 | 性能基线数据 |

### 总体时间线

```
Week 1-2: Phase 1 基础加固
Week 3-5: Phase 2 功能升级
Week 6-7: Phase 3 PWA 增强
Week 8-10: Phase 4 架构升级
```

**总投入**：约 10 周（1 人全职）/ 5 周（2 人协作）
