import React, { useState, useEffect } from 'react';
import { chatbotService } from '@/services/chatbotService';
import { Save, Terminal, Copy, Check } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

export default function WidgetStyleTab({ domain }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [config, setConfig] = useState({
    theme_color: '#3B82F6',
    title: 'Support Chat',
    placeholder: 'Type your question...',
    welcome_message: 'Hi there! How can I help you today?',
    logo_url: '',
    border_radius: '12px',
    font_color: '#ffffff',
    bot_name: 'SHI Chatbot',
    bot_description: 'An AI assistant that helps visitors using the knowledge base.',
    farewell_message: 'Goodbye! Have a great day!',
    human_request_message: 'Please contact our support team or use the available contact options on this website.'
  });

  useEffect(() => {
    const fetchStyle = async () => {
      try {
        const data = await chatbotService.getWidgetStyle(domain.id);
        if (data && Object.keys(data).length > 0) {
          setConfig({
            theme_color: data.theme_color || '#3B82F6',
            title: data.title || 'Support Chat',
            placeholder: data.placeholder || 'Type your question...',
            welcome_message: data.welcome_message || 'Hi there! How can I help you today?',
            logo_url: data.logo_url || data.botAvatar || '',
            border_radius: data.border_radius || '12px',
            font_color: data.font_color || '#ffffff',
            bot_name: data.bot_name || data.botName || 'SHI Chatbot',
            bot_description: data.bot_description || 'An AI assistant that helps visitors using the knowledge base.',
            farewell_message: data.farewell_message || 'Goodbye! Have a great day!',
            human_request_message: data.human_request_message || 'Please contact our support team or use the available contact options on this website.'
          });
        }
      } catch (e) {
        console.error("Failed to load widget style config", e);
      } finally {
        setLoading(false);
      }
    };
    fetchStyle();
  }, [domain.id]);

  const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");
  const snippet = `<!-- AI Chatbot Embed Widget -->
<script>
  window.CHATBOT_CONFIG = {
    apiKey: "${domain.id}"
  };
</script>
<script src="${siteUrl}/public/widget/widget.min.js" async></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await chatbotService.updateWidgetStyle(domain.id, {
        theme_color: config.theme_color,
        title: config.title,
        placeholder: config.placeholder,
        welcome_message: config.welcome_message,
        logo_url: config.logo_url,
        border_radius: config.border_radius,
        font_color: config.font_color,
        bot_name: config.bot_name,
        bot_description: config.bot_description,
        farewell_message: config.farewell_message,
        human_request_message: config.human_request_message
      });
      toast.success("Widget styling updated successfully!");
    } catch(e) {
      console.error(e);
      toast.error("Failed to update widget styling.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-gray-500 p-8">Loading customization settings...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl space-y-6">
          <h3 className="text-lg font-bold text-gray-900">Widget Configuration</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Theme Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={config.theme_color} 
                  onChange={e => setConfig({...config, theme_color: e.target.value})}
                  className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer"
                />
                <input 
                  type="text" 
                  value={config.theme_color}
                  onChange={e => setConfig({...config, theme_color: e.target.value})}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none uppercase font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Title Font Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={config.font_color} 
                  onChange={e => setConfig({...config, font_color: e.target.value})}
                  className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer"
                />
                <input 
                  type="text" 
                  value={config.font_color}
                  onChange={e => setConfig({...config, font_color: e.target.value})}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-900 focus:outline-none uppercase font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Border Radius</label>
              <select 
                value={config.border_radius} 
                onChange={e => setConfig({...config, border_radius: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none appearance-none"
              >
                <option value="0px">Square (0px)</option>
                <option value="8px">Rounded Soft (8px)</option>
                <option value="12px">Rounded Medium (12px)</option>
                <option value="20px">Rounded Pill (20px)</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Chatbot Title</label>
            <input 
              required
              type="text" 
              value={config.title}
              onChange={e => setConfig({...config, title: e.target.value})}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none"
            />
          </div>

          <div className="space-y-4 pt-2">
            <h4 className="text-sm font-bold text-gray-900 border-b pb-2">Chatbot Personality</h4>
            
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Bot Name</label>
              <input 
                required 
                type="text" 
                value={config.bot_name} 
                onChange={e => setConfig({...config, bot_name: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
                placeholder="SHI Chatbot" 
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Bot Description</label>
              <textarea 
                required 
                rows="2"
                value={config.bot_description} 
                onChange={e => setConfig({...config, bot_description: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none resize-none" 
                placeholder="An AI assistant that helps visitors using the knowledge base." 
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Welcome Message (Greeting)</label>
              <input 
                required 
                type="text" 
                value={config.welcome_message} 
                onChange={e => setConfig({...config, welcome_message: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
                placeholder="Welcome! How can we help you?" 
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Farewell Message (Goodbye)</label>
              <input 
                required 
                type="text" 
                value={config.farewell_message} 
                onChange={e => setConfig({...config, farewell_message: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
                placeholder="Goodbye! Have a great day!" 
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Human Handoff Request</label>
              <input 
                required 
                type="text" 
                value={config.human_request_message} 
                onChange={e => setConfig({...config, human_request_message: e.target.value})} 
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none" 
                placeholder="Please contact our support team directly." 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Input Placeholder</label>
            <input 
              required
              type="text" 
              value={config.placeholder}
              onChange={e => setConfig({...config, placeholder: e.target.value})}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Logo URL (Optional)</label>
            <input 
              type="text" 
              value={config.logo_url}
              onChange={e => setConfig({...config, logo_url: e.target.value})}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 focus:outline-none"
            />
          </div>

          <button 
            type="submit"
            disabled={saving}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all disabled:opacity-50"
          >
            <Save size={18} /> {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </form>

        {/* Live Preview */}
        <div className="flex justify-center lg:justify-start items-start pt-2 lg:pt-0">
          {/* Mock Widget UI */}
          <div className="w-full max-w-[360px] h-[500px] bg-white shadow-2xl flex flex-col overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: config.border_radius }}>
            {/* Header */}
            <div className="p-4 flex justify-between items-center" style={{ backgroundColor: config.color, color: config.font_color }}>
              <div>
                <h4 className="font-bold">{config.title}</h4>
                <p className="text-xs opacity-90">We typically reply in minutes</p>
              </div>
              <button className="opacity-80">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            {/* Messages Area */}
            <div className="flex-1 bg-gray-50 p-4 space-y-4">
              <div className="bg-white border border-gray-200 text-gray-800 p-3 rounded-2xl rounded-tl-none w-fit text-sm max-w-[85%]">
                {config.welcome_message}
              </div>
              <div className="p-3 rounded-2xl rounded-tr-none w-fit text-sm ml-auto max-w-[85%]" style={{ backgroundColor: config.color, color: config.font_color }}>
                I have a question about my account.
              </div>
            </div>
            
            {/* Input Area */}
            <div className="p-4 bg-white border-t border-slate-100">
              <div className="bg-gray-50 border border-gray-200 rounded-full flex items-center p-1 pl-4">
                <input type="text" placeholder={config.placeholder} className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800" disabled />
                <div className="w-8 h-8 rounded-full flex items-center justify-center ml-2" style={{ backgroundColor: config.color, color: config.font_color }}>
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Embed Code Block */}
      <div className="bg-white p-8 rounded-3xl border border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
            <Terminal size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Installation Code</h3>
            <p className="text-gray-500 text-sm">Paste this snippet before the closing &lt;/body&gt; tag on your website.</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <button 
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 rounded-xl text-xs font-medium transition-colors shadow-sm"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
          <pre className="p-6 bg-gray-50 border border-gray-200 rounded-2xl overflow-x-auto text-sm text-gray-700 font-mono leading-relaxed">
            <code>
{`<!-- AI Chatbot Embed Widget -->
<script>
  window.CHATBOT_CONFIG = {
    apiKey: "`}<span className="text-amber-500">{domain.id}</span>{`"
  };
</script>
<script src="`}<span className="text-emerald-500">{siteUrl}</span>{`/public/widget/widget.min.js" async></script>`}
            </code>
          </pre>
        </div>

        <div className="mt-8">
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Next Steps</h4>
            <ol className="list-decimal list-inside space-y-2 text-gray-500 text-sm">
              <li>Copy the snippet above.</li>
              <li>Paste it directly into your HTML document, typically right before <code className="text-primary bg-primary/10 px-1 py-0.5 rounded">{'</body>'}</code>.</li>
              <li>Ensure the <code className="text-primary bg-primary/10 px-1 py-0.5 rounded">domain_url</code> set in Overview (<span className="text-gray-900 font-medium">{domain.domain_name}</span>) exactly matches your production environment to prevent CORS blocks.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
