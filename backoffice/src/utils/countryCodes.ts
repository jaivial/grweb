export interface CountryCode {
  code: string;
  country: string;
  name: string;
}

export const countryCodes: CountryCode[] = [
  { code: '+34', country: 'ES', name: 'España' },
  { code: '+1', country: 'US', name: 'Estados Unidos' },
  { code: '+1', country: 'CA', name: 'Canadá' },
  { code: '+1', country: 'PR', name: 'Puerto Rico' },
  { code: '+44', country: 'GB', name: 'Reino Unido' },
  { code: '+49', country: 'DE', name: 'Alemania' },
  { code: '+33', country: 'FR', name: 'Francia' },
  { code: '+39', country: 'IT', name: 'Italia' },
  { code: '+52', country: 'MX', name: 'México' },
  { code: '+54', country: 'AR', name: 'Argentina' },
  { code: '+55', country: 'BR', name: 'Brasil' },
  { code: '+351', country: 'PT', name: 'Portugal' },
  { code: '+31', country: 'NL', name: 'Países Bajos' },
  { code: '+32', country: 'BE', name: 'Bélgica' },
  { code: '+41', country: 'CH', name: 'Suiza' },
  { code: '+43', country: 'AT', name: 'Austria' },
  { code: '+46', country: 'SE', name: 'Suecia' },
  { code: '+47', country: 'NO', name: 'Noruega' },
  { code: '+45', country: 'DK', name: 'Dinamarca' },
  { code: '+358', country: 'FI', name: 'Finlandia' },
  { code: '+30', country: 'GR', name: 'Grecia' },
  { code: '+90', country: 'TR', name: 'Turquía' },
  { code: '+91', country: 'IN', name: 'India' },
  { code: '+86', country: 'CN', name: 'China' },
  { code: '+81', country: 'JP', name: 'Japón' },
  { code: '+82', country: 'KR', name: 'Corea del Sur' },
  { code: '+61', country: 'AU', name: 'Australia' },
  { code: '+64', country: 'NZ', name: 'Nueva Zelanda' },
  { code: '+353', country: 'IE', name: 'Irlanda' },
  { code: '+353', country: 'IE', name: 'Irlanda' },
  { code: '+48', country: 'PL', name: 'Polonia' },
  { code: '+420', country: 'CZ', name: 'República Checa' },
  { code: '+36', country: 'HU', name: 'Hungría' },
  { code: '+40', country: 'RO', name: 'Rumanía' },
  { code: '+359', country: 'BG', name: 'Bulgaria' },
  { code: '+370', country: 'LT', name: 'Lituania' },
  { code: '+371', country: 'LV', name: 'Letonia' },
  { code: '+372', country: 'EE', name: 'Estonia' },
];

export const countryCodeOptions = countryCodes.map(c => ({
  value: c.code,
  label: `${c.code} ${c.name}`,
}));
