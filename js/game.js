/**
 * game.js — 遊戲主控制器
 * Phase 1: 牌組、發牌、摸牌/打牌流程
 * Phase 2: 吃、碰、槓、胡判定
 */

class MahjongGame {
  constructor() {
    this.wall = [];
    this.wallIndex = 0;
    this.wallTailIndex = 0;
    this.deadWallCount = 16;

    // 牌牆視覺化：每邊18墩，記錄開門位置
    this.wallSegments = [{draw:18,dead:0},{draw:18,dead:0},{draw:18,dead:0},{draw:18,dead:0}]; // 東南西北 各邊剩餘墩數
    this.breakWall = 0;   // 開門的牆（0=東,1=南,2=西,3=北）
    this.breakStack = 0;  // 開門位置（從右邊數第幾墩）
    this.diceSum = 0;     // 骰子總和

    this.players = [
      { name: '你', seat: 0, hand: [], melds: [], flowers: [], discards: [], isHuman: true, isRemote: false },
      { name: '電腦A', seat: 1, hand: [], melds: [], flowers: [], discards: [], isHuman: false, isRemote: false },
      { name: '電腦B', seat: 2, hand: [], melds: [], flowers: [], discards: [], isHuman: false, isRemote: false },
      { name: '電腦C', seat: 3, hand: [], melds: [], flowers: [], discards: [], isHuman: false, isRemote: false },
    ];

    this.dealer = 0;
    this.currentTurn = 0;
    this.roundWind = 'east';
    this.roundNumber = 1;
    this.consecutiveWins = 0;
    this.lastDrawnTile = null;
    this.lastDiscardedTile = null;  // Phase 2: 最後被打出的牌
    this.lastDiscardSeat = -1;      // Phase 2: 誰打出的
    this.phase = 'idle'; // idle, dealing, playing, waiting_action, ended
    this.pendingActions = [];       // Phase 2: 等待的動作列表
    this.winnerSeat = -1;           // Phase 2: 贏家
    this.winType = '';              // Phase 2: 自摸/放槍

    this.basePoints = 300;   // 底注
    this.taiFee = 100;       // 每台
    this.scores = [0, 0, 0, 0]; // 四家累計分數
    this.onUpdate = null;

    // 牌局記錄（用於賽後分析）
    this.gameLog = [];

    // Multiplayer
    this._mySeat = 0;
    this._isMultiplayer = false;
    this._isHost = false;
    this._lastActionWasKong = false;
    this._robKongSeat = -1;
    this._robKongTile = null;
    this._robKongMeld = null;
  }

  /** 擲骰子（3顆，台灣麻將） */
  rollDice(thrower) {
    if (thrower === undefined) thrower = 0;
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const dice3 = Math.floor(Math.random() * 6) + 1;
    const sum = dice1 + dice2 + dice3;
    const offset = (sum - 1) % 4;
    const dealer = (thrower + offset) % 4;
    this.dealer = dealer;
    this.diceSum = sum;

    // 開門：從莊家逆時針數，骰子點數決定哪面牆
    // 座位順序（逆時針）：東(0)→南(1)→西(2)→北(3)
    // 莊家自己算1，逆時針數到骰子點數
    const breakWallSeat = (dealer + (sum - 1) % 4) % 4;
    this.breakWall = breakWallSeat;
    // 從該牆的右邊數 sum 墩，在那裡開門
    this.breakStack = sum;

    return { dice1, dice2, dice3, sum, dealer };
  }

  /** 開始新的一局 */
  startRound() {
    for (const p of this.players) {
      p.hand = []; p.melds = []; p.flowers = []; p.discards = [];
    }
    this.lastDrawnTile = null;
    this.lastDiscardedTile = null;
    this.lastDiscardSeat = -1;
    this.pendingActions = [];
    this.winnerSeat = -1;
    this.winType = '';
    this.gameLog = [];
    this.phase = 'dealing';

    const deck = createFullDeck();
    this.wall = shuffleDeck(deck);
    this.wallIndex = 0;
    this.wallTailIndex = this.wall.length - 1;

    // 初始化四邊牌牆（每邊18墩 = 36張）
    // 開門後：開門位置左邊是取牌區（順時針取），右邊是牌底（逆時針補花/槓）
    // wallIndex 從開門點左邊開始取，wallTailIndex 從開門點右邊開始補
    this.wallSegments = [{draw:18,dead:0},{draw:18,dead:0},{draw:18,dead:0},{draw:18,dead:0}];

    for (let round = 0; round < 4; round++) {
      for (let seat = 0; seat < 4; seat++) {
        const playerIdx = (this.dealer + seat) % 4;
        for (let i = 0; i < 4; i++) {
          this.players[playerIdx].hand.push(this._drawFromWall());
        }
      }
    }
    this.players[this.dealer].hand.push(this._drawFromWall());

    // 更新牌牆視覺（發完牌後計算各邊剩餘）
    this._updateWallSegments();

    for (let i = 0; i < 4; i++) {
      const seat = (this.dealer + i) % 4;
      this._replaceFlowers(seat);
    }
    for (const p of this.players) p.hand = sortHand(p.hand);

    this.currentTurn = this.dealer;
    this.phase = 'playing';
    this._update();

    // 莊家摸完牌後檢查暗槓和自摸
    if (this.players[this.currentTurn].isHuman && !this.players[this.currentTurn].isRemote) {
      this._checkSelfActions(this.currentTurn);
    } else if (this.players[this.currentTurn].isRemote) {
      // Remote human — they'll check on their end
      this._checkSelfActions(this.currentTurn);
    } else {
      setTimeout(() => this._aiTurnAfterDraw(), 800);
    }
  }

