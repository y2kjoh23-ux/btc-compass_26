
import React from 'react';

interface Stage {
  threshold: number;
  label: string;
}

interface StageCardProps {
  title: string;
  stages: Stage[];
  currentVal: number;
  displayValue: string | number; // 통합된 현재 값 표시용
  subLabel: string;             // 현재 값 하단의 설명
}

const StageCard: React.FC<StageCardProps> = ({ title, stages, currentVal, displayValue, subLabel }) => {
  return (
    <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 p-6 rounded-2xl shadow-xl text-left flex flex-col">
      {/* 지표 제목 및 현재 값 통합 영역 */}
      <div className="mb-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-1 h-3 bg-amber-500 rounded-full"></div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">{title}</h3>
        </div>
        <div className="flex flex-col">
          <span className="text-4xl font-black text-white italic mono tracking-tighter">{displayValue}</span>
          {subLabel && (
            <span className="text-[11px] font-bold text-slate-600 uppercase italic tracking-tighter mt-1">{subLabel}</span>
          )}
        </div>
      </div>

      {/* 단계 리스트 영역 */}
      <div className="grid grid-cols-1 gap-1.5">
        {stages.map((stage, idx) => {
          let isActive = false;
          
          if (idx === 0) {
            isActive = currentVal > stage.threshold;
          } else if (idx === stages.length - 1) {
            isActive = currentVal <= stages[idx - 1].threshold;
          } else {
            isActive = currentVal <= stages[idx - 1].threshold && currentVal > stage.threshold;
          }

          return (
            <div 
              key={idx} 
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex justify-between items-center ${
                isActive 
                  ? 'bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.25)]' 
                  : 'text-slate-500 bg-white/5 border border-white/5'
              }`}
            >
              <span>{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StageCard;
