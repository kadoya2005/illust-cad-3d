'use strict';
// イラレCAD：表示（座標変換・描画・定規・グリッド・選択の表示）

// ================= 表示 =================
function evScr(e) { const r = stage.getBoundingClientRect(); return P(e.clientX - r.left, e.clientY - r.top); }
const toDoc = (s) => P((s.x - view.x) / view.z, (s.y - view.y) / view.z);
const toScr = (p) => P(p.x * view.z + view.x, p.y * view.z + view.y);
const tol = () => 5 / view.z;
function stageCenter() { const r = stage.getBoundingClientRect(); return P(r.width / 2, r.height / 2); }

function zoomAt(sp, nz) {
  nz = Math.min(64, Math.max(0.03125, nz));
  const d = toDoc(sp);
  view.z = nz; view.x = sp.x - d.x * nz; view.y = sp.y - d.y * nz;
  renderView();
}
function zoomStep(dir, sp) {
  const nz = dir > 0 ? ZOOMS.find((z) => z > view.z * 1.001) || 64 : [...ZOOMS].reverse().find((z) => z < view.z / 1.001) || ZOOMS[0];
  zoomAt(sp || stageCenter(), nz);
}
function fitView() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const m = 40 + (S.rulers ? RULER : 0);
  const z = Math.max(0.03125, Math.min((r.width - 2 * m) / doc.width, (r.height - 2 * m) / doc.height));
  view.z = z; view.x = (r.width - doc.width * z) / 2; view.y = (r.height - doc.height * z) / 2;
  if (typeof fitViews3d === 'function') fitViews3d();   // 正面図・側面図も元の大きさに
  renderView();
}

