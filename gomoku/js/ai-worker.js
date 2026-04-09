/**
 * ai-worker.js — 五子棋 AI Web Worker
 * 在背景線程執行 AI 計算，不阻塞 UI
 *
 * 訊息格式：
 *   主線程 → Worker: { type: 'getMove', board, aiColor, difficulty, moveCount }
 *   Worker → 主線程: { type: 'move', move: {x,y} }
 */

// ============================================================
// 開局庫 — 五子棋常見開局定式
// 座標以天元 (7,7) 為基準，黑先
// 每個定式包含前幾手的最佳應對
// key = 棋步序列的正規化字串，value = 推薦落子
// ============================================================
var OPENING_BOOK = (function() {
  var book = {};

  // 正規化：將棋步序列轉為 8 種對稱的最小字串
  // 8 種對稱 = 4 旋轉 × 2 翻轉
  function normalize(moves) {
    var transforms = [];
    for (var i = 0; i < 8; i++) transforms.push([]);
    for (var m = 0; m < moves.length; m++) {
      var x = moves[m][0] - 7, y = moves[m][1] - 7;
      // 8 種對稱變換
      transforms[0].push((x + 7) + ',' + (y + 7));
      transforms[1].push((-y + 7) + ',' + (x + 7));   // 90°
      transforms[2].push((-x + 7) + ',' + (-y + 7));   // 180°
      transforms[3].push((y + 7) + ',' + (-x + 7));    // 270°
      transforms[4].push((-x + 7) + ',' + (y + 7));    // 水平翻轉
      transforms[5].push((x + 7) + ',' + (-y + 7));    // 垂直翻轉
      transforms[6].push((-y + 7) + ',' + (-x + 7));   // 對角翻轉
      transforms[7].push((y + 7) + ',' + (x + 7));     // 反對角翻轉
    }
    var keys = [];
    for (var i = 0; i < 8; i++) keys.push(transforms[i].join(';'));
    keys.sort();
    return keys[0];
  }

  // 加入定式：moves = [[x,y], ...] 已下的棋步, reply = [x,y] 推薦回應
  function add(moves, reply) {
    // 對 8 種對稱都加入
    for (var t = 0; t < 8; t++) {
      var tMoves = [], tReply;
      for (var m = 0; m < moves.length; m++) {
        tMoves.push(transform(moves[m], t));
      }
      tReply = transform(reply, t);
      var key = tMoves.map(function(p) { return p[0] + ',' + p[1]; }).join(';');
      book[key] = { x: tReply[0], y: tReply[1] };
    }
  }

  function transform(pt, t) {
    var x = pt[0] - 7, y = pt[1] - 7;
    switch(t) {
      case 0: return [x + 7, y + 7];
      case 1: return [-y + 7, x + 7];
      case 2: return [-x + 7, -y + 7];
      case 3: return [y + 7, -x + 7];
      case 4: return [-x + 7, y + 7];
      case 5: return [x + 7, -y + 7];
      case 6: return [-y + 7, -x + 7];
      case 7: return [y + 7, x + 7];
    }
  }

  function lookup(moves) {
    var key = moves.map(function(m) { return m.x + ',' + m.y; }).join(';');
    return book[key] || null;
  }

  // ============================================================
  // 定式資料庫
  // 五子棋開局以天元 H8 = (7,7) 為中心
  // ============================================================

  // --- 黑棋第一手：天元 ---
  // 白棋最佳應對：鄰接（直指/斜指）

  // === 直指開局（白下在天元旁邊一格）===
  // 黑1=天元, 白2=直指(8,7)
  // 黑3 最佳：斜向擴展
  add([[7,7],[8,7]], [6,6]);  // 花月型
  add([[7,7],[8,7]], [6,8]);  // 雨月型
  add([[7,7],[8,7]], [9,6]);  // 松月型
  add([[7,7],[8,7]], [9,8]);  // 殘月型

  // === 斜指開局（白下在天元斜一格）===
  // 黑1=天元, 白2=斜指(8,8)
  add([[7,7],[8,8]], [6,7]);  // 浦月型
  add([[7,7],[8,8]], [7,6]);  // 溪月型
  add([[7,7],[8,8]], [9,7]);  // 嵐月型
  add([[7,7],[8,8]], [7,9]);  // 銀月型

  // === 花月定式（黑必勝開局之一）===
  // 黑1(7,7) 白2(8,7) 黑3(6,6)
  add([[7,7],[8,7],[6,6]], [6,7]);  // 白4 擋
  add([[7,7],[8,7],[6,6],[6,7]], [8,8]);  // 黑5 斜展
  add([[7,7],[8,7],[6,6],[8,8]], [6,8]);  // 黑5 連攻

  // === 浦月定式 ===
  // 黑1(7,7) 白2(8,8) 黑3(6,7)
  add([[7,7],[8,8],[6,7]], [7,6]);  // 白4
  add([[7,7],[8,8],[6,7]], [8,7]);  // 白4 另一選擇
  add([[7,7],[8,8],[6,7],[7,6]], [8,7]);  // 黑5

  // === 瑞星定式（黑必勝）===
  // 黑1(7,7) 白2(8,7) 黑3(9,9)
  add([[7,7],[8,7],[9,9]], [8,8]);  // 白4 中間擋
  add([[7,7],[8,7],[9,9],[8,8]], [6,6]);  // 黑5 對角

  // === 山月定式 ===
  add([[7,7],[8,7],[7,5]], [7,6]);
  add([[7,7],[8,8],[7,5]], [7,6]);

  // === 常見第二手白棋應對 ===
  // 白棋遠角（間隔一格斜）
  add([[7,7],[9,9]], [8,8]);  // 黑佔中間
  add([[7,7],[9,7]], [8,7]);  // 黑佔中間
  add([[7,7],[7,9]], [7,8]);  // 黑佔中間

  // === 三手後常見型態 ===
  // 直指 → 花月 → 白擋 → 黑展開
  add([[7,7],[8,7],[6,6],[6,7],[8,8]], [5,5]);  // 黑繼續斜展
  add([[7,7],[8,7],[6,6],[6,7],[8,8],[5,5]], [9,9]);  // 白對角

  // 斜指 → 浦月 → 白擋 → 黑展開
  add([[7,7],[8,8],[6,7],[7,6],[8,7]], [6,8]);  // 黑繼續
  add([[7,7],[8,8],[6,7],[8,7],[6,8]], [5,7]);  // 黑繼續

  // === 防守定式（AI 執白時）===
  // 對手下天元，AI 直指
  add([[7,7]], [8,7]);  // 白1 直指（最穩健）

  // 對手下天元旁，AI 佔天元
  add([[8,7]], [7,7]);
  add([[6,7]], [7,7]);
  add([[7,8]], [7,7]);
  add([[7,6]], [7,7]);

  return { lookup: lookup };
})();


