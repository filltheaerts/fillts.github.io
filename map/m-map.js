/* fillts Map — 로그인 후 fillts 내부 사이트 모음. 앱 목록 원본은 core.js의 APPS (HR 설정 › 앱 접근과 같은 목록) */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, db = HR.db;
  var editing = false;   // 관리자 「권한 수정」 — 켜면 이름 칩에 × (바로 제외) · + 추가
  // 관리자만: 계정 목록(hr_users)을 받아 앱마다 「누가 들어오나」를 보여 준다
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    prevStart && prevStart(sub);
    if (S.realAdmin) sub(db.collection('hr_users'), function (s) { S.users = {}; HR.rows(s).forEach(function (u) { S.users[u.id] = u; }); });
  };
  // 앱별 바로가기 (자주 쓰는 화면)
  var LINKS = {
    hr: [['#info', 'INFO'], ['#notice', '공지사항'], ['#work', '근무'], ['#leave', '휴가'], ['#ws', 'WORK'], ['#ai', '+AI'], ['#payreq', '입금요청']],
    fin: [['#home', 'Overview'], ['#plan', '자금조달'], ['#runway', '런웨이'], ['#flow', '현금흐름'], ['#sched', '지출예정'], ['#tx', '거래내역'], ['#tax', '세무사 전달']],
    mkt: [['', '마케팅 맵']],
    d2c: [['#sales', '현황'], ['#ads', '퍼포먼스'], ['#creative', '광고'], ['#assets', '소재'], ['#crmdata', '고객 데이터'], ['#repeat', '재구매'], ['#home', '핵심전략']],
    inf: [['#home', 'Overview'], ['#find', '탐색'], ['#pipe', '파이프라인'], ['#mail', '메일']],
    rnd: [['#gel', '임상 · 젤'], ['#oil', '임상 · 오일'], ['#kibo', '기보/벤처'], ['#quick', 'Quick'], ['#home', '현황'], ['#research', '연구'], ['#due', '기한'], ['#docs', '서류 · 검증']],
    logis: [['#home', '한판'], ['#stock', '재고 · 재발주'], ['#wekeep', '위킵'], ['#mail', '발주처 · 메일'], ['#order', '창고 · 발주 현황']],
    vg: [['#brand', '브랜드'], ['#gel-spec', '클렌징 젤 · 사양'], ['#gel-pdp', '상세페이지'], ['#gel-points', '핵심 포인트'], ['#gel-strat', '마케팅 전략'], ['#gel-todo', 'DO LIST'], ['#gel-check', '검수']]
  };
  var EXTRA = [['/', 'fillts.com', '회사 홈페이지 (공개)']];

  // 분야별 구분 — 각 분야 아래 앱을 가로로 긴 한 줄씩 세로로 나열. 여기 없는 새 앱은 「기타」에 자동으로 붙는다
  var GROUPS = [['HR', ['hr']], ['FINANCE & ADMIN', ['fin', 'rnd', 'logis']], ['BRAND', ['vg']], ['MKT', ['mkt', 'inf', 'd2c']]];

  function setLevel(uid, app, lv) {
    var u = S.users[uid] || {}, next = Object.assign({}, u.apps || {});
    if (lv) next[app] = lv; else delete next[app];
    var nm = HR.name(u.memberId), an = (HR.appInfo(app) || {}).name || app;
    db.doc('hr_users/' + uid).update({ apps: next })
      .then(function () { ui.toast(lv ? nm + ' · ' + an + ' ' + (lv === 'edit' ? '편집' : '열람') + ' 권한을 줬습니다.' : nm + ' · ' + an + ' 권한을 뺐습니다.'); }).catch(ui.fail);
  }

  // 앱 아래 「권한」 줄 — [이름] 칩. 관리자는 역할 권한이라 여기서 못 뺀다
  function who(a) {
    if (!S.realAdmin) return null;
    if (HR.OWNER_ONLY && a.id !== 'hr') {   // 검토 기간 잠금: HR 밖 앱은 대표 계정만 — 받은 권한이 있어도 열리지 않는다
      var owner = Object.keys(S.users).map(function (k) { return S.users[k]; }).filter(function (u) { return (u.email || '').toLowerCase() === HR.OWNER_ONLY; })[0];
      return h('div', { class: 'map-who' }, h('span', { class: 'map-who-k', text: '권한' }),
        h('span', { class: 'map-chip' }, '[' + (owner ? HR.name(owner.memberId) : HR.OWNER_ONLY) + ']'), h('span', { class: 'meta', text: '검토 중 · 다른 계정 잠금' }));
    }
    if (a.open) return h('div', { class: 'map-who' }, h('span', { class: 'map-who-k', text: '권한' }), h('span', { class: 'meta', text: '구성원 전원' }));
    var chips = [], others = [];
    Object.keys(S.users).map(function (uid) { return Object.assign({ uid: uid }, S.users[uid]); })
      .sort(function (x, y) { return (x.role === 'admin' ? 0 : 1) - (y.role === 'admin' ? 0 : 1) || HR.name(x.memberId).localeCompare(HR.name(y.memberId), 'ko'); })
      .forEach(function (u) {
        var nm = HR.name(u.memberId), lv = u.role === 'admin' ? 'admin' : (u.apps || {})[a.id];
        if (lv !== 'admin' && lv !== 'edit' && lv !== 'view') { others.push([u.uid, nm]); return; }
        var sub = lv === 'admin' ? '관리자' : lv === 'view' ? '열람' : '';
        chips.push(h('span', { class: 'map-chip' + (lv === 'admin' ? ' adm' : '') },
          '[' + nm + ']', sub ? h('small', { text: sub }) : null,
          editing && lv !== 'admin' ? h('button', { type: 'button', class: 'map-chip-x', 'aria-label': nm + ' ' + a.name + ' 권한 빼기', title: '권한 빼기', text: '×', onclick: function () { setLevel(u.uid, a.id, ''); } }) : null));
      });
    var add = editing && others.length ? ui.select([['', '+ 추가']].concat(others.map(function (o) { return [o[0], o[1]]; })), '', { class: 'map-add', 'aria-label': a.name + ' 권한 추가', onchange: function () { if (this.value) setLevel(this.value, a.id, 'edit'); } }) : null;
    return h('div', { class: 'map-who' + (editing ? ' editing' : '') }, h('span', { class: 'map-who-k', text: '권한' }), chips, add);
  }

  function row(a) {
    var can = HR.canApp(a.id), lv = HR.appLevel(a.id), off = a.soon || !can;
    var state = a.soon ? '준비 중' : !can ? '권한 없음' : HR.OWNER_ONLY && a.id !== 'hr' ? '대표 전용 · 검토 중' : a.open ? '구성원 전원' : lv === 'edit' ? '편집 권한' : '열람 권한';
    var links = off ? [] : (LINKS[a.id] || []);
    return h('li', { class: 'map-row' + (off ? ' off' : '') },
      h('div', { class: 'map-row-id' }, h('div', { class: 'map-name', text: a.name }), h('div', { class: 'map-path', text: 'fillts.com' + a.path }), ui.tag(state, off ? 'mute' : '')),
      h('div', { class: 'map-row-body' }, h('p', { class: 'map-desc', text: a.desc }),
        links.length ? h('ul', { class: 'map-links' }, links.map(function (l) { return h('li', null, h('a', { href: a.path + l[0], target: '_blank', rel: 'noopener', text: l[1] })); })) : null,
        who(a)),
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
    var right = h('div', { class: 'map-head-r' }, h('span', { class: 'meta', text: (me.name || S.user.email) + ' · 권한에 따라 보이는 앱이 다릅니다' }),
      S.realAdmin && !HR.OWNER_ONLY ? h('button', { type: 'button', class: 'btn btn-sm' + (editing ? '' : ' btn-line'), text: editing ? '수정 완료' : '권한 수정', 'aria-pressed': String(editing), onclick: function () { editing = !editing; HR.refresh(); } }) : null);
    ui.put(view, ui.head('fillts', 'Sites', right),
      secs.filter(function (s) { return s[1].length; }).map(function (s) {
        return h('section', { class: 'map-sec' }, h('div', { class: 'map-sec-head' }, h('span', { class: 'map-sec-name', text: s[0] }), h('span', { class: 'meta', text: s[1].map(function (a) { return a.name; }).join(' · ') })),
          h('ul', { class: 'map-rows' }, s[1].map(row)));
      }),
      ui.panel('Public · 공개 페이지', null, h('ul', { class: 'list' }, EXTRA.map(function (x) { return h('li', null, h('a', { class: 'grow', href: x[0], text: x[1] }), h('span', { class: 'meta', text: x[2] })); }))),
      S.realAdmin && HR.OWNER_ONLY ? h('p', { class: 'note', text: '검토 기간이라 HR 말고는 모든 앱이 대표 계정에만 열려 있습니다. 다른 계정에는 이 Map과 앱 링크가 보이지 않고, 주소로 들어와도 HR로 돌아갑니다. 공개할 때 잠금을 풀면 「권한 수정」으로 사람별 권한을 줄 수 있습니다.' }) :
      S.realAdmin ? h('p', { class: 'note' }, '「권한 수정」을 누르면 이름 옆 ×로 바로 빼고, 「+ 추가」로 편집 권한을 줍니다. 열람 · 편집 구분은 ', h('a', { href: '/hr/#admin/apps', text: 'HR › 설정 › 앱 접근' }), '에서 바꿉니다. 관리자는 역할 권한이라 여기서 빠지지 않습니다.') : null);
  }
  HR.register('map', { render: render });
})();
