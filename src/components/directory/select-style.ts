import type {CSSProperties} from 'react';
// LOCAL PRO ONLY (multivertical M1): native <select> of the directory forms with a 44 px touch target also on iOS
// Safari (WebKit ignores min-height on the native menulist look), drawn arrow instead of the system one.
export const SELECT_CLASS='appearance-none pr-10';
export const SELECT_STYLE:CSSProperties={backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23162543'%3E%3Cpath d='M5 7l5 6 5-6z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 0.75rem center',backgroundSize:'1rem'};
