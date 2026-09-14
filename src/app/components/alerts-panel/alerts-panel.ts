import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import {
  LocationService,
  LocationUpdate,
  GeofenceConfig,
  GeofenceBreachEvent,
  GeofenceRestoredEvent
} from '../../services/location.service';
import { environment } from '../../../environments/environment';

type GeofenceStatus = 'INSIDE' | 'OUTSIDE';

interface WorkerAlertState {
  workerId: number;
  workerName: string;
  status: GeofenceStatus;
  totalBreaches: number;
  totalDurationOutsideSec: number;
  currentBreachStartedAt: Date | null;
  lastDistance: number;
  activeBreachLogId?: number;
}

@Component({
  selector: 'app-alerts-panel',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './alerts-panel.html',
  styleUrls: ['./alerts-panel.css']
})
export class AlertsPanel implements OnInit, OnDestroy {
  workerAlerts: WorkerAlertState[] = [];
  audioAlertsEnabled = true;
  alarmAcknowledged = false;
  hasActiveOutsideWorker = false;

  geofenceConfig: GeofenceConfig = {
    siteLat: 48.208492,
    siteLng: 16.373118,
    radiusMeters: 250,
    gracePeriodSeconds: 30
  };

  private readonly GEOFENCE_API = `${environment.apiUrl}/api/geofence`;
  private readonly WORKERS_API = `${environment.apiUrl}/api/workers`;

  private workerStates = new Map<number, WorkerAlertState>();
  private workerNames = new Map<number, string>();
  private locationSub?: Subscription;
  private geofenceSub?: Subscription;
  private breachSub?: Subscription;
  private restoredSub?: Subscription;
  private uiTimer?: ReturnType<typeof setInterval>;
  private alarmAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;

  constructor(
    private locationService: LocationService,
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadGeofenceConfig();
    this.loadWorkerBaselines();
    this.subscribeToGeofenceUpdates();
    this.subscribeToLocationUpdates();
    this.subscribeToGeofenceEvents();
    document.addEventListener('click', this.handleUserGesture, { once: false });
    this.uiTimer = setInterval(() => this.refreshDerivedState(), 1000);
  }

  get sortedWorkerAlerts(): WorkerAlertState[] {
    return Array.from(this.workerStates.values()).sort((a, b) => {
      if (a.status === b.status) {
        return a.workerId - b.workerId;
      }
      return a.status === 'OUTSIDE' ? -1 : 1;
    });
  }

  private loadGeofenceConfig(): void {
    this.http.get<GeofenceConfig>(this.GEOFENCE_API).subscribe({
      next: (config) => {
        this.geofenceConfig = config;
      },
      error: (err) => console.error('Failed to load geofence config:', err)
    });
  }

  private loadWorkerBaselines(): void {
    this.http.get<any[]>(this.WORKERS_API).subscribe({
      next: (workers) => {
        workers.forEach((worker) => {
          if (!worker?.id) return;
          const name = worker?.user?.name || `Worker ${worker.id}`;
          this.workerNames.set(worker.id, name);
          this.workerStates.set(worker.id, {
            workerId: worker.id,
            workerName: name,
            status: 'INSIDE',
            totalBreaches: worker.totalBreaches ?? 0,
            totalDurationOutsideSec: worker.totalDurationOutsideSec ?? 0,
            currentBreachStartedAt: null,
            lastDistance: 0
          });
        });
        this.syncWorkerAlertsArray();
      },
      error: (err) => console.warn('Unable to load worker baselines:', err)
    });
  }

  private subscribeToGeofenceUpdates(): void {
    this.geofenceSub = this.locationService.getGeofenceUpdates().subscribe((config) => {
      this.geofenceConfig = config;
    });
  }

  private subscribeToLocationUpdates(): void {
    this.locationSub = this.locationService.getLocationUpdates().subscribe((data: LocationUpdate) => {
      this.ngZone.run(() => {
        this.applyLocationUpdate(data);
        this.cdr.detectChanges();
      });
    });
  }

  private subscribeToGeofenceEvents(): void {
    this.breachSub = this.locationService.getGeofenceBreachEvents().subscribe((event) => {
      this.ngZone.run(() => {
        this.handleGeofenceBreach(event);
        this.cdr.detectChanges();
      });
    });

    this.restoredSub = this.locationService.getGeofenceRestoredEvents().subscribe((event) => {
      this.ngZone.run(() => {
        this.handleGeofenceRestored(event);
        this.cdr.detectChanges();
      });
    });
  }

  private ensureWorkerState(workerId: number, workerName?: string): WorkerAlertState {
    const existing = this.workerStates.get(workerId);
    if (existing) {
      if (workerName) {
        existing.workerName = workerName;
      }
      return existing;
    }

    const created: WorkerAlertState = {
      workerId,
      workerName: workerName || this.workerNames.get(workerId) || `Worker ${workerId}`,
      status: 'INSIDE',
      totalBreaches: 0,
      totalDurationOutsideSec: 0,
      currentBreachStartedAt: null,
      lastDistance: 0
    };
    this.workerStates.set(workerId, created);
    return created;
  }

