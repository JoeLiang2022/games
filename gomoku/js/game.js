/**
 * game.js — 五子棋遊戲主邏輯
 * v3: Web Worker 支援 — AI 計算在背景線程，UI 不卡頓
 */
var Game = (function() {
  var SIZE = 15;
  var board = [];    // board[y][x]: 0=空, 1=黑, 2=白
  var moves = [];    // [{x,y,color}, ...]
  var turn = 1;      // 1=黑, 2=白
  var gameOver = false;
  var mode = 'single'; // 'single' | 'multi'
  var aiColor = 2;     // AI 的顏色
  var playerColor = 1; // 玩家的顏色
  var difficulty = '10k';
  var aiThinking = false;
  var winLineData = null;
  var tutorialMode = false;
  var tutorialHintTimer = null;

  // Web Worker
  var aiWorker = null;
  var workerTimeout = null;
  function initWorker() {
    if (aiWorker) return;
    try {
      aiWorker = new Worker('js/ai-worker.js');
      aiWorker.onmessage = function(e) {
        if (workerTimeout) { clearTimeout(workerTimeout); workerTimeout = null; }
        if (e.data.type === 'move' && aiThinking) {
          aiThinking = false;
          var move = e.data.move;
          if (move && !gameOver) {
            placeStone(move.x, move.y);
            if (tutorialMode && !gameOver) scheduleTutorialHint();
          } else if (!gameOver) {
            // Worker 回傳 null，用 fallback
            doAiMoveFallback();
          }
        }
      };
      aiWorker.onerror = function(err) {
        if (workerTimeout) { clearTimeout(workerTimeout); workerTimeout = null; }
        // Worker 失敗，永久切回主線程
        try { aiWorker.terminate(); } catch(e) {}
        aiWorker = null;
        if (aiThinking) {
          doAiMoveFallback();
        }
      };
    } catch(e) {
      aiWorker = null; // 不支援 Worker，用 fallback
    }
  }

  // Timer system
  var timerInterval = null;
  var blackTime = 0; // seconds
  var whiteTime = 0;
  var timerRunning = false;

  function startTimer() {
    stopTimer();
    timerRunning = true;
    timerInterval = setInterval(function() {
      if (gameOver || !timerRunning) { stopTimer(); return; }
      if (turn === 1) blackTime++;
      else whiteTime++;
      UI.updateTimer(blackTime, whiteTime, turn);
    }, 1000);
  }

  function stopTimer() {
    timerRunning = false;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function initBoard() {
    board = [];
    for (var y = 0; y < SIZE; y++) {
      board[y] = [];
      for (var x = 0; x < SIZE; x++) board[y][x] = 0;
    }
    moves = [];
    turn = 1;
    gameOver = false;
    aiThinking = false;
    winLineData = null;
    blackTime = 0;
    whiteTime = 0;
    stopTimer();
  }

  function startSingle(diff, color, tutorial) {
    mode = 'single';
    difficulty = diff;
    tutorialMode = !!tutorial;
    playerColor = color === 'black' ? 1 : 2;
    aiColor = playerColor === 1 ? 2 : 1;
    initBoard();
    initWorker();
    Board.setBoard(board, moves);
    Board.setLastMove(null);
    Board.setWinLine(null);
    Board.setHintPos(null);
    Board.draw();
    UI.updateTurn();
    if (tutorialMode) UI.hideHint();
    UI.updateTimer(0, 0, turn);
    startTimer();
    // 如果 AI 先手
    if (turn === aiColor) {
      aiThinking = true;
      setTimeout(doAiMove, 500);
    } else if (tutorialMode) {
      // 玩家先手，顯示建議
      scheduleTutorialHint();
    }
  }

  function handleClick(gx, gy) {
    if (gameOver || aiThinking) return;
    if (gx < 0 || gx >= SIZE || gy < 0 || gy >= SIZE) return;
    if (!board || !board[gy]) return;
    if (board[gy][gx] !== 0) return;
    if (mode === 'single' && turn !== playerColor) return;

    placeStone(gx, gy);

    if (!gameOver && mode === 'single' && turn === aiColor) {
      aiThinking = true;
      UI.updateTurn();
      setTimeout(doAiMove, 300);
    }
  }

  function placeStone(gx, gy) {
    // 教學模式：落子前先記錄棋盤快照
    var boardBefore = null;
    var isPlayerMove = (tutorialMode && mode === 'single' && turn === playerColor);
    if (isPlayerMove) {
      boardBefore = [];
      for (var r = 0; r < SIZE; r++) {
        boardBefore[r] = [];
        for (var c = 0; c < SIZE; c++) boardBefore[r][c] = board[r][c];
      }
    }

    // 清除教學提示（只在玩家落子時清除，AI 落子保留上一次的評語）
    if (tutorialMode && turn === playerColor) {
      clearTimeout(tutorialHintTimer);
      Board.setHintPos(null);
      UI.hideHint();
    }

    board[gy][gx] = turn;
    moves.push({ x: gx, y: gy, color: turn });

    Board.setBoard(board, moves);
    Board.setLastMove({ x: gx, y: gy });
    Board.draw();
    try { Sound.place(); } catch(e) {}

    // 粒子特效
    try {
      var cp = Board.toCanvas(gx, gy);
      VFX.placeEffect(cp.x, cp.y, turn === 1 ? 'black' : 'white');
    } catch(e) {}

    // 檢查勝負
    var winner = checkWin(gx, gy);
    if (winner) {
      gameOver = true;
      stopTimer();
      Board.setWinLine(winLineData);
      Board.draw();
      try { Sound.win(); } catch(e) {}
      setTimeout(function() { UI.showWin(winner); }, 600);
      return;
    }

    // 檢查平局
    if (moves.length >= SIZE * SIZE) {
      gameOver = true;
      stopTimer();
      setTimeout(function() { UI.showWin(0); }, 300);
      return;
    }

    turn = turn === 1 ? 2 : 1;
    UI.updateTurn();

    // 教學模式：評估玩家落子
    if (isPlayerMove && boardBefore && !gameOver) {
      evaluatePlayerMove(boardBefore, gx, gy);
    }
  }

  function doAiMove() {
    if (gameOver) { aiThinking = false; return; }
    // 嘗試用 Web Worker
    if (aiWorker) {
      // 深拷貝 board 給 Worker
      var boardCopy = [];
      for (var y = 0; y < SIZE; y++) {
        boardCopy[y] = [];
        for (var x = 0; x < SIZE; x++) boardCopy[y][x] = board[y][x];
      }
      var gameMoves = moves.map(function(m) { return { x: m.x, y: m.y }; });
      // 設定超時保護（15 秒）
      if (workerTimeout) clearTimeout(workerTimeout);
      workerTimeout = setTimeout(function() {
        workerTimeout = null;
        if (aiThinking) {
          // Worker 超時，終止並切回主線程
          try { aiWorker.terminate(); } catch(e) {}
          aiWorker = null;
          doAiMoveFallback();
        }
      }, 15000);
      aiWorker.postMessage({
        type: 'getMove',
        board: boardCopy,
        aiColor: aiColor,
        difficulty: difficulty,
        gameMoves: gameMoves
      });
      return; // Worker 的 onmessage 會處理結果
    }
    // Fallback: 主線程計算
    doAiMoveFallback();
  }

  function doAiMoveFallback() {
    if (gameOver) { aiThinking = false; return; }
    var move = AI.getMove(board, aiColor, difficulty);
    aiThinking = false;
    if (move) placeStone(move.x, move.y);
    if (tutorialMode && !gameOver) scheduleTutorialHint();
  }

  function evaluatePlayerMove(boardBefore, gx, gy) {
    try {
      var coord = function(x, y) { return String.fromCharCode(65 + x) + (15 - y); };
      var bestMove = AI.getMove(boardBefore, playerColor, '3d');
      if (!bestMove) return;

      var playerScore = Analysis.evalPosition(boardBefore, gx, gy, playerColor);
      var bestScore = Analysis.evalPosition(boardBefore, bestMove.x, bestMove.y, playerColor);

      // 如果就是最佳手
      if (bestMove.x === gx && bestMove.y === gy) {
        var myThreats = Analysis.describeMove(boardBefore, gx, gy, playerColor);
        if (myThreats.length > 0) {
          UI.showHint('👍 好棋！下在 ' + coord(gx, gy) + ' 形成' + myThreats.join('＋') + '，這是最佳選擇。', 'good');
        } else {
          UI.showHint('👍 好棋！' + coord(gx, gy) + ' 是目前最好的位置。', 'good');
        }
        return;
      }

      var diff = bestScore - playerScore;
      var oppThreats = Analysis.findOppThreats(boardBefore, aiColor);
      var actualThreats = Analysis.describeMove(boardBefore, gx, gy, playerColor);
      var bestThreats = Analysis.describeMove(boardBefore, bestMove.x, bestMove.y, playerColor);
      var bc = coord(bestMove.x, bestMove.y);

      // 檢查是否需要防守
      var defendTarget = null;
      for (var i = 0; i < oppThreats.length; i++) {
        if (bestMove.x === oppThreats[i].x && bestMove.y === oppThreats[i].y) {
          defendTarget = oppThreats[i]; break;
        }
      }

      if (diff < 50) {
        var msg = '👌 不錯，' + coord(gx, gy);
        if (actualThreats.length > 0) msg += ' 形成了' + actualThreats.join('＋');
        msg += '，和最佳手差距很小。';
        UI.showHint(msg, 'ok');
      } else if (diff < 300) {
        var msg = '🤔 有更好的選擇！建議下 ' + bc;
        if (bestThreats.length > 0) msg += '，可形成' + bestThreats.join('＋');
        if (defendTarget) msg += '。注意對手有' + defendTarget.threat + '威脅需要防守';
        msg += '。';
        UI.showHint(msg, 'warn');
        Board.setHintPos({ x: bestMove.x, y: bestMove.y });
        startHintAnimation();
      } else {
        var msg = '⚠️ ';
        if (defendTarget) {
          msg += '危險！對手有' + defendTarget.threat + '威脅，必須下 ' + bc + ' 防守！不防守的話對手將取得巨大優勢。';
        } else {
          msg += '這步棋效率太低。';
          if (actualThreats.length === 0) msg += coord(gx, gy) + ' 沒有形成有效棋型。';
          msg += '應下 ' + bc;
          if (bestThreats.length > 0) msg += '，可形成' + bestThreats.join('＋');
          msg += '。';
        }
        UI.showHint(msg, 'bad');
        Board.setHintPos({ x: bestMove.x, y: bestMove.y });
        startHintAnimation();
      }
    } catch(e) {}
  }

  function scheduleTutorialHint() {
    clearTimeout(tutorialHintTimer);
    tutorialHintTimer = setTimeout(function() {
      if (gameOver || aiThinking || turn !== playerColor) return;
      try {
        var bestMove = AI.getMove(board, playerColor, '3d');
        if (bestMove) {
          Board.setHintPos({ x: bestMove.x, y: bestMove.y });
          // 需要持續重繪來顯示脈動效果
          startHintAnimation();
        }
      } catch(e) {}
    }, 2000); // 2秒後顯示提示
  }

  var hintAnimFrame = null;
  function startHintAnimation() {
    if (hintAnimFrame) cancelAnimationFrame(hintAnimFrame);
    function animate() {
      if (gameOver || aiThinking || turn !== playerColor || !tutorialMode) {
        Board.setHintPos(null);
        Board.draw();
        return;
      }
      Board.draw();
      hintAnimFrame = requestAnimationFrame(animate);
    }
    hintAnimFrame = requestAnimationFrame(animate);
  }

  function checkWin(gx, gy) {
    var color = board[gy][gx];
    var dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (var d = 0; d < dirs.length; d++) {
      var dx = dirs[d][0], dy = dirs[d][1];
      var line = [{ x: gx, y: gy }];
      // 正方向
      for (var s = 1; s < 5; s++) {
        var nx = gx + dx * s, ny = gy + dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE || board[ny][nx] !== color) break;
        line.push({ x: nx, y: ny });
      }
      // 反方向
      for (var s = 1; s < 5; s++) {
        var nx = gx - dx * s, ny = gy - dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE || board[ny][nx] !== color) break;
        line.unshift({ x: nx, y: ny });
      }
      if (line.length >= 5) {
        winLineData = line;
        return color;
      }
    }
    return 0;
  }

  function undo() {
    if (gameOver || mode !== 'single' || aiThinking) return;
    if (moves.length < 2) return; // 至少要有 AI 和玩家各一手
    // 回退兩手（AI + 玩家）
    for (var i = 0; i < 2; i++) {
      var m = moves.pop();
      board[m.y][m.x] = 0;
    }
    turn = playerColor;
    var last = moves.length > 0 ? moves[moves.length - 1] : null;
    Board.setBoard(board, moves);
    Board.setLastMove(last);
    Board.setWinLine(null);
    Board.setHintPos(null);
    Board.draw();
    UI.updateTurn();
    if (tutorialMode) {
      UI.hideHint();
      scheduleTutorialHint();
    }
    Sound.click();
  }

  return {
    startSingle: startSingle,
    handleClick: handleClick,
    undo: undo,
    get board() { return board; },
    get moves() { return moves; },
    get turn() { return turn; },
    get gameOver() { return gameOver; },
    get currentColor() { return turn === 1 ? 'black' : 'white'; },
    get playerColor() { return playerColor; },
    get aiColor() { return aiColor; },
    get difficulty() { return difficulty; },
    get mode() { return mode; },
    get tutorialMode() { return tutorialMode; },
    get aiThinking() { return aiThinking; },
    get blackTime() { return blackTime; },
    get whiteTime() { return whiteTime; }
  };
})();
