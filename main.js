// ==========================================
// 画面の動作（変換のルールは converter.js、ZIPは zip.js）
// ==========================================

// キャラクター保管所は、続けて速く読み込むと「混み合っています」（503）を返す（試したところ、およそ1秒に1件まで）。
// 負荷を避けるため、前の読み込みを始めてから少なくともこれだけ間をあける（ミリ秒）
const FETCH_INTERVAL_MS = 1200;
// 一度でも「混み合っています」が返ってきたら、その回の残りはこの間隔に広げる（ミリ秒）
const SLOW_FETCH_INTERVAL_MS = 2000;
// 読み込めなかったとき、自動でやり直すまでの待ち時間（ミリ秒）。この回数だけやり直す
const RETRY_WAITS_MS = [3000, 6000];
// キャラッシュが1回のインポートで取り込める人数（ZIPをこの人数ずつに分ける）
const CHARASH_IMPORT_LIMIT = 50;
// これより多いときは、保管所の負荷を下げるため、はじめから SLOW_FETCH_INTERVAL_MS の間隔で読み込む
const LARGE_BATCH = 300;

// 件数から、読み込みにかかる時間の目安（分）を出す
function intervalFor(count) { return count > LARGE_BATCH ? SLOW_FETCH_INTERVAL_MS : FETCH_INTERVAL_MS; }
function estimateMinutes(count) { return Math.max(1, Math.ceil(count * intervalFor(count) / 60000)); }

const urlInput = document.getElementById('url-input');
const urlCount = document.getElementById('url-count');
const convertBtn = document.getElementById('convert-btn');
const stopBtn = document.getElementById('stop-btn');
const messageBox = document.getElementById('message');
const progressBox = document.getElementById('progress');
const resultBox = document.getElementById('result');
const charList = document.getElementById('char-list');
const previewBox = document.getElementById('preview');
const resultText = document.getElementById('result-text');

// 読み込んだキャラの一覧。1件ずつ { key, status, data, error, name, kana, how, edited, include, result, row }
let items = [];
let previewItem = null;
let stopRequested = false;

// --- アクセス解析のイベント記録（広告ブロック等で gtag がない場合は何もしない） ---
function trackEvent(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
}

function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = text ? `message show ${type}` : 'message';
}

function getOptions() {
    return {
        splitKana: document.getElementById('opt-kana').checked,
        growthMemo: document.getElementById('opt-growth').checked,
        memoTarget: document.querySelector('input[name="opt-memo"]:checked').value,
        halfKana: document.querySelector('input[name="opt-halfkana"]:checked').value,
        traits: document.getElementById('opt-traits').checked,
    };
}

// --- 入力欄からURLを読み取る（空白・改行・カンマ区切り。同じキャラの重複は1つにする） ---
function readUrls(text) {
    const keys = [];
    const invalid = [];
    text.split(/[\s,、]+/).filter(Boolean).forEach(token => {
        try {
            const key = parseSheetKey(token);
            if (!keys.includes(key)) keys.push(key);
        } catch (e) {
            invalid.push(token);
        }
    });
    return { keys, invalid };
}

urlInput.addEventListener('input', () => {
    const { keys, invalid } = readUrls(urlInput.value);
    urlCount.textContent = !keys.length ? ''
        : `${keys.length}件・目安 約${estimateMinutes(keys.length)}分`
        + (keys.length > LARGE_BATCH ? `（${LARGE_BATCH}件を超えるので、ゆっくり読み込みます）` : '')
        + (invalid.length ? `・URLではない行 ${invalid.length}件` : '');
});

