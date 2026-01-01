
import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, subValue }) => {
  return (
    <div className="bg-[#0f172a]/50 border border-slate-800 rounded-[2rem] p-8 transition-all hover:bg-[#0f172a] hover:border-slate-700 group text-left">
      <p className="text-slate-500 font-bold text-[11px] uppercase tracking-widest mb-4 group-hover:text-amber-500 transition-colors italic border-b border-slate-800 pb-2">
        {label}
      </p>
      <p className="text-4xl font-extrabold text-white tracking-tighter mb-2 mono italic">
        {value}
      </p>
      {subValue && (
        <p className="text-[10px] text-slate-500 font-bold tracking-tight uppercase opacity-80 italic">
          {subValue}
        </p>
      )}
    </div>
  );
};

export default MetricCard;
