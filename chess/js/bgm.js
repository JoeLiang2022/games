// Chinese Chess BGM — HTML5 Audio with free MP3 tracks
var BGM = (function() {
  'use strict';
  var TRACKS = [
    { name:'古琴清韻', url:'https://ia601503.us.archive.org/2/items/cd_chinese-classical-music/disc1/01.%20Chinese%20Classical%20Music%20-%20High%20Mountain%20and%20Running%20Water.mp3' },
    { name:'竹林幽境', url:'https://cdn.pixabay.com/audio/2024/11/04/audio_febc508520.mp3' },
    { name:'靜心冥想', url:'https://cdn.pixabay.com/audio/2024/09/19/audio_884fe92c21.mp3' },
    { name:'午後書房', url:'https://cdn.pixabay.com/audio/2024/11/04/audio_1808fbf07a.mp3' },
    { name:'鋼琴獨奏', url:'https://cdn.pixabay.com/audio/2024/09/24/audio_d0a13f69d2.mp3' }
  ];
  var audio = null, playing = false, currentIdx = 0, volume = 0.3;

  function play(idx) {
    if (idx !== undefined) currentIdx = idx;
    if (currentIdx >= TRACKS.length) currentIdx = 0;
    stop();
    audio = new Audio(TRACKS[currentIdx].url);
    audio.volume = volume;
    audio.addEventListener('ended', function() { currentIdx++; play(); });
    audio.addEventListener('error', function() { currentIdx++; play(); });
    var p = audio.play();
    if (p && p.catch) p.catch(function() {});
    playing = true;
  }

  function stop() {
    if (audio) { try { audio.pause(); audio.src = ''; } catch(e) {} audio = null; }
    playing = false;
  }

  function toggle() { if (playing) stop(); else play(); return playing; }
  function next() { currentIdx++; play(); }
  function prev() { currentIdx = Math.max(0, currentIdx - 1); play(); }
  function setVolume(v) { volume = v; if (audio) audio.volume = v; }
  function isPlaying() { return playing; }
  function getCurrentName() { return TRACKS[currentIdx] ? TRACKS[currentIdx].name : ''; }
  function getTracks() { return TRACKS; }

  return { play:play, stop:stop, toggle:toggle, next:next, prev:prev,
    setVolume:setVolume, isPlaying:isPlaying, getCurrentName:getCurrentName, getTracks:getTracks };
})();
