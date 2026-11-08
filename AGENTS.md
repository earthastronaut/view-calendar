# Coding Rules

## Untracked

IGNORE folders or files with `untracked_` as the prefix.

## Specs

Do not read from `./specs/` unless looking for a specific plan for your changes.

## Package Manager

Use `pnpm` only. Never run `npm`, `npx`, or `yarn`, and never create or commit `package-lock.json` or `yarn.lock`. The lockfile is `pnpm-lock.yaml`.

## Code Style

**Import Statements**

✅ `import type { ComponentProps } from "react"`
❌ `import * as React from "react"`
EXCEPT: `import * as z from "zod"`

**Function Declarations**

✅ `function Component(props: ComponentProps) { ... }`
❌ `const Component = (props) => { ... }`

Use Expo / React Native `Image` (or a shared `packages/ui` image wrapper), not raw web `<img>` in shared or mobile UI.

## Environment Variables

Put at top of files:

```ts
const CONFIG = {
  VERBOSE: process.env.VERBOSE,
  ENABLED: process.env.ENABLED,
}
```

Real values live in Railway variables and gitignored `envs/` files. Only `*.env.example` is committed.

## Error Handling

Use `unknown` in catch blocks, never `any`. Narrow type before accessing properties. Use `instanceof Error` check, fall back to `String(error)`.

API errors use one problem+JSON shape with a stable `type` per error.

## React Hooks

Avoid `useEffect` - compute during render, handle in event callbacks, use explicit branching. Don't use `useEffect` for: transforming props to state, derived values, fetching based on props, syncing state. Use `useEffect` only for: subscriptions, timers, DOM/native imperative APIs (with cleanup). Prefer TanStack Query for server state.

```tsx
// ✅ Compute during render
function PersonProfile({ person }) {
  const displayName = person.displayName ?? person.email ?? 'Anonymous'
  return <Text>{displayName}</Text>
}

// ✅ Explicit branching
function EventDetails({ eventId }) {
  if (!eventId) return <Text>No event selected</Text>
  const event = useEvent(eventId)
  if (!event) return <Loading />
  return <EventView event={event} />
}

// ✅ Event handlers in callbacks
const handleSubmit = useCallback(
  (e) => {
    e.preventDefault()
    onSearch(query)
  },
  [query, onSearch]
)

// ✅ Memoization with correct deps
const totalCents = useMemo(
  () => entries.reduce((sum, e) => sum + e.amountCents, 0),
  [entries]
)
```

**Decision tree**: Rendering? → `useMemo`/variable | User action? → callback | Side effect? → `useEffect` | Conditional UI? → `if/else` or `&&`

**Linting**: `react-hooks/rules-of-hooks: error`, `react-hooks/exhaustive-deps: error` (never disable without explanation)

## Component Extraction

Extract JSX blocks that are more than a few lines, or when mapping over data to render similar structures.

```tsx
// ✅ Extract complex/repeated JSX
function EventCard({ event }: { event: Event }) {
  return <View>...</View>
}
{
  events.map((event) => <EventCard key={event.id} event={event} />)
}

// ✅ OK: Simple one-liners can stay inline
{
  items.map((item) => <Text key={item.id}>{item.name}</Text>)
}
{
  isLoading && <Spinner />
}
```

**Extraction Thresholds**:

- **Always extract**: Conditional blocks (modals, dialogs, bottom sheets) over **30 lines**
- **Always extract**: Any JSX block over **40 lines**
- **Consider extracting**: Blocks 20-40 lines with complex structure, multiple handlers, or that hurt readability

```tsx
// ❌ Large conditional block inline
{
  isSheetOpen && <View>{/* 30+ lines */}</View>
}

// ✅ Extract to helper component
function CheckInSheet({
  isOpen,
  onClose,
  eventId,
}: {
  isOpen: boolean
  onClose: () => void
  eventId: string
}) {
  if (!isOpen) return null
  return <View>{/* sheet content */}</View>
}
```

**State Management**: When extracting, decide where state should live:

- **Keep state in parent** if it's needed elsewhere or affects multiple components
- **Move state to extracted component** if it's only used within that component (e.g., sheet open/close)

```tsx
// ✅ State in parent - needed elsewhere
function Parent() {
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  return (
    <>
      <Button onPress={() => setIsSheetOpen(true)}>Open</Button>
      <CheckInSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} />
    </>
  )
}

// ✅ State in extracted component - only used internally
function Collapsible({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return isOpen ? (
    <View>{children}</View>
  ) : (
    <Button onPress={() => setIsOpen(true)}>Open</Button>
  )
}
```

**Component Definitions**:

- **Never use `useMemo` for component definitions** - `useMemo` is for values, not components
- **Always extract components defined inside other components** - they're recreated every render, making `memo()` ineffective
- **Extract to same file above parent**, or separate file if reused elsewhere

```tsx
// ❌ Component defined inside - recreated every render
function Parent() {
  const Child = memo(function Child({ prop }: { prop: string }) {
    return <Text>{prop}</Text>
  })
  return <Child prop="value" />
}

// ✅ Extract outside - stable reference
const Child = memo(function Child({ prop }: { prop: string }) {
  return <Text>{prop}</Text>
})

function Parent() {
  return <Child prop="value" />
}
```

Design phone-first (cards, swipe actions, bottom sheets). Prefer `.web.tsx` only when a desktop-only dense view truly needs a browser library.

## Helper Functions

Keep helper functions private to their component module unless they're used by another module.

**Making functions private**: Don't export helpers used only within the same file. Use `function` declarations (not arrow functions).

**Decision rule**: Keep private if only used in one file/module. Extract to shared location if imported by 2+ modules. Shared domain logic belongs in `packages/domain`; shared Zod shapes in `packages/contracts`.
