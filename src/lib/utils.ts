import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Sanitize data for CSV/Excel export to prevent formula injection
export function sanitizeForExport(value: any): string {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  
  // Check if the value starts with potentially dangerous characters
  if (/^[=+\-@\t\r]/.test(str)) {
    // Prefix with single quote to prevent formula execution
    return `'${str}`;
  }
  
  // Remove any control characters that could be problematic
  return str.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

// Sanitize HTML to prevent XSS while preserving safe formatting
export function sanitizeHtml(html: string): string {
  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Remove any script tags and event handlers
  const scripts = temp.querySelectorAll('script');
  scripts.forEach(script => script.remove());
  
  // Remove dangerous attributes
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(element => {
    // Remove event handlers
    Array.from(element.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        element.removeAttribute(attr.name);
      }
    });
    
    // Remove javascript: urls
    ['href', 'src', 'action'].forEach(attrName => {
      const attr = element.getAttribute(attrName);
      if (attr && attr.toLowerCase().startsWith('javascript:')) {
        element.removeAttribute(attrName);
      }
    });
  });
  
  return temp.innerHTML;
}
