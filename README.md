# Escal'vet — Planning du cabinet

Application de planning pour un cabinet vétérinaire : chaque membre de
l'équipe a son propre compte, les ASV et les vétérinaires voient leur
planning respectif séparément, et la personne propriétaire voit et modifie
tout. Le contrat de chaque employé (type CDI/CDD/Alternance/Stage, heures
théoriques par semaine, dates de début et de fin) est configurable, et le
solde d'heures (en plus / en moins) est calculé automatiquement — au prorata
des absences déclarées — y compris de façon prévisionnelle sur les semaines
futures déjà planifiées. Le cumul repart de zéro au 1er janvier de chaque
année, ou dès le début du contrat en cours s'il a démarré après.

## Stack

- **Frontend** : React + TypeScript + Vite + Tailwind CSS
- **Backend** : [Supabase](https://supabase.com) (authentification + base de
  données PostgreSQL + règles d'accès par rôle) — offre gratuite largement
  suffisante pour une petite équipe
- **Hébergement** : Netlify (recommandé) ou GitHub Pages

Aucun de ces services n'est payant pour ce volume d'usage, dans le cadre
d'une utilisation non commerciale.

---

## Mise à jour d'un projet Supabase existant

Le fichier [`supabase/schema.sql`](./supabase/schema.sql) est écrit pour
pouvoir être rejoué sans risque sur une base déjà créée : il ajoute les
nouvelles colonnes/tables sans toucher aux données existantes, **sauf** pour
l'ancienne table `weekly_absences` (absences par semaine entière) qui est
remplacée par une nouvelle table `absences` (absences date à date) — les
données existantes sont automatiquement reprises dans la nouvelle table
avant que l'ancienne ne soit supprimée.

Pour appliquer les dernières évolutions (types de contrat CDI/CDD/
Alternance/Stage, absences date à date avec demande/validation, poste
optionnel pour les vétérinaires) sur un projet déjà en place : va dans **SQL
Editor**, colle à nouveau le contenu de `supabase/schema.sql` et clique sur
**Run**.

---

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com), crée un compte gratuit puis
   un nouveau projet (choisis une région proche, ex. Europe).
2. Une fois le projet créé, va dans **SQL Editor** (menu de gauche), colle le
   contenu du fichier [`supabase/schema.sql`](./supabase/schema.sql) et
   clique sur **Run**. Cela crée toutes les tables, les règles de sécurité
   (chaque ASV ne voit que les ASV, chaque véto ne voit que les vétos, la
   personne propriétaire voit tout) et les automatismes nécessaires.
3. Va dans **Project Settings > API** : tu y trouveras l'**URL du projet** et
   la clé **anon public**. Ce sont les deux valeurs dont l'application a
   besoin.

## 2. Créer le tout premier compte (le/la propriétaire)

1. Dans Supabase, va dans **Authentication > Users > Add user**, renseigne un
   email et un mot de passe. Un profil est créé automatiquement.
