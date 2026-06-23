'use client';
import React from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { AdminRoute } from '@/components/RouteGuards';

export default function AppAdminLayout({ children }) {
  return (
    <AdminRoute>
      <AdminLayout>{children}</AdminLayout>
    </AdminRoute>
  );
}
