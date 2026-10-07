/* fillts Finance — 입금분석 (261007 HR 「재무관리」에서 이전, 관리자 + Finance 권한): 입금 완료된 입금요청을 기간 · 항목별로 분석한다.
   항목: 계정 과목 · 지급 유형 · 거래처 · 요청자 · 받는 분(개인/사업자). 월별 추이 · 상세 내역 CSV. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db;
  var TYPE_NAME = { vendor: '거래처 대금', expense: '경비 정산', advance: '선급금 · 계약금', tax: '세금 · 공과금 · 보험료', etc: '기타' };
  var GROUPS = [['account', '계정 과목'], ['type', '지급 유형'], ['payee', '거래처'], ['member', '요청자'], ['who', '개인 / 사업자']];
  var V = { range: 'year', from: '', to: '', group: 'account' };

  function won(n) { return fmt.won(n); }
  function rows() { return HR.load('hr_payreq@all', function () { return db.collection('hr_payreq').get().then(HR.rows); }) || []; }
  function rangeOf() {
    var t = fmt.today(), ym = t.slice(0, 7), y = t.slice(0, 4);
    if (V.range === 'month') return [ym, ym];
    if (V.range === 'prev') { var p = fmt.ymShift(ym, -1); return [p, p]; }
    if (V.range === 'q') return [fmt.ymShift(ym, -2), ym];
    if (V.range === 'year') return [y + '-01', y + '-12'];
    if (V.range === 'custom') return [V.from || '0000-00', V.to || '9999-12'];
    return ['0000-00', '9999-12'];
  }
  function keyOf(r, g) {
    if (g === 'account') return r.account || '미지정';
    if (g === 'type') return TYPE_NAME[r.type] || '기타';
    if (g === 'payee') return r.payee || '미지정';
    if (g === 'member') return HR.name(r.memberId) || '—';
    return r.payeeType === 'person' ? '개인 (원천징수)' : r.payeeType === 'biz' ? '사업자' : '구분 없음 (경비 · 세금 등)';
  }
  function csv(list) {
    var head = ['입금일', '요청자', '지급 유형', '계정 과목', '거래처', '받는 분', '요청 총액', '부가세', '원천징수', '입금액', '제목', '메모'];
    var lines = [head].concat(list.map(function (r) {
      return [r.paidDate, HR.name(r.memberId), TYPE_NAME[r.type] || '', r.account, r.payee, r.payeeType === 'person' ? '개인' : r.payeeType === 'biz' ? '사업자' : '',
        r.total || 0, r.vat === 'excl' ? (r.total || 0) - (r.amount || 0) : '', r.wht || 0, r.paidAmount || 0, r.title, r.paidNote || ''];
    }));
    var text = '﻿' + lines.map(function (l) { return l.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: 'fillts_입금내역_' + rangeOf().join('_') + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function render(view) {
    var rg = rangeOf(), all = rows();
    var paid = all.filter(function (r) { return r.status === 'paid' && r.paidDate && r.paidDate.slice(0, 7) >= rg[0] && r.paidDate.slice(0, 7) <= rg[1]; })
      .sort(function (a, b) { return a.paidDate < b.paidDate ? 1 : -1; });
    var sum = function (arr, k) { return arr.reduce(function (a, r) { return a + (r[k] || 0); }, 0); };
    var total = sum(paid, 'paidAmount'), whtSum = sum(paid, 'wht');
    var vatSum = paid.reduce(function (a, r) { return a + (r.vat === 'excl' ? (r.total || 0) - (r.amount || 0) : 0); }, 0);
    var waiting = all.filter(function (r) { return r.status === 'approved'; });

    // 기간 선택
    var seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '기간' });
    [['month', '이번 달'], ['prev', '지난 달'], ['q', '최근 3개월'], ['year', '올해'], ['all', '전체'], ['custom', '직접 선택']].forEach(function (x) {
      seg.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(V.range === x[0]), class: V.range === x[0] ? 'on' : '', text: x[1], onclick: function () { V.range = x[0]; HR.refresh(); } }));
    });
    var custom = V.range === 'custom' ? h('div', { class: 'row' },
      ui.field('시작 월', h('input', { type: 'month', value: V.from, onchange: function () { V.from = this.value; HR.refresh(); } }), 'inline'),
      ui.field('끝 월', h('input', { type: 'month', value: V.to, onchange: function () { V.to = this.value; HR.refresh(); } }), 'inline')) : null;

    // 핵심 숫자
    var kpi = h('dl', { class: 'summary' }, [['입금 완료', won(total)], ['건수', paid.length + '건'], ['건당 평균', paid.length ? won(Math.round(total / paid.length)) : '-'],
      ['부가세 (별도 표기분)', won(vatSum)], ['원천징수 (개인)', won(whtSum)], ['승인 · 입금 대기', won(sum(waiting, 'net') || sum(waiting, 'total')) + ' · ' + waiting.length + '건']]
      .map(function (p) { return h('div', null, h('dt', { text: p[0] }), h('dd', { text: p[1] })); }));

    // 월별 추이
    var byMonth = {};
    paid.forEach(function (r) { var m = r.paidDate.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + (r.paidAmount || 0); });
    var mkeys = Object.keys(byMonth).sort(), mmax = Math.max.apply(null, mkeys.map(function (k) { return byMonth[k]; }).concat([1]));
    var trend = mkeys.length ? h('div', { class: 'fin-trend' }, mkeys.map(function (k) {
      var bar = h('span', { class: 'fin-col-fill' }); bar.style.height = Math.max(3, Math.round(byMonth[k] / mmax * 100)) + '%';
      return h('div', { class: 'fin-col', title: k + ' · ' + won(byMonth[k]) }, h('span', { class: 'fin-col-val', text: Math.round(byMonth[k] / 10000).toLocaleString('ko-KR') + '만' }), h('span', { class: 'fin-col-bar' }, bar), h('span', { class: 'fin-col-lab', text: (+k.slice(5)) + '월' }));
    })) : h('p', { class: 'empty', text: '이 기간에 입금 완료된 건이 없습니다.' });

    // 항목별 분석
    var gseg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '분석 기준' });
    GROUPS.forEach(function (g) { gseg.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(V.group === g[0]), class: V.group === g[0] ? 'on' : '', text: g[1], onclick: function () { V.group = g[0]; HR.refresh(); } })); });
    var grp = {};
    paid.forEach(function (r) { var k = keyOf(r, V.group), x = grp[k] || (grp[k] = { n: 0, amt: 0 }); x.n++; x.amt += r.paidAmount || 0; });
    var gkeys = Object.keys(grp).sort(function (a, b) { return grp[b].amt - grp[a].amt; });
    var gt = h('table', { class: 'table fin-table' }, h('thead', null, h('tr', null, ['항목', '건수', '금액', '비중', '건당 평균'].map(function (x, i) { return h('th', { class: i ? 'num' : '', text: x }); }))),
      h('tbody', null, gkeys.length ? gkeys.map(function (k) {
        var pct = total ? grp[k].amt / total * 100 : 0, bar = h('span', { class: 'pb-fill' }); bar.style.width = Math.max(2, Math.round(pct)) + '%';
        return h('tr', null, h('td', { text: k }), h('td', { class: 'num', text: grp[k].n + '건' }), h('td', { class: 'num', text: won(grp[k].amt) }),
          h('td', { class: 'num' }, h('span', { class: 'fin-pct' }, h('span', { class: 'pb-bar' }, bar), h('span', { text: pct.toFixed(1) + '%' }))), h('td', { class: 'num', text: won(Math.round(grp[k].amt / grp[k].n)) }));
      }) : h('tr', null, h('td', { colspan: '5', class: 'empty', text: '분석할 입금 내역이 없습니다.' }))));

    // 상세 내역
    var dt = h('table', { class: 'table pay-table' }, h('thead', null, h('tr', null, ['입금일', '제목 · 거래처', '계정 과목', '요청자', '입금액'].map(function (x, i) { return h('th', { class: i === 4 ? 'num' : '', text: x }); }))),
      h('tbody', null, paid.length ? paid.map(function (r) {
        return h('tr', { class: 'clickable', onclick: function () { window.open('/hr/#payreq/r/' + r.id, '_blank', 'noopener'); } }, h('td', { text: fmt.dot(r.paidDate) }),
          h('td', null, h('div', { text: r.title }), h('div', { class: 'meta', text: r.payee + (r.payeeType === 'person' ? ' · 개인' : '') })), h('td', { text: r.account }),
          h('td', { text: HR.name(r.memberId) }), h('td', { class: 'num', text: won(r.paidAmount) }));
      }) : h('tr', null, h('td', { colspan: '5', class: 'empty', text: '내역이 없습니다.' }))));

    ui.put(view, ui.head('Payments', '입금분석', ui.btn('CSV 내보내기', function () { csv(paid); }, 'btn-line btn-sm')),
      h('div', { class: 'toolbar' }, seg, h('span', { class: 'meta', text: rg[0] === '0000-00' ? '전체 기간' : rg[0] + ' ~ ' + rg[1] })), custom, kpi,
      ui.panel('Trend · 월별 입금', null, trend),
      ui.panel('Breakdown · 항목별 분석', gseg, h('div', { class: 'table-wrap flat' }, gt)),
      ui.panel('Detail · 입금 완료 내역', h('span', { class: 'meta', text: paid.length + '건' }), h('div', { class: 'table-wrap flat' }, dt)),
      h('p', { class: 'note', text: '입금요청에서 「입금 완료」로 기록된 건만 집계합니다 (입금일 기준). 금액은 실제 입금액이고, 개인 지급분의 원천징수는 따로 합산합니다. 줄을 누르면 입금요청 상세로 갑니다.' }));
  }

  HR.register('finance', { render: function (view) { if (!S.isAdmin && !HR.canApp('fin')) { HR.go(HR.APP.home || 'info'); return; } render(view); } });
})();
