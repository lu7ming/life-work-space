/**
 * RestModule - 休息模式：魁北克蓝调雪夜
 * 全屏沉浸式Canvas场景，60fps优化
 */
const RestModule = (() => {
  'use strict';

  // ====== 配置 ======
  const STAR_COUNT = 180;
  const LARGE_FLAKE_COUNT = 18;
  const SMALL_FLAKE_COUNT = 140;
  const FLAKE_SPRITE_COUNT = 7;     // 大雪花造型数
  const FLAKE_SPRITE_SIZE = 80;      // 离屏sprite尺寸

  // 随机短句
  const QUOTES = [
    '世界很大，但此刻你只需要安静。',
    '雪落无声，心亦如此。',
    '慢下来，才能看见路边的光。',
    '休息不是停滞，是重新出发。',
    '有些答案，在安静中才会浮现。',
    '你不需要时刻都在奔跑。',
    '冬天的夜，是大地在深呼吸。',
    '此刻什么都不做，也是一种力量。',
    '允许自己，偶尔空白。',
    '所有的生长，都有沉默的季节。',
    '不必急，花会在合适的时候开。',
    '深夜的雪，覆盖了白天的喧嚣。',
    '你比自己想象的更有韧性。',
    '把心放空，才能装下新的光。',
    '安静是一种被低估的能力。',
    '慢慢来，时间从不辜负认真的人。',
    '累了就看看夜空，星星也在赶路。',
    '独处时，你离自己最近。',
    '每一片雪都在告诉你：可以停下。',
    '有些路，走着走着就亮了。',
    '今天的你，已经足够好了。',
    '温柔地对待此刻的自己。',
    '没有白走的路，也没有白下的雪。',
    '夜色温柔，你值得这份安宁。',
    '呼吸，是你此刻唯一要做的事。',
    '放下手机之前，先放下焦虑。',
    '你不需要向世界证明什么。',
    '安静的人，内心都有一片雪原。',
    '此刻的风雪，终会化作明天的清朗。',
    '愿你在每一个冬夜，找到属于自己的温暖。'
  ];

  // ====== 状态 ======
  let canvas, ctx, W, H, dpr;
  let overlay, timeEl, quoteEl;
  let active = false;
  let rafId = null;
  let lastTime = 0;
  let reducedMotion = false;

  // 对象池
  let stars = [];
  let largeFlakes = [];
  let smallFlakes = [];

  // 离屏sprite缓存
  let flakeSprites = [];

  // 场景静态元素缓存
  let bgGradient = null;
  let cityPath = null;
  let treePath = null;
  let snowGroundPath = null;
  let windowLights = [];
  let lampPositions = [];

  // 通知轮询暂停
  let notifPaused = false;

  // ====== 初始化 ======
  function init() {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    overlay = document.getElementById('rest-overlay');
    timeEl = document.getElementById('rest-time');
    quoteEl = document.getElementById('rest-quote');
    canvas = document.getElementById('rest-canvas');
    ctx = canvas.getContext('2d', { alpha: false });

    // 绑定入口按钮
    const btn = document.getElementById('rest-mode-btn');
    if (btn) {
      btn.addEventListener('click', open);
    }

    // 点击退出
    overlay.addEventListener('click', close);

    // 监听 reduced motion 变化
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      reducedMotion = e.matches;
    });
  }

  // ====== 打开/关闭 ======
  function open() {
    if (active) return;
    active = true;

    // 隐藏所有UI
    document.body.style.overflow = 'hidden';
    const sidebar = document.getElementById('sidebar');
    const topbar = document.querySelector('.topbar');
    if (sidebar) sidebar.style.visibility = 'hidden';
    if (topbar) topbar.style.visibility = 'hidden';

    // 显示overlay
    overlay.style.display = 'block';
    requestAnimationFrame(() => overlay.classList.add('active'));

    // 设置canvas尺寸
    resize();
    window.addEventListener('resize', resize);

    // 预渲染
    preRenderSprites();
    preRenderScene();
    initObjects();

    // 随机短句
    quoteEl.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];

    // 暂停通知轮询
    pauseNotifications();

    // 启动动画
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function close() {
    if (!active) return;
    active = false;

    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 800);

    // 恢复UI
    document.body.style.overflow = '';
    const sidebar = document.getElementById('sidebar');
    const topbar = document.querySelector('.topbar');
    if (sidebar) sidebar.style.visibility = '';
    if (topbar) topbar.style.visibility = '';

    // 取消动画
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    window.removeEventListener('resize', resize);

    // 恢复通知轮询
    resumeNotifications();
  }

  // ====== 通知轮询控制 ======
  function pauseNotifications() {
    // 尝试停止全局定时器
    if (NotificationEngine && typeof NotificationEngine.pause === 'function') {
      NotificationEngine.pause();
      notifPaused = true;
    }
  }

  function resumeNotifications() {
    if (notifPaused && NotificationEngine && typeof NotificationEngine.resume === 'function') {
      NotificationEngine.resume();
      notifPaused = false;
    }
  }

  // ====== Canvas尺寸 ======
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); // 限制最大2x性能
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 重新生成场景
    if (active) preRenderScene();
  }

  // ====== 大雪花离屏Sprite预渲染 ======
  function preRenderSprites() {
    flakeSprites = [];
    for (let i = 0; i < FLAKE_SPRITE_COUNT; i++) {
      const offscreen = document.createElement('canvas');
      offscreen.width = FLAKE_SPRITE_SIZE;
      offscreen.height = FLAKE_SPRITE_SIZE;
      const octx = offscreen.getContext('2d');
      drawCrystalFlake(octx, FLAKE_SPRITE_SIZE / 2, FLAKE_SPRITE_SIZE / 2, FLAKE_SPRITE_SIZE / 2 - 4, i);
      flakeSprites.push(offscreen);
    }
  }

  // 绘制结晶雪花造型
  function drawCrystalFlake(octx, cx, cy, r, variant) {
    octx.clearRect(0, 0, FLAKE_SPRITE_SIZE, FLAKE_SPRITE_SIZE);
    octx.strokeStyle = 'rgba(220, 235, 255, 0.85)';
    octx.lineWidth = 1.2;
    octx.lineCap = 'round';

    const arms = (variant % 2 === 0) ? 6 : 8;
    const angleStep = (Math.PI * 2) / arms;

    for (let i = 0; i < arms; i++) {
      const angle = angleStep * i;
      const ex = cx + Math.cos(angle) * r;
      const ey = cy + Math.sin(angle) * r;

      // 主干
      octx.beginPath();
      octx.moveTo(cx, cy);
      octx.lineTo(ex, ey);
      octx.stroke();

      // 分支（按造型变体）
      const branchLen = r * (0.3 + (variant % 3) * 0.12);
      const branchPos = 0.45 + (variant % 2) * 0.15;
      const bx = cx + Math.cos(angle) * r * branchPos;
      const by = cy + Math.sin(angle) * r * branchPos;

      for (let side = -1; side <= 1; side += 2) {
        const bAngle = angle + side * (Math.PI / 4 + (variant % 3) * 0.1);
        const bex = bx + Math.cos(bAngle) * branchLen;
        const bey = by + Math.sin(bAngle) * branchLen;
        octx.beginPath();
        octx.moveTo(bx, by);
        octx.lineTo(bex, bey);
        octx.stroke();
      }

      // 额外装饰（某些变体）
      if (variant >= 4) {
        const tipLen = r * 0.15;
        const tipAngle1 = angle + Math.PI / 6;
        const tipAngle2 = angle - Math.PI / 6;
        octx.beginPath();
        octx.moveTo(ex, ey);
        octx.lineTo(ex + Math.cos(tipAngle1) * tipLen, ey + Math.sin(tipAngle1) * tipLen);
        octx.moveTo(ex, ey);
        octx.lineTo(ex + Math.cos(tipAngle2) * tipLen, ey + Math.sin(tipAngle2) * tipLen);
        octx.stroke();
      }
    }

    // 中心点
    octx.beginPath();
    octx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    octx.fillStyle = 'rgba(220, 235, 255, 0.9)';
    octx.fill();
  }

  // ====== 场景静态元素预渲染 ======
  function preRenderScene() {
    // 背景渐变
    bgGradient = ctx.createLinearGradient(0, 0, 0, H);
    bgGradient.addColorStop(0, '#0b1424');
    bgGradient.addColorStop(1, '#101828');

    // 城市剪影路径
    cityPath = buildCityPath();

    // 松树路径
    treePath = buildTreePath();

    // 积雪路径
    snowGroundPath = buildSnowPath();

    // 窗户位置
    windowLights = buildWindowLights();

    // 路灯位置
    lampPositions = [
      { x: W * 0.22, y: H * 0.72 },
      { x: W * 0.78, y: H * 0.74 }
    ];
  }

  // 魁北克老城剪影
  function buildCityPath() {
    const path = new Path2D();
    const baseY = H * 0.78;
    const startX = -10;

    path.moveTo(startX, H);
    path.lineTo(startX, baseY);

    // 建筑群：一系列不同高度的矩形+尖塔
    const segments = [
      { w: 60, h: 55 },   // 低矮石屋
      { w: 35, h: 80 },   // 窄高
      { w: 50, h: 45 },   // 矮宽
      { w: 20, h: 130 },  // 教堂尖塔1
      { w: 55, h: 60 },   // 石屋
      { w: 40, h: 70 },
      { w: 15, h: 110 },  // 尖塔2
      { w: 65, h: 50 },
      { w: 45, h: 85 },
      { w: 25, h: 145 },  // 主教堂尖塔
      { w: 70, h: 55 },
      { w: 50, h: 65 },
      { w: 30, h: 95 },
      { w: 55, h: 48 },
      { w: 20, h: 120 },  // 小尖塔
      { w: 60, h: 58 },
      { w: 45, h: 75 },
      { w: 70, h: 50 },
      { w: 35, h: 100 },
      { w: 80, h: 45 },
    ];

    let x = startX;
    // 计算总宽度来适配屏幕
    const totalW = segments.reduce((s, seg) => s + seg.w, 0);
    const scale = (W + 20) / totalW;

    segments.forEach((seg, i) => {
      const sw = seg.w * scale;
      const sh = seg.h * (H / 800); // 按屏幕高度缩放
      const top = baseY - sh;

      // 尖塔类型
      if (seg.h > 100) {
        // 画尖塔：先上升到尖顶
        path.lineTo(x, baseY);
        path.lineTo(x, top + 15);
        path.lineTo(x + sw * 0.3, top + 15);
        path.lineTo(x + sw * 0.5, top - 10); // 尖顶
        path.lineTo(x + sw * 0.7, top + 15);
        path.lineTo(x + sw, top + 15);
        path.lineTo(x + sw, baseY);
      } else {
        // 普通石屋：带微小阶梯屋顶
        path.lineTo(x, baseY);
        path.lineTo(x, top);
        // 屋顶细节
        if (i % 3 === 0) {
          path.lineTo(x + sw * 0.5, top - 5);
          path.lineTo(x + sw, top);
        } else {
          path.lineTo(x + sw, top);
        }
      }
      x += sw;
    });

    path.lineTo(W + 10, baseY);
    path.lineTo(W + 10, H);
    path.closePath();
    return path;
  }

  // 窗户灯光
  function buildWindowLights() {
    const lights = [];
    const baseY = H * 0.78;
    const positions = [
      { rx: 0.08, ry: 0.73, w: 6, h: 8 },
      { rx: 0.12, ry: 0.71, w: 5, h: 7 },
      { rx: 0.19, ry: 0.68, w: 5, h: 9 },
      { rx: 0.28, ry: 0.74, w: 6, h: 7 },
      { rx: 0.35, ry: 0.70, w: 5, h: 8 },
      { rx: 0.42, ry: 0.72, w: 7, h: 6 },
      { rx: 0.52, ry: 0.69, w: 5, h: 9 },
      { rx: 0.58, ry: 0.73, w: 6, h: 7 },
      { rx: 0.65, ry: 0.71, w: 5, h: 8 },
      { rx: 0.72, ry: 0.74, w: 6, h: 6 },
      { rx: 0.82, ry: 0.72, w: 5, h: 7 },
      { rx: 0.90, ry: 0.73, w: 6, h: 8 },
    ];

    positions.forEach(p => {
      lights.push({
        x: W * p.rx,
        y: H * p.ry,
        w: p.w * (W / 1200),
        h: p.h * (H / 800),
        flicker: Math.random() * 0.3 + 0.7 // 基础亮度
      });
    });
    return lights;
  }

  // 松树剪影
  function buildTreePath() {
    const path = new Path2D();
    const baseY = H * 0.82;
    path.moveTo(-10, H);
    path.lineTo(-10, baseY);

    const treeCount = Math.ceil(W / 45);
    let x = 0;

    for (let i = 0; i < treeCount; i++) {
      const tw = 25 + Math.random() * 20;
      const th = 30 + Math.random() * 45;
      const tipX = x + tw / 2;
      const tipY = baseY - th;

      // 三角形松树
      path.lineTo(x, baseY);
      path.lineTo(tipX, tipY);
      path.lineTo(x + tw, baseY);

      x += tw + Math.random() * 15;
    }

    path.lineTo(W + 10, baseY);
    path.lineTo(W + 10, H);
    path.closePath();
    return path;
  }

  // 地面积雪
  function buildSnowPath() {
    const path = new Path2D();
    const baseY = H * 0.88;
    path.moveTo(-10, H);
    path.lineTo(-10, baseY);

    // 起伏的积雪轮廓
    const steps = Math.ceil(W / 30);
    for (let i = 0; i <= steps; i++) {
      const x = (W / steps) * i;
      const y = baseY + Math.sin(i * 0.8) * 8 + Math.sin(i * 1.5) * 4;
      path.lineTo(x, y);
    }

    path.lineTo(W + 10, H);
    path.closePath();
    return path;
  }

  // ====== 星星初始化 ======
  function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.6,
        r: Math.random() * 1.2 + 0.3,
        baseAlpha: Math.random() * 0.6 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 1.5 + 0.5
      });
    }
  }

  // ====== 雪花对象池初始化 ======
  function initFlakes() {
    largeFlakes = [];
    smallFlakes = [];

    for (let i = 0; i < LARGE_FLAKE_COUNT; i++) {
      largeFlakes.push(createLargeFlake());
    }
    for (let i = 0; i < SMALL_FLAKE_COUNT; i++) {
      smallFlakes.push(createSmallFlake());
    }
  }

  function createLargeFlake() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      size: 16 + Math.random() * 20,
      speed: 12 + Math.random() * 18,      // 下落速度 px/s
      drift: (Math.random() - 0.5) * 15,   // 水平漂移
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.4,
      alpha: 0.4 + Math.random() * 0.4,
      spriteIdx: Math.floor(Math.random() * FLAKE_SPRITE_COUNT),
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 1 + Math.random() * 2
    };
  }

  function createSmallFlake() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      size: 1 + Math.random() * 3,
      speed: 8 + Math.random() * 25,
      drift: (Math.random() - 0.5) * 10,
      alpha: 0.2 + Math.random() * 0.5,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.5 + Math.random() * 1.5
    };
  }

  function initObjects() {
    initStars();
    initFlakes();
  }

  // ====== 主动画循环 ======
  function loop(now) {
    if (!active) return;
    const dt = Math.min((now - lastTime) / 1000, 0.1); // 限制最大dt防卡顿
    lastTime = now;

    draw(dt, now / 1000);
    rafId = requestAnimationFrame(loop);
  }

  // ====== 绘制帧 ======
  function draw(dt, t) {
    // 1. 背景渐变
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, W, H);

    // 2. 星星
    drawStars(t);

    // 3. 街灯光晕（远景层）
    drawLampGlow(t);

    // 4. 城市剪影
    drawCity();

    // 5. 窗户灯光
    drawWindows(t);

    // 6. 松树剪影
    drawTrees();

    // 7. 路灯前景光晕
    drawLampPosts();

    // 8. 积雪地面
    drawSnowGround();

    // 9. 雪花
    if (!reducedMotion) {
      drawSmallFlakes(dt, t);
      drawLargeFlakes(dt, t);
    } else {
      drawStaticFlakes();
    }

    // 10. 更新时间
    updateTime();
  }

  // ====== 绘制各层 ======
  function drawStars(t) {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const alpha = s.baseAlpha * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 215, 240, ${alpha})`;
      ctx.fill();
    }
  }

  function drawCity() {
    ctx.fillStyle = '#0a1220';
    ctx.fill(cityPath);
  }

  function drawTrees() {
    ctx.fillStyle = '#0c1525';
    ctx.fill(treePath);
  }

  function drawSnowGround() {
    ctx.fillStyle = 'rgba(220, 230, 245, 0.85)';
    ctx.fill(snowGroundPath);

    // 雪面微光
    const snowGlow = ctx.createLinearGradient(0, H * 0.86, 0, H);
    snowGlow.addColorStop(0, 'rgba(180, 200, 230, 0.1)');
    snowGlow.addColorStop(1, 'rgba(180, 200, 230, 0)');
    ctx.fillStyle = snowGlow;
    ctx.fillRect(0, H * 0.86, W, H * 0.14);
  }

  function drawWindows(t) {
    for (let i = 0; i < windowLights.length; i++) {
      const w = windowLights[i];
      const flicker = w.flicker + Math.sin(t * 2 + i) * 0.08;
      const alpha = Math.min(1, flicker);

      // 窗户外发光
      ctx.shadowColor = `rgba(255, 200, 100, ${alpha * 0.6})`;
      ctx.shadowBlur = 8;
      ctx.fillStyle = `rgba(255, 210, 120, ${alpha * 0.8})`;
      ctx.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
    }
    ctx.shadowBlur = 0;
  }

  function drawLampGlow(t) {
    for (let i = 0; i < lampPositions.length; i++) {
      const lamp = lampPositions[i];
      const pulse = 0.9 + Math.sin(t * 0.8 + i * 2) * 0.1;

      // 大光晕
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, 80 * pulse);
      grad.addColorStop(0, `rgba(255, 200, 100, ${0.15 * pulse})`);
      grad.addColorStop(0.4, `rgba(255, 180, 80, ${0.06 * pulse})`);
      grad.addColorStop(1, 'rgba(255, 180, 80, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lamp.x - 100, lamp.y - 100, 200, 200);
    }
  }

  function drawLampPosts() {
    ctx.strokeStyle = '#1a2540';
    ctx.lineWidth = 2.5;

    for (let i = 0; i < lampPositions.length; i++) {
      const lamp = lampPositions[i];
      // 灯柱
      ctx.beginPath();
      ctx.moveTo(lamp.x, lamp.y + 5);
      ctx.lineTo(lamp.x, lamp.y + 70);
      ctx.stroke();

      // 灯头
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 220, 140, 0.9)';
      ctx.fill();
    }
  }

  // ====== 大雪花（预渲染sprite） ======
  function drawLargeFlakes(dt, t) {
    for (let i = 0; i < largeFlakes.length; i++) {
      const f = largeFlakes[i];

      // 更新位置
      f.y += f.speed * dt;
      f.wobble += f.wobbleSpeed * dt;
      f.x += (f.drift + Math.sin(f.wobble) * 8) * dt;
      f.rotation += f.rotSpeed * dt;

      // 出界回收
      if (f.y > H + f.size) {
        resetLargeFlake(f);
      }
      if (f.x < -f.size) f.x = W + f.size;
      if (f.x > W + f.size) f.x = -f.size;

      // 绘制sprite
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rotation);
      const s = f.size;
      ctx.drawImage(flakeSprites[f.spriteIdx], -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  function resetLargeFlake(f) {
    f.x = Math.random() * W;
    f.y = -f.size - Math.random() * 50;
    f.spriteIdx = Math.floor(Math.random() * FLAKE_SPRITE_COUNT);
    f.alpha = 0.4 + Math.random() * 0.4;
    f.speed = 12 + Math.random() * 18;
    f.rotation = Math.random() * Math.PI * 2;
  }

  // ====== 中小雪花（发光圆点） ======
  function drawSmallFlakes(dt, t) {
    for (let i = 0; i < smallFlakes.length; i++) {
      const f = smallFlakes[i];

      f.y += f.speed * dt;
      f.wobble += f.wobbleSpeed * dt;
      f.x += (f.drift + Math.sin(f.wobble) * 4) * dt;

      if (f.y > H + f.size) {
        resetSmallFlake(f);
      }
      if (f.x < -5) f.x = W + 5;
      if (f.x > W + 5) f.x = -5;

      // 发光圆点
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210, 225, 245, ${f.alpha})`;
      ctx.fill();

      // 外发光（小尺寸不额外blur，仅用半透明圈模拟）
      if (f.size > 2) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 215, 240, ${f.alpha * 0.15})`;
        ctx.fill();
      }
    }
  }

  function resetSmallFlake(f) {
    f.x = Math.random() * W;
    f.y = -f.size - Math.random() * 30;
    f.speed = 8 + Math.random() * 25;
    f.alpha = 0.2 + Math.random() * 0.5;
    f.size = 1 + Math.random() * 3;
  }

  // reduced motion: 静态散落雪花
  function drawStaticFlakes() {
    for (let i = 0; i < 40; i++) {
      const x = (i * 47 + 13) % W;
      const y = (i * 73 + 29) % H;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(210, 225, 245, 0.4)';
      ctx.fill();
    }
  }

  // ====== 中央时间 ======
  function updateTime() {
    if (timeEl.classList.contains('hidden')) return;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    timeEl.textContent = `${h}:${m}`;
  }

  // ====== 公开API ======
  return { init, open, close };
})();

// 在 DOMContentLoaded 时初始化
document.addEventListener('DOMContentLoaded', () => {
  RestModule.init();
});
