'use strict';
// イラレCAD：展開図を折って組み立てる（試作1）
//
// 面    ：平面図に描いた閉じたパス（押し出していないもの）。1つめのサブパスが外形
// 折り線：2つの面が「両端が同じ、まっすぐな辺」を共有しているところ（0.01mm までのずれは同じとみなす）
// 角度  ：it.fold = { deg } がその面の折り角度。土台の側の面に対して、上（表）へ起こす向きが +
// 位置  ：面の 3D の位置（it.plane）は、角度から毎回計算する。保存しておくのは角度だけでよい
// 土台  ：つながっている面のまとまりごとに1つ。いちばん多くの面とつながっている面（同じなら大きい方）
//         あとで「重し（Ctrl+2）」で選べるようにする（it.fold.fixed）
// 平面図には展開図のまま出す（形を直せる）。正面図・側面図に組み立てた形が出る

const FOLD_TOL = 0.01;   // mm

// 折りたたみの面になれるパスか（正面図・側面図でペンで描いたパスは除く）
function isFoldFace(it) {
  if (!it || isGroup(it) || (it.x3d && it.x3d.h > 0)) return false;
  if (it.plane && !it.fold) return false;
  const sb = it.subs && it.subs[0];
  return !!sb && sb.closed && sb.nodes.length >= 3;
}
// 外形のまっすぐな辺（方向線のない辺）
function foldEdges(it) {
  const n = it.subs[0].nodes, L = n.length, out = [];
  for (let i = 0; i < L; i++) {
    const a = n[i], b = n[(i + 1) % L];
    if (a.hout || b.hin || vdist(a, b) < FOLD_TOL) continue;
    out.push({ a: P(a.x, a.y), b: P(b.x, b.y) });
  }
  return out;
}
const faceArea = (it) => Math.abs(ringArea(it.subs[0].nodes));

