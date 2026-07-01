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


export function CreateDomainModal({ isOpen, onClose, setDomains, selectNode }) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({ name: '', url: '', welcome_message: 'Welcome,how may I help you?', fallback_message: 'Sorry, we could not find an answer. Please contact support.', helpline_number: '', widget_title: 'Support Assistant', widget_color: '#7C3AED', bot_avatar: '/static/chatbot-logo.png', is_active: true });
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
    } catch (e) { const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error creating domain'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Error creating domain', 'error'); } finally { setSaving(false); }
  };
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Create New Domain" icon={Globe} iconColor="text-blue-400">
      <DomainForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} saving={saving} onCancel={onClose} submitText="Create Domain" />
    </ModalWrapper>
  );
}

export function EditDomainModal({ isOpen, onClose, domain, setDomains, selectNode }) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({ name: domain?.name || '', url: domain?.domain_url || '', welcome_message: domain?.welcome_message || '', fallback_message: domain?.fallback_message || '', helpline_number: domain?.helpline_number || '', widget_title: domain?.widget_title || '', widget_color: domain?.widget_color || '#7C3AED', bot_avatar: domain?.bot_avatar || '', is_active: domain?.is_active ?? true });
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
    } catch (e) { const errData = e.response?.data; const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error updating domain'; showToast(typeof errorMsg === 'string' ? errorMsg : 'Error updating domain', 'error'); } finally { setSaving(false); }
  };
  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Edit Domain" icon={Globe} iconColor="text-blue-400">
      <DomainForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} saving={saving} onCancel={onClose} submitText="Save Changes" />
    </ModalWrapper>
  );
}

