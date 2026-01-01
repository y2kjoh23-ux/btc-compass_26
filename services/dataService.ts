
import { MarketData, PriceData } from '../types';

/**
 * 역사적 데이터 보강: 
 * 바이낸스 BTCUSDT 상장(2017-08-17) 이전의 주요 가격 포인트
 */
const HISTORICAL_PRE_BINANCE: PriceData[] = [
  { date: '2015-01-01', price: 314 },
  { date: '2015-04-01', price: 244 },
  { date: '2015-07-01', price: 258 },
  { date: '2015-10-01', price: 236 },
  { date: '2016-01-01', price: 434 },
  { date: '2016-04-01', price: 416 },
  { date: '2016-07-01', price: 673 },
  { date: '2016-10-01', price: 610 },
  { date: '2017-01-01', price: 997 },
  { date: '2017-04-01', price: 1071 },
  { date: '2017-07-01', price: 2480 },
];

const fetchFromBinance = async (): Promise<{ currentPrice: number, history: PriceData[] }> => {
  // 실시간 가격
  const tickerRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  const tickerData = await tickerRes.json();
  const currentPrice = parseFloat(tickerData.price);

  // 1. 장기 주봉 데이터
  const weeklyRes = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=1000');
  const weeklyData = await weeklyRes.json();
  
  // 2. 단기 일봉 데이터
  const dailyRes = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000');
  const dailyData = await dailyRes.json();
  
  const rawMap = new Map<string, number>();

  // 역사적 데이터 먼저 주입
  HISTORICAL_PRE_BINANCE.forEach(p => rawMap.set(p.date, p.price));

  // 바이낸스 데이터 병합
  weeklyData.forEach((d: any[]) => {
    const date = new Date(d[0]).toISOString().split('T')[0];
    rawMap.set(date, parseFloat(d[4]));
  });

  dailyData.forEach((d: any[]) => {
    const date = new Date(d[0]).toISOString().split('T')[0];
    rawMap.set(date, parseFloat(d[4]));
  });

  const sortedDates = Array.from(rawMap.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  if (sortedDates.length === 0) return { currentPrice, history: [] };

  const startDate = new Date('2015-01-01'); // 2015년 고정 시작
  const endDate = new Date(sortedDates[sortedDates.length - 1]);
  const history: PriceData[] = [];
  
  let lastPrice = rawMap.get(sortedDates[0]) || 314;
  
  // 2015년부터 오늘까지 모든 날짜를 일간 단위로 생성 및 보간
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    if (rawMap.has(dateStr)) {
      lastPrice = rawMap.get(dateStr)!;
    }
    history.push({ date: dateStr, price: lastPrice });
  }

  return { currentPrice, history };
};

export const fetchMarketData = async (): Promise<MarketData> => {
  try {
    const { currentPrice, history } = await fetchFromBinance();

    let fngValue = 50;
    try {
      const fngRes = await fetch('https://api.alternative.me/fng/?limit=1');
      const fngJson = await fngRes.json();
      fngValue = parseInt(fngJson.data[0].value) || 50;
    } catch {}

    let usdKrw = 1440;
    try {
      const exRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const exJson = await exRes.json();
      usdKrw = exJson?.rates?.KRW || 1440;
    } catch {}

    return {
      currentPrice,
      fngValue,
      usdKrw,
      lastUpdated: new Date().toLocaleString('ko-KR'),
      history,
      dataSource: 'Hybrid'
    };
  } catch (error) {
    console.error("Data Fetch Error:", error);
    return {
      currentPrice: 98000,
      fngValue: 75,
      usdKrw: 1440,
      lastUpdated: '데이터 연결 오류 (대체 모드)',
      history: [],
      dataSource: 'Fallback'
    };
  }
};