// --- キャラクター保管所からJSONを取得する ---
// kind：読み込めなかった理由。'notfound'（非公開・削除・混雑）・'network'（接続できない）・'http'・'parse'・'notcoc'・'dup'・'stopped'
// 'notcoc'（6版ではない）と 'dup'（重複）以外は、「読み込めなかったものをもう一度」の対象にする
class LoadError extends Error {
    constructor(message, kind) { super(message); this.kind = kind; }
}
const NOT_FOUND_MESSAGE = 'キャラシを読み込めませんでした。非公開・削除されているか、キャラクター保管所が混み合っていた可能性があります（非公開のキャラシは読み込めません）。'
    + '公開しているキャラシなら、少し時間をおいて「読み込めなかったものをもう一度」を押してください。';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 前の読み込みを始めてから fetchInterval たつまで待ってから読み込む
// （返事が速い環境でも、保管所の「1秒に1件まで」を超えないように、始めた時刻で間をあける）
let lastFetchAt = 0;
let fetchInterval = FETCH_INTERVAL_MS;
async function pacedFetch(url, options) {
    const wait = lastFetchAt + fetchInterval - Date.now();
    if (wait > 0) await sleep(wait);
    lastFetchAt = Date.now();
    return fetch(url, options);
}

// 1回だけ読み込む
// 保管所は、キャラシが見つからないとき（非公開・削除）や混み合っているとき（503）の返事に
// 「他のサイトから読んでよい」という許可を付けていない。そのためブラウザからは、どれも同じエラー（'blocked'）に見える
async function fetchOnce(url) {
    let res;
    try {
        res = await pacedFetch(url, { cache: 'no-cache' });
    } catch (e) {
        throw new LoadError('', 'blocked');
    }
    if (res.status === 404) throw new LoadError(NOT_FOUND_MESSAGE, 'notfound');
    if (!res.ok) throw new LoadError(`キャラクター保管所からの取得に失敗しました（エラー: ${res.status}）。しばらくしてから「読み込めなかったものをもう一度」を押してください。`, 'http');
    try {
        return await res.json();
    } catch (e) {
        throw new LoadError('キャラシのデータを読み取れませんでした。URLが正しいか確認してください。', 'parse');
    }
}

// 読み込めなかったときは、少し待って自動でやり直す（混み合っているだけなら、たいてい2回目以降で読める）
// onRetry(待つミリ秒) … やり直す前に呼ぶ（画面に「待っています」と出すため）
async function fetchCharacterJson(key, onRetry) {
    const url = `https://charasheet.vampire-blood.net/${key}.json`;
    for (let attempt = 0; ; attempt++) {
        try {
            return await fetchOnce(url);
        } catch (e) {
            const canRetry = (e.kind === 'blocked' || e.kind === 'http') && attempt < RETRY_WAITS_MS.length && !stopRequested;
            if (canRetry) {
                // 混み合っているので、この回の残りは間を広げて読み込む
                fetchInterval = SLOW_FETCH_INTERVAL_MS;
                if (onRetry) onRetry(RETRY_WAITS_MS[attempt]);
                await sleep(RETRY_WAITS_MS[attempt]);
                continue;
            }
            if (e.kind !== 'blocked') throw e;
            // 中身を読まない形でもう一度送り、保管所から返事があるかどうかで「接続できない」と見分ける
            if (await isReachable(url)) throw new LoadError(NOT_FOUND_MESSAGE, 'notfound');
            throw new LoadError('キャラクター保管所に接続できませんでした。インターネットの接続を確認して、しばらくしてから「読み込めなかったものをもう一度」を押してください。', 'network');
        }
    }
}

// 中身は読めないが、保管所から返事があるかだけを確かめる
async function isReachable(url) {
    try {
        await pacedFetch(url, { mode: 'no-cors', cache: 'no-store' });
        return true;
    } catch (e) {
        return false;
    }
}

// --- 名前・かなの初期値（自動で分ける）。手で直したキャラはそのまま ---
function applyAutoName(item) {
    if (item.edited) return;
    const full = (item.data.pc_name || item.data.data_title || '').toString().trim();
    const opt = getOptions();
    const split = opt.splitKana ? guessNameKana(item.data) : { name: full, kana: '', how: 'none' };
    item.name = split.name;
    item.kana = convertHalfKana(split.kana, opt.halfKana);
    item.how = split.how;
}

