
import React from 'react';

interface Stage {
  threshold: number;
  label: string;
}

interface StageCardProps {
  title: string;
  stages: Stage[];
  currentVal: number;
}

const StageCard: React.FC<StageCardProps> = ({ title, stages, currentVal }) => {
  // threshold가 높은 순서대로 stages가 정렬되어 있으므로 첫 번째로 만족하는 것을 찾음
  const activeIndex = stages.findIndex(stage => currentVal >= stage.threshold);

  return (
    <div className="bg-[#0f172a]/40 p-8 rounded-[2rem] border border-slate-800 shadow-xl">
      <div className="mb-6 text-slate-500 font-black text-[11px] uppercase tracking-widest border-l-2 border-amber-500 pl-4 italic text-left">
        {title} 상세 기준
      </div>
      <div className="space-y-2 text-left">
        {stages.map((stage, i) => {
          const isActive = i === activeIndex;
          return (
            <div 
              key={i}
              className={`px-5 py-3 rounded-xl text-[12px] transition-all duration-300 flex justify-between items-center border ${
                isActive 
                  ? 'bg-amber-500/15 border-amber-500/60 text-amber-400 font-black scale-[1.03] shadow-[0_0_20px_rgba(245,158,11,0.1)]' 
                  : 'text-slate-400 border-white/10 font-bold bg-white/5 opacity-80 hover:opacity-100 hover:bg-white/10 transition-all'
              }`}
            >
              <span className="tracking-tight">{stage.label}</span>
              {isActive && (
                <div className="flex gap-1">
                  <span className="text-[10px] font-black uppercase tracking-tighter">현재 상태</span>
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse self-center"></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StageCard;
