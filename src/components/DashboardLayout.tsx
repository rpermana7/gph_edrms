import React from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  TrendingUp, 
  Settings, 
  LogOut,
  Hotel,
  PieChart as PieChartIcon
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center w-full gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-lg",
      active 
        ? "bg-emerald-50 text-emerald-700" 
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    )}
  >
    <Icon size={20} />
    {label}
  </button>
);

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function DashboardLayout({ children, activeTab, onTabChange }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-6 border-bottom border-slate-100">
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-xl">
            <Hotel size={28} />
            <span className="tracking-tight">GPH EDRMS</span>
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1 font-semibold">
            Grand Permata Hijau
          </p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Overview" 
            active={activeTab === 'overview'} 
            onClick={() => onTabChange('overview')}
          />
          <SidebarItem 
            icon={TrendingUp} 
            label="Revenue Performance" 
            active={activeTab === 'revenue'} 
            onClick={() => onTabChange('revenue')}
          />
          <SidebarItem 
            icon={Calendar} 
            label="Reservations" 
            active={activeTab === 'reservations'} 
            onClick={() => onTabChange('reservations')}
          />
          <SidebarItem 
            icon={PieChartIcon} 
            label="Distribution" 
            active={activeTab === 'distribution'} 
            onClick={() => onTabChange('distribution')}
          />
          <SidebarItem 
            icon={Users} 
            label="Guest Insights" 
            active={activeTab === 'guests'} 
            onClick={() => onTabChange('guests')}
          />
          <div className="pt-4 pb-2 px-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Intelligence</p>
          </div>
          <SidebarItem 
            icon={TrendingUp} 
            label="EDRMS AI" 
            active={activeTab === 'ai'} 
            onClick={() => onTabChange('ai')}
          />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <SidebarItem 
            icon={Settings} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => onTabChange('settings')}
          />
          <SidebarItem icon={LogOut} label="Logout" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 sticky top-0 z-10">
          <h1 className="text-lg font-semibold text-slate-800">
            {activeTab === 'ai' ? 'EDRMS AI Intelligence' : 
             activeTab === 'settings' ? 'Settings' : 
             'Revenue Dashboard'}
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">Admin User</p>
              <p className="text-xs text-slate-500">Revenue Manager</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold">
              AU
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