// ============================================================
// AI 引擎（完整複製自 ai.js，加入開局庫整合）
// ============================================================
var SIZE = 15;
var DIRS = [[1,0],[0,1],[1,1],[1,-1]];

var S = {
  FIVE:       10000000,
  OPEN_FOUR:   1000000,
  FOUR:         100000,
  OPEN_THREE:    10000,
  THREE:          1000,
  OPEN_TWO:        100,
  TWO:              10,
  ONE:               1
};

var searchDeadline = 0;
var searchAborted = false;

var LEVELS = {
  '30k': { depth: 0, candidates: 8,  range: 1, mistakeRate: 0.6, evalWeight: 0.5,
           vcf: false, vct: false, timeLimit: 0, label: '30級 入門' },
  '20k': { depth: 1, candidates: 10, range: 1, mistakeRate: 0.3, evalWeight: 0.7,
           vcf: false, vct: false, timeLimit: 0, label: '20級 初學' },
  '10k': { depth: 2, candidates: 12, range: 2, mistakeRate: 0.1, evalWeight: 0.9,
           vcf: false, vct: false, timeLimit: 1000, label: '10級 中級' },
  '5k':  { depth: 3, candidates: 15, range: 2, mistakeRate: 0,   evalWeight: 1.0,
           vcf: false, vct: false, timeLimit: 2000, label: '5級 上級' },
  '1k':  { depth: 4, candidates: 15, range: 2, mistakeRate: 0,   evalWeight: 1.0,
           vcf: true,  vct: false, vcfDepth: 12, timeLimit: 3000, label: '1級 高手' },
  '1d':  { depth: 4, candidates: 15, range: 2, mistakeRate: 0,   evalWeight: 1.2,
           vcf: true,  vct: true,  vcfDepth: 14, vctDepth: 6, timeLimit: 5000, label: '初段' },
  '3d':  { depth: 5, candidates: 15, range: 2, mistakeRate: 0,   evalWeight: 1.4,
           vcf: true,  vct: true,  vcfDepth: 18, vctDepth: 10, timeLimit: 8000, label: '三段' }
};

