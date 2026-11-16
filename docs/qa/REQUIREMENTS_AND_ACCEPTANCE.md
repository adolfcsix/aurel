# AUREL — Ma trận thông số quản lý trực tiếp trên website

**Đính chính phạm vi ngày 12/11/2026:** Bảng Excel được sếp dùng làm **tham chiếu các thông số** cần quản lý, **không phải yêu cầu tích hợp Excel**. Không cần liên kết, đồng bộ, nhập hay xuất Excel để hoàn thành nghiệp vụ cốt lõi. Công cụ nhập tệp hiện có là tùy chọn, không được coi là điều kiện nghiệm thu.

| Nhóm thông số trong bảng quản lý | Nơi nhập/sửa trực tiếp trên web | Nơi xem / tình trạng |
|---|---|---|
| Dự án, địa chỉ, khu vực | Dự án → Tạo/Sửa | Hồ sơ dự án; có mã liên kết |
| Tòa, tầng, phòng | Dự án, tòa & tầng → tạo/sửa danh mục | Hồ sơ căn hộ; cho phép nhập vị trí tự do khi chưa có danh mục |
| Mã căn, diện tích, phòng ngủ, trạng thái cho thuê | Danh mục căn hộ → Thêm/Sửa căn hộ | Hồ sơ căn hộ, danh sách và bộ lọc |
| Tình trạng nội thất, ghi chú | Danh mục căn hộ → Không gian & tình trạng | Hồ sơ căn hộ |
| Chủ sở hữu, khách thuê, mã khách | Chủ sở hữu & khách thuê → Thêm hồ sơ; liên kết trong căn hộ | Hồ sơ căn hộ hiển thị tên, mã khách theo quyền; hồ sơ khách quản lý chi tiết |
| Người phụ trách, sale | Nhân viên & phân công → hồ sơ nhân sự; gán trong căn | Hồ sơ căn hộ và danh sách phân công |
| Giá thuê, giá gia hạn dự kiến | Danh mục căn hộ → Giá thuê & chính sách phí | Hồ sơ căn hộ (tham khảo); hợp đồng lưu giá có hiệu lực riêng |
| % phí quản lý (3%, 3,7%, 6% hoặc giá trị khác), cơ sở tính phí | Danh mục căn hộ hoặc Phí dịch vụ | Hồ sơ căn hộ, lịch sử phí; không tính lại chứng từ đã chốt |
| Tiền cọc thỏa thuận, tiền cọc thực giữ, hoàn cọc | Hồ sơ căn/hợp đồng và nghiệp vụ Tiền cọc & hoàn cọc | Hồ sơ căn hộ (giá trị tham khảo), sổ cọc thực tế (có phê duyệt) |
| Thời hạn thuê, ngày thu theo tháng | Hồ sơ căn (tham khảo), hợp đồng (chính thức) | Hồ sơ căn, hợp đồng và lịch kỳ thu |
| Công nợ, thanh toán nhiều đợt | Khoản thu & công nợ | Ledger/chứng từ theo lịch thu, không nhập tay tổng số tiền giả |
| Nhắc thanh toán | Lịch nhắc thanh toán | Theo dõi nội bộ, ghi nhận lịch sử liên hệ; không mặc định gửi SMS/Zalo/email |
| Ghi chú và bản nháp thiếu trường | Danh mục / hồ sơ liên quan | Có thể lưu nháp và bổ sung, chỉ chặn ở bước nghiệp vụ buộc phải xác minh |
| Tình trạng, báo cáo và điều chỉnh thông số | Danh mục, Tổng quan, Báo cáo điều hành | Phân quyền theo vai trò; nhật ký và lưu trữ bảo toàn lịch sử |

**Quy tắc an toàn :** Tiền cọc trên hồ sơ căn hộ chỉ là số dự kiến/tham khảo; chỉ chứng từ nhận cọc có căn cứ mới làm tăng số dư sổ cọc. Khoản cọc mẫu sinh từ phiên bản cũ phải được đối chiếu trước khi vận hành tài chính.

**Không nằm trong phạm vi:** Thu điện/nước, sửa chữa; tích hợp hay đồng bộ với Excel. Công cụ nhập tệp tùy chọn không tạo hợp đồng, chứng từ hoặc công nợ tự động.

**Điều kiện nghiệm thu vẫn phải thực hiện:** đối chiếu từng tên thông số trên bảng sếp từng dùng (nếu có lại bảng gốc); UAT thao tác trực tiếp trên web của quản lý, nhân viên, kế toán, người xem; React → Express → PostgreSQL `_test` chạy thật; kiểm tra trạng thái/thanh toán/hoàn cọc chính xác; giao diện responsive. Chưa kết luận đầy đủ 100% theo bảng gốc khi chưa nhìn thấy bản gốc.
