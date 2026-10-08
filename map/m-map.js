/* fillts Map — 로그인 후 fillts 내부 사이트 모음. 앱 목록 원본은 core.js의 APPS (HR 설정 › 앱 접근과 같은 목록) */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h;
  // 앱별 바로가기 (자주 쓰는 화면)
  var LINKS = {
    hr: [['#info', 'INFO'], ['#notice', '공지사항'], ['#work', '근무'], ['#leave', '휴가'], ['#ws', 'WORK'], ['#ai', '+AI'], ['#payreq', '입금요청']],
    fin: [['#home', 'Overview'], ['#plan', '자금조달'], ['#runway', '런웨이'], ['#flow', '현금흐름'], ['#sched', '지출예정'], ['#tx', '거래내역'], ['#tax', '세무사 전달']],
    mkt: [['', '마케팅 맵']],
    inf: [['#home', 'Overview'], ['#find', '탐색'], ['#pipe', '파이프라인'], ['#mail', '메일']],
    vg: [['#brand', '브랜드'], ['#gel-spec', '클렌징 젤 · 사양'], ['#gel-pdp', '상세페이지'], ['#gel-pack', '패키지 문안'], ['#gel-check', '검수']]
  };
  var EXTRA = [['/', 'fillts.com', '회사 홈페이지 (공개)']];

  function render(view) {
    var me = S.members[S.mid] || {};
    var cards = HR.APPS.map(function (a) {
      var can = HR.canApp(a.id), lv = HR.appLevel(a.id);
      var state = a.soon ? '준비 중' : !can ? '권한 없음' : a.open ? '구성원 전원' : lv === 'edit' ? '편집 권한' : '열람 권한';
      var inner = [h('div', { class: 'row' }, h('span', { class: 'map-path grow', text: 'fillts.com' + a.path }), ui.tag(state, a.soon || !can ? 'mute' : '')),
        h('div', { class: 'map-name', text: a.name }), h('p', { class: 'map-desc', text: a.desc })];
      if (a.soon || !can) {
        if (!a.soon) inner.push(h('p', { class: 'meta', text: 'HR 관리자에게 「설정 › 앱 접근」에서 권한을 요청하세요.' }));
        return h('div', { class: 'map-card ' + (a.soon ? 'soon' : 'locked') }, inner);
      }
      var links = LINKS[a.id] || [];
      if (links.length) inner.push(h('ul', { class: 'map-links' }, links.map(function (l) { return h('li', null, h('a', { href: a.path + l[0], text: l[1] })); })));
      inner.push(h('a', { class: 'btn btn-sm', href: a.path, text: a.name + ' 열기 →' }));
      return h('div', { class: 'map-card' }, inner);
    });
    ui.put(view, ui.head('fillts', 'Sites', h('span', { class: 'meta', text: (me.name || S.user.email) + ' · 권한에 따라 보이는 앱이 다릅니다' })),
      h('div', { class: 'map-grid' }, cards),
      ui.panel('Public · 공개 페이지', null, h('ul', { class: 'list' }, EXTRA.map(function (x) { return h('li', null, h('a', { class: 'grow', href: x[0], text: x[1] }), h('span', { class: 'meta', text: x[2] })); }))),
      S.realAdmin ? h('p', { class: 'note' }, '앱별 접근권한은 ', h('a', { href: '/hr/#admin/apps', text: 'HR › 설정 › 앱 접근' }), '에서 계정마다 지정합니다. 새 앱을 추가하면 이 화면에도 자동으로 나타납니다.') : null);
  }
  HR.register('map', { render: render });
})();
