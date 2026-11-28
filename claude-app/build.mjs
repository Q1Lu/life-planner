// 把網頁版（index.html + css + js）和 claude-app/ 的檔案組成一個 HTML，發佈成 Claude 工件（可以安裝成電腦 App）。
// 用法：node claude-app/build.mjs  → 產生 claude-app/dist/life-planner.html
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)), root=join(here,'..');
const read=p=>readFileSync(join(root,p),'utf8');

const html=read('index.html');
const body=html.slice(html.indexOf('<body>')+6,html.lastIndexOf('</body>'));
// 網頁版的 <script src> 依序列出；Google 的換成 Claude 版，最後加上 App 功能
const webScripts=[...body.matchAll(/<script src="(js\/[^"?]+)[^"]*"><\/script>/g)].map(m=>m[1]);
const swap={'js/google-calendar.js':'claude-app/gcal-mcp.js','js/drive-sync.js':'claude-app/claude-sync.js'};
const scripts=[];
for(const s of webScripts){
  scripts.push(swap[s]||s);
  if(s==='js/core.js') scripts.push('claude-app/app-ui.js');
}
scripts.push('claude-app/claude-features.js');
for(const need of ['js/core.js','js/sync-merge.js','js/main.js']) if(!scripts.includes(need)) throw new Error('index.html 找不到 '+need);

let content=body.replace(/<script[^>]*><\/script>\s*/g,'')      // 拿掉所有 <script src>（包含 Google 登入元件）
  .replace('<button class="ghost" id="themeBtn"',read('claude-app/header-buttons.html')+'  <button class="ghost" id="themeBtn"');
if(!content.includes('id="remBtn"')) throw new Error('header 按鈕沒有插進去');
const inline=(code,name)=>{if(/<\/script/i.test(code)) throw new Error(name+' 裡面有 </script>'); return `<script>/* ${name} */\n${code}\n</script>`;};
const themeBoot=html.match(/<script>\/\* 先套用深淺色[\s\S]*?<\/script>/)?.[0]||'';
const manifest=JSON.stringify({permissions:['notifications','menu-bar','shortcuts','overlay']});

const out=`<title>生活手帳</title>
<script type="application/json" id="claude-artifacts-manifest">${manifest}</script>
<style>
${read('css/style.css')}
${read('claude-app/app.css')}
</style>
${themeBoot}
${content.trim()}
${read('claude-app/extra.html')}
${scripts.map(s=>inline(read(s),s)).join('\n')}
`;
mkdirSync(join(here,'dist'),{recursive:true});
writeFileSync(join(here,'dist','life-planner.html'),out);
console.log(`OK  ${scripts.length} 個 JS 檔，${(Buffer.byteLength(out)/1024).toFixed(0)} KB → claude-app/dist/life-planner.html`);
console.log(scripts.join('\n'));
