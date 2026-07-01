import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { 
  ChevronRight, ChevronDown, Globe, Tag, MessageCircle, Search, 
  Plus, Trash2, Save, CheckCircle2, X, RefreshCw, Edit3, Check, UploadCloud, Download, Code, Folder, FileText, Minimize, Maximize, CheckSquare, Square
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { useToast } from '@/contexts/ToastContext';
import api from '@/utils/api';
import { confirmAction } from '@/utils/confirm';
import { domainService } from '@/services/domainService';
import ModalWrapper from '@/components/ui/ModalWrapper';
import { Tabs } from './Tree';
import { EditCategoryModal, CategoryForm } from './Modals';

export function CategoryManager({ deletingId, category, categories, setCategories, openModal, selectNode, handleDeleteNode, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'assignments');
  const qs = category.questions || [];
  const { showToast } = useToast();
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(category.active_question_count || qs.length);
  const [isLoadingFAQs, setIsLoadingFAQs] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // State for Edit Category
  const [editFormData, setEditFormData] = useState({ faq_title: category?.faq_title||'', status: category?.status||'active' });
  const [editing, setEditing] = useState(false);
  
  // State for Create Question
  const [createQuestionData, setCreateQuestionData] = useState({ question: '', answer: '', aliases: '', status: 'active' });
  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    setEditFormData({ faq_title: category?.faq_title||'', status: category?.status||'active' });
    setPage(1); // Reset page when category changes
  }, [category.id]);
  
  useEffect(() => {
    setActiveTab(initialTab || 'assignments');
  }, [initialTab, category.id]);

  useEffect(() => {
    const fetchFAQs = async () => {
      setIsLoadingFAQs(true);
      try {
        const res = await api.get(`/faq-questions?faq_id=${category.id}&page=${page}&page_size=10`);
        setCategories(prev => prev.map(c => c.id === category.id ? { ...c, questions: res.data.data, questionsLoaded: true } : c));
        if (res.data.pagination) {
          setTotalPages(res.data.pagination.total_pages);
          setTotalItems(res.data.pagination.total_items);
        }
      } catch (e) {
        console.error('Failed to load FAQs:', e);
      } finally {
        setIsLoadingFAQs(false);
      }
    };
    if (activeTab === 'assignments') {
      fetchFAQs();
    }
  }, [category.id, page, activeTab, setCategories, refreshTrigger]);
  
  const tabs = [
    { id: 'assignments', label: `FAQs (${totalItems})`, icon: MessageCircle },
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
      setCategories(prev => prev.map(c => c.id === category.id ? { 
        ...c, 
        questions: [newQ, ...(c.questions || []).filter(q => q.id !== newQ.id)],
        questionsLoaded: true,
        active_question_count: (c.active_question_count ?? 0) + (newQ.status === 'active' ? 1 : 0)
      } : c));
      showToast('Question created', 'success');
      setCreateQuestionData({ question: '', answer: '', aliases: '', status: 'active' });
      setActiveTab('assignments');
      setRefreshTrigger(prev => prev + 1); // trigger refresh
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
      const deletedIds = selectedQuestions;
      
      setCategories(prev => prev.map(c => {
        if (c.id === category.id) {
          const deletedActiveCount = (c.questions || []).filter(q => deletedIds.has(q.id) && q.status === 'active').length;
          return {
            ...c,
            questions: (c.questions || []).filter(q => !deletedIds.has(q.id)),
            active_question_count: Math.max(0, (c.active_question_count ?? 0) - deletedActiveCount)
          };
        }
        return c;
      }));
      setSelectedQuestions(new Set());
      if (res.data?.status === 'success') {
        showToast(res.data.message || `Deleted ${res.data.deleted_count} FAQs successfully`, 'success');
        setRefreshTrigger(prev => prev + 1);
      } else {
        showToast('Failed to delete FAQs', 'error');
      }
    } catch (e) {
      showToast(e.response?.data?.detail || e.response?.data?.message || 'Error deleting FAQs', 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-w-0">


      <div className="flex-1 overflow-y-auto">

        
        {activeTab === 'assignments' && (
          <div className="max-w-4xl space-y-4 m-6">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-gray-500">FAQs belonging to this category</p>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveTab('create')}
                  className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded text-xs font-bold flex items-center gap-1 transition-colors hover:bg-blue-100"
                >
                  <Plus size={14} />
                  Add FAQ
                </button>
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
            </div>
            {!category.questionsLoaded || isLoadingFAQs ? <div className="text-sm text-gray-500 p-5 bg-white rounded-xl border border-gray-200 flex items-center gap-2"><RefreshCw size={16} className="animate-spin text-gray-400" /> Loading FAQs...</div> : 
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
                          <button onClick={async (e) => { e.stopPropagation(); await handleDeleteNode('question', q.id); setRefreshTrigger(prev => prev + 1); }} disabled={deletingId === q.id} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50" title="Delete FAQ">
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
            {totalPages > 1 && !isLoadingFAQs && (
              <div className="mt-6 flex justify-between items-center bg-white p-3 border border-gray-200 rounded-xl">
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors text-gray-700 bg-white">Previous</button>
                  <span className="px-3 py-1.5 text-xs text-gray-600 font-medium bg-white">Page {page} of {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors text-gray-700 bg-white">Next</button>
                </div>
              </div>
            )}
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