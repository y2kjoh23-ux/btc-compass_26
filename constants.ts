
export const GENESIS_DATE = new Date('2009-01-03');
export const HALVING_DATE = new Date('2024-04-20');
export const CHART_START_DATE = new Date('2017-07-01');

export const A_STD = 1.48e-17;
export const B_STD = 5.78;

export const A_DECAY = 1.48e-15;
export const B_DECAY = 5.25;

/**
 * 지표 판정 기준: 사용자 원문 Streamlit v8.2 텍스트 및 구성 완벽 복구
 */
export const STAGES = {
  OSCILLATOR: [
    { threshold: 0.5, label: "7. 광기 (0.5↑)" },
    { threshold: 0.4, label: "6. 오버슈팅 (0.4 ~ 0.5)" },
    { threshold: 0.2, label: "5. 고평가 (0.2 ~ 0.4)" },
    { threshold: -0.1, label: "4. 적정 (±0.1)" },
    { threshold: -0.3, label: "3. 저평가 (-0.3 ~ -0.1)" },
    { threshold: -0.5, label: "2. 언더슈팅 (-0.5 ~ -0.3)" },
    { threshold: -Infinity, label: "1. 심연 (-0.5↓)" },
  ],
  FNG: [
    { threshold: 75, label: "5. 극단 탐욕 (75 ~ 100)" },
    { threshold: 55, label: "4. 탐욕 (55 ~ 74)" },
    { threshold: 45, label: "3. 중립 (45 ~ 54)" },
    { threshold: 25, label: "2. 공포 (25 ~ 44)" },
    { threshold: 0, label: "1. 극단 공포 (0 ~ 24)" },
  ],
  MVRV: [
    { threshold: 7.0, label: "6. 시장 정점 (7.0↑)" },
    { threshold: 5.0, label: "5. 거품 주의 (5.0 ~ 7.0)" },
    { threshold: 3.0, label: "4. 열기 고조 (3.0 ~ 5.0)" },
    { threshold: 1.0, label: "3. 추세 진행 (1.0 ~ 3.0)" },
    { threshold: 0.1, label: "2. 바닥 형성 (0.1 ~ 1.0)" },
    { threshold: -Infinity, label: "1. 완전 항복 (0.1↓)" },
  ]
};
