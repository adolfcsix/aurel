# Kiểm tra trang tài khoản

Ngày 22/11/2026: thay bố cục đăng nhập/đăng ký, bỏ khẩu hiệu và nội dung lặp. Giữ logo được chọn, đăng ký vào ngay bằng quyền Người xem, hỗ trợ mật khẩu tạm và các quy tắc xác thực hiện có. Khóa biểu mẫu và đổi chế độ khi đang gửi; không xóa dữ liệu khi bấm lại chế độ đang mở.

Kiểm tra React/DOM: 9 tình huống tài khoản (nội dung rút gọn, hiện/ẩn mật khẩu, khóa gửi lặp, chuyển chế độ xóa mật khẩu, mật khẩu xác nhận, đăng ký nhận phiên, trợ giúp, kích hoạt, lỗi đăng nhập); 8 tình huống workspace và 51 màn hình theo quyền. Bộ kiểm tra trình duyệt đã cập nhật nhãn thao tác mới nhưng chưa chạy được vì Chromium bị chặn tạo Unix socket. Chưa chứng nhận bố cục thực hoặc thiết bị thật.

---

# AUREL — Hoàn thiện và ổn định hành vi

Ngày kiểm tra: 17/11/2026.

## Thay đổi đã thực hiện

1. Sửa lỗi thực tế `ReferenceError: differenceDays is not defined` khi mở Lịch nhắc thanh toán với kỳ thu còn nợ. Lỗi được phát hiện bằng render React/DOM, sau đó chạy lại toàn bộ 51 trang được phép của năm vai trò.
2. Giới hạn thời gian chờ API mặc định 30 giây, bao gồm nội dung phản hồi, có AbortSignal và cleanup; hỗ trợ cả JSON và XLSX. Hết hạn khi ghi được phân loại chưa rõ kết quả và không tự retry. HTTP lỗi có JSON `null` vẫn giữ đúng mã trạng thái và không gây TypeError.
3. Khóa toàn bộ vùng điều khiển nhập tệp khi xử lý; khóa đồng bộ ngăn kiểm tra/gửi chồng nhau. Đổi định dạng xóa dữ liệu, ánh xạ và báo cáo trước đó; không dùng lại báo cáo của tệp cũ.
4. Thêm error boundary với màn khôi phục truy cập được, nội dung tiếng Việt và hướng dẫn đối chiếu giao dịch; không lộ stack trace.
5. Mở rộng cảnh báo đóng/tải lại trình duyệt khi còn dữ liệu cá nhân chưa lưu. Không lưu dữ liệu nháp vào localStorage. Trình duyệt/điện thoại có thể không hiện cảnh báo; tính năng này không thay thế tự lưu, cũng không chặn mọi điều hướng nội bộ.
6. Khóa tên cá nhân trong lúc lưu và chống submit đồng thời; cho phép đăng xuất từ màn tải dữ liệu lần đầu thất bại.
7. Tách gói thư viện khỏi gói ứng dụng, giữ hệ thống màu/logo và thứ tự 21 stylesheet hiện có. CI dùng npm ci và thêm kiểm tra React/DOM; cổng qa:gate thực thi cùng bộ kiểm tra.

## Kết quả thực thi

| Hạng mục | Kết quả |
|---|---|
| npm test qua qa:gate | 906/906 PASS; không fail/skip |
| React/DOM | 8 kiểm tra hành vi và 51 màn hình theo năm vai trò PASS |
| React build | PASS; 104 modules; thư viện 222,44 kB, ứng dụng 292,43 kB |
| HTTP JSON trên dữ liệu dùng riêng | PASS: đăng ký, auth, CRUD, hợp đồng, kỳ thu, phí, thu tiền, cọc/hoàn cọc, lưu trữ/khôi phục, RBAC, xác minh/đề nghị/duyệt/thu hồi sở hữu |
| Toàn vẹn nguồn | 143 nguồn, 0 lỗi; logo đúng SHA-256; 21 CSS |
| Hộp thoại | 18/18 PASS |
| CSS và trợ năng tĩnh | PASS; không đại diện kiểm tra bố cục thực |
| Phục hồi JSON | PASS; từ chối backup hỏng, khôi phục nguyên tử và đối chiếu ở process độc lập |
| Chromium E2E | BLOCKED khi khởi động: tạo Unix socket bị chặn |
| Trình duyệt được cung cấp | BLOCKED bởi chính sách truy cập; không sử dụng cách vòng qua |
| PostgreSQL | BLOCKED tại tiền kiểm vì chưa có cấu hình database thử; không ghi DB |
| Thiết bị thật | NOT RUN |

React/DOM dùng jsdom, không thực hiện layout CSS. Bộ này phát hiện lỗi render và sự kiện, không chứng nhận chống tràn, kích thước nút, giao diện Safari hoặc trải nghiệm bàn phím điện thoại. Nghiệm thu tài chính thực tiếp tục cần PostgreSQL thử, trình duyệt và UAT thiết bị.

## Rà phạm vi nghiệp vụ

Đối chiếu ma trận REQUIREMENTS_AND_ACCEPTANCE.md: danh mục không gian/căn hộ, khách hàng, nhân viên, hợp đồng/kỳ thu, phí lịch sử, thu từng phần, cọc/hoàn cọc, nhắc việc nội bộ, quyền, ghi chú tài sản của mình, đề nghị sửa, nhật ký/lưu trữ/đối soát đều đã có và nằm trong các kiểm tra hiện tại. Đợt này hoàn thiện hành vi và sửa lỗi của các luồng đó; không thêm nghiệp vụ ngoài phạm vi đã chốt. Chưa có lại bảng Excel gốc nên không khẳng định đã đối chiếu mọi cột của bảng gốc. Điện/nước, sửa chữa và đồng bộ Excel vẫn ngoài phạm vi theo ma trận.

## Cách kiểm tra tiếp trên máy có đủ điều kiện

- `npm ci --include=optional --no-audit --no-fund`
- `npm run qa:gate`
- `npm run qa:release`
- `npm run qa:recovery:json`
- `npm run qa:gate:ui` trên máy có Chromium/Chrome được phép khởi động.
- `npm run qa:gate:pg` với database `_test` riêng theo `.env.qa.example` và hướng dẫn README.
- UAT màn hình 375/390/430/768/1024/1440 px, đăng nhập năm vai trò, nhập/sửa/lưu/hoàn tác, lỗi mạng, bảng dài, hộp thoại, tài sản của tôi; kiểm tra trực tiếp iPhone/Android.
