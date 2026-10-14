/* fillts Influencer — 통합 리스팅(/inf). 유튜브 세부는 /inf_youtube, 인스타 세부는 /inf_insta (같은 Influencer 권한)
   예전 /inf/#find 같은 유튜브 화면 주소는 /inf_youtube/ 로 넘긴다 */
(function () {
  var m = (location.hash || '').slice(1).split('/')[0];
  if (['find', 'list', 'pipe', 'done', 'mail', 'algo', 'celeb', 'strat', 'tree', 'plan', 'c'].indexOf(m) >= 0) location.replace('/inf_youtube/' + location.hash);
})();
window.HR_APP = { id: 'inf', title: 'fillts Influencer', home: 'ap', lite: true, menus: ['ap', 'home', 'picks'] };
