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
        h('blockquote', { class: 'br-quote', text: B.definition.quote })),
      sec('Her', B.her, [h('div', { class: 'br-traits' }, h('span', { class: 'br-traits-lead', text: B.her.target }), B.her.traits.map(function (t) { return h('span', { class: 'chip', text: t }); })),
        h('div', { class: 'br-points' }, B.her.points.map(function (x) { return h('div', null, h('b', { text: x.k }), h('p', { text: x.d })); }))]),
      sec('Tasks', B.tasks, h('div', { class: 'br-tasks' }, B.tasks.items.map(function (x) { return h('div', { class: 'br-task' }, h('span', { class: 'br-e', text: x.e }), h('b', { text: x.k }), h('p', { text: x.d })); }))),
      sec('Words', B.words, h('div', { class: 'br-words' }, B.words.items.map(function (w) { return h('span', { text: w }); }))),
      sec('Stages', B.stages, h('ol', { class: 'br-stages' }, B.stages.items.map(function (x, i) { return h('li', null, h('span', { class: 'br-no', text: ('0' + (i + 1)).slice(-2) }), h('b', { text: x.k }), h('span', { class: 'meta', text: x.d })); }))),
      sec('Tone & Manner', B.tone, h('div', { class: 'br-tone' }, B.tone.items.map(function (x) { return h('div', null, h('b', { text: '# ' + x.k }), h('p', { text: x.d })); }))),
      sec('Channel', B.channel, h('ol', { class: 'br-channel' }, B.channel.items.map(function (x) { return h('li', null, h('b', { text: x.k }), h('span', { text: x.d })); }))),
      h('p', { class: 'meta br-src', text: '출처 · ' + B.source }));
  }

  /* ---------- 일하는 법 (hr_plan/howwework — 노션 「일하는 방식」 정리본) ---------- */
  function howWeWork(view) {
    if (HR.cache.hr_plan_hww && !HR.cache.hr_plan_hww.loading && Date.now() - HR.cache.hr_plan_hww.at > 15000) delete HR.cache.hr_plan_hww;
    var P = HR.load('hr_plan_hww', function () { return db.doc('hr_plan/howwework').get().then(function (s) { return s.exists ? JSON.parse(s.data().json) : null; }); });
    if (!P) { var c = HR.cache.hr_plan_hww; return ui.put(view, ui.empty(c && c.at && !c.loading ? '아직 내용이 없습니다.' : '불러오는 중…')); }
    var lines = function (t) { return String(t || '').split('\n').map(function (x, i) { return [i ? h('br') : null, x]; }); };
    ui.put(view,
      h('div', { class: 'hww-hero' }, h('div', { class: 'label', text: 'How we work · 바인그라피가 일하는 방식' }), h('h2', { class: 'hww-intro' }, P.intro.map(function (x, i) { return [i ? h('br') : null, x]; }))),
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

  HR.register('notice', {
    render: function (view, parts) {
      var sub = parts[0] || '';
      if (sub === 'new' && S.isAdmin) return editor(view, null);
      if (sub === 'edit' && S.isAdmin) return editor(view, parts[1]);
      if (sub && sub !== 'feed' && sub !== 'milestone' && sub !== 'how' && sub !== 'brand') return detail(view, sub);
      ui.put(view, ui.head('Notice', '공지사항'), ui.tabs([['', '공지'], ['brand', '01 바인그라피'], ['milestone', '마일스톤'], ['how', '일하는 법'], ['feed', '소식 · 칭찬']], sub, 'notice'));
      if (sub === 'feed') feed(view); else if (sub === 'milestone') milestones(view); else if (sub === 'how') howWeWork(view); else if (sub === 'brand') brandPage(view); else listView(view);
    }
  });
})();
