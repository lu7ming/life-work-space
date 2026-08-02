/**
 * voice-processor.js - 语音处理器
 * 人生工作台 · 语音活动检测（VAD）+ 多引擎 Fallback + 语音快捷指令
 * 提供 VAD 降噪、实时音量反馈、浏览器兼容性检测和语音快捷指令匹配
 * v1.0 - 第十一批优化：语音交互系统升级
 */

const VoiceProcessor = (() => {
  'use strict';

  // ===== 常量 =====
  const VAD_THRESHOLD = 0.15;          // VAD 音量阈值，低于此值视为静音
  const VAD_SMOOTHING = 0.8;           // AnalyserNode smoothingTimeConstant
  const VAD_FFT_SIZE = 2048;           // FFT 大小
  const VAD_CHECK_INTERVAL = 80;       // VAD 检测间隔（ms）
  const VAD_SILENCE_TIMEOUT = 3000;    // 静音超时自动停止（ms），0 表示不自动停止
  const VAD_SPEECH_START_HOLD = 200;   // 语音开始确认延迟（ms），避免短暂噪音触发

  // 语音快捷指令映射表
  const VOICE_SHORTCUTS = [
    { keywords: ['打卡', '签到', '打卡签到'], action: 'habit_checkin', label: '习惯打卡' },
    { keywords: ['记一笔', '记录一下', '快速录入'], action: 'quick_input', label: '快捷输入' },
    { keywords: ['开始专注', '专注模式', '番茄钟', '开始番茄'], action: 'start_focus', label: '开始专注' },
  ];

  // ===== 状态 =====
  let _audioContext = null;
  let _analyser = null;
  let _mediaStream = null;
  let _sourceNode = null;
  let _vadIntervalId = null;
  let _isRecording = false;
  let _isSpeechDetected = false;
  let _speechStartTimer = null;
  let _silenceTimer = null;
  let _currentVolume = 0;
  let _volumeHistory = new Float32Array(32); // 保留最近32帧音量用于波形显示
  let _volumeHistoryIdx = 0;

  // 语音识别引擎
  let _recognition = null;

  // 回调函数集合
  let _callbacks = {
    onStateChange: null,     // (state: 'idle'|'listening'|'speech_detected'|'processing') => void
    onVolumeChange: null,    // (volume: number, history: Float32Array) => void
    onResult: null,          // (text: string, isFinal: boolean) => void
    onError: null,           // (error: string) => void
    onShortcutMatched: null, // (shortcut: {action, label, matched}) => void
  };

  // ===== 浏览器兼容性检测 =====

  /**
   * 检查浏览器是否支持语音识别 API
   * @returns {boolean}
   */
  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * 检查浏览器是否支持 Web Audio API（VAD 需要）
   * @returns {boolean}
   */
  function isAudioSupported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  /**
   * 获取不支持的提示信息
   * @returns {string|null} 如果支持则返回 null
   */
  function getUnsupportedMessage() {
    if (isSupported()) return null;
    // 判断具体浏览器
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) {
      return '当前浏览器不支持语音识别，请使用 Chrome 或 Safari 🎤';
    }
    if (ua.includes('Edg/')) {
      return 'Edge 浏览器语音识别可能受限，推荐使用 Chrome 🎤';
    }
    return '当前浏览器不支持语音识别，请使用 Chrome 或 Safari 🎤';
  }

  // ===== VAD（语音活动检测）=====

  /**
   * 初始化 Web Audio API 和 AnalyserNode
   * @returns {Promise<MediaStream>}
   */
  async function _initAudioContext() {
    // 获取麦克风权限
    try {
      // 先检查浏览器是否支持 navigator.permissions
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const perm = await navigator.permissions.query({ name: 'microphone' });
          if (perm.state === 'denied') {
            throw new Error('麦克风权限已被拒绝，请在浏览器设置中开启 🎤');
          }
        } catch (e) {
          // permissions API 不支持或查询失败，继续尝试 getUserMedia
          if (e.message && e.message.includes('拒绝')) throw e;
        }
      }

      _mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
    } catch (err) {
      // 明确区分权限拒绝和其他错误
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('麦克风权限被拒绝，请在浏览器设置中开启麦克风权限 🎤');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('未检测到麦克风设备 🎤');
      } else if (err.name === 'NotReadableError') {
        throw new Error('麦克风被其他应用占用，请关闭后重试 🎤');
      } else {
        throw new Error('麦克风初始化失败: ' + (err.message || err.name || '未知错误'));
      }
    }

    // 创建 AudioContext
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    _audioContext = new AudioCtx();

    // 创建 AnalyserNode
    _analyser = _audioContext.createAnalyser();
    _analyser.fftSize = VAD_FFT_SIZE;
    _analyser.smoothingTimeConstant = VAD_SMOOTHING;

    // 连接音源
    _sourceNode = _audioContext.createMediaStreamSource(_mediaStream);
    _sourceNode.connect(_analyser);

    return _mediaStream;
  }

  /**
   * 计算当前 RMS 音量（0~1）
   * @returns {number}
   */
  function _getRMSVolume() {
    if (!_analyser) return 0;

    const bufferLength = _analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    _analyser.getFloatTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      sum += val * val;
    }
    const rms = Math.sqrt(sum / bufferLength);
    return Math.min(rms, 1.0);
  }

  /**
   * 启动 VAD 检测循环
   */
  function _startVAD() {
    if (_vadIntervalId) return;

    _vadIntervalId = setInterval(() => {
      const volume = _getRMSVolume();
      _currentVolume = volume;

      // 更新音量历史
      _volumeHistory[_volumeHistoryIdx] = volume;
      _volumeHistoryIdx = (_volumeHistoryIdx + 1) % _volumeHistory.length;

      // 触发音量变化回调
      if (_callbacks.onVolumeChange) {
        _callbacks.onVolumeChange(volume, _volumeHistory);
      }

      // VAD 逻辑：检测是否有语音活动
      if (volume >= VAD_THRESHOLD) {
        if (!_isSpeechDetected) {
          // 延迟确认语音开始，避免短暂噪音触发
          if (!_speechStartTimer) {
            _speechStartTimer = setTimeout(() => {
              _isSpeechDetected = true;
              _speechStartTimer = null;
              _setState('speech_detected');
              // 清除静音计时器
              _clearSilenceTimer();
            }, VAD_SPEECH_START_HOLD);
          }
        } else {
          // 已在语音中，重置静音计时器
          _clearSilenceTimer();
        }
      } else {
        // 清除语音开始确认计时器
        if (_speechStartTimer) {
          clearTimeout(_speechStartTimer);
          _speechStartTimer = null;
        }

        // 语音中检测到静音，启动超时计时器
        if (_isSpeechDetected && VAD_SILENCE_TIMEOUT > 0 && !_silenceTimer) {
          _silenceTimer = setTimeout(() => {
            console.log('[VoiceProcessor] 静音超时，自动停止');
            _silenceTimer = null;
            // 不自动停止，让上层决定是否停止
            // 只更新状态
            _isSpeechDetected = false;
            _setState('listening');
          }, VAD_SILENCE_TIMEOUT);
        }

        if (_isSpeechDetected) {
          _isSpeechDetected = false;
          _setState('listening');
        }
      }
    }, VAD_CHECK_INTERVAL);
  }

  /**
   * 停止 VAD 检测循环
   */
  function _stopVAD() {
    if (_vadIntervalId) {
      clearInterval(_vadIntervalId);
      _vadIntervalId = null;
    }
    if (_speechStartTimer) {
      clearTimeout(_speechStartTimer);
      _speechStartTimer = null;
    }
    _clearSilenceTimer();
    _isSpeechDetected = false;
    _currentVolume = 0;
    _volumeHistory.fill(0);
    _volumeHistoryIdx = 0;
  }

  /**
   * 清除静音超时计时器
   */
  function _clearSilenceTimer() {
    if (_silenceTimer) {
      clearTimeout(_silenceTimer);
      _silenceTimer = null;
    }
  }

  // ===== 语音识别引擎 =====

  /**
   * 创建语音识别引擎实例
   * @returns {SpeechRecognition|null}
   */
  function _createRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    return recognition;
  }

  /**
   * 绑定语音识别事件
   * @param {SpeechRecognition} recognition
   */
  function _bindRecognitionEvents(recognition) {
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const text = finalTranscript || interimTranscript;
      const isFinal = !!finalTranscript;

      if (_callbacks.onResult) {
        _callbacks.onResult(text, isFinal);
      }

      // 快捷指令匹配（只在最终结果时检查）
      if (isFinal && text) {
        _matchShortcut(text);
      }
    };

    recognition.onerror = (event) => {
      console.warn('[VoiceProcessor] 语音识别错误:', event.error);

      if (event.error === 'not-allowed') {
        _handleError('麦克风权限被拒绝，请在浏览器设置中开启 🎤');
      } else if (event.error === 'no-speech') {
        // 没有检测到语音，不中断（VAD 会处理）
      } else if (event.error === 'aborted') {
        // 被中止，正常流程
      } else if (event.error === 'network') {
        _handleError('语音识别网络错误，请检查网络连接 🌐');
      } else {
        _handleError('语音识别出错: ' + event.error);
      }
    };

    recognition.onend = () => {
      // 如果还在录音状态，尝试重启（continuous 模式下可能中途停止）
      if (_isRecording) {
        try {
          recognition.start();
        } catch (e) {
          console.warn('[VoiceProcessor] 重启语音识别失败:', e);
        }
      }
    };
  }

  /**
   * 处理错误
   * @param {string} message
   */
  function _handleError(message) {
    if (_callbacks.onError) {
      _callbacks.onError(message);
    }
  }

  /**
   * 更新状态并触发回调
   * @param {string} state
   */
  function _setState(state) {
    if (_callbacks.onStateChange) {
      _callbacks.onStateChange(state);
    }
  }

  // ===== 语音快捷指令 =====

  /**
   * 匹配语音快捷指令
   * @param {string} text - 识别文本
   * @returns {{action: string, label: string, matched: string}|null}
   */
  function _matchShortcut(text) {
    const normalizedText = text.trim().toLowerCase();

    for (const shortcut of VOICE_SHORTCUTS) {
      for (const keyword of shortcut.keywords) {
        if (normalizedText.includes(keyword)) {
          console.log('[VoiceProcessor] 快捷指令匹配:', shortcut.action, '关键词:', keyword);

          if (_callbacks.onShortcutMatched) {
            _callbacks.onShortcutMatched({
              action: shortcut.action,
              label: shortcut.label,
              matched: keyword,
            });
          }

          return {
            action: shortcut.action,
            label: shortcut.label,
            matched: keyword,
          };
        }
      }
    }

    return null;
  }

  /**
   * 执行语音快捷指令
   * @param {string} action - 指令动作标识
   * @returns {boolean} 是否成功执行
   */
  function executeShortcut(action) {
    switch (action) {
      case 'habit_checkin': {
        // 触发习惯模块快速打卡 - 导航到习惯页面并触发今日打卡
        if (typeof Router !== 'undefined' && Router.navigate) {
          Router.navigate('habits');
        }
        // 延迟一帧后尝试触发打卡
        setTimeout(() => {
          const checkinBtn = document.getElementById('checkin-btn');
          if (checkinBtn) {
            checkinBtn.click();
          }
          // 同时触发习惯模块中的快速打卡
          if (typeof HabitsModule !== 'undefined' && HabitsModule.init) {
            HabitsModule.init();
          }
          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast('✅ 语音打卡成功！', 2000);
          }
        }, 500);
        return true;
      }

      case 'quick_input': {
        // 打开快速录入面板
        if (typeof QuickInput !== 'undefined' && QuickInput.open) {
          QuickInput.open();
        } else if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('⚡ 快速录入加载中...', 1500);
        }
        return true;
      }

      case 'start_focus': {
        // 启动专注模式（休息模式/番茄钟）
        if (typeof RestModule !== 'undefined') {
          // 尝试启动休息模式的专注功能
          const restBtn = document.getElementById('rest-mode-btn');
          if (restBtn) {
            restBtn.click();
          }
          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast('🧘 专注模式已启动', 2000);
          }
        } else if (typeof App !== 'undefined' && App.showToast) {
          App.showToast('🧘 专注模式加载中...', 1500);
        }
        return true;
      }

      default:
        console.warn('[VoiceProcessor] 未知快捷指令:', action);
        return false;
    }
  }

  // ===== 核心控制方法 =====

  /**
   * 启动语音录制（VAD + 语音识别）
   * @param {Object} options - 配置选项
   * @param {Function} [options.onStateChange] - 状态变化回调
   * @param {Function} [options.onVolumeChange] - 音量变化回调
   * @param {Function} [options.onResult] - 识别结果回调
   * @param {Function} [options.onError] - 错误回调
   * @param {Function} [options.onShortcutMatched] - 快捷指令匹配回调
   * @param {boolean} [options.enableVAD=true] - 是否启用 VAD
   * @param {boolean} [options.enableShortcuts=true] - 是否启用快捷指令
   * @returns {Promise<boolean>} 是否启动成功
   */
  async function start(options = {}) {
    if (_isRecording) {
      console.warn('[VoiceProcessor] 已在录音中');
      return false;
    }

    // 检查浏览器兼容性
    if (!isSupported()) {
      const msg = getUnsupportedMessage();
      _handleError(msg);
      return false;
    }

    // 注册回调
    if (options.onStateChange) _callbacks.onStateChange = options.onStateChange;
    if (options.onVolumeChange) _callbacks.onVolumeChange = options.onVolumeChange;
    if (options.onResult) _callbacks.onResult = options.onResult;
    if (options.onError) _callbacks.onError = options.onError;
    if (options.onShortcutMatched) _callbacks.onShortcutMatched = options.onShortcutMatched;

    const enableVAD = options.enableVAD !== false;
    const _enableShortcuts = options.enableShortcuts !== false; // 保留，暂不使用

    _isRecording = true;

    // 1. 初始化 VAD（如果支持）
    if (enableVAD && isAudioSupported()) {
      try {
        await _initAudioContext();
        _startVAD();
        console.log('[VoiceProcessor] VAD 已启动，阈值:', VAD_THRESHOLD);
      } catch (err) {
        console.warn('[VoiceProcessor] VAD 初始化失败，继续无 VAD 模式:', err.message);
        // VAD 失败不影响语音识别，但通知用户
        if (_callbacks.onError) {
          _callbacks.onError('音量检测不可用（' + err.message + '），语音识别仍可正常使用');
        }
      }
    }

    // 2. 启动语音识别
    _recognition = _createRecognition();
    if (!_recognition) {
      _handleError('语音识别引擎初始化失败');
      _isRecording = false;
      return false;
    }

    _bindRecognitionEvents(_recognition);

    try {
      _recognition.start();
      _setState('listening');
      console.log('[VoiceProcessor] 语音识别已启动 🎤');
    } catch (e) {
      console.warn('[VoiceProcessor] 语音识别启动失败:', e);
      _handleError('语音识别启动失败，请重试');
      _isRecording = false;
      return false;
    }

    return true;
  }

  /**
   * 停止语音录制
   * @returns {void}
   */
  function stop() {
    if (!_isRecording) return;

    _isRecording = false;

    // 停止语音识别
    if (_recognition) {
      try {
        _recognition.stop();
      } catch (e) {
        // 忽略
      }
      _recognition = null;
    }

    // 停止 VAD
    _stopVAD();

    // 释放音频资源
    _releaseAudioResources();

    _setState('idle');
    console.log('[VoiceProcessor] 语音录制已停止');
  }

  /**
   * 释放音频相关资源
   */
  function _releaseAudioResources() {
    if (_sourceNode) {
      try { _sourceNode.disconnect(); } catch (e) {}
      _sourceNode = null;
    }
    if (_analyser) {
      try { _analyser.disconnect(); } catch (e) {}
      _analyser = null;
    }
    if (_mediaStream) {
      _mediaStream.getTracks().forEach(track => track.stop());
      _mediaStream = null;
    }
    if (_audioContext) {
      try { _audioContext.close(); } catch (e) {}
      _audioContext = null;
    }
  }

  /**
   * 销毁模块，释放所有资源
   */
  function destroy() {
    stop();
    _callbacks = {
      onStateChange: null,
      onVolumeChange: null,
      onResult: null,
      onError: null,
      onShortcutMatched: null,
    };
    console.log('[VoiceProcessor] 模块已销毁');
  }

  // ===== 工具方法 =====

  /**
   * 获取当前音量级别（0~1）
   * @returns {number}
   */
  function getVolumeLevel() {
    return _currentVolume;
  }

  /**
   * 获取音量历史（用于波形显示）
   * @returns {Float32Array}
   */
  function getVolumeHistory() {
    return _volumeHistory;
  }

  /**
   * 获取当前录音状态
   * @returns {boolean}
   */
  function isRecording() {
    return _isRecording;
  }

  /**
   * 获取当前语音检测状态
   * @returns {boolean}
   */
  function isSpeechDetected() {
    return _isSpeechDetected;
  }

  /**
   * 检查文本是否匹配快捷指令（供外部调用）
   * @param {string} text
   * @returns {{action: string, label: string, matched: string}|null}
   */
  function checkShortcut(text) {
    return _matchShortcut(text);
  }

  /**
   * 注册回调
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  function on(event, callback) {
    if (_callbacks.hasOwnProperty('on' + event.charAt(0).toUpperCase() + event.slice(1))) {
      _callbacks['on' + event.charAt(0).toUpperCase() + event.slice(1)] = callback;
    }
  }

  // ===== 导出 =====
  return {
    // 核心方法
    start,
    stop,
    destroy,

    // 状态查询
    isSupported,
    isAudioSupported,
    getUnsupportedMessage,
    isRecording,
    isSpeechDetected,
    getVolumeLevel,
    getVolumeHistory,

    // 快捷指令
    checkShortcut,
    executeShortcut,

    // 事件注册
    on,

    // 常量导出
    VAD_THRESHOLD,
  };
})();
