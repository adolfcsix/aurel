/** Presentation-only view models. Do not treat missing financial data as zero. */
export const hasRecordValue = value => value !== null && value !== undefined && String(value).trim() !== '';
export const unitLocation = (unit,buildingFallback='') => [
  hasRecordValue(unit?.building) ? `Tòa ${unit.building}` : (hasRecordValue(buildingFallback) ? `Tòa ${buildingFallback}` : ''),
  hasRecordValue(unit?.floor) ? `Tầng ${unit.floor}` : '',
  hasRecordValue(unit?.room) ? `Phòng ${unit.room}` : ''
].filter(Boolean).join(' · ') || 'Chưa cập nhật vị trí';
export const feeLabel = unit => hasRecordValue(unit?.feePercent) ? `${unit.feePercent}%` : 'Chưa thiết lập';
export function recordFinancial(unit, formatter) {
  return hasRecordValue(unit?.rent) ? formatter(unit.rent) : 'Chưa có giá thuê';
}
export function contractDuration(lease, dateFormatter) {
  const start = hasRecordValue(lease?.startsOn) ? dateFormatter(lease.startsOn) : 'Chưa có';
  const end = hasRecordValue(lease?.endsOn) ? dateFormatter(lease.endsOn) : 'Chưa có';
  return `${start} – ${end}`;
}
