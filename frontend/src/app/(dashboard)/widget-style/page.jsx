'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { domainService } from '@/services/domainService';
import { chatbotService } from '@/services/chatbotService';
import { Palette, Eye, Save, Sparkles } from 'lucide-react';

export default function WidgetStyle() {
  const { currentUser } = useAuth();
  const toast = useToast();
  const [domains, setDomains] = useState([]);
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [style, setStyle] = useState({
    theme_color: '#7C3AED',
    title: 'Support Chat',
    placeholder: 'Type your question...',
    welcome_message: 'Hi! I\'m SHI Chatbot. How can I help you today?',
    logo_url: '',
    border_radius: '12px',
    font_color: '#ffffff',
    bot_name: 'SHI Chatbot',
    bot_description: 'An AI assistant that helps visitors using the knowledge base.',
    farewell_message: 'Goodbye! Have a great day!',
    human_request_message: 'Please contact our support team or use the available contact options on this website.'
  });

  const fetchDomains = async () => {
    try {
      const data = await domainService.listDomains();
      setDomains(data);
      if (data.length > 0) {
        setSelectedDomainId(data[0].id);
      }
    } catch (e) {
      console.error("Failed to load domains", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchWidgetStyle = async (domainId) => {
    if (!domainId) return;
    try {
      const data = await chatbotService.getWidgetStyle(domainId);
      setStyle(data);
    } catch (e) {
      console.error("Failed to load widget style config", e);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchDomains();
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedDomainId) {
      fetchWidgetStyle(selectedDomainId);
    }
  }, [selectedDomainId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedDomainId) return;
    setSaving(true);
    try {
      await chatbotService.updateWidgetStyle(selectedDomainId, style);
      toast.success("Widget custom style saved successfully!");
    } catch (e) {
      console.error("Failed to save style settings", e);
      toast.error("Error saving custom style settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-gray-500 p-8">Loading customization settings...</div>;
  }

  if (domains.length === 0) {
    return (
      <div className="bg-white p-12 rounded-3xl text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-white border-gray-200 rounded-2xl flex items-center justify-center text-gray-500 mb-4">
          <Palette size={32} />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">No domains registered</h3>
        <p className="text-gray-500 max-w-md mx-auto mb-6">Register a domain first before configuring its widget styling.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customize Widget Style</h1>
        <p className="text-gray-500 text-sm mt-1">Design and color-tune your customer chat widget interface globally or per-domain.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Editor panel */}
        <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Select Domain</label>
            <select 
              value={selectedDomainId} 
              onChange={e => setSelectedDomainId(e.target.value)} 
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:border-primary focus:outline-none appearance-none"
            >
              {domains.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <hr className="border-gray-200" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Theme Primary Color</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={style.theme_color} 
                  onChange={e => setStyle({...style, theme_color: e.target.value})} 
                  className="w-10 h-10 border-0 bg-transparent rounded-xl cursor-pointer"
                />
                <input 
                  type="text" 
                  value={style.theme_color} 
                  onChange={e => setStyle({...style, theme_color: e.target.value})} 
                  className="flex-1 bg-white border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-xs text-[#64748B] uppercase focus:outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Title Font Color</label>
              <div className="flex gap-2">
                <input 
                  type="color" 
                  value={style.font_color} 
                  onChange={e => setStyle({...style, font_color: e.target.value})} 
                  className="w-10 h-10 border-0 bg-transparent rounded-xl cursor-pointer"
                />
                <input 
                  type="text" 
                  value={style.font_color} 
                  onChange={e => setStyle({...style, font_color: e.target.value})} 
                  className="flex-1 bg-white border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-xs text-[#64748B] uppercase focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Border Radius</label>
              <select 
                value={style.border_radius} 
                onChange={e => setStyle({...style, border_radius: e.target.value})} 
                className="w-full bg-white border border-[#E2E8F0] rounded-xl px-4 py-2 text-[#0F172A] placeholder-[#64748B] focus:outline-none appearance-none"
              >
                <option value="0px">Square (0px)</option>
                <option value="8px">Rounded Soft (8px)</option>
                <option value="12px">Rounded Medium (12px)</option>
                <option value="20px">Rounded Pill (20px)</option>
              </select>
            </div>

            {/* Removed widget position dropdown */}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Widget Title</label>
            <input 
              required 
              type="text" 
              value={style.title} 
              onChange={e => setStyle({...style, title: e.target.value})} 
              className="w-full bg-white border border-[#E2E8F0] rounded-xl px-4 py-2 text-[#0F172A] placeholder-[#64748B] focus:outline-none" 
              placeholder="Support Chat" 
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b pb-2">Chatbot Personality</h3>
            
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Bot Name</label>
              <input 
                required 
                type="text" 
                value={style.bot_name} 
                onChange={e => setStyle({...style, bot_name: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
                placeholder="SHI Chatbot" 
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Bot Description</label>
              <textarea 
                required 
                rows="2"
                value={style.bot_description} 
                onChange={e => setStyle({...style, bot_description: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none resize-none" 
                placeholder="An AI assistant that helps visitors using the knowledge base." 
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Welcome Message (Greeting)</label>
              <input 
                required 
                type="text" 
                value={style.welcome_message} 
                onChange={e => setStyle({...style, welcome_message: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
                placeholder="Welcome! How can we help you?" 
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Farewell Message (Goodbye)</label>
              <input 
                required 
                type="text" 
                value={style.farewell_message} 
                onChange={e => setStyle({...style, farewell_message: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
                placeholder="Goodbye! Have a great day!" 
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Human Handoff Request</label>
              <input 
                required 
                type="text" 
                value={style.human_request_message} 
                onChange={e => setStyle({...style, human_request_message: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
                placeholder="Please contact our support team directly." 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Input Placeholder</label>
            <input 
              required 
              type="text" 
              value={style.placeholder} 
              onChange={e => setStyle({...style, placeholder: e.target.value})} 
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
              placeholder="Ask a question..." 
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Logo URL (Optional)</label>
            <input 
              type="text" 
              value={style.logo_url} 
              onChange={e => setStyle({...style, logo_url: e.target.value})} 
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
              placeholder="https://example.com/logo.png" 
            />
          </div>

          <button 
            type="submit" 
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold transition-all disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? 'Saving Changes...' : 'Save Settings'}
          </button>
        </form>

        <div className="flex justify-center lg:justify-start items-start pt-2 lg:pt-0">
          {/* Mock Widget UI */}
          <div className="w-full max-w-[360px] h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: style.border_radius }}>
            {/* Header */}
            <div className="p-4 flex justify-between items-center" style={{ backgroundColor: style.theme_color, color: style.font_color }}>
              <div>
                <h4 className="font-bold">{style.title}</h4>
                <p className="text-xs opacity-90">We typically reply in minutes</p>
              </div>
              <button className="opacity-80">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            {/* Messages Area */}
            <div className="flex-1 bg-gray-50 p-4 space-y-4">
              <div className="bg-white border border-gray-200 text-gray-800 p-3 rounded-2xl rounded-tl-none w-fit text-sm max-w-[85%]">
                {style.welcome_message}
              </div>
              <div className="p-3 rounded-2xl rounded-tr-none w-fit text-sm ml-auto max-w-[85%]" style={{ backgroundColor: style.theme_color, color: style.font_color }}>
                I have a question about my account.
              </div>
            </div>
            
            {/* Input Area */}
            <div className="p-4 bg-white border-t border-slate-100">
              <div className="bg-gray-50 border border-gray-200 rounded-full flex items-center p-1 pl-4">
                <input type="text" placeholder={style.placeholder} className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800" disabled />
                <div className="w-8 h-8 rounded-full flex items-center justify-center ml-2" style={{ backgroundColor: style.theme_color, color: style.font_color }}>
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
