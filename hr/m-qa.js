/* fillts HR — 기본안내 › 필츠 Q&A
   답변이 끝난 질문은 모두가 보는 Q&A 목록이 되고, 새 질문은 누구나 쉽게 남긴다(hr_qa).
   묻는 사람 이름은 본인과 관리자만 본다. 관리자는 답변 · 직접 추가 · 수정 · 삭제. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var CATS = ['근무', '휴가', '급여 · 서류', '비용 · 구매', '생활 · 복지', '기타'];
  var st = { q: '', cat: '', ask: '', askCat: '기타', edit: null, add: false };

  function ms(t) { return t && t.toMillis ? t.toMillis() : 0; }
  function load() {
    if (S.isAdmin) return HR.load('hr_qa:all', function () { return db.collection('hr_qa').get().then(HR.rows); });
    var a = HR.load('hr_qa:pub', function () { return db.collection('hr_qa').where('status', '==', 'answered').get().then(HR.rows); });
    var b = HR.load('hr_qa:mine', function () { return db.collection('hr_qa').where('by', '==', S.mid).get().then(HR.rows); });
    if (!a || !b) return null;
    var seen = {}; return a.concat(b).filter(function (x) { if (seen[x.id]) return false; seen[x.id] = 1; return true; });
  }
  function done() { HR.invalidate('hr_qa'); }
  function lines(t) { return String(t || '').split('\n').map(function (x, i) { return [i ? h('br') : null, x]; }); }

  // 관리자: 답변 · 수정 폼
  function answerForm(x, onDone) {
    var q = h('textarea', { rows: '2', maxlength: '300' }); q.value = x ? x.q : '';
    var a = h('textarea', { rows: '4', maxlength: '3000', placeholder: '답변 — 쉽게, 예시를 곁들여서' }); a.value = x && x.a ? x.a : '';
    var cat = ui.select(CATS.map(function (c) { return [c, c]; }), (x && x.cat) || '기타'), m = ui.msg();
    return h('form', { class: 'qa-answer', onsubmit: function (e) {
      e.preventDefault();
      if (!q.value.trim() || !a.value.trim()) return ui.err(m, '질문과 답변을 모두 적어 주세요.');
      var body = { q: q.value.trim(), a: a.value.trim(), cat: cat.value, status: 'answered', answeredBy: S.mid, answeredAt: FV.serverTimestamp() };
      var op = x ? db.doc('hr_qa/' + x.id).update(body) : db.collection('hr_qa').add(Object.assign(body, { by: S.mid, at: FV.serverTimestamp() }));
      op.then(function () { done(); onDone(); ui.toast(x && x.status === 'open' ? '답변했습니다. Q&A 목록에 올라가고 질문한 분에게 알림이 갑니다.' : '저장했습니다.'); }).catch(function (er) { ui.fail(er, m); });
    } }, ui.field('질문', q), ui.field('답변', a), ui.field('분류', cat), m,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', type: 'submit', text: x && x.status === 'open' ? '답변 올리기' : '저장' }), ui.btn('취소', function () { onDone(); }, 'btn-line btn-sm')));
  }

  function render(view) {
    var all = load();
    if (!all) return ui.put(view, ui.empty('불러오는 중…'));
    var answered = all.filter(function (x) { return x.status === 'answered'; })
      .sort(function (a, b) { return CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || ms(a.at) - ms(b.at); });
    var open = all.filter(function (x) { return x.status === 'open'; }).sort(function (a, b) { return ms(a.at) - ms(b.at); });
    var mine = all.filter(function (x) { return x.by === S.mid && x.status === 'open'; });

    // 질문하기
    var ask = h('textarea', { rows: '2', maxlength: '300', placeholder: '예: 점심시간은 언제인가요? — 편하게 한 줄로 물어보세요', oninput: function () { st.ask = this.value; } }); ask.value = st.ask;
    var askCat = ui.select(CATS.map(function (c) { return [c, c]; }), st.askCat, { onchange: function () { st.askCat = this.value; } }), am = ui.msg();
    var askBox = h('form', { class: 'qa-ask', onsubmit: function (e) {
      e.preventDefault();
      var v = st.ask.trim(); if (!v) return ui.err(am, '궁금한 점을 적어 주세요.');
      db.collection('hr_qa').add({ q: v, cat: st.askCat, status: 'open', by: S.mid, at: FV.serverTimestamp() })
        .then(function () { st.ask = ''; done(); ui.toast('질문을 남겼습니다. 답변이 오면 알려 드릴게요.'); }).catch(function (er) { ui.fail(er, am); });
    } }, h('div', { class: 'qa-ask-head' }, h('b', { text: '궁금한 게 있나요?' }), h('span', { class: 'meta', text: '이름은 관리자에게만 보이고, 답변은 아래 Q&A에 모두가 볼 수 있게 올라갑니다.' })),
      ask, h('div', { class: 'row' }, askCat, h('button', { class: 'btn btn-sm', type: 'submit', text: '질문하기' })), am);

    // 검색 · 분류 (다시 그리지 않고 숨김 — 입력 포커스 유지)
    var items = answered.map(function (x) {
      var editing = st.edit === x.id;
      var li = h('li', { class: 'qa-item' + (editing ? ' open' : '') },
        h('button', { type: 'button', class: 'qa-q', onclick: function () { li.classList.toggle('open'); } },
          h('span', { class: 'qa-mark', text: 'Q' }), h('span', { class: 'qa-qt', text: x.q }), h('span', { class: 'qa-cat', text: x.cat || '기타' }), h('span', { class: 'qa-arrow', text: '▾' })),
        h('div', { class: 'qa-a' }, editing ? answerForm(x, function () { st.edit = null; HR.refresh(); }) : [h('span', { class: 'qa-mark a', text: 'A' }), h('div', { class: 'qa-at' }, lines(x.a))],
          S.isAdmin && !editing ? h('div', { class: 'qa-admin' }, h('a', { href: '#', class: 'link', text: '수정', onclick: function (e) { e.preventDefault(); st.edit = x.id; HR.refresh(); } }),
            ui.confirmBtn('삭제', function () { db.doc('hr_qa/' + x.id).delete().then(done).catch(ui.fail); })) : null));
      li._hay = (x.q + ' ' + x.a + ' ' + (x.cat || '')).toLowerCase(); li._cat = x.cat || '기타';
      return li;
    });
    var list = h('ul', { class: 'qa-list' }, items), count = h('span', { class: 'meta' }), none = h('p', { class: 'empty', text: '찾는 답이 없습니다. 위에서 질문해 주세요.' });
    var chips = [''].concat(CATS.filter(function (c) { return answered.some(function (x) { return (x.cat || '기타') === c; }); })).map(function (c) {
      var b = h('button', { type: 'button', class: 'ai-chip', text: c || '전체', onclick: function () { st.cat = c; apply(); } }); b._c = c; return b;
    });
    function apply() {
      var ws = st.q.trim().toLowerCase().split(/\s+/).filter(Boolean), n = 0;
      items.forEach(function (li) { var ok = (!st.cat || li._cat === st.cat) && ws.every(function (w) { return li._hay.indexOf(w) >= 0; }); li.hidden = !ok; if (ok) n++; });
      count.textContent = n + '개'; none.hidden = n > 0 || !items.length;
      chips.forEach(function (b) { b.classList.toggle('on', b._c === st.cat); });
    }
    var search = h('input', { type: 'search', class: 'ai-search qa-search', value: st.q, placeholder: '검색 — 예: 점심, 연차, 증명서, 입금', oninput: function () { st.q = this.value; apply(); } });

    ui.put(view, askBox);
    if (S.isAdmin && open.length) ui.put(view, ui.panel('To answer · 답변 대기 ' + open.length, null, h('ul', { class: 'qa-open' }, open.map(function (x) {
      return h('li', null, h('div', { class: 'qa-open-q' }, h('b', { text: x.q }), h('span', { class: 'meta', text: HR.name(x.by) + ' · ' + (x.cat || '기타') + ' · ' + fmt.ts(x.at) })),
        st.edit === x.id ? answerForm(x, function () { st.edit = null; HR.refresh(); }) : h('div', { class: 'row' }, ui.btn('답변하기', function () { st.edit = x.id; HR.refresh(); }, 'btn-sm'),
          ui.confirmBtn('삭제', function () { db.doc('hr_qa/' + x.id).delete().then(done).catch(ui.fail); })));
    }))));
    if (!S.isAdmin && mine.length) ui.put(view, ui.panel('My questions · 답변 기다리는 중', null, h('ul', { class: 'list' }, mine.map(function (x) {
      return h('li', null, h('div', { class: 'grow' }, h('div', { text: x.q }), h('div', { class: 'meta', text: (x.cat || '기타') + ' · ' + fmt.ts(x.at) })), ui.tag('답변 대기', 'warn'),
        ui.confirmBtn('취소', function () { db.doc('hr_qa/' + x.id).delete().then(done).catch(ui.fail); }));
    }))));
    ui.put(view, ui.panel('Q&A · 자주 묻는 질문', h('span', null, count, S.isAdmin ? h('a', { href: '#', class: 'link qa-add', text: st.add ? '닫기' : '+ Q&A 직접 추가', onclick: function (e) { e.preventDefault(); st.add = !st.add; HR.refresh(); } }) : null),
      st.add && S.isAdmin ? answerForm(null, function () { st.add = false; HR.refresh(); }) : null,
      h('div', { class: 'qa-tools' }, search, h('div', { class: 'ai-chips' }, chips)),
      items.length ? list : ui.empty('아직 올라온 Q&A가 없습니다.'), none));
    apply();
    if (st.q) setTimeout(function () { search.focus(); }, 0);
  }
  HR.qa = { render: render };
})();
