/**
 * data-minimizer.js - 数据最小化与隐私保护
 * 人生工作台 · API 调用前的 PII 脱敏模块
 * 在向 AI API 发送数据前，自动检测并替换个人身份信息
 * v1.0 - 第十五批优化：数据最小化与隐私保护
 */
import { Storage } from './storage.js';


export const DataMinimizer = (() => {
  'use strict';

  // ===== 常量 =====

  /** 占位符模板 */
  const PLACEHOLDERS = {
    phone: '手机号',
    idCard: '身份证',
    email: '邮箱',
    bankCard: '银行卡',
    address: '地址',
    contact: '联系人'
  };

  /** 联系人缓存，避免每次调用都读 Storage */
  let _contactCache = null;
  let _contactCacheTime = 0;
  const CONTACT_CACHE_TTL = 5 * 60 * 1000; // 缓存 5 分钟

  /** 功能开关缓存 */
  let _enabledCache = null;

  // ===== PII 正则表达式 =====

  /**
   * 手机号：1 开头，3/4/5/6/7/8/9 第二位，共 11 位
   * 支持带横线格式：1xx-xxxx-xxxx 或纯数字 1xxxxxxxxxx
   */
  const PHONE_REGEX = /1[3-9]\d{1}(?:-?\d{4})(?:-?\d{4})/g;

  /**
   * 身份证号：18 位，最后一位可以是数字或 X/x
   * 格式：6位地区码 + 8位出生日期 + 3位顺序码 + 1位校验码
   */
  const ID_CARD_REGEX = /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g;

  /**
   * 邮箱：xxx@xxx.xxx 格式
   */
  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  /**
   * 银行卡号：16-19 位连续数字
   * 注意：需要避免误匹配身份证号，所以只匹配不在身份证上下文中的纯数字
   */
  const BANK_CARD_REGEX = /(?<!\d)\d{16,19}(?!\d)/g;

  /**
   * 地址关键词模式：匹配含"省""市""区""街""路""号""栋""单元""室"的连续地址片段
   * 匹配规则：以地址关键词为核心的连续中文字符片段（前后可以有数字）
   */
  const ADDRESS_REGEX = /[\u4e00-\u9fa5\d]*?(?:省|市|区|街|路|号|栋|单元|室)[\u4e00-\u9fa5\d]*?(?:省|市|区|街|路|号|栋|单元|室)?[\u4e00-\u9fa5\d]*/g;

  // ===== 工具函数 =====

  /**
   * 检查功能是否启用
   * @returns {boolean}
   */
  function isEnabled() {
    if (_enabledCache !== null) return _enabledCache;
    try {
      const raw = localStorage.getItem('life-workspace-settings');
      if (raw) {
        const settings = JSON.parse(raw);
        _enabledCache = settings.dataMinimizer !== false; // 默认启用
      } else {
        _enabledCache = true;
      }
    } catch (e) {
      _enabledCache = true;
    }
    return _enabledCache;
  }

  /**
   * 设置功能开关
   * @param {boolean} enabled
   */
  function setEnabled(enabled) {
    _enabledCache = enabled;
    try {
      const raw = localStorage.getItem('life-workspace-settings');
      const settings = raw ? JSON.parse(raw) : {};
      settings.dataMinimizer = enabled;
      localStorage.setItem('life-workspace-settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('[DataMinimizer] 保存设置失败:', e);
    }
  }

  /**
   * 检查是否需要显示首次提示
   * @returns {boolean}
   */
  function shouldShowFirstTimeTip() {
    try {
      return !localStorage.getItem('life-workspace-dataminimizer-tipped');
    } catch (e) {
      return true;
    }
  }

  /**
   * 标记首次提示已显示
   */
  function markFirstTimeTipShown() {
    try {
      localStorage.setItem('life-workspace-dataminimizer-tipped', '1');
    } catch (e) { /* 静默 */ }
  }

  /**
   * 获取联系人姓名列表
   * 从 relations 模块的 Storage 中读取
   * @returns {Promise<string[]>} 联系人姓名数组
   */
  async function getContactNames() {
    const now = Date.now();
    // 使用缓存
    if (_contactCache && (now - _contactCacheTime) < CONTACT_CACHE_TTL) {
      return _contactCache;
    }

    try {
      if (Storage.getAll) {
        const contacts = await Storage.getAll('contacts');
        if (contacts && contacts.length > 0) {
          _contactCache = contacts.map(c => c.name).filter(n => n && n.trim().length > 0);
          _contactCacheTime = now;
          return _contactCache;
        }
      }
    } catch (e) {
      console.warn('[DataMinimizer] 读取联系人失败:', e);
    }

    _contactCache = [];
    _contactCacheTime = now;
    return [];
  }

  /**
   * 判断一段数字是否可能是银行卡号（排除身份证号的误匹配）
   * @param {string} match - 匹配到的数字串
   * @param {string} fullText - 原始完整文本
   * @param {number} matchIndex - 匹配位置
   * @returns {boolean}
   */
  function isLikelyBankCard(match, fullText, matchIndex) {
    // 如果长度为18且符合身份证格式，排除
    if (match.length === 18 && /^[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/i.test(match)) {
      return false;
    }
    // 如果长度 < 16，不是银行卡
    if (match.length < 16) return false;
    return true;
  }

  /**
   * 判断地址匹配是否有效（排除过于短小的误匹配）
   * @param {string} match - 匹配到的地址片段
   * @returns {boolean}
   */
  function isValidAddress(match) {
    // 至少包含 2 个以上汉字 + 地址关键词
    const chineseChars = match.replace(/[^\u4e00-\u9fa5]/g, '');
    return chineseChars.length >= 2;
  }

  // ===== 核心方法 =====

  /**
   * 数据最小化：检测并替换文本中的 PII
   * @param {string} text - 原始文本
   * @param {Object} [context] - 调用上下文（可选，用于决定脱敏策略）
   * @param {string} [context.source] - 来源模块（xiaolu / nicole）
   * @param {string} [context.intent] - 意图类型（finance_record / task_create / chat 等）
   * @returns {Promise<{sanitizedText: string, mapping: Object}>} 脱敏后文本 + 映射表
   */
  async function minimize(text, context = {}) {
    if (!text || typeof text !== 'string') {
      return { sanitizedText: text || '', mapping: {} };
    }

    // 检查功能开关
    if (!isEnabled()) {
      return { sanitizedText: text, mapping: {} };
    }

    const mapping = {};
    let sanitized = text;
    let placeholderIndex = {}; // 每种类型的计数器

    // --- 1. 身份证号（优先级最高，避免后续被银行卡号误匹配） ---
    sanitized = sanitized.replace(ID_CARD_REGEX, (match) => {
      const key = `[${PLACEHOLDERS.idCard}]`;
      // 身份证号通常唯一，直接替换
      mapping[key] = mapping[key] || [];
      mapping[key].push(match);
      return key;
    });

    // --- 2. 手机号 ---
    sanitized = sanitized.replace(PHONE_REGEX, (match) => {
      const count = (placeholderIndex.phone || 0) + 1;
      placeholderIndex.phone = count;
      // 只有一个手机号时用简单占位符，多个时加编号
      const key = count === 1 && !sanitized.includes(`[${PLACEHOLDERS.phone}]`)
        ? `[${PLACEHOLDERS.phone}]`
        : `[${PLACEHOLDERS.phone}${String.fromCharCode(64 + count)}]`;
      mapping[key] = mapping[key] || [];
      mapping[key].push(match);
      return key;
    });

    // --- 3. 邮箱 ---
    sanitized = sanitized.replace(EMAIL_REGEX, (match) => {
      const count = (placeholderIndex.email || 0) + 1;
      placeholderIndex.email = count;
      const key = count === 1 && !sanitized.includes(`[${PLACEHOLDERS.email}]`)
        ? `[${PLACEHOLDERS.email}]`
        : `[${PLACEHOLDERS.email}${String.fromCharCode(64 + count)}]`;
      mapping[key] = mapping[key] || [];
      mapping[key].push(match);
      return key;
    });

    // --- 4. 银行卡号（16-19位纯数字，排除身份证号） ---
    // 重置正则 lastIndex
    BANK_CARD_REGEX.lastIndex = 0;
    // 先收集所有匹配，避免替换时索引偏移
    const bankCardMatches = [];
    let bcMatch;
    while ((bcMatch = BANK_CARD_REGEX.exec(sanitized)) !== null) {
      if (isLikelyBankCard(bcMatch[0], sanitized, bcMatch.index)) {
        bankCardMatches.push({ text: bcMatch[0], index: bcMatch.index });
      }
    }
    // 从后往前替换，避免索引偏移
    for (let i = bankCardMatches.length - 1; i >= 0; i--) {
      const m = bankCardMatches[i];
      const count = (placeholderIndex.bankCard || 0) + 1;
      placeholderIndex.bankCard = count;
      const key = count === 1 && bankCardMatches.length === 1
        ? `[${PLACEHOLDERS.bankCard}]`
        : `[${PLACEHOLDERS.bankCard}${String.fromCharCode(64 + count)}]`;
      mapping[key] = mapping[key] || [];
      mapping[key].push(m.text);
      sanitized = sanitized.substring(0, m.index) + key + sanitized.substring(m.index + m.text.length);
    }

    // --- 5. 地址片段 ---
    ADDRESS_REGEX.lastIndex = 0;
    const addressMatches = [];
    let addrMatch;
    while ((addrMatch = ADDRESS_REGEX.exec(sanitized)) !== null) {
      if (isValidAddress(addrMatch[0])) {
        // 避免匹配到太短的或已经包含占位符的片段
        if (!addrMatch[0].includes('[') && addrMatch[0].length >= 3) {
          addressMatches.push({ text: addrMatch[0], index: addrMatch.index });
        }
      }
    }
    // 从后往前替换
    for (let i = addressMatches.length - 1; i >= 0; i--) {
      const m = addressMatches[i];
      const count = (placeholderIndex.address || 0) + 1;
      placeholderIndex.address = count;
      const key = count === 1 && addressMatches.length === 1
        ? `[${PLACEHOLDERS.address}]`
        : `[${PLACEHOLDERS.address}${String.fromCharCode(64 + count)}]`;
      mapping[key] = mapping[key] || [];
      mapping[key].push(m.text);
      sanitized = sanitized.substring(0, m.index) + key + sanitized.substring(m.index + m.text.length);
    }

    // --- 6. 联系人姓名 ---
    const contactNames = await getContactNames();
    if (contactNames.length > 0) {
      // 按姓名长度降序排列，优先匹配长名字（避免"张三"在"张三丰"中被部分匹配）
      const sortedNames = [...contactNames].sort((a, b) => b.length - a.length);
      sortedNames.forEach((name, idx) => {
        if (sanitized.includes(name)) {
          const letter = String.fromCharCode(65 + (idx % 26)); // A-Z 循环
          const key = `[${PLACEHOLDERS.contact}${letter}]`;
          mapping[key] = mapping[key] || [];
          mapping[key].push(name);
          // 全局替换该姓名
          sanitized = sanitized.split(name).join(key);
        }
      });
    }

    // 清理：如果 mapping 的值为空，移除对应 key
    Object.keys(mapping).forEach(key => {
      if (!mapping[key] || mapping[key].length === 0) {
        delete mapping[key];
      }
    });

    // 记录脱敏日志（脱敏内容不记录原始值）
    if (Object.keys(mapping).length > 0) {
      console.log(`[DataMinimizer] 已脱敏 ${Object.keys(mapping).length} 类 PII（来源: ${context.source || '未知'}）`);
    }

    return { sanitizedText: sanitized, mapping };
  }

  /**
   * 反向还原：将占位符替换回原始值
   * @param {string} text - 包含占位符的文本
   * @param {Object} mapping - minimize() 返回的映射表
   * @returns {string} 还原后的文本
   */
  function restore(text, mapping) {
    if (!text || typeof text !== 'string' || !mapping) {
      return text || '';
    }

    let restored = text;

    // 按占位符长度降序排列，避免短占位符误替换长占位符的一部分
    const keys = Object.keys(mapping).sort((a, b) => b.length - a.length);

    keys.forEach(key => {
      const values = mapping[key];
      if (!values || values.length === 0) return;

      // 每个占位符按出现顺序依次替换为对应的原始值
      let searchFrom = 0;
      values.forEach(originalValue => {
        const pos = restored.indexOf(key, searchFrom);
        if (pos !== -1) {
          restored = restored.substring(0, pos) + originalValue + restored.substring(pos + key.length);
          searchFrom = pos + originalValue.length;
        }
      });
    });

    return restored;
  }

  /**
   * 显示首次使用提示
   * @param {Function} [onClose] - 关闭回调
   */
  function showFirstTimeTip(onClose) {
    if (!shouldShowFirstTimeTip()) {
      if (onClose) onClose();
      return;
    }

    // 创建提示浮层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10004;
      background: rgba(60,50,40,0.4);
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.2s ease;
    `;

    overlay.innerHTML = `
      <div style="
        background: var(--bg-primary, #fff);
        border-radius: 16px;
        padding: 28px 24px;
        max-width: 340px;
        width: 90%;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      ">
        <div style="font-size: 36px; margin-bottom: 12px;">🔒</div>
        <h3 style="
          margin: 0 0 8px; font-size: 17px;
          color: var(--text-primary, #333);
          font-weight: 600;
        ">隐私保护已开启</h3>
        <p style="
          margin: 0 0 20px; font-size: 14px;
          color: var(--text-secondary, #666);
          line-height: 1.6;
        ">AI 对话中会自动隐藏你的隐私信息（手机号、地址等），只发送必要内容。</p>
        <button style="
          background: var(--accent, #D4605A);
          color: #fff; border: none;
          border-radius: 8px; padding: 10px 32px;
          font-size: 15px; cursor: pointer;
          font-weight: 500;
        " id="dataminimizer-tip-close">知道了</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('#dataminimizer-tip-close');
    const close = () => {
      markFirstTimeTipShown();
      overlay.remove();
      if (onClose) onClose();
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  // ===== 公开接口 =====
  return {
    minimize,
    restore,
    isEnabled,
    setEnabled,
    shouldShowFirstTimeTip,
    showFirstTimeTip,
    getContactNames
  };
})();
