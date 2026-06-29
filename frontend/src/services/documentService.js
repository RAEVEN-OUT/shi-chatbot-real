import api from "@/utils/api";

/**
 * Upload a document file for RAG ingestion.
 * @param {File} file - .pdf, .txt, or .docx file
 * @param {string|null} domainId - optional domain scope
 * @param {string|null} sourceTitle - optional human-readable name
 */
export async function uploadDocument(file, domainId = null, sourceTitle = null) {
  const formData = new FormData();
  formData.append("file", file);
  if (domainId) formData.append("domain_id", domainId);
  if (sourceTitle) formData.append("source_title", sourceTitle);

  const res = await api.post("/documents/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

/**
 * Poll the ingestion status of a single document.
 */
export async function getDocumentStatus(docId) {
  const res = await api.get(`/documents/${docId}/status`);
  return res.data;
}

/**
 * List all documents for the organisation.
 * @param {string|null} domainId - optional domain filter
 */
export async function listDocuments(domainId = null) {
  const params = domainId ? { domain_id: domainId } : {};
  const res = await api.get("/documents", { params });
  return res.data;
}

/**
 * Delete a document and all its vector chunks.
 */
export async function deleteDocument(docId) {
  const res = await api.delete(`/documents/${docId}`);
  return res.data;
}
