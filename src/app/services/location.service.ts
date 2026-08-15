import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

// 1. EXPORT LocationUpdate REQUIRED BY alerts-panel AND worker-map
export interface LocationUpdate {
  workerId: number;
  lat: number;
  lng: number;
  latitude?: number;
  longitude?: number;
  distance?: number;
  timestamp?: string | Date;
  geofenceStatus?: 'INSIDE' | 'OUTSIDE';
  totalBreaches?: number;
  totalDurationOutsideSec?: number;
}

export interface GeofenceConfig {
  id?: number;
  siteLat: number;
  siteLng: number;
  radiusMeters: number;
  gracePeriodSeconds: number;
}

// 2. ALIAS WorkerLocation TO PREVENT BREAKING EXISTING CODE
export type WorkerLocation = LocationUpdate;

export interface GeofenceAlert {
  workerId: number;
  distance: number;
  timestamp: string | Date;
}

export interface BreachLog {
  id: number;
  workerId: number;
  workerName?: string;
  startTime: string;
  endTime?: string;
  breachedAt?: string;
  resolvedAt?: string;
  durationSec?: number;
  maxDistance: number;
  status: string;
  createdAt: string;
}

export interface GeofenceBreachEvent {
  workerId: number;
  workerName?: string;
  breachLogId: number;
  totalBreaches: number;
  totalDurationOutsideSec: number;
  breachedAt: string;
  distance: number;
}

export interface GeofenceRestoredEvent {
  workerId: number;
  breachLogId: number;
  totalBreaches: number;
  durationSec: number;
  totalDurationOutsideSec: number;
  resolvedAt: string;
}

