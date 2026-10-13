import { validateStorageModel, type StorageModel } from '../../src/storage-model';
export const mixedStorage: StorageModel = validateStorageModel({ version: 1, units: [
  { id: 'files', kind: 'blob', name: 'Application files', provider: 'S3', items: [
    { id: 'originals', name: 'original-documents', keyPattern: '{org_id}/{document_id}.pdf', contentType: 'application/pdf', access: 'private', note: 'Original bytes, including text like */ safely.' },
    { id: 'previews', name: 'public-previews', access: 'public', contentType: 'image/*' },
  ] },
  { id: 'enrichment', kind: 'document', name: 'Document enrichment', provider: 'MongoDB', items: [
    { id: 'summaries', name: 'summaries', shape: JSON.stringify({ document_id: 'uuid', summary: 'string', metadata: { language: 'string' }, chunks: [{ text: 'string', score: 'number' }] }) },
  ] },
  { id: 'cache', kind: 'kv', name: 'Application cache', provider: 'Redis', items: [
    { id: 'summaries', name: 'summary-cache', keyPattern: 'summary:{document_id}', ttl: '24 hours', shape: '{"summary":"string","updated_at":"timestamp"}' },
  ] },
], links: [
  { id: 'original', from: { node: 'public.documents', port: 'object_key' }, to: { node: 'storage:files', port: 'originals' }, label: 'locates original file' },
  { id: 'enriched', from: { node: 'public.documents', port: 'id' }, to: { node: 'storage:enrichment', port: 'summaries/document_id' }, kind: 'sync', label: 'document_id', direction: 'both' },
  { id: 'cached', from: { node: 'storage:enrichment', port: 'summaries' }, to: { node: 'storage:cache', port: 'summaries' }, kind: 'cache' },
] });