function getLineStr(board, px, py, color, dx, dy) {
  var opp = color === 1 ? 2 : 1;
  var chars = [];
  var rev = [];
  for (var s = 1; s <= 5; s++) {
    var nx = px - dx * s, ny = py - dy * s;
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) { rev.push('W'); break; }
    if (board[ny][nx] === color) rev.push('1');
    else if (board[ny][nx] === opp) { rev.push('W'); break; }
    else rev.push('0');
  }
  for (var i = rev.length - 1; i >= 0; i--) chars.push(rev[i]);
  chars.push('1');
  for (var s = 1; s <= 5; s++) {
    var nx = px + dx * s, ny = py + dy * s;
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) { chars.push('W'); break; }
    if (board[ny][nx] === color) chars.push('1');
    else if (board[ny][nx] === opp) { chars.push('W'); break; }
    else chars.push('0');
  }
  return chars.join('');
}

function scoreLine(line) {
  if (line.indexOf('11111') >= 0) return S.FIVE;
  if (line.indexOf('011110') >= 0) return S.OPEN_FOUR;
  if (line.indexOf('11110') >= 0 || line.indexOf('01111') >= 0) return S.FOUR;
  if (line.indexOf('11101') >= 0 || line.indexOf('10111') >= 0) return S.FOUR;
  if (line.indexOf('11011') >= 0) return S.FOUR;
  if (line.indexOf('01110') >= 0) return S.OPEN_THREE;
  if (line.indexOf('010110') >= 0 || line.indexOf('011010') >= 0) return S.OPEN_THREE;
  if (line.indexOf('11100') >= 0 || line.indexOf('00111') >= 0) return S.THREE;
  if (line.indexOf('10110') >= 0 || line.indexOf('01101') >= 0) return S.THREE;
  if (line.indexOf('11010') >= 0 || line.indexOf('01011') >= 0) return S.THREE;
  if (line.indexOf('10011') >= 0 || line.indexOf('11001') >= 0) return S.THREE;
  if (line.indexOf('0110') >= 0) return S.OPEN_TWO;
  if (line.indexOf('01010') >= 0 || line.indexOf('010010') >= 0) return S.OPEN_TWO;
  if (line.indexOf('1100') >= 0 || line.indexOf('0011') >= 0) return S.TWO;
  if (line.indexOf('1010') >= 0 || line.indexOf('0101') >= 0) return S.TWO;
  if (line.indexOf('10010') >= 0) return S.TWO;
  return 0;
}

function analyzePoint(board, px, py, color) {
  var result = { five: 0, openFour: 0, four: 0, openThree: 0, three: 0, openTwo: 0, two: 0, score: 0 };
  for (var d = 0; d < DIRS.length; d++) {
    var line = getLineStr(board, px, py, color, DIRS[d][0], DIRS[d][1]);
    var ls = scoreLine(line);
    result.score += ls;
    if (ls >= S.FIVE) result.five++;
    else if (ls >= S.OPEN_FOUR) result.openFour++;
    else if (ls >= S.FOUR) result.four++;
    else if (ls >= S.OPEN_THREE) result.openThree++;
    else if (ls >= S.THREE) result.three++;
    else if (ls >= S.OPEN_TWO) result.openTwo++;
    else if (ls >= S.TWO) result.two++;
  }
  return result;
}


function getMove(board, aiColor, difficulty, gameMoves) {
  var cfg = LEVELS[difficulty] || LEVELS['10k'];

  // 開局庫查詢（前 10 手內，5級以上才用）
  if (gameMoves && gameMoves.length <= 10 && cfg.depth >= 3) {
    var bookMove = OPENING_BOOK.lookup(gameMoves);
    if (bookMove && board[bookMove.y][bookMove.x] === 0) {
      return bookMove;
    }
  }

  if (cfg.depth === 0) return beginnerMove(board, aiColor, cfg);
  return strategicMove(board, aiColor, cfg);
}

