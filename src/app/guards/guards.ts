import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const isAuth = authService.isAuthenticated();
    const userRole = authService.userRole();

    // Not authenticated => send to login
    if (!isAuth) {
      return router.createUrlTree(['/login']);
    }

    // Authorized role
    if (userRole && allowedRoles.includes(userRole)) {
      return true;
    }

    // Authenticated but wrong role => send to worker form as a safe default
    return router.createUrlTree(['/form']);
  };
};