export interface WorkerInitialSnapshot {
  workerId: number;
  lat: number;
  lng: number;
  timestamp?: string | Date;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private socket!: Socket;
  private locationSubject = new Subject<LocationUpdate>();
  private geofenceSubject = new Subject<GeofenceConfig>();
  private breachLogSubject = new Subject<BreachLog[]>();
  private workersInitialSubject = new Subject<WorkerInitialSnapshot[]>();
  private workerOfflineSubject = new Subject<number>();
  private geofenceBreachSubject = new Subject<GeofenceBreachEvent>();
  private geofenceRestoredSubject = new Subject<GeofenceRestoredEvent>();
  private watchId: number | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private currentWorkerId: number | null = null;
  private lastPosition: { lat: number; lng: number } | null = null;
  private adminMapSubscribed = false;
  private readonly API_URL = `${environment.apiUrl}/api/geofence`;
  private readonly BREACH_LOGS_API = `${environment.apiUrl}/api/breach-logs`;
  private readonly HEARTBEAT_API = `${environment.apiUrl}/api/location/heartbeat`;
  private readonly SOCKET_URL = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.initSocket();
  }

  /** Reconnect the socket using the latest JWT from AuthService (login / role switch). */
  refreshSocketConnection(): void {
    this.initSocket();
    if (this.adminMapSubscribed) {
      this.requestInitialWorkers();
    }
  }

  /** Tear down socket connection on logout. */
  disconnectSocket(): void {
    this.stopTracking();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
    }
  }

  private initSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
    }

    const token = this.authService.getToken();
    this.socket = io(this.SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: { token }
    });

    this.bindSocketListeners();
  }

  private bindSocketListeners(): void {
    this.socket.on('connect', () => this.onSocketConnected());

    this.socket.io.on('reconnect', () => {
      if (this.adminMapSubscribed) {
        this.socket.emit('map:subscribe');
      }
    });

    this.socket.on('location:updated', (data: LocationUpdate) => {
      this.locationSubject.next(data);
    });

    this.socket.on('geofence:updated', (config: GeofenceConfig) => {
      this.geofenceSubject.next(config);
    });

    this.socket.on('workers:initial', (arr: WorkerInitialSnapshot[]) => {
      this.workersInitialSubject.next(arr);
    });

    this.socket.on('breach-logs:updated', (logs: BreachLog[]) => {
      this.breachLogSubject.next(logs);
    });

    this.socket.on('worker:offline', (data: { workerId: number }) => {
      if (data?.workerId != null) {
        this.workerOfflineSubject.next(data.workerId);
      }
    });

    this.socket.on('geofence:breach', (data: GeofenceBreachEvent) => {
      this.geofenceBreachSubject.next(data);
    });

    this.socket.on('geofence:restored', (data: GeofenceRestoredEvent) => {
      this.geofenceRestoredSubject.next(data);
    });
  }

  private onSocketConnected(): void {
    if (this.currentWorkerId && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const payload: LocationUpdate = {
            workerId: this.currentWorkerId!,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().toISOString()
          };
          this.lastPosition = { lat: payload.lat, lng: payload.lng };
          this.socket.emit('location:update', payload);
        },
        (err) => console.error('geolocation error on connect:', err),
        { enableHighAccuracy: true }
      );
    }

    if (this.adminMapSubscribed) {
      this.socket.emit('map:subscribe');
    }
  }

  getInitialWorkers(): Observable<WorkerInitialSnapshot[]> {
    return this.workersInitialSubject.asObservable();
  }

  getWorkerOfflineEvents(): Observable<number> {
    return this.workerOfflineSubject.asObservable();
  }

  getGeofenceBreachEvents(): Observable<GeofenceBreachEvent> {
    return this.geofenceBreachSubject.asObservable();
  }

  getGeofenceRestoredEvents(): Observable<GeofenceRestoredEvent> {
    return this.geofenceRestoredSubject.asObservable();
  }

  enableAdminMapSubscription(): void {
    this.adminMapSubscribed = true;
    this.requestInitialWorkers();
  }

  disableAdminMapSubscription(): void {
    this.adminMapSubscribed = false;
  }

  requestInitialWorkers(): void {
    if (this.socket?.connected) {
      this.socket.emit('map:subscribe');
    } else {
      this.socket.once('connect', () => this.socket.emit('map:subscribe'));
    }
  }

  getLocationUpdates(): Observable<LocationUpdate> {
    return this.locationSubject.asObservable();
  }

  getGeofenceUpdates(): Observable<GeofenceConfig> {
    return this.geofenceSubject.asObservable();
  }

  getBreachLogUpdates(): Observable<BreachLog[]> {
    return this.breachLogSubject.asObservable();
  }

  fetchBreachLogs(): Observable<BreachLog[]> {
    return this.http.get<BreachLog[]>(this.BREACH_LOGS_API);
  }

  fetchGeofenceConfig(): Observable<GeofenceConfig> {
    return this.http.get<GeofenceConfig>(this.API_URL);
  }

  startTracking(workerId: number): void {
    if (!('geolocation' in navigator)) {
      console.error('Geolocation is not supported by this browser.');
      return;
    }

    if (this.watchId !== null) return;

    this.refreshSocketConnection();
    this.currentWorkerId = workerId;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const payload: LocationUpdate = {
          workerId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date().toISOString()
        };

        this.lastPosition = { lat: payload.lat, lng: payload.lng };
        this.socket.emit('location:update', payload);
      },
      (error) => console.error('Geolocation error:', error.message),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );

    this.startHeartbeat();
  }

  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.stopHeartbeat();
    this.currentWorkerId = null;
    this.lastPosition = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat(): void {
    if (!this.currentWorkerId || !this.lastPosition) {
      return;
    }

    this.http.post(this.HEARTBEAT_API, {
      workerId: this.currentWorkerId,
      lat: this.lastPosition.lat,
      lng: this.lastPosition.lng,
      latitude: this.lastPosition.lat,
      longitude: this.lastPosition.lng,
      timestamp: new Date().toISOString()
    }).subscribe({
      error: (err) => console.warn('Location heartbeat failed:', err)
    });
  }
}
