'use strict';
// イラレCAD：正面図・側面図（右側の2枚）。three.js で描く
// 最初は遠近のない三面図：正面図は手前（平面図の下側）から、側面図は右から見る
// Shift＋Space＋ドラッグで回して見られる（回しているあいだは「見るだけ」。ダブルクリックで正面・側面に戻る）
//
// three.js の座標：X ＝ 平面図の x（右）、Y ＝ 高さ z（上）、Z ＝ 平面図の y（下＝手前）

const VIEWS = [
  { id: 'viewFront', name: '正面図', yaw: 0 },     // 手前（+Z）から見る
  { id: 'viewSide', name: '側面図', yaw: 90 },     // 右（+X）から見る
];
const SNAP_DEG = 15;

// 表示の拡大率（2枚共通）、それぞれのずらし量（px）と向き（度）。Ctrl+0 で元に戻る
const V3 = {
  k: 1,
  pan: { viewFront: P(0, 0), viewSide: P(0, 0) },
  rot: { viewFront: { yaw: 0, pitch: 0 }, viewSide: { yaw: 90, pitch: 0 } },
  ok: false, scene: null, views: {}, meshes: new Map(), flats: null, board: null, light: null,
};
function fitViews3d() {
  V3.k = 1;
  for (const v of VIEWS) { V3.pan[v.id] = P(0, 0); V3.rot[v.id] = { yaw: v.yaw, pitch: 0 }; }
  renderViews();
}
const isRotated = (id) => { const v = VIEWS.find((w) => w.id === id), r = V3.rot[id]; return Math.abs(r.yaw - v.yaw) > 1e-6 || Math.abs(r.pitch) > 1e-6; };

// ---- three.js の準備 ----
function initViews3d() {
  if (V3.ok || !window.THREE) return V3.ok;
  try {
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const light = new THREE.DirectionalLight(0xffffff, 0.6);
    scene.add(light, light.target);
    for (const v of VIEWS) {
      const box = $(v.id);
      const canvas = box.querySelector('canvas');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setClearColor(0x535353);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100000, 100000);
      V3.views[v.id] = { renderer, camera, box, label: box.querySelector('.vlabel'), hint: box.querySelector('.vhint') };
    }
    Object.assign(V3, { scene, light, ok: true });
  } catch (e) {
    console.warn(e);
    for (const v of VIEWS) { const b = $(v.id).querySelector('.vhint'); if (b) b.textContent = 'この PC では 3D 表示（WebGL）が使えません'; }
  }
  return V3.ok;
}

// 押し出し1つの形（三角形と輪郭線）。形が変わったときだけ作り直す
function solidMesh(it) {
  const key = JSON.stringify(it.subs) + it.rule + it.x3d.z0 + ',' + it.x3d.h;
  let m = V3.meshes.get(it.id);
  if (m && m.key === key) return m;
  if (m) disposeMesh(m);
  const tris = solidTriangles(it);
  const pos = new Float32Array(tris.length * 9);
  let o = 0;
  // solidTriangles は [x, 奥行き(上が奥), 高さ] → three.js の [X, Y, Z] = [x, 高さ, 手前]
  for (const t of tris) for (const p of t) { pos[o++] = p[0]; pos[o++] = p[2]; pos[o++] = -p[1]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color: 0xd9d9d9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.id = it.id;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0x222222 }));
  const group = new THREE.Group();
  group.add(mesh, edges);
  m = { key, group, mesh, edges };
  V3.meshes.set(it.id, m);
  return m;
}
function disposeMesh(m) {
  m.mesh.geometry.dispose(); m.mesh.material.dispose();
  m.edges.geometry.dispose(); m.edges.material.dispose();
}
// 押し出していないパス：床の上の線
function flatLines(items) {
  const g = new THREE.Group();
  for (const it of items) {
    for (const sb of it.subs) {
      if (sb.nodes.length < 2) continue;
      const pts = polyFromSub(sb);
      if (sb.closed) pts.push(pts[0]);
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0.05, p.y)));
      g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(it.stroke || it.fill || '#999999') })));
    }
  }
  return g;
}
function disposeGroup(g) {
  if (!g) return;
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}

