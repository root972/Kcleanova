import { Injectable, Injector, signal, computed, inject } from '@angular/core';
import { LocationService } from './location.service';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthResponse, LoginPayload, RegisterPayload, User, UserRole } from '../models/user.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = `${environment.apiUrl}/api/auth`;
  private readonly TOKEN_KEY = 'geo_auth_token';
  private readonly USER_KEY = 'geo_auth_user';

  // Angular Signals for application-wide state management
  currentUser = signal<User | null>(this.getStoredUser());

  // Computed state signals for routing and UI controls
  isAuthenticated = computed(() => !!this.currentUser());
  userRole = computed<UserRole | null>(() => this.currentUser()?.role || null);
  isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');

  private readonly injector = inject(Injector);

  constructor(private http: HttpClient) {}

  register(payload: RegisterPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.API_URL}/register`, payload);
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, payload).pipe(
      tap((response) => {
        this.saveSession(response.token, response.user);
      })
    );
  }

  // Forgot password: send reset link (or log it in dev)
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.API_URL}/forgot-password`, { email });
  }

  // Reset password using token
  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.API_URL}/reset-password`, { token, newPassword });
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
    try {
      this.injector.get(LocationService).disconnectSocket();
    } catch {
      // LocationService may not be instantiated yet
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private saveSession(token: string, user: User): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    try {
      this.injector.get(LocationService).refreshSocketConnection();
    } catch {
      // LocationService may not be instantiated yet
    }
  }

  private getStoredUser(): User | null {
    const rawUser = localStorage.getItem(this.USER_KEY);
    if (!rawUser) return null;
    try {
      return JSON.parse(rawUser) as User;
    } catch {
      return null;
    }
  }
}