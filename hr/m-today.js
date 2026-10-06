/* fillts HR — INFO 첫 화면: 오늘의 구성원 (휴가 · 기념일 · 미팅 · 외근 · 출장 · 재택) + LIVE (구성원별 지금 상태)
   미팅·외근·출장·재택은 각 구성원의 Google 캘린더에서 가져온다 (본인 브라우저가 본인 캘린더를 읽어 hr_sched에 시간·종류만 기록).
   제목·장소·참석자는 저장하지 않는다. 휴가는 승인된 hr_away, 출퇴근은 hr_presence. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var KNAME = { meeting: '미팅', field: '외근', trip: '출장', remote: '재택' };
  var KTAG = { meeting: 'warn', field: 'ok', trip: 'ok', remote: 'mute' };
  var HALF = 13 * 60;          // 오전/오후 반차 경계
  var DAYS_AHEAD = 7;          // 오늘부터 며칠치 캘린더를 가져올지
  var TOK_KEY = 'hrGcalTok', SYNC_EVERY = 15 * 60000;
  var INSIDE_RE = /필츠|fillts|사무실|회의실|zoom|meet|teams|webex|화상|온라인|online|전화|call/i;

  /* ---------- Google 캘린더 연동 ---------- */
  var G = { syncing: false, lastAt: 0, err: '' };
  function token() {
    try { var t = JSON.parse(sessionStorage.getItem(TOK_KEY) || 'null'); return t && t.exp > Date.now() && t.email === ((S.user && S.user.email) || '').toLowerCase() ? t.v : null; } catch (e) { return null; }
  }
  function connect() {
    var u = firebase.auth().currentUser;
    if (!u) return;
    HR.googleRedirect({ calendar: true, hint: u.email });   // 같은 탭에서 Google로 이동했다가 돌아오며 토큰을 받는다 (core.js)
  }
  if (HR.gcalFresh) setTimeout(function wait() { if (S.mid) sync(true); else setTimeout(wait, 500); }, 500);   // 연결하고 돌아온 직후 동기화

  // 캘린더 일정 → { kind, date, from, to } (해당 없으면 null)
  function classify(ev) {
    if (ev.status === 'cancelled' || ev.transparency === 'transparent') return null;
    var me = (ev.attendees || []).filter(function (a) { return a.self; })[0];
    if (me && me.responseStatus === 'declined') return null;
    var type = ev.eventType || 'default', title = ev.summary || '', loc = ev.location || '';
    if (type === 'outOfOffice' || type === 'focusTime' || type === 'birthday' || type === 'fromGmail') return null;   // 휴가는 HR 휴가 기록을 쓴다
    if (type === 'workingLocation') {
      var wl = (ev.workingLocationProperties || {}).type;
      return wl === 'homeOffice' ? 'remote' : wl === 'customLocation' ? 'field' : null;
    }
    // 장소를 넣은 일정만 외근(제목에 출장이 있으면 출장)으로 본다. 장소 없는 일정 · 사무실/화상 미팅은 반영하지 않는다 (261006 대표 지시)
    if (!loc.trim() || INSIDE_RE.test(loc)) return null;
    return /출장/.test(title) ? 'trip' : 'field';
  }
  function expand(ev, kind, from, to) {
    var out = [];
    if (ev.start.date) {   // 종일: end는 다음 날(배타)
      for (var d = ev.start.date; d < ev.end.date && d <= to; d = L.addDays(d, 1)) if (d >= from) out.push({ date: d, from: '', to: '' });
    } else {
      var s = new Date(ev.start.dateTime), e = new Date(ev.end.dateTime), sd = L.kstDate(s), ed = L.kstDate(e);
      if (sd === ed || ed < sd) out.push({ date: sd, from: L.kstHM(s), to: L.kstHM(e) });
      else for (var x = sd; x <= ed && x <= to; x = L.addDays(x, 1)) out.push({ date: x, from: x === sd ? L.kstHM(s) : '', to: x === ed ? L.kstHM(e) : '' });
    }
    return out.filter(function (o) { return o.date >= from && o.date <= to; }).map(function (o) { o.kind = kind; return o; });
  }
  function hash(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }

  function sync(force) {
    var tok = token();
    if (!tok || G.syncing || !S.mid) return;
    if (!force && Date.now() - G.lastAt < SYNC_EVERY) return;
    G.syncing = true;
    var from = fmt.today(), to = L.addDays(from, DAYS_AHEAD);
    var q = 'timeMin=' + encodeURIComponent(from + 'T00:00:00+09:00') + '&timeMax=' + encodeURIComponent(L.addDays(to, 1) + 'T00:00:00+09:00') +
      '&singleEvents=true&orderBy=startTime&maxResults=250&eventTypes=default&eventTypes=workingLocation&eventTypes=outOfOffice';
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + q, { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) { try { sessionStorage.removeItem(TOK_KEY); } catch (e) { /* 무시 */ } throw { user: r.status === 403 ? '캘린더 읽기 권한이 없습니다. 연결을 다시 눌러 「캘린더 보기」를 허용하세요.' : '연결이 만료됐습니다. 다시 연결하세요.' }; }
        if (!r.ok) throw { user: '캘린더를 읽지 못했습니다 (' + r.status + ').' };
        return r.json();
      })
      .then(function (j) {
        var want = {};
        (j.items || []).forEach(function (ev) {
          var k = classify(ev);
          if (k) expand(ev, k, from, to).forEach(function (o) { o.title = String(ev.summary || '').trim().slice(0, 80); o.place = String(ev.location || '').trim().slice(0, 80); want[S.mid + '_' + o.date.replace(/-/g, '') + '_' + hash(ev.id + o.date)] = o; });
        });
        var b = db.batch(), n = 0;
        (S.sched || []).filter(function (s) { return s.memberId === S.mid && s.src === 'gcal' && !want[s.id]; }).forEach(function (s) { b.delete(db.doc('hr_sched/' + s.id)); n++; });
        Object.keys(want).forEach(function (id) {
          var o = want[id], cur = (S.sched || []).filter(function (s) { return s.id === id; })[0];
          if (cur && cur.kind === o.kind && cur.from === o.from && cur.to === o.to && cur.title === o.title && (cur.place || '') === o.place) return;
          b.set(db.doc('hr_sched/' + id), { memberId: S.mid, kind: o.kind, date: o.date, from: o.from, to: o.to, title: o.title, place: o.place, src: 'gcal', at: FV.serverTimestamp() }); n++;   // 외근은 제목·장소까지 보인다
        });
        return n ? b.commit() : null;
      })
      .then(function () { G.lastAt = Date.now(); G.err = ''; try { localStorage.setItem('hrGcalLast', String(G.lastAt)); } catch (e) { /* 무시 */ } })
      .catch(function (x) { G.err = x && x.user ? x.user : '캘린더 동기화에 실패했습니다.'; if (!(x && x.user)) console.warn(x); })
      .then(function () { G.syncing = false; HR.refresh(); });
  }
  setInterval(function () { sync(false); }, 60000);

  /* ---------- 서버 자동 동기화 (매시 정각 + 이 화면을 열 때) — 개인 연결 없이 회사 계정 캘린더를 서버가 읽는다 ---------- */
  var SRV_URL = 'https://asia-northeast3-fillts-web.cloudfunctions.net/calSyncNow';
  var SV = { busy: false, askedAt: 0, res: null };
  function serverSync() {
    var u = firebase.auth().currentUser;
    if (!u || SV.busy || Date.now() - SV.askedAt < 10 * 60000) return;
    SV.busy = true; SV.askedAt = Date.now();
    u.getIdToken().then(function (tok) { return fetch(SRV_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: '{}' }); })
      .then(function (r) { return r.json(); })
      .then(function (j) { SV.res = j; })
      .catch(function () { SV.res = { error: 'offline' }; })
      .then(function () { SV.busy = false; HR.refresh(); });
  }
  function serverOn() { return SV.res && !SV.res.error && SV.res.n > 0; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && location.hash.replace(/^#/, '').split('/')[0] === 'info') serverSync(); });

  /* ---------- 상태 계산 ---------- */
  function schedOf(mid, d) {
    return (S.sched || []).filter(function (s) { return s.memberId === mid && s.date === d; })
      .sort(function (a, b) { return (a.from || '') < (b.from || '') ? -1 : 1; });
  }
  function awayOf(mid, d) { return S.away.filter(function (a) { return a.memberId === mid && a.start <= d && a.end >= d; }); }
  function span(s) { return s.from ? s.from + (s.to ? '–' + s.to : '~') : '종일'; }
  function nowIn(s, nm) {
    if (!s.from) return true;
    var f = L.hmToMin(s.from), t = s.to ? L.hmToMin(s.to) : 24 * 60;
    return nm >= f && nm < t;
  }
  function anniv(m, t) {
    if (!m.hireDate) return null;
    if (m.hireDate === t) return '오늘 입사';
    var yrs = +t.slice(0, 4) - +m.hireDate.slice(0, 4);
    return yrs >= 1 && m.hireDate.slice(5) === t.slice(5) ? '입사 ' + yrs + '주년' : null;
  }

  // 구성원 한 명의 지금 상태 → { dot, label, sub }
  function liveOf(m, t, nm) {
    var lv = HR.att.live(m), sc = schedOf(m.id, t);
    if (lv.st === 'left') return { dot: 'out', label: '퇴사', sub: '' };
    if (lv.st === 'rest') return { dot: 'out', label: '휴직', sub: '' };
    if (lv.st === 'away') return { dot: 'away', label: '휴가', sub: HR.policy(lv.away.type).name };
    var half = awayOf(m.id, t).filter(function (a) { return (a.unit === 'am' && nm < HALF) || (a.unit === 'pm' && nm >= HALF); })[0];
    if (half) return { dot: 'away', label: half.unit === 'am' ? '오전 반차' : '오후 반차', sub: HR.policy(half.type).name };
    var trip = sc.filter(function (s) { return s.kind === 'trip' && nowIn(s, nm); })[0];
    if (trip) return { dot: 'field', label: '출장 중', sub: [trip.to ? '~' + trip.to : '', trip.title, trip.place].filter(Boolean).join(' · ') };
    var meet = sc.filter(function (s) { return s.kind === 'meeting' && nowIn(s, nm); })[0];
    if (meet) return { dot: 'meet', label: '미팅 중', sub: meet.to ? '~' + meet.to : '' };
    var field = sc.filter(function (s) { return s.kind === 'field' && nowIn(s, nm); })[0];
    if (field) return { dot: 'field', label: '외근 중', sub: [field.to ? '~' + field.to : '', field.title, field.place].filter(Boolean).join(' · ') };
    var next = sc.filter(function (s) { return s.from && L.hmToMin(s.from) > nm && s.kind !== 'remote'; })[0];
    var nextTxt = next ? '다음 ' + KNAME[next.kind] + ' ' + next.from : '';
    if (lv.st === 'in') {
      var mode = HR.att.modeName(lv.mode) || '사무실';
      return { dot: 'in', label: '근무 중', sub: [mode + ' · ' + (lv.sched ? lv.sinceHM : L.kstHM(new Date(lv.since))) + ' 출근', nextTxt].filter(Boolean).join(' · ') };
    }
    if (lv.st === 'out' && lv.today) return { dot: 'out', label: '퇴근', sub: lv.at ? L.kstHM(new Date(lv.at)) : '' };
    var remote = sc.filter(function (s) { return s.kind === 'remote'; })[0];
    return { dot: 'none', label: remote ? '재택 예정' : '미출근', sub: nextTxt };
  }

  /* ---------- 화면 ---------- */
  function calBar() {
    serverSync();
    if (serverOn() || (SV.busy && !SV.res)) {
      var r = SV.res;
      return h('div', { class: 'cal-bar' }, h('span', { class: 'meta', text: !r ? 'Google 캘린더 확인 중…'
        : 'Google 캘린더 자동 동기화 · 매시 정각 · 이 화면을 열 때 · 마지막 ' + L.kstHM(new Date(r.atMs)) + (r.total > r.n ? ' (' + r.n + '/' + r.total + '명)' : '') }),
        S.isAdmin && r && r.err ? h('span', { class: 'meta red-text', text: r.err }) : null);
    }
    var tok = token(), last = G.lastAt;
    if (!last) try { last = +localStorage.getItem('hrGcalLast') || 0; } catch (e) { /* 무시 */ }
    if (tok && !G.lastAt && !G.syncing) setTimeout(function () { sync(true); }, 0);
    return h('div', { class: 'cal-bar' },
      h('span', { class: 'meta', text: G.syncing ? '내 Google 캘린더를 읽는 중…' : tok ? '내 Google 캘린더 연결됨' + (last ? ' · ' + L.kstHM(new Date(last)) + ' 동기화' : '')
        : last ? '마지막 동기화 ' + fmt.dot(L.kstDate(new Date(last))) + ' ' + L.kstHM(new Date(last)) + ' · 새 일정을 반영하려면 다시 연결하세요' : '장소를 넣은 Google 캘린더 일정을 외근으로 가져옵니다' }),
      tok ? ui.btn('지금 동기화', function () { sync(true); }, 'btn-line btn-xs') : ui.btn('Google 캘린더 연결', connect, 'btn-xs'),
      G.err ? h('span', { class: 'meta red-text', text: G.err }) : null);
  }

  function panel() {
    var t = fmt.today(), nm = L.kstMin(new Date()), members = HR.memberList(false);
    var groups = { away: [], anniv: [], sched: [] };
    members.forEach(function (m) {
      awayOf(m.id, t).forEach(function (a) { groups.away.push(h('li', null, ui.tag(a.unit === 'am' ? '오전 반차' : a.unit === 'pm' ? '오후 반차' : '휴가', 'red'), h('span', { class: 'who', text: m.name }), h('span', { class: 'meta', text: HR.policy(a.type).name + (a.end > a.start ? ' · ' + fmt.date(a.end) + '까지' : '') }))); });
      var an = anniv(m, t);
      if (an) groups.anniv.push(h('li', null, ui.tag('기념일', 'ok'), h('span', { class: 'who', text: m.name }), h('span', { class: 'meta', text: an })));
      schedOf(m.id, t).forEach(function (s) {
        // 누르면 장소 · 지도 링크가 펼쳐진다
        var li = h('li', { class: (nowIn(s, nm) && s.kind !== 'remote' ? 'now ' : '') + (s.place ? 'has-detail' : ''), title: s.place ? '눌러서 장소 보기' : '' },
          ui.tag(KNAME[s.kind], KTAG[s.kind]), h('span', { class: 'who', text: m.name }), h('span', { class: 'meta', text: [span(s), s.title].filter(Boolean).join(' · ') }),
          s.place ? h('div', { class: 'today-detail' }, h('span', { text: '장소 · ' + s.place }), ' ', h('a', { class: 'link', href: 'https://map.naver.com/p/search/' + encodeURIComponent(s.place), target: '_blank', rel: 'noopener noreferrer', text: '지도 ↗', onclick: function (e) { e.stopPropagation(); } })) : null);
        if (s.place) li.addEventListener('click', function () { li.classList.toggle('open'); });
        groups.sched.push(li);
      });
    });
    var today = h('ul', { class: 'today-list' }, groups.away, groups.anniv, groups.sched);
    if (!today.children.length) today.appendChild(h('li', { class: 'empty', text: '오늘 휴가·기념일·미팅·외근이 없습니다.' }));
    var hol = S.hmap[t] ? h('p', { class: 'today-hol', text: '오늘은 ' + S.hmap[t] + '입니다.' }) : null;

    var board = h('div', { class: 'board live-board' }), cnt = {};
    members.forEach(function (m) {
      var s = liveOf(m, t, nm);
      cnt[s.label] = (cnt[s.label] || 0) + 1;
      board.appendChild(h('a', { class: 'board-card', href: m.id === S.mid ? '#info' : '#people/' + m.id },
        h('span', { class: 'dot ' + s.dot }), h('div', null, h('div', { class: 'who' }, m.name, ' ', h('span', { class: 'live-label ' + s.dot, text: s.label })), s.sub ? h('div', { class: 'meta', text: s.sub }) : null)));
    });
    var summary = Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ');

    return h('div', { class: 'today-wrap' },
      ui.panel('Today · 오늘의 구성원 ' + fmt.date(t), null, hol, today, calBar()),
      ui.panel('Live', h('span', { class: 'meta', text: summary }), board));
  }

  HR.today = { panel: panel, liveOf: liveOf, classify: classify, sync: sync };
})();
