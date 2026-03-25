import React, { useMemo } from 'react';
import { ReservationReport } from '../types/reservation';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachMonthOfInterval, 
  min, 
  max, 
  differenceInDays, 
  addDays,
  isValid
} from 'date-fns';
import { calculateTotalAvailableRoomNights } from '../lib/rooms';

interface Props {
  data: ReservationReport[];
  roomCounts: Record<string, number>;
}

const parseDbDate = (dateStr: string | Date) => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const d = new Date(String(dateStr).split(' ')[0]);
  return isValid(d) ? d : new Date();
};

export const RevenueModule = ({ data, roomCounts }: Props) => {
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

  const monthlyOccupancy = useMemo(() => {
    if (data.length === 0) return [];

    // Find date range
    const arrivalDates = data.map(item => parseDbDate(item.Arrival));
    const departureDates = data.map(item => parseDbDate(item.Departure));
    
    const rangeStart = startOfMonth(min(arrivalDates));
    const rangeEnd = endOfMonth(max(departureDates));

    const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const monthKey = format(month, 'MMMM yyyy');

      let nightsSold = 0;
      data.forEach(item => {
        const arrival = parseDbDate(item.Arrival);
        const departure = parseDbDate(item.Departure);
        
        // Overlap calculation
        const overlapStart = max([arrival, monthStart]);
        const overlapEnd = min([departure, addDays(monthEnd, 1)]); // departure is exclusive
        
        const overlapNights = Math.max(0, differenceInDays(overlapEnd, overlapStart));
        if (overlapNights > 0) {
          nightsSold += overlapNights * (Number(item.RoomQuantity) || 1);
        }
      });

      const availableNights = calculateTotalAvailableRoomNights(monthStart, monthEnd, roomCounts);
      const occupancy = availableNights > 0 ? (nightsSold / availableNights) * 100 : 0;

      return {
        month: monthKey,
        nightsSold,
        availableNights,
        occupancy: Math.min(100, occupancy)
      };
    }).reverse(); // Latest months first
  }, [data, roomCounts]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-8">
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">Monthly Occupancy %</h3>
          <p className="text-sm text-slate-500 mt-1">Monthly occupancy percentage based on stay periods and available room nights.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 font-bold text-slate-600">Month</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">Nights Sold</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-right">Available Nights</th>
                <th className="px-6 py-4 font-bold text-slate-800 text-right">Occupancy %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlyOccupancy.map((row) => (
                <tr key={row.month} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-800">
                    {row.month}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600">
                    {row.nightsSold.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600">
                    {row.availableNights.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden hidden sm:block">
                        <div 
                          className={`h-full rounded-full ${
                            row.occupancy > 80 ? 'bg-emerald-500' : 
                            row.occupancy > 50 ? 'bg-blue-500' : 
                            'bg-amber-500'
                          }`}
                          style={{ width: `${row.occupancy}%` }}
                        ></div>
                      </div>
                      <span className={`font-bold ${
                        row.occupancy > 80 ? 'text-emerald-600' : 
                        row.occupancy > 50 ? 'text-blue-600' : 
                        'text-amber-600'
                      }`}>
                        {row.occupancy.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {monthlyOccupancy.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">
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
