/* fillts Finance — 자금조달 계획 · 지출예정 */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV, BP = window.BankParse;
  var V = { planShow: 'open', schedShow: 'list' };

  /* ============ 자금조달 ============ */
  function planForm(p, done) {
    p = p || {};
    var name = ui.input({ maxlength: 60, value: p.name || '', placeholder: '예: 중진공 혁신성장 정책자금' });
    var kind = ui.select(F.PLAN_KIND.map(function (k) { return [k, k]; }), p.kind || '정책자금');
    var org = ui.input({ maxlength: 40, value: p.org || '', placeholder: '기관 · 투자사' });
    var amt = F.moneyInput({ value: p.amount || '' });
    var date = ui.input({ type: 'date', value: p.date || '' });
    var st = ui.select(F.PLAN_STATUS, p.status || 'idea');
    var prob = ui.input({ type: 'number', min: '0', max: '100', step: '5', value: p.prob != null ? String(p.prob) : '50' });
    var repay = ui.input({ maxlength: 80, value: p.repay || '', placeholder: '예: 2년 거치 3년 분할 · 금리 2.5%' });
    var memo = h('textarea', { rows: '3', maxlength: '1000', value: p.memo || '', placeholder: '서류 · 마감 · 담당자 · 조건' });
    var msg = ui.msg();
    var save = function () {
      var d = { name: name.value.trim(), kind: kind.value, org: org.value.trim(), amount: F.parseWon(amt.value), date: date.value, status: st.value,
        prob: Math.max(0, Math.min(100, +prob.value || 0)), repay: repay.value.trim(), memo: memo.value.trim(), by: S.mid, updatedAt: FV.serverTimestamp() };
      if (!d.name || !d.amount) return ui.err(msg, '이름과 금액을 입력하세요.');
      var ref = p.id ? db.doc('fin_plan/' + p.id) : db.collection('fin_plan').doc();
      if (!p.id) d.createdAt = FV.serverTimestamp();
      ref.set(d, { merge: true }).then(function () { ui.toast('저장했습니다.'); done && done(); }).catch(function (e) { ui.fail(e, msg); });
    };
    return h('div', { class: 'stack fin-form' },
      h('div', { class: 'row' }, ui.field('이름', name, 'grow'), ui.field('구분', kind)),
      h('div', { class: 'row' }, ui.field('기관', org, 'grow'), ui.field('금액 (원)', amt), ui.field('예정일 (입금)', date)),
      h('div', { class: 'row' }, ui.field('상태', st), ui.field('확률 %', prob), ui.field('상환 조건', repay, 'grow')),
      ui.field('메모', memo), msg,
      h('div', { class: 'row' }, ui.btn(p.id ? '저장' : '추가', save), p.id ? ui.btn('취소', function () { done && done(); }, 'btn-line') : null,
        p.id ? ui.confirmBtn('삭제', function () { db.doc('fin_plan/' + p.id).delete().then(function () { done && done(); }).catch(ui.fail); }) : null));
  }
  var editing = null;
  function plan(view, parts) {
    var ed = F.canEdit(), list = F.plan.slice().sort(function (a, b) { return (a.date || '9') < (b.date || '9') ? -1 : 1; });
    var shown = list.filter(function (p) { return V.planShow === 'all' || (p.status !== 'received' && p.status !== 'dropped'); });
    var sum = function (f) { return list.filter(f).reduce(function (a, p) { return a + (+p.amount || 0); }, 0); };
    var open = function (p) { return p.status !== 'received' && p.status !== 'dropped'; };
    var weighted = list.reduce(function (a, p) { return a + (+p.amount || 0) * F.planWeight(p, 'base'); }, 0);
    if (parts[0] === 'edit' && ed) {
      var cur = F.plan.filter(function (p) { return p.id === parts[1]; })[0];
      if (!cur && parts[1]) { ui.put(view, ui.empty('항목을 찾지 못했습니다.')); return; }
      ui.put(view, ui.head('Funding', cur ? '자금조달 수정' : '자금조달 추가'), ui.panel(null, null, planForm(cur, function () { HR.go('plan'); })));
      return;
    }
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['예정일', '이름 · 기관', '구분', '상태', '확률', '금액', '반영액(기본)'].map(function (x, i) { return h('th', { class: i >= 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, shown.length ? shown.map(function (p) {
        var late = p.date && p.date < fmt.today() && open(p) && p.status !== 'approved';
        return h('tr', { class: ed ? 'clickable' : '', onclick: ed ? function () { HR.go('plan/edit/' + p.id); } : null },
          h('td', { class: late ? 'red' : '', text: p.date ? fmt.dot(p.date) : '미정' }),
          h('td', null, h('div', { class: 'strong', text: p.name }), h('div', { class: 'meta', text: [p.org, p.repay].filter(Boolean).join(' · ') })),
          h('td', { text: p.kind || '' }), h('td', null, ui.tag(F.statusName(p.status), p.status === 'approved' || p.status === 'received' ? 'ok' : p.status === 'dropped' ? 'mute' : 'warn')),
          h('td', { class: 'num', text: p.status === 'approved' || p.status === 'received' ? '100%' : (p.prob || 0) + '%' }),
          h('td', { class: 'num', text: F.won(p.amount) }), h('td', { class: 'num', text: F.man((+p.amount || 0) * F.planWeight(p, 'base')) }));
      }) : h('tr', null, h('td', { colspan: '7', class: 'empty', text: '자금조달 항목이 없습니다. 정책자금 · 보증 · 투자 · 대출 계획을 추가하세요.' }))));
    ui.put(view, ui.head('Funding', '자금조달 계획', ed ? ui.btn('+ 항목 추가', function () { HR.go('plan/edit'); }, 'btn-sm') : null),
      F.kpi([['진행 중 계획', F.man(sum(open)), '', list.filter(open).length + '건'], ['승인 · 확정 (미입금)', F.man(sum(function (p) { return p.status === 'approved'; }))],
        ['확률 반영 예상', F.man(weighted)], ['입금 완료', F.man(sum(function (p) { return p.status === 'received'; }))], ['탈락 · 보류', list.filter(function (p) { return p.status === 'dropped'; }).length + '건'],
        ['다음 예정', (list.filter(function (p) { return open(p) && p.date >= fmt.today(); })[0] || {}).date ? fmt.dot(list.filter(function (p) { return open(p) && p.date >= fmt.today(); })[0].date) : '-']]),
      h('div', { class: 'toolbar' }, F.seg([['open', '진행 중'], ['all', '전체']], V.planShow, function (k) { V.planShow = k; }, '보기')),
      h('div', { class: 'table-wrap' }, tb), F.readOnlyNote(),
      h('p', { class: 'note', text: '예정일이 있는 항목은 런웨이 예측의 그 달에 들어갑니다. 입금이 되면 상태를 「입금 완료」로 바꾸세요(이미 통장 잔액에 있으므로 예측에서 빠집니다). 대출 상환 일정은 지출예정에 「매월 반복」으로 넣으면 런웨이에 반영됩니다. 예정일이 지났는데 확정되지 않은 항목은 빨간 날짜로 표시합니다.' }));
  }

  /* ============ 지출예정 ============ */
  function schedForm(s, done) {
    s = s || { kind: 'monthly' };
    var title = ui.input({ maxlength: 60, value: s.title || '', placeholder: '예: 사무실 임대료' });
    var kind = ui.select([['monthly', '매월 반복'], ['once', '한 번']], s.kind || 'monthly');
    var amt = F.moneyInput({ value: s.amount || '' });
    var cat = ui.select(BP.CATS_OUT.filter(function (c) { return c !== '미분류'; }).map(function (c) { return [c, c]; }), s.cat || '기타 지출');
    var day = ui.input({ type: 'number', min: '1', max: '31', value: s.day ? String(s.day) : '25' });
    var start = ui.input({ type: 'month', value: s.start || F.thisYm() }), end = ui.input({ type: 'month', value: s.end || '' });
    var date = ui.input({ type: 'date', value: s.date || '' });
    var vendor = ui.input({ maxlength: 40, value: s.vendor || '', placeholder: '거래처' });
    var memo = ui.input({ maxlength: 200, value: s.memo || '' });
    var msg = ui.msg();
    var mBox = h('div', { class: 'row' }, ui.field('매월 며칠', day), ui.field('시작 월', start), ui.field('끝 월 (비우면 계속)', end));
    var oBox = h('div', { class: 'row' }, ui.field('지출일', date));
    var sync = function () { mBox.hidden = kind.value !== 'monthly'; oBox.hidden = kind.value === 'monthly'; };
    kind.addEventListener('change', sync); sync();
    var save = function () {
      var d = { title: title.value.trim(), kind: kind.value, amount: F.parseWon(amt.value), cat: cat.value, vendor: vendor.value.trim(), memo: memo.value.trim(), by: S.mid, updatedAt: FV.serverTimestamp() };
      if (d.kind === 'monthly') { d.day = Math.max(1, Math.min(31, +day.value || 1)); d.start = start.value || ''; d.end = end.value || ''; d.date = ''; }
      else { d.date = date.value; if (!d.date) return ui.err(msg, '지출일을 입력하세요.'); }
      if (!d.title || !d.amount) return ui.err(msg, '이름과 금액을 입력하세요.');
      var ref = s.id ? db.doc('fin_sched/' + s.id) : db.collection('fin_sched').doc();
      if (!s.id) { d.createdAt = FV.serverTimestamp(); d.paid = false; d.paidYms = []; }
      ref.set(d, { merge: true }).then(function () { ui.toast('저장했습니다.'); done && done(); }).catch(function (e) { ui.fail(e, msg); });
    };
    return h('div', { class: 'stack fin-form' },
      h('div', { class: 'row' }, ui.field('이름', title, 'grow'), ui.field('반복', kind), ui.field('금액 (원)', amt)),
      mBox, oBox, h('div', { class: 'row' }, ui.field('분류', cat), ui.field('거래처', vendor, 'grow'), ui.field('메모', memo, 'grow')), msg,
      h('div', { class: 'row' }, ui.btn(s.id ? '저장' : '추가', save), s.id ? ui.btn('취소', function () { done && done(); }, 'btn-line') : null,
        s.id ? ui.confirmBtn('삭제', function () { db.doc('fin_sched/' + s.id).delete().then(function () { done && done(); }).catch(ui.fail); }) : null));
  }
  function markPaid(o) {
    if (o.s.kind === 'monthly') return db.doc('fin_sched/' + o.s.id).update({ paidYms: FV.arrayUnion(o.ym) });
    return db.doc('fin_sched/' + o.s.id).update({ paid: true });
  }
  function sched(view, parts) {
    var ed = F.canEdit(), t = fmt.today();
    if (parts[0] === 'edit' && ed) {
      var cur = F.sched.filter(function (s) { return s.id === parts[1]; })[0];
      ui.put(view, ui.head('Scheduled', cur ? '지출예정 수정' : '지출예정 추가'), ui.panel(null, null, schedForm(cur, function () { HR.go('sched'); })));
      return;
    }
    var horizon = HR.L.addDays(t, 90), past = HR.L.addDays(t, -31);
    var occ = F.schedIn(past, horizon);
    var overdue = occ.filter(function (o) { return o.date < t; }), next = occ.filter(function (o) { return o.date >= t; });
    var payreq = HR.load('fin@payreq', function () { return db.collection('hr_payreq').where('status', '==', 'approved').get().then(HR.rows); }) || [];
    var occRow = function (o) {
      return h('li', null, h('span', { class: 'meta fin-date' + (o.date < t ? ' red' : ''), text: fmt.date(o.date) }),
        h('a', { class: 'grow', href: ed ? '#sched/edit/' + o.s.id : null, text: o.s.title }), h('span', { class: 'meta', text: (o.s.kind === 'monthly' ? '매월 · ' : '') + (o.s.cat || '') }),
        h('span', { class: 'num', text: F.won(o.amount) }), ed ? ui.btn('지급 완료', function () { markPaid(o).then(function () { ui.toast('지급 완료로 표시했습니다.'); }).catch(ui.fail); }, 'btn-line btn-xs') : null);
    };
    var nextSum = function (days) { var to = HR.L.addDays(t, days); return next.filter(function (o) { return o.date <= to; }).reduce(function (a, o) { return a + o.amount; }, 0); };
    var all = F.sched.slice().sort(function (a, b) { return (a.kind === b.kind ? 0 : a.kind === 'monthly' ? -1 : 1) || ((a.title || '') < (b.title || '') ? -1 : 1); });
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['이름', '반복', '분류', '거래처', '금액'].map(function (x, i) { return h('th', { class: i === 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, all.length ? all.map(function (s) {
        return h('tr', { class: ed ? 'clickable' : '', onclick: ed ? function () { HR.go('sched/edit/' + s.id); } : null }, h('td', { class: 'strong', text: s.title }),
          h('td', { text: s.kind === 'monthly' ? '매월 ' + s.day + '일' + (s.end ? ' ~ ' + s.end.replace('-', '.') : '') : fmt.dot(s.date) + (s.paid ? ' · 지급됨' : '') }),
          h('td', { text: s.cat || '' }), h('td', { text: s.vendor || '' }), h('td', { class: 'num', text: F.won(s.amount) }));
      }) : h('tr', null, h('td', { colspan: '5', class: 'empty', text: '등록된 지출예정이 없습니다. 급여 · 임대료 · 구독료 같은 고정비부터 넣으세요.' }))));
    var prList = h('ul', { class: 'list' }, payreq.map(function (r) {
      return h('li', null, h('span', { class: 'meta fin-date', text: r.due ? fmt.date(r.due) : '' }), h('a', { class: 'grow', href: '/hr/#payreq/r/' + r.id, target: '_blank', rel: 'opener', text: r.title + ' · ' + r.payee }), h('span', { class: 'num', text: F.won(r.net || r.total) }));
    }));
    if (!payreq.length) prList.appendChild(h('li', { class: 'empty', text: '승인 후 입금을 기다리는 HR 입금요청이 없습니다.' }));
    ui.put(view, ui.head('Scheduled', '지출예정', ed ? ui.btn('+ 지출예정 추가', function () { HR.go('sched/edit'); }, 'btn-sm') : null),
      F.kpi([['월 고정 지출', F.man(F.fixedMonthly(F.thisYm())), '', F.sched.filter(function (s) { return s.kind === 'monthly'; }).length + '개 항목'],
        ['7일 안', F.man(nextSum(7))], ['30일 안', F.man(nextSum(30))], ['90일 안', F.man(nextSum(90))],
        ['지난 미지급', F.man(overdue.reduce(function (a, o) { return a + o.amount; }, 0)), overdue.length ? 'red' : '', overdue.length + '건'],
        ['HR 입금 대기', F.man(payreq.reduce(function (a, r) { return a + (r.net || r.total || 0); }, 0)), '', payreq.length + '건']]),
      overdue.length ? ui.panel('Overdue · 지났는데 지급 표시가 없는 것', null, h('ul', { class: 'list' }, overdue.map(occRow))) : null,
      ui.panel('Next 90 days · 다가오는 지출', null, next.length ? h('ul', { class: 'list' }, next.map(occRow)) : ui.empty('90일 안에 잡힌 지출이 없습니다.')),
      ui.panel('HR 입금요청 · 승인됨 (입금 대기)', h('a', { href: '/hr/#payreq', target: '_blank', rel: 'opener', class: 'meta', text: 'HR에서 열기 ↗' }), prList),
      ui.panel('All · 등록된 지출예정', null, h('div', { class: 'table-wrap flat' }, tb)), F.readOnlyNote(),
      h('p', { class: 'note', text: '「매월 반복」 합계가 런웨이의 고정 지출이 됩니다. 「지급 완료」를 누르면 그 회차가 목록에서 빠집니다(반복 항목은 그 달만). HR 입금요청은 HR에서 입금 완료를 기록하면 여기서도 사라집니다.' }));
  }

  HR.register('plan', { render: plan });
  HR.register('sched', { render: sched });
})();
