import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function ModalWrapper({ isOpen, onClose, title, children, icon: Icon, iconColor }) {
  if (!isOpen) return null;
  const modalContent = (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm ">
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-white/50 rounded-t-xl shrink-0">
          <div className="flex items-center gap-3">
            {Icon && <Icon className={`h-6 w-6 ${iconColor}`} />}
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
  return createPortal(modalContent, document.body);
}
