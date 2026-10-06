/* fillts HR — 1) 공지사항: 공지(중요·고정·읽음 확인) · 소식과 칭찬 */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var editId = null;

  function readOf(id) {
    return HR.load('read:' + id, function () { return db.doc('hr_notice/' + id + '/reads/' + S.mid).get().then(function (s) { return s.exists; }); });
  }
  function sorted() {
    return S.notices.slice().sort(function (a, b) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt && a.createdAt ? b.createdAt.toMillis() - a.createdAt.toMillis() : 0);
    });
  }

  function listView(view) {
    var ul = h('ul', { class: 'notice-list' });
    sorted().forEach(function (n) {
      var read = readOf(n.id);
      ul.appendChild(h('li', { class: read === false ? 'unread' : '' },
        h('a', { href: '#notice/' + n.id, class: 'notice-row' },
          h('div', { class: 'grow' },
            h('div', { class: 'notice-title' }, n.pinned ? ui.tag('고정', 'mute') : null, n.important ? ui.tag('중요', 'red') : null, ' ', n.title),
            h('div', { class: 'meta', text: HR.name(n.authorMid) + ' · ' + fmt.ts(n.createdAt) + (read === false ? ' · 읽지 않음' : '') })),
          h('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }))));
    });
    if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '아직 공지가 없습니다.' }));
    ui.put(view, S.isAdmin ? h('div', { class: 'toolbar' }, h('a', { class: 'btn btn-sm', href: '#notice/new', text: '공지 작성' })) : null, ul);
  }

  function detail(view, id) {
    var n = S.notices.filter(function (x) { return x.id === id; })[0];
    if (!n) { ui.put(view, ui.empty('공지를 찾을 수 없습니다.')); return; }
    var read = readOf(id);
    var ack = read ? ui.tag('확인함', 'ok') : ui.btn('확인했습니다', function () {
      db.doc('hr_notice/' + id + '/reads/' + S.mid).set({ at: FV.serverTimestamp() }).then(function () { HR.invalidate('read:' + id); HR.invalidate('reads:' + id); ui.toast('확인을 남겼습니다.'); }).catch(ui.fail);
    }, 'btn-sm');
    var admin = null;
    if (S.isAdmin) {
      var reads = HR.load('reads:' + id, function () { return db.collection('hr_notice/' + id + '/reads').get().then(function (s) { return s.docs.map(function (d) { return d.id; }); }); }) || [];
      var all = HR.memberList(false), notYet = all.filter(function (m) { return reads.indexOf(m.id) < 0; });
      admin = ui.panel('읽음 확인 ' + reads.length + ' / ' + all.length, h('div', { class: 'row' },
        h('a', { class: 'link', href: '#notice/edit/' + id, text: '수정' }),
        ui.confirmBtn('삭제', function () { db.doc('hr_notice/' + id).delete().then(function () { HR.go('notice'); }).catch(ui.fail); })),
        notYet.length ? h('p', { class: 'muted small', text: '미확인: ' + notYet.map(function (m) { return m.name; }).join(', ') }) : h('p', { class: 'muted small', text: '모든 구성원이 확인했습니다.' }));
    }
    ui.put(view,
      h('a', { href: '#notice', class: 'back', text: '← 공지사항' }),
      h('article', { class: 'notice-article' },
        h('div', { class: 'label' }, n.important ? '중요 공지' : '공지', '  ·  ', fmt.ts(n.createdAt), '  ·  ', HR.name(n.authorMid)),
        h('h2', { class: 'notice-h', text: n.title }),
        h('div', { class: 'notice-body', text: n.body || '' }),
        h('div', { class: 'row' }, ack)),
      admin);
  }

  function editor(view, id) {
    var n = id ? S.notices.filter(function (x) { return x.id === id; })[0] || {} : {};
    var title = ui.input({ id: 'ntTitle', maxlength: '120', value: n.title || '' });
    var body = h('textarea', { id: 'ntBody', rows: '12', maxlength: '10000' }); body.value = n.body || '';
    var pinned = h('input', { type: 'checkbox', checked: !!n.pinned }), important = h('input', { type: 'checkbox', checked: !!n.important }), m = ui.msg();
    var form = h('form', { class: 'panel' },
      ui.field('제목', title), ui.field('내용', body),
      h('div', { class: 'row' }, h('label', { class: 'check' }, pinned, ' 상단 고정'), h('label', { class: 'check' }, important, ' 중요 공지 (메일 발송 + 읽음 확인 요청)')),
      m, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit', text: id ? '수정' : '게시' }), h('a', { class: 'btn btn-line', href: id ? '#notice/' + id : '#notice', text: '취소' })),
      h('p', { class: 'note', text: '게시하면 전 구성원에게 웹 알림과 Slack 채널 공지가 가고, 중요 공지는 회사 메일로도 발송됩니다. 취업규칙 변경 공지는 근로기준법 제14조에 따라 상시 게시해야 합니다.' }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!title.value.trim() || !body.value.trim()) return ui.err(m, '제목과 내용을 입력하세요.');
      var d = { title: title.value.trim(), body: body.value.trim(), pinned: pinned.checked, important: important.checked, updatedAt: FV.serverTimestamp() };
      var job = id ? db.doc('hr_notice/' + id).update(d) : db.collection('hr_notice').add(Object.assign(d, { authorMid: S.mid, createdAt: FV.serverTimestamp() }));
      job.then(function (ref) { ui.toast(id ? '수정했습니다.' : '게시했습니다. 구성원에게 알림이 갑니다.'); HR.go('notice/' + (id || ref.id)); }).catch(function (x) { ui.fail(x, m); });
    });
    ui.put(view, h('a', { href: '#notice', class: 'back', text: '← 공지사항' }), form);
  }

  /* ---------- 소식 · 칭찬 ---------- */
  function feed(view) {
    var text = h('textarea', { id: 'fdText', rows: '3', maxlength: '1000', placeholder: '팀에 공유할 소식이나 동료에게 고마운 점을 남겨 주세요' });
    var to = ui.select([['', '소식 (전체)']].concat(HR.memberList(false).filter(function (m) { return m.id !== S.mid; }).map(function (m) { return [m.id, '칭찬 → ' + m.name]; })), '', { id: 'fdTo' });
    var form = h('form', { class: 'panel' }, ui.field('새 글', text), h('div', { class: 'row between' }, to, h('button', { class: 'btn btn-sm', type: 'submit', text: '올리기' })));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = text.value.trim(); if (!v) return;
      var d = { authorMid: S.mid, text: v, kind: to.value ? 'praise' : 'post', likes: {}, createdAt: FV.serverTimestamp() };
      if (to.value) d.toMid = to.value;
      db.collection('hr_feed').add(d).then(function () { text.value = ''; ui.toast(to.value ? HR.name(to.value) + '님에게 칭찬을 보냈어요.' : '소식을 올렸습니다.'); }).catch(ui.fail);
    });
    var ul = h('ul', { class: 'feed' });
    S.feed.forEach(function (f) {
      var likes = f.likes || {}, n = Object.keys(likes).filter(function (k) { return likes[k]; }).length, liked = !!likes[S.mid];
      ul.appendChild(h('li', { class: f.kind === 'praise' ? 'praise' : '' },
        h('div', { class: 'grow' },
          h('div', { class: 'meta' }, f.kind === 'praise' ? ui.tag('Praise', 'ok') : null, ' ', HR.name(f.authorMid) + (f.toMid ? ' → ' + HR.name(f.toMid) : '') + ' · ' + fmt.ts(f.createdAt)),
          h('div', { class: 'body', text: f.text }),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'like' + (liked ? ' on' : ''), 'aria-pressed': String(liked), text: '고마워요 ' + (n || ''), onclick: function () {
              var u = {}; u['likes.' + S.mid] = !liked; db.doc('hr_feed/' + f.id).update(u).catch(ui.fail);
            } }),
            f.authorMid === S.mid || S.isAdmin ? ui.confirmBtn('삭제', function () { db.doc('hr_feed/' + f.id).delete().catch(ui.fail); }) : null))));
    });
    if (!ul.children.length) ul.appendChild(h('li', { class: 'empty', text: '아직 소식이 없습니다. 첫 글을 남겨 보세요.' }));
    ui.put(view, h('div', { class: 'two-col' }, form, ui.panel('Feed', null, ul)));
  }

  /* ---------- 마일스톤: 브랜드 핵심 목표 7항목 (hr_plan/milestones — 로그인 구성원만, 공개 저장소에 숫자를 싣지 않는다) ---------- */
  function milestones(view) {
    if (HR.cache.hr_plan_ms && !HR.cache.hr_plan_ms.loading && Date.now() - HR.cache.hr_plan_ms.at > 15000) delete HR.cache.hr_plan_ms;   // 열 때 최신으로
    var P = HR.load('hr_plan_ms', function () { return db.doc('hr_plan/milestones').get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : null; }); });
    if (!P) { var c = HR.cache.hr_plan_ms; return ui.put(view, ui.empty(c && c.at && !c.loading ? '등록된 마일스톤이 없습니다.' : '불러오는 중…')); }
    var lanes = h('div', { class: 'ms-lanes' }, P.sections.map(function (sec) {
      return h('section', { class: 'ms-lane ms-' + sec.id },
        h('div', { class: 'ms-head' }, h('span', { class: 'ms-no', text: sec.no }), h('b', { text: sec.name })),
        h('ol', { class: 'ms-track' }, sec.items.map(function (it) {
          return h('li', { class: (it.key ? 'key ' : '') + (it.tbd ? 'tbd' : '') }, h('span', { class: 'ms-when', text: it.when }), h('span', { class: 'ms-dot' }),
            h('span', { class: 'ms-title', text: it.title }), it.sub ? h('span', { class: 'ms-sub', text: it.sub }) : null);
        })));
    }));
    ui.put(view,
      h('div', { class: 'ms-hero' }, h('div', { class: 'label', text: 'Milestones · ' + fmt.dot(P.asOf) + ' 기준' }), h('h2', { class: 'ms-headline', text: P.headline }), h('p', { class: 'muted', text: P.lead }),
        h('div', { class: 'ms-kpis' }, (P.kpis || []).map(function (k) { return h('div', null, h('span', { class: 'meta', text: k[0] }), h('b', { text: k[1] })); }))),
      h('div', { class: 'org-wrap' }, lanes),
      h('p', { class: 'note', text: '빨간 점은 그 항목의 핵심 목표 지점입니다. 목표가 바뀌면 이 화면이 함께 갱신됩니다.' }));
  }

  /* ---------- 01 바인그라피 — 브랜드 미션 · 주요사항 (hr_plan/brand) ---------- */
  function brandPage(view) {
    if (HR.cache.hr_plan_brand && !HR.cache.hr_plan_brand.loading && Date.now() - HR.cache.hr_plan_brand.at > 15000) delete HR.cache.hr_plan_brand;
    var B = HR.load('hr_plan_brand', function () { return db.doc('hr_plan/brand').get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : null; }); });
    if (!B) { var c = HR.cache.hr_plan_brand; return ui.put(view, ui.empty(c && c.at && !c.loading ? '아직 내용이 없습니다.' : '불러오는 중…')); }
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
      B.goal ? h('section', { class: 'br-goal' }, h('span', { class: 'br-goal-label', text: B.goal.label }), h('b', { class: 'br-goal-v', text: B.goal.value }), B.goal.d ? h('p', { text: B.goal.d }) : null) : null,
      (B.logos || []).length ? ui.panel('Logo · 로고 다운로드', null, h('p', { class: 'muted small', text: '외부 전달 · 제작물에는 이 파일만 씁니다. 색 · 비율을 바꾸지 마세요.' }),
        h('div', { class: 'br-logos' }, B.logos.map(function (x) {
          return h('div', { class: 'br-logo' + (x.dark ? ' dark' : '') }, h('div', { class: 'br-logo-img' }, h('img', { src: x.src, alt: x.name, loading: 'lazy' })),
            h('b', { text: x.name }), x.d ? h('span', { class: 'meta', text: x.d }) : null,
            h('div', { class: 'row' }, (x.files || [{ t: '다운로드', src: x.src }]).map(function (f) { return h('a', { class: 'btn btn-line btn-xs', href: f.src, download: '', text: '↓ ' + f.t }); })));
        }))) : null);
  }

  /* ---------- 일하는 법 (hr_plan/howwework — 노션 「일하는 방식」 정리본) ---------- */
  function howWeWork(view) {
    if (HR.cache.hr_plan_hww && !HR.cache.hr_plan_hww.loading && Date.now() - HR.cache.hr_plan_hww.at > 15000) delete HR.cache.hr_plan_hww;
    var P = HR.load('hr_plan_hww', function () { return db.doc('hr_plan/howwework').get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : null; }); });
    if (!P) { var c = HR.cache.hr_plan_hww; return ui.put(view, ui.empty(c && c.at && !c.loading ? '아직 내용이 없습니다.' : '불러오는 중…')); }
    var lines = function (t) { return String(t || '').split('\n').map(function (x, i) { return [i ? h('br') : null, x]; }); };
    ui.put(view,
      h('div', { class: 'hww-hero' }, h('div', { class: 'label', text: 'How we work · 필츠가 일하는 방식' }), h('h2', { class: 'hww-intro' }, P.intro.map(function (x, i) { return [i ? h('br') : null, x]; }))),
      h('div', { class: 'hww-principles' }, P.principles.map(function (x) {
        return h('section', { class: 'hww-p' }, h('span', { class: 'hww-no', text: x.no }), h('h3', { text: x.title }), h('blockquote', null, lines(x.quote)), h('p', null, lines(x.body)));
      })),
      h('p', { class: 'hww-note', text: P.note }),
      ui.panel('Growth · ' + P.growth.title, null, h('p', { class: 'muted small', text: P.growth.lead }),
        h('div', { class: 'hww-growth' }, P.growth.items.map(function (x, i) {
          return [i ? h('span', { class: 'hww-x', text: '×' }) : null, h('div', { class: 'hww-g' }, h('div', { class: 'hww-g-head' }, h('b', { text: x.k }), h('span', { class: 'hww-han', text: x.h })), h('span', { class: 'hww-g-t', text: x.t }), h('p', { text: x.d }))];
        }))),
      ui.panel('Happiness · ' + P.happy.title, null, h('p', { class: 'muted small', text: P.happy.lead }),
        h('ol', { class: 'hww-happy' }, P.happy.items.map(function (x) { return h('li', null, h('div', null, h('b', { text: x.k }), h('span', { class: 'meta', text: ' — ' + x.t })), h('p', { text: x.d })); }))),
      ui.panel('Culture · ' + P.culture.title, null, h('p', { class: 'muted small', text: P.culture.lead }),
        h('ol', { class: 'hww-culture' }, P.culture.items.map(function (x, i) { return h('li', null, h('span', { class: 'hww-cn', text: ('0' + (i + 1)).slice(-2) }), h('div', null, h('b', { text: x.t }), h('p', { text: x.d }))); }))));
  }

  /* ---------- 필츠그라피 — 경영자의 2주 일기 (hr_diary) ----------
     구성원은 올라온 글만 본다. 관리자 모드에서만 프리셋 작성칸(임시저장 · 올리기)이 보인다. */
  var DIARY = [
    ['highlight', '2주간의 하이라이트', '이번 2주 가장 중요했던 장면 3가지'],
    ['result', '성과 노트', '숫자 · 결과 · 완료한 일 (무엇이 얼마나)'],
    ['knowhow', '새로운 노하우', '이번에 새로 알게 된 것 · 다음에 바로 쓸 방법'],
    ['special', '특이사항', '이슈 · 변화 · 리스크 · 감사한 일'],
    ['notice', '공지사항', '구성원이 알아야 할 것 · 다음 2주 계획']
  ];
  var DIARY_ANCHOR = '2026-01-05';   // 월요일 — 여기서부터 2주 단위로 자른다
  var diaryDraft = null, diaryOpen = {}, previewing = false;
  function dn(d) { return Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5); }
  function dd(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function blockOf(day, shift) { var a = dn(DIARY_ANCHOR), k = Math.floor((dn(day) - a) / 14) + (shift || 0); return { start: dd(a + k * 14), end: dd(a + k * 14 + 13) }; }
  function periodText(x) { return fmt.dot(x.start).slice(2) + ' – ' + fmt.dot(x.end).slice(5); }
  function diaries() {
    return HR.load('hr_diary:' + (S.isAdmin ? 'all' : 'pub'), function () {
      var q = S.isAdmin ? db.collection('hr_diary') : db.collection('hr_diary').where('published', '==', true);
      return q.get().then(HR.rows);
    }) || [];
  }
  function diaryForm(view, cur) {
    var d = diaryDraft, m = ui.msg();
    var per = h('div', { class: 'dy-period' },
      ui.btn('◀', function () { var b = blockOf(d.start, -1); d.start = b.start; d.end = b.end; HR.refresh(); }, 'btn-line btn-xs'),
      h('b', { text: periodText(d) }), h('span', { class: 'meta', text: '2주' }),
      ui.btn('▶', function () { var b = blockOf(d.start, 1); d.start = b.start; d.end = b.end; HR.refresh(); }, 'btn-line btn-xs'));
    var title = h('input', { type: 'text', maxlength: '80', value: d.title, placeholder: '이번 2주를 한 줄로 (비우면 기간이 제목이 됩니다)', oninput: function () { d.title = this.value; } });
    var isIns = d.kind === 'insight';
    var kindTog = h('div', { class: 'dy-kind' }, [['diary', '2주 일기'], ['insight', '인사이트 · 스페셜']].map(function (k) {
      return h('button', { type: 'button', class: d.kind === k[0] || (!d.kind && k[0] === 'diary') ? 'on' : '', text: k[1], onclick: function () { d.kind = k[0]; HR.refresh(); } });
    }));
    var save = function (pub) {
      if (isIns) {
        if (!d.title.trim() || !(d.body || '').trim()) return ui.err(m, '제목과 본문을 적어 주세요.');
        var idata = { kind: 'insight', start: d.start, end: d.end, title: d.title.trim(), subtitle: (d.subtitle || '').trim(), body: d.body.trim(), sec: {}, published: pub, by: S.mid, updatedAt: FV.serverTimestamp() };
        var iop = cur ? db.doc('hr_diary/' + cur.id).update(idata) : db.collection('hr_diary').add(Object.assign(idata, { at: FV.serverTimestamp() }));
        return iop.then(function () { diaryDraft = null; HR.invalidate('hr_diary'); ui.toast(pub ? (cur && cur.published ? '수정했습니다. 알림은 가지 않습니다.' : '최종 업로드했습니다. 구성원에게 알림이 갑니다.') : '임시저장했습니다. 대표님에게만 보입니다.'); }).catch(function (x) { ui.fail(x, m); });
      }
      var body = {}, any = false;
      DIARY.forEach(function (x) { body[x[0]] = (d.sec[x[0]] || '').trim(); if (body[x[0]]) any = true; });
      if (!any) return ui.err(m, '한 칸 이상 적어 주세요.');
      var data = { kind: 'diary', start: d.start, end: d.end, title: d.title.trim(), sec: body, published: pub, by: S.mid, updatedAt: FV.serverTimestamp() };
      var op = cur ? db.doc('hr_diary/' + cur.id).update(data) : db.collection('hr_diary').add(Object.assign(data, { at: FV.serverTimestamp() }));
      op.then(function () { diaryDraft = null; HR.invalidate('hr_diary'); ui.toast(pub ? (cur && cur.published ? '수정했습니다. 알림은 가지 않습니다.' : '최종 업로드했습니다. 구성원에게 알림이 갑니다.') : '임시저장했습니다. 대표님에게만 보입니다.'); }).catch(function (x) { ui.fail(x, m); });
    };
    return h('form', { class: 'panel dy-form', onsubmit: function (e) { e.preventDefault(); save(true); } },
      h('div', { class: 'dy-form-head' }, ui.label((cur ? 'Edit' : 'New') + ' · 필츠그라피 (관리자 전용 작성칸)'), per), cur ? null : kindTog,
      ui.field('제목', title),
      isIns ? [ui.field('부제', h('input', { type: 'text', maxlength: '120', value: d.subtitle || '', placeholder: '한 줄 요약', oninput: function () { d.subtitle = this.value; } })),
        ui.field('본문 — ## 소제목 · > 강조 문장 · - 목록', (function () { var ta = h('textarea', { rows: '18', maxlength: '20000', oninput: function () { d.body = this.value; } }); ta.value = d.body || ''; return ta; })())] :
      DIARY.map(function (x, i) {
        var ta = h('textarea', { rows: i < 2 ? '5' : '4', maxlength: '4000', placeholder: x[2] + '\n- 한 줄에 하나씩', oninput: function () { d.sec[x[0]] = this.value; } });
        ta.value = d.sec[x[0]] || '';
        return h('div', { class: 'field dy-f' }, h('label', null, h('span', { class: 'dy-no', text: ('0' + (i + 1)).slice(-2) }), ' ' + x[1]), ta);
      }), m,
      h('div', { class: 'row dy-actions' },
        ui.btn(cur && cur.published ? '나만 보기로 내리기' : '임시저장 (나만 보기)', function () { save(false); }, 'btn-line'),
        ui.btn(d.preview ? '미리보기 닫기' : '미리보기', function () { d.preview = !d.preview; HR.refresh(); }, 'btn-line'),
        h('button', { class: 'btn', type: 'submit', text: cur && cur.published ? '수정 반영 (알림 없음)' : '최종 업로드' }),
        cur || diaryDraft.touched ? ui.btn('닫기', function () { diaryDraft = null; HR.refresh(); }, 'btn-line') : null),
      h('p', { class: 'meta dy-note', text: cur && cur.published ? '이미 게시된 글입니다. 고쳐도 알림은 다시 가지 않습니다.' : '「최종 업로드」를 누르면 구성원 모두에게 공개되고, 알림은 처음 한 번만 갑니다. 그 전까지는 대표님에게만 보입니다.' }));
  }
  // 인사이트 본문: ## 소제목 · > 강조 · - 목록 · 빈 줄 = 문단 (텍스트 노드만)
  // 「## 위협 …」 바로 뒤 「## 대응 …」은 한 묶음(위협 → 대응)으로, 대응은 초록 톤으로 보인다
  function essay(text) {
    var out = h('div', { class: 'ins-body' }), box = out, ul = null, pair = null;
    String(text || '').split('\n').forEach(function (l) {
      var t = l.trim();
      if (!t) { ul = null; return; }
      if (/^##\s/.test(t)) {
        ul = null; var title = t.replace(/^##\s*/, '');
        var kind = /^위협/.test(title) ? 'threat' : /^(필츠의\s*)?대응/.test(title) ? 'sol' : '';
        if (kind === 'threat') { pair = h('div', { class: 'ins-pair' }); out.appendChild(pair); }
        else if (kind === 'sol' && pair) pair.appendChild(h('div', { class: 'ins-arrow', text: '↓ 필츠의 대응' }));
        else pair = null;
        box = h('section', { class: 'ins-sec' + (kind ? ' ' + kind : '') }, h('h4', { text: title }));
        (kind && pair ? pair : out).appendChild(box);
        if (kind === 'sol') pair = null;
        return;
      }
      if (/^>\s?/.test(t)) { ul = null; box.appendChild(h('blockquote', { text: t.replace(/^>\s?/, '') })); return; }
      if (/^[-·•]\s/.test(t)) { if (!ul) { ul = h('ul'); box.appendChild(ul); } ul.appendChild(h('li', { text: t.replace(/^[-·•]\s*/, '') })); return; }
      ul = null; box.appendChild(h('p', { text: t }));
    });
    return out;
  }
  function insightCard(x) {
    var open = !!diaryOpen[x.id], card;
    card = h('article', { class: 'dy-card ins-card' + (x.published ? '' : ' draft') + (open ? ' open' : '') },
      h('div', { class: 'dy-card-head' }, h('span', { class: 'ins-badge', text: 'SPECIAL · 인사이트' }), h('span', { class: 'dy-per', text: periodText(x) }), x.published ? null : ui.tag('임시저장 · 관리자만', 'warn'),
        S.isAdmin && !previewing ? h('a', { href: '#', class: 'link', text: '수정', onclick: function (e) { e.preventDefault(); diaryDraft = { kind: 'insight', start: x.start, end: x.end, title: x.title || '', subtitle: x.subtitle || '', body: x.body || '', sec: {}, id: x.id, touched: true }; HR.refresh(); window.scrollTo(0, 0); } }) : null,
        S.isAdmin && !previewing ? ui.confirmBtn('삭제', function () { db.doc('hr_diary/' + x.id).delete().then(function () { HR.invalidate('hr_diary'); }).catch(ui.fail); }) : null),
      h('h3', { class: 'ins-title', text: x.title }), x.subtitle ? h('p', { class: 'ins-sub', text: x.subtitle }) : null,
      h('span', { class: 'meta', text: HR.name(x.by) + ' · ' + fmt.ts(x.updatedAt || x.at) }),
      essay(x.body),
      h('button', { type: 'button', class: 'ins-more', text: open ? '접기' : '전체 읽기', onclick: function () { diaryOpen[x.id] = !card.classList.contains('open'); card.classList.toggle('open'); this.textContent = card.classList.contains('open') ? '접기' : '전체 읽기'; } }));
    return card;
  }
  function diaryCard(x) {
    if (x.kind === 'insight') return insightCard(x);
    var open = diaryOpen[x.id] !== undefined ? diaryOpen[x.id] : null;
    var secs = DIARY.filter(function (k) { return x.sec && x.sec[k[0]]; });
    return h('article', { class: 'dy-card' + (x.published ? '' : ' draft') },
      h('div', { class: 'dy-card-head' }, h('span', { class: 'dy-per', text: periodText(x) }), x.published ? null : ui.tag('임시저장 · 관리자만', 'warn'),
        S.isAdmin && !previewing ? h('a', { href: '#', class: 'link', text: '수정', onclick: function (e) { e.preventDefault(); diaryDraft = { start: x.start, end: x.end, title: x.title || '', sec: Object.assign({}, x.sec), id: x.id, touched: true }; HR.refresh(); window.scrollTo(0, 0); } }) : null,
        S.isAdmin && !previewing ? ui.confirmBtn('삭제', function () { db.doc('hr_diary/' + x.id).delete().then(function () { HR.invalidate('hr_diary'); }).catch(ui.fail); }) : null),
      h('h3', { class: 'dy-title', text: x.title || (periodText(x) + ' 일기') }),
      h('span', { class: 'meta', text: HR.name(x.by) + ' · ' + fmt.ts(x.updatedAt || x.at) }),
      h('div', { class: 'dy-secs' + (open === false ? ' folded' : '') }, secs.map(function (k) {
        return h('section', { class: 'dy-sec s-' + k[0] }, h('h4', { text: k[1] }), h('div', { class: 'dy-text' }, String(x.sec[k[0]]).split('\n').map(function (l) {
          var t = l.replace(/^\s*[-·•]\s*/, ''); return l.trim() ? h('p', { class: /^\s*[-·•]/.test(l) ? 'li' : '', text: t }) : null;
        })));
      })));
  }
  function diaryPage(view) {
    var list = diaries().slice().sort(function (a, b) { return (b.start || '') < (a.start || '') ? -1 : (b.start || '') > (a.start || '') ? 1 : ms(b.at) - ms(a.at); });
    ui.put(view, h('section', { class: 'dy-hero' }, h('span', { class: 'dy-kicker', text: 'FILLTSGRAPHY · 경영자의 2주 일기' }),
      h('p', { text: '2주마다 대표가 직접 쓰는 기록입니다. 하이라이트 · 성과 · 새로 알게 된 것 · 특이사항 · 공지를 한곳에 모으고, 때때로 SPECIAL 인사이트를 올립니다.' })));
    if (S.isAdmin) {
      var cur = diaryDraft && diaryDraft.id ? list.filter(function (x) { return x.id === diaryDraft.id; })[0] : null;
      if (!diaryDraft) { var b = blockOf(fmt.today()); diaryDraft = { start: b.start, end: b.end, title: '', sec: {} }; }
      ui.put(view, diaryForm(view, cur));
      if (diaryDraft.preview) {
        var d0 = diaryDraft, sec = {};
        DIARY.forEach(function (k) { sec[k[0]] = (d0.sec[k[0]] || '').trim(); });
        var pv = { id: '__preview', kind: d0.kind === 'insight' ? 'insight' : 'diary', start: d0.start, end: d0.end, title: (d0.title || '').trim(), subtitle: (d0.subtitle || '').trim(), body: d0.body || '', sec: sec, published: true, by: S.mid };
        previewing = true; diaryOpen.__preview = true;
        var card = diaryCard(pv); previewing = false;
        ui.put(view, h('section', { class: 'dy-preview' }, h('div', { class: 'dy-preview-head' }, h('b', { text: '미리보기' }), h('span', { class: 'meta', text: '구성원에게 이렇게 보입니다 · 아직 저장되지 않았습니다' })), card));
      }
    }
    var shown = list.filter(function (x) { return S.isAdmin || x.published; });
    ui.put(view, shown.length ? h('div', { class: 'dy-list' }, shown.map(diaryCard)) : ui.empty('아직 올라온 글이 없습니다. 첫 번째 2주 일기를 기다려 주세요.'));
  }

  // 새 글 표시: 공지 · 소식·칭찬 · 필츠그라피 — 그 탭을 마지막으로 본 뒤 남이 올린 글이 있으면 탭 오른쪽 위에 NEW
  function ms(t) { return t && t.toMillis ? t.toMillis() : 0; }
  function seenKey(tab) { return 'hrSeen:' + S.mid + ':' + (tab || 'notice'); }
  function seenAt(tab) { try { var v = +localStorage.getItem(seenKey(tab)); return v || Date.now() - 7 * 864e5; } catch (e) { return 0; } }
  function markSeen(tab) { try { localStorage.setItem(seenKey(tab), String(Date.now())); } catch (e) { /* 무시 */ } }
  function latestOf(tab) {
    var mine = function (by) { return by === S.mid; }, mx = 0;
    if (tab === '') (S.notices || []).forEach(function (n) { if (!mine(n.authorMid)) mx = Math.max(mx, ms(n.updatedAt), ms(n.createdAt)); });
    if (tab === 'feed') (S.feed || []).forEach(function (f) { if (!mine(f.authorMid)) mx = Math.max(mx, ms(f.createdAt)); });
    if (tab === 'diary') diaries().forEach(function (x) { if (x.published && !mine(x.by)) mx = Math.max(mx, ms(x.updatedAt), ms(x.at)); });
    return mx;
  }

  HR.register('notice', {
    render: function (view, parts) {
      var sub = parts[0] || '';
      if (sub === 'new' && S.isAdmin) return editor(view, null);
      if (sub === 'edit' && S.isAdmin) return editor(view, parts[1]);
      if (sub && sub !== 'feed' && sub !== 'milestone' && sub !== 'how' && sub !== 'brand' && sub !== 'diary') return detail(view, sub);
      var nt = ui.tabs([['', '공지'], ['feed', '소식 · 칭찬'], ['diary', '필츠그라피'], ['how', '일하는 법'], ['milestone', '마일스톤'], ['brand', '01 바인그라피']], sub, 'notice');
      nt.classList.add('nt-split');
      [['', 0], ['feed', 1], ['diary', 2]].forEach(function (t) {
        if (t[0] === sub) { markSeen(t[0]); return; }
        if (latestOf(t[0]) > seenAt(t[0])) { var a = nt.children[t[1]]; a.classList.add('has-new'); a.appendChild(h('sup', { class: 'tab-new', text: 'NEW' })); }
      });   // 공지 · 소식 | 필츠그라피 | 회사 안내
      nt.insertBefore(h('span', { class: 'ws-sub-sep', 'aria-hidden': 'true' }), nt.children[3]); nt.insertBefore(h('span', { class: 'ws-sub-sep', 'aria-hidden': 'true' }), nt.children[2]);
      ui.put(view, ui.head('Notice', '공지사항'), nt);
      if (sub === 'feed') feed(view); else if (sub === 'milestone') milestones(view); else if (sub === 'how') howWeWork(view); else if (sub === 'brand') brandPage(view); else if (sub === 'diary') diaryPage(view); else listView(view);
    }
  });
})();
