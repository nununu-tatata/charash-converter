// ==========================================
// キャラクター保管所・Charaeno（CoC6版）のデータ → キャラッシュテキスト v2 への変換
// 画面の処理（main.js）とは分けて、ここには変換のルールだけを書く
// 形式の出典：https://charash.jp/api/export/txt/guide
// ==========================================

// --- URL・IDの読み取り ---
// キャラクター保管所：数字ID（…/XXXXXXX）と MDID（…/m + 32桁の英数字）の両方に対応。IDだけの入力も受け付ける
// Charaeno：https://charaeno.com/6th/（21文字のID）。「charaeno:ID」の形で返す（7版のURLは対応していない）
const CHARAENO_PREFIX = 'charaeno:';
function parseSheetKey(input) {
    const str = (input || '').toString().trim();
    const ce = str.match(/charaeno\.com\/(6th|7th)\/([A-Za-z0-9_-]{21})(?![A-Za-z0-9_-])/);
    if (ce) {
        if (ce[1] === '7th') {
            const e = new Error('新クトゥルフ神話TRPG（7版）のキャラシです。このツールは6版のキャラシのみ対応しています。');
            e.kind = 'seventh';
            throw e;
        }
        return CHARAENO_PREFIX + ce[2];
    }
    const m = str.match(/vampire-blood\.net\/(m[0-9a-f]{32}|\d+)/i) || str.match(/^(m[0-9a-f]{32}|\d+)$/i);
    if (!m) throw new Error('キャラシのURLではありません。\n例：https://charasheet.vampire-blood.net/XXXXXXX');
    return m[1].toLowerCase();
}
const isCharaenoKey = key => key.startsWith(CHARAENO_PREFIX);
// キャラシを開くURL
function sheetUrlOf(key) {
    return isCharaenoKey(key) ? `https://charaeno.com/6th/${key.slice(CHARAENO_PREFIX.length)}` : `https://charasheet.vampire-blood.net/${key}`;
}

// --- 項目が1件だけのとき、配列ではなく文字列やオブジェクトで来ることがあるので、必ず配列にする ---
function toArray(v) {
    if (v == null || v === '') return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') return Object.values(v);
    return [v];
}

function str(v) { return v == null ? '' : v.toString().trim(); }
function int(v) { return parseInt(str(v).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), 10) || 0; }

// --- 技能の定義 ---
// hokan: キャラクター保管所での並び順（JSONの配列の順番）と名前
// name: キャラッシュでの名前、base: キャラッシュの自動計算の初期値（能力値から計算するものは関数）
// bunya: 分野が入っているJSONのキー
const SKILL_CATEGORIES = [
    {
        prefix: 'TB', title: '戦闘技能', skills: [
            { hokan: '回避', base: a => a.DEX * 2 },
            { hokan: 'キック', base: 25 },
            { hokan: '組み付き', name: '組みつき', base: 25 },
            { hokan: 'こぶし（パンチ）', name: 'こぶし／パンチ', base: 50 },
            { hokan: '頭突き', base: 10 },
            { hokan: '投擲', base: 25 },
            { hokan: 'マーシャルアーツ', base: 1 },
            { hokan: '拳銃', base: 20 },
            { hokan: 'サブマシンガン', base: 15 },
            { hokan: 'ショットガン', base: 30 },
            { hokan: 'マシンガン', base: 15 },
            { hokan: 'ライフル', base: 25 },
        ]
    },
    {
        prefix: 'TF', title: '探索技能', skills: [
            { hokan: '応急手当', base: 30 },
            { hokan: '鍵開け', base: 1 },
            { hokan: '隠す', base: 15 },
            { hokan: '隠れる', base: 10 },
            { hokan: '聞き耳', base: 25 },
            { hokan: '忍び歩き', base: 10 },
            { hokan: '写真術', base: 10 },
            { hokan: '精神分析', base: 1 },
            { hokan: '追跡', base: 10 },
            { hokan: '登攀', base: 40 },
            { hokan: '図書館', base: 25 },
            { hokan: '目星', base: 25 },
        ]
    },
    {
        prefix: 'TA', title: '行動技能', skills: [
            { hokan: '運転', base: 20, bunya: 'unten_bunya' },
            { hokan: '機械修理', base: 20 },
            { hokan: '重機械操作', base: 1 },
            { hokan: '乗馬', base: 5 },
            { hokan: '水泳', base: 25 },
            { hokan: '製作', base: 5, bunya: 'seisaku_bunya' },
            { hokan: '操縦', base: 1, bunya: 'main_souju_norimono' },
            { hokan: '跳躍', base: 25 },
            { hokan: '電気修理', base: 10 },
            { hokan: 'ナビゲート', base: 10 },
            { hokan: '変装', base: 1 },
        ]
    },
    {
        prefix: 'TC', title: '交渉技能', skills: [
            { hokan: '言いくるめ', base: 5 },
            { hokan: '信用', base: 15 },
            { hokan: '説得', base: 15 },
            { hokan: '値切り', base: 5 },
            { hokan: '母国語', base: a => a.EDU * 5, bunya: 'mylang_name' },
        ]
    },
    {
        prefix: 'TK', title: '知識技能', skills: [
            { hokan: '医学', base: 5 },
            { hokan: 'オカルト', base: 5 },
            { hokan: '化学', base: 1 },
            { hokan: 'クトゥルフ神話', base: 0 },
            { hokan: '芸術', base: 5, bunya: 'geijutu_bunya' },
            { hokan: '経理', base: 10 },
            { hokan: '考古学', base: 1 },
            { hokan: 'コンピューター', base: 1 },
            { hokan: '心理学', base: 5 },
            { hokan: '人類学', base: 1 },
            { hokan: '生物学', base: 1 },
            { hokan: '地質学', base: 1 },
            { hokan: '電子工学', base: 1 },
            { hokan: '天文学', base: 1 },
            { hokan: '博物学', base: 10 },
            { hokan: '物理学', base: 1 },
            { hokan: '法律', base: 5 },
            { hokan: '薬学', base: 1 },
            { hokan: '歴史', base: 20 },
        ]
    },
];

// 追加技能の名前の読みかえ（キャラッシュの基本技能に当てはめる）
// 「その他の言語（英語）」のような書き方は、キャラッシュの「ほかの言語（英語）」にする
const LANGUAGE_NAMES = ['ほかの言語', 'その他の言語', 'その他言語', '他の言語', '外国語', '言語'];
// 分野つきで書かれていても基本技能として読めるもの（キャラッシュの名前: 自動計算の初期値）
const SPECIALTY_SKILLS = { '運転': 20, '製作': 5, '操縦': 1, '芸術': 5, '母国語': null, 'ほかの言語': 1 };

// 能力値の名前（1〜8）
const ABILITY_NAMES = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'];

// 職業ポイントの計算式の候補（キャラッシュの書き方: 計算）
const OCCUPATION_FORMULAS = [
    ['EDU×20', a => a.EDU * 20],
    ['STR×10+EDU×10', a => (a.STR + a.EDU) * 10],
    ['CON×10+EDU×10', a => (a.CON + a.EDU) * 10],
    ['POW×10+EDU×10', a => (a.POW + a.EDU) * 10],
    ['DEX×10+EDU×10', a => (a.DEX + a.EDU) * 10],
    ['APP×10+EDU×10', a => (a.APP + a.EDU) * 10],
    ['SIZ×10+EDU×10', a => (a.SIZ + a.EDU) * 10],
    ['INT×10+EDU×10', a => (a.INT + a.EDU) * 10],
];