function convertItem(item) {
    item.result = convertToCharash(item.data, Object.assign(getOptions(), {
        nameOverride: { name: item.name, kana: item.kana },
        tags: item.tags,
        traitsText: item.traits,
    }));
}

// ZIPの中で同じファイル名にならないようにする（同じ名前のキャラは末尾にIDを付ける）
function fileNameOf(item, usedNames) {
    let base = safeFileName(item.name);
    if (usedNames && usedNames.has(base)) base = `${base}_${item.id}`;
    if (usedNames) usedNames.add(base);
    return `${base}.txt`;
}

function textBytes(text) {
    // キャラッシュの書き出しと同じ、BOM付きのUTF-8
    return new TextEncoder().encode('﻿' + text);
}

function downloadBlob(blob, fileName) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ==========================================
// 一覧の表示
// ==========================================
function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
}

function buildRow(item) {
    const row = el('div', 'char-row');
    item.row = row;
    charList.appendChild(row);
    updateRow(item);
}

function updateRow(item) {
    const row = item.row;
    row.innerHTML = '';
    row.className = 'char-row' + (item.status === 'error' ? ' error' : '') + (item === previewItem ? ' selected' : '');
    const sheetUrl = `https://charasheet.vampire-blood.net/${item.id || item.key}`;

    if (item.status === 'loading' || item.status === 'waiting') {
        row.appendChild(el('div', 'char-status', item.status === 'loading' ? '⏳' : '・'));
        row.appendChild(el('div', 'char-main char-sub', `${sheetUrl}　${item.status === 'loading' ? '読み込み中…' : '順番待ち'}`));
        return;
    }
    if (item.status === 'error') {
        row.appendChild(el('div', 'char-status', '❌'));
        const main = el('div', 'char-main');
        const link = el('a', '', sheetUrl);
        link.href = sheetUrl; link.target = '_blank';
        main.appendChild(link);
        main.appendChild(el('div', 'char-error', item.error));
        row.appendChild(main);
        return;
    }

    // 変換できたキャラ
    const check = el('input');
    check.type = 'checkbox';
    check.checked = item.include;
    check.title = 'ZIPに入れる';
    check.addEventListener('change', () => { item.include = check.checked; updateSummary(); });
    const status = el('label', 'char-status');
    status.appendChild(check);
    row.appendChild(status);

    const main = el('div', 'char-main');
    const fields = el('div', 'char-fields');
    const makeField = (label, key, placeholder) => {
        const wrap = el('label', 'char-field');
        wrap.appendChild(el('span', '', label));
        const input = el('input');
        input.value = item[key];
        input.placeholder = placeholder;
        input.addEventListener('input', () => {
            item[key] = input.value;
            item.edited = true;
            convertItem(item);
            if (previewItem === item) showPreview(item);
            noteEl.textContent = noteText();
        });
        wrap.appendChild(input);
        return wrap;
    };
    fields.appendChild(makeField('名前', 'name', '名前'));
    fields.appendChild(makeField('かな', 'kana', '（なし）'));
    main.appendChild(fields);

    const original = (item.data.pc_name || item.data.data_title || '').toString().trim();
    const noteText = () => {
        const how = item.edited ? '手で直しました'
            : { auto: '名前からかなを分けました', title: 'かなはタイトルから見つけました', memo: 'かなはメモから見つけました' }[item.how]
            || 'かなは見つかりませんでした';
        return `保管所の名前：${original || '（空）'}　・　${how}`;
    };
    const noteEl = el('div', 'char-sub', noteText());
    main.appendChild(noteEl);

    // 探索者の特徴（メモから見つけた特徴表。ここで直せる）
    if (getOptions().traits) {
        const box = el('details', 'char-traits');
        box.open = item.traitsOpen || false;
        box.addEventListener('toggle', () => { item.traitsOpen = box.open; });
        const summaryText = () => item.traits.trim()
            ? `探索者の特徴：${item.traitsEdited ? '手で直しました' : 'メモから見つけました'}（${item.traits.trim().split(/\n/).length}行）`
            : '探索者の特徴：見つかりませんでした（ここに書くと入ります）';
        const summary = el('summary', '', summaryText());
        const area = el('textarea', 'traits-text');
        area.value = item.traits;
        area.placeholder = '例：1-5 天才：生まれつき頭の回転が速い。INT+1。';
        area.addEventListener('input', () => {
            item.traits = area.value;
            item.traitsEdited = true;
            summary.textContent = summaryText();
            convertItem(item);
            if (previewItem === item) showPreview(item);
        });
        box.appendChild(summary);
        box.appendChild(area);
        main.appendChild(box);
    }

    // タグ（✕でこのキャラだけ外す）
    if (item.tags.length) {
        const tagBox = el('div', 'char-tags');
        tagBox.appendChild(tagList(item.tags.map(tag => ({ tag })), tag => {
            item.tags = item.tags.filter(t => t !== tag);
            refreshTags([item]);
        }));
        main.appendChild(tagBox);
    }
    if (item.result.warnings.length) main.appendChild(el('div', 'char-error', item.result.warnings.join(' ')));
    row.appendChild(main);

    const actions = el('div', 'char-actions');
    const viewBtn = el('button', 'btn-sub', '中身を見る');
    viewBtn.addEventListener('click', () => showPreview(item));
    const link = el('a', 'btn-sub', '保管所 ↗');
    link.href = sheetUrl; link.target = '_blank';
    actions.appendChild(viewBtn);
    actions.appendChild(link);
    row.appendChild(actions);
}

