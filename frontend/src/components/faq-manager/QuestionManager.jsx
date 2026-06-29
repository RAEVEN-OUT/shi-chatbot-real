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
import { CreateQuestionModal, AssignExistingModal } from './Modals';

export function QuestionManager({ deletingId, question, customTimeStamp, categories, setCategories, selectNode, handleDeleteNode }) {
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