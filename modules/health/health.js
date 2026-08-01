/**
 * health.js - 健康与身体模块逻辑
 * 人生工作台 · 体重/睡眠/运动/饮水/饮食
 */

const HealthModule = (() => {
  const { escapeHtml, formatDate } = AppUtils;

  // 当前查看的日期
  let currentDate = new Date();

  // 当日健康数据
  let healthData = null;

  // ===== 工具函数 =====


  function getWeekdayName(date) {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return names[date.getDay()];
  }

  function isToday(date) {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  }



  // ===== 初始化 =====
  async function init() {
    console.log('[Health] 健康模块初始化...');
    currentDate = new Date();
    renderAll();
    await loadData();
    bindEvents();
  }

  // ===== 渲染骨架 =====
  function renderAll() {
    updateDateDisplay();
  }

  // ===== 日期显示 =====
  function updateDateDisplay() {
    const dateTextEl = document.getElementById('health-date-text');
    const weekdayEl = document.getElementById('health-date-weekday');
    const todayBtn = document.getElementById('health-today-btn');

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    const d = currentDate.getDate();

    if (dateTextEl) {
      dateTextEl.textContent = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (weekdayEl) {
      weekdayEl.textContent = isToday(currentDate) ? '今天' : getWeekdayName(currentDate);
    }
    if (todayBtn) {
      todayBtn.classList.toggle('active', isToday(currentDate));
    }
  }

  // ===== 加载数据 =====
  async function loadData() {
    const dateStr = formatDate(currentDate);
    try {
      healthData = await Storage.get('health', dateStr);
      if (!healthData) {
        healthData = {
          id: dateStr,
          date: dateStr,
          weight: null,
          weightTrend: '',
          sleep: { bedtime: '23:00', waketime: '07:00', duration: null, nap: 0 },
          exercises: [],
          water: 0,
          diets: []
        };
      }
      // 确保字段完整（兼容旧数据）
      if (!healthData.sleep) healthData.sleep = { bedtime: '23:00', waketime: '07:00', duration: null, nap: 0 };
      if (!healthData.exercises) healthData.exercises = [];
      if (healthData.water === undefined) healthData.water = 0;
      if (!healthData.diets) healthData.diets = [];

      fillUI();
    } catch (err) {
      console.error('[Health] 加载数据失败:', err);
    }
  }

  // ===== 填充UI =====
  function fillUI() {
    // 体重
    const weightInput = document.getElementById('health-weight-input');
    if (weightInput && healthData.weight !== null && healthData.weight !== undefined) {
      weightInput.value = healthData.weight;
    }
    const trendEl = document.getElementById('health-weight-trend');
    if (trendEl && healthData.weightTrend) {
      trendEl.textContent = healthData.weightTrend;
    }

    // 睡眠
    const bedtimeInput = document.getElementById('health-sleep-bedtime');
    const waketimeInput = document.getElementById('health-sleep-waketime');
    const napInput = document.getElementById('health-sleep-nap');
    if (bedtimeInput) bedtimeInput.value = healthData.sleep.bedtime || '23:00';
    if (waketimeInput) waketimeInput.value = healthData.sleep.waketime || '07:00';
    if (napInput) napInput.value = healthData.sleep.nap || 0;
    calcSleepDuration();

    // 运动
    renderExercises();

    // 饮水
    updateWaterDisplay();

    // 饮食
    renderDiets();
  }

  // ===== 日期切换 =====
  function shiftDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    renderAll();
    loadData();
  }

  function goToday() {
    currentDate = new Date();
    renderAll();
    loadData();
  }

  // ===== 保存数据 =====
  async function saveData() {
    const dateStr = formatDate(currentDate);
    try {
      healthData.id = dateStr;
      healthData.date = dateStr;
      await Storage.put('health', healthData);
    } catch (err) {
      console.error('[Health] 保存失败:', err);
    }
  }

  // ===== 体重 =====
  function bindWeightEvents() {
    const input = document.getElementById('health-weight-input');
    if (!input) return;
    let saveTimer = null;
    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        healthData.weight = val;
        // 计算趋势
        calcWeightTrend();
      } else {
        healthData.weight = null;
      }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveData(), 500);
    });
  }

  async function calcWeightTrend() {
    const trendEl = document.getElementById('health-weight-trend');
    if (!trendEl || !healthData.weight) { trendEl.textContent = ''; return; }

    try {
      // 找最近一次有体重的记录
      const allHealth = await Storage.getAll('health');
      const dateStr = formatDate(currentDate);
      const prevRecords = allHealth
        .filter(r => r.date < dateStr && r.weight !== null && r.weight !== undefined)
        .sort((a, b) => b.date.localeCompare(a.date));

      if (prevRecords.length === 0) { trendEl.textContent = ''; return; }

      const prev = prevRecords[0];
      const diff = (healthData.weight - prev.weight).toFixed(1);
      if (diff > 0) {
        trendEl.textContent = `较上次 +${diff} kg`;
        trendEl.style.color = 'var(--accent-red)';
      } else if (diff < 0) {
        trendEl.textContent = `较上次 ${diff} kg`;
        trendEl.style.color = 'var(--accent-green)';
      } else {
        trendEl.textContent = '与上次持平';
        trendEl.style.color = 'var(--text-muted)';
      }
    } catch (err) {
      trendEl.textContent = '';
    }
  }

  // ===== 睡眠 =====
  function bindSleepEvents() {
    const bedtimeInput = document.getElementById('health-sleep-bedtime');
    const waketimeInput = document.getElementById('health-sleep-waketime');
    const napInput = document.getElementById('health-sleep-nap');

    const update = () => {
      if (bedtimeInput) healthData.sleep.bedtime = bedtimeInput.value;
      if (waketimeInput) healthData.sleep.waketime = waketimeInput.value;
      if (napInput) healthData.sleep.nap = parseInt(napInput.value) || 0;
      calcSleepDuration();
      clearTimeout(saveData._sleepTimer);
      saveData._sleepTimer = setTimeout(() => saveData(), 500);
    };

    if (bedtimeInput) bedtimeInput.addEventListener('change', update);
    if (waketimeInput) waketimeInput.addEventListener('change', update);
    if (napInput) napInput.addEventListener('input', update);
  }

  function calcSleepDuration() {
    const bedtimeEl = document.getElementById('health-sleep-bedtime');
    const waketimeEl = document.getElementById('health-sleep-waketime');
    const hoursEl = document.querySelector('.health-sleep-hours');
    if (!bedtimeEl || !waketimeEl || !hoursEl) return;

    const bed = bedtimeEl.value;
    const wake = waketimeEl.value;
    if (!bed || !wake) { hoursEl.textContent = '--'; return; }

    const bedMin = timeToMinutes(bed);
    let wakeMin = timeToMinutes(wake);

    // 如果起床时间 <= 入睡时间，说明跨天了
    if (wakeMin <= bedMin) {
      wakeMin += 24 * 60;
    }

    const durationMin = wakeMin - bedMin;
    const hours = Math.floor(durationMin / 60);
    const mins = durationMin % 60;
    healthData.sleep.duration = durationMin;

    if (mins > 0) {
      hoursEl.textContent = `${hours}小时${mins}分`;
    } else {
      hoursEl.textContent = `${hours}`;
    }
  }

  function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  // ===== 运动 =====
  function renderExercises() {
    const list = document.getElementById('health-exercise-list');
    if (!list) return;

    if (healthData.exercises.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-light);font-size:13px;padding:8px;">还没有运动记录</div>';
      return;
    }

    const typeEmoji = {
      walking: '🚶', running: '🏃', cycling: '🚴', swimming: '🏊',
      yoga: '🧘', strength: '🏋️', basketball: '🏀', badminton: '🏸',
      hiking: '🥾'
    };

    list.innerHTML = healthData.exercises.map((ex, i) => `
      <div class="health-exercise-item">
        <span class="health-exercise-item-name">${typeEmoji[ex.type] || '️'} ${escapeHtml(ex.customType || ex.type)}</span>
        <span class="health-exercise-item-duration">${ex.duration}分钟</span>
        <button class="health-exercise-item-delete" data-index="${i}">✕</button>
      </div>
    `).join('');

    // 绑定删除
    list.querySelectorAll('.health-exercise-item-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        healthData.exercises.splice(idx, 1);
        renderExercises();
        saveData();
      });
    });
  }

  function bindExerciseEvents() {
    const typeSelect = document.getElementById('health-exercise-type');
    const customInput = document.getElementById('health-exercise-custom');
    const durationInput = document.getElementById('health-exercise-duration');
    const addBtn = document.getElementById('health-exercise-add-btn');

    if (!typeSelect || !addBtn) return;

    // 自定义类型切换
    typeSelect.addEventListener('change', () => {
      if (customInput) {
        customInput.style.display = typeSelect.value === 'custom' ? '' : 'none';
      }
    });

    // 添加运动
    addBtn.addEventListener('click', () => {
      const type = typeSelect.value;
      if (!type) {
        if (typeof App !== 'undefined' && App.showToast) App.showToast('请选择运动类型');
        return;
      }
      const duration = parseInt(durationInput.value);
      if (!duration || duration <= 0) {
        if (typeof App !== 'undefined' && App.showToast) App.showToast('请输入运动时长');
        return;
      }

      const exercise = {
        type: type,
        customType: type === 'custom' ? (customInput?.value || '') : '',
        duration: duration
      };

      healthData.exercises.push(exercise);
      renderExercises();
      saveData();

      // 重置表单
      typeSelect.value = '';
      if (customInput) { customInput.value = ''; customInput.style.display = 'none'; }
      if (durationInput) durationInput.value = '';
    });
  }

  // ===== 饮水 =====
  function updateWaterDisplay() {
    const amountEl = document.getElementById('health-water-amount');
    const fillEl = document.getElementById('health-water-fill');
    if (amountEl) amountEl.textContent = healthData.water || 0;
    if (fillEl) {
      const pct = Math.min((healthData.water || 0) / 1500 * 100, 100);
      fillEl.style.width = `${pct}%`;
    }
  }

  function bindWaterEvents() {
    // 快捷按钮
    document.querySelectorAll('.health-water-btn[data-amount]').forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = parseInt(btn.dataset.amount);
        healthData.water = (healthData.water || 0) + amount;
        updateWaterDisplay();
        saveData();
      });
    });

    // 自定义按钮
    const customBtn = document.getElementById('health-water-custom-btn');
    const customInput = document.getElementById('health-water-custom-input');
    if (customBtn && customInput) {
      customBtn.addEventListener('click', () => {
        if (customInput.style.display === 'none' || !customInput.style.display) {
          customInput.style.display = '';
          customInput.focus();
        } else {
          const amount = parseInt(customInput.value);
          if (amount && amount > 0) {
            healthData.water = (healthData.water || 0) + amount;
            updateWaterDisplay();
            saveData();
          }
          customInput.value = '';
          customInput.style.display = 'none';
        }
      });

      customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const amount = parseInt(customInput.value);
          if (amount && amount > 0) {
            healthData.water = (healthData.water || 0) + amount;
            updateWaterDisplay();
            saveData();
          }
          customInput.value = '';
          customInput.style.display = 'none';
        }
      });
    }
  }

  // ===== 饮食 =====
  function renderDiets() {
    const list = document.getElementById('health-diet-list');
    if (!list) return;

    const mealEmoji = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍪' };
    const mealLabel = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

    if (healthData.diets.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-light);font-size:13px;padding:8px;">还没有饮食记录</div>';
      return;
    }

    list.innerHTML = healthData.diets.map((diet, i) => `
      <div class="health-diet-item">
        <span class="health-diet-item-meal">${mealEmoji[diet.meal] || '🍽️'}</span>
        <div>
          <div class="health-diet-item-meal-label">${mealLabel[diet.meal] || diet.meal}</div>
          <div class="health-diet-item-content">${escapeHtml(diet.content)}</div>
        </div>
        <button class="health-diet-item-delete" data-index="${i}">✕</button>
      </div>
    `).join('');

    // 绑定删除
    list.querySelectorAll('.health-diet-item-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        healthData.diets.splice(idx, 1);
        renderDiets();
        saveData();
      });
    });
  }

  function bindDietEvents() {
    const addBtn = document.getElementById('health-diet-add-btn');
    const form = document.getElementById('health-diet-form');
    const cancelBtn = document.getElementById('health-diet-cancel');
    const confirmBtn = document.getElementById('health-diet-confirm');
    const mealSelect = document.getElementById('health-diet-meal');
    const contentInput = document.getElementById('health-diet-content');

    if (!addBtn || !form) return;

    // 展开表单
    addBtn.addEventListener('click', () => {
      form.style.display = form.style.display === 'none' ? '' : 'none';
      if (form.style.display !== 'none' && contentInput) contentInput.focus();
    });

    // 取消
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        form.style.display = 'none';
        if (contentInput) contentInput.value = '';
      });
    }

    // 确认
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const meal = mealSelect?.value || 'lunch';
        const content = contentInput?.value?.trim();
        if (!content) {
          if (typeof App !== 'undefined' && App.showToast) App.showToast('请输入饮食内容');
          return;
        }

        healthData.diets.push({ meal, content });
        renderDiets();
        saveData();

        form.style.display = 'none';
        if (contentInput) contentInput.value = '';
      });
    }
  }

  // ===== 绑定事件 =====
  function bindEvents() {
    // 日期切换
    const prevBtn = document.getElementById('health-prev-day');
    const nextBtn = document.getElementById('health-next-day');
    const todayBtn = document.getElementById('health-today-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => shiftDate(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => shiftDate(1));
    if (todayBtn) todayBtn.addEventListener('click', goToday);

    bindWeightEvents();
    bindSleepEvents();
    bindExerciseEvents();
    bindWaterEvents();
    bindDietEvents();
  }


  // ===== 模块生命周期 =====
  let _eventListeners = [];
  let _intervals = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => el.removeEventListener(event, handler));
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    console.log('[HealthModule] 模块已销毁');
  }

  return { init };
})();
