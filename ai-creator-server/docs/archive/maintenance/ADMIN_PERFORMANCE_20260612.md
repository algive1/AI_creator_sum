# Admin Performance Notes

## 2026-06-12

- `admin-web/vite.config.ts` sends all `node_modules` code to a single `vendor` chunk. The vendor chunk is still large because Ant Design and related dependencies are heavy, but it is cacheable across admin pages and future visits.
- `admin-web/src/components/Layout.tsx` keeps pages loaded with `React.lazy` and preloads page chunks during browser idle time after the admin shell is visible. This reduces the loading pause when switching pages after first entry.
- This change only affects admin frontend build output and browser loading behavior. It does not change API behavior, database schema, server runtime, mini program pages, or deployment scripts.
- If a specific admin page is still slow after the shell loads, profile that page's API calls separately, especially pages that request large lists or multiple config endpoints on mount.
