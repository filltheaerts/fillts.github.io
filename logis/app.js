/* fillts Logistics — 물류 · 재고 · 재발주. HR과 같은 로그인(core.js)을 쓰고 메뉴만 바꾼다. 접근: 관리자 + HR 설정 › 앱 접근에서 Logistics 권한을 받은 계정
   데이터: logis_items(품목) · logis_moves(실사 · 입고 · 출고) · logis_vendors(발주처) · logis_specs(입고 사양 복사 카드) · logis_docs/main(기본사항 · 발주 현황 json)
   내용 원본은 공개 저장소에 두지 않는다 → hr_backend/data/logis_seed.json 고친 뒤 `python seed_logis.py` */
window.HR_APP = { id: 'logis', title: 'fillts Logistics', home: 'home', lite: true, menus: ['home', 'stock', 'wekeep', 'mail', 'order', 'spec'] };
