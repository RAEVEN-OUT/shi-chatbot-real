import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { 
  ChevronRight, ChevronDown, Globe, Tag, MessageCircle, Search, 
  Plus, Trash2, Save, CheckCircle2, X, RefreshCw, Edit3, Link, AlertTriangle, ShieldAlert, Zap,
  Maximize, Minimize, CheckSquare, Square, BrainCircuit, Activity, Network, UploadCloud, Download, Code
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { useToast } from '@/contexts/ToastContext';
import api from '@/utils/api';
import { confirmAction } from '@/utils/confirm';
import { domainService } from '@/services/domainService';
import ModalWrapper from '@/components/ui/ModalWrapper';



// ---------------------------------------------------------------------------
// TABS COMPONENT
// ---------------------------------------------------------------------------
function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex gap-6 border-b border-gray-200 px-6 bg-white shrink-0 overflow-x-auto custom-scrollbar">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2
            ${activeTab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
          {t.icon && <t.icon size={14} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

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
  
  // Tree state
  const [expandedNodes, setExpandedNodes] = useState({}); 
  const [selectedNode, setSelectedNode] = useState(null); 
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingNode, setLoadingNode] = useState({}); 
  
  // Modal states
  const [modalState, setModalState] = useState({ isOpen: false, type: null, data: null, parentId: null });

  useEffect(() => { loadInitialData(); }, []);

  // Resizer Logic
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
        localStorage.setItem('hierarchyTreeWidth', treeWidth.toString());
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, treeWidth]);

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    localStorage.setItem('hierarchyFullscreen', String(next));
  };

  const loadInitialData = async () => {
    try {
      setLoadingInitial(true);
      const [domRes, catRes, qRes] = await Promise.all([
        api.get('/domains'),
        api.get('/faq-categories'),
        api.get('/faq-questions')
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
    } catch (e) {
      const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Failed to load initial hierarchy data'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Failed to load initial hierarchy data', 'error');} finally {
      setLoadingInitial(false);
    }
  };

  const handleDomainFilterSubmit = (e) => {
    e.preventDefault();
    setActiveDomainFilter(domainFilterInput.trim().toLowerCase());
  };

  const toggleNode = async (nodePath, type, id) => {
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
      } catch (e) {} finally { setLoadingNode(prev => ({ ...prev, [nodePath]: false })); }
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
          <button onClick={() => openModal('bulk_upload')} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-gray-900 rounded-xl font-medium transition-all shadow-lg shadow-teal-500/20 text-sm">
            <UploadCloud className="h-4 w-4" /> Bulk Upload
          </button>
          <button onClick={handleBulkDownloadFAQs} disabled={isBulkDownloading} className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-xl font-medium transition-all shadow-sm text-sm border border-gray-200 disabled:opacity-50">
            {isBulkDownloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {isBulkDownloading ? 'Preparing...' : 'Bulk Download'}
          </button>

          <div className="w-px h-8 bg-gray-50 mx-1"></div>
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
                  <TreeNode key={domain.id} type="domain" data={domain} nodePath={`d_${domain.id}`} depth={0} expandedNodes={expandedNodes} toggleNode={toggleNode} selectNode={selectNode} selectedNode={selectedNode} loadingNode={loadingNode} domainCategoryMap={domainCategoryMap} categories={categories} scopedDomainId={scopedDomainId} />
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
              <DetailsPanel deletingId={deletingId} selectedNode={selectedNode} customTimeStamp={customTimeStamp} domains={domains} setDomains={setDomains} categories={categories} setCategories={setCategories} domainCategoryMap={domainCategoryMap} setDomainCategoryMap={setDomainCategoryMap} openModal={openModal} selectNode={selectNode} handleDeleteNode={handleDeleteNode} scopedDomainId={scopedDomainId} />
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
      {modalState.isOpen && modalState.type === 'bulk_upload' && <BulkUploadModal isOpen={true} onClose={closeModal} loadInitialData={loadInitialData} />}
      

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
function TreeNode({ type, data, nodePath, depth, expandedNodes, toggleNode, selectNode, selectedNode, loadingNode, domainCategoryMap, categories, scopedDomainId }) {
  const isExpanded = !!expandedNodes[nodePath];
  const isSelected = selectedNode?.id === data.id;
  const isLoading = !!loadingNode[nodePath];
  let children = [];
  let childType = '';
  let count = 0;
  
  if (type === 'domain') { 
    childType = 'category'; 
    children = categories.filter(c => (domainCategoryMap[data.id] || []).map(String).includes(String(c.id)));
    count = children.length;
  }
  else if (type === 'category') { 
    childType = 'question'; 
    children = data.questions || []; 
    count = children.length;
  }

  const childTypeDisplay = childType === 'category' ? (count === 1 ? 'category' : 'categories') : (count === 1 ? 'question' : 'questions');
  const emptyChildTypeDisplay = childType === 'category' ? 'categories' : 'questions';

  const hasChildren = type !== 'question';
  const getIcon = () => {
    if(type === 'domain') {
      if (scopedDomainId) return null; // Remove icon in scoped mode
      return <Globe className="h-4 w-4 text-blue-400 shrink-0" />;
    }
    if(type === 'category') return <Tag className="h-4 w-4 text-purple-400 shrink-0" />;
    return <MessageCircle className="h-4 w-4 text-amber-400 shrink-0" />;
  };
  
  let title = type === 'domain' ? (data.domain_url || data.name) : type === 'category' ? data.faq_title : data.question;
  if (type === 'domain' && scopedDomainId) {
    title = count > 0 ? 'Categories' : 'Add Category';
  }

  return (
    <div className="w-full relative group">
      <div 
        className={`flex items-center py-1.5 px-2 rounded-xl cursor-pointer transition-colors relative z-10
          ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50/50 border border-transparent'}
        `}
      >
        <div className={`w-5 h-5 flex items-center justify-center mr-1 shrink-0 ${hasChildren ? 'cursor-pointer hover:bg-gray-100 rounded' : ''}`} onClick={(e) => { e.stopPropagation(); if (hasChildren) { toggleNode(nodePath, type, data.id); selectNode(type, data.id, data); } }}>
          {isLoading ? <RefreshCw className="h-3 w-3 animate-spin text-gray-500" /> : hasChildren ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />) : <span className="w-3.5 h-3.5" />}
        </div>
        <div className="flex flex-1 items-center gap-2 truncate" onClick={() => {selectNode(type, data.id, data); if (hasChildren && !isExpanded) toggleNode(nodePath, type, data.id); if(window.innerWidth < 1280) setIsTreeDrawerOpen(false);}}>  
          {getIcon()}
          <span title={title} className={`truncate text-sm ${isSelected ? 'text-blue-700 font-bold' : 'text-gray-700'}`}>{title}</span>
          {hasChildren && <span className="text-[10px] text-gray-500 ml-auto mr-1 bg-gray-50 px-1.5 py-0.5 rounded shrink-0">{count} {childTypeDisplay}</span>}
          {hasChildren && (
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                selectNode(type, data.id, data, 'create'); 
                if (!isExpanded) toggleNode(nodePath, type, data.id); 
              }}
              className="flex items-center justify-center w-5 h-5 rounded hover:bg-blue-100 text-blue-500 ml-1 transition-colors"
              title={`Create ${childType === 'category' ? 'Category' : 'Question'}`}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>
      
      {isExpanded && hasChildren && (
        <div className="relative mt-1">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100/50 -z-10"></div>
          
          <div className="pl-6 space-y-0.5 pb-1">
            {children.length === 0 && !isLoading && (
              <div className="text-xs text-gray-500 py-1 pl-4 italic relative">
                <div className="absolute left-[-8px] top-[10px] w-3 h-px bg-gray-100/50 -z-10"></div>
                No {emptyChildTypeDisplay} assigned
              </div>
            )}            {children.map(child => (
              <div key={child.id} className="relative">
                <div className="absolute left-[-8px] top-[14px] w-3 h-px bg-gray-100/50 -z-10"></div>
                <TreeNode type={childType} data={child} nodePath={`${nodePath}-${childType.charAt(0)}_${child.id}`} depth={depth + 1} expandedNodes={expandedNodes} toggleNode={toggleNode} selectNode={selectNode} selectedNode={selectedNode} loadingNode={loadingNode} domainCategoryMap={domainCategoryMap} categories={categories} scopedDomainId={scopedDomainId} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DETAILS PANEL COMPONENTS (TABBED)
// ---------------------------------------------------------------------------
function DetailsPanel({ deletingId, selectedNode, customTimeStamp, domains, setDomains, categories, setCategories, domainCategoryMap, setDomainCategoryMap, openModal, selectNode, handleDeleteNode, scopedDomainId }) {
  const { type, data } = selectedNode;
  let freshData = data;
  if(type === 'domain') freshData = domains.find(d => d.id === data.id) || data;
  if(type === 'category') freshData = categories.find(c => c.id === data.id) || data;
  if(type === 'question') {
    const parentCat = categories.find(c => c.questions?.some(q => q.id === data.id));
    if(parentCat) freshData = parentCat.questions.find(q => q.id === data.id) || data;
  }
  if (type === 'domain') return <DomainManager deletingId={deletingId} domain={freshData} domains={domains} setDomains={setDomains} categories={categories} setCategories={setCategories} domainCategoryMap={domainCategoryMap} setDomainCategoryMap={setDomainCategoryMap} openModal={openModal} selectNode={selectNode} handleDeleteNode={handleDeleteNode} initialTab={selectedNode.initialTab} scopedDomainId={scopedDomainId} />;
  if (type === 'category') return <CategoryManager deletingId={deletingId} category={freshData} categories={categories} setCategories={setCategories} openModal={openModal} selectNode={selectNode} handleDeleteNode={handleDeleteNode} initialTab={selectedNode.initialTab} />;
  if (type === 'question') return <QuestionManager deletingId={deletingId} question={freshData} customTimeStamp={customTimeStamp} categories={categories} setCategories={setCategories} selectNode={selectNode} handleDeleteNode={handleDeleteNode} />;
  return null;
}

function DomainManager({ deletingId, domain, domains, setDomains, categories, setCategories, domainCategoryMap, setDomainCategoryMap, openModal, selectNode, handleDeleteNode, initialTab, scopedDomainId }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'assignments');
  const assignedCatIds = domainCategoryMap[domain.id] || [];
  const validAssignedCategories = categories.filter(c => assignedCatIds.map(String).includes(String(c.id)));
  const { showToast } = useToast();
  const [removingId, setRemovingId] = useState(null);
  const [selectedCats, setSelectedCats] = useState(new Set());
  const [isBulkRemoving, setIsBulkRemoving] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: domain?.name||'', url: domain?.domain_url||'', welcome_message: domain?.welcome_message||'', fallback_message: domain?.fallback_message||'', helpline_number: domain?.helpline_number||'', widget_title: domain?.widget_title||'', widget_color: domain?.widget_color||'#7C3AED', bot_avatar: domain?.bot_avatar||'', is_active: domain?.is_active??true });
  const [editing, setEditing] = useState(false);
  const [createCategoryData, setCreateCategoryData] = useState({ faq_title: '', status: 'active' });
  const [creating, setCreating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setEditFormData({ name: domain?.name||'', url: domain?.domain_url||'', welcome_message: domain?.welcome_message||'', fallback_message: domain?.fallback_message||'', helpline_number: domain?.helpline_number||'', widget_title: domain?.widget_title||'', widget_color: domain?.widget_color||'#7C3AED', bot_avatar: domain?.bot_avatar||'', is_active: domain?.is_active??true });
  }, [domain]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, domain.id]);

  const tabs = [
    { id: 'assignments', label: `Categories (${validAssignedCategories.length})`, icon: Tag },
    { id: 'create', label: 'Create Category', icon: Plus },
    ...(scopedDomainId ? [] : [
      { id: 'edit', label: 'Settings & Widget Style', icon: Edit3 },
      { id: 'embed', label: 'Embed Code', icon: Code },
    ])
  ];

  const handleDownloadFAQs = () => {
    setIsDownloading(true);
    setTimeout(() => {
      try {
        const exportData = [];
        if (validAssignedCategories.length === 0) { showToast('No FAQs found for this domain', 'info'); return; }
        validAssignedCategories.forEach(category => {
          const catQuestions = category.questions || [];
          if (catQuestions.length === 0) exportData.push({ Domain: domain.domain_url, Category: category.faq_title, Question: '', Answer: '' });
          catQuestions.forEach(q => exportData.push({ Domain: domain.domain_url, Category: category.faq_title, Question: q.question, Answer: q.answer }));
        });
        if (exportData.length === 0) { showToast('No data to export', 'info'); return; }
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "FAQs");
        XLSX.writeFile(wb, `${domain.domain_url.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_FAQs.xlsx`);
      } finally { setIsDownloading(false); }
    }, 50);
  };

  const removeCategory = async (catId) => {
    const confirm = await confirmAction({ title: 'Remove Category', text: 'Remove this category from the domain?', confirmButtonText: 'Yes, Remove' });
    if (!confirm) return;
    setRemovingId(catId);
    try {
      const newIds = assignedCatIds.filter(id => id !== catId);
      await api.put(`/domains/${domain.id}/categories`, { category_ids: newIds });
      setDomainCategoryMap(prev => ({ ...prev, [domain.id]: newIds }));
      showToast('Category removed', 'success');
    } catch (e) { showToast('Error removing category', 'error'); } finally { setRemovingId(null); }
  };

  const handleBulkRemoveCategories = async () => {
    if (selectedCats.size === 0) return;
    const confirm = await confirmAction({ title: 'Bulk Remove', text: `Remove ${selectedCats.size} categories?`, confirmButtonText: 'Yes, Remove' });
    if (!confirm) return;
    setIsBulkRemoving(true);
    try {
      const newIds = assignedCatIds.filter(id => !selectedCats.has(id));
      await api.put(`/domains/${domain.id}/categories`, { category_ids: newIds });
      setDomainCategoryMap(prev => ({ ...prev, [domain.id]: newIds }));
      setSelectedCats(new Set());
      showToast('Categories removed', 'success');
    } catch (e) { showToast('Error removing categories', 'error'); } finally { setIsBulkRemoving(false); }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditing(true);
    try {
      await api.put(`/domains/${domain.id}`, { ...editFormData, domain_url: editFormData.url.trim() });
      const updatedDomain = { ...domain, ...editFormData, domain_url: editFormData.url.trim() };
      setDomains(prev => prev.map(d => d.id === domain.id ? updatedDomain : d));
      showToast('Domain updated', 'success');
      selectNode('domain', domain.id, updatedDomain);
    } catch (e) { const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error updating domain'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Error updating domain', 'error');} finally { setEditing(false); }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const existingCat = categories.find(c => c.faq_title.toLowerCase() === createCategoryData.faq_title.trim().toLowerCase());
      if (existingCat) {
        if (assignedCatIds.includes(existingCat.id)) { showToast('Already assigned', 'info'); setCreating(false); return; }
        const newIds = [...assignedCatIds, existingCat.id];
        await api.put(`/domains/${domain.id}/categories`, { category_ids: newIds });
        setDomainCategoryMap(prev => ({ ...prev, [domain.id]: newIds }));
        showToast('Category assigned', 'success');
        setCreateCategoryData({ faq_title: '', status: 'active' });
        setActiveTab('assignments');
        setCreating(false);
        return;
      }
      const res = await api.post('/faq-categories', createCategoryData);
      const newCat = res.data.category || res.data;
      setCategories(prev => [...prev, newCat]);
      const newIds = [...assignedCatIds, newCat.id];
      await api.put(`/domains/${domain.id}/categories`, { category_ids: newIds });
      setDomainCategoryMap(prev => ({ ...prev, [domain.id]: newIds }));
      showToast('Category created', 'success');
      setCreateCategoryData({ faq_title: '', status: 'active' });
      setActiveTab('assignments');
    } catch (e) { const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Error', 'error');} finally { setCreating(false); }
  };

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="p-4 md:p-6 border-b border-gray-200 flex flex-col xl:flex-row justify-between items-start bg-white shrink-0 gap-4">
        <div className="w-full xl:w-auto overflow-hidden">
          {!scopedDomainId && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">Domain</span>
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${domain.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-100 text-gray-700'}`}>{domain.is_active ? 'Active' : 'Disabled'}</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{domain.domain_url}</h2>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 w-full xl:w-auto">
          <button onClick={() => setActiveTab('create')} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium flex items-center gap-1 shadow-sm transition-colors"><Plus size={16}/> Create Category</button>
          <button onClick={() => openModal('assign_category', domain.id)} className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded text-sm font-medium flex items-center gap-1 shadow-sm transition-colors"><Link size={14}/> Assign Category</button>
          <button onClick={handleDownloadFAQs} disabled={isDownloading} className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded text-sm font-medium flex items-center gap-1 shadow-sm transition-colors disabled:opacity-50">{isDownloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14}/>} {isDownloading ? 'Preparing...' : 'Download FAQs'}</button>
          <div className="w-px h-8 bg-gray-50 mx-1 mt-1"></div>
          <button onClick={() => handleDeleteNode('domain', domain.id)} disabled={deletingId === domain.id} className="p-2 mt-1 bg-gray-50 hover:bg-red-500/20 rounded text-gray-700 hover:text-gray-500 transition-colors disabled:opacity-50">{deletingId === domain.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Trash2 size={16}/>}</button>
        </div>
      </div>
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'assignments' && (
          <div className="max-w-4xl space-y-4 m-6">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-gray-500">FAQ Categories serving this Domain</p>
              {selectedCats.size > 0 && (
                <button onClick={handleBulkRemoveCategories} disabled={isBulkRemoving} className="px-3 py-1.5 bg-red-100 text-red-600 rounded text-xs font-bold flex items-center gap-1 transition-colors hover:bg-red-200">
                  {isBulkRemoving ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />} Remove Selected ({selectedCats.size})
                </button>
              )}
            </div>
            {validAssignedCategories.length === 0 ? <div className="text-center py-10 bg-white border border-gray-200 rounded-xl"><p className="text-gray-500 text-sm">No categories assigned</p></div> :
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {validAssignedCategories.map(c => (
                  <div key={c.id} className="flex flex-col p-4 bg-white border border-gray-200 rounded-xl relative">
                    <div className="absolute top-4 left-4 z-10">
                      <div onClick={() => setSelectedCats(prev => { const next = new Set(prev); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next; })} className="cursor-pointer text-gray-400 hover:text-blue-500">
                        {selectedCats.has(c.id) ? <CheckSquare className="text-blue-500" size={18} /> : <Square size={18} />}
                      </div>
                    </div>
                    <div className="flex justify-between items-start mb-2 pl-7 gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-900 min-w-0 flex-1"><Tag className="h-4 w-4 text-purple-400 shrink-0" /> <span title={c.faq_title} className="truncate">{c.faq_title}</span></div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); selectNode('category', c.id, c, 'edit'); }} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors" title="Edit Category">
                          <Edit3 size={16} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeCategory(c.id); }} disabled={removingId === c.id} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50" title="Remove Category">
                          {removingId === c.id ? <RefreshCw size={16} className="animate-spin text-red-500" /> : <Trash2 size={16} className={removingId === c.id ? "" : "hover:text-red-500"} />}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200 ml-7">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${c.status === 'active' ? 'bg-emerald-100 text-emerald-400' : 'bg-gray-50 text-gray-500'}`}>{c.status}</span>
                      <span className="text-[10px] text-gray-500 font-bold bg-gray-50 px-2 py-1 rounded">{(c.questions || []).length} FAQs</span>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>
        )}
        {activeTab === 'create' && (
          <div className="max-w-4xl m-6 bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Category</h3>
            <CategoryForm formData={createCategoryData} setFormData={setCreateCategoryData} onSubmit={handleCreateCategory} saving={creating} onCancel={() => setActiveTab('assignments')} submitText="Create Category" />
          </div>
        )}
        {activeTab === 'edit' && (
          <div className="max-w-4xl m-6 bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Domain Settings & Widget Style</h3>
            <DomainForm formData={editFormData} setFormData={setEditFormData} onSubmit={handleEditSubmit} saving={editing} onCancel={() => {setEditFormData({ name: domain?.name||'', url: domain?.domain_url||'', welcome_message: domain?.welcome_message||'', fallback_message: domain?.fallback_message||'', helpline_number: domain?.helpline_number||'', widget_title: domain?.widget_title||'', widget_color: domain?.widget_color||'#7C3AED', bot_avatar: domain?.bot_avatar||'', is_active: domain?.is_active??true }); setActiveTab('assignments');}} submitText="Save Changes" />
          </div>
        )}
        {activeTab === 'embed' && (
          <div className="max-w-4xl m-6"><EmbedCodeTab domain={domain} /></div>
        )}
      </div>
    </div>
  );
}



