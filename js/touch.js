/**
 * touch.js v28 — Mobile touch enhancements
 * - Swipe across hand tiles to highlight
 * - Tap to select, tap again to discard
 * - Haptic feedback (vibration API)
 * - Prevents accidental scrolling on hand area
 */
var MahjongTouch = (function() {
  var active = false;
  var startX = 0;
  var lastHighlighted = null;

  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms || 10);
  }

  function init() {
    var handArea = document.querySelector('#player-south .hand-area');
    if (!handArea) return;

    // Prevent default touch behavior on hand area
    handArea.addEventListener('touchmove', function(e) {
      if (active) e.preventDefault();
    }, { passive: false });

    handArea.addEventListener('touchstart', function(e) {
      if (!game || game.phase !== 'playing') return;
      var mySeat = game._mySeat || 0;
      if (game.currentTurn !== mySeat) return;
      active = true;
      startX = e.touches[0].clientX;
      var tile = getTileAtPoint(e.touches[0].clientX, e.touches[0].clientY);
      if (tile) highlightTile(tile);
    }, { passive: true });

    handArea.addEventListener('touchmove', function(e) {
      if (!active) return;
      var touch = e.touches[0];
      var tile = getTileAtPoint(touch.clientX, touch.clientY);
      if (tile && tile !== lastHighlighted) {
        highlightTile(tile);
        vibrate(8);
      }
    });

    handArea.addEventListener('touchend', function(e) {
      if (!active) return;
      active = false;
      // If a tile is highlighted, treat as click (select/discard)
      if (lastHighlighted) {
        var tileId = lastHighlighted.dataset.tileId;
        if (tileId) {
          var tileObj = findTileById(tileId);
          if (tileObj) {
            vibrate(15);
            onTileClick(tileObj);
          }
        }
      }
      clearHighlight();
    }, { passive: true });
  }

  function getTileAtPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    // Walk up to find .hand-tile
    while (el && !el.classList.contains('hand-tile')) {
      el = el.parentElement;
      if (!el || el.id === 'player-south') return null;
    }
    return el;
  }

  function findTileById(id) {
    if (!game) return null;
    var mySeat = game._mySeat || 0;
    var hand = game.players[mySeat].hand;
    for (var i = 0; i < hand.length; i++) {
      if (String(hand[i].id) === String(id)) return hand[i];
    }
    return null;
  }

  function highlightTile(el) {
    clearHighlight();
    el.classList.add('touch-highlight');
    lastHighlighted = el;
  }

  function clearHighlight() {
    if (lastHighlighted) {
      lastHighlighted.classList.remove('touch-highlight');
    }
    lastHighlighted = null;
  }

  // Auto-init after DOM ready
  if (document.readyState === 'complete') {
    setTimeout(init, 100);
  } else {
    window.addEventListener('load', function() { setTimeout(init, 100); });
  }

  // Re-init after each render (hand area gets rebuilt)
  var _origRender = null;
  function hookRender() {
    if (typeof renderGame === 'function' && !_origRender) {
      _origRender = renderGame;
      // We don't override renderGame — instead we use MutationObserver
    }
    // Use observer to re-attach on hand area changes
    var observer = new MutationObserver(function() {
      init();
    });
    var target = document.querySelector('#player-south .hand-area');
    if (target) {
      observer.observe(target, { childList: true });
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(hookRender, 200);
  } else {
    window.addEventListener('load', function() { setTimeout(hookRender, 200); });
  }

  return { init: init, vibrate: vibrate };
})();
