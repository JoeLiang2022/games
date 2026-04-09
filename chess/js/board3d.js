import * as THREE from 'three';

// ── State ──
var scene, camera, renderer, container;
var boardGroup, piecesGroup;
var raycaster = new THREE.Raycaster();
var mouse = new THREE.Vector2();
var pointLight;
var lightAngle = 0;
var legalMoves = [], lastMove = null;
var aiColor = 'b', aiThinking = false;

// ── Init ──
function initScene() {
  container = document.getElementById('board3d');
  var cw = container.clientWidth || 560;
  var ch = container.clientHeight || 500;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  // Fixed top-down camera — no rotation
  camera = new THREE.PerspectiveCamera(40, cw / ch, 0.1, 100);
  camera.position.set(4, 14, 7);
  camera.lookAt(4, 0, 4.5);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(cw, ch);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0xffeedd, 0.6));
  var dir = new THREE.DirectionalLight(0xfff0dd, 0.9);
  dir.position.set(5, 12, 5);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 1; dir.shadow.camera.far = 30;
  dir.shadow.camera.left = -8; dir.shadow.camera.right = 12;
  dir.shadow.camera.top = 12; dir.shadow.camera.bottom = -4;
  scene.add(dir);

  pointLight = new THREE.PointLight(0xffaa44, 0.5, 20);
  pointLight.position.set(4, 4, 4.5);
  scene.add(pointLight);

  boardGroup = new THREE.Group();
  piecesGroup = new THREE.Group();
  scene.add(boardGroup);
  scene.add(piecesGroup);

  buildBoard();
  drawPieces();

  renderer.domElement.addEventListener('click', onClick);
  renderer.domElement.addEventListener('touchend', onTouch);
  window.addEventListener('resize', onResize);

  animate();
}

// ── Board ──
function buildBoard() {
  // Surface
  var geo = new THREE.BoxGeometry(9.6, 0.3, 10.6);
  var mat = new THREE.MeshStandardMaterial({ color: 0xc89848, roughness: 0.65, metalness: 0.05 });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(4, -0.15, 4.5);
  mesh.receiveShadow = true;
  boardGroup.add(mesh);

  // Frame
  var fm = new THREE.MeshStandardMaterial({ color: 0x3a2008, roughness: 0.8 });
  [[-0.35,4.5,0.15,0.4,10.6],[8.35,4.5,0.15,0.4,10.6]].forEach(function(d) {
    var f = new THREE.Mesh(new THREE.BoxGeometry(d[2],d[3],d[4]), fm);
    f.position.set(d[0],0.05,d[1]); boardGroup.add(f);
  });
  [[4,-0.35,9.6,0.4,0.15],[4,9.35,9.6,0.4,0.15]].forEach(function(d) {
    var f = new THREE.Mesh(new THREE.BoxGeometry(d[2],d[3],d[4]), fm);
    f.position.set(d[0],0.05,d[1]); boardGroup.add(f);
  });

  // Grid lines
  var lm = new THREE.LineBasicMaterial({ color: 0x3a2008 });
  for (var r = 0; r < 10; r++) {
    boardGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0,0.01,r), new THREE.Vector3(8,0.01,r)
    ]), lm));
  }
  for (var c = 0; c < 9; c++) {
    if (c===0||c===8) {
      boardGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(c,0.01,0), new THREE.Vector3(c,0.01,9)
      ]), lm));
    } else {
      boardGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(c,0.01,0), new THREE.Vector3(c,0.01,4)
      ]), lm));
      boardGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(c,0.01,5), new THREE.Vector3(c,0.01,9)
      ]), lm));
    }
  }
  // Palace
  [[3,0,5,2],[5,0,3,2],[3,7,5,9],[5,7,3,9]].forEach(function(d) {
    boardGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(d[0],0.01,d[1]), new THREE.Vector3(d[2],0.01,d[3])
    ]), lm));
  });

  // River text
  var rc = document.createElement('canvas');
  rc.width = 512; rc.height = 64;
  var g = rc.getContext('2d');
  g.fillStyle = '#5a3a10';
  g.font = 'bold 40px KaiTi, DFKai-SB, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('楚  河          漢  界', 256, 32);
  var rp = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 0.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rc), transparent: true })
  );
  rp.rotation.x = -Math.PI / 2;
  rp.position.set(4, 0.02, 4.5);
  boardGroup.add(rp);
}

