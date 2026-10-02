# Dram (Draw)

App macOS per asset di gioco: disegno vettoriale, pixel art e modellazione 3D semplice.

Poche azioni, sempre le stesse, pensate per esportare in Godot (e altri engine) senza passare da Blender o Pixelorama.

## Certificazione d'uso

**Uso privato / personale soltanto. Uso commerciale vietato.**  
Vedi [`LICENSE`](LICENSE).

## Stack

- Electron (desktop macOS)
- HTML / CSS / JS
- Packaging: electron-builder (DMG / dir arm64)

## Tre tavoli

| Tavolo | Uso |
| --- | --- |
| **Disegno** | Concept, icone, sagome vettoriali |
| **Pixel** | Sprite, tile, icone low-res |
| **Modello** | Props e primitive 3D con merge |

Azioni condivise: selezione, forme, linea, curva, merge/sottrai, sposta, elimina, undo/redo, export.

## Avvio

```bash
npm install
npm start
```

Build macOS:

```bash
npm run build
```

Output in `release/`.

## Struttura

```text
Draw/
├── index.html
├── css/
├── js/
├── electron/main.cjs
├── logo/
├── vendor/
└── PRD.md
```

## Documentazione

- [`PRD.md`](PRD.md) — requisiti e scope

## Autore

Bruno Feraz
