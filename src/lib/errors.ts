/**
 * Traduit en français les messages d'erreur renvoyés par Supabase (auth et
 * base de données), qui arrivent en anglais. Les messages inconnus sont
 * renvoyés tels quels, précédés d'une phrase générique.
 */
const RULES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Identifiants incorrects.'],
  [/email not confirmed/i, 'Cet email n’a pas encore été confirmé.'],
  [/user not found/i, 'Aucun compte avec cet email.'],
  [/password should be at least (\d+)/i, 'Le mot de passe doit faire au moins $1 caractères.'],
  [/same password|different from the old password/i, 'C’est déjà ton mot de passe actuel, choisis-en un autre.'],
  [/rate limit|only request this after (\d+) seconds/i, 'Trop de tentatives, réessaie dans quelques instants.'],
  [/invalid format|unable to validate email/i, 'Adresse email invalide.'],
  [/jwt expired|refresh token/i, 'Ta session a expiré, reconnecte-toi.'],
  [/failed to fetch|networkerror|network request failed|load failed/i, 'Connexion impossible : vérifie ta connexion internet.'],
  [/row-level security/i, 'Tu n’as pas le droit de faire cette modification.'],
  [/duplicate key value/i, 'Cet enregistrement existe déjà.'],
  [/violates foreign key/i, 'Impossible : d’autres données dépendent de cet élément.'],
  [/violates check constraint "?(\w+)"?/i, 'Valeur refusée par une règle de la base ($1).'],
  [/invalid input syntax/i, 'Format de valeur invalide.'],
  [/column "?(\w+)"? does not exist|could not find the '?(\w+)'? column/i, 'La base de données n’est pas à jour : rejoue supabase/schema.sql dans Supabase.'],
  [/relation "?[\w.]+"? does not exist/i, 'La base de données n’est pas à jour : rejoue supabase/schema.sql dans Supabase.'],
  [/function .* does not exist/i, 'La base de données n’est pas à jour : rejoue supabase/schema.sql dans Supabase.'],
  [/not found/i, 'Élément introuvable.'],
]

export function frenchError(message: string | undefined | null, fallback = 'Une erreur est survenue'): string {
  if (!message) return `${fallback}.`
  for (const [re, fr] of RULES) {
    const m = message.match(re)
    if (m) return fr.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '')
  }
  return `${fallback} : ${message}`
}
