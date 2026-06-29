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
import { EditCategoryModal } from './Modals';

export function CategoryManager({ deletingId, category, categories, setCategories, openModal, selectNode, handleDeleteNode, initialTab }) {
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