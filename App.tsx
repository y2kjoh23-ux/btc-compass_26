
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchMarketData, EnhancedMarketData } from './services/dataService';
import { getModelValues } from './services/modelEngine';
import { MarketData, MarketStatus } from './types';
import StageCard from './components/StageCard';
import { STAGES, CHART_START_DATE } from './constants';
import { GoogleGenAI } from "@google/genai";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line
} from 'recharts';

const COLORS = {
  upper: '#ff2d55',
  fair: '#d97706',
  lower: '#047857',
  price: '#1d4ed8'
};

const Space = () => <span className="text-[0.6em]">&nbsp;</span>;

interface Snapshot {
  id: number;
  date: string;
  timestamp: number;
  status: MarketStatus;
  oscillator: number;
  fng: number;
  mvrv: number;
  price: number;
  fair: number;
}

interface AIAnalysis {
  summary: string;
  dateInsights: { [key: string]: string };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dateStr = new Date(label).toISOString().split('T')[0];
    const sortedItems = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
    return (
      <div className="bg-white/95 backdrop-blur-md border border-slate-300 p-3 rounded-xl shadow-2xl text-slate-800 min-w-[180px]">
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-200 pb-1.5 mono">
          {dateStr}
        </p>
        <div className="space-y-1.5">
          {sortedItems.map((item, index) => {
            let markerColor = item.color;
            if (item.name === "상단 밴드") markerColor = COLORS.upper;
            if (item.name === "적정 가치") markerColor = COLORS.fair;
            if (item.name === "하단 밴드") markerColor = COLORS.lower;
            if (item.name === "시장 가격") markerColor = COLORS.price;

            return (
              <div key={index} className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: markerColor }}></div>
                  <span className="text-xs font-bold text-slate-600">{item.name}</span>
                </div>
                <span className="text-xs font-black mono italic text-slate-900">
                  {item.value ? (
                    <>
                      <span className="opacity-60 text-[0.85em] italic">$</span><Space />{Math.round(item.value).toLocaleString()}
                    </>
                  ) : 'PREDICT'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

const App: React.FC = () => {
  const [data, setData] = useState<EnhancedMarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  
  // 로그 삭제 후 즉시 재백필링되는 것을 방지하기 위한 플래그
  const isManualCleared = useRef(false);

  const init = async () => {
    setLoading(true);
    const result = await fetchMarketData();
    setData(result);
    setLoading(false);
  };

  useEffect(() => { 
    init();
    const saved = localStorage.getItem('btc_compass_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        setHistory([]);
      }
    }
  }, []);

  const calculateIndicators = (price: number, date: Date, fng: number) => {
    const model = getModelValues(date);
    const oscillator = price > 0 ? Math.log(price / model.weighted) : 0;
    const priceRisk = Math.max(0, Math.min(100, ((oscillator + 0.5) / 1.0) * 100));
    const mvrvEst = (oscillator * 6.5) + 2.5;
    const riskPercent = (priceRisk * 0.6) + (fng * 0.2) + ((Math.max(0, Math.min(100, (mvrvEst / 6) * 100))) * 0.2);

    let status = MarketStatus.STABLE;
    if (riskPercent < 35) status = MarketStatus.ACCUMULATE;
    else if (riskPercent > 70) status = MarketStatus.SELL;

    return { model, oscillator, mvrvEst, status, riskPercent };
  };

  const stats = useMemo(() => {
    if (!data) return null;
    return calculateIndicators(data.currentPrice, new Date(), data.fngValue);
  }, [data]);

  const fetchAIAnalysis = async (historyData: Snapshot[]) => {
    if (historyData.length < 5 || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const recentLogs = historyData.slice(0, 30);
      const historyStr = recentLogs.map(h => 
        `[${h.date}] $${h.price.toLocaleString()}, Osc: ${h.oscillator.toFixed(4)}, F&G: ${h.fng}, MVRV: ${h.mvrv.toFixed(2)}`
      ).join('\n');
      
      const prompt = `퀀트 분석가로서 5분 단위 비트코인 시계열 데이터를 진단하세요. 
지표(이격도, 공포탐욕, MVRV)의 상호작용과 추세를 분석하여 투자 전략 가이드를 전문적으로 제시하세요.
반드시 아래 JSON 형식을 지켜주세요. 마크다운 기호 없이 순수 JSON만 반환하거나, 마크다운 코드 블록 안에 넣어주세요.

{
  "summary": "전문적인 투자 전략 가이드 및 흐름 진단 (한글 300자 이내)",
  "dateInsights": {
    "HH:MM": "지표상의 주요 변곡점 해석"
  }
}

DATA:
${historyStr}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const text = response.text;
      if (text) {
        // 코드 블록 제거 및 JSON 추출 강화
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : text;
        const result = JSON.parse(jsonStr);
        setAiAnalysis(result);
      }
    } catch (e) { 
      console.error("AI Analysis Error:", e);
      setAiAnalysis({ 
        summary: "AI 분석 엔진 응답 해석 중 오류가 발생했습니다. 지표 데이터는 정상입니다. 잠시 후 다시 시도해 주세요.", 
        dateInsights: {} 
      });
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  useEffect(() => {
    if (showHistory && history.length >= 5 && !aiAnalysis && !isAnalyzing) {
      fetchAIAnalysis(history);
    }
  }, [showHistory, history]);

  // 기록 백필링 및 자동 저장 (12시간 기준)
  useEffect(() => {
    if (data && stats && data.intraday.length > 0) {
      // 만약 방금 삭제 버튼을 눌렀다면 백필링 로직을 한 번 건너뜀
      if (isManualCleared.current) {
        isManualCleared.current = false;
        return;
      }

      const savedHistory = localStorage.getItem('btc_compass_history');
      let parsed: Snapshot[] = [];
      try {
        parsed = savedHistory ? JSON.parse(savedHistory) : [];
      } catch(e) { parsed = []; }
      
      const now = Date.now();
      const FIVE_MINUTES = 5 * 60 * 1000;
      
      let updated = [...parsed];
      const lastEntry = updated[0];

      if (!lastEntry) {
        // 초기 12시간 백필링 (12시간 = 144개 포인트)
        const initialSnapshots: Snapshot[] = data.intraday.slice(-144).map((point) => {
          const d = new Date(point.date);
          const s = calculateIndicators(point.price, d, data.fngValue);
          return {
            id: d.getTime(),
            timestamp: d.getTime(),
            date: d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
            status: s.status,
            oscillator: s.oscillator,
            fng: data.fngValue,
            mvrv: s.mvrvEst,
            price: point.price,
            fair: s.model.weighted
          };
        }).reverse();
        updated = initialSnapshots;
      } else {
        const gap = now - lastEntry.timestamp;
        if (gap >= FIVE_MINUTES) {
          const missingIntervals = Math.floor(gap / FIVE_MINUTES);
          const backfills: Snapshot[] = [];
          
          for (let i = 1; i <= missingIntervals; i++) {
            const targetTime = lastEntry.timestamp + (i * FIVE_MINUTES);
            const closestPoint = data.intraday.reduce((prev, curr) => {
              const prevDiff = Math.abs(new Date(prev.date).getTime() - targetTime);
              const currDiff = Math.abs(new Date(curr.date).getTime() - targetTime);
              return currDiff < prevDiff ? curr : prev;
            });

            const targetDate = new Date(targetTime);
            const s = calculateIndicators(closestPoint.price, targetDate, data.fngValue);
            backfills.push({
              id: targetTime,
              timestamp: targetTime,
              date: targetDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
              status: s.status,
              oscillator: s.oscillator,
              fng: data.fngValue,
              mvrv: s.mvrvEst,
              price: closestPoint.price,
              fair: s.model.weighted
            });
          }
          updated = [...backfills.reverse(), ...updated];
        }
      }

      // 12시간(144개) 데이터만 유지하도록 제한하여 "너무 자주/많이" 하지 않도록 함
      const finalHistory = updated.slice(0, 144); 
      localStorage.setItem('btc_compass_history', JSON.stringify(finalHistory));
      setHistory(finalHistory);
    }
  }, [data, stats]);

  const chartData = useMemo(() => {
    if (!data || !data.history) return [];
    // 과거 데이터
    const historical = data.history.filter(h => new Date(h.date) >= CHART_START_DATE).map(h => {
      const m = getModelValues(new Date(h.date));
      return { timestamp: new Date(h.date).getTime(), price: h.price, fair: m.weighted, upper: m.upper, lower: m.lower };
    });
    
    // 미래 1년 예측 데이터 추가 (365일)
    const lastDate = new Date(data.history[data.history.length-1].date);
    const predictions = [];
    for(let i=1; i<=365; i++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(futureDate.getDate() + i);
      const m = getModelValues(futureDate);
      predictions.push({
        timestamp: futureDate.getTime(),
        price: null,
        fair: m.weighted,
        upper: m.upper,
        lower: m.lower
      });
    }

    return [...historical, ...predictions];
  }, [data]);

  const projections = useMemo(() => {
    return [3, 5, 7, 10, 15].map(y => {
      const d = new Date(); d.setFullYear(d.getFullYear() + y);
      const m = getModelValues(d);
      return { label: `${y}Y`, date: d.toISOString().split('T')[0], ...m };
    });
  }, []);

  const getStatusLabel = (status: MarketStatus) => {
    if (status === MarketStatus.ACCUMULATE) return { 
      text: '매집', 
      desc: '저평가 매집 권고', 
      headline: '역사적 저평가 임계점 도달: 공격적 비중 확대 및 매집 적기',
      color: 'text-emerald-400', 
      bg: 'bg-emerald-500/10' 
    };
    if (status === MarketStatus.SELL) return { 
      text: '실현', 
      desc: '과열 익절 권고', 
      headline: '통계적 과열 및 탐욕 임계점: 자산 보호를 위한 수익 실현 및 리스크 관리',
      color: 'text-rose-400', 
      bg: 'bg-rose-500/10' 
    };
    return { 
      text: '안정', 
      desc: '중립 비중 유지', 
      headline: '적정 가치 궤도 안착: 기계적 DCA 유지 및 시장 추세 관망',
      color: 'text-amber-400', 
      bg: 'bg-amber-500/10' 
    };
  };

  const getStatusFullInfo = () => {
    if (!data || !stats) return { guide: '', action: '', types: '' };
    const { oscillator, mvrvEst } = stats;
    const { fngValue } = data;

    if (stats.status === MarketStatus.ACCUMULATE) return { 
      guide: `공포 지수 ${fngValue}점과 이격률 ${oscillator.toFixed(2)}이 보여주는 강력한 저평가 구간입니다. 데이터는 현재 시점이 역사적 언더슈팅 기회임을 강력하게 시사합니다.`,
      action: `고액 자산가는 목표 비중의 70% 이상을 구축할 것을 권장합니다. 소액 투자자는 정기 DCA 외에 추가 자금을 투입하여 수량을 극대화하십시오.`,
      types: `MVRV Z-Score ${mvrvEst.toFixed(2)}는 바닥권 신호입니다. 장기적 관점에서 가격 흔들림은 소음일 뿐이며, 모델 하단은 견고한 지지력을 제공할 것입니다.`
    };
    if (stats.status === MarketStatus.SELL) return { 
      guide: `탐욕 지수 ${fngValue}점의 과열과 이격률 ${oscillator.toFixed(2)}의 조합은 통계적 정점에 도달했음을 의미합니다. 추가 매수는 리스크 관리 차원에서 지양해야 합니다.`,
      action: `자본 보호가 최우선입니다. 원금 회수 혹은 부분 현금화를 통해 수익을 실현하십시오. 무리한 홀딩보다는 포트폴리오의 안정성을 확보할 시점입니다.`,
      types: `MVRV가 ${mvrvEst.toFixed(2)}를 상회하며 과열 신호를 보내고 있습니다. 탐욕이 지배하는 시장에서 냉정한 퀀트 모델의 지표에 따라 비중을 조절하십시오.`
    };
    return { 
      guide: `현재 심리지수 ${fngValue}점과 이격률 ${oscillator.toFixed(2)}은 시장이 적정 가치 궤도 안에서 순항 중임을 뜻합니다. 급격한 변화보다는 안정적인 추세가 예상됩니다.`,
      action: `기존의 기계적 DCA 전략을 유지하십시오. 대규모 자산가는 현금 비중을 10~20% 내외로 유지하며 모델의 중심선 근처에서의 등락을 관망하십시오.`,
      types: `MVRV ${mvrvEst.toFixed(2)}는 온체인 데이터가 정상 범주에 있음을 보여줍니다. 장기 포지션을 편안하게 유지하며, 불필요한 잦은 매매를 줄이는 것이 최선입니다.`
    };
  };

  const clearHistory = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('모든 로그를 삭제하시겠습니까?')) {
      isManualCleared.current = true; // 플래그 설정
      localStorage.removeItem('btc_compass_history');
      setHistory([]);
      setAiAnalysis(null);
      setExpandedDate(null);
    }
  };

  const renderPriceWithKrw = (usd: number, colorClass: string = "text-white") => {
    if (!data) return null;
    const krw = Math.round(usd * data.usdKrw);
    return (
      <div className="flex flex-col items-end">
        <p className={`mono font-black italic ${colorClass} text-nowrap`}>
          <span className="opacity-60 text-[0.85em] italic">$</span><Space />{Math.round(usd).toLocaleString()}
        </p>
        <p className="text-[12px] text-slate-500 font-bold opacity-70 mono italic whitespace-nowrap mt-0.5">
          <span className="text-[0.85em] italic">₩</span><Space />{krw.toLocaleString()}
        </p>
      </div>
    );
  };

  if (loading || !data || !stats) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-amber-500 font-black uppercase tracking-widest animate-pulse">Synchronizing...</div>;

  const deviationKrw = (data.currentPrice - stats.model.weighted) * data.usdKrw;
  const info = getStatusFullInfo();
  const label = getStatusLabel(stats.status);

  const getFlowAnalysis = () => {
    if (history.length < 12) return null; 
    const current = history[0];
    const hourAgo = history[12];
    
    const oscDelta = current.oscillator - hourAgo.oscillator;
    const mvrvDelta = current.mvrv - hourAgo.mvrv;
    const fngDelta = current.fng - hourAgo.fng;
    
    return {
      oscTrend: oscDelta > 0.005 ? "상승 확장" : oscDelta < -0.005 ? "하락 수렴" : "안정 유지",
      mvrvTrend: mvrvDelta > 0.03 ? "수익성 가속" : mvrvDelta < -0.03 ? "수익성 감쇄" : "균형 상태",
      fngTrend: fngDelta > 5 ? "탐욕 유입" : fngDelta < -5 ? "공포 확산" : "심리 중립",
      investGuide: (oscDelta > 0 && mvrvDelta > 0) ? "공격적 확장 구간" : (oscDelta < 0 && mvrvDelta < 0) ? "보수적 방어 구간" : "추세 전환 대기"
    };
  };

  const flow = getFlowAnalysis();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans text-left relative overflow-x-hidden">
      {/* Snapshot Log Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md" onClick={() => setShowHistory(false)}>
          <div className="bg-slate-900 w-full max-w-6xl max-h-[92vh] rounded-[2rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-base font-black italic uppercase tracking-widest text-white">Neural Snapshot Log (12H Window)</h3>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 py-6 custom-scrollbar">
              {aiAnalysis ? (
                <div className="mb-6 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-6 text-[13px] leading-relaxed italic text-indigo-100 shadow-inner">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-ping"></span>
                    <span className="font-black uppercase tracking-widest text-indigo-400 text-[11px]">Investment Strategy AI Guide</span>
                  </div>
                  {aiAnalysis.summary}
                </div>
              ) : (
                isAnalyzing && (
                  <div className="mb-6 bg-slate-800/50 border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center py-10 animate-pulse">
                    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">지표 추세 분석 중...</p>
                  </div>
                )
              )}

              <div className="grid grid-cols-12 gap-0 px-2 py-3 text-[11px] font-black uppercase text-slate-600 tracking-tighter border-b border-white/5 mb-3">
                <div className="col-span-1 pl-2">Time</div>
                <div className="col-span-5 text-center">Stat Analysis</div>
                <div className="col-span-2 text-right">DEV</div>
                <div className="col-span-1 text-right">OSC</div>
                <div className="col-span-1 text-right">F&G</div>
                <div className="col-span-2 text-right pr-2">MVRV</div>
              </div>

              <div className="space-y-1.5 mb-10">
                {history.length === 0 ? <div className="py-24 text-center opacity-20 text-[12px] uppercase font-black tracking-widest">No Logs Found</div> : 
                  history.map((h, idx) => {
                    const hStyle = getStatusLabel(h.status);
                    const insight = aiAnalysis?.dateInsights[h.date];
                    const isExpanded = expandedDate === h.date;
                    const devVal = h.price - h.fair;

                    return (
                      <div key={h.id}>
                        <div onClick={() => insight && setExpandedDate(isExpanded ? null : h.date)} className={`grid grid-cols-12 gap-0 px-2 py-3 rounded-xl text-[10px] items-center transition-colors cursor-pointer tracking-tighter ${isExpanded ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                          <div className="col-span-1 font-bold mono text-slate-500 whitespace-nowrap pl-1">{h.date}</div>
                          <div className="col-span-5 text-center px-1">
                            <span className={`px-2 py-0.5 rounded-md font-black text-[9px] ${hStyle.bg} ${hStyle.color} tracking-tighter whitespace-nowrap inline-block uppercase overflow-hidden text-ellipsis`}>
                              {hStyle.desc}
                            </span>
                          </div>
                          <div className={`col-span-2 text-right font-bold italic mono whitespace-nowrap ${devVal >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {devVal >= 0 ? '+' : ''}{Math.round(devVal).toLocaleString()}
                          </div>
                          <div className="col-span-1 text-right mono text-slate-500 whitespace-nowrap">{h.oscillator.toFixed(2)}</div>
                          <div className="col-span-1 text-right mono text-slate-500 whitespace-nowrap">{h.fng}</div>
                          <div className="col-span-2 text-right mono text-slate-500 whitespace-nowrap pr-1">{h.mvrv.toFixed(1)}</div>
                        </div>
                        {isExpanded && insight && <div className="px-5 py-4 bg-indigo-500/5 border-l-2 border-indigo-500 mx-3 mb-3 text-[12px] text-indigo-300 font-bold italic leading-relaxed">{insight}</div>}
                      </div>
                    );
                  })
                }
              </div>

              {history.length >= 12 && (
                <div className="mt-10 bg-slate-950/50 border border-white/5 rounded-[2rem] p-8">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[12px] font-black uppercase tracking-[0.25em] text-emerald-500 italic">Indicator Synthesis Guide</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">OSC Trend</p>
                      <p className={`text-[15px] font-black italic ${flow?.oscTrend.includes('상승') ? 'text-rose-400' : 'text-emerald-400'}`}>{flow?.oscTrend}</p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">MVRV Delta</p>
                      <p className={`text-[15px] font-black italic ${flow?.mvrvTrend.includes('가속') ? 'text-rose-400' : 'text-emerald-400'}`}>{flow?.mvrvTrend}</p>
                    </div>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">Sentiment</p>
                      <p className={`text-[15px] font-black italic ${flow?.fngTrend.includes('탐욕') ? 'text-rose-400' : 'text-emerald-400'}`}>{flow?.fngTrend}</p>
                    </div>
                    <div className="bg-indigo-500/10 p-5 rounded-2xl border border-indigo-500/20">
                      <p className="text-[10px] font-black text-indigo-400 uppercase mb-2 tracking-widest">Investment Guide</p>
                      <p className="text-[15px] font-black italic text-white">{flow?.investGuide}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-5 bg-slate-950/50 border-t border-white/5 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">5M Real-time Sync (12H Window Only)</span>
              <button 
                onClick={clearHistory} 
                className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-500 transition-colors bg-white/5 rounded-lg border border-white/5"
              >
                Clear All Logs
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-screen-2xl mx-auto px-4 py-3 flex justify-between items-center border-b border-white/5 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <h1 className="text-lg font-black text-white tracking-tighter italic uppercase flex items-baseline gap-1.5">BIT COMPASS <span className="text-amber-500">PRO</span> <span className="text-[12px] font-bold text-slate-700 tracking-widest not-italic">v11.9</span></h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 hover:bg-white/5 rounded-xl border border-white/5 transition-colors">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Log</span>
          </button>
          <button onClick={init} className="p-2 bg-slate-900/50 hover:bg-white/5 rounded-lg border border-white/5 transition-colors"><svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15"></path></svg></button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 mt-8 pb-24 space-y-10 text-left">
        <section className="bg-gradient-to-br from-slate-900/60 to-slate-950 border border-white/5 rounded-[3rem] p-6 md:p-10 shadow-2xl overflow-hidden relative group">
          <div className="space-y-10">
            <div className="space-y-4">
              <h2 className="text-6xl font-black text-white italic mono tracking-tighter leading-none">
                <span className="opacity-50 text-3xl italic">$</span><Space />{data.currentPrice.toLocaleString()}
              </h2>
              <div className="flex items-baseline gap-3">
                <p className="text-xl text-slate-500 font-bold italic mono">
                  <span className="text-[0.8em] italic opacity-60">₩</span><Space />{Math.round(data.currentPrice * data.usdKrw).toLocaleString()}
                </p>
                <p className={`text-xl font-bold mono italic ${deviationKrw >= 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                  ({deviationKrw >= 0 ? '+' : '-'} <span className="text-[0.8em] italic opacity-60">₩</span><Space />{Math.abs(Math.round(deviationKrw)).toLocaleString()})
                </p>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-sm p-5 md:p-8 rounded-[2.5rem] border border-white/10 space-y-8">
              <div className="flex items-center gap-3 border-b border-white/5 pb-5">
                 <div className={`w-3 h-3 rounded-full ${label.color.replace('text', 'bg')} animate-pulse`}></div>
                 <h3 className={`text-[17px] md:text-[20px] font-black uppercase tracking-tight ${label.color}`}>
                   {label.headline}
                 </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 px-1">
                <div>
                  <p className="text-amber-500 font-black text-[12px] uppercase tracking-widest mb-3 italic">01. 컨텍스트 (Analysis)</p>
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">{info.guide}</p>
                </div>
                <div>
                  <p className="text-amber-500 font-black text-[12px] uppercase tracking-widest mb-3 italic">02. 최적화 (Optimization)</p>
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">{info.action}</p>
                </div>
                <div>
                  <p className="text-amber-500 font-black text-[12px] uppercase tracking-widest mb-3 italic">03. 인텔리전스 (Synthesis)</p>
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">{info.types}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <StageCard title="OSCILLATOR" displayValue={`${stats.oscillator >= 0 ? '+' : ''}${stats.oscillator.toFixed(2)}`} subLabel="" stages={STAGES.OSCILLATOR} currentVal={stats.oscillator} />
          <StageCard title="SENTIMENT" displayValue={data.fngValue} subLabel="" stages={STAGES.FNG} currentVal={data.fngValue} />
          <StageCard title="MVRV Z-SCORE" displayValue={stats.mvrvEst.toFixed(2)} subLabel="" stages={STAGES.MVRV} currentVal={stats.mvrvEst} />
        </div>

        <section className="bg-slate-300 p-2 rounded-[3.5rem] border border-slate-400 shadow-2xl relative overflow-hidden h-[450px] md:h-[650px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 30, right: 10, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
              <XAxis dataKey="timestamp" type="number" domain={[new Date('2017-07-01').getTime(), 'dataMax']} hide={true} />
              <YAxis type="number" domain={[2000, 500000]} scale="log" hide={true} />
              <Tooltip content={<CustomTooltip />} cursor={{stroke: '#64748b', strokeWidth: 1}} />
              <Line name="상단 밴드" dataKey="upper" stroke={COLORS.upper} strokeWidth={1} dot={false} strokeDasharray="4 4" />
              <Line name="하단 밴드" dataKey="lower" stroke={COLORS.lower} strokeWidth={1} dot={false} strokeDasharray="4 4" />
              <Line name="적정 가치" dataKey="fair" stroke={COLORS.fair} strokeWidth={2.5} dot={false} />
              <Line name="시장 가격" dataKey="price" stroke={COLORS.price} strokeWidth={4} dot={false} connectNulls={true} />
            </ComposedChart>
          </ResponsiveContainer>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-left">
          <div className="bg-slate-900/40 rounded-[2.5rem] border border-white/5 overflow-hidden">
            <div className="px-8 py-5 border-b border-white/5"><h4 className="text-[12px] font-black tracking-widest text-amber-500 uppercase italic">Model Convergence</h4></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] table-fixed min-w-[500px]">
                <thead className="bg-black/20 text-slate-600 font-black uppercase text-[11px] italic">
                  <tr><th className="px-8 py-5 text-left">Engine</th><th className="px-8 py-5 text-right">Upper Band</th><th className="px-8 py-5 text-right">Fair Value</th><th className="px-8 py-5 text-right">Lower Band</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    { n: 'HYBRID', v: stats.model.weighted, u: stats.model.upper, l: stats.model.lower },
                    { n: 'DECAYING', v: stats.model.decaying, u: stats.model.decaying * 1.6, l: stats.model.decaying * 0.6 },
                    { n: 'CYCLE', v: stats.model.cycle, u: stats.model.cycle * 1.6, l: stats.model.cycle * 0.6 },
                    { n: 'STANDARD', v: stats.model.standard, u: stats.model.standard * 1.6, l: stats.model.standard * 0.6 },
                  ].map((r, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-8 py-8 font-black italic text-slate-400">{r.n}</td>
                      <td className="px-8 py-8 text-right">{renderPriceWithKrw(r.u, "text-rose-500")}</td>
                      <td className="px-8 py-8 text-right">{renderPriceWithKrw(r.v, "text-amber-500 font-black")}</td>
                      <td className="px-8 py-8 text-right">{renderPriceWithKrw(r.l, "text-emerald-500")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-900/40 rounded-[2.5rem] border border-white/5 overflow-hidden">
            <div className="px-8 py-5 border-b border-white/5"><h4 className="text-[12px] font-black tracking-widest text-emerald-500 uppercase italic">Growth Projection</h4></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] table-fixed min-w-[500px]">
                <thead className="bg-black/20 text-slate-600 font-black uppercase text-[11px] italic">
                  <tr><th className="px-8 py-5 text-left">Target</th><th className="px-8 py-5 text-right">Peak</th><th className="px-8 py-5 text-right">Fair</th><th className="px-8 py-5 text-right">Bottom</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {projections.map((p, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-8 py-8 font-black italic text-slate-400">{p.label} ('{p.date.slice(2,4)})</td>
                      <td className="px-8 py-8 text-right">{renderPriceWithKrw(p.upper, "text-rose-500")}</td>
                      <td className="px-8 py-8 text-right">{renderPriceWithKrw(p.weighted, "text-amber-500 font-black")}</td>
                      <td className="px-8 py-8 text-right">{renderPriceWithKrw(p.lower, "text-emerald-500")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-16 text-center opacity-20"><p className="text-[12px] font-black uppercase tracking-[0.45em] text-slate-500 italic">Statistical Truth over Emotional Noise.</p></footer>
    </div>
  );
};

export default App;
