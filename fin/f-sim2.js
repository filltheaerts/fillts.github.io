/* fillts Finance — 런웨이 시뮬레이션 (엑셀형 월별 한 장)
   위에서 아래로: ① 예상 판매량 → ② 발주 시점 · 수량 → (재고 · 매출 · 변동비 자동) → ③ 판매와 무관한 고정비(지출 흐름 고정비 + 채용 예정)
   → ④ 현금 리스크 구간 · 대표 차입금. 기간은 2026-10 ~ 2027-03 (6개월).
   저장: fin_config/main.sim2 — 칸을 바꾸면 바로 저장. 개당 값은 개당 손익(F.unitPnl), 고정비는 지출 흐름(fin_sched 매월 반복)을 그대로 쓴다. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt;
  var END = '2027-03', CHECK = END;
  var SIM2 = {
    start: '2026-10', end: END, minCash: 10000000, lead: 1, upfront: 50, cash0: null, committed: true,
    units: { '2026-11': 300, '2026-12': 400, '2027-01': 500, '2027-02': 600, '2027-03': 700 },
    orders: {},
    owner: {}, fund: {},
    hires: [
      { role: '브랜드 디자인 리더', monthly: 4000000, from: '2027-02' },
      { role: 'D2C 국내 리더', monthly: 4000000, from: '2027-04' },
      { role: '콘텐츠 팀원', monthly: 3200000, from: '2027-05' },
      { role: 'D2C 해외 리더', monthly: 4500000, from: '2027-08' },
      { role: '연구개발 전담 매니저', monthly: 4000000, from: '2027-09' }
    ]
  };
  F.SIM2 = SIM2;
  function cfg() { var o = JSON.parse(JSON.stringify(SIM2)), s = F.cfg.sim2 || {}; Object.keys(s).forEach(function (k) { o[k] = s[k]; }); o.end = END; return o; }
  function save(patch) { return F.cfgSet({ sim2: Object.assign(cfg(), patch) }).catch(ui.fail); }

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
    var u = F.unitPnl(), cogs = u.cogs, per = u.varNoAd + u.ad;
    var st = F.invStock ? F.invStock() : {}, prod = Object.keys(st).map(function (k) { return st[k]; }).filter(function (x) { return x.it.type === 'product'; })[0];
    var stock = prod ? prod.onHand + prod.ordered : 5000;
    var cash = c.cash0 != null && c.cash0 !== '' ? +c.cash0 : F.balance().amount, start = cash;
    var committed = c.committed ? F.sched.filter(function (s) { return s.kind !== 'monthly' && !s.paid && s.date >= fmt.today(); }) : [];
    var lead = +c.lead || 0, up = (+c.upfront || 0) / 100, R = [];
    months(c).forEach(function (ym) {
      var r = { ym: ym };
      r.arrive = +(c.orders[fmt.ymShift(ym, -lead)] || 0); stock += r.arrive;
      r.plan = +(c.units[ym] || 0); r.sold = Math.min(r.plan, stock); r.lost = r.plan - r.sold; stock -= r.sold; r.stock = stock;
      r.order = +(c.orders[ym] || 0);
      r.rev = r.sold * u.net; r.vari = r.sold * per;
      var fx = F.fixedAt(ym);
      r.hire = (c.hires || []).reduce(function (a, x) { return a + (x.from && ym >= x.from ? +x.monthly || 0 : 0); }, 0);
      r.pay = fx.pay; r.rent = fx.rent; r.ops = fx.ops; r.fixed = fx.total + r.hire;
      r.inv = r.order * cogs * up + r.arrive * cogs * (1 - up);
      r.committed = committed.filter(function (s) { return s.date.slice(0, 7) === ym; }).reduce(function (a, s) { return a + (+s.amount || 0); }, 0);
      r.owner = +(c.owner[ym] || 0); r.fund = +(c.fund[ym] || 0);
      r.op = r.rev - r.vari - r.fixed;                     // 영업 현금 (재고 매입 전)
      r.flow = r.op - r.inv - r.committed + r.owner + r.fund;
      cash += r.flow; r.cash = cash;
      r.need = cash < +c.minCash ? Math.ceil((+c.minCash - cash) / 10000000) * 10000000 : 0;   // 최소 보유액까지 채우려면 (천만 원 단위)
      R.push(r);
    });
    return { rows: R, u: u, start: start, c: c };
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
    var opPlus = R.filter(function (r) { return r.sold && r.op >= 0; })[0];
    var ownerLimit = F.plan.filter(function (p) { return p.kind === F.OWNER && p.status !== 'dropped'; }).reduce(function (a, p) { return a + (+p.amount || 0); }, 0);

    // 엑셀형 표: 행 = 항목, 열 = 월
    var cols = R.map(function (r) { return r.ym; });
    var head = h('tr', null, h('th', { class: 'sx-k', text: '' }), cols.map(function (ym) {
      return h('th', { class: 'num', text: F.ymLabel(ym) });
    }));
    var body = h('tbody');
    var sec = function (title, note) { body.appendChild(h('tr', { class: 'sx-sec' }, h('td', { class: 'sx-k' }, h('span', { text: title }), note ? h('span', { class: 'meta', text: '  ' + note }) : null), cols.map(function () { return h('td'); }))); };
    var cell = function (ym, val, cls) { return h('td', { class: 'num' + '' + (cls ? ' ' + cls : ''), text: val }); };
    var row = function (label, f, cls, rowCls) { body.appendChild(h('tr', { class: rowCls || '' }, h('td', { class: 'sx-k', text: label }), R.map(function (r) { var v = f(r); return cell(r.ym, v.t != null ? v.t : v, v.c || cls); }))); };
    var inputRow = function (label, key, unitText, guide) {
      body.appendChild(h('tr', { class: 'sx-input' }, h('td', { class: 'sx-k' }, h('div', { class: 'strong', text: label }), h('div', { class: 'meta', text: guide })), cols.map(function (ym) {
        var v = c[key][ym], i = h('input', { type: 'text', inputmode: 'numeric', class: 'sx-cell', value: v ? Number(v).toLocaleString('ko-KR') : '', 'aria-label': ym + ' ' + label, disabled: ed ? null : true });
        i.addEventListener('focus', function () { i.select(); });
        i.addEventListener('change', function () { var o = Object.assign({}, c[key]); var n = F.parseWon(i.value); if (n) o[ym] = n; else delete o[ym]; var p = {}; p[key] = o; save(p); });
        return h('td', { class: 'num' + '' }, i);
      })));
    };
    var m = function (v) { return v ? F.man(v) : ''; };
    var n = function (v) { return v ? Math.round(v).toLocaleString('ko-KR') : ''; };

    sec('① 판매', '런칭 2026.11.12');
    inputRow('예상 판매량 (개)', 'units', '개', '월별로 직접 입력');
    row('실제 판매 가능', function (r) { return { t: n(r.sold) + (r.lost ? ' (−' + n(r.lost) + ')' : ''), c: r.lost ? 'red' : '' }; });
    row('순매출', function (r) { return m(r.rev); });
    row('변동비 (물류 · 수수료 · 광고)', function (r) { return m(-r.vari); }, 'meta');
    sec('② 재고 · 발주', (+c.lead === 1 ? '다음 달 입고' : c.lead + '개월 뒤 입고') + ' · 선금 ' + c.upfront + '% (발주 달) / 잔금 (입고 달)');
    inputRow('발주 수량 (개)', 'orders', '개', +c.lead === 1 ? '발주한 달에 입력 → 다음 달 1일부터 판매' : '발주한 달에 입력 → ' + c.lead + '개월 뒤 1일부터 판매');
    row('입고', function (r) { return n(r.arrive); }, 'meta');
    row('월말 재고', function (r) { return { t: n(r.stock) || '0', c: r.stock < (at(fmt.ymShift(r.ym, 1)).plan || 0) ? 'red' : '' }; });
    row('재고 매입 대금', function (r) { return m(-r.inv); });
    if (R.some(function (r) { return r.committed; })) row('이미 정해진 지급 (에코먼트 잔금 등)', function (r) { return m(-r.committed); });
    sec('③ 판매와 무관하게 매달 나가는 돈', '지출 흐름 › 고정비 + 아래 채용 계획');
    row('인건비 (현원)', function (r) { return m(-r.pay); });
    row('인건비 (채용 예정)', function (r) { return m(-r.hire); });
    row('임대료 · 관리비', function (r) { return m(-r.rent); });
    row('운영비 (툴 · 세무 · 물류 기본료 · 이자 · 기타)', function (r) { return m(-r.ops); });
    row('고정비 합계', function (r) { return m(-r.fixed); }, 'strong', 'sx-sum');
    sec('④ 현금', '최소 보유 ' + F.man(+c.minCash));
    row('영업 현금 (매출 − 변동비 − 고정비)', function (r) { return { t: F.man(r.op), c: r.op < 0 ? 'red' : '' }; });
    inputRow('대표 차입금 (원)', 'owner', '원', '대표 개인 → 법인 (가수금)');
    inputRow('기타 조달 (원)', 'fund', '원', '정책자금 · 대출 입금');
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
        ['영업 흑자 전환', opPlus ? F.ymLabel(opPlus.ym) : '27.03까지 없음', opPlus ? '' : 'red', '매출 − 변동비 − 고정비 ≥ 0' + (firstLost ? ' · ⚠ ' + F.ymLabel(firstLost.ym) + ' 재고 부족' : '')]]),
      h('p', { class: 'note sx-how', text: '위에서 아래로: ① 월별 예상 판매량을 적고 → ② 재고가 빨갛게 바닥나기 전에 발주 수량을 적고 → ③ 판매와 무관하게 나가는 고정비를 확인하고 → ④ 「월말 현금」이 빨간 달에 대표 차입금을 넣습니다(오른쪽 위 버튼으로 자동 채우기). 노란 칸만 입력, 바꾸면 바로 저장 · 계산됩니다.' }),
      ui.panel('Sheet · 월별 흐름 (2026.10 ~ 2027.03)', h('span', { class: 'meta', text: '1개당 순매출 ' + F.won(Math.round(u.net)) + ' · 변동비 ' + F.won(Math.round(u.varNoAd + u.ad)) + ' · 원가 ' + F.won(Math.round(u.cogs)) + ' (개당 손익 메뉴)' }),
        h('div', { class: 'table-wrap flat sx-wrap' }, grid)),
      h('div', { class: 'two-col fin-two' },
        ui.panel('Hires · 채용 계획 (③ 인건비 채용 예정에 들어감)', null, hires,
          h('p', { class: 'meta', text: '현원 인건비 · 임대료 · 운영비는 「지출 흐름 › 고정비」에서 고칩니다. 여기는 아직 입사 전인 사람만.' })),
        ui.panel('Settings · 기준값', null, h('div', { class: 'stack fin-form' },
          h('div', { class: 'row' }, setting('최소 보유 현금', 'minCash', 'money'), setting('시작 현금 (비우면 실잔액)', 'cash0', 'money')),
          h('div', { class: 'row' }, setting('발주 → 입고 리드타임 (개월)', 'lead'), setting('발주 선금 (%)', 'upfront'))),
          h('p', { class: 'meta', text: '재고 매입 대금 = 발주 수량 × 제품 원가(공급가 ' + F.won(Math.round(u.cogs)) + '). 선금은 발주한 달, 잔금은 입고한 달에 나갑니다. 부가세 · 정산 시차는 무시한 단순 현금 모형입니다.' }))));
  }
  HR.register('sim', { render: render });
})();