// 見る向き（度）からカメラの向き
function viewDir(rot) {
  const y = (rot.yaw * Math.PI) / 180, p = (rot.pitch * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
}

function renderViews() {
  if (document.body.classList.contains('no3d')) return;
  if (!initViews3d()) return;
  const solids = visibleSolids();
  const flats = visibleLeaves().filter((it) => !extrudeOf(it));
  const scene = V3.scene;
  // 立体：いま見えているものだけ置く（消えたものは片付ける）
  const live = new Set(solids.map((it) => it.id));
  for (const [id, m] of V3.meshes) if (!live.has(id)) { scene.remove(m.group); disposeMesh(m); V3.meshes.delete(id); }
  const selIds = new Set(selectedItems().map((it) => it.id));
  for (const it of solids) {
    const m = solidMesh(it);
    if (m.group.parent !== scene) scene.add(m.group);
    const sel = selIds.has(it.id);
    m.mesh.visible = !S.outline;
    m.mesh.material.color.set(it.fill || '#d9d9d9');
    m.mesh.material.emissive.set(sel ? 0x0b1733 : 0x000000);
    m.edges.material.color.set(sel ? 0x4f80ff : S.outline ? 0x111111 : 0x222222);
  }
  // 床の線とアートボード
  if (V3.flats) { scene.remove(V3.flats); disposeGroup(V3.flats); }
  V3.flats = flatLines(flats);
  scene.add(V3.flats);
  if (!V3.board || V3.board.userData.w !== doc.width || V3.board.userData.h !== doc.height) {
    if (V3.board) { scene.remove(V3.board); disposeGroup(V3.board); }
    const b = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(doc.width, doc.height), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(doc.width / 2, 0, doc.height / 2);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(plane.geometry), new THREE.LineBasicMaterial({ color: 0x777777 }));
    edge.rotation.copy(plane.rotation); edge.position.copy(plane.position);
    b.add(plane, edge);
    b.userData = { w: doc.width, h: doc.height };
    V3.board = b;
    scene.add(b);
  }

  // 大きさ：アートボードと形が入るように（2枚とも同じ縮尺）
  let zMax = X3D_DEFAULT_H, zMin = 0;
  for (const it of solids) { zMax = Math.max(zMax, it.x3d.z0 + it.x3d.h); zMin = Math.min(zMin, it.x3d.z0); }
  const all = visibleLeaves();
  const bb = all.length ? Geo.bbox(all) : null;
  const xr = [Math.min(0, bb ? bb.x : 0), Math.max(doc.width, bb ? bb.x + bb.w : 0)];
  const yr = [Math.min(0, bb ? bb.y : 0), Math.max(doc.height, bb ? bb.y + bb.h : 0)];
  const center = new THREE.Vector3((xr[0] + xr[1]) / 2, (zMin + zMax) / 2, (yr[0] + yr[1]) / 2);
  let scale = Infinity;
  for (const v of VIEWS) {
    const r = V3.views[v.id].box.getBoundingClientRect();
    const span = v.id === 'viewFront' ? xr[1] - xr[0] : yr[1] - yr[0];
    scale = Math.min(scale, (r.width - 48) / Math.max(1, span), (r.height - 56) / Math.max(1, zMax - zMin));
  }
  if (!(scale > 0) || !isFinite(scale)) return;
  scale *= V3.k;
  V3.scale = scale;

  for (const v of VIEWS) {
    const vw = V3.views[v.id];
    const r = vw.box.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    vw.renderer.setSize(r.width, r.height, false);
    const cam = vw.camera;
    const w = r.width / scale, h = r.height / scale;
    cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2;
    cam.updateProjectionMatrix();
    // 向き：真上・真下を向いたときに上下が決まるよう、up は少しだけ倒す
    const rot = V3.rot[v.id];
    const dir = viewDir(rot);
    cam.up.set(0, 1, 0);
    if (Math.abs(rot.pitch) > 89.9) cam.up.set(-Math.sin((rot.yaw * Math.PI) / 180), 0, -Math.cos((rot.yaw * Math.PI) / 180)).multiplyScalar(Math.sign(rot.pitch));
    // ずらし（px）は、画面の右・上の向きに動かす
    cam.position.copy(center).addScaledVector(dir, 5000);
    cam.lookAt(center);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const pan = V3.pan[v.id];
    // 上に名前の分だけ下げる（以前の見え方に合わせる）
    const off = right.clone().multiplyScalar(-pan.x / scale).add(up.clone().multiplyScalar((pan.y + 8) / scale));
    cam.position.add(off);
    cam.updateMatrixWorld();
    // 光：カメラの少し左上から（面の向きで明るさが変わるように）
    V3.light.position.copy(cam.position).addScaledVector(up, 3000).addScaledVector(right, -2000);
    V3.light.target.position.copy(center).add(off);
    V3.light.target.updateMatrixWorld();
    vw.renderer.render(scene, cam);
    vw.label.textContent = v.name + (isRotated(v.id) ? '（回転中・ダブルクリックで戻る）' : '');
    vw.hint.textContent = !solids.length && v.id === 'viewFront' ? 'パスを選んで、パネルの「3D 押し出し」で高さを入れると、ここに立体が出ます' : '';
  }
}

