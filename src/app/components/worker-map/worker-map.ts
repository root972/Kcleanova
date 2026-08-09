import { Component, OnInit, OnDestroy, ElementRef, ViewChild, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { LocationService, LocationUpdate, GeofenceConfig } from '../../services/location.service';

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
  isLive = false;
  private lastWorkerId: number | null = null;
  private lastLatLng: L.LatLng | null = null;
  private centerMarker!: L.Marker;
  private boundaryCircle!: L.Circle;
  geofenceConfig: GeofenceConfig = {
    siteLat: 48.208492,
    siteLng: 16.373118,
    radiusMeters: 250,
    gracePeriodSeconds: 30
  };
  statusMessage = 'Loading site boundary...';
  saveInProgress = false;
  saveMessage: string | null = null;
  private readonly GEOFENCE_API = 'http://localhost:3000/api/geofence';

  constructor(
    private locationService: LocationService,
    private http: HttpClient,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.initMap();
    this.loadGeofenceConfig();
    this.subscribeToGeofenceUpdates();
    this.subscribeToLocations();
  }

  private initMap(): void {
    // 1. Fix missing default Leaflet marker assets in Angular builds
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

    // 2. Initialize map instance
    this.map = L.map(this.mapContainer.nativeElement).setView([this.geofenceConfig.siteLat, this.geofenceConfig.siteLng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // 3. Initialize site center and radius overlays
    this.centerMarker = L.marker([this.geofenceConfig.siteLat, this.geofenceConfig.siteLng], {
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

  private updateGeofenceOverlay(): void {
    if (!this.map) return;
    const center = L.latLng(this.geofenceConfig.siteLat, this.geofenceConfig.siteLng);
    this.centerMarker.setLatLng(center);
    this.boundaryCircle.setLatLng(center).setRadius(this.geofenceConfig.radiusMeters);
    this.map.invalidateSize();
    this.map.setView(center, this.map.getZoom(), { animate: true });
  }

  private subscribeToLocations(): void {
    this.locationSub = this.locationService.getLocationUpdates().subscribe(
      (data: LocationUpdate) => {
        // Run within NgZone to guarantee template re-rendering upon web socket receipt
        this.ngZone.run(() => {
          this.isLive = true;

          const lat = data.latitude ?? data.lat;
          const lng = data.longitude ?? data.lng;

          if (lat !== undefined && lng !== undefined) {
            this.updateMarker(data.workerId, lat, lng, data.timestamp);
          }
        });
      }
    );
  }

  private updateMarker(workerId: number, lat: number, lng: number, timestamp?: string | Date): void {
    const latLng = L.latLng(lat, lng);
    const dateObj = timestamp ? new Date(timestamp) : new Date();
    const timeStr = dateObj.toLocaleTimeString();
    const popupContent = `<b>Worker #${workerId}</b><br>Updated: ${timeStr}`;

    // Remember last worker/location so the admin can re-focus with a button
    this.lastWorkerId = workerId;
    this.lastLatLng = latLng;

    // Recalculate container dimensions and center map on active worker coordinates
    this.map.invalidateSize();
    this.map.setView(latLng, 16, { animate: true });

    if (this.workerMarkers.has(workerId)) {
      const marker = this.workerMarkers.get(workerId)!;
      marker.setLatLng(latLng);
      marker.getPopup()?.setContent(popupContent);
    } else {
      const marker = L.marker(latLng).addTo(this.map).bindPopup(popupContent);
      // Open popup when the worker first checks in
      marker.openPopup();
      this.workerMarkers.set(workerId, marker);
    }
  }

  saveGeofence(): void {
    this.saveInProgress = true;
    this.saveMessage = null;

    this.http.put<GeofenceConfig>(this.GEOFENCE_API, {
      siteLat: this.geofenceConfig.siteLat,
      siteLng: this.geofenceConfig.siteLng,
      radiusMeters: this.geofenceConfig.radiusMeters,
      gracePeriodSeconds: this.geofenceConfig.gracePeriodSeconds
    }).subscribe({
      next: (config) => {
        this.saveInProgress = false;
        this.saveMessage = 'Site geofence saved successfully.';
        this.geofenceConfig = config;
        this.updateGeofenceOverlay();
      },
      error: (err) => {
        console.error('Failed to save geofence:', err);
        this.saveInProgress = false;
        this.saveMessage = 'Unable to save geofence. Please try again.';
      }
    });
  }

  // Public helper used by the UI to re-center on the last-seen worker
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
    if (this.locationSub) {
      this.locationSub.unsubscribe();
    }
    if (this.geofenceSub) {
      this.geofenceSub.unsubscribe();
    }
  }
}