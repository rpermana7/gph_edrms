import { useEffect, useState, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { ReservationReport, DashboardStats } from './types/reservation';
import DashboardLayout from './components/DashboardLayout';
import { RevenueTrend, SegmentDistribution, SOBDistribution } from './components/Charts';
import EdrmsAi from './components/EdrmsAi';
import { TOTAL_HOTEL_ROOMS } from './constants';
import { 
  TrendingUp, 
  Users, 
  Bed, 
  DollarSign, 
  Search, 
  Filter,
  AlertCircle,
  Download,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { format, parse, differenceInDays, min, max } from 'date-fns';

const DB_DATE_FORMAT = 'yyyy-MM-dd';

const parseDbDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  // Try parsing with the specified format, fallback to standard parsing if it fails
  try {
    const parsed = parse(dateStr, DB_DATE_FORMAT, new Date());
    return isNaN(parsed.getTime()) ? new Date(dateStr) : parsed;
  } catch (e) {
    return new Date(dateStr);
  }
};

const StatCard = ({ title, value, subValue, icon: Icon, color, formula }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
    <div className="flex items-start justify-between mb-4">
      <div>
        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
        {subValue && <p className="text-xs text-slate-400 mt-1 font-medium">{subValue}</p>}
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon size={24} />
      </div>
    </div>
    {formula && (
      <div className="mt-auto pt-4 border-t border-slate-100">
        <p className="text-[10px] text-slate-500 font-mono bg-slate-50 p-2 rounded-lg">
          {formula}
        </p>
      </div>
    )}
  </div>
);

export default function App() {
  const [data, setData] = useState<ReservationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedMonthYear, setSelectedMonthYear] = useState('All');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const { data: reservations, error } = await supabase
          .from('reservation_report')
          .select('*')
          .order('Arrival', { ascending: false });

        if (error) throw error;
        setData(reservations || []);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const stats = useMemo((): DashboardStats => {
    if (data.length === 0) return { totalRevenue: 0, totalRooms: 0, totalNights: 0, adr: 0, occupancyRate: 0, revPar: 0 };

    const totalRevenue = data.reduce((sum, item) => sum + Number(item.TotalRevenue), 0);
    const totalRoomNightsSold = data.reduce((sum, item) => sum + (Number(item.RoomQuantity || 1) * Number(item.Night || 1)), 0);
    
    // Calculate date range to find available room nights
    const arrivalDates = data.map(item => parseDbDate(item.Arrival));
    const departureDates = data.map(item => parseDbDate(item.Departure));
    
    const startDate = min(arrivalDates);
    const endDate = max(departureDates);
    const daysInRange = Math.max(1, differenceInDays(endDate, startDate));
    
    const availableRoomNights = TOTAL_HOTEL_ROOMS * daysInRange;
    
    const adr = totalRoomNightsSold > 0 ? totalRevenue / totalRoomNightsSold : 0;
    const occupancyRate = Math.min(100, (totalRoomNightsSold / availableRoomNights) * 100);
    const revPar = totalRevenue / availableRoomNights;

    return { 
      totalRevenue, 
      totalRooms: totalRoomNightsSold, 
      totalNights: totalRoomNightsSold, 
      adr, 
      occupancyRate: Math.round(occupancyRate * 10) / 10, 
      revPar 
    };
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = 
        item.GuestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.ReservationNumber?.toString().includes(searchTerm) ||
        item.RoomNumber?.includes(searchTerm);
      
      const matchesStatus = statusFilter === 'All' || item.Status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [data, searchTerm, statusFilter]);

  const availableMonthsYears = useMemo(() => {
    const monthsYears = new Set<string>();
    data.forEach(item => {
      if (item.Arrival) {
        const date = parseDbDate(item.Arrival);
        monthsYears.add(format(date, 'MMMM yyyy'));
      }
    });
    return Array.from(monthsYears).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading EDRMS Data...</p>
        </div>
      </div>
    );
  }

  if (error && !data.length) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-red-100 shadow-xl text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Connection Error</h2>
          <p className="text-slate-500 mb-6">We couldn't connect to your Supabase database. Please check your environment variables.</p>
          <div className="bg-slate-50 p-4 rounded-lg text-left mb-6">
            <p className="text-xs font-mono text-slate-600 break-all">{error}</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (activeTab === 'ai') {
      return <EdrmsAi data={data} />;
    }

    return (
      <>
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard 
            title="Total Revenue" 
            value={`Rp ${stats.totalRevenue.toLocaleString()}`} 
            subValue={`${stats.totalRooms} Rooms Sold`}
            icon={DollarSign} 
            color="bg-emerald-50 text-emerald-600"
          />
          <StatCard 
            title="ADR" 
            value={`Rp ${Math.round(stats.adr).toLocaleString()}`} 
            subValue="Average Daily Rate"
            icon={TrendingUp} 
            color="bg-blue-50 text-blue-600"
            formula="Total Revenue ÷ Rooms Sold"
          />
          <StatCard 
            title="Occupancy" 
            value={`${stats.occupancyRate}%`} 
            subValue="Current Period"
            icon={Bed} 
            color="bg-amber-50 text-amber-600"
            formula="Rooms Sold ÷ Total Available Rooms"
          />
          <StatCard 
            title="RevPAR" 
            value={`Rp ${Math.round(stats.revPar).toLocaleString()}`} 
            subValue="Revenue Per Available Room"
            icon={Users} 
            color="bg-purple-50 text-purple-600"
            formula="Total Revenue ÷ Total Available Rooms"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-800">Revenue Trend (Departed)</h3>
              <select 
                className="text-sm border-none bg-slate-50 rounded-lg px-3 py-1 text-slate-600 focus:ring-0"
                value={selectedMonthYear}
                onChange={(e) => setSelectedMonthYear(e.target.value)}
              >
                <option value="All">All Time</option>
                {availableMonthsYears.map(my => (
                  <option key={my} value={my}>{my}</option>
                ))}
              </select>
            </div>
            <RevenueTrend data={data} filterMonthYear={selectedMonthYear} />
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-6">Segment Distribution</h3>
            <SegmentDistribution data={data} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-6">Source of Business (SOB)</h3>
            <SOBDistribution data={data} />
          </div>
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-bold text-slate-800">Recent Reservations</h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="Search guest, room..." 
                    className="pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 w-full sm:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-100">
                  <Filter size={20} />
                </button>
                <button className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100">
                  <Download size={20} />
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Guest</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stay</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Room</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.slice(0, 10).map((item) => (
                    <tr key={item.No} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.GuestName}</p>
                          <p className="text-xs text-slate-400">#{item.ReservationNumber}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-slate-600">
                          <p>{format(parseDbDate(item.Arrival), 'dd MMM')} - {format(parseDbDate(item.Departure), 'dd MMM')}</p>
                          <p className="text-slate-400">{item.Night} Nights</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs">
                          <p className="font-medium text-slate-700">{item.RoomType}</p>
                          <p className="text-slate-400">Room {item.RoomNumber}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-900">Rp {Number(item.TotalRevenue).toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          item.Status === 'Checked In' ? 'bg-emerald-100 text-emerald-700' :
                          item.Status === 'Reserved' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {item.Status || 'Confirmed'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-slate-300 hover:text-slate-600 group-hover:bg-white rounded-lg transition-all">
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 bg-slate-50/30 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">Showing {Math.min(filteredData.length, 10)} of {filteredData.length} entries</p>
              <div className="flex items-center gap-2">
                <button className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30" disabled>
                  <ChevronLeft size={20} />
                </button>
                <button className="p-1 text-slate-400 hover:text-slate-600">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </DashboardLayout>
  );
}
