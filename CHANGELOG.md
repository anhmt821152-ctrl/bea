# Changelog

Mọi thay đổi được commit vào repo này đều được ghi lại tại đây, mục mới nhất nằm trên cùng.

## 2026-10-21

- Thêm trang soạn câu hỏi `editor.html`: tạo bộ riêng, thêm/sửa/xóa/đổi thứ tự/nhân đôi câu hỏi, chọn đáp án đúng, nhập và xuất file JSON. Bộ câu hỏi lưu trong trình duyệt của host.
- Host chọn bộ câu hỏi ở sảnh chờ; server kiểm tra lại dữ liệu (`host:setQuestions`) và có thêm `/api/default-questions`.
- Làm lại toàn bộ giao diện theo phong cách đua xe: mã phòng dạng biển số, ô đáp án có màu và hình, đường đua có vạch đích, bục podium và pháo giấy khi có đội thắng, đáp án 2x2 trên điện thoại.
- Sửa lỗi: ô đáp án mất màu sau câu đầu, thanh thời gian không chạy, tên tệp xuất JSON có dấu bị mất.
- README: thêm hướng dẫn tự tạo câu hỏi (tiếng Anh và tiếng Việt).

## 2026-10-20

- Thêm `CHANGELOG.md` để theo dõi các commit.
