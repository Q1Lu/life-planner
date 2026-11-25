/* ---------- Google Drive 雲端同步：待辦、記帳、習慣、番茄鐘、本機行程 ----------
   每筆資料記下最後修改時間 u；刪除的記在 db.deleted。兩台裝置的資料「逐筆」比較，較新的留下。 */
const SYNC_KEYS=['events','todos','money','habits','habitLogs','pomos','hgroups','hitems','hdone','xp','health'];
const DRIVE_NAME='life-planner-data.json';
const S={busy:false,again:false,timer:null,last:+(ls('syncLast')||0),err:'',fileId:ls('driveFileId')||''};
let baseSnap=jget('syncSnap');             // 上次存檔時每筆資料的內容，用來找出哪些改過、哪些被刪掉
const itemHash=it=>{const {u,...rest}=it; return JSON.stringify(rest);};
function stamp(){
  const now=Date.now(), cur={}; db.deleted??={};
  for(const k of SYNC_KEYS) for(const it of db[k]||[]){
    const h=itemHash(it); cur[it.id]=h;
    // 沒有時間戳 → 新的；內容跟上次不同 → 改過。預設項目本身帶有舊時間戳，不會蓋掉別台的修改
    if(!it.u||(baseSnap&&baseSnap[it.id]!==undefined&&baseSnap[it.id]!==h)) it.u=now;
  }
  if(baseSnap) for(const id in baseSnap) if(!(id in cur)) db.deleted[id]=now;
  baseSnap=cur; ls('syncSnap',JSON.stringify(baseSnap));
}
window.beforeSave=stamp;
window.afterSave=()=>{if(!gReady()) return; clearTimeout(S.timer); S.timer=setTimeout(driveSync,1500);};
function mergeInto(remote){
  const del={...(db.deleted||{})};
  for(const [id,t] of Object.entries(remote.deleted||{})) if(!(del[id]>=t)) del[id]=t;
  const old=Date.now()-90*864e5; for(const id in del) if(del[id]<old) delete del[id];   // 90 天前的刪除紀錄可以忘掉
  let changed=false;
  for(const k of SYNC_KEYS){
    const map=new Map((db[k]||[]).map(x=>[x.id,x]));
    for(const r of remote[k]||[]){
      const l=map.get(r.id);
      if(!l){map.set(r.id,r); changed=true;}
      else if((r.u||0)>(l.u||0)){Object.keys(l).forEach(key=>{if(!(key in r)) delete l[key];}); Object.assign(l,r); changed=true;}
    }
    db[k]=[...map.values()].filter(x=>{const d=del[x.id]; if(d&&d>=(x.u||0)){changed=true; return false;} return true;});
  }
  db.deleted=del;
  baseSnap={}; for(const k of SYNC_KEYS) for(const it of db[k]) baseSnap[it.id]=itemHash(it);   // 合併結果當成新基準
  ls('syncSnap',JSON.stringify(baseSnap));
  try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}
  return changed;
}
async function gFetch(url,opt={}){
  if(!gReady()) throw new Error('尚未連線 Google');
  const r=await fetch(url,{...opt,headers:{Authorization:'Bearer '+G.token,...(opt.headers||{})}});
  if(r.status===401){G.token=null; gSaveTok(); gStatus(); throw new Error('Google 授權已過期，請重新連線');}
  if(!r.ok){
    let m=String(r.status); try{m=(await r.json()).error.message}catch(e){}
    if(r.status===403&&/scope|insufficient|permission/i.test(m)) throw new Error('還沒有雲端同步的權限：請按「🟢 Google 日曆」→「中斷連線」，再重新連接並勾選所有權限');
    throw new Error((r.status===404?'NOT_FOUND ':'')+'Google 雲端硬碟錯誤：'+m);
  }
  return r;
}
const payload=()=>{const o={v:1,deleted:db.deleted||{}}; SYNC_KEYS.forEach(k=>o[k]=db[k]); return JSON.stringify(o);};
async function driveSync(){
  if(!gReady()) return syncUI();
  if(S.busy){S.again=true; return;}
  S.busy=true; S.err=''; syncUI();
  try{
    const API='https://www.googleapis.com/drive/v3/files', UP='https://www.googleapis.com/upload/drive/v3/files';
    if(!S.fileId){
      const q=encodeURIComponent(`name='${DRIVE_NAME}'`);
      S.fileId=(await (await gFetch(`${API}?spaces=appDataFolder&q=${q}&fields=files(id)`)).json()).files?.[0]?.id||'';
    }
    let remoteTxt='';
    if(S.fileId){
      try{remoteTxt=await (await gFetch(`${API}/${S.fileId}?alt=media`)).text();}
      catch(e){if(e.message.startsWith('NOT_FOUND')) S.fileId=''; else throw e;}
    }
    if(remoteTxt){const rem=JSON.parse(remoteTxt); const a=mergeInto(rem), b=dedupeHabits(rem); if(a||b) render();}
    const out=payload();
    if(!S.fileId){       // 第一次：建立雲端檔案
      const b='lp'+Date.now(), meta=JSON.stringify({name:DRIVE_NAME,parents:['appDataFolder']});
      const body=`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${out}\r\n--${b}--`;
      S.fileId=(await (await gFetch(`${UP}?uploadType=multipart&fields=id`,{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body})).json()).id;
    }else if(out!==remoteTxt){
      await gFetch(`${UP}/${S.fileId}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:out});
    }
    ls('driveFileId',S.fileId); S.last=Date.now(); ls('syncLast',String(S.last));
    if(!db.hgroups.length&&!ls('hSeeded')){seedDaily(); render();}   // 雲端也沒有資料，才建立範例
  }catch(err){S.err=err.message.replace(/^NOT_FOUND /,'');}
  S.busy=false; syncUI();
  if(S.again){S.again=false; driveSync();}
}
function syncUI(){
  const el=$('syncState');
  if(!gReady()){el.textContent=''; return;}
  el.textContent=S.busy?'☁️ 同步中…':S.err?'⚠️ 同步失敗':S.last?'☁️ 已同步':'☁️';
  el.title=S.err||(S.last?'雲端同步正常，上次同步 '+new Date(S.last).toLocaleTimeString()+'（點一下立即同步）':'點一下立即同步');
  el.style.color=S.err?'var(--red)':'';
}
$('syncState').onclick=()=>{if(S.err&&!S.busy) alert(S.err); driveSync();};
setInterval(()=>{if(gReady()&&!document.hidden) driveSync();},60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&gReady()) driveSync();});
if(!baseSnap) stamp();                      // 第一次啟用同步：建立基準
// 第一次同步在 main.js 啟動（等所有檔案都載入後）
