export interface EmailConfigFormData {
  mainProvider: number;
  gmailAddress: string;
  gmailAppPassword: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpEmailAddress: string;
  smtpHost: string;
  smtpPort: number;
}

export interface EmailConfigValidationErrors {
  gmailAddress?: string;
  gmailAppPassword?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpEmailAddress?: string;
  smtpHost?: string;
}

export function validateEmailConfig(data: EmailConfigFormData): EmailConfigValidationErrors {
  const errors: EmailConfigValidationErrors = {};

  if (data.mainProvider === 1) {
    // Gmail validation
    if (!data.gmailAddress.trim()) {
      errors.gmailAddress = 'La dirección de Gmail es obligatoria';
    } else if (
      !data.gmailAddress.includes('@gmail.com') &&
      !data.gmailAddress.includes('@googlemail.com')
    ) {
      errors.gmailAddress = 'Debe ser una cuenta de Gmail válida';
    }
    if (!data.gmailAppPassword.trim()) {
      errors.gmailAppPassword = 'La contraseña de aplicación es obligatoria';
    }
  } else {
    // SMTP validation
    if (!data.smtpUsername.trim()) {
      errors.smtpUsername = 'El usuario SMTP es obligatorio';
    }
    if (!data.smtpPassword.trim()) {
      errors.smtpPassword = 'La contraseña SMTP es obligatoria';
    }
    if (!data.smtpEmailAddress.trim()) {
      errors.smtpEmailAddress = 'El email SMTP es obligatorio';
    }
    if (!data.smtpHost.trim()) {
      errors.smtpHost = 'El host SMTP es obligatorio';
    }
  }

  return errors;
}

export function hasErrors(errors: EmailConfigValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
