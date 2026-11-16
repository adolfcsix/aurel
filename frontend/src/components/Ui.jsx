import React,{useId} from 'react';
import {inputAttributes} from '../lib/atelier-fields.js';
import {actionIntent} from '../lib/action-presentation.js';
const icons={
 dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 building:'M3 21V5l9-3 9 3v16 M9 21v-5h6v5 M7 8h.01 M12 8h.01 M17 8h.01 M7 12h.01 M12 12h.01 M17 12h.01 M2 21h20',
 document:'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5H8z M14 3v6h6 M7 13h10 M7 17h8',
 payments:'M3 6h18v12H3z M3 10h18 M7 15h3',
 percent:'M19 5 5 19 M8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M20 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
 bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
 wallet:'M4 6h15a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h13 M16 13h5 M16 13h.01',
 people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
 chart:'M3 3v18h18 M7 16l5-5 4 3 5-7',
 settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2 2-.07-.05A1.7 1.7 0 0 0 15.8 19.2h-.1V22h-3v-.1a1.7 1.7 0 0 0-1.5-1.7h-.08L9.4 22l-2.1-2.1a1.7 1.7 0 0 0 .2-1.9l-.05-.08L5 17v-3h.1a1.7 1.7 0 0 0 1.7-1.5v-.08L5 10.6 7.1 8.5a1.7 1.7 0 0 0 1.9.2l.08-.05L10 6V3h3v.1a1.7 1.7 0 0 0 1.5 1.7h.08L16.4 3l2.1 2.1a1.7 1.7 0 0 0-.2 1.9l.05.08L21 8v3h-.1a1.7 1.7 0 0 0-1.7 1.5v.08L21 14.4l-1.6.6z',
 search:'m21 21-4.35-4.35 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
 chevron:'m9 18 6-6-6-6', arrowRight:'M5 12h14 M13 6l6 6-6 6', plus:'M12 5v14 M5 12h14', filter:'M4 7h16 M7 12h10 M10 17h4',
 up:'M7 17 17 7 M8 7h9v9', down:'M7 7l10 10 M17 8v9H8', calendar:'M3 6h18v15H3z M8 3v6 M16 3v6 M3 11h18',
 download:'M12 3v12 m-4-4 4 4 4-4 M5 17v4h14v-4', dots:'M5 12h.01 M12 12h.01 M19 12h.01',
 edit:'M12 20h9 M5 15l10-10 4 4-10 10H5z M14 6l4 4',trash:'M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
 x:'M18 6 6 18 M6 6l12 12', check:'M4 12l5 5L20 6',menu:'M4 6h16 M4 12h16 M4 18h16',
 clock:'M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
 trend:'m3 17 6-6 4 4 8-8 M15 7h6v6', archive:'M3 4h18v5H3z M5 9v12h14V9 M10 13h4',
 external:'M14 3h7v7 M10 14 21 3 M21 13v8H3V3h8', lock:'M5 10V7a7 7 0 0 1 14 0v3 M4 10h16v12H4z M12 14v4',
 shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
 copy:'M9 3h12v14H9z M5 7H3v14h12v-2', layers:'M12 2 2 7l10 5 10-5z M2 12l10 5 10-5 M2 17l10 5 10-5',
 alert:'M12 9v4 M12 17h.01 M10.3 3.8 2 18.2a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z',
 save:'M4 3h14l3 3v15H3V3z M7 3v6h10V3 M7 21v-8h10v8',
 user:'M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
 back:'m15 18-6-6 6-6', pin:'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
 apartment:'M4 22V2h16v20 M9 7h2 M15 7h2 M9 12h2 M15 12h2 M9 17h2 M15 17h2 M2 22h20',
 refresh:'M20 11a8 8 0 0 0-14-5L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14 5l2-2 M20 20v-4h-4'
};

