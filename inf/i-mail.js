/* fillts Influencer — 메일: 브랜드 · 내 서명 · 템플릿 편집 · 발송 기록 */
(function () {
  'use strict';
  var HR = window.HR, I = HR.I, S = HR.S, ui = HR.ui, h = ui.h, fmt = HR.fmt, db = HR.db, FV = HR.FV;
  var V = I.V.mail = { edit: '' };
  function cfgSet(patch) { return db.doc('inf_config/main').set(Object.assign(patch, { updatedAt: FV.serverTimestamp(), updatedBy: S.mid }), { merge: true }); }

  function brandPanel() {
    var me = S.members[S.mid] || {}, sig = (I.cfg.sigs || {})[S.mid] || {};
    var brand = ui.input({ value: I.cfg.brand || '바인그라피', maxlength: '40' });
    var product = ui.input({ value: I.cfg.product || '', maxlength: '120', placeholder: '예: 약산성 젤 클렌저' });
    var intro = h('textarea', { rows: '4', maxlength: '1500', value: I.cfg.intro || '', placeholder: '브랜드 · 제품을 2 ~ 4문장으로. {브랜드소개} 자리에 들어갑니다.' });
    var title = ui.input({ value: sig.title || me.title || '', maxlength: '40', placeholder: '예: 마케팅 매니저' });
    var phone = ui.input({ value: sig.phone || '', maxlength: '40', placeholder: '선택 — 서명에 표시' });
    var msg = ui.msg();
    return ui.panel('브랜드 · 내 서명', null, h('div', { class: 'stack sm in-form' },
      h('div', { class: 'row' }, ui.field('브랜드', brand), ui.field('제품', product, 'grow')),
      ui.field('브랜드 소개', intro),
      h('div', { class: 'row' }, ui.field('내 직함', title), ui.field('내 연락처', phone, 'grow')),
      msg, h('div', { class: 'row' }, ui.btn('저장', function () {
        var sigs = {}; sigs[S.mid] = { title: title.value.trim(), phone: phone.value.trim() };
        cfgSet({ brand: brand.value.trim(), product: product.value.trim(), intro: intro.value.trim(), sigs: sigs })
          .then(function () { ui.ok(msg, '저장했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
      }, 'btn-sm'))));
  }

  function tplForm(t, list) {
    var name = ui.input({ value: t.name || '', maxlength: '40' });
    var subj = ui.input({ value: t.subject || '', maxlength: '150' });
    var body = h('textarea', { rows: '16', maxlength: '6000', value: t.body || '' });
    var msg = ui.msg();
    var save = function () {
      if (!name.value.trim() || !subj.value.trim() || !body.value.trim()) return ui.err(msg, '이름 · 제목 · 본문을 모두 채우세요.');
      var nt = { id: t.id || 't' + Date.now().toString(36), name: name.value.trim(), subject: subj.value.trim(), body: body.value };
      var next = list.filter(function (x) { return x.id !== nt.id; });
      var i = list.map(function (x) { return x.id; }).indexOf(nt.id);
      if (i >= 0) next.splice(i, 0, nt); else next.push(nt);
      cfgSet({ templates: next.slice(0, 12) }).then(function () { V.edit = ''; ui.toast('템플릿을 저장했습니다.'); }).catch(function (e) { ui.fail(e, msg); });
    };
    return h('div', { class: 'stack sm in-form' }, ui.field('템플릿 이름', name), ui.field('제목', subj), ui.field('본문', body),
      h('p', { class: 'meta', text: '넣을 수 있는 자리: ' + I.VARS.map(function (v) { return '{' + v + '}'; }).join(' ') }), msg,
      h('div', { class: 'row' }, ui.btn('저장', save, 'btn-sm'), ui.btn('취소', function () { V.edit = ''; HR.refresh(); }, 'btn-line btn-sm'),
        t.id ? ui.confirmBtn('삭제', function () { cfgSet({ templates: list.filter(function (x) { return x.id !== t.id; }) }).then(function () { V.edit = ''; }).catch(ui.fail); }) : null));
  }
  function tplPanel() {
    var list = I.templates().slice(), sample = I.creators[0] || { ch: { title: '채널명', subs: 120000, recent: [{ title: '최근 영상 제목' }] } };
    var body = list.map(function (t) {
      if (V.edit === t.id) return h('div', { class: 'in-tpl' }, tplForm(t, list));
      return h('div', { class: 'in-tpl' }, h('div', { class: 'row' }, h('b', { class: 'grow', text: t.name }), ui.btn('수정', function () { V.edit = t.id; HR.refresh(); }, 'btn-line btn-xs')),
        h('div', { class: 'meta', text: I.fillTpl(t.subject, sample) }),
        h('pre', { class: 'in-pre', text: I.fillTpl(t.body, sample).slice(0, 600) }));
    });
    if (V.edit === 'new') body.push(h('div', { class: 'in-tpl' }, tplForm({}, list)));
    return ui.panel('메일 템플릿', V.edit ? null : ui.btn('+ 템플릿', function () { V.edit = 'new'; HR.refresh(); }, 'btn-sm'),
      !(I.cfg.templates && I.cfg.templates.length) ? h('p', { class: 'note', text: '기본 템플릿 3개입니다. 하나라도 저장하면 그때부터 이 목록이 팀 공용 템플릿이 됩니다.' }) : null,
      body, h('p', { class: 'note', text: '미리보기는 파이프라인 첫 채널(없으면 예시) 기준입니다. 실제 발송은 인플루언서 상세 › 메일 문의에서 합니다.' }));
  }
  function logPanel() {
    var list = I.mail;
    return ui.panel('발송 기록 (fillts 메일)', h('span', { class: 'meta', text: list.length + '통' }),
      list.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table in-table' },
        h('thead', null, h('tr', null, ['보낸 때', '채널', '받는 사람', '제목', '보낸 사람'].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, list.map(function (m) {
          return h('tr', { class: 'clickable', onclick: function () { HR.go('c/' + m.creatorId); } },
            h('td', { class: 'meta', text: fmt.ts(m.at) }), h('td', { class: 'strong', text: m.title }), h('td', { text: m.to }), h('td', { text: m.subject }), h('td', { text: HR.name(m.by) }));
        })))) : ui.empty('아직 fillts 메일로 보낸 기록이 없습니다. (Gmail에서 직접 보낸 메일은 각 인플루언서 기록에 남습니다.)'));
  }
  HR.register('mail', { render: function (view) {
    ui.put(view, ui.head('Outreach', '메일'), h('div', { class: 'in-two' }, h('div', { class: 'stack' }, brandPanel(), logPanel()), tplPanel()));
  } });
})();
