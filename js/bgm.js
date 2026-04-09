/**
 * bgm.js v44 — Real MP3 BGM with duck/unduck for voice coexistence
 * Replaces Web Audio synthesis with actual music tracks
 * Music: PeriTune - Chinatown (CC BY 4.0) https://peritune.com/
 */
const BGM = (function() {
  let playing = false;
  let enabled = true;
  let _startAttempted = false;
  let _normalVolume = 0.35;
  let _duckedVolume = 0.08;
  let _isDucked = false;
  let _duckTimer = null;
  let _currentTrack = null;
  let _trackName = 'main';

  const TRACKS = {
    main:  'music/bgm_main.mp3',   // 悠閒中國風 (healing)
    tense: 'music/bgm_tense.mp3',  // 緊張節奏 (pop)
  };

  let _audio = {};

  function _getAudio(name) {
    if (_audio[name]) return _audio[name];
    var a = new Audio(TRACKS[name]);
    a.loop = true;
    a.volume = _normalVolume;
    a.preload = 'auto';
    _audio[name] = a;
    return a;
  }

  function prewarm() {
    try { _getAudio('main'); _getAudio('tense'); } catch(e) {}
  }

  function start() {
    if (playing || !enabled) return;
    _startAttempted = true;
    try {
      var a = _getAudio(_trackName);
      a.volume = _isDucked ? _duckedVolume : _normalVolume;
      a.play().then(function() {
        playing = true;
        _currentTrack = a;
        var btn = document.getElementById('music-btn');
        if (btn) btn.style.opacity = '1';
      }).catch(function(e) {
        console.warn('BGM start failed:', e);
      });
    } catch(e) {
      console.warn('BGM start error:', e);
    }
  }

  function stop() {
    playing = false;
    if (_currentTrack) {
      _currentTrack.pause();
      _currentTrack.currentTime = 0;
    }
    var btn = document.getElementById('music-btn');
    if (btn) btn.style.opacity = '0.4';
  }

  function toggle() {
    if (playing) { stop(); } else { start(); }
    return playing;
  }

  function switchTrack(name) {
    if (!TRACKS[name] || name === _trackName) return;
    var wasPlaying = playing;
    if (playing) {
      _currentTrack.pause();
      playing = false;
    }
    _trackName = name;
    if (wasPlaying) {
      var a = _getAudio(name);
      a.volume = _isDucked ? _duckedVolume : _normalVolume;
      a.play().then(function() {
        playing = true;
        _currentTrack = a;
      }).catch(function(){});
    }
  }

  function setVolume(v) {
    _normalVolume = Math.max(0, Math.min(1, v));
    if (_currentTrack && !_isDucked) _currentTrack.volume = _normalVolume;
  }

  function duck() {
    if (_isDucked) return;
    _isDucked = true;
    if (_duckTimer) { clearTimeout(_duckTimer); _duckTimer = null; }
    if (_currentTrack) {
      _currentTrack.volume = _duckedVolume;
    }
  }

  function unduck() {
    if (!_isDucked) return;
    if (_duckTimer) clearTimeout(_duckTimer);
    _duckTimer = setTimeout(function() {
      _isDucked = false;
      _duckTimer = null;
      if (_currentTrack) {
        _currentTrack.volume = _normalVolume;
      }
    }, 200);
  }

  function isPlaying() { return playing; }

  function setEnabled(v) {
    enabled = v;
    if (!v && playing) stop();
  }

  return {
    start:start, stop:stop, toggle:toggle,
    setVolume:setVolume, isPlaying:isPlaying,
    setEnabled:setEnabled, prewarm:prewarm,
    duck:duck, unduck:unduck, switchTrack:switchTrack
  };
})();
