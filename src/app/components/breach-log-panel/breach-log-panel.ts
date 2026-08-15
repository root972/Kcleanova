import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { LocationService, BreachLog } from '../../services/location.service';

@Component({
  selector: 'app-breach-log-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './breach-log-panel.html',
  styleUrls: ['./breach-log-panel.css']
})
export class BreachLogPanel implements OnInit, OnDestroy {
  breachLogs: BreachLog[] = [];
  private breachLogSub?: Subscription;
  private refreshTimer: number | null = null;
  isLoading = false;

  constructor(
    private locationService: LocationService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.isLoading = true;
    this.loadBreachLogs();
    this.breachLogSub = this.locationService.getBreachLogUpdates().subscribe((logs) => {
      this.ngZone.run(() => {
        this.breachLogs = logs;
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    });

    this.refreshTimer = window.setInterval(() => {
      this.cdr.detectChanges();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.breachLogSub) {
      this.breachLogSub.unsubscribe();
    }
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
    }
  }

  private loadBreachLogs(): void {
    this.locationService.fetchBreachLogs().subscribe({
      next: (logs) => {
        this.breachLogs = logs;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load breach logs:', err);
        this.isLoading = false;
      }
    });
  }

  formatTimestamp(timestamp?: string): string {
    if (!timestamp) {
      return '-';
    }
    return new Date(timestamp).toLocaleTimeString();
  }

  formatDuration(log: BreachLog): string {
    if (log.status === 'ACTIVE') {
      const start = new Date(log.startTime).getTime();
      const now = Date.now();
      const seconds = Math.max(0, Math.floor((now - start) / 1000));
      return this.formatSeconds(seconds);
    }
    return this.formatSeconds(log.durationSec ?? 0);
  }

  formatSeconds(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  formatDistance(distance: number): string {
    if (distance >= 1000) {
      return `${(distance / 1000).toFixed(1)} km`;
    }
    return `${Math.round(distance)}m`;
  }

  isActive(log: BreachLog): boolean {
    return log.status === 'ACTIVE';
  }
}
