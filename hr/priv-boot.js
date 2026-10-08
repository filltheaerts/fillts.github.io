/* core.js를 쓰지 않는 화면(/mkt)용 부트 — 로그인 확인 뒤 비공개 화면 코드(functions/appsrc.js)를 받아 실행한다 (261009)
   화면 코드는 공개 저장소에 두지 않는다. 로그인 전 · 권한 없음이면 HR 로그인으로 보낸다(로그인 뒤 이 화면으로 돌아온다). */
(function () {
  var FN = 'https://asia-northeast3-fillts-web.cloudfunctions.net/appsrc';
  var OWNER_ONLY = 'kjw@fillts.com';   // hr/core.js · functions/appsrc.js와 같은 값 (잠금을 풀면 셋 다 '')
  var dir = (location.pathname.match(/^\/([a-z0-9]+)\//) || [0, 'hr'])[1];
  var auth = firebase.auth(), started = false;
  function toHr() {
    try { localStorage.setItem('hrNext', JSON.stringify({ to: location.pathname + (location.hash || ''), at: Date.now() })); } catch (e) { /* 무시 */ }
    location.replace('/hr/');
  }
  function fail(msg) {
    var d = document.createElement('p');
    d.style.cssText = 'margin:40px auto;max-width:560px;padding:16px;font:14px/1.6 sans-serif;color:#b00020;text-align:center';
    d.textContent = '화면을 불러오지 못했습니다 — ' + msg + '. 새로고침해 보세요.';
    document.body.appendChild(d);
  }
  function run(f) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script'), url = URL.createObjectURL(new Blob([f.c + '\n//# sourceURL=' + f.p], { type: 'text/javascript' }));
      s.src = url; s.onload = function () { URL.revokeObjectURL(url); ok(); }; s.onerror = function () { no(new Error('불러오기 실패: ' + f.p)); };
      document.head.appendChild(s);
    });
  }
  auth.onAuthStateChanged(function (u) {
    if (started) return;
    if (!u || !u.emailVerified || (OWNER_ONLY && (u.email || '').toLowerCase() !== OWNER_ONLY)) { toHr(); return; }
    started = true;
    u.getIdToken().then(function (t) {
      return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ app: dir }) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j.files || []; });
    }).then(function (files) {
      return files.reduce(function (p, f) { return p.then(function () { return run(f); }); }, Promise.resolve());
    }).catch(function (e) { fail(e && e.message ? e.message : '네트워크 오류'); });
  });
})();