function showPreview(item) {
    const prev = previewItem;
    previewItem = item;
    if (prev && prev !== item && prev.row) prev.row.classList.remove('selected');
    if (item.row) item.row.classList.add('selected');
    document.getElementById('preview-name').textContent = item.kana ? `${item.name}（${item.kana}）` : item.name || '名無し';
    resultText.value = item.result.text;
    previewBox.classList.add('show');
}

// --- タグ ---
// tags: [{ tag, count }]。✕を押すと onRemove(tag) を呼ぶ
function tagList(tags, onRemove) {
    const list = el('div', 'tag-list');
    tags.forEach(({ tag, count }) => {
        const chip = el('span', 'tag-chip', tag);
        if (count) chip.appendChild(el('span', 'tag-count', `${count}人`));
        const x = el('button', '', '✕');
        x.type = 'button';
        x.title = `「${tag}」を外す`;
        x.addEventListener('click', () => onRemove(tag));
        chip.appendChild(x);
        list.appendChild(chip);
    });
    return list;
}

// タグを変えたキャラを変換し直し、全員のタグの一覧も作り直す
function refreshTags(changed) {
    changed.forEach(item => {
        convertItem(item);
        updateRow(item);
    });
    if (previewItem && changed.includes(previewItem)) showPreview(previewItem);
    renderTagPanel();
}

