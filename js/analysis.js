/**
 * analysis.js v43 — AI 牌局分析引擎（大幅升級）
 * 向聽數 + 進張 + 放槍風險 + 四家即時分析
 * 新增：每張牌的放槍危險度、綜合攻防評分、NC牌分析
 */
var MahjongAnalysis = (function() {

// === 牌索引轉換 ===
var TILE_NAMES = [
  "一萬","二萬","三萬","四萬","五萬","六萬","七萬","八萬","九萬",
  "一筒","二筒","三筒","四筒","五筒","六筒","七筒","八筒","九筒",
  "一條","二條","三條","四條","五條","六條","七條","八條","九條",
  "東","南","西","北","中","發","白"
];

function tileToIndex(tile) {
  if (tile.type === "suit") {
    var base = tile.suit === "wan" ? 0 : tile.suit === "tong" ? 9 : 18;
    return base + (tile.value - 1);
  }
  if (tile.type === "wind") {
    return { east: 27, south: 28, west: 29, north: 30 }[tile.suit];
  }
  if (tile.type === "dragon") {
    return { zhong: 31, fa: 32, bai: 33 }[tile.suit];
  }
  return -1;
}

function handToArray(hand) {
  var arr = new Array(34);
  for (var i = 0; i < 34; i++) arr[i] = 0;
  for (var j = 0; j < hand.length; j++) {
    var idx = tileToIndex(hand[j]);
    if (idx >= 0) arr[idx]++;
  }
  return arr;
}

function _suitName(suit) {
  return suit === 'wan' ? '萬' : suit === 'tong' ? '筒' : '條';
}

// === 向聽數計算（回溯搜尋） ===
var _best, _calls;

function calcShanten(tiles, handCount) {
  var target = (handCount >= 13) ? 4 : Math.floor(handCount / 3);
  _best = target * 2;
  _calls = 0;
  for (var i = 0; i < 34; i++) {
    if (tiles[i] >= 2) {
      tiles[i] -= 2;
      _scan(tiles, 0, target, 0, 0, true);
      tiles[i] += 2;
    }
  }
  _scan(tiles, 0, target, 0, 0, false);
  return _best;
}

function _scan(tiles, pos, target, mentsu, partial, hasHead) {
  _calls++;
  if (_calls > 500000) return;
  var cap = Math.min(partial, target - mentsu);
  if (cap < 0) cap = 0;
  var s = (target - mentsu) * 2 - cap - (hasHead ? 1 : 0);
  if (s < _best) _best = s;
  if (_best <= -1) return;
  if (mentsu + partial >= target) return;
  while (pos < 34 && tiles[pos] === 0) pos++;
  if (pos >= 34) return;
  var isSuit = (pos < 27);
  var posInSuit = pos % 9;
  if (tiles[pos] >= 3) {
    tiles[pos] -= 3;
    _scan(tiles, pos, target, mentsu + 1, partial, hasHead);
    tiles[pos] += 3;
  }
  if (isSuit && posInSuit <= 6 && tiles[pos+1] >= 1 && tiles[pos+2] >= 1) {
    tiles[pos]--; tiles[pos+1]--; tiles[pos+2]--;
    _scan(tiles, pos, target, mentsu + 1, partial, hasHead);
    tiles[pos]++; tiles[pos+1]++; tiles[pos+2]++;
  }
  if (mentsu + partial < target && tiles[pos] >= 2) {
    tiles[pos] -= 2;
    _scan(tiles, pos + 1, target, mentsu, partial + 1, hasHead);
    tiles[pos] += 2;
  }
  if (mentsu + partial < target && isSuit && posInSuit <= 7 && tiles[pos+1] >= 1) {
    tiles[pos]--; tiles[pos+1]--;
    _scan(tiles, pos + 1, target, mentsu, partial + 1, hasHead);
    tiles[pos]++; tiles[pos+1]++;
  }
  if (mentsu + partial < target && isSuit && posInSuit <= 6 && tiles[pos+2] >= 1) {
    tiles[pos]--; tiles[pos+2]--;
    _scan(tiles, pos + 1, target, mentsu, partial + 1, hasHead);
    tiles[pos]++; tiles[pos+2]++;
  }
  _scan(tiles, pos + 1, target, mentsu, partial, hasHead);
}

// === 進張數計算 ===
function countAcceptance(tiles, visible, shanten, handCount) {
  var count = 0;
  var acceptTiles = [];
  for (var i = 0; i < 34; i++) {
    if (tiles[i] >= 4) continue;
    var remaining = 4 - tiles[i] - (visible[i] || 0);
    if (remaining <= 0) continue;
    tiles[i]++;
    var newShanten = calcShanten(tiles, handCount + 1);
    tiles[i]--;
    if (newShanten < shanten) {
      count += remaining;
      acceptTiles.push({ idx: i, name: TILE_NAMES[i], remaining: remaining });
    }
  }
  return { count: count, tiles: acceptTiles };
}

// === 共用：統計所有可見牌 ===
function buildVisibleArr(game, mySeat) {
  var visibleArr = new Array(34);
  for (var v = 0; v < 34; v++) visibleArr[v] = 0;
  for (var s = 0; s < 4; s++) {
    var p = game.players[s];
    for (var d = 0; d < p.discards.length; d++) {
      var idx = tileToIndex(p.discards[d]);
      if (idx >= 0) visibleArr[idx]++;
    }
    for (var m = 0; m < p.melds.length; m++) {
      for (var mt = 0; mt < p.melds[m].tiles.length; mt++) {
        var midx = tileToIndex(p.melds[m].tiles[mt]);
        if (midx >= 0) visibleArr[midx]++;
      }
    }
    for (var f = 0; f < p.flowers.length; f++) {
      var fidx = tileToIndex(p.flowers[f]);
      if (fidx >= 0) visibleArr[fidx]++;
    }
  }
  var myP = game.players[mySeat];
  for (var h = 0; h < myP.hand.length; h++) {
    var hidx = tileToIndex(myP.hand[h]);
    if (hidx >= 0) visibleArr[hidx]++;
  }
  return visibleArr;
}

// === 共用：分析單一對手的狀態 ===
function analyzeOneOpponent(player, seat, visibleArr, gameProgress) {
  var info = {
    seat: seat,
    name: player.name,
    tenpaiProb: 0,       // 聽牌機率 0~1
    dangerLevel: 0,      // 0~10
    dangerLabel: '',
    dangerColor: '',
    patterns: [],
    tips: [],
    reasoning: [],
    discardedArr: null,
    sujiSafe: null,
    wallSafe: null,
    focusSuits: [],      // 對手集中的花色
    likelyWaits: [],
    dangerTiles: [],
    safeTiles: []
  };

  var effectiveHand = player.hand.length;
  var meldCount = player.melds.length;

  // === 1. 副露分析 ===
  var meldSuits = {};
  var meldHonors = 0;
  var hasDragonMeld = false;
  var hasWindMeld = false;
  var meldTypes = [];
  for (var mi = 0; mi < player.melds.length; mi++) {
    var meld = player.melds[mi];
    meldTypes.push(meld.type);
    for (var ti = 0; ti < meld.tiles.length; ti++) {
      var t = meld.tiles[ti];
      if (t.type === 'suit') {
        meldSuits[t.suit] = (meldSuits[t.suit] || 0) + 1;
      } else {
        meldHonors++;
        if (t.type === 'dragon') hasDragonMeld = true;
        if (t.type === 'wind') hasWindMeld = true;
      }
    }
  }
  var suitKeys = Object.keys(meldSuits);

  // 清一色/混一色推測
  if (suitKeys.length === 1 && meldCount >= 2) {
    var onlySuit = suitKeys[0];
    var discardedThisSuit = 0;
    for (var di = 0; di < player.discards.length; di++) {
      if (player.discards[di].type === 'suit' && player.discards[di].suit === onlySuit) discardedThisSuit++;
    }
    if (discardedThisSuit <= 2) {
      if (meldHonors > 0) {
        info.patterns.push('混一色(' + _suitName(onlySuit) + ')');
      } else {
        info.patterns.push('清一色(' + _suitName(onlySuit) + ')');
      }
      info.focusSuits.push(onlySuit);
    }
  }
  if (hasDragonMeld) info.patterns.push('三元牌');
  if (hasWindMeld) info.patterns.push('風牌');

  // 對對胡推測
  var pongKongCount = 0;
  for (var mk = 0; mk < meldTypes.length; mk++) {
    if (meldTypes[mk] === 'pong' || meldTypes[mk] === 'kong') pongKongCount++;
  }
  if (pongKongCount >= 2 && meldTypes.indexOf('chow') < 0) {
    info.patterns.push('對對胡');
  }

  // === 2. 牌河分析 ===
  var discardedArr = new Array(34);
  for (var di2 = 0; di2 < 34; di2++) discardedArr[di2] = 0;
  var earlyDiscards = [];
  var lateDiscards = [];
  var halfPoint = Math.floor(player.discards.length / 2);
  for (var di3 = 0; di3 < player.discards.length; di3++) {
    var didx = tileToIndex(player.discards[di3]);
    if (didx >= 0) {
      discardedArr[didx]++;
      if (di3 < halfPoint) earlyDiscards.push(didx);
      else lateDiscards.push(didx);
    }
  }
  info.discardedArr = discardedArr;

  // 現物安全牌
  for (var si = 0; si < 34; si++) {
    if (discardedArr[si] > 0) info.safeTiles.push(TILE_NAMES[si]);
  }

  // === 3. 筋牌分析 ===
  var sujiSafe = new Array(34);
  for (var sj = 0; sj < 34; sj++) sujiSafe[sj] = false;
  for (var suit_i = 0; suit_i < 3; suit_i++) {
    var base = suit_i * 9;
    // 1-4-7 筋
    if (discardedArr[base + 3] > 0) { sujiSafe[base + 0] = true; sujiSafe[base + 6] = true; }
    if (discardedArr[base + 0] > 0) sujiSafe[base + 3] = true;
    if (discardedArr[base + 6] > 0) sujiSafe[base + 3] = true;
    // 2-5-8 筋
    if (discardedArr[base + 4] > 0) { sujiSafe[base + 1] = true; sujiSafe[base + 7] = true; }
    if (discardedArr[base + 1] > 0) sujiSafe[base + 4] = true;
    if (discardedArr[base + 7] > 0) sujiSafe[base + 4] = true;
    // 3-6-9 筋
    if (discardedArr[base + 5] > 0) { sujiSafe[base + 2] = true; sujiSafe[base + 8] = true; }
    if (discardedArr[base + 2] > 0) sujiSafe[base + 5] = true;
    if (discardedArr[base + 8] > 0) sujiSafe[base + 5] = true;
  }
  info.sujiSafe = sujiSafe;

  // === 4. 壁牌 (No Chance) 分析 ===
  var wallSafe = new Array(34);
  for (var wi = 0; wi < 34; wi++) wallSafe[wi] = visibleArr[wi] >= 4;
  // NC 延伸：如果某張牌 3 張可見，聽它的機率極低
  var wallAlmostSafe = new Array(34);
  for (var wa = 0; wa < 34; wa++) wallAlmostSafe[wa] = visibleArr[wa] >= 3;
  info.wallSafe = wallSafe;

  // === 5. 聽牌機率計算（更精確） ===
  // 基於手牌數、副露數、遊戲進度的綜合判斷
  var tenpaiProb = 0;
  if (effectiveHand <= 2 && meldCount >= 3) {
    tenpaiProb = 0.95;
  } else if (effectiveHand <= 5 && meldCount >= 2) {
    tenpaiProb = 0.80;
  } else if (effectiveHand <= 8 && meldCount >= 2) {
    tenpaiProb = 0.40 + gameProgress * 0.3;
  } else if (meldCount === 0 && effectiveHand <= 4 && gameProgress > 0.4) {
    tenpaiProb = 0.50; // 門清暗聽
  } else if (effectiveHand <= 8 && meldCount >= 1) {
    tenpaiProb = 0.15 + gameProgress * 0.2;
  } else {
    tenpaiProb = 0.05 + gameProgress * 0.1;
  }
  // 後期不打某花色 → 提高聽牌機率
  var suitNotDiscarded = [];
  var suits = ['wan', 'tong', 'tiao'];
  for (var si2 = 0; si2 < suits.length; si2++) {
    var sn = suits[si2];
    var sBase = sn === 'wan' ? 0 : sn === 'tong' ? 9 : 18;
    var lateCount = 0;
    for (var li = 0; li < lateDiscards.length; li++) {
      if (lateDiscards[li] >= sBase && lateDiscards[li] < sBase + 9) lateCount++;
    }
    if (lateCount === 0 && player.discards.length > 6) {
      suitNotDiscarded.push(sn);
      tenpaiProb = Math.min(tenpaiProb + 0.1, 0.99);
    }
  }
  info.tenpaiProb = Math.min(tenpaiProb, 0.99);

  // 設定危險等級
  if (tenpaiProb >= 0.7) {
    info.dangerLevel = 8;
    info.dangerLabel = '極危險';
    info.dangerColor = '#ef4444';
    info.tips.push('聽牌機率 ' + Math.round(tenpaiProb * 100) + '%');
  } else if (tenpaiProb >= 0.35) {
    info.dangerLevel = 5;
    info.dangerLabel = '注意';
    info.dangerColor = '#f59e0b';
    info.tips.push('聽牌機率 ' + Math.round(tenpaiProb * 100) + '%');
  } else {
    info.dangerLevel = 2;
    info.dangerLabel = '安全';
    info.dangerColor = '#22c55e';
  }
  if (meldCount === 0 && effectiveHand <= 4 && gameProgress > 0.4) {
    info.tips.push('門清手牌少，可能暗聽');
  } else if (meldCount > 0) {
    info.tips.push('手牌' + effectiveHand + '張+副露' + meldCount + '組');
  }
  if (suitNotDiscarded.length > 0 && suitNotDiscarded.length <= 2) {
    for (var sni = 0; sni < suitNotDiscarded.length; sni++) {
      info.tips.push('不打' + _suitName(suitNotDiscarded[sni]));
    }
  }

  // === 6. 推測危險牌和可能聽的牌 ===
  if (tenpaiProb >= 0.25) {
    var dangerCandidates = [];
    for (var ti2 = 0; ti2 < 34; ti2++) {
      if (discardedArr[ti2] > 0) continue;
      if (wallSafe[ti2]) continue;
      var remaining = 4 - visibleArr[ti2];
      if (remaining <= 0) continue;
      var score = 0;
      score += remaining;
      // 對手集中花色加分
      if (info.focusSuits.length > 0 && ti2 < 27) {
        var tSuit = ti2 < 9 ? 'wan' : ti2 < 18 ? 'tong' : 'tiao';
        for (var fs = 0; fs < info.focusSuits.length; fs++) {
          if (tSuit === info.focusSuits[fs]) score += 3;
        }
      }
      // 中張更危險 (3~7)
      if (ti2 < 27 && ti2 % 9 >= 2 && ti2 % 9 <= 6) score += 1;
      // 筋牌降分
      if (sujiSafe[ti2]) score -= 1;
      // 壁牌幾乎安全降分
      if (wallAlmostSafe[ti2]) score -= 1;
      // 字牌：對手碰字牌傾向
      if (ti2 >= 27 && (hasWindMeld || hasDragonMeld)) score += 1;
      // 對對胡：所有牌都危險
      if (pongKongCount >= 2 && meldTypes.indexOf('chow') < 0) score += 1;
      // 遊戲後期
      if (gameProgress > 0.5) score += 1;
      dangerCandidates.push({ idx: ti2, score: score, remaining: remaining });
    }
    dangerCandidates.sort(function(a, b) { return b.score - a.score; });
    for (var dc = 0; dc < dangerCandidates.length && dc < 12; dc++) {
      var c = dangerCandidates[dc];
      if (c.score >= 3) info.dangerTiles.push(TILE_NAMES[c.idx]);
      if (c.score >= 4 && info.likelyWaits.length < 6) {
        info.likelyWaits.push(TILE_NAMES[c.idx]);
      }
    }
  }
  if (info.dangerTiles.length > 8) info.dangerTiles = info.dangerTiles.slice(0, 8);
  if (info.safeTiles.length > 6) info.safeTiles = info.safeTiles.slice(0, 6);
  return info;
}

// === 核心新功能：計算打出某張牌的放槍危險度 ===
// 對每個對手計算：該牌是否為現物/筋牌/壁牌安全，
// 乘以對手聽牌機率，得到綜合放槍風險 0~100
function calcFangpaoRisk(tileIdx, opponentInfos) {
  var totalRisk = 0;
  for (var i = 0; i < opponentInfos.length; i++) {
    var opp = opponentInfos[i];
    if (!opp.discardedArr) continue;
    var risk = 0;
    // 現物 = 0 風險
    if (opp.discardedArr[tileIdx] > 0) { continue; }
    // 壁牌 = 0 風險
    if (opp.wallSafe && opp.wallSafe[tileIdx]) { continue; }
    // 基礎風險 = 對手聽牌機率
    risk = opp.tenpaiProb;
    // 筋牌降低風險
    if (opp.sujiSafe && opp.sujiSafe[tileIdx]) {
      risk *= 0.4; // 筋牌約 60% 安全
    }
    // 對手集中花色 → 風險加倍
    if (opp.focusSuits.length > 0 && tileIdx < 27) {
      var tSuit = tileIdx < 9 ? 'wan' : tileIdx < 18 ? 'tong' : 'tiao';
      for (var fs = 0; fs < opp.focusSuits.length; fs++) {
        if (tSuit === opp.focusSuits[fs]) { risk *= 1.8; break; }
      }
    }
    // 中張更危險
    if (tileIdx < 27 && tileIdx % 9 >= 2 && tileIdx % 9 <= 6) {
      risk *= 1.3;
    }
    // 字牌：對手碰字牌傾向
    if (tileIdx >= 27 && opp.patterns) {
      for (var pi = 0; pi < opp.patterns.length; pi++) {
        if (opp.patterns[pi].indexOf('風牌') >= 0 || opp.patterns[pi].indexOf('三元') >= 0) {
          risk *= 1.4; break;
        }
      }
    }
    // 邊張/么九相對安全
    if (tileIdx < 27 && (tileIdx % 9 === 0 || tileIdx % 9 === 8)) {
      risk *= 0.7;
    }
    totalRisk += Math.min(risk, 1.0);
  }
  // 正規化到 0~100
  return Math.min(Math.round(totalRisk * 100 / 3), 100);
}

// === 升級版：評估所有可能的打牌選擇（含放槍風險） ===
function evaluateAllDiscards(handArr, visibleArr, melds, handCount, opponentInfos) {
  var results = [];
  var checked = {};
  for (var i = 0; i < 34; i++) {
    if (handArr[i] <= 0) continue;
    if (checked[i]) continue;
    checked[i] = true;
    handArr[i]--;
    var sh = calcShanten(handArr, handCount - 1);
    var acc = countAcceptance(handArr, visibleArr, sh, handCount - 1);
    handArr[i]++;
    var danger = 0;
    if (opponentInfos && opponentInfos.length > 0) {
      danger = calcFangpaoRisk(i, opponentInfos);
    }
    // 綜合評分：進攻力 - 防守風險
    // 進攻力 = 向聽數越低越好 + 進張越多越好
    var offenseScore = (6 - sh) * 20 + Math.min(acc.count, 30) * 2;
    // 防守扣分
    var defenseScore = danger;
    var totalScore = offenseScore - defenseScore * 0.6;
    results.push({
      idx: i, name: TILE_NAMES[i],
      shanten: sh, acceptance: acc.count, acceptTiles: acc.tiles,
      danger: danger, totalScore: totalScore
    });
  }
  // 排序：向聽數優先，同向聽看綜合分
  results.sort(function(a, b) {
    if (a.shanten !== b.shanten) return a.shanten - b.shanten;
    return b.totalScore - a.totalScore;
  });
  return results;
}

// === 解釋函數 ===
function shantenText(s) {
  if (s <= -1) return "和了";
  if (s === 0) return "聽牌";
  if (s === 1) return "一向聽";
  if (s === 2) return "二向聽";
  return s + "向聽";
}

function explainWhy(actual, best, allOptions) {
  if (actual.idx === best.idx) {
    var extra = '';
    if (actual.danger > 0) extra = '（放槍風險 ' + actual.danger + '%）';
    if (actual.shanten === 0) return "聽牌狀態，進張" + actual.acceptance + "張" + extra + "，好選擇";
    if (actual.shanten === -1) return "已經和了";
    return shantenText(actual.shanten) + "，進張" + actual.acceptance + "張" + extra + "，是最佳選擇";
  }
  var reasons = [];
  if (best.shanten < actual.shanten) {
    reasons.push("打" + best.name + "可以" + shantenText(best.shanten) + "（少" + (actual.shanten - best.shanten) + "向聽）");
  }
  if (best.acceptance > actual.acceptance) {
    reasons.push("打" + best.name + "進張" + best.acceptance + "張（多" + (best.acceptance - actual.acceptance) + "張）");
  }
  // 放槍風險比較
  if (actual.danger > best.danger + 15) {
    reasons.push("你打的" + actual.name + "放槍風險" + actual.danger + "%，" + best.name + "只有" + best.danger + "%");
  }
  if (reasons.length === 0) {
    reasons.push("建議打" + best.name + "（" + shantenText(best.shanten) + "、進張" + best.acceptance + "張）");
  }
  return reasons.join("；");
}

// === 分析每一手打牌決策 ===
function analyzeDecisions(gameLog, mySeat) {
  if (mySeat === undefined) mySeat = 0;
  var advice = [];
  for (var i = 0; i < gameLog.length; i++) {
    var entry = gameLog[i];
    if (entry.action !== "discard" || entry.seat !== mySeat) continue;
    var hand = entry.handSnapshot;
    if (!hand || hand.length < 2) continue;
    var handArr = handToArray(hand);
    var visibleArr = new Array(34);
    for (var v = 0; v < 34; v++) visibleArr[v] = 0;
    if (entry.visibleTiles) {
      for (var vi = 0; vi < entry.visibleTiles.length; vi++) {
        var vt = entry.visibleTiles[vi];
        var vidx = tileToIndex(vt);
        if (vidx >= 0) visibleArr[vidx]++;
      }
    }
    var options = evaluateAllDiscards(handArr, visibleArr, entry.melds, hand.length, null);
    if (options.length === 0) continue;
    var best = options[0];
    var discardIdx = tileToIndex(entry.tile);
    var actual = null;
    for (var oi = 0; oi < options.length; oi++) {
      if (options[oi].idx === discardIdx) { actual = options[oi]; break; }
    }
    if (!actual) actual = best;
    var level, verdict;
    if (actual.idx === best.idx) {
      level = "good"; verdict = "好棋 👍";
    } else if (actual.shanten > best.shanten) {
      var diff = actual.shanten - best.shanten;
      if (diff >= 2) { level = "mistake"; verdict = "失誤 ❌"; }
      else { level = "bad"; verdict = "不好 ⚠️"; }
    } else if (actual.shanten === best.shanten) {
      if (best.acceptance === 0 || actual.acceptance >= best.acceptance * 0.7) {
        level = "ok"; verdict = "可以 👌";
      } else if (actual.acceptance >= best.acceptance * 0.4) {
        level = "bad"; verdict = "不好 ⚠️";
      } else {
        level = "mistake"; verdict = "失誤 ❌";
      }
    } else {
      level = "good"; verdict = "好棋 👍";
    }
    var reason = explainWhy(actual, best, options);
    var suggestion = (actual.idx !== best.idx) ? best.name : null;
    advice.push({
      turn: entry.turn + 1,
      tileName: entry.tile.name || TILE_NAMES[discardIdx],
      tileIdx: discardIdx, level: level, verdict: verdict,
      shanten: shantenText(actual.shanten),
      acceptance: actual.acceptance, bestAcceptance: best.acceptance,
      suggestion: suggestion, reason: reason, isPass: false,
      handSnapshot: hand, meldsSnapshot: entry.melds || []
    });
  }
  return advice;
}

// === 計算總評 ===
function calculateOverall(advice) {
  var good = 0, ok = 0, bad = 0, mistakes = 0;
  for (var i = 0; i < advice.length; i++) {
    if (advice[i].level === "good") good++;
    else if (advice[i].level === "ok") ok++;
    else if (advice[i].level === "bad") bad++;
    else if (advice[i].level === "mistake") mistakes++;
  }
  var total = advice.length || 1;
  var score = Math.round(((good * 100 + ok * 70 + bad * 30 + mistakes * 0) / total));
  if (score > 100) score = 100;
  var grade;
  if (score >= 90) grade = "S";
  else if (score >= 75) grade = "A";
  else if (score >= 60) grade = "B";
  else if (score >= 40) grade = "C";
  else grade = "D";
  return { grade: grade, score: score, goodMoves: good, okMoves: ok, badMoves: bad, mistakes: mistakes };
}

// === 主入口 ===
function analyze(game, mySeat) {
  if (mySeat === undefined) mySeat = game._mySeat || 0;
  var advice = analyzeDecisions(game.gameLog || [], mySeat);
  var overall = calculateOverall(advice);
  var opponentDanger = analyzeOpponentDanger(game, mySeat);
  var keyMistakes = [];
  for (var i = 0; i < advice.length; i++) {
    if (advice[i].level === "bad" || advice[i].level === "mistake") {
      keyMistakes.push(advice[i]);
    }
  }
  var stats = { draws: 0, discards: 0, pongs: 0, chows: 0, kongs: 0, passes: 0, flowers: 0 };
  var log = game.gameLog || [];
  for (var j = 0; j < log.length; j++) {
    var e = log[j];
    if (e.seat !== mySeat) continue;
    if (e.action === "discard") stats.discards++;
    else if (e.action === "draw") stats.draws++;
    else if (e.action === "pong") stats.pongs++;
    else if (e.action === "chow") stats.chows++;
    else if (e.action === "kong") stats.kongs++;
    else if (e.action === "pass") stats.passes++;
    else if (e.action === "flower") stats.flowers++;
  }
  stats.draws = stats.discards;
  var resultSummary;
  if (game.winnerSeat === mySeat) {
    resultSummary = "🎉 你贏了！" + (game.winType === "self_draw" ? "（自摸）" : "（胡牌）");
  } else if (game.winnerSeat >= 0) {
    var winnerName = game.players[game.winnerSeat] ? game.players[game.winnerSeat].name : "對手";
    resultSummary = winnerName + " 贏了";
    if (game.lastDiscardSeat === mySeat) resultSummary += "（你放槍了）";
  } else {
    resultSummary = "流局";
  }
  return {
    grade: overall.grade, score: overall.score, overall: overall,
    advice: advice, keyMistakes: keyMistakes, stats: stats,
    resultSummary: resultSummary, opponentDanger: opponentDanger
  };
}

// === 對手聽牌推測（賽後分析用） ===
function analyzeOpponentDanger(game, mySeat) {
  if (mySeat === undefined) mySeat = game._mySeat || 0;
  var visibleArr = buildVisibleArr(game, mySeat);
  var totalDiscards = 0;
  for (var s2 = 0; s2 < 4; s2++) totalDiscards += game.players[s2].discards.length;
  var gameProgress = Math.min(totalDiscards / 60, 1);
  var results = [];
  for (var seat = 0; seat < 4; seat++) {
    if (seat === mySeat) continue;
    var info = analyzeOneOpponent(game.players[seat], seat, visibleArr, gameProgress);
    results.push({
      seat: info.seat, name: info.name,
      handCount: game.players[seat].hand.length,
      meldCount: game.players[seat].melds.length,
      discardCount: game.players[seat].discards.length,
      dangerLevel: info.dangerLevel, dangerLabel: info.dangerLabel,
      likelyWaits: info.likelyWaits, safeTiles: info.safeTiles,
      dangerTiles: info.dangerTiles, patterns: info.patterns,
      reasoning: info.tips.concat(info.reasoning)
    });
  }
  return results;
}

// === 即時對手聽牌分析（遊戲中使用） ===
function liveOpponentDanger(game, mySeat) {
  if (mySeat === undefined) mySeat = game._mySeat || 0;
  if (!game || !game.players || game.phase !== 'playing') return [];
  var visibleArr = buildVisibleArr(game, mySeat);
  var totalDiscards = 0;
  for (var s2 = 0; s2 < 4; s2++) totalDiscards += game.players[s2].discards.length;
  var gameProgress = Math.min(totalDiscards / 60, 1);
  var results = [];
  for (var seat = 0; seat < 4; seat++) {
    if (seat === mySeat) continue;
    var info = analyzeOneOpponent(game.players[seat], seat, visibleArr, gameProgress);
    results.push(info);
  }
  return results;
}

// === 新功能：即時出牌建議（含放槍風險） ===
// 在玩家出牌前，評估每張手牌的攻防綜合分數
function liveDiscardAdvice(game, mySeat) {
  if (mySeat === undefined) mySeat = game._mySeat || 0;
  if (!game || !game.players || game.phase !== 'playing') return [];
  var visibleArr = buildVisibleArr(game, mySeat);
  var totalDiscards = 0;
  for (var s2 = 0; s2 < 4; s2++) totalDiscards += game.players[s2].discards.length;
  var gameProgress = Math.min(totalDiscards / 60, 1);
  // 先分析所有對手
  var oppInfos = [];
  for (var seat = 0; seat < 4; seat++) {
    if (seat === mySeat) continue;
    oppInfos.push(analyzeOneOpponent(game.players[seat], seat, visibleArr, gameProgress));
  }
  // 評估自己手牌的每張牌
  var myP = game.players[mySeat];
  var handArr = handToArray(myP.hand);
  var handCount = myP.hand.length;
  var results = evaluateAllDiscards(handArr, visibleArr, myP.melds, handCount, oppInfos);
  return results;
}

return {
  analyze: analyze,
  analyzeOpponentDanger: analyzeOpponentDanger,
  liveOpponentDanger: liveOpponentDanger,
  liveDiscardAdvice: liveDiscardAdvice,
  calcFangpaoRisk: calcFangpaoRisk,
  _calcShanten: calcShanten,
  _handToArray: handToArray,
  _tileToIndex: tileToIndex,
  _countAcceptance: countAcceptance
};

})();
