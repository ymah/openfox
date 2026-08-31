---
name: gtd
description: 'GTD reference for this vault: folder layout, frontmatter schema, the GTD decision tree, the PROJECT.md template, and task -> sub-agent routing. Load before any GTD operation.'
metadata:
  version: 1.0.0
  openfox:
    displayName: GTD
---

# Système GTD — référence d'autorité

Ce projet OpenFox est utilisé comme vault d'une méthode **Getting Things Done (GTD)** de David
Allen, adaptée à l'exécution par agents. Cette page est la référence complète ; tout ce qui suit
est **relatif au workdir du projet courant** — n'importe quel dossier ouvert comme projet OpenFox
peut servir de vault de cette façon, il n'y a pas de chemin en dur.

---

## 1. Arborescence (rappel détaillé)

```
00-inbox/<YYYYMMDD-HHmm>-<slug>.md   — capture brute, une phrase, non traitée
10-projects/<slug>/
  PROJECT.md                        — document descriptif détaillé (voir §4)
  deliverables/                     — un fichier par livrable produit par un sous-agent
  notes/                            — recherche, brouillons, matériel de travail
20-next-actions.md                  — actions concrètes, groupées par contexte (@ordinateur…)
30-waiting-for.md                   — délégué / en attente d'un tiers
40-someday-maybe/<slug>.md          — non actionnable pour l'instant
50-reference/                       — documentation durable
50-reference/reviews/YYYY-Www.md    — revues hebdomadaires
90-archive/<année>/<slug>/          — projets terminés (déplacés depuis 10-projects/)
```

## 2. Schéma de frontmatter (toute fiche GTD)

```yaml
id: <slug>                    # identifiant stable, = nom de dossier/fichier sans extension
title: <titre humain>
type: inbox|project|action|waiting|someday|reference
status: captured|clarified|approved|in-progress|done|archived
created: <AAAA-MM-JJ>
updated: <AAAA-MM-JJ>
outcome: <résultat attendu, une phrase>       # obligatoire pour type=project
next_action: <prochaine action concrète>       # optionnel
context: '@ordinateur'|'@téléphone'|...        # optionnel, actions uniquement
project: <slug du projet parent>               # optionnel
tags: [tag1, tag2]                             # optionnel
```

