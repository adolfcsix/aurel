import React from 'react';
import {Icon} from './Ui.jsx';
import {portfolioReview} from '../lib/portfolio-review.js';

/** Actionable portfolio completeness view; never rejects a draft or writes data. */
export default function PortfolioReviewStrip({units,active,onToggle}){
 const view=portfolioReview(units);
 return <section className={'portfolio-review-strip'+(active?' portfolio-review-active':'')} aria-label="Kiểm tra hồ sơ chưa đầy đủ">
  <div className="portfolio-review-leading"><span className="portfolio-review-kicker">DANH MỤC / CHẤT LƯỢNG HỒ SƠ</span><h3>Hồ sơ cần bổ sung</h3><p>Không bắt buộc điền tất cả trường khi tạo căn hộ. Những mục này chỉ giúp quản lý dễ tìm hồ sơ cần hoàn thiện.</p></div>
  <div className="portfolio-review-numbers"><div><strong>{view.ready}</strong><span>Đã đủ thông tin lõi</span></div><div><strong>{view.needs}</strong><span>Cần rà soát</span></div></div>
  <div className="portfolio-review-action"><button type="button" className="portfolio-review-button" aria-pressed={active} onClick={onToggle}>{active?'Xem tất cả căn hộ':'Lọc hồ sơ cần bổ sung'} <Icon name="chevron" size={15}/></button>{view.topReasons.length>0&&<small>Thiếu phổ biến: {view.topReasons.map(item=>`${item.name} (${item.count})`).join(' · ')}</small>}</div>
 </section>;
}
