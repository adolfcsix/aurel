import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const importPanel=readFileSync(new URL('../src/components/ImportPanel.jsx',import.meta.url),'utf8');
const dossier=readFileSync(new URL('../src/components/PropertyDossier.jsx',import.meta.url),'utf8');
const catalog=readFileSync(new URL('../src/components/SpatialCatalog.jsx',import.meta.url),'utf8');
const bulk=readFileSync(new URL('../src/components/BulkUnitPanel.jsx',import.meta.url),'utf8');
test('V2.0 spatial CRUD buttons are connected to existing authenticated React editor and save flow',()=>{
 for(const kind of ['floor','room']){
  assert.match(app,new RegExp("case '"+kind+"':return"));
  assert.match(app,new RegExp(""+kind+":'"));
  assert.match(app,new RegExp("'Thêm "+(kind==='floor'?'tầng':'phòng')+"'"));
 }
 assert.match(app,/import SpatialCatalog/);
 assert.match(app,/floor:'floors',room:'rooms'/);
 assert.match(catalog,/onOpen\(name,record\)/);
 assert.match(catalog,/onArchive\(name,record\)/);
 assert.match(catalog,/orphanBuildings/);
});
test('V2.0 editor and dossier expose independent and optional furniture inventory description',()=>{
 assert.match(app,/interiorStatus:'',interiorNotes:''/);
 assert.match(app,/Tình trạng nội thất/);
 assert.match(app,/Ghi chú nội thất/);
 assert.match(dossier,/unit\.interiorStatus/);
 assert.match(dossier,/unit\.interiorNotes/);
 assert.match(importPanel,/interior:'Nội thất'/);
});
test('V2.0 bulk actions for interiors have matching backend implementation',()=>{
 assert.match(bulk,/key:'interiorStatus'/);
 assert.match(bulk,/key:'interiorNotes'/);
 const backend=readFileSync(new URL('../../backend/src/bulk-units.js',import.meta.url),'utf8');
 assert.match(backend,/'interiorStatus','interiorNotes'/);
 assert.match(backend,/floorId/);
 assert.match(backend,/roomId/);
});
