/* fillts D2C — [CRM] 고객 데이터 · [지표] 재구매 분석
   둘 다 카페24 주문(d2c_orders → HR.D2C.period().valid, 고객키 ckey)에서 계산한다. 실제 주문이 0건이면 「오픈 후 약 5개월」을 가정한 예시를 보여 준다(저장 안 함).
   고객 데이터 = 구매 횟수(F) × 마지막 구매 후 경과일(R)로 나눈 세그먼트 · 메시지 연결
   재구매 분석 = 30/60/90일 2회차 전환율 · 월별 첫 구매 코호트 리텐션 · 1→2회차 구매 간격 · 월별 재구매 매출 비중 */
(function () {
  'use strict';
  var HR = window.HR, ui = HR.ui, h = ui.h, fmt = HR.fmt, L = HR.L;
  var n0 = function (v) { return Math.round(+v || 0).toLocaleString('ko-KR'); };
  var pc = function (a, b) { return b ? (Math.round(a / b * 1000) / 10) + '%' : '—'; };
  function rng(seed) { return function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }

  /* ---------- 고객 단위로 묶기 ---------- */
  function customers(valid) {
    var m = {};
    valid.forEach(function (o) { (m[o.ckey] = m[o.ckey] || []).push(o); });
    return Object.keys(m).map(function (k) {
      var os = m[k].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      return { k: k, orders: os, n: os.length, first: os[0].date, last: os[os.length - 1].date, rev: os.reduce(function (s, o) { return s + +o.amt; }, 0), member: !!os[0].member };
    });
  }
  // 예시: 오픈(11/12) 후 약 5개월(4/15 기준) · 고객 약 330명
  var DEMO_TODAY = '2027-04-15';
  function demoCustomers(D) {
    var rnd = rng(9090), out = [], P = 34200, start = '2026-11-12', days = L.daysBetween(start, DEMO_TODAY);
    for (var i = 0; i < 330; i++) {
      var f = D.addDays(start, Math.floor(Math.pow(rnd(), 0.8) * days)), os = [{ date: f, amt: P * (rnd() < 0.25 ? 2 : 1) }], d = f;
      for (var k = 0; k < 6; k++) {   // 다음 구매: 확률 23% → 이후 40%대, 간격 20~80일
        if (rnd() > (k === 0 ? 0.3 : 0.45)) break;
        d = D.addDays(d, 20 + Math.floor(rnd() * 60)); if (d > DEMO_TODAY) break;
        os.push({ date: d, amt: P * (rnd() < 0.35 ? 2 : 1) });
      }
      out.push({ k: 'c' + i, orders: os, n: os.length, first: f, last: os[os.length - 1].date, rev: os.reduce(function (s, o) { return s + o.amt; }, 0), member: rnd() < 0.74 });
    }
    return out;
  }
  function base() {
    var D = HR.D2C; if (!D || !D.G.loaded) return null;
    var P = D.period();
    if (P.demo) { if (!HR._d2cDemoCust) HR._d2cDemoCust = demoCustomers(D); return { D: D, demo: true, today: DEMO_TODAY, cust: HR._d2cDemoCust }; }
    return { D: D, demo: false, today: fmt.today(), cust: customers(P.valid) };
  }
  function demoNote(view, what) {
    ui.put(view, h('div', { class: 'sa-demo' }, h('strong', { text: '예시 데이터입니다.' }), ' 오픈(11/12) 후 약 5개월이 지난 2027.4.15 시점, 고객 약 330명 · 첫 구매자의 약 30%가 2회차로 넘어간다고 가정한 ' + what + '입니다. 카페24 주문 엑셀을 올리면(현황 › 주문 데이터 올리기) 실제 값으로 바뀝니다.'));
  }

  /* ================= [CRM] 고객 데이터 ================= */
  var SEG = [
    ['new', '신규 1회', '첫 구매 후 60일 이내', function (c, r) { return c.n === 1 && r <= 60; }, '사용법(D+3) · 리뷰 요청(D+8) · 2주 후기(D+14)', '#crmmsg'],
    ['due', '소진 임박 1회', '61~90일 · 7주 소진 지남', function (c, r) { return c.n === 1 && r > 60 && r <= 90; }, '재구매 리마인드 · 2개 세트 · 정기배송 제안', '#crmmsg'],
    ['risk', '이탈 위험 1회', '91~120일', function (c, r) { return c.n === 1 && r > 90 && r <= 120; }, '윈백 1차 — 피부 상태 체크(혜택 없이) → 10% 쿠폰', '#crmmsg'],
    ['sleep', '휴면 1회', '120일 넘게 구매 없음', function (c, r) { return c.n === 1 && r > 120; }, '윈백 마지막 1회 · 신제품(오일) 소식', '#crmmsg'],
    ['two', '재구매 2회', '두 번 산 고객', function (c) { return c.n === 2; }, '정기배송 전환 · 등급 상승 안내', '#crmmsg'],
    ['loyal', '충성 3회 이상', '세 번 이상', function (c) { return c.n >= 3; }, '할인 없이 신제품 선공개 · 손편지 · 의견 청취(바인 클럽)', '#crm']
  ];
  function crmdata(view) {
    var B = base(); if (!B) { ui.put(view, ui.empty('불러오는 중…')); return; }
    var D = B.D, cs = B.cust, tot = cs.length, rev = cs.reduce(function (s, c) { return s + c.rev; }, 0);
    ui.put(view, ui.head('D2C · CRM', '데이터 — 고객 세그먼트', h('span', { class: 'meta', text: (B.demo ? '예시 · ' : '') + fmt.dot(B.today) + ' 기준 · 고객 ' + n0(tot) + '명' })));
    if (B.demo) demoNote(view, '고객 데이터');
    if (!tot) { ui.put(view, ui.empty('주문 데이터가 없습니다. 현황 › 주문 데이터 올리기에서 카페24 주문 엑셀을 올리세요.')); return; }
    var rep = cs.filter(function (c) { return c.n >= 2; }), member = cs.filter(function (c) { return c.member; }).length;
    var segs = SEG.map(function (s) {
      var list = cs.filter(function (c) { return s[3](c, L.daysBetween(c.last, B.today)); });
      return { s: s, list: list, n: list.length, rev: list.reduce(function (a, c) { return a + c.rev; }, 0), age: list.length ? list.reduce(function (a, c) { return a + L.daysBetween(c.last, B.today); }, 0) / list.length : 0 };
    });
    var maxN = Math.max.apply(null, segs.map(function (x) { return x.n; })) || 1;
    var freq = {}; cs.forEach(function (c) { var k = c.n >= 5 ? '5+' : String(c.n); freq[k] = (freq[k] || 0) + 1; });
    ui.put(view,
      h('dl', { class: 'summary sa-kpi' },
        box('고객', n0(tot) + '명', '구매한 적 있는 사람'), box('재구매 고객', pc(rep.length, tot), n0(rep.length) + '명 · 2회 이상'),
        box('고객당 구매', (cs.reduce(function (s, c) { return s + c.n; }, 0) / tot).toFixed(2) + '회', '평균'), box('고객당 매출', D.won(rev / tot), '누적 LTV(매출 기준)'),
        box('회원 구매 비중', pc(member, tot), '비회원은 휴대폰으로 묶음'), box('발송 가능', '—', '수신동의 수는 카페24에서 확인')),
      ui.panel('세그먼트 — 구매 횟수 × 마지막 구매 후 경과일', h('a', { class: 'link', href: '#crmmsg', text: '메시지 문안 →' }),
        h('div', { class: 'table-wrap flat' }, h('table', { class: 'table sa-media ci-seg' },
          h('thead', null, h('tr', null, ['세그먼트', '기준', '고객', '비중', '매출', '평균 경과일', '보낼 메시지'].map(function (c, j) { return h('th', { class: j >= 2 && j <= 5 ? 'num' : '', text: c }); }))),
          h('tbody', null, segs.map(function (x) {
            return h('tr', null, h('td', null, h('span', { class: 'ci-dot ci-' + x.s[0] }), h('span', { class: 'strong', text: x.s[1] })), h('td', { class: 'meta', text: x.s[2] }),
              h('td', { class: 'num' }, h('div', { class: 'ci-n' }, h('span', { class: 'ci-n-b' }, h('span', { style: 'width:' + (x.n / maxN * 100) + '%' })), h('span', { text: n0(x.n) + '명' }))),
              h('td', { class: 'num', text: pc(x.n, tot) }), h('td', { class: 'num', text: D.man(x.rev) + '원' }), h('td', { class: 'num', text: x.n ? Math.round(x.age) + '일' : '—' }),
              h('td', null, h('a', { href: x.s[5], text: x.s[4] })));
          })))),
        h('p', { class: 'meta sa-note', text: '1회 구매 고객은 마지막 구매 후 경과일로 다시 나눕니다(150ml 약 7주 소진 기준). 메시지는 광고성 수신동의자에게만, 10~20시에 보냅니다.' })),
      h('div', { class: 'sa-grid' },
        ui.panel('구매 횟수 분포', null, h('ul', { class: 'sa-share' }, ['1', '2', '3', '4', '5+'].map(function (k) {
          return h('li', null, h('span', { class: 'sa-share-k', text: k + '회' }), h('span', { class: 'sa-share-b' }, h('span', { style: 'width:' + ((freq[k] || 0) / tot * 100) + '%' })), h('span', { class: 'sa-share-v', text: pc(freq[k] || 0, tot) + ' · ' + n0(freq[k] || 0) + '명' }));
        }))),
        ui.panel('세그먼트별 매출 비중', null, h('div', null,
          h('div', { class: 'ci-stack' }, segs.map(function (x) { return x.rev ? h('span', { class: 'ci-' + x.s[0], style: 'width:' + (x.rev / rev * 100) + '%', title: x.s[1] + ' ' + pc(x.rev, rev) }) : null; })),
          h('ul', { class: 'ci-legend' }, segs.map(function (x) { return h('li', null, h('span', { class: 'ci-dot ci-' + x.s[0] }), x.s[1] + ' ', h('span', { class: 'meta', text: pc(x.rev, rev) })); }))))));
  }
  function box(t, v, sub) { return h('div', null, h('dt', { text: t }), h('dd', { text: v }), sub ? h('span', { class: 'sa-sub', text: sub }) : null); }

  /* ================= [지표] 재구매 분석 ================= */
  function repeat(view) {
    var B = base(); if (!B) { ui.put(view, ui.empty('불러오는 중…')); return; }
    var D = B.D, cs = B.cust, today = B.today;
    ui.put(view, ui.head('D2C · 지표', '재구매 분석', h('span', { class: 'meta', text: (B.demo ? '예시 · ' : '') + fmt.dot(today) + ' 기준' })));
    if (B.demo) demoNote(view, '재구매 분석');
    if (!cs.length) { ui.put(view, ui.empty('주문 데이터가 없습니다.')); return; }
    // N일 2회차 전환율 — 첫 구매 후 N일이 지난 고객만 분모
    var conv = function (N) { var base0 = cs.filter(function (c) { return L.daysBetween(c.first, today) >= N; }); var ok = base0.filter(function (c) { return c.n >= 2 && L.daysBetween(c.first, c.orders[1].date) <= N; }); return { a: ok.length, b: base0.length }; };
    var c30 = conv(30), c60 = conv(60), c90 = conv(90);
    var gaps = cs.filter(function (c) { return c.n >= 2; }).map(function (c) { return L.daysBetween(c.first, c.orders[1].date); }).sort(function (a, b) { return a - b; });
    var med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
    var allO = []; cs.forEach(function (c) { c.orders.forEach(function (o, i) { allO.push({ m: o.date.slice(0, 7), amt: +o.amt, rep: i > 0 }); }); });
    var repRev = allO.filter(function (o) { return o.rep; }).reduce(function (s, o) { return s + o.amt; }, 0), totRev = allO.reduce(function (s, o) { return s + o.amt; }, 0);
    ui.put(view,
      h('dl', { class: 'summary sa-kpi' },
        box('30일 2회차 전환율', pc(c30.a, c30.b), n0(c30.a) + ' / ' + n0(c30.b) + '명'),
        box('60일 2회차 전환율', pc(c60.a, c60.b), n0(c60.a) + ' / ' + n0(c60.b) + '명'),
        box('90일 2회차 전환율 ★', pc(c90.a, c90.b), '북극성 · 스킨케어 평균 25~30%'),
        box('1→2회차 간격 (중앙값)', med == null ? '—' : med + '일', '150ml 소진 약 7주(49일) 가정'),
        box('재구매 매출 비중', pc(repRev, totRev), '두 번째 이후 주문의 매출'),
        box('3회차 도달', pc(cs.filter(function (c) { return c.n >= 3; }).length, cs.filter(function (c) { return c.n >= 2; }).length), '2회 고객 중 3회까지 간 비율')),
      ui.panel('월별 첫 구매 코호트 — 그 뒤 몇 %가 다시 샀나', h('span', { class: 'meta', text: 'M1 = 첫 구매 다음 달 · 칸이 진할수록 높음' }), cohort(cs, today)),
      h('div', { class: 'sa-grid' },
        ui.panel('1회차 → 2회차 구매 간격', h('span', { class: 'meta', text: '리마인드 발송일의 근거' }), gapChart(gaps)),
        ui.panel('월별 재구매 매출 비중', h('span', { class: 'meta', text: '검정 = 재구매 · 빨강 = 신규' }), repShare(allO))),
      h('p', { class: 'note' }, '재구매를 올리는 실행 항목(정기배송 · 리마인드 · 적립금 · 등급 등 15개)은 ', h('a', { href: '#retain', text: '재구매 전략 항목' }), '(아래 줄 [핵심전략] › 재구매)에서 상태 · 담당 · 메모로 관리합니다.'));
  }
  function cohort(cs, today) {
    var mi = function (ym) { return +ym.slice(0, 4) * 12 + +ym.slice(5, 7) - 1; }, nowM = mi(today.slice(0, 7));
    var by = {}; cs.forEach(function (c) { var k = c.first.slice(0, 7); (by[k] = by[k] || []).push(c); });
    var keys = Object.keys(by).sort(), maxK = Math.min(6, nowM - mi(keys[0]));
    var cell = function (v) { if (v == null) return h('td', { class: 'ci-cell ci-na', text: '' }); var a = Math.min(v / 0.35, 1); return h('td', { class: 'ci-cell', style: 'background:rgba(200,16,46,' + (0.06 + a * 0.84).toFixed(2) + ');color:' + (a > 0.55 ? '#fff' : '#0a0a0a'), text: (Math.round(v * 1000) / 10) + '%' }); };
    var avg = []; for (var k = 1; k <= maxK; k++) avg[k] = { a: 0, b: 0 };
    var rows = keys.map(function (key) {
      var list = by[key], m0 = mi(key);
      return h('tr', null, h('th', { scope: 'row', text: key.replace('-', '.') }), h('td', { class: 'num', text: n0(list.length) + '명' }),
        (function () { var out = []; for (var k = 1; k <= maxK; k++) {
          if (m0 + k > nowM) { out.push(cell(null)); continue; }
          var n = list.filter(function (c) { return c.orders.some(function (o) { return mi(o.date.slice(0, 7)) === m0 + k; }); }).length;
          if (m0 + k < nowM) { avg[k].a += n; avg[k].b += list.length; }
          out.push(cell(n / list.length));
        } return out; })());
    });
    var head = ['첫 구매 월', '고객'].concat((function () { var a = []; for (var k = 1; k <= maxK; k++) a.push('M' + k); return a; })());
    return h('div', null, h('div', { class: 'table-wrap flat' }, h('table', { class: 'table ci-cohort' },
      h('thead', null, h('tr', null, head.map(function (c, j) { return h('th', { class: j ? 'num' : '', text: c }); }))),
      h('tbody', null, rows, h('tr', { class: 'ci-avg' }, h('th', { scope: 'row', text: '평균(끝난 달만)' }), h('td', { text: '' }),
        (function () { var out = []; for (var k = 1; k <= maxK; k++) out.push(avg[k].b ? cell(avg[k].a / avg[k].b) : cell(null)); return out; })())))),
      h('p', { class: 'meta sa-note', text: '아직 지나지 않은 달은 비워 둡니다. 이번 달 칸은 진행 중이라 평균에서 뺍니다. 스킨케어 참고값 M1 23% · M2 18% · M3 14%(해외 업체 자료).' }));
  }
  function gapChart(gaps) {
    if (!gaps.length) return ui.empty('2회 구매한 고객이 아직 없습니다.');
    var BINS = [[0, 14, '~2주'], [15, 30, '3~4주'], [31, 45, '5~6주'], [46, 60, '7~8주'], [61, 90, '9~12주'], [91, 120, '13~17주'], [121, 99999, '17주~']];
    var cnt = BINS.map(function (b) { return gaps.filter(function (g) { return g >= b[0] && g <= b[1]; }).length; }), mx = Math.max.apply(null, cnt) || 1;
    return h('div', null, h('div', { class: 'ci-hist' }, BINS.map(function (b, i) {
      return h('div', { class: 'ci-hb' + (b[0] === 46 ? ' due' : ''), title: b[2] + ' ' + cnt[i] + '명' }, h('span', { class: 'ci-hb-n', text: cnt[i] }), h('span', { class: 'ci-hb-b' }, h('span', { style: 'height:' + (cnt[i] / mx * 100) + '%' })), h('span', { class: 'ci-hb-k', text: b[2] }));
    })), h('p', { class: 'meta sa-note', text: '빨간 막대 = 7~8주(150ml 소진 예상 구간). 가장 높은 막대보다 1~2주 앞에 재구매 리마인드를 보냅니다.' }));
  }
  function repShare(allO) {
    var m = {}; allO.forEach(function (o) { var x = m[o.m] || (m[o.m] = { n: 0, r: 0 }); x.n += o.amt; if (o.rep) x.r += o.amt; });
    var keys = Object.keys(m).sort(); if (!keys.length) return ui.empty('데이터가 없습니다.');
    return h('ul', { class: 'ci-rs' }, keys.map(function (k) {
      var x = m[k], p = x.n ? x.r / x.n * 100 : 0;
      return h('li', null, h('span', { class: 'ci-rs-k', text: k.replace('-', '.') }),
        h('span', { class: 'ci-rs-b' }, h('span', { class: 'r', style: 'width:' + p + '%' }), h('span', { class: 'n', style: 'width:' + (100 - p) + '%' })),
        h('span', { class: 'ci-rs-v', text: Math.round(p) + '%' }));
    }));
  }

  HR.register('crmdata', { render: crmdata });
  HR.register('repeat', { render: repeat });
})();
