/* fillts HR — +AI: AI 가이드 · 주요 프롬프트
   가이드 · 기본 프롬프트는 hr_plan/ai(관리자가 올리는 JSON), 팀이 올리는 프롬프트는 hr_prompts.
   프롬프트는 검색(제목 · 내용 · 태그 · 분류)과 한 번에 복사가 된다. 검색은 다시 그리지 않고 카드만 숨겨 입력 포커스를 지킨다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var state = { q: '', cat: '', form: null };

  function plan() {
    if (HR.cache.hr_plan_ai && !HR.cache.hr_plan_ai.loading && Date.now() - HR.cache.hr_plan_ai.at > 15000) delete HR.cache.hr_plan_ai;
    return HR.load('hr_plan_ai', function () { return db.doc('hr_plan/ai').get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : null; }); });
  }
  function teamPrompts() { return HR.load('hr_prompts', function () { return db.collection('hr_prompts').get().then(HR.rows); }) || []; }

  function copy(text, el) {
    var done = function () { ui.toast('복사했습니다. 붙여 넣고 [ ] 칸만 바꿔 쓰세요.'); if (el) { el.textContent = '✓ 복사됨'; el.classList.add('done'); setTimeout(function () { el.textContent = '복사'; el.classList.remove('done'); }, 1600); } };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
    fallback(text, done);
  }
  function fallback(text, done) {
    var t = h('textarea', { readonly: 'readonly', class: 'ai-copybuf' }); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) { window.prompt('복사해서 쓰세요', text); }
    t.remove();
  }
  // [채울 칸]을 눈에 띄게 — 텍스트 노드만 만든다(HTML 주입 없음)
  function bodyView(text) {
    var out = h('div', { class: 'ai-body' }), re = /\[[^\]\n]{1,80}\]/g, last = 0, m;
    while ((m = re.exec(text))) { if (m.index > last) out.appendChild(document.createTextNode(text.slice(last, m.index))); out.appendChild(h('mark', { class: 'ai-slot', text: m[0] })); last = re.lastIndex; }
    if (last < text.length) out.appendChild(document.createTextNode(text.slice(last)));
    return out;
  }

  /* ---------- AI 가이드 ---------- */
  function guide(view, P) {
    ui.put(view,
      h('section', { class: 'ai-hero' }, h('div', { class: 'ai-kicker', text: '+AI · 우리 팀이 AI를 쓰는 법' }), h('h2', null, P.intro.map(function (x, i) { return [i ? h('br') : null, x]; })),
        h('a', { class: 'btn btn-sm ai-hero-btn', href: '#ai/prompts', text: '주요 프롬프트 바로 쓰기 →' })),
      ui.panel('Rules · 먼저 지킬 것', null, h('ol', { class: 'ai-rules' }, P.rules.map(function (x, i) { return h('li', null, h('span', { class: 'ai-no', text: ('0' + (i + 1)).slice(-2) }), h('div', null, h('b', { text: x.k }), h('p', { text: x.d }))); }))),
      ui.panel('Formula · ' + P.formula.title, null, h('p', { class: 'muted small', text: P.formula.lead }),
        h('div', { class: 'ai-formula' }, P.formula.items.map(function (x) { return h('div', { class: 'ai-f' }, h('span', { class: 'ai-e', text: x.e }), h('b', { text: x.k }), h('span', { class: 'meta', text: x.d }), h('p', { class: 'ai-ex', text: '예) ' + x.x })); })),
        h('div', { class: 'ai-f-all' }, h('span', { class: 'meta', text: '다섯 칸을 이어 붙이면 →' }), h('p', { text: P.formula.items.map(function (x) { return x.x; }).join(' ') }),
          ui.btn('예시 복사', function () { copy(P.formula.items.map(function (x) { return x.x; }).join('\n'), this); }, 'btn-line btn-xs'))),
      ui.panel('Tips · ' + P.tips.title, null, h('div', { class: 'ai-tips' }, P.tips.items.map(function (x) { return h('div', null, h('b', { text: x.k }), h('p', { text: x.d })); }))),
      ui.panel('Tools · ' + P.tools.title, null, h('p', { class: 'muted small', text: P.tools.lead }),
        h('ul', { class: 'ai-tools' }, P.tools.items.map(function (x) { return h('li', null, h('b', { text: x.k }), h('span', { text: x.d })); }))));
  }

  /* ---------- 주요 프롬프트 ---------- */
  function promptForm(P, cur) {
    var f = state.form, m = ui.msg();
    var title = h('input', { type: 'text', maxlength: '80', value: f.title, placeholder: '예: 인스타 캡션 10개', oninput: function () { f.title = this.value; } });
    var body = h('textarea', { rows: '10', maxlength: '6000', placeholder: '바꿔 쓸 부분은 [대괄호]로 비워 두면 복사한 사람이 찾기 쉽습니다.', oninput: function () { f.body = this.value; } }); body.value = f.body;
    var tags = h('input', { type: 'text', maxlength: '80', value: f.tags, placeholder: '쉼표로 구분 — 예: 인스타, 캡션', oninput: function () { f.tags = this.value; } });
    return h('form', { class: 'panel ai-form', onsubmit: function (e) {
      e.preventDefault();
      if (!f.title.trim() || !f.body.trim()) return ui.err(m, '제목과 내용을 입력하세요.');
      var data = { title: f.title.trim(), cat: f.cat, body: f.body.trim(), tags: f.tags.split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 6), updatedAt: FV.serverTimestamp() };
      var op = cur ? db.doc('hr_prompts/' + cur.id).update(data) : db.collection('hr_prompts').add(Object.assign(data, { by: S.mid, at: FV.serverTimestamp() }));
      op.then(function () { state.form = null; HR.invalidate('hr_prompts'); ui.toast(cur ? '수정했습니다.' : '프롬프트를 올렸습니다. 팀 모두가 쓸 수 있습니다.'); }).catch(function (x) { ui.fail(x, m); });
    } }, ui.label(cur ? 'Edit · 프롬프트 수정' : 'New · 프롬프트 올리기'),
      ui.field('제목 *', title), ui.field('분류', ui.select(P.cats.map(function (c) { return [c, c]; }), f.cat, { onchange: function () { f.cat = this.value; } })),
      ui.field('내용 *', body), ui.field('태그', tags), m,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit', text: '저장' }), ui.btn('취소', function () { state.form = null; HR.refresh(); }, 'btn-line')));
  }

  function prompts(view, P) {
    var mine = teamPrompts().map(function (x) { return Object.assign({ team: true }, x); })
      .sort(function (a, b) { return (b.at && b.at.toMillis ? b.at.toMillis() : 0) - (a.at && a.at.toMillis ? a.at.toMillis() : 0); });
    var all = P.prompts.concat(mine);
    if (state.form) {
      var cur = state.form.id ? mine.filter(function (x) { return x.id === state.form.id; })[0] : null;
      return ui.put(view, promptForm(P, cur));
    }
    var count = h('span', { class: 'meta' });
    var cards = all.map(function (p) {
      var hay = [p.title, p.cat, p.body, (p.tags || []).join(' ')].join(' ').toLowerCase();
      var body = bodyView(p.body), open = false;
      var more = h('button', { type: 'button', class: 'ai-more', text: '전체 보기', onclick: function () { open = !open; card.classList.toggle('open', open); this.textContent = open ? '접기' : '전체 보기'; } });
      var canEdit = p.team && (S.isAdmin || p.by === S.mid);
      var card = h('article', { class: 'ai-card' },
        h('div', { class: 'ai-card-head' }, h('span', { class: 'ai-cat', text: p.cat || '기타' }), p.team ? h('span', { class: 'ai-by', text: HR.name(p.by) + ' 님이 올림' }) : h('span', { class: 'ai-by base', text: '기본' }),
          h('button', { type: 'button', class: 'btn btn-sm ai-copy', text: '복사', onclick: function () { copy(p.body, this); } })),
        h('h3', { text: p.title }), body, more,
        h('div', { class: 'ai-card-foot' }, h('span', { class: 'ai-tags', text: (p.tags || []).map(function (t) { return '#' + t; }).join(' ') }),
          canEdit ? h('a', { href: '#', class: 'link', text: '수정', onclick: function (e) { e.preventDefault(); state.form = { id: p.id, title: p.title, cat: p.cat || '기타', body: p.body, tags: (p.tags || []).join(', ') }; HR.refresh(); } }) : null,
          canEdit ? ui.confirmBtn('삭제', function () { db.doc('hr_prompts/' + p.id).delete().then(function () { HR.invalidate('hr_prompts'); }).catch(ui.fail); }) : null));
      card._hay = hay; card._cat = p.cat || '기타';
      return card;
    });
    var grid = h('div', { class: 'ai-grid' }, cards), none = h('p', { class: 'empty ai-none', text: '찾는 프롬프트가 없습니다. 직접 올려 주세요.' });
    function apply() {
      var q = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean), n = 0;
      cards.forEach(function (c) {
        var ok = (!state.cat || c._cat === state.cat) && q.every(function (w) { return c._hay.indexOf(w) >= 0; });
        c.hidden = !ok; if (ok) n++;
      });
      count.textContent = n + ' / ' + cards.length + '개';
      none.hidden = n > 0;
      chips.forEach(function (b) { b.classList.toggle('on', b._cat === state.cat); });
    }
    var search = h('input', { type: 'search', class: 'ai-search', value: state.q, placeholder: '검색 — 예: 릴스, 메일, 금지어, 시트', oninput: function () { state.q = this.value; apply(); } });
    var used = P.cats.filter(function (c) { return all.some(function (p) { return (p.cat || '기타') === c; }); });
    var chips = [''].concat(used).map(function (c) { var b = h('button', { type: 'button', class: 'ai-chip', text: c || '전체', onclick: function () { state.cat = c; apply(); } }); b._cat = c; return b; });
    ui.put(view,
      h('div', { class: 'ai-searchbar' }, search, count, ui.btn('+ 프롬프트 올리기', function () { state.form = { title: '', cat: state.cat || '기타', body: '', tags: '' }; HR.refresh(); }, 'btn-sm')),
      h('div', { class: 'ai-chips' }, chips),
      h('p', { class: 'meta ai-hint', text: '「복사」를 누르고 AI 대화창에 붙여 넣은 뒤, 노란 [ ] 칸만 내 상황으로 바꾸세요.' }),
      grid, none);
    apply();
    setTimeout(function () { if (state.q) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); } }, 0);
  }

  HR.register('ai', {
    render: function (view, parts) {
      var sub = parts[0] === 'prompts' ? 'prompts' : '';
      var t = ui.tabs([['', 'AI 가이드'], ['prompts', '주요 프롬프트']], sub, 'ai');
      ui.put(view, ui.head('+AI', 'AI 잘 쓰는 법'), t);
      var P = plan();
      if (!P) { var c = HR.cache.hr_plan_ai; return ui.put(view, ui.empty(c && c.at && !c.loading ? '아직 내용이 없습니다.' : '불러오는 중…')); }
      if (sub === 'prompts') prompts(view, P); else guide(view, P);
    }
  });
})();
