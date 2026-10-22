# Changelog

Mọi thay đổi được commit vào repo này đều được ghi lại tại đây, mục mới nhất nằm trên cùng.

## 2026-10-22

- Thêm tài khoản admin duy nhất để khóa phía host: trang đăng nhập `login.html`, `host.html` cùng script của nó chỉ phục vụ khi đã đăng nhập, mọi lệnh `host:*` qua Socket.IO bị chặn nếu chưa đăng nhập. Người chơi vẫn vào bằng mã phòng, không cần tài khoản.
- Tài khoản đặt bằng biến môi trường `ADMIN_USER` và `ADMIN_PASSWORD` (tối thiểu 8 ký tự); thiếu mật khẩu thì không ai làm host được. Đăng nhập bằng cookie có chữ ký, hiệu lực 7 ngày, có nút "Đăng xuất admin" ở sảnh chờ.
- Sai mật khẩu 5 lần thì địa chỉ đó bị khóa 15 phút.
- `/api/default-questions` (có kèm đáp án đúng) chỉ trả về cho admin đã đăng nhập, để người chơi không xem trước được đáp án.
- README hướng dẫn đặt `ADMIN_PASSWORD` khi chạy máy và khi triển khai trên Render.

## 2026-10-21

- Sửa giao diện điện thoại: ô chọn bộ câu hỏi và thời gian ở sảnh chờ không còn tràn ra ngoài khung.
- Thêm chỉnh thời gian trả lời: host chọn thời gian mỗi câu cho cả phòng ở sảnh chờ (5–300 giây), và mỗi câu trong trình soạn có thể có thời gian riêng. Server kiểm tra lại giá trị; điểm thưởng tốc độ tính theo thời gian của từng câu. `TIME_PER_QUESTION` giờ chỉ là giá trị ban đầu.
- Gộp trình soạn câu hỏi vào sảnh chờ của host (tab "Người chơi" và "Câu hỏi"), mã phòng luôn hiện khi đang soạn. Bỏ trang `editor.html` và thẻ "Soạn câu hỏi" ở trang chủ. Bộ câu hỏi chưa hoàn chỉnh không bao giờ được dùng: phòng tự quay về bộ mặc định và báo cho host.
- Thêm trình soạn câu hỏi: tạo bộ riêng, thêm/sửa/xóa/đổi thứ tự/nhân đôi câu hỏi, chọn đáp án đúng, nhập và xuất file JSON. Bộ câu hỏi lưu trong trình duyệt của host.
- Host chọn bộ câu hỏi ở sảnh chờ; server kiểm tra lại dữ liệu (`host:setQuestions`) và có thêm `/api/default-questions`.
- Làm lại toàn bộ giao diện theo phong cách đua xe: mã phòng dạng biển số, ô đáp án có màu và hình, đường đua có vạch đích, bục podium và pháo giấy khi có đội thắng, đáp án 2x2 trên điện thoại.
- Sửa lỗi: ô đáp án mất màu sau câu đầu, thanh thời gian không chạy, tên tệp xuất JSON có dấu bị mất.
- README: thêm hướng dẫn tự tạo câu hỏi (tiếng Anh và tiếng Việt).

## 2026-10-20

- Thêm `CHANGELOG.md` để theo dõi các commit.