// ── Pieces ──
function makePiece(piece) {
  var isRed = piece.color === 'r';
  var grp = new THREE.Group();

  // Body cylinder
  var body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.44, 0.22, 32),
    new THREE.MeshStandardMaterial({ color: isRed ? 0xd4a050 : 0x8a7a6a, roughness: 0.45, metalness: 0.15 })
  );
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);

  // Top disc
  var top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.39, 0.39, 0.02, 32),
    new THREE.MeshStandardMaterial({ color: isRed ? 0xf0d898 : 0xa09888, roughness: 0.35, metalness: 0.1 })
  );
  top.position.y = 0.11; top.castShadow = true;
  grp.add(top);

  // Inner ring
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.015, 8, 32),
    new THREE.MeshStandardMaterial({ color: isRed ? 0xaa1111 : 0x222222, roughness: 0.3, metalness: 0.3 })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.125;
  grp.add(ring);

  // Text
  var name = Game.NAMES[piece.color][piece.type];
  var tc = document.createElement('canvas');
  tc.width = 128; tc.height = 128;
  var cx = tc.getContext('2d');
  cx.clearRect(0, 0, 128, 128);
  cx.fillStyle = isRed ? '#aa1111' : '#1a1a1a';
  cx.font = 'bold 72px KaiTi, DFKai-SB, Noto Serif TC, serif';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(name, 64, 68);
  var tp = new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 0.58),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tc), transparent: true })
  );
  tp.rotation.x = -Math.PI / 2; tp.position.y = 0.13;
  grp.add(tp);

  grp.userData.piece = piece;
  return grp;
}

function drawPieces() {
  while (piecesGroup.children.length) piecesGroup.remove(piecesGroup.children[0]);
  var b = Game.getBoard();
  if (!b || !b.length) return;
  var sel = Game.getSelected();

  for (var r = 0; r < 10; r++) {
    if (!b[r]) continue;
    for (var c = 0; c < 9; c++) {
      if (!b[r][c]) continue;
      var m = makePiece(b[r][c]);
      m.position.set(c, 0.11, r);
      m.userData.row = r; m.userData.col = c;
      if (sel && sel.row === r && sel.col === c) {
        m.position.y = 0.4;
        var glow = new THREE.Mesh(
          new THREE.TorusGeometry(0.5, 0.03, 8, 32),
          new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.6 })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(c, 0.02, r);
        piecesGroup.add(glow);
      }
      piecesGroup.add(m);
    }
  }

  // Legal move dots
  for (var i = 0; i < legalMoves.length; i++) {
    var lm = legalMoves[i];
    var isCap = b[lm.row] && b[lm.row][lm.col];
    var dot = new THREE.Mesh(
      isCap ? new THREE.TorusGeometry(0.45, 0.04, 8, 32) : new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: isCap ? 0xff3333 : 0x00cc55, transparent: true, opacity: 0.6 })
    );
    if (isCap) dot.rotation.x = -Math.PI / 2;
    dot.position.set(lm.col, 0.02, lm.row);
    piecesGroup.add(dot);
  }

  // Last move highlight
  if (lastMove) {
    [lastMove.from, lastMove.to].forEach(function(p) {
      var hl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.85),
        new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.15 })
      );
      hl.rotation.x = -Math.PI / 2;
      hl.position.set(p.col, 0.015, p.row);
      piecesGroup.add(hl);
    });
  }
}

