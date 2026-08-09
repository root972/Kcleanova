import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: false,
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.css']
})
export class ResetPassword {
  token = '';
  newPassword = '';
  confirmPassword = '';
  message = signal<string | null>(null);
  error = signal<string | null>(null);
  isLoading = signal(false);

  constructor(private route: ActivatedRoute, private auth: AuthService, private router: Router) {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'] || '';
    });
  }

  submit(): void {
    if (!this.token) {
      this.error.set('Missing reset token.');
      return;
    }
    if (!this.newPassword || this.newPassword.length < 6) {
      this.error.set('Please enter a new password of at least 6 characters.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.auth.resetPassword(this.token, this.newPassword).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.message.set(res.message || 'Password reset successful. Redirecting to login...');
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.error.set(err.error?.message || 'Failed to reset password.');
      }
    });
  }
}