function beginnerMove(board, aiColor, cfg) {
  var opp = aiColor === 1 ? 2 : 1;
  var winMove = findWinMove(board, aiColor);
  if (winMove) return winMove;
  var blockMove = findWinMove(board, opp);
  if (blockMove) return blockMove;
  var candidates = getNearby(board, cfg.range);
  if (candidates.length === 0) return { x: 7, y: 7 };
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function strategicMove(board, aiColor, cfg) {
  var opp = aiColor === 1 ? 2 : 1;
  var timeLimit = cfg.timeLimit || 3000;
  var moveStartTime = Date.now();
  searchDeadline = moveStartTime + timeLimit;
  searchAborted = false;

  var candidates = getScoredCandidates(board, aiColor, cfg);
  if (candidates.length === 0) return { x: 7, y: 7 };
  if (candidates.length === 1) return candidates[0];

  var winMove = findWinMove(board, aiColor);
  if (winMove) return winMove;
  var blockMove = findWinMove(board, opp);
  if (blockMove) return blockMove;

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    board[c.y][c.x] = aiColor;
    var pat = analyzePoint(board, c.x, c.y, aiColor);
    board[c.y][c.x] = 0;
    if (pat.openFour > 0 || (pat.four >= 2) || (pat.four >= 1 && pat.openThree >= 1) || pat.openThree >= 2) {
      return c;
    }
  }

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    board[c.y][c.x] = opp;
    var oppPat = analyzePoint(board, c.x, c.y, opp);
    board[c.y][c.x] = 0;
    if (oppPat.openFour > 0 || (oppPat.four >= 2) || (oppPat.four >= 1 && oppPat.openThree >= 1) || oppPat.openThree >= 2) {
      return c;
    }
  }

  if (cfg.vcf) {
    var vcfBudget = moveStartTime + Math.floor(timeLimit * 0.2);
    searchDeadline = vcfBudget;
    searchAborted = false;
    var vcfMove = vcfSearch(board, aiColor, cfg.vcfDepth || 16);
    if (vcfMove) return vcfMove;
  }

  if (cfg.vct) {
    var vctBudget = moveStartTime + Math.floor(timeLimit * 0.35);
    searchDeadline = vctBudget;
    searchAborted = false;
    var vctMove = vctSearch(board, aiColor, cfg.vctDepth || 10);
    if (vctMove) return vctMove;
  }

  if (cfg.vcf) {
    var defBudget = moveStartTime + Math.floor(timeLimit * 0.45);
    searchDeadline = defBudget;
    searchAborted = false;
    var oppVcf = vcfSearch(board, opp, Math.min(cfg.vcfDepth || 16, 12));
    if (oppVcf) {
      board[oppVcf.y][oppVcf.x] = opp;
      var defCandidates = getDefenseMoves(board, oppVcf.x, oppVcf.y, opp);
      board[oppVcf.y][oppVcf.x] = 0;
      if (defCandidates.length > 0) return defCandidates[0];
    }
  }

  searchDeadline = moveStartTime + timeLimit;
  searchAborted = false;

  var bestPos = candidates[0];
  var maxDepth = cfg.depth;

  for (var d = 1; d <= maxDepth; d++) {
    var best = -Infinity;
    var depthBest = candidates[0];
    var bestTies = [candidates[0]];
    var aborted = false;

    for (var i = 0; i < candidates.length; i++) {
      if (Date.now() >= searchDeadline) { aborted = true; break; }
      var c = candidates[i];
      board[c.y][c.x] = aiColor;
      searchAborted = false;
      var score = minimax(board, d - 1, false, aiColor, -Infinity, Infinity, cfg, c.x, c.y);
      board[c.y][c.x] = 0;

      if (searchAborted) { aborted = true; break; }
      if (score > best) { best = score; depthBest = c; bestTies = [c]; }
      else if (score === best) { bestTies.push(c); }
      if (score >= S.FIVE) return depthBest;
    }

    if (!aborted) {
      bestPos = bestTies.length > 1 ? bestTies[Math.floor(Math.random() * bestTies.length)] : depthBest;
    }
  }

  if (cfg.mistakeRate > 0 && Math.random() < cfg.mistakeRate && candidates.length > 1) {
    var pool = candidates.slice(0, Math.min(5, candidates.length));
    bestPos = pool[Math.floor(Math.random() * pool.length)];
  }
  return bestPos;
}


