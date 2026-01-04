
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchMarketData, EnhancedMarketData } from './services/dataService';
import { getModelValues } from './services/modelEngine';
import { MarketData, MarketStatus } from './types';
import StageCard from './components/StageCard';
import { STAGES, CHART_START_DATE } from './constants';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, ReferenceLine, Label
} from 'recharts';

// aistudio 타입 정의 - AIStudio 인터페이스를 명시적으로 정의하여 기존 환경과의 타입 충돌 해결
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

declare global {
  interface Window {
    aistudio: AIStudio;
  }
}

const COLORS = {
  upper: '#ff2d55',
  fair: '#d97706',
  lower: '#047857',
  price: '#1d4ed8',
  halving: '#f59e0b',
  riskUp: '#ef4444', 
  riskDown: '#3b82f6', 
};

const HALVING_DATES = [
  { date: '2012-11-28', label: '1st Halving' },
  { date: '2016-07-09', label: '2nd Halving' },
  { date: '2020-05-11', label: '3rd Halving' },
  { date: '2024-04-20', label: '4th Halving' },
  { date: '2028-03-27', label: '5th Halving (Est.)' },
];

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

interface DateInsight {
  time: string;
  insight: string;
}

interface AIAnalysis {
  summary: string;
  insights: DateInsight[];
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
  const [isMounted, setIsMounted] = useState(false); 
  const [aiError, setAiError] = useState<string | null>(null);
  
  const lastClearTimestamp = useRef<number>(0);

  const init = async () => {
    setLoading(true);
    const result = await fetchMarketData();
    setData(result);
    setLoading(false);
  };

