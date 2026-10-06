/* fillts HR — INFO 첫 화면: 오늘의 구성원 (휴가 · 기념일 · 외근 · 미팅 · 출장 · 재택) + LIVE (구성원별 지금 상태)
   외근·미팅·출장·재택은 구성원이 직접 등록한다 (hr_sched, 전 구성원 공개). 휴가는 승인된 hr_away, 출퇴근은 hr_presence. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var KINDS = [['meeting', '미팅'], ['field', '외근'], ['trip', '출장'], ['remote', '재택']];
  var KNAME = { meeting: '미팅', field: '외근', trip: '출장', remote: '재택' };
  var KTAG = { meeting: 'warn', field: 'ok', trip: 'ok', remote: 'mute' };
  var HALF = 13 * 60;   // 오전/오후 반차 경계
  var addOpen = false;  // 다시 그려도 등록 폼 펼침 상태 유지

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
    var trip = sc.filter(function (s) { return s.kind === 'trip'; })[0];
    if (trip) return { dot: 'field', label: '출장', sub: trip.title || '' };
    var meet = sc.filter(function (s) { return s.kind === 'meeting' && nowIn(s, nm); })[0];
    if (meet) return { dot: 'meet', label: '미팅 중', sub: span(meet) + (meet.title ? ' · ' + meet.title : '') };
    var field = sc.filter(function (s) { return s.kind === 'field' && nowIn(s, nm); })[0];
    if (field) return { dot: 'field', label: '외근 중', sub: span(field) + (field.title ? ' · ' + field.title : '') };
    if (lv.st === 'in') {
      var mode = HR.att.modeName(lv.mode) || '사무실';
      return { dot: 'in', label: '근무 중', sub: mode + ' · ' + (lv.sched ? lv.sinceHM + ' 자동 출근' : L.kstHM(new Date(lv.since)) + ' 출근') };
    }
    var next = sc.filter(function (s) { return s.from && L.hmToMin(s.from) > nm; })[0];
    if (lv.st === 'out' && lv.today) return { dot: 'out', label: '퇴근', sub: lv.at ? L.kstHM(new Date(lv.at)) : '' };
    var remote = sc.filter(function (s) { return s.kind === 'remote'; })[0];
    return { dot: 'none', label: remote ? '재택 예정' : '미출근', sub: next ? '다음 ' + KNAME[next.kind] + ' ' + next.from : '' };
  }

  function addForm() {
    var t = fmt.today();
    var kind = ui.select(KINDS, 'meeting', { 'aria-label': '종류' }), date = ui.input({ type: 'date', value: t, 'aria-label': '날짜' });
    var from = ui.input({ type: 'time', 'aria-label': '시작' }), to = ui.input({ type: 'time', 'aria-label': '종료' });
    var title = ui.input({ maxlength: '60', placeholder: '예: 성수 OEM 미팅, 코엑스 박람회', 'aria-label': '내용' }), m = ui.msg();
    var f = h('form', { class: 'today-form' },
      h('div', { class: 'row' }, ui.field('종류', kind), ui.field('날짜', date), ui.field('시작', from), ui.field('종료', to)),
      ui.field('내용 (전 구성원 공개)', title), m, h('button', { class: 'btn btn-sm', type: 'submit', text: '일정 등록' }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!date.value) return ui.err(m, '날짜를 고르세요.');
      if (from.value && to.value && to.value <= from.value) return ui.err(m, '종료 시각이 시작보다 늦어야 합니다.');
      if (kind.value === 'meeting' && !from.value) return ui.err(m, '미팅은 시작 시각을 입력하세요.');
      db.collection('hr_sched').add({ memberId: S.mid, kind: kind.value, date: date.value, from: from.value || '', to: to.value || '', title: title.value.trim(), at: FV.serverTimestamp() })
        .then(function () { title.value = ''; from.value = ''; to.value = ''; ui.toast(KNAME[kind.value] + ' 일정을 등록했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    });
    return f;
  }

  function panel() {
    var t = fmt.today(), nm = L.kstMin(new Date()), members = HR.memberList(false);
    // 오늘 — 이벤트 목록
    var groups = { away: [], anniv: [], sched: [] };
    members.forEach(function (m) {
      awayOf(m.id, t).forEach(function (a) { groups.away.push(h('li', null, ui.tag(a.unit === 'am' ? '오전 반차' : a.unit === 'pm' ? '오후 반차' : '휴가', 'red'), h('span', { class: 'who', text: m.name }), h('span', { class: 'meta', text: HR.policy(a.type).name + (a.unit === 'hours' ? ' · 시간 단위' : '') + (a.end > a.start ? ' · ' + fmt.date(a.end) + '까지' : '') }))); });
      var an = anniv(m, t);
      if (an) groups.anniv.push(h('li', null, ui.tag('기념일', 'ok'), h('span', { class: 'who', text: m.name }), h('span', { class: 'meta', text: an })));
      schedOf(m.id, t).forEach(function (s) {
        groups.sched.push(h('li', { class: nowIn(s, nm) && s.kind !== 'remote' ? 'now' : '' }, ui.tag(KNAME[s.kind], KTAG[s.kind]), h('span', { class: 'who', text: m.name }),
          h('span', { class: 'meta', text: span(s) + (s.title ? ' · ' + s.title : '') }),
          s.memberId === S.mid ? ui.confirmBtn('삭제', function () { db.doc('hr_sched/' + s.id).delete().catch(ui.fail); }) : null));
      });
    });
    var today = h('ul', { class: 'today-list' }, groups.away, groups.anniv, groups.sched);
    if (!today.children.length) today.appendChild(h('li', { class: 'empty', text: '오늘 휴가·기념일·외근·미팅 일정이 없습니다.' }));
    var hol = S.hmap[t] ? h('p', { class: 'today-hol', text: '오늘은 ' + S.hmap[t] + '입니다.' }) : null;

    // 내 앞으로의 일정 (오늘 이후)
    var mine = (S.sched || []).filter(function (s) { return s.memberId === S.mid && s.date > t; }).sort(function (a, b) { return (a.date + a.from) < (b.date + b.from) ? -1 : 1; });
    var ml = mine.length ? h('ul', { class: 'today-list small' }, mine.slice(0, 5).map(function (s) {
      return h('li', null, ui.tag(KNAME[s.kind], KTAG[s.kind]), h('span', { class: 'meta', text: fmt.date(s.date) + ' ' + span(s) + (s.title ? ' · ' + s.title : '') }),
        ui.confirmBtn('삭제', function () { db.doc('hr_sched/' + s.id).delete().catch(ui.fail); }));
    })) : null;
    var formWrap = h('details', { class: 'today-add', open: addOpen, ontoggle: function () { addOpen = formWrap.open; } }, h('summary', { text: '+ 내 외근 · 미팅 · 출장 · 재택 등록' }), addForm(), ml ? h('div', null, h('div', { class: 'label', text: 'My upcoming' }), ml) : null);

    // LIVE — 구성원별 지금 상태
    var board = h('div', { class: 'board live-board' }), cnt = {};
    members.forEach(function (m) {
      var s = liveOf(m, t, nm);
      cnt[s.label] = (cnt[s.label] || 0) + 1;
      board.appendChild(h('a', { class: 'board-card', href: m.id === S.mid ? '#info' : '#people/' + m.id },
        h('span', { class: 'dot ' + s.dot }), h('div', null, h('div', { class: 'who' }, m.name, ' ', h('span', { class: 'live-label ' + s.dot, text: s.label })), h('div', { class: 'meta', text: s.sub }))));
    });
    var summary = Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ');

    return h('div', { class: 'today-wrap' },
      ui.panel('Today · 오늘의 구성원 ' + fmt.date(t), null, hol, today, formWrap),
      ui.panel('Live', h('span', { class: 'meta', text: summary }), board));
  }

  HR.today = { panel: panel, liveOf: liveOf };
})();
