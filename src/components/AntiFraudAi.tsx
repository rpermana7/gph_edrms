import React, { useState, useEffect } from 'react';
import { ReservationReport } from '../types/reservation';
import { differenceInDays, parseISO, isValid, format } from 'date-fns';
import { 
  ShieldAlert, 
  Search, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  Loader2, 
  Download, 
  Save, 
  History, 
  Trash2, 
  FileDown,
  ShieldOff,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FraudAnomaly {
  reservationNumber: string;
  createdDate: string;
  arrival: string;
  departure: string;
  los: number;
  rateCode: string;
  roomRate: number;
  expectedRevenue: number;
  actualRevenue: number;
  guestName: string;
  createdBy: string;
  fraudType: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

interface Props {
  data: ReservationReport[];
}

const parseDbDate = (dateStr: string) => {
  if (!dateStr) return null;
  const [datePart] = dateStr.split(' ');
  const parsed = parseISO(datePart);
  return isValid(parsed) ? parsed : null;
};

export const AntiFraudAi = ({ data: initialData }: Props) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [frauds, setFrauds] = useState<FraudAnomaly[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);
  const [scannedCount, setScannedCount] = useState<number>(0);

  const runFraudAudit = async () => {
    setIsScanning(true);
    setScanComplete(false);
    setError(null);
    
    try {
      let allYearData: ReservationReport[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      // Filter by CreatedDate year as requested
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      while (hasMore) {
        const { data: pageData, error: fetchError } = await supabase
          .from('reservation_report')
          .select('*')
          .gte('CreatedDate', startDate)
          .lte('CreatedDate', endDate)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (fetchError) throw fetchError;
        
        if (pageData && pageData.length > 0) {
          allYearData = [...allYearData, ...pageData];
          page++;
          if (pageData.length < pageSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      setScannedCount(allYearData.length);
      const results: FraudAnomaly[] = [];
      
      allYearData.forEach(item => {
        const arrival = parseDbDate(item.Arrival);
        const departure = parseDbDate(item.Departure);
        const created = parseDbDate(item.CreatedDate);
        
        const revenue = Number(item.TotalRevenue || 0);
        const roomRate = Number(item.RoomRate || 0);
        const nights = Number(item.Night || 1);
        const rooms = Number(item.RoomQuantity || 1);
        const status = (item.Status || '').toLowerCase();
        const isCanceledOrNoShow = status.includes('cancel') || status.includes('no show');
        
        let los = nights;
        if (arrival && departure) {
          los = differenceInDays(departure, arrival);
        }
        if (los <= 0) los = nights;

        const expectedRevenue = roomRate * los * rooms;
        const diff = Math.abs(revenue - expectedRevenue);
        
        // 1. Revenue Discrepancy
        if (revenue > 0 && diff > (expectedRevenue * 0.05) && !isCanceledOrNoShow) {
          results.push({
            reservationNumber: item.ReservationNumber?.toString() || 'Unknown',
            createdDate: item.CreatedDate || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            departure: item.Departure || 'Unknown',
            los,
            rateCode: item.RateCode || 'N/A',
            roomRate,
            expectedRevenue,
            actualRevenue: revenue,
            guestName: item.GuestName || 'Unknown',
            createdBy: item.CreatedBy || 'Unknown',
            fraudType: 'Revenue Discrepancy',
            severity: diff > 500000 ? 'high' : 'medium',
            description: `Actual revenue (Rp ${revenue.toLocaleString()}) differs from expected (Rp ${expectedRevenue.toLocaleString()}). Possible manual override or unauthorized discount.`
          });
        }

        // 2. Zero Revenue for Active Bookings
        if (revenue <= 0 && !isCanceledOrNoShow && status !== 'house use' && status !== 'complimentary') {
          results.push({
            reservationNumber: item.ReservationNumber?.toString() || 'Unknown',
            createdDate: item.CreatedDate || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            departure: item.Departure || 'Unknown',
            los,
            rateCode: item.RateCode || 'N/A',
            roomRate,
            expectedRevenue,
            actualRevenue: revenue,
            guestName: item.GuestName || 'Unknown',
            createdBy: item.CreatedBy || 'Unknown',
            fraudType: 'Zero Revenue Anomaly',
            severity: 'high',
            description: `Active reservation has zero revenue. Potential "off-the-books" stay if not properly authorized as Comp/House Use.`
          });
        }

        // 3. Backdated Reservations (Created after checkout)
        if (created && departure && created > departure) {
          results.push({
            reservationNumber: item.ReservationNumber?.toString() || 'Unknown',
            createdDate: item.CreatedDate || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            departure: item.Departure || 'Unknown',
            los,
            rateCode: item.RateCode || 'N/A',
            roomRate,
            expectedRevenue,
            actualRevenue: revenue,
            guestName: item.GuestName || 'Unknown',
            createdBy: item.CreatedBy || 'Unknown',
            fraudType: 'Post-Stay Creation',
            severity: 'high',
            description: `Reservation was created on ${format(created, 'dd/MM/yyyy')} which is AFTER the checkout date ${format(departure, 'dd/MM/yyyy')}. Highly suspicious.`
          });
        }

        // 4. Suspiciously Low Rate
        if (roomRate > 0 && roomRate < 50000 && !isCanceledOrNoShow) {
          results.push({
            reservationNumber: item.ReservationNumber?.toString() || 'Unknown',
            createdDate: item.CreatedDate || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            departure: item.Departure || 'Unknown',
            los,
            rateCode: item.RateCode || 'N/A',
            roomRate,
            expectedRevenue,
            actualRevenue: revenue,
            guestName: item.GuestName || 'Unknown',
            createdBy: item.CreatedBy || 'Unknown',
            fraudType: 'Extremely Low Rate',
            severity: 'medium',
            description: `Room rate (Rp ${roomRate.toLocaleString()}) is below operational cost. Verify if this is a staff rate or unauthorized price manipulation.`
          });
        }
      });

      setFrauds(results);
      setScanComplete(true);
    } catch (err: any) {
      console.error('Fraud Scan Error:', err);
      setError(`Failed to run fraud scan: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const exportToCsv = () => {
    if (frauds.length === 0) return;
    const headers = ['Res #', 'Created Date', 'Checkin', 'Checkout', 'LOS', 'Rate Code', 'Room Rate', 'Expected Rev', 'Actual Rev', 'Guest', 'Staff', 'Fraud Type', 'Description'];
    const rows = frauds.map(f => [
      f.reservationNumber,
      f.createdDate,
      f.arrival,
      f.departure,
      f.los,
      f.rateCode,
      f.roomRate,
      f.expectedRevenue,
      f.actualRevenue,
      `"${f.guestName}"`,
      `"${f.createdBy}"`,
      f.fraudType,
      `"${f.description}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `antifraud_report_${selectedYear}.csv`);
    link.click();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldOff size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-3">ANTIFRAUD AI</h2>
        <p className="text-slate-500 max-w-2xl mx-auto mb-8">
          Advanced forensic analysis to detect revenue leakage, unauthorized discounts, post-stay data manipulation, and suspicious staff activities.
        </p>
        
        <div className="flex flex-col items-center gap-6 mb-8">
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">Creation Year:</span>
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={runFraudAudit}
            disabled={isScanning}
            className={`px-8 py-3.5 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
              isScanning ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 shadow-md hover:shadow-lg'
            }`}
          >
            {isScanning ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Scanning {selectedYear} Creations...
              </>
            ) : (
              <>
                <Search size={20} />
                {scanComplete ? 'Run New Scan' : `Scan Potential Fraud (${selectedYear})`}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {scanComplete && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">
              Fraud Detection Results ({frauds.length} anomalies)
            </h3>
            <button 
              onClick={exportToCsv}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all shadow-md"
            >
              <Download size={18} />
              Export Report
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-bold text-slate-600">Res #</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Creation Date</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Checkin</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Checkout</th>
                    <th className="px-4 py-3 font-bold text-slate-600">LOS</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Rate Code</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Room Rate</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Expected Rev</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Actual Rev</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Guest</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Staff</th>
                    <th className="px-4 py-3 font-bold text-slate-600">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {frauds.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-slate-400 italic">
                        No potential fraudulent activities detected for the selected year.
                      </td>
                    </tr>
                  ) : (
                    frauds.map((f, idx) => (
                      <tr key={`${f.reservationNumber}-${idx}`} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3 font-medium text-slate-900">{f.reservationNumber}</td>
                        <td className="px-4 py-3 text-slate-600">{f.createdDate.split(' ')[0]}</td>
                        <td className="px-4 py-3 text-slate-600">{f.arrival.split(' ')[0]}</td>
                        <td className="px-4 py-3 text-slate-600">{f.departure.split(' ')[0]}</td>
                        <td className="px-4 py-3 text-slate-600">{f.los}</td>
                        <td className="px-4 py-3 text-slate-600">{f.rateCode}</td>
                        <td className="px-4 py-3 text-slate-600">Rp {f.roomRate.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-600">Rp {f.expectedRevenue.toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold text-red-600">Rp {f.actualRevenue.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-600">{f.guestName}</td>
                        <td className="px-4 py-3 text-slate-600">{f.createdBy}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                            f.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {f.fraudType}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
