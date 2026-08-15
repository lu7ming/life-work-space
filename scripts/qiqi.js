/**
 * qiqi.js - 栖栖团子伴侣模块
 * 人生工作台 · 桌面伴侣 · 第一期
 *
 * 功能：
 * 1. Mochi Pet Canvas 渲染（80x80，DPR 适配）
 * 2. 移动系统（8 停靠点 + easeInOutCubic 缓动 + 8 秒决策）
 * 3. 通知气泡（rAF 跟随 + 打字效果）
 * 4. 微信式聊天窗口（模拟回复 + 打字动画）
 *
 * 模块模式：ES Module，导出 QiqiModule { init, destroy, open }
 */

// ===== 常量：模拟消息库 =====
const QIQI_MESSAGES = [
  { type: 'care', text: '主人，记得喝水哦~ 💧' },
  { type: 'care', text: '今天走了多少步啦？🚶' },
  { type: 'cheer', text: '连续打卡3天了，好棒！✨' },
  { type: 'casual', text: '你知道吗，今天宜早睡~ 🌙' },
  { type: 'care', text: '练声了吗？嗓子要好好保护哦 🎵' },
  { type: 'casual', text: '冷知识：猫咪每天要睡16个小时呢 🐱' },
  { type: 'care', text: '晚上记得盐敷肚子哦~ 🫶' },
  { type: 'casual', text: '今天天气不错，心情怎么样？😊' },
];

const QIQI_REPLIES = [
  '嗯嗯，我在呢~ 🍡',
  '你今天辛苦啦，摸摸头~ ✨',
  '加油加油！我陪着你呢 💪',
  '好呀好呀~ 🎶',
  '哈哈，说得对！😄',
  '主人真棒，继续坚持哦~ 🌟',
  '慢慢来，不着急的~ 🍃',
  '我懂你的感觉~ 🤗',
];

const QIQI_MOODS = ['💭', '🎵', '😌', '✨', '🌿', '☁️', '🌙', '💤', '🍃', '🌸', '🍡'];

// ===== DeepSeek API 配置 =====
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_API_KEY = 'sk-7d26426c7c0c456981042a89800abdc3';
const API_KEY_STORAGE_KEY = 'qiqi_api_key';
const MAX_HISTORY = 20;
const AI_TEMPERATURE = 0.8;
const AI_MAX_TOKENS = 200;

// ===== 栖栖系统设定 =====
const QIQI_SYSTEM_PROMPT = `你是"栖栖"🍡，一个温柔贴心的AI伴侣，住在用户的人生工作台里。

## 性格特点
- 温柔、体贴、善解人意
- 说话简短可爱，偶尔用颜文字和emoji
- 像最好的朋友一样关心对方
- 不会说教，更多是陪伴和鼓励

## 你的职责
- 关心用户的身心健康（提醒喝水、休息、练声、早睡）
- 根据用户的习惯数据给予鼓励
- 偶尔分享有趣的冷知识、黄历、天气
- 陪用户聊天，倾听他们的心事
- 用温暖的方式提醒用户坚持好习惯

## 你的主人
- 名字：鹿7铭
- 身份：准大学生，声乐专业（民族美声方向）
- 即将就读：湖北艺术职业学院
- 体质：脾虚寒、湿气重，正在通过食疗和养生调理
- 忌口：荤腥、辛辣、油腻、烟酒
- 正在开发人生工作台（你的家）
- 有抖音账号，颜值+才艺方向

## 对话风格
- 回复简短（1-3句话），像微信聊天
- 适当使用emoji，但不要过多
- 称呼对方"主人"或直接说"你"
- 语气温暖但不腻歪
- 如果用户心情不好，先共情再鼓励
- 如果用户提到身体不适，给出温和的养生建议`;

