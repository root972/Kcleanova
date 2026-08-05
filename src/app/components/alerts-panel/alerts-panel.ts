import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { LocationService, LocationUpdate } from '../../services/location.service';

@Component({
  selector: 'app-alerts-panel',
  standalone: false,
  templateUrl: './alerts-panel.html',
  styleUrl: './alerts-panel.css'
})
export class AlertsPanel implements OnInit, OnDestroy {
  alerts: string[] = [];
  allClear = true;
  private locationSub!: Subscription;

  readonly SITE_LAT = 48.208492;
  readonly SITE_LNG = 16.373118;
  readonly MAX_DISTANCE_METERS = 250;

  // ✅ Inject NgZone — forces Angular to re-render when socket data arrives
  constructor(private locationService: LocationService, private ngZone: NgZone) {}

  ngOnInit(): void {
    this.locationSub = this.locationService.getLocationUpdates().subscribe(
      (data: LocationUpdate) => {
        const distance = this.getDistanceMeters(
          data.latitude,
          data.longitude,
          this.SITE_LAT,
          this.SITE_LNG
        );

        console.log(`📡 WORKER #${data.workerId} DISTANCE: ${Math.round(distance)}m (limit: ${this.MAX_DISTANCE_METERS}m)`);

        if (distance > this.MAX_DISTANCE_METERS) {
          const timeStr = new Date().toLocaleTimeString();
          const alertMsg = `🚨 [${timeStr}] Worker #${data.workerId} is OUT OF BOUNDS! (${Math.round(distance)}m away)`;

          // ✅ Run inside Angular zone so the template re-renders immediately
          this.ngZone.run(() => {
            this.alerts.unshift(alertMsg);
            this.allClear = false;
            console.warn('ALERT TRIGGERED!', alertMsg);
          });
        } else {
          this.ngZone.run(() => {
            this.allClear = this.alerts.length === 0;
          });
        }
      }
    );
  }

  private getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  clearAlerts(): void {
    this.ngZone.run(() => {
      this.alerts = [];
      this.allClear = true;
    });
  }

  ngOnDestroy(): void {
    if (this.locationSub) this.locationSub.unsubscribe();
  }
}