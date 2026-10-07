/* fillts Influencer — 전략: 유튜버 성사율 높이기 · 감동시키기 · 계약 / 규정 · 우리 플레이북
   조사 내용은 i-strat-data.js(window.INF_STRAT, 버전 관리), 팀이 쓰는 값은 Firestore
   · inf_config/main.applied { 항목id: true } — 「적용 중」 체크
   · inf_config/main.playbook { 탭id: 글 } — 탭마다 「우리 결론」
   · inf_ideas — 감동 아이디어 보드 (제목 · 내용 · 비용 · 상태 · ♥) */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var V = I.V.strat = { idea: { t: '', d: '', cost: '', st: 'idea' }, ideaSort: 'likes', msg: '', edit: {} };
  I.ideas = [];
  var prevStart = HR.APP.onStart;
  HR.APP.onStart = function (sub) {
    if (prevStart) prevStart(sub);
    sub(db.collection('inf_ideas'), function (s) { I.ideas = HR.rows(s); I.loaded.ideas = true; });
  };
  var TABS = [['', '① 성사율 높이기'], ['delight', '② 감동 전략'], ['rules', '③ 계약 · 규정 · 성과'], ['play', '④ 우리 플레이북']];
  var IST = [['idea', '아이디어'], ['ready', '준비 중'], ['try', '시도 중'], ['good', '효과 있음'], ['hold', '보류']];
  var ISTN = {}; IST.forEach(function (x) { ISTN[x[0]] = x[1]; });
  var COST = [['', '비용 —'], ['low', '적음 (1만원 이하)'], ['mid', '보통 (1~5만원)'], ['high', '큼 (5만원 이상)']];

  function cfgSet(patch) { return db.doc('inf_config/main').set(Object.assign(patch, { updatedAt: FV.serverTimestamp(), updatedBy: S.mid }), { merge: true }).catch(ui.fail); }
  function applied() { return I.cfg.applied || {}; }

  // 조사 항목 카드
  function item(it, sid, i) {
    var id = sid + '_' + i, on = !!applied()[id];
    var cb = h('input', { type: 'checkbox', checked: on, onchange: function () { var p = {}; p[id] = this.checked; cfgSet({ applied: p }); } });
    return h('li', { class: 'in-st-item' + (on ? ' on' : '') },
      h('div', { class: 'in-st-top' }, h('span', { class: 'in-st-no', text: String(i + 1) }), h('b', { class: 'grow', text: it.k }),
        h('label', { class: 'check in-st-ap', title: '우리 팀이 이 방법을 쓰고 있으면 체크' }, cb, ' 적용 중')),
      it.how ? h('p', { class: 'in-st-how', text: it.how }) : null,
      it.why ? h('p', { class: 'meta', text: it.why }) : null,
      (it.src || []).length ? h('div', { class: 'in-st-src' }, (it.src || []).map(function (u, j) { return I.extLink(u, '출처 ' + (j + 1) + ' ↗', 'meta'); })) : null);
  }
  function section(sec) {
    var done = (sec.items || []).filter(function (it, i) { return applied()[sec.id + '_' + i]; }).length;
    return ui.panel(sec.title, h('span', { class: 'meta', text: '적용 ' + done + ' / ' + (sec.items || []).length }),
      sec.lead ? h('p', { class: 'note', text: sec.lead }) : null,
      h('ol', { class: 'in-st-list' }, (sec.items || []).map(function (it, i) { return item(it, sec.id, i); })));
  }
  function playbook(tab, title, ph) {
    var cur = (I.cfg.playbook || {})[tab] || '';
    var ta = h('textarea', { rows: '6', maxlength: '6000', value: cur, placeholder: ph });
    var msg = ui.msg();
    return ui.panel('우리 결론 — ' + title, h('span', { class: 'meta', text: '팀 공용 · 고칠 수 있음' }), ta, msg,
      h('div', { class: 'row' }, ui.btn('저장', function () { var p = {}; p[tab] = ta.value; cfgSet({ playbook: p }).then(function () { ui.ok(msg, '저장했습니다.'); }); }, 'btn-sm')));
  }

  /* ---------- 감동 아이디어 보드 ---------- */
  function ideaBoard() {
    var D = V.idea;
    var t = ui.input({ value: D.t, maxlength: '120', placeholder: '아이디어 제목 — 예: 첫 박스에 포도밭 엽서 + 손편지', oninput: function () { D.t = this.value; } });
    var d = h('textarea', { rows: '3', maxlength: '2000', value: D.d, placeholder: '어떻게 · 왜 감동할지 · 누구에게 먼저 해 볼지', oninput: function () { D.d = this.value; } });
    var cost = ui.select(COST, D.cost, { onchange: function () { D.cost = this.value; } });
    var msg = ui.msg();
    var add = function () {
      if (!D.t.trim()) return ui.err(msg, '제목을 넣으세요.');
      db.collection('inf_ideas').add({ t: D.t.trim(), d: D.d.trim(), cost: D.cost, st: 'idea', likes: [], by: S.mid, at: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() })
        .then(function () { V.idea = { t: '', d: '', cost: '', st: 'idea' }; ui.toast('아이디어를 올렸습니다.'); }).catch(function (e) { ui.fail(e, msg); });
    };
    var list = I.ideas.slice().sort(function (a, b) {
      return V.ideaSort === 'new' ? I.ms(b.at) - I.ms(a.at) : ((b.likes || []).length - (a.likes || []).length) || (I.ms(b.at) - I.ms(a.at));
    });
    var card = function (x) {
      var liked = (x.likes || []).indexOf(S.mid) >= 0;
      var like = h('button', { type: 'button', class: 'in-like' + (liked ? ' on' : ''), text: '♥ ' + (x.likes || []).length, onclick: function () {
        var l = (x.likes || []).slice(), i = l.indexOf(S.mid); if (i >= 0) l.splice(i, 1); else l.push(S.mid);
        db.doc('inf_ideas/' + x.id).update({ likes: l, updatedAt: FV.serverTimestamp() }).catch(ui.fail);
      } });
      var st = ui.select(IST, x.st || 'idea', { onchange: function () { db.doc('inf_ideas/' + x.id).update({ st: this.value, updatedAt: FV.serverTimestamp() }).catch(ui.fail); } });
      return h('li', { class: 'in-idea st-' + (x.st || 'idea') },
        h('div', { class: 'in-st-top' }, h('b', { class: 'grow', text: x.t }), like),
        x.d ? h('p', { class: 'in-st-how', text: x.d }) : null,
        h('div', { class: 'row in-idea-foot' }, st, x.cost ? ui.tag((COST.filter(function (c) { return c[0] === x.cost; })[0] || ['', ''])[1]) : null,
          h('span', { class: 'meta grow', text: HR.name(x.by) + ' · ' + fmt.ts(x.at) }),
          (x.by === S.mid || S.isAdmin) ? ui.confirmBtn('삭제', function () { db.doc('inf_ideas/' + x.id).delete().catch(ui.fail); }) : null));
    };
    var cols = IST.map(function (s) { return [s, list.filter(function (x) { return (x.st || 'idea') === s[0]; })]; });
    return ui.panel('감동 아이디어 보드 — 같이 고민하기', h('div', { class: 'in-seg' }, [['likes', '♥ 많은 순'], ['new', '최신 순']].map(function (o) {
      return h('button', { type: 'button', class: V.ideaSort === o[0] ? 'active' : '', text: o[1], onclick: function () { V.ideaSort = o[0]; HR.refresh(); } });
    })),
      h('div', { class: 'stack sm in-form' }, ui.field('아이디어', t), ui.field('설명', d), h('div', { class: 'row' }, ui.field('비용', cost), ui.btn('+ 아이디어 올리기', add, 'btn-sm')), msg),
      h('div', { class: 'in-idea-cols' }, cols.map(function (c) {
        return h('section', { class: 'in-idea-col' }, h('div', { class: 'label', text: c[0][1] + ' ' + c[1].length }),
          c[1].length ? h('ul', { class: 'in-idea-list' }, c[1].map(card)) : h('p', { class: 'meta', text: '—' }));
      })));
  }

  function render(view, parts) {
    var tab = parts[0] || '', D = window.INF_STRAT || { sections: {} };
    var secs = (D.sections || {})[tab || 'win'] || [];
    var body = [];
    if (tab === 'play') {
      body.push(h('p', { class: 'note', text: '세 탭에서 정한 결론과 체크한 「적용 중」 항목이 한눈에 모입니다. 새 유튜버를 컨택하기 전에 이 페이지를 보고 시작하세요.' }));
      var all = [];
      Object.keys(D.sections || {}).forEach(function (k) { (D.sections[k] || []).forEach(function (sec) { (sec.items || []).forEach(function (it, i) { if (applied()[sec.id + '_' + i]) all.push([sec.title, it.k]); }); }); });
      body.push(ui.panel('적용 중인 방법', h('span', { class: 'meta', text: all.length + '개' }),
        all.length ? h('ul', { class: 'list' }, all.map(function (x) { return h('li', null, h('b', { class: 'grow', text: x[1] }), h('span', { class: 'meta', text: x[0] })); })) : ui.empty('아직 체크한 항목이 없습니다. 각 탭에서 「적용 중」을 체크하세요.')));
      [['', '성사율 높이기'], ['delight', '감동 전략'], ['rules', '계약 · 규정 · 성과']].forEach(function (t) {
        var txt = (I.cfg.playbook || {})[t[0] || 'win'] || '';
        body.push(ui.panel('우리 결론 — ' + t[1], h('a', { href: '#strat' + (t[0] ? '/' + t[0] : ''), class: 'meta', text: '고치기 →' }), txt ? h('pre', { class: 'in-pre', text: txt }) : ui.empty('아직 비어 있습니다.')));
      });
      body.push(playbook('play', '전체 플레이북 (컨택 → 계약 → 시딩 → 업로드 → 관계 유지)', '예: 1) 첫 메일은 최근 영상 1편을 구체적으로 언급 2) 3일 뒤 리마인드 1회 3) 시딩 박스엔 손편지 …'));
    } else {
      if (!secs.length) body.push(ui.empty('조사 내용을 정리하는 중입니다.'));
      secs.forEach(function (sec) { body.push(section(sec)); });
      if (tab === 'delight') body.push(ideaBoard());
      body.push(playbook(tab || 'win', TABS.filter(function (x) { return x[0] === tab; })[0][1].replace(/^[①②③④]\s/, ''), '이 탭을 읽고 우리 팀이 정한 결론 · 원칙을 적어 두세요.'));
    }
    ui.put(view, ui.head('Strategy', '전략', D.asOf ? h('span', { class: 'meta', text: '조사 ' + D.asOf + ' · 출처 링크 포함' }) : null),
      ui.tabs(TABS, tab, 'strat'),
      h('p', { class: 'note in-st-intro', text: '유튜버 성사율을 높이는 방법과 감동시키는 전략을 조사해 모았습니다. 쓰고 있는 방법은 「적용 중」을 체크하고, 아이디어는 보드에 올려 같이 고민합니다.' }),
      body);
  }
  HR.register('strat', { render: render });
})();
