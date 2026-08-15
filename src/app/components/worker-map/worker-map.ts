import { Component, OnInit, OnDestroy, ElementRef, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { LocationService, LocationUpdate, GeofenceConfig } from '../../services/location.service';
import { environment } from '../../../environments/environment';

type SignalState = 'active' | 'weak' | 'offline';

@Component({
  selector: 'app-worker-map',
  standalone: false,
  templateUrl: './worker-map.html',
  styleUrls: ['./worker-map.css'],
})
export class WorkerMap implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  private map!: L.Map;
  private workerMarkers = new Map<number, L.Marker>();
  private locationSub!: Subscription;
  private geofenceSub!: Subscription;
  private initialWorkersSub!: Subscription;
  private workerOfflineSub!: Subscription;
  private stalenessTimer: ReturnType<typeof setInterval> | null = null;
  isLive = false;
  private lastWorkerId: number | null = null;
  private lastLatLng: L.LatLng | null = null;
  private centerMarker!: L.Marker;
  private boundaryCircle!: L.Circle;
  private workerStates = new Map<number, { distance: number; isBreached: boolean }>();
  private workerNames = new Map<number, string>();
  private workerLastUpdate = new Map<number, Date>();
  private workerSignalState = new Map<number, SignalState>();
  private workerOffline = new Set<number>();
  geofenceConfig: GeofenceConfig = {
    siteLat: 48.208492,
    siteLng: 16.373118,
    radiusMeters: 250,
    gracePeriodSeconds: 30
  };
  statusMessage = 'Loading site boundary...';
  saveInProgress = false;
  saveMessage: string | null = null;
  private readonly GEOFENCE_API = `${environment.apiUrl}/api/geofence`;
  private readonly WORKERS_API = `${environment.apiUrl}/api/workers`;

  constructor(
    private locationService: LocationService,
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.locationService.refreshSocketConnection();
    this.initMap();
    this.loadWorkerNames();
    this.loadGeofenceConfig();
    this.subscribeToGeofenceUpdates();
    this.subscribeToLocations();
    this.subscribeToWorkerOffline();

    this.initialWorkersSub = this.locationService.getInitialWorkers().subscribe((arr) => {
      if (Array.isArray(arr)) {
        arr.forEach((w) => {
          if (w && w.workerId) {
            this.workerOffline.delete(w.workerId);
            this.updateMarker(w.workerId, w.lat, w.lng, w.timestamp);
          }
        });
        this.recheckWorkerMarkersAgainstBoundary();
      }
    });

    this.locationService.enableAdminMapSubscription();
    this.stalenessTimer = setInterval(() => this.refreshMarkerStaleness(), 10_000);
  }

  private initMap(): void {
    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
    L.Marker.prototype.options.icon = defaultIcon;

    const siteIcon = L.divIcon({
      html: '<div style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;font-size:22px;text-shadow:0 2px 4px rgba(0,0,0,0.25);">🚩</div>',
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -12]
    });

    this.map = L.map(this.mapContainer.nativeElement).setView([this.geofenceConfig.siteLat, this.geofenceConfig.siteLng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.centerMarker = L.marker([this.geofenceConfig.siteLat, this.geofenceConfig.siteLng], {
      icon: siteIcon,
      draggable: true,
      title: 'Site boundary center'
    }).addTo(this.map).bindPopup('Drag to reposition site center');

    this.boundaryCircle = L.circle([this.geofenceConfig.siteLat, this.geofenceConfig.siteLng], {
      radius: this.geofenceConfig.radiusMeters,
      color: '#e74c3c',
      fillColor: '#e74c3c',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6 4'
    }).addTo(this.map).bindPopup('Geofence boundary');

    this.centerMarker.on('dragend', () => {
      const newCenter = this.centerMarker.getLatLng();
      this.geofenceConfig.siteLat = newCenter.lat;
      this.geofenceConfig.siteLng = newCenter.lng;
      this.updateGeofenceOverlay();
    });
  }

  private loadWorkerNames(): void {
    this.http.get<any[]>(this.WORKERS_API).subscribe({
      next: (workers) => {
        this.workerNames.clear();
        workers.forEach((worker) => {
          if (worker?.user?.name && worker?.id) {
            this.workerNames.set(worker.id, worker.user.name);
          }
        });
      },
      error: (err) => console.warn('Unable to load worker names for map labels:', err)
    });
  }

  private loadGeofenceConfig(): void {
    this.http.get<GeofenceConfig>(this.GEOFENCE_API).subscribe({
      next: (config) => {
        this.geofenceConfig = config;
        this.statusMessage = 'Site geofence loaded.';
        this.updateGeofenceOverlay();
      },
      error: (err) => {
        console.error('Failed to load geofence config:', err);
        this.statusMessage = 'Unable to load site boundary; using defaults.';
      }
    });
  }

  private subscribeToGeofenceUpdates(): void {
    this.geofenceSub = this.locationService.getGeofenceUpdates().subscribe((config: GeofenceConfig) => {
      this.geofenceConfig = config;
      this.statusMessage = 'Geofence updated.';
      this.updateGeofenceOverlay();
    });
  }

  private subscribeToWorkerOffline(): void {
    this.workerOfflineSub = this.locationService.getWorkerOfflineEvents().subscribe((workerId) => {
      this.ngZone.run(() => {
        this.workerOffline.add(workerId);
        this.applyMarkerPresentation(workerId);
        this.updateSiteStatusMessage();
        this.cdr.detectChanges();
      });
    });
  }

  private updateGeofenceOverlay(): void {
    if (!this.map) return;
    const numericSiteLat = parseFloat(String(this.geofenceConfig.siteLat));
    const numericSiteLng = parseFloat(String(this.geofenceConfig.siteLng));
    const numericRadius = parseInt(String(this.geofenceConfig.radiusMeters), 10);
    const normalizedCenter = L.latLng(numericSiteLat, numericSiteLng);

    this.centerMarker.setLatLng(normalizedCenter);
    this.boundaryCircle.setLatLng(normalizedCenter).setRadius(numericRadius);
    this.map.invalidateSize();
    this.map.panTo(normalizedCenter, { animate: true });
    this.recheckWorkerMarkersAgainstBoundary();
  }

  private calculateDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadiusMeters = 6371000;
    const deltaLatRadians = (lat2 - lat1) * (Math.PI / 180);
    const deltaLonRadians = (lon2 - lon1) * (Math.PI / 180);
    const lat1Radians = lat1 * (Math.PI / 180);
    const lat2Radians = lat2 * (Math.PI / 180);

    const a =
      Math.sin(deltaLatRadians / 2) * Math.sin(deltaLatRadians / 2) +
      Math.cos(lat1Radians) * Math.cos(lat2Radians) * Math.sin(deltaLonRadians / 2) * Math.sin(deltaLonRadians / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
  }

  private getSignalState(workerId: number): SignalState {
    if (this.workerOffline.has(workerId)) {
      return 'offline';
    }

    const lastUpdate = this.workerLastUpdate.get(workerId);
    if (!lastUpdate) {
      return 'offline';
    }

    const ageMs = Date.now() - lastUpdate.getTime();
    if (ageMs < 30_000) return 'active';
    if (ageMs <= 60_000) return 'weak';
    return 'offline';
  }

  private buildWorkerIcon(state: SignalState): L.DivIcon {
    const styles: Record<SignalState, { bg: string; border: string; emoji: string }> = {
      active: { bg: '#22c55e', border: '#15803d', emoji: '👷' },
      weak: { bg: '#f59e0b', border: '#b45309', emoji: '👷' },
      offline: { bg: '#9ca3af', border: '#6b7280', emoji: '👷' }
    };
    const style = styles[state];

    return L.divIcon({
      html: `<div style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:${style.bg};border:2px solid ${style.border};color:white;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.25);opacity:${state === 'offline' ? '0.75' : '1'};">${style.emoji}</div>`,
      className: '',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -12]
    });
  }

  private getSignalLabel(state: SignalState): string {
    switch (state) {
      case 'active':
        return 'Live';
      case 'weak':
        return 'Weak Signal';
      case 'offline':
        return 'Signal Lost / Offline';
    }
  }

  private buildPopupContent(
    workerId: number,
    distance: number,
    isBreached: boolean,
    timeStr: string,
    signalState: SignalState
  ): string {
    const workerName = this.workerNames.get(workerId) || `Worker ${workerId}`;
    const boundaryStatus = isBreached ? 'Out of bounds' : 'In bounds';
    const signalLabel = this.getSignalLabel(signalState);

    return `<b>${workerName}</b><br>Status: ${boundaryStatus}<br>Signal: ${signalLabel}<br>Distance: ${Math.round(distance)} m<br>Updated: ${timeStr}`;
  }

  private applyMarkerPresentation(workerId: number): void {
    const marker = this.workerMarkers.get(workerId);
    if (!marker) return;

    const state = this.getSignalState(workerId);
    this.workerSignalState.set(workerId, state);
    marker.setIcon(this.buildWorkerIcon(state));

    const markerLatLng = marker.getLatLng();
    const radius = parseInt(String(this.geofenceConfig.radiusMeters), 10);
    const siteLat = parseFloat(String(this.geofenceConfig.siteLat));
    const siteLng = parseFloat(String(this.geofenceConfig.siteLng));
    const distance = this.calculateDistanceInMeters(siteLat, siteLng, markerLatLng.lat, markerLatLng.lng);
    const isBreached = distance > radius;
    const lastUpdate = this.workerLastUpdate.get(workerId);
    const timeStr = lastUpdate ? lastUpdate.toLocaleTimeString() : 'Unknown';

    marker.getPopup()?.setContent(this.buildPopupContent(workerId, distance, isBreached, timeStr, state));
  }

  private refreshMarkerStaleness(): void {
    this.ngZone.run(() => {
      this.workerMarkers.forEach((_marker, workerId) => {
        const previous = this.workerSignalState.get(workerId);
        this.applyMarkerPresentation(workerId);
        const current = this.workerSignalState.get(workerId);
        if (previous !== current) {
          this.updateSiteStatusMessage();
        }
      });
      this.cdr.detectChanges();
    });
  }

  private recheckWorkerMarkersAgainstBoundary(): void {
    const radius = parseInt(String(this.geofenceConfig.radiusMeters), 10);
    const siteLat = parseFloat(String(this.geofenceConfig.siteLat));
    const siteLng = parseFloat(String(this.geofenceConfig.siteLng));

    this.workerMarkers.forEach((marker, workerId) => {
      const markerLatLng = marker.getLatLng();
      const distance = this.calculateDistanceInMeters(siteLat, siteLng, markerLatLng.lat, markerLatLng.lng);
      const isBreached = distance > radius;
      this.workerStates.set(workerId, { distance, isBreached });
      this.applyMarkerPresentation(workerId);
    });

    this.updateSiteStatusMessage();
  }

  private updateSiteStatusMessage(): void {
    const workerIds = Array.from(this.workerMarkers.keys());
    if (workerIds.length === 0) {
      this.statusMessage = 'Site boundary ready. No workers connected.';
      return;
    }

    const offlineCount = workerIds.filter((id) => this.getSignalState(id) === 'offline').length;
    const weakCount = workerIds.filter((id) => this.getSignalState(id) === 'weak').length;
    const anyBreached = Array.from(this.workerStates.values()).some((state) => state.isBreached);

    if (offlineCount > 0) {
      this.statusMessage = `⚠️ ${offlineCount} worker(s) offline or signal lost.`;
    } else if (weakCount > 0) {
      this.statusMessage = `⚠️ ${weakCount} worker(s) on weak signal.`;
    } else if (anyBreached) {
      this.statusMessage = '⚠️ Alert: Worker(s) outside boundary!';
    } else {
      this.statusMessage = '✅ All workers are within the construction site boundary';
    }
  }

  private subscribeToLocations(): void {
    this.locationSub = this.locationService.getLocationUpdates().subscribe(
      (data: LocationUpdate) => {
        this.ngZone.run(() => {
          this.isLive = true;

          const lat = data.latitude ?? data.lat;
          const lng = data.longitude ?? data.lng;

          if (lat !== undefined && lng !== undefined) {
            this.workerOffline.delete(data.workerId);
            this.updateMarker(data.workerId, lat, lng, data.timestamp);
          }
        });
      }
    );
  }

  private updateMarker(workerId: number, lat: number, lng: number, timestamp?: string | Date): void {
    const latLng = L.latLng(lat, lng);
    const dateObj = timestamp ? new Date(timestamp) : new Date();
    this.workerLastUpdate.set(workerId, dateObj);

    const radius = parseInt(String(this.geofenceConfig.radiusMeters), 10);
    const siteLat = parseFloat(String(this.geofenceConfig.siteLat));
    const siteLng = parseFloat(String(this.geofenceConfig.siteLng));
    const distance = this.calculateDistanceInMeters(siteLat, siteLng, lat, lng);
    const isBreached = distance > radius;
    const signalState = this.getSignalState(workerId);
    const timeStr = dateObj.toLocaleTimeString();
    const popupContent = this.buildPopupContent(workerId, distance, isBreached, timeStr, signalState);

    this.lastWorkerId = workerId;
    this.lastLatLng = latLng;
    this.workerStates.set(workerId, { distance, isBreached });
    this.updateSiteStatusMessage();

    this.map.invalidateSize();

    const prevState = this.workerStates.get(workerId);
    const wasBreached = prevState ? prevState.isBreached : false;
    if (!wasBreached && isBreached) {
      try {
        this.map.flyTo(latLng, 16, { animate: true, duration: 1.0 });
      } catch (e) {
        // ignore map errors
      }
    }

    if (this.workerMarkers.has(workerId)) {
      const marker = this.workerMarkers.get(workerId)!;
      marker.setLatLng(latLng);
      marker.setIcon(this.buildWorkerIcon(signalState));
      marker.getPopup()?.setContent(popupContent);
    } else {
      const marker = L.marker(latLng, { icon: this.buildWorkerIcon(signalState) })
        .addTo(this.map)
        .bindPopup(popupContent);
      marker.openPopup();
      this.workerMarkers.set(workerId, marker);
    }

    this.workerSignalState.set(workerId, signalState);
    this.workerStates.set(workerId, { distance, isBreached });
  }

  saveGeofence(): void {
    this.saveInProgress = true;
    this.saveMessage = null;

    const payload = {
      siteLat: parseFloat(String(this.geofenceConfig.siteLat)),
      siteLng: parseFloat(String(this.geofenceConfig.siteLng)),
      radiusMeters: parseInt(String(this.geofenceConfig.radiusMeters), 10),
      gracePeriodSeconds: parseInt(String(this.geofenceConfig.gracePeriodSeconds), 10)
    };

    this.http.put<GeofenceConfig>(this.GEOFENCE_API, payload).subscribe({
      next: (config) => {
        this.ngZone.run(() => {
          this.saveInProgress = false;
          this.saveMessage = 'Site geofence saved successfully.';
          this.geofenceConfig = {
            ...config,
            siteLat: parseFloat(String(config.siteLat)),
            siteLng: parseFloat(String(config.siteLng)),
            radiusMeters: parseInt(String(config.radiusMeters), 10),
            gracePeriodSeconds: parseInt(String(config.gracePeriodSeconds), 10)
          };
          this.updateGeofenceOverlay();
          this.recheckWorkerMarkersAgainstBoundary();
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to save geofence:', err);
        this.ngZone.run(() => {
          this.saveInProgress = false;
          this.saveMessage = 'Unable to save geofence. Please try again.';
        });
        this.cdr.detectChanges();
      }
    });
  }

  locateBoundary(): void {
    const center = L.latLng(this.geofenceConfig.siteLat, this.geofenceConfig.siteLng);
    this.map.invalidateSize();
    this.map.flyTo(center, 16, { animate: true, duration: 1.2 });
  }

  focusLastWorker(): void {
    if (!this.lastLatLng) return;
    this.map.invalidateSize();
    this.map.panTo(this.lastLatLng, { animate: true });

    if (this.lastWorkerId && this.workerMarkers.has(this.lastWorkerId)) {
      const m = this.workerMarkers.get(this.lastWorkerId)!;
      m.openPopup();
    }
  }

  ngOnDestroy(): void {
    this.locationService.disableAdminMapSubscription();
    if (this.locationSub) {
      this.locationSub.unsubscribe();
    }
    if (this.geofenceSub) {
      this.geofenceSub.unsubscribe();
    }
    if (this.initialWorkersSub) {
      this.initialWorkersSub.unsubscribe();
    }
    if (this.workerOfflineSub) {
      this.workerOfflineSub.unsubscribe();
    }
    if (this.stalenessTimer !== null) {
      clearInterval(this.stalenessTimer);
    }
  }
}
