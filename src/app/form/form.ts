import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { LocationService } from '../services/location.service';

@Component({
  selector: 'app-form',
  standalone: false,
  templateUrl: './form.html',
  styleUrl: './form.css'
})
export class Form implements OnInit, OnDestroy {
  constructor(
    public authService: AuthService,
    public locationService: LocationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUser() as any;
    
    // Fall back through possible worker ID fields on your user object
    const workerId = user?.worker?.id || user?.workerId || user?.id;

    if (workerId) {
      this.locationService.startTracking(Number(workerId));
    } else {
      console.warn('Unable to start tracking: No valid workerId found on user context.');
    }
  }

  endShiftAndLogout(): void {
    this.locationService.stopTracking();
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.locationService.stopTracking();
  }
}