  /** 更新牌牆各邊剩餘墩數（根據已取牌數計算） */
  _updateWallSegments() {
      // 牌牆 = 72 墩（144張），每邊 18 墩
      // breakWall = 開門的那面牆（座位索引 0-3）
      // breakStack = 從右邊數幾墩開門（= 骰子點數）
      // 取牌方向：從開門點左邊開始，逆時針繞（seat-1方向）
      // 牌底方向：從開門點右邊開始，順時針繞（seat+1方向）

      var bs = Math.min(this.breakStack, 18);
      var totalDrawn = this.wallIndex;
      var totalDrawnTail = this.wall.length - 1 - this.wallTailIndex;

      // 開門牆分成兩部分
      var breakLeftOrig = 18 - bs;  // 開門牆左邊原始墩數（取牌區）
      var breakRightOrig = bs;       // 開門牆右邊原始墩數（牌底區）

      // 取牌順序（逆時針：開門牆左邊 → seat-1 → seat-2 → seat-3）
      var drawOrder = [
        { seat: this.breakWall, orig: breakLeftOrig },
        { seat: (this.breakWall + 3) % 4, orig: 18 },
        { seat: (this.breakWall + 2) % 4, orig: 18 },
        { seat: (this.breakWall + 1) % 4, orig: 18 }
      ];

      // 牌底順序（順時針：開門牆右邊 → seat+1 → seat+2 → seat+3）
      var deadOrder = [
        { seat: this.breakWall, orig: breakRightOrig },
        { seat: (this.breakWall + 1) % 4, orig: 18 },
        { seat: (this.breakWall + 2) % 4, orig: 18 },
        { seat: (this.breakWall + 3) % 4, orig: 18 }
      ];

      // 計算每面牆的取牌區剩餘和牌底區剩餘
      // drawRemain[seat] = 該牆取牌區剩餘墩數
      // deadRemain[seat] = 該牆牌底區剩餘墩數
      var drawRemain = [0, 0, 0, 0];
      var deadRemain = [0, 0, 0, 0];

      // 先設定每面牆的取牌區原始墩數
      for (var i = 0; i < drawOrder.length; i++) {
        drawRemain[drawOrder[i].seat] = drawOrder[i].orig;
      }
      // 先設定每面牆的牌底區原始墩數
      for (var i = 0; i < deadOrder.length; i++) {
        deadRemain[deadOrder[i].seat] = deadOrder[i].orig;
      }

      // 扣掉取牌方向已取走的墩數
      var stacksToRemove = Math.ceil(totalDrawn / 2);
      for (var i = 0; i < drawOrder.length && stacksToRemove > 0; i++) {
        var w = drawOrder[i];
        var remove = Math.min(stacksToRemove, w.orig);
        drawRemain[w.seat] -= remove;
        stacksToRemove -= remove;
      }

      // 扣掉牌底方向已取走的墩數
      var deadToRemove = Math.ceil(totalDrawnTail / 2);
      for (var i = 0; i < deadOrder.length && deadToRemove > 0; i++) {
        var w = deadOrder[i];
        var remove = Math.min(deadToRemove, w.orig);
        deadRemain[w.seat] -= remove;
        deadToRemove -= remove;
      }

      // 確保不為負
      for (var i = 0; i < 4; i++) {
        if (drawRemain[i] < 0) drawRemain[i] = 0;
        if (deadRemain[i] < 0) deadRemain[i] = 0;
      }

      // wallSegments[seat] = { draw: 取牌區剩餘墩數, dead: 牌底區剩餘墩數 }
      this.wallSegments = [];
      for (var i = 0; i < 4; i++) {
        this.wallSegments[i] = { draw: drawRemain[i], dead: deadRemain[i] };
      }
    }


  _drawFromWall() {
    if (this.wallIndex > this.wallTailIndex - this.deadWallCount) return null;
    return this.wall[this.wallIndex++];
  }

  _drawFromTail() {
    if (this.wallTailIndex < this.wallIndex + this.deadWallCount) return null;
    return this.wall[this.wallTailIndex--];
  }

  getRemainingTiles() {
    return this.wallTailIndex - this.wallIndex - this.deadWallCount + 1;
  }

  _replaceFlowers(seat) {
    const player = this.players[seat];
    let replaced = true;
    while (replaced) {
      replaced = false;
      for (let i = player.hand.length - 1; i >= 0; i--) {
        if (isFlower(player.hand[i])) {
          player.flowers.push(player.hand.splice(i, 1)[0]);
          const newTile = this._drawFromTail();
          if (newTile) {
            player.hand.push(newTile);
            replaced = true;
          }
        }
      }
    }
  }

  /** 摸牌 */
  drawTile(seat) {
    this._lastActionWasKong = false;
    const tile = this._drawFromWall();
    if (!tile) { this._handleDraw(); return null; }

    if (isFlower(tile)) {
      this.players[seat].flowers.push(tile);
      this._update();
      const replacement = this._drawFromTail();
      if (!replacement) { this._handleDraw(); return null; }
      if (isFlower(replacement)) {
        this.players[seat].flowers.push(replacement);
        return this.drawTile(seat);
      }
      this.players[seat].hand.push(replacement);
      this.lastDrawnTile = replacement;
      this._update();
      return replacement;
    }

    this.players[seat].hand.push(tile);
    this.lastDrawnTile = tile;
    this.gameLog.push({ action: 'draw', seat: seat, tile: tile, turn: this.gameLog.length });
    this._update();
    return tile;
  }

