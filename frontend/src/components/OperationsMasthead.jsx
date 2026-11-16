import React from 'react';

/** A compact editorial section header; keeps all existing CRUD and tables beneath it. */
export default function OperationsMasthead({section,chapter,kicker,title,emphasis,description,figures=[]}){
 return <section className={'aurel-ops aurel-ops--'+section} aria-label={title+' '+emphasis}>
  <div className="aurel-ops-main">
   <div className="aurel-ops-top"><span className="aurel-ops-chapter">{chapter}</span><span>{kicker}</span></div>
   <h2>{title}<em>{emphasis}</em></h2>
   <p>{description}</p>
   <div className="aurel-ops-rule" aria-hidden="true"><i/></div>
  </div>
  <div className="aurel-ops-stats" aria-label="Các chỉ số liên quan">
   {figures.map((item,index)=><div className="aurel-ops-stat" key={item.label}>
    <span className="aurel-ops-stat-no">{String(index+1).padStart(2,'0')}</span>
    <div><span className="aurel-ops-stat-name">{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>
   </div>)}
   <div className="aurel-ops-footnote">AUREL / VẬN HÀNH TÀI SẢN · DỮ LIỆU TỪ HỒ SƠ</div>
  </div>
 </section>;
}
