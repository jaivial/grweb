import {
  validateEmailConfig,
  hasErrors,
  type EmailConfigFormData,
} from '../../utils/emailConfigValidation';

describe('validateEmailConfig', () => {
  describe('Gmail provider (mainProvider === 1)', () => {
    const gmailData: EmailConfigFormData = {
      mainProvider: 1,
      gmailAddress: 'test@gmail.com',
      gmailAppPassword: 'xxxx xxxx xxxx xxxx',
      smtpUsername: '',
      smtpPassword: '',
      smtpEmailAddress: '',
      smtpHost: '',
      smtpPort: 0,
    };

    test('returns no errors for valid Gmail config', () => {
      const errors = validateEmailConfig(gmailData);
      expect(errors).toEqual({});
    });

    test('returns no errors for googlemail.com domain', () => {
      const data = { ...gmailData, gmailAddress: 'test@googlemail.com' };
      const errors = validateEmailConfig(data);
      expect(errors).toEqual({});
    });

    test('returns error for empty Gmail address', () => {
      const data = { ...gmailData, gmailAddress: '' };
      const errors = validateEmailConfig(data);
      expect(errors.gmailAddress).toBe('La dirección de Gmail es obligatoria');
    });

    test('returns error for whitespace-only Gmail address', () => {
      const data = { ...gmailData, gmailAddress: '   ' };
      const errors = validateEmailConfig(data);
      expect(errors.gmailAddress).toBe('La dirección de Gmail es obligatoria');
    });

    test('returns error for non-gmail domain', () => {
      const data = { ...gmailData, gmailAddress: 'test@yahoo.com' };
      const errors = validateEmailConfig(data);
      expect(errors.gmailAddress).toBe('Debe ser una cuenta de Gmail válida');
    });

    test('returns error for non-gmail domain with @gmail prefix', () => {
      const data = { ...gmailData, gmailAddress: 'test@outlook.com' };
      const errors = validateEmailConfig(data);
      expect(errors.gmailAddress).toBe('Debe ser una cuenta de Gmail válida');
    });

    test('returns error for empty app password', () => {
      const data = { ...gmailData, gmailAppPassword: '' };
      const errors = validateEmailConfig(data);
      expect(errors.gmailAppPassword).toBe('La contraseña de aplicación es obligatoria');
    });

    test('returns error for whitespace-only app password', () => {
      const data = { ...gmailData, gmailAppPassword: '   ' };
      const errors = validateEmailConfig(data);
      expect(errors.gmailAppPassword).toBe('La contraseña de aplicación es obligatoria');
    });

    test('returns multiple errors when both fields are invalid', () => {
      const data = { ...gmailData, gmailAddress: '', gmailAppPassword: '' };
      const errors = validateEmailConfig(data);
      expect(errors.gmailAddress).toBeDefined();
      expect(errors.gmailAppPassword).toBeDefined();
      expect(Object.keys(errors)).toHaveLength(2);
    });

    test('ignores SMTP fields when provider is Gmail', () => {
      const data = { ...gmailData, smtpUsername: '', smtpPassword: '', smtpEmailAddress: '', smtpHost: '' };
      const errors = validateEmailConfig(data);
      expect(errors.smtpUsername).toBeUndefined();
      expect(errors.smtpPassword).toBeUndefined();
      expect(errors.smtpEmailAddress).toBeUndefined();
      expect(errors.smtpHost).toBeUndefined();
    });
  });

  describe('SMTP provider (mainProvider === 0)', () => {
    const smtpData: EmailConfigFormData = {
      mainProvider: 0,
      gmailAddress: '',
      gmailAppPassword: '',
      smtpUsername: 'smtpuser@example.com',
      smtpPassword: 'smtp-password-123',
      smtpEmailAddress: 'noreply@example.com',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
    };

    test('returns no errors for valid SMTP config', () => {
      const errors = validateEmailConfig(smtpData);
      expect(errors).toEqual({});
    });

    test('returns error for empty SMTP username', () => {
      const data = { ...smtpData, smtpUsername: '' };
      const errors = validateEmailConfig(data);
      expect(errors.smtpUsername).toBe('El usuario SMTP es obligatorio');
    });

    test('returns error for whitespace-only SMTP username', () => {
      const data = { ...smtpData, smtpUsername: '   ' };
      const errors = validateEmailConfig(data);
      expect(errors.smtpUsername).toBe('El usuario SMTP es obligatorio');
    });

    test('returns error for empty SMTP password', () => {
      const data = { ...smtpData, smtpPassword: '' };
      const errors = validateEmailConfig(data);
      expect(errors.smtpPassword).toBe('La contraseña SMTP es obligatoria');
    });

    test('returns error for empty SMTP email address', () => {
      const data = { ...smtpData, smtpEmailAddress: '' };
      const errors = validateEmailConfig(data);
      expect(errors.smtpEmailAddress).toBe('El email SMTP es obligatorio');
    });

    test('returns error for empty SMTP host', () => {
      const data = { ...smtpData, smtpHost: '' };
      const errors = validateEmailConfig(data);
      expect(errors.smtpHost).toBe('El host SMTP es obligatorio');
    });

    test('returns error for whitespace-only SMTP host', () => {
      const data = { ...smtpData, smtpHost: '   ' };
      const errors = validateEmailConfig(data);
      expect(errors.smtpHost).toBe('El host SMTP es obligatorio');
    });

    test('returns multiple errors when multiple fields are invalid', () => {
      const data = { ...smtpData, smtpUsername: '', smtpPassword: '', smtpEmailAddress: '', smtpHost: '' };
      const errors = validateEmailConfig(data);
      expect(errors.smtpUsername).toBeDefined();
      expect(errors.smtpPassword).toBeDefined();
      expect(errors.smtpEmailAddress).toBeDefined();
      expect(errors.smtpHost).toBeDefined();
      expect(Object.keys(errors)).toHaveLength(4);
    });

    test('ignores Gmail fields when provider is SMTP', () => {
      const data = { ...smtpData, gmailAddress: '', gmailAppPassword: '' };
      const errors = validateEmailConfig(data);
      expect(errors.gmailAddress).toBeUndefined();
      expect(errors.gmailAppPassword).toBeUndefined();
    });
  });
});

describe('hasErrors', () => {
  test('returns true when errors object has keys', () => {
    expect(hasErrors({ gmailAddress: 'error' })).toBe(true);
    expect(hasErrors({ smtpUsername: 'error', smtpPassword: 'error' })).toBe(true);
  });

  test('returns false when errors object is empty', () => {
    expect(hasErrors({})).toBe(false);
  });
});