  // ===== Phase 2: 吃碰槓胡判定 =====

  /** 檢查某家能否碰（手上有兩張相同的牌） */
  canPong(seat, tile) {
    const hand = this.players[seat].hand;
    let count = 0;
    for (const t of hand) {
      if (isSameTile(t, tile)) count++;
    }
    return count >= 2;
  }

  /** 檢查某家能否明槓（手上有三張相同的牌） */
  canMingKong(seat, tile) {
    const hand = this.players[seat].hand;
    let count = 0;
    for (const t of hand) {
      if (isSameTile(t, tile)) count++;
    }
    return count >= 3;
  }

  /** 檢查某家能否吃（只有下家可以吃，組順子） */
  canChow(seat, tile) {
    if (tile.type !== 'suit') return []; // 只有數牌能吃
    const hand = this.players[seat].hand;
    const combos = [];
    const v = tile.value;
    const s = tile.suit;

    // 找手上同花色的牌
    const suitTiles = hand.filter(t => t.type === 'suit' && t.suit === s);
    const vals = suitTiles.map(t => t.value);

    // 三種吃法：tile 在左(v,v+1,v+2)、中(v-1,v,v+1)、右(v-2,v-1,v)
    if (vals.includes(v + 1) && vals.includes(v + 2)) {
      combos.push([v, v + 1, v + 2]);
    }
    if (v > 1 && vals.includes(v - 1) && vals.includes(v + 1)) {
      combos.push([v - 1, v, v + 1]);
    }
    if (v > 2 && vals.includes(v - 2) && vals.includes(v - 1)) {
      combos.push([v - 2, v - 1, v]);
    }
    return combos; // 回傳可能的組合 [[1,2,3], [2,3,4], ...]
  }

  /** 檢查暗槓（手上有四張相同的牌） */
  canAnKong(seat) {
    const hand = this.players[seat].hand;
    const counts = {};
    for (const t of hand) {
      const key = t.type + '_' + t.suit + '_' + (t.value || '');
      if (!counts[key]) counts[key] = [];
      counts[key].push(t);
    }
    const result = [];
    for (const key in counts) {
      if (counts[key].length === 4) result.push(counts[key]);
    }
    return result; // [[tile,tile,tile,tile], ...]
  }

  /** 檢查加槓（已碰的牌，手上又摸到第四張） */
  canAddKong(seat) {
    const player = this.players[seat];
    const result = [];
    for (const meld of player.melds) {
      if (meld.type === 'pong') {
        const matchTile = player.hand.find(t => isSameTile(t, meld.tiles[0]));
        if (matchTile) result.push({ meld: meld, tile: matchTile });
      }
    }
    return result;
  }

  /** 基本胡牌判定（標準型：N 組面子 + 1 對眼） */
  canWin(seat, extraTile) {
    const hand = this.players[seat].hand.slice();
    if (extraTile) hand.push(extraTile);

    // 台灣16張麻將：手牌 + 面子牌 = 17張（含眼）
    // 手牌數應為 3n+2（n組面子+1對眼）
    if (hand.length % 3 !== 2) return false;

    // 按 sortKey 排序方便判定
    hand.sort((a, b) => a.sortKey - b.sortKey);
    return this._checkWinHand(hand);
  }

  /** 遞迴檢查胡牌（選眼 → 拆面子） */
  _checkWinHand(tiles) {
    if (tiles.length === 0) return true;

    // 嘗試每種可能的眼（對子）
    if (tiles.length % 3 === 2) {
      for (let i = 0; i < tiles.length - 1; i++) {
        if (isSameTile(tiles[i], tiles[i + 1])) {
          const rest = tiles.slice(0, i).concat(tiles.slice(i + 2));
          if (this._checkMelds(rest)) return true;
        }
        // 跳過相同的牌避免重複嘗試
        while (i < tiles.length - 2 && isSameTile(tiles[i], tiles[i + 1])) i++;
      }
      return false;
    }
    return this._checkMelds(tiles);
  }

  /** 檢查剩餘牌能否全部拆成面子（刻子或順子） */
  _checkMelds(tiles) {
    if (tiles.length === 0) return true;
    if (tiles.length % 3 !== 0) return false;

    const first = tiles[0];

    // 嘗試刻子（三張相同）
    if (tiles.length >= 3 && isSameTile(tiles[0], tiles[1]) && isSameTile(tiles[1], tiles[2])) {
      if (this._checkMelds(tiles.slice(3))) return true;
    }

    // 嘗試順子（只有數牌）
    if (first.type === 'suit') {
      const v = first.value;
      const s = first.suit;
      const idx2 = tiles.findIndex((t, i) => i > 0 && t.type === 'suit' && t.suit === s && t.value === v + 1);
      if (idx2 > 0) {
        const idx3 = tiles.findIndex((t, i) => i > idx2 && t.type === 'suit' && t.suit === s && t.value === v + 2);
        if (idx3 > 0) {
          const rest = tiles.slice();
          rest.splice(idx3, 1);
          rest.splice(idx2, 1);
          rest.splice(0, 1);
          if (this._checkMelds(rest)) return true;
        }
      }
    }

    return false;
  }

  // ===== Phase 2: 動作執行 =====

