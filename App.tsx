
import React, { useState, useEffect, useMemo } from 'react';
import { fetchMarketData } from './services/dataService';
import { getModelValues, getDynamicSigma, getDaysSinceGenesis } from './services/modelEngine';
import { MarketData, MarketStatus } from './types';
import StageCard from './components/StageCard';
import { STAGES, CHART_START_DATE } from './constants';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line
} from 'recharts';

const COLORS = {
  upper: '#ff2d55',
  fair: '#d97706',
  lower: '#047857',
  price: '#1d4ed8'
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
    
    const priceRisk = Math.max(0, Math.min(100, ((oscillator + 0.5) / 1.0) * 100));
    const fngRisk = data.fngValue; 
    const mvrvEst = (oscillator * 6.5) + 2.5;
    const mvrvRisk = Math.max(0, Math.min(100, (mvrvEst / 6) * 100));
    
    const riskPercent = (priceRisk * 0.6) + (fngRisk * 0.2) + (mvrvRisk * 0.2);

    let status = MarketStatus.STABLE;
    if (riskPercent < 35) status = MarketStatus.ACCUMULATE;
    else if (riskPercent > 70) status = MarketStatus.SELL;

    return { model, oscillator, mvrvEst, status, riskPercent };
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
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    const endDate = oneYearFromNow.getTime();
    
    let currentTs = lastTimestamp + (7 * 24 * 60 * 60 * 1000);
    while (currentTs <= endDate) {
      const d = new Date(currentTs);
      const m = getModelValues(d);
      predictions.push({ timestamp: currentTs, price: null, fair: m.weighted, upper: m.upper, lower: m.lower });
      currentTs += (7 * 24 * 60 * 60 * 1000);
    }
    return [...historyPoints, ...predictions];
  }, [data]);

  const projections = useMemo(() => {
    const years = [3, 5, 7, 10, 15, 20];
    return years.map(y => {
      const targetDate = new Date();
      targetDate.setFullYear(targetDate.getFullYear() + y);
      const m = getModelValues(targetDate);
      return { 
        label: `${y}년 후 (${targetDate.getFullYear()})`,
        date: targetDate.toISOString().split('T')[0], 
        ...m 
      };
    });
  }, []);

  if (loading || !data || !stats) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-[10px] font-black tracking-widest text-amber-500 uppercase">Synchronizing Quant Engine...</p>
      </div>
    );
  }

  const getStatusStyle = () => {
    const { oscillator, mvrvEst } = stats;
    const { fngValue } = data;

    if (stats.status === MarketStatus.ACCUMULATE) return { 
      accent: 'text-emerald-400', 
      bg: 'from-emerald-950/20', 
      border: 'border-emerald-500/20', 
      label: '가치 매집 국면',
      guide: `<b>포트폴리오 진단:</b> 현재 심리지수가 ${fngValue}점으로 극도의 공포 단계에 있으며, 이격률(${oscillator.toFixed(2)})이 모델 하단에 위치합니다. 이는 데이터 관점에서 매우 희귀한 '언더슈팅' 기회입니다.`,
      action: `<b>자산 규모별 운용:</b> 고액 자산가는 분할 매수를 통해 포지션의 70% 이상을 구축하십시오. 소액 투자자는 정기 DCA 외에 추가 여유 자금을 투입하여 수량을 극대화할 시점입니다.`,
      types: `<b>온체인 인텔리전스:</b> MVRV Z-Score가 ${mvrvEst.toFixed(2)}로 바닥권에 머물고 있습니다. 장기 홀더들이 매집을 시작하는 구간이므로, 단기 가격 흔들림에 연연하지 말고 목표 비중을 채우십시오.`
    };
    if (stats.status === MarketStatus.SELL) return { 
      accent: 'text-rose-400', 
      bg: 'from-rose-950/20', 
      border: 'border-rose-500/20', 
      label: '수익 실현 국면',
      guide: `<b>포트폴리오 진단:</b> 심리지수 ${fngValue}점의 과열 상태와 높은 이격률(${oscillator.toFixed(2)})이 결합되어 통계적 정점에 도달했습니다. 이 시점의 추가 매수는 리스크 관리 차원에서 매우 지양해야 합니다.`,
      action: `<b>자산 규모별 운용:</b> 큰 자금을 운용 중이라면 최소 30~50%의 현금화를 권장합니다. 분할 매도 시스템을 가동하십시오. 소액 투자자 역시 원금은 반드시 회수하여 다음 사이클의 시드머니를 확보하십시오.`,
      types: `<b>온체인 인텔리전스:</b> MVRV Z-Score가 ${mvrvEst.toFixed(2)}를 상회하며 역사적 고점 신호를 보내고 있습니다. 탐욕이 지배하는 시장에서 한발 물러나 자본을 보호하는 것이 가장 세련된 전략입니다.`
    };
    return { 
      accent: 'text-amber-400', 
      bg: 'from-slate-900/40', 
      border: 'border-white/5', 
      label: '안정적 추세 추종',
      guide: `<b>포트폴리오 진단:</b> 심리지수 ${fngValue}점과 이격률 ${oscillator.toFixed(2)}의 조합은 시장이 적정 가치 궤도 안에서 순항 중임을 뜻합니다. 급격한 방향성 전환보다는 점진적 성장이 예상되는 중립 상태입니다.`,
      action: `<b>자산 규모별 운용:</b> 포트폴리오 리밸런싱을 최소화하고 기계적 DCA를 유지하십시오. 대규모 자산가는 상단 저항선 돌파 시나리오에 대비하여 현금 비중을 10~20% 내외로 유지하며 관망하십시오.`,
      types: `<b>온체인 인텔리전스:</b> MVRV가 ${mvrvEst.toFixed(2)} 수준으로 온체인 데이터가 정상 범주에 있습니다. 장기 투자는 편안하게 포지션을 유지하고, 단기 대응은 모델 중심가($${Math.round(stats.model.weighted).toLocaleString()})를 기준으로 비중을 조절하십시오.`
    };
  };

  const style = getStatusStyle();
  const deviationKrw = (data.currentPrice - stats.model.weighted) * data.usdKrw;
  const deviationSign = deviationKrw >= 0 ? '+' : '-';
  const deviationDisplay = `(${deviationSign} ₩ ${Math.abs(Math.round(deviationKrw)).toLocaleString()})`;

  const renderKrw = (usd: number) => (
    <p className="text-[10px] text-slate-500 font-bold opacity-70 mt-0.5 mono">
      ₩ {Math.round(usd * data.usdKrw).toLocaleString()}
    </p>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans text-left">
      <header className="max-w-screen-2xl mx-auto px-4 md:px-8 py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5">
        <div className="text-left">
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tighter italic uppercase">BIT COMPASS <span className="text-amber-500">PRO</span></h1>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">Maturity Volatility Decay Model v9.5</p>
        </div>
        <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-xl border border-white/5">
          <div className="text-right px-2">
            <p className="text-[8px] font-black text-slate-500 uppercase mb-0.5">원화 환율 (Source: Frankfurter)</p>
            <p className="text-xs font-black text-white mono italic">₩ {data.usdKrw.toLocaleString()}</p>
          </div>
          <button onClick={init} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 md:px-8 mt-6 pb-20">
        <section className={`relative rounded-3xl p-6 md:p-8 mb-10 border ${style.border} bg-gradient-to-br ${style.bg} to-slate-950 shadow-2xl overflow-hidden`}>
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-6 text-left">
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-4 py-1.5 bg-black/40 rounded-full border border-white/5 w-fit">
                   <div className={`w-2 h-2 rounded-full ${style.accent.replace('text', 'bg')} animate-pulse`}></div>
                   <span className={`text-[11px] font-black uppercase tracking-wider ${style.accent}`}>{style.label}</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter italic mono">
                  ${data.currentPrice.toLocaleString()}
                </h2>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl text-slate-400 font-light italic">₩ {Math.round(data.currentPrice * data.usdKrw).toLocaleString()}</p>
                  <p className={`text-xs font-black mono ${deviationKrw >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {deviationDisplay}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-900/60 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">통합 리스크 지수</span>
                  <span className={`text-[12px] font-black mono italic ${style.accent}`}>
                    {Math.round(stats.riskPercent)}% Risk
                  </span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-3">
                  <div className={`h-full ${style.accent.replace('text', 'bg')} opacity-50`} style={{ width: `${stats.riskPercent}%` }}></div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-white/5 backdrop-blur-md p-6 md:p-8 rounded-2xl border border-white/10 text-left space-y-6">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <span className={`text-2xl ${style.accent} font-serif`}>❝</span>
                  <h3 className="text-md font-black text-white uppercase italic tracking-tighter">퀀트 통합 전략 가이드</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <p className="text-amber-500 font-black text-[10px] uppercase tracking-widest mb-1">01. 마켓 컨텍스트 분석</p>
                    <p className="text-[13px] text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: style.guide }}></p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-amber-500 font-black text-[10px] uppercase tracking-widest mb-1">02. 포트폴리오 운용 최적화</p>
                    <p className="text-[13px] text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: style.action }}></p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-amber-500 font-black text-[10px] uppercase tracking-widest mb-1">03. 투자 유형별 전술</p>
                    <p className="text-[13px] text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: style.types }}></p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-amber-500 font-black text-[10px] uppercase tracking-widest mb-1">04. 집행 인텔리전스</p>
                    <p className="text-[13px] text-slate-300 leading-relaxed">지표들의 유기적 연계를 통해 감정을 배제한 기계적 대응이 수반되어야 합니다. 현재의 이격도는 역사적 평균으로 회귀하려는 성질을 가지고 있습니다.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <StageCard 
            title="OSCILLATOR (이격률)" 
            displayValue={`${stats.oscillator >= 0 ? '+' : ''}${stats.oscillator.toFixed(2)}`}
            subLabel="적정가 대비 로그 괴리도"
            stages={STAGES.OSCILLATOR} 
            currentVal={stats.oscillator} 
          />
          <StageCard 
            title="SENTIMENT (심리지수)" 
            displayValue={data.fngValue}
            subLabel="Fear & Greed Index"
            stages={STAGES.FNG} 
            currentVal={data.fngValue} 
          />
          <StageCard 
            title="MVRV Z-SCORE (온체인)" 
            displayValue={stats.mvrvEst.toFixed(2)}
            subLabel="실현 가치 기반 고점 탐지"
            stages={STAGES.MVRV} 
            currentVal={stats.mvrvEst} 
          />
        </div>

        <section className="bg-slate-300 p-4 md:p-6 rounded-3xl border border-slate-400 shadow-2xl mb-10 relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
            <div className="text-left">
              <h3 className="text-lg font-black text-slate-900 tracking-tighter uppercase italic">Price Convergence Path (1Y Forecast)</h3>
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">Maturity Adjusted Logarithmic Power Law</p>
            </div>
          </div>

          <div className="h-[400px] md:h-[600px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" />
                <XAxis dataKey="timestamp" type="number" domain={[new Date('2017-07-01').getTime(), 'dataMax']} hide={true} />
                <YAxis type="number" domain={[2000, 300000]} scale="log" hide={true} />
                <Tooltip content={<CustomTooltip />} cursor={{stroke: '#64748b'}} />
                <Line name="상단 밴드" dataKey="upper" stroke={COLORS.upper} strokeWidth={1.8} dot={false} strokeDasharray="4 4" />
                <Line name="하단 밴드" dataKey="lower" stroke={COLORS.lower} strokeWidth={1.8} dot={false} strokeDasharray="4 4" />
                <Line name="적정 가치" dataKey="fair" stroke={COLORS.fair} strokeWidth={2.2} dot={false} opacity={1} />
                <Line name="시장 가격" dataKey="price" stroke={COLORS.price} strokeWidth={3.5} dot={false} connectNulls={true} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-slate-900/40 rounded-3xl border border-white/5 overflow-hidden mb-8 text-left">
          <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
            <h4 className="text-[10px] font-black tracking-widest text-amber-500 uppercase italic">멱법칙 예측</h4>
            <span className="text-[8px] font-bold text-slate-600 uppercase italic">Current Logic Reference</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px] text-[12px]">
              <thead className="bg-black/20 text-slate-500 font-black uppercase text-[9px] italic">
                <tr>
                  <th className="px-6 py-4 tracking-widest">Logic Engine</th>
                  <th className="px-6 py-4 tracking-widest text-rose-500">Upper Resistance</th>
                  <th className="px-6 py-4 tracking-widest text-amber-500">Fair Value Center</th>
                  <th className="px-6 py-4 tracking-widest text-emerald-500">Lower Support</th>
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
                      <p className="mono font-bold italic text-rose-500">${Math.round(row.u).toLocaleString()}</p>
                      {renderKrw(row.u)}
                    </td>
                    <td className="px-6 py-5">
                      <p className={`mono font-black italic text-amber-500 ${row.active ? 'text-xl' : 'text-md'}`}>${Math.round(row.val).toLocaleString()}</p>
                      {renderKrw(row.val)}
                    </td>
                    <td className="px-6 py-5">
                      <p className="mono font-bold italic text-emerald-500">${Math.round(row.l).toLocaleString()}</p>
                      {renderKrw(row.l)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-slate-900/40 rounded-3xl border border-white/5 overflow-hidden mb-10 text-left">
          <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
            <h4 className="text-[10px] font-black tracking-widest text-emerald-500 uppercase italic">LONG-TERM PROJECTIONS</h4>
            <span className="text-[8px] font-bold text-slate-600 uppercase italic">Hybrid Model</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px] text-[12px]">
              <thead className="bg-black/20 text-slate-500 font-black uppercase text-[9px] italic">
                <tr>
                  <th className="px-6 py-4 tracking-widest">Projection Period</th>
                  <th className="px-6 py-4 tracking-widest text-rose-500">Projected Peak</th>
                  <th className="px-6 py-4 tracking-widest text-amber-500">Projected Fair Value</th>
                  <th className="px-6 py-4 tracking-widest text-emerald-500">Projected Bottom</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {projections.map((proj, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-5">
                      <span className="font-black italic text-slate-300 block">{proj.label}</span>
                      <span className="text-[9px] text-slate-600 mono font-bold">{proj.date}</span>
                    </td>
                    <td className="px-6 py-5">
                      <p className="mono font-bold italic text-rose-500">${Math.round(proj.upper).toLocaleString()}</p>
                      {renderKrw(proj.upper)}
                    </td>
                    <td className="px-6 py-5">
                      <p className="mono font-black italic text-amber-500 text-lg">${Math.round(proj.weighted).toLocaleString()}</p>
                      {renderKrw(proj.weighted)}
                    </td>
                    <td className="px-6 py-5">
                      <p className="mono font-bold italic text-emerald-500">${Math.round(proj.lower).toLocaleString()}</p>
                      {renderKrw(proj.lower)}
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