  useEffect(() => { 
    init();
    setTimeout(() => setIsMounted(true), 150);
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

  const formatDate = (date: Date) => {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const h = date.getHours();
    return `${m}.${d}.${h}h`;
  };

  const stats = useMemo(() => {
    if (!data) return null;
    return calculateIndicators(data.currentPrice, new Date(), data.fngValue);
  }, [data]);

  const fetchAIAnalysis = async (historyData: Snapshot[]) => {
    if (historyData.length < 1 || isAnalyzing) return;
    setIsAnalyzing(true);
    setAiError(null);
    
    try {
      // API 키 체크
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        setAiError("API_KEY_REQUIRED");
        setIsAnalyzing(false);
        return;
      }

      // 인스턴스 매번 생성 (최신 키 보장)
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const historyStr = historyData.slice(0, 10).map(h => 
        `[${h.date}] $${h.price.toLocaleString()}, Osc: ${h.oscillator.toFixed(2)}, F&G: ${Math.round(h.fng)}, MVRV: ${h.mvrv.toFixed(2)}`
      ).join('\n');
      
      const prompt = `비트코인 퀀트 전략가로서 다음 데이터를 정밀 분석하십시오.
1. 'summary'에는 현재 시장의 거시적 위치, 모델 궤도 이탈 여부, 향후 대응 시나리오를 '매우 구체적이고 전문적인 논조'로 최소 500자 이상 작성하세요.
2. 'insights'에는 각 타임스탬프별 지표 변화의 의미를 한글로 상세히 기술하십시오.

DATA:
${historyStr}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { 
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              insights: { 
                type: Type.ARRAY, 
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    insight: { type: Type.STRING }
                  },
                  required: ["time", "insight"]
                }
              }
            },
            required: ["summary", "insights"]
          },
          // gemini-3-pro-preview 모델의 복잡한 추론 작업을 위해 thinkingBudget을 32768로 설정
          thinkingConfig: { thinkingBudget: 32768 }
        }
      });
      
      if (response.text) {
        setAiAnalysis(JSON.parse(response.text));
      }
    } catch (e: any) { 
      console.error(e);
      if (e.message?.includes("not found") || e.message?.includes("API_KEY")) {
        setAiError("API_KEY_INVALID");
      } else {
        setAiError("GENERAL_ERROR");
      }
    } finally { setIsAnalyzing(false); }
  };

  const handleOpenApiKeyDialog = async () => {
    await window.aistudio.openSelectKey();
    // 키 선택 시도 후 바로 분석 재시도
    if (history.length > 0) fetchAIAnalysis(history);
  };

  useEffect(() => {
    if (showHistory && history.length >= 1 && !aiAnalysis && !isAnalyzing) {
      fetchAIAnalysis(history);
    }
  }, [showHistory, history]);

  useEffect(() => {
    if (data && stats && data.intraday.length > 0) {
      const now = Date.now();
      if (now - lastClearTimestamp.current < 60000) return;

      const LOG_INTERVAL = 4 * 60 * 60 * 1000; 
      const savedHistory = localStorage.getItem('btc_compass_history');
      let updated: Snapshot[] = [];
      try { updated = savedHistory ? JSON.parse(savedHistory) : []; } catch(e) { updated = []; }
      
      const lastEntry = updated[0];
      const backfilledLogs: Snapshot[] = [];
      
      const startTimeForBackfill = lastEntry ? lastEntry.timestamp : (now - 4 * 60 * 60 * 1000);
      let cursor = startTimeForBackfill;

      while (true) {
        cursor += LOG_INTERVAL;
        if (cursor > now) break;

        const closestPoint = data.intraday.reduce((prev, curr) => {
          const prevDiff = Math.abs(new Date(prev.date).getTime() - cursor);
          const currDiff = Math.abs(new Date(curr.date).getTime() - cursor);
          return currDiff < prevDiff ? curr : prev;
        });

        const isRecent = Math.abs(new Date(closestPoint.date).getTime() - cursor) < 3600000;
        const targetPrice = isRecent ? closestPoint.price : data.currentPrice;
        const targetDate = new Date(cursor);
        const s = calculateIndicators(targetPrice, targetDate, data.fngValue);

        backfilledLogs.push({
          id: cursor,
          timestamp: cursor,
          date: formatDate(targetDate),
          status: s.status,
          oscillator: s.oscillator,
          fng: data.fngValue,
          mvrv: s.mvrvEst,
          price: targetPrice,
          fair: s.model.weighted
        });
      }

      if (backfilledLogs.length > 0) {
        const finalHistory = [...backfilledLogs.reverse(), ...updated].slice(0, 100);
        localStorage.setItem('btc_compass_history', JSON.stringify(finalHistory));
        setHistory(finalHistory);
      }
    }
  }, [data, stats]);

  const chartData = useMemo(() => {
    if (!data || !data.history) return [];
    const historical = data.history.filter(h => new Date(h.date) >= CHART_START_DATE).map(h => {
      const m = getModelValues(new Date(h.date));
      return { timestamp: new Date(h.date).getTime(), price: h.price, fair: m.weighted, upper: m.upper, lower: m.lower };
    });
    const lastDate = new Date(data.history[data.history.length-1].date);
    const predictions = [];
    for(let i=1; i<=365; i++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(futureDate.getDate() + i);
      const m = getModelValues(futureDate);
      predictions.push({ timestamp: futureDate.getTime(), price: null, fair: m.weighted, upper: m.upper, lower: m.lower });
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
      text: '저평가 매집 국면', 
      desc: '통계적 저점 형성 및 매집 우위 구간', 
      headline: '가치 하단 임계점 진입: 장기 관점의 분할 매수가 통계적으로 유리한 구간입니다.', 
      color: 'text-emerald-400', 
      bg: 'bg-emerald-500/10' 
    };
    if (status === MarketStatus.SELL) return { 
      text: '고평가 과열 국면', 
      desc: '심리적 과열 및 리스크 관리 구간', 
      headline: '가치 상단 임계점 진입: 과열된 심리에 따른 변동성 확대가 우려됩니다.', 
      color: 'text-rose-400', 
      bg: 'bg-rose-500/10' 
    };
    return { 
      text: '가치 균형 구간', 
      desc: '중립적 추세 유지 및 관망 구간', 
      headline: '모델 균형 가격대 안착: 적정 가치 궤도 내에서의 안정적 움직임이 예상됩니다.', 
      color: 'text-amber-400', 
      bg: 'bg-amber-500/10' 
    };
  };

  const clearHistory = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('모든 로그 기록을 삭제하시겠습니까?')) {
      lastClearTimestamp.current = Date.now();
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
  const label = getStatusLabel(stats.status);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans text-left relative overflow-x-hidden">
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-4 bg-black/95 backdrop-blur-md" onClick={() => setShowHistory(false)}>
          <div className="bg-slate-900 w-full max-w-6xl max-h-[95vh] rounded-[2rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-5 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-base font-black italic uppercase tracking-widest text-white">Neural Snapshot Log</h3>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors active:scale-90">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-1 md:px-4 py-6 custom-scrollbar">
              {aiAnalysis ? (
                <div className="mb-8 bg-indigo-500/10 border border-indigo-500/30 rounded-3xl p-6 text-[14px] md:text-[15px] leading-relaxed italic text-indigo-100 shadow-2xl mx-1">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-ping"></span>
                    <span className="font-black uppercase tracking-widest text-indigo-400 text-[11px]">Quant Strategy Synthesis (Gemini 3 Pro)</span>
                  </div>
                  <div className="whitespace-pre-line">{aiAnalysis.summary}</div>
                </div>
              ) : (
                <div className="mb-8 mx-1">
                  {isAnalyzing ? (
                    <div className="animate-pulse bg-white/5 p-16 rounded-3xl text-center flex flex-col items-center gap-4">
                      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[12px] font-black uppercase tracking-widest text-slate-500">신경망 분석 엔진 가동 중...</span>
                    </div>
                  ) : aiError ? (
                    <div className="bg-rose-500/10 border border-rose-500/30 p-10 rounded-3xl text-center space-y-4">
                      <p className="text-rose-400 font-bold italic">
                        {aiError === "API_KEY_REQUIRED" ? "AI 분석을 위해 API 키 선택이 필요합니다." : 
                         aiError === "API_KEY_INVALID" ? "사용 중인 API 키가 만료되었거나 권한이 없습니다." : 
                         "데이터 분석 중 오류가 발생했습니다. (모바일 지연)"}
                      </p>
                      <div className="flex flex-col md:flex-row gap-3 justify-center">
                        <button onClick={handleOpenApiKeyDialog} className="px-6 py-3 bg-rose-500 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-rose-600 transition-all active:scale-95">API 키 설정하기</button>
                        <button onClick={() => fetchAIAnalysis(history)} className="px-6 py-3 bg-white/10 text-slate-300 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-white/20 transition-all active:scale-95">다시 시도</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              
              <div className="grid grid-cols-[1.1fr_1.8fr_1fr_0.8fr_0.8fr_0.8fr] md:grid-cols-[1.5fr_3fr_2fr_1.5fr_1fr_2fr] gap-0.5 md:gap-1 px-1 md:px-3 py-4 text-[9px] md:text-[11px] font-black uppercase text-slate-600 tracking-tighter border-b border-white/5 mb-3 sticky top-0 bg-slate-900 z-10">
                <div className="pl-1">Date</div>
                <div className="text-center">State Analysis</div>
                <div className="text-right">DEV</div>
                <div className="text-right">OSC</div>
                <div className="text-right">F&G</div>
                <div className="text-right pr-1">MVRV</div>
              </div>

              <div className="space-y-1 md:space-y-2 mb-10">
                {history.length === 0 ? <div className="py-24 text-center opacity-20 text-[12px] uppercase font-black tracking-widest italic">No Data</div> : 
                  history.map((h, idx) => {
                    const hStyle = getStatusLabel(h.status);
                    const insight = aiAnalysis?.insights.find(i => i.time === h.date)?.insight;
                    const isExpanded = expandedDate === h.date;
                    const devVal = h.price - h.fair;
                    const nextH = history[idx + 1];

                    const getIndicatorColor = (val: number, prevVal: number | undefined, type: 'osc' | 'fng' | 'mvrv' | 'dev') => {
                      if (prevVal === undefined) return 'text-slate-500';
                      let currentStr = (type === 'fng' || type === 'dev') ? Math.round(val).toString() : val.toFixed(2);
                      let prevStr = (type === 'fng' || type === 'dev') ? Math.round(prevVal).toString() : prevVal.toFixed(2);
                      if (currentStr === prevStr) return 'text-slate-500';
                      return parseFloat(currentStr) > parseFloat(prevStr) ? COLORS.riskUp : COLORS.riskDown;
                    };

                    return (
                      <div key={h.id} className="relative mx-1">
                        <div 
                          onClick={(e) => {
                             e.preventDefault();
                             if (insight) setExpandedDate(isExpanded ? null : h.date);
                          }} 
                          className={`grid grid-cols-[1.1fr_1.8fr_1fr_0.8fr_0.8fr_0.8fr] md:grid-cols-[1.5fr_3fr_2fr_1.5fr_1fr_2fr] gap-0.5 md:gap-1 px-1 md:px-3 py-5 rounded-2xl text-[10px] md:text-[11px] items-center transition-all cursor-pointer select-none active:bg-white/20 touch-manipulation border border-transparent ${isExpanded ? 'bg-white/10 border-white/10 ring-1 ring-white/10 shadow-lg' : 'hover:bg-white/5'}`}
                        >
                          <div className="font-bold mono text-slate-400 whitespace-nowrap pl-0.5">{h.date}</div>
                          <div className="text-center"><span className={`px-1 py-0.5 rounded-md font-black text-[7.5px] md:text-[9px] ${hStyle.bg} ${hStyle.color} tracking-tighter uppercase whitespace-nowrap`}>{hStyle.text}</span></div>
                          <div className="text-right mono italic" style={{ color: getIndicatorColor(devVal, nextH ? (nextH.price - nextH.fair) : undefined, 'dev') }}>{devVal >= 0 ? '+' : ''}{Math.round(devVal).toLocaleString()}</div>
                          <div className="text-right mono" style={{ color: getIndicatorColor(h.oscillator, nextH?.oscillator, 'osc') }}>{h.oscillator.toFixed(2)}</div>
                          <div className="text-right mono" style={{ color: getIndicatorColor(h.fng, nextH?.fng, 'fng') }}>{Math.round(h.fng)}</div>
                          <div className="text-right mono pr-0.5" style={{ color: getIndicatorColor(h.mvrv, nextH?.mvrv, 'mvrv') }}>{h.mvrv.toFixed(2)}</div>
                        </div>
                        {isExpanded && insight && (
                          <div className="px-4 py-5 bg-indigo-500/10 border-l-4 border-indigo-500 mt-1 mb-4 text-[13px] md:text-[14px] text-indigo-200 font-bold italic leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300 rounded-r-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <svg className="w-3.5 h-3.5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"></path></svg>
                                <span className="uppercase tracking-widest text-[9px] text-indigo-400 not-italic">Neural Insight for {h.date}</span>
                            </div>
                            {insight}
                          </div>
                        )}
                      </div>
                    );
                  })
                }
              </div>
            </div>
            <div className="p-5 bg-slate-950/50 border-t border-white/5 flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic tracking-wider">Neural Analysis Engine v14.7</span>
              <button onClick={clearHistory} className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-500 transition-all bg-white/5 hover:bg-rose-500/10 rounded-xl border border-white/5 shadow-inner active:scale-95">Clear Logs</button>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-screen-2xl mx-auto px-4 py-3 flex justify-between items-center border-b border-white/5 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <h1 className="text-lg font-black text-white tracking-tighter italic uppercase flex items-baseline gap-1.5">BIT COMPASS <span className="text-amber-500">PRO</span> <span className="text-[12px] font-bold text-slate-700 tracking-widest not-italic">v14.7</span></h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 hover:bg-white/5 rounded-xl border border-white/5 transition-colors active:scale-95">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Log</span>
          </button>
          <button onClick={init} className="p-2 bg-slate-900/50 hover:bg-white/5 rounded-lg border border-white/5 transition-colors active:scale-95"><svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15"></path></svg></button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 mt-8 pb-10 space-y-10 text-left">
        <section className="bg-gradient-to-br from-slate-900/60 to-slate-950 border border-white/5 rounded-[3rem] p-6 md:p-10 shadow-2xl overflow-hidden relative group">
          <div className="space-y-10">
            <div className="space-y-4">
              <h2 className="text-6xl font-black text-white italic mono tracking-tighter leading-none"><span className="opacity-50 text-3xl italic">$</span><Space />{data.currentPrice.toLocaleString()}</h2>
              <div className="flex items-baseline gap-3">
                <p className="text-xl text-slate-500 font-bold italic mono"><span className="text-[0.8em] italic opacity-60">₩</span><Space />{Math.round(data.currentPrice * data.usdKrw).toLocaleString()}</p>
                <p className={`text-xl font-bold mono italic ${deviationKrw >= 0 ? 'text-rose-500' : 'text-emerald-400'}`}>({deviationKrw >= 0 ? '+' : '-'} <span className="text-[0.8em] italic opacity-60">₩</span><Space />{Math.abs(Math.round(deviationKrw)).toLocaleString()})</p>
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm p-5 md:p-8 rounded-[2.5rem] border border-white/10 space-y-8">
              <div className="flex items-center gap-3 border-b border-white/5 pb-5">
                 <div className={`w-3 h-3 rounded-full ${label.color.replace('text', 'bg')} animate-pulse`}></div>
                 <h3 className={`text-[17px] md:text-[20px] font-black uppercase tracking-tight ${label.color}`}>{label.headline}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 px-1">
                <div>
                  <p className="text-amber-500 font-black text-[12px] uppercase tracking-widest mb-3 italic">01. 컨텍스트 (Analysis)</p>
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">시장의 현재 위치와 통계적 구조를 분석하여 투심에 휘둘리지 않는 객관적 시각을 견지합니다.</p>
                </div>
                <div>
                  <p className="text-amber-500 font-black text-[12px] uppercase tracking-widest mb-3 italic">02. 최적화 (Optimization)</p>
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">리스크 대비 보상 비율을 고려하여 최적의 분할 진입 및 탈출 지점을 기계적으로 도출합니다.</p>
                </div>
                <div>
                  <p className="text-amber-500 font-black text-[12px] uppercase tracking-widest mb-3 italic">03. 인텔리전스 (Synthesis)</p>
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">하이브리드 엔진이 계산한 적정 가치와 온체인 수익률을 결합하여 시장의 소음을 필터링합니다.</p>
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

        <section className="bg-slate-300 p-2 rounded-[3.5rem] border border-slate-400 shadow-2xl relative overflow-hidden h-[450px] md:h-[650px] min-h-[450px] w-full min-w-0">
          {isMounted && (
            <ResponsiveContainer width="99%" height="100%" debounce={50}>
              <ComposedChart data={chartData} margin={{ top: 30, right: 10, left: 10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                <XAxis dataKey="timestamp" type="number" domain={[new Date('2017-07-01').getTime(), 'dataMax']} hide={true} />
                <YAxis type="number" domain={[2000, 500000]} scale="log" hide={true} />
                <Tooltip content={<CustomTooltip />} cursor={{stroke: '#64748b', strokeWidth: 1}} />
                {HALVING_DATES.map((hv, idx) => (
                  <ReferenceLine key={idx} x={new Date(hv.date).getTime()} stroke={COLORS.halving} strokeWidth={1} strokeDasharray="5 5">
                    <Label value={hv.label} position="top" fill={COLORS.halving} fontSize={10} fontWeight="900" offset={10} />
                  </ReferenceLine>
                ))}
                <Line name="상단 밴드" dataKey="upper" stroke={COLORS.upper} strokeWidth={1} dot={false} strokeDasharray="4 4" />
                <Line name="하단 밴드" dataKey="lower" stroke={COLORS.lower} strokeWidth={1} dot={false} strokeDasharray="4 4" />
                <Line name="적정 가치" dataKey="fair" stroke={COLORS.fair} strokeWidth={2.5} dot={false} />
                <Line name="시장 가격" dataKey="price" stroke={COLORS.price} strokeWidth={4} dot={false} connectNulls={true} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
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
      <footer className="pt-4 pb-16 text-center opacity-20"><p className="text-[12px] font-black uppercase tracking-[0.45em] text-slate-500 italic">Statistical Truth over Emotional Noise.</p></footer>
    </div>
  );
};

export default App;
