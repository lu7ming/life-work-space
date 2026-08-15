/**
 * health.js - 健康与身体模块逻辑（三Tab升级版）
 * 人生工作台 · 日常记录 + 中医养生 + 症状自查
 */
import { AppUtils } from '../../core/utils.js';
import { Storage } from '../../core/storage.js';
import { EventBus } from '../../core/event-bus.js';
import { ModuleLifecycle } from '../../core/module-lifecycle.js';

export const HealthModule = (() => {
  const { escapeHtml, formatDate } = AppUtils;

  // ===== 状态 =====
  let currentDate = new Date();
  let healthData = null;
  let selectedMood = null;
  let _eventListeners = [];
  let _intervals = [];
  let _timeouts = [];
  let _shichenTimer = null;
  let _breathingState = { running: false, cycle: 0, step: 0 };
  let _timerState = { running: false, remaining: 0, total: 0, intervalId: null };

  // ===== 中医知识数据 =====

  // 体质辨识问卷（16题）
  const QUIZ_QUESTIONS = [
    { text: '您是否容易感到疲乏无力？', type: 'qi' },
    { text: '说话时是否容易气短、声音低弱？', type: 'qi' },
    { text: '是否容易出汗，尤其是稍微活动就出汗？', type: 'qi' },
    { text: '是否容易怕冷，手脚发凉？', type: 'yang' },
    { text: '是否喜欢吃热食热饮，吃凉的会不舒服？', type: 'yang' },
    { text: '是否面色偏白，容易感冒？', type: 'yang' },
    { text: '是否容易口干咽燥，总想喝水？', type: 'yin' },
    { text: '是否容易手足心热，或者有烘热感？', type: 'yin' },
    { text: '是否皮肤偏干，或者容易便秘？', type: 'yin' },
    { text: '是否体型偏胖，腹部松软？', type: 'phlegm' },
    { text: '是否容易出油，面部油脂较多？', type: 'dampheat' },
    { text: '是否口中黏腻，或者舌苔厚腻？', type: 'phlegm' },
    { text: '皮肤是否容易出现紫斑，或者面色偏暗？', type: 'blood' },
    { text: '是否容易健忘，或者嘴唇颜色偏暗？', type: 'blood' },
    { text: '是否容易情绪低落或者闷闷不乐？', type: 'qi_stagnation' },
    { text: '是否容易过敏（花粉、食物、药物等）？', type: 'special' }
  ];

  // 9种体质
  const CONSTITUTION_TYPES = {
    pinghe: {
      name: '平和质', desc: '体态适中，面色润泽，精力充沛',
      advice: '保持现有生活方式，饮食有节，起居有常，适量运动即可。',
      scores: { qi: 1, yang: 1, yin: 1, phlegm: 1, blood: 1, damp: 1 }
    },
    qixu: {
      name: '气虚质', desc: '元气不足，易疲乏无力',
      advice: '宜补气健脾。多食山药、黄芪、大枣、鸡肉；避免过度劳累；练习腹式呼吸、八段锦。',
      scores: { qi: 3, yang: 1, yin: 1, phlegm: 1, blood: 1, damp: 1 }
    },
    yangxu: {
      name: '阳虚质', desc: '阳气不足，畏寒怕冷',
      advice: '宜温阳散寒。多食羊肉、生姜、桂圆、韭菜；避免生冷食物；艾灸足三里、关元穴。',
      scores: { qi: 2, yang: 3, yin: 0, phlegm: 1, blood: 1, damp: 1 }
    },
    yinxu: {
      name: '阴虚质', desc: '阴液亏少，口干咽燥',
      advice: '宜滋阴润燥。多食银耳、百合、梨、枸杞；避免辛辣燥热；早睡早起，避免熬夜。',
      scores: { qi: 1, yang: 0, yin: 3, phlegm: 0, blood: 1, damp: 0 }
    },
    tanshi: {
      name: '痰湿质', desc: '痰湿凝聚，体型偏胖',
      advice: '宜化痰祛湿。多食薏米、冬瓜、陈皮、萝卜；少吃甜腻；坚持有氧运动。',
      scores: { qi: 2, yang: 1, yin: 0, phlegm: 3, blood: 1, damp: 2 }
    },
    shire: {
      name: '湿热质', desc: '湿热内蕴，面油口苦',
      advice: '宜清热利湿。多食绿豆、苦瓜、薏米、冬瓜；忌酒及辛辣；保持居住环境干燥通风。',
      scores: { qi: 1, yang: 0, yin: 1, phlegm: 1, blood: 0, damp: 3 }
    },
    xueyu: {
      name: '血瘀质', desc: '血行不畅，肤色偏暗',
      advice: '宜活血化瘀。多食山楂、玫瑰花、黑豆、醋；适当运动促进气血运行；保持心情舒畅。',
      scores: { qi: 1, yang: 1, yin: 0, phlegm: 0, blood: 3, damp: 0 }
    },
    qiyu: {
      name: '气郁质', desc: '气机郁滞，情绪低落',
      advice: '宜疏肝理气。多食柑橘、玫瑰花、佛手、萝卜；多户外活动，保持心情开朗；可练习六字诀中的"嘘"字。',
      scores: { qi: 2, yang: 0, yin: 1, phlegm: 0, blood: 1, damp: 0 }
    },
    tebing: {
      name: '特禀质', desc: '先天禀赋异常，易过敏',
      advice: '宜益气固表。避免接触过敏原；多食黄芪、防风、白术（玉屏风散）；注意季节变化时的防护。',
      scores: { qi: 2, yang: 1, yin: 1, phlegm: 0, blood: 0, damp: 0 }
    }
  };

  // 问卷选项到体质分数映射
  const QUIZ_TYPE_MAP = {
    qi: 'qixu', yang: 'yangxu', yin: 'yinxu',
    phlegm: 'tanshi', dampheat: 'shire', blood: 'xueyu',
    qi_stagnation: 'qiyu', special: 'tebing'
  };

  // 子午流注12时辰
  const SHICHEN_DATA = [
    { name: '子', organ: '胆经', time: '23-1', tip: '子时宜安眠，胆经当令，熟睡利胆养阳。此时入睡有助于胆汁新陈代谢。' },
    { name: '丑', organ: '肝经', time: '1-3', tip: '丑时宜深睡，肝经当令，养血排毒佳时。此时是肝脏修复和藏血的重要时段。' },
    { name: '寅', organ: '肺经', time: '3-5', tip: '寅时宜熟睡，肺经当令，气血由静转动。此时深睡有助于肺气肃降。' },
    { name: '卯', organ: '大肠经', time: '5-7', tip: '卯时宜起床排便，大肠经当令，排毒素正当时。建议起床后喝杯温水。' },
    { name: '辰', organ: '胃经', time: '7-9', tip: '辰时宜吃早餐，胃经当令，消化吸收最佳。此时吃早餐营养最易吸收。' },
    { name: '巳', organ: '脾经', time: '9-11', tip: '巳时宜工作学习，脾经当令，精力充沛效率高。此时是大脑最活跃的时段。' },
    { name: '午', organ: '心经', time: '11-13', tip: '午时宜小憩，心经当令，午睡养心安神。建议午休15-30分钟。' },
    { name: '未', organ: '小肠经', time: '13-15', tip: '未时宜消化，小肠经当令，分清别浊。此时不宜剧烈运动。' },
    { name: '申', organ: '膀胱经', time: '15-17', tip: '申时宜运动多喝水，膀胱经当令，排毒利水好时机。适合运动和饮水。' },
    { name: '酉', organ: '肾经', time: '17-19', tip: '酉时宜养肾，肾经当令，藏精纳气正当时。适合放松休息，按摩腰部。' },
    { name: '戌', organ: '心包经', time: '19-21', tip: '戌时宜放松，心包经当令，散步听音乐养心。保持心情愉悦。' },
    { name: '亥', organ: '三焦经', time: '21-23', tip: '亥时宜安眠，三焦经当令，百脉通修养身。建议放下手机准备入睡。' }
  ];


  // 四季养生数据
  const SEASON_DATA = {
    spring: {
      name: '春', icon: '🌸',
      focus: '养肝护肝，疏肝理气，防风御寒',
      diet: { good: '韭菜、香椿、豆芽、菠菜、荠菜、春笋、大枣、枸杞', bad: '酸味过多收敛肝气、油炸辛辣、羊肉等大热之物' },
      living: '夜卧早起，广步于庭。春捂秋冻，不宜过早减衣。保持居室通风，多晒太阳。',
      exercise: '宜舒展筋骨，如散步、慢跑、太极、八段锦"两手托天理三焦"。避免大汗淋漓。',
      emotion: '保持心情舒畅开朗，切忌暴怒伤肝。多踏青赏花，疏肝解郁。'
    },
    summer: {
      name: '夏', icon: '☀️',
      focus: '养心安神，清热消暑，防暑降温',
      diet: { good: '西瓜、苦瓜、绿豆、黄瓜、番茄、莲子、百合、荷叶', bad: '过度贪凉饮冷、肥甘厚腻、辛辣燥热' },
      living: '夜卧早起，无厌于日。午时小憩养心，避免空调直吹。注意防暑降温。',
      exercise: '宜清晨或傍晚运动，如游泳、瑜伽、散步。避免烈日下剧烈运动，防止大汗伤津。',
      emotion: '保持心平气和，避免烦躁易怒。静心宁神，可听轻音乐、冥想。'
    },
    longsummer: {
      name: '长夏', icon: '🌿',
      focus: '健脾祛湿，化湿和中，调理脾胃',
      diet: { good: '薏米、山药、扁豆、冬瓜、陈皮、赤小豆、茯苓、莲子', bad: '生冷瓜果、甜腻糕点、肥肉等碍脾生湿之物' },
      living: '起居有常，避免潮湿环境。雨后及时更衣，不坐湿地。饮食宜清淡易消化。',
      exercise: '宜柔和运动，如散步、太极、八段锦"调理脾胃须单举"。微微出汗即可，忌大汗伤气。',
      emotion: '避免过度思虑，思则气结伤脾。保持心情轻松，适当午休。'
    },
    autumn: {
      name: '秋', icon: '🍁',
      focus: '养肺润燥，滋阴润肺，防燥护阴',
      diet: { good: '梨、银耳、百合、莲藕、蜂蜜、芝麻、杏仁、白萝卜', bad: '辛辣刺激、葱姜蒜过多、炒货油炸伤阴之物' },
      living: '早卧早起，与鸡俱兴。秋冻适度，注意背部保暖。保持室内湿度，防秋燥。',
      exercise: '宜登高望远、慢跑、呼吸操。练习腹式呼吸，增强肺功能。避免晨起雾中运动。',
      emotion: '收敛神气，避免悲忧伤肺。保持乐观豁达，赏秋景以怡情。'
    },
    winter: {
      name: '冬', icon: '❄️',
      focus: '养肾防寒，温补肾阳，敛阴护阳',
      diet: { good: '羊肉、牛肉、桂圆、核桃、黑芝麻、黑豆、栗子、韭菜', bad: '生冷寒凉、绿豆、苦瓜等寒性食物' },
      living: '早卧晚起，必待日光。注意保暖，尤其是腰腹和足部。睡前泡脚，温阳助眠。',
      exercise: '宜室内运动，如太极、八段锦、力量训练。避免大汗，冬不欲极温。坚持叩齿吞津。',
      emotion: '使志若伏若匿，保持安静平和。避免恐惧惊吓，恐则气下伤肾。'
    }
  };

  function getCurrentSeason() {
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m === 6 || m === 7) return 'summer';
    if (m === 8) return 'longsummer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }
  let _currentSeasonTab = null;
  function initSeasons() {
    const container = document.getElementById('healthSeasonTabs');
    if (!container) return;
    const currentSeason = getCurrentSeason();
    _currentSeasonTab = currentSeason;
    container.querySelectorAll('.health-season-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.season === currentSeason);
      _bindEvent(btn, 'click', () => {
        container.querySelectorAll('.health-season-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _currentSeasonTab = btn.dataset.season;
        renderSeasonContent();
      });
    });
    renderSeasonContent();
  }
  function renderSeasonContent() {
    const container = document.getElementById('healthSeasonContent');
    if (!container || !_currentSeasonTab) return;
    const s = SEASON_DATA[_currentSeasonTab];
    if (!s) return;
    container.innerHTML = `
      <div class="health-season-focus">${s.icon} <strong>养生重点：</strong>${escapeHtml(s.focus)}</div>
      <div class="health-season-section">
        <div class="health-season-section-title">🥗 饮食建议</div>
        <div class="health-season-diet">
          <div class="health-season-diet-good"><span class="health-diet-icon">✅ 宜</span> ${escapeHtml(s.diet.good)}</div>
          <div class="health-season-diet-bad"><span class="health-diet-icon">❌ 忌</span> ${escapeHtml(s.diet.bad)}</div>
        </div>
      </div>
      <div class="health-season-section">
        <div class="health-season-section-title">🛏️ 起居建议</div>
        <div class="health-season-text">${escapeHtml(s.living)}</div>
      </div>
      <div class="health-season-section">
        <div class="health-season-section-title">🏃 运动建议</div>
        <div class="health-season-text">${escapeHtml(s.exercise)}</div>
      </div>
      <div class="health-season-section">
        <div class="health-season-section-title">🎭 情志建议</div>
        <div class="health-season-text">${escapeHtml(s.emotion)}</div>
      </div>
    `;
  }

  // 食疗方（茶饮+粥品+汤品）
  const TEA_RECIPES = [
    { name: '黄芪红枣茶', recipe: '黄芪10g · 红枣3枚 · 枸杞5g', effect: '补气健脾，提升元气', brew: '沸水冲泡，加盖焖10分钟，可反复冲泡2-3次', constitutions: ['qixu', 'yangxu'], seasons: ['spring', 'winter'], category: 'tea' },
    { name: '陈皮生姜茶', recipe: '陈皮6g · 生姜3片 · 红糖适量', effect: '理气健脾，温中散寒', brew: '生姜切片与陈皮同煮5分钟，加红糖调味，趁热饮用', constitutions: ['yangxu', 'tanshi'], seasons: ['winter', 'autumn'], category: 'tea' },
    { name: '银耳百合茶', recipe: '银耳5g · 百合10g · 冰糖少许', effect: '滋阴润肺，生津止渴', brew: '银耳泡发后与百合小火慢炖30分钟，加冰糖调味', constitutions: ['yinxu'], seasons: ['autumn'], category: 'tea' },
    { name: '菊花枸杞茶', recipe: '菊花5g · 枸杞10g', effect: '清肝明目，滋阴降火', brew: '沸水冲泡，焖5分钟即可饮用', constitutions: ['yinxu', 'shire'], seasons: ['summer'], category: 'tea' },
    { name: '玫瑰花茶', recipe: '干玫瑰花6-8朵', effect: '疏肝理气，活血化瘀', brew: '80°C温水冲泡，焖3分钟，可加蜂蜜调味', constitutions: ['qiyu', 'xueyu'], seasons: ['spring'], category: 'tea' },
    { name: '薏米赤小豆茶', recipe: '薏米15g · 赤小豆15g', effect: '健脾祛湿，利水消肿', brew: '薏米炒后与赤小豆同煮20分钟，取汤代茶饮', constitutions: ['tanshi', 'shire'], seasons: ['summer'], category: 'tea' },
    { name: '桂圆红枣茶', recipe: '桂圆肉10g · 红枣5枚 · 生姜2片', effect: '温阳补血，安神助眠', brew: '所有材料加水煮15分钟，趁热饮用', constitutions: ['yangxu', 'qixu'], seasons: ['winter'], category: 'tea' },
    { name: '山楂决明茶', recipe: '山楂10g · 决明子10g', effect: '消食化滞，清肝明目', brew: '沸水冲泡，焖10分钟，饭后饮用', constitutions: ['tanshi', 'shire'], seasons: ['autumn'], category: 'tea' },
    { name: '胖大海甘草茶', recipe: '胖大海2枚 · 甘草3g · 桔梗5g', effect: '清热润肺，利咽开音', brew: '沸水冲泡，焖10分钟，温服，适合用嗓后饮用', constitutions: ['yinxu', 'shire'], seasons: ['autumn', 'spring'], category: 'tea' },
    { name: '防风白术茶', recipe: '防风6g · 白术10g · 黄芪10g', effect: '益气固表，预防感冒', brew: '三味加水煎煮15分钟，取汁代茶饮', constitutions: ['tebing', 'qixu'], seasons: ['spring', 'autumn'], category: 'tea' },
    // 粥品 4款
    { name: '山药薏米粥', recipe: '山药30g · 薏米30g · 大米50g', effect: '健脾祛湿，益气养胃', brew: '薏米提前浸泡2小时，山药切块，与大米同煮成粥，小火慢熬30分钟', constitutions: ['qixu', 'tanshi'], seasons: ['longsummer', 'autumn'], category: 'porridge' },
    { name: '红枣桂圆粥', recipe: '红枣10枚 · 桂圆肉15g · 糯米50g', effect: '补血养心，安神助眠', brew: '红枣去核，与桂圆、糯米同煮，大火煮沸后小火熬40分钟', constitutions: ['qixu', 'yangxu'], seasons: ['winter'], category: 'porridge' },
    { name: '百合莲子粥', recipe: '百合20g · 莲子30g · 大米50g', effect: '滋阴润肺，养心安神', brew: '莲子去心泡发，与百合、大米同煮成粥，小火慢熬30分钟', constitutions: ['yinxu'], seasons: ['autumn'], category: 'porridge' },
    { name: '小米南瓜粥', recipe: '小米50g · 南瓜100g', effect: '健脾和胃，补中益气', brew: '南瓜切小块，与小米同煮，大火煮沸后小火熬25分钟', constitutions: ['qixu', 'pinghe'], seasons: ['autumn', 'winter'], category: 'porridge' },
    // 汤品 4款
    { name: '当归生姜羊肉汤', recipe: '当归10g · 生姜30g · 羊肉250g', effect: '温阳散寒，补血活血', brew: '羊肉焯水去血沫，与当归、生姜同炖2小时，加盐调味', constitutions: ['yangxu', 'xueyu'], seasons: ['winter'], category: 'soup' },
    { name: '黄芪乌鸡汤', recipe: '黄芪30g · 乌鸡半只 · 红枣6枚', effect: '补气养血，健脾益肺', brew: '乌鸡焯水，与黄芪、红枣同炖1.5小时，加盐调味', constitutions: ['qixu'], seasons: ['spring', 'winter'], category: 'soup' },
    { name: '银耳百合瘦肉汤', recipe: '银耳15g · 百合20g · 瘦肉150g', effect: '滋阴润燥，清热生津', brew: '银耳泡发撕碎，与百合、瘦肉同煮1小时，加冰糖调味', constitutions: ['yinxu'], seasons: ['autumn'], category: 'soup' },
    { name: '冬瓜薏米排骨汤', recipe: '冬瓜200g · 薏米30g · 排骨200g', effect: '清热祛湿，健脾利水', brew: '排骨焯水，与薏米同炖40分钟，加冬瓜再煮20分钟，加盐调味', constitutions: ['shire', 'tanshi'], seasons: ['summer', 'longsummer'], category: 'soup' }
  ];

  // 经络穴位（全身常用穴位，按部位分组）
  const ACUPOINTS = [
    // 头颈部
    { id: 'fengchi', name: '风池穴', loc: '后颈部，枕骨下，胸锁乳突肌与斜方肌之间凹陷处', fn: '疏风散寒，清头明目', detail: '用拇指和食指相对按揉，力度适中，适合头痛、感冒、颈项强痛。', bodyPart: '头颈部' },
    { id: 'baihui', name: '百会穴', loc: '头顶正中，两耳尖连线中点', fn: '升阳举陷，醒脑开窍', detail: '用中指或掌心按揉，适合头痛、眩晕、失眠、脱肛。', bodyPart: '头颈部' },
    // 上肢
    { id: 'hegu', name: '合谷穴', loc: '手背第1、2掌骨间，第2掌骨桡侧中点', fn: '疏风解表，镇痛通络', detail: '"面口合谷收"，拇指按压，力度由轻渐重，适合牙痛、咽痛、头痛。', bodyPart: '上肢' },
    { id: 'quchi', name: '曲池穴', loc: '肘横纹外侧端，屈肘时尺泽与肱骨外上髁连线中点', fn: '清热解表，疏经活络', detail: '屈肘取穴，拇指按揉，适合发热、咽喉肿痛、高血压、皮肤病。', bodyPart: '上肢' },
    { id: 'lieque', name: '列缺穴', loc: '桡骨茎突上方，腕横纹上1.5寸', fn: '宣肺利咽，通经活络', detail: '两手虎口交叉，食指尖到达处。按揉可缓解咽喉肿痛、头痛。', bodyPart: '上肢' },
    { id: 'taiyuan', name: '太渊穴', loc: '腕掌侧横纹桡侧，桡动脉搏动处', fn: '补肺益气，止咳平喘', detail: '腕横纹桡动脉搏动处。按揉可增强肺功能，改善气短。', bodyPart: '上肢' },
    // 下肢
    { id: 'zusanli', name: '足三里', loc: '外膝眼下3寸，胫骨前嵴外开一横指', fn: '健脾和胃，扶正培元', detail: '强壮保健要穴。常按可增强免疫力，改善消化功能，延缓衰老。', bodyPart: '下肢' },
    { id: 'sanyinjiao', name: '三阴交', loc: '内踝尖上3寸，胫骨内侧缘后际', fn: '健脾益血，调肝补肾', detail: '脾肝肾三经交会穴。按揉可调理月经、改善失眠、健脾利湿。', bodyPart: '下肢' },
    { id: 'yongquan', name: '涌泉穴', loc: '足底前1/3与后2/3交界处，蜷足时凹陷处', fn: '滋阴降火，醒脑开窍', detail: '肾经井穴。每晚搓涌泉100次，可引火归元，改善失眠、高血压。', bodyPart: '下肢' },
    { id: 'taichong', name: '太冲穴', loc: '足背第1、2跖骨结合部前凹陷处', fn: '平肝泻火，疏肝理气', detail: '肝经原穴。按揉可缓解头痛、眩晕、易怒、痛经。', bodyPart: '下肢' },
    { id: 'xuehai', name: '血海穴', loc: '髌骨内上缘上2寸，股内侧肌内侧缘', fn: '活血化瘀，补血养血', detail: '脾经穴位。按揉可改善月经不调、皮肤瘙痒、血虚诸症。', bodyPart: '下肢' },
    { id: 'zhaohai', name: '照海穴', loc: '内踝尖直下凹陷处', fn: '滋阴清热，利咽安神', detail: '八脉交会穴之一，通阴跷脉。按揉可缓解咽干咽痛、失眠。', bodyPart: '下肢' },
    // 躯干
    { id: 'guanyuan', name: '关元穴', loc: '前正中线上，脐下3寸', fn: '培补元气，温肾固精', detail: '任脉要穴，培元固本。艾灸或按揉可改善阳虚、宫寒、尿频。', bodyPart: '躯干' },
    { id: 'qihai', name: '气海穴', loc: '前正中线上，脐下1.5寸', fn: '益气助阳，调经固经', detail: '"气海一穴暖全身"，按揉或艾灸可补益元气，改善气虚乏力。', bodyPart: '躯干' },
    { id: 'mingmen', name: '命门穴', loc: '后正中线上，第2腰椎棘突下凹陷处', fn: '温肾壮阳，固精止带', detail: '肾阳之根本。艾灸或搓热命门可温补肾阳，改善腰冷、阳痿。', bodyPart: '躯干' },
    { id: 'tiantu', name: '天突穴', loc: '胸骨上窝正中凹陷处', fn: '止咳化痰，利咽开音', detail: '用食指或中指轻轻按揉，力度适中，适合咳嗽、咽痒、声音嘶哑。', bodyPart: '躯干' }
  ];

  // ===== 望诊完整数据结构（v115 升级：望神、望色、望形、望态、望局部、望舌）=====
  const TONGUE_DIAGNOSIS_DATA = {
    // 一、望神
    spirit: {
      eyeSpirit: [
        { val: 'bright', label: '有神', interpret: '目光明亮灵活，精彩内含，神气充沛。为健康或病情较轻的表现，脏腑精气充足。' },
        { val: 'dim', label: '少神', interpret: '目光呆滞，精神不振。多为气虚或轻度脏腑功能减退，建议补气养神。' },
        { val: 'lifeless', label: '无神', interpret: '目光晦暗，瞳仁呆滞，精神萎靡。多为精气大伤，脏腑功能衰败，需及时就医。' }
      ],
      expression: [
        { val: 'natural', label: '自然', interpret: '表情自然，情绪平和，为神气充足的表现。' },
        { val: 'indifferent', label: '淡漠', interpret: '表情淡漠，反应迟钝。多为心气不足或痰迷心窍，建议养心安神。' },
        { val: 'restless', label: '烦躁', interpret: '烦躁不安，坐卧不宁。多为热扰心神或阴虚火旺，建议清心降火。' },
        { val: 'painful', label: '痛苦', interpret: '表情痛苦，多为疼痛或不适，需结合其他症状判断病因。' }
      ],
      energy: [
        { val: 'abundant', label: '充沛', interpret: '精力旺盛，声音洪亮，为精气充足、身体健康的表现。' },
        { val: 'normal', label: '一般', interpret: '精力尚可，日常活动无明显不适。' },
        { val: 'tired', label: '易疲劳', interpret: '稍动即累，气短懒言。多为气虚或脾虚，建议补气健脾。' },
        { val: 'exhausted', label: '极度倦怠', interpret: '极度疲乏，不愿活动。多为气血大虚或脏腑功能严重减退，需就医检查。' }
      ],
      reaction: [
        { val: 'quick', label: '灵敏', interpret: '反应灵敏，思维清晰，为心神充足的表现。' },
        { val: 'slow', label: '迟钝', interpret: '反应迟钝，思维缓慢。多为痰湿蒙蔽清窍或气血不足，建议化痰开窍或补气养血。' }
      ]
    },
    // 二、望色
    complexion: {
      faceColor: [
        { val: 'ruddy', label: '红润', interpret: '气血充盈，为健康面色。红黄隐隐，明润含蓄，是精气充沛的表现。' },
        { val: 'pale', label: '苍白', interpret: '气血不足或阳虚寒证。多见于贫血、气虚、阳虚体质。建议：补气养血温阳，多食红枣、桂圆、黄芪、羊肉。' },
        { val: 'sallow', label: '萎黄', interpret: '脾胃虚弱，气血不足。面色枯黄暗淡，多见于脾虚、营养不良。建议：健脾益气，多食山药、小米、大枣。' },
        { val: 'flushed', label: '潮红', interpret: '阴虚内热或实热证。午后颧红多为阴虚火旺，满面通红多为实热。建议：滋阴降火或清热泻火。' },
        { val: 'dull', label: '晦暗', interpret: '肾虚或血瘀。面色暗滞无光泽，多见于肾虚、慢性肝病或血瘀体质。建议：补肾活血，多食黑芝麻、核桃、山楂。' },
        { val: 'dark_black', label: '黧黑', interpret: '肾阳虚衰或肾精亏耗。面色黑而暗淡，多见于慢性肾病、肾上腺疾病。建议：温补肾阳，及时就医检查。' }
      ],
      luster: [
        { val: 'moist', label: '润泽', interpret: '面部有光泽，皮肤润泽。为精气未衰，脏腑功能尚可，预后良好。' },
        { val: 'dry', label: '枯槁', interpret: '面部暗淡无华，皮肤干枯。为精气已衰，脏腑功能减退，预后较差，需调养。' }
      ],
      acneLocation: [
        { val: 'none', label: '无', interpret: '面部无痘痘或斑点，皮肤状况良好。' },
        { val: 'forehead', label: '额头', interpret: '额头长痘多因心火旺盛、精神压力大、熬夜过多。建议：降心火，可用莲子心泡茶，保证睡眠。' },
        { val: 'glabella', label: '眉心', interpret: '眉心（印堂）长痘多因肺热、胸闷心悸。建议：清肺热，可用百合、银耳润肺。' },
        { val: 'nose_bridge', label: '鼻梁', interpret: '鼻梁长痘多因肝气郁结、情绪不畅。建议：疏肝理气，保持心情舒畅，可用玫瑰花茶。' },
        { val: 'nose_wing', label: '鼻翼', interpret: '鼻翼长痘多因胆热、消化不良。建议：清胆热，饮食清淡，少吃油腻。' },
        { val: 'nose_tip', label: '鼻头', interpret: '鼻头长痘多因脾胃湿热、胃火过盛。建议：清脾胃湿热，忌辛辣油腻，多食薏米、冬瓜。' },
        { val: 'left_cheek', label: '左颊', interpret: '左颊长痘多因肝火旺盛、情绪波动。建议：疏肝清火，可用菊花、决明子泡茶。' },
        { val: 'right_cheek', label: '右颊', interpret: '右颊长痘多因肺热、过敏体质。建议：清肺热，避免过敏原，可用枇杷、梨润肺。' },
        { val: 'chin', label: '下巴', interpret: '下巴长痘多因肾虚、宫寒（女）、内分泌失调。建议：温补肾阳，女性能量不足者需暖宫。' },
        { val: 'around_mouth', label: '唇周', interpret: '唇周长痘多因胃肠积热、便秘、饮食不节。建议：清胃肠热，多吃蔬果，保持通便。' }
      ]
    },
    // 三、望形
    bodyShape: {
      bodyType: [
        { val: 'overweight', label: '偏胖', interpret: '形体肥胖，多为痰湿体质，脾虚运化失常。易患代谢性疾病。建议：健脾祛湿，控制饮食，多运动。' },
        { val: 'normal', label: '适中', interpret: '体型适中，胖瘦均匀，为健康体态。继续保持良好生活习惯。' },
        { val: 'thin', label: '偏瘦', interpret: '形体消瘦，多为阴虚体质或脾胃虚弱。建议：滋阴润燥或健脾益气，增加营养。' }
      ],
      muscle: [
        { val: 'firm', label: '结实', interpret: '肌肉结实有力，为气血充足、脾气健旺的表现。' },
        { val: 'flabby', label: '松弛', interpret: '肌肉松软无力，多为脾气虚弱、气血不足。建议：健脾益气，适当锻炼。' }
      ],
      special: [
        { val: 'normal', label: '正常', interpret: '体型正常，无浮肿或异常消瘦。' },
        { val: 'edema', label: '浮肿', interpret: '身体浮肿，按之凹陷。多为脾肾阳虚、水湿内停。建议：温阳利水，忌生冷。' },
        { val: 'emaciated', label: '消瘦明显', interpret: '形体极度消瘦，多为气血大虚或阴虚火旺、消耗性疾病。建议：及时就医，大补气血或滋阴。' }
      ]
    },
    // 四、望态
    posture: {
      movement: [
        { val: 'agile', label: '灵活', interpret: '动作灵活，协调自如，为精气充足、筋骨强健。' },
        { val: 'slow', label: '迟缓', interpret: '动作迟缓，不够灵活。多为气血不足或寒湿阻滞经络。建议：补气养血或温经散寒。' }
      ],
      sitting: [
        { val: 'upright', label: '端正', interpret: '坐姿端正，精神饱满。为精气充足、心肺功能良好。' },
        { val: 'slouched', label: '弯腰驼背', interpret: '坐姿不正，喜弯腰驼背。多为气虚或肾虚，腰膝无力。建议：补气益肾，加强背部锻炼。' }
      ],
      gait: [
        { val: 'steady', label: '稳健', interpret: '步态稳健，行走有力。为肝肾充足、筋骨强健。' },
        { val: 'unsteady', label: '蹒跚', interpret: '步态不稳，行走摇晃。多为肝肾不足、气血亏虚，或风痰阻络。建议：补益肝肾，养血通络。' }
      ],
      specialPosture: [
        { val: 'natural', label: '自然', interpret: '姿态自然，无特殊异常。' },
        { val: 'curled_warm', label: '蜷卧喜暖', interpret: '喜蜷卧、喜暖，多为阳虚寒盛。建议：温阳散寒，可用生姜、肉桂、艾灸。' },
        { val: 'restless_unquiet', label: '烦躁不宁', interpret: '坐卧不宁，辗转反侧。多为热扰心神或阴虚火旺。建议：清心安神或滋阴降火。' }
      ]
    },
    // 五、望局部
    local: {
      hair: [
        { val: 'thick_black', label: '浓密黑亮', interpret: '头发浓密黑亮有光泽。为肾精充足、血气旺盛的表现。' },
        { val: 'sparse', label: '稀疏', interpret: '头发稀疏易脱。多为肾精不足或血虚不荣。建议：补肾养血。' },
        { val: 'yellow', label: '发黄', interpret: '头发枯黄无泽。多为气血不足或营养不良。建议：补气养血，增加蛋白质摄入。' },
        { val: 'gray_early', label: '早白', interpret: '少年白发。多为肾精不足或血热偏盛。建议：补肾填精，可用黑芝麻、何首乌。' }
      ],
      eyes: [
        { val: 'normal', label: '正常', interpret: '眼睛明亮有神，巩膜洁白。为肝肾充足、气血旺盛。' },
        { val: 'bloodshot', label: '红血丝', interpret: '眼睛红血丝多。多为肝火上炎或熬夜伤肝。建议：清肝明目，保证睡眠。' },
        { val: 'dry', label: '干涩', interpret: '眼睛干涩。多为肝血不足或阴虚。建议：养肝血、滋肝阴，可用枸杞、菊花泡茶。' },
        { val: 'bags', label: '眼袋重', interpret: '眼袋明显。多为脾虚湿盛或肾虚。建议：健脾利湿或补肾，减少睡前饮水。' },
        { val: 'pale_lid', label: '眼睑淡白', interpret: '眼睑颜色淡白。多为气血不足、贫血。建议：补气养血，多食红枣、桂圆、动物肝脏。' }
      ],
      nose: [
        { val: 'normal_nose', label: '正常', interpret: '鼻子色泽润泽，无异常分泌物。为肺气充足。' },
        { val: 'dry_nostril', label: '鼻孔干燥', interpret: '鼻孔干燥。多为肺燥或阴虚。建议：滋阴润肺，可用银耳、百合、梨。' },
        { val: 'clear_discharge', label: '流清涕', interpret: '流清鼻涕。多为风寒犯肺或肺气虚。建议：疏风散寒或补肺气。' },
        { val: 'yellow_discharge', label: '流黄涕', interpret: '流黄浊鼻涕。多为风热犯肺或肺热。建议：疏风清热，可用金银花、连翘。' }
      ],
      ears: [
        { val: 'moist_red', label: '红润', interpret: '耳朵红润有光泽。为肾气充足的表现。' },
        { val: 'pale_ear', label: '淡白', interpret: '耳朵颜色淡白。多为气血不足或肾阳虚。建议：补气养血或温补肾阳。' },
        { val: 'dark_ear', label: '暗黑', interpret: '耳朵颜色暗黑。多为肾阳虚衰或血瘀。建议：温补肾阳，活血化瘀。' }
      ],
      lips: [
        { val: 'ruddy_lips', label: '红润', interpret: '唇色红润。为气血充足、脾胃健运。' },
        { val: 'pale_lips', label: '淡白', interpret: '唇色淡白。多为气血不足或脾虚。建议：补气养血健脾。' },
        { val: 'purple_lips', label: '紫暗', interpret: '唇色紫暗。多为血瘀或寒凝。建议：活血化瘀或温经散寒。' },
        { val: 'deep_red_lips', label: '深红', interpret: '唇色深红。多为热证，实热或阴虚火旺。建议：清热或滋阴降火。' }
      ],
      teeth: [
        { val: 'white_firm', label: '洁白坚固', interpret: '牙齿洁白坚固。为肾精充足、骨骼强健。' },
        { val: 'yellow', label: '发黄', interpret: '牙齿发黄。多为胃热或口腔卫生不佳。建议：清胃热，注意口腔清洁。' },
        { val: 'loose', label: '松动', interpret: '牙齿松动。多为肾虚。建议：补肾固齿。' },
        { val: 'gum_swollen', label: '牙龈红肿', interpret: '牙龈红肿出血。多为胃火上炎。建议：清胃泻火，忌辛辣。' }
      ],
      throat: [
        { val: 'normal_throat', label: '正常', interpret: '咽喉色泽正常，无红肿疼痛。为肺气宣畅。' },
        { val: 'swollen_red', label: '红肿', interpret: '咽喉红肿疼痛。多为风热或肺胃热盛。建议：清热利咽，可用金银花、胖大海。' },
        { val: 'foreign_body', label: '有异物感', interpret: '咽喉有异物感，吞之不下、吐之不出。多为梅核气（痰气互结）。建议：理气化痰，可用半夏厚朴汤。' }
      ],
      nails: [
        { val: 'pink_moon', label: '红润有月牙', interpret: '指甲粉红有光泽，月牙明显。为气血充足、肝血旺盛。' },
        { val: 'pale_nail', label: '苍白', interpret: '指甲苍白无华。多为气血不足或贫血。建议：补气养血。' },
        { val: 'purple_nail', label: '紫暗', interpret: '指甲紫暗。多为血瘀或寒凝。建议：活血化瘀或温经散寒。' },
        { val: 'brittle', label: '脆裂', interpret: '指甲脆裂易断。多为肝血不足或阴虚。建议：养肝血、滋阴液。' }
      ],
      skin: [
        { val: 'moist_skin', label: '润泽', interpret: '皮肤润泽有弹性。为气血充足、津液充盈。' },
        { val: 'dry_skin', label: '干燥', interpret: '皮肤干燥粗糙。多为血虚或阴虚、津液不足。建议：养血滋阴润燥。' },
        { val: 'oily_skin', label: '油腻', interpret: '皮肤油腻多脂。多为湿热内蕴。建议：清热利湿，饮食清淡。' },
        { val: 'spots', label: '有斑疹', interpret: '皮肤有斑疹、色素沉着。多为气滞血瘀或肝郁。建议：疏肝理气、活血化瘀。' }
      ]
    },
    // 六、望舌（扩充）
    tongue: {
      color: [
        { val: 'pale', label: '淡白', interpret: '气血不足或阳虚。多见于贫血、脾胃虚弱。建议：补气养血，多食红枣、桂圆、黄芪。' },
        { val: 'normal', label: '淡红', interpret: '正常舌色，气血充盈，为健康表现。' },
        { val: 'red', label: '红', interpret: '热证。实热多见舌红苔黄，虚热多见舌红少苔。建议：清热泻火或滋阴降火。' },
        { val: 'crimson', label: '绛', interpret: '热入营血，多见于高热或久病阴虚火旺。建议：及时就医，滋阴凉血。' },
        { val: 'purple', label: '紫', interpret: '血瘀。淡紫为气滞血瘀，暗紫为寒凝血瘀。建议：活血化瘀，保持情绪舒畅。' }
      ],
      coating: [
        { val: 'thin_white', label: '薄白', interpret: '正常舌苔或表证初起。为健康表现或外感风寒初期。' },
        { val: 'thick_white', label: '厚白', interpret: '湿浊或寒湿内停。多见于消化不良、痰湿体质。建议：健脾祛湿，忌生冷。' },
        { val: 'yellow', label: '黄', interpret: '热证或湿热。多见于胃热、肝胆湿热。建议：清热利湿，忌辛辣油腻。' },
        { val: 'gray_black', label: '灰黑', interpret: '寒证或热证极期。灰黑而润为寒极，灰黑而燥为热极。建议：及时就医。' },
        { val: 'none', label: '无苔', interpret: '胃气不足或胃阴亏虚。多见于久病、阴虚体质。建议：滋阴养胃，多食银耳、百合。' }
      ],
      shape: [
        { val: 'normal', label: '正常', interpret: '舌体大小适中，无齿痕、裂纹，为健康表现。' },
        { val: 'teeth_marks', label: '齿痕', interpret: '脾虚湿盛。舌边有齿痕，多伴乏力、便溏。建议：健脾祛湿，多食薏米、山药。' },
        { val: 'cracked', label: '裂纹', interpret: '阴液亏虚或血虚。多见于阴虚体质、老年人。建议：滋阴润燥，避免辛辣。' },
        { val: 'swollen', label: '胖大', interpret: '脾虚湿盛或阳虚水泛。建议：温阳健脾利水，忌生冷甜腻。' },
        { val: 'thin', label: '瘦薄', interpret: '气血不足或阴虚火旺。建议：补气养血或滋阴降火。' }
      ],
      sublingualVein: [
        { val: 'normal_vein', label: '正常', interpret: '舌下络脉淡紫、细短、无明显怒张。为气血运行正常。' },
        { val: 'purple_swollen', label: '青紫粗胀', interpret: '舌下络脉青紫、粗胀、延长。多为血瘀或气滞血瘀。建议：活血化瘀，可用山楂、玫瑰花泡茶。' }
      ]
    }
  };

  // 保持旧变量兼容（原有数据仅保留面色和舌诊）
  const TONGUE_DATA = {
    faceColor: TONGUE_DIAGNOSIS_DATA.complexion.faceColor,
    color: TONGUE_DIAGNOSIS_DATA.tongue.color,
    coating: TONGUE_DIAGNOSIS_DATA.tongue.coating,
    shape: TONGUE_DIAGNOSIS_DATA.tongue.shape
  };

  // 望诊 Tab 配置
  const TONGUE_TABS = [
    { key: 'spirit', label: '望神', icon: '👁️', dims: [
      { key: 'eyeSpirit', label: '眼神' },
      { key: 'expression', label: '表情' },
      { key: 'energy', label: '精力' },
      { key: 'reaction', label: '反应' }
    ]},
    { key: 'complexion', label: '望色', icon: '🎨', dims: [
      { key: 'faceColor', label: '面色' },
      { key: 'luster', label: '光泽' },
      { key: 'acneLocation', label: '长痘位置' }
    ]},
    { key: 'bodyShape', label: '望形', icon: '🏃', dims: [
      { key: 'bodyType', label: '体型' },
      { key: 'muscle', label: '肌肉' },
      { key: 'special', label: '特殊' }
    ]},
    { key: 'posture', label: '望态', icon: '🧘', dims: [
      { key: 'movement', label: '动作' },
      { key: 'sitting', label: '坐姿' },
      { key: 'gait', label: '步态' },
      { key: 'specialPosture', label: '特殊姿态' }
    ]},
    { key: 'local', label: '望局部', icon: '👂', dims: [
      { key: 'hair', label: '头发' },
      { key: 'eyes', label: '眼睛' },
      { key: 'nose', label: '鼻子' },
      { key: 'ears', label: '耳朵' },
      { key: 'lips', label: '嘴唇' },
      { key: 'teeth', label: '牙齿' },
      { key: 'throat', label: '咽喉' },
      { key: 'nails', label: '指甲' },
      { key: 'skin', label: '皮肤' }
    ]},
    { key: 'tongue', label: '望舌', icon: '👅', dims: [
      { key: 'color', label: '舌色' },
      { key: 'coating', label: '舌苔' },
      { key: 'shape', label: '舌形' },
      { key: 'sublingualVein', label: '舌下络脉' }
    ]}
  ];

  // 望诊综合判断逻辑
  const DIAGNOSIS_LOGIC = {
    patterns: [
      {
        name: '气血两虚',
        conditions: {
          any: [
            { spirit: { energy: ['tired', 'exhausted'] } },
            { complexion: { faceColor: ['pale', 'sallow'] } },
            { tongue: { color: ['pale'] } },
            { local: { lips: ['pale_lips'], nails: ['pale_nail'], eyes: ['pale_lid'] } }
          ],
          minMatch: 2
        },
        interpretation: '气血不足，脏腑失养。表现为面色萎黄或苍白、神疲乏力、舌淡、唇甲色淡。',
        suggest: '补气养血',
        foods: ['红枣', '桂圆', '黄芪', '当归', '乌鸡', '猪肝'],
        acupoints: ['足三里', '三阴交', '气海穴', '血海穴'],
        tea: '黄芪红枣茶、当归补血汤'
      },
      {
        name: '脾虚湿重',
        conditions: {
          any: [
            { complexion: { faceColor: ['sallow'] } },
            { tongue: { shape: ['swollen', 'teeth_marks'], coating: ['thick_white'] } },
            { bodyShape: { bodyType: ['overweight'], special: ['edema'] } },
            { local: { skin: ['oily_skin'] } }
          ],
          minMatch: 2
        },
        interpretation: '脾气虚弱，运化失常，水湿内停。表现为面色萎黄、舌胖有齿痕、苔白腻、体胖浮肿。',
        suggest: '健脾祛湿',
        foods: ['山药', '薏米', '茯苓', '芡实', '白扁豆', '冬瓜'],
        acupoints: ['足三里', '脾俞穴', '中脘穴', '阴陵泉'],
        tea: '陈皮茯苓茶、四神汤'
      },
      {
        name: '肝火旺盛',
        conditions: {
          any: [
            { spirit: { expression: ['restless'] } },
            { complexion: { faceColor: ['flushed'], acneLocation: ['left_cheek', 'nose_bridge'] } },
            { tongue: { color: ['red', 'crimson'] } },
            { local: { eyes: ['bloodshot'], lips: ['deep_red_lips'] } }
          ],
          minMatch: 2
        },
        interpretation: '肝气郁结，气郁化火。表现为面红目赤、烦躁易怒、舌红、口苦。',
        suggest: '清肝泻火',
        foods: ['芹菜', '苦瓜', '菊花', '决明子', '绿豆'],
        acupoints: ['太冲穴', '行间穴', '风池穴'],
        tea: '菊花决明子茶、龙胆泻肝汤'
      },
      {
        name: '肾精不足',
        conditions: {
          any: [
            { complexion: { faceColor: ['dull', 'dark_black'], acneLocation: ['chin'] } },
            { posture: { sitting: ['slouched'] } },
            { local: { ears: ['dark_ear'], hair: ['sparse', 'gray_early'], teeth: ['loose'] } }
          ],
          minMatch: 2
        },
        interpretation: '肾精亏虚，脏腑失养。表现为面色晦暗或黧黑、耳鸣耳聋、腰膝酸软、发脱齿松。',
        suggest: '补肾填精',
        foods: ['黑芝麻', '核桃', '枸杞', '桑椹', '黑豆', '海参'],
        acupoints: ['肾俞穴', '太溪穴', '关元穴', '命门穴'],
        tea: '枸杞黄精茶、六味地黄丸'
      },
      {
        name: '阴虚火旺',
        conditions: {
          any: [
            { spirit: { expression: ['restless'] } },
            { complexion: { faceColor: ['flushed'], luster: ['dry'] } },
            { tongue: { color: ['red', 'crimson'], coating: ['none'], shape: ['cracked', 'thin'] } },
            { bodyShape: { bodyType: ['thin'] } },
            { local: { skin: ['dry_skin'], lips: ['deep_red_lips'] } }
          ],
          minMatch: 2
        },
        interpretation: '阴液亏虚，虚热内生。表现为潮红颧红、口干咽燥、舌红少苔或裂纹、形体消瘦。',
        suggest: '滋阴降火',
        foods: ['银耳', '百合', '麦冬', '玉竹', '梨', '蜂蜜'],
        acupoints: ['太溪穴', '照海穴', '三阴交'],
        tea: '银耳百合茶、知柏地黄丸'
      },
      {
        name: '心火旺盛',
        conditions: {
          any: [
            { spirit: { eyeSpirit: ['lifeless'], expression: ['restless'] } },
            { complexion: { acneLocation: ['forehead'] } },
            { tongue: { color: ['red', 'crimson'] } },
            { local: { lips: ['deep_red_lips'], throat: ['swollen_red'] } }
          ],
          minMatch: 2
        },
        interpretation: '心火上炎，扰乱心神。表现为额头长痘、心烦失眠、口舌生疮、舌尖红。',
        suggest: '清心降火',
        foods: ['莲子心', '苦瓜', '绿豆', '西瓜'],
        acupoints: ['少府穴', '劳宫穴', '神门穴'],
        tea: '莲子心茶、导赤散'
      },
      {
        name: '肺热',
        conditions: {
          any: [
            { complexion: { acneLocation: ['glabella', 'right_cheek'] } },
            { tongue: { color: ['red'], coating: ['yellow'] } },
            { local: { nose: ['yellow_discharge'], throat: ['swollen_red'], skin: ['oily_skin', 'spots'] } }
          ],
          minMatch: 2
        },
        interpretation: '肺热内盛，宣降失常。表现为眉心或右颊长痘、鼻流黄涕、咽痛、皮肤油腻。',
        suggest: '清肺泻热',
        foods: ['梨', '枇杷', '白萝卜', '百合', '银耳'],
        acupoints: ['肺俞穴', '尺泽穴', '列缺穴'],
        tea: '桑叶菊花茶、清肺汤'
      },
      {
        name: '胃肠积热',
        conditions: {
          any: [
            { complexion: { acneLocation: ['around_mouth', 'nose_tip'] } },
            { tongue: { color: ['red'], coating: ['yellow', 'thick_white'] } },
            { local: { teeth: ['gum_swollen'] } }
          ],
          minMatch: 2
        },
        interpretation: '胃肠积热，腑气不通。表现为唇周长痘、鼻头痘、牙龈肿痛、便秘。',
        suggest: '清胃泻热通便',
        foods: ['冬瓜', '黄瓜', '苦瓜', '芹菜', '红薯', '香蕉'],
        acupoints: ['天枢穴', '上巨虚', '曲池穴'],
        tea: '决明子茶、麻子仁丸'
      },
      {
        name: '血瘀',
        conditions: {
          any: [
            { complexion: { faceColor: ['dull', 'dark_black'] } },
            { tongue: { color: ['purple'], sublingualVein: ['purple_swollen'] } },
            { local: { lips: ['purple_lips'], nails: ['purple_nail'], skin: ['spots'] } }
          ],
          minMatch: 2
        },
        interpretation: '血行不畅，瘀血内阻。表现为面色晦暗、唇甲紫暗、舌紫、有瘀斑。',
        suggest: '活血化瘀',
        foods: ['山楂', '玫瑰花', '黑木耳', '醋'],
        acupoints: ['血海穴', '膈俞穴', '合谷穴', '太冲穴'],
        tea: '山楂玫瑰花茶、血府逐瘀汤'
      },
      {
        name: '阳虚寒盛',
        conditions: {
          any: [
            { complexion: { faceColor: ['pale'] } },
            { tongue: { color: ['pale'], shape: ['swollen'] } },
            { posture: { specialPosture: ['curled_warm'] } },
            { bodyShape: { special: ['edema'] } },
            { local: { ears: ['pale_ear'], nails: ['pale_nail'] } }
          ],
          minMatch: 2
        },
        interpretation: '阳气不足，阴寒内盛。表现为面色苍白、畏寒肢冷、舌淡胖、喜暖蜷卧。',
        suggest: '温阳散寒',
        foods: ['生姜', '肉桂', '羊肉', '韭菜', '核桃', '桂圆'],
        acupoints: ['关元穴', '命门穴', '神阙穴（艾灸）'],
        tea: '生姜红枣茶、金匮肾气丸'
      }
    ],
    normalResult: {
      interpretation: '各项望诊指标基本正常，面色红润、舌象正常、精神饱满，提示气血充盈、脏腑功能良好。',
      suggest: '继续保持良好的生活习惯，饮食有节，起居有常。',
      foods: [],
      acupoints: [],
      tea: ''
    }
  };

  // 六字诀
  const SIX_SOUNDS = [
    { char: '嘘', pinyin: 'xū', organ: '肝', effect: '疏肝理气，明目', method: '口型如发"虚"音，两唇微合，舌尖前伸向上。配合怒目圆睁，吐气发声。' },
    { char: '呵', pinyin: 'hē', organ: '心', effect: '清心泻火，安神', method: '口型如发"喝"音，口半开，舌抵下腭。配合面带微笑，吐气发声。' },
    { char: '呼', pinyin: 'hū', organ: '脾', effect: '健脾消食，化湿', method: '口型如发"呼"音，撮口如管状。配合双手托腹，吐气发声。' },
    { char: '呬', pinyin: 'sī', organ: '肺', effect: '润肺益气，止咳', method: '口型如发"丝"音，上下牙齿对齐，微露缝隙。配合双手托天，吐气发声。' },
    { char: '吹', pinyin: 'chuī', organ: '肾', effect: '固肾纳气，强腰', method: '口型如发"吹"音，撮口前突。配合双手抱膝，吐气发声。' },
    { char: '嘻', pinyin: 'xī', organ: '三焦', effect: '通调三焦，理气', method: '口型如发"嘻"音，两唇微启，舌尖轻抵下腭。配合全身放松，吐气发声。' }
  ];

  // 简易八段锦（4式）
  const BA_DUAN_JIN = [
    { name: '第一式 · 两手托天理三焦', desc: '自然站立，双手交叉上托至头顶，掌心向上，如同托举天空。拉伸全身，调理三焦气机。', effect: '调理三焦，舒展全身' },
    { name: '第二式 · 左右开弓似射雕', desc: '马步站立，双手如拉弓射箭状，左右交替。目视食指方向，舒展胸廓。', effect: '宽胸理气，强健臂力' },
    { name: '第三式 · 调理脾胃须单举', desc: '站立，单手上举，掌心向上，另一手下按，掌心向下。左右交替，力达掌根。', effect: '调理脾胃，升降气机' },
    { name: '第四式 · 五劳七伤往后瞧', desc: '自然站立，头慢慢向左转，目视左后方，再转回正，换右侧。动作缓慢柔和。', effect: '缓解疲劳，舒展颈项' }
  ];

  // 症状部位及对应症状
  const SYMPTOM_DATA = {
    head: { name: '头面部', icon: '🧑', symptoms: ['头痛', '头晕', '耳鸣', '眼干涩', '鼻塞流涕', '口干口苦', '面色苍白', '面红目赤'] },
    respiratory: { name: '呼吸系统', icon: '🫁', symptoms: ['咳嗽', '气短气喘', '咳痰清稀', '咳痰黄稠', '咽喉肿痛', '声音嘶哑', '鼻干咽燥', '胸闷'] },
    chest: { name: '胸腹部', icon: '🫀', symptoms: ['心悸', '胃脘胀痛', '食欲不振', '恶心呕吐', '腹胀', '便秘', '腹泻', '反酸烧心'] },
    back: { name: '腰背四肢', icon: '🦴', symptoms: ['腰膝酸软', '关节疼痛', '肢体麻木', '肩颈僵硬', '下肢浮肿', '抽筋', '肢体发凉', '关节红肿'] },
    whole: { name: '全身', icon: '🧍', symptoms: ['畏寒怕冷', '自汗', '盗汗', '疲倦乏力', '消瘦', '肥胖', '低热', '水肿'] },
    emotion: { name: '情绪', icon: '💭', symptoms: ['失眠多梦', '心烦易怒', '抑郁寡欢', '焦虑不安', '健忘', '善太息', '心神不宁', '多疑'] }
  };

  // 补充信息维度
  const SUPPLEMENT_DATA = [
    { key: 'sleep', label: '🛏️ 睡眠', options: ['正常', '入睡困难', '多梦易醒', '嗜睡'] },
    { key: 'diet', label: '🍽️ 饮食', options: ['正常', '食欲不振', '食欲亢进', '口干口渴'] },
    { key: 'emotion', label: '💭 情绪', options: ['平和', '烦躁易怒', '低落抑郁', '焦虑紧张'] },
    { key: 'excretion', label: '🚽 二便', options: ['正常', '便秘', '腹泻', '尿频尿急'] }
  ];

  // 证型库（34种）
  const SYNDROME_TYPES = [
    // 呼吸系统 6种
    { id: 'fqx', name: '肺气虚证', category: '呼吸', symptoms: { '气短气喘': 3, '咳嗽': 2, '声音嘶哑': 2, '自汗': 2, '疲倦乏力': 2, '畏寒怕冷': 1, '面色苍白': 1 }, interpretation: '肺气亏虚，卫表不固。主要表现为咳喘无力、气短懒言、声音低怯、自汗畏风，容易反复感冒。多因久咳伤气或脾虚及肺所致。', tea: ['黄芪防风茶', '党参五味子茶'], acupoints: ['肺俞穴', '足三里', '膻中穴'], diet: { good: '山药、百合、银耳、蜂蜜、雪梨、核桃', bad: '生冷寒凉、辛辣刺激、油腻厚味' } },
    { id: 'fyx', name: '肺阴虚证', category: '呼吸', symptoms: { '咳嗽': 2, '咳痰黄稠': 1, '咽喉肿痛': 2, '声音嘶哑': 2, '鼻干咽燥': 3, '盗汗': 2, '低热': 1 }, interpretation: '肺阴亏虚，虚热内生。表现为干咳少痰、咽干鼻燥、声音嘶哑、盗汗。多因久咳伤阴或燥热伤肺。', tea: ['银耳百合茶', '胖大海甘草茶'], acupoints: ['太渊穴', '列缺穴', '照海穴'], diet: { good: '银耳、百合、梨、蜂蜜、麦冬', bad: '辛辣燥热、烟酒、油炸食品' } },
    { id: 'fsr', name: '风寒犯肺证', category: '呼吸', symptoms: { '咳嗽': 3, '鼻塞流涕': 3, '咳痰清稀': 3, '咽喉肿痛': 1, '畏寒怕冷': 2, '头痛': 1 }, interpretation: '风寒外袭，肺失宣降。表现为咳嗽声重、痰稀色白、鼻塞流清涕、恶寒无汗。多见于冬春季节外感风寒。', tea: ['陈皮生姜茶', '紫苏生姜茶'], acupoints: ['列缺穴', '合谷穴', '风池穴'], diet: { good: '生姜、葱白、紫苏、红糖', bad: '生冷瓜果、寒凉食物' } },
    { id: 'fsr2', name: '风热犯肺证', category: '呼吸', symptoms: { '咳嗽': 2, '咽喉肿痛': 3, '鼻塞流涕': 1, '咳痰黄稠': 2, '头痛': 1, '面红目赤': 1, '口干口苦': 1 }, interpretation: '风热外袭，肺失清肃。表现为咳嗽痰黄、咽痛口渴、鼻塞流黄涕、发热微恶风。多见于春夏季节。', tea: ['菊花枸杞茶', '金银花茶'], acupoints: ['合谷穴', '列缺穴', '少商穴'], diet: { good: '菊花、金银花、薄荷、梨、西瓜', bad: '辛辣燥热、羊肉、桂圆' } },
    { id: 'tzr', name: '痰热蕴肺证', category: '呼吸', symptoms: { '咳嗽': 3, '咳痰黄稠': 3, '胸闷': 2, '气短气喘': 2, '咽喉肿痛': 1, '口干口苦': 1 }, interpretation: '痰热壅肺，肺气上逆。表现为咳嗽气急、痰多黄稠、胸闷口干。多因外感风热或痰湿化热。', tea: ['罗汉果茶', '鱼腥草茶'], acupoints: ['肺俞穴', '丰隆穴', '膻中穴'], diet: { good: '梨、枇杷、罗汉果、冬瓜、萝卜', bad: '甜腻、油炸、辛辣食物' } },
    { id: 'zqy', name: '燥邪犯肺证', category: '呼吸', symptoms: { '咳嗽': 2, '鼻干咽燥': 3, '咽喉肿痛': 2, '声音嘶哑': 2, '咳痰清稀': -1, '口干口渴': 2 }, interpretation: '燥邪伤肺，津液受损。表现为干咳无痰或痰少而黏、咽干鼻燥、声音嘶哑。多见于秋季。', tea: ['银耳百合茶', '胖大海甘草茶'], acupoints: ['太渊穴', '列缺穴', '照海穴'], diet: { good: '梨、银耳、百合、蜂蜜、芝麻', bad: '辛辣刺激、炒货、烟酒' } },
    // 头面部 4种
    { id: 'gsh', name: '肝火上炎证', category: '头面', symptoms: { '头痛': 3, '头晕': 2, '面红目赤': 3, '耳鸣': 2, '口干口苦': 2, '心烦易怒': 2, '眼干涩': 1 }, interpretation: '肝经实火，上扰清窍。表现为头痛眩晕、面红目赤、口苦耳鸣、急躁易怒。多因情志不遂、气郁化火。', tea: ['菊花枸杞茶', '决明子茶'], acupoints: ['太冲穴', '合谷穴', '风池穴'], diet: { good: '芹菜、苦瓜、菊花、决明子', bad: '辛辣、羊肉、酒类' } },
    { id: 'gysx', name: '肝阳上亢证', category: '头面', symptoms: { '头痛': 2, '头晕': 3, '耳鸣': 2, '眼干涩': 2, '失眠多梦': 2, '心烦易怒': 2, '肢体麻木': 1 }, interpretation: '肝肾阴虚，肝阳偏亢。表现为眩晕耳鸣、头目胀痛、腰膝酸软、面部潮红。多见于中老年人、高血压患者。', tea: ['菊花枸杞茶', '天麻钩藤茶'], acupoints: ['太冲穴', '风池穴', '百会穴'], diet: { good: '芹菜、菊花、天麻、枸杞', bad: '辛辣燥热、动物内脏' } },
    { id: 'qxue', name: '气血两虚证', category: '头面', symptoms: { '头晕': 2, '面色苍白': 3, '眼干涩': 1, '心悸': 2, '疲倦乏力': 3, '失眠多梦': 1, '健忘': 1 }, interpretation: '气血不足，不能上荣。表现为面色苍白或萎黄、头晕眼花、心悸失眠、疲倦乏力。多因脾胃虚弱或失血。', tea: ['黄芪红枣茶', '桂圆红枣茶'], acupoints: ['足三里', '三阴交', '气海穴'], diet: { good: '红枣、桂圆、当归、乌鸡、猪肝', bad: '生冷寒凉、浓茶咖啡' } },
    { id: 'sgbx', name: '肾精不足证', category: '头面', symptoms: { '头晕': 2, '耳鸣': 3, '健忘': 2, '腰膝酸软': 2, '失眠多梦': 1, '脱发': 2, '疲倦乏力': 1 }, interpretation: '肾精亏虚，髓海不足。表现为头晕耳鸣、健忘失眠、腰膝酸软、发白早脱。多因年老体衰或房劳过度。', tea: ['枸杞黄精茶', '首乌茶'], acupoints: ['肾俞穴', '太溪穴', '百会穴'], diet: { good: '黑芝麻、核桃、枸杞、桑椹', bad: '生冷寒凉、过度节食' } },
    // 消化 5种
    { id: 'pxq', name: '脾气虚证', category: '消化', symptoms: { '食欲不振': 3, '腹胀': 2, '疲倦乏力': 3, '腹泻': 2, '面色苍白': 1, '自汗': 1 }, interpretation: '脾气亏虚，运化失健。表现为食欲不振、腹胀便溏、疲倦乏力、面色萎黄。多因饮食不节或劳倦伤脾。', tea: ['黄芪红枣茶', '陈皮茯苓茶'], acupoints: ['足三里', '脾俞穴', '中脘穴'], diet: { good: '山药、薏米、大枣、扁豆、糯米', bad: '生冷瓜果、油腻厚味' } },
    { id: 'pyx', name: '脾阳虚证', category: '消化', symptoms: { '食欲不振': 2, '腹胀': 2, '腹泻': 3, '畏寒怕冷': 2, '腹痛喜温': 2, '面色苍白': 1 }, interpretation: '脾阳不足，寒从内生。表现为腹中冷痛、喜温喜按、大便溏稀、四肢不温。多由脾气虚发展而来。', tea: ['陈皮生姜茶', '桂圆红枣茶'], acupoints: ['足三里', '关元穴', '神阙穴'], diet: { good: '生姜、桂圆、羊肉、胡椒', bad: '生冷寒凉、绿豆、西瓜' } },
    { id: 'wyrs', name: '胃热炽盛证', category: '消化', symptoms: { '胃脘胀痛': 2, '口干口苦': 3, '反酸烧心': 2, '食欲亢进': 2, '便秘': 2, '面红目赤': 1 }, interpretation: '胃火炽盛，灼伤胃津。表现为胃脘灼痛、口渴口臭、消谷善饥、牙龈肿痛。多因嗜食辛辣或热邪犯胃。', tea: ['菊花茶', '芦根茶'], acupoints: ['内庭穴', '中脘穴', '合谷穴'], diet: { good: '绿豆、苦瓜、西瓜、梨、莲藕', bad: '辛辣燥热、烧烤、酒类' } },
    { id: 'wyx', name: '胃阴虚证', category: '消化', symptoms: { '胃脘胀痛': 2, '口干口渴': 3, '食欲不振': 2, '便秘': 2, '反酸烧心': 1, '恶心呕吐': 1 }, interpretation: '胃阴亏虚，胃失濡润。表现为胃脘隐痛、口干咽燥、饥不欲食、大便干结。多因热病伤阴或久病胃阴不足。', tea: ['银耳百合茶', '石斛麦冬茶'], acupoints: ['中脘穴', '足三里', '内庭穴'], diet: { good: '银耳、百合、麦冬、石斛、梨', bad: '辛辣燥热、油炸、浓茶' } },
    { id: 'stsr', name: '食滞胃脘证', category: '消化', symptoms: { '胃脘胀痛': 3, '腹胀': 2, '恶心呕吐': 2, '食欲不振': 2, '反酸烧心': 1, '腹泻': 1 }, interpretation: '饮食停滞，胃失和降。表现为脘腹胀满、嗳腐吞酸、不思饮食、呕吐酸腐。多因暴饮暴食或食积不化。', tea: ['山楂决明茶', '陈皮茶'], acupoints: ['中脘穴', '足三里', '天枢穴'], diet: { good: '山楂、萝卜、麦芽、陈皮', bad: '油腻厚味、甜食、糯米' } },
    { id: 'gdpq', name: '肝胃不和证', category: '消化', symptoms: { '胃脘胀痛': 2, '反酸烧心': 2, '腹胀': 1, '心烦易怒': 2, '善太息': 2, '恶心呕吐': 1, '口干口苦': 1 }, interpretation: '肝气郁结，横逆犯胃。表现为胃脘胀痛、痛连两胁、嗳气泛酸、情志不舒时加重。多因情志不畅。', tea: ['玫瑰花茶', '佛手柑茶'], acupoints: ['太冲穴', '中脘穴', '足三里'], diet: { good: '玫瑰花、佛手、柑橘、萝卜', bad: '辛辣刺激、油腻、酒类' } },
    // 全身情志 6种
    { id: 'qxs', name: '气虚证', category: '全身', symptoms: { '疲倦乏力': 3, '自汗': 2, '气短气喘': 2, '面色苍白': 2, '食欲不振': 1, '头晕': 1 }, interpretation: '元气不足，脏腑功能衰退。表现为神疲乏力、少气懒言、自汗、活动后加重。多因先天不足或久病。', tea: ['黄芪红枣茶', '党参茶'], acupoints: ['足三里', '气海穴', '关元穴'], diet: { good: '黄芪、党参、山药、大枣、鸡肉', bad: '生冷寒凉、萝卜（破气）' } },
    { id: 'yxs', name: '阳虚证', category: '全身', symptoms: { '畏寒怕冷': 3, '四肢不温': 2, '疲倦乏力': 1, '面色苍白': 1, '腹泻': 1, '腰膝酸软': 1, '肢体发凉': 2 }, interpretation: '阳气不足，温煦失职。表现为畏寒怕冷、四肢不温、面色苍白、喜温喜热。多由气虚发展而来。', tea: ['桂圆红枣茶', '干姜红茶'], acupoints: ['关元穴', '命门穴', '足三里'], diet: { good: '羊肉、生姜、桂圆、韭菜、核桃', bad: '生冷寒凉、绿豆、苦瓜' } },
    { id: 'yys', name: '阴虚证', category: '全身', symptoms: { '盗汗': 3, '低热': 2, '口干口渴': 2, '心烦易怒': 1, '失眠多梦': 1, '消瘦': 1 }, interpretation: '阴液亏虚，虚热内生。表现为午后潮热、盗汗、口干咽燥、五心烦热。多因热病伤阴或久病。', tea: ['银耳百合茶', '枸杞麦冬茶'], acupoints: ['太溪穴', '三阴交', '照海穴'], diet: { good: '银耳、百合、梨、枸杞、麦冬', bad: '辛辣燥热、羊肉、韭菜' } },
    { id: 'xsx', name: '血虚证', category: '全身', symptoms: { '面色苍白': 3, '头晕': 2, '眼干涩': 2, '心悸': 2, '失眠多梦': 2, '健忘': 1, '肢体麻木': 2 }, interpretation: '血液亏虚，脏腑失养。表现为面色淡白或萎黄、唇舌色淡、头晕眼花、心悸失眠。多因失血或脾胃虚弱。', tea: ['桂圆红枣茶', '当归茶'], acupoints: ['三阴交', '足三里', '血海穴'], diet: { good: '红枣、桂圆、当归、猪肝、乌鸡', bad: '生冷寒凉、浓茶' } },
    { id: 'qyz', name: '气郁证', category: '情志', symptoms: { '抑郁寡欢': 3, '善太息': 3, '心烦易怒': 2, '胸闷': 2, '失眠多梦': 1, '焦虑不安': 2, '腹胀': 1 }, interpretation: '气机郁滞，情志不舒。表现为情绪低落、胸闷叹息、胁肋胀痛、咽中如有物梗。多因情志不畅。', tea: ['玫瑰花茶', '佛手柑茶'], acupoints: ['太冲穴', '膻中穴', '期门穴'], diet: { good: '玫瑰花、柑橘、佛手、萝卜、芹菜', bad: '收涩酸敛、油腻' } },
    { id: 'xsyz', name: '心血虚证', category: '情志', symptoms: { '心悸': 3, '失眠多梦': 3, '健忘': 2, '面色苍白': 1, '心神不宁': 2, '头晕': 1 }, interpretation: '心血不足，心失所养。表现为心悸怔忡、失眠多梦、健忘、面色无华。多因失血或脾虚生血不足。', tea: ['桂圆红枣茶', '酸枣仁茶'], acupoints: ['神门穴', '心俞穴', '三阴交'], diet: { good: '桂圆、红枣、莲子、猪心、百合', bad: '浓茶咖啡、辛辣刺激' } },
    // 其他常见 5种+
    { id: 'syx', name: '肾阳虚证', category: '其他', symptoms: { '腰膝酸软': 3, '畏寒怕冷': 3, '肢体发凉': 2, '下肢浮肿': 2, '腹泻': 1, '尿频尿急': 1, '疲倦乏力': 1 }, interpretation: '肾阳亏虚，温煦失职。表现为腰膝酸冷、畏寒肢冷、夜尿频多、性功能减退。多因年老肾亏或久病伤阳。', tea: ['桂圆红枣茶', '杜仲茶'], acupoints: ['肾俞穴', '关元穴', '命门穴'], diet: { good: '羊肉、韭菜、核桃、虾、桂皮', bad: '生冷寒凉、西瓜、绿豆' } },
    { id: 'syy', name: '肾阴虚证', category: '其他', symptoms: { '腰膝酸软': 3, '盗汗': 2, '低热': 1, '耳鸣': 2, '失眠多梦': 1, '头晕': 1, '口干口渴': 1 }, interpretation: '肾阴亏虚，虚热内生。表现为腰膝酸软、眩晕耳鸣、盗汗潮热、遗精。多因久病伤阴或房劳过度。', tea: ['枸杞麦冬茶', '六味地黄茶'], acupoints: ['太溪穴', '肾俞穴', '三阴交'], diet: { good: '黑芝麻、枸杞、桑椹、银耳、鸭肉', bad: '辛辣燥热、羊肉、韭菜' } },
    { id: 'tsx', name: '痰湿证', category: '其他', symptoms: { '肥胖': 2, '疲倦乏力': 2, '胸闷': 2, '腹胀': 1, '腹泻': 1, '咳嗽': 1, '咳痰清稀': 1, '下肢浮肿': 1 }, interpretation: '痰湿内停，阻滞气机。表现为体型肥胖、身体困重、痰多、胸闷、嗜食肥甘。多因脾虚运化失职。', tea: ['薏米赤小豆茶', '陈皮茯苓茶'], acupoints: ['丰隆穴', '足三里', '阴陵泉'], diet: { good: '薏米、冬瓜、萝卜、陈皮、荷叶', bad: '甜腻、油腻、生冷' } },
    { id: 'srx', name: '湿热证', category: '其他', symptoms: { '口干口苦': 2, '面红目赤': 1, '腹胀': 1, '腹泻': 1, '尿频尿急': 1, '便秘': 1, '低热': 1, '关节红肿': 1 }, interpretation: '湿热蕴结，阻滞气机。表现为口苦口黏、身热不扬、小便短黄、大便黏滞。多因感受湿热或饮食不节。', tea: ['薏米赤小豆茶', '菊花茶'], acupoints: ['阴陵泉', '丰隆穴', '合谷穴'], diet: { good: '绿豆、薏米、苦瓜、冬瓜、赤小豆', bad: '甜腻、油炸、酒类、辛辣' } },
    { id: 'xxy', name: '血瘀证', category: '其他', symptoms: { '关节疼痛': 2, '肢体麻木': 2, '头痛': 1, '面色苍白': -1, '健忘': 1, '失眠多梦': 1, '胸闷': 1 }, interpretation: '瘀血内停，血脉不畅。表现为刺痛固定不移、面色晦暗、口唇紫暗、肌肤甲错。多因气滞或寒凝。', tea: ['玫瑰花茶', '山楂茶'], acupoints: ['血海穴', '三阴交', '膈俞穴'], diet: { good: '山楂、玫瑰花、黑豆、醋、桃仁', bad: '寒凉收涩、过度油腻' } },
    // 补充：嗓子相关特殊证型
    { id: 'fgx', name: '肺肾气虚证', category: '呼吸', symptoms: { '气短气喘': 3, '声音嘶哑': 3, '咳嗽': 1, '腰膝酸软': 2, '疲倦乏力': 2, '自汗': 1 }, interpretation: '肺肾两脏气虚，纳气无力。表现为气短喘促、声低息微、腰膝酸软、呼多吸少。多因久病咳喘伤及肾气。', tea: ['黄芪核桃茶', '冬虫夏草茶'], acupoints: ['肺俞穴', '肾俞穴', '足三里'], diet: { good: '核桃、山药、冬虫夏草、蛤蚧', bad: '生冷寒凉、破气食物' } },
    { id: 'gys', name: '肝郁化火证', category: '情志', symptoms: { '心烦易怒': 3, '头痛': 2, '口干口苦': 2, '失眠多梦': 2, '面红目赤': 1, '耳鸣': 1, '焦虑不安': 1, '善太息': 1 }, interpretation: '肝气郁结，日久化火。表现为急躁易怒、头痛目赤、口苦咽干、胸胁灼痛。多因长期情志不遂。', tea: ['菊花枸杞茶', '决明子茶'], acupoints: ['太冲穴', '行间穴', '风池穴'], diet: { good: '芹菜、苦瓜、菊花、决明子、绿豆', bad: '辛辣、羊肉、酒类、油炸' } },
    { id: 'xrsj', name: '心肾不交证', category: '情志', symptoms: { '失眠多梦': 3, '心烦易怒': 2, '心悸': 2, '健忘': 2, '盗汗': 1, '耳鸣': 1, '腰膝酸软': 1, '焦虑不安': 1 }, interpretation: '心火偏亢，肾水不足。表现为心烦失眠、多梦遗精、腰膝酸软、潮热盗汗。多因久病或思虑过度。', tea: ['莲子心茶', '酸枣仁茶'], acupoints: ['神门穴', '太溪穴', '心俞穴'], diet: { good: '莲子、百合、酸枣仁、小麦', bad: '辛辣燥热、浓茶咖啡' } },
    { id: 'psy', name: '脾胃湿热证', category: '消化', symptoms: { '腹胀': 2, '食欲不振': 2, '口干口苦': 2, '腹泻': 1, '恶心呕吐': 1, '反酸烧心': 1, '疲倦乏力': 1, '面红目赤': -1 }, interpretation: '湿热蕴结脾胃，运化失职。表现为脘腹痞闷、口苦口黏、纳呆呕恶、大便黏滞不爽。多因饮食不节。', tea: ['薏米赤小豆茶', '藿香佩兰茶'], acupoints: ['中脘穴', '阴陵泉', '足三里'], diet: { good: '薏米、绿豆、冬瓜、苦瓜、赤小豆', bad: '甜腻、油炸、酒类、辛辣' } },
    { id: 'tpqx', name: '脾肺气虚证', category: '全身', symptoms: { '疲倦乏力': 2, '食欲不振': 2, '咳嗽': 2, '气短气喘': 2, '腹泻': 1, '自汗': 1, '面色苍白': 1 }, interpretation: '脾肺两脏气虚，土不生金。表现为食欲不振、腹胀便溏、久咳不止、气短懒言。多因久病或脾虚及肺。', tea: ['黄芪红枣茶', '山药茯苓茶'], acupoints: ['足三里', '肺俞穴', '脾俞穴'], diet: { good: '山药、黄芪、大枣、糯米、鸡肉', bad: '生冷寒凉、破气食物' } },
    { id: 'fgsx', name: '风寒湿痹证', category: '其他', symptoms: { '关节疼痛': 3, '关节红肿': -1, '肢体发凉': 2, '肢体麻木': 2, '肩颈僵硬': 1, '畏寒怕冷': 1, '抽筋': 1 }, interpretation: '风寒湿邪侵袭经络关节。表现为关节冷痛、遇寒加重、得温则减、肢体麻木。多因居处潮湿或冒雨涉水。', tea: ['生姜红茶', '独活茶'], acupoints: ['阿是穴', '足三里', '阳陵泉'], diet: { good: '生姜、葱白、桂皮、胡椒、羊肉', bad: '生冷寒凉、西瓜、绿豆' } },
    { id: 'rsbj', name: '风湿热痹证', category: '其他', symptoms: { '关节疼痛': 2, '关节红肿': 3, '肢体麻木': 1, '低热': 1, '口干口苦': 1, '面红目赤': 1 }, interpretation: '风湿热邪壅滞经络关节。表现为关节红肿热痛、活动不利、口渴烦闷。多因感受风湿热邪或素体阳盛。', tea: ['金银花茶', '桑枝茶'], acupoints: ['曲池穴', '合谷穴', '阳陵泉'], diet: { good: '绿豆、薏米、冬瓜、丝瓜、苦瓜', bad: '辛辣燥热、羊肉、酒类' } }
  ];

  // ===== H4: 个性化干预方案数据 =====
  const INTERVENTION_PLANS = {
    // 呼吸类
    'fqx': { daily_habits: ['早起一杯温水', '避免受凉感冒', '练习腹式呼吸'], food_recipes: [{ name: '黄芪山药粥', ingredients: '黄芪15g、山药30g、大米50g', method: '黄芪煮水取汁，加山药大米煮粥', frequency: '每周3次' }], acupoint_plan: [{ name: '肺俞穴', method: '按揉', duration: '3分钟', timing: '早晚' }, { name: '足三里', method: '按揉', duration: '3分钟', timing: '饭后' }], tea_plan: { name: '黄芪防风茶', method: '黄芪10g、防风5g沸水冲泡', frequency: '每日1杯' }, exercise: { name: '八段锦·左右开弓似射雕', duration: '5分钟', timing: '晨起' } },
    'fyx': { daily_habits: ['避免熬夜', '保持室内湿度', '少吃辛辣'], food_recipes: [{ name: '银耳百合羹', ingredients: '银耳10g、百合15g、冰糖适量', method: '银耳泡发撕小朵，与百合同煮1小时', frequency: '每周3次' }], acupoint_plan: [{ name: '太渊穴', method: '按揉', duration: '3分钟', timing: '早晚' }, { name: '照海穴', method: '按揉', duration: '3分钟', timing: '睡前' }], tea_plan: { name: '银耳百合茶', method: '银耳5g、百合10g煮水', frequency: '每日1杯' }, exercise: { name: '深呼吸放松', duration: '10分钟', timing: '睡前' } },
    'fsr': { daily_habits: ['注意保暖', '多喝温水', '避免吹风'], food_recipes: [{ name: '生姜葱白粥', ingredients: '生姜3片、葱白2段、大米50g', method: '大米煮粥，快熟时加生姜葱白', frequency: '感冒初期每日1次' }], acupoint_plan: [{ name: '列缺穴', method: '按揉', duration: '3分钟', timing: '早晚' }, { name: '风池穴', method: '按揉', duration: '3分钟', timing: '早晚' }], tea_plan: { name: '生姜红糖水', method: '生姜3片、红糖适量煮水', frequency: '每日1杯' }, exercise: { name: '适度散步', duration: '20分钟', timing: '午后' } },
    // 消化类
    'pxq': { daily_habits: ['三餐定时', '细嚼慢咽', '饭后散步15分钟'], food_recipes: [{ name: '四神汤', ingredients: '山药15g、莲子15g、芡实15g、茯苓15g、排骨适量', method: '所有材料炖1.5小时', frequency: '每周2-3次' }, { name: '山药薏米粥', ingredients: '山药30g、薏米20g、大米30g', method: '薏米提前浸泡，与山药大米同煮', frequency: '每周3次' }], acupoint_plan: [{ name: '足三里', method: '按揉或艾灸', duration: '5分钟', timing: '饭后1小时' }, { name: '中脘穴', method: '顺时针揉腹', duration: '5分钟', timing: '早晚' }], tea_plan: { name: '陈皮茯苓茶', method: '陈皮5g、茯苓10g煮水', frequency: '每日1杯' }, exercise: { name: '饭后散步', duration: '15-20分钟', timing: '饭后30分钟' } },
    'pyx': { daily_habits: ['忌生冷寒凉', '腹部保暖', '睡前热水泡脚'], food_recipes: [{ name: '生姜羊肉汤', ingredients: '生姜15g、羊肉100g、当归5g', method: '羊肉焯水，与生姜当归炖1.5小时', frequency: '每周1-2次' }], acupoint_plan: [{ name: '神阙穴', method: '艾灸或热敷', duration: '10分钟', timing: '睡前' }, { name: '关元穴', method: '按揉', duration: '5分钟', timing: '早晚' }], tea_plan: { name: '干姜红茶', method: '干姜3g、红茶5g冲泡', frequency: '每日1杯' }, exercise: { name: '太极云手', duration: '10分钟', timing: '晨起' } },
    'psy': { daily_habits: ['忌油腻辛辣', '多吃清淡蔬菜', '保持心情舒畅'], food_recipes: [{ name: '薏米赤小豆汤', ingredients: '薏米30g、赤小豆30g、冰糖适量', method: '薏米赤小豆提前浸泡，煮至软烂', frequency: '每周3次' }], acupoint_plan: [{ name: '阴陵泉', method: '按揉', duration: '3分钟', timing: '早晚' }, { name: '中脘穴', method: '按揉', duration: '3分钟', timing: '饭后' }], tea_plan: { name: '薏米赤小豆茶', method: '薏米10g、赤小豆10g煮水', frequency: '每日1杯' }, exercise: { name: '散步或瑜伽', duration: '20分钟', timing: '午后' } },
    // 全身类
    'qxs': { daily_habits: ['避免过度劳累', '保证充足睡眠', '适度运动'], food_recipes: [{ name: '黄芪炖鸡', ingredients: '黄芪30g、党参15g、红枣5枚、鸡肉200g', method: '所有材料炖1.5小时', frequency: '每周1-2次' }], acupoint_plan: [{ name: '足三里', method: '按揉或艾灸', duration: '5分钟', timing: '早晚' }, { name: '气海穴', method: '按揉', duration: '3分钟', timing: '早晚' }], tea_plan: { name: '黄芪红枣茶', method: '黄芪15g、红枣5枚煮水', frequency: '每日1杯' }, exercise: { name: '八段锦', duration: '15分钟', timing: '晨起' } },
    'yxs': { daily_habits: ['注意保暖', '多吃温热食物', '避免熬夜'], food_recipes: [{ name: '当归生姜羊肉汤', ingredients: '当归10g、生姜15g、羊肉150g', method: '羊肉焯水，与当归生姜炖1.5小时', frequency: '每周1-2次' }], acupoint_plan: [{ name: '关元穴', method: '艾灸', duration: '10分钟', timing: '睡前' }, { name: '命门穴', method: '按揉', duration: '3分钟', timing: '早晚' }], tea_plan: { name: '桂圆红枣茶', method: '桂圆5粒、红枣5枚煮水', frequency: '每日1杯' }, exercise: { name: '慢跑', duration: '20分钟', timing: '午后' } },
    'yys': { daily_habits: ['忌辛辣燥热', '多吃滋润食物', '避免熬夜'], food_recipes: [{ name: '百合银耳羹', ingredients: '百合15g、银耳10g、枸杞10g、冰糖适量', method: '银耳泡发，与百合枸杞煮1小时', frequency: '每周3次' }], acupoint_plan: [{ name: '太溪穴', method: '按揉', duration: '3分钟', timing: '早晚' }, { name: '三阴交', method: '按揉', duration: '3分钟', timing: '睡前' }], tea_plan: { name: '枸杞麦冬茶', method: '枸杞10g、麦冬10g冲泡', frequency: '每日1杯' }, exercise: { name: '瑜伽或太极', duration: '20分钟', timing: '晨起或睡前' } },
    'xsx': { daily_habits: ['避免过度用眼', '保证营养均衡', '适度运动'], food_recipes: [{ name: '当归红枣鸡蛋汤', ingredients: '当归10g、红枣10枚、鸡蛋2个', method: '当归红枣煮水，打入鸡蛋', frequency: '每周2次' }], acupoint_plan: [{ name: '三阴交', method: '按揉', duration: '3分钟', timing: '早晚' }, { name: '血海穴', method: '按揉', duration: '3分钟', timing: '早晚' }], tea_plan: { name: '桂圆红枣茶', method: '桂圆5粒、红枣5枚煮水', frequency: '每日1杯' }, exercise: { name: '散步', duration: '30分钟', timing: '午后' } },
    'qyz': { daily_habits: ['保持心情舒畅', '多与人交流', '培养兴趣爱好'], food_recipes: [{ name: '玫瑰花茶', ingredients: '玫瑰花5g、佛手5g', method: '沸水冲泡', frequency: '每日1杯' }], acupoint_plan: [{ name: '太冲穴', method: '按揉', duration: '5分钟', timing: '情绪低落时' }, { name: '膻中穴', method: '按揉', duration: '3分钟', timing: '胸闷时' }], tea_plan: { name: '玫瑰花茶', method: '玫瑰花5g沸水冲泡', frequency: '每日1杯' }, exercise: { name: '户外活动', duration: '30分钟', timing: '每日' } },
    // 其他类
    'tsx': { daily_habits: ['少吃甜腻油腻', '多运动出汗', '避免久坐'], food_recipes: [{ name: '薏米冬瓜汤', ingredients: '薏米30g、冬瓜200g、陈皮5g', method: '薏米提前浸泡，与冬瓜陈皮同煮', frequency: '每周3次' }], acupoint_plan: [{ name: '丰隆穴', method: '按揉', duration: '5分钟', timing: '早晚' }, { name: '阴陵泉', method: '按揉', duration: '3分钟', timing: '早晚' }], tea_plan: { name: '陈皮茯苓茶', method: '陈皮5g、茯苓10g煮水', frequency: '每日1杯' }, exercise: { name: '快走或慢跑', duration: '30分钟', timing: '每日' } },
    'srx': { daily_habits: ['忌辛辣油腻', '多吃清淡蔬菜', '多喝水'], food_recipes: [{ name: '绿豆薏米汤', ingredients: '绿豆30g、薏米30g、冰糖适量', method: '绿豆薏米提前浸泡，煮至软烂', frequency: '每周3次' }], acupoint_plan: [{ name: '阴陵泉', method: '按揉', duration: '3分钟', timing: '早晚' }, { name: '曲池穴', method: '按揉', duration: '3分钟', timing: '早晚' }], tea_plan: { name: '菊花茶', method: '菊花5g沸水冲泡', frequency: '每日1杯' }, exercise: { name: '游泳或瑜伽', duration: '30分钟', timing: '每日' } },
    'xxy': { daily_habits: ['保持心情舒畅', '适度运动', '避免受寒'], food_recipes: [{ name: '山楂玫瑰花茶', ingredients: '山楂10g、玫瑰花5g', method: '沸水冲泡', frequency: '每日1杯' }], acupoint_plan: [{ name: '血海穴', method: '按揉', duration: '3分钟', timing: '早晚' }, { name: '膈俞穴', method: '按揉', duration: '3分钟', timing: '早晚' }], tea_plan: { name: '山楂茶', method: '山楂10g煮水', frequency: '每日1杯' }, exercise: { name: '太极或散步', duration: '30分钟', timing: '每日' } }
  };

  // 默认干预方案（未匹配到时使用）
  const DEFAULT_INTERVENTION = {
    daily_habits: ['规律作息', '均衡饮食', '适度运动'],
    food_recipes: [{ name: '养生粥', ingredients: '山药、薏米、红枣各适量', method: '同煮成粥', frequency: '每周2-3次' }],
    acupoint_plan: [{ name: '足三里', method: '按揉', duration: '3分钟', timing: '早晚' }],
    tea_plan: { name: '养生茶', method: '枸杞、红枣冲泡', frequency: '每日1杯' },
    exercise: { name: '散步', duration: '20分钟', timing: '每日' }
  };

  // ===== 工具函数 =====
  function getWeekdayName(date) {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return names[date.getDay()];
  }
  function isToday(date) {
    return formatDate(date) === formatDate(new Date());
  }
  function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }
  function getSeason() {
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m === 6 || m === 7) return 'summer';
    if (m === 8) return 'longsummer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }
  function showToast(msg) {
    const toast = document.getElementById('healthToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ===== 事件绑定辅助 =====
  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== Tab 切换 =====
  // 主Tab切换（模块级可调用）
  let _healthSwitchTab = null;

  function switchHealthTab(index) {
    if (_healthSwitchTab) _healthSwitchTab(index);
  }


  // ===== 路由参数处理（v99 跨模块定位） =====
  function handleRouteParams(params) {
    if (!params) return;
    // tab 参数：切换主Tab
    if (params.tab !== undefined) {
      const tabIdx = parseInt(params.tab, 10);
      if (!isNaN(tabIdx) && tabIdx >= 0 && tabIdx < 6) {
        switchHealthTab(tabIdx);
      }
    }
    // target 参数：滚动到对应卡片并高亮
    if (params.target) {
      // 延迟滚动，确保Tab切换后DOM可见
      setTimeout(() => {
        scrollToHealthTarget(params.target);
      }, 100);
    }
  }

  function scrollToHealthTarget(target) {
    // 健康模块各子功能对应的选择器
    const targetMap = {
      'season': '#healthSeasonTabs',
      'constitution': '#healthConstitutionPlaceholder',
      'emotion': '#healthEmotionSelector',
      'diet': '#healthTeaFilter',
      'qigong': '#healthQigongTabs',
      'daily': '#healthTab0',
      'shichen': '#healthShichenName',
      'acupoint': '#healthAcupointSvg',
      'tongue': '#healthTongueResult',
      'food': '#healthFoodSearch',
      'organ': '#healthOrganTabs',
    };
    const targetTabMap = {
      'season': 3, 'constitution': 2, 'emotion': 5, 'diet': 3,
      'qigong': 5, 'daily': 0, 'shichen': 3, 'acupoint': 4,
      'tongue': 1, 'food': 3, 'organ': 4,
    };
    const selector = targetMap[target];
    if (!selector) return;
    const el = document.querySelector(selector);
    if (el) {
      if (targetTabMap[target] !== undefined) switchHealthTab(targetTabMap[target]);
      setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
      // 高亮闪烁效果
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow = '0 0 0 2px var(--accent, #E8A87C)';
      setTimeout(() => {
        el.style.boxShadow = '';
      }, 2000);
    }
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.health-tab-item');
    const indicator = document.getElementById('healthTabIndicator');
    const tabBar = document.getElementById('healthTabBar');

    function updateIndicator(index) {
      const tab = tabs[index];
      if (!tab || !tabBar || !indicator) return;
      const barRect = tabBar.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      const left = tabRect.left - barRect.left - 4;
      indicator.style.width = tabRect.width + 'px';
      indicator.style.transform = `translateX(${left}px)`;
    }
    function switchTab(index) {
      tabs.forEach((t, i) => t.classList.toggle('active', i === index));
      document.querySelectorAll('.health-tab-content').forEach((c, i) => c.classList.toggle('active', i === index));
      updateIndicator(index);
    }
    _healthSwitchTab = switchTab;
    tabs.forEach((tab, i) => {
      _bindEvent(tab, 'click', () => switchTab(i));
    });
    requestAnimationFrame(() => updateIndicator(0));
    _bindEvent(window, 'resize', () => {
      const activeIndex = [...tabs].findIndex(t => t.classList.contains('active'));
      updateIndicator(activeIndex >= 0 ? activeIndex : 0);
    });
  }

  // ===== 日期显示 =====
  function updateDateDisplay() {
    const dateTextEl = document.getElementById('health-date-text');
    const weekdayEl = document.getElementById('health-date-weekday');
    const todayBtn = document.getElementById('health-today-btn');
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    const d = currentDate.getDate();
    if (dateTextEl) dateTextEl.textContent = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (weekdayEl) weekdayEl.textContent = isToday(currentDate) ? '今天' : getWeekdayName(currentDate);
    if (todayBtn) todayBtn.classList.toggle('active', isToday(currentDate));
  }

  // ===== 加载数据 =====
  async function loadData() {
    const dateStr = formatDate(currentDate);
    try {
      healthData = await Storage.get('health', dateStr);
      if (!healthData) {
        healthData = { id: dateStr, date: dateStr, weight: null, weightTrend: '', sleep: { bedtime: '23:00', waketime: '07:00', duration: null, nap: 0 }, exercises: [], water: 0, diets: [], bowel: { count: 0, form: '', color: '', note: '' } };
      }
      if (!healthData.sleep) healthData.sleep = { bedtime: '23:00', waketime: '07:00', duration: null, nap: 0 };
      if (!healthData.exercises) healthData.exercises = [];
      if (healthData.water === undefined) healthData.water = 0;
      if (!healthData.diets) healthData.diets = [];
      if (!healthData.bowel) healthData.bowel = { count: 0, form: '', color: '', note: '' };
      fillUI();
      await renderMiniCharts();
    } catch (err) {
      console.error('[Health] 加载数据失败:', err);
    }
  }

  // ===== 保存数据 =====
  async function saveData() {
    const dateStr = formatDate(currentDate);
    try {
      healthData.id = dateStr;
      healthData.date = dateStr;
      await Storage.put('health', healthData);
      EventBus.emit('health:logged', { data: healthData });
    } catch (err) {
      console.error('[Health] 保存失败:', err);
    }
  }

  // ===== 填充UI =====
  function fillUI() {
    const weightInput = document.getElementById('health-weight-input');
    if (weightInput && healthData.weight !== null && healthData.weight !== undefined) weightInput.value = healthData.weight;
    const trendEl = document.getElementById('health-weight-trend');
    if (trendEl && healthData.weightTrend) trendEl.textContent = healthData.weightTrend;
    const bedtimeInput = document.getElementById('health-sleep-bedtime');
    const waketimeInput = document.getElementById('health-sleep-waketime');
    const napInput = document.getElementById('health-sleep-nap');
    if (bedtimeInput) bedtimeInput.value = healthData.sleep.bedtime || '23:00';
    if (waketimeInput) waketimeInput.value = healthData.sleep.waketime || '07:00';
    if (napInput) napInput.value = healthData.sleep.nap || 0;
    calcSleepDuration();
    renderExercises();
    updateWaterDisplay();
    renderDiets();
    fillBowelUI();
  }

  // ===== 周趋势迷你图表 =====
  async function renderMiniCharts() {
    try {
      const allHealth = await Storage.getAll('health');
      const today = new Date();
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(formatDate(d));
      }
      const weightData = [], sleepData = [], exerciseData = [];
      let lastWeight = null;
      for (const dateStr of days) {
        const rec = allHealth.find(r => r.date === dateStr);
        weightData.push(rec && rec.weight ? rec.weight : (lastWeight || 0));
        sleepData.push(rec && rec.sleep && rec.sleep.duration ? rec.sleep.duration / 60 : 0);
        const exMin = rec && rec.exercises ? rec.exercises.reduce((s, e) => s + (e.duration || 0), 0) : 0;
        exerciseData.push(exMin);
        if (rec && rec.weight) lastWeight = rec.weight;
      }
      renderSparkline('healthWeightChart', weightData, 'weight');
      renderSparkline('healthSleepChart', sleepData, 'sleep');
      renderSparkline('healthExerciseChart', exerciseData, 'exercise');
      const wv = document.getElementById('health-chart-weight-val');
      const sv = document.getElementById('health-chart-sleep-val');
      const ev = document.getElementById('health-chart-exercise-val');
      if (wv) wv.innerHTML = (weightData[6] || '--') + ' <span>kg</span>';
      if (sv) sv.innerHTML = (sleepData[6] ? sleepData[6].toFixed(1) : '--') + ' <span>h</span>';
      if (ev) ev.innerHTML = (exerciseData[6] || '--') + ' <span>min</span>';
    } catch (err) {
      console.error('[Health] 渲染图表失败:', err);
    }
  }
  function renderSparkline(containerId, data, cssClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const max = Math.max(...data, 1);
    const min = Math.min(...data);
    const range = max - min || 1;
    data.forEach((val, i) => {
      const bar = document.createElement('div');
      bar.className = `health-sparkline-bar ${cssClass}${i === data.length - 1 ? ' highlight' : ''}`;
      const height = val > 0 ? 4 + ((val - min) / range) * 28 : 3;
      bar.style.height = height + 'px';
      bar.title = val;
      container.appendChild(bar);
    });
  }

  // ===== 体重 =====
  function bindWeightEvents() {
    const input = document.getElementById('health-weight-input');
    if (!input) return;
    let saveTimer = null;
    _bindEvent(input, 'input', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        healthData.weight = val;
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
    if (!trendEl || !healthData.weight) { if (trendEl) trendEl.textContent = ''; return; }
    try {
      const allHealth = await Storage.getAll('health');
      const dateStr = formatDate(currentDate);
      const prevRecords = allHealth.filter(r => r.date < dateStr && r.weight !== null && r.weight !== undefined).sort((a, b) => b.date.localeCompare(a.date));
      if (prevRecords.length === 0) { trendEl.textContent = ''; return; }
      const prev = prevRecords[0];
      const diff = (healthData.weight - prev.weight).toFixed(1);
      if (diff > 0) { trendEl.textContent = `较上次 +${diff} kg`; trendEl.style.color = 'var(--accent-red)'; }
      else if (diff < 0) { trendEl.textContent = `较上次 ${diff} kg`; trendEl.style.color = 'var(--accent-green)'; }
      else { trendEl.textContent = '与上次持平'; trendEl.style.color = 'var(--text-muted)'; }
    } catch (err) { trendEl.textContent = ''; }
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
    _bindEvent(bedtimeInput, 'change', update);
    _bindEvent(waketimeInput, 'change', update);
    _bindEvent(napInput, 'input', update);
  }
  function calcSleepDuration() {
    const bedtimeEl = document.getElementById('health-sleep-bedtime');
    const waketimeEl = document.getElementById('health-sleep-waketime');
    const hoursEl = document.querySelector('.health-sleep-hours');
    if (!bedtimeEl || !waketimeEl || !hoursEl) return;
    const bed = bedtimeEl.value, wake = waketimeEl.value;
    if (!bed || !wake) { hoursEl.textContent = '--'; return; }
    const bedMin = timeToMinutes(bed);
    let wakeMin = timeToMinutes(wake);
    if (wakeMin <= bedMin) wakeMin += 24 * 60;
    const durationMin = wakeMin - bedMin;
    healthData.sleep.duration = durationMin;
    const hours = Math.floor(durationMin / 60);
    const mins = durationMin % 60;
    hoursEl.textContent = mins > 0 ? `${hours}小时${mins}分` : `${hours}`;
  }

  // ===== 运动 =====
  function renderExercises() {
    const list = document.getElementById('health-exercise-list');
    if (!list) return;
    if (healthData.exercises.length === 0) {
      list.innerHTML = '<div class="health-empty-state">还没有运动记录</div>';
      return;
    }
    const typeEmoji = { walking: '🚶', running: '🏃', cycling: '🚴', swimming: '🏊', yoga: '🧘', strength: '🏋️', basketball: '🏀', badminton: '🏸', hiking: '🥾', vocal: '🎤' };
    list.innerHTML = healthData.exercises.map((ex, i) => `
      <div class="health-exercise-item">
        <span class="health-exercise-item-name">${typeEmoji[ex.type] || '️'} ${escapeHtml(ex.customType || ex.type)}</span>
        <span class="health-exercise-item-duration">${ex.duration}分钟</span>
        <button class="health-exercise-item-delete" data-index="${i}">✕</button>
      </div>
    `).join('');
    list.querySelectorAll('.health-exercise-item-delete').forEach(btn => {
      _bindEvent(btn, 'click', () => {
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
    _bindEvent(typeSelect, 'change', () => {
      if (customInput) customInput.style.display = typeSelect.value === 'custom' ? '' : 'none';
    });
    _bindEvent(addBtn, 'click', () => {
      const type = typeSelect.value;
      if (!type) { showToast('请选择运动类型'); return; }
      const duration = parseInt(durationInput.value);
      if (!duration || duration <= 0) { showToast('请输入运动时长'); return; }
      healthData.exercises.push({ type, customType: type === 'custom' ? (customInput?.value || '') : '', duration });
      renderExercises();
      saveData();
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
    document.querySelectorAll('.health-water-btn[data-amount]').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        healthData.water = (healthData.water || 0) + parseInt(btn.dataset.amount);
        updateWaterDisplay();
        saveData();
      });
    });
    const customBtn = document.getElementById('health-water-custom-btn');
    const customInput = document.getElementById('health-water-custom-input');
    if (customBtn && customInput) {
      _bindEvent(customBtn, 'click', () => {
        if (customInput.style.display === 'none' || !customInput.style.display) {
          customInput.style.display = ''; customInput.focus();
        } else {
          const amount = parseInt(customInput.value);
          if (amount && amount > 0) { healthData.water = (healthData.water || 0) + amount; updateWaterDisplay(); saveData(); }
          customInput.value = ''; customInput.style.display = 'none';
        }
      });
      _bindEvent(customInput, 'keydown', (e) => {
        if (e.key === 'Enter') {
          const amount = parseInt(customInput.value);
          if (amount && amount > 0) { healthData.water = (healthData.water || 0) + amount; updateWaterDisplay(); saveData(); }
          customInput.value = ''; customInput.style.display = 'none';
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
      list.innerHTML = '<div class="health-empty-state">还没有饮食记录</div>';
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
    list.querySelectorAll('.health-diet-item-delete').forEach(btn => {
      _bindEvent(btn, 'click', () => {
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
    _bindEvent(addBtn, 'click', () => {
      form.style.display = form.style.display === 'none' ? '' : 'none';
      if (form.style.display !== 'none' && contentInput) contentInput.focus();
    });
    if (cancelBtn) _bindEvent(cancelBtn, 'click', () => { form.style.display = 'none'; if (contentInput) contentInput.value = ''; });
    if (confirmBtn) _bindEvent(confirmBtn, 'click', () => {
      const meal = mealSelect?.value || 'lunch';
      const content = contentInput?.value?.trim();
      if (!content) { showToast('请输入饮食内容'); return; }
      healthData.diets.push({ meal, content });
      renderDiets();
      saveData();
      form.style.display = 'none';
      if (contentInput) contentInput.value = '';
    });
  }


  // ===== 大便记录 =====
  function fillBowelUI() {
    if (!healthData.bowel) return;
    const countInput = document.getElementById('health-bowel-count');
    const noteInput = document.getElementById('health-bowel-note');
    if (countInput) countInput.value = healthData.bowel.count || 0;
    if (noteInput) noteInput.value = healthData.bowel.note || '';
    document.querySelectorAll('#healthBowelForm .health-bowel-opt').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.val === healthData.bowel.form);
    });
    document.querySelectorAll('#healthBowelColor .health-bowel-opt').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.val === healthData.bowel.color);
    });
  }
  function bindBowelEvents() {
    const countInput = document.getElementById('health-bowel-count');
    const noteInput = document.getElementById('health-bowel-note');
    if (countInput) {
      _bindEvent(countInput, 'input', () => {
        healthData.bowel.count = parseInt(countInput.value) || 0;
        clearTimeout(saveData._bowelTimer);
        saveData._bowelTimer = setTimeout(() => saveData(), 500);
      });
    }
    if (noteInput) {
      _bindEvent(noteInput, 'input', () => {
        healthData.bowel.note = noteInput.value;
        clearTimeout(saveData._bowelTimer);
        saveData._bowelTimer = setTimeout(() => saveData(), 500);
      });
    }
    document.querySelectorAll('#healthBowelForm .health-bowel-opt').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        document.querySelectorAll('#healthBowelForm .health-bowel-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        healthData.bowel.form = btn.dataset.val;
        saveData();
      });
    });
    document.querySelectorAll('#healthBowelColor .health-bowel-opt').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        document.querySelectorAll('#healthBowelColor .health-bowel-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        healthData.bowel.color = btn.dataset.val;
        saveData();
      });
    });
  }

  // ===== 情绪打卡 =====
  async function loadMoodData() {
    try {
      const setting = await Storage.get('settings', 'health/mood');
      if (setting && setting.value) return setting.value;
    } catch (e) {}
    return { records: {}, streak: 0, lastDate: null };
  }
  async function saveMoodData(data) {
    try { await Storage.put('settings', { key: 'health/mood', value: data }); } catch (e) { console.error('[Health] 保存情绪失败:', e); }
  }
  async function initMoodCheckin() {
    const moodData = await loadMoodData();
    const streakEl = document.getElementById('healthStreakCount');
    if (streakEl) streakEl.textContent = moodData.streak || 0;
    const todayStr = formatDate(new Date());
    if (moodData.records && moodData.records[todayStr] && moodData.records[todayStr].mood) {
      const moodBtn = document.querySelector(`.health-mood-btn[data-mood="${moodData.records[todayStr].mood}"]`);
      if (moodBtn) { moodBtn.classList.add('selected'); selectedMood = moodData.records[todayStr].mood; }
      const noteEl = document.getElementById('healthMoodNote');
      if (noteEl) noteEl.value = moodData.records[todayStr].note || '';
    }
    const moodBtns = document.querySelectorAll('.health-mood-btn');
    moodBtns.forEach(btn => {
      _bindEvent(btn, 'click', () => {
        moodBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMood = btn.dataset.mood;
      });
    });
    const checkinBtn = document.getElementById('healthCheckinBtn');
    if (checkinBtn) {
      _bindEvent(checkinBtn, 'click', async () => {
        if (!selectedMood) { showToast('请先选择一个心情 😊'); return; }
        const noteEl = document.getElementById('healthMoodNote');
        const note = noteEl ? noteEl.value.trim() : '';
        const data = await loadMoodData();
        if (!data.records) data.records = {};
        const today = formatDate(new Date());
        const wasNew = !data.records[today];
        data.records[today] = { mood: selectedMood, note, time: new Date().toISOString() };
        if (wasNew) {
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
          if (data.lastDate === formatDate(yesterday)) data.streak = (data.streak || 0) + 1;
          else data.streak = 1;
          data.lastDate = today;
        }
        await saveMoodData(data);
        if (streakEl) streakEl.textContent = data.streak;
        showToast('打卡成功！' + selectedMood);
        moodBtns.forEach(b => b.classList.remove('selected'));
        selectedMood = null;
        if (noteEl) noteEl.value = '';
      });
    }
  }

  // ===== 体质辨识 =====
  let quizStep = 0;
  let quizAnswers = [];
  function initConstitution() {
    const assessBtn = document.getElementById('healthAssessBtn');
    const reassessBtn = document.getElementById('healthReassessBtn');
    if (assessBtn) _bindEvent(assessBtn, 'click', () => openQuiz());
    if (reassessBtn) _bindEvent(reassessBtn, 'click', () => openQuiz());
    const quizPrev = document.getElementById('healthQuizPrev');
    const quizNext = document.getElementById('healthQuizNext');
    const quizModal = document.getElementById('healthQuizModal');
    if (quizPrev) _bindEvent(quizPrev, 'click', quizPrevStep);
    if (quizNext) _bindEvent(quizNext, 'click', quizNextStep);
    if (quizModal) _bindEvent(quizModal, 'click', (e) => { if (e.target === quizModal) closeQuiz(); });
    loadConstitutionResult();
  }
  async function loadConstitutionResult() {
    try {
      const setting = await Storage.get('settings', 'health/constitution');
      if (setting && setting.value) showConstitutionResult(setting.value);
    } catch (e) {}
  }
  function openQuiz() {
    quizStep = 0;
    quizAnswers = new Array(QUIZ_QUESTIONS.length).fill(null);
    renderQuizStep();
    document.getElementById('healthQuizModal')?.classList.add('show');
  }
  function closeQuiz() {
    document.getElementById('healthQuizModal')?.classList.remove('show');
  }
  function renderQuizStep() {
    const q = QUIZ_QUESTIONS[quizStep];
    const progressEl = document.getElementById('healthQuizProgress');
    if (progressEl) progressEl.textContent = `第 ${quizStep + 1} 题 / 共 ${QUIZ_QUESTIONS.length} 题`;
    const options = ['从不/没有', '偶尔/有一点', '经常/比较明显', '总是/非常明显'];
    let html = `<div class="health-quiz-question"><div class="health-quiz-q-text">${q.text}</div><div class="health-quiz-options">`;
    options.forEach((opt, i) => {
      const selected = quizAnswers[quizStep] === i ? ' selected' : '';
      html += `<div class="health-quiz-opt${selected}" data-opt="${i}">${opt}</div>`;
    });
    html += '</div></div>';
    const bodyEl = document.getElementById('healthQuizBody');
    if (bodyEl) {
      bodyEl.innerHTML = html;
      bodyEl.querySelectorAll('.health-quiz-opt').forEach(el => {
        _bindEvent(el, 'click', () => {
          quizAnswers[quizStep] = parseInt(el.dataset.opt);
          renderQuizStep();
        });
      });
    }
    const prevBtn = document.getElementById('healthQuizPrev');
    const nextBtn = document.getElementById('healthQuizNext');
    if (prevBtn) prevBtn.style.display = quizStep === 0 ? 'none' : 'block';
    if (nextBtn) {
      nextBtn.textContent = quizStep === QUIZ_QUESTIONS.length - 1 ? '查看结果' : '下一步';
      nextBtn.disabled = quizAnswers[quizStep] === null;
      nextBtn.style.opacity = quizAnswers[quizStep] === null ? '0.5' : '1';
    }
  }
  function quizPrevStep() {
    if (quizStep > 0) { quizStep--; renderQuizStep(); }
  }
  function quizNextStep() {
    if (quizAnswers[quizStep] === null) return;
    if (quizStep < QUIZ_QUESTIONS.length - 1) { quizStep++; renderQuizStep(); }
    else { closeQuiz(); finishQuiz(); }
  }
  function finishQuiz() {
    const scores = {};
    QUIZ_QUESTIONS.forEach((q, i) => {
      const answer = quizAnswers[i];
      if (answer !== null && answer > 0) {
        const typeKey = QUIZ_TYPE_MAP[q.type];
        if (!scores[typeKey]) scores[typeKey] = 0;
        scores[typeKey] += answer;
      }
    });
    let bestType = 'pinghe';
    let bestScore = 0;
    for (const [k, v] of Object.entries(scores)) {
      if (v > bestScore) { bestScore = v; bestType = k; }
    }
    if (bestScore === 0) bestType = 'pinghe';
    const ct = CONSTITUTION_TYPES[bestType];
    const radarScores = ct.scores;
    const result = { type: bestType, name: ct.name, desc: ct.desc, advice: ct.advice, scores: radarScores, date: new Date().toISOString() };
    Storage.put('settings', { key: 'health/constitution', value: result }).catch(() => {});
    showConstitutionResult(result);
    showToast('体质评估完成 🧬');
  }
  function showConstitutionResult(result) {
    const placeholder = document.getElementById('healthConstitutionPlaceholder');
    const resultEl = document.getElementById('healthConstitutionResult');
    if (placeholder) placeholder.style.display = 'none';
    if (resultEl) resultEl.classList.add('show');
    const nameEl = document.getElementById('healthConstTypeName');
    const descEl = document.getElementById('healthConstTypeDesc');
    const adviceEl = document.getElementById('healthConstAdvice');
    if (nameEl) nameEl.textContent = result.name;
    if (descEl) descEl.textContent = result.desc;
    if (adviceEl) adviceEl.textContent = result.advice;
    renderRadarChart(result.scores);
  }
  function renderRadarChart(scores) {
    const container = document.getElementById('healthRadarChart');
    if (!container) return;
    const dims = [
      { key: 'qi', label: '气', angle: -90 },
      { key: 'blood', label: '血', angle: -30 },
      { key: 'yin', label: '阴', angle: 30 },
      { key: 'yang', label: '阳', angle: 90 },
      { key: 'phlegm', label: '痰', angle: 150 },
      { key: 'damp', label: '湿', angle: 210 }
    ];
    const cx = 100, cy = 100, maxR = 70;
    let html = '<svg width="200" height="200" viewBox="0 0 200 200" style="overflow:visible;">';
    // rings
    for (let i = 1; i <= 3; i++) {
      const r = maxR * i / 3;
      html += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border-color)" stroke-width="0.5"/>`;
    }
    // axes
    dims.forEach(d => {
      const rad = (d.angle * Math.PI) / 180;
      const x = cx + Math.cos(rad) * maxR;
      const y = cy + Math.sin(rad) * maxR;
      html += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border-color)" stroke-width="0.5"/>`;
    });
    // polygon
    const points = dims.map(d => {
      const val = (scores[d.key] || 0) / 3;
      const r = maxR * Math.max(val, 0.15);
      const rad = (d.angle * Math.PI) / 180;
      const x = cx + Math.cos(rad) * r;
      const y = cy + Math.sin(rad) * r;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    html += `<polygon points="${points}" fill="rgba(232,168,124,0.2)" stroke="var(--accent)" stroke-width="2"/>`;
    // points
    dims.forEach(d => {
      const val = (scores[d.key] || 0) / 3;
      const r = maxR * Math.max(val, 0.15);
      const rad = (d.angle * Math.PI) / 180;
      const x = cx + Math.cos(rad) * r;
      const y = cy + Math.sin(rad) * r;
      html += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--accent)"/>`;
    });
    // labels
    dims.forEach(d => {
      const rad = (d.angle * Math.PI) / 180;
      const lx = cx + Math.cos(rad) * (maxR + 14);
      const ly = cy + Math.sin(rad) * (maxR + 14);
      html += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="var(--text-secondary)" font-weight="500">${d.label}</text>`;
    });
    html += '</svg>';
    container.innerHTML = html;
  }

  // ===== 子午流注 =====
  function getCurrentShichen() {
    const h = new Date().getHours();
    if (h >= 23 || h < 1) return 0;
    return Math.floor((h + 1) / 2);
  }
  function renderShichen() {
    const current = getCurrentShichen();
    const sc = SHICHEN_DATA[current];
    const nameEl = document.getElementById('healthShichenName');
    const organEl = document.getElementById('healthShichenOrgan');
    const tipEl = document.getElementById('healthShichenTip');
    const timelineEl = document.getElementById('healthShichenTimeline');
    if (nameEl) nameEl.textContent = sc.name + '时';
    if (organEl) organEl.textContent = sc.organ + ' · 当令';
    if (tipEl) tipEl.innerHTML = '💡 ' + sc.name + '时（' + sc.time + '点）为' + sc.organ + '当令。' + sc.tip;
    if (timelineEl) {
      timelineEl.innerHTML = '';
      SHICHEN_DATA.forEach((s, i) => {
        const slot = document.createElement('div');
        slot.className = 'health-shichen-slot' + (i === current ? ' active' : '');
        slot.innerHTML = `<div class="sc-name">${s.name}</div><div class="sc-dot"></div>`;
        timelineEl.appendChild(slot);
      });
    }
  }
  function initShichen() {
    renderShichen();
    _shichenTimer = setInterval(renderShichen, 60000);
    _intervals.push(_shichenTimer);
  }

  // ===== 食疗方 =====
  let _teaFilter = 'all';
  let _teaShowAll = false;
  function initTea() {
    renderTea(false);
    const viewAllBtn = document.getElementById('healthTeaViewAll');
    if (viewAllBtn) {
      _bindEvent(viewAllBtn, 'click', () => {
        _teaShowAll = !_teaShowAll;
        renderTea(_teaShowAll);
        viewAllBtn.textContent = _teaShowAll ? '收起 ←' : '查看全部食疗方 →';
      });
    }
    const filterContainer = document.getElementById('healthTeaFilter');
    if (filterContainer) {
      filterContainer.querySelectorAll('.health-tea-filter-btn').forEach(btn => {
        _bindEvent(btn, 'click', () => {
          filterContainer.querySelectorAll('.health-tea-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _teaFilter = btn.dataset.filter;
          renderTea(_teaShowAll);
        });
      });
    }
  }
  async function renderTea(showAll) {
    const list = document.getElementById('healthTeaList');
    if (!list) return;
    const season = getSeason();
    let constitution = null;
    try {
      const setting = await Storage.get('settings', 'health/constitution');
      if (setting && setting.value) constitution = setting.value.type;
    } catch (e) {}
    let recipes = TEA_RECIPES;
    if (_teaFilter !== 'all') {
      recipes = recipes.filter(r => r.category === _teaFilter);
    }
    const catLabel = { tea: '🍵 茶饮', porridge: '🍲 粥品', soup: '🥣 汤品' };
    const scored = recipes.map(tea => {
      let score = 0;
      if (constitution && tea.constitutions.includes(constitution)) score += 2;
      if (tea.seasons.includes(season)) score += 1;
      return { tea, score };
    }).sort((a, b) => b.score - a.score);
    const display = showAll ? scored : scored.slice(0, 3);
    list.innerHTML = display.map(({ tea }) => {
      const tags = [];
      if (tea.category) tags.push(`<span class="health-tea-tag">${catLabel[tea.category] || ''}</span>`);
      if (constitution && tea.constitutions.includes(constitution)) tags.push('<span class="health-tea-tag">适合体质</span>');
      if (tea.seasons.includes(season)) tags.push('<span class="health-tea-tag">当季</span>');
      return `<div class="health-tea-item">
        <div class="health-tea-name">${tea.name} ${tags.join('')}</div>
        <div class="health-tea-recipe">📋 ${tea.recipe}</div>
        <div class="health-tea-effect">✨ ${tea.effect}</div>
        <div class="health-tea-brew">🫖 ${tea.brew}</div>
      </div>`;
    }).join('');
  }

  // ===== 护嗓穴位 =====
  function initAcupoints() {
    renderAcupointSvg();
    renderAcupointList();
  }
  function renderAcupointSvg() {
    const container = document.getElementById('healthAcupointSvg');
    if (!container) return;
    // 简易人体轮廓 (穴位太多，SVG只做展示，不再标记具体点位)
    let html = '<svg width="120" height="260" viewBox="0 0 120 260">';
    html += '<ellipse cx="60" cy="30" rx="20" ry="24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"/>';
    html += '<line x1="60" y1="54" x2="60" y2="60" stroke="var(--text-muted)" stroke-width="1.5"/>';
    html += '<path d="M 30 62 Q 60 58 90 62 L 88 130 Q 60 135 32 130 Z" fill="none" stroke="var(--text-muted)" stroke-width="1.5"/>';
    html += '<line x1="30" y1="68" x2="18" y2="120" stroke="var(--text-muted)" stroke-width="1.5"/>';
    html += '<line x1="90" y1="68" x2="102" y2="120" stroke="var(--text-muted)" stroke-width="1.5"/>';
    html += '<line x1="40" y1="130" x2="35" y2="230" stroke="var(--text-muted)" stroke-width="1.5"/>';
    html += '<line x1="80" y1="130" x2="85" y2="230" stroke="var(--text-muted)" stroke-width="1.5"/>';
    html += '<text x="60" y="135" text-anchor="middle" font-size="10" fill="var(--text-muted)">经络穴位图</text>';
    html += '<text x="60" y="150" text-anchor="middle" font-size="9" fill="var(--text-muted)">点击右侧穴位</text>';
    html += '<text x="60" y="163" text-anchor="middle" font-size="9" fill="var(--text-muted)">开始按揉计时</text>';
    html += '</svg>';
    container.innerHTML = html;
  }
  function renderAcupointList() {
    const container = document.getElementById('healthAcupointList');
    if (!container) return;
    const parts = ['头颈部', '上肢', '下肢', '躯干'];
    const partIcons = { '头颈部': '🧑', '上肢': '💪', '下肢': '🦵', '躯干': '🫁' };
    let html = '';
    let idx = 0;
    parts.forEach(part => {
      const points = ACUPOINTS.filter(a => a.bodyPart === part);
      if (points.length === 0) return;
      html += `<div class="health-acupoint-group-title">${partIcons[part] || ''} ${part}</div>`;
      points.forEach(ap => {
        idx++;
        html += `<div class="health-acupoint-item" data-id="${ap.id}">
          <div class="health-acupoint-name">${idx}. ${ap.name}</div>
          <div class="health-acupoint-loc">📍 ${escapeHtml(ap.loc)}</div>
          <div class="health-acupoint-fn">✨ ${escapeHtml(ap.fn)}</div>
          <div class="health-acupoint-timer-hint">👉 点击开始按揉计时</div>
        </div>`;
      });
    });
    container.innerHTML = html;
    container.querySelectorAll('.health-acupoint-item').forEach(item => {
      _bindEvent(item, 'click', () => {
        const ap = ACUPOINTS.find(a => a.id === item.dataset.id);
        if (ap) openAcupointTimer(ap);
      });
    });
  }
  function openAcupointTimer(ap) {
    const modal = document.getElementById('healthAcupointTimerModal');
    const titleEl = document.getElementById('healthTimerTitle');
    const infoEl = document.getElementById('healthTimerAcupointInfo');
    if (titleEl) titleEl.textContent = '🤲 ' + ap.name + ' 按揉计时';
    if (infoEl) infoEl.innerHTML = `📍 ${ap.loc}<br>✨ ${ap.fn}<br>📝 ${ap.detail}`;
    resetTimer();
    if (modal) modal.classList.add('show');
  }
  function resetTimer() {
    _timerState.running = false;
    _timerState.remaining = 0;
    _timerState.total = 0;
    if (_timerState.intervalId) { clearInterval(_timerState.intervalId); _timerState.intervalId = null; }
    const display = document.getElementById('healthTimerDisplay');
    if (display) display.textContent = '00:00';
    const startBtn = document.getElementById('healthTimerStart');
    const stopBtn = document.getElementById('healthTimerStop');
    if (startBtn) startBtn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
    document.querySelectorAll('.health-timer-preset').forEach(b => b.classList.remove('selected'));
  }
  function initTimerEvents() {
    const startBtn = document.getElementById('healthTimerStart');
    const stopBtn = document.getElementById('healthTimerStop');
    const closeBtn = document.getElementById('healthTimerClose');
    const modal = document.getElementById('healthAcupointTimerModal');
    document.querySelectorAll('.health-timer-preset').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        document.querySelectorAll('.health-timer-preset').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _timerState.remaining = parseInt(btn.dataset.seconds);
        _timerState.total = _timerState.remaining;
        updateTimerDisplay();
      });
    });
    if (startBtn) _bindEvent(startBtn, 'click', () => {
      if (_timerState.remaining <= 0) { showToast('请先选择计时时长'); return; }
      _timerState.running = true;
      startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = '';
      _timerState.intervalId = setInterval(() => {
        _timerState.remaining--;
        updateTimerDisplay();
        if (_timerState.remaining <= 0) {
          clearInterval(_timerState.intervalId);
          _timerState.intervalId = null;
          _timerState.running = false;
          startBtn.style.display = '';
          if (stopBtn) stopBtn.style.display = 'none';
          showToast('⏰ 按揉时间到！干得好 👍');
        }
      }, 1000);
      _intervals.push(_timerState.intervalId);
    });
    if (stopBtn) _bindEvent(stopBtn, 'click', () => {
      _timerState.running = false;
      if (_timerState.intervalId) { clearInterval(_timerState.intervalId); _timerState.intervalId = null; }
      stopBtn.style.display = 'none';
      if (startBtn) startBtn.style.display = '';
    });
    if (closeBtn) _bindEvent(closeBtn, 'click', () => {
      resetTimer();
      if (modal) modal.classList.remove('show');
    });
    if (modal) _bindEvent(modal, 'click', (e) => { if (e.target === modal) { resetTimer(); modal.classList.remove('show'); } });
  }
  function updateTimerDisplay() {
    const display = document.getElementById('healthTimerDisplay');
    if (!display) return;
    const m = Math.floor(_timerState.remaining / 60);
    const s = _timerState.remaining % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ===== 望诊自测（v115 升级版：六维度 Tab + 综合辨证）=====
  // 所有维度的扁平化选择状态：{ spirit: {eyeSpirit:'', expression:'', ...}, complexion: {...}, ... }
  let tongueSelections = {};
  let currentTongueTab = 'spirit';
  function _initTongueSelections() {
    tongueSelections = {};
    TONGUE_TABS.forEach(tab => {
      tongueSelections[tab.key] = {};
      tab.dims.forEach(dim => { tongueSelections[tab.key][dim.key] = null; });
    });
  }
  function initTongueDiagnosis() {
    _initTongueSelections();
    renderTongueTabs();
    renderTongueTabContent(currentTongueTab);
    const saveBtn = document.getElementById('healthTongueSaveBtn');
    if (saveBtn) _bindEvent(saveBtn, 'click', saveTongueRecord);
    loadTongueHistory();
  }
  function renderTongueTabs() {
    const tabsEl = document.getElementById('healthTongueTabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = TONGUE_TABS.map(tab =>
      `<button class="health-tongue-tab ${tab.key === currentTongueTab ? 'active' : ''}" data-tab="${tab.key}">
        <span class="health-tongue-tab-icon">${tab.icon}</span>${tab.label}
      </button>`
    ).join('');
    tabsEl.querySelectorAll('.health-tongue-tab').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        currentTongueTab = btn.dataset.tab;
        renderTongueTabs();
        renderTongueTabContent(currentTongueTab);
      });
    });
  }
  function renderTongueTabContent(tabKey) {
    const contentEl = document.getElementById('healthTongueContent');
    const tabConfig = TONGUE_TABS.find(t => t.key === tabKey);
    if (!contentEl || !tabConfig) return;
    contentEl.innerHTML = tabConfig.dims.map(dim => `
      <div class="health-tongue-section">
        <div class="health-tongue-dim-label">${dim.label}</div>
        <div class="health-tongue-options" data-dim="${dim.key}" data-tab="${tabKey}"></div>
        <div class="health-tongue-interpret" id="tongueInterpret_${tabKey}_${dim.key}" style="display:none;"></div>
      </div>
    `).join('');
    // 渲染每个维度的选项
    tabConfig.dims.forEach(dim => {
      const data = TONGUE_DIAGNOSIS_DATA[tabKey][dim.key];
      const container = contentEl.querySelector(`[data-dim="${dim.key}"][data-tab="${tabKey}"]`);
      if (!container) return;
      container.innerHTML = data.map(item =>
        `<div class="health-tongue-opt ${tongueSelections[tabKey][dim.key] === item.val ? 'selected' : ''}" data-val="${item.val}">${item.label}</div>`
      ).join('');
      container.querySelectorAll('.health-tongue-opt').forEach(el => {
        _bindEvent(el, 'click', () => {
          container.querySelectorAll('.health-tongue-opt').forEach(o => o.classList.remove('selected'));
          el.classList.add('selected');
          tongueSelections[tabKey][dim.key] = el.dataset.val;
          // 显示解读
          const interpretEl = document.getElementById(`tongueInterpret_${tabKey}_${dim.key}`);
          const itemData = data.find(d => d.val === el.dataset.val);
          if (interpretEl && itemData) {
            interpretEl.innerHTML = `<div class="health-tongue-interpret-inner">💡 ${escapeHtml(itemData.interpret)}</div>`;
            interpretEl.style.display = 'block';
          }
          updateTongueResult();
        });
      });
      // 如果已有选择，显示解读
      if (tongueSelections[tabKey][dim.key]) {
        const itemData = data.find(d => d.val === tongueSelections[tabKey][dim.key]);
        const interpretEl = document.getElementById(`tongueInterpret_${tabKey}_${dim.key}`);
        if (interpretEl && itemData) {
          interpretEl.innerHTML = `<div class="health-tongue-interpret-inner">💡 ${escapeHtml(itemData.interpret)}</div>`;
          interpretEl.style.display = 'block';
        }
      }
    });
  }
  function _countSelectedDims() {
    let count = 0;
    TONGUE_TABS.forEach(tab => {
      tab.dims.forEach(dim => {
        if (tongueSelections[tab.key][dim.key]) count++;
      });
    });
    return count;
  }
  function updateTongueResult() {
    const resultEl = document.getElementById('healthTongueResult');
    const saveBtn = document.getElementById('healthTongueSaveBtn');
    const selectedCount = _countSelectedDims();
    if (selectedCount < 3) {
      if (resultEl) { resultEl.innerHTML = ''; resultEl.classList.remove('show'); }
      if (saveBtn) saveBtn.style.display = 'none';
      return;
    }
    // 综合判断
    const diagnosis = generateComprehensiveDiagnosis(tongueSelections);
    let html = '';
    if (diagnosis.patterns.length === 0) {
      html += `<div class="health-tongue-comprehensive">
        <div class="health-tongue-comp-title">📋 综合判断</div>
        <div class="health-tongue-comp-item">✨ ${escapeHtml(diagnosis.normal.interpretation)}</div>
        <div class="health-tongue-comp-item" style="margin-top:6px;"><strong>建议：</strong>${escapeHtml(diagnosis.normal.suggest)}</div>
      </div>`;
    } else {
      diagnosis.patterns.forEach(p => {
        html += `<div class="health-tongue-comprehensive">
          <div class="health-tongue-comp-title">🔍 ${escapeHtml(p.name)}（匹配度 ${p.matchScore}/${p.maxScore}）</div>
          <div class="health-tongue-comp-item"><strong>解读：</strong>${escapeHtml(p.interpretation)}</div>
          <div class="health-tongue-comp-item" style="margin-top:4px;"><strong>调理方向：</strong>${escapeHtml(p.suggest)}</div>
          ${p.foods && p.foods.length ? `<div class="health-tongue-comp-item" style="margin-top:4px;"><strong>🥗 推荐食材：</strong>${p.foods.map(f => escapeHtml(f)).join('、')}</div>` : ''}
          ${p.acupoints && p.acupoints.length ? `<div class="health-tongue-comp-item" style="margin-top:4px;"><strong>📍 推荐穴位：</strong>${p.acupoints.map(a => escapeHtml(a)).join('、')}</div>` : ''}
          ${p.tea ? `<div class="health-tongue-comp-item" style="margin-top:4px;"><strong>🍵 推荐茶饮：</strong>${escapeHtml(p.tea)}</div>` : ''}
        </div>`;
      });
    }
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;text-align:center;">⚠️ 望诊仅供参考，如有不适请咨询专业中医师。</div>';
    if (resultEl) { resultEl.innerHTML = html; resultEl.classList.add('show'); }
    if (saveBtn) saveBtn.style.display = '';
  }
  function generateComprehensiveDiagnosis(sel) {
    const matchedPatterns = [];
    DIAGNOSIS_LOGIC.patterns.forEach(pattern => {
      const { any, minMatch } = pattern.conditions;
      let matchCount = 0;
      let maxScore = any.length;
      any.forEach(conditionGroup => {
        // conditionGroup: { tabKey: { dimKey: [val1, val2] } } 只要任一维度命中即算此组匹配
        let groupHit = false;
        for (const tabKey in conditionGroup) {
          const dims = conditionGroup[tabKey];
          for (const dimKey in dims) {
            const validVals = dims[dimKey];
            const userVal = sel[tabKey] && sel[tabKey][dimKey];
            if (userVal && validVals.includes(userVal)) {
              groupHit = true;
              break;
            }
          }
          if (groupHit) break;
        }
        if (groupHit) matchCount++;
      });
      if (matchCount >= minMatch) {
        matchedPatterns.push({
          ...pattern,
          matchScore: matchCount,
          maxScore: maxScore
        });
      }
    });
    // 按匹配度降序
    matchedPatterns.sort((a, b) => (b.matchScore / b.maxScore) - (a.matchScore / a.maxScore));
    return {
      patterns: matchedPatterns.slice(0, 3),
      normal: DIAGNOSIS_LOGIC.normalResult
    };
  }
  async function saveTongueRecord() {
    const record = { ..._deepClone(tongueSelections), date: new Date().toISOString(), v: 2 };
    try {
      const setting = await Storage.get('settings', 'health/tongue');
      let history = (setting && setting.value) || [];
      history.unshift(record);
      if (history.length > 20) history = history.slice(0, 20);
      await Storage.put('settings', { key: 'health/tongue', value: history });
      showToast('望诊记录已保存 💾');
      loadTongueHistory();
    } catch (e) { showToast('保存失败'); }
  }
  function _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  async function loadTongueHistory() {
    const container = document.getElementById('healthTongueHistory');
    if (!container) return;
    try {
      const setting = await Storage.get('settings', 'health/tongue');
      const history = (setting && setting.value) || [];
      if (history.length === 0) { container.innerHTML = '<div class="health-empty-state">暂无望诊记录</div>'; return; }
      container.innerHTML = history.slice(0, 5).map(r => {
        const d = new Date(r.date);
        const ds = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        // v2 新版记录：展示前3个关键维度
        let summary = '';
        if (r.v === 2) {
          const parts = [];
          if (r.complexion && r.complexion.faceColor) {
            const item = TONGUE_DIAGNOSIS_DATA.complexion.faceColor.find(c => c.val === r.complexion.faceColor);
            if (item) parts.push(`面色:${item.label}`);
          }
          if (r.tongue && r.tongue.color) {
            const item = TONGUE_DIAGNOSIS_DATA.tongue.color.find(c => c.val === r.tongue.color);
            if (item) parts.push(`舌色:${item.label}`);
          }
          if (r.spirit && r.spirit.energy) {
            const item = TONGUE_DIAGNOSIS_DATA.spirit.energy.find(c => c.val === r.spirit.energy);
            if (item) parts.push(`精力:${item.label}`);
          }
          if (r.bodyShape && r.bodyShape.bodyType) {
            const item = TONGUE_DIAGNOSIS_DATA.bodyShape.bodyType.find(c => c.val === r.bodyShape.bodyType);
            if (item) parts.push(`体型:${item.label}`);
          }
          summary = parts.join(' · ') || '已完成望诊';
        } else {
          // v1 旧版记录兼容
          const faceMap = {}, colorMap = {}, coatingMap = {}, shapeMap = {};
          TONGUE_DATA.faceColor.forEach(c => faceMap[c.val] = c.label);
          TONGUE_DATA.color.forEach(c => colorMap[c.val] = c.label);
          TONGUE_DATA.coating.forEach(c => coatingMap[c.val] = c.label);
          TONGUE_DATA.shape.forEach(c => shapeMap[c.val] = c.label);
          summary = `面色: ${faceMap[r.faceColor] || '—'} · 舌色: ${colorMap[r.color] || '—'} · 舌苔: ${coatingMap[r.coating] || '—'} · 舌形: ${shapeMap[r.shape] || '—'}`;
        }
        return `<div class="health-tongue-history-item"><div class="th-date">${ds}</div>${escapeHtml(summary)}</div>`;
      }).join('');
    } catch (e) { console.error('[Health] 加载望诊历史失败:', e); }
  }

  // ===== 功法引导 =====
  function initQigong() {
    const tabs = document.querySelectorAll('.health-qigong-tab');
    tabs.forEach(tab => {
      _bindEvent(tab, 'click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.health-qigong-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('healthQg' + (tab.dataset.qg === 'breathing' ? 'Breathing' : tab.dataset.qg === 'sixsounds' ? 'SixSounds' : 'Baduanjin'));
        if (panel) panel.classList.add('active');
      });
    });
    renderSixSounds();
    renderBaDuanJin();
    const startBtn = document.getElementById('healthBreathingStartBtn');
    if (startBtn) _bindEvent(startBtn, 'click', startBreathing);
  }
  function renderSixSounds() {
    const container = document.getElementById('healthQgSixSounds');
    if (!container) return;
    container.innerHTML = SIX_SOUNDS.map(s => `
      <div class="health-qigong-item">
        <div class="health-qigong-item-name">「${s.char}」— ${s.pinyin} · 对应${s.organ}</div>
        <div class="health-qigong-item-desc">${s.method}</div>
        <div class="health-qigong-item-effect">✨ ${s.effect}</div>
      </div>
    `).join('');
  }
  function renderBaDuanJin() {
    const container = document.getElementById('healthQgBaduanjin');
    if (!container) return;
    container.innerHTML = BA_DUAN_JIN.map(b => `
      <div class="health-qigong-item">
        <div class="health-qigong-item-name">${b.name}</div>
        <div class="health-qigong-item-desc">${b.desc}</div>
        <div class="health-qigong-item-effect">✨ ${b.effect}</div>
      </div>
    `).join('');
  }
  function startBreathing() {
    if (_breathingState.running) return;
    _breathingState.running = true;
    _breathingState.cycle = 0;
    _breathingState.step = 0;
    const circle = document.getElementById('healthBreathingCircle');
    const text = document.getElementById('healthBreathingText');
    const cycleEl = document.getElementById('healthBreathingCycle');
    const startBtn = document.getElementById('healthBreathingStartBtn');
    if (startBtn) startBtn.textContent = '⏸ 训练中...';
    function runStep() {
      if (!_breathingState.running) return;
      if (_breathingState.cycle >= 5) {
        _breathingState.running = false;
        if (circle) circle.className = 'health-breathing-circle';
        if (text) text.textContent = '完成 🎉';
        if (cycleEl) cycleEl.textContent = '5 / 5 循环完成！';
        if (startBtn) startBtn.textContent = '▶ 再来一次';
        showToast('呼吸训练完成！身心舒畅 🧘');
        return;
      }
      const phases = [
        { name: '吸气', cls: 'inhale', duration: 4000 },
        { name: '屏息', cls: 'hold', duration: 4000 },
        { name: '呼气', cls: 'exhale', duration: 6000 }
      ];
      const phase = phases[_breathingState.step];
      if (circle) circle.className = 'health-breathing-circle ' + phase.cls;
      if (text) text.textContent = phase.name;
      if (cycleEl) cycleEl.textContent = `第 ${_breathingState.cycle + 1} / 5 循环`;
      _breathingState.step++;
      if (_breathingState.step >= 3) { _breathingState.step = 0; _breathingState.cycle++; }
      const t = setTimeout(runStep, phase.duration);
      _timeouts.push(t);
    }
    runStep();
  }

  // ===== 症状自查 =====
  let symptomState = { part: null, symptoms: new Set(), supplements: {}, step: 1 };
  function initSymptomCheck() {
    renderBodyGrid();
    const back1 = document.getElementById('healthStepBack1');
    const back2 = document.getElementById('healthStepBack2');
    const nextBtn = document.getElementById('healthSymptomNext');
    const analyzeBtn = document.getElementById('healthAnalyzeBtn');
    const restartBtn = document.getElementById('healthRestartBtn');
    if (back1) _bindEvent(back1, 'click', () => goToStep(1));
    if (back2) _bindEvent(back2, 'click', () => goToStep(2));
    if (nextBtn) _bindEvent(nextBtn, 'click', () => {
      if (symptomState.symptoms.size === 0) { showToast('请至少选择一个症状'); return; }
      renderSupplementGrid();
      goToStep(3);
    });
    const followupSubmitBtn = document.getElementById('healthFollowupSubmitBtn');
    const followupSkipBtn = document.getElementById('healthFollowupSkipBtn');
    
    if (analyzeBtn) _bindEvent(analyzeBtn, 'click', async () => {
      symptomState.followUpDone = false;
      symptomState.followUpAnswered = new Set();
      await analyzeSymptoms();
      goToStep(4);
    });
    
    if (followupSubmitBtn) _bindEvent(followupSubmitBtn, 'click', async () => {
      // Collect follow-up answers
      const answers = collectFollowUpAnswers();
      const selected = [...symptomState.symptoms];
      answers.forEach(a => {
        if (a.answer && !selected.includes(a.symptom)) {
          selected.push(a.symptom);
          symptomState.symptoms.add(a.symptom);
        }
        if (!symptomState.followUpAnswered) symptomState.followUpAnswered = new Set();
        symptomState.followUpAnswered.add(a.symptom);
      });
      symptomState.followUpDone = true;
      
      // Recalculate with updated symptoms
      const newResults = recalculateResults(selected);
      const top = newResults.slice(0, 2);
      const qiBloodAnalysis = analyzeQiBlood(selected);
      
      // Show result panel, hide follow-up
      const followupPanel = document.getElementById('healthFollowupPanel');
      const resultPanel = document.getElementById('healthResultPanel');
      if (followupPanel) followupPanel.style.display = 'none';
      if (resultPanel) resultPanel.style.display = 'block';
      document.getElementById('healthRestartBtn').style.display = '';
      
      await renderResult(top, selected, qiBloodAnalysis);
      saveSymptomHistory(top, selected);
    });
    
    if (followupSkipBtn) _bindEvent(followupSkipBtn, 'click', async () => {
      symptomState.followUpDone = true;
      const top = symptomState.preAnalysisTop || [];
      const selected = [...symptomState.symptoms];
      const qiBloodAnalysis = analyzeQiBlood(selected);
      
      const followupPanel = document.getElementById('healthFollowupPanel');
      const resultPanel = document.getElementById('healthResultPanel');
      if (followupPanel) followupPanel.style.display = 'none';
      if (resultPanel) resultPanel.style.display = 'block';
      document.getElementById('healthRestartBtn').style.display = '';
      
      await renderResult(top, selected, qiBloodAnalysis);
      saveSymptomHistory(top, selected);
    });
    
    if (restartBtn) _bindEvent(restartBtn, 'click', () => {
      symptomState = { part: null, symptoms: new Set(), supplements: {}, step: 1 };
      document.querySelectorAll('.health-body-part').forEach(p => p.classList.remove('selected'));
      goToStep(1);
    });
    loadSymptomHistory();
  }
  function renderBodyGrid() {
    const grid = document.getElementById('healthBodyGrid');
    if (!grid) return;
    grid.innerHTML = Object.entries(SYMPTOM_DATA).map(([key, val]) => `
      <div class="health-body-part" data-part="${key}">
        <div class="bp-icon">${val.icon}</div>
        <div class="bp-label">${val.name}</div>
      </div>
    `).join('');
    grid.querySelectorAll('.health-body-part').forEach(el => {
      _bindEvent(el, 'click', () => {
        grid.querySelectorAll('.health-body-part').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
        symptomState.part = el.dataset.part;
        symptomState.symptoms.clear();
        renderSymptomList();
        goToStep(2);
      });
    });
  }
  function renderSymptomList() {
    const promptEl = document.getElementById('healthSymptomPrompt');
    const listEl = document.getElementById('healthSymptomList');
    if (!promptEl || !listEl || !symptomState.part) return;
    const partData = SYMPTOM_DATA[symptomState.part];
    promptEl.textContent = `${partData.name} — 请勾选具体症状：`;
    listEl.innerHTML = partData.symptoms.map(sym => `
      <div class="health-symptom-item" data-sym="${escapeHtml(sym)}">
        <div class="health-symptom-checkbox"></div>
        <div class="health-symptom-text">${sym}</div>
      </div>
    `).join('');
    listEl.querySelectorAll('.health-symptom-item').forEach(item => {
      _bindEvent(item, 'click', () => {
        item.classList.toggle('checked');
        const sym = item.dataset.sym;
        if (item.classList.contains('checked')) symptomState.symptoms.add(sym);
        else symptomState.symptoms.delete(sym);
      });
    });
  }
  function renderSupplementGrid() {
    const grid = document.getElementById('healthSupplementGrid');
    if (!grid) return;
    grid.innerHTML = SUPPLEMENT_DATA.map(dim => `
      <div class="health-supplement-item">
        <div class="health-supplement-label">${dim.label}</div>
        <div class="health-supplement-options">
          ${dim.options.map(opt => `<button class="health-supplement-opt" data-key="${dim.key}" data-val="${escapeHtml(opt)}">${opt}</button>`).join('')}
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('.health-supplement-opt').forEach(btn => {
      _bindEvent(btn, 'click', () => {
        const key = btn.dataset.key;
        const parent = btn.closest('.health-supplement-options');
        parent.querySelectorAll('.health-supplement-opt').forEach(o => o.classList.remove('selected'));
        btn.classList.add('selected');
        symptomState.supplements[key] = btn.dataset.val;
      });
    });
  }
  function goToStep(step) {
    symptomState.step = step;
    for (let i = 1; i <= 4; i++) {
      const dot = document.getElementById('healthStepDot' + i);
      if (dot) { dot.classList.remove('active', 'done'); if (i < step) dot.classList.add('done'); else if (i === step) dot.classList.add('active'); }
    }
    for (let i = 1; i <= 3; i++) {
      const line = document.getElementById('healthStepLine' + i);
      if (line) line.classList.toggle('done', i < step);
    }
    document.querySelectorAll('.health-step-panel').forEach((p, i) => p.classList.toggle('active', i + 1 === step));
  }
  async function analyzeSymptoms() {
    const selected = [...symptomState.symptoms];
    const supplements = symptomState.supplements;
    // Add supplement symptoms to matching
    const supplementSymptomMap = {
      sleep: { '入睡困难': '失眠多梦', '多梦易醒': '失眠多梦', '嗜睡': '疲倦乏力' },
      diet: { '食欲不振': '食欲不振', '食欲亢进': '食欲亢进', '口干口渴': '口干口渴' },
      emotion: { '烦躁易怒': '心烦易怒', '低落抑郁': '抑郁寡欢', '焦虑紧张': '焦虑不安' },
      excretion: { '便秘': '便秘', '腹泻': '腹泻', '尿频尿急': '尿频尿急' }
    };
    Object.entries(supplements).forEach(([key, val]) => {
      const mapped = supplementSymptomMap[key]?.[val];
      if (mapped && !selected.includes(mapped)) selected.push(mapped);
    });
    // Calculate match scores with confidence scoring (H1) + evidence chain (H2)
    const results = SYNDROME_TYPES.map(syn => {
      let totalWeight = 0, matchedWeight = 0;
      const matchedSymptoms = [];
      const unmatchedSymptoms = [];
      const coreSymptoms = [];
      const secondarySymptoms = [];
      
      for (const [sym, weight] of Object.entries(syn.symptoms)) {
        if (weight > 0) {
          totalWeight += weight;
          if (selected.includes(sym)) {
            matchedWeight += weight;
            matchedSymptoms.push({ name: sym, weight });
            if (weight >= 2) coreSymptoms.push(sym);
            else secondarySymptoms.push(sym);
          } else {
            unmatchedSymptoms.push({ name: sym, weight });
          }
        }
      }
      
      const matchPct = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
      const matchedCount = matchedSymptoms.length;
      const totalSymptomCount = Object.values(syn.symptoms).filter(w => w > 0).length;
      
      // H1: Confidence scoring algorithm
      // Factors: match ratio (40%), core symptom coverage (30%), symptom count (20%), specificity (10%)
      const matchRatioScore = (matchedWeight / Math.max(totalWeight, 1)) * 100;
      const coreCoverageScore = totalSymptomCount > 0 ? (coreSymptoms.length / Math.max(totalSymptomCount * 0.5, 1)) * 100 : 0;
      const countScore = matchedCount >= 4 ? 100 : matchedCount >= 3 ? 75 : matchedCount >= 2 ? 50 : 25;
      // Specificity: higher weight symptoms matched = more specific
      const avgWeight = matchedCount > 0 ? matchedWeight / matchedCount : 0;
      const specificityScore = Math.min(100, (avgWeight / 2.5) * 100);
      
      const confidenceScore = Math.round(
        matchRatioScore * 0.4 +
        Math.min(coreCoverageScore, 100) * 0.3 +
        countScore * 0.2 +
        specificityScore * 0.1
      );
      
      let confidenceLevel, confidenceLabel;
      if (confidenceScore >= 80) { confidenceLevel = 'high'; confidenceLabel = '高可信度'; }
      else if (confidenceScore >= 60) { confidenceLevel = 'medium'; confidenceLabel = '中等可信度'; }
      else if (confidenceScore >= 40) { confidenceLevel = 'low'; confidenceLabel = '低可信度'; }
      else { confidenceLevel = 'very_low'; confidenceLabel = '仅供参考'; }
      
      return { 
        syndrome: syn, 
        matchPct, 
        confidenceScore: Math.min(confidenceScore, 100),
        confidenceLevel,
        confidenceLabel,
        matchedSymptoms,
        unmatchedSymptoms,
        coreSymptoms,
        secondarySymptoms,
        matchedCount,
        totalSymptomCount
      };
    }).filter(r => r.matchPct > 0).sort((a, b) => b.confidenceScore - a.confidenceScore);
    const top = results.slice(0, 2);
    
    // H3: 动态追问 - 如果第一次分析且有两个候选，生成追问问题
    if (!symptomState.followUpDone && top.length >= 2) {
      const followUpQs = generateFollowUpQuestions(top, selected);
      if (followUpQs.length > 0) {
        symptomState.preAnalysisResults = results;
        symptomState.preAnalysisTop = top;
        symptomState.followUpQuestions = followUpQs;
        const followupPanel = document.getElementById('healthFollowupPanel');
        const resultPanel = document.getElementById('healthResultPanel');
        if (followupPanel) followupPanel.style.display = 'block';
        if (resultPanel) resultPanel.style.display = 'none';
        document.getElementById('healthRestartBtn').style.display = 'none';
        renderFollowUpQuestions(followUpQs);
        return;
      }
    }
    
    // 最终结果渲染
    const qiBloodAnalysis = analyzeQiBlood(selected);
    await renderResult(top, selected, qiBloodAnalysis);
    saveSymptomHistory(top, selected);
    const followupPanel = document.getElementById('healthFollowupPanel');
    if (followupPanel) followupPanel.style.display = 'none';
  }
  // 气血辨证分析
  function analyzeQiBlood(selected) {
    const qiDeficiencySyms = ['疲倦乏力', '气短气喘', '自汗', '面色苍白', '声音嘶哑'];
    const bloodDeficiencySyms = ['面色苍白', '头晕', '眼干涩', '心悸', '失眠多梦', '健忘', '肢体麻木'];
    const qiStagnationSyms = ['抑郁寡欢', '善太息', '心烦易怒', '胸闷', '腹胀', '焦虑不安'];
    const bloodStasisSyms = ['肢体麻木', '关节疼痛', '面色苍白'];
    const qiScore = qiDeficiencySyms.filter(s => selected.includes(s)).length;
    const bloodScore = bloodDeficiencySyms.filter(s => selected.includes(s)).length;
    const qiStagScore = qiStagnationSyms.filter(s => selected.includes(s)).length;
    const bloodStasisScore = bloodStasisSyms.filter(s => selected.includes(s)).length;
    const results = [];
    if (qiScore >= 2) {
      results.push({ type: '气虚', desc: '元气不足，表现为疲倦乏力、气短懒言、自汗等。', advice: '补益脾气，多食黄芪、党参、山药、大枣；艾灸足三里、气海穴。' });
    }
    if (bloodScore >= 2) {
      results.push({ type: '血虚', desc: '血液亏虚，表现为面色苍白、头晕心悸、失眠健忘等。', advice: '养血补血，多食桂圆、红枣、当归、猪肝；按摩三阴交、血海穴。' });
    }
    if (qiStagScore >= 2) {
      results.push({ type: '气滞', desc: '气机郁滞，表现为情绪低落、胸闷善太息、腹胀等。', advice: '疏肝理气，多饮玫瑰花茶、佛手茶；按压太冲穴、膻中穴。' });
    }
    if (bloodStasisScore >= 2) {
      results.push({ type: '血瘀', desc: '血行不畅，表现为肢体麻木、关节疼痛、面色晦暗等。', advice: '活血化瘀，多食山楂、玫瑰花、黑豆；适当运动促进气血运行。' });
    }
    if (qiScore >= 2 && bloodScore >= 2) {
      results.push({ type: '气血两虚', desc: '气虚与血虚并见，面色淡白、气短乏力、头晕心悸。', advice: '气血双补，可食黄芪当归乌鸡汤、十全大补汤；避免过度劳累。' });
    }
    return results;
  }

  // ===== H3: 动态追问 - 生成区分性问题 =====
  function generateFollowUpQuestions(topResults, selectedSymptoms) {
    if (!topResults || topResults.length < 2) return [];
    const top1 = topResults[0];
    const top2 = topResults[1];
    if (!top1 || !top2) return [];
    
    const questions = [];
    const allCandidates = [top1, top2];
    
    allCandidates.forEach(candidate => {
      const syn = candidate.syndrome;
      for (const [sym, weight] of Object.entries(syn.symptoms)) {
        if (weight <= 0) continue;
        if (selectedSymptoms.includes(sym)) continue;
        
        const inOther = allCandidates.some(other => 
          other !== candidate && other.syndrome.symptoms[sym] && other.syndrome.symptoms[sym] > 0
        );
        
        const discrimination = !inOther ? weight * 3 : weight;
        const alreadyAsked = symptomState.followUpAnswered && symptomState.followUpAnswered.has(sym);
        
        if (!alreadyAsked) {
          questions.push({
            symptom: sym,
            weight: discrimination,
            supportsCandidate: candidate.syndrome.name,
            sourceWeight: weight,
            isDiscriminating: !inOther
          });
        }
      }
    });
    
    questions.sort((a, b) => b.weight - a.weight);
    
    const discriminating = questions.filter(q => q.isDiscriminating);
    const supporting = questions.filter(q => !q.isDiscriminating);
    const result = [...discriminating, ...supporting].slice(0, 3);
    
    if (result.length === 0 && top1) {
      const syn1 = top1.syndrome;
      for (const [sym, weight] of Object.entries(syn1.symptoms)) {
        if (weight >= 2 && !selectedSymptoms.includes(sym) && 
            !(symptomState.followUpAnswered && symptomState.followUpAnswered.has(sym))) {
          result.push({ symptom: sym, weight, supportsCandidate: syn1.name, sourceWeight: weight, isDiscriminating: false });
          if (result.length >= 2) break;
        }
      }
    }
    
    return result;
  }
  
  function renderFollowUpQuestions(questions) {
    const container = document.getElementById('healthFollowupQuestions');
    if (!container) return;
    
    if (questions.length === 0) {
      container.innerHTML = '<div class="health-followup-empty">暂无需要追问的问题</div>';
      return;
    }
    
    let html = '';
    questions.forEach((q, idx) => {
      html += '<div class="health-followup-question" data-symptom="' + q.symptom + '" data-index="' + idx + '">';
      html += '<div class="health-followup-q-text">' + q.symptom + '</div>';
      html += '<div class="health-followup-q-hint">您是否有"' + q.symptom + '"的表现？</div>';
      html += '<div class="health-followup-q-options">';
      html += '<button class="health-followup-opt-btn health-followup-opt-yes" data-idx="' + idx + '" data-val="yes">是</button>';
      html += '<button class="health-followup-opt-btn health-followup-opt-no" data-idx="' + idx + '" data-val="no">否</button>';
      html += '</div></div>';
    });
    
    container.innerHTML = html;
    
    container.querySelectorAll('.health-followup-opt-btn').forEach(function(btn) {
      _bindEvent(btn, 'click', function(e) {
        const parent = e.target.closest('.health-followup-question');
        parent.querySelectorAll('.health-followup-opt-btn').forEach(function(b) { b.classList.remove('selected'); });
        e.target.classList.add('selected');
        parent.classList.add('answered');
      });
    });
  }
  
  function collectFollowUpAnswers() {
    const answers = [];
    document.querySelectorAll('.health-followup-question.answered').forEach(function(q) {
      const symptom = q.dataset.symptom;
      const selectedBtn = q.querySelector('.health-followup-opt-btn.selected');
      if (selectedBtn) {
        answers.push({
          symptom: symptom,
          answer: selectedBtn.dataset.val === 'yes'
        });
      }
    });
    return answers;
  }
  
  // Helper: recalculate results with current selected symptoms
  function recalculateResults(selected) {
    return SYNDROME_TYPES.map(function(syn) {
      let totalWeight = 0, matchedWeight = 0;
      const matchedSymptoms = [];
      const unmatchedSymptoms = [];
      const coreSymptoms = [];
      const secondarySymptoms = [];
      
      for (const [sym, weight] of Object.entries(syn.symptoms)) {
        if (weight > 0) {
          totalWeight += weight;
          if (selected.includes(sym)) {
            matchedWeight += weight;
            matchedSymptoms.push({ name: sym, weight: weight });
            if (weight >= 2) coreSymptoms.push(sym);
            else secondarySymptoms.push(sym);
          } else {
            unmatchedSymptoms.push({ name: sym, weight: weight });
          }
        }
      }
      
      const matchPct = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
      const matchedCount = matchedSymptoms.length;
      const totalSymptomCount = Object.values(syn.symptoms).filter(function(w) { return w > 0; }).length;
      
      const matchRatioScore = (matchedWeight / Math.max(totalWeight, 1)) * 100;
      const coreCoverageScore = totalSymptomCount > 0 ? (coreSymptoms.length / Math.max(totalSymptomCount * 0.5, 1)) * 100 : 0;
      const countScore = matchedCount >= 4 ? 100 : matchedCount >= 3 ? 75 : matchedCount >= 2 ? 50 : 25;
      const avgWeight = matchedCount > 0 ? matchedWeight / matchedCount : 0;
      const specificityScore = Math.min(100, (avgWeight / 2.5) * 100);
      
      const confidenceScore = Math.round(
        matchRatioScore * 0.4 +
        Math.min(coreCoverageScore, 100) * 0.3 +
        countScore * 0.2 +
        specificityScore * 0.1
      );
      
      let confidenceLevel, confidenceLabel;
      if (confidenceScore >= 80) { confidenceLevel = 'high'; confidenceLabel = '高可信度'; }
      else if (confidenceScore >= 60) { confidenceLevel = 'medium'; confidenceLabel = '中等可信度'; }
      else if (confidenceScore >= 40) { confidenceLevel = 'low'; confidenceLabel = '低可信度'; }
      else { confidenceLevel = 'very_low'; confidenceLabel = '仅供参考'; }
      
      return { 
        syndrome: syn, matchPct: matchPct,
        confidenceScore: Math.min(confidenceScore, 100),
        confidenceLevel: confidenceLevel, confidenceLabel: confidenceLabel,
        matchedSymptoms: matchedSymptoms, unmatchedSymptoms: unmatchedSymptoms,
        coreSymptoms: coreSymptoms, secondarySymptoms: secondarySymptoms,
        matchedCount: matchedCount, totalSymptomCount: totalSymptomCount
      };
    }).filter(function(r) { return r.matchPct > 0; }).sort(function(a, b) { return b.confidenceScore - a.confidenceScore; });
  }
  
  // ===== H4: 干预方案生成与跟踪 =====
  
  // 生成个性化干预方案
  function generateInterventionPlan(syndromeId) {
    return INTERVENTION_PLANS[syndromeId] || DEFAULT_INTERVENTION;
  }
  
  // 构建今日打卡项列表
  function buildCheckinItems(plan) {
    const items = [];
    // 茶饮
    if (plan.tea_plan) {
      items.push({ type: 'tea', name: plan.tea_plan.name, detail: plan.tea_plan.method, done: false });
    }
    // 穴位
    if (plan.acupoint_plan) {
      plan.acupoint_plan.forEach(ap => {
        items.push({ type: 'acupoint', name: ap.name, detail: ap.method + ' ' + ap.duration, done: false });
      });
    }
    // 食疗
    if (plan.food_recipes && plan.food_recipes.length > 0) {
      items.push({ type: 'food', name: plan.food_recipes[0].name, detail: plan.food_recipes[0].ingredients, done: false });
    }
    // 习惯
    if (plan.daily_habits) {
      plan.daily_habits.slice(0, 2).forEach(h => {
        items.push({ type: 'habit', name: h, detail: '', done: false });
      });
    }
    // 运动
    if (plan.exercise) {
      items.push({ type: 'exercise', name: plan.exercise.name, detail: plan.exercise.duration, done: false });
    }
    return items;
  }
  
  // 获取今日跟踪数据
  async function getTodayTracking(syndromeId) {
    const today = formatDate(new Date());
    const key = 'health/tracking/' + today;
    try {
      const data = await Storage.get('tracking', key);
      if (data && data.syndromeId === syndromeId) return data;
    } catch(e) {}
    return null;
  }
  
  // 保存跟踪数据
  async function saveTracking(syndromeId, items, date) {
    const key = 'health/tracking/' + (date || formatDate(new Date()));
    const doneCount = items.filter(i => i.done).length;
    const total = items.length;
    
    // 获取昨天的数据计算连续天数
    let streak = 1;
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = 'health/tracking/' + formatDate(yesterday);
      const yData = await Storage.get('tracking', yKey);
      if (yData && yData.syndromeId === syndromeId && yData.doneCount > 0) {
        streak = (yData.streak || 1) + 1;
      }
    } catch(e) {}
    
    const data = {
      id: key,
      syndromeId: syndromeId,
      date: date || formatDate(new Date()),
      items: items,
      doneCount: doneCount,
      total: total,
      streak: streak,
      lastCheckin: new Date().toISOString()
    };
    
    try {
      await Storage.set('tracking', key, data);
    } catch(e) { console.error('saveTracking error:', e); }
    return data;
  }
  
  // 获取连续打卡统计
  async function getTrackingStats(syndromeId) {
    let totalDays = 0, currentStreak = 0, lastDate = null;
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = 'health/tracking/' + formatDate(d);
      try {
        const data = await Storage.get('tracking', key);
        if (data && data.syndromeId === syndromeId && data.doneCount > 0) {
          totalDays++;
          if (i <= 1) currentStreak++;
        }
      } catch(e) {}
    }
    
    return { totalDays, currentStreak };
  }
  
  // 渲染干预方案卡片
  async function renderInterventionCard(syndrome) {
    const plan = generateInterventionPlan(syndrome.id);
    const tracking = await getTodayTracking(syndrome.id);
    const items = tracking ? tracking.items : buildCheckinItems(plan);
    const stats = await getTrackingStats(syndrome.id);
    
    let html = '<div class="health-intervention-card">';
    
    // 标题栏
    html += '<div class="health-intervention-header">';
    html += '<span class="health-intervention-title">📋 个性化调理方案</span>';
    if (stats.currentStreak > 0) {
      html += '<span class="health-intervention-streak">🔥 连续 ' + stats.currentStreak + ' 天</span>';
    }
    html += '</div>';
    
    // 方案详情
    html += '<div class="health-intervention-plan">';
    
    // 茶饮
    if (plan.tea_plan) {
      html += '<div class="health-plan-section">';
      html += '<div class="health-plan-section-icon">🍵</div>';
      html += '<div class="health-plan-section-content">';
      html += '<div class="health-plan-section-title">每日茶饮</div>';
      html += '<div class="health-plan-section-detail">' + plan.tea_plan.name + ' — ' + plan.tea_plan.method + '</div>';
      html += '</div></div>';
    }
    
    // 穴位
    if (plan.acupoint_plan && plan.acupoint_plan.length > 0) {
      html += '<div class="health-plan-section">';
      html += '<div class="health-plan-section-icon">🤲</div>';
      html += '<div class="health-plan-section-content">';
      html += '<div class="health-plan-section-title">穴位按摩</div>';
      plan.acupoint_plan.forEach(ap => {
        html += '<div class="health-plan-section-detail">' + ap.name + ' · ' + ap.method + ' ' + ap.duration + (ap.timing ? '（' + ap.timing + '）' : '') + '</div>';
      });
      html += '</div></div>';
    }
    
    // 食疗
    if (plan.food_recipes && plan.food_recipes.length > 0) {
      html += '<div class="health-plan-section">';
      html += '<div class="health-plan-section-icon">🥣</div>';
      html += '<div class="health-plan-section-content">';
      html += '<div class="health-plan-section-title">食疗方</div>';
      plan.food_recipes.forEach(r => {
        html += '<div class="health-plan-section-detail"><strong>' + r.name + '</strong>（' + r.frequency + '）</div>';
        html += '<div class="health-plan-section-sub">' + r.ingredients + '</div>';
      });
      html += '</div></div>';
    }
    
    // 日常习惯
    if (plan.daily_habits && plan.daily_habits.length > 0) {
      html += '<div class="health-plan-section">';
      html += '<div class="health-plan-section-icon">🌿</div>';
      html += '<div class="health-plan-section-content">';
      html += '<div class="health-plan-section-title">日常习惯</div>';
      plan.daily_habits.forEach(h => {
        html += '<div class="health-plan-section-detail">• ' + h + '</div>';
      });
      html += '</div></div>';
    }
    
    html += '</div>'; // end plan
    
    // 今日打卡
    html += '<div class="health-checkin-section">';
    html += '<div class="health-checkin-title">✅ 今日打卡</div>';
    html += '<div class="health-checkin-list" id="healthCheckinList">';
    
    items.forEach((item, idx) => {
      const typeIcon = { tea: '🍵', acupoint: '🤲', food: '🥣', habit: '🌿', exercise: '🏃' }[item.type] || '•';
      html += '<div class="health-checkin-item' + (item.done ? ' checked' : '') + '" data-idx="' + idx + '">';
      html += '<div class="health-checkin-checkbox">' + (item.done ? '✓' : '') + '</div>';
      html += '<div class="health-checkin-content">';
      html += '<span class="health-checkin-type">' + typeIcon + '</span>';
      html += '<span class="health-checkin-name">' + item.name + '</span>';
      if (item.detail) html += '<span class="health-checkin-detail">' + item.detail + '</span>';
      html += '</div></div>';
    });
    
    html += '</div>'; // end checkin list
    
    // 进度条
    const doneCount = items.filter(i => i.done).length;
    const progress = items.length > 0 ? Math.round(doneCount / items.length * 100) : 0;
    html += '<div class="health-checkin-progress">';
    html += '<div class="health-checkin-progress-bar"><div class="health-checkin-progress-fill" style="width:' + progress + '%"></div></div>';
    html += '<span class="health-checkin-progress-text">' + doneCount + '/' + items.length + '</span>';
    html += '</div>';
    
    html += '</div>'; // end checkin section
    html += '</div>'; // end intervention card
    
    // 存储当前方案数据到DOM供打卡事件使用
    setTimeout(function() {
      const card = document.querySelector('.health-intervention-card');
      if (card) {
        card.dataset.syndromeId = syndrome.id;
        card.dataset.items = JSON.stringify(items);
      }
      bindCheckinEvents(syndrome.id, items);
    }, 100);
    
    return html;
  }
  
  // 绑定打卡事件
  function bindCheckinEvents(syndromeId, items) {
    const list = document.getElementById('healthCheckinList');
    if (!list) return;
    
    list.querySelectorAll('.health-checkin-item').forEach(function(el) {
      _bindEvent(el, 'click', async function() {
        const idx = parseInt(el.dataset.idx);
        items[idx].done = !items[idx].done;
        el.classList.toggle('checked', items[idx].done);
        const checkbox = el.querySelector('.health-checkin-checkbox');
        if (checkbox) checkbox.textContent = items[idx].done ? '✓' : '';
        
        // 更新进度条
        const doneCount = items.filter(function(i) { return i.done; }).length;
        const progress = items.length > 0 ? Math.round(doneCount / items.length * 100) : 0;
        const fill = document.querySelector('.health-checkin-progress-fill');
        const text = document.querySelector('.health-checkin-progress-text');
        if (fill) fill.style.width = progress + '%';
        if (text) text.textContent = doneCount + '/' + items.length;
        
        // 更新连续打卡显示
        if (doneCount === items.length) {
          const streakEl = document.querySelector('.health-intervention-streak');
          if (streakEl) {
            const current = parseInt(streakEl.textContent.match(/\d+/)[0]) || 0;
            if (current === 0) streakEl.textContent = '🔥 今日完成！';
          }
        }
        
        // 保存到Storage
        await saveTracking(syndromeId, items);
      });
    });
  }
  
  async function renderResult(top, selected, qiBloodAnalysis) {
    const panel = document.getElementById('healthResultPanel');
    if (!panel) return;
    // 读取体质数据
    let constitution = null;
    try {
      const setting = await Storage.get('settings', 'health/constitution');
      if (setting && setting.value) constitution = setting.value;
    } catch (e) {}
    if (top.length === 0) {
      panel.innerHTML = '<div class="health-empty-state">未能匹配到明确证型，建议咨询专业中医师。</div>';
      return;
    }
    let html = '';
    // 体质参考
    if (constitution) {
      html += `<div class="health-result-constitution-ref">
        <div class="health-result-section-title">🧬 体质参考</div>
        <div class="health-result-const-info">您的体质为<strong>${escapeHtml(constitution.name)}</strong>（${escapeHtml(constitution.desc)}）</div>
        <div class="health-result-const-advice">💡 个性化建议：${escapeHtml(constitution.advice)}</div>
      </div>`;
    } else {
      html += `<div class="health-result-constitution-ref health-result-const-empty">
        <div class="health-result-section-title">🧬 体质参考</div>
        <div class="health-result-const-hint">建议先进行体质辨识，以获取个性化养生建议。</div>
      </div>`;
    }
    top.forEach((r, idx) => {
      const syn = r.syndrome;
      const isPrimary = idx === 0;
      
      // Header with confidence badge
      html += `<div class="health-result-header">`;
      html += `<div class="health-result-type">${syn.name}</div>`;
      html += `<div class="health-result-match">匹配度 <strong>${r.matchPct}%</strong></div>`;
      html += `</div>`;
      
      // H1: Confidence indicator
      html += `<div class="health-confidence-block health-confidence-${r.confidenceLevel}">`;
      html += `<div class="health-confidence-bar-wrap">`;
      html += `<span class="health-confidence-label">${r.confidenceLabel}</span>`;
      html += `<div class="health-confidence-bar"><div class="health-confidence-fill" style="width:${r.confidenceScore}%"></div></div>`;
      html += `<span class="health-confidence-score">${r.confidenceScore}分</span>`;
      html += `</div>`;
      if (r.confidenceLevel === 'very_low' || r.confidenceLevel === 'low') {
        html += `<div class="health-confidence-hint">💡 匹配症状较少，建议补充更多症状信息或咨询专业医师</div>`;
      }
      html += `</div>`;
      
      // H2: Evidence chain - symptom matching visualization
      if (r.matchedSymptoms && r.matchedSymptoms.length > 0) {
        html += `<div class="health-result-section">`;
        html += `<div class="health-result-section-title">🔗 辨证依据 <span class="health-evidence-summary">${r.coreSymptoms.length}个核心 + ${r.secondarySymptoms.length}个次要</span></div>`;
        
        // Core symptoms (weight >= 2)
        if (r.coreSymptoms.length > 0) {
          html += `<div class="health-evidence-group"><div class="health-evidence-group-label">核心依据（权重≥2）</div><div class="health-evidence-tags">`;
          r.coreSymptoms.forEach(sym => {
            html += `<span class="health-evidence-tag health-evidence-core">${sym}</span>`;
          });
          html += `</div></div>`;
        }
        
        // Secondary symptoms (weight = 1)
        if (r.secondarySymptoms.length > 0) {
          html += `<div class="health-evidence-group"><div class="health-evidence-group-label">次要依据（权重=1）</div><div class="health-evidence-tags">`;
          r.secondarySymptoms.forEach(sym => {
            html += `<span class="health-evidence-tag health-evidence-secondary">${sym}</span>`;
          });
          html += `</div></div>`;
        }
        
        // Missing symptoms (for reference)
        const missingTop = r.unmatchedSymptoms.slice(0, 3);
        if (missingTop.length > 0) {
          html += `<div class="health-evidence-missing"><span class="health-evidence-missing-label">未匹配：</span>`;
          html += missingTop.map(s => `<span class="health-evidence-tag health-evidence-unmatched">${s.name}</span>`).join('');
          html += `</div>`;
        }
        html += `</div>`;
      }
      
      // Standard sections
      html += `<div class="health-result-section"><div class="health-result-section-title">📖 证型解读</div><p>${syn.interpretation}</p></div>`;
      html += `<div class="health-result-section"><div class="health-result-section-title">🍵 推荐茶饮</div><ul class="health-recommendation-list">${syn.tea.map(t => `<li>${t}</li>`).join('')}</ul></div>`;
      html += `<div class="health-result-section"><div class="health-result-section-title">🤲 推荐穴位</div><ul class="health-recommendation-list">${syn.acupoints.map(a => `<li>${a}</li>`).join('')}</ul></div>`;
      html += `<div class="health-result-section"><div class="health-result-section-title">🥗 饮食宜忌</div><ul class="health-recommendation-list"><li>✅ 宜：${syn.diet.good}</li><li>❌ 忌：${syn.diet.bad}</li></ul></div>`;
      if (idx < top.length - 1) html += '<hr style="border:none;border-top:1px solid var(--border-color);margin:14px 0;">';
    });
    // 气血辨证分析
    if (qiBloodAnalysis && qiBloodAnalysis.length > 0) {
      html += `<div class="health-result-qiblood-section">
        <div class="health-result-section-title">🌀 气血辨证分析</div>`;
      qiBloodAnalysis.forEach(item => {
        html += `<div class="health-result-qiblood-item">
          <div class="health-result-qiblood-type">${escapeHtml(item.type)}倾向</div>
          <div class="health-result-qiblood-desc">${escapeHtml(item.desc)}</div>
          <div class="health-result-qiblood-advice">💡 ${escapeHtml(item.advice)}</div>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="health-result-qiblood-section">
        <div class="health-result-section-title">🌀 气血辨证分析</div>
        <div class="health-empty-state">暂无明显气血异常倾向</div>
      </div>`;
    }
    // H4: 个性化干预方案（仅为主证型生成）
    if (top.length > 0 && top[0].syndrome) {
      const interventionHtml = await renderInterventionCard(top[0].syndrome);
      html += interventionHtml;
    }
    
    html += `<div class="health-medical-notice"><span class="warn-icon">⚠️</span><span>以上结果仅供参考，不能替代专业医疗诊断。如症状持续或加重，请及时就医咨询专业医师。</span></div>`;
    panel.innerHTML = html;
  }
  async function saveSymptomHistory(top, selected) {
    const record = {
      date: new Date().toISOString(),
      part: symptomState.part,
      partName: SYMPTOM_DATA[symptomState.part]?.name || '',
      symptoms: selected,
      results: top.map(r => ({ name: r.syndrome.name, matchPct: r.matchPct }))
    };
    try {
      const setting = await Storage.get('settings', 'health/symptoms');
      let history = (setting && setting.value) || [];
      history.unshift(record);
      if (history.length > 30) history = history.slice(0, 30);
      await Storage.put('settings', { key: 'health/symptoms', value: history });
      loadSymptomHistory();
    } catch (e) {}
  }
  async function loadSymptomHistory() {
    const container = document.getElementById('healthSymptomHistory');
    if (!container) return;
    try {
      const setting = await Storage.get('settings', 'health/symptoms');
      const history = (setting && setting.value) || [];
      if (history.length === 0) { container.innerHTML = '<div class="health-empty-state">暂无自查记录</div>'; return; }
      container.innerHTML = history.slice(0, 10).map(r => {
        const d = new Date(r.date);
        const ds = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const typeStr = r.results.map(res => `${res.name}(${res.matchPct}%)`).join('、');
        return `<div class="health-symptom-history-item"><div class="sh-date">${ds} · ${r.partName}</div><div class="sh-type">${typeStr}</div><div class="sh-symptoms">${r.symptoms.join('、')}</div></div>`;
      }).join('');
    } catch (e) {}
  }


  // ===== 食物性味速查库 =====
  const FOOD_DATA = [
    // 谷物
    { name: '大米', category: '谷物', nature: '平', flavor: '甘', meridians: ['脾','胃'], effects: '补中益气、健脾养胃', goodFor: ['气虚质','平和质'], badFor: [] },
    { name: '小米', category: '谷物', nature: '凉', flavor: '甘咸', meridians: ['肾','脾','胃'], effects: '健脾和胃、补益虚损', goodFor: ['气虚质','脾胃虚弱'], badFor: [] },
    { name: '糯米', category: '谷物', nature: '温', flavor: '甘', meridians: ['脾','肺'], effects: '补中益气、健脾止泻', goodFor: ['阳虚质','气虚质'], badFor: ['湿热质','痰湿质'] },
    { name: '小麦', category: '谷物', nature: '凉', flavor: '甘', meridians: ['心','脾','肾'], effects: '养心安神、除烦止渴', goodFor: ['阴虚质','气郁质'], badFor: [] },
    { name: '燕麦', category: '谷物', nature: '平', flavor: '甘', meridians: ['脾','心'], effects: '益脾养心、敛汗', goodFor: ['气虚质','平和质'], badFor: [] },
    { name: '薏米', category: '谷物', nature: '凉', flavor: '甘淡', meridians: ['脾','胃','肺'], effects: '健脾渗湿、除痹止泻', goodFor: ['痰湿质','湿热质'], badFor: ['阳虚质'] },
    { name: '玉米', category: '谷物', nature: '平', flavor: '甘', meridians: ['脾','胃'], effects: '调中开胃、利水通淋', goodFor: ['痰湿质','平和质'], badFor: [] },
    // 蔬菜
    { name: '白菜', category: '蔬菜', nature: '平', flavor: '甘', meridians: ['胃','大肠'], effects: '清热除烦、通利肠胃', goodFor: ['湿热质','平和质'], badFor: ['阳虚质'] },
    { name: '白萝卜', category: '蔬菜', nature: '凉', flavor: '辛甘', meridians: ['肺','胃'], effects: '消食化积、下气化痰', goodFor: ['痰湿质','气郁质'], badFor: ['气虚质'] },
    { name: '胡萝卜', category: '蔬菜', nature: '平', flavor: '甘', meridians: ['脾','肝','肺'], effects: '健脾消食、补肝明目', goodFor: ['气虚质','血瘀质'], badFor: [] },
    { name: '菠菜', category: '蔬菜', nature: '凉', flavor: '甘', meridians: ['肝','胃','大肠'], effects: '养血止血、敛阴润燥', goodFor: ['阴虚质','血瘀质'], badFor: ['阳虚质'] },
    { name: '芹菜', category: '蔬菜', nature: '凉', flavor: '甘苦', meridians: ['肝','胃'], effects: '平肝清热、祛风利湿', goodFor: ['湿热质','阴虚质'], badFor: ['阳虚质'] },
    { name: '苦瓜', category: '蔬菜', nature: '寒', flavor: '苦', meridians: ['心','脾','胃'], effects: '清热解暑、明目解毒', goodFor: ['湿热质','阴虚质'], badFor: ['阳虚质','气虚质'] },
    { name: '冬瓜', category: '蔬菜', nature: '凉', flavor: '甘淡', meridians: ['肺','大肠','膀胱'], effects: '清热利水、解毒生津', goodFor: ['湿热质','痰湿质'], badFor: ['阳虚质'] },
    { name: '莲藕', category: '蔬菜', nature: '凉', flavor: '甘', meridians: ['心','脾','胃'], effects: '清热生津、凉血止血', goodFor: ['阴虚质','血瘀质'], badFor: ['阳虚质'] },
    { name: '山药', category: '蔬菜', nature: '平', flavor: '甘', meridians: ['脾','肺','肾'], effects: '补脾养胃、生津益肺', goodFor: ['气虚质','阴虚质','平和质'], badFor: ['湿热质'] },
    { name: '南瓜', category: '蔬菜', nature: '温', flavor: '甘', meridians: ['脾','胃'], effects: '补中益气、解毒杀虫', goodFor: ['气虚质','阳虚质'], badFor: ['湿热质'] },
    { name: '韭菜', category: '蔬菜', nature: '温', flavor: '辛', meridians: ['肝','胃','肾'], effects: '温中行气、散瘀活血', goodFor: ['阳虚质','血瘀质'], badFor: ['阴虚质','湿热质'] },
    { name: '生姜', category: '蔬菜', nature: '温', flavor: '辛', meridians: ['肺','脾','胃'], effects: '散寒解表、温中止呕', goodFor: ['阳虚质','痰湿质'], badFor: ['阴虚质','湿热质'] },
    { name: '大蒜', category: '蔬菜', nature: '温', flavor: '辛', meridians: ['脾','胃','肺'], effects: '解毒杀虫、消肿止痛', goodFor: ['阳虚质','痰湿质'], badFor: ['阴虚质','湿热质'] },
    { name: '洋葱', category: '蔬菜', nature: '温', flavor: '辛', meridians: ['肺','胃'], effects: '理气和胃、健脾消食', goodFor: ['气郁质','阳虚质'], badFor: ['湿热质'] },
    // 水果
    { name: '苹果', category: '水果', nature: '平', flavor: '甘酸', meridians: ['脾','肺'], effects: '生津止渴、健脾和胃', goodFor: ['平和质','气虚质'], badFor: [] },
    { name: '梨', category: '水果', nature: '凉', flavor: '甘微酸', meridians: ['肺','胃'], effects: '生津润燥、清热化痰', goodFor: ['阴虚质','肺热咳嗽'], badFor: ['阳虚质'] },
    { name: '香蕉', category: '水果', nature: '寒', flavor: '甘', meridians: ['肺','大肠'], effects: '清热润肠、解毒', goodFor: ['阴虚质','便秘'], badFor: ['阳虚质','痰湿质'] },
    { name: '橙子', category: '水果', nature: '凉', flavor: '甘酸', meridians: ['肺','胃'], effects: '生津止渴、和胃理气', goodFor: ['阴虚质','气郁质'], badFor: ['阳虚质'] },
    { name: '橘子', category: '水果', nature: '温', flavor: '甘酸', meridians: ['肺','胃'], effects: '开胃理气、止渴润肺', goodFor: ['气郁质','阳虚质'], badFor: ['湿热质'] },
    { name: '桂圆', category: '水果', nature: '温', flavor: '甘', meridians: ['心','脾'], effects: '补心脾、益气血', goodFor: ['气虚质','血瘀质'], badFor: ['湿热质','阴虚质'] },
    { name: '红枣', category: '水果', nature: '温', flavor: '甘', meridians: ['脾','胃','心'], effects: '补中益气、养血安神', goodFor: ['气虚质','血瘀质'], badFor: ['湿热质','痰湿质'] },
    { name: '山楂', category: '水果', nature: '温', flavor: '酸甘', meridians: ['脾','胃','肝'], effects: '消食化积、活血散瘀', goodFor: ['痰湿质','血瘀质'], badFor: ['气虚质'] },
    { name: '西瓜', category: '水果', nature: '寒', flavor: '甘', meridians: ['心','胃','膀胱'], effects: '清热解暑、除烦止渴', goodFor: ['湿热质','阴虚质'], badFor: ['阳虚质','气虚质'] },
    { name: '葡萄', category: '水果', nature: '平', flavor: '甘酸', meridians: ['肺','脾','肾'], effects: '补气血、强筋骨', goodFor: ['气虚质','血瘀质'], badFor: [] },
    { name: '桃子', category: '水果', nature: '温', flavor: '甘酸', meridians: ['肺','大肠'], effects: '生津润肠、活血消积', goodFor: ['血瘀质','气虚质'], badFor: ['湿热质'] },
    { name: '荔枝', category: '水果', nature: '温', flavor: '甘酸', meridians: ['脾','肝'], effects: '补脾益肝、生津止渴', goodFor: ['阳虚质','气虚质'], badFor: ['阴虚质','湿热质'] },
    // 肉蛋
    { name: '猪肉', category: '肉蛋', nature: '平', flavor: '甘咸', meridians: ['脾','胃','肾'], effects: '滋阴润燥、补肾养血', goodFor: ['阴虚质','平和质'], badFor: ['痰湿质'] },
    { name: '牛肉', category: '肉蛋', nature: '温', flavor: '甘', meridians: ['脾','胃'], effects: '补中益气、健脾养胃', goodFor: ['气虚质','阳虚质'], badFor: ['湿热质'] },
    { name: '羊肉', category: '肉蛋', nature: '热', flavor: '甘', meridians: ['脾','肾'], effects: '温中暖肾、益气补虚', goodFor: ['阳虚质','气虚质'], badFor: ['阴虚质','湿热质'] },
    { name: '鸡肉', category: '肉蛋', nature: '温', flavor: '甘', meridians: ['脾','胃'], effects: '温中益气、补精填髓', goodFor: ['气虚质','阳虚质'], badFor: ['湿热质'] },
    { name: '鸭肉', category: '肉蛋', nature: '凉', flavor: '甘咸', meridians: ['肺','脾','肾'], effects: '滋阴养胃、利水消肿', goodFor: ['阴虚质','湿热质'], badFor: ['阳虚质'] },
    { name: '鸡蛋', category: '肉蛋', nature: '平', flavor: '甘', meridians: ['心','肺'], effects: '滋阴润燥、养血安胎', goodFor: ['阴虚质','气虚质','平和质'], badFor: [] },
    // 水产
    { name: '鲤鱼', category: '水产', nature: '平', flavor: '甘', meridians: ['脾','肾'], effects: '健脾利水、下气通乳', goodFor: ['痰湿质','水肿'], badFor: [] },
    { name: '鲫鱼', category: '水产', nature: '平', flavor: '甘', meridians: ['脾','胃'], effects: '健脾利湿、和中开胃', goodFor: ['气虚质','痰湿质'], badFor: [] },
    { name: '虾', category: '水产', nature: '温', flavor: '甘', meridians: ['肝','肾'], effects: '补肾壮阳、通乳托毒', goodFor: ['阳虚质','气虚质'], badFor: ['阴虚质','湿热质'] },
    { name: '螃蟹', category: '水产', nature: '寒', flavor: '咸', meridians: ['肝','胃'], effects: '清热散瘀、消肿解毒', goodFor: ['湿热质','血瘀质'], badFor: ['阳虚质','气虚质'] },
    { name: '海参', category: '水产', nature: '温', flavor: '咸', meridians: ['心','肾'], effects: '补肾益精、养血润燥', goodFor: ['阳虚质','阴虚质'], badFor: ['痰湿质'] },
    { name: '海带', category: '水产', nature: '寒', flavor: '咸', meridians: ['肝','胃','肾'], effects: '软坚散结、清热利水', goodFor: ['痰湿质','血瘀质'], badFor: ['阳虚质'] },
    { name: '紫菜', category: '水产', nature: '寒', flavor: '甘咸', meridians: ['肺'], effects: '化痰软坚、清热利尿', goodFor: ['痰湿质','湿热质'], badFor: ['阳虚质'] },
    // 豆类
    { name: '黄豆', category: '豆类', nature: '平', flavor: '甘', meridians: ['脾','大肠'], effects: '健脾宽中、润燥消水', goodFor: ['气虚质','平和质'], badFor: [] },
    { name: '绿豆', category: '豆类', nature: '凉', flavor: '甘', meridians: ['心','胃'], effects: '清热解毒、消暑利尿', goodFor: ['湿热质','阴虚质'], badFor: ['阳虚质'] },
    { name: '红豆', category: '豆类', nature: '平', flavor: '甘酸', meridians: ['心','小肠'], effects: '利水消肿、解毒排脓', goodFor: ['痰湿质','湿热质'], badFor: [] },
    { name: '黑豆', category: '豆类', nature: '平', flavor: '甘', meridians: ['脾','肾'], effects: '活血利水、祛风解毒', goodFor: ['血瘀质','肾虚'], badFor: [] },
    { name: '豆腐', category: '豆类', nature: '凉', flavor: '甘', meridians: ['脾','胃','大肠'], effects: '益气和中、生津润燥', goodFor: ['阴虚质','平和质'], badFor: ['阳虚质'] },
    { name: '赤小豆', category: '豆类', nature: '平', flavor: '甘酸', meridians: ['心','小肠'], effects: '利水消肿、解毒排脓', goodFor: ['痰湿质','湿热质'], badFor: [] },
    // 调料
    { name: '生姜', category: '调料', nature: '温', flavor: '辛', meridians: ['肺','脾','胃'], effects: '散寒解表、温中止呕', goodFor: ['阳虚质','痰湿质'], badFor: ['阴虚质','湿热质'] },
    { name: '葱白', category: '调料', nature: '温', flavor: '辛', meridians: ['肺','胃'], effects: '散寒通阳、解毒散结', goodFor: ['阳虚质','风寒感冒'], badFor: ['阴虚质'] },
    { name: '花椒', category: '调料', nature: '温', flavor: '辛', meridians: ['脾','胃','肾'], effects: '温中散寒、除湿止痛', goodFor: ['阳虚质','寒湿体质'], badFor: ['阴虚质','湿热质'] },
    { name: '胡椒', category: '调料', nature: '热', flavor: '辛', meridians: ['胃','大肠'], effects: '温中散寒、下气消痰', goodFor: ['阳虚质','痰湿质'], badFor: ['阴虚质','湿热质'] },
    { name: '醋', category: '调料', nature: '温', flavor: '酸苦', meridians: ['肝','胃'], effects: '散瘀止血、理气止痛', goodFor: ['血瘀质','气郁质'], badFor: [] },
    { name: '蜂蜜', category: '调料', nature: '平', flavor: '甘', meridians: ['肺','脾','大肠'], effects: '补中润燥、止痛解毒', goodFor: ['阴虚质','气虚质'], badFor: ['痰湿质','湿热质'] },
    { name: '桂皮', category: '调料', nature: '热', flavor: '辛甘', meridians: ['肾','脾','心'], effects: '补火助阳、散寒止痛', goodFor: ['阳虚质','寒证'], badFor: ['阴虚质','湿热质'] },
    { name: '八角', category: '调料', nature: '温', flavor: '辛', meridians: ['脾','胃'], effects: '温阳散寒、理气止痛', goodFor: ['阳虚质','寒湿体质'], badFor: ['阴虚质'] },
    // 饮品
    { name: '绿茶', category: '饮品', nature: '凉', flavor: '苦甘', meridians: ['心','肺','胃'], effects: '清热解毒、消食化痰', goodFor: ['湿热质','痰湿质'], badFor: ['阳虚质'] },
    { name: '红茶', category: '饮品', nature: '温', flavor: '甘', meridians: ['心','胃'], effects: '温中暖胃、散寒活血', goodFor: ['阳虚质','气虚质'], badFor: ['阴虚质'] },
    { name: '菊花茶', category: '饮品', nature: '凉', flavor: '甘苦', meridians: ['肝','肺'], effects: '疏风散热、平肝明目', goodFor: ['阴虚质','湿热质'], badFor: ['阳虚质'] },
    { name: '枸杞茶', category: '饮品', nature: '平', flavor: '甘', meridians: ['肝','肾'], effects: '滋补肝肾、益精明目', goodFor: ['阴虚质','平和质'], badFor: ['痰湿质'] },
    { name: '牛奶', category: '饮品', nature: '平', flavor: '甘', meridians: ['心','肺','胃'], effects: '补虚损、益肺胃', goodFor: ['阴虚质','气虚质'], badFor: ['痰湿质'] },
    { name: '豆浆', category: '饮品', nature: '凉', flavor: '甘', meridians: ['肺','胃'], effects: '补虚润燥、清肺化痰', goodFor: ['阴虚质','平和质'], badFor: ['阳虚质'] }
  ];

  let _foodFilter = { category: '全部', search: '' };

  function initFoodLib() {
    const searchInput = document.getElementById('healthFoodSearch');
    const catContainer = document.getElementById('healthFoodCategories');
    if (searchInput) {
      _bindEvent(searchInput, 'input', () => {
        _foodFilter.search = searchInput.value.trim();
        renderFoodList();
      });
    }
    if (catContainer) {
      catContainer.querySelectorAll('.health-food-cat-btn').forEach(btn => {
        _bindEvent(btn, 'click', () => {
          catContainer.querySelectorAll('.health-food-cat-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _foodFilter.category = btn.dataset.cat;
          renderFoodList();
        });
      });
    }
    renderFoodList();
  }

  function renderFoodList() {
    const container = document.getElementById('healthFoodList');
    if (!container) return;
    let list = FOOD_DATA;
    if (_foodFilter.category !== '全部') {
      list = list.filter(f => f.category === _foodFilter.category);
    }
    if (_foodFilter.search) {
      const kw = _foodFilter.search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(kw));
    }
    if (list.length === 0) {
      container.innerHTML = '<div class="health-food-empty">未找到匹配的食物</div>';
      return;
    }
    container.innerHTML = list.map((f, i) => {
      const natureCls = f.nature === '寒' || f.nature === '凉' ? 'nature-cold' :
                        f.nature === '平' ? 'nature-neutral' : 'nature-warm';
      // 搭配建议
      const pairings = getFoodPairings(f.name);
      const pairingText = pairings.length ? pairings.join('、') : '暂无';
      return `<div class="health-food-item" data-food-idx="${i}">
        <div class="health-food-item-header" data-toggle="detail">
          <span class="health-food-item-name">${escapeHtml(f.name)}</span>
          <span class="health-food-item-cat">${escapeHtml(f.category)}</span>
          <span class="health-food-expand-hint">▸</span>
        </div>
        <div class="health-food-item-props">
          <span class="health-food-nature-tag ${natureCls}">${escapeHtml(f.nature)}</span>
          <span class="health-food-flavor-tag">${escapeHtml(f.flavor)}</span>
        </div>
        <div class="health-food-item-meridians">${f.meridians.map(m => escapeHtml(m)).join('、')}</div>
        <div class="health-food-item-effects">${escapeHtml(f.effects)}</div>
        <div class="health-food-item-constitution">
          ${f.goodFor.length ? '<span class="health-food-good">✓ ' + f.goodFor.join('、') + '</span>' : ''}
          ${f.badFor.length ? '<span class="health-food-bad"> ✗ ' + f.badFor.join('、') + '</span>' : ''}
        </div>
        <div class="health-food-detail" style="display:none;">
          <div class="health-food-detail-row"><span class="health-food-detail-label">性味归经</span><span>${escapeHtml(f.nature)} · ${escapeHtml(f.flavor)} · 归${f.meridians.map(m => escapeHtml(m)).join('、')}经</span></div>
          <div class="health-food-detail-row"><span class="health-food-detail-label">功效</span><span>${escapeHtml(f.effects)}</span></div>
          <div class="health-food-detail-row"><span class="health-food-detail-label">适合体质</span><span>${f.goodFor.length ? f.goodFor.map(g => escapeHtml(g)).join('、') : '一般体质均可'}</span></div>
          <div class="health-food-detail-row"><span class="health-food-detail-label">禁忌</span><span>${f.badFor.length ? f.badFor.map(b => escapeHtml(b)).join('、') : '无明显禁忌'}</span></div>
          <div class="health-food-detail-row"><span class="health-food-detail-label">搭配建议</span><span>${escapeHtml(pairingText)}</span></div>
        </div>
      </div>`;
    }).join('');
    // 绑定展开/收起
    container.querySelectorAll('.health-food-item-header[data-toggle="detail"]').forEach(header => {
      _bindEvent(header, 'click', () => {
        const detail = header.nextElementSibling;
        // header is .health-food-item-header, next siblings are props, meridians, effects, constitution, detail
        const item = header.closest('.health-food-item');
        const detailEl = item.querySelector('.health-food-detail');
        const hint = header.querySelector('.health-food-expand-hint');
        if (detailEl) {
          const isShown = detailEl.style.display !== 'none';
          detailEl.style.display = isShown ? 'none' : '';
          if (hint) hint.textContent = isShown ? '▸' : '▾';
        }
      });
    });
  }
  function getFoodPairings(name) {
    const pairings = {
      '山药': ['排骨（健脾益胃）', '薏米（祛湿健脾）', '红枣（补气养血）'],
      '红枣': ['桂圆（补血安神）', '枸杞（滋补肝肾）', '黄芪（补气健脾）'],
      '百合': ['银耳（滋阴润肺）', '莲子（清心安神）', '雪梨（润肺止咳）'],
      '枸杞': ['菊花（清肝明目）', '红枣（补气养血）', '山药（滋肾益精）'],
      '生姜': ['红糖（温中散寒）', '红枣（温胃健脾）', '羊肉（温阳散寒）'],
      '绿豆': ['百合（清热解暑）', '薏米（清热祛湿）', '冬瓜（清热利水）'],
      '黑豆': ['核桃（补肾益精）', '红糖（活血调经）', '排骨（补肾强骨）'],
      '莲藕': ['排骨（滋阴养胃）', '红豆（补血养心）', '雪梨（清热润肺）'],
      '山楂': ['决明子（消食通便）', '红糖（活血化瘀）', '麦芽（消食化积）'],
      '银耳': ['百合（滋阴润肺）', '枸杞（滋补肝肾）', '莲子（养心安神）'],
      '核桃': ['黑芝麻（补肾乌发）', '红枣（补气养血）', '粳米（健脑益智）'],
      '羊肉': ['当归（温补血虚）', '生姜（温中散寒）', '萝卜（消食化滞）']
    };
    return pairings[name] || [];
  }

  // ===== 五脏知识库 =====
  const ORGAN_DATA = {
    '心': {
      alias: '心者，君主之官',
      function: '心主血脉，主神明，其华在面，开窍于舌。心为五脏六腑之大主，统领精神意识思维活动。',
      relations: { '五志': '喜', '五味': '苦', '五色': '赤', '五季': '夏', '五官': '舌' },
      tips: [
        '午时（11-13点）心经当令，宜午休养心，小憩15-30分钟',
        '保持心情愉悦，避免大喜大悲，以防心气耗散',
        '红色食物养心，如红枣、赤小豆、西红柿、山楂',
        '适当运动如散步、太极，促进气血运行',
        '睡前泡脚引火归元，有助安眠养心'
      ],
      issues: [
        { name: '心悸失眠', desc: '多因心血不足或心气虚弱，表现为心慌、失眠多梦。调理：养心安神，可食桂圆、莲子、酸枣仁；按摩神门穴、内关穴。' },
        { name: '心火上炎', desc: '多因情志化火或过食辛辣，表现为口舌生疮、心烦失眠。调理：清心泻火，可饮莲子心茶、竹叶茶；少食辛辣。' },
        { name: '心血瘀阻', desc: '多因气滞血瘀或寒凝心脉，表现为胸闷心痛、唇色紫暗。调理：活血化瘀，可食山楂、丹参茶；注意保暖防寒。' }
      ]
    },
    '肝': {
      alias: '肝者，将军之官',
      function: '肝主疏泄，主藏血，在体合筋，开窍于目。肝调畅气机，调节情志，促进消化吸收。',
      relations: { '五志': '怒', '五味': '酸', '五色': '青', '五季': '春', '五官': '目' },
      tips: [
        '丑时（1-3点）肝经当令，此时宜深睡以养肝血',
        '保持情绪舒畅，切忌暴怒伤肝，学会疏导压力',
        '青色食物养肝，如菠菜、芹菜、西兰花、绿豆',
        '适度运动疏肝理气，如散步、瑜伽、八段锦',
        '避免过度饮酒，酒精最伤肝脏'
      ],
      issues: [
        { name: '肝郁气滞', desc: '多因情志不遂，表现为胸胁胀痛、善太息、情绪低落。调理：疏肝理气，可饮玫瑰花茶、佛手茶；按压太冲穴。' },
        { name: '肝火上炎', desc: '多因气郁化火，表现为头痛目赤、口苦易怒。调理：清肝泻火，可饮菊花茶、决明子茶；忌辛辣燥热。' },
        { name: '肝血不足', desc: '多因失血或久病，表现为眼干涩、肢体麻木、面色淡白。调理：养血柔肝，可食枸杞、猪肝、黑芝麻。' }
      ]
    },
    '脾': {
      alias: '脾者，仓廪之官',
      function: '脾主运化，主统血，在体合肌肉，开窍于口。脾为后天之本，气血生化之源，主消化吸收和水液代谢。',
      relations: { '五志': '思', '五味': '甘', '五色': '黄', '五季': '长夏', '五官': '口' },
      tips: [
        '辰时（7-9点）胃经当令，巳时（9-11点）脾经当令，此时消化吸收最佳，务必吃好早餐',
        '饮食有节，忌暴饮暴食，少食生冷寒凉以免伤脾阳',
        '黄色食物养脾，如山药、小米、南瓜、黄豆',
        '饭后百步走，有助脾胃运化',
        '避免过度思虑，思则气结伤脾'
      ],
      issues: [
        { name: '脾气虚弱', desc: '多因饮食不节或劳倦，表现为食欲不振、腹胀便溏、疲倦乏力。调理：健脾益气，可食山药、黄芪、大枣；艾灸足三里。' },
        { name: '脾阳不振', desc: '多由脾气虚发展而来，表现为腹中冷痛、四肢不温、完谷不化。调理：温阳健脾，可食生姜、桂圆、羊肉；忌生冷。' },
        { name: '湿困脾土', desc: '多因外湿或饮食不节，表现为脘腹痞闷、口黏乏味、身重困倦。调理：化湿健脾，可食薏米、冬瓜、陈皮。' }
      ]
    },
    '肺': {
      alias: '肺者，相傅之官',
      function: '肺主气司呼吸，主宣发肃降，通调水道，在体合皮毛，开窍于鼻。肺为华盖，主一身之气，外合皮毛以御外邪。',
      relations: { '五志': '忧', '五味': '辛', '五色': '白', '五季': '秋', '五官': '鼻' },
      tips: [
        '寅时（3-5点）肺经当令，此时宜熟睡，有助肺气肃降',
        '秋季养肺，多食白色食物如百合、银耳、梨、白萝卜',
        '练习腹式呼吸，增强肺活量，每次5-10分钟',
        '避免悲伤过度，悲则气消伤肺',
        '注意防寒保暖，肺主皮毛，外邪最易犯肺'
      ],
      issues: [
        { name: '肺气虚弱', desc: '多因久咳或脾虚及肺，表现为气短懒言、自汗畏风、易感冒。调理：补益肺气，可食黄芪、山药、百合；练习腹式呼吸。' },
        { name: '肺阴亏虚', desc: '多因燥热伤肺或久咳伤阴，表现为干咳少痰、咽干鼻燥。调理：滋阴润肺，可食银耳、百合、梨、蜂蜜。' },
        { name: '风寒犯肺', desc: '多因外感风寒，表现为咳嗽声重、痰稀色白、鼻塞流清涕。调理：疏风散寒，可饮生姜红糖茶、紫苏茶。' }
      ]
    },
    '肾': {
      alias: '肾者，作强之官',
      function: '肾主藏精，主水液代谢，主纳气，在体合骨生髓，开窍于耳。肾为先天之本，藏元阴元阳，是生命活动的根本。',
      relations: { '五志': '恐', '五味': '咸', '五色': '黑', '五季': '冬', '五官': '耳' },
      tips: [
        '酉时（17-19点）肾经当令，此时宜养肾，可按摩腰部',
        '冬季养肾，多食黑色食物如黑芝麻、黑豆、核桃、桑椹',
        '节制房事，保精养肾，不可纵欲过度',
        '避免恐惧惊吓，恐则气下伤肾',
        '坚持叩齿吞津，每日晨起叩齿36次，可固肾气'
      ],
      issues: [
        { name: '肾阳虚衰', desc: '多因年老体衰或久病伤阳，表现为腰膝酸冷、畏寒肢冷、夜尿频多。调理：温补肾阳，可食羊肉、韭菜、核桃；艾灸关元、命门。' },
        { name: '肾阴不足', desc: '多因久病或房劳过度，表现为腰膝酸软、眩晕耳鸣、盗汗潮热。调理：滋补肾阴，可食黑芝麻、枸杞、桑椹、银耳。' },
        { name: '肾气不固', desc: '多因先天不足或年老肾衰，表现为小便频数、遗精滑泄、腰膝无力。调理：固摄肾气，可食芡实、金樱子、核桃；避免劳累。' }
      ]
    },
    '气血': {
      alias: '气血者，人之根本',
      function: '气为血之帅，血为气之母。气能生血、行血、摄血，血能载气、养气。气血充盈则脏腑功能正常，面色红润，精力充沛。',
      relations: { '五志': '—', '五味': '甘', '五色': '黄赤', '五季': '长夏', '五官': '—' },
      tips: [
        '气虚者宜食黄芪、党参、山药、大枣，补益脾气以生化气血',
        '血虚者宜食桂圆、红枣、当归、猪肝，养血补血',
        '气血两虚者可食乌鸡汤、黄芪当归汤，气血双补',
        '避免过度劳累和思虑，劳则耗气，思则气结',
        '适当运动促进气血运行，如散步、太极，但不可大汗淋漓'
      ],
      issues: [
        { name: '气虚', desc: '元气不足，表现为疲倦乏力、气短懒言、自汗、易感冒。调理：补益脾气，可食黄芪、党参、山药、大枣；艾灸足三里、气海穴；练习腹式呼吸。' },
        { name: '血虚', desc: '血液亏虚，表现为面色苍白或萎黄、头晕眼花、心悸失眠、唇舌色淡。调理：养血补血，可食当归、桂圆、红枣、猪肝、乌鸡；按摩三阴交、血海穴。' },
        { name: '气血两虚', desc: '气虚与血虚并见，表现为面色淡白、气短乏力、头晕心悸、月经量少。调理：气血双补，可食黄芪当归乌鸡汤、十全大补汤；避免过度劳累；规律作息。' }
      ]
    }
  };

  let _currentOrgan = '心';

  function initOrganLib() {
    const tabContainer = document.getElementById('healthOrganTabs');
    if (tabContainer) {
      tabContainer.querySelectorAll('.health-organ-tab').forEach(btn => {
        _bindEvent(btn, 'click', () => {
          tabContainer.querySelectorAll('.health-organ-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _currentOrgan = btn.dataset.organ;
          renderOrganDetail();
        });
      });
    }
    renderOrganDetail();
  }

  function renderOrganDetail() {
    const container = document.getElementById('healthOrganDetail');
    if (!container) return;
    const data = ORGAN_DATA[_currentOrgan];
    if (!data) return;
    const relRows = Object.entries(data.relations).map(([k, v]) =>
      `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`
    ).join('');
    const tipsHtml = data.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('');
    const issuesHtml = data.issues.map(iss =>
      `<div class="health-organ-issue"><div class="health-organ-issue-name">${escapeHtml(iss.name)}</div><div class="health-organ-issue-desc">${escapeHtml(iss.desc)}</div></div>`
    ).join('');
    container.innerHTML = `
      <div class="health-organ-header">
        <div class="health-organ-name">${escapeHtml(_currentOrgan)}</div>
        <div class="health-organ-alias">${escapeHtml(data.alias)}</div>
      </div>
      <div class="health-organ-function">${escapeHtml(data.function)}</div>
      <table class="health-organ-table"><tbody>${relRows}</tbody></table>
      <div class="health-organ-section-title">💡 养护要点</div>
      <ul class="health-organ-tips">${tipsHtml}</ul>
      <div class="health-organ-section-title">⚠️ 常见问题</div>
      <div class="health-organ-issues">${issuesHtml}</div>
    `;
  }

  // ===== 情志调养 =====
  const EMOTION_DATA = {
    '喜': {
      organ: '心',
      overperformance: '喜则气缓，过喜则心气涣散，表现为心神不宁、注意力涣散、心悸怔忡，甚则喜笑不休、神志失常。大喜之后常感空虚疲惫。',
      tips: [
        '饮食：莲子、百合、酸枣仁，养心安神',
        '起居：保持规律作息，午时小憩养心',
        '运动：练习静坐冥想，收敛心神',
        '穴位：按揉神门穴、内关穴，宁心安神',
        '情志：以恐惧收敛过喜之气（恐胜喜）'
      ],
      overcome: '恐胜喜——水克火。恐惧能收敛涣散的心气，适度体验敬畏、慎重之感有助于平复过度的喜悦，使心神归位。'
    },
    '怒': {
      organ: '肝',
      overperformance: '怒则气上，暴怒则肝气上逆，表现为头痛眩晕、面红目赤、口苦耳鸣，甚则呕血、昏厥。长期郁怒则肝气郁结，两胁胀痛。',
      tips: [
        '饮食：菊花、决明子、芹菜、苦瓜，清肝泻火',
        '起居：保证丑时（1-3点）深睡，养肝血',
        '运动：户外散步、瑜伽，疏肝理气',
        '穴位：按揉太冲穴、行间穴，平肝降逆',
        '情志：以悲忧平抑怒气（悲胜怒）'
      ],
      overcome: '悲胜怒——金克木。悲忧之情能收敛肝气上逆，适当感受悲悯、反思，有助于平息怒火，使肝气条达。'
    },
    '忧': {
      organ: '肺',
      overperformance: '忧伤肺，忧则气聚，过度忧愁则肺气郁闭，表现为胸闷气短、呼吸不畅、食欲减退，久之面色暗淡、精神萎靡。',
      tips: [
        '饮食：百合、银耳、梨、蜂蜜，润肺解忧',
        '起居：保持室内通风，秋季防燥',
        '运动：腹式呼吸、户外登山，宣发肺气',
        '穴位：按揉膻中穴、肺俞穴，宽胸理气',
        '情志：以喜悦化解忧愁（喜胜忧）'
      ],
      overcome: '喜胜忧——火克金。喜悦之情能驱散忧愁阴霾，与朋友欢笑、看喜剧、听音乐，有助于振奋精神，宣通肺气。'
    },
    '思': {
      organ: '脾',
      overperformance: '思则气结，过度思虑则脾气郁结，表现为食欲不振、腹胀便溏、疲倦乏力，甚则失眠健忘、面色萎黄。',
      tips: [
        '饮食：山药、小米、大枣、陈皮，健脾理气',
        '起居：规律饮食，细嚼慢咽，忌边吃边思',
        '运动：饭后散步、八段锦"调理脾胃须单举"',
        '穴位：按揉足三里、中脘穴，健脾助运',
        '情志：以怒气冲破思虑之结（怒胜思）'
      ],
      overcome: '怒胜思——木克土。适当的愤怒和决断力能打破思虑僵局，勇敢做出选择，有助于疏通郁结的脾气，恢复运化。'
    },
    '悲': {
      organ: '肺',
      overperformance: '悲伤肺，悲则气消，过度悲伤则肺气耗散，表现为呼吸短促、胸闷心悸、精神萎靡、意志消沉，久之毛发枯焦。',
      tips: [
        '饮食：百合、莲子、银耳、牛奶，养肺安神',
        '起居：早睡早起，保证充足睡眠',
        '运动：适度运动如慢跑、太极，振奋阳气',
        '穴位：按揉太渊穴、膻中穴，补益肺气',
        '情志：以喜悦驱散悲伤（喜胜悲）'
      ],
      overcome: '喜胜悲——火克金。喜悦是悲伤的对治，积极参与社交活动、培养兴趣爱好，让阳光驱散内心阴霾，肺气自复。'
    },
    '恐': {
      organ: '肾',
      overperformance: '恐则气下，过度恐惧则肾气不固，表现为二便失禁、腰膝酸软、遗精滑泄，甚则骨酸痿厥、气陷于下。',
      tips: [
        '饮食：核桃、黑芝麻、枸杞、山药，补肾固气',
        '起居：冬季保暖，避免受惊吓',
        '运动：站桩、深蹲，强健下元',
        '穴位：按揉肾俞穴、太溪穴，补肾固摄',
        '情志：以思虑安定恐惧之心（思胜恐）'
      ],
      overcome: '思胜恐——土克水。理性思考和认知能化解恐惧，了解事物真相、制定计划，有助于安定心神，固摄肾气。'
    }
  };

  const CONSTITUTION_EMOTION_MAP = {
    qixu: { tendency: '易忧虑、缺乏自信', advice: '补气健脾可改善忧思倾向，多食黄芪、山药，适当运动提振精神。' },
    yangxu: { tendency: '易恐惧、缺乏安全感', advice: '温阳散寒可增强勇气，多食羊肉、生姜，艾灸关元、命门。' },
    yinxu: { tendency: '易烦躁、心神不宁', advice: '滋阴降火可安定心神，多食银耳、百合，避免熬夜伤阴。' },
    tanshi: { tendency: '易郁闷、思维迟缓', advice: '化痰祛湿可清爽头脑，多食薏米、陈皮，坚持有氧运动。' },
    shire: { tendency: '易急躁、怒火内郁', advice: '清热利湿可平息急躁，多食绿豆、苦瓜，保持环境通风凉爽。' },
    xueyu: { tendency: '易烦躁、情绪不稳', advice: '活血化瘀可疏通情志，多食山楂、玫瑰花，保持心情舒畅。' },
    qiyu: { tendency: '易忧郁、闷闷不乐', advice: '疏肝理气是关键，多食柑橘、玫瑰花，多户外活动释怀。' },
    tebing: { tendency: '易焦虑、紧张不安', advice: '益气固表可增强安全感，多食黄芪、白术，避免过敏原。' },
    pinghe: { tendency: '情绪较稳定平和', advice: '继续保持平衡生活方式，适度调节即可。' }
  };

  let _currentEmotion = null;

  function initEmotionCare() {
    const selector = document.getElementById('healthEmotionSelector');
    if (selector) {
      selector.querySelectorAll('.health-emotion-btn').forEach(btn => {
        _bindEvent(btn, 'click', () => {
          selector.querySelectorAll('.health-emotion-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _currentEmotion = btn.dataset.emotion;
          renderEmotionDetail();
        });
      });
    }
    const saveBtn = document.getElementById('healthDiarySave');
    if (saveBtn) {
      _bindEvent(saveBtn, 'click', saveEmotionDiary);
    }
    loadEmotionDiary();
  }

  async function renderEmotionDetail() {
    const container = document.getElementById('healthEmotionDetail');
    if (!container || !_currentEmotion) {
      if (container) container.innerHTML = '<div class="health-emotion-empty">请选择一种情绪查看调养方法</div>';
      return;
    }
    const data = EMOTION_DATA[_currentEmotion];
    if (!data) return;
    const tipsHtml = data.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('');
    let constitutionNote = '';
    try {
      const setting = await Storage.get('settings', 'health/constitution');
      if (setting && setting.value && setting.value.type) {
        const cData = CONSTITUTION_EMOTION_MAP[setting.value.type];
        if (cData) {
          constitutionNote = `<div class="health-emotion-constitution-note">${escapeHtml(cData.tendency)}。${escapeHtml(cData.advice)}</div>`;
        }
      }
    } catch (e) {}
    container.innerHTML = `
      <div class="health-emotion-organ">"${escapeHtml(_currentEmotion)}"伤${escapeHtml(data.organ)} —— ${escapeHtml(_currentEmotion)}与${escapeHtml(data.organ)}相应，过度则损伤${escapeHtml(data.organ)}气</div>
      <div class="health-emotion-section">
        <div class="health-emotion-section-title">⚡ 过度表现</div>
        <div class="health-emotion-overperformance">${escapeHtml(data.overperformance)}</div>
      </div>
      <div class="health-emotion-section">
        <div class="health-emotion-section-title">🌿 调理方法</div>
        <ul class="health-emotion-tips">${tipsHtml}</ul>
      </div>
      <div class="health-emotion-section">
        <div class="health-emotion-section-title">⚖️ 相克调节</div>
        <div class="health-emotion-overcome">${escapeHtml(data.overcome)}</div>
      </div>
      ${constitutionNote}
    `;
  }

  async function saveEmotionDiary() {
    const emotionSelect = document.getElementById('healthDiaryEmotion');
    const triggerInput = document.getElementById('healthDiaryTrigger');
    if (!emotionSelect || !emotionSelect.value) {
      showToast('请选择情绪类型');
      return;
    }
    const record = {
      date: new Date().toISOString(),
      emotion: emotionSelect.value,
      trigger: triggerInput ? triggerInput.value.trim() : ''
    };
    try {
      const setting = await Storage.get('settings', 'health/emotion');
      let records = (setting && setting.value) || [];
      records.unshift(record);
      if (records.length > 30) records = records.slice(0, 30);
      await Storage.put('settings', { key: 'health/emotion', value: records });
      if (emotionSelect) emotionSelect.value = '';
      if (triggerInput) triggerInput.value = '';
      showToast('情绪已记录 📝');
      loadEmotionDiary();
    } catch (e) {
      showToast('记录失败');
    }
  }

  async function loadEmotionDiary() {
    const container = document.getElementById('healthDiaryRecords');
    if (!container) return;
    try {
      const setting = await Storage.get('settings', 'health/emotion');
      const records = (setting && setting.value) || [];
      if (records.length === 0) {
        container.innerHTML = '<div class="health-diary-empty">暂无记录，记录今天的心情吧</div>';
        return;
      }
      const emotionIcons = { '喜': '😄', '怒': '😤', '忧': '😟', '思': '🤔', '悲': '😢', '恐': '😰' };
      container.innerHTML = records.slice(0, 7).map(r => {
        const d = new Date(r.date);
        const ds = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const icon = emotionIcons[r.emotion] || '😶';
        return `<div class="health-diary-record">
          <span class="health-diary-record-emotion">${icon}</span>
          <div class="health-diary-record-info">
            <div class="health-diary-record-date">${escapeHtml(ds)}</div>
            ${r.trigger ? `<div class="health-diary-record-trigger">${escapeHtml(r.trigger)}</div>` : ''}
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      container.innerHTML = '<div class="health-diary-empty">加载失败</div>';
    }
  }

  // ===== 日期切换 =====
  function shiftDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    updateDateDisplay();
    loadData();
  }
  function goToday() {
    currentDate = new Date();
    updateDateDisplay();
    loadData();
  }

  // ===== 初始化 =====
  async function init(params = {}) {
    console.log('[Health] 健康模块初始化...', params);
    currentDate = new Date();
    updateDateDisplay();
    await loadData();
    initTabs();
    bindWeightEvents();
    bindSleepEvents();
    bindExerciseEvents();
    bindWaterEvents();
    bindDietEvents();
    bindBowelEvents();
    await initMoodCheckin();
    initConstitution();
    initShichen();
    initSeasons();
    initTea();
    initAcupoints();
    initTimerEvents();
    initTongueDiagnosis();
    initQigong();
    initSymptomCheck();
    initFoodLib();
    initOrganLib();
    initEmotionCare();

    // 处理路由参数：切换到指定Tab并滚动到目标卡片
    if (params && Object.keys(params).length > 0) {
      // 延迟执行，确保DOM渲染完成
      requestAnimationFrame(() => {
        handleRouteParams(params);
      });
    }

    // 日期切换
    const prevBtn = document.getElementById('health-prev-day');
    const nextBtn = document.getElementById('health-next-day');
    const todayBtn = document.getElementById('health-today-btn');
    _bindEvent(prevBtn, 'click', () => shiftDate(-1));
    _bindEvent(nextBtn, 'click', () => shiftDate(1));
    _bindEvent(todayBtn, 'click', goToday);
  }

  // ===== 销毁 =====
  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => { if (el) el.removeEventListener(event, handler); });
    _eventListeners = [];
    _intervals.forEach(id => clearInterval(id));
    _intervals = [];
    _timeouts.forEach(id => clearTimeout(id));
    _timeouts = [];
    _breathingState.running = false;
    _timerState.running = false;
    console.log('[HealthModule] 模块已销毁');
  }

  return { init, destroy, switchHealthTab };
})();
