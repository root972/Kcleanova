export type UserRole = 'ADMIN' | 'WORKER';

export interface WorkerProfile {
  id: number;
  userId?: string | number;
  phone?: string;
  status?: string;
}

export interface User {
  id?: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  worker?: WorkerProfile; 
}

export interface AuthResponse {
  token: string;
  user: User;
  message?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  role?: UserRole;
}