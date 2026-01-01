
export interface PriceData {
  date: string;
  price: number;
}

export interface MarketData {
  currentPrice: number;
  fngValue: number;
  usdKrw: number;
  lastUpdated: string;
  history: PriceData[];
  dataSource: 'Binance' | 'CoinGecko' | 'Hybrid' | 'Fallback';
}

export interface ModelValues {
  standard: number;
  decaying: number;
  cycle: number;
  weighted: number;
  upper: number;
  lower: number;
}

export enum MarketStatus {
  ACCUMULATE = 'ACCUMULATE',
  STABLE = 'STABLE',
  SELL = 'SELL'
}
