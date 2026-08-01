# 人生工作台 - 模块开发规范

## 项目路径
`/app/data/所有对话/主对话/life-work-space/`

## 架构模式
每个模块 3 个文件：`模块名.html` + `模块名.css` + `模块名.js`
放在 `modules/模块名/` 目录下

## JS 模块模板 (IIFE 模式)
```js
const XxxModule = (() => {
  // 状态变量
  let someState = null;

  // 工具函数
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
  function formatDate(date) { ... }

  // 初始化入口
  async function init() {
    console.log('[Xxx] 模块初始化...');
    await loadData();
    renderAll();
    bindEvents();
  }

  // 数据加载
  async function loadData() {
    // 使用 Storage API
    const data = await Storage.getAll('storeName');
  }

  // 渲染
  function renderAll() { ... }

  // 事件绑定
  function bindEvents() { ... }

  // 必须返回 { init }
  return { init };
})();
```

## 存储 API (Storage 全局对象，IndexedDB 封装)
```js
Storage.getDB()                    // 初始化数据库
Storage.add(storeName, data)       // 添加记录，返回 id
Storage.put(storeName, data)       // 更新/插入记录
Storage.get(storeName, key)        // 按主键获取
Storage.getAll(storeName)          // 获取全部记录
Storage.getByIndex(store, index, value) // 按索引查询
Storage.remove(storeName, key)     // 删除记录
Storage.clear(storeName)           // 清空表
Storage.count(storeName)           // 统计数量
```

## 已有数据表
- checkins (keyPath: date, index: month)
- habits (keyPath: id autoIncrement, index: category)
- tasks (keyPath: id autoIncrement, index: status/date)
- study (keyPath: id autoIncrement, index: date)
- health (keyPath: id autoIncrement, index: date)
- finance (keyPath: id autoIncrement, index: month/type)
- settings (keyPath: key)
- meta (keyPath: key)
- projects (keyPath: id autoIncrement, index: createdAt)
- pomodoros (keyPath: id autoIncrement, index: date/taskId)
- semesters (keyPath: id autoIncrement)
- courses (keyPath: id autoIncrement, index: semesterId)
- books (keyPath: id autoIncrement, index: status)
- skills (keyPath: id autoIncrement)

## 新增数据表（需要在 storage.js 的 onupgradeneeded 中添加）
- journal (keyPath: id autoIncrement, index: date/type)
- goals (keyPath: id autoIncrement, index: level)
- contacts (keyPath: id autoIncrement, index: type)
- knowledge (keyPath: id autoIncrement, index: type)
- lifetree (keyPath: key)
- ideas (keyPath: id autoIncrement, index: date)

## CSS 变量（暖米色调）
```css
--bg-primary: #F5EDE4        /* 主背景 */
--bg-sidebar: #E8DDD4        /* 侧边栏/高亮背景 */
--bg-card: #FFFFFF            /* 卡片背景 */
--bg-hover: #E8DDD4          /* 悬停背景 */
--text-primary: #2C2520      /* 主文字 */
--text-secondary: #6B5E53    /* 次要文字 */
--text-muted: #9B8E83        /* 弱化文字 */
--text-light: #D4C8BC        /* 边框/分割线 */
--accent: #E8A87C            /* 强调色（暖橘） */
--accent-hover: #D4956A      /* 强调色悬停 */
--radius-sm: 8px
--radius-md: 12px
--radius-lg: 16px
--radius-full: 999px
--shadow-sm: 0 1px 3px rgba(44,37,32,0.06)
--shadow-md: 0 4px 12px rgba(44,37,32,0.08)
--transition-fast: 0.15s ease
--transition-normal: 0.25s ease
```

## HTML 页面结构模式
```html
<div class="module-container page-enter">
  <div class="module-header">
    <h1 class="module-title">模块名</h1>
    <div class="module-actions"><!-- 操作按钮 --></div>
  </div>
  <!-- 内容区 -->
</div>
```

## FAB 按钮规范
```css
.module-fab {
  position: fixed;
  bottom: 24px;
  right: 20px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  border: none;
  font-size: 24px;
  cursor: pointer;
  z-index: 1000;
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
}
```

## 注意事项
- 所有模块使用暖米色调 CSS 变量
- iPad 横屏优先，响应式适配
- 不使用任何框架，纯原生 JS
- FAB 按钮固定 bottom:24px right:20px，不用 env(safe-area-inset-bottom)
- Modal 弹窗使用 overlay + card 模式
- Toast 提示使用 App.showToast()
- 数据驱动渲染（先清 innerHTML 再根据数据生成 DOM）
