import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { 
  ChevronRight, ChevronDown, Globe, Tag, MessageCircle, Search, 
  Plus, Trash2, Save, CheckCircle2, X, RefreshCw, Edit3,  Maximize, Minimize, CheckSquare, Square, UploadCloud, Download, Code, Folder, FileText
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { useToast } from '@/contexts/ToastContext';
import api from '@/utils/api';
import { confirmAction } from '@/utils/confirm';
import { domainService } from '@/services/domainService';
import ModalWrapper from '@/components/ui/ModalWrapper';

import { Tree, TreeNode, Tabs } from '@/components/faq-manager/Tree';
import { DomainManager, DetailsPanel } from '@/components/faq-manager/DomainManager';
import { CategoryManager } from '@/components/faq-manager/CategoryManager';
import { QuestionManager } from '@/components/faq-manager/QuestionManager';
import { DocumentManager } from '@/components/faq-manager/DocumentManager';
import { CreateDomainModal, EditDomainModal, CreateCategoryModal, EditCategoryModal, CreateQuestionModal, AssignExistingModal, BulkUploadModal } from '@/components/faq-manager/Modals';



// ---------------------------------------------------------------------------
// TABS COMPONENT
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// MAIN MANAGER
// ---------------------------------------------------------------------------
export default function FaqHierarchyManager({ scopedDomainId }) {
  const { userData } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  const { showToast } = useToast();
  
  // UI Preferences
  const [isFullscreen, setIsFullscreen] = useState(() => localStorage.getItem('hierarchyFullscreen') === 'true');
  const [treeWidth, setTreeWidth] = useState(() => Number(localStorage.getItem('hierarchyTreeWidth')) || 25);
  const [isDragging, setIsDragging] = useState(false);
  const [isTreeDrawerOpen, setIsTreeDrawerOpen] = useState(false);
  
  const containerRef = useRef(null);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [domainFilterInput, setDomainFilterInput] = useState('');
  const [activeDomainFilter, setActiveDomainFilter] = useState('');

  // Global cached data
  const [domains, setDomains] = useState([]);
  const [categories, setCategories] = useState([]);
  const [domainCategoryMap, setDomainCategoryMap] = useState({});  // domain_id -> [category_ids]
  const [documents, setDocuments] = useState([]);
  // Tree state
  const [expandedNodes, setExpandedNodes] = useState({}); 
  const [selectedNode, setSelectedNode] = useState(null); 
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingNode, setLoadingNode] = useState({}); 
  
  // Modal states
  const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null, parentId: null });

  useEffect(() => { loadInitialData(); }, []);

    // Resizer Logic
  const treeWidthRef = useRef(treeWidth);
  useEffect(() => { treeWidthRef.current = treeWidth; }, [treeWidth]);

  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        if (newWidth > 15 && newWidth < 85) {
          setTreeWidth(newWidth);
        }
      };
      const handleMouseUp = () => {
        setIsDragging(false);
        localStorage.setItem('hierarchyTreeWidth', treeWidthRef.current.toString());
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    localStorage.setItem('hierarchyFullscreen', String(next));
  };

  const loadInitialData = async () => {
    try {
      setLoadingInitial(true);
      const [domRes, catRes, qRes, docRes] = await Promise.all([
        api.get('/domains'),
        api.get('/faq-categories'),
        api.get('/faq-questions'),
        api.get('/documents')
      ]);
      const domsData = scopedDomainId ? domRes.data.filter(d => d.id === scopedDomainId) : domRes.data;
      setDomains(domsData);
      
      // Build domainCategoryMap from domain.category_ids
      const newMap = {};
      domsData.forEach(d => { newMap[d.id] = d.category_ids || []; });
      setDomainCategoryMap(newMap);
      
      const rawCategories = Array.isArray(catRes.data) ? catRes.data : (catRes.data?.data || []);
      const questions = Array.isArray(qRes.data) ? qRes.data : (qRes.data?.data || []);
      
      const categoriesWithQuestions = rawCategories.map(cat => ({
        ...cat,
        questions: questions.filter(q => String(q.faq_id) === String(cat.id))
      }));
      
      setCategories(categoriesWithQuestions);
      setDocuments(docRes.data || []);
    } catch (e) {
      const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Failed to load initial hierarchy data'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Failed to load initial hierarchy data', 'error');} finally {
      setLoadingInitial(false);
    }
  };

  const handleDomainFilterSubmit = (e) => {
    e.preventDefault();
    setActiveDomainFilter(domainFilterInput.trim().toLowerCase());
  };

  const toggleNode = async (nodePath, type, id, data) => {
    const isExpanded = !!expandedNodes[nodePath];
    if (isExpanded) {
      setExpandedNodes(prev => ({ ...prev, [nodePath]: false }));
      return;
    }
    setExpandedNodes(prev => ({ ...prev, [nodePath]: true }));
    
    if (type === 'category' && !categories.find(c => c.id === id)?.questionsLoaded) {
      setLoadingNode(prev => ({ ...prev, [nodePath]: true }));
      try {
        const res = await api.get(`/faq-questions?faq_id=${id}`);
        setCategories(prev => prev.map(c => c.id === id ? { ...c, questions: res.data.data, questionsLoaded: true } : c));
      } catch (e) { console.error(e); } finally { setLoadingNode(prev => ({ ...prev, [nodePath]: false })); }
    }
  };

  // Re-fetch selected node data to ensure details view is fresh
  const selectNode = (type, id, data, tab = null) => {
    if (!type) {
      setSelectedNode(null);
    } else {
      setSelectedNode({ type, id, data, initialTab: tab });
    }
  };

  const openModal = (type, parentId = null, data = null) => setModalState({ isOpen: true, type, parentId, data });
  const closeModal = () => setModalState({ isOpen: false, type: null, data: null, parentId: null });

  const [deletingId, setDeletingId] = useState(null);

  const handleDeleteNode = async (type, id) => {
    const confirm = await confirmAction({ title: `Delete ${type}`, text: `Are you sure you want to delete this ${type}? This action cannot be undone.`, confirmButtonText: 'Yes, Delete' });
    if (!confirm) return;
    setDeletingId(id);
    try {
      if (type === 'domain') {
        await api.delete(`/domains/${id}`);
        setDomains(prev => prev.filter(d => d.id !== id));
      } else if (type === 'category') {
        await api.delete(`/faq-categories/${id}`);
        setCategories(prev => prev.filter(c => c.id !== id));
      } else if (type === 'question') {
        await api.delete(`/faq-questions/${id}`);
        setCategories(prev => prev.map(c => ({ ...c, questions: c.questions?.filter(q => q.id !== id) })));
      }
      if (selectedNode?.id === id) setSelectedNode(null);
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`, 'success');
    } catch (e) {
      const errData = e.response?.data;
      const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || `Error deleting ${type}`;
      showToast(typeof errorMsg === 'string' ? errorMsg : `Error deleting ${type}`, 'error');
    } finally { setDeletingId(null); }
  };

  const handleBulkDownloadFAQs = async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastDownload = localStorage.getItem('last_bulk_download_date');

    if (lastDownload === today) {
      showToast('Bulk download is limited to once per day to conserve server resources. Please try again tomorrow.', 'error');
      return;
    }

    const confirm = await confirmAction({ 
      title: 'Confirm Bulk Download', 
      text: 'To manage database costs, you are only allowed one full bulk download per day. Are you sure you want to download now?', 
      confirmButtonText: 'Yes, Download Now' 
    });
    if (!confirm) return;

    setIsBulkDownloading(true);
    try {
      showToast('Preparing download...', 'info');

      const exportData = [];
      domains.forEach(domain => {
        const domainCatIds = domainCategoryMap[domain.id] || [];
        const domainCats = categories.filter(c => domainCatIds.map(String).includes(String(c.id)));
        if (domainCats.length === 0) {
          exportData.push({ Domain: domain.domain_url, Category: '', Question: '', Answer: '' });
          return;
        }
        domainCats.forEach(category => {
          const catQuestions = category.questions || [];
          if (catQuestions.length === 0) {
            exportData.push({ Domain: domain.domain_url, Category: category.faq_title, Question: '', Answer: '' });
          }
          catQuestions.forEach(q => {
            exportData.push({ Domain: domain.domain_url, Category: category.faq_title, Question: q.question, Answer: q.answer });
          });
        });
      });

      if (exportData.length === 0) {
        showToast('No data to export', 'info');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "All_FAQs");
      XLSX.writeFile(wb, `All_Domains_FAQs.xlsx`);
      
      localStorage.setItem('last_bulk_download_date', today);
      showToast('Download complete', 'success');
    } catch (err) {
      showToast('Failed to download', 'error');
    } finally {
      setIsBulkDownloading(false);
    }
  };

  // Safe wrapper for absolute fullscreen without clipping
  const containerClasses = isFullscreen 
    ? "fixed inset-0 z-[100000] flex flex-col bg-gray-50 text-gray-900 p-6 gap-4" 
    : "h-full flex flex-col bg-gray-50 text-gray-900 overflow-hidden p-0 gap-4";

  const content = (
    <div className={containerClasses} ref={containerRef}>
      {/* Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center shrink-0 py-2 px-2 xl:px-0 gap-4">
        <div className="pl-2">
          {scopedDomainId ? (
            <>
              <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                FAQ Workspace
              </h1>
              <p className="text-gray-500 text-xs md:text-sm mt-1">
                Manage your knowledge architecture and FAQs.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                FAQ Hierarchy Workspace
              </h1>
              <p className="text-gray-500 text-xs md:text-sm mt-1">
                Manage your complete knowledge architecture.
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full xl:w-auto">
          <button onClick={toggleFullscreen} className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl transition-colors border border-gray-200" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}>
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            <span className="text-sm font-medium hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0 bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden relative">
        
        {/* LEFT PANEL: TREE VIEW */}
        <div 
          style={{ '--tree-width': `${treeWidth}%` }} 
          className={`
            flex flex-col bg-gray-50 border-r border-gray-200 shrink-0 h-full
            w-full xl:w-[var(--tree-width)]
            ${selectedNode ? 'hidden xl:flex' : 'flex'}
          `}
        >
          {!scopedDomainId && (
            <div className="p-4 border-b border-gray-200 shrink-0 flex justify-between items-center gap-2">
              <form onSubmit={handleDomainFilterSubmit} className="relative flex gap-2 w-full">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                  <input 
                    type="text" 
                    placeholder="Search domains..." 
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    value={domainFilterInput}
                    onChange={e => {
                      setDomainFilterInput(e.target.value);
                      if(e.target.value === '') setActiveDomainFilter('');
                    }}
                  />
                </div>
              </form>
              <button onClick={() => openModal('create_domain')} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition-colors" title="Add Domain">
                <Plus size={16} />
              </button>
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
            {loadingInitial ? <div className="text-center text-gray-500 py-10">Loading architecture...</div> : 
              <div className="tree-container space-y-1">
                {domains
                  .filter(d => !activeDomainFilter || (d.domain_url && d.domain_url.toLowerCase().includes(activeDomainFilter)))
                  .map(domain => (
                  <TreeNode key={domain.id} type="domain" data={domain} nodePath={`d_${domain.id}`} depth={0} expandedNodes={expandedNodes} toggleNode={toggleNode} selectNode={selectNode} selectedNode={selectedNode} loadingNode={loadingNode} domainCategoryMap={domainCategoryMap} categories={categories} documents={documents} scopedDomainId={scopedDomainId} />
                ))}
              </div>
            }
            {!scopedDomainId && (
              <button onClick={() => openModal('create_domain')} className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-blue-400 hover:text-gray-700 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-xl transition-colors">
                <Plus className="h-4 w-4" /> Add New Domain
              </button>
            )}
          </div>
        </div>

        {/* DRAGGABLE SPLITTER */}
        <div 
          className="w-1.5 bg-gray-50 hover:bg-blue-500 cursor-col-resize shrink-0 hidden xl:flex flex-col justify-center items-center group relative z-10 transition-colors"
          onMouseDown={() => setIsDragging(true)}
        >
          <div className="h-8 w-0.5 bg-slate-600 group-hover:bg-white rounded-full"></div>
        </div>

        {/* RIGHT PANEL: DETAILS */}
        <div className={`flex-1 flex flex-col min-w-0 bg-white overflow-x-auto overflow-y-auto custom-scrollbar ${!selectedNode ? 'hidden xl:flex' : 'flex'}`}>
          <div className="w-full h-full flex flex-col min-w-0">
            {selectedNode && (
              <div className="xl:hidden p-3 border-b border-gray-200 bg-gray-50 flex shrink-0">
                 <button onClick={() => selectNode(null)} className="flex items-center gap-2 text-sm font-medium text-gray-700 px-3 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 shadow-sm transition-colors">
                    <span className="text-xl leading-none">←</span> Back to Hierarchy
                 </button>
              </div>
            )}
            {selectedNode ? (
              <DetailsPanel deletingId={deletingId} selectedNode={selectedNode} customTimeStamp={customTimeStamp} domains={domains} setDomains={setDomains} categories={categories} setCategories={setCategories} domainCategoryMap={domainCategoryMap} setDomainCategoryMap={setDomainCategoryMap} documents={documents} setDocuments={setDocuments} openModal={openModal} selectNode={selectNode} handleDeleteNode={handleDeleteNode} scopedDomainId={scopedDomainId} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 flex-col gap-4   ">
                <div className="w-20 h-20 rounded-full border border-gray-200 flex items-center justify-center bg-white">
                  <Globe className="h-8 w-8 text-gray-700" />
                </div>
                <p className="text-sm font-medium">Select a node in the tree to view its workspace</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS RENDERING */}
      {modalState.isOpen && modalState.type === 'create_domain' && <CreateDomainModal isOpen={true} onClose={closeModal} setDomains={setDomains} selectNode={selectNode} />}
      {modalState.isOpen && modalState.type === 'edit_domain' && <EditDomainModal isOpen={true} onClose={closeModal} domain={modalState.data} setDomains={setDomains} selectNode={selectNode} />}
      
      {modalState.isOpen && modalState.type === 'create_category' && <CreateCategoryModal isOpen={true} onClose={closeModal} parentId={modalState.parentId} domains={domains} categories={categories} setCategories={setCategories} domainCategoryMap={domainCategoryMap} setDomainCategoryMap={setDomainCategoryMap} selectNode={selectNode} />}
      {modalState.isOpen && modalState.type === 'edit_category' && <EditCategoryModal isOpen={true} onClose={closeModal} category={modalState.data} categories={categories} setCategories={setCategories} selectNode={selectNode} />}
      {modalState.isOpen && modalState.type === 'assign_category' && <AssignExistingModal isOpen={true} onClose={closeModal} parentId={modalState.parentId} type="category" allItems={categories} assignedIds={domainCategoryMap[modalState.parentId] || []} onSave={async (ids) => { try { await api.put(`/domains/${modalState.parentId}/categories`, { category_ids: ids }); setDomainCategoryMap(prev => ({...prev, [modalState.parentId]: ids})); showToast('Category assignments updated', 'success'); closeModal(); } catch (err) { showToast(`Error: ${err.response?.data?.detail || err.message}`, 'error'); throw err; } }} />}
      
      {modalState.isOpen && modalState.type === 'create_question' && <CreateQuestionModal isOpen={true} onClose={closeModal} parentId={modalState.parentId} categories={categories} setCategories={setCategories} selectNode={selectNode} />}
      {modalState.isOpen && modalState.type === 'bulk_upload_faq' && <BulkUploadModal isOpen={true} onClose={closeModal} loadInitialData={loadInitialData} domain={modalState.data} uploadType="faq" />}
      {modalState.isOpen && modalState.type === 'bulk_upload_doc' && <BulkUploadModal isOpen={true} onClose={closeModal} loadInitialData={loadInitialData} domain={modalState.data} uploadType="doc" />}
      {modalState.isOpen && modalState.type === 'bulk_download' && <BulkDownloadModal isOpen={true} onClose={closeModal} domains={domains} categories={categories} domainCategoryMap={domainCategoryMap} initialDomain={modalState.data} />}
      

    </div>
  );
  
  if (isFullscreen) {
    return createPortal(content, document.body);
  }
  return content;
}

// ---------------------------------------------------------------------------
// TREE NODE COMPONENT (Visual Hierarchy + Counts)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// DETAILS PANEL COMPONENTS (TABBED)
// ---------------------------------------------------------------------------











// ---------------------------------------------------------------------------
// QUESTION MANAGER (INLINE LIVE EDITOR)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// CREATE & EDIT MODALS
// ---------------------------------------------------------------------------


















// ---------------------------------------------------------------------------
// BULK DOWNLOAD MODAL
// ---------------------------------------------------------------------------
function BulkDownloadModal({ isOpen, onClose, domains, categories, domainCategoryMap, initialDomain }) {
  const { showToast } = useToast();
  const [selectedDomainId, setSelectedDomainId] = useState(initialDomain ? initialDomain.id : 'all');
  const [selectedCatIds, setSelectedCatIds] = useState(['all']);
  const [isDownloading, setIsDownloading] = useState(false);

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
      const confirm = await confirmAction({ title: 'Confirm Full Download', text: 'You are allowed one full download per day. Continue?', confirmButtonText: 'Yes, Download' });
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

        <div className="flex justify-end pt-4 gap-3 border-t border-gray-100 mt-6">
          <button onClick={onClose} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900">Cancel</button>
          <button onClick={handleDownload} disabled={isDownloading || (selectedDomainId !== 'all' && selectedCatIds.length === 0)} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2">
            {isDownloading ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>} {isDownloading ? 'Processing...' : 'Download Data'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// ---------------------------------------------------------------------------
// BULK UPLOAD MODAL
// ---------------------------------------------------------------------------