// ダメージボーナス（STR+SIZ）の6版の表
function calcDamageBonus(total) {
    if (total <= 12) return '-1D6';
    if (total <= 16) return '-1D4';
    if (total <= 24) return '0';
    if (total <= 32) return '+1D4';
    if (total <= 40) return '+1D6';
    return '+' + (Math.floor((total - 41) / 16) + 2) + 'D6';
}
function normalizeDb(v) {
    const s = str(v).replace(/[＋]/g, '+').replace(/[－−ー]/g, '-').replace(/[ｄＤd]/g, 'D').replace(/\s/g, '');
    if (s === '' || s === '±0' || s === '+0' || s === '-0' || s === 'なし') return '0';
    // 保管所では「1d4」のように＋を付けずに書かれることが多い
    return /^\d/.test(s) && s !== '0' ? '+' + s : s;
}

// ==========================================
// キャラッシュテキストの書き方（値の囲み・記号の打ち消し）
// ==========================================

// 項目行「項目名: 値」の値。改行や前後の空白、引用符・バックスラッシュを含むときは " で囲む
function fieldValue(v) {
    const s = str(v) === '' ? '' : v.toString().replace(/\r\n?/g, '\n');
    if (/[\n"\\]/.test(s) || s !== s.trim()) {
        return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }
    return s;
}
function fieldLine(name, v) { return `${name}: ${fieldValue(v)}`; }

// 表の1マス。縦線は \| にし、改行を含むときは " で囲む
function cell(v) {
    const s = v == null ? '' : v.toString().replace(/\r\n?/g, '\n').trim();
    const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\|/g, '\\|');
    return /\n/.test(s) ? `"${escaped}"` : escaped;
}
function tableLines(header, rows) {
    return [header, ...rows].map(r => '| ' + r.map(cell).join(' | ') + ' |');
}

// 長文（メモ）。「---」だけの行は、区切りと間違えないように先頭にバックスラッシュを付ける
function longText(title, body) {
    const lines = body.replace(/\r\n?/g, '\n').split('\n').map(l => /^\\*---$/.test(l) ? '\\' + l : l);
    return ['---', `【${title}】`, ...lines, '---'];
}

// ==========================================
// 名前の分け方
// 保管所の名前欄の書き方はいろいろなので、よくある形だけ自動で分ける（画面で1人ずつ直せる）
//   湯出島　楓（ゆでじま　かえで）    → かっこの中がひらがな・カタカナ
//   湯出島　楓【ユデジマ　カエデ】    → かっこの種類は問わない
//   湯出島(ゆでじま)　楓(かえで)      → 1語ずつのふりがな
//   湯出島　楓 / ゆでじま　かえで     → 区切り記号のあと
//   湯出島　楓（Yudejima Kaede）      → 漢字の名前にローマ字の読み
// 戻り値の how：'auto'（自動で分けた）・'none'（分けなかった）
// ==========================================
const KANA_ONLY = /^[ぁ-ゖ゛-ゟァ-ヿｦ-ﾟ・･＝=\s　]+$/;
const LATIN_ONLY = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'’\-]*$/;
const HAS_KANJI = /[㐀-鿿豈-﫿々〆]/;
const HAS_JAPANESE = /[ぁ-ゖァ-ヺ㐀-鿿々]/;
// かっこの中がカタカナでも、ふりがなではない言葉
const NOT_KANA_WORDS = ['ロスト', 'ネタバレ', 'サンプル', 'テンプレ', 'テンプレート', 'コピー', 'メイン', 'サブ', 'ボツ', 'リメイク',
    'ベース', 'オリジナル', 'ゲスト', 'ソロ', 'タイマン', 'シナリオ', 'エネミー', 'モブ', 'ハンドアウト', 'ハウスルール', 'ログ'];
// 名前に使われるかっこ（開き・閉じの組）
const BRACKET_RE = /（([^（）]*)）|\(([^()]*)\)|【([^【】]*)】|［([^［］]*)］|\[([^\[\]]*)\]|「([^「」]*)」|『([^『』]*)』|〔([^〔〕]*)〕|《([^《》]*)》|〈([^〈〉]*)〉|<([^<>]*)>|＜([^＜＞]*)＞/g;

// ふりがなとして読める文字か。「ゆでじま K かえで」のように英字が混ざっていても、かなを含んでいればよい
const HAS_KANA = /[ぁ-ゖァ-ヺｦ-ﾝ]/;
function isKanaReading(s) {
    const t = s.trim();
    if (t === '' || NOT_KANA_WORDS.includes(t.replace(/[\s　]/g, ''))) return false;
    if (KANA_ONLY.test(t)) return true;
    return HAS_KANA.test(t) && KANA_ONLY.test(t.replace(/[A-Za-z.]/g, ''));
}

function findBracketGroups(s) {
    const groups = [];
    let m;
    BRACKET_RE.lastIndex = 0;
    while ((m = BRACKET_RE.exec(s))) {
        groups.push({ start: m.index, end: m.index + m[0].length, inner: m.slice(1).find(v => v !== undefined) });
    }
    return groups;
}

function splitNameKana(fullName) {
    const src = (fullName || '').trim();
    const none = { name: src, kana: '', how: 'none' };
    if (!src) return none;
    const cut = (s, from, to) => (s.slice(0, from) + s.slice(to)).trim();

    const groups = findBracketGroups(src);
    const kanaGroups = groups.filter(g => isKanaReading(g.inner));

    // 1語ずつのふりがな：湯出島(ゆでじま)　楓(かえで)
    if (kanaGroups.length >= 2) {
        let name = src;
        [...kanaGroups].reverse().forEach(g => { name = name.slice(0, g.start) + name.slice(g.end); });
        name = name.trim();
        if (HAS_KANJI.test(name)) return { name, kana: kanaGroups.map(g => g.inner.trim()).join('　'), how: 'auto' };
    }
    // かっこが1つ：湯出島　楓（ゆでじま　かえで）
    if (kanaGroups.length === 1) {
        const g = kanaGroups[0];
        const name = cut(src, g.start, g.end);
        if (name && name !== g.inner.trim()) return { name, kana: g.inner.trim(), how: 'auto' };
    }
    // 漢字の名前にローマ字の読み：湯出島　楓（Yudejima Kaede）
    if (groups.length === 1 && LATIN_ONLY.test(groups[0].inner.trim())) {
        const name = cut(src, groups[0].start, groups[0].end);
        if (HAS_KANJI.test(name) && !/[A-Za-z]/.test(name)) return { name, kana: groups[0].inner.trim(), how: 'auto' };
    }
    // 区切り記号のあと：湯出島　楓 / ゆでじま　かえで
    const sep = src.match(/^(.+?)[\s　]*[/／|｜][\s　]*(.+)$/);
    if (sep && !/[/／|｜]/.test(sep[2]) && isKanaReading(sep[2]) && HAS_JAPANESE.test(sep[1]) && sep[1].trim() !== sep[2].trim()) {
        return { name: sep[1].trim(), kana: sep[2].trim(), how: 'auto' };
    }
    return none;
}