2. Retourne dans **SQL Editor** et exécute (en remplaçant l'UUID par celui de
   l'utilisateur que tu viens de créer, visible dans la liste des Users) :

   ```sql
   update public.profiles
   set is_owner = true, group_name = 'veterinaire', full_name = 'Ton nom'
   where id = '<uuid-de-l-utilisateur>';
   ```

3. Connecte-toi ensuite dans l'application avec cet email/mot de passe : tu
   as maintenant accès à l'onglet **Équipe** pour créer les autres comptes.

Pour créer un compte pour chaque employé·e ensuite, répète l'étape
**Authentication > Add user** dans Supabase (c'est la personne propriétaire
qui gère ça), puis va dans l'onglet **Équipe** de l'application pour
renseigner le nom, le groupe (ASV / Vétérinaire) et le contrat (heures par
semaine) de la personne.

### Départ d'un·e employé·e

1. **Désactiver le compte** (recommandé) : onglet **Équipe**, sélectionne la
   personne et décoche « Compte actif ». Elle ne peut plus se connecter ni
   rien consulter, mais son historique d'heures, d'absences et de contrats
   est conservé.
2. **Supprimer définitivement** (irréversible) : même onglet, bloc « Départ
   définitif ». Le compte et tout son historique sont effacés. Ce bouton
   passe par une Edge Function Supabase qu'il faut déployer une fois :

   ```bash
   npm install -g supabase          # CLI Supabase, si pas déjà installée
   supabase login
   supabase functions deploy delete-employee --project-ref <ref-du-projet>
   ```

   La référence du projet se trouve dans l'URL du dashboard
   (`https://supabase.com/dashboard/project/<ref-du-projet>`). Tant que la
   fonction n'est pas déployée, le bouton affiche une erreur explicite et la
   désactivation reste possible.

### Importer un planning papier en une fois

Plutôt que de saisir chaque créneau à la main, décris le mois dans un fichier
JSON (voir `data/planning-2026-10.json` comme modèle : prénoms, dates,
horaires, absences) puis lance, avec les identifiants du compte propriétaire :

```bash
OWNER_EMAIL=toi@cabinet.fr OWNER_PASSWORD='...' node scripts/import-planning.mjs data/planning-2026-10.json --dry-run
OWNER_EMAIL=toi@cabinet.fr OWNER_PASSWORD='...' node scripts/import-planning.mjs data/planning-2026-10.json
```

`--dry-run` montre ce qui serait fait sans rien écrire. Un créneau déjà
présent pour la même personne, la même date et la même demi-journée est
ignoré ; `--replace` efface d'abord les créneaux de ces personnes sur la
période du fichier pour repartir du papier.

## 3. Lancer l'application en local

```bash
npm install
cp .env.example .env
# édite .env et renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

## 4. Déployer sur Netlify (recommandé)

1. Pousse ce projet sur un dépôt GitHub (voir plus bas).
2. Sur [netlify.com](https://netlify.com), **Add new site > Import an
   existing project**, connecte ton dépôt GitHub.
3. Netlify détecte automatiquement la config grâce à `netlify.toml`
   (commande `npm run build`, dossier `dist`).
4. Dans **Site configuration > Environment variables**, ajoute
   `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` avec les valeurs de ton
   projet Supabase.
5. Déploie. Le site est en ligne, gratuit, avec un sous-domaine
   `xxx.netlify.app` (tu peux le renommer dans les paramètres du site).

## 5. Alternative : GitHub Pages

GitHub Pages fonctionne aussi (statique), mais nécessite un peu plus de
configuration pour une single-page app (redirection 404 → index.html) et ne
gère pas les variables d'environnement au build de la même façon — il faut
les injecter via une GitHub Action. Netlify est plus simple pour ce projet ;
utilise GitHub Pages seulement si tu as une préférence pour rester
entièrement sur GitHub, et je peux t'aider à mettre en place le workflow.

## 6. Créer le dépôt GitHub

```bash
cd escalvet
git init
git add .
git commit -m "Initial commit"
gh repo create escalvet --private --source=. --push
```

(ou crée le dépôt manuellement sur github.com et fais `git push`).

---

## Notes sur le fonctionnement

- **Postes colorés (ASV)** : BLEU (chenil / chirurgie / examens
  complémentaires / nettoyage chirurgie), VIOLET (accueil / rangement /
  nettoyage et stock des salles hors chirurgie), VERT (volante : aide aux
  vétérinaires, nettoyage de tout l'arrière / chenil du soir), SEUL (une
  seule personne fait tous les postes). Ces catégories sont fixes pour le
  moment.
- **Calcul du solde d'heures** : pour chaque semaine (lundi → samedi), le
  logiciel compare les heures réellement planifiées au contrat en vigueur
  cette semaine-là. Le cumul affiché est la somme de ces écarts depuis la
  première semaine de janvier jusqu'à la semaine consultée — y compris pour
  une semaine future déjà planifiée (calcul prévisionnel).
- **Jours fériés** : le cabinet est fermé les jours fériés français (fixes
  et mobiles : Pâques, Ascension, Pentecôte). Ils sont calculés
  automatiquement : la colonne est marquée « Férié · fermé » dans le
  planning, les heures théoriques de la semaine sont réduites d'un sixième
  par férié (comme un jour d'absence), le générateur n'y place personne, et
  un férié pendant des congés n'est pas décompté du compteur.
- **Semaines d'absence** : marquer une semaine "absente" pour quelqu'un
  (bouton dans le bandeau au-dessus du planning) exclut cette semaine du
  calcul, aussi bien côté réel que côté théorique — comme dans le planning
  papier actuel.
- **Qui modifie quoi** : seule la personne propriétaire (is_owner) peut
  créer/modifier/supprimer des créneaux, gérer les comptes et les contrats.
  Les autres comptes sont en lecture seule sur le planning de leur groupe.
- **Proposer un planning** (propriétaire, bouton au-dessus du planning) :
  génère automatiquement la semaine affichée à partir des horaires de la
  semaine précédente ou de la semaine type ASV. Le générateur respecte les
  absences validées, vise le contrat de chacune (corrigé en douceur par le
  cumul annuel : qui est en déficit reçoit un peu plus d'heures), privilégie
  fortement les journées entières plutôt que les demi-journées isolées, et
  évite de redonner le samedi à la même personne deux semaines de suite.
  Les postes suivent la règle habituelle : l'ouverture tôt (8h-13h, 14h30-19h)
  au chenil/chirurgie (bleu), la fermeture tard (8h15-12h30, 14h30-19h30) à
  l'accueil (violet), et « seul » (tous les postes) quand une personne est
  seule sur la demi-journée.
  La proposition s'affiche avec le solde de chacune ; on peut demander une
  autre variante, puis l'appliquer et retoucher les créneaux à la main.
- **Compteur de congés** : chaque absence porte une case « décompter des
  congés » (cochée par défaut ; à décocher pour une école, un arrêt, une
  formation…). Les jours sont comptés en jours ouvrables (lundi → samedi).
  Chaque employé·e voit son compteur de l'année sur le planning (pris, à
  venir, en attente, restant) ; le propriétaire a le bilan de toute l'équipe
  dans l'onglet Équipe, avec les jours acquis (30 par défaut) et le report
  de l'année précédente modifiables par personne et par année.
- **Qui voit quoi** : chacun voit les créneaux et les absences validées de
  son groupe (pour savoir avec qui il travaille), mais uniquement son propre
  solde d'heures, ses contrats, ses demandes d'absence et d'heures sup. Le
  propriétaire voit tout. Un compte désactivé ne voit plus rien.