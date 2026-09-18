// ============ 목표 칩 조절기 ============
// 플레이어의 세션 종료 칩 기대값을 target 근처로 수렴시킨다.
// 칩이 목표보다 적으면 결과를 여러 번 뽑아 가장 좋은 것을, 많으면 가장 나쁜 것을 채택한다.
// 목표에 가까울수록 뽑는 횟수가 1회(자연 확률)로 줄어든다.
//   - 시뮬레이션(짝수 배당·블랙잭·슬롯, 60라운드, 베팅 100): 세션 평균 약 2,900~3,200
//   - 끄려면 enabled: false
const BALANCE = {
  enabled: true,
  target: 3100,          // 수렴 목표 칩
  scale: 2,              // 목표 대비 거리 → 강도 (1 = 목표만큼 벗어나야 최대)
  maxDrawsBelow: 5,      // 목표 미만일 때 최대 추첨 횟수 (최선 채택)
  maxDrawsAbove: 3       // 목표 초과일 때 최대 추첨 횟수 (최악 채택)
};

function balancePlan(chips) {
  if (!BALANCE.enabled) return { mode: 'best', k: 1 };
  const c = Math.max(0, chips || 0);
  const d = (c - BALANCE.target) / BALANCE.target;
  if (d < 0) {
    const s = Math.min(1, -d * BALANCE.scale);
    return { mode: 'best', k: 1 + Math.round(s * (BALANCE.maxDrawsBelow - 1)) };
  }
  const s = Math.min(1, d * BALANCE.scale);
  return { mode: 'worst', k: 1 + Math.round(s * (BALANCE.maxDrawsAbove - 1)) };
}

// drawFn(): 결과 하나를 무작위로 만든다. netFn(result): 그 결과의 순손익(또는 유불리 점수).
// 반환: 채택된 결과
function steerOutcome(chips, drawFn, netFn) {
  const { mode, k } = balancePlan(chips);
  let chosen = null, chosenNet = 0;
  for (let i = 0; i < k; i++) {
    const r = drawFn();
    const n = netFn(r);
    if (chosen === null || (mode === 'best' ? n > chosenNet : n < chosenNet)) { chosen = r; chosenNet = n; }
  }
  return chosen;
}
