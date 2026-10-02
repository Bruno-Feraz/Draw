# PRD — Draw

App Mac per asset semplici da videogioco: disegno, pixel art e modellazione 3D. Poche funzioni, complete e prevedibili.

**Stato:** bozza v0.1 — da iterare insieme  
**Piattaforma:** macOS (app nativa)  
**Utente:** chi fa giochi e vuole forme, sprite e modelli senza imparare Blender, Pixelorama o Illustrator

---

## 1. Perché esiste

Hai già usato Obsidian, Excalidraw, Pixelorama e Blender. Funzionano, ma per un rettangolo, un arco, un merge o un cubo con un buco richiedono troppi passaggi, pannelli e concetti.

Draw esiste per fare **solo** quello che ti serve per i giochi:

- tracciare linee e curve e aggiustarle
- usare forme come in Paint
- unire e tagliare (merge / sottrai)
- ripetere lo stesso gesto in 2D, pixel e 3D
- esportare e usare l’asset in Godot (e altri engine)

Se una funzione non serve a questo ciclo, **non entra**.

---

## 2. Principi

1. **Poche azioni, sempre le stesse.** Selezione, forma, linea, curva, bussola, merge, sposta, elimina. Stesso vocabolario in Disegno, Pixel e 3D.
2. **Quello che vedi è l’oggetto.** Niente nodi nascosti, modificatori in coda, layer infiniti. Ogni pezzo è una forma che puoi toccare.
3. **Merge visibile.** Unisci, sottrai, interseca, ritaglia. Il risultato è una forma sola. Undo immediato.
4. **Aggiusta, non rifai.** Dopo aver tracciato una linea o un arco, ne cambi curvatura, raggio, angoli, spessore.
5. **Export prima dell’editor avanzato.** PNG, SVG, sprite sheet, GLB/OBJ. Se non esce dal programma, non è finito.
6. **Un documento, tre tavoli.** Stesso file di progetto: `disegno`, `pixel`, `modello`. Si passa da uno all’altro senza cambiare app.

---

## 3. Cosa non è (fuori scope v1)

Non copiamo:

- Blender: mesh editing, UV, shader, armature, fisica
- Pixelorama: animazione avanzata, onion skin, tilemap da editor
- Excalidraw / Obsidian: diagrammi, note, link, collaborazione
- Illustrator: tipografia da stampa, effetti, 200 brush

Fuori anche: multiutente, cloud obbligatorio, plugin store, scripting, AI generazione.

Queste cose possono entrare **dopo**, solo se risolvono un asset di gioco concreto.

---

## 4. Prodotto in tre tavoli

| Tavolo | A cosa serve | Metafora |
| --- | --- | --- |
| **Disegno** | Concept, icone, UI, sagome vettoriali, maschere per il 3D | Paint + squadra e compasso |
| **Pixel** | Sprite, tile, icone low-res | Paint a griglia, senza rumore |
| **Modello** | Props, blocchi, forme da gioco | Tinkercad: primitive + merge |

I tre tavoli condividono:

- undo/redo
- selezione, sposta, ruota, scala
- duplica, elimina
- allinea / snap
- merge (unione / differenza / intersezione)
- export

---

## 5. Tavolo Disegno (2D vettoriale)

Obiettivo: tracciare e costruire sagome pulite, poi unirle o tagliarle.

### 5.1 Linee

- **Linea retta** (click–click o click–trascina)
- **Polilinea** (segmenti consecutivi, chiusura opzionale)
- **Linea a mano libera** (poi semplificabile in curva)
- **Curva regolabile** dopo il tracciato: maniglie di curvatura, non una “penna Bézier da imparare”
- Spessore, colore tratto, colore riempimento, tratteggio (continuo / tratteggiato / puntinato)

Regola: ogni linea resta **modificabile**. Non diventa pixel.

### 5.2 Compasso e costruzione

- **Cerchio** da centro + raggio
- **Arco** da centro + angolo, o da 3 punti
- **Raggio / diametro** visibile mentre disegni
- **Squadra:** orizzontale, verticale, 45°, angolo libero con snap
- **Parallela e perpendicolare** rispetto a un segmento selezionato (v1.1 se troppo per l’MVP)

### 5.3 Forme (come Paint, complete)

Elenco chiuso v1:

- rettangolo, rettangolo arrotondato
- ellisse / cerchio
- triangolo, poligono regolare (3–12 lati)
- stella
- freccia
- rombo
- trapezio
- cuore / nuvola **no** in v1 (decorative, non da gioco)

Ogni forma ha maniglie: dimensione, rotazione, raggi (se applicabile).

