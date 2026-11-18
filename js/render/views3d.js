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
    drawViewBox(v.id);   // 選んでいるものの枠
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

// ---- 正面図・側面図での選択と変形（イラレの選択ツールと同じ考え方） ----
// 選んだものには、どの図にもバウンディングボックスが出る
//   枠の中をドラッグ：その図の平面で移動（正面図＝左右 x と高さ、側面図＝左右 奥行きと高さ）。Shift で真横・真上に
//   取っ手をドラッグ：伸び縮み（横＝幅・奥行き、縦＝高さ）。Alt で中心から、Shift で縦横比をそのまま（角の取っ手）
//   平らなパスの上の取っ手を引き上げると、押し出しになる
// 回して見ている図では、選ぶだけ
const SNAP_PX = 6;      // ほかの立体の高さに吸着する距離
const editable = (id) => !isRotated(id);
// 画面の右へ 1px 動いたときの、平面図での動き（正面図＝x の +、側面図＝y の −。手前が左）
const hAxis = (id) => (id === 'viewFront' ? 'x' : 'y');
const hSign = (id) => (id === 'viewFront' ? 1 : -1);

// 押し出していないパス（床の上の線）をクリックで拾う
function hitFlat(id, q) {
  const vw = V3.views[id], r = vw.box.getBoundingClientRect();
  let best = null, bd = 5;
  for (const it of visibleLeaves()) {
    if (extrudeOf(it)) continue;
    for (const sb of it.subs) {
      if (sb.nodes.length < 2) continue;
      const pts = polyFromSub(sb).map((p) => {
        const pr = new THREE.Vector3(p.x, 0, p.y).project(vw.camera);
        return P(((pr.x + 1) / 2) * r.width, ((1 - pr.y) / 2) * r.height);
      });
      if (sb.closed) pts.push(pts[0]);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], ab = vsub(b, a), L2 = ab.x * ab.x + ab.y * ab.y;
        const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((q.x - a.x) * ab.x + (q.y - a.y) * ab.y) / L2)) : 0;
        const d = vdist(q, vadd(a, vmul(ab, t)));
        if (d < bd) { bd = d; best = it.id; }
      }
    }
  }
  return best;
}
// 選んでいるものの範囲（平面図の bbox と高さ）
function selRange() {
  const items = selectedItems();
  if (!items.length) return null;
  const bb = Geo.bbox(items);
  if (!bb) return null;
  let zMin = Infinity, zMax = -Infinity;
  for (const it of items) { const x = extrudeOf(it); const a = x ? x.z0 : 0, b = x ? x.z0 + x.h : 0; zMin = Math.min(zMin, a); zMax = Math.max(zMax, b); }
  return { items, bb, zMin, zMax };
}
// その図の画面での、選んでいるものの枠（px）
function viewBox(id) {
  if (!editable(id)) return null;
  const sr = selRange();
  if (!sr) return null;
  const vw = V3.views[id], r = vw.box.getBoundingClientRect();
  const { bb, zMin, zMax } = sr;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const x of [bb.x, bb.x + bb.w]) for (const y of [bb.y, bb.y + bb.h]) for (const z of [zMin, zMax]) {
    const pr = new THREE.Vector3(x, z, y).project(vw.camera);
    const sx = ((pr.x + 1) / 2) * r.width, sy = ((1 - pr.y) / 2) * r.height;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return { x0, x1, y0, y1, ...sr };
}
const VB_HANDLES = (b) => {
  const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  // 平らなもの（高さ 0）は上の取っ手だけ（引き上げると押し出し）
  const flat = b.y1 - b.y0 < 1;
  const hs = { n: [mx, b.y0], e: [b.x1, my], w: [b.x0, my] };
  if (!flat) Object.assign(hs, { nw: [b.x0, b.y0], ne: [b.x1, b.y0], sw: [b.x0, b.y1], se: [b.x1, b.y1], s: [mx, b.y1] });
  return hs;
};
// 枠と取っ手を描く（canvas の上の SVG）
function drawViewBox(id) {
  const svg = V3.views[id].box.querySelector('.vover');
  const b = viewBox(id);
  if (!b || S.hideEdges) { svg.innerHTML = ''; return; }
  const col = findItem(b.items[0].id).layer.color;
  let h = `<rect x="${b.x0}" y="${b.y0}" width="${Math.max(0, b.x1 - b.x0)}" height="${Math.max(0, b.y1 - b.y0)}" fill="none" stroke="${col}" stroke-width="1"/>`;
  for (const [x, y] of Object.values(VB_HANDLES(b))) h += `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#fff" stroke="${col}" stroke-width="1"/>`;
  svg.innerHTML = h;
}
function hitViewHandle(id, q) {
  const b = viewBox(id);
  if (!b) return null;
  let best = null, bd = 6;
  for (const [k, [x, y]] of Object.entries(VB_HANDLES(b))) { const d = Math.hypot(x - q.x, y - q.y); if (d < bd) { bd = d; best = k; } }
  return best;
}
const insideViewBox = (id, q) => { const b = viewBox(id); return !!b && q.x >= b.x0 - 3 && q.x <= b.x1 + 3 && q.y >= b.y0 - 3 && q.y <= b.y1 + 3; };

