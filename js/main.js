function render(){({today:renderToday,cal:renderCal,todo:renderTodo,money:renderMoney,habit:renderHabit,pomo:renderPomo,rank:renderRankPage,health:renderHealth,diet:renderDiet,gym:renderGym})[tab]();}
/* 啟動：所有檔案都載入後才開始畫面和雲端同步 */
gStatus();
goTab(tab);
if(gReady()) driveSync(); else syncUI();
