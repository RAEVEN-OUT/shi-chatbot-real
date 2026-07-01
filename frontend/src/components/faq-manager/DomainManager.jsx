import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { 
  ChevronRight, ChevronDown, Globe, Tag, MessageCircle, Search, 
  Plus, Trash2, Save, CheckCircle2, X, RefreshCw, Edit3, Check, UploadCloud, Download, Code, Folder, FileText, Minimize, Maximize, CheckSquare, Square, Minus
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { useToast } from '@/contexts/ToastContext';
import api from '@/utils/api';
import { confirmAction } from '@/utils/confirm';
import { domainService } from '@/services/domainService';
import ModalWrapper from '@/components/ui/ModalWrapper';
import { EditDomainModal } from './Modals';
import { Tabs } from './Tree';
import { CategoryManager } from './CategoryManager';
import { QuestionManager } from './QuestionManager';
import { DocumentManager } from './DocumentManager';
export function DomainManager({ deletingId, domain, domains, setDomains, categories, setCategories, domainCategoryMap, setDomainCategoryMap, documents, setDocuments, openModal, selectNode, handleDeleteNode, initialTab, scopedDomainId }) {
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
    setActiveTab(initialTab || 'assignments');
  }, [initialTab, domain.id]);

  const domainDocuments = documents.filter(doc => doc.domain_id === domain.id);

  const tabs = [
    { id: 'assignments', label: `Categories (${validAssignedCategories.length})`, icon: Tag },
    { id: 'documents', label: `Documents (${domainDocuments.length})`, icon: MessageCircle },
    { id: 'create', label: 'Create Category', icon: Plus },
    ...(scopedDomainId ? [] : [
      { id: 'edit', label: 'Settings & Widget Style', icon: Edit3 },
      { id: 'embed', label: 'Embed Code', icon: Code },
    ])
  ];

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


      <div className="flex-1 overflow-y-auto">
        {activeTab === 'assignments' && (
          <div className="max-w-4xl space-y-4 m-6">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-gray-500">FAQ Categories serving this Domain</p>
              <div className="flex items-center gap-2">
                <button onClick={() => openModal('bulk_upload_faq', null, domain)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold rounded flex items-center gap-1 transition-colors">
                  <UploadCloud size={14}/> Bulk Upload FAQs
                </button>
                {selectedCats.size > 0 && (
                  <button onClick={handleBulkRemoveCategories} disabled={isBulkRemoving} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded flex items-center gap-1 transition-colors disabled:opacity-50">
                    {isBulkRemoving ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />} Remove Selected
                  </button>
                )}
              </div>
            </div>
            {validAssignedCategories.length === 0 ? <div className="text-center py-10 bg-white border border-gray-200 rounded-xl"><p className="text-gray-500 text-sm">No categories assigned</p></div> :
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[...validAssignedCategories].sort((a, b) => {
                  const aSel = selectedCats.has(a.id) ? 1 : 0;
                  const bSel = selectedCats.has(b.id) ? 1 : 0;
                  if (aSel !== bSel) return bSel - aSel;
                  const aActive = a.status === 'active' ? 1 : 0;
                  const bActive = b.status === 'active' ? 1 : 0;
                  if (aActive !== bActive) return bActive - aActive;
                  return (a.faq_title || '').localeCompare(b.faq_title || '');
                }).map(c => (
                  <div key={c.id} onClick={() => selectNode('category', c.id, c)} className="flex flex-col p-4 bg-white border border-gray-200 rounded-xl relative hover:border-blue-500 transition-colors group shadow-sm cursor-pointer">
                    <div className="absolute top-4 left-4 z-10">
                      <div onClick={(e) => { e.stopPropagation(); setSelectedCats(prev => { const next = new Set(prev); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next; }); }} className="cursor-pointer text-gray-400 hover:text-blue-500">
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
                          {removingId === c.id ? <RefreshCw size={16} className="animate-spin text-red-500" /> : <Minus size={16} className={removingId === c.id ? "" : "hover:text-red-500"} />}
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
        {activeTab === 'documents' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Knowledge Base Documents</h3>
              <button onClick={() => openModal('bulk_upload_doc', null, domain)} className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-gray-900 font-bold text-sm rounded-xl flex items-center gap-2 shadow-sm">
                <UploadCloud size={16} /> Upload Document
              </button>
            </div>
            {domainDocuments.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <div className="mx-auto w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                  <MessageCircle className="h-6 w-6 text-gray-400" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-1">No documents yet</h3>
                <p className="text-sm text-gray-500 mb-4">Upload long texts, PDFs, or Word docs to use in RAG.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {domainDocuments.map(doc => (
                  <div key={doc.id} onClick={() => selectNode('document', doc.id, doc)} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-500 transition-colors group relative shadow-sm cursor-pointer">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-900 min-w-0 flex-1"><MessageCircle className="h-4 w-4 text-teal-500 shrink-0" /> <span title={doc.source_title} className="truncate">{doc.source_title}</span></div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          const conf = await confirmAction({ title: 'Delete Document', text: 'Delete this document and all its chunks? This cannot be undone.', confirmButtonText: 'Yes, Delete' });
                          if (!conf) return;
                          try {
                            await api.delete(`/documents/${doc.id}`);
                            setDocuments(prev => prev.filter(d => d.id !== doc.id));
                            showToast('Document deleted', 'success');
                          } catch (err) { showToast('Error deleting document', 'error'); }
                        }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete Document">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    {doc.error_message && (
                      <div className="text-xs text-red-500 mb-2 truncate" title={doc.error_message}>{doc.error_message}</div>
                    )}
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${doc.status === 'ready' ? 'bg-emerald-100 text-emerald-400' : doc.status === 'failed' ? 'bg-red-100 text-red-400' : 'bg-amber-100 text-amber-500'}`}>{doc.status}</span>
                      <span className="text-[10px] text-gray-500 font-bold bg-gray-50 px-2 py-1 rounded">{doc.chunk_count} Chunks</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

export function DetailsPanel({ deletingId, selectedNode, customTimeStamp, domains, setDomains, categories, setCategories, domainCategoryMap, setDomainCategoryMap, documents, setDocuments, openModal, selectNode, handleDeleteNode, scopedDomainId }) {
  const { type, data } = selectedNode;  
  let freshData = data;
  if(type === 'domain') freshData = domains.find(d => d.id === data.id) || data;
  if(type === 'folder') freshData = domains.find(d => d.id === data.domain_id) || data.domain;
  if(type === 'category') freshData = categories.find(c => c.id === data.id) || data;
  if(type === 'question') {
    const parentCat = categories.find(c => c.questions?.some(q => q.id === data.id));
    if(parentCat) freshData = parentCat.questions.find(q => q.id === data.id) || data;
  }
  
  if (type === 'domain') return <DomainManager deletingId={deletingId} domain={freshData} domains={domains} setDomains={setDomains} categories={categories} setCategories={setCategories} domainCategoryMap={domainCategoryMap} setDomainCategoryMap={setDomainCategoryMap} documents={documents} setDocuments={setDocuments} openModal={openModal} selectNode={selectNode} handleDeleteNode={handleDeleteNode} initialTab={selectedNode?.initialTab} scopedDomainId={scopedDomainId} />;
  if (type === 'folder') return <DomainManager deletingId={deletingId} domain={freshData} domains={domains} setDomains={setDomains} categories={categories} setCategories={setCategories} domainCategoryMap={domainCategoryMap} setDomainCategoryMap={setDomainCategoryMap} documents={documents} setDocuments={setDocuments} openModal={openModal} selectNode={selectNode} handleDeleteNode={handleDeleteNode} initialTab={data.folderType === 'document' ? 'documents' : 'assignments'} scopedDomainId={scopedDomainId} />;
  if (type === 'category') return <CategoryManager deletingId={deletingId} category={freshData} categories={categories} setCategories={setCategories} openModal={openModal} selectNode={selectNode} handleDeleteNode={handleDeleteNode} initialTab={selectedNode.initialTab} />;
  if (type === 'question') return <QuestionManager deletingId={deletingId} question={freshData} customTimeStamp={customTimeStamp} categories={categories} setCategories={setCategories} selectNode={selectNode} handleDeleteNode={handleDeleteNode} />;
  if (type === 'document') return <DocumentManager deletingId={deletingId} document={freshData} documents={documents} setDocuments={setDocuments} selectNode={selectNode} handleDeleteNode={handleDeleteNode} />;
  return null;
}