// 半角カタカナのふりがなを直す
// mode：'keep'（そのまま）・'katakana'（全角カタカナ）・'hiragana'（ひらがな）
// 半角カタカナを含むふりがなだけを直す（もともと全角のふりがなは変えない）
function convertHalfKana(kana, mode) {
    const s = kana || '';
    if (mode !== 'katakana' && mode !== 'hiragana') return s;
    if (!/[ｦ-ﾟ]/.test(s)) return s;
    // 半角カナ（濁点・半濁点を含む）の部分だけを全角にする。英数字などはそのまま
    const full = s.replace(/[｡-ﾟ]+/g, run => run.normalize('NFKC'));
    if (mode === 'katakana') return full;
    return full.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// ==========================================
// 特徴表（探索者の特徴）をメモから探す
// 保管所には特徴表の専用の欄がないので、メモのよくある書き方だけを探す（画面で1人ずつ直せる）
//   【特徴】／◆特徴 の見出しのあとに並べたもの
//   【特徴①：】1-5　[天才]：… のように1行ずつ書いたもの
//   [天才][勉強家] のようにかっこで並べたもの
// 特徴表の名前の一覧で「特徴の行かどうか」を見分ける（CoCチャパレ＆コマ作成ツールと同じ一覧）
// 戻り値：見つかった文（見つからなければ空）
// ==========================================
const TRAIT_NAMES = [
    '君は風邪を引かない', '大きな体', '素早い', 'オシャレ', '天才', '強固な意志', '勉強家', '幸運のお守り',
    '一族伝来の宝物', '予期せぬ協力者', '手先が器用', '影が薄い', '親の七光り', '愛書家', '鋭い洞察力',
    'アウトドア派', '珍しい技能', '芸術的才能', 'バイリンガル', '前職', '天気予報士', 'プロ・ドライバー',
    '飛ばし屋', '戦士', '銃火器の達人', '格闘センスの持ち主', '俊敏', '信頼のおける人', 'スポーツ万能',
    '平凡な容姿', '目つきが悪い', '方向音痴', '異性が苦手', '動物に嫌われる', '不思議ちゃん', '寄せ餌',
    '眼鏡をかけている', '大切なもの', '暗黒の祖先', '夜に弱い', '動物に好かれる', '斜め上からの発想',
    '失敗は発明の母', 'ペット', 'おおらか', '異物への耐性', '潜水の名人', '大酒飲み', 'ド根性', '受け身',
    '奇妙な幸運', '投擲の才能', '鋼の筋力', '実は生きていた', '急所を見抜く', '急速な回復力',
    '不屈の精神力', 'マニア・コレクター', '行方不明の家族', '好意を寄せられている',
];
// 「特徴」だけの見出し行（【特徴】・◆特徴・特徴：など）
const TRAIT_HEADING = /^[\s　]*[【◆■●◇□▼▽★☆『「\[［(（<《・]?[\s　]*特徴(?:表)?[\s　]*[】」』\]］)）>》]?[\s　:：]*$/;
// 区切り線（同じ記号が5つ以上続く行、または ---- ━━━ など）
const SEPARATOR_LINE = /^[\s　]*(?:(.)\1{4,}|[-ー─━＝=_~〜*＊‐－]{4,})/;
// ほかの見出し（記号で始まる行）
const NEW_HEADING = /^[\s　]*[【◆■●◇□▼▽★☆]/;
// 特徴表の出目（1-5、2-0、4-10 など）
const TRAIT_ROLL = /[1-6１-６][\s　]*[-ー－‐][\s　]*(?:10|[0-9０-９])/;
// 1つの特徴の見出しのあとに続ける説明の行数の上限（ほかの文まで取り込まないように）
const TRAIT_MAX_LINES = 30;

const hasTraitName = line => TRAIT_NAMES.some(n => line.includes(n));

// 「特徴」のラベルで始まる行から、ラベルのあとの部分を取り出す（なければ空）
// ラベルのすぐあとに「：」か閉じかっこがある行だけ（「特徴的な声」のような文と間違えないように）
const INLINE_TRAIT_LABEL = /^[\s　]*[【\[［◆■●・]?[\s　]*特徴(?:表)?[①-⑳0-9０-９]*[\s　]*[:：】\]］](.*)$/;
function inlineTrait(line) {
    const m = line.match(INLINE_TRAIT_LABEL);
    if (!m) return '';
    return m[1].replace(/[】\]］]/, ' ').replace(/^[\s　:：]+/, '').trim();
}
const looksLikeTrait = line => hasTraitName(line) || TRAIT_ROLL.test(line);

