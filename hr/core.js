/* ============================================
   fillts HR — core: Firebase · 인증 · 데이터 구독 · 라우터 · 알림센터 · UI 헬퍼
   보안 원칙: 권한 판정은 Firestore Rules(서버)가 최종 결정한다. 화면 분기는 편의.
   사용자 입력은 textContent로만 렌더링한다 (innerHTML 미사용).
   ============================================ */
(function () {
  'use strict';

  var L = window.Labor;
  var BOOTSTRAP_ADMINS = ['kjw@fillts.com', 'info@fillts.com']; // firestore.rules와 동일
  var IDLE_LIMIT_MS = 30 * 60 * 1000;

  firebase.initializeApp(window.FILLTS_FIREBASE);
  var auth = firebase.auth(), db = firebase.firestore(), FV = firebase.firestore.FieldValue;
  var SNAP = { serverTimestamps: 'estimate' };

  var HR = window.HR = { L: L, db: db, auth: auth, FV: FV, modules: {}, cache: {} };
  var S = HR.S = {
    user: null, mid: null, role: 'employee', isAdmin: false, isLead: false,
    cfg: Object.assign({}, L.DEFAULT_CONFIG), hmap: L.holidayMap(L.DEFAULT_CONFIG),
    members: {}, orgs: {}, presence: {}, away: [], notices: [], feed: [], goals: [],
    myPunches: [], myFixes: [], leaves: [], fixes: [], onesM: [], onesL: [], onesAll: [],
    notify: [], priv: null, pay: {}, users: {}, invites: {}, status: null, ready: false
  };
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
    days: function (punches, fixes) {
      var by = {};
      punches.forEach(function (p) {
        if (!p.at || !p.at.toDate) return;
        var date = fmt.dkToDate(p.dk), d = by[date] || (by[date] = { ins: [], outs: [], mode: p.mode });
        if (p.kind === 'in') { d.ins.push(p.at.toDate()); d.mode = p.mode; } else d.outs.push(p.at.toDate());
      });
      var out = {};
      Object.keys(by).forEach(function (date) {
        var d = by[date]; if (!d.ins.length) return;
        var first = new Date(Math.min.apply(null, d.ins));
        var last = d.outs.length ? new Date(Math.max.apply(null, d.outs)) : null;
        if (last && last < first) last = null;
        out[date] = { date: date, src: 'punch', mode: d.mode, inHM: L.kstHM(first), outHM: last ? L.kstHM(last) : '', inMin: L.kstMin(first), span: last ? Math.round((last - first) / 60000) : null, open: !last };
      });
      (fixes || []).filter(function (f) { return f.status === 'approved'; })
        .sort(function (a, b) { return a.decidedAt && b.decidedAt ? a.decidedAt.toMillis() - b.decidedAt.toMillis() : 0; })
        .forEach(function (f) {
          var i = L.hmToMin(f.in), o = L.hmToMin(f.out);
          if (i == null || o == null) return;
          out[f.date] = { date: f.date, src: 'fix', mode: (out[f.date] || {}).mode, inHM: f.in, outHM: f.out, inMin: i, span: o >= i ? o - i : o + 1440 - i, brk: f.brk === '' || f.brk == null ? null : +f.brk, open: false };
        });
      Object.keys(out).forEach(function (k) { out[k].calc = out[k].open ? null : L.calcDay(out[k]); });
      return out;
    },
    week: function (days, monday) {
      var list = [];
      for (var i = 0; i < 7; i++) { var d = L.addDays(monday, i); list.push({ date: d, calc: days[d] ? days[d].calc : null }); }
      var w = L.calcWeek(list, S.cfg, S.hmap); w.monday = monday; return w;
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
  }
  $('toSignup').addEventListener('click', function (e) { e.preventDefault(); setAuthMode(authMode === 'login' ? 'signup' : 'login'); });
  $('toReset').addEventListener('click', function (e) { e.preventDefault(); setAuthMode('reset'); });

  var AUTH_ERR = {
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않습니다.', 'auth/wrong-password': '이메일 또는 비밀번호가 맞지 않습니다.',
    'auth/user-not-found': '이메일 또는 비밀번호가 맞지 않습니다.', 'auth/invalid-email': '이메일 형식을 확인하세요.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정하세요.',
    'auth/weak-password': '비밀번호는 10자 이상으로 정하세요.', 'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도하세요.',
    'auth/network-request-failed': '네트워크 연결을 확인하세요.'
  };
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
        .then(function (c) { return c.user.sendEmailVerification(cont); })
        .then(done).catch(err);
      return;
    }
    var keep = $('loginKeep').checked;
    try { localStorage.setItem('hrKeep', keep ? '1' : ''); } catch (x) { /* 무시 */ }
    auth.setPersistence(keep ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION)
      .then(function () { return auth.signInWithEmailAndPassword(email, pw); })
      .then(function () { done(); $('loginPw').value = ''; }).catch(err);
  });
  $('verifyResend').addEventListener('click', function () {
    if (!auth.currentUser) return;
    auth.currentUser.sendEmailVerification({ url: location.origin + '/hr/' })
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
  function logout() { stopAll(); auth.signOut(); }
  HR.logout = logout;
  $('noAccessRetry').addEventListener('click', function (e) { e.preventDefault(); if (auth.currentUser) enter(auth.currentUser); });

  auth.onAuthStateChanged(function (u) {
    if (!u) { stopAll(); S.user = null; S.mid = null; showAuth('login'); setAuthMode('login'); return; }
    if (!u.emailVerified) {
      showAuth('verify');
      $('verifyText').textContent = u.email + ' 로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 아래 버튼을 누르세요.';
      return;
    }
    enter(u);
  });

  function enter(u) {
    S.user = u;
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
      type: '정규직', weeklyHours: 40, status: '재직', leaderId: '', leaveAdjs: [], slackId: ''
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

  function start(hu) {
    stopAll();
    S.mid = hu.memberId; S.role = hu.role || 'employee';
    S.isAdmin = S.role === 'admin'; S.isLead = S.isAdmin || S.role === 'manager';
    document.body.classList.toggle('is-admin', S.isAdmin);
    document.body.classList.toggle('is-lead', S.isLead);
    $('authView').hidden = true; $('appView').hidden = false;

    var t = fmt.today(), cur = fmt.ymNum(t), prev = fmt.ymNum(fmt.ymShift(t.slice(0, 7), -1));
    sub(db.doc('hr_config/main'), function (s) { S.cfg = Object.assign({}, L.DEFAULT_CONFIG, s.exists ? s.data() : {}); S.hmap = L.holidayMap(S.cfg); });
    sub(db.collection('hr_members'), function (s) { S.members = {}; HR.rows(s).forEach(function (m) { S.members[m.id] = m; }); S.ready = true; });
    sub(db.collection('hr_orgs'), function (s) { S.orgs = {}; HR.rows(s).forEach(function (o) { S.orgs[o.id] = o; }); });
    sub(db.collection('hr_presence'), function (s) { S.presence = {}; HR.rows(s).forEach(function (p) { S.presence[p.id] = p; }); });
    sub(db.collection('hr_away').where('end', '>=', L.addMonths(t, -2)), function (s) { S.away = HR.rows(s); });
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
    } else {
      sub(db.collection('hr_leave').where('memberId', '==', S.mid), function (s) { S.leaves = HR.rows(s); });
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
      Promise.resolve().then(fn).then(function (d) { HR.cache[key] = { at: Date.now(), data: d }; changed(); })
        .catch(function (e) { HR.cache[key] = { at: Date.now(), data: null, err: e }; console.warn(key, e.code || e); changed(); });
    }
    return c ? c.data : null;
  };
  HR.invalidate = function (prefix) { Object.keys(HR.cache).forEach(function (k) { if (k.indexOf(prefix) === 0) delete HR.cache[k]; }); changed(); };

  /* ============================================
     라우터 · 렌더
     ============================================ */
  var MENUS = ['info', 'notice', 'people', 'work', 'leave', 'goals', 'admin'];
  HR.register = function (id, mod) { HR.modules[id] = mod; };
  HR.go = function (hash) { if (location.hash !== '#' + hash) location.hash = hash; else route(); };
  var current = { menu: 'info', parts: [] };
  function route() {
    if (!S.mid) return;
    var parts = (location.hash || '#info').slice(1).split('/').filter(Boolean);
    var menu = parts.shift() || 'info';
    if (MENUS.indexOf(menu) < 0 || (menu === 'admin' && !S.isAdmin)) { menu = 'info'; parts = []; }
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
  function typing() {
    var a = document.activeElement;
    return a && $('view').contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !/checkbox|radio|button|submit/.test(a.type)));
  }
  function render(force) {
    if (!S.mid || !S.ready) return;
    renderChrome();
    if (!force && typing()) { deferred = true; return; }
    var mod = HR.modules[current.menu]; if (!mod) return;
    var view = $('view'), y = window.scrollY;
    clear(view);
    try { mod.render(view, current.parts.slice()); }
    catch (e) { console.error(e); view.appendChild(ui.empty('화면을 그리지 못했습니다. 새로고침 해 주세요.')); }
    if (!force) window.scrollTo(0, y);
  }

  function renderChrome() {
    var me = S.members[S.mid];
    $('navUser').textContent = (me && me.name) || S.user.email;
    var unread = S.notify.filter(function (n) { return !n.read; }).length;
    $('bellCount').textContent = unread > 9 ? '9+' : String(unread);
    $('bellCount').hidden = !unread;
    $('bell').setAttribute('aria-label', '알림 ' + unread + '개');
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
        try { var bn = new Notification('fillts HR · ' + n.title, { body: n.body || '', tag: n.id }); bn.onclick = function () { window.focus(); openNotify(n); }; } catch (e) { /* 미지원 */ }
      }
    });
  }
  function openNotify(n) {
    if (!n.read) db.doc('hr_notify/' + n.id).update({ read: true }).catch(function () {});
    $('bellPanel').classList.remove('open');
    if (n.link) HR.go(n.link.replace(/^#/, ''));
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