function renderTagPanel() {
    const ok = items.filter(i => i.status === 'ok');
    const counts = new Map();
    ok.forEach(item => item.tags.forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
    const panel = document.getElementById('tag-panel');
    const box = document.getElementById('tag-all');
    // もともとタグのあるキャラがいれば表示する（全部外しても「元に戻す」を押せるように）
    panel.classList.toggle('show', ok.some(i => i.origTags.length));
    box.innerHTML = '';
    if (!counts.size) {
        box.appendChild(el('span', 'opt-desc', 'タグはありません。'));
        return;
    }
    box.appendChild(tagList([...counts].map(([tag, count]) => ({ tag, count })), tag => {
        const changed = ok.filter(i => i.tags.includes(tag));
        changed.forEach(i => { i.tags = i.tags.filter(t => t !== tag); });
        refreshTags(changed);
    }));
}

document.getElementById('tag-reset').addEventListener('click', () => {
    const ok = items.filter(i => i.status === 'ok');
    ok.forEach(i => { i.tags = [...i.origTags]; });
    refreshTags(ok);
});

function updateSummary() {
    const ok = items.filter(i => i.status === 'ok');
    const ng = items.filter(i => i.status === 'error');
    const included = ok.filter(i => i.include);
    const reasons = [
        ['notfound', '非公開・削除・混雑の可能性'], ['network', '接続できない'], ['http', '保管所のエラー'],
        ['notcoc', '6版ではない'], ['dup', '重複'], ['stopped', '中止'], ['parse', '読み取れない'],
    ].map(([kind, label]) => [label, ng.filter(i => i.errorKind === kind).length]).filter(([, n]) => n > 0);
    document.getElementById('result-summary').textContent =
        `変換できたキャラ：${ok.length}人`
        + (ng.length ? `・読み込めなかったもの：${ng.length}件（${reasons.map(([l, n]) => `${l} ${n}件`).join('、')}）` : '');

    const retryable = items.filter(isRetryable);
    const retryBtn = document.getElementById('retry-btn');
    retryBtn.hidden = retryable.length === 0;
    retryBtn.disabled = running;
    retryBtn.textContent = `🔁 読み込めなかったものをもう一度（${retryable.length}件）`;
    document.getElementById('copy-failed-btn').hidden = ng.length === 0;
    renderZipButtons(included);
}

// ==========================================
// 変換の実行
// ==========================================
// 読み込み済みのキャラのID（数字IDとMDIDで同じキャラが2回入っていないか見るため）
let seenIds = new Map();
let running = false;
// 読み込んだキャラシのデータ（URLの形 → データ）。ページを開いているあいだだけ覚えておく
const loadedCache = new Map();

// もう一度読み込んでよいもの（6版ではない・重複は、何度やっても同じなので除く）
const isRetryable = item => item.status === 'error' && item.errorKind !== 'notcoc' && item.errorKind !== 'dup';

convertBtn.addEventListener('click', () => {
    const { keys, invalid } = readUrls(urlInput.value);
    if (!keys.length) {
        showMessage(invalid.length ? 'キャラクター保管所のキャラシURLが見つかりません。\n例：https://charasheet.vampire-blood.net/XXXXXXX' : 'キャラシのURLを入れてください。', 'error');
        return;
    }
    showMessage(invalid.length ? `URLとして読み取れなかったもの（${invalid.length}件）は飛ばしました：\n${invalid.slice(0, 5).join('\n')}${invalid.length > 5 ? '\n…' : ''}` : '', 'warn');

    items = keys.map(key => ({ key, status: 'waiting', include: true, edited: false }));
    seenIds = new Map();
    previewItem = null;
    charList.innerHTML = '';
    previewBox.classList.remove('show');
    document.getElementById('tag-panel').classList.remove('show');
    resultBox.classList.add('show');
    items.forEach(buildRow);
    updateSummary();
    trackEvent('convert_start', { count: items.length });
    runQueue(items);
});

// 読み込めなかったものだけ、もう一度読み込む
document.getElementById('retry-btn').addEventListener('click', () => {
    const targets = items.filter(isRetryable);
    if (!targets.length || running) return;
    showMessage('', '');
    targets.forEach(item => { item.status = 'waiting'; updateRow(item); });
    updateSummary();
    trackEvent('retry_failed', { count: targets.length });
    runQueue(targets);
});

// 読み込めなかったURLをコピーする（あとで試すときのために）
document.getElementById('copy-failed-btn').addEventListener('click', e => {
    const urls = items.filter(i => i.status === 'error').map(i => `https://charasheet.vampire-blood.net/${i.key}`);
    if (!urls.length) return;
    const btn = e.currentTarget;
    navigator.clipboard.writeText(urls.join('\n')).then(() => {
        btn.textContent = '✅ コピーしました';
        setTimeout(() => { btn.textContent = '📋 読み込めなかったURLをコピー'; }, 2000);
    });
});

async function runQueue(targets) {
    running = true;
    convertBtn.disabled = true;
    stopBtn.hidden = false;
    stopRequested = false;
    // 件数が多いときは、はじめからゆっくり読み込む
    fetchInterval = intervalFor(items.length);
    updateSummary();

    for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        if (stopRequested) {
            item.status = 'error';
            item.error = '中止したため、読み込んでいません。';
            item.errorKind = 'stopped';
            updateRow(item);
            continue;
        }
        progressBox.textContent = `読み込み中… ${i + 1} / ${targets.length}件`;
        item.status = 'loading';
        updateRow(item);
        try {
            // このページで一度読み込んだキャラシは、保管所から読み込み直さない（保管所の負荷を減らすため）
            item.data = loadedCache.get(item.key) || await fetchCharacterJson(item.key, ms => {
                progressBox.textContent = `保管所が混み合っているため、${ms / 1000}秒待ってやり直しています… ${i + 1} / ${targets.length}件`;
            });
            loadedCache.set(item.key, item.data);
            item.id = item.data.data_id ? item.data.data_id.toString() : item.key;
            if (item.data.game && item.data.game !== 'coc') {
                throw new LoadError(`クトゥルフ神話TRPG 6版のキャラシではありません（システム：${item.data.game}）。このツールは6版のキャラシのみ対応しています。`, 'notcoc');
            }
            // 数字IDとMDIDで同じキャラが2回入っていたら、2つ目は飛ばす
            const seen = seenIds.get(item.id);
            if (seen && seen !== item) throw new LoadError('同じキャラシが、別の形のURLでもう1つ入っています（こちらは飛ばしました）。', 'dup');
            seenIds.set(item.id, item);
            item.origTags = parseTags(item.data);
            item.tags = [...item.origTags];
            item.traits = findTraits(item.data.pc_making_memo);
            applyAutoName(item);
            convertItem(item);
            item.status = 'ok';
        } catch (e) {
            item.status = 'error';
            item.error = e.message;
            item.errorKind = e.kind || 'parse';
        }
        updateRow(item);
        updateSummary();
        if (item.status === 'ok') renderTagPanel();
        if (item.status === 'ok' && !previewItem) showPreview(item);
    }

    progressBox.textContent = stopRequested ? '中止しました。' : '';
    trackEvent('convert_finish', {
        ok: items.filter(i => i.status === 'ok').length,
        failed: items.filter(i => i.status === 'error').length,
        stopped: stopRequested,
    });
    running = false;
    convertBtn.disabled = false;
    stopBtn.hidden = true;
    updateSummary();
}

