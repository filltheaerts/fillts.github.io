/* fillts Influencer — 셀럽: 구독자 많고 지향하는 · 나중에 컨택할 유튜버 모음 (inf_celebs/{채널 ID})
   추가 · 최신화는 서버(infYt action celeb), 메모 · 우선순위 · 카테고리는 화면에서 바로 고친다. 「파이프라인으로」를 누르면 리스트(디벨롭)로 보낸다 */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var V = I.V.celeb = { add: '', cat: '', prio: '2', busy: '', msg: '', err: false, sort: 'prio', dir: 1, one: {}, open: {}, q: '' };
  I.celebs = [];
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    if (prevStart) prevStart(sub);
    sub(db.collection('inf_celebs'), function (s) { I.celebs = HR.rows(s); I.loaded.celebs = true; });
  };
  var PRIO = [['1', '★★★ 꼭'], ['2', '★★ 언젠가'], ['3', '★ 참고']];

  function setMsg(t, err) { V.msg = t; V.err = !!err; HR.refresh(); }
  function addOne() {
    var v = V.add.trim();
    if (!v) return setMsg('유튜버 채널 주소 · @핸들 · 이름을 넣으세요.', true);
    V.busy = 'add'; setMsg('채널을 읽는 중입니다… (5 ~ 15초)');
    I.call('infYt', { action: 'celeb', input: v, prio: +V.prio, cat: V.cat.trim() }).then(function (r) {
      V.busy = ''; V.add = '';
      setMsg(r.existed ? '「' + r.title + '」은(는) 이미 셀럽에 있어 지표만 최신화했습니다.' : '「' + r.title + '」을(를) 셀럽에 추가했습니다.');
    }).catch(function (e) { V.busy = ''; setMsg(e.message, true); });
  }
  function refreshOne(c) {
    V.one[c.id] = true; HR.refresh();
    I.call('infYt', { action: 'celeb', id: c.id }).then(function () { V.one[c.id] = false; HR.refresh(); }).catch(function (e) { V.one[c.id] = false; ui.toast(e.message); });
  }
  function refreshAll(list) {
    if (V.prog) return;
    V.prog = { i: 0, n: list.length }; HR.refresh();
    var next = function () {
      if (V.prog.i >= list.length) { V.prog = null; setMsg('셀럽 전체 새로고침을 마쳤습니다.'); return; }
      I.call('infYt', { action: 'celeb', id: list[V.prog.i].id }).catch(function () {}).then(function () { V.prog.i++; HR.refresh(); next(); });
    };
    next();
  }
  function save(c, patch) { return db.doc('inf_celebs/' + c.id).update(Object.assign(patch, { updatedAt: FV.serverTimestamp(), updatedBy: S.mid })).catch(ui.fail); }
  function toPipe(c) {
    V.one[c.id] = true; HR.refresh();
    I.call('infYt', { action: 'add', input: c.id }).then(function (r) {
      V.one[c.id] = false; save(c, { moved: true });
      ui.toast(r.existed ? '이미 리스트에 있습니다.' : '「' + r.title + '」을(를) 리스트(디벨롭)로 보냈습니다.');
    }).catch(function (e) { V.one[c.id] = false; ui.toast(e.message); });
  }
  function editor(c) {
    var memo = h('textarea', { rows: '3', maxlength: '1000', value: c.memo || '', placeholder: '왜 지향하는지 · 컨택 타이밍 · 연결 고리(지인 · 소속사) …' });
    var cat = ui.input({ value: c.cat || '', maxlength: '30', placeholder: '예: 셀럽 · 배우 / 뷰티 대형' });
    var prio = ui.select(PRIO, String(c.prio || 2));
    var ch = c.ch || {}, ag = I.agency(ch);
    return h('div', { class: 'in-cand', onclick: function (e) { e.stopPropagation(); } },
      h('div', { class: 'in-cand-col' },
        h('div', { class: 'label', text: '메모 · 우선순위' }),
        h('div', { class: 'row in-opts' }, ui.field('우선순위', prio), ui.field('카테고리', cat, 'grow')), ui.field('메모', memo),
        h('div', { class: 'row' }, ui.btn('저장', function () { save(c, { memo: memo.value.trim(), cat: cat.value.trim(), prio: +prio.value }).then(function () { ui.toast('저장했습니다.'); }); }, 'btn-sm'),
          c.moved ? ui.tag('리스트로 보냄', 'mute') : ui.btn('파이프라인으로 (리스트 디벨롭)', function () { toPipe(c); }, 'btn-line btn-sm')),
        h('p', { class: 'meta', text: '소속 판정: ' + (ag.p ? '소속 ' + ag.p + '%' : '개인') + ' — ' + ag.why + (ch.email ? ' · 메일 ' + ch.email : '') })),
      h('div', { class: 'in-cand-col' },
        h('div', { class: 'label', text: '최근 영상' }),
        h('ul', { class: 'in-vids' }, (ch.recent || []).map(function (v) { return h('li', null, I.extLink(I.vidUrl(v.id), v.title), h('span', { class: 'meta', text: ' ' + I.cnt(v.views) + '회 · ' + fmt.dot(v.at).slice(2) })); })),
        h('div', { class: 'label', text: '댓글 톤' }), I.chips(I.toneTags(ch.tone), 'light'),
        (ch.sample || []).length ? h('ul', { class: 'in-cmts' }, ch.sample.slice(0, 3).map(function (t) { return h('li', { text: t }); })) : null));
  }
  function render(view) {
    var q = V.q.trim().toLowerCase();
    var list = I.celebs.filter(function (c) { return !q || ((c.ch.title || '') + ' ' + (c.cat || '') + ' ' + (c.memo || '')).toLowerCase().indexOf(q) >= 0; });
    var addIn = ui.input({ value: V.add, maxlength: '300', placeholder: '셀럽 추가 — 채널 주소 · @핸들 · 이름 (예: 기은세)', class: 'grow',
      oninput: function () { V.add = this.value; }, onkeydown: function (e) { if (e.key === 'Enter' && !V.busy) addOne(); } });
    var catIn = ui.input({ value: V.cat, maxlength: '30', placeholder: '카테고리 (선택)', oninput: function () { V.cat = this.value; } });
    var prio = ui.select(PRIO, V.prio, { onchange: function () { V.prio = this.value; } });
    var addBtn = ui.btn(V.busy ? '읽는 중…' : '+ 셀럽 추가', addOne, 'btn-sm');
    if (V.busy) addBtn.disabled = true;
    var table = I.dbTable(list, {
      st: V, sideHead: ['prio', '우선순위'], metaHead: ['at', '추가일'],
      tags: function (c) { return [h('span', { class: 'tag in-prio p' + (c.prio || 2), text: (PRIO[(c.prio || 2) - 1] || PRIO[1])[1] }), c.cat ? h('span', { class: 'tag', text: c.cat }) : null, I.agencyTag(c.ch, true), c.ch.email ? h('span', { class: 'tag', text: '메일' }) : null, c.moved ? ui.tag('리스트로 보냄', 'mute') : null]; },
      side: function (c) { return h('div', { class: 'in-r-src' }, h('div', { class: 'meta in-ell', title: c.memo || '', text: c.memo || '메모 없음 — 줄을 눌러 적기' }), h('div', { class: 'meta', text: '추가 ' + (c.at && c.at.toDate ? I.dayOf(c.at.toDate().getTime()) : '—') + ' · 최신 ' + I.dayOf(c.ch.at) })); },
      acts: function (c) { return [I.updBtn(V.one[c.id], function () { refreshOne(c); }), (c.by === S.mid || S.isAdmin) ? I.delBtn(function () { db.doc('inf_celebs/' + c.id).delete().then(function () { ui.toast('삭제했습니다.'); }).catch(ui.fail); }) : null]; },
      onRow: function (c) { V.open[c.id] = !V.open[c.id]; HR.refresh(); },
      empty: '아직 셀럽이 없습니다. 위에서 이름이나 채널 주소로 추가하세요.'
    });
    // 펼친 줄 아래에 편집 칸
    Array.prototype.slice.call(table.querySelectorAll('.in-dbrow.clickable')).forEach(function (row, i) {
      var c = I.sortRows(list, V)[i];
      if (c && V.open[c.id]) { row.classList.add('in-open'); row.parentNode.insertBefore(h('div', { class: 'in-row-detail' }, editor(c)), row.nextSibling); }
    });
    var total = list.reduce(function (a, c) { return a + (c.ch.subs || 0); }, 0);
    ui.put(view,
      ui.head('Celeb', '셀럽', h('span', { class: 'meta', text: list.length + '명 · 구독자 합 ' + I.cnt(total) })),
      ui.panel(null, null,
        h('div', { class: 'row in-seed-form' }, addIn, catIn, prio, addBtn),
        V.msg ? h('p', { class: 'form-msg' + (V.err ? '' : ' ok'), role: 'alert', text: V.msg }) : null,
        h('p', { class: 'note', text: '구독자가 많고 브랜드가 지향하는 유튜버, 지금은 아니어도 나중에 컨택하고 싶은 유튜버를 모아 둡니다. 탐색 중복 제외 대상은 아니며, 준비되면 줄을 눌러 「파이프라인으로」를 누르세요.' })),
      h('div', { class: 'toolbar in-toolbar' }, ui.input({ value: V.q, placeholder: '이름 · 카테고리 · 메모 검색 (Enter)', onchange: function () { V.q = this.value; HR.refresh(); } }),
        h('span', { class: 'meta grow in-right', text: list.length + '명 · 약 ' + list.length * 5 + '포인트' }),
        (function () { var b = ui.btn(V.prog ? '↻ 새로고침 중 ' + V.prog.i + ' / ' + V.prog.n : '↻ 전체 새로고침 (' + list.length + '명)', function () { refreshAll(list.slice()); }, 'btn-sm in-refall'); if (V.prog || !list.length) b.disabled = true; return b; })()),
      table);
  }
  HR.register('celeb', { render: function (view) { render(view); } });
})();