function findTraits(memo) {
    const lines = (memo || '').toString().replace(/\r\n?/g, '\n').split('\n');

    // 見出しのあとに並べたもの
    const head = lines.findIndex(l => TRAIT_HEADING.test(l));
    if (head >= 0) {
        const body = [];
        for (let i = head + 1; i < lines.length && body.length < TRAIT_MAX_LINES; i++) {
            const l = lines[i];
            const t = l.trim();
            // 行のはじめから書いた「特記」は別の見出し（字下げした特記は、前職などの説明の続きなので止めない）
            if (SEPARATOR_LINE.test(t) || /^[【◆■●▼\[]?特記/.test(l)) break;
            if (body.length && NEW_HEADING.test(l) && !looksLikeTrait(l)) break;
            if (t === '') {
                // 空行のあとが特徴の行（特徴の名前や出目がある行）なら続ける。そうでなければ、ここで終わり
                const next = lines.slice(i + 1).find(x => x.trim() !== '');
                if (!body.length || (next !== undefined && looksLikeTrait(next) && !NEW_HEADING.test(next.replace(/^[\s　]*[【\[][^】\]]*特徴/, '')))) {
                    if (body.length) body.push('');
                    continue;
                }
                break;
            }
            body.push(l);
        }
        const text = body.join('\n').trim();
        if (text) return text;
    }

    // 1行ずつ書いたもの（「【特徴①：】〇〇」「特徴：〇〇」「【特徴：〇〇】」の、ラベルのあとの部分）
    // 出目（1-5 など）はあってもなくてもよい。ラベルのあとが空の行（【特徴②：】だけ）は飛ばす
    const inline = lines.map(inlineTrait).filter(Boolean);
    if (inline.length) return inline.join('\n');

    // かっこで並べたもの（行全体が [〇〇][〇〇] だけで、特徴表の名前が入っている行）
    const bracketLine = lines.find(l => /^[\s　]*(?:\[[^\[\]]+\][\s　]*)+$/.test(l) && hasTraitName(l));
    if (bracketLine) {
        return [...bracketLine.matchAll(/\[([^\[\]]+)\]/g)].map(m => m[1].trim()).join('\n');
    }
    return '';
}

// 保管所のタグ（空白区切り）を一覧にする。同じタグは1つにまとめる
function parseTags(data) {
    return [...new Set(str(data.pc_tags).split(/[\s　]+/).filter(Boolean))];
}

// 名前のすぐうしろにある読みを取り出す
// 「12.湯出島　楓(ﾕﾃﾞｼﾞﾏ ｶｴﾃﾞ」「湯出島　楓　ﾕﾃﾞｼﾞﾏ ｶｴﾃﾞ　(男)」のように、閉じかっこがない・かっこがない書き方もある
function readingAfterName(text, name) {
    if (!text || !name) return '';
    // 名前の中の空白は、全角・半角・なしのどれでも見つかるようにする
    const pattern = name.split(/[\s　]+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s　]*');
    const m = text.match(new RegExp(pattern));
    if (!m) return '';
    let rest = text.slice(m.index + m[0].length).replace(/^[\s　]*[（(【［\[「『《〈<＜]?[\s　]*/, '');
    rest = rest.split(/[）)】］\]」』》〉>＞（(/／|｜\r\n]/)[0].trim();
    return isKanaReading(rest) ? rest : '';
}

// 名前とかなを決める。名前欄で見つからなければ、タイトル → メモの最初のほうの順に探す
// how：'auto'（名前欄から分けた）・'title'（タイトルから）・'memo'（メモから）・'none'（見つからない）
function guessNameKana(data) {
    const full = str(data.pc_name) || str(data.data_title);
    const split = splitNameKana(full);
    if (split.kana) return split;
    const name = split.name;

    const fromTitle = str(data.data_title) !== full ? readingAfterName(str(data.data_title), name) : '';
    if (fromTitle) return { name, kana: fromTitle, how: 'title' };

    const memoLines = str(data.pc_making_memo).split(/\r?\n/).slice(0, 15);
    for (const line of memoLines) {
        // 「ふりがな：〇〇」「読み……〇〇」のように書かれた行
        const labeled = line.match(/^[\s　]*[【\[［(（]?(?:ふりがな|フリガナ|ﾌﾘｶﾞﾅ|よみがな|ヨミガナ|読み仮名|読み|よみ|ヨミ|かな|カナ|ルビ)[】\]］)）]?[\s　]*[:：…\s　]+(.+)$/);
        if (labeled && isKanaReading(labeled[1])) return { name, kana: labeled[1].trim(), how: 'memo' };
        // 名前で始まる行（「湯出島　楓　ﾕﾃﾞｼﾞﾏ ｶｴﾃﾞ　(男)」など）
        if (name && line.trim().startsWith(name.split(/[\s　]+/)[0])) {
            const kana = readingAfterName(line, name);
            if (kana) return { name, kana, how: 'memo' };
        }
    }
    // メモのはじめに、読みだけを書いた行（「ゆでじま　かえで」など）
    // 名前に漢字があるときだけ（カタカナの名前のキャラで、メモの最初のカタカナの文を読みと間違えないように）
    if (HAS_KANJI.test(name)) {
        const firstLines = memoLines.map(l => l.trim()).filter(Boolean).slice(0, 3);
        const reading = firstLines.find(l => isKanaReading(l) && l !== name);
        if (reading) return { name, kana: reading, how: 'memo' };
    }
    return { name, kana: '', how: 'none' };
}

// ==========================================
// メインの変換
// options:
//   splitKana    … 名前のかっこの中をふりがなとして分ける
//   memoTarget   … 'common'（共通メモ）か 'system'（システム別メモ）
//   growthMemo   … 成長チェックした技能をメモに残す
//   halfKana     … 半角カタカナのふりがなを 'keep'（そのまま）・'katakana'（全角カタカナ）・'hiragana'（ひらがな）に
//   nameOverride … { name, kana }。画面で直した名前・かな（なければ自動で分ける）
//   tags         … 入れるタグの一覧。画面で消したタグを除いたもの（なければ保管所のタグ全部）
//   traits       … 特徴表を「探索者の特徴」に入れる
//   traitsText   … 画面で直した特徴表の文（なければメモから探す）
// 戻り値：{ text, name, warnings, summary }
// ==========================================
function convertToCharash(data, options) {
    const opt = Object.assign({ splitKana: true, memoTarget: 'common', growthMemo: true, traits: true }, options || {});
    if (!data || typeof data !== 'object') throw new Error('キャラシのデータを読み取れませんでした。');
    if (data.game && data.game !== 'coc') {
        throw new Error(`クトゥルフ神話TRPG 6版のキャラシではありません（システム：${data.game}）。\nこのツールは6版のキャラシのみ対応しています。`);
    }

    // Charaenoのキャラシは、charaenoToSheet() で保管所と同じ形に読みかえてから渡す。
    // 保管所の形に入らないもの（記録一覧・経験の記録など）は data._src に入っている
    const src = data._src || null;
    const siteName = src ? src.site : 'キャラクター保管所';

    const warnings = src ? [...src.warnings] : [];
    const lines = [];
    const push = (...ls) => lines.push(...ls);

    // --- 能力値（NA = 作成時、NP = 今の値。NPが空なら NA） ---
    const base = {}, now = {};
    for (let i = 1; i <= 14; i++) {
        base[i] = int(data['NA' + i]);
        now[i] = str(data['NP' + i]) !== '' ? int(data['NP' + i]) : base[i];
    }
    const ab = {};
    ABILITY_NAMES.forEach((n, i) => { ab[n] = now[i + 1]; });

    // --- 名前 ---
    const fullName = str(data.pc_name) || str(data.data_title);
    // 画面で名前・かなを直したときは、その値を使う
    const guessed = opt.splitKana ? guessNameKana(data) : { name: fullName, kana: '' };
    const { name, kana } = opt.nameOverride || { name: guessed.name, kana: convertHalfKana(guessed.kana, opt.halfKana) };
    if (!fullName) warnings.push('キャラクター名が空です。キャラッシュで名前を入れてください。');

    // ======== 共通情報 ========
    push('キャラッシュテキスト v2', 'キャラクターID:', '', '【共通情報】', '', '【基本情報】', '');
    const profile = [
        ['名前', name],
        ['なまえ（かな）', kana],
        ['職業', str(data.shokugyo) || str(data.shuzoku)],
        ['年齢', str(data.age)],
        ['性別', str(data.sex)],
        ['出身', str(data.pc_kigen)],
        ['身長', str(data.pc_height)],
        ['体重', str(data.pc_weight)],
        ['髪の色', str(data.color_hair)],
        ['瞳の色', str(data.color_eye)],
    ];
    // 空の項目は書かない（書かなければ、キャラッシュにある今の値が残る）
    profile.filter(([, v]) => v !== '').forEach(([k, v]) => push(fieldLine(k, v)));
    push('');

    // タグ（1行に1つ）。画面で消したタグは入れない
    const tags = opt.tags || parseTags(data);
    if (tags.length) push('【タグ】', '', ...tags, '');

    // 自由項目（キャラッシュに入れる場所がない項目）
    const id = data.data_id ? data.data_id.toString() : '';
    const free = [];
    if (str(data.color_skin)) free.push(['肌の色', str(data.color_skin)]);
    if (str(data.money)) free.push(['所持金', str(data.money)]);
    if (str(data.debt)) free.push(['預金・借金', str(data.debt)]);
    if (str(data.data_title) && str(data.data_title) !== fullName) free.push(['保管所のタイトル', str(data.data_title)]);
    if (src) free.push(...src.free.filter(([, v]) => str(v) !== ''));
    else if (id) free.push(['キャラクター保管所', `https://charasheet.vampire-blood.net/${id}`]);
    if (free.length) push('【自由項目】', '', ...free.map(([k, v]) => fieldLine(k, v)), '');

    // メモ
    const memoBlocks = [];
    const memo = str(data.pc_making_memo);
    if (memo) memoBlocks.push(longText(`${siteName}のメモ`, data.pc_making_memo.toString().trim()));
    // Charaenoの「この探索者の記録一覧」は、1件ずつ別のメモにする
    if (src) src.memos.forEach(m => memoBlocks.push(longText(m.title, m.body)));

    // ======== 技能の読み取り（成長チェックのメモに使うので先に読む） ========
    const skillTables = [];
    SKILL_CATEGORIES.forEach(cat => {
        const get = key => toArray(data[cat.prefix + key]);
        const AD = get('AD'), AS = get('AS'), AK = get('AK'), AA = get('AA'), AO = get('AO'), AP = get('AP'), AU = get('AU');
        const names = get('AName');

        // 1行分の数字を読む。合計値（AP）と内訳が合わないときは、差を成長分（減っていればその他）に入れる
        // （保管所のJSONで成長値が抜けることがあるための対策。CoCキャラシ保管スプレッドシートと同じ）
        const readRow = i => {
            const r = { init: int(AD[i]), job: int(AS[i]), interest: int(AK[i]), growth: int(AA[i]), other: int(AO[i]) };
            const total = int(AP[i]);
            const diff = total - (r.init + r.job + r.interest + r.growth + r.other);
            if (total !== 0 && diff !== 0) { if (diff > 0) r.growth += diff; else r.other += diff; }
            r.total = r.init + r.job + r.interest + r.growth + r.other;
            r.checked = str(AU[i]) !== '' && str(AU[i]) !== '0';
            return r;
        };

        const rows = [];
        cat.skills.forEach((sk, i) => {
            const r = readRow(i);
            const bunya = sk.bunya ? str(data[sk.bunya]) : '';
            r.label = bunya ? `${sk.name || sk.hokan}（${bunya}）` : sk.name || sk.hokan;
            r.hokanName = bunya ? `${sk.hokan}（${bunya}）` : sk.hokan;
            r.autoBase = typeof sk.base === 'function' ? sk.base(ab) : sk.base;
            r.isDefault = true;
            rows.push(r);
        });

        // 追加技能（配列の、基本技能のうしろにある分）
        names.forEach((rawName, j) => {
            const hokanName = str(rawName);
            if (!hokanName) return;
            const r = readRow(cat.skills.length + j);
            const mapped = mapExtraSkill(hokanName, ab);
            r.label = mapped.label;
            r.hokanName = hokanName;
            r.autoBase = mapped.custom ? null : mapped.autoBase;
            r.custom = !!mapped.custom;
            rows.push(r);
        });
        skillTables.push({ title: cat.title, rows });
    });

    // 同じ技能が2行あるとき（基本技能を、同じ名前で追加し直しているキャラシ）は1行にまとめる
    // ポイントの入っていない行を外し、それでも残るときは合計の大きい方を使う
    // 独自技能は、同じ名前でも別の技能として持てるのでまとめない
    const allRows = skillTables.flatMap(t => t.rows);
    const untouched = r => r.job === 0 && r.interest === 0 && r.growth === 0 && r.other === 0;
    const dropped = new Set();
    const byLabel = new Map();
    allRows.filter(r => !r.custom).forEach(r => {
        if (!byLabel.has(r.label)) byLabel.set(r.label, []);
        byLabel.get(r.label).push(r);
    });
    byLabel.forEach((group, label) => {
        if (group.length < 2) return;
        let rest = group.filter(r => !untouched(r));
        if (rest.length === 0) rest = [group[0]];
        group.filter(r => !rest.includes(r)).forEach(r => dropped.add(r));
        if (rest.length > 1) {
            const keep = rest.reduce((a, b) => (b.total > a.total ? b : a));
            rest.filter(r => r !== keep).forEach(r => dropped.add(r));
            warnings.push(`「${label}」が${rest.length}つあったので、合計の大きい方（${keep.total}%）を使いました。`);
        }
        const kept = group.find(r => !dropped.has(r));
        if (group.some(r => r.checked)) kept.checked = true;
    });
    skillTables.forEach(t => { t.rows = t.rows.filter(r => !dropped.has(r)); });
    const growthChecked = skillTables.flatMap(t => t.rows).filter(r => r.checked).map(r => r.hokanName);

    // 初期値：キャラッシュの自動計算と同じなら「値 @自動」、違えば固定値（独自技能は固定値のみ）
    const initCell = r => (r.autoBase != null && r.init === r.autoBase) ? `${r.init} @自動` : `${r.init}`;
    skillTables.forEach(t => {
        t.cells = t.rows.map(r => [r.custom ? `独自技能：${r.label}` : r.label, initCell(r), r.job, r.interest, r.growth, r.other]);
    });

    if (opt.growthMemo && growthChecked.length) {
        memoBlocks.push(longText('成長チェック',
            `${siteName}で成長チェックが付いていた技能です。`
            + '\n不必要な場合は、このメモは消してください。\n\n' + growthChecked.join('、')));
    }

    if (opt.memoTarget !== 'system' && memoBlocks.length) {
        push('【共通メモ】', '');
        memoBlocks.forEach(b => push(...b, ''));
    }

    // ======== クトゥルフ6版 ========
    push('【クトゥルフ6版】', '', '【能力値】', '');
    // 元の値 = 作成時の値、その他 = 今の値との差（成長・特徴表など）。増減（年齢修正）は保管所にないので0
    // （Charaenoには年齢修正の欄があるので、増減に入れる）
    const ageAdjust = i => (src && src.ageAdjust ? src.ageAdjust[i] : 0);
    push(...tableLines(['能力', '元の値', '増減', 'その他'],
        ABILITY_NAMES.map((n, i) => [n, base[i + 1], ageAdjust(i), now[i + 1] - base[i + 1] - ageAdjust(i)])));
    push('');

    // HP・MP・ダメージボーナス・アイデア・幸運・知識：キャラッシュの自動計算と同じなら @自動、違えば固定値
    const autoOrFixed = (value, auto) => value === auto ? `${value} @自動` : `${value}`;
    push(fieldLine('HP', autoOrFixed(now[9], Math.ceil((ab.CON + ab.SIZ) / 2))));
    push(fieldLine('MP', autoOrFixed(now[10], ab.POW)));
    // SAN：キャラッシュは「現在SAN = POW×5 + SAN補正」なので、補正 = 現在SAN − POW×5
    const san = str(data.SAN_Left) !== '' ? int(data.SAN_Left) : now[11];
    push(fieldLine('SAN補正', san - ab.POW * 5));
    const db = normalizeDb(data.dmg_bonus);
    const dbAuto = calcDamageBonus(ab.STR + ab.SIZ);
    push(fieldLine('ダメージボーナス', str(data.dmg_bonus) === '' || db === dbAuto ? `${dbAuto} @自動` : str(data.dmg_bonus)));
    push(fieldLine('アイデア', autoOrFixed(now[12], ab.INT * 5)));
    push(fieldLine('幸運', autoOrFixed(now[13], ab.POW * 5)));
    push(fieldLine('知識', autoOrFixed(now[14], Math.min(ab.EDU * 5, 99))));
    push('');

    // 職業P・興味P：保管所の総量（追加分込み）から、合う計算式と補正を求める
    push('【採用ルールとポイント】', '');
    // 特徴表：キャラッシュでは「クトゥルフ2015」の選択ルール「探索者の特徴」に書く欄がある
    const traitsText = !opt.traits ? '' : typeof opt.traitsText === 'string' ? opt.traitsText.trim() : findTraits(data.pc_making_memo);
    if (traitsText) {
        push(fieldLine('採用ルール', 'クトゥルフ2015, 探索者の特徴'));
        push(fieldLine('探索者の特徴の内容', traitsText));
    }
    if (str(data.TS_Maximum) !== '') {
        const occTotal = int(data.TS_Maximum);
        const occBase = occTotal - int(data.TS_Add);
        // Charaenoは計算式の種類が分かるので、それを使う（値だけで探すと、同じ値になる別の式と間違えることがある）
        const found = (src && OCCUPATION_FORMULAS.find(([n]) => n === src.occFormula))
            || OCCUPATION_FORMULAS.find(([, f]) => f(ab) === occBase) || OCCUPATION_FORMULAS[0];
        push(fieldLine('職業ポイント計算式', found[0]));
        push(fieldLine('職業ポイント補正', occTotal - found[1](ab)));
    }
    if (str(data.TK_Maximum) !== '') {
        push(fieldLine('興味ポイント補正', int(data.TK_Maximum) - ab.INT * 10));
    }
    push('');

    push('【技能】', '');
    skillTables.forEach(t => {
        push(`［${t.title}］`, '');
        push(...tableLines(['技能名', '初期値', '職業P', '興味P', '成長分', 'その他'], t.cells));
        push('');
    });

    // 武器：成功率はキャラッシュに入れる列がないので、備考の先頭に入れる
    // 成功率の欄に技能名（〈拳銃〉など）を書いているキャラシもあるので、数字のときだけ「%」を付ける
    const arms = toArray(data.arms_name).map((n, i) => {
        const at = k => str(toArray(data[k])[i]);
        if (!str(n)) return null;
        const hit = at('arms_hit');
        const hitNote = !hit ? '' : /^[0-9０-９]+[%％]?$/.test(hit) ? `成功率: ${hit.replace(/[%％]$/, '')}%` : `使用技能: ${hit}`;
        // その他の欄の「故障ナンバー100」「故障98」は、キャラッシュの故障NOの列に入れる
        let sonota = at('arms_sonota');
        // Charaenoには故障ナンバーの欄がある
        let malfunction = at('arms_malfunction');
        const fm = malfunction ? null : sonota.match(/故障(?:ナンバー|No\.?|NO|ＮＯ|番号|率)?[\s:：]*([0-9０-９]+)/i);
        if (fm) {
            malfunction = String(int(fm[1]));
            sonota = sonota.replace(fm[0], '').replace(/^[\s　、,/／]+|[\s　、,/／]+$/g, '');
        }
        const note = [hitNote, sonota].filter(Boolean).join(' / ');
        return [str(n), 1, note, at('arms_damage'), malfunction, at('arms_range'), at('arms_attack_count'), at('arms_last_shot'), at('arms_vitality')];
    }).filter(Boolean);
    if (arms.length) {
        push('【武器】', '');
        push(...tableLines(['名称', '個数', '備考', 'ダメージ', '故障NO', '射程', '攻撃回数', '装弾数', '耐久力'], arms));
        push('');
    }

    // 所持品：単価・価格は備考のうしろに付ける
    const items = toArray(data.item_name).map((n, i) => {
        const at = k => str(toArray(data[k])[i]);
        if (!str(n)) return null;
        const extra = [];
        if (at('item_tanka') && at('item_tanka') !== '0') extra.push(`単価: ${at('item_tanka')}`);
        if (at('item_price') && at('item_price') !== '0') extra.push(`価格: ${at('item_price')}`);
        const note = [at('item_memo'), extra.join(' / ')].filter(Boolean).join(' / ');
        return [str(n), at('item_num') || 1, note];
    }).filter(Boolean);
    if (items.length) {
        push('【システム別の所持品】', '');
        push(...tableLines(['名前', '個数', '備考'], items));
        push('');
    }

    // 経験の記録（Charaenoの「読んだ魔導書」「負傷」などの欄）
    const experience = src ? src.experience.filter(([, v]) => str(v) !== '') : [];
    if (experience.length) {
        push('【システム別の経験の記録】', '');
        push(...experience.map(([k, v]) => fieldLine(k, v.toString().trim())));
        push('');
    }

    if (opt.memoTarget === 'system' && memoBlocks.length) {
        push('【システム別メモ】', '');
        memoBlocks.forEach(b => push(...b, ''));
    }

    return {
        text: lines.join('\n').replace(/\n+$/, '') + '\n',
        name: name || '名無し',
        warnings,
        summary: {
            name, kana,
            skills: skillTables.reduce((n, t) => n + t.rows.length, 0),
            arms: arms.length, items: items.length, traits: traitsText,
            growthChecked,
        },
    };
}

// 追加技能の名前を、キャラッシュでの書き方に読みかえる
function mapExtraSkill(hokanName, ab) {
    const n = hokanName.replace(/\(/g, '（').replace(/\)/g, '）').trim();
    const m = n.match(/^(.+?)（(.+)）$/);
    const head = m ? m[1].trim() : n;
    const bunya = m ? m[2].trim() : '';

    // 言語（「その他の言語（英語）」「英語」は除く。分野がある書き方だけ）
    if (bunya && LANGUAGE_NAMES.includes(head)) return { label: `ほかの言語（${bunya}）`, autoBase: 1 };
    if (head === '母国語') return { label: bunya ? `母国語（${bunya}）` : '母国語', autoBase: ab.EDU * 5 };
    // 分野つきの基本技能（芸術（歌唱）など）
    if (bunya && head in SPECIALTY_SKILLS) return { label: `${head}（${bunya}）`, autoBase: SPECIALTY_SKILLS[head] };
    // 名前がそのまま基本技能と同じとき（保管所の書き方の違いも吸収）
    for (const cat of SKILL_CATEGORIES) {
        for (const sk of cat.skills) {
            if (n === sk.hokan || n === sk.name) {
                return { label: sk.name || sk.hokan, autoBase: typeof sk.base === 'function' ? sk.base(ab) : sk.base };
            }
        }
    }
    // それ以外はキャラッシュの「独自技能」として取り込む（初期値は固定値のみ）
    return { label: hokanName, custom: true };
}

// ==========================================
// Charaeno（CoC6版）のデータ → 保管所と同じ形への読みかえ
// 読みかえたあとは、保管所と同じ convertToCharash() で変換する（ふりがな・特徴表・同じ技能の整理なども同じに動く）
// 使うデータ：
//   https://charaeno.com/api/v1/6th/{ID}         … 技能の内訳（職業P・興味P・成長・その他）まで入っている。
//                                                  Charaeno自身の「Charaenoからインポート」もこれを使っている
//   https://charaeno.com/api/v1/6th/{ID}/summary … 開発者向けに公開されている要約。技能は合計値だけなので、
//                                                  上のデータが読めなかったときだけ使う（summaryToDetail で同じ形にする）
// info：{ id, records: [{ title, text }]（公開の記録）, hiddenRecords（読めなかった記録の数）, recordsFailed, fromSummary }
// ==========================================
const CHARAENO_OCCUPATION = {
    edu20: 'EDU×20', edu10str10: 'STR×10+EDU×10', edu10con10: 'CON×10+EDU×10', edu10pow10: 'POW×10+EDU×10',
    edu10dex10: 'DEX×10+EDU×10', edu10app10: 'APP×10+EDU×10', edu10siz10: 'SIZ×10+EDU×10', edu10int10: 'INT×10+EDU×10',
};
const CHARAENO_ABILITY_KEYS = ['str', 'con', 'pow', 'dex', 'app', 'siz', 'int', 'edu'];
// Charaenoでの技能名 → 保管所での名前（違うものだけ）
const CHARAENO_SKILL_ALIASES = { 'こぶし': 'こぶし（パンチ）', 'パンチ': 'こぶし（パンチ）', '組みつき': '組み付き' };

// 技能名（かっこの前）から、保管所の基本技能を探す。{ cat, sk, index } か null
function findDefaultSkill(head) {
    const n = CHARAENO_SKILL_ALIASES[head] || head;
    for (const cat of SKILL_CATEGORIES) {
        const index = cat.skills.findIndex(sk => sk.hokan === n || sk.name === n);
        if (index >= 0) return { cat, sk: cat.skills[index], index };
    }
    return null;
}

// 「運転（自動車）」→ { head: '運転', bunya: '自動車' }
function splitSkillName(name) {
    const n = str(name).replace(/\(/g, '（').replace(/\)/g, '）');
    const m = n.match(/^(.+?)（(.*)）$/);
    return m ? { head: m[1].trim(), bunya: m[2].trim() } : { head: n, bunya: '' };
}

// キャラッシュの自動計算の初期値（基本技能・分野つきの技能だけ。独自技能は null）
function autoBaseOf(head, ab) {
    const d = findDefaultSkill(head);
    if (d) return typeof d.sk.base === 'function' ? d.sk.base(ab) : d.sk.base;
    if (head === '母国語') return ab.EDU * 5;
    if (head in SPECIALTY_SKILLS) return SPECIALTY_SKILLS[head];
    if (LANGUAGE_NAMES.includes(head)) return 1;
    return null;
}

// 要約（合計値だけ）を、内訳つきのデータと同じ形にする。初期値から増えた分は「その他」に入れる
function summaryToDetail(s) {
    const ch = s.characteristics || {};
    const ab = {};
    CHARAENO_ABILITY_KEYS.forEach((k, i) => { ab[ABILITY_NAMES[i]] = int(ch[k]); });
    const at = s.attribute || {};
    const addition = (value, auto) => ({ addition: value == null || value === '' ? 0 : int(value) - auto });
    return Object.assign({}, s, {
        characteristics: Object.fromEntries(CHARAENO_ABILITY_KEYS.map(k => [k, { base: int(ch[k]) }])),
        attribute: {
            hp: addition(at.hp, Math.ceil((ab.CON + ab.SIZ) / 2)),
            mp: addition(at.mp, ab.POW),
            san: at.san && typeof at.san === 'object' ? at.san.value : at.san,
            luck: addition(at.luck, ab.POW * 5),
            idea: addition(at.idea, ab.INT * 5),
            know: addition(at.know, Math.min(ab.EDU * 5, 99)),
            db: { value: str(at.db) },
        },
        skills: toArray(s.skills).map(sk => {
            const total = int(sk.value);
            const base = autoBaseOf(splitSkillName(sk.name).head, ab);
            // 独自技能は初期値が分からないので、合計値をそのまま初期値にする
            return base == null ? { name: sk.name, base: total, additionalSkill: true } : { name: sk.name, base, other: total - base };
        }),
        melees: [], firearms: [],
        wapons: s.weapons,
    });
}

function charaenoToSheet(detail, info) {
    const c = detail || {};
    const inf = info || {};
    const data = { pc_name: str(c.name), data_title: '', pc_making_memo: str(c.note) ? c.note : '', pc_tags: '' };

    // --- 能力値（元の値・年齢修正・その他の追加） ---
    const ch = c.characteristics || {};
    const ab = {};
    const ageAdjust = [];
    CHARAENO_ABILITY_KEYS.forEach((k, i) => {
        const v = ch[k] && typeof ch[k] === 'object' ? ch[k] : { base: ch[k] };
        const base = int(v.base), adj = int(v.ageAdjust), add = int(v.addition);
        data['NA' + (i + 1)] = base;
        data['NP' + (i + 1)] = base + adj + add;
        ageAdjust.push(adj);
        ab[ABILITY_NAMES[i]] = base + adj + add;
    });
    const at = c.attribute || {};
    const addOf = k => int(at[k] && typeof at[k] === 'object' ? at[k].addition : 0);
    const derived = [
        Math.ceil((ab.CON + ab.SIZ) / 2) + addOf('hp'), ab.POW + addOf('mp'), ab.POW * 5,
        ab.INT * 5 + addOf('idea'), ab.POW * 5 + addOf('luck'), Math.min(ab.EDU * 5, 99) + addOf('know'),
    ];
    derived.forEach((v, i) => { data['NA' + (i + 9)] = v; data['NP' + (i + 9)] = v; });
    const san = at.san && typeof at.san === 'object' ? at.san.value : at.san;
    data.SAN_Left = san == null || san === '' ? '' : int(san);
    data.dmg_bonus = at.db && typeof at.db === 'object' ? str(at.db.value) : str(at.db);

    // --- 職業P・興味P ---
    let occFormula = '';
    const sp = c.skillPoint;
    if (sp) {
        const type = sp.occupationType || 'edu20';
        const formula = OCCUPATION_FORMULAS.find(([n]) => n === CHARAENO_OCCUPATION[type]);
        if (formula) {
            occFormula = formula[0];
            data.TS_Maximum = formula[1](ab);
        } else if (type === 'manual' && sp.occupationManualPoints != null) {
            // 手入力の職業Pは「EDU×20 ＋ 補正」の形にする
            occFormula = 'EDU×20';
            data.TS_Maximum = int(sp.occupationManualPoints);
        }
        data.TS_Add = 0;
        data.TK_Maximum = ab.INT * 10 + int(sp.interestAdditionalPoints);
    }

    // --- 技能 ---
    // Charaenoの技能を1行ずつに並べる（分野のある技能は、分野ごとに1行）
    const weaponNames = toArray(c.wapons || c.weapons).map(w => str(w && w.name)).filter(Boolean);
    const rows = [];
    const addRow = (sk, sub, group) => {
        const v = sub || sk;
        const parsed = splitSkillName(sk.name);
        const r = {
            head: parsed.head, bunya: sub ? str(sub.name) : parsed.bunya,
            init: int(v.base), job: int(v.occupation), interest: int(v.interest), growth: int(v.growth), other: int(v.other),
            checked: !!v.checked, additional: !!sk.additionalSkill, group,
        };
        r.touched = r.job !== 0 || r.interest !== 0 || r.growth !== 0 || r.other !== 0;
        r.fullName = r.bunya ? `${r.head}（${r.bunya}）` : r.head;
        rows.push(r);
    };
    [['skills', 'skill'], ['melees', 'melee'], ['firearms', 'firearm']].forEach(([key, group]) => {
        toArray(c[key]).forEach(sk => {
            if (!sk || !str(sk.name)) return;
            const subs = toArray(sk.subdivision);
            if (subs.length) subs.forEach(sub => addRow(sk, sub, group));
            else addRow(sk, null, group);
        });
    });

    // 基本技能の欄に入れる行を決める。分野のある技能（運転など）は、ポイントの入っている最初の行を入れ、
    // ほかにポイントの入っている行があれば追加技能にする。ポイントの入っていない残りの行は入れない
    const slot = new Map();
    const used = new Set();
    SKILL_CATEGORIES.forEach(cat => cat.skills.forEach(sk => {
        const cands = rows.filter(r => !r.additional && !used.has(r) && findDefaultSkill(r.head) && findDefaultSkill(r.head).sk === sk && (sk.bunya || !r.bunya));
        const pick = cands.find(r => r.touched) || cands[0];
        if (pick) { slot.set(sk, pick); used.add(pick); }
        cands.filter(r => r !== pick && !r.touched).forEach(r => used.add(r));
    }));

    // 追加技能を入れる分類：基本技能の仲間ならその分類、言語は交渉技能、
    // 格闘・火器の追加と、武器と同じ名前の技能は戦闘技能、ほかは知識技能
    const extraCat = r => {
        const d = findDefaultSkill(r.head);
        if (d) return d.cat.prefix;
        if (r.head === '母国語' || LANGUAGE_NAMES.includes(r.head)) return 'TC';
        if (r.group !== 'skill' || weaponNames.includes(r.fullName) || weaponNames.includes(r.head)) return 'TB';
        if (r.head in SPECIALTY_SKILLS) return r.head === '芸術' ? 'TK' : 'TA';
        return 'TK';
    };
    // 独自に追加した技能はポイントがなくても入れる。もともとある行でポイントのないものは入れない
    const extras = rows.filter(r => !used.has(r) && (r.touched || r.additional));

    SKILL_CATEGORIES.forEach(cat => {
        const list = cat.skills.map(sk => {
            const r = slot.get(sk);
            if (sk.bunya) data[sk.bunya] = r ? r.bunya : '';
            return r || { init: typeof sk.base === 'function' ? sk.base(ab) : sk.base, job: 0, interest: 0, growth: 0, other: 0 };
        });
        const ex = extras.filter(r => extraCat(r) === cat.prefix);
        const all = [...list, ...ex];
        const put = (key, f) => { data[cat.prefix + key] = all.map(f); };
        put('AD', r => r.init); put('AS', r => r.job); put('AK', r => r.interest); put('AA', r => r.growth); put('AO', r => r.other);
        put('AP', r => r.init + r.job + r.interest + r.growth + r.other);
        put('AU', r => (r.checked ? '1' : ''));
        data[cat.prefix + 'AName'] = ex.map(r => r.fullName);
    });

    // --- 武器・所持品 ---
    const arms = toArray(c.wapons || c.weapons).filter(w => w && str(w.name));
    const armsKeys = [['arms_name', 'name'], ['arms_hit', 'value'], ['arms_damage', 'damage'], ['arms_range', 'range'],
        ['arms_attack_count', 'attacks'], ['arms_last_shot', 'ammo'], ['arms_malfunction', 'malfunction'], ['arms_vitality', 'hp']];
    armsKeys.forEach(([k, ck]) => { data[k] = arms.map(w => str(w[ck])); });
    const items = toArray(c.possessions).filter(p => p && str(p.name));
    data.item_name = items.map(p => str(p.name));
    data.item_num = items.map(p => str(p.count));
    data.item_memo = items.map(p => str(p.detail));

    // --- 基本情報 ---
    data.shokugyo = str(c.occupation);
    data.age = str(c.age);
    data.sex = str(c.sex);
    data.pc_kigen = str(c.birthplace);

    const pd = c.personalData || {};
    const cr = c.credit || {};
    const joinLines = (...vs) => vs.map(str).filter(Boolean).join('\n');
    const url = inf.id ? `https://charaeno.com/6th/${inf.id}` : '';

    // 「この探索者の記録一覧」の公開の記録。タイトルは【】で囲むので、中の【】は［］にする
    const memos = toArray(inf.records).filter(r => r && (str(r.title) || str(r.text))).map(r => ({
        title: (str(r.title) || 'Charaenoの記録').replace(/【/g, '［').replace(/】/g, '］'),
        body: str(r.text) ? r.text.toString().trim() : '',
    }));

    const warnings = [];
    if (inf.fromSummary) warnings.push('技能の内訳を読み込めなかったので、初期値から増えた分を「その他」に入れました。');
    if (inf.hiddenRecords) warnings.push(`パスワード認証・非公開の記録（${inf.hiddenRecords}件）は読み込めないため、移していません。`);
    if (inf.failedRecords) warnings.push(`記録のうち${inf.failedRecords}件を読み込めなかったので、その記録は移していません。`);
    if (inf.recordsFailed) warnings.push('「この探索者の記録一覧」を読み込めなかったので、記録は移していません。');

    data._src = {
        site: 'Charaeno',
        ageAdjust,
        occFormula,
        free: [
            ['学校・学位', c.degree], ['住所', pd.address], ['描写', pd.description], ['家族＆友人', pd.family],
            ['収入', cr.income], ['手持ち現金', cr.cache != null ? cr.cache : cr.cash], ['預金', cr.deposit],
            ['個人資産', cr.personalProperty], ['不動産', cr.realEstate], ['Charaeno', url],
        ],
        experience: [
            ['書物・文献', c.mythosTomes], ['アーティファクト', c.artifactsAndSpells],
            ['負傷・傷痕など', joinLines(pd.injuries, pd.scar)], ['心の傷', joinLines(c.mentalDisorder, pd.insanity)],
            ['遭遇した存在', c.encounters],
        ],
        memos,
        warnings,
    };
    return data;
}

// ファイル名に使えない文字を除く
function safeFileName(name) {
    return (name || '名無し').replace(/[\\/:*?"<>|\r\n\t]/g, '_').slice(0, 60);
}

// Node.js でのテスト用（ブラウザでは何もしない）
if (typeof module !== 'undefined') {
    module.exports = { parseSheetKey, isCharaenoKey, sheetUrlOf, charaenoToSheet, summaryToDetail, toArray, convertToCharash, splitNameKana, guessNameKana, convertHalfKana, parseTags, findTraits, mapExtraSkill, calcDamageBonus, safeFileName };
}
