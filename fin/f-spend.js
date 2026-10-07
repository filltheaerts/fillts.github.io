/* fillts Finance — 월별 사용처: 통장 거래내역(실제)만으로 「어디에 · 언제 · 얼마」를 한 표로.
   행 = 사용처 묶음(인건비 · 사무실 · 세무 · 제품 · 마케팅 · 카드 · 기타) › 분류, 열 = 월. 칸을 누르면 그 달 그 분류의 거래가 아래에 뜬다.
   보증금은 자산이라 비용 합계에서 뺀다. 대표 가수금 · 정책자금 등 들어온 돈은 아래 「돈이 들어온 곳」에 따로. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, ui = HR.ui, h = ui.h, fmt = HR.fmt, BP = window.BankParse;
  var V = { per: '', sel: null };   // per: 'YYYY' | 'r12' | 'all'
  var GROUPS = [
    ['인건비', ['급여', '4대보험', '복리후생 · 식대']],
    ['사무실', ['임대료 · 관리비', '통신 · 인터넷', '비품 · 장비']],
    ['세무 · 세금', ['세무 · 회계', '세금 · 공과금']],
    ['법무 · 특허', ['법무 · 특허']],
    ['제품 (원료 · 포장 · 물류)', ['원료 · 생산(OEM)', '포장 · 부자재', '물류 · 배송']],
    ['마케팅', ['마케팅 · 광고']],
    ['법인카드', ['카드대금']],
    ['금융 · 기타', ['이자 · 수수료', '대출 상환', '소프트웨어 · 구독', '출장 · 교통', '기타 지출', '미분류']]
  ];
  var ASSET = ['보증금 · 예치금'];
  var CARD_NOTE = '법인카드는 통장에서 「카드대금」 한 줄로 빠집니다. 카드 명세서로 용도가 뚜렷한 것(특허 · 가구 · 구글 · 지방세 등)은 그 사용처로 옮기고, 남은 금액(해외 수수료 · 용도 불명)만 카드대금에 둡니다.';
  var man = function (v) { return v ? F.man(v) : ''; };
  // 세금 · 공과금 세부 — 거래처 이름(desc) 먼저, 없으면 메모로 판정
  var TAXT = ['법인세', '부가가치세', '원천세 (근로소득세)', '지방소득세 (원천분)', '주민세 (사업소분)', '등록면허세', '등기 수수료', '기타 세금 · 공과금'];
  function taxType(t) {
    var d = t.desc || '', n = (t.note || '') + ' ' + (t.memo || '');
    if (/특징|지방소득/.test(d)) return '지방소득세 (원천분)';
    if (/주민/.test(d)) return '주민세 (사업소분)';
    if (/시세입금|등록면허/.test(d) || /등록면허/.test(n)) return '등록면허세';
    if (/법원/.test(d)) return '등기 수수료';
    if (/국세|세무서|홈택스/.test(d)) return /법인세/.test(n) ? '법인세' : /부가/.test(n) ? '부가가치세' : '원천세 (근로소득세)';
    if (/법인세/.test(d + n)) return '법인세';
    if (/부가/.test(d + n)) return '부가가치세';
    return '기타 세금 · 공과금';
  }

  // 합계 열 시작(월 열 다음 칸)에 굵은 구분선
  function markTot(table, n) {
    [].forEach.call(table.querySelectorAll('tr'), function (tr) {
      var cs = tr.children; if (cs.length > n + 1) cs[n + 1].classList.add('sp-tot');
    });
    return table;
  }

  // 카드대금 거래 하나에 연결된 카드 명세 중 분류가 뚜렷한 것 (fin_card.payId === 거래 id, cat 있음)
  function cardSplit(t) { return F.card.filter(function (x) { return x.payId === t.id && x.cat && x.cat !== '카드대금'; }); }

  function months(per) {
    var ks = {}; F.tx.forEach(function (t) { var k = F.ym(t.date); if (k) ks[k] = 1; });
    var all = Object.keys(ks).sort();
    if (per === 'all') return all;
    if (per === 'r12') return all.slice(-12);
    return all.filter(function (k) { return k.slice(0, 4) === per; });
  }

  function render(view) {
    var years = {}; F.tx.forEach(function (t) { if (t.date) years[t.date.slice(0, 4)] = 1; });
    var ys = Object.keys(years).sort();
    if (!V.per) V.per = ys.length ? ys[ys.length - 1] : 'r12';
    var keys = months(V.per);
    var tools = h('div', { class: 'toolbar' }, F.seg(ys.map(function (y) { return [y, y + '년']; }).concat([['r12', '최근 12개월'], ['all', '전체']]), V.per, function (k) { V.per = k; V.sel = null; }, '기간'));
    if (!F.tx.length) return ui.put(view, ui.head('실제 · 통장', '월별 사용처'), ui.empty('거래내역을 가져오면 월별 사용처가 여기에 표시됩니다.'));

    var inK = {}; keys.forEach(function (k) { inK[k] = 1; });
    var M = {}, IN = {}, known = {};
    GROUPS.forEach(function (g) { g[1].forEach(function (c) { known[c] = 1; }); }); ASSET.forEach(function (c) { known[c] = 1; });
    F.tx.forEach(function (t) {
      var k = F.ym(t.date); if (!inK[k] || F.isTransfer(t)) return;
      if (t.outAmt > 0) {
        var c = known[t.cat] ? t.cat : '미분류', amt = t.outAmt;
        if (c === '카드대금') cardSplit(t).forEach(function (x) { (M[x.cat] = M[x.cat] || {})[k] = (M[x.cat][k] || 0) + x.amount; amt -= x.amount; });
        if (amt) (M[c] = M[c] || {})[k] = (M[c][k] || 0) + amt;
      }
      if (t.inAmt > 0) { var ci = t.cat || '기타 입금'; (IN[ci] = IN[ci] || {})[k] = (IN[ci][k] || 0) + t.inAmt; }
    });
    var sumRow = function (o) { return keys.reduce(function (a, k) { return a + ((o || {})[k] || 0); }, 0); };
    var monthTot = {}; keys.forEach(function (k) { monthTot[k] = 0; });
    GROUPS.forEach(function (g) { g[1].forEach(function (c) { keys.forEach(function (k) { monthTot[k] += (M[c] || {})[k] || 0; }); }); });
    var total = keys.reduce(function (a, k) { return a + monthTot[k]; }, 0);
    var active = keys.filter(function (k) { return monthTot[k] > 0; }).length || 1;

    // 표
    var cell = function (c, k, v, cls) {
      var on = V.sel && V.sel.c === c && V.sel.k === k;
      if (!v) return h('td', { class: 'num' });
      return h('td', { class: 'num' + (cls ? ' ' + cls : '') }, h('button', { type: 'button', class: 'sp-cell' + (on ? ' on' : ''), text: F.man(v), title: (k ? F.ymLabel(k) + ' · ' : '') + c + ' — ' + F.won(v) + '원 · 눌러서 거래 보기',
        onclick: function () { V.sel = on ? null : { c: c, k: k }; HR.refresh(); } }));
    };
    var head = h('tr', null, h('th', { text: '사용처' }), keys.map(function (k) { return h('th', { class: 'num', text: F.ymLabel(k) }); }), h('th', { class: 'num', text: '합계' }), h('th', { class: 'num', text: '월평균' }), h('th', { class: 'num', text: '비중' }));
    var body = h('tbody');
    var share = function (v) { return total ? Math.round(v / total * 1000) / 10 + '%' : ''; };
    GROUPS.forEach(function (g) {
      var cats = g[1].filter(function (c) { return sumRow(M[c]); });
      if (!cats.length) return;
      var gt = {}; keys.forEach(function (k) { gt[k] = cats.reduce(function (a, c) { return a + ((M[c] || {})[k] || 0); }, 0); });
      var gs = sumRow(gt);
      body.appendChild(h('tr', { class: 'sp-grp' }, h('td', { text: g[0] }), keys.map(function (k) { return h('td', { class: 'num', text: man(gt[k]) }); }),
        h('td', { class: 'num', text: F.man(gs) }), h('td', { class: 'num', text: F.man(gs / active) }), h('td', { class: 'num', text: share(gs) })));
      cats.forEach(function (c) {
        var s = sumRow(M[c]);
        body.appendChild(h('tr', { class: 'sp-cat' }, h('td', { text: c, title: c === '카드대금' ? CARD_NOTE : '' }), keys.map(function (k) { return cell(c, k, (M[c] || {})[k] || 0); }),
          cell(c, '', s, 'strong'), h('td', { class: 'num meta', text: F.man(s / active) }), h('td', { class: 'num meta', text: share(s) })));
        if (c === '세금 · 공과금') {
          var T = {};
          F.tx.forEach(function (t) { var k = F.ym(t.date); if (!inK[k] || t.cat !== c || !(t.outAmt > 0)) return; var ty = taxType(t); (T[ty] = T[ty] || {})[k] = (T[ty][k] || 0) + t.outAmt; });
          TAXT.forEach(function (ty) {
            var ts = sumRow(T[ty]); if (!ts) return;
            body.appendChild(h('tr', { class: 'sp-sub' }, h('td', { text: ty }), keys.map(function (k) { return cell('tax:' + ty, k, (T[ty] || {})[k] || 0); }),
              cell('tax:' + ty, '', ts), h('td', { class: 'num meta', text: F.man(ts / active) }), h('td', { class: 'num meta', text: share(ts) })));
          });
        }
      });
    });
    body.appendChild(h('tr', { class: 'fin-sum' }, h('td', { text: '지출 합계' }), keys.map(function (k) { return h('td', { class: 'num', text: man(monthTot[k]) }); }),
      h('td', { class: 'num', text: F.man(total) }), h('td', { class: 'num', text: F.man(total / active) }), h('td', { class: 'num', text: total ? '100%' : '' })));
    ASSET.forEach(function (c) {
      if (!sumRow(M[c])) return;
      body.appendChild(h('tr', { class: 'sp-asset' }, h('td', { text: c + ' (자산 · 합계 제외)' }), keys.map(function (k) { return cell(c, k, (M[c] || {})[k] || 0); }), cell(c, '', sumRow(M[c])), h('td'), h('td')));
    });

    // 들어온 돈
    var inCats = BP.CATS_IN.concat(Object.keys(IN).filter(function (c) { return BP.CATS_IN.indexOf(c) < 0; })).filter(function (c) { return sumRow(IN[c]); });
    var inBody = h('tbody', null, inCats.map(function (c) {
      return h('tr', null, h('td', { text: c }), keys.map(function (k) { return cell('in:' + c, k, (IN[c] || {})[k] || 0); }), cell('in:' + c, '', sumRow(IN[c]), 'strong'));
    }));
    var inHead = h('tr', null, h('th', { text: '입금 분류' }), keys.map(function (k) { return h('th', { class: 'num', text: F.ymLabel(k) }); }), h('th', { class: 'num', text: '합계' }));

    // 큰 항목
    var top = [];
    GROUPS.forEach(function (g) { g[1].forEach(function (c) { var s = sumRow(M[c]); if (s) top.push([c, s]); }); });
    top.sort(function (a, b) { return b[1] - a[1]; });
    var ownerIn = sumRow(IN['대표 가수금']);
    // 누적 자본조달 — 기간 선택과 무관, 설립 자본금(투자 · 자본금 중 설립 납입)은 뺀다
    var raised = F.tx.filter(function (t) { return t.inAmt > 0 && ['정부지원 · 정책자금', '대출 입금', '투자 · 자본금'].indexOf(t.cat) >= 0; }).reduce(function (a, t) { return a + t.inAmt; }, 0) - (+(F.cfg.capital || 0));

    ui.put(view, ui.head('실제 · 통장', '월별 사용처'), tools,
      F.kpi([['기간 지출 (보증금 제외)', F.man(total), '', keys.length ? F.ymLabel(keys[0]) + ' ~ ' + F.ymLabel(keys[keys.length - 1]) : ''],
        ['월평균 지출', F.man(total / active), '', active + '개월 기준'],
        ['가장 큰 사용처', top[0] ? top[0][0] : '—', '', top[0] ? F.man(top[0][1]) + ' · ' + share(top[0][1]) : ''],
        ['대표 가수금 입금', F.man(ownerIn), '', '같은 기간 · 대표 → 법인'],
        ['누적 자본조달', F.man(raised), '', '정책자금 · 대출 · 투자 (전체 기간 · 설립 자본금 제외)']], 'five'),
      ui.panel('어디에 썼나 (월별)', null, h('div', { class: 'table-wrap flat' }, markTot(h('table', { class: 'table fin-table fin-flow fin-spend' }, h('thead', null, head), body), keys.length)),
        h('p', { class: 'meta', text: '통장 출금 기준(현금주의) · 금액 칸을 누르면 그 달 그 분류의 거래가 아래에 표시됩니다. ' + CARD_NOTE + ' 분류는 거래내역에서 바꾸면 바로 반영됩니다.' })),
      V.sel ? detail(V.sel, keys) : null,
      inCats.length ? ui.panel('돈이 들어온 곳 (월별)', null, h('div', { class: 'table-wrap flat' }, markTot(h('table', { class: 'table fin-table fin-flow fin-spend' }, h('thead', null, inHead), inBody), keys.length))) : null,
      ownerPanel());
  }

  /* ---------- 대표 가수금 누적 (출자전환 대비) — 기간 선택과 무관하게 전체 기간.
     25년 마감까지는 결산 장부(재무제표 단기차입금)가 기준: fin_config/main.ownerBook {asOf, amount, src}.
     통장 누적과 차이는 그 달에 「결산 조정」 한 줄로 맞추고, 그 뒤는 통장 입금 · 반환으로 이어간다. */
  function ownerPanel() {
    var ob = F.cfg.ownerBook || null, capital = +(F.cfg.capital || 0);
    var own = F.tx.filter(function (t) { return t.cat === '대표 가수금'; });
    if (!own.length && !ob) return null;
    var M = {};
    own.forEach(function (t) { var k = F.ym(t.date), m = M[k] || (M[k] = { inn: 0, out: 0, n: 0 }); m.inn += t.inAmt || 0; m.out += t.outAmt || 0; m.n++; });
    var keys = Object.keys(M).sort(), adjK = ob ? F.ym(ob.asOf) : null;
    if (adjK && keys.indexOf(adjK) < 0) { keys.push(adjK); keys.sort(); M[adjK] = { inn: 0, out: 0, n: 0 }; }
    var bank = 0, book = 0, adj = 0, rows = [];
    keys.forEach(function (k) {
      var m = M[k]; bank += m.inn - m.out; book += m.inn - m.out;
      var a = 0;
      if (k === adjK) { a = (+ob.amount || 0) - book; book += a; adj = a; }
      rows.push(h('tr', { class: k === adjK ? 'sp-grp' : '' }, h('td', { text: F.ymLabel(k) }), h('td', { class: 'num', text: m.inn ? F.won(m.inn) : '' }), h('td', { class: 'num', text: m.out ? F.won(m.out) : '' }),
        h('td', { class: 'num meta', text: a ? (a > 0 ? '+' : '') + F.won(a) : '' }), h('td', { class: 'num strong', text: F.won(book) }), h('td', { class: 'meta', text: k === adjK ? '결산 마감 — ' + (ob.src || '재무제표') + ' 금액으로 맞춤' : m.n + '건' })));
    });
    rows.reverse();
    var tb = h('table', { class: 'table fin-table fin-spend fin-narrow' }, h('thead', null, h('tr', null, ['월', '입금 (대표 → 법인)', '반환 (법인 → 대표)', '결산 조정', '누적 가수금', '비고'].map(function (x, i) { return h('th', { class: i >= 1 && i <= 4 ? 'num' : '', text: x }); }))), h('tbody', null, rows));
    return ui.panel('대표 가수금 누적 · 출자전환 대비', null,
      F.kpi([['지금 가수금 잔액', F.won(book) + '원', 'strong', '결산 장부 기준 (' + (ob ? fmt.dot(ob.asOf).slice(2) + ' 마감 + 이후 통장' : '통장 누적') + ')'],
        ['통장으로만 본 누적', F.won(bank) + '원', '', adj ? '장부와 차이 ' + (adj > 0 ? '+' : '') + F.won(adj) + '원 — 장부를 따름' : '장부와 같음'],
        ['지금 자본금', capital ? F.won(capital) + '원' : '—', '', '설립 납입'],
        ['전액 출자전환 시 자본', capital ? F.won(capital + book) + '원' : '—', '', '자본금 + 가수금 잔액 (주식 수 · 발행가는 별도 결정)']], 'four'),
      h('div', { class: 'table-wrap flat' }, tb),
      h('p', { class: 'meta', text: '거래내역에서 「대표 가수금」으로 분류된 입금 · 출금만 모읍니다. 25년 마감까지는 결산 재무제표(단기차입금)가 정답이라 마감 월에 차이를 한 줄로 맞추고, 이후는 통장 실데이터로 누적합니다. 출자전환을 실행하면 그 금액을 반환(법인 → 대표)과 같은 방식으로 빼야 잔액이 맞습니다.' }));
  }

  function detail(sel, keys) {
    var isIn = sel.c.indexOf('in:') === 0, isTax = sel.c.indexOf('tax:') === 0, cat = isIn ? sel.c.slice(3) : isTax ? sel.c.slice(4) : sel.c;
    var inK = {}; keys.forEach(function (k) { inK[k] = 1; });
    var list = F.tx.filter(function (t) {
      var k = F.ym(t.date); if (!inK[k] || (sel.k && k !== sel.k)) return false;
      if (isIn) return t.inAmt > 0 && (t.cat || '기타 입금') === cat;
      if (isTax) return t.outAmt > 0 && t.cat === '세금 · 공과금' && taxType(t) === cat;
      return t.outAmt > 0 && (t.cat === cat || (cat === '미분류' && !t.cat));
    }).sort(function (a, b) { return F.txKey(a) < F.txKey(b) ? 1 : -1; });
    var rows = list.map(function (t) {
      var a = isIn ? t.inAmt : t.outAmt;
      if (!isIn && t.cat === '카드대금') { var sp = cardSplit(t); a -= sp.reduce(function (x, y) { return x + y.amount; }, 0); return { t: t, a: a, memo: t.note || '', sub: sp.length ? '명세에서 ' + sp.length + '건을 사용처로 옮기고 남은 금액 (해외 결제 · 수수료 · 용도 불명)' : '' }; }
      return { t: t, a: a, memo: t.note || '' };
    }).filter(function (r) { return r.a; });
    if (!isIn && !isTax) F.card.forEach(function (x) {
      if (x.cat !== cat || !x.payId) return;
      var pt = F.tx.filter(function (t) { return t.id === x.payId; })[0]; if (!pt) return;
      var k = F.ym(pt.date); if (!inK[k] || (sel.k && k !== sel.k)) return;
      rows.push({ t: { date: x.date, desc: x.merchant, acct: '', bank: '', seq: 0, time: '' }, a: x.amount, memo: (x.note || '') + ' · 법인카드 (' + fmt.dot(pt.date).slice(2) + ' 카드대금에서 분리)', card: true });
    });
    rows.sort(function (a, b) { return (a.t.date || '') < (b.t.date || '') ? 1 : -1; });
    var sum = rows.reduce(function (a, r) { return a + r.a; }, 0);
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['날짜', '거래처 · 내용', '메모', '계좌', '금액'].map(function (x, i) { return h('th', { class: i === 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, rows.map(function (r) {
        var t = r.t;
        return h('tr', null, h('td', { class: 'meta', text: fmt.dot(t.date).slice(2) }), h('td', { text: t.desc || t.memo || '' }), h('td', { class: 'meta', text: [r.memo, r.sub].filter(Boolean).join(' · ') }),
          h('td', { class: 'meta', text: r.card ? '법인카드' : F.acctName(t) }), h('td', { class: 'num', text: F.won(r.a) }));
      })));
    return ui.panel('거래 상세 · ' + (sel.k ? F.ymLabel(sel.k) + ' ' : '기간 전체 ') + cat, h('button', { type: 'button', class: 'btn btn-line btn-sm', text: '닫기', onclick: function () { V.sel = null; HR.refresh(); } }),
      h('p', { class: 'meta', text: rows.length + '건 · ' + F.won(sum) + '원' + (cat === '카드대금' ? ' · ' + CARD_NOTE : '') }),
      h('div', { class: 'table-wrap flat' }, tb));
  }

  HR.register('spend', { render: render });
})();
