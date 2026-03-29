// Weight categories
export const WOMEN_CATEGORIES = [
  '-43',
  '-47',
  '-52',
  '-57',
  '-63',
  '-69',
  '-76',
  '-84',
  '+84',
] as const;

export const MEN_CATEGORIES = [
  '-53',
  '-59',
  '-66',
  '-74',
  '-83',
  '-93',
  '-105',
  '-120',
  '+120',
] as const;

export const ALL_CATEGORIES = [...WOMEN_CATEGORIES, ...MEN_CATEGORIES] as const;

export type WomenCategory = typeof WOMEN_CATEGORIES[number];
export type MenCategory = typeof MEN_CATEGORIES[number];

// Category display with unit
export const getCategoryDisplay = (category: string): string => `${category} kg`;

// Get categories by sex
export const getCategoriesBySex = (sex: 'Male' | 'Female'): readonly string[] => {
  return sex === 'Female' ? WOMEN_CATEGORIES : MEN_CATEGORIES;
};
