/* ---------- 備份 ---------- */
$('exportBtn').onclick=()=>{const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:'application/json'}));
  a.download=`生活手帳備份-${todayStr()}.json`; a.click();};
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files[0]; if(!f) return;
  try{const d=JSON.parse(await f.text()); if(!confirm('匯入會覆蓋目前所有資料，確定嗎？')) return;
    db={...EMPTY_DB(),...d}; save(); render(); alert('匯入完成');}
  catch(err){alert('檔案格式錯誤')} e.target.value='';};
