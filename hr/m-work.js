/* fillts HR — 3) 근무: 출퇴근 · 근무 기록 · 팀 현황 · 정정 요청 */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV, A = HR.att;
  var T = { who: null, month: null, data: null, req: 0, all: null };
  var mode = 'office';
  try { mode = localStorage.getItem('hrMode') || 'office'; } catch (e) { /* 무시 */ }

  /* ---------- 출퇴근 ---------- */
  /* 출근 위치 제한: 설정 › 회사 기준의 요일(기본 월~목)에는 사무실 반경 안에서만 출근. 퇴근·신청은 제한 없음 */
  function geoRule(date) {
    var g = S.cfg.geo;
    if (!g || !g.on || !g.lat || !g.lng) return null;
    var wd = L.weekday(date);   // 0=일 … 6=토
    return (g.days || [1, 2, 3, 4]).indexOf(wd) >= 0 ? g : null;
  }
  function distM(a, b, c, d) {
    var R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)));
  }
  function checkGeo(g) {
    return new Promise(function (ok, no) {
      if (!navigator.geolocation) return no({ user: '이 브라우저는 위치 확인을 지원하지 않습니다.' });
      navigator.geolocation.getCurrentPosition(function (p) {
        var d = distM(p.coords.latitude, p.coords.longitude, +g.lat, +g.lng), acc = Math.min(p.coords.accuracy || 0, 150);
        if (d - acc <= (+g.radius || 500)) ok(d);
        else no({ user: (g.label || '사무실') + ' 반경 ' + (+g.radius || 500) + 'm 안에서만 출근할 수 있습니다. 지금 약 ' + (d >= 1000 ? (d / 1000).toFixed(1) + 'km' : d + 'm') + ' 떨어져 있습니다. (금요일·외근은 관리자에게 문의)' });
      }, function (e) {
        no({ user: e.code === 1 ? '위치 권한이 꺼져 있습니다. 브라우저 설정에서 fillts.com의 위치 접근을 허용한 뒤 다시 누르세요.' : '현재 위치를 확인하지 못했습니다. 잠시 후 다시 누르세요.' });
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
  }
  function punch(kind, btns, msgEl) {
    var t = fmt.today(), date = t, pres = S.presence[S.mid];
    if (kind === 'out' && pres && pres.state === 'in' && pres.dk && L.daysBetween(fmt.dkToDate(pres.dk), t) <= 1) date = fmt.dkToDate(pres.dk); // 퇴근은 출근일에 귀속 (자정 넘김 포함)
    btns.forEach(function (b) { b.disabled = true; });
    var g = kind === 'in' ? geoRule(date) : null;
    if (g) msgEl.textContent = '위치를 확인하는 중…';
    (g ? checkGeo(g) : Promise.resolve(null)).then(function (dist) { msgEl.textContent = ''; write(kind, date, dist, btns, msgEl); })
      .catch(function (x) { ui.err(msgEl, x.user || '위치를 확인하지 못했습니다.'); btns.forEach(function (y) { y.disabled = false; }); });
  }
  function write(kind, date, dist, btns, msgEl) {
    var b = db.batch(), rec = { memberId: S.mid, kind: kind, mode: mode, dk: fmt.dk(date), ym: fmt.ymNum(date), at: FV.serverTimestamp(), uid: S.user.uid };
    if (dist != null) rec.geo = dist;
    b.set(db.collection('hr_punch').doc(), rec);
    b.set(db.doc('hr_presence/' + S.mid), { state: kind, mode: mode, dk: fmt.dk(date), at: FV.serverTimestamp() });
    b.commit().then(function () { ui.toast(kind === 'in' ? A.modeName(mode) + ' 출근을 기록했습니다.' : '퇴근을 기록했습니다. 수고하셨습니다.'); })
      .catch(function (e) { ui.fail(e, msgEl); btns.forEach(function (x) { x.disabled = false; }); });
  }
  function punchCard() {
    var t = fmt.today(), me = S.members[S.mid] || {}, live = A.live(me);
    var days = A.days(S.myPunches, S.myFixes, { member: me, from: L.addDays(t, -1), to: t, leaves: HR.leavesOf(S.mid) });
    var head = ui.label('Today · ' + fmt.date(t)), clock = h('div', { class: 'clock', id: 'clock', text: L.kstHM(new Date()) });
    var state = h('div', { class: 'punch-state' });
    var working = live.st === 'in';
    var autoOutToday = live.st === 'out' && live.auto && live.today;
    var td = days[working || autoOutToday ? fmt.dkToDate(live.dk) : t];
    var ah = +S.cfg.autoOutHours || 0;
    if (working) state.append('근무 중 · ', h('b', { text: (td && td.inHM) || live.sinceHM || '' }), ' 출근 · ' + A.modeName(live.mode) + (live.until ? ' · ' + L.kstHM(new Date(live.until)) + ' 자동 퇴근' : ''));
    else if (autoOutToday) state.append('자동 퇴근 처리 · ', h('b', { text: (td ? td.inHM : '') + ' – ' + L.kstHM(new Date(live.at)) }), ' · 더 일했다면 퇴근을 눌러 실제 시각을 남기세요');
    else if (td && td.outHM) state.append('오늘 ', h('b', { text: td.inHM + ' – ' + td.outHM }), ' · 근로 ' + L.minToHM(td.calc ? td.calc.work : 0));
    else state.append(S.hmap[t] ? S.hmap[t] + ' · 쉬는 날입니다' : '아직 출근 기록이 없습니다');
    var msgEl = ui.msg();
    var bIn = ui.btn('출근', null), bOut = ui.btn('퇴근', null, 'btn-line');
    var holToday = !L.isWorkday(t, S.hmap), holOk = otsOf(S.mid, t).some(function (o) { return o.kind === 'hol' && o.status === 'approved'; });
    bIn.disabled = working || autoOutToday || !!days[t] || (holToday && !holOk);
    if (holToday && !holOk && !working) { ui.clear(state); state.append((S.hmap[t] ? S.hmap[t] + ' · ' : '') + '쉬는 날입니다 · 휴일근무는 사전 승인 후 출근할 수 있습니다'); } bOut.disabled = !working && !autoOutToday;
    bIn.onclick = function () { punch('in', [bIn, bOut], msgEl); };
    bOut.onclick = function () { punch('out', [bIn, bOut], msgEl); };
    var modes = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '근무 형태' });
    [['office', '사무실'], ['remote', '재택'], ['field', '외근']].forEach(function (m) {
      modes.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(mode === m[0]), class: mode === m[0] ? 'on' : '', text: m[1], disabled: working ? true : null,
        onclick: function () { mode = m[0]; try { localStorage.setItem('hrMode', mode); } catch (e) { /* 무시 */ } HR.refresh(); } }));
    });
    return h('section', { class: 'panel punch' },
      h('div', { class: 'panel-head' }, head, modes), clock,
      state, h('div', { class: 'row' }, bIn, bOut), msgEl,
      ah ? h('p', { class: 'muted small', text: '출근 후 ' + ah + '시간이 지나면 자동 퇴근 처리됩니다. 휴게시간은 법정 기준으로 자동 공제합니다.' }) : null,
      geoRule(t) ? h('p', { class: 'muted small', text: '오늘은 ' + (S.cfg.geo.label || '사무실') + ' 반경 ' + (S.cfg.geo.radius || 500) + 'm 안에서만 출근 버튼이 기록됩니다' }) : null);
  }
  function weekPanel() {
    var t = fmt.today(), mon = L.mondayOf(t), days = A.days(S.myPunches, S.myFixes, { member: S.members[S.mid], from: mon, to: L.addDays(mon, 6), leaves: HR.leavesOf(S.mid) }), w = A.week(days, mon);
    var fillEl = h('div', { class: 'meter-fill' + (w.total > 3120 ? ' over52' : w.total > 2400 ? ' over40' : '') });
    fillEl.style.width = Math.min(100, w.total / 3600 * 100) + '%';
    return ui.panel('This week', h('span', { class: 'mono', text: L.minToHM(w.total) + ' / 52:00' }),
      h('div', { class: 'meter' }, fillEl, h('span', { class: 'meter-tick t40', text: '40h' }), h('span', { class: 'meter-tick t52', text: '52h' })),
      ui.kv([['근로', L.minToHM(w.total)], ['연장', L.minToHM(w.ot)], ['야간', L.minToHM(w.night)], ['휴일', L.minToHM(w.hol8 + w.holOver)]]),
      w.over52 ? h('p', { class: 'form-msg', text: '주 52시간을 넘었습니다. 리더와 일정을 조정하세요 (근로기준법 제53조).' }) : null);
  }
  HR.work = { punchCard: punchCard, weekPanel: weekPanel };

  /* ---------- 월 근무 기록 ---------- */
  function load() {
    var who = T.who, ym = T.month, req = ++T.req;
    var yms = [fmt.ymNum(fmt.ymShift(ym, -1)), fmt.ymNum(ym), fmt.ymNum(fmt.ymShift(ym, 1))];
    var jobs = [
      db.collection('hr_punch').where('memberId', '==', who).where('ym', 'in', yms).get(),
      db.collection('hr_fix').where('memberId', '==', who).get(),
      (S.isAdmin || who === S.mid) ? db.doc('hr_pay/' + who).get() : Promise.resolve(null)
    ];
    T.data = null;
    Promise.all(jobs).then(function (r) {
      if (req !== T.req) return;
      T.data = { punches: HR.rows(r[0]), fixes: HR.rows(r[1]), pay: r[2] && r[2].exists ? r[2].data() : null, key: who + ym };
      HR.refresh();
    }).catch(function (e) { ui.fail(e); });
  }
  function model(punches, fixes, leaves, ym, member) {
    var md = L.monthDays(ym), weeks = [], seen = {};
    var days = A.days(punches, fixes, { member: member, from: L.mondayOf(md[0]), to: L.addDays(md[md.length - 1], 6), leaves: leaves });
    md.forEach(function (d) { var m = L.mondayOf(d); if (!seen[m]) { seen[m] = 1; weeks.push(m); } });
    // 주 단위 연장·휴일·52h는 그 주 일요일이 속한 달에 귀속
    var wk = weeks.map(function (m) { var w = A.week(days, m); w.count = L.addDays(m, 6).slice(0, 7) === ym; return w; });
    var tot = { work: 0, ot: 0, night: 0, hol: 0, bad: 0, n: 0 };
    md.forEach(function (d) { var c = days[d] && days[d].calc; if (c) { tot.work += c.work; tot.n++; } });
    wk.forEach(function (w) { if (w.count) { tot.ot += w.ot; tot.night += w.night; tot.hol += w.hol8 + w.holOver; if (w.over52) tot.bad++; } });
    return { days: days, md: md, weeks: wk, tot: tot, leaves: leaves };
  }

  function mine(view) {
    var t = fmt.today();
    if (!T.who) T.who = S.mid;
    if (!T.month) T.month = t.slice(0, 7);
    if (!T.data || T.data.key !== T.who + T.month) { if (!T.data || T.data.key !== T.who + T.month) load(); }
    // 본인 데이터는 실시간 구독 값을 우선 사용
    var self = T.who === S.mid;
    var punches = self ? S.myPunches : (T.data && T.data.punches) || [];
    var fixes = self ? S.myFixes : (T.data && T.data.fixes) || [];
    if (self && T.data && T.month !== t.slice(0, 7)) { punches = T.data.punches; fixes = T.data.fixes; }
    var leaves = HR.leavesOf(T.who);
    var M = model(punches, fixes, leaves, T.month, S.members[T.who]);
    var pay = (T.data && T.data.pay) || (self ? S.pay[S.mid] : null), rate = L.hourlyRate(pay, S.cfg), premium = 0;
    M.weeks.forEach(function (w) { if (w.count) premium += L.premiumPay(w, rate, S.cfg); });

    var whoSel = S.isLead ? ui.select(HR.memberList(true).map(function (m) { return [m.id, m.name]; }), T.who, { id: 'wkWho', onchange: function () { T.who = this.value; HR.refresh(); } }) : null;
    var monthIn = ui.input({ id: 'wkMonth', type: 'month', value: T.month, onchange: function () { if (this.value) { T.month = this.value; HR.refresh(); } } });
    var top = h('div', { class: 'two-col' }, self ? h('div', { class: 'stack' }, punchCard()) : null, self ? h('div', { class: 'stack' }, weekPanel()) : null);

    var summary = h('dl', { class: 'summary' });
    [['근로', L.minToHM(M.tot.work)], ['연장', L.minToHM(M.tot.ot)], ['야간', L.minToHM(M.tot.night)], ['휴일', L.minToHM(M.tot.hol)],
      ['52시간 초과', M.tot.bad + '주', M.tot.bad ? 'red' : ''], ['가산수당 추정', rate ? fmt.won(premium) : '급여 미등록']].forEach(function (p) {
      summary.appendChild(h('div', null, h('dt', { text: p[0] }), h('dd', { class: p[2] || '', text: p[1] })));
    });

    var tb = h('table', { class: 'table' });
    tb.appendChild(h('thead', null, h('tr', null, ['날짜', '구분', '형태', '출근', '퇴근', '휴게', '근로', '8h 초과', '야간', '상태', ''].map(function (x, i) { return h('th', { class: i >= 5 && i <= 8 ? 'num' : '', text: x }); }))));
    var body = h('tbody');
    M.md.forEach(function (d) {
      var r = M.days[d], c = r && r.calc, hol = L.holidayName(d, S.cfg, S.hmap), sat = L.weekday(d) === 6, lv = A.leaveOn(M.leaves, d);
      var pf = fixes.filter(function (f) { return f.date === d && f.status === 'pending'; })[0];
      var dayOts = otsOf(T.who, d).filter(function (o) { return o.status !== 'canceled'; });
      var st = lv ? ui.tag(HR.policy(lv.type).name + (lv.unit && lv.unit !== 'day' ? ' ' + HR.unitText(lv) : ''), 'red')
        : r && r.blocked ? ui.tag('휴일근무 미승인 · 미반영', 'red')
        : pf ? ui.tag('정정 대기', 'warn') : r && r.src === 'fix' ? ui.tag('정정됨', 'ok')
        : r && r.open && d < t ? ui.tag('퇴근 누락', 'red') : r && r.open ? ui.tag('근무 중', 'ok')
        : (!r && !hol && !sat && d < t && !S.hmap[d]) ? ui.tag('기록 없음', 'mute') : null;
      body.appendChild(h('tr', { class: (hol || S.hmap[d] ? 'hol ' : '') + (d === t ? 'today' : '') },
        h('td', { text: fmt.date(d) }), h('td', { class: 'muted', text: S.hmap[d] || hol || (sat ? '휴무일' : '') }),
        h('td', { class: 'muted', text: r ? A.modeName(r.mode) : '' }),
        h('td', { text: r ? r.inHM : '' }), h('td', { text: r ? r.outHM : '' }),
        h('td', { class: 'num', text: c ? L.minToHM(c.brk) + (c.autoBrk && c.brk ? '*' : '') : '' }),
        h('td', { class: 'num', text: c ? L.minToHM(c.work) : '' }),
        h('td', { class: 'num', text: c && !hol && c.work > 480 ? L.minToHM(c.work - 480) : '' }),
        h('td', { class: 'num', text: c && c.night ? L.minToHM(c.night) : '' }),
        h('td', null, st, r && r.capped ? ui.tag('승인 범위까지 반영', 'mute') : null, dayOts.map(otTag)),
        h('td', { class: 'wk-actions' }, self && d <= t && !pf ? h('button', { class: 'btn btn-line btn-xs', type: 'button', text: '정정', onclick: function () { openFix(view, d, r); } }) : null,
          self ? otButtons(view, d, t) : null)));
      if (L.weekday(d) === 0 || d === M.md[M.md.length - 1]) {
        var w = M.weeks.filter(function (x) { return x.monday === L.mondayOf(d); })[0];
        if (w) body.appendChild(h('tr', { class: 'weekrow' + (w.over52 ? ' bad' : '') }, h('td', { colspan: '11',
          text: '주간 ' + fmt.date(w.monday) + ' – ' + fmt.date(L.addDays(w.monday, 6)) + '  ·  총 ' + L.minToHM(w.total) + '  ·  연장 ' + L.minToHM(w.ot) + '  ·  휴일 ' + L.minToHM(w.hol8 + w.holOver) + (w.over52 ? '  ·  주 52시간 초과' : '') + (!w.count ? '  ·  다음 달 정산' : '') })));
      }
    });
    tb.appendChild(body);

    ui.put(view, 
      self ? top : null,
      h('div', { class: 'toolbar' }, whoSel ? ui.field('구성원', whoSel, 'inline') : null, ui.field('월', monthIn, 'inline'),
        ui.btn('CSV 내보내기', function () { csv([{ m: S.members[T.who] || { name: '' }, M: M }], T.month); }, 'btn-line btn-sm')),
      summary,
      h('div', { class: 'table-wrap', id: 'wkTable' }, tb),
      h('p', { class: 'note', text: '* 휴게시간 기록이 없으면 법정 최소치(4시간 근로 30분, 8시간 근로 1시간)를 자동 공제합니다 (제54조). 연장 = 1일 8시간·주 40시간 초과분, 야간 = 22:00~06:00, 휴일 = 주휴일·공휴일 근로 (제56조). 출퇴근 기록은 서버 시각으로 저장되며 수정할 수 없고, 정정은 승인 이력으로 남습니다.' }));
  }

  var fixPanel;
  function openFix(view, date, r) {
    if (fixPanel) fixPanel.remove();
    var inI = ui.input({ type: 'time', value: r && r.inHM ? r.inHM : S.cfg.workStart, id: 'fxIn' });
    var outI = ui.input({ type: 'time', value: r && r.outHM ? r.outHM : S.cfg.workEnd, id: 'fxOut' });
    var brkI = ui.input({ type: 'number', min: '0', max: '240', step: '10', placeholder: '자동', id: 'fxBrk' });
    var rsn = ui.input({ maxlength: '200', placeholder: '예: 외근 후 바로 퇴근', id: 'fxReason' });
    var m = ui.msg();
    fixPanel = h('form', { class: 'panel' },
      h('div', { class: 'panel-head' }, ui.label('Correction · ' + fmt.date(date)), h('a', { href: '#', class: 'link', text: '닫기', onclick: function (e) { e.preventDefault(); fixPanel.remove(); fixPanel = null; } })),
      h('div', { class: 'row' }, ui.field('출근', inI), ui.field('퇴근', outI), ui.field('휴게(분)', brkI)),
      ui.field('사유', rsn), m, h('button', { class: 'btn btn-sm', type: 'submit', text: '정정 요청' }));
    fixPanel.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!rsn.value.trim()) return ui.err(m, '사유를 입력하세요.');
      var d = { memberId: S.mid, date: date, in: inI.value, out: outI.value, brk: brkI.value === '' ? '' : +brkI.value, reason: rsn.value.trim(), status: 'pending', createdAt: FV.serverTimestamp() };   // 관리자 본인 것도 승인을 거친다
      db.collection('hr_fix').add(d).then(function () { fixPanel.remove(); fixPanel = null; ui.toast('정정 요청을 보냈습니다. 관리자가 승인하면 반영됩니다.'); T.data = null; HR.refresh(); })
        .catch(function (x) { ui.fail(x, m); });
    });
    view.querySelector('#wkTable').after(fixPanel);
    inI.focus();
  }

  /* ---------- 팀 현황 ---------- */
  function team(view) {
    var t = fmt.today(), ym = T.month || t.slice(0, 7);
    var board = h('div', { class: 'board' });
    var counts = { in: 0, away: 0, out: 0, none: 0 };
    HR.memberList(false).forEach(function (m) {
      var lv = A.live(m), st = lv.st === 'in' || lv.st === 'away' || lv.st === 'out' ? lv.st : 'none', sub = '미출근';
      if (lv.st === 'away') sub = HR.policy(lv.away.type).name;
      else if (lv.st === 'in') sub = (lv.sched ? lv.sinceHM : L.kstHM(new Date(lv.since))) + ' · ' + A.modeName(lv.mode);
      else if (lv.st === 'out') sub = lv.auto ? '자동 퇴근' : '퇴근';
      if (lv.st === 'out' && !lv.today) { st = 'none'; sub = '미출근'; }
      counts[st]++;
      board.appendChild(h('a', { class: 'board-card', href: '#people/' + m.id }, h('span', { class: 'dot ' + st }), h('div', null, h('div', { class: 'who', text: m.name }), h('div', { class: 'meta', text: sub }))));
    });
    var key = 'teamMonth:' + ym;
    var data = HR.load(key, function () {
      var yms = [fmt.ymNum(fmt.ymShift(ym, -1)), fmt.ymNum(ym), fmt.ymNum(fmt.ymShift(ym, 1))];
      return Promise.all([db.collection('hr_punch').where('ym', 'in', yms).get(), db.collection('hr_fix').where('status', '==', 'approved').get()])
        .then(function (r) { return { ps: HR.rows(r[0]), fx: HR.rows(r[1]) }; });
    });
    var tb = h('table', { class: 'table' });
    tb.appendChild(h('thead', null, h('tr', null, ['구성원', '근로', '연장', '야간', '휴일', '52h 초과', '기록일'].map(function (x, i) { return h('th', { class: i ? 'num' : '', text: x }); }))));
    var body = h('tbody'), all = [];
    if (data) HR.memberList(true).forEach(function (m) {
      var M = model(data.ps.filter(function (p) { return p.memberId === m.id; }), data.fx.filter(function (f) { return f.memberId === m.id; }), HR.leavesOf(m.id), ym, m);
      all.push({ m: m, M: M });
      body.appendChild(h('tr', { class: 'clickable' + (M.tot.bad ? ' warnrow' : ''), onclick: function () { T.who = m.id; T.month = ym; HR.go('work'); } },
        h('td', { text: m.name }), h('td', { class: 'num', text: L.minToHM(M.tot.work) }), h('td', { class: 'num', text: L.minToHM(M.tot.ot) }),
        h('td', { class: 'num', text: L.minToHM(M.tot.night) }), h('td', { class: 'num', text: L.minToHM(M.tot.hol) }),
        h('td', { class: 'num', text: M.tot.bad ? M.tot.bad + '주' : '' }), h('td', { class: 'num', text: M.tot.n + '일' })));
    });
    tb.appendChild(body);
    ui.put(view, 
      ui.panel('Today', h('span', { class: 'muted small', text: '근무 ' + counts.in + ' · 휴가 ' + counts.away + ' · 퇴근 ' + counts.out + ' · 미출근 ' + counts.none }), board),
      h('div', { class: 'toolbar' }, ui.field('월', ui.input({ type: 'month', value: ym, id: 'tmMonth', onchange: function () { if (this.value) { T.month = this.value; HR.refresh(); } } }), 'inline'),
        ui.btn('전체 CSV', function () { csv(all, ym); }, 'btn-line btn-sm')),
      h('div', { class: 'table-wrap' }, data ? tb : ui.empty('불러오는 중…')));
  }

  /* ---------- 정정 요청 ---------- */
  function fixItem(f, approve) {
    var st = { pending: ['대기', 'warn'], approved: ['승인', 'ok'], rejected: ['반려', 'red'], canceled: ['취소', 'mute'] }[f.status] || ['', 'mute'];
    return h('li', null,
      h('div', { class: 'grow' }, h('div', null, ui.tag(st[0], st[1]), ' ', (approve ? HR.name(f.memberId) + ' · ' : '') + fmt.date(f.date) + ' ' + f.in + ' – ' + f.out), h('div', { class: 'meta', text: f.reason })),
      approve ? h('div', { class: 'actions' },
        ui.btn('승인', function () { decide(f, 'approved'); }, 'btn-xs'), ui.btn('반려', function () { decide(f, 'rejected'); }, 'btn-line btn-xs'))
        : f.status === 'pending' ? ui.btn('취소', function () { db.doc('hr_fix/' + f.id).update({ status: 'canceled' }).catch(ui.fail); }, 'btn-line btn-xs') : null);
  }
  function decide(f, st) {
    db.doc('hr_fix/' + f.id).update({ status: st, decidedBy: S.mid, decidedAt: FV.serverTimestamp() })
      .then(function () { ui.toast(st === 'approved' ? '승인했습니다.' : '반려했습니다.'); HR.invalidate('teamMonth'); }).catch(ui.fail);
  }
  HR.work.fixItem = fixItem;

  /* ---------- 연장 · 야간 · 휴일근무 사전 신청 (관리자 승인분만 근무로 인정) ---------- */
  var OTK = { ot: '연장근무', night: '야간근무', hol: '휴일근무' };
  var OTS = { pending: ['승인 대기', 'warn'], approved: ['승인', 'ok'], rejected: ['반려', 'red'], canceled: ['취소', 'mute'] };
  function otsOf(mid, date) { return (S.ots || []).filter(function (o) { return o.memberId === mid && (!date || o.date === date); }); }
  function otRange(o) { return o.from + '–' + o.to + (L.hmToMin(o.to) <= L.hmToMin(o.from) ? '(+1)' : ''); }
  function otTag(o) { var st = OTS[o.status] || ['', 'mute']; return ui.tag(OTK[o.kind].replace('근무', '') + ' ' + st[0] + ' ' + otRange(o), st[1]); }
  var otPanel;
  function openOt(view, date, kind) {
    if (otPanel) otPanel.remove();
    if (fixPanel) { fixPanel.remove(); fixPanel = null; }
    var def = { ot: [S.cfg.workEnd || '18:00', L.minToHM((L.hmToMin(S.cfg.workEnd || '18:00') + 120) % 1440)], night: ['22:00', '00:00'], hol: [S.cfg.workStart || '10:00', S.cfg.workEnd || '18:00'] }[kind];
    var fromI = ui.input({ type: 'time', value: def[0] }), toI = ui.input({ type: 'time', value: def[1] });
    var rsn = ui.input({ maxlength: '200', placeholder: '예: 런칭 상세페이지 마감, 해외 바이어 화상 미팅' }), m = ui.msg();
    otPanel = h('form', { class: 'panel' },
      h('div', { class: 'panel-head' }, ui.label(OTK[kind] + ' 신청 · ' + fmt.date(date)), h('a', { href: '#', class: 'link', text: '닫기', onclick: function (e) { e.preventDefault(); otPanel.remove(); otPanel = null; } })),
      h('div', { class: 'row' }, ui.field('시작', fromI), ui.field('종료', toI)), ui.field('사유', rsn), m,
      h('button', { class: 'btn btn-sm', type: 'submit', text: OTK[kind] + ' 신청' }),
      h('p', { class: 'muted small', text: kind === 'night' ? '22:00~06:00 근무는 승인된 시간대만 인정됩니다. 종료가 시작보다 이르면 다음 날로 봅니다.'
        : kind === 'hol' ? '휴무일·공휴일에는 승인된 휴일근무가 있어야 출근 기록이 남습니다.' : '출근 후 8시간이 지나면 자동 퇴근됩니다. 승인된 연장근무는 종료 시각까지 인정됩니다.' }));
    otPanel.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!rsn.value.trim()) return ui.err(m, '사유를 입력하세요.');
      if (!fromI.value || !toI.value || fromI.value === toI.value) return ui.err(m, '시작과 종료 시각을 확인하세요.');
      if (kind !== 'night' && toI.value < fromI.value) return ui.err(m, '종료 시각이 시작보다 늦어야 합니다.');
      if (otsOf(S.mid, date).some(function (o) { return o.kind === kind && (o.status === 'pending' || o.status === 'approved'); })) return ui.err(m, '이미 같은 날 ' + OTK[kind] + ' 신청이 있습니다.');
      db.collection('hr_ot').add({ memberId: S.mid, date: date, kind: kind, from: fromI.value, to: toI.value, reason: rsn.value.trim(), status: 'pending', createdAt: FV.serverTimestamp() })
        .then(function () { otPanel.remove(); otPanel = null; ui.toast(OTK[kind] + ' 신청을 보냈습니다. 관리자가 승인하면 반영됩니다.'); })
        .catch(function (x) { ui.fail(x, m); });
    });
    view.querySelector('#wkTable').after(otPanel);
    fromI.focus();
  }
  function otButtons(view, d, t) {
    if (d < t) return null;
    var kinds = L.isWorkday(d, S.hmap) ? ['ot', 'night'] : ['hol', 'night'];
    return kinds.map(function (k) { return h('button', { class: 'btn btn-line btn-xs', type: 'button', text: OTK[k] + ' 신청', onclick: function () { openOt(view, d, k); } }); });
  }
  function otDecide(o, st) {
    db.doc('hr_ot/' + o.id).update({ status: st, decidedBy: S.mid, decidedAt: FV.serverTimestamp() })
      .then(function () { ui.toast(st === 'approved' ? '승인했습니다.' : '반려했습니다.'); HR.invalidate('teamMonth'); }).catch(ui.fail);
  }
  function otItem(o, approve) {
    var st = OTS[o.status] || ['', 'mute'];
    return h('li', null,
      h('div', { class: 'grow' }, h('div', null, ui.tag(st[0], st[1]), ' ', (approve ? HR.name(o.memberId) + ' · ' : '') + OTK[o.kind] + ' · ' + fmt.date(o.date) + ' ' + otRange(o)), h('div', { class: 'meta', text: o.reason })),
      approve ? h('div', { class: 'actions' }, ui.btn('승인', function () { otDecide(o, 'approved'); }, 'btn-xs'), ui.btn('반려', function () { otDecide(o, 'rejected'); }, 'btn-line btn-xs'))
        : o.status === 'pending' && o.memberId === S.mid ? ui.btn('취소', function () { db.doc('hr_ot/' + o.id).update({ status: 'canceled' }).catch(ui.fail); }, 'btn-line btn-xs') : null);
  }
  HR.work.otItem = otItem;
  function otHistory(view) {
    var all = (S.ots || []).filter(function (o) { return S.isAdmin || o.memberId === S.mid; }).sort(function (a, b) { return (b.date + (b.from || '')) < (a.date + (a.from || '')) ? -1 : 1; });
    if (S.isAdmin) {
      var pend = h('ul', { class: 'list' });
      all.filter(function (o) { return o.status === 'pending'; }).forEach(function (o) { pend.appendChild(otItem(o, true)); });
      if (!pend.children.length) pend.appendChild(h('li', { class: 'empty', text: '대기 중인 신청이 없습니다.' }));
      ui.put(view, ui.panel('Pending approval', null, pend));
    }
    var tb = h('table', { class: 'table' });
    tb.appendChild(h('thead', null, h('tr', null, ['근무일', '구성원', '구분', '시간', '사유', '상태', '신청', '처리'].map(function (x) { return h('th', { text: x }); }))));
    var body = h('tbody');
    all.forEach(function (o) {
      var st = OTS[o.status] || ['', 'mute'];
      body.appendChild(h('tr', null, h('td', { text: fmt.date(o.date) + ' ' + o.date.slice(0, 4) }), h('td', { text: HR.name(o.memberId) }), h('td', { text: OTK[o.kind] }),
        h('td', { text: otRange(o) }), h('td', { class: 'muted small', text: o.reason }), h('td', null, ui.tag(st[0], st[1])),
        h('td', { class: 'muted small', text: fmt.ts(o.createdAt) }),
        h('td', { class: 'muted small', text: o.decidedBy ? HR.name(o.decidedBy) + ' · ' + fmt.ts(o.decidedAt) : '' })));
    });
    if (!all.length) body.appendChild(h('tr', null, h('td', { colspan: '8', class: 'empty', text: '연장·야간·휴일근무 신청 내역이 없습니다. 내 근무 표의 날짜 옆 버튼으로 신청합니다.' })));
    tb.appendChild(body);
    ui.put(view, ui.panel('History · 전체 내역', null, h('div', { class: 'table-wrap flat' }, tb)),
      h('p', { class: 'note', text: '출근 후 8시간이 지나면 자동 퇴근됩니다. 연장(8시간 초과)·야간(22:00~06:00)·휴일(휴무일·공휴일) 근무는 사전에 신청해 관리자가 승인한 시간대만 근무 기록에 반영됩니다. 신청·승인·반려·취소 이력은 모두 남습니다.' }));
  }

  function fixes(view) {
    var pend = h('ul', { class: 'list' }), my = h('ul', { class: 'list' });
    if (S.isAdmin) {   // 근태 정정은 관리자만 승인 (본인 것 포함)
      S.fixes.forEach(function (f) { pend.appendChild(fixItem(f, true)); });
      if (!pend.children.length) pend.appendChild(h('li', { class: 'empty', text: '대기 중인 정정 요청이 없습니다.' }));
    }
    S.myFixes.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (f) { my.appendChild(fixItem(f, false)); });
    if (!my.children.length) my.appendChild(h('li', { class: 'empty', text: '정정 요청 내역이 없습니다. 근무 기록 표의 「정정」으로 요청합니다.' }));
    ui.put(view, h('div', { class: 'two-col' }, S.isAdmin ? ui.panel('Pending approval', null, pend) : null, ui.panel('My requests', null, my)));
  }

  /* CSV (근로기준법 제48조 임금대장 근로시간 기재 보조) */
  function csv(list, ym) {
    var lines = [['이름', '날짜', '구분', '형태', '출근', '퇴근', '휴게(분)', '근로(분)', '8h초과(분)', '야간(분)', '출처', '휴가']];
    list.forEach(function (x) {
      x.M.md.forEach(function (d) {
        var r = x.M.days[d], c = r && r.calc, lv = A.leaveOn(x.M.leaves, d), hol = L.holidayName(d, S.cfg, S.hmap);
        lines.push([x.m.name, d, hol || '', r ? A.modeName(r.mode) : '', r ? r.inHM : '', r ? r.outHM : '', c ? c.brk : '', c ? c.work : '', c && !hol ? Math.max(0, c.work - 480) : '', c ? c.night : '', r ? (r.src === 'fix' ? '정정' : '기록') : '', lv ? HR.policy(lv.type).name : '']);
      });
    });
    var text = '﻿' + lines.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: 'fillts_근태_' + ym + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  HR.register('work', {
    render: function (view, parts) {
      var sub = parts[0] || '';
      var pendingN = S.isAdmin ? S.fixes.length : 0;
      var otN = S.isAdmin ? (S.ots || []).filter(function (o) { return o.status === 'pending'; }).length : 0;
      ui.put(view, ui.head('Work', '근무'), ui.tabs([['', '내 근무'], S.isLead ? ['team', '팀 현황'] : null, ['fix', '정정 요청' + (pendingN ? ' ' + pendingN : '')], ['ot', '연장·야간·휴일 신청' + (otN ? ' ' + otN : '')]], sub, 'work'));
      if (sub === 'team' && S.isLead) team(view);
      else if (sub === 'ot') otHistory(view);
      else if (sub === 'fix') fixes(view);
      else mine(view);
    }
  });
})();
