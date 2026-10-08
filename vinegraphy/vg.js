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

  /* ---------- 핵심 소구점 — vg_points (구성원 누구나 추가 · 순서, 수정 · 삭제는 작성자 · 관리자) + MKT 소구점 보드에서 가져오기 ---------- */
  var S = HR.S, FV = HR.FV, VG = { points: [], loaded: false, mkt: [], mktOk: false };
  var TAGS = ['컨셉', '성분', '효과', '신뢰', '감성'];
  var ptEdit = null;
  HR.APP.onStart = function (sub) {
    sub(db.collection('vg_points'), function (s) { VG.points = HR.rows(s); VG.loaded = true; });
    if (HR.canApp('mkt')) sub(db.collection('mkt_items').where('board', '==', 'appeal'), function (s) { VG.mkt = HR.rows(s); VG.mktOk = true; });
  };
  function canEditPt(x) { return S.isAdmin || x.by === S.mid; }
  function savePt(id, data) {
    var base = { updatedBy: S.mid, updatedAt: FV.serverTimestamp() };
    var q = id ? db.collection('vg_points').doc(id).update(Object.assign(data, base))
      : db.collection('vg_points').add(Object.assign({ src: '', mktId: '', proof: '' }, data, base, { by: S.mid, at: FV.serverTimestamp() }));
    return q.catch(function (e) { ui.fail(e); throw e; });
  }
  function nextOrder(list) { return list.reduce(function (m, p) { return Math.max(m, p.order || 0); }, 0) + 10; }
  function ptForm(prod, list, x, done) {
    var t = ui.input({ value: x ? x.title : '', maxlength: 120, placeholder: '한 문장 소구점 — 예) 씻고 나서도 당기지 않는 약산성 젤' });
    var pr = h('textarea', { rows: 2, maxlength: 1000, placeholder: '근거 — 성분 · 수치 · 시험 · 원본 문서 (선택)' }); pr.value = x ? x.proof || '' : '';
    var tg = ui.select(TAGS.map(function (k) { return [k, k]; }), x ? x.tag : '효과');
    var go = function () {
      var title = t.value.trim(); if (!title) { t.focus(); return; }
      var data = { product: prod, title: title, proof: pr.value.trim(), tag: tg.value };
      if (!x) data.order = nextOrder(list);
      savePt(x && x.id, data).then(function () { ui.toast(x ? '고쳤습니다.' : '추가했습니다.'); if (!x) { t.value = ''; pr.value = ''; } done(); });
    };
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) go(); });
    return h('div', { class: 'vg-pt-form' }, h('div', { class: 'row' }, ui.field('분류', tg, 'vg-pt-tag'), ui.field('소구점', t)), ui.field('근거', pr),
      h('div', { class: 'row' }, ui.btn(x ? '저장' : '+ 추가', go, 'btn-sm'), x ? ui.btn('취소', function () { ptEdit = null; HR.refresh(); }, 'btn-line btn-sm') : null));
  }
  function move(list, i, d) {
    var a = list[i], b = list[i + d]; if (!a || !b) return;
    var oa = a.order || 0, ob = b.order || 0; if (oa === ob) ob = oa + d;
    savePt(a.id, { order: ob }); savePt(b.id, { order: oa });
  }
  function points(view, prod) {
    var V = doc('vinegraphy'), G = V && V.products ? V.products[prod] : null;
    var name = G ? G.name : '클렌징 젤';
    ui.put(view, ui.head(name + ' · 핵심 소구점', '왜 우리여야 하나', h('span', { class: 'meta', text: '구성원 누구나 추가 · 순서 변경' })));
    if (!VG.loaded) return ui.put(view, ui.empty('불러오는 중…'));
    var list = VG.points.filter(function (p) { return p.product === prod; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    ui.put(view,
      h('p', { class: 'muted small', text: '한 문장 약속 + 믿게 만드는 근거. 상세페이지 · 광고 · 인플루언서 브리프는 이 목록에서 고릅니다. 쓰지 않는 말은 제품 사양 › Claims를 확인하세요.' }),
      list.length ? h('ol', { class: 'vg-pts' }, list.map(function (x, i) {
        if (ptEdit === x.id) return h('li', { class: 'vg-pt editing' }, ptForm(prod, list, x, function () { ptEdit = null; }));
        return h('li', { class: 'vg-pt' },
          h('span', { class: 'vg-pt-no', text: ('0' + (i + 1)).slice(-2) }),
          h('div', { class: 'vg-pt-main' },
            h('div', { class: 'vg-pt-top' }, h('span', { class: 'vg-pt-chip', text: x.tag }), x.src === 'mkt' ? ui.tag('MKT', 'mute') : null),
            h('b', { class: 'vg-pt-title', text: x.title }),
            x.proof ? h('p', { class: 'vg-pt-proof', text: x.proof }) : null,
            h('span', { class: 'meta', text: (S.members[x.by] || {}).name || '' })),
          h('div', { class: 'vg-pt-act' },
            h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↑', title: '위로', disabled: !i, onclick: function () { move(list, i, -1); } }),
            h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↓', title: '아래로', disabled: i === list.length - 1, onclick: function () { move(list, i, 1); } }),
            canEditPt(x) ? ui.btn('수정', function () { ptEdit = x.id; HR.refresh(); }, 'btn-line btn-xs') : null,
            canEditPt(x) ? ui.confirmBtn('삭제', function () { db.collection('vg_points').doc(x.id).delete().then(function () { ui.toast('삭제했습니다.'); }, ui.fail); }) : null));
      })) : ui.empty('아직 소구점이 없습니다. 아래에서 추가하세요.'),
      ui.panel('Add · 소구점 추가', null, ptForm(prod, list, null, function () { HR.refresh(); })),
      mktPanel(prod, list));
  }
  function mktPanel(prod, list) {
    if (!HR.canApp('mkt')) return h('p', { class: 'note', text: 'MKT 소구점 보드에서 가져오기는 MKT 열람 권한이 있으면 보입니다.' });
    var taken = {}; list.forEach(function (p) { if (p.mktId) taken[p.mktId] = 1; });
    var rank = { pick: 0, review: 1, idea: 2, hold: 3 }, LB = { pick: '확정', review: '검토', idea: '아이디어', hold: '보류' };
    var items = VG.mkt.slice().sort(function (a, b) { return (rank[a.status] == null ? 9 : rank[a.status]) - (rank[b.status] == null ? 9 : rank[b.status]); });
    return ui.panel('From MKT · 소구점 보드에서 가져오기', h('a', { class: 'meta', href: '/mkt/', target: '_blank', rel: 'opener', text: 'MKT 열기 ↗' }),
      !VG.mktOk ? ui.empty('불러오는 중…') : !items.length ? ui.empty('MKT 소구점 보드가 아직 비어 있습니다. MKT에서 적으면 여기서 골라 가져올 수 있습니다.')
        : h('ul', { class: 'list' }, items.map(function (m) {
          return h('li', null, h('div', { class: 'grow' }, ui.tag(LB[m.status] || m.status, m.status === 'pick' ? 'red' : 'mute'), ' ', h('b', { text: m.title }),
            m.body ? h('p', { class: 'vg-pt-proof', text: m.body.slice(0, 160) }) : null),
            taken[m.id] ? h('span', { class: 'meta', text: '가져옴' }) : ui.btn('가져오기', function () {
              savePt(null, { product: prod, title: m.title.slice(0, 120), proof: (m.body || '').slice(0, 1000), tag: '효과', order: nextOrder(list), src: 'mkt', mktId: m.id })
                .then(function () { ui.toast('가져왔습니다. 분류는 수정에서 바꿀 수 있습니다.'); });
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
