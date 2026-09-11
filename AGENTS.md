<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git: `develop` ≠ `main` (absoluto)

- **Commits / versionamento:** sempre em **`develop`** (ou feature). Nunca em `main`.
- **`main` = produção** (deploy VPS). Só com ordem explícita do responsável.
- Antes de qualquer `git commit` / `git push`: `.cursor/rules/git-main-e-producao.mdc` + `.cursorrules` §9.

