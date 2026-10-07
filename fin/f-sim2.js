/* fillts Finance — 런웨이 시뮬레이션 (엑셀형 월별 한 장)
   위에서 아래로: ① 예상 판매량 → ② 발주 시점 · 수량 → (재고 · 매출 · 변동비 자동) → ③ 판매와 무관한 고정비(지출 흐름 고정비 + 채용 예정)
   → ④ 현금 리스크 구간 · 대표 차입금. 기간은 2026-10 ~ 2027-03 (6개월).
   저장: fin_config/main.sim2 — 칸을 바꾸면 바로 저장. 개당 값은 개당 손익(F.unitPnl), 고정비는 지출 흐름(fin_sched 매월 반복)을 그대로 쓴다. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt;
  var END = '2027-03', CHECK = END;
  var SIM2 = {
    start: '2026-10', end: END, minCash: 10000000, lead: 1, upfront: 100, cash0: null, committed: true,
    units: { '2026-11': 300, '2026-12': 400, '2027-01': 500, '2027-02': 600, '2027-03': 700 },
    orders: {},
    owner: {}, fund: {},
    hires: []
  };
  F.SIM2 = SIM2;
  function cfg() { var o = JSON.parse(JSON.stringify(SIM2)), s = F.cfg.sim2 || {}; Object.keys(s).forEach(function (k) { o[k] = s[k]; }); o.end = END; return o; }
  // 저장 즉시 화면 반영: 서버 응답을 기다리지 않고 바로 다시 계산해 그린다 (입력 중에도 커서 · 스크롤 유지)
  var redrawTimer = null;
  function redraw() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(function () {   // Tab으로 다음 칸에 커서가 옮겨 간 뒤 그린다
      var v = document.getElementById('view'); if (!v || !v.querySelector('.sx-grid')) return;
      var a = document.activeElement, lab = a && a.getAttribute ? a.getAttribute('aria-label') : null;
      var wrap = v.querySelector('.sx-wrap'), st = wrap ? [wrap.scrollTop, wrap.scrollLeft] : null, y = window.scrollY;
      ui.clear(v); render(v);
      window.scrollTo(0, y);
      var w2 = v.querySelector('.sx-wrap'); if (w2 && st) { w2.scrollTop = st[0]; w2.scrollLeft = st[1]; }
      if (lab) { var el = Array.prototype.filter.call(v.querySelectorAll('[aria-label]'), function (x) { return x.getAttribute('aria-label') === lab; })[0]; if (el) { el.focus(); try { el.select(); } catch (e) { /* select 불가 요소 */ } } }
    }, 0);
  }
  function save(patch) {
    var next = Object.assign(cfg(), patch);
    F.cfg = Object.assign({}, F.cfg, { sim2: next });   // 화면은 바로 새 값으로
    redraw();
    return F.cfgSet({ sim2: next }).catch(ui.fail);
  }
  // Enter = 입력 확정 (엑셀처럼). 확정되면 바로 다시 계산
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target || !e.target.closest || !(e.target.closest('.sx-grid') || (/^#sim/.test(location.hash) && e.target.closest('.fin-form')))) return;
    if (e.target.tagName === 'INPUT') { e.preventDefault(); e.target.blur(); }
  });

  // 고정비: 지출 흐름의 매월 반복 항목을 인건비 · 임대 · 운영으로 묶는다
  F.fixedAt = function (ym) {
    var g = { pay: 0, rent: 0, ops: 0, rows: [] };
    F.sched.forEach(function (s) {
      if (s.kind !== 'monthly' || (s.start && ym < s.start) || (s.end && ym > s.end)) return;
      var a = +s.amount || 0; if (!a) return;
      if (s.cat === '급여') g.pay += a; else if (s.cat === '임대료 · 관리비') g.rent += a; else g.ops += a;
      g.rows.push([s.title, a, s.cat]);
    });
    g.total = g.pay + g.rent + g.ops;
    return g;
  };
  function months(c) { var out = []; for (var ym = c.start; ym <= c.end; ym = fmt.ymShift(ym, 1)) out.push(ym); return out; }

  F.runSim = function (c) {
    c = c || cfg();
    var u = F.unitPnl(), uo = c.unitOver || {};
    // 1개당 값: 개당 손익에서 가져온 값, 시트에서 직접 고치면 그 값 (unitOver)
    var base = { net: u.net, vari: u.varNoAd, cogs: u.cogs };   // 변동비 = 광고 제외 (광고비는 ①에서 월별 입력)
    var uv = { net: uo.net != null ? +uo.net : base.net, vari: uo.vari != null ? +uo.vari : base.vari, cogs: uo.cogs != null ? +uo.cogs : base.cogs };
    var cogs = uv.cogs, per = uv.vari, fo = c.fixOver || {};
    var ov = function (k, ym, def) { return fo[k] && fo[k][ym] != null ? +fo[k][ym] : def; };
    var st = F.invStock ? F.invStock() : {}, prod = Object.keys(st).map(function (k) { return st[k]; }).filter(function (x) { return x.it.type === 'product'; })[0];
    var stock = prod ? prod.onHand + prod.ordered : 5000;
    var cash = c.cash0 != null && c.cash0 !== '' ? +c.cash0 : F.balance().amount, start = cash;
    var committed = c.committed ? F.sched.filter(function (s) { return s.kind !== 'monthly' && !s.paid && s.date >= fmt.today(); }) : [];
    var lead = +c.lead || 0, up = (+c.upfront || 0) / 100, R = [], cumP = 0;
    months(c).forEach(function (ym) {
      var r = { ym: ym };
      r.arrive = +(c.orders[fmt.ymShift(ym, -lead)] || 0); stock += r.arrive;
      r.plan = +(c.units[ym] || 0); r.sold = Math.min(r.plan, stock); r.lost = r.plan - r.sold; stock -= r.sold; r.stock = stock;
      r.order = +(c.orders[ym] || 0);
      r.rev = r.sold * uv.net;
      // 변동비 구성 (1개당 변동비를 직접 고쳤으면 같은 비율로 나눔)
      var vs = u.varNoAd ? per / u.varNoAd : 0;
      r.vLogi = r.sold * u.logi * vs; r.vEtc = r.sold * (u.pg + u.ret + u.review) * vs;
      r.vAd = +((c.ad || {})[ym] || 0);   // 광고비: 월별 직접 입력
      r.vari = r.vLogi + r.vEtc + r.vAd; r.adPct = r.rev ? r.vAd / r.rev * 100 : null;
      var fx = F.fixedAt(ym);
      r.def = { pay: fx.pay, rent: fx.rent, ops: fx.ops, hire: (c.hires || []).reduce(function (a, x) { return a + (x.from && ym >= x.from ? +x.monthly || 0 : 0); }, 0) };
      r.pay = ov('pay', ym, r.def.pay); r.hire = ov('hire', ym, r.def.hire); r.rent = ov('rent', ym, r.def.rent); r.ops = ov('ops', ym, r.def.ops);
      r.extra = (c.extraFixed || []).map(function (x) { return +((x.vals || {})[ym] || 0); });
      r.fixed = r.pay + r.hire + r.rent + r.ops + r.extra.reduce(function (a, v) { return a + v; }, 0);
      r.inv = r.order * cogs * up + r.arrive * cogs * (1 - up);   // 기본: 발주한 달에 전액 (현금 기준)
      r.committed = committed.filter(function (s) { return s.date.slice(0, 7) === ym; }).reduce(function (a, s) { return a + (+s.amount || 0); }, 0);
      r.owner = +(c.owner[ym] || 0); r.fund = +(c.fund[ym] || 0);
      r.op = r.rev - r.vari - r.fixed;                     // 영업 현금 (재고 매입 전)
      r.cogsUsed = r.sold * cogs; r.profit = r.op - r.cogsUsed;   // 월 순익 (손익 기준: 판 만큼 원가 반영, 법인세 전)
      cumP += r.profit; r.cumProfit = cumP;
      r.flow = r.op - r.inv - r.committed + r.owner + r.fund;
      r.outAll = r.vari + r.fixed + r.inv + r.committed; r.inAll = r.rev + r.owner + r.fund;
      cash += r.flow; r.cash = cash;
      r.need = cash < +c.minCash ? Math.ceil((+c.minCash - cash) / 10000000) * 10000000 : 0;   // 최소 보유액까지 채우려면 (천만 원 단위)
      R.push(r);
    });
    return { rows: R, u: u, uv: uv, base: base, start: start, c: c };
  };
  // 부족한 달마다 차례로 대표 차입을 채운 결과
  function fillOwner() {
    var c = cfg(); c.owner = {};
    for (var guard = 0; guard < 40; guard++) {
      var X = F.runSim(c), r = X.rows.filter(function (x) { return x.need > 0; })[0];
      if (!r) break;
      c.owner[r.ym] = (c.owner[r.ym] || 0) + r.need;
    }
    return c.owner;
  }

  function render(view) {
    var c = cfg(), ed = F.canEdit(), X = F.runSim(c), R = X.rows, u = X.u;
    var at = function (ym) { return R.filter(function (r) { return r.ym === ym; })[0] || {}; };
    var low = R.reduce(function (a, r) { return r.cash < a.cash ? r : a; }, R[0] || { cash: 0, ym: '' });
    var risk = R.filter(function (r) { return r.cash < +c.minCash; });
    var ownerSum = Object.keys(c.owner).reduce(function (a, k) { return a + (+c.owner[k] || 0); }, 0);
    var firstLost = R.filter(function (r) { return r.lost > 0; })[0];
    var opPlus = R.filter(function (r) { return r.sold && r.profit >= 0; })[0], pSum = R.reduce(function (a, r) { return a + r.profit; }, 0);
    var ownerLimit = F.plan.filter(function (p) { return p.kind === F.OWNER && p.status !== 'dropped'; }).reduce(function (a, p) { return a + (+p.amount || 0); }, 0);

    // 엑셀형 표: 행 = 항목, 열 = 월
    var cols = R.map(function (r) { return r.ym; });
    var head = h('tr', null, h('th', { class: 'sx-k', text: '항목 / 월' }), cols.map(function (ym) {
      return h('th', { class: 'num', text: F.ymLabel(ym) });
    }));
    var body = h('tbody');
    var sec = function (title, note) { body.appendChild(h('tr', { class: 'sx-sec' }, h('td', { class: 'sx-k' }, h('span', { text: title }), note ? h('span', { class: 'meta', text: '  ' + note }) : null), cols.map(function () { return h('td'); }))); };
    var cell = function (ym, val, cls) { return h('td', { class: 'num' + '' + (cls ? ' ' + cls : ''), text: val }); };
    var row = function (label, f, cls, rowCls) { body.appendChild(h('tr', { class: rowCls || '' }, h('td', { class: 'sx-k', text: label }), R.map(function (r) { var v = f(r); return cell(r.ym, v.t != null ? v.t : v, v.c || cls); }))); };
    // scale: 화면 단위 (만원 입력이면 10000 — 저장은 늘 원 단위)
    var inputRow = function (label, key, unitText, guide, scale) {
      scale = scale || 1;
      body.appendChild(h('tr', { class: 'sx-input' }, h('td', { class: 'sx-k' }, h('div', { class: 'strong', text: label }), h('div', { class: 'meta', text: guide })), cols.map(function (ym) {
        var v = c[key][ym], i = h('input', { type: 'text', inputmode: 'decimal', class: 'sx-cell', value: v ? (Math.round(v / scale * 100) / 100).toLocaleString('ko-KR') : '', 'aria-label': ym + ' ' + label, disabled: ed ? null : true });
        i.addEventListener('focus', function () { i.select(); });
        i.addEventListener('change', function () { var o = Object.assign({}, c[key]); var n = Math.round(parseFloat(String(i.value).replace(/[^0-9.\-]/g, '')) * scale) || 0; if (n) o[ym] = n; else delete o[ym]; var p = {}; p[key] = o; save(p); });
        return h('td', { class: 'num' + '' }, i);
      })));
    };
    var m = function (v) { return v ? F.man(v) : ''; };
    var n = function (v) { return v ? Math.round(v).toLocaleString('ko-KR') : ''; };

    // ⓪ 1개 팔면: 순매출 − 변동비 − 원가 = 순익 (1개당 손익 구조를 한눈에)
    var uo = c.unitOver || {}, uv = X.uv, pnet = uv.net || 1;
    var unitProfit = uv.net - uv.vari - uv.cogs;
    sec('⓪ 1개 팔면 — 순매출 − 변동비 − 원가 = 순익', '개당 손익에서 가져온 값 · 고치면 이 시트에만 적용 (굵게)');
    var vb = u.e ? [['물류', u.logi], ['결제 · 반품 · 리뷰', u.pg + u.ret + u.review], ['광고 ' + u.e.adRate + '%', u.ad]] : [];
    var UROWS = [
      ['net', '순매출', '', '정가 ' + F.won(u.price) + ' − 할인 ' + u.e.discount + '% − 부가세 → 회사에 실제 들어오는 돈'],
      ['vari', '변동비 (광고 제외)', '−', '1개 팔 때마다 나가는 돈: ' + vb.filter(function (x) { return !/^광고/.test(x[0]); }).map(function (x) { return x[0] + ' ' + F.won(Math.round(x[1])); }).join(' · ') + ' — 광고비는 ①에서 월별로'],
      ['cogs', '제품 원가', '−', '본품 · 튜브 · 단상자 · 원료 · 샘플 등 (공급가) — 현금은 발주 때(②) 나감']
    ];
    UROWS.forEach(function (k) {
      var own = uo[k[0]] != null, v = own ? +uo[k[0]] : X.base[k[0]];
      var i = h('input', { type: 'text', inputmode: 'numeric', class: 'sx-cell sx-unit' + (own ? ' sx-own' : ''), value: Math.round(v).toLocaleString('ko-KR'), 'aria-label': '1개당 ' + k[1], disabled: ed ? null : true });
      i.addEventListener('focus', function () { i.select(); });
      i.addEventListener('change', function () { var o = Object.assign({}, c.unitOver || {}), n = F.parseWon(i.value); if (n === Math.round(X.base[k[0]])) delete o[k[0]]; else o[k[0]] = n; save({ unitOver: o }); });
      var ratio = k[0] === 'net' ? '100%' : (v / pnet * 100).toFixed(1) + '%';
      body.appendChild(h('tr', { class: 'sx-input sx-u sx-u-' + k[0] }, h('td', { class: 'sx-k' }, h('span', { class: 'sx-op', text: k[2] }), h('span', { class: 'strong', text: '1개당 ' + k[1] })),
        h('td', { class: 'num' }, i), h('td', { class: 'num sx-ratio', text: ratio }),
        h('td', { colspan: String(Math.max(1, cols.length - 2)), class: 'meta sx-unitnote' }, own ? '직접 입력 · 가져온 값 ' + F.won(Math.round(X.base[k[0]])) + ' ' : k[3] + ' ',
          own && ed ? ui.btn('되돌리기', function () { var o = Object.assign({}, c.unitOver || {}); delete o[k[0]]; save({ unitOver: o }); }, 'btn-line btn-xs') : null)));
    });
    body.appendChild(h('tr', { class: 'sx-u sx-u-profit' }, h('td', { class: 'sx-k' }, h('span', { class: 'sx-op', text: '=' }), h('span', { class: 'strong', text: '1개당 순익 (광고 전)' })),
      h('td', { class: 'num strong' + (unitProfit < 0 ? ' red' : '') }, F.won(Math.round(unitProfit))), h('td', { class: 'num sx-ratio strong', text: (unitProfit / pnet * 100).toFixed(1) + '%' }),
      h('td', { colspan: String(Math.max(1, cols.length - 2)), class: 'meta sx-unitnote', text: '순매출의 ' + (unitProfit / pnet * 100).toFixed(1) + '% · 광고비 · 고정비 전 금액 → 1,000개 팔면 ' + F.man(unitProfit * 1000) + ', 고정비를 넘기려면 월 ' + (unitProfit > 0 && R[1] ? Math.ceil(R[R.length - 1].fixed / unitProfit).toLocaleString('ko-KR') + '개 (27.03 고정비 기준)' : '-') })));
    sec('① 판매', '런칭 2026.11.12');
    inputRow('예상 판매량 (개)', 'units', '개', '월별로 직접 입력');
    row('실제 판매 가능', function (r) { return { t: n(r.sold) + (r.lost ? ' (−' + n(r.lost) + ')' : ''), c: r.lost ? 'red' : '' }; });
    row('순매출', function (r) { return m(r.rev); });
    var vsU = u.varNoAd ? X.uv.vari / u.varNoAd : 0;
    row('− 물류 (판매 × ' + F.won(Math.round(u.logi * vsU)) + ')', function (r) { return m(-r.vLogi); }, 'meta');
    row('− 결제 · 반품 · 리뷰 (판매 × ' + F.won(Math.round((u.pg + u.ret + u.review) * vsU)) + ')', function (r) { return m(-r.vEtc); }, 'meta');
    // 광고비: 월별로 직접 (만원). 칸 아래에 순매출 대비 % 자동
    body.appendChild(h('tr', { class: 'sx-input sx-ad' }, h('td', { class: 'sx-k' }, h('div', { class: 'strong', text: '− 광고 · 마케팅비 (만원)' }), h('div', { class: 'meta', text: '월별로 직접 입력 · 아래 % = 그 달 순매출 대비' }),
        ed ? h('div', { class: 'sx-tools' }, ui.btn('→ 순매출의 30%로 채우기', function () { var o = {}; R.forEach(function (r) { if (r.rev) o[r.ym] = Math.round(r.rev * 0.3 / 10000) * 10000; }); save({ ad: o }); }, 'btn-line btn-xs'),
          ui.btn('비우기', function () { save({ ad: {} }); }, 'btn-line btn-xs')) : null),
      R.map(function (r) {
        var v = (c.ad || {})[r.ym];
        var i = h('input', { type: 'text', inputmode: 'decimal', class: 'sx-cell sx-own', value: v ? (Math.round(v / 10000 * 100) / 100).toLocaleString('ko-KR') : '', 'aria-label': r.ym + ' 광고비 (만원)', disabled: ed ? null : true });
        i.addEventListener('focus', function () { i.select(); });
        i.addEventListener('change', function () { var o = Object.assign({}, c.ad || {}), n = Math.round(parseFloat(String(i.value).replace(/[^0-9.\-]/g, '')) * 10000) || 0; if (n) o[r.ym] = n; else delete o[r.ym]; save({ ad: o }); });
        var pct = r.adPct, pc = pct == null ? (r.vAd ? '매출 없음' : '') : pct.toFixed(1) + '%';
        return h('td', { class: 'num' }, i, h('div', { class: 'sx-pct' + (pct != null && pct > 40 ? ' red' : ''), text: pc ? '순매출의 ' + pc : '' }));
      })));
    row('변동비 합계 (물류 · 결제 · 광고)', function (r) { return m(-r.vari); }, '', 'sx-sum');
    sec('② 재고 · 발주', '현금 기준 — 발주 대금은 발주한 달에 ' + (+c.upfront >= 100 ? '전액' : c.upfront + '% (나머지는 입고 달)') + ' 나감 · ' + (+c.lead === 1 ? '다음 달 1일 입고' : c.lead + '개월 뒤 입고'));
    inputRow('발주 수량 (개)', 'orders', '개', +c.lead === 1 ? '발주한 달에 입력 → 다음 달 1일부터 판매' : '발주한 달에 입력 → ' + c.lead + '개월 뒤 1일부터 판매');
    row('입고', function (r) { return n(r.arrive); }, 'meta');
    row('월말 재고', function (r) { return { t: n(r.stock) || '0', c: r.stock < (at(fmt.ymShift(r.ym, 1)).plan || 0) ? 'red' : '' }; });
    row('발주 대금 (발주 수량 × 1개당 원가 ' + F.won(Math.round(X.uv.cogs)) + ')', function (r) { return { t: m(-r.inv), c: r.inv ? 'red strong' : '' }; });
    if (R.some(function (r) { return r.committed; })) row('이미 정해진 지급 (에코먼트 잔금 등)', function (r) { return m(-r.committed); });
    sec('③ 판매와 무관하게 매달 나가는 돈', '기본값은 지출 흐름 › 고정비 · 칸을 고치면 이 시트에만 적용 · 사람 · 항목은 「+ 고정비 항목 추가」로');
    // 고정비 입력 행: 칸에는 가져온 기본값이 들어 있고, 고치면 그 달만 덮어씀(굵게). 비우면 기본값으로 돌아감
    var fixRow = function (label, key, guide) {
      var fo = c.fixOver || {}, cur = fo[key] || {};
      var put = function (o) { var all = Object.assign({}, c.fixOver || {}); all[key] = o; save({ fixOver: all }); };
      body.appendChild(h('tr', { class: 'sx-input sx-fix' }, h('td', { class: 'sx-k' }, h('div', { class: 'strong', text: label }), h('div', { class: 'meta', text: guide + ' · 비우면 0원' }),
        ed ? h('div', { class: 'sx-tools' }, ui.btn('→ 첫 달 값으로 채우기', function () { var o = {}; var v = cur[cols[0]] != null ? +cur[cols[0]] : R[0][key]; cols.forEach(function (ym) { o[ym] = v; }); put(o); }, 'btn-line btn-xs'), ui.btn('전부 0', function () { var o = {}; cols.forEach(function (ym) { o[ym] = 0; }); put(o); }, 'btn-line btn-xs'),
          Object.keys(cur).length ? ui.btn('기본값으로 되돌리기', function () { put({}); }, 'btn-line btn-xs') : null) : null),
        R.map(function (r) {
          var own = cur[r.ym] != null, v = own ? +cur[r.ym] : r.def[key];
          var i = h('input', { type: 'text', inputmode: 'numeric', class: 'sx-cell' + (own ? ' sx-own' : ''), value: v ? Math.round(v).toLocaleString('ko-KR') : '', placeholder: own ? '0' : '', 'aria-label': r.ym + ' ' + label, disabled: ed ? null : true, title: own ? '직접 입력 · 기본값 ' + F.won(r.def[key]) + ' (줄 왼쪽 「기본값」으로 되돌림)' : '기본값 — 지출 흐름 · 채용 계획에서 가져옴' });
          i.addEventListener('focus', function () { i.select(); });
          // 비우면 0원 (기본값으로 되살아나지 않음). 기본값과 같은 숫자를 넣으면 덮어쓰기 해제
          i.addEventListener('change', function () { var o = Object.assign({}, cur), n = F.parseWon(i.value); if (n === Math.round(r.def[key])) delete o[r.ym]; else o[r.ym] = n; put(o); });
          return h('td', { class: 'num' }, i);
        })));
    };
    fixRow('인건비 (현원)', 'pay', '기본: 지출 흐름 › 고정비 인건비');
    fixRow('임대료 · 관리비', 'rent', '기본: 지출 흐름 › 고정비');
    fixRow('운영비 (툴 · 세무 · 물류 기본료 · 이자 · 기타)', 'ops', '기본: 지출 흐름 › 고정비');
    // 직접 추가 항목 (예: 대표 급여, 촬영비 월정액)
    (c.extraFixed || []).forEach(function (x, idx) {
      var setX = function (patch) { var list = (c.extraFixed || []).slice(); list[idx] = Object.assign({}, list[idx], patch); save({ extraFixed: list }); };
      var nm = h('input', { type: 'text', class: 'sx-name', value: x.name || '', placeholder: '항목 이름', maxlength: '40', disabled: ed ? null : true });
      nm.addEventListener('change', function () { setX({ name: nm.value.trim() }); });
      body.appendChild(h('tr', { class: 'sx-input sx-fix' }, h('td', { class: 'sx-k' }, nm, ed ? h('div', { class: 'sx-tools' },
          ui.btn('→ 첫 달 값으로 채우기', function () { var v = +((x.vals || {})[cols[0]] || 0), o = {}; cols.forEach(function (ym) { o[ym] = v; }); setX({ vals: o }); }, 'btn-line btn-xs'),
          ui.confirmBtn('삭제', function () { var list = (c.extraFixed || []).slice(); list.splice(idx, 1); save({ extraFixed: list }); })) : null),
        cols.map(function (ym) {
          var v = (x.vals || {})[ym], i = h('input', { type: 'text', inputmode: 'numeric', class: 'sx-cell sx-own', value: v ? Number(v).toLocaleString('ko-KR') : '', 'aria-label': ym + ' ' + (x.name || ''), disabled: ed ? null : true });
          i.addEventListener('focus', function () { i.select(); });
          i.addEventListener('change', function () { var o = Object.assign({}, x.vals || {}), n = F.parseWon(i.value); if (n) o[ym] = n; else delete o[ym]; setX({ vals: o }); });
          return h('td', { class: 'num' }, i);
        })));
    });
    if (ed) body.appendChild(h('tr', { class: 'sx-addrow' }, h('td', { class: 'sx-k' }, ui.btn('+ 고정비 항목 추가', function () { save({ extraFixed: (c.extraFixed || []).concat([{ name: '', vals: {} }]) }); }, 'btn-line btn-xs')), cols.map(function () { return h('td'); })));
    row('고정비 합계', function (r) { return m(-r.fixed); }, 'strong', 'sx-sum');
    sec('④ 월 순익', '손익 기준 — 판 만큼만 원가를 잡는다 (법인세 · 감가상각 전)');
    row('순매출', function (r) { return m(r.rev); }, 'meta');
    row('− 제품 원가 (판매분)', function (r) { return m(-r.cogsUsed); }, 'meta');
    row('− 변동비', function (r) { return m(-r.vari); }, 'meta');
    row('− 고정비', function (r) { return m(-r.fixed); }, 'meta');
    row('월 순익', function (r) { return { t: F.man(r.profit), c: r.profit < 0 ? 'red' : '' }; }, 'strong', 'sx-sum sx-cash');
    row('누적 순익', function (r) { return { t: F.man(r.cumProfit), c: r.cumProfit < 0 ? 'red' : '' }; });
    sec('⑤ 현금', '최소 보유 ' + F.man(+c.minCash) + ' · 원가는 판매가 아니라 발주 대금으로 나감');
    row('영업 현금 (매출 − 변동비 − 고정비)', function (r) { return { t: F.man(r.op), c: r.op < 0 ? 'red' : '' }; });
    inputRow('대표 차입금 (만원)', 'owner', '만원', '대표 개인 → 법인 (가수금) · 3000 = 3,000만 원', 10000);
    inputRow('기타 조달 (만원)', 'fund', '만원', '정책자금 · 대출 입금 · 만원 단위', 10000);
    row('이 달 들어오는 돈 (순매출 + 차입 + 조달)', function (r) { return m(r.inAll); });
    row('이 달 나가는 돈 (변동비 + 고정비 + 발주 대금 + 확정 지급)', function (r) { return m(-r.outAll); }, 'strong');
    row('월 현금흐름', function (r) { return { t: F.man(r.flow), c: r.flow < 0 ? 'red' : '' }; });
    row('월말 현금', function (r) { return { t: F.man(r.cash), c: r.cash < 0 ? 'red sx-neg' : r.cash < +c.minCash ? 'red' : '' }; }, 'strong', 'sx-sum sx-cash');
    row('누적 부족 (이 달까지 필요한 총 차입)', function (r) { return { t: r.need ? F.man(r.need) : '', c: r.need ? 'red strong' : '' }; }, '', 'sx-need');
    var grid = h('table', { class: 'table fin-table sx-grid' }, h('thead', null, head), body);

    // 채용 계획 (작게)
    var hires = h('div', { class: 'stack' });
    (c.hires || []).forEach(function (x, idx) {
      var r1 = ui.input({ value: x.role || '', maxlength: 40, disabled: ed ? null : true }), r2 = F.moneyInput({ value: x.monthly || '' }), r3 = ui.input({ type: 'month', value: x.from || '', disabled: ed ? null : true });
      if (!ed) r2.disabled = true;
      var put = function () { var hs = c.hires.slice(); hs[idx] = { role: r1.value.trim(), monthly: F.parseWon(r2.value), from: r3.value }; save({ hires: hs }); };
      [r1, r2, r3].forEach(function (i) { i.addEventListener('change', put); });
      hires.appendChild(h('div', { class: 'row fin-acct-row' }, ui.field('역할', r1, 'grow'), ui.field('월 인건비 (4대보험 포함)', r2), ui.field('입사 월', r3),
        ed ? ui.btn('삭제', function () { var hs = c.hires.slice(); hs.splice(idx, 1); save({ hires: hs }); }, 'btn-line btn-xs') : null));
    });
    if (ed) hires.appendChild(ui.btn('+ 채용 추가', function () { save({ hires: (c.hires || []).concat([{ role: '', monthly: 0, from: CHECK }]) }); }, 'btn-line btn-sm'));
    var setting = function (label, key, type) {
      var v = c[key], i = type === 'money' ? F.moneyInput({ value: v != null && v !== '' ? v : '' }) : ui.input({ type: 'number', step: 'any', value: v != null ? String(v) : '' });
      if (!ed) i.disabled = true;
      i.addEventListener('change', function () { var p = {}; p[key] = type === 'money' ? (i.value.trim() === '' ? null : F.parseWon(i.value)) : +i.value || 0; save(p); });
      return ui.field(label, i);
    };
    var c6 = at(CHECK), c12 = at(END);
    ui.put(view, ui.head('Simulation', '런웨이 시뮬레이션'), ed ? h('div', { class: 'sx-actions' },
        ui.btn('부족분만큼 대표 차입 채우기', function () { save({ owner: fillOwner() }).then(function () { ui.toast('부족한 달에 대표 차입금을 채웠습니다.'); }); }, 'btn-sm'),
        ui.confirmBtn('차입 비우기', function () { save({ owner: {} }); }, 'btn-line btn-sm'),
        ui.confirmBtn('기본값으로', function () { F.cfgSet({ sim2: JSON.parse(JSON.stringify(SIM2)) }).catch(ui.fail); }, 'btn-line btn-sm')) : null,
      F.kpi([['시작 현금', F.man(X.start), '', c.cash0 != null && c.cash0 !== '' ? '직접 입력' : '법인 통장 잔액'],
        ['27.03 월말 현금', F.man(c12.cash || 0), (c12.cash || 0) < +c.minCash ? 'red' : '', '누적 판매 ' + R.reduce(function (a, r) { return a + r.sold; }, 0).toLocaleString('ko-KR') + '개 · 남은 재고 ' + (c12.stock || 0).toLocaleString('ko-KR') + '개'],
        ['현금 리스크 구간', risk.length ? risk.length + '개월' : '없음', risk.length ? 'red' : '', risk.length ? F.ymLabel(risk[0].ym) + ' ~ ' + F.ymLabel(risk[risk.length - 1].ym) + ' · 최저 ' + F.man(low.cash) + ' (' + F.ymLabel(low.ym) + ')' : '최소 보유액 위'],
        ['대표 차입 (입력)', F.man(ownerSum), ownerLimit && ownerSum > ownerLimit ? 'red' : '', ownerLimit ? '한도 ' + F.man(ownerLimit) + ' (자금조달 계획)' : ''],
        ['월 순익 흑자 전환', opPlus ? F.ymLabel(opPlus.ym) : '27.03까지 없음', opPlus ? '' : 'red', '기간 누적 순익 ' + F.man(pSum) + (firstLost ? ' · ⚠ ' + F.ymLabel(firstLost.ym) + ' 재고 부족' : '')]]),
      h('p', { class: 'note sx-how', text: '위에서 아래로: ① 월별 예상 판매량을 적고 → ② 재고가 빨갛게 바닥나기 전에 발주 수량을 적고 → ③ 판매와 무관하게 나가는 고정비를 확인하고 → ④ 「월말 현금」이 빨간 달에 대표 차입금을 넣습니다(오른쪽 위 버튼으로 자동 채우기). 노란 칸만 입력, 바꾸면 바로 저장 · 계산됩니다.' }),
      ui.panel('Sheet · 월별 흐름 (2026.10 ~ 2027.03)', h('span', { class: 'meta', text: '노란 칸 = 입력 · 굵은 숫자 = 직접 고친 값' }),
        h('div', { class: 'table-wrap flat sx-wrap' }, grid)),
      h('div', { class: 'fin-sim-settings' },
        ui.panel('Settings · 기준값', null, h('div', { class: 'stack fin-form' },
          h('div', { class: 'row' }, setting('최소 보유 현금', 'minCash', 'money'), setting('시작 현금 (비우면 실잔액)', 'cash0', 'money')),
          h('div', { class: 'row' }, setting('발주 → 입고 리드타임 (개월)', 'lead'), setting('발주 달에 내는 비율 (%) · 100 = 전액', 'upfront'))),
          h('p', { class: 'meta', text: '발주 대금 = 발주 수량 × 1개당 제품 원가(' + F.won(Math.round(X.uv.cogs)) + '), 기본은 발주한 달에 전액 나가는 현금 기준입니다. 선금 · 잔금으로 나눠 내면 비율을 바꾸세요. 부가세 · 정산 시차는 무시한 단순 현금 모형입니다.' }))));
  }
  HR.register('sim', { render: render });
})();
