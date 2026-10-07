/* fillts Influencer — 리스트: 디벨롭 이후 쌓인 모든 유튜버 데이터베이스
   · 탐색 결과처럼 한 줄 카드 · 머리줄을 누르면 그 기준으로 정렬(▼ 내림 · ▲ 오름)
   · 직접 추가(채널 주소 · @핸들) · 한 명 / 전체 최신화 · 삭제 · CSV 내보내기
   · 여기 있는 채널은 이후 탐색에서 자동 제외 (서버 infYt scan)
   I.dbTable은 셀럽 화면도 같이 쓴다 */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db;
  var V = I.V.list = { q: '', st: '', ag: '', maxS: '', sort: 'at', dir: -1, add: '', busy: '', msg: '', err: false, prog: null, one: {} };

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
  // 전체 최신화: 한 명씩 차례로 (채널당 ≈ 5 units)
  // 전체 새로고침: 한 명씩 · 1.2초 간격 · 10명마다 6초 쉬기 · 실패는 2번 재시도 · 할당량 소진이면 멈춤 · 6시간 안에 받은 채널은 건너뜀
  function refreshAll(list) {
    if (V.prog) return;
    var todo = list.filter(function (c) { return !(c.ch && c.ch.at && Date.now() - c.ch.at < I.FRESH_MS); });
    if (!todo.length) return setMsg('모두 최근 6시간 안에 새로고침되어 있습니다.');
    V.prog = I.runQueue(todo, function (c) { return I.call('infYt', { action: 'refresh', id: c.id }); }, {
      onTick: function () { HR.refresh(); },
      onDone: function (q) { V.prog = null; setMsg(I.queueMsg(q, '새로고침'), q.stopped && q.reason !== '중지했습니다'); }
    });
    if (todo.length < list.length) setMsg('최근 6시간 안에 받은 ' + (list.length - todo.length) + '명은 건너뛰고 ' + todo.length + '명을 새로고침합니다.');
    HR.refresh();
  }

  /* ---------- 공용: 정렬되는 한 줄 카드 표 ---------- */
  var SORTS = {
    title: function (c) { return (c.ch.title || '').toLowerCase(); }, subs: function (c) { return c.ch.subs || 0; }, median: function (c) { return c.ch.median || 0; },
    cmt: function (c) { return c.ch.cmtAvg != null ? c.ch.cmtAvg : c.ch.cmtMed || 0; }, gap: function (c) { return c.ch.gapDays || (c.ch.perWeek ? 7 / c.ch.perWeek : 9999); },
    growth: function (c) { return c.ch.growth || 0; }, at: function (c) { return I.ms(c.at); }, upd: function (c) { return c.ch.at || 0; },
    stage: function (c) { return (I.ST[c.stage || 'review'] || {}).no || 0; }, prio: function (c) { return c.prio || 9; }
  };
  I.sortRows = function (list, st) {
    var k = SORTS[st.sort] || SORTS.at, d = st.dir || -1;
    return list.slice().sort(function (a, b) { var x = k(a), y = k(b); return (x > y ? 1 : x < y ? -1 : 0) * d; });
  };
  function stat(k, v, cls) { return h('div', { class: 'in-stat' + (cls ? ' ' + cls : '') }, h('span', { class: 'in-stat-k', text: k }), h('b', { text: v })); }
  // opt: { st: 정렬 상태, cols: [[키, 이름]], tags(c), side(c), acts(c), onRow(c) }
  I.dbTable = function (list, opt) {
    var st = opt.st;
    var hcell = function (key, label, cls) {
      var on = st.sort === key;
      return h('button', { type: 'button', class: 'in-sorth ' + (cls || '') + (on ? ' on' : ''), title: '눌러서 정렬 — 한 번 더 누르면 반대로',
        text: label + (on ? (st.dir < 0 ? ' ▼' : ' ▲') : ''), onclick: function () {
          if (st.sort === key) st.dir = -st.dir; else { st.sort = key; st.dir = key === 'title' || key === 'gap' || key === 'prio' ? 1 : -1; }
          HR.refresh();
        } });
    };
    var head = h('div', { class: 'in-row in-row-head in-dbrow' },
      h('div', { class: 'in-r-cb' }, hcell('at', '#')),
      h('div', { class: 'in-r-ch' }, hcell('title', '채널'), opt.sideHead ? hcell(opt.sideHead[0], opt.sideHead[1]) : null),
      h('div', { class: 'in-r-stats' }, hcell('subs', '구독'), hcell('median', '조회'), hcell('cmt', '댓글수'), hcell('gap', '주기'), hcell('growth', '조회 추세')),
      h('div', { class: 'in-r-side' }, opt.metaHead ? hcell(opt.metaHead[0], opt.metaHead[1]) : null, hcell('upd', '최신화')));
    var rows = I.sortRows(list, st).map(function (c, i) {
      var ch = c.ch || {};
      return h('div', { class: 'in-row in-dbrow clickable', tabindex: '0', onclick: function () { opt.onRow(c); }, onkeydown: function (e) { if (e.key === 'Enter') opt.onRow(c); } },
        h('div', { class: 'in-r-cb meta', text: String(i + 1) }),
        h('div', { class: 'in-r-ch' }, I.thumb(ch, 'sm'), h('div', { class: 'in-r-t' },
          h('div', { class: 'in-r-nm' }, h('span', { class: 'in-r-name', title: ch.title + ' ' + (ch.handle || ''), text: ch.title }), I.ytBtn(ch)),
          h('div', { class: 'in-r-tags' }, opt.tags(c)))),
        h('div', { class: 'in-r-stats' }, stat('구독', I.cnt(ch.subs)), stat('조회', ch.median != null ? I.cnt(ch.median) : '—'),
          stat('댓글수', ch.cmtAvg != null ? I.cnt(ch.cmtAvg) : ch.cmtMed != null ? I.cnt(ch.cmtMed) : '—'), stat('주기', I.gap(ch)),
          stat('조회 추세', ch.growth ? ch.growth + '배' : '—', ch.growth >= 1.2 ? 'red' : '')),
        h('div', { class: 'in-r-side' }, opt.side(c), h('div', { class: 'in-r-acts' }, opt.acts(c))));
    });
    return h('div', { class: 'in-rows' }, head, rows.length ? rows : h('p', { class: 'empty', text: opt.empty || '비어 있습니다.' }));
  };
  I.updBtn = function (busy, onclick) { return h('button', { type: 'button', class: 'in-mv', title: '지표 최신화', text: busy ? '…' : '↻', onclick: function (e) { e.stopPropagation(); if (!busy) onclick(); } }); };
  I.delBtn = function (onDel) {
    var b = h('button', { type: 'button', class: 'in-mv in-del', title: '삭제 — 한 번 더 누르면 삭제', text: '삭제' });
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (b.dataset.armed) { onDel(); return; }
      b.dataset.armed = '1'; b.textContent = '정말?';
      setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.textContent = '삭제'; } }, 3000);
    });
    return b;
  };
  function dayOf(ms) { return ms ? new Date(ms + 9 * 3600000).toISOString().slice(2, 10).replace(/-/g, '.') : '—'; }
  I.dayOf = dayOf;

  function filtered() {
    var q = V.q.trim().toLowerCase();
    return I.creators.filter(function (c) {
      var ch = c.ch || {};
      if (V.st && (c.stage || 'review') !== V.st) return false;
      if (V.maxS && !((ch.subs || 0) < +V.maxS)) return false;   // 구독자 상한 (미만)
      if (V.ag) { var p = I.agency(Object.assign({}, ch, { email: c.email || ch.email })).p; if ((V.ag === 'agency' && !p) || (V.ag === 'solo' && p)) return false; }
      if (q && ((ch.title || '') + ' ' + (ch.handle || '') + ' ' + (c.email || '') + ' ' + (c.tags || []).join(' ') + ' ' + (c.seedTitle || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function csv(list) {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['채널', '핸들', '채널 주소', '구독자', '중앙 조회', '평균 댓글', '업로드 주기', '조회 추세(배)', '소속', '메일', '단계', '담당', '출처', '추가일', '최신화']];
    I.sortRows(list, V).forEach(function (c) {
      var ch = c.ch || {}, ag = I.agency(Object.assign({}, ch, { email: c.email || ch.email }));
      rows.push([ch.title, ch.handle, I.chUrl(ch), ch.subs, ch.median, ch.cmtAvg != null ? ch.cmtAvg : ch.cmtMed, I.gap(ch), ch.growth, ag.p ? '소속 ' + ag.p + '%' : '개인', c.email || ch.email || '',
        I.stName(c.stage), c.owner ? HR.name(c.owner) : '', c.seedTitle || '', c.at && c.at.toDate ? dayOf(c.at.toDate().getTime()) : '', dayOf(ch.at)]);
    });
    var blob = new Blob(['﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'fillts_influencer_list_' + fmt.today() + '.csv' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function render(view) {
    var list = filtered();
    var addIn = ui.input({ value: V.add, maxlength: '300', placeholder: '유튜버 직접 추가 — 채널 주소 · @핸들 · 영상 주소 · 채널 이름', class: 'grow',
      oninput: function () { V.add = this.value; }, onkeydown: function (e) { if (e.key === 'Enter' && !V.busy) addOne(); } });
    var addBtn = ui.btn(V.busy === 'add' ? '읽는 중…' : '+ 추가', addOne, 'btn-sm');
    if (V.busy) addBtn.disabled = true;
    var allBtn = V.prog ? ui.btn('■ 중지 (' + V.prog.i + ' / ' + V.prog.n + ')', function () { V.prog.stop(); }, 'btn-line btn-sm in-refall')
      : ui.btn('↻ 전체 새로고침 (' + list.length + '명)', function () { refreshAll(list.slice()); }, 'btn-sm in-refall');
    allBtn.title = '보이는 채널 전부의 구독 · 조회 · 댓글 · 주기 · 조회 추세를 유튜브에서 다시 읽습니다 — 1명당 약 5포인트(하루 한도 10,000), 1명당 3 ~ 8초';
    if (!V.prog && !list.length) allBtn.disabled = true;
    var stSel = ui.select([['', '모든 단계']].concat(I.STAGES.map(function (s) { return [s.id, s.name + ' (' + I.byStage(s.id).length + ')']; })), V.st, { onchange: function () { V.st = this.value; HR.refresh(); } });
    var agSel = ui.select([['', '소속 · 개인 전체'], ['agency', '소속 유튜버 (50% 이상)'], ['solo', '개인 유튜버']], V.ag, { onchange: function () { V.ag = this.value; HR.refresh(); } });
    var subsSel = ui.select([['', '구독자 전체 보기'], ['100000', '10만 미만'], ['70000', '7만 미만'], ['50000', '5만 미만'], ['30000', '3만 미만'], ['20000', '2만 미만'], ['10000', '1만 미만']].map(function (o) {
      var n = o[0] ? I.creators.filter(function (c) { return ((c.ch || {}).subs || 0) < +o[0]; }).length : I.creators.length;
      return [o[0], o[1] + ' (' + n + ')'];
    }), V.maxS, { onchange: function () { V.maxS = this.value; HR.refresh(); } });
    var q = ui.input({ value: V.q, placeholder: '채널 · 메일 · 태그 · 출처 검색 (Enter)', onchange: function () { V.q = this.value; HR.refresh(); } });

    var table = I.dbTable(list, {
      st: V, sideHead: ['stage', '단계'], metaHead: ['at', '추가일'],
      tags: function (c) {
        var ch = c.ch || {};
        return [I.agencyTag(Object.assign({}, ch, { email: c.email || ch.email }), true), c.email || ch.email ? h('span', { class: 'tag', text: '메일' }) : null, I.stTag(c.stage)];
      },
      side: function (c) { return h('div', { class: 'in-r-src' }, h('div', { class: 'meta in-ell', title: c.seedTitle || '', text: c.seedTitle || '—' }), h('div', { class: 'meta', text: '추가 ' + (c.at && c.at.toDate ? dayOf(c.at.toDate().getTime()) : '—') + ' · 최신 ' + dayOf((c.ch || {}).at) })); },
      acts: function (c) {
        return [I.updBtn(V.one[c.id], function () { refreshOne(c); }),
          (c.by === S.mid || S.isAdmin) ? I.delBtn(function () { db.doc('inf_creators/' + c.id).delete().then(function () { ui.toast('「' + c.ch.title + '」을(를) 리스트에서 삭제했습니다.'); }).catch(ui.fail); }) : null];
      },
      onRow: function (c) { HR.go('c/' + c.id); },
      empty: I.creators.length ? '조건에 맞는 유튜버가 없습니다.' : '아직 리스트가 비어 있습니다. 탐색 결과에서 체크해 「디벨롭으로 추가」하거나 위에서 직접 추가하세요.'
    });
    ui.put(view,
      ui.head('List', '리스트', h('div', { class: 'row' }, ui.btn('CSV 내보내기', function () { csv(list); }, 'btn-line btn-sm'))),
      ui.panel(null, null,
        h('div', { class: 'row in-seed-form' }, addIn, addBtn),
        V.msg ? h('p', { class: 'form-msg' + (V.err ? '' : ' ok'), role: 'alert', text: V.msg }) : null,
        h('p', { class: 'note', text: '탐색에서 「디벨롭으로 추가」했거나 여기서 직접 넣은 모든 유튜버입니다. 이 리스트의 채널은 다음 탐색부터 자동으로 빠집니다. 머리줄(구독 · 조회 · 댓글수 · 주기 · 조회 추세 …)을 누르면 그 기준으로 정렬되고, 한 번 더 누르면 반대로 정렬됩니다. 줄을 누르면 채널 데이터베이스가 열립니다.' })),
      h('div', { class: 'toolbar in-toolbar' }, subsSel, q, stSel, agSel, h('span', { class: 'meta grow in-right', text: list.length + ' / ' + I.creators.length + '명 · 약 ' + list.length * 5 + '포인트' }), allBtn),
      table);
  }
  HR.register('list', { render: function (view) { render(view); } });
})();
