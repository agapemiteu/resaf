export function demoEntry(search) {
  const resource = new URLSearchParams(search).get('resource');
  return /^demo-[a-zA-Z0-9-]{1,58}$/.test(resource || '')
    ? resource
    : 'demo-resource-001';
}