// VCF/VCT 搜尋
function vcfSearch(board, color, maxDepth) {
  return vcfRecursive(board, color, maxDepth, 0);
}

function vcfRecursive(board, color, maxDepth, depth) {
  if (depth >= maxDepth) return null;
  if (searchDeadline > 0 && Date.now() >= searchDeadline) return null;
  var opp = color === 1 ? 2 : 1;
  var fourMoves = findFourMoves(board, color);
  for (var i = 0; i < fourMoves.length; i++) {
    var move = fourMoves[i];
    board[move.y][move.x] = color;
    var pat = analyzePoint(board, move.x, move.y, color);
    if (pat.five > 0 || pat.openFour > 0) { board[move.y][move.x] = 0; return move; }
    if (pat.four > 0) {
      var defenses = getFourDefenses(board, move.x, move.y, color);
      var allDefended = true;
      for (var d = 0; d < defenses.length; d++) {
        var def = defenses[d];
        board[def.y][def.x] = opp;
        var next = vcfRecursive(board, color, maxDepth, depth + 2);
        board[def.y][def.x] = 0;
        if (!next) { allDefended = false; break; }
      }
      if (allDefended && defenses.length > 0) { board[move.y][move.x] = 0; return move; }
    }
    board[move.y][move.x] = 0;
  }
  return null;
}

function vctSearch(board, color, maxDepth) {
  return vctRecursive(board, color, maxDepth, 0);
}

function vctRecursive(board, color, maxDepth, depth) {
  if (depth >= maxDepth) return null;
  if (searchDeadline > 0 && Date.now() >= searchDeadline) return null;
  var opp = color === 1 ? 2 : 1;
  var vcf = vcfRecursive(board, color, maxDepth - depth, 0);
  if (vcf) return vcf;
  var threatMoves = findThreeMoves(board, color);
  for (var i = 0; i < Math.min(threatMoves.length, 12); i++) {
    var move = threatMoves[i];
    board[move.y][move.x] = color;
    var pat = analyzePoint(board, move.x, move.y, color);
    if (pat.openThree > 0 || pat.four > 0) {
      var defenses = getThreeDefenses(board, move.x, move.y, color);
      var valid = true;
      for (var d = 0; d < defenses.length; d++) {
        if (board[defenses[d].y][defenses[d].x] !== 0) { valid = false; break; }
        board[defenses[d].y][defenses[d].x] = opp;
      }
      if (valid && defenses.length > 0) {
        var next = vctRecursive(board, color, maxDepth, depth + 2);
        for (var d = 0; d < defenses.length; d++) board[defenses[d].y][defenses[d].x] = 0;
        board[move.y][move.x] = 0;
        if (next) return move;
      } else {
        for (var d = 0; d < defenses.length; d++) {
          if (board[defenses[d].y][defenses[d].x] === opp) board[defenses[d].y][defenses[d].x] = 0;
        }
        board[move.y][move.x] = 0;
      }
    } else {
      board[move.y][move.x] = 0;
    }
  }
  return null;
}

// 棋型搜尋工具
function findFourMoves(board, color) {
  var moves = [];
  var nearby = getNearby(board, 2);
  for (var i = 0; i < nearby.length; i++) {
    var c = nearby[i];
    board[c.y][c.x] = color;
    var pat = analyzePoint(board, c.x, c.y, color);
    if (pat.five > 0 || pat.openFour > 0 || pat.four > 0) {
      moves.push({ x: c.x, y: c.y, score: pat.five * 10000 + pat.openFour * 100 + pat.four });
    }
    board[c.y][c.x] = 0;
  }
  moves.sort(function(a, b) { return b.score - a.score; });
  return moves;
}

