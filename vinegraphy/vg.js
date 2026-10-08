/* VINEGRAPHY Brand Asset — 브랜드 · 제품 사양 · 상세페이지 · 패키지 문안 · 검수
   데이터: hr_plan/brand (공지 › 01 바인그라피와 같은 문서 — 한쪽을 고치면 양쪽에 반영) · hr_plan/vinegraphy
   읽기 전용 화면. 수정은 hr_backend/data/*.json → seed_hr_plan.py (화면은 15초 안에 새 값을 읽는다) */
(function () {
  'use strict';
  var HR = window.HR, ui = HR.ui, h = ui.h, db = HR.db;

  function doc(id) {
    var key = 'hr_plan_' + id, c = HR.cache[key];
    if (c && !c.loading && Date.now() - c.at > 15000) c.at = 0;
    return HR.load(key, function () { return db.doc('hr_plan/' + id).get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : null; }); });
  }
  function need(view, id) {
    var d = doc(id); if (d) return d;
    var c = HR.cache['hr_plan_' + id];
    ui.put(view, ui.empty(c && c.at && !c.loading ? '아직 내용이 없습니다. (hr_plan/' + id + ')' : '불러오는 중…'));
    return null;
  }
  // 제품 묶음: hr_plan/vinegraphy.products[id] (예전 구조 = 최상위에 바로 → 클렌징 젤로 읽는다)
  function prod(view, id) {
    var V = need(view, 'vinegraphy'); if (!V) return null;
    var G = V.products ? V.products[id] : Object.assign({ name: '클렌징 젤' }, V);
    if (!G) { ui.put(view, ui.empty('이 제품의 내용이 아직 없습니다.')); return null; }
    return { V: V, G: G };
  }
  function lines(t) { return String(t || '').split('\n').map(function (x, i) { return [i ? h('br') : null, x]; }); }
  function copyBtn(text, label) {
    return h('button', { type: 'button', class: 'btn btn-line btn-xs', text: label || '복사', onclick: function () {
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { ui.toast('복사했습니다.'); }, function () { ui.toast('복사하지 못했습니다. 직접 선택해 주세요.'); });
    } });
  }
  function ext(u, t) { return /^\//.test(u) ? h('a', { href: u, text: t }) : h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: t }); }
  function head(view, label, title, V) {
    ui.put(view, ui.head(label, title, V && V.asOf ? h('span', { class: 'meta', text: '기준 ' + V.asOf.replace(/-/g, '.') }) : null));
  }

  /* ---------- 브랜드 — 공지 › 01 바인그라피 원본 그대로 ---------- */
  function brand(view) {
    var V = doc('vinegraphy');   // 두 문서를 함께 불러온다
    var B = need(view, 'brand'); if (!B) return;
    var sec = function (label, x, body) { return ui.panel(label + ' · ' + x.title, null, x.lead ? h('p', { class: 'muted small', text: x.lead }) : null, body, x.note ? h('p', { class: 'br-note', text: x.note }) : null); };
    ui.put(view,
      h('section', { class: 'br-hero' },
        h('div', { class: 'br-kicker', text: B.kicker }),
        h('div', { class: 'br-mission-label', text: 'OUR MISSION' }),
        h('h2', { class: 'br-mission', text: B.mission }),
        h('p', { class: 'br-lead', text: B.missionLead }),
        h('p', { class: 'br-who', text: B.who })),
      h('div', { class: 'br-moments' }, B.moments.map(function (x) {
        return h('div', { class: 'br-moment' }, h('div', { class: 'br-m-head' }, h('span', { class: 'br-no', text: x.no }), h('b', { text: x.k })), h('h3', { text: x.t }), h('p', { text: x.d }));
      })),
      h('p', { class: 'br-after', text: B.after }),
      ui.panel('Definition · ' + B.definition.title, null, h('p', { class: 'br-def-lead', text: B.definition.lead }),
        h('div', { class: 'br-def' }, B.definition.items.map(function (x) { return h('div', { class: 'br-def-i' }, h('span', { class: 'br-k', text: x.k }), h('b', { text: x.v }), h('p', { text: x.d })); })),
        B.definition.quote ? h('blockquote', { class: 'br-quote', text: B.definition.quote }) : null),
      sec('Her', B.her, [h('div', { class: 'br-traits' }, h('span', { class: 'br-traits-lead', text: B.her.target }), B.her.traits.map(function (t) { return h('span', { class: 'chip', text: t }); })),
        h('div', { class: 'br-points' }, B.her.points.map(function (x) { return h('div', null, h('b', { text: x.k }), h('p', { text: x.d })); }))]),
      sec('Tasks', B.tasks, h('div', { class: 'br-tasks' }, B.tasks.items.map(function (x) { return h('div', { class: 'br-task' }, h('span', { class: 'br-e', text: x.e }), h('b', { text: x.k }), h('p', { text: x.d })); }))),
      sec('Words', B.words, h('div', { class: 'br-words' }, B.words.items.map(function (w) { return h('span', { text: w }); }))),
      sec('Stages', B.stages, h('ol', { class: 'br-stages' }, B.stages.items.map(function (x, i) { return h('li', null, h('span', { class: 'br-no', text: ('0' + (i + 1)).slice(-2) }), h('b', { text: x.k }), h('span', { class: 'meta', text: x.d })); }))),
      sec('Tone & Manner', B.tone, h('div', { class: 'br-tone' }, B.tone.items.map(function (x) { return h('div', null, h('b', { text: '# ' + x.k }), h('p', { text: x.d })); }))),
      V ? productsOf(V).map(function (x) {
        var P = x.G.product;
        return ui.panel('Product · ' + x.G.name, h('a', { class: 'meta', href: '#' + x.id + '-spec', text: x.G.name + ' 제품 사양 →' }),
          h('div', { class: 'vg-prod-line' }, h('span', { class: 'br-k', text: P.line }), h('b', { text: P.nameKo }), h('span', { class: 'meta', text: P.nameEn + ' · ' + P.launch })),
          heroStats(P));
      }) : null,
      V && V.lineup ? ui.panel('Line-up · 제품 출시 순서', null, lineup(V.lineup)) : null,
      B.goal ? h('section', { class: 'br-goal' }, h('span', { class: 'br-goal-label', text: B.goal.label }), h('b', { class: 'br-goal-v', text: B.goal.value }), B.goal.d ? h('p', { text: B.goal.d }) : null) : null,
      (B.logos || []).length ? ui.panel('Logo · 로고 다운로드', null, h('p', { class: 'muted small', text: '외부 전달 · 제작물에는 이 파일만 씁니다. 색 · 비율을 바꾸지 마세요.' }),
        h('div', { class: 'br-logos' }, B.logos.map(function (x) {
          return h('div', { class: 'br-logo' + (x.dark ? ' dark' : '') }, h('div', { class: 'br-logo-img' }, h('img', { src: x.src, alt: x.name, loading: 'lazy' })),
            h('b', { text: x.name }), x.d ? h('span', { class: 'meta', text: x.d }) : null,
            h('div', { class: 'row' }, (x.files || [{ t: '다운로드', src: x.src }]).map(function (f) { return h('a', { class: 'btn btn-line btn-xs', href: f.src, download: '', text: '↓ ' + f.t }); })));
        }))) : null,
      V && V.sources ? ui.panel('Source · 원본 파일', null, h('ul', { class: 'list vg-src' }, allSources(V).map(function (s) { return h('li', null, ext(s.u, s.t), h('span', { class: 'meta', text: s.d })); }))) : null);
  }
  function productsOf(V) {
    if (!V.products) return [{ id: 'gel', G: Object.assign({ name: '클렌징 젤' }, V) }];
    return (V.order || Object.keys(V.products)).filter(function (id) { return V.products[id]; }).map(function (id) { return { id: id, G: V.products[id] }; });
  }
  function allSources(V) {
    var out = (V.sources || []).slice();
    if (V.products) productsOf(V).forEach(function (x) { (x.G.sources || []).forEach(function (s) { out.push({ t: '[' + x.G.name + '] ' + s.t, u: s.u, d: s.d }); }); });
    return out;
  }
  function heroStats(P) {
    return h('div', { class: 'vg-stats' }, P.hero.map(function (x) { return h('div', { class: 'vg-stat' }, h('b', { text: x.v }), h('span', { class: 'vg-stat-k', text: x.k }), h('p', { text: x.d })); }));
  }
  function lineup(L) {
    return h('ol', { class: 'vg-line' }, L.map(function (x) {
      return h('li', { class: x.now ? 'now' : '' }, h('span', { class: 'vg-when', text: x.when }), h('b', { text: x.k }), x.d ? h('span', { class: 'meta', text: x.d }) : null);
    }));
  }

  /* ---------- 제품 사양 — 260814 확정 시트 + 상세페이지 고시정보 ---------- */
  function product(view, id) {
    var X = prod(view, id); if (!X) return;
    var V = X.V, G = X.G, P = G.product;
    ui.put(view, ui.head(G.name + ' · 제품 사양', P.nameKo, h('div', { class: 'row vg-head-r' },
      G.pack ? h('a', { class: 'btn btn-line btn-sm', href: '#' + id + '-pack', text: '패키지 문안 →' }) : null,
      V.asOf ? h('span', { class: 'meta', text: '기준 ' + V.asOf.replace(/-/g, '.') }) : null)));
    ui.put(view,
      h('section', { class: 'vg-hero' }, h('div', { class: 'br-kicker', text: P.brand + ' · ' + P.line }), h('h2', { text: P.nameEn }), h('p', { class: 'vg-tag', text: P.tagline }), h('p', { class: 'vg-hook', text: P.hook })),
      heroStats(P),
      ui.panel('Spec · 기본 사양', null, h('div', { class: 'vg-spec' }, P.spec.map(function (r) { return h('div', { class: /^⚠/.test(r[1]) ? 'warn' : '' }, h('dt', { text: r[0] }), h('dd', { text: r[1] })); }))),
      h('div', { class: 'vg-3' },
        ui.panel('4 Vine', null, h('p', { class: 'muted small', text: P.fourVine.lead }),
          h('ul', { class: 'vg-kv' }, P.fourVine.items.map(function (x) { return h('li', null, h('span', { class: 'br-k', text: x.k }), h('b', { text: x.v }), x.d ? h('p', { text: x.d }) : null); })),
          h('p', { class: 'br-note', text: P.fourVine.note })),
        ui.panel('Tri-Micelle', null, h('ul', { class: 'vg-kv' }, P.micelle.items.map(function (x) { return h('li', null, h('span', { class: 'br-k', text: x.k }), h('b', { text: x.v })); })),
          h('p', { class: 'br-note', text: P.micelle.note })),
        ui.panel('Zero-List', null, h('div', { class: 'vg-zero' }, P.zero.items.map(function (z) { return h('span', { text: z }); })), h('p', { class: 'br-note', text: P.zero.instead }))),
      ui.panel('Ingredients · 전성분 (한글 28종)', copyBtn(P.inciKo), h('p', { class: 'vg-inci', text: P.inciKo })),
      ui.panel('Ingredients · INCI (English)', copyBtn(P.inciEn), h('p', { class: 'vg-inci', text: P.inciEn }), h('p', { class: 'br-note', text: P.inciNote })),
      h('div', { class: 'vg-2' },
        ui.panel('사용방법 · Directions', copyBtn(P.usage), h('p', { class: 'vg-body', text: P.usage }), h('p', { class: 'vg-body muted', text: P.usageEn })),
        ui.panel('사용 시 주의사항 · Caution', copyBtn(P.caution), h('p', { class: 'vg-body' }, lines(P.caution)), h('p', { class: 'vg-body muted', text: P.cautionEn }), h('p', { class: 'br-note', text: '품질보증 — ' + P.guarantee }))),
      G.claims ? claims(G.claims) : null,
      ui.panel('Line-up · 제품 출시 순서', null, lineup(V.lineup)));
  }
  function claims(C) {
    return ui.panel('Claims · 카피에 쓸 수 있는 말 / 없는 말', null,
      h('p', { class: 'muted small', text: C.basis.title }),
      h('div', { class: 'br-tasks' }, C.basis.items.map(function (x) { return h('div', { class: 'br-task' }, h('b', { class: 'vg-claim-k', text: x.k }), h('p', { text: x.d })); })),
      h('div', { class: 'vg-2 vg-claims' },
        h('div', { class: 'vg-ok' }, h('div', { class: 'label', text: '써도 되는 말' }), h('ul', null, C.ok.map(function (t) { return h('li', { text: t }); }))),
        h('div', { class: 'vg-no' }, h('div', { class: 'label', text: '쓰지 않는 말' }), h('ul', null, C.no.map(function (x) { return h('li', null, h('b', { text: x.k }), h('span', { text: ' — ' + x.d })); })))),
      h('p', { class: 'br-note', text: C.words }));
  }

  /* ---------- 상세페이지 — 초안 슬라이드 챕터 · FAQ · 고시정보 · 레퍼런스 ---------- */
  function pdp(view, id) {
    var X = prod(view, id); if (!X) return;
    var V = X.V, G = X.G, D = G.pdp, P = G.product, src = (G.sources || V.sources || [])[0];
    if (!D) return ui.put(view, ui.head(G.name + ' · 상세페이지', P.nameKo), ui.empty('상세페이지 내용이 아직 없습니다.'));
    head(view, G.name + ' · 상세페이지', P.nameKo + ' — 상세페이지', V);
    var keys = ['제품명', '내용량', '피부 타입', '사용기한', '개봉 후 사용기간', '제조국', '화장품제조업자', '화장품책임판매업자', '기능성 화장품', '소비자상담'];
    var notice = keys.map(function (k) { return P.spec.filter(function (r) { return r[0] === k; })[0]; }).filter(Boolean);
    ui.put(view,
      h('p', { class: 'vg-status' }, h('b', { text: '진행 상태 ' }), D.status, src ? [' · ', ext(src.u, '원본 슬라이드 열기 ↗')] : null),
      h('div', { class: 'vg-chapters' }, D.chapters.map(function (c) {
        return h('section', { class: 'vg-ch' + (/^P/.test(c.no) ? ' point' : '') },
          h('div', { class: 'vg-ch-head' }, h('span', { class: 'vg-ch-no', text: c.no }), h('span', { class: 'br-k', text: c.k })),
          h('h3', { text: c.t }), h('p', { class: 'vg-body' }, lines(c.b)),
          c.img ? h('div', { class: 'vg-img', text: '이미지 슬롯 — ' + c.img }) : null);
      })),
      ui.panel('FAQ', null, h('dl', { class: 'vg-faq' }, D.faq.map(function (x) { return h('div', null, h('dt', { text: 'Q. ' + x.q }), h('dd', { text: 'A. ' + x.a })); })),
        h('p', { class: 'br-note', text: '원본 초안의 절대 · 과장 표현(「자석처럼」 「손상 없이」 「완벽한」 등)은 뺀 버전입니다 — 검수 탭 참고.' })),
      ui.panel('상품정보제공고시', null, h('div', { class: 'vg-spec' }, notice.map(function (r) { return h('div', { class: /^⚠/.test(r[1]) ? 'warn' : '' }, h('dt', { text: r[0] }), h('dd', { text: r[1] })); }),
        h('div', null, h('dt', { text: '전성분' }), h('dd', { text: P.inciKo })), h('div', null, h('dt', { text: '품질보증기준' }), h('dd', { text: P.guarantee })))),
      h('div', { class: 'vg-2' },
        ui.panel(D.guide.title, null, h('ul', { class: 'vg-bul' }, D.guide.items.map(function (t) { return h('li', { text: t }); }))),
        ui.panel('Reference · 참고 상세페이지', null, h('ul', { class: 'list vg-src' }, D.refs.map(function (r) { return h('li', null, ext(r.u, r.k), r.d ? h('span', { class: 'meta', text: r.d }) : null); })))));
  }

  /* ---------- 패키지 문안 — 튜브 · 단상자 (260811 문안 시트, 260821 검토 반영) ---------- */
  function pack(view, id) {
    var X = prod(view, id); if (!X) return;
    var V = X.V, G = X.G, K = G.pack;
    if (!K) return ui.put(view, ui.head(G.name + ' · 패키지 문안', G.product.nameKo), ui.empty('패키지 문안이 아직 없습니다.'));
    ui.put(view, h('a', { class: 'meta vg-back', href: '#' + id + '-spec', text: '← ' + G.name + ' 제품 사양' }));
    head(view, G.name + ' · 패키지 문안', '튜브 · 단상자 인쇄 문안', V);
    var table = function (T) {
      return ui.panel(T.title, null, h('div', { class: 'table-wrap flat' }, h('table', { class: 'table vg-table' },
        h('thead', null, h('tr', null, ['면', '항목', '문안', '폰트 · 크기'].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', null, T.rows.map(function (r, i) {
          var first = !i || T.rows[i - 1][0] !== r[0];
          return h('tr', { class: first ? 'vg-face' : '' }, h('td', { class: 'vg-f', text: first ? r[0] : '' }), h('td', { text: r[1] }), h('td', { class: 'vg-copy', text: r[2] }), h('td', { class: 'meta', text: r[3] }));
        })))));
    };
    ui.put(view,
      table(K.tube), table(K.box),
      ui.panel('English — 그대로 쓰는 문장', null, h('div', { class: 'vg-spec' },
        [['Description', K.en.description], ['Distributed by', K.en.distributed], ['Manufactured by', K.en.manufactured], ['Tagline', G.product.tagline]].map(function (r) {
          return h('div', null, h('dt', { text: r[0] }), h('dd', null, r[1], ' ', copyBtn(r[1])));
        }))),
      h('div', { class: 'vg-2' },
        ui.panel('분리배출 · PAO 표기 규격', null, h('p', { class: 'vg-body', text: K.mark })),
        ui.panel('인쇄 파일 · 마크', null, h('ul', { class: 'list vg-src' }, K.assets.map(function (a) { return h('li', null, ext(a.u, a.t)); })))));
  }

  /* ---------- 검수 — 인쇄 · 상세페이지 전에 정할 것 ---------- */
  function check(view, id) {
    var X = prod(view, id); if (!X) return;
    var V = X.V, G = X.G, C = G.check || [];
    var LV = [['red', '인쇄 · 게시 전 확정 필요', 'red'], ['warn', '판단 필요', 'warn'], ['info', '참고', 'mute']];
    head(view, G.name + ' · 검수', C.length ? '표기 · 카피 확인 필요 ' + C.length + '건' : '확인할 것이 없습니다', V);
    ui.put(view, h('p', { class: 'muted small', text: '문안 시트(260821 현지 검토)와 상세페이지 초안(261008)을 맞대어 본 결과입니다. 정해지면 원본 파일을 고치고 이 목록에서 지웁니다.' }),
      LV.map(function (l) {
        var items = C.filter(function (x) { return x.lv === l[0]; });
        if (!items.length) return null;
        return ui.panel(l[1] + ' · ' + items.length + '건', null, h('ol', { class: 'vg-check' }, items.map(function (x) {
          return h('li', { class: 'lv-' + x.lv }, h('div', { class: 'row' }, ui.tag(l[1].split(' ')[0] === '인쇄' ? '확정 필요' : l[1], l[2]), h('b', { text: x.k })), h('span', { class: 'meta', text: x.w }), h('p', { text: x.d }));
        })));
      }));
  }

  HR.register('brand', { render: brand });

  /* ---------- 핵심 소구점 · 타겟 소비자 — vg_points (kind appeal | target, 없으면 appeal)
     구성원 누구나 추가 · 순서(끌어서), 내용 수정 · 삭제는 작성자 · 관리자. 소구점은 MKT 소구점 보드에서 가져오기 ---------- */
  var S = HR.S, FV = HR.FV, VG = { points: [], loaded: false, mkt: [], mktOk: false };
  var KINDS = {
    appeal: { label: 'Appeal', title: '핵심 소구점', tags: ['컨셉', '성분', '효과', '신뢰', '감성'], def: '효과',
      lead: '한 문장 약속 + 믿게 만드는 근거. 상세페이지 · 광고 · 인플루언서 브리프는 이 목록에서 고릅니다. 쓰지 않는 말은 제품 사양 › Claims를 확인하세요.',
      ph: '한 문장 소구점 — 예) 씻고 나서도 당기지 않는 약산성 젤', ph2: '근거 — 성분 · 수치 · 시험 · 원본 문서 (선택)' },
    copy: { label: 'Copy', title: '핵심 카피라이팅', tags: ['메인', '서브', '훅', '태그라인', '바디'], def: '메인', max: 300,
      lead: '그대로 가져다 쓰는 확정 문장. 줄 오른쪽 「복사」로 바로 복사합니다. 아래는 쓰는 곳 · 메모.',
      ph: '카피 문장 — 예) Born of the vineyard. Reserved for your skin.', ph2: '쓰는 곳 · 메모 — 상세 Hero · 단상자 · 광고 (선택)' },
    target: { label: 'Target', title: '타겟 소비자', tags: ['핵심', '피부', '상황', '심리'], def: '피부',
      lead: '누구의 어떤 순간을 잡을까. 위 소구점이 가장 크게 들리는 사람부터 적습니다.',
      ph: '한 줄 타겟 — 예) 세안 후 당김이 고민인 30대 수부지', ph2: '설명 — 지금 쓰는 것 · 불만 · 사는 순간 (선택)' }
  };
  var ptEdit = null, mktOpen = false, tagFilter = {};   // tagFilter[kind] = 분류 (빈 값 = 전체)   // ptEdit = 문서 id | 'new:<kind>'
  HR.APP.onStart = function (sub) {
    sub(db.collection('vg_points'), function (s) { VG.points = HR.rows(s); VG.loaded = true; });
    if (HR.canApp('mkt')) sub(db.collection('mkt_items').where('board', '==', 'appeal'), function (s) { VG.mkt = HR.rows(s); VG.mktOk = true; });
  };
  function kindOf(p) { return p.kind || 'appeal'; }
  function canEditPt(x) { return S.isAdmin || x.by === S.mid; }
  function savePt(id, data) {
    var base = { updatedBy: S.mid, updatedAt: FV.serverTimestamp() };
    var q = id ? db.collection('vg_points').doc(id).update(Object.assign(data, base))
      : db.collection('vg_points').add(Object.assign({ src: '', mktId: '', proof: '' }, data, base, { by: S.mid, at: FV.serverTimestamp() }));
    return q.catch(function (e) { ui.fail(e); throw e; });
  }
  function nextOrder(list) { return list.reduce(function (m, p) { return Math.max(m, p.order || 0); }, 0) + 10; }
  function move(list, i, d) {
    var a = list[i], b = list[i + d]; if (!a || !b) return;
    var oa = a.order || 0, ob = b.order || 0; if (oa === ob) ob = oa + d;
    savePt(a.id, { order: ob }); savePt(b.id, { order: oa });
  }

  // 더블클릭 · 「수정」 · 「+ 추가」 → 그 자리에서 분류 · 한 줄 · 근거를 쓴다. Enter 저장(근거 칸은 Ctrl+Enter) · Esc 취소
  function startEdit(id) {
    ptEdit = id; HR.refresh();
    setTimeout(function () { var t = document.getElementById('vgEditT'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 120);
  }
  function inlineEdit(prod, kind, list, x, theme) {
    var K = KINDS[kind];
    var tg = ui.select(K.tags.map(function (k) { return [k, k]; }), x ? x.tag : K.def, { class: 'vg-ie-tag', 'aria-label': '분류' });
    var t = ui.input({ id: 'vgEditT', class: 'vg-ie-title', value: x ? x.title : '', maxlength: K.max || 120, placeholder: K.ph, 'aria-label': K.title });
    var pr = h('textarea', { class: 'vg-ie-proof', rows: 2, maxlength: 1000, placeholder: K.ph2, 'aria-label': '근거' }); pr.value = x ? x.proof || '' : '';
    // 입력칸에 포커스가 있으면 core.js가 다시 그리기를 미룬다 → 저장 · 취소 때 먼저 포커스를 뺀다
    var cancel = function () { ptEdit = null; blurNow(); HR.refresh(); };
    var save = function () {
      var title = t.value.trim(); if (!title) { t.focus(); return; }
      blurNow();
      if (x && title === x.title && pr.value.trim() === (x.proof || '') && tg.value === x.tag) return cancel();
      var data = { product: prod, kind: kind, title: title, proof: pr.value.trim(), tag: tg.value };
      if (!x) { data.order = nextOrder(list); if (theme != null) data.theme = theme; }
      savePt(x && x.id, data).then(function () { ptEdit = null; ui.toast(x ? '고쳤습니다.' : '추가했습니다.'); HR.refresh(); });
    };
    var keys = function (e) {
      if (e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter' && (e.target === t || e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    };
    [t, pr, tg].forEach(function (el) { el.addEventListener('keydown', keys); });
    return h('div', { class: 'vg-pt-main' },
      h('div', { class: 'vg-pt-top' }, tg, t),
      pr,
      h('div', { class: 'vg-ie-act' }, ui.btn(x ? '저장' : '추가', save, 'btn-xs'), ui.btn('취소', cancel, 'btn-line btn-xs'),
        h('span', { class: 'meta', text: 'Enter 저장 (근거 칸은 Ctrl+Enter) · Esc 취소' })));
  }

  // 끌어서 순서 바꾸기 — 손잡이(⠿)를 잡고 위아래로. 끄는 동안 줄이 실시간으로 자리를 바꾸고, 놓으면 바뀐 줄만 order를 다시 매겨 한 번에 저장
  function dragStart(e, list) {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    // 카피처럼 주제 묶음(.vg-themes)이 여러 개면 묶음 사이로도 옮긴다 → 놓은 묶음의 주제(theme)로 바뀐다
    var li = e.currentTarget.closest('.vg-pt'), ol = li.parentNode, wrap = li.closest('.vg-themes');
    var lists = wrap ? Array.prototype.slice.call(wrap.querySelectorAll('ol.vg-pts')) : [ol], before = snap();
    li.classList.add('dragging'); (wrap || ol).classList.add('sorting'); document.body.classList.add('vg-dragging');
    function ids(l) { return Array.prototype.map.call(l.querySelectorAll('.vg-pt[data-id]'), function (n) { return n.dataset.id; }); }
    function snap() { return lists.map(function (l) { return (l.dataset.theme || '') + ':' + ids(l).join(','); }).join('|'); }
    function renumber() { lists.forEach(function (l) { Array.prototype.forEach.call(l.querySelectorAll('.vg-pt-no'), function (n, k) { n.textContent = ('0' + (k + 1)).slice(-2); }); l.classList.toggle('empty', !l.querySelector('.vg-pt')); }); }
    function onMove(ev) {
      var y = ev.clientY;
      if (y < 70) window.scrollBy(0, -12); else if (y > window.innerHeight - 70) window.scrollBy(0, 12);
      if (lists.length > 1) {
        for (var q = 0; q < lists.length; q++) { var lr = lists[q].getBoundingClientRect(); if (y >= lr.top - 14 && y <= lr.bottom + 14) { ol = lists[q]; break; } }
        lists.forEach(function (l) { l.classList.toggle('drop', l === ol); });
      }
      var rows = Array.prototype.filter.call(ol.children, function (n) { return n !== li && n.dataset.id; });
      var next = null;
      for (var k = 0; k < rows.length; k++) { var r = rows[k].getBoundingClientRect(); if (y < r.top + r.height / 2) { next = rows[k]; break; } }
      if (next !== li.nextSibling) { ol.insertBefore(li, next); renumber(); }
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
      li.classList.remove('dragging'); (wrap || ol).classList.remove('sorting'); document.body.classList.remove('vg-dragging');
      lists.forEach(function (l) { l.classList.remove('drop'); });
      if (snap() === before) return;
      var byId = {}; list.forEach(function (p) { byId[p.id] = p; });
      var batch = db.batch(), n = 0;
      lists.forEach(function (l) {
        var th = wrap ? l.dataset.theme || '' : null;
        ids(l).forEach(function (id, k) {
          var o = (k + 1) * 10, p = byId[id]; if (!p) return;
          var ch = { order: o, updatedBy: S.mid, updatedAt: FV.serverTimestamp() }, diff = p.order !== o;
          if (th !== null && (p.theme || '') !== th) { ch.theme = th; p.theme = th; diff = true; }
          if (diff) { batch.update(db.collection('vg_points').doc(id), ch); p.order = o; n++; }
        });
      });
      if (n) batch.commit().then(function () { ui.toast('순서를 바꿨습니다.'); }, function (err) { ui.fail(err); HR.refresh(); });
    }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  }

  function row(prod, kind, list, x, i, all) {
    var no = h('span', { class: 'vg-pt-no', text: ('0' + (i + 1)).slice(-2) });
    if (ptEdit === x.id) return h('li', { class: 'vg-pt editing', 'data-id': x.id }, h('span', { class: 'vg-pt-grip off' }), no, inlineEdit(prod, kind, list, x));
    var isCopy = kind === 'copy';   // 카피는 문장만 — 작성자 · 메모는 숨기고 메모는 마우스를 올리면
    var who = isCopy ? '' : (S.members[x.by] || {}).name || '';
    var grip = h('span', { class: 'vg-pt-grip', tabindex: '0', role: 'button', title: '끌어서 순서 바꾸기 (방향키로도 이동)', 'aria-label': (i + 1) + '번 순서 바꾸기',
      onpointerdown: function (e) { dragStart(e, all || list); },
      onkeydown: function (e) {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault(); move(list, i, e.key === 'ArrowUp' ? -1 : 1);
        var id = x.id; setTimeout(function () { var g = document.querySelector('.vg-pt[data-id="' + id + '"] .vg-pt-grip'); if (g) g.focus(); }, 400);
      } }, '⠿');
    return h('li', { class: 'vg-pt' + (canEditPt(x) ? ' can-edit' : ''), 'data-id': x.id, title: (isCopy && x.proof ? x.proof + (canEditPt(x) ? ' · ' : '') : '') + (canEditPt(x) ? '더블클릭하면 바로 고칩니다' : ''),
      ondblclick: canEditPt(x) ? function (e) { if (e.target.closest('button, .vg-pt-grip')) return; startEdit(x.id); } : null },
      grip, no,
      h('div', { class: 'vg-pt-main' },
        h('div', { class: 'vg-pt-top' }, h('span', { class: 'vg-pt-chip', text: x.tag }), h('b', { class: 'vg-pt-title', text: x.title }),
          x.src === 'mkt' ? ui.tag('MKT', 'mute') : null),
        !isCopy && (x.proof || who) ? h('p', { class: 'vg-pt-proof' }, x.proof || '', who ? h('span', { class: 'vg-pt-who', text: who }) : null) : null),
      h('div', { class: 'vg-pt-act' },
        kind === 'copy' ? ui.btn('복사', function () { copyText(x.title, '카피를 복사했습니다.'); }, 'btn-line btn-xs vg-copy-btn') : null,
        canEditPt(x) ? ui.btn('수정', function () { startEdit(x.id); }, 'btn-line btn-xs') : null,
        canEditPt(x) ? ui.confirmBtn('삭제', function () { db.collection('vg_points').doc(x.id).delete().then(function () { ui.toast('삭제했습니다.'); }, ui.fail); }) : null));
  }
  function group(prod, kind) {
    var K = KINDS[kind];
    var list = VG.points.filter(function (p) { return p.product === prod && kindOf(p) === kind; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var adding = ptEdit === 'new:' + kind, f = tagFilter[kind] || '';
    var shown = f ? list.filter(function (p) { return p.tag === f; }) : list;
    // 분류로 걸러 보는 중에는 끌어서 순서 바꾸기를 끈다 (숨은 줄과 순서가 섞이지 않게)
    var rows = shown.map(function (x, i) { var r = row(prod, kind, list, x, f ? list.indexOf(x) : i); if (f) { var g = r.querySelector('.vg-pt-grip'); if (g) { g.className = 'vg-pt-grip off'; g.textContent = ''; } } return r; });
    var counts = {}; list.forEach(function (p) { counts[p.tag] = (counts[p.tag] || 0) + 1; });
    var filter = list.length > 8 ? h('div', { class: 'vg-filter' }, [['', '전체 ' + list.length]].concat(K.tags.filter(function (t) { return counts[t]; }).map(function (t) { return [t, t + ' ' + counts[t]]; })).map(function (o) {
      return h('button', { type: 'button', class: 'chip' + (o[0] === f ? ' on' : ''), text: o[1], onclick: function () { tagFilter[kind] = o[0]; HR.refresh(); } });
    })) : null;
    if (adding) rows.push(h('li', { class: 'vg-pt editing new' }, h('span', { class: 'vg-pt-grip off' }), h('span', { class: 'vg-pt-no', text: ('0' + (list.length + 1)).slice(-2) }), inlineEdit(prod, kind, list, null)));
    return h('section', { class: 'vg-group vg-group-' + kind },
      h('div', { class: 'vg-group-head' }, h('div', { class: 'label', text: K.label + ' · ' + K.title }), h('span', { class: 'meta', text: list.length + '개' })),
      h('p', { class: 'muted small', text: K.lead }),
      filter,
      rows.length ? h('ol', { class: 'vg-pts' }, rows) : null,
      h('div', { class: 'vg-add-row' },
        adding ? null : h('button', { type: 'button', class: 'vg-add', text: '+ 추가', onclick: function () { startEdit('new:' + kind); } }),
        kind === 'appeal' && HR.canApp('mkt') ? h('button', { type: 'button', class: 'vg-add ghost', text: mktOpen ? 'MKT 가져오기 닫기' : 'MKT 소구점 보드에서 가져오기',
          onclick: function () { mktOpen = !mktOpen; HR.refresh(); } }) : null),
      kind === 'appeal' && mktOpen ? mktPanel(prod, list) : null);
  }
  /* 핵심 카피라이팅 — 소구 주제([권위] · [손실회피] …) 묶음. 주제 = vg_points kind 'theme', 카피의 theme = 주제 문서 id
     카피는 끌어서 다른 주제로 옮길 수 있고, 주제 묶음도 머리의 손잡이로 끌어서 순서를 바꾼다. 주제 이름은 더블클릭으로 수정 */
  var thEdit = null;   // 주제 id | 'new'
  function themeDrag(e, themes) {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    var sec = e.currentTarget.closest('.vg-theme'), box = sec.parentNode, before = tids();
    sec.classList.add('dragging'); document.body.classList.add('vg-dragging');
    function tids() { return Array.prototype.map.call(box.querySelectorAll('.vg-theme[data-tid]'), function (n) { return n.dataset.tid; }); }
    function onMove(ev) {
      var y = ev.clientY;
      if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 70) window.scrollBy(0, 14);
      var others = Array.prototype.filter.call(box.querySelectorAll('.vg-theme[data-tid]'), function (n) { return n !== sec; }), next = null;
      for (var k = 0; k < others.length; k++) { var r = others[k].getBoundingClientRect(); if (y < r.top + Math.min(r.height / 2, 40)) { next = others[k]; break; } }
      if (!next) next = box.querySelector('.vg-theme:not([data-tid])');
      if (next !== sec.nextSibling) box.insertBefore(sec, next);
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
      sec.classList.remove('dragging'); document.body.classList.remove('vg-dragging');
      var after = tids(); if (after.join() === before.join()) return;
      var byId = {}; themes.forEach(function (t) { byId[t.id] = t; });
      var batch = db.batch(), n = 0;
      after.forEach(function (id, k) { var o = (k + 1) * 10, t = byId[id]; if (t && t.order !== o) { batch.update(db.collection('vg_points').doc(id), { order: o, updatedBy: S.mid, updatedAt: FV.serverTimestamp() }); t.order = o; n++; } });
      if (n) batch.commit().then(function () { ui.toast('주제 순서를 바꿨습니다.'); }, function (err) { ui.fail(err); HR.refresh(); });
    }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  }
  function themeInput(prod, themes, t) {
    var inp = ui.input({ id: 'vgThEdit', class: 'vg-th-in', value: t ? t.title : '', maxlength: 30, placeholder: '소구 주제 — 예) 권위', 'aria-label': '소구 주제' });
    var done = function (save) {
      var v = inp.value.replace(/^\[|\]$/g, '').trim(); thEdit = null; blurNow();
      if (!save || !v || (t && v === t.title)) return HR.refresh();
      (t ? savePt(t.id, { title: v }) : savePt(null, { product: prod, kind: 'theme', title: v, tag: '주제', theme: '', order: nextOrder(themes) }))
        .then(function () { ui.toast(t ? '주제 이름을 바꿨습니다.' : '「' + v + '」 주제를 만들었습니다.'); HR.refresh(); });
    };
    inp.addEventListener('keydown', function (e) { if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); done(false); } });
    inp.addEventListener('blur', function () { if (thEdit !== null) done(true); });
    return inp;
  }
  function focusSoon(id) { setTimeout(function () { var el = document.getElementById(id); if (el) { el.focus(); if (el.select) el.select(); } }, 120); }
  function copyGroup(prod) {
    var K = KINDS.copy, f = tagFilter.copy || '';
    var list = VG.points.filter(function (p) { return p.product === prod && kindOf(p) === 'copy'; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var themes = VG.points.filter(function (p) { return p.product === prod && kindOf(p) === 'theme'; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var known = {}; themes.forEach(function (t) { known[t.id] = 1; });
    var counts = {}; list.forEach(function (p) { counts[p.tag] = (counts[p.tag] || 0) + 1; });
    var filter = h('div', { class: 'vg-filter' }, [['', '전체 ' + list.length]].concat(K.tags.filter(function (t) { return counts[t]; }).map(function (t) { return [t, t + ' ' + counts[t]]; })).map(function (o) {
      return h('button', { type: 'button', class: 'chip' + (o[0] === f ? ' on' : ''), text: o[1], onclick: function () { tagFilter.copy = o[0]; HR.refresh(); } });
    }));
    var section = function (t) {
      var tid = t ? t.id : '';
      var items = list.filter(function (p) { return t ? p.theme === tid : !known[p.theme || '']; });
      var shown = f ? items.filter(function (p) { return p.tag === f; }) : items;
      var rows = shown.map(function (x, i) {
        var r = row(prod, 'copy', items, x, i, list);
        if (f) { var g = r.querySelector('.vg-pt-grip'); if (g) { g.className = 'vg-pt-grip off'; g.textContent = ''; } }
        return r;
      });
      if (ptEdit === 'new:copy:' + tid) rows.push(h('li', { class: 'vg-pt editing new' }, h('span', { class: 'vg-pt-grip off' }), h('span', { class: 'vg-pt-no', text: ('0' + (items.length + 1)).slice(-2) }), inlineEdit(prod, 'copy', list, null, tid)));
      var mine = t && canEditPt(t);
      var name = thEdit === tid && t ? themeInput(prod, themes, t)
        : h('b', { class: 'vg-th-name', title: mine ? '더블클릭하면 이름을 고칩니다' : null, ondblclick: mine ? function () { thEdit = tid; HR.refresh(); focusSoon('vgThEdit'); } : null }, t ? '[' + t.title + ']' : '[주제 없음]');
      return h('section', { class: 'vg-theme' + (t ? '' : ' none'), 'data-tid': t ? tid : null },
        h('div', { class: 'vg-th-head' },
          t ? h('span', { class: 'vg-th-grip', title: '끌어서 주제 순서 바꾸기', onpointerdown: function (e) { themeDrag(e, themes); } }, '⠿') : h('span', { class: 'vg-th-grip off' }),
          name, h('span', { class: 'vg-th-n', text: String(items.length) }),
          h('span', { class: 'grow' }),
          ptEdit === 'new:copy:' + tid ? null : h('button', { type: 'button', class: 'vg-th-add', text: '+ 카피', onclick: function () { startEdit('new:copy:' + tid); } }),
          mine && !items.length ? ui.confirmBtn('주제 삭제', function () { db.collection('vg_points').doc(tid).delete().then(function () { ui.toast('주제를 지웠습니다.'); }, ui.fail); }, 'btn btn-line btn-xs danger') : null),
        h('ol', { class: 'vg-pts' + (rows.length ? '' : ' empty'), 'data-theme': tid }, rows));
    };
    var none = list.filter(function (p) { return !known[p.theme || '']; });
    return h('section', { class: 'vg-group vg-group-copy' },
      h('div', { class: 'vg-group-head' }, h('div', { class: 'label', text: K.label + ' · ' + K.title }), h('span', { class: 'meta', text: list.length + '개 · 주제 ' + themes.length })),
      h('p', { class: 'muted small', text: '소구 주제별로 묶었습니다. 카피는 왼쪽 ⠿로 끌어서 다른 주제로 옮기고, 주제는 [이름] 앞 ⠿로 끌어서 순서를 바꿉니다. 이름은 더블클릭으로 고칩니다.' }),
      filter,
      h('div', { class: 'vg-themes' }, themes.map(section), none.length || ptEdit === 'new:copy:' ? section(null) : null),
      h('div', { class: 'vg-add-row' }, thEdit === 'new' ? themeInput(prod, themes, null)
        : h('button', { type: 'button', class: 'vg-add', text: '+ 소구 주제', onclick: function () { thEdit = 'new'; HR.refresh(); focusSoon('vgThEdit'); } })));
  }

  /* 핵심 키워드 — 칩 모양. 쉼표로 여러 개 한 번에 추가, 칩을 누르면 #해시태그 복사, 전체는 해시태그 · 쉼표 목록으로 복사
     끌어서 순서 · 더블클릭 수정 · × 삭제(작성자 · 관리자) */
  var kwEdit = null;
  function blurNow() { var a = document.activeElement; if (a && a.blur) a.blur(); }
  function hashtag(k) { return '#' + String(k).replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ_]/g, ''); }
  function copyText(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { ui.toast(msg || '복사했습니다.'); }, function () { ui.toast('복사하지 못했습니다. 직접 선택해 주세요.'); });
  }
  function kwDrag(e, list) {
    if (e.button && e.button !== 0) return;
    var chip = e.currentTarget, box = chip.parentNode, sx = e.clientX, sy = e.clientY, on = false, before = null;
    function ids() { return Array.prototype.map.call(box.querySelectorAll('.vg-kw[data-id]'), function (n) { return n.dataset.id; }); }
    function onMove(ev) {
      if (!on) { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return; on = true; before = ids(); chip.classList.add('dragging'); document.body.classList.add('vg-dragging'); }
      ev.preventDefault();
      var others = Array.prototype.filter.call(box.querySelectorAll('.vg-kw[data-id]'), function (n) { return n !== chip; }), next = null;
      for (var k = 0; k < others.length; k++) {
        var r = others[k].getBoundingClientRect();
        if (ev.clientY < r.top) { next = others[k]; break; }
        if (ev.clientY <= r.bottom && ev.clientX < r.left + r.width / 2) { next = others[k]; break; }
      }
      if (!next) next = box.querySelector('.vg-kw-in') || null;
      if (next !== chip.nextSibling) box.insertBefore(chip, next);
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
      if (!on) return;
      chip.classList.remove('dragging'); document.body.classList.remove('vg-dragging');
      chip.dataset.dragged = '1'; setTimeout(function () { delete chip.dataset.dragged; }, 50);   // 끈 뒤의 click(복사)은 무시
      var after = ids(); if (after.join() === before.join()) return;
      var byId = {}; list.forEach(function (p) { byId[p.id] = p; });
      var batch = db.batch(), n = 0;
      after.forEach(function (id, k) { var o = (k + 1) * 10, p = byId[id]; if (p && p.order !== o) { batch.update(db.collection('vg_points').doc(id), { order: o, updatedBy: S.mid, updatedAt: FV.serverTimestamp() }); p.order = o; n++; } });
      if (n) batch.commit().then(function () { ui.toast('순서를 바꿨습니다.'); }, function (err) { ui.fail(err); HR.refresh(); });
    }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  }
  function keywords(prod) {
    var list = VG.points.filter(function (p) { return p.product === prod && kindOf(p) === 'keyword'; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var words = list.map(function (x) { return x.title; });
    var input = ui.input({ class: 'vg-kw-in', maxlength: 400, placeholder: list.length ? '+ 키워드 (쉼표로 여러 개)' : '키워드 입력 — 쉼표로 여러 개, Enter', 'aria-label': '키워드 추가' });
    input.addEventListener('keydown', function (e) {
      if (e.isComposing || e.key !== 'Enter') return;
      e.preventDefault();
      var have = {}; words.forEach(function (w) { have[w.replace(/\s/g, '').toLowerCase()] = 1; });
      var add = input.value.split(/[,，\n]/).map(function (s) { return s.replace(/^#/, '').trim(); }).filter(function (s) {
        var k = s.replace(/\s/g, '').toLowerCase(); if (!s || have[k]) return false; have[k] = 1; return true;
      });
      if (!add.length) { input.value = ''; return; }
      input.value = ''; blurNow();
      var batch = db.batch(), o = nextOrder(list);
      add.forEach(function (w, i) {
        batch.set(db.collection('vg_points').doc(), { product: prod, kind: 'keyword', title: w.slice(0, 120), proof: '', tag: '키워드', order: o + i * 10, src: '', mktId: '',
          by: S.mid, at: FV.serverTimestamp(), updatedBy: S.mid, updatedAt: FV.serverTimestamp() });
      });
      batch.commit().then(function () { ui.toast(add.length + '개 추가했습니다.'); setTimeout(function () { var el = document.querySelector('.vg-kw-in'); if (el) el.focus(); }, 150); }, ui.fail);
    });
    var chips = list.map(function (x) {
      if (kwEdit === x.id) {
        var ed = ui.input({ id: 'vgKwEdit', class: 'vg-kw-edit', value: x.title, maxlength: 120, 'aria-label': '키워드 수정' });
        var done = function (save) {
          var v = ed.value.replace(/^#/, '').trim(); kwEdit = null; blurNow();
          if (save && v && v !== x.title) savePt(x.id, { product: prod, kind: 'keyword', title: v, proof: x.proof || '', tag: '키워드' }).then(function () { HR.refresh(); });
          else HR.refresh();
        };
        ed.addEventListener('keydown', function (e) { if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); done(false); } });
        ed.addEventListener('blur', function () { if (kwEdit === x.id) done(true); });
        return ed;
      }
      var mine = canEditPt(x);
      return h('span', { class: 'vg-kw', 'data-id': x.id, tabindex: '0', role: 'button', title: '누르면 ' + hashtag(x.title) + ' 복사 · 끌어서 순서' + (mine ? ' · 더블클릭 수정' : ''),
        onpointerdown: function (e) { if (!e.target.closest('.vg-kw-x')) kwDrag(e, list); },
        onclick: function (e) { if (e.currentTarget.dataset.dragged || e.target.closest('.vg-kw-x')) return; copyText(hashtag(x.title), hashtag(x.title) + ' 복사'); },
        onkeydown: function (e) { if (e.key === 'Enter') copyText(hashtag(x.title), hashtag(x.title) + ' 복사'); },
        ondblclick: mine ? function () { kwEdit = x.id; HR.refresh(); setTimeout(function () { var el = document.getElementById('vgKwEdit'); if (el) { el.focus(); el.select(); } }, 120); } : null },
        h('span', { class: 'vg-kw-h', text: '#' }), x.title,
        mine ? h('button', { type: 'button', class: 'vg-kw-x', title: '삭제', 'aria-label': x.title + ' 삭제', text: '×', onclick: function () {
          db.collection('vg_points').doc(x.id).delete().then(function () { ui.toast('「' + x.title + '」 삭제'); }, ui.fail);
        } }) : null);
    });
    return h('section', { class: 'vg-group vg-kw-group' },
      h('div', { class: 'vg-group-head' }, h('div', { class: 'label', text: 'Keyword · 핵심 키워드' }),
        h('div', { class: 'row vg-kw-copy' }, h('span', { class: 'meta', text: list.length + '개' }),
          list.length ? ui.btn('# 해시태그 전체 복사', function () { copyText(words.map(hashtag).join(' '), '해시태그 ' + list.length + '개 복사'); }, 'btn-xs') : null,
          list.length ? ui.btn('쉼표로 복사', function () { copyText(words.join(', '), '키워드 ' + list.length + '개 복사'); }, 'btn-line btn-xs') : null)),
      h('p', { class: 'muted small', text: '검색 · 해시태그 · 광고 키워드로 반복해서 쓰는 말. 칩을 누르면 그 키워드 하나가 #해시태그로 복사됩니다.' }),
      h('div', { class: 'vg-kws' }, chips, input),
      list.length ? h('p', { class: 'vg-kw-preview', text: words.map(hashtag).join(' ') }) : null);
  }
  function points(view, prod) {
    var V = doc('vinegraphy'), G = V && V.products ? V.products[prod] : null;
    var name = G ? G.name : '클렌징 젤';
    ui.put(view, ui.head(name, '핵심 포인트', h('span', { class: 'meta', text: '구성원 누구나 추가 · 끌어서 순서 변경 · 더블클릭 수정' })));
    if (!VG.loaded) return ui.put(view, ui.empty('불러오는 중…'));
    var hr = function () { return h('hr', { class: 'vg-divider' }); };
    ui.put(view, keywords(prod), hr(), group(prod, 'appeal'), hr(), group(prod, 'target'), hr(), copyGroup(prod));
  }
  function mktPanel(prod, list) {
    var taken = {}; list.forEach(function (p) { if (p.mktId) taken[p.mktId] = 1; });
    var rank = { pick: 0, review: 1, idea: 2, hold: 3 }, LB = { pick: '확정', review: '검토', idea: '아이디어', hold: '보류' };
    var items = VG.mkt.slice().sort(function (a, b) { return (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]); });
    return h('div', { class: 'vg-mkt' },
      h('div', { class: 'row between' }, h('span', { class: 'label', text: 'From MKT · 소구점 보드' }), h('a', { class: 'meta', href: '/mkt/', target: '_blank', rel: 'opener', text: 'MKT 열기 ↗' })),
      !VG.mktOk ? ui.empty('불러오는 중…') : !items.length ? ui.empty('MKT 소구점 보드가 아직 비어 있습니다. MKT에서 적으면 여기서 골라 가져올 수 있습니다.')
        : h('ul', { class: 'list' }, items.map(function (m) {
          return h('li', null, h('div', { class: 'grow' }, ui.tag(LB[m.status] || m.status, m.status === 'pick' ? 'red' : 'mute'), ' ', h('b', { text: m.title }),
            m.body ? h('p', { class: 'vg-pt-proof', text: m.body.slice(0, 160) }) : null),
            taken[m.id] ? h('span', { class: 'meta', text: '가져옴' }) : ui.btn('가져오기', function () {
              savePt(null, { product: prod, kind: 'appeal', title: m.title.slice(0, 120), proof: (m.body || '').slice(0, 1000), tag: '효과', order: nextOrder(list), src: 'mkt', mktId: m.id })
                .then(function () { ui.toast('가져왔습니다. 분류는 더블클릭으로 바꿀 수 있습니다.'); });
            }, 'btn-line btn-xs'));
        })));
  }

  // 제품별 메뉴: <제품id>-spec · -pdp · -points · -check (+ -pack: 메뉴에는 없고 제품 사양에서 바로가기) (제품 목록은 app.js VG_PRODUCTS)
  (window.VG_PRODUCTS || []).forEach(function (p) {
    [['spec', product], ['pdp', pdp], ['points', points], ['pack', pack], ['check', check]].forEach(function (m) {
      HR.register(p.id + '-' + m[0], { render: function (view) { m[1](view, p.id); } });
    });
  });
})();
