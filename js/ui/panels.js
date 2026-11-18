'use strict';
// イラレCAD：パネル・メニュー・レイヤー

// ================= パネル・メニュー =================
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
function setSwatch(el, color) { el.style.background = color || '#ffffff'; el.classList.toggle('none', !color); }
const r2 = (n) => Math.round(n * 100) / 100;
const ICON_EYE = '<svg viewBox="0 0 16 16"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

const MENUS = {
  object: [
    ['移動…', 'Enter', () => openXfDialog('move')], ['変形の繰り返し', 'Ctrl+D', transformAgain], '-',
    ['グループ', 'Ctrl+G', groupSelection], ['グループ解除', 'Ctrl+Shift+G', ungroupSelection], '-',
    ['連結', 'Ctrl+J', joinPaths], ['平均…', 'Ctrl+Alt+J', averageAnchors], ['パスのオフセット…', '', openOffsetDialog], ['複合パスを作成', 'Ctrl+8', makeCompound], ['複合パスを解除', 'Ctrl+Alt+Shift+8', releaseCompound], '-',
    ['最前面へ', 'Ctrl+Shift+]', () => arrange('front')], ['前面へ', 'Ctrl+]', () => arrange('forward')],
    ['背面へ', 'Ctrl+[', () => arrange('backward')], ['最背面へ', 'Ctrl+Shift+[', () => arrange('back')], '-',
    ['ロック', 'Ctrl+2', lockSelection], ['すべてをロック解除', 'Ctrl+Alt+2', unlockAll],
    ['隠す', 'Ctrl+3', hideSelection], ['すべてを表示', 'Ctrl+Alt+3', showAll],
  ],
  view: [
    ['アウトライン', 'Ctrl+Y', toggleOutline, () => S.outline], ['アートボード全体', 'Ctrl+0', fitView], ['100%', 'Ctrl+1', () => zoomAt(stageCenter(), 1)], '-',
    ['境界線を隠す', 'Ctrl+H', () => { S.hideEdges = !S.hideEdges; drawOverlay(); }, () => S.hideEdges],
    ['正面図・側面図', '', toggle3dViews, () => S.show3d],
    ['定規', 'Ctrl+R', toggleRulers, () => S.rulers], ['スマートガイド', 'Ctrl+U', toggleSmart, () => S.smart], '-',
    ['ガイドを表示', 'Ctrl+:', toggleGuides, () => S.showGuides], ['ガイドをロック', 'Ctrl+Alt+:', toggleGuideLock, () => S.guidesLocked], ['ガイドを消去', '', clearGuides], '-',
    ['グリッドを表示', 'Ctrl+@', toggleGrid, () => S.grid], ['グリッドにスナップ', 'Ctrl+Shift+@', toggleSnapGrid, () => S.snapGrid],
  ],
};
function buildMenu(name) {
  const box = $('menu-' + name);
  box.innerHTML = '';
  for (const m of MENUS[name]) {
    if (m === '-') { box.appendChild(document.createElement('hr')); continue; }
    const [label, sc, fn, check] = m;
    const b = document.createElement('button');
    b.innerHTML = `<span class="ck">${check && check() ? '✓' : ''}</span><span class="lb"></span><span class="sc"></span>`;
    b.querySelector('.lb').textContent = label;
    b.querySelector('.sc').textContent = sc;
    b.addEventListener('click', () => { closeMenus(); fn(); });
    box.appendChild(b);
  }
}
function closeMenus() { document.querySelectorAll('.dropdown').forEach((d) => { d.hidden = true; }); }
document.querySelectorAll('[data-menu]').forEach((btn) => btn.addEventListener('click', (e) => {
  e.stopPropagation();
  const box = $('menu-' + btn.dataset.menu);
  const open = box.hidden;
  closeMenus();
  if (open) {
    buildMenu(btn.dataset.menu);
    const r = btn.getBoundingClientRect();
    box.style.top = r.bottom + 4 + 'px';
    box.style.left = Math.max(4, Math.min(r.left, innerWidth - 254)) + 'px';
    box.hidden = false;
  }
}));
document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown') && !e.target.closest('[data-menu]')) closeMenus(); });

