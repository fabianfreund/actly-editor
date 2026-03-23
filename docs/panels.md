# Panel System

## How panels work

1. Each panel is a React component exported as `default` from `src/panels/<PanelName>/index.tsx`
2. Panels are registered in `src/layout/panels.registry.ts`
3. `WorkspaceLayout.tsx` lazy-loads panels via the registry
4. The layout is persisted to `localStorage` on every change

## Adding a new panel

**Step 1** — create the component:
```
src/panels/MyPanel/index.tsx
```

The component receives no props. Use Zustand stores and services for data.

**Step 2** — register it:
```ts
// src/layout/panels.registry.ts
{
  id: "my-panel",
  label: "My Panel",
  component: () => import("../panels/MyPanel"),
},
```

That's it. The panel is now available in the layout. Users can drag it to any position.

## Panel conventions

- Use `.panel-full` class on the root div (`display: flex; flex-direction: column; height: 100%`)
- Use `.panel-header` for the top bar
- Use `.panel-body` for the scrollable content area
- Use CSS custom properties (`var(--bg-base)`, `var(--text-primary)`, etc.) for all colors — never hardcode

## Default layout

```
┌──────────────┬────────────────────┬──────────────┐
│              │   Task Detail      │    Agent     │
│  Task Board  ├────────────────────┴──────────────┤
│              │  Terminal  │  Git  │  Actions      │
└──────────────┴────────────────────────────────────┘
```

Live Preview and Settings are available as additional tabs (not in default layout).

## CSS design tokens

All colors, typography, and spacing are defined as CSS variables in `src/styles/globals.css`.
This is the single place to change the theme. Do not use Tailwind color classes — use the tokens.
