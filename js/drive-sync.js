/* ---------- Google 雲端硬碟同步：網頁版 ↔ Claude App ----------
   兩邊共用「我的雲端硬碟」裡的「生活手帳同步」資料夾：
     web.json      網頁版的資料（所有瀏覽器共用這一個，直接更新）
     app-*.json    Claude App 的資料（Claude 的連接器不能覆寫檔案，所以它每次存新檔、把自己的舊檔丟垃圾桶）
   每次同步把資料夾裡的檔案全部讀進來逐筆合併（sync-merge.js），再寫回 web.json。
   以前存在雲端硬碟隱藏資料夾（appDataFolder）的資料，第一次同步時會合併進來。 */
const SHARED_FOLDER='1zkLk1W1PCg9I8FiujnuWhRjOuB4xbTnK', FOLDER_NAME='生活手帳同步', WEB_FILE='web.json', OLD_NAME='life-planner-data.json';
const S={busy:false,again:false,timer:null,last:+(ls('syncLast')||0),err:'',folder:ls('lpFolder')||'',fileId:ls('webFileId')||'',seen:jget('driveSeen')||{}};
window.afterSave=()=>{if(!gReady()) return; clearTimeout(S.timer); S.timer=setTimeout(driveSync,1500);};
async function gFetch(url,opt={}){
  if(!gReady()) throw new Error('尚未連線 Google');
  const r=await fetch(url,{...opt,headers:{Authorization:'Bearer '+G.token,...(opt.headers||{})}});
  if(r.status===401){G.token=null; gSaveTok(); gStatus(); throw new Error('Google 授權已過期，請重新連線');}
  if(!r.ok){
    let m=String(r.status); try{m=(await r.json()).error.message}catch(e){}
    if(r.status===403&&/scope|insufficient|permission/i.test(m)) throw new Error('還沒有雲端硬碟的權限：請按「🟢 Google 日曆」→「中斷連線」，再重新連接並勾選所有權限');
    throw new Error((r.status===404?'NOT_FOUND ':'')+'Google 雲端硬碟錯誤：'+m);
  }
  return r;
}
const API='https://www.googleapis.com/drive/v3/files', UP='https://www.googleapis.com/upload/drive/v3/files';
const dq=s=>encodeURIComponent(s);
async function findFolder(){
  for(const id of [S.folder,SHARED_FOLDER].filter(Boolean)){
    try{const f=await (await gFetch(`${API}/${id}?fields=id,trashed,mimeType`)).json(); if(!f.trashed&&f.mimeType==='application/vnd.google-apps.folder') return id;}
    catch(e){if(!e.message.startsWith('NOT_FOUND')) throw e;}
  }
  const q=`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found=(await (await gFetch(`${API}?q=${dq(q)}&orderBy=createdTime&fields=files(id)`)).json()).files?.[0]?.id;
  if(found) return found;
  return (await (await gFetch(`${API}?fields=id`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'})})).json()).id;
}
async function mergeText(txt){if(!txt) return false; const rem=JSON.parse(txt); const a=mergeInto(rem), b=dedupeHabits(rem); return a||b;}
async function driveSync(){
  if(!gReady()) return syncUI();
  if(S.busy){S.again=true; return;}
  S.busy=true; S.err=''; syncUI();
  try{
    if(!S.folder){S.folder=await findFolder(); ls('lpFolder',S.folder);}
    let changed=false;
    // 第一次：把以前隱藏資料夾裡的資料合併進來
    if(!ls('driveMigrated')){
      try{
        const old=(await (await gFetch(`${API}?spaces=appDataFolder&q=${dq(`name='${OLD_NAME}'`)}&fields=files(id)`)).json()).files?.[0]?.id;
        if(old) changed=await mergeText(await (await gFetch(`${API}/${old}?alt=media`)).text())||changed;
      }catch(e){}
      ls('driveMigrated','1');
    }
    const q=`'${S.folder}' in parents and trashed=false`;
    const files=(await (await gFetch(`${API}?q=${dq(q)}&orderBy=modifiedTime desc&pageSize=50&fields=files(id,name,modifiedTime)`)).json()).files||[];
    const web=files.find(f=>f.name===WEB_FILE);
    if(web) S.fileId=web.id; else S.fileId='';
    let webTxt='';
    for(const f of files.filter(f=>f.name===WEB_FILE||/^app-.*\.json$/.test(f.name)).slice(0,6)){
      if(f.name!==WEB_FILE&&S.seen[f.id]===f.modifiedTime) continue;   // Claude App 的檔案沒變就不用再讀
      const txt=await (await gFetch(`${API}/${f.id}?alt=media`)).text();
      if(f.name===WEB_FILE) webTxt=txt;
      try{changed=await mergeText(txt)||changed;}catch(e){}            // 壞掉的檔案跳過
      S.seen[f.id]=f.modifiedTime;
    }
    for(const id in S.seen) if(!files.some(f=>f.id===id)) delete S.seen[id];
    ls('driveSeen',JSON.stringify(S.seen));
    if(changed) render();
    const out=payload();
    if(!S.fileId){
      const b='lp'+Date.now(), meta=JSON.stringify({name:WEB_FILE,parents:[S.folder],mimeType:'application/json'});
      const body=`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${out}\r\n--${b}--`;
      S.fileId=(await (await gFetch(`${UP}?uploadType=multipart&fields=id`,{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body})).json()).id;
    }else if(out!==webTxt){
      await gFetch(`${UP}/${S.fileId}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:out});
    }
    ls('webFileId',S.fileId); S.last=Date.now(); ls('syncLast',String(S.last));
  }catch(err){
    S.err=err.message.replace(/^NOT_FOUND /,'');
    if(/NOT_FOUND/.test(err.message)){S.folder=''; ls('lpFolder',null);}   // 資料夾被刪了：下次重新找或建立
  }
  S.busy=false; syncUI();
  if(S.again){S.again=false; driveSync();}
}
function syncUI(){
  const el=$('syncState');
  if(!gReady()){el.textContent=''; return;}
  el.textContent=S.busy?'☁️ 同步中…':S.err?'⚠️ 同步失敗':S.last?'☁️ 已同步':'☁️';
  el.title=S.err||(S.last?'和 Claude App 透過雲端硬碟「生活手帳同步」資料夾同步，上次同步 '+new Date(S.last).toLocaleTimeString()+'（點一下立即同步）':'點一下立即同步');
  el.style.color=S.err?'var(--red)':'';
}
$('syncState').onclick=()=>{if(S.err&&!S.busy) alert(S.err); driveSync();};
setInterval(()=>{if(gReady()&&!document.hidden) driveSync();},60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&gReady()) driveSync();});
// 第一次同步在 main.js 啟動（等所有檔案都載入後）
