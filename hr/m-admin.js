/* fillts HR — 설정(관리자): 회사 기준 · 휴가 정책 · 공휴일 · 조직 · 권한 · 급여명세서 · 연동 */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var cfgRef = function () { return db.doc('hr_config/main'); };
  var draftPolicies = null;

  function company(view) {
    var c = S.cfg, f = {
      companyName: ui.input({ value: c.companyName, maxlength: '60' }), ceoName: ui.input({ value: c.ceoName, maxlength: '30' }),
      bizNo: ui.input({ value: c.bizNo || '', maxlength: '20', placeholder: '000-00-00000' }), companyAddress: ui.input({ value: c.companyAddress || '', maxlength: '120' }),
      workStart: ui.input({ type: 'time', value: c.workStart }), workEnd: ui.input({ type: 'time', value: c.workEnd }),
      autoOutHours: ui.input({ type: 'number', min: '0', max: '16', step: '0.5', value: c.autoOutHours == null ? 7 : c.autoOutHours }),
      annualBasis: ui.select([['fiscal', '회계연도 (1월 1일) 기준'], ['hire', '입사일 기준']], c.annualBasis),
      gcalId: ui.input({ value: c.gcalId || '', placeholder: '팀 휴가 캘린더 ID (구독 링크용)', maxlength: '200' })
    };
    var five = h('input', { type: 'checkbox', checked: !!c.fivePlus }), pension = h('input', { type: 'checkbox', checked: !!c.pension }), m = ui.msg();
    var form = h('form', { class: 'panel' },
      ui.label('Company'),
      h('div', { class: 'form-grid' }, ui.field('회사명', f.companyName), ui.field('대표자', f.ceoName), ui.field('사업자등록번호', f.bizNo), ui.field('주소 (증명서용)', f.companyAddress)),
      h('div', { class: 'row' }, h('label', { class: 'check' }, five, ' 상시근로자 5인 이상 사업장'), h('label', { class: 'check' }, pension, ' 퇴직연금(DB·DC) 도입')),
      h('div', { class: 'form-grid' }, ui.field('연차 산정 기준', f.annualBasis),
        ui.field('출근 기준', f.workStart), ui.field('퇴근 기준', f.workEnd), ui.field('출근 후 자동 퇴근 (시간, 0=끔)', f.autoOutHours), ui.field('구글 캘린더 ID', f.gcalId)),
      m, h('button', { class: 'btn btn-sm', type: 'submit', text: '저장' }),
      h('p', { class: 'note', text: '5인 미만 사업장은 연장·야간·휴일 가산수당(제56조), 연차휴가(제60조), 공휴일 유급휴일이 법적 의무가 아닙니다. 체크를 해제하면 계산이 그 기준으로 바뀝니다. 회계연도 기준은 운영이 편하지만 퇴사 시 입사일 기준보다 불리하면 차액을 정산해야 합니다.' }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = { fivePlus: five.checked, pension: pension.checked };
      Object.keys(f).forEach(function (k) { d[k] = k === 'autoOutHours' ? Math.max(0, +f[k].value || 0) : f[k].value.trim(); });
      cfgRef().set(d, { merge: true }).then(function () { ui.ok(m, '저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    });
    ui.put(view, form, geoForm());
  }

  // 출근 위치 제한 (기본: 월~목 사무실 반경 500m, 금요일 자유) — 퇴근·연장 신청 등은 제한 없음
  var GEO_PRESETS = [['성수 SK V1 타워 (연무장5가길 25)', 37.5435511, 127.0556139]];   // 사무실 주소 (261006 대표 확정)
  function geoForm() {
    var g = S.cfg.geo || {}, m = ui.msg();
    var on = h('input', { type: 'checkbox', checked: !!g.on });
    var label = ui.input({ value: g.label || '', maxlength: '60', placeholder: '예: 서울숲 SK V1 TOWER' }), lat = ui.input({ type: 'number', step: 'any', value: g.lat || '' }), lng = ui.input({ type: 'number', step: 'any', value: g.lng || '' });
    var radius = ui.input({ type: 'number', min: '100', max: '5000', step: '50', value: g.radius || 500 });
    var days = g.days || [1, 2, 3, 4], boxes = {};
    var dayRow = h('div', { class: 'row' }, [1, 2, 3, 4, 5, 6, 0].map(function (d) { boxes[d] = h('input', { type: 'checkbox', checked: days.indexOf(d) >= 0 }); return h('label', { class: 'check' }, boxes[d], ' ' + '일월화수목금토'[d]); }));
    var presets = h('div', { class: 'row' }, GEO_PRESETS.map(function (p) { return ui.btn(p[0], function () { label.value = p[0]; lat.value = p[1]; lng.value = p[2]; }, 'btn-line btn-xs'); }),
      ui.btn('지금 내 위치로', function () {
        if (!navigator.geolocation) return ui.err(m, '위치 확인을 지원하지 않는 브라우저입니다.');
        m.textContent = '위치를 확인하는 중…';
        navigator.geolocation.getCurrentPosition(function (p) { lat.value = p.coords.latitude.toFixed(6); lng.value = p.coords.longitude.toFixed(6); ui.ok(m, '현재 위치를 넣었습니다 (오차 약 ' + Math.round(p.coords.accuracy) + 'm). 저장을 누르세요.'); },
          function () { ui.err(m, '위치를 확인하지 못했습니다. 위치 권한을 허용하세요.'); }, { enableHighAccuracy: true, timeout: 12000 });
      }, 'btn-line btn-xs'));
    var f = h('form', { class: 'panel' }, ui.label('Clock-in location · 출근 위치 제한'),
      h('label', { class: 'check' }, on, ' 정해진 요일에는 사무실 반경 안에서만 출근 버튼 허용'),
      ui.field('적용 요일', dayRow), presets,
      h('div', { class: 'form-grid' }, ui.field('위치 이름', label), ui.field('위도', lat), ui.field('경도', lng), ui.field('반경 (m)', radius)), m,
      h('button', { class: 'btn btn-sm', type: 'submit', text: '저장' }),
      h('p', { class: 'note', text: '출근 버튼을 누를 때 휴대폰·PC 위치로 사무실과의 거리를 확인합니다. 좌표는 저장하지 않고 거리(m)만 출근 기록에 남깁니다. 퇴근 · 연장/야간/휴일 신청 · 정정은 위치와 상관없이 누를 수 있습니다. 정확한 위치는 사무실에서 「지금 내 위치로」를 눌러 맞추는 것이 가장 정확합니다.' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = { on: on.checked, label: label.value.trim(), lat: +lat.value || 0, lng: +lng.value || 0, radius: Math.max(100, +radius.value || 500),
        days: Object.keys(boxes).filter(function (k) { return boxes[k].checked; }).map(Number) };
      if (d.on && (!d.lat || !d.lng)) return ui.err(m, '위도·경도를 입력하세요.');
      cfgRef().set({ geo: d }, { merge: true }).then(function () { ui.ok(m, '저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    });
    return f;
  }

  function policies(view) {
    if (!draftPolicies) draftPolicies = JSON.parse(JSON.stringify(HR.allPolicies()));
    var P = draftPolicies, m = ui.msg();
    var tb = h('table', { class: 'table policy-table' });
    tb.appendChild(h('thead', null, h('tr', null, ['사용', '이름', '분류', '부여 방식', '일수', '근속(년)', '유급', '반차', '시간', '설명', ''].map(function (x) { return h('th', { text: x }); }))));
    var body = h('tbody');
    P.forEach(function (p, i) {
      var annual = p.mode === 'annual';
      var set = function (k, cast) { return function () { p[k] = cast ? cast(this) : this.value; }; };
      body.appendChild(h('tr', null,
        h('td', null, h('input', { type: 'checkbox', checked: p.active !== false, 'aria-label': p.name + ' 사용', onchange: set('active', function (el) { return el.checked; }) })),
        h('td', null, ui.input({ value: p.name, maxlength: '30', 'aria-label': '이름', oninput: set('name') })),
        h('td', null, annual ? h('span', { class: 'muted', text: '기본' }) : ui.select(HR.LEAVE_CATS, HR.policyCat(p), { 'aria-label': '분류', onchange: set('cat') })),
        h('td', null, annual ? h('span', { class: 'muted', text: '법정 자동' }) : ui.select([['request', '신청 시 부여'], ['yearly', '매년 부여'], ['monthly', '매월 부여'], ['tenure', '근속 시 부여'], ['milestone', '근속 구간별']], p.mode, { 'aria-label': '부여 방식', onchange: set('mode') })),
        h('td', null, annual ? h('span', { class: 'muted', text: '15~25' }) : p.mode === 'milestone' ? ui.input({
          value: (p.milestones || []).map(function (x) { return x.years + ':' + x.days + ':' + Math.round((x.bonus || 0) / 10000); }).join(', '),
          'aria-label': '근속년:일수:포상금(만원)', title: '근속년:휴가일수:포상금(만원), 쉼표로 구분 · 예) 3:10:200, 5:15:300, 10:22:1000',
          oninput: function () {
            p.milestones = this.value.split(',').map(function (t) { var a = t.trim().split(':'); return { years: +a[0], days: +a[1], bonus: (+a[2] || 0) * 10000 }; })
              .filter(function (x) { return x.years > 0 && x.days > 0; });
          } }) : ui.input({ type: 'number', step: '0.125', min: '0', value: p.days, 'aria-label': '일수', class: 'w-num', oninput: set('days', function (el) { return +el.value; }) })),
        h('td', null, p.mode === 'milestone' ? h('span', { class: 'muted small', text: '년:일:만원' }) : p.mode === 'tenure' ? ui.input({ type: 'number', min: '1', value: p.tenureYears || 3, class: 'w-num', 'aria-label': '근속 연수', oninput: set('tenureYears', function (el) { return +el.value; }) }) : null),
        h('td', null, h('input', { type: 'checkbox', checked: p.paid !== false, 'aria-label': '유급', onchange: set('paid', function (el) { return el.checked; }) })),
        h('td', null, h('input', { type: 'checkbox', checked: !!p.half, 'aria-label': '반차 허용', onchange: set('half', function (el) { return el.checked; }) })),
        h('td', null, h('input', { type: 'checkbox', checked: !!p.hours, 'aria-label': '시간 단위 허용', onchange: set('hours', function (el) { return el.checked; }) })),
        h('td', null, ui.input({ value: p.note || '', maxlength: '120', 'aria-label': '설명', oninput: set('note') })),
        h('td', null, annual ? null : h('button', { type: 'button', class: 'x-del', text: '삭제', onclick: function () { P.splice(i, 1); HR.refresh(); } }))));
    });
    tb.appendChild(body);
    ui.put(view,
      h('div', { class: 'table-wrap' }, tb),
      h('div', { class: 'row' },
        ui.btn('휴가 추가', function () { P.push({ id: 'p' + Date.now().toString(36), name: '새 휴가', mode: 'request', days: 1, paid: true, half: false, hours: false, note: '' }); HR.refresh(); }, 'btn-line btn-sm'),
        ui.btn('저장', function () {
          if (P.some(function (p) { return !p.name.trim(); })) return ui.err(m, '이름이 빈 휴가가 있습니다.');
          cfgRef().set({ leavePolicies: P }, { merge: true }).then(function () { draftPolicies = null; ui.ok(m, '휴가 정책을 저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
        }, 'btn-sm'),
        ui.btn('되돌리기', function () { draftPolicies = null; HR.refresh(); }, 'btn-line btn-sm'),
        ui.confirmBtn('기본값으로', function () { draftPolicies = JSON.parse(JSON.stringify(L.DEFAULT_POLICIES)); HR.refresh(); }, 'btn-line btn-sm')),
      m,
      h('p', { class: 'note', text: '법정 기준(하한): 배우자 출산휴가 유급 20일 · 출산전후휴가 90일 · 난임치료휴가 연 6일(2일 유급) · 가족돌봄휴가 연 10일 · 생리휴가 월 1일(무급). 회사 휴가는 자유롭게 정할 수 있지만 법정 휴가를 줄일 수는 없습니다. 휴가 이름과 일수를 바꿔도 이미 신청된 기록은 유지됩니다.' }));
  }

  function holidays(view) {
    var ta = h('textarea', { id: 'cfgHol', rows: '14' }); ta.value = (S.cfg.holidays || []).join('\n');
    var m = ui.msg(), st = S.status && S.status.holidays;
    ui.put(view, h('div', { class: 'two-col' },
      h('form', { class: 'panel', onsubmit: function (e) {
        e.preventDefault();
        var list = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return /^\d{4}-\d{2}-\d{2}/.test(s); }).sort();
        cfgRef().set({ holidays: list }, { merge: true }).then(function () { ui.ok(m, '저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
      } }, ui.label('Manual list'), ui.field('한 줄에 YYYY-MM-DD 이름 (회사 지정 휴무일도 여기에)', ta), m, h('button', { class: 'btn btn-sm', type: 'submit', text: '저장' })),
      ui.panel('Auto sync', st ? ui.tag(st.ok ? '정상' : '오류', st.ok ? 'ok' : 'red') : ui.tag('미연결', 'mute'),
        h('p', { class: 'muted small', text: '매월 1일 08:30 공공데이터포털(한국천문연구원 특일정보)에서 올해와 내년 공휴일·대체공휴일·선거일을 자동으로 받아옵니다. 자동 목록과 수동 목록을 합쳐 사용합니다.' }),
        h('p', { class: 'small', text: '자동 동기화 ' + (S.cfg.holidaysSync || []).length + '건' + (S.cfg.holidaysSyncedAt && S.cfg.holidaysSyncedAt.toDate ? ' · ' + fmt.ts(S.cfg.holidaysSyncedAt) : '') + (st && st.err ? ' · ' + st.err : '') }))));
  }

  function orgs(view) {
    var name = ui.input({ maxlength: '40', placeholder: '예: 제품기획개발' });
    var parent = ui.select([['', S.cfg.companyName]].concat(Object.keys(S.orgs).map(function (k) { return [k, S.orgs[k].name]; })), '');
    var m = ui.msg();
    var f = h('form', { class: 'panel' }, ui.label('New organization'), h('div', { class: 'row' }, ui.field('조직명', name), ui.field('상위 조직', parent)), m, h('button', { class: 'btn btn-sm', type: 'submit', text: '추가' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!name.value.trim()) return ui.err(m, '조직명을 입력하세요.');
      db.collection('hr_orgs').add({ name: name.value.trim(), parentId: parent.value, order: Object.keys(S.orgs).length }).then(function () { name.value = ''; ui.toast('조직을 추가했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    });
    var ul = h('ul', { class: 'list' });
    Object.keys(S.orgs).sort(function (a, b) { return (S.orgs[a].order || 0) - (S.orgs[b].order || 0); }).forEach(function (k) {
      var o = S.orgs[k], n = HR.memberList(false).filter(function (x) { return x.orgId === k || (x.subOrgs || []).some(function (s) { return s.orgId === k; }); }).length;
      var rn = ui.input({ value: o.name, maxlength: '40', 'aria-label': '조직명' });
      var par = ui.select([['', S.cfg.companyName]].concat(Object.keys(S.orgs).filter(function (x) { return x !== k; }).map(function (x) { return [x, S.orgs[x].name]; })), o.parentId || '', { 'aria-label': '상위 조직' });
      ul.appendChild(h('li', null, h('div', { class: 'row grow' }, rn, par, h('span', { class: 'meta', text: n + '명' })), h('div', { class: 'actions' },
        ui.btn('저장', function () { db.doc('hr_orgs/' + k).update({ name: rn.value.trim() || o.name, parentId: par.value }).then(function () { ui.toast('저장했습니다.'); }).catch(ui.fail); }, 'btn-line btn-xs'),
        n ? null : ui.confirmBtn('삭제', function () { db.doc('hr_orgs/' + k).delete().catch(ui.fail); }))));
    });
    if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '아직 조직이 없습니다. 예: 제품기획개발, 다이렉트 본부' }));
    ui.put(view, h('div', { class: 'two-col' }, f, ui.panel('Organizations', null, ul)));
  }

  function roles(view) {
    var M = [
      ['INFO · 본인 인사정보, 연락처', '본인', '본인', '전체'],
      ['급여 정보', '본인', '본인', '전체 · 수정'],
      ['인사노트', '—', '—', '전체'],
      ['공지 읽기 / 작성', '읽기', '읽기', '작성 · 읽음 확인'],
      ['구성원 목록 · 조직도', '열람', '열람 + 연차 잔여', '전체 · 추가 · 발령'],
      ['출퇴근 기록', '본인', '전체 열람', '전체 열람'],
      ['근태 정정 승인', '—', '본인이 리더인 구성원', '전체'],
      ['휴가 신청 / 승인', '신청', '신청 · 팀원 승인', '신청 · 전체 승인 · 연차 조정'],
      ['목표', '개인 목표', '+ 팀 목표', '+ 전사 목표'],
      ['원온원', '본인 참여분', '+ 팀원 생성 · 비공개 메모', '전체'],
      ['설정 · 권한', '—', '—', '전체']
    ];
    var tb = h('table', { class: 'table' });
    tb.appendChild(h('thead', null, h('tr', null, ['항목', '구성원', '리더', '관리자'].map(function (x) { return h('th', { text: x }); }))));
    tb.appendChild(h('tbody', null, M.map(function (r) { return h('tr', null, r.map(function (c, i) { return h('td', { class: i ? '' : 'strong', text: c }); })); })));
    var ul = h('ul', { class: 'list' });
    Object.keys(S.users).forEach(function (uid) {
      var u = S.users[uid];
      ul.appendChild(h('li', null, h('a', { class: 'grow', href: '#people/' + u.memberId }, HR.name(u.memberId), h('span', { class: 'meta', text: '  ' + u.email })), ui.tag(HR.roleName(u.role), u.role === 'admin' ? 'red' : u.role === 'manager' ? 'warn' : 'mute')));
    });
    Object.keys(S.invites).forEach(function (email) {
      var i = S.invites[email];
      if (Object.keys(S.users).some(function (uid) { return S.users[uid].memberId === i.memberId; })) return;
      ul.appendChild(h('li', null, h('div', { class: 'grow' }, HR.name(i.memberId), h('span', { class: 'meta', text: '  ' + email })), ui.tag('초대됨 · ' + HR.roleName(i.role), 'mute')));
    });
    ui.put(view, h('div', { class: 'table-wrap' }, tb),
      h('p', { class: 'note', text: '이 권한은 화면이 아니라 서버(Firestore 보안 규칙)에서 강제됩니다. 계정은 이메일 인증 + 관리자 초대가 모두 있어야 열리고, 출퇴근 기록은 서버 시각으로만 저장되어 누구도 수정·삭제할 수 없습니다. 권한 변경은 구성원 INFO › 정보 › 계정 · 권한에서 합니다.' }),
      ui.panel('Accounts', null, ul));
  }

  // ── 앱 접근: /fin 등 HR 밖의 앱을 계정별로 열어 준다 (hr_users/{uid}.apps — 서버 보안 규칙이 같은 값으로 판정)
  function apps(view) {
    var list = HR.APPS.filter(function (a) { return !a.open; });
    var LV = [['', '없음'], ['view', '열람'], ['edit', '편집']];
    var tb = h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', { text: '계정' }), list.map(function (a) { return h('th', { text: a.name + (a.soon ? ' (준비 중)' : '') }); }))));
    var body = h('tbody');
    Object.keys(S.users).map(function (uid) { return Object.assign({ uid: uid }, S.users[uid]); })
      .sort(function (a, b) { return HR.name(a.memberId).localeCompare(HR.name(b.memberId), 'ko'); })
      .forEach(function (u) {
        var cur = u.apps || {}, isAdm = u.role === 'admin', self = u.uid === S.user.uid;
        body.appendChild(h('tr', null, h('td', null, h('div', { class: 'strong', text: HR.name(u.memberId) }), h('div', { class: 'meta', text: u.email + (isAdm ? ' · 관리자' : '') })),
          list.map(function (a) {
            if (isAdm) return h('td', { class: 'meta', text: '관리자 — 전체 편집' });
            var sel = ui.select(LV, cur[a.id] || '', { 'aria-label': HR.name(u.memberId) + ' ' + a.name + ' 권한', disabled: self ? true : null, onchange: function () {
              var next = Object.assign({}, cur); if (this.value) next[a.id] = this.value; else delete next[a.id];
              db.doc('hr_users/' + u.uid).update({ apps: next }).then(function () { ui.toast(HR.name(u.memberId) + ' · ' + a.name + ' 권한을 바꿨습니다.'); }).catch(ui.fail);
            } });
            return h('td', null, sel);
          })));
      });
    tb.appendChild(body);
    var cards = h('ul', { class: 'list' }, HR.APPS.map(function (a) {
      return h('li', null, h('div', { class: 'grow' }, h('div', { class: 'strong', text: a.name + '  ' + a.path }), h('div', { class: 'meta', text: a.desc })),
        ui.tag(a.open ? '구성원 전원' : a.soon ? '준비 중' : '권한 받은 계정', a.open ? 'mute' : 'warn'));
    }));
    ui.put(view, ui.panel('Access · 앱별 접근권한', null, h('div', { class: 'table-wrap flat' }, tb)),
      h('p', { class: 'note', text: '열람 = 보기만, 편집 = 입력 · 업로드 · 세무사 메일 발송까지. 관리자는 모든 앱을 편집할 수 있습니다. 로그인은 HR과 같고, 권한은 화면이 아니라 서버(Firestore 보안 규칙)에서 강제됩니다. 바꾼 권한은 상대 화면에 바로 반영됩니다.' }),
      ui.panel('Apps · fillts 사이트', h('a', { href: '/map/', target: '_blank', rel: 'opener', class: 'btn btn-line btn-sm', text: 'Map 열기 ↗' }), cards));
  }

  // ── 원클릭 연동: Slack 앱은 미리 채운 매니페스트로 만들고, 값 2개만 붙여 넣는다 · 메일은 앱 비밀번호 1개 ──
  var SLACK_ACTIONS_URL = 'https://slackactions-syaknclaca-du.a.run.app';
  function slackManifestUrl() {
    var mf = {
      display_information: { name: 'fillts HR', description: 'fillts HR 알림 · 승인 버튼', background_color: '#0a0a0a' },
      features: { bot_user: { display_name: 'fillts HR', always_online: true } },
      oauth_config: { scopes: { bot: ['chat:write', 'users:read', 'users:read.email', 'im:write'] } },
      settings: { interactivity: { is_enabled: true, request_url: SLACK_ACTIONS_URL }, org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false }
    };
    return 'https://api.slack.com/apps?new_app=1&manifest_json=' + encodeURIComponent(JSON.stringify(mf));
  }
  function connectPanel() {
    var meta = HR.load('hr_secret_meta', function () { return db.doc('hr_secret_meta/main').get().then(function (s) { return s.exists ? s.data() : {}; }); }) || {};
    var saveMeta = function (d) { return db.doc('hr_secret_meta/main').set(Object.assign(d, { updatedAt: FV.serverTimestamp() }), { merge: true }).then(function () { HR.invalidate('hr_secret_meta'); }); };
    // Slack
    var bot = ui.input({ placeholder: 'xoxb-…', autocomplete: 'off' }), sign = ui.input({ placeholder: 'Signing Secret (32자리)', autocomplete: 'off' }), sm = ui.msg();
    var slackForm = h('form', { class: 'connect-step' },
      h('ol', { class: 'app-steps' },
        h('li', null, h('a', { href: slackManifestUrl(), target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-sm', text: '① Slack 앱 만들기 (설정 자동 입력)' }),
          h('div', { class: 'meta', text: '워크스페이스(filltshq) 선택 → Next → Create' })),
        h('li', null, '② 만든 앱 화면 왼쪽 「Install App」 → 「Install to filltshq」 → 허용'),
        h('li', null, '③ 「Bot User OAuth Token」(xoxb-…)과 Basic Information의 「Signing Secret」을 아래에 붙여 넣고 저장')),
      h('div', { class: 'row' }, ui.field('Bot User OAuth Token', bot), ui.field('Signing Secret', sign)), sm,
      h('button', { class: 'btn btn-sm', type: 'submit', text: 'Slack 연결 저장' }));
    slackForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = bot.value.trim(), g = sign.value.trim();
      if (!/^xoxb-[A-Za-z0-9-]+$/.test(b)) return ui.err(sm, 'Bot User OAuth Token은 xoxb- 로 시작합니다.');
      if (!/^[a-f0-9]{20,64}$/.test(g)) return ui.err(sm, 'Signing Secret을 확인하세요 (영문 소문자·숫자 32자리).');
      db.doc('hr_secrets/main').set({ slackBot: b, slackSigning: g, updatedAt: FV.serverTimestamp() }, { merge: true })
        .then(function () { return saveMeta({ slack: true, slackHint: '…' + b.slice(-4) }); })
        .then(function () { bot.value = ''; sign.value = ''; ui.ok(sm, '저장했습니다. 아래 「테스트 알림 받기」로 확인하세요.'); }).catch(function (x) { ui.fail(x, sm); });
    });
    // 메일
    var user = ui.input({ type: 'email', value: meta.smtpUser || 'kjw@fillts.com' }), pass = ui.input({ placeholder: '16자리 앱 비밀번호', autocomplete: 'off' }), mm = ui.msg();
    var mailForm = h('form', { class: 'connect-step' },
      h('ol', { class: 'app-steps' },
        h('li', null, h('a', { href: 'https://myaccount.google.com/apppasswords', target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-sm', text: '① 앱 비밀번호 만들기' }),
          h('div', { class: 'meta', text: '보내는 계정(예: kjw@fillts.com)으로 로그인 → 앱 이름 「fillts HR」 → 만들기. 2단계 인증이 켜져 있어야 보입니다.' })),
        h('li', null, '② 화면에 뜬 16자리를 아래에 붙여 넣고 저장')),
      h('div', { class: 'row' }, ui.field('보내는 메일 계정', user), ui.field('앱 비밀번호', pass)), mm,
      h('button', { class: 'btn btn-sm', type: 'submit', text: '메일 연결 저장' }));
    mailForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = user.value.trim().toLowerCase(), pw = pass.value.replace(/\s+/g, '');
      if (!/^[^@\s]+@fillts\.com$/.test(u)) return ui.err(mm, '@fillts.com 회사 메일만 쓸 수 있습니다.');
      if (!/^[a-z]{16}$/i.test(pw)) return ui.err(mm, '앱 비밀번호는 영문 16자리입니다 (띄어쓰기는 자동으로 뺍니다).');
      db.doc('hr_secrets/main').set({ smtpUser: u, smtpPass: pw, updatedAt: FV.serverTimestamp() }, { merge: true })
        .then(function () { return saveMeta({ mail: true, smtpUser: u }); })
        .then(function () { pass.value = ''; ui.ok(mm, '저장했습니다. 아래 「테스트 알림 받기」로 확인하세요.'); }).catch(function (x) { ui.fail(x, mm); });
    });
    var stat = function (on, t) { return ui.tag(on ? '연결됨' + (t ? ' · ' + t : '') : '미연결', on ? 'ok' : 'mute'); };
    return ui.panel('Connect · 원클릭 연동 (관리자 1회)', null,
      h('div', { class: 'two-col connect-grid' },
        h('div', { class: 'stack' }, h('div', { class: 'connect-head' }, h('b', { text: 'Slack' }), stat(meta.slack, meta.slackHint)), slackForm),
        h('div', { class: 'stack' }, h('div', { class: 'connect-head' }, h('b', { text: '회사 메일' }), stat(meta.mail, meta.smtpUser)), mailForm)),
      HR.testPanel(),
      h('p', { class: 'note', text: '저장한 값은 서버만 읽을 수 있고 화면에서는 다시 볼 수 없습니다(끝 4자리만 표시). 구성원은 따로 설정할 것이 없습니다 — Slack은 회사 메일과 같은 이메일의 Slack 계정으로, 메일은 회사 메일로 자동 연결되며 각자 INFO › 알림 설정에서 테스트할 수 있습니다.' }));
  }

  function integrations(view) {
    var st = S.status || {};
    var row = function (key, name, desc) {
      var s = st[key];
      return h('li', null, h('div', { class: 'grow' }, h('div', { text: name }), h('div', { class: 'meta', text: desc })),
        s ? ui.tag((s.ok ? '정상' : '오류') + (s.at && s.at.toDate ? ' · ' + fmt.ts(s.at) : ''), s.ok ? 'ok' : 'red') : ui.tag('기록 없음', 'mute'));
    };
    ui.put(view, connectPanel(),
      ui.panel('Status', null, h('ul', { class: 'list' },
        row('slack', 'Slack', '요청 DM + 승인/반려 버튼, HR 채널 공지, 리마인드'),
        row('email', '회사 메일', '승인 요청·결과, 중요 공지, 연차 촉진 (Google Workspace SMTP)'),
        row('calendar', 'Google Calendar', '승인된 휴가를 팀 휴가 캘린더에 자동 등록·삭제'),
        row('holidays', '공휴일 동기화', '공공데이터포털 한국천문연구원 특일정보'))),
      ui.panel('Alert matrix', null, h('div', { class: 'table-wrap flat' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['이벤트', '받는 사람', '웹', 'Slack', '메일'].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, [
          ['휴가 신청', '리더 + 관리자', '●', '● 승인 버튼', '●'], ['휴가 승인/반려', '신청자', '●', '●', '●'], ['휴가 확정', 'HR 채널', '', '●', ''],
          ['근태 정정 요청', '관리자', '●', '● 승인 버튼', '●'], ['연장·야간·휴일근무 신청', '관리자', '●', '● 승인 버튼', '●'], ['증명서 · 문서 요청', '관리자 → 신청자', '●', '●', '●'], ['공지 게시', '전원', '●', '● 채널', '중요 공지만'], ['칭찬', '받는 사람', '●', '●', ''],
          ['원온원 생성 · D-1', '참여자', '●', '●', ''], ['퇴근 누락 21:30', '본인', '●', '●', ''], ['주 48시간 초과 (목)', '본인 + 리더', '●', '●', ''],
          ['연차 사용촉진 기한', '본인 + 관리자', '●', '●', '관리자 필수'], ['목표 체크인 (금)', '목표 담당자', '●', '●', ''], ['입사기념일', 'HR 채널', '', '●', '']
        ].map(function (r) { return h('tr', null, r.map(function (c) { return h('td', { text: c }); })); }))))),
      h('p', { class: 'note', text: '구성원은 INFO › 알림 설정에서 채널을 끄고 켤 수 있습니다. 휴대폰 알림은 Slack 모바일 앱 푸시로 받고, 리더는 Slack 메시지의 승인 버튼으로 바로 처리합니다. 버튼을 누른 Slack 계정이 HR 권한을 가진 리더·관리자인지 서버에서 다시 확인합니다.' }));
  }

  HR.register('admin', {
    render: function (view, parts) {
      var sub = parts[0] || '';
      ui.put(view, ui.head('Settings', '설정'), ui.tabs([['', '회사 기준'], ['leave', '휴가 정책'], ['holiday', '공휴일'], ['org', '조직'], ['roles', '권한'], ['apps', '앱 접근'], ['payslip', '급여명세서'], ['integrations', '알림 연동'], ['app', '앱 아이콘']], sub, 'admin'));
      if (sub === 'leave') policies(view);
      else if (sub === 'holiday') holidays(view);
      else if (sub === 'org') orgs(view);
      else if (sub === 'roles') roles(view);
      else if (sub === 'apps') apps(view);
      else if (sub === 'payslip') HR.payslip.adminPage(view);
      else if (sub === 'app') ui.put(view, HR.app.panel());
      else if (sub === 'integrations') integrations(view);
      else company(view);
    }
  });
})();
