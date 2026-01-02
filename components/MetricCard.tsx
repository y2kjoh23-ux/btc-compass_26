
import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, subValue }) => {
  return (
    <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 p-6 rounded-2xl shadow-xl text-left">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{label}</p>
      <p className="text-3xl font-black text-white italic mono tracking-tighter mb-1">{value}</p>
      <p className="text-[10px] font-bold text-slate-600 uppercase italic tracking-tighter">{subValue}</p>
    </div>
  );
};

export default MetricCard;
