# Hướng dẫn thiết lập Google Service Account

## Mục đích
Service Account được sử dụng để dashboard tự động truy cập Google Sheets và Google Drive mà không cần đăng nhập thủ công.

## Các bước thực hiện

### 1. Tạo Service Account trên Google Cloud Console

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Chọn project của bạn (hoặc tạo project mới)
3. Vào **IAM & Admin** → **Service Accounts**
4. Click **+ CREATE SERVICE ACCOUNT**
5. Điền thông tin:
   - **Service account name**: `meta-dashboard`
   - **Service account ID**: `meta-dashboard` (tự động)
   - **Description**: `Service account for Meta Marketing Dashboard`
6. Click **CREATE AND CONTINUE**
7. Role: Chọn **Basic** → **Editor** (hoặc để trống)
8. Click **CONTINUE** → **DONE**

### 2. Tạo và tải xuống JSON Key

1. Click vào Service Account vừa tạo
2. Vào tab **KEYS**
3. Click **ADD KEY** → **Create new key**
4. Chọn **JSON** → **CREATE**
5. File JSON sẽ tự động tải xuống
6. **Đổi tên file** thành `google-service-account.json`
7. Di chuyển file vào thư mục gốc của project:
   ```
   /Users/de-2010/Documents/Social Commerce/Programs/meta-marketing-dashboard/google-service-account.json
   ```

### 3. Enable Google Sheets API và Drive API

1. Vào [Google Cloud Console](https://console.cloud.google.com/)
2. Chọn project của bạn
3. Vào **APIs & Services** → **Library**
4. Tìm và enable các API sau:
   - **Google Sheets API**
   - **Google Drive API**

### 4. Share Sheet và Drive Folder cho Service Account

#### 4.1. Share Google Sheet

1. Mở file email từ file JSON key (field `client_email`)
   - Ví dụ: `meta-dashboard@your-project.iam.gserviceaccount.com`
2. Mở Google Sheet của bạn: [Content Plan Sheet](https://docs.google.com/spreadsheets/d/156YMvIE-TIwtKFXcM8yaC0CcLRrBWROhFFJN6x_GNTw)
3. Click nút **Share** (góc trên phải)
4. Paste email service account vào
5. Chọn quyền **Editor** (để có thể cập nhật trạng thái)
6. Click **Send**

#### 4.2. Share Drive Folder

1. Mở [Drive Folder](https://drive.google.com/drive/folders/1DFFmTHYhvPF0zTiMV3bTik5dCo2BvCh3)
2. Click nút **Share**
3. Paste email service account vào
4. Chọn quyền **Viewer** (chỉ cần đọc để download ảnh)
5. Click **Send**

### 5. Kiểm tra cấu hình

Sau khi hoàn tất các bước trên, kiểm tra file `.env`:

```env
CONTENT_PLAN_SHEET_ID=156YMvIE-TIwtKFXcM8yaC0CcLRrBWROhFFJN6x_GNTw
CONTENT_PLAN_DRIVE_FOLDER_ID=1DFFmTHYhvPF0zTiMV3bTik5dCo2BvCh3
GOOGLE_SERVICE_ACCOUNT_PATH=./google-service-account.json
```

### 6. Test kết nối

Khởi động lại server và test:

```bash
# Restart server
npm start

# Hoặc nếu đang chạy
# Ctrl+C rồi chạy lại
```

Mở dashboard tại http://localhost:3110, vào tab **Content Plan** và click **Sync Now**.

Nếu thành công, bạn sẽ thấy danh sách content items từ Google Sheet.

## Cấu trúc file JSON Key

File `google-service-account.json` có cấu trúc như sau:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "meta-dashboard@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

**⚠️ QUAN TRỌNG**: 
- KHÔNG commit file `google-service-account.json` lên Git
- File này đã được thêm vào `.gitignore`
- Giữ file này bí mật như password

## Xử lý sự cố

### Lỗi "File service account không tồn tại"
- Kiểm tra đường dẫn trong `.env` có đúng không
- Kiểm tra file `google-service-account.json` có tồn tại trong thư mục gốc không

### Lỗi "Permission denied" khi đọc Sheet
- Kiểm tra đã share Sheet cho service account email chưa
- Kiểm tra quyền **Editor** đã được cấp chưa

### Lỗi "File not found" khi download ảnh
- Kiểm tra đã share Drive Folder cho service account chưa
- Kiểm tra tên file trong Sheet có khớp với tên file trong Drive không

### Lỗi "API not enabled"
- Vào Google Cloud Console và enable Google Sheets API / Drive API
- Đợi vài phút sau khi enable rồi thử lại

## Bảo mật

- Service Account chỉ có quyền truy cập vào các tài nguyên được share cụ thể
- KHÔNG share service account email cho người khác
- Rotate key định kỳ (mỗi 90 ngày) nếu cần
- Sử dụng IAM roles tối thiểu (chỉ cần Editor cho Sheet, Viewer cho Drive)

## Tài liệu tham khảo

- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Google Drive API Documentation](https://developers.google.com/drive/api)
- [Service Accounts Overview](https://cloud.google.com/iam/docs/service-accounts)
