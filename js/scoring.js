/**
 * scoring.js — 台灣麻將計分系統
 * 台數計算（常見台型）
 */

var MahjongScoring = (function() {

  var WIND_MAP = { east: 0, south: 1, west: 2, north: 3 };
  var WIND_LABEL = { east: '東', south: '南', west: '西', north: '北' };

  /** 計算台數 */
  function calculate(player, game, winType) {
    var fans = [];
    var hand = player.hand.slice();
    var melds = player.melds;
    var flowers = player.flowers;
    var seatWind = getSeatWindName(game, player.seat);
    var roundWind = game.roundWind;

    // === 自摸 ===
    if (winType === 'zimo') {
      fans.push({ name: '自摸', fan: 1 });
    }

    // === 門清（沒有吃碰明槓） ===
    var isMenqing = melds.every(function(m) {
      return m.kongType === 'an'; // 只有暗槓不算開門
    });
    if (isMenqing) {
      fans.push({ name: '門清', fan: 1 });
    }

    // === 門清自摸 ===
    if (isMenqing && winType === 'zimo') {
      fans.push({ name: '門清自摸', fan: 1 });
    }

    // === 花牌 ===
    // 正花（對應自己的風位）
    var seatIdx = WIND_MAP[seatWind];
    var seasonFlowers = ['spring', 'summer', 'autumn', 'winter'];
    var plantFlowers = ['plum', 'orchid', 'bamboo', 'chrys'];
    for (var i = 0; i < flowers.length; i++) {
      var fl = flowers[i];
      var fIdx = -1;
      var sIdx = seasonFlowers.indexOf(fl.suit);
      var pIdx = plantFlowers.indexOf(fl.suit);
      if (sIdx >= 0) fIdx = sIdx;
      else if (pIdx >= 0) fIdx = pIdx;
      if (fIdx === seatIdx) {
        fans.push({ name: '正花 ' + fl.name, fan: 1 });
      }
    }
    // 花槓（四季齊或四君子齊）
    var seasons = flowers.filter(function(fl) { return seasonFlowers.indexOf(fl.suit) >= 0; });
    var plants = flowers.filter(function(fl) { return plantFlowers.indexOf(fl.suit) >= 0; });
    if (seasons.length === 4) fans.push({ name: '花槓（四季）', fan: 4 });
    if (plants.length === 4) fans.push({ name: '花槓（四君子）', fan: 4 });
    // 八仙過海
    if (flowers.length === 8) fans.push({ name: '八仙過海', fan: 8 });

    // === 圈風刻/門風刻 ===
    var allSets = getAllSets(hand, melds);
    for (var j = 0; j < allSets.length; j++) {
      var s = allSets[j];
      if (s.type === 'triplet' && s.tiles[0].type === 'wind') {
        var w = s.tiles[0].suit;
        if (w === roundWind) fans.push({ name: '圈風刻 ' + WIND_LABEL[w], fan: 1 });
        if (w === seatWind) fans.push({ name: '門風刻 ' + WIND_LABEL[w], fan: 1 });
      }
    }

    // === 三元牌刻 ===
    for (var k = 0; k < allSets.length; k++) {
      var s2 = allSets[k];
      if (s2.type === 'triplet' && s2.tiles[0].type === 'dragon') {
        var d = s2.tiles[0].suit;
        var dName = d === 'zhong' ? '中' : d === 'fa' ? '發' : '白';
        fans.push({ name: '三元牌 ' + dName, fan: 1 });
      }
    }

    // === 槓 ===
    for (var m = 0; m < melds.length; m++) {
      if (melds[m].type === 'kong') {
        if (melds[m].kongType === 'an') fans.push({ name: '暗槓', fan: 2 });
        else fans.push({ name: '明槓', fan: 1 });
      }
    }

    // === 碰碰胡（全是刻子/槓，沒有順子） ===
    var hasChow = allSets.some(function(s) { return s.type === 'sequence'; });
    if (!hasChow && allSets.length > 0) {
      fans.push({ name: '碰碰胡', fan: 4 });
    }

    // === 混一色（只有一種花色+字牌） ===
    var suits = getHandSuits(hand, melds);
    if (suits.numSuits === 1 && suits.hasHonor) {
      fans.push({ name: '混一色', fan: 4 });
    }

    // === 清一色（只有一種花色，沒有字牌） ===
    if (suits.numSuits === 1 && !suits.hasHonor) {
      fans.push({ name: '清一色', fan: 8 });
    }

    // === 字一色（全是字牌） ===
    if (suits.numSuits === 0 && suits.hasHonor) {
      fans.push({ name: '字一色', fan: 16 });
    }

    // === 大三元（中發白三組刻子） ===
    var dragonTrips = allSets.filter(function(s) {
      return s.type === 'triplet' && s.tiles[0].type === 'dragon';
    });
    if (dragonTrips.length === 3) {
      fans.push({ name: '大三元', fan: 8 });
    }

    // === 小三元（兩組三元刻+一組三元眼） ===
    if (dragonTrips.length === 2) {
      var eyeTile = findEye(hand, melds);
      if (eyeTile && eyeTile.type === 'dragon') {
        fans.push({ name: '小三元', fan: 4 });
      }
    }

    // === 平胡（全順子+非字牌眼）===
    if (hasChow) {
      var allSeq = allSets.every(function(s) { return s.type === 'sequence'; });
      if (allSeq && melds.length === 0) {
        var eye = findEye(hand, melds);
        if (eye && eye.type === 'suit') {
          fans.push({ name: '平胡', fan: 2 });
        }
      }
    }

    // === 底台（至少 1 台） ===
    var totalFan = 0;
    for (var fi = 0; fi < fans.length; fi++) totalFan += fans[fi].fan;
    if (totalFan === 0) {
      fans.push({ name: '底', fan: 1 });
      totalFan = 1;
    }

    return { fans: fans, totalFan: totalFan };
  }

  /** 取得所有面子（手牌拆解 + 已亮的面子） */
  function getAllSets(hand, melds) {
    var sets = [];
    // 已亮的面子
    for (var i = 0; i < melds.length; i++) {
      var m = melds[i];
      if (m.type === 'chow') sets.push({ type: 'sequence', tiles: m.tiles });
      else sets.push({ type: 'triplet', tiles: m.tiles });
    }
    // 拆解手牌
    var sorted = hand.slice().sort(function(a, b) { return a.sortKey - b.sortKey; });
    extractSets(sorted, sets);
    return sets;
  }

  /** 從手牌中拆出面子和眼 */
  function extractSets(tiles, sets) {
    if (tiles.length <= 2) return; // 剩下的是眼
    var t = tiles.slice();

    // 先找刻子
    for (var i = 0; i < t.length - 2; i++) {
      if (isSameTile(t[i], t[i+1]) && isSameTile(t[i+1], t[i+2])) {
        sets.push({ type: 'triplet', tiles: [t[i], t[i+1], t[i+2]] });
        var rest = t.slice(0, i).concat(t.slice(i+3));
        extractSets(rest, sets);
        return;
      }
    }
    // 再找順子
    for (var j = 0; j < t.length; j++) {
      if (t[j].type !== 'suit') continue;
      var v = t[j].value, s = t[j].suit;
      var i2 = t.findIndex(function(x, idx) { return idx > j && x.type === 'suit' && x.suit === s && x.value === v+1; });
      if (i2 < 0) continue;
      var i3 = t.findIndex(function(x, idx) { return idx > i2 && x.type === 'suit' && x.suit === s && x.value === v+2; });
      if (i3 < 0) continue;
      sets.push({ type: 'sequence', tiles: [t[j], t[i2], t[i3]] });
      var rest2 = t.slice();
      rest2.splice(i3, 1); rest2.splice(i2, 1); rest2.splice(j, 1);
      extractSets(rest2, sets);
      return;
    }
  }

  /** 找眼（對子） */
  function findEye(hand, melds) {
    // 手牌中剩餘的對子就是眼
    var t = hand.slice().sort(function(a, b) { return a.sortKey - b.sortKey; });
    // 移除面子後剩下的
    var remaining = t.slice();
    // 簡單方法：找手牌中的對子
    for (var i = 0; i < remaining.length - 1; i++) {
      if (isSameTile(remaining[i], remaining[i+1])) {
        return remaining[i];
      }
    }
    return null;
  }

  /** 分析花色組成 */
  function getHandSuits(hand, melds) {
    var suitSet = {};
    var hasHonor = false;
    var allTiles = hand.slice();
    for (var i = 0; i < melds.length; i++) {
      for (var j = 0; j < melds[i].tiles.length; j++) {
        allTiles.push(melds[i].tiles[j]);
      }
    }
    for (var k = 0; k < allTiles.length; k++) {
      var t = allTiles[k];
      if (t.type === 'suit') suitSet[t.suit] = true;
      else if (t.type === 'wind' || t.type === 'dragon') hasHonor = true;
    }
    return { numSuits: Object.keys(suitSet).length, hasHonor: hasHonor };
  }

  function getSeatWindName(game, seat) {
    var winds = ['east', 'south', 'west', 'north'];
    var offset = (seat - game.dealer + 4) % 4;
    return winds[offset];
  }

  return { calculate: calculate };
})();
