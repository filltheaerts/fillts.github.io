/* fillts HR — WORK: 팀 · TF 공간 (노션처럼 쓰는 게시판)
   소통은 Slack, 여기는 각 팀 프로젝트의 링크(시트 · 슬라이드 · 문서 …) · 현황 · 이력을 모으는 곳.
   탭: 전체 프로젝트 · 전사 · 조직 · TF  ×  [소개 · 목표 | 프로젝트 보드 | 게시판]
   데이터: hr_ws_pages/{공간} · hr_ws_posts/{id} · hr_ws_updates/{id}(현황 이력) · hr_ws_tf/{tf_…}
   읽기 전 구성원 · 쓰기 그 공간 구성원(조직=주조직, TF=멤버) · 관리자. 현황 업데이트는 누구나(다른 팀과 소통). */
(function () {
  'use strict';
  var HR = window.HR, S = HR.S, L = HR.L, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var ALL = 'all', EVERY = 'projects';   // 전사 공간 키 · 전체 프로젝트 탭 키
  var STATUS = [['idea', '준비'], ['doing', '진행 중'], ['done', '완료']];
  // 프로젝트 특성 — 목록 · 상세에서 제목 앞 배지로 보인다
  var FLAGS = [['important', '중요'], ['basic', '베이직'], ['urgent', '긴급'], ['simple', '간단']];
  function flagBadges(p) {
    var f = p.flags || [];
    return FLAGS.filter(function (x) { return f.indexOf(x[0]) >= 0; }).map(function (x) { return h('span', { class: 'ws-flag fl-' + x[0], text: x[1] }); });
  }
  var editPage = null, draftPost = null, tfForm = false;

  /* ---------- 공간 ---------- */
  function tfs() { return HR.load('ws_tf', function () { return db.collection('hr_ws_tf').get().then(HR.rows); }) || []; }
  function spaces() {
    var parents = {}; Object.keys(S.orgs).forEach(function (k) { var pid = S.orgs[k].parentId; if (pid && S.orgs[pid]) parents[pid] = true; });
    var unitOrder = function (k) { var pid = S.orgs[k].parentId; return pid && S.orgs[pid] ? (S.orgs[pid].order || 0) : 99; };
    var orgs = Object.keys(S.orgs).filter(function (k) { return !parents[k]; }).sort(function (a, b) { return unitOrder(a) - unitOrder(b) || (S.orgs[a].order || 0) - (S.orgs[b].order || 0) || S.orgs[a].name.localeCompare(S.orgs[b].name, 'ko'); })
      .map(function (k) { var pid = S.orgs[k].parentId; return [k, S.orgs[k].name, 'org', pid && S.orgs[pid] ? S.orgs[pid].name : '']; });
    var tf = tfs().filter(function (t) { return t.active !== false; }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); }).map(function (t) { return [t.id, t.name, 'tf', 'TF']; });
    var list = [[ALL, '전사', 'all', '']].concat(orgs, tf), my = (S.priv && S.priv.wsOrder) || [];
    var groups = []; list.forEach(function (t) { if (groups.indexOf(t[3]) < 0) groups.push(t[3]); });
    var rank = function (t, i) { var k = my.indexOf(t[0]); return groups.indexOf(t[3]) * 10000 + (k < 0 ? 1000 + i : k); };
    return list.map(function (t, i) { return [t, rank(t, i)]; }).sort(function (a, b) { return a[1] - b[1]; }).map(function (x) { return x[0]; });
  }
  var ordering = false;
  function orderPanel() {
    var ss = spaces();
    var save = function (keys) { S.priv = Object.assign({}, S.priv, { wsOrder: keys }); db.doc('hr_private/' + S.mid).set({ wsOrder: keys, updatedAt: FV.serverTimestamp() }, { merge: true }).catch(ui.fail); HR.refresh(); };
    var ul = h('ol', { class: 'list goal-order-list' }, ss.map(function (t, i) {
      var move = function (k) { return function () { var keys = ss.map(function (x) { return x[0]; }), j = i + k; if (j < 0 || j >= keys.length) return; var tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp; save(keys); }; };
      return h('li', { class: 'goal-order' }, h('div', { class: 'link-edit-order' },
        h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↑', 'aria-label': '위로', disabled: i === 0 || ss[i - 1][3] !== t[3], onclick: move(-1) }),
        h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↓', 'aria-label': '아래로', disabled: i === ss.length - 1 || ss[i + 1][3] !== t[3], onclick: move(1) })),
        h('div', { class: 'grow', text: (t[3] ? t[3] + ' · ' : '') + t[1] }));
    }));
    return ui.panel('My order · 내 탭 순서', h('a', { href: '#', class: 'link', text: '닫기', onclick: function (e) { e.preventDefault(); ordering = false; HR.refresh(); } }), ul,
      h('p', { class: 'note', text: '↑ ↓로 바꾸면 바로 저장됩니다. 나에게만 적용됩니다. 같은 유닛(STUDIO · DIRECT · TF) 안에서 순서가 바뀌고, 「전체 프로젝트」는 항상 맨 앞입니다.' }));
  }
  function spaceBadge(key) {
    var ss = spaces(), s = ss.filter(function (x) { return x[0] === key; })[0];
    if (!s) return h('span', { class: 'ws-pspace g-etc' }, h('b', { text: key }));
    var groups = []; ss.forEach(function (x) { if (x[2] === 'org' && x[3] && groups.indexOf(x[3]) < 0) groups.push(x[3]); });
    var cls = s[2] === 'all' ? 'g-all' : s[2] === 'tf' ? 'g-tf' : s[3] ? 'g-u' + (groups.indexOf(s[3]) % 4) : 'g-etc';
    return h('span', { class: 'ws-pspace ' + cls, title: spaceName(key) }, s[2] === 'all' ? null : h('small', { text: s[3] || '' }), h('b', { text: s[2] === 'all' ? '전사' : s[1] }));
  }
  function spaceName(key) { var s = spaces().filter(function (x) { return x[0] === key; })[0]; return s ? (s[0] === ALL ? S.cfg.companyName + ' 전사' : (s[3] ? s[3] + ' · ' : '') + s[1]) : key; }
  function inTeam(key) {
    if (S.isAdmin || key === ALL) return true;
    if (/^tf_/.test(key)) { var t = tfs().filter(function (x) { return x.id === key; })[0]; return !!t && (t.members || []).indexOf(S.mid) >= 0; }
    var pg = HR.cache['ws_page:' + key] && HR.cache['ws_page:' + key].data;
    return (S.members[S.mid] || {}).orgId === key || !!(pg && (pg.crew || []).indexOf(S.mid) >= 0);   // 보안 규칙과 같게: 주조직 또는 지정 진행자
  }
  var crewEdit = null;   // 관리자 진행자 지정 중인 공간
  function crewEditor(key, current) {
    var pick = current.slice(), m = ui.msg();
    var box = h('div', { class: 'ws-people pick' }, HR.memberList(false).map(function (x) {
      return h('label', { class: 'check chip' }, h('input', { type: 'checkbox', checked: pick.indexOf(x.id) >= 0, onchange: function () { var i = pick.indexOf(x.id); if (this.checked && i < 0) pick.push(x.id); if (!this.checked && i >= 0) pick.splice(i, 1); } }), ' ' + x.name);
    }));
    return ui.panel('Crew · 진행자 지정 (관리자)', h('a', { href: '#', class: 'link', text: '닫기', onclick: function (e) { e.preventDefault(); crewEdit = null; HR.refresh(); } }),
      h('p', { class: 'muted small', text: '체크한 사람이 이 공간의 진행자로 맨 위에 표시되고, 소속과 상관없이 이 공간에 프로젝트 · 글을 쓸 수 있습니다.' }), box, m,
      h('div', { class: 'row' }, ui.btn('저장', function () {
        var pg = page(key) || {};
        db.doc('hr_ws_pages/' + key).set({ intro: pg.intro || '', goals: pg.goals || [], slack: pg.slack || '', links: pg.links || [], crew: pick, by: S.mid, updatedAt: FV.serverTimestamp() })
          .then(function () { crewEdit = null; done(key); ui.toast('진행자를 저장했습니다.'); }).catch(function (x) { ui.fail(x, m); });
      }), ui.btn('취소', function () { crewEdit = null; HR.refresh(); }, 'btn-line')));
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
  function subsEditor(arr, parent) {
    var move = function (i, k) { return function () { var j = i + k, t = arr[i]; arr[i] = arr[j]; arr[j] = t; HR.refresh(); }; };
    return h('div', { class: 'ws-subs-edit' }, arr.map(function (x, i) {
      var body = h('textarea', { rows: '3', maxlength: '4000', placeholder: '무엇을 · 누가 · 어떻게 — 세부 내용', oninput: function () { x.body = this.value; } }); body.value = x.body;
      return h('div', { class: 'ws-sub-edit' + (x.done ? ' done' : '') },
        h('div', { class: 'ws-sub-edit-head' }, h('span', { class: 'ws-sub-no', text: 'SUB ' + (i + 1) }),
          h('input', { type: 'text', class: 'ws-sub-title', value: x.t, maxlength: '80', placeholder: '서브 프로젝트 이름 *', oninput: function () { x.t = this.value; } }),
          i > 0 ? ui.btn('↑', move(i, -1), 'btn-line btn-xs') : null, i < arr.length - 1 ? ui.btn('↓', move(i, 1), 'btn-line btn-xs') : null,
          ui.btn('삭제', function () { arr.splice(i, 1); HR.refresh(); }, 'btn-line btn-xs')),
        h('div', { class: 'form-grid ws-sub-dates' },
          ui.field('시작일', h('div', { class: 'ws-datef' }, h('input', { type: 'date', value: x.start, onchange: function () { x.start = this.value; } }),
            quickDates([['오늘', 0, 'd'], ['1주 뒤', 7, 'd']], function () { return fmt.today(); }, x.start, function (v) { x.start = v; }),
            prevPresets(i === 0 ? { start: parent.start, due: '', name: '프로젝트' } : { start: arr[i - 1].start, due: arr[i - 1].due, name: '앞 서브' }, x))),
          ui.field('마감 예정일', h('div', { class: 'ws-datef' }, h('input', { type: 'date', value: x.due, onchange: function () { x.due = this.value; } }),
            quickDates([['1주', 7, 'd'], ['2주', 14, 'd'], ['1달', 1, 'm'], ['2달', 2, 'm']], function () { return x.start || fmt.today(); }, x.due, function (v) { x.due = v; },
              [['+1주', 7, 'd'], ['+1달', 1, 'm']], function () { return x.due || x.start || fmt.today(); })))),
        ui.field('내용', body),
        x.links.length ? h('div', { class: 'field' }, h('label', { text: '링크' }), linksEditor(x.links))
          : ui.btn('+ 링크 추가 (구글 드라이브 · 시트 · 문서 …)', function () { x.links.push({ t: '', url: '' }); HR.refresh(); }, 'btn-line btn-xs'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: x.done, onchange: function () { x.done = this.checked; this.closest('.ws-sub-edit').classList.toggle('done', this.checked); } }), ' 완료'));
    }), arr.length < 20 ? ui.btn('+ 서브 프로젝트 추가', function () { arr.push({ t: '', start: '', due: '', body: '', done: false, links: [] }); HR.refresh(); }, 'btn-line btn-sm') : null);
  }
  // 서브 시작일 빠른 입력 — 앞 서브(첫 서브는 상위 프로젝트) 기준
  function prevPresets(prev, x) {
    var opts = [];
    if (prev.start) {
      if (prev.name === '프로젝트') opts.push(['프로젝트 시작일', prev.start]);
      opts.push([prev.name + ' 시작 후 1주', L.addDays(prev.start, 7)]);
    }
    if (prev.due) opts.push([prev.name + ' 종료 후', L.addDays(prev.due, 1)]);
    if (!opts.length) return null;
    return h('div', { class: 'ws-quick ws-quick-prev' }, opts.map(function (o) {
      return h('button', { type: 'button', class: 'prev' + (x.start === o[1] ? ' on' : ''), text: o[0], title: fmt.dot(o[1]), onclick: function () { x.start = o[1]; HR.refresh(); } });
    }));
  }
  function cleanSubs(arr) {
    return (arr || []).filter(function (x) { return (x.t || '').trim(); }).slice(0, 20).map(function (x) {
      return { t: x.t.trim().slice(0, 80), start: x.start || '', due: x.due || '', body: (x.body || '').slice(0, 4000), done: !!x.done, links: cleanLinks(x.links || []) };
    });
  }
  function subPeriod(x) { return x.start || x.due ? (x.start ? fmt.dot(x.start).slice(2) : '') + ' → ' + (x.due ? fmt.dot(x.due).slice(2) : '') : '일정 미정'; }
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
          var body = { crew: (p.crew || []), intro: e.intro.trim(), slack: e.slack.trim(), links: cleanLinks(e.links), goals: e.goals.filter(function (g) { return g.t.trim(); }).map(function (g) { return { t: g.t.trim(), d: (g.d || '').trim(), due: g.due || '', st: g.st || 'idea' }; }), by: S.mid, updatedAt: FV.serverTimestamp() };
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
  // 날짜 빠른 선택 칩: [라벨, 수, 'd'(일)|'m'(달)] — 기준일에서 더한 날짜를 넣는다
  function addMonths(s0, n) {
    var y = +s0.slice(0, 4), m = +s0.slice(5, 7) - 1 + n, d0 = +s0.slice(8, 10);
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), t = new Date(Date.UTC(y, m, Math.min(d0, last)));
    return t.toISOString().slice(0, 10);
  }
  // plus: 지금 들어간 날짜(plusBase)에 더하는 버튼 — 누를 때마다 위 날짜가 올라간다
  function quickDates(opts, base, cur, set, plus, plusBase) {
    var calc = function (b0, o) { return o[2] === 'm' ? addMonths(b0, o[1]) : L.addDays(b0, o[1]); };
    return h('div', { class: 'ws-quick' }, opts.map(function (o) {
      var v = calc(base(), o);
      return h('button', { type: 'button', class: cur === v ? 'on' : '', text: o[0], title: fmt.dot(v), onclick: function () { set(calc(base(), o)); HR.refresh(); } });
    }), plus ? h('span', { class: 'ws-quick-sep' }) : null, (plus || []).map(function (o) {
      return h('button', { type: 'button', class: 'plus', text: o[0], title: '지금 날짜에서 ' + o[0].slice(1) + ' 더하기', onclick: function () { set(calc(plusBase(), o)); HR.refresh(); } });
    }));
  }
  function postForm(view, key, kind, p) {
    var dk = p ? p.id : 'new:' + key + kind;
    var d = draftPost && draftPost.key === dk ? draftPost
      : (draftPost = { key: dk, title: p ? p.title : '', body: p ? p.body : (kind === 'project' ? PROJECT_TEMPLATE : ''), status: p ? p.status : 'idea', owner: p ? p.owner : S.mid, people: p ? (p.people || []).slice() : [], flags: p ? (p.flags || []).slice() : [], start: p ? p.start || '' : '', due: p ? p.due || '' : '',
        tags: p ? (p.tags || []).join(', ') : '', links: p ? (p.links || []).map(function (l) { return Object.assign({}, l); }) : [{ t: '', url: '' }],
        subs: p ? (p.subs || []).map(function (x) { return { t: x.t || '', start: x.start || '', due: x.due || '', body: x.body || '', done: !!x.done, links: (x.links || []).map(function (l) { return Object.assign({}, l); }) }; }) : [] });
    var m = ui.msg(), back = kind === 'project' ? 'projects' : 'board';
    var body = h('textarea', { rows: '16', maxlength: '20000', oninput: function () { d.body = this.value; } }); body.value = d.body;
    var f = h('form', { class: 'panel ws-form' }, ui.label((p ? 'Edit · ' : 'New · ') + (kind === 'project' ? '프로젝트' : '글') + ' · ' + spaceName(key)),
      ui.field('제목 *', h('input', { type: 'text', value: d.title, maxlength: '100', oninput: function () { d.title = this.value; } })),
      kind === 'project' ? h('div', { class: 'form-grid' },
        ui.field('상태', ui.select(STATUS, d.status, { onchange: function () { d.status = this.value; } })),
        ui.field('리드 (진행 책임)', ui.select(HR.memberList(false).map(function (x) { return [x.id, x.name]; }), d.owner, { onchange: function () { d.owner = this.value; } })),
        ui.field('태그 (쉼표로 구분)', h('input', { type: 'text', value: d.tags, maxlength: '100', placeholder: '예: 런칭, 공식몰', oninput: function () { d.tags = this.value; } })),
        ui.field('시작일', h('div', { class: 'ws-datef' }, h('input', { type: 'date', value: d.start, onchange: function () { d.start = this.value; } }),
          quickDates([['오늘', 0, 'd'], ['1주 뒤', 7, 'd']], function () { return fmt.today(); }, d.start, function (v) { d.start = v; }))),
        ui.field('마감 예정일 (시작일 기준)', h('div', { class: 'ws-datef' }, h('input', { type: 'date', value: d.due, onchange: function () { d.due = this.value; } }),
          quickDates([['1주', 7, 'd'], ['2주', 14, 'd'], ['1달', 1, 'm'], ['2달', 2, 'm'], ['3달', 3, 'm'], ['6달', 6, 'm']], function () { return d.start || fmt.today(); }, d.due, function (v) { d.due = v; },
            [['+1주', 7, 'd'], ['+1달', 1, 'm']], function () { return d.due || d.start || fmt.today(); })))) : null,
      kind === 'project' ? h('div', { class: 'field' }, h('label', { text: '프로젝트 특성 (여러 개 선택 가능)' }), h('div', { class: 'ws-flagpick' }, FLAGS.map(function (x) {
        return h('label', { class: 'check chip fl-' + x[0] }, h('input', { type: 'checkbox', checked: d.flags.indexOf(x[0]) >= 0, onchange: function () { var i = d.flags.indexOf(x[0]); if (this.checked && i < 0) d.flags.push(x[0]); if (!this.checked && i >= 0) d.flags.splice(i, 1); } }), ' ' + x[1]);
      }))) : null,
      kind === 'project' ? h('div', { class: 'field' }, h('label', { text: '함께 진행하는 사람' }), h('div', { class: 'ws-people pick' }, HR.memberList(false).map(function (x) {
        return h('label', { class: 'check chip' }, h('input', { type: 'checkbox', checked: d.people.indexOf(x.id) >= 0, onchange: function () { var i = d.people.indexOf(x.id); if (this.checked && i < 0) d.people.push(x.id); if (!this.checked && i >= 0) d.people.splice(i, 1); } }), ' ' + x.name);
      }))) : null,
      h('div', { class: 'field' }, h('label', { text: '핵심 링크 — 스프레드시트 · 프레젠테이션 · 문서 · 드라이브 · 노션' }), linksEditor(d.links)),
      kind === 'project' ? h('div', { class: 'field ws-subs-field' }, h('label', { text: '서브 프로젝트 — 필요할 때만 추가 (이름 · 기간 · 내용 · 링크)' }), subsEditor(d.subs, d)) : null,
      ui.field(kind === 'project' ? '현황 · 구조' : '내용', body), h('p', { class: 'meta', text: FORMAT_HELP }), m,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit', text: '저장' }), ui.btn('취소', function () { draftPost = null; HR.go('ws/' + key + '/' + back + (p ? '/' + p.id : '')); }, 'btn-line')));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!d.title.trim()) return ui.err(m, '제목을 입력하세요.');
      if (kind === 'project' && d.start && d.due && d.start > d.due) return ui.err(m, '마감 예정일이 시작일보다 빠릅니다.');
      var badSub = kind === 'project' ? d.subs.filter(function (x) { return x.start && x.due && x.start > x.due; })[0] : null;
      if (badSub) return ui.err(m, '서브 프로젝트 「' + (badSub.t || '이름 없음') + '」의 마감 예정일이 시작일보다 빠릅니다.');
      if (kind === 'project' && d.subs.some(function (x) { return !x.t.trim() && (x.body.trim() || x.start || x.due); })) return ui.err(m, '서브 프로젝트 이름을 적어 주세요.');
      var bad = d.links.filter(function (l) { return l.url.trim() && !/^https:\/\/\S+$/.test(l.url.trim()); });
      if (bad.length) return ui.err(m, '링크는 https:// 로 시작해야 합니다: ' + bad[0].url);
      var data = { org: key, kind: kind, title: d.title.trim(), body: d.body, status: kind === 'project' ? d.status : 'post', owner: kind === 'project' ? d.owner : S.mid, flags: kind === 'project' ? FLAGS.map(function (x) { return x[0]; }).filter(function (k) { return d.flags.indexOf(k) >= 0; }) : [], start: kind === 'project' ? d.start || '' : '', due: kind === 'project' ? d.due : '',
        tags: kind === 'project' ? d.tags.split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 8) : [], links: cleanLinks(d.links), subs: kind === 'project' ? cleanSubs(d.subs) : [],
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
        h('h1', { class: 'ws-title' }, p.kind === 'project' ? flagBadges(p) : null, p.title),
        h('div', { class: 'ws-meta' }, st && p.kind === 'project' ? ui.tag(st[1], p.status === 'done' ? 'mute' : p.status === 'doing' ? 'ok' : 'warn') : null,
          h('span', { class: 'meta', text: [p.kind === 'project' ? '담당 ' + HR.name(p.owner) : HR.name(p.createdBy), p.start ? '시작 ' + fmt.dot(p.start) : '', p.due ? '마감 예정 ' + fmt.dot(p.due) : '', '작성 ' + fmt.ts(p.createdAt) + (p.updatedAt ? ' · 수정 ' + fmt.ts(p.updatedAt) : '')].filter(Boolean).join(' · ') }),
          (p.tags || []).map(function (t) { return ui.tag('#' + t, 'mute'); })),
        (p.links || []).length ? h('div', { class: 'ws-links big' }, p.links.map(linkChip)) : null,
        (p.subs || []).length ? h('section', { class: 'ws-subs' }, h('div', { class: 'ws-subs-head' }, h('b', { text: '서브 프로젝트' }),
            h('span', { class: 'meta', text: p.subs.filter(function (x) { return x.done; }).length + ' / ' + p.subs.length + ' 완료' })),
          h('ol', null, p.subs.map(function (x, i) {
            return h('li', { class: 'ws-subitem' + (x.done ? ' done' : '') }, h('div', { class: 'ws-sub-top' }, h('span', { class: 'ws-sub-no', text: 'SUB ' + (i + 1) }), h('b', { text: x.t }),
                x.done ? ui.tag('완료', 'ok') : null, h('span', { class: 'ws-sub-period', text: subPeriod(x) })),
              x.body ? h('div', { class: 'ws-sub-body' }, String(x.body).split('\n').map(function (l) { return l.trim() ? h('p', { text: l }) : null; })) : null,
              (x.links || []).length ? h('div', { class: 'ws-links small' }, x.links.map(linkChip)) : null);
          }))) : null,
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
    return h('a', { class: 'ws-card', href: '#ws/' + p.org + '/projects/' + p.id }, showSpace ? h('span', { class: 'ws-space', text: spaceName(p.org) }) : null, h('b', null, flagBadges(p), p.title),
      h('span', { class: 'meta', text: [HR.name(p.owner) + ((p.people || []).length ? ' 외 ' + p.people.length + '명' : ''), p.start || p.due ? (p.start ? fmt.dot(p.start) : '') + ' → ' + (p.due ? fmt.dot(p.due) : '') : ''].filter(Boolean).join(' · ') }),
      (p.links || []).length ? h('span', { class: 'ws-links small' }, p.links.slice(0, 4).map(linkChip)) : null,
      (p.tags || []).length ? h('span', { class: 'ws-tags' }, p.tags.map(function (t) { return h('span', { text: '#' + t }); })) : null);
  }
  // 노션처럼 간단한 목록: 진행 중 → 준비 → 완료. 같은 상태 안 순서는 각자(hr_private.projOrder)
  var LIST_ORDER = [['doing', '진행 중'], ['idea', '준비'], ['done', '완료']], projOrdering = false, showDone = false;
  function dday(due) {
    var n = Math.round((new Date(due + 'T00:00:00') - new Date(fmt.today() + 'T00:00:00')) / 864e5);
    return h('span', { class: 'ws-dday' + (n < 0 ? ' over' : n <= 7 ? ' soon' : ''), text: n === 0 ? 'D-day' : n > 0 ? 'D-' + n : 'D+' + (-n) });
  }
  function listOf(list, showSpace) {
    var my = (S.priv && S.priv.projOrder) || [];
    var rank = function (p) { var i = my.indexOf(p.id); return i < 0 ? 1e6 + ((p.due || '9999') < '9999' ? 0 : 1) : i; };
    var save = function (ids) { S.priv = Object.assign({}, S.priv, { projOrder: ids }); db.doc('hr_private/' + S.mid).set({ projOrder: ids.slice(0, 300), updatedAt: FV.serverTimestamp() }, { merge: true }).catch(ui.fail); HR.refresh(); };
    var wrap = h('div', { class: 'ws-plist' + (showSpace ? ' with-space' : '') });
    LIST_ORDER.forEach(function (st) {
      var items = list.filter(function (p) { return (p.status || 'idea') === st[0]; }).sort(function (a, b) { return rank(a) - rank(b) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1); });
      if (st[0] === 'done' && !showDone && !projOrdering) {
        if (items.length) wrap.appendChild(h('button', { type: 'button', class: 'ws-plist-more', text: '완료 ' + items.length + '개 보기', onclick: function () { showDone = true; HR.refresh(); } }));
        return;
      }
      var sec = h('section', { class: 'ws-pgroup st-' + st[0] }, h('div', { class: 'ws-pgroup-head' }, h('span', { class: 'ws-pdot' }), h('b', { text: st[1] }), h('span', { class: 'meta', text: items.length + '' }),
        st[0] === 'done' && showDone && !projOrdering ? h('a', { href: '#', class: 'link', text: '접기', onclick: function (e) { e.preventDefault(); showDone = false; HR.refresh(); } }) : null));
      if (items.length) sec.appendChild(h('div', { class: 'ws-prow ws-phead' }, h('span'), showSpace ? h('span', { text: '공간' }) : null, h('span', { text: '프로젝트' }), h('span', { text: '진행자' }), h('span', { text: '시작일' }), h('span', { text: '마감 예정일' }), h('span', { text: '링크' }), h('span', { text: '태그' })));
      if (!items.length) sec.appendChild(h('div', { class: 'ws-prow empty', text: '없음' }));
      items.forEach(function (p, i) {
        var move = function (k) { return function (e) { e.preventDefault(); e.stopPropagation();
          var ids = items.map(function (x) { return x.id; }), j = i + k; if (j < 0 || j >= ids.length) return; var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
          var rest = my.filter(function (x) { return ids.indexOf(x) < 0; }); save(ids.concat(rest)); }; };
        sec.appendChild(h('a', { class: 'ws-prow', href: '#ws/' + p.org + '/projects/' + p.id },
          projOrdering ? h('span', { class: 'ws-pmove' }, h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↑', disabled: i === 0, onclick: move(-1) }), h('button', { type: 'button', class: 'btn btn-line btn-xs', text: '↓', disabled: i === items.length - 1, onclick: move(1) })) : h('span'),
          showSpace ? spaceBadge(p.org) : null,
          h('span', { class: 'ws-ptitle' }, flagBadges(p), h('span', { class: 'ws-ptitle-t', text: p.title }), (p.subs || []).length ? h('span', { class: 'ws-subcount', text: '서브 ' + p.subs.filter(function (x) { return x.done; }).length + '/' + p.subs.length }) : null),
          h('span', { class: 'ws-pmeta' }, HR.name(p.owner) + ((p.people || []).length ? ' 외 ' + p.people.length : '')),
          h('span', { class: 'ws-pdate ws-pstart' }, p.start ? fmt.dot(p.start) : '—'),
          h('span', { class: 'ws-pdate ws-pdue' }, p.due ? fmt.dot(p.due) : '—', p.due && p.status !== 'done' ? dday(p.due) : null),
          h('span', { class: 'ws-plinks' }, (p.links || []).slice(0, 4).map(linkChip)),
          h('span', { class: 'ws-ptags' }, (p.tags || []).slice(0, 3).map(function (t) { return '#' + t; }).join(' '))));
      });
      wrap.appendChild(sec);
    });
    return wrap;
  }
  /* ---------- 타임라인 보기 (monday.com식 가로 막대: 시작일 → 마감 예정일) ---------- */
  var projView = (function () { try { return localStorage.getItem('hrWsView') || 'list'; } catch (e) { return 'list'; } })(), tlSpan = 0;
  function viewToggle() {
    var set = function (v) { return function (e) { e.preventDefault(); projView = v; try { localStorage.setItem('hrWsView', v); } catch (x) { /* 무시 */ } HR.refresh(); }; };
    return h('div', { class: 'ws-viewtog', role: 'group', 'aria-label': '보기 방식' },
      h('button', { type: 'button', class: projView === 'list' ? 'on' : '', text: '☰ 목록', onclick: set('list') }),
      h('button', { type: 'button', class: projView === 'timeline' ? 'on' : '', text: '▤ 타임라인으로 보기', onclick: set('timeline') }));
  }
  function projectsOf(list, showSpace) { return projView === 'timeline' ? timelineOf(list, showSpace) : listOf(list, showSpace); }
  function dnum(d) { return Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5); }
  function createdDay(p) { return p.createdAt && p.createdAt.toDate ? L.kstDate(p.createdAt.toDate()) : ''; }
  // 위치는 CSSOM으로 준다 — CSP가 인라인 style 속성을 막는다
  function at(el, left, width) { el.style.left = left + '%'; if (width !== undefined) el.style.width = width + '%'; return el; }
  var tlFold = {}, tlOpen = {};   // 프로젝트별 서브 접기 · 서브별 상세 펼치기
  function timelineOf(list, showSpace) {
    var today = fmt.today(), T = dnum(today);
    var spanOf = function (p) {
      var st = p.start || createdDay(p) || today, en = p.due || '';
      if (en && en < st) st = en;
      return { s: dnum(st), e: en ? dnum(en) : null, start: st, due: en };
    };
    // 보이는 기간: 선택값(3 · 6 · 12개월) 또는 자동(모든 막대 + 오늘 앞뒤 여유)
    var lo = T - 14, hi = T + 60;
    if (tlSpan) { lo = T - 14; hi = lo + tlSpan * 30; }
    else list.forEach(function (p) {
      var x = spanOf(p); lo = Math.min(lo, x.s - 7); hi = Math.max(hi, (x.e || x.s + 14) + 14);
      (p.subs || []).forEach(function (sb) { [sb.start, sb.due].forEach(function (dd) { if (dd) { lo = Math.min(lo, dnum(dd) - 7); hi = Math.max(hi, dnum(dd) + 14); } }); });
    });
    var first = new Date((lo) * 864e5), mStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) / 864e5;
    lo = mStart;
    var total = Math.max(30, hi - lo), pct = function (d) { return Math.max(0, Math.min(100, (d - lo) / total * 100)); };
    // 머리줄: 달
    var months = [];
    for (var m = new Date(lo * 864e5); m.getTime() / 864e5 < hi; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
      var a = m.getTime() / 864e5, b = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1) / 864e5;
      months.push(at(h('span', { class: 'tl-month' + (m.getUTCMonth() === 0 ? ' jan' : ''), text: (m.getUTCMonth() === 0 || !months.length ? String(m.getUTCFullYear()).slice(2) + '. ' : '') + (m.getUTCMonth() + 1) + '월' }), pct(a), pct(Math.min(b, hi)) - pct(a)));
    }
    var todayLine = function () { return T >= lo && T <= hi ? at(h('span', { class: 'tl-today' }), pct(T)) : null; };
    var spans = [0, 3, 6, 12].map(function (n) { return h('button', { type: 'button', class: tlSpan === n ? 'on' : '', text: n ? n + '개월' : '자동', onclick: function () { tlSpan = n; HR.refresh(); } }); });
    var wrap = h('div', { class: 'ws-tl' + (showSpace ? ' with-space' : '') },
      h('div', { class: 'tl-tools' }, h('span', { class: 'meta', text: '막대 = 시작일 → 마감 예정일 · 빨간 선 = 오늘' }), h('div', { class: 'tl-spans' }, spans)));
    var scroller = h('div', { class: 'tl-scroll' }), grid = h('div', { class: 'tl-grid' });
    grid.appendChild(h('div', { class: 'tl-row tl-head' }, h('div', { class: 'tl-label', text: '프로젝트' }), h('div', { class: 'tl-track' }, months, todayLine())));
    LIST_ORDER.forEach(function (stt) {
      var items = list.filter(function (p) { return (p.status || 'idea') === stt[0]; }).sort(function (a, b) { return spanOf(a).s - spanOf(b).s || ((a.due || '9999') < (b.due || '9999') ? -1 : 1); });
      if (!items.length) return;
      grid.appendChild(h('div', { class: 'tl-row tl-group st-' + stt[0] }, h('div', { class: 'tl-label' }, h('span', { class: 'ws-pdot' }), h('b', { text: stt[1] }), h('span', { class: 'meta', text: ' ' + items.length })), h('div', { class: 'tl-track' }, todayLine())));
      items.forEach(function (p) {
        var x = spanOf(p), end = x.e === null ? x.s + 14 : x.e + 1, left = pct(x.s), w = Math.max(pct(end) - left, 0.8);
        var label = p.title + (x.due ? '' : ' · 마감 미정');
        var bar = h('a', { class: 'tl-bar st-' + (p.status || 'idea') + (x.e === null ? ' open' : '') + ((p.flags || []).indexOf('urgent') >= 0 ? ' urgent' : ''), href: '#ws/' + p.org + '/projects/' + p.id,
          title: p.title + '\n' + fmt.dot(x.start) + ' → ' + (x.due ? fmt.dot(x.due) : '마감 미정') + '\n' + HR.name(p.owner) },
          h('span', { class: 'tl-bar-t', text: label }));
        at(bar, left, w);
        var outside = w < 9 ? at(h('a', { class: 'tl-bar-out', href: '#ws/' + p.org + '/projects/' + p.id, text: label }), Math.min(left + w, 100)) : null;
        if (outside) bar.classList.add('short');
        var over = x.e !== null && x.e < T && p.status !== 'done';
        grid.appendChild(h('div', { class: 'tl-row' },
          h('a', { class: 'tl-label', href: '#ws/' + p.org + '/projects/' + p.id }, showSpace ? spaceBadge(p.org) : null,
            h('span', { class: 'tl-name' }, flagBadges(p), h('span', { class: 'ws-ptitle-t', text: p.title })),
            h('span', { class: 'tl-sub' + (over ? ' over' : ''), text: HR.name(p.owner) + ' · ' + (x.due ? '~ ' + fmt.dot(x.due).slice(2) + (over ? ' 지남' : '') : '마감 미정') }),
            (p.subs || []).length ? h('span', { class: 'tl-subtoggle', role: 'button', text: (tlFold[p.id] ? '▸ ' : '▾ ') + '서브 ' + p.subs.filter(function (y) { return y.done; }).length + '/' + p.subs.length + ' 완료',
              onclick: function (e) { e.preventDefault(); e.stopPropagation(); tlFold[p.id] = !tlFold[p.id]; HR.refresh(); } }) : null),
          h('div', { class: 'tl-track' }, todayLine(), bar, outside)));
        // 서브 프로젝트: 프로젝트 바로 아래에 트리로 이어 붙인다 — 기간 · 일수 · 내용 첫 줄, 누르면 전체 내용 · 링크가 펼쳐진다
        var subs = p.subs || [];
        if (subs.length && !tlFold[p.id]) subs.forEach(function (sb, si) {
          var key = p.id + ':' + si, open = !!tlOpen[key], last = si === subs.length - 1;
          var has = sb.start || sb.due, a = has ? dnum(sb.start || sb.due) : 0, z = has ? dnum(sb.due || sb.start) + 1 : 0;
          var days = has ? z - a : 0, late = sb.due && !sb.done && dnum(sb.due) < T;
          var per = has ? subPeriod(sb) + ' · ' + days + '일' : '일정 미정';
          var first = String(sb.body || '').split('\n').filter(function (l) { return l.trim(); })[0] || '';
          var track = h('div', { class: 'tl-track' }, todayLine());
          if (has) {
            var l2 = pct(a), w2 = Math.max(pct(z) - l2, 0.6);
            var sbar = at(h('button', { type: 'button', class: 'tl-bar tl-subbar st-' + (sb.done ? 'done' : (p.status || 'idea')) + (late ? ' late' : ''), title: sb.t + ' · ' + per,
              onclick: function () { tlOpen[key] = !tlOpen[key]; HR.refresh(); } }, w2 >= 12 ? h('span', { class: 'tl-bar-t', text: sb.t + ' · ' + per }) : w2 >= 6 ? h('span', { class: 'tl-bar-t', text: sb.t }) : null), l2, w2);
            track.appendChild(sbar);
            if (w2 < 6) track.appendChild(at(h('span', { class: 'tl-bar-out sub', text: sb.t + ' · ' + per }), Math.min(l2 + w2, 100)));
          }
          grid.appendChild(h('div', { class: 'tl-row tl-subrow' + (last && !open ? ' last' : '') + (open ? ' open' : '') },
            h('button', { type: 'button', class: 'tl-label tl-sublabel' + (last ? ' last' : ''), onclick: function () { tlOpen[key] = !tlOpen[key]; HR.refresh(); } },
              h('span', { class: 'tl-subname' }, h('span', { class: 'tl-subcheck' + (sb.done ? ' on' : ''), text: sb.done ? '✓' : '' }), h('span', { class: 'tl-subname-t', text: sb.t }), h('span', { class: 'tl-subcaret', text: open ? '▴' : '▾' })),
              h('span', { class: 'tl-sub' + (late ? ' over' : ''), text: per + (late ? ' · 지남' : '') }),
              first ? h('span', { class: 'tl-subdesc', text: first }) : null),
            track));
          if (open) grid.appendChild(h('div', { class: 'tl-row tl-subdetail' + (last ? ' last' : '') },
            h('div', { class: 'tl-label tl-sublabel tl-subline' + (last ? ' last' : '') }),
            h('div', { class: 'tl-subdetail-body' },
              h('div', { class: 'tl-subdetail-head' }, h('b', { text: sb.t }), sb.done ? ui.tag('완료', 'ok') : late ? ui.tag('마감 지남', 'red') : null, h('span', { class: 'meta', text: per })),
              sb.body ? h('div', { class: 'ws-sub-body' }, String(sb.body).split('\n').map(function (l) { return l.trim() ? h('p', { text: l }) : null; })) : h('p', { class: 'meta', text: '적힌 내용이 없습니다.' }),
              (sb.links || []).length ? h('div', { class: 'ws-links small' }, sb.links.map(linkChip)) : null)));
        });
      });
    });
    if (!list.length) grid.appendChild(h('div', { class: 'tl-row empty', text: '프로젝트가 없습니다.' }));
    scroller.appendChild(grid); wrap.appendChild(scroller);
    setTimeout(function () { var t = scroller.querySelector('.tl-head .tl-today'); if (t && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = Math.max(0, t.offsetLeft + 220 - scroller.clientWidth / 3); }, 0);
    return wrap;
  }
  function orderToggle() { if (projView === 'timeline') return null; return h('a', { href: '#', class: 'link', text: projOrdering ? '순서 편집 끝' : '⇅ 프로젝트 순서', onclick: function (e) { e.preventDefault(); projOrdering = !projOrdering; HR.refresh(); } }); }
  function boardOf(list, showSpace) {
    return h('div', { class: 'ws-board' }, STATUS.map(function (s) {
      var items = list.filter(function (p) { return (p.status || 'idea') === s[0]; }).sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
      return h('section', { class: 'ws-col st-' + s[0] }, h('div', { class: 'ws-col-head' }, h('b', { text: s[1] }), h('span', { class: 'meta', text: items.length + '' })),
        items.map(function (p) { return card(p, showSpace); }), !items.length ? h('p', { class: 'empty', text: '없음' }) : null);
    }));
  }
  function projects(view, key, parts) {
    var whole = key === ALL && !parts[0];   // 전사 탭은 모든 팀 · TF 프로젝트를 한눈에
    var list = (whole ? allProjects() : posts(key)).filter(function (p) { return p.kind === 'project'; });
    if (parts[0] === 'new') return inTeam(key) ? postForm(view, key, 'project', null) : null;
    if (parts[0]) { var p = list.filter(function (x) { return x.id === parts[0]; })[0]; if (!p) return ui.put(view, ui.empty('불러오는 중…')); return parts[1] === 'edit' ? postForm(view, key, 'project', p) : postView(view, key, p, 'projects'); }
    ui.put(view, h('div', { class: 'toolbar' }, h('span', { class: 'meta', text: (whole ? '회사 전체 프로젝트 ' : '프로젝트 ') + list.length + '개' }), viewToggle(), orderToggle(), inTeam(key) ? ui.btn('+ 새 프로젝트', function () { draftPost = null; HR.go('ws/' + key + '/projects/new'); }) : null), projectsOf(list, whole));
  }
  function everyProject(view) {
    var list = allProjects(), q = (HR.wsQ || '');
    var search = ui.input({ type: 'search', value: q, placeholder: '프로젝트 · 태그 · 담당자 검색', oninput: function () { HR.wsQ = this.value; HR.refresh(); } });
    var f = list.filter(function (p) { var s = (p.title + ' ' + (p.tags || []).join(' ') + ' ' + HR.name(p.owner) + ' ' + spaceName(p.org)).toLowerCase(); return !q || s.indexOf(q.toLowerCase()) >= 0; });
    ui.put(view, h('div', { class: 'toolbar' }, ui.field('검색', search, 'inline'), h('span', { class: 'meta', text: '전체 ' + f.length + '개 · 팀 · TF를 가리지 않고 모든 프로젝트' }), viewToggle(), orderToggle()), projectsOf(f, true));
  }

  /* ---------- 게시판 ---------- */
  /* ---------- INFO — 팀별 핵심 링크 · 자료실 (hr_ws_res) ---------- */
  var RES_CATS = ['리스트 · DB', '가이드 · 매뉴얼', '계정 · 툴', '자료 · 레퍼런스', '기타'];
  var resDraft = null, resQ = '';
  function resList(key) { return HR.load('ws_res:' + key, function () { return db.collection('hr_ws_res').where('org', '==', key).get().then(HR.rows); }); }
  function resForm(key, cur) {
    if (!resDraft || resDraft.id !== (cur ? cur.id : null)) resDraft = cur ? { id: cur.id, title: cur.title, url: cur.url, desc: cur.desc || '', cat: cur.cat || '기타', pin: !!cur.pin } : { id: null, title: '', url: '', desc: '', cat: RES_CATS[0], pin: false };
    var d = resDraft, m = ui.msg();
    return h('form', { class: 'panel ws-res-form', onsubmit: function (e) {
      e.preventDefault();
      if (!d.title.trim()) return ui.err(m, '제목을 적어 주세요.');
      if (!/^https:\/\/\S+$/.test(d.url.trim())) return ui.err(m, '링크는 https:// 로 시작해야 합니다. 파일은 Google Drive에 올리고 공유 링크를 넣어 주세요.');
      var data = { org: key, title: d.title.trim().slice(0, 80), url: d.url.trim(), desc: d.desc.trim().slice(0, 300), cat: d.cat, pin: !!d.pin, updatedAt: FV.serverTimestamp(), updatedBy: S.mid };
      var op = cur ? db.doc('hr_ws_res/' + cur.id).update(data) : db.collection('hr_ws_res').add(Object.assign(data, { by: S.mid, at: FV.serverTimestamp() }));
      op.then(function () { resDraft = null; HR.invalidate('ws_res:' + key); ui.toast(cur ? '수정했습니다.' : 'INFO에 추가했습니다.'); }).catch(function (x) { ui.fail(x, m); });
    } }, ui.label(cur ? 'Edit · 자료 수정' : 'New · INFO에 자료 추가'),
      h('div', { class: 'form-grid' },
        ui.field('제목 *', ui.input({ value: d.title, maxlength: '80', placeholder: '예: 인플루언서 리스트 (2026 하반기)', oninput: function () { d.title = this.value; } })),
        ui.field('분류', ui.select(RES_CATS.map(function (c) { return [c, c]; }), d.cat, { onchange: function () { d.cat = this.value; } }))),
      ui.field('링크 * — 시트 · 드라이브 · 노션 · 문서', ui.input({ type: 'url', value: d.url, placeholder: 'https://docs.google.com/spreadsheets/…', oninput: function () { d.url = this.value; } })),
      ui.field('한 줄 설명', ui.input({ value: d.desc, maxlength: '300', placeholder: '예: 팔로워 · 단가 · 협업 이력 · 연락처 — 매주 월요일 업데이트', oninput: function () { d.desc = this.value; } })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: d.pin, onchange: function () { d.pin = this.checked; } }), ' 맨 위에 고정 (팀이 가장 자주 쓰는 자료)'),
      m, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit', text: cur ? '수정 저장' : '추가' }), ui.btn('취소', function () { resDraft = null; HR.go('ws/' + key + '/info'); }, 'btn-line')));
  }
  function infoTab(view, key, parts) {
    var list = resList(key), can = inTeam(key);
    if (parts[0] === 'new' && can) return ui.put(view, resForm(key, null));
    if (!list) return ui.put(view, ui.empty('불러오는 중…'));
    if (parts[0] && parts[1] === 'edit' && can) { var cur = list.filter(function (x) { return x.id === parts[0]; })[0]; if (cur) return ui.put(view, resForm(key, cur)); }
    var rows = list.slice().sort(function (a, b) { return (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || RES_CATS.indexOf(a.cat) - RES_CATS.indexOf(b.cat) || (a.title || '').localeCompare(b.title || '', 'ko'); });
    var count = h('span', { class: 'meta' });
    var items = rows.map(function (x) {
      var k = linkKind(x.url);
      var li = h('li', { class: 'ws-res' + (x.pin ? ' pin' : '') },
        h('a', { class: 'ws-res-main', href: x.url, target: '_blank', rel: 'noopener noreferrer' },
          h('span', { class: 'ws-res-kind ' + k[1], text: k[0] }),
          h('div', { class: 'ws-res-text' }, h('b', null, x.pin ? h('span', { class: 'ws-res-pin', text: '고정' }) : null, x.title), x.desc ? h('span', { class: 'meta', text: x.desc }) : null),
          h('span', { class: 'ws-res-open', text: '열기 ↗' })),
        h('div', { class: 'ws-res-foot' }, h('span', { class: 'ws-res-cat', text: x.cat || '기타' }), h('span', { class: 'meta', text: HR.name(x.updatedBy || x.by) + ' · ' + fmt.ts(x.updatedAt || x.at) }),
          can ? h('a', { href: '#ws/' + key + '/info/' + x.id + '/edit', class: 'link', text: '수정' }) : null,
          can ? ui.confirmBtn('삭제', function () { db.doc('hr_ws_res/' + x.id).delete().then(function () { HR.invalidate('ws_res:' + key); }).catch(ui.fail); }) : null));
      li._hay = (x.title + ' ' + (x.desc || '') + ' ' + (x.cat || '')).toLowerCase(); return li;
    });
    var none = h('p', { class: 'empty', text: '찾는 자료가 없습니다.' });
    function apply() { var ws = resQ.trim().toLowerCase().split(/\s+/).filter(Boolean), n = 0; items.forEach(function (li) { var ok = ws.every(function (w) { return li._hay.indexOf(w) >= 0; }); li.hidden = !ok; if (ok) n++; }); count.textContent = n + '개'; none.hidden = n > 0 || !items.length; }
    var search = h('input', { type: 'search', class: 'ws-res-search', value: resQ, placeholder: 'INFO 검색 — 예: 인플루언서, 가이드, 계정', oninput: function () { resQ = this.value; apply(); } });
    ui.put(view, h('div', { class: 'toolbar' }, h('span', { class: 'meta', text: spaceName(key) + ' 팀의 핵심 링크 · 자료' }), count,
        can ? ui.btn('+ 자료 추가', function () { resDraft = null; HR.go('ws/' + key + '/info/new'); }, 'btn-sm') : null),
      rows.length ? search : null,
      rows.length ? h('ul', { class: 'ws-res-list' }, items) : ui.empty(can ? '아직 등록된 자료가 없습니다. 인플루언서 리스트 · 가이드 · 자주 쓰는 계정처럼 팀이 늘 꺼내 보는 링크를 모아 두세요.' : '아직 등록된 자료가 없습니다.'),
      none, h('p', { class: 'meta', text: '파일은 Google Drive에 올리고 공유 링크로 추가하세요. 다른 팀도 볼 수 있습니다 — 민감한 정보는 링크 권한으로 관리해 주세요.' }));
    apply();
  }
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
      var sub = parts[1] || 'projects';   // 들어오면 프로젝트부터. 소개 · 목표는 뒤로
      var groupsEl = [], cur = null;
      ss.forEach(function (t) {
        if (!cur || cur.name !== t[3]) { cur = { name: t[3], el: h('div', { class: 'ws-group' + (t[2] === 'tf' ? ' tf' : '') }, t[3] ? h('span', { class: 'ws-group-name', text: t[3] }) : null) }; groupsEl.push(cur); }
        cur.el.appendChild(h('a', { href: '#ws/' + t[0], class: t[0] === key ? 'active' : '', text: t[1] }));
      });
      var tabs = h('nav', { class: 'ws-nav', 'aria-label': '팀 · TF' },
        h('div', { class: 'ws-group' }, h('a', { href: '#ws/' + EVERY, class: 'ws-every' + (key === EVERY ? ' active' : ''), text: '전체 프로젝트' })),
        groupsEl.map(function (g) { return g.el; }),
        h('div', { class: 'ws-group ws-tools' },
          h('a', { href: '#', class: 'ws-add', text: '+ TF', onclick: function (e) { e.preventDefault(); tfForm = true; ordering = false; HR.refresh(); } }),
          h('a', { href: '#', class: 'ws-add', text: '⇅ 순서', onclick: function (e) { e.preventDefault(); ordering = !ordering; tfForm = false; HR.refresh(); } })));
      ui.put(view, h('div', { class: 'ws-top' }, h('span', { class: 'ws-kicker', text: 'WORK · 팀 · TF 공간' }), tabs));
      if (tfForm) return newTf(view);
      if (ordering) return ui.put(view, orderPanel());
      if (key === EVERY) return everyProject(view);
      var tfDoc = /^tf_/.test(key) ? tfs().filter(function (x) { return x.id === key; })[0] : null;
      var pgc = key !== EVERY ? page(key) : null, assigned = pgc && (pgc.crew || []).length ? pgc.crew.slice() : null;
      var who = assigned || (tfDoc ? (tfDoc.members || []).slice() : HR.memberList(false).filter(function (m) { return key === ALL ? false : m.orgId === key; }).map(function (m) { return m.id; }));
      if (!assigned) posts(key).forEach(function (p) { if (p.kind === 'project' && p.status !== 'done') crew(p).forEach(function (x) { if (who.indexOf(x) < 0) who.push(x); }); });
      if (!parts[2]) {
        var cr = crewRow(who, '진행자', false);
        if (S.isAdmin) cr.appendChild(h('a', { href: '#', class: 'link ws-crew-edit', text: crewEdit === key ? '닫기' : '진행자 지정', onclick: function (e) { e.preventDefault(); crewEdit = crewEdit === key ? null : key; HR.refresh(); } }));
        ui.put(view, cr);
        if (S.isAdmin && crewEdit === key) ui.put(view, crewEditor(key, assigned || who));
      }   // 프로젝트 상세에서는 그 프로젝트 진행자만
      var subNav = ui.tabs([['projects', '프로젝트'], ['info', 'INFO'], ['board', '게시판'], ['intro', '소개 · 목표']], sub, 'ws/' + key);
      subNav.lastChild.classList.add('ws-sub-minor'); subNav.insertBefore(h('span', { class: 'ws-sub-sep', 'aria-hidden': 'true' }), subNav.lastChild);
      ui.put(view, h('div', { class: 'ws-sub' }, subNav));
      if (sub === 'intro') return introTab(view, key);
      if (sub === 'info') return infoTab(view, key, parts.slice(2));
      if (sub === 'board') return board(view, key, parts.slice(2));
      projects(view, key, parts.slice(2));
    }
  });
})();
