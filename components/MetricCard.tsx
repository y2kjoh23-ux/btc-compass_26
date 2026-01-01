
import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, subValue }) => {
  return (
    <div className="bg-[#0f172a]/50 border border-slate-800 rounded-[1.5rem] p-5 md:p-6 transition-all hover:bg-[#0f172a] hover:border-slate-700 group text-left">
      <p className="text-slate-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest mb-3 group-hover:text-amber-500 transition-colors italic border-b border-slate-800 pb-1.5">
        {label}
      </p>
      <p className="text-2xl md:text-3xl font-extrabold text-white tracking-tighter mb-1.5 mono italic">
        {value}
      </p>
      {subValue && (
        <p className="text-[9px] text-slate-500 font-bold tracking-tight uppercase opacity-80 italic">
          {subValue}
        </p>
      )}
    </div>
  );
};

export default MetricCard;
