# MailTicking Telegram Bot for Vercel

Telegram bot serverless dengan `grammY`, `TypeScript`, `Playwright`, Vercel Functions, Upstash Redis, dan Upstash QStash.

## Fitur phase 1

- `/start` untuk welcome + inline keyboard
- `/generate` untuk membuat email temporary dari `https://www.mailticking.com/`
- `/refresh` untuk refresh inbox terbaru
- `/inbox` untuk lihat daftar email subject + preview
- `/history` untuk melihat riwayat email dan restore email lama
- password saran acak 12 karakter, mudah dibaca, dengan huruf besar, huruf kecil, dan angka
- nama rekomendasi + tanggal lahir acak dengan umur minimal 25 tahun
- 5 rekomendasi profil Korea sintetis: nama, alamat, kota/kabupaten, dan kode pos
- rate limit dan session per user
- auto-expire data mailbox dan history setelah 30 hari via Redis TTL
- ID/EN language toggle

## Arsitektur

- `api/telegram.ts` adalah satu-satunya webhook Telegram
- `api/jobs/mailticking.ts` adalah worker background untuk scraping MailTicking
- Telegram webhook selalu cepat, job berat dikirim ke QStash
- session utama disimpan di Upstash Redis
- storage state browser dipisah per user untuk bantu restore sesi MailTicking

## Environment variables

Salin `.env.example` lalu isi:

```bash
BOT_TOKEN=
WEBHOOK_SECRET=
APP_BASE_URL=https://your-project.vercel.app
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
PROXY_URL=
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=false
```

Keterangan:

- `APP_BASE_URL` dipakai QStash untuk memanggil worker internal
- `PROXY_URL` opsional untuk future VPN rotation / proxy routing
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=false` disarankan untuk local install dan smoke test

## Setup lokal

1. Install dependency

```bash
npm install
```

2. Install browser Chromium untuk local test

```bash
npm run playwright:install
```

3. Jalankan typecheck

```bash
npm run build
```

4. Jalankan local Vercel dev

```bash
npm run dev
```

Catatan: mode hardened memakai QStash. Untuk benar-benar mengetes flow background job dari lokal, gunakan local tunnel atau deploy preview ke Vercel.

## Deploy ke Vercel

1. Push repo ini ke GitHub
2. Import project ke Vercel
3. Isi seluruh environment variables di dashboard Vercel
4. Deploy
5. Set webhook Telegram ke `https://your-project.vercel.app/api/telegram`

## Curl set webhook

```bash
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://your-project.vercel.app/api/telegram\",\"secret_token\":\"${WEBHOOK_SECRET}\"}"
```

## Curl hapus webhook

```bash
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook"
```

## Struktur project

```text
.
├── api/
│   ├── telegram.ts
│   └── jobs/
│       └── mailticking.ts
├── locales/
│   ├── en.ftl
│   └── id.ftl
├── src/
│   ├── bot.ts
│   ├── config.ts
│   ├── jobs.ts
│   ├── keyboards.ts
│   ├── messages.ts
│   ├── queue.ts
│   ├── scraper.ts
│   ├── sessions.ts
│   ├── types.ts
│   └── utils.ts
├── .env.example
├── package.json
├── playwright.config.ts
├── tsconfig.json
└── vercel.json
```

## Catatan produksi

- runtime production menggunakan `playwright-core` + `@sparticuz/chromium`
- library `playwright` juga dipasang untuk local browser install dan config file
- MailTicking dapat berubah sewaktu-waktu. Parser dibuat defensif, tapi jika markup endpoint berubah besar, update scraper mungkin tetap diperlukan
- TTL Redis 30 hari menggantikan cron cleanup sehingga mailbox session dan history akan terhapus otomatis

## Phase 2 hooks yang sudah disiapkan

- CAPTCHA provider placeholder di session model
- proxy URL env untuk rotasi VPN / geo routing
- queue worker terpisah untuk survey automation
- struktur extensible untuk `/survey [url]`, faker profile, dan form filler
