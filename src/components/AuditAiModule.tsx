import React, { useState } from 'react';
import { ReservationReport } from '../types/reservation';
import { differenceInDays, parseISO, isValid } from 'date-fns';
import { ShieldAlert, Search, AlertTriangle, Info, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  data: ReservationReport[];
}

interface Anomaly {
  id: string;
  guestName: string;
  arrival: string;
  type: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  category: 'Ecommerce' | 'Distribution' | 'Revenue' | 'Data Entry';
}

const parseDbDate = (dateStr: string) => {
  if (!dateStr) return null;
  const [datePart] = dateStr.split(' ');
  const parsed = parseISO(datePart);
  return isValid(parsed) ? parsed : null;
};

export const AuditAiModule = ({ data }: Props) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  const runAudit = () => {
    setIsScanning(true);
    setScanComplete(false);
    
    // Simulate AI scanning delay for UX
    setTimeout(() => {
      const results: Anomaly[] = [];
      
      data.forEach(item => {
        const arrival = parseDbDate(item.Arrival);
        const created = parseDbDate(item.CreatedDate);
        const departure = parseDbDate(item.Departure);
        
        const sob = item.SOB || '';
        const segment = item.Segment || '';
        const revenue = Number(item.TotalRevenue || 0);
        const nights = Number(item.Night || 1);
        const rooms = Number(item.RoomQuantity || 1);
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
            category: 'Distribution'
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
            category: 'Revenue'
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
            category: 'Revenue'
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
            category: 'Ecommerce'
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
            category: 'Data Entry'
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
            category: 'Revenue'
          });
        }
      });
      
      // Sort by severity (high -> medium -> low)
      const severityWeight = { high: 3, medium: 2, low: 1 };
      results.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
      
      setAnomalies(results);
      setIsScanning(false);
      setScanComplete(true);
    }, 2000);
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
        
        <button 
          onClick={runAudit}
          disabled={isScanning}
          className={`px-6 py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 mx-auto ${
            isScanning ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg'
          }`}
        >
          {isScanning ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Scanning {data.length} records...
            </>
          ) : (
            <>
              <Search size={20} />
              {scanComplete ? 'Run Audit Again' : 'Scan All Records'}
            </>
          )}
        </button>
      </div>

      {scanComplete && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">
              Audit Results ({anomalies.length} flags found)
            </h3>
            <div className="flex gap-2 text-sm">
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