### 5.4 Merge (boolean 2D)

Operazioni su 2+ forme selezionate:

| Azione | Risultato |
| --- | --- |
| **Unisci** | un sola sagoma |
| **Sottrai** | la prima meno le altre |
| **Interseca** | solo la parte in comune |
| **Ritaglia / spezza** | taglia la prima con le altre, restano pezzi separati |

Dopo il merge: una forma (o pezzi), ancora selezionabile, ancora modificabile nei limiti della geometria risultante.

Casi d’uso: finestra in un muro 2D, icona con buco, unire due cerchi in una nuvola semplice, togliere un pezzo che copre.

### 5.5 Extra minimi disegno

- riempimento
- gomma = sottrai con forma (non pixel)
- testo **una sola** font di sistema, una taglia, un colore (v1.1)
- griglia e snap
- guide (v1.1)

---

## 6. Tavolo Pixel

Obiettivo: sprite e tile piccoli, senza pipeline da pixel-artist professionista.

### 6.1 Canvas

- Dimensioni preset: 8, 16, 24, 32, 48, 64, 128 (+ custom)
- Zoom enorme, pixel visibili
- Griglia on/off
- Palette piccola: 8 / 16 / 32 colori, più “prendi colore”
- 1 layer in v1. Secondo layer = overlay (bozza). Niente stack da 20 layer.

### 6.2 Strumenti

- matita 1px / 2px / 4px
- riempimento (secchiello)
- gomma
- linea, rettangolo, ellisse (pixel-perfect)
- selezione rettangolare + sposta / copia / specchia
- specchio orizzontale / verticale dell’intera sprite

### 6.3 Fuori dal pixel v1

Animazione, onion skin, tilemap editor, dither automatico, normal map.

Possibile v2: 2–4 frame in sequenza e export sprite sheet, se ti serve per i personaggi.

---

## 7. Tavolo Modello (3D semplice)

Obiettivo: oggetti da gioco fatti di forme, non di migliaia di vertici editati a mano.

### 7.1 Primitive 2D (sul piano, poi estrusione)

Le stesse del disegno: rettangolo, cerchio, poligono, ecc.

Azioni:

- **Estrudi** → solido
- **Rivoluzione** (v1.1): profilo 2D ruotato (vaso, ruota)
- **Foro:** cilindro / box in sottrazione

### 7.2 Primitive 3D

Elenco chiuso v1:

- cubo / parallelepipedo
- sfera
- cilindro
- cono
- piramide
- toro (ciambella) — utile, da valutare se tenere in v1
- piano / lastre

Maniglie: dimensione sui 3 assi, rotazione, posizione. Snap alla griglia.

### 7.3 Merge 3D (stesso linguaggio del 2D)

| Azione | Risultato |
| --- | --- |
| **Unisci** | un solido |
| **Sottrai** | fori, finestre, intagli |
| **Interseca** | solo il volume comune |

Niente modificatori boolean “live” da Blender. Premi merge → nuovo oggetto. Undo se sbagli.

### 7.4 Vista e manipolazione

- orbita, pan, zoom
- viste: prospettiva, alto, fronte, lato
- gizmo sposta / ruota / scala
- griglia a terra
- colore piatto per oggetto (un materiale, un colore). Niente PBR in v1.

### 7.5 Fuori dal 3D v1

Sculpt, rig, animazione, UV unwrap, luci da studio, rendering fotorealistico, milioni di poligoni.

Export: mesh pulita, bassa densità, un colore o vertex color semplice.

---

## 8. Flussi tipici (come si usa davvero)

### A. Icona o UI

1. Forme Paint + linee  
2. Merge (unisci / sottrai)  
3. Export PNG e SVG  

### B. Sprite 16×16

1. Tavolo Pixel, palette da 8 colori  
2. Matita, forme, specchio  
3. Export PNG  

### C. Cassa / muro / prop

1. Cubo  
2. Cubo più piccolo in sottrai (incavo)  
3. Cilindro unito come maniglia  
4. Export GLB per Godot  

### D. Sagoma 2D → 3D

1. Disegni il profilo  
2. Estrudi  
3. Fori con sottrai  
4. Export  

Questi quattro flussi sono il **test di successo** dell’MVP. Se uno è macchinoso, il prodotto ha fallito, anche se ha 50 strumenti.

---

## 9. File, export, integrazione giochi

### Documento

- Un file progetto `.draw` (nome da confermare) con i tre tavoli
- Salvataggio locale, autosave
- Apri / duplica progetto

### Export v1