function pathEl(it) {
  const d = Geo.itemD(it);
  if (S.outline) return `<path data-id="${it.id}" d="${d}" fill="none" fill-rule="${it.rule}" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  return `<path data-id="${it.id}" d="${d}" fill="${it.fill || 'none'}" fill-rule="${it.rule}" stroke="${it.stroke || 'none'}" stroke-width="${it.sw}" stroke-miterlimit="10"/>`;
}
function renderNodes(arr) {
  let h = '';
  for (const n of arr) { if (n.hidden) continue; h += isGroup(n) ? '<g>' + renderNodes(n.children) + '</g>' : pathEl(n); }
  return h;
}
function renderArt() {
  let h = '';
  for (const L of doc.layers) if (L.visible) h += '<g>' + renderNodes(L.items) + '</g>';
  art.innerHTML = h;
  S.snapCache = null;
  renderViews();   // 正面図・側面図も描き直す
}
function renderGrid() {
  if (!S.grid) { gridG.innerHTML = ''; return; }
  const r = stage.getBoundingClientRect();
  const a = toDoc(P(0, 0)), b = toDoc(P(r.width, r.height));
  let major = GRID_MAJOR;
  while (major * view.z < 12) major *= 2;
  const minor = GRID_MAJOR / GRID_DIV;
  const showMinor = major === GRID_MAJOR && minor * view.z >= 6;
  const step = showMinor ? minor : major;
  let h = '';
  const line = (x1, y1, x2, y2, isMajor) => { h += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${isMajor ? '#c4c4c4' : '#e8e8e8'}" stroke-width="1" vector-effect="non-scaling-stroke"/>`; };
  const isMaj = (v) => Math.abs(v / major - Math.round(v / major)) < 1e-6;
  const lines = [];
  for (let v = Math.floor(a.x / step) * step; v <= b.x; v += step) lines.push(['x', v, isMaj(v)]);
  for (let v = Math.floor(a.y / step) * step; v <= b.y; v += step) lines.push(['y', v, isMaj(v)]);
  // 細い線を先に、太い線を後に描く
  lines.sort((p, q) => p[2] - q[2]).forEach(([ax, v, m]) => (ax === 'x' ? line(v, a.y, v, b.y, m) : line(a.x, v, b.x, v, m)));
  gridG.innerHTML = h;
}
function drawRuler(cv, w, h, axis) {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, w, h);
  const z = view.z, off = axis === 'x' ? view.x : view.y, len = axis === 'x' ? w : h;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const major = steps.find((s) => s * z >= 50) || 20000;
  const div = (major * z) / 10 >= 5 ? 10 : (major * z) / 5 >= 5 ? 5 : 2;
  const minor = major / div;
  g.strokeStyle = '#8a8a8a'; g.fillStyle = '#c8c8c8'; g.font = '9px system-ui, sans-serif'; g.lineWidth = 1;
  g.beginPath();
  for (let k = Math.floor(-off / z / minor); k * minor <= (len - off) / z; k++) {
    const v = k * minor, s = Math.round(v * z + off) + 0.5;
    const isMaj = k % div === 0;
    const tl = isMaj ? RULER : k % (div / 2) === 0 && div % 2 === 0 ? RULER * 0.45 : RULER * 0.25;
    if (axis === 'x') { g.moveTo(s, RULER); g.lineTo(s, RULER - tl); } else { g.moveTo(RULER, s); g.lineTo(RULER - tl, s); }
    if (isMaj) {
      const label = String(Math.round(v));
      if (axis === 'x') g.fillText(label, s + 2, 9);
      else { g.save(); g.translate(2, s + 2); g.rotate(Math.PI / 2); g.fillText(label, 0, -1); g.restore(); }
    }
  }
  g.stroke();
  g.strokeStyle = '#1e1e1e'; g.beginPath();
  if (axis === 'x') { g.moveTo(0, RULER - 0.5); g.lineTo(w, RULER - 0.5); } else { g.moveTo(RULER - 0.5, 0); g.lineTo(RULER - 0.5, h); }
  g.stroke();
  if (S.mouseScr) {
    g.strokeStyle = '#ff6a6a'; g.beginPath();
    const m = Math.round(axis === 'x' ? S.mouseScr.x : S.mouseScr.y) + 0.5;
    if (axis === 'x') { g.moveTo(m, 0); g.lineTo(m, RULER); } else { g.moveTo(0, m); g.lineTo(RULER, m); }
    g.stroke();
  }
}
function drawRulers() {
  $('stageWrap').classList.toggle('rulers', S.rulers);
  if (!S.rulers) return;
  const r = stage.getBoundingClientRect();
  drawRuler($('rulerTop'), r.width, RULER, 'x');
  drawRuler($('rulerLeft'), RULER, r.height, 'y');
}
function renderView() {
  world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.z})`);
  for (const r of [board, boardEdge]) { r.setAttribute('width', doc.width); r.setAttribute('height', doc.height); }
  $('zoomLabel').textContent = Math.round(view.z * 1000) / 10 + '%';
  renderGrid(); drawRulers(); drawOverlay();
}
function render() { renderArt(); renderView(); }

// キーを押している間だけ切り替わるツール（イラレと同じ）
//   Space → 手のひら／Ctrl+Space → ズーム／Ctrl → 最後に使った選択ツール
//   Alt：アンカー追加 ⇔ アンカー削除（ペン＋Alt のアンカーポイントツールは、ペンの中で扱う）
function tempTool(ctrl, alt) {
  if (S.spaceDown) return ctrl ? 'zoom' : 'hand';
  if (ctrl && !SEL_TOOLS.has(S.tool)) return S.lastSelTool;
  // 選択ツール ⇄ ダイレクト選択ツール：Ctrl を押している間だけ入れ替わる（イラレと同じ）
  if (ctrl && S.tool === 'select') return 'direct';
  if (ctrl && S.tool === 'direct') return 'select';
  if (alt && S.tool === 'addAnchor') return 'deleteAnchor';
  if (alt && S.tool === 'deleteAnchor') return 'addAnchor';
  return S.tool;
}
function displayTool() {
  if (S.drag && S.activeTool) return S.activeTool;
  return tempTool(S.keys.ctrl, S.keys.alt);
}
function effectiveTool(e) { return tempTool(e.ctrlKey || e.metaKey, e.altKey); }

function drawOverlay() {
  const t = displayTool();
  const nodeTool = NODE_TOOLS.has(t);
  const sp = toScr;
  const r = stage.getBoundingClientRect();
  let h = '';
  S.handleHits = []; S.bboxHits = [];

  // ガイド
  if (S.showGuides) {
    doc.guides.forEach((g, i) => {
      const col = i === S.selGuide ? '#0060ff' : GUIDE_COLOR;
      if (g.axis === 'x') { const x = sp(P(g.v, 0)).x; h += `<line x1="${x}" y1="0" x2="${x}" y2="${r.height}" stroke="${col}" stroke-width="1"/>`; }
      else { const y = sp(P(0, g.v)).y; h += `<line x1="0" y1="${y}" x2="${r.width}" y2="${y}" stroke="${col}" stroke-width="1"/>`; }
    });
  }
  if (S.drag && S.drag.type === 'guideNew' && S.drag.v != null) {
    const g = S.drag;
    if (g.axis === 'x') { const x = sp(P(g.v, 0)).x; h += `<line x1="${x}" y1="0" x2="${x}" y2="${r.height}" stroke="${GUIDE_COLOR}" stroke-dasharray="4 3"/>`; }
    else { const y = sp(P(0, g.v)).y; h += `<line x1="0" y1="${y}" x2="${r.width}" y2="${y}" stroke="${GUIDE_COLOR}" stroke-dasharray="4 3"/>`; }
  }

  // マウスの下にあるもの（選択ツールではグループ全体）
  if (S.hover && !S.drag) {
    const f = findItem(S.hover);
    if (f) {
      const list = t === 'select' ? leaves([topOf(f.item)]) : [f.item];
      for (const it of list) if (!S.sel.has(it.id)) h += `<path d="${Geo.itemD(it, sp)}" fill="none" stroke="${f.layer.color}" stroke-width="1.5"/>`;
    }
  }
  const items = selectedItems();
  for (const it of S.hideEdges ? [] : items) {
    const col = findItem(it.id).layer.color;
    const set = S.sel.get(it.id);
    h += `<path d="${Geo.itemD(it, sp)}" fill="none" stroke="${col}" stroke-width="1"/>`;
    if (nodeTool) {
      it.subs.forEach((sb, s) => {
        const n = sb.nodes, L = n.length, show = new Set();
        for (let i = 0; i < L; i++) {
          if (!set.has(key(s, i))) continue;
          show.add(i + '|hin'); show.add(i + '|hout');
          if (i > 0 || sb.closed) show.add((i - 1 + L) % L + '|hout');
          if (i < L - 1 || sb.closed) show.add((i + 1) % L + '|hin');
        }
        // つかんだ線（セグメント）の両端の方向線
        const g = S.segSel;
        if (g && g.id === it.id && g.s === s && n[g.seg]) { show.add(g.seg + '|hout'); show.add((g.seg + 1) % L + '|hin'); }
        for (const k of show) {
          const [is, w] = k.split('|');
          const i = +is, nd = n[i], hp = nd[w];
          if (!hp) continue;
          const a = sp(nd), b = sp(hp);
          h += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-width="1"/>`;
          // マウスが乗っている方向線の先は大きく表示（つかめることが分かるように）
          const hov = S.mouseScr && !S.drag && Math.hypot(b.x - S.mouseScr.x, b.y - S.mouseScr.y) <= 8;
          h += `<circle cx="${b.x}" cy="${b.y}" r="${hov ? 5.5 : 3.5}" fill="${col}" stroke="#fff" stroke-width="1"/>`;
          S.handleHits.push({ id: it.id, s, i, which: w, x: b.x, y: b.y });
        }
      });
    }
    it.subs.forEach((sb, s) => sb.nodes.forEach((nd, i) => {
      const a = sp(nd);
      const on = !nodeTool || set.has(key(s, i));
      h += `<rect x="${a.x - 3}" y="${a.y - 3}" width="6" height="6" fill="${on ? col : '#fff'}" stroke="${col}" stroke-width="1"/>`;
    }));
  }

  // バウンディングボックス（選択ツール）
  const moving = S.drag && (S.drag.type === 'move' || S.drag.type === 'xf') && S.drag.moved;
  if (t === 'select' && items.length && !moving && !S.hideEdges) {
    const bb = Geo.bbox(items);
    if (bb) {
      const col = findItem(items[0].id).layer.color;
      const a = sp(P(bb.x, bb.y)), b = sp(P(bb.x + bb.w, bb.y + bb.h));
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      h += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${col}" stroke-width="1"/>`;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const pts = { nw: [a.x, a.y], n: [mx, a.y], ne: [b.x, a.y], e: [b.x, my], se: [b.x, b.y], s: [mx, b.y], sw: [a.x, b.y], w: [a.x, my] };
      for (const [id, [x, y]] of Object.entries(pts)) {
        h += `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#fff" stroke="${col}" stroke-width="1"/>`;
        S.bboxHits.push({ id, x, y });
      }
    }
  }
  // 整列のキーオブジェクト（太い枠）
  if (S.keyId && !S.hideEdges) {
    const f = findItem(S.keyId);
    const bb = f && Geo.bbox(leaves([f.item]));
    if (bb) {
      const a = sp(P(bb.x, bb.y)), b = sp(P(bb.x + bb.w, bb.y + bb.h));
      h += `<rect x="${a.x - 2}" y="${a.y - 2}" width="${b.x - a.x + 4}" height="${b.y - a.y + 4}" fill="none" stroke="${f.layer.color}" stroke-width="3"/>`;
    }
  }
  // 回転・リフレクト・拡大縮小の基準点
  if (XF_TOOLS.has(t) && items.length) {
    const c = (S.drag && S.drag.c) || xfCenter();
    if (S.drag && S.drag.type === 'xf' && S.drag.moved && t === 'reflect' && S.drag.prm) {
      const a = S.drag.prm.axis, q = sp(c), L = 3000;
      h += `<line x1="${q.x - Math.cos(a) * L}" y1="${q.y - Math.sin(a) * L}" x2="${q.x + Math.cos(a) * L}" y2="${q.y + Math.sin(a) * L}" stroke="#00b3ff" stroke-dasharray="5 4"/>`;
    }
    if (c) {
      const q = sp(c);
      h += `<circle cx="${q.x}" cy="${q.y}" r="5" fill="none" stroke="#00b3ff" stroke-width="1.5"/><path d="M${q.x - 9} ${q.y}h18M${q.x} ${q.y - 9}v18" stroke="#00b3ff" stroke-width="1"/>`;
    }
  }
  if (S.marquee) {
    const a = sp(S.marquee.a), b = sp(S.marquee.b);
    h += `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" fill="rgba(79,128,255,0.08)" stroke="#4f80ff" stroke-dasharray="3 3"/>`;
  }
  // ペンのラバーバンド（次の線のプレビュー）
  if (t === 'pen' && S.drawing && !S.drag && S.mouseScr) {
    const sb = drawingSub();
    if (sb) {
      const last = sb.nodes[sb.nodes.length - 1];
      let q = S.keys.shift ? constrain45(last, S.mouse) : S.mouse;
      if (!S.keys.shift && S.snapViz && S.snapViz.p) q = S.snapViz.p;
      const a = sp(last), c1 = sp(last.hout || last), b = sp(q);
      const col = findItem(S.drawing.id).layer.color;
      h += `<path d="M${a.x} ${a.y}C${c1.x} ${c1.y} ${b.x} ${b.y} ${b.x} ${b.y}" fill="none" stroke="${col}" stroke-width="1"/>`;
    }
  }
  // スマートガイド
  if (S.snapViz) {
    for (const [a, b] of S.snapViz.lines) {
      const p1 = sp(a), p2 = sp(b);
      h += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${SMART_COLOR}" stroke-width="1"/>`;
    }
    if (S.snapViz.label && S.snapViz.at) {
      const q = sp(S.snapViz.at);
      h += `<circle cx="${q.x}" cy="${q.y}" r="3" fill="none" stroke="${SMART_COLOR}" stroke-width="1.5"/>`;
      h += `<text x="${q.x + 8}" y="${q.y - 6}" font-size="11" fill="${SMART_COLOR}" stroke="#fff" stroke-width="3" paint-order="stroke">${S.snapViz.label}</text>`;
    }
  }
  if (t === 'pen' && S.penHint && S.mouseScr && !S.drag) {
    h += `<text x="${S.mouseScr.x + 10}" y="${S.mouseScr.y + 18}" font-size="13" font-weight="700" fill="#fff" stroke="#000" stroke-width="2.5" paint-order="stroke">${S.penHint}</text>`;
  }
  overlay.innerHTML = h;
}
