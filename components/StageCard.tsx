
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
  // 내림차순으로 정렬된 stages에서 현재 값이 threshold보다 크거나 같은 첫 번째 단계를 찾음
  // 이를 통해 25, 45, 55 등의 경계값이 하위 구간이 아닌 정확한 해당 구간에 배정됨
  const activeIndex = stages.findIndex(stage => currentVal >= stage.threshold);

  return (
    <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 p-6 rounded-[1.5rem] shadow-xl text-left flex flex-col">
      {/* 지표 제목 및 현재 값 통합 영역 */}
      <div className="mb-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-1.5 h-3.5 bg-amber-500 rounded-full"></div>
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest italic">{title}</h3>
        </div>
        <div className="flex flex-col">
          <span className="text-4xl font-black text-white italic mono tracking-tighter">{displayValue}</span>
          {subLabel && (
            <span className="text-[13px] font-bold text-slate-600 uppercase italic tracking-tighter mt-1">{subLabel}</span>
          )}
        </div>
      </div>

      {/* 단계 리스트 영역 */}
      <div className="grid grid-cols-1 gap-2">
        {stages.map((stage, idx) => {
          const isActive = idx === activeIndex;

          return (
            <div 
              key={idx} 
              className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex justify-between items-center ${
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
