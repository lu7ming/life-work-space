/**
 * 生命树模块 - 人生工作台
 * Canvas 2D 渲染可视化生命树，用户的日常行为滋养这棵树
 */
const LifeTreeModule = (() => {
  'use strict';

  // ===== 状态 =====
  let canvas, ctx;
  let animFrame = null;
  let canvasW = 0, canvasH = 0;
  let dpr = 1;
  let particles = [];
  let time = 0;

  // 数据状态
  let weatherData = { type: 'cloudy', label: '多云', emoji: '☁️' };
  let seasonData = { type: 'spring', label: '春', emoji: '🌱' };
  let soilState = { moisture: 50, fertility: 50, temperature: 50, sunlight: 50 };
  let dimensions = [];
  let checkinRate7d = 0;
  let totalCheckins = 0;
  let recentActive = true;

  // ===== 配置常量 =====
  const DIMENSIONS = [
    { key: 'health',    icon: '🌿', name: '健康', color: '#6BBF6A', desc: '运动 · 饮水 · 作息',
      checkins: ['exercise','drink-water','early-sleep'], soilKey: 'fertility' },
    { key: 'learning',  icon: '📚', name: '学习', color: '#5B9BD5', desc: '阅读 · 课程 · 技能',
      checkins: ['reading','study'], soilKey: null },
    { key: 'finance',   icon: '💰', name: '财务', color: '#E8A87C', desc: '记账 · 理财 · 规划',
      checkins: ['finance'], soilKey: null },
    { key: 'creation',  icon: '✍️', name: '创作', color: '#C084B8', desc: '日记 · 写作 · 灵感',
      checkins: ['journal'], soilKey: 'temperature' },
    { key: 'discipline', icon: '🎯', name: '自律', color: '#E8C84A', desc: '温水 · 拉伸 · 早起',
      checkins: ['warm-water','early-sleep','stretch'], soilKey: 'sunlight' },
    { key: 'social',    icon: '👥', name: '社交', color: '#E87C7C', desc: '联系 · 互动 · 陪伴',
      checkins: [], soilKey: null }
  ];

  const WEATHER_TYPES = {
    sunny:    { emoji: '☀️', label: '晴天',  skyTop: '#87CEEB', skyBot: '#E8F4FD', particle: 'sparkle' },
    cloudy:   { emoji: '☁️', label: '多云',  skyTop: '#B0C4DE', skyBot: '#D6E4F0', particle: 'none' },
    rainy:    { emoji: '🌧️', label: '小雨',  skyTop: '#708090', skyBot: '#A9B8C8', particle: 'rain' },
    starry:   { emoji: '🌙', label: '星空',  skyTop: '#1a1a3e', skyBot: '#2d2d5e', particle: 'star' },
    rainbow:  { emoji: '🌈', label: '彩虹',  skyTop: '#87CEEB', skyBot: '#F0E6FF', particle: 'sparkle' },
    dormant:  { emoji: '💤', label: '休眠',  skyTop: '#6B6B6B', skyBot: '#9E9E9E', particle: 'none' }
  };

  const SEASON_THEMES = {
    spring: { emoji: '🌱', label: '春', groundColor: '#7CB342', leafTint: [100, 200, 100] },
    summer: { emoji: '☀️', label: '夏', groundColor: '#558B2F', leafTint: [60, 180, 60] },
    autumn: { emoji: '🍂', label: '秋', groundColor: '#BF8C2F', leafTint: [200, 160, 50] },
    winter: { emoji: '❄️', label: '冬', groundColor: '#9E9E9E', leafTint: [140, 180, 160] }
  };

  // ===== 工具函数 =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function daysBetween(d1, d2) {
    const ms = 86400000;
    return Math.abs(Math.floor(new Date(d1) / ms) - Math.floor(new Date(d2) / ms));
  }

  function getMonth() { return new Date().getMonth() + 1; }

  function getHour() { return new Date().getHours(); }

  function dateStr(d) {
    const dt = d || new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }

  // ===== 安全数据加载 =====
  async function safeGetAll(storeName) {
    try {
      return await Storage.getAll(storeName) || [];
    } catch (e) {
      console.warn(`[LifeTree] 读取 ${storeName} 失败:`, e);
      return [];
    }
  }

  // ===== 数据加载与计算 =====
  async function loadData() {
    const checkins = await safeGetAll('checkins');
    const tasks = await safeGetAll('tasks');
    const finance = await safeGetAll('finance');
    const books = await safeGetAll('books');
    const health = await safeGetAll('health');
    const contacts = await safeGetAll('contacts');

    // journal 可能不存在
    let journal = [];
    try { journal = await Storage.getAll('journal') || []; } catch(e) {}

    // 计算近7天打卡率
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysAgoStr = dateStr(sevenDaysAgo);

    let checkinsIn7d = 0;
    let maxPossible = 7; // 最多7天
    const checkinDates = new Set();

    checkins.forEach(c => {
      const d = c.date || '';
      if (d >= sevenDaysAgoStr && d <= dateStr(today)) {
        checkinDates.add(d);
      }
    });
    checkinsIn7d = checkinDates.size;
    checkinRate7d = Math.round((checkinsIn7d / maxPossible) * 100);
    totalCheckins = checkins.length;

    // 检测连续3天无数据
    const allDates = new Set();
    checkins.forEach(c => c.date && allDates.add(c.date));
    const last3 = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last3.push(dateStr(d));
    }
    recentActive = last3.some(d => allDates.has(d));

    // 季节
    const month = getMonth();
    if (month >= 3 && month <= 5) seasonData = { type: 'spring', label: '春', emoji: '🌱' };
    else if (month >= 6 && month <= 8) seasonData = { type: 'summer', label: '夏', emoji: '☀️' };
    else if (month >= 9 && month <= 11) seasonData = { type: 'autumn', label: '秋', emoji: '🍂' };
    else seasonData = { type: 'winter', label: '冬', emoji: '❄️' };

    // 天气
    weatherData = calculateWeather();

    // 土壤状态
    soilState = calculateSoil(checkins, health, journal);

    // 六大维度分数
    dimensions = calculateDimensions(checkins, tasks, finance, books, journal, contacts);
  }

  function calculateWeather() {
    const hour = getHour();

    // 深夜优先
    if (hour >= 0 && hour < 5) {
      return { type: 'starry', label: '星空', emoji: '🌙' };
    }

    // 休眠检测
    if (!recentActive) {
      return { type: 'dormant', label: '休眠', emoji: '💤' };
    }

    // 彩虹：本月里程碑（简化：近7天打卡率100%）
    if (checkinRate7d >= 100) {
      return { type: 'rainbow', label: '彩虹', emoji: '🌈' };
    }

    // 常规天气
    if (checkinRate7d >= 80) {
      return { type: 'sunny', label: '晴天', emoji: '☀️' };
    } else if (checkinRate7d >= 50) {
      return { type: 'cloudy', label: '多云', emoji: '☁️' };
    } else {
      return { type: 'rainy', label: '小雨', emoji: '🌧️' };
    }
  }

  function calculateSoil(checkins, health, journal) {
    // 湿度：喝水打卡
    const waterCount = checkins.filter(c => c.checkins && c.checkins.includes('drink-water')).length;
    const moisture = clamp(waterCount * 8, 0, 100);

    // 肥力：运动
    const exerciseCount = checkins.filter(c => c.checkins && c.checkins.includes('exercise')).length;
    const healthCount = health.length;
    const fertility = clamp((exerciseCount * 10 + healthCount * 3), 0, 100);

    // 温度：情绪（日记 mood）
    let moodSum = 0, moodCount = 0;
    journal.forEach(j => {
      if (j.mood) {
        moodSum += typeof j.mood === 'number' ? j.mood : 3;
        moodCount++;
      }
    });
    const avgMood = moodCount > 0 ? moodSum / moodCount : 3;
    const temperature = clamp((avgMood / 5) * 100, 10, 100);

    // 阳光：作息规律
    const earlySleepCount = checkins.filter(c => c.checkins && c.checkins.includes('early-sleep')).length;
    const sunlight = clamp(earlySleepCount * 12, 0, 100);

    return { moisture, fertility, temperature, sunlight };
  }

  function calculateDimensions(checkins, tasks, finance, books, journal, contacts) {
    return DIMENSIONS.map(dim => {
      let score = 0;
      let detail = '';

      if (dim.key === 'health') {
        const count = checkins.filter(c => c.checkins && dim.checkins.some(k => c.checkins.includes(k))).length;
        score = clamp(count * 5, 0, 100);
        detail = `${count} 次打卡`;
      } else if (dim.key === 'learning') {
        const ckCount = checkins.filter(c => c.checkins && dim.checkins.some(k => c.checkins.includes(k))).length;
        score = clamp(ckCount * 5 + books.length * 8, 0, 100);
        detail = `${ckCount} 次打卡 · ${books.length} 本书`;
      } else if (dim.key === 'finance') {
        const ckCount = checkins.filter(c => c.checkins && dim.checkins.some(k => c.checkins.includes(k))).length;
        score = clamp(ckCount * 5 + finance.length * 3, 0, 100);
        detail = `${ckCount} 次打卡 · ${finance.length} 条记录`;
      } else if (dim.key === 'creation') {
        const ckCount = checkins.filter(c => c.checkins && dim.checkins.some(k => c.checkins.includes(k))).length;
        score = clamp(ckCount * 5 + journal.length * 4, 0, 100);
        detail = `${ckCount} 次打卡 · ${journal.length} 篇日记`;
      } else if (dim.key === 'discipline') {
        const ckCount = checkins.filter(c => c.checkins && dim.checkins.some(k => c.checkins.includes(k))).length;
        const doneTasks = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
        score = clamp(ckCount * 4 + doneTasks * 3, 0, 100);
        detail = `${ckCount} 次打卡 · ${doneTasks} 项完成`;
      } else if (dim.key === 'social') {
        score = clamp(contacts.length * 10, 0, 100);
        detail = `${contacts.length} 位联系人`;
      }

      return { ...dim, score, detail };
    });
  }

  // ===== Canvas 渲染 =====
  function initCanvas() {
    canvas = document.getElementById('lifetreeCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const bottomInfo = document.getElementById('canvasBottomInfo');
    const bottomH = bottomInfo ? bottomInfo.offsetHeight : 40;
    canvasW = rect.width;
    canvasH = rect.height - bottomH;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawFrame() {
    time += 0.016;
    ctx.clearRect(0, 0, canvasW, canvasH);

    drawSky();
    drawWeatherParticles();
    drawGround();
    drawTree();
    drawWeatherEffects();

    animFrame = requestAnimationFrame(drawFrame);
  }

  // 天空渐变
  function drawSky() {
    const wConfig = WEATHER_TYPES[weatherData.type] || WEATHER_TYPES.cloudy;
    const grad = ctx.createLinearGradient(0, 0, 0, canvasH * 0.7);
    grad.addColorStop(0, wConfig.skyTop);
    grad.addColorStop(1, wConfig.skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // 地面
  function drawGround() {
    const season = SEASON_THEMES[seasonData.type] || SEASON_THEMES.spring;
    const groundY = canvasH * 0.78;

    // 土壤层渐变
    const grad = ctx.createLinearGradient(0, groundY, 0, canvasH);
    grad.addColorStop(0, season.groundColor);
    grad.addColorStop(0.3, '#6D4C2A');
    grad.addColorStop(1, '#4A3520');
    ctx.fillStyle = grad;

    // 地面曲线
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(canvasW * 0.25, groundY - 12, canvasW * 0.5, groundY - 4);
    ctx.quadraticCurveTo(canvasW * 0.75, groundY + 6, canvasW, groundY - 2);
    ctx.lineTo(canvasW, canvasH);
    ctx.lineTo(0, canvasH);
    ctx.closePath();
    ctx.fill();

    // 土壤纹理点
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 20; i++) {
      const px = (i * 53 + time * 2) % canvasW;
      const py = groundY + 15 + (i * 17) % 30;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 树
  function drawTree() {
    const baseX = canvasW * 0.5;
    const baseY = canvasH * 0.78;
    const treeHeight = canvasH * 0.45;

    // 土壤影响：肥力影响树干粗细
    const trunkWidth = lerp(6, 18, soilState.fertility / 100);
    const healthFactor = soilState.moisture / 100; // 翠绿程度

    // 树干（贝塞尔曲线）
    drawTrunk(baseX, baseY, treeHeight, trunkWidth);

    // 6个分支
    const avgScore = dimensions.length > 0
      ? dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length
      : 30;
    const branchLength = lerp(40, 90, avgScore / 100);

    dimensions.forEach((dim, i) => {
      const angle = -Math.PI / 2 + (i - 2.5) * (Math.PI / 7);
      const len = lerp(branchLength * 0.5, branchLength, dim.score / 100);
      const thickness = lerp(2, 6, dim.score / 100);
      const startX = baseX;
      const startY = baseY - treeHeight * (0.4 + i * 0.08);

      drawBranch(startX, startY, angle, len, thickness, dim.color);
      drawLeafCluster(startX + Math.cos(angle) * len, startY + Math.sin(angle) * len, dim.score, healthFactor, dim.color);
      drawBranchIcon(startX + Math.cos(angle) * len, startY + Math.sin(angle) * len, dim.icon);
    });

    // 树冠顶部叶子
    drawCanopy(baseX, baseY - treeHeight, healthFactor);
  }

  function drawTrunk(x, y, height, width) {
    const sway = Math.sin(time * 0.8) * 2;

    ctx.save();
    ctx.strokeStyle = '#6B4423';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x - width * 0.3, y - height * 0.3,
      x + sway + width * 0.2, y - height * 0.6,
      x + sway, y - height
    );
    ctx.stroke();

    // 树干纹理
    ctx.strokeStyle = 'rgba(90,50,20,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const ty = y - height * (0.15 + i * 0.2);
      ctx.beginPath();
      ctx.moveTo(x - width * 0.3, ty);
      ctx.quadraticCurveTo(x, ty - 5, x + width * 0.3, ty);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBranch(x, y, angle, length, thickness, color) {
    const sway = Math.sin(time * 1.2 + angle * 3) * 3;
    const endX = x + Math.cos(angle) * length + sway;
    const endY = y + Math.sin(angle) * length;
    const cpX = x + Math.cos(angle) * length * 0.5 + sway * 0.5;
    const cpY = y + Math.sin(angle) * length * 0.5 - 10;

    ctx.save();
    ctx.strokeStyle = '#7B5B3A';
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cpX, cpY, endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  function drawLeafCluster(x, y, score, healthFactor, color) {
    const season = SEASON_THEMES[seasonData.type] || SEASON_THEMES.spring;
    const tint = season.leafTint;
    const size = lerp(10, 28, score / 100);
    const count = Math.floor(lerp(3, 10, score / 100));

    ctx.save();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + time * 0.3;
      const r = size * (0.5 + Math.sin(a * 2 + time) * 0.2);
      const lx = x + Math.cos(a) * r;
      const ly = y + Math.sin(a) * r;
      const leafSize = lerp(4, 8, score / 100);

      // 翠绿程度由 healthFactor 决定
      const green = Math.floor(lerp(120, tint[1], healthFactor));
      const alpha = lerp(0.3, 0.8, score / 100);
      ctx.fillStyle = `rgba(${tint[0]},${green},${tint[2]},${alpha})`;

      ctx.beginPath();
      ctx.ellipse(lx, ly, leafSize, leafSize * 0.6, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBranchIcon(x, y, icon) {
    ctx.save();
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bob = Math.sin(time * 1.5 + x) * 2;
    ctx.fillText(icon, x, y + bob - 12);
    ctx.restore();
  }

  function drawCanopy(x, y, healthFactor) {
    const season = SEASON_THEMES[seasonData.type] || SEASON_THEMES.spring;
    const tint = season.leafTint;
    const green = Math.floor(lerp(120, tint[1], healthFactor));
    const avgScore = dimensions.length > 0
      ? dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length : 30;
    const canopySize = lerp(20, 50, avgScore / 100);

    ctx.save();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + time * 0.15;
      const r = canopySize * (0.6 + Math.sin(a * 3 + time) * 0.15);
      const lx = x + Math.cos(a) * r + Math.sin(time + i) * 2;
      const ly = y + Math.sin(a) * r * 0.6 - canopySize * 0.3;
      const leafSize = lerp(6, 14, avgScore / 100);
      const alpha = lerp(0.3, 0.7, avgScore / 100);

      ctx.fillStyle = `rgba(${tint[0]},${green},${tint[2]},${alpha})`;
      ctx.beginPath();
      ctx.ellipse(lx, ly, leafSize, leafSize * 0.7, a * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ===== 天气效果 =====
  function drawWeatherParticles() {
    const wType = weatherData.type;
    const pType = WEATHER_TYPES[wType]?.particle || 'none';

    if (pType === 'none') return;

    // 维护粒子池
    while (particles.length < 40) {
      particles.push(createParticle(pType));
    }

    ctx.save();
    particles.forEach(p => {
      updateParticle(p, pType);
      drawParticle(p, pType);
    });
    ctx.restore();
  }

  function createParticle(type) {
    if (type === 'rain') {
      return { x: Math.random() * canvasW, y: -10, speed: 3 + Math.random() * 4, size: 1 + Math.random() };
    } else if (type === 'sparkle') {
      return { x: Math.random() * canvasW, y: Math.random() * canvasH * 0.7, phase: Math.random() * Math.PI * 2, size: 1 + Math.random() * 2 };
    } else if (type === 'star') {
      return { x: Math.random() * canvasW, y: Math.random() * canvasH * 0.6, phase: Math.random() * Math.PI * 2, size: 0.5 + Math.random() * 1.5 };
    }
    return { x: 0, y: 0, speed: 0, size: 1 };
  }

  function updateParticle(p, type) {
    if (type === 'rain') {
      p.y += p.speed;
      if (p.y > canvasH * 0.8) { p.y = -10; p.x = Math.random() * canvasW; }
    }
    // sparkle and star just twinkle (phase-based, no movement)
  }

  function drawParticle(p, type) {
    if (type === 'rain') {
      ctx.strokeStyle = 'rgba(180,200,220,0.5)';
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 1, p.y + 8);
      ctx.stroke();
    } else if (type === 'sparkle') {
      const alpha = 0.3 + Math.sin(time * 2 + p.phase) * 0.4;
      ctx.fillStyle = `rgba(255,240,180,${Math.max(0, alpha)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'star') {
      const alpha = 0.2 + Math.sin(time * 1.5 + p.phase) * 0.5;
      ctx.fillStyle = `rgba(220,230,255,${Math.max(0, alpha)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 额外天气特效（彩虹弧等）
  function drawWeatherEffects() {
    if (weatherData.type === 'rainbow') {
      drawRainbow();
    }
  }

  function drawRainbow() {
    const colors = ['rgba(255,0,0,0.15)', 'rgba(255,165,0,0.15)', 'rgba(255,255,0,0.12)',
      'rgba(0,128,0,0.12)', 'rgba(0,0,255,0.12)', 'rgba(75,0,130,0.1)'];
    const cx = canvasW * 0.5;
    const cy = canvasH * 0.75;
    const baseR = canvasW * 0.35;

    ctx.save();
    colors.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + i * 7, Math.PI, 0);
      ctx.stroke();
    });
    ctx.restore();
  }

  // ===== HTML 面板渲染 =====
  function renderPanels() {
    renderSeasonWeather();
    renderSoil();
    renderDimensions();
    renderBottomTags();
    renderStats();
    renderFooter();
  }

  function renderSeasonWeather() {
    const sb = document.getElementById('seasonBadge');
    const wb = document.getElementById('weatherBadge');
    if (sb) sb.textContent = `${seasonData.emoji} ${seasonData.label}`;
    if (wb) {
      const w = WEATHER_TYPES[weatherData.type] || WEATHER_TYPES.cloudy;
      wb.textContent = `${w.emoji} ${w.label}`;
    }
  }

  function renderSoil() {
    const grid = document.getElementById('soilGrid');
    if (!grid) return;

    const items = [
      { icon: '💧', label: '湿度', value: soilState.moisture, color: '#5B9BD5', factor: '饮水' },
      { icon: '🌱', label: '肥力', value: soilState.fertility, color: '#6BBF6A', factor: '运动+饮食' },
      { icon: '🌡️', label: '温度', value: soilState.temperature, color: '#E8A87C', factor: '情绪' },
      { icon: '☀️', label: '阳光', value: soilState.sunlight, color: '#E8C84A', factor: '作息' }
    ];

    grid.innerHTML = items.map(it => `
      <div class="soil-item">
        <span class="soil-icon">${it.icon}</span>
        <div class="soil-info">
          <span class="soil-label">${it.label} · ${it.factor}</span>
          <span class="soil-value">${Math.round(it.value)}%</span>
          <div class="soil-bar">
            <div class="soil-bar-fill" style="width:${it.value}%;background:${it.color}"></div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderDimensions() {
    const list = document.getElementById('dimensionList');
    if (!list) return;

    list.innerHTML = dimensions.map(d => `
      <div class="dim-item">
        <span class="dim-emoji">${d.icon}</span>
        <div class="dim-content">
          <div class="dim-name">${escapeHtml(d.name)}</div>
          <div class="dim-desc">${escapeHtml(d.detail)}</div>
          <div class="dim-progress">
            <div class="dim-progress-fill" style="width:${d.score}%;background:${d.color}"></div>
          </div>
        </div>
        <span class="dim-score">${Math.round(d.score)}</span>
      </div>
    `).join('');
  }

  function renderBottomTags() {
    const container = document.getElementById('canvasBottomInfo');
    if (!container) return;

    container.innerHTML = dimensions.map(d => `
      <div class="dim-tag">
        <span class="dim-icon">${d.icon}</span>
        <span>${escapeHtml(d.name)}</span>
        <div class="dim-bar">
          <div class="dim-bar-fill" style="width:${d.score}%;background:${d.color}"></div>
        </div>
      </div>
    `).join('');
  }

  function renderStats() {
    const row = document.getElementById('statsRow');
    if (!row) return;

    const w = WEATHER_TYPES[weatherData.type] || WEATHER_TYPES.cloudy;
    const totalScore = dimensions.length > 0
      ? Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length) : 0;

    row.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${totalCheckins}</div>
        <div class="stat-label">总打卡</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${checkinRate7d}%</div>
        <div class="stat-label">7日打卡率</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalScore}</div>
        <div class="stat-label">综合活力</div>
      </div>
    `;
  }

  function renderFooter() {
    const footer = document.getElementById('footerInfo');
    if (!footer) return;

    const tips = [];
    if (soilState.moisture < 30) tips.push('记得多喝水 💧');
    if (soilState.fertility < 30) tips.push('运动让枝干更强壮 🏃');
    if (soilState.temperature < 30) tips.push('写下今天的心情 📝');
    if (soilState.sunlight < 30) tips.push('早睡让阳光更灿烂 🌅');
    if (checkinRate7d >= 80) tips.push('继续保持，生命树在茁壮成长！');
    if (!recentActive) tips.push('生命树在等待你的滋养…');

    if (tips.length === 0) tips.push('用每一天的行动，滋养你的生命之树 🌱');
    footer.textContent = tips[0];
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 窗口大小变化时重绘
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeCanvas();
      }, 200);
    });
  }

  // ===== 初始化入口 =====
  async function init() {
    console.log('[LifeTree] 模块初始化...');

    try {
      await loadData();
    } catch (e) {
      console.warn('[LifeTree] 数据加载异常，使用默认值:', e);
    }

    initCanvas();
    renderPanels();
    bindEvents();

    // 启动动画
    drawFrame();

    console.log('[LifeTree] 初始化完成，天气:', weatherData.label, '季节:', seasonData.label);
  }

  // 必须返回 { init }
  return { init };
})();

// 自动初始化
document.addEventListener('DOMContentLoaded', () => {
  if (typeof LifeTreeModule !== 'undefined') {
    LifeTreeModule.init();
  }
});
