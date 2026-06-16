# OH-MY-NUSANTARA GUIDE

> Mapping guide: oh-my-openagent → oh-my-nusantara

This document maps all agent names, display strings, and content-filter-triggering strings from the upstream `oh-my-openagent` to their Nusantara equivalents.

## Agent Name Mapping

| Upstream (oh-my-openagent) | Nusantara (oh-my-nusantara) | Role |
|---|---|---|
| Sisyphus | Gajah Mada | Primary orchestrator, Ultraworker |
| Hephaestus | Hang Tuah | Deep agent |
| Prometheus | Hayam Wuruk | Plan builder |
| Atlas | Ki Hajar Dewantara | Plan executor |
| Oracle | Mpu Tantular | High-IQ read-only consultant |
| Librarian | Mpu Prapanca | Codebase understanding, docs search |
| Explore | Hang Jebat | Contextual grep for codebases |
| Multimodal-Looker | Laksamana Malahayati | Image/media analysis |
| Metis | Sunan Kalijaga | Pre-planning consultant |
| Momus | Tan Malaka | Plan critic |
| Sisyphus-Junior | Pemuda Sumpah | Delegated task executor |

## Plugin Identity

| Constant | Upstream Value | Nusantara Value |
|---|---|---|
| `PLUGIN_NAME` | `oh-my-openagent` | `oh-my-nusantara` |
| `CONFIG_BASENAME` | `oh-my-openagent` | `oh-my-nusantara` |
| `LEGACY_PLUGIN_NAME` | `oh-my-opencode` | `oh-my-openagent` |

## Config File Detection

The loader detects config files in this priority order:
1. `oh-my-nusantara.json` / `.jsonc` (canonical)
2. `oh-my-openagent.json` / `.jsonc` (legacy)
3. `oh-my-opencode.json` / `.jsonc` (older legacy)

## Subtitles

| Agent | Subtitle |
|---|---|
| Gajah Mada | Ultraworker |
| Hang Tuah | Deep Agent |
| Hayam Wuruk | Plan Builder |
| Ki Hajar Dewantara | Plan Executor |
| Sunan Kalijaga | Plan Consultant |
| Tan Malaka | Plan Critic |
| Mpu Tantular | Oracle |
| Mpu Prapanca | Librarian |
| Hang Jebat | Explorer |
| Laksamana Malahayati | Multimodal Looker |
| Pemuda Sumpah | *(no subtitle)* |

## Attribution

oh-my-nusantara is a fork of [oh-my-openagent](https://github.com/sst/oh-my-opencode) (originally oh-my-opencode) by [Yeongyu Kim](https://github.com/code-yeongyu). The Nusantara edition rebrands agent identities with Indonesian historical figures while maintaining full backward compatibility with the upstream configuration schema and plugin architecture.
