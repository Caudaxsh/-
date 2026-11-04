// 由 asset-manifest.json(唯一來源)產生 asset-manifest.js,讓直接雙擊 index.html(file://)時也能讀到素材路徑。
// 用法: node tools/build-manifest-js.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'public', 'assets', 'workhorse');
const json = JSON.parse(fs.readFileSync(path.join(dir, 'asset-manifest.json'), 'utf8'));
fs.writeFileSync(path.join(dir, 'asset-manifest.js'),
  '/* 自動產生,請勿手改:node tools/build-manifest-js.js */\nwindow.WORKHORSE_ASSET_MANIFEST = ' + JSON.stringify(json, null, 2) + ';\n');
console.log('asset-manifest.js generated');
