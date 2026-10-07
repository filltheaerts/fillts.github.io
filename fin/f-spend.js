/* fillts Finance — 월별 사용처: 통장 거래내역(실제)만으로 「어디에 · 언제 · 얼마」를 한 표로.
   행 = 사용처 묶음(인건비 · 사무실 · 세무 · 제품 · 마케팅 · 카드 · 기타) › 분류, 열 = 월. 칸을 누르면 그 달 그 분류의 거래가 아래에 뜬다.
   보증금은 자산이라 비용 합계에서 뺀다. 대표 가수금 · 정책자금 등 들어온 돈은 아래 「돈이 들어온 곳」에 따로. */
(function () {
  'use strict';
  var HR = window.HR, F = HR.F, ui = HR.ui, h = ui.h, fmt = HR.fmt, BP = window.BankParse;
  var V = { per: '', sel: null, open: {} };   // open: 세부 줄 열림 (card · tax)   // per: 'YYYY' | 'r12' | 'all'
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

  // 대표 가수금 잔액 — 결산 마감(ownerBook)까지는 장부 금액, 이후 통장 입금 · 반환을 더한다
  function ownerBal() {
    var ob = F.cfg.ownerBook || null, base = ob ? +ob.amount || 0 : 0, from = ob ? ob.asOf : '';
    return F.tx.filter(function (t) { return t.cat === '대표 가수금' && (!from || t.date > from); }).reduce(function (a, t) { return a + (t.inAmt || 0) - (t.outAmt || 0); }, base);
  }

  // 정책자금 전용통장 — 설정 › 계좌에서 이름에 중진공 · 정책이 들어간 계좌
  function policyKeys() {
    var ks = {}; (F.cfg.cashAccts || []).forEach(function (a) { if (a.key && /중진공|정책/.test(a.name || '')) ks[a.key] = 1; });
    return ks;
  }
  function monthEndCash(keys) {
    var pk = policyKeys(), last = {}, out = {};
    var sorted = F.tx.filter(function (t) { return t.bal != null; }).sort(function (a, b) { return F.txKey(a) < F.txKey(b) ? -1 : 1; });
    var i = 0;
    keys.forEach(function (k) {
      while (i < sorted.length && F.ym(sorted[i].date) <= k) { last[F.acctKey(sorted[i])] = sorted[i].bal; i++; }
      var all = 0, free = 0; Object.keys(last).forEach(function (a) { all += last[a]; if (!pk[a]) free += last[a]; });
      out[k] = { all: all, free: free };
    });
    return out;
  }

  // 법인카드 — 카드사 이름 · 끝번호 (fin_card.issuer · cardNo, 없으면 통장 메모)
  function cardName() {
    var x = F.card.filter(function (c) { return c.issuer; })[0];
    return x ? x.issuer + (x.cardNo ? ' (…' + x.cardNo + ')' : '') : '법인카드';
  }
  function cardLabel(x) {
    var m = x.merchant || '';
    if (/NICE/.test(m)) return 'NICE 결제대행 — 매월 9,900 자동결제';
    if (/KCP/.test(m)) return 'KCP 결제대행';
    if (/이니시스/.test(m)) return '이니시스 결제대행';
    return m;
  }
  // 카드대금 아래 세부: 명세 중 사용처로 못 옮긴 것(가맹점별) + 명세가 없는 차액, 그리고 참고로 카드 전체 결제액
  function cardRows(body, keys, inK, active, sumRow, cell) {
    var L = {}, gap = {}, all = {};
    F.tx.forEach(function (t) {
      var k = F.ym(t.date); if (!inK[k] || t.cat !== '카드대금' || !(t.outAmt > 0)) return;
      all[k] = (all[k] || 0) + t.outAmt;
      var linked = F.card.filter(function (x) { return x.payId === t.id; }), rest = t.outAmt;
      linked.forEach(function (x) { rest -= x.amount; if (x.cat && x.cat !== '카드대금') return; var lb = cardLabel(x); (L[lb] = L[lb] || {})[k] = (L[lb][k] || 0) + x.amount; });
      if (rest) { var g = linked.length ? 'fee' : 'none'; (gap[g] = gap[g] || {})[k] = ((gap[g] || {})[k] || 0) + rest; }
    });
    Object.keys(L).sort(function (a, b) { return sumRow(L[b]) - sumRow(L[a]); }).forEach(function (lb) {
      var ts = sumRow(L[lb]);
      body.appendChild(h('tr', { class: 'sp-sub' }, h('td', { text: lb }), keys.map(function (k) { return cell('cm:' + lb, k, (L[lb] || {})[k] || 0); }), cell('cm:' + lb, '', ts), h('td', { class: 'num meta', text: F.man(ts / active) }), h('td')));
    });
    [['none', '카드 명세 미수령 — 명세서를 올리면 사용처로 나뉨'], ['fee', '해외 결제 수수료 · 소액 차액']].forEach(function (g) {
      var gs = sumRow(gap[g[0]]); if (!gs) return;
      body.appendChild(h('tr', { class: 'sp-sub' }, h('td', { text: g[1] }), keys.map(function (k) { return h('td', { class: 'num', text: man((gap[g[0]] || {})[k]) }); }),
        h('td', { class: 'num', text: F.man(gs) }), h('td', { class: 'num meta', text: F.man(gs / active) }), h('td')));
    });
    var as = sumRow(all);
    if (as) body.appendChild(h('tr', { class: 'sp-sub sp-ref' }, h('td', { text: '참고 · 카드 전체 결제액 (사용처로 옮긴 것 포함 · 합계 제외)' }),
      keys.map(function (k) { return h('td', { class: 'num', text: man(all[k]) }); }), h('td', { class: 'num', text: F.man(as) }), h('td'), h('td')));
  }

  // 거래처 이름 정리 — 회사 표기 · 은행 접두어 · 앞 숫자(２６０６ 등) 제거
  function clean(d) {
    return (d || '').replace(/^[0-9０-９]+/, '').replace(/주식회사|\(주\)|㈜|（주）|기업주식회사/g, '').replace(/^(우리|신한|농협|기업|하나)\s*/, '').replace(/당행급여\d*건|당타행\d*건|당행\d*건/, '').trim() || '(내용 없음)';
  }
  // 분류 아래 세부: 통장 거래는 거래처, 카드 명세는 세부 항목(sub) — 어디에 썼는지
  function subRows(body, c, keys, inK, active, sumRow) {
    var L = {};
    var put = function (lb, k, v) { (L[lb] = L[lb] || {})[k] = (L[lb][k] || 0) + v; };
    F.tx.forEach(function (t) {
      var k = F.ym(t.date); if (!inK[k] || t.cat !== c || !(t.outAmt > 0)) return;
      put(c === '급여' ? '급여 이체' : c === '4대보험' ? (t.desc || '').replace(/^[0-9０-９]+/, '') : clean(t.desc), k, t.outAmt);
    });
    if (c === '이자 · 수수료') F.tx.forEach(function (t) {
      var k = F.ym(t.date); if (!inK[k] || t.cat !== '카드대금' || !(t.outAmt > 0)) return;
      var ln = F.card.filter(function (x) { return x.payId === t.id; }); if (!ln.length) return;
      var r = t.outAmt - ln.reduce(function (a, x) { return a + x.amount; }, 0) - cardSplit(t).reduce(function () { return 0; }, 0);
      // 카드대금 − 명세 차액: 1만원 단위 = 연회비, 400원 = 문자 발송(SMS) 이용료 (대표 확인 261007), 나머지는 기타 차액
      if (r >= 10000) { put('카드 연회비 (국민카드)', k, 10000); r -= 10000; }
      if (r === 400) { put('카드 문자 발송 (SMS) 이용료', k, 400); r = 0; }
      if (r) put('카드 기타 차액', k, r);
    });
    F.card.forEach(function (x) {
      if (x.cat !== c || !x.payDate) return; var k = F.ym(x.payDate); if (!inK[k]) return;
      put((x.sub || x.note || x.merchant) + ' (카드)', k, x.amount);
    });
    var labs = Object.keys(L).sort(function (a, b) { return sumRow(L[b]) - sumRow(L[a]); });
    labs.forEach(function (lb) {
      var ts = sumRow(L[lb]);
      body.appendChild(h('tr', { class: 'sp-sub' }, h('td', { text: lb, title: lb }), keys.map(function (k) { return h('td', { class: 'num', text: man((L[lb] || {})[k]) }); }),
        h('td', { class: 'num', text: F.man(ts) }), h('td', { class: 'num meta', text: F.man(ts / active) }), h('td')));
    });
  }

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
    if (!F.tx.length) return ui.put(view, ui.head('실제 · 통장', '사용분석'), ui.empty('거래내역을 가져오면 월별 사용처가 여기에 표시됩니다.'));

    var inK = {}; keys.forEach(function (k) { inK[k] = 1; });
    var M = {}, IN = {}, known = {};
    GROUPS.forEach(function (g) { g[1].forEach(function (c) { known[c] = 1; }); }); ASSET.forEach(function (c) { known[c] = 1; });
    F.tx.forEach(function (t) {
      var k = F.ym(t.date); if (!inK[k] || F.isTransfer(t)) return;
      if (t.outAmt > 0) {
        var c = known[t.cat] ? t.cat : '미분류', amt = t.outAmt;
        if (c === '카드대금') {
          cardSplit(t).forEach(function (x) { (M[x.cat] = M[x.cat] || {})[k] = (M[x.cat][k] || 0) + x.amount; amt -= x.amount; });
          // 명세가 연결된 카드대금의 남은 차액(연회비 · 수수료 등)은 카드가 아니라 「이자 · 수수료」로
          if (amt && F.card.some(function (x) { return x.payId === t.id; })) { M['이자 · 수수료'] = M['이자 · 수수료'] || {}; M['이자 · 수수료'][k] = (M['이자 · 수수료'][k] || 0) + amt; amt = 0; }
        }
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
        var tg = c === '카드대금' ? 'card' : c === '세금 · 공과금' ? 'tax' : 'c:' + c;
        var lab = h('td', { title: c === '카드대금' ? CARD_NOTE : '' }, c === '카드대금' ? cardName() : c,
          tg ? h('button', { type: 'button', class: 'sp-tog', 'aria-expanded': String(!!V.open[tg]), text: V.open[tg] ? '▾ 접기' : '▸ 세부', onclick: function () { V.open[tg] = !V.open[tg]; HR.refresh(); } }) : null);
        body.appendChild(h('tr', { class: 'sp-cat' }, lab, keys.map(function (k) { return cell(c, k, (M[c] || {})[k] || 0); }),
          cell(c, '', s, 'strong'), h('td', { class: 'num meta', text: F.man(s / active) }), h('td', { class: 'num meta', text: share(s) })));
        if (c === '카드대금' && V.open.card) cardRows(body, keys, inK, active, sumRow, cell);
        if (tg.indexOf('c:') === 0 && V.open[tg]) subRows(body, c, keys, inK, active, sumRow);
        if (c === '세금 · 공과금' && V.open.tax) {
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
    // 월말 잔여현금 — 계좌별 그 달 마지막 거래 잔액(없으면 이전 달 잔액)의 합. 정책자금 전용통장은 따로 뺀 값도
    var cash = monthEndCash(keys);
    body.appendChild(h('tr', { class: 'sp-cash sp-cash-first' }, h('td', { text: '월말 잔여현금 (정책자금 포함)' }), keys.map(function (k) { return h('td', { class: 'num', text: F.man(cash[k].all) }); }),
      h('td', { class: 'num strong', text: F.man(cash[keys[keys.length - 1]].all), title: '마지막 달 기준' }), h('td', { class: 'num meta', text: '마지막 달' }), h('td')));
    body.appendChild(h('tr', { class: 'sp-cash' }, h('td', { text: '월말 잔여현금 (정책자금 제외)' }), keys.map(function (k) { return h('td', { class: 'num' + (cash[k].free < 0 ? ' red' : ''), text: F.man(cash[k].free) }); }),
      h('td', { class: 'num strong', text: F.man(cash[keys[keys.length - 1]].free) }), h('td', { class: 'num meta', text: '마지막 달' }), h('td')));
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

    ui.put(view, ui.head('실제 · 통장', '사용분석'), tools,
      h('div', { class: 'sp-kpis' },
        h('section', { class: 'sp-kgrp' }, h('h3', { class: 'sp-ktitle', text: '자본조달 · 누적' }),
          F.kpi([['대출 (정책자금)', F.man(raised), '', '중진공 · 갚아야 할 돈'],
            ['대표 가수금', F.man(ownerBal()), '', '장부 기준 · 이 기간 +' + F.man(ownerIn)]], 'two')),
        h('section', { class: 'sp-kgrp' }, h('h3', { class: 'sp-ktitle', text: '지출 · ' + (keys.length ? F.ymLabel(keys[0]) + ' ~ ' + F.ymLabel(keys[keys.length - 1]) : '') }),
          F.kpi([['기간 지출', F.man(total), '', '보증금 제외'],
            ['월평균 지출', F.man(total / active), '', active + '개월 기준'],
            ['가장 큰 사용처', top[0] ? top[0][0] : '—', '', top[0] ? F.man(top[0][1]) + ' · ' + share(top[0][1]) : '']], 'three'))),
      ui.panel('어디에 썼나 (월별)', null, h('div', { class: 'table-wrap flat' }, markTot(h('table', { class: 'table fin-table fin-flow fin-spend' }, h('thead', null, head), body), keys.length)),
        h('p', { class: 'meta', text: '통장 출금 기준(현금주의) · 금액 칸을 누르면 그 달 그 분류의 거래가 아래에 표시됩니다. ' + CARD_NOTE + ' 분류는 거래내역에서 바꾸면 바로 반영됩니다.' })),
      V.sel ? detail(V.sel, keys) : null,
      cardPanel(keys),
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

  /* ---------- 법인카드 분야별 — 카드를 언제(승인월) 어디에 썼나. 지출 합계와는 별개(통장 카드대금으로 이미 포함) ---------- */
  var CFIELD = { '소프트웨어 · 구독': '소프트웨어 · 구독', '비품 · 장비': '비품 · 기기', '법무 · 특허': '상표 · 특허', '기타 지출': '도서 · 교육', '세금 · 공과금': '세금 · 공과금', '마케팅 · 광고': '마케팅', '포장 · 부자재': '포장 · 부자재', '원료 · 생산(OEM)': '원료 · 샘플', '복리후생 · 식대': '식대 · 복리' };
  function cardSubName(x) { return x.sub || x.note || x.merchant || '(미지정)'; }
  // 소프트웨어는 한 덩어리로 묶지 않고 쓰임새별로 — [분야, 이름, 무엇을 하는 툴인지]
  var SW = [
    [/미드저니/, '디자인 · AI 이미지 툴', '미드저니 (Midjourney)', '텍스트로 이미지를 만드는 AI — 제품 콘셉트 · 무드보드 · SNS 콘텐츠 시안 제작 · 월 USD 60'],
    [/구글/, '업무 기본 툴', '구글 워크스페이스', '회사 메일(@fillts) · 드라이브 · 캘린더 · 문서 — 계정 수에 따라 월 요금 변동'],
    [/슬랙/, '업무 기본 툴', '슬랙 (Slack)', '팀 메신저 · 업무 채널 — 9월 신규 결제'],
    [/모두싸인/, '계약 · 법무 툴', '모두싸인', '전자계약 · 전자서명 — 근로계약 · 업체 계약 체결 · 매월 9,900원'],
    [/가비아/, '웹 · 도메인', '가비아 도메인 2건', '회사 · 브랜드 웹 주소(도메인) 구매 · 연 단위 갱신'],
    [/카페24/, '자사몰 구축', '카페24 디자인 스킨 (한글 · 영문)', '자사몰(카페24) 화면 디자인 템플릿 — 1회 구매']
  ];
  function swInfo(x) { var t = cardSubName(x) + ' ' + (x.note || '') + ' ' + (x.merchant || ''); for (var i = 0; i < SW.length; i++) if (SW[i][0].test(t)) return SW[i]; return null; }
  function cardPanel(keys) {
    if (!F.card.length) return null;
    var inK = {}; keys.forEach(function (k) { inK[k] = 1; });
    var G = {}, tot = {}, all = 0, DESC = {};
    F.card.forEach(function (x) {
      var k = F.ym(x.date); if (!inK[k]) return;
      var sw = x.cat === '소프트웨어 · 구독' ? swInfo(x) : null;
      var g = sw ? sw[1] : x.cat ? (CFIELD[x.cat] || x.cat) : '미지정', sb = sw ? sw[2] : cardSubName(x);
      if (sw) DESC[sb] = sw[3];
      var gg = G[g] || (G[g] = { m: {}, s: {} }); gg.m[k] = (gg.m[k] || 0) + x.amount; (gg.s[sb] = gg.s[sb] || {})[k] = (gg.s[sb][k] || 0) + x.amount;
      tot[k] = (tot[k] || 0) + x.amount; all += x.amount;
    });
    if (!all) return null;
    var sum = function (o) { return keys.reduce(function (a, k) { return a + ((o || {})[k] || 0); }, 0); };
    var pct = function (v) { return Math.round(v / all * 1000) / 10 + '%'; };
    var body = h('tbody');
    Object.keys(G).sort(function (a, b) { return sum(G[b].m) - sum(G[a].m); }).forEach(function (g) {
      var gs = sum(G[g].m);
      body.appendChild(h('tr', { class: 'sp-grp' }, h('td', { text: g }), keys.map(function (k) { return h('td', { class: 'num', text: man(G[g].m[k]) }); }), h('td', { class: 'num', text: F.man(gs) }), h('td', { class: 'num', text: pct(gs) })));
      Object.keys(G[g].s).sort(function (a, b) { return sum(G[g].s[b]) - sum(G[g].s[a]); }).forEach(function (sb) {
        var ss = sum(G[g].s[sb]), on = function (k) { return V.sel && V.sel.c === 'cs:' + sb && V.sel.k === k; };
        var c = function (k, v) {
          if (!v) return h('td', { class: 'num' });
          return h('td', { class: 'num' }, h('button', { type: 'button', class: 'sp-cell' + (on(k) ? ' on' : ''), text: F.man(v), onclick: function () { V.sel = on(k) ? null : { c: 'cs:' + sb, k: k }; HR.refresh(); } }));
        };
        body.appendChild(h('tr', { class: 'sp-cat' }, h('td', null, h('div', { text: sb }), DESC[sb] ? h('div', { class: 'meta sp-desc', text: DESC[sb] }) : null), keys.map(function (k) { return c(k, G[g].s[sb][k]); }), c('', ss), h('td', { class: 'num meta', text: pct(ss) })));
      });
    });
    body.appendChild(h('tr', { class: 'fin-sum' }, h('td', { text: '카드 사용 합계' }), keys.map(function (k) { return h('td', { class: 'num', text: man(tot[k]) }); }), h('td', { class: 'num', text: F.man(all) }), h('td', { class: 'num', text: '100%' })));
    var head = h('tr', null, h('th', { text: '분야 · 세부' }), keys.map(function (k) { return h('th', { class: 'num', text: F.ymLabel(k) }); }), h('th', { class: 'num', text: '합계' }), h('th', { class: 'num', text: '비중' }));
    return ui.panel('법인카드 분야별 — ' + cardName(), h('a', { href: '#tx/card', class: 'meta', text: '카드_KB에서 수정 →' }),
      h('div', { class: 'table-wrap flat' }, markTot(h('table', { class: 'table fin-table fin-flow fin-spend' }, h('thead', null, head), body), keys.length)),
      h('p', { class: 'meta', text: '카드 승인월 기준 · 국내 + 해외 결제. 지출은 통장 「카드대금」으로 이미 위 표에 들어 있어 이 표는 따로 더하지 않습니다. 금액을 누르면 건별 내역이 위에 뜹니다.' }));
  }
  function cardSubDetail(sel, keys) {
    var sb = sel.c.slice(3), inK = {}; keys.forEach(function (k) { inK[k] = 1; });
    var list = F.card.filter(function (x) { var k = F.ym(x.date), sw = x.cat === '소프트웨어 · 구독' ? swInfo(x) : null; return (sw ? sw[2] : cardSubName(x)) === sb && inK[k] && (!sel.k || k === sel.k); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var sum = list.reduce(function (a, x) { return a + x.amount; }, 0);
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['승인일', '가맹점', '사용내용', '통장 결제일', '금액'].map(function (x, i) { return h('th', { class: i === 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, list.map(function (x) {
        return h('tr', null, h('td', { class: 'meta', text: fmt.dot(x.date).slice(2) }), h('td', { text: x.merchant + (x.foreign ? ' · 해외' : '') }), h('td', { class: 'meta', text: x.note || '' }),
          h('td', { class: 'meta', text: x.payDate ? fmt.dot(x.payDate).slice(2) : '결제 전' }), h('td', { class: 'num', text: F.won(x.amount) }));
      })));
    return ui.panel('카드 상세 · ' + (sel.k ? F.ymLabel(sel.k) + ' ' : '기간 전체 ') + sb, h('button', { type: 'button', class: 'btn btn-line btn-sm', text: '닫기', onclick: function () { V.sel = null; HR.refresh(); } }),
      h('p', { class: 'meta', text: list.length + '건 · ' + F.won(sum) + '원' }), h('div', { class: 'table-wrap flat' }, tb));
  }

  function cardDetail(sel, keys) {
    var lb = sel.c.slice(3), inK = {}; keys.forEach(function (k) { inK[k] = 1; });
    var list = F.card.filter(function (x) {
      if ((x.cat && x.cat !== '카드대금') || cardLabel(x) !== lb || !x.payDate) return false;
      var k = F.ym(x.payDate); return inK[k] && (!sel.k || k === sel.k);
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var sum = list.reduce(function (a, x) { return a + x.amount; }, 0);
    var tb = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['승인일', '가맹점', '통장 결제일', '카드', '금액'].map(function (x, i) { return h('th', { class: i === 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, list.map(function (x) {
        return h('tr', null, h('td', { class: 'meta', text: fmt.dot(x.date).slice(2) }), h('td', { text: x.merchant }), h('td', { class: 'meta', text: fmt.dot(x.payDate).slice(2) }),
          h('td', { class: 'meta', text: (x.issuer || '법인카드') + (x.foreign ? ' · 해외' : '') }), h('td', { class: 'num', text: F.won(x.amount) }));
      })));
    return ui.panel('거래 상세 · ' + (sel.k ? F.ymLabel(sel.k) + ' ' : '기간 전체 ') + lb, h('button', { type: 'button', class: 'btn btn-line btn-sm', text: '닫기', onclick: function () { V.sel = null; HR.refresh(); } }),
      h('p', { class: 'meta', text: list.length + '건 · ' + F.won(sum) + '원 · 카드 명세서 기준, 통장에서 빠진 달로 묶음' }), h('div', { class: 'table-wrap flat' }, tb));
  }

  function detail(sel, keys) {
    if (sel.c.indexOf('cm:') === 0) return cardDetail(sel, keys);
    if (sel.c.indexOf('cs:') === 0) return cardSubDetail(sel, keys);
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
