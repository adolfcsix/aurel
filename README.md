# AUREL Property Workspace

AUREL là ứng dụng quản lý danh mục căn hộ và tài sản cho thuê, gồm giao diện React và API Node.js/Express trong cùng một repository. Giao diện và máy chủ được tách thành hai thư mục để dễ phát triển, bảo trì và triển khai.

Ứng dụng hỗ trợ chạy local bằng dữ liệu JSON mẫu hoặc kết nối PostgreSQL. Chế độ JSON phục vụ trải nghiệm và kiểm thử; dữ liệu mẫu không phải chứng từ tài chính thực tế.

## Mục lục

- [Chức năng](#chức-năng)
- [Cần cài những gì](#cần-cài-những-gì)
- [Cài đặt và chạy nhanh trên Windows / VS Code](#cài-đặt-và-chạy-nhanh-trên-windows--vs-code)
- [Chạy với PostgreSQL](#chạy-với-postgresql)
- [Tài khoản và phân quyền](#tài-khoản-và-phân-quyền)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Các lệnh thường dùng](#các-lệnh-thường-dùng)
- [Kiểm tra hệ thống](#kiểm-tra-hệ-thống)
- [Sao lưu và cập nhật](#sao-lưu-và-cập-nhật)
- [Khắc phục lỗi](#khắc-phục-lỗi)
- [Giới hạn nghiệm thu](#giới-hạn-nghiệm-thu)

## Chức năng

- Quản lý dự án, tòa nhà, tầng, phòng và danh mục căn hộ; tìm kiếm, bộ lọc, hồ sơ chi tiết, lưu căn quan tâm và cập nhật hàng loạt theo quyền.
- Quản lý chủ sở hữu, khách thuê, nhân viên, người phụ trách và nhân viên kinh doanh.
- Quản lý hợp đồng, gia hạn, kết thúc hợp đồng và lịch kỳ thu; các trường tham khảo của căn hộ được phân biệt với thông tin hợp đồng chính thức.
- Ghi nhận khoản thu từng phần hoặc toàn bộ, đối chiếu công nợ, chứng từ và đảo giao dịch có dấu vết.
- Quản lý tỷ lệ phí, thời điểm áp dụng và lịch sử; chứng từ đã chốt không bị tính lại tùy tiện.
- Quản lý nhận cọc, đề nghị hoàn cọc, phê duyệt và xác nhận chi theo quyền.
- Nhắc thanh toán nội bộ, ghi nhận lịch sử liên hệ, báo cáo, nhật ký, lưu trữ/khôi phục và đối soát dữ liệu.
- Người xem có hồ sơ cá nhân và căn quan tâm. Sau khi xác minh sở hữu, có thể xem tài sản của mình, lưu ghi chú và gửi đề nghị cập nhật thông tin mô tả.
- Nhập XLSX hoặc CSV là công cụ tùy chọn, có xem trước/đối chiếu; không tự tạo hợp đồng hay chứng từ thu tiền.

## Cần cài những gì

| Phần mềm | Mục đích | Yêu cầu |
|---|---|---|
| [Node.js](https://nodejs.org/) | Chạy frontend, backend và npm | Node.js 22 trở lên; nên dùng bản LTS được hỗ trợ |
| [Visual Studio Code](https://code.visualstudio.com/) | Mở và chỉnh sửa mã nguồn | Khuyến nghị |
| [Git](https://git-scm.com/downloads) | Clone và cập nhật repository | Cần nếu dùng lệnh git |
| Chrome / Edge / Firefox | Sử dụng ứng dụng | Trình duyệt hiện hành |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Chạy PostgreSQL bằng cấu hình có sẵn | Chỉ cần cho cách chạy PostgreSQL bằng Docker |
| [PostgreSQL](https://www.postgresql.org/download/) | Lưu dữ liệu bằng SQL | Có thể cài trực tiếp thay Docker; cấu hình kèm theo dùng PostgreSQL 16 |

Không cần XAMPP, MySQL, Live Server hay cài React/Vite toàn cục. `npm ci` cài các thư viện của dự án. Lần cài đầu cần Internet.

## Cài đặt và chạy nhanh trên Windows / VS Code

### 1. Lấy mã nguồn

Mở PowerShell hoặc terminal VS Code:

```powershell
git clone https://github.com/adolfcsix/aurel.git
cd aurel
code .
```

Nếu tải ZIP từ GitHub: giải nén, mở VS Code → **File → Open Folder**, chọn thư mục có `package.json`. Không mở riêng `frontend` hoặc `backend` khi chạy các lệnh cấp gốc dưới đây.

### 2. Kiểm tra Node.js và cài thư viện

```powershell
node -v
npm -v
npm ci --include=optional --no-audit --no-fund
```

`package-lock.json` đã được cung cấp để cài đúng cây phụ thuộc. Không chép `node_modules` từ máy khác.

### 3. Tạo cấu hình local

Trên Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Trên macOS/Linux:

```bash
cp .env.example .env
```

Mở `.env` ở thư mục gốc. Để thử nhanh bằng JSON, giữ `PORT=4100`, chưa bật `AUREL_STORAGE=postgres`. Có thể đổi `DEMO_ADMIN_PASSWORD` **trước lần chạy đầu tiên**.

### 4. Khởi động

```powershell
npm run dev:check
npm run dev
```

Giữ terminal này đang chạy. Một lệnh sẽ mở cả hai phần:

| Địa chỉ | Công dụng |
|---|---|
| http://localhost:5173 | Giao diện người dùng; mở địa chỉ này để sử dụng |
| http://127.0.0.1:4100/api/health | Kiểm tra API đang hoạt động |
| http://127.0.0.1:4100/api/ready | Kiểm tra backend có đọc được kho dữ liệu |

Nếu Vite thông báo dùng cổng khác do cổng bận, mở đúng URL hiện trong terminal. Dừng ứng dụng bằng `Ctrl+C`.

Tài khoản mẫu lần đầu:

```text
Tên đăng nhập: admin
Mật khẩu: giá trị DEMO_ADMIN_PASSWORD trong .env
Mặc định trong tệp mẫu: AurelDemo@2026
```

JSON demo được tạo tại `backend/data/local-demo.json`. Nếu kho dữ liệu đã tồn tại, sửa biến mật khẩu trong `.env` không tự thay mật khẩu tài khoản cũ. Đổi mật khẩu qua chức năng trong ứng dụng; không xóa dữ liệu để sửa lỗi đăng nhập.

### 5. Những lần chạy tiếp theo

```powershell
cd duong-dan-den-thu-muc-aurel
npm run dev
```

Không cần cài lại thư viện mỗi lần mở máy. Chỉ chạy lại `npm ci` khi vừa tải mã lần đầu hoặc cây phụ thuộc thay đổi.

### Chạy hai terminal riêng khi cần gỡ lỗi

Terminal backend, vẫn đứng tại thư mục gốc:

```powershell
npm run dev -w backend
```

Terminal frontend:

```powershell
npm run dev -w frontend
```

Frontend chuyển các yêu cầu `/api` đến backend qua Vite proxy. Khi chạy local theo cấu hình mặc định, dùng cùng hostname `localhost` cho giao diện để tránh nhầm cookie giữa các địa chỉ.

## Chạy với PostgreSQL

### Cách A: Dùng Docker Desktop

Bật Docker Desktop và chạy tại thư mục gốc:

```powershell
docker compose up -d db
docker compose ps
```

Dịch vụ `db` dùng PostgreSQL 16, cổng local `5435`, database `aurel`, người dùng `aurel`. Mật khẩu mặc định `aurel_local_only` chỉ là cấu hình local. Dữ liệu nằm trong volume `aurel_pgdata`.

Sửa `.env`:

```dotenv
PORT=4100
AUREL_STORAGE=postgres
DATABASE_URL=postgresql://aurel:aurel_local_only@127.0.0.1:5435/aurel
ADMIN_USERNAME=admin
ADMIN_INITIAL_PASSWORD=ThayBangMatKhauRiengItNhat12KyTu
COOKIE_SECURE=false
PG_SSL=false
```

Thay mật khẩu quản trị trước khi chạy. Sau đó:

```powershell
npm run db:migrate
npm run doctor
npm run dev
```

Migrations tạo schema theo thứ tự. Khi backend khởi động, tài khoản quản trị ban đầu chỉ được tạo nếu chưa có tài khoản nào. Đăng nhập bằng `ADMIN_USERNAME` và mật khẩu đã đặt. Sau khi tạo thành công, có thể bỏ `ADMIN_INITIAL_PASSWORD` khỏi `.env`; đây không phải chức năng đặt lại mật khẩu.

Để dừng database mà vẫn giữ dữ liệu:

```powershell
docker compose stop db
```

Không dùng `docker compose down -v` với dữ liệu cần giữ vì tùy chọn `-v` xóa volume.

### Cách B: PostgreSQL cài trực tiếp

Tạo database UTF-8 và tài khoản riêng bằng pgAdmin hoặc psql, sửa `DATABASE_URL` cho đúng host/cổng/database rồi chạy các lệnh migrate, doctor và dev như trên. Với cấu hình Docker kèm theo cổng là `5435`; PostgreSQL cài trực tiếp thường dùng `5432`.

Nếu mật khẩu có ký tự đặc biệt trong URL kết nối, phải URL-encode phần mật khẩu. Không đưa chuỗi kết nối có mật khẩu lên GitHub.

### Dữ liệu mẫu trong PostgreSQL

PostgreSQL bắt đầu với kho nghiệp vụ trống. Nếu thực sự muốn nhập dữ liệu mẫu trên database local trống, đặt `ALLOW_DEMO_IMPORT=yes` trong `.env`, chạy:

```powershell
npm run db:import-demo
```

Sau đó bỏ biến xác nhận. Công cụ từ chối nhập đè database đã có dự án hoặc căn hộ. Không nhập mẫu vào kho dữ liệu đang sử dụng thật. Đổi từ JSON sang PostgreSQL **không tự chuyển dữ liệu JSON đã nhập**; cần kế hoạch chuyển đổi và đối soát riêng.

## Tài khoản và phân quyền

| Vai trò | Phạm vi chính |
|---|---|
| Quản trị viên (`admin`) | Quản trị tài khoản/quyền và nghiệp vụ được cấp |
| Quản lý (`manager`) | Quản lý danh mục, hợp đồng, vận hành, phê duyệt theo quyền; không tự cấp quyền quản trị |
| Kế toán (`accountant`) | Thu tiền, công nợ, phí, cọc và báo cáo theo quyền; hạn chế thông tin khách hàng |
| Nhân viên (`staff`) | Tài sản và công việc được phân công; giới hạn phạm vi dữ liệu |
| Người xem (`viewer`) | Hồ sơ cá nhân, xem danh mục, căn quan tâm và tài sản sở hữu đã xác minh |

- Đăng ký xong có thể vào ngay bằng quyền Người xem; không cần chờ duyệt tài khoản.
- Quyền nội bộ do quản trị viên cấp. Liên kết chủ sở hữu cần được xác minh theo từng hồ sơ, không suy ra từ việc lưu căn quan tâm.
- Tài khoản được cấp mật khẩu tạm có thể được yêu cầu đổi mật khẩu trước khi sử dụng tiếp.
- Các thao tác tài chính vẫn được backend kiểm tra, kể cả khi sửa yêu cầu từ trình duyệt.

## Cấu trúc mã nguồn

```text
aurel/
├── frontend/            # React, thành phần giao diện, CSS, tài nguyên và kiểm thử
├── backend/             # Express, nghiệp vụ, phân quyền, lưu dữ liệu và kiểm thử
├── database/migrations/ # SQL migrations theo thứ tự
├── scripts/             # Khởi động, chẩn đoán và kiểm tra tích hợp/phục hồi
├── docs/                # Phạm vi nghiệp vụ và báo cáo kiểm tra
├── .github/workflows/   # Kiểm tra tự động trên GitHub Actions
├── .env.example         # Mẫu cấu hình local
├── .env.qa.example      # Mẫu cấu hình database kiểm thử tách biệt
├── docker-compose.yml  # PostgreSQL local và database kiểm thử riêng
├── package.json         # Các lệnh dùng chung và npm workspaces
└── package-lock.json    # Cây phụ thuộc được khóa
```

## Cấu hình môi trường

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng backend; mặc định `4100` |
| `AUREL_STORAGE` | Đặt `postgres` để dùng PostgreSQL; khi không bật dùng JSON demo |
| `DEMO_ADMIN_PASSWORD` | Mật khẩu tạo admin JSON lần đầu |
| `AUREL_DEMO_DATA_DIR` | Thư mục JSON demo riêng; mặc định `backend/data` |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL |
| `ADMIN_USERNAME` | Tên admin khởi tạo PostgreSQL |
| `ADMIN_INITIAL_PASSWORD` | Mật khẩu admin PostgreSQL lần đầu, tối thiểu 12 ký tự |
| `COOKIE_SECURE` | Chỉ bật `true` khi truy cập qua HTTPS; local HTTP dùng `false` |
| `PG_SSL` | Bật `true` nếu kết nối PostgreSQL yêu cầu SSL được xác minh |
| `AUREL_EVIDENCE_DIR` | Thư mục lưu chứng từ; nên đặt đường dẫn tuyệt đối và sao lưu cùng database |
| `AUREL_API_PROXY_TARGET` | Đổi đích proxy Vite khi backend không ở cổng mặc định |
| `AUREL_CHROME_BIN` | Đường dẫn Chrome/Chromium cho kiểm thử trình duyệt |
| `AUREL_PG_TEST_DATABASE_URL` | Database kiểm thử riêng, tên kết thúc bằng `_test` |
| `AUREL_PG_TEST_WRITE_ACK` | Đặt `yes` để xác nhận ghi trên database thử được chấp nhận |

`.env` được đọc khi khởi động; sau khi sửa cấu hình cần dừng và chạy lại. Nếu đổi cổng backend, phải đổi cả đích proxy frontend. Biến môi trường hệ điều hành có thể ưu tiên hơn `.env`.

## Các lệnh thường dùng

| Lệnh | Công dụng |
|---|---|
| `npm ci --include=optional --no-audit --no-fund` | Cài đúng thư viện theo lockfile |
| `npm run dev` | Chạy frontend và backend |
| `npm run dev:check` | Kiểm tra thư viện lõi trước khi khởi động |
| `npm run doctor` | Chẩn đoán cấu hình và kết nối dữ liệu |
| `npm run build` | Build frontend vào `frontend/dist` |
| `npm start` | Chạy API backend; không tự phục vụ frontend |
| `npm run db:migrate` | Áp dụng SQL migrations |
| `npm test` | Kiểm thử nghiệp vụ và các hợp đồng giao diện |
| `npm run qa:dom` | Render React/DOM và kiểm tra hành vi theo vai trò |
| `npm run qa:gate` | Kiểm thử, DOM, build, toàn vẹn tài chính và HTTP JSON thử riêng |
| `npm run qa:release` | Toàn vẹn nguồn, hộp thoại và CSS tĩnh |
| `npm run qa:gate:ui` | Kiểm tra tích hợp thêm trình duyệt Chromium thật |
| `npm run qa:gate:pg` | Kiểm tra PostgreSQL trên database thử riêng |
| `npm run qa:recovery:json` | Diễn tập khôi phục JSON bằng dữ liệu thử |
| `npm run qa:recovery:pg` | Diễn tập PostgreSQL với database thử và công cụ pg_dump/pg_restore |

`npm run seed` **đặt lại dữ liệu JSON demo**; không dùng như bước khởi động hằng ngày và không chạy với dữ liệu cần giữ.

Build thành công không đồng nghĩa đã triển khai website. `npm start` chỉ chạy API; bản frontend build cần máy chủ static/reverse proxy riêng với `/api` trỏ về backend và cookie HTTPS phù hợp. Repository tập trung vào chạy local và kiểm thử, không kèm thao tác tự động triển khai production.

## Kiểm tra hệ thống

Kiểm tra thông thường:

```powershell
npm run qa:gate
npm run qa:release
npm run qa:recovery:json
```

Kiểm tra trình duyệt cần Chrome/Chromium được phép khởi động. Nếu chưa được tự tìm thấy, đặt `AUREL_CHROME_BIN` đến file thực thi, rồi chạy `npm run qa:gate:ui`.

Để kiểm thử PostgreSQL, dùng **database QA riêng**, không dùng `DATABASE_URL` đang chứa dữ liệu thật. Với Docker:

```powershell
docker compose --profile qa up -d db-test
```

Đọc `.env.qa.example`, đặt các biến QA và `AUREL_STORAGE=postgres`, sau đó chạy `npm run qa:gate:pg`. Database QA mặc định ở cổng `5436`, tên `aurel_workspace_test`; được lưu tạm và có thể mất dữ liệu khi container tạo lại. Cổng kiểm tra yêu cầu database thử trống trước khi chạy; không xóa database đang dùng để cố vượt qua kiểm tra này. Phần kiểm tra phục hồi PostgreSQL cần `pg_dump` và `pg_restore` trong PATH; nên dùng bộ công cụ PostgreSQL 16 tương thích máy chủ.

## Sao lưu và cập nhật

- JSON: dừng ứng dụng rồi sao lưu `backend/data/local-demo.json` và thư mục chứng từ `backend/data/payment-attachments`, hoặc các đường dẫn đã cấu hình riêng.
- PostgreSQL: sao lưu database bằng công cụ PostgreSQL và sao lưu cả thư mục chứng từ tương ứng. Lưu bản sao ngoài máy đang chạy và kiểm tra phục hồi trên môi trường tách biệt.
- Không commit `.env`, dữ liệu khách hàng, chứng từ, mật khẩu hay `node_modules`. Các tệp đó đã được loại khỏi mã nguồn Git.
- Diễn tập recovery có sẵn sử dụng dữ liệu thử; không phải công cụ tự động khôi phục kho dữ liệu thật.

Khi cập nhật từ GitHub, dừng ứng dụng, sao lưu dữ liệu và lưu các chỉnh sửa local trước; sau đó:

```powershell
git pull --ff-only
npm ci --include=optional --no-audit --no-fund
```

Nếu dùng PostgreSQL, chạy `npm run db:migrate`; tiếp theo `npm run qa:gate`, rồi `npm run dev`. `git pull --ff-only` từ chối nếu lịch sử local phân nhánh; không dùng reset cứng để bỏ qua khi còn chỉnh sửa cần giữ.

## Khắc phục lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Không nhận lệnh `node`, `npm` hoặc `git` | Cài phần mềm tương ứng, mở lại terminal/VS Code và kiểm tra PATH |
| PowerShell chặn `npm.ps1` | Dùng terminal Command Prompt trong VS Code hoặc thay `npm` bằng `npm.cmd`; không cần tắt bảo vệ toàn hệ thống |
| Thiếu `vite`, `react`, `express`, `jsdom` | Chạy `npm ci --include=optional --no-audit --no-fund` ở thư mục gốc; không cài chế độ bỏ devDependencies khi chạy QA |
| `EAI_AGAIN`, timeout khi cài npm | Kiểm tra Internet/proxy/DNS, thử cài lại; không tắt xác minh TLS để khắc phục |
| `ECONNREFUSED 4100` hoặc không tải được dữ liệu | Kiểm tra backend còn chạy, đọc lỗi terminal, mở `/api/health` và `/api/ready`; so lại cổng/proxy |
| `EADDRINUSE` | Dừng tiến trình đang chiếm cổng hoặc đổi cổng và proxy tương ứng |
| PostgreSQL không kết nối | Kiểm tra Docker/service, host/cổng/user/password/database; chạy `npm run doctor` |
| Migrate báo chưa đặt `DATABASE_URL` | Tạo `.env` tại gốc và bật cấu hình PostgreSQL đúng |
| Đăng nhập không giữ phiên ở HTTP local | Giữ `COOKIE_SECURE=false`, dùng hostname nhất quán; khởi động lại sau khi sửa `.env` |
| Đổi mật khẩu trong `.env` nhưng đăng nhập cũ không đổi | Biến khởi tạo chỉ có tác dụng lần đầu; dùng chức năng đổi/reset mật khẩu của ứng dụng |
| API báo kết quả thao tác chưa xác minh | Tải lại và đối chiếu hồ sơ/nhật ký trước khi nhập lại khoản thu, hoàn cọc hoặc gửi lại thao tác |
| Chromium kiểm thử bị chặn | Chạy trên máy cho phép Chrome/Chromium hoạt động; kiểm tra DOM không thay thế kiểm tra bố cục thực |

## Giới hạn nghiệm thu

Bản mã nguồn đã đạt 906 kiểm thử Node, 8 kiểm tra hành vi React/DOM, 51 màn hình theo năm vai trò, build React, HTTP JSON nghiệp vụ và diễn tập phục hồi JSON. Đây là kết quả trên dữ liệu kiểm thử.

Chưa xác nhận bố cục trên trình duyệt/điện thoại thật và PostgreSQL trong môi trường xây dựng hiện tại. Trước khi dùng dữ liệu khách hàng hoặc tiền thật, cần nghiệm thu PostgreSQL, kiểm tra trình duyệt và UAT thiết bị. Bộ DOM không mô phỏng kích thước hay layout CSS.

Xem [phạm vi nghiệp vụ](docs/qa/REQUIREMENTS_AND_ACCEPTANCE.md) và [báo cáo kiểm tra](docs/qa/QA_REPORT.md). Nội dung thu điện/nước, sửa chữa và đồng bộ Excel không nằm trong phạm vi nghiệp vụ hiện có.
