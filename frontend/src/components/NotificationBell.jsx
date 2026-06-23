'use client';
import React from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { useRouter } from 'next/navigation';

export default function NotificationBell() {
  const { total_unread } = useNotifications();
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/conversations')}
      className="relative p-2 text-gray-500 hover:text-gray-700 rounded-xl hover:bg-white border-gray-200 transition-all focus:outline-none"
      title="View conversations"
    >
      <Bell size={20} />
      {total_unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-blue-600 rounded-full text-[9px] font-extrabold text-gray-900 flex items-center justify-center animate-pulse shadow-md shadow-blue-500/20">
          {total_unread}
        </span>
      )}
    </button>
  );
}
