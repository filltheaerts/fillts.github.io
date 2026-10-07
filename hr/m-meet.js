/* ============================================
   fillts HR — 회의미팅: 클로바노트 → 드라이브 수신 폴더 → 초안(관리자만) → 검토 · 다듬기 → 「올리기」(구성원 공개)
   원문 · 요약은 서버(meetSync)가 만든다. 화면은 검토 · 수정 · 공개만.
   ============================================ */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, db = HR.db, FV = HR.FV, fmt = HR.fmt;
  var SA = 'hr-calendar@fillts-web.iam.gserviceaccount.com';
  var FN = 'https://asia-northeast3-fillts-web.cloudfunctions.net/meetSyncNow';

  var TYPES = [['weekly', '정기미팅'], ['project', '프로젝트 미팅'], ['one', '원온원']];
  function typeName(t) { var x = TYPES.filter(function (y) { return y[0] === t; })[0]; return x ? x[1] : '미분류'; }
  function byDate(r) { return r.sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : (b.date || '') > (a.date || '') ? 1 : 0; }); }
  function list() {
    var key = S.isAdmin ? 'meet_all' : 'meet_pub';
    return HR.load(key, function () {
      var C = db.collection('hr_meetings');
      if (S.isAdmin) return C.get().then(HR.rows).then(byDate);
      return Promise.all([
        C.where('published', '==', true).where('type', 'in', ['weekly', 'project', '']).get(),
        C.where('published', '==', true).where('memberId', '==', S.mid).get(),
        C.where('published', '==', true).where('leaderId', '==', S.mid).get()
      ]).then(function (snaps) {
        var seen = {}, out = [];
        snaps.forEach(function (sn) { HR.rows(sn).forEach(function (x) { if (!seen[x.id]) { seen[x.id] = 1; out.push(x); } }); });
        return byDate(out);
      });
    });
  }
  // WORK 프로젝트 = 프로젝트 미팅 폴더
  function projects() {
    return HR.load('meet_projects', function () {
      return db.collection('hr_ws_posts').where('kind', '==', 'project').get().then(HR.rows).then(function (r) {
        return r.map(function (p) { return { id: p.id, title: p.title, org: p.org, status: p.status }; }).sort(function (a, b) { return String(a.title).localeCompare(b.title, 'ko'); });
      });
    }) || [];
  }
  HR.meetList = list; HR.meetTypeName = typeName;
  function reload() { HR.invalidate('meet_'); }
  function call(body, m, btn) {
    if (btn) btn.disabled = true;
    ui.ok(m, body.id ? 'AI가 다시 정리하는 중… (30초~1분)' : '드라이브에서 가져오는 중…');
    return S.user.getIdToken().then(function (tok) {
      return fetch(FN, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (btn) btn.disabled = false;
      if (j.error) return ui.err(m, j.error);
      (j.ok === false ? ui.err : ui.ok)(m, j.msg || '완료했습니다.');
      reload(); HR.invalidate('meet_status');
    }).catch(function () { if (btn) btn.disabled = false; ui.err(m, '서버에 연결하지 못했습니다. 잠시 후 다시 눌러 주세요.'); });
  }
  function spaces() {
    var orgs = Object.keys(S.orgs).map(function (k) { return [k, S.orgs[k].name]; }).sort(function (a, b) { return a[1].localeCompare(b[1], 'ko'); });
    return [['', '공간 미지정'], ['all', '전사']].concat(orgs);
  }
  function spaceName(k) { var s = spaces().filter(function (x) { return x[0] === k; })[0]; return s ? s[1] : (k ? '(삭제된 공간)' : '공간 미지정'); }
  function stateTag(x) {
    if (x.published) return ui.tag('올림', 'ok');
    if (x.status === 'nokey') return ui.tag('요약 전', 'mute');
    if (x.status === 'error') return ui.tag('요약 오류', 'red');
    return ui.tag(x.edited ? '검토 중 · 수정됨' : '검토 대기', 'warn');
  }

  /* ---------- 관리자: 연결 설정 ---------- */
  var setupOpen = false;
  function setupPanel(cfg, st) {
    var meta = HR.load('hr_secret_meta', function () { return db.doc('hr_secret_meta/main').get().then(function (s) { return s.exists ? s.data() : {}; }); }) || {};
    var connected = !!(cfg && cfg.folderId), m = ui.msg();
    var head = h('div', { class: 'meet-setup-head' },
      h('div', null, h('b', { text: '연결 상태' }), ' ',
        connected ? ui.tag('폴더 연결됨', 'ok') : ui.tag('폴더 미연결', 'red'), ' ',
        meta.anthropic ? ui.tag('Claude 요약 ' + (meta.anthropicHint || ''), 'ok') : ui.tag('Gemini 자동 요약', 'ok')),
      h('div', { class: 'row' },
        connected ? ui.btn('지금 가져오기', function () { call({}, m, this); }, 'btn-sm') : null,
        h('button', { type: 'button', class: 'x-del', text: setupOpen ? '설정 접기' : '설정 열기', onclick: function () { setupOpen = !setupOpen; HR.refresh(); } })));
    var status = st && st.at ? h('p', { class: 'meta', text: '마지막 확인 ' + fmt.ts(st.at) + ' · ' + (st.msg || '') }) : null;
    if (!setupOpen && connected) return ui.panel('Setup · 클로바노트 연결', null, head, status, m);
    var folder = ui.input({ placeholder: 'https://drive.google.com/drive/folders/…', value: (cfg && cfg.folderUrl) || '' }), fm = ui.msg();
    var key = ui.input({ placeholder: 'sk-ant-…', autocomplete: 'off' }), km = ui.msg();
    return ui.panel('Setup · 클로바노트 연결', null, head, status, m,
      h('ol', { class: 'app-steps meet-steps' },
        h('li', null, h('b', { text: '드라이브 폴더 연결 — ' }), '받을 폴더를 아래 계정에 「뷰어」로 공유한 뒤 링크를 저장하세요.',
          h('div', { class: 'meet-sa' }, h('code', { text: SA }), ui.btn('복사', function () { navigator.clipboard && navigator.clipboard.writeText(SA).then(function () { ui.toast('복사했습니다.'); }); }, 'btn-line btn-xs')),
          h('div', { class: 'row' }, ui.field('폴더 링크', folder), ui.btn('폴더 저장', function () {
            var mm = /folders\/([\w-]{10,})/.exec(folder.value) || /^([\w-]{20,})$/.exec(folder.value.trim());
            if (!mm) return ui.err(fm, '드라이브 폴더 링크(…/folders/…)를 붙여 넣으세요.');
            db.doc('hr_meet_config/main').set({ folderId: mm[1], folderUrl: folder.value.trim().slice(0, 300), by: S.mid, updatedAt: FV.serverTimestamp() })
              .then(function () { HR.invalidate('meet_cfg'); ui.ok(fm, '저장했습니다. 「지금 가져오기」를 눌러 확인하세요.'); }).catch(function (x) { ui.fail(x, fm); });
          }, 'btn-sm')), fm),
        h('li', null, h('b', { text: 'AI 요약 (선택) — ' }), '키가 없어도 Gemini가 자동으로 정리합니다. Claude API 키(console.anthropic.com › API Keys)를 넣으면 Claude로 바꿔 정리합니다. 키는 서버에만 저장되고 화면에서 다시 볼 수 없습니다.',
          h('div', { class: 'row' }, ui.field('Claude API 키', key), ui.btn('키 저장', function () {
            var v = key.value.trim();
            if (!/^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(v)) return ui.err(km, 'sk-ant- 로 시작하는 키를 붙여 넣으세요.');
            db.doc('hr_secrets/main').set({ anthropicKey: v, updatedAt: FV.serverTimestamp() }, { merge: true })
              .then(function () { return db.doc('hr_secret_meta/main').set({ anthropic: true, anthropicHint: '…' + v.slice(-4), updatedAt: FV.serverTimestamp() }, { merge: true }); })
              .then(function () { key.value = ''; HR.invalidate('hr_secret_meta'); ui.ok(km, '저장했습니다. 요약이 없는 회의록은 「AI로 다시 요약」을 누르세요.'); }).catch(function (x) { ui.fail(x, km); });
          }, 'btn-sm')), km),
        h('li', null, h('b', { text: '클로바노트에서 — ' }), '「다운로드 → 텍스트 문서(.txt)」, 포함 정보는 참석자 · 하이라이트만 체크해서 그 폴더에 올리세요. 파일 이름 앞에 [마케팅팀]처럼 공간 이름을 붙이면 공간이 미리 골라집니다. 10분마다 자동으로 가져옵니다.')));
  }

  /* ---------- 목록 ---------- */
  var tab = null, openFolder = {};
  function row(x) {
    var s = x.summary || {};
    return h('li', null, h('a', { href: '#meet/' + x.id, class: 'meet-row' },
      h('div', { class: 'meet-row-top' }, h('span', { class: 'meet-date', text: fmt.dot(x.date || '') }), h('b', { text: x.title || '(제목 없음)' }), S.isAdmin || !x.published ? stateTag(x) : null,
        x.type === 'one' && x.memberId ? h('span', { class: 'meta', text: '🔒 ' + HR.name(x.memberId) }) : null),
      s.overview ? h('p', { class: 'meet-ov', text: s.overview }) : h('p', { class: 'meta', text: x.status === 'error' ? '요약 오류 — ' + (x.err || '') : '요약 없음 · 원문 ' + (x.chars || 0).toLocaleString() + '자' }),
      (s.actions || []).length ? h('p', { class: 'meta', text: '할 일 ' + s.actions.length + '개' + ((s.decisions || []).length ? ' · 결정 ' + s.decisions.length + '개' : '') }) : null));
  }
  function rows(arr, empty) { return arr.length ? h('ul', { class: 'meet-list' }, arr.map(row)) : ui.empty(empty); }
  function listView(view, all) {
    var drafts = all.filter(function (x) { return !x.published; }), pubs = all.filter(function (x) { return x.published; });
    var of = function (t) { return pubs.filter(function (x) { return (x.type || '') === t; }); };
    var tabs = (S.isAdmin ? [['review', '검토 대기', drafts.length]] : []).concat(TYPES.map(function (t) { return [t[0], t[1], of(t[0]).length]; }));
    if (S.isAdmin && of('').length) tabs.push(['', '미분류', of('').length]);
    if (tab === null || !tabs.some(function (t) { return t[0] === tab; })) tab = S.isAdmin && drafts.length ? 'review' : 'weekly';
    ui.put(view, h('nav', { class: 'meet-tabs' }, tabs.map(function (t) {
      return h('button', { type: 'button', class: (tab === t[0] ? 'on' : '') + (t[0] === 'review' ? ' rv' : ''), onclick: function () { tab = t[0]; HR.refresh(); } }, t[1] + ' ', h('span', { class: 'meet-n', text: String(t[2]) }));
    })));
    if (tab === 'review') return ui.put(view, rows(drafts, '검토할 회의록이 없습니다. 클로바노트에서 내보낸 파일을 폴더에 올리면 10분 안에 여기 나타납니다.'));
    if (tab === 'weekly') return ui.put(view, rows(of('weekly'), '아직 올라온 정기미팅 회의록이 없습니다.'));
    if (tab === '') return ui.put(view, rows(of(''), ''));
    if (tab === 'one') {
      var ones = of('one');
      ui.put(view, h('p', { class: 'muted small', text: '🔒 원온원 회의록은 그 구성원 본인 · 리더 · 관리자만 볼 수 있습니다. 목표관리 › 원온원에서도 볼 수 있습니다.' }));
      if (!S.isAdmin) return ui.put(view, rows(ones, '아직 나에게 올라온 원온원 회의록이 없습니다.'));
      var who = {}; ones.forEach(function (x) { (who[x.memberId || ''] = who[x.memberId || ''] || []).push(x); });
      if (!ones.length) return ui.put(view, ui.empty('아직 올라온 원온원 회의록이 없습니다.'));
      return ui.put(view, Object.keys(who).map(function (mid) { return h('section', { class: 'meet-folder open' }, h('div', { class: 'meet-folder-head' }, h('b', { text: mid ? HR.name(mid) : '대상 미지정' }), h('span', { class: 'meet-n', text: String(who[mid].length) })), rows(who[mid], '')); }));
    }
    // 프로젝트 미팅: 분야(공간) › WORK 프로젝트 폴더 — 빈 폴더도 보인다
    var ps = projects(), groups = {};
    ps.forEach(function (p) { (groups[p.org || ''] = groups[p.org || ''] || []).push(p); });
    var proj = of('project'), loose = proj.filter(function (x) { return !x.projectId || !ps.some(function (p) { return p.id === x.projectId; }); });
    ui.put(view, h('p', { class: 'muted small', text: 'WORK에 있는 프로젝트마다 폴더가 있습니다. 파일 이름 앞에 [프로젝트 이름]을 붙이면 그 폴더로 들어갑니다.' }));
    var orgKeys = Object.keys(groups).sort(function (a, b) { return spaceName(a).localeCompare(spaceName(b), 'ko'); });
    if (!orgKeys.length) ui.put(view, ui.empty('WORK에 프로젝트가 아직 없습니다.'));
    orgKeys.forEach(function (org) {
      ui.put(view, h('section', { class: 'meet-area' }, h('div', { class: 'label', text: spaceName(org) }),
        h('div', { class: 'meet-folders' }, groups[org].map(function (p) {
          var mine = proj.filter(function (x) { return x.projectId === p.id; }), open = !!openFolder[p.id];
          return h('section', { class: 'meet-folder' + (open ? ' open' : '') + (mine.length ? '' : ' empty') },
            h('button', { type: 'button', class: 'meet-folder-head', onclick: function () { openFolder[p.id] = !open; HR.refresh(); } },
              h('span', { class: 'meet-fi', text: open ? '▾' : '▸' }), h('b', { text: p.title }), p.status === 'done' ? ui.tag('완료', 'mute') : null, h('span', { class: 'meet-n', text: String(mine.length) })),
            open ? rows(mine, '아직 이 프로젝트 회의록이 없습니다.') : null);
        }))));
    });
    if (loose.length) ui.put(view, h('section', { class: 'meet-area' }, h('div', { class: 'label', text: '프로젝트 미지정' }), rows(loose, '')));
  }

  /* ---------- 상세 · 검토 ---------- */
  var drafts = {}, showRaw = {};
  function lines(arr) { return (arr || []).join('\n'); }
  function actLines(arr) { return (arr || []).map(function (a) { return [a.t, a.who || '', a.due || ''].join(' | ').replace(/( \| )+$/, ''); }).join('\n'); }
  function parseActs(t) {
    return t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 40).map(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      return { t: p[0].slice(0, 300), who: (p[1] || '').slice(0, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(p[2] || '') ? p[2] : '' };
    });
  }
  function parseLines(t, n) { return t.split('\n').map(function (l) { return l.replace(/^\s*[-·•*]\s+/, '').trim(); }).filter(Boolean).slice(0, n).map(function (x) { return x.slice(0, 400); }); }

  function detail(view, x) {
    var s = x.summary || {};
    ui.put(view, h('a', { href: '#meet', class: 'back', text: '← 회의미팅' }));
    var raw = h('div', { class: 'meet-raw' }, h('button', { type: 'button', class: 'x-del', text: showRaw[x.id] ? '원문 접기' : '원문 보기 (' + (x.chars || 0).toLocaleString() + '자)', onclick: function () { showRaw[x.id] = !showRaw[x.id]; HR.refresh(); } }),
      showRaw[x.id] ? h('pre', { class: 'meet-pre', text: x.text || '' }) : null, x.driveUrl ? h('a', { href: x.driveUrl, target: '_blank', rel: 'noopener noreferrer', class: 'link', text: '드라이브에서 열기 ↗' }) : null);
    if (!S.isAdmin) {
      ui.put(view, h('article', { class: 'panel meet-art' },
        h('div', { class: 'meet-row-top' }, h('span', { class: 'meet-date', text: fmt.dot(x.date || '') }), h('span', { class: 'meta', text: spaceName(x.org) })),
        h('h1', { class: 'ws-title', text: x.title }), readBody(s), raw));
      return;
    }
    // 관리자: 편집 가능한 검토 화면 (저장 전까지 화면에 초안 보관)
    var d = drafts[x.id] || (drafts[x.id] = { type: x.type || '', projectId: x.projectId || '', memberId: x.memberId || '', title: x.title || '', org: x.org || '', overview: s.overview || '', decisions: lines(s.decisions), actions: actLines(s.actions), next: lines(s.next), people: lines(s.people) });
    var m = ui.msg();
    var ta = function (k, rows, ph) { var e = h('textarea', { rows: String(rows), placeholder: ph, oninput: function () { d[k] = this.value; d.dirty = true; } }); e.value = d[k]; return e; };
    var title = h('input', { type: 'text', class: 'sm-title', maxlength: '120', value: d.title, oninput: function () { d.title = this.value; } });
    var org = ui.select(spaces(), d.org, { onchange: function () { d.org = this.value; } });
    var collect = function () {
      var mem = S.members[d.memberId] || {}, pj = projects().filter(function (p) { return p.id === d.projectId; })[0];
      return { type: d.type, projectId: d.type === 'project' ? d.projectId : '', memberId: d.type === 'one' ? d.memberId : '', leaderId: d.type === 'one' ? (mem.leaderId || '') : '',
        title: d.title.trim().slice(0, 120) || '(제목 없음)', org: d.type === 'project' && pj ? pj.org || d.org : d.org,
        summary: { overview: d.overview.trim().slice(0, 3000), decisions: parseLines(d.decisions, 30), actions: parseActs(d.actions), next: parseLines(d.next, 20), people: parseLines(d.people, 30) },
        edited: true, editedBy: S.mid, editedAt: FV.serverTimestamp() };
    };
    var save = function (extra, okText) {
      return db.doc('hr_meetings/' + x.id).update(Object.assign(collect(), extra || {}))
        .then(function () { delete drafts[x.id]; reload(); ui.toast(okText || '저장했습니다.'); }).catch(function (e) { ui.fail(e, m); });
    };
    var note = h('textarea', { rows: '2', class: 'meet-note', placeholder: '다듬기 지시 (선택) — 예: 할 일을 담당자별로 더 구체적으로, 광고 예산 논의는 결정사항에서 빼 줘' });
    var resum = ui.btn('AI로 다시 요약', function () {
      if (d.dirty && !confirmRedo) { confirmRedo = true; ui.err(m, '지금 고친 내용은 새 요약으로 바뀝니다. 한 번 더 누르면 다시 요약합니다.'); setTimeout(function () { confirmRedo = false; }, 4000); return; }
      confirmRedo = false; delete drafts[x.id];
      call({ id: x.id, note: note.value.trim() }, m, this);
    }, 'btn-line btn-sm');
    var confirmRedo = false;
    ui.put(view, h('article', { class: 'panel meet-art meet-edit' },
      h('div', { class: 'meet-row-top' }, h('span', { class: 'meet-date', text: fmt.dot(x.date || '') }), stateTag(x), h('span', { class: 'meta', text: x.fileName || '' })),
      title,
      h('div', { class: 'row' },
        ui.field('회의 종류', ui.select([['', '미분류']].concat(TYPES), d.type, { onchange: function () { d.type = this.value; d.dirty = true; HR.refresh(); } })),
        d.type === 'project' ? ui.field('프로젝트 폴더 (WORK)', ui.select([['', '프로젝트 고르기']].concat(projects().map(function (p) { return [p.id, spaceName(p.org) + ' · ' + p.title]; })), d.projectId, { onchange: function () { d.projectId = this.value; d.dirty = true; } })) : null,
        d.type === 'one' ? ui.field('원온원 대상 (본인 · 리더 · 관리자만 열람)', ui.select([['', '구성원 고르기']].concat(HR.memberList(false).map(function (mm) { return [mm.id, mm.name]; })), d.memberId, { onchange: function () { d.memberId = this.value; d.dirty = true; } })) : null,
        d.type === 'one' ? null : ui.field('공간 (Slack 알림 채널)', org)),
      d.type === 'one' ? h('p', { class: 'meta', text: '🔒 원온원은 올려도 Slack 알림을 보내지 않고, 대상 구성원 · 그 리더 · 관리자에게만 보입니다.' }) : null,
      x.status === 'error' ? h('p', { class: 'form-msg', text: '요약 오류: ' + (x.err || '') }) : null,
      x.status === 'nokey' && !s.overview ? h('p', { class: 'meta', text: 'AI 요약 키가 없어 요약이 비어 있습니다. 직접 적거나, 위 설정에서 키를 넣고 「AI로 다시 요약」을 누르세요.' }) : null,
      ui.field('핵심 요약', ta('overview', 4, '회의 핵심 3~5문장')),
      ui.field('결정사항 — 한 줄에 하나', ta('decisions', 4, '확정된 것만')),
      ui.field('할 일 — 한 줄에 「할 일 | 담당 | 기한(YYYY-MM-DD)」', ta('actions', 5, '예: 체험단 공고 올리기 | 진경 | 2026-10-14')),
      ui.field('다음 안건 — 한 줄에 하나', ta('next', 3, '')),
      ui.field('참석자 — 한 줄에 한 명', ta('people', 2, '')),
      h('div', { class: 'meet-redo' }, h('span', { class: 'label', text: '다듬기' }), note, resum,
        h('span', { class: 'meta', text: x.note ? '지난 지시: ' + x.note : '지시 없이 누르면 처음부터 다시 정리합니다. 원하는 모양이 나올 때까지 몇 번이고 다듬어 보세요.' })),
      m,
      h('div', { class: 'row sm-actions' },
        x.published ? ui.btn('수정 저장', function () { save(); }, 'btn')
          : ui.btn('검토 완료 · 올리기', function () { if (!d.type) return ui.err(m, '회의 종류를 골라 주세요.'); if (d.type === 'one' && !d.memberId) return ui.err(m, '원온원 대상을 골라 주세요.'); if (d.type === 'project' && !d.projectId) return ui.err(m, '프로젝트 폴더를 골라 주세요.'); save({ published: true, publishedAt: FV.serverTimestamp(), publishedBy: S.mid }, '올렸습니다. 구성원에게 보이고, 공간 Slack 채널에 알림이 갑니다.').then(function () { tab = d.type; HR.go('meet'); }); }, 'btn meet-pub'),
        x.published ? null : ui.btn('초안 저장', function () { save(); }, 'btn-line'),
        x.published ? ui.btn('내리기 (초안으로)', function () { save({ published: false }, '내렸습니다. 구성원에게 더 이상 보이지 않습니다.'); }, 'btn-line') : null,
        ui.confirmBtn('삭제', function () { db.doc('hr_meetings/' + x.id).delete().then(function () { reload(); HR.go('meet'); ui.toast('삭제했습니다. 드라이브 파일이 남아 있으면 다음 가져오기 때 다시 생깁니다.'); }).catch(function (e) { ui.fail(e, m); }); })),
      raw));
  }
  function readBody(s) {
    var sec = function (t, items) { return items && items.length ? h('section', { class: 'meet-sec' }, h('div', { class: 'label', text: t }), h('ul', null, items)) : null; };
    return h('div', { class: 'meet-read' },
      s.overview ? h('p', { class: 'meet-ov big', text: s.overview }) : h('p', { class: 'meta', text: '요약이 없습니다.' }),
      sec('결정사항', (s.decisions || []).map(function (x) { return h('li', { text: x }); })),
      sec('할 일', (s.actions || []).map(function (a) { return h('li', null, a.t, a.who ? h('span', { class: 'meet-who', text: a.who }) : null, a.due ? h('span', { class: 'meta', text: ' ~' + fmt.dot(a.due) }) : null); })),
      sec('다음 안건', (s.next || []).map(function (x) { return h('li', { text: x }); })),
      (s.people || []).length ? h('p', { class: 'meta', text: '참석 ' + s.people.join(', ') }) : null);
  }

  HR.register('meet', {
    render: function (view, parts) {
      ui.put(view, ui.head('Meetings', '회의미팅'));
      var all = list();
      if (S.isAdmin) {
        var cfg = HR.load('meet_cfg', function () { return db.doc('hr_meet_config/main').get().then(function (s) { return s.exists ? s.data() : {}; }); });
        var st = HR.load('meet_status', function () { return db.doc('hr_meet_status/main').get().then(function (s) { return s.exists ? s.data() : null; }); });
        if (!parts[0]) ui.put(view, setupPanel(cfg || {}, st));
      } else ui.put(view, h('p', { class: 'muted small', text: '클로바노트로 기록한 회의를 담당자가 검토 후 업로드합니다.' }));
      if (!all) return ui.put(view, ui.empty('불러오는 중…'));
      if (parts[0]) { var x = all.filter(function (y) { return y.id === parts[0]; })[0]; return x ? detail(view, x) : ui.put(view, ui.empty('찾지 못했습니다. 아직 올라오지 않았거나 삭제된 회의록입니다.')); }
      listView(view, all);
    }
  });
})();
