/* fillts HR — 2) 구성원: 목록 · 조직도 · 구성원 추가 · 구성원 상세(INFO) */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var Q = { q: '', org: '*', status: '재직' };

  function nowTag(m) {
    var lv = HR.att.live(m);
    if (lv.st === 'left') return ui.tag('퇴사', 'mute');
    if (lv.st === 'rest') return ui.tag('휴직', 'mute');
    if (lv.st === 'away') return ui.tag(HR.policy(lv.away.type).name, 'red');
    if (lv.st === 'in') return ui.tag(HR.att.modeName(lv.mode) || '근무 중', 'ok');
    if (lv.st === 'out' && lv.today) return ui.tag('퇴근', 'mute');
    return null;
  }
  function inOrg(m, org) {
    if (org === '*') return true;
    return (m.orgId || '') === org || (m.subOrgs || []).some(function (s) { return s.orgId === org; });
  }

  function list(view) {
    var q = ui.input({ id: 'pplQ', type: 'search', placeholder: '이름, 직무, 이메일', value: Q.q, oninput: function () { Q.q = this.value; draw(); } });
    var org = ui.select([['*', '전체 조직'], ['', S.cfg.companyName]].concat(Object.keys(S.orgs).map(function (k) { return [k, S.orgs[k].name]; })), Q.org, { id: 'pplOrg', onchange: function () { Q.org = this.value; draw(); } });
    var st = ui.select([['재직', '재직'], ['휴직', '휴직'], ['퇴사', '퇴사'], ['*', '전체']], Q.status, { id: 'pplSt', onchange: function () { Q.status = this.value; draw(); } });
    var grid = h('div', { class: 'people-grid' });
    function draw() {
      ui.clear(grid);
      var needle = Q.q.trim().toLowerCase();
      var list = HR.memberList(true).filter(function (m) {
        if (Q.status !== '*' && (m.status || '재직') !== Q.status) return false;
        if (!inOrg(m, Q.org)) return false;
        if (!needle) return true;
        return [m.name, m.nickname, m.job, m.position, m.email, HR.orgName(m.orgId)].join(' ').toLowerCase().indexOf(needle) >= 0;
      });
      list.forEach(function (m) {
        var led = S.isLead ? HR.annualOf(m.id) : null;
        grid.appendChild(h('a', { class: 'person-card', href: '#people/' + m.id },
          h('div', { class: 'avatar sm', 'aria-hidden': 'true', text: (m.name || '?').slice(-2) }),
          h('div', { class: 'grow' },
            h('div', { class: 'who' }, m.name, ' ', nowTag(m)),
            h('div', { class: 'meta', text: [HR.orgName(m.orgId) + (m.orgRole ? ' · ' + m.orgRole : ''), m.job].filter(Boolean).join(' · ') }),
            h('div', { class: 'meta', text: [m.email, m.hireDate ? L.tenureText(m.hireDate, fmt.today()) : '', led ? '연차 ' + fmt.days(led.balance) : ''].filter(Boolean).join(' · ') }))));
      });
      if (!list.length) grid.appendChild(ui.empty('조건에 맞는 구성원이 없습니다.'));
    }
    draw();
    ui.put(view, h('div', { class: 'toolbar' }, ui.field('검색', q, 'inline'), ui.field('조직', org, 'inline'), ui.field('상태', st, 'inline'),
      S.isAdmin ? h('a', { class: 'btn btn-sm', href: '#people/new', text: '구성원 추가' }) : null), grid);
  }

  /* ---------- 조직도 ---------- */
  function chart(view) {
    var ms = HR.memberList(false);
    function peopleOf(orgId) {
      return ms.filter(function (m) { return inOrg(m, orgId); })
        .sort(function (a, b) { return ((b.orgId || '') === orgId && b.isOrgHead) - ((a.orgId || '') === orgId && a.isOrgHead) || (a.name || '').localeCompare(b.name || '', 'ko'); });
    }
    function chip(m, orgId) {
      var sub = (m.orgId || '') === orgId ? m.orgRole : ((m.subOrgs || []).filter(function (s) { return s.orgId === orgId; })[0] || {}).role;
      var head = (m.orgId || '') === orgId && m.isOrgHead;
      return h('a', { class: 'org-person' + (head ? ' head' : ''), href: '#people/' + m.id }, h('span', { class: 'who', text: m.name }), sub ? h('span', { class: 'meta', text: sub + ((m.orgId || '') !== orgId ? ' · 겸임' : '') }) : null);
    }
    function node(orgId, name, depth) {
      var kids = Object.keys(S.orgs).filter(function (k) { return (S.orgs[k].parentId || '') === orgId && k !== orgId; })
        .sort(function (a, b) { return (S.orgs[a].order || 0) - (S.orgs[b].order || 0) || S.orgs[a].name.localeCompare(S.orgs[b].name, 'ko'); });
      var ppl = peopleOf(orgId);
      return h('li', { class: 'org-node d' + Math.min(depth, 3) },
        h('div', { class: 'org-box' }, h('div', { class: 'org-name' }, name, h('span', { class: 'meta', text: ' ' + ppl.length + '명' })), h('div', { class: 'org-people' }, ppl.map(function (m) { return chip(m, orgId); }))),
        kids.length ? h('ul', { class: 'org-children' }, kids.map(function (k) { return node(k, S.orgs[k].name, depth + 1); })) : null);
    }
    ui.put(view, h('div', { class: 'org-wrap' }, h('ul', { class: 'org-tree' }, node('', S.cfg.companyName, 0))),
      S.isAdmin ? h('p', { class: 'note' }, '조직은 ', h('a', { href: '#admin/org', class: 'link', text: '설정 › 조직' }), '에서 만들고, 구성원 배치는 각 구성원 INFO › 정보 › 조직 · 직책에서 바꿉니다.') : null);
  }

  /* ---------- 구성원 추가 (관리자) ---------- */
  function addForm(view) {
    var f = {
      name: ui.input({ maxlength: '40', required: true }), email: ui.input({ type: 'email', maxlength: '120', placeholder: 'name@fillts.com' }),
      orgId: ui.select([['', S.cfg.companyName + ' (전사)']].concat(Object.keys(S.orgs).map(function (k) { return [k, S.orgs[k].name]; })), ''),
      orgRole: ui.input({ maxlength: '40', placeholder: '예: 매니저' }), job: ui.input({ maxlength: '40' }), position: ui.input({ maxlength: '40' }),
      hireDate: ui.input({ type: 'date', value: fmt.today() }), hireType: ui.select([['신입', '신입'], ['경력', '경력']], '신입'),
      type: ui.select([['정규직', '정규직'], ['계약직', '계약직'], ['단시간', '단시간'], ['인턴', '인턴']], '정규직'),
      weeklyHours: ui.input({ type: 'number', min: '1', max: '40', step: '0.5', value: '40' }),
      leaderId: ui.select([['', '(없음)']].concat(HR.memberList(false).map(function (m) { return [m.id, m.name]; })), S.mid),
      role: ui.select([['employee', '구성원'], ['manager', '리더'], ['admin', '관리자']], 'employee'),
      payType: ui.select([['monthly', '월급'], ['hourly', '시급']], 'monthly'), pay: ui.input({ type: 'number', min: '0', step: '10', placeholder: '선택' })
    };
    var invite = h('input', { type: 'checkbox', checked: true }), m = ui.msg(), check = h('p', { class: 'muted small' });
    function payCheck() {
      var c = L.minWageCheck({ payType: f.payType.value, amount: +f.pay.value }, S.cfg);
      check.textContent = c ? '통상시급 ' + fmt.won(c.rate) + (c.ok ? ' · 최저임금 충족' : ' · 최저임금(' + fmt.won(c.min) + ') 미달') : '';
      check.classList.toggle('red-text', !!c && !c.ok);
    }
    f.pay.addEventListener('input', payCheck); f.payType.addEventListener('change', payCheck);
    var form = h('form', { class: 'panel' },
      ui.label('New member'),
      h('div', { class: 'form-grid' },
        ui.field('이름 *', f.name), ui.field('회사 이메일 *', f.email), ui.field('주조직', f.orgId), ui.field('직책', f.orgRole), ui.field('직무', f.job), ui.field('직위', f.position),
        ui.field('입사일 *', f.hireDate), ui.field('입사 유형', f.hireType), ui.field('고용 형태', f.type), ui.field('주 소정근로시간', f.weeklyHours),
        ui.field('리더', f.leaderId), ui.field('HR 권한', f.role), ui.field('급여 형태', f.payType), ui.field('금액 (원)', f.pay)),
      check, h('label', { class: 'check' }, invite, ' 저장과 함께 초대 등록 (직원이 이 이메일로 가입하면 자동 연결)'), m,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit', text: '구성원 추가' }), h('a', { class: 'btn btn-line', href: '#people', text: '취소' })),
      h('p', { class: 'note', text: '생일·연락처·주소는 직원 본인이 INFO에서 입력합니다. 주민등록번호는 이 시스템에 저장하지 않습니다. 근로계약서는 구성원 INFO › 계약서에 교부일과 함께 등록하세요 (근로기준법 제17조).' }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = f.email.value.trim().toLowerCase();
      if (!f.name.value.trim() || !f.hireDate.value) return ui.err(m, '이름과 입사일은 필수입니다.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ui.err(m, '회사 이메일을 확인하세요.');
      if (HR.memberList(true).some(function (x) { return x.email === email; })) return ui.err(m, '이미 등록된 이메일입니다.');
      var ref = db.collection('hr_members').doc(), b = db.batch();
      b.set(ref, {
        name: f.name.value.trim(), nickname: '', email: email, empNo: '', orgId: f.orgId.value, orgRole: f.orgRole.value.trim(), isOrgHead: false, subOrgs: [],
        job: f.job.value.trim(), jobFamily: '', position: f.position.value.trim(), grade: '', hireDate: f.hireDate.value, groupHireDate: '', hireType: f.hireType.value,
        type: f.type.value, weeklyHours: +f.weeklyHours.value || 40, status: '재직', leaveDate: '', leaderId: f.leaderId.value, leaveAdjs: [], slackId: ''
      });
      if (f.pay.value) b.set(db.doc('hr_pay/' + ref.id), { payType: f.payType.value, amount: +f.pay.value, note: '', updatedAt: FV.serverTimestamp() });
      if (invite.checked) b.set(db.doc('hr_invites/' + email), { memberId: ref.id, role: f.role.value, createdAt: FV.serverTimestamp() });
      b.commit().then(function () { ui.toast(f.name.value.trim() + '님을 추가했습니다.' + (invite.checked ? ' 가입 안내: fillts.com/hr' : '')); HR.go('people/' + ref.id); })
        .catch(function (x) { ui.fail(x, m); });
    });
    ui.put(view, ui.head('People', '구성원 추가'), form);
  }

  HR.register('people', {
    render: function (view, parts) {
      var sub = parts[0] || '';
      if (sub === 'new' && S.isAdmin) return addForm(view);
      if (sub && sub !== 'chart') {
        if (sub === S.mid) { HR.go('info' + (parts[1] ? '/' + parts[1] : '')); return; }
        ui.put(view, h('a', { href: '#people', class: 'back', text: '← 구성원' }));
        return HR.info.render(view, sub, parts[1] || '', 'people/' + sub);
      }
      ui.put(view, ui.head('People', '구성원'), ui.tabs([['', '구성원 ' + HR.memberList(false).length], ['chart', '조직도']], sub, 'people'));
      if (sub === 'chart') chart(view); else list(view);
    }
  });
})();
