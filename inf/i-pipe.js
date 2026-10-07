/* fillts Influencer — Overview · 파이프라인(칸반 / 표) · 인플루언서 상세(연락 · 메일 문의 · 계약 · 시딩 · 업로드 · 기록) */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var V = I.V.pipe = { mode: 'board', owner: '', q: '', showDrop: false, mail: {}, refreshing: {} };
  var FLOW = I.STAGES.filter(function (s) { return s.id !== 'drop'; });

  function ownerName(c) { return c.owner ? HR.name(c.owner) : '담당 없음'; }
  function filtered() {
    var q = V.q.trim().toLowerCase();
    return I.creators.filter(function (c) {
      if (V.owner === 'me' && c.owner !== S.mid) return false;
      if (q && ((c.ch.title || '') + ' ' + (c.ch.handle || '') + ' ' + (c.email || '') + ' ' + (c.tags || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function byRecent(a, b) { return I.ms(b.updatedAt) - I.ms(a.updatedAt); }

  /* ============ Overview ============ */
  function home(view) {
    var all = I.creators, cnt = function (ids) { return all.filter(function (c) { return ids.indexOf(c.stage || 'review') >= 0; }).length; };
    var kpi = h('dl', { class: 'summary' }, [['파이프라인', all.filter(function (c) { return c.stage !== 'drop'; }).length + '명'], ['디벨롭 · 컨택', cnt(['review', 'contact']) + '명'],
      ['메일 문의 (회신 대기)', cnt(['mailed']) + '명'], ['협의 · 계약', cnt(['talk', 'contract']) + '명'], ['시딩 · 업로드 대기', cnt(['seeding', 'waiting']) + '명'], ['완료', cnt(['done']) + '명']]
      .map(function (p) { return h('div', null, h('dt', { text: p[0] }), h('dd', { text: p[1] })); }));
    var max = Math.max.apply(null, FLOW.map(function (s) { return I.byStage(s.id).length; }).concat([1]));
    var funnel = h('div', { class: 'in-funnel' }, FLOW.map(function (s) {
      var n = I.byStage(s.id).length, f = h('span', { class: 'in-funnel-fill ' + s.cls }); f.style.width = Math.max(n ? 3 : 0, Math.round((n / max) * 100)) + '%';
      return h('a', { class: 'in-funnel-row', href: '#pipe' }, h('span', { class: 'in-funnel-k', text: s.name }), h('span', { class: 'in-funnel-bar' }, f), h('b', { text: String(n) }));
    }));
    var todos = [];
    all.forEach(function (c) { if (c.stage !== 'drop' && c.stage !== 'done') I.todos(c).forEach(function (t) { todos.push({ c: c, t: t }); }); });
    todos.sort(function (a, b) { return (b.t.red ? 1 : 0) - (a.t.red ? 1 : 0) || I.ST[b.c.stage].no - I.ST[a.c.stage].no; });
    var mine = todos.filter(function (x) { return x.c.owner === S.mid; });
    var todoList = function (list) {
      return list.length ? h('ul', { class: 'list' }, list.slice(0, 14).map(function (x) {
        return h('li', { class: 'clickable', tabindex: '0', onclick: function () { HR.go('c/' + x.c.id); } }, I.thumb(x.c.ch, 'sm'),
          h('div', { class: 'grow' }, h('div', { class: 'strong', text: x.c.ch.title }), h('div', { class: 'meta' + (x.t.red ? ' red' : ''), text: x.t.t })),
          I.stTag(x.c.stage), h('span', { class: 'meta', text: ownerName(x.c) }));
      })) : ui.empty('지금 챙길 일이 없습니다.');
    };
    var acts = [];
    all.forEach(function (c) { (c.log || []).forEach(function (l) { acts.push({ c: c, l: l }); }); });
    acts.sort(function (a, b) { return I.ms(b.l.at) - I.ms(a.l.at); });
    ui.put(view,
      ui.head('Influencer', 'Overview', h('div', { class: 'row' }, ui.btn('+ 새 탐색', function () { HR.go('find'); }, 'btn-sm'), ui.btn('파이프라인', function () { HR.go('pipe'); }, 'btn-line btn-sm'))),
      kpi,
      h('div', { class: 'in-two' },
        ui.panel('단계별', h('a', { href: '#pipe', class: 'meta', text: '보드 열기 →' }), funnel,
          h('p', { class: 'note', text: '탐색 → 체크 → 디벨롭 → 컨택 예정 → 메일 문의 → 협의 → 계약 → 시딩 → 업로드 대기 → 완료' })),
        ui.panel('챙길 일' + (mine.length ? ' · 내 담당 ' + mine.length : ''), h('span', { class: 'meta', text: todos.length + '건' }), todoList(mine.length ? mine.concat(todos.filter(function (x) { return x.c.owner !== S.mid; })) : todos))),
      h('div', { class: 'in-two' },
        ui.panel('최근 탐색', h('a', { href: '#find', class: 'meta', text: '탐색 →' }),
          I.scans.length ? h('ul', { class: 'list' }, I.scans.slice(0, 5).map(function (s) {
            return h('li', { class: 'clickable', onclick: function () { HR.go('find/' + s.id); } }, I.thumb(s.seed || { title: '조' }, 'sm'),
              h('div', { class: 'grow' }, h('div', { class: 'strong', text: I.scanTitle(s) }), h('div', { class: 'meta', text: (s.concept || []).join(' · ') + ' · 후보 ' + (s.cands || []).length + '명' })),
              h('span', { class: 'meta', text: fmt.ts(s.at) }));
          })) : ui.empty('아직 탐색이 없습니다.')),
        ui.panel('최근 활동', null, acts.length ? h('ul', { class: 'list in-log' }, acts.slice(0, 10).map(function (x) {
          return h('li', { class: 'clickable', onclick: function () { HR.go('c/' + x.c.id); } },
            h('div', { class: 'grow' }, h('div', { class: 'strong', text: x.c.ch.title }), h('div', { class: 'meta', text: x.l.t })),
            h('span', { class: 'meta', text: HR.name(x.l.by) + ' · ' + fmt.ts(x.l.at) }));
        })) : ui.empty('기록이 없습니다.'))));
  }

  /* ============ 파이프라인 ============ */
  var dragId = null;
  function card(c) {
    var t = I.todos(c), d = I.daysSince(c.stageAt), st = I.ST[c.stage || 'review'];
    var prev = I.STAGES[st.no - 1], next = st.id === 'drop' ? null : FLOW[st.no + 1];
    var el = h('div', { class: 'in-card', draggable: 'true', tabindex: '0', onclick: function () { HR.go('c/' + c.id); }, onkeydown: function (e) { if (e.key === 'Enter') HR.go('c/' + c.id); },
      ondragstart: function (e) { dragId = c.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.id); } catch (x) { /* IE */ } this.classList.add('drag'); },
      ondragend: function () { this.classList.remove('drag'); } },
      h('div', { class: 'in-card-top' }, I.thumb(c.ch, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'in-card-t', text: c.ch.title }),
        h('div', { class: 'meta', text: I.cnt(c.ch.subs) + ' · 점수 ' + (c.score || 0) + (c.email ? ' · 메일' : '') }))),
      t.length ? h('div', { class: 'in-card-warn' + (t.some(function (x) { return x.red; }) ? ' red' : ''), text: t[0].t }) : null,
      h('div', { class: 'in-card-foot' }, h('span', { class: 'meta grow', text: ownerName(c) + (d != null ? ' · ' + d + '일째' : '') }),
        prev && st.id !== 'drop' ? h('button', { type: 'button', class: 'in-mv', 'aria-label': '이전 단계', text: '‹', onclick: function (e) { e.stopPropagation(); I.setStage(c, prev.id); } }) : null,
        next ? h('button', { type: 'button', class: 'in-mv', 'aria-label': '다음 단계', text: '›', onclick: function (e) { e.stopPropagation(); I.setStage(c, next.id); } }) : null,
        st.id === 'drop' ? h('button', { type: 'button', class: 'in-mv', text: '되살리기', onclick: function (e) { e.stopPropagation(); I.setStage(c, 'review'); } }) : null));
    return el;
  }
  function column(s, list) {
    var col = h('section', { class: 'in-col' + (s.id === 'drop' ? ' drop' : ''), 'data-st': s.id,
      ondragover: function (e) { e.preventDefault(); this.classList.add('over'); },
      ondragleave: function () { this.classList.remove('over'); },
      ondrop: function (e) { e.preventDefault(); this.classList.remove('over'); var c = I.creator(dragId); dragId = null; if (c) I.setStage(c, s.id); } },
      h('header', { class: 'in-col-head' }, h('div', { class: 'row' }, h('b', { text: s.name }), h('span', { class: 'meta', text: String(list.length) })), h('p', { class: 'meta', text: s.desc })),
      h('div', { class: 'in-col-body' }, list.length ? list.map(card) : h('p', { class: 'in-col-empty', text: '여기로 끌어다 놓기' })));
    return col;
  }
  function pipe(view) {
    var list = filtered();
    var seg = h('div', { class: 'in-seg' }, [['board', '보드'], ['table', '표']].map(function (x) {
      return h('button', { type: 'button', class: V.mode === x[0] ? 'active' : '', text: x[1], onclick: function () { V.mode = x[0]; HR.refresh(); } });
    }));
    var own = ui.select([['', '모든 담당'], ['me', '내 담당']], V.owner, { onchange: function () { V.owner = this.value; HR.refresh(); } });
    var q = ui.input({ value: V.q, placeholder: '채널 · 메일 · 태그 검색 (Enter)', onchange: function () { V.q = this.value; HR.refresh(); } });
    var drops = list.filter(function (c) { return c.stage === 'drop'; });
    var body;
    if (!I.creators.length) body = ui.panel(null, null, ui.empty('파이프라인이 비어 있습니다. 「탐색」에서 씨드 유튜버로 후보를 찾고, 체크해서 디벨롭으로 추가하세요.'), ui.btn('탐색 시작', function () { HR.go('find'); }, 'btn-sm'));
    else if (V.mode === 'table') body = table(list);
    else body = h('div', { class: 'in-board' }, FLOW.map(function (s) {
      return column(s, list.filter(function (c) { return (c.stage || 'review') === s.id; }).sort(byRecent));
    }).concat(V.showDrop ? [column(I.ST.drop, drops.sort(byRecent))] : []));
    ui.put(view,
      ui.head('Pipeline', '파이프라인', ui.btn('+ 새 탐색', function () { HR.go('find'); }, 'btn-sm')),
      h('div', { class: 'toolbar in-toolbar' }, seg, own, q,
        V.mode === 'board' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: V.showDrop, onchange: function () { V.showDrop = this.checked; HR.refresh(); } }), ' 보류 · 거절 보기 (' + drops.length + ')') : null,
        h('span', { class: 'meta grow in-right', text: V.mode === 'board' ? '카드를 끌어 단계를 옮기거나 ‹ › 를 누르세요' : list.length + '명' })),
      body);
  }
  function table(list) {
    list = list.slice().sort(function (a, b) { return I.ST[a.stage || 'review'].no - I.ST[b.stage || 'review'].no || byRecent(a, b); });
    // 엑셀처럼 촘촘하게 — 계약 전 판단에 필요한 예상 견적 · 실제 견적이 한 화면에 보이게
    var W = [0, 74, 58, 40, 60, 0, 92, 86, 0, 74];
    return h('div', { class: 'in-xls-wrap' }, h('table', { class: 'table in-xls in-pipe-xls' },
      h('colgroup', null, W.map(function (w) { var c = h('col'); if (w) c.style.width = w + 'px'; return c; })),
      h('thead', null, h('tr', null, ['채널', '단계', '구독자', '점수', '담당', '메일', '예상 견적', '실제 견적', '다음 할 일', '업데이트'].map(function (x, i) {
        return h('th', { class: i === 2 || i === 3 || i === 6 || i === 7 ? 'num' : '', title: i === 6 ? '전용 영상 1편 어림값 — 중앙 조회수 × 25 ~ 50원' : i === 7 ? '계약 조건에 적은 금액' : null, text: x });
      }))),
      h('tbody', null, list.map(function (c) {
        var t = I.todos(c);
        return h('tr', { class: 'clickable', onclick: function () { HR.go('c/' + c.id); } },
          h('td', null, h('div', { class: 'in-ch in-ch-xs' }, h('div', { class: 'in-ch-t' }, h('div', { class: 'strong in-ell', title: c.ch.title, text: c.ch.title }), h('div', { class: 'meta', text: c.ch.handle || '' })))),
          h('td', null, I.stTag(c.stage)), h('td', { class: 'num', text: I.cnt(c.ch.subs) }), h('td', { class: 'num', text: String(c.score || 0) }),
          h('td', { class: 'in-ell', text: ownerName(c) }), h('td', { class: 'in-ell', title: c.email || '', text: c.email || '—' }),
          h('td', { class: 'num in-est', text: I.estText(c.ch) }),
          h('td', { class: 'num strong', text: c.deal && c.deal.fee ? I.manwon(c.deal.fee) : '' }),
          h('td', { class: 'in-ell' + (t.some(function (x) { return x.red; }) ? ' red' : ''), title: t.length ? t[0].t : (c.next && c.next.text) || '', text: t.length ? t[0].t : (c.next && c.next.text) || '' }),
          h('td', { class: 'meta', text: fmt.ts(c.updatedAt) }));
      }))));
  }

  /* ============ 인플루언서 상세 ============ */
  function stepper(c) {
    var cur = I.ST[c.stage || 'review'];
    return h('ol', { class: 'in-steps' }, FLOW.map(function (s) {
      return h('li', { class: (s.id === cur.id ? 'cur ' : '') + (cur.id !== 'drop' && s.no < cur.no ? 'past' : '') },
        h('button', { type: 'button', text: s.name, title: s.desc, onclick: function () { I.setStage(c, s.id); } }));
    }).concat([h('li', { class: 'drop' + (cur.id === 'drop' ? ' cur' : '') }, h('button', { type: 'button', text: '보류 · 거절', onclick: function () { I.setStage(c, 'drop'); } }))]));
  }
  function form(fields, onSave, extra) {
    var msg = ui.msg();
    return h('div', { class: 'stack sm in-form' }, fields, msg, h('div', { class: 'row' }, ui.btn('저장', function () { onSave(msg); }, 'btn-sm'), extra || null));
  }
  function contactPanel(c) {
    var email = ui.input({ type: 'email', value: c.email || '', maxlength: '200', placeholder: '비즈니스 문의 메일' });
    var mgr = ui.input({ value: c.manager || '', maxlength: '60', placeholder: '본인 / 소속사 · 담당자 이름' });
    var phone = ui.input({ value: c.phone || '', maxlength: '40', placeholder: '선택' });
    var insta = ui.input({ value: c.insta || '', maxlength: '60', placeholder: '인스타 아이디' });
    var owner = ui.select([['', '담당 없음']].concat(HR.memberList().map(function (m) { return [m.id, m.name]; })), c.owner || '');
    var tags = ui.input({ value: (c.tags || []).join(', '), maxlength: '200', placeholder: '쉼표로 구분 — 예: 민감성, 클렌저' });
    var memo = h('textarea', { rows: '4', maxlength: '4000', value: c.memo || '', placeholder: '단가 감 · 채널 특징 · 주의할 점' });
    return ui.panel('연락처 · 담당', c.ch.email && c.ch.email !== c.email ? h('span', { class: 'meta', text: '채널 설명란 메일: ' + c.ch.email }) : null,
      form([h('div', { class: 'row' }, ui.field('메일', email, 'grow'), ui.field('담당 (우리)', owner)),
        h('div', { class: 'row' }, ui.field('상대 담당자', mgr, 'grow'), ui.field('전화', phone), ui.field('인스타', insta)),
        ui.field('태그', tags), ui.field('메모', memo)], function (msg) {
        var em = email.value.trim();
        if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return ui.err(msg, '메일 주소를 확인하세요.');
        var ow = owner.value, logT = ow !== (c.owner || '') ? '담당 → ' + (ow ? HR.name(ow) : '없음') : '';
        I.save(c, { email: em, manager: mgr.value.trim(), phone: phone.value.trim(), insta: insta.value.trim().replace(/^@/, ''), owner: ow,
          tags: tags.value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 20), memo: memo.value.trim() }, logT)
          .then(function () { ui.ok(msg, '저장했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
      }, c.stage === 'review' ? ui.btn('저장 + 컨택 예정으로', function () { I.setStage(c, 'contact'); }, 'btn-line btn-sm') : null));
  }
  function nextPanel(c) {
    var n = c.next || {};
    var text = ui.input({ value: n.text || '', maxlength: '120', placeholder: '예: 단가표 받으면 대표님 보고' });
    var due = ui.input({ type: 'date', value: n.due || '' });
    return ui.panel('다음 할 일', null, form([h('div', { class: 'row' }, ui.field('할 일', text, 'grow'), ui.field('기한', due))], function (msg) {
      I.save(c, { next: { text: text.value.trim(), due: due.value } }, text.value.trim() ? '할 일: ' + text.value.trim() + (due.value ? ' (' + fmt.dot(due.value) + ')' : '') : '')
        .then(function () { ui.ok(msg, '저장했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
    }, n.text ? ui.btn('완료 처리', function () { I.save(c, { next: { text: '', due: '' } }, '할 일 완료: ' + n.text).catch(ui.fail); }, 'btn-line btn-sm') : null));
  }
  function mailPanel(c) {
    var tpls = I.templates(), M = V.mail[c.id];
    if (!M) {
      var t0 = tpls[c.stage === 'mailed' ? Math.min(2, tpls.length - 1) : 0];
      M = V.mail[c.id] = { tpl: t0.id, to: c.email || c.ch.email || '', cc: '', subject: I.fillTpl(t0.subject, c), body: I.fillTpl(t0.body, c), busy: false, msg: '', err: false };
    }
    var tplSel = ui.select(tpls.map(function (t) { return [t.id, t.name]; }), M.tpl, { onchange: function () {
      var t = tpls.filter(function (x) { return x.id === tplSel.value; })[0]; if (!t) return;
      M.tpl = t.id; M.subject = I.fillTpl(t.subject, c); M.body = I.fillTpl(t.body, c); HR.refresh();
    } });
    var to = ui.input({ type: 'email', value: M.to, maxlength: '200', oninput: function () { M.to = this.value; } });
    var cc = ui.input({ value: M.cc, maxlength: '300', placeholder: '선택 — 쉼표로 구분', oninput: function () { M.cc = this.value; } });
    var subj = ui.input({ value: M.subject, maxlength: '150', oninput: function () { M.subject = this.value; } });
    var body = h('textarea', { rows: '14', maxlength: '6000', value: M.body, oninput: function () { M.body = this.value; } });
    var setMsg = function (t, err) { M.msg = t; M.err = !!err; HR.refresh(); };
    var send = ui.btn(M.busy ? '보내는 중…' : 'fillts 메일로 보내기', function () {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(M.to.trim())) return setMsg('받는 사람 메일을 확인하세요.', true);
      M.busy = true; setMsg('');
      I.call('infMail', { creatorId: c.id, to: M.to.trim(), cc: M.cc, subject: M.subject, text: M.body }).then(function () {
        M.busy = false; delete V.mail[c.id]; ui.toast('메일을 보냈습니다 — 메일 문의 단계로 기록했습니다.');
      }).catch(function (e) { M.busy = false; setMsg(e.message, true); });
    }, 'btn-sm');
    if (M.busy) send.disabled = true;
    var gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(M.to) + '&su=' + encodeURIComponent(M.subject) + '&body=' + encodeURIComponent(M.body) + (M.cc ? '&cc=' + encodeURIComponent(M.cc) : '');
    return ui.panel('메일 문의', h('span', { class: 'meta', text: (c.mails ? '보낸 메일 ' + c.mails + '통 · 마지막 ' + fmt.ts(c.lastMailAt) : '아직 보낸 메일 없음') }),
      h('div', { class: 'stack sm in-form' },
        h('div', { class: 'row' }, ui.field('템플릿', tplSel), ui.field('받는 사람', to, 'grow'), ui.field('참조', cc)),
        ui.field('제목', subj), ui.field('본문', body),
        M.msg ? h('p', { class: 'form-msg' + (M.err ? '' : ' ok'), role: 'alert', text: M.msg }) : null,
        h('div', { class: 'row' }, send,
          h('a', { class: 'btn btn-line btn-sm', href: gmail, target: '_blank', rel: 'noopener noreferrer', text: 'Gmail에서 열기 ↗' }),
          ui.btn('보낸 것으로 기록', function () {
            var at = I.now();
            I.save(c, Object.assign({ mails: FV.increment(1), lastMailAt: at }, ['review', 'contact'].indexOf(c.stage) >= 0 ? { stage: 'mailed', stageAt: at } : {}, c.email ? {} : { email: M.to.trim() }),
              '메일 발송(직접) → ' + M.to.trim() + ' · ' + M.subject, 'mail').then(function () { delete V.mail[c.id]; ui.toast('메일 문의로 기록했습니다.'); }).catch(ui.fail);
          }, 'btn-line btn-sm'),
          c.stage === 'mailed' ? ui.btn('회신 받음 → 협의', function () { I.setStage(c, 'talk', '회신 받음'); }, 'btn-line btn-sm') : null),
        h('p', { class: 'note', text: '「fillts 메일로 보내기」는 회사 메일(HR 알림 연동 계정)로 나가고, 회신은 내 메일로 옵니다(나에게 숨은참조). 템플릿 · 브랜드 소개는 「메일」 메뉴에서 고칩니다.' })));
  }
  function dealPanel(c) {
    var d = c.deal || {};
    var type = ui.select([['', '선택']].concat(I.DEAL_TYPES.map(function (x) { return [x, x]; })), d.type || '');
    var fee = ui.input({ inputmode: 'numeric', value: d.fee ? Number(d.fee).toLocaleString('ko-KR') : '', placeholder: '원 (VAT 별도 여부는 메모)' });
    var deliver = ui.input({ value: d.deliver || '', maxlength: '200', placeholder: '예: 유튜브 본편 1 + 쇼츠 1, 고정 댓글 링크' });
    var due = ui.input({ type: 'date', value: d.due || '' });
    var signed = ui.input({ type: 'date', value: d.signed || '' });
    var note = h('textarea', { rows: '3', maxlength: '2000', value: d.note || '', placeholder: '2차 활용 · 광고 표기 · 수정 횟수 · 정산 조건' });
    var val = function () { return { type: type.value, fee: Math.round(+String(fee.value).replace(/[^\d]/g, '') || 0), deliver: deliver.value.trim(), due: due.value, signed: signed.value, note: note.value.trim() }; };
    return ui.panel('계약 조건', h('div', { class: 'row' }, h('span', { class: 'meta', text: '예상 견적 ' + I.estText(c.ch) + ' (전용 영상 1편 어림값)' }), d.type ? ui.tag(d.type + (d.fee ? ' · ' + I.won(d.fee) : ''), 'red') : null),
      form([h('div', { class: 'row' }, ui.field('방식', type), ui.field('금액', fee), ui.field('계약일', signed), ui.field('업로드 예정일', due)),
        ui.field('결과물', deliver), ui.field('조건 메모', note)], function (msg) {
        I.save(c, { deal: val() }, '계약 조건 저장').then(function () { ui.ok(msg, '저장했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
      }, ['talk', 'mailed', 'contact', 'review'].indexOf(c.stage) >= 0 ? ui.btn('저장 + 계약 성사', function () {
        var v = val(); if (!v.signed) v.signed = fmt.today();
        I.save(c, { deal: v, stage: 'contract', stageAt: I.now() }, I.stName(c.stage) + ' → 계약 · ' + (v.type || '조건 미정') + (v.fee ? ' ' + I.won(v.fee) : ''), 'stage').then(function () { ui.toast('계약 성사로 옮겼습니다.'); }).catch(ui.fail);
      }, 'btn-line btn-sm') : null));
  }
  function seedPanel(c) {
    var d = c.seed || {};
    var product = ui.input({ value: d.product || I.cfg.product || '', maxlength: '120', placeholder: '보낼 제품' });
    var qty = ui.input({ type: 'number', min: '1', max: '99', value: d.qty || '1' });
    var sent = ui.input({ type: 'date', value: d.sent || '' });
    var carrier = ui.select([['', '택배사']].concat(I.CARRIERS.map(function (x) { return [x, x]; })), d.carrier || '');
    var track = ui.input({ value: d.track || '', maxlength: '40', placeholder: '송장 번호' });
    var recv = h('input', { type: 'checkbox', checked: !!d.recv });
    var note = ui.input({ value: d.note || '', maxlength: '300', placeholder: '받는 곳 메모 — 주소 · 전화번호 같은 개인정보는 적지 마세요' });
    var val = function () { return { product: product.value.trim(), qty: Math.max(1, +qty.value || 1), sent: sent.value, carrier: carrier.value, track: track.value.trim(), recv: recv.checked, note: note.value.trim() }; };
    var extra = [];
    if (['contract', 'talk', 'mailed', 'contact', 'review'].indexOf(c.stage) >= 0) extra.push(ui.btn('저장 + 시딩(발송)', function () {
      var v = val(); if (!v.sent) v.sent = fmt.today();
      I.save(c, { seed: v, stage: 'seeding', stageAt: I.now() }, I.stName(c.stage) + ' → 시딩 · ' + v.product + ' ' + v.qty + '개 발송', 'stage').then(function () { ui.toast('시딩으로 옮겼습니다.'); }).catch(ui.fail);
    }, 'btn-line btn-sm'));
    if (c.stage === 'seeding') extra.push(ui.btn('수령 확인 → 업로드 대기', function () {
      var v = val(); v.recv = true;
      I.save(c, { seed: v, stage: 'waiting', stageAt: I.now() }, '시딩 → 업로드 대기 · 수령 확인', 'stage').then(function () { ui.toast('업로드 대기로 옮겼습니다.'); }).catch(ui.fail);
    }, 'btn-line btn-sm'));
    var trackLink = d.track && d.carrier ? I.extLink('https://search.naver.com/search.naver?query=' + encodeURIComponent(d.carrier + ' ' + d.track), '배송 조회 ↗', 'meta') : null;
    return ui.panel('시딩 (제품 발송)', trackLink,
      form([h('div', { class: 'row' }, ui.field('제품', product, 'grow'), ui.field('수량', qty), ui.field('발송일', sent)),
        h('div', { class: 'row' }, ui.field('택배사', carrier), ui.field('송장', track, 'grow'), h('label', { class: 'check in-recv' }, recv, ' 수령 확인')),
        ui.field('메모', note)], function (msg) {
        I.save(c, { seed: val() }, '시딩 정보 저장').then(function () { ui.ok(msg, '저장했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
      }, extra));
  }
  function contentPanel(c) {
    var d = c.content || {};
    var url = ui.input({ type: 'url', value: d.url || '', maxlength: '300', placeholder: '업로드된 영상 주소' });
    var at = ui.input({ type: 'date', value: d.at || '' });
    var views = ui.input({ inputmode: 'numeric', value: d.views ? String(d.views) : '', placeholder: '조회수' });
    var note = h('textarea', { rows: '3', maxlength: '2000', value: d.note || '', placeholder: '반응 · 댓글 · 매출 영향 · 재협업 여부' });
    var val = function () { return { url: url.value.trim(), at: at.value, views: Math.round(+String(views.value).replace(/[^\d]/g, '') || 0), note: note.value.trim() }; };
    return ui.panel('업로드 · 성과', d.url ? I.extLink(d.url, '콘텐츠 열기 ↗', 'meta') : null,
      form([h('div', { class: 'row' }, ui.field('콘텐츠 주소', url, 'grow'), ui.field('업로드일', at), ui.field('조회수', views)), ui.field('성과 메모', note)], function (msg) {
        I.save(c, { content: val() }, '업로드 · 성과 저장').then(function () { ui.ok(msg, '저장했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
      }, c.stage !== 'done' ? ui.btn('저장 + 완료', function () {
        var v = val(); if (!v.url) return ui.toast('콘텐츠 주소를 넣으세요.');
        if (!v.at) v.at = fmt.today();
        I.save(c, { content: v, stage: 'done', stageAt: I.now() }, I.stName(c.stage) + ' → 완료 · 업로드 확인', 'stage').then(function () {
          ui.toast('완료로 옮겼습니다 — 「완료 콘텐츠」에서 조회 · 댓글을 계속 추적합니다.');
          return I.call('infYt', { action: 'content', creatorId: c.id, url: v.url });   // 완료 콘텐츠 추적 시작 (유튜브 영상일 때)
        }).catch(function (e) { ui.toast(e.message || '저장하지 못했습니다.'); });
      }, 'btn-line btn-sm') : null));
  }
  function logPanel(c) {
    var inp = ui.input({ maxlength: '300', placeholder: '통화 · 회신 내용 · 결정 사항을 남기세요 (Enter)', class: 'grow' });
    var add = function () { var t = inp.value.trim(); if (!t) return; I.save(c, {}, t, 'note').then(function () { inp.value = ''; }).catch(ui.fail); };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    var log = (c.log || []).slice().sort(function (a, b) { return I.ms(b.at) - I.ms(a.at); });
    return ui.panel('기록', h('span', { class: 'meta', text: log.length + '건' }),
      h('div', { class: 'row in-log-add' }, inp, ui.btn('추가', add, 'btn-sm')),
      h('ul', { class: 'in-timeline' }, log.map(function (l) {
        return h('li', { class: 'k-' + (l.k || 'note') }, h('span', { class: 'in-tl-dot' }), h('div', { class: 'grow' }, h('div', { text: l.t }), h('div', { class: 'meta', text: HR.name(l.by) + ' · ' + fmt.ts(l.at) })));
      })));
  }
  function channelPanel(c) {
    var ch = c.ch, busy = V.refreshing[c.id];
    var re = ui.btn(busy ? '읽는 중…' : '지표 새로고침', function () {
      V.refreshing[c.id] = true; HR.refresh();
      I.call('infYt', { action: 'refresh', id: c.id }).then(function () { V.refreshing[c.id] = false; ui.toast('채널 지표를 새로 읽었습니다.'); })
        .catch(function (e) { V.refreshing[c.id] = false; ui.toast(e.message); });
    }, 'btn-line btn-xs');
    if (busy) re.disabled = true;
    return ui.panel('채널', h('span', { class: 'meta', text: ch.at ? fmt.dot(new Date(ch.at + 9 * 3600000).toISOString().slice(0, 10)) + ' 기준' : '' }),
      ui.kv([['구독자', I.cnt(ch.subs)], ['최근 중앙 조회수', I.cnt(ch.median)], ['평균 조회수', I.cnt(ch.avg)], ['참여율', I.pct(ch.engage)], ['쇼츠 비중', I.pct(ch.shorts)],
        ['최근 업로드', fmt.dot(ch.last)], ['영상 수', I.cnt(ch.videos)], ['개설', fmt.dot(ch.since)], ['국가', ch.country || '—']], 'kv in-kv'),
      h('div', { class: 'label in-sub', text: '키워드' }), I.chips((c.tags || []).concat(ch.keywords || []).slice(0, 14), 'light'),
      h('div', { class: 'label in-sub', text: '최근 영상' }),
      h('ul', { class: 'in-vids' }, (ch.recent || []).map(function (v) { return h('li', null, I.extLink(I.vidUrl(v.id), v.title), h('span', { class: 'meta', text: ' ' + I.cnt(v.views) + '회 · ' + fmt.dot(v.at).slice(2) })); })),
      h('div', { class: 'label in-sub', text: '댓글 톤' }), I.chips(I.toneTags(ch.tone), 'light'), I.toneBars(ch.tone),
      (ch.sample || []).length ? h('ul', { class: 'in-cmts' }, ch.sample.slice(0, 4).map(function (t) { return h('li', { text: t }); })) : null,
      ch.desc ? [h('div', { class: 'label in-sub', text: '채널 소개' }), h('p', { class: 'in-desc', text: ch.desc })] : null,
      h('div', { class: 'row' }, re));
  }
  function detail(view, id) {
    var c = I.creator(id);
    if (!c) {
      ui.put(view, ui.empty(I.loaded.creators ? '파이프라인에서 찾지 못했습니다. 삭제되었을 수 있습니다.' : '불러오는 중…'), ui.btn('← 파이프라인', function () { HR.go('pipe'); }, 'btn-line btn-sm'));
      return;
    }
    var ch = c.ch, d = I.daysSince(c.stageAt), todos = I.todos(c);
    var head = h('header', { class: 'in-hero' }, I.thumb(ch, 'lg'),
      h('div', { class: 'grow' }, h('div', { class: 'label', text: 'Influencer' + (c.seedTitle ? ' · ' + c.seedTitle + ' 탐색에서' : '') }),
        h('h1', { class: 'tab-title', text: ch.title }),
        h('div', { class: 'row in-hero-meta' }, I.stTag(c.stage), I.beautyTag(ch), I.agencyTag(ch), I.mailTag(c.email || ch.email), h('span', { class: 'meta', text: (d != null ? d + '일째 · ' : '') + '구독자 ' + I.cnt(ch.subs) + ' · 점수 ' + (c.score || 0) + ' · 담당 ' + ownerName(c) }),
          I.ytBtn(ch), c.insta ? I.extLink('https://instagram.com/' + c.insta, '인스타 ↗', 'meta') : null)),
      ui.btn('← 파이프라인', function () { HR.go('pipe'); }, 'btn-line btn-sm'));
    ui.put(view, head, stepper(c),
      todos.length ? h('ul', { class: 'in-alerts' }, todos.map(function (t) { return h('li', { class: t.red ? 'red' : '', text: t.t }); })) : null,
      h('div', { class: 'in-detail-grid' },
        h('div', { class: 'stack' }, contactPanel(c), nextPanel(c), mailPanel(c), dealPanel(c), seedPanel(c), contentPanel(c)),
        h('div', { class: 'stack' }, channelPanel(c), logPanel(c),
          (c.by === S.mid || S.isAdmin) ? h('div', { class: 'row' }, ui.confirmBtn('파이프라인에서 삭제', function () {
            db.doc('inf_creators/' + c.id).delete().then(function () { ui.toast('삭제했습니다.'); HR.go('pipe'); }).catch(ui.fail);
          })) : null)));
  }

  HR.register('home', { render: function (view) { home(view); } });
  HR.register('pipe', { render: function (view) { pipe(view); } });
  HR.register('c', { render: function (view, parts) { detail(view, parts[0]); } });
})();