function findThreeMoves(board, color) {
  var moves = [];
  var nearby = getNearby(board, 2);
  for (var i = 0; i < nearby.length; i++) {
    var c = nearby[i];
    board[c.y][c.x] = color;
    var pat = analyzePoint(board, c.x, c.y, color);
    if (pat.openThree > 0 || pat.openFour > 0 || pat.four > 0) {
      moves.push({ x: c.x, y: c.y, score: pat.openFour * 1000 + pat.four * 100 + pat.openThree * 10 });
    }
    board[c.y][c.x] = 0;
  }
  moves.sort(function(a, b) { return b.score - a.score; });
  return moves;
}


// 防守函數
function getFourDefenses(board, px, py, color) {
  var defenses = [];
  for (var d = 0; d < DIRS.length; d++) {
    var dx = DIRS[d][0], dy = DIRS[d][1];
    var count = 1, emptySpots = [], gap = false;
    for (var s = 1; s <= 5; s++) {
      var nx = px + dx * s, ny = py + dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[ny][nx] === color) count++;
      else if (board[ny][nx] === 0 && !gap) { emptySpots.push({x:nx,y:ny}); gap = true; }
      else break;
    }
    gap = false;
    for (var s = 1; s <= 5; s++) {
      var nx = px - dx * s, ny = py - dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[ny][nx] === color) count++;
      else if (board[ny][nx] === 0 && !gap) { emptySpots.push({x:nx,y:ny}); gap = true; }
      else break;
    }
    if (count >= 4 && emptySpots.length >= 1) {
      for (var e = 0; e < emptySpots.length; e++) {
        var dup = false;
        for (var f = 0; f < defenses.length; f++) {
          if (defenses[f].x === emptySpots[e].x && defenses[f].y === emptySpots[e].y) { dup = true; break; }
        }
        if (!dup) defenses.push(emptySpots[e]);
      }
    }
  }
  return defenses;
}

function getThreeDefenses(board, px, py, color) {
  var defenses = [];
  for (var d = 0; d < DIRS.length; d++) {
    var dx = DIRS[d][0], dy = DIRS[d][1];
    var count = 1, emptySpots = [];
    for (var s = 1; s <= 4; s++) {
      var nx = px + dx * s, ny = py + dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[ny][nx] === color) count++;
      else if (board[ny][nx] === 0) { emptySpots.push({x:nx,y:ny}); break; }
      else break;
    }
    for (var s = 1; s <= 4; s++) {
      var nx = px - dx * s, ny = py - dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[ny][nx] === color) count++;
      else if (board[ny][nx] === 0) { emptySpots.push({x:nx,y:ny}); break; }
      else break;
    }
    if (count >= 3 && emptySpots.length === 2) {
      for (var e = 0; e < emptySpots.length; e++) {
        var dup = false;
        for (var f = 0; f < defenses.length; f++) {
          if (defenses[f].x === emptySpots[e].x && defenses[f].y === emptySpots[e].y) { dup = true; break; }
        }
        if (!dup) defenses.push(emptySpots[e]);
      }
    }
  }
  return defenses;
}

function getDefenseMoves(board, px, py, oppColor) {
  var defenses = getFourDefenses(board, px, py, oppColor);
  if (defenses.length === 0) {
    var nearby = getNearby(board, 1);
    return nearby.slice(0, 3);
  }
  return defenses;
}

