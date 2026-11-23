function render(){({cal:renderCal,todo:renderTodo,money:renderMoney,habit:renderHabit,pomo:renderPomo,rank:renderRankPage,health:renderHealth})[tab]();}
/* 啟動：所有檔案都載入後才開始畫面和雲端同步 */
gStatus();
render();
renderMini();
if(gReady()) driveSync(); else syncUI();
