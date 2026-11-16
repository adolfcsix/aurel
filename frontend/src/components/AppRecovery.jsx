import React from 'react';
import {Btn,Icon} from './Ui.jsx';

/** Render failures leave an accessible recovery screen rather than a blank page. */
export default class AppRecovery extends React.Component {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){
  if(!this.state.failed)return this.props.children;
  return <main className="loading-screen aurel-recovery" role="alert">
   <Icon name="shield" size={32}/><h1>Chưa thể hiển thị không gian làm việc</h1>
   <p>Hãy tải lại ứng dụng. Nếu vừa lưu hoặc ghi nhận giao dịch, cần mở hồ sơ để đối chiếu trước khi thao tác tiếp.</p>
   <Btn kind="primary" icon="refresh" onClick={()=>window.location.reload()}>Tải lại ứng dụng</Btn>
  </main>;
 }
}
