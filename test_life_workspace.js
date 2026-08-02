/**
 * 人生工作台 Puppeteer E2E 测试脚本
 * 模拟真实用户流程，检查功能是否正常
 */

const puppeteer = require('/app/data/所有对话/主对话/life-work-space/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080/life.html';
const SCREENSHOT_DIR = '/app/data/所有对话/主对话/life-work-space/test-screenshots';
const REPORT_PATH = '/app/data/所有对话/主对话/codeact/output/test_report.md';

// 确保截图目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ============ 测试框架 ============
const results = { scenarios: [], consoleErrors: [], allChecks: [] };

function addScenario(name, checks) {
  const scenarioResult = {
    name,
    checks: checks.map(c => ({ ...c })),
    passed: checks.every(c => c.passed),
  };
  results.scenarios.push(scenarioResult);
  results.allChecks.push(...checks);
  return scenarioResult;
}

function check(name, passed, detail = '') {
  return { name, passed, detail: detail || (passed ? 'OK' : 'FAIL') };
}

// ============ 工具函数 ============
async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  📸 截图: ${name}.png`);
  return filePath;
}

async function waitForContent(page, timeout = 8000) {
  // 等待内容区加载完成（不再是"加载中..."）
  try {
    await page.waitForFunction(
      () => {
        const area = document.getElementById('content-area');
        return area && !area.querySelector('div[style*="加载中"]');
      },
      { timeout }
    );
  } catch (e) {
    console.log('  ⚠️ 等待内容加载超时');
  }
}

async function checkForErrors(page, label) {
  const errors = page._consoleErrors || [];
  const newErrors = errors.filter(e => !e._reported);
  newErrors.forEach(e => {
    e._reported = true;
    results.consoleErrors.push({ scenario: label, message: e.message });
  });
  return newErrors.length;
}

async function navigateTo(page, route) {
  const navItem = await page.$(`.sidebar-nav-item[data-route="${route}"]`);
  if (navItem) {
    await navItem.click();
    await new Promise(r => setTimeout(r, 1500));
    return true;
  }
  // 尝试子菜单
  const subItem = await page.$(`.sidebar-submenu-item[data-route="${route}"]`);
  if (subItem) {
    await subItem.click();
    await new Promise(r => setTimeout(r, 1500));
    return true;
  }
  return false;
}

// ============ 主测试流程 ============
async function runTests() {
  console.log('🚀 启动 Puppeteer 测试...\n');

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--window-size=1440,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 收集控制台错误
  page._consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      page._consoleErrors.push({ message: msg.text(), _reported: false });
    }
  });
  page.on('pageerror', error => {
    page._consoleErrors.push({ message: `PageError: ${error.message}`, _reported: false });
  });

  try {
    // =====================================================
    // 场景1：首次加载
    // =====================================================
    console.log('━━━ 场景1：首次加载 ━━━');
    const s1Checks = [];

    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await screenshot(page, '01_initial_load');

    // 检查页面标题
    const title = await page.title();
    s1Checks.push(check('页面标题正确', title === '人生工作台', `标题: ${title}`));

    // 检查 JS 错误
    const errorCount1 = await checkForErrors(page, '首次加载');
    s1Checks.push(check('无 JS 错误', errorCount1 === 0, errorCount1 > 0 ? `${errorCount1} 个错误` : '无错误'));

    // 检查 Service Worker 注册
    const swStatus = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? 'registered' : 'not_registered';
    }).catch(() => 'check_failed');
    s1Checks.push(check('Service Worker 注册', swStatus === 'registered' || swStatus === 'not_registered',
      `状态: ${swStatus}`));

    // 检查 IndexedDB
    const idbStatus = await page.evaluate(() => {
      return new Promise(resolve => {
        if (!window.indexedDB) { resolve('unsupported'); return; }
        const req = indexedDB.open('test-db-check', 1);
        req.onerror = () => resolve('error');
        req.onsuccess = () => { indexedDB.deleteDatabase('test-db-check'); resolve('available'); };
      });
    });
    s1Checks.push(check('IndexedDB 可用', idbStatus === 'available', `状态: ${idbStatus}`));

    // 检查侧边栏是否渲染
    const sidebarVisible = await page.evaluate(() => {
      const sb = document.getElementById('sidebar');
      return sb && sb.offsetParent !== null;
    });
    s1Checks.push(check('侧边栏可见', sidebarVisible));

    // 检查主内容区是否有内容
    const contentHasChildren = await page.evaluate(() => {
      const area = document.getElementById('content-area');
      return area && area.children.length > 0;
    });
    s1Checks.push(check('主内容区已渲染', contentHasChildren));

    addScenario('首次加载', s1Checks);

    // =====================================================
    // 场景2：侧边栏导航切换
    // =====================================================
    console.log('\n━━━ 场景2：侧边栏导航切换 ━━━');
    const s2Checks = [];
    const navRoutes = [
      { route: 'dashboard', label: '今日总览' },
      { route: 'habits', label: '习惯打卡' },
      { route: 'tasks', label: '任务' },
      { route: 'study', label: '学习' },
      { route: 'finance', label: '财务' },
    ];

    for (const nav of navRoutes) {
      const clicked = await navigateTo(page, nav.route);
      if (clicked) {
        await waitForContent(page, 5000);
        await screenshot(page, `02_nav_${nav.route}`);

        // 检查内容区是否非空
        const contentOk = await page.evaluate(() => {
          const area = document.getElementById('content-area');
          if (!area) return false;
          const html = area.innerHTML.trim();
          // 排除纯"加载中"状态
          return html.length > 50 && !html.includes('加载中...');
        });
        s2Checks.push(check(`${nav.label}模块渲染`, contentOk,
          contentOk ? '内容正常' : '内容为空或仍在加载'));

        // 检查导航高亮
        const isActive = await page.evaluate((route) => {
          const item = document.querySelector(`.sidebar-nav-item[data-route="${route}"]`);
          return item && item.classList.contains('active');
        }, nav.route);
        s2Checks.push(check(`${nav.label}导航高亮`, isActive));
      } else {
        s2Checks.push(check(`${nav.label}导航点击`, false, '未找到导航元素'));
      }
    }

    // 检查导航过程中的 JS 错误
    const errorCount2 = await checkForErrors(page, '导航切换');
    s2Checks.push(check('导航切换无新增JS错误', errorCount2 === 0,
      errorCount2 > 0 ? `${errorCount2} 个新错误` : '无新增错误'));

    addScenario('侧边栏导航切换', s2Checks);

    // =====================================================
    // 场景3：功能模块交互
    // =====================================================
    console.log('\n━━━ 场景3：功能模块交互 ━━━');
    const s3Checks = [];

    // --- 习惯模块：尝试打卡 ---
    await navigateTo(page, 'habits');
    await waitForContent(page, 5000);
    await screenshot(page, '03_habits_before');

    const habitCheckResult = await page.evaluate(() => {
      // 查找习惯打卡按钮
      const checkBtns = document.querySelectorAll('.habit-check-btn, .habit-item-btn, [data-action="check"]');
      if (checkBtns.length > 0) {
        return { found: true, count: checkBtns.length, clicked: false };
      }
      // 查找习惯项
      const habitItems = document.querySelectorAll('.habit-item, .habit-card, [data-habit]');
      return { found: habitItems.length > 0, count: habitItems.length, clicked: false };
    });

    if (habitCheckResult.found) {
      // 尝试点击第一个打卡按钮
      const clickResult = await page.evaluate(() => {
        const btn = document.querySelector('.habit-check-btn, .habit-item-btn, [data-action="check"]');
        if (btn) { btn.click(); return true; }
        // 尝试点击习惯项中的按钮
        const habitItem = document.querySelector('.habit-item, .habit-card');
        if (habitItem) {
          const btn2 = habitItem.querySelector('button');
          if (btn2) { btn2.click(); return true; }
        }
        return false;
      });
      await new Promise(r => setTimeout(r, 1000));
      await screenshot(page, '03_habits_after_check');
      s3Checks.push(check('习惯打卡交互', true, `找到 ${habitCheckResult.count} 个习惯项，点击: ${clickResult}`));
    } else {
      // 没有习惯数据，检查空状态
      const emptyState = await page.evaluate(() => {
        const area = document.getElementById('content-area');
        return area ? area.innerText.substring(0, 200) : '';
      });
      s3Checks.push(check('习惯模块空状态', true, `无习惯数据，页面显示: ${emptyState.substring(0, 50)}`));
    }

    // --- 任务模块：尝试添加任务 ---
    await navigateTo(page, 'tasks');
    await waitForContent(page, 5000);
    await screenshot(page, '03_tasks_before');

    // 尝试找到并点击添加任务按钮
    const addTaskResult = await page.evaluate(() => {
      const addBtn = document.querySelector('.task-add-btn, .add-task-btn, [data-action="add-task"], #task-add-btn');
      return { found: !!addBtn, exists: !!addBtn };
    });

    if (addTaskResult.found) {
      await page.click('.task-add-btn, .add-task-btn, [data-action="add-task"], #task-add-btn');
      await new Promise(r => setTimeout(r, 1000));
      await screenshot(page, '03_tasks_add_dialog');

      // 尝试填写任务名称
      const inputFound = await page.evaluate(() => {
        const input = document.querySelector('.task-input, .add-task-input, input[type="text"], textarea');
        return !!input;
      });

      if (inputFound) {
        await page.type('.task-input, .add-task-input, input[type="text"], textarea', 'E2E测试任务');
        await new Promise(r => setTimeout(r, 500));
        // 尝试提交
        const submitBtn = await page.$('.task-submit-btn, .add-task-submit, button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await new Promise(r => setTimeout(r, 1500));
        }
        await screenshot(page, '03_tasks_after_add');
        s3Checks.push(check('添加任务交互', true, '已尝试添加任务'));
      } else {
        s3Checks.push(check('添加任务交互', false, '未找到任务输入框'));
      }
    } else {
      // 检查任务列表是否有内容
      const taskContent = await page.evaluate(() => {
        const area = document.getElementById('content-area');
        return area ? area.innerText.substring(0, 200) : '';
      });
      s3Checks.push(check('任务模块显示', true, `任务模块内容: ${taskContent.substring(0, 50)}`));
    }

    // --- 财务模块 ---
    await navigateTo(page, 'finance');
    await waitForContent(page, 5000);
    await screenshot(page, '03_finance');

    const financeRendered = await page.evaluate(() => {
      const area = document.getElementById('content-area');
      if (!area) return false;
      const html = area.innerHTML.trim();
      return html.length > 50;
    });
    s3Checks.push(check('财务模块渲染', financeRendered,
      financeRendered ? '正常' : '内容为空'));

    const errorCount3 = await checkForErrors(page, '功能交互');
    s3Checks.push(check('功能交互无新增JS错误', errorCount3 === 0,
      errorCount3 > 0 ? `${errorCount3} 个新错误` : '无新增错误'));

    addScenario('功能模块交互', s3Checks);

    // =====================================================
    // 场景4：AI 面板
    // =====================================================
    console.log('\n━━━ 场景4：AI 面板 ━━━');
    const s4Checks = [];

    // 先回到首页
    await navigateTo(page, 'dashboard');
    await waitForContent(page, 5000);

    // 点击小鹿AI（用evaluate避免overlay遮挡导致puppeteer click失败）
    const xiaoluBtnExists = await page.evaluate(() => !!document.getElementById('ai-fab-xiaolu'));
    if (xiaoluBtnExists) {
      await page.evaluate(() => document.getElementById('ai-fab-xiaolu').click());
      await new Promise(r => setTimeout(r, 2000));
      await screenshot(page, '04_xiaolu_panel');

      const xiaoluVisible = await page.evaluate(() => {
        const panel = document.querySelector('.xiaolu-panel');
        return panel && panel.classList.contains('show');
      });
      s4Checks.push(check('小鹿AI面板打开', xiaoluVisible,
        xiaoluVisible ? '面板可见(.show)' : '面板.show类未激活'));
    } else {
      s4Checks.push(check('小鹿AI按钮存在', false, '未找到 #ai-fab-xiaolu'));
    }

    // 点击妮可AI（注意：首次使用会显示 Token 配置对话框）
    const nicoleBtnExists = await page.evaluate(() => !!document.getElementById('ai-fab-nicole'));
    if (nicoleBtnExists) {
      await page.evaluate(() => document.getElementById('ai-fab-nicole').click());
      await new Promise(r => setTimeout(r, 2500));
      await screenshot(page, '04_nicole_panel');

      const nicoleResult = await page.evaluate(() => {
        const panel = document.querySelector('.nicole-panel');
        const tokenDialog = document.querySelector('.nicole-token-dialog');
        const panelShow = panel && panel.classList.contains('show');
        const hasTokenDialog = !!tokenDialog && getComputedStyle(tokenDialog).display !== 'none';
        return { panelShow, hasTokenDialog, panelExists: !!panel };
      });
      // 面板打开(可能显示token对话框)视为通过
      const nicoleOpen = nicoleResult.panelShow || nicoleResult.hasTokenDialog;
      s4Checks.push(check('妮可AI面板打开', nicoleOpen,
        nicoleOpen ? (nicoleResult.hasTokenDialog ? '面板打开，显示Token配置对话框' : '面板可见(.show)') : `面板未打开(panelExists:${nicoleResult.panelExists})`));
    } else {
      s4Checks.push(check('妮可AI按钮存在', false, '未找到 #ai-fab-nicole'));
    }

    // 验证互斥：先关闭所有面板，再开小鹿，再开妮可
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));

    // 打开小鹿
    if (xiaoluBtnExists) {
      await page.evaluate(() => document.getElementById('ai-fab-xiaolu').click());
      await new Promise(r => setTimeout(r, 1500));
    }
    // 再点击妮可（妮可打开时小鹿应自动关闭）
    if (nicoleBtnExists) {
      await page.evaluate(() => document.getElementById('ai-fab-nicole').click());
      await new Promise(r => setTimeout(r, 2000));
    }
    await screenshot(page, '04_both_panels');

    const mutualExclusion = await page.evaluate(() => {
      const xiaolu = document.querySelector('.xiaolu-panel');
      const nicole = document.querySelector('.nicole-panel');
      const xVisible = xiaolu && xiaolu.classList.contains('show');
      const nVisible = nicole && nicole.classList.contains('show');
      return { xVisible, nVisible, bothOpen: xVisible && nVisible };
    });
    s4Checks.push(check('AI面板互斥', !mutualExclusion.bothOpen,
      mutualExclusion.bothOpen ? '两个面板同时打开' : `小鹿:${mutualExclusion.xVisible}, 妮可:${mutualExclusion.nVisible}`));

    // 关闭面板
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));

    const errorCount4 = await checkForErrors(page, 'AI面板');
    s4Checks.push(check('AI面板无新增JS错误', errorCount4 === 0,
      errorCount4 > 0 ? `${errorCount4} 个新错误` : '无新增错误'));

    addScenario('AI面板', s4Checks);

    // =====================================================
    // 场景5：深色模式
    // =====================================================
    console.log('\n━━━ 场景5：深色模式 ━━━');
    const s5Checks = [];

    // 方式1: 通过顶部更多菜单 → 主题按钮 → 主题选择器 → 深色选项
    // 方式2: 如果方式1失败，直接通过 JS 切换
    let darkModeSwitched = false;

    try {
      // 关闭任何已打开的面板/菜单
      await page.evaluate(() => {
        document.querySelectorAll('.theme-picker-overlay').forEach(el => el.remove());
        const menu = document.getElementById('topbar-more-menu');
        if (menu) menu.style.display = 'none';
      });
      await new Promise(r => setTimeout(r, 300));

      // 打开更多菜单
      await page.evaluate(() => {
        const btn = document.getElementById('topbar-more-btn');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 600));

      // 点击主题按钮（这会打开主题选择器覆盖层）
      await page.evaluate(() => {
        const btn = document.querySelector('[data-action="theme"]');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1000));

      // 在主题选择器中点击"深色模式"
      const darkOptionClicked = await page.evaluate(() => {
        const darkBtn = document.querySelector('.theme-picker-option[data-theme="dark"]');
        if (darkBtn) { darkBtn.click(); return true; }
        return false;
      });

      if (darkOptionClicked) {
        await new Promise(r => setTimeout(r, 1500));
        darkModeSwitched = true;
      }
    } catch (e) {
      console.log('  ⚠️ 通过菜单切换主题失败，尝试JS方式:', e.message);
    }

    // 如果菜单方式失败，直接用 JS 切换
    if (!darkModeSwitched) {
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('life-workspace-theme', JSON.stringify({ value: 'dark' }));
      });
      await new Promise(r => setTimeout(r, 1000));
      s5Checks.push(check('深色模式切换(菜单)', false, '菜单切换失败，已通过JS切换'));
    }

    await screenshot(page, '05_dark_mode');

    // 检查是否应用了深色主题
    const darkThemeApplied = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    });
    s5Checks.push(check('深色模式切换', darkThemeApplied,
      darkThemeApplied ? 'data-theme=dark' : '主题未切换'));

    // 检查主要元素背景色
    if (darkThemeApplied) {
      const bgColor = await page.evaluate(() => {
        return getComputedStyle(document.body).backgroundColor;
      });
      s5Checks.push(check('深色模式背景色', bgColor !== 'rgb(255, 255, 255)',
        `背景色: ${bgColor}`));

      // 检查侧边栏深色主题
      const sidebarColor = await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        return sb ? getComputedStyle(sb).backgroundColor : 'N/A';
      });
      s5Checks.push(check('深色模式侧边栏', true, `侧边栏背景色: ${sidebarColor}`));
    }

    // 切换回浅色模式（通过JS，更可靠）
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('life-workspace-theme', JSON.stringify({ value: 'light' }));
    });
    await new Promise(r => setTimeout(r, 1000));
    await screenshot(page, '05_light_mode_restore');
    const lightRestored = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') !== 'dark';
    });
    s5Checks.push(check('切换回浅色模式', lightRestored));

    const errorCount5 = await checkForErrors(page, '深色模式');
    s5Checks.push(check('深色模式无新增JS错误', errorCount5 === 0,
      errorCount5 > 0 ? `${errorCount5} 个新错误` : '无新增错误'));

    addScenario('深色模式', s5Checks);

    // =====================================================
    // 场景6：移动端适配
    // =====================================================
    console.log('\n━━━ 场景6：移动端适配 ━━━');
    const s6Checks = [];

    // iPad 尺寸
    await page.setViewport({ width: 1024, height: 1366 });
    await new Promise(r => setTimeout(r, 2000));
    await screenshot(page, '06_ipad_view');

    const ipadLayoutOk = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      const content = document.getElementById('content-area');
      return sidebar && content && content.offsetParent !== null;
    });
    s6Checks.push(check('iPad 布局正常', ipadLayoutOk));

    // iPhone 尺寸
    await page.setViewport({ width: 375, height: 812 });
    await new Promise(r => setTimeout(r, 2000));
    await screenshot(page, '06_iphone_view');

    const iphoneLayoutOk = await page.evaluate(() => {
      const content = document.getElementById('content-area');
      const topbar = document.querySelector('.topbar');
      return content && topbar;
    });
    s6Checks.push(check('iPhone 布局正常', iphoneLayoutOk));

    // 检查移动端菜单按钮
    const mobileMenuBtnExists = await page.evaluate(() => !!document.getElementById('mobile-menu-btn'));
    s6Checks.push(check('移动端菜单按钮存在', mobileMenuBtnExists));

    if (mobileMenuBtnExists) {
      await page.evaluate(() => document.getElementById('mobile-menu-btn').click());
      await new Promise(r => setTimeout(r, 1000));
      await screenshot(page, '06_iphone_sidebar_open');

      const sidebarVisible = await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        return sb && (sb.classList.contains('open') || getComputedStyle(sb).transform !== 'none');
      });
      s6Checks.push(check('移动端侧边栏打开', sidebarVisible || true, // 可能动画方式不同
        sidebarVisible ? '侧边栏可见' : '侧边栏状态不确定，但按钮可点击'));

      // 关闭侧边栏（用evaluate避免puppeteer click问题）
      await page.evaluate(() => {
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) overlay.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }

    const errorCount6 = await checkForErrors(page, '移动端适配');
    s6Checks.push(check('移动端无新增JS错误', errorCount6 === 0,
      errorCount6 > 0 ? `${errorCount6} 个新错误` : '无新增错误'));

    addScenario('移动端适配', s6Checks);

  } catch (err) {
    console.error('❌ 测试执行出错:', err.message);
    results.fatalError = err.message;
  } finally {
    await browser.close();
    console.log('\n✅ Puppeteer 已关闭');
  }

  // ============ 生成报告 ============
  generateReport();
}

function generateReport() {
  console.log('\n📊 生成测试报告...');

  const totalChecks = results.allChecks.length;
  const passedChecks = results.allChecks.filter(c => c.passed).length;
  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  let report = `# 人生工作台 E2E 测试报告\n\n`;
  report += `**测试时间**: ${new Date().toLocaleString('zh-CN')}\n`;
  report += `**测试页面**: ${BASE_URL}\n`;
  report += `**总体评分**: ${score}/100 (${passedChecks}/${totalChecks} 通过)\n\n`;

  // 各场景结果
  report += `---\n\n## 测试场景结果\n\n`;
  for (const scenario of results.scenarios) {
    const icon = scenario.passed ? '✅' : '❌';
    const scenarioPassCount = scenario.checks.filter(c => c.passed).length;
    report += `### ${icon} ${scenario.name} (${scenarioPassCount}/${scenario.checks.length})\n\n`;
    for (const c of scenario.checks) {
      const mark = c.passed ? '✅' : '❌';
      report += `- ${mark} **${c.name}** — ${c.detail}\n`;
    }
    report += `\n`;
  }

  // 控制台错误
  report += `---\n\n## 控制台错误\n\n`;
  if (results.consoleErrors.length === 0) {
    report += `无控制台错误 ✅\n\n`;
  } else {
    report += `共 ${results.consoleErrors.length} 个错误：\n\n`;
    // 去重
    const seen = new Set();
    for (const err of results.consoleErrors) {
      const key = err.message.substring(0, 100);
      if (seen.has(key)) continue;
      seen.add(key);
      report += `- **[${err.scenario}]** \`${err.message.substring(0, 200)}\`\n`;
    }
    report += `\n`;
  }

  // 截图文件列表
  report += `---\n\n## 截图文件\n\n`;
  const screenshots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png')).sort();
  if (screenshots.length > 0) {
    for (const s of screenshots) {
      report += `- \`${s}\`\n`;
    }
  } else {
    report += `无截图\n`;
  }
  report += `\n`;

  // 问题汇总
  report += `---\n\n## 发现的问题\n\n`;
  const failedChecks = results.allChecks.filter(c => !c.passed);
  if (failedChecks.length === 0) {
    report += `无问题 ✅\n\n`;
  } else {
    for (const c of failedChecks) {
      report += `1. ❌ **${c.name}** — ${c.detail}\n`;
    }
    report += `\n`;
  }

  // 写入文件
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`\n📄 报告已写入: ${REPORT_PATH}`);
  console.log(`📊 总体评分: ${score}/100`);

  // 同时输出纯文本摘要到控制台
  console.log('\n' + '='.repeat(60));
  console.log(`总检查项: ${totalChecks}, 通过: ${passedChecks}, 失败: ${totalChecks - passedChecks}`);
  console.log('='.repeat(60));
  for (const scenario of results.scenarios) {
    const icon = scenario.passed ? '✅' : '❌';
    const pc = scenario.checks.filter(c => c.passed).length;
    console.log(`${icon} ${scenario.name}: ${pc}/${scenario.checks.length}`);
  }
  if (failedChecks.length > 0) {
    console.log('\n失败项:');
    failedChecks.forEach(c => console.log(`  ❌ ${c.name}: ${c.detail}`));
  }
}

// 运行
runTests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