// クリックした位置の立体（いちばん手前）
function hitView(id, x, y) {
  const vw = V3.views[id];
  if (!vw) return null;
  const r = vw.box.getBoundingClientRect();
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), vw.camera);
  const meshes = [...V3.meshes.values()].map((m) => m.mesh);
  const hit = rc.intersectObjects(meshes, false)[0];
  return hit ? hit.object.userData.id : null;
}
function zoomView3d(id, x, y, nk) {
  nk = Math.max(0.1, Math.min(64, nk));
  const f = nk / V3.k;
  // マウスの位置が動かないように、その図のずらし量を直す（もう一方は真ん中を中心に）
  for (const v of VIEWS) {
    const r = $(v.id).getBoundingClientRect();
    const cx = v.id === id ? x : r.width / 2, cy = v.id === id ? y : r.height / 2;
    const pan = V3.pan[v.id];
    const mx = cx - r.width / 2 - pan.x, my = cy - r.height / 2 - pan.y;
    V3.pan[v.id] = P(pan.x - mx * (f - 1), pan.y - my * (f - 1));
  }
  V3.k = nk;
  renderViews();
}

// ---- 正面図・側面図のマウス ----
// Space＋ドラッグ（中ボタンでも）：手のひら
// Shift＋Space＋ドラッグ：3D 手のひら（回す）。ドラッグ中に Shift を押していると 15° ずつ
// ダブルクリック：回したのを元に戻す／Alt＋ホイール：拡大・縮小／ホイール：上下（Ctrl・Shift で左右）
// クリック：立体を選ぶ（Shift で追加・外す）。何もないところをクリックで選択解除
for (const v of VIEWS) {
  const el = $(v.id);
  const local = (e) => { const r = el.getBoundingClientRect(); return P(e.clientX - r.left, e.clientY - r.top); };
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    closeMenus();
    const q = local(e);
    const grab = () => { try { el.setPointerCapture(e.pointerId); } catch (_) { /* つかめなくても動かす */ } };
    if (e.button === 0 && S.spaceDown && e.shiftKey) {
      e.preventDefault(); grab();
      drag = { type: 'orbit', s: q, o: { ...V3.rot[v.id] } };
      updateCursor();
      return;
    }
    if (e.button === 1 || (e.button === 0 && S.spaceDown)) {
      e.preventDefault(); grab();
      drag = { type: 'pan', s: q, o: P(V3.pan[v.id].x, V3.pan[v.id].y) };
      updateCursor();
      return;
    }
    if (e.button !== 0) return;
    if (S.drawing) endDrawing();
    const id = hitView(v.id, q.x, q.y);
    const f = id && findItem(id);
    if (f) {
      const target = topOf(f.item);
      if (e.shiftKey && S.sel.has(id)) leaves([target]).forEach((it) => S.sel.delete(it.id));
      else selectNode(target, e.shiftKey);
    } else if (!e.shiftKey) S.sel.clear();
    afterSelect(); render(); updateUI();
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const q = local(e);
    if (drag.type === 'pan') V3.pan[v.id] = P(drag.o.x + q.x - drag.s.x, drag.o.y + q.y - drag.s.y);
    else {
      // 横に動かすと横に回る、縦に動かすと見下ろす・見上げる（0.5° / px）
      let yaw = drag.o.yaw - (q.x - drag.s.x) * 0.5;
      let pitch = drag.o.pitch + (q.y - drag.s.y) * 0.5;
      if (e.shiftKey) { yaw = Math.round(yaw / SNAP_DEG) * SNAP_DEG; pitch = Math.round(pitch / SNAP_DEG) * SNAP_DEG; }
      pitch = Math.max(-90, Math.min(90, pitch));
      V3.rot[v.id] = { yaw: ((yaw % 360) + 360) % 360, pitch };
    }
    renderViews();
  });
  const end = () => { if (drag) { drag = null; updateCursor(); } };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => { if (isRotated(v.id)) { V3.rot[v.id] = { yaw: v.yaw, pitch: 0 }; renderViews(); } });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const q = local(e);
    const pinch = e.ctrlKey && !Number.isInteger(e.deltaY);
    if (e.altKey || pinch) zoomView3d(v.id, q.x, q.y, V3.k * Math.exp(-e.deltaY * (pinch ? 0.01 : 0.0015)));
    else {
      const p0 = V3.pan[v.id];
      V3.pan[v.id] = e.ctrlKey || e.shiftKey ? P(p0.x - (e.deltaY || e.deltaX), p0.y) : P(p0.x - e.deltaX, p0.y - e.deltaY);
      renderViews();
    }
  }, { passive: false });
}
// カーソル：Space で手のひら、Shift＋Space で回す
function updateViewsCursor() {
  const c = S.spaceDown ? (S.keys.shift ? ROTATE_CURSORS.ne : 'grab') : 'default';
  for (const v of VIEWS) $(v.id).style.cursor = c;
}
