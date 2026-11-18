'use strict';
// イラレCAD：正面図・側面図（右側の2枚）
// 遠近のない見え方（三面図）。正面図は手前（平面図の下側）から、側面図は右から見る
//   正面図：横＝x、縦＝高さ z
//   側面図：横＝奥行き（左が手前）、縦＝高さ z

const VIEWS = [
  { id: 'viewFront', name: '正面図', u: (p) => p.x, depth: (p) => p.y, eps: P(0, 0.5) },
  { id: 'viewSide', name: '側面図', u: (p) => -p.y, depth: (p) => p.x, eps: P(0.5, 0) },
];

// 表示の拡大率（2枚共通）と、それぞれのずらし量。Ctrl+0 で元に戻る
const V3 = { k: 1, pan: { viewFront: P(0, 0), viewSide: P(0, 0) }, xf: {}, hits: {} };
function fitViews3d() { V3.k = 1; V3.pan.viewFront = P(0, 0); V3.pan.viewSide = P(0, 0); renderViews(); }

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// 押し出しを、それぞれの図で描くための形に（重い計算なので、パスの形が変わったときだけ作り直す）
const solidCache = new Map();
function solidInfo(it) {
  const key = JSON.stringify(it.subs) + it.rule;
  const c = solidCache.get(it.id);
  if (c && c.key === key) return c;
  const shapes = profileShapes(it);
  // 角（とがったアンカー）：その図で見える縦の線になる
  const corners = [];
  for (const sb of it.subs) {
    if (!sb.closed) continue;
    for (const n of sb.nodes) if (!(n.hin && n.hout && isSmoothPair(n))) corners.push(P(n.x, n.y));
  }
  const info = { key, shapes, corners };
  solidCache.set(it.id, info);
  return info;
}

function renderViews() {
  if (document.body.classList.contains('no3d')) return;
  const solids = visibleSolids();
  const flats = visibleLeaves().filter((it) => !extrudeOf(it));
  // 2枚とも同じ縮尺にする（大きさを見比べられるように）
  let zMax = X3D_DEFAULT_H, zMin = 0;
  for (const it of solids) { zMax = Math.max(zMax, it.x3d.z0 + it.x3d.h); zMin = Math.min(zMin, it.x3d.z0); }
  const all = visibleLeaves();
  const bb = all.length ? Geo.bbox(all) : null;
  const xr = [Math.min(0, bb ? bb.x : 0), Math.max(doc.width, bb ? bb.x + bb.w : 0)];
  const yr = [Math.min(0, bb ? bb.y : 0), Math.max(doc.height, bb ? bb.y + bb.h : 0)];
  const ranges = { viewFront: [xr[0], xr[1]], viewSide: [-yr[1], -yr[0]] };
  const zRange = [zMin, zMax];
  let scale = Infinity;
  const boxes = {};
  for (const v of VIEWS) {
    const el = $(v.id);
    const r = el.getBoundingClientRect();
    boxes[v.id] = r;
    const [u0, u1] = ranges[v.id];
    const pad = 24;
    scale = Math.min(scale, (r.width - pad * 2) / Math.max(1, u1 - u0), (r.height - 56) / Math.max(1, zRange[1] - zRange[0]));
  }
  if (!(scale > 0) || !isFinite(scale)) return;
  scale *= V3.k;
  const selIds = new Set(selectedItems().map((it) => it.id));
  for (const v of VIEWS) {
    const el = $(v.id), r = boxes[v.id];
    const [u0, u1] = ranges[v.id];
    const pan = V3.pan[v.id];
    const ox = (r.width - (u1 - u0) * scale) / 2 - u0 * scale + pan.x;
    // 上に名前の分（24px）、下に 16px あけて、高さの範囲を縦の真ん中に置く
    const top = 24 + (r.height - 40 - (zRange[1] - zRange[0]) * scale) / 2 + pan.y;
    const X = (u) => ox + u * scale, Y = (z) => top + (zRange[1] - z) * scale;
    V3.xf[v.id] = { ox, top, scale, zTop: zRange[1] };
    const hits = [];   // クリックで選ぶための四角（手前のものほど後ろに入る）
    let h = '';
    // 床（高さ 0）とアートボードの幅
    const [b0, b1] = v.id === 'viewFront' ? [0, doc.width] : [-doc.height, 0];
    h += `<line x1="0" y1="${Y(0)}" x2="${r.width}" y2="${Y(0)}" stroke="#777" stroke-width="1"/>`;
    h += `<line x1="${X(b0)}" y1="${Y(0)}" x2="${X(b1)}" y2="${Y(0)}" stroke="#fff" stroke-width="3"/>`;
    // 押し出していないパスは、床の上の薄い線
    for (const it of flats) {
      const g = Geo.bbox([it]);
      if (!g) continue;
      const [a, b] = v.id === 'viewFront' ? [g.x, g.x + g.w] : [-(g.y + g.h), -g.y];
      h += `<line x1="${X(a)}" y1="${Y(0) - 1}" x2="${X(b)}" y2="${Y(0) - 1}" stroke="${it.stroke || it.fill || '#999'}" stroke-opacity=".6" stroke-width="2"/>`;
    }
    // 押し出し：奥のものから順に描いて、手前のもので隠す
    const items = solids.map((it) => {
      const inf = solidInfo(it);
      let front = -Infinity;
      inf.shapes.forEach((sh) => sh.outer.forEach((p) => { front = Math.max(front, v.depth(p)); }));
      return { it, inf, front };
    }).sort((a, b) => a.front - b.front);
    for (const { it, inf } of items) {
      const z0 = it.x3d.z0, z1 = z0 + it.x3d.h;
      const sel = selIds.has(it.id);
      const fill = S.outline ? 'none' : it.fill || '#d9d9d9';
      const stroke = sel ? 'var(--accent)' : '#222';
      for (const sh of inf.shapes) {
        let a = Infinity, b = -Infinity;
        sh.outer.forEach((p) => { const u = v.u(p); a = Math.min(a, u); b = Math.max(b, u); });
        h += `<rect x="${X(a)}" y="${Y(z1)}" width="${(b - a) * scale}" height="${(z1 - z0) * scale}" fill="${fill}" stroke="${stroke}" stroke-width="${sel ? 2 : 1}"/>`;
        hits.push({ id: it.id, x0: X(a), x1: X(b), y0: Y(z1), y1: Y(z0) });
      }
      // 見えている角の縦線（角のすぐ手前が形の外なら、こちらを向いた角）
      for (const c of inf.corners) {
        const q = P(c.x + v.eps.x, c.y + v.eps.y);
        if (inf.shapes.some((sh) => pointInPoly(q, sh.outer) && !sh.holes.some((hl) => pointInPoly(q, hl)))) continue;
        const u = v.u(c);
        h += `<line x1="${X(u)}" y1="${Y(z0)}" x2="${X(u)}" y2="${Y(z1)}" stroke="${stroke}" stroke-width="1"/>`;
      }
    }
    V3.hits[v.id] = hits;
    h += `<text x="8" y="16" class="vlabel">${v.name}</text>`;
    if (!solids.length && v.id === 'viewFront') h += `<text x="8" y="34" class="vhint">パスを選んで、パネルの「3D 押し出し」で高さを入れると、ここに立体が出ます</text>`;
    el.innerHTML = h;
  }
}

