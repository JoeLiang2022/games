/**
 * voice.js v43 — AI character voice lines
 * Loads pre-generated TTS audio and plays contextual lines.
 * 新增：播放語音時自動降低 BGM 音量 (duck/unduck)
 */
var MahjongVoice = (function() {
  'use strict';

  var manifest = null;
  var audioCache = {};
  var enabled = true;
  var loaded = false;
  var charMap = {};
  var _activeVoices = 0; // 追蹤正在播放的語音數量

  function assignCharacters() {
    var chars = ['char1', 'char2', 'char3', 'char4'];
    for (var i = chars.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
    }
    charMap = {};
    for (var s = 0; s < 4; s++) {
      charMap[s] = chars[s];
    }
  }

  function loadManifest() {
    if (loaded) return Promise.resolve();
    return fetch('voice-manifest.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        manifest = data;
        loaded = true;
        assignCharacters();
      })
      .catch(function(e) {
        console.warn('Voice manifest load failed:', e);
      });
  }

  function getAudio(path) {
    if (audioCache[path]) return audioCache[path];
    var a = new Audio(path);
    a.preload = 'auto';
    a.volume = 0.8;
    audioCache[path] = a;
    return a;
  }

  function play(event, seat) {
    if (!enabled || !manifest) return;
    var charId = charMap[seat];
    if (!charId) return;
    var lines = manifest[event] && manifest[event][charId];
    if (!lines || lines.length === 0) return;

    var idx = Math.floor(Math.random() * lines.length);
    var path = lines[idx];
    try {
      var audio = getAudio(path);
      var clone = audio.cloneNode();
      clone.volume = audio.volume;

      // Duck BGM before playing voice
      _activeVoices++;
      if (_activeVoices === 1 && typeof BGM !== 'undefined' && BGM.duck) {
        BGM.duck();
      }

      clone.addEventListener('ended', _onVoiceEnd);
      clone.addEventListener('error', _onVoiceEnd);
      clone.play().catch(function() { _onVoiceEnd(); });
    } catch(e) {}
  }

  function _onVoiceEnd() {
    _activeVoices = Math.max(0, _activeVoices - 1);
    if (_activeVoices === 0 && typeof BGM !== 'undefined' && BGM.unduck) {
      BGM.unduck();
    }
  }

  function preloadKey() {
    if (!manifest) return;
    var events = ['pong', 'kong', 'chow', 'win', 'zimo'];
    for (var e = 0; e < events.length; e++) {
      var ev = events[e];
      if (!manifest[ev]) continue;
      for (var c in manifest[ev]) {
        if (manifest[ev][c] && manifest[ev][c][0]) {
          getAudio(manifest[ev][c][0]);
        }
      }
    }
  }

  function toggle() { enabled = !enabled; return enabled; }
  function isEnabled() { return enabled; }
  function getCharMap() { return charMap; }

  var inited = false;
  function init() {
    if (inited) return;
    inited = true;
    loadManifest().then(function() { preloadKey(); });
  }

  document.addEventListener('click', init, { once: true });
  document.addEventListener('touchstart', init, { once: true });

  return {
    play: play, toggle: toggle, isEnabled: isEnabled,
    assignCharacters: assignCharacters, getCharMap: getCharMap,
    init: init, loadManifest: loadManifest
  };
})();
