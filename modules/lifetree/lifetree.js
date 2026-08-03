/**
 * 生命树模块 - 人生工作台
 * SVG 渲染可视化生命树，用户的日常行为滋养这棵树
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';

export const LifeTreeModule = (() => {
  const { escapeHtml } = AppUtils;

  'use strict';

  // ===== 状态 =====
  let svgWrapper = null;
  let svgEl = null;

  // 数据状态
  let weatherData = { type: 'cloudy', label: '多云', emoji: '☁️' };

  // ===== 模块生命周期 =====
  let _eventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    console.log('[LifeTreeModule] 模块已销毁');
  }
  let seasonData = { type: 'spring', label: '春', emoji: '🌱' };
  let soilState = { moisture: 50, fertility: 50, temperature: 50, sunlight: 50 };
  let dimensions = [];
  let checkinRate7d = 0;
  let totalCheckins = 0;
  let recentActive = true;

  // ===== SVG 常量 =====
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VB_W = 600;
  const VB_H = 800;

  // 树结构参数
  const TRUNK_BASE_X = 300;
  const TRUNK_BASE_Y = 660;
  const TRUNK_TOP_X = 300;
  const TRUNK_TOP_Y = 270;
  const TRUNK_BASE_HALF_W = 22;
  const TRUNK_TOP_HALF_W = 5;

  // 分支配置（角度为SVG标准：0=右，负值=向上）
  const BRANCH_CONFIGS = [
    { angleDeg: -150, length: 155, startT: 0.35 },  // 左下
    { angleDeg: -115, length: 170, startT: 0.48 },  // 左上
    { angleDeg: -75,  length: 175, startT: 0.58 },  // 右上
    { angleDeg: -35,  length: 150, startT: 0.68 },  // 右下
    { angleDeg: -135, length: 145, startT: 0.80 },  // 高位左
    { angleDeg: -55,  length: 148, startT: 0.88 },  // 高位右
  ];

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
    cloudy:   { emoji: '☁️', label: '多云',  skyTop: '#B0C4DE', skyBot: '#D6E4F0', particle: 'cloud' },
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


  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function rand(min, max) { return min + Math.random() * (max - min); }

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

  // ===== SVG 工具函数 =====
  function svgCreate(tag) {
    return document.createElementNS(SVG_NS, tag);
  }

  function svgAttr(el, attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }

  function svgAdd(parent, tag, attrs) {
    const el = svgCreate(tag);
    if (attrs) svgAttr(el, attrs);
    parent.appendChild(el);
    return el;
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

    let journal = [];
    try { journal = await Storage.getAll('journal') || []; } catch(e) {}

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysAgoStr = dateStr(sevenDaysAgo);

    let checkinsIn7d = 0;
    let maxPossible = 7;
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

    const allDates = new Set();
    checkins.forEach(c => c.date && allDates.add(c.date));
    const last3 = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last3.push(dateStr(d));
    }
    recentActive = last3.some(d => allDates.has(d));

    const month = getMonth();
    if (month >= 3 && month <= 5) seasonData = { type: 'spring', label: '春', emoji: '🌱' };
    else if (month >= 6 && month <= 8) seasonData = { type: 'summer', label: '夏', emoji: '☀️' };
    else if (month >= 9 && month <= 11) seasonData = { type: 'autumn', label: '秋', emoji: '🍂' };
    else seasonData = { type: 'winter', label: '冬', emoji: '❄️' };

    weatherData = calculateWeather();
    soilState = calculateSoil(checkins, health, journal);
    dimensions = calculateDimensions(checkins, tasks, finance, books, journal, contacts);
  }

  function calculateWeather() {
    const hour = getHour();
    if (hour >= 0 && hour < 5) {
      return { type: 'starry', label: '星空', emoji: '🌙' };
    }
    if (!recentActive) {
      return { type: 'dormant', label: '休眠', emoji: '💤' };
    }
    if (checkinRate7d >= 100) {
      return { type: 'rainbow', label: '彩虹', emoji: '🌈' };
    }
    if (checkinRate7d >= 80) {
      return { type: 'sunny', label: '晴天', emoji: '☀️' };
    } else if (checkinRate7d >= 50) {
      return { type: 'cloudy', label: '多云', emoji: '☁️' };
    } else {
      return { type: 'rainy', label: '小雨', emoji: '🌧️' };
    }
  }

  function calculateSoil(checkins, health, journal) {
    const waterCount = checkins.filter(c => c.checkins && c.checkins.includes('drink-water')).length;
    const moisture = clamp(waterCount * 8, 0, 100);

    const exerciseCount = checkins.filter(c => c.checkins && c.checkins.includes('exercise')).length;
    const healthCount = health.length;
    const fertility = clamp((exerciseCount * 10 + healthCount * 3), 0, 100);

    let moodSum = 0, moodCount = 0;
    journal.forEach(j => {
      if (j.mood) {
        moodSum += typeof j.mood === 'number' ? j.mood : 3;
        moodCount++;
      }
    });
    const avgMood = moodCount > 0 ? moodSum / moodCount : 3;
    const temperature = clamp((avgMood / 5) * 100, 10, 100);

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

  // ===================================================
  // SVG 树生成
  // ===================================================

  function buildSVG() {
    // 清除旧SVG
    const old = svgWrapper.querySelector('svg');
    if (old) old.remove();

    const svg = svgCreate('svg');
    svgAttr(svg, {
      viewBox: `0 0 ${VB_W} ${VB_H}`,
      preserveAspectRatio: 'xMidYMid meet'
    });
    svg.classList.add('tree-svg');

    // 计算树相关数据
    const healthFactor = soilState.moisture / 100;
    const season = SEASON_THEMES[seasonData.type] || SEASON_THEMES.spring;
    const weatherConfig = WEATHER_TYPES[weatherData.type] || WEATHER_TYPES.cloudy;

    // 1. Defs（渐变 + 滤镜）
    buildDefs(svg, weatherConfig);

    // 2. 天空背景
    buildSky(svg, weatherConfig);

    // 3. 天气层
    buildWeatherLayer(svg, weatherData.type);

    // 4. 远景小山
    buildHills(svg, season);

    // 5. 地面
    buildGround(svg, season);

    // 6. 树干
    buildTrunk(svg);

    // 7. 树枝 + 叶簇 + emoji标记
    buildBranches(svg, healthFactor, season);

    // 8. 树冠装饰叶（填充区域）
    buildCanopyFill(svg, healthFactor, season);

    svgEl = svg;
    svgWrapper.insertBefore(svg, svgWrapper.firstChild);
  }

  // ----- Defs -----
  function buildDefs(svg, wConfig) {
    const defs = svgCreate('defs');

    // 天空渐变
    const skyGrad = svgAdd(defs, 'linearGradient', { id: 'sky-grad', x1: '0', y1: '0', x2: '0', y2: '1' });
    svgAdd(skyGrad, 'stop', { offset: '0%', 'stop-color': wConfig.skyTop });
    svgAdd(skyGrad, 'stop', { offset: '100%', 'stop-color': wConfig.skyBot });

    // 树干渐变
    const trunkGrad = svgAdd(defs, 'linearGradient', { id: 'trunk-grad', x1: '0', y1: '1', x2: '0', y2: '0' });
    svgAdd(trunkGrad, 'stop', { offset: '0%', 'stop-color': '#6B4423' });
    svgAdd(trunkGrad, 'stop', { offset: '50%', 'stop-color': '#8B6914' });
    svgAdd(trunkGrad, 'stop', { offset: '100%', 'stop-color': '#A0845C' });

    // 树枝渐变
    const branchGrad = svgAdd(defs, 'linearGradient', { id: 'branch-grad', x1: '0', y1: '1', x2: '0', y2: '0' });
    svgAdd(branchGrad, 'stop', { offset: '0%', 'stop-color': '#7B5B3A' });
    svgAdd(branchGrad, 'stop', { offset: '100%', 'stop-color': '#9B7B5A' });

    // 地面渐变
    const groundGrad = svgAdd(defs, 'linearGradient', { id: 'ground-grad', x1: '0', y1: '0', x2: '0', y2: '1' });
    svgAdd(groundGrad, 'stop', { offset: '0%', 'stop-color': '#7CB342' });
    svgAdd(groundGrad, 'stop', { offset: '40%', 'stop-color': '#6D4C2A' });
    svgAdd(groundGrad, 'stop', { offset: '100%', 'stop-color': '#4A3520' });

    // 阴影滤镜
    const shadowFilter = svgAdd(defs, 'filter', { id: 'shadow-filter', x: '-30%', y: '-30%', width: '160%', height: '160%' });
    svgAdd(shadowFilter, 'feDropShadow', { dx: '0', dy: '1.5', stdDeviation: '2.5', 'flood-color': 'rgba(0,0,0,0.25)' });

    // 发光滤镜（太阳/星星用）
    const glowFilter = svgAdd(defs, 'filter', { id: 'glow-filter', x: '-50%', y: '-50%', width: '200%', height: '200%' });
    const glowBlur = svgAdd(glowFilter, 'feGaussianBlur', { stdDeviation: '3', result: 'blur' });
    const glowMerge = svgAdd(glowFilter, 'feMerge');
    svgAdd(glowMerge, 'feMergeNode', { in: 'blur' });
    svgAdd(glowMerge, 'feMergeNode', { in: 'SourceGraphic' });

    // 太阳光晕渐变
    const sunGrad = svgAdd(defs, 'radialGradient', { id: 'sun-glow-grad', cx: '50%', cy: '50%', r: '50%' });
    svgAdd(sunGrad, 'stop', { offset: '0%', 'stop-color': 'rgba(255,240,180,0.6)' });
    svgAdd(sunGrad, 'stop', { offset: '50%', 'stop-color': 'rgba(255,220,100,0.2)' });
    svgAdd(sunGrad, 'stop', { offset: '100%', 'stop-color': 'rgba(255,200,50,0)' });

    // 彩虹渐变
    const rainbowGrad = svgAdd(defs, 'linearGradient', { id: 'rainbow-grad', x1: '0', y1: '0', x2: '1', y2: '0' });
    svgAdd(rainbowGrad, 'stop', { offset: '0%', 'stop-color': 'rgba(255,0,0,0.2)' });
    svgAdd(rainbowGrad, 'stop', { offset: '17%', 'stop-color': 'rgba(255,165,0,0.2)' });
    svgAdd(rainbowGrad, 'stop', { offset: '33%', 'stop-color': 'rgba(255,255,0,0.18)' });
    svgAdd(rainbowGrad, 'stop', { offset: '50%', 'stop-color': 'rgba(0,180,0,0.15)' });
    svgAdd(rainbowGrad, 'stop', { offset: '67%', 'stop-color': 'rgba(0,100,255,0.15)' });
    svgAdd(rainbowGrad, 'stop', { offset: '83%', 'stop-color': 'rgba(75,0,130,0.12)' });
    svgAdd(rainbowGrad, 'stop', { offset: '100%', 'stop-color': 'rgba(148,0,211,0.1)' });

    svg.appendChild(defs);
  }

  // ----- 天空 -----
  function buildSky(svg, wConfig) {
    svgAdd(svg, 'rect', {
      x: '0', y: '0', width: VB_W, height: VB_H,
      fill: 'url(#sky-grad)'
    });
  }

  // ----- 天气层 -----
  function buildWeatherLayer(svg, weatherType) {
    const g = svgAdd(svg, 'g', { class: 'weather-layer' });

    if (weatherType === 'sunny') {
      // 太阳光晕
      svgAdd(g, 'circle', {
        cx: '480', cy: '100', r: '80',
        fill: 'url(#sun-glow-grad)',
        class: 'sun-glow'
      });
      svgAdd(g, 'circle', {
        cx: '480', cy: '100', r: '30',
        fill: 'rgba(255,230,120,0.5)',
        filter: 'url(#glow-filter)',
        class: 'sun-core'
      });
    }

    if (weatherType === 'cloudy' || weatherType === 'rainy') {
      // 云朵
      const clouds = [
        { x: 80, y: 80, scale: 1.0 },
        { x: 350, y: 50, scale: 1.3 },
        { x: 500, y: 110, scale: 0.8 }
      ];
      clouds.forEach((c, i) => {
        const cloud = svgAdd(g, 'g', {
          class: 'cloud',
          transform: `translate(${c.x},${c.y}) scale(${c.scale})`
        });
        cloud.style.animationDelay = `${i * 3}s`;
        // 云朵由多个椭圆组成
        svgAdd(cloud, 'ellipse', { cx: '0', cy: '0', rx: '40', ry: '18', fill: 'rgba(255,255,255,0.6)' });
        svgAdd(cloud, 'ellipse', { cx: '-25', cy: '5', rx: '28', ry: '14', fill: 'rgba(255,255,255,0.5)' });
        svgAdd(cloud, 'ellipse', { cx: '25', cy: '5', rx: '30', ry: '15', fill: 'rgba(255,255,255,0.55)' });
        svgAdd(cloud, 'ellipse', { cx: '10', cy: '-8', rx: '25', ry: '13', fill: 'rgba(255,255,255,0.5)' });
      });
    }

    if (weatherType === 'rainy') {
      // 细密雨丝
      for (let i = 0; i < 35; i++) {
        const x = rand(20, VB_W - 20);
        const y = rand(50, 500);
        const line = svgAdd(g, 'line', {
          x1: x, y1: y,
          x2: x - 2, y2: y + rand(10, 18),
          stroke: 'rgba(180,200,220,0.4)',
          'stroke-width': rand(0.5, 1.2).toFixed(1),
          'stroke-linecap': 'round',
          class: 'raindrop'
        });
        line.style.animationDelay = `${rand(0, 2).toFixed(2)}s`;
        line.style.animationDuration = `${rand(0.8, 1.5).toFixed(2)}s`;
      }
    }

    if (weatherType === 'starry') {
      // 月亮
      svgAdd(g, 'circle', {
        cx: '480', cy: '90', r: '25',
        fill: 'rgba(240,240,210,0.8)',
        filter: 'url(#glow-filter)'
      });
      svgAdd(g, 'circle', {
        cx: '492', cy: '82', r: '20',
        fill: weatherData.type === 'starry' ? (WEATHER_TYPES.starry.skyTop) : '#1a1a3e'
      });
      // 星星
      for (let i = 0; i < 30; i++) {
        const star = svgAdd(g, 'circle', {
          cx: rand(20, VB_W - 20).toFixed(0),
          cy: rand(20, 400).toFixed(0),
          r: rand(0.5, 2).toFixed(1),
          fill: `rgba(220,230,255,${rand(0.3, 0.8).toFixed(2)})`,
          class: 'star-dot'
        });
        star.style.animationDelay = `${rand(0, 4).toFixed(2)}s`;
        star.style.animationDuration = `${rand(2, 5).toFixed(2)}s`;
      }
    }

    if (weatherType === 'rainbow') {
      // 彩虹弧
      svgAdd(g, 'path', {
        d: `M ${50} 580 A 280 280 0 0 1 550 580`,
        fill: 'none',
        stroke: 'url(#rainbow-grad)',
        'stroke-width': '18',
        'stroke-linecap': 'round',
        opacity: '0.5',
        class: 'rainbow-arc'
      });
      // 太阳光晕
      svgAdd(g, 'circle', {
        cx: '480', cy: '100', r: '60',
        fill: 'url(#sun-glow-grad)',
        class: 'sun-glow'
      });
    }

    if (weatherType === 'dormant') {
      // 飘落光点
      for (let i = 0; i < 15; i++) {
        const dot = svgAdd(g, 'circle', {
          cx: rand(50, VB_W - 50).toFixed(0),
          cy: rand(100, 600).toFixed(0),
          r: rand(1, 2.5).toFixed(1),
          fill: `rgba(200,200,180,${rand(0.2, 0.5).toFixed(2)})`,
          class: 'dormant-dot'
        });
        dot.style.animationDelay = `${rand(0, 5).toFixed(2)}s`;
        dot.style.animationDuration = `${rand(4, 8).toFixed(2)}s`;
      }
    }
  }

  // ----- 远景小山 -----
  function buildHills(svg, season) {
    const hillColor1 = season.groundColor;
    const hillColor2 = adjustColor(hillColor1, -20);
    const g = svgAdd(svg, 'g', { class: 'hills', opacity: '0.3' });

    // 远处山丘1
    svgAdd(g, 'path', {
      d: `M -20 660 Q 100 590, 200 640 Q 280 660, 350 650 L 350 670 L -20 670 Z`,
      fill: hillColor2
    });
    // 远处山丘2
    svgAdd(g, 'path', {
      d: `M 250 660 Q 400 580, 500 630 Q 580 655, 620 645 L 620 670 L 250 670 Z`,
      fill: hillColor1
    });
  }

  // ----- 地面 -----
  function buildGround(svg, season) {
    const g = svgAdd(svg, 'g', { class: 'ground-group' });

    // 草地层（弧线顶部）
    svgAdd(g, 'path', {
      d: `M 0 650 Q 100 638, 200 645 Q 300 655, 400 642 Q 500 632, 600 648 L 600 680 L 0 680 Z`,
      fill: season.groundColor,
      opacity: '0.85'
    });

    // 土壤层
    svgAdd(g, 'path', {
      d: `M 0 670 Q 150 662, 300 668 Q 450 674, 600 665 L 600 ${VB_H} L 0 ${VB_H} Z`,
      fill: '#8B6914',
      opacity: '0.7'
    });

    // 草根纹理
    svgAdd(g, 'path', {
      d: `M 0 660 Q 80 650, 180 658 Q 280 666, 380 654 Q 480 646, 600 658 L 600 675 Q 480 665, 380 672 Q 280 680, 180 672 Q 80 665, 0 674 Z`,
      fill: '#6D4C2A',
      opacity: '0.5'
    });

    // 小草装饰
    const grassPositions = [80, 150, 220, 380, 450, 520];
    grassPositions.forEach(gx => {
      const gy = 648 + Math.sin(gx * 0.05) * 8;
      svgAdd(g, 'path', {
        d: `M ${gx} ${gy} Q ${gx-3} ${gy-12}, ${gx-1} ${gy-18} M ${gx} ${gy} Q ${gx+4} ${gy-14}, ${gx+2} ${gy-20}`,
        stroke: '#5A8A30',
        'stroke-width': '1.5',
        fill: 'none',
        'stroke-linecap': 'round',
        opacity: '0.6'
      });
    });
  }

  // ----- 树干 -----
  function buildTrunk(svg) {
    const g = svgAdd(svg, 'g', { class: 'tree-trunk-group' });

    const bx = TRUNK_BASE_X;
    const by = TRUNK_BASE_Y;
    const tx = TRUNK_TOP_X;
    const ty = TRUNK_TOP_Y;
    const bw = TRUNK_BASE_HALF_W;
    const tw = TRUNK_TOP_HALF_W;

    // 有机弯曲的树干轮廓
    const d = [
      `M ${bx - bw} ${by}`,
      // 左边向上（微弯）
      `C ${bx - bw - 3} ${by - 130}, ${tx - tw - 8} ${ty + 130}, ${tx - tw} ${ty}`,
      // 顶部弧
      `Q ${tx} ${ty - tw * 0.8}, ${tx + tw} ${ty}`,
      // 右边向下
      `C ${tx + tw + 6} ${ty + 130}, ${bx + bw + 2} ${by - 130}, ${bx + bw} ${by}`,
      // 底部弧（圆润）
      `Q ${bx} ${by + 6}, ${bx - bw} ${by}`,
      'Z'
    ].join(' ');

    svgAdd(g, 'path', {
      d: d,
      fill: 'url(#trunk-grad)',
      class: 'tree-trunk'
    });

    // 树干纹理线
    const textures = [0.2, 0.4, 0.6, 0.8];
    textures.forEach(t => {
      const y = lerp(by, ty, t);
      const w = lerp(bw, tw, t);
      const cx = lerp(bx, tx, t);
      svgAdd(g, 'path', {
        d: `M ${cx - w * 0.6} ${y} Q ${cx} ${y - 4}, ${cx + w * 0.5} ${y + 2}`,
        stroke: 'rgba(60,35,10,0.15)',
        'stroke-width': '1',
        fill: 'none'
      });
    });
  }

  // ----- 获取树干上某位置的x坐标和宽度 -----
  function getTrunkPoint(t) {
    const x = lerp(TRUNK_BASE_X, TRUNK_TOP_X, t);
    const y = lerp(TRUNK_BASE_Y, TRUNK_TOP_Y, t);
    const w = lerp(TRUNK_BASE_HALF_W, TRUNK_TOP_HALF_W, t);
    return { x, y, w };
  }

  // ----- 树枝 + 叶簇 + emoji -----
  function buildBranches(svg, healthFactor, season) {
    const branchesG = svgAdd(svg, 'g', { class: 'branches-group' });
    const foliageG = svgAdd(svg, 'g', { class: 'foliage-group' });
    const markersG = svgAdd(svg, 'g', { class: 'markers-group' });

    const avgScore = dimensions.length > 0
      ? dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length
      : 30;

    dimensions.forEach((dim, i) => {
      const cfg = BRANCH_CONFIGS[i];
      const tp = getTrunkPoint(cfg.startT);

      // 分支长度和粗细受分数影响
      const lengthFactor = lerp(0.6, 1.0, dim.score / 100);
      const branchLen = cfg.length * lengthFactor;
      const thickness = lerp(3, 9, dim.score / 100);

      // 分支角度（转弧度）
      const angleRad = cfg.angleDeg * Math.PI / 180;

      // 计算分支终点
      const endX = tp.x + Math.cos(angleRad) * branchLen;
      const endY = tp.y + Math.sin(angleRad) * branchLen;

      // 控制点（在起点和终点之间，加入弯曲）
      const midX = tp.x + Math.cos(angleRad) * branchLen * 0.5;
      const midY = tp.y + Math.sin(angleRad) * branchLen * 0.5;
      // 垂直于分支方向的偏移，产生自然弯曲
      const perpAngle = angleRad + Math.PI / 2;
      const curveOffset = (i % 2 === 0 ? 1 : -1) * branchLen * 0.12;
      const cpX = midX + Math.cos(perpAngle) * curveOffset;
      const cpY = midY + Math.sin(perpAngle) * curveOffset;

      // 绘制主分支（填充的锥形路径）
      const branchPath = createBranchPath(tp.x, tp.y, cpX, cpY, endX, endY, thickness);
      const branchEl = svgAdd(branchesG, 'path', {
        d: branchPath,
        fill: '#7B5B3A',
        class: `branch branch-${dim.key}`,
        'data-dim': dim.key
      });
      branchEl.style.animationDelay = `${i * 0.3}s`;

      // 次级分支（2-3个）
      const subCount = 2 + (dim.score > 50 ? 1 : 0);
      for (let s = 0; s < subCount; s++) {
        const t = 0.4 + s * 0.22;
        // 分支上的点（通过二次贝塞尔插值）
        const pt = quadBezierPoint(tp.x, tp.y, cpX, cpY, endX, endY, t);
        // 次级分支角度（在主分支基础上偏移）
        const subAngle = angleRad + (s % 2 === 0 ? -0.5 : 0.5) + rand(-0.2, 0.2);
        const subLen = branchLen * rand(0.25, 0.4);
        const subEndX = pt.x + Math.cos(subAngle) * subLen;
        const subEndY = pt.y + Math.sin(subAngle) * subLen;
        const subCpX = pt.x + Math.cos(subAngle) * subLen * 0.5 + rand(-8, 8);
        const subCpY = pt.y + Math.sin(subAngle) * subLen * 0.5 + rand(-8, 8);
        const subThick = thickness * rand(0.2, 0.35);

        const subPath = createBranchPath(pt.x, pt.y, subCpX, subCpY, subEndX, subEndY, subThick);
        svgAdd(branchesG, 'path', {
          d: subPath,
          fill: '#8B6B4A',
          class: 'sub-branch',
          opacity: '0.8'
        });

        // 次级分支末端叶子
        addLeafCluster(foliageG, subEndX, subEndY, dim.score * 0.7, healthFactor, season, i * 10 + s * 3);
      }

      // 主分支末端叶簇
      addLeafCluster(foliageG, endX, endY, dim.score, healthFactor, season, i * 7);

      // 维度emoji标记
      addDimMarker(markersG, endX, endY, dim.icon, i);
    });
  }

  // ----- 创建分支填充路径（锥形） -----
  function createBranchPath(x1, y1, cpX, cpY, x2, y2, maxThick) {
    const minThick = Math.max(0.8, maxThick * 0.15);
    // 计算垂直方向
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);

    // 起点两端
    const s1x = x1 + perpX * maxThick / 2;
    const s1y = y1 + perpY * maxThick / 2;
    const s2x = x1 - perpX * maxThick / 2;
    const s2y = y1 - perpY * maxThick / 2;

    // 终点两端
    const e1x = x2 + perpX * minThick / 2;
    const e1y = y2 + perpY * minThick / 2;
    const e2x = x2 - perpX * minThick / 2;
    const e2y = y2 - perpY * minThick / 2;

    // 控制点偏移
    const cp1x = cpX + perpX * maxThick * 0.35;
    const cp1y = cpY + perpY * maxThick * 0.35;
    const cp2x = cpX - perpX * maxThick * 0.35;
    const cp2y = cpY - perpY * maxThick * 0.35;

    return `M ${s1x.toFixed(1)} ${s1y.toFixed(1)} `
         + `Q ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${e1x.toFixed(1)} ${e1y.toFixed(1)} `
         + `Q ${cpX.toFixed(1)} ${cpY.toFixed(1)}, ${e2x.toFixed(1)} ${e2y.toFixed(1)} `
         + `Q ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${s2x.toFixed(1)} ${s2y.toFixed(1)} `
         + `Q ${cpX.toFixed(1)} ${cpY.toFixed(1)}, ${s1x.toFixed(1)} ${s1y.toFixed(1)} Z`;
  }

  // ----- 二次贝塞尔曲线上的点 -----
  function quadBezierPoint(x0, y0, cx, cy, x1, y1, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
      y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
  }

  // ----- 叶簇 -----
  function addLeafCluster(parent, cx, cy, score, healthFactor, season, seed) {
    const tint = season.leafTint;
    const count = Math.floor(lerp(6, 16, score / 100));
    const spread = lerp(12, 30, score / 100);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + seed * 0.1;
      const dist = spread * (0.3 + Math.abs(Math.sin(angle * 2.5 + seed)) * 0.7);
      const lx = cx + Math.cos(angle) * dist;
      const ly = cy + Math.sin(angle) * dist;

      // 叶子大小
      const rx = lerp(5, 14, score / 100) * rand(0.7, 1.2);
      const ry = rx * rand(0.5, 0.7);

      // 颜色：healthFactor 控制翠绿度
      const baseGreen = lerp(140, tint[1], healthFactor);
      const greenVar = rand(-15, 15);
      const g = Math.floor(clamp(baseGreen + greenVar, 80, 220));
      const r = Math.floor(clamp(tint[0] + rand(-20, 20), 50, 220));
      const b = Math.floor(clamp(tint[2] + rand(-15, 15), 30, 160));
      const alpha = lerp(0.4, 0.85, score / 100);

      const rotation = (angle * 180 / Math.PI + rand(-20, 20)).toFixed(0);

      const leaf = svgAdd(parent, 'ellipse', {
        cx: lx.toFixed(1),
        cy: ly.toFixed(1),
        rx: rx.toFixed(1),
        ry: ry.toFixed(1),
        fill: `rgba(${r},${g},${b},${alpha.toFixed(2)})`,
        class: 'leaf',
        transform: `rotate(${rotation} ${lx.toFixed(1)} ${ly.toFixed(1)})`
      });

      // 随机延迟让摆动更自然
      leaf.style.animationDelay = `${rand(0, 3).toFixed(2)}s`;
      leaf.style.animationDuration = `${rand(2.5, 4.5).toFixed(2)}s`;
    }
  }

  // ----- 树冠装饰叶（填充中央区域使树冠更茂密） -----
  function buildCanopyFill(svg, healthFactor, season) {
    const g = svgAdd(svg, 'g', { class: 'canopy-fill' });
    const tint = season.leafTint;

    // 在树冠中心区域添加大量叶子
    const canopyCenterX = 300;
    const canopyCenterY = 380;
    const canopyRadiusX = 160;
    const canopyRadiusY = 120;

    const avgScore = dimensions.length > 0
      ? dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length
      : 30;

    // 基础叶子数（即使数据少也要茂盛）
    const baseCount = 50;
    const dataCount = Math.floor(lerp(0, 40, avgScore / 100));
    const totalCount = baseCount + dataCount;

    for (let i = 0; i < totalCount; i++) {
      // 使用黄金角分布实现自然散布
      const goldenAngle = 2.399963;
      const a = i * goldenAngle;
      const r = Math.sqrt(i / totalCount);
      const lx = canopyCenterX + Math.cos(a) * r * canopyRadiusX + rand(-15, 15);
      const ly = canopyCenterY + Math.sin(a) * r * canopyRadiusY + rand(-10, 10);

      // 排除树干区域
      if (Math.abs(lx - 300) < 25 && ly > 350) continue;

      const rx = rand(6, 16);
      const ry = rx * rand(0.45, 0.65);

      const baseGreen = lerp(130, tint[1], healthFactor);
      const greenVar = rand(-20, 20);
      const gv = Math.floor(clamp(baseGreen + greenVar, 70, 230));
      const rv = Math.floor(clamp(tint[0] + rand(-25, 25), 40, 220));
      const bv = Math.floor(clamp(tint[2] + rand(-15, 15), 20, 170));
      const alpha = rand(0.3, 0.7);

      const rotation = rand(0, 360).toFixed(0);

      const leaf = svgAdd(g, 'ellipse', {
        cx: lx.toFixed(1),
        cy: ly.toFixed(1),
        rx: rx.toFixed(1),
        ry: ry.toFixed(1),
        fill: `rgba(${rv},${gv},${bv},${alpha.toFixed(2)})`,
        class: 'leaf canopy-leaf',
        transform: `rotate(${rotation} ${lx.toFixed(1)} ${ly.toFixed(1)})`
      });
      leaf.style.animationDelay = `${rand(0, 4).toFixed(2)}s`;
      leaf.style.animationDuration = `${rand(3, 5).toFixed(2)}s`;
    }
  }

  // ----- 维度emoji标记 -----
  function addDimMarker(parent, x, y, emoji, index) {
    // 外层 <g> 仅负责定位，不参与动画（避免 CSS transform 覆盖 SVG transform）
    const outer = svgAdd(parent, 'g', {
      transform: `translate(${x.toFixed(0)},${(y - 28).toFixed(0)})`
    });
    // 内层 <g> 承载浮动动画
    const g = svgAdd(outer, 'g', { class: 'dim-marker' });
    g.style.animationDelay = `${index * 0.5}s`;

    // 背景圆
    svgAdd(g, 'circle', {
      cx: '0', cy: '0', r: '18',
      fill: 'rgba(255,255,255,0.85)',
      stroke: 'rgba(255,255,255,0.4)',
      'stroke-width': '2',
      filter: 'url(#shadow-filter)'
    });

    // emoji文字
    const text = svgAdd(g, 'text', {
      x: '0', y: '1',
      'font-size': '20',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      class: 'marker-emoji'
    });
    text.textContent = emoji;
  }

  // ----- 辅助：调整颜色亮度 -----
  function adjustColor(hex, amount) {
    hex = hex.replace('#', '');
    const r = clamp(parseInt(hex.substr(0, 2), 16) + amount, 0, 255);
    const g = clamp(parseInt(hex.substr(2, 2), 16) + amount, 0, 255);
    const b = clamp(parseInt(hex.substr(4, 2), 16) + amount, 0, 255);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  // ===== 右侧面板渲染 =====
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
    const container = document.getElementById('treeBottomInfo');
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
    let resizeTimer;
    _bindEvent(window, 'resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // SVG自适应，无需重绘，但面板可能需要刷新
      }, 200);
    });
  }

  // ===== 初始化入口 =====
  async function init() {
    console.log('[LifeTree] 模块初始化（SVG模式）...');

    svgWrapper = document.getElementById('svgWrapper');
    if (!svgWrapper) {
      console.error('[LifeTree] 找不到 svgWrapper 容器');
      return;
    }

    try {
      await loadData();
    } catch (e) {
      console.warn('[LifeTree] 数据加载异常，使用默认值:', e);
    }

    buildSVG();
    renderPanels();
    bindEvents();

    console.log('[LifeTree] 初始化完成，天气:', weatherData.label, '季节:', seasonData.label);
  }

  return { init, destroy };
})();

// 自动初始化
document.addEventListener('DOMContentLoaded', () => {
  if (typeof LifeTreeModule !== 'undefined') {
    LifeTreeModule.init();
  }
});
