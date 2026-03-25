import React, { useState, useMemo } from 'react';
import { ReservationReport } from '../types/reservation';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  data: ReservationReport[];
}

const parseDbDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [datePart] = dateStr.split(' ');
  return parseISO(datePart);
};

const OTAOverviewTable = ({ data }: Props) => {
  const { otaData, totals } = useMemo(() => {
    const otaReservations = data.filter(item => 
      item.Segment?.toUpperCase() === 'OTA' || 
      item.SOB?.toUpperCase() === 'OTA' ||
      item.ReservationName?.toUpperCase().includes('OTA')
    );

    const grouped: Record<string, { count: number; nights: number; revenue: number }> = {};
    
    otaReservations.forEach(item => {
      const name = item.ReservationName || 'Unknown';
      if (!grouped[name]) {
        grouped[name] = { count: 0, nights: 0, revenue: 0 };
      }
      grouped[name].count += 1;
      grouped[name].nights += Number(item.Night) || 0;
      grouped[name].revenue += Number(item.TotalRevenue) || 0;
    });

    const tableRows = Object.keys(grouped).map(name => {
      const stats = grouped[name];
      const adr = stats.nights > 0 ? stats.revenue / stats.nights : 0;
      const estimatedFee = stats.revenue * 0.2;
      return {
        name,
        ...stats,
        adr,
        estimatedFee
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const grandTotals = tableRows.reduce(
      (acc, row) => {
        acc.count += row.count;
        acc.nights += row.nights;
        acc.revenue += row.revenue;
        acc.estimatedFee += row.estimatedFee;
        return acc;
      },
      { count: 0, nights: 0, revenue: 0, estimatedFee: 0 }
    );

    const grandAdr = grandTotals.nights > 0 ? grandTotals.revenue / grandTotals.nights : 0;

    return { otaData: tableRows, totals: { ...grandTotals, adr: grandAdr } };
  }, [data]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  if (otaData.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">
        No OTA reservations found for the selected period.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-lg">OTA Overview</h3>
        <p className="text-sm text-slate-500 mt-1">Breakdown of OTA reservations by Reservation Name.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-6 py-4 font-bold text-slate-600">Reservation Name</th>
              <th className="px-6 py-4 font-bold text-slate-600 text-right">Reservations</th>
              <th className="px-6 py-4 font-bold text-slate-600 text-right">Nights Sold</th>
              <th className="px-6 py-4 font-bold text-slate-600 text-right">ADR</th>
              <th className="px-6 py-4 font-bold text-slate-800 text-right">Total Revenue</th>
              <th className="px-6 py-4 font-bold text-red-600 text-right whitespace-nowrap">Est. Fee (20%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {otaData.map((row) => (
              <tr key={row.name} className="even:bg-slate-50/50 hover:bg-slate-100 transition-colors group">
                <td className="px-6 py-4 font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors">{row.name}</td>
                <td className="px-6 py-4 text-right text-slate-600">{row.count.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-slate-600">{row.nights.toLocaleString()}</td>
                <td className="px-6 py-4 text-right font-medium text-slate-700">{formatCurrency(row.adr)}</td>
                <td className="px-6 py-4 text-right font-bold text-emerald-600">{formatCurrency(row.revenue)}</td>
                <td className="px-6 py-4 text-right font-medium text-red-600">{formatCurrency(row.estimatedFee)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
              <td className="px-6 py-4 text-slate-800">Grand Total</td>
              <td className="px-6 py-4 text-right text-slate-800">{totals.count.toLocaleString()}</td>
              <td className="px-6 py-4 text-right text-slate-800">{totals.nights.toLocaleString()}</td>
              <td className="px-6 py-4 text-right text-slate-800">{formatCurrency(totals.adr)}</td>
              <td className="px-6 py-4 text-right text-emerald-700">{formatCurrency(totals.revenue)}</td>
              <td className="px-6 py-4 text-right text-red-700">{formatCurrency(totals.estimatedFee)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const DistributionModule = ({ data }: Props) => {
  const [expandedSegments, setExpandedSegments] = useState<Record<string, boolean>>({});

  const toggleSegment = (segment: string) => {
    setExpandedSegments(prev => ({
      ...prev,
      [segment]: !prev[segment]
    }));
  };

  const { months, tableData, totals } = useMemo(() => {
    const monthSet = new Set<string>();
    
    // Group data
    // segment -> sob -> month -> revenue
    const grouped: Record<string, Record<string, Record<string, number>>> = {};
    
    data.forEach(item => {
      if (!item.Arrival) return;
      const date = parseDbDate(item.Arrival);
      const monthKey = format(date, 'MMM yyyy');
      monthSet.add(monthKey);
      
      const segment = item.Segment || 'Unknown';
      const sob = item.SOB || 'Unknown';
      const revenue = Number(item.TotalRevenue) || 0;
      
      if (!grouped[segment]) grouped[segment] = {};
      if (!grouped[segment][sob]) grouped[segment][sob] = {};
      if (!grouped[segment][sob][monthKey]) grouped[segment][sob][monthKey] = 0;
      
      grouped[segment][sob][monthKey] += revenue;
    });

    // Sort months chronologically
    const sortedMonths = Array.from(monthSet).sort((a, b) => {
      return new Date(a).getTime() - new Date(b).getTime();
    });

    // Build table data
    const tableRows = [];
    const grandTotals: Record<string, number> = { total: 0 };
    sortedMonths.forEach(m => grandTotals[m] = 0);

    for (const segment in grouped) {
      const segmentData = {
        name: segment,
        isSegment: true,
        months: {} as Record<string, number>,
        total: 0,
        sobs: [] as any[]
      };

      for (const sob in grouped[segment]) {
        const sobData = {
          name: sob,
          isSegment: false,
          months: {} as Record<string, number>,
          total: 0
        };

        sortedMonths.forEach(m => {
          const rev = grouped[segment][sob][m] || 0;
          sobData.months[m] = rev;
          sobData.total += rev;
          
          segmentData.months[m] = (segmentData.months[m] || 0) + rev;
          segmentData.total += rev;
          
          grandTotals[m] += rev;
          grandTotals.total += rev;
        });

        segmentData.sobs.push(sobData);
      }
      
      // Sort SOBs by total revenue descending
      segmentData.sobs.sort((a, b) => b.total - a.total);
      tableRows.push(segmentData);
    }

    // Sort segments by total revenue descending
    tableRows.sort((a, b) => b.total - a.total);

    return { months: sortedMonths, tableData: tableRows, totals: grandTotals };
  }, [data]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">Revenue by Segment & SOB</h3>
          <p className="text-sm text-slate-500 mt-1">Breakdown of revenue across segments and sources of business over time.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 font-bold text-slate-600">Segment / SOB</th>
                {months.map(m => (
                  <th key={m} className="px-6 py-4 font-bold text-slate-600 text-right whitespace-nowrap">{m}</th>
                ))}
                <th className="px-6 py-4 font-bold text-slate-800 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableData.map((segment, idx) => (
                <React.Fragment key={segment.name}>
                  <tr 
                    className={`transition-colors cursor-pointer hover:bg-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'}`}
                    onClick={() => toggleSegment(segment.name)}
                  >
                    <td className="px-6 py-3 font-semibold text-slate-800 flex items-center gap-2">
                      {expandedSegments[segment.name] ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                      {segment.name}
                    </td>
                    {months.map(m => (
                      <td key={m} className="px-6 py-3 text-right font-medium text-slate-700">
                        {formatCurrency(segment.months[m] || 0)}
                      </td>
                    ))}
                    <td className="px-6 py-3 text-right font-bold text-emerald-600">
                      {formatCurrency(segment.total)}
                    </td>
                  </tr>
                  {expandedSegments[segment.name] && segment.sobs.map((sob) => (
                    <tr key={`${segment.name}-${sob.name}`} className="bg-slate-100/20 hover:bg-slate-200/50 transition-colors">
                      <td className="px-6 py-3 pl-12 text-slate-600 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                        {sob.name}
                      </td>
                      {months.map(m => (
                        <td key={m} className="px-6 py-3 text-right text-slate-600">
                          {formatCurrency(sob.months[m] || 0)}
                        </td>
                      ))}
                      <td className="px-6 py-3 text-right font-medium text-slate-700">
                        {formatCurrency(sob.total)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                <td className="px-6 py-4 text-slate-800">Grand Total</td>
                {months.map(m => (
                  <td key={m} className="px-6 py-4 text-right text-slate-800">
                    {formatCurrency(totals[m] || 0)}
                  </td>
                ))}
                <td className="px-6 py-4 text-right text-emerald-700">
                  {formatCurrency(totals.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <OTAOverviewTable data={data} />
    </div>
  );
};
