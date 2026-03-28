import React, { useState, useEffect, useMemo } from 'react';
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
  const [isSaving, setIsSaving] = useState(false);
  const [savedScans, setSavedScans] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const totalPotentialLoss = useMemo(() => {
    return frauds.reduce((sum, f) => sum + Math.max(0, f.expectedRevenue - f.actualRevenue), 0);
  }, [frauds]);

  useEffect(() => {
    fetchSavedScans();
  }, []);

  const fetchSavedScans = async () => {
    try {
      const { data: scans, error } = await supabase
        .from('fraud_scans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedScans(scans || []);
    } catch (err) {
      console.error('Error fetching scans:', err);
    }
  };

  const saveScan = async () => {
    if (frauds.length === 0 && !scanComplete) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('fraud_scans')
        .insert([{
          frauds,
          total_records: scannedCount,
          scanned_year: selectedYear === 0 ? null : selectedYear
        }]);

      if (error) throw error;
      await fetchSavedScans();
      alert('Fraud scan results saved successfully!');
    } catch (err) {
      console.error('Error saving scan:', err);
      setError('Failed to save fraud scan results.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteScan = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scan record?')) return;
    
    try {
      const { error } = await supabase
        .from('fraud_scans')
        .delete()
        .match({ id });

      if (error) throw error;
      setSavedScans(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Error deleting scan:', err);
    }
  };

  const runFraudAudit = async () => {
    setIsScanning(true);
    setScanComplete(false);
    setError(null);
    
    try {
      let allYearData: ReservationReport[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('reservation_report')
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        // Filter by CreatedDate year if not All Time
        if (selectedYear !== 0) {
          const startDate = `${selectedYear}-01-01`;
          const endDate = `${selectedYear}-12-31`;
          query = query.gte('CreatedDate', startDate).lte('CreatedDate', endDate);
        }

        const { data: pageData, error: fetchError } = await query;

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

  const exportToCsv = (dataToExport: FraudAnomaly[], year: number | string) => {
    if (dataToExport.length === 0) return;
    const headers = ['Res #', 'Created Date', 'Checkin', 'Checkout', 'LOS', 'Rate Code', 'Room Rate', 'Expected Rev', 'Actual Rev', 'Discrepancy', 'Guest', 'Staff', 'Fraud Type', 'Description'];
    const rows = dataToExport.map(f => [
      f.reservationNumber,
      f.createdDate,
      f.arrival,
      f.departure,
      f.los,
      f.rateCode,
      f.roomRate,
      f.expectedRevenue,
      f.actualRevenue,
      Math.max(0, f.expectedRevenue - f.actualRevenue),
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
    link.setAttribute('download', `antifraud_report_${year}.csv`);
    link.click();
  };

  const exportToPdf = (dataToExport: FraudAnomaly[], year: number | string) => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const margin = 15;
    
    doc.setFontSize(18);
    doc.text('ANTIFRAUD AI REPORT', margin, 20);
    doc.setFontSize(10);
    doc.text(`Scan Year: ${year === 0 ? 'All Time' : year}`, margin, 28);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, margin, 34);
    doc.text(`Total Anomalies: ${dataToExport.length}`, margin, 40);

    autoTable(doc, {
      startY: 45,
      head: [['Res #', 'Created', 'Checkin', 'Checkout', 'LOS', 'Rate', 'Exp Rev', 'Act Rev', 'Discrepancy', 'Guest', 'Staff', 'Type']],
      body: dataToExport.map(f => [
        f.reservationNumber,
        f.createdDate.split(' ')[0],
        f.arrival.split(' ')[0],
        f.departure.split(' ')[0],
        f.los,
        f.roomRate.toLocaleString(),
        f.expectedRevenue.toLocaleString(),
        f.actualRevenue.toLocaleString(),
        Math.max(0, f.expectedRevenue - f.actualRevenue).toLocaleString(),
        f.guestName.substring(0, 15),
        f.createdBy.substring(0, 15),
        f.fraudType
      ]),
      margin: { top: margin, left: margin, right: margin, bottom: margin },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [220, 38, 38] }
    });

    doc.save(`antifraud_report_${year}.pdf`);
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">Creation Year:</span>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              >
                <option value={0}>ALL TIME</option>
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all border ${
                showHistory ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <History size={18} />
              {showHistory ? 'Hide History' : 'View History'}
            </button>
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
                Scanning {selectedYear === 0 ? 'All Time' : selectedYear} Creations...
              </>
            ) : (
              <>
                <Search size={20} />
                {scanComplete ? 'Run New Scan' : `Scan Potential Fraud (${selectedYear === 0 ? 'All Time' : selectedYear})`}
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <History size={18} className="text-slate-400" />
                Saved Fraud Scans
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
              {savedScans.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic">
                  No saved scans found.
                </div>
              ) : (
                savedScans.map((scan) => (
                  <div key={scan.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-800">
                        {scan.scanned_year ? `Year: ${scan.scanned_year}` : 'All Time Scan'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {format(new Date(scan.created_at), 'dd MMM yyyy, HH:mm')} • {scan.frauds.length} anomalies found
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => exportToCsv(scan.frauds, scan.scanned_year || 'all_time')}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        title="Download CSV"
                      >
                        <FileDown size={18} />
                      </button>
                      <button 
                        onClick={() => exportToPdf(scan.frauds, scan.scanned_year || 'all_time')}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Download PDF"
                      >
                        <Download size={18} />
                      </button>
                      <button 
                        onClick={() => deleteScan(scan.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete Record"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {scanComplete && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Anomalies</div>
              <div className="text-3xl font-bold text-slate-800">{frauds.length}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Potential Loss</div>
              <div className="text-3xl font-bold text-red-600">Rp {totalPotentialLoss.toLocaleString()}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Scanned Records</div>
              <div className="text-3xl font-bold text-slate-800">{scannedCount.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">
              Fraud Detection Results ({frauds.length} anomalies)
            </h3>
            <div className="flex items-center gap-3">
              <button 
                onClick={saveScan}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Save Result
              </button>
              <button 
                onClick={() => exportToCsv(frauds, selectedYear || 'all_time')}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all shadow-md"
              >
                <Download size={18} />
                Export CSV
              </button>
              <button 
                onClick={() => exportToPdf(frauds, selectedYear || 'all_time')}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-md"
              >
                <FileDown size={18} />
                Export PDF
              </button>
            </div>
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
                    <th className="px-4 py-3 font-bold text-slate-600">Discrepancy</th>
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
                        <td className="px-4 py-3 font-bold text-red-700 bg-red-50">Rp {Math.max(0, f.expectedRevenue - f.actualRevenue).toLocaleString()}</td>
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