| Da | Formati |
| --- | --- |
| Disegno | SVG, PNG (1× / 2× / 4×) |
| Pixel | PNG, opzionale spritesheet se più frame (v2) |
| Modello | GLB, OBJ |

Cartella di export visibile nel progetto (niente path nascosti).

### Godot (priorità)

- GLB importabile
- PNG con trasparenza
- Dimensioni sprite note (16, 32, 64)

Altri engine: stessi file standard. Nessun plugin Godot in v1.

---

## 10. Interfaccia Mac (semplicità visibile)

Una finestra:

```
[ Disegno | Pixel | 3D ]          zoom / griglia / snap
----------------------------------------------------------------
strumenti verticali     |     canvas / viewport
pochi, icone chiare     |
----------------------------------------------------------------
proprietà dell’oggetto selezionato (misure, colore, merge)
```

Regole UI:

- massimo ~12 strumenti visibili per tavolo
- merge sempre in evidenza quando ci sono 2+ selezioni
- scorciatoie da tastiera tipo Paint (V seleziona, L linea, R rettangolo, E ellisse, B riempimento)
- niente ispettori a 4 colonne
- dark/light segue il sistema

Lingua UI: italiano in v1.

---

## 11. Requisiti non funzionali

- macOS recente (Apple Silicon come target principale)
- 60 fps sul canvas per documenti piccoli/medi
- Undo illimitato nella sessione (o 100 passi, da decidere)
- Nessun account
- Crash: recupero dall’autosave
- Accessibilità base: contrasto, hit area grandi, VoiceOver dopo v1

---

## 12. MVP — cosa si costruisce prima

Ordine proposto:

1. **Shell Mac** + tre tavoli vuoti + file progetto
2. **Disegno:** forme Paint + linea + curva regolabile + selezione
3. **Merge 2D**
4. **Export SVG/PNG**
5. **Pixel:** canvas, matita, forme, secchiello, export PNG
6. **3D:** primitive + gizmo + viste
7. **Merge 3D** + estrudi da 2D
8. **Export GLB**

Criterio “fatto”: i quattro flussi della sezione 8 si completano senza tutorial.

---

## 13. Backlog (da aggiungere dopo, non ora)

Candidati, da discutere uno alla volta:

- testo
- guide e allineamenti forti
- specchio / simmetria in disegno
- 2–4 frame pixel + spritesheet
- rivoluzione 3D
- import SVG nel 3D come estrusione
- palette condivisa tra pixel e colori 3D
- misura (quota in px / unità)
- preset “tile isometrico”, “icona HUD”
- libreria personale di forme riusabili
- export atlas

Ogni voce entra solo se: (a) serve a un asset di gioco reale, (b) non rompe la regola delle poche azioni.

---

## 14. Successo / fallimento

**Successo:** in 2 minuti ottieni una sagoma con un buco, una sprite 32×32, o un cubo con una maniglia, e li usi in Godot.

**Fallimento:** l’utente deve “capire il programma” prima di fare un cerchio; il merge è instabile; l’export è un labirinto; i tre tavoli sembrano tre software diversi.

---

## 15. Decisioni aperte (da chiudere insieme)

1. **Nome prodotto:** Draw è il nome della cartella. Va bene o ne vuoi uno italiano (es. Segno, Forma, Tavolo)?
2. **Stack tecnico:** Swift/SwiftUI + SceneKit/RealityKit, oppure motore tipo Godot/Flutter embedded. Impatta tempi e feel nativo.
3. **Unità 3D:** metri, o “blocchi” da 1 come Minecraft/Tinkercad?
4. **Curva:** maniglie tipo “tira il punto medio” (più facile) vs Bézier classica (più potente).
5. **Merge 2D dopo l’operazione:** forma unica non più scomponibile, o gruppo ancora editabile?
6. **Pixel:** un layer è abbastanza per i tuoi sprite attuali?
7. **Primo gioco target:** quali asset faresti nella prima settimana (icone, tile, props)?
8. **Compasso:** strumento dedicato o “cerchio/arco con raggio visibile” basta?

---

## 16. Come lavoriamo su questo PRD

- Questo file è la fonte. Si aggiorna a versioni (v0.2, v0.3…).
- Prima si chiudono i punti della sezione 15.
- Poi si disegna l’UI (wireframe a bassa fedeltà).
- Poi si implementa l’MVP nel ordine della sezione 12.

Prossima conversazione utile: rispondere alle 8 decisioni, o scegliere **un solo tavolo** da prototipare per primo (consiglio: Disegno + merge, perché sblocca anche il 3D da estrusione).