function updateUI() {
  cleanSel(); ensureActiveLayer();
  const items = selectedItems();
  if (items.length) { const it = items[items.length - 1]; S.fill = it.fill; S.stroke = it.stroke; S.sw = it.sw; }
  document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === S.tool));
  setSwatch($('swFill'), S.fill); setSwatch($('swStroke'), S.stroke);
  $('colorWell').classList.toggle('strokeActive', S.activeColor === 'stroke');
  $('inFill').value = S.fill || '#ffffff'; $('inFill').classList.toggle('none', !S.fill); $('fillNone').classList.toggle('on', !S.fill);
  $('inStroke').value = S.stroke || '#000000'; $('inStroke').classList.toggle('none', !S.stroke); $('strokeNone').classList.toggle('on', !S.stroke);
  if (document.activeElement !== $('inSw')) $('inSw').value = r2(S.sw);
  const bb = items.length ? Geo.bbox(items) : null;
  for (const [id, v] of [['inX', bb && bb.x], ['inY', bb && bb.y], ['inW', bb && bb.w], ['inH', bb && bb.h]]) {
    const el = $(id);
    el.disabled = !bb;
    if (document.activeElement !== el) el.value = bb ? r2(v) : '';
  }
  if (document.activeElement !== $('inBW')) $('inBW').value = r2(doc.width);
  if (document.activeElement !== $('inBH')) $('inBH').value = r2(doc.height);
  const tops = selectedTops();
  document.querySelectorAll('[data-pf]').forEach((b) => { b.disabled = tops.length < (b.dataset.pf === 'divide' || b.dataset.pf === 'trim' ? 1 : 2); });
  renderLayers();
  $('fileName').textContent = S.fileName;
  document.title = S.fileName + ' - イラレCAD';
  $('btnUndo').disabled = !canUndo();
  $('btnRedo').disabled = !canRedo();
  $('btnOutline').classList.toggle('on', S.outline);
  showToolStatus();
  $('alignTo').value = S.alignTo;
  $('btnOffset').disabled = !items.length;
  // 3D 押し出し：選んだものの値（ばらばらなら空欄）
  const prof = selectedProfileLeaves();
  const exs = prof.map((it) => it.x3d || null);
  const same = (f) => (exs.length && exs.every((e) => e && f(e) === f(exs[0])) ? r2(f(exs[0])) : '');
  for (const [id, f] of [['inExH', (e) => e.h], ['inExZ', (e) => e.z0]]) {
    const el = $(id);
    el.disabled = !prof.length;
    if (document.activeElement !== el) el.value = same(f);
  }
  $('btnExtrude').disabled = !prof.length;
  $('btnUnextrude').disabled = !exs.some(Boolean);
  const flags = [];
  if (S.smart) flags.push('スマートガイド');
  if (S.snapGrid) flags.push('グリッドにスナップ');
  $('stFlags').textContent = flags.join('・');
}

// ステータスバーのツール名。キーを押して一時的に切り替わっているときは、そのツールを出す
function showToolStatus() {
  let t = S.drag ? S.tool : displayTool();
  if (!S.drag && t === 'pen' && S.keys.alt) t = 'convert';
  const meta = TOOLS_META[t] || TOOLS_META[S.tool];
  const temp = t !== S.tool ? `（一時的に。${TOOLS_META[S.tool].name}に戻ります）` : `（${meta.key}）`;
  $('stTool').textContent = meta.name + temp;
  $('stHint').textContent = meta.hint;
}

function renderLayers() {
  const ul = $('layerList');
  ul.innerHTML = '';
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const L = doc.layers[i];
    const li = document.createElement('li');
    li.dataset.id = L.id;
    if (L.id === S.activeLayer) li.className = 'active';
    const hasSel = leaves(L.items).some((it) => S.sel.has(it.id));
    li.innerHTML = `<span class="chip" style="background:${L.color}"></span>` +
      `<button class="ib eye ${L.visible ? '' : 'off'}" title="表示／非表示">${ICON_EYE}</button>` +
      `<button class="ib lock ${L.locked ? '' : 'off'}" title="ロック／解除">${ICON_LOCK}</button>` +
      `<span class="nm"></span>` +
      `<span class="selmark" style="${hasSel ? 'background:' + L.color : ''}"></span>`;
    li.querySelector('.nm').textContent = L.name;
    ul.appendChild(li);
  }
}
$('layerList').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const L = doc.layers.find((x) => x.id === li.dataset.id);
  if (!L) return;
  if (e.target.closest('.eye')) { L.visible = !L.visible; cleanSel(); render(); commit(); return; }
  if (e.target.closest('.lock')) { L.locked = !L.locked; cleanSel(); render(); commit(); return; }
  S.activeLayer = L.id; updateUI();
});
$('layerList').addEventListener('dblclick', (e) => {
  const li = e.target.closest('li');
  if (!li || e.target.closest('.ib')) return;
  const L = doc.layers.find((x) => x.id === li.dataset.id);
  const v = prompt('レイヤー名', L.name);
  if (v && v.trim()) { L.name = v.trim(); commit(); }
});
$('layerAdd').addEventListener('click', () => {
  const n = doc.layers.length;
  let num = n + 1;
  while (doc.layers.some((L) => L.name === 'レイヤー ' + num)) num++;
  const L = { id: uid(), name: 'レイヤー ' + num, color: LAYER_COLORS[n % LAYER_COLORS.length], visible: true, locked: false, items: [] };
  doc.layers.splice(doc.layers.indexOf(activeLayerObj()) + 1, 0, L);
  S.activeLayer = L.id; render(); commit();
});
$('layerDel').addEventListener('click', () => {
  if (doc.layers.length <= 1) { toast('最後のレイヤーは削除できません'); return; }
  const L = activeLayerObj();
  const cnt = leaves(L.items).length;
  if (cnt && !confirm(`「${L.name}」とその中の ${cnt} 個のパスを削除しますか？`)) return;
  const i = doc.layers.indexOf(L);
  doc.layers.splice(i, 1);
  S.activeLayer = doc.layers[Math.max(0, i - 1)].id;
  cleanSel(); render(); commit();
});
function moveLayer(dir) {
  const L = activeLayerObj(), i = doc.layers.indexOf(L), j = i + dir;
  if (j < 0 || j >= doc.layers.length) return;
  [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]];
  render(); commit();
}
$('layerUp').addEventListener('click', () => moveLayer(1));
$('layerDown').addEventListener('click', () => moveLayer(-1));

