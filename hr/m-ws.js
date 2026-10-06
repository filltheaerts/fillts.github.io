/* fillts HR — WORK: 팀 · TF 공간 (노션처럼 쓰는 게시판)
   소통은 Slack, 여기는 각 팀 프로젝트의 링크(시트 · 슬라이드 · 문서 …) · 현황 · 이력을 모으는 곳.
   탭: 전체 프로젝트 · 전사 · 조직 · TF  ×  [소개 · 목표 | 프로젝트 보드 | 게시판]
   데이터: hr_ws_pages/{공간} · hr_ws_posts/{id} · hr_ws_updates/{id}(현황 이력) · hr_ws_tf/{tf_…}
   읽기 전 구성원 · 쓰기 그 공간 구성원(조직=주조직, TF=멤버) · 관리자. 현황 업데이트는 누구나(다른 팀과 소통). */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var ALL = 'all', EVERY = 'projects';   // 전사 공간 키 · 전체 프로젝트 탭 키
  var STATUS = [['idea', '준비'], ['doing', '진행 중'], ['done', '완료']];
  var editPage = null, draftPost = null, tfForm = false;

  /* ---------- 공간 ---------- */
  function tfs() { return HR.load('ws_tf', function () { return db.collection('hr_ws_tf').get().then(HR.rows); }) || []; }
  function spaces() {
    var orgs = Object.keys(S.orgs).sort(function (a, b) { return (S.orgs[a].order || 0) - (S.orgs[b].order || 0) || S.orgs[a].name.localeCompare(S.orgs[b].name, 'ko'); })
      .map(function (k) { return [k, S.orgs[k].name, 'org']; });
    var tf = tfs().filter(function (t) { return t.active !== false; }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); }).map(function (t) { return [t.id, 'TF · ' + t.name, 'tf']; });
    var list = [[ALL, S.cfg.companyName + ' 전사', 'all']].concat(orgs, tf), my = (S.priv && S.priv.wsOrder) || [];
    var rank = function (t, i) { var k = my.indexOf(t[0]); return k < 0 ? 1000 + i : k; };
    return list.map(function (t, i) { return [t, rank(t, i)]; }).sort(function (a, b) { return a[1] - b[1]; }).map(function (x) { return x[0]; });
  }
  var ordering = false;
  function orderPanel() {
    var ss = spaces();
    var save = function (keys) { S.priv = Object.assign({}, S.priv, { wsOrder: keys }); db.doc('hr_private/' + S.mid).set({ wsOrder: keys, updatedAt: FV.serverTimestamp() }, { merge: true }).catch(ui.fail); HR.refresh(); };
    var ul = h('ol', { class: 'list goal-order-list' }, ss.map(function (t, i) {
      var move = function (k) { return function () { var keys = ss.map(function (x) { return x[0]; }), j = i + k; if (j < 0 || j >= keys.length) return; var tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp; save(keys); }; };
      return h('li', { class: 'goal-order' }, h('div', { class: 'link-edit-order' },
        h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↑', 'aria-label': '위로', disabled: i === 0, onclick: move(-1) }),
        h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↓', 'aria-label': '아래로', disabled: i === ss.length - 1, onclick: move(1) })),
        h('div', { class: 'grow', text: t[1] }));
    }));
    return ui.panel('My order · 내 탭 순서', h('a', { href: '#', class: 'link', text: '닫기', onclick: function (e) { e.preventDefault(); ordering = false; HR.refresh(); } }), ul,
      h('p', { class: 'note', text: '↑ ↓로 바꾸면 바로 저장됩니다. 나에게만 적용되고, 「전체 프로젝트」는 항상 맨 앞에 있습니다.' }));
  }
  function spaceName(key) { var s = spaces().filter(function (x) { return x[0] === key; })[0]; return s ? s[1] : key; }
  function inTeam(key) {
    if (S.isAdmin || key === ALL) return true;
    if (/^tf_/.test(key)) { var t = tfs().filter(function (x) { return x.id === key; })[0]; return !!t && (t.members || []).indexOf(S.mid) >= 0; }
    return (S.members[S.mid] || {}).orgId === key;   // 보안 규칙과 같게 주조직 기준
  }
  function page(key) { return HR.load('ws_page:' + key, function () { return db.doc('hr_ws_pages/' + key).get().then(function (s) { return s.exists ? s.data() : {}; }); }); }
  function posts(key) { return HR.load('ws_posts:' + key, function () { return db.collection('hr_ws_posts').where('org', '==', key).get().then(HR.rows); }) || []; }
  function allProjects() { return HR.load('ws_posts@projects', function () { return db.collection('hr_ws_posts').where('kind', '==', 'project').get().then(HR.rows); }) || []; }
  function updates(pid) { return HR.load('ws_upd:' + pid, function () { return db.collection('hr_ws_updates').where('postId', '==', pid).get().then(HR.rows); }) || []; }
  function done(key) { HR.invalidate('ws_page:' + key); HR.invalidate('ws_posts'); }
  function hrLink(path) { return location.origin + '/hr/#ws/' + path; }

  /* ---------- 링크 종류 ---------- */
  function linkKind(u) {
    if (/docs\.google\.com\/spreadsheets/.test(u)) return ['시트', 'lk-sheet'];
    if (/docs\.google\.com\/presentation/.test(u)) return ['슬라이드', 'lk-slide'];
    if (/docs\.google\.com\/document/.test(u)) return ['문서', 'lk-doc'];
    if (/drive\.google\.com/.test(u)) return ['드라이브', 'lk-drive'];
    if (/notion\.(so|site)/.test(u)) return ['노션', 'lk-notion'];
    if (/figma\.com/.test(u)) return ['피그마', 'lk-figma'];
    if (/slack\.com/.test(u)) return ['Slack', 'lk-slack'];
    return ['링크', 'lk-web'];
  }
  function openLink(u) { var w = window.open(u, 'fillts_ws', 'popup=yes,width=1200,height=860'); if (!w) location.href = u; }
  function linkChip(l) {
    var k = linkKind(l.url);
    return h('button', { type: 'button', class: 'ws-link ' + k[1], title: l.url, onclick: function (e) { e.preventDefault(); e.stopPropagation(); openLink(l.url); } },
      h('span', { class: 'lk-kind', text: k[0] }), h('span', { class: 'lk-name', text: l.t || l.url.replace(/^https?:\/\//, '').slice(0, 40) }));
  }
  function crew(p) { var a = [p.owner].concat(p.people || []).filter(Boolean); return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function crewRow(ids, label, lead) {
    return h('div', { class: 'ws-crew' }, h('span', { class: 'meta', text: label }), ids.length ? ids.map(function (mid, i) { return h('span', { class: 'chip' + (lead && i === 0 ? ' lead' : ''), text: HR.name(mid) + (lead && i === 0 ? ' · 리드' : '') }); }) : h('span', { class: 'meta', text: '아직 없음' }));
  }
  function copy(text, msg) {
    var ok = function () { ui.toast(msg); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, function () { prompt('복사해서 붙여 넣으세요', text); });
    else prompt('복사해서 붙여 넣으세요', text);
  }
  function slackId(u) { var m = /archives\/([A-Z0-9]{8,})/.exec(u || ''); return m ? m[1] : ''; }

  /* ---------- 간단 서식: # 제목 · - 목록 · [ ] 체크 · > 강조 · URL 자동 링크 (텍스트 노드만 — HTML 주입 없음) ---------- */
  function inline(text) {
    var out = [], re = /(https?:\/\/[^\s)]+)/g, last = 0, m;
    while ((m = re.exec(text))) { if (m.index > last) out.push(text.slice(last, m.index)); out.push(h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer', class: 'link', text: m[1] })); last = re.lastIndex; }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  function richText(src) {
    var box = h('div', { class: 'ws-doc' }), list = null;
    String(src || '').split('\n').forEach(function (line) {
      var t = line.replace(/\s+$/, ''), mm;
      if ((mm = /^\s*[-*] (.*)$/.exec(t))) { if (!list) { list = h('ul'); box.appendChild(list); } list.appendChild(h('li', null, inline(mm[1]))); return; }
      list = null;
      if (!t) return box.appendChild(h('div', { class: 'ws-gap' }));
      if ((mm = /^### (.*)$/.exec(t))) return box.appendChild(h('h4', null, inline(mm[1])));
      if ((mm = /^## (.*)$/.exec(t))) return box.appendChild(h('h3', null, inline(mm[1])));
      if ((mm = /^# (.*)$/.exec(t))) return box.appendChild(h('h2', null, inline(mm[1])));
      if ((mm = /^\[( |x|X)\] (.*)$/.exec(t))) return box.appendChild(h('p', { class: 'ws-check' + (mm[1] !== ' ' ? ' on' : '') }, h('span', { class: 'ws-box', text: mm[1] !== ' ' ? '✓' : '' }), inline(mm[2])));
      if ((mm = /^> (.*)$/.exec(t))) return box.appendChild(h('blockquote', null, inline(mm[1])));
      box.appendChild(h('p', null, inline(t)));
    });
    return box;
  }
  var FORMAT_HELP = '# 제목   ## 소제목   - 목록   [ ] 할 일   [x] 완료   > 강조   링크는 그대로 붙여 넣기';

  /* ---------- 링크 편집기 (프로젝트 · 공간 공용) ---------- */
  function linksEditor(arr) {
    var ul = h('ul', { class: 'ws-link-edit' }, arr.map(function (l, i) {
      return h('li', null, h('input', { type: 'text', value: l.t, maxlength: '60', placeholder: '이름 (예: 런칭 일정표)', oninput: function () { l.t = this.value; } }),
        h('input', { type: 'url', value: l.url, placeholder: 'https://docs.google.com/spreadsheets/…', oninput: function () { l.url = this.value; } }),
        h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '빼기', onclick: function () { arr.splice(i, 1); HR.refresh(); } }));
    }));
    return h('div', { class: 'stack' }, ul, arr.length < 10 ? ui.btn('+ 링크 추가 (시트 · 슬라이드 · 문서 · 드라이브 · 노션 …)', function () { arr.push({ t: '', url: '' }); HR.refresh(); }, 'btn-line btn-sm') : null);
  }
  function cleanLinks(arr) { return arr.map(function (l) { return { t: (l.t || '').trim().slice(0, 60), url: (l.url || '').trim() }; }).filter(function (l) { return /^https:\/\/\S+$/.test(l.url); }).slice(0, 10); }

  /* ---------- 소개 · 목표 ---------- */
  function introTab(view, key) {
    var p = page(key);
    if (p == null) return ui.put(view, ui.empty('불러오는 중…'));
    var can = inTeam(key), tf = /^tf_/.test(key) ? tfs().filter(function (x) { return x.id === key; })[0] : null;
    if (editPage && editPage.key === key) {
      var e = editPage, m = ui.msg();
      var intro = h('textarea', { rows: '10', maxlength: '8000', oninput: function () { e.intro = this.value; } }); intro.value = e.intro;
      var goals = h('ol', { class: 'ws-goals edit' }, e.goals.map(function (g, i) {
        return h('li', null, h('div', { class: 'ws-row' },
          h('input', { type: 'text', value: g.t, maxlength: '80', placeholder: '목표 ' + (i + 1), oninput: function () { g.t = this.value; } }),
          h('input', { type: 'date', value: g.due || '', 'aria-label': '기한', onchange: function () { g.due = this.value; } }),
          ui.select(STATUS, g.st || 'idea', { onchange: function () { g.st = this.value; } }),
          h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '빼기', onclick: function () { e.goals.splice(i, 1); HR.refresh(); } })),
          (function () { var t = h('textarea', { rows: '2', maxlength: '600', placeholder: '세부 내용 · 측정 기준', oninput: function () { g.d = this.value; } }); t.value = g.d || ''; return t; })());
      }));
      return ui.put(view, ui.panel('Edit · 소개 · 목표', null,
        ui.field('소개', intro), h('p', { class: 'meta', text: FORMAT_HELP }),
        ui.field('Slack 채널 링크 (현황 업데이트가 이 채널에 자동으로 올라갑니다)', h('input', { type: 'url', value: e.slack, placeholder: 'https://filltshq.slack.com/archives/C0…', oninput: function () { e.slack = this.value; } })),
        h('p', { class: 'meta', text: 'Slack 채널 이름을 누르고 맨 아래 「채널 ID 복사」 또는 브라우저 주소를 붙여 넣으세요. 그 채널에서 /invite @fillts HR 을 한 번 해 두어야 메시지가 올라갑니다.' }),
        h('div', { class: 'field' }, h('label', { text: '자주 쓰는 링크' }), linksEditor(e.links)),
        h('div', { class: 'field' }, h('label', { text: '목표' }), goals,
          e.goals.length < 10 ? ui.btn('+ 목표 추가', function () { e.goals.push({ t: '', d: '', due: '', st: 'idea' }); HR.refresh(); }, 'btn-line btn-sm') : null), m,
        h('div', { class: 'row' }, ui.btn('저장', function () {
          if (e.slack.trim() && !slackId(e.slack)) return ui.err(m, 'Slack 채널 링크는 https://…slack.com/archives/C… 형식이어야 합니다.');
          var body = { intro: e.intro.trim(), slack: e.slack.trim(), links: cleanLinks(e.links), goals: e.goals.filter(function (g) { return g.t.trim(); }).map(function (g) { return { t: g.t.trim(), d: (g.d || '').trim(), due: g.due || '', st: g.st || 'idea' }; }), by: S.mid, updatedAt: FV.serverTimestamp() };
          db.doc('hr_ws_pages/' + key).set(body).then(function () { editPage = null; done(key); ui.toast('저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
        }), ui.btn('취소', function () { editPage = null; HR.refresh(); }, 'btn-line'))));
    }
    var gl = p.goals || [];
    ui.put(view,
      h('div', { class: 'row ws-actions' },
        h('div', { class: 'row' }, can ? ui.btn('소개 · 목표 편집', function () {
          editPage = { key: key, intro: p.intro || '', slack: p.slack || '', links: (p.links || []).map(function (l) { return Object.assign({}, l); }), goals: gl.map(function (g) { return Object.assign({}, g); }) };
          if (!editPage.goals.length) editPage.goals.push({ t: '', d: '', due: '', st: 'idea' });
          HR.refresh();
        }, 'btn-line btn-sm') : null,
          p.slack ? ui.btn('Slack 채널 열기', function () { openLink(p.slack); }, 'btn-line btn-sm') : null,
          ui.btn('이 공간 링크 복사', function () { copy(hrLink(key), 'WORK 링크를 복사했습니다. Slack에 붙여 넣으세요.'); }, 'btn-line btn-sm')),
        p.updatedAt ? h('span', { class: 'meta', text: '마지막 수정 ' + fmt.ts(p.updatedAt) + (p.by ? ' · ' + HR.name(p.by) : '') }) : null),
      tf ? ui.panel('TF members · 참여자', h('span', { class: 'meta', text: (tf.members || []).length + '명' }), h('div', { class: 'ws-people' }, (tf.members || []).map(function (mid) { return h('span', { class: 'chip', text: HR.name(mid) }); })),
        tf.desc ? h('p', { class: 'meta', text: tf.desc }) : null) : null,
      (p.links || []).length ? ui.panel('Links · 자주 쓰는 링크', null, h('div', { class: 'ws-links' }, p.links.map(linkChip))) : null,
      ui.panel('About · 소개', null, p.intro ? richText(p.intro) : h('p', { class: 'empty', text: can ? '「소개 · 목표 편집」으로 하는 일 · 일하는 방식 · Slack 채널 · 자주 쓰는 링크를 적어 주세요.' : '아직 소개가 없습니다.' })),
      ui.panel('Goals · 목표', null, gl.length ? h('ol', { class: 'ws-goals' }, gl.map(function (g) {
        var st = STATUS.filter(function (x) { return x[0] === g.st; })[0] || STATUS[0];
        return h('li', null, h('div', { class: 'ws-row' }, h('b', { text: g.t }), ui.tag(st[1], g.st === 'done' ? 'mute' : g.st === 'doing' ? 'ok' : 'warn'), g.due ? h('span', { class: 'meta', text: '~ ' + fmt.dot(g.due) }) : null), g.d ? h('p', { class: 'meta', text: g.d }) : null);
      })) : h('p', { class: 'empty', text: '아직 목표가 없습니다.' })));
  }

  /* ---------- 글 (프로젝트 · 게시판 공용) ---------- */
  var PROJECT_TEMPLATE = '## 목표\n\n## 현재 현황\n\n## 구조 · 역할\n- \n\n## 할 일\n[ ] \n\n## 일정 · 마일스톤\n- ';
  function postForm(view, key, kind, p) {
    var dk = p ? p.id : 'new:' + key + kind;
    var d = draftPost && draftPost.key === dk ? draftPost
      : (draftPost = { key: dk, title: p ? p.title : '', body: p ? p.body : (kind === 'project' ? PROJECT_TEMPLATE : ''), status: p ? p.status : 'idea', owner: p ? p.owner : S.mid, people: p ? (p.people || []).slice() : [], due: p ? p.due || '' : '',
        tags: p ? (p.tags || []).join(', ') : '', links: p ? (p.links || []).map(function (l) { return Object.assign({}, l); }) : [{ t: '', url: '' }] });
    var m = ui.msg(), back = kind === 'project' ? 'projects' : 'board';
    var body = h('textarea', { rows: '16', maxlength: '20000', oninput: function () { d.body = this.value; } }); body.value = d.body;
    var f = h('form', { class: 'panel ws-form' }, ui.label((p ? 'Edit · ' : 'New · ') + (kind === 'project' ? '프로젝트' : '글') + ' · ' + spaceName(key)),
      ui.field('제목 *', h('input', { type: 'text', value: d.title, maxlength: '100', oninput: function () { d.title = this.value; } })),
      kind === 'project' ? h('div', { class: 'form-grid' },
        ui.field('상태', ui.select(STATUS, d.status, { onchange: function () { d.status = this.value; } })),
        ui.field('리드 (진행 책임)', ui.select(HR.memberList(false).map(function (x) { return [x.id, x.name]; }), d.owner, { onchange: function () { d.owner = this.value; } })),
        ui.field('기한', h('input', { type: 'date', value: d.due, onchange: function () { d.due = this.value; } })),
        ui.field('태그 (쉼표로 구분)', h('input', { type: 'text', value: d.tags, maxlength: '100', placeholder: '예: 런칭, 공식몰', oninput: function () { d.tags = this.value; } }))) : null,
      kind === 'project' ? h('div', { class: 'field' }, h('label', { text: '함께 진행하는 사람' }), h('div', { class: 'ws-people pick' }, HR.memberList(false).map(function (x) {
        return h('label', { class: 'check chip' }, h('input', { type: 'checkbox', checked: d.people.indexOf(x.id) >= 0, onchange: function () { var i = d.people.indexOf(x.id); if (this.checked && i < 0) d.people.push(x.id); if (!this.checked && i >= 0) d.people.splice(i, 1); } }), ' ' + x.name);
      }))) : null,
      h('div', { class: 'field' }, h('label', { text: '핵심 링크 — 스프레드시트 · 프레젠테이션 · 문서 · 드라이브 · 노션' }), linksEditor(d.links)),
      ui.field(kind === 'project' ? '현황 · 구조' : '내용', body), h('p', { class: 'meta', text: FORMAT_HELP }), m,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit', text: '저장' }), ui.btn('취소', function () { draftPost = null; HR.go('ws/' + key + '/' + back + (p ? '/' + p.id : '')); }, 'btn-line')));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!d.title.trim()) return ui.err(m, '제목을 입력하세요.');
      var bad = d.links.filter(function (l) { return l.url.trim() && !/^https:\/\/\S+$/.test(l.url.trim()); });
      if (bad.length) return ui.err(m, '링크는 https:// 로 시작해야 합니다: ' + bad[0].url);
      var data = { org: key, kind: kind, title: d.title.trim(), body: d.body, status: kind === 'project' ? d.status : 'post', owner: kind === 'project' ? d.owner : S.mid, due: kind === 'project' ? d.due : '',
        tags: kind === 'project' ? d.tags.split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 8) : [], links: cleanLinks(d.links),
        people: kind === 'project' ? d.people.filter(function (x) { return x !== d.owner; }).slice(0, 20) : [], updatedAt: FV.serverTimestamp() };
      var op = p ? db.doc('hr_ws_posts/' + p.id).update(data).then(function () { return p.id; })
        : db.collection('hr_ws_posts').add(Object.assign(data, { createdBy: S.mid, createdAt: FV.serverTimestamp() })).then(function (r) { return r.id; });
      op.then(function (id) { draftPost = null; done(key); ui.toast('저장했습니다.'); HR.go('ws/' + key + '/' + back + '/' + id); }).catch(function (x) { ui.fail(x, m); });
    });
    ui.put(view, f);
  }

  // 현황 업데이트 이력 — 누구나 남기고, 공간에 Slack 채널이 있으면 그 채널에도 올라간다
  function timeline(p) {
    var list = updates(p.id).slice().sort(function (a, b) { return (b.at && b.at.toMillis ? b.at.toMillis() : 0) - (a.at && a.at.toMillis ? a.at.toMillis() : 0); });
    var text = h('textarea', { rows: '3', maxlength: '2000', placeholder: '진행 상황 · 결정 사항 · 다음 할 일 · 요청 (Slack에서 정한 내용을 기록으로 남기기)' });
    var lt = ui.input({ maxlength: '60', placeholder: '링크 이름 (선택)' }), lu = ui.input({ type: 'url', placeholder: 'https://… 관련 시트 · 슬라이드 (선택)' }), m = ui.msg();
    var go = ui.btn('현황 올리기', function () {
      var t = text.value.trim(), u = lu.value.trim();
      if (!t) return ui.err(m, '내용을 입력하세요.');
      if (u && !/^https:\/\/\S+$/.test(u)) return ui.err(m, '링크는 https:// 로 시작해야 합니다.');
      go.disabled = true;
      db.collection('hr_ws_updates').add({ postId: p.id, org: p.org, title: p.title.slice(0, 100), text: t, link: u, linkTitle: lt.value.trim().slice(0, 60), by: S.mid, at: FV.serverTimestamp() })
        .then(function () { HR.invalidate('ws_upd:' + p.id); ui.toast('현황을 올렸습니다.'); }).catch(function (x) { go.disabled = false; ui.fail(x, m); });
    });
    var ul = h('ol', { class: 'ws-timeline' }, list.map(function (u) {
      return h('li', null, h('div', { class: 'ws-row' }, h('b', { text: HR.name(u.by) }), h('span', { class: 'meta', text: fmt.ts(u.at) }),
        (S.isAdmin || u.by === S.mid) ? ui.confirmBtn('삭제', function () { db.doc('hr_ws_updates/' + u.id).delete().then(function () { HR.invalidate('ws_upd:' + p.id); }).catch(ui.fail); }) : null),
        richText(u.text), u.link ? linkChip({ t: u.linkTitle, url: u.link }) : null);
    }));
    if (!list.length) ul.appendChild(h('li', { class: 'empty', text: '아직 현황 기록이 없습니다.' }));
    return ui.panel('History · 현황 업데이트', h('span', { class: 'meta', text: list.length + '건' }),
      h('div', { class: 'ws-upd-form' }, text, h('div', { class: 'row ws-link-row' }, lt, lu, go), m), ul);
  }
  function postView(view, key, p, back) {
    var can = inTeam(key) && (S.isAdmin || p.createdBy === S.mid || p.kind === 'project');
    var st = STATUS.filter(function (x) { return x[0] === p.status; })[0], pg = page(key) || {};
    ui.put(view, h('a', { href: '#ws/' + key + '/' + back, class: 'back', text: '← ' + spaceName(key) + ' · ' + (p.kind === 'project' ? '프로젝트' : '게시판') }),
      h('article', { class: 'panel ws-article' },
        p.kind === 'project' ? crewRow(crew(p), '진행자', true) : null,
        h('h1', { class: 'ws-title', text: p.title }),
        h('div', { class: 'ws-meta' }, st && p.kind === 'project' ? ui.tag(st[1], p.status === 'done' ? 'mute' : p.status === 'doing' ? 'ok' : 'warn') : null,
          h('span', { class: 'meta', text: [p.kind === 'project' ? '담당 ' + HR.name(p.owner) : HR.name(p.createdBy), p.due ? '기한 ' + fmt.dot(p.due) : '', '작성 ' + fmt.ts(p.createdAt) + (p.updatedAt ? ' · 수정 ' + fmt.ts(p.updatedAt) : '')].filter(Boolean).join(' · ') }),
          (p.tags || []).map(function (t) { return ui.tag('#' + t, 'mute'); })),
        (p.links || []).length ? h('div', { class: 'ws-links big' }, p.links.map(linkChip)) : null,
        richText(p.body),
        h('div', { class: 'row ws-actions' },
          h('div', { class: 'row' }, ui.btn('링크 복사 (Slack에 공유)', function () { copy(p.title + '\n' + hrLink(key + '/' + back + '/' + p.id), '제목과 링크를 복사했습니다. Slack에 붙여 넣으세요.'); }, 'btn-line btn-sm'),
            pg.slack ? ui.btn('Slack 채널 열기', function () { openLink(pg.slack); }, 'btn-line btn-sm') : null),
          can ? h('div', { class: 'row' }, ui.btn('편집', function () { HR.go('ws/' + key + '/' + back + '/' + p.id + '/edit'); }, 'btn-line btn-sm'),
            (S.isAdmin || p.createdBy === S.mid) ? ui.confirmBtn('삭제', function () { db.doc('hr_ws_posts/' + p.id).delete().then(function () { done(key); HR.go('ws/' + key + '/' + back); }).catch(ui.fail); }) : null) : null)),
      p.kind === 'project' ? timeline(p) : null);
  }

  /* ---------- 프로젝트 보드 ---------- */
  function card(p, showSpace) {
    return h('a', { class: 'ws-card', href: '#ws/' + p.org + '/projects/' + p.id }, showSpace ? h('span', { class: 'ws-space', text: spaceName(p.org) }) : null, h('b', { text: p.title }),
      h('span', { class: 'meta', text: [HR.name(p.owner) + ((p.people || []).length ? ' 외 ' + p.people.length + '명' : ''), p.due ? '~ ' + fmt.date(p.due) : ''].filter(Boolean).join(' · ') }),
      (p.links || []).length ? h('span', { class: 'ws-links small' }, p.links.slice(0, 4).map(linkChip)) : null,
      (p.tags || []).length ? h('span', { class: 'ws-tags' }, p.tags.map(function (t) { return h('span', { text: '#' + t }); })) : null);
  }
  function boardOf(list, showSpace) {
    return h('div', { class: 'ws-board' }, STATUS.map(function (s) {
      var items = list.filter(function (p) { return (p.status || 'idea') === s[0]; }).sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
      return h('section', { class: 'ws-col st-' + s[0] }, h('div', { class: 'ws-col-head' }, h('b', { text: s[1] }), h('span', { class: 'meta', text: items.length + '' })),
        items.map(function (p) { return card(p, showSpace); }), !items.length ? h('p', { class: 'empty', text: '없음' }) : null);
    }));
  }
  function projects(view, key, parts) {
    var list = posts(key).filter(function (p) { return p.kind === 'project'; });
    if (parts[0] === 'new') return inTeam(key) ? postForm(view, key, 'project', null) : null;
    if (parts[0]) { var p = list.filter(function (x) { return x.id === parts[0]; })[0]; if (!p) return ui.put(view, ui.empty('불러오는 중…')); return parts[1] === 'edit' ? postForm(view, key, 'project', p) : postView(view, key, p, 'projects'); }
    ui.put(view, h('div', { class: 'toolbar' }, h('span', { class: 'meta', text: '프로젝트 ' + list.length + '개' }), inTeam(key) ? ui.btn('+ 새 프로젝트', function () { draftPost = null; HR.go('ws/' + key + '/projects/new'); }) : null), boardOf(list, false));
  }
  function everyProject(view) {
    var list = allProjects(), q = (HR.wsQ || '');
    var search = ui.input({ type: 'search', value: q, placeholder: '프로젝트 · 태그 · 담당자 검색', oninput: function () { HR.wsQ = this.value; HR.refresh(); } });
    var f = list.filter(function (p) { var s = (p.title + ' ' + (p.tags || []).join(' ') + ' ' + HR.name(p.owner) + ' ' + spaceName(p.org)).toLowerCase(); return !q || s.indexOf(q.toLowerCase()) >= 0; });
    ui.put(view, h('div', { class: 'toolbar' }, ui.field('검색', search, 'inline'), h('span', { class: 'meta', text: '전체 ' + f.length + '개 · 팀 · TF를 가리지 않고 모든 프로젝트' })), boardOf(f, true));
  }

  /* ---------- 게시판 ---------- */
  function board(view, key, parts) {
    var list = posts(key).filter(function (p) { return p.kind === 'post'; }).sort(function (a, b) { return (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0); });
    if (parts[0] === 'new') return inTeam(key) ? postForm(view, key, 'post', null) : null;
    if (parts[0]) { var p = list.filter(function (x) { return x.id === parts[0]; })[0]; if (!p) return ui.put(view, ui.empty('불러오는 중…')); return parts[1] === 'edit' ? postForm(view, key, 'post', p) : postView(view, key, p, 'board'); }
    var ul = h('ul', { class: 'list ws-list' }, list.map(function (p) {
      var preview = String(p.body || '').replace(/[#>\-\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
      return h('li', null, h('a', { class: 'grow', href: '#ws/' + key + '/board/' + p.id }, h('b', { text: p.title }), preview ? h('div', { class: 'meta', text: preview }) : null,
        (p.links || []).length ? h('span', { class: 'ws-links small' }, p.links.slice(0, 3).map(linkChip)) : null),
        h('span', { class: 'meta', text: HR.name(p.createdBy) + ' · ' + fmt.ts(p.createdAt) }));
    }));
    if (!list.length) ul.appendChild(h('li', { class: 'empty', text: '아직 글이 없습니다. 회의록 · 공유 자료 · 아이디어를 남겨 보세요.' }));
    ui.put(view, h('div', { class: 'toolbar' }, h('span', { class: 'meta', text: '글 ' + list.length + '개' }), inTeam(key) ? ui.btn('+ 새 글', function () { draftPost = null; HR.go('ws/' + key + '/board/new'); }) : null), ui.panel('Board · 게시판', null, ul));
  }

  /* ---------- TF 만들기 ---------- */
  function newTf(view) {
    var name = ui.input({ maxlength: '40', placeholder: '예: 공식몰 런칭 TF' }), desc = ui.input({ maxlength: '200', placeholder: '목적 · 기간 (예: 11월 12일 공식몰 오픈까지)' }), m = ui.msg(), picked = {};
    picked[S.mid] = true;
    var people = h('div', { class: 'ws-people pick' }, HR.memberList(false).map(function (x) {
      var cb = h('input', { type: 'checkbox', checked: !!picked[x.id], disabled: x.id === S.mid, onchange: function () { picked[x.id] = this.checked; } });
      return h('label', { class: 'check chip' }, cb, ' ' + x.name);
    }));
    ui.put(view, ui.panel('New TF · TF 만들기', null, h('div', { class: 'form-grid' }, ui.field('TF 이름 *', name), ui.field('목적 · 기간', desc)),
      h('div', { class: 'field' }, h('label', { text: '참여자 (팀을 섞어서)' }), people), m,
      h('div', { class: 'row' }, ui.btn('TF 만들기', function () {
        if (!name.value.trim()) return ui.err(m, 'TF 이름을 입력하세요.');
        var key = 'tf_' + Date.now().toString(36), mem = Object.keys(picked).filter(function (k) { return picked[k]; });
        db.doc('hr_ws_tf/' + key).set({ name: name.value.trim(), desc: desc.value.trim(), members: mem, by: S.mid, active: true, createdAt: FV.serverTimestamp() })
          .then(function () { tfForm = false; HR.invalidate('ws_tf'); ui.toast('TF를 만들었습니다.'); HR.go('ws/' + key); }).catch(function (x) { ui.fail(x, m); });
      }), ui.btn('취소', function () { tfForm = false; HR.refresh(); }, 'btn-line'))));
  }

  HR.register('ws', {
    render: function (view, parts) {
      var ss = spaces(), me = S.members[S.mid] || {};
      var key = parts[0] === EVERY ? EVERY : parts[0] && ss.some(function (t) { return t[0] === parts[0]; }) ? parts[0] : (parts[0] && /^tf_/.test(parts[0]) ? parts[0] : (me.orgId && S.orgs[me.orgId] ? me.orgId : ALL));
      var sub = parts[1] || 'intro';
      var tabs = h('nav', { class: 'subtabs ws-teams', 'aria-label': '팀 · TF' },
        h('a', { href: '#ws/' + EVERY, class: 'ws-every' + (key === EVERY ? ' active' : ''), text: '전체 프로젝트' }),
        ss.map(function (t) { return h('a', { href: '#ws/' + t[0], class: (t[0] === key ? 'active ' : '') + (t[2] === 'tf' ? 'ws-tf' : ''), text: t[1] }); }),
        h('a', { href: '#', class: 'ws-add', text: '+ TF', onclick: function (e) { e.preventDefault(); tfForm = true; ordering = false; HR.refresh(); } }),
        h('a', { href: '#', class: 'ws-add', text: '⇅ 순서', onclick: function (e) { e.preventDefault(); ordering = !ordering; tfForm = false; HR.refresh(); } }));
      ui.put(view, ui.head('Work', 'WORK · 팀 · TF 공간'), tabs);
      if (tfForm) return newTf(view);
      if (ordering) return ui.put(view, orderPanel());
      if (key === EVERY) return everyProject(view);
      var tfDoc = /^tf_/.test(key) ? tfs().filter(function (x) { return x.id === key; })[0] : null;
      var who = tfDoc ? (tfDoc.members || []).slice() : HR.memberList(false).filter(function (m) { return key === ALL ? false : m.orgId === key; }).map(function (m) { return m.id; });
      posts(key).forEach(function (p) { if (p.kind === 'project' && p.status !== 'done') crew(p).forEach(function (x) { if (who.indexOf(x) < 0) who.push(x); }); });
      if (!parts[2] && (key !== ALL || who.length)) ui.put(view, crewRow(who, '진행자', false));   // 프로젝트 상세에서는 그 프로젝트 진행자만
      ui.put(view, h('div', { class: 'ws-sub' }, ui.tabs([['intro', '소개 · 목표'], ['projects', '프로젝트'], ['board', '게시판']], sub, 'ws/' + key)));
      if (sub === 'projects') return projects(view, key, parts.slice(2));
      if (sub === 'board') return board(view, key, parts.slice(2));
      introTab(view, key);
    }
  });
})();
