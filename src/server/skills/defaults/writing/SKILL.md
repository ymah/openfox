---
name: writing
description: 'Writing-vault reference: folder layout, Codex/scene frontmatter schema, and the drafting workflow. Load before any writing-mode operation.'
metadata:
  version: 1.0.0
  openfox:
    displayName: Writing
---

# Vault d'écriture — référence d'autorité

Ce projet OpenFox est utilisé comme **vault d'un roman ou d'un livre**, sur le modèle du vault GTD :
tout ce qui suit est **relatif au workdir du projet courant** — n'importe quel dossier ouvert comme
projet OpenFox peut servir de vault de cette façon, il n'y a pas de chemin en dur. Le Codex et le
manuscrit vivent tous les deux sous forme de fichiers markdown avec frontmatter, éditables aussi
bien par les agents que par l'utilisateur (dans l'app via Codex/Manuscrit, ou directement sur
disque).

## 1. Arborescence

```
codex/
  characters/<slug>.md
  locations/<slug>.md
  lore/<slug>.md
  items/<slug>.md
  subplots/<slug>.md
manuscript/
  <NN-slug-acte>/
    <NN-slug-chapitre>/
      <NN-slug-scene>.md
AGENTS.md                — page d'atterrissage, créée automatiquement
```

Le préfixe numérique à deux chiffres (`01-`, `02-`…) sur les dossiers d'actes/chapitres et les
fichiers de scène donne l'ordre d'affichage et de lecture — pas de fichier manifeste séparé, comme
la numérotation `00-inbox`/`10-projects` du vault GTD.

## 2. Frontmatter d'une entrée Codex

```yaml
id: <slug> # identifiant stable = nom de fichier sans extension
type: character|location|lore|item|subplot
title: <nom de l'entrée>
tags: [tag1, tag2] # optionnel
facts: # paires clé/valeur libres, ex. age, statut, faction
  <clé>: <valeur>
```

Le corps du fichier (après le frontmatter) est le texte riche libre : description, historique,
voix, etc. — pas de structure imposée au-delà du frontmatter.

## 3. Frontmatter d'une scène

```yaml
id: <slug>
title: <sous-titre optionnel> # les scènes n'ont pas de nom propre, seulement un sous-titre libre
pov: <nom du personnage> # optionnel
status: draft|revised|final
summary: <résumé en une phrase>
codex_refs: [slug1, slug2] # entrées Codex pertinentes pour cette scène, renseigné manuellement
```

Le corps du fichier est la prose de la scène elle-même.

## 4. Démarrer un nouveau livre

1. Si `AGENTS.md` n'existe pas encore à la racine du vault, le créer avec ce contenu exact :

   ```markdown
   # Vault d'écriture

   Ce dossier est un vault de roman/livre piloté par OpenFox.

   ## Arborescence

   - `codex/{characters,locations,lore,items,subplots}/` — bible narrative
   - `manuscript/<acte>/<chapitre>/<scène>.md` — le manuscrit

   ## Workflows (menu Workflows d'OpenFox)

   - **Écriture — Nouveau livre** : structure le vault et pose les questions de départ (genre, POV, ton)
   - **Écriture — Rédiger une scène** : rédige la prose d'une scène à partir du Codex et du résumé
   - **Écriture — Enrichir le Codex** : étoffe une entrée du Codex
   ```

2. Poser les questions de cadrage une à la fois via `ask_user` : genre, point(s) de vue, ton/style,
   nombre d'actes envisagé. Écrire une première entrée Codex par personnage principal cité, et créer
   la structure `manuscript/01-acte-un/01-chapitre-un/` avec une première scène vide
   (`status: draft`, `summary` rempli à partir de ce que l'utilisateur a dit).

## 5. Rédiger une scène

1. Charger ce skill (déjà fait si tu lis ceci).
2. Lire le frontmatter de la scène ciblée (`summary`, `pov`, `codex_refs`) et le contenu de chaque
   entrée Codex référencée dans `codex_refs`.
3. Rédiger la prose directement dans le corps du fichier de la scène, cohérente avec les faits du
   Codex (ne jamais contredire un `fact` existant sans le signaler à l'utilisateur). Respecter le
   POV déclaré.
4. Si un personnage/lieu/objet nouveau apparaît dans le texte et n'a pas encore d'entrée Codex,
   proposer d'en créer une (ne pas le faire sans confirmation, sauf instruction contraire de
   l'utilisateur).

## 6. Enrichir le Codex

Étoffer une entrée existante ou en créer une nouvelle à partir d'un prompt libre de l'utilisateur —
rédiger le corps riche et proposer des `facts` structurées pertinentes pour le type d'entrée. Ne
jamais écraser silencieusement un fait déjà renseigné : signaler le conflit et demander avant de
remplacer.

## 7. Langue

Tout le contenu narratif suit la langue demandée par l'utilisateur pour son livre (le français est
la langue par défaut de l'assistant lui-même, mais pas nécessairement celle du roman) — demander si
ambigu plutôt que de supposer.