  /** 執行碰 */
  doPong(seat) {
    const tile = this.lastDiscardedTile;
    const player = this.players[seat];
    const removed = [];
    for (let i = player.hand.length - 1; i >= 0 && removed.length < 2; i--) {
      if (isSameTile(player.hand[i], tile)) {
        removed.push(player.hand.splice(i, 1)[0]);
      }
    }
    // 從打出者的牌河移除
    const discardPlayer = this.players[this.lastDiscardSeat];
    discardPlayer.discards.pop();

    player.melds.push({ type: 'pong', tiles: [tile, removed[0], removed[1]], from: this.lastDiscardSeat });
    player.hand = sortHand(player.hand);
    this.gameLog.push({ action: 'pong', seat: seat, tile: tile, from: this.lastDiscardSeat, turn: this.gameLog.length });
    this.currentTurn = seat;
    this.lastDiscardedTile = null;
    this.lastDrawnTile = null;
    this.phase = 'playing';
    this.pendingActions = [];
    this._update();

    // 碰完要打一張牌
    if (!player.isHuman && !player.isRemote) {
      setTimeout(() => this._aiDiscard(seat), 600);
    }
  }

  /** 執行吃 */
  doChow(seat, combo) {
    // combo = [v1, v2, v3] 順子的三個值
    const tile = this.lastDiscardedTile;
    const player = this.players[seat];
    const removed = [];

    // 從手牌中移除 combo 中不是 tile 的兩張
    for (const v of combo) {
      if (v === tile.value) continue; // 吃的那張牌不從手牌移除
      for (let i = player.hand.length - 1; i >= 0; i--) {
        if (player.hand[i].type === 'suit' && player.hand[i].suit === tile.suit && player.hand[i].value === v) {
          removed.push(player.hand.splice(i, 1)[0]);
          break;
        }
      }
    }

    const discardPlayer = this.players[this.lastDiscardSeat];
    discardPlayer.discards.pop();

    // 組成面子（按順序排列）
    const meldTiles = [tile, ...removed].sort((a, b) => a.value - b.value);
    player.melds.push({ type: 'chow', tiles: meldTiles, from: this.lastDiscardSeat });
    player.hand = sortHand(player.hand);
    this.gameLog.push({ action: 'chow', seat: seat, tile: tile, combo: combo, from: this.lastDiscardSeat, turn: this.gameLog.length });
    this.currentTurn = seat;
    this.lastDiscardedTile = null;
    this.lastDrawnTile = null;
    this.phase = 'playing';
    this.pendingActions = [];
    this._update();

    if (!player.isHuman && !player.isRemote) {
      setTimeout(() => this._aiDiscard(seat), 600);
    }
  }

  /** 執行明槓 */
  doMingKong(seat) {
    const tile = this.lastDiscardedTile;
    const player = this.players[seat];
    const removed = [];
    for (let i = player.hand.length - 1; i >= 0 && removed.length < 3; i--) {
      if (isSameTile(player.hand[i], tile)) {
        removed.push(player.hand.splice(i, 1)[0]);
      }
    }
    const discardPlayer = this.players[this.lastDiscardSeat];
    discardPlayer.discards.pop();

    player.melds.push({ type: 'kong', tiles: [tile, ...removed], from: this.lastDiscardSeat, kongType: 'ming' });
    player.hand = sortHand(player.hand);
    this.currentTurn = seat;
    this.lastDiscardedTile = null;
    this.lastDrawnTile = null;
    this.pendingActions = [];
    this._update();

    // 槓完從牌尾補一張
    this._lastActionWasKong = true;
    const newTile = this._drawFromTail();
    if (!newTile) { this._handleDraw(); return; }
    if (isFlower(newTile)) {
      player.flowers.push(newTile);
      this._update();
      const rep = this._drawFromTail();
      if (!rep) { this._handleDraw(); return; }
      player.hand.push(rep);
      this.lastDrawnTile = rep;
    } else {
      player.hand.push(newTile);
      this.lastDrawnTile = newTile;
    }
    player.hand = sortHand(player.hand);
    this.phase = 'playing';
    this._update();

    if (player.isHuman && !player.isRemote) {
      this._checkSelfActions(seat);
    } else if (!player.isHuman && !player.isRemote) {
      setTimeout(() => this._aiTurnAfterDraw(), 600);
    }
  }

  /** 執行暗槓 */
  doAnKong(seat, tiles) {
    const player = this.players[seat];
    for (const t of tiles) {
      const idx = player.hand.findIndex(h => h.id === t.id);
      if (idx >= 0) player.hand.splice(idx, 1);
    }
    player.melds.push({ type: 'kong', tiles: tiles, from: seat, kongType: 'an' });
    player.hand = sortHand(player.hand);
    this.pendingActions = [];
    this._update();

    this._lastActionWasKong = true;
    const newTile = this._drawFromTail();
    if (!newTile) { this._handleDraw(); return; }
    if (isFlower(newTile)) {
      player.flowers.push(newTile);
      this._update();
      const rep = this._drawFromTail();
      if (!rep) { this._handleDraw(); return; }
      player.hand.push(rep);
      this.lastDrawnTile = rep;
    } else {
      player.hand.push(newTile);
      this.lastDrawnTile = newTile;
    }
    player.hand = sortHand(player.hand);
    this.phase = 'playing';
    this._update();

    if (player.isHuman && !player.isRemote) {
      this._checkSelfActions(seat);
    } else if (!player.isHuman && !player.isRemote) {
      setTimeout(() => this._aiTurnAfterDraw(), 600);
    }
  }

