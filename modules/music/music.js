/**
 * music.js - 音乐模块
 * 人生工作台 · Web Audio API 生成环境音、疗愈音、乐器音
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';


export const MusicModule = (() => {
  // ===== 状态 =====
  let audioCtx = null;
  let currentNodes = [];   // 当前播放的所有 AudioNode（用于停止时断开）
  let currentSources = []; // 当前播放的 BufferSource / OscillatorNode
  let gainNode = null;
  let isPlaying = false;
  let currentSoundId = null;
  let currentIntensity = null;
  let timerId = null;
  let timerRemaining = 0;
  let panelEl = null;

  // ===== 事件监听追踪 =====
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 声音配置 =====
  const SOUNDS = [
    // 自然声
    { id: 'rain-light', name: '小雨', emoji: '🌧️', description: '轻柔的雨声，适合专注', category: 'nature', type: 'rain', intensity: 'light' },
    { id: 'rain-medium', name: '中雨', emoji: '🌦️', description: '中等雨声，隔绝噪音', category: 'nature', type: 'rain', intensity: 'medium' },
    { id: 'rain-heavy', name: '暴雨', emoji: '⛈️', description: '倾盆大雨，沉浸体验', category: 'nature', type: 'rain', intensity: 'heavy' },
    { id: 'ocean', name: '海浪声', emoji: '🌊', description: '潮起潮落，心随浪静', category: 'nature', type: 'ocean' },
    { id: 'stream', name: '溪流声', emoji: '💧', description: '潺潺流水，自然白噪音', category: 'nature', type: 'stream' },
    { id: 'wind-light', name: '微风', emoji: '🍃', description: '轻柔微风，安然入睡', category: 'nature', type: 'wind', intensity: 'light' },
    { id: 'wind-heavy', name: '大风', emoji: '🌪️', description: '呼啸大风，隔绝世界', category: 'nature', type: 'wind', intensity: 'heavy' },
    { id: 'snow', name: '落雪声', emoji: '❄️', description: '轻柔落雪，极致宁静', category: 'nature', type: 'snow' },
    { id: 'campfire', name: '篝火声', emoji: '🔥', description: '噼啪篝火，温暖治愈', category: 'nature', type: 'campfire' },

    // 疗愈音
    { id: 'delta-wave', name: '脑波助眠', emoji: '🧠', description: 'Delta 双耳节拍，需耳机', category: 'healing', type: 'binaural', freq: 2, headphone: true },
    { id: 'healing-432', name: '432Hz', emoji: '✨', description: '宇宙频率，身心和谐', category: 'healing', type: 'sine', freq: 432 },
    { id: 'healing-528', name: '528Hz', emoji: '💜', description: '奇迹频率，修复DNA', category: 'healing', type: 'sine', freq: 528 },
    { id: 'singing-bowl', name: '颂钵音', emoji: '🔔', description: '深远共鸣，冥想入定', category: 'healing', type: 'singingBowl' },

    // 乐器/环境
    { id: 'piano', name: '钢琴轻音', emoji: '🎹', description: '柔和分解和弦，静心陪伴', category: 'ambient', type: 'piano' },
    { id: 'birds', name: '森林鸟鸣', emoji: '🐦', description: '百鸟争鸣，身临其境', category: 'ambient', type: 'birds' },
    { id: 'cafe', name: '咖啡厅', emoji: '☕', description: '模糊人声与餐具声', category: 'ambient', type: 'cafe' },

    // 经典噪声
    { id: 'white-noise', name: '白噪声', emoji: '🌊', description: '均匀频谱，专注力提升', category: 'noise', type: 'whiteNoise' },
    { id: 'pink-noise', name: '粉噪声', emoji: '🌸', description: '低频柔和，放松助眠', category: 'noise', type: 'pinkNoise' },
    { id: 'brown-noise', name: '棕噪声', emoji: '🍂', description: '深沉浑厚，屏蔽杂念', category: 'noise', type: 'brownNoise' },
  ];

  const TIMER_OPTIONS = [
    { label: '15分钟', value: 15 },
    { label: '30分钟', value: 30 },
    { label: '60分钟', value: 60 },
    { label: '不限', value: 0 }
  ];

  // ===== 音频引擎 =====

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // ===== 噪声 Buffer 生成 =====

  function createWhiteNoiseBuffer(ctx, duration = 2) {
    const size = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function createPinkNoiseBuffer(ctx, duration = 2) {
    const size = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < size; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buffer;
  }

  function createBrownNoiseBuffer(ctx, duration = 2) {
    const size = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < size; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  // ===== 声音生成函数 =====

  /**
   * 雨声：白噪声 + 低通滤波 + 随机脉冲模拟雨滴
   */
  function createRain(ctx, dest, intensity = 'light') {
    const nodes = [];
    const sources = [];

    // 基底噪声
    const noiseBuf = createWhiteNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = intensity === 'heavy' ? 3000 : intensity === 'medium' ? 2000 : 1200;
    lp.Q.value = 0.7;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = intensity === 'heavy' ? 200 : intensity === 'medium' ? 100 : 50;

    const rainGain = ctx.createGain();
    rainGain.gain.value = intensity === 'heavy' ? 0.7 : intensity === 'medium' ? 0.5 : 0.35;

    noiseSrc.connect(lp).connect(hp).connect(rainGain).connect(dest);
    noiseSrc.start();
    sources.push(noiseSrc);
    nodes.push(lp, hp, rainGain);

    // 雨滴脉冲层
    const dripBufSize = ctx.sampleRate * 4;
    const dripBuf = ctx.createBuffer(1, dripBufSize, ctx.sampleRate);
    const dripData = dripBuf.getChannelData(0);
    const dripFreq = intensity === 'heavy' ? 0.008 : intensity === 'medium' ? 0.004 : 0.002;
    for (let i = 0; i < dripBufSize; i++) {
      if (Math.random() < dripFreq) {
        const len = Math.floor(ctx.sampleRate * (0.005 + Math.random() * 0.015));
        for (let j = 0; j < len && (i + j) < dripBufSize; j++) {
          dripData[i + j] += (1 - j / len) * (0.3 + Math.random() * 0.3);
        }
      }
    }
    const dripSrc = ctx.createBufferSource();
    dripSrc.buffer = dripBuf;
    dripSrc.loop = true;

    const dripBp = ctx.createBiquadFilter();
    dripBp.type = 'bandpass';
    dripBp.frequency.value = 2500;
    dripBp.Q.value = 1.5;

    const dripGain = ctx.createGain();
    dripGain.gain.value = intensity === 'heavy' ? 0.5 : intensity === 'medium' ? 0.35 : 0.2;

    dripSrc.connect(dripBp).connect(dripGain).connect(dest);
    dripSrc.start();
    sources.push(dripSrc);
    nodes.push(dripBp, dripGain);

    return { nodes, sources };
  }

  /**
   * 海浪：低频噪声 + LFO 调制
   */
  function createOcean(ctx, dest) {
    const nodes = [];
    const sources = [];

    const noiseBuf = createBrownNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    lp.Q.value = 0.5;

    // LFO 调制增益，模拟潮起潮落
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08; // 约12秒一个周期

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.6;

    lfo.connect(lfoGain);
    lfoGain.connect(masterGain.gain);

    noiseSrc.connect(lp).connect(masterGain).connect(dest);
    lfo.start();
    noiseSrc.start();

    sources.push(noiseSrc, lfo);
    nodes.push(lp, lfoGain, masterGain);

    return { nodes, sources };
  }

  /**
   * 溪流：带通滤波噪声
   */
  function createStream(ctx, dest) {
    const nodes = [];
    const sources = [];

    const noiseBuf = createWhiteNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.8;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;

    // 缓慢调制
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 200;

    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.45;

    noiseSrc.connect(bp).connect(lp).connect(masterGain).connect(dest);
    lfo.start();
    noiseSrc.start();

    sources.push(noiseSrc, lfo);
    nodes.push(bp, lp, lfoGain, masterGain);

    return { nodes, sources };
  }

  /**
   * 风声：低频噪声 + 慢速 LFO
   */
  function createWind(ctx, dest, intensity = 'light') {
    const nodes = [];
    const sources = [];

    const noiseBuf = createWhiteNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = intensity === 'heavy' ? 1200 : 600;
    lp.Q.value = 0.5;

    // LFO 调制低通频率
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = intensity === 'heavy' ? 0.12 : 0.06;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = intensity === 'heavy' ? 500 : 200;

    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);

    const masterGain = ctx.createGain();
    masterGain.gain.value = intensity === 'heavy' ? 0.55 : 0.35;

    noiseSrc.connect(lp).connect(masterGain).connect(dest);
    lfo.start();
    noiseSrc.start();

    sources.push(noiseSrc, lfo);
    nodes.push(lp, lfoGain, masterGain);

    return { nodes, sources };
  }

  /**
   * 落雪声：极轻的带通滤波噪声 + 偶尔高频碎屑
   */
  function createSnow(ctx, dest) {
    const nodes = [];
    const sources = [];

    const noiseBuf = createWhiteNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.5;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.15;

    noiseSrc.connect(lp).connect(masterGain).connect(dest);
    noiseSrc.start();

    sources.push(noiseSrc);
    nodes.push(lp, masterGain);

    // 偶尔的雪粒碎屑
    const crBufSize = ctx.sampleRate * 4;
    const crBuf = ctx.createBuffer(1, crBufSize, ctx.sampleRate);
    const crData = crBuf.getChannelData(0);
    for (let i = 0; i < crBufSize; i++) {
      if (Math.random() < 0.0005) {
        const len = Math.floor(ctx.sampleRate * (0.002 + Math.random() * 0.005));
        for (let j = 0; j < len && (i + j) < crBufSize; j++) {
          crData[i + j] += (1 - j / len) * 0.1;
        }
      }
    }
    const crSrc = ctx.createBufferSource();
    crSrc.buffer = crBuf;
    crSrc.loop = true;

    const crBp = ctx.createBiquadFilter();
    crBp.type = 'bandpass';
    crBp.frequency.value = 4000;
    crBp.Q.value = 2;

    const crGain = ctx.createGain();
    crGain.gain.value = 0.15;

    crSrc.connect(crBp).connect(crGain).connect(dest);
    crSrc.start();

    sources.push(crSrc);
    nodes.push(crBp, crGain);

    return { nodes, sources };
  }

  /**
   * 篝火噼啪：随机脉冲 + 带通滤波
   */
  function createCampfire(ctx, dest) {
    const nodes = [];
    const sources = [];

    // 底层火焰噪声
    const noiseBuf = createBrownNoiseBuffer(ctx, 4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.5;

    const fireGain = ctx.createGain();
    fireGain.gain.value = 0.3;

    noiseSrc.connect(bp).connect(fireGain).connect(dest);
    noiseSrc.start();

    sources.push(noiseSrc);
    nodes.push(bp, fireGain);

    // 噼啪脉冲
    const crackBufSize = ctx.sampleRate * 6;
    const crackBuf = ctx.createBuffer(1, crackBufSize, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackBufSize; i++) {
      if (Math.random() < 0.002) {
        const len = Math.floor(ctx.sampleRate * (0.003 + Math.random() * 0.02));
        const amp = 0.2 + Math.random() * 0.4;
        for (let j = 0; j < len && (i + j) < crackBufSize; j++) {
          crackData[i + j] += (1 - j / len) * amp * (Math.random() * 2 - 1);
        }
      }
    }
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;
    crackSrc.loop = true;

    const crackBp = ctx.createBiquadFilter();
    crackBp.type = 'bandpass';
    crackBp.frequency.value = 2000;
    crackBp.Q.value = 2;

    const crackGain = ctx.createGain();
    crackGain.gain.value = 0.5;

    crackSrc.connect(crackBp).connect(crackGain).connect(dest);
    crackSrc.start();

    sources.push(crackSrc);
    nodes.push(crackBp, crackGain);

    return { nodes, sources };
  }

  /**
   * 双耳节拍（脑波助眠）
   * 基频 200Hz，左右声道差值 = 目标频率
   */
  function createBinaural(ctx, dest, targetFreq = 2) {
    const nodes = [];
    const sources = [];

    const baseFreq = 200;

    // 左声道
    const merger = ctx.createChannelMerger(2);

    const oscL = ctx.createOscillator();
    oscL.type = 'sine';
    oscL.frequency.value = baseFreq;

    const gainL = ctx.createGain();
    gainL.gain.value = 0.4;

    oscL.connect(gainL).connect(merger, 0, 0);
    oscL.start();

    // 右声道
    const oscR = ctx.createOscillator();
    oscR.type = 'sine';
    oscR.frequency.value = baseFreq + targetFreq;

    const gainR = ctx.createGain();
    gainR.gain.value = 0.4;

    oscR.connect(gainR).connect(merger, 0, 1);
    oscR.start();

    merger.connect(dest);

    sources.push(oscL, oscR);
    nodes.push(merger, gainL, gainR);

    return { nodes, sources };
  }

  /**
   * 固定频率正弦波（疗愈音）
   */
  function createSineTone(ctx, dest, freq = 432) {
    const nodes = [];
    const sources = [];

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // 轻微颤音
    const vibrato = ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 0.1;

    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 1.5; // ±1.5Hz 颤动

    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;

    osc.connect(masterGain).connect(dest);
    osc.start();
    vibrato.start();

    sources.push(osc, vibrato);
    nodes.push(vibratoGain, masterGain);

    return { nodes, sources };
  }

  /**
   * 颂钵音：多谐波叠加 + 指数衰减（循环重新触发）
   */
  function createSingingBowl(ctx, dest) {
    const nodes = [];
    const sources = [];

    const fundamental = 220; // A3
    const harmonics = [1, 2.01, 3.02, 4.05, 5.1]; // 略有偏移产生拍频
    const harmonicGains = [0.4, 0.25, 0.15, 0.08, 0.04];

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(dest);
    nodes.push(masterGain);

    // 用 BufferSource 循环播放一个长衰减音
    const duration = 8;
    const size = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(2, size, ctx.sampleRate);
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);

    for (let h = 0; h < harmonics.length; h++) {
      const freq = fundamental * harmonics[h];
      const amp = harmonicGains[h];
      for (let i = 0; i < size; i++) {
        const t = i / ctx.sampleRate;
        const envelope = Math.exp(-t * (0.3 + h * 0.2));
        const sample = Math.sin(2 * Math.PI * freq * t) * amp * envelope;
        leftData[i] += sample;
        rightData[i] += sample * 0.95; // 轻微差异产生空间感
      }
    }

    // 归一化
    let maxVal = 0;
    for (let i = 0; i < size; i++) {
      maxVal = Math.max(maxVal, Math.abs(leftData[i]), Math.abs(rightData[i]));
    }
    if (maxVal > 0) {
      const norm = 0.9 / maxVal;
      for (let i = 0; i < size; i++) {
        leftData[i] *= norm;
        rightData[i] *= norm;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(masterGain);
    src.start();

    sources.push(src);
    return { nodes, sources };
  }

  /**
   * 钢琴轻音：合成器模拟柔和分解和弦
   */
  function createPiano(ctx, dest) {
    const nodes = [];
    const sources = [];

    // C大调和弦进行：Cmaj7 → Am7 → Fmaj7 → G7
    const chords = [
      [261.63, 329.63, 392.00, 493.88],  // Cmaj7: C4 E4 G4 B4
      [220.00, 261.63, 329.63, 392.00],  // Am7: A3 C4 E4 G4
      [174.61, 220.00, 261.63, 329.63],  // Fmaj7: F3 A3 C4 E4
      [196.00, 246.94, 293.66, 349.23],  // G7: G3 B3 D4 F4
    ];

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.25;
    masterGain.connect(dest);
    nodes.push(masterGain);

    // 创建一个长 buffer，内含循环的和弦分解
    const chordDuration = 8; // 每个和弦8秒
    const totalDuration = chordDuration * chords.length;
    const totalSamples = ctx.sampleRate * totalDuration;
    const buffer = ctx.createBuffer(2, totalSamples, ctx.sampleRate);
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);

    for (let c = 0; c < chords.length; c++) {
      const chord = chords[c];
      const startSample = c * chordDuration * ctx.sampleRate;

      // 分解：每个音符间隔0.5秒
      for (let n = 0; n < chord.length; n++) {
        const noteStart = startSample + n * Math.floor(ctx.sampleRate * 0.5);
        const freq = chord[n];

        for (let i = noteStart; i < totalSamples && i < noteStart + ctx.sampleRate * 7; i++) {
          const t = (i - noteStart) / ctx.sampleRate;
          // ADSR: 快速attack，慢衰减
          const attack = Math.min(1, t / 0.01);
          const decay = Math.exp(-t * 0.4);
          const env = attack * decay;

          // 多谐波叠加
          let sample = 0;
          sample += Math.sin(2 * Math.PI * freq * t) * 0.5;
          sample += Math.sin(2 * Math.PI * freq * 2 * t) * 0.15;
          sample += Math.sin(2 * Math.PI * freq * 3 * t) * 0.05;
          sample += Math.sin(2 * Math.PI * freq * 4 * t) * 0.02;

          leftData[i] += sample * env * 0.3;
          rightData[i] += sample * env * 0.28;
        }
      }
    }

    // 归一化
    let maxVal = 0;
    for (let i = 0; i < totalSamples; i++) {
      maxVal = Math.max(maxVal, Math.abs(leftData[i]), Math.abs(rightData[i]));
    }
    if (maxVal > 0) {
      const norm = 0.85 / maxVal;
      for (let i = 0; i < totalSamples; i++) {
        leftData[i] *= norm;
        rightData[i] *= norm;
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(masterGain);
    src.start();

    sources.push(src);
    return { nodes, sources };
  }

  /**
   * 森林鸟鸣：高频振荡器 + 频率调制
   */
  function createBirds(ctx, dest) {
    const nodes = [];
    const sources = [];

    // 背景自然环境音（极轻）
    const bgBuf = createPinkNoiseBuffer(ctx, 4);
    const bgSrc = ctx.createBufferSource();
    bgSrc.buffer = bgBuf;
    bgSrc.loop = true;

    const bgBp = ctx.createBiquadFilter();
    bgBp.type = 'bandpass';
    bgBp.frequency.value = 2000;
    bgBp.Q.value = 0.5;

    const bgGain = ctx.createGain();
    bgGain.gain.value = 0.08;

    bgSrc.connect(bgBp).connect(bgGain).connect(dest);
    bgSrc.start();

    sources.push(bgSrc);
    nodes.push(bgBp, bgGain);

    // 鸟鸣：用 buffer 模拟多种鸟叫
    const dur = 10;
    const size = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(2, size, ctx.sampleRate);
    const lData = buffer.getChannelData(0);
    const rData = buffer.getChannelData(1);

    // 随机生成鸟叫片段
    for (let bird = 0; bird < 30; bird++) {
      const startSample = Math.floor(Math.random() * size * 0.8);
      const baseFreq = 2500 + Math.random() * 3000;
      const chirpLen = Math.floor(ctx.sampleRate * (0.05 + Math.random() * 0.2));
      const type = Math.random();

      for (let i = 0; i < chirpLen; i++) {
        const t = i / ctx.sampleRate;
        const idx = startSample + i;
        if (idx >= size) break;

        let freq;
        if (type < 0.3) {
          // 上升音调
          freq = baseFreq + t * 8000;
        } else if (type < 0.6) {
          // 下降音调
          freq = baseFreq - t * 4000;
        } else {
          // 颤音
          freq = baseFreq + Math.sin(t * 60) * 500;
        }

        const envelope = Math.sin(Math.PI * i / chirpLen);
        const sample = Math.sin(2 * Math.PI * freq * t) * envelope * 0.15;
        const pan = Math.random();
        lData[idx] += sample * (1 - pan);
        rData[idx] += sample * pan;
      }
    }

    const birdSrc = ctx.createBufferSource();
    birdSrc.buffer = buffer;
    birdSrc.loop = true;

    const birdGain = ctx.createGain();
    birdGain.gain.value = 0.6;

    birdSrc.connect(birdGain).connect(dest);
    birdSrc.start();

    sources.push(birdSrc);
    nodes.push(birdGain);

    return { nodes, sources };
  }

  /**
   * 咖啡厅氛围：模糊人声 + 餐具声
   */
  function createCafe(ctx, dest) {
    const nodes = [];
    const sources = [];

    // 模糊人声：多个带通滤波噪声层
    const voiceBuf = createPinkNoiseBuffer(ctx, 4);
    const voiceSrc = ctx.createBufferSource();
    voiceSrc.buffer = voiceBuf;
    voiceSrc.loop = true;

    const voiceBp = ctx.createBiquadFilter();
    voiceBp.type = 'bandpass';
    voiceBp.frequency.value = 800;
    voiceBp.Q.value = 1.5;

    const voiceBp2 = ctx.createBiquadFilter();
    voiceBp2.type = 'bandpass';
    voiceBp2.frequency.value = 1200;
    voiceBp2.Q.value = 2;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.2;

    // LFO 模拟人声起伏
    const voiceLfo = ctx.createOscillator();
    voiceLfo.type = 'sine';
    voiceLfo.frequency.value = 0.2;

    const voiceLfoGain = ctx.createGain();
    voiceLfoGain.gain.value = 0.08;

    voiceLfo.connect(voiceLfoGain);
    voiceLfoGain.connect(voiceGain.gain);

    voiceSrc.connect(voiceBp).connect(voiceBp2).connect(voiceGain).connect(dest);
    voiceLfo.start();
    voiceSrc.start();

    sources.push(voiceSrc, voiceLfo);
    nodes.push(voiceBp, voiceBp2, voiceGain, voiceLfoGain);

    // 餐具碰撞声
    const clinkBufSize = ctx.sampleRate * 6;
    const clinkBuf = ctx.createBuffer(1, clinkBufSize, ctx.sampleRate);
    const clinkData = clinkBuf.getChannelData(0);
    for (let i = 0; i < clinkBufSize; i++) {
      if (Math.random() < 0.0003) {
        const len = Math.floor(ctx.sampleRate * (0.005 + Math.random() * 0.015));
        for (let j = 0; j < len && (i + j) < clinkBufSize; j++) {
          clinkData[i + j] += Math.sin(2 * Math.PI * (3000 + Math.random() * 4000) * j / ctx.sampleRate)
            * (1 - j / len) * 0.15;
        }
      }
    }
    const clinkSrc = ctx.createBufferSource();
    clinkSrc.buffer = clinkBuf;
    clinkSrc.loop = true;

    const clinkBp = ctx.createBiquadFilter();
    clinkBp.type = 'highpass';
    clinkBp.frequency.value = 2000;

    const clinkGain = ctx.createGain();
    clinkGain.gain.value = 0.25;

    clinkSrc.connect(clinkBp).connect(clinkGain).connect(dest);
    clinkSrc.start();

    sources.push(clinkSrc);
    nodes.push(clinkBp, clinkGain);

    return { nodes, sources };
  }

  /**
   * 经典噪声（白/粉/棕）
   */
  function createNoise(ctx, dest, type = 'whiteNoise') {
    const nodes = [];
    const sources = [];

    let buf;
    switch (type) {
      case 'pinkNoise': buf = createPinkNoiseBuffer(ctx, 4); break;
      case 'brownNoise': buf = createBrownNoiseBuffer(ctx, 4); break;
      default: buf = createWhiteNoiseBuffer(ctx, 4);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;

    src.connect(masterGain).connect(dest);
    src.start();

    sources.push(src);
    nodes.push(masterGain);

    return { nodes, sources };
  }

  // ===== 播放控制 =====

  function startSound(soundId) {
    stopSound();

    const sound = SOUNDS.find(s => s.id === soundId);
    if (!sound) return;

    const ctx = ensureAudioContext();
    currentSoundId = soundId;
    currentIntensity = sound.intensity || null;

    // 创建增益节点
    gainNode = ctx.createGain();
    let savedVolume;
    try {
        savedVolume = parseFloat(localStorage.getItem('music_volume') || '0.5');
    } catch (e) {
        console.warn('localStorage.getItem failed:', e);
        savedVolume = 0.5;
    }
    gainNode.gain.value = savedVolume;
    gainNode.connect(ctx.destination);

    // 根据类型创建声音
    let result;
    switch (sound.type) {
      case 'rain':
        result = createRain(ctx, gainNode, sound.intensity);
        break;
      case 'ocean':
        result = createOcean(ctx, gainNode);
        break;
      case 'stream':
        result = createStream(ctx, gainNode);
        break;
      case 'wind':
        result = createWind(ctx, gainNode, sound.intensity);
        break;
      case 'snow':
        result = createSnow(ctx, gainNode);
        break;
      case 'campfire':
        result = createCampfire(ctx, gainNode);
        break;
      case 'binaural':
        result = createBinaural(ctx, gainNode, sound.freq || 2);
        break;
      case 'sine':
        result = createSineTone(ctx, gainNode, sound.freq || 432);
        break;
      case 'singingBowl':
        result = createSingingBowl(ctx, gainNode);
        break;
      case 'piano':
        result = createPiano(ctx, gainNode);
        break;
      case 'birds':
        result = createBirds(ctx, gainNode);
        break;
      case 'cafe':
        result = createCafe(ctx, gainNode);
        break;
      case 'whiteNoise':
      case 'pinkNoise':
      case 'brownNoise':
        result = createNoise(ctx, gainNode, sound.type);
        break;
      default:
        result = createNoise(ctx, gainNode, 'whiteNoise');
    }

    currentNodes = result.nodes || [];
    currentSources = result.sources || [];
    isPlaying = true;

    updatePanelUI();
  }

  function stopSound() {
    currentSources.forEach(src => {
      try { src.stop(); } catch (e) { /* already stopped */ }
      try { src.disconnect(); } catch (e) {}
    });
    currentNodes.forEach(n => {
      try { n.disconnect(); } catch (e) {}
    });
    if (gainNode) {
      try { gainNode.disconnect(); } catch (e) {}
    }

    currentSources = [];
    currentNodes = [];
    gainNode = null;
    isPlaying = false;
    currentSoundId = null;
    currentIntensity = null;

    updatePanelUI();
  }

  function setVolume(value) {
    if (gainNode) {
      gainNode.gain.value = value;
    }
    try {
        localStorage.setItem('music_volume', String(value));
    } catch (e) {
        console.warn('localStorage.setItem failed:', e);
    }
  }

  // ===== 定时器 =====

  function startTimer(minutes) {
    clearTimer();
    if (minutes <= 0) return;

    timerRemaining = minutes * 60;
    timerId = setInterval(() => {
      timerRemaining--;
      updateTimerDisplay();
      if (timerRemaining <= 0) {
        clearTimer();
        stopSound();
      }
    }, 1000);
    updateTimerDisplay();
  }

  function clearTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    timerRemaining = 0;
  }

  function updateTimerDisplay() {
    const el = panelEl?.querySelector('#music-timer-remaining');
    if (el && timerRemaining > 0) {
      const m = Math.floor(timerRemaining / 60);
      const s = timerRemaining % 60;
      el.textContent = `剩余 ${m}:${String(s).padStart(2, '0')}`;
      el.style.display = '';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  // ===== 可见性处理 =====

  function setupVisibilityHandler() {
    _bindEvent(document, 'visibilitychange', () => {
      if (!audioCtx || !isPlaying) return;
      if (document.visibilityState === 'visible' && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    });
  }

  // ===== 面板 UI =====

  function createPanel() {
    if (panelEl) return panelEl;

    panelEl = document.createElement('div');
    panelEl.className = 'music-panel';

    // 构建 HTML
    const categories = {
      nature: { title: '🌿 自然声', containerId: 'music-cards-nature' },
      healing: { title: '🧘 疗愈音', containerId: 'music-cards-healing' },
      ambient: { title: '🎹 乐器与环境', containerId: 'music-cards-ambient' },
      noise: { title: '🔊 经典噪声', containerId: 'music-cards-noise' },
    };

    // 分类标题
    let categoriesHTML = '';
    for (const [cat, cfg] of Object.entries(categories)) {
      categoriesHTML += `
        <div class="music-category">
          <div class="music-category-title">${cfg.title}</div>
          <div class="music-cards" id="${cfg.containerId}"></div>
        </div>
      `;
    }

    panelEl.innerHTML = `
      <div class="music-panel-header">
        <span class="music-panel-title">🎵 音乐</span>
        <button class="music-panel-close" id="music-close">✕</button>
      </div>
      <div class="music-panel-body">
        <div class="music-now-playing" id="music-now-playing" style="display:none;">
          <span class="music-now-emoji" id="music-now-emoji"></span>
          <span class="music-now-name" id="music-now-name"></span>
          <button class="music-now-stop" id="music-now-stop" title="停止">⏹</button>
        </div>
        <div class="music-volume">
          <span class="music-volume-icon">🔈</span>
          <input type="range" class="music-volume-slider" id="music-volume-slider" min="0" max="1" step="0.05" value="0.5">
          <span class="music-volume-icon">🔊</span>
        </div>
        <div class="music-timer">
          <span class="music-timer-label">定时关闭：</span>
          <div class="music-timer-options">
            ${TIMER_OPTIONS.map(opt => `
              <button class="music-timer-btn${opt.value === 0 ? ' active' : ''}" data-minutes="${opt.value}">${opt.label}</button>
            `).join('')}
          </div>
          <div class="music-timer-remaining" id="music-timer-remaining" style="display:none;"></div>
        </div>
        ${categoriesHTML}
      </div>
    `;

    document.body.appendChild(panelEl);
    renderCards();
    bindPanelEvents();
    return panelEl;
  }

  function renderCards() {
    if (!panelEl) return;

    // 按同 type 分组，用于合并档位切换
    const typeGroupMap = {}; // type -> [sound, sound, ...]
    const standalone = [];   // 无档位的声音

    SOUNDS.forEach(s => {
      // 检查是否有同 type 但不同 intensity 的
      const sameType = SOUNDS.filter(x => x.type === s.type && x.category === s.category);
      if (sameType.length > 1 && s.intensity) {
        if (!typeGroupMap[s.type]) {
          typeGroupMap[s.type] = sameType;
        }
      } else {
        // 只出现一次的或无档位的
        if (!standalone.find(x => x.id === s.id) && !Object.values(typeGroupMap).flat().find(x => x.id === s.id)) {
          standalone.push(s);
        }
      }
    });

    // 去重 standalone：移除已在 typeGroupMap 中的
    const groupedIds = new Set(Object.values(typeGroupMap).flat().map(s => s.id));
    const finalStandalone = SOUNDS.filter(s => !groupedIds.has(s.id));

    // 渲染独立卡片
    finalStandalone.forEach(sound => {
      const container = panelEl.querySelector(`#music-cards-${sound.category}`);
      if (!container) return;

      const card = document.createElement('div');
      card.className = 'music-card';
      card.dataset.soundId = sound.id;

      const headphoneTip = sound.headphone
        ? '<div class="music-card-headphone-tip">🎧 需佩戴耳机</div>'
        : '';

      card.innerHTML = `
        <span class="music-card-emoji">${sound.emoji}</span>
        <span class="music-card-name">${sound.name}</span>
        <span class="music-card-desc">${sound.description}</span>
        <button class="music-card-play" data-sound-id="${sound.id}">▶</button>
        ${headphoneTip}
      `;

      container.appendChild(card);
    });

    // 渲染带档位切换的卡片
    for (const [type, sounds] of Object.entries(typeGroupMap)) {
      const sound = sounds[0]; // 用第一个声音的信息作为卡片基础
      const container = panelEl.querySelector(`#music-cards-${sound.category}`);
      if (!container) continue;

      const card = document.createElement('div');
      card.className = 'music-card';
      card.dataset.soundType = type;

      const intensityBtns = sounds.map((s, i) => {
        const labels = { light: '轻', medium: '中', heavy: '强' };
        return `<button class="music-intensity-btn${i === 0 ? ' active' : ''}" data-sound-id="${s.id}" data-intensity="${s.intensity}">${labels[s.intensity] || s.intensity}</button>`;
      }).join('');

      card.innerHTML = `
        <span class="music-card-emoji">${sound.emoji}</span>
        <span class="music-card-name">${sound.type === 'rain' ? '雨声' : sound.type === 'wind' ? '风声' : sound.name}</span>
        <span class="music-card-desc">${sound.description}</span>
        <div class="music-card-intensity">${intensityBtns}</div>
        <button class="music-card-play" data-sound-id="${sounds[0].id}">▶</button>
      `;

      container.appendChild(card);
    }
  }

  function bindPanelEvents() {
    // 关闭
    _bindEvent(panelEl.querySelector('#music-close'), 'click', () => hidePanel());

    // 音量
    const slider = panelEl.querySelector('#music-volume-slider');
    let savedVol;
    try {
        savedVol = parseFloat(localStorage.getItem('music_volume') || '0.5');
    } catch (e) {
        console.warn('localStorage.getItem failed:', e);
        savedVol = 0.5;
    }
    slider.value = savedVol;
    _bindEvent(slider, 'input', (e) => setVolume(parseFloat(e.target.value)));

    // 定时
    panelEl.querySelectorAll('.music-timer-btn').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        panelEl.querySelectorAll('.music-timer-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (isPlaying) {
          startTimer(parseInt(btn.dataset.minutes));
        }
      });
    });

    // 停止按钮
    _bindEvent(panelEl.querySelector('#music-now-stop'), 'click', () => {
      stopSound();
      clearTimer();
    });

    // 播放按钮（事件委托）
    _bindEvent(panelEl, 'click', (e) => {
      const playBtn = e.target.closest('.music-card-play');
      if (playBtn) {
        const soundId = playBtn.dataset.soundId;
        if (isPlaying && currentSoundId === soundId) {
          stopSound();
          clearTimer();
        } else {
          startSound(soundId);
          const activeTimer = panelEl.querySelector('.music-timer-btn.active');
          if (activeTimer) startTimer(parseInt(activeTimer.dataset.minutes));
        }
        return;
      }

      // 档位切换
      const intBtn = e.target.closest('.music-intensity-btn');
      if (intBtn) {
        const card = intBtn.closest('.music-card');
        card.querySelectorAll('.music-intensity-btn').forEach(b => b.classList.remove('active'));
        intBtn.classList.add('active');
        // 更新播放按钮的 sound-id
        const playBtn = card.querySelector('.music-card-play');
        if (playBtn) playBtn.dataset.soundId = intBtn.dataset.soundId;
        // 如果正在播放此类型，切换档位
        const newSoundId = intBtn.dataset.soundId;
        const newSound = SOUNDS.find(s => s.id === newSoundId);
        if (isPlaying && newSound && currentSoundId) {
          const currentSound = SOUNDS.find(s => s.id === currentSoundId);
          if (currentSound && currentSound.type === newSound.type) {
            startSound(newSoundId);
          }
        }
      }
    });
  }

  function updatePanelUI() {
    if (!panelEl) return;

    // 更新当前播放状态
    const nowPlaying = panelEl.querySelector('#music-now-playing');
    const nowEmoji = panelEl.querySelector('#music-now-emoji');
    const nowName = panelEl.querySelector('#music-now-name');

    if (isPlaying && currentSoundId) {
      const sound = SOUNDS.find(s => s.id === currentSoundId);
      if (sound) {
        nowEmoji.textContent = sound.emoji;
        nowName.textContent = sound.name;
        nowPlaying.style.display = '';
      }
    } else {
      nowPlaying.style.display = 'none';
    }

    // 更新卡片状态
    panelEl.querySelectorAll('.music-card').forEach(card => {
      const playBtn = card.querySelector('.music-card-play');
      const soundId = playBtn?.dataset.soundId;

      if (isPlaying && soundId === currentSoundId) {
        card.classList.add('playing');
        playBtn.textContent = '⏸';
      } else {
        card.classList.remove('playing');
        playBtn.textContent = '▶';
      }
    });
  }

  // ===== 面板显隐 =====

  function showPanel() {
    if (!panelEl) createPanel();
    panelEl.classList.add('show');
  }

  function hidePanel() {
    if (panelEl) panelEl.classList.remove('show');
  }

  function togglePanel() {
    if (panelEl && panelEl.classList.contains('show')) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  // ===== 初始化与销毁 =====

  function init() {
    console.log('[Music] 音乐模块初始化...');
    createPanel();
    setupVisibilityHandler();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    clearTimer();
    stopSound();
    console.log('[Music] 模块已销毁');
  }

  return {
    init,
    togglePanel,
    showPanel,
    hidePanel,
    startSound,
    stopSound,
    destroy
  };
})();
