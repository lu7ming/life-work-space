/**
 * music.js - 音乐模块
 * 人生工作台 · Web Audio 合成（钢琴+疗愈）+ 真实音频（自然声）混合模式
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';


export const MusicModule = (() => {
  // ===== 状态 =====
  let audioCtx = null;
  let currentNodes = [];
  let currentSources = [];
  let gainNode = null;
  let mediaSourceNode = null;
  let audioElement = null;
  let isPlaying = false;
  let currentSoundId = null;
  let timerId = null;
  let timerRemaining = 0;
  let panelEl = null;

  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 声音配置 =====
  const SOUNDS = [
    // 🎹 钢琴（合成）
    { id: 'piano-deep', name: '低沉钢琴', emoji: '🎹', description: 'C大调分解和弦，温暖低沉', category: 'piano', type: 'pianoDeep' },
    { id: 'piano-romantic', name: '浪漫钢琴', emoji: '💝', description: 'Db大调，温柔浪漫', category: 'piano', type: 'pianoRomantic' },
    { id: 'piano-quiet1', name: '安静夜曲', emoji: '🌙', description: 'A小调，稀疏留白', category: 'piano', type: 'pianoQuiet1' },
    { id: 'piano-quiet3', name: '安静氛围', emoji: '🌌', description: '极简氛围钢琴', category: 'piano', type: 'pianoQuiet3' },

    // 🧘 疗愈音（合成）
    { id: 'delta-wave', name: '脑波助眠', emoji: '🧠', description: 'Delta 双耳节拍，需耳机', category: 'healing', type: 'binaural', freq: 2, headphone: true },
    { id: 'healing-432', name: '432Hz', emoji: '✨', description: '宇宙频率，身心和谐', category: 'healing', type: 'sine', freq: 432 },
    { id: 'healing-528', name: '528Hz', emoji: '💜', description: '奇迹频率，修复DNA', category: 'healing', type: 'sine', freq: 528 },
    { id: 'singing-bowl', name: '颂钵音', emoji: '🔔', description: '深远共鸣，冥想入定', category: 'healing', type: 'singingBowl' },

    // 🌿 自然之声（真实音频）
    { id: 'nature-rain-window', name: '窗边雨', emoji: '🪟', description: '雨打窗棂，安然独处', category: 'nature', type: 'audio', src: 'modules/music/audio/nature/rain-window.mp3' },
    { id: 'nature-ocean', name: '海浪', emoji: '🌊', description: '潮起潮落，心随浪静', category: 'nature', type: 'audio', src: 'modules/music/audio/nature/ocean-waves.mp3' },
    { id: 'nature-thunderstorm', name: '雷雨', emoji: '⛈️', description: '远处雷鸣，大雨倾盆', category: 'nature', type: 'audio', src: 'modules/music/audio/nature/thunderstorm.mp3' },
  ];

  const TIMER_OPTIONS = [
    { label: '15分钟', value: 15 },
    { label: '30分钟', value: 30 },
    { label: '60分钟', value: 60 },
    { label: '不限', value: 0 }
  ];

  // ===== 音频引擎 =====

  function ensureAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // ===== 通用：钢琴音合成辅助 =====

  /**
   * 生成钢琴音色样本（多谐波叠加 + ADSR包络）
   */
  function pianoSample(t, freq, velocity = 0.5, decay = 0.4) {
    const attack = Math.min(1, t / 0.008);
    const env = attack * Math.exp(-t * decay);
    let s = 0;
    s += Math.sin(2 * Math.PI * freq * t) * 0.5;
    s += Math.sin(2 * Math.PI * freq * 2 * t) * 0.15;
    s += Math.sin(2 * Math.PI * freq * 3 * t) * 0.05;
    s += Math.sin(2 * Math.PI * freq * 4 * t) * 0.02;
    return s * env * velocity;
  }

  /**
   * 写入钢琴音符到 buffer（支持左右声道微差异）
   */
  function writePianoNote(leftData, rightData, noteStart, totalSamples, freq, velocity, decay, ctx) {
    const dur = Math.floor(ctx.sampleRate * 6);
    for (let i = noteStart; i < totalSamples && i < noteStart + dur; i++) {
      const t = (i - noteStart) / ctx.sampleRate;
      const sample = pianoSample(t, freq, velocity, decay);
      leftData[i] += sample * 0.3;
      rightData[i] += sample * 0.28;
    }
  }

  /**
   * 创建 piano buffer 并返回 BufferSource（循环播放）
   */
  function createPianoBuffer(ctx, dest, fillBufferFn) {
    const nodes = [];
    const sources = [];
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.28;
    masterGain.connect(dest);
    nodes.push(masterGain);

    const buffer = ctx.createBuffer(2, ctx.sampleRate * 32, ctx.sampleRate);
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);
    fillBufferFn(leftData, rightData, ctx);

    // 归一化
    let maxVal = 0;
    for (let i = 0; i < leftData.length; i++) {
      maxVal = Math.max(maxVal, Math.abs(leftData[i]), Math.abs(rightData[i]));
    }
    if (maxVal > 0) {
      const norm = 0.85 / maxVal;
      for (let i = 0; i < leftData.length; i++) {
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

  // ===== 钢琴合成函数 =====

  /**
   * 低沉钢琴：C大调分解和弦 Cmaj7→Am7→Fmaj7→G7
   * 保留原始版本，温暖饱满
   */
  function createPianoDeep(ctx, dest) {
    return createPianoBuffer(ctx, dest, (leftData, rightData, ctx) => {
      const chords = [
        [261.63, 329.63, 392.00, 493.88],  // Cmaj7
        [220.00, 261.63, 329.63, 392.00],  // Am7
        [174.61, 220.00, 261.63, 329.63],  // Fmaj7
        [196.00, 246.94, 293.66, 349.23],  // G7
      ];
      const chordDur = 8;
      for (let c = 0; c < chords.length; c++) {
        const start = c * chordDur * ctx.sampleRate;
        for (let n = 0; n < chords[c].length; n++) {
          const noteStart = start + n * Math.floor(ctx.sampleRate * 0.5);
          writePianoNote(leftData, rightData, noteStart, leftData.length, chords[c][n], 0.5, 0.4, ctx);
        }
      }
    });
  }

  /**
   * 浪漫钢琴：Db大调，琶音更慢，更多泛音温暖感
   * Dbmaj7→Abmaj7→Gbmaj7→Ab7
   */
  function createPianoRomantic(ctx, dest) {
    return createPianoBuffer(ctx, dest, (leftData, rightData, ctx) => {
      const chords = [
        [277.18, 349.23, 415.30, 523.25],  // Dbmaj7: Db4 F4 Ab4 C5
        [207.65, 261.63, 311.13, 415.30],  // Abmaj7: Ab3 Eb4 Gb4 C5 → 改为 Ab3 C4 Eb4 Gb4
        [185.00, 233.08, 277.18, 349.23],  // Gbmaj7: Gb3 Bb3 Db4 F4
        [207.65, 261.63, 311.13, 349.23],  // Ab7: Ab3 C4 Eb4 F4
      ];
      const chordDur = 12; // 更慢，每个和弦12秒
      for (let c = 0; c < chords.length; c++) {
        const start = c * chordDur * ctx.sampleRate;
        for (let n = 0; n < chords[c].length; n++) {
          const noteStart = start + n * Math.floor(ctx.sampleRate * 0.8); // 琶音间隔0.8秒
          // 更轻柔的力度，更长的衰减
          writePianoNote(leftData, rightData, noteStart, leftData.length, chords[c][n], 0.35, 0.25, ctx);
        }
        // 加一个低音根音增加温暖感
        const bassNote = chords[c][0] / 2; // 低八度
        writePianoNote(leftData, rightData, start, leftData.length, bassNote, 0.2, 0.15, ctx);
      }
    });
  }

  /**
   * 安静夜曲：A小调，极少量音符，大量留白
   */
  function createPianoQuiet1(ctx, dest) {
    return createPianoBuffer(ctx, dest, (leftData, rightData, ctx) => {
      const sr = ctx.sampleRate;
      const total = leftData.length;
      // A小调稀疏音符：A3, C4, E4, A4, 偶尔加 G4, B3
      const notes = [
        { time: 0, freq: 220.00, vel: 0.25, dec: 0.2 },    // A3
        { time: 3, freq: 329.63, vel: 0.2, dec: 0.2 },     // E4
        { time: 6.5, freq: 440.00, vel: 0.18, dec: 0.18 }, // A4
        { time: 10, freq: 261.63, vel: 0.15, dec: 0.2 },   // C4
        { time: 14, freq: 392.00, vel: 0.12, dec: 0.15 },  // G4
        { time: 18, freq: 220.00, vel: 0.2, dec: 0.2 },    // A3
        { time: 22, freq: 293.66, vel: 0.15, dec: 0.18 },  // D4
        { time: 26, freq: 329.63, vel: 0.18, dec: 0.2 },   // E4
        { time: 30, freq: 440.00, vel: 0.12, dec: 0.15 },  // A4
      ];
      for (const note of notes) {
        const start = Math.floor(note.time * sr);
        writePianoNote(leftData, rightData, start, total, note.freq, note.vel, note.dec, ctx);
      }
    });
  }

  /**
   * 安静氛围：极慢和弦变化，长延音，Satie风格
   */
  function createPianoQuiet3(ctx, dest) {
    return createPianoBuffer(ctx, dest, (leftData, rightData, ctx) => {
      const sr = ctx.sampleRate;
      const total = leftData.length;
      // 极简和弦，16秒一个变化
      const chords = [
        { time: 0, notes: [261.63, 329.63], dur: 16 },     // C4 E4
        { time: 16, notes: [220.00, 293.66], dur: 16 },    // A3 D4
      ];
      for (const chord of chords) {
        const start = Math.floor(chord.time * sr);
        for (const freq of chord.notes) {
          // 极慢attack（800ms），超长衰减
          const noteDur = Math.floor(sr * chord.dur);
          for (let i = start; i < total && i < start + noteDur; i++) {
            const t = (i - start) / sr;
            // 极慢 attack
            const attack = Math.min(1, t / 0.8);
            // 极慢 decay
            const decay = Math.exp(-t * 0.08);
            const env = attack * decay;
            let s = 0;
            s += Math.sin(2 * Math.PI * freq * t) * 0.4;
            s += Math.sin(2 * Math.PI * freq * 2 * t) * 0.1;
            s += Math.sin(2 * Math.PI * freq * 3 * t) * 0.03;
            leftData[i] += s * env * 0.15 * 0.3;
            rightData[i] += s * env * 0.15 * 0.28;
          }
        }
      }
    });
  }

  // ===== 疗愈音合成函数 =====

  function createBinaural(ctx, dest, targetFreq = 2) {
    const nodes = [], sources = [];
    const baseFreq = 200;
    const merger = ctx.createChannelMerger(2);

    const oscL = ctx.createOscillator(); oscL.type = 'sine'; oscL.frequency.value = baseFreq;
    const gainL = ctx.createGain(); gainL.gain.value = 0.4;
    oscL.connect(gainL).connect(merger, 0, 0); oscL.start();

    const oscR = ctx.createOscillator(); oscR.type = 'sine'; oscR.frequency.value = baseFreq + targetFreq;
    const gainR = ctx.createGain(); gainR.gain.value = 0.4;
    oscR.connect(gainR).connect(merger, 0, 1); oscR.start();

    merger.connect(dest);
    sources.push(oscL, oscR);
    nodes.push(merger, gainL, gainR);
    return { nodes, sources };
  }

  function createSineTone(ctx, dest, freq = 432) {
    const nodes = [], sources = [];
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
    const vibrato = ctx.createOscillator(); vibrato.type = 'sine'; vibrato.frequency.value = 0.1;
    const vibratoGain = ctx.createGain(); vibratoGain.gain.value = 1.5;
    vibrato.connect(vibratoGain).connect(osc.frequency);
    const masterGain = ctx.createGain(); masterGain.gain.value = 0.3;
    osc.connect(masterGain).connect(dest);
    osc.start(); vibrato.start();
    sources.push(osc, vibrato);
    nodes.push(vibratoGain, masterGain);
    return { nodes, sources };
  }

  function createSingingBowl(ctx, dest) {
    const nodes = [], sources = [];
    const fundamental = 220;
    const harmonics = [1, 2.01, 3.02, 4.05, 5.1];
    const hg = [0.4, 0.25, 0.15, 0.08, 0.04];
    const masterGain = ctx.createGain(); masterGain.gain.value = 0.35; masterGain.connect(dest);
    nodes.push(masterGain);
    const duration = 8, size = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(2, size, ctx.sampleRate);
    const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
    for (let h = 0; h < harmonics.length; h++) {
      const f = fundamental * harmonics[h], a = hg[h];
      for (let i = 0; i < size; i++) {
        const t = i / ctx.sampleRate, env = Math.exp(-t * (0.3 + h * 0.2));
        const s = Math.sin(2 * Math.PI * f * t) * a * env;
        l[i] += s; r[i] += s * 0.95;
      }
    }
    let mx = 0;
    for (let i = 0; i < size; i++) mx = Math.max(mx, Math.abs(l[i]), Math.abs(r[i]));
    if (mx > 0) { const n = 0.9/mx; for (let i=0;i<size;i++) { l[i]*=n; r[i]*=n; } }
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true; src.connect(masterGain); src.start();
    sources.push(src);
    return { nodes, sources };
  }

  // ===== 真实音频文件播放 =====

  function startAudioFile(sound) {
    const ctx = ensureAudioContext();
    audioElement = new Audio(sound.src);
    audioElement.loop = true;
    audioElement.crossOrigin = 'anonymous';
    mediaSourceNode = ctx.createMediaElementSource(audioElement);
    mediaSourceNode.connect(gainNode);
    audioElement.play().catch(err => console.warn('[Music] 音频播放失败:', err));
  }

  // ===== 播放控制 =====

  function startSound(soundId) {
    stopSound();
    const sound = SOUNDS.find(s => s.id === soundId);
    if (!sound) return;

    const ctx = ensureAudioContext();
    currentSoundId = soundId;

    gainNode = ctx.createGain();
    let savedVolume = 0.5;
    try { savedVolume = parseFloat(localStorage.getItem('music_volume') || '0.5'); } catch(e) {}
    gainNode.gain.value = savedVolume;
    gainNode.connect(ctx.destination);

    if (sound.type === 'audio') {
      startAudioFile(sound);
      currentNodes = [mediaSourceNode];
      currentSources = [];
    } else {
      let result;
      switch (sound.type) {
        case 'binaural': result = createBinaural(ctx, gainNode, sound.freq || 2); break;
        case 'sine': result = createSineTone(ctx, gainNode, sound.freq || 432); break;
        case 'singingBowl': result = createSingingBowl(ctx, gainNode); break;
        case 'pianoDeep': result = createPianoDeep(ctx, gainNode); break;
        case 'pianoRomantic': result = createPianoRomantic(ctx, gainNode); break;
        case 'pianoQuiet1': result = createPianoQuiet1(ctx, gainNode); break;
        case 'pianoQuiet3': result = createPianoQuiet3(ctx, gainNode); break;
        default: result = createSineTone(ctx, gainNode, 432);
      }
      currentNodes = result.nodes || [];
      currentSources = result.sources || [];
    }

    isPlaying = true;
    updatePanelUI();
  }

  function stopSound() {
    currentSources.forEach(src => { try { src.stop(); } catch(e) {} try { src.disconnect(); } catch(e) {} });
    currentNodes.forEach(n => { try { n.disconnect(); } catch(e) {} });
    if (audioElement) {
      try { audioElement.pause(); audioElement.src = ''; audioElement.load(); } catch(e) {}
      audioElement = null;
    }
    mediaSourceNode = null;
    if (gainNode) { try { gainNode.disconnect(); } catch(e) {} }
    currentSources = []; currentNodes = []; gainNode = null;
    isPlaying = false; currentSoundId = null;
    updatePanelUI();
  }

  function setVolume(value) {
    if (gainNode) gainNode.gain.value = value;
    try { localStorage.setItem('music_volume', String(value)); } catch(e) {}
  }

  // ===== 定时器 =====

  function startTimer(minutes) {
    clearTimer();
    if (minutes <= 0) return;
    timerRemaining = minutes * 60;
    timerId = setInterval(() => {
      timerRemaining--;
      updateTimerDisplay();
      if (timerRemaining <= 0) { clearTimer(); stopSound(); }
    }, 1000);
    updateTimerDisplay();
  }

  function clearTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    timerRemaining = 0;
  }

  function updateTimerDisplay() {
    const el = panelEl?.querySelector('#music-timer-remaining');
    if (el && timerRemaining > 0) {
      const m = Math.floor(timerRemaining / 60);
      const s = timerRemaining % 60;
      el.textContent = `剩余 ${m}:${String(s).padStart(2, '0')}`;
      el.style.display = '';
    } else if (el) { el.style.display = 'none'; }
  }

  // ===== 可见性处理 =====

  function setupVisibilityHandler() {
    _bindEvent(document, 'visibilitychange', () => {
      if (!audioCtx || !isPlaying) return;
      if (document.visibilityState === 'visible' && audioCtx.state === 'suspended') audioCtx.resume();
    });
  }

  // ===== 面板 UI =====

  function createPanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.className = 'music-panel';

    const categories = {
      piano:   { title: '🎹 钢琴', containerId: 'music-cards-piano' },
      healing: { title: '🧘 疗愈音', containerId: 'music-cards-healing' },
      nature:  { title: '🌿 自然之声', containerId: 'music-cards-nature' },
    };

    let catHTML = '';
    for (const [cat, cfg] of Object.entries(categories)) {
      catHTML += `<div class="music-category"><div class="music-category-title">${cfg.title}</div><div class="music-cards" id="${cfg.containerId}"></div></div>`;
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
            ${TIMER_OPTIONS.map(opt => `<button class="music-timer-btn${opt.value === 0 ? ' active' : ''}" data-minutes="${opt.value}">${opt.label}</button>`).join('')}
          </div>
          <div class="music-timer-remaining" id="music-timer-remaining" style="display:none;"></div>
        </div>
        ${catHTML}
      </div>
    `;

    document.body.appendChild(panelEl);
    renderCards();
    bindPanelEvents();
    return panelEl;
  }

  function renderCards() {
    if (!panelEl) return;
    SOUNDS.forEach(sound => {
      const container = panelEl.querySelector(`#music-cards-${sound.category}`);
      if (!container) return;
      const card = document.createElement('div');
      card.className = 'music-card';
      card.dataset.soundId = sound.id;
      const hpTip = sound.headphone ? '<div class="music-card-headphone-tip">🎧 需佩戴耳机</div>' : '';
      const badge = sound.type === 'audio' ? '<span class="music-card-audio-badge" title="真实录音">🔊</span>' : '';
      card.innerHTML = `${badge}<span class="music-card-emoji">${sound.emoji}</span><span class="music-card-name">${sound.name}</span><span class="music-card-desc">${sound.description}</span><button class="music-card-play" data-sound-id="${sound.id}">▶</button>${hpTip}`;
      container.appendChild(card);
    });
  }

  function bindPanelEvents() {
    _bindEvent(panelEl.querySelector('#music-close'), 'click', () => hidePanel());

    const slider = panelEl.querySelector('#music-volume-slider');
    let savedVol = 0.5;
    try { savedVol = parseFloat(localStorage.getItem('music_volume') || '0.5'); } catch(e) {}
    slider.value = savedVol;
    _bindEvent(slider, 'input', e => setVolume(parseFloat(e.target.value)));

    panelEl.querySelectorAll('.music-timer-btn').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        panelEl.querySelectorAll('.music-timer-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (isPlaying) startTimer(parseInt(btn.dataset.minutes));
      });
    });

    _bindEvent(panelEl.querySelector('#music-now-stop'), 'click', () => { stopSound(); clearTimer(); });

    _bindEvent(panelEl, 'click', e => {
      const playBtn = e.target.closest('.music-card-play');
      if (playBtn) {
        const sid = playBtn.dataset.soundId;
        if (isPlaying && currentSoundId === sid) { stopSound(); clearTimer(); }
        else { startSound(sid); const at = panelEl.querySelector('.music-timer-btn.active'); if (at) startTimer(parseInt(at.dataset.minutes)); }
      }
    });
  }

  function updatePanelUI() {
    if (!panelEl) return;
    const np = panelEl.querySelector('#music-now-playing');
    const ne = panelEl.querySelector('#music-now-emoji');
    const nn = panelEl.querySelector('#music-now-name');
    if (isPlaying && currentSoundId) {
      const sound = SOUNDS.find(s => s.id === currentSoundId);
      if (sound) { ne.textContent = sound.emoji; nn.textContent = sound.name + (sound.headphone ? ' 🎧' : ''); np.style.display = ''; }
    } else { np.style.display = 'none'; }
    panelEl.querySelectorAll('.music-card').forEach(card => {
      const btn = card.querySelector('.music-card-play');
      const sid = btn?.dataset.soundId;
      if (isPlaying && sid === currentSoundId) { card.classList.add('playing'); btn.textContent = '⏸'; }
      else { card.classList.remove('playing'); btn.textContent = '▶'; }
    });
  }

  // ===== 面板显隐 =====

  function showPanel() { if (!panelEl) createPanel(); panelEl.classList.add('show'); }
  function hidePanel() { if (panelEl) panelEl.classList.remove('show'); }
  function togglePanel() { if (panelEl && panelEl.classList.contains('show')) hidePanel(); else showPanel(); }

  // ===== 初始化与销毁 =====

  function init() {
    console.log('[Music] 音乐模块初始化...');
    createPanel();
    setupVisibilityHandler();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    clearTimer(); stopSound();
    console.log('[Music] 模块已销毁');
  }

  return { init, togglePanel, showPanel, hidePanel, startSound, stopSound, destroy };
})();
