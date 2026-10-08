/* fillts Influencer — 실행안: 인플루언서로 실제로 할 일을 묶음별로 쭉 적는다 (VINEGRAPHY 마케팅 전략과 같은 형식)
   데이터는 vg_points를 같이 쓴다 — product 'inf' · kind 'strat'(항목) | 'stheme'(묶음), 항목의 theme = 묶음 문서 id
   구성원 누구나 추가 · 끌어서 이동(묶음 사이도) · 더블클릭 수정, 내용 수정 · 삭제는 작성자 · 관리자 (규칙 vgPoint) */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, db = HR.db, FV = HR.FV;
  var PROD = 'inf', COL = 'vg_points';
  var TAGS = ['목표', '채널', '콘텐츠', '광고', '운영', '지표'], DEF = '운영';
  var P = { rows: [], loaded: false }, edit = null, thEdit = null, filter = '';   // edit = 항목 id | 'new:<묶음id>' · thEdit = 묶음 id | 'new'
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    if (prevStart) prevStart(sub);
    sub(db.collection(COL).where('product', '==', PROD), function (s) { P.rows = HR.rows(s); P.loaded = true; });
  };

  function canEdit(x) { return S.isAdmin || x.by === S.mid; }
  function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }
  function nextOrder(list) { return list.reduce(function (m, p) { return Math.max(m, p.order || 0); }, 0) + 10; }
  function blurNow() { var a = document.activeElement; if (a && a.blur) a.blur(); }
  function focusSoon(id) { setTimeout(function () { var el = document.getElementById(id); if (el) { el.focus(); if (el.select) el.select(); } }, 120); }
  function save(id, data) {
    var base = { updatedBy: S.mid, updatedAt: FV.serverTimestamp() };
    var q = id ? db.collection(COL).doc(id).update(Object.assign(data, base))
      : db.collection(COL).add(Object.assign({ product: PROD, src: '', mktId: '', proof: '' }, data, base, { by: S.mid, at: FV.serverTimestamp() }));
    return q.catch(function (e) { ui.fail(e); throw e; });
  }
  function startEdit(id) {
    edit = id; HR.refresh();
    setTimeout(function () { var t = document.getElementById('inPlT'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 120);
  }

  // 그 자리에서 분류 · 한 줄 · 근거를 쓴다. Enter 저장(근거 칸은 Ctrl+Enter) · Esc 취소
  function inlineEdit(list, x, theme) {
    var tg = ui.select(TAGS.map(function (k) { return [k, k]; }), x ? x.tag : DEF, { class: 'in-pl-ie-tag', 'aria-label': '분류' });
    var t = ui.input({ id: 'inPlT', class: 'in-pl-ie-title', value: x ? x.title : '', maxlength: 300, placeholder: '할 일 한 줄', 'aria-label': '실행안' });
    var pr = h('textarea', { class: 'in-pl-ie-proof', rows: 2, maxlength: 1000, placeholder: '근거 · 숫자 · 담당 · 기한 (선택)', 'aria-label': '근거' }); pr.value = x ? x.proof || '' : '';
    var cancel = function () { edit = null; blurNow(); HR.refresh(); };
    var ok = function () {
      var title = t.value.trim(); if (!title) { t.focus(); return; }
      blurNow();
      if (x && title === x.title && pr.value.trim() === (x.proof || '') && tg.value === x.tag) return cancel();
      var data = { product: PROD, kind: 'strat', title: title, proof: pr.value.trim(), tag: tg.value };
      if (!x) { data.order = nextOrder(list); data.theme = theme || ''; }
      save(x && x.id, data).then(function () { edit = null; ui.toast(x ? '고쳤습니다.' : '추가했습니다.'); HR.refresh(); });
    };
    var keys = function (e) {
      if (e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter' && (e.target === t || e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); }
    };
    [t, pr, tg].forEach(function (el) { el.addEventListener('keydown', keys); });
    return h('div', { class: 'in-pl-main' },
      h('div', { class: 'in-pl-top' }, tg, t), pr,
      h('div', { class: 'in-pl-ie-act' }, ui.btn(x ? '저장' : '추가', ok, 'btn-xs'), ui.btn('취소', cancel, 'btn-line btn-xs'),
        h('span', { class: 'meta', text: 'Enter 저장 (근거 칸은 Ctrl+Enter) · Esc 취소' })));
  }

  // 항목 끌기 — 손잡이(⠿)로 위아래 · 다른 묶음으로. 놓으면 바뀐 줄만 order · theme를 한 번에 저장
  function dragItem(e, list) {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    var li = e.currentTarget.closest('.in-pl-it'), wrap = li.closest('.in-pl-themes'), ol = li.parentNode;
    var lists = Array.prototype.slice.call(wrap.querySelectorAll('ol.in-pl-its')), before = snap();
    li.classList.add('dragging'); document.body.classList.add('in-pl-dragging');
    function ids(l) { return Array.prototype.map.call(l.querySelectorAll('.in-pl-it[data-id]'), function (n) { return n.dataset.id; }); }
    function snap() { return lists.map(function (l) { return (l.dataset.theme || '') + ':' + ids(l).join(','); }).join('|'); }
    function renumber() { lists.forEach(function (l) { Array.prototype.forEach.call(l.querySelectorAll('.in-pl-no'), function (n, k) { n.textContent = ('0' + (k + 1)).slice(-2); }); l.classList.toggle('empty', !l.querySelector('.in-pl-it')); }); }
    function onMove(ev) {
      var y = ev.clientY;
      if (y < 70) window.scrollBy(0, -12); else if (y > window.innerHeight - 70) window.scrollBy(0, 12);
      for (var q = 0; q < lists.length; q++) { var lr = lists[q].getBoundingClientRect(); if (y >= lr.top - 14 && y <= lr.bottom + 14) { ol = lists[q]; break; } }
      lists.forEach(function (l) { l.classList.toggle('drop', l === ol); });
      var rows = Array.prototype.filter.call(ol.children, function (n) { return n !== li && n.dataset.id; }), next = null;
      for (var k = 0; k < rows.length; k++) { var r = rows[k].getBoundingClientRect(); if (y < r.top + r.height / 2) { next = rows[k]; break; } }
      if (next !== li.nextSibling) { ol.insertBefore(li, next); renumber(); }
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
      li.classList.remove('dragging'); document.body.classList.remove('in-pl-dragging');
      lists.forEach(function (l) { l.classList.remove('drop'); });
      if (snap() === before) return;
      var byId = {}; list.forEach(function (p) { byId[p.id] = p; });
      var batch = db.batch(), n = 0;
      lists.forEach(function (l) {
        var th = l.dataset.theme || '';
        ids(l).forEach(function (id, k) {
          var o = (k + 1) * 10, p = byId[id]; if (!p) return;
          var ch = { order: o, updatedBy: S.mid, updatedAt: FV.serverTimestamp() }, diff = p.order !== o;
          if ((p.theme || '') !== th) { ch.theme = th; p.theme = th; diff = true; }
          if (diff) { batch.update(db.collection(COL).doc(id), ch); p.order = o; n++; }
        });
      });
      if (n) batch.commit().then(function () { ui.toast('옮겼습니다.'); }, function (err) { ui.fail(err); HR.refresh(); });
    }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  }
  // 묶음 끌기 — [이름] 앞 ⠿
  function dragTheme(e, themes) {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    var sec = e.currentTarget.closest('.in-pl-theme'), box = sec.parentNode, before = tids();
    sec.classList.add('dragging'); document.body.classList.add('in-pl-dragging');
    function tids() { return Array.prototype.map.call(box.querySelectorAll('.in-pl-theme[data-tid]'), function (n) { return n.dataset.tid; }); }
    function onMove(ev) {
      var y = ev.clientY;
      if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 70) window.scrollBy(0, 14);
      var others = Array.prototype.filter.call(box.querySelectorAll('.in-pl-theme[data-tid]'), function (n) { return n !== sec; }), next = null;
      for (var k = 0; k < others.length; k++) { var r = others[k].getBoundingClientRect(); if (y < r.top + Math.min(r.height / 2, 40)) { next = others[k]; break; } }
      if (!next) next = box.querySelector('.in-pl-theme:not([data-tid])');
      if (next !== sec.nextSibling) box.insertBefore(sec, next);
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
      sec.classList.remove('dragging'); document.body.classList.remove('in-pl-dragging');
      var after = tids(); if (after.join() === before.join()) return;
      var byId = {}; themes.forEach(function (t) { byId[t.id] = t; });
      var batch = db.batch(), n = 0;
      after.forEach(function (id, k) { var o = (k + 1) * 10, t = byId[id]; if (t && t.order !== o) { batch.update(db.collection(COL).doc(id), { order: o, updatedBy: S.mid, updatedAt: FV.serverTimestamp() }); t.order = o; n++; } });
      if (n) batch.commit().then(function () { ui.toast('묶음 순서를 바꿨습니다.'); }, function (err) { ui.fail(err); HR.refresh(); });
    }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  }
  function themeInput(themes, t) {
    var inp = ui.input({ id: 'inPlTh', class: 'in-pl-th-in', value: t ? t.title : '', maxlength: 30, placeholder: '묶음 이름 — 예) 섭외', 'aria-label': '묶음 이름' });
    var done = function (ok) {
      var v = inp.value.replace(/^\[|\]$/g, '').trim(); thEdit = null; blurNow();
      if (!ok || !v || (t && v === t.title)) return HR.refresh();
      (t ? save(t.id, { title: v }) : save(null, { kind: 'stheme', title: v, tag: '주제', theme: '', order: nextOrder(themes) }))
        .then(function () { ui.toast(t ? '이름을 바꿨습니다.' : '「' + v + '」 묶음을 만들었습니다.'); HR.refresh(); });
    };
    inp.addEventListener('keydown', function (e) { if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); done(false); } });
    inp.addEventListener('blur', function () { if (thEdit !== null) done(true); });
    return inp;
  }

  function item(list, x, i, all) {
    var no = h('span', { class: 'in-pl-no', text: ('0' + (i + 1)).slice(-2) });
    if (edit === x.id) return h('li', { class: 'in-pl-it editing', 'data-id': x.id }, h('span', { class: 'in-pl-grip off' }), no, inlineEdit(all, x));
    var mine = canEdit(x);
    var grip = filter ? h('span', { class: 'in-pl-grip off' }) : h('span', { class: 'in-pl-grip', title: '끌어서 옮기기 (다른 묶음으로도)', onpointerdown: function (e) { dragItem(e, all); } }, '⠿');
    return h('li', { class: 'in-pl-it' + (mine ? ' can-edit' : ''), 'data-id': x.id, title: mine ? '더블클릭하면 바로 고칩니다' : null,
      ondblclick: mine ? function (e) { if (e.target.closest('button, .in-pl-grip')) return; startEdit(x.id); } : null },
      grip, no,
      h('div', { class: 'in-pl-main' },
        h('div', { class: 'in-pl-top' }, h('span', { class: 'in-pl-chip', text: x.tag }), h('b', { class: 'in-pl-title', text: x.title })),
        x.proof ? h('p', { class: 'in-pl-proof', text: x.proof }) : null),
      h('div', { class: 'in-pl-act' },
        mine ? ui.btn('수정', function () { startEdit(x.id); }, 'btn-line btn-xs') : null,
        mine ? ui.confirmBtn('삭제', function () { db.collection(COL).doc(x.id).delete().then(function () { ui.toast('삭제했습니다.'); }, ui.fail); }) : null));
  }

  function render(view) {
    ui.put(view, ui.head('Action Plan', '실행안', h('span', { class: 'meta', text: '구성원 누구나 추가 · 끌어서 이동 · 더블클릭 수정' })));
    if (!P.loaded) return ui.put(view, ui.empty('불러오는 중…'));
    var list = P.rows.filter(function (p) { return p.kind === 'strat'; }).sort(byOrder);
    var themes = P.rows.filter(function (p) { return p.kind === 'stheme'; }).sort(byOrder);
    var known = {}; themes.forEach(function (t) { known[t.id] = 1; });
    var counts = {}; list.forEach(function (p) { counts[p.tag] = (counts[p.tag] || 0) + 1; });
    var chips = h('div', { class: 'in-pl-filter' }, [['', '전체 ' + list.length]].concat(TAGS.filter(function (t) { return counts[t]; }).map(function (t) { return [t, t + ' ' + counts[t]]; })).map(function (o) {
      return h('button', { type: 'button', class: 'chip' + (o[0] === filter ? ' on' : ''), text: o[1], onclick: function () { filter = o[0]; HR.refresh(); } });
    }));
    var section = function (t) {
      var tid = t ? t.id : '';
      var items = list.filter(function (p) { return t ? p.theme === tid : !known[p.theme || '']; });
      var rows = items.filter(function (p) { return !filter || p.tag === filter; }).map(function (x, i) { return item(items, x, i, list); });
      var newKey = 'new:' + tid;
      if (edit === newKey) rows.push(h('li', { class: 'in-pl-it editing new' }, h('span', { class: 'in-pl-grip off' }), h('span', { class: 'in-pl-no', text: ('0' + (items.length + 1)).slice(-2) }), inlineEdit(list, null, tid)));
      var mine = t && canEdit(t);
      var name = t && thEdit === tid ? themeInput(themes, t)
        : h('b', { class: 'in-pl-th-name', title: mine ? '더블클릭하면 이름을 고칩니다' : null, ondblclick: mine ? function () { thEdit = tid; HR.refresh(); focusSoon('inPlTh'); } : null }, t ? '[' + t.title + ']' : '[묶음 없음]');
      return h('section', { class: 'in-pl-theme' + (t ? '' : ' none'), 'data-tid': t ? tid : null },
        h('div', { class: 'in-pl-th-head' },
          t ? h('span', { class: 'in-pl-th-grip', title: '끌어서 묶음 순서 바꾸기', onpointerdown: function (e) { dragTheme(e, themes); } }, '⠿') : h('span', { class: 'in-pl-th-grip off' }),
          name, h('span', { class: 'in-pl-th-n', text: String(items.length) }), h('span', { class: 'grow' }),
          edit === newKey ? null : h('button', { type: 'button', class: 'in-pl-th-add', text: '+ 항목', onclick: function () { startEdit(newKey); } }),
          mine && !items.length ? ui.confirmBtn('묶음 삭제', function () { db.collection(COL).doc(tid).delete().then(function () { ui.toast('묶음을 지웠습니다.'); }, ui.fail); }, 'btn btn-line btn-xs danger') : null),
        h('ol', { class: 'in-pl-its' + (rows.length ? '' : ' empty'), 'data-theme': tid }, rows));
    };
    var none = list.filter(function (p) { return !known[p.theme || '']; });
    ui.put(view, h('section', { class: 'in-pl' },
      h('div', { class: 'in-pl-head' }, h('div', { class: 'label', text: 'Plan · 실행안' }), h('span', { class: 'meta', text: list.length + '개 · 묶음 ' + themes.length })),
      h('p', { class: 'muted small', text: '인플루언서로 실제로 할 일을 묶음별로 적습니다. 항목은 왼쪽 ⠿로 끌어서 다른 묶음으로 옮기고, 묶음은 [이름] 앞 ⠿로 순서를 바꿉니다. 이름 · 항목은 더블클릭으로 고칩니다.' }),
      list.length > 8 ? chips : null,
      h('div', { class: 'in-pl-themes' }, themes.map(section), none.length || edit === 'new:' || !themes.length ? section(null) : null),
      h('div', { class: 'in-pl-add-row' }, thEdit === 'new' ? themeInput(themes, null)
        : h('button', { type: 'button', class: 'in-pl-add', text: '+ 실행 묶음', onclick: function () { thEdit = 'new'; HR.refresh(); focusSoon('inPlTh'); } }))));
  }

  HR.register('plan', { render: render });
})();
