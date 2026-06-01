export const CRAB_NAMES = [
  "Kl'rk", "Snapdel", "Brindleclaw", "Gorzh", "Clickwick", "Vrannok",
  "Shellmore", "Tidal", "Crabsworth", "Pinchley", "Scuttara", "Morvek",
  "Brineholt", "Clawthorn", "Krabbex", "Shendrip", "Palwick", "Vozzle",
  "Cheliphor", "Gurdnik", "Snapwick", "Brack", "Skittleclaw", "Yornek",
  "Pindral", "Chelmorr", "Vexclaw", "Grundle", "Skibborn", "Tarthen",
  "Crustwick", "Flintclaw", "Zipperclaw", "Mortle", "Brindock", "Skaggel",
  "Perlwick", "Clattershot", "Grumshaw", "Vortle", "Clickthorn", "Sheldrak",
  "Mosswick", "Brinmore", "Vorrigan", "Snapstone", "Kelwick", "Grizzleclaw",
  "Tidemark", "Clawhaven", "Crabble", "Shellwick", "Scuttmore", "Drackle",
  "Brinwick", "Snappord", "Clawsby", "Grumbeck", "Pinwick", "Thalrock",
];

export const ELDER_NAMES = [
  "Elder Shellwick", "Ancient Gorzh", "Elder Mosswick", "Sage Tidemark",
  "Elder Brindleclaw", "Venerable Vorrigan", "Ancient Cheliphor",
];

export function getRandomName(usedNames: Set<string>): string {
  const available = CRAB_NAMES.filter(n => !usedNames.has(n));
  if (available.length === 0) return `Crab_${Math.floor(Math.random() * 9999)}`;
  return available[Math.floor(Math.random() * available.length)];
}

export function getElderName(usedNames: Set<string>): string {
  const available = ELDER_NAMES.filter(n => !usedNames.has(n));
  if (available.length === 0) return `Elder Crab`;
  return available[Math.floor(Math.random() * available.length)];
}
