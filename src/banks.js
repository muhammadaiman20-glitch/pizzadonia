// Malaysian banks + a smart GUESS of the bank from an account number.
// An account number has no bank code inside it, so this can never be certain: it scores each bank by the
// number's length and first digit (the patterns each bank commonly uses) and the customer confirms the bank.
export const BANKS = ['Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank', 'AmBank', 'Bank Islam', 'Bank Rakyat', 'BSN',
  'Affin Bank', 'Alliance Bank', 'OCBC Bank', 'UOB Bank', 'HSBC Bank', 'Standard Chartered', 'Bank Muamalat', 'Agrobank', 'MBSB Bank',
  'Al Rajhi Bank', 'Kuwait Finance House', 'GXBank', 'AEON Bank', 'Boost Bank', 'Ryt Bank']

// [bank, usual lengths, usual first digits ('' = any), how common (tie-break)]
const RULES = [
  ['Maybank', [12], '15', 10],
  ['CIMB Bank', [10, 14], '78', 9],
  ['Public Bank', [10], '346', 9],
  ['RHB Bank', [14], '12', 7],
  ['Hong Leong Bank', [11], '', 7],
  ['AmBank', [13], '08', 6],
  ['Bank Islam', [14], '1', 6],
  ['Bank Rakyat', [12], '2', 6],
  ['BSN', [16], '', 5],
  ['Affin Bank', [12], '1', 3],
  ['Alliance Bank', [15], '1', 3],
  ['OCBC Bank', [10], '7', 2],
  ['UOB Bank', [10], '', 2],
  ['HSBC Bank', [12], '', 2],
  ['Bank Muamalat', [14], '1', 2],
  ['Agrobank', [16], '', 2],
]

/** Up to 3 likely banks for this account number, best first: [{ bank, why }]. */
export function guessBank(number) {
  const d = String(number || '').replace(/\D/g, '')
  if (d.length < 8) return []
  const out = []
  for (const [bank, lens, firsts, common] of RULES) {
    if (!lens.includes(d.length)) continue
    const firstOk = !firsts || firsts.includes(d[0])
    if (firsts && !firstOk) continue
    out.push({ bank, score: common + (firsts ? 5 : 0), why: `${d.length} digit${firsts ? `, mula dengan ${d[0]}` : ''}` })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3)
}
