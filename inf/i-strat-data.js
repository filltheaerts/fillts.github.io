/* fillts Influencer — 전략 조사 (261007, 웹 조사 3갈래 병렬 · 출처 링크 포함)
   (추정)은 근거가 약해 실제 데이터로 검증해야 하는 값. 고치려면 이 파일을 수정한다 */
window.INF_STRAT = {
  asOf: '2026.10.07',
  sections: {
    win: [
      { id: 'w1', title: '컨택 · 첫 메일 — 답장률 높이기', lead: '전체 평균 답장률은 8.5% 수준. 개인화 · 조건 명시 · 후속 메일 세 가지가 가장 크게 움직인다 (Backlinko 1,200만 건 분석).', items: [
        { k: '첫 메일에 금액 · 조건을 먼저 제시', how: '예산 범위(협의 가능) · 결과물(롱폼 1 / 쇼츠 1) · 일정 · 2차 활용 범위를 한 덩어리로. 「단가표 주세요」만 보내지 말 것.', why: '크리에이터 59%가 명확한 예산 · 결과물, 61%가 명확한 제품 설명을 원함.', src: ['https://www.agilitypr.com/pr-news/social-media-influencer-marketing/why-dont-influencers-want-to-work-with-your-brand-heres-what-they-want-to-see-from-brands/', 'https://maily.so/tiyou/posts/92ze1pelrep'] },
        { k: '제목 · 첫 줄에 그 채널의 특정 영상 언급', how: '제목 예: 「○○님 클렌징 루틴 영상 보고 연락드립니다 | 바인그라피 협업 제안」. 첫 줄에 최근 영상 장면 하나 + 왜 이 채널인지 1줄.', why: '제목 개인화 시 답장률 +30.5%, 제목 36~50자가 최적. 크리에이터 43%가 개인화 메시지를 거의 못 받음.', src: ['https://backlinko.com/email-outreach-study', 'https://www.bandt.com.au/43-of-influencers-still-not-receiving-personalised-messages-from-brands/'] },
        { k: '후속 메일 1~2회, 약 1주 간격', how: '2~3문장으로 짧게 — 그 사이 올라온 새 영상 언급 + 마감일. (파이프라인 「회신 없음 5일」 알림과 같이 쓰기)', why: '후속 메일 1회로 답장률 최대 +65.8%. 무응답은 거절이 아니라 놓친 경우가 대부분.', src: ['https://backlinko.com/email-outreach-study'] },
        { k: '메일 + 인스타 DM 함께', how: '정보 탭 비즈니스 메일로 보낸 뒤, 답이 없으면 인스타 DM으로 「메일 드렸어요」 알리기. 소속(MCN) 채널은 담당자 메일로.', why: '여러 채널로 연락하면 답장률 +93%.', src: ['https://backlinko.com/email-outreach-study'] },
        { k: '보내는 때 — 화~목 오전 기본, 일요일 예약 발송 실험', how: '두 시간대를 나눠 보내고 리스트 · 메일 기록으로 답장률을 비교.', why: '크리에이터 대상 실험: 열람률은 목요일, 답장률은 일요일(11%)이 가장 높았다 — 일반 B2B와 반대.', src: ['https://chicory.co/blog/how-to-optimize-your-emails-to-bloggers-and-influencers'] }
      ] },
      { id: 'w2', title: '제안 설계 — 거절 이유를 미리 지우기', lead: '거절 1위는 「브랜드가 와닿지 않음」 51%, 그다음 예산 42% · 창작 자율 부족 38%.', items: [
        { k: '브랜드 적합성을 먼저 증명', how: '첫 메일에 1장 소개서 · 상세페이지 링크 · 「전성분 1번이 포도」 처방 근거 · 시험 결과 요약.', why: '거절 사유: 브랜드가 와닿지 않음 51% · 개인 브랜드와 맞지 않음 34%.', src: ['https://www.agilitypr.com/pr-news/social-media-influencer-marketing/why-dont-influencers-want-to-work-with-your-brand-heres-what-they-want-to-see-from-brands/'] },
        { k: '대본 대신 「꼭 지킬 것 3개 + 금지 표현」', how: '핵심 메시지 2~3개(포드득 · 60초 세안법 등)와 화장품법 금지 표현만 주고 연출 · 말투는 크리에이터에게.', why: '「무엇을 말할지 지시」 38% · 「과도한 제약」 18%가 거절 사유. 58%는 완전 자유보다 명확한 가이드를 원함.', src: ['https://www.bandt.com.au/half-of-aussie-creators-have-walked-away-from-inauthentic-brand-deals-research-finds/', 'https://www.netinfluencer.com/research-highlights-vital-gaps-between-creators-and-brands/'] },
        { k: '시세 밑으로 부르지 않기 — 최근 영상 평균 조회 기준', how: '구독자 수가 아니라 최근 10편 평균 조회 기준. 조회 1회당 약 50원(평균 조회 ÷ 1,000 × 5만원). 블링에서 채널별 예상 단가 조회 후 제안. (파이프라인 「예상 견적」과 비교)', why: '「예산 불만」 42%. 국내 구독 1만~5만 브랜디드 평균 130만~200만원, 5만~20만 200만~400만원, PPL은 약 65%, 쇼츠는 약 40%.', src: ['https://vling.net/post/222868370883', 'https://vling.net/post/222562801483'] },
        { k: '1~3만 구독 구간에 먼저 집중', how: '1차 발송은 1~3만 채널 위주, 10만 근처는 매니저 · MCN 경유.', why: '작은 채널일수록 답장률이 높다 — 나노 40~60% · 마이크로 15~25% · 매크로 5% 미만 (추정, 업계 블로그).', src: ['https://mysocial.io/blog/influencer-outreach'] },
        { k: '시딩(무상) → 반응 좋은 채널만 유료 전환', how: '3천~1만 채널은 게시 의무 없는 제품 발송 → 실제로 써 보고 반응한 채널만 유료 · 전용 할인코드 제휴로.', why: '무상 제품만 받은 크리에이터의 실제 게시율 20~40% (출처마다 10%~60%로 편차 큼).', src: ['https://stackinfluence.com/blog/why-gifted-influencer-campaigns-win-in-2026', 'https://www.elev8or.io/blog/influencer-gifting-and-product-seeding-guide'] }
      ] },
      { id: 'w3', title: '우리 데이터로 재기', lead: '「답장률이 몇 % 떨어졌다」 같은 출처 불명 수치 대신, 우리 발송 100건마다 답장률 · 합의율 · 계약률을 기록한다.', items: [
        { k: '발송 100건마다 퍼널 기록', how: '파이프라인 단계(메일 문의 → 협의 → 계약)를 그대로 쓰면 자동으로 집계됨. 어떤 제목 · 시간대 · 제안이 잘 됐는지 「우리 결론」에 적기.', why: '외부 평균보다 우리 카테고리 · 가격대의 실제 숫자가 기준.', src: [] }
      ] }
    ],
    delight: [
      { id: 'd1', title: '시딩 박스 — 영상에 찍히는 순간 만들기', lead: '감동은 비싼 박스보다 「나를 알고 보냈다」는 느낌에서 나온다. 리저브 · 셀러 감성은 1 · 2 · 4번과 가장 잘 맞는다.', items: [
        { k: '「셀러 오프닝」 3단 언박싱', how: '무지 크래프트 겉박스 → 포도밭 사진 엽서 → 박엽지에 싼 제품 → 촛불 · 와인 셀러 톤의 「리저브 카드」. 한 겹씩 열 때마다 찍을 장면이 생긴다.', why: '층층이 드러나는 구성 · 사진 잘 나오는 소재가 촬영을 부른다.', src: ['https://www.backstage.com/magazine/article/how-to-build-a-pr-package-80569/'] },
        { k: '그녀의 영상 한 장면을 쓴 손편지', how: '「○○님 육퇴 후 10분 루틴 영상에서 화장 지우는 장면이 기억에 남아서 보냅니다」 — 이름 · 왜 당신인지 · 감사.', why: '개인화된 PR 패키지가 반응을 만든다.', src: ['https://www.agilitypr.com/pr-news/social-media-influencer-marketing/5-strategies-for-pr-packages-that-inspire-influencers-and-drive-engagement/'] },
        { k: '보내기 전에 고르게 하기', how: 'DM으로 피부 고민(건조 · 민감 · 모공) · 젤 / 오일 선호를 묻고 맞춤 구성으로. 재고 낭비도 줄고 실제로 쓸 확률이 오른다.', why: '선택권을 준 시딩이 사용 · 게시율을 높인다.', src: ['https://www.joinstatus.com/blog-for-brands/pr-package-ideas'] },
        { k: '「Reserve No.007 — ○○님께」 넘버링 카드', how: '일련번호 + 이름을 넣은 와인 빈티지 라벨풍 카드 — 한정 멤버 느낌 (추정).', why: '사례 근거는 약함 — 소수에게 먼저 시험.', src: [] },
        { k: '엄마 크리에이터에게 「나만의 10분」 키트', how: '아이 이름을 넣은 카드(「○○맘 말고 ○○님의 시간」) + 헤어밴드 · 미니 캔들. 미션 「그녀를 행복하게!」를 그대로 보여 준다 (추정).', why: '개인화 원칙의 응용 — 직접 사례는 못 찾음.', src: [] },
        { k: '모두에게 같은 등급으로', how: '구독자 규모가 달라도 기본 구성은 같게. 크리에이터끼리 비교하는 시대.', why: '반면교사 — 타르트는 일부만 고가 선물을 줘 공개적으로 반발을 샀다.', src: ['https://www.scarymommy.com/parenting/tarte-bora-bora-influencer-trip-controversy'] }
      ] },
      { id: 'd2', title: '협업 중 — 일하기 좋은 브랜드', lead: '', items: [
        { k: '선물은 게시 의무 없이 · 유료는 A4 1장 브리프', how: '브리프: 필수 문구 2개 · 금지 표현 · 자유 영역.', why: '협업 장애 1위가 불명확한 브리프(29.6%).', src: ['https://www.netinfluencer.com/research-highlights-vital-gaps-between-creators-and-brands/'] },
        { k: '업로드 후 7일 안에 정산 — 계약서에 명시', how: '정산일을 약속하고 지킨다.', why: '95%가 빠르게 정산하는 브랜드와 다시 일하고 싶어 하고, 56%가 늦은 정산에서 홀대를 느꼈다.', src: ['https://tipalti.com/blog/pr-2023-brand-creator-report/'] }
      ] },
      { id: 'd3', title: '콘텐츠 이후 — 오래 가는 관계', lead: '크리에이터 72%가 장기 협업을 원하지만 실제는 54%. 관계를 이어 가는 브랜드가 드물다.', items: [
        { k: '2주 뒤 성과 리포트 보내기', how: '조회 · 클릭 · 판매 기여 + 「이 장면에서 반응이 컸어요」 코멘트. (완료 콘텐츠의 누적 조회 · 특이 댓글 활용)', why: '성과를 나누면 관계가 단단해지고 다음 콘텐츠가 좋아진다.', src: ['https://magicbrief.com/post/influencer-whitelisting-why-and-how-to-run-ads-through-creator-accounts'] },
        { k: '자사몰에 크레딧과 함께 싣기', how: '상세페이지 · 후기에 이름을 밝혀 소개. 광고 소재로 쓸 때는 사전 동의 + 별도 비용(통상 25~50%).', why: '국내 「브랜디드 시딩」 사례(화해 · 프란츠 210만 조회).', src: ['https://byline.network/2026/01/20-519/'] },
        { k: '「리저브 서클」 — 출시 3주 전 선공개', how: '상위 20~30명을 비공개 방에 초대해 신제품을 먼저 보내고 처방 · 향 피드백을 받는다.', why: '글로시에는 상위 고객 Slack 피드백으로 밀키젤리 클렌저를 만들고 출시 3주 전 미리 보냈다.', src: ['https://hashtagpaid.com/blog/how-an-influencer-built-the-most-recognizable-makeup-brand-on-instagram-the-glossier-success-story'] },
        { k: '게시 의무 없는 「빈야드 데이」 초대', how: '연 1회 포도밭 · 와이너리 반나절, 아이 동반 가능, 촛불 셀러 디너.', why: '레어뷰티는 게시 의무 없는 리트릿으로 신뢰를 쌓았다.', src: ['https://archive.com/blog/rare-beauty-influencer-marketing-strategy'] },
        { k: '장기 앰버서더 · 「Reserve by ○○」 공동 한정판', how: '6~12개월 계약, 분기 리필 · 생일 · 1주년 키트. 우수 크리에이터와 이름 붙인 한정 세트 (추정).', why: '아누아는 소규모 크리에이터 중심 시딩 · 제휴로 크리에이터 142명(2020) → 2.39만 명(2025).', src: ['https://www.modash.io/breakdowns/anua-influencer-marketing-strategy'] }
      ] }
    ],
    rules: [
      { id: 'r1', title: '광고 표시 — 뒷광고 규정 (공정위 추천 · 보증 심사지침)', lead: '2020.9 시행 · 2021.1 본격 단속 · 2024.12 개정. 유튜버도 광고주와 함께 제재 대상.', items: [
        { k: '제목 또는 영상 시작 · 끝에 「유료광고 포함」', how: '긴 영상은 중간에도 반복. 댓글 · 더보기 안 설명란 · 본문 중간은 인정 안 됨. 유튜브 「유료 프로모션 포함」 체크도 함께.', why: '글자 크기 · 색 · 음성 속도까지 알아보기 쉬워야 한다.', src: ['https://www.ajunews.com/view/20201025112142490', 'https://www.etoday.co.kr/news/view/1909454', 'https://shinkim.com/kor/media/newsletter/2613'] },
        { k: '위반 시 — 과징금 · 형사처벌', how: '매출 2% 이하 또는 5억원 이하 과징금, 고발 시 2년 이하 징역 · 1.5억원 이하 벌금.', why: '2024.7 광고대행사 2곳 시정 · 공표 명령 사례.', src: ['https://dailypharm.com/user/news/60245', 'https://shinkim.com/kor/media/newsletter/pdf/2583'] }
      ] },
      { id: 'r2', title: '화장품법 — 대본 · 자막 금지 표현', lead: '법적 책임은 화장품책임판매업자(우리). 대본 · 자막 사전 검토 권리를 계약서에 넣는다.', items: [
        { k: '의약품 오인 표현 금지', how: '「재생 · 항염 · 세포 부활 · 치료 · 바르는 보톡스 / 필러」 금지. 적발 광고의 57.6%가 이 유형.', why: '인플루언서 계정 84개 점검 중 54개 위반.', src: ['https://m.dailypharm.com/user/news/7712', 'https://www.dailypharm.com/user/news/29091'] },
        { k: '기능성 심사 안 받은 효능 말하지 않기', how: '미백 · 주름 · 여드름 · 탈모 효능은 기능성 인정 제품만. 클렌저는 「세정 · 사용감」 중심으로.', why: '광고 · 판매업무정지 처분 사례 있음.', src: ['https://www.cosinkorea.com/mobile/article.html?no=56638'] }
      ] },
      { id: 'r3', title: '계약서 필수 항목', lead: 'DM 합의 말고 서면 계약.', items: [
        { k: '결과물 · 업로드 · 유지 기간', how: '편수 · 길이 · 형식(단독 / PPL) · 필수 언급 · 광고 표시 책임 · 업로드일 · 게시 유지(예: 6~12개월 삭제 금지, 추정).', why: '', src: ['https://www.i-boss.co.kr/ab-6141-71709'] },
        { k: '수정 · 2차 활용 · 경쟁사 배제', how: '초안 검토 1~2회 · 2차 활용 채널 / 기간(통상 3~6개월, 추정) / 연장 비용 · 동종 경쟁 제품 배제 1~3개월(추정).', why: '', src: ['https://brunch.co.kr/@tagby/175'] },
        { k: '정산 · 취소 · 데이터 공유', how: '업로드 후 일괄 또는 50 / 50 · 귀책별 위약 · 미업로드 시 반환 / 환불 · 업로드 7일 · 30일 뒤 유튜브 스튜디오 캡처(조회 · 시청 지속 · 연령 / 성별) 제공.', why: '', src: [] }
      ] },
      { id: 'r4', title: '성과 측정 · 전환 올리기', lead: '', items: [
        { k: '목표별 KPI', how: '인지: 조회 · 도달 · CPV / 참여: 참여율 · 댓글 · 구매 의향 댓글 비율 / 전환: 쿠폰 사용 · UTM 클릭 · 매출 · ROAS.', why: '완료 콘텐츠의 「구매 의향 · 브랜드 언급」 댓글 수가 참여 · 의향 지표.', src: ['https://www.i-boss.co.kr/ab-6141-59989'] },
        { k: '전용 할인코드 + 고정 댓글 UTM 링크', how: '유튜버별 코드로 성과 구분 · 설명란 첫 줄 + 고정 댓글에 링크 · 기간 한정 혜택. 고정 댓글은 링크용 — 광고 표시는 따로.', why: '', src: ['https://searchengineland.com/how-to-measure-youtube-ad-success-with-kpis-for-every-marketing-goal-448988'] }
      ] }
    ]
  }
};
