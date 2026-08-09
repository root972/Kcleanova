import { Component, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: false,
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.css']
})
export class ForgotPassword {
  email = '';
  message = signal<string | null>(null);
  error = signal<string | null>(null);
  isLoading = signal(false);

  constructor(private auth: AuthService) {}

  submit(): void {
    if (!this.email) {
      this.error.set('Please enter your email.');
      return;
    }
    this.isLoading.set(true);
    this.error.set(null);
    this.auth.forgotPassword(this.email).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.message.set(res.message || 'If an account exists, a reset link has been sent.');
      },
      error: (err) => {
        this.isLoading.set(false);
        this.error.set(err.error?.message || 'Failed to process request.');
      }
    });
  }
}