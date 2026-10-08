/* fillts D2C — [매출] 현황: 카페24 주문 엑셀 → 일간 · 월간 추이 · 베스트 상품 · 신규/재구매 · 결제수단 · 유입 · 이슈
   데이터: d2c_orders/{주문번호}(주문 1건 = 1문서, 이름 · 전화번호는 저장하지 않고 고객키는 SHA-256 앞 16자리) · d2c_issues(이슈 기록) · d2c_imports(업로드 기록) · d2c_docs/sales(목표 매출)
   실제 주문이 0건이면 「예시 데이터」(화면에서만 만든 가짜 주문, 저장 안 함)를 보여 준다 — 엑셀을 올리면 자동으로 실제 데이터로 바뀐다 */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, L = HR.L;
  var FV = firebase.firestore.FieldValue;
  var G = { orders: [], issues: [], imports: [], cfg: {}, loaded: false, range: '30', gran: 'day', pending: null, busy: '' };
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    if (prevStart) prevStart(sub);
    sub(db.collection('d2c_orders'), function (s) { G.orders = HR.rows(s); G.loaded = true; });
    sub(db.collection('d2c_issues'), function (s) { G.issues = HR.rows(s).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }); });
    sub(db.collection('d2c_imports').orderBy('at', 'desc').limit(8), function (s) { G.imports = HR.rows(s); });
    sub(db.doc('d2c_docs/sales'), function (s) { G.cfg = s.exists ? s.data() : {}; });
  };
  var canEdit = function () { return S.isAdmin || HR.appLevel('d2c') === 'edit'; };
  var won = function (v) { return Math.round(+v || 0).toLocaleString('ko-KR') + '원'; };
  var man = function (v) { v = +v || 0; return v >= 1e8 ? (v / 1e8).toFixed(v >= 1e9 ? 0 : 2).replace(/\.?0+$/, '') + '억' : v >= 1e4 ? Math.round(v / 1e4).toLocaleString('ko-KR') + '만' : Math.round(v).toLocaleString('ko-KR'); };
  var pct = function (a, b) { return b ? Math.round(a / b * 1000) / 10 + '%' : '—'; };
  var addDays = function (d, n) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  var WD = '일월화수목금토';

  /* ================= 예시 데이터 (저장하지 않음) ================= */
  // 정가 38,000 · 상시 10% → 34,200원/개 · 11/12 오픈 ~ 12/21 · 누적 약 500만원
  function sample() {
    var seed = 20261112; var rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    var pick = function (arr) { var r = rnd(), s = 0; for (var i = 0; i < arr.length; i++) { s += arr[i][1]; if (r < s) return arr[i][0]; } return arr[arr.length - 1][0]; };
    // 예시는 rep: 0.5 — 모든 날 매출 · 주문의 절반을 재구매로 표시
    var P = 34200, out = [], custs = [], n = 0, start = '2026-11-12';
    var daily = function (i, d) {
      var wd = new Date(d + 'T00:00:00Z').getUTCDay();
      var base = i < 3 ? [8, 5, 4][i] : 1.9 + 1.0 * Math.exp(-(i - 3) / 6);
      if (d >= '2026-12-01' && d <= '2026-12-20') base += 1.1;   // 연말 선물
      if (wd === 0 || wd === 6) base *= 0.75;
      return Math.max(0, Math.round(base + (rnd() - 0.5) * 2));
    };
    for (var i = 0; i < 40; i++) {
      var d = addDays(start, i), k = daily(i, d);
      for (var j = 0; j < k; j++) {
        n++;
        var rep = i > 30 && custs.length && rnd() < 0.28, ck = rep ? custs[Math.floor(rnd() * Math.min(custs.length, 40))] : 's' + n;
        if (!rep) custs.push(ck);
        var gift = d >= '2026-12-01' && rnd() < 0.18;
        var q = gift ? 2 : pick([[1, 0.74], [2, 0.21], [3, 0.05]]);
        var item = gift ? { n: '[홀리데이] 젤클렌저 선물세트', o: '2개 + 미니 · 기프트박스', q: 1, a: P * 2 } : { n: '바인그라피 젤클렌저 150ml', o: q + '개', q: q, a: P * q };
        var hr = pick([[1, 0.04], [8, 0.06], [10, 0.08], [12, 0.12], [15, 0.1], [19, 0.18], [21, 0.24], [23, 0.18]]);
        out.push({ id: 'EX' + (100000 + n), rep: 0.5, no: '20261112-' + (100000 + n), date: d, hour: hr, amt: item.a, items: [item], cancel: rnd() < 0.03, status: '',
          method: pick([['네이버페이', 0.36], ['카카오페이', 0.24], ['신용카드', 0.3], ['토스페이', 0.1]]),
          src: pick([['meta', 0.38], ['youtube', 0.22], ['naver', 0.18], ['direct', 0.14], ['kakao', 0.08]]),
          coupon: rnd() < 0.3 ? 'VG-WELCOME' : '', ckey: ck, member: rnd() < 0.72 });
      }
    }
    return out;
  }

  /* ================= 계산 ================= */
  function dataset() {
    if (G.orders.length) return { orders: G.orders, demo: false };
    if (!G.demo) G.demo = sample();
    return { orders: G.demo, demo: true };
  }
  function prep(orders) {
    var valid = orders.filter(function (o) { return !o.cancel && +o.amt > 0 && o.date; })
      .sort(function (a, b) { return (a.date + (a.hour || 0)) < (b.date + (b.hour || 0)) ? -1 : 1; });
    var seen = {};
    valid.forEach(function (o) { o._rep = o.rep != null ? +o.rep : seen[o.ckey] ? 1 : 0; o._new = o._rep < 1; seen[o.ckey] = 1; });   // 재구매 비중(0~1): 그 고객의 첫 유효 주문 = 신규 0 · 이후 = 1 (예시는 0.5 고정)
    return valid;
  }
  function stats(list, all) {
    var sales = 0, cust = {}, nw = 0, nwS = 0;
    list.forEach(function (o) { sales += +o.amt; cust[o.ckey] = 1; nw += 1 - o._rep; nwS += +o.amt * (1 - o._rep); });
    var n = list.length, cancels = (all || []).filter(function (o) { return o.cancel; }).length;
    return { sales: sales, orders: n, aov: n ? sales / n : 0, cust: Object.keys(cust).length, newO: nw, repO: n - nw, repS: sales - nwS, cancelRate: all && all.length ? cancels / all.length : 0, cancels: cancels };
  }
  function rangeOf(anchor, first) {
    var r = G.range;
    if (r === 'all') return [first, anchor];
    if (r === 'month') return [anchor.slice(0, 8) + '01', anchor];
    if (r === 'prev') { var p = L.addMonths(anchor.slice(0, 8) + '01', -1); return [p, addDays(anchor.slice(0, 8) + '01', -1)]; }
    return [addDays(anchor, -(+r - 1)), anchor];
  }
  var inR = function (o, a, b) { return o.date >= a && o.date <= b; };

  /* ================= 화면 ================= */
  function render(view) {
    if (!G.loaded) { ui.put(view, ui.empty('불러오는 중…')); return; }
    var ds = dataset(), valid = prep(ds.orders), all = ds.orders;
    var last = valid.length ? valid[valid.length - 1].date : fmt.today();
    var anchor = ds.demo ? last : fmt.today(), first = valid.length ? valid[0].date : anchor;
    var R = rangeOf(anchor, first), len = L.daysBetween(R[0], R[1]) + 1;
    var P = G.range === 'month' || G.range === 'prev' ? [L.addMonths(R[0], -1), addDays(R[0], -1)] : [addDays(R[0], -len), addDays(R[0], -1)];
    var cur = valid.filter(function (o) { return inR(o, R[0], R[1]); }), prev = valid.filter(function (o) { return inR(o, P[0], P[1]); });
    var st = stats(cur, all.filter(function (o) { return inR(o, R[0], R[1]); })), sp = stats(prev, all.filter(function (o) { return inR(o, P[0], P[1]); }));
    var total = stats(valid).sales, goal = +G.cfg.goal || 300000000;

    ui.put(view, ui.head('D2C · 매출', '자사몰 현황', h('span', { class: 'meta', text: ds.demo ? '예시 데이터 · 저장 안 됨' : '마지막 주문 ' + fmt.dot(last) + ' · ' + G.orders.length.toLocaleString() + '건' })));
    if (ds.demo) ui.put(view, h('div', { class: 'sa-demo' }, h('strong', { text: '예시 데이터입니다.' }),
      ' 정가 38,000원 · 상시 10% 할인(34,200원)으로 11/12 오픈 후 40일을 가정한 가짜 주문입니다. 아래 「주문 데이터 올리기」로 카페24 주문 엑셀을 올리면 실제 데이터로 바뀌고, 이 예시는 사라집니다.'));
    ui.put(view,
      goalBox(total, goal, first, last),
      filters(),
      h('dl', { class: 'summary sa-kpi' },
        kpi('순매출', won(st.sales), delta(st.sales, sp.sales)), kpi('주문', st.orders.toLocaleString() + '건', delta(st.orders, sp.orders)),
        kpi('객단가', won(st.aov), delta(st.aov, sp.aov)), kpi('구매 고객', st.cust.toLocaleString() + '명', delta(st.cust, sp.cust)),
        kpi('재구매 주문 비중', pct(st.repO, st.orders), '재구매 매출 ' + man(st.repS) + '원'), kpi('취소 · 환불률', pct(st.cancels, st.cancels + st.orders), st.cancels + '건', st.cancelRate > 0.05 ? 'red' : '')),
      h('p', { class: 'meta sa-period', text: fmt.dot(R[0]) + ' ~ ' + fmt.dot(R[1]) + ' · 비교 ' + fmt.dot(P[0]) + ' ~ ' + fmt.dot(P[1]) + ' · 취소 · 환불 · 0원(시딩) 주문은 매출에서 뺍니다' }),
      ui.panel(G.gran === 'day' ? '일간 순매출' : '월간 순매출', h('span', { class: 'meta', text: '막대에 올리면 주문 · 객단가 · 신규/재구매' }), trend(G.gran === 'day' ? cur : valid, G.gran, R)),
      h('div', { class: 'sa-grid' },
        ui.panel('베스트 상품', h('span', { class: 'meta', text: '판매 수량 순' }), best(cur)),
        ui.panel('이슈', null, issues(valid, all, st, anchor, ds.demo)),
        ui.panel('신규 vs 재구매', null, split(st)),
        ui.panel('요일 · 시간대', h('span', { class: 'meta', text: '주문 건수' }), weekHour(cur)),
        ui.panel('결제수단', null, share(cur, 'method')),
        ui.panel('유입 경로', h('span', { class: 'meta', text: 'UTM · 쿠폰코드 기준' }), share(cur, 'src'))),
      upload());
  }
  function kpi(t, v, sub, cls) { return h('div', null, h('dt', { text: t }), h('dd', { class: cls || '', text: v }), sub ? (typeof sub === 'string' ? h('span', { class: 'sa-sub', text: sub }) : sub) : null); }
  function delta(a, b) {
    if (!b) return h('span', { class: 'sa-sub', text: '비교 기간 없음' });
    var d = (a - b) / b * 100;
    return h('span', { class: 'sa-sub ' + (d < 0 ? 'sa-down' : 'sa-up'), text: (d >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(d)) + '% · 이전 기간 대비' });
  }
  function goalBox(total, goal, first, last) {
    var p = goal ? Math.min(total / goal, 1) : 0, ed = canEdit();
    var inp = ui.input({ type: 'number', value: goal, class: 'sa-goal-in', disabled: !ed, 'aria-label': '목표 매출(원)' });
    inp.addEventListener('change', function () { db.doc('d2c_docs/sales').set({ goal: +inp.value || 0, updatedAt: FV.serverTimestamp(), updatedBy: S.mid || '' }, { merge: true }).then(function () { ui.toast('목표를 저장했습니다.'); }).catch(function (e) { ui.toast('저장하지 못했습니다 — ' + (e.code || e.message)); }); });
    var days = L.daysBetween(first, last) + 1, perDay = days ? total / days : 0;
    return h('section', { class: 'sa-goal' },
      h('div', { class: 'sa-goal-h' }, h('div', null, h('div', { class: 'label', text: '목표 대비 누적 매출' }), h('div', { class: 'sa-goal-v' }, h('strong', { text: man(total) + '원' }), ' / ' + man(goal) + '원 · ', h('strong', { class: 'red', text: (Math.round(p * 1000) / 10) + '%' }))),
        h('label', { class: 'sa-goal-l' }, '목표(원) ', inp)),
      h('div', { class: 'sa-goal-bar' }, h('span', { style: 'width:' + Math.max(p * 100, 0.4) + '%' })),
      h('p', { class: 'meta', text: '오픈 후 ' + days + '일 · 하루 평균 ' + man(perDay) + '원 · 이 속도면 목표까지 약 ' + (perDay ? Math.ceil((goal - total) / perDay).toLocaleString() + '일' : '—') + ' · 남은 금액 ' + man(Math.max(goal - total, 0)) + '원' }));
  }
  function filters() {
    var set = function (k, v) { return function () { G[k] = v; if (k === 'range' && (v === 'all')) G.gran = 'month'; if (k === 'range' && v !== 'all') G.gran = 'day'; HR.refresh(); }; };
    var seg = function (k, opts) { return h('div', { class: 'sa-seg', role: 'group' }, opts.map(function (o) { return h('button', { type: 'button', class: G[k] === o[0] ? 'on' : '', 'aria-pressed': String(G[k] === o[0]), onclick: set(k, o[0]), text: o[1] }); })); };
    return h('div', { class: 'sa-filters' }, seg('range', [['7', '최근 7일'], ['30', '최근 30일'], ['month', '이번 달'], ['prev', '지난 달'], ['all', '전체']]), seg('gran', [['day', '일간'], ['month', '월간']]));
  }

  /* ---------- 추이 차트 (SVG · 막대 1계열 · 호버 툴팁) ---------- */
  function trend(list, gran, R) {
    var keys = [], m = {};
    if (gran === 'day') { for (var d = R[0]; d <= R[1]; d = addDays(d, 1)) keys.push(d); }
    else { list.forEach(function (o) { var k = o.date.slice(0, 7); if (keys.indexOf(k) < 0) keys.push(k); }); keys.sort(); }
    keys.forEach(function (k) { m[k] = { k: k, s: 0, n: 0, nw: 0, rs: 0 }; });
    list.forEach(function (o) { var k = gran === 'day' ? o.date : o.date.slice(0, 7); if (m[k]) { m[k].s += +o.amt; m[k].n++; m[k].nw += 1 - o._rep; m[k].rs += +o.amt * o._rep; } });
    var rows = keys.map(function (k) { return m[k]; });
    if (!rows.length) return ui.empty('이 기간에 주문이 없습니다.');
    var W = 960, H = 240, pl = 52, pr = 8, pt = 12, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
    var max = Math.max.apply(null, rows.map(function (r) { return r.s; })) || 1, step = niceStep(max / 4), top = Math.ceil(max / step) * step;
    var bw = iw / rows.length, gap = Math.min(Math.max(bw * 0.25, 2), 10), ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'sa-chart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', (gran === 'day' ? '일간' : '월간') + ' 순매출 막대 차트');
    var el = function (tag, a, txt) { var e = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; };
    for (var v = 0; v <= top; v += step) { var y = pt + ih - v / top * ih; el('line', { x1: pl, x2: W - pr, y1: y, y2: y, class: v ? 'sa-grid-l' : 'sa-base' }); el('text', { x: pl - 8, y: y + 4, 'text-anchor': 'end', class: 'sa-ax' }, man(v)); }
    var every = Math.ceil(rows.length / 12);
    var wrap = h('div', { class: 'sa-chart-wrap' }), tip = h('div', { class: 'sa-tip', hidden: true });
    rows.forEach(function (r, i) {
      var x = pl + i * bw + gap / 2, w = Math.max(bw - gap, 1), bh = r.s / top * ih, y = pt + ih - bh;
      if (bh > 0) {
        var rh = r.rs / top * ih, nh = bh - rh, g2 = rh > 0 && nh > 0 ? 2 : 0, base = pt + ih;
        var bar = function (y0, hh, cls, round) {   // 위쪽만 4px 둥근 막대 (round=false면 각진 위)
          if (hh <= 0) return; var yy = y0 - hh, rr = round ? Math.min(4, w / 2, hh) : 0;
          el('path', { d: 'M' + x + ',' + y0 + 'V' + (yy + rr) + 'Q' + x + ',' + yy + ' ' + (x + rr) + ',' + yy + 'H' + (x + w - rr) + 'Q' + (x + w) + ',' + yy + ' ' + (x + w) + ',' + (yy + rr) + 'V' + y0 + 'Z', class: cls, 'data-i': i });
        };
        bar(base, rh - g2 / 2, 'sa-bar', nh <= 0);   // 아래: 재구매 (검정)
        bar(base - rh - g2 / 2, nh - g2 / 2, 'sa-bar sa-bar-r', true);   // 위: 신규 (빨강)
        if (rh >= 16 && w >= 20) el('text', { x: x + w / 2, y: base - rh / 2 + 4, 'text-anchor': 'middle', class: 'sa-bar-t' }, Math.round(r.rs / r.s * 100) + '%');
      }
      if (i % every === 0) { var lab = gran === 'day' ? (+r.k.slice(5, 7)) + '/' + (+r.k.slice(8)) : (+r.k.slice(2, 4)) + '.' + r.k.slice(5); el('text', { x: pl + i * bw + bw / 2, y: H - 8, 'text-anchor': 'middle', class: 'sa-ax' }, lab); }
      var hit = el('rect', { x: pl + i * bw, y: pt, width: bw, height: ih, class: 'sa-hit' });
      hit.addEventListener('mouseenter', function () {
        svg.querySelectorAll('.sa-bar').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-i') === i); });
        ui.clear(tip); ui.put(tip, h('div', { class: 'strong', text: gran === 'day' ? fmt.dot(r.k) + ' (' + WD[new Date(r.k + 'T00:00:00Z').getUTCDay()] + ')' : r.k.replace('-', '.') }),
          h('div', { text: '순매출 ' + won(r.s) }), h('div', { class: 'red', text: '신규 ' + won(r.s - r.rs) }), h('div', { text: '재구매 ' + won(r.rs) + ' · ' + (r.s ? Math.round(r.rs / r.s * 100) : 0) + '%' }), h('div', { text: '주문 ' + r.n + '건 · 객단가 ' + (r.n ? won(r.s / r.n) : '—') }), h('div', { class: 'meta', text: '신규 ' + Math.round(r.nw) + ' · 재구매 ' + Math.round(r.n - r.nw) + '건' }));
        tip.hidden = false; var px = (pl + i * bw + bw / 2) / W * 100; tip.style.left = Math.min(Math.max(px, 12), 84) + '%';
      });
      hit.addEventListener('mouseleave', function () { tip.hidden = true; svg.querySelectorAll('.sa-bar.on').forEach(function (b) { b.classList.remove('on'); }); });
    });
    wrap.appendChild(svg); wrap.appendChild(tip);
    var tbl = h('details', { class: 'sa-table' }, h('summary', { text: '표로 보기' }), h('div', { class: 'table-wrap flat' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['기간', '순매출', '재구매 매출', '주문', '객단가', '신규', '재구매'].map(function (c, j) { return h('th', { class: j ? 'num' : '', text: c }); }))),
      h('tbody', null, rows.slice().reverse().filter(function (r) { return r.n; }).map(function (r) { return h('tr', null, h('td', { text: gran === 'day' ? fmt.dot(r.k) : r.k }), h('td', { class: 'num', text: won(r.s) }), h('td', { class: 'num', text: won(r.rs) + ' · ' + Math.round(r.rs / r.s * 100) + '%' }), h('td', { class: 'num', text: r.n }), h('td', { class: 'num', text: won(r.s / r.n) }), h('td', { class: 'num', text: Math.round(r.nw) }), h('td', { class: 'num', text: Math.round(r.n - r.nw) })); })))));
    var legend = h('div', { class: 'sa-legend' }, h('span', null, h('i', { class: 'sw sw-n' }), '신규 매출 (위 · 빨강)'), h('span', null, h('i', { class: 'sw sw-r' }), '재구매 매출 (아래 · 검정, 칸 안 숫자 = 그날 재구매 비중)'));
    return h('div', null, legend, wrap, tbl);
  }
  function niceStep(x) { var p = Math.pow(10, Math.floor(Math.log10(x || 1))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

  /* ---------- 베스트 · 비중 ---------- */
  function best(list) {
    var m = {};
    list.forEach(function (o) {
      var items = o.items || [], qsum = items.reduce(function (s, x) { return s + (+x.q || 1); }, 0) || 1;
      items.forEach(function (x) {
        var k = x.n + (x.o ? ' · ' + x.o : ''); if (!m[k]) m[k] = { n: x.n, o: x.o || '', q: 0, a: 0, c: 0 };
        m[k].q += +x.q || 1; m[k].a += +x.a || +o.amt * (+x.q || 1) / qsum; m[k].c++;
      });
    });
    var rows = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.q - a.q || b.a - a.a; }).slice(0, 10);
    if (!rows.length) return ui.empty('판매된 상품이 없습니다.');
    var tot = rows.reduce(function (s, r) { return s + r.a; }, 0) || 1;
    return h('ol', { class: 'sa-best' }, rows.map(function (r, i) {
      return h('li', null, h('span', { class: 'sa-rank' + (i < 3 ? ' top' : ''), text: i + 1 }),
        h('div', { class: 'grow' }, h('div', { class: 'strong', text: r.n }), r.o ? h('div', { class: 'meta', text: r.o }) : null, h('div', { class: 'sa-mini' }, h('span', { style: 'width:' + (r.a / tot * 100) + '%' }))),
        h('div', { class: 'sa-best-v' }, h('div', { class: 'strong', text: r.q.toLocaleString() + '개' }), h('div', { class: 'meta', text: man(r.a) + '원 · ' + Math.round(r.a / tot * 100) + '%' })));
    }));
  }
  function share(list, key) {
    var m = {}; list.forEach(function (o) { var k = o[key] || '(미기재)'; m[k] = (m[k] || 0) + 1; });
    var rows = Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    if (!rows.length) return ui.empty('데이터가 없습니다.');
    var tot = list.length || 1;
    return h('ul', { class: 'sa-share' }, rows.map(function (r) {
      return h('li', null, h('span', { class: 'sa-share-k', text: r[0] }), h('span', { class: 'sa-share-b' }, h('span', { style: 'width:' + (r[1] / tot * 100) + '%' })), h('span', { class: 'sa-share-v', text: Math.round(r[1] / tot * 100) + '% · ' + r[1] + '건' }));
    }));
  }
  function split(st) {
    if (!st.orders) return ui.empty('데이터가 없습니다.');
    var a = st.newO / st.orders * 100;
    return h('div', null,
      h('div', { class: 'sa-split' }, h('span', { class: 'sa-split-n', style: 'width:' + a + '%' }), h('span', { class: 'sa-split-r', style: 'width:' + (100 - a) + '%' })),
      h('dl', { class: 'sa-split-l' },
        h('div', null, h('dt', null, h('i', { class: 'sw sw-n' }), '신규 주문'), h('dd', { text: Math.round(st.newO) + '건 · ' + Math.round(a) + '%' })),
        h('div', null, h('dt', null, h('i', { class: 'sw sw-r' }), '재구매 주문'), h('dd', { text: Math.round(st.repO) + '건 · ' + Math.round(100 - a) + '%' }))),
      h('p', { class: 'meta', text: '재구매 = 같은 고객(회원ID 또는 휴대폰)의 두 번째 이후 주문. 오픈 후 약 7주(소진 주기)가 지나야 늘어나기 시작합니다.' }));
  }
  function weekHour(list) {
    var w = [0, 0, 0, 0, 0, 0, 0], hb = { '새벽 0~6': 0, '오전 6~12': 0, '오후 12~18': 0, '저녁 18~21': 0, '밤 21~24': 0 }, hasH = false;
    list.forEach(function (o) {
      w[new Date(o.date + 'T00:00:00Z').getUTCDay()]++;
      if (o.hour != null && o.hour !== '') { hasH = true; var x = +o.hour; hb[x < 6 ? '새벽 0~6' : x < 12 ? '오전 6~12' : x < 18 ? '오후 12~18' : x < 21 ? '저녁 18~21' : '밤 21~24']++; }
    });
    var mw = Math.max.apply(null, w) || 1, order = [1, 2, 3, 4, 5, 6, 0];
    return h('div', null,
      h('div', { class: 'sa-week' }, order.map(function (i) { return h('div', { class: 'sa-wd', title: WD[i] + ' ' + w[i] + '건' }, h('span', { class: 'sa-wd-b' }, h('span', { style: 'height:' + (w[i] / mw * 100) + '%' })), h('span', { class: 'sa-wd-n', text: w[i] }), h('span', { class: 'sa-wd-k', text: WD[i] })); })),
      hasH ? h('ul', { class: 'sa-share' }, Object.keys(hb).map(function (k) { return h('li', null, h('span', { class: 'sa-share-k', text: k }), h('span', { class: 'sa-share-b' }, h('span', { style: 'width:' + (hb[k] / (list.length || 1) * 100) + '%' })), h('span', { class: 'sa-share-v', text: hb[k] + '건' })); })) : null);
  }

  /* ---------- 이슈: 자동 감지 + 직접 기록 ---------- */
  function issues(valid, all, st, anchor, demo) {
    var auto = [], day = {};
    valid.forEach(function (o) { day[o.date] = (day[o.date] || 0) + +o.amt; });
    var sum = function (a, b) { var s = 0; for (var d = a; d <= b; d = addDays(d, 1)) s += day[d] || 0; return s; };
    var w1 = sum(addDays(anchor, -6), anchor), w0 = sum(addDays(anchor, -13), addDays(anchor, -7));
    if (w0 && w1 < w0 * 0.7) auto.push(['red', '최근 7일 매출이 직전 7일보다 ' + Math.round((1 - w1 / w0) * 100) + '% 줄었습니다', '광고 소재 피로 · 품절 · 결제 오류를 먼저 확인']);
    if (w0 && w1 > w0 * 1.3) auto.push(['', '최근 7일 매출이 직전 7일보다 ' + Math.round((w1 / w0 - 1) * 100) + '% 늘었습니다', '어떤 유입이 늘었는지 유입 경로에서 확인 · 재고 확인']);
    if (st.cancelRate > 0.05) auto.push(['red', '취소 · 환불률 ' + Math.round(st.cancelRate * 100) + '% (5% 초과)', 'CS 태그에서 사유 확인']);
    var lastD = valid.length ? valid[valid.length - 1].date : '';
    if (!demo && lastD && L.daysBetween(lastD, fmt.today()) >= 3) auto.push(['red', '마지막 주문이 ' + L.daysBetween(lastD, fmt.today()) + '일 전입니다', '엑셀을 최근 것으로 다시 올렸는지 확인']);
    var zero = 0; if (valid.length) for (var d = valid[0].date; d <= anchor; d = addDays(d, 1)) if (!day[d]) zero++;
    if (zero) auto.push(['', '오픈 후 주문 0건인 날 ' + zero + '일', '그날 광고 · 사이트 상태 확인']);
    if (st.orders && st.repO === 0 && valid.length && L.daysBetween(valid[0].date, anchor) > 50) auto.push(['red', '오픈 50일이 지났는데 재구매 주문이 없습니다', '재구매 리마인드(D+35·45) 발송 여부 확인']);

    var ed = canEdit();
    var t = ui.input({ placeholder: '이슈 기록 — 예: 12/3 네이버페이 결제 오류 2시간', maxlength: 160 });
    var kind = ui.select([['ops', '운영'], ['stock', '재고 · 물류'], ['pay', '결제 · 사이트'], ['ad', '광고 · 유입'], ['cs', 'CS'], ['etc', '기타']], 'ops');
    var go = function () {
      var v = t.value.trim(); if (!v) return t.focus();
      db.collection('d2c_issues').add({ t: v, kind: kind.value, date: fmt.today(), done: false, by: S.mid || '', at: FV.serverTimestamp() })
        .then(function () { t.value = ''; ui.toast('기록했습니다.'); }).catch(function (e) { ui.toast('기록하지 못했습니다 — ' + (e.code || e.message)); });
    };
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
    var KN = { ops: '운영', stock: '재고 · 물류', pay: '결제 · 사이트', ad: '광고 · 유입', cs: 'CS', etc: '기타' };
    return h('div', null,
      auto.length ? h('ul', { class: 'sa-issues' }, auto.map(function (a) { return h('li', { class: a[0] ? 'sa-iss-red' : '' }, h('span', { class: 'sa-iss-dot' }), h('div', null, h('div', { class: 'strong', text: a[1] }), h('div', { class: 'meta', text: a[2] }))); }))
        : h('p', { class: 'meta', text: '자동 감지된 이슈가 없습니다.' }),
      G.issues.length ? h('ul', { class: 'sa-log' }, G.issues.slice(0, 12).map(function (x) {
        var cb = h('input', { type: 'checkbox', checked: !!x.done, disabled: !ed, 'aria-label': '해결' });
        cb.addEventListener('change', function () { db.collection('d2c_issues').doc(x.id).set({ done: cb.checked }, { merge: true }); });
        return h('li', { class: x.done ? 'done' : '' }, cb, h('span', { class: 'sa-log-d', text: fmt.dot(x.date || '').slice(5) }), h('span', { class: 'sa-log-k', text: KN[x.kind] || '' }), h('span', { class: 'grow', text: x.t }),
          ed ? ui.confirmBtn('삭제', function () { db.collection('d2c_issues').doc(x.id).delete(); }) : null);
      })) : null,
      ed ? h('div', { class: 'sa-iss-add' }, t, kind, ui.btn('기록', go, 'btn-sm')) : null);
  }

  /* ================= 주문 엑셀 올리기 ================= */
  var FIELDS = [
    ['no', '주문번호', 1, [/^주문\s*번호$/, /주문\s*번호/]],
    ['dt', '주문일시', 1, [/주문\s*일시/, /^주문일$/, /주문\s*일자/, /결제\s*일시/, /결제\s*일/]],
    ['pay', '결제금액(주문)', 0, [/총\s*실?\s*결제\s*금액/, /실\s*결제\s*금액/, /^결제\s*금액/, /총\s*주문\s*금액/]],
    ['item', '상품명', 0, [/^상품\s*명/, /상품\s*명/]],
    ['opt', '옵션', 0, [/상품\s*옵션/, /옵션/]],
    ['qty', '수량', 0, [/^수량$/, /주문\s*수량/, /수량/]],
    ['itemAmt', '상품 금액', 0, [/상품\s*구매\s*금액/, /상품\s*별?\s*금액/, /판매\s*가/]],
    ['status', '주문상태', 0, [/주문\s*상태/, /처리\s*상태/, /^상태$/]],
    ['mem', '회원ID', 0, [/회원\s*아이디/, /회원\s*ID/i, /주문자\s*ID/i, /^아이디$/]],
    ['phone', '주문자 휴대전화', 0, [/주문자.*휴대/, /주문자.*연락처/, /주문자.*전화/]],
    ['method', '결제수단', 0, [/결제\s*수단/, /결제\s*방법/]],
    ['coupon', '쿠폰', 0, [/사용.*쿠폰/, /쿠폰\s*(명|코드|이름)/, /^쿠폰$/]],
    ['src', '유입 경로', 0, [/유입\s*경로/, /주문\s*경로/, /유입\s*채널/, /utm_source/i]]
  ];
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = '../fin/vendor/xlsx.full.min.js?v=2610080420'; s.onload = ok; s.onerror = function () { no(new Error('엑셀 읽기 도구를 불러오지 못했습니다')); }; document.head.appendChild(s); });
  }
  function readFile(file) {
    return loadXLSX().then(function () { return file.arrayBuffer(); }).then(function (buf) {
      var wb;
      if (/\.csv$/i.test(file.name)) {
        var bytes = new Uint8Array(buf), text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { text = new TextDecoder('euc-kr').decode(bytes); }
        wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true });
      } else wb = XLSX.read(buf, { type: 'array' });
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      var hi = -1; for (var i = 0; i < Math.min(rows.length, 20); i++) if (rows[i].some(function (c) { return /주문\s*번호/.test(String(c)); })) { hi = i; break; }
      if (hi < 0) throw new Error('「주문번호」 열을 찾지 못했습니다. 카페24 주문 엑셀이 맞는지 확인하세요.');
      var head = rows[hi].map(function (c) { return String(c).trim(); }), map = {}, used = {};
      FIELDS.forEach(function (f) { f[3].some(function (re) { var j = head.findIndex(function (x, k) { return !used[k] && re.test(x); }); if (j >= 0) { map[f[0]] = j; used[j] = 1; return true; } return false; }); });
      return { name: file.name, head: head, map: map, body: rows.slice(hi + 1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); }) };
    });
  }
  var num = function (v) { if (typeof v === 'number') return v; var s = String(v || '').replace(/[^\d.\-]/g, ''); return s ? +s : 0; };
  function toDate(v) {
    if (typeof v === 'number' && v > 20000) { var d = new Date(Math.round((v - 25569) * 86400000)); return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() }; }
    var m = String(v || '').match(/(\d{4})[-.\/년\s]+(\d{1,2})[-.\/월\s]+(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    return { date: m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2), hour: m[4] != null ? +m[4] : null };
  }
  function hash(s) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode('fillts-d2c|' + s)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').slice(0, 16); }); }
  function build(p) {
    var M = p.map, g = function (r, k) { return M[k] != null ? r[M[k]] : ''; }, by = {}, order = [];
    p.body.forEach(function (r) {
      var no = String(g(r, 'no')).trim(); if (!no) return;
      var o = by[no];
      if (!o) {
        var t = toDate(g(r, 'dt')); if (!t) return;
        o = by[no] = { no: no, date: t.date, hour: t.hour, pay: 0, sumItems: 0, items: [], status: String(g(r, 'status') || ''), method: String(g(r, 'method') || ''), coupon: String(g(r, 'coupon') || ''), src: String(g(r, 'src') || '').toLowerCase(),
          key: String(g(r, 'mem') || '').trim() ? 'm:' + String(g(r, 'mem')).trim() : String(g(r, 'phone') || '').replace(/\D/g, '') ? 'p:' + String(g(r, 'phone')).replace(/\D/g, '') : 'o:' + no, member: !!String(g(r, 'mem') || '').trim() };
        order.push(o);
      }
      o.pay = Math.max(o.pay, num(g(r, 'pay')));
      if (M.item != null && String(g(r, 'item')).trim()) { var q = num(g(r, 'qty')) || 1, a = num(g(r, 'itemAmt')); o.items.push({ n: String(g(r, 'item')).trim(), o: String(g(r, 'opt') || '').trim(), q: q, a: a }); o.sumItems += a; }
      if (/취소|환불|반품/.test(String(g(r, 'status')))) o.status = String(g(r, 'status'));
    });
    order.forEach(function (o) { o.amt = o.pay || o.sumItems; o.cancel = /취소|환불|반품/.test(o.status); });
    return order;
  }
  function doImport() {
    var p = G.pending; if (!p) return;
    var list = build(p); if (!list.length) { ui.toast('읽을 수 있는 주문이 없습니다 — 주문번호 · 주문일시 열을 확인하세요.'); return; }
    G.busy = '저장 중… 0 / ' + list.length; HR.refresh();
    var have = {}; G.orders.forEach(function (o) { have[o.id] = 1; });
    Promise.all(list.map(function (o) { return hash(o.key).then(function (k) { o.ckey = k; }); })).then(function () {
      var chunks = []; for (var i = 0; i < list.length; i += 400) chunks.push(list.slice(i, i + 400));
      var added = 0, done = 0;
      return chunks.reduce(function (pr, c) {
        return pr.then(function () {
          var b = db.batch();
          c.forEach(function (o) {
            var id = o.no.replace(/[\/\s]/g, '_'); if (!have[id]) added++;
            b.set(db.collection('d2c_orders').doc(id), { no: o.no, date: o.date, hour: o.hour, amt: o.amt, items: o.items.slice(0, 30), status: o.status.slice(0, 40), cancel: o.cancel, method: o.method.slice(0, 30), coupon: o.coupon.slice(0, 60), src: o.src.slice(0, 60), ckey: o.ckey, member: o.member, file: p.name.slice(0, 120), by: S.mid || '', at: FV.serverTimestamp() });
          });
          return b.commit().then(function () { done += c.length; G.busy = '저장 중… ' + done + ' / ' + list.length; HR.refresh(); });
        });
      }, Promise.resolve()).then(function () {
        return db.collection('d2c_imports').add({ file: p.name.slice(0, 120), rows: p.body.length, orders: list.length, added: added, updated: list.length - added, by: S.mid || '', at: FV.serverTimestamp() }).then(function () { return added; });
      });
    }).then(function (added) { G.pending = null; G.busy = ''; ui.toast('주문 ' + list.length + '건 반영 (새 주문 ' + added + '건)'); HR.refresh(); })
      .catch(function (e) { G.busy = ''; ui.toast('저장하지 못했습니다 — ' + (e.code || e.message)); HR.refresh(); });
  }
  function upload() {
    var ed = canEdit(), p = G.pending;
    var file = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', disabled: !ed || !!G.busy });
    file.addEventListener('change', function () {
      var f = file.files[0]; if (!f) return;
      G.busy = '읽는 중…'; HR.refresh();
      readFile(f).then(function (r) { G.pending = r; G.busy = ''; HR.refresh(); }).catch(function (e) { G.busy = ''; G.pending = null; ui.toast(e.message); HR.refresh(); });
    });
    var body = [h('ol', { class: 'sa-howto' },
      h('li', null, '카페24 관리자 › 주문 › 주문 조회(전체 주문) › 기간 선택 › ', h('strong', { text: '엑셀 다운로드' }), ' (양식에 아래 열을 넣어 두면 매번 같은 양식으로 받을 수 있습니다)'),
      h('li', null, '꼭 필요한 열: ', h('strong', { text: '주문번호 · 주문일시 · 결제금액(또는 상품구매금액)' }), ' / 있으면 좋은 열: 상품명 · 옵션 · 수량 · 주문상태 · 회원ID · 주문자 휴대전화 · 결제수단 · 사용한 쿠폰 · 유입경로'),
      h('li', null, '같은 주문을 다시 올려도 중복되지 않고 최신 상태(취소 · 환불)로 덮어씁니다. 이름 · 전화번호 · 주소는 저장하지 않습니다(고객 구분용 해시값만).')),
      ed ? h('div', { class: 'sa-up' }, file, G.busy ? h('span', { class: 'meta', text: G.busy }) : null) : h('p', { class: 'meta', text: '편집 권한이 있어야 올릴 수 있습니다.' })];
    if (p) {
      var opts = [['', '(없음)']].concat(p.head.map(function (x, i) { return [String(i), x || '(빈 열 ' + (i + 1) + ')']; }));
      var miss = FIELDS.filter(function (f) { return f[2] && p.map[f[0]] == null; }).map(function (f) { return f[1]; });
      if (p.map.pay == null && p.map.itemAmt == null) miss.push('결제금액 또는 상품 금액');
      var preview = build(p);
      body.push(h('div', { class: 'sa-map' },
        h('div', { class: 'strong', text: p.name + ' · ' + p.body.length + '줄 → 주문 ' + preview.length + '건' }),
        h('div', { class: 'sa-map-g' }, FIELDS.map(function (f) {
          var s = ui.select(opts, p.map[f[0]] != null ? String(p.map[f[0]]) : '');
          s.addEventListener('change', function () { if (s.value === '') delete p.map[f[0]]; else p.map[f[0]] = +s.value; HR.refresh(); });
          return ui.field(f[1] + (f[2] ? ' *' : ''), s);
        })),
        preview.length ? h('p', { class: 'meta', text: '미리보기: ' + preview.slice(0, 3).map(function (o) { return o.no + ' · ' + o.date + ' · ' + won(o.amt) + (o.items[0] ? ' · ' + o.items[0].n : '') + (o.cancel ? ' · 취소' : ''); }).join('  /  ') }) : null,
        miss.length ? h('p', { class: 'red', text: '연결이 필요한 열: ' + miss.join(', ') }) : null,
        h('div', { class: 'sa-up' }, ui.btn('주문 ' + preview.length + '건 반영', doImport, miss.length || G.busy ? 'btn-sm disabled' : 'btn-sm'), ui.btn('취소', function () { G.pending = null; HR.refresh(); }, 'btn-line btn-sm'))));
      if (miss.length) body[body.length - 1].querySelector('.sa-up .btn').disabled = true;
    }
    if (G.imports.length) body.push(h('ul', { class: 'list sa-imports' }, G.imports.map(function (x) {
      var m = S.members[x.by] || {};
      return h('li', null, h('span', { class: 'grow', text: x.file }), h('span', { class: 'meta', text: '주문 ' + x.orders + '건 · 새 ' + x.added + ' · 갱신 ' + x.updated + ' · ' + (m.name || '') + ' ' + (fmt.ts ? fmt.ts(x.at) : '') }));
    })));
    var d = h('details', { class: 'sa-upload panel' + (p ? ' open' : ''), open: !!p || !G.orders.length }, h('summary', { class: 'label', text: '주문 데이터 올리기 — 카페24 주문 엑셀' }), body);
    return d;
  }

  HR.register('sales', { render: render });
})();
