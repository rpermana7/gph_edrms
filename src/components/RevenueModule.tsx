import React, { useMemo } from 'react';
import { ReservationReport } from '../types/reservation';

interface Props {
  data: ReservationReport[];
}

export const RevenueModule = ({ data }: Props) => {
  const { roomTypes, totals } = useMemo(() => {
    const grouped: Record<string, { revenue: number; nights: number; count: number }> = {};
    
    data.forEach(item => {
      const roomType = item.RoomType || 'Unknown';
      const revenue = Number(item.TotalRevenue) || 0;
      const nights = Number(item.Night) || 0;
      
      if (!grouped[roomType]) {
        grouped[roomType] = { revenue: 0, nights: 0, count: 0 };
      }
      
      grouped[roomType].revenue += revenue;
      grouped[roomType].nights += nights;
      grouped[roomType].count += 1;
    });

    const tableRows = Object.keys(grouped).map(roomType => {
      const stats = grouped[roomType];
      const adr = stats.nights > 0 ? stats.revenue / stats.nights : 0;
      return {
        roomType,
        ...stats,
        adr
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const grandTotals = tableRows.reduce(
      (acc, row) => {
        acc.revenue += row.revenue;
        acc.nights += row.nights;
        acc.count += row.count;
        return acc;
      },
      { revenue: 0, nights: 0, count: 0 }
    );

    const grandAdr = grandTotals.nights > 0 ? grandTotals.revenue / grandTotals.nights : 0;

    return { 
      roomTypes: tableRows, 
      totals: { ...grandTotals, adr: grandAdr } 
    };
  }, [data]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-lg">Revenue by Room Type</h3>
        <p className="text-sm text-slate-500 mt-1">Breakdown of revenue, nights sold, and ADR across different room types.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-6 py-4 font-bold text-slate-600">Room Type</th>
              <th className="px-6 py-4 font-bold text-slate-600 text-right">Reservations</th>
              <th className="px-6 py-4 font-bold text-slate-600 text-right">Nights Sold</th>
              <th className="px-6 py-4 font-bold text-slate-600 text-right">ADR</th>
              <th className="px-6 py-4 font-bold text-slate-800 text-right">Total Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roomTypes.map((row) => (
              <tr key={row.roomType} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-semibold text-slate-800">
                  {row.roomType}
                </td>
                <td className="px-6 py-4 text-right text-slate-600">
                  {row.count.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-slate-600">
                  {row.nights.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-700">
                  {formatCurrency(row.adr)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-emerald-600">
                  {formatCurrency(row.revenue)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
              <td className="px-6 py-4 text-slate-800">Grand Total</td>
              <td className="px-6 py-4 text-right text-slate-800">
                {totals.count.toLocaleString()}
              </td>
              <td className="px-6 py-4 text-right text-slate-800">
                {totals.nights.toLocaleString()}
              </td>
              <td className="px-6 py-4 text-right text-slate-800">
                {formatCurrency(totals.adr)}
              </td>
              <td className="px-6 py-4 text-right text-emerald-700">
                {formatCurrency(totals.revenue)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
