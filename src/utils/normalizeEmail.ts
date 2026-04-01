export function normalizeEmail(email: string): string {
    if (!email) return '';
    email = email.trim().toLowerCase();
    
    if (!email.includes('@')) return email;
    
    let [localPart, domain] = email.split('@');
    if (!localPart || !domain) return email;
    
    // Normalize Gmail addresses
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      // Remove all dots from local part
      localPart = localPart.replace(/\./g, '');
      
      // Standardize domain to gmail.com
      domain = 'gmail.com';
    }
    
    return `${localPart}@${domain}`;
  }
