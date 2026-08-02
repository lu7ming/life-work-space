/**
 * secure-storage.js - API Key 安全存储
 * 人生工作台 · 使用 Web Crypto API AES-GCM 加密存储敏感信息
 * 
 * 原理：
 * - 基于设备指纹（userAgent + 屏幕 + 语言）生成确定性 AES-GCM 密钥
 * - 加密后以 { iv, data, _encrypted } 结构存入 IndexedDB
 * - 同一设备可解密，跨设备不可用（需重新配置）
 * - 首次遇到明文 token 时自动迁移为密文
 * - 内存缓存解密结果，30 分钟过期，避免频繁解密
 * - 日志中屏蔽完整 API Key，仅显示首尾各 4 字符
 */

const SecureStorage = (() => {
  /** @type {CryptoKey|null} 缓存的加密密钥 */
  let _encryptionKey = null;

  /**
   * 内存缓存结构
   * { [keyName]: { value: string, timestamp: number } }
   */
  const _memoryCache = {};

  /** 缓存超时：30 分钟（毫秒） */
  const CACHE_TTL = 30 * 60 * 1000;

  /**
   * 获取设备指纹（用于派生加密密钥）
   * 方案：navigator.userAgent + screen.width + screen.height + navigator.language
   * @returns {string} 设备指纹字符串
   */
  function _getDeviceFingerprint() {
    const parts = [];
    parts.push(navigator.userAgent || '');
    parts.push(screen.width + 'x' + screen.height);
    parts.push(navigator.language || '');
    return parts.join('|');
  }

  /**
   * 获取或生成 AES-GCM 加密密钥
   * 基于设备指纹 + 应用固定盐通过 PBKDF2 派生
   * @returns {Promise<CryptoKey|null>}
   */
  async function _getEncryptionKey() {
    if (_encryptionKey) return _encryptionKey;

    try {
      const fingerprint = _getDeviceFingerprint();
      // 应用固定盐，确保同设备同密钥
      const salt = new TextEncoder().encode('life-work-space-secure-storage-v2');
      const baseKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(fingerprint),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      _encryptionKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      return _encryptionKey;
    } catch (e) {
      console.error('[SecureStorage] 生成加密密钥失败:', e);
      return null;
    }
  }

  /**
   * 加密文本
   * @param {string} text - 明文
   * @returns {Promise<Object|null>} { iv: number[], data: number[], _encrypted: true } 或 null
   */
  async function encrypt(text) {
    if (!text) return null;

    try {
      const key = await _getEncryptionKey();
      if (!key) return null;

      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );

      return {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted)),
        _encrypted: true
      };
    } catch (e) {
      console.error('[SecureStorage] 加密失败:', e);
      return null;
    }
  }

  /**
   * 解密数据
   * @param {Object} encrypted - { iv: number[], data: number[] }
   * @returns {Promise<string|null>} 明文或 null
   */
  async function decrypt(encrypted) {
    if (!encrypted || !encrypted.iv || !encrypted.data) return null;

    try {
      const key = await _getEncryptionKey();
      if (!key) return null;

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
        key,
        new Uint8Array(encrypted.data)
      );

      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error('[SecureStorage] 解密失败:', e);
      return null;
    }
  }

  /**
   * 检查值是否为加密格式
   * @param {*} value
   * @returns {boolean}
   */
  function isEncrypted(value) {
    return value && typeof value === 'object' && value._encrypted === true;
  }

  /**
   * 屏蔽 API Key，日志安全输出
   * 仅显示首尾各 4 字符，中间用 **** 替代
   * @param {string} key - API Key 明文
   * @returns {string} 屏蔽后的字符串
   */
  function _maskKey(key) {
    if (!key || typeof key !== 'string') return '****';
    if (key.length <= 8) return '****';
    return key.slice(0, 4) + '****' + key.slice(-4);
  }

  /**
   * 从内存缓存获取，未命中或已过期返回 null
   * @param {string} keyName
   * @returns {string|null}
   */
  function _getFromCache(keyName) {
    const cached = _memoryCache[keyName];
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      delete _memoryCache[keyName];
      return null;
    }
    return cached.value;
  }

  /**
   * 写入内存缓存
   * @param {string} keyName
   * @param {string} value
   */
  function _setCache(keyName, value) {
    _memoryCache[keyName] = { value, timestamp: Date.now() };
  }

  /**
   * 清除指定 key 的内存缓存（修改后调用）
   * @param {string} keyName
   */
  function _invalidateCache(keyName) {
    delete _memoryCache[keyName];
  }

  /**
   * 安全保存 API Key（加密后存入 IndexedDB settings 表）
   * @param {string} keyName - 设置键名（如 'deepseek_api_key'、'coze_pat'）
   * @param {string} keyValue - 明文 API Key
   */
  async function saveSecure(keyName, keyValue) {
    if (!keyValue) return;

    try {
      const encrypted = await encrypt(keyValue);
      if (encrypted) {
        await Storage.put('settings', { key: keyName, value: encrypted });
        _invalidateCache(keyName);
        console.log('[SecureStorage] 已加密保存:', keyName, _maskKey(keyValue));
      } else {
        // 加密失败，回退到明文存储（不应发生，但保证可用性）
        await Storage.put('settings', { key: keyName, value: keyValue });
        _invalidateCache(keyName);
        console.warn('[SecureStorage] 加密失败，回退明文存储:', keyName);
      }
    } catch (e) {
      console.error('[SecureStorage] 保存失败:', e);
      // 最终回退
      try {
        await Storage.put('settings', { key: keyName, value: keyValue });
        _invalidateCache(keyName);
      } catch (e2) {
        console.error('[SecureStorage] 回退保存也失败:', e2);
      }
    }
  }

  /**
   * 安全读取 API Key（自动解密，兼容明文旧数据并自动迁移）
   * @param {string} keyName - 设置键名
   * @returns {Promise<string|null>} 明文 API Key 或 null
   */
  async function loadSecure(keyName) {
    // 优先从内存缓存读取
    const cached = _getFromCache(keyName);
    if (cached !== null) {
      return cached;
    }

    try {
      const setting = await Storage.get('settings', keyName);
      if (!setting) return null;

      const value = setting.value;
      if (!value) return null;

      // 已经是加密格式 → 解密
      if (isEncrypted(value)) {
        const decrypted = await decrypt(value);
        if (decrypted) {
          _setCache(keyName, decrypted);
          return decrypted;
        }
        // 解密失败（可能是设备指纹变化），返回 null 让用户重新配置
        console.warn('[SecureStorage] 解密失败，可能需要重新配置:', keyName);
        return null;
      }

      // 明文格式（旧数据）→ 自动迁移为密文
      if (typeof value === 'string' && value.length > 0) {
        console.log('[SecureStorage] 发现明文 token，自动迁移为密文:', keyName);
        await saveSecure(keyName, value);
        _setCache(keyName, value);
        return value;
      }

      return null;
    } catch (e) {
      console.error('[SecureStorage] 读取失败:', e);
      return null;
    }
  }

  // ===== API Key 别名方法 =====
  // 支持 deepseek_api_key / coze_pat 以及旧的 deepseek_token / coze_token

  /** 键名别名映射：新名 → 旧名（向后兼容） */
  const KEY_ALIASES = {
    'deepseek_api_key': 'deepseek_token',
    'coze_pat': 'coze_token'
  };

  /**
   * 保存 API Key（别名入口）
   * 优先用新键名存储，同时清理旧键名
   * @param {string} keyName - 如 'deepseek_api_key'、'coze_pat'
   * @param {string} keyValue - 明文值
   */
  async function saveAPIKey(keyName, keyValue) {
    // 用传入的 keyName 保存
    await saveSecure(keyName, keyValue);
    // 如果是别名键，同时清除旧键名数据
    const alias = KEY_ALIASES[keyName];
    if (alias) {
      try {
        await Storage.delete('settings', alias);
        _invalidateCache(alias);
      } catch (e) {
        // 旧键名不存在时忽略
      }
    }
  }

  /**
   * 读取 API Key（别名入口）
   * 先查新键名，未找到则查旧键名并自动迁移
   * @param {string} keyName - 如 'deepseek_api_key'、'coze_pat'
   * @returns {Promise<string|null>}
   */
  async function getAPIKey(keyName) {
    // 先尝试新键名
    let value = await loadSecure(keyName);
    if (value) return value;

    // 未找到，尝试旧键名别名
    const alias = KEY_ALIASES[keyName];
    if (alias) {
      value = await loadSecure(alias);
      if (value) {
        // 自动迁移到新键名
        console.log('[SecureStorage] 迁移旧键名', alias, '→', keyName);
        await saveSecure(keyName, value);
        try {
          await Storage.delete('settings', alias);
          _invalidateCache(alias);
        } catch (e) {
          // 忽略
        }
      }
    }

    return value;
  }

  /**
   * 初始化（预生成加密密钥）
   * 可在 App.init 阶段调用以提前预热
   */
  async function init() {
    await _getEncryptionKey();
    console.log('[SecureStorage] 初始化完成');
  }

  return {
    init,
    encrypt,
    decrypt,
    isEncrypted,
    saveSecure,
    loadSecure,
    saveAPIKey,
    getAPIKey
  };
})();
