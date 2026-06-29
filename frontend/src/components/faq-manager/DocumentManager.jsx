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


export function DocumentManager({ deletingId, document: docNode, documents, setDocuments, selectNode, handleDeleteNode }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({ source_title: docNode?.source_title || '' });
  const [fileToUpload, setFileToUpload] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setEditFormData({ source_title: docNode?.source_title || '' });
    setFileToUpload(null);
  }, [docNode]);

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditing(true);
    try {
      const res = await api.put(`/documents/${docNode.id}`, editFormData);
      const updatedDoc = res.data;
      setDocuments(prev => prev.map(d => d.id === docNode.id ? updatedDoc : d));
      showToast('Document updated', 'success');
      selectNode('document', docNode.id, updatedDoc);
    } catch (e) {
      showToast('Error updating document', 'error');
    } finally {
      setEditing(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileToUpload(e.target.files[0]);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFileToUpload(e.dataTransfer.files[0]);
    }
  };

  const handleReplaceFile = async () => {
    if (!fileToUpload) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);
      
      const res = await api.put(`/documents/${docNode.id}/file`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const updatedDoc = { 
        ...docNode, 
        status: 'processing', 
        filename: fileToUpload.name,
        file_size: fileToUpload.size
      };
      setDocuments(prev => prev.map(d => d.id === docNode.id ? updatedDoc : d));
      setFileToUpload(null);
      showToast('Document replacement started', 'success');
      selectNode('document', docNode.id, updatedDoc);
    } catch (e) {
      const msg = e.response?.data?.detail || 'Error replacing document';
      showToast(msg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  if (!docNode) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      <div className="flex-none p-6 pb-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100">
              <MessageCircle className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{docNode.source_title}</h2>
              <p className="text-sm text-gray-500">Manage Document</p>
            </div>
          </div>
          <button 
            onClick={() => handleDeleteNode('document', docNode.id, docNode.source_title)}
            disabled={deletingId === docNode.id}
            className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {deletingId === docNode.id ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-indigo-500" />
                Document Details
              </h3>
            </div>
            <div className="p-5">
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editFormData.source_title}
                    onChange={(e) => setEditFormData({...editFormData, source_title: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Filename</label>
                    <p className="text-sm text-gray-900 truncate">{docNode.filename}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                    <div className="flex items-center gap-1.5">
                      {docNode.status === 'ready' ? <Check className="h-4 w-4 text-emerald-500" /> : docNode.status === 'processing' || docNode.status === 'queued' ? <div className="h-3 w-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div> : <X className="h-4 w-4 text-red-500" />}
                      <span className={`text-sm font-medium capitalize ${docNode.status === 'ready' ? 'text-emerald-700' : docNode.status === 'processing' || docNode.status === 'queued' ? 'text-amber-600' : 'text-red-600'}`}>{docNode.status}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">File Size</label>
                    <p className="text-sm text-gray-900">{((docNode.file_size||0) / 1024).toFixed(1)} KB</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Chunks</label>
                    <p className="text-sm text-gray-900">{docNode.chunk_count||0}</p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={editing || editFormData.source_title === docNode.source_title}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {editing ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-indigo-500" />
                Replace File
              </h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-4">
                Uploading a new file will delete all existing extracted data and re-process the new file.
              </p>
              
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${fileToUpload ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50 cursor-pointer'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => !fileToUpload && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileChange}
                  accept=".pdf,.txt,.docx" 
                />
                
                {fileToUpload ? (
                  <div className="flex flex-col items-center">
                    <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center mb-3">
                      <Check className="h-6 w-6 text-indigo-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-900">{fileToUpload.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(fileToUpload.size / 1024).toFixed(1)} KB</p>
                    <div className="mt-4 flex gap-3">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFileToUpload(null); }}
                        className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleReplaceFile(); }}
                        disabled={isUploading}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isUploading ? 'Uploading...' : 'Replace File'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <UploadCloud className="h-10 w-10 text-gray-400 mb-3" />
                    <p className="text-sm font-medium text-gray-900">Click to upload or drag and drop</p>
                    <p className="text-xs text-gray-500 mt-1">PDF, TXT, DOCX up to 50MB</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}