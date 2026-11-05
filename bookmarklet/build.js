// ==========================================
// ブックマークレットのビルド
// mylist-urls.js を javascript: URL に変換し、配布ページ用の bookmarklet-code.js を作る
// 使い方: node bookmarklet/build.js
// ==========================================
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'mylist-urls.js'), 'utf8');

// 行全体がコメントの行と、行頭のインデントを取り除く
const code = src
  .split(/\r?\n/)
  .filter(line => !/^\s*\/\//.test(line))
  .map(line => line.trim())
  .filter(line => line !== '')
  .join('\n');

const href = 'javascript:' + encodeURIComponent(code);
fs.writeFileSync(
  path.join(__dirname, '..', 'bookmarklet-code.js'),
  `// bookmarklet/build.js で自動生成（直接編集しない）\nconst BOOKMARKLET_HREF = ${JSON.stringify(href)};\n`
);
console.log(`bookmarklet-code.js を生成しました（ブックマークレット ${href.length} 文字）`);