stopBtn.addEventListener('click', () => {
    stopRequested = true;
    stopBtn.hidden = true;
    progressBox.textContent = '中止しています…';
});

// オプションを変えたら、その場で全員を変換し直す（手で直した名前はそのまま）
document.querySelectorAll('.options input').forEach(input => input.addEventListener('change', () => {
    items.filter(i => i.status === 'ok').forEach(item => {
        if (input.id === 'opt-kana' || input.name === 'opt-halfkana') applyAutoName(item);
        convertItem(item);
        updateRow(item);
    });
    if (previewItem) showPreview(previewItem);
}));

// --- コピー ---
document.getElementById('copy-btn').addEventListener('click', e => {
    if (!previewItem) return;
    const btn = e.currentTarget;
    navigator.clipboard.writeText(previewItem.result.text).then(() => {
        btn.textContent = '✅ コピーしました';
        setTimeout(() => { btn.textContent = '📋 コピー'; }, 2000);
    }, () => {
        resultText.select();
        alert('自動でコピーできませんでした。選択された文字を Ctrl + C でコピーしてください。');
    });
});

// --- 1人分のダウンロード ---
document.getElementById('download-btn').addEventListener('click', () => {
    if (!previewItem) return;
    trackEvent('download_single');
    downloadBlob(new Blob([textBytes(previewItem.result.text)], { type: 'text/plain;charset=utf-8' }), fileNameOf(previewItem));
});

