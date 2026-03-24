# GitHub Pages Plan for Actly Editor

## Overview
Create a GitHub Pages site for the Actly Editor repository with a dark theme and gradient background.

## Current Project State
- **Framework**: Vite + React 19 + TypeScript
- **Existing Theme**: VS Code Dark+ inspired (dark theme already in `src/styles/globals.css`)
- **Build System**: Already has `npm run build` that produces static assets

## What You Need To Do

### Step 1: Add GitHub Pages Scripts
Update `package.json` to add deployment scripts:
```json
"homepage": "https://fabianfreund.github.io/actly-editor",
"predeploy": "npm run build",
"deploy": "npx gh-pages -d dist"
```

You'll need to install `gh-pages` as a dev dependency:
```bash
npm install --save-dev gh-pages
```

### Step 2: Configure Base Path
Update `vite.config.ts` to handle GitHub Pages subdirectory:
```typescript
export default defineConfig({
  base: '/actly-editor/',
  // ... rest of config
})
```

### Step 3: Update index.html for GitHub Pages
Modify `index.html` to be more suitable as a landing page (or create a separate landing page).

### Step 4: Create Dark Theme + Gradient CSS
Add a landing page stylesheet with:
- Dark background matching VS Code colors (`#1e1e1e`)
- Gradient background (subtle dark gradient from deep purple/blue to dark)
- Landing page specific styling

Example gradient background:
```css
body.landing {
  background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 50%, #16213e 100%);
  min-height: 100vh;
}
```

### Step 5: Create Landing Page Content
Build a landing page with:
- Hero section with app name and tagline
- Features overview
- Screenshots
- Installation instructions
- Link to GitHub repo

### Step 6: Set Up GitHub Pages in Repository Settings
1. Go to repository Settings → Pages
2. Source: Deploy from a branch
3. Branch: `gh-pages` / `(root)`
4. Or use GitHub Actions (recommended)

### Step 7: Add GitHub Actions Workflow (Optional but Recommended)
Create `.github/workflows/deploy.yml` for automated deployment.

## Commands to Run

```bash
# Install gh-pages
npm install --save-dev gh-pages

# Build and deploy manually (after configuring)
npm run deploy
```

## Alternative: Use Vite's Built-in Preview
You can also use `npm run preview` to test the built site locally before deploying.

## Summary
- **Dependencies to add**: `gh-pages`
- **Files to modify**: `package.json`, `vite.config.ts`, `index.html`, add new CSS
- **New files to create**: Landing page styles, optional GitHub Actions workflow
- **GitHub setup**: Enable Pages in repository settings
