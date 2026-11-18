'use strict';
// イラレCAD：設定値・ツールの一覧

// イラレCAD 2D 試作：画面・ツール・ショートカット

const DOC_VERSION = 2;         // ドキュメント（.icad）の形の版
const PT_PER_MM = 72 / 25.4;   // 1mm = 2.8346pt
const LAYER_COLORS = ['#4f80ff', '#ff4f4f', '#3fbf3f', '#3fbfff', '#ff4fff', '#ffbf3f', '#9f6fff', '#ff8f3f'];
const SEL_TOOLS = new Set(['select', 'direct']);
const NODE_TOOLS = new Set(['direct', 'pen', 'addAnchor', 'deleteAnchor', 'convert']);
const XF_TOOLS = new Set(['rotate', 'reflect', 'scale']);
const TOOL_KEYS = { V: 'select', A: 'direct', P: 'pen', M: 'rect', L: 'ellipse', R: 'rotate', O: 'reflect', S: 'scale', I: 'eyedropper', H: 'hand', Z: 'zoom' };
const TOOLS_META = {
  select: { name: '選択ツール', key: 'V', hint: 'クリックで選択（グループは丸ごと）・ドラッグで移動／Shift で追加選択／Alt+ドラッグで複製／枠の四角で拡大縮小' },
  direct: { name: 'ダイレクト選択ツール', key: 'A', hint: 'アンカーやハンドルを個別に動かす／曲線の線をドラッグで形を変える／Shift で追加／Alt+クリックでパス全体、もう一度でグループ' },
  pen: { name: 'ペンツール', key: 'P', hint: 'クリックで直線、ドラッグで曲線／ドラッグ中に Alt で切り返し、Space でアンカーを移動／始点をクリックで閉じる／Enter・Esc で終了／Alt でアンカーポイントツール／Shift で 45°' },
  addAnchor: { name: 'アンカーポイントの追加ツール', key: '+', hint: 'パスの線の上をクリックしてアンカーを追加' },
  deleteAnchor: { name: 'アンカーポイントの削除ツール', key: '-', hint: 'アンカーをクリックして削除（形はつながったまま）' },
  convert: { name: 'アンカーポイントツール', key: 'Shift+C', hint: 'アンカーをクリックで角に、ドラッグで曲線に／方向線の先をドラッグで片側だけ動かす（切り返し）' },
  rect: { name: '長方形ツール', key: 'M', hint: 'ドラッグで描く／Shift で正方形／Alt で中心から／クリックで数値指定' },
  ellipse: { name: '楕円形ツール', key: 'L', hint: 'ドラッグで描く／Shift で正円／Alt で中心から／クリックで数値指定' },
  line: { name: '直線ツール', key: '\\', hint: 'ドラッグで描く／Shift で 45°／Alt で中心から／クリックで数値指定' },
  rotate: { name: '回転ツール', key: 'R', hint: 'クリックで基準点、ドラッグで回転／Shift で 45° 刻み／離すときに Alt でコピー／Alt+クリックで基準点を決めて数値入力' },
  reflect: { name: 'リフレクトツール', key: 'O', hint: 'クリックで基準点、ドラッグで軸を決めて折り返し／Shift で 45° 刻み／離すときに Alt でコピー／Alt+クリックで基準点を決めて数値入力' },
  scale: { name: '拡大・縮小ツール', key: 'S', hint: 'クリックで基準点、ドラッグで拡大縮小／Shift で縦横比を保つ／離すときに Alt でコピー／Alt+クリックで基準点を決めて数値入力' },
  eyedropper: { name: 'スポイトツール', key: 'I', hint: 'クリックしたオブジェクトの塗りと線を、選択中のものに写す' },
  hand: { name: '手のひらツール', key: 'H', hint: 'ドラッグで表示位置を動かす（Space を押している間も使えます）' },
  zoom: { name: 'ズームツール', key: 'Z', hint: 'クリックで拡大／Alt+クリックで縮小' },
  rotView: { name: '回転ビュー', key: 'Shift+Space', hint: 'ドラッグで画面を回す（Shift で 15° ずつ）／Ctrl+Shift+1 で元に戻す' },
};
const ZOOMS = [0.03125, 0.0625, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
const AUTOSAVE_DOC = 'illustcad.autosave.doc';
const AUTOSAVE_NAME = 'illustcad.autosave.name';
const PREFS_KEY = 'illustcad.prefs';
const RULER = 20;              // 定規の太さ（px）
const GRID_MAJOR = 72;         // グリッド：72pt ごとに太線
const GRID_DIV = 8;            // その中を 8 分割
const GUIDE_COLOR = '#00c8ff';
const SMART_COLOR = '#ff3fd0';
