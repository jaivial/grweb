import { describe, it, expect } from 'vitest';

describe('FER Form Validation', () => {
  describe('Nombre validation', () => {
    const validateNombre = (nombre: string): string | null => {
      if (!nombre || nombre.length < 2) {
        return 'Nombre demasiado corto';
      }
      if (nombre.length > 100) {
        return 'Nombre demasiado largo';
      }
      return null;
    };

    it('should reject empty nombre', () => {
      expect(validateNombre('')).toBe('Nombre demasiado corto');
    });

    it('should reject single character nombre', () => {
      expect(validateNombre('J')).toBe('Nombre demasiado corto');
    });

    it('should accept valid nombre', () => {
      expect(validateNombre('Juan')).toBeNull();
    });

    it('should reject very long nombre', () => {
      const longName = 'A'.repeat(101);
      expect(validateNombre(longName)).toBe('Nombre demasiado largo');
    });
  });

  describe('Email validation', () => {
    const validateEmail = (email: string): string | null => {
      if (!email) {
        return 'Email requerido';
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return 'Email inválido';
      }
      return null;
    };

    it('should reject empty email', () => {
      expect(validateEmail('')).toBe('Email requerido');
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('invalid')).toBe('Email inválido');
      expect(validateEmail('invalid@')).toBe('Email inválido');
      expect(validateEmail('@invalid.com')).toBe('Email inválido');
      expect(validateEmail('invalid@.com')).toBe('Email inválido');
    });

    it('should accept valid email', () => {
      expect(validateEmail('test@example.com')).toBeNull();
      expect(validateEmail('user.name@domain.co.uk')).toBeNull();
    });
  });

  describe('Instagram validation', () => {
    const validateInstagram = (instagram: string): string | null => {
      if (!instagram) return null; // Optional field
      if (!/^@?[\w]{1,30}$/.test(instagram)) {
        return 'Instagram inválido';
      }
      return null;
    };

    it('should accept empty (optional field)', () => {
      expect(validateInstagram('')).toBeNull();
    });

    it('should accept valid usernames', () => {
      expect(validateInstagram('username')).toBeNull();
      expect(validateInstagram('@username')).toBeNull();
      expect(validateInstagram('user_name_123')).toBeNull();
    });

    it('should reject invalid usernames', () => {
      expect(validateInstagram('user@name')).toBe('Instagram inválido');
      expect(validateInstagram('user name')).toBe('Instagram inválido');
    });
  });

  describe('Peso validation', () => {
    const validatePeso = (peso: number): string | null => {
      if (peso < 40) {
        return 'Peso mínimo 40kg';
      }
      if (peso > 150) {
        return 'Peso máximo 150kg';
      }
      return null;
    };

    it('should reject peso below 40kg', () => {
      expect(validatePeso(39)).toBe('Peso mínimo 40kg');
    });

    it('should reject peso above 150kg', () => {
      expect(validatePeso(151)).toBe('Peso máximo 150kg');
    });

    it('should accept valid peso range', () => {
      expect(validatePeso(40)).toBeNull();
      expect(validatePeso(70)).toBeNull();
      expect(validatePeso(150)).toBeNull();
    });
  });

  describe('Experiencia validation', () => {
    const validateExperiencia = (exp: string): string | null => {
      const validOptions = ['principiante', 'intermedio', 'avanzado'];
      if (!validOptions.includes(exp)) {
        return 'Experiencia inválida';
      }
      return null;
    };

    it('should accept valid experiencia values', () => {
      expect(validateExperiencia('principiante')).toBeNull();
      expect(validateExperiencia('intermedio')).toBeNull();
      expect(validateExperiencia('avanzado')).toBeNull();
    });

    it('should reject invalid experiencia values', () => {
      expect(validateExperiencia('experto')).toBe('Experiencia inválida');
      expect(validateExperiencia('')).toBe('Experiencia inválida');
    });
  });

  describe('Form validation', () => {
    interface FormData {
      nombre: string;
      email: string;
      instagram: string;
      pesoAprox: number;
      experiencia: string;
      tieneEntrenador: boolean;
      aceptaTerminos: boolean;
    }

    const validateForm = (data: FormData): Record<string, string> => {
      const errors: Record<string, string> = {};

      if (!data.nombre || data.nombre.length < 2) {
        errors.nombre = 'Nombre demasiado corto';
      }

      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = 'Email inválido';
      }

      if (data.pesoAprox < 40 || data.pesoAprox > 150) {
        errors.pesoAprox = 'Peso debe estar entre 40 y 150 kg';
      }

      if (!['principiante', 'intermedio', 'avanzado'].includes(data.experiencia)) {
        errors.experiencia = 'Experiencia requerida';
      }

      if (!data.aceptaTerminos) {
        errors.aceptaTerminos = 'Debes aceptar los términos';
      }

      return errors;
    };

    it('should return no errors for valid form data', () => {
      const validData: FormData = {
        nombre: 'Juan García',
        email: 'juan@example.com',
        instagram: 'juanga',
        pesoAprox: 75,
        experiencia: 'principiante',
        tieneEntrenador: false,
        aceptaTerminos: true,
      };

      const errors = validateForm(validData);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('should return multiple errors for invalid form data', () => {
      const invalidData: FormData = {
        nombre: 'J',
        email: 'invalid',
        instagram: '',
        pesoAprox: 30,
        experiencia: 'invalid',
        tieneEntrenador: false,
        aceptaTerminos: false,
      };

      const errors = validateForm(invalidData);
      expect(Object.keys(errors).length).toBeGreaterThanOrEqual(4);
      expect(errors.nombre).toBeDefined();
      expect(errors.email).toBeDefined();
      expect(errors.pesoAprox).toBeDefined();
      expect(errors.aceptaTerminos).toBeDefined();
    });
  });
});

describe('Price calculations', () => {
  it('should calculate total correctly with upsell', () => {
    const precioBase = 35;
    const precioUpsell = 60;
    const tieneUpsell = true;

    const total = precioBase + (tieneUpsell ? precioUpsell : 0);
    expect(total).toBe(95);
  });

  it('should calculate total correctly without upsell', () => {
    const precioBase = 35;
    const precioUpsell = 60;
    const tieneUpsell = false;

    const total = precioBase + (tieneUpsell ? precioUpsell : 0);
    expect(total).toBe(35);
  });

  it('should calculate raffle tickets price', () => {
    const precioTicket = 5;
    const cantidad = 3;

    const total = precioTicket * cantidad;
    expect(total).toBe(15);
  });
});

describe('Slug generation', () => {
  const generateSlug = (nombre: string): string => {
    return nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  it('should generate valid slug from competition name', () => {
    expect(generateSlug('GR Cup 2026')).toBe('gr-cup-2026');
    expect(generateSlug('FER Powerlifting Day')).toBe('fer-powerlifting-day');
  });

  it('should handle special characters', () => {
    // Note: ñ gets normalized to n in NFC normalization
    expect(generateSlug('GR Cup España')).toBe('gr-cup-espana');
    expect(generateSlug('Test & More')).toBe('test-more');
  });

  it('should remove leading/trailing dashes', () => {
    expect(generateSlug('  Test  ')).toBe('test');
  });
});
