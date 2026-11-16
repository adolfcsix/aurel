const month='2026-11';
export const seed = () => {
 const demo = ({
  version: 1,
  projects: [
    {id:'imperia', name:'Imperia Smart City',short:'IM',city:'Hà Nội',buildings:['I1','I2','I4']},
    {id:'rose',name:'Rose Town',short:'RT',city:'Hà Nội',buildings:['DV02','DV03','DV04']},
    {id:'hatay',name:'Hatay Millennium',short:'HM',city:'Hà Nội',buildings:['A','B']}
  ],
  staff: [
    {id:'s1',name:'Nguyễn Minh Anh',short:'MA',role:'Quản lý danh mục',color:'#8FA9A2'},
    {id:'s2',name:'Trần Hoài Nam',short:'HN',role:'Sale',color:'#D7B999'},
    {id:'s3',name:'Lê Khánh Linh',short:'KL',role:'Chăm sóc khách hàng',color:'#ABBACB'},
    {id:'s4',name:'Phạm Ngọc Hà',short:'NH',role:'Quản lý danh mục',color:'#BCA8B7'}
  ],
  units: [
    {id:'u1',code:'I2-2616',projectId:'imperia',building:'I2',floor:'26',room:'16',address:'',area:78,bedrooms:2,owner:'Chủ sở hữu A',tenant:'Khách thuê A',rent:10700000,renewalRent:10200000,feePercent:6,feeBasis:'due',deposit:21400000,depositReturned:0,status:'occupied',managerId:'s1',saleId:'s2',leaseStart:'2026-01-12',leaseEnd:'2026-11-24',paymentDay:12,notes:'Đã trao đổi gia hạn',createdAt:'2026-01-12'},
    {id:'u2',code:'DV02-2104',projectId:'rose',building:'DV02',floor:'21',room:'04',address:'',area:64,bedrooms:2,owner:'Chủ sở hữu B',tenant:'Khách thuê B',rent:9500000,renewalRent:null,feePercent:6,feeBasis:'due',deposit:19000000,depositReturned:0,status:'occupied',managerId:'s2',saleId:'s2',leaseStart:'2026-01-25',leaseEnd:'2027-01-24',paymentDay:25,notes:'Thanh toán theo hai đợt',createdAt:'2026-01-25'},
    {id:'u3',code:'DV02-2408',projectId:'rose',building:'DV02',floor:'24',room:'08',address:'',area:71,bedrooms:2,owner:'Chủ sở hữu B',tenant:'Khách thuê C',rent:11500000,renewalRent:null,feePercent:6,feeBasis:'paid',deposit:23000000,depositReturned:0,status:'occupied',managerId:'s3',saleId:'s2',leaseStart:'2026-03-02',leaseEnd:'2027-03-01',paymentDay:2,notes:'',createdAt:'2026-03-02'},
    {id:'u4',code:'B4001',projectId:'hatay',building:'B',floor:'40',room:'01',address:'',area:86,bedrooms:3,owner:'Chủ sở hữu C',tenant:'Khách thuê D',rent:9500000,renewalRent:null,feePercent:3.7,feeBasis:'due',deposit:19000000,depositReturned:0,status:'occupied',managerId:'s4',saleId:'s2',leaseStart:'2026-07-07',leaseEnd:'2027-07-06',paymentDay:7,notes:'',createdAt:'2026-07-07'},
    {id:'u5',code:'A3512',projectId:'hatay',building:'A',floor:'35',room:'12',address:'',area:66,bedrooms:2,owner:'Chủ sở hữu D',tenant:'Khách thuê E',rent:9500000,renewalRent:null,feePercent:6,feeBasis:'due',deposit:19000000,depositReturned:0,status:'occupied',managerId:'s4',saleId:'s3',leaseStart:'2026-01-19',leaseEnd:'2027-01-18',paymentDay:19,notes:'',createdAt:'2026-01-19'},
    {id:'u6',code:'DV04-2003',projectId:'rose',building:'DV04',floor:'20',room:'03',address:'',area:93,bedrooms:3,owner:'Chủ sở hữu E',tenant:'',rent:11000000,renewalRent:null,feePercent:3,feeBasis:'due',deposit:0,depositReturned:0,status:'vacant',managerId:'s1',saleId:'s3',leaseStart:'',leaseEnd:'',paymentDay:10,notes:'Đang tìm khách thuê',createdAt:'2026-10-15'},
    {id:'u7',code:'I1-3302',projectId:'imperia',building:'I1',floor:'33',room:'02',address:'',area:76,bedrooms:2,owner:'Chủ sở hữu F',tenant:'Khách thuê F',rent:10000000,renewalRent:10000000,feePercent:6,feeBasis:'due',deposit:20000000,depositReturned:0,status:'occupied',managerId:'s1',saleId:'s2',leaseStart:'2025-11-03',leaseEnd:'2026-11-19',paymentDay:3,notes:'Cần xác nhận gia hạn',createdAt:'2025-11-03'},
    {id:'u8',code:'B3503',projectId:'hatay',building:'B',floor:'35',room:'03',address:'',area:82,bedrooms:2,owner:'Chủ sở hữu C',tenant:'Khách thuê G',rent:14000000,renewalRent:null,feePercent:3.7,feeBasis:'paid',deposit:28000000,depositReturned:0,status:'occupied',managerId:'s4',saleId:'s3',leaseStart:'2026-05-26',leaseEnd:'2027-05-25',paymentDay:26,notes:'',createdAt:'2026-05-26'}
  ],
  payments: [
    {id:'pay1',unitId:'u1',period:month,amount:5000000,date:'2026-11-08',method:'Chuyển khoản',note:'Đợt 1'},
    {id:'pay2',unitId:'u2',period:month,amount:4750000,date:'2026-11-04',method:'Chuyển khoản',note:'Đợt 1/2'},
    {id:'pay3',unitId:'u3',period:month,amount:11500000,date:'2026-11-02',method:'Chuyển khoản',note:''},
    {id:'pay4',unitId:'u4',period:month,amount:9500000,date:'2026-11-07',method:'Tiền mặt',note:''},
    {id:'pay5',unitId:'u5',period:month,amount:9500000,date:'2026-11-05',method:'Chuyển khoản',note:''},
    {id:'pay6',unitId:'u7',period:month,amount:10000000,date:'2026-11-03',method:'Chuyển khoản',note:''}
  ],
  depositTransactions: [],
  audit: [],
  preferences: {company:'AUREL Property',defaultFee:6,reminderDays:5}
});
 // Synthetic demonstration records only. Never treat unit.deposit in a saved
 // business dossier as evidence that cash was actually received.
 demo.depositTransactions=demo.units
  .filter(unit=>unit.deposit>0&&unit.leaseStart&&unit.leaseEnd)
  .map(unit=>({id:`demo-deposit-${unit.id}`,leaseId:`lease-${unit.id}`,
   unitId:unit.id,kind:'receive',amount:unit.deposit,date:unit.leaseStart,
   demoOnly:true,note:'DỮ LIỆU MẪU — không phải chứng từ thu tiền thực tế'}));
 return demo;
};
