import { validateStorageModel, type StorageModel } from '../../src/storage-model';
export const mixedStorage: StorageModel = validateStorageModel({ version: 1, units: [
  { id: 'files', kind: 'blob', name: 'Application files', provider: 'S3', items: [
    { id: 'originals', name: 'original-documents', keyPattern: '{org_id}/{document_id}.pdf', contentType: 'application/pdf', access: 'private', records: [{key:'org-1/doc-1.pdf',content_type:'application/pdf',size_bytes:4096,metadata:{document_id:'doc-1'}}], note: 'Original bytes, including text like */ safely.' },
    { id: 'previews', name: 'public-previews', access: 'public', contentType: 'image/*' },
  ] },
  { id: 'enrichment', kind: 'document', name: 'Document enrichment', provider: 'MongoDB', items: [
    { id: 'summaries', name: 'summaries', records: [{document_id:'doc-1',summary:'A concise document summary',metadata:{language:'en',reviewed:false},chunks:[{text:'First paragraph',score:0}],optional:null}], shape: JSON.stringify({ document_id: 'uuid', summary: 'string', metadata: { language: 'string' }, chunks: [{ text: 'string', score: 'number' }] }) },
  ] },
  { id: 'cache', kind: 'kv', name: 'Application cache', provider: 'Redis', items: [
    { id: 'summaries', name: 'summary-cache', keyPattern: 'summary:{document_id}', ttl: '24 hours', records:[{key:'summary:doc-1',value:{summary:'A concise document summary',updated_at:'2026-10-13'}}], shape: '{"summary":"string","updated_at":"timestamp"}' },
  ] },
], links: [
  { id: 'original', from: { node: 'public.documents', port: 'object_key' }, to: { node: 'storage:files', port: 'originals' }, label: 'locates original file' },
  { id: 'enriched', from: { node: 'public.documents', port: 'id' }, to: { node: 'storage:enrichment', port: 'summaries/document_id' }, kind: 'sync', label: 'document_id', direction: 'both' },
  { id: 'cached', from: { node: 'storage:enrichment', port: 'summaries' }, to: { node: 'storage:cache', port: 'summaries' }, kind: 'cache' },
] });
