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


export function TreeNode({ type, data, nodePath, depth, expandedNodes, toggleNode, selectNode, selectedNode, loadingNode, domainCategoryMap, categories, documents, scopedDomainId, openModal }) {
  const isExpanded = !!expandedNodes[nodePath];
  const isSelected = selectedNode?.id === data.id;
  const isLoading = !!loadingNode[nodePath];
  let children = [];
  let childType = '';
  let count = 0;
  
  if (type === 'domain') { 
    childType = 'folder'; 
    children = [
      { id: `cat_folder_${data.id}`, isFolder: true, folderType: 'category', name: 'Categories', domain_id: data.id, domain: data },
      { id: `doc_folder_${data.id}`, isFolder: true, folderType: 'document', name: 'Documents', domain_id: data.id, domain: data }
    ];
    count = 2;
  }
  else if (type === 'folder' && data.folderType === 'category') {
    childType = 'category';
    children = categories.filter(c => (domainCategoryMap[data.domain_id] || []).map(String).includes(String(c.id)));
    count = children.length;
  }
  else if (type === 'folder' && data.folderType === 'document') {
    childType = 'document';
    children = documents ? documents.filter(d => d.domain_id === data.domain_id) : [];
    count = children.length;
  }
  else if (type === 'category') { 
    childType = 'question'; 
    children = data.questions || []; 
    count = children.length;
  }

  let childTypeDisplay = '';
  if (childType === 'folder') childTypeDisplay = 'folders';
  else if (childType === 'category') childTypeDisplay = count === 1 ? 'category' : 'categories';
  else if (childType === 'document') childTypeDisplay = count === 1 ? 'document' : 'documents';
  else childTypeDisplay = count === 1 ? 'question' : 'questions';

  const hasChildren = type !== 'question' && type !== 'document';
  const getIcon = () => {
    if(type === 'domain') {
      if (scopedDomainId) return null;
      return <Globe className="h-4 w-4 text-blue-400 shrink-0" />;
    }
    if(type === 'folder') return <Folder className="h-4 w-4 text-gray-400 shrink-0" />;
    if(type === 'category') return <Tag className="h-4 w-4 text-purple-400 shrink-0" />;
    if(type === 'document') return <FileText className="h-4 w-4 text-emerald-400 shrink-0" />;
    return <MessageCircle className="h-4 w-4 text-amber-400 shrink-0" />;
  };
  
  let title = type === 'domain' ? (data.domain_url || data.name) : type === 'folder' ? data.name : type === 'category' ? data.faq_title : type === 'document' ? data.source_title : data.question;

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
        <div className="flex flex-1 items-center gap-2 truncate" onClick={() => {selectNode(type, data.id, data); if (hasChildren && !isExpanded) toggleNode(nodePath, type, data.id);}}>  
          {getIcon()}
          <span title={title} className={`truncate text-sm ${isSelected ? 'text-blue-700 font-bold' : 'text-gray-700'}`}>{title}</span>
          {hasChildren && <span className="text-[10px] text-gray-500 ml-auto mr-1 bg-gray-50 px-1.5 py-0.5 rounded shrink-0">{count} {childTypeDisplay}</span>}
        </div>
      </div>
      
      {isExpanded && hasChildren && (
        <div className="relative mt-1">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-100/50 -z-10"></div>
          <div className="pl-6 space-y-0.5 pb-1">
            {type === 'folder' && data.folderType === 'category' && (
              <div className="relative mb-1">
                <button 
                  onClick={() => openModal && openModal('create_category', { domain_id: data.domain_id })}
                  className="flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 py-1.5 px-2 w-full text-left rounded-lg transition-colors border border-dashed border-blue-200"
                >
                  <Plus size={14} /> Create Category
                </button>
              </div>
            )}
            {type === 'folder' && data.folderType === 'document' && (
              <div className="relative mb-1">
                <button 
                  onClick={() => openModal && openModal('document_upload', { domain_id: data.domain_id })}
                  className="flex items-center gap-2 text-xs font-medium text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 py-1.5 px-2 w-full text-left rounded-lg transition-colors border border-dashed border-emerald-200"
                >
                  <UploadCloud size={14} /> Upload Document
                </button>
              </div>
            )}
            {children.map(child => (
              <div key={child.id} className="relative">
                <div className="absolute left-[-8px] top-[14px] w-3 h-px bg-gray-100/50 -z-10"></div>
                <TreeNode type={childType === 'folder' ? 'folder' : childType} data={child} nodePath={`${nodePath}-${childType.charAt(0)}_${child.id}`} depth={depth + 1} expandedNodes={expandedNodes} toggleNode={toggleNode} selectNode={selectNode} selectedNode={selectedNode} loadingNode={loadingNode} domainCategoryMap={domainCategoryMap} categories={categories} documents={documents} scopedDomainId={scopedDomainId} openModal={openModal} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Tabs({ tabs, activeTab, onChange }) {
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