# PostPilot

SaaS web qui joue le rôle d'un community manager assisté par l'IA pour les petites entreprises tunisiennes. Ce dépôt contient la **Release 1** du rapport de projet : sprints 1 à 3 (socle, marque et connexions, stratégie et contenus).

## Installation

Prérequis : Node.js 20.9 ou plus récent, et un projet Supabase Cloud vierge. Docker n'est pas nécessaire.

```bash
npm install
```

### 1. Préparer Supabase Cloud

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Ouvrez **SQL Editor**, collez le contenu de [`supabase/migrations/20261108120000_release_1.sql`](supabase/migrations/20261108120000_release_1.sql) et lancez-le. À n'exécuter qu'une fois.
3. Dans **Authentication > URL Configuration** :
   - **Site URL** : `http://localhost:3000` (votre domaine en production) ;
   - **Redirect URLs** : `http://localhost:3000/api/auth/callback` (et l'équivalent en production).
4. Dans **Authentication > Emails**, remplacez les modèles « Confirm signup » et « Reset Password » par ceux de [`supabase/templates/`](supabase/templates/). Le lien fonctionne alors depuis n'importe quel appareil.

La section 15 de la migration prépare le compte `ranimzghibi5@gmail.com` : trois marques fictives complètes, sur le forfait Agence. Inscrivez-vous avec cette adresse et choisissez votre mot de passe, les données sont déjà là. Si le reste du fichier a déjà été exécuté, ne collez que cette section. Retirez-la avant la production.

Le service d'e-mail intégré à Supabase n'envoie que quelques messages par heure. Pendant le développement, vous pouvez désactiver **Confirm email** dans **Authentication > Sign In / Providers**. En production, configurez un SMTP (Resend par exemple).

### 2. Renseigner les variables

Remplissez le fichier `.env.local`, déjà créé à la racine, avec les trois valeurs Supabase (**Project Settings > API Keys** et **Data API**) :

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### 3. Lancer

```bash
npm run dev
```

L'application démarre sur <http://localhost:3000>.

## Services et mode démo

Seul Supabase est obligatoire. Chaque autre service bascule sur un mode démo, signalé dans l'interface, tant que ses variables sont vides.

| Service | Variables | Sans configuration |
| --- | --- | --- |
| Texte (IA) | `ANTHROPIC_API_KEY`, ou `AI_BASE_URL` pour un serveur compatible OpenAI (Ollama, LocalAI, vLLM) | Générateurs déterministes |
| Vecteurs | `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL` (dimension 1024) | Index lexical local |
| Images | `IMAGE_BASE_URL`, `IMAGE_MODEL` | Compositions abstraites aux couleurs de la marque |
| Facebook, Instagram | `META_APP_ID`, `META_APP_SECRET` | Comptes bac à sable, rien n'est envoyé |
| E-mails d'invitation | `RESEND_API_KEY`, `EMAIL_FROM` | Lien d'invitation à copier |

Pour Meta, déclarez `<domaine>/api/oauth/meta/callback` comme URI de redirection OAuth, et `<domaine>/api/webhooks/meta` comme rappels de désautorisation et de suppression des données.

## Environnements

Trois environnements séparés (BNF-60 à 63), chacun avec son propre projet Supabase et ses propres variables :

| Environnement | Hébergement | Base |
| --- | --- | --- |
| Développement | `npm run dev` | Projet Supabase de développement |
| Préproduction | Déploiement de prévisualisation Vercel | Projet Supabase de préproduction |
| Production | Branche `main` sur Vercel | Projet Supabase de production |

Sur Vercel, renseignez les variables par environnement (**Settings > Environment Variables**). Le rendu des visuels et l'indexation s'exécutent dans les fonctions serveur.

## Tests

Aucun ne demande Docker ni compte Cloud.

```bash
npm test             # unitaires + migration et RLS sur Postgres en mémoire (PGlite)
npm run test:rls     # uniquement l'isolation et les permissions
npm run test:e2e     # parcours complet dans Chromium, Supabase émulé (après : npx playwright install chromium)
npm run check        # lint + types + tests
```

Le test d'isolation lit la liste des tables dans le catalogue Postgres : toute nouvelle table portant `organization_id` sans jeu d'essai le fait échouer. Après un changement de migration, lancez `npm run db:types` pour régénérer les types TypeScript.

## Organisation du code

```
supabase/migrations/   schéma, RLS, Vault, stockage, temps forts locaux
messages/{fr,en,ar}/   textes de l'interface
src/app/               routes : pages [locale] et API
src/features/          un dossier par domaine : actions serveur, schémas, composants
src/server/ai/         fournisseurs, journal des coûts, consignes versionnées, mode démo
src/server/connectors/ un connecteur par réseau, derrière un contrat commun
src/server/content/    génération, conformité, normalisation des sorties de l'IA
src/server/render/     gabarits Satori et export JPEG
src/server/knowledge/  extraction, découpage, vecteurs
```

Règles à conserver pour les prochaines releases :

- Toute écriture passe par `createAction` ou `createBrandAction` (validation Zod, contrôle du rôle, limitation de débit). La base réapplique les droits par RLS.
- `createAdminClient` contourne RLS : réservé aux tâches serveur et aux webhooks, après vérification de l'appelant.
- Le statut d'une publication, le forfait et l'état d'un compte social ne sont pas modifiables par un client : droits par colonne dans la migration.
- Ajouter un réseau : un connecteur implémentant `SocialConnector`, puis son enregistrement dans `src/server/connectors/service.ts` et `src/lib/domain.ts`.
