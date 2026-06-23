import React, { useState } from 'react';
import { chatbotService } from '@/services/chatbotService';
import { Save, Terminal, Copy, Check } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

export default function WidgetStyleTab({ domain }) {
  const getContrastColor = (hexColor) => {
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(hexColor)) return '#000000';
    let c = hexColor.substring(1);
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >>  8) & 0xff;
    const b = (rgb >>  0) & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 128 ? '#ffffff' : '#000000';
  };

  const toast = useToast();
  const [config, setConfig] = useState({
    title: domain.widget_title || 'Support',
    color: domain.widget_theme_color || '#7C3AED',
    placeholder: domain.widget_placeholder || 'Type your message...',
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const contrastColor = getContrastColor(config.color);

  let withoutApiUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (withoutApiUrl) {
    withoutApiUrl = withoutApiUrl.replace(/\/api\/?$/, '');
  } else {
    withoutApiUrl = 'http://localhost:8000';
  }

  const snippet = `<!-- AI Chatbot Embed Widget -->
<script>
  window.CHATBOT_CONFIG = {
    apiKey: "${domain.id}"
  };
</script>
<script src="${withoutApiUrl}/public/widget/widget.min.js" async></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await chatbotService.updateWidgetStyle(domain.id, {
        theme_color: config.color,
        title: config.title,
        placeholder: config.placeholder,
        position: domain.widget_position || 'right',
        welcome_message: domain.widget_welcome_message || 'Hello! How can I help you today?',
        logo_url: domain.widget_logo_url || '',
        border_radius: domain.widget_border_radius || '12px',
        font_color: domain.widget_font_color || '#ffffff'
      });
      toast.success("Widget styling updated successfully!");
    } catch(e) {
      console.error(e);
      toast.error("Failed to update widget styling.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="bg-white p-6 rounded-2xl">
        <h3 className="text-lg font-bold text-gray-900 mb-6">Widget Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Theme Color</label>
            <div className="flex items-center gap-3">
              <input 
                type="color" 
                value={config.color} 
                onChange={e => setConfig({...config, color: e.target.value})}
                className="w-10 h-10 rounded border-0 bg-transparent cursor-pointer"
              />
              <input 
                type="text" 
                value={config.color}
                onChange={e => setConfig({...config, color: e.target.value})}
                className="flex-1 bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-primary uppercase font-mono"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Chatbot Title</label>
            <input 
              type="text" 
              value={config.title}
              onChange={e => setConfig({...config, title: e.target.value})}
              className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Input Placeholder</label>
            <input 
              type="text" 
              value={config.placeholder}
              onChange={e => setConfig({...config, placeholder: e.target.value})}
              className="w-full bg-white border-gray-200 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-primary"
            />
          </div>

          <button 
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: config.color, color: contrastColor }}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            <Save size={18} /> {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Live Preview */}
      <div className="flex justify-center lg:justify-start items-start pt-2 lg:pt-0">
        {/* Mock Widget UI */}
        <div className="w-full max-w-[360px] h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
          {/* Header */}
          <div className="p-4 flex justify-between items-center" style={{ backgroundColor: config.color, color: contrastColor }}>
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
              Hello! How can I help you today?
            </div>
            <div className="p-3 rounded-2xl rounded-tr-none w-fit text-sm ml-auto max-w-[85%]" style={{ backgroundColor: config.color, color: contrastColor }}>
              I have a question about my account.
            </div>
          </div>
          
          {/* Input Area */}
          <div className="p-4 bg-white border-t border-slate-100">
            <div className="bg-gray-50 border border-gray-200 rounded-full flex items-center p-1 pl-4">
              <input type="text" placeholder={config.placeholder} className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800" disabled />
              <div className="w-8 h-8 rounded-full flex items-center justify-center ml-2" style={{ backgroundColor: config.color, color: contrastColor }}>
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
          <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-gray-200 hover:bg-gray-50 text-gray-900 rounded-xl text-xs font-medium transition-colors shadow-sm"
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
<script src="`}<span className="text-emerald-500">{withoutApiUrl}</span>{`/public/widget/widget.min.js" async></script>`}
            </code>
          </pre>
        </div>

        <div className="mt-8">
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Next Steps</h4>
            <ol className="list-decimal list-inside space-y-2 text-gray-500 text-sm">
              <li>Copy the snippet above.</li>
              <li>Paste it directly into your HTML document, typically right before <code className="text-primary bg-primary/10 px-1 py-0.5 rounded">{'</body>'}</code>.</li>
              <li>Ensure the <code className="text-primary bg-primary/10 px-1 py-0.5 rounded">domain_url</code> set in Overview (<span className="text-gray-900 font-medium">{domain.domain_url}</span>) exactly matches your production environment to prevent CORS blocks.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
