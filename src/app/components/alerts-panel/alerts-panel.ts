import { Component, OnInit, OnDestroy } from '@angular/core';
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
  private locationSub!: Subscription;

  // 🎯 SIMPLE GEOFENCE SETTINGS
  readonly SITE_LAT = 48.208492;
  readonly SITE_LNG = 16.373118;
  readonly MAX_DISTANCE_METERS = 30; // 30 meters threshold

  constructor(private locationService: LocationService) {}

  ngOnInit(): void {
    // 👂 Listen to live location updates from backend
    this.locationSub = this.locationService.getLocationUpdates().subscribe(
      (data: LocationUpdate) => {
        const distance = this.getDistanceMeters(
          data.latitude,
          data.longitude,
          this.SITE_LAT,
          this.SITE_LNG
        );

        console.log(`📡 WORKER #${data.workerId} DISTANCE: ${Math.round(distance)} meters`);

        // 🚨 IF WORKER IS MORE THAN 30 METERS AWAY -> TRIGGER ALERT IMMEDIATELY
        if (distance > this.MAX_DISTANCE_METERS) {
          const timeStr = new Date().toLocaleTimeString();
          const alertMsg = `🚨 [${timeStr}] ALERT: Worker #${data.workerId} is OUT OF BOUNDS! (${Math.round(distance)}m away)`;
          
          // Push alert to screen array
          this.alerts.unshift(alertMsg);
          console.warn("ALERT TRIGGERED!", alertMsg);
        }
      }
    );
  }

  // Pure Math Distance Formula (Haversine in Meters)
  private getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
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
    this.alerts = [];
  }

  ngOnDestroy(): void {
    if (this.locationSub) this.locationSub.unsubscribe();
  }
}