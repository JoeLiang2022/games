/**
 * ai.js — 五子棋 AI 引擎 v2
 * 國際標準級段制（級 kyu → 段 dan）
 *
 * v2 重寫重點：
 *   - 全新棋型辨識：支援間隔棋型（跳四、跳三等）
 *   - 方向線段分析：取得完整 line string 再 pattern match
 *   - 增量式評估：只算變動點附近
 *   - VCF/VCT 搜尋
 */
var AI = (function() {
  var SIZE = 15;
  var DIRS = [[1,0],[0,1],[1,1],[1,-1]];

  // 棋型分數 — 經過調校的權重
  var S = {
    FIVE:       10000000,
    OPEN_FOUR:   1000000,  // _XXXX_ 必勝
    FOUR:         100000,  // 衝四（單邊封或跳四）
    OPEN_THREE:    10000,  // _XXX_ 活三
    THREE:          1000,  // 眠三
    OPEN_TWO:        100,  // 活二
    TWO:              10,  // 眠二
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

  // ============================================================
  // 核心：方向線段棋型分析（支援間隔棋型）
  // 取得某點在某方向的完整 line string，再用 pattern matching
  // ============================================================

  /**
   * 取得某點在某方向的線段字串
   * 回傳 { line: string, center: number }
   * line 中：'1'=己方, '2'=對方, '0'=空, 'W'=牆
   * center 是 px,py 在 line 中的 index
   */
  function getLineStr(board, px, py, color, dx, dy) {
    var opp = color === 1 ? 2 : 1;
    var chars = [];
    var centerIdx = 0;
    // 反方向（從遠到近）
    var rev = [];
    for (var s = 1; s <= 5; s++) {
      var nx = px - dx * s, ny = py - dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) { rev.push('W'); break; }
      if (board[ny][nx] === color) rev.push('1');
      else if (board[ny][nx] === opp) { rev.push('W'); break; } // 對方等同牆
      else rev.push('0');
    }
    // 反轉（讓順序從左到右）
    for (var i = rev.length - 1; i >= 0; i--) chars.push(rev[i]);
    centerIdx = chars.length;
    chars.push('1'); // 自己
    // 正方向
    for (var s = 1; s <= 5; s++) {
      var nx = px + dx * s, ny = py + dy * s;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) { chars.push('W'); break; }
      if (board[ny][nx] === color) chars.push('1');
      else if (board[ny][nx] === opp) { chars.push('W'); break; }
      else chars.push('0');
    }
    return chars.join('');
  }

  /**
   * 分析一條線段的棋型
   * 回傳分數（單方向）
   */
  function scoreLine(line) {
    // === 五連 ===
    if (line.indexOf('11111') >= 0) return S.FIVE;

    // === 活四 _1111_ ===
    if (line.indexOf('011110') >= 0) return S.OPEN_FOUR;

    // === 衝四（各種形式）===
    // 連續四子單邊封
    if (line.indexOf('11110') >= 0 || line.indexOf('01111') >= 0) return S.FOUR;
    // 跳四：中間有一個空格
    if (line.indexOf('11101') >= 0 || line.indexOf('10111') >= 0) return S.FOUR;
    if (line.indexOf('11011') >= 0) return S.FOUR;

    // === 活三 _111_ 或跳活三 ===
    // 純活三
    if (line.indexOf('01110') >= 0) return S.OPEN_THREE;
    // 跳活三：_1_11_ 或 _11_1_
    if (line.indexOf('010110') >= 0 || line.indexOf('011010') >= 0) return S.OPEN_THREE;

    // === 眠三 ===
    // 連續三子單邊封
    if (line.indexOf('11100') >= 0 || line.indexOf('00111') >= 0) return S.THREE;
    // 跳眠三
    if (line.indexOf('10110') >= 0 || line.indexOf('01101') >= 0) return S.THREE;
    if (line.indexOf('11010') >= 0 || line.indexOf('01011') >= 0) return S.THREE;
    if (line.indexOf('10011') >= 0 || line.indexOf('11001') >= 0) return S.THREE;

    // === 活二 ===
    if (line.indexOf('0110') >= 0) return S.OPEN_TWO;
    if (line.indexOf('01010') >= 0 || line.indexOf('010010') >= 0) return S.OPEN_TWO;

    // === 眠二 ===
    if (line.indexOf('1100') >= 0 || line.indexOf('0011') >= 0) return S.TWO;
    if (line.indexOf('1010') >= 0 || line.indexOf('0101') >= 0) return S.TWO;
    if (line.indexOf('10010') >= 0) return S.TWO;

    return 0;
  }

  /**
   * 分析某點放子後的棋型（所有方向）
   * 回傳 { score, patterns: {five, openFour, four, openThree, three, ...} }
   */
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

  // ============================================================
  // 舊版相容：getLinePattern（VCF/VCT 用）
  // 用新的 line string 分析重寫
  // ============================================================
  function getLinePattern(board, px, py, color) {
    var p = analyzePoint(board, px, py, color);
    return {
      five: p.five,
      openFour: p.openFour,
      halfFour: p.four,
      openThree: p.openThree,
      halfThree: p.three
    };
  }

  // ============================================================
  // 入口
  // ============================================================
  function getMove(board, aiColor, difficulty) {
    var cfg = LEVELS[difficulty] || LEVELS['10k'];
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

  // ============================================================
  // 主策略函數（迭代加深 + VCF/VCT）
  // ============================================================
  function strategicMove(board, aiColor, cfg) {
    var opp = aiColor === 1 ? 2 : 1;

    // 設定全局時間預算（一開始就設）
    var timeLimit = cfg.timeLimit || 3000;
    var moveStartTime = Date.now();
    searchDeadline = moveStartTime + timeLimit;
    searchAborted = false;

    var candidates = getScoredCandidates(board, aiColor, cfg);
    if (candidates.length === 0) return { x: 7, y: 7 };
    if (candidates.length === 1) return candidates[0];

    // 1. 必贏必擋
    var winMove = findWinMove(board, aiColor);
    if (winMove) return winMove;
    var blockMove = findWinMove(board, opp);
    if (blockMove) return blockMove;

    // 2. 檢查雙重威脅（雙活三、活三+衝四等）
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      board[c.y][c.x] = aiColor;
      var pat = analyzePoint(board, c.x, c.y, aiColor);
      board[c.y][c.x] = 0;
      // 雙活三或活三+衝四 = 必勝
      if (pat.openFour > 0 || (pat.four >= 2) || (pat.four >= 1 && pat.openThree >= 1) || pat.openThree >= 2) {
        return c;
      }
    }

    // 3. 擋對手雙重威脅
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      board[c.y][c.x] = opp;
      var oppPat = analyzePoint(board, c.x, c.y, opp);
      board[c.y][c.x] = 0;
      if (oppPat.openFour > 0 || (oppPat.four >= 2) || (oppPat.four >= 1 && oppPat.openThree >= 1) || oppPat.openThree >= 2) {
        return c;
      }
    }

    // 4. VCF 搜尋（限時 20% 預算）
    if (cfg.vcf) {
      var vcfBudget = moveStartTime + Math.floor(timeLimit * 0.2);
      searchDeadline = vcfBudget;
      searchAborted = false;
      var vcfMove = vcfSearch(board, aiColor, cfg.vcfDepth || 16);
      if (vcfMove) return vcfMove;
    }

    // 5. VCT 搜尋（限時 15% 預算）
    if (cfg.vct) {
      var vctBudget = moveStartTime + Math.floor(timeLimit * 0.35);
      searchDeadline = vctBudget;
      searchAborted = false;
      var vctMove = vctSearch(board, aiColor, cfg.vctDepth || 10);
      if (vctMove) return vctMove;
    }

    // 6. 防守：檢查對手 VCF（限時 10% 預算）
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

    // 7. 迭代加深 Alpha-Beta（剩餘時間全部給 minimax）
    var remaining = searchDeadline - Date.now();
    searchDeadline = moveStartTime + timeLimit; // 恢復到完整截止時間
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
        // 同分候選隨機選擇，增加對局變化
        bestPos = bestTies.length > 1 ? bestTies[Math.floor(Math.random() * bestTies.length)] : depthBest;
      }
    }

    // 低級別隨機失誤
    if (cfg.mistakeRate > 0 && Math.random() < cfg.mistakeRate && candidates.length > 1) {
      var pool = candidates.slice(0, Math.min(5, candidates.length));
      bestPos = pool[Math.floor(Math.random() * pool.length)];
    }
    return bestPos;
  }

  // ============================================================
  // VCF 搜尋 — Victory by Continuous Fours
  // ============================================================
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

      // 直接五連？
      var pat = analyzePoint(board, move.x, move.y, color);
      if (pat.five > 0) {
        board[move.y][move.x] = 0;
        return move;
      }

      // 活四？必勝
      if (pat.openFour > 0) {
        board[move.y][move.x] = 0;
        return move;
      }

      // 衝四：找防守點，遞迴
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

        if (allDefended && defenses.length > 0) {
          board[move.y][move.x] = 0;
          return move;
        }
      }

      board[move.y][move.x] = 0;
    }
    return null;
  }

  // ============================================================
  // VCT 搜尋 — Victory by Continuous Threats
  // ============================================================
  function vctSearch(board, color, maxDepth) {
    return vctRecursive(board, color, maxDepth, 0);
  }

  function vctRecursive(board, color, maxDepth, depth) {
    if (depth >= maxDepth) return null;
    if (searchDeadline > 0 && Date.now() >= searchDeadline) return null;
    var opp = color === 1 ? 2 : 1;

    // 先嘗試 VCF
    var vcf = vcfRecursive(board, color, maxDepth - depth, 0);
    if (vcf) return vcf;

    // 找活三走法
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

  // ============================================================
  // 棋型搜尋工具
  // ============================================================
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

  // ============================================================
  // 防守函數
  // ============================================================
  function getFourDefenses(board, px, py, color) {
    var defenses = [];
    for (var d = 0; d < DIRS.length; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var count = 1;
      var emptySpots = [];
      // 正方向：掃描連續己方棋子和空位（支援跳四）
      var gap = false;
      for (var s = 1; s <= 5; s++) {
        var nx = px + dx * s, ny = py + dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
        if (board[ny][nx] === color) { count++; }
        else if (board[ny][nx] === 0 && !gap) { emptySpots.push({x:nx,y:ny}); gap = true; }
        else break;
      }
      gap = false;
      // 反方向
      for (var s = 1; s <= 5; s++) {
        var nx = px - dx * s, ny = py - dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
        if (board[ny][nx] === color) { count++; }
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
      var count = 1;
      var emptySpots = [];
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

  // ============================================================
  // Alpha-Beta Minimax（優化版：lastMove checkWinner + 減少深層候選）
  // ============================================================
  function minimax(board, depth, isMax, aiColor, alpha, beta, cfg, lastX, lastY) {
    if (searchDeadline > 0 && Date.now() >= searchDeadline) {
      searchAborted = true;
      return 0;
    }
    var opp = aiColor === 1 ? 2 : 1;

    // 只檢查最後落子點附近的勝負（大幅加速）
    if (lastX !== undefined && lastY !== undefined) {
      var lastColor = board[lastY][lastX];
      if (lastColor !== 0 && checkWinAt(board, lastX, lastY, lastColor)) {
        return lastColor === aiColor ? S.FIVE : -S.FIVE;
      }
    }

    if (depth <= 0) return evaluate(board, aiColor, cfg);

    var currentColor = isMax ? aiColor : opp;
    // 深層搜尋用更少候選（加速）
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

  // ============================================================
  // 候選排序與評估
  // ============================================================
  function sortCandidates(board, candidates, color) {
    var opp = color === 1 ? 2 : 1;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      c.hScore = quickEvalPoint(board, c.x, c.y, color, opp);
    }
    candidates.sort(function(a, b) { return b.hScore - a.hScore; });
    return candidates;
  }

  // 快速單點評估（不建字串，直接計數）
  function quickEvalPoint(board, px, py, color, opp) {
    var score = 0;
    // 進攻
    board[py][px] = color;
    for (var d = 0; d < DIRS.length; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var count = 1, openEnds = 0, hasGap = false;
      // 正方向
      for (var s = 1; s < 5; s++) {
        var nx = px + dx * s, ny = py + dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
        if (board[ny][nx] === color) count++;
        else if (board[ny][nx] === 0) {
          if (!hasGap && s < 4) {
            var nx2 = nx + dx, ny2 = ny + dy;
            if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === color) {
              hasGap = true; continue;
            }
          }
          openEnds++; break;
        } else break;
      }
      // 反方向
      for (var s = 1; s < 5; s++) {
        var nx = px - dx * s, ny = py - dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
        if (board[ny][nx] === color) count++;
        else if (board[ny][nx] === 0) {
          if (!hasGap && s < 4) {
            var nx2 = nx - dx, ny2 = ny - dy;
            if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === color) {
              hasGap = true; continue;
            }
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
    // 防守
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
            if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === opp) {
              hasGap = true; continue;
            }
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
            if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === opp) {
              hasGap = true; continue;
            }
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
    // 位置加分
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

  // ============================================================
  // 全局評估函數（快速版：只掃描有棋子的點）
  // ============================================================
  function evaluate(board, aiColor, cfg) {
    var opp = aiColor === 1 ? 2 : 1;
    var aiScore = evalFast(board, aiColor, opp);
    var oppScore = evalFast(board, opp, aiColor);
    // 對手威脅加權 1.1x（防守意識）
    return aiScore * (cfg.evalWeight || 1.0) - oppScore * 1.1;
  }

  // 快速評估：只掃描有棋子的點，每個方向直接計數
  function evalFast(board, color, opp) {
    var total = 0;
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        if (board[y][x] !== color) continue;
        for (var d = 0; d < DIRS.length; d++) {
          var dx = DIRS[d][0], dy = DIRS[d][1];
          // 只從線段起點計算（前一格不是己方）
          var px = x - dx, py = y - dy;
          if (px >= 0 && px < SIZE && py >= 0 && py < SIZE && board[py][px] === color) continue;

          var count = 0, openEnds = 0, hasGap = false;
          // 檢查起點前是否開放
          if (px >= 0 && px < SIZE && py >= 0 && py < SIZE && board[py][px] === 0) openEnds++;

          // 掃描正方向（允許一個間隔）
          var sx = x, sy = y;
          for (var s = 0; s < 6; s++) {
            if (sx < 0 || sx >= SIZE || sy < 0 || sy >= SIZE) break;
            if (board[sy][sx] === color) {
              count++;
            } else if (board[sy][sx] === 0) {
              if (!hasGap && count > 0 && count < 4) {
                // 看間隔後面是否還有己方棋子
                var nx2 = sx + dx, ny2 = sy + dy;
                if (nx2 >= 0 && nx2 < SIZE && ny2 >= 0 && ny2 < SIZE && board[ny2][nx2] === color) {
                  hasGap = true;
                  sx += dx; sy += dy;
                  continue;
                }
              }
              openEnds++;
              break;
            } else {
              // 對方棋子
              break;
            }
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

  // ============================================================
  // 工具函數
  // ============================================================

  function findWinMove(board, color) {
    var nearby = getNearby(board, 2);
    for (var i = 0; i < nearby.length; i++) {
      var c = nearby[i];
      board[c.y][c.x] = color;
      if (checkWinAt(board, c.x, c.y, color)) {
        board[c.y][c.x] = 0;
        return c;
      }
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

  // 只檢查某點是否形成五連（快速版，用於 minimax）
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

  // 全盤掃描版（給 Game.js 用）
  function checkWinner(board) {
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var c = board[y][x];
        if (c === 0) continue;
        for (var d = 0; d < DIRS.length; d++) {
          var dx = DIRS[d][0], dy = DIRS[d][1];
          var count = 1;
          for (var s = 1; s < 5; s++) {
            var nx = x + dx * s, ny = y + dy * s;
            if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE || board[ny][nx] !== c) break;
            count++;
          }
          if (count >= 5) return c;
        }
      }
    }
    return 0;
  }

  return { getMove: getMove, checkWinner: checkWinner, LEVELS: LEVELS };
})();
