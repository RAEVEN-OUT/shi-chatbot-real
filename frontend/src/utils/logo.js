export function getLogoUrl(path, fallback = null) {
  const getUrl = (val) => {
    if (val && typeof val === 'object' && val.src) {
      return val.src;
    }
    return val;
  };

  const resolvedPath = getUrl(path);
  const resolvedFallback = getUrl(fallback);

  if (!resolvedPath) return resolvedFallback;
  if (typeof resolvedPath !== 'string') return resolvedFallback;
  if (resolvedPath.startsWith('http') || resolvedPath.startsWith('data:') || resolvedPath.startsWith('blob:')) return resolvedPath;
  let baseUrl = 'http://localhost:8000';
  if (typeof process !== 'undefined' && process.env) {
    baseUrl = process.env.NEXT_PUBLIC_WITHOUT_API_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, '') || baseUrl;
  }
  return `${baseUrl.replace(/\/+$/, '')}/${resolvedPath.replace(/^\/+/, '')}`;
}
