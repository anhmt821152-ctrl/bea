# Team Quiz Battle

**English** | [Tiếng Việt](#tiếng-việt)

A real-time two-team quiz game. Players who answer correctly and quickly push their team's race car toward the finish line.

## How to play

1. **Open the site** on a big screen (host) and on phones (players).
2. **Host:** click **Create Room (Host)**. A 6-character room code appears.
3. **Players:** click **Join**, enter the room code and a name (max 16 characters), then pick a team or leave it on "balanced". Each team holds up to 30 players.
4. **Start:** the host clicks **Start** once everyone has joined. A game uses up to 15 questions, 20 seconds each.
5. **During the game:** players tap A/B/C/D on their phone. Correct and fast answers earn more points and push the car further; wrong answers lose points. The server moves on to the next question by itself.
6. **End:** the team whose car got further wins (a tie is decided by total score). The host screen shows the top 10 players.

Host buttons: **← Home** (lobby and final screen) closes the room and sends everyone back to the join screen. **← Stop game** (during a game) returns to the lobby, keeps the players and resets the scores. **Play again** starts a new game with the same players.

## Run locally

Requires Node.js >= 18.

```bash
npm install
npm start
```

Open http://localhost:3000.

## Project structure

```
server.js            Express + Socket.IO server (all game rules live here)
data/questions.json  Questions (text, 4 options, answer = 0..3). Up to 15 are used per game
public/              Frontend: index.html, host.html (lobby + question editor), play.html, css/, js/
```

## Make your own questions

You write questions in the lobby, right after creating a room: the room code stays on screen, so players can already join while you edit. Click **Create Room (Host)**, then open the **Questions** tab (or **Edit question set** on the Players tab).

1. Click **New set** and name it, or **Copy the default set** to start from the built-in questions.
2. **Add question**, type the question and the 4 answers, and tick the correct one. Use ↑ ↓ to reorder, **Duplicate** or **Delete question** as needed. A set holds up to 50 questions and every question must be complete before the set can be used.
3. Changes are saved automatically **in this browser** (on the host's device). They are not stored on the server, so use **Export JSON** to keep a backup or move a set to another device, and **Import from JSON file** to bring it back.
4. Click **Use for the host's room** on the set, or pick it in the **Question set** list on the Players tab. You can only change it in the lobby. A set that is not complete is never used: the room falls back to the default set and tells you. The choice is remembered for the next room.

5. **Answer time:** on the Players tab, pick **Time per question** for the whole room (5 to 300 seconds; the default is 20). In the editor, each question can also have its own **Answer time**; a question with its own time keeps it, the others follow the room's time. Faster answers score more points relative to that question's time.

Limits: question up to 200 characters, each answer up to 100 characters, time 5 to 300 seconds.

To change the built-in questions instead, edit `data/questions.json`. Every question needs `text`, exactly 4 `options` and `answer` (0 to 3, the index of the correct option). The server checks the file at startup and refuses to start if a question is invalid.

## Configuration (environment variables, optional)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port to listen on (Render sets it for you) |
| `TIME_PER_QUESTION` | 20 | Starting seconds per question (the host can change it in the lobby) |
| `RESULT_DELAY_MS` | 6000 | How long results are shown before the next question |

## Deploy on Render.com

1. Push the code to GitHub.
2. On Render: **New +** → **Web Service** → pick this repository.
3. Settings: Runtime **Node**, Branch `main`, Build Command `npm install`, Start Command `npm start`, Instance Type **Free**. Choose a region close to your players (for Vietnam: Singapore). Leave Root Directory empty.
4. Under **Advanced**, set **Health Check Path** to `/healthz`.
5. Click **Create Web Service**. When it shows **Live**, open `https://<service-name>.onrender.com`.

Every push to `main` is deployed automatically (Auto-Deploy: On Commit).

Free plan notes:
- The service sleeps after about 15 minutes without traffic. The first visit after that takes 30–60 seconds, so open the site a few minutes before playing.
- Rooms live in the server's memory. When the service sleeps, restarts or is redeployed, all rooms are lost. Deploy when nobody is playing.

---

# Tiếng Việt

[English](#team-quiz-battle) | **Tiếng Việt**

Web game trắc nghiệm thời gian thực chia làm 2 đội. Người chơi trả lời đúng và nhanh sẽ đẩy chiếc xe đua của đội mình về đích.

## Cách chơi

1. **Mở trang web** trên màn hình lớn (host) và trên điện thoại (người chơi).
2. **Host:** bấm **Tạo Phòng (Host)**. Màn hình hiện mã phòng 6 ký tự.
3. **Người chơi:** bấm **Vào Chơi**, nhập mã phòng và tên (tối đa 16 ký tự), chọn đội hoặc để "Tự chọn cân bằng". Mỗi đội tối đa 30 người.
4. **Bắt đầu:** host bấm **Bắt đầu ngay** khi mọi người đã vào. Một ván có tối đa 15 câu, mỗi câu 20 giây.
5. **Trong lúc chơi:** người chơi bấm A/B/C/D trên điện thoại. Trả lời đúng và nhanh được nhiều điểm và đẩy xe đi xa hơn, trả lời sai bị trừ điểm. Server tự sang câu tiếp theo.
6. **Kết thúc:** đội có xe đi xa hơn thắng (hòa thì so tổng điểm). Màn hình host hiện top 10 cá nhân.

Các nút của host: **← Trang chủ** (ở sảnh chờ và màn kết quả) đóng phòng và đưa mọi người về màn nhập mã. **← Dừng ván, về sảnh** (khi đang chơi) quay về sảnh, giữ người chơi và đặt lại điểm. **Chơi lại với cùng người chơi** bắt đầu ván mới với những người đã vào.

## Chạy trên máy

Yêu cầu: Node.js >= 18.

```bash
npm install
npm start
```

Mở http://localhost:3000.

## Cấu trúc dự án

```
server.js            Máy chủ Express + Socket.IO (toàn bộ luật chơi nằm ở đây)
data/questions.json  Câu hỏi (text, 4 options, answer = 0..3). Mỗi ván dùng tối đa 15 câu
public/              Giao diện: index.html, host.html (sảnh chờ + soạn câu hỏi), play.html, css/, js/
```

## Tự tạo câu hỏi

Bạn soạn câu hỏi ngay trong sảnh chờ, sau khi tạo phòng: mã phòng vẫn hiện trên màn hình nên người chơi có thể vào trong lúc bạn đang sửa. Bấm **Tạo Phòng (Host)**, rồi mở tab **Câu hỏi** (hoặc nút **Soạn bộ câu hỏi** ở tab Người chơi).

1. Bấm **Tạo bộ mới** và đặt tên, hoặc **Sao chép bộ mặc định** để bắt đầu từ các câu có sẵn.
2. Bấm **Thêm câu hỏi**, nhập câu hỏi và 4 đáp án, rồi tích vào đáp án đúng. Dùng ↑ ↓ để đổi thứ tự, **Nhân đôi** hoặc **Xóa câu** khi cần. Mỗi bộ có tối đa 50 câu và mọi câu phải điền đủ thì bộ mới dùng được.
3. Thay đổi được lưu tự động **ngay trong trình duyệt này** (trên thiết bị của host), không lưu trên máy chủ. Hãy dùng **Xuất JSON** để sao lưu hoặc chuyển bộ câu hỏi sang thiết bị khác, và **Nhập từ file JSON** để đưa lại vào.
4. Bấm **Dùng cho phòng của host** ở bộ vừa soạn, hoặc chọn bộ trong danh sách **Bộ câu hỏi** ở tab Người chơi. Chỉ đổi được khi đang ở sảnh chờ. Bộ chưa hoàn chỉnh sẽ không được dùng: phòng tự quay về bộ mặc định và báo cho bạn. Lựa chọn được nhớ cho phòng lần sau.

5. **Thời gian trả lời:** ở tab Người chơi, chọn **Thời gian mỗi câu** cho cả phòng (từ 5 đến 300 giây, mặc định 20). Trong trình soạn, mỗi câu còn có thể đặt **Thời gian trả lời** riêng; câu có thời gian riêng thì giữ nguyên, các câu còn lại theo thời gian của phòng. Trả lời càng nhanh càng được nhiều điểm so với thời gian của chính câu đó.

Giới hạn: câu hỏi tối đa 200 ký tự, mỗi đáp án tối đa 100 ký tự, thời gian 5 đến 300 giây.

Muốn đổi các câu có sẵn của game thì sửa file `data/questions.json`. Mỗi câu cần `text`, đúng 4 `options` và `answer` (từ 0 đến 3, là vị trí của đáp án đúng). Server kiểm tra file này khi khởi động và sẽ không chạy nếu có câu không hợp lệ.

## Cấu hình (biến môi trường, không bắt buộc)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 3000 | Cổng chạy (Render tự đặt) |
| `TIME_PER_QUESTION` | 20 | Số giây mỗi câu ban đầu (host đổi được trong sảnh chờ) |
| `RESULT_DELAY_MS` | 6000 | Thời gian hiện kết quả trước khi sang câu tiếp |

## Triển khai trên Render.com

1. Đưa code lên GitHub.
2. Trên Render: **New +** → **Web Service** → chọn repo này.
3. Cài đặt: Runtime **Node**, Branch `main`, Build Command `npm install`, Start Command `npm start`, Instance Type **Free**. Chọn region gần người chơi (ở Việt Nam: Singapore). Để trống Root Directory.
4. Trong **Advanced**, đặt **Health Check Path** là `/healthz`.
5. Bấm **Create Web Service**. Khi hiện **Live**, mở `https://<tên-dịch-vụ>.onrender.com`.

Mỗi lần đẩy code lên `main`, Render tự triển khai lại (Auto-Deploy: On Commit).

Lưu ý với gói Free:
- Dịch vụ ngủ sau khoảng 15 phút không có truy cập. Lần mở đầu sau đó mất 30–60 giây, nên hãy mở trang trước giờ chơi vài phút.
- Phòng chơi nằm trong bộ nhớ của máy chủ. Khi dịch vụ ngủ, khởi động lại hoặc triển khai bản mới, mọi phòng đều mất. Hãy cập nhật khi không có ai đang chơi.

Contributors: @nguyenvanhoanglong478-source, @anhmt821152-ctrl, @Claude
