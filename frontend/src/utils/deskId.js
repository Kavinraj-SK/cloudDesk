export function generateDeskId() {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

export function formatDeskId(id) {
  if (!id) return '';
  // Format as XXX XXX XXX
  return id.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
}

export function cleanDeskId(id) {
  return id.replace(/\s/g, '');
}
