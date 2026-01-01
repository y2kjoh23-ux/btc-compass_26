
import React, { useState, useEffect, useMemo } from 'react';
import { fetchMarketData } from './services/dataService';
import { getModelValues, getDynamicSigma, getDaysSinceGenesis } from './services/modelEngine';
import { MarketData, MarketStatus } from './types';
import MetricCard from './components/MetricCard';
import StageCard from './components/StageCard';
import { STAGES, CHART_START_DATE } from './constants';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line
} from 'recharts';

// 선명한 네온 계열 색상 (중간톤 그레이 배경에서 가장 잘 보이는 값으로 미세 조정)
const COLORS = {
  upper: '#ff2d55', // 네온 마젠타
  fair: '#d97706',  // 진한 옐로우/오렌지 (배경 대비 가독성 강화)
  lower: '#047857', // 진한 에메랄드 (배경 대비 가독성 강화)
  price: '#1d4ed8'  // 진한 블루 (배경 대비 가독성 강화)
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dateStr = new Date(label).toISOString().split('T')[0];
    const sortedItems = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
    return (
      <div className="bg-white/95 backdrop-blur-md border border-slate-300 p-3 rounded-xl shadow-2xl text-slate-800 min-w-[180px]">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 border-b border-slate-200 pb-1.5 mono">
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
                  <span className="text-[10px] font-bold text-slate-600">{item.name}</span>
                </div>
                <span className="text-[11px] font-black mono text-slate-900">
                  {item.value ? `$${Math.round(item.value).toLocaleString()}` : 'PREDICT'}
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
    const deviationPercent = ((data.currentPrice / model.weighted) - 1);
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
    const lastTimestamp = historyPoints.length > 0 ? historyPoints[historyPoints.length - 1].timestamp : Date.now();
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
    const targets = [3, 5, 7, 10, 15];
    const now = new Date();
    return targets.map(years => {
      const targetDate = new Date();
      targetDate.setFullYear(now.getFullYear() + years);
      const m = getModelValues(targetDate);
      const days = getDaysSinceGenesis(targetDate);
      const sigma = getDynamicSigma(days);
      const cagr = (Math.pow(m.weighted / data.currentPrice, 1 / years) - 1) * 100;
      let status = "Stable Growth";
      if (sigma < 0.46) status = "Max Convergence";
      else if (sigma < 0.49) status = "Healthy Decay";
      return { years, dateLabel: targetDate.getFullYear(), fair: m.weighted, upper: m.upper, lower: m.lower, cagr, sigma, status };
    });
  }, [data]);

  if (loading || !data || !stats) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-[10px] font-black tracking-widest text-amber-500 uppercase">Synchronizing Quant Engine...</p>
      </div>
    );
  }

  const modelDeviationKrw = (data.currentPrice - stats.model.weighted) * data.usdKrw;

  const getStatusStyle = () => {
    if (stats.status === MarketStatus.ACCUMULATE) return { accent: 'text-emerald-400', bg: 'from-emerald-950/20', border: 'border-emerald-500/20', label: 'ACCUMULATE (적극 매수)' };
    if (stats.status === MarketStatus.SELL) return { accent: 'text-rose-400', bg: 'from-rose-950/20', border: 'border-rose-500/20', label: 'DISTRIBUTION (수익 실현)' };
    return { accent: 'text-amber-400', bg: 'from-slate-900/40', border: 'border-white/5', label: 'NEUTRAL (중립/관망)' };
  };

  const style = getStatusStyle();

  const renderKrw = (usd: number) => (
    <p className="text-[10px] text-slate-500 font-bold opacity-70 mt-0.5 mono">
      ₩{Math.round(usd * data.usdKrw).toLocaleString()}
    </p>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans">
      {/* HEADER */}
      <header className="max-w-screen-2xl mx-auto px-4 md:px-8 py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5">
        <div className="text-left">
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tighter italic uppercase">BIT COMPASS <span className="text-amber-500">PRO</span></h1>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">Maturity Volatility Decay Model v9.2</p>
        </div>
        <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
          <div className="text-right px-2">
            <p className="text-[8px] font-black text-slate-500 uppercase mb-0.5">원화 환율</p>
            <p className="text-xs font-black text-white mono italic">₩ {data.usdKrw.toLocaleString()}</p>
          </div>
          <button onClick={init} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 md:px-8 mt-6 pb-20">
        {/* HERO SECTION */}
        <section className={`relative rounded-3xl p-6 md:p-8 mb-6 border ${style.border} bg-gradient-to-br ${style.bg} to-slate-950 shadow-2xl overflow-hidden`}>
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            {/* PRICE & DEVIATION */}
            <div className="lg:col-span-5 space-y-6 text-left">
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-full border border-white/5 w-fit">
                   <div className={`w-1.5 h-1.5 rounded-full ${style.accent.replace('text', 'bg')} animate-pulse`}></div>
                   <span className="text-[9px] font-black uppercase tracking-wider text-slate-300">{style.label}</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter italic mono">
                  ${data.currentPrice.toLocaleString()}
                </h2>
                <p className="text-xl text-slate-400 font-light italic">₩{Math.round(data.currentPrice * data.usdKrw).toLocaleString()}</p>
              </div>

              <div className="p-4 bg-slate-900/60 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">모델 이격가 (Market - Fair)</span>
                  <span className={`text-[12px] font-black mono italic ${modelDeviationKrw <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ₩{Math.round(Math.abs(modelDeviationKrw)).toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-3">
                  <div className={`h-full ${style.accent.replace('text', 'bg')} opacity-50`} style={{ width: `${stats.riskPercent}%` }}></div>
                </div>
              </div>
            </div>

            {/* EXPERT GUIDE */}
            <div className="lg:col-span-7">
              <div className="bg-white/5 backdrop-blur-md p-6 md:p-8 rounded-2xl border border-white/10 text-left space-y-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <span className={`text-2xl ${style.accent} font-serif`}>❝</span>
                  <h3 className="text-md font-black text-white uppercase italic tracking-tighter">퀀트 통합 전략 가이드</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-amber-500 font-black text-[10px] uppercase tracking-widest">01. 시장 국면 해설</p>
                    <p className="text-[13px] text-slate-300 leading-relaxed">
                      현재 비트코인은 모델 적정가 대비 <span className="text-white font-bold">{Math.abs(stats.deviationPercent).toFixed(1)}% {stats.deviationPercent > 0 ? '고평가' : '저평가'}</span> 상태입니다. MVRV Z-Score는 {stats.mvrvEst.toFixed(2)}로 {stats.status === MarketStatus.ACCUMULATE ? '바닥권 매집' : stats.status === MarketStatus.SELL ? '상단 과열' : '추세 지속'} 구간을 시사합니다.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-amber-500 font-black text-[10px] uppercase tracking-widest">02. 성향별 액션 플랜</p>
                    <div className="space-y-2">
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-[11px]">
                        <p className="text-slate-500 font-black mb-1 uppercase">SHORT-TERM</p>
                        <p className="text-slate-300">공포탐욕지수 {data.fngValue}를 기준으로 단기 과열 시 10% 단위 부분 익절을 고려하십시오.</p>
                      </div>
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-[11px]">
                        <p className="text-slate-500 font-black mb-1 uppercase">LONG-TERM</p>
                        <p className="text-slate-300">이격가(₩{Math.round(Math.abs(modelDeviationKrw)).toLocaleString()} ) 기반으로 수량을 늘리거나 헤징을 준비하십시오.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* METRICS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <MetricCard label="OSCILLATOR (이격률)" value={`${stats.deviationPercent > 0 ? '+' : ''}${stats.deviationPercent.toFixed(1)}`} subValue="적정가 대비 괴리율" />
          <MetricCard label="SENTIMENT (심리지수)" value={data.fngValue} subValue="Fear & Greed Index" />
          <MetricCard label="MVRV Z-SCORE (온체인)" value={stats.mvrvEst.toFixed(2)} subValue="실현 가치 기반 고점 탐지" />
        </div>

        {/* STAGES GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <StageCard title="이격률 상세" stages={STAGES.OSCILLATOR} currentVal={stats.oscillator} />
          <StageCard title="심리 지표" stages={STAGES.FNG} currentVal={data.fngValue} />
          <StageCard title="온체인 지표" stages={STAGES.MVRV} currentVal={stats.mvrvEst} />
        </div>

        {/* CHART SECTION - 배경 slate-300(커스텀톤) 적용 및 인덱스 제거 유지 */}
        <section className="bg-slate-300 p-4 md:p-6 rounded-3xl border border-slate-400 shadow-2xl mb-10 relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
            <div className="text-left">
              <h3 className="text-lg font-black text-slate-900 tracking-tighter uppercase italic">Price Convergence Path</h3>
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">Maturity Adjusted Logarithmic Power Law</p>
            </div>
            <div className="flex flex-wrap gap-4 text-[8px] font-black uppercase tracking-widest mono">
               <div className="flex items-center gap-1.5" style={{ color: COLORS.price }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.price }}></span> 시장가</div>
               <div className="flex items-center gap-1.5 text-amber-800"><span className="w-1.5 h-1.5 rounded-full bg-amber-800"></span> 적정가</div>
               <div className="flex items-center gap-1.5" style={{ color: COLORS.upper }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.upper }}></span> 상단가</div>
               <div className="flex items-center gap-1.5" style={{ color: COLORS.lower }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.lower }}></span> 하단가</div>
            </div>
          </div>

          <div className="h-[400px] md:h-[600px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                {/* 배경이 더 짙어졌으므로 그리드 색상을 더 진하게(slate-400) 조정하여 시인성 확보 */}
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" />
                <XAxis 
                  dataKey="timestamp" 
                  type="number"
                  domain={[new Date('2017-07-01').getTime(), 'dataMax']}
                  hide={true} 
                />
                <YAxis 
                  type="number" domain={[2000, 300000]} scale="log" 
                  hide={true} 
                />
                <Tooltip content={<CustomTooltip />} cursor={{stroke: '#64748b'}} />
                {/* 밴드 라인 고유 색상 적용 */}
                <Line name="상단 밴드" dataKey="upper" stroke={COLORS.upper} strokeWidth={1.8} dot={false} strokeDasharray="4 4" />
                <Line name="하단 밴드" dataKey="lower" stroke={COLORS.lower} strokeWidth={1.8} dot={false} strokeDasharray="4 4" />
                <Line name="적정 가치" dataKey="fair" stroke={COLORS.fair} strokeWidth={2.2} dot={false} opacity={1} />
                <Line name="시장 가격" dataKey="price" stroke={COLORS.price} strokeWidth={3.5} dot={false} connectNulls={true} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* MODEL PRICE MATRIX */}
        <section className="bg-slate-900/40 rounded-3xl border border-white/5 overflow-hidden mb-10">
          <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
            <h4 className="text-[10px] font-black tracking-widest text-amber-500 uppercase italic">HYBRID 멱법칙 예측</h4>
            <span className="text-[8px] font-bold text-slate-600 uppercase italic">Spot Reference</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px] text-[12px]">
              <thead className="bg-black/20 text-slate-500 font-black uppercase text-[9px] italic">
                <tr>
                  <th className="px-6 py-4 tracking-widest">Logic Engine</th>
                  <th className="px-6 py-4 tracking-widest" style={{ color: COLORS.upper }}>Upper Resistance</th>
                  <th className="px-6 py-4 tracking-widest" style={{ color: COLORS.fair }}>Fair Value Center</th>
                  <th className="px-6 py-4 tracking-widest" style={{ color: COLORS.lower }}>Lower Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  { name: 'HYBRID TOTAL', val: stats.model.weighted, u: stats.model.upper, l: stats.model.lower, active: true },
                  { name: 'DECAYING SLOPE', val: stats.model.decaying, u: stats.model.decaying * Math.exp(0.5), l: stats.model.decaying * Math.exp(-0.5) },
                  { name: 'CYCLE WAVE', val: stats.model.cycle, u: stats.model.cycle * Math.exp(0.5), l: stats.model.cycle * Math.exp(-0.5) },
                  { name: 'STANDARD LAW', val: stats.model.standard, u: stats.model.standard * Math.exp(0.5), l: stats.model.standard * Math.exp(-0.5) },
                ].map((row, i) => (
                  <tr key={i} className={`${row.active ? 'bg-amber-500/[0.03]' : ''} hover:bg-white/[0.02]`}>
                    <td className="px-6 py-5"><span className={`font-black italic ${row.active ? 'text-amber-400' : 'text-slate-400'}`}>{row.name}</span></td>
                    <td className="px-6 py-5">
                      <p className="mono font-bold italic" style={{ color: COLORS.upper }}>${Math.round(row.u).toLocaleString()}</p>
                      {renderKrw(row.u)}
                    </td>
                    <td className="px-6 py-5">
                      <p className={`mono font-black italic ${row.active ? 'text-xl' : 'text-md'}`} style={{ color: COLORS.fair }}>${Math.round(row.val).toLocaleString()}</p>
                      {renderKrw(row.val)}
                    </td>
                    <td className="px-6 py-5">
                      <p className="mono font-bold italic" style={{ color: COLORS.lower }}>${Math.round(row.l).toLocaleString()}</p>
                      {renderKrw(row.l)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* PROJECTION MATRIX */}
        <section className="bg-slate-900/40 rounded-3xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 bg-white/5 border-b border-white/5 text-left">
            <h4 className="text-[10px] font-black tracking-widest text-white uppercase italic">장기 예측가</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px] text-[12px]">
              <thead className="bg-black/20 text-slate-500 font-black uppercase text-[9px] italic">
                <tr>
                  <th className="px-8 py-4">Timeframe</th>
                  <th className="px-8 py-4">Hybrid Fair Price</th>
                  <th className="px-8 py-4">Growth Rate (CAGR)</th>
                  <th className="px-8 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {longTermPredictions.map((pred, i) => (
                  <tr key={i} className="hover:bg-white/[0.01]">
                    <td className="px-8 py-5">
                      <p className="text-lg font-black text-white italic tracking-tighter">{pred.years}Y <span className="text-slate-600 text-[10px] font-bold">({pred.dateLabel})</span></p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-lg font-black text-amber-400 mono italic">${Math.round(pred.fair).toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500 font-bold mono">₩{Math.round(pred.fair * data.usdKrw).toLocaleString()}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-lg font-black text-white mono italic">+{pred.cagr.toFixed(1)}% <span className="text-[9px] text-slate-600 font-bold uppercase">/ Year</span></p>
                    </td>
                    <td className="px-8 py-5 text-left">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_blue]"></div>
                        <span className="text-[10px] font-black text-slate-400 uppercase italic tracking-tighter">{pred.status}</span>
                      </div>
                      <p className="text-[8px] text-slate-600 font-bold mt-1">VOLATILITY DECAY Σ: {pred.sigma.toFixed(3)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="py-12 text-center opacity-30">
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-500 px-8">Mathematics is the only objective compass in financial markets.</p>
      </footer>
    </div>
  );
};

export default App;
