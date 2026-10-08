/* fillts D2C — [매출] 광고: 퍼포먼스 대시보드
   광고비 = d2c_ads { kind: perf|inf, date, media, name, amt, imp, clk, conv, rev, memo }
     · 퍼포먼스(perf) = 지출일 당일 전액 반영 · 인플루언서(inf) = 업로드일부터 30일 동안 1/30씩 안분(금액 · 노출 · 클릭 모두)
   트래픽 = d2c_traffic/{날짜} { sessions, carts } (GA4 · 카페24 애널리틱스 일별 값을 붙여넣기)
   주문 · 기간 · 예시 데이터는 현황(d2c-sales.js, HR.D2C)과 공유. 실제 광고비 · 트래픽이 0건이고 매출이 예시일 때만 예시 값을 쓴다(저장 안 함) */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db;
  var FV = firebase.firestore.FieldValue;
  var A = { ads: [], traffic: {}, trafficN: 0 };
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    if (prevStart) prevStart(sub);
    sub(db.collection('d2c_ads'), function (s) { A.ads = HR.rows(s); });
    sub(db.collection('d2c_traffic'), function (s) { var m = {}; HR.rows(s).forEach(function (r) { m[r.id] = r; }); A.traffic = m; A.trafficN = s.size; });
  };
  var MEDIA = [['meta', 'Meta (페북 · 인스타)'], ['naver', '네이버 검색광고'], ['google', '구글 · 유튜브 광고'], ['kakao', '카카오 모먼트'], ['youtube', '유튜브 인플루언서'], ['instagram', '인스타 인플루언서'], ['etc', '기타']];
  var mName = function (k) { var m = MEDIA.filter(function (x) { return x[0] === k; })[0]; return m ? m[1] : k || '기타'; };
  // 주문 유입(utm_source) → 매체
  var srcMedia = function (src) {
    src = String(src || '').toLowerCase();
    if (/meta|facebook|^fb|instagram|^ig/.test(src)) return 'meta';
    if (/naver/.test(src)) return 'naver'; if (/google/.test(src)) return 'google'; if (/kakao/.test(src)) return 'kakao'; if (/youtube|yt/.test(src)) return 'youtube';
    return '';
  };
  var n0 = function (v) { return Math.round(+v || 0).toLocaleString('ko-KR'); };
  var p1 = function (a, b) { return b ? (Math.round(a / b * 1000) / 10) + '%' : '—'; };

  /* ---------- 예시 (저장 안 함) ---------- */
  function rng(seed) { return function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
  function sampleAds(D, P) {   // 예시: 매일 광고비 = 그날 매출 × 20~50%(무작위) — 인플루언서 안분액 포함, 나머지를 퍼포먼스로
    var rnd = rng(777), out = [], sales = {};
    P.valid.forEach(function (o) { sales[o.date] = (sales[o.date] || 0) + +o.amt; });
    var INF = [{ kind: 'inf', date: '2026-11-15', media: 'youtube', name: '유튜버 A (예시)', amt: 90000, imp: 21000, clk: 540, conv: 0, rev: 0 },
      { kind: 'inf', date: '2026-12-01', media: 'youtube', name: '유튜버 B (예시)', amt: 120000, imp: 34000, clk: 880, conv: 0, rev: 0 }];
    var infDay = function (d) { return INF.reduce(function (s, a) { var k = HR.L.daysBetween(a.date, d); return s + (k >= 0 && k < 30 ? a.amt / 30 : 0); }, 0); };
    var push = function (d, media, name, amt, cpm, ctr, cvr, aov) {
      if (amt <= 0) return; var imp = Math.round(amt / cpm * 1000), clk = Math.round(imp * ctr), cv = Math.round(clk * cvr);
      out.push({ kind: 'perf', date: d, media: media, name: name, amt: amt, imp: imp, clk: clk, conv: cv, rev: cv * aov });
    };
    for (var i = 0; i < 40; i++) {
      var d = D.addDays('2026-11-12', i), s = sales[d] || 0; if (!s) continue;
      var target = s * (0.2 + rnd() * 0.3), perf = Math.max(Math.round((target - infDay(d)) / 100) * 100, 0);
      var kakao = i % 3 === 0 ? Math.round(perf * 0.15 / 100) * 100 : 0, naver = Math.round((perf - kakao) * (0.22 + rnd() * 0.1) / 100) * 100, meta = perf - kakao - naver;
      push(d, 'meta', '전환 캠페인', meta, 6500, 0.009 + rnd() * 0.005, 0.028, 45000);
      push(d, 'naver', '브랜드 검색', naver, 9800, 0.035, 0.045, 44000);
      push(d, 'kakao', '비즈보드', kakao, 2500, 0.006, 0.01, 42000);
    }
    return out.concat(INF);
  }
  function sampleTraffic(P, D) {
    var rnd = rng(4242), m = {}, by = {};
    P.valid.forEach(function (o) { by[o.date] = (by[o.date] || 0) + 1; });
    for (var i = 0; i < 40; i++) {
      var d = D.addDays('2026-11-12', i), o = by[d] || 0, s = Math.max(60, Math.round((o || 1) / 0.024 * (0.85 + rnd() * 0.3)));
      m[d] = { sessions: s, carts: Math.round(s * (0.065 + rnd() * 0.025)) };
    }
    return m;
  }

  /* ---------- 집계 ---------- */
  function spread(list, R, D) {   // 기간 R 안에 반영되는 광고비 · 지표 (인플루언서 30일 안분)
    var day = {}, media = {}, add = function (d, a, f) {
      if (d < R[0] || d > R[1]) return;
      var k = a.media || (a.kind === 'inf' ? 'youtube' : 'etc');
      if (!media[k]) media[k] = { k: k, amt: 0, imp: 0, clk: 0, conv: 0, rev: 0, inf: 0, perf: 0, names: {} };
      var x = media[k]; x.amt += (+a.amt || 0) * f; x.imp += (+a.imp || 0) * f; x.clk += (+a.clk || 0) * f; x.conv += (+a.conv || 0) * f; x.rev += (+a.rev || 0) * f;
      x[a.kind === 'inf' ? 'inf' : 'perf'] += (+a.amt || 0) * f; if (a.name) x.names[a.name] = 1;
      if (!day[d]) day[d] = { perf: 0, inf: 0, imp: 0, clk: 0, m: {} };
      day[d].m[k] = (day[d].m[k] || 0) + (+a.amt || 0) * f;
      day[d][a.kind === 'inf' ? 'inf' : 'perf'] += (+a.amt || 0) * f; day[d].imp += (+a.imp || 0) * f; day[d].clk += (+a.clk || 0) * f;
    };
    list.forEach(function (a) { if (!a.date) return; if (a.kind === 'inf') { for (var k = 0; k < 30; k++) add(D.addDays(a.date, k), a, 1 / 30); } else add(a.date, a, 1); });
    return { day: day, media: media };
  }

  /* ================= 화면 ================= */
  function render(view) {
    var D = HR.D2C;
    if (!D || !D.G.loaded) { ui.put(view, ui.empty('불러오는 중…')); return; }
    var P = D.period(), R = P.R, gran = D.G.gran;
    var demoAds = !A.ads.length && P.demo, demoTr = !A.trafficN && P.demo;
    if (demoAds && !A.demoAds) A.demoAds = sampleAds(D, P);
    if (demoTr && !A.demoTr) A.demoTr = sampleTraffic(P, D);
    var ads = demoAds ? A.demoAds : A.ads, tr = demoTr ? A.demoTr : A.traffic;
    var cur = spread(ads, R, D), prv = spread(ads, P.P, D);
    var sum = function (o, k) { return Object.keys(o).reduce(function (s, x) { return s + (o[x][k] || 0); }, 0); };
    var adAmt = sum(cur.media, 'amt'), adPrev = sum(prv.media, 'amt'), imp = sum(cur.media, 'imp'), clk = sum(cur.media, 'clk');
    var st = D.stats(P.cur), sp = D.stats(P.prev);
    var ses = 0, carts = 0, sesP = 0;
    for (var d = R[0]; d <= R[1]; d = D.addDays(d, 1)) if (tr[d]) { ses += +tr[d].sessions || 0; carts += +tr[d].carts || 0; }
    for (d = P.P[0]; d <= P.P[1]; d = D.addDays(d, 1)) if (tr[d]) sesP += +tr[d].sessions || 0;
    var goal = D.G.cfg.adGoal != null && D.G.cfg.adGoal !== '' ? +D.G.cfg.adGoal : 30, ratio = st.sales ? adAmt / st.sales * 100 : null;

    ui.put(view, ui.head('D2C · 매출', '광고 · 퍼포먼스', h('span', { class: 'meta', text: (demoAds || demoTr ? '예시 데이터 · 저장 안 됨 · ' : '') + fmt.dot(R[0]) + ' ~ ' + fmt.dot(R[1]) })));
    if (demoAds || demoTr) ui.put(view, h('div', { class: 'sa-demo' }, h('strong', { text: '예시 데이터입니다.' }),
      ' 매출은 현황 예시와 같고, 광고비는 매일 그날 매출의 20~50%를 무작위로 썼다고 가정했습니다(유튜버 2건 9만 · 12만원 30일 안분분 포함, 나머지는 Meta · 네이버 검색 · 카카오), 트래픽은 전환율 약 2.4%로 가정했습니다. 아래 입력란에 실제 값을 넣으면 사라집니다.'));
    ui.put(view, D.filters(),
      h('dl', { class: 'summary sa-kpi sa-ad-kpi8' },
        D.kpi('광고비', D.won(adAmt), D.delta(adAmt, adPrev)),
        D.kpi('광고비 비중 (매출 대비)', ratio == null ? '—' : (Math.round(ratio * 10) / 10) + '%', '목표 ' + goal + '% 이하', ratio != null && ratio > goal ? 'red' : ''),
        D.kpi('ROAS (자사몰 실측)', adAmt ? (st.sales / adAmt).toFixed(2) + '배' : '—', '순매출 ÷ 광고비'),
        D.kpi('CPA', st.orders ? D.won(adAmt / st.orders) : '—', '광고비 ÷ 주문'),
        D.kpi('CAC (신규)', st.newO ? D.won(adAmt / st.newO) : '—', '광고비 ÷ 신규 주문'),
        D.kpi('세션', n0(ses), D.delta(ses, sesP)),
        D.kpi('구매 전환율', p1(st.orders, ses), '주문 ÷ 세션 · 이전 ' + p1(sp.orders, sesP)),
        D.kpi('CTR', p1(clk, imp), '클릭 ÷ 노출 · CPC ' + (clk ? D.won(adAmt / clk) : '—'))),
      ui.panel('매출 대비 광고비 비중', goalInput(goal, D), ratioChart(P, cur, tr, R, gran, goal, D)),
      ui.panel('일별 매출 · 광고비', h('span', { class: 'meta', text: '그날 매출과 매체별로 쓴 광고비 · 인플루언서는 30일 안분액' }), dailyTable(P, cur, R, gran, goal, D)),
      ui.panel('매체별 광고비 · 성과', h('span', { class: 'meta', text: '인플루언서는 기간 안 안분액 · 실측 = 자사몰 주문의 UTM 유입' }), mediaTable(cur.media, P.cur, adAmt, D)),
      ui.panel('매출 · 유입 · 전환율 — 매출 = 세션 × 전환율 × 객단가', h('span', { class: 'meta', text: '이전 기간 대비 · 막대에 올리면 그날 공식' }), relation(P, tr, R, gran, D, st, sp, ses, sesP)),
      ui.panel('전환 퍼널', h('span', { class: 'meta', text: '이 기간 합계' }), funnel(imp, clk, ses, carts, st.orders)),
      adInput(D), trafficInput(D));
  }
  function goalInput(goal, D) {
    var ed = D.canEdit(), i = ui.input({ type: 'number', value: goal, class: 'sa-goal-in sa-ad-goal', disabled: !ed, 'aria-label': '목표 광고비 비중(%)' });
    i.addEventListener('change', function () { db.doc('d2c_docs/sales').set({ adGoal: +i.value || 0, updatedAt: FV.serverTimestamp(), updatedBy: S.mid || '' }, { merge: true }).then(function () { ui.toast('목표 비중을 저장했습니다.'); }); });
    return h('label', { class: 'sa-goal-l' }, '목표 비중(%) ', i);
  }

  /* ---------- 비중 꺾은선 (그날 · 7일 · 목표선) ---------- */
  function ratioChart(P, cur, tr, R, gran, goal, D) {
    var sales = {}; P.valid.forEach(function (o) { sales[o.date] = (sales[o.date] || 0) + +o.amt; });
    var ad = function (d) { var x = cur.day[d]; return x ? x.perf + x.inf : 0; };
    var all = spread(HR.D2C && A.ads.length ? A.ads : (A.demoAds || []), [D.addDays(R[0], -6), R[1]], D).day;   // 7일 평균은 기간 앞 6일도 필요
    var adAll = function (d) { var x = all[d]; return x ? x.perf + x.inf : 0; };
    var pts = [];
    if (gran === 'day') {
      for (var d = R[0]; d <= R[1]; d = D.addDays(d, 1)) {
        var s7 = 0, a7 = 0; for (var k = 0; k < 7; k++) { var dd = D.addDays(d, -k); s7 += sales[dd] || 0; a7 += adAll(dd); }
        var x = cur.day[d] || { perf: 0, inf: 0 };
        pts.push({ k: d, s: sales[d] || 0, perf: x.perf, inf: x.inf, ad: ad(d), r: sales[d] ? ad(d) / sales[d] * 100 : null, r7: s7 ? a7 / s7 * 100 : null });
      }
    } else {
      var mm = {}; Object.keys(sales).concat(Object.keys(cur.day)).forEach(function (d) { if (d >= R[0] && d <= R[1]) { var k = d.slice(0, 7); if (!mm[k]) mm[k] = { k: k, s: 0, perf: 0, inf: 0 }; } });
      Object.keys(sales).forEach(function (d) { if (d >= R[0] && d <= R[1]) mm[d.slice(0, 7)].s += sales[d]; });
      Object.keys(cur.day).forEach(function (d) { var x = mm[d.slice(0, 7)]; if (x) { x.perf += cur.day[d].perf; x.inf += cur.day[d].inf; } });
      pts = Object.keys(mm).sort().map(function (k) { var x = mm[k]; x.ad = x.perf + x.inf; x.r = x.s ? x.ad / x.s * 100 : null; x.r7 = null; return x; });
    }
    if (!pts.some(function (p) { return p.ad; })) return ui.empty('이 기간에 반영된 광고비가 없습니다. 아래 「광고비 입력」에 넣으세요.');
    var W = 960, H = 220, pl = 52, pr = 64, pt = 14, pb = 26, iw = W - pl - pr, ih = H - pt - pb, ns = 'http://www.w3.org/2000/svg';
    var vals = [goal]; pts.forEach(function (p) { if (p.r != null) vals.push(p.r); if (p.r7 != null) vals.push(p.r7); });
    var cap = Math.min(Math.max.apply(null, vals), 300), step = D.niceStep(cap / 4), top = Math.ceil(cap / step) * step;
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'sa-chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '매출 대비 광고비 비중 꺾은선');
    var el = function (tag, a, txt) { var e = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; };
    var bw = iw / pts.length, X = function (i) { return pl + i * bw + bw / 2; }, Y = function (v) { return pt + ih - Math.min(v, top) / top * ih; };
    for (var v = 0; v <= top; v += step) { el('line', { x1: pl, x2: W - pr, y1: Y(v), y2: Y(v), class: v ? 'sa-grid-l' : 'sa-base' }); el('text', { x: pl - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'sa-ax' }, v + '%'); }
    el('line', { x1: pl, x2: W - pr, y1: Y(goal), y2: Y(goal), class: 'sa-goal-line' }); el('text', { x: W - pr + 6, y: Y(goal) + 4, class: 'sa-ax sa-goal-t' }, '목표 ' + goal + '%');
    var path = function (key, cls) { var dd = '', on = false; pts.forEach(function (p, i) { if (p[key] == null) { on = false; return; } dd += (on ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[key]).toFixed(1); on = true; }); if (dd) el('path', { d: dd, class: cls }); };
    if (gran === 'day') path('r', 'sa-line-d');
    path(gran === 'day' ? 'r7' : 'r', 'sa-line-7');
    var last = null; for (var j = pts.length - 1; j >= 0; j--) if ((gran === 'day' ? pts[j].r7 : pts[j].r) != null) { last = j; break; }
    if (last != null) { var lv = gran === 'day' ? pts[last].r7 : pts[last].r; el('text', { x: X(last) + 6, y: Y(lv) - 6, class: 'sa-line-lab' }, Math.round(lv) + '%'); }
    var every = Math.ceil(pts.length / 12);
    pts.forEach(function (p, i) { if (i % every === 0) el('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', class: 'sa-ax' }, gran === 'day' ? (+p.k.slice(5, 7)) + '/' + (+p.k.slice(8)) : (+p.k.slice(2, 4)) + '.' + p.k.slice(5)); });
    var cross = el('line', { x1: 0, x2: 0, y1: pt, y2: pt + ih, class: 'sa-cross', visibility: 'hidden' }), dot = el('circle', { r: 4.5, class: 'sa-dot', visibility: 'hidden' }), dot7 = el('circle', { r: 4.5, class: 'sa-dot7', visibility: 'hidden' });
    var wrap = h('div', { class: 'sa-chart-wrap' }), tip = h('div', { class: 'sa-tip', hidden: true });
    pts.forEach(function (p, i) {
      var hit = el('rect', { x: pl + i * bw, y: pt, width: bw, height: ih, class: 'sa-hit' });
      hit.addEventListener('mouseenter', function () {
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
        var show = function (c, val) { if (val != null) { c.setAttribute('cx', X(i)); c.setAttribute('cy', Y(val)); c.setAttribute('visibility', 'visible'); } else c.setAttribute('visibility', 'hidden'); };
        show(dot, gran === 'day' ? p.r : null); show(dot7, gran === 'day' ? p.r7 : p.r);
        ui.clear(tip); ui.put(tip, h('div', { class: 'strong', text: gran === 'day' ? fmt.dot(p.k) + ' (' + D.WD[new Date(p.k + 'T00:00:00Z').getUTCDay()] + ')' : p.k.replace('-', '.') }),
          h('div', { text: (gran === 'day' ? '그날 비중 ' : '월 비중 ') + (p.r == null ? '— (매출 0)' : (Math.round(p.r * 10) / 10) + '%') }),
          gran === 'day' ? h('div', { class: 'red', text: '7일 평균 ' + (p.r7 == null ? '—' : (Math.round(p.r7 * 10) / 10) + '%') }) : null,
          h('div', { class: 'meta', text: '순매출 ' + D.won(p.s) + ' · 광고비 ' + D.won(p.ad) }),
          h('div', { class: 'meta', text: '퍼포먼스 ' + D.won(p.perf) + ' · 인플루언서(안분) ' + D.won(p.inf) }));
        tip.hidden = false; tip.style.left = Math.min(Math.max(X(i) / W * 100, 14), 82) + '%';
      });
      hit.addEventListener('mouseleave', function () { tip.hidden = true; [cross, dot, dot7].forEach(function (c) { c.setAttribute('visibility', 'hidden'); }); });
    });
    wrap.appendChild(svg); wrap.appendChild(tip);
    return h('div', null,
      h('div', { class: 'sa-legend' }, gran === 'day' ? h('span', null, h('i', { class: 'sw sw-line-d' }), '그날 비중 (광고비 ÷ 그날 매출)') : null,
        h('span', null, h('i', { class: 'sw sw-line-7' }), gran === 'day' ? '7일 평균 비중 (7일 광고비 ÷ 7일 매출)' : '월 비중'), h('span', null, h('i', { class: 'sw sw-goal' }), '목표선')),
      wrap,
      h('details', { class: 'sa-table' }, h('summary', { text: '표로 보기' }), h('div', { class: 'table-wrap flat' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['기간', '순매출', '퍼포먼스', '인플루언서(안분)', '광고비', '비중'].concat(gran === 'day' ? ['7일 평균'] : []).map(function (c, j) { return h('th', { class: j ? 'num' : '', text: c }); }))),
        h('tbody', null, pts.slice().reverse().map(function (p) {
          return h('tr', null, h('td', { text: gran === 'day' ? fmt.dot(p.k) : p.k }), h('td', { class: 'num', text: D.won(p.s) }), h('td', { class: 'num', text: D.won(p.perf) }), h('td', { class: 'num', text: D.won(p.inf) }), h('td', { class: 'num', text: D.won(p.ad) }),
            h('td', { class: 'num' + (p.r != null && p.r > goal ? ' red' : ''), text: p.r == null ? '—' : (Math.round(p.r * 10) / 10) + '%' }), gran === 'day' ? h('td', { class: 'num', text: p.r7 == null ? '—' : (Math.round(p.r7 * 10) / 10) + '%' }) : null);
        }))))));
  }

  /* ---------- 일별(월별) 매출 · 광고비 표: 매출 | 광고비 합계 · 비중 | 매체별 광고비 ---------- */
  function dailyTable(P, cur, R, gran, goal, D) {
    var sales = {}, ord = {}; P.valid.forEach(function (o) { sales[o.date] = (sales[o.date] || 0) + +o.amt; ord[o.date] = (ord[o.date] || 0) + 1; });
    var used = {}; Object.keys(cur.day).forEach(function (d) { Object.keys(cur.day[d].m).forEach(function (k) { used[k] = (used[k] || 0) + cur.day[d].m[k]; }); });
    var cols = MEDIA.map(function (m) { return m[0]; }).filter(function (k) { return used[k]; });
    var rows = [];
    var mk = function (k) { return { k: k, s: 0, o: 0, ad: 0, m: {} }; };
    if (gran === 'day') {
      for (var d = R[0]; d <= R[1]; d = D.addDays(d, 1)) { var x = mk(d), cd = cur.day[d]; x.s = sales[d] || 0; x.o = ord[d] || 0; if (cd) { x.ad = cd.perf + cd.inf; x.m = cd.m; } rows.push(x); }
    } else {
      var mm = {}, get = function (k) { return mm[k] || (mm[k] = mk(k)); };
      Object.keys(sales).forEach(function (dd) { if (dd >= R[0] && dd <= R[1]) { var x = get(dd.slice(0, 7)); x.s += sales[dd]; x.o += ord[dd]; } });
      Object.keys(cur.day).forEach(function (dd) { var x = get(dd.slice(0, 7)), cd = cur.day[dd]; x.ad += cd.perf + cd.inf; Object.keys(cd.m).forEach(function (k) { x.m[k] = (x.m[k] || 0) + cd.m[k]; }); });
      rows = Object.keys(mm).sort().map(function (k) { return mm[k]; });
    }
    rows = rows.filter(function (r) { return r.s || r.ad; }).reverse();
    if (!rows.length) return ui.empty('이 기간에 매출 · 광고비가 없습니다.');
    var tot = rows.reduce(function (t, r) { t.s += r.s; t.o += r.o; t.ad += r.ad; cols.forEach(function (k) { t.m[k] = (t.m[k] || 0) + (r.m[k] || 0); }); return t; }, mk('합계'));
    var ratioTd = function (r) { var v = r.s ? r.ad / r.s * 100 : null; return h('td', { class: 'num strong' + (v != null && v > goal ? ' red' : ''), text: v == null ? (r.ad ? '매출 0' : '—') : (Math.round(v * 10) / 10) + '%' }); };
    var line = function (r, isTot) {
      return h('tr', { class: isTot ? 'sa-tot' : '' },
        h('td', { class: 'nowrap', text: isTot ? '합계' : gran === 'day' ? fmt.dot(r.k).slice(5) + ' (' + D.WD[new Date(r.k + 'T00:00:00Z').getUTCDay()] + ')' : r.k }),
        h('td', { class: 'num sa-dt-sales', text: D.won(r.s) }), h('td', { class: 'num', text: r.o ? r.o + '건' : '—' }),
        h('td', { class: 'num sa-dt-ad', text: D.won(r.ad) }), ratioTd(r),
        cols.map(function (k) { var v = r.m[k] || 0; return h('td', { class: 'num' + (v ? '' : ' sa-dim'), text: v ? D.won(v) + (r.ad ? ' · ' + Math.round(v / r.ad * 100) + '%' : '') : '—' }); }));
    };
    return h('div', null,
      h('div', { class: 'table-wrap flat sa-dt-wrap' }, h('table', { class: 'table sa-media sa-dt' },
        h('thead', null,
          h('tr', null, h('th', { rowspan: 2, text: gran === 'day' ? '날짜' : '월' }), h('th', { colspan: 2, class: 'sa-grp', text: '매출' }), h('th', { colspan: 2, class: 'sa-grp', text: '광고비' }), cols.length ? h('th', { colspan: cols.length, class: 'sa-grp', text: '매체별 광고비 · 그날 광고비 중 비중' }) : null),
          h('tr', null, ['순매출', '주문', '합계', '매출 대비'].concat(cols.map(mName)).map(function (c) { return h('th', { class: 'num', text: c }); }))),
        h('tbody', null, line(tot, true), rows.map(function (r) { return line(r); })))),
      h('p', { class: 'meta sa-note', text: '맨 위 줄이 기간 합계입니다. 「매출 대비」가 목표(' + goal + '%)를 넘으면 빨강. 인플루언서는 업로드일부터 30일 동안 하루 1/30씩 들어갑니다.' }));
  }

  /* ---------- 매체별 표 ---------- */
  function mediaTable(media, orders, adAmt, D) {
    var real = {}; orders.forEach(function (o) { var k = srcMedia(o.src); if (!k) return; if (!real[k]) real[k] = { n: 0, s: 0 }; real[k].n++; real[k].s += +o.amt; });
    var keys = Object.keys(media); Object.keys(real).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    var order = MEDIA.map(function (m) { return m[0]; });
    keys.sort(function (a, b) { return ((media[b] || {}).amt || 0) - ((media[a] || {}).amt || 0) || order.indexOf(a) - order.indexOf(b); });
    if (!keys.length) return ui.empty('광고비 기록이 없습니다.');
    var tot = { amt: 0, imp: 0, clk: 0, conv: 0, rev: 0, n: 0, s: 0 };
    var row = function (k, x, r, isTot) {
      x = x || { amt: 0, imp: 0, clk: 0, conv: 0, rev: 0, names: {} }; r = r || { n: 0, s: 0 };
      var names = Object.keys(x.names || {});
      return h('tr', { class: isTot ? 'sa-tot' : '' },
        h('td', null, h('div', { class: 'strong', text: isTot ? '합계' : mName(k) }), !isTot && names.length ? h('div', { class: 'meta', text: names.slice(0, 3).join(' · ') + (names.length > 3 ? ' 외 ' + (names.length - 3) : '') }) : null),
        h('td', { class: 'num', text: D.won(x.amt) }), h('td', { class: 'num', text: adAmt ? Math.round(x.amt / adAmt * 100) + '%' : '—' }),
        h('td', { class: 'num', text: n0(x.imp) }), h('td', { class: 'num', text: n0(x.clk) }), h('td', { class: 'num', text: p1(x.clk, x.imp) }), h('td', { class: 'num', text: x.clk ? D.won(x.amt / x.clk) : '—' }),
        h('td', { class: 'num', text: n0(x.conv) }), h('td', { class: 'num', text: x.amt && x.rev ? (x.rev / x.amt).toFixed(2) : '—' }),
        h('td', { class: 'num sa-real', text: r.n ? n0(r.n) + '건' : '—' }), h('td', { class: 'num sa-real', text: r.s ? D.man(r.s) + '원' : '—' }),
        h('td', { class: 'num sa-real' + (x.amt && r.s && r.s / x.amt < 1 ? ' red' : ''), text: x.amt && r.s ? (r.s / x.amt).toFixed(2) : '—' }),
        h('td', { class: 'num', text: r.n && x.amt ? D.won(x.amt / r.n) : '—' }));
    };
    var rows = keys.map(function (k) { var x = media[k], r = real[k]; if (x) ['amt', 'imp', 'clk', 'conv', 'rev'].forEach(function (f) { tot[f] += x[f]; }); if (r) { tot.n += r.n; tot.s += r.s; } return row(k, x, r); });
    return h('div', { class: 'table-wrap flat' }, h('table', { class: 'table sa-media' },
      h('thead', null,
        h('tr', null, h('th', { rowspan: 2, text: '매체' }), h('th', { colspan: 2, class: 'sa-grp', text: '광고비' }), h('th', { colspan: 4, class: 'sa-grp', text: '트래픽 (매체 보고)' }), h('th', { colspan: 2, class: 'sa-grp', text: '전환 (매체 보고)' }), h('th', { colspan: 3, class: 'sa-grp sa-real', text: '자사몰 실측 (UTM)' }), h('th', { rowspan: 2, class: 'num', text: 'CPA (실측)' })),
        h('tr', null, ['금액', '비중', '노출', '클릭', 'CTR', 'CPC', '전환', 'ROAS', '주문', '매출', 'ROAS'].map(function (c, j) { return h('th', { class: 'num' + (j >= 8 ? ' sa-real' : ''), text: c }); }))),
      h('tbody', null, rows, row('', { amt: tot.amt, imp: tot.imp, clk: tot.clk, conv: tot.conv, rev: tot.rev }, { n: tot.n, s: tot.s }, true))),
      h('p', { class: 'meta sa-note', text: '매체 보고 전환 · ROAS는 각 매체가 자기 기준(조회 · 클릭 후 n일)으로 센 값이라 실제보다 크게 나오기 쉽습니다. 판단은 오른쪽 「자사몰 실측」(카페24 주문의 utm_source)으로 합니다. 인플루언서는 링크 대신 검색으로 들어오는 경우가 많아 쿠폰코드로 따로 봅니다.' }));
  }

  /* ---------- 퍼널 ---------- */
  function funnel(imp, clk, ses, carts, orders) {
    var steps = [['노출', imp], ['클릭', clk], ['세션', ses], ['장바구니', carts], ['주문', orders]], max = Math.max(imp, clk, ses, carts, orders) || 1;
    return h('ol', { class: 'sa-funnel' }, steps.map(function (s, i) {
      var prev = i ? steps[i - 1][1] : 0, rate = i && prev ? s[1] / prev * 100 : null;
      var label = ['', 'CTR', '클릭 → 세션', '장바구니 담기율', '장바구니 → 주문'][i];
      return h('li', null,
        h('div', { class: 'sa-fn-h' }, h('span', { class: 'strong', text: s[0] }), h('span', { class: 'sa-fn-v', text: n0(s[1]) })),
        h('div', { class: 'sa-fn-b' }, h('span', { style: 'width:' + Math.max(Math.sqrt(s[1] / max) * 100, s[1] ? 1.5 : 0) + '%' })),
        i ? h('div', { class: 'meta', text: label + ' ' + (rate == null ? '—' : (Math.round(rate * 100) / 100) + '%') + (i === 4 && ses ? ' · 구매 전환율(주문 ÷ 세션) ' + (Math.round(orders / ses * 10000) / 100) + '%' : '') }) : null);
    }), h('p', { class: 'meta', text: '막대 길이는 차이가 커서 제곱근 비율로 그렸습니다. 노출 · 클릭은 매체 보고 합계, 세션 · 장바구니는 트래픽 입력값, 주문은 카페24 주문입니다.' }));
  }

  /* ---------- 트래픽 막대 (세션) ---------- */
  function trafficChart(P, tr, R, gran, D) {
    var ord = {}; P.valid.forEach(function (o) { ord[o.date] = (ord[o.date] || 0) + 1; });
    var rows = [];
    if (gran === 'day') { for (var d = R[0]; d <= R[1]; d = D.addDays(d, 1)) rows.push({ k: d, s: tr[d] ? +tr[d].sessions || 0 : 0, c: tr[d] ? +tr[d].carts || 0 : 0, o: ord[d] || 0 }); }
    else {
      var mm = {}; var addM = function (k) { if (!mm[k]) mm[k] = { k: k, s: 0, c: 0, o: 0 }; return mm[k]; };
      Object.keys(tr).forEach(function (dd) { if (dd >= R[0] && dd <= R[1]) { var x = addM(dd.slice(0, 7)); x.s += +tr[dd].sessions || 0; x.c += +tr[dd].carts || 0; } });
      Object.keys(ord).forEach(function (dd) { if (dd >= R[0] && dd <= R[1]) addM(dd.slice(0, 7)).o += ord[dd]; });
      rows = Object.keys(mm).sort().map(function (k) { return mm[k]; });
    }
    if (!rows.some(function (r) { return r.s; })) return ui.empty('트래픽 입력이 없습니다. 아래 「트래픽 입력」에 GA4 · 카페24 애널리틱스 일별 세션을 붙여넣으세요.');
    var W = 480, H = 200, pl = 40, pr = 6, pt = 10, pb = 24, iw = W - pl - pr, ih = H - pt - pb, ns = 'http://www.w3.org/2000/svg';
    var max = Math.max.apply(null, rows.map(function (r) { return r.s; })) || 1, step = D.niceStep(max / 4), top = Math.ceil(max / step) * step;
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'sa-chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '세션 막대 차트');
    var el = function (tag, a, txt) { var e = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; };
    for (var v = 0; v <= top; v += step) { var y = pt + ih - v / top * ih; el('line', { x1: pl, x2: W - pr, y1: y, y2: y, class: v ? 'sa-grid-l' : 'sa-base' }); el('text', { x: pl - 6, y: y + 4, 'text-anchor': 'end', class: 'sa-ax' }, n0(v)); }
    var bw = iw / rows.length, gap = Math.min(Math.max(bw * 0.25, 1.5), 8), every = Math.ceil(rows.length / 6);
    var wrap = h('div', { class: 'sa-chart-wrap' }), tip = h('div', { class: 'sa-tip', hidden: true });
    rows.forEach(function (r, i) {
      var x = pl + i * bw + gap / 2, w = Math.max(bw - gap, 1), bh = r.s / top * ih, yy = pt + ih - bh, rr = Math.min(3, w / 2, bh);
      if (bh > 0) el('path', { d: 'M' + x + ',' + (pt + ih) + 'V' + (yy + rr) + 'Q' + x + ',' + yy + ' ' + (x + rr) + ',' + yy + 'H' + (x + w - rr) + 'Q' + (x + w) + ',' + yy + ' ' + (x + w) + ',' + (yy + rr) + 'V' + (pt + ih) + 'Z', class: 'sa-bar', 'data-i': i });
      if (i % every === 0) el('text', { x: pl + i * bw + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'sa-ax' }, gran === 'day' ? (+r.k.slice(5, 7)) + '/' + (+r.k.slice(8)) : r.k.slice(2).replace('-', '.'));
      var hit = el('rect', { x: pl + i * bw, y: pt, width: bw, height: ih, class: 'sa-hit' });
      hit.addEventListener('mouseenter', function () {
        svg.querySelectorAll('.sa-bar').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-i') === i); });
        ui.clear(tip); ui.put(tip, h('div', { class: 'strong', text: gran === 'day' ? fmt.dot(r.k) : r.k }), h('div', { text: '세션 ' + n0(r.s) + ' · 장바구니 ' + n0(r.c) }), h('div', { class: 'red', text: '주문 ' + r.o + '건 · 전환율 ' + p1(r.o, r.s) }));
        tip.hidden = false; tip.style.left = Math.min(Math.max((pl + i * bw + bw / 2) / W * 100, 20), 78) + '%';
      });
      hit.addEventListener('mouseleave', function () { tip.hidden = true; svg.querySelectorAll('.sa-bar.on').forEach(function (b) { b.classList.remove('on'); }); });
    });
    wrap.appendChild(svg); wrap.appendChild(tip);
    return wrap;
  }

  /* ---------- 매출 · 유입 · 전환율 관계 — 매출 = 세션 × 전환율 × 객단가 ----------
     위: 이전 기간 대비 매출 변화를 세 요인으로 나눈 기여(로그 분해) · 아래: 같은 날짜 축의 작은 차트 3개(매출 · 세션 · 전환율), 호버가 셋을 함께 가리킨다 */
  function relation(P, tr, R, gran, D, st, sp, ses, sesP) {
    var cr = ses ? st.orders / ses : 0, crP = sesP ? sp.orders / sesP : 0, aov = st.aov, aovP = sp.aov;
    var tiles = [['유입 (세션)', n0(ses), sesP ? ses / sesP : null, '방문 수'], ['구매 전환율', p1(st.orders, ses), crP ? cr / crP : null, '주문 ÷ 세션'], ['객단가', D.won(aov), aovP ? aov / aovP : null, '매출 ÷ 주문'], ['순매출', D.won(st.sales), sp.sales ? st.sales / sp.sales : null, '세션 × 전환율 × 객단가']];
    var chg = function (x) { return x == null ? '비교 없음' : (x >= 1 ? '▲ ' : '▼ ') + Math.abs(Math.round((x - 1) * 100)) + '%'; };
    var eq = h('div', { class: 'sa-eq' }, tiles.map(function (t, i) {
      return [i === 3 ? h('span', { class: 'sa-eq-op', text: '=' }) : i ? h('span', { class: 'sa-eq-op', text: '×' }) : null,
        h('div', { class: 'sa-eq-t' + (i === 3 ? ' sa-eq-sum' : '') }, h('div', { class: 'sa-eq-k', text: t[0] }), h('div', { class: 'sa-eq-v', text: t[1] }), h('div', { class: 'sa-eq-c' + (t[2] != null && t[2] < 1 ? ' red' : ''), text: chg(t[2]) + ' · ' + t[3] }))];
    }));
    // 기여 분해: ln(매출 변화) = ln(세션 변화) + ln(전환율 변화) + ln(객단가 변화)
    var why = null;
    if (sesP && crP && aovP && sp.sales && ses && cr && aov) {
      var parts = [['유입', Math.log(ses / sesP)], ['전환율', Math.log(cr / crP)], ['객단가', Math.log(aov / aovP)]], totL = Math.log(st.sales / sp.sales), totP = (st.sales / sp.sales - 1) * 100;
      var maxAbs = Math.max.apply(null, parts.map(function (x) { return Math.abs(x[1]); })) || 1;
      why = h('div', { class: 'sa-why' },
        h('div', { class: 'strong', text: '이전 기간 대비 매출 ' + (totP >= 0 ? '+' : '') + Math.round(totP) + '% — 무엇 때문인가' }),
        h('ul', null, parts.map(function (x) {
          var pp = totL ? x[1] / totL * totP : 0;
          return h('li', null, h('span', { class: 'sa-why-k', text: x[0] }),
            h('span', { class: 'sa-why-b' }, h('span', { class: x[1] < 0 ? 'neg' : '', style: 'width:' + (Math.abs(x[1]) / maxAbs * 50) + '%;' + (x[1] < 0 ? 'right:50%' : 'left:50%') })),
            h('span', { class: 'sa-why-v' + (pp < 0 ? ' red' : ''), text: (pp >= 0 ? '+' : '') + Math.round(pp) + '%p' }));
        })),
        h('p', { class: 'meta', text: '세 요인의 기여(%p)를 더하면 매출 변화와 같습니다(로그 분해). 유입이 끌었으면 광고 · 콘텐츠, 전환율이 끌었으면 상세페이지 · 리뷰 · 혜택, 객단가가 끌었으면 세트 · 무료배송 기준을 봅니다.' }));
    }
    // 작은 차트 3개
    var ord = {}, rev = {}; P.valid.forEach(function (o) { ord[o.date] = (ord[o.date] || 0) + 1; rev[o.date] = (rev[o.date] || 0) + +o.amt; });
    var rows = [];
    if (gran === 'day') { for (var d = R[0]; d <= R[1]; d = D.addDays(d, 1)) rows.push({ k: d, s: tr[d] ? +tr[d].sessions || 0 : 0, o: ord[d] || 0, r: rev[d] || 0 }); }
    else {
      var mm = {}, addM = function (k) { if (!mm[k]) mm[k] = { k: k, s: 0, o: 0, r: 0 }; return mm[k]; };
      Object.keys(tr).forEach(function (dd) { if (dd >= R[0] && dd <= R[1]) addM(dd.slice(0, 7)).s += +tr[dd].sessions || 0; });
      Object.keys(ord).forEach(function (dd) { if (dd >= R[0] && dd <= R[1]) { var x = addM(dd.slice(0, 7)); x.o += ord[dd]; x.r += rev[dd]; } });
      rows = Object.keys(mm).sort().map(function (k) { return mm[k]; });
    }
    if (!rows.some(function (r) { return r.s; })) return h('div', null, eq, why, ui.empty('트래픽 입력이 없어 세션 · 전환율 차트를 그릴 수 없습니다. 아래 「트래픽 입력」에 일별 세션을 붙여넣으세요.'));
    rows.forEach(function (r) { r.cr = r.s ? r.o / r.s * 100 : null; });
    var W = 960, pl = 64, pr = 12, bandH = 92, gapB = 26, pt = 18, n = rows.length, iw = W - pl - pr, bw = iw / n, H = pt + 3 * bandH + 2 * gapB + 26, ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'sa-chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '매출 · 세션 · 전환율 작은 차트 3개');
    var el = function (tag, a, txt) { var e = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; };
    var X = function (i) { return pl + i * bw + bw / 2; };
    var band = function (bi, title, key, fmtV, kind, cls) {
      var y0 = pt + bi * (bandH + gapB), vals = rows.map(function (r) { return r[key] || 0; }), max = Math.max.apply(null, vals) || 1, step = D.niceStep(max / 2), top = Math.ceil(max / step) * step;
      var Y = function (v) { return y0 + bandH - v / top * bandH; };
      el('text', { x: pl, y: y0 - 6, class: 'sa-band-t' }, title);
      for (var v = 0; v <= top; v += step) { el('line', { x1: pl, x2: W - pr, y1: Y(v), y2: Y(v), class: v ? 'sa-grid-l' : 'sa-base' }); el('text', { x: pl - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'sa-ax' }, fmtV(v)); }
      if (kind === 'bar') {
        var gap = Math.min(Math.max(bw * 0.25, 1.5), 10);
        rows.forEach(function (r, i) {
          var v2 = r[key] || 0, bh = v2 / top * bandH; if (bh <= 0) return;
          var x = pl + i * bw + gap / 2, w = Math.max(bw - gap, 1), yy = y0 + bandH - bh, rr = Math.min(3, w / 2, bh);
          el('path', { d: 'M' + x + ',' + (y0 + bandH) + 'V' + (yy + rr) + 'Q' + x + ',' + yy + ' ' + (x + rr) + ',' + yy + 'H' + (x + w - rr) + 'Q' + (x + w) + ',' + yy + ' ' + (x + w) + ',' + (yy + rr) + 'V' + (y0 + bandH) + 'Z', class: cls, 'data-i': i });
        });
      } else {
        var dd2 = '', on = false;
        rows.forEach(function (r, i) { if (r[key] == null) { on = false; return; } dd2 += (on ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(r[key]).toFixed(1); on = true; });
        el('path', { d: dd2, class: cls });
      }
      return Y;
    };
    band(0, '순매출', 'r', function (v) { return D.man(v); }, 'bar', 'sa-bar sa-rel-rev');
    band(1, '유입 · 세션', 's', function (v) { return n0(v); }, 'bar', 'sa-bar sa-rel-ses');
    var Y3 = band(2, '구매 전환율 (주문 ÷ 세션)', 'cr', function (v) { return (Math.round(v * 10) / 10) + '%'; }, 'line', 'sa-line-7');
    var every = Math.ceil(n / 12), yb = pt + 3 * bandH + 2 * gapB;
    rows.forEach(function (r, i) { if (i % every === 0) el('text', { x: X(i), y: yb + 18, 'text-anchor': 'middle', class: 'sa-ax' }, gran === 'day' ? (+r.k.slice(5, 7)) + '/' + (+r.k.slice(8)) : r.k.slice(2).replace('-', '.')); });
    var cross = el('line', { x1: 0, x2: 0, y1: pt - 4, y2: yb, class: 'sa-cross', visibility: 'hidden' }), dot = el('circle', { r: 4.5, class: 'sa-dot7', visibility: 'hidden' });
    var wrap = h('div', { class: 'sa-chart-wrap' }), tip = h('div', { class: 'sa-tip', hidden: true });
    rows.forEach(function (r, i) {
      var hit = el('rect', { x: pl + i * bw, y: pt - 4, width: bw, height: yb - pt + 4, class: 'sa-hit' });
      hit.addEventListener('mouseenter', function () {
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
        if (r.cr != null) { dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y3(r.cr)); dot.setAttribute('visibility', 'visible'); } else dot.setAttribute('visibility', 'hidden');
        svg.querySelectorAll('.sa-bar').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-i') === i); });
        ui.clear(tip); ui.put(tip, h('div', { class: 'strong', text: gran === 'day' ? fmt.dot(r.k) + ' (' + D.WD[new Date(r.k + 'T00:00:00Z').getUTCDay()] + ')' : r.k }),
          h('div', { text: '세션 ' + n0(r.s) + ' × 전환율 ' + (r.cr == null ? '—' : (Math.round(r.cr * 100) / 100) + '%') }),
          h('div', { text: '× 객단가 ' + (r.o ? D.won(r.r / r.o) : '—') + ' = 매출 ' + D.won(r.r) }), h('div', { class: 'meta', text: '주문 ' + r.o + '건' }));
        tip.hidden = false; tip.style.left = Math.min(Math.max(X(i) / W * 100, 14), 82) + '%';
      });
      hit.addEventListener('mouseleave', function () { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); svg.querySelectorAll('.sa-bar.on').forEach(function (b) { b.classList.remove('on'); }); });
    });
    wrap.appendChild(svg); wrap.appendChild(tip);
    return h('div', null, eq, why, wrap, h('p', { class: 'meta sa-note', text: '세 차트는 날짜가 같은 줄에 맞춰져 있습니다. 매출이 튄 날에 세션이 같이 튀었으면 유입 효과, 세션은 그대로인데 전환율이 올랐으면 상세페이지 · 혜택 · 리뷰 효과로 봅니다.' }));
  }

  /* ---------- 입력: 광고비 ---------- */
  function adInput(D) {
    var ed = D.canEdit();
    var kind = ui.select([['perf', '퍼포먼스 (지출일 반영)'], ['inf', '인플루언서 (업로드일부터 30일 안분)']], 'perf');
    var date = ui.input({ type: 'date', value: fmt.today() }), media = ui.select(MEDIA, 'meta'), name = ui.input({ placeholder: '캠페인 · 크리에이터 (예: 전환 캠페인 / @happydana)', maxlength: 60 });
    var num = function (ph) { return ui.input({ type: 'number', min: 0, placeholder: ph }); };
    var amt = num('원 (VAT 포함 실지출)'), imp = num('노출 · 조회수'), clk = num('클릭'), conv = num('매체 보고 전환'), rev = num('매체 보고 전환 매출'), memo = ui.input({ placeholder: '메모 (선택)', maxlength: 120 });
    var lab = h('label', { text: '지출일' });
    kind.addEventListener('change', function () { lab.textContent = kind.value === 'inf' ? '업로드일' : '지출일'; if (kind.value === 'inf' && media.value === 'meta') media.value = 'youtube'; });
    var add = function () {
      if (!+amt.value || !date.value) { ui.toast('날짜와 금액을 넣으세요.'); return; }
      db.collection('d2c_ads').add({ kind: kind.value, date: date.value, media: media.value, name: name.value.trim(), amt: +amt.value, imp: +imp.value || 0, clk: +clk.value || 0, conv: +conv.value || 0, rev: +rev.value || 0, memo: memo.value.trim(), by: S.mid || '', at: FV.serverTimestamp() })
        .then(function () { [amt, imp, clk, conv, rev, memo].forEach(function (x) { x.value = ''; }); ui.toast('광고비를 기록했습니다.'); }).catch(function (e) { ui.toast('기록하지 못했습니다 — ' + (e.code || e.message)); });
    };
    var bulk = h('textarea', { rows: 4, class: 'sa-bulk', placeholder: '퍼포먼스 일별 붙여넣기 (매체 리포트를 엑셀에서 복사) — 한 줄에\n날짜  매체  광고비  [노출  클릭  전환  전환매출]\n2026-11-12  meta  52000  8000  96  3  135000\n2026-11-12  naver  9800  1000  35  2  88000' });
    var addBulk = function () {
      var keys = MEDIA.map(function (m) { return m[0]; });
      var rows = bulk.value.split(/\r?\n/).map(function (l) {
        var c = l.trim().split(/[\t,]+|\s{1,}/).filter(Boolean); if (c.length < 3) return null;
        var m = c[0].match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})$/); if (!m) return null;
        var md = c[1].toLowerCase(); md = keys.indexOf(md) >= 0 ? md : srcMedia(md) || 'etc';
        var nn = function (x) { return +(String(x || '').replace(/[^\d.]/g, '')) || 0; };
        return { date: m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2), media: md, amt: nn(c[2]), imp: nn(c[3]), clk: nn(c[4]), conv: nn(c[5]), rev: nn(c[6]) };
      }).filter(function (r) { return r && r.amt; });
      if (!rows.length) { ui.toast('읽을 수 있는 줄이 없습니다 — 「2026-11-12 meta 52000」 형식'); return; }
      var b = db.batch(); rows.slice(0, 400).forEach(function (r) { r.kind = 'perf'; r.name = ''; r.memo = '붙여넣기'; r.by = S.mid || ''; r.at = FV.serverTimestamp(); b.set(db.collection('d2c_ads').doc(), r); });
      b.commit().then(function () { bulk.value = ''; ui.toast('퍼포먼스 광고비 ' + Math.min(rows.length, 400) + '건을 기록했습니다.'); }).catch(function (e) { ui.toast('기록하지 못했습니다 — ' + (e.code || e.message)); });
    };
    var list = A.ads.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    return h('details', { class: 'panel sa-adin', open: !A.ads.length ? true : null },
      h('summary', { class: 'label', text: '광고비 입력 · 기록 ' + A.ads.length + '건' }),
      h('p', { class: 'meta', text: '퍼포먼스 광고비는 지출일 하루에 전액, 인플루언서 광고비는 업로드일부터 30일 동안 하루 1/30씩 반영합니다(금액 · 조회수 · 클릭 모두). 시딩 제품 원가 · 배송비는 광고비가 아니라 원가로 봅니다.' }),
      ed ? h('div', { class: 'sa-ad-form' }, ui.field('종류', kind), h('div', { class: 'field' }, lab, date), ui.field('매체', media), ui.field('캠페인 · 크리에이터', name), ui.field('금액(원)', amt),
        ui.field('노출 · 조회수', imp), ui.field('클릭', clk), ui.field('전환 (매체 보고)', conv), ui.field('전환 매출 (매체 보고)', rev), ui.field('메모', memo), h('div', { class: 'sa-ad-go' }, ui.btn('추가', add, 'btn-sm'))) : null,
      ed ? h('div', { class: 'sa-ad-bulk' }, bulk, ui.btn('붙여넣기 반영', addBulk, 'btn-line btn-sm')) : null,
      list.length ? h('div', { class: 'table-wrap flat' }, h('table', { class: 'table sa-ad-list' },
        h('thead', null, h('tr', null, ['날짜', '종류', '매체', '캠페인 · 크리에이터', '금액', '노출', '클릭', '반영', ''].map(function (c, j) { return h('th', { class: j >= 4 && j <= 6 ? 'num' : '', text: c }); }))),
        h('tbody', null, list.slice(0, 80).map(function (a) {
          return h('tr', null, h('td', { text: fmt.dot(a.date) }), h('td', { text: a.kind === 'inf' ? '인플루언서' : '퍼포먼스' }), h('td', { text: mName(a.media) }), h('td', { text: (a.name || '') + (a.memo ? ' · ' + a.memo : '') }),
            h('td', { class: 'num', text: D.won(a.amt) }), h('td', { class: 'num', text: n0(a.imp) }), h('td', { class: 'num', text: n0(a.clk) }),
            h('td', { class: 'meta', text: a.kind === 'inf' ? fmt.dot(a.date).slice(5) + ' ~ ' + fmt.dot(D.addDays(a.date, 29)).slice(5) + ' · 하루 ' + D.won(a.amt / 30) : '당일' }),
            h('td', null, ed ? ui.confirmBtn('삭제', function () { db.collection('d2c_ads').doc(a.id).delete(); }) : null));
        })))) : null);
  }

  /* ---------- 입력: 트래픽 ---------- */
  function trafficInput(D) {
    var ed = D.canEdit();
    var bulk = h('textarea', { rows: 4, class: 'sa-bulk', placeholder: 'GA4 · 카페24 애널리틱스 일별 값 붙여넣기 — 한 줄에\n날짜  세션  [장바구니]\n2026-11-12  1250  96\n2026-11-13  980  71' });
    var go = function () {
      var rows = bulk.value.split(/\r?\n/).map(function (l) {
        var c = l.trim().split(/[\t,]+|\s{1,}/).filter(Boolean), m = c[0] && c[0].match(/^(\d{4})[-.\/]?(\d{1,2})[-.\/]?(\d{1,2})$/); if (!m || c.length < 2) return null;
        return { id: m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2), sessions: +String(c[1]).replace(/[^\d]/g, '') || 0, carts: +String(c[2] || '').replace(/[^\d]/g, '') || 0 };
      }).filter(Boolean);
      if (!rows.length) { ui.toast('읽을 수 있는 줄이 없습니다 — 「2026-11-12 1250 96」 형식'); return; }
      var b = db.batch(); rows.slice(0, 400).forEach(function (r) { b.set(db.collection('d2c_traffic').doc(r.id), { sessions: r.sessions, carts: r.carts, by: S.mid || '', at: FV.serverTimestamp() }, { merge: true }); });
      b.commit().then(function () { bulk.value = ''; ui.toast('트래픽 ' + rows.length + '일을 반영했습니다.'); }).catch(function (e) { ui.toast('반영하지 못했습니다 — ' + (e.code || e.message)); });
    };
    var days = Object.keys(A.traffic).sort().reverse();
    return h('details', { class: 'panel sa-adin', open: !A.trafficN ? true : null },
      h('summary', { class: 'label', text: '트래픽 입력 · ' + A.trafficN + '일' }),
      h('p', { class: 'meta', text: 'GA4(보고서 › 획득 › 트래픽 획득, 일별) 또는 카페24 애널리틱스의 일별 방문(세션)과 장바구니 담기 수를 붙여넣습니다. 같은 날짜를 다시 넣으면 덮어씁니다.' }),
      ed ? h('div', { class: 'sa-ad-bulk' }, bulk, ui.btn('붙여넣기 반영', go, 'btn-line btn-sm')) : null,
      days.length ? h('p', { class: 'meta', text: '최근: ' + days.slice(0, 7).map(function (d) { return d.slice(5) + ' ' + n0(A.traffic[d].sessions); }).join(' · ') }) : null);
  }

  // 현황 차트의 광고비 꺾은선용: 날짜별 반영 광고비(실제 0건이고 매출이 예시면 예시 광고비)
  if (HR.D2C) HR.D2C.adDays = function () {
    var D = HR.D2C, P = D.period(), list = A.ads;
    if (!A.ads.length) { if (!P.demo) return {}; if (!A.demoAds) A.demoAds = sampleAds(D, P); list = A.demoAds; }
    var day = spread(list, ['2000-01-01', '2999-12-31'], D).day, out = {};
    Object.keys(day).forEach(function (d) { out[d] = day[d].perf + day[d].inf; });
    return out;
  };
  HR.register('ads', { render: render });
})();
