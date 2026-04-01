export interface ProducerResourceItem {
  id: string;
  label: string;
  location?: string;
  source?: string;
}

export interface ProducerResourceSection {
  id: string;
  title: string;
  items: ProducerResourceItem[];
}

export const producerResourceSections: ProducerResourceSection[] = [
  {
    id: 'bulk-ingredients',
    title: 'Soil Shopping List - Bulk Ingredients',
    items: [
      { id: 'peat-moss', label: 'Peat Moss', location: 'Concentrates NW (Milwaukie)' },
      { id: 'coarse-perlite', label: 'Coarse Perlite (Big Chunks)', location: 'Concentrates NW (Milwaukie)' },
      { id: 'rice-hulls', label: 'Rice Hulls', location: 'Concentrates NW (Milwaukie)' },
      { id: 'alfalfa-meal', label: 'Alfalfa Meal', location: 'Concentrates NW (Milwaukie)' },
      { id: 'composted-chicken-manure', label: 'Composted Chicken Manure', location: 'Concentrates NW (Milwaukie)' },
      { id: 'composted-cow-manure', label: 'Composted Cow Manure', location: 'Concentrates NW (Milwaukie)' },
      { id: 'pumice', label: 'Pumice', location: 'Concentrates NW (Milwaukie)' },
      {
        id: 'dark-fir',
        label: 'Dark Fir (Aged Doug Fir Bark Dust Fines)',
        location: 'The Dalles',
        source: 'Neal Creek Forest Products',
      },
      {
        id: 'sand',
        label: 'Sand (Screened or River Sand)',
        location: 'The Dalles',
        source: 'Neal Creek Forest Products',
      },
      { id: 'loam', label: 'Loam', location: 'Boring Bark (Boring)' },
      { id: 'hazelnut-shells', label: 'Hazelnut Shells', location: 'Boring Bark (Boring)' },
      { id: 'nw-worm-castings', label: 'NW Worm Castings', location: 'NW Worm Castings (Eugene/Veneta)' },
    ],
  },
  {
    id: 'soil-amendments',
    title: 'Soil Shopping List - Soil Amendments',
    items: [
      { id: 'dolomite-lime', label: 'Dolomite Lime (Increases pH)', source: 'Concentrates NW' },
      { id: 'soft-rock-phosphate', label: 'Soft Rock Phosphate', source: 'Concentrates NW' },
      { id: 'gypsum', label: 'Gypsum', source: 'Concentrates NW' },
      { id: 'insect-frass', label: 'Insect Frass', source: 'Concentrates NW' },
      { id: 'k-mag', label: 'Potassium Magnesium Sulfate (K-Mag / SulPoMag / Langbeinite)', source: 'Concentrates NW' },
      { id: 'iron-sulfate', label: 'Iron Sulfate', source: 'Concentrates NW' },
      { id: 'blood-meal', label: 'Blood Meal', source: 'Concentrates NW' },
      { id: 'calcium-nitrate', label: 'Calcium Nitrate (Granular)', source: 'Concentrates NW' },
      { id: 'feather-meal', label: 'Feather Meal', source: 'Concentrates NW' },
      { id: 'mono-potassium-phosphate', label: 'Monopotassium Phosphate', source: 'Concentrates NW' },
      { id: 'manganese-sulfate', label: 'Manganese Sulfate', source: 'Concentrates NW' },
      { id: 'bone-meal', label: 'Bone Meal', source: 'Concentrates NW' },
      { id: 'metabasalt', label: 'Metabasalt', source: 'Concentrates NW' },
    ],
  },
  {
    id: 'supplies-needed',
    title: 'Supplies Needed List',
    items: [
      { id: 'clonex-gel', label: 'Clonex Gel' },
      { id: 'rockwool-cubes', label: 'Rock wool (A-O-K 1.5 in Grodan) 5 packs' },
      { id: 'citric-acid', label: 'Citric acid, 50 lb bag' },
      { id: 'isopropyl-alcohol-91', label: 'Isopropyl alcohol 91% for gal' },
      { id: 'vacuum-filters', label: 'Vacuum Filters' },
      { id: 'asgard', label: 'Asgard' },
      { id: 'shear-perfection-scissors', label: 'Shear Perfection scissors, 2 in straight Sensei Bonsai' },
      { id: 'nitrile-gloves-medium', label: 'Nitrile Gloves Medium' },
      { id: 'nitrile-gloves-large', label: 'Nitrile Gloves Large' },
      { id: 'trash-bags', label: 'Trash Bags' },
      { id: 'soap', label: 'Soap' },
      { id: 'other', label: 'Other' },
      { id: 'ph-tester', label: 'pH Tester' },
      { id: 'aaa-batteries', label: 'AAA Batteries' },
      { id: 'aa-batteries', label: 'AA Batteries' },
      { id: '9v-batteries', label: '9V Batteries' },
    ],
  },
];

export const producerResourceSourceLocations = [
  'Boring Bark: 30265 SE HWY 212, Boring, OR (503) 668-3219',
  'Concentrates NW: 5505 SE International Way, Milwaukie, OR 97222 (503) 234-7501',
  'Neal Creek (The Dalles): 1800 W 2nd St, The Dalles, OR 97058 (541) 645-5605',
  'Dirt Hugger: 749 Snipes St, The Dalles, OR (541) 946-3478',
];
