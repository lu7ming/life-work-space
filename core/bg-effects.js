/**
 * bg-effects.js - 背景动效模块
 * 人生工作台 · 9 种地域氛围背景（多粒子系统叠加）
 *
 * 主题：魁北克 / 爱丁堡 / 罗佛敦 / 箭镇 / 伦敦 / 赫尔辛基 / 卑尔根 / 斯德哥尔摩 / 北海道
 * 每个主题组合多个独立粒子层，营造地域氛围感
 * 支持浅色/深色双模式配色
 */
export const BgEffects = (() => {
  let canvas = null;
  let ctx = null;
  let W = 0;
  let H = 0;
  let particles = [];
  let currentMode = null;
  let currentTheme = 'dark';   // 'light' | 'dark'
  let animationId = null;
  let resizeHandler = null;

  // ========== 颜色调色板 ==========
  // 深色模式和浅色模式各有独立的颜色方案
  const DARK_PALETTE = {
    snow:         '200, 215, 235',
    snowSparse:   '210, 225, 240',
    rain:         '160, 180, 210',
    fog:          '150, 170, 200',
    star:         '220, 230, 255',
    leaf:         ['180, 120, 50', '200, 150, 60', '160, 90, 40', '220, 170, 80', '140, 70, 30'],
    mist:         '160, 180, 200',
    iceCrystal:   '200, 230, 255',
    iceGlow:      '180, 220, 255',
    waterSparkle: '180, 210, 240',
    steamFog:     '220, 230, 240',
    lightWarm:    '255, 200, 100',
    lightWarm2:   '255, 190, 90',
    lightWarm3:   '255, 160, 80',
    lightGreen:   '100, 180, 120',
    core:         '255, 250, 230'
  };

  const LIGHT_PALETTE = {
    snow:         '120, 140, 170',
    snowSparse:   '130, 150, 175',
    rain:         '100, 120, 150',
    fog:          '120, 135, 155',
    star:         '140, 155, 185',
    leaf:         ['160, 100, 40', '180, 130, 50', '140, 80, 30', '200, 150, 70', '120, 60, 20'],
    mist:         '120, 135, 155',
    iceCrystal:   '120, 160, 200',
    iceGlow:      '100, 150, 200',
    waterSparkle: '100, 130, 170',
    steamFog:     '180, 195, 215',
    lightWarm:    '200, 150, 70',
    lightWarm2:   '190, 140, 60',
    lightWarm3:   '180, 120, 50',
    lightGreen:   '80, 140, 100',
    core:         '255, 240, 200'
  };

  function pal() { return currentTheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE; }

  // ========== 雪花 ==========
  class Snowflake {
    constructor(opts = {}) {
      this.density = opts.density || 'normal';
      this.reset(true);
    }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : -10;
      let rMin, rMax, sMin, sMax;
      if (this.density === 'dense')        { rMin = 0.5; rMax = 3;   sMin = 0.4; sMax = 1.5; }
      else if (this.density === 'sparse')  { rMin = 0.3; rMax = 1.5; sMin = 0.1; sMax = 0.4; }
      else                                  { rMin = 0.5; rMax = 2.5; sMin = 0.2; sMax = 0.8; }
      this.r = Math.random() * (rMax - rMin) + rMin;
      this.speed = Math.random() * (sMax - sMin) + sMin;
      this.wind = Math.random() * 0.3 - 0.15;
      this.opacity = Math.random() * 0.4 + 0.1;
    }
    update() {
      this.y += this.speed;
      this.x += this.wind + Math.sin(this.y * 0.005) * 0.2;
      if (this.y > H + 10 || this.x < -10 || this.x > W + 10) this.reset(false);
    }
    draw() {
      const color = this.density === 'sparse' ? pal().snowSparse : pal().snow;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${this.opacity})`;
      ctx.fill();
    }
  }

  // ========== 雨滴 ==========
  class Raindrop {
    constructor(opts = {}) {
      this.fine = opts.fine || false;
      this.reset(true);
    }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : -20;
      this.len = this.fine ? Math.random() * 12 + 4 : Math.random() * 18 + 8;
      this.speed = this.fine ? Math.random() * 3 + 5 : Math.random() * 4 + 6;
      this.opacity = this.fine ? Math.random() * 0.1 + 0.03 : Math.random() * 0.15 + 0.05;
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
      ctx.strokeStyle = `rgba(${pal().rain}, ${this.opacity})`;
      ctx.lineWidth = this.fine ? 0.5 : 0.8;
      ctx.stroke();
    }
  }

  // ========== 雾气 ==========
  class FogParticle {
    constructor(opts = {}) {
      this.large = opts.large || false;
      this.reset(true);
    }
    reset(init) {
      this.x = init ? Math.random() * W : (Math.random() > 0.5 ? -200 : W + 200);
      this.y = Math.random() * H;
      this.r = this.large ? Math.random() * 200 + 120 : Math.random() * 150 + 80;
      this.speed = Math.random() * 0.3 + 0.1;
      this.dir = this.x < W / 2 ? 1 : -1;
      this.opacity = this.large ? Math.random() * 0.04 + 0.02 : Math.random() * 0.03 + 0.01;
    }
    update() {
      this.x += this.speed * this.dir;
      if (this.x > W + 300 || this.x < -300) this.reset(false);
    }
    draw() {
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
      grad.addColorStop(0, `rgba(${pal().fog}, ${this.opacity})`);
      grad.addColorStop(1, `rgba(${pal().fog}, 0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ========== 极光 ==========
  class AuroraWave {
    constructor(opts = {}) {
      this.index = opts.index || 0;
      this.total = opts.total || 5;
      this.baseY = H * 0.15 + (H * 0.35 * this.index / this.total);
      this.amplitude = 35 + Math.random() * 45;
      this.frequency = 0.002 + Math.random() * 0.002;
      this.speed = 0.004 + Math.random() * 0.004;
      this.phase = Math.random() * Math.PI * 2;
      this.hue = 130 + this.index * 18;
      this.opacity = 0.035 + Math.random() * 0.02;
      // 浅色模式下极光更柔和
      this.lightOpacity = 0.06 + Math.random() * 0.03;
    }
    update() { this.phase += this.speed; }
    draw() {
      const op = currentTheme === 'light' ? this.lightOpacity : this.opacity;
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
      grad.addColorStop(0.4, `hsla(${this.hue}, 70%, 55%, ${op})`);
      grad.addColorStop(1, `hsla(${this.hue}, 70%, 55%, 0)`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ========== 星星 ==========
  class Star {
    constructor(opts = {}) {
      this.dim = opts.dim || false;
      this.reset(true);
    }
    reset(init) {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1.5 + 0.3;
      this.baseOpacity = this.dim ? Math.random() * 0.25 + 0.1 : Math.random() * 0.5 + 0.2;
      this.twinkleSpeed = Math.random() * 0.02 + 0.005;
      this.twinklePhase = Math.random() * Math.PI * 2;
    }
    update() { this.twinklePhase += this.twinkleSpeed; }
    draw() {
      const opacity = this.baseOpacity * (0.5 + 0.5 * Math.sin(this.twinklePhase));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${pal().star}, ${opacity})`;
      ctx.fill();
      if (this.r > 1.2) {
        ctx.beginPath();
        ctx.moveTo(this.x - this.r * 2, this.y);
        ctx.lineTo(this.x + this.r * 2, this.y);
        ctx.moveTo(this.x, this.y - this.r * 2);
        ctx.lineTo(this.x, this.y + this.r * 2);
        ctx.strokeStyle = `rgba(${pal().star}, ${opacity * 0.3})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  // ========== 落叶 ==========
  class Leaf {
    constructor(opts = {}) { this.reset(true); }
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
      this.colorIdx = Math.floor(Math.random() * 5);
    }
    update() {
      this.y += this.speedY;
      this.swayPhase += this.swayFreq;
      this.x += this.speedX + Math.sin(this.swayPhase) * 0.5;
      this.rotation += this.rotSpeed;
      if (this.y > H + 20) this.reset(false);
    }
    draw() {
      const colors = pal().leaf;
      const color = colors[this.colorIdx];
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.beginPath();
      ctx.ellipse(0, 0, this.size, this.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${this.opacity})`;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-this.size, 0);
      ctx.lineTo(this.size, 0);
      ctx.strokeStyle = `rgba(${color}, ${this.opacity * 0.5})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // ========== 暖色光点（路灯/篝火等氛围光源） ==========
  class LightGlow {
    constructor(opts = {}) {
      this.colorKey = opts.colorKey || 'lightWarm';
      this.flicker = opts.flicker !== false;
      this.reset(true);
    }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : H + 20;
      this.r = Math.random() * 2 + 1.5;
      this.speedX = (Math.random() - 0.5) * 0.15;
      this.speedY = -(Math.random() * 0.1 + 0.02);
      this.glowPhase = Math.random() * Math.PI * 2;
      this.glowSpeed = Math.random() * 0.02 + 0.008;
      this.maxOpacity = Math.random() * 0.5 + 0.2;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.glowPhase += this.glowSpeed;
      if (this.y < -20 || this.x < -20 || this.x > W + 20) this.reset(false);
    }
    draw() {
      const color = pal()[this.colorKey] || pal().lightWarm;
      const opacity = this.flicker
        ? this.maxOpacity * (0.3 + 0.7 * Math.abs(Math.sin(this.glowPhase)))
        : this.maxOpacity;
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 4);
      grad.addColorStop(0, `rgba(${color}, ${opacity})`);
      grad.addColorStop(0.5, `rgba(${color}, ${opacity * 0.3})`);
      grad.addColorStop(1, `rgba(${color}, 0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${pal().core}, ${opacity})`;
      ctx.fill();
    }
  }

  // ========== 冰晶闪烁 ==========
  class IceCrystal {
    constructor(opts = {}) { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1.5 + 0.5;
      this.twinkleSpeed = Math.random() * 0.03 + 0.01;
      this.twinklePhase = Math.random() * Math.PI * 2;
      this.maxOpacity = Math.random() * 0.6 + 0.2;
      this.rotation = Math.random() * Math.PI;
    }
    update() {
      this.twinklePhase += this.twinkleSpeed;
      this.rotation += 0.002;
    }
    draw() {
      const opacity = this.maxOpacity * (0.2 + 0.8 * Math.abs(Math.sin(this.twinklePhase)));
      if (opacity < 0.02) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.beginPath();
      ctx.moveTo(0, -this.r * 2);
      ctx.lineTo(this.r, 0);
      ctx.lineTo(0, this.r * 2);
      ctx.lineTo(-this.r, 0);
      ctx.closePath();
      ctx.fillStyle = `rgba(${pal().iceCrystal}, ${opacity})`;
      ctx.fill();
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r * 3);
      grad.addColorStop(0, `rgba(${pal().iceGlow}, ${opacity * 0.3})`);
      grad.addColorStop(1, `rgba(${pal().iceGlow}, 0)`);
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }
  }

  // ========== 水面微光闪烁（湖面/海面反光） ==========
  class WaterSparkle {
    constructor(opts = {}) { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = H * 0.55 + Math.random() * H * 0.4;
      this.r = Math.random() * 1.5 + 0.3;
      this.twinkleSpeed = Math.random() * 0.05 + 0.02;
      this.twinklePhase = Math.random() * Math.PI * 2;
      this.maxOpacity = Math.random() * 0.5 + 0.15;
      this.hStretch = Math.random() * 3 + 2;
    }
    update() { this.twinklePhase += this.twinkleSpeed; }
    draw() {
      const opacity = this.maxOpacity * Math.abs(Math.sin(this.twinklePhase));
      if (opacity < 0.01) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.hStretch, 1);
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${pal().waterSparkle}, ${opacity})`;
      ctx.fill();
      ctx.restore();
    }
  }

  // ========== 温泉雾气（底部上升的白色蒸汽） ==========
  class SteamFog {
    constructor(opts = {}) { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : H + Math.random() * 50;
      this.r = Math.random() * 60 + 30;
      this.speed = Math.random() * 0.4 + 0.15;
      this.opacity = Math.random() * 0.04 + 0.015;
      this.maxLife = Math.random() * 300 + 200;
      this.life = init ? Math.random() * this.maxLife : 0;
      this.driftX = (Math.random() - 0.5) * 0.1;
    }
    update() {
      this.y -= this.speed;
      this.x += this.driftX;
      this.life++;
      this.r += 0.15;
      if (this.life > this.maxLife || this.y < -100) this.reset(false);
    }
    draw() {
      const lifeRatio = this.life / this.maxLife;
      const fadeOpacity = this.opacity * Math.sin(lifeRatio * Math.PI);
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
      grad.addColorStop(0, `rgba(${pal().steamFog}, ${fadeOpacity})`);
      grad.addColorStop(1, `rgba(${pal().steamFog}, 0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ========== 极细水雾粒子 ==========
  class MistParticle {
    constructor(opts = {}) { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1 + 0.3;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.15;
      this.opacity = Math.random() * 0.08 + 0.02;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < 0) this.x = W;
      if (this.x > W) this.x = 0;
      if (this.y < 0) this.y = H;
      if (this.y > H) this.y = 0;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${pal().mist}, ${this.opacity})`;
      ctx.fill();
    }
  }

  // ========== 主题配置：每个主题的粒子层组合 ==========
  const THEME_CONFIG = {
    // 1. 魁北克 — 飘雪 + 暖黄光点（老城路灯）
    quebec: {
      layers: [
        { type: 'snow',      count: 80,  opts: { density: 'normal' } },
        { type: 'lightGlow', count: 12,  opts: { colorKey: 'lightWarm', flicker: true } }
      ]
    },
    // 2. 爱丁堡 — 细雨 + 浓雾 + 暖色光点（路灯）
    edinburgh: {
      layers: [
        { type: 'fog',       count: 20,  opts: {} },
        { type: 'rain',      count: 120, opts: {} },
        { type: 'lightGlow', count: 10,  opts: { colorKey: 'lightWarm2', flicker: true } }
      ]
    },
    // 3. 罗佛敦 — 稀疏雪花 + 极光波纹 + 微弱星光
    lofoten: {
      layers: [
        { type: 'star',      count: 50,  opts: { dim: true } },
        { type: 'aurora',    count: 4,   opts: { total: 4 } },
        { type: 'snow',      count: 40,  opts: { density: 'sparse' } }
      ]
    },
    // 4. 箭镇 — 金色落叶旋转飘落 + 稀疏暖色光粒子
    arrowtown: {
      layers: [
        { type: 'leaf',      count: 50,  opts: {} },
        { type: 'lightGlow', count: 12,  opts: { colorKey: 'lightWarm3', flicker: true } }
      ]
    },
    // 5. 伦敦 — 极细密雨丝 + 浓雾 + 偶尔闪烁暖色光点
    london: {
      layers: [
        { type: 'fog',       count: 25,  opts: {} },
        { type: 'rain',      count: 150, opts: { fine: true } },
        { type: 'lightGlow', count: 8,   opts: { colorKey: 'lightWarm2', flicker: true } }
      ]
    },
    // 6. 赫尔辛基 — 缓慢飘雪 + 冰晶闪烁 + 水面微光（湖面反光）
    helsinki: {
      layers: [
        { type: 'snow',         count: 60, opts: { density: 'sparse' } },
        { type: 'iceCrystal',   count: 40, opts: {} },
        { type: 'waterSparkle', count: 30, opts: {} }
      ]
    },
    // 7. 卑尔根 — 浓雾层 + 极细水雾粒子 + 深绿色微光
    bergen: {
      layers: [
        { type: 'fog',       count: 30, opts: { large: true } },
        { type: 'mist',      count: 80, opts: {} },
        { type: 'lightGlow', count: 10, opts: { colorKey: 'lightGreen', flicker: true } }
      ]
    },
    // 8. 斯德哥尔摩 — 极稀疏雪花 + 水面微光 + 薄雾
    stockholm: {
      layers: [
        { type: 'fog',          count: 15, opts: {} },
        { type: 'waterSparkle', count: 50, opts: {} },
        { type: 'snow',         count: 25, opts: { density: 'sparse' } }
      ]
    },
    // 9. 北海道 — 密集暴雪 + 温泉雾气 + 暖黄光点
    hokkaido: {
      layers: [
        { type: 'steamFog',  count: 20,  opts: {} },
        { type: 'snow',      count: 150, opts: { density: 'dense' } },
        { type: 'lightGlow', count: 12,  opts: { colorKey: 'lightWarm', flicker: true } }
      ]
    }
  };

  // ========== 粒子工厂 ==========
  function createParticle(type, opts) {
    switch (type) {
      case 'snow':         return new Snowflake(opts);
      case 'rain':         return new Raindrop(opts);
      case 'fog':          return new FogParticle(opts);
      case 'aurora':       return new AuroraWave(opts);
      case 'star':         return new Star(opts);
      case 'leaf':         return new Leaf(opts);
      case 'lightGlow':    return new LightGlow(opts);
      case 'iceCrystal':   return new IceCrystal(opts);
      case 'waterSparkle': return new WaterSparkle(opts);
      case 'steamFog':     return new SteamFog(opts);
      case 'mist':         return new MistParticle(opts);
      default:             return null;
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
    const config = THEME_CONFIG[mode];
    if (!config) return;

    for (const layer of config.layers) {
      for (let i = 0; i < layer.count; i++) {
        const opts = Object.assign({}, layer.opts);
        if (layer.type === 'aurora') {
          opts.index = i;
        }
        const p = createParticle(layer.type, opts);
        if (p) particles.push(p);
      }
    }

    console.log(`[BgEffects] ${mode} (${currentTheme}): ${particles.length} particles`);
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
   * @param {string} mode - none/quebec/edinburgh/lofoten/arrowtown/london/helsinki/bergen/stockholm/hokkaido
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

    console.log('[BgEffects] 已切换至:', mode, '| theme:', currentTheme);
  }

  /**
   * 设置明暗主题（浅色/深色模式切换时调用）
   * 会重新初始化粒子以应用新配色
   * @param {string} theme - 'light' | 'dark'
   */
  function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return;
    if (theme === currentTheme) return;
    currentTheme = theme;
    // 如果当前有活跃的背景模式，重新初始化粒子以应用新配色
    if (currentMode && currentMode !== 'none') {
      initParticles(currentMode);
    }
    console.log('[BgEffects] 主题已切换至:', currentTheme);
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

  return { init, switchMode, setTheme, getMode, destroy };
})();
