/**
 * clock-widget.js - 日晷时钟组件
 * 人生工作台 · 动态模拟时钟，实时走动
 * 从 Dashboard 拆分而出 (v125)
 */

const ClockWidget = (() => {
    let _sundialTimer = null;

  function initSundialClock() {
    const hourHand = document.getElementById('sundial-hand-hour');
    const minuteHand = document.getElementById('sundial-hand-minute');
    const secondHand = document.getElementById('sundial-hand-second');
    const hhEl = document.getElementById('sundial-hh');
    const mmEl = document.getElementById('sundial-mm');
    const ssEl = document.getElementById('sundial-ss');

    if (!hourHand || !minuteHand || !secondHand) return;

    function updateClock() {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      const ms = now.getMilliseconds();

      // 角度计算（12小时制）
      const hourDeg = ((h % 12) + m / 60 + s / 3600) * 30; // 360/12 = 30
      const minuteDeg = (m + s / 60) * 6; // 360/60 = 6
      const secondDeg = (s + ms / 1000) * 6;

      hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
      minuteHand.style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
      secondHand.style.transform = `translateX(-50%) rotate(${secondDeg}deg)`;

      if (hhEl) hhEl.textContent = String(h).padStart(2, '0');
      if (mmEl) mmEl.textContent = String(m).padStart(2, '0');
      if (ssEl) ssEl.textContent = String(s).padStart(2, '0');
    }

    updateClock();

    // 使用 requestAnimationFrame 获得更平滑的秒针
    function tick() {
      updateClock();
      _sundialTimer = requestAnimationFrame(tick);
    }
    // 为了性能，用 setInterval 每秒更新，秒针用 CSS 过渡产生弹性
    if (_sundialTimer) cancelAnimationFrame(_sundialTimer);
    _sundialTimer = setInterval(updateClock, 1000);
  }

  function destroySundialClock() {
    if (_sundialTimer) {
      clearInterval(_sundialTimer);
      _sundialTimer = null;
    }
  }

  return { init: initSundialClock, destroy: destroySundialClock };
})();

export { ClockWidget };
