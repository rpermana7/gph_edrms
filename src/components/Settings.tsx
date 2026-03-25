import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { fetchRoomCountsFromDB, saveRoomCountsToDB } from '../lib/rooms';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function Settings() {
  const [year, setYear] = useState(2025);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchRoomCountsFromDB();
        setCounts(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const handleCountChange = (monthIdx: number, value: string) => {
    const numValue = parseInt(value) || 0;
    const monthStr = String(monthIdx + 1).padStart(2, '0');
    const key = `${year}-${monthStr}`;
    
    setCounts(prev => ({
      ...prev,
      [key]: numValue
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await saveRoomCountsToDB(counts);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Dispatch a custom event so App.tsx can re-render if needed
      window.dispatchEvent(new Event('roomCountsUpdated'));
    } catch (err: any) {
      console.error('Failed to save:', err);
      setError(err.message || 'Failed to save room counts. Make sure you have created the table in Supabase.');
    } finally {
      setIsSaving(false);
    }
  };

  const getCountForMonth = (monthIdx: number) => {
    const monthStr = String(monthIdx + 1).padStart(2, '0');
    const key = `${year}-${monthStr}`;
    return counts[key] !== undefined ? counts[key] : '';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Room Count Configuration</h2>
            <p className="text-sm text-slate-500 mt-1">Set the number of operating rooms for each month to accurately calculate Occupancy and RevPAR.</p>
          </div>
          <select 
            className="border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-emerald-500 focus:border-emerald-500"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {MONTHS.map((month, idx) => (
            <div key={month} className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{month}</label>
              <input
                type="number"
                min="0"
                className="w-full border-slate-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                value={getCountForMonth(idx)}
                onChange={(e) => handleCountChange(idx, e.target.value)}
                placeholder="e.g. 49"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-100">
          {error && (
            <span className="text-red-600 text-sm font-medium flex items-center gap-1">
              <AlertCircle size={16} /> {error}
            </span>
          )}
          {saved && !error && (
            <span className="text-emerald-600 text-sm font-medium flex items-center gap-1">
              <CheckCircle2 size={16} /> Saved successfully
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
