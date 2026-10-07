/* fillts Influencer — 리스트: 디벨롭 이후 쌓인 모든 유튜버 데이터베이스 (엑셀처럼 한 줄씩)
   · 직접 추가(채널 주소 · @핸들) · 한 명 / 전체 최신화 · CSV 내보내기
   · 여기 있는 채널은 이후 탐색에서 자동 제외 (서버 infYt scan) */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt;
  var V = I.V.list = { q: '', st: '', ag: '', sort: 'at', add: '', busy: '', msg: '', err: false, prog: null, one: {} };

  function setMsg(t, err) { V.msg = t; V.err = !!err; HR.refresh(); }
  function addOne() {
    var v = V.add.trim();
    if (!v) return setMsg('유튜버 채널 주소 · @핸들 · 영상 주소 · 채널 이름을 넣으세요.', true);
    V.busy = 'add'; setMsg('채널을 읽는 중입니다… (5 ~ 15초)');
    I.call('infYt', { action: 'add', input: v }).then(function (r) {
      V.busy = ''; V.add = '';
      setMsg(r.existed ? '「' + r.title + '」은(는) 이미 리스트에 있어 지표만 최신화했습니다.' : '「' + r.title + '」을(를) 리스트(디벨롭)에 추가했습니다.');
    }).catch(function (e) { V.busy = ''; setMsg(e.message, true); });
  }
  function refreshOne(c) {
    V.one[c.id] = true; HR.refresh();
    return I.call('infYt', { action: 'refresh', id: c.id }).then(function () { V.one[c.id] = false; HR.refresh(); })
      .catch(function (e) { V.one[c.id] = false; ui.toast(c.ch.title + ' — ' + e.message); });
  }
  // 전체 최신화: 한 명씩 차례로 (채널당 ≈ 5 units — 100명이면 할당량의 5%)
  function refreshAll(list) {
    if (V.prog) return;
    V.prog = { i: 0, n: list.length, fail: 0 }; HR.refresh();
    var next = function () {
      if (!V.prog) return;
      if (V.prog.i >= list.length) { var f = V.prog.fail; V.prog = null; setMsg('전체 최신화를 마쳤습니다.' + (f ? ' (실패 ' + f + '명)' : '')); return; }
      var c = list[V.prog.i];
      I.call('infYt', { action: 'refresh', id: c.id }).catch(function () { V.prog.fail++; }).then(function () { if (V.prog) { V.prog.i++; HR.refresh(); next(); } });
    };
    next();
  }
  function filtered() {
    var q = V.q.trim().toLowerCase();
    var list = I.creators.filter(function (c) {
      var ch = c.ch || {};
      if (V.st && (c.stage || 'review') !== V.st) return false;
      if (V.ag) { var p = I.agency(Object.assign({}, ch, { email: c.email || ch.email })).p; if ((V.ag === 'agency' && !p) || (V.ag === 'solo' && p)) return false; }
      if (q && ((ch.title || '') + ' ' + (ch.handle || '') + ' ' + (c.email || '') + ' ' + (c.tags || []).join(' ') + ' ' + (c.seedTitle || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = {
      at: function (c) { return I.ms(c.at); }, subs: function (c) { return c.ch.subs || 0; }, growth: function (c) { return c.ch.growth || 0; },
      cmt: function (c) { return c.ch.cmtMed || 0; }, score: function (c) { return c.score || 0; }, upd: function (c) { return c.ch.at || 0; }
    }[V.sort] || function (c) { return I.ms(c.at); };
    return list.sort(function (a, b) { return key(b) - key(a); });
  }
  function csv(list) {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['채널', '핸들', '채널 주소', '구독자', '중앙 조회', '조회 상승(배)', '영상당 댓글', '1천회당 댓글', '소속', '메일', '단계', '담당', '출처', '추가일', '최신화']];
    list.forEach(function (c) {
      var ch = c.ch || {}, ag = I.agency(Object.assign({}, ch, { email: c.email || ch.email }));
      rows.push([ch.title, ch.handle, I.chUrl(ch), ch.subs, ch.median, ch.growth, ch.cmtMed, ch.cpk, ag.p ? '소속 ' + ag.p + '%' : '개인', c.email || ch.email || '',
        I.stName(c.stage), c.owner ? HR.name(c.owner) : '', c.seedTitle || '', c.at && c.at.toDate ? fmt.dot(HR.L.kstDate(c.at.toDate())) : '', ch.at ? fmt.dot(new Date(ch.at + 9 * 3600000).toISOString().slice(0, 10)) : '']);
    });
    var blob = new Blob(['﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'fillts_influencer_list_' + fmt.today() + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function dayOf(ms) { return ms ? new Date(ms + 9 * 3600000).toISOString().slice(2, 10).replace(/-/g, '.') : '—'; }

  function render(view) {
    var list = filtered();
    var addIn = ui.input({ value: V.add, maxlength: '300', placeholder: '유튜버 직접 추가 — 채널 주소 · @핸들 · 영상 주소 · 채널 이름', class: 'grow',
      oninput: function () { V.add = this.value; }, onkeydown: function (e) { if (e.key === 'Enter' && !V.busy) addOne(); } });
    var addBtn = ui.btn(V.busy === 'add' ? '읽는 중…' : '+ 추가', addOne, 'btn-sm');
    if (V.busy) addBtn.disabled = true;
    var allBtn = ui.btn(V.prog ? '최신화 중 ' + V.prog.i + ' / ' + V.prog.n : '보이는 ' + list.length + '명 전체 최신화', function () { refreshAll(list.slice()); }, 'btn-line btn-sm');
    if (V.prog || !list.length) allBtn.disabled = true;
    var stSel = ui.select([['', '모든 단계']].concat(I.STAGES.map(function (s) { return [s.id, s.name + ' (' + I.byStage(s.id).length + ')']; })), V.st, { onchange: function () { V.st = this.value; HR.refresh(); } });
    var agSel = ui.select([['', '소속 · 개인 전체'], ['agency', '소속 유튜버 (50% 이상)'], ['solo', '개인 유튜버']], V.ag, { onchange: function () { V.ag = this.value; HR.refresh(); } });
    var sortSel = ui.select([['at', '최근 추가순'], ['subs', '구독자순'], ['growth', '조회 상승순'], ['cmt', '댓글순'], ['score', '점수순'], ['upd', '최신화 순']], V.sort, { onchange: function () { V.sort = this.value; HR.refresh(); } });
    var q = ui.input({ value: V.q, placeholder: '채널 · 메일 · 태그 · 출처 검색 (Enter)', onchange: function () { V.q = this.value; HR.refresh(); } });

    var head = ['#', '채널', '구독', '조회 상승', '댓글/편', '소속', '메일', '단계', '출처', '최신화'];
    var body = list.map(function (c, i) {
      var ch = c.ch || {}, ag = I.agency(Object.assign({}, ch, { email: c.email || ch.email }));
      var re = h('button', { type: 'button', class: 'in-mv', title: '이 채널 지표 최신화', text: V.one[c.id] ? '…' : '↻', onclick: function (e) { e.stopPropagation(); if (!V.one[c.id]) refreshOne(c); } });
      return h('tr', { class: 'clickable', onclick: function () { HR.go('c/' + c.id); } },
        h('td', { class: 'num meta', text: String(i + 1) }),
        h('td', null, h('div', { class: 'in-r-nm' }, h('span', { class: 'in-r-name', title: ch.title + ' ' + (ch.handle || ''), text: ch.title }), I.ytBtn(ch))),
        h('td', { class: 'num', text: I.cnt(ch.subs) }),
        h('td', { class: 'num' + (ch.growth >= 1.2 ? ' red' : ''), text: ch.growth ? ch.growth + '배' : '—' }),
        h('td', { class: 'num', text: ch.cmtMed != null ? ch.cmtMed + '개' : '—' }),
        h('td', null, I.agencyTag(Object.assign({}, ch, { email: c.email || ch.email }))),
        h('td', { class: 'in-ell', title: c.email || ch.email || '', text: c.email || ch.email ? '있음' : '—' }),
        h('td', null, I.stTag(c.stage)),
        h('td', { class: 'in-ell meta', title: c.seedTitle || '', text: c.seedTitle || '—' }),
        h('td', { class: 'in-upd' }, h('span', { class: 'meta', text: dayOf(ch.at) }), re));
    });
    ui.put(view,
      ui.head('List', '리스트', h('div', { class: 'row' }, allBtn, ui.btn('CSV 내보내기', function () { csv(list); }, 'btn-line btn-sm'))),
      ui.panel(null, null,
        h('div', { class: 'row in-seed-form' }, addIn, addBtn),
        V.msg ? h('p', { class: 'form-msg' + (V.err ? '' : ' ok'), role: 'alert', text: V.msg }) : null,
        h('p', { class: 'note', text: '탐색에서 「디벨롭으로 추가」했거나 여기서 직접 넣은 모든 유튜버입니다. 이 리스트에 있는 채널은 다음 탐색부터 자동으로 빠져 중복되지 않습니다. 줄을 누르면 채널 데이터베이스(연락 · 메일 · 계약 · 시딩 · 기록)가 열리고, ↻ 로 구독 · 조회 · 댓글 지표를 최신으로 다시 읽습니다.' })),
      h('div', { class: 'toolbar in-toolbar' }, q, stSel, agSel, sortSel, h('span', { class: 'meta grow in-right', text: list.length + ' / ' + I.creators.length + '명' })),
      h('div', { class: 'in-xls-wrap' }, h('table', { class: 'table in-xls' },
        h('colgroup', null, [36, 0, 64, 70, 66, 92, 52, 84, 0, 92].map(function (w) { var c = h('col'); if (w) c.style.width = w + 'px'; return c; })),
        h('thead', null, h('tr', null, head.map(function (x, i) { return h('th', { class: i === 0 || (i >= 2 && i <= 4) ? 'num' : '', text: x }); }))),
        h('tbody', null, body.length ? body : h('tr', null, h('td', { colspan: String(head.length), class: 'empty', text: I.creators.length ? '조건에 맞는 유튜버가 없습니다.' : '아직 리스트가 비어 있습니다. 탐색 결과에서 체크해 「디벨롭으로 추가」하거나 위에서 직접 추가하세요.' }))))));
  }
  HR.register('list', { render: function (view) { render(view); } });
})();
