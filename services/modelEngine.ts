
import { GENESIS_DATE, HALVING_DATE, A_STD, B_STD, A_DECAY, B_DECAY } from '../constants';
import { ModelValues } from '../types';

export const getDaysSinceGenesis = (date: Date): number => {
  return Math.floor((date.getTime() - GENESIS_DATE.getTime()) / (1000 * 60 * 60 * 24));
};

export const calcStandard = (days: number): number => A_STD * Math.pow(days, B_STD);
export const calcDecaying = (days: number): number => A_DECAY * Math.pow(days, B_DECAY);

export const calcCycle = (days: number, date: Date): number => {
  const base = calcStandard(days);
  const cycleDays = Math.floor((date.getTime() - HALVING_DATE.getTime()) / (1000 * 60 * 60 * 24));
  // 1460일(4년) 주기의 사인 파동 반영
  const cyclePos = ((cycleDays % 1460) + 1460) % 1460;
  const wave = 1 + 0.15 * Math.sin((2 * Math.PI * cyclePos) / 1460);
  return base * wave;
};

/**
 * 하이브리드 가중치 재조정:
 * Decaying(40%) + Cycle(30%) + Standard(30%)
 */
export const calcWeightedTotal = (days: number, date: Date): number => {
  return (calcDecaying(days) * 0.4) + (calcCycle(days, date) * 0.3) + (calcStandard(days) * 0.3);
};

/**
 * Volatility Decay (변동성 감쇄): 
 * 자산이 성숙해짐에 따라 변동성(밴드 폭)이 줄어드는 현상 반영.
 * 과거 0.5 수준에서 미래 0.4~0.35 수준으로 점진적 수렴.
 */
export const getDynamicSigma = (days: number): number => {
  const baseSigma = 0.5;
  const decayRate = 0.12; // 감쇄 속도 조절 파라미터
  const referenceDay = 5800; // 현재 시점(약 2024-2025년)을 기준으로 설정
  return baseSigma * Math.pow(referenceDay / Math.max(referenceDay, days), decayRate);
};

export const getModelValues = (date: Date): ModelValues => {
  const days = getDaysSinceGenesis(date);
  const weighted = calcWeightedTotal(days, date);
  const sigma = getDynamicSigma(days);
  
  return {
    standard: calcStandard(days),
    decaying: calcDecaying(days),
    cycle: calcCycle(days, date),
    weighted,
    upper: weighted * Math.exp(sigma), 
    lower: weighted * Math.exp(-sigma),
  };
};
