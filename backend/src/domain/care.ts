// CARE (Confidence-Aware Response Engine), deterministic MVP: evidence completeness + feasibility notes for the human reviewer.
// No ML, no infection probabilities. Thin evidence yields an explicit "insufficient evidence" note (abstention).
export type Completeness = 'COMPLETE' | 'PARTIAL' | 'MINIMAL';
export interface CareInput { hasPhoto: boolean; hasLocation: boolean; hasLandmark: boolean; duplicateSuggested: boolean; eligibleVolunteers: number }
export function assessCare(i: CareInput): { evidenceCompleteness: Completeness; careNotes: string[] } {
  const place = i.hasLocation || i.hasLandmark;
  const evidenceCompleteness: Completeness = i.hasPhoto && place ? 'COMPLETE' : i.hasPhoto || place ? 'PARTIAL' : 'MINIMAL';
  const careNotes = ['Observation only: not a confirmed Aedes breeding site.'];
  if (!i.hasPhoto) careNotes.push('No photo evidence: treat as an unverified text report.');
  if (!place) careNotes.push('No landmark or location beyond the area: field team may not find the hazard.');
  if (evidenceCompleteness === 'MINIMAL') careNotes.push('Insufficient evidence for a confident assessment; human review required before any action.');
  if (i.duplicateSuggested) careNotes.push('Possible duplicate of an existing report: reviewer must confirm or merge.');
  careNotes.push(i.eligibleVolunteers > 0 ? `Feasibility: ${i.eligibleVolunteers} eligible volunteer(s) in this area.` : 'Feasibility: no eligible volunteer in this area; coordinator action will be needed.');
  return { evidenceCompleteness, careNotes };
}