// 吸着する高さ：ほかの立体の上と下、床（0）
function snapHeights(exclude) {
  const hs = [0];
  for (const it of visibleSolids()) if (!exclude.has(it.id)) hs.push(it.x3d.z0, it.x3d.z0 + it.x3d.h);
  return hs;
}
function snapZ(d, edges, dz, e) {
  d.snapZ = null;
  if (e.ctrlKey) return dz;   // Ctrl で吸着しない
  let best = null, bd = SNAP_PX / V3.scale;
  for (const base of edges) for (const z of d.snaps) { const diff = z - (base + dz); if (Math.abs(diff) < bd) { bd = Math.abs(diff); best = { diff, z }; } }
  if (best) { d.snapZ = best.z; return dz + best.diff; }
  return dz;
}
function startViewXf(id, kind, handle, q) {
  const sr = selRange();
  if (!sr) return null;
  return {
    type: 'vxf', kind, handle, view: id, s: q, sr, moved: false,
    subs: snapshotSel(),
    x3d: new Map(sr.items.map((it) => [it.id, it.x3d ? { ...it.x3d } : null])),
    snaps: snapHeights(new Set(sr.items.map((it) => it.id))),
  };
}
function moveViewXf(d, q, e) {
  let dx = q.x - d.s.x, dy = q.y - d.s.y;
  if (!d.moved && Math.hypot(dx, dy) < 3) return;
  d.moved = true;
  const sc = V3.scale, ax = hAxis(d.view), sg = hSign(d.view);
  const { bb, zMin, zMax, items } = d.sr;
  restoreFrom(d.subs);
  for (const it of items) { const o = d.x3d.get(it.id); if (o) it.x3d = { ...o }; else delete it.x3d; }
  let tip = '';
  if (d.kind === 'move') {
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const du = (dx / sc) * sg;                 // 平面図での動き（その図の横の向き）
    let dz = -dy / sc;
    const solids = items.filter((it) => d.x3d.get(it.id));
    if (solids.length && dz) dz = snapZ(d, [zMin, zMax], dz, e);
    else dz = solids.length ? dz : 0;
    const f = ax === 'x' ? (p) => P(p.x + du, p.y) : (p) => P(p.x, p.y + du);
    items.forEach((it) => mapItem(it, f));
    for (const it of solids) it.x3d.z0 += dz;
    tip = `${ax === 'x' ? '横' : '奥行き'} ${r2(du)} pt　高さ ${r2(dz)} pt`;
  } else {
    const h = d.handle;
    const hasE = h.includes('e'), hasW = h.includes('w'), hasN = h.includes('n'), hasS = h.includes('s');
    // 横：画面の左右の端を、平面図の座標にする
    const lo = ax === 'x' ? bb.x : bb.y, hi = ax === 'x' ? bb.x + bb.w : bb.y + bb.h, span = hi - lo;
    // 画面の右の端が平面図のどちらか（側面図は手前＝ y の大きい方が左）
    const rightV = sg > 0 ? hi : lo, leftV = sg > 0 ? lo : hi;
    let kx = 1, aU = null;
    if ((hasE || hasW) && span > 1e-9) {
      const move = (dx / sc) * sg;   // 動かす端の、平面図での動き
      if (hasE) { aU = e.altKey ? (lo + hi) / 2 : leftV; const edge = rightV + move; kx = (edge - aU) / (rightV - aU); }
      else { aU = e.altKey ? (lo + hi) / 2 : rightV; const edge = leftV + move; kx = (edge - aU) / (leftV - aU); }
    }
    // 縦：高さ
    let kz = 1, aZ = null, create = false, dzc = 0;
    const zs = zMax - zMin;
    if (hasN || hasS) {
      let dz = -dy / sc;
      if (zs < 1e-6) {
        // 平らなもの：上の取っ手を引き上げると押し出し
        if (hasN) { dz = snapZ(d, [zMax], dz, e); create = true; dzc = Math.max(0.1, dz); }
      } else if (hasN) {
        aZ = e.altKey ? (zMin + zMax) / 2 : zMin;
        dz = snapZ(d, [zMax], dz, e);
        kz = (zMax + dz - aZ) / (zMax - aZ);
      } else {
        aZ = e.altKey ? (zMin + zMax) / 2 : zMax;
        dz = snapZ(d, [zMin], dz, e);
        kz = (zMin + dz - aZ) / (zMin - aZ);
      }
    }
    // Shift：角の取っ手は縦横の比をそのまま
    if (e.shiftKey && aU != null && aZ != null) { const k = Math.max(Math.abs(kx), Math.abs(kz)); kx = k; kz = k; }
    kx = Math.max(0.01, kx); kz = Math.max(0.001, kz);
    if (aU != null) {
      const f = ax === 'x' ? (p) => P(aU + (p.x - aU) * kx, p.y) : (p) => P(p.x, aU + (p.y - aU) * kx);
      items.forEach((it) => mapItem(it, f));
    }
    if (aZ != null) {
      for (const it of items) {
        if (!it.x3d) continue;
        const z0 = aZ + (it.x3d.z0 - aZ) * kz, z1 = aZ + (it.x3d.z0 + it.x3d.h - aZ) * kz;
        it.x3d = { z0: Math.min(z0, z1), h: Math.max(0.1, Math.abs(z1 - z0)) };
      }
    }
    if (create) for (const it of items) if (it.subs.some((sb) => sb.closed && sb.nodes.length >= 2)) it.x3d = { z0: zMin, h: dzc };
    const nr = selRange();
    const w = ax === 'x' ? nr.bb.w : nr.bb.h;
    tip = `${ax === 'x' ? '幅' : '奥行き'} ${r2(w)} pt　高さ ${r2(nr.zMax - nr.zMin)} pt`;
  }
  d.tip = tip + (d.snapZ != null ? '　（吸着）' : '');
  render(); updateUI();
}
function endViewXf(d) {
  if (!d.moved) return;
  const x = selectedItems().find((it) => it.x3d);
  if (x) S.lastExH = x.x3d.h;
  render(); commit();
}

