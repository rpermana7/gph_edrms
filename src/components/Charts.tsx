import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { format, parse } from 'date-fns';
import { ReservationReport } from '../types/reservation';

const DB_DATE_FORMAT = 'yyyy-MM-dd';

const parseDbDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  try {
    const parsed = parse(dateStr, DB_DATE_FORMAT, new Date());
    return isNaN(parsed.getTime()) ? new Date(dateStr) : parsed;
  } catch (e) {
    return new Date(dateStr);
  }
};

interface ChartProps {
  data: ReservationReport[];
  filterMonthYear?: string;
}

export const RevenueTrend = ({ data, filterMonthYear = 'All' }: ChartProps) => {
  // Filter for DEPARTED status only (case-insensitive)
  let departedData = data.filter(item => 
    item.Status?.toString().toUpperCase() === 'DEPARTED'
  );

  // Filter by month/year if selected
  if (filterMonthYear !== 'All') {
    departedData = departedData.filter(item => {
      const date = parseDbDate(item.Arrival);
      return format(date, 'MMMM yyyy') === filterMonthYear;
    });
  }

  // Group by date (include year in key to avoid collisions in All Time view)
  const grouped = departedData.reduce((acc: any, curr) => {
    const dateObj = parseDbDate(curr.Arrival);
    const dateKey = format(dateObj, 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = 0;
    acc[dateKey] += Number(curr.TotalRevenue);
    return acc;
  }, {});

  const chartData = Object.keys(grouped).map(dateKey => ({
    dateKey,
    displayDate: format(new Date(dateKey), 'MMM dd'),
    revenue: grouped[dateKey]
  })).sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="displayDate" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#64748b' }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(value) => `Rp ${value.toLocaleString()}`}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            formatter={(value: any) => [`Rp ${value.toLocaleString()}`, 'Revenue']}
          />
          <Line 
            type="monotone" 
            dataKey="revenue" 
            stroke="#10b981" 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export const SegmentDistribution = ({ data }: ChartProps) => {
  const grouped = data.reduce((acc: any, curr) => {
    const segment = curr.Segment || 'Unknown';
    if (!acc[segment]) acc[segment] = 0;
    acc[segment] += 1;
    return acc;
  }, {});

  const chartData = Object.keys(grouped).map(name => ({
    name,
    value: grouped[name]
  }));

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend verticalAlign="bottom" height={36}/>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export const SOBDistribution = ({ data }: ChartProps) => {
  const grouped = data.reduce((acc: any, curr) => {
    const sob = curr.SOB || 'Direct';
    if (!acc[sob]) acc[sob] = 0;
    acc[sob] += Number(curr.TotalRevenue);
    return acc;
  }, {});

  const chartData = Object.keys(grouped).map(name => ({
    name,
    revenue: grouped[name]
  })).sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
          <XAxis type="number" hide />
          <YAxis 
            dataKey="name" 
            type="category" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#64748b' }}
            width={80}
          />
          <Tooltip 
            cursor={{ fill: '#f8fafc' }}
            formatter={(value: any) => [`Rp ${value.toLocaleString()}`, 'Revenue']}
          />
          <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