// ── Input ──
function getClickPos(cx, cy) {
  var rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var pt = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, pt);
  if (!pt) return null;
  var col = Math.round(pt.x), row = Math.round(pt.z);
  return (row >= 0 && row <= 9 && col >= 0 && col <= 8) ? { row: row, col: col } : null;
}

function handleInput(row, col) {
  if (aiThinking || Game.getTurn() === aiColor) return;
  var result = Game.handleClick(row, col);
  if (!result) return;
  if (result.action === 'select') { legalMoves = result.moves; }
  else if (result.action === 'deselect') { legalMoves = []; }
  else if (result.action === 'move') {
    legalMoves = [];
    lastMove = { from: result.from, to: result.to };
    updateStatus();
    drawPieces();
    if (!result.gameOver) { scheduleAI(); return; }
  }
  updateStatus();
  drawPieces();
}

function onClick(e) { var p = getClickPos(e.clientX, e.clientY); if (p) handleInput(p.row, p.col); }
function onTouch(e) { e.preventDefault(); var t = e.changedTouches[0]; var p = getClickPos(t.clientX, t.clientY); if (p) handleInput(p.row, p.col); }
function onResize() {
  var cw = container.clientWidth || 560, ch = container.clientHeight || 500;
  camera.aspect = cw / ch; camera.updateProjectionMatrix();
  renderer.setSize(cw, ch);
}

// ── AI ──
function scheduleAI() {
  if (Game.isGameOver()) return;
  aiThinking = true; updateStatus();
  setTimeout(function() {
    var move = AI.getMove(aiColor, 3, 2500);
    aiThinking = false;
    if (move) {
      Game.makeMove(move.fr, move.fc, move.tr, move.tc);
      lastMove = { from:{row:move.fr,col:move.fc}, to:{row:move.tr,col:move.tc} };
    }
    updateStatus(); drawPieces();
  }, 300);
}

// ── UI ──
function updateStatus() {
  var el = document.getElementById('statusText');
  if (Game.isGameOver()) { el.textContent = '🏆 '+(Game.getWinner()==='r'?'紅方':'黑方')+'勝！'; el.className='status-text win'; return; }
  if (aiThinking) { el.textContent = '🤔 AI 思考中...'; el.className='status-text black-turn'; return; }
  var check = Game.isInCheck(Game.getTurn());
  el.textContent = (Game.getTurn()==='r'?'紅方':'黑方')+'走棋'+(check?' ⚠️ 將軍！':'');
  el.className = 'status-text '+(Game.getTurn()==='r'?'red-turn':'black-turn');
  var cnt = document.getElementById('moveCount');
  if (cnt) cnt.textContent = '第 '+(Math.floor(Game.getMoveHistory().length/2)+1)+' 回合';
}

function newGame() { aiThinking=false; Game.init(); legalMoves=[]; lastMove=null; updateStatus(); drawPieces(); }
function undo() { if(aiThinking)return; Game.undoMove(); Game.undoMove(); legalMoves=[];
  var h=Game.getMoveHistory(); lastMove=h.length>0?{from:h[h.length-1].from,to:h[h.length-1].to}:null;
  updateStatus(); drawPieces(); }

document.getElementById('btnNewGame').addEventListener('click', newGame);
document.getElementById('btnUndo').addEventListener('click', undo);

// ── Animate ──
function animate() {
  requestAnimationFrame(animate);
  lightAngle += 0.005;
  if (pointLight) {
    pointLight.position.x = 4 + Math.sin(lightAngle) * 3;
    pointLight.position.z = 4.5 + Math.cos(lightAngle) * 2;
  }
  // Float selected piece
  var sel = Game.getSelected();
  if (sel) {
    piecesGroup.children.forEach(function(ch) {
      if (ch.userData.row === sel.row && ch.userData.col === sel.col && ch.userData.piece) {
        ch.position.y = 0.35 + Math.sin(Date.now() * 0.004) * 0.06;
      }
    });
  }
  renderer.render(scene, camera);
}

// ── Start ──
Game.init();
initScene();
updateStatus();
