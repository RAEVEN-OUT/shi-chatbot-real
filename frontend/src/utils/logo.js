export function getLogoUrl(path, fallback = null) {
  if (!path) return fallback;
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) return path;
  let baseUrl = 'http://localhost:8000';
  if (typeof process !== 'undefined' && process.env) {
    baseUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || baseUrl;
  }
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
