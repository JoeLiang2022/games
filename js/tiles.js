/**
 * tiles.js — 麻將牌組定義與操作
 * 144 張牌：萬筒條(各36) + 風牌(16) + 三元(12) + 花牌(8)
 * 使用中文字渲染（不依賴 Unicode Mahjong 符號，手機相容）
 */

const SUIT = { WAN: 'wan', TONG: 'tong', TIAO: 'tiao' };
const WIND = { EAST: 'east', SOUTH: 'south', WEST: 'west', NORTH: 'north' };
const DRAGON = { ZHONG: 'zhong', FA: 'fa', BAI: 'bai' };

const FLOWERS = [
  { id: 'spring', name: '春', group: 'season', seat: 0 },
  { id: 'summer', name: '夏', group: 'season', seat: 1 },
  { id: 'autumn', name: '秋', group: 'season', seat: 2 },
  { id: 'winter', name: '冬', group: 'season', seat: 3 },
  { id: 'plum',   name: '梅', group: 'plant',  seat: 0 },
  { id: 'orchid', name: '蘭', group: 'plant',  seat: 1 },
  { id: 'bamboo', name: '竹', group: 'plant',  seat: 2 },
  { id: 'chrys',  name: '菊', group: 'plant',  seat: 3 },
];

// 數字中文
const NUM_CHARS = ['一','二','三','四','五','六','七','八','九'];
const SUIT_CHARS = { wan: '萬', tong: '筒', tiao: '條' };

// 牌面顯示：上方數字/字，下方花色
const TILE_DISPLAY = {
  wan:  NUM_CHARS.map((n, i) => ({ top: n, bottom: '萬', color: 'black' })),
  tong: NUM_CHARS.map((n, i) => ({ top: n, bottom: '筒', color: 'blue' })),
  tiao: NUM_CHARS.map((n, i) => ({ top: n, bottom: '條', color: 'green' })),
  east:  { top: '東', bottom: '', color: 'black' },
  south: { top: '南', bottom: '', color: 'black' },
  west:  { top: '西', bottom: '', color: 'black' },
  north: { top: '北', bottom: '', color: 'black' },
  zhong: { top: '中', bottom: '', color: 'red' },
  fa:    { top: '發', bottom: '', color: 'green' },
  bai:   { top: '白', bottom: '', color: 'gray' },
  spring:{ top: '春', bottom: '', color: 'flower-season' },
  summer:{ top: '夏', bottom: '', color: 'flower-season' },
  autumn:{ top: '秋', bottom: '', color: 'flower-season' },
  winter:{ top: '冬', bottom: '', color: 'flower-season' },
  plum:  { top: '梅', bottom: '', color: 'flower-plant' },
  orchid:{ top: '蘭', bottom: '', color: 'flower-plant' },
  bamboo:{ top: '竹', bottom: '', color: 'flower-plant' },
  chrys: { top: '菊', bottom: '', color: 'flower-plant' },
};

// 中文名稱
const TILE_NAMES = {
  wan:  ['一萬','二萬','三萬','四萬','五萬','六萬','七萬','八萬','九萬'],
  tong: ['一筒','二筒','三筒','四筒','五筒','六筒','七筒','八筒','九筒'],
  tiao: ['一條','二條','三條','四條','五條','六條','七條','八條','九條'],
  east: '東', south: '南', west: '西', north: '北',
  zhong: '中', fa: '發', bai: '白',
};

const WIND_ORDER = ['east', 'south', 'west', 'north'];
const DRAGON_ORDER = ['zhong', 'fa', 'bai'];

/**
 * 建立一張牌物件
 */
function createTile(type, suit, value, copyIndex) {
  const id = suit ? `${suit}_${value}_${copyIndex}` : `${type}_${copyIndex}`;
  let displayInfo, name, sortKey;

  if (type === 'suit') {
    displayInfo = TILE_DISPLAY[suit][value - 1];
    name = TILE_NAMES[suit][value - 1];
    const suitOrder = { wan: 0, tong: 1, tiao: 2 };
    sortKey = suitOrder[suit] * 10 + value;
  } else if (type === 'wind') {
    displayInfo = TILE_DISPLAY[suit];
    name = TILE_NAMES[suit];
    sortKey = 30 + WIND_ORDER.indexOf(suit);
  } else if (type === 'dragon') {
    displayInfo = TILE_DISPLAY[suit];
    name = TILE_NAMES[suit];
    sortKey = 40 + DRAGON_ORDER.indexOf(suit);
  } else if (type === 'flower') {
    displayInfo = TILE_DISPLAY[suit];
    const f = FLOWERS.find(fl => fl.id === suit);
    name = f.name;
    sortKey = 50 + FLOWERS.indexOf(f);
  }

  return { id, type, suit, value, copyIndex, displayInfo, name, sortKey };
}

/**
 * 建立完整 144 張牌組
 */
function createFullDeck() {
  const deck = [];
  for (const suit of [SUIT.WAN, SUIT.TONG, SUIT.TIAO]) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) {
        deck.push(createTile('suit', suit, v, c));
      }
    }
  }
  for (const wind of WIND_ORDER) {
    for (let c = 0; c < 4; c++) {
      deck.push(createTile('wind', wind, null, c));
    }
  }
  for (const dragon of DRAGON_ORDER) {
    for (let c = 0; c < 4; c++) {
      deck.push(createTile('dragon', dragon, null, c));
    }
  }
  for (const flower of FLOWERS) {
    deck.push(createTile('flower', flower.id, null, 0));
  }
  return deck; // 144 張
}

function shuffleDeck(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sortHand(hand) {
  return [...hand].sort((a, b) => a.sortKey - b.sortKey);
}

function isFlower(tile) {
  return tile.type === 'flower';
}

function isSameTile(a, b) {
  return a.type === b.type && a.suit === b.suit && a.value === b.value;
}

/**
 * 建立牌面 HTML（中文字渲染）
 */
function createTileHTML(tile) {
  const d = tile.displayInfo;
  if (d.bottom) {
    return `<span class="tile-top tc-${d.color}">${d.top}</span><span class="tile-bottom tc-${d.color}">${d.bottom}</span>`;
  }
  return `<span class="tile-single tc-${d.color}">${d.top}</span>`;
}