export function DomainForm({ formData, setFormData, onSubmit, saving, onCancel, submitText }) {
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
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Domain Name</label><input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="Chatbot" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Domain URL</label><input required type="text" value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="domain.com" /><p className="text-xs text-gray-500 mt-1">Enter domain only. Example: example.com</p></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Widget Title</label><input required type="text" value={formData.widget_title} onChange={e => setFormData({ ...formData, widget_title: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="Support Assistant" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Widget Color</label><div className="flex gap-2"><input type="color" value={formData.widget_color} onChange={e => setFormData({ ...formData, widget_color: e.target.value })} className="w-10 h-9 rounded border-0 bg-transparent cursor-pointer p-0" /><input type="text" value={formData.widget_color} onChange={e => setFormData({ ...formData, widget_color: e.target.value })} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" /></div></div>
      </div>
      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Welcome Message</label><input required type="text" value={formData.welcome_message} onChange={e => setFormData({ ...formData, welcome_message: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500" placeholder="Welcome,how may I help you?" /></div>
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
                    onChange={e => setFormData({ ...formData, bot_avatar: e.target.value })}
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

export function CreateCategoryModal({ isOpen, onClose, parentId, domains, categories, setCategories, domainCategoryMap, setDomainCategoryMap, selectNode }) {
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

export function EditCategoryModal({ isOpen, onClose, category, categories, setCategories, selectNode }) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({ faq_title: category?.faq_title || '', status: category?.status || 'active' });
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

export function CategoryForm({ formData, setFormData, onSubmit, saving, onCancel, submitText, formErrors = {}, setFormErrors = () => { } }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Category Title</label>
        <input required type="text" maxLength={200} value={formData.faq_title} onChange={e => { setFormData({ ...formData, faq_title: e.target.value }); setFormErrors({}); }} className={`w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm focus:outline-none text-gray-900 ${formErrors.faq_title ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-purple-500'}`} />
        {formErrors.faq_title && <p className="text-red-500 text-xs mt-1">{formErrors.faq_title}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500 text-gray-900"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      </div>
      <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={onCancel} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900">Cancel</button><button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm">{saving ? 'Saving...' : submitText}</button></div>
    </form>
  );
}

export function CreateQuestionModal({ isOpen, onClose, parentId, categories, setCategories, selectNode }) {
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
      setCategories(prev => prev.map(c => c.id === parentId ? { ...c, questions: [newQ, ...(c.questions || []).filter(q => q.id !== newQ.id)], questionsLoaded: true } : c));
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
          <input required type="text" maxLength={1000} value={formData.question} onChange={e => { setFormData({ ...formData, question: e.target.value }); setFormErrors({}); }} className={`w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm focus:outline-none ${formErrors.question ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-amber-500'}`} />
          {formErrors.question && <p className="text-red-500 text-xs mt-1">{formErrors.question}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Answer Content</label>
          <textarea required maxLength={10000} value={formData.answer} onChange={e => { setFormData({ ...formData, answer: e.target.value }); setFormErrors({}); }} rows={4} className={`w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm focus:outline-none ${formErrors.answer ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-amber-500'}`} />
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

export function AssignExistingModal({ isOpen, onClose, type, allItems, assignedIds, onSave }) {
  const validAssignedIds = (assignedIds || []).map(String).filter(id => allItems.some(item => String(item.id) === id));
  const [selected, setSelected] = useState(new Set(validAssignedIds));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelected(new Set((assignedIds || []).map(String).filter(id => allItems.some(item => String(item.id) === id))));
    }
  }, [assignedIds, isOpen, allItems]);
  const toggle = (id) => { const strId = String(id); const s = new Set(selected); if (s.has(strId)) s.delete(strId); else s.add(strId); setSelected(s); };

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
              <div className={`w-5 h-5 rounded mr-3 flex items-center justify-center transition-colors ${isSel ? 'bg-blue-600' : 'border border-gray-300'}`}>{isSel && <CheckCircle2 className="h-4 w-4 text-white" />}</div>
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

export function BulkUploadModal({ isOpen, onClose, loadInitialData, domain, uploadType = 'faq' }) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState(uploadType);

  // FAQ Bulk Upload State
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  // Document Upload State
  const [docType, setDocType] = useState('file');
  const [docFile, setDocFile] = useState(null);
  const [docText, setDocText] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const [docResults, setDocResults] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) setFile(e.target.files[0]);
  };

  const handleDownloadSample = () => {
    const ws = XLSX.utils.json_to_sheet([{ Category: "Refunds", Question: "How do I get a refund?", Answer: "Please contact support." }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FAQ_Template");
    XLSX.writeFile(wb, "FAQ_Upload_Sample.xlsx");
  };

  const handleUploadFAQ = async () => {
    if (!file) return;
    setLoading(true);
    setResults(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(worksheet);

      if (json.length === 0) { showToast('File is empty', 'error'); setLoading(false); return; }

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
          uniqueRows.push({ Domain: domain.domain_url, Category: category, Question: question, Answer: answer });
        }
      }

      if (uniqueRows.length < json.length) showToast(`${json.length - uniqueRows.length} duplicate or invalid rows skipped.`, 'warning');
      let rowsToProcess = uniqueRows;
      if (uniqueRows.length > 250) {
        showToast('Only first 250 rows are allowed.', 'info');
        rowsToProcess = uniqueRows.slice(0, 250);
      }

      const res = await api.post('/faq-hierarchy/bulk', rowsToProcess);
      setResults(res.data);
      if (res.data.success_count > 0) {
        showToast(`Successfully uploaded ${res.data.success_count} FAQs`, 'success');
        loadInitialData();
      }
    } catch (err) {
      showToast('Error uploading file', 'error');
    } finally { setLoading(false); }
  };

  const handleDocUpload = async () => {
    if (docType === 'file' && !docFile) return;
    if (docType === 'text' && !docText.trim()) return;
    if (!docTitle.trim()) { showToast('Document Category / Title is required', 'error'); return; }

    setDocLoading(true);
    setDocResults(null);
    try {
      const formData = new FormData();
      formData.append("domain_id", domain.id);

      if (docType === 'file') {
        formData.append("file", docFile);
        formData.append("source_title", docTitle.trim());
      } else {
        const textBlob = new Blob([docText], { type: 'text/plain' });
        const fileObj = new File([textBlob], `${docTitle.trim()}.txt`, { type: 'text/plain' });
        formData.append("file", fileObj);
        formData.append("source_title", docTitle.trim());
      }

      const token = await import('@/firebase/config').then(m => m.auth.currentUser?.getIdToken());
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
      const rawRes = await fetch(`${apiUrl}/documents/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (!rawRes.ok) {
        const errData = await rawRes.json().catch(() => ({}));
        throw { response: { data: errData, status: rawRes.status } };
      }
      const res = { data: await rawRes.json() };
      setDocResults(res.data);
      showToast('Document uploaded successfully and is being processed.', 'success');
      loadInitialData();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error uploading document', 'error');
    } finally { setDocLoading(false); }
  };

  const renderFaqTab = () => (
    <div className="space-y-6">
      {!results ? (
        <>
          <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Instructions</h3>
            <p className="text-sm text-gray-500 mb-3">Upload a CSV or Excel file to bulk import FAQs into <strong>{domain?.domain_url}</strong>. The required columns are: <strong>Category, Question, Answer</strong>. <span className="text-amber-400 font-bold block mt-1">Maximum 250 rows allowed.</span></p>
            <button onClick={handleDownloadSample} className="text-teal-600 hover:text-teal-500 text-sm flex items-center gap-1 font-medium transition-colors"><Download size={16} /> Download Sample Template</button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select File (.csv, .xlsx)</label>
            <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-teal-500/10 file:text-teal-600 hover:file:bg-teal-500/20 transition-colors" />
          </div>
          <div className="flex justify-end pt-4">
            <button onClick={onClose} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900 mr-3">Cancel</button>
            <button onClick={handleUploadFAQ} disabled={!file || loading} className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-gray-900 rounded-xl text-sm font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {loading ? 'Processing...' : 'Upload FAQs'}
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
          {results.errors?.length > 0 && (
            <div className="bg-red-100 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-3 font-bold text-sm"><ShieldAlert size={16} /> {results.errors.length} Rows Failed</div>
              <div className="max-h-40 overflow-y-auto custom-scrollbar pr-2 space-y-1">
                {results.errors.map((err, i) => <div key={i} className="text-xs text-red-600 bg-red-950/10 p-2 rounded border border-red-900/20">{err}</div>)}
              </div>
            </div>
          )}
          <div className="flex justify-end pt-4"><button onClick={onClose} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-sm font-bold">Close</button></div>
        </div>
      )}
    </div>
  );

  const renderDocTab = () => (
    <div className="space-y-6">
      {!docResults ? (
        <>
          <div className="flex gap-4 border-b border-gray-200 pb-2">
            <button onClick={() => setDocType('file')} className={`text-sm font-medium pb-2 border-b-2 ${docType === 'file' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Upload File (PDF/TXT/DOCX)</button>
            <button onClick={() => setDocType('text')} className={`text-sm font-medium pb-2 border-b-2 ${docType === 'text' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Paste Long Text</button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Category / Title <span className="text-red-500">*</span></label>
              <input type="text" value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="e.g. Employee Handbook 2024" className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-teal-500" />
            </div>

            {docType === 'file' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select File <span className="text-red-500">*</span></label>
                <input type="file" accept=".pdf,.txt,.docx" onChange={e => { if (e.target.files?.length) setDocFile(e.target.files[0]) }} className="block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-teal-500/10 file:text-teal-600 hover:file:bg-teal-500/20 transition-colors" />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content <span className="text-red-500">*</span></label>
                <textarea rows={8} value={docText} onChange={e => setDocText(e.target.value)} placeholder="Paste your long document content here..." className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-teal-500 resize-none"></textarea>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <button onClick={onClose} className="px-5 py-2 text-sm text-gray-700 hover:text-gray-900 mr-3">Cancel</button>
            <button onClick={handleDocUpload} disabled={(docType === 'file' ? !docFile : !docText) || !docTitle.trim() || docLoading} className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-gray-900 rounded-xl text-sm font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2">
              {docLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {docLoading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center text-center py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
            <h3 className="text-lg font-bold text-gray-900">Document Uploaded</h3>
            <p className="text-sm text-gray-500 mt-1">The document has been queued and is processing in the background.</p>
          </div>
          <div className="flex justify-end pt-4"><button onClick={onClose} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-sm font-bold">Close</button></div>
        </div>
      )}
    </div>
  );

  return (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title={activeTab === 'faq' ? `Bulk Upload FAQs to ${domain?.domain_url}` : `Upload Document to ${domain?.domain_url}`} icon={UploadCloud} iconColor="text-teal-400">
      {activeTab === 'faq' ? renderFaqTab() : renderDocTab()}
    </ModalWrapper>
  );
}