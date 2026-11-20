---
title: Mermaid to tldraw Meeting Demo
---

# Mermaid -> tldraw meeting demo

This page is powered by `astro-mermaid-tldraw`.

- Mermaid renders in **Preview** mode.
- Use **Open in tldraw** to get an editable meeting canvas.
- Drafts are stored in browser local storage, so reload does not wipe changes.
- Source markdown is unchanged.

## System architecture

```mermaid
flowchart TD
  User[User opens docs page] --> Preview[Mermaid preview]
  Preview --> Open[Open in tldraw]
  Open --> Canvas[tldraw freeform edits]
  Canvas --> Local[(Local draft only)]
  Local --> Reload[Reload page]
  Reload --> Restore[Draft restored]
```

## Meeting flow

```mermaid
sequenceDiagram
  participant A as Author
  participant B as Team
  A->>B: Open docs and discuss diagram
  B->>A: Edit boxes/arrows live in tldraw
  A->>B: Keep public docs unchanged
```

## SVG-first fidelity in meeting mode

The editor is seeded from Mermaid SVG and mapped to native tldraw nodes/connectors, so what you discuss in meetings stays editable and visually closer to preview.

```mermaid
classDiagram
  class DiagramSource {
    +string mermaid
    +string sourceHash
  }
  class MeetingDraft {
    +string localStorageKey
    +json snapshot
  }
  DiagramSource --> MeetingDraft
```

## Figure compatibility fixture

```mermaid
flowchart TB
  subgraph Core figures
    A[Rectangle] --> B(Rounded)
    B --> C([Stadium])
    C --> D[[Subroutine]]
    D --> E[(Database)]
    E --> F((Circle))
    F --> G{Decision}
  end

  subgraph Angled figures
    H>Asymmetric] --> I[/Parallelogram/]
    I --> J[\Parallelogram alt\]
    J --> K[/Trapezoid\]
    K --> L[\Trapezoid alt/]
    L --> M{{Hexagon}}
  end

  G --> H
  G -. dashed .-> I
  G ==> M
```
