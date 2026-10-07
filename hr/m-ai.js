/* fillts HR — +AI: AI 가이드 · 주요 프롬프트
   가이드 · 기본 프롬프트는 hr_plan/ai(관리자가 올리는 JSON), 팀이 올리는 프롬프트는 hr_prompts.
   프롬프트는 검색(제목 · 내용 · 태그 · 분류)과 한 번에 복사가 된다. 검색은 다시 그리지 않고 카드만 숨겨 입력 포커스를 지킨다. */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var state = { q: '', cat: '', form: null };

  function plan() {
    if (HR.cache.hr_plan_ai && !HR.cache.hr_plan_ai.loading && Date.now() - HR.cache.hr_plan_ai.at > 15000) HR.cache.hr_plan_ai.at = 0;
    return HR.load('hr_plan_ai', function () { return db.doc('hr_plan/ai').get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : null; }); });
  }
  function teamPrompts() { return HR.load('hr_prompts', function () { return db.collection('hr_prompts').get().then(HR.rows); }) || []; }

  function copy(text, el) {
    var label = el ? el.textContent : '';
    var done = function () { ui.toast('복사했습니다. 붙여 넣고 [ ] 칸만 바꿔 쓰세요.'); if (el) { el.textContent = '✓ 복사됨'; el.classList.add('done'); setTimeout(function () { el.textContent = label === '✓ 복사됨' ? '복사' : label; el.classList.remove('done'); }, 1600); } };
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
      B.tools ? h('section', { class: 'ai-tools2' }, h('h3', { text: B.tools.title }), h('p', { class: 'muted small', text: B.tools.lead }),
        h('div', { class: 'ai-tool-grid' }, B.tools.items.map(function (x) {
          return h('div', { class: 'ai-tool t-' + x.k.toLowerCase() }, h('div', { class: 'ai-tool-head' }, h('b', { text: x.k }), h('span', { class: 'meta', text: x.by })),
            h('p', { text: x.d }), h('div', { class: 'ai-tool-best' }, h('span', { text: '이럴 때' }), x.best));
        })),
        B.tools.work ? h('div', { class: 'ai-work' }, h('b', { class: 'ai-work-title', text: B.tools.work.title }), h('p', { text: B.tools.work.lead }),
          h('div', { class: 'ai-work-grid' }, B.tools.work.items.map(function (x) { return h('div', null, h('b', { text: x.k }), h('p', { text: x.d })); })),
          h('ul', { class: 'ai-work-rules' }, B.tools.work.rules.map(function (r) { return h('li', { text: r }); }))) : null) : null,
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

  /* ---------- 프롬프트 생성기 — 화자가 핵심. 화자 → 목표 · 상황 → 형식 → 조건 · 검증 순으로 조립 ----------
     화자 문장 구조(대표 원안): 최고 수준의 전문성 + 태도(날카로움 · 현실 감각) + 통찰(독서량 · 인간 본연) + 끊임없이 공부하는 대상 + 「이 관점으로 자세하고 섬세하게 분석해 결과 도출」 */
  var PERSONA_GROUPS = [
    ['마케팅', [
      { k: 'perf', t: '퍼포먼스 마케터', who: '세계 최고의 20년차 뷰티 D2C 퍼포먼스 마케팅 베테랑', edge: '숫자로 증명하고, 현실 감각과 날카로움을 잃지 않는 그로스 승부사', study: '광고 플랫폼의 흐름과 소비자의 구매 심리' },
      { k: 'copy', t: '카피라이터', who: '뷰티 업계에서 가장 주목받는 카피라이터', edge: '3초 안에 마음을 움직이되, 과장 없이 정확한 말로 승부하는 사람', study: '소비자의 언어와 숨은 욕망' },
      { k: 'content', t: '숏폼 · 콘텐츠 PD', who: '수많은 바이럴을 만든 세계 최고의 뷰티 숏폼 콘텐츠 PD', edge: '트렌드를 읽되 휩쓸리지 않고, 사람을 끌어당기는 후킹 감각이 뛰어난 승부사', study: '사람들이 멈추고, 저장하고, 공유하는 이유' },
      { k: 'influencer', t: '인플루언서 · 커뮤니티', who: '15년차 뷰티 인플루언서 마케팅 디렉터', edge: '관계를 소중히 하면서도 성과 앞에서는 냉정한 협상가', study: '크리에이터와 팬덤이 움직이는 방식' },
      { k: 'brand', t: '브랜드 전략가', who: '세계 최고의 뷰티 브랜드 혁신가', edge: '날카로움을 잃지 않는 전략 승부사', study: '놀라운 제품과 소비자' }
    ]],
    ['D2C 운영', [
      { k: 'crm', t: 'CRM · 재구매', who: '세계 최고의 20년차 D2C CRM · 리텐션 전문가', edge: '한 명의 고객을 평생 고객으로 만드는 집요한 설계자', study: '고객 여정과 재구매 심리' },
      { k: 'data', t: '그로스 분석가', who: '세계 최고의 D2C 그로스 데이터 분석가', edge: '숫자 뒤의 진짜 원인을 찾고, 현실 감각을 잃지 않는 사람', study: '매출 · 광고 · 고객 데이터의 패턴' },
      { k: 'research', t: '시장 · 소비자 리서처', who: '15년차 뷰티 시장 · 소비자 리서처', edge: '정보 검색에 뛰어나고, 출처 없는 말은 믿지 않는 사람', study: '시장 · 경쟁사 · 소비자 트렌드' },
      { k: 'cx', t: '고객 경험(CS)', who: '세계 최고의 뷰티 브랜드 고객 경험 디렉터', edge: '따뜻하지만 정확하고, 불만을 팬으로 바꾸는 사람', study: '고객의 마음과 작은 불편' },
      { k: 'ops', t: '물류 · 운영', who: '세계 최고의 뷰티 D2C 물류 · 운영 전문가', edge: '정보 검색에 뛰어나고, 작은 실수도 놓치지 않는 꼼꼼한 실행가', study: '효율적인 D2C 물류와 운영' },
      { k: 'biz', t: '제휴 · 협상', who: '수많은 파트너십을 성사시킨 뷰티 브랜드 사업개발 리더', edge: '예의 바르면서도 우리 조건은 흐리지 않는 협상가', study: '상대의 입장과 이해관계' },
      { k: 'it', t: 'IT · 자동화', who: '20년 넘게 업계 동향을 살피고 관찰하고 상상해 온 세계 최고의 IT 전문가', edge: '복잡한 일을 단순한 시스템으로 바꾸는 실용가', study: '새로운 도구와 자동화' }
    ]],
    ['제품 · 브랜드', [
      { k: 'recipe', t: '처방 · 제품 혁신', who: '세계 최고의 20년차 뷰티 제품 레시피 혁신가', edge: '날카로움을 잃지 않는 전략 승부사', study: '성분 · 처방과 소비자의 피부 경험' },
      { k: 'planning', t: '제품 기획', who: '15년차 세계 최고의 뷰티 제품 기획자', edge: '정보 검색에 뛰어나고, 시장의 빈자리를 먼저 보는 사람', study: '놀라운 제품과 소비자' },
      { k: 'design', t: '브랜드 디자이너', who: '업계에서 가장 주목받는 세계 최고의 브랜드 전문가', edge: '미술적 감성과 색채 이해가 섬세하고, 미니멀하지만 브랜드의 핵심 포인트 디자인을 정확히 아는 사람', study: '놀라운 제품과 소비자' }
    ]]
  ];
  var PERSONAS = []; PERSONA_GROUPS.forEach(function (g) { g[1].forEach(function (p) { PERSONAS.push(p); }); });
  var INSIGHT_LINE = '엄청난 독서량으로 인간 본연의 마음을 꿰뚫어 보는 대단한 통찰가';
  var TASKS = [
    { k: 'copy', t: '광고 · SNS 카피', cat: '카피 · 콘텐츠', p: 'copy', fmt: ['표'], n: '10', rules: ['claim', 'words', 'review'], goal: '예: 메타 광고 첫 줄 훅 카피 10개 — 스크롤을 멈추게 하는 것' },
    { k: 'content', t: '숏폼 · 콘텐츠 기획', cat: '카피 · 콘텐츠', p: 'content', fmt: ['표'], n: '3', rules: ['claim', 'words'], goal: '예: 30초 릴스 대본 3안 — 첫 3초 훅 포함' },
    { k: 'perf', t: '광고 · 퍼포먼스', cat: '마케팅', p: 'perf', fmt: ['핵심 요약 먼저', '표'], n: '', rules: ['nofake', 'review'], goal: '예: 이번 달 메타 광고 예산 300만원 배분안과 테스트 계획' },
    { k: 'research', t: '리서치 · 시장 조사', cat: '리서치', p: 'research', fmt: ['핵심 요약 먼저', '표'], n: '', rules: ['source', 'nofake'], goal: '예: 미국 클린뷰티 클렌저 시장의 최근 1년 변화 정리' },
    { k: 'crm', t: 'CRM · 재구매', cat: '마케팅', p: 'crm', fmt: ['표'], n: '', rules: ['claim', 'review'], goal: '예: 첫 구매 고객의 30일 재구매 시퀀스(D+0 · 7 · 14 · 30) 설계' },
    { k: 'mail', t: '메일 · 협상', cat: '문서 · 메일', p: 'biz', fmt: ['2가지 안 비교'], n: '', rules: ['nofake'], goal: '예: OEM에 샘플 일정 재확인을 요청하는 메일' },
    { k: 'plan', t: '제품 · 기획', cat: '기획', p: 'planning', fmt: ['표'], n: '15', rules: ['review'], goal: '예: 크림 · 앰플 라인 콘셉트 아이디어 — 바인그라피 세계관 안에서' },
    { k: 'data', t: '데이터 · 분석', cat: '데이터 · 시트', p: 'data', fmt: ['핵심 요약 먼저', '표'], n: '', rules: ['nofake', 'review'], goal: '예: 지난 2주 광고 데이터에서 가장 중요한 변화 3가지와 다음 실험' },
    { k: 'cs', t: '고객 응대', cat: '고객 · CS', p: 'cx', fmt: ['짧은 문단'], n: '', rules: ['claim', 'nofake'], goal: '예: 배송 지연 문의에 대한 답변' },
    { k: 'etc', t: '기타', cat: '기타', p: '', fmt: [], n: '', rules: [], goal: '얻고 싶은 결과물을 한 문장으로' }
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
  var BRAND_CTX = '우리는 (주)필츠의 클린뷰티 브랜드 「바인그라피」야. 포도나무 전체를 쓰는 3~5만원대 프리미엄 클렌징(클렌징 젤 · 클렌징 오일)을 자사몰 D2C로 팔고, 주 고객은 30~55세 여성 얼리어답터야. 브랜드 미션은 「그녀를 행복하게!」야.';
  var G = null;
  function personaOf(k) { return PERSONAS.filter(function (p) { return p.k === k; })[0] || null; }
  function freshMaker(k) {
    var t = TASKS.filter(function (x) { return x.k === k; })[0] || TASKS[0], p = personaOf(t.p) || { k: '', who: '', edge: '', study: '' };
    return { task: t.k, pk: p.k, who: p.who, edge: p.edge, study: p.study, insight: true, goal: '', ctx: '', brand: t.k !== 'etc', audience: '', fmt: t.fmt.slice(), n: t.n, len: '', tone: '', rules: ['ask'].concat(t.rules), example: '', material: false };
  }
  // 받침에 따라 조사를 고른다 (사람이라고 / 승부사라고)
  function hasBatchim(w) { var c = w.charCodeAt(w.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; }
  function speakerText(g) {
    var who = g.who.trim(), edge = g.edge.trim();
    if (!who) return '';
    var L = [edge ? '나는 네가 ' + who + (hasBatchim(who) ? '이면서' : '면서') + ', ' + edge + (hasBatchim(edge) ? '이라고' : '라고') + ' 생각해.'
                  : '나는 네가 ' + who + (hasBatchim(who) ? '이라고' : '라고') + ' 생각해.'];
    if (g.insight) L.push('또 ' + INSIGHT_LINE + '이고,');
    if (g.study.trim()) L.push((g.insight ? '' : '또 ') + g.study.trim() + '에 대해 끊임없이 공부하며 세상의 이면을 볼 수 있는 사람이지.');
    L.push('이 관점으로 자세하고 섬세하게 분석하고 결과를 도출해 줘.');
    return L.join('\n');
  }
  function buildPrompt(g) {
    var L = [], sp = speakerText(g);
    if (sp) L.push('# 대답할 화자', sp, '');
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
      ['화자', !!g.who.trim() && !!(g.edge.trim() || g.study.trim())], ['목표', !!g.goal.trim()], ['상황', g.brand || !!g.ctx.trim() || !!g.audience.trim()],
      ['형식', g.fmt.length > 0 || !!g.n || !!g.len], ['예시', !!g.example.trim()], ['되묻기', g.rules.indexOf('ask') >= 0],
      ['검증', g.rules.indexOf('review') >= 0 || g.rules.indexOf('nofake') >= 0]
    ];
  }
  // 화면은 세 가지만: ① 무슨 일 ② 원하는 결과 한 문장 ③ 복사. 화자 · 형식 · 조건은 일에 맞춰 자동으로 채우고 「더 자세히」에 접어 둔다
  var moreOpen = false;
  function maker(view, P) {
    if (!G) G = freshMaker('copy');
    var g = G, out = h('div', { class: 'pm-out' }), copyBtn;
    function sync() {
      var txt = buildPrompt(g);
      ui.clear(out); out.appendChild(bodyView(txt));
      if (copyBtn) copyBtn.disabled = !g.goal.trim();
      return txt;
    }
    var inp = function (key, attrs) { var el = h(attrs && attrs.rows ? 'textarea' : 'input', Object.assign({ type: 'text', oninput: function () { g[key] = this.value; if (['who', 'edge', 'study'].indexOf(key) >= 0) { g.pk = ''; personaSel.value = ''; } sync(); } }, attrs || {})); el.value = g[key] || ''; return el; };
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
    var spIn = {};
    // 화자: 일에 맞춰 자동 — 바꾸고 싶을 때만 고른다
    var personaSel = h('select', { class: 'pm-persona', 'aria-label': '대답할 화자', onchange: function () {
      var p = personaOf(this.value); if (!p) return;
      g.pk = p.k; g.who = p.who; g.edge = p.edge; g.study = p.study; spIn.who.value = p.who; spIn.edge.value = p.edge; spIn.study.value = p.study; sync();
    } }, h('option', { value: '', text: '직접 적기' }), PERSONA_GROUPS.map(function (grp) {
      return h('optgroup', { label: grp[0] }, grp[1].map(function (p) { return h('option', { value: p.k, text: p.t }); }));
    }));
    personaSel.value = g.pk || '';

    var goal = inp('goal', { rows: '3', class: 'pm-goal', placeholder: t.goal, maxlength: '300' });
    var more = h('details', { class: 'pm-more', ontoggle: function () { moreOpen = this.open; } },
      h('summary', { text: '더 자세히 — 상황 · 형식 · 조건 · 화자 문장' }),
      h('div', { class: 'pm-more-body' },
        ui.field('상황 · 배경', inp('ctx', { rows: '2', placeholder: '예: 11/12 런칭, 지금은 자사몰 세팅 80%. 예산은 월 300만원.', maxlength: '1500' })),
        ui.field('대상 — 누가 읽거나 보나요', inp('audience', { placeholder: '예: 시술 후 예민한 30대 여성', maxlength: '200' })),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: g.brand, onchange: function () { g.brand = this.checked; sync(); } }), ' 우리 브랜드 소개 넣기'),
        ui.field('형식', chipSet(FORMATS, 'fmt', false)),
        h('div', { class: 'form-grid' }, ui.field('개수', inp('n', { placeholder: '예: 10', maxlength: '10' })), ui.field('길이', inp('len', { placeholder: '예: 한 줄 25자 이내', maxlength: '60' }))),
        ui.field('톤', chipSet(TONES, 'tone', true)),
        h('div', { class: 'mk-rules' }, RULES.map(function (r) {
          return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: g.rules.indexOf(r[0]) >= 0, onchange: function () { var i = g.rules.indexOf(r[0]); if (this.checked && i < 0) g.rules.push(r[0]); if (!this.checked && i >= 0) g.rules.splice(i, 1); sync(); } }), ' ' + r[1]);
        })),
        ui.field('참고 예시 — 이런 톤 · 수준으로', inp('example', { rows: '2', placeholder: '마음에 드는 문장 하나를 붙여 넣으면 결과가 정확해집니다.', maxlength: '2000' })),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: g.material, onchange: function () { g.material = this.checked; sync(); } }), ' 자료 붙여 넣을 칸 만들기'),
        ui.field('화자 — 전문성', spIn.who = inp('who', { rows: '2', maxlength: '120' })),
        ui.field('화자 — 태도', spIn.edge = inp('edge', { rows: '2', maxlength: '160' })),
        ui.field('화자 — 끊임없이 공부하는 것', spIn.study = inp('study', { maxlength: '120' })),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: g.insight, onchange: function () { g.insight = this.checked; sync(); } }), ' 통찰가 문장 넣기'),
        h('div', { class: 'pm-links' },
          h('button', { type: 'button', class: 'x-del', text: '화자 문장만 복사', onclick: function () { copy(speakerText(g), this); } }),
          h('button', { type: 'button', class: 'x-del', text: '주요 프롬프트에 저장', onclick: function () {
            state.form = { title: (g.goal.trim() || t.t).slice(0, 60), cat: t.cat, body: buildPrompt(g), tags: t.t.split(' · ')[0] };
            HR.go('ai/prompts');
          } }),
          h('button', { type: 'button', class: 'x-del', text: '처음부터', onclick: function () { G = freshMaker(g.task); HR.refresh(); } }))));
    if (moreOpen) more.open = true;
    copyBtn = h('button', { type: 'button', class: 'btn pm-copy', text: '프롬프트 복사', onclick: function () { if (!g.goal.trim()) { goal.focus(); return; } copy(buildPrompt(g), this); } });

    ui.put(view, h('div', { class: 'pm' },
      h('div', { class: 'pm-q', text: '무슨 일을 맡길까요?' }),
      h('div', { class: 'pm-tasks' }, TASKS.map(function (x) {
        return h('button', { type: 'button', class: 'pm-task' + (x.k === g.task ? ' on' : ''), text: x.t, onclick: function () { var keep = { goal: g.goal, ctx: g.ctx, example: g.example, audience: g.audience }; G = Object.assign(freshMaker(x.k), keep); HR.refresh(); } });
      })),
      h('div', { class: 'pm-q', text: '무엇을 얻고 싶나요?' }),
      goal,
      h('div', { class: 'pm-who' }, h('span', { text: '대답할 사람' }), personaSel),
      h('div', { class: 'pm-result' }, out, copyBtn,
        h('p', { class: 'pm-hint', text: 'Claude · ChatGPT · Gemini에 그대로 붙여 넣으세요.' })),
      more));
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
      // 1줄: 주요 메뉴 4개 · 2줄: 프롬프트 모음(전체 · 분류별) — 작은 칩으로 따로
      var t = ui.tabs([['', 'AI 잘 쓰는 법'], ['maker', '프롬프트 생성기'], ['edu', 'AI교육 게시판'], ['guide', 'AI 가이드']], sub === 'prompts' ? null : sub, 'ai');
      t.classList.add('ai-tabs'); t.children[0].classList.add('ai-tab-red');
      t.children[1].classList.add('ai-tab-maker');
      t.children[2].classList.add('ai-tab-edu');
      var curKey = sub === 'prompts' ? (cat ? 'prompts/' + P.cats.indexOf(cat) : 'prompts') : '';
      var lib = h('nav', { class: 'ai-lib' + (sub === 'prompts' ? ' on' : ''), 'aria-label': '프롬프트 모음' }, h('span', { class: 'ai-lib-label', text: '프롬프트 모음' }),
        [['prompts', '전체', all.length]].concat(usedCats(P, all).map(function (c) { return ['prompts/' + P.cats.indexOf(c), c, n(c)]; })).map(function (x) {
          return h('a', { href: '#ai/' + x[0], class: 'ai-lib-chip' + (curKey === x[0] ? ' active' : '') }, x[1], h('span', { class: 'ai-lib-n', text: String(x[2]) }));
        }));
      ui.put(view, ui.head('+AI', 'AI 잘 쓰는 법'), t, lib);
      if (sub === 'prompts') prompts(view, P, cat); else if (sub === 'guide') guide(view, P); else if (sub === 'maker') maker(view, P); else if (sub === 'edu') HR.aiEdu.render(view, parts.slice(1)); else basics(view, P);
    }
  });
})();
