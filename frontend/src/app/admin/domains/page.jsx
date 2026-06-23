'use client';
import React, { useEffect, useState } from 'react';
import { db } from '@/firebase/config';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { Globe, Activity, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function DomainMonitor() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Admin sees ALL domains across the platform
    const q = query(collection(db, 'domains'));
    const unsub = onSnapshot(q, (snap) => {
      const data = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      // Sort by created_at desc in memory
      data.sort((a, b) => {
        const valA = a.created_at || '';
        const valB = b.created_at || '';
        return valB.localeCompare(valA);
      });
      setDomains(data);
      setLoading(false);
    }, (err) => {
      console.error("Firestore onSnapshot error:", err);
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Globe className="text-blue-500" /> Global Domain Monitor
          </h1>
          <p className="text-gray-500 text-sm mt-1">Supervise all active chat widget deployments across the platform.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="p-12 text-center text-gray-500"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div></div>
        ) : domains.length === 0 ? (
          <div className="p-16 text-center text-gray-500">No domains registered on the platform.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-blue-500/20 bg-gray-50">
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Domain / Website</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Subscriber UID</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Provider</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Widget Theme</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-500/10">
                {domains.map(d => (
                  <tr key={d.id} className="hover:bg-red-900/10 transition-colors">
                    <td className="p-4">
                      <p className="text-sm font-bold text-gray-900">{d.name}</p>
                      <a href={d.domain_url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline mt-0.5 inline-block">
                         {d.domain_url}
                      </a>
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-mono text-gray-500 bg-white shadow-sm border-gray-200 px-2 py-1 rounded">
                         {d.user_id?.substring(0, 8)}...
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase">
                         <Activity size={14} className="text-gray-500" />
                         {d.embedding_provider}
                      </span>
                    </td>
                    <td className="p-4">
                       <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full border border-white/20" style={{backgroundColor: d.widget_theme_color}}></div>
                          <span className="text-xs font-mono text-gray-500 uppercase">{d.widget_theme_color}</span>
                       </div>
                    </td>
                    <td className="p-4 text-right">
                       {d.is_active ? (
                         <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 border border-blue-200 text-blue-600 text-xs font-bold uppercase rounded-xl">
                           <ShieldCheck size={14} /> Active
                         </span>
                       ) : (
                         <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-500/10 border border-slate-500/20 text-gray-500 text-xs font-bold uppercase rounded-xl">
                           <AlertTriangle size={14} /> Disabled
                         </span>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
