# Team Quiz Battle

Một web game trắc nghiệm thời gian thực chia làm 2 đội. Người chơi trả lời đúng/nhanh sẽ tạo ra lực đẩy để đẩy chiếc xe đua của đội mình về đích.

## Chạy trên máy

Yêu cầu: Node.js >= 18.

```bash
npm install
npm start
```

Mở http://localhost:3000. Chọn **Tạo Phòng (Host)** trên màn hình lớn, người chơi chọn **Vào Chơi** trên điện thoại rồi nhập mã phòng 6 ký tự.

## Cấu trúc

```
server.js            Máy chủ Express + Socket.IO (toàn bộ luật chơi nằm ở đây)
data/questions.json  Câu hỏi (text, 4 options, answer = 0..3). Tối đa 15 câu được dùng mỗi ván
public/              Giao diện: index.html, host.html, play.html, css/, js/
```

## Cấu hình (biến môi trường, không bắt buộc)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 3000 | Cổng chạy (Render tự đặt) |
| `TIME_PER_QUESTION` | 20 | Số giây mỗi câu |
| `RESULT_DELAY_MS` | 6000 | Thời gian hiển thị kết quả trước khi sang câu tiếp |

## Triển khai trên Render.com

1. Đưa code lên GitHub (repo này).
2. Trên Render: **New +** → **Web Service** → chọn repo.
3. Cài đặt: Runtime **Node**, Build Command `npm install`, Start Command `npm start`.
4. Chọn gói, bấm **Create Web Service**. Khi xong, dùng địa chỉ `https://<tên>.onrender.com`.
5. Health Check Path (tùy chọn): `/healthz`.

Lưu ý: phòng chơi nằm trong bộ nhớ của máy chủ. Gói Free sẽ ngủ sau ~15 phút không có truy cập và khi đó mọi phòng bị mất; hãy mở trang trước giờ chơi vài phút. Khi triển khai bản mới, các ván đang chơi cũng bị mất.

Contributer: @nguyenvanhoanglong478-source, @anhmt821152-ctrl

