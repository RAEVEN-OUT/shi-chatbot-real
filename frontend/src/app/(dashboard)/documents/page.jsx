"use client";
import { useState, useEffect, useRef } from "react";
import { uploadDocument, listDocuments, deleteDocument, getDocumentStatus } from "@/services/documentService";

const STATUS_COLORS = {
  ready: "bg-green-100 text-green-700",
  processing: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

const FILE_ICONS = { pdf: "📄", txt: "📝", docx: "📃" };

export default function DocumentsPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { name, status, docId }
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  // ── Load documents ─────────────────────────────────────────────────────────
  const fetchDocs = async () => {
    try {
      const data = await listDocuments();
      setDocs(data);
    } catch (e) {
      setError("Failed to load documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
    return () => clearInterval(pollRef.current);
  }, []);

  // ── Poll a processing document ─────────────────────────────────────────────
  const pollStatus = (docId) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await getDocumentStatus(docId);
        setUploadProgress((p) => ({ ...p, status: s.status, chunks: s.chunk_count }));
        if (s.status === "ready" || s.status === "failed") {
          clearInterval(pollRef.current);
          setUploading(false);
          await fetchDocs();
          setTimeout(() => setUploadProgress(null), 3000);
        }
      } catch {
        clearInterval(pollRef.current);
        setUploading(false);
      }
    }, 2000);
  };

  // ── Upload handler ─────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "txt", "docx"].includes(ext)) {
      setError("Only .pdf, .txt, and .docx files are supported.");
      return;
    }
    setError(null);
    setUploading(true);
    setUploadProgress({ name: file.name, status: "uploading", chunks: 0 });
    try {
      const res = await uploadDocument(file);
      setUploadProgress({ name: file.name, status: "processing", chunks: 0, docId: res.document_id });
      pollStatus(res.document_id);
    } catch (e) {
      setError(e?.response?.data?.detail || "Upload failed.");
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const onFileChange = (e) => handleFile(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  // ── Delete handler ─────────────────────────────────────────────────────────
  const handleDelete = async (docId, title) => {
    if (!window.confirm(`Delete "${title}" and all its knowledge chunks? This cannot be undone.`)) return;
    try {
      await deleteDocument(docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setError("Delete failed.");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Document Knowledge Base</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Upload PDFs, Word docs, or text files. The chatbot will use them to answer questions automatically.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`
          border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all mb-6
          ${dragOver ? "border-purple-500 bg-purple-50" : "border-gray-300 hover:border-purple-400 hover:bg-gray-50"}
          ${uploading ? "opacity-60 cursor-not-allowed" : ""}
        `}
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="font-medium text-gray-700">
          {uploading ? "Processing…" : "Drop a file here or click to browse"}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF · DOCX · TXT — up to 50 MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.docx"
          className="hidden"
          onChange={onFileChange}
          disabled={uploading}
        />
      </div>

      {/* Upload progress card */}
      {uploadProgress && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-4 shadow-sm">
          <span className="text-2xl">{FILE_ICONS[uploadProgress.name?.split(".").pop()] || "📄"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{uploadProgress.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {uploadProgress.status === "uploading" && "Uploading…"}
              {uploadProgress.status === "processing" && "Chunking & embedding — this may take a moment…"}
              {uploadProgress.status === "ready" && `✅ Ready — ${uploadProgress.chunks} chunks indexed`}
              {uploadProgress.status === "failed" && "❌ Ingestion failed"}
            </p>
          </div>
          {(uploadProgress.status === "processing" || uploadProgress.status === "uploading") && (
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 flex justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🗂️</div>
          <p className="font-medium">No documents yet</p>
          <p className="text-sm">Upload your first file above to start building your knowledge base.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <span className="text-2xl flex-shrink-0">{FILE_ICONS[doc.file_type] || "📄"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{doc.source_title}</p>
                <p className="text-xs text-gray-400 truncate">
                  {doc.filename}
                  {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(1)} KB` : ""}
                  {doc.chunk_count > 0 ? ` · ${doc.chunk_count} chunks` : ""}
                </p>
                {doc.error_message && (
                  <p className="text-xs text-red-500 mt-0.5 truncate">{doc.error_message}</p>
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-500"}`}>
                {doc.status}
              </span>
              <button
                onClick={() => handleDelete(doc.id, doc.source_title)}
                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none"
                title="Delete document"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
