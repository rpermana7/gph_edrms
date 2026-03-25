import { useEffect, useState, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { ReservationReport, DashboardStats } from './types/reservation';
import DashboardLayout from './components/DashboardLayout';
import { RevenueTrend, SegmentDistribution, SOBDistribution } from './components/Charts';
import { DistributionModule } from './components/DistributionModule';
import { RevenueModule } from './components/RevenueModule';
import EdrmsAi from './components/EdrmsAi';
import Settings from './components/Settings';
import { fetchRoomCountsFromDB, calculateTotalAvailableRoomNights } from './lib/rooms';
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
  ChevronLeft,
  RefreshCw
} from 'lucide-react';
import { format, parse, differenceInDays, min, max, startOfDay, endOfDay, addDays } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const DB_DATE_FORMAT = 'yyyy-MM-dd';

const parseDbDate = (dateStr: string | Date) => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  
  const str = String(dateStr);
  
  // Try standard Date parsing first (handles ISO strings, etc)
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // Try parsing just the date part if it has time
  const datePart = str.split(' ')[0].split('T')[0];
  const d2 = new Date(datePart);
  if (!isNaN(d2.getTime())) return d2;

  // Try parsing with the specified format
  try {
    let parsed = parse(datePart, DB_DATE_FORMAT, new Date());
    if (!isNaN(parsed.getTime())) return parsed;
    
    parsed = parse(datePart, 'dd/MM/yyyy', new Date());
    if (!isNaN(parsed.getTime())) return parsed;
    
    parsed = parse(datePart, 'MM/dd/yyyy', new Date());
    if (!isNaN(parsed.getTime())) return parsed;
    
    return new Date();
  } catch (e) {
    return new Date();
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
  const [datePerspective, setDatePerspective] = useState<'stay' | 'booking' | 'arrival'>('stay');
  const [dateRange, setDateRange] = useState({
    start: '2025-01-01',
    end: '2025-12-31'
  });
  const [appliedFilter, setAppliedFilter] = useState({
    perspective: 'stay' as 'stay' | 'booking' | 'arrival',
    range: { start: '2025-01-01', end: '2025-12-31' }
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadRoomCounts() {
      const counts = await fetchRoomCountsFromDB();
      setRoomCounts(counts);
    }
    
    loadRoomCounts();
    
    const handleRoomCountsUpdate = () => {
      loadRoomCounts();
    };
    
    window.addEventListener('roomCountsUpdated', handleRoomCountsUpdate);
    return () => window.removeEventListener('roomCountsUpdated', handleRoomCountsUpdate);
  }, []);

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

  const dashboardData = useMemo(() => {
    const { perspective, range } = appliedFilter;
    if (!range.start || !range.end) return data;
    
    const start = startOfDay(parseDbDate(range.start));
    const end = endOfDay(parseDbDate(range.end));

    return data.filter(item => {
      if (perspective === 'booking') {
        if (!item.CreatedDate) return false;
        const created = parseDbDate(item.CreatedDate);
        return created >= start && created <= end;
      } else if (perspective === 'arrival') {
        if (!item.Arrival) return false;
        const arrival = parseDbDate(item.Arrival);
        return arrival >= start && arrival <= end;
      } else {
        // stay dates
        if (!item.Arrival || !item.Departure) return false;
        const arrival = startOfDay(parseDbDate(item.Arrival));
        const departure = startOfDay(parseDbDate(item.Departure));
        // Overlaps if arrival <= end AND departure > start
        return arrival <= end && departure > start;
      }
    });
  }, [data, appliedFilter]);

  const stats = useMemo((): DashboardStats => {
    const { perspective, range } = appliedFilter;
    if (dashboardData.length === 0) return { totalRevenue: 0, totalRooms: 0, totalNights: 0, adr: 0, occupancyRate: 0, revPar: 0 };

    let totalRevenue = 0;
    let totalRoomNightsSold = 0;
    let availableRoomNights = 0;

    const start = range.start ? startOfDay(parseDbDate(range.start)) : undefined;
    const end = range.end ? endOfDay(parseDbDate(range.end)) : undefined;

    if (perspective === 'stay' && start && end) {
      // Explode into nightly stays
      dashboardData.forEach(item => {
        const arrival = startOfDay(parseDbDate(item.Arrival));
        const departure = startOfDay(parseDbDate(item.Departure));
        
        const overlapStart = max([arrival, start]);
        const overlapEnd = min([departure, addDays(end, 1)]); // departure is exclusive
        
        const overlapNights = Math.max(0, differenceInDays(overlapEnd, overlapStart));
        
        if (overlapNights > 0) {
          const dailyRevenue = Number(item.TotalRevenue) / (Number(item.Night) || 1);
          totalRevenue += dailyRevenue * overlapNights;
          totalRoomNightsSold += (Number(item.RoomQuantity) || 1) * overlapNights;
        }
      });
      availableRoomNights = calculateTotalAvailableRoomNights(start, end, roomCounts);
    } else {
      // Standard calculation for booking/arrival or if no date range
      totalRevenue = dashboardData.reduce((sum, item) => sum + Number(item.TotalRevenue), 0);
      totalRoomNightsSold = dashboardData.reduce((sum, item) => sum + (Number(item.RoomQuantity || 1) * Number(item.Night || 1)), 0);
      
      if (start && end) {
        availableRoomNights = calculateTotalAvailableRoomNights(start, end, roomCounts);
      } else {
        // Fallback if no date range selected
        const arrivalDates = dashboardData.map(item => parseDbDate(item.Arrival));
        const departureDates = dashboardData.map(item => parseDbDate(item.Departure));
        const minDate = arrivalDates.length ? min(arrivalDates) : new Date();
        const maxDate = departureDates.length ? max(departureDates) : new Date();
        availableRoomNights = calculateTotalAvailableRoomNights(minDate, maxDate, roomCounts);
      }
    }
    
    const adr = totalRoomNightsSold > 0 ? totalRevenue / totalRoomNightsSold : 0;
    const occupancyRate = availableRoomNights > 0 ? Math.min(100, (totalRoomNightsSold / availableRoomNights) * 100) : 0;
    const revPar = availableRoomNights > 0 ? totalRevenue / availableRoomNights : 0;

    return { 
      totalRevenue, 
      totalRooms: totalRoomNightsSold, 
      totalNights: totalRoomNightsSold, 
      adr, 
      occupancyRate: Math.round(occupancyRate * 10) / 10, 
      revPar 
    };
  }, [dashboardData, appliedFilter, roomCounts]);

  const filteredData = useMemo(() => {
    return dashboardData.filter(item => {
      const matchesSearch = 
        item.GuestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.ReservationNumber?.toString().includes(searchTerm) ||
        item.RoomNumber?.includes(searchTerm);
      
      const matchesStatus = statusFilter === 'All' || item.Status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [dashboardData, searchTerm, statusFilter]);

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
    
    if (activeTab === 'settings') {
      return <Settings />;
    }

    return (
      <>
        {/* Dashboard Header / Global Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-bold text-slate-800">
            {activeTab === 'overview' && 'Dashboard Overview'}
            {activeTab === 'revenue' && 'Revenue Performance'}
            {activeTab === 'reservations' && 'Reservations'}
            {activeTab === 'distribution' && 'Distribution'}
            {activeTab === 'guests' && 'Guest Insights'}
          </h2>
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center border-r border-slate-100 pr-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">Perspective:</span>
              <select 
                className="text-sm border-none bg-transparent text-emerald-700 font-bold focus:ring-0 cursor-pointer"
                value={datePerspective}
                onChange={(e) => setDatePerspective(e.target.value as any)}
              >
                <option value="stay">Stay Dates (Accrual)</option>
                <option value="booking">Booking Date (Pace)</option>
                <option value="arrival">Arrival Date (Operations)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pl-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Range:</span>
              <DatePicker
                selected={dateRange.start ? parseDbDate(dateRange.start) : null}
                onChange={(date) => setDateRange(prev => ({ ...prev, start: date ? format(date, 'yyyy-MM-dd') : '' }))}
                dateFormat="dd/MM/yyyy"
                className="text-sm border-none bg-slate-50 rounded-lg px-3 py-1.5 text-slate-700 focus:ring-2 focus:ring-emerald-500 font-medium w-28"
                placeholderText="dd/mm/yyyy"
              />
              <span className="text-slate-400">-</span>
              <DatePicker
                selected={dateRange.end ? parseDbDate(dateRange.end) : null}
                onChange={(date) => setDateRange(prev => ({ ...prev, end: date ? format(date, 'yyyy-MM-dd') : '' }))}
                dateFormat="dd/MM/yyyy"
                className="text-sm border-none bg-slate-50 rounded-lg px-3 py-1.5 text-slate-700 focus:ring-2 focus:ring-emerald-500 font-medium w-28"
                placeholderText="dd/mm/yyyy"
              />
            </div>
            <div className="pl-2 border-l border-slate-100">
              <button 
                onClick={() => setAppliedFilter({ perspective: datePerspective, range: dateRange })}
                className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors flex items-center justify-center"
                title="Apply Filters"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'overview' && (
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
            <div className="grid grid-cols-1 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
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
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6">Segment Distribution</h3>
                <SegmentDistribution data={dashboardData} />
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6">Source of Business (SOB)</h3>
                <SOBDistribution data={dashboardData} />
              </div>
            </div>
          </>
        )}

        {activeTab === 'distribution' && (
          <DistributionModule data={dashboardData} />
        )}

        {activeTab === 'revenue' && (
          <RevenueModule data={dashboardData} />
        )}

        {activeTab === 'reservations' && (
          <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Reservations</h3>
            <p className="text-slate-500">The reservations module is coming soon.</p>
          </div>
        )}

        {activeTab === 'guests' && (
          <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Guest Insights</h3>
            <p className="text-slate-500">The guest insights module is coming soon.</p>
          </div>
        )}
      </>
    );
  };

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </DashboardLayout>
  );
}