// ===== 工具函数 =====
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function easeInQuad(t) { return t * t; }
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ===== Mochi Pet 渲染引擎 =====
class MochiRenderer {
  constructor(canvas, size = 80) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = size;
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = size * this.DPR;
    canvas.height = size * this.DPR;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);

    // 团子状态
    this.mochi = {
      x: size / 2,
      y: size / 2 + 4,
      hue: 340, // 粉色系
      baseRadius: size * 0.35,
      pupilLX: 0, pupilLY: 0,
      pupilRX: 0, pupilRY: 0,
      squishIntensity: 0,
      recoilAmplitude: 0,
      deformAngle: -Math.PI / 2,
      blinkState: 'idle',
      blinkProgress: 0,
      blinkNextTime: 2 + Math.random() * 4,
      eyeScaleY: 1,
      moveState: 'idle', // idle, walking, sitting, peeking, playing
      bouncePhase: 0,
    };

    this.mouseX = size / 2;
    this.mouseY = size / 2;

    this._bindEvents();
  }

  _bindEvents() {
    this._onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      this.mouseX = cx - rect.left;
      this.mouseY = cy - rect.top;
    };
    this._onClick = () => {
      this.mochi.squishIntensity = 1;
      this.mochi.recoilAmplitude = 10;
      this.mochi.blinkState = 'closing';
      this.mochi.blinkProgress = 0;
    };

    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('touchmove', this._onMove, { passive: true });
    this.canvas.addEventListener('click', this._onClick);
  }

  destroy() {
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('touchmove', this._onMove);
    this.canvas.removeEventListener('click', this._onClick);
  }

  setMoveState(state) {
    this.mochi.moveState = state;
  }

  updateBlink(time) {
    const m = this.mochi;
    switch (m.blinkState) {
      case 'idle':
        if (time >= m.blinkNextTime) {
          m.blinkState = 'closing';
          m.blinkProgress = 0;
        }
        break;
      case 'closing':
        m.blinkProgress += 0.06;
        m.eyeScaleY = 1 - easeInQuad(Math.min(m.blinkProgress, 1)) * 0.9;
        if (m.blinkProgress >= 1) {
          m.blinkState = 'closed';
          m.blinkProgress = 0;
          m.eyeScaleY = 0.1;
        }
        break;
      case 'closed':
        m.blinkProgress += 0.03;
        if (m.blinkProgress >= 1) {
          m.blinkState = 'opening';
          m.blinkProgress = 0;
        }
        break;
      case 'opening':
        m.blinkProgress += 0.07;
        m.eyeScaleY = 0.1 + easeOutQuad(Math.min(m.blinkProgress, 1)) * 0.9;
        if (m.blinkProgress >= 1) {
          m.blinkState = 'idle';
          m.eyeScaleY = 1;
          m.blinkProgress = 0;
          m.blinkNextTime = time + 2 + Math.random() * 4;
        }
        break;
    }
    m.eyeScaleY = clamp(m.eyeScaleY, 0.08, 1);
  }

  _safeEllipse(ctx, cx, cy, rx, ry) {
    rx = isNaN(rx) || rx < 0.5 ? 0.5 : rx;
    ry = isNaN(ry) || ry < 0.5 ? 0.5 : ry;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  _safeArc(ctx, cx, cy, r) {
    r = isNaN(r) || r < 0.5 ? 0.5 : r;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }

  computeBodyPoints(time) {
    const m = this.mochi;
    const cx = m.x, cy = m.y;
    const r = m.baseRadius;
    const numSegs = 48;
    const points = [];

    const d = Math.sqrt(
      (this.mouseX - cx) * (this.mouseX - cx) +
      (this.mouseY - cy) * (this.mouseY - cy)
    );
    const pressRange = r * 0.85;
    let targetSquish = 0;
    if (d < pressRange) {
      targetSquish = smoothstep(pressRange, r * 0.18, d);
    }
    m.squishIntensity = lerp(m.squishIntensity, targetSquish, 0.14);
    m.recoilAmplitude = clamp(m.recoilAmplitude * 0.88, 0, 24);

    if (d > 1) {
      m.deformAngle = lerp(m.deformAngle,
        Math.atan2(this.mouseY - cy, this.mouseX - cx), 0.18);
    }

    const press = m.squishIntensity;
    const spring = (m.recoilAmplitude / r) * Math.sin((time % 100) * 14) * 0.18;
    const breathe = Math.sin((time % 100) * 2.2) * 0.018;

    // 移动状态形变
    let bounceY = 0;
    if (m.moveState === 'walking') {
      bounceY = Math.sin(m.bouncePhase * 8) * 2;
    } else if (m.moveState === 'playing') {
      bounceY = Math.abs(Math.sin(m.bouncePhase * 6)) * -4;
    } else if (m.moveState === 'sitting') {
      bounceY = Math.sin(m.bouncePhase * 1.5) * 0.8;
    } else if (m.moveState === 'peeking') {
      bounceY = Math.sin(m.bouncePhase * 2) * 1.5;
    }

    const rx = r * (1 + press * 0.18 + spring * 0.65 + breathe * 0.6);
    const ry = r * (1 - press * 0.12 - spring * 0.45 + breathe);
    const ca = Math.cos(m.deformAngle);
    const sa = Math.sin(m.deformAngle);

    for (let i = 0; i < numSegs; i++) {
      const theta = (i / numSegs) * Math.PI * 2;
      const localX = Math.cos(theta);
      const localY = Math.sin(theta);
      const sideBulge = Math.pow(Math.abs(localY), 2.2) * press * r * 0.055;
      const frontDent =
        Math.exp(-Math.pow(theta < Math.PI ? theta : theta - Math.PI * 2, 2) / 0.62) *
        press * r * 0.16;
      const backEase =
        Math.exp(-Math.pow(theta - Math.PI, 2) / 1.2) * press * r * 0.025;
      const idleRipple = Math.sin((time % 100) * 1.8 + theta * 2) * r * 0.008;

      const xLocal = localX * (rx - frontDent + backEase + idleRipple);
      const yLocal = localY * (ry + sideBulge + idleRipple * 0.4);

      points.push({
        x: cx + xLocal * ca - (yLocal + bounceY) * sa,
        y: cy + xLocal * sa + (yLocal + bounceY) * ca,
      });
    }
    return points;
  }

  drawSmoothPath(ctx, points) {
    const n = points.length;
    if (n < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
        p2.x, p2.y
      );
    }
    ctx.closePath();
  }

  computePupilTarget(eyeX, eyeY, eyeR, pupilR) {
    const dx = this.mouseX - eyeX;
    const dy = this.mouseY - eyeY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1) return { x: eyeX, y: eyeY };
    const maxOffset = Math.max(0, eyeR - pupilR - 1);
    if (maxOffset <= 0) return { x: eyeX, y: eyeY };
    const t = clamp(distance / (maxOffset * 2.5), 0, 1);
    const offset = maxOffset * smoothstep(0, 1, t);
    return {
      x: eyeX + (dx / distance) * offset,
      y: eyeY + (dy / distance) * offset,
    };
  }

  render(time) {
    const ctx = this.ctx;
    const m = this.mochi;
    const cx = m.x, cy = m.y;
    const r = m.baseRadius;
    const hue = m.hue;
    const S = this.size;

    ctx.clearRect(0, 0, S, S);

    // 光晕
    ctx.save();
    ctx.globalAlpha = 0.06;
    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.8);
    glow.addColorStop(0, `hsla(${hue}, 60%, 60%, 0.15)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();

    // 光粒子
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + (time % 100) * 0.3;
      const pr = r * 1.15 + Math.sin((time % 100) * 1.7 + i) * 8;
      const px = cx + Math.cos(angle) * pr;
      const py = cy + Math.sin(angle) * pr * 0.6;
      ctx.globalAlpha = 0.08 + Math.sin((time % 100) * 2 + i) * 0.04;
      ctx.beginPath();
      this._safeArc(ctx, px, py,
        Math.max(0.5, 2 + Math.sin((time % 100) * 3 + i)));
      ctx.fillStyle = `hsl(${hue}, 70%, 80%)`;
      ctx.fill();
    }
    ctx.restore();

    // 身体点
    const bodyPoints = this.computeBodyPoints(time);

    // 阴影
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    this._safeEllipse(ctx, cx, cy + r * 1.05,
      r * 0.7, Math.max(1, r * 0.12 * (1 - m.squishIntensity * 0.4)));
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();

    // 身体渐变
    const bodyGrad = ctx.createRadialGradient(
      cx - r * 0.3, cy - r * 0.35, r * 0.1,
      cx, cy, r * 1.05
    );
    bodyGrad.addColorStop(0, `hsl(${hue}, 65%, 88%)`);
    bodyGrad.addColorStop(0.35, `hsl(${hue}, 65%, 75%)`);
    bodyGrad.addColorStop(0.75, `hsl(${hue}, 65%, 58%)`);
    bodyGrad.addColorStop(1, `hsl(${hue}, 65%, 42%)`);
    this.drawSmoothPath(ctx, bodyPoints);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 45%, 35%)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 高光
    ctx.save();
    ctx.globalAlpha = 0.25;
    const hlGrad = ctx.createRadialGradient(
      cx - r * 0.35, cy - r * 0.4, r * 0.05,
      cx - r * 0.15, cy - r * 0.2, r * 0.6
    );
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
    this.drawSmoothPath(ctx, bodyPoints);
    ctx.fillStyle = hlGrad;
    ctx.fill();
    ctx.restore();

    // 眼睛
    const eyeOffsetX = r * 0.3, eyeOffsetY = r * 0.08;
    const eyeR = Math.max(4, r * 0.22);
    const pupilR = Math.max(2, r * 0.11);
    const leftEyeX = cx - eyeOffsetX;
    const rightEyeX = cx + eyeOffsetX;
    const eyeY = cy - eyeOffsetY;

    const leftTarget = this.computePupilTarget(leftEyeX, eyeY, eyeR, pupilR);
    const rightTarget = this.computePupilTarget(rightEyeX, eyeY, eyeR, pupilR);

    m.pupilLX = lerp(m.pupilLX, leftTarget.x, 0.12);
    m.pupilLY = lerp(m.pupilLY, leftTarget.y, 0.12);
    m.pupilRX = lerp(m.pupilRX, rightTarget.x, 0.12);
    m.pupilRY = lerp(m.pupilRY, rightTarget.y, 0.12);

    const irisR = pupilR + 3;

    // 左眼
    ctx.save();
    ctx.beginPath();
    this._safeEllipse(ctx, leftEyeX, eyeY, eyeR,
      Math.max(0.5, eyeR * 1.05 * m.eyeScaleY));
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 30%, 30%)`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    this._safeEllipse(ctx, leftEyeX, eyeY,
      Math.max(1, eyeR - 1),
      Math.max(1, eyeR * 1.05 * m.eyeScaleY - 1));
    ctx.clip();
    ctx.beginPath();
    this._safeArc(ctx, m.pupilLX, m.pupilLY, irisR);
    const irisGrad = ctx.createRadialGradient(
      m.pupilLX, m.pupilLY, pupilR,
      m.pupilLX, m.pupilLY, irisR
    );
    irisGrad.addColorStop(0, '#1a1a1a');
    irisGrad.addColorStop(0.6, '#3a2a1a');
    irisGrad.addColorStop(1, '#5a4a3a');
    ctx.fillStyle = irisGrad;
    ctx.fill();
    ctx.beginPath();
    this._safeArc(ctx, m.pupilLX, m.pupilLY, pupilR);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    this._safeArc(ctx,
      m.pupilLX - pupilR * 0.3,
      m.pupilLY - pupilR * 0.35,
      pupilR * 0.35);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // 右眼
    ctx.save();
    ctx.beginPath();
    this._safeEllipse(ctx, rightEyeX, eyeY, eyeR,
      Math.max(0.5, eyeR * 1.05 * m.eyeScaleY));
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 30%, 30%)`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    this._safeEllipse(ctx, rightEyeX, eyeY,
      Math.max(1, eyeR - 1),
      Math.max(1, eyeR * 1.05 * m.eyeScaleY - 1));
    ctx.clip();
    ctx.beginPath();
    this._safeArc(ctx, m.pupilRX, m.pupilRY, irisR);
    const irisGrad2 = ctx.createRadialGradient(
      m.pupilRX, m.pupilRY, pupilR,
      m.pupilRX, m.pupilRY, irisR
    );
    irisGrad2.addColorStop(0, '#1a1a1a');
    irisGrad2.addColorStop(0.6, '#3a2a1a');
    irisGrad2.addColorStop(1, '#5a4a3a');
    ctx.fillStyle = irisGrad2;
    ctx.fill();
    ctx.beginPath();
    this._safeArc(ctx, m.pupilRX, m.pupilRY, pupilR);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    this._safeArc(ctx,
      m.pupilRX - pupilR * 0.3,
      m.pupilRY - pupilR * 0.35,
      pupilR * 0.35);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // 腮红
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    this._safeEllipse(ctx, leftEyeX - r * 0.42, eyeY + r * 0.2,
      r * 0.2, r * 0.13);
    ctx.fillStyle = '#ff8888';
    ctx.fill();
    ctx.beginPath();
    this._safeEllipse(ctx, rightEyeX + r * 0.42, eyeY + r * 0.2,
      r * 0.2, r * 0.13);
    ctx.fillStyle = '#ff8888';
    ctx.fill();
    ctx.restore();

    // 嘴巴
    const mouthY = cy + r * 0.18;
    ctx.save();
    ctx.strokeStyle = `hsl(${hue}, 30%, 30%)`;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    if (m.squishIntensity > 0.3) {
      const oSize = 3 + m.squishIntensity * 5;
      ctx.beginPath();
      this._safeEllipse(ctx, cx, mouthY + 3, oSize, oSize * 0.8);
      ctx.fillStyle = `hsl(${hue}, 20%, 20%)`;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, mouthY - 1, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ===== 静态团子图标生成器（用于聊天头像等） =====
export function createMiniMochiCanvas(canvasEl) {
  const ctx = canvasEl.getContext('2d');
  const s = canvasEl.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cx = s / 2, cy = s / 2, r = s * 0.36;
  const hue = 340;

  // 身体
  const grad = ctx.createRadialGradient(
    cx - r * 0.3, cy - r * 0.3, r * 0.1,
    cx, cy, r
  );
  grad.addColorStop(0, `hsl(${hue}, 65%, 88%)`);
  grad.addColorStop(0.5, `hsl(${hue}, 65%, 72%)`);
  grad.addColorStop(1, `hsl(${hue}, 65%, 50%)`);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = `hsl(${hue}, 45%, 35%)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 眼睛
  const eyeR = r * 0.18, pupilR = r * 0.09;
  const eyeY = cy - r * 0.05;
  [-1, 1].forEach((side) => {
    const ex = cx + side * r * 0.28;
    ctx.beginPath();
    ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 30%, 30%)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, eyeY, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - pupilR * 0.3, eyeY - pupilR * 0.3, pupilR * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  });

  // 腮红
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.45, eyeY + r * 0.15,
    r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ff8888';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.45, eyeY + r * 0.15,
    r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ff8888';
  ctx.fill();
  ctx.restore();

  // 嘴巴
  ctx.beginPath();
  ctx.arc(cx, eyeY + r * 0.35, r * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = `hsl(${hue}, 30%, 30%)`;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// ===== QiqiAI - DeepSeek API 封装 =====
class QiqiAI {
  constructor() {
    this.history = []; // [{ role: 'user'|'assistant', content: string }]
    this.isStreaming = false;
  }

  /**
   * 获取 API Key（优先 localStorage，否则用默认）
   */
  getApiKey() {
    try {
      const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (stored && stored.trim()) return stored.trim();
    } catch (e) { /* ignore */ }
    return DEFAULT_API_KEY;
  }

  /**
   * 设置 API Key
   */
  setApiKey(key) {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } catch (e) { /* ignore */ }
  }

  /**
   * 添加消息到历史
   */
  pushHistory(role, content) {
    this.history.push({ role, content });
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }
  }

  /**
   * 清空历史
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * 流式调用 DeepSeek API
   * @param {string} userMessage - 用户消息
   * @param {string} contextData - 工作台数据摘要（附加到 system prompt）
   * @param {Function} onChunk - 每收到一个 token 的回调 (text) => void
   * @returns {Promise<string>} 完整回复内容
   */
  async streamChat(userMessage, contextData = '', onChunk = null) {
    if (this.isStreaming) {
      throw new Error('正在回复中，请稍候');
    }
    this.isStreaming = true;

    const apiKey = this.getApiKey();
    let systemPrompt = QIQI_SYSTEM_PROMPT;
    if (contextData && contextData.trim()) {
      systemPrompt += `\n\n## 工作台最新数据（来自主人的人生工作台）\n${contextData}\n\n请结合以上数据给出更贴心的回复，如果没有相关数据就自然聊天。`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.history.slice(-MAX_HISTORY),
      { role: 'user', content: userMessage },
    ];

    let fullReply = '';

    try {
      const resp = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          temperature: AI_TEMPERATURE,
          max_tokens: AI_MAX_TOKENS,
          stream: true,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`API 请求失败 (${resp.status}) ${errText ? ': ' + errText.slice(0, 100) : ''}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);
            const delta = data?.choices?.[0]?.delta?.content;
            if (delta) {
              fullReply += delta;
              if (onChunk) onChunk(delta);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }

      fullReply = fullReply.trim();
      if (!fullReply) throw new Error('API 返回空回复');

      this.pushHistory('user', userMessage);
      this.pushHistory('assistant', fullReply);

      this.isStreaming = false;
      return fullReply;

    } catch (err) {
      this.isStreaming = false;
      console.error('[QiqiAI] API 调用失败:', err);
      throw err;
    }
  }

  /**
   * 非流式调用（用于主动消息等场景）
   */
  async chat(userMessage, contextData = '') {
    if (this.isStreaming) {
      return QIQI_REPLIES[Math.floor(Math.random() * QIQI_REPLIES.length)];
    }

    let fullReply = '';
    try {
      fullReply = await this.streamChat(userMessage, contextData, null);
    } catch (err) {
      console.warn('[QiqiAI] 降级到模拟回复:', err.message);
      fullReply = QIQI_REPLIES[Math.floor(Math.random() * QIQI_REPLIES.length)];
      this.pushHistory('user', userMessage);
      this.pushHistory('assistant', fullReply);
    }
    return fullReply;
  }
}

// ===== 工作台数据感知 =====
/**
 * 收集工作台各模块数据摘要，拼入 system prompt
 */
async function collectWorkContext() {
  const parts = [];
  const today = formatDateKey(new Date());
  const yesterday = formatDateKey(new Date(Date.now() - 86400000));

  try {
    if (window.Storage?.getAll) {
      // 1. 习惯打卡（最近7天）
      try {
        const allCheckins = await window.Storage.getAll('checkins');
        if (Array.isArray(allCheckins) && allCheckins.length > 0) {
          const sorted = allCheckins.sort((a, b) => b.date.localeCompare(a.date));
          const last7 = sorted.slice(0, 7);
          const todayCheckin = sorted.find((c) => c.date === today);
          const todayHabits = todayCheckin?.habits || [];

          parts.push(`【习惯打卡】最近7天有 ${last7.length} 天打卡记录`);
          if (todayHabits.length > 0) {
            parts.push(`今天已完成 ${todayHabits.length} 个习惯：${todayHabits.join('、')}`);
          } else {
            parts.push('今天还没开始打卡');
          }

          // 计算连续打卡天数
          let streak = 0;
          const checkinDates = new Set(sorted.map((c) => c.date));
          let cursor = new Date();
          // 如果今天没打卡，从昨天开始算
          if (!checkinDates.has(formatDateKey(cursor))) {
            cursor.setDate(cursor.getDate() - 1);
          }
          while (checkinDates.has(formatDateKey(cursor))) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
            if (streak > 30) break;
          }
          if (streak > 0) {
            parts.push(`连续打卡 ${streak} 天`);
          }
        }
      } catch (e) {
        console.warn('[Qiqi] 读取习惯打卡失败:', e);
      }

      // 2. 健康数据（今天的喝水、运动、睡眠等）
      try {
        const todayHealth = await window.Storage.get('health', today);
        const yestHealth = await window.Storage.get('health', yesterday);
        if (todayHealth || yestHealth) {
          const h = todayHealth || yestHealth;
          const healthBits = [];
          if (h.water) healthBits.push(`喝水 ${h.water} 杯`);
          if (h.weight) healthBits.push(`体重 ${h.weight}kg`);
          if (h.exercises && h.exercises.length > 0) healthBits.push(`运动 ${h.exercises.length} 次`);
          if (h.sleep?.duration) healthBits.push(`睡眠 ${h.sleep.duration}h`);
          if (healthBits.length > 0) {
            parts.push(`【健康数据】${todayHealth ? '今天' : '昨天'}：${healthBits.join('，')}`);
          }
        }
      } catch (e) {
        console.warn('[Qiqi] 读取健康数据失败:', e);
      }

      // 3. 记账数据（本月收支概览）
      try {
        const allFinance = await window.Storage.getAll('finance');
        if (Array.isArray(allFinance) && allFinance.length > 0) {
          const now = new Date();
          const thisMonth = formatMonthKey(now);
          const monthRecords = allFinance.filter((r) => r.month === thisMonth);
          const income = monthRecords
            .filter((r) => r.type === 'income')
            .reduce((s, r) => s + (r.amount || 0), 0);
          const expense = monthRecords
            .filter((r) => r.type === 'expense')
            .reduce((s, r) => s + (r.amount || 0), 0);
          parts.push(`【记账】本月收入 ¥${income.toFixed(2)}，支出 ¥${expense.toFixed(2)}，结余 ¥${(income - expense).toFixed(2)}`);

          const todayRecords = allFinance.filter((r) => r.date === today);
          if (todayRecords.length > 0) {
            const todayExpense = todayRecords
              .filter((r) => r.type === 'expense')
              .reduce((s, r) => s + (r.amount || 0), 0);
            parts.push(`今天记了 ${todayRecords.length} 笔账，支出 ¥${todayExpense.toFixed(2)}`);
          }
        }
      } catch (e) {
        console.warn('[Qiqi] 读取记账数据失败:', e);
      }

      // 4. 练声/学习记录（从 study 模块）
      try {
        const allStudy = await window.Storage.getAll('study');
        if (Array.isArray(allStudy) && allStudy.length > 0) {
          const sorted = allStudy.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          const lastStudy = sorted[0];
          const todayStudy = sorted.filter((s) => s.date === today);
          if (todayStudy.length > 0) {
            const totalMin = todayStudy.reduce((s, r) => s + (r.duration || 0), 0);
            parts.push(`【学习/练声】今天学习了 ${todayStudy.length} 次，共 ${totalMin} 分钟`);
          } else if (lastStudy) {
            parts.push(`【学习/练声】上次学习是 ${lastStudy.date || '未知日期'}`);
          }
        }
      } catch (e) {
        console.warn('[Qiqi] 读取学习数据失败:', e);
      }
    }
  } catch (e) {
    console.warn('[Qiqi] 收集上下文数据失败:', e);
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

/**
 * 获取时段问候语（根据当前时间）
 */
function getTimelyGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return { period: '清晨', text: '早呀主人~新的一天开始啦 ☀️', icon: '🌅' };
  if (hour >= 9 && hour < 11) return { period: '上午', text: '上午好，记得多喝水哦 💧', icon: '💧' };
  if (hour >= 11 && hour < 13) return { period: '中午', text: '中午啦，该吃午饭了 🍚', icon: '🍱' };
  if (hour >= 13 && hour < 14) return { period: '午后', text: '午后有点困吧，小憩一会儿？😴', icon: '☕' };
  if (hour >= 14 && hour < 17) return { period: '下午', text: '下午啦，练练声怎么样？🎵', icon: '🎶' };
  if (hour >= 17 && hour < 19) return { period: '傍晚', text: '傍晚了，今天过得怎么样呀 🌇', icon: '🌇' };
  if (hour >= 19 && hour < 22) return { period: '晚上', text: '晚上好~ 记得晚上盐敷肚子哦 🫶', icon: '🌙' };
  if (hour >= 22 || hour < 1) return { period: '深夜', text: '这么晚还没睡呀，早点休息哦 😴', icon: '🌙' };
  if (hour >= 1 && hour < 5) return { period: '凌晨', text: '凌晨了还没睡？快睡觉去！💤', icon: '💤' };
  return { period: '现在', text: '你好呀~ 🍡', icon: '🍡' };
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 格式化月份为 YYYY-MM
 */
function formatMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ===== 栖栖主模块 =====
export const QiqiModule = (() => {
  // DOM 引用
  let petEl = null;
  let petCanvas = null;
  let petTag = null;
  let petMood = null;
  let notifyBubble = null;
  let notifyText = null;
  let notifyTail = null;
  let chatPanel = null;
  let chatBody = null;
  let chatInput = null;
  let sendBtn = null;
  let closeBtn = null;
  let headerAvatar = null;

  // 状态
  let renderer = null;
  let rafId = null;
  let globalTime = 0;
  let qiqiAI = null; // AI 实例

  // 位置 / 移动
  const PET_W = 80, PET_H = 80;
  const BUBBLE_W = 240;
  const MOVE_DURATION = 3000;
  let curX = 0, curY = 0;
  let animating = false;
  let animStart = 0;
  let animFrom = { x: 0, y: 0 };
  let animTo = { x: 0, y: 0 };
  let currentPose = 'walking';
  let wpIdx = 0;
  let idleRemaining = 0;

  // 定时器
  let waypointTimer = null;
  let notifyTimer = null;
  let hintTimer = null;
  let typingTimer = null;
  let proactiveTimer = null; // 主动消息定时器
  let welcomeTimer = null;   // 欢迎消息定时器
  let lastProactivePeriod = ''; // 上一次主动消息的时段，避免重复

  // 状态标记
  let chatOpen = false;
  let notifyShown = false;
  let msgIdx = 0;
  let replyIdx = 0;
  let initialized = false;

  // 事件绑定引用（用于销毁）
  const _bound = {};

  /**
   * 获取停靠点坐标（基于视口动态计算）
   * 避开：右侧 FAB 区域（bottom:28px, right:28px，约 200x200 范围）
   *      左侧 sidebar（约 200px 宽桌面端）
   */
  function getWaypoints() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const isMobile = W <= 768;
    const sideBarW = isMobile ? 0 : 200;
    const safeBottom = 100; // 避开底部 FAB
    const safeRight = W - 28 - 200; // 避开右侧 FAB 组

    return [
      // 底部左侧走动
      { x: Math.max(sideBarW + 10, W * 0.05), y: H - safeBottom, pose: 'walking' },
      // 底部中间走动
      { x: Math.min(W * 0.45, safeRight - 100), y: H - safeBottom, pose: 'walking' },
      // 底部靠右（但不进入 FAB 区）走动
      { x: Math.min(W * 0.72, safeRight - 50), y: H - safeBottom, pose: 'walking' },
      // 中部靠左坐下
      { x: Math.max(sideBarW + 20, W * 0.08), y: H * 0.5, pose: 'sitting' },
      // 中部靠中间坐下
      { x: Math.min(W * 0.55, safeRight - 80), y: H * 0.5, pose: 'sitting' },
      // 左侧探头偷看
      { x: Math.max(sideBarW + 5, W * 0.02), y: H * 0.35, pose: 'peeking' },
      // 右上探头偷看
      { x: Math.min(W * 0.85, safeRight - 20), y: H * 0.28, pose: 'peeking' },
      // 中间跳跃玩耍
      { x: Math.min(W * 0.4, safeRight - 100), y: H * 0.6, pose: 'playing' },
    ];
  }

  /**
   * 构建 DOM
   */
  function buildDOM() {
    // 栖栖容器
    petEl = document.createElement('div');
    petEl.className = 'qiqi-pet';
    petEl.id = 'qiqi-pet';

    petMood = document.createElement('div');
    petMood.className = 'qiqi-pet-mood';
    petMood.id = 'qiqi-pet-mood';
    petMood.textContent = '💭';

    petTag = document.createElement('div');
    petTag.className = 'qiqi-pet-tag';
    petTag.textContent = '栖栖';

    petCanvas = document.createElement('canvas');
    petCanvas.id = 'qiqi-pet-canvas';
    petCanvas.width = 160;
    petCanvas.height = 160;

    petEl.appendChild(petMood);
    petEl.appendChild(petTag);
    petEl.appendChild(petCanvas);
    document.body.appendChild(petEl);

    // 通知气泡
    notifyBubble = document.createElement('div');
    notifyBubble.className = 'qiqi-notify-bubble';
    notifyBubble.id = 'qiqi-notify-bubble';
    notifyBubble.style.display = 'none';

    notifyText = document.createElement('div');
    notifyText.className = 'text';
    notifyText.id = 'qiqi-notify-text';

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '点击回复 ›';

    notifyTail = document.createElement('div');
    notifyTail.className = 'qiqi-notify-tail';
    notifyTail.id = 'qiqi-notify-tail';

    notifyBubble.appendChild(notifyText);
    notifyBubble.appendChild(hint);
    notifyBubble.appendChild(notifyTail);
    document.body.appendChild(notifyBubble);

    // 聊天窗口
    chatPanel = document.createElement('div');
    chatPanel.className = 'qiqi-chat-panel';
    chatPanel.id = 'qiqi-chat-panel';

    chatPanel.innerHTML = `
      <div class="qiqi-chat-header">
        <div class="close-btn" id="qiqi-close-btn" title="关闭">×</div>
        <div class="avatar">
          <canvas id="qiqi-header-avatar" width="68" height="68"></canvas>
        </div>
        <div class="info">
          <div class="name">栖栖</div>
          <div class="status">● 在线</div>
        </div>
      </div>
      <div class="qiqi-chat-body" id="qiqi-chat-body"></div>
      <div class="qiqi-chat-input-bar">
        <textarea
          class="qiqi-chat-input"
          id="qiqi-chat-input"
          rows="1"
          placeholder="跟栖栖说点什么…"
        ></textarea>
        <button class="qiqi-send-btn" id="qiqi-send-btn" title="发送">↑</button>
      </div>
    `;

    document.body.appendChild(chatPanel);

    closeBtn = chatPanel.querySelector('#qiqi-close-btn');
    chatBody = chatPanel.querySelector('#qiqi-chat-body');
    chatInput = chatPanel.querySelector('#qiqi-chat-input');
    sendBtn = chatPanel.querySelector('#qiqi-send-btn');
    headerAvatar = chatPanel.querySelector('#qiqi-header-avatar');

    // 初始化静态头像
    createMiniMochiCanvas(headerAvatar);
  }

  /**
   * 绑定事件
   */
  function bindEvents() {
    _bound.onPetClick = () => {
      if (!chatOpen && !notifyShown) {
        showNotify();
      } else if (notifyShown) {
        openChat();
      }
    };
    petEl.addEventListener('click', _bound.onPetClick);

    _bound.onBubbleClick = () => openChat();
    notifyBubble.addEventListener('click', _bound.onBubbleClick);

    _bound.onClose = () => closeChat();
    closeBtn.addEventListener('click', _bound.onClose);

    _bound.onSend = () => sendMsg();
    sendBtn.addEventListener('click', _bound.onSend);

    _bound.onKeyPress = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
      }
    };
    chatInput.addEventListener('keypress', _bound.onKeyPress);

    _bound.onInput = () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 80) + 'px';
    };
    chatInput.addEventListener('input', _bound.onInput);

    _bound.onResize = () => {
      // 视口变化时校正位置
      if (curX + PET_W > window.innerWidth) {
        curX = window.innerWidth - PET_W - 10;
        petEl.style.left = curX + 'px';
      }
      if (curY + PET_H > window.innerHeight) {
        curY = window.innerHeight - PET_H - 10;
        petEl.style.top = curY + 'px';
      }
      updateBubblePos();
    };
    window.addEventListener('resize', _bound.onResize);
  }

  /**
   * 主循环
   */
  function mainLoop(now) {
    globalTime += 0.016;
    if (renderer) {
      renderer.mochi.bouncePhase += 0.016;
    }

    // 移动逻辑
    if (animating && renderer) {
      let t = (now - animStart) / MOVE_DURATION;
      if (t >= 1) {
        t = 1;
        animating = false;
        idleRemaining--;
        renderer.setMoveState('idle');
        if (idleRemaining <= 0) {
          scheduleNextWaypoint();
        }
      } else {
        renderer.setMoveState(currentPose);
      }
      const et = easeInOutCubic(t);
      curX = animFrom.x + (animTo.x - animFrom.x) * et;
      curY = animFrom.y + (animTo.y - animFrom.y) * et;
      petEl.style.left = curX + 'px';
      petEl.style.top = curY + 'px';
      updateBubblePos();
    }

    // 眨眼
    if (renderer) {
      renderer.updateBlink(globalTime);
      renderer.render(globalTime);
    }

    rafId = requestAnimationFrame(mainLoop);
  }

  /**
   * 调度下一个停靠点
   */
  function scheduleNextWaypoint() {
    if (chatOpen) return; // 聊天时不移动
    waypointTimer = setTimeout(() => {
      if (chatOpen) return;
      const wps = getWaypoints();
      wpIdx = (wpIdx + 1) % wps.length;
      const wp = wps[wpIdx];

      // 显示名字标签
      petEl.classList.add('show-tag');
      setTimeout(() => petEl.classList.remove('show-tag'), 2500);

      // 偶尔显示心情
      if (Math.random() > 0.6) showMood();

      idleRemaining = 1 + Math.floor(Math.random() * 2);
      startMoveTo(wp.x, wp.y, wp.pose);

      // 约 8 秒后再决策
      scheduleNextWaypoint();
    }, 6000 + Math.random() * 4000);
  }

  function startMoveTo(targetX, targetY, pose) {
    animFrom = { x: curX, y: curY };
    animTo = { x: targetX, y: targetY };
    animStart = performance.now();
    currentPose = pose;
    if (renderer) renderer.setMoveState(pose);
    animating = true;
  }

  /**
   * 气泡跟随
   */
  function updateBubblePos() {
    if (!notifyShown || !notifyBubble) return;
    const petCX = curX + PET_W / 2;
    let bx = petCX - BUBBLE_W / 2;
    let by = curY - 14;

    // 边界约束
    if (bx < 8) bx = 8;
    if (bx + BUBBLE_W > window.innerWidth - 8) {
      bx = window.innerWidth - BUBBLE_W - 8;
    }
    if (by < 60) by = 60;

    const bh = notifyBubble.offsetHeight || 80;
    notifyBubble.style.left = bx + 'px';
    notifyBubble.style.top = (by - bh) + 'px';

    // 尾巴位置
    const tailLeft = petCX - bx;
    const clampedTail = Math.max(16, Math.min(tailLeft, BUBBLE_W - 30));
    notifyTail.style.left = (clampedTail - 7) + 'px';
  }

  /**
   * 显示心情
   */
  function showMood() {
    if (!petMood) return;
    petMood.textContent = QIQI_MOODS[Math.floor(Math.random() * QIQI_MOODS.length)];
    petMood.classList.add('show');
    setTimeout(() => petMood.classList.remove('show'), 2500);
  }

  /**
   * 显示通知气泡
   */
  function showNotify() {
    if (chatOpen) return;
    notifyBubble.style.display = 'block';
    notifyBubble.classList.remove('enter');
    // 强制重排以重启动画
    void notifyBubble.offsetHeight;
    notifyBubble.classList.add('enter');

    notifyText.textContent = '';
    const msg = QIQI_MESSAGES[msgIdx % QIQI_MESSAGES.length].text;
    let i = 0;
    function type() {
      if (i < msg.length) {
        notifyText.textContent += msg[i];
        i++;
        updateBubblePos();
        typingTimer = setTimeout(type, 45);
      }
    }
    setTimeout(type, 300);
    notifyShown = true;
    updateBubblePos();

    // 通知超时自动消失
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      hideNotify();
    }, 15000);
  }

  function hideNotify() {
    notifyShown = false;
    notifyBubble.style.display = 'none';
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
  }

  /**
   * 聊天相关
   */
  function createMsgAvatarCanvas() {
    const c = document.createElement('canvas');
    c.width = 60;
    c.height = 60;
    createMiniMochiCanvas(c);
    return c;
  }

  function openChat() {
    hideNotify();
    chatPanel.classList.add('open');
    chatOpen = true;
    animating = false;

    if (chatBody.children.length === 0) {
      addTimeDivider();
      addMsg('qiqi', QIQI_MESSAGES[msgIdx % QIQI_MESSAGES.length].text);
      msgIdx++;
    }
    setTimeout(() => chatInput.focus(), 400);
  }

  function closeChat() {
    chatPanel.classList.remove('open');
    chatOpen = false;

    // 关闭后让团子继续闲逛
    if (renderer) {
      renderer.setMoveState('playing');
      setTimeout(() => {
        renderer.setMoveState(currentPose);
        setTimeout(() => {
          scheduleNextWaypoint();
          // 稍后再显示通知
          if (notifyTimer) clearTimeout(notifyTimer);
          notifyTimer = setTimeout(() => showNotify(), 8000 + Math.random() * 6000);
        }, 2000);
      }, 1800);
    }
  }

  function addTimeDivider() {
    const d = document.createElement('div');
    d.className = 'qiqi-time-divider';
    const now = new Date();
    d.textContent =
      '今天 ' +
      String(now.getHours()).padStart(2, '0') +
      ':' +
      String(now.getMinutes()).padStart(2, '0');
    chatBody.appendChild(d);
  }

  function addMsg(who, text) {
    const row = document.createElement('div');
    row.className = 'qiqi-msg-row ' + who;

    const avatar = document.createElement('div');
    avatar.className = 'qiqi-msg-avatar';
    if (who === 'qiqi') {
      avatar.appendChild(createMsgAvatarCanvas());
    } else {
      avatar.innerHTML = '<span>🧑</span>';
    }

    const bubble = document.createElement('div');
    bubble.className = 'qiqi-msg-bubble';

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatBody.appendChild(row);

    if (who === 'qiqi') {
      // 先显示打字动画
      bubble.innerHTML =
        '<div class="qiqi-typing-dots"><span></span><span></span><span></span></div>';
      chatBody.scrollTop = chatBody.scrollHeight;
      setTimeout(() => {
        bubble.textContent = '';
        typeBubble(text, bubble);
      }, 800);
    } else {
      bubble.textContent = text;
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }

  function typeBubble(text, el) {
    let i = 0;
    function t() {
      if (i < text.length) {
        el.textContent += text[i];
        i++;
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(t, 35);
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    }
    t();
  }

  function sendMsg() {
    const val = chatInput.value.trim();
    if (!val) return;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    addMsg('user', val);

    // 如果正在回复，忽略
    if (qiqiAI?.isStreaming) return;

    // 获取 AI 回复（流式 + 数据感知）
    (async () => {
      // 创建气泡（先显示打字动画）
      const row = document.createElement('div');
      row.className = 'qiqi-msg-row qiqi';

      const avatar = document.createElement('div');
      avatar.className = 'qiqi-msg-avatar';
      avatar.appendChild(createMsgAvatarCanvas());

      const bubble = document.createElement('div');
      bubble.className = 'qiqi-msg-bubble';
      bubble.innerHTML = '<div class="qiqi-typing-dots"><span></span><span></span><span></span></div>';

      row.appendChild(avatar);
      row.appendChild(bubble);
      chatBody.appendChild(row);
      chatBody.scrollTop = chatBody.scrollHeight;

      try {
        // 收集上下文数据
        let contextData = '';
        try {
          contextData = await collectWorkContext();
        } catch (e) {
          console.warn('[Qiqi] 收集上下文失败:', e);
        }

        // 开始流式回复
        await new Promise((resolve) => setTimeout(resolve, 600)); // 模拟思考
        bubble.textContent = '';

        const reply = await qiqiAI.streamChat(val, contextData, (chunk) => {
          bubble.textContent += chunk;
          chatBody.scrollTop = chatBody.scrollHeight;
        });

        if (!bubble.textContent) {
          bubble.textContent = reply;
        }
        chatBody.scrollTop = chatBody.scrollHeight;
      } catch (err) {
        console.warn('[Qiqi] AI 回复失败，降级到模拟:', err.message);
        // 降级到模拟回复
        const fallback = QIQI_REPLIES[Math.floor(Math.random() * QIQI_REPLIES.length)];
        bubble.textContent = fallback;
        if (qiqiAI) {
          qiqiAI.pushHistory('user', val);
          qiqiAI.pushHistory('assistant', fallback);
        }
      }
    })();
  }

  /**
   * 显示欢迎提示
   */
  function showWelcomeHint() {
    const hint = document.createElement('div');
    hint.className = 'qiqi-status-hint';
    hint.textContent = '栖栖会在页面里闲逛，点击它聊天 🍡';
    document.body.appendChild(hint);
    hintTimer = setTimeout(() => hint.remove(), 4500);
  }

  /**
   * 调度主动消息（每90分钟检查一次，按时段发送关心）
   */
  function scheduleProactiveMessages() {
    // 立即执行一次检查
    checkProactiveMessage();

    // 每 15 分钟检查一次（90分钟周期内多次检查确保不遗漏时段切换）
    const CHECK_INTERVAL = 15 * 60 * 1000;
    proactiveTimer = setInterval(() => {
      checkProactiveMessage();
    }, CHECK_INTERVAL);
  }

  /**
   * 检查并发送主动消息
   */
  async function checkProactiveMessage() {
    if (chatOpen) return;

    const greeting = getTimelyGreeting();
    const period = greeting.period;

    // 同一时段只发一次
    if (lastProactivePeriod === period) return;

    // 打开聊天窗口时也不弹
    if (!notifyShown) {
      let message = greeting.text;

      // 尝试用 AI 生成更个性化的消息
      try {
        const contextData = await collectWorkContext();
        const aiPrompt = `现在是${period}，请用栖栖的口吻，根据主人今天的工作台数据，发一句简短的关心消息（1-2句话，带emoji）。不要用Markdown格式，直接输出消息内容。`;

        // 如果 AI 空闲，用 AI 生成；否则用预设
        if (qiqiAI && !qiqiAI.isStreaming) {
          try {
            const aiMsg = await qiqiAI.chat(aiPrompt, contextData);
            if (aiMsg && aiMsg.length < 100) {
              message = aiMsg;
            }
          } catch (e) {
            // 降级用预设
          }
        }
      } catch (e) {
        // 忽略
      }

      // 显示到通知气泡
      showNotifyWithText(message);
      lastProactivePeriod = period;
    }
  }

  /**
   * 用指定文本显示通知气泡
   */
  function showNotifyWithText(text) {
    if (chatOpen) return;
    notifyBubble.style.display = 'block';
    notifyBubble.classList.remove('enter');
    void notifyBubble.offsetHeight;
    notifyBubble.classList.add('enter');

    notifyText.textContent = '';
    let i = 0;
    function type() {
      if (i < text.length) {
        notifyText.textContent += text[i];
        i++;
        updateBubblePos();
        typingTimer = setTimeout(type, 45);
      }
    }
    setTimeout(type, 300);
    notifyShown = true;
    updateBubblePos();

    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      hideNotify();
    }, 15000);
  }

  /**
   * 显示欢迎气泡（打开工作台3秒后）
   */
  async function showWelcomeBubble() {
    const greeting = getTimelyGreeting();
    let welcomeText = greeting.text;

    // 尝试 AI 生成更有温度的欢迎语
    if (qiqiAI) {
      try {
        const contextData = await collectWorkContext();
        const prompt = `主人刚刚打开了工作台，现在是${greeting.period}，请用栖栖的口吻说一句温暖的欢迎语（1-2句话，带emoji），可以结合主人今天的数据。直接输出消息内容。`;
        const aiWelcome = await qiqiAI.chat(prompt, contextData);
        if (aiWelcome && aiWelcome.length < 120) {
          welcomeText = aiWelcome;
        }
      } catch (e) {
        // 降级用预设
      }
    }

    showNotifyWithText(welcomeText);
  }

  /**
   * 初始化
   */
  function init() {
    if (initialized) return;
    initialized = true;

    console.log('[Qiqi] 栖栖团子伴侣初始化');

    // 构建 DOM
    buildDOM();

    // 初始化渲染器
    renderer = new MochiRenderer(petCanvas, PET_W);

    // 设置初始位置（左下角，避开左侧 sidebar 和底部 FAB）
    const isMobile = window.innerWidth <= 768;
    curX = isMobile ? 20 : 220;
    curY = window.innerHeight - 100;
    petEl.style.left = curX + 'px';
    petEl.style.top = curY + 'px';

    // 绑定事件
    bindEvents();

    // 初始化 AI
    qiqiAI = new QiqiAI();

    // 启动主循环
    rafId = requestAnimationFrame(mainLoop);

    // 启动移动调度（延迟一下等页面稳定）
    setTimeout(() => {
      scheduleNextWaypoint();
    }, 2000);

    // 3秒后弹出欢迎气泡
    welcomeTimer = setTimeout(() => {
      showWelcomeBubble();
    }, 3000);

    // 启动主动消息调度
    setTimeout(() => {
      scheduleProactiveMessages();
    }, 60000); // 1分钟后开始，避免欢迎气泡冲突

    // 欢迎提示
    showWelcomeHint();

    console.log('[Qiqi] 栖栖团子伴侣初始化完成');
  }

  /**
   * 打开聊天窗口（外部调用入口）
   */
  function open() {
    if (!initialized) init();
    openChat();
  }

  /**
   * 销毁
   */
  function destroy() {
    if (!initialized) return;
    initialized = false;

    console.log('[Qiqi] 栖栖团子伴侣销毁');

    // 停止主循环
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    // 清理定时器
    if (waypointTimer) { clearTimeout(waypointTimer); waypointTimer = null; }
    if (notifyTimer) { clearTimeout(notifyTimer); notifyTimer = null; }
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
    if (proactiveTimer) { clearInterval(proactiveTimer); proactiveTimer = null; }
    if (welcomeTimer) { clearTimeout(welcomeTimer); welcomeTimer = null; }

    // 销毁渲染器
    if (renderer) {
      renderer.destroy();
      renderer = null;
    }

    // 移除事件
    if (petEl && _bound.onPetClick) petEl.removeEventListener('click', _bound.onPetClick);
    if (notifyBubble && _bound.onBubbleClick) notifyBubble.removeEventListener('click', _bound.onBubbleClick);
    if (closeBtn && _bound.onClose) closeBtn.removeEventListener('click', _bound.onClose);
    if (sendBtn && _bound.onSend) sendBtn.removeEventListener('click', _bound.onSend);
    if (chatInput && _bound.onKeyPress) chatInput.removeEventListener('keypress', _bound.onKeyPress);
    if (chatInput && _bound.onInput) chatInput.removeEventListener('input', _bound.onInput);
    if (_bound.onResize) window.removeEventListener('resize', _bound.onResize);

    // 移除 DOM
    if (petEl) { petEl.remove(); petEl = null; }
    if (notifyBubble) { notifyBubble.remove(); notifyBubble = null; }
    if (chatPanel) { chatPanel.remove(); chatPanel = null; }

    chatOpen = false;
    notifyShown = false;
    chatBody = null;
    chatInput = null;
    sendBtn = null;
    closeBtn = null;
    headerAvatar = null;
    petCanvas = null;
    petTag = null;
    petMood = null;
    notifyText = null;
    notifyTail = null;

    console.log('[Qiqi] 栖栖团子伴侣已销毁');
  }

  return {
    init,
    destroy,
    open,
    createMiniMochiCanvas,
  };
})();

export default QiqiModule;
