import { useState, useEffect } from 'react';
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
  CalendarRange
} from 'lucide-react';
import { motion } from 'motion/react';

interface EdrmsAiProps {
  data: ReservationReport[];
}

interface AiInsight {
  category: 'Ecommerce' | 'Distribution' | 'Revenue' | 'Seasonality';
  title: string;
  analysis: string;
  advice: string[];
}

export default function EdrmsAi({ data }: EdrmsAiProps) {
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <button 
            onClick={generateInsights}
            disabled={loading}
            className="mt-6 px-6 py-2.5 bg-white text-emerald-700 rounded-xl font-semibold flex items-center gap-2 hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            {insights.length > 0 ? 'Refresh Analysis' : 'Generate Insights'}
          </button>
        </div>
        <div className="absolute top-0 right-0 -mt-8 -mr-8 opacity-10">
          <Brain size={240} />
        </div>
      </div>

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
