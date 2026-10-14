import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownNote, NoteView } from '../src/NoteView';
const render = (text:string) => renderToStaticMarkup(createElement(MarkdownNote,{text}));
test('notes render Markdown blocks, GFM tables, tasks, links and code safely',()=>{
 const html=render('# Purpose\n\n**Bold** and *italic*, ~~old~~.\n\n- [x] Ready\n- Item\n\n> Quoted\n\n```sql\nSELECT 1;\n```\n\n| Column | Meaning |\n| --- | --- |\n| id | Key |\n\n[Docs](https://example.com)');
 for(const tag of ['<h1>Purpose</h1>','<strong>Bold</strong>','<em>italic</em>','<del>old</del>','<blockquote>','<table>','<th>Column</th>','<pre>','language-sql','type="checkbox"','target="_blank"','rel="noopener noreferrer"'])assert.ok(html.includes(tag),tag);
 const unsafe=render('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![bad](data:text/html,evil)');
 assert.ok(!unsafe.includes('<script'));assert.ok(!unsafe.includes('href="javascript:'));assert.ok(!unsafe.includes('src="data:'));
});
test('note icons provide an accessible open action and are disabled while dragging',()=>{
 const html=renderToStaticMarkup(createElement(NoteView,{title:'public.users.id',text:'A note',icon:createElement('span',{},'note'),disabled:true}));
 assert.ok(html.includes('aria-label="Open note for public.users.id"'));assert.ok(html.includes('disabled=""'));assert.ok(html.includes('nodrag nopan'));
});
