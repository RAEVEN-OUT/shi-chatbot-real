'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { domainService } from '@/services/domainService';
import { Code, Copy, Check, Terminal } from 'lucide-react';

export default function EmbedCode() {
  const { currentUser } = useAuth();
  const [domains, setDomains] = useState([]);
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  useEffect(() => {
    if (currentUser) {
      fetchDomains();
    }
  }, [currentUser]);

  let apiUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '');
  if (!apiUrl || apiUrl.trim() === '') {
    apiUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000';
  } else {
    apiUrl = apiUrl.trim();
  }
  
  const embedCodeString = `<!-- AI Chatbot Embed Widget -->
<script>
  window.CHATBOT_CONFIG = {
    apiKey: "${selectedDomainId}"
  };
</script>
<script src="${apiUrl}/public/widget/widget.min.js" async></script>`;

  const copyToClipboard = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(embedCodeString).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(err => console.error('Failed to copy', err));
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = embedCodeString;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  };

  if (loading) {
    return <div className="text-gray-500 p-8">Loading embed parameters...</div>;
  }

  if (domains.length === 0) {
    return (
      <div className="bg-white p-12 rounded-3xl text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-white border-gray-200 rounded-2xl flex items-center justify-center text-gray-500 mb-4">
          <Code size={32} />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">No domains registered</h3>
        <p className="text-gray-500 max-w-md mx-auto mb-6">Register a domain first to obtain its embed widget parameters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Embed Chatbot Widget</h1>
        <p className="text-gray-500 text-sm mt-1">Copy and paste this snippet into the HTML of your website before the closing &lt;/body&gt; tag.</p>
      </div>

      <div className="bg-white p-6 rounded-3xl space-y-6">
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

        <div className="space-y-2 relative">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal size={14} className="text-primary" />
              HTML Snippet
            </span>
            <button 
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1 bg-white border-gray-200 hover:bg-white border-gray-200 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-all"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy Snippet
                </>
              )}
            </button>
          </div>
          <pre className="w-full bg-gray-50 p-5 rounded-2xl border border-gray-200 overflow-x-auto text-xs text-gray-700 font-mono select-all leading-relaxed">
            {embedCodeString}
          </pre>
        </div>
      </div>
    </div>
  );
}
