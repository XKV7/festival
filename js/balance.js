// ============ 하우스 조절기 ============
// 1) 목표 칩 끌어당김: 보유 칩이 target 보다 적으면 결과를 여러 번 뽑아 "가장 좋은 것"을,
//    많으면 "가장 나쁜 것"을 채택한다. 적을수록·많을수록 뽑는 횟수가 늘어 끌어당기는 힘이 세진다.
//    → 초반에는 잘 풀려서 재미가 붙고, 많이 따면 서서히 되돌아와 target 근처를 오르내린다.
// 2) 한 번 크게 벌었던 사람은 구제를 줄인다(richPeak). 처음 온 학생은 쉽게 파산하지 않지만,
//    크게 땄다가 잃기 시작하면 끝까지 잃을 수 있다.
// 3) 배율 상한: 총 베팅액 구간별로 "총 지급 ÷ 총 베팅"이 상한 이상인 결과는 절대 나오지 않는다.
// 4) 한 판 상한(maxWin)과 보유 칩 천장(chipCeiling).
// 5) 수수료: 승리 시 순이익에서 fee 비율을 뗀다 (인디언포커·홀덤은 자체 레이크가 있어 제외).
//   - 끄려면 enabled: false (수수료·배율 상한·한 판 상한은 유지)
const BALANCE = {
  enabled: true,
  // 보유 칩이 band 범위(1,500~3,300) 안을 오르내리도록 가중치를 조절한다.
  // 범위를 벗어나면 끌어당기는 힘이 최대가 되고, 안쪽에서는 거리에 비례해 약해진다.
  target: 2400,          // 범위의 중간값
  deadZone: 0,           // 목표에서 멀어지는 즉시 힘이 붙는다 (넓게 두면 엣지에 밀려 내려앉음)
  maxDrawsBelow: 5,      // 목표보다 많이 모자랄 때 최대 추첨 횟수 (최선 채택)
  maxDrawsAbove: 2,      // 목표보다 많이 넘칠 때 최대 추첨 횟수 (최악 채택)
  scaleBelow: 900,       // 목표보다 이만큼 모자라면(=1,500) 끌어올리는 힘이 최대
  scaleAbove: 900,       // 목표보다 이만큼 넘치면(=3,300) 끌어내리는 힘이 최대
  // 한 번 크게 벌었던 계정은 구제를 아예 없앤다 → 내려갈 때 파산까지 갈 수 있다
  richPeak: 6000,        // 이번 세션 최고 보유가 이 값을 넘으면 (크게 벌어본 사람)
                         // 범위(최대 3,300)보다 훨씬 위에 둔다. 범위 바로 위에 두면
                         // 슬롯처럼 출렁임이 큰 게임에서 거의 모두가 파산한다.
  richDrawsBelow: 1,     // 목표 아래에서도 구제 없음. 하우스 엣지에 그대로 노출되어 파산까지 갈 수 있다
  // [총 베팅 하한, 이 배율 이상 금지]  (베팅 100 미만은 제한 없음)
  payoutCaps: [
    [500, 9], [470, 10], [400, 12], [320, 15], [230, 20],
    [190, 25], [160, 30], [120, 40], [100, 50]
  ],
  // 조임 구간: 보유 칩이 이 값 이상이면 모든 게임의 이길 확률을 아래 값으로 고정한다
  squeezeFrom: 4000,     // 0 이면 끔
  squeezeWinRate: 0.10,  // 조임 구간에서의 승률
  fee: 0.05,             // 승리 순이익 수수료
  maxWin: 4700,          // 한 판(한 라운드·한 핸드)에 가져갈 수 있는 최대 순이익
  pvpMaxWin: 3000,       // 1:1 실시간 대결은 더 낮은 상한을 쓴다. 한 판으로 승부가
                         // 끝나지 않아 번갈아 주고받으며 균형이 유지되는 값.
  chipCeiling: 6700      // 보유 칩 천장 (우대 모드에서는 적용하지 않는다)
};

// 이번 로그인 세션의 최고 보유 칩. 게임 페이지를 옮겨 다녀도 이어진다.
const PEAK_KEY = 'chipPeak';
function balancePeak() {
  try { return Number(sessionStorage.getItem(PEAK_KEY)) || 0; } catch (e) { return 0; }
}
function balanceNotePeak(chips) {
  const c = Math.max(0, chips || 0);
  if (c <= balancePeak()) return;
  try { sessionStorage.setItem(PEAK_KEY, String(c)); } catch (e) {}
}

