import { describe, expect, it } from 'vitest'
import { frenchError } from './errors'

describe('frenchError', () => {
  it('traduit les messages connus', () => {
    expect(frenchError('Invalid login credentials')).toBe('Identifiants incorrects.')
    expect(frenchError('Password should be at least 6 characters.')).toBe('Le mot de passe doit faire au moins 6 caractères.')
    expect(frenchError('New password should be different from the old password.')).toContain('déjà ton mot de passe')
    expect(frenchError('new row violates row-level security policy for table "shifts"')).toContain('pas le droit')
    expect(frenchError("Could not find the 'admin_note' column of 'absences' in the schema cache")).toContain('rejoue supabase/schema.sql')
    expect(frenchError('TypeError: Failed to fetch')).toContain('connexion internet')
  })
  it('garde le texte inconnu derrière une phrase française', () => {
    expect(frenchError('something odd', 'Enregistrement impossible')).toBe('Enregistrement impossible : something odd')
    expect(frenchError(undefined)).toBe('Une erreur est survenue.')
  })
})