$('inFill').addEventListener('input', (e) => setColor('fill', e.target.value, false));
$('inFill').addEventListener('change', () => commit());
$('inStroke').addEventListener('input', (e) => setColor('stroke', e.target.value, false));
$('inStroke').addEventListener('change', () => commit());
$('fillNone').addEventListener('click', () => setColor('fill', null));
$('strokeNone').addEventListener('click', () => setColor('stroke', null));
$('inSw').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (!(v >= 0)) { updateUI(); return; }
  S.sw = v;
  for (const it of selectedItems()) it.sw = v;
  renderArt(); commit();
});
for (const id of ['inX', 'inY', 'inW', 'inH']) {
  $(id).addEventListener('change', () => {
    const items = selectedItems();
    const v = parseFloat($(id).value);
    if (!items.length || !isFinite(v)) { updateUI(); return; }
    const bb = Geo.bbox(items);
    let f;
    if (id === 'inX') f = (q) => P(q.x + v - bb.x, q.y);
    else if (id === 'inY') f = (q) => P(q.x, q.y + v - bb.y);
    else if (id === 'inW') { if (bb.w < 1e-9 || v <= 0) { updateUI(); return; } f = (q) => P(bb.x + (q.x - bb.x) * (v / bb.w), q.y); }
    else { if (bb.h < 1e-9 || v <= 0) { updateUI(); return; } f = (q) => P(q.x, bb.y + (q.y - bb.y) * (v / bb.h)); }
    items.forEach((it) => mapItem(it, f));
    render(); commit();
  });
}
$('inExH').addEventListener('change', () => { const v = parseFloat($('inExH').value); if (v > 0) setExtrude(v, undefined); else updateUI(); });
$('inExZ').addEventListener('change', () => { const v = parseFloat($('inExZ').value); if (isFinite(v)) setExtrude(undefined, v); else updateUI(); });
$('btnExtrude').addEventListener('click', () => setExtrude(parseFloat($('inExH').value), undefined));
$('btnUnextrude').addEventListener('click', removeExtrude);
for (const [id, prop] of [['inBW', 'width'], ['inBH', 'height']]) {
  $(id).addEventListener('change', () => {
    const v = parseFloat($(id).value);
    if (v > 0) { doc[prop] = v; render(); commit(); } else updateUI();
  });
}
$('swFill').addEventListener('click', () => { if (S.activeColor === 'fill') $('inFill').click(); else { S.activeColor = 'fill'; updateUI(); } });
$('swStroke').addEventListener('click', () => { if (S.activeColor === 'stroke') $('inStroke').click(); else { S.activeColor = 'stroke'; updateUI(); } });
$('btnDefault').addEventListener('click', defaultColors);
$('btnSwap').addEventListener('click', swapColors);
$('btnNone').addEventListener('click', () => setColor(S.activeColor, null));
document.querySelectorAll('[data-tool]').forEach((b) => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
  // ツールのダブルクリックで数値入力（イラレと同じ）
  b.addEventListener('dblclick', () => {
    const t = b.dataset.tool;
    if (t === 'select' || t === 'direct') openXfDialog('move');
    else if (XF_TOOLS.has(t)) { S.xfOrigin = null; openXfDialog(t); }
    else if (t === 'hand') fitView();
    else if (t === 'zoom') zoomAt(stageCenter(), 1);
  });
});
document.querySelectorAll('[data-pf]').forEach((b) => b.addEventListener('click', () => pathfinder(b.dataset.pf)));
document.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => alignObjects(b.dataset.align)));
document.querySelectorAll('[data-dist]').forEach((b) => b.addEventListener('click', () => distributeObjects(b.dataset.dist)));
document.querySelectorAll('[data-space]').forEach((b) => b.addEventListener('click', () => distributeSpacing(b.dataset.space, parseFloat($('inGap').value) || 0)));
$('alignTo').addEventListener('change', (e) => {
  S.alignTo = e.target.value;
  if (S.alignTo === 'key' && !S.keyId) toast('選択中のオブジェクトの1つをクリックすると、キーオブジェクトになります');
  e.target.blur();
});
$('btnOffset').addEventListener('click', openOffsetDialog);

const COMMANDS = {
  new: newDocument, open: openFile, save: () => save(false), saveAs: () => save(true), exportSvg: exportSvgFile, exportStl: exportStlFile,
  undo, redo, outline: toggleOutline, fit: fitView, help: () => toggleHelp(true), prefs: openPrefs,
};
document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => COMMANDS[b.dataset.cmd]()));
