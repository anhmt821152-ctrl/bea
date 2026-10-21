# Changelog

Mọi thay đổi được commit vào repo này đều được ghi lại tại đây, mục mới nhất nằm trên cùng.

## 2026-10-21

- Thêm chỉnh thời gian trả lời: host chọn thời gian mỗi câu cho cả phòng ở sảnh chờ (5–300 giây), và mỗi câu trong trình soạn có thể có thời gian riêng. Server kiểm tra lại giá trị; điểm thưởng tốc độ tính theo thời gian của từng câu. `TIME_PER_QUESTION` giờ chỉ là giá trị ban đầu.
- Gộp trình soạn câu hỏi vào sảnh chờ của host (tab "Người chơi" và "Câu hỏi"), mã phòng luôn hiện khi đang soạn. Bỏ trang `editor.html` và thẻ "Soạn câu hỏi" ở trang chủ. Bộ câu hỏi chưa hoàn chỉnh không bao giờ được dùng: phòng tự quay về bộ mặc định và báo cho host.
- Thêm trình soạn câu hỏi: tạo bộ riêng, thêm/sửa/xóa/đổi thứ tự/nhân đôi câu hỏi, chọn đáp án đúng, nhập và xuất file JSON. Bộ câu hỏi lưu trong trình duyệt của host.
- Host chọn bộ câu hỏi ở sảnh chờ; server kiểm tra lại dữ liệu (`host:setQuestions`) và có thêm `/api/default-questions`.
- Làm lại toàn bộ giao diện theo phong cách đua xe: mã phòng dạng biển số, ô đáp án có màu và hình, đường đua có vạch đích, bục podium và pháo giấy khi có đội thắng, đáp án 2x2 trên điện thoại.
- Sửa lỗi: ô đáp án mất màu sau câu đầu, thanh thời gian không chạy, tên tệp xuất JSON có dấu bị mất.
- README: thêm hướng dẫn tự tạo câu hỏi (tiếng Anh và tiếng Việt).

## 2026-10-20

- Thêm `CHANGELOG.md` để theo dõi các commit.
