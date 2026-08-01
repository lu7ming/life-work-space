# 人生工作台 · 工作台优化方案

> 版本：v1.0 | 日期：2026-08-02 | 状态：待实施

---

## 一、当前版本问题总结

### 1.1 严重问题（已修复）

| # | 问题 | 影响 | 修复措施 |
|---|------|------|---------|
| S1 | 妮可 Pipeline 引用不存在的 `NotificationModule` | 妮可洞察写入通知完全失效 | 改为 `NotificationEngine.addNotification()` |
| S2 | 妮可通知传参 `body` 与 `addNotification` 期望的 `message` 不匹配 | 通知内容丢失 | 参数名对齐为 `message` |
| S3 | 通知引擎生日提醒格式不兼容 | 联系人生日为 `YYYY-MM-DD` 格式时永远无法触发生日提醒 | 支持 `YYYY-MM-DD` 和 `MM-DD` 双格式 |

### 1.2 中等问题（已修复）

| # | 问题 | 影响 | 修复措施 |
|---|------|------|---------|
| M1 | `updateStreak` 使用 `Array.includes()` 做 O(n) 查找 | 打卡记录超 1000 条时页面卡顿 | 改用 `Set.has()` O(1) 查找 |
| M2 | Dashboard `renderGreeting` 同上问题 | 首屏加载慢 | 同上修复 |
| M3 | Nicole Pipeline 习惯连续计算 `hCheckins.some()` O(n) | 妮可洞察生成慢 | 改用 `Set.has()` |
| M4 | 任务模块番茄钟 interval 在路由切换时未清理 | 切换模块后番茄钟仍在后台运行，内存泄漏 | 添加 `destroy()` 方法清理定时器 |
| M5 | 通知引擎 5 分钟 interval 无销毁机制 | 长时间使用导致多重定时器叠加 | 添加 `destroy()` 方法 |
| M6 | Dashboard 聚焦卡片 HTML 结构错误（重复 label） | checkbox 点击区域错乱 | 删除多余的 label 标签 |
| M7 | Storage 无批量操作方法 | 大量数据写入时逐条创建事务，性能差 | 新增 `bulkWrite`/`bulkGetAll` 单事务批量操作 |
| M8 | `AppUtils` 工具函数已定义但所有模块仍各自重复定义 | 17 处 `escapeHtml`、10 处 `formatDate` 重复 | 扩展 AppUtils 并记录待迁移（渐进式） |

### 1.3 轻微问题（记录不阻塞）

| # | 问题 | 影响 |
|---|------|------|
| L1 | 所有模块 `return { init }` 无 `destroy` | 路由切换时事件监听器无法清理 |
| L2 | CSS 版本号 `?v=31` 硬编码，与 `__APP_VERSION__` 不同步 | 缓存更新不可靠 |
| L3 | 侧边栏"更多"子菜单无动画 | 交互生硬 |
| L4 | 深色模式样式覆盖不完整 | 部分 modal/弹窗在深色下对比度不足 |
| L5 | 习惯打卡日历每次切换月份都重新读取 IndexedDB | 月历滑动不流畅 |
| L6 | 财务模块所有记录加载到内存 | 10000+ 记录时页面卡顿 |
| L7 | AI 模块 API 调用无重试机制 | 网络波动时用户体验差 |
| L8 | 小鹿 AI 链式调用 3 次 API 但无缓存 | 相同意图重复消耗 token |

---

## 二、代码质量优化

### 2.1 消除重复代码（优先级：高 | 难度：低 | 预期效果：可维护性提升 50%）

**现状**：`escapeHtml` 在 17 个文件中重复定义，`formatDate` 在 10 个文件中重复定义。

**方案**：
1. 各模块渐进式替换为 `AppUtils.escapeHtml()`、`AppUtils.formatDate()` 等
2. 在迁移期间保留各模块内部函数作为 `AppUtils.xxx` 的别名，保持向后兼容
3. 新模块强制使用 `AppUtils`

```javascript
// 迁移示例（渐进式）
const HabitsModule = (() => {
  const { escapeHtml, formatDate, formatTime } = AppUtils;
  // 后续代码直接使用 escapeHtml() 即可
})();
```

### 2.2 统一模块生命周期（优先级：高 | 难度：中 | 预期效果：内存泄漏清零）

**现状**：仅 TasksModule 有 `destroy()`，其余 12 个模块均无。

