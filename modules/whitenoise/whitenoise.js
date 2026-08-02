/**
 * whitenoise.js - 白噪音系统
 * 人生工作台 · Web Audio API 生成环境音
 */

const WhiteNoiseModule = (() => {
  // ===== 状态 =====
  let audioCtx = null;
  let noiseNode = null;
  let gainNode = null;
  let filterNode = null;
  let isPlaying = false;
  let currentType = 'white'; // white, pink, brown
  let timerId = null;
  let timerRemaining = 0;
  let panelEl = null;

  // ===== 事件监听追踪 =====
  let _eventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== 噪声类型配置 =====
  const NOISE_TYPES = {
    white: { label: '白噪声', emoji: '🌊', description: '均匀频谱，专注力提升' },
    pink: { label: '粉噪声', emoji: '🌸', description: '低频柔和，放松助眠' },
    brown: { label: '棕噪声', emoji: '🍂', description: '深沉浑厚，屏蔽杂念' }
  };

  const TIMER_OPTIONS = [
    { label: '15分钟', value: 15 },
    { label: '30分钟', value: 30 },
    { label: '60分钟', value: 60 },
    { label: '不限', value: 0 }
  ];

  // ===== 音频引擎 =====

  /**
   * 初始化 AudioContext（必须在用户手势中调用）
   */
  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // iOS Safari 兼容：如果 suspended 则 resume
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * 创建白噪声 buffer
   */
  function createWhiteNoiseBuffer(ctx) {
    const bufferSize = ctx.sampleRate * 2; // 2秒循环
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * 创建粉噪声 buffer（通过Voss-McCartney算法近似）
   */
  function createPinkNoiseBuffer(ctx) {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // 简单粉噪声：对白噪声做一阶低通滤波
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  /**
   * 创建棕噪声 buffer（通过积分白噪声）
   */
  function createBrownNoiseBuffer(ctx) {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + (0.02 * white)) / 1.02;
      data[i] = lastOut * 3.5; // 增益补偿
    }
    return buffer;
  }

  /**
   * 开始播放指定类型噪声
   */
  function startNoise(type) {
    stopNoise();

    const ctx = ensureAudioContext();
    currentType = type;

    // 创建对应类型的 buffer
    let buffer;
    switch (type) {
      case 'pink':
        buffer = createPinkNoiseBuffer(ctx);
        break;
      case 'brown':
        buffer = createBrownNoiseBuffer(ctx);
        break;
      default:
        buffer = createWhiteNoiseBuffer(ctx);
    }

    // 创建循环播放的 BufferSource
    noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;

    // 增益节点
    gainNode = ctx.createGain();
    const savedVolume = parseFloat(localStorage.getItem('wn_volume') || '0.5');
    gainNode.gain.value = savedVolume;

    // 连接
    noiseNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    noiseNode.start(0);
    isPlaying = true;

    updatePanelUI();
  }

  /**
   * 停止播放
   */
  function stopNoise() {
    if (noiseNode) {
      try { noiseNode.stop(); } catch (e) { /* already stopped */ }
      noiseNode.disconnect();
      noiseNode = null;
    }
    if (filterNode) {
      filterNode.disconnect();
      filterNode = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    isPlaying = false;
    updatePanelUI();
  }

  /**
   * 设置音量
   */
  function setVolume(value) {
    if (gainNode) {
      gainNode.gain.value = value;
    }
    localStorage.setItem('wn_volume', String(value));
    updatePanelUI();
  }

  // ===== 定时器 =====

  function startTimer(minutes) {
    clearTimer();
    if (minutes <= 0) return; // 不限

    timerRemaining = minutes * 60;
    timerId = setInterval(() => {
      timerRemaining--;
      updateTimerDisplay();
      if (timerRemaining <= 0) {
        clearTimer();
        stopNoise();
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
    const el = panelEl?.querySelector('.wn-timer-remaining');
    if (el && timerRemaining > 0) {
      const m = Math.floor(timerRemaining / 60);
      const s = timerRemaining % 60;
      el.textContent = `剩余 ${m}:${String(s).padStart(2, '0')}`;
      el.style.display = '';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  // ===== iOS Safari 兼容 =====

  function setupVisibilityHandler() {
    _bindEvent(document, 'visibilitychange', () => {
      if (!audioCtx || !isPlaying) return;
      if (document.visibilityState === 'hidden') {
        // 页面隐藏时保持播放（不暂停）
      } else {
        // 页面恢复时确保 audio context 活跃
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }
    });
  }

  // ===== 面板 UI =====

  function createPanel() {
    if (panelEl) return panelEl;

    panelEl = document.createElement('div');
    panelEl.className = 'wn-panel';
    panelEl.innerHTML = `
      <div class="wn-panel-header">
        <span class="wn-panel-title">🎵 白噪音</span>
        <button class="wn-panel-close" id="wn-close">✕</button>
      </div>
      <div class="wn-panel-body">
        <!-- 噪声类型选择 -->
        <div class="wn-types">
          ${Object.entries(NOISE_TYPES).map(([key, cfg]) => `
            <button class="wn-type-btn" data-type="${key}">
              <span class="wn-type-emoji">${cfg.emoji}</span>
              <span class="wn-type-label">${cfg.label}</span>
              <span class="wn-type-desc">${cfg.description}</span>
            </button>
          `).join('')}
        </div>

        <!-- 音量控制 -->
        <div class="wn-volume">
          <span class="wn-volume-icon">🔈</span>
          <input type="range" class="wn-volume-slider" min="0" max="1" step="0.05" value="0.5">
          <span class="wn-volume-icon">🔊</span>
        </div>

        <!-- 定时关闭 -->
        <div class="wn-timer">
          <span class="wn-timer-label">定时关闭：</span>
          <div class="wn-timer-options">
            ${TIMER_OPTIONS.map(opt => `
              <button class="wn-timer-btn" data-minutes="${opt.value}">${opt.label}</button>
            `).join('')}
          </div>
          <div class="wn-timer-remaining" style="display:none;"></div>
        </div>

        <!-- 播放控制 -->
        <div class="wn-controls">
          <button class="wn-play-btn" id="wn-play-btn">
            <span class="wn-play-icon">▶️</span>
            <span class="wn-play-text">开始播放</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panelEl);
    bindPanelEvents();
    return panelEl;
  }

  function bindPanelEvents() {
    // 关闭按钮
    _bindEvent(panelEl.querySelector('#wn-close'), 'click', () => {
      hidePanel();
    });

    // 类型选择
    panelEl.querySelectorAll('.wn-type-btn').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        panelEl.querySelectorAll('.wn-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentType = btn.dataset.type;
        if (isPlaying) {
          startNoise(currentType); // 重新播放
        }
      });
    });

    // 音量滑块
    const slider = panelEl.querySelector('.wn-volume-slider');
    const savedVol = parseFloat(localStorage.getItem('wn_volume') || '0.5');
    slider.value = savedVol;
    _bindEvent(slider, 'input', (e) => {
      setVolume(parseFloat(e.target.value));
    });

    // 定时选项
    panelEl.querySelectorAll('.wn-timer-btn').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        panelEl.querySelectorAll('.wn-timer-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const minutes = parseInt(btn.dataset.minutes);
        if (isPlaying) {
          startTimer(minutes);
        }
      });
    });

    // 播放按钮
    _bindEvent(panelEl.querySelector('#wn-play-btn'), 'click', () => {
      if (isPlaying) {
        stopNoise();
        clearTimer();
      } else {
        startNoise(currentType);
        // 应用选中的定时
        const activeTimer = panelEl.querySelector('.wn-timer-btn.active');
        if (activeTimer) {
          startTimer(parseInt(activeTimer.dataset.minutes));
        }
      }
    });
  }

  function updatePanelUI() {
    if (!panelEl) return;
    const playBtn = panelEl.querySelector('#wn-play-btn');
    const playIcon = playBtn.querySelector('.wn-play-icon');
    const playText = playBtn.querySelector('.wn-play-text');

    if (isPlaying) {
      playIcon.textContent = '⏸️';
      playText.textContent = '暂停';
      playBtn.classList.add('playing');
    } else {
      playIcon.textContent = '▶️';
      playText.textContent = '开始播放';
      playBtn.classList.remove('playing');
      const remaining = panelEl.querySelector('.wn-timer-remaining');
      if (remaining) remaining.style.display = 'none';
    }

    // 更新当前选中类型
    panelEl.querySelectorAll('.wn-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === currentType);
    });
  }

  // ===== 面板显隐 =====

  function showPanel() {
    if (!panelEl) createPanel();
    panelEl.classList.add('show');
  }

  function hidePanel() {
    if (panelEl) {
      panelEl.classList.remove('show');
    }
  }

  function togglePanel() {
    if (panelEl && panelEl.classList.contains('show')) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  // ===== 初始化 =====

  function init() {
    console.log('[WhiteNoise] 白噪音模块初始化...');
    createPanel();
    setupVisibilityHandler();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    clearTimer();
    stopNoise();
    console.log('[WhiteNoise] 模块已销毁');
  }

  return {
    init,
    togglePanel,
    showPanel,
    hidePanel,
    startNoise,
    stopNoise,
    destroy
  };
})();
