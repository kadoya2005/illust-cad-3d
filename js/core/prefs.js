'use strict';
// イラレCAD：表示の設定（定規・グリッドなど）をブラウザに覚えておく

const PREF_FLAGS = ['rulers', 'grid', 'snapGrid', 'smart', 'showGuides', 'guidesLocked', 'show3d'];
function savePrefs() {
  try {
    const p = { keyStep: S.keyStep };
    for (const k of PREF_FLAGS) p[k] = S[k];
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch (_) { /* 保存できなくても続ける */ }
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    for (const k of PREF_FLAGS) if (typeof p[k] === 'boolean') S[k] = p[k];
    if (p.keyStep > 0) S.keyStep = p.keyStep;
  } catch (_) { /* 既定のまま */ }
}
