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
  let visibilityHandler = null;

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
    core:         '255, 250, 230',
    // === 国风/自然风景主题色 ===
    ink:            '60, 65, 70',
    inkLight:       '100, 105, 110',
    inkWash:        '140, 145, 150',
    ochre:          '180, 140, 100',
    moonGlow:       '240, 235, 200',
    lotusLeaf:      '40, 80, 60',
    moonRipple:     '180, 200, 220',
    jiangnanWall:   '200, 195, 185',
    jiangnanTile:   '70, 75, 80',
    willowGreen:    '100, 140, 110',
    peachPetal:     '255, 180, 200',
    peachPetalDeep: '230, 140, 170',
    zenSand:        '230, 220, 200',
    zenStone:       '120, 115, 110',
    zenMoss:        '80, 120, 80',
    bambooGreen:    '60, 120, 80',
    bambooLight:    '100, 160, 110',
    bambooMist:     '150, 170, 160',
    wheatGold:      '220, 170, 60',
    wheatDeep:      '180, 130, 40',
    sunsetGlow:     '255, 150, 80',
    lanternRed:     '200, 60, 50',
    lanternGlow:    '255, 100, 80',
    plumBlossom:    '230, 150, 160',
    courtWall:      '180, 175, 170'
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
    core:         '255, 240, 200',
    // === 国风/自然风景主题色（浅色模式） ===
    ink:            '100, 105, 110',
    inkLight:       '140, 145, 150',
    inkWash:        '180, 185, 190',
    ochre:          '200, 160, 120',
    moonGlow:       '220, 215, 180',
    lotusLeaf:      '70, 110, 90',
    moonRipple:     '140, 170, 200',
    jiangnanWall:   '210, 205, 195',
    jiangnanTile:   '110, 115, 120',
    willowGreen:    '130, 170, 140',
    peachPetal:     '255, 200, 215',
    peachPetalDeep: '240, 170, 190',
    zenSand:        '245, 235, 215',
    zenStone:       '160, 155, 150',
    zenMoss:        '110, 150, 110',
    bambooGreen:    '90, 150, 110',
    bambooLight:    '130, 180, 140',
    bambooMist:     '180, 200, 190',
    wheatGold:      '240, 190, 90',
    wheatDeep:      '210, 160, 60',
    sunsetGlow:     '255, 180, 120',
    lanternRed:     '220, 80, 70',
    lanternGlow:    '255, 130, 110',
    plumBlossom:    '240, 180, 190',
    courtWall:      '210, 205, 200'
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
  
  // ========== 云雾墨团（水墨山水/烟雨江南/竹林雨雾） ==========
  class InkCloud {
    constructor(opts = {}) {
      this.speed = opts.speed || 0.15;
      this.size = opts.size || 120;
      this.opacity = opts.opacity || 0.15;
      this.colorKey = opts.colorKey || 'inkWash';
      this.yRatio = opts.yRatio || 0.5;
      this.reset(true);
    }
    reset(init) {
      this.x = init ? Math.random() * W : -this.size * 2;
      this.y = H * this.yRatio + (Math.random() - 0.5) * H * 0.15;
      this.w = this.size + Math.random() * this.size * 0.5;
      this.h = this.size * 0.4 + Math.random() * this.size * 0.2;
      this.speedX = this.speed + Math.random() * this.speed * 0.5;
      this.phase = Math.random() * Math.PI * 2;
    }
    update() {
      this.x += this.speedX;
      this.phase += 0.002;
      this.y += Math.sin(this.phase) * 0.3;
      if (this.x > W + this.size * 2) this.reset(false);
    }
    draw() {
      const color = pal()[this.colorKey] || pal().inkWash;
      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, this.w * 0.6
      );
      gradient.addColorStop(0, `rgba(${color}, ${this.opacity * 0.8})`);
      gradient.addColorStop(0.5, `rgba(${color}, ${this.opacity * 0.4})`);
      gradient.addColorStop(1, `rgba(${color}, 0)`);
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.w * 0.6, this.h, 0, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  // ========== 山峦轮廓层（水墨山水/星河倒影） ==========
  class MountainLayer {
    constructor(opts = {}) {
      this.layerIndex = opts.index || 0;
      this.layerCount = opts.total || 3;
      this.colorKey = opts.colorKey || 'ink';
      this.opacity = opts.opacity || 0.3;
      this.generatePeaks();
    }
    generatePeaks() {
      this.peaks = [];
      const peakCount = 5 + this.layerIndex * 2;
      const baseY = 0.5 + this.layerIndex * 0.12;
      const height = 0.25 - this.layerIndex * 0.06;
      for (let i = 0; i <= peakCount; i++) {
        const x = i / peakCount;
        const y = baseY - height * (0.3 + Math.random() * 0.7);
        this.peaks.push({ x, y });
      }
    }
    update() {}
    draw() {
      const color = pal()[this.colorKey] || pal().ink;
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(this.peaks[0].x * W, this.peaks[0].y * H);
      for (let i = 1; i < this.peaks.length; i++) {
        const prev = this.peaks[i - 1];
        const curr = this.peaks[i];
        const cpx = (prev.x + curr.x) / 2 * W;
        const cpy = (prev.y + curr.y) / 2 * H;
        ctx.quadraticCurveTo(cpx, cpy, curr.x * W, curr.y * H);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, `rgba(${color}, ${this.opacity})`);
      gradient.addColorStop(1, `rgba(${color}, ${this.opacity * 0.5})`);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  // ========== 月晕（月下荷塘/星河倒影） ==========
  class MoonHalo {
    constructor(opts = {}) {
      this.colorKey = opts.colorKey || 'moonGlow';
      this.sizeRatio = opts.sizeRatio || 0.08;
      this.xRatio = opts.xRatio || 0.75;
      this.yRatio = opts.yRatio || 0.15;
      this.phase = Math.random() * Math.PI * 2;
    }
    update() {
      this.phase += 0.001;
    }
    draw() {
      const color = pal()[this.colorKey] || pal().moonGlow;
      const cx = W * this.xRatio;
      const cy = H * this.yRatio;
      const r = Math.min(W, H) * this.sizeRatio;
      const pulse = 1 + Math.sin(this.phase) * 0.05;
      const outerGrad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 4 * pulse);
      outerGrad.addColorStop(0, `rgba(${color}, 0.25)`);
      outerGrad.addColorStop(0.4, `rgba(${color}, 0.08)`);
      outerGrad.addColorStop(1, `rgba(${color}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 4 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = outerGrad;
      ctx.fill();
      const moonGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
      moonGrad.addColorStop(0, `rgba(${color}, 1)`);
      moonGrad.addColorStop(0.7, `rgba(${color}, 0.95)`);
      moonGrad.addColorStop(1, `rgba(${color}, 0.7)`);
      ctx.beginPath();
      ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = moonGrad;
      ctx.fill();
    }
  }

  // ========== 荷叶剪影（月下荷塘） ==========
  class LotusSilhouette {
    constructor(opts = {}) {
      this.colorKey = opts.colorKey || 'lotusLeaf';
      this.opacity = opts.opacity || 0.4;
      this.reset(true);
    }
    reset(init) {
      this.x = Math.random() * W;
      this.y = H * (0.65 + Math.random() * 0.25);
      this.size = 20 + Math.random() * 35;
      this.swayPhase = Math.random() * Math.PI * 2;
      this.swaySpeed = 0.002 + Math.random() * 0.002;
    }
    update() {
      this.swayPhase += this.swaySpeed;
    }
    draw() {
      const color = pal()[this.colorKey] || pal().lotusLeaf;
      const sway = Math.sin(this.swayPhase) * 2;
      ctx.save();
      ctx.translate(this.x + sway, this.y);
      ctx.beginPath();
      ctx.ellipse(0, 0, this.size, this.size * 0.6, 0, Math.PI * 0.15, Math.PI * 1.85);
      ctx.closePath();
      ctx.fillStyle = `rgba(${color}, ${this.opacity})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${color}, ${this.opacity * 1.5})`;
      ctx.lineWidth = 0.8;
      for (let a = 0.3; a < Math.PI * 1.7; a += 0.4) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * this.size * 0.8, Math.sin(a) * this.size * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ========== 水面波纹（月下荷塘/烟雨江南） ==========
  class WaterRipple {
    constructor(opts = {}) {
      this.colorKey = opts.colorKey || 'moonRipple';
      this.opacity = opts.opacity || 0.3;
      this.yRatio = opts.yRatio || 0.75;
      this.reset(true);
    }
    reset(init) {
      this.x = Math.random() * W;
      this.y = H * (this.yRatio + Math.random() * 0.15);
      this.radius = init ? Math.random() * 40 : 2;
      this.maxRadius = 30 + Math.random() * 50;
      this.speed = 0.15 + Math.random() * 0.2;
      this.opacityCurrent = this.opacity;
    }
    update() {
      this.radius += this.speed;
      this.opacityCurrent = this.opacity * (1 - this.radius / this.maxRadius);
      if (this.radius >= this.maxRadius) this.reset(false);
    }
    draw() {
      if (this.opacityCurrent <= 0) return;
      const color = pal()[this.colorKey] || pal().moonRipple;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius, this.radius * 0.3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${color}, ${this.opacityCurrent})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ========== 桃花花瓣（桃花雨） ==========
  class PeachPetal {
    constructor(opts = {}) {
      this.reset(true);
    }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : -20;
      this.size = 6 + Math.random() * 8;
      this.speed = 0.4 + Math.random() * 0.6;
      this.wind = 0.2 + Math.random() * 0.3;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotSpeed = (Math.random() - 0.5) * 0.02;
      this.swayPhase = Math.random() * Math.PI * 2;
      this.swaySpeed = 0.01 + Math.random() * 0.01;
      this.deepColor = Math.random() > 0.5;
      this.opacity = 0.5 + Math.random() * 0.4;
    }
    update() {
      this.y += this.speed;
      this.swayPhase += this.swaySpeed;
      this.x += this.wind + Math.sin(this.swayPhase) * 0.5;
      this.rotation += this.rotSpeed;
      if (this.y > H + 20 || this.x < -30 || this.x > W + 30) this.reset(false);
    }
    draw() {
      const color = this.deepColor
        ? (pal().peachPetalDeep || '230, 140, 170')
        : (pal().peachPetal || '255, 180, 200');
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.beginPath();
      ctx.moveTo(0, -this.size * 0.5);
      ctx.bezierCurveTo(
        this.size * 0.6, -this.size * 0.3,
        this.size * 0.4, this.size * 0.5,
        0, this.size * 0.5
      );
      ctx.bezierCurveTo(
        -this.size * 0.4, this.size * 0.5,
        -this.size * 0.6, -this.size * 0.3,
        0, -this.size * 0.5
      );
      ctx.fillStyle = `rgba(${color}, ${this.opacity})`;
      ctx.fill();
      ctx.restore();
    }
  }

  // ========== 枯山水砂纹涟漪（枯山水） ==========
  class ZenRipple {
    constructor(opts = {}) {
      this.centerX = opts.centerX || 0.5;
      this.centerY = opts.centerY || 0.5;
      this.colorKey = opts.colorKey || 'zenStone';
      this.opacity = opts.opacity || 0.15;
      this.phase = Math.random() * Math.PI * 2;
      this.speed = opts.speed || 0.003;
    }
    update() {
      this.phase += this.speed;
    }
    draw() {
      const color = pal()[this.colorKey] || pal().zenStone;
      const cx = W * this.centerX;
      const cy = H * this.centerY;
      const maxR = Math.min(W, H) * 0.4;
      for (let i = 0; i < 12; i++) {
        const offset = (this.phase * 30 + i * 25) % 300;
        const r = 10 + offset;
        if (r > maxR) continue;
        const alpha = this.opacity * (1 - r / maxR);
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color}, ${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }

  // ========== 枯山水苔石（枯山水） ==========
  class ZenStone {
    constructor(opts = {}) {
      const idx = opts.index || 0;
      const positions = [
        { x: 0.25, y: 0.55, s: 50 },
        { x: 0.45, y: 0.62, s: 35 },
        { x: 0.65, y: 0.58, s: 45 },
        { x: 0.35, y: 0.7, s: 30 },
        { x: 0.55, y: 0.72, s: 25 }
      ];
      const pos = positions[idx % positions.length];
      this.xRatio = opts.xRatio || pos.x;
      this.yRatio = opts.yRatio || pos.y;
      this.size = opts.size || pos.s;
      this.stoneColor = opts.stoneColor || 'zenStone';
      this.mossColor = opts.mossColor || 'zenMoss';
    }
    update() {}
    draw() {
      const cx = W * this.xRatio;
      const cy = H * this.yRatio;
      const stoneColor = pal()[this.stoneColor] || pal().zenStone;
      const mossColor = pal()[this.mossColor] || pal().zenMoss;
      ctx.beginPath();
      ctx.ellipse(cx, cy, this.size, this.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${stoneColor}, 0.6)`;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy - this.size * 0.2, this.size * 0.7, this.size * 0.25, 0, Math.PI, 0);
      ctx.fillStyle = `rgba(${mossColor}, 0.5)`;
      ctx.fill();
    }
  }

  // ========== 竹子剪影（竹林雨雾） ==========
  class BambooStalk {
    constructor(opts = {}) {
      const idx = opts.index || 0;
      const total = opts.total || 12;
      const layerIdx = idx % 3;
      const colIdx = Math.floor(idx / 3);
      const cols = Math.ceil(total / 3);
      this.xRatio = opts.xRatio || (0.05 + (colIdx / (cols - 1 || 1)) * 0.9 + (Math.random() - 0.5) * 0.05);
      this.layer = opts.layer !== undefined ? opts.layer : layerIdx;
      this.colorKey = opts.colorKey || 'bambooGreen';
      const layerOpacity = [0.2, 0.35, 0.5];
      this.opacity = opts.opacity || layerOpacity[this.layer];
      this.swayPhase = Math.random() * Math.PI * 2;
      this.swaySpeed = 0.002 + this.layer * 0.001;
      this.generateSegments();
    }
    generateSegments() {
      this.segments = 6 + Math.floor(Math.random() * 4);
      this.segHeight = (H * 0.7) / this.segments;
      this.stalkWidth = 6 + this.layer * 4 + Math.random() * 4;
    }
    update() {
      this.swayPhase += this.swaySpeed;
    }
    draw() {
      const color = pal()[this.colorKey] || pal().bambooGreen;
      const baseX = W * this.xRatio;
      const baseY = H;
      const sway = Math.sin(this.swayPhase) * (3 + this.layer * 2);
      ctx.save();
      ctx.strokeStyle = `rgba(${color}, ${this.opacity})`;
      ctx.fillStyle = `rgba(${color}, ${this.opacity})`;
      ctx.lineWidth = this.stalkWidth;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      for (let i = 1; i <= this.segments; i++) {
        const y = baseY - i * this.segHeight;
        const x = baseX + sway * (i / this.segments);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = this.stalkWidth * 1.4;
      ctx.globalAlpha = this.opacity * 0.5;
      for (let i = 1; i < this.segments; i++) {
        const y = baseY - i * this.segHeight;
        const x = baseX + sway * (i / this.segments);
        ctx.beginPath();
        ctx.moveTo(x - this.stalkWidth * 0.7, y);
        ctx.lineTo(x + this.stalkWidth * 0.7, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (this.layer >= 1) {
        const topY = baseY - this.segments * this.segHeight;
        const topX = baseX + sway;
        for (let j = 0; j < 3; j++) {
          const angle = -Math.PI / 2 + (j - 1) * 0.5;
          const leafLen = 20 + this.layer * 10;
          ctx.beginPath();
          ctx.moveTo(topX, topY + j * 15);
          ctx.quadraticCurveTo(
            topX + Math.cos(angle) * leafLen * 0.5,
            topY + j * 15 + Math.sin(angle) * leafLen * 0.3,
            topX + Math.cos(angle) * leafLen,
            topY + j * 15 + Math.sin(angle) * leafLen * 0.5
          );
          ctx.lineWidth = 2 + this.layer;
          ctx.strokeStyle = `rgba(${color}, ${this.opacity * 0.8})`;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // ========== 金色麦浪（金色麦浪） ==========
  class WheatStalk {
    constructor(opts = {}) {
      const idx = opts.index || 0;
      const total = opts.total || 40;
      const layerIdx = idx % 3;
      const colIdx = Math.floor(idx / 3);
      const cols = Math.ceil(total / 3);
      this.xRatio = opts.xRatio || (-0.05 + (colIdx / (cols - 1 || 1)) * 1.1 + (Math.random() - 0.5) * 0.03);
      this.layer = opts.layer !== undefined ? opts.layer : layerIdx;
      const heights = [0.2, 0.3, 0.42];
      this.heightRatio = opts.heightRatio || heights[this.layer];
      const colorKeys = ['wheatDeep', 'wheatGold', 'wheatGold'];
      this.colorKey = opts.colorKey || colorKeys[this.layer];
      const layerOpacity = [0.4, 0.55, 0.7];
      this.opacity = opts.opacity || layerOpacity[this.layer];
      this.swayPhase = Math.random() * Math.PI * 2;
      this.swaySpeed = 0.015 + Math.random() * 0.01;
      this.swayAmount = 8 + this.layer * 4;
    }
    update() {
      this.swayPhase += this.swaySpeed;
    }
    draw() {
      const color = pal()[this.colorKey] || pal().wheatGold;
      const baseX = W * this.xRatio;
      const baseY = H;
      const stalkHeight = H * this.heightRatio;
      const sway = Math.sin(this.swayPhase) * this.swayAmount;
      ctx.save();
      ctx.strokeStyle = `rgba(${color}, ${this.opacity})`;
      ctx.lineWidth = 1.5 + this.layer * 0.5;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(
        baseX + sway * 0.3, baseY - stalkHeight * 0.5,
        baseX + sway, baseY - stalkHeight
      );
      ctx.stroke();
      const tipX = baseX + sway;
      const tipY = baseY - stalkHeight;
      ctx.fillStyle = `rgba(${color}, ${this.opacity * 0.9})`;
      ctx.beginPath();
      ctx.ellipse(tipX, tipY - 5, 4 + this.layer, 10 + this.layer * 2, sway * 0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${color}, ${this.opacity * 0.7})`;
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.3 + sway * 0.01;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY - 5);
        ctx.lineTo(tipX + Math.cos(a) * (12 + this.layer * 3), tipY - 5 + Math.sin(a) * (12 + this.layer * 3));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ========== 红灯笼微光（雪落庭院） ==========
  class LanternGlow {
    constructor(opts = {}) {
      const idx = opts.index || 0;
      const positions = [
        { x: 0.15, y: 0.3, s: 0.022 },
        { x: 0.85, y: 0.28, s: 0.025 }
      ];
      const pos = positions[idx % positions.length];
      this.xRatio = opts.xRatio || pos.x;
      this.yRatio = opts.yRatio || pos.y;
      this.sizeRatio = opts.sizeRatio || pos.s;
      this.colorKey = opts.colorKey || 'lanternRed';
      this.glowKey = opts.glowKey || 'lanternGlow';
      this.phase = Math.random() * Math.PI * 2;
    }
    update() {
      this.phase += 0.004;
    }
    draw() {
      const red = pal()[this.colorKey] || pal().lanternRed;
      const glow = pal()[this.glowKey] || pal().lanternGlow;
      const cx = W * this.xRatio;
      const cy = H * this.yRatio;
      const r = Math.min(W, H) * this.sizeRatio;
      const flicker = 1 + Math.sin(this.phase) * 0.08 + Math.sin(this.phase * 2.3) * 0.04;
      const haloGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 8 * flicker);
      haloGrad.addColorStop(0, `rgba(${glow}, 0.2)`);
      haloGrad.addColorStop(0.5, `rgba(${red}, 0.06)`);
      haloGrad.addColorStop(1, `rgba(${red}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 8 * flicker, 0, Math.PI * 2);
      ctx.fillStyle = haloGrad;
      ctx.fill();
      ctx.strokeStyle = `rgba(${red}, 0.4)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, cy - r * 1.8);
      ctx.stroke();
      ctx.fillStyle = `rgba(${red}, 0.7)`;
      ctx.fillRect(cx - r * 0.5, cy - r * 1.8, r, r * 0.4);
      const bodyGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.2, r * 0.2, cx, cy, r * 1.5);
      bodyGrad.addColorStop(0, `rgba(${glow}, 0.9)`);
      bodyGrad.addColorStop(0.5, `rgba(${red}, 0.85)`);
      bodyGrad.addColorStop(1, `rgba(${red}, 0.6)`);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.2 * flicker, r * 1.8 * flicker, 0, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.fillStyle = `rgba(${red}, 0.7)`;
      ctx.fillRect(cx - r * 0.4, cy + r * 1.6, r * 0.8, r * 0.3);
      ctx.strokeStyle = `rgba(${red}, 0.6)`;
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * r * 0.15, cy + r * 1.9);
        ctx.lineTo(cx + i * r * 0.15 + Math.sin(this.phase + i) * 2, cy + r * 2.8);
        ctx.stroke();
      }
    }
  }

  // ========== 梅花枝（雪落庭院） ==========
  class PlumBranch {
    constructor(opts = {}) {
      const idx = opts.index || 0;
      this.xRatio = opts.xRatio || (idx % 2 === 0 ? 0.92 : 0.08);
      this.yRatio = opts.yRatio || 0.08;
      this.colorKey = opts.colorKey || 'courtWall';
      this.flowerKey = opts.flowerKey || 'plumBlossom';
      this.generateBranch();
    }
    generateBranch() {
      this.branches = [];
      const dir = this.xRatio > 0.5 ? -1 : 1;
      const main = {
        x1: W * this.xRatio,
        y1: H * this.yRatio,
        x2: W * this.xRatio + dir * W * 0.25,
        y2: H * (this.yRatio + 0.15)
      };
      this.branches.push(main);
      for (let i = 0; i < 4; i++) {
        const t = 0.2 + i * 0.2;
        const bx = main.x1 + (main.x2 - main.x1) * t;
        const by = main.y1 + (main.y2 - main.y1) * t;
        const len = 20 + Math.random() * 30;
        const angle = Math.PI * 0.7 + Math.random() * 0.6;
        this.branches.push({
          x1: bx, y1: by,
          x2: bx + Math.cos(angle) * len,
          y2: by + Math.sin(angle) * len
        });
      }
      this.flowers = [];
      for (let i = 0; i < 8; i++) {
        const br = this.branches[1 + Math.floor(Math.random() * (this.branches.length - 1))];
        const t = 0.3 + Math.random() * 0.5;
        this.flowers.push({
          x: br.x1 + (br.x2 - br.x1) * t,
          y: br.y1 + (br.y2 - br.y1) * t,
          size: 4 + Math.random() * 4,
          bloom: Math.random()
        });
      }
    }
    update() {}
    draw() {
      const branchColor = pal()[this.colorKey] || pal().courtWall;
      const flowerColor = pal()[this.flowerKey] || pal().plumBlossom;
      ctx.strokeStyle = `rgba(${branchColor}, 0.4)`;
      ctx.lineWidth = 2;
      for (const br of this.branches) {
        ctx.beginPath();
        ctx.moveTo(br.x1, br.y1);
        ctx.lineTo(br.x2, br.y2);
        ctx.stroke();
      }
      for (const f of this.flowers) {
        ctx.fillStyle = `rgba(${flowerColor}, 0.7)`;
        for (let p = 0; p < 5; p++) {
          const angle = (p / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.ellipse(
            f.x + Math.cos(angle) * f.size * 0.5,
            f.y + Math.sin(angle) * f.size * 0.5,
            f.size * 0.4, f.size * 0.6,
            angle, 0, Math.PI * 2
          );
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255, 220, 100, 0.8)';
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ========== 夕阳逆光（金色麦浪） ==========
  class SunlightGlow {
    constructor(opts = {}) {
      this.xRatio = opts.xRatio || 0.85;
      this.yRatio = opts.yRatio || 0.25;
      this.colorKey = opts.colorKey || 'sunsetGlow';
      this.sizeRatio = opts.sizeRatio || 0.15;
      this.phase = Math.random() * Math.PI * 2;
    }
    update() {
      this.phase += 0.001;
    }
    draw() {
      const color = pal()[this.colorKey] || pal().sunsetGlow;
      const cx = W * this.xRatio;
      const cy = H * this.yRatio;
      const r = Math.min(W, H) * this.sizeRatio;
      const pulse = 1 + Math.sin(this.phase) * 0.03;
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 3 * pulse);
      grad.addColorStop(0, `rgba(${color}, 0.3)`);
      grad.addColorStop(0.3, `rgba(${color}, 0.12)`);
      grad.addColorStop(1, `rgba(${color}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 3 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + this.phase * 0.1;
        const rayGrad = ctx.createLinearGradient(
          cx, cy,
          cx + Math.cos(angle) * r * 2, cy + Math.sin(angle) * r * 2
        );
        rayGrad.addColorStop(0, `rgba(${color}, 0.1)`);
        rayGrad.addColorStop(1, `rgba(${color}, 0)`);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle - 0.1) * r * 2.5, cy + Math.sin(angle - 0.1) * r * 2.5);
        ctx.lineTo(cx + Math.cos(angle + 0.1) * r * 2.5, cy + Math.sin(angle + 0.1) * r * 2.5);
        ctx.closePath();
        ctx.fillStyle = rayGrad;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ========== 星空倒影（星河倒影） ==========
  class StarReflection {
    constructor(opts = {}) {
      this.reset(true);
    }
    reset(init) {
      this.x = Math.random() * W;
      this.y = H * (0.55 + Math.random() * 0.4);
      this.size = 1 + Math.random() * 2;
      this.opacity = 0.1 + Math.random() * 0.3;
      this.twinkleSpeed = 0.01 + Math.random() * 0.02;
      this.twinklePhase = Math.random() * Math.PI * 2;
      this.stretch = 0.3 + Math.random() * 0.3;
    }
    update() {
      this.twinklePhase += this.twinkleSpeed;
    }
    draw() {
      const color = pal().star || '220, 230, 255';
      const twinkle = 0.5 + Math.sin(this.twinklePhase) * 0.5;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.size * 0.5, this.size * (1 + this.stretch), 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${this.opacity * twinkle})`;
      ctx.fill();
    }
  }

  // ========== 垂柳（烟雨江南） ==========
  class WillowBranch {
    constructor(opts = {}) {
      const idx = opts.index || 0;
      this.side = opts.side || (idx % 2 === 0 ? 'left' : 'right');
      this.xRatio = opts.xRatio || (this.side === 'left' ? 0.05 + idx * 0.015 : 0.95 - idx * 0.015);
      this.colorKey = opts.colorKey || 'willowGreen';
      this.opacity = opts.opacity || 0.3;
      this.swayPhase = Math.random() * Math.PI * 2;
      this.swaySpeed = 0.006;
      this.generateBranches();
    }
    generateBranches() {
      this.branches = [];
      const count = 6 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const startXR = this.xRatio + (this.side === 'left' ? 0.02 : -0.02) + (i / count) * (this.side === 'left' ? 0.08 : -0.08);
        const length = 0.15 + Math.random() * 0.2;
        this.branches.push({
          startX: W * startXR,
          startY: H * 0.05,
          length: H * length,
          swayAmount: 10 + Math.random() * 15,
          thickness: 1 + Math.random()
        });
      }
    }
    update() {
      this.swayPhase += this.swaySpeed;
    }
    draw() {
      const color = pal()[this.colorKey] || pal().willowGreen;
      ctx.strokeStyle = `rgba(${color}, ${this.opacity})`;
      for (const br of this.branches) {
        const sway = Math.sin(this.swayPhase + br.startX * 0.01) * br.swayAmount;
        ctx.lineWidth = br.thickness;
        ctx.beginPath();
        ctx.moveTo(br.startX, br.startY);
        ctx.quadraticCurveTo(
          br.startX + sway * 0.5, br.startY + br.length * 0.5,
          br.startX + sway, br.startY + br.length
        );
        ctx.stroke();
        ctx.fillStyle = `rgba(${color}, ${this.opacity * 0.8})`;
        for (let t = 0.2; t < 1; t += 0.15) {
          const lx = br.startX + sway * t;
          const ly = br.startY + br.length * t;
          const leafDir = (this.side === 'left' ? 1 : -1);
          ctx.beginPath();
          ctx.ellipse(lx + leafDir * 6, ly, 5, 1.5, sway * 0.02, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // ========== 白墙黛瓦剪影（烟雨江南） ==========
  class JiangnanBuilding {
    constructor(opts = {}) {
      const idx = opts.index || 0;
      const total = opts.total || 6;
      this.xRatio = opts.xRatio || (0.15 + (idx / (total - 1 || 1)) * 0.7 + (Math.random() - 0.5) * 0.03);
      this.widthRatio = opts.widthRatio || (0.08 + Math.random() * 0.06);
      this.heightRatio = opts.heightRatio || (0.18 + Math.random() * 0.12);
      this.layer = opts.layer || 0;
      this.wallColor = opts.wallColor || 'jiangnanWall';
      this.tileColor = opts.tileColor || 'jiangnanTile';
      this.opacity = opts.opacity || 0.25;
    }
    update() {}
    draw() {
      const wallColor = pal()[this.wallColor] || pal().jiangnanWall;
      const tileColor = pal()[this.tileColor] || pal().jiangnanTile;
      const bx = W * this.xRatio;
      const bw = W * this.widthRatio;
      const bh = H * this.heightRatio;
      const by = H * 0.65 - bh;
      ctx.fillStyle = `rgba(${wallColor}, ${this.opacity})`;
      ctx.fillRect(bx - bw / 2, by, bw, bh);
      ctx.fillStyle = `rgba(${tileColor}, ${this.opacity * 1.2})`;
      ctx.beginPath();
      ctx.moveTo(bx - bw / 2 - bw * 0.1, by);
      ctx.lineTo(bx - bw * 0.05, by - bh * 0.15);
      ctx.lineTo(bx + bw * 0.05, by - bh * 0.15);
      ctx.lineTo(bx + bw / 2 + bw * 0.1, by);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(${tileColor}, ${this.opacity * 0.8})`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 5; i++) {
        const yy = by - bh * 0.02 - i * bh * 0.025;
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2 + bw * 0.05 + i * bw * 0.02, yy);
        ctx.lineTo(bx + bw / 2 - bw * 0.05 - i * bw * 0.02, yy);
        ctx.stroke();
      }
    }
  }

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
  ,
    // 10. 水墨山水 — 远山层叠 + 飘动云雾
    'ink-mountain': {
      layers: [
        { type: 'mountainLayer',  count: 3, opts: { total: 3 } },
        { type: 'inkCloud',       count: 8, opts: { size: 180, speed: 0.1, opacity: 0.12, yRatio: 0.4, colorKey: 'inkWash' } },
        { type: 'inkCloud',       count: 5, opts: { size: 250, speed: 0.06, opacity: 0.08, yRatio: 0.6, colorKey: 'inkLight' } }
      ]
    },
    // 11. 月下荷塘 — 月晕 + 荷叶剪影 + 水面波纹
    'moonlit-pond': {
      layers: [
        { type: 'moonHalo',       count: 1, opts: { sizeRatio: 0.06, xRatio: 0.7, yRatio: 0.18 } },
        { type: 'lotusLeaf',      count: 12, opts: { opacity: 0.35 } },
        { type: 'waterRipple',    count: 15, opts: { opacity: 0.25, yRatio: 0.7 } },
        { type: 'star',           count: 30, opts: { dim: true } }
      ]
    },
    // 12. 烟雨江南 — 细雨 + 浓雾 + 云雾
    'jiangnan-rain': {
      layers: [
        { type: 'fog',            count: 20, opts: {} },
        { type: 'rain',           count: 100, opts: { fine: true } },
        { type: 'inkCloud',       count: 6, opts: { size: 200, speed: 0.08, opacity: 0.1, yRatio: 0.3, colorKey: 'inkWash' } },
        { type: 'waterRipple',    count: 12, opts: { opacity: 0.2, yRatio: 0.75, colorKey: 'jiangnanWall' } }
      ]
    },
    // 13. 星河倒影 — 星星 + 水面倒影星 + 远山
    'starry-lake': {
      layers: [
        { type: 'star',           count: 80, opts: {} },
        { type: 'starReflection', count: 60, opts: {} },
        { type: 'moonHalo',       count: 1, opts: { sizeRatio: 0.04, xRatio: 0.2, yRatio: 0.15, colorKey: 'star' } },
        { type: 'mountainLayer',  count: 2, opts: { total: 2, opacity: 0.2, colorKey: 'ink' } }
      ]
    },
    // 14. 桃花雨 — 飘落的桃花花瓣 + 薄雾
    'peach-rain': {
      layers: [
        { type: 'peachPetal',     count: 60, opts: {} },
        { type: 'fog',            count: 8, opts: { large: true } }
      ]
    },
    // 15. 枯山水 — 砂纹涟漪 + 苔石
    'zen-garden': {
      layers: [
        { type: 'zenRipple',      count: 3, opts: {} },
        { type: 'zenStone',       count: 5, opts: {} }
      ]
    },
    // 16. 竹林雨雾 — 竹子剪影 + 细雨 + 雾气
    'bamboo-mist': {
      layers: [
        { type: 'fog',            count: 15, opts: {} },
        { type: 'rain',           count: 80, opts: { fine: true } },
        { type: 'bambooStalk',    count: 12, opts: { total: 12 } },
        { type: 'inkCloud',       count: 5, opts: { size: 150, speed: 0.05, opacity: 0.08, yRatio: 0.4, colorKey: 'bambooMist' } }
      ]
    },
    // 17. 金色麦浪 — 麦浪起伏 + 夕阳逆光
    'golden-wheat': {
      layers: [
        { type: 'sunlightGlow',   count: 1, opts: {} },
        { type: 'wheatStalk',     count: 40, opts: { total: 40 } }
      ]
    },
    // 18. 雪落庭院 — 飘雪 + 红灯笼 + 梅花枝
    'snowy-court': {
      layers: [
        { type: 'snow',           count: 100, opts: { density: 'normal' } },
        { type: 'lanternGlow',    count: 2, opts: {} },
        { type: 'plumBranch',     count: 1, opts: {} },
        { type: 'fog',            count: 5, opts: {} }
      ]
    }
  };;

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
            case 'inkCloud':         return new InkCloud(opts);
      case 'mountainLayer':    return new MountainLayer(opts);
      case 'moonHalo':         return new MoonHalo(opts);
      case 'lotusLeaf':        return new LotusSilhouette(opts);
      case 'waterRipple':      return new WaterRipple(opts);
      case 'peachPetal':       return new PeachPetal(opts);
      case 'zenRipple':        return new ZenRipple(opts);
      case 'zenStone':         return new ZenStone(opts);
      case 'bambooStalk':      return new BambooStalk(opts);
      case 'wheatStalk':       return new WheatStalk(opts);
      case 'lanternGlow':      return new LanternGlow(opts);
      case 'plumBranch':       return new PlumBranch(opts);
      case 'sunlightGlow':     return new SunlightGlow(opts);
      case 'starReflection':   return new StarReflection(opts);
      case 'willowBranch':     return new WillowBranch(opts);
      case 'jiangnanBuilding': return new JiangnanBuilding(opts);
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
        if (layer.type === 'aurora' || layer.type === 'mountainLayer' || layer.type === 'bambooStalk' || layer.type === 'wheatStalk' || layer.type === 'zenStone' || layer.type === 'lanternGlow' || layer.type === 'plumBranch' || layer.type === 'willowBranch' || layer.type === 'jiangnanBuilding') {
          opts.index = i;
        if (layer.opts && layer.opts.total) opts.total = layer.opts.total;
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

    // 页面可见性变化时暂停/恢复动画，节省后台性能
    visibilityHandler = () => {
      if (document.hidden) {
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      } else {
        if (currentMode && currentMode !== 'none') {
          animate();
        }
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

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
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    particles = [];
    canvas = null;
    ctx = null;
  }

  return { init, switchMode, setTheme, getMode, destroy };
})();
