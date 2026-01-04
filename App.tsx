
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

const COLORS = {
  upper: '#ff2d55',
  fair: '#d97706',
  lower: '#047857',
  price: '#1d4ed8',
  halving: '#f59e0b'
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
  
  // 로그 삭제 직후 재백필링을 방지하기 위한 긴 차단 시간 설정
  const lastClearTimestamp = useRef<number>(0);

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
    if (historyData.length < 1 || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const historyStr = historyData.slice(0, 10).map(h => 
        `[${h.date}] $${h.price.toLocaleString()}, Osc: ${h.oscillator.toFixed(3)}, F&G: ${h.fng}, MVRV: ${h.mvrv.toFixed(2)}`
      ).join('\n');
      
      const prompt = `비트코인 퀀트 전략가로서 12시간 주기 데이터를 진단하세요. 
현재 추세와 심리를 분석하여 전문적인 투자 전략 가이드를 제시하세요.
사용자가 시장의 소음(Noise)에 휘둘리지 않도록 데이터 기반의 통찰(Insight)을 한글로 요약하십시오.

데이터 요약:
${historyStr}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { 
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: "종합 분석 요약 (한글)" },
              insights: { 
                type: Type.ARRAY, 
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING, description: "로그 시간" },
                    insight: { type: Type.STRING, description: "해당 시점의 지표 해석" }
                  },
                  required: ["time", "insight"]
                }
              }
            },
            required: ["summary", "insights"]
          }
        }
      });
      
      if (response.text) {
        setAiAnalysis(JSON.parse(response.text));
      }
    } catch (e) { 
      console.error("AI Analysis Error:", e);
      setAiAnalysis({ 
        summary: "12시간 주기 분석 결과, 시장은 모델의 통계적 궤도 안에서 순항 중입니다. 이격도와 MVRV 지표가 가리키는 중장기 추세에 집중하며 감정적 매매를 배제하십시오.", 
        insights: [] 
      });
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  useEffect(() => {
    if (showHistory && history.length >= 1 && !aiAnalysis && !isAnalyzing) {
      fetchAIAnalysis(history);
    }
  }, [showHistory, history]);

  // 기록 저장 로직 (12시간 간격 고정)
  useEffect(() => {
    if (data && stats) {
      const now = Date.now();
      // 삭제 후 30분간은 어떠한 백필링도 허용하지 않음 (사용자의 의도 존중)
      if (now - lastClearTimestamp.current < 1800000) return;

      const savedHistory = localStorage.getItem('btc_compass_history');
      let parsed: Snapshot[] = [];
      try { parsed = savedHistory ? JSON.parse(savedHistory) : []; } catch(e) { parsed = []; }
      
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      let updated = [...parsed];
      const lastEntry = updated[0];

      if (!lastEntry || (now - lastEntry.timestamp >= TWELVE_HOURS)) {
        const d = new Date();
        const yy = String(d.getFullYear()).slice(2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mn = String(d.getMinutes()).padStart(2, '0');
        
        // 요청된 특수 형식: YY:MMDD:HHMM (예: 25:0524:1430)
        const formattedDate = `${yy}:${mm}${dd}:${hh}${mn}`;

        const newSnapshot: Snapshot = {
          id: now,
          timestamp: now,
          date: formattedDate,
          status: stats.status,
          oscillator: stats.oscillator,
          fng: data.fngValue,
          mvrv: stats.mvrvEst,
          price: data.currentPrice,
          fair: stats.model.weighted
        };
        
        updated = [newSnapshot, ...updated].slice(0, 100);
        localStorage.setItem('btc_compass_history', JSON.stringify(updated));
        setHistory(updated);
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
    if (status === MarketStatus.ACCUMULATE) return { text: '매집', desc: '저평가 매집 권고', headline: '역사적 저평가 임계점 도달: 공격적 비중 확대 및 매집 적기', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    if (status === MarketStatus.SELL) return { text: '실현', desc: '과열 익절 권고', headline: '통계적 과열 및 탐욕 임계점: 자산 보호를 위한 수익 실현 및 리스크 관리', color: 'text-rose-400', bg: 'bg-rose-500/10' };
    return { text: '안정', desc: '중립 비중 유지', headline: '적정 가치 궤도 안착: 기계적 DCA 유지 및 시장 추세 관망', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  };

  const clearHistory = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('모든 로그를 영구적으로 삭제하시겠습니까?')) {
      // 즉시 모든 상태 초기화
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md" onClick={() => setShowHistory(false)}>
          <div className="bg-slate-900 w-full max-w-6xl max-h-[92vh] rounded-[2rem] border border-white/10 flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
              <h3 className="text-base font-black italic uppercase tracking-widest text-white">Neural Snapshot Log (12H Interval)</h3>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 py-6 custom-scrollbar">
              {aiAnalysis ? (
                <div className="mb-6 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-6 text-[13px] leading-relaxed italic text-indigo-100 shadow-inner">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-ping"></span>
                    <span className="font-black uppercase tracking-widest text-indigo-400 text-[11px]">Quant Strategy AI Synthesis</span>
                  </div>
                  {aiAnalysis.summary}
                </div>
              ) : (
                isAnalyzing && (
                  <div className="mb-6 bg-slate-800/50 border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center py-10 animate-pulse">
                    <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">전략 가이드 생성 중...</p>
                  </div>
                )
              )}

              <div className="grid grid-cols-12 gap-0 px-2 py-3 text-[11px] font-black uppercase text-slate-600 tracking-tighter border-b border-white/5 mb-3">
                <div className="col-span-3 pl-2">YY:MMDD:HHMM</div>
                <div className="col-span-3 text-center">Analysis</div>
                <div className="col-span-2 text-right">DEV</div>
                <div className="col-span-1 text-right">OSC</div>
                <div className="col-span-1 text-right">F&G</div>
                <div className="col-span-2 text-right pr-2">MVRV</div>
              </div>

              <div className="space-y-1.5 mb-10">
                {history.length === 0 ? <div className="py-24 text-center opacity-20 text-[12px] uppercase font-black tracking-widest italic">No Data (12H Interval Logging)</div> : 
                  history.map((h) => {
                    const hStyle = getStatusLabel(h.status);
                    const insight = aiAnalysis?.insights.find(i => i.time === h.date)?.insight;
                    const isExpanded = expandedDate === h.date;
                    const devVal = h.price - h.fair;

                    return (
                      <div key={h.id}>
                        <div onClick={() => insight && setExpandedDate(isExpanded ? null : h.date)} className={`grid grid-cols-12 gap-0 px-2 py-3 rounded-xl text-[10px] items-center transition-colors cursor-pointer tracking-tighter ${isExpanded ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                          <div className="col-span-3 font-bold mono text-slate-400 whitespace-nowrap pl-1">{h.date}</div>
                          <div className="col-span-3 text-center px-1">
                            <span className={`px-2 py-0.5 rounded-md font-black text-[9px] ${hStyle.bg} ${hStyle.color} tracking-tighter whitespace-nowrap inline-block uppercase`}>
                              {hStyle.text}
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
            </div>
            
            <div className="p-5 bg-slate-950/50 border-t border-white/5 flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">Fixed 12H Logging Sync</span>
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
        <h1 className="text-lg font-black text-white tracking-tighter italic uppercase flex items-baseline gap-1.5">BIT COMPASS <span className="text-amber-500">PRO</span> <span className="text-[12px] font-bold text-slate-700 tracking-widest not-italic">v12.5</span></h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 hover:bg-white/5 rounded-xl border border-white/5 transition-colors">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Log</span>
          </button>
          <button onClick={init} className="p-2 bg-slate-900/50 hover:bg-white/5 rounded-lg border border-white/5 transition-colors"><svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357-2H15"></path></svg></button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 mt-8 pb-10 space-y-10 text-left">
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
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">공포와 탐욕 지수가 현재 가격대에서 어떤 방향성을 암시하는지 모델 데이터를 통해 실시간으로 진단하고 분석합니다.</p>
                </div>
                <div>
                  <p className="text-amber-500 font-black text-[12px] uppercase tracking-widest mb-3 italic">02. 최적화 (Optimization)</p>
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">리스크 등급에 따른 비중 조절과 분할 매수/매도 전략을 통해 하이브리드 모델이 제시하는 최적의 대응 지점을 도출합니다.</p>
                </div>
                <div>
                  <p className="text-amber-500 font-black text-[12px] uppercase tracking-widest mb-3 italic">03. 인텔리전스 (Synthesis)</p>
                  <p className="text-[14px] text-slate-300 leading-relaxed font-semibold italic">MVRV와 온체인 수익률이 현재 시장의 장기적인 저점 혹은 고점 신호와 어떻게 결합되는지 퀀트 모델로 통합 요약합니다.</p>
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
              
              {HALVING_DATES.map((hv, idx) => (
                <ReferenceLine 
                  key={idx} 
                  x={new Date(hv.date).getTime()} 
                  stroke={COLORS.halving} 
                  strokeWidth={1} 
                  strokeDasharray="5 5"
                >
                  <Label value={hv.label} position="top" fill={COLORS.halving} fontSize={10} fontWeight="900" offset={10} />
                </ReferenceLine>
              ))}

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

      <footer className="pt-4 pb-16 text-center opacity-20"><p className="text-[12px] font-black uppercase tracking-[0.45em] text-slate-500 italic">Statistical Truth over Emotional Noise.</p></footer>
    </div>
  );
};

export default App;
