
import React, { useState, useEffect, useMemo } from 'react';
import { fetchMarketData } from './services/dataService';
import { getModelValues, getDynamicSigma, getDaysSinceGenesis } from './services/modelEngine';
import { MarketData, MarketStatus } from './types';
import MetricCard from './components/MetricCard';
import StageCard from './components/StageCard';
import { STAGES, CHART_START_DATE } from './constants';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart, Line
} from 'recharts';

const COLORS = {
  upper: '#fb7185', // rose-400
  fair: '#fbbf24',  // amber-400
  lower: '#34d399', // emerald-400
  price: '#22d3ee'  // cyan-400 (Neon Blue)
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dateStr = new Date(label).toISOString().split('T')[0];
    const sortedItems = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
    return (
      <div className="bg-[#020617]/95 backdrop-blur-xl border border-slate-700/50 p-5 rounded-2xl shadow-2xl text-white min-w-[240px]">
        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-3 font-sans italic">
          {dateStr} QUANT DATA
        </p>
        <div className="space-y-3.5">
          {sortedItems.map((item, index) => {
            let markerColor = item.color;
            if (item.name === "상단 밴드") markerColor = COLORS.upper;
            if (item.name === "적정 가치") markerColor = COLORS.fair;
            if (item.name === "하단 밴드") markerColor = COLORS.lower;
            if (item.name === "시장 가격") markerColor = COLORS.price;

            return (
              <div key={index} className="flex justify-between items-center group">
                <div className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: markerColor, backgroundColor: markerColor }}></div>
                  <span className="text-[11px] font-bold text-slate-300 group-hover:text-white transition-colors">{item.name}</span>
                </div>
                <span className="text-[13px] font-black mono text-white italic">
                  {item.value ? `$${Math.round(item.value).toLocaleString()}` : <span className="text-slate-600 text-[10px]">PREDICT</span>}
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
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);

  const init = async () => {
    setLoading(true);
    const result = await fetchMarketData();
    setData(result);
    setLoading(false);
  };

  useEffect(() => { init(); }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const model = getModelValues(new Date());
    const oscillator = data.currentPrice > 0 ? Math.log(data.currentPrice / model.weighted) : 0;
    const deviationPercent = ((data.currentPrice / model.weighted) - 1) * 100;
    const priceRisk = Math.max(0, Math.min(100, ((oscillator + 0.5) / 1.0) * 100));
    const fngRisk = data.fngValue;
    const mvrvEst = (oscillator * 6.5) + 2.5;
    const mvrvRisk = Math.max(0, Math.min(100, (mvrvEst / 6) * 100));
    const riskPercent = (priceRisk * 0.7) + (fngRisk * 0.15) + (mvrvRisk * 0.15);

    let status = MarketStatus.STABLE;
    if (riskPercent < 35) status = MarketStatus.ACCUMULATE;
    else if (riskPercent > 65) status = MarketStatus.SELL;

    return { model, oscillator, deviationPercent, mvrvEst, status, riskPercent };
  }, [data]);

  const chartData = useMemo(() => {
    if (!data || !data.history) return [];
    const historyPoints = data.history.filter(h => new Date(h.date) >= CHART_START_DATE).map(h => {
      const d = new Date(h.date);
      const m = getModelValues(d);
      return { timestamp: d.getTime(), price: h.price, fair: m.weighted, upper: m.upper, lower: m.lower };
    });
    if (historyPoints.length === 0) return [];
    const lastTimestamp = historyPoints[historyPoints.length - 1].timestamp;
    const predictions = [];
    const endDate = new Date('2026-12-31').getTime();
    let currentTs = lastTimestamp + (7 * 24 * 60 * 60 * 1000);
    while (currentTs <= endDate) {
      const d = new Date(currentTs);
      const m = getModelValues(d);
      predictions.push({ timestamp: currentTs, price: null, fair: m.weighted, upper: m.upper, lower: m.lower });
      currentTs += (7 * 24 * 60 * 60 * 1000);
    }
    return [...historyPoints, ...predictions];
  }, [data]);

  const longTermPredictions = useMemo(() => {
    if (!data) return [];
    const targets = [3, 5, 7, 10, 15, 20];
    const now = new Date();
    return targets.map(years => {
      const targetDate = new Date();
      targetDate.setFullYear(now.getFullYear() + years);
      const m = getModelValues(targetDate);
      const days = getDaysSinceGenesis(targetDate);
      const sigma = getDynamicSigma(days);
      const cagr = (Math.pow(m.weighted / data.currentPrice, 1 / years) - 1) * 100;
      let status = "Early Mature";
      if (sigma < 0.46) status = "Deep Converged";
      else if (sigma < 0.48) status = "Stable Mature";
      else if (sigma < 0.495) status = "Decay Active";
      return { years, dateLabel: targetDate.getFullYear(), fair: m.weighted, upper: m.upper, lower: m.lower, cagr, sigma, status };
    });
  }, [data]);

  if (loading || !data || !stats) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] text-white">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 border-2 border-amber-500/10 rounded-full"></div>
          <div className="absolute inset-0 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="font-black tracking-[0.3em] text-[11px] text-amber-500 uppercase italic">퀀트 엔진 동기화 중...</p>
      </div>
    );
  }

  const modelDeviationKrw = (stats.model.weighted - data.currentPrice) * data.usdKrw;

  const getStatusStyle = () => {
    if (stats.status === MarketStatus.ACCUMULATE) return { accent: 'text-emerald-400', bg: 'from-emerald-950/40', border: 'border-emerald-500/30', label: '적극적 매수 권장 구간' };
    if (stats.status === MarketStatus.SELL) return { accent: 'text-rose-400', bg: 'from-rose-950/40', border: 'border-rose-500/30', label: '수익 확정 및 위험 관리' };
    return { accent: 'text-amber-400', bg: 'from-slate-900/60', border: 'border-slate-800', label: '관망 및 안정 운용 구간' };
  };

  const style = getStatusStyle();

  return (
    <div className="min-h-screen bg-[#020617] pb-32 text-slate-300">
      <header className="max-w-screen-2xl mx-auto px-8 pt-12 pb-8 flex flex-col md:flex-row justify-between items-end border-b border-slate-900 gap-8">
        <div className="space-y-2 text-left w-full md:w-auto font-sans">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic font-sans">BIT <span className="text-amber-500 font-sans">COMPASS</span> PRO</h1>
            <div className="h-6 w-px bg-slate-800 mx-2"></div>
            <span className="px-2.5 py-1 bg-slate-900 text-[10px] font-black text-slate-500 tracking-widest uppercase border border-slate-800 rounded">v8.9 MATURE</span>
          </div>
          <p className="text-[11px] font-bold tracking-tight text-slate-500 italic">Maturity-Adjusted Volatility Decay Active</p>
        </div>
        <div className="flex items-stretch gap-4 bg-slate-950 p-2 rounded-2xl border border-slate-900 shadow-2xl">
          <div className="px-5 py-3 border-r border-slate-900 text-right">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Exchange Rate (USD/KRW)</p>
            <p className="mono text-white font-black text-base italic">{data.usdKrw.toLocaleString()} KRW</p>
          </div>
          <button onClick={init} className="px-5 group flex items-center justify-center hover:bg-slate-900 transition-all rounded-xl">
            <svg className="w-5 h-5 text-slate-600 group-hover:text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-8 mt-12">
        {/* 상단 메인 대시보드 */}
        <section className={`relative rounded-[3rem] p-12 md:p-16 mb-16 border ${style.border} bg-gradient-to-br ${style.bg} to-[#020617] overflow-hidden shadow-2xl`}>
          <div className="relative z-10 grid lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-5 flex flex-col justify-between text-left space-y-12">
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-black/40 w-fit px-5 py-2.5 rounded-full border border-white/5 backdrop-blur-md">
                   <div className={`w-2 h-2 rounded-full ${style.accent.replace('text', 'bg')} animate-pulse`}></div>
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-sans">{style.label}</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter italic font-sans leading-none">
                  $ {data.currentPrice.toLocaleString()}
                </h2>
                <div className="flex items-baseline gap-3 text-slate-400 italic font-sans">
                  <span className="text-2xl font-light">₩ {Math.round(data.currentPrice * data.usdKrw).toLocaleString()}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 font-sans">이격가 (적정가 - 시장가)</span>
                    <span className={`text-[15px] font-black mono italic ${modelDeviationKrw >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ₩ {Math.round(modelDeviationKrw).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-white/5 shadow-inner">
                <div className="flex justify-between items-center mb-8">
                  <div className="space-y-1">
                    <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest italic font-sans">종합 리스크 인덱스</h4>
                    <p className="text-[9px] text-slate-600 font-bold uppercase italic font-sans tracking-tighter">MATURITY INDEX v8.9</p>
                  </div>
                  <div className="px-4 py-2 bg-white/10 rounded-xl text-[14px] font-black text-amber-500 border border-amber-500/20 italic font-sans">
                    RISK: {Math.round(stats.riskPercent)}%
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="flex justify-between text-[9px] font-black uppercase tracking-[0.2em] px-1 italic text-slate-500">
                    <span className="text-emerald-500/80 tracking-widest">Safety Buy</span>
                    <span className="text-rose-500/80 tracking-widest">Warning Sell</span>
                  </div>
                  <div className="relative h-6 bg-slate-900 rounded-full border border-white/5 p-1.5">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-rose-500 opacity-20"></div>
                    <div className="relative w-full h-full">
                      <div className="absolute top-0 w-2.5 h-full bg-white shadow-[0_0_30px_white] transition-all duration-1000 ease-out z-10 rounded-full"
                           style={{ left: `${stats.riskPercent}%`, transform: 'translateX(-50%)' }}>
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] border-t-white"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-7">
              <div className="bg-white/5 backdrop-blur-md rounded-[2.5rem] border border-white/10 p-10 md:p-14 space-y-8 font-sans h-full flex flex-col justify-center text-left">
                <div className="flex items-center gap-6 border-b border-white/10 pb-6">
                  <div className={`text-4xl ${style.accent} font-serif`}>❝</div>
                  <h3 className="text-xl font-black text-white tracking-tighter italic">전문가 통합 분석 가이드</h3>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-amber-500 font-black text-[14px] tracking-tight italic uppercase">1. 시장 국면 해설 (초보자용)</p>
                    <p className="text-slate-300 text-[14px] leading-relaxed">
                      현재 비트코인은 적정 가치 대비 <span className="text-white font-bold">{Math.abs(stats.deviationPercent).toFixed(1)}% {stats.deviationPercent > 0 ? '고평가' : '저평가'}</span>된 상태입니다. 
                      심리 지수({data.fngValue})와 온체인 데이터({stats.mvrvEst.toFixed(2)})를 종합할 때, 지금은 {stats.status === MarketStatus.ACCUMULATE ? '역사적인 매수 기회' : stats.status === MarketStatus.SELL ? '일부 수익 실현' : '기존 물량 유지'}가 권장되는 시점입니다.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-amber-500 font-black text-[14px] tracking-tight italic uppercase">2. 성향별 투자 전략</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                        <p className="text-[11px] font-black text-slate-500 mb-1">단기 / 소액 투자자</p>
                        <p className="text-[13px] text-slate-200">심리 지수 과열 시점에 짧은 수익 확정을 추천하며, 적정가 이하에서만 진입하십시오.</p>
                      </div>
                      <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                        <p className="text-[11px] font-black text-slate-500 mb-1">장기 / 거액 투자자</p>
                        <p className="text-[13px] text-slate-200">이격가(₩{Math.round(modelDeviationKrw).toLocaleString()})를 기준으로 분할 매수 범위를 설정하십시오.</p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/5">
                    <p className="text-slate-400 text-[13px] leading-relaxed italic font-bold">
                      "변동성이 줄어드는 성숙 자산 단계에서는 '시간'이 가장 강력한 수익 엔진입니다."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3대 주요 수치 지표 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <MetricCard label="모델 이격률 (Oscillator)" value={`${stats.deviationPercent > 0 ? '+' : ''}${stats.deviationPercent.toFixed(1)}%`} subValue="적정가와의 실시간 이격 정도" />
          <MetricCard label="공포 탐욕 지수 (Sentiment)" value={data.fngValue} subValue="시장 참여자들의 심리적 과열도" />
          <MetricCard label="MVRV Z-Score (On-chain)" value={stats.mvrvEst.toFixed(2)} subValue="온체인 기반 저점/고점 탐지" />
        </div>

        {/* 판정 상세 기준 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12 font-sans">
          <StageCard title="이격률 판정" stages={STAGES.OSCILLATOR} currentVal={stats.oscillator} />
          <StageCard title="심리 지수 판정" stages={STAGES.FNG} currentVal={data.fngValue} />
          <StageCard title="온체인 판정" stages={STAGES.MVRV} currentVal={stats.mvrvEst} />
        </div>

        {/* 차트 영역 - 여백 최소화 및 밴드 가시성 개선 */}
        <section className="bg-slate-950 p-6 md:p-8 rounded-[3rem] border border-slate-900 shadow-3xl mb-20 relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-8 text-left">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-white tracking-tighter uppercase italic font-sans">CONVERGING PRICE PATH (2017-2026)</h3>
              <p className="text-slate-600 text-[9px] font-bold uppercase tracking-widest italic font-sans text-amber-500/80">Decay Mode Active // Volatility Dampening Sync</p>
            </div>
            <div className="flex flex-wrap gap-4 text-[9px] font-black uppercase tracking-widest italic font-sans">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-lg border border-rose-500/20" style={{ color: COLORS.price }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.price }}></span> 시장 가격</div>
               <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span> 수렴 밴드</div>
            </div>
          </div>

          <div className="h-[600px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: -5, left: -45, bottom: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis 
                  dataKey="timestamp" 
                  type="number"
                  domain={[new Date('2017-07-01').getTime(), 'dataMax']}
                  tick={{fontSize: 9, fill: '#475569', fontWeight: 900}} 
                  tickFormatter={(ts) => new Date(ts).getFullYear().toString()}
                  ticks={[
                    new Date('2018-01-01').getTime(),
                    new Date('2019-01-01').getTime(),
                    new Date('2020-01-01').getTime(),
                    new Date('2021-01-01').getTime(),
                    new Date('2022-01-01').getTime(),
                    new Date('2023-01-01').getTime(),
                    new Date('2024-01-01').getTime(),
                    new Date('2025-01-01').getTime(),
                    new Date('2026-01-01').getTime(),
                  ]}
                  axisLine={{ stroke: '#1e293b' }} 
                  tickLine={false} 
                  dy={5}
                />
                <YAxis 
                  type="number" 
                  domain={[2000, 300000]} 
                  scale="log" 
                  orientation="right" 
                  tick={{fontSize: 9, fill: '#475569', fontWeight: 900}} 
                  tickFormatter={v => `$${Math.round(v/1000)}K`} 
                  axisLine={false} 
                  tickLine={false} 
                  dx={5}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area name="상단 밴드" dataKey="upper" stroke="none" fill={COLORS.upper} fillOpacity={0.18} />
                <Area name="하단 밴드" dataKey="lower" stroke="none" fill="#020617" fillOpacity={1} />
                <Line name="적정 가치" dataKey="fair" stroke={COLORS.fair} strokeWidth={2} dot={false} strokeDasharray="5 5" opacity={0.6} />
                <Line name="시장 가격" dataKey="price" stroke={COLORS.price} strokeWidth={2.5} dot={false} connectNulls={true} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 멱법칙 상세 매트릭스 테이블 */}
        <section className="mb-20 text-left">
          <div className="bg-slate-950/50 rounded-[3.5rem] overflow-hidden border border-slate-800 shadow-2xl">
            <div className="px-12 py-10 border-b border-slate-800 bg-black/40 flex justify-between items-center">
              <h4 className="text-[11px] font-black tracking-[0.2em] text-amber-500 uppercase italic font-sans">QUANT MODEL PRICE MATRIX (USD)</h4>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest italic font-sans">Convergence Logic Applied</span>
            </div>
            <div className="overflow-x-auto font-sans">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-black/20 border-b border-slate-800">
                    <th className="px-12 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Engine Model</th>
                    <th className="px-12 py-6 text-[10px] font-black uppercase tracking-widest italic" style={{ color: COLORS.upper }}>Resistance (Upper)</th>
                    <th className="px-12 py-6 text-[10px] font-black uppercase tracking-widest italic" style={{ color: COLORS.fair }}>Fair Value (Center)</th>
                    <th className="px-12 py-6 text-[10px] font-black uppercase tracking-widest italic" style={{ color: COLORS.lower }}>Support (Lower)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  <tr className="bg-amber-500/[0.05]">
                    <td className="px-12 py-8"><p className="text-[14px] font-black text-amber-400 italic">COMPASS HYBRID (통합 가중)</p></td>
                    <td className="px-12 py-8 mono font-bold italic" style={{ color: COLORS.upper }}>${Math.round(stats.model.upper).toLocaleString()}</td>
                    <td className="px-12 py-8 mono font-black text-2xl italic" style={{ color: COLORS.fair }}>${Math.round(stats.model.weighted).toLocaleString()}</td>
                    <td className="px-12 py-8 mono font-bold italic" style={{ color: COLORS.lower }}>${Math.round(stats.model.lower).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="px-12 py-7"><p className="text-[13px] font-bold text-slate-400 italic">DECAYING SLOPE (가변기울기)</p></td>
                    <td className="px-12 py-7 mono text-slate-300 italic">${Math.round(stats.model.decaying * (stats.model.upper/stats.model.weighted)).toLocaleString()}</td>
                    <td className="px-12 py-7 mono font-black text-slate-200 italic">${Math.round(stats.model.decaying).toLocaleString()}</td>
                    <td className="px-12 py-7 mono text-slate-300 italic">${Math.round(stats.model.decaying * (stats.model.lower/stats.model.weighted)).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="px-12 py-7"><p className="text-[13px] font-bold text-slate-400 italic">CYCLE WAVES (순환주기)</p></td>
                    <td className="px-12 py-7 mono text-slate-300 italic">${Math.round(stats.model.cycle * (stats.model.upper/stats.model.weighted)).toLocaleString()}</td>
                    <td className="px-12 py-7 mono font-black text-slate-200 italic">${Math.round(stats.model.cycle).toLocaleString()}</td>
                    <td className="px-12 py-7 mono text-slate-300 italic">${Math.round(stats.model.cycle * (stats.model.lower/stats.model.weighted)).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="px-12 py-7"><p className="text-[13px] font-bold text-slate-400 italic">STANDARD POWER-LAW (표준)</p></td>
                    <td className="px-12 py-7 mono text-slate-300 italic">${Math.round(stats.model.standard * (stats.model.upper/stats.model.weighted)).toLocaleString()}</td>
                    <td className="px-12 py-7 mono font-black text-slate-200 italic">${Math.round(stats.model.standard).toLocaleString()}</td>
                    <td className="px-12 py-7 mono text-slate-300 italic">${Math.round(stats.model.standard * (stats.model.lower/stats.model.weighted)).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 장기 예측 매트릭스 섹션 */}
        <section className="mb-24 text-left">
          <div className="bg-[#020617] rounded-[3.5rem] overflow-hidden border border-slate-800 shadow-3xl">
            <div className="px-12 py-10 border-b border-slate-800 bg-slate-950 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h4 className="text-[14px] font-black tracking-[0.2em] text-white uppercase italic font-sans mb-1">LONG-TERM PROJECTION MATRIX</h4>
                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest italic font-sans">Maturity-Adjusted Volatility Decay Hybrid Model</p>
              </div>
              <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                <span className="text-[10px] font-black text-emerald-400 uppercase italic">Hybrid Spot: ${Math.round(stats.model.weighted).toLocaleString()} / ₩{Math.round(stats.model.weighted * data.usdKrw).toLocaleString()}</span>
              </div>
            </div>
            <div className="overflow-x-auto font-sans">
              <table className="w-full text-left min-w-[1000px]">
                <thead>
                  <tr className="bg-black/40 border-b border-slate-800">
                    <th className="px-10 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Period</th>
                    <th className="px-10 py-6 text-[9px] font-black text-white uppercase tracking-widest italic">Target Price (Hybrid Fair)</th>
                    <th className="px-10 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Prediction Range (Converged)</th>
                    <th className="px-10 py-6 text-[9px] font-black text-amber-500 uppercase tracking-widest italic">Expected CAGR</th>
                    <th className="px-10 py-6 text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Decay Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {longTermPredictions.map((pred, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-10 py-8">
                        <div className="space-y-1">
                          <p className="text-xl font-black text-white italic">{pred.years}Y <span className="text-slate-600 text-[12px] font-bold">({pred.dateLabel})</span></p>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col">
                          <p className="text-2xl font-black text-amber-400 mono italic tracking-tighter">${Math.round(pred.fair).toLocaleString()}</p>
                          <p className="text-[13px] font-bold text-slate-500 italic tracking-tighter">₩{Math.round(pred.fair * data.usdKrw).toLocaleString()}</p>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-1">
                          <span className="text-[13px] font-bold mono uppercase" style={{ color: COLORS.upper }}>High: ${Math.round(pred.upper).toLocaleString()}</span>
                          <span className="text-[13px] font-bold mono uppercase" style={{ color: COLORS.lower }}>Low: ${Math.round(pred.lower).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-black text-white mono italic">+{pred.cagr.toFixed(1)}%</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Avg/Year</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                             <span className="text-[11px] font-black text-slate-300 uppercase tracking-tight italic">{pred.status}</span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-500 mono">σ: {pred.sigma.toFixed(3)}</p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="text-center pb-20 font-sans opacity-60">
        <p className="text-[10px] font-bold italic text-slate-500 px-12 leading-relaxed uppercase tracking-widest">
          MATURITY-ADJUSTED POWER-LAW IS THE FUTURE. CONVERGENCE IS DESTINY.
        </p>
      </footer>
    </div>
  );
};

export default App;
