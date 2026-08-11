/**
 * visual-enhancements.js - 7 项视觉优化的 JS 逻辑
 * 人生工作台 · v104
 *
 * 包含：
 * - 季节装饰（Canvas 飘落元素：春樱/夏萤秋叶/冬雪）
 * - 底部山水装饰视差滚动
 * - 模块 SVG 插画注入
 * - Toast 动画增强
 */

export const VisualEnhancements = (() => {
  let seasonalCanvas = null;
  let seasonalCtx = null;
  let seasonalParticles = [];
  let seasonalAnimId = null;
  let currentSeason = null;
  let mountainDecor = null;
  let scrollHandler = null;
  let resizeHandler = null;
  let W = 0;
  let H = 0;


  // 设置季节属性并创建装饰元素
  function setSeasonAttribute() {
    const season = getCurrentSeason();
    document.documentElement.setAttribute('data-season', season);
    if (!document.querySelector('.seasonal-top-banner')) {
      const banner = document.createElement('div');
      banner.className = 'seasonal-top-banner';
      document.body.appendChild(banner);
    }
    if (!document.querySelector('.seasonal-corner-left')) {
      const cL = document.createElement('div');
      cL.className = 'seasonal-corner seasonal-corner-left';
      document.body.appendChild(cL);
    }
    if (!document.querySelector('.seasonal-corner-right')) {
      const cR = document.createElement('div');
      cR.className = 'seasonal-corner seasonal-corner-right';
      document.body.appendChild(cR);
    }
  }

  // 季节配置
  const SEASONS = {
    spring: { months: [3, 4, 5], name: 'spring' },  // 3-5月 樱花
    summer: { months: [6, 7, 8], name: 'summer' },  // 6-8月 萤火虫+绿叶
    autumn: { months: [9, 10, 11], name: 'autumn' }, // 9-11月 枫叶
    winter: { months: [12, 1, 2], name: 'winter' }, // 12-2月 雪花
  };

  // 颜色配置（浅色/深色模式）
  const COLORS = {
    light: {
      spring: ['255, 182, 193', '255, 160, 175', '255, 200, 210', '255, 140, 160'],
      summer: {
        firefly: ['255, 230, 100', '255, 220, 80', '255, 240, 120'],
        leaf: ['140, 180, 120', '100, 160, 100', '120, 190, 130'],
      },
      autumn: ['210, 90, 50', '230, 120, 60', '200, 70, 40', '240, 150, 70', '180, 60, 30'],
      winter: ['255, 255, 255', '250, 248, 245', '255, 250, 240'],
    },
    dark: {
      spring: ['255, 180, 195', '240, 150, 170', '255, 200, 210', '230, 130, 155'],
      summer: {
        firefly: ['255, 240, 140', '255, 230, 110', '255, 250, 170'],
        leaf: ['100, 150, 110', '80, 130, 90', '110, 160, 120'],
      },
      autumn: ['230, 110, 70', '240, 140, 80', '220, 90, 60', '255, 170, 90', '200, 80, 50'],
      winter: ['220, 225, 235', '200, 210, 225', '230, 235, 245'],
    },
  };

  // 获取当前主题模式
  function getThemeMode() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? 'dark' : 'light';
  }

  // 获取当前季节
  function getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    for (const [key, val] of Object.entries(SEASONS)) {
      if (val.months.includes(month)) return key;
    }
    return 'spring';
  }

  // ========== 季节装饰 Canvas 初始化 ==========
  function initSeasonalDecoration() {
    if (document.getElementById('seasonal-decoration')) return;

    seasonalCanvas = document.createElement('canvas');
    seasonalCanvas.id = 'seasonal-decoration';
    document.body.appendChild(seasonalCanvas);
    seasonalCtx = seasonalCanvas.getContext('2d');

    currentSeason = getCurrentSeason();
    resizeCanvas();
    createParticles();
    setSeasonAttribute();

    resizeHandler = () => {
      resizeCanvas();
      createParticles();
    };
    window.addEventListener('resize', resizeHandler);

    animateSeasonal();
  }

  function resizeCanvas() {
    if (!seasonalCanvas) return;
    W = seasonalCanvas.width = window.innerWidth;
    H = seasonalCanvas.height = window.innerHeight;
  }

  function createParticles() {
    seasonalParticles = [];
    const density = Math.min(0.00006, 0.00008); // 低密度，不喧宾夺主
    const count = Math.max(20, Math.min(50, Math.floor(W * H * density)));

    for (let i = 0; i < count; i++) {
      seasonalParticles.push(createParticle());
    }
  }

  function createParticle(fromBottom = false) {
    const mode = getThemeMode();
    const season = currentSeason;
    const baseSpeed = 0.5 + Math.random() * 1;

    const p = {
      x: Math.random() * W,
      y: fromBottom ? H + 20 : -20 - Math.random() * H,
      size: 2 + Math.random() * 6,
      speedY: baseSpeed,
      speedX: (Math.random() - 0.5) * 0.8,
      opacity: 0.3 + Math.random() * 0.5,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.03,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.02,
    };

    // 根据季节设置颜色和形状
    if (season === 'spring') {
      const colors = COLORS[mode].spring;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.shape = 'petal';
      p.speedY = 0.4 + Math.random() * 0.8;
    } else if (season === 'summer') {
      // 混合萤火虫和绿叶
      if (Math.random() < 0.4) {
        p.color = COLORS[mode].summer.firefly[Math.floor(Math.random() * 3)];
        p.shape = 'firefly';
        p.size = 2 + Math.random() * 3;
        p.speedY = (Math.random() - 0.5) * 0.5; // 萤火虫漂浮
        p.speedX = (Math.random() - 0.5) * 1;
        p.glowPhase = Math.random() * Math.PI * 2;
      } else {
        p.color = COLORS[mode].summer.leaf[Math.floor(Math.random() * 3)];
        p.shape = 'leaf';
        p.speedY = 0.3 + Math.random() * 0.6;
      }
    } else if (season === 'autumn') {
      const colors = COLORS[mode].autumn;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.shape = 'maple';
      p.speedY = 0.5 + Math.random() * 0.9;
    } else {
      // winter
      const colors = COLORS[mode].winter;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.shape = 'snow';
      p.speedY = 0.4 + Math.random() * 0.7;
    }

    return p;
  }

  function animateSeasonal() {
    if (!seasonalCtx) return;
    seasonalCtx.clearRect(0, 0, W, H);

    for (let i = seasonalParticles.length - 1; i >= 0; i--) {
      const p = seasonalParticles[i];

      // 更新位置
      if (p.shape === 'firefly') {
        // 萤火虫漂浮
        p.x += p.speedX;
        p.y += p.speedY + Math.sin(p.wobble) * 0.3;
        p.wobble += p.wobbleSpeed;
        p.glowPhase += 0.05;

        // 边界反弹
        if (p.x < 0 || p.x > W) p.speedX *= -1;
        if (p.y < 0 || p.y > H) p.speedY *= -1;
      } else {
        // 飘落
        p.y += p.speedY;
        p.wobble += p.wobbleSpeed;
        p.x += Math.sin(p.wobble) * 0.5 + p.speedX;
        p.rotation += p.rotationSpeed;

        // 超出底部重置
        if (p.y > H + 30) {
          Object.assign(p, createParticle());
        }
      }

      // 超出侧边重置
      if (p.x < -30) p.x = W + 20;
      if (p.x > W + 30) p.x = -20;

      drawParticle(p);
    }

    seasonalAnimId = requestAnimationFrame(animateSeasonal);
  }

  function drawParticle(p) {
    seasonalCtx.save();
    seasonalCtx.translate(p.x, p.y);
    seasonalCtx.rotate(p.rotation);
    seasonalCtx.globalAlpha = p.opacity;

    if (p.shape === 'petal') {
      // 樱花瓣
      seasonalCtx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
      seasonalCtx.beginPath();
      const s = p.size;
      seasonalCtx.moveTo(0, -s);
      seasonalCtx.bezierCurveTo(s * 0.6, -s * 0.6, s * 0.8, s * 0.2, 0, s * 0.6);
      seasonalCtx.bezierCurveTo(-s * 0.8, s * 0.2, -s * 0.6, -s * 0.6, 0, -s);
      seasonalCtx.fill();
    } else if (p.shape === 'firefly') {
      // 萤火虫：发光小点
      const glow = 0.5 + 0.5 * Math.sin(p.glowPhase);
      const gradient = seasonalCtx.createRadialGradient(0, 0, 0, 0, 0, p.size * 3);
      gradient.addColorStop(0, `rgba(${p.color}, ${0.8 + 0.2 * glow})`);
      gradient.addColorStop(0.3, `rgba(${p.color}, ${0.4 * glow})`);
      gradient.addColorStop(1, `rgba(${p.color}, 0)`);
      seasonalCtx.fillStyle = gradient;
      seasonalCtx.beginPath();
      seasonalCtx.arc(0, 0, p.size * 3, 0, Math.PI * 2);
      seasonalCtx.fill();

      seasonalCtx.fillStyle = `rgba(255, 255, 200, ${0.9 + 0.1 * glow})`;
      seasonalCtx.beginPath();
      seasonalCtx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
      seasonalCtx.fill();
    } else if (p.shape === 'leaf') {
      // 小绿叶
      seasonalCtx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
      seasonalCtx.beginPath();
      const s = p.size;
      seasonalCtx.ellipse(0, 0, s * 0.4, s, 0, 0, Math.PI * 2);
      seasonalCtx.fill();
      // 叶脉
      seasonalCtx.strokeStyle = `rgba(${p.color}, 0.3)`;
      seasonalCtx.lineWidth = 0.5;
      seasonalCtx.beginPath();
      seasonalCtx.moveTo(0, -s);
      seasonalCtx.lineTo(0, s);
      seasonalCtx.stroke();
    } else if (p.shape === 'maple') {
      // 枫叶：简化的五瓣形状
      seasonalCtx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
      drawMapleLeaf(seasonalCtx, p.size);
    } else if (p.shape === 'snow') {
      // 雪花
      seasonalCtx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
      seasonalCtx.beginPath();
      seasonalCtx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
      seasonalCtx.fill();

      // 大雪花加十字
      if (p.size > 4) {
        seasonalCtx.strokeStyle = `rgba(${p.color}, ${p.opacity * 0.7})`;
        seasonalCtx.lineWidth = 1;
        seasonalCtx.beginPath();
        const s = p.size;
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          seasonalCtx.moveTo(0, 0);
          seasonalCtx.lineTo(Math.cos(angle) * s * 0.8, Math.sin(angle) * s * 0.8);
        }
        seasonalCtx.stroke();
      }
    }

    seasonalCtx.restore();
  }

  function drawMapleLeaf(ctx, size) {
    const s = size;
    ctx.beginPath();
    // 简化五瓣枫叶
    const points = [
      [0, -s], [s * 0.2, -s * 0.3],
      [s, -s * 0.2], [s * 0.3, s * 0.2],
      [s * 0.6, s], [0, s * 0.5],
      [-s * 0.6, s], [-s * 0.3, s * 0.2],
      [-s, -s * 0.2], [-s * 0.2, -s * 0.3],
    ];
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ========== 底部山水装饰 ==========
  function initMountainDecoration() {
    if (document.querySelector('.mountain-decoration')) return;

    mountainDecor = document.createElement('div');
    mountainDecor.className = 'mountain-decoration';

    // 三层山峦 SVG
    mountainDecor.innerHTML = `
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
        <!-- 远山（第三层） -->
        <path class="mountain-layer mountain-layer-3" d="
          M0,80
          L100,60 L200,70 L300,50 L400,65 L500,45 L600,60 L700,50 L800,70 L900,55 L1000,65 L1100,55 L1200,75
          L1200,120 L0,120 Z
        "/>
        <!-- 中山（第二层） -->
        <path class="mountain-layer mountain-layer-2" d="
          M0,90
          L80,75 L160,85 L240,65 L340,80 L440,60 L540,78 L640,68 L740,85 L840,70 L940,82 L1040,72 L1140,85 L1200,80
          L1200,120 L0,120 Z
        "/>
        <!-- 近山（第一层） -->
        <path class="mountain-layer mountain-layer-1" d="
          M0,100
          L60,92 L130,98 L210,85 L300,95 L380,82 L460,96 L550,88 L630,97 L720,86 L800,94 L890,84 L970,96 L1060,90 L1140,98 L1200,95
          L1200,120 L0,120 Z
        "/>
      </svg>
    `;

    document.body.appendChild(mountainDecor);

    // 视差滚动
    const contentArea = document.querySelector('.content-area') || document.querySelector('.main-area');
    if (contentArea) {
      scrollHandler = () => {
        const scrollTop = contentArea.scrollTop || 0;
        updateMountainParallax(scrollTop);
      };
      contentArea.addEventListener('scroll', scrollHandler, { passive: true });
    }
  }

  function updateMountainParallax(scrollTop) {
    if (!mountainDecor) return;

    // 三层不同的视差速度（近层移动最慢 = 最远处的效果）
    const layer1 = mountainDecor.querySelector('.mountain-layer-1');
    const layer2 = mountainDecor.querySelector('.mountain-layer-2');
    const layer3 = mountainDecor.querySelector('.mountain-layer-3');

    if (layer1) layer1.style.transform = `translateY(${scrollTop * 0.05}px)`;
    if (layer2) layer2.style.transform = `translateY(${scrollTop * 0.1}px)`;
    if (layer3) layer3.style.transform = `translateY(${scrollTop * 0.15}px)`;
  }

  // ========== 模块 SVG 插画注入 ==========
  const MODULE_ILLUSTRATIONS = {
    calendar: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="12" width="32" height="30" rx="3" stroke="currentColor" stroke-width="1.5"/>
      <line x1="8" y1="20" x2="40" y2="20" stroke="currentColor" stroke-width="1.5"/>
      <line x1="16" y1="8" x2="16" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="32" y1="8" x2="32" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="20" cy="28" r="2" fill="currentColor" opacity="0.6"/>
      <circle cx="28" cy="28" r="2" fill="currentColor" opacity="0.6"/>
      <circle cx="24" cy="35" r="2" fill="currentColor" opacity="0.6"/>
    </svg>`,
    tasks: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="8" width="28" height="32" rx="3" stroke="currentColor" stroke-width="1.5"/>
      <path d="M16 18 L20 22 L32 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M16 26 L20 30 L32 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
      <path d="M16 34 L20 38 L26 32" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
    </svg>`,
    habits: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 6 L24 42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M24 6 C24 6 14 14 14 22 C14 28 18 34 24 42 C30 34 34 28 34 22 C34 14 24 6 24 6Z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1"/>
      <circle cx="24" cy="20" r="3" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.3"/>
    </svg>`,
    dao: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="1.5"/>
      <path d="M24 8 C30 8 36 13 36 20 C36 27 30 32 24 32 C18 32 12 27 12 20 C12 13 18 8 24 8Z" fill="currentColor" fill-opacity="0.7"/>
      <path d="M24 40 C18 40 12 35 12 28 C12 21 18 16 24 16 C30 16 36 21 36 28 C36 35 30 40 24 40Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <circle cx="24" cy="20" r="2.5" fill="var(--bg-card, #EEE9E3)"/>
      <circle cx="24" cy="28" r="2.5" fill="currentColor"/>
    </svg>`,
    journal: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 8 L36 8 L36 40 L12 40 Z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.05"/>
      <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="16" y1="22" x2="32" y2="22" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="16" y1="28" x2="28" y2="28" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="16" y1="34" x2="24" y2="34" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
      <path d="M36 8 L40 8 L40 40 L36 40" stroke="currentColor" stroke-width="1"/>
    </svg>`,
    study: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 8 L8 14 L8 26 C8 32 16 36 24 40 C32 36 40 32 40 26 L40 14 Z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.08"/>
      <path d="M8 14 L24 20 L40 14" stroke="currentColor" stroke-width="1.5"/>
      <path d="M24 20 L24 40" stroke="currentColor" stroke-width="1.5"/>
      <path d="M36 28 L40 30 L40 34 L36 36" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    health: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 40 L24 28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M24 28 C24 20 16 18 16 14 C16 11 18 8 21 8 C24 8 24 12 24 12 C24 12 24 8 27 8 C30 8 32 11 32 14 C32 18 24 20 24 28Z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.15"/>
      <path d="M18 40 L30 40" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    finance: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="1.5"/>
      <text x="24" y="30" text-anchor="middle" font-size="16" font-weight="300" fill="currentColor" font-family="serif">¥</text>
      <path d="M24 10 L24 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M24 34 L24 38" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M10 24 L14 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M34 24 L38 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    goals: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="24" cy="24" r="9" stroke="currentColor" stroke-width="1.2" opacity="0.7"/>
      <circle cx="24" cy="24" r="4" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
      <circle cx="24" cy="24" r="1.5" fill="currentColor"/>
      <path d="M38 10 L30 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
    </svg>`,
    dashboard: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="26" r="12" stroke="currentColor" stroke-width="1.5"/>
      <path d="M12 26 A12 12 0 0 1 36 26" stroke="currentColor" stroke-width="1.5"/>
      <path d="M24 26 L24 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M24 26 L30 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
      <circle cx="24" cy="26" r="2" fill="currentColor"/>
      <path d="M24 38 L24 42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    default: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="14" width="28" height="22" rx="3" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.05"/>
      <circle cx="18" cy="25" r="3" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="30" cy="25" r="3" stroke="currentColor" stroke-width="1.2"/>
      <path d="M18 32 L30 32" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
    </svg>`,
  };

  function injectModuleIllustration(cardElement, moduleName) {
    if (!cardElement) return;
    if (cardElement.querySelector('.module-illustration')) return;

    const svg = MODULE_ILLUSTRATIONS[moduleName] || MODULE_ILLUSTRATIONS.default;
    const wrapper = document.createElement('div');
    wrapper.className = 'module-illustration';
    wrapper.innerHTML = svg;
    wrapper.style.color = 'var(--accent-orange, #E8A87C)';

    cardElement.appendChild(wrapper);
  }

  // 为页面中所有带 data-module 的卡片自动注入插画
  function autoInjectIllustrations() {
    const cards = document.querySelectorAll('[data-module]');
    cards.forEach(card => {
      const moduleName = card.getAttribute('data-module');
      injectModuleIllustration(card, moduleName);
    });

    // 也为 dashboard 上的 widget 注入
    const widgets = document.querySelectorAll('.dash-widget[data-widget]');
    widgets.forEach(widget => {
      const name = widget.getAttribute('data-widget');
      injectModuleIllustration(widget, name);
    });
  }

  // ========== Toast 动画增强 ==========
  function enhanceToastSystem() {
    // 覆盖原生 showToast 的动画逻辑
    // 通过 MutationObserver 监听 .app-toast 的创建
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.classList && node.classList.contains('app-toast')) {
            requestAnimationFrame(() => {
              node.classList.add('toast-visible');
            });

            // 重写淡出逻辑
            const originalRemove = () => {};
            // 监听 style.opacity 变化，改为使用 class
            const styleObserver = new MutationObserver(() => {
              if (node.style.opacity === '0') {
                node.classList.remove('toast-visible');
                node.style.opacity = ''; // 清除内联
                styleObserver.disconnect();
              }
            });
            styleObserver.observe(node, { attributes: true, attributeFilter: ['style'] });
          }
        });
      });
    });

    observer.observe(document.body, { childList: true });
  }

  // ========== 主题切换时重新创建粒子 ==========
  function onThemeChange() {
    if (seasonalParticles.length > 0) {
      createParticles();
    }
  }

  // ========== 公共初始化 ==========
  function init() {
    // 季节装饰
    try {
      initSeasonalDecoration();
    } catch (e) {
      console.warn('[VisualEnhancements] 季节装饰初始化失败:', e);
    }

    // 山水装饰
    try {
      initMountainDecoration();
    } catch (e) {
      console.warn('[VisualEnhancements] 山水装饰初始化失败:', e);
    }

    // Toast 增强
    try {
      enhanceToastSystem();
    } catch (e) {
      console.warn('[VisualEnhancements] Toast 增强初始化失败:', e);
    }

    // 模块插画（延迟，等待模块加载）
    setTimeout(() => {
      try { autoInjectIllustrations(); } catch (e) {}
    }, 1500);

    // 监听路由变化，重新注入插画
    const observer = new MutationObserver(() => {
      try { autoInjectIllustrations(); } catch (e) {}
    });
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
      observer.observe(contentArea, { childList: true, subtree: true });
    }

    // 监听主题变化
    const themeObserver = new MutationObserver(() => {
      onThemeChange();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  // 销毁（资源清理）
  function destroy() {
    if (seasonalAnimId) {
      cancelAnimationFrame(seasonalAnimId);
      seasonalAnimId = null;
    }
    if (seasonalCanvas) {
      seasonalCanvas.remove();
      seasonalCanvas = null;
    }
    if (mountainDecor) {
      mountainDecor.remove();
      mountainDecor = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    seasonalParticles = [];
  }

  return {
    init,
    destroy,
    injectModuleIllustration,
  };
})();
