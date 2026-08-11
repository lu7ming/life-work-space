/**
 * visual-c-group.js - C组2项视觉优化 JS 逻辑
 * 人生工作台 · v107
 *
 * 1. 卷轴展开卡片 - 给模块可展开面板增强卷轴式展开动画
 *    （CSS 完成主体，JS 负责给现有可展开元素添加 wrapper / 标记）
 *
 * 2. 手绘风分隔元素 - 注入 SVG 毛笔分隔线 + 红色印章装饰
 *    仅应用于「道模块」和「日记模块」的标题处
 *
 * 通过 ES Module 导出，由 app.js 导入并调用 init()
 */

export const VisualCGroup = (() => {
  let inited = false;

  // ====== 公共：初始化入口 ======
  function init() {
    if (inited) return;
    inited = true;

    requestAnimationFrame(() => {
      initScrollUnrollPanels();
      initBrushDividersC();
    });

    // 监听模块加载，动态应用
    document.addEventListener('module-loaded', (e) => {
      const route = e.detail?.route || '';
      if (route === 'dao' || route === 'journal') {
        requestAnimationFrame(() => {
          enhanceDaoPanels();
          enhanceJournalPanels();
          initBrushDividersC();
        });
      }
    });
  }

  /* ===========================================================
   * 1. 卷轴展开卡片 - 可展开面板增强
   * =========================================================== */
  function initScrollUnrollPanels() {
    // 主体靠 CSS 实现，JS 只做渐进增强
  }

  /**
   * 道模块可展开面板增强
   */
  function enhanceDaoPanels() {
    const daoModule = document.querySelector('.dao-module');
    if (!daoModule) return;
    if (daoModule.dataset.scrollEnhanced === 'true') return;
    daoModule.dataset.scrollEnhanced = 'true';

    // 养生卡片展开细节包装
    const yangshengCards = daoModule.querySelectorAll('.dao-yangsheng-card');
    yangshengCards.forEach(card => {
      const existingDetail = card.querySelector('.dao-yangsheng-expand-detail');
      if (existingDetail) return;

      const titleEl = card.querySelector('.dao-yangsheng-title, .dao-yangsheng-card-title');
      if (!titleEl) return;

      const detail = document.createElement('div');
      detail.className = 'dao-yangsheng-expand-detail';

      let next = titleEl.nextSibling;
      while (next) {
        const sibling = next;
        next = next.nextSibling;
        detail.appendChild(sibling);
      }

      card.appendChild(detail);
    });
  }

  /**
   * 日记模块可展开面板增强
   */
  function enhanceJournalPanels() {
    const journalModule = document.querySelector('.journal-module, #journal-container');
    if (!journalModule) return;
    // 日记条目通常动态渲染，此处做标记
  }

  /* ===========================================================
   * 2. 手绘风分隔元素 - 仅道和日记模块
   * =========================================================== */
  function initBrushDividersC() {
    addDaoTitleDecoration();
    addJournalTitleDecoration();
  }

  function createBrushSVGC() {
    return `
      <svg viewBox="0 0 400 12" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="brushGradC" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="var(--accent, #E8A87C)" stop-opacity="0"/>
            <stop offset="15%" stop-color="var(--accent, #E8A87C)" stop-opacity="0.35"/>
            <stop offset="50%" stop-color="var(--accent, #E8A87C)" stop-opacity="0.5"/>
            <stop offset="85%" stop-color="var(--accent, #E8A87C)" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="var(--accent, #E8A87C)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <!-- 主笔触：贝塞尔曲线，模拟毛笔的起伏 -->
        <path d="M 10 6
                 C 50 3, 90 9, 140 5
                 S 230 8, 290 5
                 S 360 7, 390 5.5"
              stroke="url(#brushGradC)"
              stroke-width="3"
              stroke-linecap="round"
              fill="none"/>
        <!-- 副笔触：更细的飞白效果 -->
        <path d="M 20 7.5
                 Q 100 8.5, 180 7
                 T 380 8"
              stroke="var(--accent, #E8A87C)"
              stroke-width="1"
              stroke-linecap="round"
              fill="none"
              opacity="0.3"/>
        <!-- 起始点墨滴 -->
        <circle cx="12" cy="6" r="1.5" fill="var(--accent, #E8A87C)" opacity="0.3"/>
        <!-- 收尾墨点 -->
        <circle cx="388" cy="5.5" r="1" fill="var(--accent, #E8A87C)" opacity="0.25"/>
      </svg>
    `;
  }

  function createSealC(text, rotDeg = -8) {
    const seal = document.createElement('span');
    seal.className = 'seal-stamp-c';
    seal.style.transform = `rotate(${rotDeg}deg)`;
    seal.textContent = text;
    seal.title = text;
    return seal;
  }

  /**
   * 道模块标题装饰：Tab Bar 右侧加印章，Tab Bar 下方加毛笔分隔线
   */
  function addDaoTitleDecoration() {
    const daoModule = document.querySelector('.dao-module');
    if (!daoModule) return;

    const tabBar = daoModule.querySelector('.dao-tab-bar');
    if (!tabBar) return;
    if (tabBar.dataset.sealAdded === 'true') return;
    tabBar.dataset.sealAdded = 'true';

    tabBar.style.position = 'relative';
    const seal = createSealC('道', -7);
    seal.style.cssText = `
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%) rotate(-7deg);
      z-index: 2;
    `;
    tabBar.appendChild(seal);

    const divider = document.createElement('div');
    divider.className = 'brush-divider-c dao-tab-brush-divider';
    divider.innerHTML = createBrushSVGC();
    tabBar.after(divider);
  }

  /**
   * 日记模块标题装饰：主标题旁加印章，标题下方加毛笔分隔线
   */
  function addJournalTitleDecoration() {
    const journalModule = document.querySelector('.journal-module, #journal-container');
    if (!journalModule) return;

    const moduleHeader = journalModule.querySelector('.module-header');
    if (!moduleHeader) return;
    if (moduleHeader.dataset.sealAdded === 'true') return;
    moduleHeader.dataset.sealAdded = 'true';

    const titleEl = moduleHeader.querySelector('.module-title');
    if (!titleEl) return;

    const wrap = document.createElement('div');
    wrap.className = 'module-title-seal-wrap';
    titleEl.parentNode.insertBefore(wrap, titleEl);
    wrap.appendChild(titleEl);

    const seal = createSealC('日', -9);
    wrap.appendChild(seal);

    const divider = document.createElement('div');
    divider.className = 'brush-divider-c';
    divider.innerHTML = createBrushSVGC();
    wrap.after(divider);
  }

  // ====== 销毁 ======
  function destroy() {
    inited = false;
  }

  return {
    init,
    destroy,
    createBrushSVGC,
    createSealC,
  };
})();

// 兼容非 module 环境
if (typeof window !== 'undefined') {
  window.VisualCGroup = VisualCGroup;
}
