import React, { useState, useEffect, useRef } from 'react';
import { chatbotService } from '@/services/chatbotService';
import { AlertCircle } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

export default function LeadCollectionTab({ domain }) {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('loading');

  const saveTimeoutRef = useRef(null);
  const latestConfigRef = useRef(null);
  const saveVersionRef = useRef(0);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await chatbotService.getLeadConfig(domain.id);
        setConfig(data);
        latestConfigRef.current = data;
        setSaveStatus('saved');
      } catch (err) {
        console.error(err);
        toast.error('Failed to load lead collection configuration.');
        setSaveStatus('error');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [domain.id, toast]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Best effort final save if there's a pending change
        if (latestConfigRef.current) {
          chatbotService.updateLeadConfig(domain.id, latestConfigRef.current).catch(() => {});
        }
      }
    };
  }, [domain.id]);

  const saveConfig = async (configToSave) => {
    const currentVersion = ++saveVersionRef.current;
    
    // Abort previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSaveStatus('saving');
    try {
      await chatbotService.updateLeadConfig(domain.id, configToSave, { signal: controller.signal });
      if (currentVersion === saveVersionRef.current) {
        setSaveStatus('saved');
      }
    } catch (err) {
      // Ignore request cancellation errors
      const isCancel = err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.message === 'canceled';
      if (isCancel) {
        return;
      }
      
      if (currentVersion === saveVersionRef.current) {
        console.error(err);
        setSaveStatus('error');
        toast.error("Failed to auto-save lead collection settings.");
      }
    }
  };

  const queueSave = (newConfig, immediate = false) => {
    setConfig(newConfig);
    latestConfigRef.current = newConfig;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveStatus('saving');

    saveTimeoutRef.current = setTimeout(
      () => {
        saveConfig(newConfig);
      },
      immediate ? 200 : 800
    );
  };

  const handleFieldChange = (field) => {
    if (!config) return;
    const newFields = config.fields.includes(field)
      ? config.fields.filter(f => f !== field)
      : [...config.fields, field];
      
    // If no fields are selected, force status to inactive and limit to 0
    let updated;
    if (newFields.length === 0) {
      updated = { ...config, fields: newFields, status: false, limit: 0 };
    } else {
      updated = { ...config, fields: newFields };
    }
    queueSave(updated, true);
  };

  const handleStatusChange = (newStatus) => {
    if (!config) return;
    if (newStatus && config.fields.length === 0) {
       toast.error("Please select at least one field to collect before enabling.");
       return;
    }
    const updated = { ...config, status: newStatus };
    queueSave(updated, true);
  };

  if (loading || !config) {
     return (
       <div className="p-8 text-center">
         <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
       </div>
     );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-gray-900">Lead Collection</h3>
              {saveStatus === 'saving' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Error saving
                  </span>
                  <button 
                    onClick={() => saveConfig(config)}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">Configure when and how to ask users for their contact details.</p>
          </div>
          
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={config.status}
              onChange={(e) => handleStatusChange(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        {/* Warning / Explanation Text */}
        <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 flex gap-3 text-sm text-blue-800">
          <AlertCircle size={20} className="shrink-0 text-blue-500" />
          <div>
            <strong>Lead Collection is {config.status ? 'Enabled' : 'Disabled'}.</strong><br/>
            {config.status 
              ? "The widget will ask users for their contact details according to your settings below. Users will not be able to continue chatting until they provide this information."
              : "Users can chat anonymously without providing any contact details. Toggle this on if you want to capture leads."}
          </div>
        </div>

        <div className={`space-y-6 transition-opacity ${!config.status ? 'opacity-60' : ''}`}>
          
          <div>
             <label className="block text-sm font-medium text-gray-900 mb-2">Trigger Limit</label>
             <p className="text-xs text-gray-500 mb-3">Ask for contact details after the user sends this many messages.</p>
             <input 
               type="number"
               min="0"
               value={config.limit}
               onChange={(e) => {
                 const val = parseInt(e.target.value) || 0;
                 queueSave({ ...config, limit: val }, false);
               }}
               onBlur={() => {
                 if (saveTimeoutRef.current) {
                   clearTimeout(saveTimeoutRef.current);
                   saveConfig(latestConfigRef.current);
                 }
               }}
               className="w-full sm:w-48 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
             />
          </div>

          <div className="pt-4 border-t border-gray-100">
             <label className="block text-sm font-medium text-gray-900 mb-2">Fields to Collect</label>
             <p className="text-xs text-gray-500 mb-4">Select which information to request from the user.</p>
             
             <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={config.fields.includes('name')} onChange={() => handleFieldChange('name')} className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300" />
                   <span className="text-sm text-gray-700">Full Name</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={config.fields.includes('email')} onChange={() => handleFieldChange('email')} className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300" />
                   <span className="text-sm text-gray-700">Email Address</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={config.fields.includes('phone')} onChange={() => handleFieldChange('phone')} className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300" />
                   <span className="text-sm text-gray-700">Phone Number</span>
                </label>
             </div>
             
             {config.fields.length === 0 && (
                <div className="flex items-center gap-2 mt-3 text-amber-600 text-xs bg-amber-50 p-2 rounded-lg">
                   <AlertCircle size={14} /> You must select at least one field to enable lead collection.
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