  /** 執行加槓 */
  doAddKong(seat, meld, tile) {
    const player = this.players[seat];
    const idx = player.hand.findIndex(h => h.id === tile.id);
    if (idx >= 0) player.hand.splice(idx, 1);
    meld.tiles.push(tile);
    meld.type = 'kong';
    meld.kongType = 'add';
    player.hand = sortHand(player.hand);
    this.pendingActions = [];
    this._update();

    // 搶槓胡判定：其他玩家可以胡這張加槓的牌
    var robActions = [];
    for (var i = 1; i <= 3; i++) {
      var checkSeat = (seat + i) % 4;
      if (this.canWin(checkSeat, tile)) {
        robActions.push({ type: 'robkong', seat: checkSeat, priority: 3 });
      }
    }
    if (robActions.length > 0) {
      this._robKongSeat = seat;
      this._robKongTile = tile;
      this._robKongMeld = meld;
      this.pendingActions = robActions;
      var self = this;
      var humanRob = robActions.filter(function(a) { return self.players[a.seat].isHuman && !self.players[a.seat].isRemote; });
      if (humanRob.length > 0) {
        this.phase = 'waiting_action';
        this._update();
        return;
      }
      if (this._isMultiplayer) {
        var remoteRob = robActions.filter(function(a) { return self.players[a.seat].isHuman && self.players[a.seat].isRemote; });
        if (remoteRob.length > 0) {
          this.phase = 'waiting_action';
          this._update();
          return;
        }
      }
      // AI 一定搶槓胡
      var aiWin = robActions.find(function(a) { return !self.players[a.seat].isHuman; });
      if (aiWin) { this.doRobKong(aiWin.seat); return; }
    }

    this._continueAfterAddKong(seat);
  }

  /** 搶槓胡：執行搶槓 */
  doRobKong(seat) {
    var meld = this._robKongMeld;
    var tile = this._robKongTile;
    // 還原加槓 → 碰
    if (meld && meld.tiles.length === 4) {
      meld.tiles.pop();
      meld.type = 'pong';
      delete meld.kongType;
    }
    this.lastDiscardedTile = tile;
    this.lastDiscardSeat = this._robKongSeat;
    this._robKongSeat = -1;
    this._robKongTile = null;
    this._robKongMeld = null;
    this.doWin(seat, 'fangpao');
  }

  /** 加槓後繼續（沒人搶槓） */
  _continueAfterAddKong(seat) {
    var player = this.players[seat];
    this._lastActionWasKong = true;
    var newTile = this._drawFromTail();
    if (!newTile) { this._handleDraw(); return; }
    if (isFlower(newTile)) {
      player.flowers.push(newTile);
      this._update();
      var rep = this._drawFromTail();
      if (!rep) { this._handleDraw(); return; }
      player.hand.push(rep);
      this.lastDrawnTile = rep;
    } else {
      player.hand.push(newTile);
      this.lastDrawnTile = newTile;
    }
    player.hand = sortHand(player.hand);
    this.phase = 'playing';
    this._update();

    if (player.isHuman && !player.isRemote) {
      this._checkSelfActions(seat);
    } else if (!player.isHuman && !player.isRemote) {
      setTimeout(() => this._aiTurnAfterDraw(), 600);
    }
  }

  /** 宣告胡牌 */
  doWin(seat, type) {
    this.winnerSeat = seat;
    this.winType = type; // 'zimo' or 'fangpao'
    this.phase = 'ended';
    this.gameLog.push({ action: 'win', seat: seat, winType: type, turn: this.gameLog.length,
      hand: this.players[seat].hand.map(function(t) { return { type: t.type, suit: t.suit, value: t.value, name: t.name }; }),
      melds: this.players[seat].melds.map(function(m) { return { type: m.type, tiles: m.tiles.map(function(t) { return t.name; }) }; })
    });
    if (type === 'fangpao' && this.lastDiscardedTile) {
      // 把放槍的牌從牌河移除（視覺上）
      const discardPlayer = this.players[this.lastDiscardSeat];
      discardPlayer.discards.pop();
      // 加到贏家手牌顯示
      this.players[seat].hand.push(this.lastDiscardedTile);
      this.players[seat].hand = sortHand(this.players[seat].hand);
    }
    this.pendingActions = [];
    this._update();
  }

  /** 過（不吃碰槓胡） */
  doPass(seat) {
    if ((this.players[seat].isHuman || this.players[seat].isRemote) && this.lastDiscardedTile) {
      // 記錄 pass 時有哪些可用動作
      var availableActions = this.pendingActions.filter(function(a) { return a.seat === seat; }).map(function(a) { return a.type; });
      this.gameLog.push({ action: 'pass', seat: seat, tile: this.lastDiscardedTile, turn: this.gameLog.length, availableActions: availableActions });
    }
    this.pendingActions = this.pendingActions.filter(a => a.seat !== seat);

    if (this.pendingActions.length > 0) {
      // 還有動作在等待 — 檢查是否有人類（含遠端）需要決定
      const hasHumanOrRemote = this.pendingActions.some(a => this.players[a.seat].isHuman || this.players[a.seat].isRemote);
      if (!hasHumanOrRemote) {
        // 剩下全是 AI，讓 AI 決定
        this._aiDecideActions(this.pendingActions);
      }
      return;
    }

    // 所有人都 pass 了
    // 如果是搶槓胡的 pass，繼續加槓流程
    if (this._robKongSeat !== undefined && this._robKongSeat >= 0) {
      var robSeat = this._robKongSeat;
      this._robKongSeat = -1;
      this._robKongTile = null;
      this._robKongMeld = null;
      this._continueAfterAddKong(robSeat);
      return;
    }
    this.phase = 'playing';
    this._continueAfterDiscard();
  }