// --- まとめてZIPでダウンロード（キャラッシュは1回に50人まで取り込めるので、50人ずつに分ける） ---
function renderZipButtons(included) {
    const box = document.getElementById('zip-buttons');
    box.innerHTML = '';
    const chunks = [];
    for (let i = 0; i < included.length; i += CHARASH_IMPORT_LIMIT) chunks.push(included.slice(i, i + CHARASH_IMPORT_LIMIT));
    document.getElementById('zip-note').hidden = chunks.length < 2;
    if (!chunks.length) {
        const btn = el('button', 'btn-convert', '🗂 まとめてZIPでダウンロード（0人）');
        btn.disabled = true;
        box.appendChild(btn);
        return;
    }
    chunks.forEach((chunk, n) => {
        const from = n * CHARASH_IMPORT_LIMIT + 1;
        const to = from + chunk.length - 1;
        const label = chunks.length === 1 ? `🗂 まとめてZIPでダウンロード（${chunk.length}人）` : `🗂 ZIP ${n + 1}（${from}〜${to}人目）`;
        const btn = el('button', 'btn-convert', label);
        btn.addEventListener('click', () => downloadZip(included, chunk, chunks.length === 1 ? `${chunk.length}人` : `${from}-${to}人目`));
        box.appendChild(btn);
    });
}

function downloadZip(included, chunk, label) {
    // ファイル名は、分けたZIPどうしでも重ならないように、全員分をまとめて決める
    const used = new Set();
    const names = new Map(included.map(item => [item, fileNameOf(item, used)]));
    const zip = makeZip(chunk.map(item => ({ name: names.get(item), data: textBytes(item.result.text) })));
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    trackEvent('download_zip', { count: chunk.length });
    downloadBlob(new Blob([zip], { type: 'application/zip' }), `キャラッシュ用_${label}_${ymd}.zip`);
}

// --- ブックマークレット（コードは bookmarklet-code.js。bookmarklet/build.js で生成） ---
const bookmarkletLink = document.getElementById('bookmarklet-link');
const bookmarkletCode = document.getElementById('bookmarklet-code');
bookmarkletLink.href = BOOKMARKLET_HREF;
bookmarkletCode.value = BOOKMARKLET_HREF;
bookmarkletLink.addEventListener('click', e => {
    e.preventDefault();
    alert('このボタンはクリックせず、ブックマークバーへドラッグして登録してください。\n\n登録したら、キャラクター保管所のマイリストを開いてからブックマークを押してください。');
});
document.getElementById('bookmarklet-copy').addEventListener('click', e => {
    navigator.clipboard.writeText(BOOKMARKLET_HREF).then(() => {
        e.target.textContent = '✅ コピーしました';
    });
});

// --- テーマ切替 ---
const btnTheme = document.getElementById('btn-theme-toggle');
btnTheme.addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? '' : 'dark');
    btnTheme.textContent = isDark ? '🌙' : '☀️';
});

// --- UI制御 ---
function openModal(modalId) { const m = document.getElementById(modalId); if (m) m.classList.add('open'); }
function closeModal(modalId) { const m = document.getElementById(modalId); if (m) m.classList.remove('open'); }
window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });

function toggleShareMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('shareMenu');
    if (menu) menu.classList.toggle('show');
}
window.addEventListener('click', () => { const m = document.getElementById('shareMenu'); if (m) m.classList.remove('show'); });

function shareCopyLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        const t = document.getElementById('shareTooltip');
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2000);
    });
}
function shareToX() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(document.title);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
}
function shareToBluesky() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(document.title);
    window.open(`https://bsky.app/intent/compose?text=${text}%0A${url}`, '_blank');
}
function shareToMisskey() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(document.title);
    window.open(`https://misskey-hub.net/share/?text=${text}&url=${url}`, '_blank');
}
function shareToDiscord() {
    shareCopyLink();
    alert("Discordへの直接シェア機能はありません。リンクをコピーしましたので貼り付けてください！");
}
