
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
    <div className="bg-[#0f172a]/40 p-4 md:p-6 rounded-[1.5rem] border border-slate-800 shadow-xl overflow-hidden">
      <div className="mb-4 text-slate-500 font-black text-[9px] md:text-[10px] uppercase tracking-widest border-l-2 border-amber-500 pl-3 italic text-left">
        {title} 상세 기준
      </div>
      <div className="space-y-1.5 text-left">
        {stages.map((stage, i) => {
          const isActive = i === activeIndex;
          return (
            <div 
              key={i}
              className={`px-3 py-1.5 rounded-lg text-[10px] md:text-[11px] transition-all duration-300 flex justify-between items-center border whitespace-nowrap ${
                isActive 
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-black scale-[1.01]' 
                  : 'text-slate-400 border-white/5 font-bold bg-white/5 opacity-60'
              }`}
            >
              <span className="tracking-tight truncate mr-2">{stage.label}</span>
              {isActive && (
                <div className="flex-shrink-0">
                  <div className="w-1 h-1 bg-amber-500 rounded-full animate-pulse"></div>
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
