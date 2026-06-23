import React, { useState, useEffect } from 'react';
import { chatbotService } from '@/services/chatbotService';
import { Save, AlertCircle } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

export default function LeadCollectionTab({ domain }) {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await chatbotService.getLeadConfig(domain.id);
        setConfig(data);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load lead collection configuration.');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [domain.id, toast]);

  const handleFieldChange = (field) => {
    if (!config) return;
    const newFields = config.fields.includes(field)
      ? config.fields.filter(f => f !== field)
      : [...config.fields, field];
      
    // If no fields are selected, force status to inactive and limit to 0
    if (newFields.length === 0) {
      setConfig({ ...config, fields: newFields, status: false, limit: 0 });
    } else {
      setConfig({ ...config, fields: newFields });
    }
  };

  const handleStatusChange = (newStatus) => {
    if (!config) return;
    if (newStatus && config.fields.length === 0) {
       toast.error("Please select at least one field to collect before enabling.");
       return;
    }
    setConfig({ ...config, status: newStatus });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await chatbotService.updateLeadConfig(domain.id, config);
      toast.success("Lead collection settings updated successfully!");
    } catch(e) {
      console.error(e);
      toast.error("Failed to update lead collection settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
     return <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div></div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Lead Collection</h3>
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
               onChange={(e) => setConfig({...config, limit: parseInt(e.target.value) || 0})}
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

        <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
           <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
           >
              <Save size={18} /> {saving ? 'Saving...' : 'Save Settings'}
           </button>
        </div>
      </div>
    </div>
  );
}