// Alpha-Beta Minimax
function minimax(board, depth, isMax, aiColor, alpha, beta, cfg, lastX, lastY) {
  if (searchDeadline > 0 && Date.now() >= searchDeadline) { searchAborted = true; return 0; }
  var opp = aiColor === 1 ? 2 : 1;
  if (lastX !== undefined && lastY !== undefined) {
    var lastColor = board[lastY][lastX];
    if (lastColor !== 0 && checkWinAt(board, lastX, lastY, lastColor)) {
      return lastColor === aiColor ? S.FIVE : -S.FIVE;
    }
  }
  if (depth <= 0) return evaluate(board, aiColor, cfg);
  var currentColor = isMax ? aiColor : opp;
  var maxCand = cfg.candidates || 12;
  if (depth <= 2) maxCand = Math.min(maxCand, 8);
  if (depth <= 1) maxCand = Math.min(maxCand, 6);
  var candidates = getScoredCandidatesN(board, currentColor, cfg, maxCand);
  if (candidates.length === 0) return 0;
  if (isMax) {
    var best = -Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      board[c.y][c.x] = aiColor;
      var score = minimax(board, depth - 1, false, aiColor, alpha, beta, cfg, c.x, c.y);
      board[c.y][c.x] = 0;
      if (searchAborted) return 0;
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    var best = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      board[c.y][c.x] = opp;
      var score = minimax(board, depth - 1, true, aiColor, alpha, beta, cfg, c.x, c.y);
      board[c.y][c.x] = 0;
      if (searchAborted) return 0;
      if (score < best) best = score;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

// 候選排序與評估
function sortCandidates(board, candidates, color) {
  var opp = color === 1 ? 2 : 1;
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    c.hScore = quickEvalPoint(board, c.x, c.y, color, opp);
  }
  candidates.sort(function(a, b) { return b.hScore - a.hScore; });
  return candidates;
}


function quickEvalPoint(board, px, py, color, opp) {
  var score = 0;
  board[py][px] = color;
  for (var d = 0; d < DIRS.length; d++) {
    var dx = DIRS[d][0], dy = DIRS[d][1];
    var count = 1, openEnds = 0, hasGap = false;
    for (var s = 1; s < 5; s++) {
      var nx = px + dx * s, ny = py + dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[ny][nx] === color) count++;
      else if (board[ny][nx] === 0) {
        if (!hasGap && s < 4) {
          var nx2 = nx + dx, ny2 = ny + dy;
          if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === color) { hasGap = true; continue; }
        }
        openEnds++; break;
      } else break;
    }
    for (var s = 1; s < 5; s++) {
      var nx = px - dx * s, ny = py - dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[ny][nx] === color) count++;
      else if (board[ny][nx] === 0) {
        if (!hasGap && s < 4) {
          var nx2 = nx - dx, ny2 = ny - dy;
          if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === color) { hasGap = true; continue; }
        }
        openEnds++; break;
      } else break;
    }
    if (count >= 5) score += S.FIVE;
    else if (count === 4 && openEnds === 2) score += S.OPEN_FOUR;
    else if (count === 4 && (openEnds >= 1 || hasGap)) score += S.FOUR;
    else if (count === 3 && openEnds === 2) score += S.OPEN_THREE;
    else if (count === 3 && (openEnds >= 1 || hasGap)) score += S.THREE;
    else if (count === 2 && openEnds === 2) score += S.OPEN_TWO;
    else if (count === 2 && openEnds >= 1) score += S.TWO;
  }
  board[py][px] = 0;
  board[py][px] = opp;
  for (var d = 0; d < DIRS.length; d++) {
    var dx = DIRS[d][0], dy = DIRS[d][1];
    var count = 1, openEnds = 0, hasGap = false;
    for (var s = 1; s < 5; s++) {
      var nx = px + dx * s, ny = py + dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[ny][nx] === opp) count++;
      else if (board[ny][nx] === 0) {
        if (!hasGap && s < 4) {
          var nx2 = nx + dx, ny2 = ny + dy;
          if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === opp) { hasGap = true; continue; }
        }
        openEnds++; break;
      } else break;
    }
    for (var s = 1; s < 5; s++) {
      var nx = px - dx * s, ny = py - dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
      if (board[ny][nx] === opp) count++;
      else if (board[ny][nx] === 0) {
        if (!hasGap && s < 4) {
          var nx2 = nx - dx, ny2 = ny - dy;
          if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === opp) { hasGap = true; continue; }
        }
        openEnds++; break;
      } else break;
    }
    if (count >= 5) score += S.FIVE * 0.9;
    else if (count === 4 && openEnds === 2) score += S.OPEN_FOUR * 0.9;
    else if (count === 4 && (openEnds >= 1 || hasGap)) score += S.FOUR * 0.8;
    else if (count === 3 && openEnds === 2) score += S.OPEN_THREE * 0.7;
    else if (count === 3 && (openEnds >= 1 || hasGap)) score += S.THREE * 0.5;
  }
  board[py][px] = 0;
  score += (7 - Math.abs(px - 7)) * 2 + (7 - Math.abs(py - 7)) * 2;
  return score;
}

function getScoredCandidates(board, color, cfg) {
  var nearby = getNearby(board, cfg.range || 2);
  if (nearby.length === 0) return [{ x: 7, y: 7 }];
  nearby = sortCandidates(board, nearby, color);
  return nearby.slice(0, cfg.candidates || 12);
}

