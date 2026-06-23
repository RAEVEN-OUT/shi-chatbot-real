'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/utils/dateFormatter';
import { failedQuestionService } from '@/services/failedQuestionService';
import { faqQuestionService } from '@/services/faqQuestionService';
import { domainService } from '@/services/domainService';
import { faqCategoryService } from '@/services/faqCategoryService';
import { BrainCircuit, Search, ChevronLeft, ChevronRight, CheckCircle, ShieldAlert, Trash2, X, Plus, ExternalLink, Activity, Loader2, Globe, Tag } from 'lucide-react';
import { TableSkeleton } from '@/components/loaders/Skeletons';
import { useToast } from '@/contexts/ToastContext';
import { confirmAction } from '@/utils/confirm';

export default function FailedQuestions() {
  const { currentUser, userData } = useAuth();
  const customTimeStamp = userData?.custom_time_stamp;
  const toast = useToast();
  const [questions, setQuestions] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Search state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Promotion modal state
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [promoteAction, setPromoteAction] = useState('new_faq'); // 'new_faq' or 'add_alias'
  // Custom FAQ fields for creation/edit
  const [customQuestion, setCustomQuestion] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');
  const [customCategoryId, setCustomCategoryId] = useState('');
  const [customStatus, setCustomStatus] = useState('active');
  const [targetFaqId, setTargetFaqId] = useState('');
  const [domainFaqs, setDomainFaqs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchStaticData = async () => {
    try {
      const [catData, domainData] = await Promise.all([
        faqCategoryService.listCategories(),
        domainService.listDomains()
      ]);
      setCategories(catData || []);
      setDomains(domainData || []);
    } catch (e) {
      console.error("Failed to load static configuration data", e);
    }
  };

  const fetchFailedQuestions = async () => {
    setLoading(true);
    try {
      const data = await failedQuestionService.listFailedQuestions({
        page: page,
        page_size: pageSize,
        search: searchQuery
      });
      // The API returns paginated data if page/page_size are passed
      if (data && data.data) {
        setQuestions(data.data);
        setTotalPages(data.pagination.total_pages || 1);
        setTotalItems(data.pagination.total_items || 0);
      } else {
        setQuestions(data || []);
        setTotalPages(1);
        setTotalItems((data || []).length);
      }
    } catch (e) {
      console.error("Failed to load failed questions list", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchStaticData();
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    if (currentUser) {
      fetchFailedQuestions();
    }
  }, [currentUser?.uid, page, searchQuery]);

  const handleDelete = async (id) => {
    const confirmed = await confirmAction({
      title: "Dismiss Log",
      text: "Are you sure you want to dismiss this failed question log?",
      confirmButtonText: "Yes, dismiss",
      preConfirm: async () => {
        await failedQuestionService.deleteFailedQuestion(id);
      }
    });
    if (!confirmed) return;
    toast.success("Failed question dismissed");
  };

  const handleSelectQuestion = (id) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedQuestions(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedQuestions.size === questions.length) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(questions.map(q => q.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedQuestions.size === 0) return;
    const confirmed = await confirmAction({
      title: "Dismiss Selected Logs",
      text: `Are you sure you want to dismiss ${selectedQuestions.size} selected logs?`,
      confirmButtonText: "Yes, dismiss them"
    });
    if (!confirmed) return;
    
    setIsBulkDeleting(true);
    try {
      const res = await failedQuestionService.bulkDeleteFailed({ ids: Array.from(selectedQuestions) });
      setSelectedQuestions(new Set());
      fetchFailedQuestions();
      if (res.details && res.details.failed && res.details.failed.length > 0) {
        if (res.details.success && res.details.success.length > 0) {
          toast.warning(res.message);
        } else {
          toast.error(res.details.failed[0].error || res.message || "Failed to dismiss questions");
        }
      } else {
        toast.success(res.message || `${selectedQuestions.size} questions dismissed`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.message || "Failed to dismiss questions");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleMarkAsSpam = async (id) => {
    const confirmed = await confirmAction({
      title: "Flag as Spam",
      text: "Are you sure you want to mark this question as spam? It will be blocked from future matches, and will not be stored in failed questions again.",
      confirmButtonText: "Yes, mark as spam",
      preConfirm: async () => {
        await failedQuestionService.flagAsSpam(id);
      }
    });
    if (!confirmed) return;
    fetchFailedQuestions();
    toast.success("Question flagged as spam successfully");
  };

  const handleOpenPromote = (q) => {
    setSelectedQuestion(q);
    
    // Initialize form fields with pre-filled failed question data
    const questionText = q.customer_question || q.query || '';
    const answerText = q.ai_response || q.failed_response || '';
    
    setCustomQuestion(questionText);
    setCustomAnswer(answerText);
    setCustomStatus('active');
    
    // Default to the first category if any exist
    if (categories.length > 0) {
      setCustomCategoryId(categories[0].id);
    } else {
      setCustomCategoryId('');
    }
    
    // Removed domain-specific FAQ fetching; using all FAQs if needed
    setDomainFaqs([]);
    setTargetFaqId('');
      
    setPromoteOpen(true);
  };

  const handlePromoteSubmit = async (e) => {
    e.preventDefault();
    if (!selectedQuestion) return;

    if (!customCategoryId) {
      toast.warning("Please select an FAQ category.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        action: 'new_faq',
        category_id: customCategoryId,
        answer: customAnswer.trim(),
        question: customQuestion.trim(),
        status: customStatus,
        reindex: true,
      };

      await failedQuestionService.promoteQuestion(selectedQuestion.id, payload);
      fetchFailedQuestions();
      setPromoteOpen(false);
      setSelectedQuestion(null);
      toast.success("Question promoted successfully");
    } catch (e) {
      console.error("Failed to promote question", e);
      toast.error("Failed to promote question.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Failed Questions</h1>
          <p className="text-gray-500 text-sm mt-1">Review questions the chatbot couldn't answer to improve your AI intelligence.</p>
        </div>

        {/* Search Input */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          {selectedQuestions.size > 0 && (
            <button 
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-red-50 text-red-600 rounded-xl font-medium transition-colors"
            >
              {isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              <span className="hidden sm:inline">Dismiss Selected ({selectedQuestions.size})</span>
            </button>
          )}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search failed queries..."
              className="w-full bg-white border-gray-200 border rounded-xl pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500/50 transition-colors"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1); // Reset page to 1 when search changes
              }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} />
        ) : questions.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-400 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Inbox Zero!</h3>
            <p className="text-gray-500">Your chatbot successfully resolved or answered all customer questions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-white">
                  <th className="p-4 text-left w-12">
                    <input 
                      type="checkbox"
                      checked={questions.length > 0 && selectedQuestions.size === questions.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Question</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Response</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created Time</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Promote</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Spam</th>
                  <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {questions.map(q => {
                  const domainObj = domains.find(d => d.id === q.domain_id);
                  const domainName = domainObj ? (domainObj.domain_url || domainObj.id) : 'Unknown Domain';
                  return (
                    <tr key={q.id} className={`hover:bg-gray-50 transition-colors ${selectedQuestions.has(q.id) ? 'bg-blue-50/50' : ''}`}>
                      <td className="p-4">
                        <input 
                          type="checkbox"
                          checked={selectedQuestions.has(q.id)}
                          onChange={() => handleSelectQuestion(q.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-medium text-gray-900 max-w-sm truncate" title={q.customer_question || q.query}>{q.customer_question || q.query}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-white border-gray-200 px-2 py-1 rounded-md w-fit max-w-[120px] truncate" title={domainName}>
                          <Globe size={12} className="shrink-0" />
                          <span className="truncate">{domainName.replace(/^https?:\/\//, '')}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-500 max-w-xs truncate" title={q.ai_response || q.failed_response}>
                        {q.ai_response || q.failed_response}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-medium inline-block ${
                          q.status === 'resolved' ? 'bg-emerald-100 text-emerald-400 border border-emerald-500/20' :
                          q.status === 'added_to_faq' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {q.status || 'pending'}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-500">
                        {q.created_at || q.last_asked_at ? formatDate(q.created_at || q.last_asked_at, customTimeStamp) : 'N/A'}
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleOpenPromote(q)}
                          className="inline-flex items-center justify-center p-2 bg-blue-500/10 hover:bg-blue-500/20 hover:text-blue-400 text-gray-700 rounded-xl transition-colors"
                          title="Promote to FAQ"
                        >
                          <BrainCircuit size={16} />
                        </button>
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleMarkAsSpam(q.id)}
                          className="inline-flex items-center justify-center p-2 bg-white border-gray-200 hover:bg-orange-500/20 hover:text-orange-400 text-gray-700 rounded-xl transition-colors"
                          title="Mark as Spam"
                        >
                          <ShieldAlert size={16} />
                        </button>
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleDelete(q.id)}
                          className="inline-flex items-center justify-center p-2 bg-white border-gray-200 hover:bg-red-500/20 hover:text-gray-500 text-gray-700 rounded-xl transition-colors"
                          title="Dismiss Log"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 bg-white border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Showing page {page} of {totalPages} ({totalItems} total queries)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-xl bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Promotion Modal */}
      {promoteOpen && selectedQuestion && createPortal(
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm  z-[999999] flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-white border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <BrainCircuit className="text-blue-400" />
                Promote Query to FAQ
              </h3>
              <button onClick={() => setPromoteOpen(false)} className="text-gray-500 hover:text-gray-700 p-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="bg-white border-gray-200 p-4 rounded-2xl border border-gray-200">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Customer Question (Original)</p>
                <p className="text-gray-900 text-sm font-medium">"{selectedQuestion.customer_question || selectedQuestion.query}"</p>
              </div>

              <form onSubmit={handlePromoteSubmit} className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">FAQ Category</label>
                      <select 
                        required 
                        value={customCategoryId} 
                        onChange={e => setCustomCategoryId(e.target.value)} 
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:border-primary focus:outline-none appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_10px_center] bg-no-repeat pr-10"
                      >
                        <option value="" disabled>Select FAQ Category</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.faq_title}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Question (Editable)</label>
                      <input 
                        type="text" 
                        required 
                        value={customQuestion} 
                        onChange={e => setCustomQuestion(e.target.value)} 
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:border-primary focus:outline-none" 
                        placeholder="Manually edit user question if needed..." 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Answer</label>
                      <textarea 
                        required 
                        value={customAnswer} 
                        onChange={e => setCustomAnswer(e.target.value)} 
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:border-primary focus:outline-none h-24 resize-none" 
                        placeholder="Manually enter correct support answer..." 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Status</label>
                      <select 
                        required 
                        value={customStatus} 
                        onChange={e => setCustomStatus(e.target.value)} 
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:border-primary focus:outline-none appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_10px_center] bg-no-repeat pr-10"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setPromoteOpen(false)} className="flex-1 py-2.5 bg-white border-gray-200 hover:bg-white border-gray-200 text-gray-900 rounded-xl font-medium transition-colors">Cancel</button>
                  <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-colors disabled:opacity-50">
                    {submitting ? 'Promoting...' : 'Promote & Add'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
