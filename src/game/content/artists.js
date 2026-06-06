// The artist roster — ~30 named, quirky artists for commissioning.
// Each elevates certain themes; reputation/reach boosts a card's collectibility
// ceiling and market appeal. Trajectory hints whether they're a cheap rising
// star or an expensive established name (used later for price drift over a run).
//
// Fields:
//   specialty   — theme tags this artist elevates (matches set themes below)
//   cost        — commission fee in dollars
//   reach       — 0–100, audience size / market pull
//   trajectory  — 'rising' | 'steady' | 'established' | 'fading'

export const ARTISTS = [
  { id: 'a01', name: 'Mika "Inkstorm" Tanaka', specialty: ['dragons', 'elemental'], cost: 12_000, reach: 88, trajectory: 'established' },
  { id: 'a02', name: 'Bram Vogel', specialty: ['horror', 'undead'], cost: 6_500, reach: 61, trajectory: 'steady' },
  { id: 'a03', name: 'Sol Ferreira', specialty: ['cosmic', 'elemental'], cost: 9_000, reach: 74, trajectory: 'rising' },
  { id: 'a04', name: 'Nadia "Pixel" Okonkwo', specialty: ['mecha', 'cyber'], cost: 4_200, reach: 49, trajectory: 'rising' },
  { id: 'a05', name: 'Old Man Crane', specialty: ['nature', 'beasts'], cost: 15_000, reach: 91, trajectory: 'fading' },
  { id: 'a06', name: 'Liv Sørensen', specialty: ['frost', 'elemental'], cost: 7_800, reach: 66, trajectory: 'steady' },
  { id: 'a07', name: 'Tobias Reyes', specialty: ['knights', 'kingdoms'], cost: 5_500, reach: 55, trajectory: 'steady' },
  { id: 'a08', name: 'Yuki Hoshino', specialty: ['cute', 'spirits'], cost: 8_400, reach: 79, trajectory: 'rising' },
  { id: 'a09', name: 'The Greel Twins', specialty: ['horror', 'cosmic'], cost: 11_000, reach: 71, trajectory: 'steady' },
  { id: 'a10', name: 'Cassia Vane', specialty: ['arcane', 'kingdoms'], cost: 13_500, reach: 84, trajectory: 'established' },
  { id: 'a11', name: 'Dev Patel-Moreau', specialty: ['cyber', 'mecha'], cost: 6_000, reach: 58, trajectory: 'rising' },
  { id: 'a12', name: 'Ingrid Vasquez', specialty: ['beasts', 'nature'], cost: 4_800, reach: 52, trajectory: 'steady' },
  { id: 'a13', name: 'Hollow Jack', specialty: ['undead', 'horror'], cost: 3_200, reach: 41, trajectory: 'rising' },
  { id: 'a14', name: 'Reina del Bosque', specialty: ['nature', 'spirits'], cost: 10_500, reach: 82, trajectory: 'established' },
  { id: 'a15', name: 'Q. Adebayo', specialty: ['cosmic', 'arcane'], cost: 7_000, reach: 63, trajectory: 'steady' },
  { id: 'a16', name: 'Marnie Fitch', specialty: ['cute', 'beasts'], cost: 2_800, reach: 38, trajectory: 'rising' },
  { id: 'a17', name: 'Konrad Steiner', specialty: ['knights', 'kingdoms'], cost: 14_000, reach: 86, trajectory: 'fading' },
  { id: 'a18', name: 'Suki "Neon" Lin', specialty: ['cyber', 'cosmic'], cost: 9_800, reach: 80, trajectory: 'rising' },
  { id: 'a19', name: 'Father Augustine', specialty: ['arcane', 'undead'], cost: 16_500, reach: 93, trajectory: 'established' },
  { id: 'a20', name: 'Pia Lindqvist', specialty: ['frost', 'spirits'], cost: 5_900, reach: 57, trajectory: 'steady' },
  { id: 'a21', name: 'Beto Cruz', specialty: ['dragons', 'beasts'], cost: 6_700, reach: 60, trajectory: 'rising' },
  { id: 'a22', name: 'The Cartographer', specialty: ['kingdoms', 'arcane'], cost: 12_800, reach: 77, trajectory: 'steady' },
  { id: 'a23', name: 'Hana Bright', specialty: ['cute', 'elemental'], cost: 3_900, reach: 46, trajectory: 'rising' },
  { id: 'a24', name: 'Voss', specialty: ['mecha', 'cyber'], cost: 18_000, reach: 95, trajectory: 'established' },
  { id: 'a25', name: 'Eleni Pappas', specialty: ['cosmic', 'frost'], cost: 8_100, reach: 68, trajectory: 'steady' },
  { id: 'a26', name: 'Rusty Calhoun', specialty: ['beasts', 'horror'], cost: 4_500, reach: 44, trajectory: 'fading' },
  { id: 'a27', name: 'Amara Singh', specialty: ['spirits', 'nature'], cost: 9_400, reach: 75, trajectory: 'rising' },
  { id: 'a28', name: 'Gus Lindström', specialty: ['knights', 'frost'], cost: 5_100, reach: 51, trajectory: 'steady' },
  { id: 'a29', name: 'Madame Zhao', specialty: ['arcane', 'spirits'], cost: 13_000, reach: 83, trajectory: 'established' },
  { id: 'a30', name: 'Pixel Goblin', specialty: ['cyber', 'cute'], cost: 2_400, reach: 34, trajectory: 'rising' },
  { id: 'a31', name: 'Dame Octavia Frost', specialty: ['frost', 'kingdoms'], cost: 17_500, reach: 90, trajectory: 'fading' },
  { id: 'a32', name: 'Juno Castellano', specialty: ['dragons', 'cosmic'], cost: 10_000, reach: 78, trajectory: 'rising' },

  // Artists for the grounded / non-fantasy themes, so those genres earn the
  // art-appeal match bonus too. Each covers a new genre tag paired with a
  // related one; cost/reach/trajectory spread to match the roster's variety.
  { id: 'a33', name: 'Dashiell Kerr', specialty: ['noir', 'heist'], cost: 7_300, reach: 64, trajectory: 'steady' },
  { id: 'a34', name: 'Birdie "Getaway" Salas', specialty: ['heist', 'racing'], cost: 3_600, reach: 43, trajectory: 'rising' },
  { id: 'a35', name: 'Rev Tanaka', specialty: ['racing', 'cyber'], cost: 8_700, reach: 72, trajectory: 'rising' },
  { id: 'a36', name: 'Coach Delgado', specialty: ['sports', 'beasts'], cost: 4_100, reach: 47, trajectory: 'steady' },
  { id: 'a37', name: 'Marisol "Halftime" Vega', specialty: ['sports', 'cute'], cost: 9_200, reach: 76, trajectory: 'established' },
  { id: 'a38', name: 'Captain Brine', specialty: ['pirates', 'beasts'], cost: 11_500, reach: 81, trajectory: 'fading' },
  { id: 'a39', name: 'Saltwater Sage', specialty: ['pirates', 'horror'], cost: 5_400, reach: 53, trajectory: 'rising' },
  { id: 'a40', name: 'Detective Imani Cole', specialty: ['noir', 'undead'], cost: 12_200, reach: 79, trajectory: 'steady' },
  { id: 'a41', name: 'Cosmonaut Petrov', specialty: ['colony', 'mecha'], cost: 6_800, reach: 59, trajectory: 'steady' },
  { id: 'a42', name: 'Dr. Aria Voss', specialty: ['colony', 'cosmic'], cost: 15_500, reach: 89, trajectory: 'established' },
  { id: 'a43', name: 'Gojira Goto', specialty: ['kaiju', 'mecha'], cost: 13_800, reach: 85, trajectory: 'rising' },
  { id: 'a44', name: 'Tiny "Stomp" Okafor', specialty: ['kaiju', 'beasts'], cost: 2_900, reach: 39, trajectory: 'rising' },
]

export function getArtist(id) {
  return ARTISTS.find((a) => a.id === id) ?? null
}
