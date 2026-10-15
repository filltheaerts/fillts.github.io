/* core.js를 쓰지 않는 화면(/mkt)용 부트 — 로그인 확인 뒤 비공개 화면 코드(functions/appsrc.js)를 받아 실행한다 (261009)
   화면 코드는 공개 저장소에 두지 않는다. 로그인 전 · 권한 없음이면 HR 로그인으로 보낸다(로그인 뒤 이 화면으로 돌아온다). */
(function () {
  var FN = 'https://asia-northeast3-fillts-web.cloudfunctions.net/appsrc';
  var OWNER_ONLY = 'kjw@fillts.com';   // hr/core.js · functions/appsrc.js와 같은 값 (잠금을 풀면 셋 다 '')
  var LOCK_FREE = { mkt: 1 };   // 잠금 예외 (261015) — 권한(apps.mkt)은 서버(appsrc)가 확인한다
  var dir = (location.pathname.match(/^\/([a-z0-9]+)\//) || [0, 'hr'])[1];
  if (!firebase.apps.length) firebase.initializeApp(window.FILLTS_FIREBASE);   // 화면 코드보다 먼저 auth를 써야 하므로 여기서 초기화 (261014)
  var auth = firebase.auth(), started = false;
  function toHr(why) {
    // 무한 왕복 방지 (261015): HR이 30초 안에 이리 보냈는데 또 HR로 보내야 하면 멈추고 이유를 보여 준다
    var jumped = 0; try { jumped = +sessionStorage.getItem('hrNextJump') || 0; } catch (e) { /* 무시 */ }
    if (Date.now() - jumped < 30000) { fail(why + ' — HR로 다시 보내지 않고 멈췄습니다. 상단 주소 /hr/ 에서 로그인 상태를 확인한 뒤 다시 열어 주세요'); return; }
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
    if (!u) { toHr('이 창에서 로그인 상태를 찾지 못했습니다'); return; }
    if (!u.emailVerified) { toHr('이메일 인증이 끝나지 않은 계정입니다'); return; }
    if (OWNER_ONLY && (u.email || '').toLowerCase() !== OWNER_ONLY && !LOCK_FREE[dir]) { toHr('검토 기간이라 이 화면은 대표 계정만 열립니다'); return; }
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
