/* fillts Influencer — 통합 리스팅(/inf). 유튜브 세부는 /inf_youtube, 인스타 세부는 /inf_insta (같은 Influencer 권한)
   예전 /inf/#find 같은 유튜브 화면 주소는 /inf_youtube/ 로 넘긴다 — 단, /inf 자기 메뉴(MENUS)는 절대 넘기지 않는다
   (261015: 「done」이 넘김 목록에 남아 있어, 세션 만료 뒤 자동 로그인 · 새로고침으로 /inf/#done 이 다시 열릴 때마다 유튜브로 튕겼다) */
(function () {
  var MENUS = ['ap', 'home', 'stat', 'done'];
  window.HR_APP = { id: 'inf', title: 'fillts Influencer', home: 'ap', lite: true, menus: MENUS };
  var m = (location.hash || '').slice(1).split('/')[0];
  if (MENUS.indexOf(m) < 0 && ['find', 'list', 'pipe', 'mail', 'algo', 'celeb', 'strat', 'tree', 'plan', 'c'].indexOf(m) >= 0) location.replace('/inf_youtube/' + location.hash);
})();
