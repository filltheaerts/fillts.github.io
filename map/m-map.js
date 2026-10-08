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
    rnd: [['#quick', '[quick]'], ['#home', '현황'], ['#timeline', '진행'], ['#equip', '비품'], ['#tasks', '연구과제'], ['#due', '일정'], ['#renew', '27.4 연장'], ['#report', '조사표'], ['#docs', '서류'], ['#check', '검증']],
    vg: [['#brand', '브랜드'], ['#gel-spec', '클렌징 젤 · 사양'], ['#gel-pdp', '상세페이지'], ['#gel-points', '핵심 포인트'], ['#gel-check', '검수']]
  };
  var EXTRA = [['/', 'fillts.com', '회사 홈페이지 (공개)']];

  // 분야별 구분 — 각 분야 아래 앱을 가로로 긴 한 줄씩 세로로 나열. 여기 없는 새 앱은 「기타」에 자동으로 붙는다
  var GROUPS = [['HR', ['hr']], ['FINANCE & ADMIN', ['fin', 'rnd']], ['BRAND', ['vg']], ['MKT', ['mkt', 'inf']]];

  function row(a) {
    var can = HR.canApp(a.id), lv = HR.appLevel(a.id), off = a.soon || !can;
    var state = a.soon ? '준비 중' : !can ? '권한 없음' : a.open ? '구성원 전원' : lv === 'edit' ? '편집 권한' : '열람 권한';
    var links = off ? [] : (LINKS[a.id] || []);
    return h('li', { class: 'map-row' + (off ? ' off' : '') },
      h('div', { class: 'map-row-id' }, h('div', { class: 'map-name', text: a.name }), h('div', { class: 'map-path', text: 'fillts.com' + a.path }), ui.tag(state, off ? 'mute' : '')),
      h('div', { class: 'map-row-body' }, h('p', { class: 'map-desc', text: a.desc }),
        links.length ? h('ul', { class: 'map-links' }, links.map(function (l) { return h('li', null, h('a', { href: a.path + l[0], target: '_blank', rel: 'noopener', text: l[1] })); })) : null,
        null),
      off ? h('span') : h('a', { class: 'btn btn-sm map-open', href: a.path, target: '_blank', rel: 'noopener', text: '열기 ↗' }));
  }

  function render(view) {
    var me = S.members[S.mid] || {};
    var used = {}, secs = GROUPS.map(function (g) {
      var apps = HR.APPS.filter(function (a) { return g[1].indexOf(a.id) >= 0 && HR.canApp(a.id); });   // 권한 없는 앱은 아예 안 보임
      apps.forEach(function (a) { used[a.id] = true; });
      return [g[0], apps];
    });
    var rest = HR.APPS.filter(function (a) { return !used[a.id] && GROUPS.every(function (g) { return g[1].indexOf(a.id) < 0; }) && HR.canApp(a.id); });
    if (rest.length) secs.push(['기타', rest]);
    ui.put(view, ui.head('fillts', 'Sites', h('span', { class: 'meta', text: (me.name || S.user.email) + ' · 권한에 따라 보이는 앱이 다릅니다' })),
      secs.filter(function (s) { return s[1].length; }).map(function (s) {
        return h('section', { class: 'map-sec' }, h('div', { class: 'map-sec-head' }, h('span', { class: 'map-sec-name', text: s[0] }), h('span', { class: 'meta', text: s[1].map(function (a) { return a.name; }).join(' · ') })),
          h('ul', { class: 'map-rows' }, s[1].map(row)));
      }),
      ui.panel('Public · 공개 페이지', null, h('ul', { class: 'list' }, EXTRA.map(function (x) { return h('li', null, h('a', { class: 'grow', href: x[0], text: x[1] }), h('span', { class: 'meta', text: x[2] })); }))),
      S.realAdmin ? h('p', { class: 'note' }, '앱별 접근권한은 ', h('a', { href: '/hr/#admin/apps', text: 'HR › 설정 › 앱 접근' }), '에서 계정마다 지정합니다. 새 앱을 추가하면 이 화면에도 자동으로 나타납니다.') : null);
  }
  HR.register('map', { render: render });
})();
