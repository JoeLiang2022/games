// Chinese Chess (象棋) Game Engine
// Board: 9 columns (0-8) x 10 rows (0-9)
// Red at bottom (rows 5-9), Black at top (rows 0-4)
// Piece format: { type, color } where color = 'r' (red) or 'b' (black)

var Game = (function() {
  'use strict';

  // Piece types
  var K = 'k'; // 將/帥 (King)
  var A = 'a'; // 士/仕 (Advisor)
  var E = 'e'; // 象/相 (Elephant)
  var H = 'h'; // 馬 (Horse)
  var R = 'r'; // 車 (Rook)
  var C = 'c'; // 炮 (Cannon)
  var P = 'p'; // 兵/卒 (Pawn)

  var board = [];
  var turn = 'r';
  var selected = null;
  var moves = [];
  var gameOver = false;
  var winner = null;
  var isDraw = false;
  var positionHistory = {}; // hash → count
  var noCaptureMoves = 0; // consecutive moves without capture

  // Display names
  var NAMES = {
    r: { k:'帥', a:'仕', e:'相', h:'馬', r:'車', c:'炮', p:'兵' },
    b: { k:'將', a:'士', e:'象', h:'馬', r:'車', c:'炮', p:'卒' }
  };

  function init() {
    board = [];
    for (var r = 0; r < 10; r++) {
      board[r] = [];
      for (var c = 0; c < 9; c++) board[r][c] = null;
    }
    // Black pieces (top, rows 0-4)
    board[0][0] = {type:R,color:'b'}; board[0][1] = {type:H,color:'b'};
    board[0][2] = {type:E,color:'b'}; board[0][3] = {type:A,color:'b'};
    board[0][4] = {type:K,color:'b'}; board[0][5] = {type:A,color:'b'};
    board[0][6] = {type:E,color:'b'}; board[0][7] = {type:H,color:'b'};
    board[0][8] = {type:R,color:'b'};
    board[2][1] = {type:C,color:'b'}; board[2][7] = {type:C,color:'b'};
    board[3][0] = {type:P,color:'b'}; board[3][2] = {type:P,color:'b'};
    board[3][4] = {type:P,color:'b'}; board[3][6] = {type:P,color:'b'};
    board[3][8] = {type:P,color:'b'};
    // Red pieces (bottom, rows 5-9)
    board[9][0] = {type:R,color:'r'}; board[9][1] = {type:H,color:'r'};
    board[9][2] = {type:E,color:'r'}; board[9][3] = {type:A,color:'r'};
    board[9][4] = {type:K,color:'r'}; board[9][5] = {type:A,color:'r'};
    board[9][6] = {type:E,color:'r'}; board[9][7] = {type:H,color:'r'};
    board[9][8] = {type:R,color:'r'};
    board[7][1] = {type:C,color:'r'}; board[7][7] = {type:C,color:'r'};
    board[6][0] = {type:P,color:'r'}; board[6][2] = {type:P,color:'r'};
    board[6][4] = {type:P,color:'r'}; board[6][6] = {type:P,color:'r'};
    board[6][8] = {type:P,color:'r'};

    turn = 'r';
    selected = null;
    moves = [];
    gameOver = false;
    winner = null;
    isDraw = false;
    positionHistory = {};
    noCaptureMoves = 0;
    recordPosition();
  }

  // Generate a hash of the current board position + turn
  function boardHash() {
    var h = turn;
    for (var r = 0; r < 10; r++)
      for (var c = 0; c < 9; c++) {
        var p = board[r][c];
        h += p ? (p.type + p.color) : '.';
      }
    return h;
  }

  function recordPosition() {
    var h = boardHash();
    positionHistory[h] = (positionHistory[h] || 0) + 1;
  }

  function at(r, c) { return (r >= 0 && r < 10 && c >= 0 && c < 9) ? board[r][c] : undefined; }
  function inBoard(r, c) { return r >= 0 && r < 10 && c >= 0 && c < 9; }

  // Palace bounds
  function inPalace(r, c, color) {
    if (c < 3 || c > 5) return false;
    return color === 'b' ? (r >= 0 && r <= 2) : (r >= 7 && r <= 9);
  }

  // Own half
  function inOwnHalf(r, color) {
    return color === 'b' ? (r >= 0 && r <= 4) : (r >= 5 && r <= 9);
  }

  // Count pieces between two points on same row or col
  function countBetween(r1, c1, r2, c2) {
    var cnt = 0;
    if (r1 === r2) {
      var minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
      for (var c = minC + 1; c < maxC; c++) if (board[r1][c]) cnt++;
    } else if (c1 === c2) {
      var minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
      for (var r = minR + 1; r < maxR; r++) if (board[r][c1]) cnt++;
    }
    return cnt;
  }

  // Generate legal moves for a piece at (r, c)
  function getMoves(r, c) {
    var piece = board[r][c];
    if (!piece) return [];
    var result = [];
    var color = piece.color;

    function add(tr, tc) {
      if (!inBoard(tr, tc)) return;
      var target = board[tr][tc];
      if (target && target.color === color) return;
      result.push({row: tr, col: tc});
    }

    switch (piece.type) {
      case K: // King: one step within palace
        [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(function(p) {
          if (inPalace(p[0], p[1], color)) add(p[0], p[1]);
        });
        break;

      case A: // Advisor: diagonal within palace
        [[r-1,c-1],[r-1,c+1],[r+1,c-1],[r+1,c+1]].forEach(function(p) {
          if (inPalace(p[0], p[1], color)) add(p[0], p[1]);
        });
        break;

      case E: // Elephant: diagonal 2 steps, no crossing river, blocked by eye
        [[[-2,-2],[-1,-1]],[[-2,2],[-1,1]],[[2,-2],[1,-1]],[[2,2],[1,1]]].forEach(function(d) {
          var tr = r + d[0][0], tc = c + d[0][1];
          var er = r + d[1][0], ec = c + d[1][1];
          if (inBoard(tr, tc) && inOwnHalf(tr, color) && !board[er][ec]) add(tr, tc);
        });
        break;

      case H: // Horse: L-shape, blocked by leg
        [[-2,-1,-1,0],[-2,1,-1,0],[-1,-2,0,-1],[-1,2,0,1],
         [1,-2,0,-1],[1,2,0,1],[2,-1,1,0],[2,1,1,0]].forEach(function(d) {
          var tr = r + d[0], tc = c + d[1];
          var lr = r + d[2], lc = c + d[3]; // leg position
          if (inBoard(tr, tc) && !board[lr][lc]) add(tr, tc);
        });
        break;

      case R: // Rook: straight lines
        [[-1,0],[1,0],[0,-1],[0,1]].forEach(function(d) {
          for (var i = 1; i < 10; i++) {
            var tr = r + d[0]*i, tc = c + d[1]*i;
            if (!inBoard(tr, tc)) break;
            if (board[tr][tc]) { if (board[tr][tc].color !== color) result.push({row:tr,col:tc}); break; }
            result.push({row:tr, col:tc});
          }
        });
        break;

      case C: // Cannon: straight, jump over exactly one to capture
        [[-1,0],[1,0],[0,-1],[0,1]].forEach(function(d) {
          var jumped = false;
          for (var i = 1; i < 10; i++) {
            var tr = r + d[0]*i, tc = c + d[1]*i;
            if (!inBoard(tr, tc)) break;
            if (!jumped) {
              if (board[tr][tc]) jumped = true;
              else result.push({row:tr, col:tc});
            } else {
              if (board[tr][tc]) {
                if (board[tr][tc].color !== color) result.push({row:tr, col:tc});
                break;
              }
            }
          }
        });
        break;

      case P: // Pawn: forward, after crossing river also sideways
        var fwd = color === 'r' ? -1 : 1;
        add(r + fwd, c);
        if (!inOwnHalf(r, color)) { add(r, c - 1); add(r, c + 1); }
        break;
    }
    return result;
  }

  // Find king position
  function findKing(color) {
    for (var r = 0; r < 10; r++)
      for (var c = 0; c < 9; c++)
        if (board[r][c] && board[r][c].type === K && board[r][c].color === color)
          return {row: r, col: c};
    return null;
  }

  // Check if kings face each other (flying general)
  function kingsFacing() {
    var rk = findKing('r'), bk = findKing('b');
    if (!rk || !bk || rk.col !== bk.col) return false;
    return countBetween(rk.row, rk.col, bk.row, bk.col) === 0;
  }

  // Is the given color in check?
  function isInCheck(color) {
    var king = findKing(color);
    if (!king) return true;
    var opp = color === 'r' ? 'b' : 'r';
    for (var r = 0; r < 10; r++)
      for (var c = 0; c < 9; c++)
        if (board[r][c] && board[r][c].color === opp) {
          var mvs = getMoves(r, c);
          for (var i = 0; i < mvs.length; i++)
            if (mvs[i].row === king.row && mvs[i].col === king.col) return true;
        }
    // Flying general
    if (kingsFacing()) return true;
    return false;
  }

  // Get legal moves (filter out moves that leave own king in check)
  function getLegalMoves(r, c) {
    var piece = board[r][c];
    if (!piece) return [];
    var raw = getMoves(r, c);
    var legal = [];
    for (var i = 0; i < raw.length; i++) {
      var m = raw[i];
      var captured = board[m.row][m.col];
      board[m.row][m.col] = piece;
      board[r][c] = null;
      if (!isInCheck(piece.color) && !kingsFacing()) legal.push(m);
      board[r][c] = piece;
      board[m.row][m.col] = captured;
    }
    return legal;
  }

  // Check if color has any legal move
  function hasLegalMove(color) {
    for (var r = 0; r < 10; r++)
      for (var c = 0; c < 9; c++)
        if (board[r][c] && board[r][c].color === color)
          if (getLegalMoves(r, c).length > 0) return true;
    return false;
  }

  // Make a move
  function makeMove(fr, fc, tr, tc) {
    var piece = board[fr][fc];
    var captured = board[tr][tc];
    moves.push({from:{row:fr,col:fc}, to:{row:tr,col:tc}, captured:captured, piece:piece});
    board[tr][tc] = piece;
    board[fr][fc] = null;
    turn = turn === 'r' ? 'b' : 'r';

    // Track captures for 60-move rule
    if (captured) { noCaptureMoves = 0; } else { noCaptureMoves++; }

    // Record position for repetition detection
    recordPosition();
    var h = boardHash();

    // Check draw conditions
    if (positionHistory[h] >= 3) {
      gameOver = true; isDraw = true; winner = null;
    } else if (noCaptureMoves >= 120) { // 60 moves = 120 half-moves
      gameOver = true; isDraw = true; winner = null;
    } else if (!hasLegalMove(turn)) {
      gameOver = true;
      winner = turn === 'r' ? 'b' : 'r';
    }
    return { captured: captured, check: isInCheck(turn), isDraw: isDraw };
  }

  // Undo last move
  function undoMove() {
    if (moves.length === 0) return false;
    // Decrement position count
    var h = boardHash();
    if (positionHistory[h]) positionHistory[h]--;
    var m = moves.pop();
    board[m.from.row][m.from.col] = m.piece;
    board[m.to.row][m.to.col] = m.captured;
    turn = turn === 'r' ? 'b' : 'r';
    if (m.captured) { noCaptureMoves = 0; } else { noCaptureMoves = Math.max(0, noCaptureMoves - 1); }
    gameOver = false;
    winner = null;
    isDraw = false;
    return true;
  }

  // Handle click at board position
  function handleClick(r, c) {
    if (gameOver) return null;
    var piece = board[r][c];

    // If a piece is selected, try to move
    if (selected) {
      // Click same piece = deselect
      if (selected.row === r && selected.col === c) {
        selected = null;
        return { action: 'deselect' };
      }
      // Click own piece = reselect
      if (piece && piece.color === turn) {
        selected = {row: r, col: c};
        return { action: 'select', row: r, col: c, moves: getLegalMoves(r, c) };
      }
      // Try move
      var legal = getLegalMoves(selected.row, selected.col);
      for (var i = 0; i < legal.length; i++) {
        if (legal[i].row === r && legal[i].col === c) {
          var fr = selected.row, fc = selected.col;
          selected = null;
          var result = makeMove(fr, fc, r, c);
          return { action: 'move', from:{row:fr,col:fc}, to:{row:r,col:c}, captured:result.captured, check:result.check, gameOver:gameOver, winner:winner, isDraw:isDraw };
        }
      }
      // Invalid move target
      selected = null;
      return { action: 'deselect' };
    }

    // No selection — select own piece
    if (piece && piece.color === turn) {
      selected = {row: r, col: c};
      return { action: 'select', row: r, col: c, moves: getLegalMoves(r, c) };
    }
    return null;
  }

  return {
    init: init,
    handleClick: handleClick,
    makeMove: makeMove,
    undoMove: undoMove,
    getBoard: function() { return board; },
    getTurn: function() { return turn; },
    getSelected: function() { return selected; },
    getMoves: getLegalMoves,
    isGameOver: function() { return gameOver; },
    getWinner: function() { return winner; },
    isDraw: function() { return isDraw; },
    isInCheck: isInCheck,
    getMoveHistory: function() { return moves; },
    NAMES: NAMES,
    findKing: findKing
  };
})();
