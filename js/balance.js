// ============ 하우스 조절기 ============
// 1) 목표 칩 끌어당김: 보유 칩이 target 보다 적으면 결과를 여러 번 뽑아 "가장 좋은 것"을,
//    많으면 "가장 나쁜 것"을 채택한다. 적을수록·많을수록 뽑는 횟수가 늘어 끌어당기는 힘이 세진다.
//    목표 근처(deadZone 안)에서는 1회만 뽑아 자연 확률로 둔다.
//    → 초반에는 잘 풀려서 재미가 붙고, 많이 따면 서서히 되돌아와 target 근처를 오르내린다.
// 2) 배율 상한: 총 베팅액 구간별로 "총 지급 ÷ 총 베팅"이 상한 이상인 결과는 절대 나오지 않는다.
// 3) 한 판 상한: 한 라운드에 가져가는 순이익은 maxWin 을 넘지 않는다.
// 4) 수수료: 승리 시 순이익에서 fee 비율을 뗀다 (인디언포커·홀덤은 자체 레이크가 있어 제외).
//   - 끄려면 enabled: false (수수료·배율 상한·한 판 상한은 유지)
const BALANCE = {
  enabled: true,
  target: 3100,          // 보유 칩이 이 근처를 오르내리도록 맞춘다
  deadZone: 0,           // 목표에서 멀어지는 즉시 힘이 붙는다 (넓게 두면 엣지에 밀려 내려앉음)
  maxDrawsBelow: 7,      // 목표보다 많이 모자랄 때 최대 추첨 횟수 (최선 채택)
  maxDrawsAbove: 4,      // 목표보다 많이 넘칠 때 최대 추첨 횟수 (최악 채택)
  scaleBelow: 1600,      // 목표보다 이만큼 모자라면 끌어올리는 힘이 최대
  scaleAbove: 2200,      // 목표보다 이만큼 넘치면 끌어내리는 힘이 최대
  // [총 베팅 하한, 이 배율 이상 금지]  (베팅 100 미만은 제한 없음)
  payoutCaps: [
    [500, 9], [470, 10], [400, 12], [320, 15], [230, 20],
    [190, 25], [160, 30], [120, 40], [100, 50]
  ],
  fee: 0.05,             // 승리 순이익 수수료
  maxWin: 4300           // 한 판(한 라운드·한 핸드)에 가져갈 수 있는 최대 순이익
};

// 이번 라운드 계획
//   { mode: 'best',  k }  → k번 뽑아 가장 유리한 결과 채택 (칩이 목표보다 적을 때)
//   { mode: 'worst', k }  → k번 뽑아 가장 불리한 결과 채택 (칩이 목표보다 많을 때)
//   k = 1 이면 자연 확률 그대로
function balancePlan(chips) {
  if (BOOST.on) return { mode: 'best', k: BOOST.k };
  if (!BALANCE.enabled) return { mode: 'best', k: 1 };

  const c = Math.max(0, chips || 0);
  const gap = c - BALANCE.target;
  if (Math.abs(gap) <= BALANCE.deadZone) return { mode: 'best', k: 1 };

  if (gap < 0) {
    const s = Math.min(1, (-gap - BALANCE.deadZone) / BALANCE.scaleBelow);
    return { mode: 'best', k: 1 + Math.round(s * (BALANCE.maxDrawsBelow - 1)) };
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

// 한 판 획득 상한. 모든 게임이 칩에 반영하기 직전에 이 함수를 통과시킵니다.
// 수수료를 뗀 뒤 마지막에 적용하므로, 실제로 받는 칩이 이 값을 넘지 않습니다.
function capWin(net) {
  return net > BALANCE.maxWin ? BALANCE.maxWin : net;
}


// drawFn(): 결과 하나를 무작위로 만든다. netFn(result): 그 결과의 순손익(또는 유불리 점수).
// opts.bet: 총 베팅액 (주면 netFn을 순손익으로 보고 배율 상한을 적용)
// opts.plan: 미리 뽑아둔 balancePlan (같은 라운드에서 두 번 판단하지 않도록)
// 반환: 채택된 결과
function steerOutcome(chips, drawFn, netFn, opts) {
  opts = opts || {};
  const { mode, k } = opts.plan || balancePlan(chips);
  const bet = opts.bet || 0;
  const draw = () => {
    let r = drawFn();
    if (bet > 0) for (let i = 0; i < 300 && !capOK(bet, netFn(r) + bet); i++) r = drawFn();
    return r;
  };
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
