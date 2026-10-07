/* ============================================
   fillts HR — core: Firebase · 인증 · 데이터 구독 · 라우터 · 알림센터 · UI 헬퍼
   보안 원칙: 권한 판정은 Firestore Rules(서버)가 최종 결정한다. 화면 분기는 편의.
   사용자 입력은 textContent로만 렌더링한다 (innerHTML 미사용).
   ============================================ */
(function () {
  'use strict';

  var L = window.Labor;
  // 같은 로그인을 쓰는 다른 앱(/fin · /map 등)은 이 core.js를 그대로 불러오고 window.HR_APP으로 메뉴만 바꾼다
  var APP = window.HR_APP || { id: 'hr' };
  // 앱 목록 — 접근권한 대상(HR 설정 › 앱 접근)이자 /map 사이트맵의 원본. open: 구성원 전원 / 그 외: 관리자 + 권한 받은 계정
  var APPS = [
    { id: 'hr', name: 'HR', path: '/hr/', open: true, desc: '출퇴근 · 휴가 · 공지 · 구성원 · 목표 · WORK · +AI · 입금요청' },
    { id: 'fin', name: 'Finance', path: '/fin/', desc: '자금조달 계획 · 런웨이 · 현금흐름 · 지출예정 · 통장 거래내역 · 세무사 전달' },
    { id: 'mkt', name: 'Marketing', path: '/mkt/', open: true, desc: '마케팅 설계 맵 — 목표 · 타깃 · 소구점 · 전략 · 플랜 · 실행 보드를 함께 채우는 공동 보드' },
    { id: 'inf', name: 'Influencer', path: '/inf/', open: true, desc: '인플루언서 — 씨드 유튜버 1명으로 비슷한 채널(구독자 · 댓글 톤 · 키워드) 찾기 → 컨택 · 메일 문의 · 계약 · 시딩 · 업로드 대기 관리' }
  ];
  var BOOTSTRAP_ADMINS = ['kjw@fillts.com', 'info@fillts.com']; // firestore.rules와 동일
  var IDLE_LIMIT_MS = 30 * 60 * 1000;

  firebase.initializeApp(window.FILLTS_FIREBASE);
  var auth = firebase.auth(), db = firebase.firestore(), FV = firebase.firestore.FieldValue;
  var SNAP = { serverTimestamps: 'estimate' };

  var HR = window.HR = { L: L, db: db, auth: auth, FV: FV, modules: {}, cache: {}, APP: APP, APPS: APPS };
  var S = HR.S = {
    user: null, mid: null, role: 'employee', isAdmin: false, isLead: false,
    cfg: Object.assign({}, L.DEFAULT_CONFIG), hmap: L.holidayMap(L.DEFAULT_CONFIG),
    members: {}, orgs: {}, presence: {}, away: [], sched: [], ots: [], notices: [], feed: [], goals: [],
    myPunches: [], myFixes: [], leaves: [], fixes: [], onesM: [], onesL: [], onesAll: [],
    notify: [], priv: null, pay: {}, users: {}, invites: {}, status: null, ready: false, apps: {}
  };
  // 앱 접근: 관리자는 전부 편집, 그 외는 hr_users/{uid}.apps[앱] = 'view' | 'edit' (서버 보안 규칙도 같은 값으로 판정)
  HR.appInfo = function (id) { return APPS.filter(function (a) { return a.id === id; })[0] || null; };
  HR.appLevel = function (app) {
    var a = HR.appInfo(app);
    if (S.realAdmin || (a && a.open) || app === 'map') return 'edit';
    return (S.apps || {})[app] || '';
  };
  HR.canApp = function (app) { var l = HR.appLevel(app); return l === 'view' || l === 'edit'; };
  HR.canEditApp = function (app) { return HR.appLevel(app) === 'edit'; };
  var unsubs = [];

  /* ============ DOM helpers ============ */
  function $(id) { return document.getElementById(id); }
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false || c === '') return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function fill(el) { clear(el); for (var i = 1; i < arguments.length; i++) append(el, arguments[i]); return el; }
  var toastTimer;
  function toast(m) {
    var t = $('toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  function fail(e, el) {
    var text = e && e.code === 'permission-denied' ? '권한이 없습니다. 관리자에게 문의하세요.' : '저장하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.';
    if (el) { el.textContent = text; el.classList.remove('ok'); } else toast(text);
    if (window.console) console.warn(e);
  }
  var ui = HR.ui = {
    h: h, $: $, clear: clear, fill: fill, toast: toast, fail: fail,
    // null/false를 건너뛰는 append (Element.append는 null을 "null" 문자로 넣는다)
    put: function (el) { for (var i = 1; i < arguments.length; i++) append(el, arguments[i]); return el; },
    tag: function (text, cls) { return h('span', { class: 'tag ' + (cls || ''), text: text }); },
    label: function (t) { return h('div', { class: 'label', text: t }); },
    panel: function (title, right) {
      var p = h('section', { class: 'panel' });
      if (title) p.appendChild(h('div', { class: 'panel-head' }, h('div', { class: 'label', text: title }), right || null));
      for (var i = 2; i < arguments.length; i++) append(p, arguments[i]);
      return p;
    },
    empty: function (t) { return h('p', { class: 'empty', text: t }); },
    msg: function () { return h('p', { class: 'form-msg', role: 'alert' }); },
    ok: function (el, t) { el.textContent = t; el.classList.add('ok'); },
    err: function (el, t) { el.textContent = t; el.classList.remove('ok'); },
    field: function (label, input, cls) {
      if (!input.id) input.id = 'f' + Math.random().toString(36).slice(2, 9);
      return h('div', { class: 'field ' + (cls || '') }, h('label', { for: input.id, text: label }), input);
    },
    input: function (props) { return h('input', Object.assign({ type: 'text' }, props)); },
    select: function (opts, val, props) {
      var s = h('select', props || {});
      opts.forEach(function (o) { s.appendChild(h('option', { value: o[0], text: o[1] })); });
      if (val != null) s.value = val;
      return s;
    },
    btn: function (text, onclick, cls) { return h('button', { type: 'button', class: 'btn ' + (cls || ''), text: text, onclick: onclick }); },
    // 두 번 눌러 확정 (브라우저 confirm 대신)
    confirmBtn: function (text, onconfirm, cls) {
      var b = h('button', { type: 'button', class: 'btn ' + (cls || 'btn-line btn-xs danger'), text: text });
      b.addEventListener('click', function () {
        if (b.dataset.armed) { delete b.dataset.armed; b.textContent = text; onconfirm(); return; }
        b.dataset.armed = '1'; b.textContent = '한 번 더 누르면 ' + text;
        setTimeout(function () { if (b.dataset.armed) { delete b.dataset.armed; b.textContent = text; } }, 3000);
      });
      return b;
    },
    tabs: function (items, active, base) {
      var nav = h('nav', { class: 'subtabs', 'aria-label': '하위 메뉴' });
      items.forEach(function (it) {
        if (!it) return;
        nav.appendChild(h('a', { href: '#' + base + (it[0] ? '/' + it[0] : ''), class: it[0] === active ? 'active' : '', text: it[1] }));
      });
      return nav;
    },
    kv: function (pairs, cls) {
      var dl = h('dl', { class: cls || 'kv' });
      pairs.forEach(function (p) { if (p) dl.appendChild(h('div', null, h('dt', { text: p[0] }), h('dd', { class: p[2] || '', text: p[1] }))); });
      return dl;
    },
    head: function (label, title, right) {
      return h('header', { class: 'tab-head' }, h('div', null, h('div', { class: 'label', text: label }), h('h1', { class: 'tab-title', text: title })), right || null);
    }
  };

  /* ============ 포맷 · 데이터 헬퍼 ============ */
  var fmt = HR.fmt = {
    today: function () { return L.kstDate(new Date()); },
    dk: function (s) { return +s.replace(/-/g, ''); },
    dkToDate: function (n) { var s = String(n); return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); },
    ymNum: function (s) { return +s.slice(0, 7).replace('-', ''); },
    ymShift: function (ym, n) { return L.addMonths(ym + '-01', n).slice(0, 7); },
    date: function (s) { if (!s) return ''; return s.slice(5).replace('-', '.') + ' (' + '일월화수목금토'[L.weekday(s)] + ')'; },
    dateLong: function (s) { if (!s) return ''; return (+s.slice(0, 4)) + '년 ' + (+s.slice(5, 7)) + '월 ' + (+s.slice(8, 10)) + '일'; },
    dot: function (s) { return s ? s.replace(/-/g, '.') : ''; },
    ts: function (ts) {
      if (!ts || !ts.toDate) return '';
      var d = ts.toDate(), t = L.kstDate(d);
      return (t === fmt.today() ? '오늘' : t.slice(5).replace('-', '.')) + ' ' + L.kstHM(d);
    },
    won: function (n) { return Math.round(n || 0).toLocaleString('ko-KR') + '원'; },
    days: L.fmtDays
  };
  HR.rows = function (snap) { return snap.docs.map(function (d) { var o = d.data(SNAP); o.id = d.id; return o; }); };
  HR.name = function (mid) { var m = S.members[mid]; return m ? (m.name || '(이름 없음)') : '(알 수 없음)'; };
  HR.memberList = function (includeLeft) {
    return Object.keys(S.members).map(function (k) { return S.members[k]; })
      .filter(function (m) { return includeLeft || m.status !== '퇴사'; })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });
  };
  HR.orgName = function (id) { return id && S.orgs[id] ? S.orgs[id].name : (!id ? S.cfg.companyName : '(삭제된 조직)'); };
  HR.allPolicies = function () { return S.cfg.leavePolicies && S.cfg.leavePolicies.length ? S.cfg.leavePolicies : L.DEFAULT_POLICIES; };
  HR.policies = function () { return HR.allPolicies().filter(function (p) { return p.active !== false; }); };
  HR.policy = function (id) { return HR.allPolicies().filter(function (p) { return p.id === id; })[0] || { id: id, name: id, mode: 'request', days: 0 }; };
  HR.roleName = function (r) { return { admin: '관리자', manager: '리더', employee: '구성원' }[r] || r; };
  HR.leavesOf = function (mid) { return S.leaves.filter(function (l) { return l.memberId === mid; }); };
  HR.annualOf = function (mid, leaves) {
    var m = S.members[mid]; if (!m) return null;
    return L.annualLedger(m, S.cfg, (leaves || HR.leavesOf(mid)).filter(function (l) { return l.type === 'annual'; }), fmt.today(), S.hmap);
  };
  HR.unitText = function (l) { return l.unit === 'am' ? '오전 반차' : l.unit === 'pm' ? '오후 반차' : l.unit === 'hours' ? (l.hours + '시간') : ''; };
  HR.myOnes = function () {
    var all = S.isAdmin ? S.onesAll : S.onesM.concat(S.onesL), seen = {};
    return all.filter(function (o) { if (seen[o.id]) return false; seen[o.id] = 1; return true; })
      .sort(function (a, b) { return (a.date + (a.time || '')) < (b.date + (b.time || '')) ? 1 : -1; });
  };

  /* ============ 근태 계산 ============ */
  HR.att = {
    // opt: { member, from, to, leaves } — 자동 근무 일정(member.autoIn/autoOut)을 채울 기간
    days: function (punches, fixes, opt) {
      opt = opt || {};
      var by = {};
      punches.forEach(function (p) {
        if (!p.at || !p.at.toDate) return;
        var date = fmt.dkToDate(p.dk), d = by[date] || (by[date] = { ins: [], outs: [], mode: p.mode });
        if (p.kind === 'in') { d.ins.push(p.at.toDate()); d.mode = p.mode; } else d.outs.push(p.at.toDate());
      });
      var out = {};
      Object.keys(by).forEach(function (date) {
        var d = by[date], mm = opt.member;
        // 기본 출근 시각이 있는 구성원이 출근은 안 누르고 퇴근만 누른 날: 기본 출근 시각부터 계산
        if (!d.ins.length && mm && mm.autoIn && d.outs.length) d.ins.push(new Date(date + 'T' + mm.autoIn + ':00+09:00'));
        if (!d.ins.length) return;
        var first = new Date(Math.min.apply(null, d.ins));
        var last = d.outs.length ? new Date(Math.max.apply(null, d.outs)) : null;
        if (last && last < first) last = null;
        out[date] = { date: date, src: 'punch', mode: d.mode, inMs: first.getTime(), inHM: L.kstHM(first), outHM: last ? L.kstHM(last) : '', inMin: L.kstMin(first), span: last ? Math.round((last - first) / 60000) : null, open: !last };
      });
      (fixes || []).filter(function (f) { return f.status === 'approved'; })
        .sort(function (a, b) { return a.decidedAt && b.decidedAt ? a.decidedAt.toMillis() - b.decidedAt.toMillis() : 0; })
        .forEach(function (f) {
          var i = L.hmToMin(f.in), o = L.hmToMin(f.out);
          if (i == null || o == null) return;
          out[f.date] = { date: f.date, src: 'fix', mode: (out[f.date] || {}).mode, inHM: f.in, outHM: f.out, inMin: i, span: o >= i ? o - i : o + 1440 - i, brk: f.brk === '' || f.brk == null ? null : +f.brk, open: false };
        });
      // 인정 범위: 출근 후 N시간(기본 8h)에 자동 퇴근. 연장·야간·휴일근무는 관리자가 사전 승인한 시간대만 인정한다.
      var nowMs = Date.now(), mid = opt.member && opt.member.id;
      Object.keys(out).forEach(function (k) {
        var r = out[k];
        if (r.src !== 'punch') return;   // 승인된 정정 기록은 그대로
        var lim = HR.att.limit(mid, k, r.inMs);
        r.ots = lim.ots;
        if (lim.blocked) { r.blocked = 'hol'; r.open = false; r.span = null; return; }
        var endMs = r.open ? null : r.inMs + r.span * 60000;
        if (r.open && lim.end <= nowMs) { r.open = false; r.autoOut = true; endMs = lim.end; }
        else if (endMs != null && endMs > lim.end) { r.capped = true; endMs = lim.end; }
        if (endMs != null) { r.span = Math.max(0, Math.round((endMs - r.inMs) / 60000)); r.outHM = L.kstHM(new Date(endMs)); }
      });
      // 기본 근무 시각 (예: 대표 10:00–19:00) — 버튼을 누르지 않은 근무일에만 적용. 직접 누른 기록이 있으면 그 시각이 우선
      var m = opt.member;
      if (m && m.autoIn && m.autoOut && opt.from && opt.to) {
        var t = fmt.today(), nowMin = L.kstMin(new Date()), i = L.hmToMin(m.autoIn), o = L.hmToMin(m.autoOut);
        for (var d = opt.from; d <= opt.to && d <= t; d = L.addDays(d, 1)) {
          if (out[d] || !L.isWorkday(d, S.hmap) || (m.hireDate && d < m.hireDate)) continue;
          var lv = opt.leaves && HR.att.leaveOn(opt.leaves, d);
          if (lv && (!lv.unit || lv.unit === 'day')) continue;
          if (d === t && nowMin < i) continue;
          var done = d < t || nowMin >= o;
          out[d] = { date: d, src: 'sched', mode: 'office', inHM: m.autoIn, outHM: done ? m.autoOut : '', inMin: i, span: done ? (o >= i ? o - i : o + 1440 - i) : null, open: !done };
        }
      }
      Object.keys(out).forEach(function (k) { out[k].calc = out[k].open ? null : L.calcDay(out[k]); });
      return out;
    },
    // 지금 상태: in(근무 중) | out(퇴근) | away(휴가) | none(미출근) | left(퇴사) | rest(휴직)
    live: function (m) {
      var t = fmt.today(), p = S.presence[m.id], nowMs = Date.now();
      if (m.status === '퇴사') return { st: 'left' };
      if (m.status === '휴직') return { st: 'rest' };
      var away = S.away.filter(function (a) { return a.memberId === m.id && a.start <= t && a.end >= t && (!a.unit || a.unit === 'day'); })[0];
      if (away) return { st: 'away', away: away };
      if (p && p.state === 'in' && p.dk && L.daysBetween(fmt.dkToDate(p.dk), t) <= 1) {
        var since = p.at && p.at.toDate ? p.at.toDate().getTime() : nowMs, lim = HR.att.limit(m.id, fmt.dkToDate(p.dk), since);
        if (!lim.blocked && lim.end > nowMs) return { st: 'in', since: since, mode: p.mode, dk: p.dk, until: lim.end };
        return { st: 'out', auto: true, at: lim.blocked ? since : lim.end, dk: p.dk, today: fmt.dkToDate(p.dk) === t, blocked: lim.blocked };
      }
      if (p && p.state === 'out' && p.dk === fmt.dk(t)) return { st: 'out', at: p.at && p.at.toDate ? p.at.toDate().getTime() : null, today: true };
      if (m.autoIn && m.autoOut && L.isWorkday(t, S.hmap)) {
        var nm = L.kstMin(new Date()), ai = L.hmToMin(m.autoIn), ao2 = L.hmToMin(m.autoOut);
        if (nm >= ai && nm < ao2) return { st: 'in', sched: true, mode: 'office', sinceHM: m.autoIn };
        if (nm >= ao2) return { st: 'out', sched: true, today: true };
      }
      return { st: 'none' };
    },
    week: function (days, monday) {
      var list = [];
      for (var i = 0; i < 7; i++) { var d = L.addDays(monday, i); list.push({ date: d, calc: days[d] ? days[d].calc : null }); }
      var w = L.calcWeek(list, S.cfg, S.hmap); w.monday = monday; return w;
    },
    // 그날 근무로 인정되는 끝 시각(ms)과 승인된 신청 — 기본: 출근 + autoOutHours(8h), 22:00 이후는 야간 승인 필요, 휴무일은 휴일 승인 필요
    limit: function (mid, date, inMs) {
      var ots = (S.ots || []).filter(function (o) { return o.memberId === mid && o.date === date && o.status === 'approved'; });
      var at = function (hm, next) { return new Date((next ? L.addDays(date, 1) : date) + 'T' + hm + ':00+09:00').getTime(); };
      var endOf = function (o) { return at(o.to, L.hmToMin(o.to) <= L.hmToMin(o.from)); };
      var ao = Math.round((+S.cfg.autoOutHours || 8) * 60), end = inMs + ao * 60000;
      var has = function (k) { return ots.filter(function (o) { return o.kind === k; }); };
      if (!L.isWorkday(date, S.hmap) && !has('hol').length) return { blocked: true, end: inMs, ots: ots };
      has('hol').concat(has('ot')).forEach(function (o) { end = Math.max(end, endOf(o)); });   // 승인된 연장·휴일 종료 시각까지
      var nightStart = at('22:00');
      if (has('night').length) has('night').forEach(function (o) { end = Math.max(end, endOf(o)); });
      else if (end > nightStart && inMs < nightStart) end = nightStart;   // 야간(22시~) 미승인 → 22시에서 끊는다
      return { end: end, ots: ots };
    },
    leaveOn: function (leaves, date) { return leaves.filter(function (l) { return l.status === 'approved' && l.start <= date && l.end >= date; })[0]; },
    modeName: function (m) { return { office: '사무실', remote: '재택', field: '외근' }[m] || ''; }
  };

  /* ============================================
     인증
     ============================================ */
  var authMode = 'login';
  function showAuth(box) {
    $('appView').hidden = true; $('authView').hidden = false;
    $('loginForm').hidden = box !== 'login';
    $('verifyBox').hidden = box !== 'verify';
    $('noAccessBox').hidden = box !== 'noaccess';
  }
  function setAuthMode(mode) {
    authMode = mode;
    $('authMode').textContent = { login: 'Sign in', signup: 'Create account', reset: 'Reset password' }[mode];
    $('loginBtn').textContent = { login: '로그인', signup: '계정 만들기', reset: '재설정 메일 받기' }[mode];
    $('loginPw').parentNode.hidden = mode === 'reset';
    $('loginPw').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('loginKeep').parentNode.hidden = mode !== 'login';
    $('toSignup').textContent = mode === 'login' ? '초대받은 계정 만들기' : '로그인으로 돌아가기';
    $('toReset').hidden = mode !== 'login';
    var m = $('loginMsg'); m.textContent = mode === 'signup' ? '관리자가 초대한 회사 이메일로만 사용할 수 있습니다. 비밀번호는 10자 이상.' : ''; m.classList.add('ok');
    if (HR.loginNotice && mode === 'login') { ui.err(m, HR.loginNotice); HR.loginNotice = ''; }   // Google 로그인 실패 사유는 화면 초기화 뒤에도 남긴다
  }
  $('toSignup').addEventListener('click', function (e) { e.preventDefault(); setAuthMode(authMode === 'login' ? 'signup' : 'login'); });
  $('toReset').addEventListener('click', function (e) { e.preventDefault(); setAuthMode('reset'); });

  var AUTH_ERR = {
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않습니다.', 'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않습니다.',
    'auth/user-not-found': '이메일 또는 비밀번호가 맞지 않습니다.', 'auth/invalid-email': '이메일 형식을 확인하세요.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정하세요.',
    'auth/weak-password': '비밀번호는 10자 이상으로 정하세요.', 'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도하세요.',
    'auth/network-request-failed': '네트워크 연결을 확인하세요.',
    'auth/unauthorized-domain': '이 주소(fillts.com)가 로그인 허용 도메인에 아직 등록되지 않았습니다. 관리자에게 알려 주세요.',
    'auth/operation-not-allowed': '이 로그인 방식이 아직 켜져 있지 않습니다. 이메일로 로그인하세요.',
    'auth/popup-blocked': '브라우저가 로그인 창을 막았습니다. 다시 한 번 누르거나, 설정에서 팝업 차단을 끈 뒤 시도하세요.',
    'auth/web-storage-unsupported': '이 브라우저 설정(쿠키·저장소 차단)으로는 Google 로그인이 안 됩니다. Safari·Chrome 기본 브라우저로 열어 주세요.'
  };
  // 인증 메일: 이동 주소가 허용되지 않은 경우에도 메일은 보낸다
  function sendVerify(user) {
    return user.sendEmailVerification({ url: location.origin + '/hr/' }).catch(function (x) {
      if (/continue-uri|unauthorized-domain/.test(x.code || '')) return user.sendEmailVerification();
      throw x;
    });
  }
  function authErr(x) { return AUTH_ERR[x.code] || '처리하지 못했습니다. (' + x.code + ')'; }
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('loginEmail').value.trim(), pw = $('loginPw').value, m = $('loginMsg');
    if (!email) return ui.err(m, '이메일을 입력하세요.');
    $('loginBtn').disabled = true;
    var done = function () { $('loginBtn').disabled = false; };
    var err = function (x) { done(); ui.err(m, authErr(x)); };
    var cont = { url: location.origin + '/hr/' };
    if (authMode === 'reset') {
      auth.sendPasswordResetEmail(email, cont).then(function () { done(); ui.ok(m, '가입된 이메일이라면 재설정 메일이 발송됩니다.'); }).catch(err);
      return;
    }
    if (pw.length < 10) { done(); return ui.err(m, '비밀번호는 10자 이상입니다.'); }
    if (authMode === 'signup') {
      auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
        .then(function () { return auth.createUserWithEmailAndPassword(email, pw); })
        .then(function (c) { return sendVerify(c.user); })
        .then(done).catch(err);
      return;
    }
    var keep = $('loginKeep').checked;
    try { localStorage.setItem('hrKeep', keep ? '1' : ''); } catch (x) { /* 무시 */ }
    auth.setPersistence(keep ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION)
      .then(function () { return auth.signInWithEmailAndPassword(email, pw); })
      .then(function () { done(); $('loginPw').value = ''; }).catch(err);
  });
  // Google Workspace(fillts.com) 로그인 — 이메일 인증이 자동으로 완료된다
  // 카카오톡·인스타 등 앱 내 브라우저는 Google이 로그인 자체를 차단한다(403 disallowed_useragent)
  function inAppBrowser() {
    return /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|everytimeApp|; wv\)/i.test(navigator.userAgent);
  }
  function isMobile() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); }
  // ── 모바일 Google 로그인: Firebase 처리 페이지(/__/auth/handler)를 거치지 않는 직접 OAuth ──
  // Safari는 Google을 다녀오는 동안 Firebase 처리 페이지의 시작 정보를 잃어 흰 화면에서 멈춘다("missing initial state").
  // Google이 결과(id_token)를 https://fillts.com/hr/#... 로 직접 돌려주고, 그 토큰으로 Firebase에 로그인한다.
  var GCID = '298865968239-m115rlg7spvtegk1ssv2hqb216jhdkkv.apps.googleusercontent.com', GRET = location.origin + '/hr/';
  var CAL = 'https://www.googleapis.com/auth/calendar.readonly';
  function rnd() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  HR.googleRedirect = function (o) {
    o = o || {};
    var st = rnd(), nonce = rnd();
    // 다른 앱(/fin 등)에서 누르면 Google은 등록된 /hr/ 로 돌려주고, /hr/ 이 로그인만 마친 뒤 같은 탭에서 원래 앱으로 되돌린다 (OAuth 설정 추가 불필요)
    var next = APP.id !== 'hr' ? location.pathname + (location.hash || '') : '';
    try { localStorage.setItem('hrOAuth', JSON.stringify({ st: st, nonce: nonce, cal: !!o.calendar, at: Date.now(), next: next })); } catch (e) { /* 무시 */ }
    var q = { client_id: GCID, redirect_uri: GRET, response_type: 'id_token token', scope: 'openid email profile' + (o.calendar ? ' ' + CAL : ''),
      nonce: nonce, state: st, hd: 'fillts.com', prompt: o.silent ? 'none' : o.calendar ? 'consent' : 'select_account', include_granted_scopes: 'true' };
    if (o.hint) q.login_hint = o.hint;
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  };
  (function oauthReturn() {
    var hsh = location.hash.slice(1);
    if (!/(^|&)(id_token|access_token|error)=/.test(hsh)) return;
    var p = {}; hsh.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); });
    var saved = null; try { saved = JSON.parse(localStorage.getItem('hrOAuth') || 'null'); localStorage.removeItem('hrOAuth'); } catch (e) { /* 무시 */ }
    history.replaceState(null, '', location.pathname + location.search + '#info');
    if (!saved || p.state !== saved.st || Date.now() - saved.at > 15 * 60000) { HR.oauthErr = '로그인 요청을 확인하지 못했습니다. 다시 눌러 주세요.'; return; }
    if (saved.next && /^\/[a-z_]+\//.test(saved.next)) HR.oauthNext = saved.next;
    if (p.error && HR.oauthNext) { location.replace(HR.oauthNext); return; }   // 자동 로그인(prompt=none) 실패 → 원래 앱의 로그인 화면으로
    if (p.error) { HR.oauthErr = p.error === 'access_denied' ? 'Google 로그인을 취소했습니다.' : 'Google 로그인 오류 (' + p.error + ')'; return; }
    var claims = {};
    try { claims = JSON.parse(decodeURIComponent(escape(atob(p.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { /* 아래에서 거절 */ }
    if (claims.nonce !== saved.nonce) { HR.oauthErr = '로그인 응답을 확인하지 못했습니다. 다시 눌러 주세요.'; return; }
    if (p.access_token && (p.scope || '').indexOf(CAL) >= 0) {
      try { sessionStorage.setItem('hrGcalTok', JSON.stringify({ v: p.access_token, exp: Date.now() + ((+p.expires_in || 3600) - 120) * 1000, email: (claims.email || '').toLowerCase() })); } catch (e) { /* 무시 */ }
      HR.gcalFresh = true;
    }
    HR.pendingCred = firebase.auth.GoogleAuthProvider.credential(p.id_token, p.access_token);
  })();
  if (HR.pendingCred) {
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
      .then(function () { return auth.signInWithCredential(HR.pendingCred); })
      .then(function () { if (HR.oauthNext) location.replace(HR.oauthNext); })   // 세션 로그인은 같은 탭 sessionStorage라 원래 앱에서도 그대로 유지된다
      .catch(function (x) { HR.oauthNext = ''; throw x; })
      .catch(function (x) { var t = x.code === 'auth/invalid-credential' ? 'Google 로그인 정보를 확인하지 못했습니다. 다시 눌러 주세요.' : authErr(x); if (x.code && t.indexOf(x.code) < 0) t += ' (' + x.code + ')'; HR.loginNotice = t; if ($('loginMsg')) ui.err($('loginMsg'), t); });
  }
  if (HR.oauthErr) HR.loginNotice = HR.oauthErr;
  // redirect로 돌아왔을 때 실패 사유를 로그인 화면에 보여 준다 (성공은 onAuthStateChanged가 처리)
  auth.getRedirectResult().then(function (r) { HR.redirectResult = r || null; if (HR.onRedirectResult) HR.onRedirectResult(HR.redirectResult); }).catch(function (x) { var t = authErr(x); if (x.code && t.indexOf(x.code) < 0) t += ' (' + x.code + ')'; if ($('loginMsg')) ui.err($('loginMsg'), t); });
  $('googleBtn').addEventListener('click', function () {
    if (inAppBrowser()) {
      var url = location.href, ua = navigator.userAgent;
      if (/KAKAOTALK/i.test(ua)) { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url); return; }
      if (/Android/i.test(ua)) { location.href = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end'; return; }
      return ui.err($('loginMsg'), '앱 안의 브라우저에서는 Google 로그인이 막혀 있습니다. 우측 상단 메뉴에서 "Safari로 열기"를 누른 뒤 다시 시도하세요.');
    }
    // PC·모바일 모두 같은 탭에서 직접 OAuth (팝업·Firebase 처리 페이지 미사용 — 위 HR.googleRedirect)
    ui.ok($('loginMsg'), 'Google 로그인으로 이동합니다…');
    HR.googleRedirect({});
  });
  $('verifyResend').addEventListener('click', function () {
    if (!auth.currentUser) return;
    sendVerify(auth.currentUser)
      .then(function () { ui.ok($('verifyMsg'), '인증 메일을 보냈습니다. 받은편지함과 스팸함을 확인하세요.'); })
      .catch(function (x) { ui.err($('verifyMsg'), authErr(x)); });
  });
  $('verifyDone').addEventListener('click', function () {
    var u = auth.currentUser; if (!u) return;
    u.reload().then(function () { return u.getIdToken(true); }).then(function () {
      if (auth.currentUser.emailVerified) enter(auth.currentUser);
      else ui.err($('verifyMsg'), '아직 인증되지 않았습니다. 메일의 링크를 눌러 주세요.');
    });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.js-logout');
    if (a) { e.preventDefault(); logout(); }
  });
  function logout() { stopAll(); try { sessionStorage.setItem('hrSilentTried', '1'); } catch (e) { /* 무시 */ } auth.signOut(); }
  // HR에서 새 창으로 연 앱: 로그인 상태가 넘어오지 않았으면 Google에 조용히(prompt=none) 한 번만 다녀온다
  function trySilent() {
    var hint = '', tried = true;
    try { hint = localStorage.getItem('hrHint') || ''; tried = sessionStorage.getItem('hrSilentTried') === '1'; } catch (e) { return false; }
    if (!hint || tried || inAppBrowser() || HR.loginNotice) return false;
    try { sessionStorage.setItem('hrSilentTried', '1'); } catch (e) { return false; }
    HR.googleRedirect({ silent: true, hint: hint });
    return true;
  }
  HR.logout = logout;
  $('noAccessRetry').addEventListener('click', function (e) { e.preventDefault(); if (auth.currentUser) enter(auth.currentUser); });

  auth.onAuthStateChanged(function (u) {
    if (u && HR.oauthNext) return;   // 원래 앱으로 이동 중
    if (!u && APP.id !== 'hr' && trySilent()) return;
    if (!u) { stopAll(); S.user = null; S.mid = null; showAuth('login'); setAuthMode('login'); return; }
    if (!u.emailVerified) {
      showAuth('verify');
      $('verifyText').textContent = u.email + ' 로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 아래 버튼을 누르세요.';
      return;
    }
    enter(u);
  });

  // 안전장치: HR 보안 규칙이 배포되기 전(정의 안 된 경로를 읽을 수 있는 상태)에는 앱을 열지 않는다
  function rulesGuard() {
    return db.doc('hr_rules_canary/probe').get().then(function () { return false; }, function (e) { return e && e.code === 'permission-denied'; });
  }
  function enter(u) {
    S.user = u;
    rulesGuard().then(function (ok) {
      if (ok) return enterChecked(u);
      showAuth('noaccess'); $('bootstrapForm').hidden = true;
      $('noAccessTitle').textContent = '보안 규칙 적용 대기';
      $('noAccessText').textContent = 'HR 보안 규칙이 아직 서버에 적용되지 않았습니다. 개인정보 보호를 위해 적용 전에는 HR을 열지 않습니다. 관리자에게 문의하세요.';
    });
  }
  function enterChecked(u) {
    db.doc('hr_users/' + u.uid).get().then(function (snap) {
      if (snap.exists) return snap.data();
      return db.doc('hr_invites/' + u.email.toLowerCase()).get().then(function (inv) {
        if (!inv.exists) return null;
        var d = { email: u.email, memberId: inv.data().memberId, role: inv.data().role, createdAt: FV.serverTimestamp() };
        return db.doc('hr_users/' + u.uid).set(d).then(function () { return d; });
      }).catch(function () { return null; });
    }).then(function (hu) {
      if (hu) return start(hu);
      var boot = BOOTSTRAP_ADMINS.indexOf(u.email.toLowerCase()) >= 0;
      showAuth('noaccess');
      $('bootstrapForm').hidden = !boot;
      $('noAccessTitle').textContent = boot ? '관리자 초기 설정' : '아직 초대되지 않은 계정입니다';
      $('noAccessText').textContent = boot
        ? '대표 관리자 계정입니다. 기본 인사 정보를 확인하면 HR을 시작합니다. 나머지 정보는 INFO에서 채울 수 있습니다.'
        : u.email + ' 는 아직 초대 목록에 없습니다. 관리자에게 이 이메일로 초대를 요청한 뒤 「다시 확인」을 누르세요.';
    }).catch(function (e) {
      showAuth('noaccess'); $('bootstrapForm').hidden = true;
      $('noAccessText').textContent = '정보를 불러오지 못했습니다. 잠시 후 다시 시도하세요.';
      console.warn(e);
    });
  }
  $('bsSubmit').addEventListener('click', function () {
    var u = auth.currentUser, nm = $('bsName').value.trim(), hire = $('bsHire').value, title = $('bsTitle').value.trim();
    if (!nm || !hire) return ui.err($('noAccessMsg'), '이름과 입사일을 입력하세요.');
    var ref = db.collection('hr_members').doc();
    ref.set({
      name: nm, nickname: '', email: u.email.toLowerCase(), empNo: '', orgId: '', orgRole: title, isOrgHead: true, subOrgs: [],
      job: title, jobFamily: '', position: title, grade: title, hireDate: hire, groupHireDate: '', hireType: '경력',
      type: '정규직', weeklyHours: 40, status: '재직', leaderId: '', leaveAdjs: [], slackId: '', autoIn: '10:00', autoOut: '19:00'
    }).then(function () {
      var d = { email: u.email, memberId: ref.id, role: 'admin', createdAt: FV.serverTimestamp() };
      return db.doc('hr_users/' + u.uid).set(d).then(function () { start(d); });
    }).catch(function (e) { fail(e, $('noAccessMsg')); });
  });

  // 30분 무활동 자동 로그아웃 (로그인 유지 선택 시 제외)
  var lastAct = Date.now();
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) { window.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true }); });
  setInterval(function () {
    var keep = false; try { keep = localStorage.getItem('hrKeep') === '1'; } catch (x) { /* 무시 */ }
    if (S.user && !keep && Date.now() - lastAct > IDLE_LIMIT_MS) { logout(); toast('30분 동안 사용이 없어 로그아웃했습니다.'); }
  }, 60000);

  /* ============================================
     구독
     ============================================ */
  function stopAll() { unsubs.forEach(function (f) { try { f(); } catch (e) { /* noop */ } }); unsubs = []; S.ready = false; HR.cache = {}; }
  function sub(q, fn) {
    unsubs.push(q.onSnapshot(function (s) { fn(s); changed(); }, function (e) { console.warn('subscription', e.code, e.message); }));
  }

  // 관리자 전용: 「사용자 모드」로 일반 구성원 화면을 미리 본다 (화면만 바뀌고 권한·데이터는 그대로)
  function applyView(asUser) {
    S.viewAsUser = !!(S.realAdmin && asUser);
    S.isAdmin = S.realAdmin && !S.viewAsUser; S.isLead = S.realLead && !S.viewAsUser;
    document.body.classList.toggle('is-admin', S.isAdmin);
    document.body.classList.toggle('is-lead', S.isLead);
    document.body.classList.toggle('view-user', S.viewAsUser);
    var sw = $('viewSwitch');
    if (!sw && S.realAdmin) {
      sw = h('button', { type: 'button', id: 'viewSwitch', class: 'view-switch', role: 'switch', onclick: function () {
        var next = !S.viewAsUser;
        try { localStorage.setItem('hrViewAsUser', next ? '1' : ''); } catch (e) { /* 무시 */ }
        applyView(next); HR.cache = {};
        if (next && current.menu === 'admin') HR.go('info'); else render(true);
        ui.toast(next ? '사용자 모드 — 일반 구성원에게 보이는 화면입니다.' : '관리자 모드로 돌아왔습니다.');
      } }, h('span', { class: 'vs-label vs-admin', text: '관리자' }), h('span', { class: 'vs-track' }, h('span', { class: 'vs-knob' })), h('span', { class: 'vs-label vs-user', text: '사용자' }));
      var right = document.querySelector('.nav-right'); if (right) right.insertBefore(sw, right.firstChild);
    }
    if (sw) { sw.hidden = !S.realAdmin; sw.setAttribute('aria-checked', String(S.viewAsUser)); sw.title = S.viewAsUser ? '지금 사용자 화면 — 누르면 관리자 모드' : '누르면 일반 구성원 화면으로 미리보기'; }
  }
  function start(hu) {
    // 다른 앱(/fin · /inf 등)은 core.js 뒤에 화면 코드(큰 라이브러리 포함)를 더 불러온다. 로그인 확인이 그보다 먼저 끝나면
    // 앱의 데이터 구독(APP.onStart)이 붙기 전에 시작돼 화면이 비어 버린다 → 페이지 스크립트가 모두 실행된 뒤에 시작한다.
    if (document.readyState !== 'complete') { window.addEventListener('load', function () { start(hu); }, { once: true }); return; }
    // /mkt 등 다른 화면에서 로그인하러 왔으면 로그인 직후 그 화면으로 돌려보낸다 (15분 안, 같은 사이트 경로만)
    try {
      var nx = JSON.parse(localStorage.getItem('hrNext') || 'null'); localStorage.removeItem('hrNext');
      if (nx && /^\/mkt\/[#a-z\/]*$/.test(nx.to) && Date.now() - nx.at < 15 * 60000) { location.replace(nx.to); return; }
    } catch (e) { /* 무시 */ }
    stopAll();
    S.mid = hu.memberId; S.role = hu.role || 'employee'; S.apps = hu.apps || {};
    S.isAdmin = S.role === 'admin'; S.isLead = S.isAdmin || S.role === 'manager';
    S.realAdmin = S.isAdmin; S.realLead = S.isLead;
    try { if (/@fillts\.com$/i.test(S.user.email || '')) localStorage.setItem('hrHint', S.user.email.toLowerCase()); sessionStorage.removeItem('hrSilentTried'); } catch (e) { /* 무시 */ }
    if (APP.id !== 'hr' && !HR.canApp(APP.id)) {
      S.mid = null; showAuth('noaccess'); $('bootstrapForm').hidden = true;
      $('noAccessTitle').textContent = '접근 권한이 없습니다';
      $('noAccessText').textContent = S.user.email + ' 계정에는 ' + (APP.title || APP.id) + ' 접근 권한이 없습니다. HR 관리자에게 「설정 › 앱 접근」에서 권한을 요청하세요.';
      return;
    }
    var asUser = false; try { asUser = S.realAdmin && APP.id === 'hr' && localStorage.getItem('hrViewAsUser') === '1'; } catch (e) { /* 무시 */ }
    applyView(asUser);
    $('authView').hidden = true; $('appView').hidden = false;
    sub(db.doc('hr_users/' + S.user.uid), function (s) { if (s.exists) S.apps = s.data().apps || {}; });
    if (APP.lite) {   // 다른 앱: 이름 · 설정 · 알림만 받고 나머지는 앱이 직접 구독한다
      sub(db.doc('hr_config/main'), function (s) { S.cfg = Object.assign({}, L.DEFAULT_CONFIG, s.exists ? s.data() : {}); S.hmap = L.holidayMap(S.cfg); });
      sub(db.collection('hr_members'), function (s) { S.members = {}; HR.rows(s).forEach(function (m) { S.members[m.id] = m; }); S.ready = true; });
      sub(db.collection('hr_notify').where('toMid', '==', S.mid).orderBy('at', 'desc').limit(40), function (s) { onNotify(HR.rows(s)); });
      if (APP.onStart) APP.onStart(sub);
      route();
      return;
    }

    var t = fmt.today(), cur = fmt.ymNum(t), prev = fmt.ymNum(fmt.ymShift(t.slice(0, 7), -1));
    sub(db.doc('hr_config/main'), function (s) { S.cfg = Object.assign({}, L.DEFAULT_CONFIG, s.exists ? s.data() : {}); S.hmap = L.holidayMap(S.cfg); });
    sub(db.collection('hr_members'), function (s) { S.members = {}; HR.rows(s).forEach(function (m) { S.members[m.id] = m; }); S.ready = true; });
    sub(db.collection('hr_orgs'), function (s) { S.orgs = {}; HR.rows(s).forEach(function (o) { S.orgs[o.id] = o; }); });
    sub(db.collection('hr_presence'), function (s) { S.presence = {}; HR.rows(s).forEach(function (p) { S.presence[p.id] = p; }); });
    sub(db.collection('hr_away').where('end', '>=', L.addMonths(t, -2)), function (s) { S.away = HR.rows(s); });
    sub(db.collection('hr_sched').where('date', '>=', t), function (s) { S.sched = HR.rows(s); });
    sub(db.collection('hr_notice').orderBy('createdAt', 'desc').limit(60), function (s) { S.notices = HR.rows(s); });
    sub(db.collection('hr_feed').orderBy('createdAt', 'desc').limit(60), function (s) { S.feed = HR.rows(s); });
    sub(db.collection('hr_goals'), function (s) { S.goals = HR.rows(s); });
    sub(db.collection('hr_punch').where('memberId', '==', S.mid).where('ym', 'in', [prev, cur]), function (s) { S.myPunches = HR.rows(s); });
    sub(db.collection('hr_fix').where('memberId', '==', S.mid), function (s) { S.myFixes = HR.rows(s); });
    sub(db.collection('hr_notify').where('toMid', '==', S.mid).orderBy('at', 'desc').limit(40), function (s) { onNotify(HR.rows(s)); });
    sub(db.doc('hr_private/' + S.mid), function (s) { S.priv = s.exists ? s.data() : {}; });
    sub(db.doc('hr_pay/' + S.mid), function (s) { if (s.exists) S.pay[S.mid] = s.data(); });
    if (S.isLead) {
      sub(db.collection('hr_leave'), function (s) { S.leaves = HR.rows(s); });
      sub(db.collection('hr_fix').where('status', '==', 'pending'), function (s) { S.fixes = HR.rows(s); });
      sub(db.collection('hr_ot'), function (s) { S.ots = HR.rows(s); });   // 연장·야간·휴일근무 신청 (리더·관리자는 전체)
    } else {
      sub(db.collection('hr_leave').where('memberId', '==', S.mid), function (s) { S.leaves = HR.rows(s); });
      sub(db.collection('hr_ot').where('memberId', '==', S.mid), function (s) { S.ots = HR.rows(s); });
    }
    if (S.isAdmin) {
      sub(db.collection('hr_11'), function (s) { S.onesAll = HR.rows(s); });
      sub(db.collection('hr_pay'), function (s) { S.pay = {}; HR.rows(s).forEach(function (p) { S.pay[p.id] = p; }); });
      sub(db.collection('hr_users'), function (s) { S.users = {}; HR.rows(s).forEach(function (u) { S.users[u.id] = u; }); });
      sub(db.collection('hr_invites'), function (s) { S.invites = {}; HR.rows(s).forEach(function (i) { S.invites[i.id] = i; }); });
      sub(db.doc('hr_status/main'), function (s) { S.status = s.exists ? s.data() : null; });
    } else {
      sub(db.collection('hr_11').where('memberId', '==', S.mid), function (s) { S.onesM = HR.rows(s); });
      if (S.isLead) sub(db.collection('hr_11').where('leaderId', '==', S.mid), function (s) { S.onesL = HR.rows(s); });
    }
    route();
  }

  // 일회성 로드 캐시 (다른 구성원 상세, 읽음 확인 등)
  HR.load = function (key, fn) {
    var c = HR.cache[key];
    if (c && !c.loading && Date.now() - c.at < 60000) return c.data;
    if (!c || !c.loading) {
      HR.cache[key] = { at: c ? c.at : 0, data: c ? c.data : null, loading: true };
      Promise.resolve().then(fn).then(function (d) {
        var same = false; try { same = c && !c.err && c.data != null && JSON.stringify(c.data) === JSON.stringify(d); } catch (x) { /* 비교 불가 → 다시 그림 */ }
        HR.cache[key] = { at: Date.now(), data: same ? c.data : d };
        if (!same) changed();
      })
        .catch(function (e) { HR.cache[key] = { at: Date.now(), data: null, err: e }; console.warn(key, e.code || e); changed(); });
    }
    return c ? c.data : null;
  };
  // 한 줄 안내문(.att-note): 폭이 모자라면 글자를 줄여 항상 한 줄로
  function fitNotes() {
    document.querySelectorAll('.att-note').forEach(function (el) {
      el.style.fontSize = ''; var fs = parseFloat(getComputedStyle(el).fontSize) || 12;
      while (el.scrollWidth > el.clientWidth + 1 && fs > 8) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
    });
  }
  window.addEventListener('resize', fitNotes);
  new MutationObserver(function () { requestAnimationFrame(fitNotes); }).observe(document.documentElement, { childList: true, subtree: true });
  HR.invalidate = function (prefix) { Object.keys(HR.cache).forEach(function (k) { if (k.indexOf(prefix) === 0) delete HR.cache[k]; }); changed(); };

  /* ============================================
     라우터 · 렌더
     ============================================ */
  var MENUS = APP.menus || ['info', 'notice', 'about', 'people', 'work', 'leave', 'goals', 'admin', 'payreq', 'ws', 'ai'];
  var HOME = APP.home || 'info';
  HR.register = function (id, mod) { HR.modules[id] = mod; };
  HR.go = function (hash) { if (location.hash !== '#' + hash) location.hash = hash; else route(); };
  var current = { menu: HOME, parts: [] };
  function route() {
    if (!S.mid) return;
    var parts = (location.hash || '#' + HOME).slice(1).split('/').filter(Boolean);
    var menu = parts.shift() || HOME;
    if (MENUS.indexOf(menu) < 0 || (APP.id === 'hr' && (menu === 'admin' || menu === 'finance') && !S.isAdmin)) { menu = HOME; parts = []; }
    var moved = current.menu !== menu || current.parts.join('/') !== parts.join('/');
    current = { menu: menu, parts: parts };
    document.querySelectorAll('[data-menu]').forEach(function (a) { a.classList.toggle('active', a.dataset.menu === menu); });
    $('navLinks').classList.remove('open'); $('navToggle').classList.remove('open'); $('navToggle').setAttribute('aria-expanded', 'false');
    render(true);
    if (moved) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('navToggle').addEventListener('click', function () {
    var open = $('navLinks').classList.toggle('open');
    this.classList.toggle('open', open); this.setAttribute('aria-expanded', String(open));
  });

  var pending = false;
  function changed() {
    if (pending) return; pending = true;
    setTimeout(function () { pending = false; render(false); }, 40);
  }
  HR.refresh = changed;
  // 입력 중에는 다시 그리지 않고, 포커스가 빠질 때 반영
  var deferred = false;
  document.addEventListener('focusout', function () { if (deferred) setTimeout(function () { if (!typing()) { deferred = false; render(false); } }, 0); });
  // 오래 열어 둔 탭·홈 화면 앱이 옛 코드로 남지 않게: 새 버전이 올라오면 자동 새로고침 (입력 중이면 미룸)
  // 페이지가 불러온 모든 스크립트 · 스타일의 ?v= 중 가장 큰 값 = 지금 화면 버전 (core.js만 보면 앱 파일만 바뀐 배포를 놓친다)
  function maxVer(list) { return list.reduce(function (a, v) { return Math.max(a, +v || 0); }, 0); }
  var VER = String(maxVer(Array.prototype.map.call(document.querySelectorAll('script[src*="?v="], link[href*="?v="]'), function (el) { return (el.src || el.href || '').replace(/.*[?&]v=(\d+).*/, '$1'); })) || '');
  HR.VER = VER;
  // 상단 「↻ 새로고침」: 브라우저에 남은 옛 화면(최대 10분 캐시)을 건너뛰고 최신 버전을 연다
  (function reloadButton() {
    if (/[?&]r=\d+/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);   // 주소창 정리
    var right = document.querySelector('.nav-right'); if (!right || $('navReload')) return;
    right.insertBefore(h('button', { type: 'button', id: 'navReload', class: 'nav-reload', title: '최신 버전으로 새로고침 · 지금 v' + VER, 'aria-label': '새로고침',
      onclick: function () { location.replace(location.pathname + '?r=' + Date.now() + location.hash); } }, '↻ 새로고침'), right.firstChild);
  })();
  function markNew(v) {
    var b = $('navReload'); if (!b) return;
    b.textContent = '↻ 새 버전'; b.title = '새 버전 v' + v + '이 있습니다 — 누르면 최신 화면으로 바뀝니다 (지금 v' + VER + ')';
    b.style.color = '#c8102e'; b.style.fontWeight = '600';
  }
  function checkVersion() {
    if (!/^\d+$/.test(VER)) return;
    fetch(location.pathname + '?vc=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
      var all = (t.match(/\?v=(\d+)/g) || []).map(function (x) { return x.slice(3); }), latest = maxVer(all), m = latest ? [null, String(latest)] : null;
      if (m && +m[1] > +VER) markNew(m[1]);   // 자동으로 새로고침하지 않는다(화면 튐 방지) — 상단 ↻ 버튼만 「새 버전」으로 바꿔 알린다
    }).catch(function () { /* 오프라인 등 — 다음에 다시 */ });
  }
  setTimeout(checkVersion, 3000);
  setInterval(checkVersion, 5 * 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkVersion(); });
  var lastVerCheck = 0;
  window.addEventListener('hashchange', function () { if (Date.now() - lastVerCheck > 60000) { lastVerCheck = Date.now(); checkVersion(); } });   // 메뉴를 옮길 때도 새 버전 확인
  if ($('loginForm')) $('loginForm').appendChild(h('p', { class: 'meta app-ver', text: (APP.title || 'fillts HR') + ' · v' + VER }));
  function typing() {
    var a = document.activeElement;
    return a && $('view').contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !/checkbox|radio|button|submit/.test(a.type)));
  }
  // 이미 만들어진 대표 계정에도 자동 근무 일정 1회 적용
  var autoChecked = false;
  function ensureCeoSchedule() {
    if (autoChecked || !S.isAdmin) return;
    var me = S.members[S.mid];
    if (!me) return;
    autoChecked = true;
    if ((me.email || '').toLowerCase() === 'kjw@fillts.com' && me.autoIn === undefined) {
      db.doc('hr_members/' + S.mid).update({ autoIn: '10:00', autoOut: '19:00' }).catch(function () {});
    }
  }
  var lastView = { key: '', html: '' };
  function render(force) {
    if (!S.mid || !S.ready) return;
    ensureCeoSchedule();
    renderChrome();
    if (!force && typing()) { deferred = true; return; }
    var mod = HR.modules[current.menu]; if (!mod) return;
    var old = $('view'), y = window.scrollY, key = current.menu + '/' + current.parts.join('/');
    var view = old.cloneNode(false);   // 새 화면은 따로 그려 보고, 바뀐 게 있을 때만 갈아 끼운다
    try { mod.render(view, current.parts.slice()); }
    catch (e) { console.error(e); view.appendChild(ui.empty('화면을 그리지 못했습니다. 새로고침 해 주세요.')); }
    var html = view.innerHTML;
    if (!force && key === lastView.key && html === lastView.html) return;
    lastView = { key: key, html: html };
    old.parentNode.replaceChild(view, old);
    if (!force) window.scrollTo(0, y);
  }

  function renderChrome() {
    var me = S.members[S.mid];
    $('navUser').textContent = (me && me.name) || S.user.email;
    var unread = S.notify.filter(function (n) { return !n.read; }).length;
    $('bellCount').textContent = unread > 9 ? '9+' : String(unread);
    $('bellCount').hidden = !unread;
    $('bell').setAttribute('aria-label', '알림 ' + unread + '개');
    document.querySelectorAll('[data-app]').forEach(function (el) { el.hidden = !HR.canApp(el.dataset.app); });   // 다른 창으로 열리는 앱 링크
    if ($('bellPanel').classList.contains('open')) renderBell();
  }

  /* ============================================
     웹 알림센터 + 브라우저 알림 (탭이 열려 있을 때)
     ============================================ */
  var seen = null;
  function onNotify(list) {
    S.notify = list;
    var fresh = seen ? list.filter(function (n) { return !n.read && !seen[n.id]; }) : [];
    seen = seen || {};
    list.forEach(function (n) { seen[n.id] = 1; });
    fresh.forEach(function (n) {
      toast(n.title);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { var bn = new Notification((APP.title || 'fillts HR') + ' · ' + n.title, { body: n.body || '', tag: n.id }); bn.onclick = function () { window.focus(); openNotify(n); }; } catch (e) { /* 미지원 */ }
      }
    });
  }
  function openNotify(n) {
    if (!n.read) db.doc('hr_notify/' + n.id).update({ read: true }).catch(function () {});
    $('bellPanel').classList.remove('open');
    if (n.link) {
      var ln = n.link.replace(/^#/, '');
      if (MENUS.indexOf(ln.split('/')[0]) < 0) location.href = '/hr/#' + ln; else HR.go(ln);   // 다른 앱의 알림은 HR에서 연다
    }
  }
  function renderBell() {
    var p = $('bellPanel');
    var head = h('div', { class: 'bell-head' }, h('div', { class: 'label', text: 'Notifications' }),
      h('button', { type: 'button', class: 'x-del', text: '모두 읽음', onclick: function () {
        var b = db.batch(), n = 0;
        S.notify.forEach(function (x) { if (!x.read) { b.update(db.doc('hr_notify/' + x.id), { read: true }); n++; } });
        if (n) b.commit().catch(fail);
      } }));
    var ul = h('ul', { class: 'bell-list' });
    S.notify.forEach(function (n) {
      ul.appendChild(h('li', { class: n.read ? '' : 'unread', tabindex: '0', onclick: function () { openNotify(n); }, onkeydown: function (e) { if (e.key === 'Enter') openNotify(n); } },
        h('div', { class: 'bell-title', text: n.title }), n.body ? h('div', { class: 'bell-body', text: n.body }) : null, h('div', { class: 'meta', text: fmt.ts(n.at) })));
    });
    if (!S.notify.length) ul.appendChild(h('li', { class: 'empty', text: '새 알림이 없습니다. 휴가 승인, 공지, 원온원 소식이 여기에 모입니다.' }));
    fill(p, head, ul, h('a', { href: '#info/notify', class: 'bell-foot', text: '알림 설정', onclick: function () { p.classList.remove('open'); } }));
  }
  $('bell').addEventListener('click', function (e) {
    e.stopPropagation();
    if ($('bellPanel').classList.toggle('open')) renderBell();
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('#bellPanel') && !e.target.closest('#bell')) $('bellPanel').classList.remove('open'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('bellPanel').classList.remove('open'); });

  setInterval(function () { var c = $('clock'); if (c) c.textContent = L.kstHM(new Date()); }, 5000);
})();
