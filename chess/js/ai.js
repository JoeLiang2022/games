// Chinese Chess AI — Minimax + Alpha-Beta
var AI = (function() {
  'use strict';

  // Piece values
  var VAL = { k: 10000, r: 900, c: 450, h: 400, e: 200, a: 200, p: 100 };

  // Position bonus tables (10x9, from black's perspective row 0-9)
  var POS = {
    p: [ // Pawn — more valuable after crossing river, center preferred
      [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
      [10,0,20,0,20,0,20,0,10],[20,30,40,50,40,50,40,30,20],
      [20,40,50,60,70,60,50,40,20],[30,50,60,70,80,70,60,50,30],
      [30,50,60,70,80,70,60,50,30],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]
    ],
    h: [ // Horse — center and forward preferred
      [0,0,10,10,0,10,10,0,0],[10,20,30,30,20,30,30,20,10],
      [10,20,30,40,30,40,30,20,10],[20,30,40,50,40,50,40,30,20],
      [20,30,50,50,50,50,50,30,20],[20,30,40,50,40,50,40,30,20],
      [10,20,30,40,30,40,30,20,10],[10,20,30,30,20,30,30,20,10],
      [0,0,10,10,0,10,10,0,0],[0,0,0,10,0,10,0,0,0]
    ],
    r: [ // Rook — open files, 7th rank
      [10,10,10,20,20,20,10,10,10],[20,30,30,40,40,40,30,30,20],
      [10,20,20,30,40,30,20,20,10],[10,20,20,30,40,30,20,20,10],
      [10,20,20,30,40,30,20,20,10],[10,20,20,30,40,30,20,20,10],
      [20,30,30,40,50,40,30,30,20],[10,20,20,30,40,30,20,20,10],
      [10,10,10,20,20,20,10,10,10],[10,10,10,20,20,20,10,10,10]
    ],
    c: [ // Cannon
      [10,10,10,20,30,20,10,10,10],[10,10,10,20,20,20,10,10,10],
      [10,10,20,30,30,30,20,10,10],[10,20,20,30,40,30,20,20,10],
      [10,20,20,30,40,30,20,20,10],[10,20,20,30,40,30,20,20,10],
      [10,10,20,30,30,30,20,10,10],[10,10,10,20,20,20,10,10,10],
      [10,10,10,20,30,20,10,10,10],[10,10,10,20,20,20,10,10,10]
    ]
  };

  function evaluate(board, color) {
    var score = 0;
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = board[r][c];
        if (!p) continue;
        var v = VAL[p.type] || 0;
        var posBonus = 0;
        var posTable = POS[p.type];
        if (posTable) {
          // For red, flip the row
          var pr = p.color === 'b' ? r : (9 - r);
          posBonus = posTable[pr][c];
        }
        var total = v + posBonus;
        score += (p.color === color) ? total : -total;
      }
    }
    return score;
  }

  // Generate all legal moves for a color
  function allMoves(color) {
    var board = Game.getBoard();
    var result = [];
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        if (board[r][c] && board[r][c].color === color) {
          var mvs = Game.getMoves(r, c);
          for (var i = 0; i < mvs.length; i++) {
            result.push({ fr: r, fc: c, tr: mvs[i].row, tc: mvs[i].col });
          }
        }
      }
    }
    return result;
  }

  // Sort moves for better pruning (captures first, high-value targets first)
  function sortMoves(moves) {
    var board = Game.getBoard();
    return moves.sort(function(a, b) {
      var va = board[a.tr][a.tc] ? (VAL[board[a.tr][a.tc].type] || 0) : 0;
      var vb = board[b.tr][b.tc] ? (VAL[board[b.tr][b.tc].type] || 0) : 0;
      return vb - va;
    });
  }

  var searchNodes = 0;
  var deadline = 0;

  function minimax(depth, alpha, beta, maximizing, aiColor) {
    searchNodes++;
    if (Date.now() > deadline) return evaluate(Game.getBoard(), aiColor);

    var color = maximizing ? aiColor : (aiColor === 'r' ? 'b' : 'r');
    var moves = allMoves(color);
    if (moves.length === 0) return maximizing ? -99999 : 99999;
    if (depth <= 0) return evaluate(Game.getBoard(), aiColor);

    sortMoves(moves);
    var board = Game.getBoard();

    if (maximizing) {
      var best = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        var captured = board[m.tr][m.tc];
        var piece = board[m.fr][m.fc];
        board[m.tr][m.tc] = piece;
        board[m.fr][m.fc] = null;
        var val = minimax(depth - 1, alpha, beta, false, aiColor);
        board[m.fr][m.fc] = piece;
        board[m.tr][m.tc] = captured;
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (beta <= alpha) break;
        if (Date.now() > deadline) break;
      }
      return best;
    } else {
      var best = Infinity;
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        var captured = board[m.tr][m.tc];
        var piece = board[m.fr][m.fc];
        board[m.tr][m.tc] = piece;
        board[m.fr][m.fc] = null;
        var val = minimax(depth - 1, alpha, beta, true, aiColor);
        board[m.fr][m.fc] = piece;
        board[m.tr][m.tc] = captured;
        if (val < best) best = val;
        if (best < beta) beta = best;
        if (beta <= alpha) break;
        if (Date.now() > deadline) break;
      }
      return best;
    }
  }

  function getMove(aiColor, depth, timeLimit) {
    depth = depth || 3;
    timeLimit = timeLimit || 3000;
    deadline = Date.now() + timeLimit;
    searchNodes = 0;

    var moves = allMoves(aiColor);
    if (moves.length === 0) return null;
    sortMoves(moves);

    var board = Game.getBoard();
    var bestMove = moves[0];
    var bestVal = -Infinity;

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var captured = board[m.tr][m.tc];
      var piece = board[m.fr][m.fc];
      board[m.tr][m.tc] = piece;
      board[m.fr][m.fc] = null;
      var val = minimax(depth - 1, -Infinity, Infinity, false, aiColor);
      board[m.fr][m.fc] = piece;
      board[m.tr][m.tc] = captured;
      if (val > bestVal) { bestVal = val; bestMove = m; }
      if (Date.now() > deadline) break;
    }
    return bestMove;
  }

  // Piece name in Chinese
  var PIECE_NAMES = {
    k:'將/帥', a:'士/仕', e:'象/相', h:'馬', r:'車', c:'炮', p:'兵/卒'
  };

  // Evaluate a player's move: compare to best possible move
  function evaluatePlayerMove(fr, fc, tr, tc, playerColor) {
    var board = Game.getBoard();
    // Find best move for player
    var bestMove = getMove(playerColor, 3, 1500);
    if (!bestMove) return { rating: 'ok', msg: '' };

    // Score the player's actual move
    var piece = board[tr][tc]; // piece already moved
    var captured = null; // already captured

    // Undo to evaluate
    Game.undoMove();
    var scoreBefore = evaluate(board, playerColor);

    // Re-do player's move
    Game.makeMove(fr, fc, tr, tc);
    var scoreAfter = evaluate(board, playerColor);
    var playerDelta = scoreAfter - scoreBefore;

    // Simulate best move
    Game.undoMove();
    var bestCaptured = board[bestMove.tr][bestMove.tc];
    var bestPiece = board[bestMove.fr][bestMove.fc];
    board[bestMove.tr][bestMove.tc] = bestPiece;
    board[bestMove.fr][bestMove.fc] = null;
    var bestScoreAfter = evaluate(board, playerColor);
    var bestDelta = bestScoreAfter - scoreBefore;
    // Restore
    board[bestMove.fr][bestMove.fc] = bestPiece;
    board[bestMove.tr][bestMove.tc] = bestCaptured;
    // Re-do player's move again
    Game.makeMove(fr, fc, tr, tc);

    var diff = playerDelta - bestDelta;
    var pName = PIECE_NAMES[piece ? piece.type : ''] || '';
    var bestPName = PIECE_NAMES[bestPiece ? bestPiece.type : ''] || '';

    if (diff >= -20) {
      return { rating: 'good', msg: '👍 好棋！', best: null };
    } else if (diff >= -80) {
      return { rating: 'ok', msg: '👌 還行', best: bestMove, bestName: bestPName };
    } else if (diff >= -200) {
      return { rating: 'warn', msg: '🤔 有更好的走法', best: bestMove, bestName: bestPName };
    } else {
      return { rating: 'bad', msg: '⚠️ 失誤！', best: bestMove, bestName: bestPName };
    }
  }

  return { getMove: getMove, evaluate: evaluate, evaluatePlayerMove: evaluatePlayerMove, VAL: VAL };
})();
