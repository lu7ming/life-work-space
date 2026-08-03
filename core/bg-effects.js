/**
 * bg-effects.js - 背景动效模块
 * 人生工作台 · 9 种 Canvas 背景动画
 *
 * 模式：飘雪 / 细雨 / 薄雾 / 极光 / 星空 / 落叶 / 萤火 / 海浪 / 暗夜
 * 独立于明暗主题，可与任意主题搭配使用
 */
export const BgEffects = (() => {
  let canvas = null;
  let ctx = null;
  let W = 0;
  let H = 0;
  let particles = [];
  let currentMode = null;
  let animationId = null;
  let resizeHandler = null;

  // ========== 雪花 ==========
  class Snowflake {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : -10;
      this.r = Math.random() * 2.5 + 0.5;
      this.speed = Math.random() * 0.6 + 0.2;
      this.wind = Math.random() * 0.3 - 0.15;
      this.opacity = Math.random() * 0.4 + 0.1;
    }
    update() {
      this.y += this.speed;
      this.x += this.wind + Math.sin(this.y * 0.005) * 0.2;
      if (this.y > H + 10 || this.x < -10 || this.x > W + 10) this.reset(false);
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 215, 235, ${this.opacity})`;
      ctx.fill();
    }
  }

  // ========== 雨滴 ==========
  class Raindrop {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : -20;
      this.len = Math.random() * 18 + 8;
      this.speed = Math.random() * 4 + 6;
      this.opacity = Math.random() * 0.15 + 0.05;
    }
    update() {
      this.y += this.speed;
      this.x += 0.5;
      if (this.y > H + 20) this.reset(false);
    }
    draw() {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + 0.5, this.y - this.len);
      ctx.strokeStyle = `rgba(160, 180, 210, ${this.opacity})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // ========== 雾气 ==========
  class FogParticle {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = init ? Math.random() * W : (Math.random() > 0.5 ? -200 : W + 200);
      this.y = Math.random() * H;
      this.r = Math.random() * 150 + 80;
      this.speed = Math.random() * 0.3 + 0.1;
      this.dir = this.x < W / 2 ? 1 : -1;
      this.opacity = Math.random() * 0.03 + 0.01;
    }
    update() {
      this.x += this.speed * this.dir;
      if (this.x > W + 300 || this.x < -300) this.reset(false);
    }
    draw() {
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
      grad.addColorStop(0, `rgba(150, 170, 200, ${this.opacity})`);
      grad.addColorStop(1, 'rgba(150, 170, 200, 0)');
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ========== 极光 ==========
  class AuroraWave {
    constructor(i, total) {
      this.index = i;
      this.baseY = H * 0.15 + (H * 0.35 * i / total);
      this.amplitude = 35 + Math.random() * 45;
      this.frequency = 0.002 + Math.random() * 0.002;
      this.speed = 0.004 + Math.random() * 0.004;
      this.phase = Math.random() * Math.PI * 2;
      this.hue = 130 + i * 18;
      this.opacity = 0.035 + Math.random() * 0.02;
    }
    update() {
      this.phase += this.speed;
    }
    draw() {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const y = this.baseY + Math.sin(x * this.frequency + this.phase) * this.amplitude
                  + Math.sin(x * this.frequency * 2.3 + this.phase * 1.7) * this.amplitude * 0.25;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(W, this.baseY + this.amplitude + 150);
      ctx.lineTo(0, this.baseY + this.amplitude + 150);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, this.baseY - this.amplitude, 0, this.baseY + this.amplitude + 150);
      grad.addColorStop(0, `hsla(${this.hue}, 70%, 55%, 0)`);
      grad.addColorStop(0.4, `hsla(${this.hue}, 70%, 55%, ${this.opacity})`);
      grad.addColorStop(1, `hsla(${this.hue}, 70%, 55%, 0)`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ========== 星星 ==========
  class Star {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1.5 + 0.3;
      this.baseOpacity = Math.random() * 0.5 + 0.2;
      this.twinkleSpeed = Math.random() * 0.02 + 0.005;
      this.twinklePhase = Math.random() * Math.PI * 2;
    }
    update() {
      this.twinklePhase += this.twinkleSpeed;
    }
    draw() {
      const opacity = this.baseOpacity * (0.5 + 0.5 * Math.sin(this.twinklePhase));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 230, 255, ${opacity})`;
      ctx.fill();
      if (this.r > 1.2) {
        ctx.beginPath();
        ctx.moveTo(this.x - this.r * 2, this.y);
        ctx.lineTo(this.x + this.r * 2, this.y);
        ctx.moveTo(this.x, this.y - this.r * 2);
        ctx.lineTo(this.x, this.y + this.r * 2);
        ctx.strokeStyle = `rgba(220, 230, 255, ${opacity * 0.3})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  // ========== 落叶 ==========
  class Leaf {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : -20;
      this.size = Math.random() * 8 + 4;
      this.speedY = Math.random() * 0.8 + 0.3;
      this.speedX = Math.random() * 0.6 - 0.3;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotSpeed = (Math.random() - 0.5) * 0.02;
      this.swayAmp = Math.random() * 30 + 10;
      this.swayFreq = Math.random() * 0.02 + 0.01;
      this.swayPhase = Math.random() * Math.PI * 2;
      this.opacity = Math.random() * 0.4 + 0.2;
      const colors = ['180, 120, 50', '200, 150, 60', '160, 90, 40', '220, 170, 80', '140, 70, 30'];
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    update() {
      this.y += this.speedY;
      this.swayPhase += this.swayFreq;
      this.x += this.speedX + Math.sin(this.swayPhase) * 0.5;
      this.rotation += this.rotSpeed;
      if (this.y > H + 20) this.reset(false);
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.beginPath();
      ctx.ellipse(0, 0, this.size, this.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-this.size, 0);
      ctx.lineTo(this.size, 0);
      ctx.strokeStyle = `rgba(${this.color}, ${this.opacity * 0.5})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ========== 萤火虫 ==========
  class Firefly {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 3 + 2;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3;
      this.glowPhase = Math.random() * Math.PI * 2;
      this.glowSpeed = Math.random() * 0.03 + 0.01;
      this.maxOpacity = Math.random() * 0.6 + 0.3;
    }
    update() {
      this.x += this.speedX + (Math.random() - 0.5) * 0.1;
      this.y += this.speedY + (Math.random() - 0.5) * 0.1;
      this.glowPhase += this.glowSpeed;
      if (this.x < 0 || this.x > W) this.speedX *= -1;
      if (this.y < 0 || this.y > H) this.speedY *= -1;
    }
    draw() {
      const opacity = this.maxOpacity * (0.3 + 0.7 * Math.abs(Math.sin(this.glowPhase)));
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 4);
      grad.addColorStop(0, `rgba(180, 220, 100, ${opacity})`);
      grad.addColorStop(0.5, `rgba(140, 200, 80, ${opacity * 0.3})`);
      grad.addColorStop(1, 'rgba(140, 200, 80, 0)');
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 255, 150, ${opacity})`;
      ctx.fill();
    }
  }

  // ========== 海浪 ==========
  class Wave {
    constructor(i, total) {
      this.index = i;
      this.baseY = H * 0.45 + (H * 0.45 * i / total);
      this.amplitude = 15 + Math.random() * 20;
      this.frequency = 0.003 + Math.random() * 0.002;
      this.speed = 0.008 + Math.random() * 0.008;
      this.phase = Math.random() * Math.PI * 2;
      this.opacity = 0.02 + (i / total) * 0.03;
    }
    update() {
      this.phase += this.speed;
    }
    draw() {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = this.baseY + Math.sin(x * this.frequency + this.phase) * this.amplitude
                  + Math.sin(x * this.frequency * 1.5 + this.phase * 0.8) * this.amplitude * 0.3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = `rgba(80, 140, 180, ${this.opacity})`;
      ctx.fill();
    }
  }

  // ========== 暗夜粒子 ==========
  class DarkParticle {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1 + 0.5;
      this.speed = Math.random() * 0.2 + 0.05;
      this.opacity = Math.random() * 0.12 + 0.04;
      this.angle = Math.random() * Math.PI * 2;
    }
    update() {
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;
      this.angle += (Math.random() - 0.5) * 0.1;
      if (this.x < 0) this.x = W;
      if (this.x > W) this.x = 0;
      if (this.y < 0) this.y = H;
      if (this.y > H) this.y = 0;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 120, 150, ${this.opacity})`;
      ctx.fill();
    }
  }

  // ========== 尺寸适配 ==========
  function resize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ========== 初始化粒子 ==========
  function initParticles(mode) {
    particles = [];

    if (mode === 'snow') {
      for (let i = 0; i < 120; i++) particles.push(new Snowflake());
    } else if (mode === 'rain') {
      for (let i = 0; i < 200; i++) particles.push(new Raindrop());
    } else if (mode === 'fog') {
      for (let i = 0; i < 25; i++) particles.push(new FogParticle());
    } else if (mode === 'aurora') {
      for (let i = 0; i < 5; i++) particles.push(new AuroraWave(i, 5));
      for (let i = 0; i < 60; i++) particles.push(new Star());
    } else if (mode === 'starry') {
      for (let i = 0; i < 250; i++) particles.push(new Star());
    } else if (mode === 'autumn') {
      for (let i = 0; i < 60; i++) particles.push(new Leaf());
    } else if (mode === 'firefly') {
      for (let i = 0; i < 40; i++) particles.push(new Firefly());
    } else if (mode === 'wave') {
      for (let i = 0; i < 8; i++) particles.push(new Wave(i, 8));
    } else if (mode === 'darknight') {
      for (let i = 0; i < 80; i++) particles.push(new DarkParticle());
    }
  }

  // ========== 动画循环 ==========
  function animate() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      if (p.update) p.update();
      if (p.draw) p.draw();
    }
    animationId = requestAnimationFrame(animate);
  }

  // ========== 公开接口 ==========

  /**
   * 初始化背景动效（绑定 Canvas 元素）
   * @param {HTMLCanvasElement} canvasEl
   */
  function init(canvasEl) {
    canvas = canvasEl;
    if (!canvas) {
      console.warn('[BgEffects] Canvas 元素不存在');
      return;
    }
    ctx = canvas.getContext('2d');
    resize();
    resizeHandler = () => resize();
    window.addEventListener('resize', resizeHandler);
    console.log('[BgEffects] 模块已初始化');
  }

  /**
   * 切换背景模式
   * @param {string} mode - none/snow/rain/fog/aurora/starry/autumn/firefly/wave/darknight
   */
  function switchMode(mode) {
    if (!canvas || !ctx) {
      console.warn('[BgEffects] 尚未初始化，无法切换模式');
      return;
    }
    currentMode = mode;

    // none 或空值：停止动画并清空画布
    if (!mode || mode === 'none') {
      particles = [];
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      ctx.clearRect(0, 0, W, H);
      return;
    }

    initParticles(mode);

    // 确保动画循环在运行
    if (!animationId) {
      animate();
    }

    console.log('[BgEffects] 已切换至:', mode);
  }

  /**
   * 获取当前模式
   */
  function getMode() {
    return currentMode;
  }

  /**
   * 销毁模块（取消动画、移除监听）
   */
  function destroy() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    particles = [];
    canvas = null;
    ctx = null;
  }

  return { init, switchMode, getMode, destroy };
})();
