<div align="center">

# 🏝️ oh-my-nusantara

**Plugin OpenCode dengan jiwa Nusantara.**

Multi-model orchestration, parallel agents, LSP/AST tools, dan nama agen warisan Nusantara yang lolos content filter proxy.

[![npm version](https://img.shields.io/npm/v/oh-my-nusantara?color=369eff&labelColor=black&style=flat-square)](https://www.npmjs.com/package/oh-my-nusantara)
[![License](https://img.shields.io/badge/license-SUL--1.0-white?labelColor=black&style=flat-square)](./LICENSE.md)
[![GitHub](https://img.shields.io/badge/github-firdausmntp%2Foh--my--nusantara-369eff?labelColor=black&style=flat-square&logo=github)](https://github.com/firdausmntp/oh-my-nusantara)

</div>

---

## Apa itu oh-my-nusantara?

oh-my-nusantara adalah fork dari [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) yang dirancang untuk pengembang Indonesia dan siapa saja yang membutuhkan nama agen aman dari content filter proxy.

**Masalah:** Provider proxy (terutama China-based) memblokir system prompt yang mengandung frasa `"Powerful AI Agent"` dan `"supersedes any prior identity"`. Akibatnya, plugin AI orkestrator tidak bisa berjalan di belakang proxy tersebut.

**Solusi:** oh-my-nusantara mengganti semua string sensitif dengan phrasing yang lebih soft, dan semua nama agen dengan tokoh sejarah Nusantara. Hasilnya identik secara teknis, tapi lolos content filter.

---

## Kenapa Nusantara?

Setiap nama agen dipilih karena selaras dengan fungsi agen tersebut:

| Tokoh Nusantara | Peran Sejarah | Fungsi Agen | Mengapa Cocok? |
|:----------------|:-------------|:------------|:---------------|
| **Gajah Mada** | Mahapatih Majapahit, Sumpah Palapa | Main Orchestrator | Mengkoordinasi seluruh Nusantara, tidak berhenti sebelum tercapai |
| **Hang Tuah** | Laksamana Melaka yang setia | Deep Agent | Bertugas sampai tuntas, tak bergeser dari misi |
| **Mpu Tantular** | Pencipta *Bhinneka Tunggal Ika* | Konsultan Read-only | Memahami banyak perspektif, memberi nasihat bijak |
| **Mpu Prapanca** | Penulis Negarakertagama | Referensi / Librarian | Mendokumentasikan segala hal dengan teliti |
| **Hang Jebat** | Pendekar yang berani mengintai | Explore / Codebase Grep | Tidak takut menjelajahi wilayah asing |
| **Ki Hajar Dewantara** | Bapak Pendidikan Indonesia | Plan Executor | Mengeksekusi dengan mendidik dan meneladani |
| **Hayam Wuruk** | Raja Majapahit di puncak kejayaan | Plan Builder | Merancang strategi besar sebelum eksekusi |
| **Sunan Kalijaga** | Wali yang memadukan tradisi & pembaruan | Plan Consultant | Sinkretis, melihat dari banyak sudut |
| **Tan Malaka** | Pemikir independen, kritikus tajam | Plan Critic | Menguji setiap asumsi tanpa kompromi |
| **Pemuda Sumpah** | Semangat Sumpah Pemuda 1928 | Category Executor | Energi muda, tugas spesifik, langsung tindak |
| **Laksamana Malahayati** | Laksamana wanita pertama dunia | Vision/PDF Analysis | Melihat dan memahami dokumen visual dengan presisi |

---

## Quick Start

```bash
# Install via bun (recommended)
bunx oh-my-nusantara install

# Atau via npm
npx oh-my-nusantara install
```

Wizard akan memandu Anda memilih model, autentikasi, dan konfigurasi.

---

## Fitur Utama

### 🔄 Mode Ultrawork

Satu kata. Semua agen aktif. Tidak berhenti sampai selesai.

```bash
bunx oh-my-nusantara run "ultrawork buatkan REST API untuk manajemen buku"
```

### 👥 Team Mode

Agen yang terkoordinasi secara paralel. Bukan cuma subagent, tapi tim sesungguhnya.

```jsonc
{
  "team_mode": {
    "enabled": true,
    "max_parallel_members": 4,
    "tmux_visualization": true
  }
}
```

Built-in skills yang pakai Team Mode:
- **`hyperplan`** - 5 agen kritis menelaah rencana dari berbagai sudut
- **`security-research`** - 3 pemburu kerentanan + 2 PoC engineer audit paralel

### 🔗 Subagent Same Model

Subagent pakai model yang sama dengan parent session. Berguna untuk proxy yang cuma support 1 model.

```jsonc
{
  "subagent_same_model": true
}
```

### ✏️ Hash-Anchored Edit (Hashline)

Setiap baris yang dibaca ditandai content hash. Edit merujuk hash tersebut. File berubah? Hash tidak cocok, edit ditolak. Tidak ada kerusakan.

### 🔍 LSP + AST-Grep

Presisi IDE untuk setiap agen. Diagnostics, navigasi, symbols, rename, AST search & rewrite untuk 25 bahasa.

### ⚡ Background Agents

5+ spesialis paralel. Konteks tetap ramping. Hasil siap saat dibutuhkan.

### 🌐 Built-in MCPs

- **Exa** - Web search
- **Context7** - Dokumentasi resmi library
- **Grep.app** - Pencarian kode di GitHub
- **LSP** - Language Server Protocol (stdin MCP)
- **AST-Grep** - Structural code search (stdin MCP)

### 📦 Skill-Embedded MCPs

Skill membawa MCP server sendiri. Aktif saat dibutuhkan, scoped ke tugas, hilang saat selesai.

### 🔁 Ralph Loop / ulw-loop

Loop self-referential yang tidak berhenti sampai 100% selesai.

### ✅ Todo Enforcer

Agen stuck? Sistem menarik kembali. Tugas Anda selesai, titik.

### 🧹 Comment Checker

Tidak ada AI slop di komentar. Kode terbaca seperti ditulis senior engineer.

### 📜 Rules Injection

`AGENTS.md` dan `.omo/rules/**` auto-loaded ke konteks agen.

### 🏗️ `/init-deep`

Auto-generate hierarchical `AGENTS.md` di seluruh proyek. Token efficiency dan performa agen meningkat.

---

## Arsitektur

```
oh-my-nusantara/
├── packages/
│   ├── omo-opencode/          # Plugin adapter OpenCode
│   │   └── src/
│   │       ├── agents/        # 11 agen (Gajah Mada, Hang Tuah, ...)
│   │       ├── hooks/         # 55+ lifecycle hooks
│   │       ├── tools/         # 13 native tools
│   │       ├── features/      # 22 feature modules
│   │       ├── config/        # Zod v4 schema system
│   │       ├── cli/           # CLI: install, run, doctor
│   │       └── mcp/           # 5 built-in MCPs
│   ├── utils/                 # Utilities
│   ├── model-core/            # Model capabilities & fallback chains
│   ├── prompts-core/          # Prompt templates
│   └── shared-skills/         # Skills bundle
├── bin/                       # CLI shims
├── docs/                      # Dokumentasi
└── .omo/                      # AI agent workspace
```

---

## Konfigurasi

```jsonc
// ~/.config/opencode/oh-my-nusantara.jsonc
{
  "$schema": "https://raw.githubusercontent.com/firdausmntp/oh-my-nusantara/dev/assets/oh-my-opencode.schema.json",

  // Override model per agen
  "agents": {
    "sisyphus": { "model": "kimi/k2.6" }
  },

  // Subagent pakai model yang sama dengan parent
  "subagent_same_model": true,

  // Nonaktifkan hook tertentu
  "disabled_hooks": ["comment-checker"],

  // Team Mode
  "team_mode": {
    "enabled": false,
    "max_parallel_members": 4
  }
}
```

**Lokasi konfigurasi** (prioritas tinggi ke rendah):
1. `<project>/.opencode/oh-my-nusantara.jsonc`
2. `~/.config/opencode/oh-my-nusantara.jsonc`
3. Default (Zod safeParse)

---

## Perintah CLI

```bash
bunx oh-my-nusantara install       # Setup wizard interaktif
bunx oh-my-nusantara doctor        # Diagnostik kesehatan
bunx oh-my-nusantara run <pesan>   # Sesi non-interaktif
```

---

## Kontribusi

Kontribusi welcome!

1. Fork repo ini
2. Buat branch feature (`git checkout -b fitur/nama-fitur`)
3. Commit perubahan (`git commit -m 'Tambahkan nama fitur'`)
4. Push ke branch (`git push origin fitur/nama-fitur`)
5. Buka Pull Request

**Catatan:** Ikuti style guide yang ada, tulis test untuk fitur baru, dan pastikan `bun run typecheck` bersih.

---

## Lisensi

Fork dari [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) oleh [@code-yeongyu](https://github.com/code-yeongyu), dilisensikan di bawah **SUL-1.0 License**.

Lihat [LICENSE.md](./LICENSE.md) untuk detail lengkap.

---

## Penghargaan

- [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) oleh [@code-yeongyu](https://github.com/code-yeongyu) - upstream
- [oh-my-china](https://github.com/enowdev/oh-my-china) oleh [@enowdev](https://github.com/enowdev) - inspirasi content filter bypass
- [AmpCode](https://ampcode.com) dan [Claude Code](https://code.claude.com/docs/overview) - inspirasi arsitektur
- Seluruh tokoh sejarah Nusantara yang menjadi nama agen

---

<div align="center">

*"Gajah Mada tidak akan berhenti sebelum seluruh Nusantara bersatu."*

**Dibuat oleh [firdausmntp](https://github.com/firdausmntp)**

</div>
