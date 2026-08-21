/**
 * weather-widget.js - 天气、农历、卦象组件
 * 人生工作台 · 天气查询、农历计算、每日卦象
 * 从 Dashboard 拆分而出 (v125)
 */
import { Storage } from '../../../core/storage.js';
import { Router } from '../../../core/router.js';

const WeatherWidget = (() => {
  async function renderDailyGua() {
    const card = document.getElementById('dash-daily-gua');
    if (!card) return;

    try {
      // 动态导入 DaoModule（避免循环依赖）
      const mod = await import('../../dao/dao.js');
      if (!mod || !mod.DaoModule) return;

      const result = mod.DaoModule.getDailyGua(new Date());
      if (!result || !result.benGua) return;

      const bagua = mod.DaoModule.getBagua();
      const gua = result.benGua;

      // 日期
      const now = new Date();
      const dateEl = document.getElementById('dash-gua-date');
      if (dateEl) dateEl.textContent = `${now.getMonth()+1}月${now.getDate()}日`;

      // 卦象符号
      const symEl = document.getElementById('dash-gua-symbol');
      if (symEl && bagua[gua.upper]) symEl.textContent = bagua[gua.upper].symbol;

      // 卦名
      const nameEl = document.getElementById('dash-gua-name');
      if (nameEl) nameEl.textContent = `${gua.name} · 第${gua.idx}卦`;

      // 卦辞（摘要显示）
      const ciEl = document.getElementById('dash-gua-ci');
      if (ciEl) ciEl.textContent = gua.guaci;

      // === 展开详情 ===
      // 完整卦辞
      const fullCiEl = document.getElementById('dash-gua-full-ci');
      if (fullCiEl) fullCiEl.textContent = gua.guaci;

      // 解读/今日指引
      const jieduEl = document.getElementById('dash-gua-jiedu-text');
      if (jieduEl) {
        // 取解读的前两句话作为今日指引
        const jiedu = gua.jiedu || '';
        const sentences = jiedu.split(/[。！？]/).filter(s => s.trim().length > 0);
        const dailyTip = sentences.slice(0, 2).join('。') + '。';
        jieduEl.textContent = dailyTip || jiedu;
      }

      // 阴阳爻线
      const yaoEl = document.getElementById('dash-gua-yao-lines');
      if (yaoEl && gua.yaos) {
        // yaos 从上到下（索引0为上爻），渲染时从下到上展示更直观
        // 但64卦数据中 yaos 是从上到下，卦象展示习惯也是从上到下
        const yaoNames = ['上', '五', '四', '三', '二', '初'];
        yaoEl.innerHTML = gua.yaos.map((y, i) => {
          const isYang = y === 1;
          return `
            <div class="dash-yao-line ${isYang ? 'dash-yao-yang' : 'dash-yao-yin'}">
              ${isYang
                ? '<span class="dash-yao-bar dash-yao-full"></span>'
                : '<span class="dash-yao-bar dash-yao-half"></span><span class="dash-yao-gap"></span><span class="dash-yao-bar dash-yao-half"></span>'
              }
              <span class="dash-yao-label">${yaoNames[i]}${isYang ? '九' : '六'}</span>
            </div>
          `;
        }).join('');
      }

      // 点击展开/收起（仅当点击卡片主体时）
      let isExpanded = false;
      const detailEl = document.getElementById('dash-gua-detail');
      const hintEl = document.getElementById('dash-gua-hint');
      const moreLink = document.getElementById('dash-gua-more-link');

      function toggleExpand() {
        isExpanded = !isExpanded;
        if (detailEl) {
          detailEl.style.display = isExpanded ? 'block' : 'none';
        }
        if (hintEl) {
          hintEl.textContent = isExpanded ? '点击收起 ▲' : '点击展开详情 ↓';
        }
        card.classList.toggle('expanded', isExpanded);
      }

      // 卡片点击（排除more-link）
      card.addEventListener('click', (e) => {
        if (e.target.closest('#dash-gua-more-link')) return;
        toggleExpand();
      });

      // 查看详情链接跳转道模块
      if (moreLink) {
        moreLink.addEventListener('click', (e) => {
          e.stopPropagation();
          Router.navigate('dao', { tab: 'yijing' });
        });
      }
    } catch (e) {
      console.warn('[Dashboard] 渲染每日卦象失败:', e);
    }
  }
  /**
   * 渲染天气 + 农历/节气
   */
  async function renderWeatherLunar() {
    renderLunar();
    renderWeather();
  }

  /**
   * 农历计算（简化查表法，覆盖2025-2028）
   */
  function renderLunar() {
    const today = new Date();

    // 2026年农历数据：春节2月17日，闰六月
    const springFestival2026 = new Date(2026, 1, 17);
    const lunarMonths2026 = [29,29,30,29,30,29, 29,30,29,30,29,30,29];
    const leapMonth2026 = 6;

    // 2025年辅助数据
    const springFestival2025 = new Date(2025, 0, 29);
    const lunarMonths2025 = [29,30,29,30,29,30,29,30,29,30,30,29];
    const leapMonth2025 = 0;

    let springDate, months, leapMonth, lunarYear;
    if (today >= springFestival2026) {
      springDate = springFestival2026;
      months = lunarMonths2026;
      leapMonth = leapMonth2026;
      lunarYear = 2026;
    } else {
      springDate = springFestival2025;
      months = lunarMonths2025;
      leapMonth = leapMonth2025;
      lunarYear = 2025;
    }

    const diff = Math.floor((today - springDate) / 86400000);
    if (diff < 0) return;

    let lunarMonth = 0, lunarDay = 0, isLeap = false;
    let remaining = diff;

    for (let i = 0; i < months.length; i++) {
      if (remaining < months[i]) {
        if (leapMonth > 0 && i === leapMonth) {
          isLeap = true;
          lunarMonth = i;
        } else if (leapMonth > 0 && i > leapMonth) {
          lunarMonth = i;
        } else {
          lunarMonth = i + 1;
        }
        lunarDay = remaining + 1;
        break;
      }
      remaining -= months[i];
    }

    if (lunarMonth === 0) lunarMonth = 1;

    const lunarNames = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
    const dayNames = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
      '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
      '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
    const ganNames = ['庚','辛','壬','癸','甲','乙','丙','丁','戊','己'];
    const zhiNames = ['申','酉','戌','亥','子','丑','寅','卯','辰','巳','午','未'];
    const animalNames = ['猴','鸡','狗','猪','鼠','牛','虎','兔','龙','蛇','马','羊'];

    const lunarMonthStr = (isLeap ? '闰' : '') + lunarNames[lunarMonth] + '月';
    const lunarDayStr = dayNames[lunarDay];

    const dateEl = document.getElementById('dash-lunar-date');
    if (dateEl) dateEl.textContent = lunarMonthStr + lunarDayStr;

    const ganIdx = lunarYear % 10;
    const zhiIdx = lunarYear % 12;
    const yearEl = document.getElementById('dash-lunar-year');
    if (yearEl) yearEl.textContent = ganNames[ganIdx] + zhiNames[zhiIdx] + '年 · ' + animalNames[zhiIdx] + '年';

    // 节气
    const solarTerms2026 = [
      { name: '小寒', date: new Date(2026, 0, 5) },
      { name: '大寒', date: new Date(2026, 0, 20) },
      { name: '立春', date: new Date(2026, 1, 4) },
      { name: '雨水', date: new Date(2026, 1, 18) },
      { name: '惊蛰', date: new Date(2026, 2, 5) },
      { name: '春分', date: new Date(2026, 2, 20) },
      { name: '清明', date: new Date(2026, 3, 5) },
      { name: '谷雨', date: new Date(2026, 3, 20) },
      { name: '立夏', date: new Date(2026, 4, 5) },
      { name: '小满', date: new Date(2026, 4, 21) },
      { name: '芒种', date: new Date(2026, 5, 5) },
      { name: '夏至', date: new Date(2026, 5, 21) },
      { name: '小暑', date: new Date(2026, 6, 7) },
      { name: '大暑', date: new Date(2026, 6, 22) },
      { name: '立秋', date: new Date(2026, 7, 7) },
      { name: '处暑', date: new Date(2026, 7, 23) },
      { name: '白露', date: new Date(2026, 8, 7) },
      { name: '秋分', date: new Date(2026, 8, 23) },
      { name: '寒露', date: new Date(2026, 9, 8) },
      { name: '霜降', date: new Date(2026, 9, 23) },
      { name: '立冬', date: new Date(2026, 10, 7) },
      { name: '小雪', date: new Date(2026, 10, 22) },
      { name: '大雪', date: new Date(2026, 11, 7) },
      { name: '冬至', date: new Date(2026, 11, 21) }
    ];

    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    let currentTerm = null;
    let nextTerm = null;

    for (let i = 0; i < solarTerms2026.length; i++) {
      const termMs = new Date(solarTerms2026[i].date.getFullYear(),
        solarTerms2026[i].date.getMonth(), solarTerms2026[i].date.getDate()).getTime();
      if (termMs <= todayMs) currentTerm = solarTerms2026[i];
    }

    for (let j = 0; j < solarTerms2026.length; j++) {
      const tMs = new Date(solarTerms2026[j].date.getFullYear(),
        solarTerms2026[j].date.getMonth(), solarTerms2026[j].date.getDate()).getTime();
      if (tMs > todayMs) { nextTerm = solarTerms2026[j]; break; }
    }

    let termDisplay = '';
    if (currentTerm) {
      const daysSinceTerm = Math.floor((todayMs - new Date(currentTerm.date.getFullYear(),
        currentTerm.date.getMonth(), currentTerm.date.getDate()).getTime()) / 86400000);
      if (daysSinceTerm === 0) {
        termDisplay = '今日 ' + currentTerm.name;
      } else if (daysSinceTerm <= 3) {
        termDisplay = currentTerm.name + ' 已过' + daysSinceTerm + '天';
      } else if (nextTerm) {
        const daysToNext = Math.ceil((new Date(nextTerm.date.getFullYear(),
          nextTerm.date.getMonth(), nextTerm.date.getDate()).getTime() - todayMs) / 86400000);
        termDisplay = currentTerm.name + ' · ' + nextTerm.name + '还有' + daysToNext + '天';
      } else {
        termDisplay = currentTerm.name;
      }
    } else if (nextTerm) {
      const dToN = Math.ceil((new Date(nextTerm.date.getFullYear(),
        nextTerm.date.getMonth(), nextTerm.date.getDate()).getTime() - todayMs) / 86400000);
      termDisplay = nextTerm.name + '还有' + dToN + '天';
    }

    const termEl = document.getElementById('dash-solar-term');
    if (termEl) termEl.textContent = termDisplay;
  }

  /**
   * 天气获取（IP自动定位 + wttr.in天气查询）
   */
  function renderWeather() {
    const labelEl = document.getElementById('dash-weather-label');
    const iconEl = document.getElementById('dash-weather-icon');
    const tempEl = document.getElementById('dash-weather-temp');
    const descEl = document.getElementById('dash-weather-desc');

    function showFallback() {
      if (labelEl) labelEl.textContent = '今日天气';
      if (iconEl) iconEl.textContent = '🌤';
      if (tempEl) tempEl.textContent = '--°';
      if (descEl) descEl.textContent = '暂无天气数据';
    }

    function weatherIconForCode(code) {
      if (code >= 113 && code <= 116) return '☀️';
      if (code >= 119 && code <= 122) return '⛅';
      if (code >= 143 && code <= 176) return '🌫';
      if (code >= 179 && code <= 182) return '🌨';
      if (code >= 185 && code <= 200) return '🌫';
      if (code >= 227 && code <= 230) return '❄️';
      if (code >= 248 && code <= 260) return '🌫';
      if (code >= 263 && code <= 293) return '🌧';
      if (code >= 296 && code <= 311) return '🌧';
      if (code >= 314 && code <= 329) return '🌧';
      if (code >= 332 && code <= 350) return '🌨';
      if (code >= 353 && code <= 371) return '🌧';
      if (code >= 374 && code <= 395) return '❄️';
      return '🌤';
    }

    function descForCode(code) {
      if (code >= 113 && code <= 116) return '晴';
      if (code >= 119 && code <= 122) return '多云';
      if (code >= 143 && code <= 176) return '小雨';
      if (code >= 227 && code <= 230) return '雪';
      if (code >= 263 && code <= 329) return '雨';
      if (code >= 332 && code <= 371) return '阵雨';
      if (code >= 374 && code <= 395) return '雪';
      return '多云';
    }

    function fetchWeather(city) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      fetch('https://wttr.in/' + encodeURIComponent(city) + '?format=j1', {
        signal: controller.signal
      }).then(res => res.json()).then(data => {
        clearTimeout(timeout);
        const current = data.current_condition && data.current_condition[0];
        if (current) {
          const temp = current.temp_C;
          const code = parseInt(current.weatherCode, 10);
          const feelTemp = current.FeelsLikeC;
          if (iconEl) iconEl.textContent = weatherIconForCode(code);
          if (tempEl) tempEl.textContent = temp + '°';
          if (descEl) descEl.textContent = descForCode(code) + ' · 体感' + feelTemp + '°';
        } else {
          showFallback();
        }
      }).catch(() => {
        clearTimeout(timeout);
        showFallback();
      });
    }

    // IP定位主源：ipwho.is
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 5000);
    fetch('https://ipwho.is/', { signal: controller1.signal })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeout1);
        if (data.success && data.city) {
          if (labelEl) labelEl.textContent = '今日天气 · ' + data.city;
          fetchWeather(data.city);
        } else {
          // 备源：ipapi.co
          const controller2 = new AbortController();
          const timeout2 = setTimeout(() => controller2.abort(), 5000);
          fetch('https://ipapi.co/json/', { signal: controller2.signal })
            .then(res => res.json())
            .then(data2 => {
              clearTimeout(timeout2);
              if (data2.city) {
                if (labelEl) labelEl.textContent = '今日天气 · ' + data2.city;
                fetchWeather(data2.city);
              } else {
                showFallback();
              }
            })
            .catch(() => { clearTimeout(timeout2); showFallback(); });
        }
      })
      .catch(() => {
        clearTimeout(timeout1);
        // 备源：ipapi.co
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 5000);
        fetch('https://ipapi.co/json/', { signal: controller2.signal })
          .then(res => res.json())
          .then(data2 => {
            clearTimeout(timeout2);
            if (data2.city) {
              if (labelEl) labelEl.textContent = '今日天气 · ' + data2.city;
              fetchWeather(data2.city);
            } else {
              showFallback();
            }
          })
          .catch(() => { clearTimeout(timeout2); showFallback(); });
      });
  }

  async function init() {
    renderWeatherLunar();
    await renderDailyGua();
  }

  function destroy() {
    // 无定时器需要清理
  }

  return { init, destroy, renderWeatherLunar, renderDailyGua };
})();

export { WeatherWidget };