// ---- 正面図・側面図のマウス ----
// Space＋ドラッグ（中ボタンでも）：手のひら／Alt＋ホイール：拡大・縮小／ホイール：上下（Ctrl・Shift で左右）
// クリック：立体を選ぶ（Shift で追加・外す）。何もないところをクリックで選択解除
function hitView(id, x, y) {
  const hs = V3.hits[id] || [];
  for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (x >= h.x0 - 2 && x <= h.x1 + 2 && y >= h.y0 - 2 && y <= h.y1 + 2) return h.id; }
  return null;
}
function zoomView3d(id, x, y, nk) {
  nk = Math.max(0.1, Math.min(64, nk));
  const f = nk / V3.k;
  // マウスの位置が動かないように、その図のずらし量を直す（もう一方は真ん中を中心に）
  for (const v of VIEWS) {
    const el = $(v.id), r = el.getBoundingClientRect();
    const cx = v.id === id ? x : r.width / 2, cy = v.id === id ? y : r.height / 2;
    const pan = V3.pan[v.id];
    // 描くときの中心（ずらし 0 のときに真ん中に来る点）からの位置で考える
    const mx = cx - r.width / 2 - pan.x, my = cy - (24 + (r.height - 40) / 2) - pan.y;
    V3.pan[v.id] = P(pan.x - mx * (f - 1), pan.y - my * (f - 1));
  }
  V3.k = nk;
  renderViews();
}
for (const v of VIEWS) {
  const el = $(v.id);
  const local = (e) => { const r = el.getBoundingClientRect(); return P(e.clientX - r.left, e.clientY - r.top); };
  let pan = null;
  el.addEventListener('pointerdown', (e) => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    closeMenus();
    const q = local(e);
    if (e.button === 1 || (e.button === 0 && S.spaceDown)) {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* つかめなくても動かす */ }
      pan = { s: q, o: P(V3.pan[v.id].x, V3.pan[v.id].y) };
      updateCursor();
      return;
    }
    if (e.button !== 0) return;
    if (S.drawing) endDrawing();
    const id = hitView(v.id, q.x, q.y);
    const f = id && findItem(id);
    if (f) {
      const target = topOf(f.item);
      const isSel = S.sel.has(id);
      if (e.shiftKey && isSel) leaves([target]).forEach((it) => S.sel.delete(it.id));
      else selectNode(target, e.shiftKey);
    } else if (!e.shiftKey) S.sel.clear();
    afterSelect(); render(); updateUI();
  });
  el.addEventListener('pointermove', (e) => {
    if (!pan) return;
    const q = local(e);
    V3.pan[v.id] = P(pan.o.x + q.x - pan.s.x, pan.o.y + q.y - pan.s.y);
    renderViews();
  });
  const end = () => { if (pan) { pan = null; updateCursor(); } };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
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
// 手のひらのカーソル（Space を押している間）
function updateViewsCursor() {
  const c = S.spaceDown ? 'grab' : 'default';
  for (const v of VIEWS) $(v.id).style.cursor = c;
}