function getScoredCandidatesN(board, color, cfg, n) {
  var nearby = getNearby(board, cfg.range || 2);
  if (nearby.length === 0) return [{ x: 7, y: 7 }];
  nearby = sortCandidates(board, nearby, color);
  return nearby.slice(0, n);
}

function evaluate(board, aiColor, cfg) {
  var opp = aiColor === 1 ? 2 : 1;
  var aiScore = evalFast(board, aiColor, opp);
  var oppScore = evalFast(board, opp, aiColor);
  return aiScore * (cfg.evalWeight || 1.0) - oppScore * 1.1;
}

function evalFast(board, color, opp) {
  var total = 0;
  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      if (board[y][x] !== color) continue;
      for (var d = 0; d < DIRS.length; d++) {
        var dx = DIRS[d][0], dy = DIRS[d][1];
        var px = x - dx, py = y - dy;
        if (px >= 0 && px < SIZE && py >= 0 && py < SIZE && board[py][px] === color) continue;
        var count = 0, openEnds = 0, hasGap = false;
        if (px >= 0 && px < SIZE && py >= 0 && py < SIZE && board[py][px] === 0) openEnds++;
        var sx = x, sy = y;
        for (var s = 0; s < 6; s++) {
          if (sx < 0 || sx >= SIZE || sy < 0 || sy >= SIZE) break;
          if (board[sy][sx] === color) { count++; }
          else if (board[sy][sx] === 0) {
            if (!hasGap && count > 0 && count < 4) {
              var nx2 = sx + dx, ny2 = sy + dy;
              if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === color) { hasGap = true; sx += dx; sy += dy; continue; }
            }
            openEnds++; break;
          } else break;
          sx += dx; sy += dy;
        }
        if (count >= 5) return S.FIVE;
        if (count === 4) {
          if (openEnds === 2 && !hasGap) total += S.OPEN_FOUR;
          else if (openEnds >= 1 || hasGap) total += S.FOUR;
        } else if (count === 3) {
          if (openEnds === 2 && !hasGap) total += S.OPEN_THREE;
          else if (openEnds >= 1 || hasGap) total += S.THREE;
        } else if (count === 2) {
          if (openEnds === 2) total += S.OPEN_TWO;
          else if (openEnds >= 1) total += S.TWO;
        }
      }
    }
  }
  return total;
}

// 工具函數
function findWinMove(board, color) {
  var nearby = getNearby(board, 2);
  for (var i = 0; i < nearby.length; i++) {
    var c = nearby[i];
    board[c.y][c.x] = color;
    if (checkWinAt(board, c.x, c.y, color)) { board[c.y][c.x] = 0; return c; }
    board[c.y][c.x] = 0;
  }
  return null;
}

function getNearby(board, range) {
  var set = {}, result = [];
  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      if (board[y][x] !== 0) {
        for (var dy = -range; dy <= range; dy++) {
          for (var dx = -range; dx <= range; dx++) {
            var nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && board[ny][nx] === 0) {
              var key = ny * SIZE + nx;
              if (!set[key]) { set[key] = true; result.push({ x: nx, y: ny }); }
            }
          }
        }
      }
    }
  }
  return result;
}

function checkWinAt(board, px, py, color) {
  for (var d = 0; d < DIRS.length; d++) {
    var dx = DIRS[d][0], dy = DIRS[d][1];
    var count = 1;
    for (var s = 1; s < 5; s++) {
      var nx = px + dx * s, ny = py + dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE || board[ny][nx] !== color) break;
      count++;
    }
    for (var s = 1; s < 5; s++) {
      var nx = px - dx * s, ny = py - dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE || board[ny][nx] !== color) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

// ============================================================
// Worker 訊息處理
// ============================================================
self.onmessage = function(e) {
  var data = e.data;
  if (data.type === 'getMove') {
    try {
      var board = data.board;
      var move = getMove(board, data.aiColor, data.difficulty, data.gameMoves);
      self.postMessage({ type: 'move', move: move });
    } catch(err) {
      // 計算出錯，回傳 null 讓主線程 fallback
      self.postMessage({ type: 'move', move: null });
    }
  }
};
