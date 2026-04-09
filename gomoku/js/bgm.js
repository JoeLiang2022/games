/**
 * bgm.js — 五子棋背景音樂 v3
 * 30 tracks across 5 categories, shuffle/next/prev, HTML5 Audio
 * 播放清單自動循環：播完最後一首會重新洗牌並從頭播放
 */
var BGM = (function() {
  var playing = false;
  var enabled = true;
  var volume = 0.3;
  var currentCat = 'lofi';
  var currentIdx = 0;
  var shuffle = true;
  var audio = null;
  var fadeTimer = null;

  var CATEGORIES = {
    lofi:     { name: 'Lo-fi',   icon: '🎵' },
    ambient:  { name: '環境音',  icon: '🌊' },
    piano:    { name: '鋼琴',    icon: '🎹' },
    jazz:     { name: '爵士',    icon: '🎷' },
    japanese: { name: '和風',    icon: '🎋' }
  };

  var TRACKS = [
    { id:'px01', name:'午後書房',           cat:'lofi',     url:'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3' },
    { id:'ia01', name:'夏日衝勁',           cat:'lofi',     url:'https://archive.org/download/3x13_-_a_summer_spent_inside/3x.13_-_a_summer_spent_inside_-_cd1_02_-_gusto.mp3' },
    { id:'ia02', name:'警示信號',           cat:'lofi',     url:'https://archive.org/download/3x13_-_a_summer_spent_inside/3x.13_-_a_summer_spent_inside_-_cd1_03_-_warning_sign.mp3' },
    { id:'ia03', name:'心流',               cat:'lofi',     url:'https://archive.org/download/DWK232/BaaskaT_-_01_-_Flow.mp3' },
    { id:'ia04', name:'故鄉',               cat:'lofi',     url:'https://archive.org/download/DWK232/BaaskaT_-_02_-_Hometown.mp3' },
    { id:'ia05', name:'新時代黎明',         cat:'lofi',     url:'https://archive.org/download/DWK232/BaaskaT_-_03_-_Dawn_Of_A_New_Era.mp3' },
    { id:'ia06', name:'四月雨',             cat:'lofi',     url:'https://archive.org/download/DWK123/ProleteR_-_01_-_April_Showers.mp3' },
    { id:'ia07', name:'城市諷刺',           cat:'lofi',     url:'https://archive.org/download/DWK123/ProleteR_-_02_-_Downtown_Irony.mp3' },
    { id:'ia08', name:'一生虛構',           cat:'lofi',     url:'https://archive.org/download/mia049/mia49a_aphilas_-_lifelong_fiction.mp3' },
    { id:'ia09', name:'集體記憶',           cat:'lofi',     url:'https://archive.org/download/mia049/mia49c_aphilas_-_collective_memory_loss.mp3' },
    { id:'ia26', name:'冷鋼出鞘',           cat:'lofi',     url:'https://archive.org/download/exp036/exp036_-_102_-_brother_thadeus_-_cold_steel_out.mp3' },
    { id:'px04', name:'夢幻氛圍',           cat:'ambient',  url:'https://cdn.pixabay.com/audio/2022/11/22/audio_febc508520.mp3' },
    { id:'ia10', name:'靜謐符號',           cat:'ambient',  url:'https://archive.org/download/foot090/foot090_01-nienvox-sign.mp3' },
    { id:'ia11', name:'失眠組曲',           cat:'ambient',  url:'https://archive.org/download/wh131/wh131_01_Lightwatchers-insomnia-Suite-I.mp3' },
    { id:'ia12', name:'散落彗星',           cat:'ambient',  url:'https://archive.org/download/mn001/mn001_01-andrey_kiritchenko-speading_comets.mp3' },
    { id:'ia13', name:'季節平衡',           cat:'ambient',  url:'https://archive.org/download/moulin002/DUDLEY_-_Seasonal_LP_-_01_-_Adequat.mp3' },
    { id:'ia14', name:'靜止棉絮',           cat:'ambient',  url:'https://archive.org/download/one023/one023_01-loscil_-_stases_-_cotom.mp3' },
    { id:'ia15', name:'耳畔恐懼',           cat:'ambient',  url:'https://archive.org/download/mtcomp211/mtw001-vim-ears-fear.mp3' },
    { id:'ia16', name:'本篤',               cat:'ambient',  url:'https://archive.org/download/mtcomp211/mtw002-tek-benedict.mp3' },
    { id:'ia23', name:'循環',               cat:'ambient',  url:'https://archive.org/download/Sickness_in_the_World/John_Holowach_-_01_-_Cycles.mp3' },
    { id:'ia24', name:'漫長旅途',           cat:'ambient',  url:'https://archive.org/download/Shape_Of_Impact/John_Holowach_-_02_-_The_First_Step_of_a_Long_Journey.mp3' },
    { id:'ia25', name:'等於二十一',         cat:'ambient',  url:'https://archive.org/download/Shape_Of_Impact/John_Holowach_-_03_-_It_Equals_21.mp3' },
    { id:'px02', name:'晚安鋼琴',           cat:'piano',    url:'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3' },
    { id:'ia17', name:'序章',               cat:'piano',    url:'https://archive.org/download/solo-piano-7/Torley-001-Openings.mp3' },
    { id:'ia18', name:'記憶旋律',           cat:'piano',    url:'https://archive.org/download/solo-piano-7/Torley-002-Remember-melody.mp3' },
    { id:'ia19', name:'深沉和弦',           cat:'piano',    url:'https://archive.org/download/solo-piano-7/Torley-003-Deep-chording.mp3' },
    { id:'ia20', name:'營造氣氛',           cat:'jazz',     url:'https://archive.org/download/DWK137/Jenova_7_And_Mr._Moods_-_02_-_Set_The_Mood.mp3' },
    { id:'ia21', name:'流星之下',           cat:'jazz',     url:'https://archive.org/download/DWK137/Jenova_7_And_Mr._Moods_-_03_-_Under_The_Falling_Stars.mp3' },
    { id:'ia22', name:'序曲',               cat:'jazz',     url:'https://archive.org/download/DWK137/Jenova_7_And_Mr._Moods_-_01_-_Intro.mp3' },
    { id:'px03', name:'櫻花',               cat:'japanese', url:'https://cdn.pixabay.com/audio/2022/08/02/audio_884fe92c21.mp3' }
  ];

  // Build per-category index lists
  var catTracks = {};
  TRACKS.forEach(function(t, i) {
    if (!catTracks[t.cat]) catTracks[t.cat] = [];
    catTracks[t.cat].push(i);
  });

  // Shuffle helper (Fisher-Yates on a copy)
  function shuffleArr(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  var playlist = [];  // shuffled indices for current category
  var plPos = 0;

  function buildPlaylist() {
    var indices = catTracks[currentCat] || [];
    playlist = shuffle ? shuffleArr(indices) : indices.slice();
    plPos = 0;
  }

  var errorCount = 0;
  function createAudio(url) {
    var a = new Audio();
    a.crossOrigin = 'anonymous';
    a.loop = false;
    a.volume = 0;
    a.preload = 'auto';
    a.src = url;
    a.addEventListener('ended', function() { errorCount = 0; next(); });
    a.addEventListener('error', function() {
      errorCount++;
      if (errorCount < playlist.length) next();
      else { errorCount = 0; /* all tracks failed, stop */ }
    });
    return a;
  }

  function fadeIn(a, target, dur) {
    if (fadeTimer) clearInterval(fadeTimer);
    var step = target / (dur / 50);
    a.volume = 0;
    fadeTimer = setInterval(function() {
      var v = a.volume + step;
      if (v >= target) { a.volume = target; clearInterval(fadeTimer); fadeTimer = null; }
      else a.volume = v;
    }, 50);
  }

  function fadeOut(a, dur, cb) {
    if (fadeTimer) clearInterval(fadeTimer);
    if (!a || a.paused) { if (cb) cb(); return; }
    var step = a.volume / (dur / 50);
    fadeTimer = setInterval(function() {
      var v = a.volume - step;
      if (v <= 0.01) {
        a.volume = 0; a.pause(); clearInterval(fadeTimer); fadeTimer = null;
        if (cb) cb();
      } else a.volume = v;
    }, 50);
  }

  function playTrackAt(pos) {
    if (pos < 0 || pos >= playlist.length) { buildPlaylist(); pos = 0; }
    plPos = pos;
    currentIdx = playlist[plPos];
    var track = TRACKS[currentIdx];
    if (!track) return;

    if (audio) { try { audio.pause(); } catch(e) {} }
    audio = createAudio(track.url);
    playing = true;
    var a = audio;
    var p = a.play();
    if (p && p.catch) {
      p.then(function() { fadeIn(a, volume, 1200); }).catch(function() {
        playing = false; updateBtn();
      });
    } else { fadeIn(a, volume, 1200); }
    updateBtn();
    updateSelector();
  }

  function start() {
    if (playing || !enabled) return;
    buildPlaylist();
    if (playlist.length === 0) return;
    playTrackAt(0);
  }

  function stop() {
    playing = false;
    if (audio) { fadeOut(audio, 600, function() { audio = null; }); }
    updateBtn();
  }

  function toggle() { if (playing) stop(); else start(); return playing; }

  function next() {
    if (playlist.length === 0) return;
    var np = plPos + 1;
    if (np >= playlist.length) {
      buildPlaylist();
      np = 0;
    }
    playTrackAt(np);
  }

  function prev() {
    if (playlist.length === 0) return;
    var np = plPos - 1;
    if (np < 0) np = playlist.length - 1;
    playTrackAt(np);
  }

  function setCategory(cat) {
    if (!CATEGORIES[cat]) return;
    var wasPlaying = playing;
    if (playing && audio) {
      fadeOut(audio, 300, function() {
        audio = null; currentCat = cat; buildPlaylist();
        if (wasPlaying) playTrackAt(0);
      });
    } else {
      currentCat = cat; buildPlaylist();
    }
    updateSelector();
  }

  function playTrack(trackIdx) {
    var t = TRACKS[trackIdx];
    if (!t) return;
    // Switch category if needed
    if (t.cat !== currentCat) { currentCat = t.cat; buildPlaylist(); }
    // Find position in playlist
    var pos = playlist.indexOf(trackIdx);
    if (pos < 0) { playlist.push(trackIdx); pos = playlist.length - 1; }
    var wasPlaying = playing;
    if (audio) {
      fadeOut(audio, 200, function() { audio = null; playTrackAt(pos); });
    } else { playTrackAt(pos); }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (audio && playing) { try { audio.volume = volume; } catch(e) {} }
  }

  function setShuffle(s) { shuffle = !!s; buildPlaylist(); }

  function updateBtn() {
    var btn = document.getElementById('btnMusic');
    if (btn) { btn.textContent = '🎵'; btn.style.opacity = playing ? '1' : '0.4'; }
  }

  function updateSelector() {
    // Category tabs
    var tabs = document.querySelectorAll('.bgm-cat');
    tabs.forEach(function(el) { el.classList.toggle('active', el.dataset.cat === currentCat); });
    // Track list
    var items = document.querySelectorAll('.bgm-track');
    items.forEach(function(el) {
      var idx = parseInt(el.dataset.idx);
      el.classList.toggle('active', playing && idx === currentIdx);
    });
    // Now-playing
    var np = document.getElementById('bgmNowPlaying');
    if (np) {
      if (playing && TRACKS[currentIdx]) {
        np.textContent = CATEGORIES[TRACKS[currentIdx].cat].icon + ' ' + TRACKS[currentIdx].name;
      } else { np.textContent = '未播放'; }
    }
  }

  return {
    start:start, stop:stop, toggle:toggle, next:next, prev:prev,
    setCategory:setCategory, playTrack:playTrack,
    setVolume:setVolume, setShuffle:setShuffle,
    getCategories:function(){return CATEGORIES;},
    getTracks:function(){return TRACKS;},
    getCatTracks:function(){return catTracks;},
    getCategory:function(){return currentCat;},
    getCurrentIdx:function(){return currentIdx;},
    isPlaying:function(){return playing;},
    isShuffle:function(){return shuffle;},
    updateSelector:updateSelector
  };
})();
