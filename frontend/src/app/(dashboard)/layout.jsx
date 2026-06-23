'use client';
import React from 'react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { PrivateRoute } from '@/components/RouteGuards';

export default function AppDashboardLayout({ children }) {
  return (
    <PrivateRoute>
      <DashboardLayout>{children}</DashboardLayout>
    </PrivateRoute>
  );
}
