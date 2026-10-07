/* fillts Finance — Overview · 런웨이 · 현금흐름 */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, ui = HR.ui, h = ui.h, fmt = HR.fmt, BP = window.BankParse;
  var V = { scen: 'base', months: 18, flowN: 6, flowView: 'cat' };

  function runwayText(p) {
    if (p.zero === 0) return { t: '이번 달', sub: '이번 달 안에 잔액 부족 예상', cls: 'red' };
    if (p.zero != null) return { t: p.zero + '개월', sub: fmt.dateLong(p.rows[p.zero].ym + '-01').replace(/ 1일$/, '') + ' 소진 예상', cls: p.zero < 12 ? 'red' : '' };
    if (!p.bal.amount && !F.tx.length) return { t: '-', sub: '잔액 · 거래내역이 아직 없습니다', cls: '' };
    return { t: p.rows.length + '개월+', sub: '예측 기간 안에 소진 없음', cls: '' };
  }

  /* ============ Overview ============ */
  function home(view) {
    // [실제] 화면 — 실제 값만 쓴다: 통장 잔액 · 지출 흐름(고정비 · 일회성) · 자금조달 · 재고 · 거래내역. 시뮬레이션 값은 읽지 않는다
    var bal = F.balance(), t = fmt.today(), ym0 = F.thisYm();
    var fx = F.fixedAt ? F.fixedAt(ym0) : { total: F.fixedMonthly(ym0), pay: 0, rent: 0 };
    var up = F.schedIn(t, HR.L.addDays(t, 45)), upSum = up.reduce(function (a, o) { return a + o.amount; }, 0);
    var confirmed = F.plan.filter(function (p) { return p.status === 'approved' && p.date && p.date >= t; });
    var confSum = confirmed.reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
    var burn = F.actualBurn(3);
    // 정책자금 전용통장(설정 › 계좌에서 이름에 중진공 · 정책) — 운영비로 못 쓰는 돈이라 따로 본다
    var pk = {}; (F.cfg.cashAccts || []).forEach(function (a) { if (a.key && /중진공|정책/.test(a.name || '')) pk[a.key] = 1; });
    var policyCash = bal.accts.filter(function (a) { return pk[a.key]; }).reduce(function (a, x) { return a + (x.bal || 0); }, 0);
    var opsMonths = burn.avg > 0 ? (bal.amount - policyCash) / burn.avg : null;
    var st = F.invStock ? F.invStock() : {}, invVal = Object.keys(st).reduce(function (a, k) { return a + (st[k].value || 0) + (st[k].valueIn || 0); }, 0);
    // 매출 없이 확정된 돈만으로 6개월: 잔액 − 고정비 − 일회성 예정 + 확정 조달
    var rows = [], cash = bal.amount, zero = null;
    for (var i = 0; i < 6; i++) {
      var ym = fmt.ymShift(ym0, i), last = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), from = i === 0 ? t : ym + '-01', to = ym + '-' + ('0' + last).slice(-2);
      var part = i === 0 ? Math.max(0, (last - (+t.slice(8, 10)) + 1) / last) : 1;
      var fixed = burn.avg * part;   // 실제 통장 월평균 지출 (최근 3개월 · 발주 · 보증금 제외)
      var once = F.schedIn(from, to).filter(function (o) { return !o.auto; }).reduce(function (a, o) { return a + o.amount; }, 0);   // 반복(통장 추정)은 월평균 지출에 이미 있음 → 일회성 + 예정 증액만
      var fund = F.plan.filter(function (p) { return p.status === 'approved' && p.date && p.date >= from && p.date <= to; }).reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
      cash = cash - fixed - once + fund; rows.push({ ym: ym, cash: cash, fixed: fixed, once: once, fund: fund });
      if (zero == null && cash < 0) zero = i;
    }
    var noEvid = F.tx.filter(function (x) { return x.outAmt > 0 && !F.isTransfer(x) && !x.evid; }).length;
    var uncat = F.tx.filter(function (x) { return !x.cat || x.cat === '미분류'; }).length;
    var assumed = F.sched.filter(function (s) { return s.kind === 'monthly' && s.assumed; }).length;
    var overdue = F.schedIn(HR.L.addDays(t, -60), HR.L.addDays(t, -1)).filter(function (o) { return o.s.kind !== 'monthly'; });

    var alerts = h('ul', { class: 'list fin-alerts' });
    var al = function (text, href, cls) { alerts.appendChild(h('li', null, h('a', { class: 'grow', href: href, text: text }), ui.tag(cls === 'red' ? '확인' : '안내', cls === 'red' ? 'red' : 'mute'))); };
    if (zero != null) al('매출 없이 확정된 돈만 보면 ' + F.ymLabel(rows[zero].ym) + '에 잔액이 바닥납니다 — 자금조달 확인', '#plan', 'red');
    if (overdue.length) al('지난 지출예정 ' + overdue.length + '건 지급 표시 없음', '#cost/once', 'red');
    if (!F.tx.length) al('통장 거래내역을 아직 가져오지 않았습니다 — 엑셀을 올리거나 구글 드라이브 폴더를 연결하세요.', '#tx/import');
    if (uncat) al('분류가 비어 있는 거래 ' + uncat + '건', '#tx/list/uncat', 'red');
    if (noEvid) al('증빙 표시가 없는 출금 ' + noEvid + '건 — 세무사 전달 전에 확인', '#tx/list/noevid');
    if (F.status.drive && F.status.drive.err) al('구글 드라이브 동기화 오류: ' + F.status.drive.err, '#set/drive', 'red');
    if (!alerts.children.length) alerts.appendChild(h('li', { class: 'empty', text: '확인할 항목이 없습니다.' }));

    var acctList = h('ul', { class: 'list' }, bal.accts.map(function (x) {
      return h('li', null, h('div', { class: 'grow' }, h('div', { class: 'strong', text: x.name }), h('div', { class: 'meta', text: F.kindName(x.kind) + (x.date ? ' · ' + fmt.dot(x.date) + ' 기준' : '') + (x.note ? ' · ' + x.note : '') })), h('span', { class: 'num', text: F.won(x.bal) }));
    }));
    if (!bal.accts.length) acctList.appendChild(h('li', { class: 'empty', text: '설정 › 계좌 · 잔액에서 통장을 추가하세요.' }));
    var upList = h('ul', { class: 'list' }, up.slice(0, 8).map(function (o) {
      return h('li', null, h('span', { class: 'meta fin-date', text: fmt.date(o.date) }), h('span', { class: 'grow', text: o.s.title }), h('span', { class: 'num', text: F.won(o.amount) }));
    }));
    if (!up.length) upList.appendChild(h('li', { class: 'empty', text: '45일 안에 잡힌 지출이 없습니다.' }));
    var funds = F.plan.filter(function (p) { return p.status !== 'received' && p.status !== 'dropped'; }).sort(function (a, b) { return (a.date || '9') < (b.date || '9') ? -1 : 1; });
    var fundList = h('ul', { class: 'list' }, funds.slice(0, 6).map(function (p) {
      return h('li', null, h('span', { class: 'meta fin-date', text: p.date ? fmt.dot(p.date) : '미정' }), h('span', { class: 'grow', text: p.name }), ui.tag(F.statusName(p.status), p.status === 'approved' ? 'ok' : 'mute'), h('span', { class: 'num', text: F.man(p.amount) }));
    }));
    if (!funds.length) fundList.appendChild(h('li', { class: 'empty', text: '예정된 자금조달이 없습니다.' }));
    var bars = rows.map(function (r) { return { label: F.ymLabel(r.ym), v: r.cash, title: r.ym + ' 월말 ' + F.won(r.cash) + ' (월평균 지출 ' + F.won(r.fixed) + ' · 일회성 ' + F.won(r.once) + ' · 확정 조달 ' + F.won(r.fund) + ')' }; });

    ui.put(view, ui.head('Finance', 'Overview', h('span', { class: 'meta', text: '실제 값만 · ' + (bal.asOf ? '잔액 ' + fmt.dot(bal.asOf) + ' 기준' : '') })),
      F.kpi([['법인 통장 잔액', F.man(bal.amount), '', bal.accts.length + '개 계좌'],
        ['월 평균 지출 (실제)', F.man(burn.avg), '', burn.months.length ? burn.months.map(F.ymLabel).join(' · ') + ' 통장 기준 · 원료 · 포장 발주 · 보증금 제외' : '거래내역 없음'],
        ['45일 지출 예정', F.man(upSum), '', up.length + '건 · 지출 흐름 기준'],
        ['확정 조달 예정', F.man(confSum), '', confirmed.length + '건 (승인 · 확정)'],
        ['재고 자산', F.man(invVal), '', '입고 + 입고 예정 · 공급가'],
        ['매출 없이 버티는 기간', zero != null ? (zero === 0 ? '이번 달' : zero + '개월') : '6개월+', zero != null ? 'red' : '', '정책자금 제외하면 ' + (opsMonths == null ? '—' : opsMonths.toFixed(1) + '개월') + ' · 잔액 − 월평균 지출 − 예정 지출 + 확정 조달']]),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Check · 확인할 것', null, alerts),
        ui.panel('Cash · 매출 없이 확정된 돈만 (6개월)', h('a', { href: '#spend', class: 'meta', text: '사용분석 →' }), F.bars(bars),
          h('p', { class: 'meta', text: '매달 최근 3개월 실제 통장 지출 평균만큼 나간다고 본 보수적인 기준입니다 (원료 · 포장 발주와 보증금은 제외, 정책자금 통장 포함). 판매 · 광고 계획은 [시뮬] 시뮬레이션에서 봅니다.' }))),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Accounts · 통장별 잔액', h('a', { href: '#set/accounts', class: 'meta', text: '수정 →' }), acctList),
        ui.panel('Upcoming · 다가오는 지출 (45일)', h('a', { href: '#cost/once', class: 'meta', text: '전체 →' }), upList)),
      ui.panel('Funding · 자금조달', h('a', { href: '#plan', class: 'meta', text: '전체 →' }), fundList),
      h('p', { class: 'note', text: '[실제] 화면은 통장 잔액 · 지출 흐름 · 자금조달 · 재고 · 거래내역의 실제 입력값만 씁니다. 시뮬레이션 값은 따로 지시할 때만 옮깁니다.' }));
  }

  /* ============ 런웨이 ============ */
  // 월 지출별 런웨이 — 지출 데이터가 없어도 「얼마씩 쓰면 몇 개월」을 바로 본다 (매출 · 조달 계획 제외, 단순 나누기)
  function sensitivity(p) {
    var burns = [5e6, 1e7, 1.5e7, 2e7, 3e7, 5e7];
    var mine = p.netBurn > 0 ? Math.round(p.netBurn) : 0;
    if (mine && burns.indexOf(mine) < 0) { burns.push(mine); burns.sort(function (a, b) { return a - b; }); }
    var corp = p.bal.amount, all = p.bal.amount + p.owner;
    var mo = function (c, b) { return (c / b).toFixed(1) + '개월'; };
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, h('th', { text: '월 순지출' }), h('th', { class: 'num', text: '법인 통장만 (' + F.man(corp) + ')' }), p.owner ? h('th', { class: 'num', text: '대표 자금 포함 (' + F.man(all) + ')' }) : null)),
      h('tbody', null, burns.map(function (b) {
        return h('tr', { class: b === mine ? 'fin-mine' : '' }, h('td', { text: F.man(b) + (b === mine ? ' ← 지금 입력 기준' : '') }), h('td', { class: 'num' + (corp / b < 12 ? ' red' : ''), text: mo(corp, b) }),
          p.owner ? h('td', { class: 'num' + (all / b < 12 ? ' red' : ''), text: mo(all, b) }) : null);
      })));
    return ui.panel('Sensitivity · 월 지출별 런웨이', null, h('div', { class: 'table-wrap flat' }, tb),
      h('p', { class: 'meta', text: '잔액 ÷ 월 순지출(지출 − 매출). 자금조달 계획 · 매출 성장은 빼고 계산한 단순 값 — 빨간 숫자는 12개월 미만.' }));
  }
  function runway(view) {
    var p = F.project(V.scen, V.months), rw = runwayText(p);
    var pc = F.project(V.scen, V.months, { noOwner: true }), rwc = runwayText(pc);
    var bars = p.rows.map(function (r, i) { return { label: F.ymLabel(r.ym), v: r.end, cls: i === 11 ? 'gate' : '', title: r.ym + ' 월말 ' + F.won(r.end) }; });
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['월', '매출', '자금조달', '고정 지출', '변동 지출', '일회성', '월말 잔액'].map(function (x, i) { return h('th', { class: i ? 'num' : '', text: x }); }))),
      h('tbody', null, p.rows.map(function (r, i) {
        return h('tr', { class: p.zero === i ? 'fin-zero' : '' }, h('td', { text: r.ym.replace('-', '.') + (i === 0 ? ' (남은 기간)' : '') }), h('td', { class: 'num', text: F.man(r.rev) }), h('td', { class: 'num', text: r.fund ? F.man(r.fund) : '' }),
          h('td', { class: 'num', text: F.man(r.fixed) }), h('td', { class: 'num', text: F.man(r.variable) }), h('td', { class: 'num', text: r.once ? F.man(r.once) : '' }), h('td', { class: 'num strong' + (r.end < 0 ? ' red' : ''), text: F.man(r.end) }));
      })));
    var gate = p.zero == null || p.zero >= 12;
    var ed = F.canEdit();
    var asm = h('div', { class: 'fin-assume' },
      assumption('월 변동 지출', 'varBurn', p.variable, '비우면 최근 3개월 평균 출금 − 고정 지출예정 (' + F.man(Math.max(0, p.recent.gross - p.fixed)) + ')', ed),
      assumption('월 매출 (영업 입금)', 'revenue', p.rev, '비우면 최근 3개월 평균 영업 입금 (' + F.man(p.recent.rev) + ')', ed),
      assumption('매출 월 성장률 %', 'revGrowth', +F.cfg.revGrowth || 0, '예: 10 = 매달 10%씩 증가', ed, true));
    ui.put(view, ui.head('Runway', '런웨이'), h('div', { class: 'toolbar' }, F.seg(F.SCEN, V.scen, function (k) { V.scen = k; }, '시나리오')),
      F.kpi([['법인 통장 잔액', F.man(p.bal.amount), '', p.owner ? '대표 자금 +' + F.man(p.owner) : ''],
        ['월 순소진', p.netBurn > 0 ? F.man(p.netBurn) : (F.sched.length || F.cfg.varBurn != null ? '흑자' : '미입력'), p.netBurn > 0 ? '' : 'red', p.netBurn > 0 ? '' : '지출예정을 넣어야 계산됩니다'],
        p.owner ? ['법인 통장만 런웨이', rwc.t, rwc.cls, '대표 자금 없이 · ' + rwc.sub] : ['단순 런웨이', p.simple != null ? p.simple.toFixed(1) + '개월' : '-', '', '잔액 ÷ 순소진'],
        ['예측 런웨이', rw.t, rw.cls, (p.owner ? '대표 자금 포함 · ' : '') + rw.sub], ['12개월 게이트', gate ? '통과' : '미달', gate ? '' : 'red', '투자 · 확장 판단 기준'], ['반영 조달', F.man(p.rows.reduce(function (a, r) { return a + r.fund; }, 0))]]),
      sensitivity(p),
      ui.panel('Projection · 월말 잔액', F.seg([[12, '12개월'], [18, '18개월'], [24, '24개월']], V.months, function (k) { V.months = k; }, '기간'), F.bars(bars), h('p', { class: 'meta', text: '빨간 막대 = 월말 잔액이 0원 아래인 달 · 테두리 막대 = 12개월째' })),
      ui.panel('Assumptions · 가정', null, asm, F.readOnlyNote()),
      ui.panel('Detail · 월별 예측', null, h('div', { class: 'table-wrap flat' }, tb)),
      h('p', { class: 'note', text: '고정 지출 = 지출예정의 「매월 반복」 합계, 일회성 = 「한 번」 항목 중 아직 안 나간 것. 자금조달은 예정일이 있는 항목만 그 달에 들어옵니다 — 보수는 「승인 · 확정」만, 기본은 금액 × 확률, 낙관은 전부. 「입금 완료」는 이미 잔액에 있으므로 빼고 계산합니다.' }));
  }
  function assumption(label, key, val, hint, ed, plain) {
    var i = plain ? ui.input({ inputmode: 'decimal', value: F.cfg[key] != null ? String(F.cfg[key]) : '' }) : F.moneyInput({ value: F.cfg[key] != null && F.cfg[key] !== '' ? F.cfg[key] : '' });
    i.placeholder = plain ? '0' : '자동 (' + F.man(val) + ')';
    if (!ed) i.disabled = true;
    i.addEventListener('change', function () {
      var v = i.value.trim() === '' ? null : (plain ? +i.value || 0 : F.parseWon(i.value));
      var patch = {}; patch[key] = v;
      F.cfgSet(patch).then(function () { ui.toast('가정을 바꿨습니다.'); }).catch(ui.fail);
    });
    return h('div', null, ui.field(label, i), h('p', { class: 'meta', text: hint }));
  }

  /* ============ 현금흐름 ============ */
  function flow(view) {
    var M = F.monthly(), keys = Object.keys(M).sort();
    if (V.flowN) keys = keys.slice(-V.flowN);
    var cats = { inn: {}, out: {} };
    keys.forEach(function (k) { Object.keys(M[k].inn).forEach(function (c) { cats.inn[c] = 1; }); Object.keys(M[k].out).forEach(function (c) { cats.out[c] = 1; }); });
    var order = function (list, obj) { return list.concat(Object.keys(obj).filter(function (c) { return list.indexOf(c) < 0; })).filter(function (c) { return obj[c]; }); };
    var inCats = order(BP.CATS_IN.concat([BP.TRANSFER]), cats.inn), outCats = order(BP.CATS_OUT.concat([BP.TRANSFER]), cats.out);
    var head = h('tr', null, h('th', { text: '구분' }), keys.map(function (k) { return h('th', { class: 'num', text: F.ymLabel(k) }); }), h('th', { class: 'num', text: '합계' }));
    var row = function (label, f, cls) {
      var tot = 0;
      return h('tr', { class: cls || '' }, h('td', { text: label }), keys.map(function (k) { var v = f(M[k]); tot += v; return h('td', { class: 'num', text: v ? F.man(v) : '' }); }), h('td', { class: 'num strong', text: tot ? F.man(tot) : '' }));
    };
    var body = h('tbody', null,
      h('tr', { class: 'fin-sec' }, h('td', { colspan: String(keys.length + 2), text: '입금' })),
      inCats.map(function (c) { return row(c, function (m) { return m.inn[c] || 0; }); }),
      row('입금 합계', function (m) { return m.inSum; }, 'fin-sum'),
      h('tr', { class: 'fin-sec' }, h('td', { colspan: String(keys.length + 2), text: '출금' })),
      outCats.map(function (c) { return row(c, function (m) { return m.out[c] || 0; }); }),
      row('출금 합계', function (m) { return m.outSum; }, 'fin-sum'),
      h('tr', { class: 'fin-sec' }, h('td', { colspan: String(keys.length + 2), text: '요약' })),
      row('영업 순현금 (영업 입금 − 출금)', function (m) { return m.opIn - m.opOut; }, 'fin-sum'),
      row('조달 입금 (정책자금 · 투자 · 대출 · 가수금)', function (m) { return m.fin; }),
      row('전체 순증감', function (m) { return m.inSum - m.outSum; }, 'fin-sum'));
    var bars = keys.map(function (k) { return { label: F.ymLabel(k), v: M[k].inSum - M[k].outSum, title: k }; });
    ui.put(view, ui.head('Cash flow', '현금흐름'), h('div', { class: 'toolbar' }, F.seg([[3, '3개월'], [6, '6개월'], [12, '12개월'], [0, '전체']], V.flowN, function (k) { V.flowN = k; }, '기간')),
      keys.length ? ui.panel('Net · 월 순증감', null, F.bars(bars)) : null,
      keys.length ? ui.panel('Statement · 분류별 월 현금흐름', null, h('div', { class: 'table-wrap flat' }, h('table', { class: 'table fin-table fin-flow' }, h('thead', null, head), body)))
        : ui.empty('거래내역을 가져오면 분류별 월 현금흐름이 여기에 표시됩니다.'),
      h('p', { class: 'note', text: '통장 거래 기준(현금주의)입니다. 분류는 거래내역에서 바꿀 수 있고, 바꾼 분류는 바로 여기와 런웨이에 반영됩니다. 손익(발생주의) 결산은 세무사 장부가 기준입니다.' }));
  }

  HR.register('home', { render: home });
  HR.register('runway', { render: runway });
  HR.register('flow', { render: flow });
})();
