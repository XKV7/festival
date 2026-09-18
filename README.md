# 🎰 CASINO ROYALE — 학교 축제 카지노 웹사이트

순수 HTML/CSS/JS + Firebase Realtime Database(CDN compat SDK)로 만든 정적 사이트입니다. 빌드 도구가 없으므로 저장소 루트를 그대로 정적 호스팅에 올리면 됩니다.

## 구조

```
index.html          로그인 (계정 선택 + PIN)
lobby.html          게임 로비
admin.html          관리자 패널 (계정 생성 / 정산 / 초기화 / 모니터링)
css/style.css       공용 테마
js/firebase-config.js   Firebase 초기화 + 계정/칩 공용 함수  ← 배포 전 설정값 입력 필요
games/
  slots.html        슬롯머신
  highlow.html      하이로우
  roulette.html     룰렛
  blackjack.html    블랙잭
  baccarat.html     바카라
  sicbo.html        식보
  indian-poker.html 인디언 포커 (딜러 AI 대전)
  holdem.html       텍사스 홀덤 (딜러 AI 헤즈업)
sfx/                (선택) bet/win/lose/spin/card/chip/bust.mp3 를 넣으면 효과음 재생
```

## 배포 절차

### 1. Firebase 프로젝트 준비
1. https://console.firebase.google.com 에서 프로젝트 생성.
2. **빌드 → Realtime Database → 데이터베이스 만들기** (위치는 아무 곳, 규칙은 우선 테스트 모드).
3. **규칙** 탭에 `database.rules.json` 내용을 붙여넣고 게시. (축제 당일만 쓰는 임시 DB이므로 공개 읽기/쓰기. 행사 후 DB를 삭제하거나 규칙을 `false`로 바꾸세요.)
4. **프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가** 후 `firebaseConfig` 값을 복사.
5. `js/firebase-config.js` 상단의 `firebaseConfig` 자리표시자를 복사한 값으로 교체. `databaseURL`이 반드시 들어가야 합니다.

### 2-A. Netlify로 배포
1. https://app.netlify.com → **Add new site → Import an existing project → GitHub** → 이 저장소 선택.
2. Branch: `main`, Build command: 비움, Publish directory: `.` (저장소의 `netlify.toml`이 자동 적용됨).
3. Deploy. 발급된 URL(예: `https://xxxx.netlify.app`)로 접속.

### 2-B. Vercel로 배포
1. https://vercel.com/new → 저장소 Import → Framework Preset: **Other**, Build/Output 비움 → Deploy.

### 3. 행사 준비
1. `admin.html` 접속 → **계정 60개 생성**. 계정 ID와 PIN 목록을 CSV로 내보내 접수 데스크에 비치.
2. 컴퓨터실 PC 8대에서 `index.html`을 전체화면(F11)으로 열어 둠.
3. 학생은 계정 + PIN으로 로그인 → 로비에서 게임 → 종료 시 접수 데스크에서 정산(관리자 패널의 정산 처리).

## 칩 흐름 규칙
- 모든 칩 변동은 `updateChips(amount)`(트랜잭션)로만 처리하며, 각 게임은 라운드가 끝날 때 순손익을 한 번에 반영합니다.
- 칩이 0이 되면 계정 상태가 `busted`로 바뀌고 모든 게임 페이지에 파산 오버레이가 뜹니다.

## 게임별 하우스 엣지 (기대 손실, 베팅 대비)
| 게임 | 하우스 엣지 |
|---|---|
| 슬롯 | 26% |
| 하이로우 (최적 플레이) | 11% |
| 룰렛 | 단일 번호 5.4%, 나머지 2.7% |
| 블랙잭 | 기본 전략 약 1%, 감으로 플레이 시 2~4% |
| 바카라 | 플레이어 1.2%, 뱅커 1.1%, 타이 14% |
| 식보 | 대소·홀짝 2.8%, 싱글 8%, 합·더블·트리플 17~31% |
| 인디언 포커 (AI) | 균형 전략 + 수수료 5% → 완벽한 플레이도 라운드당 단위의 약 9% 손실 |
| 홀덤 (AI) | 에퀴티 기반 상대도 100핸드당 약 54 BB 손실 |
