import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Download, RefreshCw, CheckCircle2 } from 'lucide-react';
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
  const [questions, setQuestions] = useState([]);
  
  const [exportMode, setExportMode] = useState('domain'); // 'domain' or 'category'
  // using single string for radio selection instead of array
  const [selectedDomainId, setSelectedDomainId] = useState('all');
  const [selectedCatId, setSelectedCatId] = useState('all');

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setExportMode('domain');
      setSelectedDomainId('all');
      setSelectedCatId('all');
    }
  }, [isOpen]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch 10000 questions to ensure we get all of them, bypassing the default page_size=10 pagination
      const [domRes, catRes, qRes] = await Promise.all([
        api.get('/domains'),
        api.get('/faq-categories'),
        api.get('/faq-questions?page_size=10000')
      ]);
      
      setDomains(domRes.data || []);
      setCategories(catRes.data || []);
      
      // The API returns paginated structure: { data: [...], pagination: {...} }
      setQuestions(qRes.data?.data || qRes.data || []);
      
    } catch (err) {
      console.error(err);
      showToast('Error loading hierarchy data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastDownload = localStorage.getItem('last_bulk_download_date');
    const isFullDownload = (exportMode === 'domain' && selectedDomainId === 'all') || 
                           (exportMode === 'category' && selectedCatId === 'all');

    if (isFullDownload && lastDownload === today) {
      showToast('Full bulk download is limited to once per day to conserve resources. Please select a specific item.', 'error');
      return;
    }
    if (isFullDownload) {
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
        
        if (exportMode === 'domain') {
          // Mode 1: By Domain
          const activeDomains = selectedDomainId === 'all' 
            ? domains 
            : domains.filter(d => String(d.id) === String(selectedDomainId));
            
          const sortedDomains = [...activeDomains].sort((a, b) => (a.domain_url || '').localeCompare(b.domain_url || ''));

          sortedDomains.forEach(domain => {
            const categoryIds = new Set(domain.category_ids || []);

const domainCats = categories.filter(c =>
    categoryIds.has(c.id)
);
            const sortedCats = [...domainCats].sort((a, b) => (a.faq_title || '').localeCompare(b.faq_title || ''));
            
            let isFirstRowForDomain = true;

            if (sortedCats.length === 0) {
              exportData.push({ Domain: domain.domain_url, Category: '', Question: '', Answer: '' });
            } else {
              sortedCats.forEach(cat => {
                let isFirstRowForCat = true;
                // Use faq_id to map questions to categories
                const catQuestions = questions.filter(q => String(q.faq_id) === String(cat.id));
                const sortedQs = [...catQuestions].sort((a, b) => (a.question || '').localeCompare(b.question || ''));
                
                if (sortedQs.length === 0) {
                  exportData.push({ 
                    Domain: isFirstRowForDomain ? domain.domain_url : '', 
                    Category: cat.faq_title, 
                    Question: '', 
                    Answer: '' 
                  });
                  isFirstRowForDomain = false;
                } else {
                  sortedQs.forEach(q => {
                    exportData.push({ 
                      Domain: isFirstRowForDomain ? domain.domain_url : '', 
                      Category: isFirstRowForCat ? cat.faq_title : '', 
                      Question: q.question || '', 
                      Answer: q.answer || '' 
                    });
                    isFirstRowForDomain = false;
                    isFirstRowForCat = false;
                  });
                }
              });
            }
          });
          
        } else {
          // Mode 2: By Category
          const uniqueCatTitles = Array.from(new Set(categories.map(c => c.faq_title))).filter(Boolean);
          const activeCatTitles = selectedCatId === 'all'
            ? uniqueCatTitles
            : uniqueCatTitles.filter(t => t === selectedCatId);
            
          const sortedCatTitles = [...activeCatTitles].sort((a, b) => a.localeCompare(b));
          
          sortedCatTitles.forEach(catTitle => {
            let isFirstRowForCat = true;

const matchingCats = categories.filter(c => c.faq_title === catTitle);

const matchingCatIds = matchingCats.map(c => String(c.id));

const associatedDomains = domains
  .filter(domain =>
    (domain.category_ids || []).some(categoryId =>
      matchingCatIds.includes(String(categoryId))
    )
  )
  .map(domain => domain.domain_url);

const domainsString = [...new Set(associatedDomains)]
  .sort()
  .join(', ');
            
            // Use faq_id mapping!
            const allQs = questions.filter(q => matchingCatIds.includes(String(q.faq_id)));
            
            const uniqueQA = [];
            const seenQA = new Set();
            allQs.forEach(q => {
              const key = `${q.question}::|::${q.answer}`;
              if (!seenQA.has(key)) {
                seenQA.add(key);
                uniqueQA.push(q);
              }
            });

            const sortedQs = uniqueQA.sort((a, b) => (a.question || '').localeCompare(b.question || ''));
            
            if (sortedQs.length === 0) {
              exportData.push({ 
                Category: catTitle, 
                Domains: domainsString, 
                Question: '', 
                Answer: '' 
              });
            } else {
              sortedQs.forEach(q => {
                exportData.push({ 
                  Category: isFirstRowForCat ? catTitle : '', 
                  Domains: isFirstRowForCat ? domainsString : '', 
                  Question: q.question || '', 
                  Answer: q.answer || '' 
                });
                isFirstRowForCat = false;
              });
            }
          });
        }

        if (exportData.length === 0) {
          showToast('No FAQs found for the selected filters', 'info');
          return;
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "FAQs");
        
        let filename = 'FAQs_Export.xlsx';
        if (exportMode === 'domain' && selectedDomainId !== 'all') {
          filename = 'Filtered_Domains_FAQs.xlsx';
        } else if (exportMode === 'category' && selectedCatId !== 'all') {
          filename = 'Filtered_Categories_FAQs.xlsx';
        }
        
        XLSX.writeFile(wb, filename);
        if (isFullDownload) localStorage.setItem('last_bulk_download_date', today);
        onClose();
      } catch (err) {
        console.error(err);
        showToast('Error downloading FAQs', 'error');
      } finally { setIsDownloading(false); }
    }, 50);
  };
  
  const uniqueCategoryOptions = useMemo(() => {
    return Array.from(new Set(categories.map(c => c.faq_title))).filter(Boolean).sort();
  }, [categories]);

  // Reusable Radio Option Component
  const RadioOption = ({ label, value, selectedValue, onChange }) => (
    <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
      selectedValue === value 
        ? 'border-blue-500 bg-blue-50/50' 
        : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
    }`}>
      <input 
        type="radio" 
        className="hidden" 
        value={value}
        checked={selectedValue === value}
        onChange={onChange}
      />
      <div className={`flex items-center justify-center w-5 h-5 rounded-full border ${
        selectedValue === value ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
      }`}>
        {selectedValue === value && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
      <span className={`text-sm font-medium ${selectedValue === value ? 'text-blue-700' : 'text-gray-700'}`}>
        {label}
      </span>
    </label>
  );

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Bulk Download FAQs" icon={Download} iconColor="text-blue-500">
      {loading ? (
        <div className="flex justify-center p-8">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setExportMode('domain')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                exportMode === 'domain' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              By Domain
            </button>
            <button
              onClick={() => setExportMode('category')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                exportMode === 'category' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              By Category
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2 space-y-2">
            {exportMode === 'domain' ? (
              <>
                <RadioOption 
                  label="All Domains" 
                  value="all" 
                  selectedValue={selectedDomainId} 
                  onChange={() => setSelectedDomainId('all')} 
                />
                {domains.sort((a, b) => (a.domain_url || '').localeCompare(b.domain_url || '')).map(d => (
                  <RadioOption 
                    key={d.id} 
                    label={d.domain_url} 
                    value={d.id} 
                    selectedValue={selectedDomainId} 
                    onChange={() => setSelectedDomainId(d.id)} 
                  />
                ))}
              </>
            ) : (
              <>
                <RadioOption 
                  label="All Categories" 
                  value="all" 
                  selectedValue={selectedCatId} 
                  onChange={() => setSelectedCatId('all')} 
                />
                {uniqueCategoryOptions.map(title => (
                  <RadioOption 
                    key={title} 
                    label={title} 
                    value={title} 
                    selectedValue={selectedCatId} 
                    onChange={() => setSelectedCatId(title)} 
                  />
                ))}
              </>
            )}
          </div>

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
