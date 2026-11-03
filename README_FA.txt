نو+آوینه — بسته همگام‌سازی آنلاین ایتا با Cloudflare Workers + D1

این بسته شامل:
- worker.js: دریافت صفحه عمومی ایتا، استخراج پست‌های قابل مشاهده، دسته‌بندی هشتگ/کلیدواژه، ذخیره/به‌روزرسانی در D1 و API خواندن
- schema.sql: ساخت جدول‌ها
- wrangler.toml: زمان‌بندی هر ۱۰ دقیقه
- public/index.html: رابط وب/وب‌ویو که مطالب را از API می‌خواند
- package.json: وابستگی‌ها

محدودیت بسیار مهم:
ایتا API عمومی مستندشده برای خواندن همه پست‌های کانال ارائه نکرده است. این پیاده‌سازی HTML صفحه عمومی را می‌خواند؛ استخراج‌گر بر اساس چند الگوی متداول DOM نوشته شده و باید با پاسخ واقعی ایتا روی حساب Cloudflare آزمایش شود. اگر ایتا HTML را تغییر دهد یا دسترسی Worker را مسدود کند، باید parser اصلاح شود. فقط پست‌هایی که در صفحه عمومی قابل مشاهده‌اند دریافت می‌شوند؛ این کد ادعا نمی‌کند همه آرشیو قدیمی را backfill می‌کند. ویدئو/تصویر دانلود نمی‌شود؛ فقط URLهای قابل مشاهده ذخیره می‌شوند.

پیش‌نیاز:
- حساب Cloudflare (رایگان برای شروع)
- Node.js نصب‌شده روی کامپیوتر
- Wrangler CLI

مراحل نصب:
1) این ZIP را Extract کن.
2) داخل پوشه پروژه Terminal باز کن:
   npm install
3) وارد Cloudflare شو:
   npx wrangler login
4) پایگاه داده D1 بساز:
   npx wrangler d1 create noavine-live-db
   شناسه database_id را از خروجی بردار و در wrangler.toml جایگزین REPLACE_WITH_D1_DATABASE_ID کن.
5) ساخت جدول‌ها:
   npx wrangler d1 execute noavine-live-db --remote --file=./schema.sql
6) کلید مدیریت تصادفی بساز و به‌عنوان Secret ثبت کن:
   npx wrangler secret put ADMIN_KEY
   یک مقدار طولانی و غیرقابل حدس وارد کن. این کلید را داخل HTML یا در اختیار کاربران قرار نده.
7) Deploy:
   npx wrangler deploy
   آدرس Worker را از خروجی کپی کن.
8) یک بار همگام‌سازی دستی برای تست:
   curl -X POST "https://YOUR-WORKER.workers.dev/api/sync" -H "Authorization: Bearer YOUR_ADMIN_KEY"
9) وضعیت را بررسی کن:
   https://YOUR-WORKER.workers.dev/api/health
   و فهرست مطالب:
   https://YOUR-WORKER.workers.dev/api/posts
10) در public/index.html مقدار API_BASE را با آدرس Worker جایگزین کن.
11) همین public/index.html را به HTML to APK Builder بده. برای نمایش درست، برنامه باید اجازه اینترنت داشته باشد.

زمان‌بندی:
Cron در wrangler.toml روی هر ۱۰ دقیقه تنظیم شده و Cloudflare Cron با UTC اجرا می‌شود. پس از Deploy، اولین اجرای زمان‌بندی‌شده ممکن است تا نوبت بعدی طول بکشد.

نکته‌های عیب‌یابی:
- اگر /api/health سالم است ولی posts خالی است، درخواست POST /api/sync را با ADMIN_KEY اجرا کن.
- اگر پاسخ sync گفت Parser found no posts، با /api/debug?key=ADMIN_KEY کلاس‌های HTML را بررسی کن. این خروجی فقط برای عیب‌یابی است و باید کلید را محرمانه نگه داری.
- اگر Cloudflare از دریافت eitaa.com خطا داد، این سرویس در آن لحظه قادر به همگام‌سازی نیست؛ دور زدن محدودیت یا تضمین پایداری ممکن نیست.
- برای جلوگیری از درج تکراری، شناسه پیام کلید اصلی جدول است.
- کد، متن و URL رسانه را ذخیره می‌کند؛ فایل‌های رسانه را دانلود نمی‌کند.

امنیت:
ADMIN_KEY فقط به صورت Secret در Cloudflare ذخیره شود. آن را در HTML، APK، Git عمومی یا اسکرین‌شات منتشر نکن.


--- تنظیمات اختصاصی دیتابیس نو+آوینه ---
این نسخه از قبل با شناسه دیتابیس شما تنظیم شده است.
Database name: noavine-live-db
Database ID: 350a04da-3eb2-4988-a7d2-a108ad3805a4
فایل wrangler.toml از قبل مقدار database_id را دارد؛ نیازی به ویرایش آن نیست.
