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
Alternance/Stage, absences date à date, poste optionnel pour les
vétérinaires) sur un projet déjà en place : va dans **SQL Editor**, colle à
nouveau le contenu de `supabase/schema.sql` et clique sur **Run**.

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
- **Semaines d'absence** : marquer une semaine "absente" pour quelqu'un
  (bouton dans le bandeau au-dessus du planning) exclut cette semaine du
  calcul, aussi bien côté réel que côté théorique — comme dans le planning
  papier actuel.
- **Qui modifie quoi** : seule la personne propriétaire (is_owner) peut
  créer/modifier/supprimer des créneaux, gérer les comptes et les contrats.
  Les autres comptes sont en lecture seule sur le planning de leur groupe.