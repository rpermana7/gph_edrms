import React, { useMemo, useState } from 'react';
import { ReservationReport } from '../types/reservation';
import { format, parseISO, differenceInDays, isValid } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  data: ReservationReport[];
}

const parseDbDate = (dateStr: string) => {
  if (!dateStr) return null;
  const [datePart] = dateStr.split(' ');
  const parsed = parseISO(datePart);
  return isValid(parsed) ? parsed : null;
};

export const GuestInsightsModule = ({ data }: Props) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('All');

  const { chartData, availableMonths, tableData } = useMemo(() => {
    const monthSet = new Set<string>();
    
    // Group by SOB -> Month -> { totalLeadTime, count, min, max, buckets }
    const grouped: Record<string, Record<string, any>> = {};
    
    data.forEach(item => {
      const arrival = parseDbDate(item.Arrival);
      const created = parseDbDate(item.CreatedDate);
      
      if (!arrival || !created) return;
      
      const leadTime = differenceInDays(arrival, created);
      if (leadTime < 0) return; // Ignore negative lead times
      
      const monthKey = format(arrival, 'MMM yyyy');
      monthSet.add(monthKey);
      
      const sob = item.SOB || 'Unknown';
      
      if (!grouped[sob]) grouped[sob] = {};
      if (!grouped[sob][monthKey]) {
        grouped[sob][monthKey] = {
          totalLeadTime: 0,
          count: 0,
          min: leadTime,
          max: leadTime,
          buckets: {
            '0-3 Days': 0,
            '4-14 Days': 0,
            '15-30 Days': 0,
            '30+ Days': 0
          }
        };
      }
      
      const stats = grouped[sob][monthKey];
      stats.totalLeadTime += leadTime;
      stats.count += 1;
      if (leadTime < stats.min) stats.min = leadTime;
      if (leadTime > stats.max) stats.max = leadTime;
      
      if (leadTime <= 3) stats.buckets['0-3 Days'] += 1;
      else if (leadTime <= 14) stats.buckets['4-14 Days'] += 1;
      else if (leadTime <= 30) stats.buckets['15-30 Days'] += 1;
      else stats.buckets['30+ Days'] += 1;
    });

    const sortedMonths = Array.from(monthSet).sort((a, b) => {
      return new Date(a).getTime() - new Date(b).getTime();
    });

    // We want to format data for the chart.
    // If a month is selected, show SOBs for that month.
    // If 'All' is selected, aggregate across all months for each SOB.
    
    const aggregatedBySob: Record<string, any> = {};
    
    for (const sob in grouped) {
      aggregatedBySob[sob] = {
        sob,
        totalLeadTime: 0,
        count: 0,
        min: Infinity,
        max: -Infinity,
        buckets: {
          '0-3 Days': 0,
          '4-14 Days': 0,
          '15-30 Days': 0,
          '30+ Days': 0
        }
      };
      
      for (const month in grouped[sob]) {
        if (selectedMonth !== 'All' && month !== selectedMonth) continue;
        
        const stats = grouped[sob][month];
        const agg = aggregatedBySob[sob];
        
        agg.totalLeadTime += stats.totalLeadTime;
        agg.count += stats.count;
        if (stats.min < agg.min) agg.min = stats.min;
        if (stats.max > agg.max) agg.max = stats.max;
        
        agg.buckets['0-3 Days'] += stats.buckets['0-3 Days'];
        agg.buckets['4-14 Days'] += stats.buckets['4-14 Days'];
        agg.buckets['15-30 Days'] += stats.buckets['15-30 Days'];
        agg.buckets['30+ Days'] += stats.buckets['30+ Days'];
      }
    }
    
    const finalChartData = [];
    const finalTableData = [];
    
    for (const sob in aggregatedBySob) {
      const agg = aggregatedBySob[sob];
      if (agg.count === 0) continue;
      
      const avgLeadTime = Math.round(agg.totalLeadTime / agg.count);
      
      // Calculate percentages for the buckets
      const b0_3 = Math.round((agg.buckets['0-3 Days'] / agg.count) * 100);
      const b4_14 = Math.round((agg.buckets['4-14 Days'] / agg.count) * 100);
      const b15_30 = Math.round((agg.buckets['15-30 Days'] / agg.count) * 100);
      const b30_plus = Math.round((agg.buckets['30+ Days'] / agg.count) * 100);
      
      finalChartData.push({
        name: sob,
        '0-3 Days': b0_3,
        '4-14 Days': b4_14,
        '15-30 Days': b15_30,
        '30+ Days': b30_plus,
        avgLeadTime
      });
      
      finalTableData.push({
        sob,
        avgLeadTime,
        minLeadTime: agg.min === Infinity ? 0 : agg.min,
        maxLeadTime: agg.max === -Infinity ? 0 : agg.max,
        totalBookings: agg.count,
        buckets: agg.buckets
      });
    }
    
    // Sort chart data by avgLeadTime descending
    finalChartData.sort((a, b) => b.avgLeadTime - a.avgLeadTime);
    finalTableData.sort((a, b) => b.avgLeadTime - a.avgLeadTime);

    return { 
      chartData: finalChartData, 
      availableMonths: sortedMonths,
      tableData: finalTableData
    };
  }, [data, selectedMonth]);

  const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'];

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Booking Lead Time Analysis</h3>
          <p className="text-sm text-slate-500 mt-1">
            Understand how far in advance guests book across different channels to optimize marketing spend.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Arrival Month:</span>
          <select 
            className="text-sm border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            <option value="All">All Time</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Average Lead Time Chart */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Average Lead Time by Channel (Days)</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="avgLeadTime" name="Avg Lead Time (Days)" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Time Distribution Chart */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Lead Time Distribution (%)</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" stackOffset="expand" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={(tick) => `${tick * 100}%`} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value}%`, undefined]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="0-3 Days" stackId="a" fill={COLORS[0]} />
                <Bar dataKey="4-14 Days" stackId="a" fill={COLORS[1]} />
                <Bar dataKey="15-30 Days" stackId="a" fill={COLORS[2]} />
                <Bar dataKey="30+ Days" stackId="a" fill={COLORS[3]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">Lead Time Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 font-bold text-slate-600">Source of Business</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">Avg Lead Time</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">Min</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">Max</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">0-3 Days</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">4-14 Days</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">15-30 Days</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">30+ Days</th>
                <th className="px-6 py-4 font-bold text-slate-800 text-right">Total Bookings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableData.map((row) => (
                <tr key={row.sob} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-800">{row.sob}</td>
                  <td className="px-6 py-4 text-right font-medium text-slate-700">{row.avgLeadTime} days</td>
                  <td className="px-6 py-4 text-right text-slate-500">{row.minLeadTime}</td>
                  <td className="px-6 py-4 text-right text-slate-500">{row.maxLeadTime}</td>
                  <td className="px-6 py-4 text-right text-slate-600">{row.buckets['0-3 Days'].toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-slate-600">{row.buckets['4-14 Days'].toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-slate-600">{row.buckets['15-30 Days'].toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-slate-600">{row.buckets['30+ Days'].toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-800">{row.totalBookings.toLocaleString()}</td>
                </tr>
              ))}
              {tableData.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                    No data available for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
