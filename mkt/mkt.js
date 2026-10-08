/* ============================================
   fillts MKT — 마케팅 설계 맵: 목표 · 타겟 · 소구점 · 전략 · 계획 · 실행 아이디어 보드
   로그인은 fillts HR 계정을 그대로 쓴다 (같은 Firebase 프로젝트 · 같은 도메인).
   권한 판정은 Firestore Rules(mkt_items · mkt_boards)가 최종 결정한다.
   사용자 입력은 textContent로만 렌더링한다 (innerHTML 미사용).
   ============================================ */
(function () {
  'use strict';

  var IDLE_LIMIT_MS = 2 * 60 * 60 * 1000;
  firebase.initializeApp(window.FILLTS_FIREBASE);
  var auth = firebase.auth(), db = firebase.firestore(), FV = firebase.firestore.FieldValue;
  var SNAP = { serverTimestamps: 'estimate' };

  /* ---------- 보드 정의: 설계 순서 = 목표 → 타겟 → 소구점 → 전략 → 계획 → 실행 ---------- */
  var BOARDS = [
    { id: 'goal', name: '목표', en: 'Goal', q: '무엇을 이루면 성공인가', ph: '예) 런칭 3개월 재구매율 25%',
      hints: ['첫 번째 목표 「자사몰 누적 10억」을 숫자로 쪼개면? (구매자 수 × 객단가 × 재구매)', '3개월 · 6개월 · 1년 뒤 각각 무엇이 되어 있어야 하나',
        '매출 말고 꼭 지킬 지표 — 재구매율 · 리뷰 수 · 검색량 · 팔로워', '이 목표를 이루면 고객에게는 무엇이 달라지나', '지금은 쫓지 않을 숫자는 무엇인가'] },
    { id: 'target', name: '타겟', en: 'Target', q: '누구의 어떤 순간을 잡을까', ph: '예) 세안 후 당김이 고민인 30대 초반 직장인',
      hints: ['1순위 고객 한 명 — 나이 · 피부 고민 · 하루 일과', '지금 무엇을 쓰고 있고, 무엇이 불만인가', '어디서 정보를 얻나 — 인스타 · 유튜브 · 올리브영 · 지인',
        '언제 사고 싶어지나 — 구매 직전의 순간', '굳이 잡지 않을 고객은 누구인가'] },
    { id: 'appeal', name: '소구점', en: 'Appeal', q: '왜 우리여야 하나', ph: '예) 씻고 나서도 당기지 않는 약산성 젤',
      hints: ['제품 사실(성분 · 제형 · 연구) → 고객이 얻는 것 → 느끼는 감정', '경쟁 제품이 말하지 못하는 한 가지', '한 문장 약속 — 써 보면 무엇이 달라지나',
        '믿게 만드는 증거 — 시험 결과 · 특허 출원 · 리뷰 · 만든 이야기', '쓰면 안 되는 표현 확인 — 화장품 표시 · 광고 금지어(「치료」 「완벽 개선」 등)'] },
    { id: 'strategy', name: '전략', en: 'Strategy', q: '어디서 어떻게 이길까', ph: '예) 첫 3개월은 자사몰 + 인스타 릴스에만 집중',
      hints: ['어느 채널에 먼저 집중하나 — 자사몰 · 쿠팡 · 인스타 · 유튜브 · 오프라인', '고객 머릿속 자리 — 「○○ 하면 바인그라피」', '가격 · 할인 원칙 — 무엇을 지키고 언제 쓰나',
        '콘텐츠 축 3개 — 무엇을 반복해서 말할까', '인플루언서 · 리뷰(UGC)를 어떻게 모을까', '하지 않을 것 — 지금 버리는 채널 · 방식'] },
    { id: 'plan', name: '계획', en: 'Plan', q: '언제 · 무엇을 · 얼마로', ph: '예) 런칭 4주 전 체험단 30명 모집',
      hints: ['런칭 전 · 런칭 · 런칭 후 단계별 할 일', '월별 캘린더 — 시즌 · 행사 · 신제품 일정', '예산을 어디에 얼마나 나눌까',
        '누가 맡나 — 담당과 협업 상대', '언제 무엇을 보고 계속 · 수정 · 중단을 판단하나'] },
    { id: 'exec', name: '실행', en: 'Execution', q: '이번 주 무엇을 하고 무엇을 배웠나', ph: '예) 릴스 3편 업로드 — 저장 수 비교',
      hints: ['이번 주 실행 항목과 담당', '결과 — 숫자와 고객 반응', '잘된 것 · 안된 것 · 배운 점', '다음 액션 — 계속 · 수정 · 중단', '자료 링크 — 시트 · 슬라이드 · 콘텐츠'] }
  ];
  var BMAP = {}; BOARDS.forEach(function (b, i) { b.no = ('0' + (i + 1)).slice(-2); BMAP[b.id] = b; });
  // 프로젝트: 해야 할 과업을 쭉 적고, 그중 몇 개를 골라 「디벨롭」으로 키운다 (설계 보드 6개와 별개 — 진행도에 안 들어감)
  var PROJECT = { id: 'project', no: '00', name: '프로젝트', en: 'Projects', q: '해야 할 과업을 쭉 적고, 몇 개를 골라 키운다', ph: '예) 런칭 체험단 30명 운영' };
  BMAP.project = PROJECT;
  var ALLB = [PROJECT].concat(BOARDS);
  var STATUS = [['idea', '아이디어'], ['review', '검토 중'], ['pick', '확정'], ['hold', '보류']];
  var PSTATUS = [['idea', '과업'], ['review', '디벨롭'], ['pick', '확정'], ['hold', '보류']];
  var STNAME = {}; STATUS.forEach(function (s) { STNAME[s[0]] = s[1]; });
  var PSTNAME = {}; PSTATUS.forEach(function (s) { PSTNAME[s[0]] = s[1]; });
  function stName(st, board) { return (board === 'project' ? PSTNAME : STNAME)[st || 'idea']; }
  var STORD = { pick: 0, review: 1, idea: 2, hold: 3 };
  var MAX_SUBS = 30, MAX_LINKS = 20;

  var S = { user: null, mid: null, isAdmin: false, members: {}, orgs: {}, tfs: [], items: [], boards: {}, ready: false, gotItems: false };
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
  function msg() { return h('p', { class: 'form-msg', role: 'alert' }); }
  function err(el, t) { el.textContent = t; el.classList.remove('ok'); }
  function btn(text, onclick, cls) { return h('button', { type: 'button', class: 'btn ' + (cls || ''), text: text, onclick: onclick }); }
  // 두 번 눌러 확정 (브라우저 confirm 대신)
  function confirmBtn(text, onconfirm) {
    var b = h('button', { type: 'button', class: 'btn btn-line btn-xs danger', text: text });
    b.addEventListener('click', function () {
      if (b.dataset.armed) { delete b.dataset.armed; b.textContent = text; onconfirm(); return; }
      b.dataset.armed = '1'; b.textContent = '한 번 더 누르면 ' + text;
      setTimeout(function () { if (b.dataset.armed) { delete b.dataset.armed; b.textContent = text; } }, 3000);
    });
    return b;
  }
  function name(mid) { var m = S.members[mid]; return m ? (m.name || '(이름 없음)') : '(알 수 없음)'; }
  function kstDate(d) { return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10); }
  function when(ts) {
    if (!ts || !ts.toDate) return '';
    var d = ts.toDate(), t = kstDate(d), hm = new Date(d.getTime() + 9 * 3600000).toISOString().slice(11, 16);
    return (t === kstDate(new Date()) ? '오늘 ' + hm : t.slice(2).replace(/-/g, '.'));
  }
  // 본문: 줄 단위 문단 + URL 자동 링크 (텍스트 노드만)
  function rich(text, cls) {
    var box = h('div', { class: cls || 'mx-body' });
    String(text || '').split('\n').forEach(function (line) {
      if (!line.trim()) return;
      var p = h('p'), re = /(https?:\/\/[^\s<>"]+)/g, last = 0, m;
      while ((m = re.exec(line))) {
        append(p, line.slice(last, m.index));
        p.appendChild(h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer', text: m[1].length > 48 ? m[1].slice(0, 46) + '…' : m[1] }));
        last = m.index + m[1].length;
      }
      append(p, line.slice(last));
      box.appendChild(p);
    });
    return box;
  }

  /* ============================================
     인증 — fillts HR 계정 공유. 로그인은 /hr/에서 하고 돌아온다
     ============================================ */
  function showAuth(kind, text) {
    $('appView').hidden = true; $('authView').hidden = false;
    $('authLogout').hidden = kind === 'login';
    $('toHrLogin').hidden = kind !== 'login';
    $('authTitle').textContent = kind === 'login' ? 'fillts HR 계정으로 들어옵니다' : '아직 들어올 수 없습니다';
    $('authText').textContent = text || 'HR에서 로그인하면 이 화면으로 바로 돌아옵니다.';
  }
  $('toHrLogin').addEventListener('click', function () {
    try { localStorage.setItem('hrNext', JSON.stringify({ to: '/mkt/' + (location.hash || ''), at: Date.now() })); } catch (e) { /* 무시 */ }
    location.href = '/hr/';
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.js-logout');
    if (a) { e.preventDefault(); stopAll(); auth.signOut(); }
  });
  auth.onAuthStateChanged(function (u) {
    if (!u) { stopAll(); S.user = null; S.mid = null; showAuth('login'); return; }
    if (!u.emailVerified) return showAuth('blocked', '이메일 인증이 끝나지 않았습니다. fillts HR에서 인증을 마친 뒤 다시 오세요.');
    S.user = u;
    db.doc('hr_users/' + u.uid).get().then(function (snap) {
      if (!snap.exists) return showAuth('blocked', u.email + ' 는 아직 fillts HR 구성원으로 연결되지 않았습니다. fillts HR에 먼저 로그인해 주세요.');
      start(snap.data());
    }).catch(function (e) { console.warn(e); showAuth('blocked', '정보를 불러오지 못했습니다. 잠시 후 새로고침 해 주세요.'); });
  });
  // 2시간 무활동 자동 로그아웃 (HR에서 「로그인 유지」를 고른 기기는 제외)
  var lastAct = Date.now();
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) { window.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true }); });
  setInterval(function () {
    var keep = false; try { keep = localStorage.getItem('hrKeep') === '1'; } catch (x) { /* 무시 */ }
    if (S.user && !keep && Date.now() - lastAct > IDLE_LIMIT_MS) { stopAll(); auth.signOut(); toast('2시간 동안 사용이 없어 로그아웃했습니다.'); }
  }, 60000);

  /* ============ 구독 ============ */
  function stopAll() { unsubs.forEach(function (f) { try { f(); } catch (e) { /* noop */ } }); unsubs = []; S.ready = false; S.gotItems = false; }
  function rows(snap) { return snap.docs.map(function (d) { var o = d.data(SNAP); o.id = d.id; return o; }); }
  function sub(q, fn) { unsubs.push(q.onSnapshot(function (s) { fn(s); changed(); }, function (e) { console.warn('subscription', e.code, e.message); if (e.code === 'permission-denied') { S.denied = true; changed(); } })); }
  function start(hu) {
    stopAll();
    S.mid = hu.memberId; S.isAdmin = hu.role === 'admin';
    // 앱 접근: 관리자 또는 HR 설정 › 앱 접근에서 Marketing 열람 · 편집을 받은 계정만 (서버 규칙도 같은 값으로 판정)
    var lv = S.isAdmin ? 'edit' : ((hu.apps || {}).mkt || '');
    if (lv !== 'view' && lv !== 'edit') { S.mid = null; return showAuth('blocked', S.user.email + ' 계정에는 Marketing 접근 권한이 없습니다. HR 관리자에게 「설정 › 앱 접근」에서 권한을 요청하세요.'); }
    S.canEdit = lv === 'edit'; document.body.classList.toggle('mx-ro', !S.canEdit);
    $('authView').hidden = true; $('appView').hidden = false;
    sub(db.collection('hr_members'), function (s) { S.members = {}; rows(s).forEach(function (m) { S.members[m.id] = m; }); S.ready = true; });
    sub(db.collection('mkt_items'), function (s) { S.items = rows(s); S.gotItems = true; });
    sub(db.collection('hr_orgs'), function (s) { S.orgs = {}; rows(s).forEach(function (o) { S.orgs[o.id] = o; }); });
    db.collection('hr_ws_tf').get().then(function (s) { S.tfs = rows(s); }).catch(function () { S.tfs = []; });   // WORK 보내기 공간 목록
    sub(db.collection('mkt_boards'), function (s) { S.boards = {}; rows(s).forEach(function (b) { S.boards[b.id] = b; }); });
    route();
  }

  /* ============ 라우터 · 렌더 ============ */
  var current = { menu: 'map', board: null };
  function route() {
    if (!S.mid) return;
    var parts = (location.hash || '#map').slice(1).split('/').filter(Boolean);
    var menu = parts[0] === 'project' ? 'project' : parts[0] === 'b' && BMAP[parts[1]] && parts[1] !== 'project' ? parts[1] : 'map';
    var moved = current.menu !== menu;
    current = { menu: menu, board: menu === 'map' || menu === 'project' ? null : BMAP[menu] };
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
  var pending = false, deferred = false;
  function changed() { if (pending) return; pending = true; setTimeout(function () { pending = false; render(false); }, 40); }
  function typing() {
    var a = document.activeElement;
    return a && $('view').contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !/checkbox|radio|button|submit/.test(a.type)));
  }
  document.addEventListener('focusout', function () { if (deferred) setTimeout(function () { if (!typing()) { deferred = false; render(false); } }, 0); });
  var lastView = { key: '', html: '' };
  function render(force) {
    if (!S.mid || !S.ready) return;
    var me = S.members[S.mid];
    $('navUser').textContent = (me && me.name) || S.user.email;
    if (!force && typing()) { deferred = true; return; }
    var old = $('view'), y = window.scrollY, key = current.menu;
    var view = old.cloneNode(false);   // 새 화면을 따로 그려 보고, 바뀐 게 있을 때만 갈아 끼운다 (화면 튐 방지)
    try { if (current.menu === 'project') renderProject(view); else if (current.board) renderBoard(view, current.board); else renderMap(view); }
    catch (e) { console.error(e); view.appendChild(h('p', { class: 'empty', text: '화면을 그리지 못했습니다. 새로고침 해 주세요.' })); }
    var html = view.innerHTML;
    if (!force && key === lastView.key && html === lastView.html) return;
    lastView = { key: key, html: html };
    old.parentNode.replaceChild(view, old);
    if (!force) window.scrollTo(0, y);
  }

  // 오래 열어 둔 탭이 옛 코드로 남지 않게: 새 버전이 올라오면 자동 새로고침 (입력 중 · 팝업 열림이면 미룸)
  var VER = ((document.querySelector('script[src*="mkt.js"]') || {}).src || '').replace(/.*[?&]v=(\d+).*/, '$1');
  function checkVersion() {
    if (!/^\d+$/.test(VER)) return;
    fetch(location.pathname + '?vc=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
      var m = t.match(/mkt\.js\?v=(\d+)/);
      // 자동 새로고침은 하지 않는다(화면 튐 · 캐시 무한 반복) — 「↻ 새 버전」 버튼만 띄우고, 누르면 캐시를 건너뛰어 연다
      if (m && +m[1] > +VER && !$('mxNew')) {
        var right = document.querySelector('.nav-right');
        if (right) right.insertBefore(h('button', { type: 'button', id: 'mxNew', class: 'mx-newver', text: '↻ 새 버전', title: '눌러서 새 버전으로 열기',
          onclick: function () { location.href = location.pathname + '?r=' + m[1] + location.hash; } }), right.firstChild);
      }
    }).catch(function () { /* 오프라인 등 — 다음에 다시 */ });
  }
  setTimeout(checkVersion, 3000);
  setInterval(checkVersion, 5 * 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkVersion(); });

  /* ============ 데이터 헬퍼 ============ */
  function itemsOf(bid) {
    return S.items.filter(function (x) { return x.board === bid; }).sort(function (a, b) {
      return (STORD[a.status] || 2) - (STORD[b.status] || 2) || (b.likes || []).length - (a.likes || []).length
        || ((b.at && b.at.toMillis ? b.at.toMillis() : 0) - (a.at && a.at.toMillis ? a.at.toMillis() : 0));
    });
  }
  function itemById(id) { return S.items.filter(function (x) { return x.id === id; })[0]; }
  function canDelete(it) { return S.isAdmin || it.by === S.mid; }
  // 이 항목과 이어진 항목 (내가 건 연결 + 나를 건 연결)
  function linksOf(it) {
    var ids = {};
    (it.links || []).forEach(function (id) { ids[id] = 1; });
    S.items.forEach(function (x) { if ((x.links || []).indexOf(it.id) >= 0) ids[x.id] = 1; });
    return Object.keys(ids).map(itemById).filter(Boolean);
  }
  function stats(bid) {
    var list = itemsOf(bid), c = { all: list.length, idea: 0, review: 0, pick: 0, hold: 0 };
    list.forEach(function (x) { c[x.status || 'idea']++; });
    return c;
  }
  function stage(c) {
    if (!c.all) return ['비어 있음', 'mute'];
    if (c.pick) return ['확정 ' + c.pick, 'ok'];
    if (c.review) return ['검토 중', 'warn'];
    return ['구상 중', ''];
  }
  function stTag(st, board) { return h('span', { class: 'tag mx-st st-' + (st || 'idea'), text: stName(st, board) }); }

  /* ============================================
     MAP — 전체 설계 맵
     ============================================ */
  function renderMap(view) {
    var tab = h('section', { class: 'tab mk' });
    var done = BOARDS.filter(function (b) { return stats(b.id).pick > 0; }).length;
    var next = BOARDS.filter(function (b) { return !stats(b.id).pick; })[0];
    tab.appendChild(h('header', { class: 'tab-head mx-head' },
      h('div', null, h('div', { class: 'label', text: 'Marketing Map' }), h('h1', { class: 'tab-title', text: '마케팅 설계 맵' })),
      h('div', { class: 'mx-head-right' }, btn('한 장 요약 복사', copySummary, 'btn-line btn-sm'))));

    // 북극성 한 문장 (mkt_boards/map)
    tab.appendChild(starPanel());

    // 설계 진행도
    var meter = h('div', { class: 'mx-progress' });
    BOARDS.forEach(function (b) { meter.appendChild(h('span', { class: 'mx-progress-seg' + (stats(b.id).pick ? ' on' : ''), title: b.name })); });
    tab.appendChild(h('section', { class: 'panel mx-prog-panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'label', text: '설계 진행도' }), h('span', { class: 'meta', text: done + ' / 6 보드 확정' })),
      meter,
      h('p', { class: 'muted small', text: next
        ? '다음 단계: 「' + next.name + '」 보드에서 ' + next.q + '를 정해 「확정」으로 표시하세요.'
        : '여섯 보드 모두 확정 항목이 있습니다. 실행 보드에 결과와 배운 점을 계속 쌓아 가세요.' }),
      next ? h('div', null, h('a', { class: 'btn btn-sm', href: '#b/' + next.id, text: next.name + ' 보드 열기' })) : null));

    // 6개 보드 흐름
    var flow = h('div', { class: 'mx-flow' });
    BOARDS.forEach(function (b) {
      var c = stats(b.id), sg = stage(c), picks = itemsOf(b.id).filter(function (x) { return x.status === 'pick'; }).slice(0, 4);
      var sum = (S.boards[b.id] || {}).summary;
      var top = picks.length ? picks : itemsOf(b.id).filter(function (x) { return x.status !== 'hold'; }).slice(0, 3);
      flow.appendChild(h('a', { class: 'mx-step b-' + b.id, href: '#b/' + b.id },
        h('div', { class: 'mx-step-top' }, h('span', { class: 'mx-no', text: b.no }), h('span', { class: 'tag ' + sg[1], text: sg[0] })),
        h('h2', { class: 'mx-step-name', text: b.name }), h('p', { class: 'mx-step-q', text: b.q }),
        sum ? h('p', { class: 'mx-step-sum', text: sum }) : null,
        top.length ? h('ul', { class: 'mx-step-list' + (picks.length ? ' picked' : '') }, top.map(function (x) { return h('li', { text: x.title }); }))
          : h('p', { class: 'mx-step-empty', text: '아직 아이디어가 없습니다. 눌러서 적어 보세요.' }),
        h('div', { class: 'mx-step-foot meta', text: '아이디어 ' + c.idea + ' · 검토 ' + c.review + ' · 확정 ' + c.pick + (c.hold ? ' · 보류 ' + c.hold : '') })));
    });
    tab.appendChild(flow);

    // 최근 올라온 것
    var recent = S.items.slice().sort(function (a, b) { return tsn(b.updatedAt || b.at) - tsn(a.updatedAt || a.at); }).slice(0, 8);
    var ul = h('ul', { class: 'list' });
    recent.forEach(function (x) {
      ul.appendChild(h('li', { class: 'mx-recent', tabindex: '0', onclick: function () { detailModal(x.id); }, onkeydown: function (e) { if (e.key === 'Enter') detailModal(x.id); } },
        h('span', { class: 'mx-chip b-' + x.board, text: (BMAP[x.board] || {}).name || x.board }), stTag(x.status, x.board),
        h('span', { class: 'grow', text: x.title }), h('span', { class: 'meta', text: name(x.updatedBy || x.by) + ' · ' + when(x.updatedAt || x.at) })));
    });
    tab.appendChild(h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', { class: 'label', text: '최근 업데이트' })),
      recent.length ? ul : h('p', { class: 'empty', text: S.gotItems ? '아직 올라온 아이디어가 없습니다. 목표 보드부터 시작해 보세요.' : (S.denied ? '권한이 없습니다. 관리자에게 문의하세요.' : '불러오는 중…') })));
    view.appendChild(tab);
  }
  function tsn(t) { return t && t.toMillis ? t.toMillis() : 0; }

  // 북극성 / 보드 한 줄 정리 — 같은 컴포넌트 (mkt_boards/<id>.summary)
  var editing = {};
  function starPanel() { return summaryPanel('map', '마케팅 북극성 — 한 문장', '예) 「그녀를 행복하게!」 — 씻는 순간부터 기분이 좋아지는 브랜드로 자사몰 누적 10억', 'mx-star'); }
  function summaryPanel(id, label, ph, cls) {
    var doc = S.boards[id] || {}, m = msg();
    var p = h('section', { class: 'panel ' + (cls || '') });
    if (editing[id]) {
      var ta = h('textarea', { rows: '3', maxlength: '600', placeholder: ph, value: doc.summary || '' });
      var save = function () {
        db.doc('mkt_boards/' + id).set({ summary: ta.value.trim().slice(0, 600), by: S.mid, updatedAt: FV.serverTimestamp() })
          .then(function () { editing[id] = false; render(true); toast('저장했습니다.'); }).catch(function (e) { fail(e, m); });
      };
      p.appendChild(h('div', { class: 'panel-head' }, h('div', { class: 'label', text: label })));
      p.appendChild(h('div', { class: 'field' }, ta)); p.appendChild(m);
      p.appendChild(h('div', { class: 'row' }, btn('저장', save, 'btn-sm'), btn('취소', function () { editing[id] = false; render(true); }, 'btn-line btn-sm')));
      setTimeout(function () { ta.focus(); }, 0);
      return p;
    }
    p.appendChild(h('div', { class: 'panel-head' }, h('div', { class: 'label', text: label }),
      h('button', { type: 'button', class: 'x-del mx-edit', text: doc.summary ? '고치기' : '적기', onclick: function () { editing[id] = true; render(true); } })));
    p.appendChild(doc.summary ? h('p', { class: 'mx-summary', text: doc.summary }) : h('p', { class: 'empty', text: ph }));
    if (doc.summary && doc.updatedAt) p.appendChild(h('p', { class: 'meta', text: name(doc.by) + ' · ' + when(doc.updatedAt) }));
    return p;
  }

  function copySummary() {
    var out = ['# fillts 마케팅 설계 맵 (' + kstDate(new Date()) + ')'];
    if ((S.boards.map || {}).summary) out.push('', '북극성: ' + S.boards.map.summary);
    var dev = itemsOf('project').filter(function (x) { return x.status === 'pick' || x.status === 'review'; });
    if (dev.length) {
      out.push('', '## 프로젝트 — 디벨롭 · 확정');
      dev.forEach(function (x) { out.push('- [' + stName(x.status, 'project') + '] ' + x.title); (x.subs || []).forEach(function (s) { out.push('  - ' + (s.done ? '✔ ' : '') + s.t); }); });
    }
    BOARDS.forEach(function (b) {
      var list = itemsOf(b.id).filter(function (x) { return x.status === 'pick' || x.status === 'review'; });
      out.push('', '## ' + b.no + ' ' + b.name + ' — ' + b.q);
      if ((S.boards[b.id] || {}).summary) out.push('> ' + S.boards[b.id].summary);
      if (!list.length) out.push('- (아직 확정 · 검토 항목 없음)');
      list.forEach(function (x) {
        out.push('- [' + STNAME[x.status] + '] ' + x.title);
        (x.subs || []).forEach(function (s) { out.push('  - ' + (s.done ? '✔ ' : '') + s.t); });
      });
    });
    var text = out.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('확정 · 검토 항목을 복사했습니다. Slack · 문서에 붙여 넣으세요.'); },
      function () { toast('복사하지 못했습니다. 브라우저 권한을 확인하세요.'); });
  }

  /* ============================================
     프로젝트 — 과업을 쭉 적고(리스트) → 몇 개를 골라 디벨롭(카드)
     ============================================ */
  var showHold = false;
  function setStatus(x, st) {
    db.doc('mkt_items/' + x.id).update({ status: st, updatedAt: FV.serverTimestamp(), updatedBy: S.mid })
      .then(function () { if (st === 'review') { toast('「' + x.title + '」을 프로젝트로 올렸습니다. 서브 이름부터 대략 적어 보세요.'); pjQuickSub(x); } else toast('옮겼습니다.'); }).catch(function (e) { fail(e); });
  }
  function addTask(inp, m) {
    var t = inp.value.replace(/^\s*(?:[-·•*]+|\d+[.)])\s+/, '').trim();
    if (!t) return;
    db.collection('mkt_items').add({ board: 'project', title: t.slice(0, 120), body: '', status: 'idea', subs: [], links: [], likes: [],
      by: S.mid, at: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(), updatedBy: S.mid }).catch(function (e) { fail(e, m); });
    inp.value = '';
    setTimeout(function () { render(true); var n = $('mxTaskAdd'); if (n) n.focus(); }, 80);   // 이어서 적을 수 있게 입력칸으로 돌아온다
  }
  function taskRow(x) {
    var subs = x.subs || [], liked = (x.likes || []).indexOf(S.mid) >= 0, hold = x.status === 'hold';
    return h('li', { class: 'mx-task' + (hold ? ' is-hold' : '') },
      h('button', { type: 'button', class: 'mx-task-t', text: x.title, onclick: function () { detailModal(x.id); } }),
      h('span', { class: 'meta mx-task-meta', text: (subs.length ? '세부 ' + subs.length + ' · ' : '') + name(x.by) + ' · ' + when(x.at) }),
      h('button', { type: 'button', class: 'mx-like' + (liked ? ' on' : ''), 'aria-pressed': String(liked), title: liked ? '좋아요 취소' : '좋아요 — 키워 보고 싶은 과업에',
        onclick: function () { like(x, !liked); } }, (liked ? '♥ ' : '♡ ') + ((x.likes || []).length || '')),
      hold ? btn('되살리기', function () { setStatus(x, 'idea'); }, 'btn-line btn-xs')
        : h('div', { class: 'mx-task-act' }, btn('보류', function () { setStatus(x, 'hold'); }, 'btn-line btn-xs'), btn('디벨롭 →', function () { setStatus(x, 'review'); }, 'btn-xs mx-primary')));
  }
  /* ============================================
     프로젝트 편집 — 프로젝트(기간 · 설명) → 서브(이름 · 기간 · 설명) → HR WORK 일정으로 보내기
     ============================================ */
  var MAX_PSUBS = 20;   // WORK 서브 프로젝트 한도와 같게
  function addDays(s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function addMonths(s, n) { var d = new Date(s + 'T00:00:00Z'), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); }
  function today() { return kstDate(new Date()); }
  function dot(s) { return s ? s.slice(2).replace(/-/g, '.') : ''; }
  function daysOf(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000) + 1; }
  function period(x) {
    if (!x.start && !x.due) return '';
    var t = (x.start ? dot(x.start) : '') + ' → ' + (x.due ? dot(x.due) : '');
    if (x.start && x.due && x.due >= x.start) t += ' · ' + daysOf(x.start, x.due) + '일';
    return t;
  }
  function dday(due) {
    if (!due) return null;
    var n = daysOf(today(), due) - 1;
    return n === 0 ? ['D-DAY', 'red'] : n > 0 ? ['D-' + n, n <= 7 ? 'warn' : 'mute'] : ['마감 ' + (-n) + '일 지남', 'red'];
  }
  // WORK 공간: 전사 · 조직(하위 없는 팀) · TF — WORK와 같은 기준
  function wsSpaces() {
    var parents = {}; Object.keys(S.orgs).forEach(function (k) { var p = S.orgs[k].parentId; if (p && S.orgs[p]) parents[p] = 1; });
    var orgs = Object.keys(S.orgs).filter(function (k) { return !parents[k]; }).sort(function (a, b) { return (S.orgs[a].order || 0) - (S.orgs[b].order || 0) || String(S.orgs[a].name).localeCompare(S.orgs[b].name, 'ko'); })
      .map(function (k) { var p = S.orgs[k].parentId; return [k, (p && S.orgs[p] ? S.orgs[p].name + ' · ' : '') + S.orgs[k].name]; });
    var tf = (S.tfs || []).filter(function (t) { return t.active !== false; }).map(function (t) { return [t.id, 'TF · ' + t.name]; });
    return [['all', '전사']].concat(orgs, tf);
  }
  function wsName(key) { var s = wsSpaces().filter(function (x) { return x[0] === key; })[0]; return s ? s[1] : '(삭제된 공간)'; }
  function canWs(key) {
    var me = S.members[S.mid] || {};
    if (S.isAdmin || key === 'all' || me.orgId === key) return true;
    var tf = (S.tfs || []).filter(function (t) { return t.id === key; })[0];
    return !!(tf && (tf.members || []).indexOf(S.mid) >= 0);
  }
  function wsUrl(x) { return '/hr/#ws/' + x.wsOrg + '/projects/' + x.wsPost; }
  var WS_STATUS = { idea: 'idea', review: 'doing', pick: 'doing', hold: 'idea' };
  // MKT 프로젝트 → WORK 프로젝트 (hr_ws_posts). 다시 보내면 제목 · 기간 · 설명 · 서브를 MKT 기준으로 덮어쓴다 (WORK 상태 · 담당은 그대로)
  function sendToWork(x, org, m, done) {
    var subs = (x.subs || []).filter(function (s) { return (s.t || '').trim(); }).slice(0, MAX_PSUBS).map(function (s) {
      return { t: s.t.trim().slice(0, 80), start: s.start || '', due: s.due || '', body: String(s.body || '').slice(0, 4000), done: !!s.done, links: [] };
    });
    var body = String(x.body || '').slice(0, 19000) + (x.body ? '\n\n' : '') + '— fillts MKT 프로젝트에서 보냄';
    var data = { title: x.title.slice(0, 100), body: body, start: x.start || '', due: x.due || '', subs: subs, updatedAt: FV.serverTimestamp() };
    var same = x.wsPost && x.wsOrg === org;
    var op = same ? db.doc('hr_ws_posts/' + x.wsPost).update(data).then(function () { return x.wsPost; })
      : db.collection('hr_ws_posts').add(Object.assign(data, { org: org, kind: 'project', status: WS_STATUS[x.status || 'idea'], owner: S.mid, people: [], flags: [], tags: ['MKT'],
          links: [{ t: 'MKT 프로젝트', url: 'https://fillts.com/mkt/#project' }], createdBy: S.mid, createdAt: FV.serverTimestamp() })).then(function (r) { return r.id; });
    return op.then(function (pid) {
      return db.doc('mkt_items/' + x.id).update({ wsOrg: org, wsPost: pid, wsAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(), updatedBy: S.mid }).then(function () { return pid; });
    }).then(function (pid) { if (done) done(pid); }).catch(function (e) {
      if (same && e && e.code === 'not-found') { x.wsPost = ''; return sendToWork(x, org, m, done); }   // WORK에서 지운 경우 → 새로 만든다
      if (e && e.code === 'permission-denied') return err(m, '「' + wsName(org) + '」 공간에 쓸 권한이 없습니다. 내 팀 · 전사 · 내가 속한 TF를 고르세요.');
      fail(e, m);
    });
  }

  function projectModal(id) {
    var src = id ? itemById(id) : null;
    if (id && !src) return toast('삭제된 항목입니다.');
    var it = JSON.parse(JSON.stringify({ title: src ? src.title : '', body: src ? src.body || '' : '', status: src ? src.status || 'idea' : 'review',
      start: src ? src.start || '' : today(), due: src ? src.due || '' : '', links: src ? src.links || [] : [],
      subs: (src ? src.subs || [] : []).map(function (s) { return { t: s.t || '', done: !!s.done, start: s.start || '', due: s.due || '', body: s.body || '' }; }) }));
    modal(src ? '프로젝트' : '새 프로젝트', 'b-project mx-detail mx-pj', function (panel, close) {
      var m = msg();
      var title = h('input', { type: 'text', class: 'sm-title', maxlength: '120', placeholder: PROJECT.ph, value: it.title });
      var body = h('textarea', { rows: '4', maxlength: '8000', placeholder: '목표 · 배경 · 이 프로젝트가 끝나면 무엇이 되어 있나 (URL은 자동 링크)', value: it.body });
      var seg = statusSeg(it.status, function (v) { it.status = v; }, 'project');

      // 기간 — WORK와 같은 빠른 선택
      var daysEl = h('span', { class: 'meta' });
      var drawDays = function () { daysEl.textContent = it.start && it.due ? (it.due < it.start ? '마감이 시작보다 빠릅니다' : daysOf(it.start, it.due) + '일') : ''; };
      var startI = h('input', { type: 'date', value: it.start, 'aria-label': '프로젝트 시작일', onchange: function () { it.start = this.value; drawDays(); } });
      var dueI = h('input', { type: 'date', value: it.due, 'aria-label': '프로젝트 마감일', onchange: function () { it.due = this.value; drawDays(); } });
      drawDays();
      var quick = h('div', { class: 'mx-quickd' }, [['1주', 7, 'd'], ['2주', 14, 'd'], ['1달', 1, 'm'], ['2달', 2, 'm'], ['3달', 3, 'm'], ['6달', 6, 'm']].map(function (q) {
        return h('button', { type: 'button', text: q[0], onclick: function () { var s = it.start || today(); if (!it.start) { it.start = s; startI.value = s; } it.due = q[2] === 'd' ? addDays(s, q[1] - 1) : addDays(addMonths(s, q[1]), -1); dueI.value = it.due; drawDays(); } });
      }));

      // 서브 프로젝트 — 블록마다 이름 · 기간 · 설명
      var subBox = h('ol', { class: 'mx-psubs' }), subCount = h('span', { class: 'meta' });
      var autoGrow = function (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px'; };
      var chainStart = function (i) {   // 앞 서브 마감 다음 날 → 없으면 프로젝트 시작일
        for (var k = i - 1; k >= 0; k--) if (it.subs[k].due) return addDays(it.subs[k].due, 1);
        return it.start || today();
      };
      var drawSubs = function (focusIdx) {
        while (subBox.firstChild) subBox.removeChild(subBox.firstChild);
        it.subs.forEach(function (s, i) {
          var nm = h('input', { type: 'text', class: 'mx-psub-t', maxlength: '80', placeholder: '서브 ' + (i + 1) + ' 이름', value: s.t, oninput: function () { s.t = this.value; } });
          var ta = h('textarea', { rows: '2', maxlength: '4000', placeholder: '설명 — 무엇을 · 어떻게 · 누가 · 완료 기준 (줄바꿈 자유)', value: s.body, oninput: function () { s.body = this.value; autoGrow(this); } });
          var sI = h('input', { type: 'date', value: s.start, 'aria-label': '서브 시작일', onchange: function () { s.start = this.value; } });
          var dI = h('input', { type: 'date', value: s.due, 'aria-label': '서브 마감일', onchange: function () { s.due = this.value; } });
          var ensure = function () { if (!s.start) { s.start = chainStart(i); sI.value = s.start; } };
          var chip = function (label, fn) { return h('button', { type: 'button', text: label, onclick: fn }); };
          var li = h('li', { class: 'mx-psub' + (s.done ? ' done' : '') },
            h('div', { class: 'mx-psub-head' },
              h('span', { class: 'mx-psub-no', text: String(i + 1) }),
              nm,
              h('label', { class: 'mx-psub-done', title: '완료' }, h('input', { type: 'checkbox', checked: s.done, onchange: function () { s.done = this.checked; li.classList.toggle('done', s.done); } }), ' 완료'),
              h('button', { type: 'button', class: 'mx-mini', title: '위로', 'aria-label': '위로', text: '↑', disabled: i === 0, onclick: function () { var t = it.subs[i - 1]; it.subs[i - 1] = s; it.subs[i] = t; drawSubs(); } }),
              h('button', { type: 'button', class: 'mx-mini', title: '아래로', 'aria-label': '아래로', text: '↓', disabled: i === it.subs.length - 1, onclick: function () { var t = it.subs[i + 1]; it.subs[i + 1] = s; it.subs[i] = t; drawSubs(); } }),
              h('button', { type: 'button', class: 'mx-mini del', title: '빼기', 'aria-label': '빼기', text: '×', onclick: function () { it.subs.splice(i, 1); drawSubs(); } })),
            h('div', { class: 'mx-psub-dates' }, sI, h('span', { class: 'meta', text: '→' }), dI,
              h('div', { class: 'mx-quickd' },
                chip(i ? '앞 서브 마감 후' : '프로젝트 시작일', function () { s.start = chainStart(i); sI.value = s.start; }),
                chip('1주', function () { ensure(); s.due = addDays(s.start, 6); dI.value = s.due; }),
                chip('2주', function () { ensure(); s.due = addDays(s.start, 13); dI.value = s.due; }),
                chip('1달', function () { ensure(); s.due = addDays(addMonths(s.start, 1), -1); dI.value = s.due; }))),
            ta);
          subBox.appendChild(li);
          setTimeout(function () { autoGrow(ta); }, 0);
          if (focusIdx === i) setTimeout(function () { nm.focus(); }, 0);
        });
        subCount.textContent = it.subs.length ? it.subs.length + ' / ' + MAX_PSUBS : '';
      };
      drawSubs();
      var addSub = function () {
        if (it.subs.length >= MAX_PSUBS) return err(m, '서브는 최대 ' + MAX_PSUBS + '개입니다 (WORK와 같은 한도).');
        it.subs.push({ t: '', done: false, start: chainStart(it.subs.length), due: '', body: '' }); drawSubs(it.subs.length - 1);
      };
      var quickArea = h('div', { class: 'mx-subquick', hidden: true });
      var openQuick = function () {
        while (quickArea.firstChild) quickArea.removeChild(quickArea.firstChild);
        var q = quickRows('서브 이름 — 한 칸에 하나', MAX_PSUBS), auto = h('input', { type: 'checkbox' });
        quickArea.appendChild(h('p', { class: 'muted small', text: '이름만 칸마다 적고 넣으면 아래에 서브 블록으로 생깁니다. 기간 · 설명은 블록에서 채우세요.' }));
        quickArea.appendChild(q.el);
        quickArea.appendChild(h('label', { class: 'check' }, auto, ' 앞 서브 마감 후부터 1주씩 자동으로 기간 배치'));
        quickArea.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '+ 칸 추가', onclick: function () { q.add(true); } }),
          h('button', { type: 'button', class: 'btn btn-xs', text: '서브로 넣기', onclick: function () {
            var v = q.values();
            if (it.subs.length + v.length > MAX_PSUBS) return err(m, '서브는 최대 ' + MAX_PSUBS + '개입니다.');
            v.forEach(function (t) {
              var s = { t: t.slice(0, 80), done: false, start: '', due: '', body: '' };
              if (auto.checked) { s.start = chainStart(it.subs.length); s.due = addDays(s.start, 6); }
              it.subs.push(s);
            });
            quickArea.hidden = true; drawSubs(); err(m, '');
          } }), h('button', { type: 'button', class: 'x-del', text: '접기', onclick: function () { quickArea.hidden = true; } })));
        quickArea.hidden = false; q.first().focus();
      };

      var collect = function () {
        var t = title.value.trim();
        if (!t) { err(m, '프로젝트 이름을 적어 주세요.'); return null; }
        if (it.start && it.due && it.due < it.start) { err(m, '프로젝트 마감이 시작보다 빠릅니다.'); return null; }
        var bad = it.subs.filter(function (s) { return s.start && s.due && s.due < s.start; })[0];
        if (bad) { err(m, '서브 「' + (bad.t || '이름 없음') + '」의 마감이 시작보다 빠릅니다.'); return null; }
        if (it.subs.some(function (s) { return !s.t.trim() && (s.body.trim() || s.due); })) { err(m, '이름 없는 서브가 있습니다. 이름을 적거나 ×로 빼 주세요.'); return null; }
        return { board: 'project', title: t.slice(0, 120), body: body.value.slice(0, 8000), status: it.status, start: it.start || '', due: it.due || '',
          subs: it.subs.filter(function (s) { return s.t.trim(); }).map(function (s) { return { t: s.t.trim().slice(0, 80), done: !!s.done, start: s.start || '', due: s.due || '', body: String(s.body || '').slice(0, 4000) }; }),
          links: it.links.filter(function (l) { return itemById(l); }), updatedAt: FV.serverTimestamp(), updatedBy: S.mid };
      };
      var save = function (after) {
        var data = collect(); if (!data) return false;
        var p = src ? db.doc('mkt_items/' + src.id).update(data).then(function () { return src.id; })
          : db.collection('mkt_items').add(Object.assign(data, { likes: [], by: S.mid, at: FV.serverTimestamp() })).then(function (r) { return r.id; });
        p.then(function (newId) { if (after) return after(newId, data); close(); toast(src ? '저장했습니다.' : '프로젝트를 만들었습니다.'); }).catch(function (e) { fail(e, m); });
        return true;
      };

      // HR WORK 일정으로 보내기
      var spaces = wsSpaces(), me = S.members[S.mid] || {};
      var defOrg = src && src.wsOrg ? src.wsOrg : (me.orgId && spaces.some(function (s) { return s[0] === me.orgId; }) ? me.orgId : 'all');
      var orgSel = h('select', { 'aria-label': 'WORK 공간' }, spaces.map(function (s) { return h('option', { value: s[0], text: s[1] + (canWs(s[0]) ? '' : ' (권한 없음)') }); }));
      orgSel.value = defOrg;
      var sent = src && src.wsPost;
      var sendBtn = btn(sent ? 'WORK에 다시 반영' : 'WORK 일정으로 보내기', function () {
        if (!canWs(orgSel.value)) return err(m, '「' + wsName(orgSel.value) + '」 공간에 쓸 권한이 없습니다. 내 팀 · 전사 · 내가 속한 TF를 고르세요.');
        sendBtn.disabled = true;
        var ok = save(function (newId, data) {
          var x = Object.assign({}, data, { id: newId, wsPost: src ? src.wsPost || '' : '', wsOrg: src ? src.wsOrg || '' : '' });
          var again = x.wsPost && x.wsOrg === orgSel.value;
          return sendToWork(x, orgSel.value, m, function () {
            close(); toast('WORK 「' + wsName(orgSel.value) + '」 일정에 ' + (again ? '반영했습니다.' : '보냈습니다.') + ' 타임라인에서 확인하세요.');
          }).then(function () { sendBtn.disabled = false; });
        });
        if (!ok) sendBtn.disabled = false;
      }, 'btn-sm mx-primary');
      var workSec = h('div', { class: 'mx-sec mx-worksec' },
        h('div', { class: 'mx-sec-head' }, h('span', { class: 'label', text: 'HR WORK 일정으로 보내기' })),
        h('p', { class: 'muted small', text: '프로젝트 이름 · 기간 · 설명 · 서브(기간 · 설명 · 완료)가 WORK 프로젝트로 만들어져 타임라인에 그대로 나옵니다. ' + (sent ? '다시 반영하면 WORK 쪽 제목 · 기간 · 설명 · 서브가 지금 내용으로 바뀝니다 (WORK 상태 · 담당은 그대로).' : '보낸 뒤 여기서 고치면 「WORK에 다시 반영」으로 맞출 수 있습니다.') }),
        h('div', { class: 'row mx-workrow' }, orgSel, sendBtn,
          sent ? h('a', { class: 'btn btn-line btn-sm', href: wsUrl(src), target: '_blank', rel: 'opener', text: 'WORK에서 보기 ↗' }) : null),
        sent ? h('p', { class: 'meta', text: '보냄 · ' + wsName(src.wsOrg) + (src.wsAt ? ' · ' + when(src.wsAt) : '') }) : null);

      panel.appendChild(title);
      panel.appendChild(h('div', { class: 'mx-field-row' }, h('span', { class: 'label', text: '상태' }), seg));
      panel.appendChild(h('div', { class: 'mx-sec mx-period' },
        h('div', { class: 'mx-sec-head' }, h('span', { class: 'label', text: '프로젝트 기간' }), daysEl),
        h('div', { class: 'mx-psub-dates' }, startI, h('span', { class: 'meta', text: '→' }), dueI, quick)));
      panel.appendChild(h('div', { class: 'field' }, h('label', { text: '프로젝트 설명' }), body));
      panel.appendChild(h('div', { class: 'mx-sec' },
        h('div', { class: 'mx-sec-head' }, h('span', { class: 'label', text: '서브 프로젝트 — 이름 · 기간 · 설명' }), subCount,
          h('button', { type: 'button', class: 'x-del', text: '날짜 모두 비우기', title: '서브 날짜만 비웁니다 (저장해야 반영)', onclick: function () { it.subs.forEach(function (x) { x.start = ''; x.due = ''; }); drawSubs(); } }),
          h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '+ 간단 서브', onclick: openQuick })),
        quickArea, subBox,
        h('button', { type: 'button', class: 'mx-subadd', text: '+ 서브 추가', onclick: addSub })));
      panel.appendChild(workSec);
      if (src) panel.appendChild(h('p', { class: 'meta', text: '처음 올림 ' + name(src.by) + ' · ' + when(src.at) + (src.updatedBy ? '  ·  마지막 수정 ' + name(src.updatedBy) + ' · ' + when(src.updatedAt) : '') }));
      panel.appendChild(m);
      panel.appendChild(h('div', { class: 'row sm-actions' }, btn(src ? '저장' : '만들기', function () { save(); }), btn('취소', close, 'btn-line'),
        src && canDelete(src) ? confirmBtn('삭제', function () {
          db.doc('mkt_items/' + src.id).delete().then(function () { close(); toast('삭제했습니다. (WORK로 보낸 프로젝트는 WORK에 남아 있습니다)'); }).catch(function (e) { fail(e, m); });
        }) : null));
      setTimeout(function () { (src ? panel.querySelector('.sm-x') : title).focus(); }, 0);
    });
  }

  // 프로젝트 블록 (목록) — 기간 · D-day · WORK 배지 · 서브 트리(기간 · 설명 첫 줄)
  var pjOpen = {};
  function pjBlock(x) {
    var subs = x.subs || [], doneN = subs.filter(function (s) { return s.done; }).length, dd = dday(x.due), open = pjOpen[x.id] !== false;
    var openIt = function () { projectModal(x.id); };
    return h('article', { class: 'mx-pjb st-' + (x.status || 'idea') },
      h('div', { class: 'mx-pjb-head', tabindex: '0', role: 'button', onclick: openIt, onkeydown: function (e) { if (e.key === 'Enter') openIt(); } },
        h('div', { class: 'mx-pjb-title' }, stTag(x.status, 'project'), h('h3', { text: x.title })),
        h('div', { class: 'mx-pjb-meta' },
          period(x) ? h('span', { class: 'mx-period-t', text: period(x) }) : h('span', { class: 'meta', text: '기간 미정 — 눌러서 정하기' }),
          dd && x.status !== 'pick' ? h('span', { class: 'tag ' + dd[1], text: dd[0] }) : null,
          x.wsPost ? h('a', { class: 'mx-wsbadge', href: wsUrl(x), target: '_blank', rel: 'opener', title: 'WORK에서 보기', text: 'WORK · ' + wsName(x.wsOrg) + ' ↗', onclick: function (e) { e.stopPropagation(); } }) : null)),
      x.body ? h('p', { class: 'mx-pjb-body', text: String(x.body).replace(/\s+/g, ' ').slice(0, 160) }) : null,
      subs.length ? h('div', { class: 'mx-pjb-subs' },
        h('button', { type: 'button', class: 'mx-pjb-fold', onclick: function () { pjOpen[x.id] = !open; render(true); } },
          (open ? '▾ ' : '▸ ') + '서브 ' + doneN + ' / ' + subs.length, h('span', { class: 'mx-bar' }, h('span', { class: 'mx-bar-fill', 'data-w': String(Math.round(doneN / subs.length * 100)) }))),
        open ? h('ol', { class: 'mx-pjb-sublist' }, subs.map(function (s) {
          return h('li', { class: s.done ? 'done' : '', onclick: openIt },
            h('span', { class: 'mx-pjb-check', text: s.done ? '✓' : '' }),
            h('div', { class: 'grow' }, h('div', { class: 'mx-pjb-subt' }, h('b', { text: s.t }), period(s) ? h('span', { class: 'meta', text: period(s) }) : null),
              s.body ? h('p', { class: 'mx-pjb-subb', text: String(s.body).split('\n').filter(function (l) { return l.trim(); }).slice(0, 2).join(' · ').slice(0, 160) }) : null));
        })) : null) : null,
      h('div', { class: 'mx-pjb-act' },
        h('button', { type: 'button', class: 'mx-pjb-quick', text: '+ 간단 서브', title: '서브 이름만 여러 개 한 번에', onclick: function () { pjQuickSub(x); } }),
        h('button', { type: 'button', class: 'mx-pjb-nosub', text: subs.length ? '기간 · 설명 채우기' : '열어서 자세히', onclick: openIt }),
        subs.some(function (s) { return s.start || s.due; }) ? confirmBtn('서브 날짜 모두 지우기', function () { clearSubDates(x, false); }) : null,
        x.start || x.due ? confirmBtn('프로젝트 기간도 지우기', function () { clearSubDates(x, true); }) : null));
  }
  // 서브 날짜 일괄 비우기 (이름 · 설명 · 완료는 그대로). withProject면 프로젝트 기간도 비운다
  function clearSubDates(x, withProject) {
    var subs = (x.subs || []).map(function (s) { return { t: s.t, done: !!s.done, start: '', due: '', body: s.body || '' }; });
    var data = { subs: subs, updatedAt: FV.serverTimestamp(), updatedBy: S.mid };
    if (withProject) { data.start = ''; data.due = ''; }
    db.doc('mkt_items/' + x.id).update(data).then(function () { toast(withProject ? '프로젝트 기간과 서브 날짜를 모두 지웠습니다.' : '서브 날짜를 모두 지웠습니다. 프로젝트 기간은 그대로입니다.'); }).catch(function (e) { fail(e); });
  }
  // 목록에서 바로: 서브 이름만 칸마다 → 한 번에 추가 (WORK 간단 서브와 같은 방식)
  function pjQuickSub(x) {
    modal('간단 서브 · ' + x.title, 'b-project', function (panel, close) {
      var m = msg(), count = h('span', { class: 'meta' });
      var q = quickRows('서브 이름', MAX_PSUBS, function (n) { count.textContent = n ? n + '개 추가 예정' : ''; });
      var auto = h('input', { type: 'checkbox', checked: true });
      var add = function () {
        var names = q.values(), subs = (x.subs || []).map(function (s) { return { t: s.t, done: !!s.done, start: s.start || '', due: s.due || '', body: s.body || '' }; });
        if (!names.length) return err(m, '서브 이름을 칸마다 하나씩 적어 주세요.');
        if (subs.length + names.length > MAX_PSUBS) return err(m, '서브는 최대 ' + MAX_PSUBS + '개입니다. 지금 ' + subs.length + '개가 있습니다.');
        var cur = '';
        if (auto.checked) { for (var k = subs.length - 1; k >= 0 && !cur; k--) if (subs[k].due) cur = addDays(subs[k].due, 1); cur = cur || x.start || today(); }
        names.forEach(function (t) {
          var s = { t: t.slice(0, 80), done: false, start: '', due: '', body: '' };
          if (cur) { s.start = cur; s.due = addDays(cur, 6); cur = addDays(cur, 7); }
          subs.push(s);
        });
        var data = { subs: subs, updatedAt: FV.serverTimestamp(), updatedBy: S.mid };
        if (auto.checked && !x.start) data.start = subs[0].start;   // 프로젝트 기간이 비어 있으면 서브 일정으로 채운다
        if (auto.checked && (!x.due || x.due < subs[subs.length - 1].due)) data.due = subs[subs.length - 1].due;
        db.doc('mkt_items/' + x.id).update(data).then(function () { close(); pjOpen[x.id] = true; toast(names.length + '개를 추가했습니다. 「기간 · 설명 채우기」로 하나씩 채우세요.'); }).catch(function (e) { fail(e, m); });
      };
      panel.appendChild(h('p', { class: 'muted small', text: '서브 이름만 칸마다 적으세요. Enter를 누르면 다음 칸으로 넘어가고, 여러 줄을 붙여 넣으면 줄마다 나뉩니다. 기간 · 설명은 나중에 채웁니다.' }));
      panel.appendChild(q.el);
      panel.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '+ 칸 추가', onclick: function () { q.add(true); } }), count));
      panel.appendChild(h('label', { class: 'check' }, auto, ' ' + ((x.subs || []).some(function (s) { return s.due; }) ? '앞 서브 마감 후' : '프로젝트 시작일') + '부터 1주씩 자동으로 기간 배치'));
      panel.appendChild(m);
      panel.appendChild(h('div', { class: 'row sm-actions' }, h('button', { type: 'button', class: 'btn', text: '한 번에 추가', onclick: add }), btn('취소', close, 'btn-line')));
      setTimeout(function () { q.first().focus(); }, 0);
    });
  }

  function renderProject(view) {
    var tab = h('section', { class: 'tab mk b-project' }), all = itemsOf('project');
    var dev = all.filter(function (x) { return x.status === 'review' || x.status === 'pick'; });
    var tasks = all.filter(function (x) { return (x.status || 'idea') === 'idea'; });
    var held = all.filter(function (x) { return x.status === 'hold'; });
    tab.appendChild(h('header', { class: 'tab-head mx-head' },
      h('div', null, h('div', { class: 'label', text: 'Projects' }), h('h1', { class: 'tab-title' }, '프로젝트', h('span', { class: 'mx-title-q', text: ' — ' + PROJECT.q }))),
      h('div', { class: 'mx-head-right' }, btn('+ 새 프로젝트', function () { projectModal(null); }, 'btn-sm mx-primary'), btn('+ 과업 여러 개 적기', function () { quickModal(PROJECT); }, 'btn-line btn-sm'))));

    tab.appendChild(h('ol', { class: 'mx-howto' },
      h('li', null, h('b', { text: '① 프로젝트 적기' }), h('span', { text: '이름 · 기간 · 설명. 아직 막연하면 아래 과업 리스트에 한 줄로 먼저 적어 두세요.' })),
      h('li', null, h('b', { text: '② 서브로 쪼개기' }), h('span', { text: '「+ 간단 서브」로 이름만 쭉 적고(1주씩 자동 배치), 기간 · 설명은 나중에 채웁니다.' })),
      h('li', null, h('b', { text: '③ WORK로 보내기' }), h('span', { text: '프로젝트를 열고 「WORK 일정으로 보내기」 — HR WORK 타임라인에 그대로 올라갑니다.' }))));

    // 진행 프로젝트 — 기간 · 서브 트리
    var grid = h('div', { class: 'mx-pjlist' });
    dev.sort(function (a, b) { return (STORD[a.status] || 2) - (STORD[b.status] || 2) || String(a.start || '9').localeCompare(String(b.start || '9')); }).forEach(function (x) { grid.appendChild(pjBlock(x)); });
    tab.appendChild(h('section', { class: 'panel mx-dev' },
      h('div', { class: 'panel-head' }, h('div', { class: 'label', text: '프로젝트 · ' + dev.length }), h('span', { class: 'meta', text: 'WORK로 보냄 ' + dev.filter(function (x) { return x.wsPost; }).length + ' · 확정 ' + dev.filter(function (x) { return x.status === 'pick'; }).length })),
      dev.length ? grid : h('p', { class: 'empty', text: S.gotItems ? '「+ 새 프로젝트」로 만들거나, 아래 과업 리스트에서 「디벨롭 →」을 눌러 프로젝트로 키우세요.' : (S.denied ? '권한이 없습니다. 관리자에게 문의하세요.' : '불러오는 중…') })));

    // 과업 리스트 — 한 줄씩
    var m = msg();
    var inp = h('input', { type: 'text', id: 'mxTaskAdd', maxlength: '120', placeholder: '과업을 적고 Enter — 이어서 계속 적을 수 있습니다', onkeydown: function (e) {
      if (e.key !== 'Enter' || e.isComposing) return; e.preventDefault(); addTask(this, m);
    } });
    var ul = h('ul', { class: 'mx-tasks' });
    tasks.forEach(function (x) { ul.appendChild(taskRow(x)); });
    tab.appendChild(h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'label', text: '과업 리스트 · ' + tasks.length }), h('span', { class: 'meta', text: '♥ 많은 순' })),
      h('div', { class: 'mx-task-add' }, inp, btn('추가', function () { addTask(inp, m); }, 'btn-sm')), m,
      tasks.length ? ul : h('p', { class: 'empty', text: '아직 과업이 없습니다. 위 칸에 하나씩 적거나 「+ 과업 여러 개 적기」로 한꺼번에 올리세요.' }),
      held.length ? h('div', { class: 'mx-held' },
        h('button', { type: 'button', class: 'x-del', text: showHold ? '보류 접기' : '보류 ' + held.length + '개 보기', onclick: function () { showHold = !showHold; render(true); } }),
        showHold ? h('ul', { class: 'mx-tasks' }, held.map(taskRow)) : null) : null));
    view.appendChild(tab);
  }

  /* ============================================
     보드 — 아이디어 카드
     ============================================ */
  var filt = {};
  function renderBoard(view, b) {
    var tab = h('section', { class: 'tab mk b-' + b.id }), c = stats(b.id), f = filt[b.id] || 'all';
    var idx = BOARDS.indexOf(b), prev = BOARDS[idx - 1], next = BOARDS[idx + 1];
    tab.appendChild(h('header', { class: 'tab-head mx-head' },
      h('div', null, h('div', { class: 'label', text: b.no + ' · ' + b.en }), h('h1', { class: 'tab-title' }, b.name, h('span', { class: 'mx-title-q', text: ' — ' + b.q }))),
      h('div', { class: 'mx-head-right' }, btn('+ 간단 입력', function () { quickModal(b); }, 'btn-sm mx-primary'), btn('+ 자세히 쓰기', function () { detailModal(null, b.id); }, 'btn-line btn-sm'))));

    // 왼쪽: 생각할 질문 · 한 줄 정리 · 앞뒤 보드
    var side = h('div', { class: 'stack mx-side' },
      h('section', { class: 'panel mx-hints' }, h('div', { class: 'label', text: '생각할 질문' }),
        h('ol', { class: 'mx-hint-list' }, b.hints.map(function (t) {
          return h('li', null, h('button', { type: 'button', class: 'mx-hint', title: '이 질문으로 아이디어 적기', text: t, onclick: function () { quickModal(b, t); } }));
        })),
        h('p', { class: 'meta', text: '질문을 누르면 그 질문으로 바로 적을 수 있습니다.' })),
      summaryPanel(b.id, b.name + ' 한 줄 정리', '확정된 생각을 한 문장으로 — MAP에 그대로 보입니다.'),
      h('nav', { class: 'mx-pn' },
        prev ? h('a', { href: '#b/' + prev.id, class: 'mx-pn-a', text: '← ' + prev.no + ' ' + prev.name }) : h('a', { href: '#map', class: 'mx-pn-a', text: '← MAP' }),
        next ? h('a', { href: '#b/' + next.id, class: 'mx-pn-a right', text: next.no + ' ' + next.name + ' →' }) : h('a', { href: '#map', class: 'mx-pn-a right', text: 'MAP →' })));

    // 오른쪽: 상태 필터 + 카드
    var chips = h('div', { class: 'mx-filters', role: 'tablist' });
    [['all', '전체', c.all]].concat(STATUS.map(function (s) { return [s[0], s[1], c[s[0]]]; })).forEach(function (s) {
      chips.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': String(f === s[0]), class: 'mx-filter' + (f === s[0] ? ' on' : ''), onclick: function () { filt[b.id] = s[0]; render(true); } },
        s[1], h('span', { class: 'mx-count', text: String(s[2]) })));
    });
    var list = itemsOf(b.id).filter(function (x) { return f === 'all' || (x.status || 'idea') === f; });
    var grid = h('div', { class: 'mx-grid' });
    list.forEach(function (x) { grid.appendChild(card(x)); });
    // 마지막 칸: 바로 적기
    grid.appendChild(h('button', { type: 'button', class: 'mx-card mx-add', onclick: function () { quickModal(b); } },
      h('span', { class: 'mx-add-plus', text: '+' }), h('span', { text: '아이디어 여러 개 한 번에 적기' })));
    var main = h('div', { class: 'stack mx-main' }, chips,
      !S.gotItems ? h('p', { class: 'empty', text: S.denied ? '권한이 없습니다. 관리자에게 문의하세요.' : '불러오는 중…' }) : null,
      grid);
    tab.appendChild(h('div', { class: 'mx-board' }, side, main));
    view.appendChild(tab);
  }
  function card(x) {
    var subs = x.subs || [], doneN = subs.filter(function (s) { return s.done; }).length, links = linksOf(x), liked = (x.likes || []).indexOf(S.mid) >= 0;
    var open = function () { detailModal(x.id); };
    return h('article', { class: 'mx-card st-' + (x.status || 'idea'), tabindex: '0', onclick: open, onkeydown: function (e) { if (e.key === 'Enter' && e.target === this) open(); } },
      h('div', { class: 'mx-card-top' }, stTag(x.status, x.board),
        h('button', { type: 'button', class: 'mx-like' + (liked ? ' on' : ''), 'aria-pressed': String(liked), title: liked ? '좋아요 취소' : '좋아요',
          onclick: function (e) { e.stopPropagation(); like(x, !liked); } }, (liked ? '♥ ' : '♡ ') + ((x.likes || []).length || ''))),
      h('h3', { class: 'mx-card-title', text: x.title }),
      x.body ? h('p', { class: 'mx-card-body', text: String(x.body).replace(/\s+/g, ' ').slice(0, 140) }) : null,
      subs.length ? h('div', { class: 'mx-card-subs' },
        h('div', { class: 'mx-bar' }, h('span', { class: 'mx-bar-fill', 'data-w': String(Math.round(doneN / subs.length * 100)) })),
        h('span', { class: 'meta', text: '세부항목 ' + doneN + ' / ' + subs.length })) : null,
      links.length ? h('div', { class: 'mx-card-links' }, links.slice(0, 4).map(function (l) { return h('span', { class: 'mx-chip b-' + l.board, text: ((BMAP[l.board] || {}).name || '') + ' · ' + l.title }); }),
        links.length > 4 ? h('span', { class: 'meta', text: '+' + (links.length - 4) }) : null) : null,
      h('div', { class: 'mx-card-foot meta', text: name(x.by) + ' · ' + when(x.at) }));
  }
  // CSP가 인라인 style 속성을 막으므로 막대 너비는 CSSOM으로 준다
  new MutationObserver(function () {
    document.querySelectorAll('.mx-bar-fill[data-w]').forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; });
  }).observe(document.documentElement, { childList: true, subtree: true });

  function like(x, on) {
    db.doc('mkt_items/' + x.id).update({ likes: on ? FV.arrayUnion(S.mid) : FV.arrayRemove(S.mid) }).catch(function (e) { fail(e); });
  }

  /* ============================================
     입력 — 간단 입력(여러 칸) · 자세히(상세 팝업)
     ============================================ */
  // 여러 칸 입력: 기본 5칸 · 「+ 칸 추가」 · Enter = 다음 칸(마지막이면 새 칸) · 최대 20칸
  function quickRows(ph, max, onCount) {
    var ol = h('ol', { class: 'qs-rows' });
    var inputs = function () { return [].slice.call(ol.querySelectorAll('input')); };
    var recount = function () { if (onCount) onCount(values().length); };
    var addRow = function (focus) {
      if (inputs().length >= max) return;
      var inp = h('input', { type: 'text', maxlength: '120', placeholder: ph, oninput: recount, onkeydown: function (e) {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault(); var all = inputs(), i = all.indexOf(this);
        if (i === all.length - 1) addRow(true); else all[i + 1].focus();
      } });
      ol.appendChild(h('li', null, inp)); if (focus) inp.focus();
    };
    // 여러 줄을 한 칸에 붙여 넣으면 줄마다 칸으로 나눈다
    ol.addEventListener('paste', function (e) {
      var t = (e.clipboardData || window.clipboardData).getData('text');
      if (!t || t.indexOf('\n') < 0) return;
      e.preventDefault();
      var lines = t.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean), i = inputs().indexOf(e.target);
      lines.forEach(function (line) {
        while (i < inputs().length && inputs()[i].value.trim()) i++;   // 이미 적힌 칸은 건너뛴다
        if (i >= inputs().length) { if (inputs().length >= max) return; addRow(false); }
        inputs()[i].value = line; i++;
      });
      recount();
    });
    var values = function () { return inputs().map(function (x) { return x.value.replace(/^\s*(?:[-·•*]+|\d+[.)])\s+/, '').trim(); }).filter(Boolean); };
    for (var r0 = 0; r0 < 5; r0++) addRow(false);
    return { el: ol, add: addRow, values: values, first: function () { return inputs()[0]; } };
  }
  function modal(kicker, cls, build) {
    var old = $('mkModal'); if (old) old.remove();
    var close = function () { wrap.remove(); document.removeEventListener('keydown', esc); };
    var esc = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    var panel = h('div', { class: 'sm-panel mx-panel ' + (cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': kicker },
      h('div', { class: 'sm-head' }, h('span', { class: 'sm-kicker', text: kicker }), h('button', { type: 'button', class: 'sm-x', 'aria-label': '닫기', text: '×', onclick: close })));
    var wrap = h('div', { id: 'mkModal', class: 'sm-wrap', onclick: function (e) { if (e.target === wrap) close(); } }, panel);
    build(panel, close);
    document.body.appendChild(wrap);
    return { close: close, panel: panel };
  }

  // 간단 입력: 제목만 칸마다 → 한 번에 카드로
  function quickModal(b, prompt) {
    modal(b.id === 'project' ? '과업 여러 개 적기 · 프로젝트' : '간단 입력 · ' + b.no + ' ' + b.name, 'b-' + b.id, function (panel, close) {
      var m = msg(), count = h('span', { class: 'meta' });
      var q = quickRows(b.ph, 20, function (n) { count.textContent = n ? n + '개 추가 예정' : ''; });
      var st = 'idea', seg = statusSeg(st, function (v) { st = v; }, b.id);
      var add = function () {
        var names = q.values();
        if (!names.length) return err(m, '아이디어를 칸마다 하나씩 적어 주세요.');
        var batch = db.batch();
        names.forEach(function (t) {
          batch.set(db.collection('mkt_items').doc(), { board: b.id, title: t.slice(0, 120), body: prompt ? '질문: ' + prompt : '', status: st, subs: [], links: [], likes: [],
            by: S.mid, at: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(), updatedBy: S.mid });
        });
        batch.commit().then(function () { close(); toast(names.length + '개를 올렸습니다. 카드를 눌러 세부항목을 채우세요.'); }).catch(function (e) { fail(e, m); });
      };
      if (prompt) panel.appendChild(h('p', { class: 'mx-prompt', text: prompt }));
      panel.appendChild(h('p', { class: 'muted small', text: '한 칸에 하나씩 짧게 적으세요. Enter를 누르면 다음 칸으로 넘어가고, 여러 줄을 붙여 넣으면 줄마다 나뉩니다. 내용 · 세부항목은 카드를 눌러 나중에 채웁니다.' }));
      panel.appendChild(q.el);
      panel.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '+ 칸 추가', onclick: function () { q.add(true); } }), count));
      panel.appendChild(h('div', { class: 'mx-field-row' }, h('span', { class: 'label', text: '상태' }), seg));
      panel.appendChild(m);
      panel.appendChild(h('div', { class: 'row sm-actions' }, h('button', { type: 'button', class: 'btn', text: '한 번에 올리기', onclick: add }), btn('취소', close, 'btn-line')));
      setTimeout(function () { q.first().focus(); }, 0);
    });
  }
  function statusSeg(val, onchange, board) {
    var box = h('div', { class: 'mx-seg', role: 'radiogroup' });
    (board === 'project' ? PSTATUS : STATUS).forEach(function (s) {
      box.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(s[0] === val), class: 'mx-seg-b st-' + s[0] + (s[0] === val ? ' on' : ''), text: s[1], onclick: function () {
        box.querySelectorAll('.mx-seg-b').forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
        this.classList.add('on'); this.setAttribute('aria-checked', 'true'); onchange(s[0]);
      } }));
    });
    return box;
  }

  // 자세히: 제목 · 상태 · 내용 · 세부항목(간단 입력 포함) · 다른 보드와 연결
  function detailModal(id, boardId) {
    var src = id ? itemById(id) : null;
    if ((src && src.board === 'project') || (!id && boardId === 'project')) return projectModal(id);   // 프로젝트는 기간 · 서브 · WORK 보내기가 있는 전용 편집
    if (id && !src) return toast('삭제된 항목입니다.');
    var b = BMAP[src ? src.board : boardId];
    var it = src ? JSON.parse(JSON.stringify({ title: src.title, body: src.body || '', status: src.status || 'idea', subs: src.subs || [], links: src.links || [] }))
      : { title: '', body: '', status: 'idea', subs: [], links: [] };
    modal((src ? '' : b.id === 'project' ? '새 과업 · ' : '새 아이디어 · ') + (b.id === 'project' ? b.name : b.no + ' ' + b.name), 'b-' + b.id + ' mx-detail', function (panel, close) {
      var m = msg();
      var title = h('input', { type: 'text', class: 'sm-title', maxlength: '120', placeholder: b.ph, value: it.title });
      var body = h('textarea', { rows: '5', maxlength: '8000', placeholder: '왜 이 생각인지, 근거 · 사례 · 링크 (URL은 자동 링크)', value: it.body });
      var seg = statusSeg(it.status, function (v) { it.status = v; }, b.id);

      // 세부항목
      var subBox = h('ul', { class: 'mx-subs' }), subCount = h('span', { class: 'meta' });
      var drawSubs = function () {
        while (subBox.firstChild) subBox.removeChild(subBox.firstChild);
        it.subs.forEach(function (s, i) {
          var cb = h('input', { type: 'checkbox', checked: s.done, 'aria-label': '완료', onchange: function () { s.done = this.checked; li.classList.toggle('done', s.done); } });
          var tx = h('input', { type: 'text', maxlength: '120', value: s.t, oninput: function () { s.t = this.value; } });
          var li = h('li', { class: s.done ? 'done' : '' }, cb, tx,
            h('button', { type: 'button', class: 'mx-mini', title: '위로', 'aria-label': '위로', text: '↑', disabled: i === 0, onclick: function () { var t = it.subs[i - 1]; it.subs[i - 1] = it.subs[i]; it.subs[i] = t; drawSubs(); } }),
            h('button', { type: 'button', class: 'mx-mini del', title: '빼기', 'aria-label': '빼기', text: '×', onclick: function () { it.subs.splice(i, 1); drawSubs(); } }));
          subBox.appendChild(li);
        });
        subCount.textContent = it.subs.length ? it.subs.length + ' / ' + MAX_SUBS : '';
      };
      drawSubs();
      var quickArea = h('div', { class: 'mx-subquick', hidden: true });
      var openQuick = function () {
        while (quickArea.firstChild) quickArea.removeChild(quickArea.firstChild);
        var q = quickRows('세부항목 — 이걸 풀려면 무엇을 해야 하나', 20);
        quickArea.appendChild(q.el);
        quickArea.appendChild(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '+ 칸 추가', onclick: function () { q.add(true); } }),
          h('button', { type: 'button', class: 'btn btn-xs', text: '목록에 넣기', onclick: function () {
            var v = q.values();
            if (it.subs.length + v.length > MAX_SUBS) return err(m, '세부항목은 최대 ' + MAX_SUBS + '개입니다.');
            v.forEach(function (t) { it.subs.push({ t: t.slice(0, 120), done: false }); });
            quickArea.hidden = true; drawSubs(); err(m, '');
          } }), h('button', { type: 'button', class: 'x-del', text: '접기', onclick: function () { quickArea.hidden = true; } })));
        quickArea.hidden = false; q.first().focus();
      };

      // 연결: 다른 보드 항목 고르기
      var linkBox = h('div', { class: 'mx-linkpick' });
      ALLB.forEach(function (ob) {
        if (ob.id === b.id) return;
        var others = itemsOf(ob.id).filter(function (x) { return x.status !== 'hold' || it.links.indexOf(x.id) >= 0; });
        if (!others.length) return;
        var row = h('div', { class: 'mx-linkrow' }, h('span', { class: 'mx-chip b-' + ob.id, text: ob.name }));
        others.forEach(function (x) {
          var on = it.links.indexOf(x.id) >= 0;
          row.appendChild(h('button', { type: 'button', class: 'mx-pick' + (on ? ' on' : '') + (x.status === 'pick' ? ' is-pick' : ''), 'aria-pressed': String(on), text: x.title, title: stName(x.status, x.board), onclick: function () {
            var k = it.links.indexOf(x.id);
            if (k >= 0) it.links.splice(k, 1); else { if (it.links.length >= MAX_LINKS) return err(m, '연결은 최대 ' + MAX_LINKS + '개입니다.'); it.links.push(x.id); }
            this.classList.toggle('on', k < 0); this.setAttribute('aria-pressed', String(k < 0));
          } }));
        });
        linkBox.appendChild(row);
      });
      // 나를 연결한 항목 (읽기 전용)
      var back = src ? S.items.filter(function (x) { return (x.links || []).indexOf(src.id) >= 0; }) : [];

      var save = function () {
        var t = title.value.trim();
        if (!t) return err(m, '제목을 적어 주세요.');
        var subs = it.subs.map(function (s) { return { t: String(s.t || '').trim().slice(0, 120), done: !!s.done }; }).filter(function (s) { return s.t; });
        var links = it.links.filter(function (l) { return itemById(l); });
        var data = { board: b.id, title: t.slice(0, 120), body: body.value.slice(0, 8000), status: it.status, subs: subs, links: links, updatedAt: FV.serverTimestamp(), updatedBy: S.mid };
        var p = src ? db.doc('mkt_items/' + src.id).update(data)
          : db.collection('mkt_items').add(Object.assign(data, { likes: [], by: S.mid, at: FV.serverTimestamp() }));
        p.then(function () { close(); toast(src ? '저장했습니다.' : '올렸습니다.'); }).catch(function (e) { fail(e, m); });
      };

      panel.appendChild(title);
      panel.appendChild(h('div', { class: 'mx-field-row' }, h('span', { class: 'label', text: '상태' }), seg));
      panel.appendChild(h('div', { class: 'field' }, h('label', { text: '내용' }), body));
      panel.appendChild(h('div', { class: 'mx-sec' },
        h('div', { class: 'mx-sec-head' }, h('span', { class: 'label', text: '세부항목 — 풀어 나갈 것' }), subCount,
          h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '+ 간단 세부항목', onclick: openQuick })),
        subBox, quickArea));
      panel.appendChild(h('div', { class: 'mx-sec' },
        h('div', { class: 'mx-sec-head' }, h('span', { class: 'label', text: '연결 — 이 생각과 이어지는 다른 보드 항목' })),
        linkBox.childNodes.length ? linkBox : h('p', { class: 'meta', text: '다른 보드에 아직 항목이 없습니다.' }),
        back.length ? h('div', { class: 'mx-linkrow back' }, h('span', { class: 'meta', text: '이 항목을 연결한 것' }),
          back.map(function (x) { return h('button', { type: 'button', class: 'mx-chip b-' + x.board, text: (BMAP[x.board] || {}).name + ' · ' + x.title, onclick: function () { detailModal(x.id); } }); })) : null));
      if (src) panel.appendChild(h('p', { class: 'meta', text: '처음 올림 ' + name(src.by) + ' · ' + when(src.at) + (src.updatedBy ? '  ·  마지막 수정 ' + name(src.updatedBy) + ' · ' + when(src.updatedAt) : '') }));
      panel.appendChild(m);
      panel.appendChild(h('div', { class: 'row sm-actions' }, btn(src ? '저장' : '올리기', save), btn('취소', close, 'btn-line'),
        src && canDelete(src) ? confirmBtn('삭제', function () {
          db.doc('mkt_items/' + src.id).delete().then(function () { close(); toast('삭제했습니다.'); }).catch(function (e) { fail(e, m); });
        }) : null));
      setTimeout(function () { (src ? panel.querySelector('.sm-x') : title).focus(); }, 0);
    });
  }
})();
