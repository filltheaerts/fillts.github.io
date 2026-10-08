/* fillts R&D — 연구개발전담부서. HR과 같은 로그인(core.js)을 쓰고 메뉴만 바꾼다. 접근: 관리자 + HR 설정 › 앱 접근에서 R&D 권한을 받은 계정
   내용 원본: Firestore rnd_docs/main(json) — 공개 저장소에는 내용을 두지 않는다 → hr_backend/data/rnd.json · rnd_extra.json 고친 뒤 `python seed_rnd.py`
   검증 체크리스트 상태: rnd_docs/status.checks { id: { st, by, at } } — 화면에서 바꿈 */
window.HR_APP = { id: 'rnd', title: 'fillts R&D', home: 'quick', lite: true, menus: ['kibo', 'quick', 'home', 'research', 'due', 'docs'] };