// 이번 라운드 계획
//   { mode: 'best',  k }  → k번 뽑아 가장 유리한 결과 채택 (칩이 목표보다 적을 때)
//   { mode: 'worst', k }  → k번 뽑아 가장 불리한 결과 채택 (칩이 목표보다 많을 때)
//   k = 1 이면 자연 확률 그대로
function balancePlan(chips) {
  const c = Math.max(0, chips || 0);
  balanceNotePeak(c);
  const gap = c - BALANCE.target;

  if (BOOST.on && gap < 0) {
    // 우대: 목표에서 멀수록 강하게 밀어 올리되, 목표에 가까워지면 자연 확률로 수렴한다.
    // 목표 바로 아래에서 한 방에 최고 보상까지 뛰어넘지 못하게 하기 위함이다.
    // 목표 위에서는 아래 일반 규칙(끌어내림)을 그대로 따른다. 천장(capWin)만 없다.
    const sb = Math.min(1, -gap / BALANCE.scaleBelow);
    return { mode: 'best', k: 1 + Math.round(sb * (BOOST.k - 1)) };
  }
  if (!BALANCE.enabled) return { mode: 'best', k: 1 };

  // 조임 구간: 보유 칩이 squeezeFrom 이상이면 게임 본래 확률을 무시하고
  // 이길 확률을 squeezeWinRate 로 고정한다. 승·패는 이 판 시작할 때 한 번 정하고
  // (plan.win), 그 방향에 맞는 결과가 나올 때까지 뽑는다. 게임마다 본래 승률이
  // 달라도 결과 승률은 같아진다. 블랙잭처럼 한 판에 두 번 뽑는 게임도 같은
  // plan 을 쓰므로 방향이 엇갈리지 않는다. 우대 중에는 적용하지 않는다.
  if (!BOOST.on && BALANCE.squeezeFrom > 0 && c >= BALANCE.squeezeFrom) {
    return { mode: 'rate', k: 1, win: Math.random() < BALANCE.squeezeWinRate };
  }

  if (Math.abs(gap) <= BALANCE.deadZone) return { mode: 'best', k: 1 };

  if (gap < 0) {
    // 크게 벌었던 적이 있으면 구제가 약해진다
    const maxBelow = balancePeak() >= BALANCE.richPeak ? BALANCE.richDrawsBelow : BALANCE.maxDrawsBelow;
    const s = Math.min(1, (-gap - BALANCE.deadZone) / BALANCE.scaleBelow);
    return { mode: 'best', k: 1 + Math.round(s * (maxBelow - 1)) };
  }
  const s = Math.min(1, (gap - BALANCE.deadZone) / BALANCE.scaleAbove);
  return { mode: 'worst', k: 1 + Math.round(s * (BALANCE.maxDrawsAbove - 1)) };
}

// 총 베팅액에 허용되는 최대 배율 (이 값 이상은 금지). 제한 없으면 Infinity
function maxMultFor(bet) {
  for (const [min, cap] of BALANCE.payoutCaps) if (bet >= min) return cap;
  return Infinity;
}
// payout = 총 지급액 (베팅 반환 포함)
function capOK(bet, payout) {
  if (!bet || bet <= 0) return true;
  return payout / bet < maxMultFor(bet);
}

// 승리 순이익 수수료 적용 (손실·본전은 그대로)
function applyFee(net) {
  return net > 0 ? Math.floor(net * (1 - BALANCE.fee)) : net;
}

// 획득 상한. 모든 게임이 칩에 반영하기 직전에 이 함수를 통과시킵니다.
// 수수료를 뗀 뒤 마지막에 적용하므로, 실제로 받는 칩이 이 값들을 넘지 않습니다.
//   1) 한 판 상한(maxWin): 높은 배율이 터져도 한 번에 이 금액까지만 받습니다. 우대 중에도 적용됩니다.
//   2) 보유 칩 천장(chipCeiling): 짤짤이로 오래 모아도 총 보유가 이 값을 넘지 않습니다.
//      현재 칩(chips)을 넘겨주면 적용됩니다. 넘기지 않으면 한 판 상한만 적용됩니다.
//      우대 중에는 천장을 적용하지 않아 최고 보상까지 올라갈 수 있습니다.
function capWin(net, chips) {
  if (net <= 0) return net;
  let v = Math.min(net, BALANCE.maxWin);
  if (!BOOST.on && typeof chips === 'number' && isFinite(chips)) {
    v = Math.min(v, Math.max(0, BALANCE.chipCeiling - Math.max(0, chips)));
  }
  return v;
}

// 1:1 실시간 대결 전용 상한 (사람 대 사람).
// 두 클라이언트가 반드시 같은 값을 계산해야 결과가 어긋나지 않으므로,
// 한쪽에만 켜져 있을 수 있는 우대 여부는 보지 않는다. 스택은 양쪽이 모두 아는 값이다.
function capWinPvp(net, stack) {
  if (net <= 0) return net;
  let v = Math.min(net, BALANCE.pvpMaxWin);
  if (typeof stack === 'number' && isFinite(stack)) {
    v = Math.min(v, Math.max(0, BALANCE.chipCeiling - Math.max(0, stack)));
  }
  return v;
}


