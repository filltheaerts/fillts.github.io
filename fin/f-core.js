/* fillts Finance — 데이터 구독 · 공통 계산 (런웨이 · 월별 현금흐름 · 잔액)
   컬렉션: fin_tx(통장 거래) · fin_plan(자금조달) · fin_sched(지출예정) · fin_files(가져온 파일) · fin_mail(세무사 발송 기록)
           fin_config/main(설정) · fin_status/main(서버 동기화 상태, 읽기 전용)
   권한: 관리자 + hr_users.apps.fin = view | edit — 서버 보안 규칙이 같은 값으로 판정한다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, BP = window.BankParse;
  var F = HR.F = { tx: [], card: [], plan: [], sched: [], files: [], mail: [], cfg: {}, status: {}, loaded: {} };
  F.FN = 'https://asia-northeast3-fillts-web.cloudfunctions.net/';
  F.DRIVE_SA = 'hr-calendar@fillts-web.iam.gserviceaccount.com';

  HR.APP.onStart = function (sub) {
    var on = function (k) { return function (s) { F[k] = HR.rows(s); F.loaded[k] = true; }; };
    sub(db.collection('fin_tx'), on('tx'));
    sub(db.collection('fin_card'), on('card'));   // 법인카드 명세 — 통장 「카드대금」 한 줄을 사용처별로 나눌 때 (payId = 그 카드대금 거래)
    sub(db.collection('fin_plan'), on('plan'));
    sub(db.collection('fin_sched'), on('sched'));
    sub(db.collection('fin_files').orderBy('at', 'desc').limit(60), on('files'));
    sub(db.collection('fin_mail').orderBy('at', 'desc').limit(30), on('mail'));
    sub(db.doc('fin_config/main'), function (s) { F.cfg = s.exists ? s.data() : {}; F.loaded.cfg = true; });
    sub(db.doc('fin_status/main'), function (s) { F.status = s.exists ? s.data() : {}; });
  };
  F.canEdit = function () { return HR.canEditApp('fin'); };
  // 화면 제목 위에 [시뮬] / [실제] 표시 (메뉴 구분과 같은 기준 — app.js FIN_SIM_MENUS)
  var baseHead = ui.head;
  ui.head = function (label, title, right) {
    var el = baseHead(label, title, right), menu = (location.hash || '#home').slice(1).split('/')[0] || 'home';
    var sim = (window.FIN_SIM_MENUS || []).indexOf(menu) >= 0, lab = el.querySelector('.label');
    if (lab) lab.insertBefore(h('span', { class: 'fin-mode ' + (sim ? 'sim' : 'real'), text: sim ? '시뮬 · 가정' : '실제 · 장부' }), lab.firstChild);
    return el;
  };
  // 설정 저장: 넘긴 항목(예: sim2)은 통째로 바꾼다. merge:true는 안쪽 맵을 합쳐 버려서 지운 칸(키 삭제)이 서버에 남는다 → mergeFields
  F.cfgSet = function (patch) { return db.doc('fin_config/main').set(patch, { mergeFields: Object.keys(patch) }); };

  /* ---------- 포맷 ---------- */
  F.won = function (n) { return fmt.won(n); };
  F.man = function (n) {   // 1,234만 · 1.2억
    n = Math.round(n || 0); var a = Math.abs(n), sg = n < 0 ? '-' : '';
    if (a >= 100000000) return sg + (a / 100000000).toFixed(a >= 1e9 ? 1 : 2).replace(/\.?0+$/, '') + '억';
    if (a >= 10000) return sg + Math.round(a / 10000).toLocaleString('ko-KR') + '만';
    return sg + a.toLocaleString('ko-KR') + '원';
  };
  F.ym = function (d) { return (d || '').slice(0, 7); };
  F.ymLabel = function (ym) { return ym ? ym.slice(2, 4) + '.' + ym.slice(5, 7) : ''; };
  F.thisYm = function () { return fmt.today().slice(0, 7); };
  F.parseWon = function (v) { var n = BP.num(v); return Math.round(n); };
  F.moneyInput = function (props) {
    var i = ui.input(Object.assign({ inputmode: 'numeric', autocomplete: 'off' }, props || {}));
    if (props && props.value) i.value = Math.round(+props.value || 0).toLocaleString('ko-KR');
    i.addEventListener('blur', function () { var n = F.parseWon(i.value); i.value = n ? n.toLocaleString('ko-KR') : ''; });
    return i;
  };
  F.acctName = function (t) {
    var k = (t.bank || '') + '|' + (t.acct || ''), al = (F.cfg.accts || {})[k];
    return al || [t.bank, t.acct ? '…' + t.acct : ''].filter(Boolean).join(' ') || '계좌 미상';
  };
  F.acctKey = function (t) { return (t.bank || '') + '|' + (t.acct || ''); };
  F.isTransfer = function (t) { return t.cat === BP.TRANSFER; };
  F.isFinancing = function (t) { return BP.FINANCING.indexOf(t.cat) >= 0; };

  // 정렬 키: 날짜 · 시각 · 파일 안 순서 (오래된 것이 앞)
  F.txKey = function (t) { return (t.date || '') + ' ' + (t.time || '') + ' ' + ('00000' + (t.seq || 0)).slice(-6); };
  F.sortedTx = function () { return F.tx.slice().sort(function (a, b) { return F.txKey(a) < F.txKey(b) ? 1 : -1; }); };

  /* ---------- 잔액 ---------- */
  // 계좌별 잔액: 통장 내역의 최근 잔액 + 설정에서 직접 입력한 계좌(cashAccts). 같은 계좌(key)면 기준일이 더 최근인 쪽
  F.ACCT_KIND = [['op', '운영 자금'], ['loan', '정책자금 · 대출금'], ['reserve', '예비 · 기타']];
  F.kindName = function (k) { return (F.ACCT_KIND.filter(function (x) { return x[0] === k; })[0] || ['', '운영 자금'])[1]; };
  F.balance = function () {
    var by = {};
    F.tx.forEach(function (t) {
      if (t.bal == null) return;
      var k = F.acctKey(t), c = by[k];
      if (!c || F.txKey(t) > F.txKey(c)) by[k] = t;
    });
    var accts = {};
    Object.keys(by).forEach(function (k) { var t = by[k]; accts[k] = { key: k, name: F.acctName(t), bal: t.bal, date: t.date, kind: ((F.cfg.acctKinds || {})[k]) || 'op', src: 'bank' }; });
    (F.cfg.cashAccts || []).forEach(function (m, i) {
      var k = m.key || ('m' + i), c = accts[k];
      if (c && c.date > (m.asOf || '')) return;
      accts[k] = { key: k, name: m.name || '계좌', bal: +m.amount || 0, date: m.asOf || '', kind: m.kind || 'op', note: m.note || '', src: 'manual', idx: i };
    });
    var list = Object.keys(accts).map(function (k) { return accts[k]; });
    var man = F.cfg.cash;   // 예전 방식(합계 하나 직접 입력) — 계좌가 하나도 없을 때만
    if (!list.length && man && man.amount != null) return { amount: +man.amount, asOf: man.asOf, src: 'manual', accts: [] };
    var sum = 0, asOf = '';
    list.forEach(function (a) { sum += a.bal; if (a.date > asOf) asOf = a.date; });
    return { amount: sum, asOf: asOf, src: list.length ? (list.some(function (a) { return a.src === 'bank'; }) ? 'bank' : 'manual') : 'none', accts: list };
  };

  /* ---------- 월별 집계 ---------- */
  F.monthly = function (list) {
    var M = {};
    (list || F.tx).forEach(function (t) {
      var ym = F.ym(t.date); if (!ym) return;
      var m = M[ym] || (M[ym] = { ym: ym, inn: {}, out: {}, inSum: 0, outSum: 0, opIn: 0, opOut: 0, fin: 0, xfer: 0, n: 0 });
      var cat = t.cat || (t.inAmt > 0 ? '기타 입금' : '미분류');
      m.n++;
      if (t.inAmt > 0) { m.inn[cat] = (m.inn[cat] || 0) + t.inAmt; m.inSum += t.inAmt; }
      if (t.outAmt > 0) { m.out[cat] = (m.out[cat] || 0) + t.outAmt; m.outSum += t.outAmt; }
      if (cat === BP.TRANSFER) { m.xfer += (t.inAmt || 0) - (t.outAmt || 0); return; }
      if (BP.FINANCING.indexOf(cat) >= 0) { m.fin += t.inAmt || 0; m.opOut += t.outAmt || 0; return; }
      m.opIn += t.inAmt || 0; m.opOut += t.outAmt || 0;
    });
    return M;
  };
  // 실제 월평균 지출 — 최근 완료된 n개월 통장 출금 중 원료 · 포장 발주(일회성 재고 매입) · 보증금 · 내부 이체 제외
  F.BURN_EXCL = ['원료 · 생산(OEM)', '포장 · 부자재', '보증금 · 예치금', BP.TRANSFER];
  F.actualBurn = function (n) {
    var cur = F.thisYm(), M = {};
    F.tx.forEach(function (t) { var k = F.ym(t.date); if (!k || k >= cur) return; M[k] = M[k] || 0; if (t.outAmt > 0 && F.BURN_EXCL.indexOf(t.cat) < 0) M[k] += t.outAmt; });
    var ks = Object.keys(M).sort().slice(-(n || 3));
    return { months: ks, avg: ks.length ? ks.reduce(function (a, k) { return a + M[k]; }, 0) / ks.length : 0, by: M };
  };
  // 최근 완료된 n개월 평균 (이번 달 제외, 거래가 있는 달만)
  F.recent = function (n) {
    var M = F.monthly(), cur = F.thisYm();
    var keys = Object.keys(M).filter(function (k) { return k < cur; }).sort().slice(-(n || 3));
    var avg = function (f) { return keys.length ? keys.reduce(function (a, k) { return a + f(M[k]); }, 0) / keys.length : 0; };
    return { months: keys, gross: avg(function (m) { return m.opOut; }), rev: avg(function (m) { return m.opIn; }), net: avg(function (m) { return m.opOut - m.opIn; }) };
  };

  /* ---------- 지출예정 펼치기 ---------- */
  // 매월 반복: day(1~31) · start/end(YYYY-MM) / 일회성: date. paid=true면 이미 나간 것
  /* ---------- 반복 지출 추정 — 통장 실제 이력으로 「매달 언제 · 얼마」를 잡는다 ----------
     최근 완료 4개월 중 3개월 이상 나간 거래처(급여 · 4대보험 · 카드대금은 분류 단위로 묶음)를
     평균 날짜 · 최근 3개월 평균 금액으로 다음 달들에 반복. 이번 달에 이미 나갔으면 이번 달은 건너뛴다. */
  F.RECUR_DAY = { '임대료': 25 };   // 고정 지급일 (대표 지정 261007: 임대료 · 관리비 매월 25일)
  F.RECUR_EXCL = ['원료 · 생산(OEM)', '포장 · 부자재', '보증금 · 예치금', '비품 · 장비', BP.TRANSFER];
  function recurKey(t) {
    if (t.cat === '급여') return ['급여', '급여 (이체)'];
    if (t.cat === '4대보험') return ['4대보험', '4대보험 (건강 · 연금 · 고용 · 산재)'];
    if (t.cat === '카드대금') return ['카드대금', '법인카드 대금'];
    if (t.cat === '임대료 · 관리비') return ['임대료', '임대료 · 관리비 (구명회 월세 + SKV1 관리비)'];
    if (/중진공대출/.test(t.desc || '')) return ['중진공이자', '중진공 정책자금 대출 이자'];
    var d = (t.desc || '').replace(/^[0-9０-９]+/, '').replace(/주식회사|\(주\)|㈜|（주）/g, '').replace(/\(.*\)/, '').trim();
    return [d, d];
  }
  // 반복 판정: 최근 완료 4개월 중 3번 이상, 또는 최근 2개월 연속(새로 시작된 반복 · 예: 대출 이자)
  F.recurring = function () {
    var cur = F.thisYm(), done = [fmt.ymShift(cur, -4), fmt.ymShift(cur, -3), fmt.ymShift(cur, -2), fmt.ymShift(cur, -1)];
    var G = {};
    F.tx.forEach(function (t) {
      if (!(t.outAmt > 0) || F.RECUR_EXCL.indexOf(t.cat) >= 0) return;
      var ym = F.ym(t.date); if (done.indexOf(ym) < 0 && ym !== cur) return;
      var k = recurKey(t), g = G[k[0]] || (G[k[0]] = { key: k[0], title: k[1], cat: t.cat, m: {}, days: [] });
      g.m[ym] = (g.m[ym] || 0) + t.outAmt; if (ym !== cur) g.days.push(+t.date.slice(8, 10));
    });
    return Object.keys(G).map(function (k) { return G[k]; }).filter(function (g) { var n = done.filter(function (ym) { return g.m[ym]; }).length; return n >= 3 || (g.m[done[2]] && g.m[done[3]]); }).map(function (g) {
      var last3 = done.slice(1).filter(function (ym) { return g.m[ym]; }), amt = last3.reduce(function (a, ym) { return a + g.m[ym]; }, 0) / (last3.length || 1);
      var ds = g.days.slice().sort(function (a, b) { return a - b; }), day = ds[Math.floor(ds.length / 2)] || 1;
      if (F.RECUR_DAY[g.key]) day = F.RECUR_DAY[g.key];
      return { key: g.key, title: g.title, cat: g.cat, amount: Math.round(amt), day: day, paidThisMonth: !!g.m[cur] };
    }).sort(function (a, b) { return a.day - b.day; });
  };
  F.recurMonthly = function () { return F.recurring().reduce(function (a, r) { return a + r.amount; }, 0); };
  F.schedIn = function (from, to) {
    var out = [], cur = F.thisYm(), today = fmt.today();
    // 반복 지출 = 통장 이력 추정 (지출 흐름의 「매월 반복」 가정값은 쓰지 않는다)
    F.recurring().forEach(function (r) {
      for (var ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = fmt.ymShift(ym, 1)) {
        if (ym < cur || (ym === cur && r.paidThisMonth)) continue;
        var last = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), d = ym + '-' + ('0' + Math.min(r.day, last)).slice(-2);
        if (d < from || d > to) continue;
        out.push({ s: { id: '', title: r.title, cat: r.cat, kind: 'auto' }, date: d, amount: r.amount, ym: ym, auto: true });
      }
    });
    F.sched.forEach(function (s) {
      if (s.kind === 'monthly') {
        // 매월 반복 중 「예정 증액」(planned)만 — 통장 이력에 아직 없는 앞으로의 변화 (예: 11월 인건비 증원)
        if (!s.planned) return;
        for (var ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = fmt.ymShift(ym, 1)) {
          if ((s.start && ym < s.start) || (s.end && ym > s.end) || ym < cur) continue;
          var last = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), d = ym + '-' + ('0' + Math.min(+s.day || 1, last)).slice(-2);
          if (d < from || d > to || (s.paidYms || []).indexOf(ym) >= 0) continue;
          out.push({ s: s, date: d, amount: +s.amount || 0, ym: ym, planned: true });
        }
        return;
      }
      if (s.date && s.date >= from && s.date <= to && !s.paid) out.push({ s: s, date: s.date, amount: +s.amount || 0, ym: s.date.slice(0, 7) });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  };
  F.fixedMonthly = function (ym) {
    return F.sched.filter(function (s) { return s.kind === 'monthly' && !s.planned && (!s.start || ym >= s.start) && (!s.end || ym <= s.end); })
      .reduce(function (a, s) { return a + (+s.amount || 0); }, 0);
  };

  /* ---------- 자금조달 ---------- */
  F.PLAN_STATUS = [['idea', '검토'], ['prep', '준비'], ['applied', '신청'], ['review', '심사'], ['approved', '승인 · 확정'], ['received', '입금 완료'], ['dropped', '탈락 · 보류']];
  F.PLAN_KIND = ['정책자금', '보증 대출', '정부지원 · R&D', '투자', '은행 대출', '대표 가수금', '기타'];
  F.statusName = function (k) { return (F.PLAN_STATUS.filter(function (x) { return x[0] === k; })[0] || [k, k])[1]; };
  F.OWNER = '대표 가수금';   // 대표 개인자금 투입 — 런웨이를 「법인 통장만」과 「대표 자금 포함」으로 나눠 본다
  F.planWeight = function (p, scen) {
    if (p.status === 'received' || p.status === 'dropped') return 0;   // 입금 완료는 이미 잔액에 있다
    if (scen === 'safe') return p.status === 'approved' ? 1 : 0;
    if (scen === 'best') return 1;
    return p.status === 'approved' ? 1 : Math.max(0, Math.min(100, +p.prob || 0)) / 100;
  };

  /* ---------- 런웨이 예측 ---------- */
  F.SCEN = [['safe', '보수 — 확정 조달만'], ['base', '기본 — 확률 반영'], ['best', '낙관 — 계획 전부']];
  // opt.noOwner: 대표 개인자금(가수금) 계획을 빼고 계산
  F.project = function (scen, months, opt) {
    months = months || 24; opt = opt || {};
    var bal = F.balance(), rc = F.recent(3), cfg = F.cfg, start = F.thisYm();
    var revBase = cfg.revenue != null && cfg.revenue !== '' ? +cfg.revenue : rc.rev;
    var growth = (+cfg.revGrowth || 0) / 100;
    var fixedNow = F.fixedMonthly(start);
    var variable = cfg.varBurn != null && cfg.varBurn !== '' ? +cfg.varBurn : Math.max(0, rc.gross - fixedNow);
    // 판매량 기반 (지출 흐름 › 변동비의 월 판매 예상): 매출 = 수량 × 순매출, 변동비 = 수량 × (물류 · 수수료 · 반품 · 리뷰 + 광고)
    var rs = cfg.runSales || {}, byUnits = +rs.units > 0 && F.unitPnl, uu = byUnits ? F.unitPnl() : null;
    var unitsAt = function (ym) {
      if (!byUnits || ym < (rs.from || start)) return 0;
      var k = 0; for (var y = rs.from || start; y < ym; y = fmt.ymShift(y, 1)) k++;
      return Math.min(+rs.cap || Infinity, Math.round(+rs.units * Math.pow(1 + (+rs.growth || 0) / 100, k)));
    };
    if (byUnits) { revBase = unitsAt(start) * uu.net; variable = unitsAt(start) * (uu.varNoAd + uu.ad); }
    var cash = bal.amount, rows = [], zero = null, today = fmt.today();
    for (var i = 0; i < months; i++) {
      var ym = fmt.ymShift(start, i), from = i === 0 ? today : ym + '-01', last = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
      var part = i === 0 ? Math.max(0, (last - (+today.slice(8, 10)) + 1) / last) : 1;   // 이번 달은 남은 날짜 비율만
      var fixed = F.fixedMonthly(ym) * part;
      var mEnd = ym + '-' + ('0' + last).slice(-2);
      var once = F.schedIn(from, mEnd).filter(function (o) { return o.s.kind !== 'monthly'; }).reduce(function (a, o) { return a + o.amount; }, 0)
        + (F.extraOut ? F.extraOut(from, mEnd).reduce(function (a, o) { return a + o.amount; }, 0) : 0);   // 재고 매입 미지급분 (결제 예정일 기준)
      var rev = byUnits ? unitsAt(ym) * uu.net * part : revBase * Math.pow(1 + growth, i) * part;
      var varM = byUnits ? unitsAt(ym) * (uu.varNoAd + uu.ad) * part : variable * part;
      var fund = F.plan.reduce(function (a, p) { if (opt.noOwner && p.kind === F.OWNER) return a; return a + (p.date && p.date.slice(0, 7) === ym && p.date >= (i === 0 ? today : '') ? (+p.amount || 0) * F.planWeight(p, scen) : 0); }, 0);
      var outM = fixed + varM + once;
      cash = cash + rev + fund - outM;
      rows.push({ ym: ym, rev: rev, fund: fund, fixed: fixed, variable: varM, once: once, out: outM, end: cash, units: byUnits ? Math.round(unitsAt(ym) * part) : null });
      if (zero == null && cash < 0) zero = i;
    }
    var netBurn = variable + fixedNow - revBase;
    var owner = F.plan.filter(function (p) { return p.kind === F.OWNER && p.status !== 'received' && p.status !== 'dropped'; }).reduce(function (a, p) { return a + (+p.amount || 0); }, 0);
    return { bal: bal, rows: rows, zero: zero, netBurn: netBurn, owner: owner, byUnits: byUnits, variable: variable, fixed: fixedNow, rev: revBase, recent: rc,
      simple: netBurn > 0 ? bal.amount / netBurn : null };
  };

  /* ---------- 공용 UI ---------- */
  F.seg = function (items, val, onpick, label) {
    var seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || '' });
    items.forEach(function (x) { seg.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(val === x[0]), class: val === x[0] ? 'on' : '', text: x[1], onclick: function () { onpick(x[0]); HR.refresh(); } })); });
    return seg;
  };
  F.kpi = function (pairs, cls) {
    return h('dl', { class: 'summary ' + (cls || '') }, pairs.filter(Boolean).map(function (p) { return h('div', null, h('dt', { text: p[0] }), h('dd', { class: p[2] || '', text: p[1] }), p[3] ? h('span', { class: 'meta', text: p[3] }) : null); }));
  };
  F.readOnlyNote = function () { return F.canEdit() ? null : h('p', { class: 'note', text: '열람 권한입니다 — 입력 · 업로드 · 발송은 편집 권한이 필요합니다 (HR 관리자 › 설정 › 앱 접근).' }); };
  // 막대 그래프 (음수는 아래로) — 위치 · 크기는 CSSOM으로 (CSP가 인라인 style 속성을 막는다)
  F.bars = function (items, opt) {
    opt = opt || {};
    var max = Math.max.apply(null, items.map(function (x) { return Math.abs(x.v); }).concat([1]));
    var hasNeg = items.some(function (x) { return x.v < 0; });
    var wrap = h('div', { class: 'fbars' + (hasNeg ? ' has-neg' : '') });
    items.forEach(function (x) {
      var col = h('div', { class: 'fbar' + (x.cls ? ' ' + x.cls : ''), title: x.title || '' });
      var fill = h('span', { class: 'fbar-fill' + (x.v < 0 ? ' neg' : '') });
      fill.style.height = Math.max(2, Math.round(Math.abs(x.v) / max * (hasNeg ? 50 : 100))) + '%';
      if (hasNeg) { if (x.v < 0) fill.style.top = '50%'; else fill.style.bottom = '50%'; }
      col.appendChild(h('span', { class: 'fbar-val', text: opt.fmt ? opt.fmt(x.v) : F.man(x.v) }));
      col.appendChild(h('span', { class: 'fbar-track' }, fill));
      col.appendChild(h('span', { class: 'fbar-lab', text: x.label }));
      wrap.appendChild(col);
    });
    return wrap;
  };
  // 로그인한 사용자의 ID 토큰으로 Cloud Function 호출
  F.call = function (name, body) {
    return HR.auth.currentUser.getIdToken().then(function (tok) {
      return fetch(F.FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body || {}) });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }); });
  };
  F.download = function (blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  };
})();
