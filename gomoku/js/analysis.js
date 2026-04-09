/**
 * analysis.js — 五子棋覆盤分析（改良版）
 * 
 * 棋型評估參考：
 * - CodeCup 2020 冠軍 "OOOOO" 的威脅分類系統
 *   (https://sortingsearching.com/2020/05/18/gomoku.html)
 * - 標準五子棋棋型：五連、活四、衝四、活三、眠三、活二、眠二
 * - 組合威脅加分（雙活三、衝四活三等必勝棋型）
 *
 * 評估公式（改良自 CodeCup 2020）：
 *   每個空位取四方向最好的兩個威脅等級 a, b
 *   單方分數 = Σ (1.5 × 1.8^a + 1.8^b)
 */
var Analysis = (function() {
  var SIZE = 15;
  var results = [];

  // ===== 威脅等級定義（0-16，數字越大越強）=====
  // 參考 CodeCup 2020 的 16 級威脅分類
  var THREAT = {
    NONE: 0,
    DEAD_ONE: 1,    // 死一（無法延伸成五）
    ONE_1: 2,       // 活一（可延伸 1 種方式）
    ONE_2: 3,       // 活一（可延伸 2 種方式）
    ONE_3: 4,       // 活一（可延伸 3 種方式）
    DEAD_TWO: 5,    // 眠二
    OPEN_TWO: 6,    // 活二
    DEAD_THREE: 7,  // 眠三（含斷三）
    OPEN_THREE: 8,  // 活三
    DEAD_FOUR: 9,   // 衝四（半四）
    OPEN_FOUR: 10,  // 活四
    FIVE: 11        // 五連
  };

  // 威脅等級對應的基礎分數（用於 1.8^level 公式）
  var THREAT_BASE = 1.8;

  // ===== 棋型 Pattern 辨識 =====
  // 在一條線上掃描，辨識所有棋型
  // 回傳該線上最高的威脅等級

  /**
   * 掃描一條線（5 格窗口），回傳威脅等級
   * line: 長度不定的陣列，值為 0(空)/1(己方)/2(對方)/-1(邊界)
   */
  function scanLine(line, color) {
    var opp = color === 1 ? 2 : 1;
    var best = THREAT.NONE;

    // 用滑動窗口掃描所有長度為 5 的子序列
    for (var i = 0; i <= line.length - 5; i++) {
      var window = [];
      for (var j = 0; j < 5; j++) window.push(line[i + j]);

      // 窗口內不能有對方棋子
      var hasOpp = false;
      var myCount = 0;
      var emptyCount = 0;
      for (var j = 0; j < 5; j++) {
        if (window[j] === opp) { hasOpp = true; break; }
        if (window[j] === color) myCount++;
        if (window[j] === 0) emptyCount++;
      }
      if (hasOpp) continue;

      // 檢查窗口兩端是否開放
      var leftOpen = (i > 0 && line[i - 1] === 0);
      var rightOpen = (i + 5 < line.length && line[i + 5] === 0);
      var openEnds = (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0);

      var threat = THREAT.NONE;
      if (myCount === 5) {
        threat = THREAT.FIVE;
      } else if (myCount === 4) {
        threat = openEnds >= 2 ? THREAT.OPEN_FOUR : (openEnds === 1 ? THREAT.DEAD_FOUR : THREAT.NONE);
      } else if (myCount === 3) {
        threat = openEnds >= 2 ? THREAT.OPEN_THREE : (openEnds === 1 ? THREAT.DEAD_THREE : THREAT.NONE);
      } else if (myCount === 2) {
        threat = openEnds >= 2 ? THREAT.OPEN_TWO : (openEnds === 1 ? THREAT.DEAD_TWO : THREAT.NONE);
      } else if (myCount === 1) {
        if (openEnds >= 2) threat = THREAT.ONE_3;
        else if (openEnds === 1) threat = THREAT.ONE_1;
      }

      if (threat > best) best = threat;
    }

    // 額外檢查：斷三 (broken three) — 如 X_XX_ 或 _XX_X
    // 在長度 6 的窗口中找
    for (var i = 0; i <= line.length - 6; i++) {
      var seg = [];
      for (var j = 0; j < 6; j++) seg.push(line[i + j]);
      // 斷三模式：0,C,0,C,C,0 或 0,C,C,0,C,0
      if (seg[0] === 0 && seg[5] === 0) {
        var inner = [seg[1], seg[2], seg[3], seg[4]];
        var innerMy = 0, innerOpp = 0;
        for (var j = 0; j < 4; j++) {
          if (inner[j] === color) innerMy++;
          if (inner[j] === opp) innerOpp++;
        }
        if (innerMy === 3 && innerOpp === 0) {
          // 確認是斷三（有一個空格在中間）
          var emptyInner = 0;
          for (var j = 0; j < 4; j++) if (inner[j] === 0) emptyInner++;
          if (emptyInner === 1) {
            var t = THREAT.OPEN_THREE; // 斷三視為活三等級
            if (t > best) best = t;
          }
        }
      }
    }

    return best;
  }

  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  /**
   * 取得某位置在四個方向的威脅等級
   * 回傳 [best1, best2]（最好的兩個方向）
   */
  function getThreatLevels(board, gx, gy, color) {
    var levels = [];
    for (var d = 0; d < DIRS.length; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      // 建構這條線（向兩邊延伸最多 5 格）
      var line = [];
      // 反方向
      for (var s = 5; s >= 1; s--) {
        var nx = gx - dx * s, ny = gy - dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) line.push(-1);
        else line.push(board[ny][nx]);
      }
      // 自己
      line.push(board[gy][gx]);
      // 正方向
      for (var s = 1; s <= 5; s++) {
        var nx = gx + dx * s, ny = gy + dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) line.push(-1);
        else line.push(board[ny][nx]);
      }
      levels.push(scanLine(line, color));
    }
    // 排序取最好的兩個
    levels.sort(function(a, b) { return b - a; });
    return [levels[0] || 0, levels[1] || 0];
  }

  /**
   * 改良版棋盤評估（參考 CodeCup 2020 公式）
   * 對每個空位，取四方向最好的兩個威脅 a, b
   * 分數 = Σ (1.5 × 1.8^a + 1.8^b)
   */
  function evalBoardImproved(board, color) {
    var score = 0;
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        if (board[y][x] !== 0) continue;
        var levels = getThreatLevels(board, x, y, color);
        var a = levels[0], b = levels[1];
        if (a > 0) score += 1.5 * Math.pow(THREAT_BASE, a) + Math.pow(THREAT_BASE, b);
      }
    }
    return score;
  }

  /**
   * 檢測組合威脅（雙活三、衝四活三等必勝棋型）
   * 回傳額外加分
   */
  function evalCombinedThreats(board, color) {
    var bonus = 0;
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        if (board[y][x] !== 0) continue;
        // 模擬落子後檢查
        board[y][x] = color;
        var threats = [];
        for (var d = 0; d < DIRS.length; d++) {
          var dx = DIRS[d][0], dy = DIRS[d][1];
          var line = [];
          for (var s = 5; s >= 1; s--) {
            var nx = x - dx * s, ny = y - dy * s;
            if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) line.push(-1);
            else line.push(board[ny][nx]);
          }
          line.push(board[y][x]);
          for (var s = 1; s <= 5; s++) {
            var nx = x + dx * s, ny = y + dy * s;
            if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) line.push(-1);
            else line.push(board[ny][nx]);
          }
          threats.push(scanLine(line, color));
        }
        board[y][x] = 0;

        // 統計威脅組合
        var openFours = 0, deadFours = 0, openThrees = 0;
        for (var t = 0; t < threats.length; t++) {
          if (threats[t] >= THREAT.OPEN_FOUR) openFours++;
          else if (threats[t] >= THREAT.DEAD_FOUR) deadFours++;
          else if (threats[t] >= THREAT.OPEN_THREE) openThrees++;
        }

        // 必勝組合加分
        if (openFours >= 1) bonus += 500000;           // 活四 = 幾乎必勝
        if (deadFours >= 2) bonus += 200000;            // 雙衝四
        if (deadFours >= 1 && openThrees >= 1) bonus += 100000; // 衝四活三
        if (openThrees >= 2) bonus += 80000;            // 雙活三
      }
    }
    return bonus;
  }

  /**
   * 完整的局面評估
   */
  function evalPosition(board, gx, gy, color) {
    var opp = color === 1 ? 2 : 1;
    board[gy][gx] = color;
    var myScore = evalBoardImproved(board, color) + evalCombinedThreats(board, color);
    var oppScore = evalBoardImproved(board, opp) + evalCombinedThreats(board, opp);
    board[gy][gx] = 0;
    return myScore - oppScore * 1.1;
  }

  function evalBoard(board, color) {
    var opp = color === 1 ? 2 : 1;
    var myScore = evalBoardImproved(board, color) + evalCombinedThreats(board, color);
    var oppScore = evalBoardImproved(board, opp) + evalCombinedThreats(board, opp);
    return myScore - oppScore * 1.1;
  }

  function scoreToWinRate(evalScore) {
    return Math.round(100 / (1 + Math.exp(-evalScore / 8000)));
  }

  function makeEmptyBoard() {
    var b = [];
    for (var y = 0; y < SIZE; y++) { b[y] = []; for (var x = 0; x < SIZE; x++) b[y][x] = 0; }
    return b;
  }

  // ===== 評分等級 =====
  var RATINGS = {
    BEST:       { label: '最佳', color: '#00d4ff', emoji: '✨' },
    GOOD:       { label: '好棋', color: '#4caf50', emoji: '👍' },
    OK:         { label: '普通', color: '#888',    emoji: '➖' },
    INACCURACY: { label: '疑問手', color: '#ff9800', emoji: '⚠️' },
    MISTAKE:    { label: '失誤', color: '#f44336', emoji: '❌' },
    BLUNDER:    { label: '大失誤', color: '#d32f2f', emoji: '💀' }
  };

  // ===== 棋型描述（給建議用）=====
  var THREAT_NAMES = {};
  THREAT_NAMES[THREAT.FIVE] = '五連';
  THREAT_NAMES[THREAT.OPEN_FOUR] = '活四';
  THREAT_NAMES[THREAT.DEAD_FOUR] = '衝四';
  THREAT_NAMES[THREAT.OPEN_THREE] = '活三';
  THREAT_NAMES[THREAT.DEAD_THREE] = '眠三';
  THREAT_NAMES[THREAT.OPEN_TWO] = '活二';
  THREAT_NAMES[THREAT.DEAD_TWO] = '眠二';

  /**
   * 分析某位置落子後形成的棋型描述
   */
  function describeMove(board, x, y, color) {
    board[y][x] = color;
    var threats = [];
    for (var d = 0; d < DIRS.length; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var line = [];
      for (var s = 5; s >= 1; s--) {
        var nx = x - dx * s, ny = y - dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) line.push(-1);
        else line.push(board[ny][nx]);
      }
      line.push(board[y][x]);
      for (var s = 1; s <= 5; s++) {
        var nx = x + dx * s, ny = y + dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) line.push(-1);
        else line.push(board[ny][nx]);
      }
      var t = scanLine(line, color);
      if (t >= THREAT.DEAD_TWO && THREAT_NAMES[t]) threats.push(THREAT_NAMES[t]);
    }
    board[y][x] = 0;
    // 去重
    var unique = [];
    for (var i = 0; i < threats.length; i++) {
      var found = false;
      for (var j = 0; j < unique.length; j++) { if (unique[j] === threats[i]) { found = true; break; } }
      if (!found) unique.push(threats[i]);
    }
    return unique;
  }

  /**
   * 檢查對手是否有緊急威脅需要防守
   */
  function findOppThreats(board, oppColor) {
    var urgent = [];
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        if (board[y][x] !== 0) continue;
        var threats = describeMove(board, x, y, oppColor);
        for (var i = 0; i < threats.length; i++) {
          if (threats[i] === '五連' || threats[i] === '活四' || threats[i] === '衝四') {
            urgent.push({ x: x, y: y, threat: threats[i] });
          }
        }
      }
    }
    return urgent;
  }

  /**
   * 產生建議文字
   */
  /**
   * 產生教練風格的分析文字（每一手都有說明）
   * 回傳 { short: '簡短標籤', detail: '詳細教練解說' }
   */
  function getAdvice(r, boardBefore) {
    if (!r) return { short: '', detail: '' };
    var coord = function(x, y) { return String.fromCharCode(65 + x) + (15 - y); };
    var mc = coord(r.move.x, r.move.y);
    var opp = r.move.color === 1 ? 2 : 1;
    var isBlack = r.move.color === 1;
    var who = isBlack ? '黑' : '白';

    // 分析棋型
    var actualThreats = describeMove(boardBefore, r.move.x, r.move.y, r.move.color);
    var bestThreats = r.bestMove ? describeMove(boardBefore, r.bestMove.x, r.bestMove.y, r.move.color) : [];
    var oppThreats = findOppThreats(boardBefore, opp);
    var bc = r.bestMove ? coord(r.bestMove.x, r.bestMove.y) : '';

    // 檢查是否需要防守
    var defendTarget = null;
    if (r.bestMove) {
      for (var i = 0; i < oppThreats.length; i++) {
        if (r.bestMove.x === oppThreats[i].x && r.bestMove.y === oppThreats[i].y) {
          defendTarget = oppThreats[i]; break;
        }
      }
    }
    // 檢查實際落子是否在防守
    var actualDefend = null;
    for (var i = 0; i < oppThreats.length; i++) {
      if (r.move.x === oppThreats[i].x && r.move.y === oppThreats[i].y) {
        actualDefend = oppThreats[i]; break;
      }
    }

    var rating = r.rating;
    var short = rating.emoji + ' ' + rating.label;
    var detail = '';

    if (rating === RATINGS.BEST) {
      if (actualThreats.length > 0) {
        detail = who + '下 ' + mc + '，形成' + actualThreats.join('＋') + '，是當前局面的最佳選擇。';
      } else if (actualDefend) {
        detail = who + '下 ' + mc + ' 防守對手的' + actualDefend.threat + '，判斷正確。';
      } else {
        detail = who + '下 ' + mc + '，佔據了最有利的位置。';
      }
    } else if (rating === RATINGS.GOOD) {
      if (actualThreats.length > 0) {
        detail = who + '下 ' + mc + '，形成' + actualThreats.join('＋') + '，是不錯的一手。';
      } else if (actualDefend) {
        detail = who + '下 ' + mc + ' 防守對手的' + actualDefend.threat + '，穩健的選擇。';
      } else {
        detail = who + '下 ' + mc + '，位置不錯，和最佳手差距很小。';
      }
    } else if (rating === RATINGS.OK) {
      detail = who + '下 ' + mc;
      if (actualThreats.length > 0) detail += '，形成' + actualThreats.join('＋');
      detail += '，但有更好的選擇。';
      if (r.bestMove) {
        detail += '最佳手是 ' + bc;
        if (bestThreats.length > 0) detail += '（可形成' + bestThreats.join('＋') + '）';
        detail += '。';
      }
    } else if (rating === RATINGS.INACCURACY) {
      detail = '⚠ 疑問手！' + who + '下 ' + mc;
      if (actualThreats.length > 0) {
        detail += '雖然形成了' + actualThreats.join('＋') + '，但效率不高。';
      } else {
        detail += '，沒有形成有效的攻防棋型。';
      }
      if (defendTarget) {
        detail += '此時對手有' + defendTarget.threat + '威脅，應下 ' + bc + ' 防守。';
      } else if (r.bestMove) {
        detail += '建議下 ' + bc;
        if (bestThreats.length > 0) detail += '，可形成' + bestThreats.join('＋');
        detail += '，效率更高。';
      }
    } else if (rating === RATINGS.MISTAKE) {
      detail = '❌ 失誤！' + who + '下 ' + mc;
      if (defendTarget) {
        detail += '，忽略了對手的' + defendTarget.threat + '威脅！應下 ' + bc + ' 防守，否則對手將取得巨大優勢。';
      } else {
        if (actualThreats.length > 0) {
          detail += '（' + actualThreats.join('＋') + '），但這不是當前局面的重點。';
        } else {
          detail += '，這步棋沒有形成有效棋型，浪費了一手。';
        }
        if (r.bestMove) {
          detail += '應下 ' + bc;
          if (bestThreats.length > 0) detail += '，形成' + bestThreats.join('＋');
          if (oppThreats.length > 0 && !defendTarget) detail += '，同時注意對手的威脅';
          detail += '。';
        }
      }
    } else if (rating === RATINGS.BLUNDER) {
      detail = '💀 大失誤！' + who + '下 ' + mc;
      if (defendTarget) {
        detail += '，完全忽略了對手的' + defendTarget.threat + '！這是致命的疏忽，必須下 ' + bc + ' 防守。不防守的話對手幾乎可以直接獲勝。';
      } else {
        if (actualThreats.length > 0) {
          detail += '（' + actualThreats.join('＋') + '），但方向完全錯誤。';
        } else {
          detail += '，這步棋毫無意義，嚴重浪費了局面優勢。';
        }
        if (r.bestMove) {
          detail += '正確的下法是 ' + bc;
          if (bestThreats.length > 0) detail += '，可形成' + bestThreats.join('＋');
          detail += '，局面差距巨大。';
        }
      }
    }

    return { short: short, detail: detail };
  }

  /**
   * 分析整盤棋
   */
  function analyze(moves, playerColor) {
    results = [];
    var board = makeEmptyBoard();
    var boards = []; // 儲存每步之前的棋盤快照

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var isPlayer = (m.color === playerColor);

      // 儲存落子前的棋盤快照（用於建議分析）
      var snapshot = [];
      for (var sy = 0; sy < SIZE; sy++) { snapshot[sy] = board[sy].slice(); }
      boards.push(snapshot);

      // AI 建議的最佳手
      var bestMove = AI.getMove(board, m.color, 'hard');
      var bestScore = bestMove ? evalPosition(board, bestMove.x, bestMove.y, m.color) : 0;

      // 實際下的這手
      var actualScore = evalPosition(board, m.x, m.y, m.color);

      // 分差
      var diff = bestScore - actualScore;

      // 評級
      var rating;
      if (bestMove && m.x === bestMove.x && m.y === bestMove.y) {
        rating = RATINGS.BEST;
      } else if (diff <= 100) {
        rating = RATINGS.GOOD;
      } else if (diff <= 500) {
        rating = RATINGS.OK;
      } else if (diff <= 3000) {
        rating = RATINGS.INACCURACY;
      } else if (diff <= 15000) {
        rating = RATINGS.MISTAKE;
      } else {
        rating = RATINGS.BLUNDER;
      }

      // 落子
      board[m.y][m.x] = m.color;

      // 勝率
      var evalScore = evalBoard(board, playerColor);
      var winRate = scoreToWinRate(evalScore);

      var r = {
        moveNum: i + 1,
        move: m,
        isPlayer: isPlayer,
        actualScore: actualScore,
        bestMove: bestMove,
        bestScore: bestScore,
        diff: diff,
        rating: rating,
        winRate: winRate,
        evalScore: evalScore
      };

      // 產生建議文字
      r.advice = getAdvice(r, snapshot);

      results.push(r);
    }
    return results;
  }

  /**
   * 統計摘要
   */
  function getSummary(playerColor) {
    var stats = { best: 0, good: 0, ok: 0, inaccuracy: 0, mistake: 0, blunder: 0, total: 0 };
    for (var i = 0; i < results.length; i++) {
      if (results[i].move.color !== playerColor) continue;
      stats.total++;
      if (results[i].rating === RATINGS.BEST) stats.best++;
      else if (results[i].rating === RATINGS.GOOD) stats.good++;
      else if (results[i].rating === RATINGS.OK) stats.ok++;
      else if (results[i].rating === RATINGS.INACCURACY) stats.inaccuracy++;
      else if (results[i].rating === RATINGS.MISTAKE) stats.mistake++;
      else if (results[i].rating === RATINGS.BLUNDER) stats.blunder++;
    }
    stats.accuracy = stats.total > 0 ? Math.round((stats.best + stats.good) / stats.total * 100) : 0;
    return stats;
  }

  /**
   * 關鍵轉折點
   */
  function getKeyMoments(count) {
    count = count || 5;
    var moments = [];
    for (var i = 1; i < results.length; i++) {
      var delta = Math.abs(results[i].winRate - results[i - 1].winRate);
      moments.push({ index: i, delta: delta, result: results[i] });
    }
    moments.sort(function(a, b) { return b.delta - a.delta; });
    return moments.slice(0, count);
  }

  /**
   * 產生棋譜文字（給 Gemini 用）
   */
  function toMoveText(moves, playerColor) {
    var lines = [];
    lines.push('棋盤: 15×15 五子棋');
    lines.push('玩家執: ' + (playerColor === 1 ? '黑子(先手)' : '白子(後手)'));
    lines.push('對手: AI (' + (playerColor === 1 ? '白子' : '黑子') + ')');
    lines.push('');
    lines.push('棋譜:');
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var coord = String.fromCharCode(65 + m.x) + (15 - m.y);
      var who = m.color === playerColor ? '玩家' : 'AI';
      var colorName = m.color === 1 ? '黑' : '白';
      lines.push((i + 1) + '. ' + colorName + '(' + who + ') ' + coord);
    }
    return lines.join('\n');
  }

  /**
   * 產生分析摘要文字（給 Gemini 用）
   */
  function toAnalysisText(playerColor) {
    var stats = getSummary(playerColor);
    var moments = getKeyMoments(3);
    var lines = [];
    lines.push('本地分析結果:');
    lines.push('準確率: ' + stats.accuracy + '%');
    lines.push('最佳: ' + stats.best + ', 好棋: ' + stats.good + ', 普通: ' + stats.ok);
    lines.push('疑問手: ' + stats.inaccuracy + ', 失誤: ' + stats.mistake + ', 大失誤: ' + stats.blunder);
    lines.push('');
    if (moments.length > 0) {
      lines.push('關鍵轉折:');
      for (var i = 0; i < moments.length; i++) {
        var m = moments[i];
        var r = m.result;
        var coord = String.fromCharCode(65 + r.move.x) + (15 - r.move.y);
        var who = r.isPlayer ? '玩家' : 'AI';
        lines.push('  第' + r.moveNum + '手 ' + coord + ' (' + who + ') - ' + r.rating.label + ', 勝率變化 ' + m.delta + '%');
      }
    }
    return lines.join('\n');
  }

  // ===== Gemini AI 評語（透過後端 proxy）=====
  var geminiResult = null;
  var REVIEW_API = 'https://mahjong-server-oc2m.onrender.com/api/gomoku/review';

  /**
   * 呼叫後端取得 Gemini AI 評語
   * @param {Array} moves
   * @param {number} playerColor
   * @returns {Promise<string>} AI 評語
   */
  function getGeminiReview(apiKey, moves, playerColor) {
    var moveText = toMoveText(moves, playerColor);
    var analysisText = toAnalysisText(playerColor);

    return fetch(REVIEW_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moveText: moveText, analysisText: analysisText })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.review) {
        geminiResult = data.review;
      } else {
        geminiResult = '（AI 評語暫時無法取得：' + (data.error || '未知錯誤') + '）';
      }
      return geminiResult;
    })
    .catch(function(err) {
      geminiResult = '（AI 評語載入失敗：' + err.message + '）';
      return geminiResult;
    });
  }

  return {
    analyze: analyze,
    getSummary: getSummary,
    getKeyMoments: getKeyMoments,
    toMoveText: toMoveText,
    toAnalysisText: toAnalysisText,
    getGeminiReview: getGeminiReview,
    describeMove: describeMove,
    findOppThreats: findOppThreats,
    evalPosition: evalPosition,
    evalBoard: evalBoard,
    get results() { return results; },
    get geminiResult() { return geminiResult; },
    RATINGS: RATINGS,
    THREAT: THREAT
  };
})();
