'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { domainService } from '@/services/domainService';
import { confirmAction } from '@/utils/confirm';
import { Plus, Globe, ShieldCheck, Activity, Copy, Check, ArrowRight, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { CardSkeleton } from '@/components/loaders/Skeletons';
import ImageCropperModal from '@/components/ui/ImageCropperModal';

export default function Domains() {
  const { currentUser } = useAuth();
  const toast = useToast();
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedDomains, setSelectedDomains] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // New Domain Form State (Pruned of technical AI/vector configurations)
  const [newDomain, setNewDomain] = useState({
    name: '',
    url: '',
    welcome_message: 'Welcome to Acme Support.',
    fallback_message: 'Sorry, we could not find an answer. Please contact support.',
    helpline_number: '',
    widget_title: 'Support Assistant',
    widget_color: '#7C3AED',
    bot_avatar: '/static/chatbot-logo.png',
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);
  const [urlError, setUrlError] = useState('');

  const [logoSource, setLogoSource] = useState('default');
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState(null);

  const handleLogoSourceChange = (type) => {
    setLogoSource(type);
    if (type === 'default') {
      setNewDomain(prev => ({ ...prev, bot_avatar: '/static/chatbot-logo.png' }));
    } else {
      setNewDomain(prev => ({ ...prev, bot_avatar: '' }));
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setCropImageSrc(objectUrl);
    e.target.value = null;
  };

  const handleCropComplete = (file, objectUrl) => {
    setAvatarFile(file);
    setNewDomain(prev => ({ ...prev, bot_avatar: objectUrl }));
    setCropImageSrc(null);
  };

  const validateUrl = (val) => {
    if (!val) {
      setUrlError('');
      return false;
    }
    const pattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    if (!pattern.test(val)) {
      setUrlError('Please enter a valid URL (e.g. https://example.com)');
      return false;
    }
    setUrlError('');
    return true;
  };

  const fetchDomains = async () => {
    try {
      const data = await domainService.listDomains();
      setDomains(data);
    } catch (e) {
      console.error("Failed to fetch domains", e);
      toast.error("Failed to fetch domains");
    } finally {
      setLoading(false);
    }
  };

  const hasFetched = React.useRef(false);

  useEffect(() => {
    if (currentUser && !hasFetched.current) {
      hasFetched.current = true;
      fetchDomains();
    }
  }, [currentUser]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    if (modalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

  const handleAddDomain = async (e) => {
    e.preventDefault();
    if (!newDomain.name) {
      toast.warning("Display Name is required");
      return;
    }
    if (!newDomain.url || !validateUrl(newDomain.url)) {
      toast.warning("A valid Website URL is required");
      return;
    }

    const cleanDomain = newDomain.url.trim().toLowerCase();

    if (
      cleanDomain.includes('http://') ||
      cleanDomain.includes('https://') ||
      cleanDomain.includes('/') ||
      cleanDomain.includes('?')
    ) {

      toast.error(
        "Enter domain only",
        "Example: example.com"
      );

      return;
    }
    setSubmitting(true);
    try {
      let finalAvatarUrl = newDomain.bot_avatar;
      
      if (avatarFile) {
        const uploadData = new FormData();
        uploadData.append('file', avatarFile);
        const data = await domainService.uploadLogo(uploadData);
        finalAvatarUrl = data.url;
      }

      await domainService.createDomain({
        name: newDomain.name.trim(),
        domain_url: newDomain.url.trim(),
        welcome_message: newDomain.welcome_message.trim(),
        fallback_message: newDomain.fallback_message.trim(),
        helpline_number: newDomain.helpline_number.trim(),
        widget_title: newDomain.widget_title.trim(),
        widget_color: newDomain.widget_color.trim(),
        bot_avatar: finalAvatarUrl,
        is_active: newDomain.is_active
      });
      fetchDomains();
      toast.success("Domain registered successfully", `Registered ${newDomain.name}`);
      setAvatarFile(null);
      setModalOpen(false);
      setNewDomain({
        name: '',
        url: '',
        welcome_message: 'Welcome to Acme Support.',
        fallback_message: 'Sorry, we could not find an answer. Please contact support.',
        helpline_number: '',
        widget_title: 'Support Assistant',
        widget_color: '#7C3AED',
        bot_avatar: '/static/chatbot-logo.png',
        is_active: true
      });
      setLogoSource('default');
    } catch (e) {
      console.error("Failed to add domain", e);
      toast.error(
        e.response?.data?.detail || 
        e.response?.data?.message || 
        "Error adding domain"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDomain = async (id) => {
    const confirmed = await confirmAction({
      title: "Delete Domain",
      text: "Are you sure you want to delete this domain configuration?",
      confirmButtonText: "Yes, delete",
      preConfirm: async () => {
        await domainService.deleteDomain(id);
      }
    });
    if (!confirmed) return;
    fetchDomains();
    toast.success("Domain deleted");
  };

  const handleSelectDomain = (id) => {
    const newSelected = new Set(selectedDomains);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDomains(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedDomains.size === 0) return;
    
    const confirmed = await confirmAction({
      title: "Delete Selected Domains",
      text: `Are you sure you want to delete ${selectedDomains.size} selected domains?`,
      confirmButtonText: "Yes, delete them"
    });

    if (!confirmed) return;
    
    setIsBulkDeleting(true);
    try {
      const res = await domainService.bulkDelete({ ids: Array.from(selectedDomains) });
      setSelectedDomains(new Set());
      fetchDomains();
      if (res.details && res.details.failed && res.details.failed.length > 0) {
        if (res.details.success && res.details.success.length > 0) {
          toast.warning(res.message);
        } else {
          toast.error(res.details.failed[0].error || res.message || "Failed to delete domains");
        }
      } else {
        toast.success(res.message || `${selectedDomains.size} domains deleted successfully`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.message || "Failed to delete domains");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleToggleActive = async (domain) => {
    try {
      const nextStatus = !domain.is_active;
      await domainService.updateDomain(domain.id, { is_active: nextStatus });
      setDomains(prev => prev.map(d => d.id === domain.id ? { ...d, is_active: nextStatus } : d));
      toast.success(`Domain ${nextStatus ? 'activated' : 'deactivated'} successfully`);
    } catch (e) {
      console.error("Failed to toggle domain", e);
      toast.error("Failed to update domain status");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success("API Key copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Domains</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your support chatbots and deployment channels.</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedDomains.size > 0 && (
            <button 
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-white border-gray-200 hover:bg-red-50 text-red-600 rounded-xl font-medium transition-colors border border-red-200"
            >
              {isBulkDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              <span className="hidden sm:inline">Delete Selected ({selectedDomains.size})</span>
            </button>
          )}
          <button 
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-colors"
          >
            <Plus size={18} />
            Add Domain
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : domains.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-white border-gray-200 rounded-2xl flex items-center justify-center text-gray-500 mb-4">
            <Globe size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No domains registered</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">Add your first website domain to generate your widget embed code and start creating FAQs.</p>
          <button onClick={() => setModalOpen(true)} className="px-6 py-2.5 bg-white border-gray-200 hover:bg-white/15 text-gray-900 rounded-xl font-medium transition-colors">
            Register Domain
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {domains.map(domain => (
            <div key={domain.id} className={`bg-white rounded-2xl overflow-hidden flex flex-col transition-all shadow-sm hover:shadow-md ${selectedDomains.has(domain.id) ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
              <div className="p-5 relative">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <input 
                      type="checkbox"
                      checked={selectedDomains.has(domain.id)}
                      onChange={() => handleSelectDomain(domain.id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    />
                    <div className={`w-2 h-2 rounded-full ${domain.is_active ? 'bg-emerald-500' : 'bg-gray-500'}`}></div>
                    <h3 className="font-bold text-gray-900 text-lg truncate pr-4">{domain.name}</h3>
                  </div>
                  <button 
                    onClick={() => handleDeleteDomain(domain.id)}
                    disabled={deletingId === domain.id}
                    className="p-1 text-gray-500 hover:text-gray-500 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
                  >
                    {deletingId === domain.id ? <Loader2 size={16} className="animate-spin text-gray-500" /> : <Trash2 size={16} />}
                  </button>
                </div>
                <p className="text-gray-500 text-sm truncate flex items-center gap-1.5 mb-4">
                  <Globe size={14} /> { domain.domain_url}
                </p>
                
                <div className="flex gap-2 text-xs items-center relative group w-fit">
                  <button 
                    onClick={() => handleToggleActive(domain)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${domain.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${domain.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                  <span className={`font-semibold ${domain.is_active ? 'text-emerald-500' : 'text-gray-500'}`}>
                    {domain.is_active ? 'Active' : 'Inactive'}
                  </span>
                  
                  <div className="absolute left-0 top-full mt-2 hidden group-hover:block w-56 bg-gray-900 text-white text-[11px] leading-relaxed p-2.5 rounded-lg shadow-lg z-10 pointer-events-none">
                    When active, the chatbot widget is visible on your site. When inactive, it is hidden.
                    <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 flex items-center justify-end">
                <Link 
                  href={`/domains/${domain.id}`}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-primary transition-colors bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm"
                >
                  Manage <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Domain Modal */}
      {modalOpen && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-gray-900/40 backdrop-blur-sm  overflow-y-auto cursor-pointer"
          onClick={() => setModalOpen(false)}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <div 
              className="bg-white border border-gray-200 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl cursor-default relative my-auto"
              onClick={e => e.stopPropagation()}
            >
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-white border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Register Support Chatbot Domain</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-gray-700 p-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleAddDomain} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Display Name</label>
                  <input required type="text" value={newDomain.name} onChange={e => setNewDomain({...newDomain, name: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:border-primary focus:outline-none" placeholder="Acme Corp" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Website URL</label>
                  <input 
                    required 
                    type="text" 
                    value={newDomain.url} 
                    onChange={e => {
                      setNewDomain({...newDomain, url: e.target.value});
                      validateUrl(e.target.value);
                    }} 
                    className={`w-full bg-white border rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none ${urlError ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-primary'}`} 
                    placeholder="acme.com" 
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter domain only. Example: example.com
                  </p>
                  {urlError && <p className="text-red-500 text-xs mt-1">{urlError}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Widget Title</label>
                  <input required type="text" value={newDomain.widget_title} onChange={e => setNewDomain({...newDomain, widget_title: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:border-primary focus:outline-none" placeholder="Support Assistant" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Widget Theme Color</label>
                  <div className="flex gap-2">
                    <input type="color" value={newDomain.widget_color} onChange={e => setNewDomain({...newDomain, widget_color: e.target.value})} className="w-10 h-10 border-0 bg-transparent rounded-xl cursor-pointer" />
                    <input type="text" value={newDomain.widget_color} onChange={e => setNewDomain({...newDomain, widget_color: e.target.value})} className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none text-xs font-mono uppercase" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Welcome Message</label>
                <input required type="text" value={newDomain.welcome_message} onChange={e => setNewDomain({...newDomain, welcome_message: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:border-primary focus:outline-none" placeholder="Welcome to Acme Support." />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fallback Message</label>
                <textarea required rows="2" value={newDomain.fallback_message} onChange={e => setNewDomain({...newDomain, fallback_message: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:border-primary focus:outline-none resize-none text-sm" placeholder="Sorry, we could not find an answer. Please contact support." />
              </div>

              <div className="bg-white border-gray-200 border border-gray-200 rounded-2xl p-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Helpline Number</label>
                    <input type="text" value={newDomain.helpline_number} onChange={e => setNewDomain({...newDomain, helpline_number: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:border-primary focus:outline-none" placeholder="+44 XXXXXXXX" />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Logo Style Option</label>
                    <div className="flex rounded-xl bg-white p-1 border border-gray-200 w-fit">
                      <button
                        type="button"
                        onClick={() => handleLogoSourceChange('default')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${logoSource === 'default' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Use Default Logo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogoSourceChange('custom')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${logoSource === 'custom' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Custom Upload / URL
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  {logoSource === 'default' ? (
                    <div className="flex items-center gap-3">
                      <img src="/static/chatbot-logo.png" alt="Default Logo" className="w-10 h-10 rounded-full border border-gray-200 object-cover bg-white" />
                      <span className="text-xs text-gray-500 font-medium">Using default branding logo asset.</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                          <input 
                            type="text" 
                            value={newDomain.bot_avatar} 
                            onChange={e => setNewDomain({...newDomain, bot_avatar: e.target.value})} 
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 text-xs focus:border-primary focus:outline-none" 
                            placeholder="https://example.com/avatar.png" 
                          />
                        </div>
                        <div className="relative shrink-0">
                          <input
                            type="file"
                            id="logo-upload-input-create"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                          <label
                            htmlFor="logo-upload-input-create"
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border-gray-200 hover:bg-white/15 text-gray-900 rounded-xl text-xs font-semibold border cursor-pointer transition-all active:scale-[0.98]"
                          >
                            {uploadingLogo ? 'Uploading...' : 'Upload Image'}
                          </label>
                        </div>
                      </div>

                      {newDomain.bot_avatar && (
                        <div className="flex items-center gap-3">
                          <img src={newDomain.bot_avatar} alt="Bot Avatar Preview" className="w-10 h-10 rounded-full border border-gray-200 object-contain bg-white" />
                          {newDomain.bot_avatar.startsWith('http') && (
                            <span className="text-xs text-gray-500 font-mono truncate max-w-xs">{newDomain.bot_avatar}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
                <input type="checkbox" id="activeStatus" checked={newDomain.is_active} onChange={e => setNewDomain({...newDomain, is_active: e.target.checked})} className="w-4 h-4 rounded border-gray-200 bg-white text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer" />
                <label htmlFor="activeStatus" className="text-sm font-semibold text-gray-700 cursor-pointer">Chatbot is Active & Enabled</label>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-900 rounded-xl font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Registering...</> : 'Register Domain'}
                </button>
              </div>
            </form>
          </div>
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