// ============ 1:1 실시간 대결 균형 조절 ============
// 사람 대 사람 대결은 제로섬이라 목표 칩 끌어당김(balancePlan)을 쓸 수 없다.
// 대신 "이미 칩이 많은 쪽에게 불리하게" 카드를 배분해 두 사람이 3,000 근처에서
// 주고받게 만든다. 호스트(A석)만 카드를 만들고 두 화면이 그 카드를 그대로 쓰므로
// 결과가 어긋날 일은 없다.
//   - 칩 차이가 클수록 적게 가진 쪽을 더 세게 밀어준다.
//   - 앞선 쪽이 3,000을 넘었으면 차이가 작아도 밀어준다 (3,000이 균형점).
//   - 차이가 없으면(=완전히 같으면) 아무 쪽도 밀지 않는다.
const PVP_BALANCE = {
  enabled: true,
  target: 3000,   // 균형점. 앞선 쪽이 이 값을 넘으면 차이가 작아도 조절이 걸린다
  scale: 1500,    // 이만큼 벌어지면 조절이 최대
  maxDraws: 3     // 최대 추첨 횟수 (적게 가진 쪽에게 가장 유리한 결과 채택)
};

// 반환: { fav: 'me' | 'opp' | null, k }  — fav 가 null 이면 자연 확률
function pvpBalancePlan(myStack, oppStack) {
  const none = { fav: null, k: 1 };
  if (!PVP_BALANCE.enabled) return none;
  const mine = Math.max(0, myStack || 0), opp = Math.max(0, oppStack || 0);
  const gap = mine - opp;
  if (gap === 0) return none;
  const lead = Math.max(mine, opp);
  let s = Math.min(1, Math.abs(gap) / PVP_BALANCE.scale);
  if (lead >= PVP_BALANCE.target) {
    s = Math.max(s, Math.min(1, (lead - PVP_BALANCE.target) / PVP_BALANCE.scale));
  }
  const k = 1 + Math.round(s * (PVP_BALANCE.maxDraws - 1));
  if (k <= 1) return none;
  return { fav: gap > 0 ? 'opp' : 'me', k };
}

// drawFn(): 결과 하나를 무작위로 만든다. netFn(result): 그 결과의 순손익(또는 유불리 점수).
// opts.bet: 총 베팅액 (주면 netFn을 순손익으로 보고 배율 상한을 적용)
// opts.plan: 미리 뽑아둔 balancePlan (같은 라운드에서 두 번 판단하지 않도록)
// 반환: 채택된 결과
function steerOutcome(chips, drawFn, netFn, opts) {
  opts = opts || {};
  const plan = opts.plan || balancePlan(chips);
  const { mode, k } = plan;
  const bet = opts.bet || 0;
  const draw = () => {
    let r = drawFn();
    if (bet > 0) for (let i = 0; i < 300 && !capOK(bet, netFn(r) + bet); i++) r = drawFn();
    return r;
  };
  // 승률 고정 모드: 이 판이 승리인지 패배인지는 plan 에 이미 정해져 있다.
  // 그 방향의 결과가 나올 때까지 뽑는다 (못 찾으면 첫 결과를 그대로 쓴다).
  if (mode === 'rate') {
    const wantWin = !!plan.win;
    let first = null;
    for (let i = 0; i < 200; i++) {
      const r = draw();
      if (first === null) first = r;
      if (wantWin ? netFn(r) > 0 : netFn(r) <= 0) return r;
    }
    return first;
  }
  let chosen = null, chosenNet = 0;
  for (let i = 0; i < k; i++) {
    const r = draw();
    const n = netFn(r);
    if (chosen === null || (mode === 'best' ? n > chosenNet : n < chosenNet)) { chosen = r; chosenNet = n; }
  }
  return chosen;
}

// ============ 계정 우대 (운영진 전용) ============
// 관리자 페이지에서 계정별로 켜고 끕니다. 상태는 accounts/{id}/boost 에 저장되고
// 게임 화면은 이 값을 실시간으로 구독합니다. 켜고 끈 기록은 chipLog 에 남습니다.
// 켜져 있으면 balancePlan 이 후보 BOOST.k 개 중 가장 좋은 결과를 채택합니다.
// 홀덤은 카드 전체가 아니라 플롭 3장만 고릅니다 (holdem.html 의 pickBoostFlop).
// 지급 한도(payoutCaps)와 한 판 상한(maxWin)은 우대 중에도 그대로 적용됩니다.
// 게임 화면에는 따로 표시하지 않습니다. 켜져 있는지는 관리자 페이지 계정 표에서 확인하세요.
const BOOST = { on: false, k: 8 };

function boostActive() { return BOOST.on; }

function boostInit() {
  try {
    const pid = typeof getCurrentPlayer === 'function' ? getCurrentPlayer() : null;
    if (pid && typeof db !== 'undefined' && db) {
      db.ref('accounts/' + pid + '/boost').on('value', snap => {
        BOOST.on = !!snap.val();
      });
    }
  } catch (e) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boostInit);
else boostInit();