function CategoryManager({ deletingId, category, categories, setCategories, openModal, selectNode, handleDeleteNode, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'assignments');
  const qs = category.questions || [];
  const { showToast } = useToast();
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  // State for Edit Category
  const [editFormData, setEditFormData] = useState({ faq_title: category?.faq_title||'', status: category?.status||'active' });
  const [editing, setEditing] = useState(false);
  
  // State for Create Question
  const [createQuestionData, setCreateQuestionData] = useState({ question: '', answer: '', aliases: '', status: 'active' });
  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    setEditFormData({ faq_title: category?.faq_title||'', status: category?.status||'active' });
  }, [category]);
  
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, category.id]);
  
  const tabs = [
    { id: 'assignments', label: `FAQs (${qs.length})`, icon: MessageCircle },
    { id: 'create', label: 'Create FAQ', icon: Plus }
  ];

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (categories.some(c => c.id !== category.id && c.faq_title.toLowerCase() === editFormData.faq_title.trim().toLowerCase())) {
      showToast('Category name already exists', 'error');
      return;
    }
    setEditing(true);
    try {
      await api.put(`/faq-categories/${category.id}`, editFormData);
      const updatedCategory = { ...category, ...editFormData };
      setCategories(prev => prev.map(c => c.id === category.id ? updatedCategory : c));
      showToast('Category updated', 'success');
      selectNode('category', category.id, updatedCategory);
    } catch (e) { const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error updating category'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Error updating category', 'error');} finally { setEditing(false); }
  };

  const handleCreateQuestion = async (e) => {
    e.preventDefault();
    const duplicate = category?.questions?.some(q => q.question.toLowerCase() === createQuestionData.question.trim().toLowerCase() && q.answer.toLowerCase() === createQuestionData.answer.trim().toLowerCase());
    if (duplicate) {
      setFormErrors({ question: 'This question and answer already exist in this category' });
      showToast('This question and answer already exist in this category', 'error');
      return;
    }
    setCreating(true);
    setFormErrors({});
    try {
      const payload = { 
        ...createQuestionData, 
        faq_id: category.id,
        aliases: createQuestionData.aliases ? createQuestionData.aliases.split(',').map(a => a.trim()).filter(a => a) : []
      };
      const res = await api.post('/faq-questions', payload);
      const newQ = res.data.question || res.data;
      setCategories(prev => prev.map(c => c.id === category.id ? { ...c, questions: [newQ, ...(c.questions || [])], questionsLoaded: true } : c));
      showToast('Question created', 'success');
      setCreateQuestionData({ question: '', answer: '', aliases: '', status: 'active' });
      setActiveTab('assignments');
    } catch (e) {
      const errData = e.response?.data;
      const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error creating question';
      showToast(typeof errorMsg === 'string' ? errorMsg : 'Error creating question', 'error');
      if (errData?.field) setFormErrors({ [errData.field]: errorMsg });
    } finally { setCreating(false); }
  };

  const handleBulkDeleteQuestions = async () => {
    if (selectedQuestions.size === 0) return;
    const confirm = await confirmAction({ title: 'Bulk Delete FAQs', text: `Are you sure you want to delete ${selectedQuestions.size} FAQ(s)? This action cannot be undone.`, confirmButtonText: 'Yes, Delete' });
    if (!confirm) return;
    
    setIsBulkDeleting(true);
    try {
      const res = await api.post('/faq-questions/bulk-delete', { ids: Array.from(selectedQuestions) });
      const newQs = qs.filter(q => !selectedQuestions.has(q.id));
      setCategories(prev => prev.map(c => c.id === category.id ? { ...c, questions: newQs } : c));
      setSelectedQuestions(new Set());
      if (res.data?.details && res.data.details.failed && res.data.details.failed.length > 0) {
        if (res.data.details.success && res.data.details.success.length > 0) {
          showToast(res.data.message, 'warning');
        } else {
          showToast(res.data.details.failed[0].error || res.data.message || 'Failed to delete FAQs', 'error');
        }
      } else {
        showToast(res.data?.message || 'FAQs deleted successfully', 'success');
      }
    } catch (e) {
      showToast(e.response?.data?.detail || e.response?.data?.message || 'Error deleting FAQs', 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="p-4 md:p-6 border-b border-gray-200 flex flex-col xl:flex-row justify-between items-start shrink-0 gap-4">
        <div className="w-full xl:w-auto overflow-hidden">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">Category</span>
            <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${category.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-100 text-gray-700'}`}>{category.status}</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{category.faq_title}</h2>
        </div>
        <div className="flex flex-wrap gap-2 w-full xl:w-auto">
          <button onClick={() => setActiveTab('create')} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium flex items-center gap-1 shadow-sm transition-colors"><Plus size={16}/> Create FAQ</button>
          <button onClick={() => setActiveTab('edit')} className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded text-sm font-medium flex items-center gap-1 shadow-sm transition-colors"><Edit3 size={16}/> Edit Category</button>
          <div className="w-px h-8 bg-gray-50 mx-1 mt-1"></div>
          <button onClick={() => handleDeleteNode('category', category.id)} disabled={deletingId === category.id} className="p-2 mt-1 bg-gray-50 hover:bg-red-500/20 rounded text-gray-700 hover:text-gray-500 transition-colors disabled:opacity-50" title="Delete Category">{deletingId === category.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Trash2 size={16}/>}</button>
        </div>
      </div>
      
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      
      <div className="flex-1 overflow-y-auto">

        
        {activeTab === 'assignments' && (
          <div className="max-w-4xl space-y-4 m-6">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-gray-500">FAQs belonging to this category</p>
              {selectedQuestions.size > 0 && (
                <button 
                  onClick={handleBulkDeleteQuestions}
                  disabled={isBulkDeleting}
                  className="px-3 py-1.5 bg-red-100 text-red-600 rounded text-xs font-bold flex items-center gap-1 transition-colors hover:bg-red-200"
                >
                  {isBulkDeleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete Selected ({selectedQuestions.size})
                </button>
              )}
            </div>
            {!category.questionsLoaded ? <div className="text-sm text-gray-500 p-5 bg-white rounded-xl border border-gray-200">Expand this category in the tree view to load its FAQs.</div> : 
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {qs.length === 0 ? <p className="text-sm text-gray-500 italic col-span-2 p-4 text-center bg-white rounded-xl border border-gray-200">No questions found.</p> : 
                  qs.map(q => (
                    <div key={q.id} className="p-4 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-amber-500/50 transition-colors group relative" onClick={() => selectNode('question', q.id, q)}>
                      <div className="absolute top-4 left-4 z-10">
                        <div 
                          onClick={(e) => { e.stopPropagation(); setSelectedQuestions(prev => { const next = new Set(prev); if (next.has(q.id)) next.delete(q.id); else next.add(q.id); return next; }); }}
                          className="cursor-pointer text-gray-400 hover:text-amber-500 transition-colors"
                        >
                          {selectedQuestions.has(q.id) ? <CheckSquare className="text-amber-500" size={18} /> : <Square size={18} />}
                        </div>
                      </div>
                      <div className="flex justify-between items-start mb-2 pl-7 gap-2">
                        <p className="text-sm font-bold text-gray-900 group-hover:text-amber-400 transition-colors min-w-0 flex-1 line-clamp-2">{q.question}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); selectNode('question', q.id, q, 'edit'); }} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors" title="Edit FAQ">
                            <Edit3 size={16} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteNode('question', q.id); }} disabled={deletingId === q.id} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50" title="Delete FAQ">
                            {deletingId === q.id ? <RefreshCw size={16} className="animate-spin text-red-500" /> : <Trash2 size={16} className={deletingId === q.id ? "" : "hover:text-red-500"} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-3 pl-7">{q.answer}</p>
                      <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center text-[10px] ml-7">
                        <span className={`px-2 py-0.5 rounded font-bold uppercase ${q.status === 'active' ? 'text-emerald-400 bg-emerald-100' : 'text-gray-500 bg-red-100'}`}>{q.status}</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            }
          </div>
        )}
        
        {activeTab === 'create' && (
          <div className="max-w-4xl m-6 bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create New FAQ Question</h3>
            <form onSubmit={handleCreateQuestion} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Question Title</label>
                <input required type="text" maxLength={1000} value={createQuestionData.question} onChange={e => {setCreateQuestionData({ ...createQuestionData, question: e.target.value }); setFormErrors({});}} className={`w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm focus:outline-none text-gray-700 ${formErrors.question ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-amber-500'}`} />
                {formErrors.question && <p className="text-red-500 text-xs mt-1">{formErrors.question}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Answer Content</label>
                <textarea required maxLength={10000} value={createQuestionData.answer} onChange={e => {setCreateQuestionData({ ...createQuestionData, answer: e.target.value }); setFormErrors({});}} rows={4} className={`w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm focus:outline-none text-gray-700 ${formErrors.answer ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-amber-500'}`} />
                {formErrors.answer && <p className="text-red-500 text-xs mt-1">{formErrors.answer}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Aliases (Optional, Comma-separated)</label>
                <input type="text" value={createQuestionData.aliases} onChange={e => setCreateQuestionData({ ...createQuestionData, aliases: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-amber-500 text-gray-700" placeholder="e.g. mng, meet & greet" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label><select value={createQuestionData.status} onChange={e => setCreateQuestionData({ ...createQuestionData, status: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-amber-500 text-gray-700"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              </div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setActiveTab('assignments')} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900">Cancel</button><button type="submit" disabled={creating} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm">{creating ? 'Saving...' : 'Create Question'}</button></div>
            </form>
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="max-w-4xl m-6 bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Category Settings</h3>
            <CategoryForm formData={editFormData} setFormData={setEditFormData} onSubmit={handleEditSubmit} saving={editing} onCancel={() => {setEditFormData({ faq_title: category?.faq_title||'', status: category?.status||'active' }); setActiveTab('assignments');}} submitText="Save Changes" />
          </div>
        )}
        

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QUESTION MANAGER (INLINE LIVE EDITOR)
// ---------------------------------------------------------------------------
function QuestionManager({ deletingId, question, customTimeStamp, categories, setCategories, selectNode, handleDeleteNode }) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('edit');
  
  // Editor State
  const [formData, setFormData] = useState({ 
    question: question.question || '', 
    answer: question.answer || '', 
    aliases: (question.aliases || []).join(', '),
    status: question.status || 'active'
  });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  
  const tabs = [
    { id: 'edit', label: 'Edit FAQ', icon: Edit3 },
  ];

  // Sync state if node changes
  useEffect(() => {
    setFormData({
      question: question.question || '', 
      answer: question.answer || '', 
      aliases: (question.aliases || []).join(', '),
      status: question.status || 'active'
    });
  }, [question.id, question.question, question.answer, question.status, question.aliases]); // only watch essential data

  const handleSave = async (e) => {
    e.preventDefault();
    const parentCategory = categories?.find(c => c.id === question.faq_id) || categories?.find(c => c.questions?.some(q => q.id === question.id));
    if (parentCategory) {
      const duplicate = parentCategory.questions?.some(q => 
        q.id !== question.id && 
        q.question.toLowerCase() === formData.question.trim().toLowerCase() && 
        q.answer.toLowerCase() === formData.answer.trim().toLowerCase()
      );
      if (duplicate) {
        setFormErrors({ question: 'This question and answer already exist in this category' });
        showToast('This question and answer already exist in this category', 'error');
        return;
      }
    }
    setSaving(true);
    setFormErrors({});
    try {
      const payload = {
        ...formData,
        aliases: formData.aliases ? formData.aliases.split(',').map(a => a.trim()).filter(a => a) : []
      };
      await api.put(`/faq-questions/${question.id}`, payload);
      const updatedQuestion = { ...question, ...payload };
      
      setCategories(prev => prev.map(c => ({ 
        ...c, 
        questions: c.questions?.map(q => q.id === question.id ? updatedQuestion : q) 
      })));
      
      selectNode('question', question.id, updatedQuestion);
      showToast('FAQ updated & vector re-indexed', 'success');
    } catch (e) {
      const errData = e.response?.data;
      const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error updating FAQ';
      showToast(typeof errorMsg === 'string' ? errorMsg : 'Error updating FAQ', 'error');
      if (errData?.field) setFormErrors({ [errData.field]: errorMsg });
    } finally { 
      setSaving(false); 
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="p-4 md:p-6 border-b border-gray-200 flex flex-col xl:flex-row justify-between items-start shrink-0 gap-4">
        <div className="w-full xl:w-auto overflow-hidden">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">FAQ Question</span>
            <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-bold ${question.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-100 text-red-600'}`}>{question.status}</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 truncate" title={question.question}>{question.question}</h2>
        </div>
        <div className="flex flex-wrap gap-2 w-full xl:w-auto">
          <button onClick={() => setActiveTab('edit')} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium flex items-center gap-1 shadow-sm transition-colors"><Edit3 size={16}/> Edit FAQ</button>
          <div className="w-px h-8 bg-gray-50 mx-1 mt-1"></div>
          <button onClick={() => handleDeleteNode('question', question.id)} disabled={deletingId === question.id} className="p-2 mt-1 bg-gray-50 hover:bg-red-500/20 rounded text-gray-700 hover:text-gray-500 transition-colors disabled:opacity-50" title="Delete FAQ">{deletingId === question.id ? <RefreshCw className="animate-spin h-4 w-4" /> : <Trash2 size={16}/>}</button>
        </div>
      </div>
      
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      
      <div className="flex-1 overflow-y-auto">


        {activeTab === 'edit' && (
          <form onSubmit={handleSave} className="max-w-4xl space-y-5 m-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5 shadow-lg">
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">Question Title</label>
                <input required type="text" maxLength={1000} value={formData.question} onChange={e => {setFormData({ ...formData, question: e.target.value }); setFormErrors({});}} className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm focus:outline-none font-medium text-gray-900 transition-colors ${formErrors.question ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-amber-500'}`} />
                {formErrors.question && <p className="text-red-500 text-xs mt-1">{formErrors.question}</p>}
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">Detailed Answer</label>
                <textarea required maxLength={10000} value={formData.answer} onChange={e => {setFormData({ ...formData, answer: e.target.value }); setFormErrors({});}} rows={6} className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm focus:outline-none text-gray-800 transition-colors leading-relaxed ${formErrors.answer ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-amber-500'}`} />
                {formErrors.answer && <p className="text-red-500 text-xs mt-1">{formErrors.answer}</p>}
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2">Aliases (Optional, Comma-separated)</label>
                <input type="text" value={formData.aliases} onChange={e => setFormData({ ...formData, aliases: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 text-gray-900 transition-colors" placeholder="e.g. mng, meet & greet" />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-gray-500 mb-2">Status</label>
                  <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 text-gray-700">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Created: {formatDate(question.created_at || Date.now(), customTimeStamp)}</span>
                <span>•</span>
                <span>Updated: {formatDate(question.updated_at || Date.now(), customTimeStamp)}</span>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setFormData({ question: question.question || '', answer: question.answer || '', aliases: (question.aliases || []).join(', '), status: question.status || 'active' })} className="px-5 py-2.5 text-sm text-gray-700 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={saving} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-600/20 transition-all flex items-center gap-2">
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CREATE & EDIT MODALS
// ---------------------------------------------------------------------------

function CreateDomainModal({ isOpen, onClose, setDomains, selectNode }) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({ name: '', url: '', welcome_message: 'Welcome to Acme Support.', fallback_message: 'Sorry, we could not find an answer. Please contact support.', helpline_number: '', widget_title: 'Support Assistant', widget_color: '#7C3AED', bot_avatar: '/static/chatbot-logo.png', is_active: true });
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.url.trim()) return showToast('Name and URL are required', 'error');
    setSaving(true);
    try {
      const res = await api.post(`/domains`, { ...formData, domain_url: formData.url.trim() });
      setDomains(prev => [...prev, res.data]);
      showToast('Domain created successfully', 'success');
      selectNode('domain', res.data.id, res.data);
      onClose();
    } catch (e) { const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error creating domain'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Error creating domain', 'error');} finally { setSaving(false); }
  };
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Create New Domain" icon={Globe} iconColor="text-blue-400">
      <DomainForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} saving={saving} onCancel={onClose} submitText="Create Domain" />
    </ModalWrapper>
  );
}

function EditDomainModal({ isOpen, onClose, domain, setDomains, selectNode }) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({ name: domain?.name||'', url: domain?.domain_url||'', welcome_message: domain?.welcome_message||'', fallback_message: domain?.fallback_message||'', helpline_number: domain?.helpline_number||'', widget_title: domain?.widget_title||'', widget_color: domain?.widget_color||'#7C3AED', bot_avatar: domain?.bot_avatar||'', is_active: domain?.is_active??true });
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put(`/domains/${domain.id}`, { ...formData, domain_url: formData.url.trim() });
      setDomains(prev => prev.map(d => d.id === domain.id ? res.data : d));
      showToast('Domain updated', 'success');
      selectNode('domain', res.data.id, res.data);
      onClose();
    } catch (e) { const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error updating domain'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Error updating domain', 'error');} finally { setSaving(false); }
  };
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Edit Domain" icon={Globe} iconColor="text-blue-400">
      <DomainForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} saving={saving} onCancel={onClose} submitText="Save Changes" />
    </ModalWrapper>
  );
}

function DomainForm({ formData, setFormData, onSubmit, saving, onCancel, submitText }) {
  let baseUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (baseUrl) {
    baseUrl = baseUrl.replace(/\/api\/?$/, '');
  } else {
    baseUrl = 'http://localhost:8000';
  }
  const { showToast } = useToast();
  const [logoSource, setLogoSource] = useState(formData.bot_avatar === '/static/chatbot-logo.png' || !formData.bot_avatar ? 'default' : 'custom');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoSourceChange = (type) => {
    setLogoSource(type);
    if (type === 'default') {
      setFormData(prev => ({ ...prev, bot_avatar: '/static/chatbot-logo.png' }));
    } else {
      setFormData(prev => ({ ...prev, bot_avatar: '' }));
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadData = new FormData();
    uploadData.append('file', file);

    setUploadingLogo(true);
    try {
      const data = await domainService.uploadLogo(uploadData);
      setFormData(prev => ({ ...prev, bot_avatar: data.url }));
      showToast('Logo uploaded successfully', 'success');
    } catch (err) {
      console.error('Failed to upload logo', err);
      showToast(err.response?.data?.detail || 'Failed to upload logo', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Domain Name</label><input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="Acme Corp" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Domain URL</label><input required type="text" value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="acme.com" /><p className="text-xs text-gray-500 mt-1">Enter domain only. Example: example.com</p></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Widget Title</label><input required type="text" value={formData.widget_title} onChange={e => setFormData({ ...formData, widget_title: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="Support Assistant" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Widget Color</label><div className="flex gap-2"><input type="color" value={formData.widget_color} onChange={e => setFormData({ ...formData, widget_color: e.target.value })} className="w-10 h-9 rounded border-0 bg-transparent cursor-pointer p-0" /><input type="text" value={formData.widget_color} onChange={e => setFormData({ ...formData, widget_color: e.target.value })} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" /></div></div>
      </div>
      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Welcome Message</label><input required type="text" value={formData.welcome_message} onChange={e => setFormData({ ...formData, welcome_message: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="Welcome to Acme Support." /></div>
      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Fallback Message</label><textarea required rows={2} value={formData.fallback_message} onChange={e => setFormData({ ...formData, fallback_message: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 resize-none" placeholder="Sorry, we could not find an answer. Please contact support." /></div>
      
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Helpline Number</label>
            <input type="text" value={formData.helpline_number} onChange={e => setFormData({ ...formData, helpline_number: e.target.value })} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="+44 XXXXXXXX" />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo Style Option</label>
            <div className="flex rounded-xl bg-white p-1 border border-gray-200 w-fit">
              <button
                type="button"
                onClick={() => handleLogoSourceChange('default')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${logoSource === 'default' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Use Default Logo
              </button>
              <button
                type="button"
                onClick={() => handleLogoSourceChange('custom')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${logoSource === 'custom' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
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
                    value={formData.bot_avatar} 
                    onChange={e => setFormData({...formData, bot_avatar: e.target.value})} 
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 text-xs focus:border-blue-500 focus:outline-none" 
                    placeholder="https://example.com/avatar.png" 
                  />
                </div>
                <div className="relative shrink-0">
                  <input
                    type="file"
                    id="logo-upload-input"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="logo-upload-input"
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-900 rounded-xl text-xs font-semibold border border-gray-200 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    {uploadingLogo ? 'Uploading...' : 'Upload Image'}
                  </label>
                </div>
              </div>

              {formData.bot_avatar && (
                <div className="flex items-center gap-3">
                  <img src={formData.bot_avatar.startsWith('http') || formData.bot_avatar.startsWith('/static') || formData.bot_avatar.startsWith('/chatbot-logo') ? formData.bot_avatar : baseUrl + formData.bot_avatar} alt="Bot Avatar Preview" className="w-10 h-10 rounded-full border border-gray-200 object-cover bg-white" />
                  <span className="text-xs text-gray-500 font-mono truncate max-w-xs">{formData.bot_avatar}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-4"><input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} className="rounded bg-gray-50" /><label className="text-sm font-medium text-gray-700">Domain is Active</label></div>
      <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900">Cancel</button><button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm">{saving ? 'Saving...' : submitText}</button></div>
    </form>
  );
}


function CreateCategoryModal({ isOpen, onClose, parentId, domains, categories, setCategories, domainCategoryMap, setDomainCategoryMap, selectNode }) {
  const { showToast } = useToast();
  const parentDomain = domains?.find(d => d.id === parentId);
  const [formData, setFormData] = useState({ faq_title: '', status: 'active' });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (categories && categories.some(c => c.faq_title.toLowerCase() === formData.faq_title.trim().toLowerCase())) {
      setFormErrors({ faq_title: 'Category name already exists' });
      showToast('Category name already exists', 'error');
      return;
    }
    setSaving(true);
    setFormErrors({});
    try {
      const res = await api.post('/faq-categories', { ...formData });
      const newCat = res.data.category || res.data;
      setCategories(prev => [...prev, newCat]);
      if (parentId) {
        const newCats = [...(domainCategoryMap[parentId] || []), newCat.id];
        await api.put(`/domains/${parentId}/categories`, { category_ids: newCats });
        setDomainCategoryMap(prev => ({ ...prev, [parentId]: newCats }));
      }
      showToast('Category created', 'success');
      selectNode('category', newCat.id, newCat);
      onClose();
    } catch (e) {
      const errData = e.response?.data;
      const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error creating category';
      showToast(typeof errorMsg === 'string' ? errorMsg : 'Error creating category', 'error');
      if (errData?.field) setFormErrors({ [errData.field]: errorMsg });
    } finally { setSaving(false); }
  };
  
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Create Category" icon={Tag} iconColor="text-purple-400">
      {parentDomain && <p className="text-sm text-purple-400 mb-4 p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">Auto-assigning this category to Domain: <strong>{parentDomain.name || parentDomain.domain_url}</strong></p>}
      <CategoryForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} saving={saving} onCancel={onClose} submitText="Create Category" formErrors={formErrors} setFormErrors={setFormErrors} />
    </ModalWrapper>
  );
}

function EditCategoryModal({ isOpen, onClose, category, categories, setCategories, selectNode }) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({ faq_title: category?.faq_title||'', status: category?.status||'active' });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (categories && categories.some(c => c.id !== category.id && c.faq_title.toLowerCase() === formData.faq_title.trim().toLowerCase())) {
      setFormErrors({ faq_title: 'Category name already exists' });
      showToast('Category name already exists', 'error');
      return;
    }
    setSaving(true);
    setFormErrors({});
    try {
      await api.put(`/faq-categories/${category.id}`, { ...formData });
      const updatedCategory = { ...category, ...formData };
      setCategories(prev => prev.map(c => c.id === category.id ? updatedCategory : c));
      showToast('Category updated', 'success');
      selectNode('category', category.id, updatedCategory);
      onClose();
    } catch (e) {
      const errData = e.response?.data;
      const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error updating category';
      showToast(typeof errorMsg === 'string' ? errorMsg : 'Error updating category', 'error');
      if (errData?.field) setFormErrors({ [errData.field]: errorMsg });
    } finally { setSaving(false); }
  };
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Edit Category" icon={Tag} iconColor="text-purple-400">
      <CategoryForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} saving={saving} onCancel={onClose} submitText="Save Changes" formErrors={formErrors} setFormErrors={setFormErrors} />
    </ModalWrapper>
  );
}

function CategoryForm({ formData, setFormData, onSubmit, saving, onCancel, submitText, formErrors={}, setFormErrors=()=>{} }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Category Title</label>
        <input required type="text" maxLength={200} value={formData.faq_title} onChange={e => {setFormData({ ...formData, faq_title: e.target.value }); setFormErrors({});}} className={`w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm focus:outline-none ${formErrors.faq_title ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-purple-500'}`} />
        {formErrors.faq_title && <p className="text-red-500 text-xs mt-1">{formErrors.faq_title}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      </div>
      <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900">Cancel</button><button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm">{saving ? 'Saving...' : submitText}</button></div>
    </form>
  );
}

function CreateQuestionModal({ isOpen, onClose, parentId, categories, setCategories, selectNode }) {
  const { showToast } = useToast();
  const parentCategory = categories.find(c => c.id === parentId);
  const [formData, setFormData] = useState({ question: '', answer: '', status: 'active' });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (parentCategory) {
      const duplicate = parentCategory.questions?.some(q => 
        q.question.toLowerCase() === formData.question.trim().toLowerCase() && 
        q.answer.toLowerCase() === formData.answer.trim().toLowerCase()
      );
      if (duplicate) {
        setFormErrors({ question: 'This question and answer already exist in this category' });
        showToast('This question and answer already exist in this category', 'error');
        return;
      }
    }
    setSaving(true);
    setFormErrors({});
    try {
      const res = await api.post('/faq-questions', { ...formData, faq_id: parentId });
      const newQ = res.data.question || res.data;
      setCategories(prev => prev.map(c => c.id === parentId ? { ...c, questions: [newQ, ...(c.questions || [])], questionsLoaded: true } : c));
      showToast('Question created and vector indexing triggered', 'success');
      selectNode('question', newQ.id, newQ);
      onClose();
    } catch (e) {
      const errData = e.response?.data;
      const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error creating question';
      showToast(typeof errorMsg === 'string' ? errorMsg : 'Error creating question', 'error');
      if (errData?.field) setFormErrors({ [errData.field]: errorMsg });
    } finally { setSaving(false); }
  };
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Create FAQ Question" icon={MessageCircle} iconColor="text-amber-400">
      {parentCategory && <p className="text-sm text-amber-400 mb-4 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">Auto-assigning this FAQ to Category: <strong>{parentCategory.faq_title}</strong></p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Question Title</label>
          <input required type="text" maxLength={1000} value={formData.question} onChange={e => {setFormData({ ...formData, question: e.target.value }); setFormErrors({});}} className={`w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm focus:outline-none ${formErrors.question ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-amber-500'}`} />
          {formErrors.question && <p className="text-red-500 text-xs mt-1">{formErrors.question}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Answer Content</label>
          <textarea required maxLength={10000} value={formData.answer} onChange={e => {setFormData({ ...formData, answer: e.target.value }); setFormErrors({});}} rows={4} className={`w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm focus:outline-none ${formErrors.answer ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-amber-500'}`} />
          {formErrors.answer && <p className="text-red-500 text-xs mt-1">{formErrors.answer}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-amber-500"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        </div>
        <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={onClose} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900">Cancel</button><button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm">{saving ? 'Saving...' : 'Create Question'}</button></div>
      </form>
    </ModalWrapper>
  );
}

function AssignExistingModal({ isOpen, onClose, type, allItems, assignedIds, onSave }) {
  const validAssignedIds = (assignedIds || []).map(String).filter(id => allItems.some(item => String(item.id) === id));
  const [selected, setSelected] = useState(new Set(validAssignedIds));
  const [saving, setSaving] = useState(false);
  
  useEffect(() => { 
    if (isOpen) {
      setSelected(new Set((assignedIds || []).map(String).filter(id => allItems.some(item => String(item.id) === id))));
    }
  }, [assignedIds, isOpen, allItems]);
  const toggle = (id) => { const strId = String(id); const s = new Set(selected); if(s.has(strId)) s.delete(strId); else s.add(strId); setSelected(s); };
  
  const handleSave = async () => {
    setSaving(true);
    try {
      const originalIdsToSave = allItems.filter(item => selected.has(String(item.id))).map(item => item.id);
      await onSave(originalIdsToSave);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={`Assign Existing ${type}s`} icon={Link} iconColor="text-blue-400">
      <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
        {[...allItems].sort((a, b) => {
          const aSel = selected.has(String(a.id));
          const bSel = selected.has(String(b.id));
          if (aSel && !bSel) return -1;
          if (!aSel && bSel) return 1;
          return 0;
        }).map(item => {
          const isSel = selected.has(String(item.id));
          const name = item.group_title || item.faq_title || item.name;
          return (
            <div key={item.id} onClick={() => toggle(item.id)} className={`flex items-center p-3 rounded-xl border cursor-pointer transition-colors ${isSel ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
              <div className={`w-5 h-5 rounded mr-3 flex items-center justify-center transition-colors ${isSel ? 'bg-blue-600' : 'border border-gray-300'}`}>{isSel && <CheckCircle2 className="h-4 w-4 text-white"/>}</div>
              <span className={`text-sm font-medium ${isSel ? 'text-blue-700' : 'text-gray-700'}`}>{name}</span>
            </div>
          );
        })}
        {allItems.length === 0 && <p className="text-sm text-gray-500 text-center py-6">No {type}s available in the system.</p>}
      </div>
      <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-200">
        <span className="text-sm text-gray-500">{selected.size} selected</span>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20">{saving ? 'Saving...' : 'Save Assignments'}</button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// ---------------------------------------------------------------------------
// BULK UPLOAD MODAL
// ---------------------------------------------------------------------------
function BulkUploadModal({ isOpen, onClose, loadInitialData }) {
  const { showToast } = useToast();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDownloadSample = () => {
    const ws = XLSX.utils.json_to_sheet([{ Domain: "example.com", Category: "Refunds", Question: "How do I get a refund?", Answer: "Please contact support." }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FAQ_Template");
    XLSX.writeFile(wb, "FAQ_Bulk_Upload_Sample.xlsx");
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setResults(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);

      if (json.length === 0) {
        showToast('File is empty', 'error');
        setLoading(false);
        return;
      }

      const seen = new Set();
      const uniqueRows = [];
      for (const row of json) {
        const category = (row.Category || 'General').toString().trim();
        const question = (row.Question || '').toString().trim();
        const answer = (row.Answer || '').toString().trim();
        
        if (!question || !answer) continue;

        const key = `${category}|${question}|${answer}`.toLowerCase();
        
        if (!seen.has(key)) {
          seen.add(key);
          uniqueRows.push(row);
        }
      }

      if (uniqueRows.length < json.length) {
        showToast(`${json.length - uniqueRows.length} duplicate or invalid rows skipped.`, 'warning');
      }

      let rowsToProcess = uniqueRows;
      if (uniqueRows.length > 250) {
        showToast('Only first 250 rows are allowed. Remaining rows will be skipped.', 'info');
        rowsToProcess = uniqueRows.slice(0, 250);
      }

      const res = await api.post('/faq-hierarchy/bulk', rowsToProcess);
      setResults(res.data);
      if (res.data.success_count > 0) {
        showToast(`Successfully uploaded ${res.data.success_count} rows`, 'success');
        loadInitialData(); // Refresh the hierarchy tree
      }
    } catch (err) {
      console.error(err);
      showToast('Error uploading file', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Bulk Upload FAQs" icon={UploadCloud} iconColor="text-teal-400">
      <div className="space-y-6">
        {!results ? (
          <>
            <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Instructions</h3>
              <p className="text-sm text-gray-500 mb-3">Upload a CSV or Excel file to bulk import your FAQ hierarchy. The required columns are: <strong>Domain, Category, Question, Answer</strong>. Domain must be present. Unprovided optional columns will default to "General". <span className="text-amber-400 font-bold block mt-1">Maximum 250 rows only allowed. Remaining rows will be skipped.</span></p>
              <button onClick={handleDownloadSample} className="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1 font-medium transition-colors"><Download size={16}/> Download Sample Template</button>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select File (.csv, .xls, .xlsx)</label>
              <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-teal-500/10 file:text-teal-400 hover:file:bg-teal-500/20 transition-colors" />
            </div>

            <div className="flex justify-end pt-4">
              <button onClick={onClose} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900 mr-3">Cancel</button>
              <button onClick={handleUpload} disabled={!file || loading} className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-gray-900 rounded-xl text-sm font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2">
                {loading ? <RefreshCw className="h-4 w-4 animate-spin"/> : <UploadCloud className="h-4 w-4"/>}
                {loading ? 'Processing...' : 'Upload Data'}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white border border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Upload Summary</h3>
                <p className="text-sm text-gray-500">Processing complete</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-emerald-400">{results.success_count}</div>
                <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Rows Success</div>
              </div>
            </div>

            {results.errors && results.errors.length > 0 && (
              <div className="bg-red-100 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-500 mb-3 font-bold text-sm">
                  <ShieldAlert size={16}/> {results.errors.length} Rows Failed Validation
                </div>
                <div className="max-h-40 overflow-y-auto custom-scrollbar pr-2 space-y-1">
                  {results.errors.map((err, i) => (
                    <div key={i} className="text-xs text-red-300 bg-red-950/30 p-2 rounded border border-red-900/50">
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex justify-end pt-4">
              <button onClick={onClose} className="px-6 py-2 bg-gray-100 hover:bg-slate-600 text-gray-900 rounded-xl text-sm font-bold transition-colors">Close</button>
            </div>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
