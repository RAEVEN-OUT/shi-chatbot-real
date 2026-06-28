import React, { useState } from 'react';
import { domainService } from '@/services/domainService';
import { Settings, Save, X, Edit, ShieldCheck, Phone, MessageSquare, Globe, User, Palette } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import AvatarCropperModal from '@/components/AvatarCropperModal';

export default function OverviewTab({ domain: initialDomain }) {
  const [domain, setDomain] = useState(initialDomain);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const baseUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || 'http://localhost:8000';
  
  const [logoSource, setLogoSource] = useState(
    !initialDomain.widget_logo_url || initialDomain.widget_logo_url === '/static/chatbot-logo.png' ? 'default' : 'custom'
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState(null);

  const handleLogoSourceChange = (type) => {
    setLogoSource(type);
    if (type === 'default') {
      setFormData(prev => ({ ...prev, bot_avatar: '/static/chatbot-logo.png' }));
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Reset the input so the same file can be selected again if needed
    e.target.value = '';

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setCropperImageSrc(reader.result);
      setCropperOpen(true);
    });
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob) => {
    setCropperOpen(false);
    
    // Create a File object from the Blob
    const file = new File([croppedBlob], "avatar.png", { type: "image/png" });
    
    const uploadData = new FormData();
    uploadData.append('file', file);

    setUploadingLogo(true);
    try {
      const data = await domainService.uploadLogo(uploadData);
      setFormData(prev => ({ ...prev, bot_avatar: data.url }));
      toast.success('Logo uploaded successfully');
    } catch (err) {
      console.error('Failed to upload logo', err);
      toast.error(err.response?.data?.detail || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };
  
  // Edit form state
  const [formData, setFormData] = useState({
    name: domain.name || '',
    domain_url: domain.domain_url || '',
    welcome_message: domain.welcome_message || domain.widget_welcome_message || 'Welcome to Acme Support.',
    fallback_message: domain.fallback_message || 'Sorry, we could not find an answer. Please contact support.',
    helpline_number: domain.helpline_number || '',
    widget_title: domain.widget_title || 'Support Assistant',
    widget_color: domain.widget_theme_color || '#7C3AED',
    bot_avatar: domain.widget_logo_url || '',
    is_active: domain.is_active !== undefined ? domain.is_active : true
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await domainService.updateDomain(domain.id, formData);
      
      // Update local domain display state
      setDomain({
        ...domain,
        name: formData.name,
        domain_url: formData.domain_url,
        welcome_message: formData.welcome_message,
        widget_welcome_message: formData.welcome_message,
        fallback_message: formData.fallback_message,
        helpline_number: formData.helpline_number,
        widget_title: formData.widget_title,
        widget_theme_color: formData.widget_color,
        widget_logo_url: formData.bot_avatar,
        is_active: formData.is_active
      });
      
      setIsEditing(false);
            toast.success(
        "Domain settings updated",
        `${formData.name} updated successfully`
      );
    } catch (err) {
      console.error("Failed to update domain settings", err);
      toast.error(
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "Failed to update domain settings"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: domain.name || '',
      domain_url: domain.domain_url || '',
      welcome_message: domain.welcome_message || domain.widget_welcome_message || 'Welcome to Acme Support.',
      fallback_message: domain.fallback_message || 'Sorry, we could not find an answer. Please contact support.',
      helpline_number: domain.helpline_number || '',
      widget_title: domain.widget_title || 'Support Assistant',
      widget_color: domain.widget_theme_color || '#7C3AED',
      bot_avatar: domain.widget_logo_url || '',
      is_active: domain.is_active !== undefined ? domain.is_active : true
    });
    setLogoSource(!domain.widget_logo_url || domain.widget_logo_url === '/static/chatbot-logo.png' ? 'default' : 'custom');
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Header and Toggle Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Chatbot Settings</h3>
          <p className="text-xs text-gray-500">Configure public styling, greets, fallbacks, and helpline details.</p>
        </div>
        {!isEditing && (
          <button 
            onClick={() => setIsEditing(true)} 
            className="flex items-center gap-1.5 px-4 py-2 bg-white border-gray-200 hover:bg-gray-50 text-gray-900 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap shrink-0"
          >
            <Edit size={14} /> Edit Configuration
          </button>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Display Name</label>
              <input 
                required 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:border-primary focus:outline-none" 
                placeholder="Acme Corp" 
              />
            </div>
            
            {/* Website URL / Domain */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Website / Domain</label>
              <input 
                required 
                type="text" 
                value={formData.domain_url} 
                onChange={e => setFormData({...formData, domain_url: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:border-primary focus:outline-none" 
                placeholder="acme.com" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Widget Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Widget Title</label>
              <input 
                required 
                type="text" 
                value={formData.widget_title} 
                onChange={e => setFormData({...formData, widget_title: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:border-primary focus:outline-none" 
                placeholder="Support Assistant" 
              />
            </div>
            
            {/* Widget Color */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Widget Theme Color</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={formData.widget_color} 
                  onChange={e => setFormData({...formData, widget_color: e.target.value})} 
                  className="w-10 h-10 border-0 bg-transparent rounded-xl cursor-pointer" 
                />
                <input 
                  type="text" 
                  value={formData.widget_color} 
                  onChange={e => setFormData({...formData, widget_color: e.target.value})} 
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 text-xs font-mono uppercase focus:outline-none focus:border-primary" 
                />
              </div>
            </div>
          </div>

          {/* Welcome Message */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Welcome Message</label>
            <input 
              required 
              type="text" 
              value={formData.welcome_message} 
              onChange={e => setFormData({...formData, welcome_message: e.target.value})} 
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:border-primary focus:outline-none" 
              placeholder="Welcome to Acme Support." 
            />
          </div>

          {/* Fallback Message */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fallback Message</label>
            <textarea 
              required 
              rows="2" 
              value={formData.fallback_message} 
              onChange={e => setFormData({...formData, fallback_message: e.target.value})} 
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 text-sm focus:border-primary focus:outline-none resize-none" 
              placeholder="Sorry, we could not find an answer. Please contact support." 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Helpline Number */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Helpline Number</label>
              <input 
                type="text" 
                value={formData.helpline_number} 
                onChange={e => setFormData({...formData, helpline_number: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:border-primary focus:outline-none" 
                placeholder="+44 XXXXXXXX" 
              />
            </div>
            
            {/* Bot Avatar */}
            <div className="md:col-span-2 bg-white border-gray-200 border border-gray-200 rounded-2xl p-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bot Logo / Avatar Settings</label>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex flex-col sm:flex-row w-full sm:w-auto rounded-xl bg-white p-1 border border-gray-200 shrink-0 gap-1 sm:gap-0">
                  <button
                    type="button"
                    onClick={() => handleLogoSourceChange('default')}
                    className={`flex-1 px-3 py-2 sm:py-1.5 rounded-md text-xs font-semibold transition-all ${logoSource === 'default' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Use Default Logo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLogoSourceChange('custom')}
                    className={`flex-1 px-3 py-2 sm:py-1.5 rounded-md text-xs font-semibold transition-all ${logoSource === 'custom' ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Custom Upload / URL
                  </button>
                </div>
                
                <div className="flex-1 w-full space-y-2">
                  {logoSource === 'default' ? (
                    <div className="flex items-center gap-3">
                      <img src={"/static/chatbot-logo.png"} alt="Default Logo" className="w-16 h-16 rounded-full border border-gray-200 object-cover bg-white" />
                      <span className="text-xs text-gray-500 font-medium">Using the default branding logo asset.</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 w-full">
                          <input 
                            type="text" 
                            value={formData.bot_avatar} 
                            onChange={e => setFormData({...formData, bot_avatar: e.target.value})} 
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 sm:py-2 text-gray-900 text-xs focus:border-primary focus:outline-none" 
                            placeholder="https://example.com/avatar.png" 
                          />
                        </div>
                        <div className="relative shrink-0 w-full sm:w-auto">
                          <input
                            type="file"
                            id="logo-upload-input"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          <label
                            htmlFor="logo-upload-input"
                            className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 bg-white border-gray-200 hover:bg-white/15 text-gray-900 rounded-xl text-xs font-semibold border border-gray-200 cursor-pointer transition-all active:scale-[0.98] whitespace-nowrap"
                          >
                            {uploadingLogo ? 'Uploading...' : 'Upload Image'}
                          </label>
                        </div>
                      </div>
                      
                      {formData.bot_avatar && (
                        <div className="flex items-center gap-3">
                          <img src={formData.bot_avatar.startsWith('http') || formData.bot_avatar === '/static/chatbot-logo.png' ? formData.bot_avatar : baseUrl + formData.bot_avatar} alt="Bot Avatar Preview" className="w-16 h-16 shrink-0 rounded-full border border-gray-200 object-cover bg-white" />
                          <div>
                            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Active Bot Avatar</p>
                          </div>
                        </div>
                        
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-3 py-2">
            <input 
              type="checkbox" 
              id="editActiveStatus" 
              checked={formData.is_active} 
              onChange={e => setFormData({...formData, is_active: e.target.checked})} 
              className="w-4 h-4 rounded border-[#E2E8F0] bg-white text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer" 
            />
            <label htmlFor="editActiveStatus" className="text-sm font-semibold text-gray-700 cursor-pointer">Chatbot is Active & Enabled</label>
          </div>

          {/* Buttons */}
          <div className="pt-4 flex gap-3">
            <button 
              type="button" 
              onClick={handleCancel} 
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-900 rounded-xl font-medium transition-colors"
            >
              <X size={16} /> Cancel
            </button>
            <button 
              type="submit" 
              disabled={saving} 
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          {/* Read Mode Grid */}
          <div className="bg-white p-6 rounded-3xl space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-white border-gray-200 border border-gray-200 rounded-2xl flex items-start gap-3">
                <Globe className="text-primary mt-0.5" size={18} />
                <div className="min-w-0">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Website URL</p>
                  <p className="text-gray-900 text-sm mt-1 truncate">{domain.domain_url}</p>
                </div>
              </div>

              <div className="p-4 bg-white border-gray-200 border border-gray-200 rounded-2xl flex items-start gap-3">
                <ShieldCheck className={domain.is_active ? 'text-emerald-400 mt-0.5' : 'text-gray-500 mt-0.5'} size={18} />
                <div className="min-w-0">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</p>
                  <p className={`text-sm font-semibold mt-1 ${domain.is_active ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {domain.is_active ? 'Active & Running' : 'Disabled'}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-white border-gray-200 border border-gray-200 rounded-2xl flex items-start gap-3">
                <Phone className="text-indigo-400 mt-0.5" size={18} />
                <div className="min-w-0">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Support Helpline</p>
                  <p className="text-gray-900 text-sm mt-1">{domain.helpline_number || 'None Configured'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-white border-gray-200 border border-[#E2E8F0] rounded-2xl flex items-start gap-3">
                <User className="text-pink-400 mt-0.5" size={18} />
                <div className="min-w-0">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Widget Assistant Title</p>
                  <p className="text-gray-900 text-sm mt-1 font-semibold">{domain.widget_title || 'Support Assistant'}</p>
                </div>
              </div>

              <div className="p-4 bg-white border-gray-200 border border-gray-200 rounded-2xl flex items-start gap-3">
                <Palette className="text-amber-400 mt-0.5" size={18} />
                <div className="min-w-0">
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Widget Base Color</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-4 h-4 rounded-full border border-[#E2E8F0]" style={{ backgroundColor: domain.widget_theme_color || '#7C3AED' }}></div>
                    <code className="text-gray-900 text-xs font-mono uppercase">{domain.widget_theme_color || '#7C3AED'}</code>
                  </div>
                </div>
              </div>
            </div>

            {domain.widget_logo_url && (
              <div className="p-4 bg-white border-gray-200 border border-gray-200 rounded-2xl flex items-center gap-4">
                <img src={domain.widget_logo_url.startsWith('http') || domain.widget_logo_url === '/static/chatbot-logo.png' ? domain.widget_logo_url : baseUrl + domain.widget_logo_url} alt="Avatar" className="w-16 h-16 rounded-full border border-gray-200 object-cover bg-white border-gray-200" />
                <div>
                  <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Active Bot Avatar</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl space-y-3">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare size={14} className="text-primary" /> Welcome Greeting message
              </h4>
              <p className="text-gray-700 bg-white border-gray-200 p-4 rounded-xl border border-gray-200 leading-relaxed">
                "{domain.welcome_message || domain.widget_welcome_message || 'Welcome to Acme Support.'}"
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl space-y-3">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare size={14} className="text-gray-500" /> Fallback response message
              </h4>
              <p className="text-gray-700 bg-white border-gray-200 p-4 rounded-xl border border-gray-200 leading-relaxed">
                "{domain.fallback_message || 'Sorry, we could not find an answer. Please contact support.'}"
              </p>
            </div>
          </div>
        </div>
      )}
      
      <AvatarCropperModal
        isOpen={cropperOpen}
        onClose={() => setCropperOpen(false)}
        imageSrc={cropperImageSrc}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
}
