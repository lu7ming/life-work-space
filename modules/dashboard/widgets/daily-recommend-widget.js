/**
 * daily-recommend-widget.js - 今日推荐组件
 * 人生工作台 · 生活推荐卡片 + 金句诗词双卡片
 * 从 Dashboard 拆分而出 (v125)
 */
import { AppUtils } from '../../../core/utils.js';
import { Storage } from '../../../core/storage.js';

const DailyRecommendWidget = (() => {
  const { escapeHtml, getTodayStr } = AppUtils;
  let _eventListeners = [];

  function _bindEvent(el, event, handler) {
    if (el) { el.addEventListener(event, handler); _eventListeners.push({ el, event, handler }); }
  }

  // ===== v95: 今日推荐 =====
  /**
   * 今日推荐：静态素材库 + AI 动态生成
   * 每天 8:00 后首次打开触发更新，localStorage 缓存当日结果
   */

  // 分类配置
  const DAILY_RECOMMEND_CATEGORIES = {
    tea:    { key: 'tea',    label: '今日茶饮',     emoji: '🍵', accent: '#6B9E7D' },
    food:   { key: 'food',   label: '今日饮食',     emoji: '🍜', accent: '#E8A87C' },
    sport:  { key: 'sport',  label: '今日运动',     emoji: '🏃', accent: '#5B8DB8' },
    health: { key: 'health', label: '今日养生提示', emoji: '💡', accent: '#D98CA0' }
  };

  // ===== 静态素材库（按季节/节气分类，通用不按体质筛选） =====
  const DAILY_RECOMMEND_POOL = {
    tea: {
      spring: [
        { name: '玫瑰花茶', desc: '疏肝理气，温养心脉，适合春日升发', tags: ['疏肝', '养颜', '温性'] },
        { name: '茉莉绿茶', desc: '清香醒脾，提神解郁，缓解春困', tags: ['提神', '解郁', '清润'] },
        { name: '陈皮普洱茶', desc: '健脾燥湿，理气和胃，化湿解腻', tags: ['健脾', '祛湿', '温性'] },
        { name: '桂花乌龙茶', desc: '温胃散寒，化痰散瘀，香气怡人', tags: ['温胃', '散寒', '理气'] },
        { name: '枸杞菊花茶', desc: '清肝明目，滋阴润燥，适合久视人群', tags: ['明目', '养肝', '清润'] },
        { name: '佛手柑红茶', desc: '疏肝和胃，行气解郁，口感温润', tags: ['疏肝', '和胃', '温性'] },
        { name: '生姜红枣茶', desc: '温中散寒，补气养血，晨起暖身', tags: ['暖身', '驱寒', '补血'] },
        { name: '蜂蜜柚子茶', desc: '理气化痰，润肺清肠，酸甜适口', tags: ['润肺', '化痰', '清爽'] },
        { name: '大麦茶', desc: '健脾消食，下气利水，解腻开胃', tags: ['健脾', '消食', '平性'] },
        { name: '合欢花茶', desc: '解郁安神，理气和胃，舒缓情绪', tags: ['安神', '解郁', '舒缓'] }
      ],
      summer: [
        { name: '冬瓜荷叶茶', desc: '清暑利湿，消脂利水，夏日清爽', tags: ['清暑', '祛湿', '消脂'] },
        { name: '绿豆汤', desc: '清热解毒，消暑利水，夏季必备', tags: ['清热', '解暑', '解毒'] },
        { name: '金银花茶', desc: '清热解毒，疏散风热，夏日常备', tags: ['清热', '解毒', '疏风'] },
        { name: '柠檬蜂蜜水', desc: '生津止渴，美白养颜，补充维C', tags: ['生津', '维C', '养颜'] },
        { name: '薄荷绿茶', desc: '疏风散热，清利头目，提神醒脑', tags: ['疏风', '清热', '提神'] },
        { name: '酸梅汤', desc: '生津止渴，敛肺止咳，开胃解腻', tags: ['生津', '开胃', '解暑'] },
        { name: '菊花茶', desc: '清肝明目，清热解毒，夏日降火', tags: ['清肝', '明目', '降火'] },
        { name: '百合莲子茶', desc: '清心安神，润肺止咳，夏日养心', tags: ['清心', '安神', '润肺'] },
        { name: '茅根竹蔗水', desc: '清热利尿，生津止渴，清润甘甜', tags: ['清热', '生津', '利尿'] },
        { name: '红豆薏米水', desc: '健脾祛湿，利水消肿，夏日常备', tags: ['祛湿', '健脾', '消肿'] },
        { name: '夏枯草茶', desc: '清肝泻火，散结消肿，降火明目', tags: ['清肝', '泻火', '散结'] },
        { name: '西洋参茶', desc: '补气养阴，清热生津，夏日补气不上火', tags: ['补气', '养阴', '清润'] }
      ],
      autumn: [
        { name: '银耳雪梨羹', desc: '润肺生津，滋阴润燥，秋季养生首选', tags: ['润肺', '滋阴', '润燥'] },
        { name: '蜂蜜柚子茶', desc: '理气化痰，润肺清肠，缓解秋燥', tags: ['润肺', '化痰', '清肠'] },
        { name: '桂花乌龙茶', desc: '温胃散寒，行气止痛，秋凉暖身', tags: ['温胃', '散寒', '理气'] },
        { name: '杏仁茶', desc: '润肺止咳，润肠通便，秋燥适宜', tags: ['润肺', '止咳', '润肠'] },
        { name: '陈皮山楂茶', desc: '理气健脾，消食化积，解腻开胃', tags: ['健脾', '消食', '理气'] },
        { name: '红枣桂圆茶', desc: '补气养血，安神健脾，秋日温补', tags: ['补血', '安神', '温性'] },
        { name: '麦冬枸杞茶', desc: '滋阴润肺，养肝明目，润燥生津', tags: ['滋阴', '润肺', '明目'] },
        { name: '罗汉果茶', desc: '清肺利咽，化痰止咳，秋季护嗓', tags: ['清肺', '利咽', '润喉'] },
        { name: '大麦茶', desc: '健脾消食，下气利水，养胃护胃', tags: ['健脾', '养胃', '平性'] },
        { name: '玉竹沙参茶', desc: '养阴润燥，生津止渴，秋季滋阴', tags: ['养阴', '润燥', '生津'] },
        { name: '梨汁藕粉', desc: '清热生津，润肺止咳，温润养胃', tags: ['润肺', '生津', '养胃'] }
      ],
      winter: [
        { name: '红糖姜茶', desc: '温中散寒，暖胃暖宫，冬日暖身首选', tags: ['暖身', '驱寒', '温胃'] },
        { name: '红枣桂圆茶', desc: '补气养血，安神健脾，冬季温补', tags: ['补血', '安神', '温补'] },
        { name: '当归红枣茶', desc: '补血活血，调经止痛，冬日养颜', tags: ['补血', '活血', '养颜'] },
        { name: '黄芪枸杞茶', desc: '补气升阳，养肝明目，增强体质', tags: ['补气', '养肝', '增强免疫'] },
        { name: '肉桂红茶', desc: '温中补阳，散寒止痛，暖身驱寒', tags: ['温阳', '驱寒', '暖身'] },
        { name: '姜枣枸杞茶', desc: '温中散寒，补气养血，冬日日常', tags: ['驱寒', '补血', '温性'] },
        { name: '核桃芝麻糊', desc: '补肾益脑，养发乌发，冬日进补', tags: ['补肾', '养发', '益脑'] },
        { name: '陈皮普洱熟茶', desc: '健脾燥湿，暖胃护胃，消食解腻', tags: ['健脾', '暖胃', '祛湿'] },
        { name: '桂花红枣茶', desc: '温中散寒，补气养血，香气怡人', tags: ['散寒', '补血', '温胃'] },
        { name: '党参红枣茶', desc: '补中益气，养血安神，冬日补气', tags: ['补气', '养血', '安神'] },
        { name: '羊肉萝卜汤', desc: '温中补虚，益气补血，冬日进补佳品', tags: ['温补', '补虚', '益气'] },
        { name: '山药薏米粥', desc: '健脾祛湿，补肺益肾，温润养人', tags: ['健脾', '祛湿', '益肾'] }
      ]
    },
    food: {
      spring: [
        { name: '韭菜炒鸡蛋', desc: '温补肾阳，春升阳气，简单家常', tags: ['温阳', '补肾', '家常菜'] },
        { name: '香椿豆腐', desc: '清热解毒，健脾理气，应季春味', tags: ['清热', '健脾', '应季'] },
        { name: '春笋炒肉', desc: '清热化痰，益气和胃，鲜嫩可口', tags: ['清热', '化痰', '鲜嫩'] },
        { name: '菠菜猪肝汤', desc: '补血明目，养肝养血，春季养肝', tags: ['补血', '养肝', '明目'] },
        { name: '山药排骨汤', desc: '健脾益胃，补肺益肾，温润滋补', tags: ['健脾', '益肾', '滋补'] },
        { name: '荠菜馄饨', desc: '清热利水，平肝明目，春日鲜味', tags: ['清热', '平肝', '应季'] },
        { name: '红枣桂圆粥', desc: '补气养血，安神健脾，晨起养胃', tags: ['补血', '安神', '养胃'] },
        { name: '豆芽炒韭菜', desc: '疏肝理气，清热解毒，升发阳气', tags: ['疏肝', '清热', '升阳'] },
        { name: '枸杞叶猪肝汤', desc: '清肝明目，养血补虚，春季养肝', tags: ['清肝', '明目', '养血'] },
        { name: '小米南瓜粥', desc: '健脾和胃，补中益气，温和养胃', tags: ['健脾', '养胃', '平性'] },
        { name: '陈皮蒸排骨', desc: '理气健脾，消食开胃，鲜香入味', tags: ['健脾', '理气', '开胃'] }
      ],
      summer: [
        { name: '冬瓜薏米汤', desc: '清暑祛湿，利水消肿，夏日汤品首选', tags: ['清暑', '祛湿', '消肿'] },
        { name: '绿豆粥', desc: '清热解毒，消暑利水，夏日降温', tags: ['清热', '解暑', '解毒'] },
        { name: '苦瓜炒蛋', desc: '清热解毒，明目降火，夏日降火菜', tags: ['清热', '降火', '明目'] },
        { name: '丝瓜炒蛋', desc: '清热化痰，凉血解毒，清淡爽口', tags: ['清热', '化痰', '清淡'] },
        { name: '凉拌黄瓜', desc: '清热利水，解毒消肿，爽口开胃', tags: ['清热', '利水', '爽口'] },
        { name: '莲子百合粥', desc: '清心安神，润肺止咳，夏日养心', tags: ['清心', '安神', '润肺'] },
        { name: '酸汤鱼片', desc: '开胃健脾，清热解暑，酸辣开胃', tags: ['开胃', '健脾', '解暑'] },
        { name: '番茄鸡蛋汤', desc: '生津止渴，健胃消食，家常经典', tags: ['生津', '健胃', '家常'] },
        { name: '荷叶蒸饭', desc: '清暑利湿，健脾开胃，清香怡人', tags: ['清暑', '健脾', '祛湿'] },
        { name: '凉拌木耳', desc: '清肺润燥，益气补血，爽口养生', tags: ['清肺', '补血', '爽口'] },
        { name: '红豆薏米粥', desc: '健脾祛湿，利水消肿，夏日常备', tags: ['祛湿', '健脾', '消肿'] },
        { name: '清蒸鲈鱼', desc: '健脾益气，补肝肾，清淡鲜美', tags: ['健脾', '益气', '清淡'] }
      ],
      autumn: [
        { name: '银耳百合羹', desc: '润肺生津，滋阴润燥，秋季润燥首选', tags: ['润肺', '滋阴', '润燥'] },
        { name: '冰糖雪梨', desc: '润肺止咳，清热化痰，秋燥必备', tags: ['润肺', '止咳', '化痰'] },
        { name: '板栗烧鸡', desc: '健脾养胃，补肾强筋，秋日进补', tags: ['健脾', '补肾', '温补'] },
        { name: '山药炖排骨', desc: '健脾益胃，补肺益肾，温润滋补', tags: ['健脾', '益肾', '滋补'] },
        { name: '莲藕排骨汤', desc: '清热凉血，健脾开胃，秋季时令', tags: ['清热', '健脾', '应季'] },
        { name: '南瓜粥', desc: '健脾和胃，补中益气，温润养胃', tags: ['健脾', '养胃', '平性'] },
        { name: '白萝卜炖羊肉', desc: '温中补虚，益气补血，秋凉进补', tags: ['温补', '补虚', '益气'] },
        { name: '桂花糯米藕', desc: '健脾止泻，补中益气，香甜可口', tags: ['健脾', '益气', '甜品'] },
        { name: '栗子粥', desc: '健脾养胃，补肾强筋，秋日暖粥', tags: ['健脾', '补肾', '暖身'] },
        { name: '山楂糕', desc: '消食化积，活血散瘀，开胃解腻', tags: ['消食', '开胃', '解腻'] },
        { name: '杏仁露', desc: '润肺止咳，润肠通便，润燥养颜', tags: ['润肺', '止咳', '养颜'] }
      ],
      winter: [
        { name: '羊肉萝卜汤', desc: '温中补虚，益气补血，冬日进补首选', tags: ['温补', '补虚', '益气'] },
        { name: '红糖姜枣茶', desc: '温中散寒，暖胃暖宫，冬日暖身', tags: ['暖身', '驱寒', '温胃'] },
        { name: '当归黄芪炖鸡', desc: '补气养血，温中补虚，冬季大补', tags: ['补血', '补气', '温补'] },
        { name: '山药枸杞粥', desc: '健脾益肾，养肝明目，温润养人', tags: ['健脾', '益肾', '明目'] },
        { name: '板栗焖鸡', desc: '健脾养胃，补肾强筋，冬日家常菜', tags: ['健脾', '补肾', '家常'] },
        { name: '萝卜牛腩煲', desc: '健脾益胃，补气养血，冬日暖煲', tags: ['健脾', '补气', '暖身'] },
        { name: '桂圆红枣粥', desc: '补气养血，安神健脾，晨起暖粥', tags: ['补血', '安神', '温性'] },
        { name: '姜母鸭', desc: '温中补虚，滋阴补血，冬日经典', tags: ['温补', '补虚', '滋阴'] },
        { name: '核桃芝麻糊', desc: '补肾益脑，养发乌发，冬日进补', tags: ['补肾', '养发', '益脑'] },
        { name: '猪肚鸡汤', desc: '温中健脾，补气养血，养胃滋补', tags: ['健脾', '养胃', '滋补'] },
        { name: '四神汤', desc: '健脾祛湿，补肺益肾，温润平和', tags: ['健脾', '祛湿', '益肾'] },
        { name: '酒酿汤圆', desc: '补中益气，温胃散寒，甜蜜暖身', tags: ['补气', '暖身', '甜品'] }
      ]
    },
    sport: {
      spring: [
        { name: '晨间散步', desc: '春阳升发，晨起户外散步30分钟，舒展筋骨', tags: ['轻运动', '户外', '舒缓'] },
        { name: '八段锦', desc: '柔和养身，调理气血，适合春季阳气升发', tags: ['养生', '柔和', '气血'] },
        { name: '瑜伽拉伸', desc: '舒展肝经，柔筋健骨，缓解春困', tags: ['拉伸', '柔韧', '放松'] },
        { name: '慢跑', desc: '增强心肺，促进循环，春日慢跑神清气爽', tags: ['有氧', '心肺', '户外'] },
        { name: '太极拳', desc: '调和阴阳，疏通经络，春日养气首选', tags: ['养生', '调和', '气血'] },
        { name: '爬山踏青', desc: '亲近自然，登高望远，舒展身心', tags: ['户外', '有氧', '愉悦'] },
        { name: '放风筝', desc: '活动肩颈，放松眼睛，春日趣味运动', tags: ['趣味', '户外', '肩颈'] },
        { name: '快走', desc: '提升代谢，促进循环，简单易坚持', tags: ['有氧', '代谢', '易坚持'] },
        { name: '跳绳', desc: '全身燃脂，提高协调，高效有氧', tags: ['燃脂', '全身', '高效'] }
      ],
      summer: [
        { name: '游泳', desc: '全身运动，消暑降温，夏日首选运动', tags: ['全身', '消暑', '有氧'] },
        { name: '清晨瑜伽', desc: '避开高温，晨起练习，唤醒身体', tags: ['舒缓', '柔韧', '晨起'] },
        { name: '室内骑行', desc: '有氧运动，避开烈日，高效燃脂', tags: ['有氧', '燃脂', '室内'] },
        { name: '羽毛球', desc: '全身协调，反应训练，趣味对抗', tags: ['对抗', '协调', '趣味'] },
        { name: '傍晚慢跑', desc: '气温下降，户外慢跑，清爽舒适', tags: ['有氧', '户外', '傍晚'] },
        { name: '水上瑜伽', desc: '舒缓放松，保护关节，夏日降温', tags: ['舒缓', '放松', '水中'] },
        { name: '跳绳', desc: '高效燃脂，提升心肺，短时高效', tags: ['燃脂', '心肺', '高效'] },
        { name: '乒乓球', desc: '眼手协调，反应训练，室内运动', tags: ['协调', '反应', '室内'] },
        { name: '普拉提', desc: '核心强化，体态调整，室内塑形', tags: ['核心', '塑形', '室内'] },
        { name: '太极', desc: '心静体松，调和阴阳，夏练三伏', tags: ['养生', '调和', '舒缓'] }
      ],
      autumn: [
        { name: '登山赏秋', desc: '登高望远，秋日美景，有氧运动', tags: ['户外', '有氧', '愉悦'] },
        { name: '慢跑', desc: '秋高气爽，户外慢跑，增强心肺', tags: ['有氧', '心肺', '户外'] },
        { name: '骑行', desc: '秋日骑行，风景宜人，全身运动', tags: ['有氧', '户外', '全身'] },
        { name: '羽毛球', desc: '气温适宜，对抗运动，全身协调', tags: ['对抗', '协调', '趣味'] },
        { name: '八段锦', desc: '养肺润燥，调和气血，秋季养生', tags: ['养生', '养肺', '气血'] },
        { name: '太极拳', desc: '秋收冬藏，静养心神，调和阴阳', tags: ['养生', '静心', '调和'] },
        { name: '快走', desc: '秋日健走，强身健体，简单易行', tags: ['有氧', '代谢', '易坚持'] },
        { name: '网球', desc: '全身运动，反应训练，户外对抗', tags: ['对抗', '全身', '户外'] },
        { name: '瑜伽', desc: '柔韧拉伸，舒缓压力，秋收内敛', tags: ['柔韧', '放松', '舒缓'] },
        { name: '徒步', desc: '亲近自然，锻炼耐力，秋日远足', tags: ['户外', '耐力', '自然'] }
      ],
      winter: [
        { name: '室内瑜伽', desc: '温暖室内，舒展筋骨，调养身心', tags: ['柔韧', '放松', '室内'] },
        { name: '跳绳', desc: '高效燃脂，快速暖身，冬日运动首选', tags: ['燃脂', '暖身', '高效'] },
        { name: '健身房力量训练', desc: '冬藏积蓄，增肌塑形，提升代谢', tags: ['力量', '增肌', '室内'] },
        { name: '八段锦', desc: '温和养身，驱寒暖身，室内可练', tags: ['养生', '驱寒', '温和'] },
        { name: '太极拳', desc: '冬练三九，养精蓄锐，增强体质', tags: ['养生', '增强体质', '调和'] },
        { name: '室内游泳', desc: '恒温泳池，全身运动，锻炼心肺', tags: ['全身', '心肺', '室内'] },
        { name: '爬楼梯', desc: '高效燃脂，提升心肺，随时随地', tags: ['燃脂', '心肺', '便捷'] },
        { name: 'HIIT 训练', desc: '高强度间歇，短时高效，快速燃脂', tags: ['燃脂', '高效', '短时'] },
        { name: '普拉提', desc: '核心强化，体态调整，室内塑形', tags: ['核心', '塑形', '室内'] },
        { name: '冬日长跑', desc: '锻炼意志，增强心肺，做好保暖', tags: ['有氧', '意志', '户外'] },
        { name: '室内骑行', desc: '有氧运动，温暖室内，高效燃脂', tags: ['有氧', '燃脂', '室内'] }
      ]
    },
    health: {
      spring: [
        { name: '夜卧早起', desc: '顺应春升之气，晚睡早起，舒展形体', tags: ['作息', '春生', '舒展'] },
        { name: '梳头百下', desc: '疏通头部经络，提神醒脑，升发阳气', tags: ['经络', '提神', '头面'] },
        { name: '揉按太冲穴', desc: '疏肝解郁，清肝泻火，缓解情绪', tags: ['疏肝', '解郁', '穴位'] },
        { name: '多吃绿色食物', desc: '青色入肝，多食绿叶蔬菜助养肝', tags: ['饮食', '养肝', '绿色'] },
        { name: '春日踏青', desc: '亲近自然，疏解肝郁，舒畅情志', tags: ['情志', '户外', '养肝'] },
        { name: '防风御寒', desc: '春捂秋冻，不急减衣，防风寒侵袭', tags: ['起居', '保暖', '防风'] },
        { name: '伸懒腰拉伸', desc: '舒展筋骨，疏通经络，缓解春困', tags: ['拉伸', '经络', '春困'] },
        { name: '少食酸味', desc: '春日省酸增甘，以养脾气，健脾为先', tags: ['饮食', '健脾', '养生原则'] },
        { name: '按摩足三里', desc: '健脾和胃，扶正培元，强身健体', tags: ['健脾', '穴位', '强身'] },
        { name: '早起深呼吸', desc: '吐故纳新，清肺理气，提升能量', tags: ['呼吸', '清肺', '晨起'] }
      ],
      summer: [
        { name: '午睡养心', desc: '午时小憩，养心安神，补充精力', tags: ['作息', '养心', '安神'] },
        { name: '多吃红色食物', desc: '赤色入心，多食红豆番茄养心', tags: ['饮食', '养心', '红色'] },
        { name: '心静自然凉', desc: '调息静心，避免情绪过激，心火自消', tags: ['情志', '静心', '降火'] },
        { name: '温水洗澡', desc: '温水清洁，舒张毛孔，降温消暑', tags: ['起居', '消暑', '清洁'] },
        { name: '少食生冷', desc: '夏日脾胃虚寒，忌过食生冷伤阳', tags: ['饮食', '健脾', '禁忌'] },
        { name: '出汗有度', desc: '夏宜出汗但不可大汗淋漓，耗伤心液', tags: ['运动', '适度', '养心'] },
        { name: '按揉内关穴', desc: '宁心安神，理气止痛，护心要穴', tags: ['养心', '穴位', '安神'] },
        { name: '饮食清淡', desc: '夏日饮食宜清淡，少油少盐护脾胃', tags: ['饮食', '清淡', '健脾'] },
        { name: '补钾防困', desc: '多吃含钾食物，缓解夏日疲倦乏力', tags: ['饮食', '补钾', '抗疲劳'] },
        { name: '冬病夏治', desc: '三伏天艾灸贴敷，温阳散寒治冬病', tags: ['艾灸', '温阳', '调理'] },
        { name: '避免直吹空调', desc: '空调温度不宜过低，防止风寒入侵', tags: ['起居', '保暖', '禁忌'] }
      ],
      autumn: [
        { name: '早卧早起', desc: '顺应秋收之气，早睡早起，收敛神气', tags: ['作息', '秋收', '收敛'] },
        { name: '润肺防燥', desc: '秋燥伤肺，多食润肺食物，多喝水', tags: ['润肺', '防燥', '饮食'] },
        { name: '多吃白色食物', desc: '白色入肺，多食百合银耳雪梨润肺', tags: ['饮食', '润肺', '白色'] },
        { name: '登高望远', desc: '秋高气爽，登山远眺，舒缓情志', tags: ['情志', '户外', '舒缓'] },
        { name: '按揉迎香穴', desc: '润肺通窍，缓解鼻干，预防秋燥', tags: ['润肺', '穴位', '通窍'] },
        { name: '秋冻有度', desc: '秋冻适度，增强耐寒能力，循序渐进', tags: ['起居', '耐寒', '适度'] },
        { name: '少辛增酸', desc: '秋日省辛增酸，收敛肺气，养肝血', tags: ['饮食', '养肺', '养生原则'] },
        { name: '保持心情舒畅', desc: '秋悲易忧，调畅情志，避免悲秋', tags: ['情志', '调畅', '防悲秋'] },
        { name: '按摩鱼际穴', desc: '清肺利咽，调理肺气，秋季护肺', tags: ['养肺', '穴位', '利咽'] },
        { name: '温水泡脚', desc: '温通经络，促进循环，改善睡眠', tags: ['经络', '睡眠', '温通'] },
        { name: '补充津液', desc: '秋季干燥，及时补水，多吃生津食物', tags: ['饮食', '生津', '润燥'] }
      ],
      winter: [
        { name: '早卧晚起', desc: '顺应冬藏之气，早睡晚起，养精蓄锐', tags: ['作息', '冬藏', '养精'] },
        { name: '多吃黑色食物', desc: '黑色入肾，多食黑豆黑芝麻补肾', tags: ['饮食', '补肾', '黑色'] },
        { name: '注意保暖', desc: '冬日防寒，尤其头脚背保暖', tags: ['起居', '保暖', '防寒'] },
        { name: '温水泡脚', desc: '温经散寒，补肾安神，冬日必备', tags: ['驱寒', '补肾', '安神'] },
        { name: '按揉涌泉穴', desc: '补肾固元，引火归元，冬日养肾', tags: ['补肾', '穴位', '固本'] },
        { name: '晒背补阳', desc: '冬日晒背，温补阳气，驱寒暖身', tags: ['补阳', '驱寒', '自然疗法'] },
        { name: '减少出汗', desc: '冬宜闭藏，少出汗以护阳气', tags: ['运动', '适度', '闭藏'] },
        { name: '膏方进补', desc: '冬令进补，膏方调养，增强体质', tags: ['进补', '调理', '增强体质'] },
        { name: '艾灸关元穴', desc: '温补肾阳，培元固本，冬日保健', tags: ['艾灸', '补肾', '温阳'] },
        { name: '静养心神', desc: '冬主闭藏，静养心神，收敛精气', tags: ['情志', '静养', '闭藏'] },
        { name: '多喝热水', desc: '冬日温饮，护胃暖身，促进代谢', tags: ['饮食', '暖身', '代谢'] },
        { name: '搓手暖耳', desc: '促进末梢循环，防止冻伤，提神醒脑', tags: ['经络', '循环', '防冻'] }
      ]
    }
  };

  /**
   * 获取当前季节
   */
  function _getSeason() {
    const month = new Date().getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  }

  /**
   * 获取当前节气名称（最近的节气）
   */
  function _getCurrentSolarTermName() {
    const today = new Date();
    const year = today.getFullYear();
    const solarTerms = [
      { name: '小寒', m: 0, d: 5 },  { name: '大寒', m: 0, d: 20 },
      { name: '立春', m: 1, d: 4 },  { name: '雨水', m: 1, d: 18 },
      { name: '惊蛰', m: 2, d: 5 },  { name: '春分', m: 2, d: 20 },
      { name: '清明', m: 3, d: 5 },  { name: '谷雨', m: 3, d: 20 },
      { name: '立夏', m: 4, d: 5 },  { name: '小满', m: 4, d: 21 },
      { name: '芒种', m: 5, d: 5 },  { name: '夏至', m: 5, d: 21 },
      { name: '小暑', m: 6, d: 7 },  { name: '大暑', m: 6, d: 22 },
      { name: '立秋', m: 7, d: 7 },  { name: '处暑', m: 7, d: 23 },
      { name: '白露', m: 8, d: 7 },  { name: '秋分', m: 8, d: 23 },
      { name: '寒露', m: 9, d: 8 },  { name: '霜降', m: 9, d: 23 },
      { name: '立冬', m: 10, d: 7 }, { name: '小雪', m: 10, d: 22 },
      { name: '大雪', m: 11, d: 7 }, { name: '冬至', m: 11, d: 21 }
    ];
    const todayMs = new Date(year, today.getMonth(), today.getDate()).getTime();
    let current = solarTerms[0];
    for (const term of solarTerms) {
      const termMs = new Date(year, term.m, term.d).getTime();
      if (termMs <= todayMs) current = term;
    }
    return current.name;
  }

  /**
   * 根据日期确定今日推荐索引（确定性伪随机，按日期轮换）
   */
  function _getDailyIndex(seedStr, total) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % total;
  }

  /**
   * 从静态素材库获取今日推荐（按季节+日期轮换）
   */
  function _getStaticRecommendations() {
    const season = _getSeason();
    const todayStr = getTodayStr();
    const result = {};
    for (const key of Object.keys(DAILY_RECOMMEND_CATEGORIES)) {
      const pool = DAILY_RECOMMEND_POOL[key]?.[season] || [];
      if (pool.length === 0) continue;
      const idx = _getDailyIndex(todayStr + key, pool.length);
      result[key] = pool[idx];
    }
    return result;
  }

  /**
   * 调用 DeepSeek AI 动态生成今日推荐
   */
  async function _getAIRecommendations() {
    let token = null;
    try {
      if (window.SecureStorage?.loadSecure) {
        token = await window.SecureStorage?.loadSecure('deepseek_token');
      }
      if (!token) {
        const setting = await Storage.get('settings', 'deepseek_token');
        token = setting ? setting.value : null;
      }
    } catch (e) { /* 无 token */ }

    // 如果用户未配置 token，使用题目中提供的备用 key
    if (!token) {
      token = 'sk-7d26426c7c0c456981042a89800abdc3';
    }

    const season = _getSeason();
    const seasonMap = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' };
    const termName = _getCurrentSolarTermName();
    const todayStr = getTodayStr();

    const seasonCn = seasonMap[season] || '秋季';
    const constitution = '脾虚寒、湿气重、中焦不通、气血不足';

    const prompt = `你是养生专家，请为今日（${todayStr}，${seasonCn}，节气：${termName}）生成4条推荐。
用户体质：${constitution}。但推荐内容以时令通用为主，兼顾体质。

请输出严格的 JSON 格式，包含4个分类，每个分类包含 name、desc、tags（2-3个标签）：
{
  "tea":    { "name": "茶饮名称", "desc": "一句话说明功效", "tags": ["标签1", "标签2"] },
  "food":   { "name": "饮食名称", "desc": "一句话说明功效", "tags": ["标签1", "标签2"] },
  "sport":  { "name": "运动名称", "desc": "一句话说明功效", "tags": ["标签1", "标签2"] },
  "health": { "name": "养生提示", "desc": "一句话说明内容", "tags": ["标签1", "标签2"] }
}

要求：
1. 结合${seasonCn}季节特点和${termName}节气特点
2. 内容丰富实用，贴近日常
3. 名称简洁，说明在20-30字之间
4. 标签2-3个，4个字以内
5. 只输出JSON，不要其他文字`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 600
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        console.warn('[DailyRecommend] AI 请求失败:', resp.status);
        return null;
      }

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content;
      if (!reply) return null;

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const result = JSON.parse(jsonMatch[0]);

      // 校验结构
      const required = ['tea', 'food', 'sport', 'health'];
      for (const key of required) {
        if (!result[key] || !result[key].name || !result[key].desc) {
          console.warn('[DailyRecommend] AI 结果缺少字段:', key);
          return null;
        }
        if (!Array.isArray(result[key].tags)) result[key].tags = [];
      }

      return result;
    } catch (e) {
      console.warn('[DailyRecommend] AI 调用异常:', e.message);
      return null;
    }
  }

  /**
   * 检查是否需要更新（8点后新的一天）
   */
  function _shouldUpdateToday(cacheKey) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return true;
      const parsed = JSON.parse(cached);
      const today = getTodayStr();
      if (parsed.date !== today) return true;

      // 如果还没到8点，且缓存是昨天/更早，也已过期（上面 date 比较已处理）
      // 如果已到8点但缓存是今天8点前的，需要检查
      const nowHour = new Date().getHours();
      if (nowHour >= 8 && parsed.generatedHour !== undefined && parsed.generatedHour < 8) {
        return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  /**
   * 渲染今日推荐
   */
  async function renderDailyRecommend() {
    const track = document.getElementById('dash-daily-recommend-track');
    const updateEl = document.getElementById('dash-daily-recommend-update');
    if (!track) return;

    const cacheKey = `daily_recommend_${getTodayStr()}`;
    const now = new Date();
    const nowHour = now.getHours();

    // 1. 先展示静态数据（快速响应）
    let recommendations = _getStaticRecommendations();
    _renderRecommendCards(recommendations, 'static');
    if (updateEl) updateEl.textContent = nowHour >= 8 ? '每日 8:00 更新' : '今日 8:00 更新';

    // 2. 如果已到8点且需要更新，后台异步请求 AI
    if (nowHour >= 8 && _shouldUpdateToday(cacheKey)) {
      console.log('[DailyRecommend] 触发 AI 生成今日推荐...');
      const aiResult = await _getAIRecommendations();
      if (aiResult) {
        // AI 生成成功，缓存并更新展示
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            date: getTodayStr(),
            generatedHour: nowHour,
            source: 'ai',
            data: aiResult
          }));
        } catch (e) { /* 忽略存储错误 */ }
        recommendations = aiResult;
        _renderRecommendCards(recommendations, 'ai');
        if (updateEl) updateEl.textContent = '今日已更新 ✨';
      } else {
        // AI 失败，保留静态数据作为 fallback
        console.log('[DailyRecommend] AI 生成失败，使用静态素材');
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            date: getTodayStr(),
            generatedHour: nowHour,
            source: 'static',
            data: recommendations
          }));
        } catch (e) { /* 忽略 */ }
      }
    } else {
      // 未到8点或已有缓存，尝试读取缓存
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.data) {
            recommendations = parsed.data;
            _renderRecommendCards(recommendations, parsed.source || 'cached');
            if (updateEl && parsed.source === 'ai') {
              updateEl.textContent = '今日已更新 ✨';
            }
          }
        }
      } catch (e) { /* 忽略缓存错误 */ }
    }
  }

  /**
   * 渲染推荐卡片到 DOM
   */
  function _renderRecommendCards(recommendations, source) {
    const track = document.getElementById('dash-daily-recommend-track');
    if (!track) return;

    const order = ['tea', 'food', 'sport', 'health'];
    let html = '';

    for (const key of order) {
      const cat = DAILY_RECOMMEND_CATEGORIES[key];
      const item = recommendations[key];
      if (!cat || !item) continue;

      const tagsHtml = (item.tags || [])
        .slice(0, 3)
        .map(t => `<span class="dash-daily-card-tag">${escapeHtml(t)}</span>`)
        .join('');

      html += `
        <div class="dash-daily-card" style="--card-accent: ${cat.accent};" data-source="${source}">
          <span class="dash-daily-card-emoji">${cat.emoji}</span>
          <span class="dash-daily-card-category">${cat.label}</span>
          <div class="dash-daily-card-name">${escapeHtml(item.name)}</div>
          <div class="dash-daily-card-desc">${escapeHtml(item.desc)}</div>
          <div class="dash-daily-card-tags">${tagsHtml}</div>
        </div>
      `;
    }

    track.innerHTML = html;
  }

  // ===== v100: 今日文字推荐（金句 + 诗词双卡片） =====
  /**
   * 文字推荐：每天同时展示一条金句 + 一首诗词
   * 静态 JSON 数据 + 各自独立刷新按钮
   */

  const TEXT_CARD_CONFIG = {
    quote: {
      typeLabel: '📖 今日金句',
      textId: 'dash-quote-text',
      sourceId: 'dash-quote-source',
      refreshId: 'dash-quote-refresh',
      poolKey: 'quote'
    },
    poem: {
      typeLabel: '🏯 今日诗词',
      textId: 'dash-poem-text',
      sourceId: 'dash-poem-source',
      refreshId: 'dash-poem-refresh',
      poolKey: 'poem'
    }
  };

  let _textRecommendCache = null;
  const _textCardIdx = { quote: 0, poem: 0 };

  async function _loadTextRecommendData() {
    if (_textRecommendCache) return _textRecommendCache;
    try {
      const resp = await fetch('./data/daily-text-recommend.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      _textRecommendCache = await resp.json();
      return _textRecommendCache;
    } catch (e) {
      console.warn('[TextRecommend] 加载文字推荐数据失败:', e.message);
      // 内置兜底数据
      _textRecommendCache = {
        quote: [{ text: '今天也请好好生活 ✨', source: '人生工作台' }],
        poem: [{ text: '春有百花秋有月，夏有凉风冬有雪。', source: '无门慧开禅师' }],
        classic: [{ text: '天行健，君子以自强不息。', source: '《周易》' }],
        good: [{ text: '保持热爱，奔赴山海。', source: '佚名' }],
        lyric: [{ text: '夜空中最亮的星，请照亮我前行。', source: '逃跑计划' }]
      };
      return _textRecommendCache;
    }
  }

  function _getDailyTextIdx(seedStr, poolLength) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % poolLength;
  }

  function _renderTextCard(cardKey, item) {
    const cfg = TEXT_CARD_CONFIG[cardKey];
    if (!cfg) return;
    const textEl = document.getElementById(cfg.textId);
    const sourceEl = document.getElementById(cfg.sourceId);
    if (textEl) textEl.textContent = item.text || '';
    if (sourceEl) sourceEl.textContent = item.source ? `—— ${item.source}` : '';
  }

  function _bindTextCardRefresh(cardKey) {
    const cfg = TEXT_CARD_CONFIG[cardKey];
    if (!cfg) return;
    const btn = document.getElementById(cfg.refreshId);
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', () => {
      const data = _textRecommendCache;
      if (!data) return;
      const pool = data[cfg.poolKey] || data.quote;
      if (pool.length <= 1) return;
      // 随机选一个不同的
      let nextIdx = _textCardIdx[cardKey];
      while (nextIdx === _textCardIdx[cardKey]) {
        nextIdx = Math.floor(Math.random() * pool.length);
      }
      _textCardIdx[cardKey] = nextIdx;
      _renderTextCard(cardKey, pool[nextIdx]);
      // 旋转动画反馈
      btn.style.transition = 'transform 0.4s';
      btn.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 400);
    });
  }

  async function renderTextRecommend() {
    const data = await _loadTextRecommendData();
    const todayStr = getTodayStr();

    for (const cardKey of Object.keys(TEXT_CARD_CONFIG)) {
      const cfg = TEXT_CARD_CONFIG[cardKey];
      const pool = data[cfg.poolKey] || data.quote;
      const idx = _getDailyTextIdx(todayStr + cardKey, pool.length);
      _textCardIdx[cardKey] = idx;
      _renderTextCard(cardKey, pool[idx]);
      _bindTextCardRefresh(cardKey);
    }
  }


  async function init() {
    await renderDailyRecommend();
    await renderTextRecommend();
  }

  function destroy() {
    _eventListeners.forEach(({ el, event, handler }) => {
      try { el.removeEventListener(event, handler); } catch(e) {}
    });
    _eventListeners = [];
  }

  return { init, destroy, renderDailyRecommend, renderTextRecommend };
})();

export { DailyRecommendWidget };
