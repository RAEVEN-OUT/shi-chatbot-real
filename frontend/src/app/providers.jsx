'use client';
import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { TaskProvider } from '@/contexts/TaskContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { NotificationProvider } from '@/contexts/NotificationContext';

import GlobalAppLoader from '@/components/system/GlobalAppLoader';
import AmbientBackground from '@/components/system/AmbientBackground';
import GlobalTaskWidget from '@/components/system/GlobalTaskWidget';

export function Providers({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <NotificationProvider>
          <TaskProvider>
            <GlobalAppLoader>
              <AmbientBackground />
              <GlobalTaskWidget />
              {children}
            </GlobalAppLoader>
          </TaskProvider>
        </NotificationProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
