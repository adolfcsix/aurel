import React from 'react';
import {Icon} from './Ui.jsx';
import {estateJourney} from '../lib/estate-journey.js';

export default function EstateJourney({unit,data,tab,onTab,onAction,can,showFinancial}){
 const journey=estateJourney(unit,data,{can,showFinancial});
 const follow=()=>{
  if(journey.next.action==='lease')onAction('lease',null,{unitId:unit.id,subtitle:unit.code||'Căn hộ'});
  else if(journey.next.action==='edit-lease')onAction('lease',journey.next.record,{subtitle:unit.code||'Căn hộ'});
  else if(journey.next.action==='payment')onAction('payment',null,{schedule:journey.next.schedule,subtitle:(unit.code||'Căn hộ')+' · '+journey.next.schedule.period});
  else onTab(journey.next.tab);
 };
 return <section className="aurel-journey" aria-label="Hành trình xử lý hồ sơ"><div className="aurel-journey-top"><span className="aurel-journey-overline">RECORD CONTINUITY / HỒ SƠ LIÊN THÔNG</span><span className="aurel-journey-privacy"><Icon name="shield" size={14}/> Dữ liệu theo quyền truy cập</span></div><div className="aurel-journey-steps">{journey.stages.map(stage=><button key={stage.tab} type="button" className={'aurel-journey-stage '+(tab===stage.tab?'is-current':'')} onClick={()=>onTab(stage.tab)} aria-current={tab===stage.tab?'step':undefined}><span className="aurel-journey-index">{stage.number}</span><span className="aurel-journey-stage-copy"><strong>{stage.label}</strong><small>{stage.status}</small></span><Icon name="chevron" size={15}/></button>)}</div><div className="aurel-journey-next"><div><span>ĐỀ XUẤT TIẾP THEO</span><strong>{journey.next.label}</strong><small>{journey.next.hint}</small></div><button type="button" onClick={follow}>{journey.next.action?'Tiếp tục xử lý':'Mở mục hồ sơ'}<Icon name="arrowRight" size={17}/></button></div></section>;
}