  // ===== Phase 2: 打牌後的動作檢查 =====

  /** 打出一張牌（改寫：加入吃碰槓胡檢查） */
  discardTile(seat, tileId) {
    this._lastActionWasKong = false;
    const player = this.players[seat];
    const idx = player.hand.findIndex(t => t.id === tileId);
    if (idx === -1) return false;

    const tile = player.hand.splice(idx, 1)[0];
    player.discards.push(tile);
    player.hand = sortHand(player.hand);

    // 記錄打牌動作（含完整快照供分析用）
    this.gameLog.push({
      action: 'discard', seat: seat, tile: tile,
      turn: this.gameLog.length,
      // 快照：打牌前的手牌（tile 已被移除，所以要加回去）
      handSnapshot: [tile].concat(player.hand.map(function(t) { return { type: t.type, suit: t.suit, value: t.value, name: t.name, sortKey: t.sortKey }; })),
      melds: player.melds.map(function(m) { return { type: m.type, kongType: m.kongType, tiles: m.tiles.map(function(t) { return { type: t.type, suit: t.suit, value: t.value, name: t.name }; }) }; }),
      // 所有可見牌（四家牌河 + 四家面子）
      visibleTiles: this._getVisibleTiles(),
      remainingCount: this.getRemainingTiles()
    });

    this.lastDrawnTile = null;
    this.lastDiscardedTile = tile;
    this.lastDiscardSeat = seat;

    this._update();

    // 檢查其他三家是否能吃碰槓胡
    this._checkOtherActions(seat, tile);
    return true;
  }

  /** 檢查其他三家對打出的牌的反應 */
  _checkOtherActions(discardSeat, tile) {
    const actions = [];
    const nextSeat = (discardSeat + 1) % 4;

    for (let i = 1; i <= 3; i++) {
      const seat = (discardSeat + i) % 4;
      const playerActions = [];

      // 胡（任何人都可以）
      if (this.canWin(seat, tile)) {
        playerActions.push({ type: 'win', seat: seat, priority: 3 });
      }
      // 槓（任何人都可以）
      if (this.canMingKong(seat, tile)) {
        playerActions.push({ type: 'mingkong', seat: seat, priority: 2 });
      }
      // 碰（任何人都可以）
      if (this.canPong(seat, tile)) {
        playerActions.push({ type: 'pong', seat: seat, priority: 2 });
      }
      // 吃（只有下家可以）
      if (seat === nextSeat) {
        const combos = this.canChow(seat, tile);
        if (combos.length > 0) {
          playerActions.push({ type: 'chow', seat: seat, combos: combos, priority: 1 });
        }
      }

      if (playerActions.length > 0) {
        actions.push(...playerActions);
      }
    }

    if (actions.length === 0) {
      // 沒人能動作，直接下一家
      this._continueAfterDiscard();
      return;
    }

    // 按優先級排序：胡 > 碰/槓 > 吃
    actions.sort((a, b) => b.priority - a.priority);
    this.pendingActions = actions;

    // 檢查是否有人類玩家需要選擇（排除遠端玩家）
    const humanActions = actions.filter(a => {
      var p = this.players[a.seat];
      return p.isHuman && !p.isRemote;
    });
    if (humanActions.length > 0) {
      this.phase = 'waiting_action';
      this._update();
      return;
    }

    // 多人模式：遠端人類玩家也需要等待
    if (this._isMultiplayer) {
      var remoteActions = actions.filter(a => {
        var p = this.players[a.seat];
        return p.isHuman && p.isRemote;
      });
      if (remoteActions.length > 0) {
        this.phase = 'waiting_action';
        this._update();
        return;
      }
    }

    // 全是 AI，自動決定
    this._aiDecideActions(actions);
  }

  /** 摸牌後檢查自己的動作（暗槓、加槓、自摸） */
  _checkSelfActions(seat) {
    const actions = [];

    // 自摸
    if (this.canWin(seat, null)) {
      actions.push({ type: 'zimo', seat: seat });
    }
    // 暗槓
    const anKongs = this.canAnKong(seat);
    for (const tiles of anKongs) {
      actions.push({ type: 'ankong', seat: seat, tiles: tiles });
    }
    // 加槓
    const addKongs = this.canAddKong(seat);
    for (const ak of addKongs) {
      actions.push({ type: 'addkong', seat: seat, meld: ak.meld, tile: ak.tile });
    }

    if (actions.length > 0 && this.players[seat].isHuman && !this.players[seat].isRemote) {
      this.pendingActions = actions;
      this.phase = 'waiting_action';
      this._update();
    }
    // AI 的自身動作在 _aiTurnAfterDraw 處理
  }

  /** 打牌後繼續（沒人吃碰槓胡時） */
  _continueAfterDiscard() {
    this.lastDiscardedTile = null;
    const nextSeat = (this.lastDiscardSeat + 1) % 4;
    this.currentTurn = nextSeat;

    if (this.getRemainingTiles() <= 0) {
      this._handleDraw();
      return;
    }

    const tile = this.drawTile(nextSeat);
    if (!tile) return;

    if (this.players[nextSeat].isHuman && !this.players[nextSeat].isRemote) {
      this._checkSelfActions(nextSeat);
    } else if (this.players[nextSeat].isRemote) {
      // Remote human — wait for their action via WebSocket
      this._checkSelfActions(nextSeat);
    } else {
      setTimeout(() => this._aiTurnAfterDraw(), 600);
    }
  }

