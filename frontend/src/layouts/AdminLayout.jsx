'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { confirmAction } from '@/utils/confirm';
import logo from '@/assets/chatbot-logo.png';
import { 
  Activity, 
  Users, 
  Server,
  LogOut,
  Menu,
  X,
  MessageCircle,
  Key
} from 'lucide-react';

import ProfileSettingsModal from '@/components/ProfileSettingsModal';

export default function AdminLayout({ children }) {
  const { userData, logout } = useAuth();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => localStorage.getItem('desktopAdminSidebarCollapsed') === 'true');

  useEffect(() => {
    localStorage.setItem('desktopAdminSidebarCollapsed', desktopSidebarCollapsed);
  }, [desktopSidebarCollapsed]);

  const handleLogout = async () => {
    const isConfirmed = await confirmAction({
      title: 'Ready to leave?',
      text: 'Are you sure you want to log out?',
      confirmButtonText: 'Yes, Logout',
      icon: 'question'
    });
    
    if (!isConfirmed) return;

    try {
      await logout();
      toast.success('Logged out successfully');
      router.push('/login');
    } catch (e) {
      console.error(e);
      toast.error('Failed to log out');
    }
  };

  const navItems = [
    { name: 'Operations Overview', path: '/admin', icon: Activity, exact: true },
    { name: 'Subscribers', path: '/admin/subscribers', icon: Users },

    { name: 'Environment Config', path: '/admin/env', icon: Key },
  ];

  const sidebarWidthClass = desktopSidebarCollapsed ? 'w-16' : 'w-64';

  return (
    <div className="flex h-screen bg-slate-50 text-gray-700 overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/40 z-[60] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-[70] ${sidebarWidthClass} border-r border-gray-200 bg-white flex flex-col transform transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}`}>
        <div className={`flex items-center p-4 border-b border-gray-200 h-16 shrink-0 ${desktopSidebarCollapsed && !sidebarOpen ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 shrink-0 rounded-xl bg-blue-600 flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Logo" className="w-full h-full object-cover" />
            </div>
            {(!desktopSidebarCollapsed || sidebarOpen) && (
              <div className="whitespace-nowrap transition-opacity duration-300">
                <span className="font-bold text-lg text-gray-900 block leading-tight">Chat Bot</span>
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Platform Admin</span>
              </div>
            )}
          </div>
          <button className="md:hidden text-gray-500 hover:text-blue-600" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact 
              ? pathname === item.path 
              : pathname.startsWith(item.path);
              
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 overflow-hidden ${
                  isActive ? 'bg-blue-100 text-blue-600 font-medium' : 'text-gray-500 hover:text-blue-600 hover:bg-gray-50'
                } ${desktopSidebarCollapsed && !sidebarOpen ? 'justify-center px-0' : ''}`}
                onClick={() => setSidebarOpen(false)}
                title={desktopSidebarCollapsed ? item.name : ''}
              >
                <Icon size={18} className="shrink-0" />
                {(!desktopSidebarCollapsed || sidebarOpen) && (
                  <span className="font-medium text-sm whitespace-nowrap">{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200 bg-white">
          {(!desktopSidebarCollapsed || sidebarOpen) ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
              <div className="w-10 h-10 shrink-0 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shadow-sm">
                {userData?.email?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-900 font-medium truncate">{userData?.email}</p>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
                  Super Admin
                </span>
              </div>
              <button onClick={handleLogout} className="p-2 shrink-0 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button onClick={handleLogout} className="p-3 w-full flex justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-gray-200 bg-gray-50" title="Logout">
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 relative">
        <header className="h-16 shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-200 z-[50] sticky top-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-gray-100 p-2 rounded-xl transition-all" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <button 
              className="hidden md:flex text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-gray-100 p-2 rounded-xl transition-all" 
              onClick={() => setDesktopSidebarCollapsed(!desktopSidebarCollapsed)}
              title={desktopSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu size={20} />
            </button>
            <div className="w-px h-6 bg-gray-200 hidden md:block"></div>
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {navItems.find(i => (i.exact ? pathname === i.path : pathname.startsWith(i.path)))?.name || 'Admin Panel'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <ProfileSettingsModal />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 relative">
          <div className="relative z-10 w-full h-full max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
