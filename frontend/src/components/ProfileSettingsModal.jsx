'use client';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/utils/api';

export default function ProfileSettingsModal() {
  const { userData, updateProfileData } = useAuth();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [customTimeStamp, setCustomTimeStamp] = useState('');
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    setCustomTimeStamp(userData?.custom_time_stamp || '');
    setIsOpen(true);
  };

  const closeModal = () => setIsOpen(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (customTimeStamp) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: customTimeStamp });
      } catch (error) {
        toast.error('Invalid timezone format. Please use IANA format (e.g., Asia/Kolkata).');
        return;
      }
    }
    
    setSaving(true);
    try {
      await api.put('/auth/profile', {
        custom_time_stamp: customTimeStamp || null
      });
      // Optionally update context here if `updateProfileData` exists
      if (updateProfileData) {
        updateProfileData({ custom_time_stamp: customTimeStamp || null });
      } else {
        // Fallback: reload page to fetch new profile data
        window.location.reload();
      }
      toast.success('Profile updated successfully');
      closeModal();
    } catch (error) {
      toast.error('Failed to update profile settings');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button 
        onClick={openModal}
        className="p-2 text-gray-500 hover:text-gray-700 bg-white border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
        title="Profile Settings"
      >
        <Settings size={20} />
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-gray-900/40 backdrop-blur-sm  flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Settings size={18} /> Profile Settings
              </h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700 p-1">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Display Timezone</label>
                <select value={customTimeStamp} onChange={e => setCustomTimeStamp(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-blue-500 text-sm">
                  <option value="">Default (Browser Local Time)</option>
                  <option value="Europe/London">UK (GMT/BST)</option>
                  <option value="America/Toronto">Canada (EST/EDT)</option>
                  <option value="Asia/Kolkata">India (IST)</option>
                </select>
                <p className="text-[10px] text-gray-500 mt-2">
                  Leave blank to use your browser's default local time. Timezones must be in IANA format (e.g. Asia/Kolkata).
                </p>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 py-2 text-sm bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-900 rounded-xl transition-colors border border-gray-200">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-gray-900 rounded-xl font-bold transition-colors disabled:opacity-50 border border-blue-500/50">
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
