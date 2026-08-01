/**
 * secure-storage.js - API Key 安全存储
 * 人生工作台 · 使用 Web Crypto API AES-GCM 加密存储敏感信息
 * 
 * 原理：
 * - 基于设备指纹生成确定性 AES-GCM 密钥
 * - 加密后以 { iv, data } 结构存入 IndexedDB
 * - 同一设备可解密，跨设备不可用（需重新配置）
 * - 首次遇到明文 token 时自动迁移为密文
 */

const SecureStorage = (() => {
  let _encryptionKey = null;

  /**
   * 获取设备指纹（用于派生加密密钥）
   * 使用 canvas fingerprint + 屏幕信息 + 时区等
   */
  function _getDeviceFingerprint() {
    const parts = [];

    // 屏幕信息
    parts.push(screen.width + 'x' + screen.height);
    parts.push(screen.colorDepth);
    parts.push(navigator.language);
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Canvas fingerprint（轻量版）
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 50, 50);
      ctx.fillStyle = '#069';
      ctx.fillText('🔒', 2, 2);
      parts.push(canvas.toDataURL().slice(-32));
    } catch (e) {
      parts.push('no-canvas');
    }

    // 平台信息
    parts.push(navigator.platform || '');
    parts.push(navigator.hardwareConcurrency || '');

    return parts.join('|');
  }

  /**
   * 获取或生成 AES-GCM 加密密钥
   * 基于设备指纹 + 应用固定盐派生
   */
  async function _getEncryptionKey() {
    if (_encryptionKey) return _encryptionKey;

    try {
      const fingerprint = _getDeviceFingerprint();
      // 应用固定盐，确保同设备同密钥
      const salt = new TextEncoder().encode('life-work-space-secure-storage-v1');
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
   * @returns {Promise<Object|null>} { iv: number[], data: number[] } 或 null（加密失败）
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
        _encrypted: true // 标记为加密数据
      };
    } catch (e) {
      console.error('[SecureStorage] 加密失败:', e);
      return null;
    }
  }

  /**
   * 解密数据
   * @param {Object} encrypted - { iv: number[], data: number[] }
   * @returns {Promise<string|null>} 明文或 null（解密失败）
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
   */
  function isEncrypted(value) {
    return value && typeof value === 'object' && value._encrypted === true;
  }

  /**
   * 安全保存 API Key（加密后存入 IndexedDB settings 表）
   * @param {string} key - 设置键名（如 'deepseek_token'）
   * @param {string} token - 明文 API Key
   */
  async function saveSecure(key, token) {
    if (!token) return;

    try {
      const encrypted = await encrypt(token);
      if (encrypted) {
        await Storage.put('settings', { key: key, value: encrypted });
        console.log('[SecureStorage] 已加密保存:', key);
      } else {
        // 加密失败，回退到明文存储（不应发生，但保证可用性）
        await Storage.put('settings', { key: key, value: token });
        console.warn('[SecureStorage] 加密失败，回退明文存储:', key);
      }
    } catch (e) {
      console.error('[SecureStorage] 保存失败:', e);
      // 最终回退
      try {
        await Storage.put('settings', { key: key, value: token });
      } catch (e2) {
        console.error('[SecureStorage] 回退保存也失败:', e2);
      }
    }
  }

  /**
   * 安全读取 API Key（自动解密，兼容明文旧数据并自动迁移）
   * @param {string} key - 设置键名
   * @returns {Promise<string|null>} 明文 API Key 或 null
   */
  async function loadSecure(key) {
    try {
      const setting = await Storage.get('settings', key);
      if (!setting) return null;

      const value = setting.value;
      if (!value) return null;

      // 已经是加密格式 → 解密
      if (isEncrypted(value)) {
        const decrypted = await decrypt(value);
        if (decrypted) return decrypted;
        // 解密失败（可能是设备指纹变化），返回 null 让用户重新配置
        console.warn('[SecureStorage] 解密失败，可能需要重新配置:', key);
        return null;
      }

      // 明文格式（旧数据）→ 自动迁移为密文
      if (typeof value === 'string' && value.length > 0) {
        console.log('[SecureStorage] 发现明文 token，自动迁移为密文:', key);
        await saveSecure(key, value);
        return value;
      }

      return null;
    } catch (e) {
      console.error('[SecureStorage] 读取失败:', e);
      return null;
    }
  }

  return {
    encrypt,
    decrypt,
    isEncrypted,
    saveSecure,
    loadSecure
  };
})();
