import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.html',
  styleUrl: './register.css',
  standalone: false
})
export class Register {
  fullName = '';
  email = '';
  password = '';

  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isLoading = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  onSubmit(): void {
    if (!this.fullName || !this.email || !this.password) {
      this.errorMessage.set('Please fill in all required fields.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.register({
      fullName: this.fullName,
      email: this.email,
      password: this.password
    }).subscribe({
      next: () => {
        // Automatically log the worker in after successful registration
        this.authService.login({ email: this.email, password: this.password }).subscribe({
          next: () => {
            this.isLoading.set(false);
            this.router.navigate(['/form']);
          },
          error: (loginErr) => {
            this.isLoading.set(false);
            this.errorMessage.set(loginErr.error?.message || 'Registration succeeded but automatic login failed. Please log in manually.');
          }
        });
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Registration failed. Try again.');
      }
    });
  }
}