  // ===== AI 邏輯 =====

  /** AI 摸牌後的決策（暗槓/加槓/自摸/打牌） */
  _aiTurnAfterDraw() {
    if (this.phase !== 'playing') return;
    const seat = this.currentTurn;
    const player = this.players[seat];
    if (player.isHuman || player.isRemote) return;

    // 自摸？
    if (this.canWin(seat, null)) {
      this.doWin(seat, 'zimo');
      return;
    }

    // 暗槓？
    const anKongs = this.canAnKong(seat);
    if (anKongs.length > 0) {
      this.doAnKong(seat, anKongs[0]);
      return;
    }

    // 加槓？
    const addKongs = this.canAddKong(seat);
    if (addKongs.length > 0) {
      this.doAddKong(seat, addKongs[0].meld, addKongs[0].tile);
      return;
    }

    // 打牌
    this._aiDiscard(seat);
  }

  /** AI 決定對別人打出的牌的反應（向聽數分析） */
  _aiDecideActions(actions) {
    // 優先級：胡 > 槓 > 碰 > 吃（用向聽數判斷是否值得碰/吃）

    const winAction = actions.find(a => a.type === 'win' && !this.players[a.seat].isHuman && !this.players[a.seat].isRemote);
    if (winAction) {
      this.doWin(winAction.seat, 'fangpao');
      return;
    }

    const kongAction = actions.find(a => a.type === 'mingkong' && !this.players[a.seat].isHuman && !this.players[a.seat].isRemote);
    if (kongAction) {
      this.doMingKong(kongAction.seat);
      return;
    }

    const pongAction = actions.find(a => a.type === 'pong' && !this.players[a.seat].isHuman && !this.players[a.seat].isRemote);
    if (pongAction && typeof MahjongAnalysis !== 'undefined') {
      const p = this.players[pongAction.seat];
      const handArr = MahjongAnalysis._handToArray(p.hand);
      const curShanten = MahjongAnalysis._calcShanten(handArr, p.hand.length);
      const tile = this.lastDiscardedTile;
      const tIdx = MahjongAnalysis._tileToIndex(tile);
      if (tIdx >= 0) {
        handArr[tIdx] -= 2;
        const afterShanten = MahjongAnalysis._calcShanten(handArr, p.hand.length - 2);
        handArr[tIdx] += 2;
        if (afterShanten <= curShanten) {
          this.doPong(pongAction.seat);
          return;
        }
      }
    } else if (pongAction) {
      if (Math.random() < 0.7) { this.doPong(pongAction.seat); return; }
    }

    const chowAction = actions.find(a => a.type === 'chow' && !this.players[a.seat].isHuman && !this.players[a.seat].isRemote);
    if (chowAction && typeof MahjongAnalysis !== 'undefined') {
      const p = this.players[chowAction.seat];
      const handArr = MahjongAnalysis._handToArray(p.hand);
      const curShanten = MahjongAnalysis._calcShanten(handArr, p.hand.length);
      const tile = this.lastDiscardedTile;
      let bestCombo = null;
      let bestSh = curShanten;
      for (let ci = 0; ci < chowAction.combos.length; ci++) {
        const combo = chowAction.combos[ci];
        const testArr = handArr.slice();
        const suit = tile.suit;
        const base = suit === 'wan' ? 0 : suit === 'tong' ? 9 : 18;
        for (let cv = 0; cv < combo.length; cv++) {
          if (combo[cv] !== tile.value) testArr[base + combo[cv] - 1]--;
        }
        const sh = MahjongAnalysis._calcShanten(testArr, p.hand.length - 2);
        if (sh < bestSh) { bestSh = sh; bestCombo = combo; }
      }
      if (bestCombo) {
        this.doChow(chowAction.seat, bestCombo);
        return;
      }
    } else if (chowAction) {
      if (Math.random() < 0.4) { this.doChow(chowAction.seat, chowAction.combos[0]); return; }
    }

    // 全部 pass
    this.pendingActions = [];
    this.phase = 'playing';
    this._continueAfterDiscard();
  }

