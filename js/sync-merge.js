/* ---------- 雲端同步的共用合併邏輯（網頁版的 Google 雲端硬碟、Claude App 版的 Claude 資料庫都用這個） ----------
   每筆資料記下最後修改時間 u；刪除的記在 db.deleted。兩台裝置的資料「逐筆」比較，較新的留下。 */
const SYNC_KEYS=['events','todos','money','habits','habitLogs','pomos','hgroups','hitems','hdone','xp','health','mcats','body','meals'];
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
const payload=()=>{const o={v:1,deleted:db.deleted||{}}; SYNC_KEYS.forEach(k=>o[k]=db[k]); return JSON.stringify(o);};
if(!baseSnap) stamp();                      // 第一次啟用同步：建立基準
