'use strict';
// イラレCAD：自動テスト（アドレスの最後に ?test を付けて開くと、ここに書いた試験を全部流して結果を出す）
// あなたの書類は使わない：試験のあいだだけ別の書類に入れ替え、終わったら元に戻す（保存も履歴も触らない）

(function () {
  if (!/[?&]test\b/.test(location.search)) return;

  const sq = (id, x, y, w = 30, h = 30, extra = {}) => ({ id, subs: [{ closed: true, nodes: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => ({ x: a, y: b, hin: null, hout: null, smooth: false })) }], fill: '#cccccc', stroke: '#000000', sw: 0.35, rule: 'nonzero', hidden: false, locked: false, ...extra });
  const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
  const W = (id, p) => { const it = findItem(id).item; return toWorld(planeOf(it), p); };
  const F = (id) => findItem(id).item;
  // 試験用の書類に入れ替える
  const useDoc = (items) => {
    doc = { version: DOC_VERSION, units: 'mm', width: 210, height: 297, guides: [], solids: [], layers: [{ id: 'L', name: 'テスト', color: '#4f80ff', visible: true, locked: false, items }] };
    S.sel.clear(); S.foldHinge = null; S.drawing = null; S.activeLayer = 'L';
    render();
  };
  const cube = () => [sq('bottom', 90, 120), sq('back', 90, 90), sq('lid', 90, 60), sq('front', 90, 150), sq('left', 60, 120), sq('right', 120, 120)];
  const foldCube = () => { for (const n of ['back', 'front', 'left', 'right']) setHingeDeg(F('bottom'), F(n), 90); setHingeDeg(F('back'), F('lid'), 90); render(); };
  const positions = (ids) => ids.map((id) => { const it = F(id); return it.subs[0].nodes.map((n) => { const w = toWorld(planeOf(it), n); return [w.x, w.y, w.z]; }); });
  const maxDiff = (a, b) => { let m = 0; a.forEach((f, i) => f.forEach((p, j) => p.forEach((v, k) => { m = Math.max(m, Math.abs(v - b[i][j][k])); }))); return m; };

  const TESTS = [
    ['立方体の展開図：折り線が5本', () => { useDoc(cube()); return FOLD_HINGES.length === 5; }],
    ['立方体：全部 90° でぴったり閉じる（ふたが高さ 30）', () => {
      useDoc(cube()); foldCube();
      const a = W('lid', P(90, 60)), b = W('lid', P(120, 90));
      return near(a.z, 30) && near(b.z, 30) && near(a.y, 150) && near(b.y, 120);
    }],
    ['長い辺にフラップ2枚：折り線2本、1枚だけ折れる', () => {
      useDoc([sq('panel', 300, 100, 60, 30), sq('f1', 300, 70), sq('f2', 330, 70)]);
      const ok1 = FOLD_HINGES.length === 2 && !findHinge(hingeKey(F('f1'), F('f2')));
      setHingeDeg(F('panel'), F('f1'), 90); render();
      return ok1 && near(W('f1', P(300, 70)).z, 30) && near(W('f2', P(360, 70)).z, 0);
    }],
    ['土台の付け替え（37°・90°・180°）で形が動かない', () => {
      for (const deg of [37, 90, 180]) {
        useDoc(cube());
        setHingeDeg(F('bottom'), F('back'), deg); setHingeDeg(F('back'), F('lid'), deg); setHingeDeg(F('bottom'), F('left'), deg); setHingeDeg(F('bottom'), F('front'), -deg / 2); render();
        const ids = ['bottom', 'back', 'lid', 'front', 'left', 'right'], before = positions(ids);
        startHingeDrag(findHinge(hingeKey(F('back'), F('lid'))), F('front')); render();
        if (maxDiff(before, positions(ids)) > 0.001) return false;
      }
      return true;
    }],
    ['折った箱をその場で複製：元もコピーも折れたまま、動かしても', () => {
      useDoc(cube()); foldCube();
      S.sel.clear(); doc.layers[0].items.forEach((it) => selItem(it, true));
      duplicateSelection(); render();
      const copies = selectedItems(), lid = copies.find((c) => c.subs[0].nodes[0].y === 60);
      copies.forEach((it) => it.subs.forEach((sb) => sb.nodes.forEach((n) => moveNode(n, 100, 0)))); render();
      const c = toWorld(planeOf(lid), P(220, 60)), o = W('lid', P(120, 60));
      return FOLD_HINGES.length === 10 && near(c.z, 30) && near(c.x, 220) && near(o.z, 30);
    }],
    ['保存（.icad）して開き直しても同じ形', () => {
      useDoc(cube()); foldCube(); setHingeDeg(F('bottom'), F('front'), 37); render();
      const ids = ['bottom', 'back', 'lid', 'front', 'left', 'right'], before = positions(ids);
      const text = serializeIcad();
      doc = JSON.parse(text).doc; normalizeDoc(); render();
      return maxDiff(before, positions(ids)) < 1e-4;
    }],
    ['SVG に書き出して読み込み直しても同じ形', () => {
      useDoc(cube()); foldCube(); setHingeDeg(F('bottom'), F('front'), 37); render();
      const ids = ['bottom', 'back', 'lid', 'front', 'left', 'right'], before = positions(ids);
      const r = parseSVG(exportDocSVG(doc));
      doc = { units: 'pt', width: r.width, height: r.height, guides: [], solids: [], layers: r.layers.map((L) => ({ ...L, id: 'L' })) };
      normalizeDoc(); render();
      return maxDiff(before, positions(ids)) < 0.01;
    }],
    ['前の版（pt）の書類は mm に直る', () => {
      doc = { version: 2, units: 'pt', width: 595.28, height: 841.89, guides: [{ axis: 'x', v: 72 }], solids: [], layers: [{ id: 'L', name: 'a', visible: true, locked: false, items: [sq('s', 72, 72, 72, 72, { sw: 1, x3d: { z0: 0, h: 72 } })] }] };
      normalizeDoc();
      const s = doc.layers[0].items[0];
      return doc.units === 'mm' && near(doc.width, 210) && near(doc.height, 297) && near(doc.guides[0].v, 25.4) && near(s.subs[0].nodes[0].x, 25.4) && near(s.x3d.h, 25.4) && near(s.sw, 0.3528, 1e-4);
    }],
    ['移動中に Alt：コピー、離すと移動に戻る', () => {
      useDoc([sq('a', 50, 100, 60, 30), sq('b', 150, 40)]);
      S.sel.clear(); selItem(F('b'), false);
      startMove(P(165, 55), { altKey: false }, false);
      dragMove({ altKey: false, shiftKey: false }, P(165 + 10, 55));
      refreshMoveDrag({ altKey: true, shiftKey: false });
      const n1 = doc.layers[0].items.length, back = F('b').subs[0].nodes[0].x;
      refreshMoveDrag({ altKey: false, shiftKey: false });
      const n2 = doc.layers[0].items.length;
      S.drag = null;
      return n1 === 3 && near(back, 150) && n2 === 2;
    }],
    ['移動の吸着：アンカーがほかの辺の上にぴったり乗る（折り線になる）', () => {
      useDoc([sq('panel', 50, 100, 60, 30), sq('flap', 150, 40)]);
      S.smart = true; S.sel.clear(); selItem(F('flap'), false);
      startMove(P(165, 55), { altKey: false }, false);
      dragMove({ altKey: false, shiftKey: false }, P(165 + (62.3 - 150), 55 + (100.4 - 70)));
      const ok = near(F('flap').subs[0].nodes[2].y, 100, 1e-9) && S.drag.contacts.length === 1;
      S.drag = null;
      return ok;
    }],
    ['回転ハンドル：両側の面に1つずつ、つまんだ側が起きる', () => {
      useDoc(cube());
      const h = findHinge(hingeKey(F('bottom'), F('back')));
      const hs = hingeHandles(h);
      const d = startHingeDrag(h, hs.find((x) => x.face.id === 'back').face);
      // 真上から見て、つまみを折り線（y=120）の真上まで引く → 90°
      const deg = hingeAngleToward(d, hs.find((x) => x.face.id === 'back').p2, (w) => P(w.x, w.y), P(105, 120), [0, 180]);
      return hs.length === 2 && near(deg, 90, 1);
    }],
    ['手で並べて少しずれた面（重なり 0.065mm・すき間 0.15mm）も、縦の辺が折り線になる', () => {
      useDoc([sq('a', 50, 100, 41.6), sq('b', 91.535, 100, 41.6), sq('c', 133.285, 100, 41.6)]);
      const vertical = FOLD_HINGES.every((h) => Math.abs(h.e.a.x - h.e.b.x) < 0.2 && Math.abs(h.e.a.y - h.e.b.y) > 20);
      setHingeDeg(F('a'), F('b'), 90); render();
      return FOLD_HINGES.length === 2 && vertical && Math.abs(W('a', P(50, 100)).z) > 40;
    }],
    ['移動で辺が近づいたら、ぴったり重なって折り線になる（角も合う）', () => {
      useDoc([sq('a', 50, 100), sq('b', 120, 100)]);
      S.sel.clear(); selItem(F('b'), false);
      startMove(P(135, 115), { altKey: false }, false);
      // 左の辺を a の右の辺（x=80）から 0.3mm 右、0.4mm 下へ
      dragMove({ altKey: false, shiftKey: false }, P(135 - 39.7, 115.4));
      const n = F('b').subs[0].nodes[0], ok = near(n.x, 80, 1e-9) && near(n.y, 100, 1e-9) && S.drag.contacts.length === 1;
      S.drag = null;
      return ok;
    }],
    ['少し傾いた辺：両端がそろうときだけ吸い付く（1° は吸い付かない・0.2° は折り線になる）', () => {
      // b の左の辺（a の右の辺 x=80 から 0.3mm 右）を、左上の角を中心に少し傾けて置き、辺の吸着が働くか・折り線になるかを見る
      const tilted = (deg) => {
        const r = (deg * Math.PI) / 180, b = sq('b', 80.3, 100, 30, 40);
        b.subs[0].nodes[3].x = 80.3 + Math.sin(r) * 40; b.subs[0].nodes[3].y = 100 + Math.cos(r) * 40;
        useDoc([sq('a', 50, 100, 30, 40), b]);
        const c = foldEdgeSnap(new Set(['b']), 8 / inputScale());
        if (c) { F('b').subs[0].nodes.forEach((n) => moveNode(n, c.x, c.y)); render(); }
        return { edge: !!c, x: F('b').subs[0].nodes[0].x, hinge: FOLD_HINGES.length };
      };
      const big = tilted(1), small = tilted(0.2);
      // 1°：ずらしても両端が合わないので吸い付かない。0.2°：吸い付いて折り線になる
      return !big.edge && big.hinge === 0 && small.edge && near(small.x, 80, 0.1) && small.hinge === 1;
    }],
    ['中断したら元の角度に戻る（控えと戻し）', () => {
      useDoc(cube()); foldCube();
      const snap = snapshotFolds();
      setHingeDeg(F('bottom'), F('back'), 10); unfoldAll();
      restoreFolds(snap); render();
      return near(W('lid', P(90, 60)).z, 30);
    }],
    ['立体を正面図で 90° ずつ 4 回まわすと、ぴったり元に戻る', () => {
      useDoc([sq('box', 90, 120, 30, 30, { x3d: { z0: 5, h: 10 } })]);
      const before = JSON.stringify({ subs: F('box').subs, x3d: F('box').x3d });
      for (let i = 0; i < 4; i++) rotateItems3d([F('box')], 'viewFront', [105, 135, 10], Math.PI / 2);
      return !F('box').plane && JSON.stringify({ subs: F('box').subs, x3d: F('box').x3d }) === before;
    }],
    ['正面図で 90° まわした立体：向き・位置・体積・STL の面の向きが正しい', () => {
      useDoc([sq('box', 90, 120, 30, 30, { x3d: { z0: 5, h: 10 } })]);
      const vol = (tris) => tris.reduce((a, [p, q, r]) => a + v3dot(p, v3cross(q, r)) / 6, 0);
      const v0 = vol(solidTriangles(F('box')));
      rotateItems3d([F('box')], 'viewFront', [105, 135, 10], Math.PI / 2);
      const r = worldRange([F('box')]), tris = solidTriangles(F('box'));
      const xs = tris.flat().map((p) => p[0]), zs = tris.flat().map((p) => p[2]);
      // 幅 30・高さ 10 → 幅 10・高さ 30。中心 (105, 10) のまま
      return near(r.x0, 100) && near(r.x1, 110) && near(r.z0, -5) && near(r.z1, 25) && near(r.y0, 120) && near(r.y1, 150)
        && near(Math.min(...xs), 100) && near(Math.max(...zs), 25) && tris.length === 12 && near(v0, 9000) && near(vol(tris), 9000);
    }],
    ['側面図で 30° まわしても、体積と面の向きはそのまま。もう一度 -30° で元に戻る', () => {
      useDoc([sq('box', 90, 120, 30, 20, { x3d: { z0: 0, h: 10 } })]);
      const vol = (tris) => tris.reduce((a, [p, q, r]) => a + v3dot(p, v3cross(q, r)) / 6, 0);
      const before = JSON.stringify({ subs: F('box').subs, x3d: F('box').x3d });
      rotateItems3d([F('box')], 'viewSide', [105, 130, 5], Math.PI / 6);
      const ok1 = !!F('box').plane && near(vol(solidTriangles(F('box'))), 6000);
      rotateItems3d([F('box')], 'viewSide', [105, 130, 5], -Math.PI / 6);
      const after = JSON.stringify({ subs: F('box').subs, x3d: F('box').x3d });
      return ok1 && !F('box').plane && maxDiff([F('box').subs[0].nodes.map((n) => [n.x, n.y, 0])], [JSON.parse(before).subs[0].nodes.map((n) => [n.x, n.y, 0])]) < 1e-6
        && near(F('box').x3d.z0, 0, 1e-6);
    }],
    ['角丸長方形：アンカー8個、角丸は幅・高さの半分まで、半径0なら普通の長方形', () => {
      const a = roundRectFit(10, 20, 40, 30, 5), b = roundRectFit(10, 20, 40, 10, 99), c = roundRectFit(10, 20, 40, 30, 0);
      return a.nodes.length === 8 && a.closed && near(a.nodes[0].x, 15) && near(a.nodes[0].y, 20) && near(a.nodes[2].x, 50) && near(a.nodes[2].y, 25)
        && near(b.nodes[0].x, 15) && near(b.nodes[2].y, 25) && c.nodes.length === 4;
    }],
  ];

  function run() {
    const saved = { doc, sel: S.sel, hinge: S.foldHinge, active: S.activeLayer, smart: S.smart };
    const results = [];
    for (const [name, fn] of TESTS) {
      let ok = false, err = '';
      try { ok = !!fn(); } catch (e) { err = String(e && e.message || e); }
      results.push({ name, ok, err });
    }
    doc = saved.doc; S.sel = saved.sel; S.foldHinge = saved.hinge; S.activeLayer = saved.active; S.smart = saved.smart; S.drag = null;
    render(); updateUI();
    const pass = results.filter((r) => r.ok).length;
    const box = document.createElement('div');
    box.id = 'testResults';
    box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;max-width:520px;max-height:70vh;overflow:auto;background:#1e1e1e;color:#eee;border:2px solid ' + (pass === results.length ? '#3fbf3f' : '#ff4f4f') + ';border-radius:6px;padding:10px 12px;font:12px/1.6 system-ui,sans-serif';
    box.innerHTML = `<b>自動テスト：${pass} / ${results.length} 通った</b><br>` + results.map((r) => `${r.ok ? '<span style="color:#3fbf3f">✓</span>' : '<span style="color:#ff4f4f">✗</span>'} ${r.name}${r.err ? '　<span style="color:#ff9f9f">' + r.err.replace(/</g, '&lt;') + '</span>' : ''}`).join('<br>') + '<br><button id="testClose" style="margin-top:6px">閉じる</button>';
    document.body.appendChild(box);
    $('testClose').onclick = () => box.remove();
    window.__testResults = results;
  }
  setTimeout(run, 300);
})();
