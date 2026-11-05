// ==========================================
// キャラクター保管所のマイリストから、キャラクターシートのURLを一括で抜き出すブックマークレット
// マイリスト（https://charasheet.vampire-blood.net/mylist）を開いた状態で実行する
// 全ページ（1ページ50件）を順に読み込み、数字IDの形のURLを一覧にして表示する
// CoCキャラシ保管スプレッドシートのものと同じ。完了画面の案内文だけ、このツール向けに変えている
// build.js でこのファイルから bookmarklet-code.js（登録用リンク）を生成する
// ==========================================
(async () => {
  const HOST = 'charasheet.vampire-blood.net';
  const MAX_PAGES = 100;
  const OVERLAY_ID = 'cs-url-extractor';

  if (location.hostname !== HOST || !location.pathname.startsWith('/mylist')) {
    alert('キャラクター保管所のマイリストを開いてから、もう一度クリックしてください。\n\nhttps://charasheet.vampire-blood.net/mylist');
    return;
  }
  document.getElementById(OVERLAY_ID)?.remove();

  // ---- 画面表示 ----
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
  overlay.innerHTML = `
    <div style="background:#fff;color:#222;width:min(560px,92vw);border-radius:10px;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,.4);">
      <div style="font-size:18px;font-weight:bold;margin-bottom:8px;">キャラシURL一括抽出</div>
      <div data-role="status" style="font-size:14px;margin-bottom:10px;">読み込み中…</div>
      <textarea data-role="output" readonly style="width:100%;height:220px;box-sizing:border-box;font-size:13px;font-family:monospace;"></textarea>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button data-role="copy" disabled style="flex:1;padding:10px;font-size:15px;font-weight:bold;background:#2b6cb0;color:#fff;border:0;border-radius:6px;cursor:pointer;">コピーする</button>
        <button data-role="close" style="padding:10px 16px;font-size:15px;background:#eee;border:0;border-radius:6px;cursor:pointer;">閉じる</button>
      </div>
      <div style="font-size:12px;color:#555;margin-top:10px;line-height:1.6;">
        コピーしたら、保管所→キャラッシュ変換ツールのURL入力欄に貼り付けてください。
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = role => overlay.querySelector(`[data-role="${role}"]`);
  $('close').onclick = () => overlay.remove();

  // ---- 1ページ分のHTMLからキャラシURLを集める ----
  // 一覧には1キャラにつき「数字IDのリンク」と「MDIDのリンク」があるので、数字IDを優先する
  const collectIds = (doc, baseUrl) => {
    const numeric = [];
    const mdid = [];
    doc.querySelectorAll('a[href]').forEach(a => {
      let u;
      try { u = new URL(a.getAttribute('href'), baseUrl); } catch (e) { return; }
      if (u.hostname !== HOST || u.search) return;
      const m = u.pathname.match(/^\/(\d+|m[0-9a-f]{32})\/?$/i);
      if (!m) return;
      (/^\d+$/.test(m[1]) ? numeric : mdid).push(m[1]);
    });
    return numeric.length > 0 ? numeric : mdid;
  };

  const pageUrl = n => {
    const u = new URL(location.href);
    u.searchParams.set('page', n);
    return u.href;
  };

  // ---- 全ページを順番に読み込む（新しいキャラが出てこなくなったら終了） ----
  const found = new Set();
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      $('status').textContent = `${page}ページ目を読み込み中…（${found.size}件）`;
      const res = await fetch(pageUrl(page), { credentials: 'include' });
      if (!res.ok) break;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const before = found.size;
      collectIds(doc, res.url).forEach(id => found.add(id));
      if (found.size === before) break;
    }
  } catch (e) {
    $('status').textContent = `読み込みに失敗しました：${e.message}`;
    return;
  }

  if (found.size === 0) {
    $('status').textContent = 'キャラクターシートが見つかりませんでした。ログインしているか確認してください。';
    return;
  }

  const urls = [...found].map(id => `https://${HOST}/${id}`);
  $('output').value = urls.join('\n');
  $('status').innerHTML = `<b>${urls.length}件</b> のキャラクターシートが見つかりました。`;

  const copyBtn = $('copy');
  copyBtn.disabled = false;
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText($('output').value);
    } catch (e) {
      // クリップボードAPIが使えない環境向け
      $('output').select();
      document.execCommand('copy');
    }
    copyBtn.textContent = '✅ コピーしました！';
  };
})();
