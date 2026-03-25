import { useState, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ReservationReport } from '../types/reservation';
import { 
  Brain, 
  ShoppingBag, 
  Globe, 
  TrendingUp, 
  Loader2, 
  Sparkles,
  CheckCircle2,
  AlertCircle,
  CalendarRange,
  FileDown,
  ArrowRight,
  ShieldAlert,
  Save,
  History,
  Download,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { AuditReport, AiInsight, OtaLeakageData } from '../types/audit';

interface EdrmsAiProps {
  data: ReservationReport[];
}

export default function EdrmsAi({ data }: EdrmsAiProps) {
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<AuditReport[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchSavedReports();
  }, []);

  const fetchSavedReports = async () => {
    try {
      const { data: reports, error } = await supabase
        .from('audit_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedReports(reports || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
    }
  };

  const saveReport = async () => {
    if (insights.length === 0) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('audit_reports')
        .insert([{
          insights,
          ota_leakage: otaLeakage,
          total_reservations: data.length
        }]);

      if (error) throw error;
      await fetchSavedReports();
      alert('Audit report saved successfully!');
    } catch (err) {
      console.error('Error saving report:', err);
      setError('Failed to save audit report.');
    } finally {
      setSaving(false);
    }
  };

  const deleteReport = async (id: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    
    try {
      const { error } = await supabase
        .from('audit_reports')
        .delete()
        .match({ id });

      if (error) throw error;
      setSavedReports(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Error deleting report:', err);
    }
  };

  const otaLeakage = useMemo(() => {
    const otaReservations = data.filter(item => 
      item.Segment?.toUpperCase() === 'OTA' || 
      item.SOB?.toUpperCase() === 'OTA' ||
      item.ReservationName?.toUpperCase().includes('OTA')
    );

    const revenue = otaReservations.reduce((sum, item) => sum + Number(item.TotalRevenue || 0), 0);
    const otaFee = revenue * 0.20;
    const directFee = revenue * 0.05;
    const leakage = otaFee - directFee;

    return {
      revenue,
      otaFee,
      directFee,
      leakage,
      count: otaReservations.length
    };
  }, [data]);

  const exportToPdf = (reportData?: { insights: AiInsight[], otaLeakage: OtaLeakageData, totalReservations: number, createdAt?: string }) => {
    try {
      const activeInsights = reportData?.insights || insights;
      const activeOtaLeakage = reportData?.otaLeakage || otaLeakage;
      const activeTotal = reportData?.totalReservations || data.length;
      const activeDate = reportData?.createdAt ? new Date(reportData.createdAt).toLocaleString() : new Date().toLocaleString();

      console.log('Starting PDF export...');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const bottomMargin = 20;
      const maxContentHeight = pageHeight - bottomMargin;
      
      const checkPageBreak = (currentY: number, neededHeight: number) => {
        if (currentY + neededHeight > maxContentHeight) {
          doc.addPage();
          return 20; // New page start Y
        }
        return currentY;
      };

      // Header
      doc.setFontSize(22);
      doc.setTextColor(5, 150, 105); // emerald-600
      doc.text('EDRMS AI Intelligence Report', margin, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${activeDate}`, margin, 30);
      doc.text(`Total Reservations Analyzed: ${activeTotal}`, margin, 35);
      
      // OTA Leakage Section
      doc.setFontSize(16);
      doc.setTextColor(30);
      doc.text('OTA Leakage Analysis', margin, 50);
      
      autoTable(doc, {
        startY: 55,
        head: [['Metric', 'Value']],
        body: [
          ['Total OTA Reservations', activeOtaLeakage.count.toLocaleString()],
          ['Total OTA Revenue', `Rp ${activeOtaLeakage.revenue.toLocaleString()}`],
          ['Estimated OTA Fees (20%)', `Rp ${activeOtaLeakage.otaFee.toLocaleString()}`],
          ['Potential Direct Fees (5%)', `Rp ${activeOtaLeakage.directFee.toLocaleString()}`],
          ['Potential Annual Leakage', `Rp ${activeOtaLeakage.leakage.toLocaleString()}`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105] },
        margin: { left: margin, right: margin }
      });

      // AI Insights
      if (activeInsights.length > 0) {
        let currentY = (doc as any).lastAutoTable.finalY + 15;
        
        currentY = checkPageBreak(currentY, 15);
        doc.setFontSize(16);
        doc.setTextColor(30);
        doc.text('AI Strategic Insights', margin, currentY);
        currentY += 10;

        activeInsights.forEach((insight) => {
          // Estimate height for title and analysis
          const analysisLines = doc.splitTextToSize(insight.analysis, pageWidth - (margin * 2));
          const analysisHeight = (analysisLines.length * 5) + 15; // title + spacing + analysis
          
          currentY = checkPageBreak(currentY, analysisHeight);

          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(`${insight.category}: ${insight.title}`, margin, currentY);
          currentY += 7;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.text(analysisLines, margin, currentY);
          currentY += (analysisLines.length * 5) + 5;

          // Strategic Advice Header
          currentY = checkPageBreak(currentY, 10);
          doc.setFont('helvetica', 'bold');
          doc.text('Strategic Advice:', margin, currentY);
          currentY += 5;
          doc.setFont('helvetica', 'normal');
          
          insight.advice.forEach(adv => {
            const advLines = doc.splitTextToSize(`• ${adv}`, pageWidth - (margin * 2) - 6);
            const advHeight = (advLines.length * 5);
            
            currentY = checkPageBreak(currentY, advHeight);
            doc.text(advLines, margin + 6, currentY);
            currentY += advHeight;
          });
          
          currentY += 10;
        });
      }

      console.log('Saving PDF...');
      const fileName = `edrms_ai_report_${activeDate.replace(/[/:\s,]/g, '_')}.pdf`;
      doc.save(fileName);
      console.log('PDF saved successfully');
    } catch (err) {
      console.error('PDF Export Error:', err);
      setError('Failed to export PDF. Please check the console for details.');
    }
  };

  const exportToCsv = (reportData: AuditReport) => {
    try {
      const rows = [
        ['EDRMS AI Audit Report'],
        [`Generated on: ${new Date(reportData.created_at).toLocaleString()}`],
        [`Total Reservations: ${reportData.total_reservations}`],
        [''],
        ['OTA Leakage Analysis'],
        ['Metric', 'Value'],
        ['Total OTA Reservations', reportData.ota_leakage.count],
        ['Total OTA Revenue', reportData.ota_leakage.revenue],
        ['Estimated OTA Fees (20%)', reportData.ota_leakage.otaFee],
        ['Potential Direct Fees (5%)', reportData.ota_leakage.directFee],
        ['Potential Annual Leakage', reportData.ota_leakage.leakage],
        [''],
        ['AI Strategic Insights'],
        ['Category', 'Title', 'Analysis', 'Advice']
      ];

      reportData.insights.forEach(insight => {
        rows.push([
          insight.category,
          insight.title,
          insight.analysis,
          insight.advice.join(' | ')
        ]);
      });

      const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `edrms_audit_${new Date(reportData.created_at).toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('CSV Export Error:', err);
      setError('Failed to export CSV.');
    }
  };

  const generateInsights = async () => {
    if (data.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      // Prepare a summary of the data for the AI
      const summary = {
        totalReservations: data.length,
        totalRevenue: data.reduce((sum, item) => sum + Number(item.TotalRevenue), 0),
        segments: data.reduce((acc: any, item) => {
          acc[item.Segment || 'Unknown'] = (acc[item.Segment || 'Unknown'] || 0) + 1;
          return acc;
        }, {}),
        sources: data.reduce((acc: any, item) => {
          acc[item.SOB || 'Unknown'] = (acc[item.SOB || 'Unknown'] || 0) + 1;
          return acc;
        }, {}),
        averageLeadTime: data.reduce((sum, item) => {
          const created = new Date(item.CreatedDate);
          const arrival = new Date(item.Arrival);
          const leadTime = Math.max(0, Math.floor((arrival.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
          return sum + leadTime;
        }, 0) / data.length,
        monthlyDistribution: data.reduce((acc: any, item) => {
          if (!item.Arrival) return acc;
          const month = new Date(item.Arrival).toLocaleString('default', { month: 'short' });
          acc[month] = (acc[month] || 0) + 1;
          return acc;
        }, {})
      };

      const prompt = `
        Analyze the following hotel reservation performance data and provide strategic advice for four categories: Ecommerce, Distribution, Revenue, and Seasonality.
        
        Data Summary:
        - Total Reservations: ${summary.totalReservations}
        - Total Revenue: Rp ${summary.totalRevenue.toLocaleString()}
        - Market Segments: ${JSON.stringify(summary.segments)}
        - Source of Business: ${JSON.stringify(summary.sources)}
        - Average Lead Time: ${summary.averageLeadTime.toFixed(1)} days
        - Monthly Arrival Distribution: ${JSON.stringify(summary.monthlyDistribution)}
        
        Format the response as a JSON array of objects with the following structure:
        [
          {
            "category": "Ecommerce",
            "title": "...",
            "analysis": "...",
            "advice": ["...", "..."]
          },
          {
            "category": "Distribution",
            "title": "...",
            "analysis": "...",
            "advice": ["...", "..."]
          },
          {
            "category": "Revenue",
            "title": "...",
            "analysis": "...",
            "advice": ["...", "..."]
          },
          {
            "category": "Seasonality",
            "title": "...",
            "analysis": "...",
            "advice": ["...", "..."]
          }
        ]
        
        Ensure the advice is practical and based on the data provided.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '[]');
      setInsights(result);
    } catch (err: any) {
      console.error('AI Generation Error:', err);
      setError('Failed to generate AI insights. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (category: string) => {
    switch (category) {
      case 'Ecommerce': return <ShoppingBag className="text-blue-500" />;
      case 'Distribution': return <Globe className="text-emerald-500" />;
      case 'Revenue': return <TrendingUp className="text-purple-500" />;
      case 'Seasonality': return <CalendarRange className="text-orange-500" />;
      default: return <Brain className="text-slate-500" />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Brain size={24} />
            </div>
            <h2 className="text-2xl font-bold">EDRMS AI Intelligence</h2>
          </div>
          <p className="text-emerald-50 max-w-2xl leading-relaxed">
            Our advanced AI analyzes your reservation patterns, market segments, and revenue streams to provide actionable strategic advice for your hotel's growth.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button 
              onClick={generateInsights}
              disabled={loading}
              className="px-6 py-2.5 bg-white text-emerald-700 rounded-xl font-semibold flex items-center gap-2 hover:bg-emerald-50 transition-colors disabled:opacity-50 shadow-sm"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
              {insights.length > 0 ? 'Refresh Analysis' : 'Generate Insights'}
            </button>
            <button 
              onClick={() => exportToPdf()}
              disabled={insights.length === 0}
              className="px-6 py-2.5 bg-emerald-500/20 text-white border border-white/30 rounded-xl font-semibold flex items-center gap-2 hover:bg-emerald-500/30 transition-colors shadow-sm disabled:opacity-50"
            >
              <FileDown size={20} />
              Export to PDF
            </button>
            {insights.length > 0 && (
              <button 
                onClick={saveReport}
                disabled={saving}
                className="px-6 py-2.5 bg-emerald-700 text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-emerald-800 transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                Save Audit Report
              </button>
            )}
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-700 transition-colors shadow-sm"
            >
              <History size={20} />
              {showHistory ? 'Hide History' : 'Audit History'}
            </button>
          </div>
        </div>
        <div className="absolute top-0 right-0 -mt-8 -mr-8 opacity-10">
          <Brain size={240} />
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
                  Saved Audit Reports
                </h3>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{savedReports.length} Reports</span>
              </div>
              
              {savedReports.length === 0 ? (
                <div className="text-center py-10 text-slate-400 italic">
                  No saved reports found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-4 font-bold text-slate-500 text-xs uppercase tracking-wider">Date & Time</th>
                        <th className="pb-4 font-bold text-slate-500 text-xs uppercase tracking-wider text-center">Reservations</th>
                        <th className="pb-4 font-bold text-slate-500 text-xs uppercase tracking-wider text-right">OTA Leakage</th>
                        <th className="pb-4 font-bold text-slate-500 text-xs uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {savedReports.map((report) => (
                        <tr key={report.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 text-sm text-slate-700">
                            {new Date(report.created_at).toLocaleString()}
                          </td>
                          <td className="py-4 text-sm text-slate-700 text-center">
                            {report.total_reservations}
                          </td>
                          <td className="py-4 text-sm font-bold text-red-600 text-right">
                            Rp {report.ota_leakage.leakage.toLocaleString()}
                          </td>
                          <td className="py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => exportToPdf({
                                  insights: report.insights,
                                  otaLeakage: report.ota_leakage,
                                  totalReservations: report.total_reservations,
                                  createdAt: report.created_at
                                })}
                                className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                                title="Download PDF"
                              >
                                <FileDown size={18} />
                              </button>
                              <button
                                onClick={() => exportToCsv(report)}
                                className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                                title="Download CSV"
                              >
                                <Download size={18} />
                              </button>
                              <button
                                onClick={() => deleteReport(report.id)}
                                className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                                title="Delete Report"
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

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="animate-spin text-emerald-600" size={48} />
          <p className="text-slate-500 font-medium animate-pulse">AI is analyzing your performance data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex items-center gap-4 text-red-700">
          <AlertCircle size={24} />
          <p>{error}</p>
        </div>
      )}

      {/* OTA Leakage Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">OTA Leakage Analysis</h3>
                <p className="text-xs text-slate-500">Potential revenue lost to high OTA commissions</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Est. Leakage</span>
              <p className="text-xl font-black text-red-600">Rp {otaLeakage.leakage.toLocaleString()}</p>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase">OTA Revenue</p>
                <p className="text-lg font-bold text-slate-800">Rp {otaLeakage.revenue.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">{otaLeakage.count} OTA Reservations</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase">OTA Fees (20%)</p>
                <p className="text-lg font-bold text-red-500">Rp {otaLeakage.otaFee.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">Current estimated cost</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase">Direct Fees (5%)</p>
                <p className="text-lg font-bold text-emerald-600">Rp {otaLeakage.directFee.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">Potential direct cost</p>
              </div>
            </div>
            
            <div className="mt-8 p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                <TrendingUp size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-900">Conversion Opportunity</p>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  By shifting these OTA bookings to your direct website, you could save approximately <span className="font-bold">Rp {otaLeakage.leakage.toLocaleString()}</span> in commission fees.
                </p>
              </div>
              <ArrowRight className="text-emerald-400 ml-auto hidden md:block" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-lg mb-2">Direct Strategy</h4>
            <p className="text-sm text-slate-400 leading-relaxed">
              Focus on improving your direct booking engine and loyalty programs to capture the {((otaLeakage.leakage / otaLeakage.revenue) * 100 || 0).toFixed(1)}% revenue currently leaking to third parties.
            </p>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-700">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-500">Potential Savings</span>
              <span className="text-emerald-400 font-bold">15% Net</span>
            </div>
            <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-3/4"></div>
            </div>
          </div>
        </div>
      </div>

      {!loading && insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {insights.map((insight, idx) => (
            <motion.div 
              key={insight.category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-lg">
                  {getIcon(insight.category)}
                </div>
                <h3 className="font-bold text-slate-800">{insight.category} Strategy</h3>
              </div>
              <div className="p-6 flex-1 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-2">{insight.title}</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {insight.analysis}
                  </p>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Strategic Advice</p>
                  <ul className="space-y-2">
                    {insight.advice.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && insights.length === 0 && !error && (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
          <p className="text-slate-400">Click "Generate Insights" to start the AI analysis.</p>
        </div>
      )}
    </div>
  );
}
