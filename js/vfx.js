/**
 * vfx.js v28 — Visual feedback system
 * - Action text popups (碰! 吃! 槓! 胡!)
 * - Turn indicator (glowing border on current player)
 * - Smooth tile transitions
 */
var VFX = (function() {
  var LABELS = {
    pong: { text: '碰!', color: '#3b82f6' },
    chow: { text: '吃!', color: '#16a34a' },
    kong: { text: '槓!', color: '#7c3aed' },
    ankong: { text: '暗槓!', color: '#7c3aed' },
    addkong: { text: '加槓!', color: '#7c3aed' },
    win: { text: '胡!', color: '#dc2626' },
    zimo: { text: '自摸!', color: '#fbbf24' },
    robkong: { text: '搶槓胡!', color: '#f97316' },
    flower: { text: '花!', color: '#d97706' }
  };

  // Show floating action text near a player position
  function showAction(type, seat) {
    var info = LABELS[type];
    if (!info) return;
    var el = document.createElement('div');
    el.className = 'vfx-action-popup';
    el.textContent = info.text;
    el.style.color = info.color;
    el.style.textShadow = '0 0 12px ' + info.color;

    // Position near the player
    var pos = getSeatPosition(seat);
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';

    document.getElementById('game-table').appendChild(el);

    // Animate: scale up + fade out + float up
    requestAnimationFrame(function() {
      el.classList.add('vfx-animate');
    });

    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1200);
  }

  function getSeatPosition(seat) {
    var humanSeat = (typeof game !== 'undefined' && game._mySeat) || 0;
    var relSeat = (seat - humanSeat + 4) % 4;
    var w = window.innerWidth, h = window.innerHeight;
    // 0=south(me), 1=east(right), 2=north(top), 3=west(left)
    switch(relSeat) {
      case 0: return { x: w / 2, y: h - 100 };
      case 1: return { x: w - 60, y: h / 2 };
      case 2: return { x: w / 2, y: 60 };
      case 3: return { x: 60, y: h / 2 };
      default: return { x: w / 2, y: h / 2 };
    }
  }

  // Turn indicator — highlight current player's area
  var lastTurnSeat = -1;
  function updateTurnIndicator(currentSeat) {
    // Remove old indicator
    var old = document.querySelectorAll('.turn-active');
    for (var i = 0; i < old.length; i++) old[i].classList.remove('turn-active');
    if (currentSeat < 0) return;

    var humanSeat = (typeof game !== 'undefined' && game._mySeat) || 0;
    var relSeat = (currentSeat - humanSeat + 4) % 4;
    var positions = ['south', 'east', 'north', 'west'];
    var playerId = 'player-' + positions[relSeat];
    var el = document.getElementById(playerId);
    if (el) el.classList.add('turn-active');
    lastTurnSeat = currentSeat;
  }

  return {
    showAction: showAction,
    updateTurnIndicator: updateTurnIndicator
  };
})();
