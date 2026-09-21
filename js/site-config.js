// ============ 사이트 표시 설정 (여기만 바꾸면 로그인/로비 배너에 반영됩니다) ============
const SITE = {
  name: 'CASINO ROYALE',
  school: '경문고등학교',
  festival: '2026 송림제',
  dealer: '임태현',          // 모든 게임의 딜러 이름 (선생님 요청)
  presenter: 'CLASSIFIED',   // 로그인 화면 PRESENTED BY 에 표시할 주최 동아리

  // 배너에 흐르는 동아리 이름 (경문고 동아리 28개)
  clubs: [
    '골프부',
    '기타 연주부',
    '농구부',
    '도시농업원예부',
    '독서몰입부',
    '생태전환교육반',
    '수학 메이커랩',
    '스크린 영어',
    '영덕스클럽',
    '의사결정 시뮬레이션부',
    '이모티콘 제작소(EMO-LAB)',
    '족구왕',
    '청소년 사회참여동아리 키비처',
    '청춘 아카이브',
    '3D 프린트 모델링',
    '경세제민',
    '드론동아리',
    '또래상담부',
    '물리탐구부',
    '밴드부(러쉬)',
    '생명과학탐구부',
    '융합과학탐구부',
    '지구과학탐구부',
    '화학탐구부',
    'CLASSIFIED',
    '경문윈드오케스트라',
    '도서부(북돋움)',
    '축구부'
  ],

  // 배너 사이사이에 섞이는 문구 (불법 사이트 감성)
  hype: [
    '★ 24시간 무제한 운영 ★',
    '첫 입장 1,000칩 즉시 지급',
    '먹튀 없음 · 정산은 접수 데스크에서',
    '딜러 임태현 상시 대기중',
    '오늘의 잭팟 주인공은 당신',
    '신규 게임 8종 오픈'
  ],

  // 로비 게임 카드 뱃지/부제 (파일명 기준)
  games: {
    'slots':        { badge: 'HOT',  badgeType: 'hot',  min: 10,  tag: '슬롯' },
    'highlow':      { badge: '신규', badgeType: 'new',  min: 10,  tag: '카드' },
    'roulette':     { badge: '독점', badgeType: 'excl', min: 10,  tag: '테이블' },
    'blackjack':    { badge: '',     badgeType: '',     min: 20,  tag: '카드' },
    'baccarat':     { badge: '독점', badgeType: 'excl', min: 20,  tag: '테이블' },
    'sicbo':        { badge: '신규', badgeType: 'new',  min: 10,  tag: '테이블' },
    'indian-poker': { badge: '1:1', badgeType: 'ai',   min: 50,  tag: '임태현 딜러' },
    'holdem':       { badge: '1:1', badgeType: 'ai',   min: 20,  tag: '임태현 딜러' }
  }
};

// 배너 트랙 채우기: 동아리 이름과 문구를 번갈아 넣고, 끊김 없이 흐르도록 두 번 복제
function buildTicker(el) {
  if (!el) return;
  const items = [];
  const hype = SITE.hype;
  SITE.clubs.forEach((c, i) => {
    items.push(`<span class="tk-club">${c}</span>`);
    if (hype.length) items.push(`<span class="tk-hype">${hype[i % hype.length]}</span>`);
  });
  const half = `<span class="tk-group">${items.join('<span class="tk-sep">✦</span>')}<span class="tk-sep">✦</span></span>`;
  el.innerHTML = `<div class="tk-track">${half}${half}</div>`;
  // 길이에 비례한 속도 (약 90px/s)
  const track = el.querySelector('.tk-track');
  requestAnimationFrame(() => {
    const w = track.scrollWidth / 2;
    track.style.animationDuration = Math.max(20, Math.round(w / 90)) + 's';
  });
}
