/* fillts HR — 0) INFO: 요약 대시보드 · 인사정보 · 성장 · 교육 · 급여 · 문서·증명서 · 인사노트 · 계약서 · 알림 설정
   본인(#info/...)과 관리자가 보는 구성원 상세(#people/<id>/...)가 같은 화면을 쓴다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var editing = {};

  /* ---------- 데이터 ---------- */
  function privOf(mid) {
    if (mid === S.mid) return S.priv || {};
    if (!S.isAdmin) return null;
    return HR.load('priv:' + mid, function () { return db.doc('hr_private/' + mid).get().then(function (s) { return s.exists ? s.data() : {}; }); }) || {};
  }
  function listOf(col, mid) {
    return HR.load(col + ':' + mid, function () { return db.collection(col).where('memberId', '==', mid).get().then(HR.rows); }) || [];
  }
  function accountOf(mid) {
    var u = null; Object.keys(S.users).forEach(function (k) { if (S.users[k].memberId === mid) u = Object.assign({ uid: k }, S.users[k]); }); return u;
  }

  /* ---------- 인사정보 필드 정의 ---------- */
  var orgOpts = function () { return [['', S.cfg.companyName + ' (전사)']].concat(Object.keys(S.orgs).map(function (k) { return [k, S.orgs[k].name]; })); };
  var SECTIONS = [
    { id: 'org', title: '조직 · 직책', store: 'm', fields: [
      { k: 'orgId', l: '주조직', type: 'select', opts: orgOpts, show: function (m) { return HR.orgName(m.orgId) + (m.orgRole ? ' · ' + m.orgRole : ''); } },
      { k: 'orgRole', l: '직책', hint: '예: 대표, 팀장, 리드' },
      { k: 'isOrgHead', l: '조직장', type: 'check', show: function (m) { return m.isOrgHead ? '조직장' : '구성원'; } },
      { k: 'subOrgs', l: '겸임 조직', type: 'suborgs', show: function (m) { return (m.subOrgs || []).map(function (s) { return HR.orgName(s.orgId) + (s.role ? ' · ' + s.role : ''); }).join(', '); } }
    ] },
    { id: 'job', title: '직무 · 직군', store: 'm', fields: [{ k: 'job', l: '직무', hint: '예: 대표, 제품기획개발' }, { k: 'jobFamily', l: '직군', hint: '예: 제품기획개발' }] },
    { id: 'pos', title: '직위 · 직급', store: 'm', fields: [{ k: 'position', l: '직위' }, { k: 'grade', l: '직급' }] },
    { id: 'basic', title: '기본 정보', store: 'm', fields: [{ k: 'name', l: '이름 (본명)', req: true }, { k: 'nickname', l: '닉네임' }] },
    { id: 'mail', title: '이메일 · 사번', store: 'm', fields: [{ k: 'email', l: '회사 이메일', type: 'email' }, { k: 'empNo', l: '사번' }] },
    { id: 'hire', title: '입사 정보', store: 'm', fields: [
      { k: 'hireDate', l: '입사일', type: 'date', req: true, show: function (m) { return m.hireDate ? fmt.dateLong(m.hireDate) + '  ·  ' + L.tenureText(m.hireDate, fmt.today()) + ' 재직' : ''; } },
      { k: 'groupHireDate', l: '그룹 입사일', type: 'date', show: function (m) { return m.groupHireDate ? fmt.dateLong(m.groupHireDate) : ''; } },
      { k: 'hireType', l: '입사 유형', type: 'select', opts: function () { return [['신입', '신입'], ['경력', '경력']]; } },
      { k: 'type', l: '고용 형태', type: 'select', opts: function () { return [['정규직', '정규직'], ['계약직', '계약직'], ['단시간', '단시간'], ['인턴', '인턴']]; } },
      { k: 'weeklyHours', l: '주 소정근로시간', type: 'number', show: function (m) { return m.weeklyHours ? m.weeklyHours + '시간' : ''; } },
      { k: 'status', l: '재직 상태', type: 'select', opts: function () { return [['재직', '재직'], ['휴직', '휴직'], ['퇴사', '퇴사']]; } },
      { k: 'leaveDate', l: '퇴사일', type: 'date', show: function (m) { return m.leaveDate ? fmt.dateLong(m.leaveDate) : ''; } }
    ] },
    { id: 'sched', title: '근무 일정', store: 'm', fields: [
      { k: 'autoIn', l: '기본 출근 시각', type: 'time', show: function (m) { return m.autoIn ? m.autoIn + ' (출근 버튼을 누르지 않은 근무일에 적용 · 먼저 누르면 그 시각 우선)' : '없음 · 출근 버튼으로 기록'; } },
      { k: 'autoOut', l: '기본 퇴근 시각', type: 'time', show: function (m) { return m.autoOut || ''; } }
    ] },
    { id: 'lead', title: '리더 · 연동', store: 'm', fields: [
      { k: 'leaderId', l: '리더 (승인·원온원)', type: 'select', opts: function () { return [['', '(없음)']].concat(HR.memberList(false).map(function (x) { return [x.id, x.name]; })); }, show: function (m) { return m.leaderId ? HR.name(m.leaderId) : ''; } },
      { k: 'slackId', l: 'Slack 사용자 ID', hint: '비워 두면 회사 이메일로 자동 연결' }
    ] },
    { id: 'personal', title: '생일 · 연락처 · 주소', store: 'p', fields: [
      { k: 'rrn', l: '주민등록번호', type: 'none', show: function () { return '보관하지 않음 · 급여·4대보험 대행사에서만 관리 (개인정보보호법 제24조의2)'; } },
      { k: 'birthday', l: '생일', type: 'date', show: function (p) { return p.birthday ? fmt.dateLong(p.birthday) : ''; } },
      { k: 'phone', l: '휴대전화번호', type: 'tel', hint: '+82-10-0000-0000' },
      { k: 'personalEmail', l: '개인 이메일', type: 'email' },
      { k: 'address', l: '주소' },
      { k: 'emergency', l: '비상 연락처', hint: '이름 · 관계 · 번호' }
    ] }
  ];

  function canEdit(sec, mid) { return sec.store === 'p' ? (mid === S.mid || S.isAdmin) : S.isAdmin; }
  function canSee(sec, mid) { return sec.store === 'p' ? (mid === S.mid || S.isAdmin) : true; }

  function sectionView(sec, mid, m, p) {
    var src = sec.store === 'p' ? p : m, key = mid + ':' + sec.id, edit = editing[key];
    var head = h('div', { class: 'info-head' }, h('h3', { text: sec.title }),
      canEdit(sec, mid) ? h('a', { href: '#', class: 'link', text: edit ? '취소' : '변경', onclick: function (e) { e.preventDefault(); editing[key] = !edit; HR.refresh(); } }) : null);
    if (!edit) {
      var dl = h('dl', { class: 'info-dl' });
      sec.fields.forEach(function (f) {
        var v = f.show ? f.show(src || {}) : (src || {})[f.k];
        if (f.type === 'select' && !f.show && v) { var o = f.opts().filter(function (x) { return x[0] === v; })[0]; v = o ? o[1] : v; }
        var empty = v === '' || v == null;
        dl.appendChild(h('div', null, h('dt', { text: f.l }), h('dd', { class: empty ? 'empty-v' : '', text: empty ? (canEdit(sec, mid) && f.type !== 'none' ? '입력하기 · 정보 미입력' : '정보 미입력') : String(v) })));
      });
      return h('section', { class: 'info-sec' }, head, dl);
    }
    // 편집 폼
    var inputs = {}, form = h('form', { class: 'info-form' }), msgEl = ui.msg();
    sec.fields.forEach(function (f) {
      if (f.type === 'none') return;
      var v = (src || {})[f.k], el;
      if (f.type === 'select') el = ui.select(f.opts(), v == null ? '' : v);
      else if (f.type === 'check') { el = h('input', { type: 'checkbox', checked: !!v }); inputs[f.k] = el; form.appendChild(h('label', { class: 'check' }, el, ' ' + f.l)); return; }
      else if (f.type === 'suborgs') { el = subOrgEditor(v || []); inputs[f.k] = el; form.appendChild(h('div', { class: 'field' }, h('label', { text: f.l }), el)); return; }
      else el = ui.input({ type: f.type || 'text', value: v == null ? '' : v, placeholder: f.hint || '', maxlength: '200' });
      inputs[f.k] = el;
      form.appendChild(ui.field(f.l + (f.req ? ' *' : ''), el));
    });
    form.appendChild(msgEl);
    form.appendChild(h('button', { class: 'btn btn-sm', type: 'submit', text: '저장' }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var upd = {}, changes = [];
      sec.fields.forEach(function (f) {
        var el = inputs[f.k]; if (!el) return;
        var nv = f.type === 'check' ? el.checked : f.type === 'suborgs' ? el.value() : f.type === 'number' ? (+el.value || 0) : el.value.trim();
        if (f.k === 'email' || f.k === 'personalEmail') nv = String(nv).toLowerCase();
        var ov = (src || {})[f.k];
        if (JSON.stringify(nv) !== JSON.stringify(ov == null ? (f.type === 'check' ? false : f.type === 'suborgs' ? [] : '') : ov)) {
          upd[f.k] = nv; changes.push({ f: f.k, l: f.l, from: ov == null ? '' : ov, to: nv });
        }
      });
      var missing = sec.fields.filter(function (f) { return f.req && inputs[f.k] && !inputs[f.k].value.trim(); })[0];
      if (missing) return ui.err(msgEl, missing.l + '은(는) 필수입니다.');
      if (!changes.length) { editing[key] = false; HR.refresh(); return; }
      var job;
      if (sec.store === 'p') {
        upd.updatedAt = FV.serverTimestamp();
        job = db.doc('hr_private/' + mid).set(upd, { merge: true }).then(function () { HR.invalidate('priv:' + mid); });
      } else {
        var b = db.batch();
        b.update(db.doc('hr_members/' + mid), upd);
        b.set(db.collection('hr_hist').doc(), { memberId: mid, section: sec.title, changes: changes.map(function (c) { return { l: c.l, from: typeof c.from === 'object' ? JSON.stringify(c.from) : String(c.from), to: typeof c.to === 'object' ? JSON.stringify(c.to) : String(c.to) }; }), by: S.mid, at: FV.serverTimestamp() });
        job = b.commit().then(function () { HR.invalidate('hr_hist:' + mid); });
      }
      job.then(function () { editing[key] = false; ui.toast(sec.title + ' 정보를 저장했습니다.'); HR.refresh(); }).catch(function (x) { ui.fail(x, msgEl); });
    });
    return h('section', { class: 'info-sec editing' }, head, form);
  }
  function subOrgEditor(list) {
    var rows = list.map(function (x) { return { orgId: x.orgId, role: x.role }; });
    var box = h('div', { class: 'stack sm' });
    function draw() {
      ui.clear(box);
      rows.forEach(function (r, i) {
        var sel = ui.select(orgOpts().slice(1), r.orgId, { onchange: function () { r.orgId = this.value; } });
        var role = ui.input({ value: r.role || '', placeholder: '직책', onchange: function () { r.role = this.value; } });
        box.appendChild(h('div', { class: 'row' }, sel, role, h('button', { type: 'button', class: 'x-del', text: '삭제', onclick: function () { rows.splice(i, 1); draw(); } })));
      });
      box.appendChild(h('button', { type: 'button', class: 'link', text: Object.keys(S.orgs).length ? '겸임 조직 추가' : '설정 › 조직에서 조직을 먼저 만드세요', onclick: function () { if (Object.keys(S.orgs).length) { rows.push({ orgId: Object.keys(S.orgs)[0], role: '' }); draw(); } } }));
    }
    draw();
    box.value = function () { return rows.filter(function (r) { return r.orgId; }); };
    return box;
  }

  /* ---------- 탭: 정보 ---------- */
  function tabInfo(view, mid, m) {
    var p = privOf(mid) || {};
    var grid = h('div', { class: 'info-grid' });
    SECTIONS.forEach(function (sec) { if (canSee(sec, mid) && (sec.id !== 'lead' || S.isLead || mid === S.mid)) grid.appendChild(sectionView(sec, mid, m, p)); });
    ui.put(view, grid);
    if (S.isAdmin) ui.put(view, accountPanel(mid, m));
    if (S.isAdmin || mid === S.mid) {
      var hist = listOf('hr_hist', mid).slice().sort(function (a, b) { return (b.at && b.at.toMillis ? b.at.toMillis() : 0) - (a.at && a.at.toMillis ? a.at.toMillis() : 0); });
      var ul = h('ul', { class: 'list' });
      hist.forEach(function (x) {
        ul.appendChild(h('li', null, h('div', { class: 'grow' }, h('div', null, ui.tag(x.section, 'mute'), ' ', (x.changes || []).map(function (c) { return c.l + ': ' + (c.from || '없음') + ' → ' + (c.to || '없음'); }).join(' · ')),
          h('div', { class: 'meta', text: fmt.ts(x.at) + ' · ' + HR.name(x.by) }))));
      });
      if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '변경 내역이 없습니다.' }));
      ui.put(view, ui.panel('정보 변경 내역', null, ul));
    }
  }
  function accountPanel(mid, m) {
    var u = accountOf(mid), inv = m.email && S.invites[m.email.toLowerCase()], msgEl = ui.msg();
    var role = ui.select([['employee', '구성원'], ['manager', '리더 (팀 근태·승인)'], ['admin', '관리자']], (u && u.role) || (inv && inv.role) || 'employee', { id: 'acRole' });
    var stateText = u ? '연결됨 · ' + HR.roleName(u.role) : inv ? '초대됨 · 가입 대기 (' + m.email + ')' : '미연결';
    return ui.panel('계정 · 권한', ui.tag(stateText, u ? 'ok' : inv ? 'warn' : 'mute'),
      h('div', { class: 'row' }, ui.field('HR 권한', role),
        ui.btn(u ? '권한 변경' : '초대 등록', function () {
          if (u) {
            if (u.uid === S.user.uid) return ui.err(msgEl, '본인 권한은 바꿀 수 없습니다.');
            db.doc('hr_users/' + u.uid).update({ role: role.value }).then(function () { ui.ok(msgEl, '권한을 바꿨습니다. 다음 로그인부터 적용됩니다.'); }).catch(function (x) { ui.fail(x, msgEl); });
          } else {
            if (!m.email) return ui.err(msgEl, '회사 이메일을 먼저 입력하세요.');
            db.doc('hr_invites/' + m.email.toLowerCase()).set({ memberId: mid, role: role.value, createdAt: FV.serverTimestamp() })
              .then(function () { ui.ok(msgEl, '초대를 등록했습니다. 직원에게 fillts.com/hr 에서 「초대받은 계정 만들기」를 안내하세요.'); }).catch(function (x) { ui.fail(x, msgEl); });
          }
        }, 'btn-sm'),
        (u || inv) && mid !== S.mid ? ui.confirmBtn('접근 해제', function () {
          var b = db.batch();
          if (u) b.delete(db.doc('hr_users/' + u.uid));
          if (m.email) b.delete(db.doc('hr_invites/' + m.email.toLowerCase()));
          b.commit().then(function () { ui.ok(msgEl, '접근을 해제했습니다. 기록은 보존됩니다.'); }).catch(function (x) { ui.fail(x, msgEl); });
        }, 'btn-line btn-sm danger') : null),
      msgEl,
      h('p', { class: 'note', text: '관리자: 전체 인사·급여·근태·설정 / 리더: 팀 근태 열람과 본인이 리더인 구성원의 휴가·정정 승인, 원온원 / 구성원: 본인 정보와 공개 정보. 퇴사 시 접근 해제하면 즉시 로그인해도 데이터를 볼 수 없습니다.' }));
  }

  /* ---------- 탭: 요약 (본인 대시보드) ---------- */
  function tabSummary(view) {
    var t = fmt.today(), me = S.members[S.mid] || {};
    var left = h('div', { class: 'stack' }, HR.work.punchCard(), HR.work.weekPanel());
    var led = HR.annualOf(S.mid);
    left.appendChild(ui.panel('Annual leave', h('a', { href: '#leave', class: 'link', text: '휴가 신청' }),
      h('div', { class: 'big-num' }, led ? fmt.days(led.balance) : '-', h('small', { text: '남음' })),
      h('p', { class: 'muted small', text: led ? '발생 ' + fmt.days(led.granted) + ' · 사용 ' + fmt.days(led.used) + (led.expiring ? ' · ' + fmt.dot(L.addDays(led.expiring.exp, -1)) + '까지 ' + fmt.days(led.expiring.left) + ' 소멸 예정' : '') : '입사일이 등록되면 자동 계산됩니다.' })));

    var right = h('div', { class: 'stack' });
    // 할 일 (리더)
    if (S.isLead) {
      var todo = h('ul', { class: 'list' });
      S.leaves.filter(function (l) { return l.status === 'pending' && (S.isAdmin || (S.members[l.memberId] || {}).leaderId === S.mid) && l.memberId !== S.mid; })
        .forEach(function (l) { todo.appendChild(HR.leave.item(l, { approve: true })); });
      if (S.isAdmin) S.fixes.forEach(function (f) { todo.appendChild(HR.work.fixItem(f, true)); });   // 근태 정정은 관리자만 승인 (본인 것 포함)
      if (S.isAdmin) HR.certs.todo().forEach(function (li) { todo.appendChild(li); });   // 증명서 요청
      if (S.isAdmin) HR.payreq.todo().forEach(function (r) { todo.appendChild(h('li', null, h('a', { class: 'grow', href: '#payreq/r/' + r.id }, ui.tag(r.status === 'pending' ? '입금 승인' : '입금 대기', r.status === 'pending' ? 'red' : 'warn'), ' ', HR.name(r.memberId) + ' · ' + r.title + ' · ' + fmt.won(r.total)), h('span', { class: 'meta', text: '희망 ' + fmt.date(r.due) }))); });   // 입금요청
      if (S.isAdmin) (S.ots || []).filter(function (o) { return o.status === 'pending'; }).forEach(function (o) { todo.appendChild(HR.work.otItem(o, true)); });   // 연장·야간·휴일근무 신청
      if (todo.children.length) right.appendChild(ui.panel('To do · 승인 대기 ' + todo.children.length, null, todo));
    }
    // 중요 공지
    var imp = S.notices.filter(function (n) { return n.pinned || n.important; }).slice(0, 3);
    if (imp.length) {
      var nl = h('ul', { class: 'list' });
      imp.forEach(function (n) { nl.appendChild(h('li', null, h('a', { class: 'grow', href: '#notice/' + n.id }, n.important ? ui.tag('중요', 'red') : ui.tag('공지', 'mute'), ' ', n.title), h('span', { class: 'meta', text: fmt.ts(n.createdAt) }))); });
      right.appendChild(ui.panel('Notice', h('a', { href: '#notice', class: 'link', text: '전체' }), nl));
    }
    // 다가오는 일정
    var ev = [];
    HR.leavesOf(S.mid).forEach(function (l) { if (l.status === 'approved' && l.end >= t) ev.push([l.start, ui.tag('휴가', 'red'), HR.policy(l.type).name + ' ' + fmt.date(l.start) + (l.end !== l.start ? ' – ' + fmt.date(l.end) : '')]); });
    HR.myOnes().forEach(function (o) { if (o.status !== 'done' && o.date >= t) ev.push([o.date, ui.tag('1:1', 'warn'), HR.name(o.leaderId === S.mid ? o.memberId : o.leaderId) + ' · ' + fmt.date(o.date) + ' ' + (o.time || '')]); });
    Object.keys(S.hmap).forEach(function (d) { if (d >= t && d <= L.addDays(t, 45)) ev.push([d, ui.tag('Holiday', 'mute'), fmt.date(d) + ' ' + S.hmap[d]]); });
    HR.memberList(false).forEach(function (m) {
      if (!m.hireDate) return;
      var ann = t.slice(0, 4) + m.hireDate.slice(4), yrs = +t.slice(0, 4) - +m.hireDate.slice(0, 4);
      if (yrs >= 1 && ann >= t && ann <= L.addDays(t, 30)) ev.push([ann, ui.tag('Anniversary', 'ok'), m.name + ' 입사 ' + yrs + '주년 · ' + fmt.date(ann)]);
    });
    var el = h('ul', { class: 'list' });
    ev.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }).slice(0, 8).forEach(function (x) { el.appendChild(h('li', null, x[1], h('div', { class: 'grow', text: x[2] }))); });
    if (!el.children.length) el.appendChild(h('li', { class: 'empty', text: '다가오는 일정이 없습니다.' }));
    right.appendChild(ui.panel('Upcoming', null, el));
    // 내 목표
    // 순서는 목표관리 › 「내 목표 순서」에서 정한다 (hr_goals.ord)
    var goals = S.goals.filter(function (g) { return g.ownerMid === S.mid && g.status !== 'done'; }).sort(function (a, b) { return HR.goals.rank(a) - HR.goals.rank(b); });
    var gl = h('ul', { class: 'list' });
    goals.slice(0, 6).forEach(function (g) { gl.appendChild(HR.goals.mini(g)); });
    if (!gl.children.length) gl.appendChild(h('li', { class: 'empty', text: '진행 중인 목표가 없습니다. 목표관리에서 이번 분기 목표를 세워 보세요.' }));
    right.appendChild(ui.panel('My goals', h('a', { href: '#goals', class: 'link', text: '목표관리' }), gl));

    ui.put(view, HR.today.panel(), h('div', { class: 'home-grid' }, left, right));
    void me;
  }

  /* ---------- 탭: 성장 ---------- */
  function tabGrowth(view, mid) {
    var gl = h('ul', { class: 'list' });
    S.goals.filter(function (g) { return g.ownerMid === mid; }).sort(function (a, b) { return HR.goals.rank(a) - HR.goals.rank(b) || (b.period || '').localeCompare(a.period || ''); }).forEach(function (g) { gl.appendChild(HR.goals.mini(g)); });
    if (!gl.children.length) gl.appendChild(h('li', { class: 'empty', text: '등록된 목표가 없습니다.' }));
    var ol = h('ul', { class: 'list' });
    HR.myOnes().filter(function (o) { return o.memberId === mid || o.leaderId === mid; }).forEach(function (o) {
      ol.appendChild(h('li', null, h('a', { class: 'grow', href: '#goals/one/' + o.id, text: HR.name(o.leaderId) + ' ↔ ' + HR.name(o.memberId) + ' · ' + fmt.date(o.date) }), ui.tag(o.status === 'done' ? '완료' : '예정', o.status === 'done' ? 'mute' : 'ok')));
    });
    if (!ol.children.length) ol.appendChild(h('li', { class: 'empty', text: '볼 수 있는 원온원 기록이 없습니다.' }));
    var praise = S.feed.filter(function (f) { return f.kind === 'praise' && f.toMid === mid; }).slice(0, 10), pl = h('ul', { class: 'list' });
    praise.forEach(function (f) { pl.appendChild(h('li', null, h('div', { class: 'grow' }, h('div', { class: 'body', text: f.text }), h('div', { class: 'meta', text: HR.name(f.authorMid) + ' · ' + fmt.ts(f.createdAt) })))); });
    if (!pl.children.length) pl.appendChild(h('li', { class: 'empty', text: '받은 칭찬이 아직 없습니다.' }));
    ui.put(view, h('div', { class: 'two-col' }, ui.panel('Goals', null, gl), h('div', { class: 'stack' }, ui.panel('1:1', null, ol), ui.panel('Praise', null, pl))));
  }

  /* ---------- 탭: 교육 ---------- */
  // 법정 의무교육: 자료(영상·링크)를 보고 본인이 「교육 완료」를 누르면 이수로 기록된다
  function eduDone(recs, e, y, q) {
    return recs.filter(function (r) {
      if (r.kind !== e.id || (r.date || '').slice(0, 4) !== y) return false;
      return e.cycle !== 'quarter' || Math.floor((+r.date.slice(5, 7) - 1) / 3) === q;
    });
  }
  function eduMaterial(x) {
    if (x.kind === 'video') {
      return h('figure', { class: 'edu-video' },
        h('div', { class: 'edu-frame' }, h('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + x.yt + '?rel=0', title: x.title, loading: 'lazy',
          allow: 'encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' })),
        h('figcaption', null, h('span', { text: x.title }), h('span', { class: 'meta' }, x.src + ' · ', h('a', { href: 'https://www.youtube.com/watch?v=' + x.yt, target: '_blank', rel: 'noopener noreferrer', class: 'link', text: 'YouTube에서 보기' }))));
    }
    return h('li', null, h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer', class: 'link', text: x.title + ' ↗' }), h('span', { class: 'meta', text: ' ' + x.src }));
  }
  function tabEdu(view, mid) {
    var recs = listOf('hr_edu', mid), t = fmt.today(), y = t.slice(0, 4), q = Math.floor((+t.slice(5, 7) - 1) / 3);
    var self = mid === S.mid, headcount = HR.memberList(false).length;
    var list = L.MANDATORY_EDU.map(function (e) { return { e: e, sc: L.eduScope(e, S.cfg, headcount) }; });
    var active = list.filter(function (x) { return x.sc[0] !== 'na'; }), na = list.filter(function (x) { return x.sc[0] === 'na'; });
    var doneCnt = active.filter(function (x) { return eduDone(recs, x.e, y, q).length; }).length;
    ui.put(view, h('div', { class: 'edu-sum' },
      h('div', null, h('div', { class: 'label', text: y + ' Mandatory training' }), h('div', { class: 'edu-sum-num', text: doneCnt + ' / ' + active.length + ' 이수' })),
      h('p', { class: 'muted small', text: self ? '각 교육의 자료를 끝까지 보고 「교육 완료」를 눌러 직접 체크하세요. 산업안전보건교육은 분기마다 다시 체크합니다.' : '구성원이 자료를 보고 직접 체크합니다.' })));
    active.forEach(function (x) {
      var e = x.e, sc = x.sc, done = eduDone(recs, e, y, q), last = done[done.length - 1];
      var vids = e.materials.filter(function (v) { return v.kind === 'video'; }), links = e.materials.filter(function (v) { return v.kind !== 'video'; });
      var foot;
      if (last) {
        foot = h('div', { class: 'edu-foot' }, ui.tag('이수 완료', 'ok'),
          h('span', { class: 'meta', text: fmt.dot(last.date) + (e.cycle === 'quarter' ? ' · ' + (q + 1) + '분기' : '') + (last.method === 'self' ? ' · 본인 확인' : '') }),
          (self || S.isAdmin) ? ui.confirmBtn('이수 취소', function () { db.doc('hr_edu/' + last.id).delete().then(function () { HR.invalidate('hr_edu:' + mid); }).catch(ui.fail); }) : null);
      } else if (self) {
        var cb = h('input', { type: 'checkbox' }), go = h('button', { type: 'button', class: 'btn btn-sm', text: '교육 완료', disabled: true }), em = ui.msg();
        cb.addEventListener('change', function () { go.disabled = !cb.checked; });
        go.addEventListener('click', function () {
          go.disabled = true;
          db.collection('hr_edu').add({ memberId: mid, kind: e.id, title: e.name, date: fmt.today(), hours: e.hours, method: 'self', by: S.mid, createdAt: FV.serverTimestamp() })
            .then(function () { HR.invalidate('hr_edu:' + mid); ui.toast(e.name + ' 이수를 기록했습니다.'); }).catch(function (err) { go.disabled = false; ui.fail(err, em); });
        });
        foot = h('div', { class: 'edu-foot' }, h('label', { class: 'check' }, cb, ' 위 교육자료를 모두 읽고 시청했습니다.'), go, em);
      } else {
        foot = h('div', { class: 'edu-foot' }, ui.tag(e.cycle === 'quarter' ? '이번 분기 미이수' : '미이수', sc[0] === 'simple' ? 'warn' : 'red'), h('span', { class: 'meta', text: '본인이 자료를 보고 체크합니다.' }));
      }
      ui.put(view, h('section', { class: 'panel edu-card' + (last ? ' is-done' : '') },
        h('div', { class: 'edu-head' },
          h('div', null, h('h2', { class: 'edu-title', text: e.name }),
            h('div', { class: 'meta', text: (e.cycle === 'quarter' ? '분기마다 · ' : '연 1회 · ') + '권장 ' + e.hours + '시간 · ' + e.law })),
          h('div', { class: 'edu-tags' }, ui.tag({ required: '필수', simple: '간이 가능' }[sc[0]], { required: 'red', simple: 'warn' }[sc[0]]))),
        h('p', { class: 'muted small', text: sc[1] }),
        vids.length ? h('div', { class: 'edu-videos' }, vids.map(eduMaterial)) : null,
        links.length ? h('ul', { class: 'edu-links' }, links.map(eduMaterial)) : null,
        foot));
    });
    if (na.length) ui.put(view, h('p', { class: 'note', text: '해당 없음: ' + na.map(function (x) { return x.e.name + ' (' + x.sc[1] + ')'; }).join(', ') }));

    // 외부·직무 교육 (법정교육 외)
    var canAdd = S.isAdmin || self;
    var title = ui.input({ placeholder: '예: 화장품 GMP 실무 과정', maxlength: '120' }), date = ui.input({ type: 'date', value: t }), hours = ui.input({ type: 'number', min: '0', step: '0.5', value: '1' }), m = ui.msg();
    var form = canAdd ? h('form', { class: 'panel' }, ui.label('Other training · 외부·직무 교육'), ui.field('과정명', title), h('div', { class: 'row' }, ui.field('이수일', date), ui.field('시간', hours)), m, h('button', { class: 'btn btn-sm', type: 'submit', text: '등록' })) : null;
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!title.value.trim()) return ui.err(m, '과정명을 입력하세요.');
      db.collection('hr_edu').add({ memberId: mid, kind: 'etc', title: title.value.trim(), date: date.value, hours: +hours.value || 0, by: S.mid, createdAt: FV.serverTimestamp() })
        .then(function () { HR.invalidate('hr_edu:' + mid); ui.toast('교육 이수를 등록했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    });
    var ul = h('ul', { class: 'list' });
    recs.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (r) {
      ul.appendChild(h('li', null, h('div', { class: 'grow' }, h('div', { text: r.title }), h('div', { class: 'meta', text: fmt.dot(r.date) + ' · ' + r.hours + '시간' + (r.method === 'self' ? ' · 본인 확인' : '') })),
        canAdd ? ui.confirmBtn('삭제', function () { db.doc('hr_edu/' + r.id).delete().then(function () { HR.invalidate('hr_edu:' + mid); }).catch(ui.fail); }) : null));
    });
    if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '등록된 교육 이수 기록이 없습니다.' }));
    ui.put(view, h('div', { class: 'two-col' }, form, ui.panel('History', null, ul)),
      h('p', { class: 'note', text: '적용 여부는 설정 › 회사 기준의 「상시근로자 5인 이상」과 현재 재직 인원(' + headcount + '명)으로 자동 판정합니다. 이수 기록(일자·본인 확인)은 노동청 점검 시 증빙으로 남습니다. 업종에 따라 산업안전보건교육 일부가 제외될 수 있으니 관할 노동청에 확인하세요.' }));
  }

  /* ---------- 탭: 급여 — 급여명세서 열람만 (업로드는 설정 › 급여명세서) ---------- */
  function tabPay(view, mid) { HR.payslip.memberTab(view, mid); }

  /* ---------- 탭: 문서 · 증명서 / 계약서 ---------- */
  function tabDocs(view, mid, m, kind) {
    var docs = listOf('hr_docs', mid).filter(function (d) { return kind === 'contract' ? d.kind === 'contract' : d.kind !== 'contract'; })
      .sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1; });
    if (kind !== 'contract') {
      var ck = ui.select([['재직증명서', '재직증명서'], ['경력증명서', '경력증명서']], '재직증명서'), purpose = ui.input({ placeholder: '예: 금융기관 제출용', maxlength: '60' }), cm = ui.msg();
      var cert = h('form', { class: 'panel' }, ui.label('Certificate'), h('div', { class: 'row' }, ui.field('증명서', ck), ui.field('용도', purpose)), cm,
        h('button', { class: 'btn btn-sm', type: 'submit', text: '발급하기' }),
        h('p', { class: 'note', text: '발급하면 인쇄 화면이 열립니다. 「PDF로 저장」을 선택하면 파일로 받을 수 있습니다. 발급 이력이 남습니다.' }));
      cert.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!purpose.value.trim()) return ui.err(cm, '용도를 입력하세요.');
        var no = 'F' + fmt.today().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
        db.collection('hr_docs').add({ memberId: mid, kind: 'cert', title: ck.value, purpose: purpose.value.trim(), no: no, date: fmt.today(), by: S.mid, at: FV.serverTimestamp() })
          .then(function () { HR.invalidate('hr_docs:' + mid); printCert(ck.value, m, privOf(mid) || {}, purpose.value.trim(), no); }).catch(function (x) { ui.fail(x, cm); });
      });
      ui.put(view, cert);
    }
    var ul = h('ul', { class: 'list' });
    docs.forEach(function (d) {
      ul.appendChild(h('li', null, h('div', { class: 'grow' },
        h('div', null, d.kind === 'cert' ? ui.tag('발급', 'mute') : d.status === 'signed' ? ui.tag('체결·교부', 'ok') : d.status ? ui.tag('서명 대기', 'warn') : null, ' ', d.title + (d.purpose ? ' · ' + d.purpose : '')),
        h('div', { class: 'meta', text: fmt.dot(d.date) + (d.no ? ' · ' + d.no : '') + (d.note ? ' · ' + d.note : '') })),
        d.url && /^https:\/\//.test(d.url) ? h('a', { class: 'link', href: d.url, target: '_blank', rel: 'noopener noreferrer', text: '열기' }) : null,
        S.isAdmin ? ui.confirmBtn('삭제', function () { db.doc('hr_docs/' + d.id).delete().then(function () { HR.invalidate('hr_docs:' + mid); }).catch(ui.fail); }) : null));
    });
    if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: kind === 'contract' ? '등록된 계약서가 없습니다.' : '발급·등록된 문서가 없습니다.' }));
    ui.put(view, ui.panel(kind === 'contract' ? 'Contracts' : 'Documents', null, ul));
    if (S.isAdmin) {
      var title = ui.input({ placeholder: kind === 'contract' ? '예: 근로계약서 (2026)' : '예: 연봉계약서, 비밀유지서약서', maxlength: '100' });
      var date = ui.input({ type: 'date', value: fmt.today() }), url = ui.input({ type: 'url', placeholder: 'https://drive.google.com/… (권한 제한된 링크)' });
      var st = ui.select([['signed', '체결·교부 완료'], ['pending', '서명 대기']], 'signed'), note = ui.input({ maxlength: '120', placeholder: '메모' }), am = ui.msg();
      var f = h('form', { class: 'panel' }, ui.label('Add · 관리자'), h('div', { class: 'row' }, ui.field('제목', title), ui.field(kind === 'contract' ? '교부일' : '일자', date), ui.field('상태', st)), ui.field('문서 링크', url), ui.field('메모', note), am, h('button', { class: 'btn btn-sm', type: 'submit', text: '등록' }));
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!title.value.trim()) return ui.err(am, '제목을 입력하세요.');
        if (url.value && !/^https:\/\//.test(url.value)) return ui.err(am, '링크는 https:// 로 시작해야 합니다.');
        db.collection('hr_docs').add({ memberId: mid, kind: kind === 'contract' ? 'contract' : 'doc', title: title.value.trim(), date: date.value, url: url.value.trim(), status: st.value, note: note.value.trim(), by: S.mid, at: FV.serverTimestamp() })
          .then(function () { HR.invalidate('hr_docs:' + mid); ui.toast('등록했습니다.'); }).catch(function (x) { ui.fail(x, am); });
      });
      ui.put(view, f);
    }
    if (kind === 'contract') ui.put(view, h('p', { class: 'note', text: '근로계약 체결 시 임금·소정근로시간·휴일·연차 등을 서면으로 명시하고 근로자에게 교부해야 합니다 (근로기준법 제17조, 미교부 시 500만원 이하 벌금). 계약서 등 근로관계 서류는 3년간 보존합니다 (제42조).' }));
  }

  function printCert(kind, m, p, purpose, no) {
    var area = document.getElementById('printArea');
    if (area) area.remove();
    var t = fmt.today(), c = S.cfg;
    var rows = [['성명', m.name], ['생년월일', p.birthday ? fmt.dateLong(p.birthday) : ''], ['소속', HR.orgName(m.orgId)], ['직위', m.position || m.orgRole || ''],
      ['직무', m.job || ''], [kind === '재직증명서' ? '재직기간' : '근무기간', fmt.dateLong(m.hireDate) + ' ~ ' + (m.status === '퇴사' && m.leaveDate ? fmt.dateLong(m.leaveDate) : '현재')], ['용도', purpose]];
    area = h('div', { id: 'printArea', class: 'print-area' },
      h('div', { class: 'cert' },
        h('div', { class: 'cert-no', text: '발급번호 ' + no }),
        h('h1', { class: 'cert-title', text: kind }),
        h('table', { class: 'cert-table' }, h('tbody', null, rows.map(function (r) { return h('tr', null, h('th', { text: r[0] }), h('td', { text: r[1] })); }))),
        h('p', { class: 'cert-body', text: '위 사람은 ' + (kind === '재직증명서' ? '현재 당사에 재직 중임을' : '위 기간 동안 당사에서 근무하였음을') + ' 증명합니다.' }),
        h('p', { class: 'cert-date', text: fmt.dateLong(t) }),
        h('div', { class: 'cert-sign' }, h('div', { class: 'cert-co', text: c.companyName }), c.bizNo ? h('div', { text: '사업자등록번호  ' + c.bizNo }) : null, c.companyAddress ? h('div', { text: c.companyAddress }) : null,
          h('div', { class: 'cert-ceo' }, h('span', { text: '대표이사  ' + c.ceoName }), h('span', { class: 'cert-seal', text: '(인)' })))),
      h('div', { class: 'print-actions' }, ui.btn('인쇄 · PDF 저장', function () { window.print(); }), ui.btn('닫기', function () { area.remove(); }, 'btn-line')));
    document.body.appendChild(area);
    setTimeout(function () { window.print(); }, 300);
  }

  /* ---------- 탭: 인사노트 (관리자) ---------- */
  function tabNotes(view, mid) {
    var notes = listOf('hr_notes', mid).slice().sort(function (a, b) { return (b.at && b.at.toMillis ? b.at.toMillis() : 0) - (a.at && a.at.toMillis ? a.at.toMillis() : 0); });
    var kind = ui.select([['면담', '면담'], ['평가', '평가'], ['칭찬', '칭찬'], ['이슈', '이슈'], ['발령', '발령'], ['기타', '기타']], '면담');
    var text = h('textarea', { rows: '4', maxlength: '4000', placeholder: '관리자만 볼 수 있는 기록입니다. 사실 위주로 남겨 주세요.' }), m = ui.msg();
    var f = h('form', { class: 'panel' }, ui.label('New note · 관리자 전용'), ui.field('분류', kind), ui.field('내용', text), m, h('button', { class: 'btn btn-sm', type: 'submit', text: '기록' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!text.value.trim()) return ui.err(m, '내용을 입력하세요.');
      db.collection('hr_notes').add({ memberId: mid, kind: kind.value, text: text.value.trim(), by: S.mid, at: FV.serverTimestamp() })
        .then(function () { HR.invalidate('hr_notes:' + mid); text.value = ''; ui.toast('기록했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    });
    var ul = h('ul', { class: 'list' });
    notes.forEach(function (n) {
      ul.appendChild(h('li', null, h('div', { class: 'grow' }, h('div', null, ui.tag(n.kind, 'mute')), h('div', { class: 'body', text: n.text }), h('div', { class: 'meta', text: fmt.ts(n.at) + ' · ' + HR.name(n.by) })),
        ui.confirmBtn('삭제', function () { db.doc('hr_notes/' + n.id).delete().then(function () { HR.invalidate('hr_notes:' + mid); }).catch(ui.fail); })));
    });
    if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '인사노트가 없습니다.' }));
    ui.put(view, h('div', { class: 'two-col' }, f, ui.panel('Notes', null, ul)));
  }

  /* ---------- 탭: 알림 설정 (본인) ---------- */
  var CATS = [['approval', '요청 · 결과', '휴가 · 근무 정정 요청과 승인/반려 결과'], ['notice', '공지', '새 공지 (중요 공지는 메일 필수)'], ['reminder', '리마인드', '퇴근 누락, 주 52시간 임박, 원온원 D-1, 연차 촉진, 목표 체크인'], ['social', '칭찬 · 원온원', '받은 칭찬, 원온원 일정']];
  var DEF = { approval: { web: true, slack: true, email: true }, notice: { web: true, slack: true, email: false }, reminder: { web: true, slack: true, email: false }, social: { web: true, slack: true, email: false } };
  function tabNotify(view) {
    var cur = (S.priv && S.priv.notify) || {}, me = S.members[S.mid] || {};
    var tb = h('table', { class: 'table notify-table' });
    tb.appendChild(h('thead', null, h('tr', null, h('th', { text: '알림' }), h('th', { class: 'c', text: '웹' }), h('th', { class: 'c', text: 'Slack' }), h('th', { class: 'c', text: '메일' }))));
    var body = h('tbody'), boxes = {};
    CATS.forEach(function (c) {
      var v = Object.assign({}, DEF[c[0]], cur[c[0]] || {});
      boxes[c[0]] = {};
      var tr = h('tr', null, h('td', null, h('div', { text: c[1] }), h('div', { class: 'meta', text: c[2] })));
      ['web', 'slack', 'email'].forEach(function (ch) {
        var cb = h('input', { type: 'checkbox', checked: v[ch], 'aria-label': c[1] + ' ' + ch });
        boxes[c[0]][ch] = cb;
        tr.appendChild(h('td', { class: 'c' }, cb));
      });
      body.appendChild(tr);
    });
    tb.appendChild(body);
    var m = ui.msg();
    var save = ui.btn('저장', function () {
      var n = {};
      Object.keys(boxes).forEach(function (k) { n[k] = { web: boxes[k].web.checked, slack: boxes[k].slack.checked, email: boxes[k].email.checked }; });
      db.doc('hr_private/' + S.mid).set({ notify: n, updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { ui.ok(m, '알림 설정을 저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    }, 'btn-sm');
    var perm = 'Notification' in window ? Notification.permission : 'unsupported';
    var browser = ui.panel('Browser', null,
      h('p', { class: 'muted small', text: perm === 'granted' ? '이 브라우저에서 HR 탭이 열려 있으면 새 알림을 데스크톱 알림으로 띄웁니다.' : perm === 'denied' ? '브라우저에서 알림이 차단되어 있습니다. 주소창의 사이트 설정에서 허용하세요.' : perm === 'unsupported' ? '이 브라우저는 데스크톱 알림을 지원하지 않습니다.' : 'HR 탭이 열려 있을 때 데스크톱 알림을 받을 수 있습니다.' }),
      perm === 'default' ? ui.btn('데스크톱 알림 허용', function () { Notification.requestPermission().then(function () { HR.refresh(); }); }, 'btn-line btn-sm') : null);
    var slack = ui.panel('Slack', null,
      h('p', { class: 'muted small', text: me.slackId ? 'Slack 사용자 ' + me.slackId + ' 로 연결되어 있습니다.' : '회사 이메일(' + (me.email || '미등록') + ')과 같은 Slack 계정으로 자동 연결됩니다. 휴대폰에 Slack 앱을 설치하면 푸시 알림을 받고, 리더는 Slack에서 바로 승인할 수 있습니다.' }));
    ui.put(view, ui.panel('Channels', null, h('div', { class: 'table-wrap flat' }, tb), m, save), h('div', { class: 'two-col' }, slack, browser));
  }

  /* ---------- 공통 헤더 + 라우팅 ---------- */
  function profileHead(m, self) {
    var t = fmt.today(), lv = HR.att.live(m);
    var now = lv.st === 'left' ? ui.tag('퇴사', 'mute') : lv.st === 'away' ? ui.tag(HR.policy(lv.away.type).name, 'red') : lv.st === 'in' ? ui.tag('근무 중 · ' + HR.att.modeName(lv.mode), 'ok') : null;
    return h('header', { class: 'profile' },
      h('div', { class: 'avatar', 'aria-hidden': 'true', text: (m.name || '?').slice(-2) }),
      h('div', { class: 'grow' },
        h('div', { class: 'label', text: self ? 'Info · 내 정보' : 'Info' }),
        h('h1', { class: 'tab-title' }, m.name || '', m.nickname ? h('span', { class: 'nick', text: ' ' + m.nickname }) : null),
        h('div', { class: 'profile-meta' }, [HR.orgName(m.orgId) + (m.orgRole ? ' · ' + m.orgRole : ''), m.position, m.email, m.hireDate ? L.tenureText(m.hireDate, t) + ' 재직' : ''].filter(Boolean).join('  ·  '), ' ', now)));
  }
  function render(view, mid, sub, base) {
    var m = S.members[mid];
    if (!m) { ui.put(view, ui.empty('구성원을 찾을 수 없습니다.')); return; }
    var self = mid === S.mid, admin = S.isAdmin;
    var tabs = self
      ? [['', '요약'], ['info', '정보'], ['work', '비전 · 강점'], ['growth', '성장'], ['edu', '교육'], ['pay', '급여'], ['docs', '문서 · 증명서'], ['notify', '알림 설정']]
      : admin ? [['', '정보'], ['work', '비전 · 강점'], ['growth', '성장'], ['edu', '교육'], ['pay', '급여'], ['docs', '문서 · 증명서'], ['notes', '인사노트']]
        : [['', '정보'], ['growth', '성장']];
    if (!tabs.some(function (x) { return x[0] === sub; })) sub = '';
    ui.put(view, profileHead(m, self), ui.tabs(tabs, sub, base));
    if (self && sub === '') return tabSummary(view);
    if (sub === '' || sub === 'info') return tabInfo(view, mid, m);
    if (sub === 'work') return HR.workMe.tab(view, mid);   // 나의 목표 · Top 5 · 강점 · 날개강점 (m-work-me.js)
    if (sub === 'growth') return tabGrowth(view, mid);
    if (sub === 'edu') return tabEdu(view, mid);
    if (sub === 'pay') return tabPay(view, mid);
    if (sub === 'docs') return HR.certs.tab(view, mid);   // 재직·경력증명서 요청 → 승인 → 발급본 업로드 (m-certs.js)
    if (sub === 'notes' && admin) return tabNotes(view, mid);
    if (sub === 'notify' && self) { tabNotify(view); return ui.put(view, ui.panel('Test · 연결 확인', null, HR.testPanel(), h('p', { class: 'note', text: 'Slack은 회사 메일과 같은 이메일로 가입한 Slack 계정에 자동 연결됩니다. 따로 연동할 것은 없습니다.' })), HR.app.panel()); }   // 알림 설정 아래에 홈 화면 앱 아이콘 안내
  }
  HR.info = { render: render, printCert: printCert, privOf: privOf };
  HR.register('info', { render: function (view, parts) { render(view, S.mid, parts[0] || '', 'info'); } });
})();
