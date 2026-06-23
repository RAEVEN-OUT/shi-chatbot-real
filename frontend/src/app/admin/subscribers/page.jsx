'use client';
import React, { useEffect, useState } from 'react';
import { formatDate } from '@/utils/dateFormatter';
import { useAuth } from '@/contexts/AuthContext';
import { createPortal } from 'react-dom';
import { settingsService } from '@/services/settingsService';
import { domainService } from '@/services/domainService';
import { Users, Trash2, Edit3, Image, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { confirmAction } from '@/utils/confirm';
import { getLogoUrl } from '@/utils/logo';
import ImageCropperModal from '@/components/ui/ImageCropperModal';

export default function SubscriberMonitor() {
  const { userData } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  const toast = useToast();
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPlace, setShowPlace] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [editingSub, setEditingSub] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoSource, setLogoSource] = useState('default'); // 'default' or 'custom'
  const [avatarFile, setAvatarFile] = useState(null);
  const [cropImageSrc, setCropImageSrc] = useState(null);

  // Form State
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    display_name: '',
    dashboard_logo_url: '',
    is_active: true,
    custom_time_stamp: ''
  });

  // Pagination & Search State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchSubscribers = async () => {
    try {
      const data = await settingsService.listSubscribers({
        page,
        page_size: pageSize,
        search: debouncedSearch.trim() || undefined
      });
      setSubscribers(data.subscribers || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 0);
    } catch (e) {
      console.error("Failed to fetch subscribers", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscribers();
  }, [page, debouncedSearch, pageSize]);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setCropImageSrc(objectUrl);
    e.target.value = null;
  };

  const handleCropComplete = (file, objectUrl) => {
    setAvatarFile(file);
    setForm(prev => ({ ...prev, dashboard_logo_url: objectUrl }));
    setCropImageSrc(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validate passwords match when creating or updating password
    if (form.password || form.confirmPassword) {
      if (form.password !== form.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    }

    if (form.custom_time_stamp) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: form.custom_time_stamp });
      } catch (error) {
        toast.error('Invalid timezone format. Please use IANA format (e.g., Asia/Kolkata).');
        return;
      }
    }

    setSubmitting(true);
    try {
      let finalAvatarUrl = form.dashboard_logo_url;
      if (avatarFile && logoSource !== 'default') {
        const uploadData = new FormData();
        uploadData.append('file', avatarFile);
        const data = await domainService.uploadLogo(uploadData);
        finalAvatarUrl = data.url;
      }

      const logoVal = logoSource === 'default' ? '' : finalAvatarUrl;
      if (editingSub) {
        // Update subscriber
        await settingsService.updateSubscriber(editingSub.uid, {
          display_name: form.display_name,
          email: form.email.trim(),
          dashboard_logo_url: logoVal,
          is_active: form.is_active,
          password: form.password || undefined,
          custom_time_stamp: form.custom_time_stamp || undefined
        });
      } else {
        // Create subscriber
        await settingsService.createSubscriber({
          email: form.email.trim(),
          password: form.password,
          display_name: form.display_name.trim(),
          dashboard_logo_url: logoVal,
          is_active: form.is_active,
          custom_time_stamp: form.custom_time_stamp || undefined
        });
      }
      fetchSubscribers();
      setAvatarFile(null);
      closeModal();
    } catch (e) {
      console.error("Failed to save subscriber", e);
      toast.error(e.response?.data?.detail || "Error saving subscriber");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (uid) => {
    const confirmed = await confirmAction({
      title: "Delete Subscriber",
      text: "Are you sure you want to delete this subscriber? This will delete their Firestore user document and their Firebase Authentication account.",
      confirmButtonText: "Yes, delete"
    });
    if (!confirmed) return;
    try {
      await settingsService.deleteSubscriber(uid);
      fetchSubscribers();
      toast.success("Subscriber deleted successfully");
    } catch (e) {
      console.error("Failed to delete subscriber", e);
      toast.error("Error deleting subscriber");
    }
  };

  const openCreateModal = () => {
    setEditingSub(null);
    setForm({
      email: '',
      password: '',
      confirmPassword: '',
      display_name: '',
      dashboard_logo_url: '',
      is_active: true,
      custom_time_stamp: ''
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setLogoSource('default');
    setModalOpen(true);
  };

  const openEditModal = (sub) => {
    setEditingSub(sub);
    setForm({
      email: sub.email,
      password: '',
      confirmPassword: '',
      display_name: sub.display_name || '',
      dashboard_logo_url: sub.dashboard_logo_url || '',
      is_active: sub.is_active !== undefined ? sub.is_active : true,
      custom_time_stamp: sub.custom_time_stamp || ''
    });
    setShowPassword(false);
    setShowConfirmPassword(true);
    setLogoSource(sub.dashboard_logo_url ? 'custom' : 'default');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingSub(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Users className="text-blue-500" /> Subscriber Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">Admin control room: provision subscribers and customize dashboard logos.</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
        >
          <UserPlus size={18} />
          Create Subscriber
        </button>
      </div>

      <div className="bg-white border-gray-200 border border-gray-200 rounded-2xl overflow-hidden shadow-2xl">
        {/* Search Bar */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-4 flex-wrap">
          <div className="relative w-full max-w-xs">
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-gray-900 focus:outline-none focus:border-blue-500 text-sm placeholder:text-gray-500"
            />
            <svg className="absolute left-3 top-2.5 text-gray-500 w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <div className="text-xs text-gray-500">
            Total Matching: <span className="text-gray-500 font-bold">{total}</span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : subscribers.length === 0 ? (
          <div className="p-16 text-center text-gray-500">No subscribers found in system. Use "Create Subscriber" button above to register one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-white shadow-sm border-gray-200">
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Subscriber / Email</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Dashboard Logo</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider">Joined Date</th>
                  <th className="p-4 text-xs font-bold text-gray-700 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {subscribers.map(sub => (
                  <tr key={sub.uid} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <p className="text-sm font-bold text-gray-900">{sub.display_name || 'Subscriber'}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{sub.email}</p>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${sub.is_active !== false ? 'bg-emerald-100 text-emerald-700 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                        {sub.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                          <img src={getLogoUrl(sub.dashboard_logo_url, getLogoUrl('/static/chatbot-logo.png'))} alt="Logo" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-xs text-gray-500">
                          {sub.dashboard_logo_url ? 'Custom Branding' : 'Default Logo'}
                        </span>
                      </div>
                    </td>
                   
                    <td className="p-4 text-sm text-gray-500 font-mono">
                      {sub.created_at ? formatDate(sub.created_at, customTimeStamp) : 'N/A'}
                    </td>
                    <td className="p-4 text-right flex items-center justify-end gap-2">
                      <button 
                        onClick={() => openEditModal(sub)}
                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-white shadow-sm border-gray-200 rounded-xl transition-colors"
                        title="Edit subscriber"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(sub.uid)}
                        className="p-2 text-gray-500 hover:text-gray-500 hover:bg-red-100 rounded-xl transition-colors"
                        title="Delete account"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-4">
              <span className="text-xs text-gray-500">
                Showing {Math.min(total, (page - 1) * pageSize + 1)} to {Math.min(page * pageSize, total)} of {total} subscribers
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 text-gray-900 bg-white shadow-sm border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:hover:bg-white shadow-sm border-gray-200"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-xs text-gray-700 font-semibold flex items-center">
                  Page {page} of {totalPages || 1}
                </span>
                <button
                  disabled={page === totalPages || totalPages === 0}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 text-gray-900 bg-white shadow-sm border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:hover:bg-white shadow-sm border-gray-200"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm  z-[9999] flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white border border-gray-200 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-white shadow-sm border-gray-200 shrink-0">
              <h3 className="text-xl font-bold text-gray-900">{editingSub ? 'Edit Subscriber' : 'Create Subscriber Account'}</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-900 p-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1" autoComplete="off">
              {!editingSub && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Email Address</label>
                    <input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-blue-500" placeholder="subscriber@example.com" autoComplete="new-password" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-blue-500 pr-12"
                        placeholder="••••••••"
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 transition-colors"
                        tabIndex="-1"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-blue-500 pr-12"
                        placeholder="Repeat password"
                        value={form.confirmPassword}
                        onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 transition-colors"
                        tabIndex="-1"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </>
              )}
              
              {editingSub && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Email Address</label>
                    <input required type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-blue-500" autoComplete="new-password" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Update Password (Optional)</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-blue-500 pr-12"
                        placeholder="Leave blank to keep current"
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 transition-colors"
                        tabIndex="-1"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  
                  {form.password && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Confirm New Password</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-blue-500 pr-12"
                          placeholder="Repeat new password"
                          value={form.confirmPassword}
                          onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 transition-colors"
                          tabIndex="-1"
                        >
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Display Name</label>
                <input required type="text" value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})} className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-blue-500" placeholder="e.g. Subscriber Corp" autoComplete="off" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Timezone</label>
                <select value={form.custom_time_stamp} onChange={e => setForm({...form, custom_time_stamp: e.target.value})} className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-blue-500">
                  <option value="">Default (UTC)</option>
                  <option value="Europe/London">UK (GMT/BST)</option>
                  <option value="America/Toronto">Canada (EST/EDT)</option>
                  <option value="Asia/Kolkata">India (IST)</option>
                </select>
              </div>

              {/* Logo Source Toggle */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Dashboard Branding Logo</label>
                <div className="flex gap-2 p-1 bg-white border-gray-200 rounded-xl border border-gray-200 mb-3">
                  <button
                    type="button"
                    onClick={() => setLogoSource('default')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-colors ${logoSource === 'default' ? 'bg-blue-500/20 text-gray-500 border border-blue-500/30' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Use Default Logo
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoSource('custom')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-colors ${logoSource === 'custom' ? 'bg-blue-500/20 text-gray-500 border border-blue-500/30' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Custom Upload / URL
                  </button>
                </div>

                {logoSource === 'custom' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-xl border border-gray-200 bg-white border-gray-200 overflow-hidden flex items-center justify-center">
                        {form.dashboard_logo_url ? (
                          <img src={getLogoUrl(form.dashboard_logo_url)} alt="Subscriber logo" className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-500 bg-white shadow-sm border-gray-200"><Image size={24} /></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white shadow-sm border-gray-200 hover:bg-gray-50 border text-gray-900 rounded-xl text-xs font-semibold transition-colors">
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                          {uploadingLogo ? 'Uploading...' : 'Choose Logo File'}
                        </label>
                        <p className="text-[10px] text-gray-500 mt-1">Recommended size: square (e.g. 512x512 PNG)</p>
                      </div>
                    </div>

                    {(!form.dashboard_logo_url || form.dashboard_logo_url.startsWith('http')) && (
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Or Logo Image URL</label>
                        <input 
                          type="text" 
                          value={form.dashboard_logo_url} 
                          onChange={e => setForm({...form, dashboard_logo_url: e.target.value})} 
                          className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2 text-xs text-gray-900 focus:outline-none focus:border-blue-500" 
                          placeholder="https://example.com/logo.png" 
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-white shadow-sm border-gray-200 rounded-xl border border-gray-200">
                    <div className="w-8 h-8 rounded-xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                      <img src={getLogoUrl('/static/chatbot-logo.png')} alt="Default logo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">Default Branding Logo</p>
                      <p className="text-[10px] text-gray-500">Antigravity Chatbot logo will be shown.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Status toggle */}
              <div className="flex items-center gap-2 py-2">
                <input 
                  type="checkbox" 
                  id="is_active"
                  checked={form.is_active} 
                  onChange={e => setForm({...form, is_active: e.target.checked})} 
                  className="w-4 h-4 rounded border-gray-200 bg-white border-gray-200 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer" 
                />
                <label htmlFor="is_active" className="text-sm font-semibold text-gray-700 cursor-pointer select-none">
                  Active Status (Allow login & access)
                </label>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 py-2.5 bg-white shadow-sm border-gray-200 hover:bg-white text-gray-700 border border-gray-200 rounded-xl font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={submitting || uploadingLogo} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50">
                  {submitting ? 'Processing...' : (editingSub ? 'Save Subscriber' : 'Create Account')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Image Cropper Modal */}
      {cropImageSrc && createPortal(
        <ImageCropperModal
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />,
        document.body
      )}
    </div>
  );
}
