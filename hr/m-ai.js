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

  /* ---------- AI 잘 쓰는 법 — 핵심 7가지 (이렇게 말하면 → 이렇게 바꾸면) ---------- */
  function basics(view, P) {
    var B = P.basics;
    if (!B) return guide(view, P);
    ui.put(view,
      h('section', { class: 'ai-basic-hero' }, h('span', { class: 'ai-basic-kicker', text: 'AI 잘 쓰는 법 · 핵심 7가지' }), h('h2', { text: B.lead })),
      h('ol', { class: 'ai-basics' }, B.items.map(function (x, i) {
        return h('li', { class: 'ai-basic' },
          h('div', { class: 'ai-basic-head' }, h('span', { class: 'ai-basic-no', text: String(i + 1) }), h('h3', { text: x.k })),
          h('p', { class: 'ai-basic-why', text: x.why }),
          h('div', { class: 'ai-ba' },
            h('div', { class: 'ai-bad' }, h('span', { text: '✕ 이렇게 말하면' }), h('p', { text: x.bad })),
            h('div', { class: 'ai-good' }, h('span', { text: '✓ 이렇게 바꾸면' }), h('p', { text: x.good }))));
      })),
      h('section', { class: 'ai-template' }, h('div', { class: 'ai-template-head' }, h('b', { text: '7가지를 한 번에 — 이 틀에 채우기만 하세요' }),
        ui.btn('틀 복사', function () { copy(B.template, this); }, 'btn-sm ai-copy')), bodyView(B.template)),
      h('p', { class: 'meta', text: '더 자세한 원칙은 「AI 가이드」, 바로 쓸 프롬프트는 「프롬프트 전체」에 있습니다.' }));
  }

  /* ---------- 프롬프트 생성기 — 7원칙(목표 · 화자 · 상황 · 형식 · 예시 · 되묻기 · 검증)으로 조립 ---------- */
  var TASKS = [
    { k: 'copy', t: '광고 · SNS 카피', cat: '카피 · 콘텐츠', role: '뷰티 D2C 브랜드 10년차 카피라이터', fmt: ['표'], n: '10', rules: ['claim', 'words', 'review'], goal: '예: 메타 광고 첫 줄 훅 카피 10개 — 스크롤을 멈추게 하는 것' },
    { k: 'content', t: '숏폼 · 콘텐츠 기획', cat: '카피 · 콘텐츠', role: '뷰티 숏폼 콘텐츠 PD', fmt: ['표'], n: '3', rules: ['claim', 'words'], goal: '예: 30초 릴스 대본 3안 — 첫 3초 훅 포함' },
    { k: 'research', t: '리서치 · 시장 조사', cat: '리서치', role: '뷰티 시장 리서치 애널리스트', fmt: ['핵심 요약 먼저', '표'], n: '', rules: ['source', 'nofake'], goal: '예: 미국 클린뷰티 클렌저 시장의 최근 1년 변화 정리' },
    { k: 'mail', t: '메일 · 메시지', cat: '문서 · 메일', role: '꼼꼼하고 예의 바른 브랜드 실무자', fmt: ['2가지 안 비교'], n: '', rules: ['nofake'], goal: '예: OEM에 샘플 일정 재확인을 요청하는 메일' },
    { k: 'summary', t: '요약 · 정리', cat: '문서 · 메일', role: '핵심만 뽑아 주는 유능한 비서', fmt: ['번호 목록', '표'], n: '', rules: ['nofake'], goal: '예: 회의 메모에서 결정 · 할 일 · 미정 사항 정리' },
    { k: 'plan', t: '기획 · 아이디어', cat: '기획', role: '뷰티 브랜드 전략 기획자', fmt: ['표'], n: '15', rules: ['review'], goal: '예: 11월 런칭 이벤트 아이디어 — 예산 300만원 이내' },
    { k: 'data', t: '데이터 · 시트', cat: '데이터 · 시트', role: 'D2C 그로스 분석가', fmt: ['핵심 요약 먼저', '표'], n: '', rules: ['nofake', 'review'], goal: '예: 지난 2주 광고 데이터에서 가장 중요한 변화 3가지와 다음 실험' },
    { k: 'cs', t: '고객 응대', cat: '고객 · CS', role: '따뜻하고 정확한 뷰티 브랜드 CS 담당자', fmt: ['짧은 문단'], n: '', rules: ['claim', 'nofake'], goal: '예: 배송 지연 문의에 대한 답변' },
    { k: 'etc', t: '기타', cat: '기타', role: '', fmt: [], n: '', rules: [], goal: '얻고 싶은 결과물을 한 문장으로' }
  ];
  var FORMATS = ['핵심 요약 먼저', '표', '번호 목록', '짧은 문단', '2가지 안 비교', '체크리스트'];
  var TONES = ['', '친근한 존댓말', '단정하고 전문적인', '감성적인 브랜드 톤', '짧고 직설적인'];
  var RULES = [
    ['ask', '시작 전에 필요한 정보가 있으면 먼저 질문해 줘.'],
    ['claim', '과장 · 의약품 오인 표현(치료 · 재생 · 100% 등)은 쓰지 마.'],
    ['nofake', '모르는 숫자 · 사실은 지어내지 말고 [확인 필요]로 표시해 줘.'],
    ['source', '주장마다 출처(기관 · 날짜 · 링크)를 달고, 출처 없는 내용은 빼 줘.'],
    ['words', '고정 언어(포드득 · 리저브 클렌징 · 스킨케어 0단계 · 60초 세안법)는 바꾸지 말고 그대로 써.'],
    ['review', '마지막에 이 답의 약점이나 확인이 필요한 부분 3가지를 따로 적어 줘.']
  ];
  var BRAND_CTX = '우리는 (주)필츠의 클린뷰티 브랜드 「바인그라피」야. 포도나무 전체를 쓰는 3~5만원대 프리미엄 클렌징(클렌징 젤 · 클렌징 오일)을 자사몰 D2C로 팔고, 주 고객은 30~55세 여성 얼리어답터야.';
  var G = null;
  function freshMaker(k) {
    var t = TASKS.filter(function (x) { return x.k === k; })[0] || TASKS[0];
    return { task: t.k, role: t.role, goal: '', ctx: '', brand: t.k !== 'etc', audience: '', fmt: t.fmt.slice(), n: t.n, len: '', tone: '', rules: ['ask'].concat(t.rules), example: '', material: false };
  }
  function buildPrompt(g) {
    var L = [], t = TASKS.filter(function (x) { return x.k === g.task; })[0] || TASKS[0];
    if (g.role.trim()) L.push('# 역할', '너는 ' + g.role.trim() + '야.', '');
    L.push('# 목표', g.goal.trim() || '[얻고 싶은 결과물 한 문장]', '');
    var ctx = [g.brand ? BRAND_CTX : '', g.ctx.trim(), g.audience.trim() ? '대상: ' + g.audience.trim() : ''].filter(Boolean);
    if (ctx.length) L.push('# 상황', ctx.join('\n'), '');
    var f = [];
    if (g.fmt.length) f.push('- 형식: ' + g.fmt.join(' → '));
    if (g.n) f.push('- 개수: ' + g.n + '개');
    if (g.len) f.push('- 길이: ' + g.len);
    if (g.tone) f.push('- 톤: ' + g.tone);
    if (f.length) L.push('# 결과 형식', f.join('\n'), '');
    var r = RULES.filter(function (x) { return g.rules.indexOf(x[0]) >= 0; }).map(function (x) { return '- ' + x[1]; });
    if (r.length) L.push('# 조건', r.join('\n'), '');
    if (g.example.trim()) L.push('# 참고 예시 (이 톤 · 수준으로)', '"""', g.example.trim(), '"""', '');
    if (g.material) L.push('# 자료', '"""', '[여기에 자료 붙여 넣기 — 개인정보 · 급여 · 계약 원문 · 미공개 처방은 빼고]', '"""', '');
    return L.join('\n').replace(/\n+$/, '');
  }
  function scoreOf(g) {
    return [
      ['목표', !!g.goal.trim()], ['화자', !!g.role.trim()], ['상황', g.brand || !!g.ctx.trim() || !!g.audience.trim()],
      ['형식', g.fmt.length > 0 || !!g.n || !!g.len], ['예시', !!g.example.trim()], ['되묻기', g.rules.indexOf('ask') >= 0],
      ['검증', g.rules.indexOf('review') >= 0 || g.rules.indexOf('nofake') >= 0]
    ];
  }
  function maker(view, P) {
    if (!G) G = freshMaker('copy');
    var g = G, out = h('div', { class: 'mk-out' }), meter = h('div', { class: 'mk-meter' }), msgs = h('p', { class: 'meta' });
    function sync() {
      var txt = buildPrompt(g), sc = scoreOf(g), ok = sc.filter(function (x) { return x[1]; }).length;
      ui.clear(out); out.appendChild(bodyView(txt));
      ui.clear(meter);
      meter.appendChild(h('div', { class: 'mk-score' }, h('b', { text: ok + ' / 7' }), h('span', { class: 'meta', text: ok >= 6 ? '아주 좋아요' : ok >= 4 ? '좋아요 — 빈 칸을 채우면 더 좋아집니다' : '목표 · 화자 · 상황부터 채워 보세요' })));
      meter.appendChild(h('div', { class: 'mk-checks' }, sc.map(function (x) { return h('span', { class: 'mk-chk' + (x[1] ? ' on' : ''), text: (x[1] ? '✓ ' : '· ') + x[0] }); })));
      return txt;
    }
    var inp = function (key, attrs) { var el = h(attrs && attrs.rows ? 'textarea' : 'input', Object.assign({ type: 'text', oninput: function () { g[key] = this.value; sync(); } }, attrs || {})); el.value = g[key] || ''; return el; };
    var chipSet = function (list, key, single) {
      return h('div', { class: 'mk-chips' }, list.map(function (v) {
        var on = single ? g[key] === v : g[key].indexOf(v) >= 0;
        return h('button', { type: 'button', class: 'mk-chip' + (on ? ' on' : ''), text: v || '지정 안 함', onclick: function () {
          if (single) g[key] = v; else { var i = g[key].indexOf(v); if (i >= 0) g[key].splice(i, 1); else g[key].push(v); }
          var sib = this.parentNode.children; for (var j = 0; j < sib.length; j++) sib[j].classList.toggle('on', single ? list[j] === g[key] : g[key].indexOf(list[j]) >= 0);
          sync();
        } });
      }));
    };
    var t = TASKS.filter(function (x) { return x.k === g.task; })[0];
    var form = h('div', { class: 'panel mk-form' },
      h('div', { class: 'mk-step' }, h('span', { class: 'mk-no', text: '1' }), h('b', { text: '어떤 일을 시키나요?' })),
      h('div', { class: 'mk-tasks' }, TASKS.map(function (x) {
        return h('button', { type: 'button', class: 'mk-task' + (x.k === g.task ? ' on' : ''), text: x.t, onclick: function () { var keep = { goal: g.goal, ctx: g.ctx, example: g.example }; G = Object.assign(freshMaker(x.k), keep); HR.refresh(); } });
      })),
      h('div', { class: 'mk-step' }, h('span', { class: 'mk-no', text: '2' }), h('b', { text: '핵심 세 가지' })),
      ui.field('목표 — 얻고 싶은 결과물 한 문장 *', inp('goal', { placeholder: t.goal, maxlength: '300' })),
      ui.field('대답할 화자 — 누구처럼 생각할지', inp('role', { placeholder: '예: 15년차 화장품 처방 연구원', maxlength: '120' })),
      ui.field('상황 · 배경 — 왜 · 지금 어떤 상태인지', inp('ctx', { rows: '3', placeholder: '예: 11/12 런칭, 지금은 자사몰 세팅 80%. 예산은 월 300만원.', maxlength: '1500' })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: g.brand, onchange: function () { g.brand = this.checked; sync(); } }), ' 우리 브랜드 기본 소개 넣기 (바인그라피 · 가격대 · 고객)'),
      ui.field('대상 — 누가 읽거나 보나요', inp('audience', { placeholder: '예: 시술 후 예민한 30대 여성', maxlength: '200' })),
      h('div', { class: 'mk-step' }, h('span', { class: 'mk-no', text: '3' }), h('b', { text: '결과의 모양' })),
      ui.field('형식 (여러 개, 누른 순서대로)', chipSet(FORMATS, 'fmt', false)),
      h('div', { class: 'form-grid' }, ui.field('개수', inp('n', { placeholder: '예: 10', maxlength: '10' })), ui.field('길이', inp('len', { placeholder: '예: 한 줄 25자 이내', maxlength: '60' }))),
      ui.field('톤', chipSet(TONES, 'tone', true)),
      h('div', { class: 'mk-step' }, h('span', { class: 'mk-no', text: '4' }), h('b', { text: '조건 · 검증' })),
      h('div', { class: 'mk-rules' }, RULES.map(function (r) {
        return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: g.rules.indexOf(r[0]) >= 0, onchange: function () { var i = g.rules.indexOf(r[0]); if (this.checked && i < 0) g.rules.push(r[0]); if (!this.checked && i >= 0) g.rules.splice(i, 1); sync(); } }), ' ' + r[1]);
      })),
      ui.field('참고 예시 — 이런 톤 · 수준이면 좋겠다 (선택)', inp('example', { rows: '3', placeholder: '마음에 드는 문장 하나를 붙여 넣으면 결과가 훨씬 정확해집니다.', maxlength: '2000' })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: g.material, onchange: function () { g.material = this.checked; sync(); } }), ' 자료 붙여 넣을 칸 만들기 (회의록 · 리뷰 · 데이터 등)'));
    var side = h('div', { class: 'mk-side' },
      h('div', { class: 'mk-side-head' }, h('b', { text: '완성된 프롬프트' }),
        ui.btn('복사', function () { copy(buildPrompt(g), this); }, 'btn-sm ai-copy')),
      meter, out,
      h('div', { class: 'row' },
        ui.btn('주요 프롬프트에 저장', function () {
          state.form = { title: (g.goal.trim() || t.t).slice(0, 60), cat: t.cat, body: buildPrompt(g), tags: t.t.split(' · ')[0] };
          HR.go('ai/prompts');
        }, 'btn-line btn-sm'),
        ui.btn('처음부터', function () { G = freshMaker(g.task); HR.refresh(); }, 'btn-line btn-sm')), msgs);
    ui.put(view, h('p', { class: 'muted small mk-lead', text: '칸을 채우면 오른쪽에 프롬프트가 바로 만들어집니다. 「AI 잘 쓰는 법」 7가지를 자동으로 지키는 구조입니다. 복사해서 Claude · ChatGPT · Gemini에 그대로 붙여 넣으세요.' }),
      h('div', { class: 'mk-wrap' }, form, side));
    sync();
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

  function allPrompts(P) {
    var mine = teamPrompts().map(function (x) { return Object.assign({ team: true }, x); })
      .sort(function (a, b) { return (b.at && b.at.toMillis ? b.at.toMillis() : 0) - (a.at && a.at.toMillis ? a.at.toMillis() : 0); });
    return { all: P.prompts.concat(mine), mine: mine };
  }
  function usedCats(P, all) { return P.cats.filter(function (c) { return all.some(function (p) { return (p.cat || '기타') === c; }); }); }
  // cat: '' = 프롬프트 전체(분류별로 묶어서), 그 외 = 그 분류만
  function prompts(view, P, cat) {
    var AP = allPrompts(P), mine = AP.mine, all = AP.all;
    state.cat = cat;
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
    var groups = (cat ? [cat] : usedCats(P, all)).map(function (c) {
      var mine2 = cards.filter(function (x) { return x._cat === c; });
      var g = h('section', { class: 'ai-group' }, cat ? null : h('div', { class: 'ai-group-head' }, h('h3', { text: c }), h('span', { class: 'meta', text: mine2.length + '개' }),
        h('a', { class: 'link', href: '#ai/prompts/' + P.cats.indexOf(c), text: '이 분류만 보기 →' })), h('div', { class: 'ai-grid' }, mine2));
      g._cards = mine2; return g;
    });
    var grid = h('div', { class: 'ai-groups' }, groups), none = h('p', { class: 'empty ai-none', text: '찾는 프롬프트가 없습니다. 직접 올려 주세요.' });
    function apply() {
      var q = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean), n = 0;
      cards.forEach(function (c) {
        var ok = (!cat || c._cat === cat) && q.every(function (w) { return c._hay.indexOf(w) >= 0; });
        c.hidden = !ok; if (ok) n++;
      });
      count.textContent = n + ' / ' + cards.length + '개';
      none.hidden = n > 0;
      groups.forEach(function (g) { g.hidden = !g._cards.some(function (c) { return !c.hidden; }); });
    }
    var search = h('input', { type: 'search', class: 'ai-search', value: state.q, placeholder: cat ? cat + ' 안에서 검색' : '전체 검색 — 예: 릴스, 메일, 금지어, 시트', oninput: function () { state.q = this.value; apply(); } });
    ui.put(view,
      h('div', { class: 'ai-searchbar' }, search, count, ui.btn('+ 프롬프트 올리기', function () { state.form = { title: '', cat: state.cat || '기타', body: '', tags: '' }; HR.refresh(); }, 'btn-sm')),
      h('p', { class: 'meta ai-hint', text: '「복사」를 누르고 AI 대화창에 붙여 넣은 뒤, 노란 [ ] 칸만 내 상황으로 바꾸세요.' }),
      grid, none);
    apply();
    setTimeout(function () { if (state.q) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); } }, 0);
  }

  HR.register('ai', {
    render: function (view, parts) {
      var sub = ['prompts', 'guide', 'maker', 'edu'].indexOf(parts[0]) >= 0 ? parts[0] : '', P = plan();
      if (!P) { var c = HR.cache.hr_plan_ai; return ui.put(view, ui.head('+AI', 'AI 잘 쓰는 법'), ui.empty(c && c.at && !c.loading ? '아직 내용이 없습니다.' : '불러오는 중…')); }
      var all = allPrompts(P).all, cat = sub && parts[1] !== undefined ? P.cats[+parts[1]] || '' : '';
      var n = function (c) { return all.filter(function (p) { return (p.cat || '기타') === c; }).length; };
      // AI 가이드 | 프롬프트 전체 | 분류별 바로가기
      var items = [['', 'AI 잘 쓰는 법'], ['maker', '프롬프트 생성기'], ['edu', 'AI교육 게시판'], ['guide', 'AI 가이드'], ['prompts', '프롬프트 전체 ' + all.length]].concat(usedCats(P, all).map(function (c) { return ['prompts/' + P.cats.indexOf(c), c + ' ' + n(c)]; }));
      var t = ui.tabs(items, sub === 'prompts' ? (cat ? 'prompts/' + P.cats.indexOf(cat) : 'prompts') : sub, 'ai');
      t.classList.add('ai-tabs'); t.children[0].classList.add('ai-tab-red');
      t.children[1].classList.add('ai-tab-maker');
      t.children[2].classList.add('ai-tab-edu');
      t.insertBefore(h('span', { class: 'ws-sub-sep', 'aria-hidden': 'true' }), t.children[5]); t.insertBefore(h('span', { class: 'ws-sub-sep', 'aria-hidden': 'true' }), t.children[4]);
      ui.put(view, ui.head('+AI', 'AI 잘 쓰는 법'), t);
      if (sub === 'prompts') prompts(view, P, cat); else if (sub === 'guide') guide(view, P); else if (sub === 'maker') maker(view, P); else if (sub === 'edu') HR.aiEdu.render(view, parts.slice(1)); else basics(view, P);
    }
  });
})();
