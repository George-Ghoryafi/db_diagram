import { arrangeTables, type Arrangement } from '../src/layout.js';
import { compositeEndpoints, relationshipField } from '../src/composite-relationships.js';
import { storageNodeHeight, storageNodeId, storagePorts, storageLinkIssue } from '../src/storage-model.js';
import { parseSchema, SchemaError } from './schema.js';
import type { Layout } from './storage.js';

export function layoutModel(dbml: string) {
  const model = parseSchema(dbml);
  const items = [
    ...model.tables.map(table => {
      let height = 33 + table.fields.length * 30;
      const fields = table.fields.map((field,index)=>({ name:field.name, y:48+index*30 }));
      for (const tuple of compositeEndpoints(model.refs,table.id)) {
        const size = Math.max(30, Math.ceil(tuple.fields.join(', ').length * 6 / 236) * 16 + 12);
        fields.push({name:tuple.id,y:height+size/2}); height+=size;
      }
      return { id:table.id, width:260, height:height+(table.indexes.length?25:0), fields };
    }),
    ...model.storage.units.map(unit=>({id:storageNodeId(unit.id),width:300,height:storageNodeHeight(unit),fields:[{name:'header',y:25},...storagePorts(unit).map(port=>({name:port.port,y:96}))]})),
  ];
  const refs = [
    ...model.refs.map(ref=>({...ref,fromFields:[relationshipField(ref.fromFields)],toFields:[relationshipField(ref.toFields)]})),
    ...model.storage.links.filter(link=>!storageLinkIssue(link,model.storage.units,model.tables)).map(link=>({fromTable:link.from.node,toTable:link.to.node,fromFields:[link.from.port||'header'],toFields:[link.to.port||'header'],relation:link.direction==='both'?'*:*':'1:*'})),
  ];
  return {model,items,refs};
}
export function layoutBounds(items: ReturnType<typeof layoutModel>['items'], layout: Layout) {
  const boxes=items.flatMap(item=>layout[item.id]?[{x:layout[item.id].x,y:layout[item.id].y,width:item.width,height:item.height}]:[]);
  if(!boxes.length)return {x:0,y:0,width:0,height:0};
  const x=Math.min(...boxes.map(box=>box.x)),y=Math.min(...boxes.map(box=>box.y));
  return {x,y,width:Math.max(...boxes.map(box=>box.x+box.width))-x,height:Math.max(...boxes.map(box=>box.y+box.height))-y};
}
export async function arrangedLayout(dbml:string, mode:Arrangement, flows?: {from:string;to:string}[]) {
  const {model,items,refs}=layoutModel(dbml), ids=new Set(items.map(item=>item.id));
  if(flows?.some(flow=>!ids.has(flow.from)||!ids.has(flow.to)))throw new SchemaError('Flow endpoints must be qualified table IDs or storage:<store-id>.');
  const edges=flows ? flows.map(flow=>({fromTable:flow.from,toTable:flow.to,relation:'1:*'})) : refs;
  return arrangeTables(items,edges,model.groups,mode);
}
export function positionedLayout(dbml:string, previous:Layout, positions:Layout, groups:Layout, replace=false) {
  const {model,items}=layoutModel(dbml),ids=new Set(items.map(item=>item.id));
  if(Object.keys(positions).some(id=>!ids.has(id)))throw new SchemaError('Positions must name existing qualified table IDs or storage:<store-id>.');
  if(replace && Object.keys(groups).length)throw new SchemaError("For a complete layout replacement, use positions without group_positions.");
  const next=replace?{}:{...previous},moved=new Set<string>();
  for(const [name,point] of Object.entries(groups)){
    const group=model.groups.find(group=>group.name===name);
    if(!group)throw new SchemaError('Unknown table group: '+name);
    const members=group.tables.filter(id=>ids.has(id));
    if(!members.length)throw new SchemaError('The group has no tables: '+name);
    if(members.some(id=>moved.has(id)))throw new SchemaError('Requested groups share tables. Move them separately.');
    if(members.some(id=>!next[id]))throw new SchemaError('Arrange the diagram first so all group members have saved positions.');
    const x=Math.min(...members.map(id=>next[id].x))-22,y=Math.min(...members.map(id=>next[id].y))-38;
    for(const id of members){next[id]={x:next[id].x+point.x-x,y:next[id].y+point.y-y};moved.add(id);}
  }
  return {...next,...positions};
}
