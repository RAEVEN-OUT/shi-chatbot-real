'use client';
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { faqCategoryService } from '@/services/faqCategoryService';
import { faqQuestionService } from '@/services/faqQuestionService';
import { confirmAction } from '@/utils/confirm';
import {
  Plus, HelpCircle, Trash2, Edit3,
  Search, X, Save, Loader2, Layers, List, Tag, Eye, EyeOff
} from 'lucide-react';

export default function Faqs() {
  const { currentUser } = useAuth();
  const toast = useToast();

  // Tab State
  const [activeTab, setActiveTab] = useState('items'); // 'categories' or 'items'

  // Common State
  const [loading, setLoading] = useState(true);

  // FAQ Categories State
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    faq_title: '',
    status: 'active'
  });
  const [categoryFormErrors, setCategoryFormErrors] = useState({ faq_title: false });

  // FAQ Items State
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState({
    faq_id: '',
    question: '',
    answer: '',
    aliases: '',
    status: 'active'
  });
  const [itemFormErrors, setItemFormErrors] = useState({ faq_id: false, question: false, answer: false });

  // FAQ Items Table Search & Filter & Pagination State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState(null);

  // Bulk Delete State
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [isBulkDeletingItems, setIsBulkDeletingItems] = useState(false);
  const [isBulkDeletingCategories, setIsBulkDeletingCategories] = useState(false);

  // Debounce search input for items
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch categories
  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const data = await faqCategoryService.listCategories();
      setCategories(data || []);
    } catch (e) {
      console.error('Failed to fetch FAQ categories', e);
      toast.error('Failed to load FAQ categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  // Fetch FAQ items (questions)
  const fetchItems = async () => {
    setItemsLoading(true);
    try {
      const params = {
        page: page,
        page_size: pageSize
      };
      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (filterCategoryId && filterCategoryId !== 'all') {
        params.faq_id = filterCategoryId;
      }
      const data = await faqQuestionService.listQuestions(params);
      
      if (data && data.pagination) {
        setItems(data.data || []);
        setTotalItems(data.pagination.total_items || 0);
        setTotalPages(data.pagination.total_pages || 1);
      } else {
        const list = data || [];
        setItems(list);
        setTotalItems(list.length);
        setTotalPages(1);
      }
    } catch (e) {
      console.error('Failed to fetch FAQ questions', e);
      toast.error('Failed to load FAQ questions');
      setItems([]);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setItemsLoading(false);
    }
  };

  // Initial load
  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchCategories(),
      fetchItems()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    if (currentUser) {
      loadAll();
    }
  }, [currentUser?.uid]);

  // Fetch items when pagination/filters change
  useEffect(() => {
    if (!loading) {
      fetchItems();
    }
  }, [debouncedSearch, filterCategoryId, page, pageSize]);

  // Reset page on search or category filter change
  useEffect(() => {
    setPage(1);
    setSelectedItems(new Set());
  }, [debouncedSearch, filterCategoryId]);

  // Category Submit
  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    if (!categoryForm.faq_title.trim()) {
      setCategoryFormErrors({ faq_title: "Category Title is required" });
      toast.warning('Category Title is required');
      return;
    }

    const isDuplicate = categories.some(c => 
      (c.faq_title || '').trim().toLowerCase() === categoryForm.faq_title.trim().toLowerCase() && 
      (!editingCategory || c.id !== editingCategory.id)
    );

    if (isDuplicate) {
      setCategoryFormErrors({ faq_title: "Category name already exists." });
      toast.warning("Category name already exists. Please choose a different name.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        faq_title: categoryForm.faq_title.trim(),
        status: categoryForm.status
      };

      if (editingCategory) {
        await faqCategoryService.updateCategory(editingCategory.id, payload);
        toast.success('Category updated successfully');
      } else {
        await faqCategoryService.createCategory(payload);
        toast.success('Category created successfully');
      }
      await fetchCategories();
      // Refresh items list as categories change could affect cascade status logic
      await fetchItems();
      setCategoryModalOpen(false);
    } catch (e) {
      console.error('Failed to save category', e);
      const errData = e.response?.data;
      const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error saving Category';
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Error saving Category');
      
      const field = errData?.field || errData?.detail?.field;
      if (field) {
        setCategoryFormErrors(prev => ({ ...prev, [field]: errorMsg }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (cat) => {
    const confirmed = await confirmAction({
      title: 'Delete Category',
      text: 'Are you sure you want to delete this FAQ category? This will also delete all questions inside it.',
      confirmButtonText: 'Yes, delete category',
      preConfirm: async () => {
        await faqCategoryService.deleteCategory(cat.id);
      }
    });
    if (!confirmed) return;
    toast.success('Category deleted successfully');
    loadAll();
  };

  const handleBulkDeleteCategories = async () => {
    if (selectedCategories.size === 0) return;
    const confirmed = await confirmAction({
      title: 'Bulk Delete Categories',
      text: `Are you sure you want to delete ${selectedCategories.size} selected category(s)? This will also delete all questions inside them.`,
      confirmButtonText: 'Yes, delete selected'
    });
    if (!confirmed) return;
    
    setIsBulkDeletingCategories(true);
    try {
      const res = await faqCategoryService.bulkDeleteCategories(Array.from(selectedCategories));
      await loadAll();
      setSelectedCategories(new Set());
      if (res.details && res.details.failed && res.details.failed.length > 0) {
        if (res.details.success && res.details.success.length > 0) {
          toast.warning(res.message);
        } else {
          toast.error(res.details.failed[0].error || res.message || "Failed to delete categories");
        }
      } else {
        toast.success(res.message || "Selected categories deleted successfully");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.message || 'Failed to perform bulk delete for categories');
    } finally {
      setIsBulkDeletingCategories(false);
    }
  };

  // Item Submit
  const handleItemSubmit = async (e) => {
    e.preventDefault();
    const errors = {
      faq_id: !itemForm.faq_id ? "FAQ Category is required" : null,
      question: !itemForm.question.trim() ? "Question is required" : null,
      answer: !itemForm.answer.trim() ? "Answer is required" : null
    };

    const isDuplicateQuestion = items.some(i => 
      i.faq_id === itemForm.faq_id &&
      (i.question || '').trim().toLowerCase() === itemForm.question.trim().toLowerCase() && 
      (!editingItem || i.id !== editingItem.id)
    );

    if (isDuplicateQuestion) {
      errors.question = "Question already exists in this category.";
    }

    const isDuplicateAnswer = items.some(i => 
      i.faq_id === itemForm.faq_id &&
      (i.answer || '').trim().toLowerCase() === itemForm.answer.trim().toLowerCase() && 
      (!editingItem || i.id !== editingItem.id)
    );

    if (isDuplicateAnswer) {
      errors.answer = "Answer already exists in this category.";
    }

    setItemFormErrors(errors);

    if (errors.faq_id || errors.question || errors.answer) {
      toast.warning('Please resolve the errors below.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        faq_id: itemForm.faq_id,
        question: itemForm.question.trim(),
        answer: itemForm.answer.trim(),
        aliases: itemForm.aliases ? itemForm.aliases.split(',').map(a => a.trim()).filter(a => a) : [],
        status: itemForm.status,
        reindex: true
      };

      if (editingItem) {
        await faqQuestionService.updateQuestion(editingItem.id, payload);
        toast.success('FAQ Item updated successfully');
      } else {
        await faqQuestionService.createQuestion(payload);
        toast.success('FAQ Item created successfully');
      }
      await fetchItems();
      setItemModalOpen(false);
    } catch (e) {
      console.error('Failed to save FAQ question', e);
      const errData = e.response?.data;
      const errorMsg = errData?.message || errData?.detail?.message || errData?.detail || 'Error saving FAQ item';
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Error saving FAQ item');
      
      const field = errData?.field || errData?.detail?.field;
      if (field) {
        setItemFormErrors(prev => ({ ...prev, [field]: errorMsg }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Item
  const handleDeleteItem = async (id) => {
    const confirmed = await confirmAction({
      title: 'Delete FAQ Item',
      text: 'Are you sure you want to delete this FAQ question?',
      confirmButtonText: 'Yes, delete',
      preConfirm: async () => {
        await faqQuestionService.deleteQuestion(id);
      }
    });
    if (!confirmed) return;
    toast.success('FAQ question deleted');
    loadAll();
  };

  const handleBulkDeleteItems = async () => {
    if (selectedItems.size === 0) return;
    const confirmed = await confirmAction({
      title: 'Bulk Delete FAQ Items',
      text: `Are you sure you want to delete ${selectedItems.size} selected FAQ item(s)?`,
      confirmButtonText: 'Yes, delete selected'
    });
    if (!confirmed) return;
    
    setIsBulkDeletingItems(true);
    try {
      const res = await faqQuestionService.bulkDeleteQuestions(Array.from(selectedItems));
      await fetchItems();
      setSelectedItems(new Set());
      if (res.details && res.details.failed && res.details.failed.length > 0) {
        if (res.details.success && res.details.success.length > 0) {
          toast.warning(res.message);
        } else {
          toast.error(res.details.failed[0].error || res.message || "Failed to delete items");
        }
      } else {
        toast.success(res.message || "Selected items deleted successfully");
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.message || 'Failed to perform bulk delete for items');
    } finally {
      setIsBulkDeletingItems(false);
    }
  };

  // Modal Triggers
  const openAddCategoryModal = () => {
    setEditingCategory(null);
    setCategoryForm({
      faq_title: '',
      status: 'active'
    });
    setCategoryFormErrors({ faq_title: false });
    setCategoryModalOpen(true);
  };

  const openEditCategoryModal = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({
      faq_title: cat.faq_title || '',
      status: cat.status || 'active'
    });
    setCategoryFormErrors({ faq_title: false });
    setCategoryModalOpen(true);
  };

  const openAddItemModal = () => {
    setEditingItem(null);
    setItemForm({
      faq_id: categories.length > 0 ? categories[0].id : '',
      question: '',
      answer: '',
      aliases: '',
      status: 'active'
    });
    setItemFormErrors({ faq_id: false, question: false, answer: false });
    setItemModalOpen(true);
  };

  const openEditItemModal = (item) => {
    setEditingItem(item);
    setItemForm({
      faq_id: item.faq_id || '',
      question: item.question || '',
      answer: item.answer || '',
      aliases: (item.aliases || []).join(', '),
      status: item.status || 'active'
    });
    setItemFormErrors({ faq_id: false, question: false, answer: false });
    setItemModalOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FAQ Intelligence</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your Simplified FAQ structure with Categories and Questions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full md:w-auto mt-2 md:mt-0">
          {activeTab === 'items' && selectedItems.size > 0 && (
            <button
              onClick={handleBulkDeleteItems}
              disabled={isBulkDeletingItems}
              className="flex-1 md:flex-none justify-center whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {isBulkDeletingItems ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              Delete Selected ({selectedItems.size})
            </button>
          )}
          {activeTab === 'categories' && selectedCategories.size > 0 && (
            <button
              onClick={handleBulkDeleteCategories}
              disabled={isBulkDeletingCategories}
              className="flex-1 md:flex-none justify-center whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {isBulkDeletingCategories ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              Delete Selected ({selectedCategories.size})
            </button>
          )}
          <button
            onClick={openAddCategoryModal}
            className="flex-1 md:flex-none justify-center whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-900 rounded-xl font-medium transition-colors"
          >
            <Plus size={18} /> Create Category
          </button>
          <button
            onClick={openAddItemModal}
            disabled={categories.length === 0}
            className="flex-1 md:flex-none justify-center whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            <Plus size={18} /> Create FAQ Item
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 p-8">
          <Loader2 size={18} className="animate-spin" />
          <span>Loading FAQ data...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Panel Tabs Navigation */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('items')}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all ${
                activeTab === 'items'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <List size={16} /> FAQ Items ({totalItems})
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 font-bold text-sm transition-all ${
                activeTab === 'categories'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Layers size={16} /> FAQ Categories ({categories.length})
            </button>
          </div>

          {/* Render Active Tab */}
          {activeTab === 'items' ? (
            <div className="bg-white rounded-3xl overflow-hidden border border-gray-200 bg-gray-50">
              {/* Items Toolbar */}
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-xs">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search FAQ questions & answers…"
                      className="w-full bg-white border border-gray-200 rounded-xl pl-8 pr-8 py-2 text-xs text-gray-900 placeholder-gray-400 focus:border-primary/50 focus:outline-none"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <select
                    value={filterCategoryId}
                    onChange={e => setFilterCategoryId(e.target.value)}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-gray-900 font-semibold text-xs focus:border-primary focus:outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%2%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.15rem_1.15rem] bg-[right_10px_center] bg-no-repeat pr-8"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id} className="bg-white text-gray-900">{c.faq_title}</option>
                    ))}
                  </select>
                </div>
                
                <div className="text-xs text-gray-500">
                  {totalItems} Item{totalItems !== 1 ? 's' : ''} found
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold w-10">
                        <input 
                          type="checkbox" 
                          checked={items.length > 0 && selectedItems.size === items.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItems(new Set(items.map(i => i.id)));
                            } else {
                              setSelectedItems(new Set());
                            }
                          }}
                          className="w-4 h-4 text-primary bg-white border-gray-300 rounded focus:ring-primary focus:ring-2"
                        />
                      </th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold w-[30%]">Question</th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold w-[35%]">Answer</th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold w-[20%]">Category & Tags</th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold text-right w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {itemsLoading ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2 text-gray-500">
                            <Loader2 size={18} className="animate-spin" />
                            <span>Loading FAQ items...</span>
                          </div>
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-gray-500 text-sm">
                          {search || filterCategoryId !== 'all' ? 'No items match your filters.' : 'No FAQ questions created yet.'}
                        </td>
                      </tr>
                    ) : (
                      items.map(item => {
                        const cat = categories.find(c => c.id === item.faq_id);
                        const catTitle = cat ? cat.faq_title : 'Unassigned';
                        const isInactive = item.status === 'inactive' || (cat && cat.status === 'inactive');
                        
                        return (
                          <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isInactive ? 'opacity-50' : ''}`}>
                            <td className="px-5 py-4 align-top">
                              <input 
                                type="checkbox" 
                                checked={selectedItems.has(item.id)}
                                onChange={(e) => {
                                  setSelectedItems(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(item.id);
                                    else next.delete(item.id);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 text-primary bg-white border-gray-300 rounded focus:ring-primary focus:ring-2"
                              />
                            </td>
                            <td className="px-5 py-4 align-top">
                              <p className="font-semibold text-gray-900 text-xs leading-snug line-clamp-3 break-all" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}}>{item.question}</p>
                              {isInactive && (
                                <span className="inline-block mt-1 text-[9px] px-1 bg-red-100 text-red-600 font-bold rounded uppercase">
                                  {item.status === 'inactive' ? 'Inactive' : 'Category Inactive'}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-4 align-top">
                              <p className="text-gray-500 text-xs leading-snug line-clamp-4 break-all" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}}>{item.answer}</p>
                            </td>
                            <td className="px-5 py-4 align-top">
                              <div className="space-y-1.5">
                                <span className="inline-block text-[10px] font-bold bg-white border-gray-200 px-2 py-0.5 rounded text-gray-700">
                                  {catTitle}
                                </span>
                              </div>
                            </td>
                              <td className="px-5 py-4 align-top text-right">
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => openEditItemModal(item)}
                                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-white border-gray-200 rounded-xl transition-colors"
                                  title="Edit Item"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  disabled={deletingItemId === item.id}
                                  className="p-1.5 text-gray-500 hover:text-gray-500 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-50"
                                  title="Delete Item"
                                >
                                  {deletingItemId === item.id ? <Loader2 size={14} className="animate-spin text-gray-500" /> : <Trash2 size={14} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Items Pagination */}
              {totalItems > 0 && (
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-4">
                  <span className="text-xs text-gray-500">
                    Showing {Math.min(totalItems, (page - 1) * pageSize + 1)} to {Math.min(page * pageSize, totalItems)} of {totalItems} items
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 text-gray-900 bg-white border-gray-200 hover:bg-white border-gray-200 transition-colors disabled:opacity-30"
                    >
                      Previous
                    </button>
                    <span className="px-3 py-1.5 text-xs text-gray-700 font-semibold flex items-center">
                      Page {page} of {totalPages || 1}
                    </span>
                    <button
                      disabled={page === totalPages || totalPages === 0}
                      onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 text-gray-900 bg-white border-gray-200 hover:bg-white border-gray-200 transition-colors disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl overflow-hidden border border-gray-200 bg-gray-50">
              {/* Categories Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold w-10">
                        <input 
                          type="checkbox" 
                          checked={categories.length > 0 && selectedCategories.size === categories.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategories(new Set(categories.map(c => c.id)));
                            } else {
                              setSelectedCategories(new Set());
                            }
                          }}
                          className="w-4 h-4 text-primary bg-white border-gray-300 rounded focus:ring-primary focus:ring-2"
                        />
                      </th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Category Title</th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold text-center w-36">Status</th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold text-center w-36">Active Questions</th>
                      <th className="px-5 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-semibold text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {categoriesLoading ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center">
                          <div className="flex items-center justify-center gap-2 text-gray-500">
                            <Loader2 size={18} className="animate-spin" />
                            <span>Loading FAQ categories...</span>
                          </div>
                        </td>
                      </tr>
                    ) : categories.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-gray-500 text-sm">
                          No FAQ categories created yet. Click "Create Category" to add one.
                        </td>
                      </tr>
                    ) : (
                      categories.map(cat => {
                        const isInactive = cat.status === 'inactive';
                        return (
                          <tr key={cat.id} className={`hover:bg-gray-50 transition-colors ${isInactive ? 'opacity-50' : ''}`}>
                            <td className="px-5 py-4 align-middle">
                              <input 
                                type="checkbox" 
                                checked={selectedCategories.has(cat.id)}
                                onChange={(e) => {
                                  setSelectedCategories(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(cat.id);
                                    else next.delete(cat.id);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 text-primary bg-white border-gray-300 rounded focus:ring-primary focus:ring-2"
                              />
                            </td>
                            <td className="px-5 py-4 align-middle">
                              <span className="font-bold text-gray-900 text-sm break-all" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}}>{cat.faq_title}</span>
                            </td>
                            <td className="px-5 py-4 align-middle text-center">
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                isInactive 
                                  ? 'bg-red-100 text-red-600 border border-gray-200' 
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/10'
                              }`}>
                                {cat.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 align-middle text-center font-semibold text-gray-700 text-xs">
                              {cat.active_question_count ?? 0}
                            </td>
                            <td className="px-5 py-4 align-middle text-right">
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => openEditCategoryModal(cat)}
                                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-white border-gray-200 rounded-xl transition-colors"
                                  title="Edit Category"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(cat)}
                                  disabled={deletingCategoryId === cat.id}
                                  className="p-1.5 text-gray-500 hover:text-gray-500 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-50"
                                  title="Delete Category"
                                >
                                  {deletingCategoryId === cat.id ? <Loader2 size={14} className="animate-spin text-gray-500" /> : <Trash2 size={14} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Category Add/Edit Modal */}
      {categoryModalOpen && createPortal(
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm  z-[999999] flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setCategoryModalOpen(false)}
        >
          <div
            className="bg-white border border-gray-200 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl cursor-default"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-white border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">{editingCategory ? 'Edit FAQ Category' : 'Create FAQ Category'}</h3>
              <button onClick={() => setCategoryModalOpen(false)} className="text-gray-500 hover:text-gray-700 p-1 rounded-xl hover:bg-white border-gray-200 transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCategorySubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category Title</label>
                <input
                  required
                  type="text"
                  maxLength={200}
                  value={categoryForm.faq_title}
                  onChange={e => {
                    setCategoryForm({ ...categoryForm, faq_title: e.target.value });
                    setCategoryFormErrors({ faq_title: !e.target.value.trim() ? "Category Title is required" : null });
                  }}
                  className={`w-full bg-white border rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none ${categoryFormErrors.faq_title ? 'border-red-500' : 'border-gray-200 focus:border-primary'}`}
                  placeholder="e.g. Booking Support"
                />
                {categoryFormErrors.faq_title && <p className="text-red-500 text-xs mt-1">{categoryFormErrors.faq_title === true ? "Category Title is required" : categoryFormErrors.faq_title}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    value={categoryForm.status}
                    onChange={e => setCategoryForm({ ...categoryForm, status: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:border-primary focus:outline-none appearance-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>


              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setCategoryModalOpen(false)} className="flex-1 py-2.5 bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-900 rounded-xl font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : (editingCategory ? 'Save Changes' : 'Save Category')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Item Add/Edit Modal */}
      {itemModalOpen && createPortal(
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm  z-[999999] flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setItemModalOpen(false)}
        >
          <div
            className="bg-white border border-gray-200 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl cursor-default"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-white border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">{editingItem ? 'Edit FAQ Item' : 'Create FAQ Item'}</h3>
              <button onClick={() => setItemModalOpen(false)} className="text-gray-500 hover:text-gray-700 p-1 rounded-xl hover:bg-white border-gray-200 transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleItemSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">FAQ Category</label>
                <select
                  required
                  value={itemForm.faq_id}
                  onChange={e => {
                    setItemForm({ ...itemForm, faq_id: e.target.value });
                    setItemFormErrors(f => ({ ...f, faq_id: !e.target.value ? "FAQ Category is required" : null }));
                  }}
                  className={`w-full bg-white border rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none appearance-none ${itemFormErrors.faq_id ? 'border-red-500' : 'border-gray-200 focus:border-primary'}`}
                >
                  <option value="" disabled>Select FAQ Category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.faq_title}</option>
                  ))}
                </select>
                {itemFormErrors.faq_id && <p className="text-red-500 text-xs mt-1">{itemFormErrors.faq_id === true ? "FAQ Category is required" : itemFormErrors.faq_id}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Question</label>
                <input
                  type="text"
                  maxLength={1000}
                  value={itemForm.question}
                  onChange={e => {
                    setItemForm({ ...itemForm, question: e.target.value });
                    setItemFormErrors(f => ({ ...f, question: !e.target.value.trim() ? "Question is required" : null }));
                  }}
                  className={`w-full bg-white border rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none ${itemFormErrors.question ? 'border-red-500' : 'border-gray-200 focus:border-primary'}`}
                  placeholder="e.g. How do I request a refund?"
                />
                {itemFormErrors.question && <p className="text-red-500 text-xs mt-1">{itemFormErrors.question === true ? "Question is required" : itemFormErrors.question}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Answer</label>
                <textarea
                  maxLength={10000}
                  value={itemForm.answer}
                  onChange={e => {
                    setItemForm({ ...itemForm, answer: e.target.value });
                    setItemFormErrors(f => ({ ...f, answer: !e.target.value.trim() ? "Answer is required" : null }));
                  }}
                  className={`w-full bg-white border rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none h-24 resize-none ${itemFormErrors.answer ? 'border-red-500' : 'border-gray-200 focus:border-primary'}`}
                  placeholder="Provide details for customer support resolution…"
                />
                {itemFormErrors.answer && <p className="text-red-500 text-xs mt-1">{itemFormErrors.answer === true ? "Answer is required" : itemFormErrors.answer}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Aliases (Optional, Comma-separated)</label>
                <input
                  type="text"
                  value={itemForm.aliases}
                  onChange={e => setItemForm({ ...itemForm, aliases: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-primary"
                  placeholder="e.g. mng, meet & greet, where is mng"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    value={itemForm.status}
                    onChange={e => setItemForm({ ...itemForm, status: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:border-primary focus:outline-none appearance-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>


              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setItemModalOpen(false)} className="flex-1 py-2.5 bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-900 rounded-xl font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {submitting ? 'Saving…' : 'Save FAQ Item'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}