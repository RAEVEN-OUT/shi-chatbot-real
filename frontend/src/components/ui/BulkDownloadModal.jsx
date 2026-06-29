import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Download, RefreshCw } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import api from '@/utils/api';
import { confirmAction } from '@/utils/confirm';
import ModalWrapper from '@/components/ui/ModalWrapper';

export default function BulkDownloadModal({ isOpen, onClose }) {
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [domains, setDomains] = useState([]);
  const [categories, setCategories] = useState([]);
  const [domainCategoryMap, setDomainCategoryMap] = useState({});
  
  const [selectedDomainId, setSelectedDomainId] = useState('all');
  const [selectedCatIds, setSelectedCatIds] = useState(['all']);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setSelectedDomainId('all');
      setSelectedCatIds(['all']);
    }
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [domRes, catRes, qRes] = await Promise.all([
        api.get('/domains'),
        api.get('/faq-categories'),
        api.get('/faq-questions')
      ]);
      
      const allDomains = domRes.data || [];
      const allCats = catRes.data || [];
      const allQs = qRes.data || [];
      
      // Build domainCategoryMap
      const dmap = {};
      allCats.forEach(c => {
        if (!dmap[c.domain_id]) dmap[c.domain_id] = [];
        dmap[c.domain_id].push(c.id);
      });
      setDomainCategoryMap(dmap);
      setDomains(allDomains);
      
      // Map questions to categories
      const mappedCats = allCats.map(c => ({
        ...c,
        questions: allQs.filter(q => q.category_id === c.id)
      }));
      setCategories(mappedCats);
      
    } catch (err) {
      console.error(err);
      showToast('Error loading hierarchy data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedCatIds(['all']);
  }, [selectedDomainId]);

  const availableCategories = React.useMemo(() => {
    if (selectedDomainId === 'all') return [];
    const assignedIds = domainCategoryMap[selectedDomainId] || [];
    return categories.filter(c => assignedIds.map(String).includes(String(c.id)));
  }, [selectedDomainId, domainCategoryMap, categories]);

  const handleDownload = async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastDownload = localStorage.getItem('last_bulk_download_date');
    if (selectedDomainId === 'all' && lastDownload === today) {
      showToast('Full bulk download is limited to once per day to conserve resources. Please select a specific domain.', 'error');
      return;
    }
    if (selectedDomainId === 'all') {
      const confirm = await confirmAction({ 
        title: 'Confirm Full Download', 
        text: 'To manage database costs, you are only allowed one full bulk download per day. Are you sure you want to download now?', 
        confirmButtonText: 'Yes, Download' 
      });
      if (!confirm) return;
    }

    setIsDownloading(true);
    setTimeout(() => {
      try {
        const exportData = [];
        const domainsToExport = selectedDomainId === 'all' ? domains : domains.filter(d => String(d.id) === String(selectedDomainId));
        
        domainsToExport.forEach(d => {
          const catIds = domainCategoryMap[d.id] || [];
          let dCats = categories.filter(c => catIds.map(String).includes(String(c.id)));
          
          if (selectedDomainId !== 'all' && !selectedCatIds.includes('all')) {
            dCats = dCats.filter(c => selectedCatIds.includes(String(c.id)));
          }

          if (dCats.length === 0) {
            exportData.push({ Domain: d.domain_url, Category: '', Question: '', Answer: '' });
          } else {
            dCats.forEach(c => {
              const qList = c.questions || [];
              if (qList.length === 0) {
                exportData.push({ Domain: d.domain_url, Category: c.faq_title, Question: '', Answer: '' });
              } else {
                qList.forEach(q => {
                  exportData.push({ Domain: d.domain_url, Category: c.faq_title, Question: q.question, Answer: q.answer });
                });
              }
            });
          }
        });

        if (exportData.length === 0) {
          showToast('No FAQs found for the selected filters', 'info');
          return;
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "FAQs");
        const filename = selectedDomainId === 'all' ? 'All_Domains_FAQs.xlsx' : `${domainsToExport[0]?.domain_url}_FAQs.xlsx`;
        XLSX.writeFile(wb, filename);
        if (selectedDomainId === 'all') localStorage.setItem('last_bulk_download_date', today);
        onClose();
      } catch (err) {
        showToast('Error downloading FAQs', 'error');
      } finally { setIsDownloading(false); }
    }, 50);
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Download FAQs" icon={Download} iconColor="text-blue-500">
      {loading ? (
        <div className="flex justify-center p-8">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Domain</label>
            <select value={selectedDomainId} onChange={e => setSelectedDomainId(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500">
              <option value="all">All Domains</option>
              {domains.map(d => <option key={d.id} value={d.id}>{d.domain_url}</option>)}
            </select>
          </div>

          {selectedDomainId !== 'all' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Categories</label>
              <select multiple size={4} value={selectedCatIds} onChange={e => {
                const vals = Array.from(e.target.selectedOptions, option => option.value);
                if (vals.includes('all') && !selectedCatIds.includes('all')) setSelectedCatIds(['all']);
                else setSelectedCatIds(vals.filter(v => v !== 'all').length === 0 ? ['all'] : vals.filter(v => v !== 'all'));
              }} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500 custom-scrollbar">
                <option value="all">All Categories</option>
                {availableCategories.map(c => <option key={c.id} value={c.id}>{c.faq_title}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Hold Ctrl (Windows) or Cmd (Mac) to select multiple categories.</p>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
              Cancel
            </button>
            <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {isDownloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isDownloading ? 'Processing...' : 'Download Excel'}
            </button>
          </div>
        </div>
      )}
    </ModalWrapper>
  );
}
