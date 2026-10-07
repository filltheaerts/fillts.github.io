/* fillts Influencer — 탐색: 씨드 유튜버 1명 → 컨셉 키워드 고르기 → 비슷한 유튜버 리스트 → 체크해서 디벨롭으로 */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db;
  var V = I.V.find = { input: '', seed: null, kw: [], custom: '', range: 'wide', n: '30', mode: 'similar', maxSubs: '100000', preset: '', busy: '', msg: '', err: false,
    sel: {}, sort: 'score', onlyMail: false, onlyNew: false, ag: '', q: '', open: {}, skipSeen: false,
    cond: { kw: [], custom: '', minSubs: '3000', maxSubs: '100000', days: '90', minGrowth: '0', minCmt: '3', minMedian: '2000', mailOnly: false, n: '40', preset: '', fitOn: true },
    rnd: { cats: ['cleanse', 'skin3040', 'clean', 'premium', 'selfcare'], src: { past: false, list: false }, last: [], pin: [], ex: [], onlyCustom: false, gen: [] } };
  var TABS = [['', '① 비슷한 유튜버 찾기'], ['cond', '② 조건 탐색'], ['random', '③ 랜덤 탐색']];
  var RANGES = [['near', '비슷하게 — 구독자 1/3 ~ 3배'], ['wide', '넓게 — 1/10 ~ 10배'], ['all', '구독자 상관없이']];
  var MODES = [['similar', '비슷한 채널 — 키워드 · 구독자 규모 · 댓글 톤'], ['rising', '라이징 — 구독 상한 아래 · 조회 추세 · 댓글 활발']];
  var MAXSUBS = [['10000', '1만 미만'], ['30000', '3만 미만'], ['50000', '5만 미만'], ['100000', '10만 미만'], ['300000', '30만 미만']];
  // 카테고리 프리셋 — 바인그라피 기준 (포도 클린뷰티 클렌징 젤 · 오일, 3~5만원 프리미엄, 30~55세 「뷰티를 알고 좋은 걸 사는」 여성, 자기 돌봄)
  // 알고리즘 메뉴에서 팀 공용으로 고치면 그 목록이 우선한다
  var PRESETS = [
    { id: 'cleanse', name: '클렌징 · 세안', mode: 'rising', maxSubs: '100000', keywords: ['클렌징 루틴', '약산성 클렌저', '세안법', '클렌징젤 추천', '이중세안'],
      extra: ['클렌징 오일', '모공 클렌징', '저자극 클렌저'], desc: '바인그라피 본품 카테고리 — 세안 · 클렌저 리뷰 · 세안 루틴을 다루는 채널' },
    { id: 'skin3040', name: '3040 스킨케어', mode: 'rising', maxSubs: '100000', keywords: ['30대 스킨케어', '40대 피부관리', '스킨케어 루틴', '피부 장벽', '민감성 피부'],
      extra: ['안티에이징', '기초 화장품 추천', '피부과 루틴'], desc: '핵심 타깃 30~55세 여성 — 피부 고민 · 루틴을 말하는 채널' },
    { id: 'clean', name: '클린뷰티 · 성분', mode: 'rising', maxSubs: '100000', keywords: ['클린뷰티', '화장품 성분', '전성분 분석', '성분 리뷰', '순한 화장품'],
      extra: ['비건 화장품', '화장품 처방'], desc: '「전성분 1번이 포도」 증명형 — 성분 · 처방을 따지는 채널' },
    { id: 'premium', name: '프리미엄 · 내돈내산', mode: 'rising', maxSubs: '100000', keywords: ['내돈내산 화장품', '인생템 스킨케어', '프리미엄 스킨케어', '화장대 소개', '스킨케어 하울'],
      extra: ['백화점 화장품', '선물하기 좋은 화장품'], desc: '3~5만원 프리미엄 — 좋은 걸 골라 사는 소비자에게 닿는 채널' },
    { id: 'selfcare', name: '자기 돌봄 · 루틴', mode: 'rising', maxSubs: '100000', keywords: ['모닝루틴', '나이트루틴', '셀프케어', '자기관리 브이로그', '30대 일상 브이로그'],
      extra: ['미니멀 라이프', '오늘의 루틴'], desc: '「내 피부에 매일 좋은 걸」 — 자기 돌봄 · 감도 있는 일상 채널' },
    { id: 'baby', name: '임신 · 육아', mode: 'rising', maxSubs: '100000', fit: false, keywords: ['육아 브이로그', '임신 브이로그', '신생아', '아기랑 여행', '육아'],
      desc: '엄마 시청자 · 공감 댓글이 많은 육아 채널 (브랜드 적합 조건 없이)' }
  ];
  // 브랜드 적합 단어 — 채널에 하나라도 있어야 「브랜드 적합」 (알고리즘 메뉴 cfg.brandFit으로 덮어쓰기 가능)
  var BRAND_FIT = ['클렌징', '클렌저', '세안', '스킨케어', '피부', '화장품', '성분', '뷰티', '루틴', '피부관리', '기초', '민감성', '약산성', '모공', '각질', '보습', '셀프케어', '자기관리'];
  I.brandFit = function () { return (I.cfg.brandFit && I.cfg.brandFit.length ? I.cfg.brandFit : BRAND_FIT).slice(0, 30); };
  I.PRESETS = PRESETS;
  I.presetList = function () { return I.cfg.presets && I.cfg.presets.length ? I.cfg.presets : PRESETS; };

  function setMsg(t, err) { V.msg = t; V.err = !!err; HR.refresh(); }
  function analyze(input) {
    var seed = String(input || V.input || '').trim();
    if (!seed) return setMsg('씨드 유튜버의 채널 주소 · @핸들 · 영상 주소 · 채널 이름 중 하나를 넣으세요.', true);
    V.input = seed; V.busy = 'analyze'; V.seed = null; V.kw = []; setMsg('채널을 읽는 중입니다… (5 ~ 15초)');
    I.call('infYt', { action: 'analyze', seed: seed }).then(function (r) {
      V.busy = ''; V.seed = r.seed;
      // 기본 선택: 채널 키워드 구절 2개, 없으면 상위 단어 3개
      V.kw = (r.seed.phrases || []).slice(0, 2);
      if (!V.kw.length) V.kw = (r.seed.keywords || []).slice(0, 3);
      setMsg('');
    }).catch(function (e) { V.busy = ''; setMsg(e.message, true); });
  }
  function toggleKw(k) {
    var i = V.kw.indexOf(k);
    if (i >= 0) V.kw.splice(i, 1); else if (V.kw.length < 5) V.kw.push(k); else ui.toast('키워드는 5개까지 고를 수 있습니다.');
    HR.refresh();
  }
  function scan() {
    if (!V.seed) return;
    if (!V.kw.length) return setMsg('컨셉 키워드를 하나 이상 고르세요.', true);
    V.busy = 'scan'; setMsg('「' + V.kw.join(' · ') + '」로 찾고, 후보 채널의 영상 · 댓글을 읽는 중입니다… (20 ~ 60초)');
    I.call('infYt', { action: 'scan', seedId: V.seed.id, seed: V.input, keywords: V.kw, range: V.range, n: +V.n, mode: V.mode, maxSubs: +V.maxSubs, preset: V.preset, skipSeen: V.skipSeen }).then(function (r) {
      V.busy = ''; V.msg = ''; ui.toast(doneText(r));
      HR.go('find/' + r.id);
    }).catch(function (e) { V.busy = ''; setMsg(e.message, true); });
  }
  function doneText(r) {
    var sk = r.skipped || {}, ch = r.cache || {}, t = '후보 ' + r.count + '명을 찾았습니다 · ' + (r.units || 0) + '포인트' + (ch.s || ch.c ? ' (캐시 재사용: 검색 ' + (ch.s || 0) + ' · 채널 ' + (ch.c || 0) + ')' : '') + '.';
    var ex = [sk.known ? '리스트 ' + sk.known : '', sk.seen ? '지난 탐색 ' + sk.seen : '', sk.money ? '재테크 · 절약 ' + sk.money : '', sk.topic ? '제외 주제 ' + sk.topic : '', sk.blocked ? '제외 유튜버 ' + sk.blocked : ''].filter(Boolean);
    if (ex.length) t += ' (뺀 채널: ' + ex.join(' · ') + ')';
    return t;
  }
  function dedupBox() {
    return h('label', { class: 'check', title: '리스트(디벨롭 이후)에 있는 채널은 항상 뺍니다. 이 칸을 켜면 지난 탐색 50건에 나왔던 채널도 뺍니다.' },
      h('input', { type: 'checkbox', checked: V.skipSeen, onchange: function () { V.skipSeen = this.checked; } }), ' 지난 탐색에 나온 채널도 빼기 (리스트 채널은 항상 제외)');
  }

  /* ============ 탐색 첫 화면: ① 비슷한 유튜버 · ② 조건 탐색 · ③ 랜덤 탐색 ============ */
  function home(view, tab) {
    if (tab === 'cond') return condTab(view);
    if (tab === 'random') return randomTab(view);
    var inp = ui.input({ value: V.input, placeholder: '예: https://www.youtube.com/@채널 · @핸들 · 영상 주소 · 채널 이름', maxlength: '300', class: 'grow',
      oninput: function () { V.input = this.value; }, onkeydown: function (e) { if (e.key === 'Enter' && !V.busy) analyze(this.value); } });
    var step1 = ui.panel('1 · 씨드 유튜버', h('span', { class: 'meta', text: I.quotaText() }),
      h('p', { class: 'note', text: '컨셉 · 주제가 딱 맞는 유튜버 한 명을 넣으면, 그 채널의 영상 제목 · 태그 · 댓글을 읽어 컨셉 키워드를 뽑습니다.' }),
      h('div', { class: 'row in-seed-form' }, inp, ui.btn(V.busy === 'analyze' ? '읽는 중…' : '채널 분석', function () { analyze(inp.value); }, V.busy ? 'btn-line' : '')),
      V.msg ? h('p', { class: 'form-msg' + (V.err ? '' : ' ok'), role: 'alert', text: V.msg }) : null);
    var parts = [ui.head('Discover', '탐색'), ui.tabs(TABS, '', 'find'), step1];
    if (V.busy && V.busy === 'analyze') step1.querySelector('button').disabled = true;

    if (V.seed) {
      var sd = V.seed;
      var picked = h('div', { class: 'in-chips' }, V.kw.length ? V.kw.map(function (k) {
        return h('button', { type: 'button', class: 'in-chip on', text: k + ' ×', onclick: function () { toggleKw(k); } });
      }) : h('span', { class: 'meta', text: '아래에서 1 ~ 5개를 고르거나 직접 입력하세요.' }));
      var opt = function (list, cls) {
        return h('div', { class: 'in-chips' }, list.filter(function (k) { return V.kw.indexOf(k) < 0; }).map(function (k) {
          return h('button', { type: 'button', class: 'in-chip ' + (cls || ''), text: '+ ' + k, onclick: function () { toggleKw(k); } });
        }));
      };
      var custom = ui.input({ value: V.custom, maxlength: '30', placeholder: '직접 입력 후 Enter — 예: 민감성 피부, 약산성 클렌저',
        oninput: function () { V.custom = this.value; },
        onkeydown: function (e) { if (e.key === 'Enter' && this.value.trim()) { var k = this.value.trim(); V.custom = ''; if (V.kw.indexOf(k) < 0) toggleKw(k); } } });
      var range = ui.select(RANGES, V.range, { onchange: function () { V.range = this.value; } });
      var n = ui.select([['20', '20명'], ['30', '30명'], ['40', '40명']], V.n, { onchange: function () { V.n = this.value; } });
      var mode = ui.select(MODES, V.mode, { onchange: function () { V.mode = this.value; HR.refresh(); } });
      var maxS = ui.select(MAXSUBS, V.maxSubs, { onchange: function () { V.maxSubs = this.value; } });
      var presets = h('div', { class: 'in-chips' }, I.presetList().map(function (pr) {
        return h('button', { type: 'button', class: 'in-chip' + (V.preset === pr.id ? ' on' : ''), title: pr.desc, text: '카테고리 · ' + pr.name, onclick: function () {
          V.preset = pr.id; V.mode = pr.mode; V.maxSubs = pr.maxSubs; V.n = '40'; V.kw = pr.keywords.slice(0, 5); HR.refresh();
        } });
      }));
      var go = ui.btn(V.busy === 'scan' ? '찾는 중…' : '비슷한 유튜버 찾기', scan);
      if (V.busy) go.disabled = true;
      parts.push(ui.panel('씨드 채널', I.extLink(I.chUrl(sd), '유튜브에서 보기 ↗', 'meta'), seedCard(sd)));
      parts.push(ui.panel('2 · 컨셉 키워드 고르기', h('span', { class: 'meta', text: V.kw.length + ' / 5' }),
        h('p', { class: 'note', text: '이 키워드로 유튜브 영상 · 채널을 검색하고, 나온 채널마다 키워드 일치 · 구독자 규모 · 댓글 톤 · 주제 · 참여율을 씨드와 비교해 점수를 매깁니다. 사람 이름 · 일회성 단어는 빼세요.' }),
        h('div', { class: 'label in-sub', text: '고른 키워드' }), picked,
        (sd.phrases || []).length ? [h('div', { class: 'label in-sub', text: '채널 키워드 · 태그 구절' }), opt(sd.phrases)] : null,
        h('div', { class: 'label in-sub', text: '자주 나온 단어' }), opt((sd.keywords || []).slice(0, 24), 'light'),
        h('div', { class: 'label in-sub', text: '카테고리 프리셋 (알고리즘 + 키워드 한 번에)' }), presets,
        h('div', { class: 'row in-opts' }, ui.field('알고리즘', mode, 'grow'), V.mode === 'rising' ? ui.field('구독자 상한', maxS) : null),
        h('div', { class: 'row in-opts' }, ui.field('직접 추가', custom, 'grow'), V.mode === 'rising' ? null : ui.field('구독자 범위', range), ui.field('깊게 볼 후보 수', n)),
        h('div', { class: 'row in-opts' }, dedupBox()),
        h('div', { class: 'row' }, go, h('span', { class: 'meta', text: '1회 ≈ 20 ~ 60초 · ' + I.quotaText() }))));
    }

    if (!I.loaded.scans && !F.listBusy) fetchScans();
    parts.push(pastPanel(''));
    ui.put(view, parts);
  }

  /* ---------- ② 조건 탐색: 씨드 없이 키워드 + 조건 (기본값 = 바인그라피 브랜드 기준) ---------- */
  function condParams(C) {
    return { action: 'scan', mode: 'cond', minSubs: +C.minSubs, maxSubs: +C.maxSubs, days: +C.days, minGrowth: +C.minGrowth, minCmt: +C.minCmt,
      minMedian: +C.minMedian, minVideos: 10, mailOnly: C.mailOnly, n: +C.n, skipSeen: V.skipSeen,
      fit: C.fitOn ? I.brandFit() : [], fitRequired: !!C.fitOn, beautyOnly: C.beautyOnly !== false, excludeMoney: C.excludeMoney !== false };
  }
  function condRun(kw, opt, label) {
    var C = V.cond;
    V.busy = 'cond'; setMsg('「' + kw.join(' · ') + '」 조건으로 찾는 중입니다… (20 ~ 60초)');
    return I.call('infYt', Object.assign(condParams(C), { keywords: kw, preset: label || C.preset }, opt || {}))
      .then(function (r) { V.busy = ''; V.msg = ''; ui.toast(doneText(r)); HR.go('find/' + r.id); })
      .catch(function (e) { V.busy = ''; setMsg(e.message, true); });
  }
  function kwPicker(list, max, onChange) {
    var custom = ui.input({ maxlength: '30', placeholder: '키워드 입력 후 Enter — 예: 약산성 클렌저, 30대 스킨케어',
      onkeydown: function (e) { if (e.key === 'Enter' && this.value.trim()) { var k = this.value.trim(); if (list.indexOf(k) < 0 && list.length < max) list.push(k); this.value = ''; onChange(); } } });
    return h('div', { class: 'stack sm' },
      h('div', { class: 'in-chips' }, list.length ? list.map(function (k, i) {
        return h('button', { type: 'button', class: 'in-chip on', text: k + ' ×', onclick: function () { list.splice(i, 1); onChange(); } });
      }) : h('span', { class: 'meta', text: '1 ~ ' + max + '개' })), custom);
  }
  function sel(opts, val, set) { return ui.select(opts, val, { onchange: function () { set(this.value); HR.refresh(); } }); }
  // 조건 입력 — 조건 탐색 · 랜덤 탐색이 같이 쓴다
  function condFields() {
    var C = V.cond;
    return [
      h('div', { class: 'row in-opts' },
        ui.field('최소 구독', sel([['0', '제한 없음'], ['1000', '1천'], ['3000', '3천'], ['5000', '5천'], ['10000', '1만'], ['30000', '3만'], ['50000', '5만']], C.minSubs, function (v) { C.minSubs = v; })),
        ui.field('구독 상한 (미만)', sel([['30000', '3만'], ['50000', '5만'], ['100000', '10만'], ['300000', '30만'], ['1000000', '100만'], ['0', '제한 없음']], C.maxSubs, function (v) { C.maxSubs = v; })),
        ui.field('최근 영상 기간', sel([['30', '30일'], ['60', '60일'], ['90', '90일'], ['180', '180일'], ['365', '1년']], C.days, function (v) { C.days = v; })),
        ui.field('중앙 조회 (쓸만한 바닥선)', sel([['0', '상관없음'], ['500', '500회 이상'], ['1000', '1천 이상'], ['2000', '2천 이상'], ['5000', '5천 이상'], ['10000', '1만 이상']], C.minMedian, function (v) { C.minMedian = v; }))),
      h('div', { class: 'row in-opts' },
        ui.field('조회 추세 (최근 5편 ÷ 이전)', sel([['0', '상관없음'], ['1', '1배 이상 (유지 · 증가)'], ['1.2', '1.2배 이상'], ['1.5', '1.5배 이상'], ['2', '2배 이상']], C.minGrowth, function (v) { C.minGrowth = v; })),
        ui.field('영상당 댓글 (중앙)', sel([['0', '상관없음'], ['3', '3개 이상'], ['5', '5개 이상'], ['10', '10개 이상'], ['30', '30개 이상'], ['50', '50개 이상']], C.minCmt, function (v) { C.minCmt = v; })),
        ui.field('깊게 볼 후보 수', sel([['30', '30명'], ['40', '40명']], C.n, function (v) { C.n = v; }))),
      h('div', { class: 'row in-opts' },
        h('label', { class: 'check', title: '채널 제목 · 설명 · 최근 영상에 브랜드 관련 단어가 하나도 없으면 뺍니다. 점수의 20%가 브랜드 적합도입니다.' },
          h('input', { type: 'checkbox', checked: C.fitOn, onchange: function () { C.fitOn = this.checked; HR.refresh(); } }), ' 바인그라피 브랜드 적합 채널만 (클렌징 · 스킨케어 · 성분 · 루틴 …)'),
        h('label', { class: 'check', title: '최근 영상 15편 중 뷰티 콘텐츠 2편 이상이거나 뷰티 협찬이 1편 이상인 채널만 남깁니다 (돈 아끼기 · 일상만 하는 채널 제외)' },
          h('input', { type: 'checkbox', checked: C.beautyOnly !== false, onchange: function () { C.beautyOnly = this.checked; } }), ' 뷰티 콘텐츠 · 협찬 이력 있는 채널만'),
        h('label', { class: 'check', title: '채널 소개에 재테크 · 절약 · 투자가 있거나 최근 영상 20% 이상이 그 주제면 뺍니다. 제외 주제 · 제외 유튜버는 「구조화」 메뉴에서 관리' },
          h('input', { type: 'checkbox', checked: C.excludeMoney !== false, onchange: function () { C.excludeMoney = this.checked; } }), ' 재테크 · 절약 · 투자 채널 빼기'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: C.mailOnly, onchange: function () { C.mailOnly = this.checked; } }), ' 메일 공개한 채널만'),
        dedupBox())
    ];
  }
  function condTab(view) {
    var C = V.cond;
    var presets = h('div', { class: 'in-chips' }, I.presetList().map(function (pr) {
      return h('button', { type: 'button', class: 'in-chip' + (C.preset === pr.id ? ' on' : ''), title: pr.desc, text: pr.name, onclick: function () {
        C.preset = pr.id; C.kw = pr.keywords.slice(0, 5); if (pr.maxSubs) C.maxSubs = String(pr.maxSubs); C.fitOn = pr.fit !== false; HR.refresh();
      } });
    }));
    var go = ui.btn(V.busy === 'cond' ? '찾는 중…' : '조건으로 찾기', function () { if (!C.kw.length) return setMsg('키워드를 하나 이상 넣으세요.', true); condRun(C.kw.slice()); });
    if (V.busy) go.disabled = true;
    ui.put(view, ui.head('Discover', '탐색'), ui.tabs(TABS, 'cond', 'find'),
      ui.panel('조건 탐색 — 씨드 없이 키워드와 조건으로', h('span', { class: 'meta', text: I.quotaText() }),
        h('p', { class: 'note', text: '기준 유튜버 없이, 주제 키워드로 최근 영상을 검색한 뒤 조건에 맞는 채널만 남깁니다. 기본값은 바인그라피 기준(구독 3천 ~ 10만 · 중앙 조회 2천 이상 · 브랜드 적합)입니다. 점수 = ' + condW() + (C.fitOn ? ' → 여기에 브랜드 적합도 20%' : '') + '.' }),
        h('div', { class: 'label in-sub', text: '카테고리 (바인그라피 기준)' }), presets,
        h('div', { class: 'label in-sub', text: '키워드 (1 ~ 5개)' }), kwPicker(C.kw, 5, HR.refresh),
        condFields(),
        V.msg ? h('p', { class: 'form-msg' + (V.err ? '' : ' ok'), role: 'alert', text: V.msg }) : null,
        h('div', { class: 'row' }, go, h('span', { class: 'meta', text: '조건이 엄격하면 결과가 적게 나옵니다 — 기간을 늘리거나 조건을 풀어 보세요.' }))),
      pastPanel(''));
  }
  function condW() {
    var w = ((I.cfg.algos || {}).cond || {}).w || { kw: 35, growth: 30, cmt: 25, reach: 10 };
    var nm = { kw: '키워드', growth: '조회 추세', cmt: '댓글 활발', reach: '구독 대비 조회', tone: '댓글 톤' };
    return Object.keys(w).filter(function (k) { return +w[k]; }).map(function (k) { return nm[k] + ' ' + w[k] + '%'; }).join(' · ');
  }

  /* ---------- ③ 랜덤 탐색: 고른 카테고리에서 키워드 3개를 무작위로 → 겹치지 않는 20명씩 ---------- */
  function rndPool() {
    var R = V.rnd, pool = {};
    var add = function (k, src) { k = String(k || '').trim(); if (k && k.length >= 2 && k.length <= 20) (pool[k] = pool[k] || []).push(src); };
    I.presetList().forEach(function (p) { if (R.cats.indexOf(p.id) >= 0) (p.keywords || []).concat(p.extra || []).forEach(function (k) { add(k, p.name); }); });
    if (R.src.past) I.scans.forEach(function (s) { (s.concept || []).forEach(function (k) { add(k, '지난 탐색'); }); });
    if (R.src.list) I.creators.forEach(function (c) { (c.tags || []).forEach(function (k) { add(k, '리스트'); }); });
    if (R.onlyCustom) pool = {};
    customKw().forEach(function (k) { add(k, '커스텀'); });
    return Object.keys(pool);
  }
  // 커스텀 키워드 — 팀 공용으로 저장 (inf_config/main.randomKw)
  function customKw() { return (I.cfg.randomKw || []).slice(); }
  function saveCustom(list) { return db.doc('inf_config/main').set({ randomKw: list.slice(0, 60), updatedBy: S.mid }, { merge: true }).catch(ui.fail); }
  function addCustom(words) {
    var cur = customKw();
    words.forEach(function (w) { w = String(w || '').trim(); if (w && w.length <= 20 && cur.indexOf(w) < 0) cur.push(w); });
    return saveCustom(cur);
  }
  // 키워드 생성: 기준(📌) · 커스텀 키워드를 브랜드 수식어와 섞어 후보를 만든다
  var MODS = ['추천', '루틴', '리뷰', '30대', '40대', '민감성', '내돈내산', '브이로그', '꿀팁', '비교'];
  function genKw() {
    var R = V.rnd, base = R.pin.concat(customKw()).map(function (k) { return k.split(/\s+/)[0]; });
    if (!base.length) base = ['클렌징', '세안', '스킨케어'];
    var seen = {}, out = [];
    base.forEach(function (b) { MODS.forEach(function (m) { var k = /^\d/.test(m) ? m + ' ' + b : b + ' ' + m; if (!seen[k]) { seen[k] = 1; out.push(k); } }); });
    var pool = rndPool();
    R.gen = pick(out.filter(function (k) { return pool.indexOf(k) < 0; }), 12);
    HR.refresh();
  }
  // 키워드 칩 누르기: 보통 → 📌 기준(매번 포함) → 제외 → 보통
  function cycle(k) {
    var R = V.rnd, ip = R.pin.indexOf(k), ie = R.ex.indexOf(k);
    if (ip >= 0) { R.pin.splice(ip, 1); R.ex.push(k); }
    else if (ie >= 0) R.ex.splice(ie, 1);
    else if (R.pin.length < 2) R.pin.push(k);
    else { R.ex.push(k); ui.toast('기준 키워드는 2개까지 — 이 키워드는 제외로 표시했습니다.'); }
    HR.refresh();
  }
  function pick(arr, n) { var a = arr.slice(), out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; }
  function randomRun() {
    var pool = rndPool();
    if (!pool.length) return setMsg('카테고리를 하나 이상 고르세요.', true);
    var R = V.rnd, pins = R.pin.filter(function (k) { return pool.indexOf(k) >= 0 || customKw().indexOf(k) >= 0; });
    var rest = pool.filter(function (k) { return R.ex.indexOf(k) < 0 && pins.indexOf(k) < 0; });
    if (!rest.length && !pins.length) return setMsg('쓸 수 있는 키워드가 없습니다. 제외를 풀거나 커스텀 키워드를 더하세요.', true);
    var kw = pins.concat(pick(rest, 3 - pins.length));   // 기준(📌) 키워드는 매번 들어가고 나머지를 무작위로
    V.rnd.last = kw; V.skipSeen = true;
    condRun(kw, { n: 40, skipSeen: true }, 'random');
  }
  I.randomRun = randomRun;
  function randomTab(view) {
    var R = V.rnd, pool = rndPool();
    var cats = h('div', { class: 'in-chips' }, I.presetList().map(function (p) {
      var on = R.cats.indexOf(p.id) >= 0;
      return h('button', { type: 'button', class: 'in-chip' + (on ? ' on' : ''), title: (p.keywords || []).join(' · '), text: (on ? '✓ ' : '+ ') + p.name, onclick: function () {
        if (on) R.cats.splice(R.cats.indexOf(p.id), 1); else R.cats.push(p.id); HR.refresh();
      } });
    }));
    var src = function (k, label) { return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: R.src[k], onchange: function () { R.src[k] = this.checked; HR.refresh(); } }), ' ' + label); };
    var go = ui.btn(V.busy === 'cond' ? '찾는 중…' : '🎲 랜덤 20명 탐색', randomRun);
    if (V.busy) go.disabled = true;
    ui.put(view, ui.head('Discover', '탐색'), ui.tabs(TABS, 'random', 'find'),
      ui.panel('랜덤 탐색 — 누를 때마다 다른 키워드 · 새로운 20명', h('span', { class: 'meta', text: I.quotaText() }),
        h('p', { class: 'note', text: '고른 카테고리의 키워드 중 3개를 무작위로 골라 탐색합니다. 리스트에 있거나 지난 탐색에 나왔던 채널은 빼고, 바인그라피와 맞는 쓸만한 채널(구독 10만 미만 · 조회 바닥선 · 브랜드 적합) 상위 20명만 보여 줍니다.' }),
        h('div', { class: 'label in-sub', text: '1 · 카테고리 (여러 개 선택)' }), cats,
        h('div', { class: 'row in-opts' }, src('past', '지난 탐색 키워드도 섞기'), src('list', '리스트 태그도 섞기')),
        h('div', { class: 'label in-sub', text: '커스텀 키워드 — 입력 후 Enter (쉼표로 여러 개) · 팀 공용 저장' }),
        h('div', { class: 'row in-seed-form' }, ui.input({ maxlength: '120', class: 'grow', placeholder: '예: 포도 화장품, 클렌징 젤 리뷰, 30대 피부 고민',
          onkeydown: function (e) { if (e.key === 'Enter' && this.value.trim()) { var v = this.value; this.value = ''; addCustom(v.split(/[,，]/)); } } }),
          ui.btn('✨ 키워드 생성', genKw, 'btn-line btn-sm'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: R.onlyCustom, onchange: function () { R.onlyCustom = this.checked; HR.refresh(); } }), ' 커스텀 키워드만 쓰기')),
        customKw().length ? h('div', { class: 'in-chips' }, customKw().map(function (k) {
          return h('button', { type: 'button', class: 'in-chip in-cust', title: '× 누르면 커스텀에서 지움', text: k + ' ×', onclick: function () { saveCustom(customKw().filter(function (x) { return x !== k; })); } });
        })) : null,
        R.gen.length ? h('div', { class: 'in-chips in-gen' }, h('span', { class: 'meta', text: '생성된 후보 — 누르면 커스텀에 추가:' }), R.gen.map(function (k) {
          return h('button', { type: 'button', class: 'in-chip light', text: '+ ' + k, onclick: function () { R.gen = R.gen.filter(function (x) { return x !== k; }); addCustom([k]); HR.refresh(); } });
        })) : null,
        h('div', { class: 'label in-sub', text: '키워드 풀 — 누르면 📌 기준(매번 포함, 2개까지) → 제외 → 보통' }),
        h('div', { class: 'in-chips in-pool' }, pool.map(function (k) {
          var pin = R.pin.indexOf(k) >= 0, ex = R.ex.indexOf(k) >= 0;
          return h('button', { type: 'button', class: 'in-chip ' + (pin ? 'on' : ex ? 'in-ex' : 'light') + (R.last.indexOf(k) >= 0 && !pin ? ' in-last' : ''), text: (pin ? '📌 ' : '') + k, onclick: function () { cycle(k); } });
        })),
        h('p', { class: 'meta', text: '키워드 풀 ' + pool.length + '개 · 기준 ' + R.pin.length + ' · 제외 ' + R.ex.length + (R.last.length ? ' · 지난번 고른 키워드: ' + R.last.join(' · ') : '') }),
        h('div', { class: 'label in-sub', text: '2 · 조건 (조건 탐색 탭과 같이 바뀝니다)' }),
        condFields(),
        V.msg ? h('p', { class: 'form-msg' + (V.err ? '' : ' ok'), role: 'alert', text: V.msg }) : null,
        h('div', { class: 'row' }, go, h('span', { class: 'meta', text: '1회 ≈ 20 ~ 60초 · 결과 화면에서 「다음 20명」으로 계속 돌릴 수 있습니다.' }))),
      pastPanel(''));
  }

  // 결과 화면에서 바로 고쳐 다시 찾기 — 씨드 유튜버 · 키워드를 바꾸면 그 값으로 새 탐색 (원래 결과는 그대로 남는다)
  V.re = {};
  function reSearch(s) {
    var R = V.re[s.id] || (V.re[s.id] = { kw: (s.concept || []).slice(), seed: s.seed ? ((s.opts || {}).input || s.seed.handle || s.seed.id) : '' });
    var seedIn = s.seed ? ui.input({ value: R.seed, maxlength: '300', placeholder: '씨드 유튜버 — 채널 주소 · @핸들 · 이름', class: 'grow', oninput: function () { R.seed = this.value; } }) : null;
    var sugg = s.seed ? ((s.seed.phrases || []).concat(s.seed.keywords || [])).filter(function (k) { return R.kw.indexOf(k) < 0; }).slice(0, 16) : [];
    var go = ui.btn(V.busy ? '찾는 중…' : '이 씨드 · 키워드로 다시 찾기', function () {
      if (!R.kw.length) return setMsg('키워드를 하나 이상 넣으세요.', true);
      if (!s.seed) return condRun(R.kw.slice(), null, (s.opts || {}).preset === 'random' ? 'random' : '');
      var o = s.opts || {};
      V.busy = 'scan'; setMsg('「' + R.seed + '」 · 「' + R.kw.join(' · ') + '」로 다시 찾는 중입니다… (20 ~ 60초)');
      I.call('infYt', { action: 'scan', mode: s.mode || 'similar', seed: R.seed.trim(), keywords: R.kw, range: o.range || 'wide', n: o.n || 30, maxSubs: o.maxSubs || 0, preset: o.preset || '', skipSeen: V.skipSeen })
        .then(function (r) { V.busy = ''; V.msg = ''; ui.toast(doneText(r)); HR.go('find/' + r.id); })
        .catch(function (e) { V.busy = ''; setMsg(e.message, true); });
    }, 'btn-sm');
    if (V.busy) go.disabled = true;
    return h('div', { class: 'in-research' },
      h('div', { class: 'label in-sub', text: '컨셉 키워드 — 고쳐서 다시 찾기 (× 빼기 · 입력 후 Enter 더하기)' }),
      kwPicker(R.kw, 5, HR.refresh),
      sugg.length ? h('div', { class: 'in-chips' }, sugg.map(function (k) { return h('button', { type: 'button', class: 'in-chip light', text: '+ ' + k, onclick: function () { if (R.kw.length < 5) { R.kw.push(k); HR.refresh(); } else ui.toast('키워드는 5개까지입니다.'); } }); })) : null,
      seedIn ? h('div', { class: 'row in-opts in-seed-form' }, h('span', { class: 'label', text: '씨드 유튜버' }), seedIn) : null,
      h('div', { class: 'row in-opts' }, go, dedupBox()),
      V.msg ? h('p', { class: 'form-msg' + (V.err ? '' : ' ok'), role: 'alert', text: V.msg }) : null);
  }
  function condCard(s) {
    var c = s.cond || {};
    return h('p', { class: 'meta', text: '구독 ' + I.cnt(c.minSubs || 0) + ' ~ ' + (c.maxSubs ? I.cnt(c.maxSubs) + ' 미만' : '제한 없음') + ' · 최근 ' + (c.days || 90) + '일 영상 · 조회 추세 ' + (c.minGrowth ? c.minGrowth + '배 이상' : '무관')
      + ' · 영상당 댓글 ' + (c.minCmt ? c.minCmt + '개 이상' : '무관') + (c.mailOnly ? ' · 메일 공개만' : '') + (s.skipped ? ' · 중복 제외 ' + ((s.skipped.known || 0) + (s.skipped.seen || 0)) + '명' : '') });
  }
  function seedCard(c) {
    return h('div', { class: 'in-seed' }, I.thumb(c, 'lg'),
      h('div', { class: 'grow stack sm' },
        h('div', { class: 'in-seed-title' }, h('b', { text: c.title }), c.handle ? h('span', { class: 'meta', text: ' ' + c.handle }) : null, ' ', I.ytBtn(c)),
        ui.kv([['구독자', I.cnt(c.subs)], ['최근 중앙 조회수', I.cnt(c.median)], ['참여율', I.pct(c.engage)], ['쇼츠 비중', I.pct(c.shorts)], ['최근 업로드', fmt.dot(c.last)], ['메일', c.email || '설명란에 없음']], 'kv in-kv'),
        h('div', null, h('span', { class: 'label', text: '댓글 톤 ' }), I.chips(I.toneTags(c.tone), 'light')),
        (c.sample || []).length ? h('ul', { class: 'in-cmts' }, c.sample.slice(0, 3).map(function (t) { return h('li', { text: t }); })) : null));
  }

  /* ============ 탐색 결과 ============ */
  function sorted(s) {
    var k = V.sort, list = (s.cands || []).slice();
    var key = { score: function (c) { return c.score; }, subs: function (c) { return c.subs; }, median: function (c) { return c.median; },
      tone: function (c) { return c.parts ? c.parts.tone : 0; }, engage: function (c) { return c.engage; },
      growth: function (c) { return c.growth || 0; }, cmt: function (c) { return c.cmtAvg != null ? c.cmtAvg : c.cmtMed || 0; },
      title: function (c) { return (c.title || '').toLowerCase(); }, gap: function (c) { return c.gapDays || (c.perWeek ? 7 / c.perWeek : 9999); },
      beauty: function (c) { var b = c.beauty || {}; return (b.adBeauty || 0) * 100 + (b.n || 0) + (b.self ? 50 : 0); } }[k] || function (c) { return c.score; };
    var dir = V.dir || -1;
    var q = V.q.trim().toLowerCase();
    return list.filter(function (c) {
      if (V.onlyMail && !c.email) return false;
      if (V.onlyNew && I.creator(c.id)) return false;
      if (V.onlyBeauty && !I.beauty(c).on) return false;
      if (V.hideMoney !== false && I.isMoney(c)) return false;
      if (I.isBlocked(c)) return false;
      if (V.ag) { var ap = I.agency(c).p; if (V.ag === 'agency' ? ap === 0 : V.ag === 'a100' ? ap !== 100 : V.ag === 'a50' ? ap !== 50 : ap !== 0) return false; }
      if (q && (c.title + ' ' + c.handle + ' ' + (c.keywords || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { var x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  }
  // 결과 머리줄 — 누르면 그 기준으로 정렬, 한 번 더 누르면 반대로 (▼ 내림 · ▲ 오름)
  function sortHead(key, label) {
    var on = V.sort === key;
    return h('button', { type: 'button', class: 'in-sorth' + (on ? ' on' : ''), title: '눌러서 정렬 — 한 번 더 누르면 반대로', text: label + (on ? ((V.dir || -1) < 0 ? ' ▼' : ' ▲') : ''),
      onclick: function () { if (V.sort === key) V.dir = -(V.dir || -1); else { V.sort = key; V.dir = key === 'title' || key === 'gap' ? 1 : -1; } HR.refresh(); } });
  }
  // 소속 / 개인 필터 (메일 도메인 · 설명란 회사 정보 기준)
  var WNAME = { kw: '키워드 일치', sub: '구독자 규모', tone: '댓글 톤', topic: '주제', eng: '참여율', growth: '조회 추세', cmt: '댓글 활발', reach: '구독 대비 조회' };
  var WDEF = { similar: { kw: 32, sub: 22, tone: 20, topic: 14, eng: 12 }, rising: { kw: 30, growth: 25, cmt: 20, reach: 15, tone: 10 }, cond: { kw: 35, growth: 30, cmt: 25, reach: 10 } };
  function wText(s, mode) { var w = s.weights || WDEF[mode]; return Object.keys(w).filter(function (k) { return +w[k]; }).sort(function (a, b) { return w[b] - w[a]; }).map(function (k) { return WNAME[k] + ' ' + w[k] + '%'; }).join(' · '); }
  function agBar(s) {
    var n = { all: 0, a100: 0, a50: 0, solo: 0 };
    (s.cands || []).forEach(function (c) { var p = I.agency(c).p; n.all++; n[p === 100 ? 'a100' : p === 50 ? 'a50' : 'solo']++; });
    var opts = [['', '전체 ' + n.all], ['agency', '소속 유튜버 ' + (n.a100 + n.a50)], ['a100', '소속 확실 100% · ' + n.a100], ['a50', '소속 애매 50% · ' + n.a50], ['solo', '개인 유튜버 ' + n.solo]];
    return h('div', { class: 'row in-agbar' }, h('span', { class: 'label', text: '소속 구분' }),
      h('div', { class: 'in-seg' }, opts.map(function (o) {
        return h('button', { type: 'button', class: V.ag === o[0] ? 'active' : '', text: o[1], onclick: function () { V.ag = o[0]; HR.refresh(); } });
      })),
      h('span', { class: 'meta', text: '100% = MCN · 소속사 이름 / 회사 도메인 메일 / 설명란 회사 정보 · 50% = 개인 메일이 아닌 도메인이나 「비즈니스 · 광고 문의」 담당자 표현만 있음' }));
  }
  function result(view, s) {
    var sel = V.sel[s.id] || (V.sel[s.id] = {});
    var isRandom = (s.opts || {}).preset === 'random';
    var list = sorted(s);
    if (isRandom) list = list.slice(0, 20);   // 랜덤 탐색은 20명씩
    var nSel = Object.keys(sel).filter(function (k) { return sel[k]; }).length;
    var rising = s.mode === 'rising' || s.mode === 'cond';
    var seg = h('div', { class: 'in-seg' }, (rising ? [['score', '점수'], ['growth', '조회 추세'], ['cmt', '댓글 활발'], ['subs', '구독자'], ['tone', '댓글 톤']]
      : [['score', '점수'], ['subs', '구독자'], ['median', '조회수'], ['tone', '댓글 톤'], ['engage', '참여율']]).map(function (x) {
      return h('button', { type: 'button', class: V.sort === x[0] ? 'active' : '', text: x[1], onclick: function () { V.sort = x[0]; HR.refresh(); } });
    }));
    var chk = function (label, key) { return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: V[key], onchange: function () { V[key] = this.checked; HR.refresh(); } }), ' ' + label); };
    var q = ui.input({ value: V.q, placeholder: '채널 · 키워드 검색', onchange: function () { V.q = this.value; HR.refresh(); } });

    // 한 줄 카드 목록 — 가로 스크롤 없이: 점수 → 채널(소속 · 메일 · 상태) → 핵심 지표 3개 → 찾은 이유 2줄
    var short = function (t) { return String(t).replace(/^컨셉 키워드 /, '').replace(/ — 구독자 밖으로 노출 중$/, '').replace(/ · 씨드와 겹치는 말: .*$/, ''); };
    var stat = function (k, v, cls) { return h('div', { class: 'in-stat' + (cls ? ' ' + cls : '') }, h('span', { class: 'in-stat-k', text: k }), h('b', { text: v })); };
    var rows = [];
    list.forEach(function (c) {
      var inP = I.creator(c.id), open = V.open[c.id], ag = I.agency(c);
      var cb = h('input', { type: 'checkbox', checked: !!sel[c.id] || !!inP, disabled: !!inP, 'aria-label': c.title + ' 선택',
        onclick: function (e) { e.stopPropagation(); }, onchange: function () { sel[c.id] = this.checked; HR.refresh(); } });
      var kws = (c.matched || []).concat((c.shared || []).filter(function (w) { return (c.matched || []).indexOf(w) < 0; })).slice(0, 5);
      // 구독 / 조회 / 댓글수 / 톤 일치 / 주기
      var stats = [stat('구독', I.cnt(c.subs)),
        stat('조회' + (c.growth >= 1.2 ? ' ↑' + c.growth + '배' : ''), I.cnt(c.median), c.growth >= 1.2 ? 'red' : ''),
        stat('댓글수', c.cmtAvg != null ? I.cnt(c.cmtAvg) : c.cmtMed != null ? I.cnt(c.cmtMed) : '—'),
        stat('톤 일치', s.seed && c.tone ? Math.round(((c.parts || {}).tone || 0) * 100) + '%' : '—'),
        stat('주기', I.gap(c))];
      rows.push(h('div', { class: 'in-row clickable' + (open ? ' in-open' : '') + (sel[c.id] ? ' in-sel' : ''), tabindex: '0',
        onclick: function () { V.open[c.id] = !V.open[c.id]; HR.refresh(); }, onkeydown: function (e) { if (e.key === 'Enter') { V.open[c.id] = !V.open[c.id]; HR.refresh(); } } },
        h('div', { class: 'in-r-cb' }, cb),
        h('div', { class: 'in-r-score' }, h('b', { text: String(c.score || 0) }), h('span', { class: 'in-score-track' }, (function () { var f = h('span', { class: 'in-score-fill' }); f.style.width = Math.min(100, c.score || 0) + '%'; return f; })())),
        h('div', { class: 'in-r-ch' }, I.thumb(c, 'sm'), h('div', { class: 'in-r-t' },
          h('div', { class: 'in-r-nm' }, h('span', { class: 'in-r-name', title: c.title + (c.handle ? ' ' + c.handle : ''), text: c.title.length > 14 ? c.title.slice(0, 13) + '…' : c.title }), I.ytBtn(c)),
          h('div', { class: 'in-r-tags' }, I.inactiveTag(c), I.beautyTag(c), I.agencyTag(c), I.mailTag(c.email), inP ? I.stTag(inP.stage) : null,
            h('span', { class: 'meta', text: c.last ? '최근 ' + fmt.dot(c.last).slice(2) : '' })),
          I.noteEl(c))),
        h('div', { class: 'in-r-stats' }, stats),
        h('div', { class: 'in-r-why' }, kws.length ? kws.map(function (k, i) { return h('span', { class: 'in-chip ' + (i < (c.matched || []).length ? 'on' : 'light'), text: k }); }) : h('span', { class: 'meta', text: '키워드 겹침 적음' }))));
      if (open) rows.push(h('div', { class: 'in-row-detail' }, h('div', { class: 'in-r-agwhy meta', text: '소속 근거: ' + ag.why }), candDetail(c, s, inP)));
    });
    var avail = list.filter(function (c) { return !I.creator(c.id); });
    var allOn = avail.length > 0 && avail.every(function (c) { return sel[c.id]; });
    var all = h('input', { type: 'checkbox', checked: allOn, 'aria-label': '보이는 후보 전체 선택', title: '보이는 후보 전체 선택 / 해제',
      onchange: function () { var on = this.checked; avail.forEach(function (c) { sel[c.id] = on; }); HR.refresh(); } });
    var table = h('div', { class: 'in-rows' },
      h('div', { class: 'in-row in-row-head' }, h('label', { class: 'in-r-cb in-all' }, all, h('span', { text: '전체' })), h('div', { class: 'in-r-score' }, sortHead('score', '점수')), h('div', { class: 'in-r-ch in-hcells' }, sortHead('title', '채널'), sortHead('beauty', '뷰티')),
        h('div', { class: 'in-r-stats in-hstats' }, sortHead('subs', '구독'), sortHead('median', '조회'), sortHead('cmt', '댓글수'), sortHead('tone', '톤'), sortHead('gap', '주기')),
        h('div', { class: 'in-r-why in-hcells' }, sortHead('growth', '조회 추세'), h('span', { class: 'meta', text: '· 찾은 이유 (행을 누르면 전체)' }))),
      rows.length ? rows : h('p', { class: 'empty', text: '조건에 맞는 후보가 없습니다.' }));

    var bar = h('div', { class: 'in-actionbar' + (nSel ? ' show' : '') },
      h('span', { class: 'strong', text: nSel + '명 선택' }),
      ui.btn('디벨롭으로 추가', function () {
        var picks = (s.cands || []).filter(function (c) { return sel[c.id]; });
        I.addToPipe(picks, s).then(function (r) {
          V.sel[s.id] = {}; ui.toast(r.n + '명을 디벨롭에 추가했습니다.' + (r.skip ? ' (이미 있는 ' + r.skip + '명 제외)' : ''));
        }).catch(ui.fail);
      }, 'btn-sm'),
      ui.btn('선택 해제', function () { V.sel[s.id] = {}; HR.refresh(); }, 'btn-line btn-sm'));

    ui.put(view,
      ui.head('Discover · ' + fmt.ts(s.at), I.scanTitle(s), h('div', { class: 'row' },
        isRandom ? ui.btn(V.busy ? '찾는 중…' : '다음 20명 (다른 키워드)', function () { if (!V.busy) randomRun(); }, 'btn-sm') : null,
        ui.btn('← 탐색', function () { HR.go(isRandom ? 'find/random' : s.mode === 'cond' ? 'find/cond' : 'find'); }, 'btn-line btn-sm'))),
      ui.panel(s.seed ? '씨드 · 컨셉' : '조건 · 키워드', h('span', { class: 'meta', text: '검색 ' + (s.queries || []).join(' / ') + ' · ' + HR.name(s.by) }),
        s.seed ? seedCard(s.seed) : condCard(s), h('div', { class: 'label in-sub', text: '컨셉 키워드' }), s.mode === 'rising' ? h('p', { class: 'meta', text: '알고리즘: 라이징 — 구독 ' + I.cnt((s.opts || {}).maxSubs || 100000) + ' 미만 · 조회 추세 · 댓글 활발' + ((s.opts || {}).preset === 'baby' ? ' · 카테고리 임신 · 육아' : '') }) : null, reSearch(s)),
      agBar(s),
      h('div', { class: 'toolbar in-toolbar' }, seg, chk('메일 있는 채널만', 'onlyMail'), chk('파이프라인에 없는 채널만', 'onlyNew'), chk('뷰티 이력 있는 채널만', 'onlyBeauty'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: V.hideMoney !== false, onchange: function () { V.hideMoney = this.checked; HR.refresh(); } }), ' 재테크 · 절약 숨기기'), q,
        h('span', { class: 'meta grow in-right', text: list.length + ' / ' + (s.cands || []).length + '명 · 행을 누르면 자세히' }),
        ui.btn('메일 있는 채널 모두 선택', function () { list.forEach(function (c) { if (c.email && !I.creator(c.id)) sel[c.id] = true; }); HR.refresh(); }, 'btn-line btn-sm')),
      table,
      rising ? h('p', { class: 'note', text: (s.mode === 'cond' ? '조건 탐색 점수 = ' + wText(s, 'cond') + ((s.cond || {}).fit ? ' → 여기에 브랜드 적합도 20%' : '') : '라이징 점수 = ' + wText(s, 'rising')) + '. 최근 ' + (s.days || 90) + '일 영상 검색 · 구독 ' + I.cnt(s.minSubs || 1000) + ' ~ ' + I.cnt((s.opts || {}).maxSubs || 100000) + ' 미만. 기준은 「알고리즘」 메뉴에서 바꿉니다.' }) :
      h('p', { class: 'note', text: '점수 = 키워드 일치 32% · 구독자 규모 22% · 댓글 톤 20% · 주제 14% · 참여율(중앙 조회수 ÷ 구독자) 12%. 댓글은 최근 영상 2편의 상위 댓글 기준입니다.' }),
      (s.by === S.mid || S.isAdmin) ? h('div', { class: 'row' }, ui.confirmBtn('이 탐색 기록 삭제', function () { db.doc('inf_scans/' + s.id).delete().then(function () { HR.go('find'); }).catch(ui.fail); })) : null,
      pastPanel(s.id),
      bar);
  }

  function candDetail(c, s, inP) {
    var p = c.parts || {};
    var parts = s.mode === 'rising' ? [['키워드', p.kw], ['조회 추세', p.growth], ['댓글 활발', p.cmt], ['구독 대비 조회', p.reach], ['댓글 톤', p.tone]]
      : [['키워드', p.kw], ['구독자', p.sub], ['댓글 톤', p.tone], ['주제', p.topic], ['참여율', p.eng]];
    return h('div', { class: 'in-cand' },
      h('div', { class: 'in-cand-col' },
        h('div', { class: 'label', text: '채널 소개' }), h('p', { class: 'in-desc', text: c.desc || '(설명 없음)' }),
        h('div', { class: 'row in-links' }, I.extLink(I.chUrl(c), '채널 열기 ↗'), c.email ? h('span', { class: 'meta', text: c.email }) : null,
          c.insta ? I.extLink('https://instagram.com/' + c.insta, '@' + c.insta + ' ↗') : null),
        h('div', { class: 'label', text: '최근 영상' }),
        h('ul', { class: 'in-vids' }, (c.recent || []).map(function (v) { return h('li', null, I.extLink(I.vidUrl(v.id), v.title), h('span', { class: 'meta', text: ' ' + I.cnt(v.views) + '회 · ' + fmt.dot(v.at).slice(2) })); })),
        h('div', { class: 'row in-ag-line' }, I.agencyTag(c), h('span', { class: 'meta', text: I.agency(c).why })),
        (c.reason || []).length ? [h('div', { class: 'label', text: '찾은 이유' }), h('ul', { class: 'in-reason' }, c.reason.map(function (r) { return h('li', { text: r }); }))] : null,
        h('div', { class: 'label', text: '점수 구성' }),
        h('div', { class: 'in-parts' }, parts.map(function (x) { return h('span', { class: 'in-chip light', text: x[0] + ' ' + Math.round((x[1] || 0) * 100) }); })),
        c.via && c.via.length ? h('p', { class: 'meta', text: '검색 「' + c.via.join('」 「') + '」에서 발견' }) : null),
      h('div', { class: 'in-cand-col' },
        h('div', { class: 'label', text: '댓글 톤 — 씨드와 비교' }), I.toneBars(c.tone, s.seed && s.seed.tone, s.seed && s.seed.title),
        (c.sample || []).length ? h('ul', { class: 'in-cmts' }, c.sample.slice(0, 4).map(function (t) { return h('li', { text: t }); })) : null,
        h('div', { class: 'row in-cand-act' },
          inP ? ui.btn('파이프라인에서 열기', function () { HR.go('c/' + c.id); }, 'btn-sm')
            : ui.btn('디벨롭으로 추가', function () { I.addToPipe([c], s).then(function () { ui.toast(c.title + ' — 디벨롭에 추가'); }).catch(ui.fail); }, 'btn-sm'),
          ui.btn('이 채널을 씨드로 다시 찾기', function () { V.input = c.id; HR.go('find'); analyze(c.id); }, 'btn-line btn-sm'),
          ui.confirmBtn('제외 유튜버로', function () { I.blockChannel(c, '탐색 결과에서 제외'); }, 'btn-line btn-sm danger'))));
  }

  /* ============ 지난 탐색 — 서버에서 다시 읽어 와 보여 준다 ============ */
  var F = { busy: {}, err: {}, listBusy: false, listErr: '' };
  function upsert(sc) {
    var i = I.scans.map(function (x) { return x.id; }).indexOf(sc.id);
    if (i >= 0) I.scans[i] = sc; else I.scans.push(sc);
    I.scans.sort(function (a, b) { return I.ms(b.at) - I.ms(a.at); });
  }
  function fetchScan(id) {
    F.busy[id] = true; F.err[id] = ''; HR.refresh();
    return db.doc('inf_scans/' + id).get().then(function (d) {
      F.busy[id] = false;
      if (d.exists) upsert(Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' })));
      else F.err[id] = '이 탐색 기록이 삭제되었습니다.';
      HR.refresh();
    }).catch(function (e) { F.busy[id] = false; F.err[id] = '불러오지 못했습니다 (' + (e.code || e.message) + ').'; console.warn(e); HR.refresh(); });
  }
  function fetchScans() {
    F.listBusy = true; F.listErr = '';
    return db.collection('inf_scans').orderBy('at', 'desc').limit(30).get().then(function (snap) {
      F.listBusy = false; I.loaded.scans = true;
      snap.docs.forEach(function (d) { upsert(Object.assign({ id: d.id }, d.data({ serverTimestamps: 'estimate' }))); });
      HR.refresh();
    }).catch(function (e) { F.listBusy = false; F.listErr = '지난 탐색을 불러오지 못했습니다 (' + (e.code || e.message) + ').'; console.warn(e); HR.refresh(); });
  }
  function openScan(id) { fetchScan(id); HR.go('find/' + id); }
  function pastPanel(cur) {
    var list = I.scans;
    return ui.panel('지난 탐색', h('div', { class: 'row' }, h('span', { class: 'meta', text: list.length + '건' }), ui.btn(F.listBusy ? '불러오는 중…' : '새로고침', fetchScans, 'btn-line btn-xs')),
      F.listErr ? h('p', { class: 'form-msg', text: F.listErr }) : null,
      list.length ? h('ul', { class: 'list in-scan-list' }, list.map(function (s) {
        var picked = (s.cands || []).filter(function (c) { return I.creator(c.id); }).length;
        return h('li', { class: 'clickable' + (s.id === cur ? ' in-cur' : ''), tabindex: '0', onclick: function () { openScan(s.id); }, onkeydown: function (e) { if (e.key === 'Enter') openScan(s.id); } },
          I.thumb(s.seed || { title: s.mode === 'cond' ? ((s.opts || {}).preset === 'random' ? '랜' : '조') : '?' }), h('div', { class: 'grow' }, h('div', { class: 'strong', text: I.scanTitle(s) + (s.id === cur ? ' — 지금 보는 중' : '') }),
            h('div', { class: 'meta', text: (s.mode === 'rising' ? '라이징 · ' : '') + (s.concept || []).join(' · ') + ' — 후보 ' + (s.cands || []).length + '명 · 파이프라인 ' + picked + '명' })),
          h('span', { class: 'meta', text: HR.name(s.by) + ' · ' + fmt.ts(s.at) }));
      })) : ui.empty(F.listBusy || !I.loaded.scans ? '불러오는 중…' : '아직 탐색 기록이 없습니다. 위에서 씨드 유튜버를 넣어 시작하세요.'));
  }

  HR.register('find', { render: function (view, parts) {
    if (parts[0] === 'cond' || parts[0] === 'random') return home(view, parts[0]);
    if (parts[0]) {
      var s = I.scan(parts[0]), id = parts[0];
      if (!s) {
        if (!F.busy[id] && !F.err[id]) fetchScan(id);
        return ui.put(view, ui.head('Discover', '탐색 결과'), F.err[id] ? h('p', { class: 'form-msg', text: F.err[id] }) : ui.empty('저장된 탐색 결과를 불러오는 중…'),
          F.err[id] ? ui.btn('다시 불러오기', function () { fetchScan(id); }, 'btn-sm') : null, pastPanel(id));
      }
      return result(view, s);
    }
    home(view, '');
  } });
  I.analyze = analyze;
})();
