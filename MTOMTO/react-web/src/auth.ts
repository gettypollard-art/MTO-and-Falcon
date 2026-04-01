import type { UserRole } from './models';
import { userRoleLabel } from './models';

export type Credential = {
  username: string;
  password: string;
  role: UserRole;
  label: string;
};

// Default credentials — admin can manage these later via the admin panel
export const defaultCredentials: Credential[] = [
  { username: 'admin',       password: 'admin',       role: 'ceo',               label: userRoleLabel['ceo'] },
  { username: 'ceo',         password: 'ceo',         role: 'ceoExecutive',      label: userRoleLabel['ceoExecutive'] },
  { username: 'manager',     password: 'manager',     role: 'generalManager',    label: userRoleLabel['generalManager'] },
  { username: 'flowersales', password: 'flowersales', role: 'flowerSales',       label: userRoleLabel['flowerSales'] },
  { username: 'producer',    password: 'producer',    role: 'producer',          label: userRoleLabel['producer'] },
  { username: 'denise',      password: 'denise',      role: 'budtenderTd',       label: userRoleLabel['budtenderTd'] },
  { username: 'joseph',      password: 'joseph',      role: 'budtenderTdJunior', label: userRoleLabel['budtenderTdJunior'] },
  { username: 'carson',      password: 'carson',      role: 'budtenderJo',       label: userRoleLabel['budtenderJo'] },
  { username: 'tyrell',      password: 'tyrell',      role: 'budtenderJoSenior', label: userRoleLabel['budtenderJoSenior'] },
  { username: 'amber',       password: 'amber',       role: 'budtenderJoJunior', label: userRoleLabel['budtenderJoJunior'] },
];

const AUTH_KEY = 'mto_auth_role';

export function getStoredRole(): UserRole | null {
  const val = localStorage.getItem(AUTH_KEY);
  if (!val) return null;
  return val as UserRole;
}

export function storeRole(role: UserRole): void {
  localStorage.setItem(AUTH_KEY, role);
}

export function clearStoredRole(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function authenticate(username: string, password: string): UserRole | null {
  const cred = defaultCredentials.find(
    (c) =>
      c.username.toLowerCase() === username.trim().toLowerCase() &&
      c.password === password,
  );
  return cred?.role ?? null;
}