// 面のつながり（折り線）を探す
function foldGraph() {
  const faces = leaves(doc.layers.flatMap((L) => L.items)).filter(isFoldFace);
  const pk = (p) => Math.round(p.x / FOLD_TOL) + ',' + Math.round(p.y / FOLD_TOL);
  const byEdge = new Map();
  for (const f of faces) for (const e of foldEdges(f)) {
    const ka = pk(e.a), kb = pk(e.b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    if (!byEdge.has(k)) byEdge.set(k, []);
    byEdge.get(k).push({ f, e });
  }
  const adj = new Map(faces.map((f) => [f.id, []]));
  for (const list of byEdge.values()) {
    // ちょうど2つの面が共有する辺だけが折り線（3つ以上重なるところは、どれとどれか決まらないので使わない）
    if (list.length !== 2 || list[0].f === list[1].f) continue;
    const [x, y] = list;
    adj.get(x.f.id).push({ to: y.f, e: x.e });
    adj.get(y.f.id).push({ to: x.f, e: x.e });
  }
  return { faces, adj };
}
// つながっている面のまとまりごとに、土台からの木にする
function foldTrees() {
  const { faces, adj } = foldGraph();
  const seen = new Set(), trees = [];
  for (const f0 of faces) {
    if (seen.has(f0.id)) continue;
    const comp = [], st = [f0];
    seen.add(f0.id);
    while (st.length) { const f = st.pop(); comp.push(f); for (const a of adj.get(f.id)) if (!seen.has(a.to.id)) { seen.add(a.to.id); st.push(a.to); } }
    const deg = (f) => adj.get(f.id).length;
    const root = comp.find((f) => f.fold && f.fold.fixed)
      || comp.reduce((b, f) => (deg(f) > deg(b) || (deg(f) === deg(b) && faceArea(f) > faceArea(b) + 1e-9) ? f : b));
    // 土台から近い順にたどる（親の面と、親とのあいだの折り線）
    const parent = new Map(), order = [root], vis = new Set([root.id]);
    for (let i = 0; i < order.length; i++) {
      const f = order[i];
      for (const a of adj.get(f.id)) if (!vis.has(a.to.id)) { vis.add(a.to.id); parent.set(a.to.id, { face: f, e: a.e }); order.push(a.to); }
    }
    trees.push({ root, comp, parent, order });
  }
  return trees;
}

// 面の座標の取り方（plane）を、折り線のまわりに deg 度まわす。親の面の表（法線）の側へ起こす向きが +
function rotateFrame(pf, e, face, deg) {
  const A = toWorld(pf, e.a), B = toWorld(pf, e.b);
  const a = [A.x, A.y, A.z];
  let k = v3sub([B.x, B.y, B.z], a);
  k = v3mul(k, 1 / (v3len(k) || 1));
  // 面の真ん中が、折り線から見てどちら側か
  const ns = face.subs[0].nodes;
  const c2 = P(ns.reduce((s, n) => s + n.x, 0) / ns.length, ns.reduce((s, n) => s + n.y, 0) / ns.length);
  const C = toWorld(pf, c2), ca = v3sub([C.x, C.y, C.z], a);
  const d = v3sub(ca, v3mul(k, v3dot(k, ca)));
  if (v3dot(v3cross(k, d), planeNormal(pf)) < 0) k = v3mul(k, -1);
  const t = (deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  const rot = (v) => v3add(v3add(v3mul(v, cs), v3mul(v3cross(k, v), sn)), v3mul(k, v3dot(k, v) * (1 - cs)));
  return { o: v3add(a, rot(v3sub(pf.o, a))), u: rot(pf.u), v: rot(pf.v) };
}
const isIdentityFrame = (pl) => v3len(pl.o) < 1e-9 && v3len(v3sub(pl.u, [1, 0, 0])) < 1e-9 && v3len(v3sub(pl.v, [0, 1, 0])) < 1e-9;

// 角度から、面の 3D の位置（it.plane）を決め直す。描き直しのたびに呼ぶ
// 板として見せる面（ほかの面と折り線でつながっている面）
const FOLD_SHOW = new Set();
// 折れる面ごとに：親の面の座標の取り方（pf）と折り線（e）。ドラッグで折るときに使う
const FOLD_INFO = new Map();
function applyFolds() {
  FOLD_SHOW.clear(); FOLD_INFO.clear();
  for (const t of foldTrees()) {
    if (t.comp.length > 1) t.comp.forEach((f) => FOLD_SHOW.add(f.id));   // つながった面は、開いていても板で見せる（正面図・側面図でつかめるように）
    const frames = new Map([[t.root.id, PLANE_TOP]]);
    for (const f of t.order) {
      if (f === t.root) continue;
      const pr = t.parent.get(f.id), pf = frames.get(pr.face.id);
      const deg = (f.fold && f.fold.deg) || 0;
      frames.set(f.id, deg ? rotateFrame(pf, pr.e, f, deg) : pf);
      FOLD_INFO.set(f.id, { pf, e: pr.e });
    }
    for (const f of t.comp) {
      const fr = frames.get(f.id) || PLANE_TOP;
      if (isIdentityFrame(fr)) { if (f.plane) delete f.plane; }
      else { f.plane = { o: fr.o.map(fmt6), u: fr.u.map(fmt6), v: fr.v.map(fmt6) }; f.fold = f.fold || { deg: 0 }; }
    }
  }
}
const fmt6 = (n) => { const r = Math.round(n * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };

// 土台の面か（土台は角度を入れても動かない）
function foldRootIds() { return new Set(foldTrees().filter((t) => t.comp.length > 1).map((t) => t.root.id)); }
// 選んでいる面のうち、折れるもの・土台
function selectedFoldFaces() {
  const trees = foldTrees(), info = new Map();
  for (const t of trees) for (const f of t.comp) info.set(f.id, { tree: t, root: f === t.root, alone: t.comp.length < 2 });
  const sel = leaves(selectedTops().map((t) => t.node)).filter((it) => info.has(it.id));
  return { movable: sel.filter((it) => !info.get(it.id).root && !info.get(it.id).alone), roots: sel.filter((it) => info.get(it.id).root && !info.get(it.id).alone), alone: sel.filter((it) => info.get(it.id).alone) };
}
// 選んだ面を deg 度に折る
function setFold(deg) {
  if (!isFinite(deg)) return;
  const { movable, roots, alone } = selectedFoldFaces();
  if (!movable.length) {
    toast(roots.length ? '土台の面は動きません（ほかの面を選んでください）' : alone.length ? 'この面は、ほかの面と辺がつながっていません（辺をぴったり重ねてください）' : '折る面を選んでください');
    return;
  }
  deg = Math.max(-180, Math.min(180, deg));
  for (const it of movable) it.fold = { ...(it.fold || {}), deg };
  render(); commit();
}
// 全部開く（展開図に戻す）
function unfoldAll() {
  let n = 0;
  for (const it of leaves(doc.layers.flatMap((L) => L.items))) if (it.fold && it.fold.deg) { it.fold = { ...it.fold, deg: 0 }; n++; }
  if (!n) return;
  render(); commit();
}

// ---- 正面図・側面図で、面をドラッグして起こす ----
// 面の真ん中が、マウスにいちばん近づく角度を探す（面がマウスについてくる）
// 真横から見ていると、同じ位置になる角度が2つあることがあるので、今の角度に近い方を選ぶ
const faceCenter2 = (it) => { const ns = it.subs[0].nodes; return P(ns.reduce((s, n) => s + n.x, 0) / ns.length, ns.reduce((s, n) => s + n.y, 0) / ns.length); };
function foldAngleToward(it, toScreen, q, prevDeg) {
  const fi = FOLD_INFO.get(it.id);
  if (!fi) return prevDeg;
  const c2 = faceCenter2(it);
  const cost = (deg) => { const s = toScreen(toWorld(rotateFrame(fi.pf, fi.e, it, deg), c2)); return Math.hypot(s.x - q.x, s.y - q.y) + Math.abs(deg - prevDeg) * 0.02; };
  let best = prevDeg, bc = cost(prevDeg);
  for (let d = -180; d <= 180; d += 2) { const c = cost(d); if (c < bc) { bc = c; best = d; } }
  for (let d = best - 2; d <= best + 2; d += 0.1) { const c = cost(d); if (c < bc) { bc = c; best = d; } }
  return Math.max(-180, Math.min(180, best));
}
// 吸着：0°・±90°・±180° の近く（4° 以内）に吸い付く。Shift で 15° ずつ
function snapFoldDeg(deg, shift) {
  if (shift) return Math.round(deg / 15) * 15;
  for (const s of [0, 90, -90, 180, -180]) if (Math.abs(deg - s) <= 4) return s;
  return Math.round(deg * 10) / 10;
}
