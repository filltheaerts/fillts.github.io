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
    var p = F.project(V.scen, 24), rw = runwayText(p), t = fmt.today();
    var M = F.monthly(), cur = M[F.thisYm()] || { opIn: 0, opOut: 0 };
    var up = F.schedIn(t, HR.L.addDays(t, 30)), upSum = up.reduce(function (a, o) { return a + o.amount; }, 0);
    var nextFund = F.plan.filter(function (x) { return x.date >= t && x.status !== 'received' && x.status !== 'dropped'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var uncategorized = F.tx.filter(function (x) { return !x.cat || x.cat === '미분류'; }).length;
    var noEvid = F.tx.filter(function (x) { return x.outAmt > 0 && !F.isTransfer(x) && !x.evid; }).length;
    var prevYm = fmt.ymShift(F.thisYm(), -1), sentPrev = F.mail.some(function (m) { return m.ym === prevYm; });

    var alerts = h('ul', { class: 'list fin-alerts' });
    var al = function (text, href, cls) { alerts.appendChild(h('li', null, h('a', { class: 'grow', href: href, text: text }), ui.tag(cls === 'red' ? '확인' : '안내', cls === 'red' ? 'red' : 'mute'))); };
    if (!F.sched.length && F.cfg.varBurn == null) al('월 지출(고정비 · 인건비)이 아직 없습니다 — 지출예정에 매월 반복 항목을 넣어야 런웨이가 계산됩니다.', '#sched', 'red');
    if (!F.tx.length) al('통장 거래내역을 아직 가져오지 않았습니다 — 엑셀 파일을 올리거나 구글 드라이브 폴더를 연결하세요.', '#tx/import', 'red');
    if (p.zero != null && p.zero < 12) al('런웨이 ' + p.zero + '개월 — 12개월 게이트 미달입니다. 자금조달 계획을 확인하세요.', '#runway', 'red');
    if (uncategorized) al('분류가 비어 있는 거래 ' + uncategorized + '건', '#tx/list/uncat', 'red');
    if (noEvid) al('증빙 표시가 없는 출금 ' + noEvid + '건 — 세무사 전달 전에 확인', '#tx/list/noevid');
    if (F.tx.length && !sentPrev && +t.slice(8, 10) >= 3) al(F.ymLabel(prevYm) + ' 세무 자료를 아직 보내지 않았습니다.', '#tax', 'red');
    if (F.status.drive && F.status.drive.err) al('구글 드라이브 동기화 오류: ' + F.status.drive.err, '#set/drive', 'red');
    if (!alerts.children.length) alerts.appendChild(h('li', { class: 'empty', text: '확인할 항목이 없습니다.' }));

    var upList = h('ul', { class: 'list' }, up.slice(0, 8).map(function (o) {
      return h('li', null, h('span', { class: 'meta fin-date', text: fmt.date(o.date) }), h('span', { class: 'grow', text: o.s.title }), h('span', { class: 'num', text: F.won(o.amount) }));
    }));
    if (!up.length) upList.appendChild(h('li', { class: 'empty', text: '30일 안에 잡힌 지출예정이 없습니다.' }));
    var fundList = h('ul', { class: 'list' }, nextFund.slice(0, 5).map(function (x) {
      return h('li', null, h('span', { class: 'meta fin-date', text: fmt.dot(x.date) }), h('span', { class: 'grow', text: x.name }), ui.tag(F.statusName(x.status), x.status === 'approved' ? 'ok' : 'mute'), h('span', { class: 'num', text: F.man(x.amount) }));
    }));
    if (!nextFund.length) fundList.appendChild(h('li', { class: 'empty', text: '예정된 자금조달이 없습니다.' }));

    var trend = Object.keys(M).sort().slice(-6).map(function (k) { return { label: (+k.slice(5)) + '월', v: M[k].opIn - M[k].opOut, title: k + ' 영업 입금 ' + F.won(M[k].opIn) + ' / 출금 ' + F.won(M[k].opOut) }; });

    var acctList = h('ul', { class: 'list' }, p.bal.accts.map(function (a) {
      return h('li', null, h('div', { class: 'grow' }, h('div', { class: 'strong', text: a.name }), h('div', { class: 'meta', text: F.kindName(a.kind) + (a.date ? ' · ' + fmt.dot(a.date) + ' 기준' : '') + (a.note ? ' · ' + a.note : '') })),
        h('span', { class: 'num', text: F.won(a.bal) }));
    }));
    if (p.owner) acctList.appendChild(h('li', { class: 'fin-owner' }, h('div', { class: 'grow' }, h('div', { class: 'strong', text: '대표 개인자금 (투입 예정)' }), h('div', { class: 'meta', text: '법인 통장 밖 · 자금조달 계획의 「대표 가수금」' })), h('span', { class: 'num', text: F.won(p.owner) })));
    if (!p.bal.accts.length) acctList.appendChild(h('li', { class: 'empty', text: '설정 › 계좌 · 잔액에서 통장을 추가하거나 거래내역을 가져오세요.' }));
    ui.put(view, ui.head('Finance', 'Overview', h('span', { class: 'meta', text: p.bal.asOf ? '잔액 기준 ' + fmt.dot(p.bal.asOf) + (p.bal.src === 'manual' ? ' (직접 입력)' : '') : '' })),
      F.kpi([['법인 통장 잔액', F.man(p.bal.amount), '', p.bal.accts.length ? p.bal.accts.length + '개 계좌' + (p.owner ? ' · 대표 자금 +' + F.man(p.owner) : '') : ''],
        ['월 순소진', p.netBurn > 0 ? F.man(p.netBurn) : '흑자', '', '고정 ' + F.man(p.fixed) + ' + 변동 ' + F.man(p.variable) + ' − 매출 ' + F.man(p.rev)],
        ['런웨이', rw.t, rw.cls, rw.sub],
        ['이번 달 영업 입금', F.man(cur.opIn)], ['이번 달 출금', F.man(cur.opOut)],
        ['30일 지출예정', F.man(upSum), '', up.length + '건']]),
      ui.panel('Accounts · 통장별 잔액', h('a', { href: '#set/accounts', class: 'meta', text: '수정 →' }), acctList,
        h('div', { class: 'fin-total' }, h('span', { text: '법인 합계' }), h('strong', { text: F.won(p.bal.amount) }), p.owner ? h('span', { class: 'meta', text: '대표 자금 포함 ' + F.won(p.bal.amount + p.owner) }) : null)),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Check · 확인할 것', null, alerts),
        ui.panel('Trend · 월 영업 순현금 (최근 6개월)', h('a', { href: '#flow', class: 'meta', text: '현금흐름 →' }), trend.length ? F.bars(trend) : ui.empty('거래내역을 가져오면 표시됩니다.'))),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Upcoming · 30일 지출예정', h('a', { href: '#sched', class: 'meta', text: '전체 →' }), upList),
        ui.panel('Funding · 다가오는 자금조달', h('a', { href: '#plan', class: 'meta', text: '전체 →' }), fundList)),
      h('p', { class: 'note', text: '런웨이 = 현재 잔액에서 매월 (고정 지출예정 + 변동 지출 + 일회성 지출예정 − 매출 + 자금조달)을 더해 처음 0원 아래로 내려가는 달까지. 시나리오는 「기본(확률 반영)」 기준이며 런웨이 메뉴에서 바꿀 수 있습니다. 내부 이체 · 정책자금 · 투자 · 대출 입금은 영업 입금에서 뺍니다.' }));
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
