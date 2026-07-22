---
"@oh-just-another/scene": minor
"@oh-just-another/state": patch
---

Recover media dropped with a generic MIME. A file handed over with an empty `File.type` (some drag sources / extension-less downloads) was stored as `application/octet-stream`, and rehydration — which routes image-vs-video decoding by mime — sent it to the wrong decoder, so the shape reloaded blank. Persistence now infers the mime from the filename extension (`inferFileMime`), and rehydration falls back to magic-byte sniffing (`sniffBinaryFileMime` in scene: mp4/webm/ogg/png/jpeg/gif/webp/svg) for already-stored generic entries.
