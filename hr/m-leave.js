/* fillts HR — 4) 휴가·근태: 내 휴가 · 연차 상세 · 쉬는 날 · 팀 캘린더 · 승인 */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var F = { type: 'annual', unit: 'day', start: null, end: null, hours: 2, more: false, noReason: false, reason: '' };
  var V = { year: null, who: null, calMonth: null };

  var STATUS = { pending: ['승인 대기', 'warn'], approved: ['승인', 'ok'], rejected: ['반려', 'red'], canceled: ['취소', 'mute'] };
  function rangeText(l) { return fmt.date(l.start) + (l.end !== l.start ? ' – ' + fmt.date(l.end) : ''); }
  function canApprove(l) {
    if (S.isAdmin) return true;
    var m = S.members[l.memberId];
    return S.role === 'manager' && l.memberId !== S.mid && m && m.leaderId === S.mid;
  }
  function gcalLink(l) {
    var s = l.start.replace(/-/g, ''), e = L.addDays(l.end, 1).replace(/-/g, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(HR.name(l.memberId) + ' ' + HR.policy(l.type).name) + '&dates=' + s + '/' + e;
  }
  function leaveItem(l, opts) {
    opts = opts || {};
    var p = HR.policy(l.type), st = STATUS[l.status] || ['', 'mute'], actions = h('div', { class: 'actions' });
    if (opts.approve && l.status === 'pending' && canApprove(l)) {
      actions.append(ui.btn('승인', function () { decide(l, 'approved'); }, 'btn-xs'), ui.btn('반려', function () { decide(l, 'rejected'); }, 'btn-line btn-xs'));
    } else if (l.memberId === S.mid && l.status === 'pending') {
      actions.append(ui.btn('취소', function () { db.doc('hr_leave/' + l.id).update({ status: 'canceled' }).catch(ui.fail); }, 'btn-line btn-xs'));
    } else if (S.isAdmin && l.status === 'approved' && opts.approve) {
      actions.append(ui.confirmBtn('승인 취소', function () { decide(l, 'canceled'); }));
    }
    if (l.status === 'approved' && l.memberId === S.mid && l.end >= fmt.today()) {
      actions.append(h('a', { class: 'link', href: gcalLink(l), target: '_blank', rel: 'noopener', text: '내 캘린더에 추가' }));
    }
    return h('li', null,
      h('div', { class: 'grow' },
        h('div', null, ui.tag(st[0], st[1]), ' ', (opts.approve || l.memberId !== S.mid ? HR.name(l.memberId) + ' · ' : '') + p.name + (HR.unitText(l) ? ' ' + HR.unitText(l) : '') + ' · ' + rangeText(l) + ' · ' + fmt.days(l.days)),
        h('div', { class: 'meta', text: l.reason ? l.reason : '사유 미기재' }),
        l.status !== 'pending' && l.decidedBy ? h('div', { class: 'meta', text: '처리 ' + HR.name(l.decidedBy) + (l.decidedVia === 'slack' ? ' · Slack' : '') + ' · ' + fmt.ts(l.decidedAt) }) : null),
      actions);
  }
  function decide(l, st) {
    var b = db.batch();
    b.update(db.doc('hr_leave/' + l.id), { status: st, decidedBy: S.mid, decidedAt: FV.serverTimestamp(), decidedVia: 'web' });
    if (st === 'approved') b.set(db.doc('hr_away/' + l.id), { memberId: l.memberId, type: l.type, start: l.start, end: l.end, unit: l.unit || 'day' });
    else b.delete(db.doc('hr_away/' + l.id));
    b.commit().then(function () { ui.toast({ approved: '승인했습니다. 신청자에게 알림이 갑니다.', rejected: '반려했습니다.', canceled: '승인을 취소했습니다.' }[st]); }).catch(ui.fail);
  }
  HR.leave = { item: leaveItem };

  /* ---------- 잔여 ---------- */
  function balanceOf(p, mid) {
    var mine = HR.leavesOf(mid);
    if (p.mode === 'annual') {
      var led = HR.annualOf(mid, mine);
      if (!led) return null;
      var pend = 0; mine.forEach(function (l) { if (l.type === 'annual' && l.status === 'pending') pend += +l.days || 0; });
      return { left: led.balance, pending: L.round3(pend), granted: led.granted, used: led.used, led: led };
    }
    return L.policyBalance(p, S.members[mid], mine, fmt.today());
  }

  /* ---------- 내 휴가 ----------
     기본: 연차 / 오전 반차 / 오후 반차 (큰 버튼)
     그 외: 경조사 · 가족·출산 · 건강 · 회사 휴가 (접힌 작은 버튼) */
  var CATS = [['company', '회사 휴가'], ['family_event', '경조사'], ['family', '가족 · 출산'], ['health', '건강']];
  var CAT_OF = {
    wedding_self: 'family_event', wedding_child: 'family_event', condolence_1: 'family_event', condolence_2: 'family_event',
    family_care: 'family', infertility: 'family', paternity: 'family', maternity: 'family',
    sick: 'health', menstrual: 'health',
    refresh: 'company', longservice: 'company', special: 'company', emergency: 'company', civil: 'company'
  };
  HR.policyCat = function (p) { return p.cat || CAT_OF[p.id] || 'company'; };
  HR.LEAVE_CATS = CATS;

  function policyLine(p) {
    var b = balanceOf(p, S.mid);
    if (b && b.perRequest) return '1회 ' + fmt.days(p.days);
    if (b && b.locked) return p.mode === 'milestone' ? (b.next ? b.next.years + '년 근속 시' : '대상 아님') : p.tenureYears + '년 근속 후';
    if (b) return '잔여 ' + fmt.days(b.left);
    return '';
  }

  function mine(view) {
    var t = fmt.today();
    if (!F.start) { F.start = t; F.end = t; }
    var pa = HR.policy('annual'), ba = balanceOf(pa, S.mid);

    // 연차 잔여
    var hero = h('section', { class: 'panel leave-hero' },
      h('div', { class: 'panel-head' }, ui.label('Annual leave'), h('a', { href: '#leave/annual', class: 'link', text: '연차 상세' })),
      h('div', { class: 'big-num' }, ba ? fmt.days(ba.left) : '-', h('small', { text: '남음' })),
      h('p', { class: 'muted small', text: ba ? '발생 ' + fmt.days(ba.granted) + ' · 사용 ' + fmt.days(ba.used) + (ba.pending ? ' · 승인 대기 ' + fmt.days(ba.pending) : '') : '입사일이 등록되면 자동 계산됩니다.' }));

    // 기본 버튼: 연차 / 오전 반차 / 오후 반차
    var quick = h('div', { class: 'quick', role: 'group', 'aria-label': '연차 신청 종류' });
    [['day', '연차', '하루 이상'], ['am', '오전 반차', '0.5일'], ['pm', '오후 반차', '0.5일']].forEach(function (q) {
      var on = F.type === 'annual' && F.unit === q[0];
      quick.appendChild(h('button', { type: 'button', class: 'quick-btn' + (on ? ' on' : ''), 'aria-pressed': String(on),
        onclick: function () { F.type = 'annual'; F.unit = q[0]; if (q[0] !== 'day') F.end = F.start; HR.refresh(); } },
        h('span', { class: 'quick-name', text: q[1] }), h('span', { class: 'quick-sub', text: q[2] })));
    });

    // 신청 폼 (선택된 종류)
    var p = HR.policy(F.type), special = F.type !== 'annual';
    var units = [['day', '종일']]; if (p.half) units.push(['am', '오전 반차'], ['pm', '오후 반차']); if (p.hours) units.push(['hours', '시간 단위']);
    if (!units.some(function (u) { return u[0] === F.unit; })) F.unit = 'day';
    var unitSel = special && units.length > 1 ? ui.select(units, F.unit, { id: 'lvUnit', onchange: function () { F.unit = this.value; if (F.unit !== 'day') F.end = F.start; HR.refresh(); } }) : null;
    var sIn = ui.input({ id: 'lvStart', type: 'date', value: F.start, onchange: function () { F.start = this.value; if (F.unit !== 'day' || F.end < F.start) F.end = F.start; HR.refresh(); } });
    var eIn = ui.input({ id: 'lvEnd', type: 'date', value: F.end, onchange: function () { F.end = this.value; HR.refresh(); } });
    var hIn = ui.input({ id: 'lvHours', type: 'number', min: '1', max: '7', step: '1', value: F.hours, onchange: function () { F.hours = +this.value || 1; HR.refresh(); } });
    var reason = ui.input({ id: 'lvReason', maxlength: '200', value: F.reason, disabled: F.noReason ? true : null,
      placeholder: F.noReason ? '사유 미기재로 신청합니다' : '승인자에게만 보입니다', oninput: function () { F.reason = this.value; } });
    var noReason = h('input', { type: 'checkbox', id: 'lvNoReason', checked: F.noReason, onchange: function () { F.noReason = this.checked; HR.refresh(); } });
    var days = L.leaveDays(F.unit, F.start, F.end, F.hours, S.hmap);
    var bal = balanceOf(p, S.mid), prev = fmt.days(days) + (p.paid === false ? ' · 무급' : '');
    var problem = '';
    if (bal && bal.perRequest && days > p.days) problem = '1회 최대 ' + fmt.days(p.days) + '까지 신청할 수 있습니다.';
    else if (bal && bal.locked) problem = p.mode === 'milestone' ? (bal.next ? bal.next.years + '년 근속기념일(' + L.addYears(S.members[S.mid].hireDate, bal.next.years) + ')부터 사용할 수 있습니다.' : '사용 기간이 지났습니다.') : p.tenureYears + '년 근속 후 사용할 수 있습니다.';
    else if (bal && !bal.perRequest && bal.left != null) {
      var after = L.round3(bal.left - (bal.pending || 0) - days);
      prev += ' · 신청 후 잔여 ' + fmt.days(after);
      if (after < 0) problem = '잔여가 부족합니다. 관리자와 상의하세요.';
    }
    if (days <= 0) problem = '선택한 기간에 근무일이 없습니다.';
    var title = special ? p.name : F.unit === 'am' ? '오전 반차' : F.unit === 'pm' ? '오후 반차' : '연차';
    var m = ui.msg();
    var form = h('form', { class: 'panel', id: 'leaveForm' },
      h('div', { class: 'panel-head' }, h('h3', { class: 'form-title', text: title + ' 신청' }),
        special ? h('a', { href: '#', class: 'link', text: '연차로 돌아가기', onclick: function (e) { e.preventDefault(); F.type = 'annual'; F.unit = 'day'; HR.refresh(); } }) : null),
      special && p.note ? h('p', { class: 'muted small', text: p.note }) : null,
      special && bal && bal.current && bal.current.bonus ? h('p', { class: 'small', text: bal.current.years + '년 근속 포상금 ' + fmt.won(bal.current.bonus) + '은 급여로 별도 지급됩니다 (근로소득 과세).' }) : null,
      unitSel ? ui.field('단위', unitSel) : null,
      h('div', { class: 'row' },
        ui.field(F.unit === 'day' ? '시작일' : '날짜', sIn),
        F.unit === 'day' ? ui.field('종료일', eIn) : null,
        F.unit === 'hours' ? ui.field('시간', hIn) : null),
      ui.field('사유', reason),
      h('label', { class: 'check', for: 'lvNoReason' }, noReason, ' 사유 기재 안 함'),
      h('p', { class: 'muted small', text: prev }),
      problem ? h('p', { class: 'form-msg', text: problem }) : null, m,
      h('button', { class: 'btn', type: 'submit', text: '신청하기', disabled: problem && !S.isAdmin ? true : null }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (problem && !S.isAdmin) return;
      if (!F.noReason && !F.reason.trim()) { ui.err(m, '사유를 입력하거나 「사유 기재 안 함」을 체크하세요.'); reason.focus(); return; }
      db.collection('hr_leave').add({
        memberId: S.mid, type: F.type, unit: F.unit, start: F.start, end: F.unit === 'day' ? F.end : F.start,
        hours: F.unit === 'hours' ? F.hours : 0, days: days, reason: F.noReason ? '' : F.reason.trim(), status: 'pending', createdAt: FV.serverTimestamp()
      }).then(function () { F.reason = ''; F.noReason = false; ui.toast(title + '를 신청했습니다. 승인되면 알려 드릴게요.'); }).catch(function (x) { ui.fail(x, m); });
    });

    // 다른 휴가 (카테고리별 작은 버튼, 기본 접힘)
    var others = HR.policies().filter(function (x) { return x.id !== 'annual'; });
    var more = h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, ui.label('Other leave'),
        h('button', { type: 'button', class: 'link', 'aria-expanded': String(!!F.more), text: F.more ? '접기' : '다른 휴가 보기', onclick: function () { F.more = !F.more; HR.refresh(); } })));
    if (!F.more && !special) {
      more.appendChild(h('p', { class: 'muted small', text: '경조사 · 가족·출산 · 건강 · 회사 휴가 ' + others.length + '종' }));
    } else {
      CATS.forEach(function (c) {
        var list = others.filter(function (x) { return HR.policyCat(x) === c[0]; });
        if (!list.length) return;
        more.appendChild(h('div', { class: 'cat-group' }, h('div', { class: 'cat-name', text: c[1] }),
          h('div', { class: 'chips' }, list.map(function (x) {
            var on = F.type === x.id;
            return h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), title: x.note || '',
              onclick: function () { F.type = x.id; F.unit = 'day'; F.more = true; HR.refresh(); } },
              x.name, h('span', { class: 'chip-sub', text: policyLine(x) }));
          }))));
      });
    }

    var reqs = h('ul', { class: 'list' });
    HR.leavesOf(S.mid).slice().sort(function (a, b) { return a.start < b.start ? 1 : -1; }).slice(0, 30).forEach(function (l) { reqs.appendChild(leaveItem(l)); });
    if (!reqs.children.length) reqs.appendChild(h('li', { class: 'empty', text: '신청 내역이 없습니다.' }));

    ui.put(view, h('div', { class: 'two-col' },
      h('div', { class: 'stack' }, hero, quick, form),
      h('div', { class: 'stack' }, more, ui.panel('My requests', null, reqs))));
  }

  /* ---------- 연차 상세 현황 ---------- */
  function annual(view) {
    var t = fmt.today();
    V.year = V.year || +t.slice(0, 4); V.who = V.who || S.mid;
    var who = V.who, m = S.members[who];
    var led = HR.annualOf(who);
    var whoSel = S.isLead ? ui.select(HR.memberList(true).map(function (x) { return [x.id, x.name]; }), who, { id: 'anWho', onchange: function () { V.who = this.value; HR.refresh(); } }) : null;
    var yearSel = ui.select([V.year - 2, V.year - 1, V.year, V.year + 1].filter(function (y, i, a) { return a.indexOf(y) === i; }).map(function (y) { return [String(y), y + '년']; }), String(V.year), { id: 'anYear', onchange: function () { V.year = +this.value; HR.refresh(); } });
    ui.put(view, h('div', { class: 'toolbar' }, whoSel ? ui.field('구성원', whoSel, 'inline') : null, ui.field('연도', yearSel, 'inline')));
    if (!led) { ui.put(view, ui.empty('입사일이 등록되지 않아 연차를 계산할 수 없습니다.')); return; }
    var rows = led.months(V.year), sum = { grant: 0, expire: 0, use: 0, adj: 0 };
    rows.forEach(function (r) { Object.keys(sum).forEach(function (k) { sum[k] = L.round3(sum[k] + r[k]); }); });
    var sign = function (n) { return n ? (n > 0 ? '+ ' : '− ') + fmt.days(Math.abs(n)) : '없음'; };
    var summary = h('dl', { class: 'summary four' });
    [['자동 부여', sign(sum.grant)], ['소멸', sign(sum.expire)], ['사용', sign(sum.use)], ['조정', sign(sum.adj)]].forEach(function (p) {
      summary.appendChild(h('div', null, h('dt', { text: p[0] }), h('dd', { text: p[1] })));
    });
    var tb = h('table', { class: 'table ledger' });
    tb.appendChild(h('thead', null, h('tr', null, ['날짜', '자동 부여', '소멸', '사용', '조정', '잔여'].map(function (x, i) { return h('th', { class: i ? 'num' : '', text: x }); }))));
    var body = h('tbody'), cell = function (n) { return h('td', { class: 'num' + (n < 0 ? ' neg' : ''), text: n ? (n > 0 ? '+' : '') + fmt.days(n) : '' }); };
    rows.forEach(function (r) {
      body.appendChild(h('tr', { class: r.ym === t.slice(0, 7) ? 'today' : '' },
        h('td', null, (+r.ym.slice(0, 4)) + '년 ' + (+r.ym.slice(5)) + '월', r.fiscal ? ui.tag('회계월', 'mute') : null),
        cell(r.grant), cell(r.expire), cell(r.use), cell(r.adj), h('td', { class: 'num strong', text: fmt.days(r.left) })));
    });
    tb.appendChild(body);

    var info = [];
    info.push((S.cfg.annualBasis === 'fiscal' ? '회계연도(1월 1일) 기준' : '입사일 기준') + ' · 입사 ' + fmt.dot(m.hireDate) + ' · 현재 잔여 ' + fmt.days(led.balance));
    if (led.next) info.push('다음 부여 ' + fmt.dot(led.next.date) + ' · ' + fmt.days(led.next.days) + ' (' + led.next.kind + ')');
    if (led.expiring) info.push('가장 먼저 소멸 ' + fmt.dot(L.addDays(led.expiring.exp, -1)) + '까지 · ' + fmt.days(led.expiring.left));
    if (led.promo) info.push('사용촉진(제61조) · 1차 서면 촉구 ' + fmt.dot(led.promo.first) + '~' + fmt.dot(led.promo.firstTo) + ' · 2차 시기 지정 ' + fmt.dot(led.promo.second) + '까지');
    if (!led.legal) info.push('상시 5인 미만 사업장은 연차가 법정 의무가 아니며 회사 정책으로 운영됩니다.');

    var adjForm = null;
    if (S.isAdmin) {
      var aDate = ui.input({ id: 'adjDate', type: 'date', value: t }), aDays = ui.input({ id: 'adjDays', type: 'number', step: '0.125', placeholder: '예: 1 또는 -0.5' }), aNote = ui.input({ id: 'adjNote', maxlength: '80', placeholder: '사유 (예: 포상, 이월, 정산)' }), am = ui.msg();
      adjForm = h('form', { class: 'panel' }, ui.label('Adjust · 관리자'), h('div', { class: 'row' }, ui.field('적용일', aDate), ui.field('일수 (±, 0.125 = 1시간)', aDays), ui.field('사유', aNote)), am,
        h('button', { class: 'btn btn-sm', type: 'submit', text: '조정 추가' }));
      adjForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!+aDays.value) return ui.err(am, '일수를 입력하세요.');
        db.doc('hr_members/' + who).update({ leaveAdjs: FV.arrayUnion({ date: aDate.value, days: +aDays.value, note: aNote.value.trim(), by: S.mid }) })
          .then(function () { ui.toast('연차를 조정했습니다.'); }).catch(function (x) { ui.fail(x, am); });
      });
    }
    ui.put(view,
      h('div', { class: 'ledger-head' }, h('h2', { class: 'h2', text: (m.name || '') + ' · 연차 상세 현황 ' + V.year + '년' })),
      summary, h('div', { class: 'table-wrap' }, tb),
      h('p', { class: 'note', text: '소수점 넷째 자리에서 반올림하여 표기합니다. 1일 = 8시간. 사용은 소멸이 빠른 연차부터 차감합니다. 퇴사 시 회계연도 기준이 입사일 기준보다 불리하면 입사일 기준으로 정산합니다.' }),
      ui.panel('Basis', null, h('ul', { class: 'plain' }, info.map(function (x) { return h('li', { text: x }); }))),
      adjForm);
  }

  /* ---------- 쉬는 날 ---------- */
  function holidays(view) {
    var t = fmt.today(), year = V.year || +t.slice(0, 4);
    var dates = Object.keys(S.hmap).filter(function (d) { return +d.slice(0, 4) === year; }).sort();
    // 연속된 같은 이름은 하나로 묶기 (설날 2/16–2/18)
    var groups = [];
    dates.forEach(function (d) {
      var g = groups[groups.length - 1], nm = S.hmap[d];
      if (g && g.name === nm && L.addDays(g.end, 1) === d) g.end = d; else groups.push({ name: nm, start: d, end: d });
    });
    var left = dates.filter(function (d) { return d >= t && L.weekday(d) !== 0 && L.weekday(d) !== 6; }).length;
    var ul = h('ul', { class: 'holidays' });
    groups.forEach(function (g) {
      var past = g.end < t, next = !past && g.start >= t && !ul.querySelector('.next');
      ul.appendChild(h('li', { class: (past ? 'past' : '') + (next ? ' next' : '') },
        h('div', { class: 'hol-name', text: g.name }),
        h('div', { class: 'hol-date', text: (+g.start.slice(5, 7)) + '월 ' + (+g.start.slice(8)) + '일 (' + '일월화수목금토'[L.weekday(g.start)] + ')' + (g.end !== g.start ? ' – ' + (+g.end.slice(5, 7)) + '월 ' + (+g.end.slice(8)) + '일 (' + '일월화수목금토'[L.weekday(g.end)] + ')' : '') }),
        next ? ui.tag('D-' + L.daysBetween(t, g.start), 'red') : null));
    });
    var yearSel = ui.select([year - 1, year, year + 1].map(function (y) { return [String(y), y + '년']; }), String(year), { id: 'holYear', onchange: function () { V.year = +this.value; HR.refresh(); } });
    var synced = S.cfg.holidaysSyncedAt && S.cfg.holidaysSyncedAt.toDate ? fmt.ts(S.cfg.holidaysSyncedAt) : null;
    ui.put(view,
      h('div', { class: 'toolbar' }, ui.field('연도', yearSel, 'inline')),
      h('div', { class: 'hol-hero' },
        h('div', null, ui.label('쉬는 날 (' + groups.length + ')'), h('h2', { class: 'hol-count' }, year === +t.slice(0, 4) ? ['앞으로 ', h('span', { class: 'accent', text: String(left) }), '일을 쉴 수 있어요'] : year + '년 공휴일')),
        h('div', { class: 'muted small', text: '주말 제외' })),
      ul,
      h('p', { class: 'note', text: '출처: 공공데이터포털 한국천문연구원 특일정보' + (synced ? ' · 마지막 자동 동기화 ' + synced : ' · 자동 동기화 전에는 관리자 설정 목록을 사용합니다') + '. 2026년부터 제헌절(7/17)이 공휴일로 다시 지정되었고 근로자의 날은 노동절로 바뀌었습니다. 5인 이상 사업장은 공휴일이 유급휴일입니다 (근로기준법 제55조②).' }),
      h('div', { class: 'row' },
        h('a', { class: 'btn btn-line btn-sm', href: 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent('ko.south_korea#holiday@group.v.calendar.google.com'), target: '_blank', rel: 'noopener', text: '구글 캘린더에 공휴일 구독' }),
        S.cfg.gcalId ? h('a', { class: 'btn btn-line btn-sm', href: 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(S.cfg.gcalId), target: '_blank', rel: 'noopener', text: '팀 휴가 캘린더 구독' }) : null));
  }

  /* ---------- 팀 캘린더 ---------- */
  function calendar(view) {
    var t = fmt.today(), ym = V.calMonth || t.slice(0, 7);
    var first = ym + '-01', start = L.mondayOf(first), md = L.monthDays(ym), last = md[md.length - 1];
    var grid = h('div', { class: 'cal' });
    ['월', '화', '수', '목', '금', '토', '일'].forEach(function (d) { grid.appendChild(h('div', { class: 'cal-dow', text: d })); });
    for (var d = start; d <= last || L.weekday(d) !== 1; d = L.addDays(d, 1)) {
      var inMonth = d.slice(0, 7) === ym, hol = S.hmap[d], w = L.weekday(d);
      var cell = h('div', { class: 'cal-day' + (inMonth ? '' : ' out') + (d === t ? ' today' : '') + (hol || w === 0 ? ' hol' : '') },
        h('div', { class: 'cal-num', text: String(+d.slice(8)) }), hol ? h('div', { class: 'cal-hol', text: hol }) : null);
      S.away.forEach(function (a) {
        if (a.start <= d && a.end >= d && L.isWorkday(d, S.hmap)) cell.appendChild(h('div', { class: 'cal-ev', text: HR.name(a.memberId) + ' ' + HR.policy(a.type).name + (a.unit === 'am' ? ' 오전' : a.unit === 'pm' ? ' 오후' : '') }));
      });
      grid.appendChild(cell);
      if (d > L.addDays(last, 7)) break;
    }
    ui.put(view,
      h('div', { class: 'toolbar' },
        ui.btn('이전', function () { V.calMonth = fmt.ymShift(ym, -1); HR.refresh(); }, 'btn-line btn-sm'),
        h('h2', { class: 'h2', text: (+ym.slice(0, 4)) + '년 ' + (+ym.slice(5)) + '월' }),
        ui.btn('다음', function () { V.calMonth = fmt.ymShift(ym, 1); HR.refresh(); }, 'btn-line btn-sm'),
        ym !== t.slice(0, 7) ? ui.btn('이번 달', function () { V.calMonth = null; HR.refresh(); }, 'btn-line btn-sm') : null),
      h('div', { class: 'cal-wrap' }, grid),
      h('p', { class: 'note', text: '승인된 휴가만 표시합니다. 사유는 신청자와 승인자만 볼 수 있습니다.' }));
  }

  /* ---------- 승인 ---------- */
  function approve(view) {
    var pend = h('ul', { class: 'list' }), upcoming = h('ul', { class: 'list' }), t = fmt.today();
    S.leaves.filter(function (l) { return l.status === 'pending' && canApprove(l); }).sort(function (a, b) { return a.start < b.start ? -1 : 1; })
      .forEach(function (l) { pend.appendChild(leaveItem(l, { approve: true })); });
    if (!pend.children.length) pend.appendChild(h('li', { class: 'empty', text: '승인할 휴가가 없습니다.' }));
    S.leaves.filter(function (l) { return l.status === 'approved' && l.end >= t; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; })
      .forEach(function (l) { upcoming.appendChild(leaveItem(l, { approve: true })); });
    if (!upcoming.children.length) upcoming.appendChild(h('li', { class: 'empty', text: '예정된 휴가가 없습니다.' }));
    ui.put(view, h('div', { class: 'two-col' }, ui.panel('Pending', null, pend), ui.panel('Upcoming · approved', null, upcoming)));
  }

  HR.register('leave', {
    render: function (view, parts) {
      var sub = parts[0] || '';
      var n = S.isLead ? S.leaves.filter(function (l) { return l.status === 'pending' && canApprove(l); }).length : 0;
      ui.put(view, ui.head('Time off', '휴가'),
        ui.tabs([['', '내 휴가'], ['annual', '연차 상세'], ['holidays', '쉬는 날'], ['calendar', '팀 캘린더'], S.isLead ? ['approve', '승인' + (n ? ' ' + n : '')] : null], sub, 'leave'));
      if (sub === 'annual') annual(view);
      else if (sub === 'holidays') holidays(view);
      else if (sub === 'calendar') calendar(view);
      else if (sub === 'approve' && S.isLead) approve(view);
      else mine(view);
    }
  });
})();
