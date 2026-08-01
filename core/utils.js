/**
 * utils.js - 公共工具函数库
 * 人生工作台 · 全局共享工具
 * v25 - 提取重复工具函数，消除 15+ 文件中的重复定义
 */

window.__APP_VERSION__ = 'v25';

const AppUtils = (() => {
  /**
   * HTML 转义（防 XSS）
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /**
   * 格式化日期为 YYYY-MM-DD
   * @param {Date|string} date - Date 对象或日期字符串
   */
  function formatDate(date) {
    if (typeof date === 'string') date = new Date(date);
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 获取今天的日期字符串 YYYY-MM-DD
   */
  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * 格式化时间为 HH:MM
   */
  function formatTime(date) {
    if (!(date instanceof Date)) date = new Date();
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  /**
   * 格式化货币金额
   */
  function formatCurrency(amount, symbol = '¥') {
    const num = parseFloat(amount) || 0;
    return `${symbol}${num.toFixed(2)}`;
  }

  /**
   * 安全解析 JSON
   */
  function safeParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  /**
   * 防抖函数
   */
  function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  return {
    escapeHtml,
    formatDate,
    getTodayStr,
    formatTime,
    formatCurrency,
    safeParseJSON,
    debounce
  };
})();
