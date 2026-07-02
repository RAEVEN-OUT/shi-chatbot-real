import React, { useEffect, useState } from 'react';
import { faqCategoryService } from '@/services/faqCategoryService';
import { domainCategoryService } from '@/services/domainCategoryService';
import { useToast } from '@/contexts/ToastContext';
import { Tag, CheckSquare, Square, Loader2 } from 'lucide-react';

export default function FaqsTab({ domain }) {
  const toast = useToast();
  const [allCategories, setAllCategories] = useState([]);
  const [assignedCategoryIds, setAssignedCategoryIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [togglingCategoryId, setTogglingCategoryId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [categoriesData, assignedData] = await Promise.all([
        faqCategoryService.listCategories(),
        domainCategoryService.getDomainCategories(domain.id)
      ]);
      setAllCategories(categoriesData || []);
      setAssignedCategoryIds(assignedData || []);
    } catch (e) {
      console.error('Failed to load FAQ categories data:', e);
      toast.error('Failed to load FAQ categories data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (domain?.id) {
      fetchData();
    }
  }, [domain.id]);

  const handleToggleCategory = async (categoryId) => {
    const isCurrentlyAssigned = assignedCategoryIds.includes(categoryId);
    const newAssigned = isCurrentlyAssigned
      ? assignedCategoryIds.filter(id => id !== categoryId)
      : [...assignedCategoryIds, categoryId];

    setTogglingCategoryId(categoryId);
    setSaving(true);
    try {
      await domainCategoryService.updateDomainCategories(domain.id, { category_ids: newAssigned });
      setAssignedCategoryIds(newAssigned);
      toast.success(isCurrentlyAssigned ? 'Category unassigned successfully' : 'Category assigned successfully');
    } catch (e) {
      console.error('Failed to update category assignment:', e);
      toast.error('Failed to update category assignment');
    } finally {
      setSaving(false);
      setTogglingCategoryId(null);
    }
  };

  const handleSelectAll = async () => {
    const activeIds = allCategories.filter(c => c.status !== 'inactive').map(c => c.id);
    const allSelected = activeIds.every(id => assignedCategoryIds.includes(id));

    const newAssigned = allSelected
      ? assignedCategoryIds.filter(id => !activeIds.includes(id))
      : Array.from(new Set([...assignedCategoryIds, ...activeIds]));

    setSaving(true);
    try {
      await domainCategoryService.updateDomainCategories(domain.id, { category_ids: newAssigned });
      setAssignedCategoryIds(newAssigned);
      toast.success(allSelected ? 'All categories unassigned' : 'All categories assigned');
    } catch (e) {
      console.error('Failed to update category assignments:', e);
      toast.error('Failed to update category assignments');
    } finally {
      setSaving(false);
    }
  };


  const filteredCategories = allCategories.filter(cat => {
    const title = (cat.faq_title || '').toLowerCase();
    const q = search.toLowerCase();
    return title.includes(q);
  }).sort((a, b) => {
    const isAssignedA = assignedCategoryIds.includes(a.id);
    const isAssignedB = assignedCategoryIds.includes(b.id);
    
    const isActiveA = a.status !== 'inactive';
    const isActiveB = b.status !== 'inactive';
    
    const groupA = (isActiveA ? 0 : 2) + (isAssignedA ? 0 : 1);
    const groupB = (isActiveB ? 0 : 2) + (isAssignedB ? 0 : 1);
    
    if (groupA !== groupB) {
      return groupA - groupB;
    }
    
    const titleA = (a.faq_title || '').toLowerCase();
    const titleB = (b.faq_title || '').toLowerCase();
    
    if (titleA < titleB) return -1;
    if (titleA > titleB) return 1;
    return 0;
  });

  const activeCategories = allCategories.filter(c => c.status !== 'inactive');
  const allSelected = activeCategories.length > 0 && activeCategories.every(c => assignedCategoryIds.includes(c.id));

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-200 bg-gray-50">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">FAQ Categories Mapping</h3>
          <p className="text-xs text-gray-500 mt-1">Assign FAQ categories to link their questions to this domain's chatbot.</p>
        </div>
        <div className="flex gap-2">
          {allCategories.length > 0 && (
            <button
              onClick={handleSelectAll}
              disabled={saving || loading || activeCategories.length === 0}
              className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-40 flex items-center gap-2"
            >
              {saving && !togglingCategoryId && <Loader2 size={14} className="animate-spin" />}
              {allSelected ? 'Unselect All' : 'Select All Active'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
          <Loader2 size={20} className="animate-spin" />
          <span>Loading FAQ Categories...</span>
        </div>
      ) : allCategories.length === 0 ? (
        <div className="text-center p-12 text-gray-500 bg-white border-gray-200 rounded-2xl border border-gray-200">
          <Tag size={36} className="mx-auto mb-3 opacity-40 text-gray-500" />
          <p className="text-sm font-medium">No FAQ categories created yet.</p>
          <p className="text-xs text-gray-500 mt-1">Go to FAQs page to create categories first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <input
              type="text"
              placeholder="Search categories..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredCategories.map(category => {
              const isAssigned = assignedCategoryIds.includes(category.id);
              const isInactive = category.status === 'inactive';
              return (
                <div
                  key={category.id}
                  onClick={() => !saving && handleToggleCategory(category.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-4 ${
                    isAssigned
                      ? 'bg-primary/5 border-primary/30 hover:border-primary/50'
                      : 'bg-gray-50 border-gray-200 hover:border-white/15'
                  } ${isInactive ? 'opacity-60' : ''}`}
                >
                  <div className="mt-0.5 shrink-0 text-gray-500">
                    {togglingCategoryId === category.id ? (
                      <Loader2 className="animate-spin text-primary" size={18} />
                    ) : isAssigned ? (
                      <CheckSquare className="text-primary" size={18} />
                    ) : (
                      <Square size={18} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Tag size={14} className="text-purple-400 shrink-0" />
                      <span title={category.faq_title} className="font-bold text-sm text-gray-900 break-all" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}}>{category.faq_title}</span>
                      {isInactive && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-md font-bold uppercase tracking-wider">
                          Inactive
                        </span>
                      )}
                      {isAssigned && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded-md font-bold uppercase tracking-wider">
                          Assigned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{category.status || 'active'}</p>
                  </div>
                </div>
              );
            })}
            {filteredCategories.length === 0 && (
              <div className="col-span-2 text-center py-8 text-gray-500 text-sm">
                No categories match "{search}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