**方案**：
1. 定义模块生命周期接口：`init()` → `destroy()`
2. 在 `destroy()` 中清理：
   - `addEventListener` 绑定的事件
   - `setInterval/setTimeout` 定时器
   - DOM 引用置 null
   - 模块状态重置
3. App.cleanupCurrentModule() 确保调用 destroy

```javascript
// 标准模块模板
const XxxModule = (() => {
  let _eventListeners = [];  // 追踪事件监听
  
  function bindEvent(el, event, handler) {
    el.addEventListener(event, handler);
    _eventListeners.push({ el, event, handler });
  }
  
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => {
      el.removeEventListener(event, handler);
    });
    _eventListeners = [];
  }
  
  return { init, destroy };
})();
```

### 2.3 错误处理统一（优先级：中 | 难度：低 | 预期效果：用户体验一致性）

**现状**：有的模块 `console.error` + `App.showToast`，有的静默吞错。

**方案**：
1. 封装 `ErrorHandler.handle(error, context, userMessage?)` 统一处理
2. 根据错误级别决定是否展示 toast
3. 关键操作失败自动记录到本地日志

---

## 三、UI/UX 优化

### 3.1 交互体验优化（优先级：高 | 难度：低 | 预期效果：用户满意度 +15%）

| 优化项 | 具体措施 |
|--------|---------|
| 操作反馈 | 所有写操作添加短暂 loading 态 + 成功/失败动画 |
| 删除确认 | 用自定义 modal 替代 `confirm()`（保持设计一致性） |
| 表单验证 | 实时输入验证 + 友好提示（而非提交后才校验） |
| 滑动操作 | 增加滑动阈值提示和回弹动画 |
| 空状态 | 所有模块统一空状态设计（插画 + 引导文案 + CTA 按钮） |

### 3.2 视觉一致性（优先级：中 | 难度：低 | 预期效果：专业度 +20%）

| 优化项 | 具体措施 |
|--------|---------|
| 深色模式补全 | 逐一检查所有 modal、overlay、toast 的深色适配 |
| 圆角统一 | 全局统一为 12px（卡片）/ 8px（按钮）/ 9999px（胶囊） |
| 阴影层级 | 建立 3 级阴影体系，统一替换硬编码阴影值 |
| 动画曲线 | 统一使用 `cubic-bezier(0.4, 0, 0.2, 1)` 作为标准曲线 |
| 字号层级 | h1:20px / h2:18px / body:14px / caption:12px / micro:11px |

### 3.3 动画优化（优先级：低 | 难度：低 | 预期效果：流畅度 +10%）

```css
/* 标准页面进入动画 */
.page-enter {
  animation: pageEnter 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes pageEnter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 标准列表项动画 */
.list-item-enter {
  animation: listEnter 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: both;
}
```

---

## 四、性能优化

### 4.1 加载速度（优先级：高 | 难度：中 | 预期效果：首屏时间 -40%）

| 优化项 | 措施 | 预期效果 |
|--------|------|---------|
| JS 按需加载 | 模块 JS 改为路由切换时动态 import | 初始包体积 -60% |
| CSS 合并 | 模块 CSS 改为内联到 HTML 模板中 | 减少 13 次 HTTP 请求 |
| 主题防闪白 | 移除 localStorage 双写，统一从 CSS 变量读取 | 减少阻塞脚本 |
| 预连接 | `<link rel="preconnect" href="https://api.deepseek.com">` | AI 首次响应 -200ms |

### 4.2 渲染性能（优先级：高 | 难度：中 | 预期效果：大数据量下流畅度 +50%）

| 场景 | 当前瓶颈 | 优化方案 |
|------|---------|---------|
| 习惯日历 | 每次切换月份读取 IndexedDB | 缓存 3 个月数据 + 懒加载 |
| 财务列表 | `getAll()` 全量加载 | 游标分页查询 + 虚拟滚动 |
| Dashboard | 6 个 `Promise.all` 并发读取 | 单次事务批量读取 |
| 通知角标 | 每次全表扫描 | 维护内存计数器 + 增量更新 |

**财务模块分页查询示例**：
```javascript
// 替代 getAll() 的分页查询
async function getFinancePage(monthStr, offset, limit) {
  const db = await Storage.getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('finance', 'readonly');
    const store = tx.objectStore('finance');
    const index = store.index('month');
    const range = IDBKeyRange.only(monthStr);
    const results = [];
    let skipped = 0;
    
    index.openCursor(range, 'prev').onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) { resolve(results); return; }
      if (skipped < offset) { skipped++; cursor.continue(); return; }
      results.push(cursor.value);
      if (results.length < limit) cursor.continue();
      else resolve(results);
    };
  });
}
```

