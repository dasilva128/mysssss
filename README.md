# 🚀 Cloudflare Scanner Panel

پنل Cloudflare Only برای اجرای اسکن HTTP/HTTPS/WebSocket روی Cloudflare Workers، بدون VPS.

> ⚠️ این پروژه وجود VLESS واقعی را تأیید نمی‌کند. لینک‌های VLESS خروجی فقط template هستند و نباید به‌عنوان کانفیگ تأییدشده تلقی شوند.

## معماری

- Cloudflare Workers
- Workers Static Assets
- Cloudflare D1
- Wrangler
- GitHub Actions

## 1. ساخت D1

در Cloudflare یک D1 با نام زیر بساز:

`cloudflare-scanner-db`

سپس Database ID را در `wrangler.jsonc` جایگزین کن:

`REPLACE_WITH_D1_DATABASE_ID`

## 2. ساخت API Token

در Cloudflare یک API Token محدود برای Deploy بساز و دسترسی لازم برای Workers و D1 را بده.

## 3. GitHub Secrets

در Repository برو:

Settings → Secrets and variables → Actions

این دو Secret را اضافه کن:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

هرگز Token را داخل README، کد، issue یا commit قرار نده.

## 4. Deploy

فایل `.github/workflows/deploy.yml` با هر push روی `main` اجرا می‌شود:

1. نصب Wrangler
2. اجرای migrationهای D1
3. Deploy Worker + static assets

برای اجرای دستی:

GitHub → Actions → Deploy Cloudflare Scanner → Run workflow

## 5. آدرس

پس از Deploy، Cloudflare URL مربوط به Worker را در خروجی Action نشان می‌دهد؛ معمولاً:

`https://cloudflare-scanner-panel.<subdomain>.workers.dev`

## محدودیت‌های فعلی

- حداکثر 10 IP
- حداکثر 5 پورت
- حداکثر 15 ترکیب IP/Port
- concurrency حداکثر 4
- timeout حداکثر 5000ms
- نتیجه از دید Cloudflare Worker است، نه دستگاه کاربر
- WebSocket probe به‌تنهایی اثبات وجود یک سرویس VLESS نیست

## توسعه محلی

```bash
npm install
npm run dev
```

## امنیت

API Token فقط باید در GitHub Actions Secret باشد.

اگر Token قبلاً در Git commit شده است، آن را revoke/rotate کن؛ حذف فایل از commitهای جدید کافی نیست.

## License

For personal and authorized network testing only.