  private applyLocationUpdate(data: LocationUpdate): void {
    const state = this.ensureWorkerState(data.workerId);
    if (data.distance !== undefined) {
      state.lastDistance = data.distance;
    }
    if (data.totalBreaches !== undefined) {
      state.totalBreaches = data.totalBreaches;
    }
    if (data.totalDurationOutsideSec !== undefined) {
      state.totalDurationOutsideSec = data.totalDurationOutsideSec;
    }
    if (data.geofenceStatus) {
      state.status = data.geofenceStatus;
    }
    this.syncWorkerAlertsArray();
    this.refreshDerivedState();
  }

  private handleGeofenceBreach(event: GeofenceBreachEvent): void {
    const state = this.ensureWorkerState(event.workerId, event.workerName);
    state.status = 'OUTSIDE';
    state.totalBreaches = event.totalBreaches;
    state.totalDurationOutsideSec = event.totalDurationOutsideSec;
    state.currentBreachStartedAt = new Date(event.breachedAt);
    state.activeBreachLogId = event.breachLogId;
    state.lastDistance = event.distance;

    this.alarmAcknowledged = false;
    this.startAlarmLoop();
    this.syncWorkerAlertsArray();
    this.refreshDerivedState();
  }

  private handleGeofenceRestored(event: GeofenceRestoredEvent): void {
    const state = this.ensureWorkerState(event.workerId);
    state.status = 'INSIDE';
    state.totalBreaches = event.totalBreaches;
    state.totalDurationOutsideSec = event.totalDurationOutsideSec;
    state.currentBreachStartedAt = null;
    state.activeBreachLogId = undefined;

    this.syncWorkerAlertsArray();
    this.refreshDerivedState();

    if (this.hasActiveOutsideWorker && !this.alarmAcknowledged) {
      this.startAlarmLoop();
    } else {
      this.stopAlarmLoop();
      if (!this.hasActiveOutsideWorker) {
        this.alarmAcknowledged = false;
      }
    }
  }

  private syncWorkerAlertsArray(): void {
    this.workerAlerts = this.sortedWorkerAlerts;
  }

  private refreshDerivedState(): void {
    this.hasActiveOutsideWorker = Array.from(this.workerStates.values()).some((w) => w.status === 'OUTSIDE');
    this.syncWorkerAlertsArray();
  }

  getCurrentOutsideDuration(state: WorkerAlertState): string {
    if (state.status !== 'OUTSIDE' || !state.currentBreachStartedAt) {
      return this.formatSeconds(state.totalDurationOutsideSec);
    }

    const activeSeconds = Math.max(
      0,
      Math.floor((Date.now() - state.currentBreachStartedAt.getTime()) / 1000)
    );
    return this.formatSeconds(activeSeconds);
  }

  getCumulativeOutsideDuration(state: WorkerAlertState): string {
    let total = state.totalDurationOutsideSec;
    if (state.status === 'OUTSIDE' && state.currentBreachStartedAt) {
      total += Math.max(0, Math.floor((Date.now() - state.currentBreachStartedAt.getTime()) / 1000));
    }
    return this.formatSeconds(total);
  }

  formatSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':');
  }

  toggleAudioAlerts(): void {
    this.audioAlertsEnabled = !this.audioAlertsEnabled;
    if (!this.audioAlertsEnabled) {
      this.stopAlarmLoop();
      return;
    }
    if (this.hasActiveOutsideWorker && !this.alarmAcknowledged) {
      this.startAlarmLoop();
    }
  }

  acknowledgeAlarm(): void {
    this.alarmAcknowledged = true;
    this.stopAlarmLoop();
  }

  private startAlarmLoop(): void {
    if (!this.audioAlertsEnabled || this.alarmAcknowledged) {
      return;
    }

    this.stopAlarmLoop();

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    this.audioContext.resume().then(() => {
      if (this.alarmAcknowledged || !this.audioAlertsEnabled) {
        return;
      }

      this.oscillator = this.audioContext!.createOscillator();
      this.gainNode = this.audioContext!.createGain();
      this.oscillator.type = 'square';
      this.oscillator.frequency.value = 880;
      this.gainNode.gain.setValueAtTime(0.0001, this.audioContext!.currentTime);
      this.gainNode.gain.exponentialRampToValueAtTime(0.2, this.audioContext!.currentTime + 0.05);
      this.oscillator.connect(this.gainNode).connect(this.audioContext!.destination);
      this.oscillator.start();
    }).catch((err) => console.warn('Alarm audio blocked:', err));
  }

  private stopAlarmLoop(): void {
    try {
      if (this.oscillator) {
        try {
          this.oscillator.stop();
        } catch {
          // ignore
        }
        this.oscillator.disconnect();
        this.oscillator = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.alarmAudio) {
        this.alarmAudio.pause();
        this.alarmAudio.currentTime = 0;
      }
    } catch (err) {
      console.warn('Error stopping alarm loop:', err);
    }
  }

  private handleUserGesture = async (): Promise<void> => {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        // ignore
      }
    }
  };

  ngOnDestroy(): void {
    this.locationSub?.unsubscribe();
    this.geofenceSub?.unsubscribe();
    this.breachSub?.unsubscribe();
    this.restoredSub?.unsubscribe();
    if (this.uiTimer) {
      clearInterval(this.uiTimer);
    }
    document.removeEventListener('click', this.handleUserGesture);
    this.stopAlarmLoop();
  }
}
