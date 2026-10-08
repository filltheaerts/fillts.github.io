/* VINEGRAPHY Brand Asset — HR과 같은 로그인(core.js)을 쓰고 메뉴만 바꾼다. 접근: 구성원 전원 (core.js APPS open)
   내용 원본: Firestore hr_plan/brand(공지 › 01 바인그라피와 같은 문서) + hr_plan/vinegraphy(제품 사양 · 상세페이지 · 패키지 문안 · 검수)
   공개 저장소에는 내용을 두지 않는다 → 수정은 hr_backend/data/vinegraphy.json 고친 뒤 `python seed_hr_plan.py vinegraphy` */
window.HR_APP = { id: 'vg', title: 'VINEGRAPHY', home: 'brand', lite: true, menus: ['brand', 'product', 'pdp', 'pack', 'check'] };