  /** AI 打牌（向聽數 + 進張數分析） */
  _aiDiscard(seat) {
    if (this.phase !== 'playing') return;
    const player = this.players[seat];
    if (player.isHuman || player.isRemote || player.hand.length === 0) return;

    // Use analysis engine if available
    if (typeof MahjongAnalysis !== 'undefined' && MahjongAnalysis._calcShanten) {
      const handArr = MahjongAnalysis._handToArray(player.hand);
      const visibleArr = new Array(34);
      for (let v = 0; v < 34; v++) visibleArr[v] = 0;
      const visible = this._getVisibleTiles();
      for (let vi = 0; vi < visible.length; vi++) {
        const idx = MahjongAnalysis._tileToIndex(visible[vi]);
        if (idx >= 0) visibleArr[idx]++;
      }

      let bestTileId = null;
      let bestShanten = 999;
      let bestAcceptance = -1;
      const checked = {};

      for (let i = 0; i < player.hand.length; i++) {
        const t = player.hand[i];
        const tIdx = MahjongAnalysis._tileToIndex(t);
        if (tIdx < 0 || checked[tIdx]) continue;
        checked[tIdx] = true;

        handArr[tIdx]--;
        const sh = MahjongAnalysis._calcShanten(handArr, player.hand.length - 1);
        const acc = MahjongAnalysis._countAcceptance(handArr, visibleArr, sh, player.hand.length - 1);
        handArr[tIdx]++;

        if (sh < bestShanten || (sh === bestShanten && acc.count > bestAcceptance)) {
          bestShanten = sh;
          bestAcceptance = acc.count;
          bestTileId = t.id;
        }
      }

      if (bestTileId) {
        this.discardTile(seat, bestTileId);
        return;
      }
    }

    // Fallback: simple heuristic
    let bestIdx = 0;
    let bestScore = -999;
    for (let i = 0; i < player.hand.length; i++) {
      const t = player.hand[i];
      let score = 0;
      if (t.type === 'wind' || t.type === 'dragon') {
        const count = player.hand.filter(h => isSameTile(h, t)).length;
        score = count === 1 ? -10 : count === 2 ? 60 : 80;
      } else {
        const count = player.hand.filter(h => isSameTile(h, t)).length;
        const hasAdj = player.hand.some(h => h.type === 'suit' && h.suit === t.suit && Math.abs(h.value - t.value) === 1);
        score = count * 20 + (hasAdj ? 15 : 0) + ((t.value >= 3 && t.value <= 7) ? 5 : 0);
      }
      if (score < bestScore || bestScore === -999) { bestScore = score; bestIdx = i; }
    }
    this.discardTile(seat, player.hand[bestIdx].id);
  }

  /** 流局 */

  // === 連莊/過莊/圈風邏輯 ===

  /** 結算本局分數 */
  settleRound() {
    if (this.phase !== 'ended') return null;
    var result = null;
    var base = this.basePoints;
    var taiFee = this.taiFee;
    var lianZhuang = this.consecutiveWins; // 連莊加台

    if (this.winnerSeat >= 0 && typeof MahjongScoring !== 'undefined') {
      var winner = this.players[this.winnerSeat];
      result = MahjongScoring.calculate(winner, this, this.winType);
      var totalTai = result.totalFan + lianZhuang;
      var winAmount = base + totalTai * taiFee;

      if (this.winType === 'zimo') {
        // 自摸：三家各付
        for (var i = 0; i < 4; i++) {
          if (i === this.winnerSeat) {
            this.scores[i] += winAmount * 3;
          } else {
            this.scores[i] -= winAmount;
          }
        }
      } else {
        // 放槍：放槍者付全部
        var loser = this.lastDiscardSeat;
        this.scores[this.winnerSeat] += winAmount * 3;
        this.scores[loser] -= winAmount * 3;
      }

      result.winAmount = winAmount;
      result.lianZhuangTai = lianZhuang;
      result.totalTaiWithBonus = totalTai;
    }
    // 流局不算分
    this._lastSettlement = result;
    return result;
  }

  nextRound() {
    if (this.phase !== 'ended') return;

    if (this.winnerSeat === this.dealer) {
      // 莊家胡牌 → 連莊
      this.consecutiveWins++;
    } else if (this.winnerSeat === -1) {
      // 流局 → 連莊（莊家不變）
      this.consecutiveWins++;
    } else {
      // 非莊家胡牌 → 過莊
      this.consecutiveWins = 0;
      this.dealer = (this.dealer + 1) % 4;

      // 如果新莊家回到起始位(0)，代表一圈結束
      if (this.dealer === 0) {
        var winds = ['east', 'south', 'west', 'north'];
        var windIdx = winds.indexOf(this.roundWind);
        if (windIdx < 3) {
          this.roundWind = winds[windIdx + 1];
          this.roundNumber = 1;
        } else {
          // 四圈結束
          this.phase = 'game_over';
          this._update();
          return;
        }
      } else {
        this.roundNumber = (this.dealer % 4) + 1;
      }
    }

    this.startRound();
  }


  /** 退出遊戲（回到開始畫面） */
  quitGame() {
    this.phase = 'game_over';
    this._update();
  }

  _handleDraw() {
    this.phase = 'ended';
    this.winnerSeat = -1;
    this.winType = 'draw';
    this.pendingActions = [];
    this._update();
  }

  /** 取得所有可見牌（四家牌河 + 四家面子 + 四家花牌）供分析用 */
  _getVisibleTiles() {
    var visible = [];
    for (var i = 0; i < 4; i++) {
      var p = this.players[i];
      for (var j = 0; j < p.discards.length; j++) {
        var t = p.discards[j];
        visible.push({ type: t.type, suit: t.suit, value: t.value, name: t.name, from: 'discard', seat: i });
      }
      for (var k = 0; k < p.melds.length; k++) {
        var m = p.melds[k];
        for (var l = 0; l < m.tiles.length; l++) {
          var mt = m.tiles[l];
          visible.push({ type: mt.type, suit: mt.suit, value: mt.value, name: mt.name, from: 'meld', seat: i });
        }
      }
      for (var f = 0; f < p.flowers.length; f++) {
        var fl = p.flowers[f];
        visible.push({ type: fl.type, suit: fl.suit, value: fl.value, name: fl.name, from: 'flower', seat: i });
      }
    }
    return visible;
  }

  _update() {
    this._updateWallSegments();
    if (this.onUpdate) this.onUpdate(this);
  }
}
