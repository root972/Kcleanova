import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { LocationService } from '../services/location.service';

interface WakeLockSentinelWithRelease extends WakeLockSentinel {
  released: boolean;
}

@Component({
  selector: 'app-form',
  standalone: false,
  templateUrl: './form.html',
  styleUrl: './form.css'
})
export class Form implements OnInit, OnDestroy {
  wakeLockActive = false;
  wakeLockWarning = false;

  private wakeLock: WakeLockSentinelWithRelease | null = null;
  private wakeLockReleaseHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(
    public authService: AuthService,
    public locationService: LocationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.authService.currentUser() as any;
    const workerId = user?.worker?.id || user?.workerId;

    if (workerId) {
      this.locationService.startTracking(Number(workerId));
      void this.requestWakeLock();
    } else {
      console.warn('Unable to start tracking: No valid workerId found on user context.');
    }

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && !this.wakeLockActive) {
        void this.requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private async requestWakeLock(): Promise<void> {
    if (!('wakeLock' in navigator)) {
      this.wakeLockWarning = true;
      return;
    }

    try {
      if (this.wakeLock && !this.wakeLock.released) {
        return;
      }

      this.wakeLock = await navigator.wakeLock.request('screen') as WakeLockSentinelWithRelease;
      this.wakeLockActive = true;
      this.wakeLockWarning = false;

      this.wakeLockReleaseHandler = () => {
        this.wakeLockActive = false;
        this.wakeLock = null;
        void this.requestWakeLock();
      };

      this.wakeLock.addEventListener('release', this.wakeLockReleaseHandler);
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
      this.wakeLockActive = false;
      this.wakeLockWarning = true;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    if (this.wakeLock && this.wakeLockReleaseHandler) {
      this.wakeLock.removeEventListener('release', this.wakeLockReleaseHandler);
    }

    if (this.wakeLock && !this.wakeLock.released) {
      try {
        await this.wakeLock.release();
      } catch (err) {
        console.warn('Wake Lock release failed:', err);
      }
    }

    this.wakeLock = null;
    this.wakeLockActive = false;
  }

  endShiftAndLogout(): void {
    void this.releaseWakeLock();
    this.locationService.stopTracking();
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    void this.releaseWakeLock();
    this.locationService.stopTracking();
  }
}
