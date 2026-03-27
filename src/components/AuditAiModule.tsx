import React, { useState, useEffect } from 'react';
import { ReservationReport } from '../types/reservation';
import { differenceInDays, parseISO, isValid } from 'date-fns';
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
  FileDown 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuditScan, Anomaly } from '../types/audit';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  data: ReservationReport[];
}

const parseDbDate = (dateStr: string) => {
  if (!dateStr) return null;
  const [datePart] = dateStr.split(' ');
  const parsed = parseISO(datePart);
  return isValid(parsed) ? parsed : null;
};

export const AuditAiModule = ({ data }: Props) => {
  const [isScanning, setIsScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [savedScans, setSavedScans] = useState<AuditScan[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [scannedCount, setScannedCount] = useState<number>(0);

  useEffect(() => {
    fetchSavedScans();
  }, []);

  const fetchSavedScans = async () => {
    try {
      const { data: scans, error } = await supabase
        .from('audit_scans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedScans(scans || []);
    } catch (err) {
      console.error('Error fetching scans:', err);
    }
  };

  const saveScan = async () => {
    if (anomalies.length === 0 && !scanComplete) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('audit_scans')
        .insert([{
          anomalies,
          total_records: scannedCount
        }]);

      if (error) throw error;
      await fetchSavedScans();
      alert('Audit scan saved successfully!');
    } catch (err) {
      console.error('Error saving scan:', err);
      setError('Failed to save audit scan.');
    } finally {
      setSaving(false);
    }
  };

  const deleteScan = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scan record?')) return;
    
    try {
      const { error } = await supabase
        .from('audit_scans')
        .delete()
        .match({ id });

      if (error) throw error;
      setSavedScans(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Error deleting scan:', err);
    }
  };

  const runAudit = async () => {
    setIsScanning(true);
    setScanComplete(false);
    setError(null);
    
    try {
      // Fetch ALL records for the selected year from Supabase
      // We use pagination to bypass the 1000 row limit
      let allYearData: ReservationReport[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      while (hasMore) {
        const { data: pageData, error: fetchError } = await supabase
          .from('reservation_report')
          .select('*')
          .gte('Arrival', startDate)
          .lte('Arrival', endDate)
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
      const results: Anomaly[] = [];
      
      allYearData.forEach(item => {
        const arrival = parseDbDate(item.Arrival);
        const created = parseDbDate(item.CreatedDate);
        const departure = parseDbDate(item.Departure);
        
        const sob = item.SOB || '';
        const segment = item.Segment || '';
        const revenue = Number(item.TotalRevenue || 0);
        const roomRate = Number(item.RoomRate || 0);
        const nights = Number(item.Night || 1);
        const rooms = Number(item.RoomQuantity || 1);
        const adults = Number(item.Adult || 0);
        const status = (item.Status || '').toLowerCase();
        
        const isCanceledOrNoShow = status.includes('cancel') || status.includes('no show');
        
        let leadTime = -1;
        if (arrival && created) {
          leadTime = differenceInDays(arrival, created);
        }
        
        let los = -1;
        if (arrival && departure) {
          los = differenceInDays(departure, arrival);
        } else {
          los = nights;
        }

        const adr = (rooms > 0 && los > 0) ? revenue / (rooms * los) : 0;

        // Rule 1: Walk-In with long lead time
        if (sob.toLowerCase().includes('walk') && leadTime > 14) {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Suspicious Walk-In Lead Time',
            description: `Walk-in reservation booked ${leadTime} days in advance. Walk-ins typically book on the day of arrival.`,
            severity: 'medium',
            category: 'Distribution',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 2: Active booking with zero or negative revenue
        if (revenue <= 0 && !isCanceledOrNoShow) {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Zero/Negative Revenue',
            description: `Active reservation has ${revenue === 0 ? 'zero' : 'negative'} total revenue. Check if this is a comp room or a mapping error.`,
            severity: 'high',
            category: 'Revenue',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 3: Extremely low ADR (assuming IDR, less than 50,000 is suspicious)
        if (revenue > 0 && adr < 50000 && !isCanceledOrNoShow) {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Extremely Low ADR',
            description: `Calculated ADR is very low (${Math.round(adr).toLocaleString()}). Verify rate code or staff discount.`,
            severity: 'high',
            category: 'Revenue',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 4: Missing Source of Business or Segment
        if (!sob || sob.toLowerCase() === 'unknown' || !segment || segment.toLowerCase() === 'unknown') {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Missing Tracking Data',
            description: `Missing ${!sob ? 'Source of Business' : 'Segment'}. This affects distribution and marketing analytics.`,
            severity: 'low',
            category: 'Ecommerce',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 5: Negative Lead Time (Booked after arrival)
        if (leadTime < -1) { // -1 to account for timezone weirdness
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Negative Lead Time',
            description: `Reservation created ${Math.abs(leadTime)} days AFTER arrival date.`,
            severity: 'medium',
            category: 'Data Entry',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 6: Unusually long stay
        if (los > 30 && !isCanceledOrNoShow) {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Extended Stay Anomaly',
            description: `Reservation is for ${los} nights. Verify if this is a legitimate long-stay guest or a system error.`,
            severity: 'low',
            category: 'Revenue',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 7: Extremely High Room Rate
        if (roomRate > 10000000 && !isCanceledOrNoShow) {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Extremely High Rate',
            description: `Room rate is unusually high (Rp ${roomRate.toLocaleString()}). Check for data entry error or currency mismatch.`,
            severity: 'medium',
            category: 'Revenue',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 8: Adults = 0
        if (adults === 0 && !isCanceledOrNoShow) {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Zero Adults',
            description: `Reservation has 0 adults. Check if this is a child-only booking or a missing field.`,
            severity: 'low',
            category: 'Data Entry',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 9: Bulk Booking Check
        if (rooms > 5 && !isCanceledOrNoShow && segment.toLowerCase() !== 'group') {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Large Room Quantity',
            description: `Reservation for ${rooms} rooms but not categorized as 'Group'. Verify segment classification.`,
            severity: 'low',
            category: 'Distribution',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }

        // Rule 10: Revenue Inconsistency
        const expectedRevenue = roomRate * los * rooms;
        if (revenue > 0 && Math.abs(revenue - expectedRevenue) > (expectedRevenue * 0.1) && !isCanceledOrNoShow) {
          results.push({
            id: item.ReservationNumber?.toString() || 'Unknown',
            guestName: item.GuestName || 'Unknown',
            arrival: item.Arrival || 'Unknown',
            type: 'Revenue Inconsistency',
            description: `Total revenue (Rp ${revenue.toLocaleString()}) differs significantly from expected (Rp ${expectedRevenue.toLocaleString()}) based on rate and nights.`,
            severity: 'medium',
            category: 'Revenue',
            createdBy: item.CreatedBy || 'Unknown'
          });
        }
      });
      
      // Sort by severity (high -> medium -> low)
      const severityWeight = { high: 3, medium: 2, low: 1 };
      results.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
      
      setAnomalies(results);
      setScanComplete(true);
    } catch (err: any) {
      console.error('Audit Error:', err);
      setError(`Failed to run audit: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const exportToCsv = (scanData?: AuditScan) => {
    const activeAnomalies = scanData ? scanData.anomalies : anomalies;
    if (activeAnomalies.length === 0) return;

    const headers = ['Reservation #', 'Guest Name', 'Arrival', 'Category', 'Type', 'Description', 'Severity', 'Created By'];
    const rows = activeAnomalies.map(a => [
      a.id,
      `"${a.guestName}"`,
      a.arrival.split(' ')[0],
      a.category,
      `"${a.type}"`,
      `"${a.description}"`,
      a.severity,
      `"${a.createdBy}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = scanData ? new Date(scanData.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    link.setAttribute('download', `audit_ai_results_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPdf = (scanData?: AuditScan) => {
    try {
      const activeAnomalies = scanData ? scanData.anomalies : anomalies;
      const activeDate = scanData ? new Date(scanData.created_at).toLocaleString() : new Date().toLocaleString();
      const activeTotal = scanData ? scanData.total_records : scannedCount;

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const bottomMargin = 20;
      const maxContentHeight = pageHeight - bottomMargin;

      const checkPageBreak = (currentY: number, neededHeight: number) => {
        if (currentY + neededHeight > maxContentHeight) {
          doc.addPage();
          return 20;
        }
        return currentY;
      };

      // Header
      doc.setFontSize(22);
      doc.setTextColor(5, 150, 105);
      doc.text('AUDIT AI Scan Report', margin, 22);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${activeDate}`, margin, 30);
      doc.text(`Total Records Scanned: ${activeTotal}`, margin, 35);
      doc.text(`Anomalies Found: ${activeAnomalies.length}`, margin, 40);

      let currentY = 50;

      if (activeAnomalies.length === 0) {
        doc.setFontSize(12);
        doc.setTextColor(30);
        doc.text('No anomalies found. All records are clear.', margin, currentY);
      } else {
        activeAnomalies.forEach((anomaly, idx) => {
          const neededHeight = 40;
          currentY = checkPageBreak(currentY, neededHeight);

          // Anomaly Box
          doc.setDrawColor(230);
          doc.setFillColor(252, 252, 252);
          doc.rect(margin, currentY, pageWidth - (margin * 2), 35, 'FD');

          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(anomaly.severity === 'high' ? 220 : (anomaly.severity === 'medium' ? 180 : 30), 30, 30);
          doc.text(`[${anomaly.severity.toUpperCase()}] ${anomaly.type}`, margin + 5, currentY + 8);

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100);
          doc.text(`Category: ${anomaly.category}`, margin + 5, currentY + 13);

          doc.setTextColor(60);
          const descLines = doc.splitTextToSize(anomaly.description, pageWidth - (margin * 2) - 10);
          doc.text(descLines, margin + 5, currentY + 18);

          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(`Res #: ${anomaly.id} | Guest: ${anomaly.guestName} | Arrival: ${anomaly.arrival.split(' ')[0]} | Staff: ${anomaly.createdBy}`, margin + 5, currentY + 30);

          currentY += 40;
        });
      }

      const fileName = `audit_ai_report_${activeDate.replace(/[/:\s,]/g, '_')}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('PDF Export Error:', err);
      setError('Failed to export PDF.');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle size={18} className="text-red-600" />;
      case 'medium': return <AlertTriangle size={18} className="text-amber-600" />;
      case 'low': return <Info size={18} className="text-blue-600" />;
      default: return <Info size={18} className="text-slate-600" />;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-3">AUDIT AI</h2>
        <p className="text-slate-500 max-w-2xl mx-auto mb-8">
          Our AI engine scans all your reservation records to identify red flags, data entry errors, and revenue leakage across Ecommerce, Distribution, and Revenue categories.
        </p>
        
        <div className="flex flex-col items-center gap-6 mb-8">
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2">Audit Year:</span>
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            <button 
              onClick={runAudit}
              disabled={isScanning}
              className={`px-8 py-3.5 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
                isScanning ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg'
              }`}
            >
              {isScanning ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Scanning All Records for {selectedYear}...
                </>
              ) : (
                <>
                  <Search size={20} />
                  {scanComplete ? 'Run New Audit' : `Scan All ${selectedYear} Records`}
                </>
              )}
            </button>

          {scanComplete && (
            <button 
              onClick={saveScan}
              disabled={saving}
              className="px-6 py-3 bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-800 transition-all shadow-md disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              Save Scan Result
            </button>
          )}

          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-slate-700 transition-all shadow-md"
          >
            <History size={20} />
            {showHistory ? 'Hide History' : 'Scan History'}
          </button>
        </div>
      </div>
    </div>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <History className="text-emerald-600" />
                  Saved Scan History
                </h3>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{savedScans.length} Records</span>
              </div>
              
              {savedScans.length === 0 ? (
                <div className="text-center py-10 text-slate-400 italic">
                  No saved scans found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-4 font-bold text-slate-500 text-xs uppercase tracking-wider">Date & Time</th>
                        <th className="pb-4 font-bold text-slate-500 text-xs uppercase tracking-wider text-center">Records</th>
                        <th className="pb-4 font-bold text-slate-500 text-xs uppercase tracking-wider text-center">Flags</th>
                        <th className="pb-4 font-bold text-slate-500 text-xs uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {savedScans.map((scan) => (
                        <tr key={scan.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 text-sm text-slate-700">
                            {new Date(scan.created_at).toLocaleString()}
                          </td>
                          <td className="py-4 text-sm text-slate-700 text-center">
                            {scan.total_records}
                          </td>
                          <td className="py-4 text-sm font-bold text-red-600 text-center">
                            {scan.anomalies.length}
                          </td>
                          <td className="py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => exportToPdf(scan)}
                                className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                                title="Download PDF"
                              >
                                <FileDown size={18} />
                              </button>
                              <button
                                onClick={() => exportToCsv(scan)}
                                className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                                title="Download CSV"
                              >
                                <Download size={18} />
                              </button>
                              <button
                                onClick={() => deleteScan(scan.id)}
                                className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                                title="Delete Record"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm flex items-center gap-3">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {scanComplete && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">
              Audit Results ({anomalies.length} flags found)
            </h3>
            <div className="flex gap-2 text-sm">
              <button 
                onClick={() => exportToCsv()}
                className="flex items-center gap-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors mr-2"
              >
                <Download size={16} />
                Export CSV
              </button>
              <button 
                onClick={() => exportToPdf()}
                className="flex items-center gap-2 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-medium transition-colors mr-2"
              >
                <FileDown size={16} />
                Export PDF
              </button>
              <span className="px-3 py-1 bg-red-50 text-red-700 rounded-full font-medium">
                {anomalies.filter(a => a.severity === 'high').length} High
              </span>
              <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full font-medium">
                {anomalies.filter(a => a.severity === 'medium').length} Medium
              </span>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                {anomalies.filter(a => a.severity === 'low').length} Low
              </span>
            </div>
          </div>

          {anomalies.length === 0 ? (
            <div className="bg-white p-10 rounded-2xl border border-emerald-200 shadow-sm text-center">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">All Clear!</h3>
              <p className="text-slate-500">No anomalies or red flags were found in your reservation data.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {anomalies.map((anomaly, index) => (
                <div key={`${anomaly.id}-${index}`} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                  <div className={`p-3 rounded-lg border ${getSeverityColor(anomaly.severity)} shrink-0`}>
                    {getSeverityIcon(anomaly.severity)}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="font-bold text-slate-800">{anomaly.type}</h4>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded">
                        {anomaly.category}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-3">{anomaly.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg">
                      <div><span className="font-semibold text-slate-700">Res #:</span> {anomaly.id}</div>
                      <div><span className="font-semibold text-slate-700">Guest:</span> {anomaly.guestName}</div>
                      <div><span className="font-semibold text-slate-700">Arrival:</span> {anomaly.arrival.split(' ')[0]}</div>
                      <div><span className="font-semibold text-slate-700">Staff:</span> {anomaly.createdBy}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