// ---- 正面図・側面図のマウス ----
// Space＋ドラッグ（中ボタンでも）：手のひら
// Shift＋Space＋ドラッグ：3D 手のひら（回す）。ドラッグ中に Shift を押していると 15° ずつ
// ダブルクリック：回したのを元に戻す／Alt＋ホイール：拡大・縮小／ホイール：上下（Ctrl・Shift で左右）
// クリック：立体・線を選ぶ（Shift で追加・外す）。何もないところをクリックで選択解除
for (const v of VIEWS) {
  const el = $(v.id);
  const local = (e) => { const r = el.getBoundingClientRect(); return P(e.clientX - r.left, e.clientY - r.top); };
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    closeMenus();
    const q = local(e);
    const grab = () => { try { el.setPointerCapture(e.pointerId); } catch (_) { /* つかめなくても動かす */ } };
    // 虫眼鏡：Ctrl+Space（Alt も押すと縮小）、またはズームツール（Z）。クリックした所を中心に
    const zoomTool = e.button === 0 && ((S.spaceDown && (e.ctrlKey || e.metaKey)) || (!S.spaceDown && S.tool === 'zoom'));
    if (zoomTool) {
      e.preventDefault();
      zoomView3d(v.id, q.x, q.y, V3.k * (e.altKey ? 0.5 : 2));
      return;
    }
    if (e.button === 0 && S.spaceDown && e.shiftKey) {
      e.preventDefault(); grab();
      drag = { type: 'orbit', s: q, o: { ...V3.rot[v.id] } };
      updateCursor();
      return;
    }
    if (e.button === 1 || (e.button === 0 && (S.spaceDown || S.tool === 'hand'))) {
      e.preventDefault(); grab();
      drag = { type: 'pan', s: q, o: P(V3.pan[v.id].x, V3.pan[v.id].y) };
      updateCursor();
      return;
    }
    if (e.button !== 0) return;
    if (S.drawing) endDrawing();
    // 取っ手：伸び縮み
    const hd = !e.shiftKey && hitViewHandle(v.id, q);
    if (hd) { grab(); drag = startViewXf(v.id, 'scale', hd, q); return; }
    // 立体・線をクリック
    const id = hitView(v.id, q.x, q.y) || hitFlat(v.id, q);
    const f = id && findItem(id);
    if (f) {
      const target = topOf(f.item);
      const ls = leaves([target]);
      const wasSel = ls.every((it) => S.sel.has(it.id) && isFullySel(it));
      if (e.shiftKey && wasSel) { ls.forEach((it) => S.sel.delete(it.id)); afterSelect(); render(); updateUI(); return; }
      if (e.shiftKey || !wasSel) selectNode(target, e.shiftKey);
      afterSelect(); render(); updateUI();
      if (editable(v.id)) { grab(); drag = startViewXf(v.id, 'move', null, q); }
      return;
    }
    // 枠の中（何もないところでも）：移動
    if (!e.shiftKey && insideViewBox(v.id, q)) { grab(); drag = startViewXf(v.id, 'move', null, q); return; }
    if (!e.shiftKey) S.sel.clear();
    afterSelect(); render(); updateUI();
  });
  el.addEventListener('pointermove', (e) => {
    const q = local(e);
    if (!drag) { hoverView(v.id, q); return; }
    if (drag.type === 'vxf') { moveViewXf(drag, q, e); showTip(v.id, q, drag.moved ? drag.tip : ''); return; }
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
  const end = () => {
    if (!drag) return;
    if (drag.type === 'vxf') { endViewXf(drag); showTip(v.id, null, ''); }
    drag = null; updateCursor();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', () => { if (!drag) el.dataset.hover = ''; updateViewsCursor(); });
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
// カーソル：Space で手のひら、Shift＋Space で回す、取っ手の上で伸び縮みの矢印、ふだんは黒い矢印
const HANDLE_CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
function updateViewsCursor() {
  for (const v of VIEWS) {
    const el = $(v.id), hv = el.dataset.hover;
    const zoom = (S.spaceDown && S.keys.ctrl) || (!S.spaceDown && S.tool === 'zoom');
    el.style.cursor = zoom ? (S.keys.alt ? 'zoom-out' : 'zoom-in')
      : S.spaceDown ? (S.keys.shift ? ROTATE_CURSORS.ne : 'grab')
      : S.tool === 'hand' ? 'grab'
      : HANDLE_CURSORS[hv] || SELECT_CURSOR;
  }
}
function hoverView(id, q) {
  if (!V3.ok) return;
  $(id).dataset.hover = S.spaceDown || S.tool === 'zoom' || S.tool === 'hand' ? '' : hitViewHandle(id, q) || '';
  updateViewsCursor();
}
// ドラッグ中の数値
function showTip(id, q, text) {
  const tip = V3.views[id] && V3.views[id].box.querySelector('.vtip');
  if (!tip) return;
  tip.hidden = !text || !q;
  if (tip.hidden) return;
  tip.textContent = text;
  tip.style.left = q.x + 14 + 'px'; tip.style.top = q.y + 10 + 'px';
}