`status=captured` (inbox) → `clarified` (PROJECT.md écrit) → `approved` (validé par l'utilisateur)
→ `in-progress` (sous-agents lancés) → `done` → `archived` (déplacé dans `90-archive/`).

## 3. Arbre de décision GTD (clarification d'un item d'inbox)

Applique-le item par item, en posant les questions par `ask_user` (une seule à la fois) :

1. **C'est quoi, exactement ?** Reformule l'item en une phrase claire si besoin.
2. **Est-ce actionnable ?**
   - **Non** →
     - Sans valeur → proposer la suppression (confirmer avec l'utilisateur avant).
     - A une valeur mais pas maintenant → déplacer vers `40-someday-maybe/`, `status: someday`.
     - Pure information → déplacer vers `50-reference/`, `type: reference`.
   - **Oui** → continuer.
3. **Ça prend moins de 2 minutes ?** → Si oui et que l'utilisateur confirme vouloir le faire
   immédiatement, proposer de le faire faire tout de suite par le sous-agent adéquat (pas besoin
   d'un `PROJECT.md` complet) plutôt que de créer un projet. **Exception : jamais pour du code.**
   Une modification de code, même triviale (une ligne), passe toujours par `agent: code` →
   `project_tasks`/`gtd-build` (§5) — la revue et la vérification automatiques ne sont pas
   négociables pour du code, contrairement à une note ou un texte.
4. **Une seule action suffit ?** → Ajouter directement une ligne dans `20-next-actions.md` sous le
   bon contexte, pas de `PROJECT.md`.
5. **Plusieurs étapes sont nécessaires ?** → C'est un **projet** : créer `10-projects/<slug>/` et
   rédiger `PROJECT.md` selon le gabarit (§4).
6. **Ça dépend de quelqu'un d'autre ?** → Ajouter une ligne dans `30-waiting-for.md` (en plus du
   projet si applicable).

## 4. Gabarit de `PROJECT.md`

```markdown
---
id: <slug>
title: <titre>
type: project
status: clarified
created: <AAAA-MM-JJ>
updated: <AAAA-MM-JJ>
outcome: <résultat attendu — une phrase décrivant l'état final souhaité>
tags: []
---

# <Titre du projet>

## Résultat attendu

<une ou deux phrases : à quoi ressemble le succès>

## Contexte & contraintes

<ce que l'utilisateur a précisé pendant la clarification : contraintes, préférences, deadlines>

## Critères d'acceptation

- [ ] <critère vérifiable 1>
- [ ] <critère vérifiable 2>

## Livrables

| #   | Description | Fichier de sortie                          |
| --- | ----------- | ------------------------------------------ |
| 1   | <quoi>      | `10-projects/<slug>/deliverables/<nom>.md` |

## Découpage en tâches

### Tâche 1 — <titre>

- **agent**: <gtd-researcher\|gtd-writer\|gtd-translator\|gtd-scheduler\|code>
- **input**: <ce dont l'agent a besoin : fichiers, contexte, instructions>
- **output**: `10-projects/<slug>/deliverables/<nom>.md`
- **depends_on**: <aucune | numéro de tâche>

### Tâche 2 — <titre>

- **agent**: ...
- **input**: ...
- **output**: ...
- **depends_on**: ...
```

**Le champ `output` (et la colonne « Fichier de sortie ») contient toujours le chemin complet
depuis la racine du vault** (`10-projects/<slug>/deliverables/<nom>.md`), jamais la forme raccourcie
`deliverables/<nom>.md` — les sous-agents écrivent au chemin donné littéralement et n'ont aucun
moyen de savoir dans quel projet ils opèrent.

Chaque tâche du découpage devient un **critère** `session_metadata` (clé `criteria`) pendant
l'étape `dispatch` du workflow `gtd-clarify`, avec `status: pending`, pour piloter les transitions
du workflow (`metadata_all_in` / `metadata_all_match`).

## 5. Table de routage tâche → sous-agent

| Nature de la tâche                     | `agent:` dans `PROJECT.md`      | Comment elle est lancée                    |
| -------------------------------------- | ------------------------------- | ------------------------------------------ |
| Recherche, synthèse documentée, veille | `gtd-researcher`                | `call_sub_agent("gtd-researcher", ...)`    |
| Rédaction, réécriture de document      | `gtd-writer`                    | `call_sub_agent("gtd-writer", ...)`        |
| Traduction                             | `gtd-translator`                | `call_sub_agent("gtd-translator", ...)`    |
| Planification, jalons, estimation      | `gtd-scheduler`                 | `call_sub_agent("gtd-scheduler", ...)`     |
| Exploration de code existant           | `explorer` (livré avec OpenFox) | `call_sub_agent("explorer", ...)`          |
| **Développement logiciel**             | `code`                          | Voir ci-dessous — jamais `call_sub_agent`. |

Une tâche `agent: code` n'est **pas** lancée par `call_sub_agent` : `planner`/`builder` sont des
agents top-level (non appelables en sous-agent), et la réalisation passe par le workflow bundlé
**`gtd-build`** (boucle `planner → builder → verifier → code_reviewer`), lancé soit automatiquement
via `project_tasks` si le dépôt visé est le projet courant, soit manuellement par l'utilisateur dans
le dépôt visé sinon — voir le prompt de `gtd-secretary` pour le détail des deux cas.

Toute tâche documentaire sans dépendance non satisfaite (`depends_on: aucune`, ou dont les
dépendances ont déjà `status: completed`/`passed`) est lancée **dans le même tour** que les autres
tâches prêtes, pour qu'elles s'exécutent en parallèle. Les tâches dépendantes attendent le tour
suivant de l'étape `dispatch`.

## 6. Règles d'écriture pour les sous-agents

1. **Un livrable = un fichier** sous `10-projects/<slug>/deliverables/`, jamais seulement une
   réponse en chat. Le fichier de sortie doit exister avant d'appeler `return_value`.
2. Mettre à jour le frontmatter du fichier concerné à chaque transition d'état.
3. Toujours indiquer les sources dans une note de recherche (`gtd-researcher`).
4. Conserver la structure Markdown originale lors d'une traduction (`gtd-translator`).
5. Un sous-agent qui échoue à produire son livrable doit l'expliquer clairement dans son
   `return_value` (`result: "failure"`) plutôt que d'inventer un contenu.

## 7. Langue

Toute production destinée à l'utilisateur (questions `ask_user`, contenu de `PROJECT.md`,
livrables, résumés en chat) est en **français**. Les identifiants techniques (`id`, `slug`,
noms de fichiers, clés de frontmatter) restent en anglais/ASCII.
