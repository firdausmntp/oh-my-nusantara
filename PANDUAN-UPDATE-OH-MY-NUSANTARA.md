# Panduan Update oh-my-nusantara (OpenCode V2)

## Status saat ini

**Selesai di-port ke V2.** Plugin dual-export `{ id, server, setup }`:
`server` untuk host V1, `setup` untuk host V2. Di OpenCode `2.0.26`
plugin muncul **`active`** (bukan `failed`) — 12 agent (Gajah Mada,
Hang Tuah, Hayam Wuruk, Hang Jebat, Laksamana Malahayati, Mpu
Prapanca, Mpu Tantular, Sunan Kalijaga, Tan Malaka, ...) dan 13 tool
ter-project. Bukti QA live: `.omo/evidence/20261011-v2-bridge/evidence.md`.

Bridge ada di `packages/omo-opencode/src/v2/`; `setup` memakai ulang
factory V1 (`serverPlugin(v1Input)`), jadi behavior V1 tidak berubah —
hanya diadapt ke API V2 (`ctx.agent.transform`, `ctx.tool.transform`,
`ctx.mcp.transform`, hook V2). Keterbatasan diketahui: JSON-schema
input tool fallback ke nama parameter saja (campur `tool.schema` dan
`zod` bare per tool); tool tetap terdaftar dan bisa dieksekusi.

## Root cause (dulu, sebelum port)

Versi `0.2.0` (entrypoint `dist/index.js`) format **plugin V1**:
default export `{ id, server }`. OpenCode V2 hanya menerima
`{ id, setup }` atau `{ id, effect }`. Aturan resminya: **V1 plugin
implementations do not run in V2** — harus di-port oleh author.

## Catatan config V2

Key config V2 adalah **`plugins`** (V1: `plugin`):

```jsonc
"plugins": [
  "oh-my-nusantara",       // nama paket npm
  "./path/ke/plugin-dir",  // direktori lokal; file langsung ditolak
]
```

File `.opencode/plugins/*.ts` auto-ditemukan tanpa config.

## Cara update (saat author sudah rilis versi fix)

1. Cek versi terbaru:
   ```powershell
   npm view oh-my-nusantara versions --json
   ```
2. Kalau ada versi baru di atas `0.2.0`, update entri plugin di `~/.config/opencode/opencode.json`, misal:
   ```jsonc
   "plugins": [
     "oh-my-nusantara@<versi-baru>",
     ...
   ]
   ```
3. Restart service agar plugin di-load ulang:
   ```powershell
   opencode service restart
   ```
4. Buka OpenCode → layar Plugins → pastikan `oh-my-nusantara` tidak lagi `failed`.
   Kalau masih `failed`, tekan `enter` di barisnya untuk lihat detail error.

## Verifikasi setelah update

- [ ] `oh-my-nusantara` hilang dari daftar `failed` di layar Plugins
- [ ] Tidak ada lagi baris `failed to load plugin target=oh-my-nusantara` di `opencode.log`
- [ ] Agents dari plugin (Gajah Mada, Hang Tuah, Hayam Wuruk, ...) bisa dipakai sesi baru
