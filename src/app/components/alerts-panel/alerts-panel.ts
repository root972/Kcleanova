import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { LocationService, LocationUpdate, GeofenceConfig } from '../../services/location.service';

@Component({
  selector: 'app-alerts-panel',
  standalone: false,
  templateUrl: './alerts-panel.html',
  styleUrls: ['./alerts-panel.css']
})
export class AlertsPanel implements OnInit, OnDestroy {
  alerts: string[] = [];
  allClear = true;
  private locationSub!: Subscription;
  private geofenceSub!: Subscription;
  private outOfBoundsStart = new Map<number, number>();
  private alertTriggered = new Set<number>();
  soundEnabled = false;
  audioContext: AudioContext | null = null;

  geofenceConfig: GeofenceConfig = {
    siteLat: 48.208492,
    siteLng: 16.373118,
    radiusMeters: 250,
    gracePeriodSeconds: 30
  };

  private readonly GEOFENCE_API = 'http://localhost:3000/api/geofence';

  // ✅ Inject NgZone — forces Angular to re-render when socket data arrives
  constructor(
    private locationService: LocationService,
    private http: HttpClient,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.loadGeofenceConfig();
    this.subscribeToGeofenceUpdates();
    this.locationSub = this.locationService.getLocationUpdates().subscribe(
      (data: LocationUpdate) => {
        const lat = data.latitude ?? data.lat;
        const lng = data.longitude ?? data.lng;

        if (lat === undefined || lng === undefined) {
          console.warn(`Received LocationUpdate for Worker #${data.workerId} without valid coordinates.`);
          return;
        }

        const distance = this.getDistanceMeters(
          lat,
          lng,
          this.geofenceConfig.siteLat,
          this.geofenceConfig.siteLng
        );

        const roundedDistance = Math.round(distance);
        console.log(`📡 WORKER #${data.workerId} DISTANCE: ${roundedDistance}m (limit: ${this.geofenceConfig.radiusMeters}m)`);

        const now = Date.now();
        const startTime = this.outOfBoundsStart.get(data.workerId);

        if (distance > this.geofenceConfig.radiusMeters) {
          if (!startTime) {
            this.outOfBoundsStart.set(data.workerId, now);
            console.log(`Worker #${data.workerId} exited boundary; starting grace period.`);
            return;
          }

          const elapsedSeconds = (now - startTime) / 1000;
          if (elapsedSeconds >= this.geofenceConfig.gracePeriodSeconds) {
            if (!this.alertTriggered.has(data.workerId)) {
              const timeStr = new Date().toLocaleTimeString();
              const alertMsg = `🚨 [${timeStr}] Worker #${data.workerId} is OUT OF BOUNDS! (${roundedDistance}m away)`;
              this.ngZone.run(() => {
                this.alerts.unshift(alertMsg);
                this.allClear = false;
              });
              this.alertTriggered.add(data.workerId);
              this.playAlertSound();
              console.warn('ALERT TRIGGERED!', alertMsg);
            }
          }
        } else {
          if (startTime || this.alertTriggered.has(data.workerId)) {
            this.outOfBoundsStart.delete(data.workerId);
            this.alertTriggered.delete(data.workerId);
            this.ngZone.run(() => {
              this.allClear = this.alerts.length === 0;
            });
          }
        }
      }
    );
  }

  private loadGeofenceConfig(): void {
    this.http.get<GeofenceConfig>(this.GEOFENCE_API).subscribe({
      next: (config) => {
        this.geofenceConfig = config;
      },
      error: (err) => {
        console.error('Failed to load geofence config:', err);
      }
    });
  }

  private subscribeToGeofenceUpdates(): void {
    this.geofenceSub = this.locationService.getGeofenceUpdates().subscribe((config) => {
      this.geofenceConfig = config;
      console.log('Geofence config updated through socket event.', config);
    });
  }

  private playAlertSound(): void {
    if (!this.soundEnabled) return;
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    this.audioContext.resume().then(() => {
      const oscillator = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, this.audioContext!.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, this.audioContext!.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext!.currentTime + 0.4);
      oscillator.connect(gain).connect(this.audioContext!.destination);
      oscillator.start();
      oscillator.stop(this.audioContext!.currentTime + 0.4);
    }).catch(err => {
      console.warn('Audio playback blocked or unavailable:', err);
    });
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    if (this.soundEnabled && !this.audioContext) {
      this.audioContext = new AudioContext();
      this.audioContext.resume().catch(() => {
        console.warn('Unable to resume audio context yet.');
      });
    }
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
    if (this.locationSub) {
      this.locationSub.unsubscribe();
    }
    if (this.geofenceSub) {
      this.geofenceSub.unsubscribe();
    }
  }
}