export function Icon({name,size=19,stroke=1.8,className=''}){return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]||icons.layers}/></svg>}
/** Maison action grammar. Geometry and semantics are stable across all dossiers. */
export function Btn({children,kind='secondary',icon,disabled,onClick,type='button',title,busy=false,ariaLabel,finish='standard',intent='standard'}){
 const pearl=finish==='pearl'&&type==='button'&&!['danger','dangerGhost'].includes(kind);
 const navigation=actionIntent({intent,icon,kind,type})==='navigate';
 return <button type={type} title={title} disabled={disabled||busy} aria-label={ariaLabel} aria-busy={busy||undefined} onClick={onClick}
  data-aurel-control="action" data-aurel-tone={kind} data-aurel-intent={navigation?'navigate':'standard'}
  data-aurel-finish={pearl?'pearl':'satin'}
  className={'btn aurel-refined-action '+kind+(pearl?' aurel-pearl-control':'')+(busy?' is-busy':'')}>
  {icon&&(!navigation||icon!=='arrowRight')&&<span className="aurel-btn-leading" aria-hidden="true"><Icon name={icon} size={16} stroke={1.75}/></span>}
  <span className="aurel-btn-copy">{children}</span>
  {navigation&&<span className="aurel-btn-tail" aria-hidden="true"><Icon name="arrowRight" size={15} stroke={1.65}/></span>}
 </button>;
}

export function Status({value}){const info={draft:['Bản nháp','neutral'],vacant:['Còn trống','info'],occupied:['Đang cho thuê','success'],ended:['Đã kết thúc','neutral'],active:['Đang hoạt động','success'],open:['Chưa hoàn tất','warn'],archived:['Đã lưu trữ','neutral'],cancelled:['Đã hủy kỳ thu','neutral'],posted:['Đã ghi nhận','success'],reversed:['Đã đảo giao dịch','danger']};const [label,tone]=info[value]||[value||'Chưa rõ','neutral'];return <span className={'tag '+tone}><i/>{label}</span>}
export function Empty({label='Chưa có dữ liệu',help='Chưa có thông tin để hiển thị.'}){return <div className="empty-state"><Icon name="layers" size={26}/><strong>{label}</strong><span>{help}</span></div>}
export function Metric({label,value,note,icon}){return <div className="vmetric"><div className="vmetric-top"><span>{label}</span><Icon name={icon} size={18}/></div><strong>{value}</strong><span className="vmetric-note">{note}</span></div>}
export function Table({columns,rows,onRow,empty}){return <div className="table-frame" tabIndex={0} role="region" aria-label="Bảng dữ liệu, cuộn ngang để xem các cột còn lại"><table className="data-grid"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr tabIndex={onRow?0:undefined} role={onRow?'button':undefined} onClick={e=>{if(e.target.closest('button,a,input,select,textarea,[role=button]'))return;if(typeof onRow==='function')onRow(row)}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(typeof onRow==='function'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onRow(row)}}} key={row.id||index}>{columns.map(c=><td key={c.key} data-label={c.label}><div className={c.strong?'strong-cell':''}>{c.render?c.render(row):row[c.key]??'—'}</div></td>)}</tr>)}</tbody></table>{!rows.length&&<Empty label={empty||'Không có hồ sơ phù hợp'}/>}</div>}
export function Field({field,value,onChange,options=[]}){
 const reactId=useId(),id='aurel-field-'+reactId,hintId=id+'-hint';
 const description=field.help||'';
 const common={id,required:!!field.required,'aria-describedby':description?hintId:undefined,className:'field-input',value:value??'',onChange:e=>onChange(e.target.value)};
 const placeholder=field.placeholder||'';
 const fieldInput=inputAttributes(field);
 return <div className={'form-field '+(field.wide?'span-full':'')}>
  <label htmlFor={id}>{field.label}{field.required?<span className="required" aria-label="Bắt buộc"> *</span>:null}</label>
  {field.type==='select'?<select {...common}><option value="">{placeholder||'Chọn thông tin phù hợp'}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:field.type==='textarea'?<textarea {...common} className="field-input textarea" rows={3} placeholder={placeholder}/>:<input {...common} type={fieldInput.type} step={field.step} min={field.min} max={field.max} placeholder={placeholder} inputMode={fieldInput.inputMode} autoComplete={fieldInput.autoComplete} spellCheck={fieldInput.spellCheck}/>}
  {description&&<small id={hintId}>{description}</small>}
 </div>
}