### 4.3 数据存储优化（优先级：中 | 难度：中 | 预期效果：存储空间 -30%）

| 优化项 | 措施 |
|--------|------|
| 通知自动清理 | 7 天过期通知定时清理（已有，需验证） |
| 冗余字段清理 | 打卡记录中空 habits 数组改为 null |
| 索引优化 | 为 finance.date 添加索引（当前只有 month 索引） |
| 数据压缩 | 导出 JSON 时去除空字段和默认值 |

---

## 五、用户体验优化

### 5.1 快捷操作（优先级：中 | 难度：低 | 预期效果：操作效率 +30%）

| 快捷键 | 功能 |
|--------|------|
| `/` | 打开快速录入（已有） |
| `Escape` | 关闭当前面板/弹窗（已有） |
| `Cmd/Ctrl + N` | 新建当前模块的记录 |
| `Cmd/Ctrl + S` | 手动保存（心理安全感） |
| `1-9` | 侧边栏模块快速切换 |
| `?` | 显示快捷键帮助 |

### 5.2 反馈机制（优先级：中 | 难度：低 | 预期效果：安全感 +20%）

| 场景 | 反馈方式 |
|------|---------|
| 数据写入成功 | 底部 toast + 对应计数器动画更新 |
| 数据写入失败 | toast 错误提示 + 重试按钮 |
| 网络异常 | 顶部黄色横幅提示"离线模式" |
| 自动保存 | 每 30 秒静默保存 + 右下角"已保存"微提示 |
| 操作撤销 | 关键操作（删除、完成）支持 15s 内撤销 |

### 5.3 错误处理优化（优先级：高 | 难度：低 | 预期效果：用户流失率 -10%）

| 场景 | 当前行为 | 优化后 |
|------|---------|--------|
| IndexedDB 打开失败 | 静默吞错 | 全屏提示 + 重试按钮 + 降级到 localStorage |
| AI API 调用失败 | toast 提示 | 具体错误（超时/额度/网络）+ 对应操作建议 |
| 模块加载失败 | 显示"加载失败" | 自动重试 2 次 + 降级骨架屏 |
| 数据导入格式错误 | toast 提示 | 详细指出哪一行/哪个字段有问题 |

---

## 六、优先级排序与实施建议

### 第一阶段：紧急修复（1-2 天）

| 优先级 | 任务 | 难度 | 预期效果 |
|--------|------|------|---------|
| P0 | 修复妮可通知写入（S1/S2/S3） | 低 | 妮可洞察功能恢复 |
| P0 | 修复性能瓶颈（M1/M2/M3） | 低 | 大数据量下不卡顿 |
| P0 | 修复内存泄漏（M4/M5） | 低 | 长时间使用稳定 |
| P0 | 修复 HTML 结构错误（M6） | 低 | 聚焦卡片交互正常 |

### 第二阶段：核心优化（3-5 天）

| 优先级 | 任务 | 难度 | 预期效果 |
|--------|------|------|---------|
| P1 | 消除重复代码（2.1） | 低 | 可维护性 +50% |
| P1 | 统一模块生命周期（2.2） | 中 | 内存泄漏清零 |
| P1 | 加载速度优化（4.1） | 中 | 首屏时间 -40% |
| P1 | 渲染性能优化（4.2） | 中 | 大数据流畅度 +50% |
| P1 | 错误处理优化（5.3） | 低 | 用户流失率 -10% |

### 第三阶段：体验提升（5-7 天）

| 优先级 | 任务 | 难度 | 预期效果 |
|--------|------|------|---------|
| P2 | 交互体验优化（3.1） | 低 | 满意度 +15% |
| P2 | 视觉一致性（3.2） | 低 | 专业度 +20% |
| P2 | 快捷操作（5.1） | 低 | 操作效率 +30% |
| P2 | 反馈机制（5.2） | 低 | 安全感 +20% |
| P2 | 数据存储优化（4.3） | 中 | 存储空间 -30% |

### 第四阶段：持续改进（持续）

| 优先级 | 任务 | 难度 | 预期效果 |
|--------|------|------|---------|
| P3 | 动画优化（3.3） | 低 | 流畅度 +10% |
| P3 | L1-L8 轻微问题修复 | 低 | 整体质量提升 |
| P3 | 性能监控埋点 | 中 | 问题发现效率 +80% |
